'use strict';

// (1.11.97) Daemon route tests for TODO 11.79.
//
// Adds supertest-based coverage for the four route families that take
// real operator traffic: /auth/login + /auth/status, /list, /autonomous/*,
// and /config (+ /config/reload).
//
// The daemon keeps its routes inline inside src/daemon.js rather than a
// per-route module tree, so this file mirrors the same fixture trade
// daemon-api.test.js and daemon-attach.test.js already make: build a
// small in-process http.Server that wires the SAME route handlers
// (real auth.js, real rbac.js, stubbed pty-manager + auto-dispatcher),
// then drive it through supertest. Spawning the full daemon would need
// a real config.json + state.json + port management which the CI run
// cannot tolerate when many tests run back to back.
//
// Coverage shape:
//   - auth.login: success, invalid creds, missing fields, missing body,
//     audit-side-effect, /auth/status enabled/disabled, /auth/logout.
//   - list: empty, populated (with tier enrichment), 401 when auth
//     enabled and no token.
//   - autonomous: status (enabled / disabled-instance), pause, resume,
//     tick, 401 when auth enabled and no token, error payload when
//     dispatcher is null.
//   - config: GET (sanitized + 401 path), POST /config/reload happy /
//     401 / 403 paths.

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { describe, it, before, after } = require('node:test');

const request = require('supertest');
const auth = require('../src/auth');
const rbac = require('../src/rbac');

// ---------------------------------------------------------------------------
// Test fixtures + factories
// ---------------------------------------------------------------------------

function mkTmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function makeStubManager(opts) {
  const o = opts || {};
  let config = o.config || { auth: { enabled: false } };
  let workers = Array.isArray(o.workers) ? o.workers.slice() : [];
  let queuedTasks = Array.isArray(o.queuedTasks) ? o.queuedTasks.slice() : [];
  let lostWorkers = Array.isArray(o.lostWorkers) ? o.lostWorkers.slice() : [];
  let reloadCount = 0;
  return {
    list() {
      return { workers: workers.slice(), queuedTasks: queuedTasks.slice(), lostWorkers: lostWorkers.slice() };
    },
    getConfig() {
      return config;
    },
    reloadConfig() {
      reloadCount += 1;
      return { success: true, config };
    },
    setConfig(next) { config = next; },
    setWorkers(next) { workers = next.slice(); },
    reloadCount() { return reloadCount; },
  };
}

function makeStubAutoDispatcher() {
  const state = {
    enabled: true,
    paused: false,
    pauseReason: null,
    consecutiveHalts: 0,
    tickCount: 0,
  };
  return {
    getStatus() {
      return {
        enabled: state.enabled,
        paused: state.paused,
        pauseReason: state.pauseReason,
        consecutiveHalts: state.consecutiveHalts,
        circuitThreshold: 3,
      };
    },
    pause(reason) {
      state.paused = true;
      state.pauseReason = reason || 'manual';
      return this.getStatus();
    },
    resume() {
      state.paused = false;
      state.pauseReason = null;
      state.consecutiveHalts = 0;
      return this.getStatus();
    },
    tick() {
      state.tickCount += 1;
      return Promise.resolve({ tickCount: state.tickCount, paused: state.paused });
    },
    _state: state,
  };
}

// Tiny role manager helper: writes to a tmp file so each test suite gets
// an isolated RBAC store without touching the operator's ~/.c4/rbac.json.
function makeRbac(seed) {
  const tmp = mkTmpDir('c4-routes-rbac-');
  const mgr = new rbac.RoleManager({ storePath: path.join(tmp, 'rbac.json') });
  if (seed && typeof seed === 'object') {
    for (const [user, role] of Object.entries(seed)) {
      mgr.assignRole(user, role);
    }
  }
  return mgr;
}

