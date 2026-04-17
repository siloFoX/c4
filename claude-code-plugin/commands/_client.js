'use strict';

// Client selection for the five c4 slash commands. Prefers the c4-sdk
// package when it is available, then falls back to a built-in minimal
// fetch client so the plugin works even when c4-sdk is not installed.
//
// All external dependencies (fetch, environment, client class) are
// injectable so handlers stay pure-function testable - tests construct
// a stub fetch, pass it in, and verify the recorded URL / method / body.

const fs = require('fs');
const path = require('path');
const os = require('os');

function resolveBase(env) {
  return env.C4_BASE || env.C4_URL || 'http://localhost:3456';
}

function resolveToken(env) {
  if (env.C4_TOKEN) return env.C4_TOKEN;
  try {
    const home = env.HOME || env.USERPROFILE || os.homedir();
    const tokFile = path.join(home, '.c4-token');
    if (fs.existsSync(tokFile)) {
      const raw = fs.readFileSync(tokFile, 'utf8').trim();
      if (raw) return raw;
    }
  } catch (_) {}
  return null;
}

function loadSdk() {
  try { return require('c4-sdk'); } catch (_) {}
  const candidates = [
    path.join(__dirname, '..', '..', 'sdk'),
    path.join(__dirname, '..', '..', 'sdk', 'lib'),
  ];
  for (const candidate of candidates) {
    try { return require(candidate); } catch (_) {}
  }
  return null;
}

class MinimalC4Client {
  constructor(opts = {}) {
    const base = opts.base || 'http://localhost:3456';
    this.base = typeof base === 'string' ? base.replace(/\/+$/, '') : 'http://localhost:3456';
    this.token = opts.token || null;
    const hasFetchOpt = Object.prototype.hasOwnProperty.call(opts || {}, 'fetch');
    this.fetch = hasFetchOpt
      ? opts.fetch
      : (typeof fetch === 'function' ? fetch : null);
    if (typeof this.fetch !== 'function') {
      throw new Error('MinimalC4Client: no fetch implementation. Use Node >= 18 or pass opts.fetch.');
    }
  }

  _headers(extra) {
    const h = Object.assign({ Accept: 'application/json' }, extra || {});
    if (this.token) h.Authorization = 'Bearer ' + this.token;
    return h;
  }

  async _request(method, route, body) {
    const url = this.base + route;
    const init = { method, headers: this._headers() };
    if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      const clean = {};
      for (const k of Object.keys(body)) {
        if (body[k] !== undefined) clean[k] = body[k];
      }
      init.body = JSON.stringify(clean);
    }
    let res;
    try {
      res = await this.fetch(url, init);
    } catch (err) {
      const e = new Error('Network error: ' + (err && err.message ? err.message : String(err)));
      e.cause = err;
      throw e;
    }
    let text = '';
    try { text = await res.text(); } catch (_) { text = ''; }
    let parsed = null;
    if (text) {
      try { parsed = JSON.parse(text); } catch (_) { parsed = text; }
    }
    if (!res.ok) {
      const msg = parsed && typeof parsed === 'object' && parsed.error
        ? parsed.error
        : (typeof parsed === 'string' && parsed ? parsed : (res.statusText || 'request failed'));
      const err = new Error('C4 ' + method + ' ' + route + ' failed (' + res.status + '): ' + msg);
      err.status = res.status;
      err.body = parsed;
      throw err;
    }
    return parsed == null ? {} : parsed;
  }

  listWorkers() {
    return this._request('GET', '/list');
  }

  createWorker(name, opts) {
    if (!name) throw new Error('MinimalC4Client.createWorker: name is required');
    const o = opts || {};
    return this._request('POST', '/create', {
      name,
      command: o.command,
      args: o.args,
      target: o.target,
      cwd: o.cwd,
      parent: o.parent,
    });
  }

  sendTask(name, task, opts) {
    if (!name) throw new Error('MinimalC4Client.sendTask: name is required');
    if (!task || typeof task !== 'string') {
      throw new Error('MinimalC4Client.sendTask: task must be a non-empty string');
    }
    const body = Object.assign({ name, task }, opts || {});
    return this._request('POST', '/task', body);
  }

  merge(name, opts) {
    if (!name) throw new Error('MinimalC4Client.merge: name is required');
    const o = opts || {};
    return this._request('POST', '/merge', { name, skipChecks: o.skipChecks });
  }

  close(name) {
    if (!name) throw new Error('MinimalC4Client.close: name is required');
    return this._request('POST', '/close', { name });
  }
}

function getClient(opts) {
  const o = opts || {};
  const env = o.env || process.env;
  const fetchImpl = typeof o.fetch === 'function'
    ? o.fetch
    : (typeof fetch === 'function' ? fetch : null);
  const base = o.base || resolveBase(env);
  const token = o.token !== undefined ? o.token : resolveToken(env);

  if (typeof o.ClientClass === 'function') {
    return { client: new o.ClientClass({ base, token, fetch: fetchImpl }), source: 'injected', base, token };
  }

  if (o.useSdk !== false) {
    const sdk = loadSdk();
    if (sdk && typeof sdk.C4Client === 'function') {
      return { client: new sdk.C4Client({ base, token, fetch: fetchImpl }), source: 'c4-sdk', base, token };
    }
  }

  return { client: new MinimalC4Client({ base, token, fetch: fetchImpl }), source: 'minimal', base, token };
}

module.exports = {
  getClient,
  MinimalC4Client,
  loadSdk,
  resolveBase,
  resolveToken,
};
