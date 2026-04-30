// 10.3 project aggregation tests.

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

describe('listProjects (10.3)', () => {
  it('groups workers by config.projects[*].root prefix', () => {
    const mgr = makeManager({
      projects: {
        arps: { root: '/home/shinc/arps' },
        c4:   { root: '/home/shinc/c4' },
      },
    }, new Map([
      ['w1', { alive: true, worktree: '/home/shinc/arps/feature' }],
      ['w2', { alive: true, worktree: '/home/shinc/c4/c4-worktree-x' }],
      ['w3', { alive: true, worktree: '/tmp/elsewhere' }],
    ]));
    const r = mgr.listProjects();
    const byName = Object.fromEntries(r.projects.map((p) => [p.name, p]));
    assert.strictEqual(byName.arps.workers.length, 1);
    assert.strictEqual(byName.arps.workers[0].name, 'w1');
    assert.strictEqual(byName.c4.workers.length, 1);
    assert.strictEqual(byName.unassigned.workers.length, 1);
    assert.strictEqual(byName.unassigned.workers[0].name, 'w3');
  });

  it('honors rootMatch regex for nested layouts', () => {
    const mgr = makeManager({
      projects: { ml: { rootMatch: '/research/.*/leak' } },
    }, new Map([
      ['w1', { alive: true, worktree: '/research/proj/leak/x' }],
    ]));
    const r = mgr.listProjects();
    const ml = r.projects.find((p) => p.name === 'ml');
    assert.strictEqual(ml.workers.length, 1);
  });

  it('returns at least the unassigned bucket when no projects configured', () => {
    const mgr = makeManager({}, new Map([
      ['w1', { alive: true }],
    ]));
    const r = mgr.listProjects();
    assert.ok(r.projects.find((p) => p.name === 'unassigned'));
  });

  it('worker._project explicit override wins over root inference', () => {
    const mgr = makeManager({
      projects: { ml: { root: '/research/x' }, side: {} },
    }, new Map([
      ['w1', { alive: true, worktree: '/research/x/leak', _project: 'side' }],
    ]));
    const r = mgr.listProjects();
    assert.strictEqual(r.projects.find((p) => p.name === 'ml').workers.length, 0);
    assert.strictEqual(r.projects.find((p) => p.name === 'side').workers.length, 1);
  });
});
