// 7.5 / 7.7: c4 approve N keystroke generation tests.
// `approve(name, N)` must send (N-1) Down arrows + Enter so the TUI
// cursor lands on option N before submission. The test exercises the
// approve method in isolation against a mock proc.

'use strict';

const { describe, it } = require('node:test');
const assert = require('assert');

const PtyManager = require('../src/pty-manager');

function makeManagerWithCriticalWorker() {
  const mgr = Object.create(PtyManager.prototype);
  const writes = [];
  const worker = {
    alive: true,
    proc: { write: (data) => { writes.push(data); return true; } },
    _interventionState: 'critical_deny',
    _criticalCommand: 'rm -rf /',
  };
  mgr.workers = new Map([['w1', worker]]);
  return { mgr, worker, writes };
}

describe('approve(name, optionNumber) keystroke generation', () => {
  it('option 1 sends Enter only (no down arrow)', () => {
    const { mgr, writes } = makeManagerWithCriticalWorker();
    const result = mgr.approve('w1', 1);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.option, 1);
    assert.deepStrictEqual(writes, ['\r']);
  });

  it('option 2 sends one Down + Enter', () => {
    const { mgr, writes } = makeManagerWithCriticalWorker();
    mgr.approve('w1', 2);
    assert.deepStrictEqual(writes, ['\x1b[B\r']);
  });

  it('option 3 sends two Downs + Enter', () => {
    const { mgr, writes } = makeManagerWithCriticalWorker();
    mgr.approve('w1', 3);
    assert.deepStrictEqual(writes, ['\x1b[B\x1b[B\r']);
  });

  it('no optionNumber falls back to y + Enter', () => {
    const { mgr, writes } = makeManagerWithCriticalWorker();
    mgr.approve('w1');
    assert.deepStrictEqual(writes, ['y\r']);
  });

  it('clears _interventionState after approve', () => {
    const { mgr, worker } = makeManagerWithCriticalWorker();
    mgr.approve('w1', 1);
    assert.strictEqual(worker._interventionState, null);
  });

  it('rejects approve when worker is not in critical_deny state', () => {
    const { mgr, worker, writes } = makeManagerWithCriticalWorker();
    worker._interventionState = null;
    const result = mgr.approve('w1', 1);
    assert.ok(result.error);
    assert.ok(result.error.includes('not awaiting'));
    assert.strictEqual(writes.length, 0);
  });

  it('rejects approve for unknown worker', () => {
    const mgr = Object.create(PtyManager.prototype);
    mgr.workers = new Map();
    const result = mgr.approve('missing', 1);
    assert.ok(result.error);
    assert.ok(result.error.includes('not found'));
  });
});
