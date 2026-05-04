'use strict';

// Meeting persistence (Phase 7 of multi-specialist system).
//
// SQLite-backed durable storage for MeetingSession state. The
// in-memory MeetingStore (meeting-session.js) keeps every active
// session for fast read; this module owns the durable copy so a
// daemon restart (planned or unplanned) doesn't lose meetings that
// were in flight.
//
// Storage choice: better-sqlite3 (synchronous API, single-writer
// model fits c4 perfectly, no external service dependency, single-
// file backup story). The full serialized session JSON is stored
// in a `data` column so the schema stays decoupled from
// MeetingSession's internal field layout — adding a field to the
// session won't break persistence as long as the JSON serialization
// includes it.
//
// All operations are synchronous — better-sqlite3 calls are single-
// digit microseconds for our row sizes (a few KB per meeting), so
// the daemon's event loop isn't impacted. Tests and callers can
// treat them as plain function calls.
//
// Phase 1 ships the standalone module + tests. Phase 2 will wire
// it into MeetingStore so put() / state events trigger save and
// constructor rehydrates from disk. Phase 3 wires the daemon boot
// path.

const fs = require('fs');
const path = require('path');

const DEFAULT_DB_PATH = path.join(process.env.HOME || '/tmp', '.c4', 'meetings.db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meetings (
  id          TEXT PRIMARY KEY,
  status      TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  data        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_meetings_status     ON meetings(status);
CREATE INDEX IF NOT EXISTS idx_meetings_created_at ON meetings(created_at);
CREATE INDEX IF NOT EXISTS idx_meetings_updated_at ON meetings(updated_at);
`;

class MeetingPersist {
  constructor(opts = {}) {
    const dbPath = opts.dbPath || DEFAULT_DB_PATH;
    if (dbPath !== ':memory:') {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    }
    // Lazy-require so test envs without the native module can still
    // load this file for inspection. The constructor is the gate.
    const Database = require('better-sqlite3');
    this._db = new Database(dbPath, opts.databaseOptions || {});
    // WAL mode for concurrent readers (HTTP handlers may read while a
    // mutation is in flight). c4 has a single writer (the daemon),
    // so WAL is purely a read-perf win.
    this._db.pragma('journal_mode = WAL');
    this._db.pragma('synchronous = NORMAL');
    this._db.exec(SCHEMA);

    this._stmtUpsert = this._db.prepare(`
      INSERT INTO meetings (id, status, created_at, updated_at, data)
      VALUES (@id, @status, @created_at, @updated_at, @data)
      ON CONFLICT(id) DO UPDATE SET
        status     = excluded.status,
        updated_at = excluded.updated_at,
        data       = excluded.data
    `);
    this._stmtSelect = this._db.prepare('SELECT data FROM meetings WHERE id = ?');
    this._stmtSelectAll = this._db.prepare(
      'SELECT data FROM meetings ORDER BY created_at DESC'
    );
    this._stmtListByStatus = this._db.prepare(
      'SELECT id, status, created_at, updated_at FROM meetings WHERE status = ? ORDER BY created_at DESC'
    );
    this._stmtCount = this._db.prepare('SELECT COUNT(*) as n FROM meetings');
    this._stmtDelete = this._db.prepare('DELETE FROM meetings WHERE id = ?');
  }

  // Serialize a MeetingSession (or any object with toJSON()) into
  // the storage row. Caller passes the live session; we extract
  // {id, status, createdAt} for indexable columns and stuff the
  // entire toJSON() output into data.
  save(session) {
    if (!session) throw new Error('save: session required');
    // Prefer _persistSnapshot() (richer; includes full plan + internal
    // indices needed for Phase 7.3 rehydrate) when the session
    // exposes it; fall back to toJSON() otherwise so callers can
    // pass in already-serialized envelopes too.
    const json = (typeof session._persistSnapshot === 'function')
      ? session._persistSnapshot()
      : ((typeof session.toJSON === 'function') ? session.toJSON() : session);
    if (!json || typeof json !== 'object' || !json.id) {
      throw new Error('save: session must have an id');
    }
    if (typeof json.status !== 'string') {
      throw new Error('save: session must have a status string');
    }
    if (!json.createdAt) {
      throw new Error('save: session must have a createdAt string');
    }
    this._stmtUpsert.run({
      id: json.id,
      status: json.status,
      created_at: json.createdAt,
      updated_at: new Date().toISOString(),
      data: JSON.stringify(json),
    });
    return { id: json.id, status: json.status };
  }

  // Read the serialized JSON envelope back. Returns null on miss.
  load(id) {
    if (!id || typeof id !== 'string') return null;
    const row = this._stmtSelect.get(id);
    if (!row) return null;
    try { return JSON.parse(row.data); }
    catch { return null; }
  }

  // Return every persisted session. Sorted by createdAt desc to
  // match the in-memory list ordering established in v1.10.271.
  loadAll() {
    const rows = this._stmtSelectAll.all();
    const out = [];
    for (const r of rows) {
      try { out.push(JSON.parse(r.data)); }
      catch { /* skip malformed row, never crash boot */ }
    }
    return out;
  }

  // Lightweight ID-only listing without parsing the full data
  // column. Useful for rehydration counting or status dashboards.
  listByStatus(status) {
    if (!status) return [];
    return this._stmtListByStatus.all(status);
  }

  count() {
    const row = this._stmtCount.get();
    return row ? row.n : 0;
  }

  // Drop a meeting from disk. Returns true when a row was actually
  // deleted, false when the id was not present.
  remove(id) {
    if (!id || typeof id !== 'string') return false;
    const r = this._stmtDelete.run(id);
    return r.changes > 0;
  }

  close() {
    if (this._db) {
      this._db.close();
      this._db = null;
    }
  }
}

module.exports = {
  MeetingPersist,
  DEFAULT_DB_PATH,
  SCHEMA,
};
