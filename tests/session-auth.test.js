'use strict';

// Session auth tests (TODO 8.14).
//
// Covers the four scenarios listed in the 8.14 task brief:
//   (a) login success and failure
//   (b) middleware allows /auth/login without a token
//   (c) middleware rejects other /api/* routes when no/invalid token
//       and auth is enabled
//   (d) c4 init --user + --password-file writes a bcrypt hash into
//       config.auth.users[<name>].passwordHash
//
// The tests exercise the modules directly (src/auth.js and
// src/auth-setup.js) rather than booting the daemon, so they run fast
// and cannot accidentally bind a port.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { describe, it } = require('node:test');

const auth = require('../src/auth');
const authSetup = require('../src/auth-setup');
const { resolveApiRoute } = require('../src/static-server');

function buildEnabledConfig({ user = 'admin', password = 'hunter2' } = {}) {
  const secret = auth.generateSecret();
  const passwordHash = auth.hashPassword(password);
  return {
    secret,
    cfg: {
      auth: {
        enabled: true,
        secret,
        users: {
          [user]: { passwordHash },
        },
      },
    },
    user,
    password,
  };
}

describe('auth.login', () => {
  it('returns a signed JWT on valid credentials', () => {
    const { cfg, secret, user, password } = buildEnabledConfig();
    const res = auth.login(cfg, { user, password });
    assert.strictEqual(res.ok, true);
    assert.ok(res.token, 'expected a token');
    const verified = auth.verifyToken(res.token, secret);
    assert.strictEqual(verified.valid, true);
    assert.strictEqual(verified.decoded.sub, user);
  });

  it('rejects a wrong password without leaking which field was wrong', () => {
    const { cfg, user } = buildEnabledConfig();
    const res = auth.login(cfg, { user, password: 'nope' });
    assert.strictEqual(res.ok, false);
    assert.match(res.error || '', /invalid/i);
  });

  it('rejects an unknown user with the same error shape', () => {
    const { cfg } = buildEnabledConfig();
    const res = auth.login(cfg, { user: 'ghost', password: 'whatever' });
    assert.strictEqual(res.ok, false);
    assert.match(res.error || '', /invalid/i);
  });

  it('refuses missing fields', () => {
    const { cfg } = buildEnabledConfig();
    assert.strictEqual(auth.login(cfg, {}).ok, false);
    assert.strictEqual(auth.login(cfg, { user: 'admin' }).ok, false);
    assert.strictEqual(auth.login(cfg, { password: 'x' }).ok, false);
  });

  it('refuses login when the auth secret is missing', () => {
    const cfg = {
      auth: {
        enabled: true,
        users: { admin: { passwordHash: auth.hashPassword('x') } },
      },
    };
    const res = auth.login(cfg, { user: 'admin', password: 'x' });
    assert.strictEqual(res.ok, false);
    assert.match(res.error || '', /secret/i);
  });
});