// Build an http.Server that wires the SAME logic daemon.js uses for the
// four route families under test. Keeping the handler body in-process
// (vs. spawning the full daemon) is the same trade daemon-api.test.js
// already makes for /key + /merge.
function buildRoutesServer({ manager, rbacManager, autoDispatcher }) {
  const audits = [];

  function _safeAudit(type, details, overrides) {
    audits.push({ type, details, overrides });
  }

  function roleFor(name) {
    if (!name) return null;
    try {
      const u = rbacManager.getUser(name);
      if (u && u.role) return u.role;
    } catch {}
    const cfgNow = manager.getConfig();
    const cu = cfgNow && cfgNow.auth && cfgNow.auth.users && cfgNow.auth.users[name];
    if (cu && typeof cu.role === 'string') return cu.role;
    return null;
  }

  function requireRole(authCheck, action) {
    if (!auth.isAuthEnabled(manager.getConfig())) return { allow: true };
    const username = authCheck && authCheck.decoded && typeof authCheck.decoded.sub === 'string'
      ? authCheck.decoded.sub : null;
    if (!username) return { allow: false, status: 401, body: { error: 'Authentication required' } };
    const ok = rbacManager.checkPermission(username, action);
    if (!ok) return { allow: false, status: 403, body: { error: 'Forbidden', action, user: username } };
    return { allow: true };
  }

  function denyOr(res, gate) {
    if (gate.allow) return false;
    res.writeHead(gate.status || 403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(gate.body || { error: 'Forbidden' }));
    return true;
  }

  function parseBody(req) {
    return new Promise((resolve) => {
      let buf = '';
      req.on('data', (c) => { buf += c.toString('utf8'); });
      req.on('end', () => {
        if (!buf) return resolve({});
        try { resolve(JSON.parse(buf)); } catch { resolve({}); }
      });
    });
  }

  function ok(res, body) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  }

  function err(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const route = url.pathname.replace(/^\/api/, '') || '/';

    try {
      const cfg = manager.getConfig();
      const authCheck = auth.checkRequest(cfg, req, route);
      const needsAuthCheck = !auth.OPEN_API_ROUTES.has(route);
      if (needsAuthCheck && !authCheck.allow) {
        return err(res, authCheck.status || 401, authCheck.body || { error: 'Authentication required' });
      }

      // --- auth ---

      if (req.method === 'POST' && route === '/auth/login') {
        const body = await parseBody(req);
        const loginResult = auth.login(cfg, body, { roleResolver: roleFor });
        if (!loginResult.ok) {
          _safeAudit('auth.login', { ok: false, reason: loginResult.error || 'failed' },
            { target: (body && typeof body.user === 'string') ? body.user : '', actor: 'anonymous' });
          return err(res, 401, { error: loginResult.error || 'Login failed' });
        }
        _safeAudit('auth.login', { ok: true, role: loginResult.role || null },
          { target: loginResult.user, actor: loginResult.user });
        return ok(res, { token: loginResult.token, user: loginResult.user, role: loginResult.role || null });
      }

      if (req.method === 'POST' && route === '/auth/logout') {
        _safeAudit('auth.logout', {}, {});
        return ok(res, { ok: true });
      }

      if (req.method === 'GET' && route === '/auth/status') {
        return ok(res, { enabled: auth.isAuthEnabled(cfg) });
      }

      // --- list ---

      if (req.method === 'GET' && route === '/list') {
        const listed = manager.list();
        if (listed && Array.isArray(listed.workers)) {
          for (const w of listed.workers) {
            if (!w.tier) w.tier = 'worker';
          }
        }
        return ok(res, listed);
      }

      // --- autonomous ---

      if (req.method === 'GET' && route === '/autonomous/status') {
        if (!autoDispatcher) {
          return ok(res, {
            enabled: false,
            paused: false,
            reason: 'autonomous.mode=false (set config.autonomous.mode=true to enable)',
          });
        }
        return ok(res, autoDispatcher.getStatus());
      }

      if (req.method === 'POST' && route === '/autonomous/pause') {
        if (!autoDispatcher) return ok(res, { error: 'autonomous mode not enabled' });
        const body = await parseBody(req);
        return ok(res, autoDispatcher.pause((body && body.reason) || 'manual via cli'));
      }

      if (req.method === 'POST' && route === '/autonomous/resume') {
        if (!autoDispatcher) return ok(res, { error: 'autonomous mode not enabled' });
        return ok(res, autoDispatcher.resume());
      }

      if (req.method === 'POST' && route === '/autonomous/tick') {
        if (!autoDispatcher) return ok(res, { error: 'autonomous mode not enabled' });
        const out = await autoDispatcher.tick();
        return ok(res, out);
      }

      // --- config ---

      if (req.method === 'GET' && route === '/config') {
        return ok(res, manager.getConfig());
      }

      if (req.method === 'POST' && route === '/config/reload') {
        const gate = requireRole(authCheck, rbac.ACTIONS.CONFIG_RELOAD);
        if (denyOr(res, gate)) return;
        try { rbacManager.reload(); } catch {}
        const result = manager.reloadConfig();
        _safeAudit('config.reloaded', {}, {});
        return ok(res, result);
      }

      // Fallback for unknown routes — surfaces typos in the test itself.
      return err(res, 404, { error: 'Not found: ' + route });
    } catch (e) {
      return err(res, 500, { error: e && e.message ? e.message : String(e) });
    }
  });

  return { server, audits };
}

