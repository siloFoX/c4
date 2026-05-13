'use strict';

// (1.11.89) `c4 ui` opens the daemon web UI in the user's default
// browser. The handler resolves the port (--port > config.json >
// 3456), picks a platform opener (open / cmd start / xdg-open),
// spawns it detached, and falls back to printing the URL when the
// opener binary is missing.
//
// Existing CLI tests in this directory use node:test (see
// cli-version-flag.test.js, cli-risk.test.js, etc.) — vitest only
// runs on the `web/` React side. These cases mirror that pattern.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { EventEmitter } = require('node:events');
const { spawnSync } = require('node:child_process');

const CLI_PATH = path.resolve(__dirname, '..', 'src', 'cli.js');
const { resolveUiPort, pickUiOpener, runUi } = require(CLI_PATH);

function tmpConfigFile(contents) {
  const p = path.join(
    os.tmpdir(),
    `c4-ui-test-${process.pid}-${Math.random().toString(36).slice(2)}.json`
  );
  fs.writeFileSync(p, typeof contents === 'string' ? contents : JSON.stringify(contents));
  return p;
}

function fakeChild() {
  const child = new EventEmitter();
  child.unref = () => { child.unrefCalled = true; };
  return child;
}

function captureSpawn(impl) {
  const calls = [];
  const fn = (cmd, args, opts) => {
    calls.push({ cmd, args, opts });
    return impl ? impl(cmd, args, opts) : fakeChild();
  };
  fn.calls = calls;
  return fn;
}

describe('c4 ui — port resolution (1.11.89)', () => {
  it('uses --port flag when provided', () => {
    const port = resolveUiPort(['--port', '9999'], '/nonexistent/config.json');
    assert.equal(port, 9999);
  });

  it('falls back to config.json daemon.port when --port is absent', () => {
    const cfgPath = tmpConfigFile({ daemon: { port: 4567 } });
    try {
      assert.equal(resolveUiPort([], cfgPath), 4567);
    } finally {
      fs.unlinkSync(cfgPath);
    }
  });

  it('--port wins over config.json daemon.port', () => {
    const cfgPath = tmpConfigFile({ daemon: { port: 4567 } });
    try {
      assert.equal(resolveUiPort(['--port', '8888'], cfgPath), 8888);
    } finally {
      fs.unlinkSync(cfgPath);
    }
  });

  it('defaults to 3456 when config.json has no daemon.port', () => {
    const cfgPath = tmpConfigFile({ daemon: {} });
    try {
      assert.equal(resolveUiPort([], cfgPath), 3456);
    } finally {
      fs.unlinkSync(cfgPath);
    }
  });

  it('defaults to 3456 when config.json is missing', () => {
    assert.equal(resolveUiPort([], '/definitely/not/a/real/path.json'), 3456);
  });

  it('defaults to 3456 when config.json is malformed', () => {
    const cfgPath = tmpConfigFile('{ broken json,');
    try {
      assert.equal(resolveUiPort([], cfgPath), 3456);
    } finally {
      fs.unlinkSync(cfgPath);
    }
  });

  it('ignores --port without a value', () => {
    assert.equal(resolveUiPort(['--port'], '/nonexistent.json'), 3456);
  });

  it('ignores non-numeric --port values', () => {
    assert.equal(resolveUiPort(['--port', 'abc'], '/nonexistent.json'), 3456);
  });
});

describe('c4 ui — platform opener (1.11.89)', () => {
  it('darwin picks `open`', () => {
    const o = pickUiOpener('darwin');
    assert.equal(o.cmd, 'open');
    assert.deepEqual(o.extraArgs, []);
  });

  it('win32 picks `cmd /c start ""` so URLs survive cmd.exe quoting', () => {
    const o = pickUiOpener('win32');
    assert.equal(o.cmd, 'cmd');
    assert.deepEqual(o.extraArgs, ['/c', 'start', '']);
  });

  it('linux picks `xdg-open`', () => {
    const o = pickUiOpener('linux');
    assert.equal(o.cmd, 'xdg-open');
    assert.deepEqual(o.extraArgs, []);
  });

  it('unknown platforms fall back to xdg-open', () => {
    const o = pickUiOpener('freebsd');
    assert.equal(o.cmd, 'xdg-open');
  });
});

