'use strict';

// (8.5) Daemon API tests for POST /key and POST /merge plus the shared
// merge-core module. The tests spin up a minimal in-process HTTP server
// that wires the same pieces daemon.js wires (rbac.RoleManager, merge-core,
// a stub PtyManager that records sent keys) so the assertions exercise the
// real endpoint logic end-to-end through node's http client. Spawning the
// full daemon.js would leave state.json in the repo root and require port
// management, which the CI run can't tolerate when many tests run back to
// back - a tmpdir-scoped handler gives the same guarantees with none of
// that baggage.

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { describe, it, before, after } = require('node:test');

const mergeCore = require('../src/merge-core');
const rbac = require('../src/rbac');

function mkTmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function git(cwd, argv) {
  return execSync('git ' + argv, { cwd, encoding: 'utf8', stdio: 'pipe' });
}

function gitInit(dir) {
  git(dir, 'init -q -b main');
  git(dir, 'config user.email "test@example.com"');
  git(dir, 'config user.name "tester"');
  git(dir, 'config commit.gpgsign false');
}

// Build a temp git repo with a main commit and a feature branch that has
// the files the pre-merge checks expect (TODO.md, CHANGELOG.md).
function makeRepoWithBranch(branchName, opts) {
  const opt = opts || {};
  const repoRoot = mkTmpDir('c4-merge-core-');
  gitInit(repoRoot);
  fs.writeFileSync(path.join(repoRoot, 'README.md'), '# test repo\n');
  git(repoRoot, 'add README.md');
  git(repoRoot, 'commit -q -m "initial"');
  if (opt.noBranch) return { repoRoot };
  git(repoRoot, 'checkout -q -b ' + branchName);
  if (opt.withTodo !== false) {
    fs.writeFileSync(path.join(repoRoot, 'TODO.md'), '# TODO\n- item\n');
    git(repoRoot, 'add TODO.md');
  }
  if (opt.withChangelog !== false) {
    fs.writeFileSync(path.join(repoRoot, 'CHANGELOG.md'), '# CHANGELOG\n- change\n');
    git(repoRoot, 'add CHANGELOG.md');
  }
  if (opt.extraFile) {
    fs.writeFileSync(path.join(repoRoot, opt.extraFile), 'extra\n');
    git(repoRoot, 'add ' + opt.extraFile);
  }
  // Ensure the commit has at least one change so the test doesn't fail on
  // an empty-commit error when withTodo+withChangelog are both false.
  if (opt.withTodo === false && opt.withChangelog === false && !opt.extraFile) {
    fs.writeFileSync(path.join(repoRoot, 'CONTRIB.md'), '# contrib\n');
    git(repoRoot, 'add CONTRIB.md');
  }
  git(repoRoot, 'commit -q -m "feature: add docs"');
  git(repoRoot, 'checkout -q main');
  return { repoRoot };
}

// Minimal in-process server that replicates daemon.js's /key and /merge
// handler logic (after the 8.5 refactor). The server is intentionally
// tiny - it only speaks these two endpoints plus a stub /register-worker
// so tests can seed manager.workers. Keeping the handler body in the
// test file is a deliberate trade: spawning the full daemon would require
// a real config.json + state.json + HOME override, which complicates CI.
// The merge-core and rbac modules are the ones we actually want to
// exercise, and they are the real production modules here.
const KEY_ALLOWLIST = Object.freeze([
  'Enter', 'Escape', 'Tab', 'Backspace',
  'Up', 'Down', 'Left', 'Right',
  'C-a', 'C-b', 'C-c', 'C-d', 'C-e',
  'C-l', 'C-n', 'C-p', 'C-r', 'C-z',
]);