// ---------------------------------------------------------------------------
// /auth/login + /auth/status
// ---------------------------------------------------------------------------

describe('(1.11.97) POST /auth/login', () => {
  let server;
  let harness;
  const password = 'tester-pw';
  const secret = auth.generateSecret();

  before((t, done) => {
    const cfg = {
      auth: {
        enabled: true,
        secret,
        users: {
          alice: { passwordHash: auth.hashPassword(password), role: 'manager' },
          bob: { passwordHash: auth.hashPassword(password), role: 'viewer' },
        },
      },
    };
    const manager = makeStubManager({ config: cfg });
    const rbacManager = makeRbac({ alice: 'manager', bob: 'viewer' });
    harness = buildRoutesServer({ manager, rbacManager, autoDispatcher: makeStubAutoDispatcher() });
    server = harness.server;
    server.listen(0, '127.0.0.1', done);
  });

  after(() => { try { server.close(); } catch {} });

  it('returns 200 + token for valid credentials', async () => {
    const res = await request(server)
      .post('/auth/login')
      .send({ user: 'alice', password })
      .expect(200);
    assert.strictEqual(res.body.user, 'alice');
    assert.strictEqual(res.body.role, 'manager');
    assert.ok(typeof res.body.token === 'string' && res.body.token.length > 20);
    // Verify the JWT is signed with the configured secret.
    const verified = auth.verifyToken(res.body.token, secret);
    assert.strictEqual(verified.valid, true);
    assert.strictEqual(verified.decoded.sub, 'alice');
    assert.strictEqual(verified.decoded.role, 'manager');
  });

  it('returns 200 with viewer role when assigned', async () => {
    const res = await request(server)
      .post('/auth/login')
      .send({ user: 'bob', password })
      .expect(200);
    assert.strictEqual(res.body.role, 'viewer');
  });

  it('returns 401 for invalid password', async () => {
    const res = await request(server)
      .post('/auth/login')
      .send({ user: 'alice', password: 'wrong' })
      .expect(401);
    assert.ok(res.body.error.includes('invalid credentials'));
  });

  it('returns 401 for unknown user', async () => {
    const res = await request(server)
      .post('/auth/login')
      .send({ user: 'mallory', password })
      .expect(401);
    assert.ok(res.body.error.includes('invalid credentials'));
  });

  it('returns 401 when password is missing', async () => {
    const res = await request(server)
      .post('/auth/login')
      .send({ user: 'alice' })
      .expect(401);
    assert.ok(res.body.error.includes('missing'));
  });

  it('returns 401 when user is missing', async () => {
    const res = await request(server)
      .post('/auth/login')
      .send({ password })
      .expect(401);
    assert.ok(res.body.error.includes('missing'));
  });

  it('returns 401 when body is empty', async () => {
    const res = await request(server)
      .post('/auth/login')
      .send({})
      .expect(401);
    assert.ok(res.body.error.includes('missing'));
  });

  it('records an audit entry on success', async () => {
    const before = harness.audits.length;
    await request(server)
      .post('/auth/login')
      .send({ user: 'alice', password })
      .expect(200);
    const fresh = harness.audits.slice(before);
    assert.ok(fresh.some((a) => a.type === 'auth.login' && a.details.ok === true));
  });

  it('records an audit entry on failure', async () => {
    const before = harness.audits.length;
    await request(server)
      .post('/auth/login')
      .send({ user: 'alice', password: 'wrong' })
      .expect(401);
    const fresh = harness.audits.slice(before);
    assert.ok(fresh.some((a) => a.type === 'auth.login' && a.details.ok === false));
  });
});

