// (10.6) Department / team management tests.
//
// Exercises src/org-mgmt.js against an isolated tmpdir so the suite
// never writes to the operator's real ~/.c4/org.json.
//
// Coverage targets (30+ assertions):
//  - createDepartment: id validation, duplicate rejection, parent check
//  - addMember: manager vs member role, idempotent adds
//  - createTeam / assignMember: dept existence check, dept membership sync
//  - setQuota: overwrite one field, preserve others
//  - treeView: root discovery, depth, team + member roll-up
//  - resolveUserDept: walks parent chain, prefers deepest match
//  - getQuotaUsage: aggregates injected cost report + active workers,
//                   percent + exceeded flags
//  - storage roundtrip: fresh OrgManager sees state written by the first
//  - ensureShape normalises partial / malformed input

'use strict';
require('./jest-shim');

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  OrgManager,
  defaultOrgPath,
  normalizeQuotas,
  normalizeDept,
  normalizeTeam,
  ensureShape,
  isId,
  isUsername,
  ID_PATTERN,
  MEMBER_ROLES,
} = require('../src/org-mgmt');

function mkTmpStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-orgmgmt-test-'));
  return path.join(dir, 'org.json');
}

function newOrg() {
  return new OrgManager({ storePath: mkTmpStore() });
}

describe('(10.6) org helpers', () => {
  test('(a) defaultOrgPath points at home/.c4/org.json', () => {
    const p = defaultOrgPath();
    expect(p.endsWith(path.join('.c4', 'org.json'))).toBe(true);
    expect(p.startsWith(os.homedir())).toBe(true);
  });

  test('(b) MEMBER_ROLES covers manager and member', () => {
    expect(MEMBER_ROLES).toContain('manager');
    expect(MEMBER_ROLES).toContain('member');
    expect(MEMBER_ROLES).toHaveLength(2);
  });

  test('(c) isId rejects empty / bad chars', () => {
    expect(isId('dept-a')).toBe(true);
    expect(isId('a_b.1')).toBe(true);
    expect(isId('')).toBe(false);
    expect(isId('bad id')).toBe(false);
    expect(isId('bad!id')).toBe(false);
    expect(ID_PATTERN.test('ok')).toBe(true);
  });

  test('(d) isUsername mirrors rbac username rules', () => {
    expect(isUsername('alice')).toBe(true);
    expect(isUsername('al.ice_1')).toBe(true);
    expect(isUsername('')).toBe(false);
    expect(isUsername('bad name')).toBe(false);
  });

  test('(e) normalizeQuotas coerces numeric fields to numbers', () => {
    const q = normalizeQuotas({ maxWorkers: '5', monthlyBudgetUSD: 100, tokenLimit: 'oops' });
    expect(q.maxWorkers).toBe(5);
    expect(q.monthlyBudgetUSD).toBe(100);
    expect(q.tokenLimit).toBe(0);
  });

  test('(f) normalizeDept fills missing arrays and defaults name to id', () => {
    const d = normalizeDept({ id: 'eng' });
    expect(d.name).toBe('eng');
    expect(d.managerUserIds).toEqual([]);
    expect(d.memberUserIds).toEqual([]);
    expect(d.projectIds).toEqual([]);
    expect(d.machineAliases).toEqual([]);
    expect(d.quotas.maxWorkers).toBe(0);
    expect(d.parentId).toBe(null);
  });

  test('(g) normalizeTeam fills memberUserIds and defaults name to id', () => {
    const t = normalizeTeam({ id: 'sre', deptId: 'eng' });
    expect(t.name).toBe('sre');
    expect(t.memberUserIds).toEqual([]);
  });

  test('(h) ensureShape drops departments with invalid ids and teams with no deptId', () => {
    const shaped = ensureShape({
      departments: {
        'good': { id: 'good', name: 'Good' },
        'bad id!': { id: 'bad id!', name: 'x' },
      },
      teams: {
        't1': { id: 't1', deptId: 'good' },
        't2': { id: 't2' },
      },
    });
    expect(shaped.departments.good).toBeDefined();
    expect(shaped.departments['bad id!']).toBeUndefined();
    expect(shaped.teams.t1).toBeDefined();
    expect(shaped.teams.t2).toBeUndefined();
  });
});

