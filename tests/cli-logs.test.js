'use strict';

// (1.11.133) `c4 logs [--tail N] [--follow|-f] [--level L] [--component C]`
// tails the pino-formatted log file the daemon writes when
// config.logging.path is set. The handler trio (runLogs +
// _formatLogLine + _buildLevelFilter + _pinoLevelName +
// _resolveLogPath) is exported from src/cli.js so tests can exercise
// each piece without spawning git or the daemon.
//
// node:test style -- matches cli-diff.test.js / cli-ui.test.js. The
// repo's CLI suite is node:test only; vitest is reserved for the
// web/ React side.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const CLI_PATH = path.resolve(__dirname, '..', 'src', 'cli.js');
const {
  runLogs,
  _pinoLevelName,
  _buildLevelFilter,
  _formatLogLine,
  _resolveLogPath,
} = require(CLI_PATH);

function tmpFile(suffix, contents) {
  const p = path.join(
    os.tmpdir(),
    `c4-logs-test-${process.pid}-${Math.random().toString(36).slice(2)}.${suffix}`
  );
  if (contents != null) {
    fs.writeFileSync(p, typeof contents === 'string' ? contents : JSON.stringify(contents));
  }
  return p;
}

function makeStream() {
  const lines = [];
  return {
    write: (chunk) => {
      lines.push(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk));
      return true;
    },
    _lines: lines,
    text() { return this._lines.join(''); },
  };
}

function makePinoLine(obj) {
  return JSON.stringify({
    level: 30,
    time: 1700000000000,
    pid: 12345,
    hostname: 'machine',
    msg: 'hello',
    ...obj,
  });
}

function writeLogFixture(linesArr) {
  return linesArr.map((o) => (typeof o === 'string' ? o : makePinoLine(o))).join('\n') + '\n';
}

function setupFixture({ logContent, logging }) {
  const logFile = tmpFile('log', logContent);
  const cfg = { logging: { path: logFile, ...(logging || {}) } };
  const cfgFile = tmpFile('json', cfg);
  return {
    cfgFile,
    logFile,
    cleanup() {
      try { fs.unlinkSync(logFile); } catch {}
      try { fs.unlinkSync(cfgFile); } catch {}
    },
  };
}

describe('c4 logs -- _pinoLevelName (1.11.133)', () => {
  it('maps canonical numeric levels to uppercase names', () => {
    assert.equal(_pinoLevelName(10), 'TRACE');
    assert.equal(_pinoLevelName(20), 'DEBUG');
    assert.equal(_pinoLevelName(30), 'INFO');
    assert.equal(_pinoLevelName(40), 'WARN');
    assert.equal(_pinoLevelName(50), 'ERROR');
    assert.equal(_pinoLevelName(60), 'FATAL');
  });

  it('uppercases an already-string level', () => {
    assert.equal(_pinoLevelName('info'), 'INFO');
    assert.equal(_pinoLevelName('Warn'), 'WARN');
  });

  it('falls back to the literal value for unknown levels', () => {
    assert.equal(_pinoLevelName(99), '99');
    assert.equal(_pinoLevelName('audit'), 'AUDIT');
  });

  it('returns empty string for null/undefined', () => {
    assert.equal(_pinoLevelName(null), '');
    assert.equal(_pinoLevelName(undefined), '');
  });
});

describe('c4 logs -- _buildLevelFilter (1.11.133)', () => {
  it('null filter passes every line through', () => {
    const pred = _buildLevelFilter(null);
    assert.equal(pred(10), true);
    assert.equal(pred(60), true);
    assert.equal(pred('info'), true);
  });

  it('name filter matches matching numeric and string levels', () => {
    const pred = _buildLevelFilter('info');
    assert.equal(pred(30), true);
    assert.equal(pred('info'), true);
    assert.equal(pred('INFO'), true);
    assert.equal(pred(20), false);
    assert.equal(pred('warn'), false);
  });

  it('numeric filter matches matching numeric and string levels', () => {
    const pred = _buildLevelFilter('40');
    assert.equal(pred(40), true);
    assert.equal(pred('warn'), true);
    assert.equal(pred('40'), true);
    assert.equal(pred(30), false);
  });

  it('drops lines where level is null/undefined', () => {
    const pred = _buildLevelFilter('info');
    assert.equal(pred(null), false);
    assert.equal(pred(undefined), false);
  });
});

