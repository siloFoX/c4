'use strict';

// c4-sdk tests (TODO 9.3)
//
// Every test boots a throwaway http.createServer on an ephemeral port,
// points a C4Client at it, and asserts the request path, headers and
// body we receive. That lets us exercise the full client surface --
// happy path, daemon error responses, token auth -- without spinning
// up the real c4 daemon.

const assert = require('assert');
const http = require('http');
const { describe, it, before, after } = require('node:test');

const { C4Client, C4Error } = require('../sdk/lib/index');

// -------- Test harness --------

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.setEncoding('utf8');
    req.on('data', (c) => { buf += c; });
    req.on('end', () => {
      if (!buf) return resolve({});
      try { resolve(JSON.parse(buf)); } catch (err) { reject(err); }
    });
    req.on('error', reject);
  });
}

function createMockDaemon({ requireToken = null } = {}) {
  // Array of {method, path} objects mutated by the request handler so
  // tests can assert on what we received.
  const requests = [];
  let customHandler = null;

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const route = url.pathname;
      const method = req.method;
      const headers = req.headers;

      let body = null;
      if (method === 'POST') {
        body = await parseJsonBody(req);
      }

      const entry = { method, path: route, query: Object.fromEntries(url.searchParams), headers, body };
      requests.push(entry);

      // Auth gate (mimics daemon behaviour for /api/* style routes).
      if (requireToken && route !== '/health') {
        const auth = headers.authorization || headers.Authorization || '';
        const queryToken = url.searchParams.get('token');
        const supplied = /^Bearer\s+(.+)$/i.test(auth) ? auth.replace(/^Bearer\s+/i, '') : queryToken;
        if (supplied !== requireToken) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Authentication required' }));
          return;
        }
      }

      if (customHandler) {
        const handled = await customHandler(req, res, entry);
        if (handled) return;
      }

      // Default responses match the daemon's route handlers in src/daemon.js.
      if (method === 'GET' && route === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, workers: 2, version: '1.7.9' }));
        return;
      }
      if (method === 'GET' && route === '/list') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          workers: [
            { name: 'alpha', status: 'idle', target: 'local', branch: 'c4/alpha' },
            { name: 'beta', status: 'busy', target: 'dgx', branch: 'c4/beta' },
          ],
          queuedTasks: [],
          lostWorkers: [],
        }));
        return;
      }
      if (method === 'POST' && route === '/create') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ name: body.name, pid: 1234, target: body.target || 'local' }));
        return;
      }
      if (method === 'POST' && route === '/task') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ name: body.name, queued: true, branch: body.branch || null, autoMode: !!body.autoMode }));
        return;
      }
      if (method === 'POST' && route === '/send') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ sent: true, bytes: (body.input || '').length }));
        return;
      }
      if (method === 'POST' && route === '/key') {
        if (!body.name || !body.key) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing name or key' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ sent: true, key: body.key }));
        return;
      }
      if (method === 'GET' && route === '/read') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ output: 'idle output', idle: true, name: url.searchParams.get('name') }));
        return;
      }
      if (method === 'GET' && route === '/read-now') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ output: 'live output', idle: false, name: url.searchParams.get('name') }));
        return;
      }
      if (method === 'GET' && route === '/wait-read') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          output: 'waited output',
          idle: true,
          name: url.searchParams.get('name'),
          timeout: Number(url.searchParams.get('timeout') || 0),
          interruptOnIntervention: url.searchParams.get('interruptOnIntervention') === '1',
        }));
        return;
      }
      if (method === 'POST' && route === '/merge') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, merged: body.name, skipChecks: !!body.skipChecks }));
        return;
      }
      if (method === 'POST' && route === '/close') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ closed: true, name: body.name }));
        return;
      }
      if (method === 'GET' && route === '/fleet/overview') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          self: { alias: '_self', host: '127.0.0.1', port: 3456, workers: 0, version: '1.7.9' },
          machines: [{ alias: 'peer-a', host: '10.0.0.1', port: 3456, ok: true, workers: 3 }],
        }));
        return;
      }
      if (method === 'GET' && route === '/watch') {
        const name = url.searchParams.get('name');
        if (!name) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing name parameter' }));
          return;
        }
        if (name === 'missing') {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Worker '${name}' not found` }));
          return;
        }
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });
        res.write(`data: ${JSON.stringify({ type: 'connected', worker: name })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: 'output', data: Buffer.from('hello ').toString('base64') })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: 'output', data: Buffer.from('world').toString('base64') })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: 'complete', worker: name, exitCode: 0 })}\n\n`);
        res.end();
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `no handler for ${method} ${route}` }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err && err.message || 'handler error' }));
    }
  });

  return {
    server,
    requests,
    setHandler(fn) { customHandler = fn; },
    async start() {
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      const { port, address } = server.address();
      return `http://${address}:${port}`;
    },
    async stop() {
      await new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

// -------- Tests --------

describe('C4Client basics', () => {
  it('throws when no fetch is available', () => {
    assert.throws(() => new C4Client({ base: 'http://x', fetch: null }), /no fetch/);
  });

  it('strips trailing slash from base', () => {
    const c = new C4Client({ base: 'http://localhost:3456/' });
    assert.strictEqual(c.base, 'http://localhost:3456');
  });

  it('DEFAULT_BASE is exported and used when base is absent', () => {
    const mod = require('../sdk/lib/index');
    assert.strictEqual(typeof mod.DEFAULT_BASE, 'string');
    const c = new C4Client({});
    assert.strictEqual(c.base, mod.DEFAULT_BASE);
  });
});

describe('C4Client happy-path endpoints', () => {
  let daemon;
  let base;
  let c4;

  before(async () => {
    daemon = createMockDaemon();
    base = await daemon.start();
    c4 = new C4Client({ base });
  });

  after(async () => {
    await daemon.stop();
  });

  it('health()', async () => {
    const h = await c4.health();
    assert.deepStrictEqual(h, { ok: true, workers: 2, version: '1.7.9' });
    const last = daemon.requests[daemon.requests.length - 1];
    assert.strictEqual(last.method, 'GET');
    assert.strictEqual(last.path, '/health');
  });

  it('listWorkers()', async () => {
    const r = await c4.listWorkers();
    assert.strictEqual(r.workers.length, 2);
    assert.strictEqual(r.workers[0].name, 'alpha');
  });

  it('getWorker() returns the matching entry', async () => {
    const w = await c4.getWorker('beta');
    assert.ok(w);
    assert.strictEqual(w.name, 'beta');
    assert.strictEqual(w.status, 'busy');
  });

  it('getWorker() returns null when absent', async () => {
    const w = await c4.getWorker('ghost');
    assert.strictEqual(w, null);
  });

  it('createWorker() posts with body', async () => {
    const r = await c4.createWorker('alpha', { target: 'dgx', cwd: '/tmp/x' });
    assert.strictEqual(r.name, 'alpha');
    assert.strictEqual(r.target, 'dgx');
    const last = daemon.requests[daemon.requests.length - 1];
    assert.strictEqual(last.method, 'POST');
    assert.strictEqual(last.path, '/create');
    assert.deepStrictEqual(last.body, { name: 'alpha', target: 'dgx', cwd: '/tmp/x' });
  });

  it('sendTask() forwards options', async () => {
    const r = await c4.sendTask('alpha', 'do thing', { autoMode: true, branch: 'c4/alpha' });
    assert.strictEqual(r.queued, true);
    assert.strictEqual(r.branch, 'c4/alpha');
    assert.strictEqual(r.autoMode, true);
    const last = daemon.requests[daemon.requests.length - 1];
    assert.deepStrictEqual(last.body, { name: 'alpha', task: 'do thing', autoMode: true, branch: 'c4/alpha' });
  });

  it('sendInput()', async () => {
    const r = await c4.sendInput('alpha', 'yes');
    assert.strictEqual(r.sent, true);
    assert.strictEqual(r.bytes, 3);
    const last = daemon.requests[daemon.requests.length - 1];
    assert.deepStrictEqual(last.body, { name: 'alpha', input: 'yes' });
  });

  it('sendKey()', async () => {
    const r = await c4.sendKey('alpha', 'Enter');
    assert.strictEqual(r.sent, true);
    assert.strictEqual(r.key, 'Enter');
    const last = daemon.requests[daemon.requests.length - 1];
    assert.deepStrictEqual(last.body, { name: 'alpha', key: 'Enter' });
  });

  it('readOutput() default hits /read', async () => {
    const r = await c4.readOutput('alpha');
    assert.strictEqual(r.output, 'idle output');
    const last = daemon.requests[daemon.requests.length - 1];
    assert.strictEqual(last.path, '/read');
    assert.strictEqual(last.query.name, 'alpha');
  });

  it('readOutput({ now: true }) hits /read-now', async () => {
    const r = await c4.readOutput('alpha', { now: true });
    assert.strictEqual(r.output, 'live output');
    const last = daemon.requests[daemon.requests.length - 1];
    assert.strictEqual(last.path, '/read-now');
  });

  it('readOutput({ wait: true }) hits /wait-read with timeout', async () => {
    const r = await c4.readOutput('alpha', { wait: true, timeoutMs: 9000, interruptOnIntervention: true });
    assert.strictEqual(r.output, 'waited output');
    assert.strictEqual(r.timeout, 9000);
    assert.strictEqual(r.interruptOnIntervention, true);
    const last = daemon.requests[daemon.requests.length - 1];
    assert.strictEqual(last.path, '/wait-read');
    assert.strictEqual(last.query.timeout, '9000');
    assert.strictEqual(last.query.interruptOnIntervention, '1');
  });

  it('merge() passes skipChecks', async () => {
    const r = await c4.merge('alpha', { skipChecks: true });
    assert.strictEqual(r.success, true);
    assert.strictEqual(r.merged, 'alpha');
    assert.strictEqual(r.skipChecks, true);
    const last = daemon.requests[daemon.requests.length - 1];
    assert.deepStrictEqual(last.body, { name: 'alpha', skipChecks: true });
  });

  it('close()', async () => {
    const r = await c4.close('alpha');
    assert.strictEqual(r.closed, true);
    assert.strictEqual(r.name, 'alpha');
  });

  it('fleetOverview()', async () => {
    const r = await c4.fleetOverview({ timeoutMs: 2500 });
    assert.strictEqual(r.self.alias, '_self');
    assert.strictEqual(r.machines.length, 1);
    const last = daemon.requests[daemon.requests.length - 1];
    assert.strictEqual(last.path, '/fleet/overview');
    assert.strictEqual(last.query.timeout, '2500');
  });

  it('watch() decodes SSE events and terminates on stream end', async () => {
    const events = [];
    for await (const ev of c4.watch('alpha')) {
      events.push(ev);
      if (ev.type === 'complete') break;
    }
    assert.strictEqual(events[0].type, 'connected');
    assert.strictEqual(events[1].type, 'output');
    assert.strictEqual(events[1].dataText, 'hello ');
    assert.strictEqual(events[2].type, 'output');
    assert.strictEqual(events[2].dataText, 'world');
    assert.strictEqual(events[3].type, 'complete');
    assert.strictEqual(events[3].exitCode, 0);
  });

  it('watch() on a missing worker throws with status 404', async () => {
    let threw = null;
    try {
      for await (const ev of c4.watch('missing')) { void ev; }
    } catch (err) { threw = err; }
    assert.ok(threw);
    assert.ok(threw instanceof C4Error);
    assert.strictEqual(threw.status, 404);
  });
});

describe('C4Client error handling', () => {
  let daemon;
  let base;
  let c4;

  before(async () => {
    daemon = createMockDaemon();
    base = await daemon.start();
    c4 = new C4Client({ base });
  });

  after(async () => {
    await daemon.stop();
  });

  it('non-2xx responses throw C4Error with status + body', async () => {
    daemon.setHandler((req, res, entry) => {
      if (entry.path === '/create') {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'worker already exists' }));
        return true;
      }
      return false;
    });
    let threw = null;
    try { await c4.createWorker('dup'); } catch (err) { threw = err; }
    assert.ok(threw instanceof C4Error, 'expected C4Error');
    assert.strictEqual(threw.status, 409);
    assert.deepStrictEqual(threw.body, { error: 'worker already exists' });
    assert.match(threw.message, /worker already exists/);
    daemon.setHandler(null);
  });

  it('404 for unknown route throws with the daemon error body', async () => {
    let threw = null;
    try { await c4._request('GET', '/no-such-route'); } catch (err) { threw = err; }
    assert.ok(threw instanceof C4Error);
    assert.strictEqual(threw.status, 404);
  });

  it('network failure surfaces as C4Error with cause', async () => {
    const dead = new C4Client({ base: 'http://127.0.0.1:1', timeoutMs: 2000 });
    let threw = null;
    try { await dead.health(); } catch (err) { threw = err; }
    assert.ok(threw instanceof C4Error);
    assert.ok(threw.message);
  });

  it('missing required arguments throw before making a request', () => {
    assert.throws(() => c4.createWorker(''), /name is required/);
    assert.throws(() => c4.sendTask('name', ''), /task must be a non-empty string/);
    assert.throws(() => c4.sendKey('name', ''), /key is required/);
    assert.throws(() => c4.watch('')[Symbol.asyncIterator](), /name is required/);
  });
});