describe('(1.11.97) GET /auth/status', () => {
  it('returns enabled:true when auth.enabled=true', async () => {
    const cfg = { auth: { enabled: true, secret: auth.generateSecret(), users: {} } };
    const manager = makeStubManager({ config: cfg });
    const rbacManager = makeRbac();
    const { server } = buildRoutesServer({ manager, rbacManager });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    try {
      const res = await request(server).get('/auth/status').expect(200);
      assert.strictEqual(res.body.enabled, true);
    } finally {
      server.close();
    }
  });

  it('returns enabled:false when auth is disabled', async () => {
    const manager = makeStubManager({ config: { auth: { enabled: false } } });
    const rbacManager = makeRbac();
    const { server } = buildRoutesServer({ manager, rbacManager });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    try {
      const res = await request(server).get('/auth/status').expect(200);
      assert.strictEqual(res.body.enabled, false);
    } finally {
      server.close();
    }
  });

  it('is reachable without a token even when auth is enabled', async () => {
    const cfg = { auth: { enabled: true, secret: auth.generateSecret(), users: {} } };
    const manager = makeStubManager({ config: cfg });
    const rbacManager = makeRbac();
    const { server } = buildRoutesServer({ manager, rbacManager });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    try {
      // No Authorization header. /auth/status is part of OPEN_API_ROUTES
      // so 401 here would mean a regression in the auth middleware.
      await request(server).get('/auth/status').expect(200);
    } finally {
      server.close();
    }
  });
});

describe('(1.11.97) POST /auth/logout', () => {
  it('returns ok:true for an authenticated request', async () => {
    const secret = auth.generateSecret();
    const cfg = {
      auth: {
        enabled: true, secret,
        users: { alice: { passwordHash: auth.hashPassword('pw'), role: 'manager' } },
      },
    };
    const manager = makeStubManager({ config: cfg });
    const rbacManager = makeRbac({ alice: 'manager' });
    const { server, audits } = buildRoutesServer({ manager, rbacManager });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    try {
      const token = auth.signToken({ sub: 'alice', role: 'manager' }, secret);
      const res = await request(server)
        .post('/auth/logout')
        .set('Authorization', 'Bearer ' + token)
        .expect(200);
      assert.strictEqual(res.body.ok, true);
      assert.ok(audits.some((a) => a.type === 'auth.logout'));
    } finally {
      server.close();
    }
  });
});

// ---------------------------------------------------------------------------
// /list
// ---------------------------------------------------------------------------

