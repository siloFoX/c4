'use strict';

// External Claude session import (8.17).
//
// Registers Claude Code JSONL transcripts that live outside the c4
// worktree tree as read-only "attached" workers. The daemon + Web UI
// can then parse them through the existing 8.18 session-parser, while
// the CLI mirrors `c4 new` so attach feels native to the fleet.
//
// Persistence: ~/.c4/attached.json. Shape:
//   { sessions: [{ name, jsonlPath, sessionId, projectPath,
//                  createdAt, lastOffset }] }
// Persisted state survives daemon restart so the Web UI viewer still
// lists whatever the operator attached last week.
//
// Design notes
// ------------
// 1. Pure module with no coupling to PtyManager. The daemon wires it
//    into `manager.workers` with `kind: 'attached'` so the unified
//    listing treats attached sessions as read-only siblings of the
//    spawned PTY workers. Removing that coupling makes the module
//    trivial to unit-test against a tmpdir.
// 2. Session lookup by UUID walks the Claude Code projects root
//    (`sessionParser.defaultProjectsRoot()` unless overridden). Multi
//    matches surface as ambiguity errors instead of picking one
//    silently — operators can re-run with the full path to resolve.
// 3. `resolveSessionPath` treats the first positional argument as a
//    path when it contains a separator or ends with `.jsonl`; anything
//    else is looked up as a session id. This matches the spec's
//    "absolute .jsonl path or a session UUID" contract while still
//    letting relative paths work for ergonomic CLI use.
// 4. All filesystem errors become structured `{ error, code }` return
//    values instead of thrown exceptions so callers (CLI, daemon,
//    web) can render consistent messages.

const fs = require('fs');
const os = require('os');
const path = require('path');

const sessionParser = require('./session-parser');

function defaultAttachedStorePath() {
  return path.join(os.homedir(), '.c4', 'attached.json');
}

function freshState() {
  return { sessions: [] };
}

function isValidName(name) {
  return typeof name === 'string' && /^[A-Za-z0-9._-]+$/.test(name) && name.length > 0;
}

function sanitizeName(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const cleaned = raw.replace(/[^A-Za-z0-9._-]/g, '-').replace(/^-+|-+$/g, '');
  return cleaned.slice(0, 60);
}

// Build a stable default name from the session id so repeated attach
// commands collide (triggering a clear error) instead of silently
// stacking duplicate rows.
function defaultNameFor(sessionId, jsonlPath) {
  if (sessionId && typeof sessionId === 'string') {
    const short = sessionId.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 12);
    if (short) return 'attached-' + short;
  }
  if (jsonlPath && typeof jsonlPath === 'string') {
    const base = sanitizeName(path.basename(jsonlPath, '.jsonl'));
    if (base) return 'attached-' + base.slice(0, 12);
  }
  return 'attached-' + Date.now().toString(36);
}

// Centralize shape normalization so tests and the daemon load the same
// records even if the file was written by an older c4 build.
function normalizeRecord(rec) {
  if (!rec || typeof rec !== 'object') return null;
  const name = typeof rec.name === 'string' ? rec.name : '';
  if (!isValidName(name)) return null;
  const jsonlPath = typeof rec.jsonlPath === 'string' ? rec.jsonlPath : '';
  if (!jsonlPath) return null;
  return {
    name,
    jsonlPath,
    sessionId: typeof rec.sessionId === 'string' ? rec.sessionId : null,
    projectPath: typeof rec.projectPath === 'string' ? rec.projectPath : null,
    createdAt: typeof rec.createdAt === 'string' ? rec.createdAt : null,
    lastOffset: Number.isFinite(rec.lastOffset) ? rec.lastOffset : 0,
  };
}

class AttachStore {
  constructor(opts = {}) {
    this.storePath = (opts && opts.storePath) || defaultAttachedStorePath();
    this._state = null;
  }

  _load() {
    if (this._state) return this._state;
    if (!fs.existsSync(this.storePath)) {
      this._state = freshState();
      return this._state;
    }
    try {
      const raw = fs.readFileSync(this.storePath, 'utf8');
      const parsed = raw && raw.length > 0 ? JSON.parse(raw) : {};
      const sessions = Array.isArray(parsed.sessions) ? parsed.sessions : [];
      this._state = {
        sessions: sessions.map(normalizeRecord).filter(Boolean),
      };
    } catch {
      this._state = freshState();
    }
    return this._state;
  }