describe('C4Client auth (JWT)', () => {
  let daemon;
  let base;
  const token = 'test.jwt.token';

  before(async () => {
    daemon = createMockDaemon({ requireToken: token });
    base = await daemon.start();
  });

  after(async () => {
    await daemon.stop();
  });

  it('rejects api calls without a token (401)', async () => {
    const c4 = new C4Client({ base });
    let threw = null;
    try { await c4.listWorkers(); } catch (err) { threw = err; }
    assert.ok(threw instanceof C4Error);
    assert.strictEqual(threw.status, 401);
    assert.match(threw.message, /Authentication required/);
  });

  it('sends Authorization: Bearer <token> on JSON calls', async () => {
    const c4 = new C4Client({ base, token });
    const r = await c4.listWorkers();
    assert.strictEqual(r.workers.length, 2);
    const last = daemon.requests[daemon.requests.length - 1];
    assert.strictEqual(last.headers.authorization, `Bearer ${token}`);
  });

  it('appends ?token= on the watch SSE url', async () => {
    const c4 = new C4Client({ base, token });
    const events = [];
    for await (const ev of c4.watch('alpha')) {
      events.push(ev);
      if (ev.type === 'complete') break;
    }
    assert.ok(events.length >= 2);
    const watchReq = daemon.requests.filter((r) => r.path === '/watch').pop();
    assert.strictEqual(watchReq.query.token, token);
    assert.strictEqual(watchReq.headers.authorization, `Bearer ${token}`);
  });

  it('/health does not require a token', async () => {
    const c4 = new C4Client({ base });
    const h = await c4.health();
    assert.strictEqual(h.ok, true);
  });
});
