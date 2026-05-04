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

t('pruneOlderThan dryRun returns ids without deleting', () => {
  const p = mkDb();
  const old = mkSession('old terminal');
  old._createdAt = '2025-01-01T00:00:00.000Z';
  old.start(); old.abort('test');
  const recent = mkSession('recent terminal');
  recent.start(); recent.abort('test');
  p.save(old);
  p.save(recent);
  assert.strictEqual(p.count(), 2);
  const r = p.pruneOlderThan({ days: 30, dryRun: true });
  assert.strictEqual(r.dryRun, true);
  assert.strictEqual(r.count, 1);
  assert.deepStrictEqual(r.ids, [old.id]);
  // Nothing deleted in dry-run mode.
  assert.strictEqual(p.count(), 2);
  p.close();
});

t('pruneOlderThan: days=0 cutoff → everything older than now', () => {
  const p = mkDb();
  const sess = mkSession('immediate');
  sess._createdAt = '2025-01-01T00:00:00.000Z';
  sess.start(); sess.abort('t');
  p.save(sess);
  const r = p.pruneOlderThan({ days: 0 });
  assert.strictEqual(r.count, 1);
  assert.strictEqual(p.count(), 0);
  p.close();
});

t('pruneOlderThan terminalOnly default skips pending sessions', () => {
  const p = mkDb();
  const oldPending = mkSession('old pending');
  oldPending._createdAt = '2025-01-01T00:00:00.000Z';
  const oldAborted = mkSession('old aborted');
  oldAborted._createdAt = '2025-01-01T00:00:00.000Z';
  oldAborted.start(); oldAborted.abort('t');
  p.save(oldPending);
  p.save(oldAborted);
  const r = p.pruneOlderThan({ days: 30 });
  assert.strictEqual(r.count, 1, 'only the aborted one is pruned');
  assert.strictEqual(p.load(oldPending.id).status, 'pending', 'pending row preserved');
  p.close();
});

t('pruneOlderThan terminalOnly:false also drops old pending rows', () => {
  const p = mkDb();
  const oldPending = mkSession('old pending');
  oldPending._createdAt = '2025-01-01T00:00:00.000Z';
  p.save(oldPending);
  const r = p.pruneOlderThan({ days: 30, terminalOnly: false });
  assert.strictEqual(r.count, 1);
  assert.strictEqual(p.count(), 0);
  p.close();
});

t('pruneOlderThan rejects negative days', () => {
  const p = mkDb();
  assert.throws(() => p.pruneOlderThan({ days: -1 }), />= 0/);
  p.close();
});

t('pruneOlderThan empty result is a clean no-op', () => {
  const p = mkDb();
  const r = p.pruneOlderThan({ days: 30 });
  assert.strictEqual(r.count, 0);
  assert.deepStrictEqual(r.ids, []);
  // No VACUUM should run on an empty result.
  assert.strictEqual(r.vacuumed, false);
  p.close();
});

t('pruneOlderThan vacuum:true on disk shrinks the file', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-mp-vac-'));
  const dbPath = path.join(tmp, 'meetings.db');
  try {
    const p = new MeetingPersist({ dbPath });
    // Inflate each task to a few KB so the row payload is large enough
    // to push the DB beyond a single 4KB page; otherwise VACUUM has
    // nothing to reclaim because all rows fit in the initial page.
    const padding = 'x'.repeat(2048);
    for (let i = 0; i < 80; i += 1) {
      const sess = mkSession(`vacuum bulk ${i} ${padding}`);
      sess._createdAt = '2025-01-01T00:00:00.000Z';
      sess.start(); sess.abort('t');
      p.save(sess);
    }
    // Force a WAL checkpoint so the main DB file reflects the writes
    // before we sample its size; otherwise the writes are still in
    // the -wal sidecar and VACUUM can't see them yet.
    p._db.pragma('wal_checkpoint(FULL)');
    const beforeOnDisk = fs.statSync(dbPath).size;
    const r = p.pruneOlderThan({ days: 30, vacuum: true });
    assert.strictEqual(r.count, 80);
    assert.strictEqual(r.vacuumed, true);
    assert.strictEqual(typeof r.beforeBytes, 'number');
    assert.strictEqual(typeof r.afterBytes, 'number');
    assert.ok(r.beforeBytes > r.afterBytes,
      `vacuum should shrink (${r.beforeBytes}→${r.afterBytes})`);
    assert.ok(r.reclaimedBytes > 0);
    const afterOnDisk = fs.statSync(dbPath).size;
    assert.ok(afterOnDisk < beforeOnDisk, 'on-disk size shrank');
    p.close();
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

t('integrityCheck returns {ok:true} on a clean DB', () => {
  const p = mkDb();
  const sess = mkSession('integrity clean');
  p.save(sess);
  const r = p.integrityCheck();
  assert.strictEqual(r.ok, true);
  p.close();
});

t('integrityCheck on empty DB also returns ok', () => {
  const p = mkDb();
  const r = p.integrityCheck();
  assert.strictEqual(r.ok, true);
  p.close();
});

t('backupTo writes a hot backup that opens cleanly with the same rows', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-mp-bk-'));
  const srcPath = path.join(tmp, 'meetings.db');
  const dstPath = path.join(tmp, 'backup.db');
  try {
    const src = new (require('../src/meeting-persist').MeetingPersist)({ dbPath: srcPath });
    const sessA = mkSession('backup test A');
    const sessB = mkSession('backup test B');
    src.save(sessA); src.save(sessB);
    const r = src.backupTo(dstPath);
    assert.strictEqual(r.path, dstPath);
    assert.ok(typeof r.bytes === 'number' && r.bytes > 0);
    // Reopen target — should have the same rows.
    const dst = new (require('../src/meeting-persist').MeetingPersist)({ dbPath: dstPath });
    assert.strictEqual(dst.count(), 2);
    const loadedA = dst.load(sessA.id);
    assert.strictEqual(loadedA.task, 'backup test A');
    src.close(); dst.close();
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

t('backupTo refuses to overwrite an existing target', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-mp-bk-overwrite-'));
  const srcPath = path.join(tmp, 'meetings.db');
  const dstPath = path.join(tmp, 'preexisting.db');
  fs.writeFileSync(dstPath, 'occupied');
  try {
    const src = new (require('../src/meeting-persist').MeetingPersist)({ dbPath: srcPath });
    assert.throws(() => src.backupTo(dstPath), /already exists/);
    src.close();
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

t('backupTo rejects empty/missing path', () => {
  const p = mkDb();
  assert.throws(() => p.backupTo(), /required/);
  assert.throws(() => p.backupTo(''), /required/);
  p.close();
});

t('pruneOlderThan vacuum is skipped on dryRun', () => {
  const p = mkDb();
  const sess = mkSession('vacuum dry');
  sess._createdAt = '2025-01-01T00:00:00.000Z';
  sess.start(); sess.abort('t');
  p.save(sess);
  const r = p.pruneOlderThan({ days: 30, vacuum: true, dryRun: true });
  assert.strictEqual(r.dryRun, true);
  assert.strictEqual(r.vacuumed, false, 'vacuum skipped on dryRun');
  // Sessions still present.
  assert.strictEqual(p.count(), 1);
  p.close();
});

(async () => {
  for (const fn of pending) await fn();
  console.log(`\n  ${passed} passed, ${failed} failed (meeting-persist)`);
  if (failed > 0) process.exit(1);
})();
