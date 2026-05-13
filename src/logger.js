'use strict';

// (v1.11.100 / TODO 11.82) Structured logger for the daemon side. Wraps
// pino so the rest of src/*.js can call .trace/.debug/.info/.warn/.error
// without hand-rolling a JSON line. CLI files keep using console.* —
// they're operator-facing.
//
// Config shape (top-level, opt-in; missing block = stdout / info):
//   {
//     logging: {
//       path:    '/abs/path/c4.log' | null,   // null = stdout only
//       level:   'trace'|'debug'|'info'|'warn'|'error',
//       pretty:  true | false,                 // pretty-print to stderr if TTY
//       maxSize: 10485760 | null               // bytes; null disables rotation
//     }
//   }
//
// Rotation contract (one-step, good enough for daemon lifetime):
//   - Caller writes a line via the wrapped destination stream.
//   - On every write past `maxSize`, the destination renames the current
//     file to `<path>.1` (clobbering any previous rotation) and opens a
//     fresh append stream. Only one rotated file is kept — the daemon's
//     long-running process produces a steady trickle of lines, not a
//     burst, so a multi-step ring buffer would be over-engineering.
//
// Module-level singleton + factory:
//   - getLogger() returns the lazily-built default instance.
//   - createLogger(opts) builds a fresh instance, used by tests and by
//     callers that want a custom level / destination without mutating
//     the singleton.

const fs = require('fs');
const path = require('path');
const pino = require('pino');

const VALID_LEVELS = new Set(['trace', 'debug', 'info', 'warn', 'error', 'fatal']);
const DEFAULT_LEVEL = 'info';

function _safeConfig(input) {
  // Coerce arbitrary input (including missing / wrong-type keys) to a
  // safe shape. Anything we don't recognise falls back to the default —
  // a malformed config block must NOT crash the daemon at startup.
  const out = { path: null, level: DEFAULT_LEVEL, pretty: false, maxSize: null };
  if (!input || typeof input !== 'object') return out;
  if (typeof input.path === 'string' && input.path.length > 0) out.path = input.path;
  if (typeof input.level === 'string' && VALID_LEVELS.has(input.level)) out.level = input.level;
  if (typeof input.pretty === 'boolean') out.pretty = input.pretty;
  if (Number.isFinite(input.maxSize) && input.maxSize > 0) out.maxSize = Math.floor(input.maxSize);
  return out;
}

// RotatingFileDestination — a Writable-shaped object that pino accepts.
// Synchronous fd-based writes so the on-disk file is always present
// when the next write/rotate runs. createWriteStream is lazy (the
// inode appears only after the buffer flushes), so rename can race the
// first batch and silently lose the rotated file — fd-based writes
// sidestep that.
function _createRotatingDestination(filePath, maxSize, deps) {
  const _fs = (deps && deps.fs) || fs;
  const _path = (deps && deps.path) || path;

  const dir = _path.dirname(filePath);
  _fs.mkdirSync(dir, { recursive: true });

  let fd = _fs.openSync(filePath, 'a');
  // Seed the byte counter from the existing file so a restart doesn't
  // reset the rotation clock.
  let bytes = 0;
  try {
    const stat = _fs.statSync(filePath);
    bytes = stat.size;
  } catch {
    bytes = 0;
  }

  function _rotate() {
    try { _fs.closeSync(fd); } catch {}
    try { _fs.renameSync(filePath, filePath + '.1'); } catch {}
    fd = _fs.openSync(filePath, 'a');
    bytes = 0;
  }

  return {
    write(chunk) {
      const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      // Rotate BEFORE writing past the cap so the next chunk lands in
      // the fresh file. A short final line in the old file is fine —
      // simpler than splitting chunks across two files.
      if (maxSize && bytes + buf.length > maxSize) {
        _rotate();
      }
      _fs.writeSync(fd, buf);
      bytes += buf.length;
    },
    end() {
      try { _fs.closeSync(fd); } catch {}
    },
    // Test hooks — expose internal counters without monkey-patching.
    _bytesWritten() { return bytes; },
    _rotateNow() { _rotate(); },
  };
}

function _buildPrettyTransport() {
  // pino.transport spawns a worker thread that pipes through
  // pino-pretty. We only enable this when stdout is a TTY (operator is
  // watching live) — in production / under nohup, pretty-printing is
  // useless overhead and breaks downstream JSON parsing.
  return pino.transport({
    target: 'pino-pretty',
    options: { colorize: true, destination: 2 }, // stderr
  });
}

function createLogger(opts) {
  const o = opts || {};
  const cfg = _safeConfig(o.logging);
  const isTTY = typeof o.isTTY === 'boolean'
    ? o.isTTY
    : !!(process.stdout && process.stdout.isTTY);

  const pinoOpts = { level: cfg.level };

  // Destination resolution order:
  //   (1) opts.destination — tests inject a stream directly.
  //   (2) cfg.path + cfg.maxSize — file with optional rotation.
  //   (3) cfg.pretty + TTY  — pino-pretty transport.
  //   (4) default            — pino's stdout JSON stream.
  let destination = o.destination || null;
  if (!destination && cfg.path) {
    destination = _createRotatingDestination(cfg.path, cfg.maxSize, o._deps);
  }
  if (!destination && cfg.pretty && isTTY) {
    destination = _buildPrettyTransport();
  }

  const instance = destination ? pino(pinoOpts, destination) : pino(pinoOpts);
  // Stash the resolved config + raw destination for tests / introspection.
  instance._c4Config = cfg;
  instance._c4Destination = destination;
  return instance;
}

let _singleton = null;
function getLogger() {
  if (_singleton) return _singleton;
  let cfg = {};
  try {
    const root = path.resolve(__dirname, '..');
    cfg = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
  } catch {
    cfg = {};
  }
  _singleton = createLogger({ logging: cfg.logging });
  return _singleton;
}

// Reset singleton — for tests + config reload paths. Production code
// should not call this on a hot path.
function _resetLogger() {
  if (_singleton && _singleton._c4Destination && typeof _singleton._c4Destination.end === 'function') {
    try { _singleton._c4Destination.end(); } catch {}
  }
  _singleton = null;
}

module.exports = {
  createLogger,
  getLogger,
  // Internals — exported for tests only.
  _safeConfig,
  _createRotatingDestination,
  _resetLogger,
  VALID_LEVELS,
};