function buildTestServer({ repoRoot, rbacManager, authCheck }) {
  const sentKeys = [];
  const workers = new Map();
  const failFlags = { performMerge: false };

  function ok(res, body) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  }
  function writeErr(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  }

  function requireRole(action) {
    if (!authCheck) return { allow: true };
    const username = authCheck.username;
    if (!username) return { allow: false, status: 401, body: { error: 'Authentication required' } };
    const okRbac = rbacManager.checkPermission(username, action);
    if (!okRbac) return { allow: false, status: 403, body: { error: 'Forbidden', action, user: username } };
    return { allow: true };
  }

  const stubManager = {
    workers,
    send(name, key, isKey) {
      const w = workers.get(name);
      if (!w) return { error: "Worker '" + name + "' not found" };
      sentKeys.push({ name, key, isKey: Boolean(isKey) });
      return { success: true };
    },
  };

  async function parseBody(req) {
    return new Promise((resolve) => {
      let buf = '';
      req.on('data', (c) => { buf += c.toString('utf8'); });
      req.on('end', () => {
        if (!buf) return resolve({});
        try { resolve(JSON.parse(buf)); } catch { resolve({}); }
      });
    });
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const route = url.pathname;
    try {
      if (req.method === 'POST' && route === '/register-worker') {
        const body = await parseBody(req);
        workers.set(body.name, { name: body.name, branch: body.branch || null, alive: true });
        return ok(res, { registered: body.name });
      }

      if (req.method === 'POST' && route === '/key') {
        const body = await parseBody(req);
        const gate = requireRole(rbac.ACTIONS.KEY_WRITE);
        if (!gate.allow) return writeErr(res, gate.status, gate.body);
        if (!body.name || !body.key) return writeErr(res, 400, { error: 'Missing name or key' });
        if (!KEY_ALLOWLIST.includes(body.key)) {
          return writeErr(res, 400, { error: 'Unknown key: ' + body.key, allowed: KEY_ALLOWLIST.slice() });
        }
        const send = stubManager.send(body.name, body.key, true);
        if (send && send.error) return ok(res, { error: send.error });
        return ok(res, { success: true, key: body.key });
      }

      if (req.method === 'POST' && route === '/merge') {
        const body = await parseBody(req);
        const gate = requireRole(rbac.ACTIONS.MERGE_WRITE);
        if (!gate.allow) return writeErr(res, gate.status, gate.body);
        const branchInput = typeof body.branch === 'string' ? body.branch : '';
        const nameInput = typeof body.name === 'string' ? body.name : '';
        const skipChecks = Boolean(body.skipChecks);
        if (!branchInput && !nameInput) return writeErr(res, 400, { error: 'Missing branch' });
        let branch = branchInput;
        let resolvedFrom = 'branch';
        if (!branch && nameInput) {
          const w = workers.get(nameInput);
          if (w && w.branch) { branch = w.branch; resolvedFrom = 'worker'; }
          else { branch = mergeCore.resolveBranchForWorker(nameInput, repoRoot); resolvedFrom = 'worktree'; }
        }
        const pre = mergeCore.runPreMergeChecks(branch, { skipChecks, repoRoot });
        if (!pre.passed) {
          const branchMissing = pre.reasons.some((r) => r.check === 'branch-exists' && r.status === 'FAIL');
          return writeErr(res, branchMissing ? 404 : 409, {
            error: 'Pre-merge checks failed', branch, reasons: pre.reasons, resolvedFrom,
          });
        }
        if (failFlags.performMerge) {
          return writeErr(res, 500, { error: 'git merge failed (test)', branch, reasons: pre.reasons });
        }
        const out = mergeCore.performMerge(branch, { repoRoot });
        if (!out.success) return writeErr(res, 500, { error: out.error, branch, reasons: pre.reasons });
        return ok(res, { success: true, branch, sha: out.sha, summary: out.summary, reasons: pre.reasons, resolvedFrom });
      }

      writeErr(res, 404, { error: 'Not found: ' + route });
    } catch (e) {
      writeErr(res, 500, { error: e.message });
    }
  });

  return { server, sentKeys, workers, failFlags };
}

