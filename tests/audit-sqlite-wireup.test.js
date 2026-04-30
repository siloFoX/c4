// AuditLogger ↔ AuditSqlite wire-up tests.
//
// Verifies that opting into SQLite mirror via { useSqlite: true }
// produces a sibling .db, that record() writes to both stores, and
// that JSONL stays the source of truth when the SQLite append fails.

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-audit-sql-wire-'));
  return { dir, logPath: path.join(dir, 'audit.jsonl') };
}
function cleanup(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }

describe('AuditLogger SQLite wire-up', { skip: !sqliteAvailable }, () => {
  it('default (no opt-in) leaves _sqlite null and writes JSONL only', () => {
    const { dir, logPath } = freshTmp();
    try {
      const a = new AuditLogger({ logPath });
      a.record('worker.created', { name: 'w1' }, { target: 'w1' });
      assert.strictEqual(a._sqlite, null);
      // Sibling .db was never created.
      assert.strictEqual(fs.existsSync(logPath.replace(/\.jsonl$/, '') + '.db'), false);
      // JSONL has the record.
      const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
      assert.strictEqual(lines.length, 1);
    } finally {
      cleanup(dir);
    }
  });

  it('useSqlite:true creates a sibling .db and mirrors records', () => {
    const { dir, logPath } = freshTmp();
    try {
      const a = new AuditLogger({ logPath, useSqlite: true });
      a.record('worker.created', { name: 'w1' }, { target: 'w1' });
      a.record('task.sent', { description: 't' }, { target: 'w1' });
      assert.ok(a._sqlite, 'sqlite mirror initialized');
      const dbPath = logPath.replace(/\.jsonl$/, '') + '.db';
      assert.ok(fs.existsSync(dbPath), 'sibling .db file exists');

      const rows = a._sqlite.query({ limit: 10 });
      assert.strictEqual(rows.length, 2);
      // Newest first (DESC by id) — task.sent landed last.
      assert.strictEqual(rows[0].action, 'task.sent');
      assert.strictEqual(rows[1].action, 'worker.created');

      // JSONL is still source of truth — same count.
      const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
      assert.strictEqual(lines.length, 2);

      a._sqlite.close();
    } finally {
      cleanup(dir);
    }
  });

  it('SQLite append failure does not block JSONL write', () => {
    const { dir, logPath } = freshTmp();
    try {
      const a = new AuditLogger({ logPath, useSqlite: true });
      a._init();
      // Force the mirror to throw on the next append.
      a._sqlite.append = () => { throw new Error('sqlite gone'); };
      const r = a.record('approval.granted', { reason: 'manual' }, { target: 'w1' });
      // Hash chain advanced + JSONL has the record.
      assert.ok(r && r.hash);
      const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
      assert.strictEqual(lines.length, 1);
      a._sqlite.close && a._sqlite.close();
    } finally {
      cleanup(dir);
    }
  });

  it('verify() still validates the JSONL hash chain after SQLite mirror writes', () => {
    const { dir, logPath } = freshTmp();
    try {
      const a = new AuditLogger({ logPath, useSqlite: true });
      for (let i = 0; i < 5; i++) {
        a.record('task.sent', { i }, { target: `w${i}` });
      }
      const v = a.verify();
      assert.strictEqual(v.valid, true);
      assert.strictEqual(v.total, 5);
      a._sqlite.close();
    } finally {
      cleanup(dir);
    }
  });
});
