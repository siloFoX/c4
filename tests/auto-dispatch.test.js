'use strict';

// Tests for src/auto-dispatcher.js (8.28).
//
// Pure-node asserts (no jest-shim, no node:test harness) so the runner
// picks this up as a "script" style and fails the process on any
// failed assertion. Matches the style of tests/task-queue.test.js.

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const mod = require('../src/auto-dispatcher');
const {
  AutoDispatcher,
  parseTodos,
  sortByPriority,
  pickNext,
  detectPriority,
  detectUnsafe,
  extractDependencies,
  priorityRank,
  compareById,
  buildDispatchPrompt,
} = mod;

let passed = 0;
let failed = 0;
const pending = [];
function t(label, fn) {
  // Buffer every test so the whole file can run inside one top-level
  // async IIFE. This keeps the summary line printed after async tests
  // have settled and avoids interleaved output.
  pending.push(async () => {
    try {
      const r = fn();
      if (r && typeof r.then === 'function') await r;
      passed += 1;
      console.log('  ok  ' + label);
    } catch (e) {
      failed += 1;
      console.log('  FAIL ' + label + ': ' + (e && e.message ? e.message : e));
    }
  });
}
const tAsync = t;
function section(name) {
  pending.push(async () => { console.log('\n== ' + name + ' =='); });
}

// --- parseTodos --------------------------------------------------------

section('parseTodos');

t('parses GFM-style row with done status', () => {
  const md = '| 1.1 | First item | done | detail text here |';
  const rows = parseTodos(md);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].id, '1.1');
  assert.strictEqual(rows[0].status, 'done');
  assert.strictEqual(rows[0].title, 'First item');
});

t('parses strikethrough id ~~7.8~~ as 7.8', () => {
  const md = '| ~~7.8~~ | Archived | done | 2026-04-17 |';
  const rows = parseTodos(md);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].id, '7.8');
});

t('skips non-table lines', () => {
  const md = '# Header\n\nSome text\n| 2.3 | Task | todo | body |';
  const rows = parseTodos(md);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].id, '2.3');
});

t('handles bolded **done** status marker', () => {
  const md = '| 1.5 | Work | **done** | shipped |';
  const rows = parseTodos(md);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].status, 'done');
});

t('ignores unknown status values', () => {
  const md = '| 1.6 | Odd | in-flight | weird status |';
  const rows = parseTodos(md);
  assert.strictEqual(rows.length, 0);
});

t('returns empty array on non-string input', () => {
  assert.deepStrictEqual(parseTodos(null), []);
  assert.deepStrictEqual(parseTodos(undefined), []);
  assert.deepStrictEqual(parseTodos(123), []);
  assert.deepStrictEqual(parseTodos(''), []);
});

t('deduplicates rows with the same id', () => {
  const md = '| 5.1 | A | todo | first |\n| 5.1 | A-dup | todo | second |';
  const rows = parseTodos(md);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].title, 'A');
});

t('parses real TODO.md snippet with ids 8.26+8.28+8.29', () => {
  const md = [
    '| 8.26 | Approval gap | todo | reviewer dependency fix |',
    '| 8.28 | Auto-dispatch | todo | [urgent] ship the loop |',
    '| 8.29 | Reviewer oversight | todo | light overseer role |',
  ].join('\n');
  const rows = parseTodos(md);
  assert.strictEqual(rows.length, 3);
  const ids = rows.map((r) => r.id).sort();
  assert.deepStrictEqual(ids, ['8.26', '8.28', '8.29']);
});

// --- detectPriority ----------------------------------------------------

section('detectPriority');

t('[urgent] tag promotes to urgent', () => {
  assert.strictEqual(detectPriority('[urgent] ship the fix'), 'urgent');
  assert.strictEqual(detectPriority('(urgent) ship it'), 'urgent');
  assert.strictEqual(detectPriority('urgent: ship it'), 'urgent');
});

t('Korean [긴급] tag promotes to urgent', () => {
  assert.strictEqual(detectPriority('[긴급] 중요'), 'urgent');
  assert.strictEqual(detectPriority('긴급: 중요'), 'urgent');
});

t('narrative mention of "urgent" stays normal', () => {
  assert.strictEqual(
    detectPriority('refactor the urgent priority detection logic'),
    'normal'
  );
});

