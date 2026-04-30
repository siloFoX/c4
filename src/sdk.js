// C4 SDK — programmatic client for the c4 daemon HTTP API.
// (TODO 9.3) Lets external scripts orchestrate workers without shelling out
// to the `c4` CLI. Mirrors the daemon's REST surface; methods return the
// daemon's JSON response (or { error } on failure).
//
// Example:
//   const c4 = require('c4-cli/sdk').create();          // localhost:3456
//   await c4.daemonStart();                              // optional auto-start
//   await c4.create('w1');
//   await c4.task('w1', 'add unit tests', { branch: 'c4/tests' });
//   const res = await c4.wait('w1', { timeoutMs: 60000 });
//   console.log(res.content);
//   await c4.close('w1');

'use strict';

const http = require('http');
const https = require('https');

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 3456;

class C4Client {
  constructor(opts = {}) {
    this.host = opts.host || DEFAULT_HOST;
    this.port = opts.port || DEFAULT_PORT;
    this.protocol = opts.protocol || 'http';
    this.timeout = opts.timeout || 60000;
  }

  _url(path, params) {
    const qs = params
      ? '?' + new URLSearchParams(
          Object.entries(params)
            .filter(([, v]) => v !== undefined && v !== null)
            .map(([k, v]) => [k, String(v)])
        ).toString()
      : '';
    return `${this.protocol}://${this.host}:${this.port}${path}${qs}`;
  }

