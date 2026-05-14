'use strict';

// (11.189) Snapshots feature -- save + restore the current
// config.json + autonomous-queue-v10.md as a single timestamped
// JSON file under <repoRoot>/.c4/snapshots/. The daemon exposes
// list / create / restore / delete handlers via /api/snapshots*.
//
// The handlers below are pure (fs is injected) so the test suite
// can run them without spawning the daemon, mirroring the queue
// editor module pattern.

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const SNAPSHOT_DIR = '.c4/snapshots';
const CONFIG_RELATIVE = 'config.json';
const QUEUE_RELATIVE = path.join('docs', 'autonomous-queue-v10.md');
const MAX_CONFIG_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_QUEUE_BYTES = 5 * 1024 * 1024; // 5 MB
const SNAPSHOT_VERSION = 1;
// Snapshot file names look like 2026-05-14T16-30-00-123Z-ab12cd34.json.
// The id is the basename (sans .json) of one of those files; we lock
// the format down so a caller cannot pass a path traversal payload.
const ID_RE = /^[0-9A-Za-z._-]+$/;

function resolveDir(repoRoot) {
  return path.join(repoRoot, SNAPSHOT_DIR);
}

function ensureDir(fsModule, dir) {
  try {
    fsModule.mkdirSync(dir, { recursive: true });
  } catch (e) {
    if (!e || e.code !== 'EEXIST') throw e;
  }
}

function shortId() {
  return crypto.randomBytes(4).toString('hex');
}

function timestampSlug(date) {
  // ISO with `:` swapped for `-` so the slug is filesystem-safe on
  // every platform (Windows rejects `:` in filenames).
  return date.toISOString().replace(/:/g, '-');
}

function isValidId(id) {
  return typeof id === 'string' && id.length > 0 && id.length <= 200 && ID_RE.test(id);
}

function writeAtomic(filePath, content, options) {
  const opts = options || {};
  const fsModule = opts.fs || fs;
  const tmpDir = opts.tmpDir || path.dirname(filePath);
  const base = path.basename(filePath);
  const tmpPath = path.join(
    tmpDir,
    `${base}.${process.pid}.${Date.now()}.${shortId()}.tmp`,
  );
  fsModule.writeFileSync(tmpPath, content, 'utf8');
  try {
    fsModule.renameSync(tmpPath, filePath);
  } catch (e) {
    if (e && e.code === 'EXDEV') {
      fsModule.copyFileSync(tmpPath, filePath);
      try { fsModule.unlinkSync(tmpPath); } catch { /* best effort */ }
    } else {
      try { fsModule.unlinkSync(tmpPath); } catch { /* best effort */ }
      throw e;
    }
  }
}

function safeReadFile(fsModule, filePath, maxBytes) {
  let stat;
  try {
    stat = fsModule.statSync(filePath);
  } catch (e) {
    if (e && e.code === 'ENOENT') return { content: '', missing: true };
    throw e;
  }
  if (stat.size > maxBytes) {
    const err = new Error(`file too large: ${filePath} (${stat.size} > ${maxBytes})`);
    err.code = 'EFBIG';
    throw err;
  }
  return { content: fsModule.readFileSync(filePath, 'utf8'), missing: false };
}

