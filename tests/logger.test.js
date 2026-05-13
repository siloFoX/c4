'use strict';

// Tests for src/logger.js — pino-based structured logger
// (v1.11.100 / TODO 11.82).
//
// Covers the four configuration paths (default stdout, file with
// rotation, pretty TTY transport, malformed config fallback) plus an
// integration-style sweep that drives each level through the real pino
// instance and verifies the JSON line landed in a captured destination.
//
// Mock surface:
//   - Capturing destination: `{ write, end, lines[] }` — passed via
//     opts.destination so the real pino pipeline runs without spawning
//     a worker thread for pino-pretty.
//   - Stub fs: minimal subset (mkdirSync, openSync, writeSync,
//     closeSync, statSync, renameSync) injected through opts._deps.fs
//     for the rotation + mkdir-recursive cases.

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  createLogger,
  _safeConfig,
  _createRotatingDestination,
  _resetLogger,
  VALID_LEVELS,
} = require('../src/logger');

function makeCapturingDestination() {
  const lines = [];
  return {
    write(chunk) {
      const s = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      // pino emits one JSON object per line; split on newline so a
      // multi-line write (rare but possible) doesn't merge into one
      // entry.
      for (const part of s.split('\n')) {
        if (part) lines.push(part);
      }
    },
    end() {},
    lines,
  };
}

function parseLine(line) {
  try { return JSON.parse(line); } catch { return null; }
}

let _tmpRoots = [];
function makeTmp(prefix = 'c4logger-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  _tmpRoots.push(dir);
  return dir;
}
after(() => {
  for (const d of _tmpRoots) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch {}
  }
  _tmpRoots = [];
});

describe('logger._safeConfig', () => {
  it('returns defaults when input is missing or non-object', () => {
    const cfg = _safeConfig(null);
    assert.deepStrictEqual(cfg, { path: null, level: 'info', pretty: false, maxSize: null });
    assert.deepStrictEqual(_safeConfig(undefined), cfg);
    assert.deepStrictEqual(_safeConfig('garbage'), cfg);
    assert.deepStrictEqual(_safeConfig(42), cfg);
  });

  it('honours valid level values and rejects unknown ones', () => {
    assert.strictEqual(_safeConfig({ level: 'trace' }).level, 'trace');
    assert.strictEqual(_safeConfig({ level: 'debug' }).level, 'debug');
    assert.strictEqual(_safeConfig({ level: 'warn' }).level, 'warn');
    assert.strictEqual(_safeConfig({ level: 'error' }).level, 'error');
    // Unknown level falls back to default.
    assert.strictEqual(_safeConfig({ level: 'verbose' }).level, 'info');
    assert.strictEqual(_safeConfig({ level: 42 }).level, 'info');
  });

  it('only accepts non-empty string paths and positive numeric maxSize', () => {
    assert.strictEqual(_safeConfig({ path: '' }).path, null);
    assert.strictEqual(_safeConfig({ path: '/var/log/c4.log' }).path, '/var/log/c4.log');
    assert.strictEqual(_safeConfig({ maxSize: -1 }).maxSize, null);
    assert.strictEqual(_safeConfig({ maxSize: 0 }).maxSize, null);
    assert.strictEqual(_safeConfig({ maxSize: 1024 }).maxSize, 1024);
    assert.strictEqual(_safeConfig({ maxSize: 1024.7 }).maxSize, 1024);
  });
});

describe('logger.createLogger - level', () => {
  it('respects level=info by default and skips debug lines', () => {
    const dest = makeCapturingDestination();
    const log = createLogger({ destination: dest });
    log.debug('hidden');
    log.info('visible');
    assert.strictEqual(dest.lines.length, 1);
    assert.strictEqual(parseLine(dest.lines[0]).msg, 'visible');
  });

  it('respects level=debug when explicitly configured', () => {
    const dest = makeCapturingDestination();
    const log = createLogger({ logging: { level: 'debug' }, destination: dest });
    log.trace('still hidden');
    log.debug('shown');
    log.info('shown too');
    assert.strictEqual(dest.lines.length, 2);
    assert.strictEqual(parseLine(dest.lines[0]).msg, 'shown');
    assert.strictEqual(parseLine(dest.lines[1]).msg, 'shown too');
  });

  it('falls back to info when level is malformed', () => {
    const dest = makeCapturingDestination();
    const log = createLogger({ logging: { level: 'verbose' }, destination: dest });
    log.debug('hidden');
    log.warn('shown');
    assert.strictEqual(dest.lines.length, 1);
    assert.strictEqual(parseLine(dest.lines[0]).level, 40); // warn
  });
});

describe('logger.createLogger - destination', () => {
  it('writes to the injected destination instead of stdout', () => {
    const dest = makeCapturingDestination();
    const log = createLogger({ destination: dest });
    log.info({ name: 'worker-foo' }, 'message');
    const obj = parseLine(dest.lines[0]);
    assert.strictEqual(obj.msg, 'message');
    assert.strictEqual(obj.name, 'worker-foo');
  });

  it('honours config.logging.path by opening the file', () => {
    const tmp = makeTmp();
    const fp = path.join(tmp, 'c4.log');
    const log = createLogger({ logging: { path: fp, level: 'info' } });
    log.info('to disk');
    log._c4Destination.end();
    const contents = fs.readFileSync(fp, 'utf8');
    assert.match(contents, /"msg":"to disk"/);
    assert.strictEqual(log._c4Config.path, fp);
  });

  it('creates parent directories recursively when the path is nested', () => {
    const tmp = makeTmp();
    const fp = path.join(tmp, 'a', 'b', 'c', 'c4.log');
    assert.strictEqual(fs.existsSync(path.dirname(fp)), false);
    const log = createLogger({ logging: { path: fp } });
    log.info('nested');
    log._c4Destination.end();
    assert.strictEqual(fs.existsSync(fp), true);
  });
});