t('[halt] tag promotes to halt', () => {
  assert.strictEqual(detectPriority('[halt] back out change'), 'halt');
  assert.strictEqual(detectPriority('halt-related rollback cleanup'), 'halt');
});

t('default is normal', () => {
  assert.strictEqual(detectPriority('plain old todo'), 'normal');
  assert.strictEqual(detectPriority(''), 'normal');
  assert.strictEqual(detectPriority(null), 'normal');
});

// --- detectUnsafe ------------------------------------------------------

section('detectUnsafe');

t('matches && compound', () => {
  assert.strictEqual(detectUnsafe('cd /tmp && rm file'), 'compound-&&');
});

t('matches || compound', () => {
  assert.strictEqual(detectUnsafe('cmd1 || cmd2'), 'compound-||');
});

t('matches ; compound (not escaped)', () => {
  assert.strictEqual(detectUnsafe('a ; b'), 'compound-;');
});

t('matches rm -rf', () => {
  assert.strictEqual(detectUnsafe('please run rm -rf /tmp/cache'), 'rm-rf');
});

t('matches sudo', () => {
  assert.strictEqual(detectUnsafe('sudo apt install'), 'sudo');
});

t('matches git push --force', () => {
  assert.strictEqual(
    detectUnsafe('push with git push origin main --force'),
    'git-push-force'
  );
});

t('matches shutdown/reboot/chmod 777', () => {
  assert.strictEqual(detectUnsafe('schedule a shutdown now'), 'shutdown');
  assert.strictEqual(detectUnsafe('we need reboot tonight'), 'reboot');
  assert.strictEqual(detectUnsafe('chmod -R 777 /etc'), 'chmod-777-r');
});

t('returns null for plain English todo detail', () => {
  assert.strictEqual(
    detectUnsafe('Add a new config key for autonomous mode'),
    null
  );
});

// --- extractDependencies ----------------------------------------------

section('extractDependencies');

t('pulls dependencies from "depends on N" phrases', () => {
  assert.deepStrictEqual(
    extractDependencies('This one depends on 8.15 and also depends on 7.26'),
    ['8.15', '7.26']
  );
});

t('pulls dependencies from "blocked by N" phrases', () => {
  assert.deepStrictEqual(
    extractDependencies('blocked by 9.1 until that ships'),
    ['9.1']
  );
});

t('returns empty array when none found', () => {
  assert.deepStrictEqual(extractDependencies('no deps here'), []);
});

// --- sortByPriority + pickNext ----------------------------------------

section('sortByPriority + pickNext');

t('sortByPriority: urgent before halt before normal', () => {
  const todos = [
    { id: '8.40', title: 'a', status: 'todo', detail: '', priority: 'normal', dependencies: [], unsafe: null },
    { id: '8.41', title: 'a', status: 'todo', detail: '', priority: 'halt', dependencies: [], unsafe: null },
    { id: '8.42', title: 'a', status: 'todo', detail: '', priority: 'urgent', dependencies: [], unsafe: null },
  ];
  const sorted = sortByPriority(todos);
  assert.strictEqual(sorted[0].id, '8.42');
  assert.strictEqual(sorted[1].id, '8.41');
  assert.strictEqual(sorted[2].id, '8.40');
});

t('sortByPriority: ties break by numeric id ascending', () => {
  const todos = [
    { id: '8.29', title: 'a', status: 'todo', detail: '', priority: 'normal', dependencies: [], unsafe: null },
    { id: '8.26', title: 'a', status: 'todo', detail: '', priority: 'normal', dependencies: [], unsafe: null },
    { id: '8.28', title: 'a', status: 'todo', detail: '', priority: 'normal', dependencies: [], unsafe: null },
  ];
  const sorted = sortByPriority(todos);
  assert.deepStrictEqual(sorted.map((x) => x.id), ['8.26', '8.28', '8.29']);
});

t('pickNext skips done rows', () => {
  const todos = [
    { id: '1.1', title: 'a', status: 'done', detail: '', priority: 'normal', dependencies: [], unsafe: null },
    { id: '1.2', title: 'a', status: 'todo', detail: '', priority: 'normal', dependencies: [], unsafe: null },
  ];
  const next = pickNext(todos);
  assert.strictEqual(next.id, '1.2');
});

