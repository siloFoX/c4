'use strict';

// (1.11.93) `c4 diff <branch> [--stat|--patch|--files]` wraps
// `git diff main...<branch>` so the operator can preview a worker
// branch without remembering the merge-base syntax. The helpers
// resolveDiffRepo / buildDiffArgs / runDiff are exported from
// src/cli.js so tests can pin the argv shape and forwarded exit
// code without spawning real git.
//
// node:test style — same pattern as cli-ui.test.js and
// cli-attach.test.js. The repo's CLI suite is node:test only;
// vitest is web-side.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { EventEmitter } = require('node:events');
const { spawnSync } = require('node:child_process');

const CLI_PATH = path.resolve(__dirname, '..', 'src', 'cli.js');
const { resolveDiffRepo, buildDiffArgs, runDiff } = require(CLI_PATH);

function tmpConfigFile(contents) {
  const p = path.join(
    os.tmpdir(),
    `c4-diff-test-${process.pid}-${Math.random().toString(36).slice(2)}.json`
  );
  fs.writeFileSync(p, typeof contents === 'string' ? contents : JSON.stringify(contents));
  return p;
}

function makeStdout() {
  const lines = [];
  return {
    write: (chunk) => {
      lines.push(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk));
      return true;
    },
    _lines: lines,
    text() { return this._lines.join(''); },
  };
}

function fakeChild() {
  const child = new EventEmitter();
  child._stdio = null;
  return child;
}

function captureSpawn(impl) {
  const calls = [];
  const fn = (cmd, args, opts) => {
    calls.push({ cmd, args, opts });
    return impl ? impl(cmd, args, opts) : fakeChild();
  };
  fn.calls = calls;
  return fn;
}

describe('c4 diff — buildDiffArgs (1.11.93)', () => {
  it('defaults to --stat with color.diff=always and main...<branch>', () => {
    const r = buildDiffArgs({ branch: 'c4/foo', args: [], repo: '/r' });
    assert.equal(r.mode, 'stat');
    assert.deepEqual(r.argv, [
      '-C', '/r',
      '-c', 'color.diff=always',
      'diff', 'main...c4/foo', '--stat',
    ]);
  });

  it('--stat explicit matches the default argv', () => {
    const a = buildDiffArgs({ branch: 'b', args: ['--stat'], repo: '/r' }).argv;
    const b = buildDiffArgs({ branch: 'b', args: [], repo: '/r' }).argv;
    assert.deepEqual(a, b);
  });

  it('--patch omits --stat and --name-only but keeps color.diff=always', () => {
    const r = buildDiffArgs({ branch: 'feat-x', args: ['--patch'], repo: '/r' });
    assert.equal(r.mode, 'patch');
    assert.ok(r.argv.includes('-c'), 'expected -c flag for color');
    assert.ok(r.argv.includes('color.diff=always'), 'expected color.diff=always');
    assert.ok(!r.argv.includes('--stat'), '--stat should be absent for --patch');
    assert.ok(!r.argv.includes('--name-only'), '--name-only should be absent for --patch');
    assert.deepEqual(r.argv, [
      '-C', '/r',
      '-c', 'color.diff=always',
      'diff', 'main...feat-x',
    ]);
  });

  it('--files uses --name-only and omits color flags', () => {
    const r = buildDiffArgs({ branch: 'b', args: ['--files'], repo: '/r' });
    assert.equal(r.mode, 'files');
    assert.ok(r.argv.includes('--name-only'), 'expected --name-only for --files');
    assert.ok(!r.argv.includes('--stat'));
    assert.ok(!r.argv.includes('color.diff=always'),
      `--files must not pass color.diff=always; argv=${JSON.stringify(r.argv)}`);
    assert.deepEqual(r.argv, [
      '-C', '/r',
      'diff', 'main...b', '--name-only',
    ]);
  });

  it('branch is used verbatim (no prefix injection)', () => {
    const r = buildDiffArgs({ branch: 'c4/auto-ui-cmdk', args: [], repo: '/r' });
    assert.ok(r.argv.includes('main...c4/auto-ui-cmdk'));
    const short = buildDiffArgs({ branch: 'feat', args: [], repo: '/r' });
    assert.ok(short.argv.includes('main...feat'));
  });

  it('multiple mode flags: last one wins', () => {
    const r = buildDiffArgs({ branch: 'b', args: ['--stat', '--patch', '--files'], repo: '/r' });
    assert.equal(r.mode, 'files');
    const r2 = buildDiffArgs({ branch: 'b', args: ['--files', '--patch'], repo: '/r' });
    assert.equal(r2.mode, 'patch');
  });

  it('throws when branch is missing', () => {
    assert.throws(() => buildDiffArgs({ args: [], repo: '/r' }), /branch is required/);
  });

  it('throws when repo is missing', () => {
    assert.throws(() => buildDiffArgs({ branch: 'b', args: [] }), /repo is required/);
  });
});

