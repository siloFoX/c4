// Audit log SQLite backend (TODO #118).
//
// Optional / opt-in. Default `backend: 'jsonl'` retains the append-only
// JSONL flow. When `config.audit.backend === 'sqlite'` we keep the JSONL
// for forensic continuity (security teams expect immutable log files)
// AND maintain a parallel SQLite index for fast queries.
//
// Uses Node 22+'s built-in `node:sqlite`. No external dependency. If
// the runtime doesn't support it we silently fall back to JSONL-only.

'use strict';

const fs = require('fs');
const path = require('path');

let _sqliteModule = null;
let _loadAttempted = false;

function _loadSqlite() {
  if (_loadAttempted) return _sqliteModule;
  _loadAttempted = true;
  try {
    _sqliteModule = require('node:sqlite');
  } catch {
    _sqliteModule = null;
  }
  return _sqliteModule;
}

class AuditSqlite {
  constructor(dbPath) {
    const sqlite = _loadSqlite();
    if (!sqlite) {
      this.db = null;
      this.unavailableReason = 'node:sqlite not available (Node 22+ required)';
      return;
    }
    try {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      this.db = new sqlite.DatabaseSync(dbPath);
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS audit (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ts TEXT NOT NULL,
          actor TEXT,
          action TEXT,
          worker TEXT,
          ok INTEGER,
          error TEXT,
          body_keys TEXT,
          raw TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_audit_ts     ON audit(ts);
        CREATE INDEX IF NOT EXISTS idx_audit_action ON audit(action);
        CREATE INDEX IF NOT EXISTS idx_audit_worker ON audit(worker);
        CREATE INDEX IF NOT EXISTS idx_audit_actor  ON audit(actor);
      `);
      this._insertStmt = this.db.prepare(
        'INSERT INTO audit (ts, actor, action, worker, ok, error, body_keys, raw) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      );
    } catch (e) {
      this.db = null;
      this.unavailableReason = `sqlite init failed: ${e.message}`;
    }
  }

  isReady() { return !!this.db; }

  append(record) {
    if (!this.db) return false;
    try {
      this._insertStmt.run(
        record.ts || new Date().toISOString(),
        record.actor || null,
        record.action || null,
        record.worker || null,
        record.ok === false ? 0 : 1,
        record.error || null,
        Array.isArray(record.bodyKeys) ? record.bodyKeys.join(',') : null,
        JSON.stringify(record),
      );
      return true;
    } catch {
      return false;
    }
  }

  query({ since, until, action, worker, actor, limit = 200 } = {}) {
    if (!this.db) return null;
    const wheres = [];
    const params = [];
    if (since)  { wheres.push('ts >= ?'); params.push(since); }
    if (until)  { wheres.push('ts <= ?'); params.push(until); }
    if (action) { wheres.push('action = ?'); params.push(action); }
    if (worker) { wheres.push('worker = ?'); params.push(worker); }
    if (actor)  { wheres.push('actor = ?'); params.push(actor); }
    const sql = `SELECT raw FROM audit ${wheres.length ? 'WHERE ' + wheres.join(' AND ') : ''} ORDER BY id DESC LIMIT ?`;
    params.push(limit);
    try {
      const stmt = this.db.prepare(sql);
      const rows = stmt.all(...params);
      return rows.map((r) => {
        try { return JSON.parse(r.raw); }
        catch { return { _malformed: true }; }
      });
    } catch {
      return null;
    }
  }

  close() {
    if (this.db) {
      try { this.db.close(); } catch {}
      this.db = null;
    }
  }
}

module.exports = { AuditSqlite };