t('pickNext returns unsafe row by default so tick can pause', () => {
  const todos = [
    { id: '1.1', title: 'a', status: 'todo', detail: 'rm -rf dangerous', priority: 'normal', dependencies: [], unsafe: 'rm-rf' },
    { id: '1.2', title: 'a', status: 'todo', detail: 'safe work', priority: 'normal', dependencies: [], unsafe: null },
  ];
  const next = pickNext(todos);
  assert.strictEqual(next.id, '1.1');
});

t('pickNext with skipUnsafe=true filters unsafe rows', () => {
  const todos = [
    { id: '1.1', title: 'a', status: 'todo', detail: 'rm -rf', priority: 'normal', dependencies: [], unsafe: 'rm-rf' },
    { id: '1.2', title: 'a', status: 'todo', detail: 'safe', priority: 'normal', dependencies: [], unsafe: null },
  ];
  const next = pickNext(todos, { skipUnsafe: true });
  assert.strictEqual(next.id, '1.2');
});

t('pickNext waits on unresolved dependencies', () => {
  const todos = [
    { id: '2.1', title: 'a', status: 'todo', detail: 'depends on 1.9', priority: 'normal', dependencies: ['1.9'], unsafe: null },
    { id: '3.1', title: 'b', status: 'todo', detail: '', priority: 'normal', dependencies: [], unsafe: null },
  ];
  const next = pickNext(todos, { completedIds: [] });
  assert.strictEqual(next.id, '3.1');
});

t('pickNext picks dependent when dep is completed via overrides', () => {
  const todos = [
    { id: '2.1', title: 'a', status: 'todo', detail: 'depends on 1.9', priority: 'normal', dependencies: ['1.9'], unsafe: null },
  ];
  const next = pickNext(todos, { completedIds: ['1.9'] });
  assert.strictEqual(next.id, '2.1');
});

t('pickNext treats done rows in the list as completed for dep resolution', () => {
  const todos = [
    { id: '1.9', title: 'shipped', status: 'done', detail: '', priority: 'normal', dependencies: [], unsafe: null },
    { id: '2.1', title: 'a', status: 'todo', detail: 'depends on 1.9', priority: 'normal', dependencies: ['1.9'], unsafe: null },
  ];
  const next = pickNext(todos);
  assert.strictEqual(next.id, '2.1');
});

t('pickNext returns null when nothing is eligible', () => {
  assert.strictEqual(pickNext([]), null);
  const todos = [
    { id: '1.1', title: 'x', status: 'done', detail: '', priority: 'normal', dependencies: [], unsafe: null },
  ];
  assert.strictEqual(pickNext(todos), null);
});

// --- compareById + priorityRank ---------------------------------------

section('comparators');

t('priorityRank ordering', () => {
  assert.ok(priorityRank('urgent') < priorityRank('halt'));
  assert.ok(priorityRank('halt') < priorityRank('normal'));
});

t('compareById sorts major.minor numerically', () => {
  const items = [{ id: '10.1' }, { id: '2.5' }, { id: '2.10' }];
  items.sort(compareById);
  assert.deepStrictEqual(items.map((x) => x.id), ['2.5', '2.10', '10.1']);
});

// --- AutoDispatcher state machine -------------------------------------

section('AutoDispatcher core');

function makeDispatcher(overrides) {
  const base = {
    todoPath: 'TODO.md',
    enabled: true,
    throttleMs: 1000,
    circuitThreshold: 3,
    clock: () => 100000,
    reader: () => '| 1.1 | task | todo | safe plain detail |',
    idleCheck: () => true,
    dispatch: async () => ({ ok: true }),
  };
  return new AutoDispatcher(Object.assign(base, overrides || {}));
}

tAsync('tick dispatches the first eligible todo', async () => {
  let dispatched = null;
  const d = makeDispatcher({
    dispatch: async (todo) => { dispatched = todo.id; return { ok: true }; },
  });
  const r = await d.tick();
  assert.strictEqual(r.dispatched, '1.1');
  assert.strictEqual(dispatched, '1.1');
  assert.strictEqual(d.lastDispatchId, '1.1');
  assert.strictEqual(d.consecutiveHalts, 0);
  assert.strictEqual(d.dispatchLog.length, 1);
  assert.strictEqual(d.dispatchLog[0].type, 'dispatch');
});

