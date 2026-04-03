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
        // Parse --target and --cwd flags
        let target = 'local', cwd = '';
        const filteredArgs = [];
        let command = 'claude';
        let commandSet = false;
        for (let i = 1; i < args.length; i++) {
          if (args[i] === '--target' && args[i + 1]) { target = args[++i]; }
          else if (args[i] === '--cwd' && args[i + 1]) { cwd = args[++i]; }
          else if (!commandSet) { command = args[i]; commandSet = true; }
          else { filteredArgs.push(args[i]); }
        }
        result = await request('POST', '/create', { name, command, args: filteredArgs, target, cwd });
        break;
      }

      case 'send': {
        const name = args[0];
        const input = args.slice(1).join(' ');
        result = await request('POST', '/send', { name, input });
        break;
      }

      case 'task': {
        const name = args[0];
        let branch = '', useBranch = true;
        const taskParts = [];
        for (let i = 1; i < args.length; i++) {
          if (args[i] === '--branch' && args[i + 1]) { branch = args[++i]; }
          else if (args[i] === '--no-branch') { useBranch = false; }
          else { taskParts.push(args[i]); }
        }
        const task = taskParts.join(' ');
        result = await request('POST', '/task', { name, task, branch, useBranch });
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
        const name = args[0];
        const timeout = args[1] || '120000';
        process.stderr.write('Waiting for worker to become idle...\n');
        result = await request('GET', `/wait-read?name=${name}&timeout=${timeout}`, null, parseInt(timeout) + 5000);
        if (result.content !== undefined) {
          process.stdout.write(result.content + '\n');
          process.stderr.write(`--- status=${result.status} ---\n`);
          return;
        }
        break;
      }

      case 'list': {
        result = await request('GET', '/list');
        if (result.workers) {
          if (result.workers.length === 0) {
            console.log('No workers running.');
          } else {
            console.log('NAME\t\tSTATUS\t\tUNREAD\tCOMMAND');
            for (const w of result.workers) {
              console.log(`${w.name}\t\t${w.status}\t\t${w.unreadSnapshots}\t${w.command}`);
            }
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

        const home = os.homedir();
        const repoRoot = path.resolve(__dirname, '..');

        // 1. Merge c4 permissions into ~/.claude/settings.json
        const claudeDir = path.join(home, '.claude');
        const settingsPath = path.join(claudeDir, 'settings.json');
        const requiredPermissions = [
          'Bash(c4:*)',
          'Bash(MSYS_NO_PATHCONV=1 c4:*)',
          'Bash(cd:*)',
          'Bash(git:*)',
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

        fs.mkdirSync(claudeDir, { recursive: true });
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
        console.log(`[ok] settings.json: ${added} permissions added (${settings.permissions.allow.length} total)`);

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

        // 3. CLAUDE.md symlink: ~/CLAUDE.md -> repo/CLAUDE.md
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
              fs.symlinkSync(claudeMdSrc, claudeMdDst);
              console.log('[ok] CLAUDE.md symlink: created');
            } else {
              throw e;
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

        console.log('\nc4 init complete!');
        return;
      }

      case 'merge': {
        const { execSync } = require('child_process');
        const path = require('path');
        const target = args[0];

        if (!target) {
          console.error('Usage: c4 merge <worker-name|branch-name>');
          process.exit(1);
        }

        // Detect project root (git repo root)
        let repoRoot;
        try {
          repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
        } catch {
          console.error('Error: not inside a git repository');
          process.exit(1);
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

        // All checks passed — merge
        console.log('\nAll checks passed. Merging...\n');
        try {
          const output = execSync(`git merge "${branch}" --no-ff -m "Merge branch '${branch}'"`, { cwd: repoRoot, encoding: 'utf8' });
          console.log(output);
          console.log(`Merge complete: ${branch} → main`);
        } catch (e) {
          console.error('Merge failed:', e.message);
          process.exit(1);
        }
        return;
      }

      case 'daemon': {
        const DaemonManager = require('./daemon-manager');
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
  task <name> <text> [--branch name] [--no-branch]        Send task with auto branch
  send <name> <text>               Send raw text to worker
  key <name> <key>                 Send special key (Enter, C-c, C-b, Tab, etc.)
  read <name>                      Read new output (idle snapshots only)
  read-now <name>                  Read current screen immediately
  wait <name> [timeout_ms]         Wait until idle, then read screen
  list                             List all workers
  merge <worker|branch>            Merge branch to main (with pre-checks)
  close <name>                     Close a worker
  health                           Check daemon status
  daemon start                     Start daemon in background
  daemon stop                      Stop daemon
  daemon restart                   Restart daemon
  daemon status                    Check daemon status
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
  c4 read-now arps              # 지금 당장 화면 보기 (스피너 포함)
  c4 list
  c4 close arps`);
        return;
    }

    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