describe('(10.6) createDepartment', () => {
  test('(a) creates a root department with defaults', () => {
    const org = newOrg();
    const d = org.createDepartment({ id: 'eng', name: 'Engineering' });
    expect(d.id).toBe('eng');
    expect(d.name).toBe('Engineering');
    expect(d.parentId).toBe(null);
    expect(d.memberUserIds).toEqual([]);
    expect(d.managerUserIds).toEqual([]);
    expect(d.projectIds).toEqual([]);
    expect(d.quotas.maxWorkers).toBe(0);
  });

  test('(b) rejects duplicate id', () => {
    const org = newOrg();
    org.createDepartment({ id: 'eng' });
    expect(() => org.createDepartment({ id: 'eng' })).toThrow('already exists');
  });

  test('(c) rejects invalid id', () => {
    const org = newOrg();
    expect(() => org.createDepartment({ id: 'bad id!' })).toThrow();
  });

  test('(d) rejects unknown parent', () => {
    const org = newOrg();
    expect(() => org.createDepartment({ id: 'sub', parentId: 'missing' })).toThrow('Parent department not found');
  });

  test('(e) sub-department records parentId', () => {
    const org = newOrg();
    org.createDepartment({ id: 'eng' });
    const sub = org.createDepartment({ id: 'platform', name: 'Platform', parentId: 'eng' });
    expect(sub.parentId).toBe('eng');
  });

  test('(f) listDepartments returns all in id order', () => {
    const org = newOrg();
    org.createDepartment({ id: 'eng' });
    org.createDepartment({ id: 'bio' });
    const ls = org.listDepartments();
    expect(ls).toHaveLength(2);
    expect(ls[0].id).toBe('bio');
    expect(ls[1].id).toBe('eng');
  });

  test('(g) getDepartment roundtrips', () => {
    const org = newOrg();
    org.createDepartment({ id: 'eng', name: 'E' });
    const got = org.getDepartment('eng');
    expect(got.id).toBe('eng');
    expect(got.name).toBe('E');
  });
});

describe('(10.6) addMember', () => {
  test('(a) attaches a member; duplicate adds are idempotent', () => {
    const org = newOrg();
    org.createDepartment({ id: 'eng' });
    org.addMember('eng', 'alice');
    org.addMember('eng', 'alice');
    const d = org.getDepartment('eng');
    expect(d.memberUserIds).toEqual(['alice']);
  });

  test('(b) role=manager also records on memberUserIds', () => {
    const org = newOrg();
    org.createDepartment({ id: 'eng' });
    org.addMember('eng', 'bob', 'manager');
    const d = org.getDepartment('eng');
    expect(d.managerUserIds).toContain('bob');
    expect(d.memberUserIds).toContain('bob');
  });

  test('(c) rejects invalid userId', () => {
    const org = newOrg();
    org.createDepartment({ id: 'eng' });
    expect(() => org.addMember('eng', 'bad user!')).toThrow('Invalid userId');
  });

  test('(d) rejects unknown department', () => {
    const org = newOrg();
    expect(() => org.addMember('missing', 'alice')).toThrow('not found');
  });

  test('(e) removeMember strips both lists', () => {
    const org = newOrg();
    org.createDepartment({ id: 'eng' });
    org.addMember('eng', 'bob', 'manager');
    org.removeMember('eng', 'bob');
    const d = org.getDepartment('eng');
    expect(d.managerUserIds).not.toContain('bob');
    expect(d.memberUserIds).not.toContain('bob');
  });
});

