'use strict';

// (1.11.90) `c4 attach <name> [--readonly]` connects to the daemon's
// WebSocket attach endpoint and pipes stdin/stdout. The helpers
// buildAttachUrl + runAttach are exposed by src/cli.js so we can
// exercise them with mocked stdio + a fake WebSocket factory without
// spinning up a network stack.
//
// Existing CLI tests in this directory use node:test (see
// cli-version-flag.test.js, cli-ui.test.js). These cases mirror that
// pattern — vitest is web-side only.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const CLI_PATH = path.resolve(__dirname, '..', 'src', 'cli.js');
const { buildAttachUrl, runAttach } = require(CLI_PATH);

function makeStdin() {
  const s = new EventEmitter();
  s.isTTY = true;
  s.resume = () => { s._resumed = true; };
  s.pause = () => { s._paused = true; };
  s.removeListener = (event, cb) => EventEmitter.prototype.removeListener.call(s, event, cb);
  return s;
}

function makeStdout() {
  const lines = [];
  return {
    write: (chunk) => {
      lines.push(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk));
      return true;
    },
    _lines: lines,
  };
}

class FakeClient extends EventEmitter {
  constructor() {
    super();
    this.sent = [];
    this.closed = false;
    this.closeArgs = null;
  }
  send(data) {
    this.sent.push(Buffer.isBuffer(data) ? Buffer.from(data) : Buffer.from(String(data), 'utf8'));
    return true;
  }
  close(code, reason) {
    this.closed = true;
    this.closeArgs = { code, reason };
  }
}

describe('c4 attach — buildAttachUrl (1.11.90)', () => {
  it('builds a ws:// URL from the http base', () => {
    const r = buildAttachUrl({ name: 'auto-w63', args: [], base: 'http://127.0.0.1:3456', token: null });
    assert.equal(r.url, 'ws://127.0.0.1:3456/api/workers/auto-w63/attach');
    assert.equal(r.readonly, false);
  });

  it('switches https:// → wss://', () => {
    const r = buildAttachUrl({ name: 'w', args: [], base: 'https://daemon.example.com:8443', token: null });
    assert.equal(r.url, 'wss://daemon.example.com:8443/api/workers/w/attach');
  });

  it('--readonly adds ?readonly=1 to the query', () => {
    const r = buildAttachUrl({ name: 'w', args: ['--readonly'], base: 'http://127.0.0.1:3456' });
    assert.equal(r.url, 'ws://127.0.0.1:3456/api/workers/w/attach?readonly=1');
    assert.equal(r.readonly, true);
  });

  it('token rides in the querystring (the daemon accepts ?token= as a session-auth fallback)', () => {
    const r = buildAttachUrl({ name: 'w', args: [], base: 'http://127.0.0.1:3456', token: 'tok123' });
    assert.match(r.url, /[?&]token=tok123\b/);
  });

  it('--readonly + token compose cleanly', () => {
    const r = buildAttachUrl({ name: 'w', args: ['--readonly'], base: 'http://127.0.0.1:3456', token: 'tok' });
    assert.match(r.url, /readonly=1/);
    assert.match(r.url, /token=tok/);
  });

  it('URI-encodes worker names with special chars', () => {
    const r = buildAttachUrl({ name: 'auto/w 1', args: [], base: 'http://127.0.0.1:3456' });
    assert.match(r.url, /workers\/auto%2Fw%201\/attach/);
  });

  it('throws when name is missing', () => {
    assert.throws(() => buildAttachUrl({ args: [], base: 'http://127.0.0.1:3456' }),
      /name is required/);
  });
});

