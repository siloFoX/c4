// 7.25 / TODO 7.22: pendingTask Enter verify-and-retry tests
// Validates _isTaskTextInInput screen-tail matching and the retry loop
// in _verifyEnterCommitted.

'use strict';

const { describe, it } = require('node:test');
const assert = require('assert');

// Reuse the production helpers via a thin harness — we import PtyManager
// purely for the helper functions, which are pure and don't need a daemon.
const PtyManager = require('../src/pty-manager');

function makeManager() {
  // Construct without invoking init paths that touch state.json — we only
  // need _isTaskTextInInput / _verifyEnterCommitted, which don't touch
  // managed state.
  const mgr = Object.create(PtyManager.prototype);
  mgr.config = {};
  mgr.workers = new Map();
  return mgr;
}

function makeWorkerWithScreen(text) {
  const screenObj = {
    getScreen: () => text,
  };
  const writes = [];
  return {
    alive: true,
    screen: screenObj,
    proc: { write: (data) => { writes.push(data); return true; } },
    snapshots: [],
    _writes: writes,
    _setScreen: (newText) => { screenObj.getScreen = () => newText; },
  };
}

describe('_isTaskTextInInput', () => {
  const mgr = makeManager();

  it('matches when ❯ <task> sits in the bottom rows', () => {
    const screen = [
      '✻ Working...',
      '',
      '────',
      '❯ cd /home/foo/work and run tests',
      '  ?  for shortcuts'
    ].join('\n');
    assert.strictEqual(mgr._isTaskTextInInput(screen, 'cd /home/foo/work and run tests please'), true);
  });

  it('does not match when text only appears in chat history (mid-screen)', () => {
    // Simulate a screen where the task was already submitted: the task line
    // appears mid-history but the bottom is the empty input prompt.
    const lines = [];
    lines.push('❯ cd /home/foo/work and run tests');
    lines.push('  Done.');
    for (let i = 0; i < 30; i++) lines.push('');
    lines.push('❯  ▔▔▔▔▔');
    lines.push('  ?  for shortcuts');
    const screen = lines.join('\n');
    assert.strictEqual(mgr._isTaskTextInInput(screen, 'cd /home/foo/work and run tests'), false);
  });

  it('returns false for tiny fingerprints', () => {
    assert.strictEqual(mgr._isTaskTextInInput('❯ hi', 'hi'), false);
  });

  it('returns false for empty inputs', () => {
    assert.strictEqual(mgr._isTaskTextInInput('', 'task'), false);
    assert.strictEqual(mgr._isTaskTextInInput('❯ task', ''), false);
  });

  it('escapes regex metacharacters in task fingerprint', () => {
    const screen = '❯ run script (foo+bar) baseline\n  ?  for shortcuts';
    assert.strictEqual(mgr._isTaskTextInInput(screen, 'run script (foo+bar) baseline test'), true);
  });
});

describe('_verifyEnterCommitted', () => {
  it('returns true immediately when input is empty after Enter', async () => {
    const mgr = makeManager();
    const worker = makeWorkerWithScreen('❯  ▔▔▔\n  ?  for shortcuts');
    const ok = await mgr._verifyEnterCommitted(worker, 'this task ran already');
    assert.strictEqual(ok, true);
    assert.strictEqual(worker._writes.length, 0); // no retry
  });

  it('retries Enter when task text persists in input prompt', async () => {
    const mgr = makeManager();
    const worker = makeWorkerWithScreen('❯ this task is still in the input box');
    let writeCount = 0;
    worker.proc.write = (data) => {
      writeCount++;
      // After the second retry, simulate Claude finally committing the input.
      if (writeCount >= 2) worker._setScreen('❯  ▔▔▔');
      worker._writes.push(data);
      return true;
    };
    const ok = await mgr._verifyEnterCommitted(worker, 'this task is still in the input box');
    assert.strictEqual(ok, true);
    assert.ok(writeCount >= 1, 'should have retried at least once');
    assert.strictEqual(worker._writes.every(d => d === '\r'), true);
    assert.ok(worker.snapshots.some(s => s.screen.includes('Enter retry')), 'should log retry snapshot');
  });

  it('gives up after max retries and returns false', async () => {
    const mgr = makeManager();
    const worker = makeWorkerWithScreen('❯ never commits because TUI is stuck');
    const ok = await mgr._verifyEnterCommitted(worker, 'never commits because TUI is stuck');
    assert.strictEqual(ok, false);
    assert.strictEqual(worker._writes.length, 3); // delays.length === 3
  });

  it('exits early when worker dies mid-retry', async () => {
    const mgr = makeManager();
    const worker = makeWorkerWithScreen('❯ pending task that will be aborted');
    worker.proc.write = () => { worker.alive = false; return true; };
    const ok = await mgr._verifyEnterCommitted(worker, 'pending task that will be aborted');
    assert.strictEqual(ok, false);
  });
});
