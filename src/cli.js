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

// Fleet routing (9.6): when an alias is pinned via C4_FLEET env or
// ~/.c4/fleet.current, `request()` proxies to that peer's daemon
// instead of 127.0.0.1. `c4 fleet use <alias>` writes the pin file;
// `c4 fleet use --clear` removes it.
let _fleetModule;
function fleetModule() {
  if (!_fleetModule) _fleetModule = require('./fleet');
  return _fleetModule;
}

function resolveBase() {
  if (process.env.C4_URL) return process.env.C4_URL;
  try {
    const pinned = fleetModule().getPinnedBase();
    if (pinned && pinned.pinned && pinned.base) return pinned.base;
  } catch {}
  return 'http://127.0.0.1:3456';
}

const BASE = resolveBase();

// Session auth (8.14): the daemon rejects unauthenticated /api/* requests
// when config.auth.enabled is true. Looking up the token at call time so
// the same CLI process stays usable after `c4 login` writes the token file.
const TOKEN_FILE = path.join(os.homedir(), '.c4-token');

function readToken() {
  if (process.env.C4_TOKEN) return process.env.C4_TOKEN.trim();
  // 9.6: when targeting a pinned fleet alias, prefer its stored token
  // so each peer can use its own JWT without trampling ~/.c4-token.
  try {
    const pinned = fleetModule().getPinnedBase();
    if (pinned && pinned.pinned && pinned.token) return pinned.token;
  } catch {}
  try {
    const t = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
    return t || null;
  } catch {
    return null;
  }
}

// Returns the value that follows --flag in argv, or '' if absent.
// Used by `c4 init` to pull --user / --password-file without pulling in
// a full arg parser.
function extractFlag(argv, flag) {
  if (!Array.isArray(argv)) return '';
  const idx = argv.indexOf(flag);
  if (idx === -1 || idx === argv.length - 1) return '';
  return argv[idx + 1];
}