describe('c4 attach — runAttach handler (1.11.90)', () => {
  it('exits 1 with usage line when name is missing', async () => {
    const stderr = makeStdout();
    let exitCode = null;
    await runAttach({
      name: undefined,
      args: [],
      stderr,
      exit: (c) => { exitCode = c; },
    });
    assert.equal(exitCode, 1);
    assert.ok(stderr._lines.some((l) => /Usage: c4 attach/.test(l)),
      `expected usage line, got: ${JSON.stringify(stderr._lines)}`);
  });

  it('opens the right URL via the injected connect function', async () => {
    const stdin = makeStdin();
    const stdout = makeStdout();
    const stderr = makeStdout();
    const fake = new FakeClient();
    let openedUrl = null;
    const connect = async (url) => { openedUrl = url; return fake; };

    await runAttach({
      name: 'auto-w63',
      args: ['--readonly'],
      base: 'http://127.0.0.1:3456',
      token: null,
      connect,
      stdin, stdout, stderr,
      exit: () => {},
      setRawMode: () => {},
    });

    assert.match(openedUrl, /^ws:\/\/127\.0\.0\.1:3456\/api\/workers\/auto-w63\/attach\?readonly=1$/);
  });

  it('Ctrl+] (0x1d) triggers a clean detach: close(1000) + exit 0 + detach line', async () => {
    const stdin = makeStdin();
    const stdout = makeStdout();
    const stderr = makeStdout();
    const fake = new FakeClient();
    let exitCode = null;
    const rawCalls = [];

    await runAttach({
      name: 'auto-w63',
      args: [],
      base: 'http://127.0.0.1:3456',
      token: null,
      connect: async () => fake,
      stdin, stdout, stderr,
      exit: (c) => { exitCode = c; },
      setRawMode: (on) => { rawCalls.push(on); },
    });

    // Hand the stdin a Ctrl+] byte.
    stdin.emit('data', Buffer.from([0x1d]));

    assert.equal(fake.closed, true);
    assert.equal(fake.closeArgs.code, 1000);
    assert.equal(exitCode, 0);
    assert.ok(
      stderr._lines.some((l) => l.includes('detached from auto-w63')),
      `expected detach line, got: ${JSON.stringify(stderr._lines)}`
    );
    assert.deepEqual(rawCalls, [true, false],
      `expected raw mode to be enabled then disabled, got ${JSON.stringify(rawCalls)}`);
  });

  it('Worker-not-found close (code 1008) maps to exit code 2', async () => {
    const stdin = makeStdin();
    const stdout = makeStdout();
    const stderr = makeStdout();
    const fake = new FakeClient();
    let exitCode = null;

    await runAttach({
      name: 'missing',
      args: [],
      base: 'http://127.0.0.1:3456',
      token: null,
      connect: async () => fake,
      stdin, stdout, stderr,
      exit: (c) => { exitCode = c; },
      setRawMode: () => {},
    });

    fake.emit('close', 1008, 'worker not found');
    assert.equal(exitCode, 2);
    assert.ok(stderr._lines.some((l) => l.includes('worker not found')),
      `expected worker-not-found line, got: ${JSON.stringify(stderr._lines)}`);
  });

  it('non-1000 / non-1008 close maps to exit 1', async () => {
    const stdin = makeStdin();
    const stdout = makeStdout();
    const stderr = makeStdout();
    const fake = new FakeClient();
    let exitCode = null;

    await runAttach({
      name: 'x',
      args: [],
      base: 'http://127.0.0.1:3456',
      token: null,
      connect: async () => fake,
      stdin, stdout, stderr,
      exit: (c) => { exitCode = c; },
      setRawMode: () => {},
    });

    fake.emit('close', 1011, 'server error');
    assert.equal(exitCode, 1);
    assert.ok(
      stderr._lines.some((l) => /socket closed - 1011/.test(l)),
      `expected socket-closed line, got: ${JSON.stringify(stderr._lines)}`
    );
  });

  it('Stdin chunks (non Ctrl+]) pass through to ws.send unchanged', async () => {
    const stdin = makeStdin();
    const stdout = makeStdout();
    const stderr = makeStdout();
    const fake = new FakeClient();

    await runAttach({
      name: 'x',
      args: [],
      base: 'http://127.0.0.1:3456',
      token: null,
      connect: async () => fake,
      stdin, stdout, stderr,
      exit: () => {},
      setRawMode: () => {},
    });

    stdin.emit('data', Buffer.from('hello'));
    stdin.emit('data', Buffer.from([0x03])); // Ctrl-C — must pass through, not detach
    stdin.emit('data', Buffer.from([0x1b, 0x5b, 0x41])); // Up arrow escape sequence

    assert.equal(fake.sent.length, 3);
    assert.equal(fake.sent[0].toString('utf8'), 'hello');
    assert.deepEqual(Array.from(fake.sent[1]), [0x03]);
    assert.deepEqual(Array.from(fake.sent[2]), [0x1b, 0x5b, 0x41]);
  });

  it('--readonly silently drops stdin chunks (view-only mode)', async () => {
    const stdin = makeStdin();
    const stdout = makeStdout();
    const stderr = makeStdout();
    const fake = new FakeClient();

    await runAttach({
      name: 'x',
      args: ['--readonly'],
      base: 'http://127.0.0.1:3456',
      token: null,
      connect: async () => fake,
      stdin, stdout, stderr,
      exit: () => {},
      setRawMode: () => {},
    });

    stdin.emit('data', Buffer.from('this should be dropped'));
    assert.deepEqual(fake.sent, []);
  });

  it('ws messages are forwarded to stdout', async () => {
    const stdin = makeStdin();
    const stdout = makeStdout();
    const stderr = makeStdout();
    const fake = new FakeClient();

    await runAttach({
      name: 'x',
      args: [],
      base: 'http://127.0.0.1:3456',
      token: null,
      connect: async () => fake,
      stdin, stdout, stderr,
      exit: () => {},
      setRawMode: () => {},
    });

    fake.emit('message', Buffer.from('pty output line\n'));
    assert.deepEqual(stdout._lines, ['pty output line\n']);
  });

  it('connection refused → exit 1 with structured error line', async () => {
    const stdin = makeStdin();
    const stdout = makeStdout();
    const stderr = makeStdout();
    let exitCode = null;
    const connect = async () => {
      const err = new Error('connect ECONNREFUSED 127.0.0.1:3456');
      err.code = 'ECONNREFUSED';
      throw err;
    };

    await runAttach({
      name: 'x',
      args: [],
      base: 'http://127.0.0.1:3456',
      token: null,
      connect,
      stdin, stdout, stderr,
      exit: (c) => { exitCode = c; },
      setRawMode: () => {},
    });

    assert.equal(exitCode, 1);
    assert.ok(
      stderr._lines.some((l) => /connection failed/.test(l)),
      `expected connection failure line, got: ${JSON.stringify(stderr._lines)}`
    );
  });

  it('upgrade refused with 404 body maps to exit 2 (worker not found)', async () => {
    const stdin = makeStdin();
    const stdout = makeStdout();
    const stderr = makeStdout();
    let exitCode = null;
    const connect = async () => {
      const err = new Error('upgrade refused: HTTP 404');
      err.code = 'EUPGRADE';
      err.statusCode = 404;
      err.body = '{"error":"worker not found"}';
      throw err;
    };

    await runAttach({
      name: 'x',
      args: [],
      base: 'http://127.0.0.1:3456',
      token: null,
      connect,
      stdin, stdout, stderr,
      exit: (c) => { exitCode = c; },
      setRawMode: () => {},
    });

    assert.equal(exitCode, 2);
    assert.ok(stderr._lines.some((l) => /worker not found/.test(l)));
  });

  it('upgrade refused with 401 maps to exit 1 with auth hint', async () => {
    const stdin = makeStdin();
    const stdout = makeStdout();
    const stderr = makeStdout();
    let exitCode = null;
    const connect = async () => {
      const err = new Error('upgrade refused: HTTP 401');
      err.code = 'EUPGRADE';
      err.statusCode = 401;
      err.body = '{"error":"Authentication required"}';
      throw err;
    };

    await runAttach({
      name: 'x',
      args: [],
      base: 'http://127.0.0.1:3456',
      token: null,
      connect,
      stdin, stdout, stderr,
      exit: (c) => { exitCode = c; },
      setRawMode: () => {},
    });

    assert.equal(exitCode, 1);
    assert.ok(
      stderr._lines.some((l) => /unauthorized/.test(l)),
      `expected unauthorized hint, got: ${JSON.stringify(stderr._lines)}`
    );
  });
});

describe('c4 attach — help / usage block (1.11.90)', () => {
  it('lists `attach <name> [--readonly]` in the usage block', () => {
    const { spawnSync } = require('node:child_process');
    const r = spawnSync('node', [CLI_PATH, 'unknown-cmd-xyzzy'], {
      encoding: 'utf8',
      timeout: 5000,
      env: { ...process.env, C4_URL: 'http://127.0.0.1:1' },
    });
    assert.match(r.stdout, /attach <name> \[--readonly\]/);
  });
});
