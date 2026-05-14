'use strict';

// (11.189) Tests for src/snapshots.js -- list / create / restore /
// delete handlers behind /api/snapshots*. Drives the pure helpers
// directly against a tmp repo so the assertions exercise the same
// code path the daemon handlers do without spinning up HTTP.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { describe, it, beforeEach } = require('node:test');

const snapshots = require('../src/snapshots');

function makeTmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-snap-test-'));
  fs.writeFileSync(
    path.join(dir, 'config.json'),
    JSON.stringify({ daemon: { port: 3456 }, autonomous: { mode: false } }, null, 2),
  );
  fs.mkdirSync(path.join(dir, 'docs'));
  fs.writeFileSync(
    path.join(dir, 'docs', 'autonomous-queue-v10.md'),
    '# Queue\n\n| # | Task | Status | Detail |\n|---|---|---|---|\n| 1.1 | t | todo | d |\n',
  );
  return dir;
}

describe('listSnapshots()', () => {
  it('returns an empty array when the snapshots dir does not exist', () => {
    const repoRoot = makeTmpRepo();
    const out = snapshots.listSnapshots({ repoRoot });
    assert.strictEqual(out.status, 200);
    assert.deepStrictEqual(out.body.snapshots, []);
  });

  it('returns saved snapshots sorted newest first', () => {
    const repoRoot = makeTmpRepo();
    fs.mkdirSync(path.join(repoRoot, '.c4', 'snapshots'), { recursive: true });
    const older = {
      id: '2026-05-13T00-00-00-000Z-aaaaaaaa',
      label: 'older',
      createdAt: '2026-05-13T00:00:00.000Z',
      config: { x: 1 },
      queue: 'q1',
      version: 1,
    };
    const newer = {
      id: '2026-05-14T00-00-00-000Z-bbbbbbbb',
      label: 'newer',
      createdAt: '2026-05-14T00:00:00.000Z',
      config: { x: 2 },
      queue: 'q2',
      version: 1,
    };
    fs.writeFileSync(
      path.join(repoRoot, '.c4', 'snapshots', older.id + '.json'),
      JSON.stringify(older),
    );
    fs.writeFileSync(
      path.join(repoRoot, '.c4', 'snapshots', newer.id + '.json'),
      JSON.stringify(newer),
    );
    const out = snapshots.listSnapshots({ repoRoot });
    assert.strictEqual(out.status, 200);
    assert.strictEqual(out.body.snapshots.length, 2);
    assert.strictEqual(out.body.snapshots[0].id, newer.id);
    assert.strictEqual(out.body.snapshots[1].id, older.id);
    assert.strictEqual(out.body.snapshots[0].label, 'newer');
    assert.ok(out.body.snapshots[0].configBytes > 0);
    assert.ok(out.body.snapshots[0].queueBytes > 0);
  });
});

describe('createSnapshot()', () => {
  it('writes a snapshot file under .c4/snapshots and emits an audit line', () => {
    const repoRoot = makeTmpRepo();
    const auditCalls = [];
    const out = snapshots.createSnapshot({
      repoRoot,
      body: { label: 'pre-merge' },
      actor: 'alice',
      audit: (type, details) => auditCalls.push({ type, details }),
    });
    assert.strictEqual(out.status, 200);
    assert.ok(out.body.id);
    assert.strictEqual(out.body.label, 'pre-merge');
    assert.ok(out.body.createdAt);
    assert.ok(out.body.configBytes > 0);
    assert.ok(out.body.queueBytes > 0);

    const filePath = path.join(repoRoot, '.c4', 'snapshots', out.body.id + '.json');
    assert.ok(fs.existsSync(filePath));
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.strictEqual(parsed.label, 'pre-merge');
    assert.deepStrictEqual(parsed.config, {
      daemon: { port: 3456 },
      autonomous: { mode: false },
    });
    assert.ok(parsed.queue.includes('Queue'));
    assert.strictEqual(parsed.version, 1);

    assert.strictEqual(auditCalls.length, 1);
    assert.strictEqual(auditCalls[0].type, 'snapshot.create');
    assert.strictEqual(auditCalls[0].details.actor, 'alice');
  });

  it('accepts an empty label and trims long labels to 200 chars', () => {
    const repoRoot = makeTmpRepo();
    const out = snapshots.createSnapshot({
      repoRoot,
      body: { label: 'x'.repeat(500) },
    });
    assert.strictEqual(out.status, 200);
    assert.strictEqual(out.body.label.length, 200);
  });

  it('fails with 500 when config.json is not valid JSON', () => {
    const repoRoot = makeTmpRepo();
    fs.writeFileSync(path.join(repoRoot, 'config.json'), 'not-json');
    const out = snapshots.createSnapshot({ repoRoot, body: {} });
    assert.strictEqual(out.status, 500);
    assert.ok(out.body.error.includes('config'));
  });
});

