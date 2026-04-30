// 10.6 department tests.

'use strict';

const { describe, it } = require('node:test');
const assert = require('assert');

const PtyManager = require('../src/pty-manager');

function makeManager(config, workers = new Map()) {
  const mgr = Object.create(PtyManager.prototype);
  mgr.config = config;
  mgr.workers = workers;
  mgr._taskQueue = [];
  mgr.getHistory = () => ({ records: [] });
  return mgr;
}

describe('listDepartments (10.6)', () => {
  it('rolls up workers per project per department', () => {
    const mgr = makeManager(
      {
        projects: { arps: { root: '/home/shinc/arps' } },
        departments: {
          eng: { members: ['alice', 'bob'], projects: ['arps'], workerQuota: 3 },
        },
      },
      new Map([
        ['w1', { alive: true, worktree: '/home/shinc/arps/x' }],
        ['w2', { alive: true, worktree: '/home/shinc/arps/y' }],
      ]),
    );
    const r = mgr.listDepartments();
    assert.strictEqual(r.departments.length, 1);
    assert.strictEqual(r.departments[0].name, 'eng');
    assert.strictEqual(r.departments[0].activeWorkers, 2);
    assert.strictEqual(r.departments[0].quotaRemaining, 1);
    assert.strictEqual(r.departments[0].overQuota, false);
  });

  it('flags overQuota when active >= quota', () => {
    const mgr = makeManager(
      {
        projects: { p: { root: '/p' } },
        departments: { team: { projects: ['p'], workerQuota: 1 } },
      },
      new Map([
        ['w1', { alive: true, worktree: '/p/a' }],
        ['w2', { alive: true, worktree: '/p/b' }],
      ]),
    );
    const r = mgr.listDepartments();
    assert.strictEqual(r.departments[0].overQuota, true);
    assert.strictEqual(r.departments[0].quotaRemaining, 0);
  });

  it('resolveUserDepartment returns first matching department', () => {
    const mgr = makeManager({
      departments: {
        eng: { members: ['alice'] },
        ops: { members: ['bob'] },
      },
    });
    assert.strictEqual(mgr.resolveUserDepartment('alice'), 'eng');
    assert.strictEqual(mgr.resolveUserDepartment('bob'), 'ops');
    assert.strictEqual(mgr.resolveUserDepartment('eve'), null);
  });

  it('quotaCheck returns allowed=false when over quota', () => {
    const mgr = makeManager(
      {
        projects: { p: { root: '/p' } },
        departments: { team: { projects: ['p'], workerQuota: 1 } },
      },
      new Map([['w1', { alive: true, worktree: '/p/a' }]]),
    );
    const r = mgr.quotaCheck('team');
    assert.strictEqual(r.allowed, false);
    assert.match(r.reason, /worker quota exhausted/);
  });

  it('quotaCheck allows when no quota set', () => {
    const mgr = makeManager({
      departments: { team: { members: ['x'] } },
    });
    assert.strictEqual(mgr.quotaCheck('team').allowed, true);
  });

  it('quotaCheck rejects unknown department', () => {
    const mgr = makeManager({});
    const r = mgr.quotaCheck('nope');
    assert.strictEqual(r.allowed, false);
  });

  // (TODO 8.3 / #100) Monthly $ budget enforcement.
  it('attributes monthly cost proportional to active worker share', () => {
    // Disjoint projects per dept — eng owns 3 of 4 active workers, ops owns 1.
    const mgr = makeManager(
      {
        projects: { p: { root: '/p' }, q: { root: '/q' } },
        departments: {
          eng: { projects: ['p'], monthlyBudgetUSD: 100 },
          ops: { projects: ['q'] },
        },
      },
      new Map([
        ['w1', { alive: true, worktree: '/p/a' }],
        ['w2', { alive: true, worktree: '/p/b' }],
        ['w3', { alive: true, worktree: '/p/c' }],
        ['w4', { alive: true, worktree: '/q/d' }],
      ]),
    );
    // Pin a deterministic monthly cost so attribution math is testable.
    mgr.getCostReport = () => ({ monthly: { costUSD: 80 }, daily: [], totals: {} });
    const r = mgr.listDepartments();
    const eng = r.departments.find((d) => d.name === 'eng');
    const ops = r.departments.find((d) => d.name === 'ops');
    // eng has 3 of 4 active workers → 3/4 * $80 = $60.
    assert.strictEqual(eng.attributedCostUSD, 60);
    assert.strictEqual(eng.budgetRemainingUSD, 40);
    assert.strictEqual(eng.overBudget, false);
    assert.strictEqual(ops.attributedCostUSD, 20);
    // ops has no monthlyBudgetUSD set → null remaining + not overBudget.
    assert.strictEqual(ops.budgetRemainingUSD, null);
    assert.strictEqual(ops.overBudget, false);
  });

  it('flags overBudget when attributed cost meets monthlyBudgetUSD', () => {
    const mgr = makeManager(
      {
        projects: { p: { root: '/p' } },
        departments: {
          eng: { projects: ['p'], monthlyBudgetUSD: 50 },
        },
      },
      new Map([['w1', { alive: true, worktree: '/p/a' }]]),
    );
    mgr.getCostReport = () => ({ monthly: { costUSD: 50 }, daily: [], totals: {} });
    const eng = mgr.listDepartments().departments.find((d) => d.name === 'eng');
    assert.strictEqual(eng.attributedCostUSD, 50);
    assert.strictEqual(eng.overBudget, true);
    const r = mgr.quotaCheck('eng');
    assert.strictEqual(r.allowed, false);
    assert.match(r.reason, /monthly budget exhausted/);
    assert.match(r.reason, /\$50\.00/);
  });

  it('exposes tier label when configured', () => {
    const mgr = makeManager({
      departments: {
        eng: { projects: [], tier: 'tier-a' },
      },
    });
    const r = mgr.listDepartments();
    assert.strictEqual(r.departments[0].tier, 'tier-a');
  });

  it('budget check survives missing cost report (no crash)', () => {
    const mgr = makeManager(
      {
        projects: { p: { root: '/p' } },
        departments: { eng: { projects: ['p'], monthlyBudgetUSD: 10 } },
      },
      new Map([['w1', { alive: true, worktree: '/p/a' }]]),
    );
    mgr.getCostReport = () => { throw new Error('boom'); };
    const r = mgr.listDepartments();
    assert.strictEqual(r.departments[0].attributedCostUSD, 0);
    assert.strictEqual(r.departments[0].overBudget, false);
  });
});
