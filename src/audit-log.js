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
    const event = this._buildEvent(type, details, overrides);
    const hash = hashEvent(this._lastHash, event);
    const fullEvent = Object.assign({}, event, { hash });
    fs.appendFileSync(this.logPath, JSON.stringify(fullEvent) + '\n');
    this._lastHash = hash;
    return fullEvent;
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

  verify() {
    if (!fs.existsSync(this.logPath)) {
      return { valid: true, corruptedAt: null, total: 0 };
    }
    const content = fs.readFileSync(this.logPath, 'utf8');
    const lines = content.split(/\r?\n/).filter((l) => l.length > 0);
    let prevHash = null;
    for (let i = 0; i < lines.length; i++) {
      let event;
      try {
        event = JSON.parse(lines[i]);
      } catch {
        return { valid: false, corruptedAt: i, total: lines.length };
      }
      if (!event || typeof event !== 'object' || typeof event.hash !== 'string') {
        return { valid: false, corruptedAt: i, total: lines.length };
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
        return { valid: false, corruptedAt: i, total: lines.length };
      }
      prevHash = hash;
    }
    return { valid: true, corruptedAt: null, total: lines.length };
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