describe('(10.6) createTeam / assignMember', () => {
  test('(a) rejects team for unknown department', () => {
    const org = newOrg();
    expect(() => org.createTeam({ id: 'sre', deptId: 'missing', name: 'SRE' })).toThrow('Department not found');
  });

  test('(b) createTeam under dept; listTeams filters by deptId', () => {
    const org = newOrg();
    org.createDepartment({ id: 'eng' });
    org.createDepartment({ id: 'bio' });
    org.createTeam({ id: 'sre', deptId: 'eng', name: 'SRE' });
    org.createTeam({ id: 'wet-lab', deptId: 'bio', name: 'Wet' });
    expect(org.listTeams('eng')).toHaveLength(1);
    expect(org.listTeams('bio')).toHaveLength(1);
    expect(org.listTeams()).toHaveLength(2);
  });

  test('(c) assignMember writes to team and parent dept', () => {
    const org = newOrg();
    org.createDepartment({ id: 'eng' });
    org.createTeam({ id: 'sre', deptId: 'eng', name: 'SRE' });
    org.assignMember('sre', 'carol');
    const team = org.getTeam('sre');
    const dept = org.getDepartment('eng');
    expect(team.memberUserIds).toContain('carol');
    expect(dept.memberUserIds).toContain('carol');
  });

  test('(d) duplicate createTeam id is rejected', () => {
    const org = newOrg();
    org.createDepartment({ id: 'eng' });
    org.createTeam({ id: 'sre', deptId: 'eng' });
    expect(() => org.createTeam({ id: 'sre', deptId: 'eng' })).toThrow('already exists');
  });

  test('(e) removeFromTeam strips the team list but keeps dept record', () => {
    const org = newOrg();
    org.createDepartment({ id: 'eng' });
    org.createTeam({ id: 'sre', deptId: 'eng' });
    org.assignMember('sre', 'dave');
    org.removeFromTeam('sre', 'dave');
    const team = org.getTeam('sre');
    const dept = org.getDepartment('eng');
    expect(team.memberUserIds).not.toContain('dave');
    expect(dept.memberUserIds).toContain('dave');
  });
});

describe('(10.6) setQuota', () => {
  test('(a) overwrite one field, keep others', () => {
    const org = newOrg();
    org.createDepartment({ id: 'eng' });
    org.setQuota('eng', { maxWorkers: 10, monthlyBudgetUSD: 500, tokenLimit: 1000000 });
    org.setQuota('eng', { maxWorkers: 20 });
    const d = org.getDepartment('eng');
    expect(d.quotas.maxWorkers).toBe(20);
    expect(d.quotas.monthlyBudgetUSD).toBe(500);
    expect(d.quotas.tokenLimit).toBe(1000000);
  });

  test('(b) unknown dept throws', () => {
    const org = newOrg();
    expect(() => org.setQuota('missing', { maxWorkers: 1 })).toThrow('not found');
  });
});

describe('(10.6) treeView', () => {
  test('(a) builds a two-level tree with team + member roll-up', () => {
    const org = newOrg();
    org.createDepartment({ id: 'root', name: 'Root' });
    org.createDepartment({ id: 'eng', parentId: 'root' });
    org.createDepartment({ id: 'bio', parentId: 'root' });
    org.createTeam({ id: 'sre', deptId: 'eng' });
    org.assignMember('sre', 'alice');
    org.addMember('eng', 'bob', 'manager');
    const tree = org.treeView();
    expect(tree).toHaveLength(1);
    expect(tree[0].dept.id).toBe('root');
    expect(tree[0].subdepts).toHaveLength(2);
    const engNode = tree[0].subdepts.find((n) => n.dept.id === 'eng');
    expect(engNode.teams).toHaveLength(1);
    expect(engNode.teams[0].id).toBe('sre');
    expect(engNode.members).toContain('alice');
    expect(engNode.members).toContain('bob');
  });

  test('(b) multiple roots are returned in id order', () => {
    const org = newOrg();
    org.createDepartment({ id: 'zeta' });
    org.createDepartment({ id: 'alpha' });
    const tree = org.treeView();
    expect(tree).toHaveLength(2);
    expect(tree[0].dept.id).toBe('alpha');
    expect(tree[1].dept.id).toBe('zeta');
  });

  test('(c) parentChain walks from root to leaf', () => {
    const org = newOrg();
    org.createDepartment({ id: 'root' });
    org.createDepartment({ id: 'mid', parentId: 'root' });
    org.createDepartment({ id: 'leaf', parentId: 'mid' });
    expect(org.parentChain('leaf')).toEqual(['root', 'mid', 'leaf']);
    expect(org.parentChain('mid')).toEqual(['root', 'mid']);
    expect(org.parentChain('missing')).toEqual([]);
  });
});

