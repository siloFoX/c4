'use strict';

// (10.2) Audit log.
//
// Append-only JSONL log of security-relevant events with a SHA-256 hash
// chain for tamper evidence. Each line is one JSON event with a fixed
// shape — timestamp, type, actor, target, details, hash — and the hash
// binds each event to the hash of the previous line, so any edit to an
// earlier line invalidates every subsequent hash and verify() detects
// the corruption.
//
// record() is synchronous and uses fs.appendFileSync. Because JavaScript
// is single-threaded that keeps the hash chain intact even under bursts
// of concurrent callers — each call reads _lastHash, computes the next
// hash, and appends in one run-to-completion step with no yield point.
// A crash mid-write cannot leave the file with a partial trailing line
// (the worst case is the final line was never written at all).
//
// Tests and daemon code should pass { logPath } explicitly rather than
// relying on the default ~/.c4/audit.jsonl so test runs cannot pollute
// the operator's real audit trail.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_ACTOR = 'system';

// Canonical event type names. Daemon and CLI should always pass one of
// these — unknown type strings are accepted (forward-compat) but caller
// is responsible for spelling.
const EVENT_TYPES = Object.freeze([
  'worker.created',
  'worker.closed',
  'task.sent',
  'task.completed',
  'approval.requested',
  'approval.granted',
  'approval.denied',
  'merge.performed',
  'config.reloaded',
  'auth.login',
  'auth.logout',
  'fleet.changed',
]);

function defaultLogPath() {
  return path.join(os.homedir(), '.c4', 'audit.jsonl');
}

// Serialize an event's core fields in a fixed key order so record() and
// verify() always hash the same byte string even though V8 preserves
// JSON.parse key order — fixing the order here removes that dependence.
function canonicalize(event) {
  return JSON.stringify({
    timestamp: event.timestamp,
    type: event.type,
    actor: event.actor,
    target: event.target,
    details: event.details,
  });
}

function hashEvent(prevHash, event) {
  const base = (prevHash || '') + canonicalize(event);
  return crypto.createHash('sha256').update(base).digest('hex');
}

class AuditLogger {
  constructor(opts = {}) {
    this.logPath = (opts && opts.logPath) || defaultLogPath();
    this.actor = (opts && opts.actor) || DEFAULT_ACTOR;
    // Size-based rotation. When set, record() renames audit.jsonl to
    // audit-<isoTs>.jsonl on the next append once the file exceeds
    // maxSizeBytes, then starts a fresh file. The hash chain continues
    // across rotation because _lastHash lives in memory — the new file's
    // first line still references the rotated file's last hash, so
    // verify(includeRotated:true) walks the entire history as one chain.
    // keep limits how many rotated files are retained (mtime newest-first).
    // Both defaults are 0 (rotation off) for backwards compatibility.
    this.maxSizeBytes = (opts && Number.isFinite(opts.maxSizeBytes)) ? Math.max(0, opts.maxSizeBytes) : 0;
    this.keep = (opts && Number.isFinite(opts.keep)) ? Math.max(0, opts.keep) : 0;
    this._lastHash = null;
    this._initialized = false;
  }