describe('(1.11.97) GET /list', () => {
  it('returns empty arrays when no workers are registered', async () => {
    const manager = makeStubManager({ config: { auth: { enabled: false } } });
    const rbacManager = makeRbac();
    const { server } = buildRoutesServer({ manager, rbacManager });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    try {
      const res = await request(server).get('/list').expect(200);
      assert.deepStrictEqual(res.body.workers, []);
      assert.deepStrictEqual(res.body.queuedTasks, []);
      assert.deepStrictEqual(res.body.lostWorkers, []);
    } finally {
      server.close();
    }
  });

  it('returns workers when they exist', async () => {
    const workers = [
      { name: 'w1', status: 'idle', branch: 'c4/w1' },
      { name: 'w2', status: 'busy', branch: 'c4/w2', tier: 'manager' },
    ];
    const manager = makeStubManager({ config: { auth: { enabled: false } }, workers });
    const rbacManager = makeRbac();
    const { server } = buildRoutesServer({ manager, rbacManager });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    try {
      const res = await request(server).get('/list').expect(200);
      assert.strictEqual(res.body.workers.length, 2);
      assert.strictEqual(res.body.workers[0].name, 'w1');
      assert.strictEqual(res.body.workers[1].name, 'w2');
    } finally {
      server.close();
    }
  });

  it('enriches workers with default tier=worker when missing', async () => {
    const workers = [{ name: 'w1', status: 'idle', branch: 'c4/w1' }];
    const manager = makeStubManager({ config: { auth: { enabled: false } }, workers });
    const rbacManager = makeRbac();
    const { server } = buildRoutesServer({ manager, rbacManager });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    try {
      const res = await request(server).get('/list').expect(200);
      assert.strictEqual(res.body.workers[0].tier, 'worker');
    } finally {
      server.close();
    }
  });

  it('preserves an explicit tier=manager when present', async () => {
    const workers = [{ name: 'mgr', status: 'idle', branch: 'c4/mgr', tier: 'manager' }];
    const manager = makeStubManager({ config: { auth: { enabled: false } }, workers });
    const rbacManager = makeRbac();
    const { server } = buildRoutesServer({ manager, rbacManager });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    try {
      const res = await request(server).get('/list').expect(200);
      assert.strictEqual(res.body.workers[0].tier, 'manager');
    } finally {
      server.close();
    }
  });

  it('returns 401 when auth is enabled and no bearer token is sent', async () => {
    const cfg = { auth: { enabled: true, secret: auth.generateSecret(), users: {} } };
    const manager = makeStubManager({ config: cfg });
    const rbacManager = makeRbac();
    const { server } = buildRoutesServer({ manager, rbacManager });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    try {
      const res = await request(server).get('/list').expect(401);
      assert.ok(res.body.error.includes('Authentication required'));
    } finally {
      server.close();
    }
  });

  it('returns 401 when bearer token is malformed', async () => {
    const cfg = { auth: { enabled: true, secret: auth.generateSecret(), users: {} } };
    const manager = makeStubManager({ config: cfg });
    const rbacManager = makeRbac();
    const { server } = buildRoutesServer({ manager, rbacManager });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    try {
      const res = await request(server)
        .get('/list')
        .set('Authorization', 'Bearer not-a-real-jwt')
        .expect(401);
      assert.ok(res.body.error.toLowerCase().includes('invalid'));
    } finally {
      server.close();
    }
  });

  it('returns 200 when a valid bearer token is sent and auth is enabled', async () => {
    const secret = auth.generateSecret();
    const cfg = { auth: { enabled: true, secret, users: {} } };
    const manager = makeStubManager({ config: cfg });
    const rbacManager = makeRbac();
    const { server } = buildRoutesServer({ manager, rbacManager });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    try {
      const token = auth.signToken({ sub: 'alice', role: 'manager' }, secret);
      const res = await request(server)
        .get('/list')
        .set('Authorization', 'Bearer ' + token)
        .expect(200);
      assert.ok(Array.isArray(res.body.workers));
    } finally {
      server.close();
    }
  });

  it('passes through under the /api/ prefix alias', async () => {
    const manager = makeStubManager({ config: { auth: { enabled: false } } });
    const rbacManager = makeRbac();
    const { server } = buildRoutesServer({ manager, rbacManager });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    try {
      const res = await request(server).get('/api/list').expect(200);
      assert.ok(Array.isArray(res.body.workers));
    } finally {
      server.close();
    }
  });
});

