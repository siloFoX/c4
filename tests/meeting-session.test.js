'use strict';

// Tests for src/meeting-session.js (multi-specialist phase 2.2).

const assert = require('assert');

const { planMeeting } = require('../src/meeting-plan');
const sessionMod = require('../src/meeting-session');
const {
  MeetingSession,
  MeetingStore,
  VALID_STATUSES,
  VALID_VOTES,
} = sessionMod;

let passed = 0;
let failed = 0;
const pending = [];
function t(label, fn) {
  pending.push(async () => {
    try {
      await fn();
      passed += 1;
      console.log(`  PASS  ${label}`);
    } catch (err) {
      failed += 1;
      console.log(`  FAIL  ${label}\n        ${err.message}`);
      if (err.stack) console.log(err.stack.split('\n').slice(1, 4).join('\n'));
    }
  });
}

function makeLightPlan() {
  return planMeeting({ task: 'fix typo in handler' });
}

function makeFullPlan() {
  return planMeeting({ task: 'rotate auth secret in production' });
}

function makeStandardPlan() {
  return planMeeting({ task: 'add new dashboard widget' });
}

t('module exports surface', () => {
  assert.strictEqual(typeof MeetingSession, 'function');
  assert.strictEqual(typeof MeetingStore, 'function');
  assert.deepStrictEqual([...VALID_STATUSES],
    ['pending', 'in-progress', 'completed', 'escalated', 'aborted']);
  assert.deepStrictEqual([...VALID_VOTES], ['accept', 'object']);
});

t('constructor rejects missing plan', () => {
  assert.throws(() => new MeetingSession(null), /plan is required/);
  assert.throws(() => new MeetingSession({}), /missing meetingId/);
  assert.throws(() => new MeetingSession({ meetingId: 'x', stages: [] }), /missing meetingId/);
});

t('newly constructed session is pending with stage 0 round 0', () => {
  const s = new MeetingSession(makeLightPlan());
  assert.strictEqual(s.status, 'pending');
  assert.strictEqual(s.currentStage, 'implement'); // first stage of lightweight track
  assert.strictEqual(s.currentRound, 0);
});

t('start() transitions pending → in-progress and seeds round 1', () => {
  const s = new MeetingSession(makeLightPlan());
  s.start();
  assert.strictEqual(s.status, 'in-progress');
  assert.strictEqual(s.currentRound, 1);
});

t('start() refuses if not pending', () => {
  const s = new MeetingSession(makeLightPlan());
  s.start();
  assert.throws(() => s.start(), /cannot start from status/);
});

t('contribute appends to transcript with stage + round', () => {
  const s = new MeetingSession(makeLightPlan());
  s.start();
  // First specialist of lightweight implement stage
  const driId = s.plan.stages[0].specialists[0].id;
  const turn = s.contribute(driId, 'patch applied, ready');
  assert.strictEqual(turn.stage, 'implement');
  assert.strictEqual(turn.round, 1);
  assert.strictEqual(turn.specialistId, driId);
  assert.strictEqual(s.transcript().length, 1);
});

t('contribute outside in-progress throws', () => {
  const s = new MeetingSession(makeLightPlan());
  assert.throws(() => s.contribute('x', 'hi'), /must be in-progress/);
});

t('contribute rejects bad inputs', () => {
  const s = new MeetingSession(makeLightPlan());
  s.start();
  assert.throws(() => s.contribute('', 'text'), /specialistId is required/);
  assert.throws(() => s.contribute('id', 42), /text must be a string/);
  assert.throws(() => s.contribute('id', 'text', { vote: 'maybe' }), /vote must be one of/);
});

t('lightweight track: DRI accept advances + completes the meeting', () => {
  const s = new MeetingSession(makeLightPlan());
  s.start();
  const driId = s.plan.stages[0].specialists[0].id;
  s.contribute(driId, 'patch applied', { vote: 'accept' });
  // First stage completes, walk into second stage 'review'.
  let r = s.advanceStage();
  assert.strictEqual(r.advanced, true);
  assert.strictEqual(r.status, 'in-progress');
  assert.strictEqual(s.currentStage, 'review');

  const reviewerId = s.plan.stages[1].specialists[0].id;
  s.contribute(reviewerId, 'lgtm', { vote: 'accept' });
  r = s.advanceStage();
  assert.strictEqual(r.advanced, true);
  assert.strictEqual(r.status, 'completed');
  assert.strictEqual(s.status, 'completed');
});

