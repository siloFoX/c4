// tests for src/recovery.js (TODO 8.4: intelligent exception recovery).
//
// Covers: classifyError pattern dispatch, strategy picker ordering + config
// override, stripTaskOptions transform, appendHistory/readHistory round-trip,
// recoverWorker non-destructive contract (intervention skip, max-attempts,
// strategy transforms, send-task vs. notify), daemon wiring source-grep, and
// the c4 recover CLI subcommand presence.

'use strict';

const assert = require('assert');
const { describe, it, before, after } = require('node:test');
const fs = require('fs');
const path = require('path');
const os = require('os');

const recovery = require('../src/recovery');

function mkTmpRoot(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `c4-recovery-${label}-`));
  return dir;
}
function rmRf(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

// ----- classifyError ---------------------------------------------------------

describe('classifyError', () => {
  it('returns unknown on empty / null / whitespace', () => {
    assert.strictEqual(recovery.classifyError('').category, 'unknown');
    assert.strictEqual(recovery.classifyError(null).category, 'unknown');
    assert.strictEqual(recovery.classifyError('   \n\t\n ').category, 'unknown');
  });

  it('detects tool-deny before the generic error fallback', () => {
    const txt = 'something happened\nError: Permission denied by policy\n';
    const r = recovery.classifyError(txt);
    assert.strictEqual(r.category, 'tool-deny');
    assert.ok(r.signal && /denied/i.test(r.signal));
  });

  it('detects test-fail from jest-style line', () => {
    const r = recovery.classifyError('Tests: 3 failed, 10 passed');
    assert.strictEqual(r.category, 'test-fail');
  });

  it('detects build-fail from a TypeScript error code', () => {
    const r = recovery.classifyError('src/foo.ts(12,3): error TS2304: Cannot find name');
    assert.strictEqual(r.category, 'build-fail');
  });

  it('detects timeout from ETIMEDOUT', () => {
    const r = recovery.classifyError('connect ETIMEDOUT 127.0.0.1:443');
    assert.strictEqual(r.category, 'timeout');
  });

  it('detects dependency failure from npm ERR! ENOENT', () => {
    const r = recovery.classifyError('npm ERR! ENOENT no such file package.json');
    assert.strictEqual(r.category, 'dependency');
  });

  it('falls back to unknown + low-confidence generic match', () => {
    const r = recovery.classifyError('some Error: weird thing happened');
    assert.strictEqual(r.category, 'unknown');
    assert.ok(r.confidence < 0.5);
    assert.ok(r.signal);
  });

  it('respects tailBytes option (ignores earlier matches outside the tail)', () => {
    const head = 'Tests: 1 failed\n' + 'x'.repeat(5000) + '\nclean trailing text';
    const r = recovery.classifyError(head, { tailBytes: 100 });
    // tail has no failure signal, so must be unknown
    assert.strictEqual(r.category, 'unknown');
  });
});

// ----- stripTaskOptions ------------------------------------------------------

describe('stripTaskOptions', () => {
  it('keeps first action line and drops bullet options', () => {
    const input = 'Fix the login bug\n- retry with cache\n- turn on verbose logging\n- add tests';
    const out = recovery.stripTaskOptions(input);
    assert.strictEqual(out, 'Fix the login bug');
  });

  it('strips trailing [opts] bracket on action line', () => {
    const input = 'Refactor module [opts: aggressive, verbose, parallel]';
    const out = recovery.stripTaskOptions(input);
    assert.strictEqual(out, 'Refactor module');
  });

  it('returns original trimmed first line for task with no options', () => {
    const out = recovery.stripTaskOptions('Simple task\nSecond paragraph');
    assert.ok(out.startsWith('Simple task'));
  });

  it('handles empty / null safely', () => {
    assert.strictEqual(recovery.stripTaskOptions(''), '');
    assert.strictEqual(recovery.stripTaskOptions(null), '');
  });
});

// ----- pickStrategy ----------------------------------------------------------

describe('pickStrategy', () => {
  it('uses default ordering for test-fail', () => {
    assert.strictEqual(recovery.pickStrategy('test-fail', 1), 'retry-same');
    assert.strictEqual(recovery.pickStrategy('test-fail', 2), 'retry-simpler');
    assert.strictEqual(recovery.pickStrategy('test-fail', 3), 'retry-with-smaller-scope');
    assert.strictEqual(recovery.pickStrategy('test-fail', 4), 'ask-manager');
    // beyond the list clamps to the last entry
    assert.strictEqual(recovery.pickStrategy('test-fail', 99), 'ask-manager');
  });

  it('defaults dependency to ask-manager', () => {
    assert.strictEqual(recovery.pickStrategy('dependency', 1), 'ask-manager');
  });

  it('honors config.recovery.strategies.<category> override', () => {
    const cfg = {
      recovery: {
        strategies: {
          'test-fail': ['retry-simpler', 'ask-manager'],
        },
      },
    };
    assert.strictEqual(recovery.pickStrategy('test-fail', 1, cfg), 'retry-simpler');
    assert.strictEqual(recovery.pickStrategy('test-fail', 2, cfg), 'ask-manager');
  });

  it('filters invalid strategy names from the override list', () => {
    const cfg = {
      recovery: { strategies: { 'test-fail': ['bogus', 'retry-same'] } },
    };
    assert.strictEqual(recovery.pickStrategy('test-fail', 1, cfg), 'retry-same');
  });

  it('degrades to ask-manager when ordering is empty', () => {
    const cfg = { recovery: { strategies: { 'unknown': [] } } };
    // empty override -> falls through to default ordering
    assert.ok(recovery.pickStrategy('unknown', 1, cfg));
  });
});

// ----- strategy transforms ---------------------------------------------------

describe('STRATEGIES transforms', () => {
  it('retry-same returns the original task unchanged', () => {
    const s = recovery.getStrategy('retry-same');
    assert.strictEqual(s.transform('do the thing'), 'do the thing');
    assert.strictEqual(s.transform(''), '');
  });

  it('retry-simpler prefixes a recovery banner and strips options', () => {
    const s = recovery.getStrategy('retry-simpler');
    const out = s.transform('Add endpoint\n- cache it\n- use gzip');
    assert.ok(out.startsWith('[C4 RECOVERY]'));
    assert.ok(/Add endpoint/.test(out));
    assert.ok(!/cache it/.test(out));
  });

  it('retry-with-smaller-scope keeps the original task as reference', () => {
    const s = recovery.getStrategy('retry-with-smaller-scope');
    const out = s.transform('Refactor all services');
    assert.ok(out.startsWith('[C4 RECOVERY]'));
    assert.ok(/Refactor all services/.test(out));
    assert.ok(/ONE file/i.test(out) || /one file/i.test(out));
  });

  it('ask-manager returns null (signals notify-only)', () => {
    const s = recovery.getStrategy('ask-manager');
    assert.strictEqual(s.transform('anything'), null);
  });

  it('listStrategies exposes the four documented names', () => {
    const names = recovery.listStrategies();
    for (const expected of ['retry-same', 'retry-simpler', 'retry-with-smaller-scope', 'ask-manager']) {
      assert.ok(names.includes(expected), `missing strategy ${expected}`);
    }
  });
});

// ----- history ---------------------------------------------------------------

describe('history (appendHistory / readHistory)', () => {
  let root;
  before(() => { root = mkTmpRoot('history'); });
  after(() => { rmRf(root); });

  it('creates .c4/ on demand and appends a JSON line', () => {
    const res = recovery.appendHistory(root, {
      worker: 'w1', category: 'test-fail', strategy: 'retry-same', attempt: 1, phase: 'applied',
    });
    assert.strictEqual(res.ok, true);
    assert.ok(fs.existsSync(res.path));
    const raw = fs.readFileSync(res.path, 'utf8');
    const lines = raw.trim().split('\n');
    assert.strictEqual(lines.length, 1);
    const obj = JSON.parse(lines[0]);
    assert.strictEqual(obj.worker, 'w1');
    assert.ok(obj.time);
  });

  it('readHistory filters by worker and respects limit', () => {
    recovery.appendHistory(root, { worker: 'w2', category: 'build-fail', strategy: 'retry-simpler', attempt: 1, phase: 'applied' });
    recovery.appendHistory(root, { worker: 'w2', category: 'build-fail', strategy: 'retry-simpler', attempt: 2, phase: 'applied' });
    recovery.appendHistory(root, { worker: 'w2', category: 'build-fail', strategy: 'ask-manager', attempt: 3, phase: 'notified' });
    const allW2 = recovery.readHistory(root, { worker: 'w2' });
    assert.strictEqual(allW2.length, 3);
    const w1 = recovery.readHistory(root, { worker: 'w1' });
    assert.strictEqual(w1.length, 1);
    const last2 = recovery.readHistory(root, { worker: 'w2', limit: 2 });
    assert.strictEqual(last2.length, 2);
    assert.strictEqual(last2[0].attempt, 2);
    assert.strictEqual(last2[1].attempt, 3);
  });

  it('readHistory returns empty array when the file does not exist', () => {
    const empty = recovery.readHistory(mkTmpRoot('missing'));
    assert.deepStrictEqual(empty, []);
  });

  it('readHistory skips malformed lines without throwing', () => {
    const badRoot = mkTmpRoot('bad');
    fs.mkdirSync(path.join(badRoot, '.c4'), { recursive: true });
    fs.writeFileSync(path.join(badRoot, '.c4', 'recovery-history.jsonl'),
      'not json\n{"worker":"ok","category":"x"}\n\n\n');
    const out = recovery.readHistory(badRoot);
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].worker, 'ok');
    rmRf(badRoot);
  });
});

