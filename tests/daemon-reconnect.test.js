'use strict';

// (11.74) Tests for the daemon-side reconcile / reconnect flow.
//
// Covers:
//   * daemon-checkpoint.reconcileOrphans() — the pure planner that
//     pairs worktree entries with checkpoint files and classifies
//     each as ADOPT vs LOST.
//   * daemon-checkpoint.planReconnect() — single-name reconcile used
//     by the daemon HTTP endpoint.
//   * PtyManager.reconcileOrphans() / .reconnectWorker() — the
//     manager-side wrapper that applies the planner output to the
//     live workers / lostWorkers maps.
//   * list() output surfaces recovered workers and LOST entries the
//     way the CLI expects ('(recovered)' suffix, reason field).
//
// Style mirrors tests/daemon-checkpoint.test.js: node:test + assert,
// fake fs / kill probe / clock, no real PIDs touched.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ckpt = require('../src/daemon-checkpoint');

// --- helpers -------------------------------------------------------

function makeFakeFs(files = {}) {
  return {
    _files: files,
    readFileSync(p) {
      if (Object.prototype.hasOwnProperty.call(this._files, p)) {
        return this._files[p];
      }
      const err = new Error(`ENOENT: no such file or directory, open '${p}'`);
      err.code = 'ENOENT';
      throw err;
    },
  };
}

function ckptFile(projectRoot, name) {
  return path.join(projectRoot, '.c4', 'checkpoints', `${name}.json`);
}

function fakePidAlive(alive) {
  return (pid) => alive.has(pid);
}

// --- daemonCheckpoint.reconcileOrphans (pure planner) --------------

describe('daemonCheckpoint.reconcileOrphans()', () => {
  it('adopts worktrees whose checkpoint pid is alive', () => {
    const projectRoot = '/proj';
    const fs = makeFakeFs({
      [ckptFile(projectRoot, 'auto-w1')]: JSON.stringify({
        name: 'auto-w1', pid: 11111, branch: 'c4/auto-w1',
        worktree: '/root/c4-worktree-auto-w1', target: 'local', tier: 'worker',
      }),
    });
    const plans = ckpt.reconcileOrphans({
      worktrees: [{ worktree: '/root/c4-worktree-auto-w1', branch: 'c4/auto-w1' }],
      projectRoot,
      isPidAlive: fakePidAlive(new Set([11111])),
      fs,
    });
    assert.equal(plans.length, 1);
    assert.equal(plans[0].action, 'adopt');
    assert.equal(plans[0].name, 'auto-w1');
    assert.equal(plans[0].pid, 11111);
    assert.equal(plans[0].branch, 'c4/auto-w1');
    assert.equal(plans[0].worktree, '/root/c4-worktree-auto-w1');
  });

  it('marks workers LOST when the checkpoint pid is dead (ESRCH)', () => {
    const projectRoot = '/proj';
    const fs = makeFakeFs({
      [ckptFile(projectRoot, 'auto-w2')]: JSON.stringify({
        name: 'auto-w2', pid: 22222, branch: 'c4/auto-w2',
        worktree: '/root/c4-worktree-auto-w2',
      }),
    });
    const plans = ckpt.reconcileOrphans({
      worktrees: [{ worktree: '/root/c4-worktree-auto-w2', branch: 'c4/auto-w2' }],
      projectRoot,
      isPidAlive: fakePidAlive(new Set()), // nobody alive
      fs,
    });
    assert.equal(plans.length, 1);
    assert.equal(plans[0].action, 'lost');
    assert.equal(plans[0].reason, 'pid-dead');
    assert.equal(plans[0].pid, 22222);
  });

  it('marks worktrees LOST when no checkpoint file exists', () => {
    const projectRoot = '/proj';
    const fs = makeFakeFs({});
    const plans = ckpt.reconcileOrphans({
      worktrees: [{ worktree: '/root/c4-worktree-auto-w3', branch: 'c4/auto-w3' }],
      projectRoot,
      isPidAlive: () => true,
      fs,
    });
    assert.equal(plans.length, 1);
    assert.equal(plans[0].action, 'lost');
    assert.equal(plans[0].reason, 'no-checkpoint');
  });

  it('does not crash on malformed checkpoint JSON; reports reason', () => {
    const projectRoot = '/proj';
    const fs = makeFakeFs({
      [ckptFile(projectRoot, 'auto-w4')]: '{not json,',
    });
    const plans = ckpt.reconcileOrphans({
      worktrees: [{ worktree: '/root/c4-worktree-auto-w4', branch: null }],
      projectRoot,
      isPidAlive: () => true,
      fs,
    });
    assert.equal(plans.length, 1);
    assert.equal(plans[0].action, 'lost');
    assert.equal(plans[0].reason, 'malformed-checkpoint');
  });

  it('skips worktrees missing the c4-worktree- prefix', () => {
    const plans = ckpt.reconcileOrphans({
      worktrees: [
        { worktree: '/root/some-other-worktree', branch: 'main' },
        { worktree: '/root/c4', branch: 'main' },
      ],
      projectRoot: '/proj',
      isPidAlive: () => true,
      fs: makeFakeFs({}),
    });
    assert.equal(plans.length, 0);
  });

  it('honours skipNames to avoid clobbering an active worker', () => {
    const projectRoot = '/proj';
    const fs = makeFakeFs({
      [ckptFile(projectRoot, 'auto-w5')]: JSON.stringify({ pid: 55555 }),
    });
    const plans = ckpt.reconcileOrphans({
      worktrees: [{ worktree: '/root/c4-worktree-auto-w5', branch: 'c4/auto-w5' }],
      projectRoot,
      skipNames: ['auto-w5'],
      isPidAlive: fakePidAlive(new Set([55555])),
      fs,
    });
    assert.equal(plans.length, 0);
  });

  it('marks LOST when checkpoint lacks a pid field', () => {
    const projectRoot = '/proj';
    const fs = makeFakeFs({
      [ckptFile(projectRoot, 'auto-w6')]: JSON.stringify({ name: 'auto-w6' }),
    });
    const plans = ckpt.reconcileOrphans({
      worktrees: [{ worktree: '/root/c4-worktree-auto-w6', branch: null }],
      projectRoot,
      isPidAlive: () => true,
      fs,
    });
    assert.equal(plans[0].action, 'lost');
    assert.equal(plans[0].reason, 'no-pid');
  });

  it('emits an adoption log line on every adopt', () => {
    const projectRoot = '/proj';
    const fs = makeFakeFs({
      [ckptFile(projectRoot, 'auto-w7')]: JSON.stringify({ pid: 77777, branch: 'c4/auto-w7' }),
    });
    const lines = [];
    ckpt.reconcileOrphans({
      worktrees: [{ worktree: '/root/c4-worktree-auto-w7', branch: 'c4/auto-w7' }],
      projectRoot,
      isPidAlive: fakePidAlive(new Set([77777])),
      fs,
      log: (m) => lines.push(m),
    });
    assert.ok(lines.some((l) => /auto-adopted auto-w7/.test(l)),
      `expected adoption log, got: ${JSON.stringify(lines)}`);
  });

  it('emits a LOST log line with the reason on each lost worker', () => {
    const projectRoot = '/proj';
    const fs = makeFakeFs({});
    const lines = [];
    ckpt.reconcileOrphans({
      worktrees: [{ worktree: '/root/c4-worktree-auto-w8', branch: null }],
      projectRoot,
      isPidAlive: () => true,
      fs,
      log: (m) => lines.push(m),
    });
    assert.ok(lines.some((l) => /worker auto-w8 marked LOST .*no-checkpoint/.test(l)),
      `expected LOST log, got: ${JSON.stringify(lines)}`);
  });
});

