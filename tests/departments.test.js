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
    assert.match(r.reason, /quota exhausted/);
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
});
