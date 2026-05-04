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

// Every handler-table route on the daemon lives behind the /api prefix
// so the session-auth middleware (8.14) can gate them. Callers throughout
// this file still write paths as '/create' etc, so prepend here once to
// avoid touching every call site. Existing '/api/...' callers stay as-is.
function withApiPrefix(p) {
  if (typeof p !== 'string' || p.length === 0) return p;
  if (p === '/api' || p.startsWith('/api/')) return p;
  return '/api' + (p.startsWith('/') ? p : '/' + p);
}

// (8.26) Shared SSE subscriber for `c4 wait --follow` and
// `c4 watch-interventions`. Opens a persistent connection to
// /api/approvals/stream and prints every transition. Optional scope:
//   null      -> all workers (implicit)
//   'all'     -> all workers (explicit)
//   [names]   -> filter to these worker names
// Exits on Ctrl+C or daemon disconnect.
function runApprovalFollow({ scope = null } = {}) {
  const token = readToken();
  const qs = token ? `?token=${encodeURIComponent(token)}` : '';
  const streamUrl = new URL(`/api/approvals/stream${qs}`, BASE);
  const filterNames = Array.isArray(scope)
    ? new Set(scope.filter((n) => typeof n === 'string' && n))
    : null;

  const formatEvent = (event) => {
    if (!event || typeof event !== 'object') return '';
    const ts = event.ts ? new Date(event.ts).toISOString() : '';
    const worker = event.worker || '';
    switch (event.type) {
      case 'connected':
        return `[${ts}] connected`;
      case 'snapshot': {
        const rows = Array.isArray(event.workers) ? event.workers : [];
        if (rows.length === 0) return `[${ts}] snapshot: no pending approvals`;
        const items = rows.map((r) => {
          const pending = Math.round((r.pendingMs || 0) / 1000);
          return `${r.name}(${r.internalState || '?'}, ${pending}s)`;
        });
        return `[${ts}] snapshot: ${items.join(', ')}`;
      }
      case 'enter':
        return `[${ts}] APPROVAL ENTER worker=${worker} state=${event.internalState || '?'}`;
      case 'exit': {
        const dur = Math.round((event.durationMs || 0) / 1000);
        const tag = event.reason ? ` reason=${event.reason}` : '';
        return `[${ts}] approval exit worker=${worker} duration=${dur}s${tag}`;
      }
      case 'slack_alert': {
        const pending = Math.round((event.pendingMs || 0) / 1000);
        return `[${ts}] SLACK ALERT worker=${worker} pending=${pending}s`;
      }
      case 'timeout': {
        const pending = Math.round((event.pendingMs || 0) / 1000);
        return `[${ts}] TIMEOUT worker=${worker} pending=${pending}s action=${event.action || 'none'}`;
      }
      default:
        return `[${ts}] ${event.type || 'event'}: ${JSON.stringify(event)}`;
    }
  };

  return new Promise((resolve, reject) => {
    const streamReq = http.get(streamUrl, (res) => {
      if (res.statusCode !== 200) {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const err = JSON.parse(data);
            console.error(`Error: ${err.error || data}`);
          } catch { console.error(`Error: ${data}`); }
          reject(new Error(`HTTP ${res.statusCode}`));
        });
        return;
      }

      const label = Array.isArray(scope) && scope.length > 0
        ? `workers ${scope.join(', ')}`
        : 'all workers';
      process.stderr.write(`Watching approvals for ${label} (Ctrl+C to stop)...\n`);

      let buffer = '';
      res.on('data', (chunk) => {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let event;
          try { event = JSON.parse(line.slice(6)); }
          catch { continue; }
          if (filterNames && event.worker && !filterNames.has(event.worker)) continue;
          const formatted = formatEvent(event);
          if (formatted) process.stdout.write(formatted + '\n');
        }
      });

      res.on('end', () => {
        process.stderr.write('\n--- stream ended ---\n');
        resolve();
      });
    });

    streamReq.on('error', (err) => {
      console.error(`Error: ${err.message}`);
      reject(err);
    });

    process.on('SIGINT', () => {
      streamReq.destroy();
      process.stderr.write('\n');
      process.exit(0);
    });
  });
}