// --- daemonCheckpoint.planReconnect (single-name) ------------------

describe('daemonCheckpoint.planReconnect()', () => {
  it('returns adopt when pid is alive', () => {
    const projectRoot = '/proj';
    const fs = makeFakeFs({
      [ckptFile(projectRoot, 'w')]: JSON.stringify({ pid: 123, branch: 'c4/w', worktree: '/wt' }),
    });
    const plan = ckpt.planReconnect('w', { projectRoot, isPidAlive: () => true, fs });
    assert.equal(plan.action, 'adopt');
    assert.equal(plan.pid, 123);
  });

  it('returns lost/no-checkpoint when file is missing', () => {
    const plan = ckpt.planReconnect('w', {
      projectRoot: '/proj',
      isPidAlive: () => true,
      fs: makeFakeFs({}),
    });
    assert.equal(plan.action, 'lost');
    assert.equal(plan.reason, 'no-checkpoint');
  });

  it('returns lost/pid-dead when checkpoint pid is dead', () => {
    const projectRoot = '/proj';
    const fs = makeFakeFs({
      [ckptFile(projectRoot, 'w')]: JSON.stringify({ pid: 999 }),
    });
    const plan = ckpt.planReconnect('w', { projectRoot, isPidAlive: () => false, fs });
    assert.equal(plan.action, 'lost');
    assert.equal(plan.reason, 'pid-dead');
    assert.equal(plan.pid, 999);
  });
});

// --- manager-side wrapper (daemon-reconnect.js) -------------------

