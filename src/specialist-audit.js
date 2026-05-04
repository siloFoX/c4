'use strict';

// Specialist governance audit log (Phase 1.4 of multi-specialist
// system).
//
// Append-only JSONL at ~/.c4/specialist-audit.jsonl. Every add /
// remove / import call from src/specialist-registry.js writes an
// entry so an operator can later answer "who added this
// specialist?" / "when was this score reset?" / "which import
// dropped role X?".
//
// JSONL format keeps the writer simple and the reader friendly to
// tail / grep / jq. Entries are immutable once written; rotation is
// out of scope for this slice (file grows ~hundreds of bytes per
// governance event so the unbounded growth is acceptable for
// foreseeable deployments).

const fs = require('fs');
const path = require('path');

const DEFAULT_AUDIT_PATH = path.join(process.env.HOME || '/tmp', '.c4', 'specialist-audit.jsonl');

const ACTIONS = Object.freeze({
  ADD: 'add',
  REMOVE: 'remove',
  IMPORT: 'import',
  SCORE_APPLIED: 'score-applied',
  PROMPT_REVISED: 'prompt-revised',
  TAGS_UPDATED: 'tags-updated',
  SCORE_RESET: 'score-reset',
});

function _ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

// Append a single audit entry. Best-effort: I/O failures are
// reported via stderr but do NOT throw — governance shouldn't fail
// because the audit log can't be written.
function appendAuditEntry(entry, opts = {}) {
  const auditPath = opts.auditPath || DEFAULT_AUDIT_PATH;
  const stamped = {
    ts: new Date().toISOString(),
    ...entry,
  };
  try {
    _ensureDir(auditPath);
    fs.appendFileSync(auditPath, `${JSON.stringify(stamped)}\n`);
    return true;
  } catch (err) {
    process.stderr.write(`[specialist-audit] write failed: ${err.message}\n`);
    return false;
  }
}

// Read the most recent N entries (default 50). Used by HTTP/CLI
// inspection. Returns oldest-first so a tailing reader sees them in
// chronological order.
function readRecentAuditEntries(opts = {}) {
  const auditPath = opts.auditPath || DEFAULT_AUDIT_PATH;
  const limit = Number.isFinite(opts.limit) ? Math.max(1, opts.limit) : 50;
  let raw;
  try { raw = fs.readFileSync(auditPath, 'utf8'); }
  catch (err) {
    if (err && err.code === 'ENOENT') return [];
    throw err;
  }
  const lines = raw.split('\n').filter(Boolean);
  const tail = lines.slice(-limit);
  const out = [];
  for (const l of tail) {
    try { out.push(JSON.parse(l)); }
    catch { /* skip malformed line, never crash audit reader */ }
  }
  return out;
}

// Read with optional filters. Each entry is JSON-decoded and
// matched against the action / actor filters before returning.
function queryAuditEntries(opts = {}) {
  const auditPath = opts.auditPath || DEFAULT_AUDIT_PATH;
  const action = opts.action || null;
  const actor = opts.actor || null;
  const id = opts.id || null;
  // (Phase 7.10) ISO timestamp filters. `since` is inclusive
  // (entry.ts >= since); `until` is exclusive (entry.ts < until)
  // so a "today" range can be expressed as
  // since=startOfDay until=startOfTomorrow without overlap. Bad
  // ISO strings are silently treated as "no filter".
  const since = (opts.since && Date.parse(opts.since)) || null;
  const until = (opts.until && Date.parse(opts.until)) || null;
  const limit = Number.isFinite(opts.limit) ? Math.max(1, opts.limit) : 100;
  let raw;
  try { raw = fs.readFileSync(auditPath, 'utf8'); }
  catch (err) {
    if (err && err.code === 'ENOENT') return [];
    throw err;
  }
  const lines = raw.split('\n').filter(Boolean);
  const out = [];
  // Walk from newest first so we can stop as soon as we have `limit` hits.
  for (let i = lines.length - 1; i >= 0 && out.length < limit; i -= 1) {
    let entry;
    try { entry = JSON.parse(lines[i]); }
    catch { continue; }
    if (action && entry.action !== action) continue;
    if (actor && entry.actor !== actor) continue;
    if (id && entry.id !== id && entry.targetId !== id) continue;
    if (since || until) {
      const tsMs = entry.ts ? Date.parse(entry.ts) : NaN;
      if (!Number.isFinite(tsMs)) continue;
      if (since && tsMs < since) continue;
      if (until && tsMs >= until) continue;
    }
    out.push(entry);
  }
  return out.reverse();
}

// (Phase 7.12) Operator-triggered audit log rotation.
// The audit JSONL grows unbounded by design — every governance
// change is preserved as a compliance-y record. Operators who
// notice the file ballooning (via Phase 7.11 visibility) can
// rotate it: the current file moves to a timestamped archive
// path, and a fresh empty file takes its place. Reads still see
// only the live file by default; archived files stay on disk
// alongside it for audit history.
//
// opts:
//   auditPath    main file to rotate (default DEFAULT_AUDIT_PATH)
//   archivePath  target for the moved file. If omitted, derived
//                as `<auditPath>.<ISO-second>.archived`
//   maxBytes     when set, rotation is a no-op if file size is
//                <= maxBytes. Defaults to 0 = always rotate.
//   force        when true, overwrites archivePath if it exists.
//                Default false → throws on collision.
//
// Returns `{rotated, fromBytes, archivePath}`. `rotated:false`
// means the file was below the threshold; `archivePath` will
// be null in that case.
function rotateAuditLog(opts = {}) {
  const auditPath = opts.auditPath || DEFAULT_AUDIT_PATH;
  const maxBytes = Number.isFinite(opts.maxBytes) ? opts.maxBytes : 0;
  const force = !!opts.force;
  let stat;
  try { stat = fs.statSync(auditPath); }
  catch (err) {
    if (err && err.code === 'ENOENT') {
      return { rotated: false, fromBytes: 0, archivePath: null, reason: 'audit file does not exist yet' };
    }
    throw err;
  }
  if (stat.size <= maxBytes) {
    return { rotated: false, fromBytes: stat.size, archivePath: null, reason: `size ${stat.size} <= maxBytes ${maxBytes}` };
  }
  // Default archive path: append a sortable timestamp + suffix
  // so multiple rotations on the same day each get a unique name.
  const archivePath = opts.archivePath || (() => {
    const tsSafe = new Date().toISOString().replace(/[:.]/g, '-');
    return `${auditPath}.${tsSafe}.archived`;
  })();
  if (fs.existsSync(archivePath) && !force) {
    throw new Error(`rotateAuditLog: archive path already exists (${archivePath})`);
  }
  // Atomic-ish: rename the current file to archive, then create a
  // fresh empty file in its place. fs.renameSync is atomic on the
  // same filesystem; the small window between rename and createFile
  // doesn't matter because the appendAuditEntry path uses
  // appendFileSync which creates the file if missing.
  fs.renameSync(auditPath, archivePath);
  fs.writeFileSync(auditPath, '');
  return { rotated: true, fromBytes: stat.size, archivePath };
}

module.exports = {
  appendAuditEntry,
  readRecentAuditEntries,
  queryAuditEntries,
  rotateAuditLog,
  ACTIONS,
  DEFAULT_AUDIT_PATH,
};
