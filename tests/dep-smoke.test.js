'use strict';

// Dep smoke check tests (TODO 8.16).
//
// Exercises src/dep-smoke.js (pure helpers) plus the
// checkPackageDepsInstalled gate added to src/validation.js. A tmpdir
// git repo is initialised per suite so detectNewDeps runs against real
// commits (git show + git diff-tree must see distinct base/head SHAs).
// verifyDepsLoadable uses the real `node -e "require(x)"` path so the
// "node built-in works, fake name fails" assertions exercise the
// spawnSync path end to end instead of a mock.

const assert = require('assert');
const { describe, it, before, after } = require('node:test');
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const depSmoke = require('../src/dep-smoke');
const validation = require('../src/validation');

function mkTmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-dep-smoke-'));
  execSync(`git init -q "${dir}"`);
  execSync(`git -C "${dir}" config user.email "test@c4"`);
  execSync(`git -C "${dir}" config user.name "c4-test"`);
  execSync(`git -C "${dir}" config commit.gpgsign false`);
  execSync(`git -C "${dir}" checkout -q -b main`);
  return dir;
}

function writePkg(dir, obj) {
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(obj, null, 2));
}

function commitAll(dir, msg) {
  execSync(`git -C "${dir}" add -A`);
  execSync(`git -C "${dir}" commit -q -m "${msg}"`);
  return execSync(`git -C "${dir}" rev-parse HEAD`, { encoding: 'utf8' }).trim();
}

