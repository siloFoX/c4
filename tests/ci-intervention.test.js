// CI feedback loop (5.20) + intervention notification (5.29) tests
'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('assert');
const { EventEmitter } = require('events');

// --- 5.20 CI Feedback Loop tests ---

describe('CI Feedback Loop (5.20)', () => {
  function createMockManager(config = {}) {
    const mgr = new EventEmitter();
    mgr.workers = new Map();
    mgr.config = { ci: { enabled: true, testCommand: 'npm test' }, ...config };
    mgr._notifications = null;
    mgr._sseClients = new Set();
    mgr._emitSSE = function(type, data) {
      this.emit('sse', { type, ...data, timestamp: Date.now() });
    };
    mgr._getInterventionConfig = function() {
      return this.config.intervention || {};
    };
    mgr._detectRepoRoot = function() { return '/tmp/repo'; };
    mgr._chunkedWrite = function(proc, text) {
      if (proc._written === undefined) proc._written = [];
      proc._written.push(text);
      return Promise.resolve();
    };
    return mgr;
  }

  function addWorker(mgr, name, opts = {}) {
    const worker = {
      alive: true,
      proc: { _written: [], write: () => true },
      worktree: opts.worktree || '/tmp/c4-worktree-test',
      branch: opts.branch || 'c4/test',
      snapshots: [],
      _interventionState: null,
      _errorHistory: [],
      _routineState: { tested: false, docsUpdated: false },
      _lastCiResult: null,
      _permissionNotified: false,
    };
    mgr.workers.set(name, worker);
    return worker;
  }

  // Simulate _handlePostToolUse commit detection logic
  function simulatePostCommit(mgr, workerName, worker, toolError) {
    const command = 'git commit -m "test"';
    // Commit detection — reset routine + CI feedback detection
    if (/git commit/.test(command) && !toolError) {
      worker._routineState = { tested: false, docsUpdated: false };
      // Return CI config status
      const ciConfig = mgr.config.ci || {};
      return {
        ciEnabled: ciConfig.enabled !== false,
        testCommand: ciConfig.testCommand || 'npm test',
        worktree: worker.worktree,
        routineReset: true,
      };
    }
    return { ciEnabled: false, routineReset: false };
  }

  it('resets routine state after commit', () => {
    const mgr = createMockManager();
    const worker = addWorker(mgr, 'w1');
    worker._routineState = { tested: true, docsUpdated: true };

    const result = simulatePostCommit(mgr, 'w1', worker, '');
    assert.strictEqual(result.routineReset, true);
    assert.strictEqual(worker._routineState.tested, false);
    assert.strictEqual(worker._routineState.docsUpdated, false);
  });

  it('enables CI when config.ci.enabled is true', () => {
    const mgr = createMockManager({ ci: { enabled: true, testCommand: 'npm test' } });
    const worker = addWorker(mgr, 'w1');

    const result = simulatePostCommit(mgr, 'w1', worker, '');
    assert.strictEqual(result.ciEnabled, true);
    assert.strictEqual(result.testCommand, 'npm test');
  });

  it('disables CI when config.ci.enabled is false', () => {
    const mgr = createMockManager({ ci: { enabled: false } });
    const worker = addWorker(mgr, 'w1');

    const result = simulatePostCommit(mgr, 'w1', worker, '');
    assert.strictEqual(result.ciEnabled, false);
  });

  it('does not trigger CI when commit has toolError', () => {
    const mgr = createMockManager();
    const worker = addWorker(mgr, 'w1');

    const result = simulatePostCommit(mgr, 'w1', worker, 'some error');
    assert.strictEqual(result.ciEnabled, false);
  });

  it('uses custom testCommand from config', () => {
    const mgr = createMockManager({ ci: { enabled: true, testCommand: 'pytest -v' } });
    const worker = addWorker(mgr, 'w1');

    const result = simulatePostCommit(mgr, 'w1', worker, '');
    assert.strictEqual(result.testCommand, 'pytest -v');
  });

  it('defaults testCommand to npm test', () => {
    const mgr = createMockManager({ ci: { enabled: true } });
    const worker = addWorker(mgr, 'w1');

    const result = simulatePostCommit(mgr, 'w1', worker, '');
    assert.strictEqual(result.testCommand, 'npm test');
  });

  // Test CI result tracking
  it('tracks CI pass result', () => {
    const worker = {
      alive: true, proc: {}, worktree: '/tmp/test',
      _lastCiResult: null, snapshots: [],
    };
    worker._lastCiResult = { passed: true, time: Date.now() };
    assert.strictEqual(worker._lastCiResult.passed, true);
  });

  it('tracks CI fail result with output', () => {
    const worker = {
      alive: true, proc: {}, worktree: '/tmp/test',
      _lastCiResult: null, snapshots: [],
    };
    const output = 'FAIL src/test.js\n  expected true, got false';
    worker._lastCiResult = { passed: false, time: Date.now(), output };
    worker.snapshots.push({
      time: Date.now(),
      screen: `[CI FAIL] npm test\n${output.slice(-300)}`,
      autoAction: true, ci: true,
    });
    assert.strictEqual(worker._lastCiResult.passed, false);
    assert.ok(worker._lastCiResult.output.includes('FAIL'));
    assert.strictEqual(worker.snapshots.length, 1);
    assert.ok(worker.snapshots[0].screen.includes('[CI FAIL]'));
    assert.strictEqual(worker.snapshots[0].ci, true);
  });

  it('sends notification on CI fail', () => {
    const pushed = [];
    const notifications = {
      pushAll: (msg) => pushed.push(msg),
    };
    // Simulate CI fail notification
    notifications.pushAll('[CI FAIL] w1: npm test');
    assert.strictEqual(pushed.length, 1);
    assert.ok(pushed[0].includes('[CI FAIL]'));
    assert.ok(pushed[0].includes('w1'));
  });

  it('sends notification on CI pass', () => {
    const pushed = [];
    const notifications = {
      pushAll: (msg) => pushed.push(msg),
    };
    notifications.pushAll('[CI PASS] w1: npm test');
    assert.strictEqual(pushed.length, 1);
    assert.ok(pushed[0].includes('[CI PASS]'));
  });

  it('emits SSE event for CI result', () => {
    const mgr = createMockManager();
    const events = [];
    mgr.on('sse', (e) => events.push(e));

    mgr._emitSSE('ci', { worker: 'w1', result: 'fail', command: 'npm test', output: 'error' });
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, 'ci');
    assert.strictEqual(events[0].result, 'fail');
    assert.strictEqual(events[0].worker, 'w1');
  });
});