describe('logger.createLogger - rotation', () => {
  it('rotates the file once total size crosses maxSize', () => {
    const tmp = makeTmp();
    const fp = path.join(tmp, 'c4.log');
    const log = createLogger({ logging: { path: fp, level: 'info', maxSize: 200 } });
    for (let i = 0; i < 30; i++) log.info({ n: i }, 'message-' + i);
    log._c4Destination.end();
    const main = fs.statSync(fp);
    assert.strictEqual(fs.existsSync(fp + '.1'), true, 'rotated file should exist');
    assert.ok(main.size <= 250, 'main file should be small after rotation, got ' + main.size);
    // Both files should contain valid JSON lines.
    const mainLines = fs.readFileSync(fp, 'utf8').trim().split('\n').filter(Boolean);
    const rotLines = fs.readFileSync(fp + '.1', 'utf8').trim().split('\n').filter(Boolean);
    for (const l of mainLines.concat(rotLines)) {
      const obj = parseLine(l);
      assert.ok(obj && obj.msg && obj.msg.startsWith('message-'), 'parseable JSON line: ' + l);
    }
  });

  it('does not rotate when maxSize is null', () => {
    const tmp = makeTmp();
    const fp = path.join(tmp, 'c4.log');
    const log = createLogger({ logging: { path: fp, level: 'info' } });
    for (let i = 0; i < 10; i++) log.info('plenty of bytes ' + 'x'.repeat(40));
    log._c4Destination.end();
    assert.strictEqual(fs.existsSync(fp + '.1'), false);
  });

  it('seeds the byte counter from an existing file', () => {
    const tmp = makeTmp();
    const fp = path.join(tmp, 'c4.log');
    fs.writeFileSync(fp, 'pre-existing content that pads out the file size for the test\n');
    const initialSize = fs.statSync(fp).size;
    const dest = _createRotatingDestination(fp, initialSize + 10);
    assert.strictEqual(dest._bytesWritten(), initialSize);
    dest.write('XX\n'); // 3 bytes - still under cap
    assert.strictEqual(fs.existsSync(fp + '.1'), false);
    dest.write('YYYYYYYYYYYYYY\n'); // pushes over the cap, rotation runs
    assert.strictEqual(fs.existsSync(fp + '.1'), true);
    dest.end();
  });
});

describe('logger.createLogger - pretty + TTY', () => {
  it('skips pretty transport when stdout is not a TTY', () => {
    const dest = makeCapturingDestination();
    // isTTY=false ensures the pretty branch is bypassed even if pretty=true.
    const log = createLogger({
      logging: { pretty: true },
      isTTY: false,
      destination: dest,
    });
    // Log + verify the JSON destination is what got used.
    log.info('still json');
    const obj = parseLine(dest.lines[0]);
    assert.strictEqual(obj.msg, 'still json');
    assert.strictEqual(log._c4Destination, dest);
  });

  it('engages the pretty transport when pretty=true and stdout is a TTY', () => {
    const log = createLogger({ logging: { pretty: true }, isTTY: true });
    // We do not assert on the transport's downstream output (it spawns a
    // worker thread). What matters is that createLogger picked the
    // pretty branch — i.e. _c4Destination is non-null and not the
    // injected one. End the transport so the worker exits.
    assert.ok(log._c4Destination, 'pretty branch should set a destination');
    try { log._c4Destination.end(); } catch {}
  });
});

describe('logger - integration sweep', () => {
  it('routes trace/debug/info/warn/error through pino at level=trace', () => {
    const dest = makeCapturingDestination();
    const log = createLogger({ logging: { level: 'trace' }, destination: dest });
    log.trace('t-msg');
    log.debug('d-msg');
    log.info('i-msg');
    log.warn('w-msg');
    log.error('e-msg');
    assert.strictEqual(dest.lines.length, 5);
    const levels = dest.lines.map((l) => parseLine(l).level);
    // pino numeric levels: trace=10, debug=20, info=30, warn=40, error=50.
    assert.deepStrictEqual(levels, [10, 20, 30, 40, 50]);
  });

  it('attaches structured fields when called with an object first arg', () => {
    const dest = makeCapturingDestination();
    const log = createLogger({ destination: dest });
    log.info({ worker: 'w42', branch: 'c4/foo', err: { code: 'X' } }, 'with ctx');
    const obj = parseLine(dest.lines[0]);
    assert.strictEqual(obj.msg, 'with ctx');
    assert.strictEqual(obj.worker, 'w42');
    assert.strictEqual(obj.branch, 'c4/foo');
    assert.deepStrictEqual(obj.err, { code: 'X' });
  });

  it('exposes VALID_LEVELS for the gate', () => {
    for (const lv of ['trace', 'debug', 'info', 'warn', 'error', 'fatal']) {
      assert.ok(VALID_LEVELS.has(lv));
    }
    assert.strictEqual(VALID_LEVELS.has('verbose'), false);
  });
});

describe('logger._resetLogger', () => {
  beforeEach(() => _resetLogger());
  after(() => _resetLogger());
  it('clears the singleton so subsequent getLogger() rebuilds', () => {
    const { getLogger } = require('../src/logger');
    const a = getLogger();
    const b = getLogger();
    assert.strictEqual(a, b);
    _resetLogger();
    const c = getLogger();
    assert.notStrictEqual(a, c);
  });
});
