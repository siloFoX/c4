'use strict';

// Tests for src/meeting-fork.js (multi-specialist phase 6.3).

const assert = require('assert');

const { planMeeting } = require('../src/meeting-plan');
const { MeetingSession, MeetingStore, resetShared } = require('../src/meeting-session');
const { SpecialistRegistry } = require('../src/specialist-registry');
const { forkMeeting, VALID_MODES } = require('../src/meeting-fork');

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

function freshStoreWithSession({ task = 'integrate the foo widget', track = 'lightweight', title } = {}) {
  resetShared();
  const reg = new SpecialistRegistry({ persistPath: null });
  const store = new MeetingStore();
  const plan = planMeeting({ task, track, title, registry: reg });
  const sess = new MeetingSession(plan);
  store.put(sess);
  return { store, reg, sess };
}

t('module exports surface', () => {
  assert.strictEqual(typeof forkMeeting, 'function');
  assert.deepStrictEqual(VALID_MODES, ['replan', 'reuse']);
});

t('rejects missing sourceId', () => {
  assert.throws(() => forkMeeting(), /sourceId is required/);
  assert.throws(() => forkMeeting(''), /sourceId is required/);
});

t('rejects unknown mode', () => {
  const { store, sess } = freshStoreWithSession();
  assert.throws(
    () => forkMeeting(sess.id, { mode: 'wat', store }),
    /mode must be one of/
  );
});

t('rejects when source meeting not in store', () => {
  resetShared();
  const store = new MeetingStore();
  assert.throws(
    () => forkMeeting('m-nonexistent', { store }),
    /not found/
  );
});

t('replan: new meetingId, new pending status, forkOf points at source', () => {
  const { store, sess, reg } = freshStoreWithSession({ task: 'fix login redirect bug' });
  const before = store.size;
  const out = forkMeeting(sess.id, { store, registry: reg });
  assert.notStrictEqual(out.id, sess.id);
  assert.strictEqual(out.status, 'pending');
  assert.strictEqual(out.task, sess.plan.task, 'replan keeps task when no override');
  assert.strictEqual(out.forkOf, sess.id, 'toJSON exposes forkOf on the new session');
  assert.strictEqual(store.size, before + 1, 'new session added to store');
  // forkOf also lives on the underlying plan object.
  const newSess = store.get(out.id);
  assert.strictEqual(newSess.plan.forkOf, sess.id);
  // Source session never has forkOf set.
  assert.strictEqual(sess.toJSON().forkOf, null);
});

t('replan: task/track/title overrides honoured', () => {
  const { store, sess, reg } = freshStoreWithSession({ task: 'original', track: 'lightweight' });
  const out = forkMeeting(sess.id, {
    store,
    registry: reg,
    task: 'sharper restated task',
    title: 'Take 2',
  });
  assert.strictEqual(out.task, 'sharper restated task');
  assert.strictEqual(out.title, 'Take 2');
});

t('reuse: deep-clones plan, same roster, new meetingId', () => {
  const { store, sess } = freshStoreWithSession({ task: 'roster-stable fork' });
  const out = forkMeeting(sess.id, { store, mode: 'reuse' });
  assert.notStrictEqual(out.id, sess.id);
  assert.strictEqual(out.status, 'pending');
  // Same stage list including same specialists per stage.
  const srcStages = sess.plan.stages;
  const newSess = store.get(out.id);
  const newStages = newSess.plan.stages;
  assert.strictEqual(newStages.length, srcStages.length);
  for (let i = 0; i < srcStages.length; i += 1) {
    assert.deepStrictEqual(
      newStages[i].specialists.map((s) => s.id).sort(),
      srcStages[i].specialists.map((s) => s.id).sort(),
      `stage ${i} roster preserved`,
    );
  }
  assert.strictEqual(newSess.plan.forkOf, sess.id);
});

t('reuse: task override mutates new plan only, not source', () => {
  const { store, sess } = freshStoreWithSession({ task: 'source task' });
  const out = forkMeeting(sess.id, {
    store, mode: 'reuse', task: 'forked-with-new-question',
  });
  assert.strictEqual(out.task, 'forked-with-new-question');
  // Source unchanged.
  assert.strictEqual(sess.plan.task, 'source task');
});

t('forking a forked meeting works (chained lineage)', () => {
  const { store, sess, reg } = freshStoreWithSession({ task: 'first attempt' });
  const fork1 = forkMeeting(sess.id, { store, registry: reg });
  const fork2 = forkMeeting(fork1.id, { store, registry: reg });
  // Chain is each fork pointing at its immediate parent — not transitive.
  assert.strictEqual(store.get(fork1.id).plan.forkOf, sess.id);
  assert.strictEqual(store.get(fork2.id).plan.forkOf, fork1.id);
});

t('lineage walks forkOf chain to the root', () => {
  // Replicates the daemon-side walk so we don't need an HTTP fixture
  // to verify the chain logic. (Daemon delegates to the same
  // store.get(forkOf) loop.)
  const { store, sess, reg } = freshStoreWithSession({ task: 'gen 0' });
  const f1 = forkMeeting(sess.id, { store, registry: reg });
  const f2 = forkMeeting(f1.id, { store, registry: reg });
  const f3 = forkMeeting(f2.id, { store, registry: reg });
  // Walk forward from f3 → f2 → f1 → sess (no forkOf).
  const chain = [];
  let cursor = store.get(f3.id);
  while (cursor) {
    chain.push(cursor.id);
    const fk = cursor.plan.forkOf;
    if (!fk) break;
    cursor = store.get(fk);
  }
  assert.deepStrictEqual(chain, [f3.id, f2.id, f1.id, sess.id]);
  assert.strictEqual(store.get(sess.id).plan.forkOf, undefined, 'root has no forkOf');
});

t('lineage truncates gracefully when an ancestor is purged', () => {
  const { store, sess, reg } = freshStoreWithSession({ task: 'gen 0 will be purged' });
  const f1 = forkMeeting(sess.id, { store, registry: reg });
  const f2 = forkMeeting(f1.id, { store, registry: reg });
  // Operator removed the original; chain from f2 should now stop at f1.
  store.remove(sess.id);
  const chain = [];
  let cursor = store.get(f2.id);
  while (cursor) {
    chain.push(cursor.id);
    const fk = cursor.plan.forkOf;
    if (!fk) break;
    cursor = store.get(fk);
  }
  assert.deepStrictEqual(chain, [f2.id, f1.id], 'chain stops at the deepest still-resolvable ancestor');
  // Last entry's forkOf is set even though we couldn't resolve it.
  assert.strictEqual(store.get(f1.id).plan.forkOf, sess.id, 'forkOf pointer survives purge of the source');
});

(async () => {
  for (const fn of pending) await fn();
  console.log(`\n  ${passed} passed, ${failed} failed (meeting-fork)`);
  if (failed > 0) process.exit(1);
})();