tAsync('tick skips when disabled', async () => {
  const d = makeDispatcher({ enabled: false });
  const r = await d.tick();
  assert.strictEqual(r.skipped, 'disabled');
});

tAsync('tick skips when paused', async () => {
  const d = makeDispatcher();
  d.pause('operator');
  const r = await d.tick();
  assert.strictEqual(r.skipped, 'paused');
  assert.strictEqual(r.reason, 'operator');
});

tAsync('tick throttles within the window', async () => {
  let now = 100000;
  const d = makeDispatcher({
    clock: () => now,
    throttleMs: 5000,
  });
  await d.tick();
  now += 1000;
  const r = await d.tick();
  assert.strictEqual(r.skipped, 'throttled');
  assert.ok(r.nextEligibleInMs > 0 && r.nextEligibleInMs <= 5000);
});

tAsync('tick lets second call through after throttle elapses', async () => {
  let now = 100000;
  const d = makeDispatcher({
    clock: () => now,
    throttleMs: 5000,
    reader: () =>
      '| 1.1 | a | todo | safe |\n| 1.2 | b | todo | safe |',
  });
  const first = await d.tick();
  assert.strictEqual(first.dispatched, '1.1');
  now += 5001;
  // 1.1 is still "todo" in the reader output, so dispatch re-picks 1.1.
  // We verify the tick ran, not the id choice.
  const second = await d.tick();
  assert.ok(second.dispatched, 'second tick dispatched something');
});

tAsync('tick skips when manager is busy', async () => {
  const d = makeDispatcher({ idleCheck: () => false });
  const r = await d.tick();
  assert.strictEqual(r.skipped, 'manager-busy');
});

tAsync('tick surfaces reader errors without throwing', async () => {
  const d = makeDispatcher({
    reader: () => { throw new Error('ENOENT'); },
  });
  const r = await d.tick();
  assert.strictEqual(r.skipped, 'todo-read-failed');
  assert.ok(/ENOENT/.test(r.error));
});

tAsync('tick pauses on unsafe pattern in picked todo', async () => {
  const d = makeDispatcher({
    reader: () =>
      '| 1.1 | dangerous work | todo | please rm -rf the tree |',
  });
  const r = await d.tick();
  assert.strictEqual(r.skipped, 'unsafe-pattern');
  assert.ok(d.paused);
  assert.ok(/unsafe/.test(d.pauseReason));
});

tAsync('tick returns no-eligible-todo when only done rows exist', async () => {
  const d = makeDispatcher({
    reader: () => '| 1.1 | shipped | done | nothing to do |',
  });
  const r = await d.tick();
  assert.strictEqual(r.skipped, 'no-eligible-todo');
});

// --- Circuit breaker ---------------------------------------------------

section('circuit breaker');

tAsync('three consecutive halts auto-pause the loop', async () => {
  const d = makeDispatcher();
  d.recordHalt('1.1', 'first halt');
  assert.ok(!d.paused, 'not paused after 1 halt');
  d.recordHalt('1.2', 'second halt');
  assert.ok(!d.paused, 'not paused after 2 halts');
  d.recordHalt('1.3', 'third halt');
  assert.ok(d.paused, 'paused after 3 halts');
  assert.ok(/circuit-breaker/.test(d.pauseReason));
});

t('recordSuccess resets the halt counter', () => {
  const d = makeDispatcher();
  d.recordHalt('1.1', 'halt');
  d.recordHalt('1.2', 'halt');
  assert.strictEqual(d.consecutiveHalts, 2);
  d.recordSuccess('1.2');
  assert.strictEqual(d.consecutiveHalts, 0);
});

t('resume clears the halt counter and pause state', () => {
  const d = makeDispatcher();
  d.pause('test');
  d.consecutiveHalts = 5;
  d.resume();
  assert.ok(!d.paused);
  assert.strictEqual(d.consecutiveHalts, 0);
});

// --- Notifier hooks (slack emit) --------------------------------------

section('notifier hooks');

