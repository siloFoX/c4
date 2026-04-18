'use strict';

// (10.9) Scribe v2 — structured event log.
//
// The original src/scribe.js owns text-dump summarization of Claude Code
// session transcripts; this module is a separate, event-driven layer that
// records typed daemon events as JSONL so the Web UI + `c4 events` CLI can
// reconstruct a timeline without replaying an entire session transcript.
//
// Design:
// 1. One append-only file per UTC day at ~/.c4/events-YYYY-MM-DD.jsonl.
//    Each line is one event; append uses fs.appendFileSync so ordering is
//    deterministic under concurrent callers (JS is single-threaded, and
//    the O_APPEND flag gives per-line atomicity at the OS level).
// 2. record() is fire-and-forget from the daemon's perspective: it
//    synchronously writes and swallows any I/O error (wrapped in
//    try/catch) so a broken disk never takes down the request path.
// 3. query() walks only the JSONL files whose UTC day range overlaps
//    the filter, so a multi-year archive does not pay to filter.
// 4. contextAround() is a thin wrapper over query() that translates
//    an event id / ISO timestamp / Date into a [t-before, t+after]
//    query window.
// 5. Tests point logDir at a tmpdir and never touch the operator's real
//    ~/.c4/ files.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

// Canonical event type names. Unknown types are rejected at record() so
// typos surface early instead of polluting the timeline.
const EVENT_TYPES = Object.freeze([
  'task_start',
  'task_complete',
  'worker_spawn',
  'worker_close',
  'tool_call',
  'approval_request',
  'approval_grant',
  'merge_attempt',
  'merge_success',
  'halt',
  'error',
]);

const EVENT_TYPE_SET = new Set(EVENT_TYPES);

const FILE_PREFIX = 'events-';
const FILE_SUFFIX = '.jsonl';
const FILE_PATTERN = /^events-(\d{4}-\d{2}-\d{2})\.jsonl$/;

const MS_PER_DAY = 86400000;

function defaultLogDir() {
  return path.join(os.homedir(), '.c4');
}

function isValidEventType(t) {
  return typeof t === 'string' && EVENT_TYPE_SET.has(t);
}