function rmrf(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

// Minimal spawn stub used to assert the fake-name rejection path without
// shelling out. Real spawn is also exercised below via node built-ins.
function stubSpawn(script) {
  return function fakeSpawn(cmd, args) {
    const code = script(cmd, args);
    return {
      status: code,
      stdout: '',
      stderr: code === 0 ? '' : 'Cannot find module',
    };
  };
}

describe('(8.16) parsePkgJson', () => {
  it('parses a well-formed package.json into an object', () => {
    const out = depSmoke.parsePkgJson('{"name":"x","dependencies":{"a":"1"}}');
    assert.strictEqual(out.name, 'x');
    assert.deepStrictEqual(out.dependencies, { a: '1' });
  });

  it('rejects syntactically invalid JSON with INVALID_PACKAGE_JSON', () => {
    let caught;
    try { depSmoke.parsePkgJson('{this is not json'); } catch (e) { caught = e; }
    assert.ok(caught, 'expected throw');
    assert.strictEqual(caught.code, 'INVALID_PACKAGE_JSON');
  });

  it('rejects a JSON array (package.json must be an object)', () => {
    let caught;
    try { depSmoke.parsePkgJson('[]'); } catch (e) { caught = e; }
    assert.ok(caught);
    assert.strictEqual(caught.code, 'INVALID_PACKAGE_JSON');
  });

  it('returns null for null / undefined input', () => {
    assert.strictEqual(depSmoke.parsePkgJson(null), null);
    assert.strictEqual(depSmoke.parsePkgJson(undefined), null);
  });
});

describe('(8.16) depMap + diffDepMaps', () => {
  it('depMap returns empty object when key missing', () => {
    assert.deepStrictEqual(depSmoke.depMap({}, 'dependencies'), {});
  });

  it('depMap drops non-string version values defensively', () => {
    const pkg = { dependencies: { good: '1.0.0', bad: 42, nested: { x: 1 } } };
    const out = depSmoke.depMap(pkg, 'dependencies');
    assert.deepStrictEqual(out, { good: '1.0.0' });
  });

  it('diffDepMaps returns only newly added names, sorted', () => {
    const before = { a: '1', b: '1' };
    const after = { a: '1', b: '2', c: '1', d: '1' };
    const added = depSmoke.diffDepMaps(before, after);
    assert.deepStrictEqual(added.map(x => x.name), ['c', 'd']);
    assert.strictEqual(added[0].version, '1');
  });

  it('diffDepMaps treats version-only changes as not-added', () => {
    const before = { a: '1.0.0' };
    const after = { a: '2.0.0' };
    assert.deepStrictEqual(depSmoke.diffDepMaps(before, after), []);
  });
});

describe('(8.16) detectNewDeps on a real tmpdir git repo', () => {
  let repo;
  let baseSha;
  let headSha;
  before(() => {
    repo = mkTmpRepo();
    writePkg(repo, { name: 'proj', version: '0.0.1', dependencies: { 'semver': '^7.0.0' } });
    baseSha = commitAll(repo, 'base');
    writePkg(repo, {
      name: 'proj',
      version: '0.0.2',
      dependencies: { 'semver': '^7.0.0', 'bcryptjs': '^3.0.0' },
      devDependencies: { 'jest-shim-mock': '1.0.0' },
    });
    headSha = commitAll(repo, 'add bcryptjs + dev mock');
  });
  after(() => rmrf(repo));

  it('reports hasChanges=true when package.json changed', () => {
    const res = depSmoke.detectNewDeps(baseSha, headSha, repo);
    assert.strictEqual(res.hasChanges, true);
  });

  it('lists only the newly added prod dependency', () => {
    const res = depSmoke.detectNewDeps(baseSha, headSha, repo);
    assert.deepStrictEqual(res.deps.map(d => d.name), ['bcryptjs']);
    assert.strictEqual(res.deps[0].version, '^3.0.0');
  });

  it('lists the newly added devDependency separately', () => {
    const res = depSmoke.detectNewDeps(baseSha, headSha, repo);
    assert.deepStrictEqual(res.devDeps.map(d => d.name), ['jest-shim-mock']);
  });

  it('returns hasChanges=false when package.json did not change', () => {
    // head-to-head diff has no package.json entry
    const res = depSmoke.detectNewDeps(headSha, headSha, repo);
    assert.strictEqual(res.hasChanges, false);
    assert.strictEqual(res.reason, 'unchanged');
  });

  it('returns missing-args shape when inputs are falsy', () => {
    const res = depSmoke.detectNewDeps(null, headSha, repo);
    assert.strictEqual(res.hasChanges, false);
    assert.strictEqual(res.reason, 'missing-args');
  });
});

describe('(8.16) detectNewDeps rejects invalid package.json', () => {
  let repo;
  let baseSha;
  let headSha;
  before(() => {
    repo = mkTmpRepo();
    writePkg(repo, { name: 'proj', dependencies: {} });
    baseSha = commitAll(repo, 'base');
    // Commit a deliberately invalid package.json on head
    fs.writeFileSync(path.join(repo, 'package.json'), '{not valid json');
    execSync(`git -C "${repo}" add -A`);
    execSync(`git -C "${repo}" commit -q -m "break pkg"`);
    headSha = execSync(`git -C "${repo}" rev-parse HEAD`, { encoding: 'utf8' }).trim();
  });
  after(() => rmrf(repo));

  it('throws INVALID_PACKAGE_JSON when the head commit has malformed JSON', () => {
    let caught;
    try { depSmoke.detectNewDeps(baseSha, headSha, repo); } catch (e) { caught = e; }
    assert.ok(caught, 'expected throw');
    assert.strictEqual(caught.code, 'INVALID_PACKAGE_JSON');
  });
});

describe('(8.16) verifyDepsLoadable', () => {
  it('returns ok:true for a real installed module (node:path)', () => {
    const res = depSmoke.verifyDepsLoadable(['path'], process.cwd());
    assert.strictEqual(res.ok, true);
    assert.deepStrictEqual(res.failed, []);
  });

  it('returns ok:false for a fake non-existent module', () => {
    const res = depSmoke.verifyDepsLoadable(
      ['definitely-not-a-real-module-xyz-c4-8-16'],
      process.cwd()
    );
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.failed.length, 1);
    assert.strictEqual(
      res.failed[0].name,
      'definitely-not-a-real-module-xyz-c4-8-16'
    );
    assert.ok(res.failed[0].error && res.failed[0].error.length > 0);
  });

  it('partitions mixed good + bad lists correctly', () => {
    const res = depSmoke.verifyDepsLoadable(
      ['path', 'definitely-not-real-c4-8-16-b'],
      process.cwd()
    );
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.failed.length, 1);
    assert.strictEqual(
      res.failed[0].name,
      'definitely-not-real-c4-8-16-b'
    );
  });

  it('returns ok:true when given an empty list', () => {
    const res = depSmoke.verifyDepsLoadable([], process.cwd());
    assert.strictEqual(res.ok, true);
    assert.deepStrictEqual(res.failed, []);
  });

  it('flags invalid dep names (empty string) without spawning', () => {
    const res = depSmoke.verifyDepsLoadable(
      [''],
      process.cwd(),
      { spawn: stubSpawn(() => 0) }
    );
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.failed[0].error, 'invalid dep name');
  });

  it('uses the injected spawn stub when provided', () => {
    let calls = 0;
    const spawn = (cmd, args) => {
      calls += 1;
      return { status: 0, stdout: '', stderr: '' };
    };
    const res = depSmoke.verifyDepsLoadable(['a', 'b'], process.cwd(), { spawn });
    assert.strictEqual(res.ok, true);
    assert.strictEqual(calls, 2);
  });
});