tAsync('notifier sees auto_dispatch_sent on successful dispatch', async () => {
  const events = [];
  const d = makeDispatcher({
    notifier: (event, payload) => { events.push({ event, payload }); },
  });
  await d.tick();
  const sent = events.find((e) => e.event === 'auto_dispatch_sent');
  assert.ok(sent, 'auto_dispatch_sent fired');
  assert.strictEqual(sent.payload.id, '1.1');
});

tAsync('notifier sees auto_dispatch_paused when circuit breaker trips', async () => {
  const events = [];
  const d = makeDispatcher({
    notifier: (event, payload) => { events.push({ event, payload }); },
  });
  d.recordHalt('1.1', 'a');
  d.recordHalt('1.2', 'b');
  d.recordHalt('1.3', 'c');
  const paused = events.find((e) => e.event === 'auto_dispatch_paused');
  assert.ok(paused, 'auto_dispatch_paused fired');
  assert.ok(/circuit-breaker/.test(paused.payload.reason));
});

// --- pause / resume status --------------------------------------------

section('status contract');

t('getStatus reports the full control surface', () => {
  const d = makeDispatcher();
  const s = d.getStatus();
  assert.strictEqual(s.enabled, true);
  assert.strictEqual(s.paused, false);
  assert.strictEqual(s.consecutiveHalts, 0);
  assert.strictEqual(s.circuitThreshold, 3);
  assert.strictEqual(s.managerName, 'c4-mgr-auto');
  assert.strictEqual(s.lastDispatchAt, null);
  assert.strictEqual(s.lastDispatchId, null);
});

t('reload picks up new throttle and threshold', () => {
  const d = makeDispatcher();
  d.reload({ throttleMs: 7777, circuitThreshold: 5, managerName: 'mgr2' });
  assert.strictEqual(d.throttleMs, 7777);
  assert.strictEqual(d.circuitThreshold, 5);
  assert.strictEqual(d.managerName, 'mgr2');
});

// --- buildDispatchPrompt ----------------------------------------------

section('buildDispatchPrompt');

t('includes id, title, priority, and rules header', () => {
  const todo = {
    id: '8.28',
    title: 'Auto-dispatch',
    priority: 'urgent',
    detail: 'ship the loop',
    dependencies: [],
  };
  const s = buildDispatchPrompt(todo, { repoRoot: '/repo', branch: 'c4/auto-8-28' });
  assert.ok(/TODO id: 8.28/.test(s));
  assert.ok(/Title: Auto-dispatch/.test(s));
  assert.ok(/Priority: urgent/.test(s));
  assert.ok(/Repo: \/repo/.test(s));
  assert.ok(/Branch: c4\/auto-8-28/.test(s));
  assert.ok(/single-command only/.test(s));
});

t('emits dependencies line only when non-empty', () => {
  const empty = buildDispatchPrompt(
    { id: '1.1', title: 'x', priority: 'normal', detail: 'y', dependencies: [] },
    {}
  );
  assert.ok(!/Dependencies:/.test(empty));
  const hasDeps = buildDispatchPrompt(
    { id: '1.1', title: 'x', priority: 'normal', detail: 'y', dependencies: ['1.0', '0.9'] },
    {}
  );
  assert.ok(/Dependencies: 1.0, 0.9/.test(hasDeps));
});

// --- smoke test against the real TODO.md ------------------------------

section('smoke against real TODO.md');

t('parses the in-repo TODO.md and surfaces 8.28 as a known todo', () => {
  const file = path.join(__dirname, '..', 'TODO.md');
  if (!fs.existsSync(file)) return; // optional; smoke when file is present
  const md = fs.readFileSync(file, 'utf8');
  const rows = parseTodos(md);
  // At least the dozens of done rows plus the current todos must parse.
  assert.ok(rows.length > 20, 'parsed a meaningful number of rows: ' + rows.length);
  const ids = rows.map((r) => r.id);
  assert.ok(ids.includes('8.28'), 'TODO 8.28 must be present');
});

// --- (8.29) Reviewer lightweight oversight -----------------------------

section('8.29 reviewer escalations');

