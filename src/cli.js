#!/usr/bin/env node

// Git Bash (MSYS2) path conversion fix
// MSYS converts /path args to C:/Program Files/Git/path before Node sees them.
// Set MSYS_NO_PATHCONV=1 for any child processes this CLI spawns.
process.env.MSYS_NO_PATHCONV = '1';

// Restore already-converted paths in current process argv
function fixMsysArgs(argv) {
  if (!process.env.MSYSTEM) return argv; // not Git Bash

  // Determine the Git Bash install prefix (e.g. "C:/Program Files/Git")
  const exepath = process.env.EXEPATH || '';
  const prefixes = [];
  if (exepath) {
    prefixes.push(exepath.replace(/\\/g, '/').replace(/\/+$/, '') + '/');
  }
  prefixes.push('C:/Program Files/Git/');

  return argv.map(arg => {
    for (const prefix of prefixes) {
      if (arg.startsWith(prefix)) {
        return '/' + arg.slice(prefix.length);
      }
      // Handle backslash variant
      const bsPrefix = prefix.replace(/\//g, '\\');
      if (arg.startsWith(bsPrefix)) {
        return '/' + arg.slice(bsPrefix.length).replace(/\\/g, '/');
      }
    }
    return arg;
  });
}

process.argv = fixMsysArgs(process.argv);

const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');

const LIST_CACHE_FILE = path.join(os.tmpdir(), 'c4-list-cache.json');
const LIST_COOLDOWN_MS = 10000;

const BASE = process.env.C4_URL || 'http://127.0.0.1:3456';

function request(method, path, body = null, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' },
      timeout
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ raw: data }); }
      });
    });

    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.on('error', (err) => reject(new Error(`Daemon not running? ${err.message}`)));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);

  try {
    let result;

    switch (cmd) {
      case 'new': {
        const name = args[0];
        // Parse --target, --cwd, --template flags
        let target = 'local', cwd = '', template = '';
        const filteredArgs = [];
        let command = 'claude';
        let commandSet = false;
        for (let i = 1; i < args.length; i++) {
          if (args[i] === '--target' && args[i + 1]) { target = args[++i]; }
          else if (args[i] === '--cwd' && args[i + 1]) { cwd = args[++i]; }
          else if (args[i] === '--template' && args[i + 1]) { template = args[++i]; }
          else if (!commandSet) { command = args[i]; commandSet = true; }
          else { filteredArgs.push(args[i]); }
        }
        const body = { name, command, args: filteredArgs, target, cwd };
        if (template) body.template = template;
        result = await request('POST', '/create', body);
        break;
      }

      case 'send': {
        const name = args[0];
        const input = args.slice(1).join(' ');
        result = await request('POST', '/send', { name, input });
        break;
      }

      case 'task': {
        // Check for --auto-name flag (5.40): auto-generate worker name from task text
        const autoName = args.includes('--auto-name');
        const effectiveArgs = args.filter(a => a !== '--auto-name');

        let name, argStart;
        if (autoName) {
          name = '';  // server will auto-generate from task text
          argStart = 0;
        } else {
          name = effectiveArgs[0] || '';
          argStart = 1;
        }

        let branch = '', useBranch = true, scope = null, scopePreset = '', after = '', contextFrom = '', reuse = undefined, profile = '', autoMode = false, projectRoot = '', cwd = '';
        const taskParts = [];
        for (let i = argStart; i < effectiveArgs.length; i++) {
          if (effectiveArgs[i] === '--branch' && effectiveArgs[i + 1]) { branch = effectiveArgs[++i]; }
          else if (effectiveArgs[i] === '--no-branch') { useBranch = false; }
          else if (effectiveArgs[i] === '--after' && effectiveArgs[i + 1]) { after = effectiveArgs[++i]; }
          else if (effectiveArgs[i] === '--context' && effectiveArgs[i + 1]) { contextFrom = effectiveArgs[++i]; }
          else if (effectiveArgs[i] === '--reuse') { reuse = true; }
          else if (effectiveArgs[i] === '--no-reuse') { reuse = false; }
          else if (effectiveArgs[i] === '--profile' && effectiveArgs[i + 1]) { profile = effectiveArgs[++i]; }
          else if (effectiveArgs[i] === '--template' && effectiveArgs[i + 1]) { profile = effectiveArgs[++i]; }
          else if (effectiveArgs[i] === '--auto-mode') { autoMode = true; }
          else if (effectiveArgs[i] === '--repo' && effectiveArgs[i + 1]) { projectRoot = effectiveArgs[++i]; }
          else if (effectiveArgs[i] === '--cwd' && effectiveArgs[i + 1]) { cwd = effectiveArgs[++i]; }
          else if (effectiveArgs[i] === '--scope' && effectiveArgs[i + 1]) {
            try { scope = JSON.parse(effectiveArgs[++i]); }
            catch { console.error('Error: --scope must be valid JSON'); process.exit(1); }
          }
          else if (effectiveArgs[i] === '--scope-preset' && effectiveArgs[i + 1]) { scopePreset = effectiveArgs[++i]; }
          else { taskParts.push(effectiveArgs[i]); }
        }
        const task = taskParts.join(' ');
        const body = { name, task, branch, useBranch };
        if (scope) body.scope = scope;
        if (scopePreset) body.scopePreset = scopePreset;
        if (after) body.after = after;
        if (contextFrom) body.contextFrom = contextFrom;
        if (reuse !== undefined) body.reuse = reuse;
        if (profile) body.profile = profile;
        if (autoMode) body.autoMode = true;
        if (projectRoot) body.projectRoot = projectRoot;
        if (cwd) body.cwd = cwd;
        result = await request('POST', '/task', body);
        break;
      }

      case 'key': {
        const name = args[0];
        const input = args[1];
        result = await request('POST', '/send', { name, input, keys: true });
        break;
      }

      case 'read': {
        // Read new snapshots (only idle/finished states)
        const name = args[0];
        result = await request('GET', `/read?name=${name}`);
        if (result.content !== undefined) {
          if (result.content) {
            process.stdout.write(result.content + '\n');
          }
          process.stderr.write(`--- status=${result.status} snapshots=${result.snapshotsRead || 0} ---\n`);
          return;
        }
        break;
      }

      case 'read-now': {
        // Read current screen immediately (even if busy)
        const name = args[0];
        result = await request('GET', `/read-now?name=${name}`);
        if (result.content !== undefined) {
          process.stdout.write(result.content + '\n');
          process.stderr.write(`--- status=${result.status} ---\n`);
          return;
        }
        break;
      }

      case 'wait': {
        // Wait until idle, then read
        // Supports: c4 wait <name>, c4 wait w1 w2 w3, c4 wait --all
        let waitTimeout = '120000';
        let waitAll = false;
        let interruptOnIntervention = false;
        const waitNames = [];
        for (let i = 0; i < args.length; i++) {
          if (args[i] === '--timeout' && args[i + 1]) { waitTimeout = args[++i]; }
          else if (args[i] === '--all') { waitAll = true; }
          else if (args[i] === '--interrupt-on-intervention') { interruptOnIntervention = true; }
          else if (/^\d+$/.test(args[i]) && waitNames.length > 0) { waitTimeout = args[i]; }
          else if (!args[i].startsWith('-')) { waitNames.push(args[i]); }
        }

        const ioiParam = interruptOnIntervention ? '&interruptOnIntervention=1' : '';
        const timeoutNum = parseInt(waitTimeout);

        if (waitAll || waitNames.length > 1) {
          // Multi-worker wait
          const names = waitAll ? '*' : waitNames.join(',');
          process.stderr.write(`Waiting for ${waitAll ? 'all workers' : waitNames.join(', ')}...\n`);
          result = await request('GET', `/wait-read-multi?names=${names}&timeout=${waitTimeout}${ioiParam}`, null, timeoutNum + 5000);
          if (result.status === 'timeout') {
            process.stderr.write('--- status=timeout ---\n');
            if (result.results) {
              for (const r of result.results) {
                process.stderr.write(`  ${r.name}: ${r.status}${r.intervention ? ` (intervention: ${r.intervention})` : ''}\n`);
              }
            }
            return;
          }
          if (result.name) {
            if (result.content) process.stdout.write(result.content + '\n');
            process.stderr.write(`--- name=${result.name} status=${result.status}${result.intervention ? ` intervention=${result.intervention}` : ''} ---\n`);
            return;
          }
        } else {
          // Single-worker wait
          const name = waitNames[0] || '';
          process.stderr.write('Waiting for worker to become idle...\n');
          result = await request('GET', `/wait-read?name=${name}&timeout=${waitTimeout}${ioiParam}`, null, timeoutNum + 5000);
          if (result.content !== undefined) {
            process.stdout.write(result.content + '\n');
            process.stderr.write(`--- status=${result.status}${result.intervention ? ` intervention=${result.intervention}` : ''} ---\n`);
            return;
          }
        }
        break;
      }

      case 'scrollback': {
        const name = args[0];
        let lines = 200;
        for (let i = 1; i < args.length; i++) {
          if (args[i] === '--lines' && args[i + 1]) { lines = parseInt(args[++i]) || 200; }
        }
        if (!name) { console.error('Usage: c4 scrollback <name> [--lines N]'); process.exit(1); }
        result = await request('GET', `/scrollback?name=${name}&lines=${lines}`);
        if (result.content !== undefined) {
          if (result.content) {
            process.stdout.write(result.content + '\n');
          }
          process.stderr.write(`--- scrollback: ${result.lines} lines (${result.totalScrollback} total) ---\n`);
          return;
        }
        break;
      }

      case 'list': {
        // Cooldown: return cached response if called within 10 seconds
        let cached = null;
        try {
          const raw = fs.readFileSync(LIST_CACHE_FILE, 'utf8');
          const parsed = JSON.parse(raw);
          if (Date.now() - parsed.timestamp < LIST_COOLDOWN_MS) {
            cached = parsed.result;
          }
        } catch {}

        if (cached) {
          result = cached;
          process.stderr.write('[cached]\n');
        } else {
          result = await request('GET', '/list');
          try {
            fs.writeFileSync(LIST_CACHE_FILE, JSON.stringify({ timestamp: Date.now(), result }));
          } catch {}
        }

        if (result.workers) {
          if (result.workers.length === 0) {
            console.log('No workers running.');
          } else {
            console.log('NAME\t\tSTATUS\t\tUNREAD\tINTERVENTION\tCOMMAND');
            for (const w of result.workers) {
              const intervention = w.intervention || '-';
              console.log(`${w.name}\t\t${w.status}\t\t${w.unreadSnapshots}\t${intervention}\t\t${w.command}`);
            }
          }
          if (result.queuedTasks && result.queuedTasks.length > 0) {
            console.log('\nQUEUED:');
            console.log('  NAME\t\tBRANCH\t\t\tAFTER\t\tQUEUED AT');
            for (const q of result.queuedTasks) {
              const after = q.after || '-';
              const time = new Date(q.queuedAt).toLocaleTimeString();
              console.log(`  ${q.name}\t\t${q.branch || '-'}\t\t${after}\t\t${time}`);
            }
          }
          if (result.lostWorkers && result.lostWorkers.length > 0) {
            console.log('\nLOST (daemon restart):');
            for (const lw of result.lostWorkers) {
              console.log(`  ${lw.name}\t\tpid=${lw.pid || '?'}\tbranch=${lw.branch || '-'}\tlost=${lw.lostAt}`);
            }
          }
          if (result.lastHealthCheck) {
            const ago = Math.round((Date.now() - result.lastHealthCheck) / 1000);
            console.log(`\nLast health check: ${ago}s ago (${new Date(result.lastHealthCheck).toLocaleTimeString()})`);
          }
          return;
        }
        break;
      }

      case 'close': {
        const name = args[0];
        result = await request('POST', '/close', { name });
        break;
      }

      case 'health': {
        result = await request('GET', '/health');
        break;
      }

      case 'config': {
        if (args[0] === 'reload') {
          result = await request('POST', '/config/reload');
          console.log('Config reloaded.');
        } else {
          result = await request('GET', '/config');
        }
        break;
      }

      case 'init': {
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        const { execSync } = require('child_process');

        const home = os.homedir();
        const repoRoot = path.resolve(__dirname, '..');
        const isWin = process.platform === 'win32';

        // 1. Merge c4 permissions into ~/.claude/settings.json
        const claudeDir = path.join(home, '.claude');
        const settingsPath = path.join(claudeDir, 'settings.json');
        const requiredPermissions = [
          'Bash(c4:*)', 'Bash(MSYS_NO_PATHCONV=1 c4:*)',
          'Bash(cd:*)', 'Bash(git:*)', 'Bash(node:*)', 'Bash(npm:*)', 'Bash(npx:*)',
          'Bash(cat:*)', 'Bash(ls:*)', 'Bash(grep:*)', 'Bash(echo:*)', 'Bash(curl:*)',
          'Bash(find:*)', 'Bash(head:*)', 'Bash(tail:*)', 'Bash(wc:*)', 'Bash(pwd)',
          'Bash(mkdir:*)', 'Bash(cp:*)', 'Bash(mv:*)', 'Bash(touch:*)',
          'Bash(python:*)', 'Bash(sed:*)', 'Bash(awk:*)', 'Bash(sort:*)',
          'Bash(uniq:*)', 'Bash(tee:*)', 'Bash(diff:*)', 'Bash(test:*)', 'Bash(sleep:*)',
          'Read', 'Edit', 'Write', 'Glob', 'Grep', 'WebFetch', 'WebSearch',
        ];
        const denyPermissions = [
          'Bash(rm -rf:*)', 'Bash(sudo:*)', 'Bash(shutdown:*)',
          'Bash(reboot:*)', 'Bash(kill:*)', 'Bash(chmod:*)', 'Bash(chown:*)',
        ];

        let settings = {};
        try {
          settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        } catch {}

        if (!settings.permissions) settings.permissions = {};
        if (!Array.isArray(settings.permissions.allow)) settings.permissions.allow = [];

        let added = 0;
        for (const perm of requiredPermissions) {
          if (!settings.permissions.allow.includes(perm)) {
            settings.permissions.allow.push(perm);
            added++;
          }
        }

        if (!Array.isArray(settings.permissions.deny)) settings.permissions.deny = [];
        for (const perm of denyPermissions) {
          if (!settings.permissions.deny.includes(perm)) {
            settings.permissions.deny.push(perm);
          }
        }

        fs.mkdirSync(claudeDir, { recursive: true });
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
        console.log(`[ok] settings.json: ${added} permissions added (${settings.permissions.allow.length} allow, ${settings.permissions.deny.length} deny)`);

        // 2. Copy config.example.json -> config.json (skip if exists)
        const configSrc = path.join(repoRoot, 'config.example.json');
        const configDst = path.join(repoRoot, 'config.json');

        if (fs.existsSync(configDst)) {
          console.log('[ok] config.json: already exists (skipped)');
        } else if (fs.existsSync(configSrc)) {
          fs.copyFileSync(configSrc, configDst);
          console.log('[ok] config.json: created from config.example.json');
        } else {
          console.log('[warn] config.example.json not found');
        }

        // 3. Auto-detect claude binary path → save to config.json
        const isMac = process.platform === 'darwin';
        let claudePath = '';
        const detectCmds = isWin ? ['where claude'] : ['which claude', 'command -v claude'];

        for (const cmd of detectCmds) {
          try {
            const result = execSync(cmd, {
              encoding: 'utf8',
              stdio: ['pipe', 'pipe', 'pipe'],
              timeout: 5000
            }).trim();
            if (result) {
              claudePath = result.split(/\r?\n/)[0].trim();
              break;
            }
          } catch {}
        }

        // macOS/Linux: check common paths if not found
        if (!claudePath && !isWin) {
          const commonPaths = [];
          if (isMac) {
            commonPaths.push('/opt/homebrew/bin/claude');  // Apple Silicon
            commonPaths.push('/usr/local/bin/claude');     // Intel
          }
          commonPaths.push(path.join(home, '.local', 'bin', 'claude'));
          commonPaths.push(path.join(home, '.npm-global', 'bin', 'claude'));

          for (const p of commonPaths) {
            if (fs.existsSync(p)) {
              claudePath = p;
              break;
            }
          }
        }

        if (claudePath) {
          const normalizedPath = claudePath.replace(/\\/g, '/');
          try {
            const config = JSON.parse(fs.readFileSync(configDst, 'utf8'));
            if (!config.targets) config.targets = {};
            if (!config.targets.local) config.targets.local = { type: 'local' };
            if (!config.targets.local.commandMap) config.targets.local.commandMap = {};
            config.targets.local.commandMap.claude = normalizedPath;
            fs.writeFileSync(configDst, JSON.stringify(config, null, 2) + '\n');
            console.log(`[ok] claude path: ${normalizedPath} (saved to config.json)`);
          } catch (e) {
            console.log(`[ok] claude detected: ${normalizedPath}`);
            console.log(`[warn] could not update config.json: ${e.message}`);
          }
        } else {
          console.log('[warn] claude not found in PATH — set targets.local.commandMap.claude in config.json manually');
        }

        // 4. CLAUDE.md symlink: ~/CLAUDE.md -> repo/CLAUDE.md
        const claudeMdSrc = path.join(repoRoot, 'CLAUDE.md');
        const claudeMdDst = path.join(home, 'CLAUDE.md');

        if (!fs.existsSync(claudeMdSrc)) {
          console.log('[warn] CLAUDE.md not found in repo');
        } else {
          try {
            const stat = fs.lstatSync(claudeMdDst);
            if (stat.isSymbolicLink()) {
              const target = path.resolve(path.dirname(claudeMdDst), fs.readlinkSync(claudeMdDst));
              if (target === claudeMdSrc) {
                console.log('[ok] CLAUDE.md symlink: already linked');
              } else {
                fs.unlinkSync(claudeMdDst);
                fs.symlinkSync(claudeMdSrc, claudeMdDst);
                console.log('[ok] CLAUDE.md symlink: updated');
              }
            } else {
              console.log('[warn] ~/CLAUDE.md exists and is not a symlink (skipped)');
            }
          } catch (e) {
            if (e.code === 'ENOENT') {
              try {
                fs.symlinkSync(claudeMdSrc, claudeMdDst);
                console.log('[ok] CLAUDE.md symlink: created');
              } catch (symlinkErr) {
                if (symlinkErr.code === 'EPERM') {
                  console.log('[warn] CLAUDE.md symlink: permission denied (run as admin or enable Developer Mode on Windows)');
                } else {
                  console.log(`[warn] CLAUDE.md symlink: ${symlinkErr.message}`);
                }
              }
            } else {
              console.log(`[warn] CLAUDE.md: ${e.message}`);
            }
          }
        }

        // 5. Register c4 command (npm link → ~/.local/bin symlink → .bashrc alias)
        let c4InPath = false;
        try {
          const c4Which = execSync(isWin ? 'where c4' : 'which c4', {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: 5000
          }).trim();
          if (c4Which) c4InPath = true;
        } catch {}

        if (c4InPath) {
          console.log('[ok] c4 command: already in PATH');
        } else {
          let c4Registered = false;

          // 5a. Try npm link
          try {
            execSync('npm link', {
              cwd: repoRoot,
              stdio: 'pipe',
              timeout: 30000
            });
            c4Registered = true;
            console.log('[ok] npm link: c4 command registered globally');
          } catch {
            console.log('[info] npm link failed — creating wrapper scripts');

            // 5b. Create wrapper scripts in npm global bin directory
            try {
              const npmPrefix = execSync('npm config get prefix', {
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'pipe'],
                timeout: 10000
              }).trim();
              const npmBin = isWin ? npmPrefix : path.join(npmPrefix, 'bin');

              const c4Cli = path.join(repoRoot, 'src', 'cli.js').replace(/\\/g, '/');

              // Shell script (Git Bash, WSL, Linux, macOS)
              const shScript = `#!/bin/sh\nexec node "${c4Cli}" "$@"\n`;
              const shPath = path.join(npmBin, 'c4');
              fs.mkdirSync(npmBin, { recursive: true });
              fs.writeFileSync(shPath, shScript, { mode: 0o755 });
              console.log(`[ok] wrapper: ${shPath}`);

              // Windows .cmd file
              if (isWin) {
                const cmdScript = `@node "${c4Cli}" %*\r\n`;
                const cmdPath = path.join(npmBin, 'c4.cmd');
                fs.writeFileSync(cmdPath, cmdScript);
                console.log(`[ok] wrapper: ${cmdPath}`);
              }

              c4Registered = true;

              // Check if npm global bin is in PATH
              const sep = isWin ? ';' : ':';
              const pathDirs = (process.env.PATH || '').split(sep);
              const normalizedBin = npmBin.replace(/\\/g, '/').toLowerCase();
              const inPath = pathDirs.some(d => d.replace(/\\/g, '/').toLowerCase() === normalizedBin);
              if (!inPath) {
                if (isWin) {
                  console.log(`[info] Add to PATH: ${npmBin}`);
                } else {
                  console.log(`[info] Add to PATH: export PATH="${npmBin}:$PATH"`);
                }
              }
            } catch (e) {
              console.log(`[warn] wrapper creation failed: ${e.message}`);
            }

            // 5c. Final fallback: suggest alias
            if (!c4Registered) {
              const c4Cli = path.join(repoRoot, 'src', 'cli.js').replace(/\\/g, '/');
              console.log('[info] Add alias to ~/.bashrc:');
              console.log(`  echo 'alias c4="node ${c4Cli}"' >> ~/.bashrc`);
              console.log('  source ~/.bashrc');
            }
          }
        }

        // 4. Set git hooksPath to .githooks
        const { execSync: execSyncInit } = require('child_process');
        try {
          execSyncInit(`git config core.hooksPath .githooks`, { cwd: repoRoot, stdio: 'pipe' });
          console.log('[ok] git hooksPath: set to .githooks');
        } catch (e) {
          console.log(`[warn] git hooksPath: ${e.message}`);
        }

        // 5. Add PostCompact hook for scribe context recovery
        try {
          const settingsPath2 = path.join(home, '.claude', 'settings.json');
          const settings2 = JSON.parse(fs.readFileSync(settingsPath2, 'utf8'));
          if (!settings2.hooks) settings2.hooks = {};
          if (!settings2.hooks.PostCompact) {
            const contextPath = path.join(repoRoot, 'docs', 'session-context.md').replace(/\\/g, '/');
            settings2.hooks.PostCompact = [{
              hooks: [{
                type: 'command',
                command: `cat "${contextPath}" 2>/dev/null || echo "No session context found"`,
                statusMessage: 'Loading session context...'
              }]
            }];
            fs.writeFileSync(settingsPath2, JSON.stringify(settings2, null, 2));
            console.log('[ok] PostCompact hook: session context auto-load');
          } else {
            console.log('[ok] PostCompact hook: already configured');
          }
        } catch (e) {
          console.log(`[warn] PostCompact hook: ${e.message}`);
        }

        console.log('\nc4 init complete!');
        return;
      }

      case 'merge': {
        const { execSync } = require('child_process');
        const path = require('path');
        const skipChecks = args.includes('--skip-checks');
        const target = args.filter(a => a !== '--skip-checks')[0];

        if (!target) {
          console.error('Usage: c4 merge <worker-name|branch-name> [--skip-checks]');
          process.exit(1);
        }

        // Detect project root (git repo root) with config.json fallback
        let repoRoot;
        try {
          repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
        } catch {
          // Fallback: config.json projectRoot (same strategy as pty-manager._detectRepoRoot)
          try {
            const configPath = path.resolve(__dirname, '..', 'config.json');
            const config = JSON.parse(require('fs').readFileSync(configPath, 'utf8'));
            if (config.worktree && config.worktree.projectRoot) {
              repoRoot = path.resolve(config.worktree.projectRoot);
            }
          } catch {}
          if (!repoRoot) {
            console.error('Error: not inside a git repository and config.worktree.projectRoot not set');
            process.exit(1);
          }
        }

        // Determine branch name: if target matches a worktree worker name, derive branch
        let branch = target;
        const worktreePath = path.resolve(repoRoot, '..', `c4-worktree-${target}`);
        try {
          const fs = require('fs');
          if (fs.existsSync(worktreePath)) {
            // It's a worker name — get the branch from the worktree
            const wtBranch = execSync(`git -C "${worktreePath.replace(/\\/g, '/')}" rev-parse --abbrev-ref HEAD`, { encoding: 'utf8' }).trim();
            if (wtBranch) {
              branch = wtBranch;
              console.log(`Worker "${target}" → branch "${branch}"`);
            }
          }
        } catch {}

        // Verify the branch exists
        try {
          execSync(`git rev-parse --verify "${branch}"`, { cwd: repoRoot, encoding: 'utf8', stdio: 'pipe' });
        } catch {
          console.error(`Error: branch "${branch}" does not exist`);
          process.exit(1);
        }

        // Ensure we're on main
        const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
        if (currentBranch !== 'main') {
          console.error(`Error: must be on main branch to merge (currently on "${currentBranch}")`);
          process.exit(1);
        }

        // Don't merge main into itself
        if (branch === 'main') {
          console.error('Error: cannot merge main into itself');
          process.exit(1);
        }

        if (skipChecks) {
          console.log(`\nSkipping pre-merge checks (--skip-checks).\nMerging...\n`);
        } else {
          console.log(`\nPre-merge checks for branch "${branch}":\n`);

          let allPassed = true;

          // Check 1: tests pass (if test script exists)
          process.stdout.write('  [check] npm test ... ');
          try {
            const pkg = JSON.parse(require('fs').readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
            if (pkg.scripts && pkg.scripts.test) {
              execSync('npm test', { cwd: repoRoot, stdio: 'pipe' });
              console.log('PASS');
            } else {
              console.log('SKIP (no test script)');
            }
          } catch (e) {
            console.log('FAIL');
            console.error('    Tests failed. Fix tests before merging.');
            allPassed = false;
          }

          // Check 2: TODO.md modified
          process.stdout.write('  [check] TODO.md modified ... ');
          try {
            const diff = execSync(`git diff main..."${branch}" --name-only`, { cwd: repoRoot, encoding: 'utf8' });
            if (diff.split('\n').some(f => f.trim() === 'TODO.md')) {
              console.log('PASS');
            } else {
              console.log('FAIL');
              console.error('    TODO.md was not modified in this branch.');
              allPassed = false;
            }
          } catch {
            console.log('FAIL (could not diff)');
            allPassed = false;
          }

          // Check 3: CHANGELOG.md modified
          process.stdout.write('  [check] CHANGELOG.md modified ... ');
          try {
            const diff = execSync(`git diff main..."${branch}" --name-only`, { cwd: repoRoot, encoding: 'utf8' });
            if (diff.split('\n').some(f => f.trim() === 'CHANGELOG.md')) {
              console.log('PASS');
            } else {
              console.log('FAIL');
              console.error('    CHANGELOG.md was not modified in this branch.');
              allPassed = false;
            }
          } catch {
            console.log('FAIL (could not diff)');
            allPassed = false;
          }

          if (!allPassed) {
            console.log('\nMerge REJECTED — fix the above issues first.');
            process.exit(1);
          }

          console.log('\nAll checks passed. Merging...\n');
        }
        try {
          const output = execSync(`git merge "${branch}" --no-ff -m "Merge branch '${branch}'"`, { cwd: repoRoot, encoding: 'utf8' });
          console.log(output);
          console.log(`Merge complete: ${branch} → main`);

          // Show diff stat with submodule details (5.30)
          try {
            const diffStat = execSync(`git diff --stat --submodule=diff HEAD~1..HEAD`, { cwd: repoRoot, encoding: 'utf8' });
            if (diffStat.trim()) {
              console.log('\nDiff summary (with submodule details):');
              console.log(diffStat);
            }
          } catch {}

          // Show merged commits (5.30)
          try {
            const logOutput = execSync(`git log --oneline HEAD~1..HEAD --first-parent`, { cwd: repoRoot, encoding: 'utf8' });
            if (logOutput.trim()) {
              console.log('Merged commits:');
              console.log(logOutput);
            }
          } catch {}
        } catch (e) {
          console.error('Merge failed:', e.message);
          process.exit(1);
        }
        return;
      }

      case 'scribe': {
        const sub = args[0];
        if (!sub || !['start', 'stop', 'status', 'scan'].includes(sub)) {
          console.log('Usage: c4 scribe <start|stop|status|scan>');
          return;
        }
        if (sub === 'start') {
          result = await request('POST', '/scribe/start');
        } else if (sub === 'stop') {
          result = await request('POST', '/scribe/stop');
        } else if (sub === 'status') {
          result = await request('GET', '/scribe/status');
          if (result.running !== undefined) {
            console.log(`Scribe: ${result.running ? 'running' : 'stopped'}`);
            console.log(`  Interval: ${(result.intervalMs / 1000).toFixed(0)}s`);
            console.log(`  Output: ${result.outputPath}`);
            console.log(`  Entries: ${result.totalEntries}`);
            console.log(`  Tracked files: ${result.trackedFiles}`);
            return;
          }
        } else if (sub === 'scan') {
          result = await request('POST', '/scribe/scan');
          if (result.scanned !== undefined) {
            console.log(`Scanned ${result.scanned} files, ${result.newEntries} new entries (${result.totalEntries} total)`);
            return;
          }
        }
        break;
      }

      case 'templates': {
        result = await request('GET', '/templates');
        if (result.templates) {
          console.log('NAME\t\tMODEL\tEFFORT\tSOURCE\tDESCRIPTION');
          for (const [name, tmpl] of Object.entries(result.templates)) {
            const model = tmpl.model || '-';
            const effort = tmpl.effort || '-';
            const source = tmpl.source || '-';
            const desc = (tmpl.description || '').slice(0, 50);
            console.log(`${name}\t\t${model}\t${effort}\t${source}\t${desc}`);
          }
          return;
        }
        break;
      }

      case 'profiles': {
        result = await request('GET', '/profiles');
        if (result.profiles) {
          console.log('NAME\t\tALLOW\tDENY\tDESCRIPTION');
          for (const [name, prof] of Object.entries(result.profiles)) {
            const allow = (prof.allow || []).length;
            const deny = (prof.deny || []).length;
            const desc = (prof.description || '').slice(0, 50);
            console.log(`${name}\t\t${allow}\t${deny}\t${desc}`);
          }
          return;
        }
        break;
      }

      case 'swarm': {
        const name = args[0];
        if (!name) {
          console.error('Usage: c4 swarm <worker-name>');
          process.exit(1);
        }
        result = await request('GET', `/swarm?name=${name}`);
        if (result.worker) {
          console.log(`Swarm status for '${result.worker}':`);
          console.log(`  Enabled: ${result.enabled}`);
          console.log(`  Max subagents: ${result.maxSubagents}`);
          console.log(`  Subagent count: ${result.subagentCount}`);
          if (result.subagentLog && result.subagentLog.length > 0) {
            console.log('  Recent subagents:');
            for (const entry of result.subagentLog) {
              const time = new Date(entry.timestamp).toLocaleTimeString();
              const prompt = entry.prompt.length > 60 ? entry.prompt.slice(0, 60) + '...' : entry.prompt;
              console.log(`    #${entry.index} [${time}] ${entry.subagentType}: ${prompt}`);
            }
          }
          return;
        }
        break;
      }

      case 'token-usage': {
        result = await request('GET', '/token-usage');
        if (result.error) {
          console.log(`Error: ${result.error}`);
        } else {
          console.log(`Token usage (${result.today}):`);
          console.log(`  Input:  ${(result.input || 0).toLocaleString()} tokens`);
          console.log(`  Output: ${(result.output || 0).toLocaleString()} tokens`);
          console.log(`  Total:  ${(result.total || 0).toLocaleString()} tokens`);
          if (result.dailyLimit > 0) {
            const pct = Math.round((result.total / result.dailyLimit) * 100);
            console.log(`  Limit:  ${result.dailyLimit.toLocaleString()} tokens (${pct}% used)`);
          }
          if (result.history) {
            const days = Object.keys(result.history).sort().reverse();
            if (days.length > 1) {
              console.log('  History:');
              for (const day of days.slice(0, 7)) {
                const d = result.history[day];
                console.log(`    ${day}: ${(d.input + d.output).toLocaleString()} tokens`);
              }
            }
          }
        }
        return;
      }

      case 'status': {
        // c4 status <worker-name> "message"  — send status update to Slack
        const statusWorker = args[0] || '';
        const statusMsg = args.slice(1).join(' ');
        if (!statusMsg) {
          console.error('Usage: c4 status <worker-name> "status message"');
          process.exit(1);
        }
        result = await request('POST', '/status-update', { worker: statusWorker, message: statusMsg });
        break;
      }

      case 'history': {
        let worker = '', limit = 0;
        for (let i = 0; i < args.length; i++) {
          if (args[i] === '--worker' && args[i + 1]) { worker = args[++i]; }
          else if (args[i] === '--limit' && args[i + 1]) { limit = parseInt(args[++i]) || 0; }
          else if (!worker) { worker = args[i]; }
        }
        const params = new URLSearchParams();
        if (worker) params.set('worker', worker);
        if (limit) params.set('limit', String(limit));
        const qs = params.toString() ? `?${params.toString()}` : '';
        result = await request('GET', `/history${qs}`);
        if (result.records) {
          if (result.records.length === 0) {
            console.log('No history records.');
          } else {
            for (const r of result.records) {
              const started = r.startedAt ? new Date(r.startedAt).toLocaleString() : '?';
              const completed = r.completedAt ? new Date(r.completedAt).toLocaleString() : '?';
              const commits = (r.commits || []).length;
              console.log(`[${r.status}] ${r.name}  branch=${r.branch || '-'}  commits=${commits}`);
              console.log(`  started: ${started}  completed: ${completed}`);
              if (r.task) {
                const taskPreview = r.task.length > 80 ? r.task.slice(0, 80) + '...' : r.task;
                console.log(`  task: ${taskPreview}`);
              }
              if (r.commits && r.commits.length > 0) {
                for (const c of r.commits) {
                  console.log(`    ${c.hash} ${c.message}`);
                }
              }
              console.log('');
            }
            console.log(`Total: ${result.records.length} records`);
          }
          return;
        }
        break;
      }

      case 'plan': {
        const name = args[0];
        let planOutput = '';
        const taskParts = [];
        let branch = '', scopePreset = '', contextFrom = '';
        for (let i = 1; i < args.length; i++) {
          if (args[i] === '--branch' && args[i + 1]) { branch = args[++i]; }
          else if (args[i] === '--output' && args[i + 1]) { planOutput = args[++i]; }
          else if (args[i] === '--scope-preset' && args[i + 1]) { scopePreset = args[++i]; }
          else if (args[i] === '--context' && args[i + 1]) { contextFrom = args[++i]; }
          else { taskParts.push(args[i]); }
        }
        const planTask = taskParts.join(' ');
        if (!name || !planTask) {
          console.error('Usage: c4 plan <name> <task> [--branch name] [--output plan.md]');
          process.exit(1);
        }
        const planBody = { name, task: planTask };
        if (branch) planBody.branch = branch;
        if (planOutput) planBody.outputPath = planOutput;
        if (scopePreset) planBody.scopePreset = scopePreset;
        if (contextFrom) planBody.contextFrom = contextFrom;
        result = await request('POST', '/plan', planBody);
        break;
      }

      case 'plan-read': {
        const name = args[0];
        let planOutput = '';
        for (let i = 1; i < args.length; i++) {
          if (args[i] === '--output' && args[i + 1]) { planOutput = args[++i]; }
        }
        if (!name) {
          console.error('Usage: c4 plan-read <name> [--output plan.md]');
          process.exit(1);
        }
        const prParams = new URLSearchParams({ name });
        if (planOutput) prParams.set('outputPath', planOutput);
        result = await request('GET', `/plan?${prParams.toString()}`);
        if (result.content) {
          process.stdout.write(result.content + '\n');
          return;
        }
        break;
      }

      case 'approve': {
        const name = args[0];
        if (!name) {
          console.error('Usage: c4 approve <worker-name> [option_number]');
          process.exit(1);
        }
        const optionNumber = args[1] ? parseInt(args[1], 10) : undefined;
        if (optionNumber !== undefined && (isNaN(optionNumber) || optionNumber < 1)) {
          console.error('option_number must be a positive integer (1, 2, 3, ...)');
          process.exit(1);
        }
        result = await request('POST', '/approve', { name, optionNumber });
        if (result.success) {
          const detail = optionNumber
            ? `Selected option ${optionNumber} for '${name}'`
            : `Approved critical command for '${name}': ${result.approved}`;
          console.log(detail);
          return;
        }
        break;
      }

      case 'rollback': {
        const name = args[0];
        if (!name) {
          console.error('Usage: c4 rollback <worker-name>');
          process.exit(1);
        }
        result = await request('POST', '/rollback', { name });
        if (result.success) {
          if (result.from) {
            console.log(`Rolled back '${name}': ${result.from} → ${result.to}`);
          } else {
            console.log(result.message);
          }
          return;
        }
        break;
      }

      case 'batch': {
        // c4 batch "task" --count N  → same task to N workers
        // c4 batch --file tasks.txt  → one task per line from file
        let count = 0, filePath = '', autoMode = false, profile = '', branch = '';
        const taskParts = [];
        for (let i = 0; i < args.length; i++) {
          if (args[i] === '--count' && args[i + 1]) { count = parseInt(args[++i]) || 0; }
          else if (args[i] === '--file' && args[i + 1]) { filePath = args[++i]; }
          else if (args[i] === '--auto-mode') { autoMode = true; }
          else if (args[i] === '--profile' && args[i + 1]) { profile = args[++i]; }
          else if (args[i] === '--branch' && args[i + 1]) { branch = args[++i]; }
          else { taskParts.push(args[i]); }
        }
        const batchTask = taskParts.join(' ');

        // Build list of tasks
        let tasks = [];
        if (filePath) {
          // File mode: one task per line
          try {
            const content = fs.readFileSync(filePath, 'utf8');
            tasks = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
          } catch (e) {
            console.error(`Error reading file: ${e.message}`);
            process.exit(1);
          }
          if (tasks.length === 0) {
            console.error('No tasks found in file.');
            process.exit(1);
          }
        } else if (count > 0 && batchTask) {
          // Count mode: same task N times
          for (let i = 0; i < count; i++) tasks.push(batchTask);
        } else {
          console.error('Usage: c4 batch "task" --count N');
          console.error('       c4 batch --file tasks.txt');
          console.error('  Options: --auto-mode --profile <name> --branch <prefix>');
          process.exit(1);
        }

        console.log(`Batch: ${tasks.length} tasks`);
        const results = [];
        for (let i = 0; i < tasks.length; i++) {
          const workerName = `batch-${i + 1}`;
          const branchName = branch ? `${branch}-${i + 1}` : '';
          const body = { name: workerName, task: tasks[i], useBranch: true };
          if (branchName) body.branch = branchName;
          if (autoMode) body.autoMode = true;
          if (profile) body.profile = profile;
          try {
            const r = await request('POST', '/task', body);
            results.push({ name: workerName, ok: true, result: r });
            console.log(`  [${i + 1}/${tasks.length}] ${workerName}: created`);
          } catch (e) {
            results.push({ name: workerName, ok: false, error: e.message });
            console.log(`  [${i + 1}/${tasks.length}] ${workerName}: FAILED (${e.message})`);
          }
        }

        const ok = results.filter(r => r.ok).length;
        const fail = results.filter(r => !r.ok).length;
        console.log(`\nBatch complete: ${ok} created, ${fail} failed`);
        return;
      }

      case 'cleanup': {
        const dryRun = args.includes('--dry-run');
        result = await request('POST', '/cleanup', { dryRun });
        if (result.branches || result.worktrees || result.directories) {
          const mode = result.dryRun ? '[dry-run] ' : '';
          if (result.branches.length) console.log(`${mode}Branches deleted: ${result.branches.join(', ')}`);
          if (result.worktrees.length) console.log(`${mode}Worktrees removed: ${result.worktrees.join(', ')}`);
          if (result.directories.length) console.log(`${mode}Orphan directories removed: ${result.directories.join(', ')}`);
          if (!result.branches.length && !result.worktrees.length && !result.directories.length) {
            console.log('Nothing to clean up.');
          }
          return;
        }
        break;
      }

      case 'auto': {
        const task = args.join(' ');
        if (!task) {
          console.error('Usage: c4 auto <task>');
          console.error('  Starts autonomous manager worker + scribe, sends task.');
          console.error('  Morning report generated on completion.');
          console.error('\nExample:');
          console.error('  c4 auto "Build feature X, run tests, commit"');
          process.exit(1);
        }
        result = await request('POST', '/auto', { task }, 30000);
        if (result.name) {
          console.log(`[auto] Manager '${result.name}' created (scribe: ${result.scribe ? 'on' : 'off'})`);
          console.log(`[auto] Task sent. Morning report will be generated on completion.`);
          console.log(`[auto] Monitor: c4 read-now ${result.name} / c4 wait ${result.name}`);
        }
        break;
      }

      case 'resume': {
        // Resume a worker's Claude Code session (4.1)
        const name = args[0];
        const sessionId = args[1] || '';
        if (!name) {
          console.error('Usage: c4 resume <name> [sessionId]');
          console.error('  Resumes a worker with claude --resume. If sessionId not given, auto-detects.');
          process.exit(1);
        }
        const body = { name };
        if (sessionId) body.sessionId = sessionId;
        result = await request('POST', '/resume', body, 30000);
        if (result.pid) {
          console.log(`[resume] Worker '${name}' resumed (pid: ${result.pid})`);
        }
        break;
      }

      case 'session-id': {
        // Get session ID for a worker (4.1)
        const name = args[0];
        if (!name) {
          console.error('Usage: c4 session-id <name>');
          process.exit(1);
        }
        result = await request('GET', `/session-id?name=${encodeURIComponent(name)}`);
        if (result.sessionId) {
          console.log(`Session ID for '${name}': ${result.sessionId}`);
        } else {
          console.log(`No session ID found for '${name}'`);
        }
        break;
      }

      case 'morning': {
        result = await request('POST', '/morning');
        if (result.success) {
          console.log(`Morning report generated: ${result.path}`);
          // Print the report
          try {
            const fs = require('fs');
            const content = fs.readFileSync(result.path, 'utf8');
            console.log('\n' + content);
          } catch {}
        }
        break;
      }

      case 'daemon': {
        const DaemonManager = require(require('path').join(__dirname, 'daemon-manager'));
        const sub = args[0];
        if (!sub || !['start', 'stop', 'restart', 'status'].includes(sub)) {
          console.log('Usage: c4 daemon <start|stop|restart|status>');
          return;
        }
        result = await DaemonManager[sub]();
        if (sub === 'status') {
          if (result.running) {
            console.log(`Daemon running (PID ${result.pid}, ${result.workers ?? '?'} workers)`);
            if (result.endpoint) console.log(`  ${result.endpoint}`);
            if (result.note) console.log(`  ${result.note}`);
          } else {
            console.log('Daemon is not running.');
          }
          return;
        }
        if (sub === 'restart') {
          const s = result.start;
          if (s.ok) {
            console.log(`Restarted (PID ${s.pid})`);
          } else {
            console.log(s.error || JSON.stringify(result));
          }
          return;
        }
        if (result.ok) {
          console.log(sub === 'start' ? `Started (PID ${result.pid})` : `Stopped (PID ${result.pid})`);
        }
        break;
      }

      default:
        console.log(`Usage: c4 <command> [args]

Commands:
  init                                                     Initialize c4 (permissions, config, symlink)
  new <name> [command] [--target dgx|local] [--cwd path]   Create a worker
  task <name> <text> [--branch name] [--no-branch]         Send task with auto branch
       [--repo path] [--cwd path]                              Repo root / working dir for worktree
       [--context worker] [--reuse] [--scope JSON]             Context / pool reuse / scope
  send <name> <text>               Send raw text to worker
  key <name> <key>                 Send special key (Enter, C-c, C-b, Tab, etc.)
  read <name>                      Read new output (idle snapshots only)
  read-now <name>                  Read current screen immediately
  wait <name> [timeout_ms]         Wait until idle, then read screen
       [--all] [--interrupt-on-intervention]  Multi-worker / intervention wait
  scrollback <name> [--lines N]    Read scrollback buffer (default 200 lines)
  list                             List all workers
  merge <worker|branch>            Merge branch to main (with pre-checks)
  plan <name> <task> [--output f]   Plan-only mode: write plan.md without executing
  plan-read <name> [--output f]    Read generated plan.md from worker
  rollback <name>                  Rollback worker to pre-task commit (git reset --soft)
  close <name>                     Close a worker
  history [worker] [--limit N]     Show task history
  health                           Check daemon status
  daemon start                     Start daemon in background
  daemon stop                      Stop daemon
  daemon restart                   Restart daemon
  daemon status                    Check daemon status
  scribe start                     Start session context recording
  scribe stop                      Stop scribe
  scribe status                    Show scribe status
  scribe scan                      Run one-time scan now
  token-usage                      Show daily token usage
  auto <task>                      Autonomous mode: manager + scribe + task (4.8)
  morning                          Generate morning report (4.4)
  profiles                         List available permission profiles
  batch "task" --count N           Same task to N workers in parallel
  batch --file tasks.txt           One task per line from file
       [--auto-mode] [--profile name] [--branch prefix]
  config                           Show current config
  config reload                    Reload config.json without restart

Special keys: Enter, C-c, C-b, C-d, C-z, C-l, C-a, C-e, Escape, Tab, Backspace, Up, Down, Left, Right

Examples:
  c4 new arps claude                          # 로컬
  c4 new arps claude --target dgx              # DGX 원격
  c4 new arps claude --target dgx --cwd /home/shinc/arps
  c4 send arps "ARPS에 로깅 추가해줘"
  c4 key arps Enter
  c4 wait arps                  # idle까지 기다렸다가 깨끗한 화면 반환
  c4 wait w1 w2 w3               # 여러 worker 동시 대기, 첫 완료 시 반환
  c4 wait --all                  # 모든 worker 동시 대기
  c4 wait --all --interrupt-on-intervention  # intervention 발생 시 즉시 종료
  c4 read-now arps              # 지금 당장 화면 보기 (스피너 포함)
  c4 list
  c4 close arps

Profile examples:
  c4 task worker "Build API" --profile web
  c4 task worker "Train model" --profile ml
  c4 task worker "Write Dockerfile" --profile infra
  c4 profiles                      # List all profiles

Scope examples:
  c4 task worker "Add logging" --scope '{"allowFiles":["src/rag.py","tests/"],"denyBash":["pip","docker"]}'
  c4 task worker "Fix bug" --scope-preset backend

--repo vs --cwd (5.37):
  --repo <path>   Exact git repo root for worktree creation (= projectRoot)
  --cwd  <path>   Directory inside a repo; repo root is auto-detected via git
  --no-branch     Disables both branch creation and worktree creation
  c4 task worker "Fix bug" --repo /home/user/other-repo
  c4 task worker "Fix bug" --cwd /home/user/other-repo/src`);
        return;
    }

    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