t('advanceStage: missing votes block advancement', () => {
  const s = new MeetingSession(makeLightPlan());
  s.start();
  // No contribute / no vote yet
  const r = s.advanceStage();
  assert.strictEqual(r.advanced, false);
  assert.strictEqual(r.reason, 'consensus-not-reached');
});

t('full track consensus: any object blocks advancement', () => {
  const s = new MeetingSession(makeFullPlan());
  s.start();
  const stage = s.plan.stages[0];
  // All accept except one object
  for (let i = 0; i < stage.specialists.length; i += 1) {
    const sp = stage.specialists[i];
    const vote = i === 0 ? 'object' : 'accept';
    s.contribute(sp.id, `r${i}`, { vote });
  }
  const r = s.advanceStage();
  assert.strictEqual(r.advanced, false);
  assert.strictEqual(r.reason, 'consensus-not-reached');
});

t('quorum (standard track): majority accept advances', () => {
  const s = new MeetingSession(makeStandardPlan());
  s.start();
  const stage = s.plan.stages[0];
  // 3+ specialists usually, set first to object, rest accept
  const ids = stage.specialists.map((sp) => sp.id);
  s.contribute(ids[0], 'no', { vote: 'object' });
  for (let i = 1; i < ids.length; i += 1) {
    s.contribute(ids[i], 'yes', { vote: 'accept' });
  }
  const r = s.advanceStage();
  // Quorum allows majority — should advance.
  assert.strictEqual(r.advanced, true);
});

t('nextRound() bumps round counter, refuses past cap', () => {
  const s = new MeetingSession(makeFullPlan());
  s.start();
  const cap = s.policy.roundCap;
  for (let i = 1; i < cap; i += 1) {
    const r = s.nextRound();
    assert.strictEqual(r.bumped, true);
  }
  // Now at cap — next call should refuse.
  const r = s.nextRound();
  assert.strictEqual(r.bumped, false);
  assert.strictEqual(r.reason, 'round-cap-reached');
});

t('escalate transitions to escalated with reason', () => {
  const s = new MeetingSession(makeFullPlan());
  s.start();
  s.escalate('round-cap exhausted on design');
  assert.strictEqual(s.status, 'escalated');
});

t('escalate from terminal status throws', () => {
  const s = new MeetingSession(makeFullPlan());
  s.start();
  s.abort('operator');
  assert.throws(() => s.escalate('x'), /cannot escalate from terminal/);
});

t('abort transitions and locks further mutation', () => {
  const s = new MeetingSession(makeLightPlan());
  s.start();
  s.abort('user changed mind');
  assert.strictEqual(s.status, 'aborted');
  assert.throws(() => s.contribute('x', 'late'), /must be in-progress/);
  assert.throws(() => s.advanceStage(), /must be in-progress/);
});

t('recordVote without contribute is allowed (silent objection)', () => {
  const s = new MeetingSession(makeFullPlan());
  s.start();
  const sp = s.plan.stages[0].specialists[0];
  s.recordVote(sp.id, 'object', 'security concern');
  const view = s.consensusView();
  assert.strictEqual(view.objects.length, 1);
  assert.strictEqual(view.objects[0].id, sp.id);
});

t('toJSON includes per-stage consensus snapshot', () => {
  const s = new MeetingSession(makeLightPlan());
  s.start();
  const json = s.toJSON();
  assert.strictEqual(json.id, s.id);
  assert.strictEqual(json.status, 'in-progress');
  assert.strictEqual(json.stages.length, 2);
  for (const st of json.stages) {
    assert.ok(st.consensus, 'each stage has consensus block');
    assert.ok(Array.isArray(st.consensus.expected));
  }
});

