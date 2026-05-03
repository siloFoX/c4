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
    out.push(entry);
  }
  return out.reverse();
}

module.exports = {
  appendAuditEntry,
  readRecentAuditEntries,
  queryAuditEntries,
  ACTIONS,
  DEFAULT_AUDIT_PATH,
};
