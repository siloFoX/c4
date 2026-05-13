'use strict';

// (v1.11.101 / TODO 11.83) Daemon endpoint tests for
// /api/metrics/prometheus.
//
// Mirrors the in-process fixture pattern used by daemon-routes.test.js
// (TODO 11.79): builds a tiny http.Server that wires the SAME pieces
// daemon.js wires for /metrics + /metrics/prometheus (real auth.js,
// real prometheus-format, stub PtyManager) so the assertion path
// exercises route dispatch, auth gating, content type, and body shape
// without spinning the full daemon (which would need a real
// config.json, state.json, and port management).
//
// Uses native http.request (instead of supertest) so the test runs
// without a node_modules install — keeps the file portable.

const assert = require('assert');
const http = require('http');
const { describe, it, before, after } = require('node:test');

const auth = require('../src/auth');
const promFormat = require('../src/prometheus-format');

function makeStubManager(opts) {
  const o = opts || {};
  const config = o.config || { auth: { enabled: false } };
  const workers = Array.isArray(o.workers) ? o.workers.slice() : [];
  const tierByName = new Map(Object.entries(o.tierByName || {}));
  return {
    getConfig() { return config; },
    list() {
      return {
        workers: workers.map((w) => Object.assign({}, w)),
        queuedTasks: [],
        lostWorkers: [],
      };
    },
    metrics() {
      return {
        daemon: { pid: 1, uptimeSec: 0, rssKb: 0, heapUsedKb: 0, heapTotalKb: 0, cpus: 1, loadavg: [0, 0, 0] },
        workers: workers.map((w) => ({
          name: w.name,
          pid: w.pid || null,
          status: w.status || 'idle',
          cpuPct: typeof w.cpuPct === 'number' ? w.cpuPct : null,
          rssKb: typeof w.rssKb === 'number' ? w.rssKb : null,
          threads: typeof w.threads === 'number' ? w.threads : null,
        })),
        totals: { liveWorkers: workers.length, totalWorkers: workers.length, totalRssKb: 0, totalCpuPct: 0 },
      };
    },
    _tierMap: tierByName,
  };
}

// Build an http.Server that mirrors daemon.js's /metrics +
// /metrics/prometheus dispatch (auth check, route match, projection
// into the prometheus format, content type + body).
function buildPromServer({ manager, counters }) {
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const url = new URL(req.url, 'http://127.0.0.1');
    const rawPath = url.pathname;
    const isApiPrefixed = rawPath.startsWith('/api/');
    const route = isApiPrefixed ? rawPath.slice('/api'.length) : rawPath;
    const cfg = manager.getConfig();
    const needsAuthCheck = isApiPrefixed;
    if (needsAuthCheck) {
      const authCheck = auth.checkRequest(cfg, req, route);
      if (!authCheck.allow) {
        res.writeHead(authCheck.status || 401);
        res.end(JSON.stringify(authCheck.body || { error: 'Authentication required' }));
        return;
      }
    }
    if (req.method === 'GET' && route === '/metrics') {
      res.writeHead(200);
      res.end(JSON.stringify(manager.metrics()));
      return;
    }
    if (req.method === 'GET' && route === '/metrics/prometheus') {
      const promSnap = manager.metrics();
      const listSnap = manager.list();
      const targetByName = new Map();
      for (const w of listSnap.workers) {
        targetByName.set(w.name, w.target || 'local');
      }
      const promWorkers = (promSnap.workers || []).map((w) => ({
        name: w.name,
        tier: manager._tierMap.get(w.name) || 'worker',
        target: targetByName.get(w.name) || 'local',
        rssKb: typeof w.rssKb === 'number' ? w.rssKb : null,
        cpuPct: typeof w.cpuPct === 'number' ? w.cpuPct : null,
      }));
      const body = promFormat.formatMetrics(promWorkers, counters);
      res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      res.writeHead(200);
      res.end(body);
      return;
    }
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found: ' + route }));
  });
  return server;
}

function serverAddress(server) {
  const addr = server.address();
  return 'http://127.0.0.1:' + addr.port;
}