describe('c4 logs -- _formatLogLine (1.11.133)', () => {
  it('formats a canonical pino line as "TIMESTAMP LEVEL [component] msg key=val"', () => {
    const line = JSON.stringify({
      level: 30,
      time: 1700000000000,
      pid: 1,
      hostname: 'h',
      component: 'daemon',
      msg: 'tick',
      worker: 'w1',
    });
    const out = _formatLogLine(line, () => true, null);
    assert.equal(out, '2023-11-14T22:13:20.000Z INFO [daemon] tick worker=w1');
  });

  it('omits the [component] segment when component is absent', () => {
    const line = JSON.stringify({ level: 30, time: 1700000000000, msg: 'plain' });
    const out = _formatLogLine(line, () => true, null);
    assert.equal(out, '2023-11-14T22:13:20.000Z INFO plain');
  });

  it('returns null when the level filter rejects the line', () => {
    const line = JSON.stringify({ level: 20, time: 1700000000000, msg: 'noisy' });
    const out = _formatLogLine(line, _buildLevelFilter('info'), null);
    assert.equal(out, null);
  });

  it('returns null when the component filter rejects the line', () => {
    const line = JSON.stringify({ level: 30, time: 1700000000000, component: 'other', msg: 'x' });
    const out = _formatLogLine(line, () => true, 'daemon');
    assert.equal(out, null);
  });

  it('passes a malformed JSON line through verbatim (no crash)', () => {
    const out = _formatLogLine('this is not json', () => true, null);
    assert.equal(out, 'this is not json');
  });

  it('serialises nested objects in extras as compact JSON', () => {
    const line = JSON.stringify({
      level: 30, time: 1700000000000, msg: 'event', tags: { kind: 'dispatch', n: 3 },
    });
    const out = _formatLogLine(line, () => true, null);
    assert.match(out, /tags=\{"kind":"dispatch","n":3\}/);
  });
});

describe('c4 logs -- _resolveLogPath (1.11.133)', () => {
  it('returns config.logging.path when present', () => {
    const cfg = tmpFile('json', { logging: { path: '/var/log/c4.log' } });
    try {
      assert.equal(_resolveLogPath(cfg, fs), '/var/log/c4.log');
    } finally {
      fs.unlinkSync(cfg);
    }
  });

  it('returns null when logging block is absent', () => {
    const cfg = tmpFile('json', { daemon: { port: 3456 } });
    try {
      assert.equal(_resolveLogPath(cfg, fs), null);
    } finally {
      fs.unlinkSync(cfg);
    }
  });

  it('returns null when config.json does not exist', () => {
    assert.equal(_resolveLogPath('/nonexistent/path.json', fs), null);
  });

  it('returns null when config.json is malformed', () => {
    const cfg = tmpFile('json', '{ not json');
    try {
      assert.equal(_resolveLogPath(cfg, fs), null);
    } finally {
      fs.unlinkSync(cfg);
    }
  });
});