  _init() {
    if (this._initialized) return;
    this._initialized = true;
    const dir = path.dirname(this.logPath);
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    } catch {
      // Directory creation failures surface on the first appendFileSync
      // below — no point swallowing the error twice.
    }
    if (!fs.existsSync(this.logPath)) return;
    try {
      const content = fs.readFileSync(this.logPath, 'utf8');
      const lines = content.split(/\r?\n/).filter((l) => l.length > 0);
      if (lines.length === 0) return;
      const last = JSON.parse(lines[lines.length - 1]);
      if (last && typeof last.hash === 'string') this._lastHash = last.hash;
    } catch {
      // Corrupt tail: leave _lastHash null so the next record() writes
      // a fresh head. verify() will still flag the corruption.
      this._lastHash = null;
    }
  }

  _buildEvent(type, details, overrides) {
    const d = details && typeof details === 'object' && !Array.isArray(details)
      ? details
      : {};
    const target = typeof (overrides && overrides.target) === 'string'
      ? overrides.target
      : (typeof d.target === 'string' ? d.target : '');
    // Pull target out of details when it was sourced from details.target
    // so we do not duplicate the same string in two places.
    const detailsCopy = Object.assign({}, d);
    if (overrides && typeof overrides.target !== 'string' && typeof d.target === 'string') {
      delete detailsCopy.target;
    }
    return {
      timestamp: (overrides && overrides.timestamp) || new Date().toISOString(),
      type: String(type || ''),
      actor: (overrides && overrides.actor) || this.actor,
      target,
      details: detailsCopy,
    };
  }

  record(type, details, overrides) {
    this._init();
    this._maybeRotate();
    const event = this._buildEvent(type, details, overrides);
    const hash = hashEvent(this._lastHash, event);
    const fullEvent = Object.assign({}, event, { hash });
    fs.appendFileSync(this.logPath, JSON.stringify(fullEvent) + '\n');
    this._lastHash = hash;
    return fullEvent;
  }

  // Rotate audit.jsonl when it grows past maxSizeBytes. Renaming happens
  // before the next append so the rotated file is never half-written.
  // Hash chain continues across the rotation via _lastHash. Failure is
  // swallowed — losing one rotation is preferable to losing audit events.
  _maybeRotate() {
    if (this.maxSizeBytes <= 0) return;
    let size = 0;
    try { size = fs.statSync(this.logPath).size; } catch { return; }
    if (size < this.maxSizeBytes) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dir = path.dirname(this.logPath);
    const base = path.basename(this.logPath, '.jsonl');
    // ISOString resolution is ms; bursty rotations can collide on the
    // same stamp. Append a numeric suffix until we find a free name so
    // renameSync never silently replaces an existing rotated file.
    let rotated = path.join(dir, `${base}-${stamp}.jsonl`);
    let n = 0;
    while (fs.existsSync(rotated)) {
      n++;
      rotated = path.join(dir, `${base}-${stamp}-${n}.jsonl`);
    }
    try { fs.renameSync(this.logPath, rotated); } catch { return; }
    if (this.keep > 0) {
      try {
        const re = new RegExp('^' + base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '-.*\\.jsonl$');
        const olds = fs.readdirSync(dir)
          .filter((n) => re.test(n))
          .map((n) => ({ name: n, full: path.join(dir, n), mtime: fs.statSync(path.join(dir, n)).mtimeMs }))
          .sort((a, b) => b.mtime - a.mtime);
        for (const old of olds.slice(this.keep)) {
          try { fs.unlinkSync(old.full); } catch { /* ignore */ }
        }
      } catch { /* ignore */ }
    }
  }

  // Kept as an alias for call sites that used the previous async name.
  // Behaves identically to record().
  recordSync(type, details, overrides) {
    return this.record(type, details, overrides);
  }

  query(filter) {
    const f = filter && typeof filter === 'object' ? filter : {};
    if (!fs.existsSync(this.logPath)) return [];
    const fromTime = f.from ? Date.parse(f.from) : NaN;
    const toTime = f.to ? Date.parse(f.to) : NaN;
    const type = typeof f.type === 'string' && f.type.length > 0 ? f.type : null;
    const target = typeof f.target === 'string' && f.target.length > 0 ? f.target : null;
    const limit = Number.isFinite(f.limit) && f.limit > 0 ? Math.floor(f.limit) : 0;

    // Read line by line. For typical audit volumes (one event per worker
    // action, so thousands per day at most) a full-file read is cheaper
    // than a streaming reader because it skips the readline wakeup cost
    // on every newline.
    const content = fs.readFileSync(this.logPath, 'utf8');
    const lines = content.split(/\r?\n/);
    const results = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line || line.length === 0) continue;
      let event;
      try { event = JSON.parse(line); } catch { continue; }
      if (!event || typeof event !== 'object') continue;
      if (type && event.type !== type) continue;
      if (target && event.target !== target) continue;
      if (!Number.isNaN(fromTime)) {
        const t = Date.parse(event.timestamp);
        if (Number.isNaN(t) || t < fromTime) continue;
      }
      if (!Number.isNaN(toTime)) {
        const t = Date.parse(event.timestamp);
        if (Number.isNaN(t) || t > toTime) continue;
      }
      results.push(event);
      if (limit > 0 && results.length >= limit) break;
    }
    return results;
  }

  // verify({ includeRotated }) walks the hash chain.
  //
  // Default (no args / { includeRotated: false }): walks only the
  // current `audit.jsonl`. Note that AFTER a rotation, the live
  // file's first event was hashed against the rotated file's last
  // hash — so verifying the live file alone reports `valid: false`
  // at index 0 even though the chain is internally consistent.
  // That's a feature: the operator should know they're looking at
  // a partial slice and call with `includeRotated: true` to walk
  // the full history.
  //
  // includeRotated: true — discovers `audit-*.jsonl` siblings,
  // sorts them by mtime oldest-first, concatenates with the live
  // file, and walks the combined chain. corruptedAt indices are
  // relative to the merged stream so a 3-event live file with a
  // bad event at line 1 would surface as e.g.
  // `corruptedAt: 124, total: 200` if there were 123 rotated
  // events ahead of it. The split point is also returned as
  // `rotatedTotal` so callers can map back to file boundaries.
  verify(opts) {
    const includeRotated = !!(opts && opts.includeRotated);
    const liveExists = fs.existsSync(this.logPath);

    // Collect rotated file paths (oldest first) when requested.
    const rotatedFiles = [];
    if (includeRotated) {
      try {
        const dir = path.dirname(this.logPath);
        const base = path.basename(this.logPath, '.jsonl');
        const re = new RegExp('^' + base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '-.*\\.jsonl$');
        const rotated = fs.readdirSync(dir)
          .filter((n) => re.test(n))
          .map((n) => ({
            full: path.join(dir, n),
            mtime: fs.statSync(path.join(dir, n)).mtimeMs,
          }))
          .sort((a, b) => a.mtime - b.mtime);
        for (const r of rotated) rotatedFiles.push(r.full);
      } catch {
        // Treat directory read failures as "no rotated files" — the
        // live-file walk below still happens.
      }
    }

    if (!liveExists && rotatedFiles.length === 0) {
      return { valid: true, corruptedAt: null, total: 0, rotatedTotal: 0 };
    }

    // Concatenate rotated + live without an explicit merged file —
    // we just stream lines through the same loop.
    const allFiles = rotatedFiles.slice();
    if (liveExists) allFiles.push(this.logPath);
    const lines = [];
    let rotatedTotal = 0;
    for (let f = 0; f < allFiles.length; f++) {
      const file = allFiles[f];
      let content;
      try { content = fs.readFileSync(file, 'utf8'); } catch { continue; }
      const fileLines = content.split(/\r?\n/).filter((l) => l.length > 0);
      if (file !== this.logPath) rotatedTotal += fileLines.length;
      for (const l of fileLines) lines.push(l);
    }

    let prevHash = null;
    for (let i = 0; i < lines.length; i++) {
      let event;
      try {
        event = JSON.parse(lines[i]);
      } catch {
        return { valid: false, corruptedAt: i, total: lines.length, rotatedTotal };
      }
      if (!event || typeof event !== 'object' || typeof event.hash !== 'string') {
        return { valid: false, corruptedAt: i, total: lines.length, rotatedTotal };
      }
      const hash = event.hash;
      const core = {
        timestamp: event.timestamp,
        type: event.type,
        actor: event.actor,
        target: event.target,
        details: event.details,
      };
      const expected = hashEvent(prevHash, core);
      if (expected !== hash) {
        return { valid: false, corruptedAt: i, total: lines.length, rotatedTotal };
      }
      prevHash = hash;
    }
    return { valid: true, corruptedAt: null, total: lines.length, rotatedTotal };
  }
}

// Daemon-wide shared instance. Tests construct their own AuditLogger
// with a tmpdir path and never touch the shared one.
let _shared = null;
function getShared(opts) {
  if (!_shared) _shared = new AuditLogger(opts);
  return _shared;
}
function resetShared() {
  _shared = null;
}

module.exports = {
  AuditLogger,
  EVENT_TYPES,
  DEFAULT_ACTOR,
  defaultLogPath,
  canonicalize,
  hashEvent,
  getShared,
  resetShared,
};
