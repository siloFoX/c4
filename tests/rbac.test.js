// (10.1) RBAC tests.
//
// Covers the RoleManager core (storage, role assignment, resource
// grants, permission checks) plus the JWT integration in src/auth.js
// (login payload includes role). Every test writes to a tmpdir path so
// the operator's real ~/.c4/rbac.json is never touched.

'use strict';
require('./jest-shim');

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  RoleManager,
  ROLES,
  ACTIONS,
  ALL_ACTIONS,
  DEFAULT_PERMISSIONS,
  defaultRbacPath,
  freshState,
  ensureShape,
  normalizeAcl,
  isRole,
  isAction,
  isUsername,
  getShared,
  resetShared,
} = require('../src/rbac');

const auth = require('../src/auth');

function mkTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'c4-rbac-test-'));
}

function newManager() {
  const dir = mkTmpDir();
  return new RoleManager({ storePath: path.join(dir, 'rbac.json') });
}

describe('(10.1) RBAC helpers', () => {
  test('(a) defaultRbacPath points under home/.c4/rbac.json', () => {
    const p = defaultRbacPath();
    expect(p.endsWith(path.join('.c4', 'rbac.json'))).toBe(true);
    expect(p.startsWith(os.homedir())).toBe(true);
  });

  test('(b) ROLES constant is exactly admin/manager/viewer', () => {
    expect(ROLES).toEqual(['admin', 'manager', 'viewer']);
  });

  test('(c) ACTIONS enum exposes the canonical action names', () => {
    expect(ACTIONS.WORKER_CREATE).toBe('worker.create');
    expect(ACTIONS.WORKER_CLOSE).toBe('worker.close');
    expect(ACTIONS.WORKER_TASK).toBe('worker.task');
    expect(ACTIONS.WORKER_MERGE).toBe('worker.merge');
    expect(ACTIONS.PROJECT_CREATE).toBe('project.create');
    expect(ACTIONS.PROJECT_READ).toBe('project.read');
    expect(ACTIONS.PROJECT_UPDATE).toBe('project.update');
    expect(ACTIONS.FLEET_ADD).toBe('fleet.add');
    expect(ACTIONS.FLEET_REMOVE).toBe('fleet.remove');
    expect(ACTIONS.CONFIG_RELOAD).toBe('config.reload');
    expect(ACTIONS.AUTH_USER_CREATE).toBe('auth.user.create');
    expect(ACTIONS.AUDIT_READ).toBe('audit.read');
    expect(ACTIONS.CICD_READ).toBe('cicd.read');
    expect(ACTIONS.CICD_MANAGE).toBe('cicd.manage');
    expect(ACTIONS.ORG_READ).toBe('org.read');
    expect(ACTIONS.ORG_MANAGE).toBe('org.manage');
    expect(ACTIONS.SCHEDULE_READ).toBe('schedule.read');
    expect(ACTIONS.SCHEDULE_MANAGE).toBe('schedule.manage');
    expect(ACTIONS.MCP_READ).toBe('mcp.read');
    expect(ACTIONS.MCP_MANAGE).toBe('mcp.manage');
    expect(ACTIONS.NL_CHAT).toBe('nl.chat');
    expect(ACTIONS.WORKFLOW_READ).toBe('workflow.read');
    expect(ACTIONS.WORKFLOW_MANAGE).toBe('workflow.manage');
    expect(ACTIONS.COMPUTER_USE).toBe('computer.use');
    expect(ALL_ACTIONS.length).toBe(24);
  });

  test('(d) isRole/isAction/isUsername validators', () => {
    expect(isRole('admin')).toBe(true);
    expect(isRole('manager')).toBe(true);
    expect(isRole('viewer')).toBe(true);
    expect(isRole('root')).toBe(false);
    expect(isRole('')).toBe(false);
    expect(isAction('worker.create')).toBe(true);
    expect(isAction('')).toBe(false);
    expect(isUsername('alice')).toBe(true);
    expect(isUsername('alice.bob_99')).toBe(true);
    expect(isUsername('bad name')).toBe(false);
    expect(isUsername('')).toBe(false);
  });

  test('(e) freshState matches DEFAULT_PERMISSIONS', () => {
    const s = freshState();
    expect(s.roles.admin).toEqual(['*']);
    expect(s.roles.manager).toContain('worker.create');
    expect(s.roles.viewer).toContain('project.read');
    expect(Object.keys(s.users).length).toBe(0);
    expect(s.resources.projects).toEqual({});
    expect(s.resources.machines).toEqual({});
  });

  test('(f) ensureShape repairs missing fields', () => {
    const s = ensureShape({ users: { alice: { role: 'manager' } } });
    expect(s.users.alice.role).toBe('manager');
    expect(s.users.alice.projectIds).toEqual([]);
    expect(s.users.alice.machineAliases).toEqual([]);
    expect(s.roles.admin).toEqual(['*']);
  });

  test('(g) normalizeAcl filters bad entries', () => {
    const a = normalizeAcl({
      allowedRoles: ['admin', 'badRole', 'viewer'],
      allowedUsers: ['alice', 'bad name'],
    });
    expect(a.allowedRoles).toEqual(['admin', 'viewer']);
    expect(a.allowedUsers).toEqual(['alice']);
  });
});

