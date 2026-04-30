// 9.7 dispatcher unit tests.
// Spins up two mock peer daemons (just /list) and verifies dispatch picks
// the right one per strategy. Uses dryRun=true so no actual create/task fires.

'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('assert');
const http = require('http');

const PtyManager = require('../src/pty-manager');

function startPeer(listResponse) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      if (req.url === '/list') {
        res.end(JSON.stringify(listResponse));
      } else if (req.url === '/health') {
        res.end(JSON.stringify({ ok: true, workers: (listResponse.workers || []).length }));
      } else {
        res.end(JSON.stringify({ ok: true }));
      }
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, host: '127.0.0.1', port: addr.port });
    });
  });
}

function makeManager(localList, peers, localCfg = {}) {
  const mgr = Object.create(PtyManager.prototype);
  mgr.workers = new Map();
  mgr.config = { fleet: { peers, local: localCfg }, maxWorkers: 0 };
  mgr.list = () => localList;
  mgr.create = () => ({ name: 'unused' });
  mgr.sendTask = async () => ({ success: true });
  return mgr;
}

describe('dispatcher (9.7)', () => {
  let busyPeer;
  let idlePeer;

  before(async () => {
    busyPeer = await startPeer({
      workers: [
        { name: 'b1', status: 'busy' },
        { name: 'b2', status: 'busy' },
      ],
    });
    idlePeer = await startPeer({ workers: [{ name: 'i1', status: 'idle' }] });
  });

  after(() => {
    busyPeer.server.close();
    idlePeer.server.close();
  });

  it('rejects when no task is provided', async () => {
    const mgr = makeManager({ workers: [] }, {});
    const r = await mgr.dispatch({});
    assert.ok(r.error && /task is required/.test(r.error));
  });

  it('least-load picks the peer with fewest workers', async () => {
    const mgr = makeManager(
      { workers: [{ name: 'L1' }, { name: 'L2' }, { name: 'L3' }] },
      {
        busy: { host: busyPeer.host, port: busyPeer.port, tags: ['gpu'] },
        idle: { host: idlePeer.host, port: idlePeer.port, tags: ['gpu'] },
      },
    );
    const r = await mgr.dispatch({ task: 'do thing', strategy: 'least-load', dryRun: true });
    assert.strictEqual(r.decision.peer, 'idle');
  });

  it('tag-match prefers higher tag overlap and ties break by least-load', async () => {
    const mgr = makeManager(
      { workers: [] },
      {
        cpu: { host: idlePeer.host, port: idlePeer.port, tags: ['cpu'] },
        gpu: { host: busyPeer.host, port: busyPeer.port, tags: ['gpu', 'cuda'] },
      },
    );
    const r = await mgr.dispatch({ task: 'train', strategy: 'tag-match', tags: ['gpu'], dryRun: true });
    assert.strictEqual(r.decision.peer, 'gpu');
  });

  it('respects maxWorkers cap (peer over its cap is filtered out)', async () => {
    // Local has 5 workers, busy peer is at its cap of 2 → only `idle` is eligible.
    const mgr = makeManager(
      { workers: [{}, {}, {}, {}, {}] },
      {
        busy: { host: busyPeer.host, port: busyPeer.port, maxWorkers: 2 },
        idle: { host: idlePeer.host, port: idlePeer.port, maxWorkers: 5 },
      },
      { maxWorkers: 5 }, // local also at cap
    );
    const r = await mgr.dispatch({ task: 'x', dryRun: true });
    assert.strictEqual(r.decision.peer, 'idle');
  });

  it('returns error when no peer matches required tag', async () => {
    const mgr = makeManager(
      { workers: [] },
      { idle: { host: idlePeer.host, port: idlePeer.port, tags: ['cpu'] } },
    );
    const r = await mgr.dispatch({ task: 'x', tags: ['gpu'], dryRun: true });
    assert.ok(r.error && /No eligible peer/.test(r.error));
  });

  it('round-robin advances cursor across calls', async () => {
    const mgr = makeManager(
      { workers: [] },
      {
        a: { host: idlePeer.host, port: idlePeer.port },
        b: { host: busyPeer.host, port: busyPeer.port },
      },
    );
    const seen = new Set();
    for (let i = 0; i < 4; i++) {
      const r = await mgr.dispatch({ task: 'x', strategy: 'round-robin', dryRun: true });
      seen.add(r.decision.peer);
    }
    assert.ok(seen.size >= 2, 'round-robin should hit multiple peers across iterations');
  });
});