describe('(10.6) resolveUserDept', () => {
  test('(a) returns null for unknown user', () => {
    const org = newOrg();
    expect(org.resolveUserDept('ghost')).toBe(null);
  });

  test('(b) team membership resolves to the team department', () => {
    const org = newOrg();
    org.createDepartment({ id: 'eng' });
    org.createTeam({ id: 'sre', deptId: 'eng' });
    org.assignMember('sre', 'alice');
    const d = org.resolveUserDept('alice');
    expect(d.id).toBe('eng');
  });

  test('(c) walks parent chain and picks the deepest hit', () => {
    const org = newOrg();
    org.createDepartment({ id: 'root' });
    org.createDepartment({ id: 'eng', parentId: 'root' });
    org.createDepartment({ id: 'platform', parentId: 'eng' });
    // Add the same user at two depths; the deeper one should win.
    org.addMember('root', 'bob');
    org.addMember('platform', 'bob');
    const d = org.resolveUserDept('bob');
    expect(d.id).toBe('platform');
  });

  test('(d) direct department membership resolves when no teams exist', () => {
    const org = newOrg();
    org.createDepartment({ id: 'ops' });
    org.addMember('ops', 'eve');
    expect(org.resolveUserDept('eve').id).toBe('ops');
  });
});

describe('(10.6) getQuotaUsage', () => {
  function stubCostReporter(byUser) {
    // Pretend the CostReporter was asked for a monthly report grouped
    // by user and returned this byGroup slice. This mirrors the shape
    // the real reporter produces (src/cost-report.js).
    return {
      monthlyReport() {
        return {
          total: {},
          byGroup: Object.entries(byUser).map(([name, g]) => ({
            name,
            tokens: g.tokens || 0,
            costUSD: g.costUSD || 0,
            records: 1,
          })),
          groupBy: 'user',
          period: {},
        };
      },
    };
  }

  test('(a) sums cost across dept members, skipping outsiders', () => {
    const org = newOrg();
    org.createDepartment({ id: 'eng', quotas: {} });
    org.addMember('eng', 'alice');
    org.addMember('eng', 'bob');
    const rep = stubCostReporter({
      alice: { tokens: 1000, costUSD: 5 },
      bob: { tokens: 500, costUSD: 2 },
      carol: { tokens: 200, costUSD: 1 },
    });
    org.setQuota('eng', { maxWorkers: 10, monthlyBudgetUSD: 100, tokenLimit: 5000 });
    const u = org.getQuotaUsage('eng', { costReporter: rep, workers: [] });
    expect(u.usage.costUSD).toBe(7);
    expect(u.usage.tokens).toBe(1500);
    expect(u.percent.costUSD).toBe(0.07);
    expect(u.exceeded.costUSD).toBe(false);
  });

  test('(b) counts active workers by user / project / machine', () => {
    const org = newOrg();
    org.createDepartment({ id: 'eng' });
    org.addMember('eng', 'alice');
    org.assignProject('eng', 'proj-a');
    org.assignMachine('eng', 'dgx');
    org.setQuota('eng', { maxWorkers: 2 });
    const workers = [
      { user: 'alice', project: 'other', machine: 'other', status: 'running' },
      { user: 'outsider', project: 'proj-a', machine: 'other', status: 'running' },
      { user: 'outsider', project: 'other', machine: 'dgx', status: 'running' },
      { user: 'alice', project: 'other', machine: 'other', status: 'closed' },
    ];
    const u = org.getQuotaUsage('eng', { workers });
    expect(u.usage.workers).toBe(3);
    expect(u.exceeded.workers).toBe(true);
  });

  test('(c) exceeded flag flips when usage crosses the limit', () => {
    const org = newOrg();
    org.createDepartment({ id: 'eng' });
    org.addMember('eng', 'alice');
    org.setQuota('eng', { monthlyBudgetUSD: 10, tokenLimit: 100 });
    const rep = stubCostReporter({ alice: { tokens: 1000, costUSD: 50 } });
    const u = org.getQuotaUsage('eng', { costReporter: rep, workers: [] });
    expect(u.exceeded.costUSD).toBe(true);
    expect(u.exceeded.tokens).toBe(true);
  });

  test('(d) zero limits report percent=0 and exceeded=false', () => {
    const org = newOrg();
    org.createDepartment({ id: 'eng' });
    const u = org.getQuotaUsage('eng', { workers: [] });
    expect(u.percent.costUSD).toBe(0);
    expect(u.percent.workers).toBe(0);
    expect(u.exceeded.costUSD).toBe(false);
    expect(u.exceeded.workers).toBe(false);
  });

  test('(e) unknown dept throws', () => {
    const org = newOrg();
    expect(() => org.getQuotaUsage('missing', {})).toThrow('not found');
  });
});

