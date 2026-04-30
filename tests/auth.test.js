// 10.1 RBAC tests.

'use strict';

const { describe, it } = require('node:test');
const assert = require('assert');

const { Auth } = require('../src/auth');

const USERS = {
  alice: { password: 'pa', role: 'admin' },
  bob:   { password: 'pb', role: 'manager' },
  carol: { password: 'pc', role: 'viewer' },
};

function newAuth(extra = {}) {
  return new Auth({ auth: { enabled: true, users: USERS, secret: 'unit-test', ...extra } });
}

describe('Auth.issueToken / verifyToken', () => {
  it('issues a token for valid credentials', () => {
    const a = newAuth();
    const r = a.issueToken('alice', 'pa');
    assert.ok(r.token);
    assert.strictEqual(r.role, 'admin');
  });

  it('rejects wrong password', () => {
    const a = newAuth();
    const r = a.issueToken('alice', 'wrong');
    assert.ok(r.error);
  });

  it('rejects unknown user', () => {
    const a = newAuth();
    const r = a.issueToken('eve', 'x');
    assert.ok(r.error);
  });

  it('verifyToken accepts the token it just issued', () => {
    const a = newAuth();
    const { token } = a.issueToken('bob', 'pb');
    const payload = a.verifyToken(token);
    assert.strictEqual(payload.sub, 'bob');
    assert.strictEqual(payload.role, 'manager');
  });

  it('verifyToken rejects forged signature', () => {
    const a = newAuth();
    const { token } = a.issueToken('alice', 'pa');
    const tampered = token.slice(0, -2) + 'xx';
    assert.strictEqual(a.verifyToken(tampered), null);
  });

  it('verifyToken rejects expired tokens', () => {
    const a = newAuth({ tokenTtlMs: 1 });
    const { token } = a.issueToken('alice', 'pa');
    // Wait past expiry
    return new Promise((resolve) => setTimeout(() => {
      assert.strictEqual(a.verifyToken(token), null);
      resolve();
    }, 5));
  });
});

describe('Auth.authorize / route gating', () => {
  function reqWithToken(method, token) {
    return { method, headers: token ? { authorization: `Bearer ${token}` } : {} };
  }

  it('disabled auth lets everything through', () => {
    const a = new Auth({ auth: { enabled: false } });
    const r = a.authorize({ method: 'POST', headers: {} }, '/close');
    assert.strictEqual(r.ok, true);
  });

  it('login + health bypass auth even when enabled', () => {
    const a = newAuth();
    assert.strictEqual(a.authorize({ method: 'POST', headers: {} }, '/auth/login').ok, true);
    assert.strictEqual(a.authorize({ method: 'GET', headers: {} }, '/health').ok, true);
  });

  it('rejects missing bearer with 401', () => {
    const a = newAuth();
    const r = a.authorize({ method: 'GET', headers: {} }, '/list');
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.status, 401);
  });

  it('viewer can hit GETs but not mutating routes', () => {
    const a = newAuth();
    const { token: viewerToken } = a.issueToken('carol', 'pc');
    assert.strictEqual(a.authorize(reqWithToken('GET', viewerToken), '/list').ok, true);
    const denied = a.authorize(reqWithToken('POST', viewerToken), '/create');
    assert.strictEqual(denied.ok, false);
    assert.strictEqual(denied.status, 403);
  });

  it('manager can mutate workers but not destroy', () => {
    const a = newAuth();
    const { token: managerToken } = a.issueToken('bob', 'pb');
    assert.strictEqual(a.authorize(reqWithToken('POST', managerToken), '/create').ok, true);
    assert.strictEqual(a.authorize(reqWithToken('POST', managerToken), '/task').ok, true);
    const denied = a.authorize(reqWithToken('POST', managerToken), '/close');
    assert.strictEqual(denied.ok, false);
    assert.strictEqual(denied.status, 403);
  });

  it('admin can hit destructive routes', () => {
    const a = newAuth();
    const { token: adminToken } = a.issueToken('alice', 'pa');
    for (const route of ['/close', '/rollback', '/restart', '/audit', '/fleet/transfer']) {
      const method = route === '/audit' ? 'GET' : 'POST';
      const r = a.authorize(reqWithToken(method, adminToken), route);
      assert.strictEqual(r.ok, true, `admin should access ${route}`);
    }
  });

  // --- enforceProjectScope (per-user allow-list) ---

  it('enforceProjectScope passes when user has no projects[]', () => {
    const a = newAuth();
    const payload = { sub: 'bob', role: 'manager' };
    const r = a.enforceProjectScope(payload, null, { name: 'w1' });
    assert.strictEqual(r.ok, true);
  });

  it('enforceProjectScope rejects when worker is in another project', () => {
    const a = new Auth({ auth: { enabled: true, secret: 't', users: {
      bob: { password: 'pb', role: 'manager', projects: ['arps'] },
    } } });
    const payload = { sub: 'bob', role: 'manager' };
    const fakeManager = {
      workers: new Map([['otherproj-w', {}]]),
      _resolveWorkerProject: () => 'datalake',
    };
    const r = a.enforceProjectScope(payload, fakeManager, { name: 'otherproj-w' });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.status, 403);
  });

  it('enforceProjectScope passes when worker is in user\'s allow-list', () => {
    const a = new Auth({ auth: { enabled: true, secret: 't', users: {
      bob: { password: 'pb', role: 'manager', projects: ['arps'] },
    } } });
    const fakeManager = {
      workers: new Map([['mine', {}]]),
      _resolveWorkerProject: () => 'arps',
    };
    const r = a.enforceProjectScope({ sub: 'bob', role: 'manager' }, fakeManager, { name: 'mine' });
    assert.strictEqual(r.ok, true);
  });

  it('admin role bypasses project scope', () => {
    const a = new Auth({ auth: { enabled: true, secret: 't', users: {
      alice: { password: 'pa', role: 'admin', projects: ['arps'] },
    } } });
    const fakeManager = {
      workers: new Map([['anywhere', {}]]),
      _resolveWorkerProject: () => 'whatever',
    };
    const r = a.enforceProjectScope({ sub: 'alice', role: 'admin' }, fakeManager, { name: 'anywhere' });
    assert.strictEqual(r.ok, true);
  });
});