describe('(10.1) DEFAULT_PERMISSIONS matrix', () => {
  test('(a) admin role has wildcard', () => {
    expect(DEFAULT_PERMISSIONS.admin).toEqual(['*']);
  });

  test('(b) manager role covers expected lifecycle actions', () => {
    expect(DEFAULT_PERMISSIONS.manager).toContain('worker.create');
    expect(DEFAULT_PERMISSIONS.manager).toContain('worker.close');
    expect(DEFAULT_PERMISSIONS.manager).toContain('worker.task');
    expect(DEFAULT_PERMISSIONS.manager).toContain('worker.merge');
    expect(DEFAULT_PERMISSIONS.manager).toContain('project.create');
    expect(DEFAULT_PERMISSIONS.manager).toContain('project.read');
    expect(DEFAULT_PERMISSIONS.manager).toContain('project.update');
    expect(DEFAULT_PERMISSIONS.manager).toContain('fleet.add');
    expect(DEFAULT_PERMISSIONS.manager).toContain('config.reload');
    expect(DEFAULT_PERMISSIONS.manager).toContain('audit.read');
  });

  test('(c) manager is denied auth.user.create + fleet.remove by default', () => {
    expect(DEFAULT_PERMISSIONS.manager).not.toContain('auth.user.create');
    expect(DEFAULT_PERMISSIONS.manager).not.toContain('fleet.remove');
  });

  test('(d) viewer is read-only', () => {
    expect(DEFAULT_PERMISSIONS.viewer).toContain('project.read');
    expect(DEFAULT_PERMISSIONS.viewer).toContain('audit.read');
    expect(DEFAULT_PERMISSIONS.viewer).not.toContain('worker.create');
    expect(DEFAULT_PERMISSIONS.viewer).not.toContain('worker.task');
    expect(DEFAULT_PERMISSIONS.viewer).not.toContain('worker.merge');
    expect(DEFAULT_PERMISSIONS.viewer).not.toContain('project.create');
    expect(DEFAULT_PERMISSIONS.viewer).not.toContain('project.update');
    expect(DEFAULT_PERMISSIONS.viewer).not.toContain('config.reload');
  });
});

describe('(10.1) RoleManager.assignRole + storage', () => {
  test('(a) creates user file with correct role', () => {
    const m = newManager();
    const u = m.assignRole('alice', 'admin');
    expect(u.role).toBe('admin');
    expect(u.projectIds).toEqual([]);
    expect(u.machineAliases).toEqual([]);
    expect(fs.existsSync(m.storePath)).toBe(true);
  });

  test('(b) reload re-reads from disk', () => {
    const m = newManager();
    m.assignRole('alice', 'manager');
    const m2 = new RoleManager({ storePath: m.storePath });
    const u = m2.getUser('alice');
    expect(u.role).toBe('manager');
  });

  test('(c) assigning a new role to the same user preserves grants', () => {
    const m = newManager();
    m.assignRole('alice', 'manager');
    m.grantProjectAccess('alice', 'arps');
    m.assignRole('alice', 'viewer');
    const u = m.getUser('alice');
    expect(u.role).toBe('viewer');
    expect(u.projectIds).toContain('arps');
  });

  test('(d) assignRole rejects unknown role', () => {
    const m = newManager();
    expect(() => m.assignRole('alice', 'root')).toThrow('Invalid role');
  });

  test('(e) assignRole rejects bad username', () => {
    const m = newManager();
    expect(() => m.assignRole('bad name', 'admin')).toThrow('Invalid username');
  });

  test('(f) listUsersByRole returns only matching users', () => {
    const m = newManager();
    m.assignRole('alice', 'admin');
    m.assignRole('bob', 'manager');
    m.assignRole('carol', 'manager');
    m.assignRole('dave', 'viewer');
    expect(m.listUsersByRole('admin').length).toBe(1);
    expect(m.listUsersByRole('manager').length).toBe(2);
    expect(m.listUsersByRole('viewer').length).toBe(1);
    expect(m.listUsersByRole('bogus')).toEqual([]);
  });

  test('(g) removeUser drops the user', () => {
    const m = newManager();
    m.assignRole('alice', 'admin');
    expect(m.removeUser('alice')).toBe(true);
    expect(m.getUser('alice')).toBeNull();
    expect(m.removeUser('alice')).toBe(false);
  });
});