describe('(10.6) storage roundtrip', () => {
  test('(a) a fresh OrgManager on the same file sees every write', () => {
    const storePath = mkTmpStore();
    const a = new OrgManager({ storePath });
    a.createDepartment({ id: 'eng', name: 'E' });
    a.createTeam({ id: 'sre', deptId: 'eng', name: 'SRE' });
    a.assignMember('sre', 'alice');
    a.setQuota('eng', { maxWorkers: 3, monthlyBudgetUSD: 50, tokenLimit: 2000 });

    const b = new OrgManager({ storePath });
    const dept = b.getDepartment('eng');
    const team = b.getTeam('sre');
    expect(dept.name).toBe('E');
    expect(dept.quotas.maxWorkers).toBe(3);
    expect(dept.quotas.monthlyBudgetUSD).toBe(50);
    expect(team.memberUserIds).toContain('alice');
    expect(dept.memberUserIds).toContain('alice');
  });

  test('(b) reload() re-reads after external edit', () => {
    const storePath = mkTmpStore();
    const a = new OrgManager({ storePath });
    a.createDepartment({ id: 'eng' });
    // Simulate an external edit: append a team directly to disk.
    const raw = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    raw.teams['sre'] = { id: 'sre', deptId: 'eng', name: 'SRE', memberUserIds: ['x'] };
    fs.writeFileSync(storePath, JSON.stringify(raw, null, 2));
    a.reload();
    expect(a.getTeam('sre').memberUserIds).toContain('x');
  });

  test('(c) missing file is treated as fresh state, no crash', () => {
    const storePath = mkTmpStore();
    // Remove the file so _load hits the not-exist branch.
    try { fs.unlinkSync(storePath); } catch {}
    const a = new OrgManager({ storePath });
    expect(a.listDepartments()).toEqual([]);
  });

  test('(d) malformed JSON falls back to fresh state (never throws)', () => {
    const storePath = mkTmpStore();
    fs.writeFileSync(storePath, '{ this is not json');
    const a = new OrgManager({ storePath });
    expect(a.listDepartments()).toEqual([]);
    a.createDepartment({ id: 'eng' });
    expect(a.getDepartment('eng')).toBeDefined();
  });
});