  request(method, path, { body, params, timeout } = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(this._url(path, params));
      const lib = url.protocol === 'https:' ? https : http;
      const opts = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: body
          ? { 'Content-Type': 'application/json' }
          : {},
        timeout: timeout || this.timeout,
      };
      const req = lib.request(opts, (res) => {
        let buf = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { buf += c; });
        res.on('end', () => {
          let parsed;
          try { parsed = buf ? JSON.parse(buf) : {}; }
          catch { parsed = { error: 'Invalid JSON', body: buf }; }
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            resolve({ error: parsed.error || `HTTP ${res.statusCode}`, _httpStatus: res.statusCode, ...parsed });
          }
        });
      });
      req.on('timeout', () => { req.destroy(); reject(new Error(`Request timeout after ${opts.timeout}ms`)); });
      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  // ---- Worker lifecycle ----
  create(name, command = 'claude', { args = [], target = 'local', cwd = '' } = {}) {
    return this.request('POST', '/create', { body: { name, command, args, target, cwd } });
  }

  task(name, taskText, opts = {}) {
    const body = { name, task: taskText, ...opts };
    return this.request('POST', '/task', { body });
  }

  send(name, input) {
    return this.request('POST', '/send', { body: { name, input } });
  }

  key(name, key) {
    return this.request('POST', '/key', { body: { name, key } });
  }

  approve(name, optionNumber) {
    return this.request('POST', '/approve', { body: { name, optionNumber } });
  }

  rollback(name) {
    return this.request('POST', '/rollback', { body: { name } });
  }

  suspend(name) {
    return this.request('POST', '/suspend', { body: { name } });
  }

  resume(name) {
    return this.request('POST', '/resume', { body: { name } });
  }

  restart(name, { resumeSession = true } = {}) {
    return this.request('POST', '/restart', { body: { name, resume: resumeSession } });
  }

  cancel(name) {
    return this.request('POST', '/cancel', { body: { name } });
  }

  batchAction(names, action, args = {}) {
    return this.request('POST', '/batch-action', { body: { names, action, args } });
  }

  merge(name, { skipChecks = false } = {}) {
    return this.request('POST', '/merge', { body: { name, skipChecks } });
  }

  close(name) {
    return this.request('POST', '/close', { body: { name } });
  }

  // ---- Read paths ----
  read(name) {
    return this.request('GET', '/read', { params: { name } });
  }

  readNow(name) {
    return this.request('GET', '/read-now', { params: { name } });
  }

  scrollback(name, lines = 200) {
    return this.request('GET', '/scrollback', { params: { name, lines } });
  }

  wait(name, { timeoutMs = 120000, interruptOnIntervention = false } = {}) {
    const params = { name, timeout: timeoutMs };
    if (interruptOnIntervention) params.interruptOnIntervention = 1;
    return this.request('GET', '/wait-read', { params, timeout: timeoutMs + 5000 });
  }

  waitMulti(names, { timeoutMs = 120000, mode = 'first', interruptOnIntervention = false } = {}) {
    const params = { names: names.join(','), timeout: timeoutMs, mode };
    if (interruptOnIntervention) params.interruptOnIntervention = 1;
    return this.request('GET', '/wait-read-multi', { params, timeout: timeoutMs + 5000 });
  }

  list() {
    return this.request('GET', '/list');
  }

  history({ worker, limit } = {}) {
    return this.request('GET', '/history', { params: { worker, limit } });
  }

  // 10.2 audit log
  audit({ since, until, action, worker, actor, limit = 200 } = {}) {
    return this.request('GET', '/audit', { params: { since, until, action, worker, actor, limit } });
  }
  auditExport({ since, until, action, worker, actor, format = 'json' } = {}) {
    return this.request('GET', '/audit/export', { params: { since, until, action, worker, actor, format } });
  }

  // 10.3 projects
  projects() { return this.request('GET', '/projects'); }

  // 10.5 cost report
  costReport({ since, until, model } = {}) { return this.request('GET', '/cost-report', { params: { since, until, model } }); }

  // 10.6 departments
  departments() { return this.request('GET', '/departments'); }

  // (TODO #98) multi-repo workspaces
  workspaces() { return this.request('GET', '/workspaces'); }

  // Per-worker + daemon CPU/RSS metrics (TODO #95)
  metrics() { return this.request('GET', '/metrics'); }

  // 11.3 workflow
  runWorkflow(workflow) { return this.request('POST', '/workflow/run', { body: workflow }); }
  workflowRuns({ limit = 50, name } = {}) { return this.request('GET', '/workflow/runs', { params: { limit, name } }); }
  workflowTemplates() { return this.request('GET', '/workflow/templates'); }
  workflowTemplate(name) { return this.request('GET', '/workflow/template', { params: { name } }); }
  saveWorkflowTemplate(name, workflow) { return this.request('POST', '/workflow/template', { body: { name, workflow } }); }
  deleteWorkflowTemplate(name) { return this.request('POST', '/workflow/template/delete', { body: { name } }); }

  // backup / restore (admin)
  backup({ outPath } = {}) { return this.request('POST', '/backup', { body: { outPath } }); }
  restore({ archive, dryRun = false } = {}) { return this.request('POST', '/restore', { body: { archive, dryRun } }); }

  // 11.4 natural language
  nlParse(text) { return this.request('POST', '/nl/parse', { body: { text } }); }
  nlRun(text, opts = {}) { return this.request('POST', '/nl/run', { body: { text, ...opts } }); }

  // 10.8 board
  board(project = 'default') { return this.request('GET', '/board', { params: { project } }); }
  boardCreate(project, card) { return this.request('POST', '/board/card', { body: { project, ...card } }); }
  boardUpdate(project, cardId, patch) { return this.request('POST', '/board/update', { body: { project, cardId, ...patch } }); }
  boardMove(project, cardId, to) { return this.request('POST', '/board/move', { body: { project, cardId, to } }); }
  boardDelete(project, cardId) { return this.request('POST', '/board/delete', { body: { project, cardId } }); }
  boardImportTodo(project, todoPath) { return this.request('POST', '/board/import-todo', { body: { project, todoPath } }); }

  // 10.1 auth
  login(username, password) { return this.request('POST', '/auth/login', { body: { username, password } }); }
  whoami() { return this.request('GET', '/auth/whoami'); }
  withToken(token) {
    // Returns a thin wrapper that adds Authorization header to every request.
    const parent = this;
    const proxy = Object.create(parent);
    proxy.request = function (method, path, opts = {}) {
      // We can't easily inject headers given the current request impl;
      // instead push the token through a custom header that the daemon
      // picks up (we wire the http.request manually here).
      return new Promise((resolve, reject) => {
        const url = new URL(parent._url(path, opts.params));
        const lib = url.protocol === 'https:' ? require('https') : require('http');
        const httpOpts = {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname + url.search,
          method,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          timeout: opts.timeout || parent.timeout,
        };
        const req = lib.request(httpOpts, (res) => {
          let buf = '';
          res.setEncoding('utf8');
          res.on('data', (c) => { buf += c; });
          res.on('end', () => {
            let parsed;
            try { parsed = buf ? JSON.parse(buf) : {}; }
            catch { parsed = { error: 'Invalid JSON', body: buf }; }
            if (res.statusCode >= 200 && res.statusCode < 300) resolve(parsed);
            else resolve({ error: parsed.error || `HTTP ${res.statusCode}`, _httpStatus: res.statusCode, ...parsed });
          });
        });
        req.on('timeout', () => { req.destroy(); reject(new Error(`Request timeout after ${httpOpts.timeout}ms`)); });
        req.on('error', reject);
        if (opts.body) req.write(JSON.stringify(opts.body));
        req.end();
      });
    };
    return proxy;
  }

  // 10.7 scheduler
  schedules() { return this.request('GET', '/schedules'); }
  schedulerStart() { return this.request('POST', '/scheduler/start', { body: {} }); }
  schedulerStop()  { return this.request('POST', '/scheduler/stop',  { body: {} }); }
  scheduleAdd(entry) { return this.request('POST', '/schedule', { body: entry }); }
  scheduleRemove(id) { return this.request('POST', '/schedule/remove', { body: { id } }); }
  scheduleEnable(id, enabled = true) { return this.request('POST', '/schedule/enable', { body: { id, enabled } }); }
  scheduleRunNow(id) { return this.request('POST', '/schedule/run', { body: { id } }); }

  health() {
    return this.request('GET', '/health');
  }

  openapi() {
    return this.request('GET', '/openapi.json');
  }

  config() {
    return this.request('GET', '/config');
  }

  // ---- Fleet (9.6) ----
  fleetPeers() { return this.request('GET', '/fleet/peers'); }
  fleetList()  { return this.request('GET', '/fleet/list'); }
  fleetCreate(peer, args)        { return this.request('POST', '/fleet/create', { body: { peer, ...args } }); }
  fleetTask(peer, name, task, opts = {}) { return this.request('POST', '/fleet/task', { body: { peer, name, task, ...opts } }); }
  fleetClose(peer, name)         { return this.request('POST', '/fleet/close',  { body: { peer, name } }); }
  fleetSend(peer, name, input)   { return this.request('POST', '/fleet/send',   { body: { peer, name, input } }); }
  fleetKey(peer, name, key)      { return this.request('POST', '/fleet/send',   { body: { peer, name, key } }); }

  // ---- Dispatcher (9.7) ----
  dispatch({ name, task, tags = [], strategy = 'least-load', dryRun = false, ...rest } = {}) {
    return this.request('POST', '/dispatch', { body: { name, task, tags, strategy, dryRun, ...rest } });
  }

  // ---- File transfer (9.8) ----
  transfer({ from = 'local', to = 'local', src, dst, mode = 'rsync', flags = '-aP' } = {}) {
    return this.request('POST', '/fleet/transfer', { body: { from, to, src, dst, mode, flags } });
  }
  getTransfer(id) {
    return this.request('GET', '/fleet/transfer', { params: { id } });
  }
  listTransfers({ limit = 50 } = {}) {
    return this.request('GET', '/fleet/transfer', { params: { limit } });
  }
  cancelTransfer(id) {
    return this.request('POST', '/fleet/transfer/cancel', { body: { id } });
  }

  // ---- Scribe ----
  scribeStart() { return this.request('POST', '/scribe/start', { body: {} }); }
  scribeStop()  { return this.request('POST', '/scribe/stop',  { body: {} }); }
  scribeStatus(){ return this.request('GET',  '/scribe/status'); }
  scribeContext(){ return this.request('GET', '/scribe/context'); }
  scribeScan() { return this.request('POST', '/scribe/scan',  { body: {} }); }

  // ---- Convenience: poll until idle ----
  async untilIdle(name, { timeoutMs = 120000, pollMs = 500 } = {}) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const list = await this.list();
      const w = (list.workers || []).find((x) => x.name === name);
      if (!w) return { error: `Worker '${name}' not found` };
      if (w.status === 'idle' || w.status === 'exited') return w;
      await new Promise((r) => setTimeout(r, pollMs));
    }
    return { error: 'untilIdle timeout' };
  }

  // ---- SSE event stream (returns { close, on(eventType, cb) }) ----
  events({ onMessage, onError } = {}) {
    const url = new URL(this._url('/events'));
    const lib = url.protocol === 'https:' ? https : http;
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'GET',
      headers: { Accept: 'text/event-stream' },
    };
    let aborted = false;
    const req = lib.request(opts, (res) => {
      res.setEncoding('utf8');
      let buf = '';
      res.on('data', (chunk) => {
        buf += chunk;
        let idx;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const line = block.split('\n').find((l) => l.startsWith('data: '));
          if (line && onMessage) {
            try { onMessage(JSON.parse(line.slice(6))); }
            catch { /* swallow */ }
          }
        }
      });
      res.on('error', (e) => { if (!aborted && onError) onError(e); });
    });
    req.on('error', (e) => { if (!aborted && onError) onError(e); });
    req.end();
    return {
      close: () => { aborted = true; req.destroy(); },
    };
  }
}

function create(opts) {
  return new C4Client(opts);
}

module.exports = { C4Client, create };
