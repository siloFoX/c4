// (9.10) Cost / retry guardrails tests
// Extracts _resolveBudgetUsd / _buildClaudeArgs / recordRetry from
// src/pty-manager.js via regex + new Function so drift between the real
// implementation and these tests surfaces immediately (same pattern as
// tests/worktree-gc.test.js and tests/worker-language.test.js).

'use strict';
require('./jest-shim');

const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'pty-manager.js'),
  'utf8'
);

function extractMethod(name, regexParams, signatureParams) {
  const re = new RegExp(
    `  ${name}\\(${regexParams}\\)\\s*\\{[\\s\\S]*?\\n  \\}`,
    'm'
  );
  const match = SRC.match(re);
  if (!match) throw new Error(`Could not locate ${name} in pty-manager.js`);
  const header = new RegExp(`^  ${name}\\(${regexParams}\\)\\s*\\{`);
  const body = match[0].replace(header, '').replace(/\n  \}$/, '');
  return new Function(signatureParams, body);
}

const resolveBudgetFn = extractMethod('_resolveBudgetUsd', 'override', 'override');
const resolveMaxRetriesFn = extractMethod('_resolveMaxRetries', 'override', 'override');
const buildClaudeArgsFn = extractMethod(
  '_buildClaudeArgs',
  'command, args = \\[\\], options = \\{\\}',
  'command, args, options'
);
const recordRetryFn = extractMethod('recordRetry', 'name, reason', 'name, reason');

function makeManager({ config = {}, workers = new Map(), notifications = null } = {}) {
  const pushSpy = jest.fn();
  const flushSpy = jest.fn().mockReturnValue(Promise.resolve());
  const closeSpy = jest.fn();
  const notif = notifications || {
    pushAll: pushSpy,
    _flushAll: flushSpy,
  };
  const mgr = {
    config,
    workers,
    _notifications: notif,
    _notifPushSpy: pushSpy,
    _notifFlushSpy: flushSpy,
    _closeSpy: closeSpy,
    _resolveBudgetUsd: resolveBudgetFn,
    _resolveMaxRetries: resolveMaxRetriesFn,
    _buildClaudeArgs: buildClaudeArgsFn,
    recordRetry: recordRetryFn,
    close(name) { closeSpy(name); },
  };
  return mgr;
}

describe('(9.10) _resolveBudgetUsd + _buildClaudeArgs', () => {
  test('(a) budget flag is appended to claude args when config sets maxBudgetUsd', () => {
    const mgr = makeManager({ config: { workerDefaults: { maxBudgetUsd: 5 } } });
    const args = mgr._buildClaudeArgs('claude', [], {});
    expect(args).toEqual(['--max-budget-usd', '5']);
  });

  test('(a.1) default config value 5.0 is applied when field is missing', () => {
    const mgr = makeManager({ config: {} });
    expect(mgr._resolveBudgetUsd()).toBe(5.0);
    const args = mgr._buildClaudeArgs('claude', [], {});
    expect(args).toEqual(['--max-budget-usd', '5']);
  });

  test('(a.2) non-claude commands are passed through unchanged (no flag injected)', () => {
    const mgr = makeManager({ config: { workerDefaults: { maxBudgetUsd: 5 } } });
    const args = mgr._buildClaudeArgs('bash', ['-l'], {});
    expect(args).toEqual(['-l']);
  });

  test('(a.3) --resume still stacks before the budget flag for claude', () => {
    const mgr = makeManager({ config: { workerDefaults: { maxBudgetUsd: 2 } } });
    const args = mgr._buildClaudeArgs('claude', [], { resume: 'abc-123' });
    expect(args).toEqual(['--resume', 'abc-123', '--max-budget-usd', '2']);
  });

  test('(c) per-task override wins over the config default', () => {
    const mgr = makeManager({ config: { workerDefaults: { maxBudgetUsd: 5 } } });
    expect(mgr._resolveBudgetUsd(10)).toBe(10);
    const args = mgr._buildClaudeArgs('claude', [], { budgetUsd: 10 });
    expect(args).toEqual(['--max-budget-usd', '10']);
  });

  test('(d) disabled when maxBudgetUsd is 0 - no flag emitted', () => {
    const mgr = makeManager({ config: { workerDefaults: { maxBudgetUsd: 0 } } });
    expect(mgr._resolveBudgetUsd()).toBe(0);
    const args = mgr._buildClaudeArgs('claude', [], {});
    expect(args).toEqual([]);
  });

  test('(d.1) disabled when maxBudgetUsd is negative', () => {
    const mgr = makeManager({ config: { workerDefaults: { maxBudgetUsd: -1 } } });
    expect(mgr._resolveBudgetUsd()).toBe(0);
    const args = mgr._buildClaudeArgs('claude', [], {});
    expect(args).toEqual([]);
  });

  test('(d.2) per-task override 0 disables even when config enables', () => {
    const mgr = makeManager({ config: { workerDefaults: { maxBudgetUsd: 5 } } });
    expect(mgr._resolveBudgetUsd(0)).toBe(0);
    const args = mgr._buildClaudeArgs('claude', [], { budgetUsd: 0 });
    expect(args).toEqual([]);
  });

  test('(d.3) non-numeric override falls back to disabled (NaN -> 0)', () => {
    const mgr = makeManager({ config: { workerDefaults: { maxBudgetUsd: 5 } } });
    expect(mgr._resolveBudgetUsd('not-a-number')).toBe(0);
  });
});

