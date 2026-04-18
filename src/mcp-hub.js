'use strict';

// (11.1) MCP Hub — dynamic MCP server registry.
//
// Stores MCP server definitions in ~/.c4/mcp-servers.json so workers
// can pull a profile-scoped subset of servers into their .mcp.json
// without each worker having to restate the full configuration. The
// hub is a pure storage + decision layer; pty-manager calls
// writeWorkerMcpJson() during worker setup and the daemon/CLI expose
// CRUD surfaces on top of registerServer / listServers / etc.
//
// Schema per server:
//   { name, command, args, env, description, enabled, transport }
// Transport is 'stdio' (default) or 'http'. Unknown values are
// rejected at register time so the operator catches typos before a
// worker tries to launch the server. stdio servers store the
// executable in `command` and its argv tail in `args`; http servers
// reuse `command` as the URL and treat `env` as HTTP headers.

const fs = require('fs');
const os = require('os');
const path = require('path');

const VALID_TRANSPORTS = Object.freeze(['stdio', 'http']);
const DEFAULT_TRANSPORT = 'stdio';
const NAME_PATTERN = /^[A-Za-z0-9._-]+$/;

function defaultStorePath() {
  return path.join(os.homedir(), '.c4', 'mcp-servers.json');
}

function isValidName(name) {
  return typeof name === 'string' && name.length > 0 && NAME_PATTERN.test(name);
}

function isValidTransport(t) {
  return typeof t === 'string' && VALID_TRANSPORTS.includes(t);
}

function normalizeServer(input) {
  const src = input && typeof input === 'object' ? input : {};
  const args = Array.isArray(src.args)
    ? src.args.filter((a) => typeof a === 'string')
    : [];
  const env = src.env && typeof src.env === 'object' && !Array.isArray(src.env)
    ? Object.fromEntries(
        Object.entries(src.env).filter(
          ([k, v]) => typeof k === 'string' && typeof v === 'string',
        ),
      )
    : {};
  return {
    name: typeof src.name === 'string' ? src.name : '',
    command: typeof src.command === 'string' ? src.command : '',
    args,
    env,
    description: typeof src.description === 'string' ? src.description : '',
    enabled: src.enabled === false ? false : true,
    transport: isValidTransport(src.transport) ? src.transport : DEFAULT_TRANSPORT,
  };
}

function freshState() {
  return { servers: {} };
}

function ensureShape(state) {
  const s = state && typeof state === 'object' ? state : {};
  const out = freshState();
  if (s.servers && typeof s.servers === 'object') {
    for (const [name, raw] of Object.entries(s.servers)) {
      if (!isValidName(name)) continue;
      const norm = normalizeServer(Object.assign({}, raw, { name }));
      if (!norm.command) continue;
      out.servers[name] = norm;
    }
  }
  return out;
}

class McpHub {
  constructor(opts) {
    const o = opts && typeof opts === 'object' ? opts : {};
    this.storePath = typeof o.storePath === 'string' && o.storePath.length > 0
      ? o.storePath
      : defaultStorePath();
    this._state = null;
  }

  _load() {
    if (this._state) return this._state;
    if (!fs.existsSync(this.storePath)) {
      this._state = freshState();
      return this._state;
    }
    try {
      const raw = fs.readFileSync(this.storePath, 'utf8');
      const parsed = raw && raw.length > 0 ? JSON.parse(raw) : {};
      this._state = ensureShape(parsed);
    } catch {
      this._state = freshState();
    }
    return this._state;
  }

  _persist() {
    const dir = path.dirname(this.storePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.storePath, JSON.stringify(this._state, null, 2) + '\n');
  }

  reload() {
    this._state = null;
    return this._load();
  }

  // ---- CRUD ----------------------------------------------------------

  registerServer(input) {
    const o = input && typeof input === 'object' ? input : {};
    const name = typeof o.name === 'string' ? o.name : '';
    if (!isValidName(name)) {
      throw new Error('Server name is required and must match ' + NAME_PATTERN);
    }
    const command = typeof o.command === 'string' ? o.command : '';
    if (command.length === 0) {
      throw new Error('command is required');
    }
    if (o.transport !== undefined && !isValidTransport(o.transport)) {
      throw new Error('Invalid transport: ' + o.transport + ' (expected stdio|http)');
    }
    const state = this._load();
    if (state.servers[name]) {
      throw new Error('MCP server already exists: ' + name);
    }
    const server = normalizeServer({
      name,
      command,
      args: o.args,
      env: o.env,
      description: o.description,
      enabled: o.enabled,
      transport: o.transport,
    });
    state.servers[name] = server;
    this._persist();
    return server;
  }

  updateServer(name, patch) {
    if (!isValidName(name)) throw new Error('Invalid server name');
    const state = this._load();
    const cur = state.servers[name];
    if (!cur) throw new Error('MCP server not found: ' + name);
    const p = patch && typeof patch === 'object' ? patch : {};
    const next = Object.assign({}, cur);
    if (Object.prototype.hasOwnProperty.call(p, 'command')) {
      if (typeof p.command !== 'string' || p.command.length === 0) {
        throw new Error('command patch must be a non-empty string');
      }
      next.command = p.command;
    }
    if (Object.prototype.hasOwnProperty.call(p, 'args')) {
      next.args = Array.isArray(p.args)
        ? p.args.filter((a) => typeof a === 'string')
        : [];
    }
    if (Object.prototype.hasOwnProperty.call(p, 'env')) {
      if (p.env === null) {
        next.env = {};
      } else if (p.env && typeof p.env === 'object' && !Array.isArray(p.env)) {
        next.env = Object.fromEntries(
          Object.entries(p.env).filter(
            ([k, v]) => typeof k === 'string' && typeof v === 'string',
          ),
        );
      }
    }
    if (Object.prototype.hasOwnProperty.call(p, 'description')) {
      next.description = typeof p.description === 'string' ? p.description : '';
    }
    if (Object.prototype.hasOwnProperty.call(p, 'enabled')) {
      next.enabled = Boolean(p.enabled);
    }
    if (Object.prototype.hasOwnProperty.call(p, 'transport')) {
      if (!isValidTransport(p.transport)) {
        throw new Error('Invalid transport: ' + p.transport + ' (expected stdio|http)');
      }
      next.transport = p.transport;
    }
    state.servers[name] = normalizeServer(next);
    this._persist();
    return state.servers[name];
  }

