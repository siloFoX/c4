// Multi-repo workspace mode tests.

'use strict';

const { describe, it, after } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PtyManager = require('../src/pty-manager');

function makeMgr(workspaces) {
  const mgr = Object.create(PtyManager.prototype);
  mgr.config = { workspaces };
  mgr.workers = new Map();
  return mgr;
}

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-ws-'));
const repoA = path.join(tmpRoot, 'repo-a');
const repoB = path.join(tmpRoot, 'repo-b');
const notARepo = path.join(tmpRoot, 'plain-dir');
fs.mkdirSync(repoA, { recursive: true });
fs.mkdirSync(path.join(repoA, '.git'), { recursive: true });
fs.mkdirSync(repoB, { recursive: true });
fs.mkdirSync(path.join(repoB, '.git'), { recursive: true });
fs.mkdirSync(notARepo, { recursive: true });

describe('listWorkspaces', () => {
  it('returns empty list when no workspaces configured', () => {
    const mgr = makeMgr(undefined);
    assert.deepStrictEqual(mgr.listWorkspaces(), { workspaces: [] });
  });

  it('returns workspaces with resolved paths and existence flags', () => {
    const mgr = makeMgr({
      a: repoA,
      b: repoB,
      plain: notARepo,
      gone: path.join(tmpRoot, 'does-not-exist'),
    });
    const { workspaces } = mgr.listWorkspaces();
    assert.strictEqual(workspaces.length, 4);
    const byName = Object.fromEntries(workspaces.map((w) => [w.name, w]));
    assert.strictEqual(byName.a.exists, true);
    assert.strictEqual(byName.a.isGitRepo, true);
    assert.strictEqual(byName.b.isGitRepo, true);
    assert.strictEqual(byName.plain.exists, true);
    assert.strictEqual(byName.plain.isGitRepo, false);
    assert.strictEqual(byName.gone.exists, false);
  });

  it('skips empty / non-string paths', () => {
    const mgr = makeMgr({ a: repoA, junk: '', nope: null });
    const { workspaces } = mgr.listWorkspaces();
    assert.strictEqual(workspaces.length, 1);
    assert.strictEqual(workspaces[0].name, 'a');
  });
});

describe('resolveWorkspace', () => {
  it('returns the resolved path for a known workspace', () => {
    const mgr = makeMgr({ a: repoA });
    const r = mgr.resolveWorkspace('a');
    assert.strictEqual(r.name, 'a');
    assert.strictEqual(r.path, path.resolve(repoA));
    assert.ok(!r.error);
  });

  it('errors helpfully for unknown workspace', () => {
    const mgr = makeMgr({ a: repoA, b: repoB });
    const r = mgr.resolveWorkspace('c');
    assert.match(r.error, /Unknown workspace 'c'/);
    assert.match(r.error, /a, b/);
  });

  it('errors when workspace path does not exist', () => {
    const mgr = makeMgr({ ghost: path.join(tmpRoot, 'missing') });
    const r = mgr.resolveWorkspace('ghost');
    assert.match(r.error, /does not exist/);
  });

  it('reports "(none configured)" when no workspaces', () => {
    const mgr = makeMgr(undefined);
    const r = mgr.resolveWorkspace('any');
    assert.match(r.error, /none configured/);
  });

  after(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));
});
