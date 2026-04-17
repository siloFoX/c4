'use strict';

// Multi-machine fleet management (TODO 9.6).
//
// Responsibilities:
//   - Store registered machines in ~/.c4/fleet.json with
//     { machines: { <alias>: { host, port, authToken? } } }.
//   - Track the pinned alias via either the C4_FLEET env var or the
//     ~/.c4/fleet.current file so a single daemon install can talk to
//     peers on the LAN (40 + DGX + 15 pattern).
//   - Proxy HTTP calls to the pinned machine while reusing the JWT
//     token that 8.14 provisioned per daemon.
//   - Fetch an aggregated fleet overview in parallel, each machine
//     behind a timeout, best-effort so one unreachable peer does not
//     hide the rest.
//
// Pure Node (no node-pty / no manager dep) so tests can require it
// directly and drive the logic with fakes + injected http clients.

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const https = require('https');

const DEFAULT_PORT = 3456;
const DEFAULT_OVERVIEW_TIMEOUT_MS = 3000;
const TOKEN_FILE_BASENAME = '.c4-token';

function fleetDir(home = os.homedir()) {
  return path.join(home, '.c4');
}

function fleetConfigPath(home = os.homedir()) {
  return path.join(fleetDir(home), 'fleet.json');
}

function fleetCurrentPath(home = os.homedir()) {
  return path.join(fleetDir(home), 'fleet.current');
}

function ensureDir(dir, fsImpl = fs) {
  try {
    fsImpl.mkdirSync(dir, { recursive: true });
  } catch (e) {
    if (e && e.code !== 'EEXIST') throw e;
  }
}

function emptyFleet() {
  return { machines: {} };
}

function loadFleet(options = {}) {
  const fsImpl = options.fs || fs;
  const home = options.home || os.homedir();
  const filePath = options.path || fleetConfigPath(home);
  let raw;
  try {
    raw = fsImpl.readFileSync(filePath, 'utf8');
  } catch (e) {
    if (e && e.code === 'ENOENT') return emptyFleet();
    throw e;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`invalid JSON in ${filePath}: ${e.message}`);
  }
  if (!parsed || typeof parsed !== 'object') return emptyFleet();
  if (!parsed.machines || typeof parsed.machines !== 'object') parsed.machines = {};
  return parsed;
}

function saveFleet(cfg, options = {}) {
  const fsImpl = options.fs || fs;
  const home = options.home || os.homedir();
  const filePath = options.path || fleetConfigPath(home);
  ensureDir(path.dirname(filePath), fsImpl);
  const normalized = cfg && typeof cfg === 'object' ? cfg : emptyFleet();
  if (!normalized.machines || typeof normalized.machines !== 'object') {
    normalized.machines = {};
  }
  fsImpl.writeFileSync(filePath, JSON.stringify(normalized, null, 2) + '\n');
  return { ok: true, path: filePath };
}

function validateAlias(alias) {
  if (typeof alias !== 'string' || !alias.trim()) {
    throw new Error('alias must be a non-empty string');
  }
  if (!/^[a-zA-Z0-9][\w.-]*$/.test(alias)) {
    throw new Error(`invalid alias '${alias}' (use letters, digits, dot, dash, underscore)`);
  }
}

function normalizePort(port) {
  if (port == null || port === '') return DEFAULT_PORT;
  const n = typeof port === 'number' ? port : parseInt(port, 10);
  if (!Number.isFinite(n) || n <= 0 || n > 65535) {
    throw new Error(`invalid port '${port}'`);
  }
  return n;
}

function addMachine(alias, host, options = {}) {
  validateAlias(alias);
  if (typeof host !== 'string' || !host.trim()) {
    throw new Error('host must be a non-empty string');
  }
  const port = normalizePort(options.port);
  const cfg = loadFleet(options);
  const existing = cfg.machines[alias] || {};
  cfg.machines[alias] = {
    host: host.trim(),
    port,
  };
  if (options.authToken && typeof options.authToken === 'string') {
    cfg.machines[alias].authToken = options.authToken;
  } else if (existing.authToken && !options.clearToken) {
    cfg.machines[alias].authToken = existing.authToken;
  }
  saveFleet(cfg, options);
  return { ok: true, alias, host: cfg.machines[alias].host, port };
}