t('detectSecuritySensitive matches auth/secret/credential keywords', () => {
  const fn = mod.detectSecuritySensitive;
  assert.strictEqual(fn('Add new auth endpoint'), 'auth');
  assert.strictEqual(fn('Rotate secret token'), 'secret');
  assert.strictEqual(fn('Update RBAC matrix'), 'rbac');
  assert.strictEqual(fn('Add bot credential cache'), 'credential');
  assert.strictEqual(fn('Refactor button colors'), null);
});

t('recordEscalation appends entry with auto-id', () => {
  const d = new AutoDispatcher({ todoPath: '/x' });
  const e1 = d.recordEscalation({ todoId: '8.29', reason: 'test', kind: 'general' });
  const e2 = d.recordEscalation({ todoId: '8.29', reason: 'test2', kind: 'general' });
  assert.strictEqual(e1.id, 1);
  assert.strictEqual(e2.id, 2);
  assert.strictEqual(d.escalations.length, 2);
  assert.strictEqual(e1.status, 'pending');
});

t('listEscalations filters by status and kind', () => {
  const d = new AutoDispatcher({ todoPath: '/x' });
  d.recordEscalation({ todoId: 'a', kind: 'halt-streak' });
  d.recordEscalation({ todoId: 'b', kind: 'security-sensitive' });
  d.resolveEscalation(1, 'approve');
  const pend = d.listEscalations({ status: 'pending' });
  assert.strictEqual(pend.length, 1);
  assert.strictEqual(pend[0].kind, 'security-sensitive');
  const halt = d.listEscalations({ kind: 'halt-streak' });
  assert.strictEqual(halt.length, 1);
  assert.strictEqual(halt[0].status, 'resolved');
});

t('resolveEscalation marks status resolved with action + note', () => {
  const d = new AutoDispatcher({ todoPath: '/x' });
  d.recordEscalation({ todoId: '8.29' });
  const r = d.resolveEscalation(1, 'reject', 'too risky');
  assert.strictEqual(r.status, 'resolved');
  assert.strictEqual(r.resolvedAction, 'reject');
  assert.strictEqual(r.resolvedNote, 'too risky');
  // Resolving again is a no-op (returns the already-resolved record)
  const again = d.resolveEscalation(1, 'approve');
  assert.strictEqual(again.resolvedAction, 'reject');
});

t('resolveEscalation returns null for unknown id', () => {
  const d = new AutoDispatcher({ todoPath: '/x' });
  assert.strictEqual(d.resolveEscalation(999, 'approve'), null);
});

t('soft halt threshold emits escalation but does not pause', () => {
  const d = new AutoDispatcher({
    todoPath: '/x',
    softHaltThreshold: 2,
    circuitThreshold: 3,
  });
  d.lastDispatchId = '5.1';
  d.recordHalt('5.1', 'first halt');
  assert.strictEqual(d.escalations.length, 0);
  assert.strictEqual(d.paused, false);
  d.recordHalt('5.1', 'second halt');
  assert.strictEqual(d.escalations.length, 1);
  assert.strictEqual(d.escalations[0].kind, 'halt-streak');
  assert.strictEqual(d.paused, false);
  d.recordHalt('5.1', 'third halt');
  // Still emits escalation? No — third halt hits circuit, pauses
  assert.strictEqual(d.paused, true);
});

t('security-sensitive todo escalates, throttles, does not dispatch', async () => {
  const todo = '| 9.1 | Add auth endpoint | todo | configure new login flow |';
  let dispatchCalls = 0;
  const d = new AutoDispatcher({
    todoPath: '/x',
    reader: () => todo,
    dispatch: () => { dispatchCalls++; return { ok: true }; },
    idleCheck: () => true,
    throttleMs: 1,
  });
  const result = await d.tick();
  assert.strictEqual(result.skipped, 'security-escalation');
  assert.strictEqual(result.id, '9.1');
  assert.strictEqual(result.keyword, 'auth');
  assert.strictEqual(dispatchCalls, 0);
  assert.strictEqual(d.listEscalations({ status: 'pending' }).length, 1);
});