// listSnapshots({ repoRoot, fs? }) -> { status, body }
// Body shape on success: { snapshots: [{ id, label, createdAt,
// configBytes, queueBytes }] } sorted newest first.
function listSnapshots(options) {
  const opts = options || {};
  const fsModule = opts.fs || fs;
  const repoRoot = opts.repoRoot;
  if (!repoRoot) return { status: 500, body: { error: 'repoRoot required' } };
  const dir = resolveDir(repoRoot);
  let names = [];
  try {
    names = fsModule.readdirSync(dir);
  } catch (e) {
    if (e && e.code === 'ENOENT') {
      return { status: 200, body: { snapshots: [] } };
    }
    return { status: 500, body: { error: 'failed to read snapshots dir: ' + e.message } };
  }
  const snapshots = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const full = path.join(dir, name);
    let raw;
    try {
      raw = fsModule.readFileSync(full, 'utf8');
    } catch {
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    const id = name.slice(0, -'.json'.length);
    snapshots.push({
      id,
      label: typeof parsed.label === 'string' ? parsed.label : '',
      createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : '',
      configBytes: typeof parsed.config === 'string'
        ? Buffer.byteLength(parsed.config, 'utf8')
        : (parsed.config != null ? Buffer.byteLength(JSON.stringify(parsed.config), 'utf8') : 0),
      queueBytes: typeof parsed.queue === 'string'
        ? Buffer.byteLength(parsed.queue, 'utf8')
        : 0,
    });
  }
  snapshots.sort((a, b) => {
    if (a.createdAt && b.createdAt) {
      if (a.createdAt < b.createdAt) return 1;
      if (a.createdAt > b.createdAt) return -1;
    }
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
  return { status: 200, body: { snapshots } };
}

// createSnapshot({ repoRoot, body, fs?, audit?, actor?, now? }) -> { status, body }
// Reads the live config.json + queue markdown, writes a single JSON
// snapshot under <repoRoot>/.c4/snapshots/, returns its metadata.
function createSnapshot(options) {
  const opts = options || {};
  const fsModule = opts.fs || fs;
  const repoRoot = opts.repoRoot;
  if (!repoRoot) return { status: 500, body: { error: 'repoRoot required' } };
  const body = opts.body || {};
  const labelRaw = typeof body.label === 'string' ? body.label.trim() : '';
  const label = labelRaw.slice(0, 200);

  const configPath = path.join(repoRoot, CONFIG_RELATIVE);
  const queuePath = path.join(repoRoot, QUEUE_RELATIVE);
  let configRead;
  let queueRead;
  try {
    configRead = safeReadFile(fsModule, configPath, MAX_CONFIG_BYTES);
  } catch (e) {
    return { status: 500, body: { error: 'failed to read config: ' + e.message } };
  }
  try {
    queueRead = safeReadFile(fsModule, queuePath, MAX_QUEUE_BYTES);
  } catch (e) {
    return { status: 500, body: { error: 'failed to read queue: ' + e.message } };
  }
  let configValue;
  try {
    configValue = configRead.content ? JSON.parse(configRead.content) : {};
  } catch (e) {
    return { status: 500, body: { error: 'config.json is not valid JSON: ' + e.message } };
  }
  const now = opts.now instanceof Date ? opts.now : new Date();
  const slug = timestampSlug(now);
  const sid = shortId();
  const id = `${slug}-${sid}`;
  const createdAt = now.toISOString();
  const payload = {
    id,
    label,
    createdAt,
    config: configValue,
    queue: queueRead.content,
    version: SNAPSHOT_VERSION,
  };
  const dir = resolveDir(repoRoot);
  try {
    ensureDir(fsModule, dir);
  } catch (e) {
    return { status: 500, body: { error: 'failed to create snapshots dir: ' + e.message } };
  }
  const filePath = path.join(dir, `${id}.json`);
  const serialised = JSON.stringify(payload, null, 2);
  try {
    writeAtomic(filePath, serialised, { fs: fsModule, tmpDir: opts.tmpDir || dir });
  } catch (e) {
    return { status: 500, body: { error: 'failed to write snapshot: ' + e.message } };
  }
  if (typeof opts.audit === 'function') {
    try {
      opts.audit('snapshot.create', {
        actor: opts.actor || 'system',
        id,
        label,
        configBytes: Buffer.byteLength(JSON.stringify(configValue), 'utf8'),
        queueBytes: Buffer.byteLength(queueRead.content, 'utf8'),
      });
    } catch { /* best effort */ }
  }
  return {
    status: 200,
    body: {
      id,
      label,
      createdAt,
      configBytes: Buffer.byteLength(JSON.stringify(configValue), 'utf8'),
      queueBytes: Buffer.byteLength(queueRead.content, 'utf8'),
    },
  };
}

// restoreSnapshot({ repoRoot, id, fs?, audit?, actor?, now? }) -> { status, body }
function restoreSnapshot(options) {
  const opts = options || {};
  const fsModule = opts.fs || fs;
  const repoRoot = opts.repoRoot;
  const id = opts.id;
  if (!repoRoot) return { status: 500, body: { error: 'repoRoot required' } };
  if (!isValidId(id)) return { status: 400, body: { error: 'invalid id' } };
  const filePath = path.join(resolveDir(repoRoot), `${id}.json`);
  let raw;
  try {
    raw = fsModule.readFileSync(filePath, 'utf8');
  } catch (e) {
    if (e && e.code === 'ENOENT') return { status: 404, body: { error: 'snapshot not found' } };
    return { status: 500, body: { error: 'failed to read snapshot: ' + e.message } };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { status: 500, body: { error: 'snapshot is not valid JSON: ' + e.message } };
  }
  const configValue = parsed.config;
  const queueValue = typeof parsed.queue === 'string' ? parsed.queue : '';
  if (configValue == null) {
    return { status: 500, body: { error: 'snapshot missing config' } };
  }
  const configSerialised = typeof configValue === 'string'
    ? configValue
    : JSON.stringify(configValue, null, 2);
  if (Buffer.byteLength(configSerialised, 'utf8') > MAX_CONFIG_BYTES) {
    return { status: 400, body: { error: 'snapshot config exceeds size limit' } };
  }
  if (Buffer.byteLength(queueValue, 'utf8') > MAX_QUEUE_BYTES) {
    return { status: 400, body: { error: 'snapshot queue exceeds size limit' } };
  }
  const configPath = path.join(repoRoot, CONFIG_RELATIVE);
  const queuePath = path.join(repoRoot, QUEUE_RELATIVE);
  try {
    ensureDir(fsModule, path.dirname(queuePath));
    writeAtomic(configPath, configSerialised, { fs: fsModule, tmpDir: opts.tmpDir || path.dirname(configPath) });
    writeAtomic(queuePath, queueValue, { fs: fsModule, tmpDir: opts.tmpDir || path.dirname(queuePath) });
  } catch (e) {
    return { status: 500, body: { error: 'failed to write restored files: ' + e.message } };
  }
  const restoredAt = (opts.now instanceof Date ? opts.now : new Date()).toISOString();
  if (typeof opts.audit === 'function') {
    try {
      opts.audit('snapshot.restore', {
        actor: opts.actor || 'system',
        id,
        restoredAt,
      });
    } catch { /* best effort */ }
  }
  return { status: 200, body: { restored: true, id, restoredAt } };
}

// deleteSnapshot({ repoRoot, id, fs?, audit?, actor? }) -> { status, body }
function deleteSnapshot(options) {
  const opts = options || {};
  const fsModule = opts.fs || fs;
  const repoRoot = opts.repoRoot;
  const id = opts.id;
  if (!repoRoot) return { status: 500, body: { error: 'repoRoot required' } };
  if (!isValidId(id)) return { status: 400, body: { error: 'invalid id' } };
  const filePath = path.join(resolveDir(repoRoot), `${id}.json`);
  try {
    fsModule.unlinkSync(filePath);
  } catch (e) {
    if (e && e.code === 'ENOENT') return { status: 404, body: { error: 'snapshot not found' } };
    return { status: 500, body: { error: 'failed to delete snapshot: ' + e.message } };
  }
  if (typeof opts.audit === 'function') {
    try {
      opts.audit('snapshot.delete', {
        actor: opts.actor || 'system',
        id,
      });
    } catch { /* best effort */ }
  }
  return { status: 200, body: { deleted: true, id } };
}

module.exports = {
  SNAPSHOT_DIR,
  CONFIG_RELATIVE,
  QUEUE_RELATIVE,
  MAX_CONFIG_BYTES,
  MAX_QUEUE_BYTES,
  SNAPSHOT_VERSION,
  ID_RE,
  isValidId,
  resolveDir,
  writeAtomic,
  listSnapshots,
  createSnapshot,
  restoreSnapshot,
  deleteSnapshot,
};