describe('(10.1) RoleManager.checkPermission', () => {
  test('(a) admin bypasses all action checks', () => {
    const m = newManager();
    m.assignRole('root', 'admin');
    for (const a of ALL_ACTIONS) {
      expect(m.checkPermission('root', a)).toBe(true);
    }
  });

  test('(b) viewer is blocked from worker.create', () => {
    const m = newManager();
    m.assignRole('eve', 'viewer');
    expect(m.checkPermission('eve', 'worker.create')).toBe(false);
    expect(m.checkPermission('eve', 'worker.task')).toBe(false);
    expect(m.checkPermission('eve', 'worker.merge')).toBe(false);
    expect(m.checkPermission('eve', 'project.create')).toBe(false);
    expect(m.checkPermission('eve', 'project.update')).toBe(false);
    expect(m.checkPermission('eve', 'config.reload')).toBe(false);
  });

  test('(c) viewer can read projects and audit', () => {
    const m = newManager();
    m.assignRole('eve', 'viewer');
    expect(m.checkPermission('eve', 'project.read')).toBe(true);
    expect(m.checkPermission('eve', 'audit.read')).toBe(true);
  });

  test('(d) manager can merge own project but not others', () => {
    const m = newManager();
    m.assignRole('mgr', 'manager');
    m.grantProjectAccess('mgr', 'arps');
    // Register an ACL on the other project so the unscoped fallback
    // does not let mgr through.
    m.setResourceAcl('project', 'secret', { allowedRoles: ['admin'] });
    expect(m.checkPermission('mgr', 'worker.merge', { type: 'project', id: 'arps' })).toBe(true);
    expect(m.checkPermission('mgr', 'worker.merge', { type: 'project', id: 'secret' })).toBe(false);
  });

  test('(e) grantProjectAccess then checkPermission allows', () => {
    const m = newManager();
    m.assignRole('mgr', 'manager');
    m.setResourceAcl('project', 'arps', { allowedRoles: [] });
    expect(m.checkPermission('mgr', 'project.update', { type: 'project', id: 'arps' })).toBe(false);
    m.grantProjectAccess('mgr', 'arps');
    expect(m.checkPermission('mgr', 'project.update', { type: 'project', id: 'arps' })).toBe(true);
  });

  test('(f) revokeProjectAccess removes the grant', () => {
    const m = newManager();
    m.assignRole('mgr', 'manager');
    m.setResourceAcl('project', 'arps', { allowedRoles: [] });
    m.grantProjectAccess('mgr', 'arps');
    expect(m.checkPermission('mgr', 'project.update', { type: 'project', id: 'arps' })).toBe(true);
    expect(m.revokeProjectAccess('mgr', 'arps')).toBe(true);
    expect(m.checkPermission('mgr', 'project.update', { type: 'project', id: 'arps' })).toBe(false);
  });

  test('(g) grantMachineAccess + revoke works for machines', () => {
    const m = newManager();
    m.assignRole('mgr', 'manager');
    m.setResourceAcl('machine', 'dgx', { allowedRoles: [] });
    expect(m.checkPermission('mgr', 'worker.create', { type: 'machine', id: 'dgx' })).toBe(false);
    m.grantMachineAccess('mgr', 'dgx');
    expect(m.checkPermission('mgr', 'worker.create', { type: 'machine', id: 'dgx' })).toBe(true);
    expect(m.revokeMachineAccess('mgr', 'dgx')).toBe(true);
    expect(m.checkPermission('mgr', 'worker.create', { type: 'machine', id: 'dgx' })).toBe(false);
  });

  test('(h) unknown user always denied', () => {
    const m = newManager();
    expect(m.checkPermission('ghost', 'worker.create')).toBe(false);
    expect(m.checkPermission('ghost', 'project.read')).toBe(false);
    expect(m.checkPermission('', 'project.read')).toBe(false);
  });

  test('(i) unknown action denied for non-admin', () => {
    const m = newManager();
    m.assignRole('mgr', 'manager');
    expect(m.checkPermission('mgr', 'worker.bogus')).toBe(false);
    expect(m.checkPermission('mgr', '')).toBe(false);
  });

  test('(j) admin bypasses resource scoping (wildcard)', () => {
    const m = newManager();
    m.assignRole('root', 'admin');
    m.setResourceAcl('project', 'sealed', { allowedUsers: ['nobody'] });
    expect(m.checkPermission('root', 'project.update', { type: 'project', id: 'sealed' })).toBe(true);
  });

  test('(k) unscoped resource (no ACL) falls through to role-only check', () => {
    const m = newManager();
    m.assignRole('mgr', 'manager');
    expect(m.checkPermission('mgr', 'worker.create', { type: 'machine', id: 'fresh-machine' })).toBe(true);
  });

  test('(l) allowedRoles in ACL grants access to whole role', () => {
    const m = newManager();
    m.assignRole('mgr1', 'manager');
    m.assignRole('mgr2', 'manager');
    m.setResourceAcl('project', 'shared', { allowedRoles: ['manager'] });
    expect(m.checkPermission('mgr1', 'project.update', { type: 'project', id: 'shared' })).toBe(true);
    expect(m.checkPermission('mgr2', 'project.update', { type: 'project', id: 'shared' })).toBe(true);
  });

  test('(m) revoke is idempotent on missing grant', () => {
    const m = newManager();
    m.assignRole('mgr', 'manager');
    expect(m.revokeProjectAccess('mgr', 'never-granted')).toBe(false);
    expect(m.revokeMachineAccess('mgr', 'never-granted')).toBe(false);
    expect(m.revokeProjectAccess('ghost', 'arps')).toBe(false);
  });
});