  _persist() {
    const dir = path.dirname(this.storePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(
      this.storePath,
      JSON.stringify(this._state, null, 2) + '\n',
    );
  }

  reload() {
    this._state = null;
    return this._load();
  }

  list() {
    const state = this._load();
    return state.sessions.map((s) => ({ ...s }));
  }

  get(name) {
    if (!isValidName(name)) return null;
    const state = this._load();
    const found = state.sessions.find((s) => s.name === name);
    return found ? { ...found } : null;
  }

  getByPath(jsonlPath) {
    if (!jsonlPath || typeof jsonlPath !== 'string') return null;
    const state = this._load();
    const found = state.sessions.find((s) => s.jsonlPath === jsonlPath);
    return found ? { ...found } : null;
  }

  add(record) {
    const normalized = normalizeRecord(record);
    if (!normalized) throw new Error('Invalid attachment record');
    const state = this._load();
    if (state.sessions.some((s) => s.name === normalized.name)) {
      throw new Error(`Attachment '${normalized.name}' already exists`);
    }
    state.sessions.push(normalized);
    this._persist();
    return { ...normalized };
  }

  remove(name) {
    if (!isValidName(name)) return false;
    const state = this._load();
    const before = state.sessions.length;
    state.sessions = state.sessions.filter((s) => s.name !== name);
    if (state.sessions.length === before) return false;
    this._persist();
    return true;
  }
}

// Resolve the first positional argument ("session") into an absolute
// JSONL path plus a session id. Accepts:
//   - an existing .jsonl file path (absolute or relative)
//   - a bare UUID that appears exactly once under projectsRoot
// Returns { path, sessionId, projectDir, projectPath } on success, or
// { error, code } on failure so callers can format human output.
function resolveSessionPath(input, opts = {}) {
  if (!input || typeof input !== 'string') {
    return { error: 'Session id or path is required', code: 'MISSING_INPUT' };
  }
  const trimmed = input.trim();
  if (!trimmed) return { error: 'Session id or path is required', code: 'MISSING_INPUT' };

  const looksLikePath =
    trimmed.endsWith('.jsonl') ||
    trimmed.includes(path.sep) ||
    trimmed.includes('/') ||
    trimmed.includes('\\');

  if (looksLikePath) {
    const abs = path.isAbsolute(trimmed) ? trimmed : path.resolve(trimmed);
    if (!fs.existsSync(abs)) {
      return { error: `File not found: ${abs}`, code: 'ENOENT' };
    }
    if (!abs.endsWith('.jsonl')) {
      return { error: `Not a .jsonl file: ${abs}`, code: 'BAD_EXT' };
    }
    const stat = fs.statSync(abs);
    if (!stat.isFile()) {
      return { error: `Not a regular file: ${abs}`, code: 'NOT_FILE' };
    }
    return {
      path: abs,
      sessionId: path.basename(abs, '.jsonl'),
      projectDir: path.basename(path.dirname(abs)),
      projectPath: sessionParser.decodeProjectDir(path.basename(path.dirname(abs))),
    };
  }

  // Treat as a session id / UUID and walk projectsRoot.
  const root = opts.projectsRoot || sessionParser.defaultProjectsRoot();
  let sessions;
  try {
    sessions = sessionParser.listSessions(root);
  } catch (err) {
    return { error: `Failed to scan ${root}: ${err.message}`, code: 'SCAN_FAILED' };
  }
  const matches = sessions.filter((s) => s.sessionId === trimmed);
  if (matches.length === 0) {
    return {
      error: `Session id not found under ${root}: ${trimmed}`,
      code: 'NOT_FOUND',
    };
  }
  if (matches.length > 1) {
    return {
      error: `Ambiguous session id '${trimmed}' matches ${matches.length} files: ${matches
        .map((m) => m.path)
        .join(', ')}`,
      code: 'AMBIGUOUS',
      matches: matches.map((m) => m.path),
    };
  }
  const m = matches[0];
  return {
    path: m.path,
    sessionId: m.sessionId,
    projectDir: m.projectDir,
    projectPath: m.projectPath,
  };
}

// Read and parse the attached JSONL, return a compact summary the CLI
// and Web UI can both show without pulling the whole Conversation
// payload. Warnings are preserved so the caller can surface
// malformed-line counts next to the totals.
function summarize(jsonlPath) {
  const conv = sessionParser.parseJsonl(jsonlPath);
  return {
    sessionId: conv.sessionId,
    projectPath: conv.projectPath,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
    model: conv.model,
    turns: conv.turns.length,
    tokens: {
      input: conv.totalInputTokens,
      output: conv.totalOutputTokens,
    },
    warnings: conv.warnings.length,
  };
}

// Attach a session record to the store, summarizing the JSONL as we
// go. Returns the persisted record + the parse summary so the daemon
// response can include both without a second parse.
function attach(input, opts = {}) {
  const store = opts.store || new AttachStore(opts);
  const resolved = resolveSessionPath(input, opts);
  if (resolved.error) return resolved;

  const existingByPath = store.getByPath(resolved.path);
  if (existingByPath) {
    return {
      error: `Path already attached as '${existingByPath.name}': ${resolved.path}`,
      code: 'ALREADY_ATTACHED',
      existing: existingByPath,
    };
  }

  const requestedName = opts.name && typeof opts.name === 'string'
    ? sanitizeName(opts.name)
    : '';
  let name = requestedName || defaultNameFor(resolved.sessionId, resolved.path);
  if (!isValidName(name)) {
    return { error: `Invalid attachment name: ${opts.name}`, code: 'BAD_NAME' };
  }

  // If the generated name already exists, append a numeric suffix so
  // attaching multiple different files that share a session id prefix
  // does not fail with a generic "already exists".
  const baseName = name;
  let suffix = 2;
  while (store.get(name)) {
    name = `${baseName}-${suffix}`;
    suffix += 1;
    if (suffix > 99) {
      return { error: 'Unable to derive a free attachment name', code: 'NAME_COLLISION' };
    }
  }

  let summary;
  try {
    summary = summarize(resolved.path);
  } catch (err) {
    return { error: `Failed to parse ${resolved.path}: ${err.message}`, code: 'PARSE_FAILED' };
  }

  let lastOffset = 0;
  try { lastOffset = fs.statSync(resolved.path).size; } catch { lastOffset = 0; }

  // Prefer the session id recorded inside the JSONL - the filename
  // stem is typically the same uuid, but when an operator attaches a
  // renamed export the in-file id stays authoritative.
  const record = {
    name,
    jsonlPath: resolved.path,
    sessionId: summary.sessionId || resolved.sessionId || null,
    projectPath: summary.projectPath || resolved.projectPath || null,
    createdAt: new Date().toISOString(),
    lastOffset,
  };

  let persisted;
  try {
    persisted = store.add(record);
  } catch (err) {
    return { error: err.message, code: 'STORE_FAILED' };
  }

  return {
    ok: true,
    record: persisted,
    summary,
  };
}

function detach(name, opts = {}) {
  const store = opts.store || new AttachStore(opts);
  const removed = store.remove(name);
  if (!removed) {
    return { error: `Attachment not found: ${name}`, code: 'NOT_FOUND' };
  }
  return { ok: true };
}

function listAttached(opts = {}) {
  const store = opts.store || new AttachStore(opts);
  return store.list();
}

// Daemon-wide shared instance. Tests build their own AttachStore with
// a tmpdir path so they never touch the operator's real file.
let _shared = null;
function getShared(opts) {
  if (!_shared) _shared = new AttachStore(opts);
  return _shared;
}
function resetShared() {
  _shared = null;
}

module.exports = {
  AttachStore,
  defaultAttachedStorePath,
  freshState,
  normalizeRecord,
  sanitizeName,
  defaultNameFor,
  isValidName,
  resolveSessionPath,
  summarize,
  attach,
  detach,
  listAttached,
  getShared,
  resetShared,
};