function removeMachine(alias, options = {}) {
  validateAlias(alias);
  const cfg = loadFleet(options);
  if (!cfg.machines[alias]) {
    return { ok: false, error: `alias '${alias}' not found` };
  }
  delete cfg.machines[alias];
  saveFleet(cfg, options);
  // If the removed alias was pinned, clear the pin so subsequent CLI
  // calls fall back to localhost instead of proxying to a deleted peer.
  const current = getCurrent(options);
  if (current === alias) setCurrent(null, options);
  return { ok: true, alias };
}

function listMachines(options = {}) {
  const cfg = loadFleet(options);
  const aliases = Object.keys(cfg.machines).sort();
  return aliases.map((alias) => {
    const m = cfg.machines[alias] || {};
    return {
      alias,
      host: m.host || '',
      port: typeof m.port === 'number' ? m.port : DEFAULT_PORT,
      hasToken: Boolean(m.authToken),
    };
  });
}

function getMachine(alias, options = {}) {
  if (!alias || typeof alias !== 'string') return null;
  const cfg = loadFleet(options);
  const m = cfg.machines[alias];
  if (!m) return null;
  return {
    alias,
    host: m.host || '',
    port: typeof m.port === 'number' ? m.port : DEFAULT_PORT,
    authToken: typeof m.authToken === 'string' ? m.authToken : '',
  };
}

// Precedence: explicit env override wins over the persisted pin so a
// single shell session can target a different peer without rewriting
// the config file.
function getCurrent(options = {}) {
  const env = options.env || process.env;
  if (env && env.C4_FLEET) {
    const trimmed = String(env.C4_FLEET).trim();
    if (trimmed) return trimmed;
  }
  const fsImpl = options.fs || fs;
  const home = options.home || os.homedir();
  const p = options.currentPath || fleetCurrentPath(home);
  try {
    const raw = fsImpl.readFileSync(p, 'utf8').trim();
    return raw || null;
  } catch (e) {
    if (e && e.code === 'ENOENT') return null;
    return null;
  }
}

function setCurrent(alias, options = {}) {
  const fsImpl = options.fs || fs;
  const home = options.home || os.homedir();
  const p = options.currentPath || fleetCurrentPath(home);
  if (alias == null || alias === '') {
    try {
      fsImpl.unlinkSync(p);
    } catch (e) {
      if (e && e.code !== 'ENOENT') throw e;
    }
    return { ok: true, cleared: true };
  }
  validateAlias(alias);
  const machine = getMachine(alias, options);
  if (!machine) {
    return { ok: false, error: `alias '${alias}' not found in fleet` };
  }
  ensureDir(path.dirname(p), fsImpl);
  fsImpl.writeFileSync(p, alias + '\n');
  return { ok: true, alias };
}

// Resolve the pinned alias into an absolute base URL + auth token. The
// token falls back to the per-machine entry, then the shared ~/.c4-token
// file (same location the local CLI uses) so operators do not need to
// paste the same JWT into every machine record.
function getPinnedBase(options = {}) {
  const alias = getCurrent(options);
  if (!alias) return { pinned: false, alias: null, base: null, token: null };
  const machine = getMachine(alias, options);
  if (!machine) {
    return {
      pinned: true,
      alias,
      base: null,
      token: null,
      error: `pinned alias '${alias}' not found in fleet.json`,
    };
  }
  const base = `http://${machine.host}:${machine.port}`;
  const token = machine.authToken || readSharedToken(options);
  return { pinned: true, alias, base, token, machine };
}

function readSharedToken(options = {}) {
  const fsImpl = options.fs || fs;
  const home = options.home || os.homedir();
  const env = options.env || process.env;
  if (env && env.C4_TOKEN) {
    const trimmed = String(env.C4_TOKEN).trim();
    if (trimmed) return trimmed;
  }
  try {
    const p = path.join(home, TOKEN_FILE_BASENAME);
    const raw = fsImpl.readFileSync(p, 'utf8').trim();
    return raw || null;
  } catch {
    return null;
  }
}

// Lightweight HTTP GET with per-call timeout + optional Bearer token.
// Resolves with {ok, status, body, elapsedMs} — never rejects on
// transport errors so fetchOverview stays best-effort.
function httpGetJson(url, options = {}) {
  const client = options.httpClient || defaultHttpClient;
  return client('GET', url, null, options);
}

