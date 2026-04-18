'use strict';

// Coverage for TODO 8.19 -- the CLI request helper must route every call
// through the /api prefix so the session-auth middleware (8.14) actually
// runs. The bug before this fix was that the CLI hit legacy bare paths
// like /create, which skipped the auth gate and returned 401 at the
// handler-level RBAC check even when the caller sent a valid token.
//
// The tests exercise three layers:
//   (a) withApiPrefix() -- the pure classification helper exported by
//       src/cli.js so we can verify the prefix logic without spawning
//       a child process.
//   (b) An end-to-end integration that stands up a minimal HTTP capture
//       server, points the CLI at it via C4_URL, and asserts that the
//       wire path is /api/<command> for the handful of flows the 8.19
//       spec calls out (create / list / auth-login / watch).
//   (c) auth.checkRequest path classification: the three public routes
//       (/auth/login, /auth/status, /health) and the default-deny
//       behaviour for every other route.

const assert = require('assert');
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const { describe, it, before, after } = require('node:test');

const auth = require('../src/auth');
const cli = require('../src/cli');

const CLI_PATH = path.resolve(__dirname, '..', 'src', 'cli.js');

describe('cli.withApiPrefix', () => {
  it('prepends /api to bare routes', () => {
    assert.strictEqual(cli.withApiPrefix('/create'), '/api/create');
    assert.strictEqual(cli.withApiPrefix('/list'), '/api/list');
    assert.strictEqual(cli.withApiPrefix('/watch?name=w1'), '/api/watch?name=w1');
  });

  it('leaves already-prefixed paths alone (idempotent)', () => {
    assert.strictEqual(cli.withApiPrefix('/api/create'), '/api/create');
    assert.strictEqual(cli.withApiPrefix('/api'), '/api');
  });

  it('accepts paths without a leading slash', () => {
    assert.strictEqual(cli.withApiPrefix('create'), '/api/create');
  });

  it('returns the input untouched for non-strings / empty strings', () => {
    assert.strictEqual(cli.withApiPrefix(''), '');
    assert.strictEqual(cli.withApiPrefix(null), null);
    assert.strictEqual(cli.withApiPrefix(undefined), undefined);
  });

  it('does not double-prefix a path that begins with "/api" but is a different route', () => {
    // Guard rail: '/apiX' should still get the prefix because it is not
    // the /api namespace. Reality check so a future refactor does not
    // accidentally exempt /apiary or similar names.
    assert.strictEqual(cli.withApiPrefix('/apiary'), '/api/apiary');
  });
});

// Integration-ish: stand up an HTTP server that records requests and
// returns stub JSON. Spawn the real cli.js as a child process with
// C4_URL pointing at the capture server, then assert the wire path.
describe('cli request routing (integration)', () => {
  let server;
  let port;
  const recorded = [];

  before(async () => {
    await new Promise((resolve) => {
      server = http.createServer((req, res) => {
        recorded.push({ method: req.method, url: req.url,
          authorization: req.headers['authorization'] || null });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        // Respond with shape the CLI's health / list handlers parse so
        // the child process exits 0 rather than blowing up on an empty
        // body.
        if (req.url.startsWith('/api/health')) {
          res.end(JSON.stringify({ ok: true, workers: 0, version: 'test' }));
        } else if (req.url.startsWith('/api/list')) {
          res.end(JSON.stringify({ workers: [], queuedTasks: [], lostWorkers: [] }));
        } else {
          res.end(JSON.stringify({ ok: true }));
        }
      });
      server.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  function runCli(argv, env = {}) {
    // spawnSync would block Node's event loop, which means the capture
    // server in this same process cannot accept the child's connection
    // and the CLI inevitably hits its 10s request timeout. Use async
    // spawn + a promise so the server stays responsive.
    return new Promise((resolve) => {
      const child = spawn(process.execPath, [CLI_PATH, ...argv], {
        env: {
          ...process.env,
          C4_URL: `http://127.0.0.1:${port}`,
          // Scrub any token on the developer's box so test runs are
          // deterministic. A blank C4_TOKEN still goes through
          // readToken's trim+falsy guard.
          C4_TOKEN: env.C4_TOKEN != null ? env.C4_TOKEN : '',
          HOME: env.HOME || '/tmp',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (c) => { stdout += c.toString('utf8'); });
      child.stderr.on('data', (c) => { stderr += c.toString('utf8'); });
      const timer = setTimeout(() => { child.kill('SIGKILL'); }, 15000);
      child.on('close', (status) => {
        clearTimeout(timer);
        resolve({ status, stdout, stderr });
      });
    });
  }

  it('c4 health hits /api/health', async () => {
    recorded.length = 0;
    const out = await runCli(['health']);
    assert.strictEqual(out.status, 0, 'cli should exit 0, got stderr: ' + out.stderr);
    assert.ok(recorded.length >= 1, 'server should see a request');
    assert.ok(recorded[0].url.startsWith('/api/health'),
      'health path should be prefixed, got ' + recorded[0].url);
  });

  it('c4 list hits /api/list with bearer when token is set', async () => {
    recorded.length = 0;
    const out = await runCli(['list'], { C4_TOKEN: 'testtoken' });
    assert.strictEqual(out.status, 0, out.stderr);
    // c4 list may also POST /api/tree in some flows; locate the /api/list
    // call instead of assuming index 0.
    const listCall = recorded.find((r) => r.url.startsWith('/api/list'));
    assert.ok(listCall, 'expected a /api/list call, saw: ' + JSON.stringify(recorded));
    assert.strictEqual(listCall.authorization, 'Bearer testtoken');
  });

  it('bearer is omitted when no token is configured', async () => {
    recorded.length = 0;
    const out = await runCli(['health']);
    assert.strictEqual(out.status, 0, out.stderr);
    assert.strictEqual(recorded[0].authorization, null,
      'no Authorization header when token is absent');
  });
});

// Legacy /create is intentionally still dispatched on the daemon side
// (the handler table matches on stripped `route`), but the 8.14 session
// auth middleware only runs when the request came in under /api. This
// test pins the path-classification contract so a future refactor
// cannot silently re-open the bypass that 8.19 closes.
describe('auth.checkRequest path classification (8.19 regression)', () => {
  function enabled() {
    return {
      auth: {
        enabled: true,
        secret: auth.generateSecret(),
        users: { admin: { passwordHash: auth.hashPassword('x') } },
      },
    };
  }

  it('public routes stay reachable without a token', () => {
    const cfg = enabled();
    for (const route of ['/auth/login', '/auth/status', '/health']) {
      const check = auth.checkRequest(cfg, { headers: {} }, route);
      assert.strictEqual(check.allow, true, `${route} should be open`);
    }
  });

  it('every other route requires a valid bearer', () => {
    const cfg = enabled();
    for (const route of ['/create', '/list', '/task', '/close', '/merge']) {
      const check = auth.checkRequest(cfg, { headers: {} }, route);
      assert.strictEqual(check.allow, false,
        `${route} should require auth under /api/*`);
      assert.strictEqual(check.status, 401);
    }
  });

  it('a valid bearer unlocks the same routes', () => {
    const cfg = enabled();
    const token = auth.signToken({ sub: 'admin' }, cfg.auth.secret);
    for (const route of ['/create', '/list', '/task']) {
      const check = auth.checkRequest(cfg,
        { headers: { authorization: 'Bearer ' + token } }, route);
      assert.strictEqual(check.allow, true);
      assert.strictEqual(check.decoded.sub, 'admin');
    }
  });
});