// daemon-reconnect.js takes a `manager` object that exposes only
// workers / lostWorkers / config / _detectRepoRoot / _listC4Worktrees.
// We construct a stand-in here so the tests don't have to load
// PtyManager (which pulls in node-pty native bindings).
function makeManagerStub() {
  return {
    workers: new Map(),
    lostWorkers: [],
    config: {},
    _detectRepoRoot: () => '/proj',
    _listC4Worktrees: () => [],
  };
}

const reconnect = require('../src/daemon-reconnect');

describe('daemonReconnect.reconcileOrphans()', () => {
  it('adds ATTACHED entries to the worker map for live adopt plans', () => {
    const projectRoot = '/proj';
    const fs = makeFakeFs({
      [ckptFile(projectRoot, 'auto-w1')]: JSON.stringify({
        pid: 11111, branch: 'c4/auto-w1', worktree: '/root/c4-worktree-auto-w1',
      }),
    });
    const m = makeManagerStub();
    const r = reconnect.reconcileOrphans(m, {
      worktrees: [{ worktree: '/root/c4-worktree-auto-w1', branch: 'c4/auto-w1' }],
      projectRoot,
      isPidAlive: fakePidAlive(new Set([11111])),
      fs,
      log: () => {},
    });
    assert.equal(r.adopted, 1);
    assert.equal(r.lost, 0);
    const w = m.workers.get('auto-w1');
    assert.ok(w, 'worker should be registered');
    assert.equal(w.state, 'ATTACHED');
    assert.equal(w._recovered, true);
    assert.equal(w._recoveryShown, false);
    assert.equal(w.branch, 'c4/auto-w1');
    assert.equal(w.proc.pid, 11111);
  });

  it('adds LOST entries to lostWorkers with a reason field', () => {
    const projectRoot = '/proj';
    const fs = makeFakeFs({});
    const m = makeManagerStub();
    const r = reconnect.reconcileOrphans(m, {
      worktrees: [{ worktree: '/root/c4-worktree-auto-w2', branch: null }],
      projectRoot,
      isPidAlive: () => true,
      fs,
      log: () => {},
    });
    assert.equal(r.lost, 1);
    assert.equal(m.lostWorkers.length, 1);
    assert.equal(m.lostWorkers[0].name, 'auto-w2');
    assert.equal(m.lostWorkers[0].reason, 'no-checkpoint');
    assert.equal(m.lostWorkers[0].state, 'LOST');
  });

  it('skips a worktree whose name is already registered', () => {
    const projectRoot = '/proj';
    const fs = makeFakeFs({
      [ckptFile(projectRoot, 'live')]: JSON.stringify({ pid: 1 }),
    });
    const m = makeManagerStub();
    m.workers.set('live', { name: 'live', alive: true, proc: { pid: 1 } });
    reconnect.reconcileOrphans(m, {
      worktrees: [{ worktree: '/root/c4-worktree-live', branch: 'c4/live' }],
      projectRoot,
      isPidAlive: () => true,
      fs,
      log: () => {},
    });
    // Existing worker untouched, no new lost entry
    assert.equal(m.workers.size, 1);
    assert.equal(m.lostWorkers.length, 0);
  });
});

describe('daemonReconnect.reconnectWorker()', () => {
  it('returns {error: not-found} when no checkpoint exists', () => {
    const m = makeManagerStub();
    const r = reconnect.reconnectWorker(m, 'ghost', { projectRoot: '/proj', fs: makeFakeFs({}) });
    assert.equal(r.error, 'not-found');
  });

  it('returns {error: pid-dead, pid} when the checkpoint pid is dead', () => {
    const projectRoot = '/proj';
    const fs = makeFakeFs({
      [ckptFile(projectRoot, 'dead')]: JSON.stringify({ pid: 99999 }),
    });
    const m = makeManagerStub();
    const r = reconnect.reconnectWorker(m, 'dead', {
      projectRoot,
      isPidAlive: () => false,
      fs,
    });
    assert.equal(r.error, 'pid-dead');
    assert.equal(r.pid, 99999);
    // pid-dead should also surface in lostWorkers so c4 list shows it
    assert.equal(m.lostWorkers.length, 1);
    assert.equal(m.lostWorkers[0].reason, 'pid-dead');
  });

  it('returns {ok, worker} on successful re-adopt', () => {
    const projectRoot = '/proj';
    const fs = makeFakeFs({
      [ckptFile(projectRoot, 'live')]: JSON.stringify({
        pid: 4242, branch: 'c4/live', worktree: '/root/c4-worktree-live',
      }),
    });
    const m = makeManagerStub();
    const r = reconnect.reconnectWorker(m, 'live', {
      projectRoot,
      isPidAlive: fakePidAlive(new Set([4242])),
      fs,
    });
    assert.equal(r.ok, true);
    assert.equal(r.worker.name, 'live');
    assert.equal(r.worker.pid, 4242);
    assert.equal(r.worker.recovered, true);
    assert.equal(r.worker.state, 'ATTACHED');
    assert.ok(m.workers.has('live'));
  });

  it('is idempotent when the worker is already registered (already=true)', () => {
    const m = makeManagerStub();
    m.workers.set('here', { name: 'here', alive: true, proc: { pid: 100 }, _recovered: true });
    const r = reconnect.reconnectWorker(m, 'here', { projectRoot: '/proj', fs: makeFakeFs({}) });
    assert.equal(r.ok, true);
    assert.equal(r.already, true);
    assert.equal(r.worker.pid, 100);
  });
});