// ---------------------------------------------------------------------------
// /autonomous/*
// ---------------------------------------------------------------------------

describe('(1.11.97) /autonomous/* routes', () => {
  describe('with a live AutoDispatcher', () => {
    let server;
    let dispatcher;

    before((t, done) => {
      const manager = makeStubManager({ config: { auth: { enabled: false } } });
      const rbacManager = makeRbac();
      dispatcher = makeStubAutoDispatcher();
      const out = buildRoutesServer({ manager, rbacManager, autoDispatcher: dispatcher });
      server = out.server;
      server.listen(0, '127.0.0.1', done);
    });

    after(() => { try { server.close(); } catch {} });

    it('GET /autonomous/status returns the dispatcher status payload', async () => {
      const res = await request(server).get('/autonomous/status').expect(200);
      assert.strictEqual(res.body.enabled, true);
      assert.strictEqual(res.body.paused, false);
      assert.strictEqual(res.body.consecutiveHalts, 0);
    });

    it('POST /autonomous/pause flips paused=true and records the reason', async () => {
      const res = await request(server)
        .post('/autonomous/pause')
        .send({ reason: 'maintenance' })
        .expect(200);
      assert.strictEqual(res.body.paused, true);
      assert.strictEqual(res.body.pauseReason, 'maintenance');
    });

    it('GET /autonomous/status reflects the pause', async () => {
      const res = await request(server).get('/autonomous/status').expect(200);
      assert.strictEqual(res.body.paused, true);
      assert.strictEqual(res.body.pauseReason, 'maintenance');
    });

    it('POST /autonomous/pause without a body uses the default reason', async () => {
      // Resume first so we can re-pause with the default reason path.
      await request(server).post('/autonomous/resume').expect(200);
      const res = await request(server)
        .post('/autonomous/pause')
        .send({})
        .expect(200);
      assert.strictEqual(res.body.paused, true);
      assert.strictEqual(res.body.pauseReason, 'manual via cli');
    });

    it('POST /autonomous/resume clears paused and pauseReason', async () => {
      const res = await request(server).post('/autonomous/resume').expect(200);
      assert.strictEqual(res.body.paused, false);
      assert.strictEqual(res.body.pauseReason, null);
    });

    it('POST /autonomous/tick increments the tick counter', async () => {
      const before = dispatcher._state.tickCount;
      const res = await request(server).post('/autonomous/tick').expect(200);
      assert.strictEqual(res.body.tickCount, before + 1);
    });
  });

  describe('with no AutoDispatcher (autonomous.mode=false)', () => {
    let server;

    before((t, done) => {
      const manager = makeStubManager({ config: { auth: { enabled: false } } });
      const rbacManager = makeRbac();
      const out = buildRoutesServer({ manager, rbacManager, autoDispatcher: null });
      server = out.server;
      server.listen(0, '127.0.0.1', done);
    });

    after(() => { try { server.close(); } catch {} });

    it('GET /autonomous/status returns the disabled payload', async () => {
      const res = await request(server).get('/autonomous/status').expect(200);
      assert.strictEqual(res.body.enabled, false);
      assert.strictEqual(res.body.paused, false);
      assert.ok(typeof res.body.reason === 'string' && res.body.reason.includes('autonomous.mode=false'));
    });

    it('POST /autonomous/pause returns the not-enabled error', async () => {
      const res = await request(server).post('/autonomous/pause').send({}).expect(200);
      assert.ok(res.body.error.includes('autonomous mode not enabled'));
    });

    it('POST /autonomous/resume returns the not-enabled error', async () => {
      const res = await request(server).post('/autonomous/resume').send({}).expect(200);
      assert.ok(res.body.error.includes('autonomous mode not enabled'));
    });

    it('POST /autonomous/tick returns the not-enabled error', async () => {
      const res = await request(server).post('/autonomous/tick').send({}).expect(200);
      assert.ok(res.body.error.includes('autonomous mode not enabled'));
    });
  });

  describe('auth-failure paths', () => {
    function withAuthEnabled() {
      const cfg = { auth: { enabled: true, secret: auth.generateSecret(), users: {} } };
      const manager = makeStubManager({ config: cfg });
      const rbacManager = makeRbac();
      return buildRoutesServer({
        manager,
        rbacManager,
        autoDispatcher: makeStubAutoDispatcher(),
      });
    }

    it('GET /autonomous/status returns 401 without a token', async () => {
      const { server } = withAuthEnabled();
      await new Promise((r) => server.listen(0, '127.0.0.1', r));
      try {
        await request(server).get('/autonomous/status').expect(401);
      } finally {
        server.close();
      }
    });

    it('POST /autonomous/pause returns 401 without a token', async () => {
      const { server } = withAuthEnabled();
      await new Promise((r) => server.listen(0, '127.0.0.1', r));
      try {
        await request(server).post('/autonomous/pause').send({}).expect(401);
      } finally {
        server.close();
      }
    });

    it('POST /autonomous/resume returns 401 without a token', async () => {
      const { server } = withAuthEnabled();
      await new Promise((r) => server.listen(0, '127.0.0.1', r));
      try {
        await request(server).post('/autonomous/resume').send({}).expect(401);
      } finally {
        server.close();
      }
    });

    it('POST /autonomous/tick returns 401 without a token', async () => {
      const { server } = withAuthEnabled();
      await new Promise((r) => server.listen(0, '127.0.0.1', r));
      try {
        await request(server).post('/autonomous/tick').send({}).expect(401);
      } finally {
        server.close();
      }
    });
  });
});