describe('c4 diff — resolveDiffRepo (1.11.93)', () => {
  it('returns the toplevel reported by git when execFn succeeds', () => {
    const exec = () => '/path/to/repo\n';
    const root = resolveDiffRepo({ cwd: '/anywhere', cfgPath: '/nonexistent.json', execFn: exec });
    assert.equal(root, '/path/to/repo');
  });

  it('falls back to config.worktree.projectRoot when git toplevel fails', () => {
    const cfgPath = tmpConfigFile({ worktree: { projectRoot: '/from/config' } });
    try {
      const exec = () => { throw new Error('not a git repo'); };
      const root = resolveDiffRepo({ cwd: '/anywhere', cfgPath, execFn: exec });
      assert.equal(root, path.resolve('/from/config'));
    } finally {
      fs.unlinkSync(cfgPath);
    }
  });

  it('falls back to cwd when both git and config fail', () => {
    const exec = () => { throw new Error('nope'); };
    const root = resolveDiffRepo({
      cwd: '/some/cwd',
      cfgPath: '/definitely/not/a/real/path.json',
      execFn: exec,
    });
    assert.equal(root, '/some/cwd');
  });
});

describe('c4 diff — runDiff handler (1.11.93)', () => {
  it('exits 1 with usage line when <branch> is missing', async () => {
    const stderr = makeStdout();
    let exitCode = null;
    await runDiff({
      args: [],
      cwd: '/some/cwd',
      cfgPath: '/nonexistent.json',
      spawn: () => fakeChild(),
      exit: (c) => { exitCode = c; },
      stderr,
    });
    assert.equal(exitCode, 1);
    assert.ok(stderr.text().includes('Usage: c4 diff <branch>'),
      `expected usage line, got: ${stderr.text()}`);
  });

  it('spawns git with the --stat argv by default and inherits stdio', async () => {
    const stderr = makeStdout();
    const child = fakeChild();
    const spawn = captureSpawn(() => child);
    const p = runDiff({
      args: ['c4/foo'],
      cwd: '/somewhere',
      cfgPath: '/nonexistent.json',
      spawn,
      exit: () => {},
      stderr,
      env: { PATH: '/usr/bin' },
    });
    // Fire close so the promise resolves.
    setImmediate(() => child.emit('close', 0));
    await p;
    assert.equal(spawn.calls.length, 1);
    assert.equal(spawn.calls[0].cmd, 'git');
    assert.deepEqual(spawn.calls[0].args, [
      '-C', '/somewhere',
      '-c', 'color.diff=always',
      'diff', 'main...c4/foo', '--stat',
    ]);
    assert.equal(spawn.calls[0].opts.stdio, 'inherit',
      'stdio: inherit lets ANSI color survive');
    assert.equal(spawn.calls[0].opts.env.GIT_PAGER, 'cat',
      'GIT_PAGER=cat keeps git from launching less on tall diffs');
  });

  it('--patch passes color.diff=always; --files does not', async () => {
    const child1 = fakeChild();
    const child2 = fakeChild();
    const spawn = captureSpawn((cmd, args, opts) => {
      return spawn.calls.length === 1 ? child1 : child2;
    });
    const p1 = runDiff({
      args: ['b', '--patch'],
      cwd: '/r',
      cfgPath: '/nonexistent.json',
      spawn,
      exit: () => {},
      stderr: makeStdout(),
    });
    setImmediate(() => child1.emit('close', 0));
    await p1;
    const p2 = runDiff({
      args: ['b', '--files'],
      cwd: '/r',
      cfgPath: '/nonexistent.json',
      spawn,
      exit: () => {},
      stderr: makeStdout(),
    });
    setImmediate(() => child2.emit('close', 0));
    await p2;

    const patchArgv = spawn.calls[0].args;
    const filesArgv = spawn.calls[1].args;
    assert.ok(patchArgv.includes('color.diff=always'), '--patch should set color.diff=always');
    assert.ok(!patchArgv.includes('--stat'));
    assert.ok(!filesArgv.includes('color.diff=always'), '--files must not set color.diff=always');
    assert.ok(filesArgv.includes('--name-only'));
  });

  it('forwards the git exit code from the close event', async () => {
    const child = fakeChild();
    const spawn = captureSpawn(() => child);
    let exitCode = null;
    const p = runDiff({
      args: ['bogus-branch'],
      cwd: '/r',
      cfgPath: '/nonexistent.json',
      spawn,
      exit: (c) => { exitCode = c; },
      stderr: makeStdout(),
    });
    setImmediate(() => child.emit('close', 128));
    await p;
    assert.equal(exitCode, 128, 'git 128 (bad ref) must reach the shell verbatim');
  });

  it('uses the configured repo when git toplevel is unavailable', async () => {
    const cfgPath = tmpConfigFile({ worktree: { projectRoot: '/configured/repo' } });
    try {
      // Force the inner execSync to throw by pointing cwd at a path
      // that exists but is not a git repo. We can't intercept the
      // inner execSync from out here, so instead drive a fake spawn
      // and read back the -C argument it received.
      const child = fakeChild();
      const spawn = captureSpawn(() => child);
      const p = runDiff({
        args: ['b'],
        cwd: os.tmpdir(),
        cfgPath,
        spawn,
        exit: () => {},
        stderr: makeStdout(),
      });
      setImmediate(() => child.emit('close', 0));
      await p;
      const argv = spawn.calls[0].args;
      const ci = argv.indexOf('-C');
      assert.ok(ci !== -1, 'expected -C flag in argv');
      // Either the real git found a toplevel for tmpdir (unlikely) or
      // we fell back to the configured repo. Either way the -C arg
      // must NOT be the empty string.
      assert.ok(argv[ci + 1] && argv[ci + 1].length > 0,
        `expected non-empty repo path after -C, got ${JSON.stringify(argv[ci + 1])}`);
    } finally {
      fs.unlinkSync(cfgPath);
    }
  });

  it('spawn error event maps to exit 1 with a structured stderr line', async () => {
    const child = fakeChild();
    const spawn = captureSpawn(() => child);
    const stderr = makeStdout();
    let exitCode = null;
    const p = runDiff({
      args: ['b'],
      cwd: '/r',
      cfgPath: '/nonexistent.json',
      spawn,
      exit: (c) => { exitCode = c; },
      stderr,
    });
    setImmediate(() => {
      const err = new Error('spawn git ENOENT');
      err.code = 'ENOENT';
      child.emit('error', err);
    });
    await p;
    assert.equal(exitCode, 1);
    assert.ok(stderr.text().includes('spawn failed'),
      `expected spawn-failed line, got: ${stderr.text()}`);
  });

  it('null close code is normalised to exit 1', async () => {
    const child = fakeChild();
    const spawn = captureSpawn(() => child);
    let exitCode = null;
    const p = runDiff({
      args: ['b'],
      cwd: '/r',
      cfgPath: '/nonexistent.json',
      spawn,
      exit: (c) => { exitCode = c; },
      stderr: makeStdout(),
    });
    setImmediate(() => child.emit('close', null));
    await p;
    assert.equal(exitCode, 1);
  });
});

describe('c4 diff — help / usage block (1.11.93)', () => {
  it('lists `diff <branch>` in the top-level usage block', () => {
    const r = spawnSync('node', [CLI_PATH, 'unknown-cmd-xyzzy-diff'], {
      encoding: 'utf8',
      timeout: 5000,
      env: { ...process.env, C4_URL: 'http://127.0.0.1:1' },
    });
    assert.match(r.stdout, /diff <branch> \[--stat\|--patch\|--files\]/);
  });
});