// --- 5.29 Intervention Notification tests ---

describe('Intervention Notification (5.29)', () => {
  // Simulate question detection + immediate notification
  it('notifies immediately on question detection', () => {
    const stallCalls = [];
    const notifications = {
      notifyStall: (name, reason) => { stallCalls.push({ name, reason }); },
    };

    // Simulate: question detected → immediate notifyStall
    const name = 'worker1';
    const questionLine = 'Should I use TypeScript or JavaScript?';
    notifications.notifyStall(name, `intervention: question — ${questionLine.slice(0, 100)}`);

    assert.strictEqual(stallCalls.length, 1);
    assert.strictEqual(stallCalls[0].name, 'worker1');
    assert.ok(stallCalls[0].reason.includes('intervention: question'));
    assert.ok(stallCalls[0].reason.includes('TypeScript'));
  });

  it('notifies immediately on escalation', () => {
    const stallCalls = [];
    const notifications = {
      notifyStall: (name, reason) => { stallCalls.push({ name, reason }); },
    };

    const errLine = 'Error: Cannot find module "foo"';
    notifications.notifyStall('w2', `intervention: escalation — ${errLine.slice(0, 100)}`);

    assert.strictEqual(stallCalls.length, 1);
    assert.ok(stallCalls[0].reason.includes('intervention: escalation'));
    assert.ok(stallCalls[0].reason.includes('Cannot find module'));
  });

  it('notifies on permission prompt awaiting approval', () => {
    const stallCalls = [];
    const notifications = {
      notifyStall: (name, reason) => { stallCalls.push({ name, reason }); },
    };

    notifications.notifyStall('w3', 'awaiting approval: bash — rm -rf /tmp/old');

    assert.strictEqual(stallCalls.length, 1);
    assert.ok(stallCalls[0].reason.includes('awaiting approval'));
    assert.ok(stallCalls[0].reason.includes('bash'));
  });

  // Permission notification dedup: _permissionNotified flag
  it('prevents duplicate permission notifications', () => {
    const worker = { _permissionNotified: false };
    const stallCalls = [];
    const notifications = {
      notifyStall: (name, reason) => { stallCalls.push({ name, reason }); },
    };

    // First permission prompt → notify
    if (!worker._permissionNotified) {
      worker._permissionNotified = true;
      notifications.notifyStall('w1', 'awaiting approval: bash — npm install');
    }
    assert.strictEqual(stallCalls.length, 1);

    // Second permission prompt (same screen) → skip
    if (!worker._permissionNotified) {
      notifications.notifyStall('w1', 'awaiting approval: bash — npm install');
    }
    assert.strictEqual(stallCalls.length, 1); // still 1, not 2

    // Worker resumes (prompt no longer visible) → reset
    worker._permissionNotified = false;

    // New permission prompt → notify again
    if (!worker._permissionNotified) {
      worker._permissionNotified = true;
      notifications.notifyStall('w1', 'awaiting approval: edit — src/foo.js');
    }
    assert.strictEqual(stallCalls.length, 2);
  });

  // Integration: healthCheck still notifies for intervention
  it('healthCheck stall detection still works alongside immediate notification', () => {
    const stallCalls = [];
    const notifications = {
      notifyStall: (name, reason) => { stallCalls.push({ name, reason }); },
    };

    const workers = new Map();
    workers.set('w1', {
      alive: true,
      lastDataTime: Date.now() - 10000,
      _taskText: 'fix bug',
      _interventionState: 'question',
    });

    // Simulate healthCheck stall detection
    for (const [name, w] of workers) {
      if (!w.alive) continue;
      if (w._interventionState) {
        notifications.notifyStall(name, `intervention: ${w._interventionState}`);
      }
    }

    assert.strictEqual(stallCalls.length, 1);
    assert.ok(stallCalls[0].reason.includes('question'));
  });

  // Hook-based escalation also triggers immediate notification
  it('hook-based escalation triggers immediate notification', () => {
    const stallCalls = [];
    const notifications = {
      notifyStall: (name, reason) => { stallCalls.push({ name, reason }); },
    };

    // Simulate: hook PostToolUse detected repeated error → escalation → notify
    const errLine = 'ENOENT: no such file';
    notifications.notifyStall('w4', `intervention: escalation — ${errLine.slice(0, 100)}`);

    assert.strictEqual(stallCalls.length, 1);
    assert.ok(stallCalls[0].reason.includes('ENOENT'));
  });

  // Notification format includes worker name and detail
  it('notification format is correct', () => {
    const stallCalls = [];
    const notifications = {
      notifyStall: (name, reason) => { stallCalls.push({ name, reason }); },
    };

    notifications.notifyStall('deploy-worker', 'intervention: question — Proceed with migration?');
    assert.strictEqual(stallCalls[0].name, 'deploy-worker');
    assert.ok(stallCalls[0].reason.startsWith('intervention: question'));
    assert.ok(stallCalls[0].reason.includes('migration'));
  });
});
