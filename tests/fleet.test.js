// 9.6 fleet aggregation tests.
// Spin up two mock peer daemons (just `/health` and `/list`), have a
// PtyManager-like object aggregate them via fleetPeers / fleetList.

'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('assert');
const http = require('http');

const PtyManager = require('../src/pty-manager');

function startMock(name, listResponse) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, workers: (listResponse.workers || []).length, version: '1.6.16' }));
        return;
      }
      if (req.url === '/list') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(listResponse));
        return;
      }
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ name, server, host: '127.0.0.1', port: addr.port });
    });
  });
}

function makeManagerWithPeers(peers) {
  // Bypass the real PtyManager init — only the fleet methods + config are needed.
  const mgr = Object.create(PtyManager.prototype);
  mgr.workers = new Map();
  mgr.config = { fleet: { peers } };
  // list() is consulted by fleetList for the local entry.
  mgr.list = function () {
    return { workers: [{ name: 'localworker', status: 'idle', branch: null, command: 'claude' }], queuedTasks: [], lostWorkers: [] };
  };
  return mgr;
}

describe('PtyManager fleet aggregation (9.6)', () => {
  let peerA;
  let peerB;
  let mgr;

  before(async () => {
    peerA = await startMock('alpha', {
      workers: [{ name: 'a-1', status: 'idle', branch: 'c4/a', command: 'claude' }],
      queuedTasks: [],
      lostWorkers: [],
    });
    peerB = await startMock('beta', {
      workers: [{ name: 'b-1', status: 'busy', branch: 'c4/b', command: 'claude' }],
      queuedTasks: [],
      lostWorkers: [],
    });
    mgr = makeManagerWithPeers({
      alpha: { host: peerA.host, port: peerA.port, label: 'Alpha' },
      beta:  { host: peerB.host, port: peerB.port, label: 'Beta' },
      ghost: { host: '127.0.0.1', port: 1, label: 'Ghost (offline)' },
    });
  });

  after(() => {
    peerA.server.close();
    peerB.server.close();
  });

  it('fleetPeers returns online peers with health + offline peer marked unreachable', async () => {
    const r = await mgr.fleetPeers();
    assert.strictEqual(r.peers.length, 3);
    const byName = Object.fromEntries(r.peers.map((p) => [p.name, p]));
    assert.strictEqual(byName.alpha.status, 'online');
    assert.strictEqual(byName.beta.status, 'online');
    assert.strictEqual(byName.ghost.status, 'unreachable');
    assert.ok(byName.alpha.health.ok);
    assert.ok(typeof byName.alpha.latencyMs === 'number');
  });

  it('fleetList aggregates local + reachable peers and tags workers with peer name', async () => {
    const r = await mgr.fleetList();
    const labels = r.peers.map((p) => p.label);
    assert.ok(labels.includes('local'));
    assert.ok(labels.includes('Alpha'));
    assert.ok(labels.includes('Beta'));

    const alpha = r.peers.find((p) => p.peer === 'alpha');
    assert.strictEqual(alpha.ok, true);
    assert.strictEqual(alpha.workers.length, 1);
    assert.strictEqual(alpha.workers[0].peer, 'alpha');

    const ghost = r.peers.find((p) => p.peer === 'ghost');
    assert.strictEqual(ghost.ok, false);
    assert.ok(ghost.error);
  });

  it('returns local-only when no peers configured', async () => {
    const localMgr = makeManagerWithPeers({});
    const r = await localMgr.fleetList();
    assert.strictEqual(r.peers.length, 1);
    assert.strictEqual(r.peers[0].peer, 'local');
  });

  // ---- write-through (9.6) ----

  it('fleetCreate forwards to peer SDK and returns response', async () => {
    // Replace peerA with a recording mock so we can assert what was sent.
    let captured = null;
    peerA.server.close();
    const replacement = await startMock('alpha', {
      workers: [], queuedTasks: [], lostWorkers: [],
    });
    // Override its handler: capture POST /create body, return ok.
    replacement.server.removeAllListeners('request');
    replacement.server.on('request', (req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        captured = { method: req.method, url: req.url, body: body ? JSON.parse(body) : null };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ name: captured.body && captured.body.name, status: 'running' }));
      });
    });
    peerA = replacement;
    mgr.config.fleet.peers.alpha = { host: peerA.host, port: peerA.port };

    const r = await mgr.fleetCreate('alpha', { name: 'remote-w', target: 'local', cwd: '/tmp/x' });
    assert.strictEqual(captured.method, 'POST');
    assert.strictEqual(captured.url, '/create');
    assert.strictEqual(captured.body.name, 'remote-w');
    assert.strictEqual(captured.body.cwd, '/tmp/x');
    assert.strictEqual(r.status, 'running');
  });

  it('fleetTask forwards task body to peer', async () => {
    let captured = null;
    peerB.server.close();
    const replacement = await startMock('beta', { workers: [] });
    replacement.server.removeAllListeners('request');
    replacement.server.on('request', (req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        captured = { url: req.url, body: body ? JSON.parse(body) : null };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
    });
    peerB = replacement;
    mgr.config.fleet.peers.beta = { host: peerB.host, port: peerB.port };

    await mgr.fleetTask('beta', { name: 'w', task: 'do thing', branch: 'c4/x' });
    assert.strictEqual(captured.url, '/task');
    assert.strictEqual(captured.body.name, 'w');
    assert.strictEqual(captured.body.task, 'do thing');
    assert.strictEqual(captured.body.branch, 'c4/x');
  });

  it('fleetCreate rejects unknown peer', async () => {
    const r = await mgr.fleetCreate('does-not-exist', { name: 'x' });
    assert.ok(r.error && /Unknown peer/.test(r.error));
  });

  it('fleetTask requires name + task', async () => {
    const r1 = await mgr.fleetTask('beta', { task: 'no name' });
    assert.ok(r1.error && /name/.test(r1.error));
    const r2 = await mgr.fleetTask('beta', { name: 'w' });
    assert.ok(r2.error && /task/.test(r2.error));
  });
});