t('digest aggregates dispatch stats over window', () => {
  const baseTime = 1_700_000_000_000;
  let now = baseTime;
  const d = new AutoDispatcher({ todoPath: '/x', clock: () => now });
  d.lastDispatchId = '1.1';
  // dispatch + success at t0
  d._append({ type: 'dispatch', id: '1.1', at: now });
  d._append({ type: 'success', id: '1.1', at: now });
  // dispatch + halt at t1 (still in window)
  now += 1000;
  d._append({ type: 'dispatch', id: '1.2', at: now });
  d._append({ type: 'halt', id: '1.2', at: now });
  // OLD entry outside window
  const old = baseTime - 25 * 3600 * 1000;
  d._append({ type: 'dispatch', id: '0.1', at: old });
  d._append({ type: 'success', id: '0.1', at: old });

  const dig = d.digest();
  assert.strictEqual(dig.dispatched, 2);
  assert.strictEqual(dig.succeeded, 1);
  assert.strictEqual(dig.halted, 1);
  assert.strictEqual(dig.successRate, 0.5);
});

t('escalations cap trims oldest entries', () => {
  const d = new AutoDispatcher({ todoPath: '/x', escalationCap: 3 });
  for (let i = 0; i < 10; i++) {
    d.recordEscalation({ todoId: 'x' + i, reason: 'r' });
  }
  assert.strictEqual(d.escalations.length, 3);
  // Tail is preserved; oldest dropped
  assert.strictEqual(d.escalations[0].id, 8);
  assert.strictEqual(d.escalations[2].id, 10);
});

// --- (v1.11.95 / TODO 11.77) Webhook notifier wiring ------------------
//
// Integration check: the autonomous loop must hand a sendWebhook-style
// adapter the matching `kind` (dispatch / halt / escalation / complete)
// when the AutoDispatcher emits its native events. This mirrors the
// daemon.js wiring (`_sendLifecycle` in _buildAutoDispatcher) without
// requiring daemon.js itself — the goal is to lock in the event-name
// translation table so a future rename here can't silently desync.

section('webhook notifier wiring (11.77)');

function makeWiredDispatcher(overrides) {
  const fired = [];
  // Recreate the daemon.js translation: auto_dispatch_sent -> dispatch,
  // auto_dispatch_paused -> halt, auto_dispatch_escalation -> escalation.
  const adapter = (event, payload) => {
    if (event === 'auto_dispatch_sent') {
      fired.push({ kind: 'dispatch', payload });
    } else if (event === 'auto_dispatch_paused') {
      fired.push({ kind: 'halt', payload });
    } else if (event === 'auto_dispatch_escalation') {
      fired.push({ kind: 'escalation', payload });
    }
  };
  const base = {
    todoPath: 'TODO.md',
    enabled: true,
    throttleMs: 1000,
    circuitThreshold: 3,
    softHaltThreshold: 2,
    clock: () => 100000,
    reader: () => '| 1.1 | task | todo | safe plain detail |',
    idleCheck: () => true,
    dispatch: async () => ({ ok: true }),
    notifier: adapter,
  };
  return { dispatcher: new AutoDispatcher(Object.assign(base, overrides || {})), fired };
}

tAsync('webhook adapter sees dispatch kind on tick', async () => {
  const { dispatcher, fired } = makeWiredDispatcher();
  await dispatcher.tick();
  const dispatch = fired.filter((e) => e.kind === 'dispatch');
  assert.strictEqual(dispatch.length, 1);
  assert.strictEqual(dispatch[0].payload.id, '1.1');
});

tAsync('webhook adapter sees halt kind on circuit-breaker trip', async () => {
  const { dispatcher, fired } = makeWiredDispatcher();
  dispatcher.recordHalt('1.1', 'a');
  dispatcher.recordHalt('1.2', 'b');
  dispatcher.recordHalt('1.3', 'c');
  const halt = fired.filter((e) => e.kind === 'halt');
  assert.strictEqual(halt.length, 1);
  assert.ok(/circuit-breaker/.test(halt[0].payload.reason));
});

t('webhook adapter sees escalation kind on soft halt threshold', () => {
  const { dispatcher, fired } = makeWiredDispatcher();
  dispatcher.lastDispatchId = '7.7';
  dispatcher.recordHalt('7.7', 'first halt');
  // first halt under softHaltThreshold (2) -> no escalation
  assert.strictEqual(fired.filter((e) => e.kind === 'escalation').length, 0);
  dispatcher.recordHalt('7.7', 'second halt');
  // second halt -> soft threshold -> escalation
  const esc = fired.filter((e) => e.kind === 'escalation');
  assert.strictEqual(esc.length, 1);
  assert.strictEqual(esc[0].payload.kind, 'halt-streak');
});