function request(method, path, body = null, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const headers = { 'Content-Type': 'application/json' };
    const token = readToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers,
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

// (11.3) Minimal YAML loader for `c4 workflow create --file`. Supports
// the slice of YAML workflow definitions actually use: nested mappings,
// sequences of mappings, scalars (string / number / boolean / null),
// `#` comments, and quoted strings ('...' or "..."). Falls through to
// the JSON parser first - this only runs when JSON.parse fails.
function parseSimpleYaml(text) {
  if (typeof text !== 'string') throw new Error('YAML input must be a string');
  const rawLines = text.split(/\r?\n/);
  const lines = [];
  for (const line of rawLines) {
    let stripped = line.replace(/^\uFEFF/, '');
    const hashIdx = findCommentIndex(stripped);
    if (hashIdx >= 0) stripped = stripped.slice(0, hashIdx);
    stripped = stripped.replace(/\s+$/, '');
    if (stripped.length === 0) continue;
    const indent = stripped.match(/^ */)[0].length;
    const content = stripped.slice(indent);
    lines.push({ indent, content });
  }
  let pos = 0;
  function parseValueScalar(s) {
    const t = s.trim();
    if (t === '') return '';
    if (t === 'null' || t === '~') return null;
    if (t === 'true') return true;
    if (t === 'false') return false;
    if ((t.startsWith('"') && t.endsWith('"') && t.length >= 2) ||
        (t.startsWith("'") && t.endsWith("'") && t.length >= 2)) {
      return t.slice(1, -1);
    }
    if (/^-?\d+$/.test(t)) return parseInt(t, 10);
    if (/^-?\d+\.\d+$/.test(t)) return parseFloat(t);
    return t;
  }
  function findCommentIndex(s) {
    let inSingle = false, inDouble = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '"' && !inSingle) inDouble = !inDouble;
      else if (c === "'" && !inDouble) inSingle = !inSingle;
      else if (c === '#' && !inSingle && !inDouble) return i;
    }
    return -1;
  }
  function parseBlock(parentIndent) {
    let result = null;
    while (pos < lines.length) {
      const { indent, content } = lines[pos];
      if (indent <= parentIndent) break;
      if (content.startsWith('- ')) {
        if (result === null) result = [];
        if (!Array.isArray(result)) throw new Error('Mixed map/list at line ' + (pos + 1));
        const itemBody = content.slice(2);
        pos++;
        if (itemBody.includes(':') && !/^['"]/.test(itemBody)) {
          // List item is a mapping starting on the same line, e.g.
          //   - id: foo
          //     type: task
          // Inject a synthetic indent so parseBlock collects the rest.
          const colonIdx = itemBody.indexOf(':');
          const key = itemBody.slice(0, colonIdx).trim();
          const valueRaw = itemBody.slice(colonIdx + 1).trim();
          let map;
          if (valueRaw.length === 0) {
            const child = parseBlock(indent + 2);
            map = { [key]: child };
          } else {
            map = { [key]: parseValueScalar(valueRaw) };
          }
          // Continue collecting more mapping fields belonging to this list item.
          while (pos < lines.length && lines[pos].indent > indent) {
            const ln = lines[pos];
            if (ln.content.startsWith('- ')) break;
            const colon2 = ln.content.indexOf(':');
            if (colon2 < 0) throw new Error('Expected mapping at line ' + (pos + 1));
            const key2 = ln.content.slice(0, colon2).trim();
            const value2 = ln.content.slice(colon2 + 1).trim();
            pos++;
            if (value2.length === 0) {
              map[key2] = parseBlock(ln.indent);
            } else {
              map[key2] = parseValueScalar(value2);
            }
          }
          result.push(map);
        } else if (itemBody.length === 0) {
          result.push(parseBlock(indent));
        } else {
          result.push(parseValueScalar(itemBody));
        }
      } else {
        if (result === null) result = {};
        if (Array.isArray(result)) throw new Error('Mixed list/map at line ' + (pos + 1));
        const colon = content.indexOf(':');
        if (colon < 0) throw new Error('Expected "key: value" at line ' + (pos + 1));
        const key = content.slice(0, colon).trim();
        const value = content.slice(colon + 1).trim();
        pos++;
        if (value.length === 0) {
          result[key] = parseBlock(indent);
        } else {
          result[key] = parseValueScalar(value);
        }
      }
    }
    return result === null ? {} : result;
  }
  return parseBlock(-1);
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);

  try {
    let result;

    switch (cmd) {
      case 'new': {
        const name = args[0];
        // Parse --target, --cwd, --template, --parent, --tier flags
        let target = 'local', cwd = '', template = '', parent = '', tier = '';
        const filteredArgs = [];
        let command = 'claude';
        let commandSet = false;
        for (let i = 1; i < args.length; i++) {
          if (args[i] === '--target' && args[i + 1]) { target = args[++i]; }
          else if (args[i] === '--cwd' && args[i + 1]) { cwd = args[++i]; }
          else if (args[i] === '--template' && args[i + 1]) { template = args[++i]; }
          else if (args[i] === '--parent' && args[i + 1]) { parent = args[++i]; }
          else if (args[i] === '--tier' && args[i + 1]) { tier = args[++i]; }
          else if (!commandSet) { command = args[i]; commandSet = true; }
          else { filteredArgs.push(args[i]); }
        }
        // Auto-detect parent from spawned worker env (8.2). The daemon
        // injects C4_WORKER_NAME so nested `c4 new` calls know which
        // worker they are running inside. Explicit --parent wins.
        if (!parent && process.env.C4_WORKER_NAME) {
          parent = process.env.C4_WORKER_NAME;
        }
        const body = { name, command, args: filteredArgs, target, cwd };
        if (template) body.template = template;
        if (parent) body.parent = parent;
        if (tier) body.tier = tier;
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
        let budgetUsd = null, maxRetries = null, tier = '', model = '', planDoc = '';
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
          else if (effectiveArgs[i] === '--tier' && effectiveArgs[i + 1]) { tier = effectiveArgs[++i]; }
          else if (effectiveArgs[i] === '--model' && effectiveArgs[i + 1]) { model = effectiveArgs[++i]; }
          else if (effectiveArgs[i] === '--budget' && effectiveArgs[i + 1]) {
            const v = parseFloat(effectiveArgs[++i]);
            if (!Number.isFinite(v)) { console.error('Error: --budget must be a number (USD)'); process.exit(1); }
            budgetUsd = v;
          }
          else if (effectiveArgs[i] === '--max-retries' && effectiveArgs[i + 1]) {
            const v = parseInt(effectiveArgs[++i], 10);
            if (!Number.isFinite(v) || v < 0) { console.error('Error: --max-retries must be a non-negative integer'); process.exit(1); }
            maxRetries = v;
          }
          else if (effectiveArgs[i] === '--scope' && effectiveArgs[i + 1]) {
            try { scope = JSON.parse(effectiveArgs[++i]); }
            catch { console.error('Error: --scope must be valid JSON'); process.exit(1); }
          }
          else if (effectiveArgs[i] === '--scope-preset' && effectiveArgs[i + 1]) { scopePreset = effectiveArgs[++i]; }
          else if (effectiveArgs[i] === '--plan-doc' && effectiveArgs[i + 1]) { planDoc = effectiveArgs[++i]; }
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
        if (budgetUsd !== null) body.budgetUsd = budgetUsd;
        if (maxRetries !== null) body.maxRetries = maxRetries;
        if (tier) body.tier = tier;
        if (model) body.model = model;
        if (planDoc) body.planDocPath = planDoc;
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
        const allParam = waitAll ? '&waitAll=1' : '';
        const timeoutNum = parseInt(waitTimeout);

        if (waitAll || waitNames.length > 1) {
          // Multi-worker wait
          const names = waitAll ? '*' : waitNames.join(',');
          process.stderr.write(`Waiting for ${waitAll ? 'all workers' : waitNames.join(', ')}...\n`);
          result = await request('GET', `/wait-read-multi?names=${names}&timeout=${waitTimeout}${ioiParam}${allParam}`, null, timeoutNum + 5000);
          if (result.status === 'all-settled' || (result.status === 'timeout' && Array.isArray(result.results))) {
            const label = result.status === 'timeout' ? 'timeout' : 'all-settled';
            process.stderr.write(`--- status=${label} ---\n`);
            if (result.results) {
              for (const r of result.results) {
                const tag = r.intervention ? ` (intervention: ${r.intervention})` : '';
                process.stderr.write(`  ${r.name}: ${r.status}${tag}\n`);
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
        const treeMode = args.includes('--tree');
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
          if (treeMode) {
            const { buildTree, renderTree } = require('./hierarchy-tree');
            const roots = buildTree(result.workers);
            if (roots.length === 0) {
              console.log('No workers running.');
            } else {
              console.log(renderTree(roots));
            }
            if (result.queuedTasks && result.queuedTasks.length > 0) {
              console.log('\nQUEUED:');
              for (const q of result.queuedTasks) {
                const after = q.after || '-';
                console.log(`  ${q.name}  branch=${q.branch || '-'}  after=${after}`);
              }
            }
            if (result.lostWorkers && result.lostWorkers.length > 0) {
              console.log('\nLOST (daemon restart):');
              for (const lw of result.lostWorkers) {
                console.log(`  ${lw.name}  parent=${lw.parent || '-'}  branch=${lw.branch || '-'}`);
              }
            }
            return;
          }
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
        // Version mismatch warning (7.15)
        try {
          const installedVersion = require('../package.json').version;
          if (result && result.version && result.version !== installedVersion) {
            console.warn(`[warn] daemon version mismatch: daemon=${result.version} installed=${installedVersion}`);
            console.warn(`  Run 'c4 daemon restart' to reload the daemon with the latest code.`);
          }
        } catch {}
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

        // 2b. Session auth provisioning (8.14). Two modes:
        //   - non-interactive: --user <name> --password-file <path>
        //   - interactive:     prompt for user + password on a TTY
        // Either way we bcrypt the password and store only the hash in
        // config.auth.users[<name>].passwordHash, alongside a freshly
        // generated auth.secret on first run. The source password file is
        // never modified.
        try {
          const authSetup = require('./auth-setup');
          const cliAuthUser = extractFlag(args, '--user');
          const cliAuthPwFile = extractFlag(args, '--password-file');

          const result = await authSetup.provisionAuth({
            configPath: configDst,
            user: cliAuthUser,
            passwordFile: cliAuthPwFile,
            interactive: process.stdin.isTTY && !cliAuthUser && !cliAuthPwFile,
          });
          if (result.status === 'updated') {
            console.log(`[ok] auth: user '${result.user}' configured (bcrypt hash stored)`);
          } else if (result.status === 'skipped-exists') {
            console.log(`[ok] auth: user '${result.user}' already configured (skipped)`);
          } else if (result.status === 'skipped-no-args') {
            console.log('[info] auth: non-interactive mode without --user/--password-file (skipped)');
          } else if (result.status === 'error') {
            console.log(`[warn] auth setup: ${result.error}`);
          }
        } catch (e) {
          console.log(`[warn] auth setup: ${e.message}`);
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
          const c4Cli = path.join(repoRoot, 'src', 'cli.js').replace(/\\/g, '/');

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
            console.log('[info] npm link failed — trying fallbacks');
          }

          // 5b. Linux/macOS: ~/.local/bin/c4 symlink (primary fallback)
          if (!c4Registered && !isWin) {
            const localBin = path.join(home, '.local', 'bin');
            const c4Link = path.join(localBin, 'c4');
            try {
              fs.mkdirSync(localBin, { recursive: true });
              try { fs.chmodSync(c4Cli, 0o755); } catch {}
              try {
                const stat = fs.lstatSync(c4Link);
                if (stat.isSymbolicLink() || stat.isFile()) fs.unlinkSync(c4Link);
              } catch {}
              fs.symlinkSync(c4Cli, c4Link);
              c4Registered = true;
              console.log(`[ok] symlink: ${c4Link} -> ${c4Cli}`);

              // Auto-register ~/.local/bin in PATH via shell rc (bash + zsh).
              const { registerLocalBinInPath } = require('./init-path');
              const pathResult = registerLocalBinInPath({ home, localBin });
              if (pathResult.alreadyInPath) {
                console.log('[ok] PATH: ~/.local/bin already in PATH');
              } else {
                for (const rc of pathResult.updated) {
                  console.log(`[ok] PATH: registered ~/.local/bin in ${rc}`);
                }
                for (const rc of pathResult.unchanged) {
                  console.log(`[ok] PATH: export already present in ${rc} (skipped)`);
                }
                for (const { rc, error } of pathResult.errors) {
                  console.log(`[warn] PATH: could not update ${rc}: ${error}`);
                }
                if (pathResult.updated.length > 0) {
                  console.log('[info] Open a new terminal (or `source ~/.bashrc`) to pick up PATH');
                } else if (pathResult.unchanged.length === 0 && pathResult.errors.length === 0) {
                  console.log('[info] Add to your shell rc: export PATH="$HOME/.local/bin:$PATH"');
                }
              }
            } catch (e) {
              console.log(`[info] ~/.local/bin symlink failed: ${e.message}`);
            }
          }

          // 5c. Windows: wrapper scripts in npm global bin directory
          if (!c4Registered && isWin) {
            try {
              const npmPrefix = execSync('npm config get prefix', {
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'pipe'],
                timeout: 10000
              }).trim();
              const npmBin = npmPrefix;

              const shScript = `#!/bin/sh\nexec node "${c4Cli}" "$@"\n`;
              const shPath = path.join(npmBin, 'c4');
              fs.mkdirSync(npmBin, { recursive: true });
              fs.writeFileSync(shPath, shScript, { mode: 0o755 });
              console.log(`[ok] wrapper: ${shPath}`);

              const cmdScript = `@node "${c4Cli}" %*\r\n`;
              const cmdPath = path.join(npmBin, 'c4.cmd');
              fs.writeFileSync(cmdPath, cmdScript);
              console.log(`[ok] wrapper: ${cmdPath}`);

              c4Registered = true;

              const pathDirs = (process.env.PATH || '').split(';');
              const normalizedBin = npmBin.replace(/\\/g, '/').toLowerCase();
              const inPath = pathDirs.some(d => d.replace(/\\/g, '/').toLowerCase() === normalizedBin);
              if (!inPath) console.log(`[info] Add to PATH: ${npmBin}`);
            } catch (e) {
              console.log(`[warn] wrapper creation failed: ${e.message}`);
            }
          }

          // 5d. Linux/macOS: auto-append alias to ~/.bashrc (secondary fallback)
          if (!c4Registered && !isWin) {
            try {
              const bashrc = path.join(home, '.bashrc');
              const aliasLine = `alias c4="node ${c4Cli}"`;
              let content = '';
              try { content = fs.readFileSync(bashrc, 'utf8'); } catch {}
              if (content.includes(aliasLine)) {
                console.log(`[ok] alias already in ${bashrc}`);
              } else {
                fs.appendFileSync(bashrc, `\n# c4 CLI (added by c4 init)\n${aliasLine}\n`);
                console.log(`[ok] alias appended to ${bashrc}`);
                console.log('  Run: source ~/.bashrc');
              }
              c4Registered = true;
            } catch (e) {
              console.log(`[warn] bashrc alias failed: ${e.message}`);
            }
          }

          // 5e. Final fallback: manual instructions
          if (!c4Registered) {
            console.log('[warn] Could not auto-register c4. Manual options:');
            if (isWin) {
              console.log(`  alias: doskey c4=node "${c4Cli}" $*`);
            } else {
              console.log(`  symlink: ln -sf "${c4Cli}" ~/.local/bin/c4 && chmod +x "${c4Cli}"`);
              console.log(`  alias:   echo 'alias c4="node ${c4Cli}"' >> ~/.bashrc && source ~/.bashrc`);
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

        // 6. Git identity check/setup (7.25)
        try {
          const { ensureIdentity } = require('./git-identity');
          await ensureIdentity();
        } catch (e) {
          console.log(`[warn] git identity: ${e.message}`);
        }

        // 7. Web UI external-access prompt (8.10)
        try {
          const {
            detectLanIP,
            enableViteExternal,
            setDaemonBindHost,
          } = require('./web-external');

          let enableExternal = false;

          if (args.includes('--yes-external')) {
            enableExternal = true;
          } else if (args.includes('--no-external')) {
            enableExternal = false;
          } else if (process.stdin.isTTY) {
            const readline = require('readline');
            const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
            const answer = await new Promise((resolve) => {
              rl.question('Enable Web UI external (LAN) access? (y/N): ', (a) => { rl.close(); resolve(a); });
            });
            enableExternal = /^y(es)?$/i.test((answer || '').trim());
          } else {
            console.log('[info] Web UI external access: non-TTY, skipped (use --yes-external to force)');
          }

          if (enableExternal) {
            const viteCfg = path.join(repoRoot, 'web', 'vite.config.ts');
            const viteRes = enableViteExternal(viteCfg);
            if (viteRes.result === 'updated') console.log(`[ok] vite.config.ts: host 0.0.0.0 enabled`);
            else if (viteRes.result === 'already-present') console.log('[ok] vite.config.ts: host already configured');
            else console.log(`[warn] vite.config.ts: ${viteRes.error}`);

            const cfgRes = setDaemonBindHost(configDst, '0.0.0.0');
            if (cfgRes.result === 'updated') console.log('[ok] config.json: daemon.bindHost = 0.0.0.0');
            else if (cfgRes.result === 'already-present') console.log('[ok] config.json: daemon.bindHost already 0.0.0.0');
            else console.log(`[warn] config.json: ${cfgRes.error}`);

            const ip = detectLanIP();
            if (ip) {
              console.log(`\nWeb UI:   http://${ip}:5173/  (run: npm --prefix ${path.join(repoRoot, 'web')} run dev -- --host 0.0.0.0)`);
              console.log(`Daemon:   http://${ip}:3456/  (run: c4 daemon restart)`);
            } else {
              console.log('\nWeb UI:   http://<this-machine-ip>:5173/  (run: npm --prefix web run dev)');
              console.log('Daemon:   http://<this-machine-ip>:3456/  (run: c4 daemon restart)');
            }
            console.log('[warn] External access enabled. Review firewall + auth (JWT planned in 8.1).');
            console.log('[info] Run `c4 daemon restart` to rebind the daemon to 0.0.0.0.');
          }
        } catch (e) {
          console.log(`[warn] web-external: ${e.message}`);
        }

        // 8. Build web UI if web/dist missing (8.12)
        try {
          const { webDistExists } = require('./static-server');
          const webDir = path.join(repoRoot, 'web');
          if (fs.existsSync(webDir) && !webDistExists(path.join(webDir, 'dist'))) {
            console.log('\n[info] web/dist not found — building now (npm run build:web)');
            try {
              execSync('npm run build:web', {
                cwd: repoRoot,
                stdio: 'inherit',
                timeout: 300000,
              });
              console.log('[ok] web UI build complete');
            } catch (buildErr) {
              console.log('[warn] web UI build failed — run `npm run build:web` manually');
              console.log(`       (${buildErr.message.split('\n')[0]})`);
            }
          }
        } catch (e) {
          console.log(`[warn] web build check: ${e.message}`);
        }

        console.log('\nc4 init complete!');

        // 6. Guide: manager mode start (7.14)
        const managerAgentPath = path.join(repoRoot, '.claude', 'agents', 'manager.md').replace(/\\/g, '/');
        if (fs.existsSync(managerAgentPath)) {
          console.log('\nTo start in manager mode:');
          console.log(`  claude --agent ${managerAgentPath} --model opus --effort max --name c4-manager`);
        }
        return;
      }

      case 'validation': {
        const name = args[0];
        if (!name) {
          console.error('Usage: c4 validation <worker-name>');
          process.exit(1);
        }
        result = await request('GET', `/worker/${encodeURIComponent(name)}/validation`);
        break;
      }

      case 'merge': {
        const { execSync } = require('child_process');
        const path = require('path');
        const mergeGuard = require('./merge-guard');
        const mergeCore = require('./merge-core');
        const slackEventsMod = require('./slack-events');
        const skipChecks = args.includes('--skip-checks');
        const autoStash = args.includes('--auto-stash');
        const pushAfter = args.includes('--push');
        const target = args.filter(a => a !== '--skip-checks' && a !== '--auto-stash' && a !== '--push')[0];

        if (!target) {
          console.error('Usage: c4 merge <worker-name|branch-name> [--skip-checks] [--auto-stash] [--push]');
          process.exit(1);
        }

        // Require git identity before merging (7.25).
        // Must not suggest env-prefix workarounds here: those trigger Bash
        // permission prompts that halt automated nightly runs.
        const { identityComplete, missingIdentityKeys } = require('./git-identity');
        if (!identityComplete()) {
          const missing = missingIdentityKeys();
          console.error(`Error: git ${missing.join(' and ')} not set. Run one of:`);
          console.error('  c4 init');
          console.error('  git config --global user.name "Your Name"');
          console.error('  git config --global user.email "you@example.com"');
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
        const worktreePath = path.resolve(repoRoot, '..', `c4-worktree-${target}`);
        const resolvedBranch = mergeCore.resolveBranchForWorker(target, repoRoot);
        const branch = resolvedBranch;
        if (branch !== target) {
          console.log(`Worker "${target}" -> branch "${branch}"`);
        }

        // Dirty-tree guard (7.28). Runs before any other pre-merge work so
        // automated runs do not enter the stash/pop dance unexpectedly.
        // Must precede runPreMergeChecks because we don't want the shared
        // module to have to care about stash semantics.
        let stashedLabel = null;
        try {
          const dirty = mergeGuard.getDirtyEntries(repoRoot);
          if (dirty.length > 0) {
            if (!autoStash) {
              console.error(mergeGuard.buildDirtyMessage(dirty));
              process.exit(1);
            }
            stashedLabel = `c4-merge-autostash-${target}`;
            const stashOut = mergeGuard.stashPush(repoRoot, stashedLabel);
            console.log(`Stashed ${dirty.length} change(s) as "${stashedLabel}":`);
            if (stashOut) console.log(`  ${stashOut}`);
          }
        } catch (e) {
          console.error(e.message);
          process.exit(1);
        }

        // Pre-merge checks via shared module so CLI + daemon stay in sync.
        // CLI still prints a per-check progress line; the shared module
        // returns a structured reasons[] we format here. npm test and the
        // package-deps-installed probe stay in the CLI because they have
        // side effects (actual install) we don't want to run from the
        // daemon context.
        const validationLib = require('./validation');
        const preChecks = mergeCore.runPreMergeChecks(branch, { skipChecks, repoRoot });
        if (!preChecks.passed) {
          const branchMissing = preChecks.reasons.some(r => r.check === 'branch-exists' && r.status === 'FAIL');
          if (branchMissing) {
            console.error(`Error: branch "${branch}" does not exist`);
            process.exit(1);
          }
          const notMain = preChecks.reasons.find(r => r.check === 'on-main' && r.status === 'FAIL');
          if (notMain) {
            console.error(`Error: ${notMain.detail}`);
            process.exit(1);
          }
          const mainItself = preChecks.reasons.find(r => r.check === 'not-main' && r.status === 'FAIL');
          if (mainItself) {
            console.error(`Error: ${mainItself.detail}`);
            process.exit(1);
          }
        }

        if (skipChecks) {
          console.log(`\nSkipping pre-merge checks (--skip-checks).\nMerging...\n`);
        } else {
          console.log(`\nPre-merge checks for branch "${branch}":\n`);

          let allPassed = preChecks.passed;
          let npmTestCount = null;

          // Render reasons from merge-core so CLI and daemon mirror each
          // other. Filter out the structural checks already enforced
          // above (branch-exists / on-main / not-main) — those only show
          // up on FAIL and we exited there.
          const RENDERABLE = new Set(['validation.test_passed', 'TODO.md', 'CHANGELOG.md']);
          for (const r of preChecks.reasons) {
            if (!RENDERABLE.has(r.check)) continue;
            const label = r.check === 'validation.test_passed' ? 'validation.test_passed'
              : r.check === 'TODO.md' ? 'TODO.md modified'
              : 'CHANGELOG.md modified';
            process.stdout.write(`  [check] ${label} ... `);
            if (r.status === 'PASS') {
              console.log(r.detail ? `PASS (${r.detail})` : 'PASS');
            } else if (r.status === 'SKIP') {
              console.log(r.detail ? `SKIP (${r.detail})` : 'SKIP');
            } else {
              console.log('FAIL');
              if (r.detail) console.error(`    ${r.detail}`);
              allPassed = false;
            }
          }

          // Local-only check: run npm test and compare against validation.
          process.stdout.write('  [check] npm test ... ');
          let validationObj = null;
          try {
            const fsRef = require('fs');
            if (fsRef.existsSync(worktreePath)) {
              validationObj = validationLib.captureValidation(worktreePath, branch);
            }
          } catch {}
          try {
            const pkg = JSON.parse(require('fs').readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
            if (pkg.scripts && pkg.scripts.test) {
              const testOut = execSync('npm test', {
                cwd: repoRoot, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
              });
              npmTestCount = validationLib.extractNpmTestCount(testOut);
              console.log(npmTestCount !== null ? `PASS (${npmTestCount} passed)` : 'PASS');
            } else {
              console.log('SKIP (no test script)');
            }
          } catch (e) {
            const merged = String((e && e.stdout) || '') + String((e && e.stderr) || '');
            if (merged) npmTestCount = validationLib.extractNpmTestCount(merged);
            console.log('FAIL');
            console.error('    Tests failed. Fix tests before merging.');
            allPassed = false;
          }

          if (validationObj && npmTestCount !== null) {
            process.stdout.write('  [check] validation.test_count matches npm test ... ');
            const gate = validationLib.checkPreMerge(validationObj, { npmTestCount });
            if (gate.ok) {
              console.log(`PASS (${validationObj.test_count} == ${npmTestCount})`);
            } else if (gate.reason === 'test-count-mismatch') {
              console.log('FAIL');
              console.error(`    ${gate.detail}`);
              allPassed = false;
            } else {
              console.log(`SKIP (${gate.reason})`);
            }
          }

          process.stdout.write('  [check] package-deps-installed ... ');
          try {
            const baseSha = execSync(`git merge-base main "${branch}"`, {
              cwd: repoRoot, encoding: 'utf8',
            }).trim();
            const headSha = execSync(`git rev-parse "${branch}"`, {
              cwd: repoRoot, encoding: 'utf8',
            }).trim();
            const depResult = validationLib.checkPackageDepsInstalled({
              baseSha, headSha, repoRoot,
            });
            if (depResult.ok && depResult.skipped) {
              console.log(`SKIP (${depResult.reason})`);
            } else if (depResult.ok) {
              const added = depResult.detect && depResult.detect.deps
                ? depResult.detect.deps.map(d => d.name).join(', ')
                : '';
              console.log(`PASS${added ? ` (verified: ${added})` : ''}`);
            } else {
              console.log('FAIL');
              console.error(`    ${depResult.reason}`);
              if (depResult.detail) console.error(depResult.detail);
              allPassed = false;
            }
          } catch (e) {
            console.log(`FAIL (${e.message})`);
            allPassed = false;
          }

          if (!allPassed) {
            console.log('\nMerge REJECTED - fix the above issues first.');
            process.exit(1);
          }

          console.log('\nAll checks passed. Merging...\n');
        }
        // (8.15) Load the daemon's Slack config so the CLI's merge/push
        // events ride the same emitter config the daemon uses. Best-effort:
        // if the config file is absent or unreadable, we just skip the
        // emit — merge behaviour itself stays untouched.
        let cliSlackEmit = () => {};
        try {
          const cfgPath = path.resolve(__dirname, '..', 'config.json');
          let slackCfg = {};
          if (require('fs').existsSync(cfgPath)) {
            const parsed = JSON.parse(require('fs').readFileSync(cfgPath, 'utf8'));
            slackCfg = (parsed && parsed.slack) || {};
          }
          const emitter = new slackEventsMod.SlackEventEmitter({ config: slackCfg });
          cliSlackEmit = (type, payload) => {
            try {
              const p = emitter.emit(type, payload);
              if (p && typeof p.catch === 'function') p.catch(() => {});
            } catch {}
          };
        } catch { cliSlackEmit = () => {}; }
        const mergeOutcome = mergeCore.performMerge(branch, { repoRoot, emit: cliSlackEmit });
        if (!mergeOutcome.success) {
          console.error('Merge failed:', mergeOutcome.error);
          if (stashedLabel) {
            console.error(`Note: --auto-stash saved your changes as "${stashedLabel}".`);
            console.error('Run `git stash list` then `git stash pop` after resolving the merge issue.');
          }
          process.exit(1);
        }
        if (mergeOutcome.summary) console.log(mergeOutcome.summary);
        console.log(`Merge complete: ${branch} -> main`);

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

        // Auto-stash pop (7.28). Runs only when --auto-stash stashed changes.
        if (stashedLabel) {
          const popResult = mergeGuard.stashPop(repoRoot);
          if (popResult.status !== 0) {
            console.error(mergeGuard.buildPopConflictMessage(stashedLabel, popResult));
            process.exit(1);
          }
          console.log(`Stashed changes restored from "${stashedLabel}".`);
        }

        // (8.15) --push pushes main to origin and emits push_success.
        // Kept behind an opt-in flag so operators who never want the CLI
        // to touch the remote keep the previous behaviour.
        if (pushAfter) {
          process.stdout.write('  [push] origin main ... ');
          try {
            execSync('git push origin main', { cwd: repoRoot, encoding: 'utf8', stdio: 'pipe' });
            console.log('OK');
            cliSlackEmit('push_success', { branch, sha: mergeOutcome.sha });
          } catch (e) {
            console.log('FAIL');
            console.error(`    ${e.message}`);
            process.exit(1);
          }
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

      case 'attach': {
        // (8.17) External Claude session import.
        //   c4 attach <session-id-or-path> [--name alias]
        //   c4 attach list
        //   c4 attach detach <name>
        // Attaches a Claude Code JSONL transcript (by absolute path or
        // by session UUID under ~/.claude/projects) as a read-only
        // 'attached' worker. The daemon persists attachment records so
        // the Web UI viewer keeps seeing them across restarts.
        const sub = args[0] || '';
        if (sub === 'list') {
          result = await request('GET', '/attach/list');
          const sessions = Array.isArray(result && result.sessions) ? result.sessions : [];
          if (sessions.length === 0) {
            console.log('No attached sessions.');
            return;
          }
          console.log(`Attached sessions: ${sessions.length}`);
          for (const s of sessions) {
            const id = s.sessionId ? s.sessionId.slice(0, 8) : '-';
            const proj = s.projectPath || '-';
            console.log(`  ${s.name}  id=${id}  project=${proj}  path=${s.jsonlPath}`);
          }
          return;
        }
        if (sub === 'detach') {
          const name = args[1];
          if (!name) {
            console.error('Usage: c4 attach detach <name>');
            process.exit(1);
          }
          result = await request('DELETE', `/attach/${encodeURIComponent(name)}`);
          if (result && result.ok) {
            console.log(`Detached ${result.name || name}`);
            return;
          }
          console.log(result && result.error ? result.error : JSON.stringify(result));
          return;
        }
        // Default: c4 attach <session-id-or-path> [--name alias]
        if (!sub) {
          console.error('Usage: c4 attach <session-id-or-path> [--name alias]');
          console.error('       c4 attach list');
          console.error('       c4 attach detach <name>');
          process.exit(1);
        }
        let attachName = '';
        const rest = args.slice(1);
        for (let i = 0; i < rest.length; i++) {
          if (rest[i] === '--name' && rest[i + 1]) { attachName = rest[++i]; }
        }
        const isPathy = sub.includes('/') || sub.includes('\\') || sub.endsWith('.jsonl');
        const body = isPathy ? { path: sub } : { sessionId: sub };
        if (attachName) body.name = attachName;
        result = await request('POST', '/attach', body);
        if (result && result.name) {
          const tok = result.tokens || { input: 0, output: 0 };
          console.log(`Attached as ${result.name}`);
          console.log(`  sessionId: ${result.sessionId || '-'}`);
          console.log(`  project:   ${result.projectPath || '-'}`);
          console.log(`  turns:     ${result.turns || 0}`);
          console.log(`  tokens:    ${tok.input || 0} in / ${tok.output || 0} out`);
          if (result.model) console.log(`  model:     ${result.model}`);
          if (result.warnings) console.log(`  warnings:  ${result.warnings}`);
          return;
        }
        if (result && result.error) {
          console.error(result.error);
          process.exit(1);
        }
        break;
      }

      case 'events': {
        // (10.9) Scribe v2 structured event log query.
        //   c4 events [--from ISO] [--to ISO] [--type T[,T...]] [--worker W[,W...]]
        //             [--limit N] [--reverse] [--json]
        //   c4 events --around <id|ISO> [--window N]
        //
        // The --around form pulls the surrounding context for an error id
        // or a timestamp; default window is +/- 5 minutes. Without --json
        // events print one per line in a fixed human-friendly layout so
        // the output stays tail-able.
        let from = '', to = '', types = '', workers = '';
        let limit = 0;
        let reverse = false;
        let jsonOut = false;
        let around = '';
        let window = 5;
        for (let i = 0; i < args.length; i++) {
          if (args[i] === '--from' && args[i + 1]) from = args[++i];
          else if (args[i] === '--to' && args[i + 1]) to = args[++i];
          else if (args[i] === '--type' && args[i + 1]) types = args[++i];
          else if (args[i] === '--worker' && args[i + 1]) workers = args[++i];
          else if (args[i] === '--limit' && args[i + 1]) {
            const n = parseInt(args[++i], 10);
            if (Number.isFinite(n) && n > 0) limit = n;
          } else if (args[i] === '--reverse') reverse = true;
          else if (args[i] === '--json') jsonOut = true;
          else if (args[i] === '--around' && args[i + 1]) around = args[++i];
          else if (args[i] === '--window' && args[i + 1]) {
            const w = Number(args[++i]);
            if (Number.isFinite(w) && w >= 0) window = w;
          }
        }

        let events = [];
        if (around) {
          const qs = new URLSearchParams();
          qs.set('target', around);
          qs.set('minutesBefore', String(window));
          qs.set('minutesAfter', String(window));
          const resp = await request('GET', '/events/context?' + qs.toString());
          if (resp && resp.error) {
            console.error(`Error: ${resp.error}`);
            process.exit(1);
          }
          events = (resp && resp.events) || [];
        } else {
          const qs = new URLSearchParams();
          if (from) qs.set('from', from);
          if (to) qs.set('to', to);
          if (types) qs.set('types', types);
          if (workers) qs.set('workers', workers);
          if (limit > 0) qs.set('limit', String(limit));
          if (reverse) qs.set('reverse', '1');
          const qsStr = qs.toString();
          const resp = await request('GET', '/events/query' + (qsStr ? '?' + qsStr : ''));
          if (resp && resp.error) {
            console.error(`Error: ${resp.error}`);
            process.exit(1);
          }
          events = (resp && resp.events) || [];
        }

        if (jsonOut) {
          for (const ev of events) console.log(JSON.stringify(ev));
          return;
        }
        if (events.length === 0) {
          console.log('No events.');
          return;
        }
        for (const ev of events) {
          const worker = ev.worker ? ev.worker : '-';
          const payload = ev.payload && typeof ev.payload === 'object'
            ? Object.entries(ev.payload)
                .filter(([, v]) => v != null && v !== '')
                .map(([k, v]) => {
                  const s = typeof v === 'string' ? v : JSON.stringify(v);
                  const short = s.length > 120 ? s.slice(0, 120) + '...' : s;
                  return `${k}=${short}`;
                })
                .join(' ')
            : '';
          console.log(`${ev.ts}  ${ev.type.padEnd(16)} ${worker.padEnd(14)} ${payload}`);
        }
        return;
      }

      case 'chat': {
        // (11.4) Natural-language chat.
        //   c4 chat "query text"        one-shot query
        //   c4 chat --interactive       REPL (readline)
        //   c4 chat sessions            list stored sessions
        //   c4 chat history <id>        dump a session's messages
        const sub = args[0];
        const sessionFile = require('path').join(require('os').homedir(), '.c4-nl-session');
        function readPinnedSession() {
          try { return require('fs').readFileSync(sessionFile, 'utf8').trim() || null; }
          catch { return null; }
        }
        function writePinnedSession(id) {
          try { require('fs').writeFileSync(sessionFile, String(id || '')); } catch {}
        }

        if (sub === 'sessions') {
          result = await request('GET', '/nl/sessions');
          if (result.sessions) {
            if (result.sessions.length === 0) {
              console.log('No chat sessions.');
              return;
            }
            for (const s of result.sessions) {
              console.log(`${s.id}  messages=${s.messageCount}  lastWorker=${s.lastWorker || '-'}  updated=${s.updatedAt || '-'}`);
            }
            return;
          }
          break;
        }
        if (sub === 'history') {
          const id = args[1];
          if (!id) {
            console.error('Usage: c4 chat history <sessionId>');
            process.exit(1);
          }
          result = await request('GET', `/nl/sessions/${encodeURIComponent(id)}`);
          if (result.error) break;
          const history = Array.isArray(result.history) ? result.history : [];
          if (history.length === 0) {
            console.log('(empty session)');
          } else {
            for (const m of history) {
              console.log(`[${m.role}] ${m.text}`);
            }
          }
          return;
        }
        if (sub === '--interactive' || sub === '-i') {
          const readline = require('readline');
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
          let sessionId = readPinnedSession();
          console.log('c4 chat (interactive). Type "exit" or "quit" to leave.');
          process.stdout.write('> ');
          rl.on('line', async (line) => {
            const text = (line || '').trim();
            if (!text) { process.stdout.write('> '); return; }
            if (text === 'exit' || text === 'quit') { rl.close(); return; }
            try {
              const out = await request('POST', '/nl/chat', { sessionId, text });
              if (out.error) {
                console.error('Error:', out.error);
              } else {
                if (out.sessionId) {
                  sessionId = out.sessionId;
                  writePinnedSession(sessionId);
                }
                console.log(out.response || '(no response)');
              }
            } catch (e) {
              console.error('Error:', e.message);
            }
            process.stdout.write('> ');
          });
          rl.on('close', () => {
            console.log('\nbye.');
            process.exit(0);
          });
          return;
        }
        const text = args.join(' ').trim();
        if (!text) {
          console.error('Usage: c4 chat "query" | c4 chat --interactive | c4 chat sessions | c4 chat history <id>');
          process.exit(1);
        }
        let sessionId = readPinnedSession();
        result = await request('POST', '/nl/chat', { sessionId, text });
        if (result.error) break;
        if (result.sessionId) writePinnedSession(result.sessionId);
        console.log(result.response || '(no response)');
        return;
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
        const perTask = args.includes('--per-task');
        const qs = perTask ? '?perTask=1' : '';
        result = await request('GET', `/token-usage${qs}`);
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
          if (perTask && Array.isArray(result.perTask)) {
            console.log('  Per-task:');
            if (result.perTask.length === 0) {
              console.log('    (no active workers)');
            } else {
              for (const row of result.perTask) {
                const budget = row.budgetUsd > 0 ? ` budget=$${row.budgetUsd}` : '';
                const retries = row.maxRetries > 0 ? ` retries=${row.retryCount}/${row.maxRetries}` : '';
                const stop = row.stopReason ? ` STOPPED(${row.stopReason})` : '';
                const live = row.alive ? 'live' : 'exited';
                console.log(`    ${row.name} [${live}] tokens=${row.total.toLocaleString()} (in=${row.input.toLocaleString()} out=${row.output.toLocaleString()})${budget}${retries}${stop}`);
                if (row.task) {
                  const preview = row.task.length > 70 ? row.task.slice(0, 70) + '...' : row.task;
                  console.log(`      task: ${preview}`);
                }
              }
            }
          }
        }
        return;
      }

      case 'quota': {
        // (8.3) c4 quota [tier]  — show daily token quota usage per tier.
        const requestedTier = args[0] && !args[0].startsWith('--') ? args[0] : '';
        const route = requestedTier ? `/quota/${encodeURIComponent(requestedTier)}` : '/quota';
        result = await request('GET', route);
        if (result.error) {
          console.log(`Error: ${result.error}`);
          if (Array.isArray(result.allowed)) console.log(`  Allowed tiers: ${result.allowed.join(', ')}`);
        } else if (requestedTier) {
          const fmtRem = result.remaining < 0 ? 'unlimited' : result.remaining.toLocaleString();
          console.log(`Tier quota (${result.date}) — ${result.tier}:`);
          console.log(`  Daily limit: ${result.dailyTokens.toLocaleString()} tokens`);
          console.log(`  Models:      ${result.models.join(', ')}`);
          console.log(`  Used:        ${result.used.toLocaleString()} tokens`);
          console.log(`  Remaining:   ${fmtRem}`);
        } else {
          console.log(`Tier quota (${result.date}):`);
          for (const t of Object.keys(result.tiers)) {
            const d = result.tiers[t];
            const fmtRem = d.remaining < 0 ? 'unlimited' : d.remaining.toLocaleString();
            console.log(`  ${t.padEnd(8)} used=${d.used.toLocaleString().padStart(8)} / ${d.dailyTokens.toLocaleString()} (remaining=${fmtRem}) models=[${d.models.join(', ')}]`);
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

      case 'slack': {
        // (8.15) Slack autonomous event emitter CLI.
        //   c4 slack test [--type <eventType>] [--worker <name>] [--message <text>]
        //   c4 slack status [--limit N]
        const sub = args[0];
        if (!sub || (sub !== 'test' && sub !== 'status')) {
          console.log('Usage: c4 slack <test|status>');
          console.log('  test [--type <eventType>] [--worker <name>] [--message <text>]');
          console.log('  status [--limit N]');
          return;
        }
        if (sub === 'test') {
          let evType = 'task_start';
          let worker = 'c4-cli';
          let message = 'slack event emitter test';
          for (let i = 1; i < args.length; i++) {
            if (args[i] === '--type' && args[i + 1]) { evType = args[++i]; }
            else if (args[i] === '--worker' && args[i + 1]) { worker = args[++i]; }
            else if (args[i] === '--message' && args[i + 1]) { message = args[++i]; }
          }
          result = await request('POST', '/slack/emit', {
            eventType: evType,
            payload: { worker, message, test: true },
          });
          if (result && result.error) {
            console.error(`Error: ${result.error}`);
            if (Array.isArray(result.allowed)) {
              console.error('  allowed types: ' + result.allowed.join(', '));
            }
            process.exit(1);
          }
          if (result && result.sent === false) {
            console.log(`[skip] ${result.reason}${result.eventType ? ' (' + result.eventType + ')' : ''}`);
          } else if (result && result.sent) {
            const wh = result.webhook || {};
            const okBit = wh.ok ? 'OK' : (wh.reason || wh.error || 'no-webhook');
            console.log(`[ok] emitted ${result.eventType} level=${result.level} webhook=${okBit}`);
          } else {
            console.log(JSON.stringify(result));
          }
          return;
        }
        // sub === 'status'
        let limit = 0;
        for (let i = 1; i < args.length; i++) {
          if (args[i] === '--limit' && args[i + 1]) { limit = parseInt(args[++i], 10) || 0; }
        }
        const qs = limit > 0 ? `?limit=${limit}` : '';
        result = await request('GET', '/slack/events' + qs);
        if (result && result.error) {
          console.error(`Error: ${result.error}`);
          process.exit(1);
        }
        const cfg = (result && result.config) || {};
        console.log('Slack event emitter:');
        console.log(`  enabled:        ${cfg.enabled}`);
        console.log(`  webhookUrl:     ${cfg.webhookUrl ? '(set)' : '(not set)'}`);
        console.log(`  minLevel:       ${cfg.minLevel}`);
        console.log(`  dedupeWindowMs: ${cfg.dedupeWindowMs}`);
        console.log(`  events:         ${(cfg.events || []).join(', ')}`);
        const events = Array.isArray(result && result.events) ? result.events : [];
        console.log(`Recent events (${events.length}):`);
        for (const ev of events.slice(-20)) {
          const when = ev.ts ? new Date(ev.ts).toISOString() : '?';
          console.log(`  [${ev.level}] ${when} ${ev.eventType} ${ev.message || ''}`);
        }
        return;
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

      case 'plan-update': {
        // (9.12) Worker flags its current plan as needing revision.
        // Optional flags: --replan invokes the planner factory to produce a
        // new revision file; --redispatch re-sends the revised plan back to
        // the worker. Without --replan the command just appends a
        // "Needs Revision" block to the existing plan document.
        const name = args[0];
        let reason = '', evidence = '', replan = false, redispatch = false;
        for (let i = 1; i < args.length; i++) {
          if (args[i] === '--reason' && args[i + 1]) { reason = args[++i]; }
          else if (args[i] === '--evidence' && args[i + 1]) { evidence = args[++i]; }
          else if (args[i] === '--replan') { replan = true; }
          else if (args[i] === '--redispatch') { replan = true; redispatch = true; }
        }
        if (!name || !reason) {
          console.error('Usage: c4 plan-update <name> --reason <text> [--evidence <text>] [--replan] [--redispatch]');
          process.exit(1);
        }
        result = await request('POST', '/plan-update', { name, reason, evidence, replan, redispatch });
        break;
      }

      case 'plan-revisions': {
        // (9.12) Show every plan revision recorded for a worker.
        const name = args[0];
        if (!name) {
          console.error('Usage: c4 plan-revisions <name>');
          process.exit(1);
        }
        result = await request('GET', `/plan-revisions?name=${encodeURIComponent(name)}`);
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

      case 'recover': {
        // 8.4: manual intelligent-recovery pass. Classifies the worker's
        // recent scrollback, picks a strategy, and re-sends a transformed
        // task. Never destructive: no close / rollback / skip-checks.
        const name = args[0];
        if (!name) {
          console.error('Usage: c4 recover <worker-name> [--category <name>] [--history]');
          console.error('  --category  Force a classification category (test-fail | build-fail | tool-deny | timeout | dependency | unknown).');
          console.error('  --history   Show recent recovery history instead of running a pass.');
          process.exit(1);
        }
        let category = '';
        let showHistory = false;
        let historyLimit = 20;
        for (let i = 1; i < args.length; i++) {
          if (args[i] === '--category' && args[i + 1]) { category = args[++i]; }
          else if (args[i] === '--history') { showHistory = true; }
          else if (args[i] === '--limit' && args[i + 1]) { historyLimit = parseInt(args[++i], 10) || 20; }
        }
        if (showHistory) {
          const qs = new URLSearchParams();
          qs.set('name', name);
          qs.set('limit', String(historyLimit));
          result = await request('GET', `/recovery-history?${qs.toString()}`);
          const records = (result && result.records) || [];
          if (records.length === 0) {
            console.log(`No recovery history for '${name}'.`);
          } else {
            console.log(`Recovery history for '${name}' (${records.length} entries):`);
            for (const r of records) {
              const parts = [r.time, `attempt=${r.attempt || 0}`, `category=${r.category || '-'}`, `strategy=${r.strategy || '-'}`, `phase=${r.phase || '-'}`];
              if (r.error) parts.push(`error=${String(r.error).slice(0, 120)}`);
              console.log('  ' + parts.join(' '));
            }
          }
          return;
        }
        result = await request('POST', '/recover', { name, category: category || undefined });
        if (result.error) break;
        if (result.skipped) {
          console.log(`Recovery skipped for '${name}': ${result.reason}`);
          return;
        }
        const lines = [
          `Recovery pass for '${name}':`,
          `  strategy: ${result.strategy || '-'}`,
          `  category: ${result.category || '-'}`,
          `  attempt:  ${result.attempt || '-'}`,
          `  action:   ${result.action || '-'}`,
          `  recovered: ${result.recovered ? 'yes' : 'no'}`,
        ];
        if (result.error) lines.push(`  error:    ${result.error}`);
        if (result.historyPath) lines.push(`  history:  ${result.historyPath}`);
        console.log(lines.join('\n'));
        return;
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

      case 'watch': {
        // Real-time worker output streaming (5.42)
        const name = args[0];
        if (!name) {
          console.error('Usage: c4 watch <name>');
          process.exit(1);
        }

        const watchUrl = new URL(`/watch?name=${encodeURIComponent(name)}`, BASE);
        const watchReq = http.get(watchUrl, (res) => {
          if (res.statusCode !== 200) {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
              try {
                const err = JSON.parse(data);
                console.error(`Error: ${err.error || data}`);
              } catch { console.error(`Error: ${data}`); }
              process.exit(1);
            });
            return;
          }

          process.stderr.write(`Watching worker '${name}' (Ctrl+C to stop)...\n`);

          let buffer = '';
          res.on('data', (chunk) => {
            buffer += chunk;
            const lines = buffer.split('\n');
            buffer = lines.pop();
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const event = JSON.parse(line.slice(6));
                  if (event.type === 'output') {
                    process.stdout.write(Buffer.from(event.data, 'base64'));
                  } else if (event.type === 'error') {
                    console.error(`Error: ${event.error}`);
                    process.exit(1);
                  }
                } catch {}
              }
            }
          });

          res.on('end', () => {
            process.stderr.write('\n--- stream ended ---\n');
            process.exit(0);
          });
        });

        watchReq.on('error', (err) => {
          console.error(`Error: ${err.message}`);
          process.exit(1);
        });

        process.on('SIGINT', () => {
          watchReq.destroy();
          process.stderr.write('\n');
          process.exit(0);
        });

        return;
      }

      case 'mcp': {
        // MCP stdio transport proxy (TODO 9.4) + MCP Hub (TODO 11.1).
        //
        // Hub subcommands (11.1) manage the shared server registry that
        // profiles reference by name:
        //   c4 mcp list [--enabled] [--disabled] [--transport T]
        //   c4 mcp add --name N --command CMD [--args 'a,b,c'] [--env 'K=V,K2=V2'] [--transport stdio|http] [--description D] [--disabled]
        //   c4 mcp show <name>
        //   c4 mcp enable <name>
        //   c4 mcp disable <name>
        //   c4 mcp remove <name>
        //   c4 mcp test <name>
        //
        // Stdio proxy subcommands (9.4) bridge JSON-RPC over the
        // daemon's POST /mcp endpoint so Claude Desktop can launch
        // `c4 mcp start` as an MCP server:
        //   c4 mcp start [--base URL]
        //   c4 mcp status
        //   c4 mcp tools
        const sub = args[0] || 'start';
        const hubSubs = ['list', 'add', 'show', 'enable', 'disable', 'remove', 'test'];

        if (hubSubs.includes(sub)) {
          function flagAt(startIdx, flag) {
            for (let i = startIdx; i < args.length - 1; i++) {
              if (args[i] === flag) return args[i + 1];
            }
            return '';
          }
          function hasFlag(startIdx, flag) {
            for (let i = startIdx; i < args.length; i++) {
              if (args[i] === flag) return true;
            }
            return false;
          }

          if (sub === 'list') {
            const qs = [];
            if (hasFlag(1, '--enabled')) qs.push('enabled=true');
            if (hasFlag(1, '--disabled')) qs.push('enabled=false');
            const transport = flagAt(1, '--transport');
            if (transport) qs.push('transport=' + encodeURIComponent(transport));
            const query = qs.length > 0 ? '?' + qs.join('&') : '';
            result = await request('GET', '/mcp/servers' + query);
          } else if (sub === 'add') {
            const name = flagAt(1, '--name');
            const command = flagAt(1, '--command');
            const argsStr = flagAt(1, '--args');
            const envStr = flagAt(1, '--env');
            const transport = flagAt(1, '--transport');
            const description = flagAt(1, '--description');
            if (!name || !command) {
              console.error("Usage: c4 mcp add --name N --command CMD [--args 'a,b,c'] [--env 'K=V,K2=V2'] [--transport stdio|http] [--description D] [--disabled]");
              process.exit(1);
            }
            const body = { name, command };
            if (argsStr) {
              body.args = argsStr.split(',').map((a) => a.trim()).filter((a) => a.length > 0);
            }
            if (envStr) {
              const env = {};
              for (const pair of envStr.split(',')) {
                const trimmed = pair.trim();
                if (!trimmed) continue;
                const eq = trimmed.indexOf('=');
                if (eq <= 0) continue;
                env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
              }
              body.env = env;
            }
            if (transport) body.transport = transport;
            if (description) body.description = description;
            if (hasFlag(1, '--disabled')) body.enabled = false;
            result = await request('POST', '/mcp/servers', body);
          } else if (sub === 'show') {
            const name = args[1];
            if (!name) { console.error('Usage: c4 mcp show <name>'); process.exit(1); }
            result = await request('GET', '/mcp/servers/' + encodeURIComponent(name));
          } else if (sub === 'enable') {
            const name = args[1];
            if (!name) { console.error('Usage: c4 mcp enable <name>'); process.exit(1); }
            result = await request('POST', '/mcp/servers/' + encodeURIComponent(name) + '/enable', {});
          } else if (sub === 'disable') {
            const name = args[1];
            if (!name) { console.error('Usage: c4 mcp disable <name>'); process.exit(1); }
            result = await request('POST', '/mcp/servers/' + encodeURIComponent(name) + '/disable', {});
          } else if (sub === 'remove') {
            const name = args[1];
            if (!name) { console.error('Usage: c4 mcp remove <name>'); process.exit(1); }
            result = await request('DELETE', '/mcp/servers/' + encodeURIComponent(name));
          } else if (sub === 'test') {
            const name = args[1];
            if (!name) { console.error('Usage: c4 mcp test <name>'); process.exit(1); }
            result = await request('POST', '/mcp/servers/' + encodeURIComponent(name) + '/test', {});
          }

          if (result && result.error) {
            console.error('Error: ' + result.error);
            process.exit(1);
          }
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        if (sub === 'start') {
          const { startStdio } = require('./mcp-server');
          const baseIdx = args.indexOf('--base');
          const base = baseIdx >= 0 && args[baseIdx + 1] ? args[baseIdx + 1] : BASE;
          await startStdio({ base });
          return;
        }
        if (sub === 'status') {
          try {
            result = await request('POST', '/mcp', {
              jsonrpc: '2.0', id: 1, method: 'initialize',
              params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'c4 mcp status', version: '1' } },
            });
            if (result && result.result && result.result.serverInfo) {
              console.log(`MCP reachable (protocol ${result.result.protocolVersion}, server ${result.result.serverInfo.name} ${result.result.serverInfo.version})`);
            } else {
              console.log('MCP endpoint reachable but initialize did not return serverInfo.');
              console.log(JSON.stringify(result, null, 2));
            }
          } catch (err) {
            console.error(`MCP unreachable: ${err.message}`);
            process.exit(1);
          }
          return;
        }
        if (sub === 'tools') {
          result = await request('POST', '/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list' });
          break;
        }
        console.log('Usage: c4 mcp <start|status|tools|list|add|show|enable|disable|remove|test> [flags]');
        console.log('  Stdio proxy: c4 mcp <start|status|tools> [--base URL]');
        console.log('  Hub: c4 mcp list [--enabled] [--disabled] [--transport T]');
        console.log("       c4 mcp add --name N --command CMD [--args 'a,b,c'] [--env 'K=V,K2=V2']");
        console.log('             [--transport stdio|http] [--description D] [--disabled]');
        console.log('       c4 mcp <show|enable|disable|remove|test> <name>');
        return;
      }

      case 'dispatch': {
        // Fleet task distribution (9.7). Forwards to POST /dispatch on
        // the daemon which builds the placement plan and fans out the
        // /create + /task calls per slot.
        let count = 1, strategy = 'least-loaded', tagsRaw = '', branch = '', namePrefix = '';
        let profile = '', autoMode = false, dryRun = false, location = '';
        const taskParts = [];
        for (let i = 0; i < args.length; i++) {
          if (args[i] === '--count' && args[i + 1]) { count = parseInt(args[++i], 10) || 1; }
          else if (args[i] === '--strategy' && args[i + 1]) { strategy = args[++i]; }
          else if (args[i] === '--tags' && args[i + 1]) { tagsRaw = args[++i]; }
          else if (args[i] === '--branch' && args[i + 1]) { branch = args[++i]; }
          else if (args[i] === '--name' && args[i + 1]) { namePrefix = args[++i]; }
          else if (args[i] === '--profile' && args[i + 1]) { profile = args[++i]; }
          else if (args[i] === '--auto-mode') { autoMode = true; }
          else if (args[i] === '--dry-run') { dryRun = true; }
          else if (args[i] === '--location' && args[i + 1]) { location = args[++i]; }
          else { taskParts.push(args[i]); }
        }
        const task = taskParts.join(' ');
        if (!task) {
          console.error('Usage: c4 dispatch "<task>" [--count N] [--tags t1,t2] [--strategy least-loaded|tag-match|round-robin]');
          console.error('  Options: --branch <prefix> --name <prefix> --profile <name>');
          console.error('           --auto-mode --dry-run --location <alias>');
          process.exit(1);
        }
        const body = {
          task,
          count,
          strategy,
          tags: tagsRaw ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean) : [],
        };
        if (branch) body.branch = branch;
        if (namePrefix) body.namePrefix = namePrefix;
        if (profile) body.profile = profile;
        if (autoMode) body.autoMode = true;
        if (dryRun) body.dryRun = true;
        if (location) body.location = location;

        result = await request('POST', '/dispatch', body, 30000);
        if (result.error) {
          console.error(`Error: ${result.error}`);
          process.exit(1);
        }
        console.log(`Strategy: ${result.strategy}  Count: ${result.count}  Tags: ${(result.tags || []).join(',') || '-'}`);
        if (result.fallback) console.log(`Fallback: ${result.fallback}`);
        if (Array.isArray(result.samples) && result.samples.length > 0) {
          console.log('\nSAMPLES:');
          console.log('  ALIAS\t\tOK\tWORKERS\tTAGS\t\tELAPSED');
          for (const s of result.samples) {
            const ok = s.ok ? 'yes' : 'NO';
            const w = s.workers == null ? '?' : s.workers;
            const tg = (s.tags || []).join(',') || '-';
            console.log(`  ${s.alias}\t\t${ok}\t${w}\t${tg}\t\t${s.elapsedMs || 0}ms`);
          }
        }
        if (Array.isArray(result.plan) && result.plan.length > 0) {
          console.log('\nPLAN:');
          console.log('  SLOT\tNAME\t\tALIAS\t\tSTRATEGY\tSCORE');
          for (const p of result.plan) {
            const sc = p.score || {};
            const scoreStr = sc.tagMatches != null
              ? `matches=${sc.tagMatches}/${sc.tagWanted} workers=${sc.workers}`
              : `workers=${sc.workers}`;
            console.log(`  ${p.slot}\t${p.name}\t${p.machine.alias}\t\t${sc.strategy || strategy}\t${scoreStr}`);
          }
        }
        if (result.dryRun) {
          console.log('\n[dry-run] No workers created.');
        } else if (Array.isArray(result.created) && result.created.length > 0) {
          console.log('\nCREATED:');
          for (const c of result.created) {
            const status = c.ok ? 'ok' : `FAIL (${c.error || c.status || 'unknown'})`;
            console.log(`  ${c.name}\t-> ${c.alias}\t${status}`);
          }
        }
        return;
      }

      case 'send-file': {
        // Machine-to-machine rsync over ssh (9.8). Positional args:
        //   c4 send-file <alias> <localPath> <remotePath>
        // Flags: --delete / --exclude (repeatable) / --dry-run / --allow-system.
        const positional = [];
        const excludes = [];
        let deleteFlag = false, dryRun = false, allowSystem = false;
        for (let i = 0; i < args.length; i++) {
          if (args[i] === '--delete') deleteFlag = true;
          else if (args[i] === '--exclude' && args[i + 1]) excludes.push(args[++i]);
          else if (args[i] === '--dry-run') dryRun = true;
          else if (args[i] === '--allow-system') allowSystem = true;
          else positional.push(args[i]);
        }
        const [alias, localPath, remotePath] = positional;
        if (!alias || !localPath || !remotePath) {
          console.error('Usage: c4 send-file <alias> <localPath> <remotePath> [--delete] [--exclude pattern] [--dry-run] [--allow-system]');
          process.exit(1);
        }
        const body = {
          alias,
          type: 'rsync',
          src: localPath,
          dest: remotePath,
          opts: {
            excludes,
            delete: deleteFlag,
            dryRun,
            allowSystem,
          },
        };
        result = await request('POST', '/transfer', body);
        if (result.error) {
          console.error(`Error: ${result.error}`);
          process.exit(1);
        }
        console.log(`[ok] transfer started: pid=${result.pid} alias=${result.alias} id=${result.transferId}`);
        console.log(`[info] progress events on /events (type='transfer-progress')`);
        return;
      }

      case 'push-repo': {
        // Machine-to-machine git push over ssh (9.8). Positional:
        //   c4 push-repo <alias> [branch]
        // Flags: --repo <localRepoPath> (default: cwd)
        //        --remote-repo <remoteRepoPath> (required)
        //        --force (uses --force-with-lease; never plain --force)
        //        --allow-system
        const positional = [];
        let localRepoPath = process.cwd();
        let remoteRepoPath = '';
        let force = false, allowSystem = false;
        for (let i = 0; i < args.length; i++) {
          if (args[i] === '--repo' && args[i + 1]) localRepoPath = args[++i];
          else if (args[i] === '--remote-repo' && args[i + 1]) remoteRepoPath = args[++i];
          else if (args[i] === '--force') force = true;
          else if (args[i] === '--allow-system') allowSystem = true;
          else positional.push(args[i]);
        }
        const [alias, branch] = positional;
        if (!alias) {
          console.error('Usage: c4 push-repo <alias> [branch] --remote-repo <path> [--repo <localPath>] [--force] [--allow-system]');
          process.exit(1);
        }
        if (!remoteRepoPath) {
          console.error('Error: --remote-repo <path> is required (remote path on target machine)');
          process.exit(1);
        }
        const body = {
          alias,
          type: 'git',
          src: localRepoPath,
          remoteRepoPath,
          branch: branch || '',
          opts: {
            force,
            allowSystem,
          },
        };
        result = await request('POST', '/transfer', body);
        if (result.error) {
          console.error(`Error: ${result.error}`);
          process.exit(1);
        }
        console.log(`[ok] push-repo started: pid=${result.pid} alias=${result.alias} id=${result.transferId}`);
        if (branch) console.log(`[info] branch=${branch}`);
        console.log(`[info] progress events on /events (type='transfer-progress')`);
        return;
      }

      case 'fleet': {
        // Multi-machine fleet management (9.6).
        const fleet = fleetModule();
        const sub = args[0];
        if (!sub || !['add', 'list', 'remove', 'rm', 'status', 'use', 'current'].includes(sub)) {
          console.log('Usage: c4 fleet <add|list|remove|status|use|current> [args]');
          console.log('  add <alias> <host> [--port N] [--token T]');
          console.log('  list                                        List registered machines');
          console.log('  remove <alias>                              Remove a machine');
          console.log('  status [--timeout ms]                       Show aggregated fleet health');
          console.log('  use <alias>                                 Pin subsequent c4 calls to alias');
          console.log('  use --clear                                 Unpin and restore local target');
          console.log('  current                                     Print the pinned alias, if any');
          return;
        }

        if (sub === 'add') {
          const alias = args[1];
          const host = args[2];
          if (!alias || !host) {
            console.error('Usage: c4 fleet add <alias> <host> [--port N] [--token T] [--tags t1,t2]');
            process.exit(1);
          }
          let port;
          let token = '';
          let tags; // undefined = keep existing
          let clearTags = false;
          for (let i = 3; i < args.length; i++) {
            if (args[i] === '--port' && args[i + 1]) port = parseInt(args[++i], 10);
            else if (args[i] === '--token' && args[i + 1]) token = args[++i];
            else if (args[i] === '--tags' && args[i + 1]) {
              tags = args[++i].split(',').map((t) => t.trim()).filter(Boolean);
            } else if (args[i] === '--clear-tags') {
              clearTags = true;
            }
          }
          try {
            const opts = {
              port,
              authToken: token || undefined,
            };
            if (tags !== undefined) opts.tags = tags;
            if (clearTags) opts.clearTags = true;
            const res = fleet.addMachine(alias, host, opts);
            console.log(`[ok] fleet: registered ${res.alias} -> http://${res.host}:${res.port}`);
            if (token) console.log('[ok] fleet: auth token stored for alias');
            if (Array.isArray(res.tags) && res.tags.length > 0) {
              console.log(`[ok] fleet: tags = ${res.tags.join(',')}`);
            }
          } catch (e) {
            console.error(`Error: ${e.message}`);
            process.exit(1);
          }
          return;
        }

        if (sub === 'list') {
          const machines = fleet.listMachines();
          if (machines.length === 0) {
            console.log('No machines registered. Use: c4 fleet add <alias> <host>');
            return;
          }
          const current = fleet.getCurrent();
          console.log('ALIAS\t\tHOST\t\t\tPORT\tTOKEN\tTAGS\t\tPINNED');
          for (const m of machines) {
            const pin = current === m.alias ? '*' : '';
            const tok = m.hasToken ? 'yes' : 'no';
            const tagStr = Array.isArray(m.tags) && m.tags.length > 0 ? m.tags.join(',') : '-';
            console.log(`${m.alias}\t\t${m.host}\t\t${m.port}\t${tok}\t${tagStr}\t\t${pin}`);
          }
          if (current) console.log(`\nPinned alias: ${current}`);
          return;
        }

        if (sub === 'remove' || sub === 'rm') {
          const alias = args[1];
          if (!alias) {
            console.error('Usage: c4 fleet remove <alias>');
            process.exit(1);
          }
          const res = fleet.removeMachine(alias);
          if (!res.ok) {
            console.error(`Error: ${res.error}`);
            process.exit(1);
          }
          console.log(`[ok] fleet: removed ${alias}`);
          return;
        }

        if (sub === 'use') {
          const arg = args[1];
          if (arg === '--clear') {
            fleet.setCurrent(null);
            console.log('[ok] fleet: pin cleared (back to local daemon)');
            return;
          }
          if (!arg) {
            console.error('Usage: c4 fleet use <alias>   (or --clear)');
            process.exit(1);
          }
          const res = fleet.setCurrent(arg);
          if (!res.ok) {
            console.error(`Error: ${res.error}`);
            process.exit(1);
          }
          const machine = fleet.getMachine(arg);
          console.log(`[ok] fleet: pinned ${arg} -> http://${machine.host}:${machine.port}`);
          console.log('[info] subsequent c4 commands proxy to this machine until `c4 fleet use --clear`.');
          return;
        }

        if (sub === 'current') {
          const alias = fleet.getCurrent();
          if (!alias) { console.log('No alias pinned (local daemon)'); return; }
          const machine = fleet.getMachine(alias);
          if (!machine) {
            console.log(`Pinned alias '${alias}' is not in fleet.json (stale pin).`);
            return;
          }
          console.log(`${alias}  http://${machine.host}:${machine.port}`);
          return;
        }

        if (sub === 'status') {
          let timeoutMs;
          for (let i = 1; i < args.length; i++) {
            if (args[i] === '--timeout' && args[i + 1]) timeoutMs = parseInt(args[++i], 10);
          }
          const qs = timeoutMs ? `?timeout=${timeoutMs}` : '';
          result = await request('GET', `/fleet/overview${qs}`);
          if (result && result.self) {
            const self = result.self;
            console.log('SELF:');
            console.log(`  ${self.host}:${self.port}  workers=${self.workers}  version=${self.version || '?'}`);
          }
          if (result && Array.isArray(result.machines)) {
            if (result.machines.length === 0) {
              console.log('\nNo remote machines registered.');
            } else {
              console.log('\nREMOTES:');
              console.log('  ALIAS\t\tHOST\t\t\tPORT\tOK\tWORKERS\tVERSION\tELAPSED');
              for (const m of result.machines) {
                const ok = m.ok ? 'yes' : 'NO';
                const w = m.workers == null ? '?' : m.workers;
                const v = m.version || '?';
                const err = m.ok ? '' : ` (${m.error || 'unreachable'})`;
                console.log(`  ${m.alias}\t\t${m.host}\t\t${m.port}\t${ok}\t${w}\t${v}\t${m.elapsedMs}ms${err}`);
              }
            }
          }
          if (result && result.total) {
            const t = result.total;
            console.log(`\nTotal: ${t.workers} workers across ${t.reachable}/${t.machines} reachable machines`);
          }
          return;
        }

        return;
      }

      case 'cost': {
        // (10.5) Cost report + billing. Thin wrapper around the daemon
        // endpoints at /cost/*. Pure reporting — never mutates worker
        // state, so safe to run during active sessions.
        //   c4 cost report [--from ISO] [--to ISO] [--group project|team|machine|user] [--models] [--json]
        //   c4 cost monthly <YYYY-MM> [--group ...] [--json]
        //   c4 cost budget --limit N [--period day|week|month] [--group name] [--json]
        const sub = args[0];
        if (!sub || !['report', 'monthly', 'budget'].includes(sub)) {
          console.log('Usage: c4 cost <report|monthly|budget> [flags]');
          console.log('  report [--from ISO] [--to ISO] [--group project|team|machine|user] [--models] [--json]');
          console.log('  monthly <YYYY-MM> [--group ...] [--json]');
          console.log('  budget --limit N [--period day|week|month] [--group name] [--json]');
          return;
        }

        // Shared flag parser for all three subcommands.
        let flagFrom = '', flagTo = '', flagGroup = 'project', flagModels = false;
        let flagJson = false, flagLimit = 0, flagPeriod = 'month', flagGroupName = '';
        for (let i = 1; i < args.length; i++) {
          if (args[i] === '--from' && args[i + 1]) flagFrom = args[++i];
          else if (args[i] === '--to' && args[i + 1]) flagTo = args[++i];
          else if (args[i] === '--group' && args[i + 1]) {
            // 'report' and 'monthly' use --group for groupBy; 'budget'
            // uses it for the specific group name to check. Disambiguate
            // by subcommand below.
            if (sub === 'budget') flagGroupName = args[++i];
            else flagGroup = args[++i];
          }
          else if (args[i] === '--models') flagModels = true;
          else if (args[i] === '--json') flagJson = true;
          else if (args[i] === '--limit' && args[i + 1]) flagLimit = parseFloat(args[++i]) || 0;
          else if (args[i] === '--period' && args[i + 1]) flagPeriod = args[++i];
        }

        if (sub === 'report') {
          const qs = new URLSearchParams();
          if (flagFrom) qs.set('from', flagFrom);
          if (flagTo) qs.set('to', flagTo);
          if (flagGroup) qs.set('group', flagGroup);
          if (flagModels) qs.set('models', '1');
          const qsStr = qs.toString();
          result = await request('GET', '/cost/report' + (qsStr ? '?' + qsStr : ''));
        } else if (sub === 'monthly') {
          const ym = args[1] && !args[1].startsWith('--') ? args[1] : '';
          const match = /^(\d{4})-(\d{1,2})$/.exec(ym);
          if (!match) {
            console.error('Usage: c4 cost monthly <YYYY-MM> [--group ...] [--json]');
            process.exit(1);
          }
          const year = match[1];
          const month = String(parseInt(match[2], 10)).padStart(2, '0');
          const qs = new URLSearchParams();
          if (flagGroup && flagGroup !== 'project') qs.set('group', flagGroup);
          const qsStr = qs.toString();
          result = await request('GET', `/cost/monthly/${year}/${month}` + (qsStr ? '?' + qsStr : ''));
        } else {
          // sub === 'budget'
          if (!flagLimit || flagLimit <= 0) {
            console.error('Usage: c4 cost budget --limit <usd> [--period day|week|month] [--group name]');
            process.exit(1);
          }
          const body = { limit: flagLimit, period: flagPeriod };
          if (flagGroupName) body.group = flagGroupName;
          result = await request('POST', '/cost/budget', body);
        }

        if (result && result.error) {
          console.error(`Error: ${result.error}`);
          process.exit(1);
        }

        if (flagJson) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        if (sub === 'budget') {
          const pct = Math.round((result.percent || 0) * 100);
          const status = result.exceeded ? 'EXCEEDED' : result.warning ? 'WARN' : 'OK';
          console.log(`Budget [${status}] period=${result.period} ${result.from} .. ${result.to}`);
          if (result.group) console.log(`  group: ${result.group}`);
          console.log(`  used:    $${(result.used || 0).toFixed(4)}`);
          console.log(`  limit:   $${(result.limit || 0).toFixed(2)}`);
          console.log(`  percent: ${pct}% (warnAt ${Math.round((result.warnAt || 0) * 100)}%)`);
          return;
        }

        // report + monthly share the same printer
        const header = sub === 'monthly' && result.month
          ? `Cost report ${result.month.year}-${String(result.month.month).padStart(2, '0')}`
          : `Cost report ${result.period?.from || ''} .. ${result.period?.to || ''}`;
        console.log(header);
        const total = result.total || { tokens: 0, costUSD: 0 };
        console.log(`  total: ${(total.tokens || 0).toLocaleString()} tokens  $${(total.costUSD || 0).toFixed(4)}`);
        const groups = result.byGroup || [];
        if (groups.length === 0) {
          console.log('  (no usage in period)');
        } else {
          console.log(`  by ${result.groupBy || flagGroup}:`);
          for (const g of groups) {
            console.log(`    ${g.name}: ${(g.tokens || 0).toLocaleString()} tokens  $${(g.costUSD || 0).toFixed(4)}`);
            if (g.perModel) {
              for (const [model, m] of Object.entries(g.perModel)) {
                console.log(`      ${model}: ${(m.tokens || 0).toLocaleString()} tokens  $${(m.costUSD || 0).toFixed(4)}`);
              }
            }
          }
        }
        return;
      }

      case 'audit': {
        // (10.2) Audit log query + hash chain verification.
        //   c4 audit query [--type T] [--from ISO] [--to ISO] [--target name] [--limit N]
        //   c4 audit verify
        // Both subcommands read through the daemon (so the operator sees
        // the same trail the daemon is appending to) and print one JSON
        // object per line for machine consumption.
        const sub = args[0];
        if (!sub || (sub !== 'query' && sub !== 'verify')) {
          console.log('Usage: c4 audit <query|verify> [flags]');
          console.log('  query [--type T] [--from ISO] [--to ISO] [--target name] [--limit N]');
          console.log('  verify');
          return;
        }

        if (sub === 'verify') {
          result = await request('GET', '/audit/verify');
          if (result.error) {
            console.error(`Error: ${result.error}`);
            process.exit(1);
          }
          if (result.valid) {
            console.log(`[ok] audit log valid (${result.total} events, path=${result.path})`);
          } else {
            console.error(`[tamper] hash chain broken at line ${result.corruptedAt} (total=${result.total}, path=${result.path})`);
            process.exit(2);
          }
          return;
        }

        // sub === 'query'
        let type = '', from = '', to = '', target = '';
        let limit = 0;
        for (let i = 1; i < args.length; i++) {
          if (args[i] === '--type' && args[i + 1]) type = args[++i];
          else if (args[i] === '--from' && args[i + 1]) from = args[++i];
          else if (args[i] === '--to' && args[i + 1]) to = args[++i];
          else if (args[i] === '--target' && args[i + 1]) target = args[++i];
          else if (args[i] === '--limit' && args[i + 1]) {
            const n = parseInt(args[++i], 10);
            if (Number.isFinite(n) && n > 0) limit = n;
          }
        }
        const qs = new URLSearchParams();
        if (type) qs.set('type', type);
        if (from) qs.set('from', from);
        if (to) qs.set('to', to);
        if (target) qs.set('target', target);
        if (limit > 0) qs.set('limit', String(limit));
        const qsStr = qs.toString();
        result = await request('GET', '/audit/query' + (qsStr ? '?' + qsStr : ''));
        if (result.error) {
          console.error(`Error: ${result.error}`);
          process.exit(1);
        }
        for (const ev of result.events) {
          console.log(JSON.stringify(ev));
        }
        return;
      }

      case 'rbac': {
        // (10.1) Role-based access control CLI. Thin wrapper around the
        // /rbac/* daemon endpoints. Mutations require the caller's JWT
        // role to allow auth.user.create; reads are open so operators
        // can introspect roles without elevated privileges.
        //   c4 rbac role list
        //   c4 rbac role assign <username> <role>
        //   c4 rbac grant project <username> <projectId>
        //   c4 rbac grant machine <username> <alias>
        //   c4 rbac revoke project <username> <projectId>
        //   c4 rbac revoke machine <username> <alias>
        //   c4 rbac check <username> <action> [--resource type:id]
        const sub = args[0];
        const validSubs = ['role', 'grant', 'revoke', 'check', 'users'];
        if (!sub || !validSubs.includes(sub)) {
          console.log('Usage: c4 rbac <role|grant|revoke|check|users> ...');
          console.log('  role list');
          console.log('  role assign <username> <role>');
          console.log('  grant project <username> <projectId>');
          console.log('  grant machine <username> <alias>');
          console.log('  revoke project <username> <projectId>');
          console.log('  revoke machine <username> <alias>');
          console.log('  check <username> <action> [--resource type:id]');
          console.log('  users');
          return;
        }

        if (sub === 'users') {
          result = await request('GET', '/rbac/users');
        } else if (sub === 'role') {
          const roleSub = args[1];
          if (roleSub === 'list') {
            result = await request('GET', '/rbac/roles');
          } else if (roleSub === 'assign') {
            const username = args[2];
            const role = args[3];
            if (!username || !role) {
              console.error('Usage: c4 rbac role assign <username> <role>');
              process.exit(1);
            }
            result = await request('POST', '/rbac/role/assign', { username, role });
          } else {
            console.error('Usage: c4 rbac role <list|assign> ...');
            process.exit(1);
          }
        } else if (sub === 'grant' || sub === 'revoke') {
          const kind = args[1];
          const username = args[2];
          const target = args[3];
          if ((kind !== 'project' && kind !== 'machine') || !username || !target) {
            console.error('Usage: c4 rbac ' + sub + ' <project|machine> <username> <id>');
            process.exit(1);
          }
          const body = kind === 'project'
            ? { username, projectId: target }
            : { username, alias: target };
          result = await request('POST', '/rbac/' + sub + '/' + kind, body);
        } else if (sub === 'check') {
          const username = args[1];
          const action = args[2];
          if (!username || !action) {
            console.error('Usage: c4 rbac check <username> <action> [--resource type:id]');
            process.exit(1);
          }
          let resource = null;
          for (let i = 3; i < args.length - 1; i++) {
            if (args[i] === '--resource') {
              const v = args[i + 1] || '';
              const idx = v.indexOf(':');
              if (idx > 0) resource = { type: v.slice(0, idx), id: v.slice(idx + 1) };
            }
          }
          result = await request('POST', '/rbac/check', { username, action, resource });
        }
        if (result && result.error) {
          console.error('Error: ' + result.error);
          process.exit(1);
        }
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      case 'project': {
        // (10.8) Project management CLI. Thin wrapper around /projects/*
        // daemon endpoints. Never mutates worker state — all calls go
        // through the storage layer so reporting is safe mid-session.
        //   c4 project create <id> --name N [--desc D]
        //   c4 project list
        //   c4 project show <id>
        //   c4 project task add <projectId> <title> [--status S] [--milestone M] [--sprint S] [--assignee A] [--estimate N]
        //   c4 project task update <projectId> <taskId> [--status S] [--title T] [--assignee A] [--estimate N] [--milestone M] [--sprint S] [--description D]
        //   c4 project milestone add <projectId> <name> --due <date> [--id ID]
        //   c4 project sprint add <projectId> <name> --start <d> --end <d> [--id ID]
        //   c4 project progress <id>
        //   c4 project sync <id> [--repo PATH]
        const sub = args[0];
        const validSubs = ['create', 'list', 'show', 'task', 'milestone', 'sprint', 'progress', 'sync',
          'dashboard', 'contributors', 'velocity', 'tokens'];
        if (!sub || !validSubs.includes(sub)) {
          console.log('Usage: c4 project <create|list|show|task|milestone|sprint|progress|sync|dashboard|contributors|velocity|tokens> [flags]');
          console.log('  create <id> --name N [--desc D]');
          console.log('  list');
          console.log('  show <id>');
          console.log('  task add <projectId> <title> [--status S] [--milestone M] [--sprint S] [--assignee A] [--estimate N]');
          console.log('  task update <projectId> <taskId> [--status S] [--title T] [--assignee A] [--estimate N] [--milestone M] [--sprint S] [--description D]');
          console.log('  milestone add <projectId> <name> --due <date> [--id ID]');
          console.log('  sprint add <projectId> <name> --start <d> --end <d> [--id ID]');
          console.log('  progress <id>');
          console.log('  sync <id> [--repo PATH]');
          console.log('  dashboard <id> [--json]');
          console.log('  contributors <id>');
          console.log('  velocity <id> [--weeks N]');
          console.log('  tokens <id>');
          return;
        }

        function extractFlagAt(startIdx, flag) {
          for (let i = startIdx; i < args.length - 1; i++) {
            if (args[i] === flag) return args[i + 1];
          }
          return '';
        }

        if (sub === 'create') {
          const id = args[1];
          if (!id) { console.error('Usage: c4 project create <id> --name N [--desc D]'); process.exit(1); }
          const name = extractFlagAt(2, '--name');
          const desc = extractFlagAt(2, '--desc') || extractFlagAt(2, '--description');
          result = await request('POST', '/projects', { id, name, description: desc });
        } else if (sub === 'list') {
          result = await request('GET', '/projects');
        } else if (sub === 'show') {
          const id = args[1];
          if (!id) { console.error('Usage: c4 project show <id>'); process.exit(1); }
          result = await request('GET', '/projects/' + encodeURIComponent(id));
        } else if (sub === 'task') {
          const taskSub = args[1];
          if (!taskSub || (taskSub !== 'add' && taskSub !== 'update')) {
            console.error('Usage: c4 project task <add|update> ...');
            process.exit(1);
          }
          if (taskSub === 'add') {
            const projectId = args[2];
            const title = args[3];
            if (!projectId || !title) {
              console.error('Usage: c4 project task add <projectId> <title> [flags]');
              process.exit(1);
            }
            const body = { title };
            const status = extractFlagAt(4, '--status');
            const milestone = extractFlagAt(4, '--milestone');
            const sprint = extractFlagAt(4, '--sprint');
            const assignee = extractFlagAt(4, '--assignee');
            const estimate = extractFlagAt(4, '--estimate');
            if (status) body.status = status;
            if (milestone) body.milestoneId = milestone;
            if (sprint) body.sprintId = sprint;
            if (assignee) body.assignee = assignee;
            if (estimate) body.estimate = parseFloat(estimate) || 0;
            result = await request('POST', '/projects/' + encodeURIComponent(projectId) + '/tasks', body);
          } else {
            const projectId = args[2];
            const taskId = args[3];
            if (!projectId || !taskId) {
              console.error('Usage: c4 project task update <projectId> <taskId> [flags]');
              process.exit(1);
            }
            const patch = {};
            const status = extractFlagAt(4, '--status');
            const title = extractFlagAt(4, '--title');
            const assignee = extractFlagAt(4, '--assignee');
            const estimate = extractFlagAt(4, '--estimate');
            const milestone = extractFlagAt(4, '--milestone');
            const sprint = extractFlagAt(4, '--sprint');
            const description = extractFlagAt(4, '--description');
            if (status) patch.status = status;
            if (title) patch.title = title;
            if (assignee) patch.assignee = assignee;
            if (estimate) patch.estimate = parseFloat(estimate) || 0;
            if (milestone) patch.milestoneId = milestone;
            if (sprint) patch.sprintId = sprint;
            if (description) patch.description = description;
            result = await request('PATCH', '/projects/' + encodeURIComponent(projectId) + '/tasks/' + encodeURIComponent(taskId), patch);
          }
        } else if (sub === 'milestone') {
          const mSub = args[1];
          if (mSub !== 'add') {
            console.error('Usage: c4 project milestone add <projectId> <name> --due <date> [--id ID]');
            process.exit(1);
          }
          const projectId = args[2];
          const name = args[3];
          if (!projectId || !name) {
            console.error('Usage: c4 project milestone add <projectId> <name> --due <date> [--id ID]');
            process.exit(1);
          }
          const dueDate = extractFlagAt(4, '--due');
          const mId = extractFlagAt(4, '--id');
          const body = { name };
          if (dueDate) body.dueDate = dueDate;
          if (mId) body.id = mId;
          result = await request('POST', '/projects/' + encodeURIComponent(projectId) + '/milestones', body);
        } else if (sub === 'sprint') {
          const sSub = args[1];
          if (sSub !== 'add') {
            console.error('Usage: c4 project sprint add <projectId> <name> --start <d> --end <d> [--id ID]');
            process.exit(1);
          }
          const projectId = args[2];
          const name = args[3];
          if (!projectId || !name) {
            console.error('Usage: c4 project sprint add <projectId> <name> --start <d> --end <d> [--id ID]');
            process.exit(1);
          }
          const startDate = extractFlagAt(4, '--start');
          const endDate = extractFlagAt(4, '--end');
          const sId = extractFlagAt(4, '--id');
          const body = { name };
          if (startDate) body.startDate = startDate;
          if (endDate) body.endDate = endDate;
          if (sId) body.id = sId;
          result = await request('POST', '/projects/' + encodeURIComponent(projectId) + '/sprints', body);
        } else if (sub === 'progress') {
          const id = args[1];
          if (!id) { console.error('Usage: c4 project progress <id>'); process.exit(1); }
          result = await request('GET', '/projects/' + encodeURIComponent(id) + '/progress');
          if (result && !result.error) {
            console.log('Progress for ' + id + ':');
            console.log('  total:  ' + result.totalTasks + ' tasks');
            console.log('  done:   ' + result.doneTasks);
            console.log('  percent: ' + result.percent + '%');
            const bs = result.byStatus || {};
            console.log('  backlog: ' + (bs.backlog || 0) + '  todo: ' + (bs.todo || 0) + '  in_progress: ' + (bs.in_progress || 0) + '  done: ' + (bs.done || 0));
            return;
          }
        } else if (sub === 'sync') {
          const id = args[1];
          if (!id) { console.error('Usage: c4 project sync <id> [--repo PATH]'); process.exit(1); }
          const repo = extractFlagAt(2, '--repo') || process.cwd();
          result = await request('POST', '/projects/' + encodeURIComponent(id) + '/sync', { repoPath: repo });
        } else if (sub === 'dashboard') {
          // (10.3) Project-specific dashboard summary. --json dumps the
          // full snapshot; the default view prints a compact human
          // summary so operators can eyeball a project's health.
          const id = args[1];
          if (!id) { console.error('Usage: c4 project dashboard <id> [--json]'); process.exit(1); }
          const jsonMode = args.includes('--json');
          result = await request('GET', '/projects/' + encodeURIComponent(id) + '/dashboard');
          if (result && !result.error && !jsonMode) {
            const p = result.project || {};
            const ts = result.todoStats || {};
            const tu = result.tokenUsage || {};
            const v = result.velocity || {};
            console.log('Project: ' + (p.name || p.id || id));
            console.log('  tasks:    ' + (ts.total || 0) + ' (' + (ts.done || 0) + ' done / ' + (ts.open || 0) + ' open, ' + (ts.done_pct || 0) + '%)');
            console.log('  workers:  ' + (result.activeWorkers ? result.activeWorkers.length : 0) + ' active');
            console.log('  merges:   ' + (result.recentMerges ? result.recentMerges.length : 0) + ' recent');
            console.log('  tokens:   ' + (tu.total || 0) + ' total');
            console.log('  velocity: ' + (v.tasksPerWeek || 0) + ' tasks/wk, ' + (v.mergesPerWeek || 0) + ' merges/wk (over ' + (v.windowWeeks || 0) + ' wk)');
            console.log('  contributors: ' + (result.contributors ? result.contributors.length : 0));
            return;
          }
        } else if (sub === 'contributors') {
          // (10.3) Per-user tasks and tokens for one project.
          const id = args[1];
          if (!id) { console.error('Usage: c4 project contributors <id>'); process.exit(1); }
          result = await request('GET', '/projects/' + encodeURIComponent(id) + '/contributors');
        } else if (sub === 'velocity') {
          // (10.3) Velocity over a sliding window. --weeks N overrides
          // the 4-week default so operators can show a different window.
          const id = args[1];
          if (!id) { console.error('Usage: c4 project velocity <id> [--weeks N]'); process.exit(1); }
          const weeksStr = extractFlagAt(2, '--weeks');
          const qs = weeksStr ? '?weeks=' + encodeURIComponent(weeksStr) : '';
          result = await request('GET', '/projects/' + encodeURIComponent(id) + '/velocity' + qs);
        } else if (sub === 'tokens') {
          // (10.3) Token usage breakdown for one project.
          const id = args[1];
          if (!id) { console.error('Usage: c4 project tokens <id>'); process.exit(1); }
          result = await request('GET', '/projects/' + encodeURIComponent(id) + '/tokens');
        }

        if (result && result.error) {
          console.error('Error: ' + result.error);
          process.exit(1);
        }
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      case 'org': {
        // (10.6) Department / team management CLI. Thin wrapper around
        // /orgs/* daemon endpoints.
        //   c4 org tree
        //   c4 org dept create --id ID --name N [--parent PID]
        //   c4 org dept member add <deptId> <userId> [--role manager]
        //   c4 org team create --id ID --dept DEPTID --name N
        //   c4 org team member add <teamId> <userId>
        //   c4 org quota set <deptId> [--max-workers N] [--budget USD] [--tokens N]
        //   c4 org usage <deptId>
        const sub = args[0];
        const validSubs = ['tree', 'dept', 'team', 'quota', 'usage'];
        if (!sub || !validSubs.includes(sub)) {
          console.log('Usage: c4 org <tree|dept|team|quota|usage> ...');
          console.log('  tree');
          console.log('  dept create --id ID --name N [--parent PID]');
          console.log('  dept member add <deptId> <userId> [--role manager]');
          console.log('  team create --id ID --dept DEPTID --name N');
          console.log('  team member add <teamId> <userId>');
          console.log('  quota set <deptId> [--max-workers N] [--budget USD] [--tokens N]');
          console.log('  usage <deptId>');
          return;
        }

        function flagAt(startIdx, flag) {
          for (let i = startIdx; i < args.length - 1; i++) {
            if (args[i] === flag) return args[i + 1];
          }
          return '';
        }

        if (sub === 'tree') {
          result = await request('GET', '/orgs/tree');
        } else if (sub === 'dept') {
          const action = args[1];
          if (action === 'create') {
            const id = flagAt(2, '--id');
            const name = flagAt(2, '--name');
            const parent = flagAt(2, '--parent');
            if (!id) {
              console.error('Usage: c4 org dept create --id ID --name N [--parent PID]');
              process.exit(1);
            }
            const body = { id };
            if (name) body.name = name;
            if (parent) body.parentId = parent;
            result = await request('POST', '/orgs/dept', body);
          } else if (action === 'member') {
            const memberAction = args[2];
            const deptId = args[3];
            const userId = args[4];
            if (memberAction !== 'add' || !deptId || !userId) {
              console.error('Usage: c4 org dept member add <deptId> <userId> [--role manager]');
              process.exit(1);
            }
            const role = flagAt(5, '--role');
            const body = { userId };
            if (role) body.role = role;
            result = await request('POST', '/orgs/dept/' + encodeURIComponent(deptId) + '/member', body);
          } else {
            console.error('Usage: c4 org dept <create|member> ...');
            process.exit(1);
          }
        } else if (sub === 'team') {
          const action = args[1];
          if (action === 'create') {
            const id = flagAt(2, '--id');
            const deptId = flagAt(2, '--dept');
            const name = flagAt(2, '--name');
            if (!id || !deptId) {
              console.error('Usage: c4 org team create --id ID --dept DEPTID --name N');
              process.exit(1);
            }
            const body = { id, deptId };
            if (name) body.name = name;
            result = await request('POST', '/orgs/team', body);
          } else if (action === 'member') {
            const memberAction = args[2];
            const teamId = args[3];
            const userId = args[4];
            if (memberAction !== 'add' || !teamId || !userId) {
              console.error('Usage: c4 org team member add <teamId> <userId>');
              process.exit(1);
            }
            result = await request('POST', '/orgs/team/' + encodeURIComponent(teamId) + '/member', { userId });
          } else {
            console.error('Usage: c4 org team <create|member> ...');
            process.exit(1);
          }
        } else if (sub === 'quota') {
          const action = args[1];
          const deptId = args[2];
          if (action !== 'set' || !deptId) {
            console.error('Usage: c4 org quota set <deptId> [--max-workers N] [--budget USD] [--tokens N]');
            process.exit(1);
          }
          const body = {};
          const maxW = flagAt(3, '--max-workers');
          const budget = flagAt(3, '--budget');
          const tokens = flagAt(3, '--tokens');
          if (maxW !== '') body.maxWorkers = parseFloat(maxW) || 0;
          if (budget !== '') body.monthlyBudgetUSD = parseFloat(budget) || 0;
          if (tokens !== '') body.tokenLimit = parseFloat(tokens) || 0;
          result = await request('POST', '/orgs/dept/' + encodeURIComponent(deptId) + '/quota', body);
        } else if (sub === 'usage') {
          const deptId = args[1];
          if (!deptId) {
            console.error('Usage: c4 org usage <deptId>');
            process.exit(1);
          }
          result = await request('GET', '/orgs/dept/' + encodeURIComponent(deptId) + '/usage');
        }

        if (result && result.error) {
          console.error('Error: ' + result.error);
          process.exit(1);
        }
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      case 'schedule': {
        // (10.7) Cron-driven schedule management. Thin wrapper around
        // /schedules/* daemon endpoints.
        //   c4 schedule list [--enabled] [--disabled] [--project P]
        //   c4 schedule create --name N --cron 'EXPR' --template T [--project P] [--timezone TZ] [--assignee A] [--id ID]
        //   c4 schedule show <id>
        //   c4 schedule enable <id>
        //   c4 schedule disable <id>
        //   c4 schedule run <id>
        //   c4 schedule delete <id>
        //   c4 schedule next <id>
        //   c4 schedule history <id>
        //   c4 schedule gantt [--weeks N] [--json]
        const sub = args[0];
        const validSubs = ['list', 'create', 'show', 'enable', 'disable', 'run', 'delete', 'next', 'history', 'gantt'];
        if (!sub || !validSubs.includes(sub)) {
          console.log('Usage: c4 schedule <list|create|show|enable|disable|run|delete|next|history|gantt> [flags]');
          console.log('  list [--enabled] [--disabled] [--project P]');
          console.log("  create --name N --cron 'EXPR' --template T [--project P] [--timezone TZ] [--assignee A] [--id ID]");
          console.log('  show <id>');
          console.log('  enable <id>');
          console.log('  disable <id>');
          console.log('  run <id>');
          console.log('  delete <id>');
          console.log('  next <id>');
          console.log('  history <id>');
          console.log('  gantt [--weeks N] [--json]');
          return;
        }

        function flagAt(startIdx, flag) {
          for (let i = startIdx; i < args.length - 1; i++) {
            if (args[i] === flag) return args[i + 1];
          }
          return '';
        }
        function hasFlag(startIdx, flag) {
          for (let i = startIdx; i < args.length; i++) {
            if (args[i] === flag) return true;
          }
          return false;
        }

        if (sub === 'list') {
          const qs = [];
          if (hasFlag(1, '--enabled')) qs.push('enabled=true');
          if (hasFlag(1, '--disabled')) qs.push('enabled=false');
          const proj = flagAt(1, '--project');
          if (proj) qs.push('projectId=' + encodeURIComponent(proj));
          const assignee = flagAt(1, '--assignee');
          if (assignee) qs.push('assignee=' + encodeURIComponent(assignee));
          const query = qs.length > 0 ? '?' + qs.join('&') : '';
          result = await request('GET', '/schedules' + query);
        } else if (sub === 'create') {
          const name = flagAt(1, '--name');
          const cronExpr = flagAt(1, '--cron');
          const template = flagAt(1, '--template');
          const project = flagAt(1, '--project');
          const timezone = flagAt(1, '--timezone');
          const assignee = flagAt(1, '--assignee');
          const id = flagAt(1, '--id');
          if (!cronExpr || !template) {
            console.error("Usage: c4 schedule create --name N --cron 'EXPR' --template T [--project P] [--timezone TZ] [--assignee A] [--id ID]");
            process.exit(1);
          }
          const body = { cronExpr, taskTemplate: template };
          if (id) body.id = id;
          if (name) body.name = name;
          if (project) body.projectId = project;
          if (timezone) body.timezone = timezone;
          if (assignee) body.assignee = assignee;
          result = await request('POST', '/schedules', body);
        } else if (sub === 'show') {
          const id = args[1];
          if (!id) { console.error('Usage: c4 schedule show <id>'); process.exit(1); }
          result = await request('GET', '/schedules/' + encodeURIComponent(id));
        } else if (sub === 'enable') {
          const id = args[1];
          if (!id) { console.error('Usage: c4 schedule enable <id>'); process.exit(1); }
          result = await request('PUT', '/schedules/' + encodeURIComponent(id), { enabled: true });
        } else if (sub === 'disable') {
          const id = args[1];
          if (!id) { console.error('Usage: c4 schedule disable <id>'); process.exit(1); }
          result = await request('PUT', '/schedules/' + encodeURIComponent(id), { enabled: false });
        } else if (sub === 'run') {
          const id = args[1];
          if (!id) { console.error('Usage: c4 schedule run <id>'); process.exit(1); }
          result = await request('POST', '/schedules/' + encodeURIComponent(id) + '/run', {});
        } else if (sub === 'delete') {
          const id = args[1];
          if (!id) { console.error('Usage: c4 schedule delete <id>'); process.exit(1); }
          result = await request('DELETE', '/schedules/' + encodeURIComponent(id));
        } else if (sub === 'next') {
          const id = args[1];
          if (!id) { console.error('Usage: c4 schedule next <id>'); process.exit(1); }
          const schedule = await request('GET', '/schedules/' + encodeURIComponent(id));
          if (schedule && schedule.error) {
            console.error('Error: ' + schedule.error);
            process.exit(1);
          }
          result = { id: schedule.id, nextRun: schedule.nextRun, timezone: schedule.timezone };
        } else if (sub === 'history') {
          const id = args[1];
          if (!id) { console.error('Usage: c4 schedule history <id>'); process.exit(1); }
          result = await request('GET', '/schedules/' + encodeURIComponent(id) + '/history');
        } else if (sub === 'gantt') {
          const weeksRaw = flagAt(1, '--weeks');
          const weeks = weeksRaw ? Math.max(1, parseInt(weeksRaw, 10) || 4) : 4;
          const jsonOut = hasFlag(1, '--json');
          const listResp = await request('GET', '/schedules');
          if (listResp && listResp.error) {
            console.error('Error: ' + listResp.error);
            process.exit(1);
          }
          // Render client-side so the --json branch gives the raw rows
          // and the text branch gives the ASCII timeline. Uses the
          // shared module directly - no new daemon endpoint needed for
          // the visual view.
          const scheduleMgmt = require('./schedule-mgmt');
          const tmpMgr = new scheduleMgmt.ScheduleManager({ storePath: '/dev/null' });
          tmpMgr._state = { schedules: {} };
          for (const s of (listResp.schedules || [])) {
            tmpMgr._state.schedules[s.id] = s;
          }
          if (jsonOut) {
            result = tmpMgr.gantt(weeks, new Date());
          } else {
            process.stdout.write(tmpMgr.renderGanttText(weeks, new Date()));
            return;
          }
        }

        if (result && result.error) {
          console.error('Error: ' + result.error);
          process.exit(1);
        }
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      case 'computer': {
        // (11.2) Computer Use agent. Thin wrapper around
        // /computer-use/* daemon endpoints. Single powerful `computer.use`
        // RBAC action guards the whole surface — granting it is
        // effectively remote desktop.
        //   c4 computer start [--backend auto|stub|xdotool|mock]
        //   c4 computer list
        //   c4 computer status
        //   c4 computer show <sessionId>
        //   c4 computer end <sessionId>
        //   c4 computer screenshot <sessionId>
        //   c4 computer click <sessionId> <X> <Y> [--button left|right|middle]
        //   c4 computer type <sessionId> <text>
        //   c4 computer key <sessionId> <KeyName>
        const sub = args[0];
        const validSubs = ['start', 'list', 'status', 'show', 'end', 'screenshot', 'click', 'type', 'key'];
        if (!sub || !validSubs.includes(sub)) {
          console.log('Usage: c4 computer <' + validSubs.join('|') + '> [flags]');
          console.log('  start [--backend auto|stub|xdotool|mock]');
          console.log('  list');
          console.log('  status');
          console.log('  show <sessionId>');
          console.log('  end <sessionId>');
          console.log('  screenshot <sessionId>');
          console.log('  click <sessionId> <X> <Y> [--button left|right|middle]');
          console.log('  type <sessionId> <text...>');
          console.log('  key <sessionId> <KeyName>');
          return;
        }

        function flagAt(startIdx, flag) {
          for (let i = startIdx; i < args.length - 1; i++) {
            if (args[i] === flag) return args[i + 1];
          }
          return '';
        }

        if (sub === 'start') {
          const backend = flagAt(1, '--backend') || 'auto';
          result = await request('POST', '/computer-use/sessions', { backend });
        } else if (sub === 'list') {
          result = await request('GET', '/computer-use/sessions');
        } else if (sub === 'status') {
          const listed = await request('GET', '/computer-use/sessions');
          if (listed && listed.error) {
            console.error('Error: ' + listed.error);
            process.exit(1);
          }
          const backends = (listed && listed.backends) || { stub: true, mock: true, xdotool: false };
          const active = Array.isArray(listed && listed.sessions)
            ? listed.sessions.filter((s) => !s.endedAt) : [];
          console.log('Available backends: ' + Object.keys(backends).filter((k) => backends[k]).join(', '));
          console.log('Active sessions: ' + active.length);
          console.log('Total sessions: ' + (listed && listed.count || 0));
          return;
        } else if (sub === 'show') {
          const id = args[1];
          if (!id) { console.error('Usage: c4 computer show <sessionId>'); process.exit(1); }
          result = await request('GET', '/computer-use/sessions/' + encodeURIComponent(id));
        } else if (sub === 'end') {
          const id = args[1];
          if (!id) { console.error('Usage: c4 computer end <sessionId>'); process.exit(1); }
          result = await request('DELETE', '/computer-use/sessions/' + encodeURIComponent(id));
        } else if (sub === 'screenshot') {
          const id = args[1];
          if (!id) { console.error('Usage: c4 computer screenshot <sessionId>'); process.exit(1); }
          result = await request('POST', '/computer-use/sessions/' + encodeURIComponent(id) + '/screenshot', {});
        } else if (sub === 'click') {
          const id = args[1];
          const x = Number(args[2]);
          const y = Number(args[3]);
          if (!id || !Number.isFinite(x) || !Number.isFinite(y)) {
            console.error('Usage: c4 computer click <sessionId> <X> <Y> [--button left|right|middle]');
            process.exit(1);
          }
          const button = flagAt(4, '--button') || 'left';
          result = await request('POST', '/computer-use/sessions/' + encodeURIComponent(id) + '/click', { x, y, button });
        } else if (sub === 'type') {
          const id = args[1];
          if (!id || args.length < 3) {
            console.error("Usage: c4 computer type <sessionId> <text...>");
            process.exit(1);
          }
          const text = args.slice(2).join(' ');
          result = await request('POST', '/computer-use/sessions/' + encodeURIComponent(id) + '/type', { text });
        } else if (sub === 'key') {
          const id = args[1];
          const key = args[2];
          if (!id || !key) {
            console.error('Usage: c4 computer key <sessionId> <KeyName>');
            process.exit(1);
          }
          result = await request('POST', '/computer-use/sessions/' + encodeURIComponent(id) + '/key', { key });
        }

        if (result && result.error) {
          console.error('Error: ' + result.error);
          process.exit(1);
        }
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      case 'workflow': {
        // (11.3) Workflow engine management. Thin wrapper around
        // /workflows/* daemon endpoints.
        //   c4 workflow list [--enabled] [--disabled] [--name N]
        //   c4 workflow create --file <workflow.yaml|workflow.json>
        //   c4 workflow show <id>
        //   c4 workflow run <id> [--inputs '{...}']
        //   c4 workflow runs <id>
        //   c4 workflow delete <id>
        //   c4 workflow export <id>
        const sub = args[0];
        const validSubs = ['list', 'create', 'show', 'run', 'runs', 'delete', 'export'];
        if (!sub || !validSubs.includes(sub)) {
          console.log('Usage: c4 workflow <list|create|show|run|runs|delete|export> [flags]');
          console.log('  list [--enabled] [--disabled] [--name N]');
          console.log('  create --file <workflow.yaml|workflow.json>');
          console.log('  show <id>');
          console.log("  run <id> [--inputs '{...}']");
          console.log('  runs <id>');
          console.log('  delete <id>');
          console.log('  export <id>');
          return;
        }

        function flagAt(startIdx, flag) {
          for (let i = startIdx; i < args.length - 1; i++) {
            if (args[i] === flag) return args[i + 1];
          }
          return '';
        }
        function hasFlag(startIdx, flag) {
          for (let i = startIdx; i < args.length; i++) {
            if (args[i] === flag) return true;
          }
          return false;
        }

        if (sub === 'list') {
          const qs = [];
          if (hasFlag(1, '--enabled')) qs.push('enabled=true');
          if (hasFlag(1, '--disabled')) qs.push('enabled=false');
          const nm = flagAt(1, '--name');
          if (nm) qs.push('nameContains=' + encodeURIComponent(nm));
          const query = qs.length > 0 ? '?' + qs.join('&') : '';
          result = await request('GET', '/workflows' + query);
        } else if (sub === 'create') {
          const file = flagAt(1, '--file');
          if (!file) {
            console.error('Usage: c4 workflow create --file <workflow.yaml|workflow.json>');
            process.exit(1);
          }
          const fs = require('fs');
          let raw;
          try { raw = fs.readFileSync(file, 'utf8'); }
          catch (e) {
            console.error('Failed to read ' + file + ': ' + e.message);
            process.exit(1);
          }
          let body = null;
          try { body = JSON.parse(raw); }
          catch {
            try { body = parseSimpleYaml(raw); }
            catch (e) {
              console.error('Failed to parse workflow file: ' + e.message);
              process.exit(1);
            }
          }
          result = await request('POST', '/workflows', body);
        } else if (sub === 'show') {
          const id = args[1];
          if (!id) { console.error('Usage: c4 workflow show <id>'); process.exit(1); }
          result = await request('GET', '/workflows/' + encodeURIComponent(id));
        } else if (sub === 'run') {
          const id = args[1];
          if (!id) { console.error('Usage: c4 workflow run <id> [--inputs \'{...}\']'); process.exit(1); }
          const inputsStr = flagAt(2, '--inputs');
          let inputs = {};
          if (inputsStr) {
            try { inputs = JSON.parse(inputsStr); }
            catch (e) {
              console.error('--inputs must be JSON: ' + e.message);
              process.exit(1);
            }
          }
          result = await request('POST', '/workflows/' + encodeURIComponent(id) + '/run', { inputs });
        } else if (sub === 'runs') {
          const id = args[1];
          if (!id) { console.error('Usage: c4 workflow runs <id>'); process.exit(1); }
          result = await request('GET', '/workflows/' + encodeURIComponent(id) + '/runs');
        } else if (sub === 'delete') {
          const id = args[1];
          if (!id) { console.error('Usage: c4 workflow delete <id>'); process.exit(1); }
          result = await request('DELETE', '/workflows/' + encodeURIComponent(id));
        } else if (sub === 'export') {
          const id = args[1];
          if (!id) { console.error('Usage: c4 workflow export <id>'); process.exit(1); }
          result = await request('GET', '/workflows/' + encodeURIComponent(id));
        }

        if (result && result.error) {
          console.error('Error: ' + result.error);
          process.exit(1);
        }
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      case 'cicd': {
        // (10.4) CI/CD pipeline management.
        //   c4 cicd pipeline list
        //   c4 cicd pipeline create --repo R --workflow W --trigger T [--trigger T2] --action worker.task:template [--action workflow.trigger:workflow] [--profile P] [--name N]
        //   c4 cicd pipeline delete <id>
        //   c4 cicd trigger <id> [--event E]
        //   c4 cicd trigger --repo R --workflow W [--ref REF] [--input KEY=VAL]
        const sub = args[0];
        const validSubs = ['pipeline', 'trigger'];
        if (!sub || !validSubs.includes(sub)) {
          console.log('Usage: c4 cicd <pipeline|trigger> ...');
          console.log('  pipeline list');
          console.log('  pipeline create --repo R --workflow W --trigger T [--trigger T2]');
          console.log('                  --action worker.task:<template> [--action workflow.trigger:<workflow>]');
          console.log('                  [--profile P] [--name N] [--id ID]');
          console.log('  pipeline delete <id>');
          console.log('  trigger <id> [--event E]');
          console.log('  trigger --repo R --workflow W [--ref REF] [--input KEY=VAL]');
          return;
        }

        function collectRepeatFlag(name) {
          const out = [];
          for (let i = 2; i < args.length - 1; i++) {
            if (args[i] === name) out.push(args[i + 1]);
          }
          return out;
        }
        function singleFlag(name) {
          for (let i = 2; i < args.length - 1; i++) {
            if (args[i] === name) return args[i + 1];
          }
          return '';
        }

        if (sub === 'pipeline') {
          const pipeSub = args[1];
          if (pipeSub === 'list') {
            result = await request('GET', '/cicd/pipelines');
          } else if (pipeSub === 'create') {
            const repo = singleFlag('--repo');
            const workflow = singleFlag('--workflow');
            const id = singleFlag('--id');
            const name = singleFlag('--name');
            const profile = singleFlag('--profile');
            const triggers = collectRepeatFlag('--trigger');
            const actionSpecs = collectRepeatFlag('--action');
            if (!repo) {
              console.error('Usage: c4 cicd pipeline create --repo R --workflow W --trigger T --action TYPE:VALUE');
              process.exit(1);
            }
            const actions = actionSpecs.map((spec) => {
              const idx = spec.indexOf(':');
              if (idx < 0) return null;
              const type = spec.slice(0, idx);
              const value = spec.slice(idx + 1);
              if (type === 'worker.task') {
                return { type, template: value, profile: profile || '' };
              }
              if (type === 'workflow.trigger') {
                return { type, workflow: value, inputs: {} };
              }
              return null;
            }).filter(Boolean);
            const body = { repo, workflow, triggers, actions };
            if (id) body.id = id;
            if (name) body.name = name;
            result = await request('POST', '/cicd/pipelines', body);
          } else if (pipeSub === 'delete') {
            const id = args[2];
            if (!id) { console.error('Usage: c4 cicd pipeline delete <id>'); process.exit(1); }
            result = await request('DELETE', '/cicd/pipelines/' + encodeURIComponent(id));
          } else {
            console.error('Usage: c4 cicd pipeline <list|create|delete>');
            process.exit(1);
          }
        } else if (sub === 'trigger') {
          const repo = singleFlag('--repo');
          const workflow = singleFlag('--workflow');
          if (repo && workflow) {
            const ref = singleFlag('--ref') || 'main';
            const inputs = {};
            for (let i = 1; i < args.length - 1; i++) {
              if (args[i] === '--input') {
                const kv = args[i + 1] || '';
                const eq = kv.indexOf('=');
                if (eq > 0) inputs[kv.slice(0, eq)] = kv.slice(eq + 1);
              }
            }
            result = await request('POST', '/cicd/trigger', { repo, workflow, ref, inputs });
          } else {
            const id = args[1];
            if (!id) {
              console.error('Usage: c4 cicd trigger <id> OR --repo R --workflow W');
              process.exit(1);
            }
            result = await request('POST', '/cicd/trigger', { id });
          }
        }

        if (result && result.error) {
          console.error('Error: ' + result.error);
          process.exit(1);
        }
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      case 'daemon': {
        const DaemonManager = require(require('path').join(__dirname, 'daemon-manager'));
        const sub = args[0];
        if (!sub || !['start', 'stop', 'restart', 'status'].includes(sub)) {
          console.log('Usage: c4 daemon <start|stop|restart|status>');
          return;
        }
        // Warn on missing git identity at daemon start (7.25). Non-fatal.
        if (sub === 'start' || sub === 'restart') {
          try {
            const { missingIdentityKeys } = require('./git-identity');
            const missing = missingIdentityKeys();
            if (missing.length) {
              console.warn(`[warn] git identity not set: ${missing.join(', ')}`);
              console.warn('  c4 merge will fail without it. Run: c4 init');
            }
          } catch {}
        }
        result = await DaemonManager[sub]();
        if (sub === 'status') {
          if (result.running) {
            console.log(`Daemon running (PID ${result.pid}, ${result.workers ?? '?'} workers)`);
            if (result.endpoint) console.log(`  ${result.endpoint}`);
            if (result.note) console.log(`  ${result.note}`);
            // Version mismatch warning (7.15)
            try {
              const installedVersion = require('../package.json').version;
              if (result.daemonVersion && result.daemonVersion !== installedVersion) {
                console.warn(`  [warn] version mismatch: daemon=${result.daemonVersion} installed=${installedVersion}`);
                console.warn(`         Run 'c4 daemon restart' to reload the daemon with the latest code.`);
              } else if (result.daemonVersion) {
                console.log(`  version: ${result.daemonVersion}`);
              }
            } catch {}
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
       [--parent <name>]             Record parent worker (auto-detected from C4_WORKER_NAME env)
  task <name> <text> [--branch name] [--no-branch]         Send task with auto branch
       [--repo path] [--cwd path]                              Repo root / working dir for worktree
       [--context worker] [--reuse] [--scope JSON]             Context / pool reuse / scope
       [--budget <usd>] [--max-retries <n>]                    Cost/retry guardrails (9.10)
  send <name> <text>               Send raw text to worker
  key <name> <key>                 Send special key (Enter, C-c, C-b, Tab, etc.)
  read <name>                      Read new output (idle snapshots only)
  read-now <name>                  Read current screen immediately
  wait <name> [timeout_ms]         Wait until idle, then read screen
       [--all] [--interrupt-on-intervention]  Multi-worker / intervention wait
  scrollback <name> [--lines N]    Read scrollback buffer (default 200 lines)
  watch <name>                     Watch worker output in real-time (Ctrl+C to stop)
  list [--tree]                    List all workers (--tree for hierarchy view)
  merge <worker|branch>            Merge branch to main (with pre-checks)
       [--skip-checks]             Skip test/TODO/CHANGELOG checks
       [--auto-stash]              Stash uncommitted changes on main, merge, then pop (7.28)
  validation <worker>              Show stored validation object for the worker (9.9)
  plan <name> <task> [--output f]   Plan-only mode: write plan.md without executing
  plan-read <name> [--output f]    Read generated plan.md from worker
  plan-update <name> --reason <t> [--evidence <t>] [--replan] [--redispatch]
                                    Flag plan as needing revision; optionally re-plan + re-dispatch (9.12)
  plan-revisions <name>             List plan revisions recorded for a worker (9.12)
  rollback <name>                  Rollback worker to pre-task commit (git reset --soft)
  recover <name> [--category X]    Smart recovery pass on a stuck worker (8.4)
       [--history] [--limit N]     Show recovery history instead of running a pass
  close <name>                     Close a worker
  history [worker] [--limit N]     Show task history
  health                           Check daemon status
  daemon start                     Start daemon in background
  daemon stop                      Stop daemon
  daemon restart                   Restart daemon
  daemon status                    Check daemon status
  mcp start [--base URL]           Start MCP stdio proxy (for Claude Desktop, 9.4)
  mcp status                       Verify MCP endpoint handshake
  mcp tools                        List exposed MCP tools
  fleet add <alias> <host> [--port N] [--token T] [--tags t1,t2]  Register a remote daemon (9.6)
  fleet list                       List registered machines + pinned alias
  fleet remove <alias>             Remove a machine from ~/.c4/fleet.json
  fleet use <alias>                Pin c4 commands to this alias (use --clear to unpin)
  fleet current                    Print the pinned alias, if any
  fleet status [--timeout ms]      Aggregated fleet overview (health + worker counts)
  dispatch "<task>" [--count N] [--tags t1,t2] [--strategy S]  Distribute task across fleet (9.7)
       [--branch prefix] [--name prefix] [--profile name] [--auto-mode] [--dry-run] [--location alias]
  send-file <alias> <localPath> <remotePath>                   Transfer files via rsync over ssh (9.8)
       [--delete] [--exclude pattern] [--dry-run] [--allow-system]
  push-repo <alias> [branch] --remote-repo <path>              Push a git repo to a fleet machine (9.8)
       [--repo <localPath>] [--force] [--allow-system]
  chat "query"                     Natural-language query (11.4)
  chat --interactive               REPL (readline) — 'exit' to quit
  chat sessions                    List stored chat sessions
  chat history <id>                Dump a session's messages
  scribe start                     Start session context recording
  scribe stop                      Stop scribe
  scribe status                    Show scribe status
  scribe scan                      Run one-time scan now
  attach <id|path> [--name alias]  Attach external Claude JSONL as read-only worker (8.17)
  attach list                      List attached sessions
  attach detach <name>             Remove an attachment pointer
  token-usage [--per-task]         Show daily token usage (per-task adds worker-level aggregation)
  quota [tier]                     Show daily tier-based token quota (8.3, manager|mid|worker)
  auto <task>                      Autonomous mode: manager + scribe + task (4.8)
  morning                          Generate morning report (4.4)
  profiles                         List available permission profiles
  batch "task" --count N           Same task to N workers in parallel
  batch --file tasks.txt           One task per line from file
       [--auto-mode] [--profile name] [--branch prefix]
  config                           Show current config
  config reload                    Reload config.json without restart
  audit query [--type T] [--from ISO] [--to ISO] [--target name] [--limit N]   Query audit log (10.2)
  audit verify                     Verify audit log hash chain integrity
  rbac role list                   Show role-action matrix (10.1)
  rbac role assign <user> <role>   Assign role (admin|manager|viewer)
  rbac grant project <user> <id>   Grant per-project access
  rbac grant machine <user> <alias>  Grant per-machine access
  rbac revoke project <user> <id>  Revoke project access
  rbac revoke machine <user> <alias>   Revoke machine access
  rbac check <user> <action> [--resource type:id]   Check a permission
  rbac users                       List RBAC users
  cost report [--from ISO] [--to ISO] [--group project|team|machine|user] [--models] [--json]   Cost report (10.5)
  cost monthly <YYYY-MM> [--json]  Monthly cost report
  cost budget --limit N [--period day|week|month] [--group name] [--json]   Budget check
  project create <id> --name N [--desc D]   Create a PM project (10.8)
  project list                     List PM projects
  project show <id>                Show project detail (tasks, milestones, sprints)
  project task add <projectId> <title> [--status S] [--milestone M] [--sprint S] [--assignee A] [--estimate N]
  project task update <projectId> <taskId> [--status S] [--title T] [--assignee A] [--estimate N] [--milestone M] [--sprint S] [--description D]
  project milestone add <projectId> <name> --due <date> [--id ID]
  project sprint add <projectId> <name> --start <d> --end <d> [--id ID]
  project progress <id>            Show {totalTasks, doneTasks, percent, byStatus}
  project sync <id> [--repo PATH]  Bi-directional TODO.md sync
  cicd pipeline list               List registered CI/CD pipelines (10.4)
  cicd pipeline create --repo R --workflow W --trigger T --action TYPE:VALUE
       [--trigger T2] [--action TYPE:VALUE] [--profile P] [--name N] [--id ID]
       Register a pipeline. Actions: worker.task:<template> or workflow.trigger:<workflow>.
  cicd pipeline delete <id>        Remove a pipeline
  cicd trigger <id>                Replay a registered pipeline's actions
  cicd trigger --repo R --workflow W [--ref REF] [--input K=V]  One-off workflow_dispatch
  computer start [--backend auto|stub|xdotool|mock]  Start a computer-use session (11.2)
  computer list / status                             List / summarise sessions
  computer show <sessionId>                          Show one session's actions
  computer end <sessionId>                           End a session
  computer screenshot <sessionId>                    Capture a screenshot
  computer click <sessionId> <X> <Y> [--button B]    Send a mouse click
  computer type <sessionId> <text...>                Type text
  computer key <sessionId> <KeyName>                 Send a key (Enter, Tab, Ctrl+C)

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