function defaultHttpClient(method, url, body, options = {}) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (e) {
      resolve({ ok: false, status: 0, error: `invalid url: ${e.message}`, elapsedMs: 0 });
      return;
    }
    const lib = parsed.protocol === 'https:' ? https : http;
    const started = Date.now();
    const headers = { 'Content-Type': 'application/json' };
    if (options.token) headers['Authorization'] = `Bearer ${options.token}`;
    const req = lib.request({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method,
      headers,
      timeout: options.timeoutMs || DEFAULT_OVERVIEW_TIMEOUT_MS,
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        const elapsedMs = Date.now() - started;
        let parsedBody = null;
        try { parsedBody = JSON.parse(data); } catch { parsedBody = { raw: data }; }
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          body: parsedBody,
          elapsedMs,
        });
      });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, status: 0, error: 'timeout', elapsedMs: Date.now() - started });
    });
    req.on('error', (err) => {
      resolve({ ok: false, status: 0, error: err && err.message ? err.message : String(err), elapsedMs: Date.now() - started });
    });
    if (body != null) req.write(JSON.stringify(body));
    req.end();
  });
}

// Fetch /health + /list in parallel from a single machine. Returns a
// normalized sample regardless of reachability so the caller always
// gets a stable row per alias.
async function sampleMachine(machine, options = {}) {
  const base = `http://${machine.host}:${machine.port}`;
  const token = machine.authToken || options.token || null;
  const timeoutMs = options.timeoutMs || DEFAULT_OVERVIEW_TIMEOUT_MS;
  const httpClient = options.httpClient || defaultHttpClient;
  const started = Date.now();
  const [health, list] = await Promise.all([
    httpGetJson(base + '/health', { token, timeoutMs, httpClient }),
    httpGetJson(base + '/list', { token, timeoutMs, httpClient }),
  ]);
  const elapsedMs = Date.now() - started;
  const reachable = Boolean(health && health.ok);
  const workers = list && list.ok && list.body && Array.isArray(list.body.workers)
    ? list.body.workers.length
    : null;
  const version = reachable && health.body && typeof health.body.version === 'string'
    ? health.body.version
    : null;
  const error = reachable ? null : (health && health.error) || `status ${health && health.status}`;
  return {
    alias: machine.alias,
    host: machine.host,
    port: machine.port,
    ok: reachable,
    workers,
    version,
    error,
    elapsedMs,
  };
}

// Aggregate every machine in parallel. The caller also passes in a
// self-sample (built from the local manager.list() result) so the
// daemon does not re-fetch its own endpoints.
async function fetchOverview(options = {}) {
  const machines = Array.isArray(options.machines)
    ? options.machines
    : listMachines(options);
  const timeoutMs = options.timeoutMs || DEFAULT_OVERVIEW_TIMEOUT_MS;
  const httpClient = options.httpClient || defaultHttpClient;
  const token = readSharedToken(options);
  const results = await Promise.all(
    machines.map((m) => sampleMachine(m, { timeoutMs, httpClient, token }))
  );
  const self = options.self || null;
  const reachable = results.filter((r) => r.ok).length;
  const workerTotal = results.reduce((sum, r) => sum + (r.workers || 0), 0)
    + (self && typeof self.workers === 'number' ? self.workers : 0);
  return {
    self,
    machines: results,
    total: {
      machines: results.length + (self ? 1 : 0),
      reachable: reachable + (self && self.ok ? 1 : 0),
      workers: workerTotal,
    },
    generatedAt: new Date().toISOString(),
  };
}

// Proxy an HTTP request to a pinned alias. Used by the CLI so every
// command transparently routes to the pinned daemon with its stored
// token. Returns the parsed JSON body + HTTP status.
function proxyRequest(pinned, method, apiPath, body, options = {}) {
  if (!pinned || !pinned.base) {
    return Promise.resolve({
      ok: false,
      status: 0,
      error: 'no pinned machine',
      elapsedMs: 0,
    });
  }
  const url = pinned.base + (apiPath.startsWith('/') ? apiPath : '/' + apiPath);
  const httpClient = options.httpClient || defaultHttpClient;
  return httpClient(method, url, body, {
    token: pinned.token || null,
    timeoutMs: options.timeoutMs || 10000,
  });
}

module.exports = {
  DEFAULT_PORT,
  DEFAULT_OVERVIEW_TIMEOUT_MS,
  fleetDir,
  fleetConfigPath,
  fleetCurrentPath,
  loadFleet,
  saveFleet,
  addMachine,
  removeMachine,
  listMachines,
  getMachine,
  getCurrent,
  setCurrent,
  getPinnedBase,
  readSharedToken,
  sampleMachine,
  fetchOverview,
  proxyRequest,
  httpGetJson,
  validateAlias,
  normalizePort,
};
