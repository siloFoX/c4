'use strict';

// (11.74) Tests for `c4 reconnect <name>` — the CLI side of the
// daemon's POST /api/workers/:name/reconnect endpoint. Mirrors the
// node:test + injected-stdio style of tests/cli-attach.test.js so
// the runner stays consistent across CLI subcommands.
//
// runReconnect is exported from src/cli.js for testability — see
// the module.exports footer in that file.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const CLI_PATH = path.resolve(__dirname, '..', 'src', 'cli.js');
const { runReconnect } = require(CLI_PATH);

function makeStdout() {
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

// Inject a fake request function that mimics the daemon's response
// envelope: { _statusCode, ...body }. The CLI helper reads
// response._statusCode to map 200 / 404 / 409 to exit codes 0 / 2 / 1.
function fakeRequest(impl) {
  const calls = [];
  const fn = async (req) => {
    calls.push(req);
    return impl(req);
  };
  fn.calls = calls;
  return fn;
}

describe('c4 reconnect — runReconnect (11.74)', () => {
  it('builds the right URL: /workers/<name>/reconnect', async () => {
    const stdout = makeStdout();
    const stderr = makeStdout();
    const request = fakeRequest(async () => ({ _statusCode: 200, ok: true, worker: { name: 'w1', pid: 1, branch: 'c4/w1' } }));
    await runReconnect({
      name: 'w1',
      base: 'http://127.0.0.1:3456',
      request,
      stdout,
      stderr,
    });
    assert.equal(request.calls.length, 1);
    assert.equal(request.calls[0].method, 'POST');
    assert.equal(request.calls[0].path, '/workers/w1/reconnect');
  });

  it('URI-encodes worker names with special chars', async () => {
    const stdout = makeStdout();
    const stderr = makeStdout();
    const request = fakeRequest(async () => ({ _statusCode: 200, ok: true, worker: { name: 'auto/w 1', pid: 1 } }));
    await runReconnect({
      name: 'auto/w 1',
      base: 'http://127.0.0.1:3456',
      request,
      stdout,
      stderr,
    });
    assert.match(request.calls[0].path, /workers\/auto%2Fw%201\/reconnect/);
  });

  it('on 200: prints "Reconnected <name> (pid=..., branch=...)" and returns exit code 0', async () => {
    const stdout = makeStdout();
    const stderr = makeStdout();
    const request = fakeRequest(async () => ({
      _statusCode: 200,
      ok: true,
      worker: { name: 'auto-w7', pid: 7777, branch: 'c4/auto-w7' },
    }));
    const r = await runReconnect({
      name: 'auto-w7',
      base: 'http://127.0.0.1:3456',
      request,
      stdout,
      stderr,
    });
    assert.equal(r.exitCode, 0);
    assert.match(stdout.text(), /Reconnected auto-w7 \(pid=7777, branch=c4\/auto-w7\)/);
    assert.equal(stderr.text(), '');
  });

  it('on 404: prints "not found in checkpoints" and returns exit code 2', async () => {
    const stdout = makeStdout();
    const stderr = makeStdout();
    const request = fakeRequest(async () => ({
      _statusCode: 404,
      error: 'not-found',
      name: 'ghost',
      message: "Worker 'ghost' not found in checkpoints",
    }));
    const r = await runReconnect({
      name: 'ghost',
      base: 'http://127.0.0.1:3456',
      request,
      stdout,
      stderr,
    });
    assert.equal(r.exitCode, 2);
    assert.match(stdout.text(), /Worker 'ghost' not found in checkpoints/);
  });

  it('on 409: prints "pid <N> is no longer alive" and returns exit code 1', async () => {
    const stdout = makeStdout();
    const stderr = makeStdout();
    const request = fakeRequest(async () => ({
      _statusCode: 409,
      error: 'pid-dead',
      name: 'dead-w',
      pid: 99999,
    }));
    const r = await runReconnect({
      name: 'dead-w',
      base: 'http://127.0.0.1:3456',
      request,
      stdout,
      stderr,
    });
    assert.equal(r.exitCode, 1);
    assert.match(stdout.text(), /pid 99999 is no longer alive/);
    assert.match(stdout.text(), /run c4 cleanup to discard/);
  });

  it('on network error: prints "[c4 reconnect: <error>]" and returns exit code 1', async () => {
    const stdout = makeStdout();
    const stderr = makeStdout();
    const request = fakeRequest(async () => {
      throw new Error('Daemon not running? ECONNREFUSED');
    });
    const r = await runReconnect({
      name: 'whatever',
      base: 'http://127.0.0.1:3456',
      request,
      stdout,
      stderr,
    });
    assert.equal(r.exitCode, 1);
    assert.match(stderr.text(), /\[c4 reconnect: Daemon not running\?/);
  });

  it('falls back to body.error when _statusCode is missing (legacy daemon)', async () => {
    const stdout = makeStdout();
    const stderr = makeStdout();
    const request = fakeRequest(async () => ({ error: 'not-found' }));
    const r = await runReconnect({
      name: 'ghost',
      base: 'http://127.0.0.1:3456',
      request,
      stdout,
      stderr,
    });
    assert.equal(r.exitCode, 2);
  });

  it('handles a generic 400-class HTTP error without a known error code', async () => {
    const stdout = makeStdout();
    const stderr = makeStdout();
    const request = fakeRequest(async () => ({ _statusCode: 500, error: 'internal' }));
    const r = await runReconnect({
      name: 'oops',
      base: 'http://127.0.0.1:3456',
      request,
      stdout,
      stderr,
    });
    assert.equal(r.exitCode, 1);
    assert.match(stderr.text(), /\[c4 reconnect: internal\]/);
  });
});