// ----- recoverWorker ---------------------------------------------------------

function makeFakeManager({ config, scrollback, worker, sendTaskImpl, notifications } = {}) {
  const sendCalls = [];
  const notifyCalls = [];
  return {
    config: config || { recovery: { enabled: true, maxAttempts: 3 } },
    getConfig() { return this.config; },
    workers: new Map(worker ? [[worker.name || 'w1', worker]] : []),
    getScrollback(name, lines) {
      return { content: scrollback != null ? scrollback : '', lines: lines || 0 };
    },
    sendTask(name, task, opts) {
      sendCalls.push({ name, task, opts });
      if (typeof sendTaskImpl === 'function') return sendTaskImpl(name, task, opts);
      return { success: true };
    },
    notifications: notifications !== undefined ? notifications : {
      pushAll(msg) { notifyCalls.push(msg); },
    },
    _sendCalls: sendCalls,
    _notifyCalls: notifyCalls,
  };
}

describe('recoverWorker', () => {
  let root;
  before(() => { root = mkTmpRoot('recover'); });
  after(() => { rmRf(root); });

  it('skips when config.recovery.enabled is false and not manual', () => {
    const mgr = makeFakeManager({ config: { recovery: { enabled: false } } });
    const res = recovery.recoverWorker(mgr, 'w1', { projectRoot: root });
    assert.strictEqual(res.recovered, false);
    assert.strictEqual(res.skipped, true);
    assert.strictEqual(res.reason, 'recovery-disabled');
    assert.strictEqual(mgr._sendCalls.length, 0);
  });

  it('runs when manual=true even if enabled is false', () => {
    const mgr = makeFakeManager({
      config: { recovery: { enabled: false, maxAttempts: 3 } },
      scrollback: 'Tests: 1 failed',
      worker: { name: 'w1', _interventionState: 'escalation', _taskText: 'Fix tests' },
    });
    const res = recovery.recoverWorker(mgr, 'w1', { manual: true, projectRoot: root });
    assert.strictEqual(res.skipped, false);
    assert.strictEqual(res.category, 'test-fail');
    assert.strictEqual(res.strategy, 'retry-same');
    assert.strictEqual(mgr._sendCalls.length, 1);
  });

  it('skips when worker is parked at a user question', () => {
    const mgr = makeFakeManager({
      scrollback: 'Tests: 1 failed',
      worker: { name: 'w1', _interventionState: 'question', _taskText: 'x' },
    });
    const res = recovery.recoverWorker(mgr, 'w1', { projectRoot: root });
    assert.strictEqual(res.skipped, true);
    assert.ok(String(res.reason).includes('question'));
    assert.strictEqual(mgr._sendCalls.length, 0);
  });

  it('skips when worker is parked at critical_deny', () => {
    const mgr = makeFakeManager({
      worker: { name: 'w1', _interventionState: 'critical_deny', _taskText: 'x' },
    });
    const res = recovery.recoverWorker(mgr, 'w1', { projectRoot: root });
    assert.strictEqual(res.skipped, true);
    assert.ok(String(res.reason).includes('critical_deny'));
  });

  it('classifies + sends a transformed task on escalation (test-fail -> retry-same)', () => {
    const mgr = makeFakeManager({
      scrollback: 'AssertionError: expected 1 to equal 2',
      worker: { name: 'w2', _interventionState: 'escalation', _taskText: 'Make tests green' },
    });
    const res = recovery.recoverWorker(mgr, 'w2', { projectRoot: root });
    assert.strictEqual(res.recovered, true);
    assert.strictEqual(res.category, 'test-fail');
    assert.strictEqual(res.strategy, 'retry-same');
    assert.strictEqual(res.action, 'send-task');
    assert.strictEqual(mgr._sendCalls.length, 1);
    assert.strictEqual(mgr._sendCalls[0].task, 'Make tests green');
    // never destructive: reuse:true + no skipChecks / close
    assert.strictEqual(mgr._sendCalls[0].opts.reuse, true);
    assert.strictEqual('skipChecks' in mgr._sendCalls[0].opts, false);
  });

  it('advances the strategy each repeat (test-fail 1->2->3)', () => {
    const mgr = makeFakeManager({
      scrollback: 'Tests: 5 failed',
      worker: { name: 'w3', _interventionState: 'escalation', _taskText: 'Fix it [opts: fast]' },
    });
    const r1 = recovery.recoverWorker(mgr, 'w3', { projectRoot: root });
    const r2 = recovery.recoverWorker(mgr, 'w3', { projectRoot: root });
    const r3 = recovery.recoverWorker(mgr, 'w3', { projectRoot: root });
    assert.strictEqual(r1.strategy, 'retry-same');
    assert.strictEqual(r2.strategy, 'retry-simpler');
    assert.strictEqual(r3.strategy, 'retry-with-smaller-scope');
    // simpler strategy banner is present on the second call
    assert.ok(/C4 RECOVERY/.test(mgr._sendCalls[1].task));
    // options stripped
    assert.ok(!/\[opts:/.test(mgr._sendCalls[1].task));
  });

  it('escalates to ask-manager + notify when maxAttempts is exceeded', () => {
    const mgr = makeFakeManager({
      config: { recovery: { enabled: true, maxAttempts: 1 } },
      scrollback: 'Tests: 1 failed',
      worker: { name: 'w4', _interventionState: 'escalation', _taskText: 'x' },
    });
    // first pass uses attempt 1 (strategy ran), second pass tips over maxAttempts
    recovery.recoverWorker(mgr, 'w4', { projectRoot: root });
    const r2 = recovery.recoverWorker(mgr, 'w4', { projectRoot: root });
    assert.strictEqual(r2.recovered, false);
    assert.strictEqual(r2.strategy, 'ask-manager');
    assert.strictEqual(r2.action, 'notify');
    assert.ok(mgr._notifyCalls.some((m) => /max attempts/i.test(m)));
  });

  it('honors the categoryHint override', () => {
    const mgr = makeFakeManager({
      scrollback: 'unrelated text',
      worker: { name: 'w5', _interventionState: 'escalation', _taskText: 'Do something' },
    });
    const res = recovery.recoverWorker(mgr, 'w5', { projectRoot: root, categoryHint: 'build-fail' });
    // build-fail default starts at retry-simpler
    assert.strictEqual(res.category, 'build-fail');
    assert.strictEqual(res.strategy, 'retry-simpler');
  });

  it('records every pass in .c4/recovery-history.jsonl', () => {
    const localRoot = mkTmpRoot('audit');
    const mgr = makeFakeManager({
      scrollback: 'npm ERR! ENOENT',
      worker: { name: 'w6', _interventionState: 'escalation', _taskText: 'x' },
    });
    const res = recovery.recoverWorker(mgr, 'w6', { projectRoot: localRoot });
    const file = path.join(localRoot, '.c4', 'recovery-history.jsonl');
    assert.ok(fs.existsSync(file), 'history file should exist');
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
    assert.strictEqual(lines.length, 1);
    const entry = JSON.parse(lines[0]);
    assert.strictEqual(entry.worker, 'w6');
    assert.strictEqual(entry.category, 'dependency');
    assert.strictEqual(entry.strategy, 'ask-manager');
    assert.ok(res.historyPath);
    rmRf(localRoot);
  });

  it('never calls manager.close or passes skipChecks', () => {
    // Assemble a manager whose close/rollback/cleanup methods throw if called.
    const mgr = makeFakeManager({
      scrollback: 'Tests: 1 failed',
      worker: { name: 'w7', _interventionState: 'escalation', _taskText: 'y' },
    });
    mgr.close = () => { throw new Error('close must not be called by recovery'); };
    mgr.rollback = () => { throw new Error('rollback must not be called'); };
    mgr.cleanup = () => { throw new Error('cleanup must not be called'); };
    const res = recovery.recoverWorker(mgr, 'w7', { projectRoot: root });
    assert.strictEqual(res.recovered, true);
    assert.strictEqual(res.action, 'send-task');
  });

  it('captures sendTask errors without crashing and marks phase=send-failed', () => {
    const localRoot = mkTmpRoot('senderr');
    const mgr = makeFakeManager({
      scrollback: 'Tests: 1 failed',
      worker: { name: 'w8', _interventionState: 'escalation', _taskText: 'z' },
      sendTaskImpl() { return { error: 'boom' }; },
    });
    const res = recovery.recoverWorker(mgr, 'w8', { projectRoot: localRoot });
    assert.strictEqual(res.recovered, false);
    assert.strictEqual(res.error, 'boom');
    const lines = fs.readFileSync(path.join(localRoot, '.c4', 'recovery-history.jsonl'), 'utf8').trim().split('\n');
    const entry = JSON.parse(lines[0]);
    assert.strictEqual(entry.phase, 'send-failed');
    rmRf(localRoot);
  });
});

// ----- daemon wiring source-grep --------------------------------------------

describe('daemon wiring (source grep)', () => {
  const daemonSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'daemon.js'), 'utf8');

  it('requires ./recovery', () => {
    assert.ok(/require\(['"]\.\/recovery['"]\)/.test(daemonSrc));
  });

  it('defines POST /recover route with manual:true', () => {
    assert.ok(daemonSrc.includes("route === '/recover'"));
    assert.ok(daemonSrc.includes('recovery.recoverWorker'));
    assert.ok(/manual:\s*true/.test(daemonSrc));
  });

  it('defines GET /recovery-history route', () => {
    assert.ok(daemonSrc.includes("route === '/recovery-history'"));
    assert.ok(daemonSrc.includes('recovery.readHistory'));
  });

  it('installs an sse listener that only fires on escalation + recovery.enabled', () => {
    assert.ok(/manager\.on\(['"]sse['"]/.test(daemonSrc));
    assert.ok(/event\.escalation/.test(daemonSrc));
    assert.ok(/recovery\.enabled\s*!==\s*true/.test(daemonSrc));
  });

  it('debounces auto-recovery per worker', () => {
    assert.ok(/_recoveryLastRun/.test(daemonSrc));
    assert.ok(/RECOVERY_DEBOUNCE_MS/.test(daemonSrc));
  });
});

// ----- cli wiring source-grep -----------------------------------------------

describe('cli wiring (source grep)', () => {
  const cliSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'cli.js'), 'utf8');

  it('defines a recover subcommand', () => {
    assert.ok(cliSrc.includes("case 'recover'"));
    assert.ok(cliSrc.includes('/recover'));
    assert.ok(cliSrc.includes('--category'));
    assert.ok(cliSrc.includes('--history'));
  });

  it('help text mentions smart recovery', () => {
    assert.ok(/recover\s+<name>/.test(cliSrc));
  });
});

// ----- config shape ----------------------------------------------------------

describe('config.example.json recovery section', () => {
  it('declares recovery with enabled:false + maxAttempts + per-category strategies', () => {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.example.json'), 'utf8'));
    assert.ok(cfg.recovery, 'recovery section present');
    assert.strictEqual(cfg.recovery.enabled, false);
    assert.ok(Number.isInteger(cfg.recovery.maxAttempts));
    assert.ok(cfg.recovery.strategies && cfg.recovery.strategies['test-fail']);
    assert.ok(Array.isArray(cfg.recovery.strategies['test-fail']));
    assert.ok(cfg.recovery.strategies['test-fail'].includes('retry-same'));
  });
});
