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

-- (Phase 8.1) Full-text search index over meeting title / task /
-- transcript text. Unicode61 tokenizer is the SQLite default and
-- handles ASCII / Latin / CJK adequately for our keyword search
-- needs. id is UNINDEXED so we can DELETE WHERE id = ? without
-- the column being part of the searchable text.
CREATE VIRTUAL TABLE IF NOT EXISTS meetings_fts USING fts5(
  id UNINDEXED,
  title,
  task,
  transcript,
  tokenize='unicode61'
);
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

    // (Phase 8.1) FTS5 maintenance statements. Update is delete +
    // insert because FTS5 doesn't have a real UPSERT — but each
    // statement is fast and we wrap them in a transaction at the
    // call site for atomicity.
    this._stmtFtsDelete = this._db.prepare('DELETE FROM meetings_fts WHERE id = ?');
    this._stmtFtsInsert = this._db.prepare(
      'INSERT INTO meetings_fts (id, title, task, transcript) VALUES (?, ?, ?, ?)'
    );
    this._stmtFtsSearch = this._db.prepare(`
      SELECT m.id, m.status, m.created_at, m.updated_at,
             snippet(meetings_fts, -1, '<<', '>>', '…', 16) AS snippet,
             rank
      FROM meetings_fts
      JOIN meetings m ON m.id = meetings_fts.id
      WHERE meetings_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `);
  }

  // Build the searchable text representation from a session JSON.
  // Concatenates every turn's text across every stage. Bounded by
  // session size; for typical meetings (< 100KB JSON) this is
  // negligible.
  _ftsText(json) {
    if (!json) return '';
    const stages = json.transcripts || [];
    const parts = [];
    for (const stageTurns of stages) {
      for (const turn of stageTurns || []) {
        if (turn && typeof turn.text === 'string') parts.push(turn.text);
      }
    }
    return parts.join('\n');
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
    // (Phase 8.1) Maintain the FTS index alongside the row store.
    // Wrap the meetings + FTS writes in a transaction so an
    // interrupted write can't leave them out of sync.
    const tx = this._db.transaction(() => {
      this._stmtUpsert.run({
        id: json.id,
        status: json.status,
        created_at: json.createdAt,
        updated_at: new Date().toISOString(),
        data: JSON.stringify(json),
      });
      this._stmtFtsDelete.run(json.id);
      this._stmtFtsInsert.run(
        json.id,
        json.title || '',
        json.task || '',
        this._ftsText(json),
      );
    });
    tx();
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
  // deleted, false when the id was not present. FTS index row also
  // removed so search results stay consistent with disk.
  remove(id) {
    if (!id || typeof id !== 'string') return false;
    const tx = this._db.transaction(() => {
      const r = this._stmtDelete.run(id);
      this._stmtFtsDelete.run(id);
      return r.changes > 0;
    });
    return tx();
  }

  // Phase 8.1 — full-text search across title / task / transcript.
  // Returns `[{id, status, createdAt, updatedAt, snippet, rank}, ...]`
  // sorted by FTS5's bm25 rank (best matches first). The `snippet`
  // string highlights matching tokens with `<<...>>` markers.
  //
  // opts:
  //   limit   default 20, cap 200 (FTS5 search can be expensive
  //           on huge corpora; prefer pagination over unbounded)
  //
  // The query syntax is FTS5's default — phrases in double-quotes,
  // `OR` for alternation, `*` for prefix match. Bad syntax errors
  // throw; callers should treat that as a 400.
  search(q, opts = {}) {
    if (!q || typeof q !== 'string') {
      throw new Error('search: query string required');
    }
    const limit = Math.min(200, Number.isFinite(opts.limit) ? Math.max(1, opts.limit) : 20);
    const rows = this._stmtFtsSearch.all(q, limit);
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      snippet: r.snippet,
      rank: r.rank,
    }));
  }

  // Phase 7.5 — auto-prune. Find meetings older than N days,
  // optionally restricted to terminal statuses, and delete them.
  // The created_at index makes the find cheap. Returns
  // `{count, ids, dryRun}`. When dryRun=true, no rows are
  // deleted; the caller gets the would-be set for preview.
  //
  // Terminal-only is the default — keep pending / in-progress
  // even if they're old (operator may still want to advance them).
  // Set terminalOnly:false to nuke everything older than the
  // cutoff including stale pending entries.
  pruneOlderThan(opts = {}) {
    const days = Number.isFinite(opts.days) ? opts.days : 90;
    const terminalOnly = opts.terminalOnly !== false;
    const dryRun = !!opts.dryRun;
    const wantVacuum = !!opts.vacuum;
    if (days < 0) throw new Error('pruneOlderThan: days must be >= 0');
    const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
    const cutoffISO = new Date(cutoffMs).toISOString();
    let sql = 'SELECT id FROM meetings WHERE created_at < ?';
    const params = [cutoffISO];
    if (terminalOnly) {
      sql += ' AND status IN (?, ?, ?)';
      params.push('completed', 'escalated', 'aborted');
    }
    const ids = this._db.prepare(sql).all(...params).map((r) => r.id);
    let beforeBytes = null;
    let afterBytes = null;
    if (!dryRun && ids.length > 0) {
      // Wrap deletes in a single transaction so a partial failure
      // (disk full, etc) doesn't leave half the rows gone with no
      // signal back to the caller.
      const tx = this._db.transaction((idsArg) => {
        for (const id of idsArg) this._stmtDelete.run(id);
      });
      tx(ids);
    }
    // Optional VACUUM. SQLite's DELETE only marks pages as free;
    // file size stays the same until VACUUM rewrites the DB.
    // Skipped on dryRun (no deletes happened). Skipped on
    // empty-prune (nothing to reclaim). Cheap-but-not-free —
    // copies the entire DB. Operators opt in when they actually
    // care about disk pressure.
    if (wantVacuum && !dryRun && ids.length > 0) {
      try {
        const fs2 = require('fs');
        const dbFile = this._db.name;
        if (dbFile && dbFile !== ':memory:') {
          try { beforeBytes = fs2.statSync(dbFile).size; } catch { /* tolerate */ }
        }
        this._db.exec('VACUUM');
        // In WAL mode, VACUUM's space reclamation isn't visible in
        // the main DB file until the next checkpoint runs the WAL
        // forward. Force it so beforeBytes/afterBytes reflect the
        // post-VACUUM size, not the pre-VACUUM one.
        try { this._db.pragma('wal_checkpoint(TRUNCATE)'); }
        catch { /* tolerate — non-WAL mode has no checkpoint */ }
        if (dbFile && dbFile !== ':memory:') {
          try { afterBytes = fs2.statSync(dbFile).size; } catch { /* tolerate */ }
        }
      } catch (err) {
        // VACUUM failure shouldn't reverse the prune — log + continue.
        process.stderr.write(`[meeting-persist] VACUUM failed: ${err.message}\n`);
      }
    }
    const reclaimedBytes = (beforeBytes != null && afterBytes != null)
      ? Math.max(0, beforeBytes - afterBytes)
      : null;
    return {
      count: ids.length, ids, dryRun, cutoffISO, terminalOnly, days,
      vacuumed: wantVacuum && !dryRun && ids.length > 0,
      beforeBytes, afterBytes, reclaimedBytes,
    };
  }

  // Hot backup via SQLite's `VACUUM INTO`. Writes a consistent
  // snapshot of the live DB to `targetPath` without blocking
  // readers/writers — a normal restore is just a file copy
  // back. Operator-triggered: stopping the daemon is not
  // required. Returns `{path, bytes}` on success; throws on
  // failure (target unwritable, target already exists, etc).
  //
  // VACUUM INTO refuses to overwrite an existing file. Caller
  // should pre-clean if they want overwrite semantics.
  backupTo(targetPath, opts = {}) {
    if (!targetPath || typeof targetPath !== 'string') {
      throw new Error('backupTo: targetPath required');
    }
    const fs2 = require('fs');
    const path2 = require('path');
    fs2.mkdirSync(path2.dirname(path2.resolve(targetPath)), { recursive: true });
    if (fs2.existsSync(targetPath)) {
      // Phase 7.13 — opt-in overwrite. The default refusal is the
      // safe path for operator-triggered backups (avoid clobbering
      // the previous explicit one). Auto-backup-on-shutdown opts in
      // because it's a "last known good" file with deterministic
      // path that's MEANT to roll over on every clean restart.
      if (!opts.force) {
        throw new Error(`backupTo: target already exists (${targetPath})`);
      }
      fs2.unlinkSync(targetPath);
    }
    // Bind via prepared param-style to dodge any shell-like quoting
    // surprises (path with spaces / quotes).
    this._db.prepare('VACUUM INTO ?').run(targetPath);
    let bytes = null;
    try { bytes = fs2.statSync(targetPath).size; } catch { /* tolerate */ }
    return { path: targetPath, bytes };
  }

  // Run SQLite's `PRAGMA integrity_check`. Returns
  // `{ok: true}` when the DB is consistent, `{ok: false, errors:
  // [...]}` when corruption is detected. Cheap on small DBs;
  // O(rows) on large ones. Operator-triggered (via doctor) — not
  // run on every read.
  integrityCheck() {
    try {
      const rows = this._db.prepare('PRAGMA integrity_check').all();
      const messages = rows.map((r) => r.integrity_check);
      const ok = messages.length === 1 && messages[0] === 'ok';
      return ok ? { ok: true } : { ok: false, errors: messages };
    } catch (err) {
      return { ok: false, errors: [`integrity_check threw: ${err.message}`] };
    }
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