// Format a Date as YYYY-MM-DD in UTC. Using UTC keeps file names stable
// regardless of the operator's local timezone, so a single daemon host
// cannot split one logical day across two files when DST shifts.
function formatYMD(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Parse a YYYY-MM-DD filename chunk back into the UTC millisecond of
// midnight at the start of that day. Returns NaN when the string does
// not look like a valid date (e.g. 2026-13-45).
function parseYMD(ymd) {
  if (typeof ymd !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return NaN;
  const ms = Date.parse(ymd + 'T00:00:00.000Z');
  return Number.isFinite(ms) ? ms : NaN;
}

function nextId() {
  // Monotonic-ish prefix (ms base36) + 8 hex chars of randomness. The
  // prefix keeps ids roughly time-sorted when dumped raw, and the random
  // tail eliminates collisions inside the same millisecond.
  return Date.now().toString(36) + '-' + crypto.randomBytes(4).toString('hex');
}

function normalizePayload(p) {
  if (p == null) return {};
  if (typeof p !== 'object' || Array.isArray(p)) return {};
  return p;
}

class ScribeV2 {
  constructor(opts = {}) {
    this.logDir = (opts && typeof opts.logDir === 'string' && opts.logDir.length > 0)
      ? opts.logDir
      : defaultLogDir();
    this._now = typeof (opts && opts.now) === 'function' ? opts.now : () => new Date();
    this._dirEnsured = false;
  }

  _ensureDir() {
    if (this._dirEnsured) return;
    try {
      if (!fs.existsSync(this.logDir)) fs.mkdirSync(this.logDir, { recursive: true });
    } catch {
      // Ignore — if the dir is unavailable the first appendFileSync
      // below will surface an error, which we still swallow because
      // record() is best-effort.
    }
    this._dirEnsured = true;
  }

  _fileForDate(date) {
    const ymd = formatYMD(date);
    if (!ymd) return null;
    return path.join(this.logDir, FILE_PREFIX + ymd + FILE_SUFFIX);
  }

  // record({type, worker?, task_id?, payload?, ts?, id?})
  //   -> the stored event on success, or null on rejection.
  //
  // Fire-and-forget: the daemon does not have to await or handle errors.
  // We use appendFileSync under the hood — it is synchronous but fast,
  // and it guarantees ordering under bursts without needing a write queue.
  record(event) {
    if (!event || typeof event !== 'object') return null;
    if (!isValidEventType(event.type)) return null;

    const ts = typeof event.ts === 'string' && event.ts.length > 0
      ? event.ts
      : this._now().toISOString();

    const ev = {
      id: typeof event.id === 'string' && event.id.length > 0 ? event.id : nextId(),
      ts,
      type: event.type,
      worker: (typeof event.worker === 'string' && event.worker.length > 0) ? event.worker : null,
      task_id: (typeof event.task_id === 'string' && event.task_id.length > 0) ? event.task_id : null,
      payload: normalizePayload(event.payload),
    };

    try {
      this._ensureDir();
      const file = this._fileForDate(new Date(ts));
      if (!file) return null;
      fs.appendFileSync(file, JSON.stringify(ev) + '\n');
    } catch {
      // Swallowed intentionally — see module doc. The caller never pays
      // for a broken disk.
    }
    return ev;
  }

  // query({from?, to?, types?, workers?, limit?, reverse?})
  //
  // from/to accept ISO 8601 strings, numeric ms, or Date objects.
  // types/workers accept a single string or an array; an empty array
  // means "no filter" (same as omitting).
  // limit > 0 caps the returned count; reverse=true returns newest
  // first.
  query(filter) {
    const f = filter && typeof filter === 'object' ? filter : {};
    const fromMs = toMs(f.from);
    const toMs2 = toMs(f.to);
    const types = toStringSet(f.types);
    const workers = toStringSet(f.workers);
    const limit = Number.isFinite(f.limit) && f.limit > 0 ? Math.floor(f.limit) : 0;
    const reverse = Boolean(f.reverse);

    const files = this._listFiles(fromMs, toMs2);
    const results = [];

    for (const file of files) {
      const lines = readLines(file);
      for (const line of lines) {
        let ev;
        try { ev = JSON.parse(line); } catch { continue; }
        if (!ev || typeof ev !== 'object') continue;
        if (types && !types.has(ev.type)) continue;
        if (workers) {
          // workers filter includes null worker only when the caller
          // explicitly asked for it.
          const w = typeof ev.worker === 'string' ? ev.worker : '';
          if (!workers.has(w)) continue;
        }
        const evMs = Date.parse(ev.ts);
        if (Number.isFinite(fromMs) && evMs < fromMs) continue;
        if (Number.isFinite(toMs2) && evMs > toMs2) continue;
        results.push(ev);
      }
    }

    // File order is oldest-first by day, but within a file the lines are
    // already chronological because appendFileSync is ordered.
    if (reverse) results.reverse();
    if (limit > 0 && results.length > limit) {
      return reverse ? results.slice(0, limit) : results.slice(0, limit);
    }
    return results;
  }

  // contextAround(target, minutesBefore=5, minutesAfter=5)
  //
  // target can be an event id string, an ISO timestamp, a numeric ms, or
  // a Date. Returns every event in [t-before, t+after] regardless of
  // type/worker so a caller can see the full cross-section.
  contextAround(target, minutesBefore, minutesAfter) {
    const before = Number.isFinite(minutesBefore) && minutesBefore >= 0
      ? Math.floor(minutesBefore * 60000) : 5 * 60000;
    const after = Number.isFinite(minutesAfter) && minutesAfter >= 0
      ? Math.floor(minutesAfter * 60000) : 5 * 60000;

    const targetMs = this._resolveTargetTime(target);
    if (!Number.isFinite(targetMs)) return [];

    return this.query({
      from: new Date(targetMs - before).toISOString(),
      to: new Date(targetMs + after).toISOString(),
    });
  }

  // findById(id) -> event | null. Walks every available JSONL file
  // newest-first so a recent id resolves without scanning ancient days.
  findById(id) {
    if (typeof id !== 'string' || id.length === 0) return null;
    const files = this._listFiles(null, null).slice().reverse();
    for (const file of files) {
      const lines = readLines(file);
      for (const line of lines) {
        try {
          const ev = JSON.parse(line);
          if (ev && ev.id === id) return ev;
        } catch {}
      }
    }
    return null;
  }

  // List all JSONL files in the log dir whose UTC day-range intersects
  // the optional [fromMs, toMs] window. Files are returned oldest-first.
  _listFiles(fromMs, toMs2) {
    if (!fs.existsSync(this.logDir)) return [];
    let entries;
    try { entries = fs.readdirSync(this.logDir); } catch { return []; }

    const dated = [];
    for (const e of entries) {
      const m = e.match(FILE_PATTERN);
      if (!m) continue;
      const dayStart = parseYMD(m[1]);
      if (!Number.isFinite(dayStart)) continue;
      const dayEnd = dayStart + MS_PER_DAY - 1;
      if (Number.isFinite(fromMs) && dayEnd < fromMs) continue;
      if (Number.isFinite(toMs2) && dayStart > toMs2) continue;
      dated.push({ path: path.join(this.logDir, e), dayStart });
    }
    dated.sort((a, b) => a.dayStart - b.dayStart);
    return dated.map((d) => d.path);
  }

  _resolveTargetTime(target) {
    if (target == null) return NaN;
    if (typeof target === 'number') return Number.isFinite(target) ? target : NaN;
    if (target instanceof Date) return target.getTime();
    if (typeof target !== 'string') return NaN;
    // Try parsing as an ISO timestamp first; fall back to event id.
    const parsed = Date.parse(target);
    if (Number.isFinite(parsed)) return parsed;
    const ev = this.findById(target);
    if (ev) return Date.parse(ev.ts);
    return NaN;
  }

  // List every day file discovered in the log dir, most recent first.
  listDays() {
    if (!fs.existsSync(this.logDir)) return [];
    let entries;
    try { entries = fs.readdirSync(this.logDir); } catch { return []; }
    const out = [];
    for (const e of entries) {
      const m = e.match(FILE_PATTERN);
      if (m) out.push(m[1]);
    }
    out.sort();
    out.reverse();
    return out;
  }
}

function toMs(v) {
  if (v == null || v === '') return NaN;
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'string') {
    const parsed = Date.parse(v);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  return NaN;
}

function toStringSet(v) {
  if (v == null) return null;
  if (typeof v === 'string') {
    return v.length > 0 ? new Set([v]) : null;
  }
  if (Array.isArray(v)) {
    const cleaned = v.filter((x) => typeof x === 'string' && x.length > 0);
    return cleaned.length > 0 ? new Set(cleaned) : null;
  }
  return null;
}

function readLines(file) {
  try {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split(/\r?\n/);
    const out = [];
    for (const l of lines) if (l.length > 0) out.push(l);
    return out;
  } catch {
    return [];
  }
}

// Daemon-wide shared instance. Tests construct their own ScribeV2 with a
// tmpdir path and call resetShared() between suites so they never leak.
let _shared = null;
function getShared(opts) {
  if (!_shared) _shared = new ScribeV2(opts);
  return _shared;
}
function resetShared() {
  _shared = null;
}

module.exports = {
  ScribeV2,
  EVENT_TYPES,
  FILE_PREFIX,
  FILE_SUFFIX,
  FILE_PATTERN,
  defaultLogDir,
  isValidEventType,
  formatYMD,
  parseYMD,
  nextId,
  normalizePayload,
  getShared,
  resetShared,
};