describe('(8.16) formatFailure', () => {
  it('formats a failed result into a readable multiline message', () => {
    const msg = depSmoke.formatFailure({
      ok: false,
      failed: [{ name: 'bcryptjs', error: 'Cannot find module' }],
    });
    assert.ok(msg.includes('bcryptjs'));
    assert.ok(msg.includes('Cannot find module'));
    assert.ok(msg.includes('npm ci'));
  });

  it('returns an empty string for an ok result', () => {
    assert.strictEqual(depSmoke.formatFailure({ ok: true, failed: [] }), '');
  });
});

describe('(8.16) runCheck orchestrator', () => {
  let repo;
  let baseSha;
  let headSha;
  before(() => {
    repo = mkTmpRepo();
    writePkg(repo, { name: 'proj', dependencies: {} });
    baseSha = commitAll(repo, 'base');
    writePkg(repo, { name: 'proj', dependencies: { 'path': '*' } });
    headSha = commitAll(repo, 'add path as dep');
  });
  after(() => rmrf(repo));

  it('skips when package.json did not change', () => {
    const res = depSmoke.runCheck({ baseSha: headSha, headSha, repoRoot: repo, cwd: repo });
    assert.strictEqual(res.skipped, true);
    assert.strictEqual(res.reason, 'unchanged');
  });

  it('passes when the new dep is loadable (path is a node built-in)', () => {
    const res = depSmoke.runCheck({
      baseSha, headSha, repoRoot: repo, cwd: repo,
    });
    assert.strictEqual(res.skipped, false);
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.reason, 'ok');
  });

  it('invokes afterInstall hook exactly once with the detect payload', () => {
    let hookCalls = 0;
    let seenDetect = null;
    const res = depSmoke.runCheck({
      baseSha, headSha, repoRoot: repo, cwd: repo,
      afterInstall: ({ detect }) => {
        hookCalls += 1;
        seenDetect = detect;
      },
    });
    assert.strictEqual(hookCalls, 1);
    assert.ok(seenDetect && Array.isArray(seenDetect.deps));
    assert.strictEqual(res.ok, true);
  });

  it('surfaces afterInstall failures as install-failed without running verify', () => {
    const res = depSmoke.runCheck({
      baseSha, headSha, repoRoot: repo, cwd: repo,
      afterInstall: () => { throw new Error('npm ci boom'); },
    });
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.reason, 'install-failed');
    assert.ok(res.detail && res.detail.includes('npm ci boom'));
  });
});