function request(method, path, body = null, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const url = new URL(withApiPrefix(path), BASE);
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

  // (v1.10.93) `c4 --version` / `-v` / `version` — print package
  // version + exit. Handled before the switch so the entry doesn't
  // fall through to "unknown command" usage.
  if (cmd === '--version' || cmd === '-v' || cmd === 'version') {
    const pkg = require('../package.json');
    console.log(pkg.version);
    return;
  }

  try {
    let result;

    switch (cmd) {
      case 'new': {
        const name = args[0];
        // Parse --target, --cwd, --template, --parent, --tier flags
        let target = 'local', cwd = '', template = '', parent = '', tier = '';
        // 8.46: persistent pinned rules. --pin-memory <file> reads a file,
        // --pin-rules <text> is repeatable inline text, --pin-role picks a
        // role-based default template (manager|worker|attached).
        const pinRulesInline = [];
        const pinMemoryFiles = [];
        let pinRole = '';
        const filteredArgs = [];
        let command = 'claude';
        let commandSet = false;
        for (let i = 1; i < args.length; i++) {
          if (args[i] === '--target' && args[i + 1]) { target = args[++i]; }
          else if (args[i] === '--cwd' && args[i + 1]) { cwd = args[++i]; }
          else if (args[i] === '--template' && args[i + 1]) { template = args[++i]; }
          else if (args[i] === '--parent' && args[i + 1]) { parent = args[++i]; }
          else if (args[i] === '--tier' && args[i + 1]) { tier = args[++i]; }
          else if (args[i] === '--pin-memory' && args[i + 1]) { pinMemoryFiles.push(args[++i]); }
          else if (args[i] === '--pin-rules' && args[i + 1]) { pinRulesInline.push(args[++i]); }
          else if (args[i] === '--pin-role' && args[i + 1]) { pinRole = args[++i]; }
          else if (!commandSet) { command = args[i]; commandSet = true; }
          else { filteredArgs.push(args[i]); }
        }
        // Auto-detect parent from spawned worker env (8.2). The daemon
        // injects C4_WORKER_NAME so nested `c4 new` calls know which
        // worker they are running inside. Explicit --parent wins.
        if (!parent && process.env.C4_WORKER_NAME) {
          parent = process.env.C4_WORKER_NAME;
        }
        // 8.46: resolve --pin-memory file paths to their contents here so
        // the daemon only has to deal with a flat string[]. File errors
        // fail fast so operators do not silently lose their pinned rules.
        const pinnedMemory = [];
        for (const f of pinMemoryFiles) {
          try {
            const text = fs.readFileSync(f, 'utf8').trim();
            if (text) pinnedMemory.push(text);
          } catch (e) {
            console.error(`Error reading --pin-memory file '${f}': ${e.message}`);
            process.exit(1);
          }
        }
        for (const r of pinRulesInline) {
          const t = String(r || '').trim();
          if (t) pinnedMemory.push(t);
        }
        const body = { name, command, args: filteredArgs, target, cwd };
        if (template) body.template = template;
        if (parent) body.parent = parent;
        if (tier) body.tier = tier;
        if (pinnedMemory.length > 0) body.pinnedMemory = pinnedMemory;
        if (pinRole) body.pinRole = pinRole;
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
        let budgetUsd = null, maxRetries = null, tier = '', model = '', planDoc = '', workspace = '';
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
          else if (effectiveArgs[i] === '--workspace' && effectiveArgs[i + 1]) { workspace = effectiveArgs[++i]; }
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
        if (workspace) body.workspace = workspace;
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
        // Supports: c4 wait <name>, c4 wait w1 w2 w3, c4 wait --all,
        // c4 wait <name> --follow (8.26 persistent re-arm)
        let waitTimeout = '120000';
        let waitAll = false;
        let interruptOnIntervention = false;
        let followMode = false;
        const waitNames = [];
        for (let i = 0; i < args.length; i++) {
          if (args[i] === '--timeout' && args[i + 1]) { waitTimeout = args[++i]; }
          else if (args[i] === '--all') { waitAll = true; }
          else if (args[i] === '--interrupt-on-intervention') { interruptOnIntervention = true; }
          else if (args[i] === '--follow') { followMode = true; }
          else if (/^\d+$/.test(args[i]) && waitNames.length > 0) { waitTimeout = args[i]; }
          else if (!args[i].startsWith('-')) { waitNames.push(args[i]); }
        }

        // (8.26) --follow: persistent-connection reviewer mode.
        // Subscribes to the approvals SSE stream and prints transitions
        // forever until Ctrl+C. Independent of single/multi/all wait so
        // the reviewer only needs one daemon connection to monitor every
        // worker. Implies --interrupt-on-intervention semantics.
        if (followMode) {
          return runApprovalFollow({
            scope: waitAll ? 'all' : (waitNames.length > 0 ? waitNames : null),
          });
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

      case 'watch-interventions': {
        // (8.26) Standalone approval monitor. Subscribes to the
        // approvals SSE stream and prints every enter / exit /
        // slack_alert / timeout transition until Ctrl+C. Unlike
        // `c4 wait --follow` this command does not consume a worker
        // name and is safe to run outside of a Claude Code reviewer
        // session (e.g. from a terminal tab or a cron-less watchdog).
        let scope = null;
        for (let i = 0; i < args.length; i++) {
          if (args[i] === '--worker' && args[i + 1]) { scope = [args[++i]]; }
          else if (args[i] === '--all') { scope = 'all'; }
        }
        return runApprovalFollow({ scope });
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
              // (8.21) Intervention column: only highlight approval_pending
              // in red; background_exit is yellow; past_resolved / idle /
              // null render as blank so the table stays scannable.
              const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
              let interventionCell = '-';
              if (w.intervention === 'approval_pending') {
                interventionCell = useColor ? '\u001b[31mAPPROVAL\u001b[0m' : 'APPROVAL';
              } else if (w.intervention === 'background_exit') {
                interventionCell = useColor ? '\u001b[33mbg-exit\u001b[0m' : 'bg-exit';
              }
              console.log(`${w.name}\t\t${w.status}\t\t${w.unreadSnapshots}\t${interventionCell}\t\t${w.command}`);
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

      // Aggregated environment health check. Surfaces "what's wrong"
      // without forcing the user to chain multiple commands.
      case 'doctor': {
        const fs2 = require('fs');
        const localPath = require('path');
        const checks = [];
        const tick = '\x1b[32m✓\x1b[0m';
        const cross = '\x1b[31m✗\x1b[0m';
        const warn = '\x1b[33m!\x1b[0m';

        const installedVersion = require('../package.json').version;
        try {
          const h = await request('GET', '/health');
          if (h && h.ok) {
            const match = h.version === installedVersion;
            checks.push({ ok: match, label: `daemon reachable (v${h.version})${match ? '' : ` ⚠ does not match installed v${installedVersion}`}` });
          } else {
            checks.push({ ok: false, label: 'daemon reachable' });
          }
        } catch (e) {
          checks.push({ ok: false, label: `daemon reachable: ${e.message}` });
        }

        const cfgPath = localPath.resolve(__dirname, '..', 'config.json');
        if (fs2.existsSync(cfgPath)) {
          try {
            const cfg = JSON.parse(fs2.readFileSync(cfgPath, 'utf8'));
            const { validate } = require('./config-validate');
            const r = validate(cfg);
            checks.push({
              ok: r.errors.length === 0,
              level: r.errors.length === 0 && r.warnings.length > 0 ? 'warn' : null,
              label: `config.json: ${r.errors.length} error(s), ${r.warnings.length} warning(s)`,
            });
          } catch (e) {
            checks.push({ ok: false, label: `config.json malformed: ${e.message}` });
          }
        } else {
          checks.push({ ok: true, level: 'warn', label: `config.json missing — using defaults at ${cfgPath}` });
        }

        const distDir = localPath.resolve(__dirname, '..', 'web', 'dist');
        const distOk = fs2.existsSync(distDir) && fs2.existsSync(localPath.join(distDir, 'index.html'));
        checks.push({
          ok: distOk,
          level: distOk ? null : 'warn',
          label: distOk ? 'web/dist built' : 'web/dist missing — run `npm run build:web`',
        });

        const logsDir = localPath.resolve(__dirname, '..', 'logs');
        try {
          if (!fs2.existsSync(logsDir)) fs2.mkdirSync(logsDir, { recursive: true });
          const probe = localPath.join(logsDir, '.doctor-probe');
          fs2.writeFileSync(probe, '');
          fs2.unlinkSync(probe);
          checks.push({ ok: true, label: `logs/ writable (${logsDir})` });
        } catch (e) {
          checks.push({ ok: false, label: `logs/ not writable: ${e.message}` });
        }

        // (v1.10.35) OpenAPI spec health: lints clean + has the
        // expected operation count. Doesn't run runtime-drift
        // (would need to spawn workers); the static checks are
        // enough to flag a corrupted ROUTE_SCHEMAS in someone's
        // local checkout.
        try {
          const { buildSpec } = require('./openapi-gen');
          const spec = buildSpec();
          const opCount = Object.values(spec.paths).reduce(
            (acc, ops) => acc + Object.values(ops).filter((o) => typeof o === 'object').length,
            0
          );
          let withResponse = 0;
          for (const ops of Object.values(spec.paths)) {
            for (const op of Object.values(ops)) {
              if (typeof op !== 'object' || !op.responses) continue;
              const r200 = op.responses['200'];
              if (r200 && r200.content && Object.keys(r200.content).length > 0) withResponse++;
            }
          }
          const ok = opCount > 0 && withResponse === opCount;
          checks.push({
            ok,
            level: ok ? null : 'warn',
            label: ok
              ? `openapi spec: ${opCount} operations, all with response schemas`
              : `openapi spec: ${opCount - withResponse}/${opCount} operations missing response schemas`,
          });
        } catch (e) {
          checks.push({ ok: false, label: `openapi spec build failed: ${e.message}` });
        }

        // (v1.10.35) SDK file: present + roughly current. Bare
        // existence + non-trivial size is enough; full type-check
        // belongs in CI, not the doctor.
        const sdkPath = localPath.resolve(__dirname, '..', 'sdk', 'c4-client.ts');
        try {
          const stat = fs2.statSync(sdkPath);
          const size = stat.size;
          const ok = size > 1000;
          checks.push({
            ok,
            label: ok
              ? `sdk/c4-client.ts present (${Math.round(size / 1024)}KB)`
              : `sdk/c4-client.ts unexpectedly small (${size} bytes) — re-run \`c4 openapi --sdk > sdk/c4-client.ts\``,
          });
        } catch {
          checks.push({
            ok: true, level: 'warn',
            label: 'sdk/c4-client.ts missing — re-run `c4 openapi --sdk > sdk/c4-client.ts`',
          });
        }

        // (v1.10.61) Risk classifier status — surfaces enabled/level so an
        // operator running `c4 doctor` after a fresh deployment can spot
        // that enforcement is still off, or that autoDenyLevel was
        // accidentally left at 'low' (which blocks every command).
        try {
          const riskCfg = await request('GET', '/risk/patterns');
          const cfgRes = await request('GET', '/config');
          const riskRunning = cfgRes && cfgRes.config && cfgRes.config.riskClassifier
            ? cfgRes.config.riskClassifier
            : {};
          const enabled = riskRunning.enabled === true;
          const level = riskRunning.autoDenyLevel || 'critical';
          const builtin = riskCfg && riskCfg.counts && riskCfg.counts.builtin
            ? riskCfg.counts.builtin.total : 0;
          const custom = riskCfg && riskCfg.counts && riskCfg.counts.custom
            ? riskCfg.counts.custom.total : 0;
          const allowList = riskCfg && riskCfg.allowList ? riskCfg.allowList : 0;
          const denyList = riskCfg && riskCfg.denyList ? riskCfg.denyList : 0;
          const overrideStr = (custom + allowList + denyList) > 0
            ? ` + ${custom} custom / ${allowList} allow / ${denyList} deny`
            : '';
          if (!enabled) {
            checks.push({
              ok: true, level: 'warn',
              label: `risk classifier: DISABLED (${builtin} patterns loaded${overrideStr}) — flip riskClassifier.enabled=true to enforce`,
            });
          } else {
            // 'low' as autoDenyLevel blocks everything — almost certainly
            // a misconfig. Flag.
            const dangerLevel = level === 'low';
            checks.push({
              ok: !dangerLevel,
              level: dangerLevel ? null : null,
              label: dangerLevel
                ? `risk classifier: enabled at autoDenyLevel='low' — blocks ALL commands. Did you mean 'high' or 'critical'?`
                : `risk classifier: enabled (autoDenyLevel='${level}', ${builtin} patterns${overrideStr})`,
            });
          }
          // (v1.10.143) Fingerprint + recent activity. Surfaces
          // the rule-set hash (operators compare across machines)
          // and 24h denies count so the doctor reports both the
          // configured state AND the operational signal.
          if (riskCfg && typeof riskCfg.fingerprint === 'string') {
            checks.push({
              ok: true, level: null,
              label: `risk fingerprint: ${riskCfg.fingerprint}`,
            });
          }
          try {
            const stats = await request('GET', '/risk/stats?windowHours=24');
            if (stats && !stats.error) {
              const total = (stats.total || 0);
              const shadow = (stats.shadowExec || 0);
              const rotations = (stats.ruleSetRotations || 0);
              const detail = [
                `${total} denies`,
                shadow > 0 ? `${shadow} shadow exec` : null,
                rotations > 1 ? `${rotations} fingerprint rotations` : null,
              ].filter(Boolean).join(', ');
              checks.push({
                ok: rotations <= 1,
                level: rotations > 1 ? 'warn' : null,
                label: `risk activity (24h): ${detail}`,
              });
            }
          } catch { /* stats endpoint optional */ }
        } catch (e) {
          checks.push({
            ok: true, level: 'warn',
            label: `risk classifier: status unavailable (${e.message})`,
          });
        }

        // (v1.10.80) Sandbox runtime — show the configured runtime and
        // its availability probe so an operator can spot a Docker-not-
        // running situation before relying on `--sandbox-preview` /
        // future shadow-exec paths.
        try {
          const cfgRes2 = await request('GET', '/config');
          const sb = cfgRes2 && cfgRes2.config && cfgRes2.config.riskClassifier
            ? cfgRes2.config.riskClassifier.sandbox
            : null;
          if (sb && typeof sb === 'object' && typeof sb.name === 'string') {
            const { getRuntime } = require('./risk-sandbox-runtime');
            try {
              const rt = getRuntime(sb.name, sb.opts);
              const probe = rt.available();
              const iso = rt.describeIsolation();
              // (v1.10.88) Append shadow-exec gate state so the
              // operator sees BOTH "is the runtime reachable" AND
              // "would the daemon actually run a command if asked".
              const execSuffix = sb.allowExec === true
                ? ' [shadow exec ENABLED]'
                : ' [shadow exec disabled — set allowExec:true to enable]';
              if (sb.name === 'null') {
                checks.push({
                  ok: true, level: 'warn',
                  label: `sandbox runtime: NullRuntime (no isolation) — set riskClassifier.sandbox.name='docker' for hardened previews`,
                });
              } else if (probe.ok) {
                checks.push({
                  ok: true,
                  // Promote to warn when shadow exec is enabled so
                  // operators are alerted that the daemon will
                  // actually run commands if /risk/exec is hit.
                  level: sb.allowExec === true ? 'warn' : null,
                  label: `sandbox runtime: ${sb.name} reachable — network=${iso.network}, ${iso.resources}${execSuffix}`,
                });
              } else {
                checks.push({
                  ok: false,
                  label: `sandbox runtime: ${sb.name} probe failed — ${probe.reason}`,
                });
              }
            } catch (rtErr) {
              checks.push({
                ok: false,
                label: `sandbox runtime: construction failed — ${(rtErr && rtErr.message) || rtErr}`,
              });
            }
          } else {
            // No sandbox config — that's fine, it's purely opt-in.
            // Don't push a check; doctor noise is a real problem.
          }
        } catch { /* daemon unavailable — already covered by risk check */ }

        // (v1.10.280) Multi-specialist organism health.
        // Surfaces registry / meeting / score signals so an operator
        // running c4 doctor sees the organism's state alongside daemon
        // health. All checks read-only; no mutations.
        try {
          const summary = await request('GET', '/specialists/summary');
          if (summary && summary.registry) {
            checks.push({
              ok: summary.registry.count > 0,
              label: summary.registry.count > 0
                ? `multi-specialist: ${summary.registry.count} specialist(s) (${summary.registry.vetoCount} veto, ${summary.meetings.total} meetings, ${summary.scores.specialistsWithSamples} scored)`
                : `multi-specialist: registry empty — seed JSON failed to load`,
            });
            // (v1.10.288) Persist integrity — surfaces a corrupt
            // SQLite DB before it eats meetings silently. Skipped
            // when persist is disabled; warns when enabled but the
            // integrity_check returns anything other than 'ok'.
            try {
              const integ = await request('GET', '/meetings/persist-integrity');
              if (integ && integ.enabled === true) {
                if (integ.ok === true) {
                  const persistInfo = summary.persist || {};
                  const sizeStr = (typeof persistInfo.dbSizeBytes === 'number')
                    ? `${(persistInfo.dbSizeBytes / 1024).toFixed(1)}KB`
                    : '-';
                  const rowStr = (typeof persistInfo.rowCount === 'number') ? `${persistInfo.rowCount} row(s)` : '-';
                  checks.push({
                    ok: true,
                    label: `persist: integrity OK (${rowStr}, ${sizeStr})`,
                  });
                } else {
                  checks.push({
                    ok: false,
                    label: `persist: INTEGRITY FAILED — ${(integ.errors || []).slice(0, 3).join('; ')}`,
                  });
                }
              } else if (integ && integ.enabled === false) {
                checks.push({
                  ok: true, level: 'warn',
                  label: 'persist: disabled (in-memory only — meetings vanish on daemon restart)',
                });
              }
            } catch { /* old daemons may lack the endpoint; tolerate */ }
            // (Phase 7.14 follow-up) Auto-backup freshness. If the
            // last clean shutdown was a long time ago, the operator
            // doesn't have a recent recovery point — warn so they
            // know to do a clean restart cycle. Skipped when the
            // file simply doesn't exist (fresh install / first run
            // — that's normal, not a problem).
            const lkg = summary.persist && summary.persist.lastKnownGood;
            if (lkg && lkg.exists && typeof lkg.ageDays === 'number') {
              const STALE_DAYS = 7;
              if (lkg.ageDays > STALE_DAYS) {
                checks.push({
                  ok: true, level: 'warn',
                  label: `backup: last clean shutdown was ${lkg.ageDays.toFixed(1)} days ago — restart the daemon to refresh meetings.last.db`,
                });
              }
            }
            // Flag if there are stuck meetings (warn, not fail).
            try {
              const stuck = await request('GET', '/meetings/stuck?hours=1');
              if (stuck && stuck.count > 0) {
                checks.push({
                  ok: true, level: 'warn',
                  label: `multi-specialist: ${stuck.count} meeting(s) stuck >1h — run \`c4 meeting stuck\` to inspect`,
                });
              }
            } catch { /* stuck endpoint may be missing on old daemons */ }
            // Flag if there are underperformers (warn).
            if (summary.scores.underperformerCount > 0) {
              checks.push({
                ok: true, level: 'warn',
                label: `multi-specialist: ${summary.scores.underperformerCount} underperformer(s) — run \`c4 specialist underperformers\` to inspect`,
              });
            }
          }
        } catch { /* summary endpoint may be missing on old daemons */ }

        const failed = checks.filter((c) => !c.ok).length;
        const warned = checks.filter((c) => c.ok && c.level === 'warn').length;
        // (v1.10.291) --json mode for monitoring/scripting
        // integration. Outputs the full checks array + counts so a
        // shell wrapper can `jq '.failed' / '.warned' / '.checks[]
        // | select(.ok==false)'`. Exit code matches the human
        // path (1 when any check failed).
        if (args.includes('--json')) {
          const out = {
            failed,
            warned,
            ok: failed === 0,
            checks: checks.map((c) => ({
              ok: !!c.ok,
              level: c.level || (c.ok ? 'pass' : 'fail'),
              label: c.label,
            })),
          };
          process.stdout.write(JSON.stringify(out, null, 2) + '\n');
          if (failed) process.exit(1);
          return;
        }
        for (const c of checks) {
          const mark = c.ok ? (c.level === 'warn' ? warn : tick) : cross;
          console.log(`  ${mark} ${c.label}`);
        }
        if (failed) {
          console.log(`\n${failed} failed, ${warned} warning(s).`);
          process.exit(1);
        }
        if (warned) {
          console.log(`\nAll checks passed; ${warned} warning(s).`);
        } else {
          console.log('\nAll checks passed.');
        }
        return;
      }

      // Pretty-printed CPU/RSS snapshot for ops without opening the
      // Web UI. JSON pass-through with --json.
      case 'metrics': {
        const wantJson = args.includes('--json');
        result = await request('GET', '/metrics');
        if (wantJson) break;
        if (!result || result.error) break;
        const fmtKb = (kb) => kb == null ? '—' : (kb < 1024 ? `${kb} KB` : `${(kb / 1024).toFixed(1)} MB`);
        const fmtPct = (pct) => pct == null ? '—' : `${pct.toFixed(1)}%`;
        console.log(`Daemon  pid=${result.daemon.pid}  uptime=${result.daemon.uptimeSec}s  cpus=${result.daemon.cpus}  load=[${result.daemon.loadavg.map((l) => l.toFixed(2)).join(', ')}]`);
        console.log(`        rss=${fmtKb(result.daemon.rssKb)}  heap=${fmtKb(result.daemon.heapUsedKb)}/${fmtKb(result.daemon.heapTotalKb)}`);
        console.log(`Workers ${result.totals.liveWorkers} live / ${result.totals.totalWorkers} total  cpu=${fmtPct(result.totals.totalCpuPct)}  rss=${fmtKb(result.totals.totalRssKb)}`);
        if (result.workers.length > 0) {
          console.log('');
          console.log('  NAME              STATUS     PID    CPU%      RSS    THREADS');
          for (const w of result.workers) {
            const name = String(w.name).slice(0, 16).padEnd(16);
            const status = String(w.status).padEnd(10);
            const pid = String(w.pid ?? '—').padEnd(6);
            const cpu = fmtPct(w.cpuPct).padStart(7);
            const rss = fmtKb(w.rssKb).padStart(8);
            const threads = (w.threads != null ? String(w.threads) : '—').padStart(7);
            console.log(`  ${name}  ${status} ${pid} ${cpu}  ${rss}  ${threads}`);
          }
        }
        result = null;
        break;
      }

      // List configured multi-repo workspaces (config.workspaces).
      case 'workspaces': {
        const wantJson = args.includes('--json');
        result = await request('GET', '/workspaces');
        if (wantJson) break;
        if (!result || result.error) break;
        if (!result.workspaces || result.workspaces.length === 0) {
          console.log('No workspaces configured. Add to config.workspaces (see config.example.json).');
        } else {
          console.log('  NAME              PATH                                            EXISTS  GIT');
          for (const w of result.workspaces) {
            const name = String(w.name).slice(0, 16).padEnd(16);
            const p = String(w.path).slice(-46).padEnd(46);
            const exists = w.exists ? 'yes   ' : 'NO    ';
            const git = w.isGitRepo ? 'yes' : 'no';
            console.log(`  ${name}  ${p}  ${exists}  ${git}`);
          }
        }
        result = null;
        break;
      }

      // OpenAPI spec inspection. `c4 openapi` lists every documented
      // path; `c4 openapi --json` dumps the raw spec; `c4 openapi
      // --yaml` dumps as YAML; `c4 openapi --path <regex>` filters
      // to matching paths; `c4 openapi --sdk` emits the auto-generated
      // TypeScript client. (v1.10.40) `--rbac <regex>` filters to
      // routes whose x-rbac-action matches the regex (e.g.,
      // `--rbac 'WORKER'` shows worker.* gated endpoints);
      // `--untyped` lists open routes (no x-rbac-action). When either
      // RBAC filter is active the listing adds a column for the
      // gating action.
      case 'openapi': {
        const wantJson = args.includes('--json');
        const wantYaml = args.includes('--yaml');
        const wantSdk = args.includes('--sdk');
        const pathFilter = args.includes('--path') ? args[args.indexOf('--path') + 1] : null;
        const rbacFilter = args.includes('--rbac') ? args[args.indexOf('--rbac') + 1] : null;
        const wantUntyped = args.includes('--untyped');
        const roleFilter = args.includes('--role') ? args[args.indexOf('--role') + 1] : null;
        if (wantYaml) {
          // YAML dump — daemon serves it pre-rendered, no CLI-side
          // serialization needed.
          const url = new URL('/openapi.yaml', BASE);
          const yaml = await new Promise((resolve, reject) => {
            http.get(url, (res) => {
              let buf = '';
              res.on('data', (c) => { buf += c; });
              res.on('end', () => resolve(buf));
              res.on('error', reject);
            }).on('error', reject);
          });
          process.stdout.write(yaml);
          result = null;
          break;
        }
        if (wantSdk) {
          // SDK generation — fetch JSON then run sdk-gen locally so
          // the daemon doesn't need a route for every output format.
          const spec = await request('GET', '/openapi.json');
          if (!spec || spec.error) {
            console.error('Failed to fetch spec:', spec?.error || 'unknown error');
            process.exit(1);
          }
          const { generateSdk } = require('./openapi-sdk-gen');
          process.stdout.write(generateSdk(spec));
          result = null;
          break;
        }
        result = await request('GET', '/openapi.json');
        if (wantJson) break;
        if (!result || result.error) break;
        const re = pathFilter ? new RegExp(pathFilter) : null;
        const rbacRe = rbacFilter ? new RegExp(rbacFilter) : null;
        // Resolve --role <name> into the set of x-rbac-action KEYs
        // that role can call. ACTIONS maps KEY → 'dot.action' value;
        // DEFAULT_PERMISSIONS lists role's allowed values; we invert
        // that so the filter accepts the spec's KEY annotation.
        let roleAllowedKeys = null;
        if (roleFilter) {
          try {
            const rbac = require('./rbac');
            const roleVals = rbac.DEFAULT_PERMISSIONS[roleFilter];
            if (!roleVals) {
              console.error(`Unknown role: ${roleFilter} (valid: ${Object.keys(rbac.DEFAULT_PERMISSIONS).join(', ')})`);
              process.exit(1);
            }
            const isWildcard = Array.isArray(roleVals) && roleVals.includes('*');
            if (isWildcard) {
              roleAllowedKeys = new Set(Object.keys(rbac.ACTIONS));
            } else {
              roleAllowedKeys = new Set();
              for (const [key, val] of Object.entries(rbac.ACTIONS)) {
                if (roleVals.includes(val)) roleAllowedKeys.add(key);
              }
            }
          } catch (e) {
            console.error(`Failed to resolve --role: ${e.message}`);
            process.exit(1);
          }
        }
        const entries = [];
        for (const [p, ops] of Object.entries(result.paths)) {
          if (re && !re.test(p)) continue;
          for (const [method, op] of Object.entries(ops)) {
            const rbac = op['x-rbac-action'] || null;
            if (rbacRe && (!rbac || !rbacRe.test(rbac))) continue;
            if (wantUntyped && rbac) continue;
            // --role: keep open routes (no rbac) AND routes the
            // role's actions cover. Drop routes the role can't hit.
            if (roleAllowedKeys && rbac && !roleAllowedKeys.has(rbac)) continue;
            entries.push({ method: method.toUpperCase(), path: p, summary: op.summary, rbac });
          }
        }
        entries.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
        const filterDesc = [];
        if (re) filterDesc.push(`path /${re.source}/`);
        if (rbacRe) filterDesc.push(`rbac /${rbacRe.source}/`);
        if (wantUntyped) filterDesc.push('untyped (no x-rbac-action)');
        if (roleFilter) filterDesc.push(`role=${roleFilter}`);
        const filterStr = filterDesc.length ? ` matching ${filterDesc.join(' + ')}` : '';
        console.log(`Daemon API ${result.info.title} v${result.info.version} — ${entries.length} operation(s)${filterStr}`);
        const showRbac = rbacRe || wantUntyped || roleFilter;
        for (const e of entries) {
          const method = e.method.padEnd(6);
          const path = e.path.padEnd(40);
          const summary = e.summary.length > 80 ? e.summary.slice(0, 77) + '...' : e.summary;
          if (showRbac) {
            const rbacCol = (e.rbac || '(open)').padEnd(22);
            console.log(`  ${method} ${path} ${rbacCol} ${summary}`);
          } else {
            console.log(`  ${method} ${path} ${summary}`);
          }
        }
        result = null;
        break;
      }

      case 'config': {
        if (args[0] === 'reload') {
          result = await request('POST', '/config/reload');
          console.log('Config reloaded.');
        } else if (args[0] === 'validate') {
          // Local config validation — read config.json from the project
          // root (or args[1] if supplied) and report errors / warnings /
          // info. Exits 1 when errors are present so it's CI-friendly.
          // (review fix 2026-05-01) Use the top-level fs / path imports
          // instead of re-requiring inline.
          const cfgPath = args[1] || path.resolve(__dirname, '..', 'config.json');
          if (!fs.existsSync(cfgPath)) {
            console.error(`config not found: ${cfgPath}`);
            process.exit(1);
          }
          let cfg;
          try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); }
          catch (e) {
            console.error(`config is not valid JSON: ${e.message}`);
            process.exit(1);
          }
          const { validate, printReport } = require('./config-validate');
          const report = validate(cfg);
          const ok = printReport(report);
          process.exit(ok ? 0 : 1);
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

      case 'specialist': {
        // (multi-specialist phase 1+4) Inspect the registry + dispatcher.
        //   c4 specialist list [--tier X] [--stage X] [--domain X] [--veto-only] [--tag X]
        //   c4 specialist describe <id>
        //   c4 specialist dispatch "<task>" [--stage X] [--track X] [--cap N]
        //   c4 specialist score [--by-domain D | --by-stage S] [--limit N]
        const sub = (args[0] || 'list').toLowerCase();
        if (!['list', 'describe', 'dispatch', 'score', 'add', 'remove', 'underperformers', 'suggest-prompt', 'export', 'import', 'audit', 'audit-rotate', 'score-history', 'propose', 'apply-prompt', 'tag', 'summary'].includes(sub)) {
          console.error('Usage: c4 specialist <list|describe|dispatch|score|add|remove|underperformers|suggest-prompt|export|import|audit|audit-rotate|score-history|propose|apply-prompt|tag|summary> [args]');
          process.exit(1);
        }
        if (sub === 'list') {
          const qs = new URLSearchParams();
          for (let i = 1; i < args.length; i += 1) {
            const a = args[i];
            if (a === '--tier' && args[i + 1]) { qs.set('tier', args[i + 1]); i += 1; }
            else if (a === '--stage' && args[i + 1]) { qs.set('stage', args[i + 1]); i += 1; }
            else if (a === '--domain' && args[i + 1]) { qs.append('domain', args[i + 1]); i += 1; }
            else if (a === '--veto-only') { qs.set('vetoOnly', '1'); }
            else if (a === '--tag' && args[i + 1]) { qs.append('tag', args[i + 1]); i += 1; }
          }
          const path = qs.toString() ? `/specialists?${qs.toString()}` : '/specialists';
          result = await request('GET', path);
          if (args.includes('--json')) break;
          const specs = Array.isArray(result && result.specialists) ? result.specialists : [];
          console.log(`${specs.length} specialist(s) (registry v${result.version || 0})`);
          for (const s of specs) {
            const veto = s.vetoPower ? ' [veto]' : '';
            const probation = s.probation === 'probation' ? ' [probation]' : '';
            console.log(`  ${s.id.padEnd(22)} tier=${s.tier.padEnd(10)} brain=${s.brain.adapter}/${s.brain.model || '-'}${veto}${probation}`);
            console.log(`  ${' '.repeat(22)} domain=${s.domain.join(',')}`);
            if (Array.isArray(s.tags) && s.tags.length > 0) {
              console.log(`  ${' '.repeat(22)} tags=${s.tags.join(',')}`);
            }
          }
          return;
        }
        if (sub === 'describe') {
          const id = args[1];
          if (!id) {
            console.error('Usage: c4 specialist describe <id> [--include audit,scoreHistory,meetings]');
            process.exit(1);
          }
          const includeParts = [];
          for (let i = 2; i < args.length; i += 1) {
            if (args[i] === '--include' && args[i + 1]) {
              includeParts.push(args[i + 1]);
              i += 1;
            }
          }
          const qs = includeParts.length > 0
            ? `?include=${encodeURIComponent(includeParts.join(','))}`
            : '';
          result = await request('GET', `/specialists/${encodeURIComponent(id)}${qs}`);
          if (args.includes('--json')) break;
          if (result.error) {
            console.error(result.error);
            process.exit(1);
          }
          console.log(`${result.id} — ${result.displayName}`);
          console.log(`  tier:        ${result.tier}`);
          console.log(`  domain:      ${result.domain.join(', ')}`);
          console.log(`  brain:       ${result.brain.adapter} (model=${result.brain.model || '-'}, effort=${result.brain.effort || '-'})`);
          console.log(`  triggers:    keywords=[${result.triggers.keywords.join(', ')}]`);
          console.log(`               stages=[${result.triggers.stages.join(', ')}]`);
          if (result.deliverables.length) console.log(`  deliverables:${result.deliverables.map((d) => `\n               - ${d}`).join('')}`);
          if (result.vetoPower) console.log(`  vetoPower:   true`);
          if (result.probation && result.probation !== 'stable') console.log(`  probation:   ${result.probation}`);
          // (phase 4.1+ persistence) Show the per-domain / per-stage
          // score record so an operator can see how the dispatcher
          // weighs this specialist after past retros.
          if (result.score) {
            const byD = Object.entries(result.score.byDomain || {});
            const byS = Object.entries(result.score.byStage || {});
            const samples = result.score.samples || {};
            const hasAny = byD.length > 0 || byS.length > 0;
            if (hasAny) {
              console.log(`  score:`);
              if (byD.length) {
                console.log(`    by domain:`);
                for (const [d, v] of byD.sort()) {
                  const n = samples[`domain:${d}`] || 0;
                  console.log(`      ${d.padEnd(20)} ${v.toFixed(2)}  (n=${n})`);
                }
              }
              if (byS.length) {
                console.log(`    by stage:`);
                for (const [s, v] of byS.sort()) {
                  const n = samples[`stage:${s}`] || 0;
                  console.log(`      ${s.padEnd(20)} ${v.toFixed(2)}  (n=${n})`);
                }
              }
              if (result.score.lastUpdated) console.log(`    lastUpdated: ${result.score.lastUpdated}`);
            }
          }
          console.log(`\n  systemPrompt:\n    ${result.systemPrompt}`);
          // (phase 6.8) Enrichment sections — only printed when the
          // operator passed --include for the corresponding key.
          if (Array.isArray(result.recentAudit) && result.recentAudit.length > 0) {
            console.log(`\n  recent audit (${result.recentAudit.length}):`);
            for (const e of result.recentAudit.slice(0, 10)) {
              const actor = e.actor ? ` by ${e.actor}` : '';
              const reason = e.reason ? ` — ${e.reason}` : '';
              console.log(`    ${e.ts}  ${e.action}${actor}${reason}`);
            }
          }
          if (Array.isArray(result.scoreHistory) && result.scoreHistory.length > 0) {
            console.log(`\n  score history (${result.scoreHistory.length}):`);
            for (const e of result.scoreHistory.slice(0, 5)) {
              console.log(`    ${e.ts}  meeting=${e.meetingId || '-'}`);
              for (const [k, v] of Object.entries(e.domainDeltas || {})) {
                const before = v.before == null ? '-' : v.before.toFixed(2);
                const after = v.after == null ? '-' : v.after.toFixed(2);
                console.log(`      domain:${k.padEnd(16)} ${before} → ${after}`);
              }
            }
          }
          if (Array.isArray(result.recentMeetings) && result.recentMeetings.length > 0) {
            console.log(`\n  recent meetings (${result.recentMeetings.length}):`);
            for (const m of result.recentMeetings) {
              console.log(`    ${m.id}  status=${m.status}  track=${m.track}  ${m.title}`);
            }
          }
          if (result.scoreEffective) {
            const eff = result.scoreEffective;
            const ageStr = eff.ageDays != null ? `${eff.ageDays.toFixed(1)}d` : '-';
            console.log(`\n  effective score (half-life=${eff.halfLifeDays}d, age=${ageStr}):`);
            const byD = Object.entries(eff.byDomain || {}).sort();
            if (byD.length > 0) {
              console.log(`    by domain (raw → effective):`);
              for (const [d, effVal] of byD) {
                const rawVal = (result.score && result.score.byDomain && result.score.byDomain[d]) || 0;
                console.log(`      ${d.padEnd(20)} ${rawVal.toFixed(2)} → ${effVal.toFixed(2)}`);
              }
            }
            const byS = Object.entries(eff.byStage || {}).sort();
            if (byS.length > 0) {
              console.log(`    by stage  (raw → effective):`);
              for (const [s, effVal] of byS) {
                const rawVal = (result.score && result.score.byStage && result.score.byStage[s]) || 0;
                console.log(`      ${s.padEnd(20)} ${rawVal.toFixed(2)} → ${effVal.toFixed(2)}`);
              }
            }
          }
          return;
        }
        if (sub === 'suggest-prompt') {
          // c4 specialist suggest-prompt <id> [--brain mock|claude] [--threshold N] [--min-samples N]
          const id = args[1];
          if (!id) {
            console.error('Usage: c4 specialist suggest-prompt <id> [--brain mock|claude] [--threshold N] [--min-samples N]');
            process.exit(1);
          }
          let brain = 'mock';
          let threshold = null;
          let minSamples = null;
          let askTimeoutMs = null;
          for (let i = 2; i < args.length; i += 1) {
            const a = args[i];
            if (a === '--brain' && args[i + 1]) { brain = args[i + 1]; i += 1; }
            else if (a === '--threshold' && args[i + 1]) { threshold = parseFloat(args[i + 1]); i += 1; }
            else if (a === '--min-samples' && args[i + 1]) { minSamples = parseInt(args[i + 1], 10); i += 1; }
            else if (a === '--ask-timeout-ms' && args[i + 1]) { askTimeoutMs = parseInt(args[i + 1], 10); i += 1; }
          }
          const body = { brain };
          if (Number.isFinite(threshold)) body.threshold = threshold;
          if (Number.isFinite(minSamples)) body.minSamples = minSamples;
          if (Number.isFinite(askTimeoutMs)) body.askTimeoutMs = askTimeoutMs;
          result = await request('POST', `/specialists/${encodeURIComponent(id)}/suggest-prompt`, body);
          if (args.includes('--json')) break;
          if (result.error) { console.error(result.error); process.exit(1); }
          console.log(`# Current systemPrompt for ${result.specialistId}\n`);
          console.log(result.currentPrompt);
          console.log('');
          if (result.revision) {
            console.log(`# Suggested revision\n`);
            console.log(result.revision);
            console.log('');
          } else {
            console.log('(brain output did not produce a parseable REVISION block)');
          }
          if (result.rationale) {
            console.log(`# Rationale\n`);
            console.log(result.rationale);
          }
          console.log('\nReview-only — apply manually by editing src/specialists.seed.json.');
          return;
        }
        if (sub === 'score-history') {
          // c4 specialist score-history <id> [--limit N]
          const id = args[1];
          if (!id) {
            console.error('Usage: c4 specialist score-history <id> [--limit N]');
            process.exit(1);
          }
          let limit = 20;
          for (let i = 2; i < args.length; i += 1) {
            if (args[i] === '--limit' && args[i + 1]) { limit = parseInt(args[i + 1], 10); i += 1; }
          }
          const qs = new URLSearchParams();
          qs.set('action', 'score-applied');
          qs.set('id', id);
          if (Number.isFinite(limit)) qs.set('limit', String(limit));
          result = await request('GET', `/specialists/audit?${qs.toString()}`);
          if (args.includes('--json')) break;
          if (result.error) { console.error(result.error); process.exit(1); }
          if (result.count === 0) {
            console.log(`No score-applied entries for ${id} yet — run + finalize a meeting that selects this specialist.`);
            return;
          }
          console.log(`Score history for ${id} (${result.count} entries)`);
          for (const e of result.entries) {
            console.log(`  ${e.ts}`);
            for (const [k, v] of Object.entries(e.domainDeltas || {})) {
              const before = v.before == null ? '-' : v.before.toFixed(2);
              const after = v.after == null ? '-' : v.after.toFixed(2);
              console.log(`    domain:${k.padEnd(16)} ${before} → ${after}`);
            }
            for (const [k, v] of Object.entries(e.stageDeltas || {})) {
              const before = v.before == null ? '-' : v.before.toFixed(2);
              const after = v.after == null ? '-' : v.after.toFixed(2);
              console.log(`    stage:${k.padEnd(17)} ${before} → ${after}`);
            }
          }
          return;
        }
        if (sub === 'audit-rotate') {
          // c4 specialist audit-rotate [--max-bytes N] [--archive PATH] [--force]
          let maxBytes = null;
          let archive = null;
          let force = false;
          for (let i = 1; i < args.length; i += 1) {
            const a = args[i];
            if (a === '--max-bytes' && args[i + 1]) { maxBytes = parseInt(args[i + 1], 10); i += 1; }
            else if (a === '--archive' && args[i + 1]) { archive = args[i + 1]; i += 1; }
            else if (a === '--force') { force = true; }
          }
          const body = { force };
          if (Number.isFinite(maxBytes)) body.maxBytes = maxBytes;
          if (archive) body.archive = archive;
          result = await request('POST', '/specialists/audit-rotate', body);
          if (args.includes('--json')) break;
          if (result.error) { console.error(result.error); process.exit(1); }
          if (result.rotated) {
            console.log(`rotated: ${(result.fromBytes / 1024).toFixed(1)}KB → ${result.archivePath}`);
          } else {
            console.log(`no rotation: ${result.reason}`);
          }
          return;
        }
        if (sub === 'audit') {
          // c4 specialist audit [--action add|remove|import|score-applied|prompt-revised|tags-updated]
          //                     [--actor X] [--id X] [--since ISO] [--until ISO] [--limit N]
          let action = null;
          let actor = null;
          let id = null;
          let since = null;
          let until = null;
          let limit = 50;
          for (let i = 1; i < args.length; i += 1) {
            const a = args[i];
            if (a === '--action' && args[i + 1]) { action = args[i + 1]; i += 1; }
            else if (a === '--actor' && args[i + 1]) { actor = args[i + 1]; i += 1; }
            else if (a === '--id' && args[i + 1]) { id = args[i + 1]; i += 1; }
            else if (a === '--since' && args[i + 1]) { since = args[i + 1]; i += 1; }
            else if (a === '--until' && args[i + 1]) { until = args[i + 1]; i += 1; }
            else if (a === '--limit' && args[i + 1]) { limit = parseInt(args[i + 1], 10); i += 1; }
          }
          const qs = new URLSearchParams();
          if (action) qs.set('action', action);
          if (actor) qs.set('actor', actor);
          if (id) qs.set('id', id);
          if (since) qs.set('since', since);
          if (until) qs.set('until', until);
          if (Number.isFinite(limit)) qs.set('limit', String(limit));
          const path = qs.toString() ? `/specialists/audit?${qs.toString()}` : '/specialists/audit';
          result = await request('GET', path);
          if (args.includes('--json')) break;
          if (result.error) { console.error(result.error); process.exit(1); }
          console.log(`${result.count} audit entry(ies)`);
          for (const e of result.entries) {
            // Width 14 fits the longest action ('prompt-revised').
            const tag = e.action.padEnd(14);
            const idCol = (e.id || '-').padEnd(22);
            const actorCol = e.actor || '-';
            let extra = '';
            if (e.action === 'import') {
              extra = ` mode=${e.mode}  +${(e.added || []).length} ~${(e.updated || []).length} -${(e.removed || []).length}`;
            } else if (e.action === 'tags-updated') {
              const before = (e.before || []).length;
              const after = (e.after || []).length;
              extra = ` mode=${e.mode || '?'}  ${before}→${after} tags`;
            } else if (e.action === 'prompt-revised') {
              const beforeLen = (e.before && e.before.systemPrompt) ? e.before.systemPrompt.length : 0;
              extra = ` (prev prompt ${beforeLen}c)`;
            }
            console.log(`  ${e.ts}  ${tag}  ${idCol}  by ${actorCol}${extra}`);
            if (e.reason) console.log(`    reason: ${e.reason}`);
          }
          return;
        }
        if (sub === 'export') {
          // c4 specialist export [--out <file>] [--tag X] [--domain X]
          // Defaults to stdout for piping to jq / git diff. Repeating
          // --tag / --domain AND-composes the filter.
          let outFile = null;
          const tags = [];
          const domains = [];
          for (let i = 1; i < args.length; i += 1) {
            if (args[i] === '--out' && args[i + 1]) { outFile = args[i + 1]; i += 1; }
            else if (args[i] === '--tag' && args[i + 1]) { tags.push(args[i + 1]); i += 1; }
            else if (args[i] === '--domain' && args[i + 1]) { domains.push(args[i + 1]); i += 1; }
          }
          const qs = new URLSearchParams();
          for (const t of tags) qs.append('tag', t);
          for (const d of domains) qs.append('domain', d);
          const path = qs.toString() ? `/specialists/export?${qs.toString()}` : '/specialists/export';
          result = await request('GET', path);
          if (args.includes('--json') && !outFile) break;
          const blob = JSON.stringify(result, null, 2) + '\n';
          if (outFile) {
            require('fs').writeFileSync(outFile, blob);
            console.log(`exported ${result.specialists.length} specialist(s) to ${outFile}`);
          } else {
            process.stdout.write(blob);
          }
          return;
        }
        if (sub === 'import') {
          // c4 specialist import <file> [--mode merge|replace] [--dry-run]
          const src = args[1];
          if (!src) {
            console.error('Usage: c4 specialist import <file> [--mode merge|replace] [--dry-run]');
            process.exit(1);
          }
          let mode = 'merge';
          let dryRun = false;
          for (let i = 2; i < args.length; i += 1) {
            const a = args[i];
            if (a === '--mode' && args[i + 1]) { mode = args[i + 1]; i += 1; }
            else if (a === '--dry-run') { dryRun = true; }
          }
          let bundle;
          try {
            const raw = (src === '-')
              ? require('fs').readFileSync(0, 'utf8')
              : require('fs').readFileSync(src, 'utf8');
            bundle = JSON.parse(raw);
          } catch (err) {
            console.error(`failed to read bundle: ${err.message}`);
            process.exit(1);
          }
          result = await request('POST', '/specialists/import', { bundle, mode, dryRun });
          if (args.includes('--json')) break;
          if (result.error) { console.error(result.error); process.exit(1); }
          const tag = result.dryRun ? '[dry-run]' : '';
          console.log(`${tag}mode=${result.mode}  added=${result.added.length}  updated=${result.updated.length}  removed=${result.removed.length}  errors=${result.errors.length}`);
          if (result.added.length) console.log(`  added:    ${result.added.join(', ')}`);
          if (result.updated.length) console.log(`  updated:  ${result.updated.join(', ')}`);
          if (result.removed.length) console.log(`  removed:  ${result.removed.join(', ')}`);
          if (result.errors.length) {
            for (const e of result.errors) console.log(`  ✗ ${e.id}: ${e.reason}`);
          }
          return;
        }
        if (sub === 'underperformers') {
          // c4 specialist underperformers [--threshold N] [--min-samples N]
          let threshold = null;
          let minSamples = null;
          for (let i = 1; i < args.length; i += 1) {
            const a = args[i];
            if (a === '--threshold' && args[i + 1]) { threshold = parseFloat(args[i + 1]); i += 1; }
            else if (a === '--min-samples' && args[i + 1]) { minSamples = parseInt(args[i + 1], 10); i += 1; }
          }
          const qs = new URLSearchParams();
          if (Number.isFinite(threshold)) qs.set('threshold', String(threshold));
          if (Number.isFinite(minSamples)) qs.set('minSamples', String(minSamples));
          const path = qs.toString() ? `/specialists/underperformers?${qs.toString()}` : '/specialists/underperformers';
          result = await request('GET', path);
          if (args.includes('--json')) break;
          if (result.error) { console.error(result.error); process.exit(1); }
          console.log(`${result.flagged}/${result.total} specialist(s) flagged (threshold=${result.threshold}, minSamples=${result.minSamples})`);
          for (const it of result.items) {
            const b = it.deepestBucket;
            const where = b ? `${b.kind}:${b.name}` : '?';
            console.log(`  ${it.id.padEnd(22)} deepest=${(b ? b.score : 0).toFixed(2)} (${where}, n=${b ? b.samples : 0})`);
            console.log(`    ${it.recommendation}`);
          }
          return;
        }
        if (sub === 'summary') {
          // c4 specialist summary — operator dashboard
          result = await request('GET', '/specialists/summary');
          if (args.includes('--json')) break;
          if (result.error) { console.error(result.error); process.exit(1); }
          const r = result.registry, m = result.meetings, s = result.scores;
          console.log(`registry v${r.version}: ${r.count} specialist(s), ${r.vetoCount} veto`);
          const tierEntries = Object.entries(r.byTier || {}).sort();
          if (tierEntries.length > 0) {
            console.log(`  byTier: ${tierEntries.map(([t, n]) => `${t}=${n}`).join(', ')}`);
          }
          console.log(`meetings: ${m.total} total, ${m.recent24h} in last 24h`);
          const statusEntries = Object.entries(m.byStatus || {}).sort();
          if (statusEntries.length > 0) {
            console.log(`  byStatus: ${statusEntries.map(([k, n]) => `${k}=${n}`).join(', ')}`);
          }
          const trackEntries = Object.entries(m.byTrack || {}).sort();
          if (trackEntries.length > 0) {
            console.log(`  byTrack:  ${trackEntries.map(([k, n]) => `${k}=${n}`).join(', ')}`);
          }
          console.log(`scores: ${s.specialistsWithSamples} specialist(s) with samples; avg=${s.averageSampleCount.toFixed(1)}; underperformers=${s.underperformerCount}`);
          if (result.persist) {
            const p = result.persist;
            if (p.enabled) {
              const sizeStr = (typeof p.dbSizeBytes === 'number')
                ? `${(p.dbSizeBytes / 1024).toFixed(1)}KB`
                : '-';
              const rowStr = (typeof p.rowCount === 'number') ? `${p.rowCount} row(s)` : '-';
              console.log(`persist: ${rowStr}, ${sizeStr} (${p.dbPath || '-'})`);
            } else {
              console.log(`persist: DISABLED (in-memory only — meetings will vanish on daemon restart)`);
            }
            if (p.auditLog && (p.auditLog.bytes != null || p.auditLog.entries != null)) {
              const aSize = (typeof p.auditLog.bytes === 'number')
                ? `${(p.auditLog.bytes / 1024).toFixed(1)}KB`
                : '-';
              const aEntries = (typeof p.auditLog.entries === 'number')
                ? `${p.auditLog.entries} entry(ies)`
                : '-';
              console.log(`audit:   ${aEntries}, ${aSize} (${p.auditLog.path || '-'})`);
            }
            if (p.lastKnownGood) {
              const lkg = p.lastKnownGood;
              if (lkg.exists) {
                const ageStr = (typeof lkg.ageDays === 'number')
                  ? `${lkg.ageDays < 1 ? `${(lkg.ageDays * 24).toFixed(1)}h` : `${lkg.ageDays.toFixed(1)}d`} ago`
                  : '-';
                const sizeStr = (typeof lkg.bytes === 'number')
                  ? `${(lkg.bytes / 1024).toFixed(1)}KB`
                  : '-';
                console.log(`backup:  ${ageStr}, ${sizeStr} (${lkg.path})`);
              } else {
                console.log(`backup:  none yet — no clean shutdown since install`);
              }
            }
          }
          return;
        }
        if (sub === 'tag') {
          // c4 specialist tag <id> [--add t1 t2] [--remove t1 t2] [--set t1 t2]
          //   --set replaces; --add appends; --remove drops; default --set
          //   when no flag is given, treat positional args as --set list.
          const id = args[1];
          if (!id) {
            console.error('Usage: c4 specialist tag <id> [--set t1 t2 | --add t1 t2 | --remove t1 t2]');
            process.exit(1);
          }
          let mode = 'replace';
          const tags = [];
          let i = 2;
          while (i < args.length) {
            const a = args[i];
            if (a === '--set') { mode = 'replace'; i += 1; }
            else if (a === '--add') { mode = 'add'; i += 1; }
            else if (a === '--remove') { mode = 'remove'; i += 1; }
            else if (a === '--json') { i += 1; }
            else { tags.push(a); i += 1; }
          }
          if (tags.length === 0 && mode === 'replace') {
            // Allow `c4 specialist tag <id> --set` to clear.
            // Otherwise fall through.
          }
          result = await request('PATCH', `/specialists/${encodeURIComponent(id)}/tags`, { tags, mode });
          if (args.includes('--json')) break;
          if (result.error) { console.error(result.error); process.exit(1); }
          const tagList = (result.tags || []).join(',') || '(none)';
          console.log(`${result.id}: ${result.changed ? 'updated' : 'unchanged'}  tags=${tagList}`);
          return;
        }
        if (sub === 'apply-prompt') {
          // c4 specialist apply-prompt <id> [--brain mock|claude]
          //                            [--track X] [--no-apply]
          //                            [--threshold N] [--min-samples N]
          const id = args[1];
          if (!id) {
            console.error('Usage: c4 specialist apply-prompt <id> [--brain mock|claude] [--track X] [--no-apply] [--threshold N] [--min-samples N]');
            process.exit(1);
          }
          let brain = 'mock';
          let track = null;
          let autoApply = true;
          let threshold = null;
          let minSamples = null;
          for (let i = 2; i < args.length; i += 1) {
            const a = args[i];
            if (a === '--brain' && args[i + 1]) { brain = args[i + 1]; i += 1; }
            else if (a === '--track' && args[i + 1]) { track = args[i + 1]; i += 1; }
            else if (a === '--no-apply') { autoApply = false; }
            else if (a === '--threshold' && args[i + 1]) { threshold = parseFloat(args[i + 1]); i += 1; }
            else if (a === '--min-samples' && args[i + 1]) { minSamples = parseInt(args[i + 1], 10); i += 1; }
          }
          const body = { brain, autoApply };
          if (track) body.track = track;
          if (Number.isFinite(threshold)) body.threshold = threshold;
          if (Number.isFinite(minSamples)) body.minSamples = minSamples;
          result = await request('POST', `/specialists/${encodeURIComponent(id)}/prompt-apply`, body);
          if (args.includes('--json')) break;
          if (result.error) { console.error(result.error); process.exit(1); }
          const d = result.decision || {};
          if (!result.meetingId) {
            console.log(`prompt-apply ${result.specialistId}: NO REVISION  reason=${d.reason || '-'}`);
            return;
          }
          console.log(`prompt-apply ${result.specialistId}: ${d.accepted ? 'ACCEPTED' : 'REJECTED'}  meeting=${result.meetingId}  status=${result.sessionStatus}`);
          console.log(`  accepts: ${(d.accepts || []).join(', ') || '-'}`);
          if ((d.objects || []).length > 0) {
            console.log(`  objects: ${d.objects.map((o) => `${o.id}${o.reason ? ` (${o.reason})` : ''}`).join(', ')}`);
          }
          if (!d.accepted && d.reason) console.log(`  reason: ${d.reason}`);
          if (d.accepted && result.applied) console.log(`  systemPrompt updated in registry`);
          if (d.accepted && !result.applied) console.log(`  NOT applied (autoApply=false or no change)`);
          if (result.suggestion && result.suggestion.revision) {
            console.log(`  --- proposed revision ---`);
            console.log(result.suggestion.revision);
          }
          return;
        }
        if (sub === 'propose') {
          // c4 specialist propose <file.json | -> [--brain mock|claude]
          //                       [--track X] [--no-apply]
          const src = args[1];
          if (!src) {
            console.error('Usage: c4 specialist propose <file.json | -> [--brain mock|claude] [--track X] [--no-apply]');
            process.exit(1);
          }
          let brain = 'mock';
          let track = null;
          let autoApply = true;
          for (let i = 2; i < args.length; i += 1) {
            const a = args[i];
            if (a === '--brain' && args[i + 1]) { brain = args[i + 1]; i += 1; }
            else if (a === '--track' && args[i + 1]) { track = args[i + 1]; i += 1; }
            else if (a === '--no-apply') { autoApply = false; }
          }
          let candidate;
          try {
            const raw = (src === '-')
              ? require('fs').readFileSync(0, 'utf8')
              : require('fs').readFileSync(src, 'utf8');
            candidate = JSON.parse(raw);
          } catch (err) {
            console.error(`failed to read candidate JSON: ${err.message}`);
            process.exit(1);
          }
          const body = { candidate, brain, autoApply };
          if (track) body.track = track;
          result = await request('POST', '/specialists/propose', body);
          if (args.includes('--json')) break;
          if (result.error) { console.error(result.error); process.exit(1); }
          const d = result.decision;
          console.log(`proposal ${result.candidateId}: ${d.accepted ? 'ACCEPTED' : 'REJECTED'}  meeting=${result.meetingId}  status=${result.sessionStatus}`);
          console.log(`  accepts: ${d.accepts.join(', ') || '-'}`);
          if (d.objects.length > 0) {
            console.log(`  objects: ${d.objects.map((o) => `${o.id}${o.reason ? ` (${o.reason})` : ''}`).join(', ')}`);
          }
          if (!d.accepted && d.reason) console.log(`  reason: ${d.reason}`);
          if (d.accepted && result.added) console.log(`  added to registry`);
          if (d.accepted && !result.added) console.log(`  NOT added (autoApply=false)`);
          return;
        }
        if (sub === 'add') {
          // c4 specialist add <file.json>     read body from JSON file
          // c4 specialist add -                read body from stdin
          const src = args[1];
          if (!src) {
            console.error('Usage: c4 specialist add <file.json | ->');
            process.exit(1);
          }
          let body;
          try {
            const raw = (src === '-')
              ? require('fs').readFileSync(0, 'utf8')
              : require('fs').readFileSync(src, 'utf8');
            body = JSON.parse(raw);
          } catch (err) {
            console.error(`failed to read specialist JSON: ${err.message}`);
            process.exit(1);
          }
          result = await request('POST', '/specialists', body);
          if (args.includes('--json')) break;
          if (result.error) { console.error(result.error); process.exit(1); }
          console.log(`added ${result.specialist.id} (${result.specialist.displayName})`);
          return;
        }
        if (sub === 'remove') {
          const id = args[1];
          if (!id) {
            console.error('Usage: c4 specialist remove <id>');
            process.exit(1);
          }
          result = await request('DELETE', `/specialists/${encodeURIComponent(id)}`);
          if (args.includes('--json')) break;
          if (result.error) { console.error(result.error); process.exit(1); }
          console.log(result.removed ? `removed ${result.id}` : `${result.id} was not present`);
          return;
        }
        if (sub === 'score') {
          // c4 specialist score [--by-domain D | --by-stage S] [--limit N]
          let byDomain = null;
          let byStage = null;
          let limit = 20;
          for (let i = 1; i < args.length; i += 1) {
            const a = args[i];
            if (a === '--by-domain' && args[i + 1]) { byDomain = args[i + 1]; i += 1; }
            else if (a === '--by-stage' && args[i + 1]) { byStage = args[i + 1]; i += 1; }
            else if (a === '--limit' && args[i + 1]) { limit = parseInt(args[i + 1], 10); i += 1; }
          }
          // Pull the full registry, sort by the requested axis,
          // print as a compact table. No new HTTP route — reuses
          // GET /specialists.
          result = await request('GET', '/specialists');
          if (args.includes('--json')) break;
          const specs = (result && result.specialists) || [];
          const rows = [];
          for (const s of specs) {
            const score = s.score || {};
            let v = null;
            let n = 0;
            if (byDomain) {
              v = (score.byDomain || {})[byDomain];
              n = (score.samples || {})[`domain:${byDomain}`] || 0;
            } else if (byStage) {
              v = (score.byStage || {})[byStage];
              n = (score.samples || {})[`stage:${byStage}`] || 0;
            } else {
              // No axis given — average across populated buckets.
              const all = Object.values(score.byDomain || {}).concat(Object.values(score.byStage || {}));
              v = all.length ? all.reduce((a, b) => a + b, 0) / all.length : null;
              n = Object.values(score.samples || {}).reduce((a, b) => a + b, 0);
            }
            if (v == null) continue;
            rows.push({ id: s.id, score: v, samples: n, displayName: s.displayName, tier: s.tier });
          }
          rows.sort((a, b) => b.score - a.score);
          const axis = byDomain ? `domain:${byDomain}` : (byStage ? `stage:${byStage}` : 'mean');
          console.log(`Specialist scoreboard (axis=${axis}, ${rows.length} ranked)`);
          for (const r of rows.slice(0, limit)) {
            console.log(`  ${r.id.padEnd(22)} ${r.score.toFixed(2).padStart(6)}  (n=${r.samples})  ${r.tier}`);
          }
          return;
        }
        if (sub === 'dispatch') {
          const taskParts = [];
          let stage = null;
          let track = null;
          let cap = null;
          for (let i = 1; i < args.length; i += 1) {
            const a = args[i];
            if (a === '--stage' && args[i + 1]) { stage = args[i + 1]; i += 1; }
            else if (a === '--track' && args[i + 1]) { track = args[i + 1]; i += 1; }
            else if (a === '--cap' && args[i + 1]) { cap = parseInt(args[i + 1], 10); i += 1; }
            else { taskParts.push(a); }
          }
          const task = taskParts.join(' ').trim();
          if (!task) {
            console.error('Usage: c4 specialist dispatch "<task description>" [--stage X] [--track X] [--cap N]');
            process.exit(1);
          }
          const body = { task };
          if (stage) body.stage = stage;
          if (track) body.track = track;
          if (Number.isFinite(cap)) body.overrideCap = cap;
          result = await request('POST', '/specialists/dispatch', body);
          if (args.includes('--json')) break;
          if (result.error) {
            console.error(result.error);
            process.exit(1);
          }
          const inferTags = [
            result.inferredTrack ? 'track inferred' : null,
            result.inferredStage ? 'stage inferred' : null,
          ].filter(Boolean).join(', ');
          const inferSuffix = inferTags ? ` (${inferTags})` : '';
          console.log(`Track: ${result.track}  Stage: ${result.stage}  Cap: ${result.cap}  Candidates: ${result.candidates}  Explore: ${result.exploreSlots}${inferSuffix}`);
          for (const s of result.selected) {
            const mark = s._picked === 'exploration' ? '✦' : '·';
            const veto = s.vetoPower ? ' [veto]' : '';
            console.log(`  ${mark} ${s.id.padEnd(22)} score=${s._score.toFixed(2)}${veto}`);
          }
          return;
        }
        break;
      }

      case 'organism': {
        // (multi-specialist phase 7.10 + 8.6) Status surfaces:
        //   c4 organism                 single-frame summary
        //   c4 organism digest [--hours N]  windowed activity log
        const sub = (args[0] || 'status').toLowerCase();
        if (sub === 'digest') {
          // Window defaults to 24h. Pulls audit + meetings + wiki
          // search and filters by the recency cutoff.
          let hours = 24;
          for (let i = 1; i < args.length; i += 1) {
            if (args[i] === '--hours' && args[i + 1]) { hours = parseInt(args[i + 1], 10); i += 1; }
          }
          const cutoffMs = Date.now() - (Number.isFinite(hours) ? hours * 3600 * 1000 : 24 * 3600 * 1000);
          const [audit, meets] = await Promise.all([
            request('GET', `/specialists/audit?limit=200`).catch((e) => ({ error: e.message })),
            request('GET', '/meetings').catch((e) => ({ error: e.message })),
          ]);
          if (args.includes('--json')) {
            result = { hours, cutoff: new Date(cutoffMs).toISOString(), audit, meetings: meets };
            break;
          }
          const auditEntries = (audit && Array.isArray(audit.entries))
            ? audit.entries.filter((e) => new Date(e.ts).getTime() >= cutoffMs)
            : [];
          const meetingsRecent = (meets && Array.isArray(meets.meetings))
            ? meets.meetings.filter((m) => new Date(m.startedAt || m.createdAt).getTime() >= cutoffMs)
            : [];
          console.log(`Organism digest (last ${hours}h, cutoff ${new Date(cutoffMs).toISOString()})`);
          console.log('');
          console.log(`Governance events: ${auditEntries.length}`);
          const byAction = {};
          for (const e of auditEntries) byAction[e.action] = (byAction[e.action] || 0) + 1;
          for (const [action, n] of Object.entries(byAction).sort()) {
            console.log(`  ${action.padEnd(8)} ${n}`);
          }
          console.log('');
          console.log(`Meetings started: ${meetingsRecent.length}`);
          const byStatus = {};
          for (const m of meetingsRecent) byStatus[m.status] = (byStatus[m.status] || 0) + 1;
          for (const [status, n] of Object.entries(byStatus).sort()) {
            console.log(`  ${status.padEnd(11)} ${n}`);
          }
          if (meetingsRecent.length > 0) {
            console.log('  recent ids:');
            for (const m of meetingsRecent.slice(-5)) {
              console.log(`    ${m.id}  ${m.status.padEnd(11)} ${m.title}`);
            }
          }
          return;
        }
        const [specs, meets] = await Promise.all([
          request('GET', '/specialists').catch((e) => ({ error: e.message })),
          request('GET', '/meetings').catch((e) => ({ error: e.message })),
        ]);
        const wikiAttempt = await request('GET', '/wiki/search?q=&limit=1').catch((e) => ({ error: e.message }));

        if (args.includes('--json')) {
          result = {
            specialists: specs,
            meetings: meets,
            wiki: wikiAttempt,
          };
          break;
        }

        const specsCount = (specs && Array.isArray(specs.specialists)) ? specs.specialists.length : 0;
        const scoredCount = (specs && Array.isArray(specs.specialists))
          ? specs.specialists.filter((s) => {
              const score = s.score || {};
              return Object.keys(score.byDomain || {}).length > 0
                || Object.keys(score.byStage || {}).length > 0;
            }).length
          : 0;
        const vetoCount = (specs && Array.isArray(specs.specialists))
          ? specs.specialists.filter((s) => s.vetoPower).length
          : 0;
        console.log(`Specialists: ${specsCount} registered  (${vetoCount} veto, ${scoredCount} with score history)`);
        if (specs && specs.error) console.log(`  ! specialists fetch failed: ${specs.error}`);

        const byStatus = {};
        if (meets && Array.isArray(meets.meetings)) {
          for (const m of meets.meetings) {
            byStatus[m.status] = (byStatus[m.status] || 0) + 1;
          }
        }
        const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
        const segments = ['pending', 'in-progress', 'completed', 'escalated', 'aborted']
          .map((s) => `${s}=${byStatus[s] || 0}`).join('  ');
        console.log(`Meetings:    ${total} total  (${segments})`);
        if (meets && meets.error) console.log(`  ! meetings fetch failed: ${meets.error}`);

        const wikiTotal = wikiAttempt && Number.isFinite(wikiAttempt.total) ? wikiAttempt.total : 0;
        const wikiRoot = (wikiAttempt && wikiAttempt.wikiRoot) || '-';
        console.log(`Wiki:        ${wikiTotal} page(s) under ${wikiRoot}`);
        if (wikiAttempt && wikiAttempt.error) console.log(`  ! wiki search failed: ${wikiAttempt.error}`);
        return;
      }

      case 'wiki': {
        // (multi-specialist phase 3.2 + 3.3) Search + read + reopen.
        //   c4 wiki search "<query>" [--type X] [--status S] [--limit N] [--stale]
        //   c4 wiki read <relative-path> [--wiki-root PATH]
        //   c4 wiki reopen <relative-path> [--track X] [--no-follow-related]
        //                                  [--max-related N] [--no-mark]
        const sub = (args[0] || 'search').toLowerCase();
        if (!['search', 'read', 'reopen', 'publish-all'].includes(sub)) {
          console.error('Usage: c4 wiki <search|read|reopen|publish-all> [...]');
          process.exit(1);
        }
        if (sub === 'publish-all') {
          // c4 wiki publish-all [--wiki-root PATH] [--force]
          //                     [--git-commit] [--git-push]
          let wikiRoot = null;
          let force = false;
          let gitCommit = false;
          let gitPush = false;
          for (let i = 1; i < args.length; i += 1) {
            const a = args[i];
            if (a === '--wiki-root' && args[i + 1]) { wikiRoot = args[i + 1]; i += 1; }
            else if (a === '--force') { force = true; }
            else if (a === '--git-commit') { gitCommit = true; }
            else if (a === '--git-push') { gitPush = true; gitCommit = true; }
          }
          const body = {};
          if (wikiRoot) body.wikiRoot = wikiRoot;
          if (force) body.force = true;
          if (gitCommit) body.gitCommit = true;
          if (gitPush) body.gitPush = true;
          result = await request('POST', '/wiki/publish-all', body);
          if (args.includes('--json')) break;
          if (result.error) { console.error(result.error); process.exit(1); }
          console.log(`published ${result.publishedCount} / skipped ${result.skippedCount}  (${result.wikiRoot})`);
          for (const p of result.published || []) {
            console.log(`  + ${p.id}: ${(p.files || []).map((f) => f.replace(result.wikiRoot + '/', '')).join(', ')}`);
            if (p.git && p.git.committed) console.log(`    git ${p.git.sha ? p.git.sha.slice(0, 7) : '-'} committed${p.git.pushed ? ' + pushed' : ''}`);
          }
          for (const s of result.skipped || []) {
            console.log(`  - ${s.id}: ${s.reason}`);
          }
          return;
        }
        if (sub === 'search') {
          let type = 'any';
          let status = null;
          let limit = 10;
          let stale = false;
          let wikiRoot = null;
          const qParts = [];
          for (let i = 1; i < args.length; i += 1) {
            const a = args[i];
            if (a === '--type' && args[i + 1]) { type = args[i + 1]; i += 1; }
            else if (a === '--status' && args[i + 1]) { status = args[i + 1]; i += 1; }
            else if (a === '--limit' && args[i + 1]) { limit = parseInt(args[i + 1], 10); i += 1; }
            else if (a === '--stale') { stale = true; }
            else if (a === '--wiki-root' && args[i + 1]) { wikiRoot = args[i + 1]; i += 1; }
            else qParts.push(a);
          }
          const qs = new URLSearchParams();
          qs.set('q', qParts.join(' '));
          if (type) qs.set('type', type);
          if (status) qs.set('status', status);
          if (Number.isFinite(limit)) qs.set('limit', String(limit));
          if (stale) qs.set('includeStale', '1');
          if (wikiRoot) qs.set('wikiRoot', wikiRoot);
          result = await request('GET', `/wiki/search?${qs.toString()}`);
          if (args.includes('--json')) break;
          if (result.error) { console.error(result.error); process.exit(1); }
          console.log(`${result.total} hit(s) (showing ${result.hits.length}) in ${result.wikiRoot}`);
          for (const h of result.hits) {
            console.log(`  [${h.type}] ${h.path}  score=${h.score}  ${h.title}`);
            if (h.snippet) console.log(`    ${h.snippet}`);
          }
          return;
        }
        if (sub === 'read') {
          const relP = args[1];
          if (!relP) {
            console.error('Usage: c4 wiki read <relative-path> [--wiki-root PATH]');
            process.exit(1);
          }
          let wikiRoot = null;
          for (let i = 2; i < args.length; i += 1) {
            if (args[i] === '--wiki-root' && args[i + 1]) { wikiRoot = args[i + 1]; i += 1; }
          }
          const body = { path: relP };
          if (wikiRoot) body.wikiRoot = wikiRoot;
          result = await request('POST', '/wiki/read', body);
          if (args.includes('--json')) break;
          if (result.error) { console.error(result.error); process.exit(1); }
          console.log(`# ${result.frontmatter.title || result.path}`);
          console.log(`(type=${result.frontmatter.type || '-'}, status=${result.frontmatter.status || '-'})`);
          console.log('');
          console.log(result.body);
          return;
        }
        if (sub === 'reopen') {
          const relP = args[1];
          if (!relP) {
            console.error('Usage: c4 wiki reopen <relative-path> [--track X] [--no-follow-related] [--max-related N] [--no-mark] [--wiki-root PATH]');
            process.exit(1);
          }
          let wikiRoot = null;
          let track = null;
          let followRelated = true;
          let maxRelated = null;
          let markReopened = true;
          let title = null;
          for (let i = 2; i < args.length; i += 1) {
            const a = args[i];
            if (a === '--wiki-root' && args[i + 1]) { wikiRoot = args[i + 1]; i += 1; }
            else if (a === '--track' && args[i + 1]) { track = args[i + 1]; i += 1; }
            else if (a === '--no-follow-related') { followRelated = false; }
            else if (a === '--max-related' && args[i + 1]) { maxRelated = parseInt(args[i + 1], 10); i += 1; }
            else if (a === '--no-mark') { markReopened = false; }
            else if (a === '--title' && args[i + 1]) { title = args[i + 1]; i += 1; }
          }
          const body = { path: relP, followRelated, markReopened };
          if (wikiRoot) body.wikiRoot = wikiRoot;
          if (track) body.track = track;
          if (Number.isFinite(maxRelated)) body.maxRelated = maxRelated;
          if (title) body.meetingTitle = title;
          result = await request('POST', '/wiki/reopen', body);
          if (args.includes('--json')) break;
          if (result.error) { console.error(result.error); process.exit(1); }
          console.log(`Reopened ${result.originalPath}${result.originalUpdated ? ' (status flipped)' : ''}`);
          console.log(`Meeting ${result.meeting.id} — ${result.meeting.title}  status=${result.meeting.status}  track=${result.meeting.track}`);
          console.log(`Context seeds: ${result.contextSeeds.length}`);
          for (const s of result.contextSeeds) {
            console.log(`  - [${s.status || '-'}] ${s.path}${s.title ? ` — ${s.title}` : ''}`);
          }
          return;
        }
        break;
      }

      case 'meeting': {
        // (multi-specialist phase 2.1+2.2) Drive multi-stage meetings.
        //   c4 meeting plan "<task>" [--track X] [--cap N]      preview only
        //   c4 meeting create "<task>" [--track X] [--cap N]    create + store
        //   c4 meeting start <id>
        //   c4 meeting status <id>
        //   c4 meeting list [--status S]
        //   c4 meeting transcript <id>
        //   c4 meeting contribute <id> <specialistId> "<text>" [--vote accept|object] [--reason "..."]
        //   c4 meeting vote <id> <specialistId> <accept|object> ["reason"...]
        //   c4 meeting advance <id>
        //   c4 meeting next-round <id>
        //   c4 meeting escalate <id> ["reason"...]
        //   c4 meeting abort <id> ["reason"...]
        const sub = (args[0] || 'plan').toLowerCase();
        const VALID = ['plan', 'create', 'start', 'status', 'list', 'transcript', 'contribute', 'vote', 'advance', 'next-round', 'escalate', 'abort', 'run', 'retro', 'finalize', 'publish', 'peer-retro', 'watch', 'watch-all', 'templates', 'template-add', 'template-remove', 'prune', 'prune-old', 'backup', 'fork', 'actions', 'classify-track', 'lineage', 'recap', 'stuck', 'search', 'fts-rebuild'];
        if (!VALID.includes(sub)) {
          console.error(`Usage: c4 meeting <${VALID.join('|')}> [...]`);
          process.exit(1);
        }

        // Helpers shared across sub-commands.
        const printPlan = (plan) => {
          const inferred = plan.inferredTrack ? ' (inferred)' : '';
          console.log(`Meeting ${plan.meetingId || plan.id} — ${plan.title || ''}`);
          if (plan.consensusPolicy) {
            console.log(`Track: ${plan.track}${inferred}  Roster: ${plan.rosterSize}  Est tokens: ${plan.estimatedTokens}`);
            console.log(`Consensus: ${plan.consensusPolicy.mode}  RoundCap: ${plan.consensusPolicy.roundCap}  Veto: ${plan.consensusPolicy.allowVeto}`);
          } else if (plan.track) {
            console.log(`Track: ${plan.track}  Status: ${plan.status}  Stage: ${plan.currentStage || '-'}  Round: ${plan.currentRound || 0}`);
          }
          if (Array.isArray(plan.stages)) {
            for (const s of plan.stages) {
              const cap = s.cap || (s.specialists ? s.specialists.length : '-');
              const cand = s.candidates != null ? `  candidates=${s.candidates}` : '';
              const expl = s.exploreSlots != null ? `  explore=${s.exploreSlots}` : '';
              console.log(`\n  [${s.stage}]  cap=${cap}${cand}${expl}`);
              if (Array.isArray(s.specialists)) {
                for (const sp of s.specialists) {
                  const mark = sp.pickReason === 'exploration' ? '✦' : '·';
                  const veto = sp.vetoPower ? ' [veto]' : '';
                  const score = (typeof sp.score === 'number') ? `score=${sp.score.toFixed(2)}` : '';
                  console.log(`    ${mark} ${sp.id.padEnd(22)} ${score}${veto}`);
                }
              }
              if (s.deliverables && s.deliverables.length) {
                console.log(`    deliverables: ${s.deliverables.join(', ')}`);
              }
              if (s.consensus) {
                const c = s.consensus;
                console.log(`    consensus[${c.mode}] round=${c.round} accepts=${c.accepts.length} objects=${c.objects.length} missing=${c.missing.length} reached=${c.reached}`);
              }
            }
          }
        };

        if (sub === 'plan' || sub === 'create') {
          const taskParts = [];
          let track = null;
          let cap = null;
          let template = null;
          const vars = {};
          let requireAllVars = false;
          for (let i = 1; i < args.length; i += 1) {
            const a = args[i];
            if (a === '--track' && args[i + 1]) { track = args[i + 1]; i += 1; }
            else if (a === '--cap' && args[i + 1]) { cap = parseInt(args[i + 1], 10); i += 1; }
            else if (a === '--template' && args[i + 1]) { template = args[i + 1]; i += 1; }
            else if (a === '--var' && args[i + 1]) {
              const eq = args[i + 1].indexOf('=');
              if (eq > 0) vars[args[i + 1].slice(0, eq)] = args[i + 1].slice(eq + 1);
              i += 1;
            }
            else if (a === '--require-all-vars') { requireAllVars = true; }
            else { taskParts.push(a); }
          }
          const task = taskParts.join(' ').trim();
          if (!task && !template) {
            console.error(`Usage: c4 meeting ${sub} "<task>" [--track X] [--cap N] [--template <name>] [--var key=value ...] [--require-all-vars]`);
            process.exit(1);
          }
          const body = {};
          if (task) body.task = task;
          if (template) body.template = template;
          if (track) body.track = track;
          if (Number.isFinite(cap)) body.overrideCap = cap;
          if (Object.keys(vars).length > 0) body.vars = vars;
          if (requireAllVars) body.requireAllVars = true;
          const path = sub === 'plan' ? '/meetings/plan' : '/meetings';
          result = await request('POST', path, body);
          if (args.includes('--json')) break;
          if (result.error) {
            console.error(result.error);
            if (result.missing && result.missing.length) {
              console.error(`  missing vars: ${result.missing.join(', ')}`);
            }
            process.exit(1);
          }
          printPlan(result);
          return;
        }
        if (sub === 'prune') {
          // c4 meeting prune <id>           drop a single meeting
          // c4 meeting prune --terminal     drop every completed/escalated/aborted
          let target = null;
          let terminal = false;
          for (let i = 1; i < args.length; i += 1) {
            const a = args[i];
            if (a === '--terminal') { terminal = true; }
            else if (!target && !a.startsWith('--')) { target = a; }
          }
          if (terminal) {
            const list = await request('GET', '/meetings');
            const drop = (list.meetings || []).filter((m) => ['completed', 'escalated', 'aborted'].includes(m.status));
            for (const m of drop) {
              await request('DELETE', `/meetings/${encodeURIComponent(m.id)}`);
            }
            console.log(`pruned ${drop.length} terminal meeting(s)`);
            return;
          }
          if (!target) {
            console.error('Usage: c4 meeting prune <id> | c4 meeting prune --terminal');
            process.exit(1);
          }
          result = await request('DELETE', `/meetings/${encodeURIComponent(target)}`);
          if (args.includes('--json')) break;
          if (result.error) { console.error(result.error); process.exit(1); }
          console.log(result.removed ? `pruned ${result.id}` : `${result.id} not present`);
          return;
        }
        if (sub === 'templates') {
          // c4 meeting templates           list
          // c4 meeting templates <name>    show one
          const name = args[1];
          if (name) {
            result = await request('GET', `/meetings/templates/${encodeURIComponent(name)}`);
            if (args.includes('--json')) break;
            if (result.error) { console.error(result.error); process.exit(1); }
            console.log(`${result.name}: ${result.task}`);
            if (result.track) console.log(`  track: ${result.track}`);
            if (result.brain) console.log(`  brain: ${result.brain}`);
            if (result.description) console.log(`  description: ${result.description}`);
            if (result.notes) console.log(`  notes: ${result.notes}`);
            console.log(`  created: ${result.createdAt}  updated: ${result.updatedAt}`);
            return;
          }
          result = await request('GET', '/meetings/templates');
          if (args.includes('--json')) break;
          if (result.error) { console.error(result.error); process.exit(1); }
          console.log(`${result.count} template(s)`);
          for (const t of result.templates) {
            const trackBit = t.track ? ` [${t.track}]` : '';
            const brainBit = t.brain ? ` (${t.brain})` : '';
            console.log(`  ${t.name}${trackBit}${brainBit}  — ${t.task}`);
          }
          return;
        }
        if (sub === 'template-add') {
          // c4 meeting template-add <name> "<task>" [--track X] [--brain X] [--desc "..."]
          const name = args[1];
          if (!name) {
            console.error('Usage: c4 meeting template-add <name> "<task>" [--track X] [--brain X] [--desc "..."]');
            process.exit(1);
          }
          let track = null;
          let brain = null;
          let description = null;
          const taskParts = [];
          for (let i = 2; i < args.length; i += 1) {
            const a = args[i];
            if (a === '--track' && args[i + 1]) { track = args[i + 1]; i += 1; }
            else if (a === '--brain' && args[i + 1]) { brain = args[i + 1]; i += 1; }
            else if (a === '--desc' && args[i + 1]) { description = args[i + 1]; i += 1; }
            else { taskParts.push(a); }
          }
          const task = taskParts.join(' ').trim();
          if (!task) {
            console.error('template-add: task required');
            process.exit(1);
          }
          const body = { name, task };
          if (track) body.track = track;
          if (brain) body.brain = brain;
          if (description) body.description = description;
          result = await request('POST', '/meetings/templates', body);
          if (args.includes('--json')) break;
          if (result.error) { console.error(result.error); process.exit(1); }
          console.log(`saved template ${result.template.name}`);
          return;
        }
        if (sub === 'template-remove') {
          const name = args[1];
          if (!name) {
            console.error('Usage: c4 meeting template-remove <name>');
            process.exit(1);
          }
          result = await request('DELETE', `/meetings/templates/${encodeURIComponent(name)}`);
          if (args.includes('--json')) break;
          if (result.error) { console.error(result.error); process.exit(1); }
          console.log(result.removed ? `removed template ${result.name}` : `${result.name} not present`);
          return;
        }

        if (sub === 'watch-all') {
          // c4 meeting watch-all — tail GET /meetings/stream
          // Multi-line SSE format ("event: NAME\ndata: JSON\n\n") so
          // we buffer until each blank line and then dispatch.
          const watchUrl = new URL('/meetings/stream', BASE);
          process.stderr.write('Tailing /meetings/stream... Ctrl+C to stop\n');
          const req = http.get(watchUrl, (res) => {
            if (res.statusCode !== 200) {
              console.error(`Error: HTTP ${res.statusCode}`);
              process.exit(1);
            }
            let buffer = '';
            res.on('data', (chunk) => {
              buffer += chunk.toString();
              while (true) {
                const sep = buffer.indexOf('\n\n');
                if (sep < 0) break;
                const frame = buffer.slice(0, sep);
                buffer = buffer.slice(sep + 2);
                let evtName = 'message';
                let dataStr = '';
                for (const line of frame.split('\n')) {
                  if (line.startsWith('event: ')) evtName = line.slice(7).trim();
                  else if (line.startsWith('data: ')) dataStr += line.slice(6);
                }
                if (!dataStr) continue;
                let payload;
                try { payload = JSON.parse(dataStr); } catch { continue; }
                if (evtName === 'heartbeat') continue;
                const ts = new Date().toISOString().slice(11, 23);
                if (evtName === 'snapshot') {
                  console.log(`${ts} \x1b[36msnapshot\x1b[0m  ${payload.count} meeting(s)`);
                  for (const m of payload.sessions || []) {
                    console.log(`         ${m.id}  status=${m.status}  track=${m.track}  ${m.title || ''}`);
                  }
                } else if (evtName === 'meeting-added') {
                  const s = payload.summary || {};
                  console.log(`${ts} \x1b[32m+meeting\x1b[0m  ${payload.id}  status=${s.status || '?'}  ${s.title || ''}`);
                } else if (evtName === 'meeting-removed') {
                  console.log(`${ts} \x1b[31m-meeting\x1b[0m  ${payload.id}`);
                } else if (evtName === 'state') {
                  const e = (payload.payload || {});
                  const eventStr = payload.event || '?';
                  const detail = e.stage || e.specialistId || e.newStage || '';
                  console.log(`${ts} \x1b[33mstate\x1b[0m     ${payload.meetingId || '?'}  ${eventStr}${detail ? '  ' + detail : ''}  status=${payload.status || '?'}`);
                } else {
                  const rest = JSON.stringify(payload);
                  console.log(`${ts} ${evtName.padEnd(14)} ${rest.length > 200 ? rest.slice(0, 200) + '…' : rest}`);
                }
              }
            });
            res.on('end', () => process.exit(0));
          });
          req.on('error', (e) => { console.error(`Error: ${e.message}`); process.exit(1); });
          process.on('SIGINT', () => { req.destroy(); process.stderr.write('\n'); process.exit(0); });
          return;
        }
        if (sub === 'backup') {
          // c4 meeting backup --out <path.db> [--force]
          let outPath = null;
          let force = false;
          for (let i = 1; i < args.length; i += 1) {
            if (args[i] === '--out' && args[i + 1]) { outPath = args[i + 1]; i += 1; }
            else if (args[i] === '--force') { force = true; }
          }
          if (!outPath) {
            console.error('Usage: c4 meeting backup --out <target-path.db> [--force]');
            process.exit(1);
          }
          result = await request('POST', '/meetings/persist-backup', { path: outPath, force });
          if (args.includes('--json')) break;
          if (result.error) { console.error(result.error); process.exit(1); }
          const sizeStr = (typeof result.bytes === 'number')
            ? ` (${(result.bytes / 1024).toFixed(1)}KB)`
            : '';
          console.log(`backed up to ${result.path}${sizeStr}`);
          return;
        }
        if (sub === 'prune-old') {
          // c4 meeting prune-old [--days N] [--include-active]
          //                      [--dry-run] [--vacuum]
          let days = null;
          let terminalOnly = true;
          let dryRun = false;
          let vacuum = false;
          for (let i = 1; i < args.length; i += 1) {
            const a = args[i];
            if (a === '--days' && args[i + 1]) { days = parseInt(args[i + 1], 10); i += 1; }
            else if (a === '--include-active') { terminalOnly = false; }
            else if (a === '--dry-run') { dryRun = true; }
            else if (a === '--vacuum') { vacuum = true; }
          }
          const body = { terminalOnly, dryRun, vacuum };
          if (Number.isFinite(days)) body.days = days;
          result = await request('POST', '/meetings/prune-old', body);
          if (args.includes('--json')) break;
          if (result.error) { console.error(result.error); process.exit(1); }
          const verb = result.dryRun ? 'would prune' : 'pruned';
          console.log(`${verb} ${result.count} meeting(s)  (cutoff=${result.cutoffISO}, days=${result.days}, terminalOnly=${result.terminalOnly})`);
          for (const id of (result.ids || []).slice(0, 20)) {
            console.log(`  ${id}`);
          }
          if ((result.ids || []).length > 20) {
            console.log(`  ... ${result.ids.length - 20} more`);
          }
          if (result.vacuumed) {
            const reclaimed = (typeof result.reclaimedBytes === 'number')
              ? `reclaimed ${(result.reclaimedBytes / 1024).toFixed(1)}KB (${result.beforeBytes}→${result.afterBytes} bytes)`
              : 'VACUUM ran';
            console.log(`  ${reclaimed}`);
          }
          return;
        }
        if (sub === 'fts-rebuild') {
          // c4 meeting fts-rebuild — force-rebuild the FTS5 index
          result = await request('POST', '/meetings/fts-rebuild', {});
          if (args.includes('--json')) break;
          if (result.error) { console.error(result.error); process.exit(1); }
          console.log(`fts-rebuild: indexed ${result.indexed} meeting(s)  (FTS rows ${result.before} → ${result.after})`);
          return;
        }
        if (sub === 'search') {
          // c4 meeting search "query" [--limit N]
          let limit = null;
          const qParts = [];
          for (let i = 1; i < args.length; i += 1) {
            if (args[i] === '--limit' && args[i + 1]) { limit = parseInt(args[i + 1], 10); i += 1; }
            else if (args[i] === '--json') { /* handled below */ }
            else qParts.push(args[i]);
          }
          const q = qParts.join(' ');
          if (!q) {
            console.error('Usage: c4 meeting search "<query>" [--limit N]');
            process.exit(1);
          }
          const qs = new URLSearchParams();
          qs.set('q', q);
          if (Number.isFinite(limit)) qs.set('limit', String(limit));
          result = await request('GET', `/meetings/search?${qs.toString()}`);
          if (args.includes('--json')) break;
          if (result.error) { console.error(result.error); process.exit(1); }
          console.log(`${result.count} match(es) for "${q}"`);
          for (const r of result.results || []) {
            console.log(`  ${r.id}  ${r.status.padEnd(11)}  ${r.createdAt}  rank=${r.rank.toFixed(2)}`);
            if (r.snippet) console.log(`    ${r.snippet}`);
          }
          return;
        }
        if (sub === 'stuck') {
          // c4 meeting stuck [--hours N] — meetings stuck in pending /
          // in-progress for >= N hours (default 1).
          let hours = null;
          for (let i = 1; i < args.length; i += 1) {
            if (args[i] === '--hours' && args[i + 1]) { hours = args[i + 1]; i += 1; }
          }
          const path = hours ? `/meetings/stuck?hours=${encodeURIComponent(hours)}` : '/meetings/stuck';
          result = await request('GET', path);
          if (args.includes('--json')) break;
          if (result.error) { console.error(result.error); process.exit(1); }
          console.log(`${result.count} stuck meeting(s) (cutoff=${result.cutoffHours}h)`);
          for (const m of result.stuck || []) {
            console.log(`  ${m.id}  ${m.status.padEnd(11)}  age=${m.ageHours.toFixed(1)}h  stage=${m.currentStage || '-'}/r${m.currentRound || 0}  ${m.title}`);
          }
          return;
        }
        if (sub === 'list') {
          let status = null;
          let track = null;
          let since = null;
          let limit = null;
          for (let i = 1; i < args.length; i += 1) {
            if (args[i] === '--status' && args[i + 1]) { status = args[i + 1]; i += 1; }
            else if (args[i] === '--track' && args[i + 1]) { track = args[i + 1]; i += 1; }
            else if (args[i] === '--since' && args[i + 1]) { since = args[i + 1]; i += 1; }
            else if (args[i] === '--limit' && args[i + 1]) { limit = args[i + 1]; i += 1; }
          }
          const qs = new URLSearchParams();
          if (status) qs.set('status', status);
          if (track) qs.set('track', track);
          if (since) qs.set('since', since);
          if (limit) qs.set('limit', limit);
          const path = qs.toString() ? `/meetings?${qs.toString()}` : '/meetings';
          result = await request('GET', path);
          if (args.includes('--json')) break;
          if (result.error) { console.error(result.error); process.exit(1); }
          const cap = (typeof result.totalBeforeLimit === 'number' && result.totalBeforeLimit > result.count)
            ? `  (showing ${result.count}/${result.totalBeforeLimit})`
            : '';
          console.log(`${result.count} meeting(s)${cap}`);
          for (const m of result.meetings) {
            const fork = m.forkOf ? ` ← ${m.forkOf}` : '';
            console.log(`  ${m.id}  ${m.status.padEnd(11)}  track=${m.track}  stage=${m.currentStage || '-'}/r${m.currentRound || 0}  ${m.title}${fork}`);
          }
          return;
        }

        // All remaining sub-commands target a specific meeting id.
        const id = args[1];
        if (!id) {
          console.error(`Usage: c4 meeting ${sub} <id> [...]`);
          process.exit(1);
        }
        const idEnc = encodeURIComponent(id);

        if (sub === 'status') {
          result = await request('GET', `/meetings/${idEnc}`);
          if (args.includes('--json')) break;
          if (result.error) { console.error(result.error); process.exit(1); }
          printPlan(result);
          return;
        }
        if (sub === 'watch') {
          // c4 meeting watch <id>      tail meeting state transitions over SSE
          // Snapshot + each event line printed live. Exits on terminal event or Ctrl+C.
          const url = new URL(`/meetings/${encodeURIComponent(id)}/stream`, BASE);
          const token = readToken();
          const httpOpts = token ? { headers: { 'Authorization': `Bearer ${token}` } } : {};
          await new Promise((resolve) => {
            const req2 = http.get(url, httpOpts, (res2) => {
              if (res2.statusCode !== 200) {
                console.error(`stream returned ${res2.statusCode}`);
                process.exit(1);
              }
              process.stderr.write(`watching ${id}... Ctrl+C to stop\n`);
              let buf = '';
              res2.on('data', (chunk) => {
                buf += chunk.toString('utf8');
                let idx;
                while ((idx = buf.indexOf('\n\n')) >= 0) {
                  const block = buf.slice(0, idx);
                  buf = buf.slice(idx + 2);
                  let event = 'message';
                  let data = '';
                  for (const line of block.split('\n')) {
                    if (line.startsWith('event: ')) event = line.slice(7).trim();
                    else if (line.startsWith('data: ')) data += line.slice(6);
                  }
                  if (event === 'heartbeat') continue;
                  if (event === 'snapshot') {
                    try {
                      const snap = JSON.parse(data);
                      console.log(`[snapshot] ${snap.id}  status=${snap.status}  stage=${snap.currentStage || '-'}/r${snap.currentRound || 0}`);
                    } catch { /* swallow */ }
                  } else if (event === 'state') {
                    try {
                      const f = JSON.parse(data);
                      const compact = JSON.stringify(f.payload || {});
                      console.log(`[${f.event}] status=${f.status}  ${compact.length > 160 ? compact.slice(0, 160) + '…' : compact}`);
                    } catch { /* swallow */ }
                  } else if (event === 'terminal') {
                    try {
                      const t = JSON.parse(data);
                      console.log(`[terminal] status=${t.status}`);
                    } catch { /* swallow */ }
                    res2.destroy();
                    resolve();
                    return;
                  }
                }
              });
              res2.on('end', resolve);
              res2.on('error', () => resolve());
            });
            req2.on('error', (e) => { console.error(`Error: ${e.message}`); resolve(); });
            process.on('SIGINT', () => { req2.destroy(); process.stderr.write('\n'); resolve(); });
          });
          return;
        }
        if (sub === 'transcript') {
          result = await request('GET', `/meetings/${idEnc}/transcript`);
          if (args.includes('--json')) break;
          if (result.error) { console.error(result.error); process.exit(1); }
          if (!result.transcript || result.transcript.length === 0) {
            console.log('(no turns yet)');
            return;
          }
          for (const t of result.transcript) {
            console.log(`[${t.stage} r${t.round}] ${t.specialistId}: ${t.text}`);
          }
          return;
        }
        if (sub === 'start') {
          result = await request('POST', `/meetings/${idEnc}/start`, {});
          if (args.includes('--json')) break;
          if (result.error) { console.error(result.error); process.exit(1); }
          printPlan(result);
          return;
        }
        if (sub === 'advance') {
          result = await request('POST', `/meetings/${idEnc}/advance`, {});
          if (args.includes('--json')) break;
          if (result.error) { console.error(result.error); process.exit(1); }
          if (result.advanced) {
            console.log(`advanced → ${result.status}${result.newStage ? '  newStage=' + result.newStage : ''}`);
          } else {
            console.log(`advance refused: ${result.reason}`);
            if (result.view) console.log(`  consensus: accepts=${result.view.accepts.length} objects=${result.view.objects.length} missing=${result.view.missing.length}`);
          }
          return;
        }
        if (sub === 'next-round') {
          result = await request('POST', `/meetings/${idEnc}/next-round`, {});
          if (args.includes('--json')) break;
          if (result.error) { console.error(result.error); process.exit(1); }
          if (result.bumped) console.log(`round → ${result.round}`);
          else console.log(`refused: ${result.reason}`);
          return;
        }
        if (sub === 'contribute') {
          // c4 meeting contribute <id> <specialistId> "<text>" [--vote accept|object] [--reason "..."]
          const specialistId = args[2];
          if (!specialistId) {
            console.error('Usage: c4 meeting contribute <id> <specialistId> "<text>" [--vote accept|object] [--reason "..."]');
            process.exit(1);
          }
          let vote = null;
          let reason = null;
          const textParts = [];
          for (let i = 3; i < args.length; i += 1) {
            const a = args[i];
            if (a === '--vote' && args[i + 1]) { vote = args[i + 1]; i += 1; }
            else if (a === '--reason' && args[i + 1]) { reason = args[i + 1]; i += 1; }
            else textParts.push(a);
          }
          const text = textParts.join(' ').trim();
          if (!text) {
            console.error('contribute: text required');
            process.exit(1);
          }
          const body = { specialistId, text };
          if (vote) body.vote = vote;
          if (reason) body.reason = reason;
          result = await request('POST', `/meetings/${idEnc}/contribute`, body);
          if (args.includes('--json')) break;
          if (result.error) { console.error(result.error); process.exit(1); }
          console.log(`recorded turn at [${result.turn.stage} r${result.turn.round}] ${result.turn.specialistId}`);
          return;
        }
        if (sub === 'vote') {
          // c4 meeting vote <id> <specialistId> <accept|object> [reason...]
          const specialistId = args[2];
          const v = args[3];
          if (!specialistId || !v) {
            console.error('Usage: c4 meeting vote <id> <specialistId> <accept|object> [reason...]');
            process.exit(1);
          }
          const reason = args.slice(4).join(' ') || null;
          const body = { specialistId, vote: v };
          if (reason) body.reason = reason;
          result = await request('POST', `/meetings/${idEnc}/vote`, body);
          if (args.includes('--json')) break;
          if (result.error) { console.error(result.error); process.exit(1); }
          const c = result.consensus;
          console.log(`vote recorded — accepts=${c.accepts.length} objects=${c.objects.length} missing=${c.missing.length} reached=${c.reached}`);
          return;
        }
        if (sub === 'recap') {
          // c4 meeting recap <id> — one-shot summary
          result = await request('GET', `/meetings/${idEnc}/recap`);
          if (args.includes('--json')) break;
          if (result.error) { console.error(result.error); process.exit(1); }
          console.log(`${result.id}  status=${result.status}  track=${result.track}`);
          console.log(`  ${result.title}`);
          console.log(`  task: ${result.task}`);
          if (result.forkOf) console.log(`  forkOf: ${result.forkOf}`);
          if (result.completedAt) console.log(`  completed: ${result.completedAt}`);
          for (const s of result.stages || []) {
            const c = s.consensus || {};
            console.log(`\n  [${s.stage}] round=${s.round}  turns=${s.turnCount}  consensus=${c.reached ? 'reached' : 'not-reached'} (a=${(c.accepts || []).length}/o=${(c.objects || []).length}/m=${(c.missing || []).length})`);
            if (s.firstTurn) {
              const txt = (s.firstTurn.text || '').slice(0, 160);
              console.log(`    first: [${s.firstTurn.specialistId}] ${txt}${(s.firstTurn.text || '').length > 160 ? '…' : ''}`);
            }
          }
          if (result.actions && result.actions.count > 0) {
            console.log(`\n  actions: ${result.actions.count} (decision=${result.actions.byType.decision}, action=${result.actions.byType.action}, todo=${result.actions.byType.todo}, blocker=${result.actions.byType.blocker})`);
            for (const it of result.actions.items.slice(0, 10)) {
              const owner = it.owner ? ` @${it.owner}` : '';
              console.log(`    [${it.type.toUpperCase()}]${owner}  ${it.text}`);
            }
            if (result.actions.count > 10) {
              console.log(`    ... ${result.actions.count - 10} more (use c4 meeting actions for full list)`);
            }
          }
          if (Array.isArray(result.escalations) && result.escalations.length > 0) {
            console.log(`\n  escalations:`);
            for (const e of result.escalations) {
              console.log(`    ${e.ts} — ${e.reason}${e.terminal ? ' (terminal)' : ''}`);
            }
          }
          return;
        }
        if (sub === 'lineage') {
          // c4 meeting lineage <id>
          result = await request('GET', `/meetings/${idEnc}/lineage`);
          if (args.includes('--json')) break;
          if (result.error) { console.error(result.error); process.exit(1); }
          console.log(`lineage depth=${result.depth}  rootId=${result.rootId || '?'}${result.chainTruncated ? '  (chain truncated — older ancestor purged)' : ''}`);
          for (let i = 0; i < result.chain.length; i += 1) {
            const m = result.chain[i];
            const arrow = i === 0 ? '>' : ' ';
            console.log(`  ${arrow} ${m.id}  status=${m.status}  track=${m.track}  ${m.title || '(untitled)'}`);
          }
          return;
        }
        if (sub === 'classify-track') {
          // c4 meeting classify-track "task description"
          const task = args.slice(1).filter((a) => !a.startsWith('--')).join(' ');
          if (!task) {
            console.error('Usage: c4 meeting classify-track "task description"');
            process.exit(1);
          }
          result = await request('GET', `/meetings/classify-track?task=${encodeURIComponent(task)}`);
          if (args.includes('--json')) break;
          if (result.error) { console.error(result.error); process.exit(1); }
          console.log(`track: ${result.track}  (tokens=${result.tokenCount})`);
          console.log(`reason: ${result.reason}`);
          if (Array.isArray(result.matched) && result.matched.length > 0) {
            console.log(`matched: ${result.matched.map((m) => `${m.list}:${m.term}`).join(', ')}`);
          }
          return;
        }
        if (sub === 'actions') {
          // c4 meeting actions <id> — list extracted [DECISION]/[ACTION]/etc
          result = await request('GET', `/meetings/${idEnc}/action-items`);
          if (args.includes('--json')) break;
          if (result.error) { console.error(result.error); process.exit(1); }
          const items = result.items || [];
          console.log(`${result.count} item(s)  decision=${result.byType.decision}  action=${result.byType.action}  todo=${result.byType.todo}  blocker=${result.byType.blocker}`);
          for (const it of items) {
            const owner = it.owner ? ` @${it.owner}` : '';
            const where = `${it.stage}/r${it.round}/${it.specialistId || '?'}`;
            console.log(`  [${it.type.toUpperCase()}]${owner}  ${it.text}  (${where})`);
          }
          return;
        }
        if (sub === 'fork') {
          // c4 meeting fork <id> [--mode replan|reuse] [--task "..."]
          //                      [--track X] [--title "..."]
          let mode = null;
          let task = null;
          let track = null;
          let title = null;
          for (let i = 2; i < args.length; i += 1) {
            const a = args[i];
            if (a === '--mode' && args[i + 1]) { mode = args[i + 1]; i += 1; }
            else if (a === '--task' && args[i + 1]) { task = args[i + 1]; i += 1; }
            else if (a === '--track' && args[i + 1]) { track = args[i + 1]; i += 1; }
            else if (a === '--title' && args[i + 1]) { title = args[i + 1]; i += 1; }
          }
          const body = {};
          if (mode) body.mode = mode;
          if (task) body.task = task;
          if (track) body.track = track;
          if (title) body.title = title;
          result = await request('POST', `/meetings/${idEnc}/fork`, body);
          if (args.includes('--json')) break;
          if (result.error) { console.error(result.error); process.exit(1); }
          console.log(`forked → ${result.id}  status=${result.status}  track=${result.track}`);
          if (result.title) console.log(`  title: ${result.title}`);
          if (result.task) console.log(`  task:  ${result.task}`);
          return;
        }
        if (sub === 'escalate' || sub === 'abort') {
          const reason = args.slice(2).join(' ') || 'unspecified';
          result = await request('POST', `/meetings/${idEnc}/${sub}`, { reason });
          if (args.includes('--json')) break;
          if (result.error) { console.error(result.error); process.exit(1); }
          console.log(`${sub} → status=${result.status}`);
          return;
        }
        if (sub === 'publish') {
          // c4 meeting publish <id> [--wiki-root PATH] [--retro] [--apply]
          //                         [--alpha N] [--git-commit] [--git-push]
          let wikiRoot = null;
          let includeRetro = false;
          let apply = false;
          let alpha = null;
          let gitCommit = false;
          let gitPush = false;
          for (let i = 2; i < args.length; i += 1) {
            const a = args[i];
            if (a === '--wiki-root' && args[i + 1]) { wikiRoot = args[i + 1]; i += 1; }
            else if (a === '--retro') { includeRetro = true; }
            else if (a === '--apply') { apply = true; }
            else if (a === '--alpha' && args[i + 1]) { alpha = parseFloat(args[i + 1]); i += 1; }
            else if (a === '--git-commit') { gitCommit = true; }
            else if (a === '--git-push') { gitPush = true; gitCommit = true; }
          }
          const body = {};
          if (wikiRoot) body.wikiRoot = wikiRoot;
          if (includeRetro) body.includeRetro = true;
          if (apply) body.apply = true;
          if (Number.isFinite(alpha)) body.alpha = alpha;
          if (gitCommit) body.gitCommit = true;
          if (gitPush) body.gitPush = true;
          result = await request('POST', `/meetings/${idEnc}/publish`, body);
          if (args.includes('--json')) break;
          if (result.error) { console.error(result.error); process.exit(1); }
          console.log(`Published to ${result.wikiRoot}`);
          for (const f of result.written) console.log(`  ${f}`);
          if (result.retro) console.log(`Retro: outcome=${result.retro.outcome}, ${result.retro.count} specialist(s)`);
          if (result.git) {
            if (result.git.committed) {
              console.log(`Git: committed ${result.git.sha ? result.git.sha.slice(0, 8) : ''}  "${result.git.message}"`);
              if (result.git.pushed === true) console.log(`Git: pushed to origin`);
              else if (result.git.pushed === false) console.log(`Git: push failed (see log for details)`);
            } else if (result.git.log && result.git.log.some((s) => s.skipped)) {
              console.log(`Git: nothing to commit (clean tree)`);
            } else if (result.git.log) {
              const fail = result.git.log.find((s) => !s.ok);
              if (fail) console.log(`Git: ${fail.step} failed — ${fail.stderr}`);
            }
          }
          return;
        }
        if (sub === 'peer-retro') {
          // c4 meeting peer-retro <id> [--brain mock|claude] [--apply] [--alpha N] [--include-silent]
          let brain = 'mock';
          let apply = false;
          let alpha = null;
          let askTimeoutMs = null;
          let includeSilent = false;
          for (let i = 2; i < args.length; i += 1) {
            const a = args[i];
            if (a === '--brain' && args[i + 1]) { brain = args[i + 1]; i += 1; }
            else if (a === '--apply') { apply = true; }
            else if (a === '--alpha' && args[i + 1]) { alpha = parseFloat(args[i + 1]); i += 1; }
            else if (a === '--ask-timeout-ms' && args[i + 1]) { askTimeoutMs = parseInt(args[i + 1], 10); i += 1; }
            else if (a === '--include-silent') { includeSilent = true; }
          }
          const body = { brain, apply, includeSilent };
          if (Number.isFinite(alpha)) body.alpha = alpha;
          if (Number.isFinite(askTimeoutMs)) body.askTimeoutMs = askTimeoutMs;
          result = await request('POST', `/meetings/${idEnc}/peer-retro`, body);
          if (args.includes('--json')) break;
          if (result.error) { console.error(result.error); process.exit(1); }
          const peer = result.peer;
          console.log(`peer-retro: ${peer.raters.length} rater(s), ${peer.ratees.length} ratee(s), ${peer.raw.length} rating(s)`);
          for (const [id, agg] of Object.entries(peer.perRatee)) {
            if (agg.votes === 0) continue;
            console.log(`  ${id.padEnd(22)} mean=${agg.mean.toFixed(2)}  votes=${agg.votes}`);
          }
          if (result.applied) {
            console.log(`applied to registry — ${Object.keys(result.applied).length} specialist(s) updated`);
          }
          return;
        }
        if (sub === 'retro' || sub === 'finalize') {
          // c4 meeting retro <id>           preview score deltas
          // c4 meeting finalize <id> [--alpha N]  apply to registry
          let alpha = null;
          for (let i = 2; i < args.length; i += 1) {
            if (args[i] === '--alpha' && args[i + 1]) { alpha = parseFloat(args[i + 1]); i += 1; }
          }
          const body = {};
          if (Number.isFinite(alpha)) body.alpha = alpha;
          result = await request('POST', `/meetings/${idEnc}/${sub}`, body);
          if (args.includes('--json')) break;
          if (result.error) { console.error(result.error); process.exit(1); }
          const retro = sub === 'retro' ? result : result.retro;
          console.log(`outcome: ${retro.outcome}  affected specialists: ${Object.keys(retro.deltas).length}`);
          for (const [id, d] of Object.entries(retro.deltas)) {
            const stages = Object.entries(d.byStage).map(([s, v]) => `${s}=${v.toFixed(2)}`).join(' ');
            console.log(`  ${id.padEnd(22)} contribution=${d.contribution}  stages: ${stages}`);
          }
          if (sub === 'finalize') {
            console.log(`applied to registry — ${Object.keys(result.applied).length} specialist(s) updated`);
          }
          return;
        }
        if (sub === 'run') {
          // c4 meeting run <id> [--brain mock|claude] [--max-asks N] [--max-stages N]
          //                     [--ask-timeout-ms MS] [--auto-finalize] [--auto-publish]
          //                     [--wiki-root PATH] [--alpha N]
          let brain = 'mock';
          let maxAsks = null;
          let maxStages = null;
          let askTimeoutMs = null;
          let autoFinalize = false;
          let autoPublish = false;
          let wikiRoot = null;
          let alpha = null;
          for (let i = 2; i < args.length; i += 1) {
            const a = args[i];
            if (a === '--brain' && args[i + 1]) { brain = args[i + 1]; i += 1; }
            else if (a === '--max-asks' && args[i + 1]) { maxAsks = parseInt(args[i + 1], 10); i += 1; }
            else if (a === '--max-stages' && args[i + 1]) { maxStages = parseInt(args[i + 1], 10); i += 1; }
            else if (a === '--ask-timeout-ms' && args[i + 1]) { askTimeoutMs = parseInt(args[i + 1], 10); i += 1; }
            else if (a === '--auto-finalize') { autoFinalize = true; }
            else if (a === '--auto-publish') { autoPublish = true; autoFinalize = true; }
            else if (a === '--wiki-root' && args[i + 1]) { wikiRoot = args[i + 1]; i += 1; }
            else if (a === '--alpha' && args[i + 1]) { alpha = parseFloat(args[i + 1]); i += 1; }
          }
          const body = { brain };
          if (Number.isFinite(maxAsks)) body.maxAsks = maxAsks;
          if (Number.isFinite(maxStages)) body.maxStages = maxStages;
          if (Number.isFinite(askTimeoutMs)) body.askTimeoutMs = askTimeoutMs;
          if (autoFinalize) body.autoFinalize = true;
          if (autoPublish) body.autoPublish = true;
          if (wikiRoot) body.wikiRoot = wikiRoot;
          if (Number.isFinite(alpha)) body.alpha = alpha;
          result = await request('POST', `/meetings/${idEnc}/run`, body);
          if (args.includes('--json')) break;
          if (result.error) { console.error(result.error); process.exit(1); }
          console.log(`run complete — totalAsks=${result.totalAsks} status=${result.session.status}`);
          if (result.retro) {
            const n = Object.keys(result.retro.deltas || {}).length;
            console.log(`auto-finalize: ${n} specialist(s) updated  (outcome=${result.retro.outcome})`);
          }
          if (result.publish && result.publish.written) {
            console.log(`auto-publish: ${result.publish.written.length} file(s) written under ${result.publish.wikiRoot}`);
            for (const f of result.publish.written) console.log(`  ${f}`);
          }
          printPlan(result.session);
          return;
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

      case 'pinned-memory':
      case 'pin-memory': {
        // 8.46: manage a worker's persistent rule set after creation.
        //   c4 pinned-memory get <name>
        //   c4 pinned-memory set <name> [--file <path>] [--rule <text>]...
        //                               [--role <manager|worker|attached>]
        //                               [--refresh]
        const action = args[0];
        const name = args[1];
        if (!action || !name || (action !== 'get' && action !== 'set')) {
          console.error('Usage:');
          console.error('  c4 pinned-memory get <name>');
          console.error('  c4 pinned-memory set <name> [--file <path>] [--rule <text>]... [--role <role>] [--refresh]');
          process.exit(1);
        }
        if (action === 'get') {
          result = await request('GET', `/workers/${encodeURIComponent(name)}/pinned-memory`);
          if (result && result.pinnedMemory !== undefined) {
            console.log(JSON.stringify(result, null, 2));
            return;
          }
          break;
        }
        const body = { userRules: [] };
        let rolePicked = '';
        let refresh = false;
        for (let i = 2; i < args.length; i++) {
          if (args[i] === '--file' && args[i + 1]) {
            const f = args[++i];
            try {
              const text = fs.readFileSync(f, 'utf8').trim();
              if (text) body.userRules.push(text);
            } catch (e) {
              console.error(`Error reading --file '${f}': ${e.message}`);
              process.exit(1);
            }
          } else if (args[i] === '--rule' && args[i + 1]) {
            const t = String(args[++i] || '').trim();
            if (t) body.userRules.push(t);
          } else if (args[i] === '--role' && args[i + 1]) {
            rolePicked = args[++i];
          } else if (args[i] === '--refresh') {
            refresh = true;
          }
        }
        if (rolePicked) body.defaultTemplate = rolePicked;
        if (refresh) body.refresh = true;
        result = await request('POST', `/workers/${encodeURIComponent(name)}/pinned-memory`, body);
        break;
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

      case 'autonomous': {
        // (8.28) Control the daemon-internal TODO auto-dispatch loop.
        //   c4 autonomous status           show current state
        //   c4 autonomous pause [reason]   stop dispatching until resumed
        //   c4 autonomous resume           clear pause + halt counter
        //   c4 autonomous tick             force a single tick (debug)
        //   c4 autonomous escalations [--status pending|resolved|all] [--kind X]
        //                                  list reviewer escalations (8.29)
        //   c4 autonomous review <id> <approve|reject|modify> [note...]
        //                                  resolve an escalation (8.29)
        //   c4 autonomous digest [--window-hours N]
        //                                  daily review summary (8.29)
        const sub = (args[0] || 'status').toLowerCase();
        if (!['status', 'pause', 'resume', 'tick', 'escalations', 'review', 'digest'].includes(sub)) {
          console.error('Usage: c4 autonomous <status|pause|resume|tick|escalations|review|digest> [args]');
          process.exit(1);
        }
        if (sub === 'status') {
          result = await request('GET', '/autonomous/status');
        } else if (sub === 'pause') {
          const reason = args.slice(1).join(' ') || 'manual via cli';
          result = await request('POST', '/autonomous/pause', { reason });
        } else if (sub === 'resume') {
          result = await request('POST', '/autonomous/resume');
        } else if (sub === 'tick') {
          result = await request('POST', '/autonomous/tick');
        } else if (sub === 'escalations') {
          // (8.29) List reviewer queue
          const statusIdx = args.indexOf('--status');
          const kindIdx = args.indexOf('--kind');
          const params = new URLSearchParams();
          if (statusIdx >= 0 && args[statusIdx + 1]) params.set('status', args[statusIdx + 1]);
          if (kindIdx >= 0 && args[kindIdx + 1]) params.set('kind', args[kindIdx + 1]);
          const qsStr = params.toString();
          result = await request('GET', '/autonomous/escalations' + (qsStr ? '?' + qsStr : ''));
          if (result && Array.isArray(result.escalations)) {
            if (result.escalations.length === 0) {
              console.log('No escalations.');
            } else {
              console.log('Escalations: ' + result.count);
              for (const e of result.escalations) {
                const status = e.status === 'pending' ? '[PENDING]' : '[' + e.resolvedAction.toUpperCase() + ']';
                console.log('  #' + e.id + ' ' + status + ' kind=' + e.kind + ' todo=' + (e.todoId || '(none)'));
                console.log('    reason: ' + e.reason);
                if (e.suggestedAction) console.log('    suggested: ' + e.suggestedAction);
                if (e.resolvedNote) console.log('    note: ' + e.resolvedNote);
              }
            }
          }
          break;
        } else if (sub === 'review') {
          // (8.29) Resolve escalation
          const id = args[1];
          const action = args[2];
          const note = args.slice(3).join(' ');
          if (!id || !action) {
            console.error('Usage: c4 autonomous review <id> <approve|reject|modify> [note...]');
            process.exit(1);
          }
          if (!['approve', 'reject', 'modify'].includes(action)) {
            console.error("Action must be 'approve', 'reject', or 'modify'");
            process.exit(1);
          }
          result = await request('POST', '/autonomous/escalations/' + encodeURIComponent(id), { action, note });
          if (result && result.error) {
            console.error('Error: ' + result.error);
            process.exit(1);
          }
          if (result && result.id) {
            console.log('Escalation #' + result.id + ' resolved: ' + result.resolvedAction);
            if (result.todoId) console.log('  todo: ' + result.todoId);
            if (result.resolvedNote) console.log('  note: ' + result.resolvedNote);
          }
          break;
        } else if (sub === 'digest') {
          // (8.29) Daily digest
          const hoursIdx = args.indexOf('--window-hours');
          const params = new URLSearchParams();
          if (hoursIdx >= 0 && args[hoursIdx + 1]) {
            const h = parseInt(args[hoursIdx + 1], 10);
            if (Number.isFinite(h) && h > 0) {
              params.set('windowMs', String(h * 3600 * 1000));
            }
          }
          const qsStr = params.toString();
          result = await request('GET', '/autonomous/digest' + (qsStr ? '?' + qsStr : ''));
          if (result && !result.error) {
            console.log('Autonomous digest (' + result.from + ' → ' + result.to + ')');
            console.log('  Status: ' + (result.paused ? 'PAUSED (' + result.pauseReason + ')' : 'running'));
            console.log('  Dispatched: ' + result.dispatched);
            console.log('  Succeeded:  ' + result.succeeded);
            console.log('  Halted:     ' + result.halted);
            if (result.dispatchErrors > 0) console.log('  Dispatch errors: ' + result.dispatchErrors);
            if (result.successRate !== null) {
              console.log('  Success rate: ' + (result.successRate * 100).toFixed(1) + '%');
            }
            console.log('  Pending escalations: ' + result.pendingEscalations);
            console.log('  Resolved (in window): ' + result.resolvedEscalations);
            if (result.consecutiveHalts > 0) {
              console.log('  Consecutive halts (current): ' + result.consecutiveHalts);
            }
          } else if (result && result.error) {
            console.error('Error: ' + result.error);
            process.exit(1);
          }
          break;
        }
        if (result && typeof result === 'object') {
          if (result.error) {
            console.error('Error: ' + result.error);
            process.exit(1);
          }
          if (result.skipped || result.dispatched) {
            if (result.dispatched) {
              console.log('Dispatched TODO ' + result.dispatched + ' (priority=' + (result.priority || 'normal') + ')');
            } else {
              console.log('Skipped: ' + result.skipped + (result.reason ? ' (' + result.reason + ')' : ''));
            }
          } else if (result.enabled !== undefined) {
            const on = result.enabled ? 'ON' : 'OFF';
            const paused = result.paused ? ' PAUSED' : '';
            console.log('autonomous: ' + on + paused + (result.pauseReason ? ' (' + result.pauseReason + ')' : ''));
            if (result.managerName) console.log('  manager: ' + result.managerName);
            if (result.todoPath) console.log('  todoPath: ' + result.todoPath);
            console.log('  consecutive halts: ' + (result.consecutiveHalts || 0) + '/' + (result.circuitThreshold || 3));
            console.log('  last dispatch: ' + (result.lastDispatchId || '(none)') + ' at ' + (result.lastDispatchAt || '(never)'));
            if (result.lastError) console.log('  last error: ' + result.lastError);
          }
        }
        break;
      }

      // (Polish) Tail the global daemon SSE stream — useful for ops
      // watching workflow_start/end, schedule_fire, audit_rotate,
      // worker_start/exit, pool_reuse, etc. Filter via --type.
      // Renamed from `events` to `sse-tail` to avoid collision with
      // the 10.9 Scribe v2 event log query already on `events`.
      case 'sse-tail':
      case 'sse': {
        const filter = args.includes('--type') ? args[args.indexOf('--type') + 1] : null;
        const url = new URL('/api/events', BASE);
        const req = http.get(url, (res) => {
          if (res.statusCode !== 200) {
            console.error(`Error: HTTP ${res.statusCode}`);
            process.exit(1);
          }
          process.stderr.write(`Tailing /api/events${filter ? ` (filter: type=${filter})` : ''}... Ctrl+C to stop\n`);
          let buffer = '';
          res.on('data', (chunk) => {
            buffer += chunk;
            const lines = buffer.split('\n');
            buffer = lines.pop();
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              let evt;
              try { evt = JSON.parse(line.slice(6)); } catch { continue; }
              if (filter && evt.type !== filter) continue;
              const ts = new Date().toISOString().slice(11, 23);
              const tag = String(evt.type || '?').padEnd(18);
              const rest = JSON.stringify(evt);
              console.log(`${ts} \x1b[36m${tag}\x1b[0m ${rest.length > 200 ? rest.slice(0, 200) + '…' : rest}`);
            }
          });
          res.on('end', () => process.exit(0));
        });
        req.on('error', (e) => { console.error(`Error: ${e.message}`); process.exit(1); });
        process.on('SIGINT', () => { req.destroy(); process.stderr.write('\n'); process.exit(0); });
        return;
      }

      case 'watch': {
        // Real-time worker output streaming (5.42)
        const name = args[0];
        if (!name) {
          console.error('Usage: c4 watch <name>');
          process.exit(1);
        }

        // SSE stream must also go through /api so the session-auth
        // middleware (8.14) classifies it correctly. EventSource-style
        // clients cannot set headers, so the token rides as ?token= which
        // auth.extractBearerToken accepts as a fallback.
        const watchToken = readToken();
        const watchQs = `name=${encodeURIComponent(name)}`
          + (watchToken ? `&token=${encodeURIComponent(watchToken)}` : '');
        const watchUrl = new URL(`/api/watch?${watchQs}`, BASE);
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
          console.log('  query [--type T] [--from ISO] [--to ISO] [--target name] [--limit N] [--ruleFingerprint FP]');
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
        let type = '', from = '', to = '', target = '', ruleFingerprint = '';
        let limit = 0;
        for (let i = 1; i < args.length; i++) {
          if (args[i] === '--type' && args[i + 1]) type = args[++i];
          else if (args[i] === '--from' && args[i + 1]) from = args[++i];
          else if (args[i] === '--to' && args[i + 1]) to = args[++i];
          else if (args[i] === '--target' && args[i + 1]) target = args[++i];
          else if (args[i] === '--ruleFingerprint' && args[i + 1]) ruleFingerprint = args[++i];
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
        if (ruleFingerprint) qs.set('ruleFingerprint', ruleFingerprint);
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

      // (11.5) Run a command through the risk classifier without
      // dispatching it. Useful for vetting candidate commands during
      // policy review or for debugging why a command was blocked.
      //
      //   c4 risk "<command>"           # classify a single command
      //   c4 risk --json "<command>"    # raw classification JSON
      //   c4 risk --decoded "<command>" # also print _denoiseCommand output
      //   c4 risk --sandbox-preview docker "<command>"
      //                                 # show the docker run argv that
      //                                 # would isolate the command (no exec)
      case 'risk': {
        const wantJson = args.includes('--json');
        const wantDecoded = args.includes('--decoded');
        // (v1.10.79) `--sandbox-preview <runtime>` — show the OS-binary
        // argv the chosen runtime would use to isolate the command.
        // Pure builder; no exec.
        let sandboxPreview = null;
        const spIdx = args.indexOf('--sandbox-preview');
        if (spIdx >= 0 && args[spIdx + 1] && !args[spIdx + 1].startsWith('--')) {
          sandboxPreview = args[spIdx + 1];
        }
        // (v1.10.85) `--shadow-exec` — actually run the command in
        // the sandbox (POST /api/risk/exec). Daemon refuses unless
        // riskClassifier.sandbox.allowExec === true. CLI does NOT
        // duplicate the gate — the daemon is authoritative.
        const wantShadowExec = args.includes('--shadow-exec');
        // The argument right after --sandbox-preview is the runtime
        // name, not a command term — skip it. spIdx >= 0 guard
        // prevents filtering args[0] when the flag is absent.
        const positional = args.filter((a, i) =>
          !a.startsWith('--') && !(spIdx >= 0 && i === spIdx + 1)
        );
        // Subcommand: `c4 risk patterns` — list catalog + custom rules.
        if (positional[0] === 'patterns') {
          const data = await request('GET', '/risk/patterns');
          if (!data || data.error) {
            console.error('Failed:', data?.error || 'unknown error');
            process.exit(1);
          }
          // (v1.10.136) `--tier <critical|high|medium>` filters
          // the listing to a single tier — useful when operators
          // want to review just the highest-impact rules.
          const tierIdx = args.indexOf('--tier');
          const tierFilter = tierIdx >= 0 ? args[tierIdx + 1] : '';
          const TIERS_VALID = ['critical', 'high', 'medium'];
          if (tierFilter && !TIERS_VALID.includes(tierFilter)) {
            console.error(`Unknown tier: ${tierFilter} (expected one of ${TIERS_VALID.join('|')})`);
            process.exit(1);
          }
          const tiersToShow = tierFilter ? [tierFilter] : TIERS_VALID;
          if (wantJson) {
            // When --tier is provided, return only that tier's
            // builtin + custom + counts. Otherwise pass through.
            if (tierFilter) {
              const filtered = {
                builtin: { [tierFilter]: data.builtin[tierFilter] || [] },
                custom: { [tierFilter]: data.custom[tierFilter] || [] },
                counts: {
                  builtin: { [tierFilter]: data.counts.builtin[tierFilter] || 0, total: (data.builtin[tierFilter] || []).length },
                  custom: { [tierFilter]: data.counts.custom[tierFilter] || 0, total: (data.custom[tierFilter] || []).length },
                },
                fingerprint: data.fingerprint,
                tier: tierFilter,
              };
              console.log(JSON.stringify(filtered, null, 2));
            } else {
              console.log(JSON.stringify(data, null, 2));
            }
            return;
          }
          // Human-readable listing — same as before, but the
          // header reflects the filter when one is applied.
          if (tierFilter) {
            const list = data.builtin[tierFilter] || [];
            console.log(`Built-in ${tierFilter} patterns: ${list.length}`);
          } else {
            console.log(`Built-in patterns: ${data.counts.builtin.total} total`);
          }
          for (const tier of tiersToShow) {
            const list = data.builtin[tier] || [];
            if (list.length === 0) continue;
            // When a single tier is filtered, the header above
            // already reflects the count — skip the inner header.
            if (!tierFilter) console.log(`  ${tier} (${list.length}):`);
            const indent = tierFilter ? '  ' : '    ';
            for (const r of list) console.log(`${indent}[${r.code}] ${r.label}`);
          }
          if (data.counts.custom.total > 0 && (!tierFilter || (data.custom[tierFilter] || []).length > 0)) {
            const customCount = tierFilter ? (data.custom[tierFilter] || []).length : data.counts.custom.total;
            console.log(`\nCustom ${tierFilter || ''} rules: ${customCount} total`);
            for (const tier of tiersToShow) {
              const list = data.custom[tier] || [];
              if (list.length === 0) continue;
              if (!tierFilter) console.log(`  ${tier} (${list.length}):`);
              const indent = tierFilter ? '  ' : '    ';
              for (const r of list) console.log(`${indent}[${r.code || '(no code)'}] ${r.label || '(no label)'} — /${r.pattern}/${r.flags || ''}`);
            }
          }
          if (!tierFilter && (data.allowList > 0 || data.denyList > 0)) {
            console.log(`\nOverrides: allowList=${data.allowList}, denyList=${data.denyList}`);
          }
          // (v1.10.95) Fingerprint — operators compare across machines
          // to verify identical classifier config.
          if (typeof data.fingerprint === 'string' && data.fingerprint.length > 0) {
            console.log(`\nFingerprint: ${data.fingerprint}`);
          }
          return;
        }
        // Subcommand: `c4 risk stats` — aggregate audit chain denies.
        if (positional[0] === 'stats') {
          const windowIdx = args.indexOf('--window-hours');
          const windowHours = windowIdx >= 0 ? args[windowIdx + 1] : '24';
          const stats = await request('GET', `/risk/stats?windowHours=${encodeURIComponent(windowHours)}`);
          if (!stats || stats.error) {
            console.error('Failed:', stats?.error || 'unknown error');
            process.exit(1);
          }
          if (wantJson) { console.log(JSON.stringify(stats, null, 2)); return; }
          console.log(`Risk denies (last ${stats.windowHours}h): ${stats.total}`);
          console.log(`  Window: ${stats.from} → ${stats.to}`);
          if (typeof stats.enforced === 'number' || typeof stats.dryRun === 'number') {
            console.log(`  Breakdown: enforced=${stats.enforced || 0}, dryRun=${stats.dryRun || 0}`);
          }
          console.log(`  By level:`);
          for (const lvl of ['critical', 'high', 'medium', 'low']) {
            const n = (stats.byLevel && stats.byLevel[lvl]) || 0;
            if (n > 0) console.log(`    ${lvl.padEnd(8)} ${n}`);
          }
          if (stats.topReasons.length) {
            console.log(`  Top reasons:`);
            for (const r of stats.topReasons) console.log(`    [${r.key}] ${r.count}`);
          }
          if (stats.topWorkers.length) {
            console.log(`  Top workers:`);
            for (const w of stats.topWorkers) console.log(`    ${w.key.padEnd(20)} ${w.count}`);
          }
          // (v1.10.90) Shadow exec activity — separate from
          // classifier denies. Suppressed when zero so the row
          // doesn't add noise on hosts that haven't enabled it.
          if (stats.shadowExec > 0) {
            console.log(`Shadow exec (last ${stats.windowHours}h): ${stats.shadowExec}`);
            if (stats.shadowExecKilled > 0) {
              console.log(`  killed (timeout): ${stats.shadowExecKilled}`);
            }
            if (stats.shadowExecNonZero > 0) {
              console.log(`  non-zero exit:    ${stats.shadowExecNonZero}`);
            }
          }
          // (v1.10.97) Rule-set rotation detector — flag when the
          // classifier config changed mid-window. Operators rotating
          // rules during an audit window need to know.
          if (typeof stats.ruleSetRotations === 'number' && stats.ruleSetRotations > 1) {
            console.log(`Rule-set rotations: ${stats.ruleSetRotations} (config changed mid-window)`);
            if (Array.isArray(stats.fingerprintsObserved)) {
              for (const fp of stats.fingerprintsObserved) console.log(`  - ${fp}`);
            }
          }
          return;
        }
        const command = positional.join(' ');
        if (!command) {
          console.error('Usage:');
          console.error('  c4 risk "<command>" [--json] [--decoded]   classify a candidate command');
          console.error('  c4 risk "<command>" --sandbox-preview <docker|null>');
          console.error('                                              show the OS-binary argv that would isolate it');
          console.error('  c4 risk "<command>" --shadow-exec          run the command in the configured sandbox');
          console.error('                                              (daemon must have riskClassifier.sandbox.allowExec=true)');
          console.error('  c4 risk stats [--window-hours N] [--json]  aggregate denies from the audit chain');
          console.error('  c4 risk patterns [--json] [--tier <critical|high|medium>]');
          console.error('                                              list built-in catalog + custom rules');
          console.error('                                              (--tier filters to a single tier)');
          console.error('');
          console.error('Operator guide: docs/risk-sandbox.md');
          process.exit(1);
        }
        const { classifyCommand } = require('./risk-classifier');
        // Pull operator override config from the running daemon when
        // available; classifying offline still works (config stays
        // null) so this command also runs when the daemon is down.
        let cfgRisk = {};
        try {
          const cfgRes = await request('GET', '/config');
          if (cfgRes && cfgRes.config && cfgRes.config.riskClassifier) {
            cfgRisk = cfgRes.config.riskClassifier;
          }
        } catch { /* daemon down — classify with built-ins only */ }
        const classification = classifyCommand(command, {
          allowList: cfgRisk.allowList,
          denyList: cfgRisk.denyList,
          customRules: cfgRisk.customRules,
          includeInspected: wantDecoded,
        });
        // Exit code mirrors daemon enforcement so shell pipelines
        // can gate identically to the in-process hook (computed up
        // front so both --json and human-readable paths use it).
        const LEVEL_RANK = { low: 0, medium: 1, high: 2, critical: 3 };
        const autoDenyLevel = ['low', 'medium', 'high', 'critical'].includes(cfgRisk.autoDenyLevel)
          ? cfgRisk.autoDenyLevel
          : 'critical';
        const shouldExit1 = LEVEL_RANK[classification.level] >= LEVEL_RANK[autoDenyLevel];
        if (wantJson) {
          console.log(JSON.stringify(classification, null, 2));
          if (shouldExit1) process.exit(1);
          return;
        }
        const COLOR = {
          critical: '\x1b[31m',  // red
          high:     '\x1b[33m',  // yellow
          medium:   '\x1b[35m',  // magenta
          low:      '\x1b[32m',  // green
        };
        const RESET = '\x1b[0m';
        const colour = (process.stdout.isTTY ? COLOR[classification.level] : '') || '';
        const off = colour ? RESET : '';
        console.log(`Level:    ${colour}${classification.level.toUpperCase()}${off}`);
        console.log(`Action:   ${classification.suggestedAction}`);
        if (classification.denyForced) console.log('Source:   denyList (forced critical)');
        if (classification.reasons.length === 0) {
          console.log('Reasons:  (no patterns matched)');
        } else {
          console.log('Reasons:');
          for (const r of classification.reasons) {
            console.log(`  - [${r.code}] ${r.label}`);
          }
        }
        if (classification.decoded) {
          console.log(`Decoded:  ${classification.decoded}`);
        }
        if (wantDecoded && classification.inspectedSource) {
          console.log(`Inspected source: ${classification.inspectedSource}`);
        }
        // (v1.10.69) Intent — what files / network peers / privileges
        // the command would touch, extracted statically.
        try {
          const { extractIntent } = require('./risk-sandbox');
          const intent = extractIntent(command);
          if (!intent.empty) {
            console.log('Intent:');
            if (intent.filesWritten.length) console.log(`  writes: ${intent.filesWritten.join(', ')}`);
            if (intent.filesRead.length)    console.log(`  reads:  ${intent.filesRead.join(', ')}`);
            if (intent.networkPeers.length) console.log(`  net:    ${intent.networkPeers.join(', ')}`);
            if (intent.privileged)          console.log(`  priv:   true (sudo/setuid/etc)`);
            if (intent.scriptSources.length) console.log(`  src:    ${intent.scriptSources.length} script source(s)`);
            if (intent.destructiveVerbs.length) console.log(`  dest:   ${intent.destructiveVerbs.join(', ')}`);
          }
        } catch { /* non-fatal */ }
        // (v1.10.82) Auto-include sandbox preview when config has
        // riskClassifier.sandbox set — operator sees classifier rule
        // + would-be-exec without needing --sandbox-preview each call.
        // Suppressed when --sandbox-preview is explicit (avoids
        // duplicate output).
        if (!sandboxPreview && cfgRisk.sandbox && typeof cfgRisk.sandbox === 'object'
            && typeof cfgRisk.sandbox.name === 'string') {
          try {
            const { getRuntime } = require('./risk-sandbox-runtime');
            const rt = getRuntime(cfgRisk.sandbox.name, cfgRisk.sandbox.opts);
            const prep = rt.prepareArgs(command);
            const probe = rt.available();
            console.log('');
            console.log(`Sandbox runtime: ${cfgRisk.sandbox.name} (config default)`);
            console.log(`  available: ${probe.ok}${probe.reason ? ' (' + probe.reason + ')' : ''}`);
            const iso = prep.isolation;
            console.log(`  isolation: network=${iso.network}, fs=${iso.filesystem}`);
            console.log(`             ${iso.resources}`);
            if (prep.binary) {
              const cmdLine = [prep.binary, ...prep.args]
                .map((a) => /[\s'"$\\]/.test(a) ? `'${a.replace(/'/g, "'\\''")}'` : a)
                .join(' ');
              console.log('  command:');
              console.log(`    ${cmdLine}`);
            } else {
              console.log('  command: (no isolation — runs on host)');
            }
          } catch { /* misconfig — drop silently, classifier still printed */ }
        }
        // (v1.10.79) Sandbox preview — show the OS-binary argv that the
        // chosen runtime would use to isolate this command. Pure builder
        // — no exec.
        if (sandboxPreview) {
          try {
            const { getRuntime } = require('./risk-sandbox-runtime');
            const rt = getRuntime(sandboxPreview);
            const avail = rt.available();
            const prep = rt.prepareArgs(command);
            console.log('');
            console.log(`Sandbox runtime: ${sandboxPreview}`);
            console.log(`  available: ${avail.ok}${avail.reason ? ' (' + avail.reason + ')' : ''}`);
            const iso = prep.isolation;
            console.log(`  isolation: network=${iso.network}, fs=${iso.filesystem}`);
            console.log(`             ${iso.resources}`);
            if (prep.binary) {
              const cmdLine = [prep.binary, ...prep.args]
                .map((a) => /[\s'"$\\]/.test(a) ? `'${a.replace(/'/g, "'\\''")}'` : a)
                .join(' ');
              console.log('  command:');
              console.log(`    ${cmdLine}`);
            } else {
              console.log('  command: (no isolation — runs on host)');
            }
          } catch (err) {
            console.error(`sandbox-preview error: ${(err && err.message) || err}`);
          }
        }
        // (v1.10.85) Shadow execution — runs the command in the
        // configured sandbox via daemon POST /risk/exec. Daemon is
        // authoritative on the gate (allowExec must be true in
        // config); CLI just relays the request and prints the
        // result.
        if (wantShadowExec) {
          try {
            const exec = await request('POST', '/risk/exec', {
              command,
              runtime: sandboxPreview || undefined,
            });
            console.log('');
            console.log('Shadow execution:');
            if (exec && exec.refused) {
              console.log(`  refused: ${exec.refusedReason || 'unknown'}`);
            } else if (exec && exec.error) {
              console.log(`  error: ${exec.error}`);
            } else if (exec && typeof exec === 'object') {
              const rt = exec.runtime || {};
              console.log(`  runtime:    ${rt.name || 'unknown'}`);
              console.log(`  exitCode:   ${exec.exitCode === null ? 'null (signal/timeout)' : exec.exitCode}`);
              console.log(`  durationMs: ${exec.durationMs}`);
              console.log(`  killed:     ${exec.killed}`);
              if (exec.spawnError) console.log(`  spawnError: ${exec.spawnError}`);
              if (exec.stdout) {
                console.log('  stdout:');
                for (const line of exec.stdout.split('\n')) console.log(`    ${line}`);
              }
              if (exec.stderr) {
                console.log('  stderr:');
                for (const line of exec.stderr.split('\n')) console.log(`    ${line}`);
              }
            } else {
              console.log('  (no response)');
            }
          } catch (err) {
            console.error(`shadow-exec error: ${(err && err.message) || err}`);
          }
        }
        if (shouldExit1) process.exit(1);
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
       [--follow]                  Persistent approval watcher (8.26 monitor-gap)
  scrollback <name> [--lines N]    Read scrollback buffer (default 200 lines)
  watch <name>                     Watch worker output in real-time (Ctrl+C to stop)
  watch-interventions              Stream approval_pending transitions for all workers (8.26)
       [--worker <name>]           Filter to a single worker
       [--all]                     Explicit all-worker form
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
  autonomous <status|pause|resume|tick>  Control the TODO auto-dispatch loop (8.28)
  autonomous escalations [--status pending|resolved|all] [--kind X]
                                         List reviewer escalations (8.29)
  autonomous review <id> <approve|reject|modify> [note...]
                                         Resolve an escalation (8.29)
  autonomous digest [--window-hours N]   Daily activity summary for review (8.29)
  morning                          Generate morning report (4.4)
  profiles                         List available permission profiles
  batch "task" --count N           Same task to N workers in parallel
  batch --file tasks.txt           One task per line from file
       [--auto-mode] [--profile name] [--branch prefix]
  config                           Show current config
  config reload                    Reload config.json without restart
  config validate [path]           Validate config.json (default: project root). Exits 1 on errors — CI-friendly
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
  version | --version | -v                           Print package version + exit

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
  c4 wait arps --follow         # approval 대기 persistent re-arm (8.26)
  c4 watch-interventions         # 모든 worker의 approval 이벤트 실시간 구독 (8.26)
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

    if (result !== null && result !== undefined) {
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
} else {
  // Expose helpers so tests can exercise them without spawning the CLI
  // or stubbing argv. Keep this list narrow on purpose.
  module.exports = { withApiPrefix };
}