function httpRequest(port, method, route, body, headers) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const req = http.request({
      method,
      host: '127.0.0.1',
      port,
      path: route,
      headers: Object.assign({
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      }, headers || {}),
    }, (res) => {
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        let parsed = null;
        try { parsed = buf ? JSON.parse(buf) : null; } catch { parsed = buf; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

describe('(8.5) merge-core.runPreMergeChecks', () => {
  let repoRoot;
  before(() => {
    const r = makeRepoWithBranch('c4/feature-alpha');
    repoRoot = r.repoRoot;
  });

  it('returns FAIL when branch arg missing', () => {
    const res = mergeCore.runPreMergeChecks('', { repoRoot });
    assert.strictEqual(res.passed, false);
    assert.strictEqual(res.reasons[0].check, 'input');
    assert.strictEqual(res.reasons[0].status, 'FAIL');
  });

  it('returns FAIL when repoRoot arg missing', () => {
    const res = mergeCore.runPreMergeChecks('c4/feature-alpha', {});
    assert.strictEqual(res.passed, false);
    assert.ok(res.reasons[0].detail.includes('repoRoot'));
  });

  it('FAILs with branch-exists when branch does not exist', () => {
    const res = mergeCore.runPreMergeChecks('does-not-exist', { repoRoot });
    assert.strictEqual(res.passed, false);
    assert.ok(res.reasons.some((r) => r.check === 'branch-exists' && r.status === 'FAIL'));
  });

  it('FAILs with not-main when asked to merge main', () => {
    const res = mergeCore.runPreMergeChecks('main', { repoRoot });
    assert.strictEqual(res.passed, false);
    assert.ok(res.reasons.some((r) => r.check === 'not-main' && r.status === 'FAIL'));
  });

  it('PASSes when branch is valid and on main with TODO+CHANGELOG', () => {
    const res = mergeCore.runPreMergeChecks('c4/feature-alpha', { repoRoot });
    assert.strictEqual(res.passed, true);
    assert.ok(res.reasons.some((r) => r.check === 'TODO.md' && r.status === 'PASS'));
    assert.ok(res.reasons.some((r) => r.check === 'CHANGELOG.md' && r.status === 'PASS'));
    assert.ok(res.reasons.some((r) => r.check === 'on-main' && r.status === 'PASS'));
  });

  it('FAILs TODO.md check when branch did not touch TODO.md', () => {
    const { repoRoot: rr } = makeRepoWithBranch('c4/feature-notodo', { withTodo: false });
    const res = mergeCore.runPreMergeChecks('c4/feature-notodo', { repoRoot: rr });
    assert.strictEqual(res.passed, false);
    assert.ok(res.reasons.some((r) => r.check === 'TODO.md' && r.status === 'FAIL'));
  });

  it('FAILs CHANGELOG.md check when branch did not touch CHANGELOG.md', () => {
    const { repoRoot: rr } = makeRepoWithBranch('c4/feature-nolog', { withChangelog: false });
    const res = mergeCore.runPreMergeChecks('c4/feature-nolog', { repoRoot: rr });
    assert.strictEqual(res.passed, false);
    assert.ok(res.reasons.some((r) => r.check === 'CHANGELOG.md' && r.status === 'FAIL'));
  });

  it('skipChecks short-circuits the doc checks but still enforces on-main/branch-exists', () => {
    const { repoRoot: rr } = makeRepoWithBranch('c4/feature-skip', { withTodo: false, withChangelog: false });
    const res = mergeCore.runPreMergeChecks('c4/feature-skip', { repoRoot: rr, skipChecks: true });
    assert.strictEqual(res.passed, true);
    assert.ok(res.reasons.some((r) => r.check === 'pre-merge' && r.status === 'SKIP'));
  });

  it('FAILs on-main when current branch is not main', () => {
    const { repoRoot: rr } = makeRepoWithBranch('c4/feature-offmain');
    git(rr, 'checkout -q c4/feature-offmain');
    const res = mergeCore.runPreMergeChecks('c4/feature-offmain', { repoRoot: rr });
    assert.strictEqual(res.passed, false);
    assert.ok(res.reasons.some((r) => r.check === 'on-main' && r.status === 'FAIL'));
  });
});

describe('(8.5) merge-core.performMerge', () => {
  it('returns success with a SHA and summary for a valid merge', () => {
    const { repoRoot } = makeRepoWithBranch('c4/feature-merge');
    const out = mergeCore.performMerge('c4/feature-merge', { repoRoot });
    assert.strictEqual(out.success, true);
    assert.match(out.sha, /^[a-f0-9]{40}$/);
    // Verify the merge commit landed on main.
    const head = git(repoRoot, 'log --oneline -1').trim();
    assert.ok(head.includes("Merge branch 'c4/feature-merge'"));
  });

  it('surfaces an error when branch does not exist', () => {
    const { repoRoot } = makeRepoWithBranch('c4/feature-nope');
    const out = mergeCore.performMerge('does-not-exist', { repoRoot });
    assert.strictEqual(out.success, false);
    assert.ok(out.error.includes('git merge failed'));
  });

  it('returns error when branch arg missing', () => {
    const out = mergeCore.performMerge('', { repoRoot: '/tmp' });
    assert.strictEqual(out.success, false);
    assert.ok(out.error.includes('branch'));
  });

  it('returns error when repoRoot arg missing', () => {
    const out = mergeCore.performMerge('c4/anything', {});
    assert.strictEqual(out.success, false);
    assert.ok(out.error.includes('repoRoot'));
  });
});

describe('(8.5) merge-core.resolveBranchForWorker', () => {
  it('returns the worker name when no worktree exists', () => {
    const { repoRoot } = makeRepoWithBranch('c4/feature-resolve');
    const out = mergeCore.resolveBranchForWorker('ghost', repoRoot);
    assert.strictEqual(out, 'ghost');
  });

  it('resolves branch from worktree HEAD when worktree exists', () => {
    const { repoRoot } = makeRepoWithBranch('c4/feature-wt');
    const wtPath = path.resolve(repoRoot, '..', 'c4-worktree-myworker');
    git(repoRoot, 'worktree add "' + wtPath + '" c4/feature-wt');
    try {
      const out = mergeCore.resolveBranchForWorker('myworker', repoRoot);
      assert.strictEqual(out, 'c4/feature-wt');
    } finally {
      try { git(repoRoot, 'worktree remove --force "' + wtPath + '"'); } catch {}
    }
  });

  it('handles bad inputs without throwing', () => {
    assert.strictEqual(mergeCore.resolveBranchForWorker('', '/tmp'), '');
    assert.strictEqual(mergeCore.resolveBranchForWorker('w', ''), 'w');
  });
});

describe('(8.5) HTTP /key endpoint', () => {
  let server, port, rbacManager, harness;

  before((t, done) => {
    const tmp = mkTmpDir('c4-daemon-api-key-');
    rbacManager = new rbac.RoleManager({ storePath: path.join(tmp, 'rbac.json') });
    rbacManager.assignRole('alice', 'manager');
    harness = buildTestServer({
      repoRoot: tmp,
      rbacManager,
      authCheck: { username: 'alice' },
    });
    server = harness.server;
    server.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      // Seed a worker so /key can succeed.
      httpRequest(port, 'POST', '/register-worker', { name: 'w1', branch: 'c4/w1' })
        .then(() => done());
    });
  });

  after(() => { try { server.close(); } catch {} });

  it('returns 200 + {success,key} for a valid key', async () => {
    const r = await httpRequest(port, 'POST', '/key', { name: 'w1', key: 'Enter' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.success, true);
    assert.strictEqual(r.body.key, 'Enter');
    assert.ok(harness.sentKeys.some((s) => s.name === 'w1' && s.key === 'Enter' && s.isKey === true));
  });

  it('accepts Escape', async () => {
    const r = await httpRequest(port, 'POST', '/key', { name: 'w1', key: 'Escape' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.key, 'Escape');
  });

  it('accepts C-c (Ctrl-C)', async () => {
    const r = await httpRequest(port, 'POST', '/key', { name: 'w1', key: 'C-c' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.key, 'C-c');
  });

  it('accepts Up/Down/Left/Right arrows', async () => {
    for (const k of ['Up', 'Down', 'Left', 'Right']) {
      const r = await httpRequest(port, 'POST', '/key', { name: 'w1', key: k });
      assert.strictEqual(r.status, 200, 'arrow ' + k + ' should return 200');
      assert.strictEqual(r.body.success, true);
    }
  });

  it('returns 400 for unknown key', async () => {
    const r = await httpRequest(port, 'POST', '/key', { name: 'w1', key: 'F13' });
    assert.strictEqual(r.status, 400);
    assert.ok(r.body.error.includes('Unknown key'));
    assert.ok(Array.isArray(r.body.allowed));
    assert.ok(r.body.allowed.includes('Enter'));
  });

  it('returns 400 when name is missing', async () => {
    const r = await httpRequest(port, 'POST', '/key', { key: 'Enter' });
    assert.strictEqual(r.status, 400);
    assert.ok(r.body.error.includes('Missing'));
  });

  it('returns 400 when key is missing', async () => {
    const r = await httpRequest(port, 'POST', '/key', { name: 'w1' });
    assert.strictEqual(r.status, 400);
    assert.ok(r.body.error.includes('Missing'));
  });

  it('returns error payload when worker does not exist', async () => {
    const r = await httpRequest(port, 'POST', '/key', { name: 'ghost', key: 'Enter' });
    assert.strictEqual(r.status, 200);
    assert.ok(r.body.error);
    assert.ok(r.body.error.includes('not found'));
  });
});

describe('(8.5) HTTP /key RBAC', () => {
  let server, port, rbacManager, harness;

  before((t, done) => {
    const tmp = mkTmpDir('c4-daemon-api-keyacl-');
    rbacManager = new rbac.RoleManager({ storePath: path.join(tmp, 'rbac.json') });
    rbacManager.assignRole('eve', 'viewer');
    harness = buildTestServer({
      repoRoot: tmp,
      rbacManager,
      authCheck: { username: 'eve' },
    });
    server = harness.server;
    server.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      httpRequest(port, 'POST', '/register-worker', { name: 'w1', branch: 'c4/w1' })
        .then(() => done());
    });
  });

  after(() => { try { server.close(); } catch {} });

  it('returns 403 for viewer role', async () => {
    const r = await httpRequest(port, 'POST', '/key', { name: 'w1', key: 'Enter' });
    assert.strictEqual(r.status, 403);
    assert.strictEqual(r.body.action, 'key.write');
    assert.strictEqual(r.body.user, 'eve');
  });
});

describe('(8.5) HTTP /merge endpoint', () => {
  let server, port, rbacManager, harness, repoRoot;

  before((t, done) => {
    const r = makeRepoWithBranch('c4/http-merge');
    repoRoot = r.repoRoot;
    const rbacTmp = mkTmpDir('c4-daemon-api-merge-');
    rbacManager = new rbac.RoleManager({ storePath: path.join(rbacTmp, 'rbac.json') });
    rbacManager.assignRole('root', 'admin');
    harness = buildTestServer({
      repoRoot,
      rbacManager,
      authCheck: { username: 'root' },
    });
    server = harness.server;
    server.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      done();
    });
  });

  after(() => { try { server.close(); } catch {} });

  it('returns 400 when neither branch nor name is provided', async () => {
    const r = await httpRequest(port, 'POST', '/merge', {});
    assert.strictEqual(r.status, 400);
    assert.ok(r.body.error.includes('Missing branch'));
  });

  it('returns 404 when branch does not exist', async () => {
    const r = await httpRequest(port, 'POST', '/merge', { branch: 'no-such-branch' });
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.body.branch, 'no-such-branch');
    assert.ok(Array.isArray(r.body.reasons));
    assert.ok(r.body.reasons.some((x) => x.check === 'branch-exists' && x.status === 'FAIL'));
  });

  it('returns 409 when pre-merge checks fail (skip=false + missing TODO)', async () => {
    const r2 = makeRepoWithBranch('c4/check-fails', { withTodo: false });
    const tmpRbac = mkTmpDir('c4-daemon-api-merge2-');
    const rb = new rbac.RoleManager({ storePath: path.join(tmpRbac, 'rbac.json') });
    rb.assignRole('root', 'admin');
    const h = buildTestServer({ repoRoot: r2.repoRoot, rbacManager: rb, authCheck: { username: 'root' } });
    await new Promise((resolve) => h.server.listen(0, '127.0.0.1', resolve));
    const p = h.server.address().port;
    try {
      const resp = await httpRequest(p, 'POST', '/merge', { branch: 'c4/check-fails' });
      assert.strictEqual(resp.status, 409);
      assert.ok(resp.body.reasons.some((x) => x.check === 'TODO.md' && x.status === 'FAIL'));
    } finally {
      h.server.close();
    }
  });

  it('returns 200 + sha + summary when merge succeeds', async () => {
    const r = await httpRequest(port, 'POST', '/merge', { branch: 'c4/http-merge' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.success, true);
    assert.strictEqual(r.body.branch, 'c4/http-merge');
    assert.match(r.body.sha, /^[a-f0-9]{40}$/);
    assert.ok(typeof r.body.summary === 'string');
    assert.strictEqual(r.body.resolvedFrom, 'branch');
  });

  it('returns 500 when performMerge fails via monkeypatch flag', async () => {
    const r2 = makeRepoWithBranch('c4/fail-merge');
    const tmpRbac = mkTmpDir('c4-daemon-api-merge3-');
    const rb = new rbac.RoleManager({ storePath: path.join(tmpRbac, 'rbac.json') });
    rb.assignRole('root', 'admin');
    const h = buildTestServer({ repoRoot: r2.repoRoot, rbacManager: rb, authCheck: { username: 'root' } });
    h.failFlags.performMerge = true;
    await new Promise((resolve) => h.server.listen(0, '127.0.0.1', resolve));
    const p = h.server.address().port;
    try {
      const resp = await httpRequest(p, 'POST', '/merge', { branch: 'c4/fail-merge' });
      assert.strictEqual(resp.status, 500);
      assert.ok(resp.body.error.includes('git merge failed'));
    } finally {
      h.server.close();
    }
  });

  it('resolves a worker name to its registered branch', async () => {
    const r2 = makeRepoWithBranch('c4/http-worker-resolve');
    const tmpRbac = mkTmpDir('c4-daemon-api-merge4-');
    const rb = new rbac.RoleManager({ storePath: path.join(tmpRbac, 'rbac.json') });
    rb.assignRole('root', 'admin');
    const h = buildTestServer({ repoRoot: r2.repoRoot, rbacManager: rb, authCheck: { username: 'root' } });
    await new Promise((resolve) => h.server.listen(0, '127.0.0.1', resolve));
    const p = h.server.address().port;
    try {
      await httpRequest(p, 'POST', '/register-worker', { name: 'wx', branch: 'c4/http-worker-resolve' });
      const resp = await httpRequest(p, 'POST', '/merge', { name: 'wx' });
      assert.strictEqual(resp.status, 200);
      assert.strictEqual(resp.body.branch, 'c4/http-worker-resolve');
      assert.strictEqual(resp.body.resolvedFrom, 'worker');
    } finally {
      h.server.close();
    }
  });

  it('returns 404 when worker name cannot be resolved to a branch', async () => {
    // root's server was built with a repo that doesn't have a 'ghost-worker' worktree;
    // resolveBranchForWorker falls back to the worker name, which won't rev-parse.
    const resp = await httpRequest(port, 'POST', '/merge', { name: 'ghost-worker' });
    assert.strictEqual(resp.status, 404);
    assert.strictEqual(resp.body.branch, 'ghost-worker');
  });
});

