// AuditLogger.query() ↔ SQLite read accelerator integration tests.
//
// Verifies that queries route through the SQLite mirror when it's
// initialised, that the result shape matches the JSONL fallback, and
// that filter results agree between the two paths.

'use strict';

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { AuditLogger } = require('../src/audit-log');

let sqliteAvailable;
try { require('node:sqlite'); sqliteAvailable = true; }
catch { sqliteAvailable = false; }

function freshTmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-audit-q-'));
  return { dir, logPath: path.join(dir, 'audit.jsonl') };
}
function cleanup(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }

describe('AuditLogger.query routes through SQLite when enabled', { skip: !sqliteAvailable }, () => {
  it('SQLite path returns same shape as JSONL path on the same data', () => {
    const { dir: dirA, logPath: logA } = freshTmp();
    const { dir: dirB, logPath: logB } = freshTmp();
    try {
      const jsonl = new AuditLogger({ logPath: logA });
      const both = new AuditLogger({ logPath: logB, useSqlite: true });
      // Mirror the same writes through both loggers.
      const writes = [
        ['worker.created', { name: 'w1' }, { target: 'w1' }],
        ['task.sent', { task: 't' }, { target: 'w1' }],
        ['worker.closed', {}, { target: 'w1' }],
      ];
      for (const w of writes) {
        jsonl.record(...w);
        both.record(...w);
      }
      const a = jsonl.query();
      const b = both.query();
      assert.strictEqual(a.length, b.length);
      // Shape parity: type/target/actor/timestamp/details fields all present.
      for (let i = 0; i < a.length; i++) {
        assert.strictEqual(a[i].type, b[i].type);
        assert.strictEqual(a[i].target, b[i].target);
        assert.strictEqual(a[i].actor, b[i].actor);
      }
      both._sqlite.close();
    } finally {
      cleanup(dirA); cleanup(dirB);
    }
  });

  it('type filter returns the same set on both paths', () => {
    const { dir, logPath } = freshTmp();
    try {
      const a = new AuditLogger({ logPath, useSqlite: true });
      a.record('worker.created', {}, { target: 'w1' });
      a.record('worker.created', {}, { target: 'w2' });
      a.record('task.sent',     {}, { target: 'w1' });
      a.record('task.completed',{}, { target: 'w1' });
      const onlyCreated = a.query({ type: 'worker.created' });
      assert.strictEqual(onlyCreated.length, 2);
      onlyCreated.forEach((r) => assert.strictEqual(r.type, 'worker.created'));
      a._sqlite.close();
    } finally {
      cleanup(dir);
    }
  });

  it('target filter returns the same set on both paths', () => {
    const { dir, logPath } = freshTmp();
    try {
      const a = new AuditLogger({ logPath, useSqlite: true });
      a.record('task.sent', {}, { target: 'w1' });
      a.record('task.sent', {}, { target: 'w2' });
      a.record('task.sent', {}, { target: 'w1' });
      const onlyW1 = a.query({ target: 'w1' });
      assert.strictEqual(onlyW1.length, 2);
      onlyW1.forEach((r) => assert.strictEqual(r.target, 'w1'));
      a._sqlite.close();
    } finally {
      cleanup(dir);
    }
  });

  it('limit caps result count', () => {
    const { dir, logPath } = freshTmp();
    try {
      const a = new AuditLogger({ logPath, useSqlite: true });
      for (let i = 0; i < 10; i++) a.record('task.sent', { i }, { target: `w${i}` });
      const r = a.query({ limit: 3 });
      assert.strictEqual(r.length, 3);
      a._sqlite.close();
    } finally {
      cleanup(dir);
    }
  });

  it('falls back to JSONL when SQLite query throws', () => {
    const { dir, logPath } = freshTmp();
    try {
      const a = new AuditLogger({ logPath, useSqlite: true });
      a.record('task.sent', {}, { target: 'w1' });
      // Force the SQLite branch to throw — fallback path must still work.
      a._sqlite.query = () => { throw new Error('sqlite unavailable'); };
      const r = a.query();
      assert.strictEqual(r.length, 1);
      assert.strictEqual(r[0].target, 'w1');
      a._sqlite.close && a._sqlite.close();
    } finally {
      cleanup(dir);
    }
  });

  // (review fix 2026-05-01) Default-limit parity. Without this fix
  // the SQLite path defaulted to LIMIT 200 while the JSONL path
  // returned every event when the caller didn't supply `limit`.
  // A query for the same data through the same public API would
  // return different counts depending on whether useSqlite was on.
  it('default limit caps at 200 on BOTH SQLite and JSONL paths', () => {
    const { dir: dirA, logPath: logA } = freshTmp();
    const { dir: dirB, logPath: logB } = freshTmp();
    try {
      // SQLite-backed
      const aSqlite = new AuditLogger({ logPath: logA, useSqlite: true });
      // JSONL-only
      const aJsonl = new AuditLogger({ logPath: logB });
      for (let i = 0; i < 250; i++) {
        aSqlite.record('task.sent', { i }, { target: `w${i}` });
        aJsonl.record('task.sent', { i }, { target: `w${i}` });
      }
      const rSqlite = aSqlite.query({}); // no limit specified
      const rJsonl = aJsonl.query({});  // no limit specified
      assert.strictEqual(rSqlite.length, 200, 'SQLite default limit = 200');
      assert.strictEqual(rJsonl.length, 200, 'JSONL default limit = 200 (parity fix)');
      aSqlite._sqlite && aSqlite._sqlite.close && aSqlite._sqlite.close();
    } finally {
      cleanup(dirA);
      cleanup(dirB);
    }
  });
});