function httpGet(serverUrl, path, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(path, serverUrl);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + (u.search || ''),
        method: 'GET',
        headers: headers || {},
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            text: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

describe('(v1.11.101) GET /api/metrics/prometheus', () => {
  let server;
  let baseUrl;
  let counters;

  before((t, done) => {
    counters = { dispatch: 7, escalation: 2 };
    const manager = makeStubManager({
      workers: [
        { name: 'auto-w1', pid: 100, status: 'idle', rssKb: 12345, cpuPct: 1.2, target: 'local' },
        { name: 'mgr-1', pid: 101, status: 'idle', rssKb: 65000, cpuPct: 0.5, target: 'dgx' },
      ],
      tierByName: { 'mgr-1': 'manager' },
    });
    server = buildPromServer({ manager, counters });
    server.listen(0, '127.0.0.1', () => {
      baseUrl = serverAddress(server);
      done();
    });
  });

  after(() => { try { server.close(); } catch {} });

  it('returns 200 with the prometheus content type', async () => {
    const res = await httpGet(baseUrl, '/api/metrics/prometheus');
    assert.strictEqual(res.status, 200);
    assert.match(
      res.headers['content-type'],
      /^text\/plain; version=0\.0\.4; charset=utf-8$/,
    );
  });

  it('returns a body that parses as prometheus text format', async () => {
    const res = await httpGet(baseUrl, '/api/metrics/prometheus');
    assert.strictEqual(res.status, 200);
    const body = res.text;
    assert.ok(typeof body === 'string' && body.length > 0);
    const lines = body.split('\n').filter((l) => l.length > 0);
    const help = lines.filter((l) => l.startsWith('# HELP'));
    const type = lines.filter((l) => l.startsWith('# TYPE'));
    assert.strictEqual(help.length, 4, 'four HELP lines (rss, cpu, dispatch, escalation)');
    assert.strictEqual(type.length, 4, 'four TYPE lines (rss, cpu, dispatch, escalation)');
    const samples = lines.filter((l) => !l.startsWith('#'));
    for (const s of samples) {
      assert.match(s, /^[a-z_][a-z0-9_]*(\{[^}]+\})? -?\d+(\.\d+)?$/i,
        'sample line shape: ' + s);
    }
  });

  it('emits per-worker rss + cpu rows with the right labels', async () => {
    const res = await httpGet(baseUrl, '/api/metrics/prometheus');
    const body = res.text;
    assert.ok(body.includes('c4_worker_rss_bytes{name="auto-w1",tier="worker",target="local"} 12641280'));
    assert.ok(body.includes('c4_worker_cpu_percent{name="auto-w1",tier="worker",target="local"} 1.2'));
    assert.ok(body.includes('c4_worker_rss_bytes{name="mgr-1",tier="manager",target="dgx"} '));
    assert.ok(body.includes('c4_worker_cpu_percent{name="mgr-1",tier="manager",target="dgx"} 0.5'));
  });

  it('reflects the live dispatch + escalation counters on each scrape', async () => {
    const res = await httpGet(baseUrl, '/api/metrics/prometheus');
    assert.ok(res.text.includes('c4_dispatch_total_count 7'));
    assert.ok(res.text.includes('c4_escalation_total_count 2'));
    counters.dispatch = 9;
    counters.escalation = 4;
    const res2 = await httpGet(baseUrl, '/api/metrics/prometheus');
    assert.ok(res2.text.includes('c4_dispatch_total_count 9'));
    assert.ok(res2.text.includes('c4_escalation_total_count 4'));
  });
});

describe('(v1.11.101) /api/metrics/prometheus with empty fleet', () => {
  let server;
  let baseUrl;

  before((t, done) => {
    const manager = makeStubManager({ workers: [] });
    server = buildPromServer({ manager, counters: {} });
    server.listen(0, '127.0.0.1', () => {
      baseUrl = serverAddress(server);
      done();
    });
  });

  after(() => { try { server.close(); } catch {} });

  it('emits only HELP / TYPE + counter zeros when no workers are live', async () => {
    const res = await httpGet(baseUrl, '/api/metrics/prometheus');
    assert.strictEqual(res.status, 200);
    const lines = res.text.split('\n').filter((l) => l.length > 0);
    const gaugeRows = lines.filter((l) => l.startsWith('c4_worker_'));
    assert.strictEqual(gaugeRows.length, 0, 'no gauge rows for empty fleet');
    assert.ok(res.text.includes('c4_dispatch_total_count 0'));
    assert.ok(res.text.includes('c4_escalation_total_count 0'));
  });
});

describe('(v1.11.101) /api/metrics/prometheus auth gate matches /api/metrics', () => {
  let server;
  let baseUrl;
  let secret;

  before((t, done) => {
    secret = auth.generateSecret();
    const cfg = {
      auth: {
        enabled: true,
        secret,
        users: {
          alice: { passwordHash: auth.hashPassword('pw'), role: 'admin' },
        },
      },
    };
    const manager = makeStubManager({
      config: cfg,
      workers: [{ name: 'w', pid: 1, status: 'idle', rssKb: 100, cpuPct: 0.1, target: 'local' }],
    });
    server = buildPromServer({ manager, counters: { dispatch: 0, escalation: 0 } });
    server.listen(0, '127.0.0.1', () => {
      baseUrl = serverAddress(server);
      done();
    });
  });

  after(() => { try { server.close(); } catch {} });

  it('returns 401 without a bearer token (same status as /api/metrics)', async () => {
    const a = await httpGet(baseUrl, '/api/metrics');
    const b = await httpGet(baseUrl, '/api/metrics/prometheus');
    assert.strictEqual(a.status, b.status, 'auth gate parity with /api/metrics');
    assert.strictEqual(b.status, 401);
  });

  it('returns 200 with a valid bearer token', async () => {
    const token = auth.signToken({ sub: 'alice', role: 'admin' }, secret);
    const res = await httpGet(baseUrl, '/api/metrics/prometheus', {
      Authorization: 'Bearer ' + token,
    });
    assert.strictEqual(res.status, 200);
    assert.match(res.headers['content-type'], /^text\/plain; version=0\.0\.4/);
    assert.ok(res.text.includes('c4_worker_rss_bytes'));
  });

  it('returns 401 with a token signed by the wrong secret', async () => {
    const wrong = auth.signToken({ sub: 'alice', role: 'admin' }, auth.generateSecret());
    const res = await httpGet(baseUrl, '/api/metrics/prometheus', {
      Authorization: 'Bearer ' + wrong,
    });
    assert.strictEqual(res.status, 401);
  });
});
