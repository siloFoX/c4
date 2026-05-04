'use strict';

// Tests for src/meeting-persist.js (multi-specialist phase 7.1).

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { MeetingPersist } = require('../src/meeting-persist');
const { planMeeting } = require('../src/meeting-plan');
const { MeetingSession } = require('../src/meeting-session');
const { SpecialistRegistry } = require('../src/specialist-registry');

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

function mkDb() {
  // :memory: keeps every test isolated and fast. The disk-backed
  // path is exercised once below.
  return new MeetingPersist({ dbPath: ':memory:' });
}

function mkSession(taskOverride) {
  const reg = new SpecialistRegistry({ persistPath: null });
  const plan = planMeeting({
    task: taskOverride || 'persist round-trip',
    track: 'lightweight',
    registry: reg,
  });
  return new MeetingSession(plan);
}

t('module surface', () => {
  assert.strictEqual(typeof MeetingPersist, 'function');
});

t('opens an in-memory DB and starts empty', () => {
  const p = mkDb();
  assert.strictEqual(p.count(), 0);
  assert.deepStrictEqual(p.loadAll(), []);
  assert.strictEqual(p.load('m-nope'), null);
  p.close();
});

t('save() rejects malformed sessions', () => {
  const p = mkDb();
  assert.throws(() => p.save(null), /required/);
  assert.throws(() => p.save({}), /id/);
  assert.throws(() => p.save({ id: 'x' }), /status/);
  assert.throws(() => p.save({ id: 'x', status: 'pending' }), /createdAt/);
  p.close();
});

t('save() then load() round-trips a pending session', () => {
  const p = mkDb();
  const sess = mkSession('round-trip basic');
  p.save(sess);
  assert.strictEqual(p.count(), 1);
  const loaded = p.load(sess.id);
  assert.ok(loaded, 'loaded entry should exist');
  assert.strictEqual(loaded.id, sess.id);
  assert.strictEqual(loaded.status, 'pending');
  assert.strictEqual(loaded.task, 'round-trip basic');
  // toJSON includes the full plan stages snapshot — verify shape.
  assert.ok(Array.isArray(loaded.stages));
  assert.ok(loaded.stages.length > 0);
  p.close();
});

t('save() upserts on the same id (no duplicate rows)', () => {
  const p = mkDb();
  const sess = mkSession('upsert test');
  p.save(sess);
  // Mutate the session — start it and abort it — then re-save.
  sess.start();
  p.save(sess);
  sess.abort('test abort');
  p.save(sess);
  assert.strictEqual(p.count(), 1, 'three saves of the same id keep one row');
  const loaded = p.load(sess.id);
  assert.strictEqual(loaded.status, 'aborted');
  assert.ok(loaded.escalations && loaded.escalations.length === 1);
  p.close();
});

t('loadAll() returns sessions sorted by createdAt desc', () => {
  const p = mkDb();
  // Two sessions with different createdAt — easiest is to fabricate
  // since we do not control timing across new MeetingSession calls.
  const s1 = mkSession('older');
  s1._createdAt = '2026-04-01T00:00:00.000Z';
  const s2 = mkSession('newer');
  s2._createdAt = '2026-05-01T00:00:00.000Z';
  p.save(s1);
  p.save(s2);
  const all = p.loadAll();
  assert.strictEqual(all.length, 2);
  assert.strictEqual(all[0].task, 'newer', 'desc order — newest first');
  assert.strictEqual(all[1].task, 'older');
  p.close();
});

t('listByStatus() returns id+status+timestamps without parsing data', () => {
  const p = mkDb();
  const a = mkSession('pending one');
  const b = mkSession('also pending');
  const c = mkSession('will be aborted');
  c.start(); c.abort('test');
  p.save(a); p.save(b); p.save(c);
  const pending = p.listByStatus('pending');
  assert.strictEqual(pending.length, 2);
  assert.ok(pending.every((r) => r.status === 'pending'));
  const aborted = p.listByStatus('aborted');
  assert.strictEqual(aborted.length, 1);
  assert.strictEqual(aborted[0].id, c.id);
  // listByStatus rows omit the `data` blob so they're cheap.
  assert.strictEqual(pending[0].data, undefined);
  p.close();
});

t('remove() drops a row; idempotent on missing id', () => {
  const p = mkDb();
  const sess = mkSession('remove test');
  p.save(sess);
  assert.strictEqual(p.count(), 1);
  assert.strictEqual(p.remove(sess.id), true);
  assert.strictEqual(p.count(), 0);
  // Removing again is a no-op (returns false).
  assert.strictEqual(p.remove(sess.id), false);
  // Removing an unknown id is also a no-op.
  assert.strictEqual(p.remove('m-never-existed'), false);
  p.close();
});

t('disk-backed: schema persists across reopens', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-mp-'));
  const dbPath = path.join(tmp, 'meetings.db');
  try {
    const p1 = new MeetingPersist({ dbPath });
    const sess = mkSession('disk persistence');
    p1.save(sess);
    p1.close();
    // Reopen and confirm the row survived.
    const p2 = new MeetingPersist({ dbPath });
    assert.strictEqual(p2.count(), 1);
    const loaded = p2.load(sess.id);
    assert.strictEqual(loaded.task, 'disk persistence');
    p2.close();
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

t('full lifecycle: pending → in-progress → completed survives save points', () => {
  const p = mkDb();
  const sess = mkSession('lifecycle');
  p.save(sess);
  assert.strictEqual(p.load(sess.id).status, 'pending');
  sess.start();
  p.save(sess);
  assert.strictEqual(p.load(sess.id).status, 'in-progress');
  // Walk to a terminal state via abort (simpler than running the
  // orchestrator inside this unit test).
  sess.abort('lifecycle done');
  p.save(sess);
  const final = p.load(sess.id);
  assert.strictEqual(final.status, 'aborted');
  assert.ok(final.completedAt, 'aborted should set completedAt');
  p.close();
});

(async () => {
  for (const fn of pending) await fn();
  console.log(`\n  ${passed} passed, ${failed} failed (meeting-persist)`);
  if (failed > 0) process.exit(1);
})();