describe('auth.checkRequest (HTTP middleware)', () => {
  it('always allows requests when auth is disabled', () => {
    const cfg = { auth: { enabled: false } };
    const req = { headers: {} };
    const check = auth.checkRequest(cfg, req, '/list');
    assert.strictEqual(check.allow, true);
  });

  it('allows /auth/login without a token even when enabled', () => {
    const { cfg } = buildEnabledConfig();
    const req = { headers: {} };
    const check = auth.checkRequest(cfg, req, '/auth/login');
    assert.strictEqual(check.allow, true);
  });

  it('allows /health without a token', () => {
    const { cfg } = buildEnabledConfig();
    const check = auth.checkRequest(cfg, { headers: {} }, '/health');
    assert.strictEqual(check.allow, true);
  });

  // 8.21b regression: /auth/status is the React app's first request when it
  // has no token yet. It must stay in OPEN_API_ROUTES so the UI can decide
  // whether to render the login page. A prior regression returned 401 here
  // and silently knocked anonymous users out of the login flow entirely.
  it('allows /auth/status without a token so the Web UI can probe auth state', () => {
    const { cfg } = buildEnabledConfig();
    const check = auth.checkRequest(cfg, { headers: {} }, '/auth/status');
    assert.strictEqual(check.allow, true);
  });

  it('still rejects /list without a token (regression guard for auth coverage)', () => {
    const { cfg } = buildEnabledConfig();
    const check = auth.checkRequest(cfg, { headers: {} }, '/list');
    assert.strictEqual(check.allow, false);
    assert.strictEqual(check.status, 401);
  });

  it('rejects other /api/* routes without a token', () => {
    const { cfg } = buildEnabledConfig();
    const check = auth.checkRequest(cfg, { headers: {} }, '/list');
    assert.strictEqual(check.allow, false);
    assert.strictEqual(check.status, 401);
    assert.match(check.body.error, /Authentication required/i);
  });

  it('rejects a malformed Authorization header', () => {
    const { cfg } = buildEnabledConfig();
    const req = { headers: { authorization: 'Basic abc' } };
    const check = auth.checkRequest(cfg, req, '/list');
    assert.strictEqual(check.allow, false);
    assert.strictEqual(check.status, 401);
  });

  it('rejects an expired / tampered token', () => {
    const { cfg } = buildEnabledConfig();
    const req = { headers: { authorization: 'Bearer not.a.jwt' } };
    const check = auth.checkRequest(cfg, req, '/list');
    assert.strictEqual(check.allow, false);
    assert.strictEqual(check.status, 401);
  });

  it('accepts a valid token in Authorization header', () => {
    const { cfg, secret } = buildEnabledConfig();
    const token = auth.signToken({ sub: 'admin' }, secret);
    const req = { headers: { authorization: `Bearer ${token}` } };
    const check = auth.checkRequest(cfg, req, '/list');
    assert.strictEqual(check.allow, true);
    assert.strictEqual(check.decoded.sub, 'admin');
  });

  it('accepts a valid token via ?token= query param (SSE fallback)', () => {
    const { cfg, secret } = buildEnabledConfig();
    const token = auth.signToken({ sub: 'admin' }, secret);
    const req = { headers: {}, url: `/api/events?token=${encodeURIComponent(token)}` };
    const check = auth.checkRequest(cfg, req, '/events');
    assert.strictEqual(check.allow, true);
  });
});

describe('auth-setup.provisionAuth', () => {
  function tempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'c4-auth-setup-'));
  }

  it('non-interactive: writes passwordHash from --password-file and leaves the file intact', async () => {
    const dir = tempDir();
    const configPath = path.join(dir, 'config.json');
    const pwPath = path.join(dir, 'pw.txt');
    const originalBody = 'sekret!\n';
    fs.writeFileSync(configPath, JSON.stringify({ daemon: { port: 3456 } }) + '\n');
    fs.writeFileSync(pwPath, originalBody);

    const result = await authSetup.provisionAuth({
      configPath,
      user: 'admin',
      passwordFile: pwPath,
    });
    assert.strictEqual(result.status, 'updated');
    assert.strictEqual(result.user, 'admin');

    // Source password file must not be rewritten.
    assert.strictEqual(fs.readFileSync(pwPath, 'utf8'), originalBody);

    const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.strictEqual(saved.auth.enabled, true);
    assert.ok(saved.auth.secret && saved.auth.secret.length >= 64);
    const hash = saved.auth.users.admin.passwordHash;
    assert.ok(hash && hash.startsWith('$2'), 'expected bcrypt hash');
    assert.strictEqual(auth.verifyPassword('sekret!', hash), true);
    // Pre-existing config keys survive.
    assert.strictEqual(saved.daemon.port, 3456);
  });

  it('non-interactive: reuses existing secret on a second run instead of rotating', async () => {
    const dir = tempDir();
    const configPath = path.join(dir, 'config.json');
    const pwPath = path.join(dir, 'pw.txt');
    fs.writeFileSync(configPath, JSON.stringify({}) + '\n');
    fs.writeFileSync(pwPath, 'pw-one');

    const first = await authSetup.provisionAuth({
      configPath, user: 'admin', passwordFile: pwPath,
    });
    assert.strictEqual(first.status, 'updated');
    const cfgAfterFirst = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const firstSecret = cfgAfterFirst.auth.secret;

    fs.writeFileSync(pwPath, 'pw-two');
    const second = await authSetup.provisionAuth({
      configPath, user: 'bob', passwordFile: pwPath,
    });
    assert.strictEqual(second.status, 'updated');
    const cfgAfterSecond = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.strictEqual(cfgAfterSecond.auth.secret, firstSecret, 'secret must not rotate');
    assert.ok(cfgAfterSecond.auth.users.admin, 'existing user preserved');
    assert.ok(cfgAfterSecond.auth.users.bob, 'new user added');
  });

  it('non-interactive: skips when the user already has a hash (no overwrite)', async () => {
    const dir = tempDir();
    const configPath = path.join(dir, 'config.json');
    const pwPath = path.join(dir, 'pw.txt');
    fs.writeFileSync(pwPath, 'pw');
    fs.writeFileSync(configPath, JSON.stringify({}) + '\n');

    await authSetup.provisionAuth({ configPath, user: 'admin', passwordFile: pwPath });
    const before = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    fs.writeFileSync(pwPath, 'different');
    const second = await authSetup.provisionAuth({ configPath, user: 'admin', passwordFile: pwPath });
    assert.strictEqual(second.status, 'skipped-exists');

    const after = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.strictEqual(after.auth.users.admin.passwordHash, before.auth.users.admin.passwordHash);
  });

  it('non-interactive with no flags and interactive=false is a no-op', async () => {
    const dir = tempDir();
    const configPath = path.join(dir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({}) + '\n');
    const result = await authSetup.provisionAuth({ configPath, interactive: false });
    assert.strictEqual(result.status, 'skipped-no-args');
  });

  it('errors when only one of --user / --password-file is provided', async () => {
    const dir = tempDir();
    const configPath = path.join(dir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({}) + '\n');
    const r1 = await authSetup.provisionAuth({ configPath, user: 'admin' });
    assert.strictEqual(r1.status, 'error');
    const r2 = await authSetup.provisionAuth({ configPath, passwordFile: '/tmp/nope' });
    assert.strictEqual(r2.status, 'error');
  });

  it('errors when the password file is missing or empty', async () => {
    const dir = tempDir();
    const configPath = path.join(dir, 'config.json');
    const emptyPath = path.join(dir, 'empty.txt');
    fs.writeFileSync(configPath, JSON.stringify({}) + '\n');
    fs.writeFileSync(emptyPath, '');
    const missing = await authSetup.provisionAuth({
      configPath, user: 'admin', passwordFile: path.join(dir, 'nope.txt'),
    });
    assert.strictEqual(missing.status, 'error');
    const empty = await authSetup.provisionAuth({
      configPath, user: 'admin', passwordFile: emptyPath,
    });
    assert.strictEqual(empty.status, 'error');
  });
});