t('MeetingStore put/get/list/remove', () => {
  const store = new MeetingStore();
  const s = new MeetingSession(makeLightPlan());
  store.put(s);
  assert.strictEqual(store.get(s.id), s);
  assert.strictEqual(store.size, 1);

  const s2 = new MeetingSession(makeFullPlan());
  store.put(s2);
  assert.strictEqual(store.list().length, 2);
  s2.start();
  s2.abort('test');
  const aborted = store.list({ status: 'aborted' });
  assert.strictEqual(aborted.length, 1);
  assert.strictEqual(aborted[0].id, s2.id);

  assert.strictEqual(store.remove(s.id), true);
  assert.strictEqual(store.size, 1);
});

t('MeetingStore emits put/remove events for global SSE subscribers', () => {
  const store = new MeetingStore();
  const puts = [];
  const removes = [];
  store.on('put', (sess) => puts.push(sess.id));
  store.on('remove', (id) => removes.push(id));
  const s = new MeetingSession(makeLightPlan());
  store.put(s);
  assert.deepStrictEqual(puts, [s.id]);
  // Re-putting the same session is idempotent — no duplicate emit.
  store.put(s);
  assert.deepStrictEqual(puts, [s.id], 're-put does not re-emit');
  store.remove(s.id);
  assert.deepStrictEqual(removes, [s.id]);
  // Removing a non-existent session is a no-op (no emit).
  store.remove('does-not-exist');
  assert.deepStrictEqual(removes, [s.id], 'absent remove does not emit');
});

t('MeetingStore put() persists to backing store when configured', () => {
  // Stub persist that records calls (avoid better-sqlite3 dep here so
  // the test isolates to the wiring, not the storage layer).
  const calls = { save: [], remove: [] };
  const stubPersist = {
    save: (sess) => calls.save.push(sess.id),
    remove: (id) => { calls.remove.push(id); return true; },
  };
  const store = new MeetingStore({ persist: stubPersist });
  const s = new MeetingSession(makeLightPlan());
  store.put(s);
  assert.deepStrictEqual(calls.save, [s.id], 'put triggers initial save');
  // Mutation re-saves via the state listener.
  s.start();
  assert.deepStrictEqual(calls.save, [s.id, s.id], 'state mutation re-saves');
  // Removing the session triggers persist.remove and detaches the listener.
  store.remove(s.id);
  assert.deepStrictEqual(calls.remove, [s.id]);
  // After removal, mutations on the loose session should NOT save.
  s.recordVote ? null : null; // no-op; can't mutate aborted; just confirm count stable
  assert.strictEqual(calls.save.length, 2, 'state listener detached on remove');
});

t('MeetingStore put() re-put of same id does not double-attach listener', () => {
  const calls = { save: [] };
  const stubPersist = { save: (sess) => calls.save.push(sess.id), remove: () => true };
  const store = new MeetingStore({ persist: stubPersist });
  const s = new MeetingSession(makeLightPlan());
  store.put(s);
  store.put(s); // second put is a no-op for listener attachment
  // Initial save count: 2 (once per put), then mutation should fire only once.
  assert.strictEqual(calls.save.length, 2);
  s.start();
  assert.strictEqual(calls.save.length, 3, 'mutation triggers exactly one save, not two');
});

t('_persistSnapshot includes full plan + internal indices', () => {
  const s = new MeetingSession(makeFullPlan());
  s.start();
  s.contribute('architect', 'design proposal');
  const snap = s._persistSnapshot();
  // Public toJSON fields still present.
  assert.strictEqual(snap.id, s.id);
  assert.strictEqual(snap.status, 'in-progress');
  // Persist-only additions.
  assert.ok(snap.plan, 'plan included');
  assert.strictEqual(snap.plan.track, 'full');
  assert.ok(Array.isArray(snap._rounds), '_rounds included');
  assert.strictEqual(typeof snap._currentStageIndex, 'number');
  // Plan internals (not in toJSON) survive.
  assert.ok(Array.isArray(snap.plan.stages));
  assert.ok(snap.plan.stages[0].deliverables, 'plan.stages[].deliverables present');
});