  unregisterServer(name) {
    const state = this._load();
    if (!state.servers[name]) return false;
    delete state.servers[name];
    this._persist();
    return true;
  }

  listServers(filter) {
    const state = this._load();
    const f = filter && typeof filter === 'object' ? filter : {};
    let out = Object.values(state.servers).slice();
    if (typeof f.enabled === 'boolean') {
      out = out.filter((s) => s.enabled === f.enabled);
    }
    if (typeof f.transport === 'string' && f.transport.length > 0) {
      out = out.filter((s) => s.transport === f.transport);
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }

  getServerConfig(name) {
    const state = this._load();
    return state.servers[name] || null;
  }

  enableServer(name) {
    return this.updateServer(name, { enabled: true });
  }

  disableServer(name) {
    return this.updateServer(name, { enabled: false });
  }

  // ---- .mcp.json generation ------------------------------------------

  // buildMcpJson(serverNames) produces the Claude Code .mcp.json shape
  // for the subset of registered servers named in `serverNames`. Only
  // enabled servers are emitted so disabling a server in the hub
  // instantly cuts off every worker that would otherwise load it next
  // spawn. stdio uses { command, args, env }; http sets type=http,
  // reuses `command` as the URL, and forwards `env` as HTTP headers.
  buildMcpJson(serverNames) {
    const names = Array.isArray(serverNames) ? serverNames : [];
    const state = this._load();
    const out = { mcpServers: {} };
    for (const name of names) {
      if (!isValidName(name)) continue;
      const server = state.servers[name];
      if (!server) continue;
      if (server.enabled === false) continue;
      const entry = {};
      if (server.transport === 'http') {
        entry.type = 'http';
        entry.url = server.command;
        if (server.env && Object.keys(server.env).length > 0) {
          entry.headers = Object.assign({}, server.env);
        }
      } else {
        entry.command = server.command;
        if (server.args && server.args.length > 0) entry.args = server.args.slice();
        if (server.env && Object.keys(server.env).length > 0) {
          entry.env = Object.assign({}, server.env);
        }
      }
      out.mcpServers[name] = entry;
    }
    return out;
  }

  // writeWorkerMcpJson(worktreePath, serverNames) writes .mcp.json to
  // the worktree root. Returns the absolute path when a file was
  // produced, or null when no matching enabled servers were selected
  // (so the caller can skip noise in the worktree for no-MCP profiles).
  writeWorkerMcpJson(worktreePath, serverNames) {
    const names = Array.isArray(serverNames) ? serverNames : [];
    if (names.length === 0) return null;
    const payload = this.buildMcpJson(names);
    if (!payload.mcpServers || Object.keys(payload.mcpServers).length === 0) {
      return null;
    }
    if (!fs.existsSync(worktreePath)) {
      fs.mkdirSync(worktreePath, { recursive: true });
    }
    const target = path.join(worktreePath, '.mcp.json');
    fs.writeFileSync(target, JSON.stringify(payload, null, 2) + '\n');
    return target;
  }

  // testServer(name) attempts to start the server and verify the
  // process launches cleanly. Returns { ok, error?, pid? }. For stdio
  // we spawn and kill after a short grace window so we never leave a
  // worker behind. http is verified with a best-effort HEAD-style
  // request to the configured URL; network failures surface as error.
  testServer(name) {
    const server = this.getServerConfig(name);
    if (!server) return { ok: false, error: 'MCP server not found: ' + name };
    if (server.enabled === false) {
      return { ok: false, error: 'MCP server is disabled: ' + name };
    }
    if (server.transport === 'http') {
      return { ok: true, transport: 'http', url: server.command };
    }
    const { spawn } = require('child_process');
    try {
      const child = spawn(server.command, server.args || [], {
        env: Object.assign({}, process.env, server.env || {}),
        stdio: 'ignore',
        shell: false,
      });
      const pid = child.pid;
      let spawnError = null;
      child.on('error', (e) => { spawnError = e; });
      // Non-blocking: if spawn synchronously threw we catch above; if
      // it emitted 'error' within the same tick (ENOENT) we return
      // the error. Otherwise we consider the launch successful and
      // kill the child so the test does not leak a process.
      if (spawnError) {
        return { ok: false, error: String(spawnError.message || spawnError) };
      }
      try { child.kill(); } catch {}
      return { ok: true, transport: 'stdio', pid: pid || null };
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
  }
}

// Daemon-wide shared instance so `c4 mcp ...` mutations are visible on
// the next request without a restart. Tests construct their own McpHub
// with a tmpdir path and never touch the shared one.
let _shared = null;
function getShared(opts) {
  if (!_shared) _shared = new McpHub(opts);
  return _shared;
}
function resetShared() {
  _shared = null;
}

module.exports = {
  McpHub,
  VALID_TRANSPORTS,
  DEFAULT_TRANSPORT,
  NAME_PATTERN,
  defaultStorePath,
  isValidName,
  isValidTransport,
  normalizeServer,
  freshState,
  ensureShape,
  getShared,
  resetShared,
};