describe('(9.10) _resolveMaxRetries', () => {
  test('default when field is missing is 3', () => {
    const mgr = makeManager({ config: {} });
    expect(mgr._resolveMaxRetries()).toBe(3);
  });

  test('per-task override wins over config', () => {
    const mgr = makeManager({ config: { workerDefaults: { maxRetries: 3 } } });
    expect(mgr._resolveMaxRetries(10)).toBe(10);
  });

  test('0 is a valid disabled value', () => {
    const mgr = makeManager({ config: { workerDefaults: { maxRetries: 0 } } });
    expect(mgr._resolveMaxRetries()).toBe(0);
  });

  test('negative falls back to 0 (disabled)', () => {
    const mgr = makeManager({ config: {} });
    expect(mgr._resolveMaxRetries(-1)).toBe(0);
  });
});

describe('(9.10) recordRetry - counter + safety stop', () => {
  function makeWorker(maxRetries = 3) {
    return {
      alive: true,
      _retryCount: 0,
      _maxRetries: maxRetries,
      _budgetUsd: 5,
      _stopReason: null,
      branch: 'c4/test',
      _taskText: 'test task',
    };
  }

  test('(b) increments counter under the limit without stopping', () => {
    const workers = new Map();
    workers.set('w1', makeWorker(3));
    const mgr = makeManager({ workers });

    const r1 = mgr.recordRetry('w1', 'test failed');
    expect(r1.retryCount).toBe(1);
    expect(r1.stopped).toBe(false);
    expect(r1.stopReason).toBeNull();
    expect(mgr._closeSpy).not.toHaveBeenCalled();
    expect(mgr._notifPushSpy).toHaveBeenCalled();
    // Worker remains live
    expect(workers.get('w1')._retryCount).toBe(1);
    expect(workers.get('w1')._stopReason).toBeNull();
  });

  test('(b) triggers safety stop exactly when count reaches maxRetries', () => {
    const workers = new Map();
    workers.set('w1', makeWorker(3));
    const mgr = makeManager({ workers });

    mgr.recordRetry('w1', 'fail 1');
    mgr.recordRetry('w1', 'fail 2');
    expect(mgr._closeSpy).not.toHaveBeenCalled();

    const r3 = mgr.recordRetry('w1', 'fail 3');
    expect(r3.retryCount).toBe(3);
    expect(r3.stopped).toBe(true);
    expect(r3.stopReason).toContain('maxRetries exhausted');
    expect(r3.stopReason).toContain('fail 3');
    expect(mgr._closeSpy).toHaveBeenCalledWith('w1');
    expect(workers.get('w1')._stopReason).toContain('maxRetries exhausted');
    // Slack push was called at least once with the SAFETY STOP marker
    const pushedTexts = mgr._notifPushSpy.mock.calls.map(c => c[0]);
    const hasSafetyStop = pushedTexts.some(t => typeof t === 'string' && t.includes('[SAFETY STOP]') && t.includes('w1'));
    expect(hasSafetyStop).toBe(true);
    // Flush was attempted so the alert lands even if the channel is buffered
    expect(mgr._notifFlushSpy).toHaveBeenCalled();
  });

  test('(b) subsequent recordRetry calls after stop are no-ops', () => {
    const workers = new Map();
    workers.set('w1', makeWorker(2));
    const mgr = makeManager({ workers });

    mgr.recordRetry('w1', 'a');
    mgr.recordRetry('w1', 'b'); // hits limit -> stops
    expect(mgr._closeSpy).toHaveBeenCalledTimes(1);

    const r3 = mgr.recordRetry('w1', 'c');
    expect(r3.stopped).toBe(true);
    expect(r3.retryCount).toBe(2); // unchanged after stop
    expect(mgr._closeSpy).toHaveBeenCalledTimes(1); // close not called again
  });

  test('(b) returns error for unknown worker name', () => {
    const mgr = makeManager({ workers: new Map() });
    const r = mgr.recordRetry('missing', 'x');
    expect(r.error).toBeDefined();
    expect(r.error).toContain('missing');
  });

  test('(b) with maxRetries=0 (disabled) the counter never triggers a stop', () => {
    const workers = new Map();
    workers.set('w1', makeWorker(0));
    const mgr = makeManager({ workers });

    for (let i = 0; i < 10; i++) {
      const r = mgr.recordRetry('w1', `fail ${i}`);
      expect(r.stopped).toBe(false);
    }
    expect(mgr._closeSpy).not.toHaveBeenCalled();
    expect(workers.get('w1')._retryCount).toBe(10);
  });
});