describe('(8.5) HTTP /merge RBAC', () => {
  let server, port, rbacManager, harness, repoRoot;

  before((t, done) => {
    const r = makeRepoWithBranch('c4/rbac-merge');
    repoRoot = r.repoRoot;
    const rbacTmp = mkTmpDir('c4-daemon-api-mergeacl-');
    rbacManager = new rbac.RoleManager({ storePath: path.join(rbacTmp, 'rbac.json') });
    rbacManager.assignRole('eve', 'viewer');
    harness = buildTestServer({
      repoRoot,
      rbacManager,
      authCheck: { username: 'eve' },
    });
    server = harness.server;
    server.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      done();
    });
  });

  after(() => { try { server.close(); } catch {} });

  it('returns 403 when viewer attempts merge', async () => {
    const r = await httpRequest(port, 'POST', '/merge', { branch: 'c4/rbac-merge' });
    assert.strictEqual(r.status, 403);
    assert.strictEqual(r.body.action, 'merge.write');
    assert.strictEqual(r.body.user, 'eve');
  });

  it('returns 401 when no username is present', async () => {
    const tmpRbac = mkTmpDir('c4-daemon-api-mergenoauth-');
    const rb = new rbac.RoleManager({ storePath: path.join(tmpRbac, 'rbac.json') });
    const h = buildTestServer({
      repoRoot,
      rbacManager: rb,
      authCheck: { username: null },
    });
    await new Promise((resolve) => h.server.listen(0, '127.0.0.1', resolve));
    const p = h.server.address().port;
    try {
      const resp = await httpRequest(p, 'POST', '/merge', { branch: 'c4/rbac-merge' });
      assert.strictEqual(resp.status, 401);
      assert.ok(resp.body.error.includes('Authentication'));
    } finally {
      h.server.close();
    }
  });
});

describe('(8.5) daemon.js source integration', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'daemon.js'), 'utf8');

  it('requires ./merge-core', () => {
    assert.ok(/require\(['"]\.\/merge-core['"]\)/.test(src));
  });

  it('defines KEY_ALLOWLIST', () => {
    assert.ok(/KEY_ALLOWLIST/.test(src));
    assert.ok(/'Enter'/.test(src) && /'Escape'/.test(src) && /'C-c'/.test(src));
  });

  it('gates /key with KEY_WRITE', () => {
    assert.ok(/rbac\.ACTIONS\.KEY_WRITE/.test(src));
  });

  it('gates /merge with MERGE_WRITE', () => {
    assert.ok(/rbac\.ACTIONS\.MERGE_WRITE/.test(src));
  });

  it('calls mergeCore.runPreMergeChecks and mergeCore.performMerge', () => {
    assert.ok(/mergeCore\.runPreMergeChecks\(/.test(src));
    assert.ok(/mergeCore\.performMerge\(/.test(src));
  });
});