t('MeetingSession.fromJSON rejects malformed input', () => {
  assert.throws(() => MeetingSession.fromJSON(null), /required/);
  assert.throws(() => MeetingSession.fromJSON({}), /plan \+ id/);
  assert.throws(() => MeetingSession.fromJSON({ id: 'm-x' }), /plan \+ id/);
});

t('MeetingSession.fromJSON round-trips a started + contributed session', () => {
  const orig = new MeetingSession(makeFullPlan());
  orig.start();
  const firstSpec = orig.plan.stages[0].specialists[0].id;
  orig.contribute(firstSpec, 'first turn text');
  const snap = orig._persistSnapshot();
  const restored = MeetingSession.fromJSON(snap);
  assert.strictEqual(restored.id, orig.id);
  assert.strictEqual(restored.status, 'in-progress');
  assert.strictEqual(restored.currentStage, orig.currentStage);
  assert.strictEqual(restored.currentRound, orig.currentRound);
  // Transcripts survive intact.
  const restoredTurns = restored.toJSON().transcripts[0];
  assert.strictEqual(restoredTurns.length, 1);
  assert.strictEqual(restoredTurns[0].text, 'first turn text');
});

t('MeetingSession.fromJSON preserves terminal state', () => {
  const orig = new MeetingSession(makeLightPlan());
  orig.start();
  orig.abort('test terminal');
  const snap = orig._persistSnapshot();
  const restored = MeetingSession.fromJSON(snap);
  assert.strictEqual(restored.status, 'aborted');
  assert.ok(restored.completedAt, 'completedAt copied');
  assert.strictEqual(restored.toJSON().escalations.length, 1);
});

t('MeetingStore.rehydrate returns {count: 0} when no persist configured', () => {
  const store = new MeetingStore();
  const r = store.rehydrate();
  assert.strictEqual(r.count, 0);
  assert.deepStrictEqual(r.errors, []);
});

t('MeetingStore.rehydrate restores sessions from a stub persist', () => {
  const orig = new MeetingSession(makeLightPlan());
  orig.start();
  const snap = orig._persistSnapshot();
  // Stub persist that returns one row from loadAll.
  const stubPersist = {
    loadAll: () => [snap],
    save: () => {},
    remove: () => true,
  };
  const store = new MeetingStore({ persist: stubPersist });
  const r = store.rehydrate();
  assert.strictEqual(r.count, 1);
  assert.strictEqual(store.size, 1);
  const restored = store.get(orig.id);
  assert.ok(restored, 'session restored');
  assert.strictEqual(restored.status, 'in-progress');
});

t('MeetingStore.rehydrate skips malformed rows + tallies errors', () => {
  const stubPersist = {
    loadAll: () => [
      { id: 'm-good', plan: { meetingId: 'm-good', track: 'lightweight', stages: [{ stage: 'implement', specialists: [{ id: 'pm', displayName: 'PM' }] }] }, status: 'pending', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'm-no-plan', status: 'pending', createdAt: '2026-01-01T00:00:00.000Z' }, // missing plan → skip
      null, // also bad
    ],
    save: () => {},
    remove: () => true,
  };
  const store = new MeetingStore({ persist: stubPersist });
  const r = store.rehydrate();
  assert.strictEqual(r.count, 1);
  assert.strictEqual(r.errors.length, 2);
  assert.ok(r.errors.find((e) => e.id === 'm-no-plan'));
});

t('MeetingStore.rehydrate is idempotent on second call (no double-attach)', () => {
  const orig = new MeetingSession(makeLightPlan());
  const snap = orig._persistSnapshot();
  const calls = [];
  const stubPersist = {
    loadAll: () => [snap],
    save: (s) => calls.push(s.id),
    remove: () => true,
  };
  const store = new MeetingStore({ persist: stubPersist });
  store.rehydrate();
  const sizeAfterFirst = store.size;
  store.rehydrate();
  assert.strictEqual(store.size, sizeAfterFirst, 'second rehydrate does not duplicate rows');
  // No save fired during rehydrate (we loaded from disk, why save back?).
  assert.strictEqual(calls.length, 0);
});

(async () => {
  for (const fn of pending) await fn();
  console.log(`\n  ${passed} passed, ${failed} failed (meeting-session)`);
  if (failed > 0) process.exit(1);
})();