t('webhook adapter does not see complete kind from AutoDispatcher (manager SSE owns it)', () => {
  // The dispatcher itself never emits a "complete" event; the daemon's
  // manager SSE listener (`task_complete` for the autonomous manager)
  // owns that path. recordSuccess() is the dispatcher-side hook but
  // emits no notifier event - it just resets the halt counter. We
  // assert the no-emit shape here so a future drift (e.g. adding a
  // success notifier event) doesn't accidentally double-fire complete.
  const { dispatcher, fired } = makeWiredDispatcher();
  dispatcher.lastDispatchId = '1.1';
  dispatcher.recordSuccess('1.1');
  assert.strictEqual(fired.length, 0);
});

tAsync('webhook adapter integration: drive sendWebhook for each kind', async () => {
  // Lock in the wiring end-to-end: notifier callback -> sendWebhook
  // with the right kind argument and a payload-shaped body for both
  // Slack and Discord.
  const notify = require('../src/notify');
  const calls = [];
  function _request(reqOpts, responseCb) {
    let body = '';
    return {
      write(chunk) { body += chunk; },
      end() {
        calls.push({
          hostname: reqOpts.hostname,
          body: JSON.parse(body),
        });
        if (typeof responseCb === 'function') {
          responseCb({ statusCode: 200, resume() {} });
        }
      },
      on() {},
    };
  }
  const config = {
    notifications: {
      slack: 'https://hooks.slack.com/services/T/B/X',
      discord: 'https://discord.com/api/webhooks/1/abc',
      events: ['halt', 'dispatch', 'complete', 'escalation'],
    },
  };
  const adapter = (event, payload) => {
    let kind = null;
    if (event === 'auto_dispatch_sent') kind = 'dispatch';
    else if (event === 'auto_dispatch_paused') kind = 'halt';
    else if (event === 'auto_dispatch_escalation') kind = 'escalation';
    if (!kind) return;
    notify.sendWebhook({
      kind,
      payload: { worker: 'auto-mgr', todo: { id: payload.id || payload.todoId, title: payload.title || payload.kind } },
      config,
      _request,
      env: {},
    });
  };
  const d = new AutoDispatcher({
    todoPath: '/x',
    enabled: true,
    throttleMs: 1,
    circuitThreshold: 3,
    softHaltThreshold: 2,
    clock: () => 1,
    reader: () => '| 1.1 | drive dispatch | todo | safe detail |',
    idleCheck: () => true,
    dispatch: async () => ({ ok: true }),
    notifier: adapter,
  });
  await d.tick();
  d.lastDispatchId = '1.1';
  d.recordHalt('1.1', 'h1');
  d.recordHalt('1.1', 'h2'); // escalation
  d.recordHalt('1.1', 'h3'); // halt (circuit)
  // Each kind should have fired both Slack and Discord = 3 kinds * 2 = 6 calls.
  assert.strictEqual(calls.length, 6);
  const hostnames = calls.map((c) => c.hostname);
  assert.deepStrictEqual(
    hostnames,
    [
      'hooks.slack.com', 'discord.com',
      'hooks.slack.com', 'discord.com',
      'hooks.slack.com', 'discord.com',
    ]
  );
  // Body shapes
  for (let i = 0; i < calls.length; i += 2) {
    assert.ok(typeof calls[i].body.text === 'string', 'slack body has text field');
    assert.ok(typeof calls[i + 1].body.content === 'string', 'discord body has content field');
  }
  // dispatch / escalation / halt summaries appear in order
  assert.ok(/dispatch/.test(calls[0].body.text));
  assert.ok(/escalation/.test(calls[2].body.text));
  assert.ok(/halt/.test(calls[4].body.text));
});

// --- run buffered tests in order --------------------------------------

(async () => {
  for (const fn of pending) {
    await fn();
  }
  console.log('\n' + '='.repeat(50));
  console.log('auto-dispatch.test.js: ' + passed + ' passed, ' + failed + ' failed');
  if (failed > 0) process.exit(1);
})();