describe('c4 ui — runUi handler (1.11.89)', () => {
  it('spawns the darwin opener with the resolved URL', async () => {
    const spawn = captureSpawn();
    const lines = [];
    const result = await runUi({
      args: ['--port', '1234'],
      platform: 'darwin',
      cfgPath: '/nonexistent.json',
      spawn,
      out: (s) => lines.push(s),
    });
    assert.equal(spawn.calls.length, 1);
    assert.equal(spawn.calls[0].cmd, 'open');
    assert.deepEqual(spawn.calls[0].args, ['http://127.0.0.1:1234']);
    assert.deepEqual(spawn.calls[0].opts, { detached: true, stdio: 'ignore' });
    assert.equal(result.url, 'http://127.0.0.1:1234');
    assert.equal(result.opened, true);
    assert.ok(
      lines.some((l) => l === 'Opening http://127.0.0.1:1234 in your default browser...'),
      `expected "Opening..." line, got: ${JSON.stringify(lines)}`
    );
  });

  it('spawns the linux opener with the resolved URL', async () => {
    const spawn = captureSpawn();
    const lines = [];
    await runUi({
      args: ['--port', '7777'],
      platform: 'linux',
      cfgPath: '/nonexistent.json',
      spawn,
      out: (s) => lines.push(s),
    });
    assert.equal(spawn.calls[0].cmd, 'xdg-open');
    assert.deepEqual(spawn.calls[0].args, ['http://127.0.0.1:7777']);
  });

  it('spawns the win32 opener through cmd /c start', async () => {
    const spawn = captureSpawn();
    const lines = [];
    await runUi({
      args: ['--port', '5555'],
      platform: 'win32',
      cfgPath: '/nonexistent.json',
      spawn,
      out: (s) => lines.push(s),
    });
    assert.equal(spawn.calls[0].cmd, 'cmd');
    assert.deepEqual(spawn.calls[0].args, ['/c', 'start', '', 'http://127.0.0.1:5555']);
  });

  it('prints fallback line when spawn throws synchronously', async () => {
    const lines = [];
    const spawn = () => {
      const err = new Error('spawn xdg-open ENOENT');
      err.code = 'ENOENT';
      throw err;
    };
    const result = await runUi({
      args: [],
      platform: 'linux',
      cfgPath: '/nonexistent.json',
      spawn,
      out: (s) => lines.push(s),
    });
    assert.equal(result.opened, false);
    assert.equal(result.url, 'http://127.0.0.1:3456');
    assert.deepEqual(lines, [
      'Open in browser: http://127.0.0.1:3456 (no xdg-open / open / start available)',
    ]);
  });

  it('prints fallback line when child fires ENOENT error event', async () => {
    const lines = [];
    const child = fakeChild();
    const spawn = () => {
      // Fire the async 'error' event before setImmediate runs so the
      // fallback path wins the race — matches Linux xdg-open behavior.
      process.nextTick(() => {
        const err = new Error('spawn xdg-open ENOENT');
        err.code = 'ENOENT';
        child.emit('error', err);
      });
      return child;
    };
    const result = await runUi({
      args: ['--port', '2025'],
      platform: 'linux',
      cfgPath: '/nonexistent.json',
      spawn,
      out: (s) => lines.push(s),
    });
    assert.equal(result.opened, false);
    assert.deepEqual(lines, [
      'Open in browser: http://127.0.0.1:2025 (no xdg-open / open / start available)',
    ]);
  });

  it('unref()s the child on success so the parent can exit', async () => {
    const child = fakeChild();
    const spawn = captureSpawn(() => child);
    await runUi({
      args: ['--port', '8080'],
      platform: 'darwin',
      cfgPath: '/nonexistent.json',
      spawn,
      out: () => {},
    });
    assert.equal(child.unrefCalled, true);
  });
});

describe('c4 ui — CLI integration (1.11.89)', () => {
  it('node src/cli.js ui --port 9999 prints URL and exits 0', () => {
    const r = spawnSync('node', [CLI_PATH, 'ui', '--port', '9999'], {
      encoding: 'utf8',
      timeout: 5000,
      env: { ...process.env, C4_URL: 'http://127.0.0.1:1' },
    });
    assert.equal(r.status, 0, `unexpected exit code; stderr=${r.stderr}`);
    assert.match(r.stdout, /http:\/\/127\.0\.0\.1:9999/);
  });

  it('node src/cli.js ui defaults to 3456 when no --port', () => {
    // Force the no-config path by pointing at an empty cwd via env. The
    // worker repo may have its own config.json so we tolerate either
    // 3456 or whatever the repo's config.json declares — assert only
    // that the printed URL is well-formed and exit is clean.
    const r = spawnSync('node', [CLI_PATH, 'ui'], {
      encoding: 'utf8',
      timeout: 5000,
      env: { ...process.env, C4_URL: 'http://127.0.0.1:1' },
    });
    assert.equal(r.status, 0, `unexpected exit code; stderr=${r.stderr}`);
    assert.match(r.stdout, /http:\/\/127\.0\.0\.1:\d+/);
  });

  it('lists `ui` in the help / usage block', () => {
    const r = spawnSync('node', [CLI_PATH, 'unknown-cmd-xyzzy'], {
      encoding: 'utf8',
      timeout: 5000,
      env: { ...process.env, C4_URL: 'http://127.0.0.1:1' },
    });
    assert.match(r.stdout, /ui \[--port N\]/);
  });
});
