// 8.8: suspend / resume tests for PtyManager.
// We bypass PTY entirely — the methods only need w.proc.pid and process.kill,
// so a mock proc with a numeric pid is enough.

'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('assert');

const PtyManager = require('../src/pty-manager');

const ORIGINAL_KILL = process.kill;

function makeManagerWithWorker({ alive = true } = {}) {
  const mgr = Object.create(PtyManager.prototype);
  mgr.config = {};
  const worker = {
    alive,
    proc: { pid: 99999 }, // bogus pid; we override process.kill anyway
    snapshots: [],
  };
  mgr.workers = new Map([['w1', worker]]);
  return { mgr, worker };
}

describe('suspend / resumeWorker', () => {
  let calls = [];

  before(() => {
    process.kill = (pid, sig) => {
      calls.push({ pid, sig });
      // do not actually signal anything
    };
  });

  after(() => {
    process.kill = ORIGINAL_KILL;
  });

  it('suspend sends SIGSTOP and marks worker suspended', () => {
    if (process.platform === 'win32') {
      // not supported on Windows
      return;
    }
    calls = [];
    const { mgr, worker } = makeManagerWithWorker();
    const r = mgr.suspend('w1');
    assert.strictEqual(r.success, true);
    assert.strictEqual(worker._suspended, true);
    assert.deepStrictEqual(calls, [{ pid: 99999, sig: 'SIGSTOP' }]);
    assert.ok(worker.snapshots.some(s => s.screen.includes('suspended')));
  });

  it('suspend is no-op if already suspended', () => {
    if (process.platform === 'win32') return;
    calls = [];
    const { mgr, worker } = makeManagerWithWorker();
    worker._suspended = true;
    const r = mgr.suspend('w1');
    assert.strictEqual(r.success, true);
    assert.strictEqual(r.alreadySuspended, true);
    assert.strictEqual(calls.length, 0);
  });

  it('resumeWorker sends SIGCONT and clears suspended flag', () => {
    if (process.platform === 'win32') return;
    calls = [];
    const { mgr, worker } = makeManagerWithWorker();
    worker._suspended = true;
    const r = mgr.resumeWorker('w1');
    assert.strictEqual(r.success, true);
    assert.strictEqual(worker._suspended, false);
    assert.deepStrictEqual(calls, [{ pid: 99999, sig: 'SIGCONT' }]);
  });

  it('resumeWorker is no-op if not suspended', () => {
    if (process.platform === 'win32') return;
    calls = [];
    const { mgr } = makeManagerWithWorker();
    const r = mgr.resumeWorker('w1');
    assert.strictEqual(r.success, true);
    assert.strictEqual(r.alreadyRunning, true);
    assert.strictEqual(calls.length, 0);
  });

  it('suspend rejects unknown worker', () => {
    const mgr = Object.create(PtyManager.prototype);
    mgr.workers = new Map();
    mgr.config = {};
    const r = mgr.suspend('missing');
    assert.ok(r.error);
    assert.ok(r.error.includes('not found'));
  });

  it('suspend rejects exited worker', () => {
    const { mgr } = makeManagerWithWorker({ alive: false });
    const r = mgr.suspend('w1');
    assert.ok(r.error);
    assert.ok(r.error.includes('exited'));
  });

  it('suspend surfaces underlying signal errors', () => {
    if (process.platform === 'win32') return;
    process.kill = () => { throw new Error('EPERM'); };
    const { mgr } = makeManagerWithWorker();
    const r = mgr.suspend('w1');
    assert.ok(r.error);
    assert.ok(r.error.includes('EPERM'));
  });
});