describe('(8.16) validation.checkPackageDepsInstalled', () => {
  let repo;
  let baseSha;
  let headSha;
  before(() => {
    repo = mkTmpRepo();
    writePkg(repo, { name: 'proj', dependencies: {} });
    baseSha = commitAll(repo, 'base');
    writePkg(repo, {
      name: 'proj',
      dependencies: { 'path': '*' },
      devDependencies: { 'dev-mock-c4-816': '1.0.0' },
    });
    headSha = commitAll(repo, 'add path + dev mock');
  });
  after(() => rmrf(repo));

  it('returns ok+skipped when package.json unchanged between SHAs', () => {
    const res = validation.checkPackageDepsInstalled({
      baseSha: headSha, headSha, repoRoot: repo, skipInstall: true,
    });
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.skipped, true);
    assert.strictEqual(res.reason, 'package-json-unchanged');
  });

  it('passes the gate when new prod dep is loadable (skipInstall avoids npm ci)', () => {
    const res = validation.checkPackageDepsInstalled({
      baseSha, headSha, repoRoot: repo, skipInstall: true,
    });
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.skipped, false);
    assert.strictEqual(res.reason, 'ok');
  });

  it('returns missing-args when baseSha is absent', () => {
    const res = validation.checkPackageDepsInstalled({
      baseSha: '', headSha, repoRoot: repo, skipInstall: true,
    });
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.skipped, true);
    assert.strictEqual(res.reason, 'missing-args');
  });

  it('fails with require-failed when the new dep cannot be loaded', () => {
    const repo2 = mkTmpRepo();
    try {
      writePkg(repo2, { name: 'proj', dependencies: {} });
      const base2 = commitAll(repo2, 'base');
      writePkg(repo2, {
        name: 'proj',
        dependencies: { 'definitely-not-real-c4-8-16-v': '1.0.0' },
      });
      const head2 = commitAll(repo2, 'add fake dep');
      const res = validation.checkPackageDepsInstalled({
        baseSha: base2, headSha: head2, repoRoot: repo2, skipInstall: true,
      });
      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.reason, 'require-failed');
      assert.ok(res.detail && res.detail.includes('definitely-not-real-c4-8-16-v'));
    } finally {
      rmrf(repo2);
    }
  });

  it('treats devDependencies as warn-only by default (not included in gate)', () => {
    // The dev dep name here does not exist on disk. Because includeDev
    // is not set, the gate still passes -- devDeps must not block.
    const res = validation.checkPackageDepsInstalled({
      baseSha, headSha, repoRoot: repo, skipInstall: true,
    });
    assert.strictEqual(res.ok, true);
    assert.ok(res.dev && Array.isArray(res.dev.failed));
    assert.strictEqual(res.dev.failed.length, 0); // includeDev:false -> no probe
  });
});

describe('(8.16) source wiring', () => {
  const cliSrc = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'cli.js'),
    'utf8'
  );
  const valSrc = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'validation.js'),
    'utf8'
  );

  it('cli.js invokes checkPackageDepsInstalled in the merge flow', () => {
    assert.ok(
      cliSrc.includes("validationLib.checkPackageDepsInstalled"),
      'cli.js should call validationLib.checkPackageDepsInstalled'
    );
  });

  it('cli.js names the check "package-deps-installed" in its output', () => {
    assert.ok(
      cliSrc.includes('package-deps-installed'),
      'cli.js should surface the check name'
    );
  });

  it('validation.js requires the dep-smoke module', () => {
    assert.ok(
      valSrc.includes("require('./dep-smoke')"),
      'validation.js should require ./dep-smoke'
    );
  });

  it('validation.js exports checkPackageDepsInstalled', () => {
    assert.ok(
      /checkPackageDepsInstalled\s*,?\s*\n?\s*}/m.test(valSrc) ||
        valSrc.includes('checkPackageDepsInstalled'),
      'validation.js should export checkPackageDepsInstalled'
    );
  });
});