describe('c4 logs -- runLogs handler (1.11.133)', () => {
  it('default tail prints the last 100 lines when file has more', async () => {
    const lines = [];
    for (let i = 0; i < 250; i++) {
      lines.push({ level: 30, time: 1700000000000 + i, msg: `line-${i}` });
    }
    const fx = setupFixture({ logContent: writeLogFixture(lines) });
    try {
      const stdout = makeStream();
      const stderr = makeStream();
      let code = null;
      await runLogs({
        args: [],
        cfgPath: fx.cfgFile,
        stdout, stderr,
        exit: (c) => { code = c; },
      });
      assert.equal(code, 0);
      const printed = stdout.text().split('\n').filter(Boolean);
      assert.equal(printed.length, 100);
      assert.match(printed[0], /line-150/);
      assert.match(printed[printed.length - 1], /line-249/);
    } finally {
      fx.cleanup();
    }
  });

  it('default tail prints all lines when file has fewer than 100', async () => {
    const lines = [
      { level: 30, time: 1700000000000, msg: 'a' },
      { level: 30, time: 1700000001000, msg: 'b' },
      { level: 30, time: 1700000002000, msg: 'c' },
    ];
    const fx = setupFixture({ logContent: writeLogFixture(lines) });
    try {
      const stdout = makeStream();
      let code = null;
      await runLogs({
        args: [],
        cfgPath: fx.cfgFile,
        stdout,
        stderr: makeStream(),
        exit: (c) => { code = c; },
      });
      assert.equal(code, 0);
      const printed = stdout.text().split('\n').filter(Boolean);
      assert.equal(printed.length, 3);
    } finally {
      fx.cleanup();
    }
  });

  it('--tail N parses and prints the last N lines', async () => {
    const lines = [];
    for (let i = 0; i < 20; i++) lines.push({ level: 30, time: 1700000000000 + i, msg: `m-${i}` });
    const fx = setupFixture({ logContent: writeLogFixture(lines) });
    try {
      const stdout = makeStream();
      let code = null;
      await runLogs({
        args: ['--tail', '5'],
        cfgPath: fx.cfgFile,
        stdout,
        stderr: makeStream(),
        exit: (c) => { code = c; },
      });
      assert.equal(code, 0);
      const printed = stdout.text().split('\n').filter(Boolean);
      assert.equal(printed.length, 5);
      assert.match(printed[0], /m-15/);
      assert.match(printed[4], /m-19/);
    } finally {
      fx.cleanup();
    }
  });

  it('--tail 0 errors with usage and exits 1', async () => {
    const fx = setupFixture({ logContent: writeLogFixture([{ msg: 'x' }]) });
    try {
      const stderr = makeStream();
      let code = null;
      await runLogs({
        args: ['--tail', '0'],
        cfgPath: fx.cfgFile,
        stdout: makeStream(),
        stderr,
        exit: (c) => { code = c; },
      });
      assert.equal(code, 1);
      assert.match(stderr.text(), /Usage: c4 logs/);
      assert.match(stderr.text(), /--tail N must be a positive integer/);
    } finally {
      fx.cleanup();
    }
  });

  it('--tail -1 errors with usage and exits 1', async () => {
    const fx = setupFixture({ logContent: writeLogFixture([{ msg: 'x' }]) });
    try {
      const stderr = makeStream();
      let code = null;
      await runLogs({
        args: ['--tail', '-1'],
        cfgPath: fx.cfgFile,
        stdout: makeStream(),
        stderr,
        exit: (c) => { code = c; },
      });
      assert.equal(code, 1);
      assert.match(stderr.text(), /--tail N must be a positive integer/);
    } finally {
      fx.cleanup();
    }
  });

  it('--tail abc errors with usage and exits 1', async () => {
    const fx = setupFixture({ logContent: writeLogFixture([{ msg: 'x' }]) });
    try {
      const stderr = makeStream();
      let code = null;
      await runLogs({
        args: ['--tail', 'abc'],
        cfgPath: fx.cfgFile,
        stdout: makeStream(),
        stderr,
        exit: (c) => { code = c; },
      });
      assert.equal(code, 1);
      assert.match(stderr.text(), /--tail N must be a positive integer/);
    } finally {
      fx.cleanup();
    }
  });

  it('missing config.logging.path prints the stderr hint and exits 1', async () => {
    const cfgFile = tmpFile('json', { daemon: { port: 3456 } });
    try {
      const stderr = makeStream();
      let code = null;
      await runLogs({
        args: [],
        cfgPath: cfgFile,
        stdout: makeStream(),
        stderr,
        exit: (c) => { code = c; },
      });
      assert.equal(code, 1);
      assert.match(stderr.text(), /Logs go to stdout \(no logging\.path set\); cannot tail\./);
    } finally {
      fs.unlinkSync(cfgFile);
    }
  });

  it('missing log file prints the path and exits 1', async () => {
    const bogusLog = path.join(os.tmpdir(), `c4-logs-missing-${process.pid}-${Date.now()}.log`);
    const cfgFile = tmpFile('json', { logging: { path: bogusLog } });
    try {
      const stderr = makeStream();
      let code = null;
      await runLogs({
        args: [],
        cfgPath: cfgFile,
        stdout: makeStream(),
        stderr,
        exit: (c) => { code = c; },
      });
      assert.equal(code, 1);
      assert.match(stderr.text(), /Log file not found:/);
      assert.match(stderr.text(), new RegExp(bogusLog.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    } finally {
      fs.unlinkSync(cfgFile);
    }
  });

  it('--level filters out lines whose level does not match', async () => {
    const lines = [
      { level: 20, time: 1700000000000, msg: 'debug-one' },
      { level: 30, time: 1700000001000, msg: 'info-one' },
      { level: 40, time: 1700000002000, msg: 'warn-one' },
      { level: 30, time: 1700000003000, msg: 'info-two' },
    ];
    const fx = setupFixture({ logContent: writeLogFixture(lines) });
    try {
      const stdout = makeStream();
      let code = null;
      await runLogs({
        args: ['--level', 'info'],
        cfgPath: fx.cfgFile,
        stdout,
        stderr: makeStream(),
        exit: (c) => { code = c; },
      });
      assert.equal(code, 0);
      const text = stdout.text();
      assert.match(text, /info-one/);
      assert.match(text, /info-two/);
      assert.ok(!/debug-one/.test(text), `expected debug-one dropped; got: ${text}`);
      assert.ok(!/warn-one/.test(text), `expected warn-one dropped; got: ${text}`);
    } finally {
      fx.cleanup();
    }
  });

  it('--level accepts the numeric form ("30") and matches the same lines', async () => {
    const lines = [
      { level: 20, time: 1700000000000, msg: 'd' },
      { level: 30, time: 1700000001000, msg: 'i' },
    ];
    const fx = setupFixture({ logContent: writeLogFixture(lines) });
    try {
      const stdout = makeStream();
      await runLogs({
        args: ['--level', '30'],
        cfgPath: fx.cfgFile,
        stdout,
        stderr: makeStream(),
        exit: () => {},
      });
      const text = stdout.text();
      assert.match(text, / i$/m);
      assert.ok(!/^.* d$/m.test(text.split('\n').filter(Boolean).join('\n')), 'debug line should be dropped');
    } finally {
      fx.cleanup();
    }
  });

  it('--component filters lines by exact component match', async () => {
    const lines = [
      { level: 30, time: 1700000000000, component: 'daemon', msg: 'd-msg' },
      { level: 30, time: 1700000001000, component: 'notify', msg: 'n-msg' },
      { level: 30, time: 1700000002000, msg: 'no-component' },
      { level: 30, time: 1700000003000, component: 'daemon', msg: 'd-msg-2' },
    ];
    const fx = setupFixture({ logContent: writeLogFixture(lines) });
    try {
      const stdout = makeStream();
      await runLogs({
        args: ['--component', 'daemon'],
        cfgPath: fx.cfgFile,
        stdout,
        stderr: makeStream(),
        exit: () => {},
      });
      const text = stdout.text();
      assert.match(text, /d-msg/);
      assert.match(text, /d-msg-2/);
      assert.ok(!/n-msg/.test(text), `expected notify line dropped; got: ${text}`);
      assert.ok(!/no-component/.test(text), `expected non-component line dropped; got: ${text}`);
    } finally {
      fx.cleanup();
    }
  });

  it('malformed JSON line passes through verbatim and the surrounding valid lines still format', async () => {
    const content = [
      JSON.stringify({ level: 30, time: 1700000000000, msg: 'before' }),
      '{ not json',
      JSON.stringify({ level: 30, time: 1700000001000, msg: 'after' }),
    ].join('\n') + '\n';
    const fx = setupFixture({ logContent: content });
    try {
      const stdout = makeStream();
      let code = null;
      await runLogs({
        args: [],
        cfgPath: fx.cfgFile,
        stdout,
        stderr: makeStream(),
        exit: (c) => { code = c; },
      });
      assert.equal(code, 0, 'malformed line must not crash the handler');
      const text = stdout.text();
      assert.match(text, /INFO before/);
      assert.match(text, /INFO after/);
      assert.match(text, /\{ not json/);
    } finally {
      fx.cleanup();
    }
  });

  it('pretty-print: full canonical line matches "TS LEVEL [component] msg k=v"', async () => {
    const fx = setupFixture({
      logContent: writeLogFixture([
        { level: 40, time: 1700000000000, component: 'notify', msg: 'sent', kind: 'dispatch', worker: 'w1' },
      ]),
    });
    try {
      const stdout = makeStream();
      await runLogs({
        args: [],
        cfgPath: fx.cfgFile,
        stdout,
        stderr: makeStream(),
        exit: () => {},
      });
      const out = stdout.text().trim();
      assert.equal(out, '2023-11-14T22:13:20.000Z WARN [notify] sent kind=dispatch worker=w1');
    } finally {
      fx.cleanup();
    }
  });
});