// 8.21b end-to-end: resolveApiRoute + checkRequest together must allow
// an unauthenticated GET of /api/auth/status whether or not the client
// (or an upstream proxy) added a trailing slash. The standalone
// resolveApiRoute unit tests live in daemon-static-serve.test.js; this
// block asserts the composed behavior that actually breaks Web UI login.
describe('auth.checkRequest composed with resolveApiRoute (8.21b)', () => {
  const paths = [
    '/api/auth/status',
    '/api/auth/status/',
    '/api/auth/status///',
  ];
  for (const rawPath of paths) {
    it(`GET ${rawPath} is allowed without a token`, () => {
      const { cfg } = buildEnabledConfig();
      const { route } = resolveApiRoute(rawPath);
      const check = auth.checkRequest(cfg, { headers: {} }, route);
      assert.strictEqual(check.allow, true,
        `expected allow=true for ${rawPath} -> ${route}`);
    });
  }

  it('GET /api/list is still rejected without a token (no blanket opening)', () => {
    const { cfg } = buildEnabledConfig();
    const { route } = resolveApiRoute('/api/list');
    const check = auth.checkRequest(cfg, { headers: {} }, route);
    assert.strictEqual(check.allow, false);
    assert.strictEqual(check.status, 401);
  });

  it('GET /api/list/ stays rejected too (trailing slash does not open new holes)', () => {
    const { cfg } = buildEnabledConfig();
    const { route } = resolveApiRoute('/api/list/');
    const check = auth.checkRequest(cfg, { headers: {} }, route);
    assert.strictEqual(check.allow, false);
    assert.strictEqual(check.status, 401);
  });
});

describe('daemon.js wires the auth middleware', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'daemon.js'), 'utf8');

  it('daemon.js requires ./auth', () => {
    assert.ok(/require\(['"]\.\/auth['"]\)/.test(src), 'daemon.js should require ./auth');
  });

  it('daemon.js defines POST /auth/login', () => {
    assert.ok(/route === ['"]\/auth\/login['"]/.test(src), 'daemon.js should handle /auth/login');
  });

  it('daemon.js calls auth.checkRequest before routing', () => {
    assert.ok(/auth\.checkRequest\(/.test(src), 'daemon.js should invoke auth.checkRequest');
  });
});