describe('restoreSnapshot()', () => {
  it('writes config + queue back atomically and emits an audit line', () => {
    const repoRoot = makeTmpRepo();
    const auditCalls = [];
    const created = snapshots.createSnapshot({
      repoRoot,
      body: { label: 'baseline' },
    });
    assert.strictEqual(created.status, 200);

    fs.writeFileSync(path.join(repoRoot, 'config.json'), JSON.stringify({ different: true }));
    fs.writeFileSync(path.join(repoRoot, 'docs', 'autonomous-queue-v10.md'), 'overwritten');

    const out = snapshots.restoreSnapshot({
      repoRoot,
      id: created.body.id,
      actor: 'bob',
      audit: (type, details) => auditCalls.push({ type, details }),
    });
    assert.strictEqual(out.status, 200);
    assert.strictEqual(out.body.restored, true);
    assert.strictEqual(out.body.id, created.body.id);

    const restoredCfg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'config.json'), 'utf8'));
    assert.deepStrictEqual(restoredCfg, {
      daemon: { port: 3456 },
      autonomous: { mode: false },
    });
    const restoredQueue = fs.readFileSync(
      path.join(repoRoot, 'docs', 'autonomous-queue-v10.md'),
      'utf8',
    );
    assert.ok(restoredQueue.includes('Queue'));

    assert.strictEqual(auditCalls.length, 1);
    assert.strictEqual(auditCalls[0].type, 'snapshot.restore');
    assert.strictEqual(auditCalls[0].details.actor, 'bob');
  });

  it('returns 404 when the snapshot id does not exist', () => {
    const repoRoot = makeTmpRepo();
    const out = snapshots.restoreSnapshot({
      repoRoot,
      id: '2026-05-14T00-00-00-000Z-nonexistent',
    });
    assert.strictEqual(out.status, 404);
  });

  it('rejects an invalid id with 400 (path traversal guard)', () => {
    const repoRoot = makeTmpRepo();
    const out = snapshots.restoreSnapshot({
      repoRoot,
      id: '../../../etc/passwd',
    });
    assert.strictEqual(out.status, 400);
    assert.strictEqual(out.body.error, 'invalid id');
  });
});

describe('deleteSnapshot()', () => {
  it('removes the snapshot file and emits an audit line', () => {
    const repoRoot = makeTmpRepo();
    const auditCalls = [];
    const created = snapshots.createSnapshot({ repoRoot, body: { label: 'tmp' } });
    const filePath = path.join(repoRoot, '.c4', 'snapshots', created.body.id + '.json');
    assert.ok(fs.existsSync(filePath));
    const out = snapshots.deleteSnapshot({
      repoRoot,
      id: created.body.id,
      actor: 'carol',
      audit: (type, details) => auditCalls.push({ type, details }),
    });
    assert.strictEqual(out.status, 200);
    assert.strictEqual(out.body.deleted, true);
    assert.strictEqual(fs.existsSync(filePath), false);
    assert.strictEqual(auditCalls.length, 1);
    assert.strictEqual(auditCalls[0].type, 'snapshot.delete');
  });

  it('returns 404 when the snapshot is already gone', () => {
    const repoRoot = makeTmpRepo();
    const out = snapshots.deleteSnapshot({
      repoRoot,
      id: '2026-05-14T00-00-00-000Z-deadbeef',
    });
    assert.strictEqual(out.status, 404);
  });
});

describe('round-trip', () => {
  it('list -> create -> list shows the new snapshot first', () => {
    const repoRoot = makeTmpRepo();
    const before = snapshots.listSnapshots({ repoRoot });
    assert.strictEqual(before.body.snapshots.length, 0);
    const created = snapshots.createSnapshot({ repoRoot, body: { label: 'one' } });
    assert.strictEqual(created.status, 200);
    const after = snapshots.listSnapshots({ repoRoot });
    assert.strictEqual(after.body.snapshots.length, 1);
    assert.strictEqual(after.body.snapshots[0].id, created.body.id);
    assert.strictEqual(after.body.snapshots[0].label, 'one');
  });
});