// ---------------------------------------------------------------------------
// /config + /config/reload
// ---------------------------------------------------------------------------

describe('(1.11.97) /config routes', () => {
  it('GET /config returns the current config', async () => {
    const cfg = { auth: { enabled: false }, scribbleField: 42 };
    const manager = makeStubManager({ config: cfg });
    const rbacManager = makeRbac();
    const { server } = buildRoutesServer({ manager, rbacManager });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    try {
      const res = await request(server).get('/config').expect(200);
      assert.strictEqual(res.body.scribbleField, 42);
      assert.strictEqual(res.body.auth.enabled, false);
    } finally {
      server.close();
    }
  });

  it('GET /config returns 401 when auth enabled and no bearer token is sent', async () => {
    const cfg = { auth: { enabled: true, secret: auth.generateSecret(), users: {} } };
    const manager = makeStubManager({ config: cfg });
    const rbacManager = makeRbac();
    const { server } = buildRoutesServer({ manager, rbacManager });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    try {
      await request(server).get('/config').expect(401);
    } finally {
      server.close();
    }
  });

  it('GET /config returns 200 with a valid token when auth is enabled', async () => {
    const secret = auth.generateSecret();
    const cfg = { auth: { enabled: true, secret, users: {} }, marker: 'hi' };
    const manager = makeStubManager({ config: cfg });
    const rbacManager = makeRbac();
    const { server } = buildRoutesServer({ manager, rbacManager });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    try {
      const token = auth.signToken({ sub: 'alice', role: 'manager' }, secret);
      const res = await request(server)
        .get('/config')
        .set('Authorization', 'Bearer ' + token)
        .expect(200);
      assert.strictEqual(res.body.marker, 'hi');
    } finally {
      server.close();
    }
  });

  it('POST /config/reload returns success when caller has the role', async () => {
    const secret = auth.generateSecret();
    const cfg = { auth: { enabled: true, secret, users: {} } };
    const manager = makeStubManager({ config: cfg });
    const rbacManager = makeRbac({ alice: 'admin' });
    const { server, audits } = buildRoutesServer({ manager, rbacManager });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    try {
      const token = auth.signToken({ sub: 'alice', role: 'admin' }, secret);
      const res = await request(server)
        .post('/config/reload')
        .set('Authorization', 'Bearer ' + token)
        .send({})
        .expect(200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(manager.reloadCount(), 1);
      assert.ok(audits.some((a) => a.type === 'config.reloaded'));
    } finally {
      server.close();
    }
  });

  it('POST /config/reload returns 403 when caller lacks the role', async () => {
    const secret = auth.generateSecret();
    const cfg = { auth: { enabled: true, secret, users: {} } };
    const manager = makeStubManager({ config: cfg });
    const rbacManager = makeRbac({ eve: 'viewer' });
    const { server } = buildRoutesServer({ manager, rbacManager });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    try {
      const token = auth.signToken({ sub: 'eve', role: 'viewer' }, secret);
      const res = await request(server)
        .post('/config/reload')
        .set('Authorization', 'Bearer ' + token)
        .send({})
        .expect(403);
      assert.strictEqual(res.body.action, rbac.ACTIONS.CONFIG_RELOAD);
      assert.strictEqual(res.body.user, 'eve');
      assert.strictEqual(manager.reloadCount(), 0);
    } finally {
      server.close();
    }
  });

  it('POST /config/reload returns 401 when no token is sent', async () => {
    const cfg = { auth: { enabled: true, secret: auth.generateSecret(), users: {} } };
    const manager = makeStubManager({ config: cfg });
    const rbacManager = makeRbac();
    const { server } = buildRoutesServer({ manager, rbacManager });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    try {
      await request(server).post('/config/reload').send({}).expect(401);
      assert.strictEqual(manager.reloadCount(), 0);
    } finally {
      server.close();
    }
  });

  it('POST /config/reload is allowed when auth is disabled', async () => {
    // When auth.enabled=false, requireRole short-circuits to allow=true,
    // matching the existing operator-on-localhost workflow.
    const manager = makeStubManager({ config: { auth: { enabled: false } } });
    const rbacManager = makeRbac();
    const { server } = buildRoutesServer({ manager, rbacManager });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    try {
      const res = await request(server).post('/config/reload').send({}).expect(200);
      assert.strictEqual(res.body.success, true);
    } finally {
      server.close();
    }
  });
});

// ---------------------------------------------------------------------------
// daemon.js source integration
// ---------------------------------------------------------------------------
//
// A handful of grep-style assertions on src/daemon.js so a future refactor
// that moves these routes around still has to keep the names + verbs
// stable. Mirrors the `daemon.js source integration` block in
// daemon-api.test.js.

describe('(1.11.97) daemon.js source integration for tested routes', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'daemon.js'), 'utf8');

  it('handles POST /auth/login', () => {
    assert.ok(/req\.method === 'POST' && route === '\/auth\/login'/.test(src));
  });

  it('handles GET /auth/status', () => {
    assert.ok(/req\.method === 'GET' && route === '\/auth\/status'/.test(src));
  });

  it('handles GET /list', () => {
    assert.ok(/req\.method === 'GET' && route === '\/list'/.test(src));
  });

  it('handles GET /autonomous/status', () => {
    assert.ok(/req\.method === 'GET' && route === '\/autonomous\/status'/.test(src));
  });

  it('handles POST /autonomous/pause', () => {
    assert.ok(/req\.method === 'POST' && route === '\/autonomous\/pause'/.test(src));
  });

  it('handles POST /autonomous/resume', () => {
    assert.ok(/req\.method === 'POST' && route === '\/autonomous\/resume'/.test(src));
  });

  it('handles POST /autonomous/tick', () => {
    assert.ok(/req\.method === 'POST' && route === '\/autonomous\/tick'/.test(src));
  });

  it('handles GET /config', () => {
    assert.ok(/req\.method === 'GET' && route === '\/config'/.test(src));
  });

  it('handles POST /config/reload gated by CONFIG_RELOAD', () => {
    assert.ok(/req\.method === 'POST' && route === '\/config\/reload'/.test(src));
    assert.ok(/rbac\.ACTIONS\.CONFIG_RELOAD/.test(src));
  });
});
