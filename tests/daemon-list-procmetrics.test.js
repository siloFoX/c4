'use strict';

// (v1.11.131 / TODO 11.113) Per-worker rssBytes + cpuPct enrichment on
// GET /list. The daemon's /list handler now calls
// `workerMetrics.sample(pid, prev)` after the tier loop and attaches:
//   - rssBytes (rssKb * 1024) on each worker row, or null
//   - cpuPct                              on each worker row, or null
// using a module-scope `listMetricsPrev` Map so CPU% computes across
// successive /list calls (first call seeds, next produces a delta).
//
// daemon.js does not export the handler — the file eagerly creates and
// listens on http.createServer at load time, so we cannot require it
// from a test process. We mirror the same enrichment logic in a small
// in-process http.Server here (same trade daemon-routes.test.js makes
// for /auth, /list, /autonomous, /config) and assert the response
// shape. A `daemon.js source integration` block at the bottom greps
// the real source so a refactor that drops the enrichment loop or the
// listMetricsPrev cache trips the test.

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { describe, it, before, after } = require('node:test');

const request = require('supertest');

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeStubManager(workers) {
  const rows = Array.isArray(workers) ? workers.slice() : [];
  return {
    list() {
      return { workers: rows.map((w) => ({ ...w })), queuedTasks: [], lostWorkers: [] };
    },
    getConfig() {
      return { auth: { enabled: false } };
    },
  };
}

// Build the in-process server that mirrors the daemon's /list handler
// AND its new metrics-enrichment loop. Accepts a `workerMetricsStub`
// that takes (pid, prev) -> { rssKb, threads, cpuPct, sample } so each
// test can dictate the exact values without depending on real /proc
// reads. listMetricsPrev mirrors the module-scope Map in daemon.js.
function buildListServer({ manager, workerMetricsStub }) {
  const listMetricsPrev = new Map();
  const sampleCalls = [];
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const route = url.pathname.replace(/^\/api/, '') || '/';
    if (req.method !== 'GET' || route !== '/list') {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    try {
      const listed = manager.list();
      if (listed && Array.isArray(listed.workers)) {
        for (const w of listed.workers) {
          w.tier = w.tier || 'worker';
        }
        for (const w of listed.workers) {
          if (!w || typeof w.name !== 'string') continue;
          const prev = listMetricsPrev.get(w.name) || null;
          const ms = workerMetricsStub(w.pid, prev);
          sampleCalls.push({ name: w.name, pid: w.pid, prev });
          if (ms.sample) listMetricsPrev.set(w.name, ms.sample);
          w.rssBytes = typeof ms.rssKb === 'number' ? ms.rssKb * 1024 : null;
          w.cpuPct = typeof ms.cpuPct === 'number' ? ms.cpuPct : null;
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(listed));
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: e && e.message ? e.message : String(e) }));
    }
  });
  return { server, sampleCalls, listMetricsPrev };
}

// ---------------------------------------------------------------------------
// /list metrics enrichment
// ---------------------------------------------------------------------------