// --- list() surface: recovered suffix ------------------------------

// We assert the recovered breadcrumb directly without spinning up
// PtyManager. The list() method in pty-manager.js flips
// _recoveryShown to true on the first listing; here we verify the
// daemon-reconnect helper sets _recoveryShown=false on first adopt.
describe('Recovered worker breadcrumb (list() suffix)', () => {
  it('builds a recovered worker with _recoveryShown=false (first list will flip it)', () => {
    const plan = {
      name: 'auto-w1',
      action: 'adopt',
      pid: 12345,
      branch: 'c4/auto-w1',
      worktree: '/root/c4-worktree-auto-w1',
      checkpoint: { pid: 12345, branch: 'c4/auto-w1' },
    };
    const w = reconnect.buildRecoveredWorker('auto-w1', plan);
    assert.equal(w.state, 'ATTACHED');
    assert.equal(w._recovered, true);
    assert.equal(w._recoveryShown, false);
    assert.equal(w.kind, 'recovered');
    assert.equal(w.alive, true);
    assert.equal(w.proc.pid, 12345);
  });

  it('preserves lastTask metadata from the checkpoint payload', () => {
    const plan = {
      name: 'auto-w2',
      action: 'adopt',
      pid: 22222,
      checkpoint: {
        pid: 22222,
        lastTask: {
          summary: 'fix the failing test in src/foo.test.js',
          timestamp: '2026-05-13T10:00:00.000Z',
        },
      },
    };
    const w = reconnect.buildRecoveredWorker('auto-w2', plan);
    assert.equal(w._taskText, 'fix the failing test in src/foo.test.js');
    assert.equal(w._taskStartedAt, '2026-05-13T10:00:00.000Z');
  });
});

// --- daemon HTTP endpoint contract ---------------------------------

// The /api/workers/:name/reconnect handler boils down to manager
// .reconnectWorker(name) -> map result to status code. We assert
// that contract directly with the manager stub so the test stays
// hermetic (no real http.Server).
describe('POST /api/workers/:name/reconnect contract', () => {
  function dispatch(m, name) {
    const r = m.reconnectWorker
      ? m.reconnectWorker(name)
      : reconnect.reconnectWorker(m, name);
    if (r && r.error === 'not-found') return { status: 404, body: r };
    if (r && r.error === 'pid-dead') return { status: 409, body: r };
    if (r && r.error) return { status: 400, body: r };
    return { status: 200, body: r };
  }

  it('returns 200 + worker payload when reconnect succeeds', () => {
    const projectRoot = '/proj';
    const fs = makeFakeFs({
      [ckptFile(projectRoot, 'live')]: JSON.stringify({
        pid: 1234, branch: 'c4/live', worktree: '/root/c4-worktree-live',
      }),
    });
    const m = makeManagerStub();
    const out = dispatch({
      reconnectWorker: (name) => reconnect.reconnectWorker(m, name, {
        projectRoot, isPidAlive: () => true, fs,
      }),
    }, 'live');
    assert.equal(out.status, 200);
    assert.equal(out.body.ok, true);
    assert.equal(out.body.worker.name, 'live');
    assert.equal(out.body.worker.recovered, true);
  });

  it('returns 404 when there is no checkpoint for the name', () => {
    const m = makeManagerStub();
    const out = dispatch({
      reconnectWorker: (name) => reconnect.reconnectWorker(m, name, {
        projectRoot: '/proj', fs: makeFakeFs({}),
      }),
    }, 'ghost');
    assert.equal(out.status, 404);
    assert.equal(out.body.error, 'not-found');
  });

  it('returns 409 when the checkpoint pid is no longer alive', () => {
    const projectRoot = '/proj';
    const fs = makeFakeFs({
      [ckptFile(projectRoot, 'dead')]: JSON.stringify({ pid: 99999 }),
    });
    const m = makeManagerStub();
    const out = dispatch({
      reconnectWorker: (name) => reconnect.reconnectWorker(m, name, {
        projectRoot, isPidAlive: () => false, fs,
      }),
    }, 'dead');
    assert.equal(out.status, 409);
    assert.equal(out.body.error, 'pid-dead');
    assert.equal(out.body.pid, 99999);
  });
});