describe('(10.1) auth.login JWT payload includes role', () => {
  test('(a) login resolves role via roleResolver', () => {
    const cfg = {
      auth: {
        enabled: true,
        secret: 'testsecret-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        users: {
          alice: { passwordHash: auth.hashPassword('hunter2', 4) },
        },
      },
    };
    const r = auth.login(cfg, { user: 'alice', password: 'hunter2' }, {
      roleResolver: () => 'admin',
    });
    expect(r.ok).toBe(true);
    expect(r.role).toBe('admin');
    const v = auth.verifyToken(r.token, cfg.auth.secret);
    expect(v.valid).toBe(true);
    expect(v.decoded.sub).toBe('alice');
    expect(v.decoded.role).toBe('admin');
  });

  test('(b) login falls back to user.role when resolver returns null', () => {
    const cfg = {
      auth: {
        enabled: true,
        secret: 'testsecret-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        users: {
          bob: { passwordHash: auth.hashPassword('pw', 4), role: 'manager' },
        },
      },
    };
    const r = auth.login(cfg, { user: 'bob', password: 'pw' }, {
      roleResolver: () => null,
    });
    expect(r.ok).toBe(true);
    expect(r.role).toBe('manager');
    const v = auth.verifyToken(r.token, cfg.auth.secret);
    expect(v.decoded.role).toBe('manager');
  });

  test('(c) login defaults to viewer when nothing else resolves', () => {
    const cfg = {
      auth: {
        enabled: true,
        secret: 'testsecret-cccccccccccccccccccccccccccccccccccccccccccccccccccc',
        users: {
          carol: { passwordHash: auth.hashPassword('pw', 4) },
        },
      },
    };
    const r = auth.login(cfg, { user: 'carol', password: 'pw' });
    expect(r.ok).toBe(true);
    expect(r.role).toBe('viewer');
    const v = auth.verifyToken(r.token, cfg.auth.secret);
    expect(v.decoded.role).toBe('viewer');
  });

  test('(d) login still rejects bad credentials', () => {
    const cfg = {
      auth: {
        enabled: true,
        secret: 'testsecret-dddddddddddddddddddddddddddddddddddddddddddddddddddd',
        users: {
          dave: { passwordHash: auth.hashPassword('right', 4) },
        },
      },
    };
    const r = auth.login(cfg, { user: 'dave', password: 'wrong' });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('credentials');
  });
});

describe('(10.1) Shared singleton', () => {
  test('(a) getShared returns the same instance until resetShared', () => {
    resetShared();
    const tmp = mkTmpDir();
    const a = getShared({ storePath: path.join(tmp, 'rbac.json') });
    const b = getShared();
    expect(a).toBe(b);
    resetShared();
    const c = getShared({ storePath: path.join(tmp, 'rbac.json') });
    expect(c).not.toBe(a);
  });

  test('(b) shared instance does not pollute real ~/.c4', () => {
    // Sanity check: every test in this file uses an explicit storePath,
    // so the real default path should not exist as a side effect of the
    // run.
    const tmp = mkTmpDir();
    resetShared();
    const m = getShared({ storePath: path.join(tmp, 'rbac.json') });
    m.assignRole('localuser', 'manager');
    expect(m.storePath).toBe(path.join(tmp, 'rbac.json'));
    expect(fs.existsSync(m.storePath)).toBe(true);
    resetShared();
  });
});