describe('(v1.11.131) GET /list metrics enrichment', () => {
  it('attaches rssBytes (rssKb * 1024) and cpuPct on each worker row', async () => {
    const workers = [
      { name: 'w1', pid: 1001, status: 'idle', branch: 'c4/w1' },
      { name: 'w2', pid: 1002, status: 'busy', branch: 'c4/w2' },
    ];
    const manager = makeStubManager(workers);
    const stub = (pid /* , prev */) => {
      if (pid === 1001) {
        return {
          rssKb: 50_000,
          threads: 8,
          cpuPct: 12.5,
          sample: { utime: 100, stime: 50, sampledAt: 1_700_000_000_000 },
        };
      }
      return {
        rssKb: 75_000,
        threads: 12,
        cpuPct: 30,
        sample: { utime: 200, stime: 80, sampledAt: 1_700_000_000_000 },
      };
    };
    const { server } = buildListServer({ manager, workerMetricsStub: stub });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    try {
      const res = await request(server).get('/list').expect(200);
      assert.strictEqual(res.body.workers.length, 2);
      const w1 = res.body.workers.find((w) => w.name === 'w1');
      const w2 = res.body.workers.find((w) => w.name === 'w2');
      // rssBytes = rssKb * 1024
      assert.strictEqual(w1.rssBytes, 50_000 * 1024);
      assert.strictEqual(w2.rssBytes, 75_000 * 1024);
      assert.strictEqual(w1.cpuPct, 12.5);
      assert.strictEqual(w2.cpuPct, 30);
      // Existing fields still present.
      assert.strictEqual(w1.name, 'w1');
      assert.strictEqual(w1.tier, 'worker');
    } finally {
      server.close();
    }
  });

  it('skips enrichment cleanly when a worker has no pid (returns null fields)', async () => {
    const workers = [
      { name: 'orphan', pid: null, status: 'exited', branch: 'c4/orphan' },
      { name: 'alive', pid: 2002, status: 'idle', branch: 'c4/alive' },
    ];
    const manager = makeStubManager(workers);
    // Use the REAL worker-metrics module so the skip-on-null-pid path is
    // exercised end-to-end (sample() returns null fields for !pid). The
    // alive worker is sampled against the current node process so
    // rssKb/cpuPct land on Linux and stay null on macOS/Windows — the
    // assertion below treats both null and number as valid for the live
    // row, but the orphan row MUST be null on every platform.
    const workerMetrics = require('../src/worker-metrics');
    const stub = (pid, prev) => {
      if (!pid) return workerMetrics.sample(pid, prev);
      return {
        rssKb: 60_000,
        threads: 4,
        cpuPct: 5,
        sample: { utime: 10, stime: 5, sampledAt: Date.now() },
      };
    };
    const { server } = buildListServer({ manager, workerMetricsStub: stub });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    try {
      const res = await request(server).get('/list').expect(200);
      const orphan = res.body.workers.find((w) => w.name === 'orphan');
      const alive = res.body.workers.find((w) => w.name === 'alive');
      // The skip path MUST produce null on both fields — the response
      // shape stays stable for the Web UI.
      assert.strictEqual(orphan.rssBytes, null);
      assert.strictEqual(orphan.cpuPct, null);
      // Alive row gets the stub values regardless of platform.
      assert.strictEqual(alive.rssBytes, 60_000 * 1024);
      assert.strictEqual(alive.cpuPct, 5);
    } finally {
      server.close();
    }
  });

  it('seeds listMetricsPrev on the first call and feeds it back on the second', async () => {
    const manager = makeStubManager([{ name: 'w1', pid: 4040, status: 'idle' }]);
    let callIdx = 0;
    const sampleOne = { utime: 100, stime: 50, sampledAt: 1_700_000_000_000 };
    const sampleTwo = { utime: 130, stime: 60, sampledAt: 1_700_000_001_000 };
    const stub = (pid, prev) => {
      callIdx += 1;
      if (callIdx === 1) {
        assert.strictEqual(prev, null, 'first call sees no prev sample');
        return { rssKb: 10_000, threads: 1, cpuPct: null, sample: sampleOne };
      }
      assert.deepStrictEqual(prev, sampleOne, 'second call sees the first sample as prev');
      return { rssKb: 11_000, threads: 1, cpuPct: 4.2, sample: sampleTwo };
    };
    const { server, sampleCalls, listMetricsPrev } = buildListServer({
      manager,
      workerMetricsStub: stub,
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    try {
      const first = await request(server).get('/list').expect(200);
      assert.strictEqual(first.body.workers[0].rssBytes, 10_000 * 1024);
      assert.strictEqual(first.body.workers[0].cpuPct, null, 'first call has no delta yet');
      assert.deepStrictEqual(listMetricsPrev.get('w1'), sampleOne);

      const second = await request(server).get('/list').expect(200);
      assert.strictEqual(second.body.workers[0].rssBytes, 11_000 * 1024);
      assert.strictEqual(second.body.workers[0].cpuPct, 4.2);
      assert.deepStrictEqual(listMetricsPrev.get('w1'), sampleTwo);
      assert.strictEqual(sampleCalls.length, 2);
    } finally {
      server.close();
    }
  });

  it('returns empty workers array unchanged (no crash, no enrichment loop)', async () => {
    const manager = makeStubManager([]);
    let called = false;
    const stub = () => {
      called = true;
      return { rssKb: 1, threads: 1, cpuPct: 1, sample: null };
    };
    const { server } = buildListServer({ manager, workerMetricsStub: stub });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    try {
      const res = await request(server).get('/list').expect(200);
      assert.deepStrictEqual(res.body.workers, []);
      assert.strictEqual(called, false, 'no workers => sampler never invoked');
    } finally {
      server.close();
    }
  });

  it('preserves tier enrichment alongside the new metrics fields', async () => {
    const workers = [
      { name: 'mgr', pid: 5050, status: 'idle', tier: 'manager' },
      { name: 'w1', pid: 5051, status: 'idle' },
    ];
    const manager = makeStubManager(workers);
    const stub = (pid) => ({
      rssKb: pid === 5050 ? 90_000 : 40_000,
      threads: 4,
      cpuPct: 1,
      sample: { utime: 1, stime: 1, sampledAt: 1 },
    });
    const { server } = buildListServer({ manager, workerMetricsStub: stub });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    try {
      const res = await request(server).get('/list').expect(200);
      const mgr = res.body.workers.find((w) => w.name === 'mgr');
      const w1 = res.body.workers.find((w) => w.name === 'w1');
      assert.strictEqual(mgr.tier, 'manager');
      assert.strictEqual(w1.tier, 'worker');
      assert.strictEqual(mgr.rssBytes, 90_000 * 1024);
      assert.strictEqual(w1.rssBytes, 40_000 * 1024);
    } finally {
      server.close();
    }
  });
});

// ---------------------------------------------------------------------------
// daemon.js source integration
// ---------------------------------------------------------------------------
//
// Grep-style assertions so a future refactor that removes the
// listMetricsPrev Map or the workerMetrics.sample call inside the /list
// handler trips this test rather than silently dropping the fields the
// Web UI now depends on.

describe('(v1.11.131) daemon.js source integration for /list metrics', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'daemon.js'), 'utf8');

  it('requires worker-metrics at the top of the file', () => {
    assert.ok(/require\('\.\/worker-metrics'\)/.test(src),
      'daemon.js must require ./worker-metrics');
  });

  it('declares the module-scope listMetricsPrev Map', () => {
    assert.ok(/listMetricsPrev\s*=\s*new Map\(\)/.test(src),
      'daemon.js must declare listMetricsPrev as a Map');
  });

  it('calls workerMetrics.sample inside the /list handler', () => {
    // Find the /list handler block and look for the sample call inside it.
    const m = src.match(/route === '\/list'[\s\S]*?cacheList\.getOrCompute\([\s\S]*?\}\);/);
    assert.ok(m, '/list handler block not found');
    assert.ok(/workerMetrics\.sample\(/.test(m[0]),
      '/list handler must call workerMetrics.sample');
    assert.ok(/listMetricsPrev\.(get|set)/.test(m[0]),
      '/list handler must read/write listMetricsPrev');
  });

  it('writes rssBytes (rssKb * 1024) and cpuPct onto each worker row', () => {
    const m = src.match(/route === '\/list'[\s\S]*?cacheList\.getOrCompute\([\s\S]*?\}\);/);
    assert.ok(m, '/list handler block not found');
    assert.ok(/rssBytes\s*=/.test(m[0]), '/list handler must assign rssBytes');
    assert.ok(/rssKb\s*\*\s*1024/.test(m[0]),
      'rssBytes must be rssKb * 1024');
    assert.ok(/w\.cpuPct\s*=/.test(m[0]) || /cpuPct\s*=/.test(m[0]),
      '/list handler must assign cpuPct');
  });
});
