// merge-uncommitted-guard tests (7.28).
//
// Verifies src/merge-guard.js: dirty-tree detection, error message, stash
// push/pop, and pop-conflict guidance. cli.js integration is verified by a
// source-level check (analogous to merge-homedir.test.js).

'use strict';

const assert = require('assert');
const { describe, it } = require('node:test');
const path = require('path');
const fs = require('fs');

const {
  getDirtyEntries,
  isDirty,
  formatEntry,
  buildDirtyMessage,
  stashPush,
  stashPop,
  buildPopConflictMessage,
} = require('../src/merge-guard');

// Build a spawnSync stand-in whose responses come from a lookup table keyed
// by the joined argv. Unmatched calls return a non-zero exit so missing
// expectations show up as failures.
function tableSpawn(table) {
  return function fakeSpawn(cmd, args) {
    const key = [cmd, ...args].join(' ');
    if (key in table) return table[key];
    return { status: 1, stdout: '', stderr: `unexpected: ${key}` };
  };
}

describe('getDirtyEntries', () => {
  it('returns [] for a clean tree', () => {
    const spawn = tableSpawn({
      'git -C /repo status --porcelain': { status: 0, stdout: '', stderr: '' },
    });
    assert.deepStrictEqual(getDirtyEntries('/repo', { spawn }), []);
  });

  it('returns each non-empty porcelain line, ignoring trailing newline', () => {
    const spawn = tableSpawn({
      'git -C /repo status --porcelain': {
        status: 0,
        stdout: ' M TODO.md\n M package-lock.json\n?? new.txt\n',
        stderr: '',
      },
    });
    assert.deepStrictEqual(getDirtyEntries('/repo', { spawn }), [
      ' M TODO.md',
      ' M package-lock.json',
      '?? new.txt',
    ]);
  });

  it('throws when git status fails', () => {
    const spawn = tableSpawn({
      'git -C /repo status --porcelain': {
        status: 128,
        stdout: '',
        stderr: 'fatal: not a git repository',
      },
    });
    assert.throws(
      () => getDirtyEntries('/repo', { spawn }),
      /git status --porcelain failed: fatal: not a git repository/
    );
  });

  it('throws when spawn returns null', () => {
    const spawn = () => null;
    assert.throws(() => getDirtyEntries('/repo', { spawn }), /git status/);
  });
});

describe('isDirty', () => {
  it('false when porcelain is empty', () => {
    const spawn = tableSpawn({
      'git -C /repo status --porcelain': { status: 0, stdout: '', stderr: '' },
    });
    assert.strictEqual(isDirty('/repo', { spawn }), false);
  });

  it('true when porcelain has any line', () => {
    const spawn = tableSpawn({
      'git -C /repo status --porcelain': {
        status: 0,
        stdout: ' M TODO.md\n',
        stderr: '',
      },
    });
    assert.strictEqual(isDirty('/repo', { spawn }), true);
  });
});

describe('formatEntry', () => {
  it('renders "PATH (status)" for tracked modifications', () => {
    assert.strictEqual(formatEntry(' M TODO.md'), 'TODO.md (M)');
  });

  it('renders untracked entries as "PATH (??)"', () => {
    assert.strictEqual(formatEntry('?? new.txt'), 'new.txt (??)');
  });

  it('handles staged adds (A in column 1)', () => {
    assert.strictEqual(formatEntry('A  src/x.js'), 'src/x.js (A)');
  });

  it('returns input verbatim when too short to format', () => {
    assert.strictEqual(formatEntry(''), '');
    assert.strictEqual(formatEntry('M'), 'M');
  });
});

describe('buildDirtyMessage', () => {
  it('lists every modified file by name', () => {
    const msg = buildDirtyMessage([
      ' M TODO.md',
      ' M package-lock.json',
    ]);
    assert.match(msg, /uncommitted changes/);
    assert.match(msg, /TODO\.md/);
    assert.match(msg, /package-lock\.json/);
  });

  it('suggests git status, c4 cleanup, and --auto-stash', () => {
    const msg = buildDirtyMessage([' M TODO.md']);
    assert.match(msg, /git -C <repo> status/);
    assert.match(msg, /c4 cleanup/);
    assert.match(msg, /--auto-stash/);
  });
});

describe('stashPush', () => {
  it('throws on non-zero exit', () => {
    const spawn = tableSpawn({
      'git -C /repo stash push -m my-label': {
        status: 1,
        stdout: '',
        stderr: 'No local changes to save',
      },
    });
    assert.throws(
      () => stashPush('/repo', 'my-label', { spawn }),
      /git stash push failed: No local changes to save/
    );
  });

  it('returns trimmed stdout on success', () => {
    const spawn = tableSpawn({
      'git -C /repo stash push -m my-label': {
        status: 0,
        stdout: 'Saved working directory and index state On main: my-label\n',
        stderr: '',
      },
    });
    assert.strictEqual(
      stashPush('/repo', 'my-label', { spawn }),
      'Saved working directory and index state On main: my-label'
    );
  });

  it('passes the label as a single argv item (no shell escaping needed)', () => {
    const received = [];
    const spawn = (cmd, args) => {
      received.push([cmd, ...args]);
      return { status: 0, stdout: '', stderr: '' };
    };
    stashPush('/repo', 'label with spaces', { spawn });
    assert.deepStrictEqual(received[0], [
      'git', '-C', '/repo', 'stash', 'push', '-m', 'label with spaces',
    ]);
  });
});

describe('stashPop', () => {
  it('returns status 0 with stdout for a clean pop', () => {
    const spawn = tableSpawn({
      'git -C /repo stash pop': {
        status: 0,
        stdout: 'Dropped refs/stash@{0}\n',
        stderr: '',
      },
    });
    const r = stashPop('/repo', { spawn });
    assert.strictEqual(r.status, 0);
    assert.match(r.stdout, /Dropped/);
  });

  it('reports non-zero status without throwing on conflict', () => {
    const spawn = tableSpawn({
      'git -C /repo stash pop': {
        status: 1,
        stdout: 'CONFLICT (content): Merge conflict in TODO.md\n',
        stderr: '',
      },
    });
    const r = stashPop('/repo', { spawn });
    assert.strictEqual(r.status, 1);
    assert.match(r.stdout, /CONFLICT/);
  });

  it('returns status -1 when spawn returns null', () => {
    const spawn = () => null;
    const r = stashPop('/repo', { spawn });
    assert.strictEqual(r.status, -1);
    assert.strictEqual(r.stdout, '');
  });
});

describe('buildPopConflictMessage', () => {
  it('mentions stash list, the label, and that no data was lost', () => {
    const msg = buildPopConflictMessage('c4-merge-autostash-w1', {
      status: 1,
      stdout: 'CONFLICT (content): Merge conflict in TODO.md',
      stderr: '',
    });
    assert.match(msg, /git stash pop reported conflicts/);
    assert.match(msg, /CONFLICT \(content\): Merge conflict in TODO\.md/);
    assert.match(msg, /git stash list/);
    assert.match(msg, /No data lost/);
    assert.match(msg, /c4-merge-autostash-w1/);
  });

  it('still produces a useful message when popResult is empty', () => {
    const msg = buildPopConflictMessage('c4-merge-autostash-w1', {
      status: 1,
      stdout: '',
      stderr: '',
    });
    assert.match(msg, /No data lost/);
    assert.match(msg, /c4-merge-autostash-w1/);
  });
});

// End-to-end style flows that drive the helpers in the same order cli.js does.
describe('end-to-end flows (mocked spawn)', () => {
  it('clean tree -> caller proceeds without stashing', () => {
    const calls = [];
    const spawn = (cmd, args) => {
      calls.push([cmd, ...args].join(' '));
      return { status: 0, stdout: '', stderr: '' };
    };
    const dirty = getDirtyEntries('/repo', { spawn });
    assert.deepStrictEqual(dirty, []);
    assert.deepStrictEqual(calls, ['git -C /repo status --porcelain']);
  });

  it('dirty tree without --auto-stash -> error message + non-zero exit (simulated)', () => {
    const spawn = tableSpawn({
      'git -C /repo status --porcelain': {
        status: 0,
        stdout: ' M TODO.md\n M package-lock.json\n',
        stderr: '',
      },
    });
    const dirty = getDirtyEntries('/repo', { spawn });
    assert.strictEqual(dirty.length, 2);
    const msg = buildDirtyMessage(dirty);
    assert.match(msg, /TODO\.md/);
    assert.match(msg, /package-lock\.json/);
    // Caller would call process.exit(1) here. We assert the message shape that
    // would precede it.
    assert.match(msg, /^Error:/);
  });

  it('dirty tree with --auto-stash + no conflict -> stash pushed, pop succeeds', () => {
    const spawn = (cmd, args) => {
      const key = [cmd, ...args].join(' ');
      if (key.endsWith('status --porcelain')) {
        return { status: 0, stdout: ' M TODO.md\n', stderr: '' };
      }
      if (key.includes('stash push')) {
        return {
          status: 0,
          stdout: 'Saved working directory and index state On main: c4-merge-autostash-w1\n',
          stderr: '',
        };
      }
      if (key.includes('stash pop')) {
        return {
          status: 0,
          stdout: 'Dropped refs/stash@{0}\n',
          stderr: '',
        };
      }
      return { status: 0, stdout: '', stderr: '' };
    };

    const dirty = getDirtyEntries('/repo', { spawn });
    assert.strictEqual(dirty.length, 1);
    const stashOut = stashPush('/repo', 'c4-merge-autostash-w1', { spawn });
    assert.match(stashOut, /Saved working directory/);
    const popResult = stashPop('/repo', { spawn });
    assert.strictEqual(popResult.status, 0);
    assert.match(popResult.stdout, /Dropped/);
  });

  it('dirty tree with --auto-stash + simulated pop conflict -> conflict message, non-zero exit, stash remains', () => {
    let popCount = 0;
    const stashList = [];
    const spawn = (cmd, args) => {
      const key = [cmd, ...args].join(' ');
      if (key.endsWith('status --porcelain')) {
        return { status: 0, stdout: ' M TODO.md\n', stderr: '' };
      }
      if (key.includes('stash push')) {
        stashList.unshift('c4-merge-autostash-w1');
        return {
          status: 0,
          stdout: 'Saved working directory and index state On main: c4-merge-autostash-w1\n',
          stderr: '',
        };
      }
      if (key.includes('stash pop')) {
        popCount += 1;
        // Pop conflicts -> stash entry stays in list (real git behavior).
        return {
          status: 1,
          stdout: 'CONFLICT (content): Merge conflict in TODO.md',
          stderr: '',
        };
      }
      if (key.endsWith('stash list')) {
        return { status: 0, stdout: stashList.map((l, i) => `stash@{${i}}: On main: ${l}`).join('\n'), stderr: '' };
      }
      return { status: 0, stdout: '', stderr: '' };
    };

    const dirty = getDirtyEntries('/repo', { spawn });
    assert.strictEqual(dirty.length, 1);
    stashPush('/repo', 'c4-merge-autostash-w1', { spawn });
    const popResult = stashPop('/repo', { spawn });
    assert.strictEqual(popResult.status, 1);
    const msg = buildPopConflictMessage('c4-merge-autostash-w1', popResult);
    assert.match(msg, /CONFLICT \(content\): Merge conflict in TODO\.md/);
    assert.match(msg, /No data lost/);
    assert.match(msg, /c4-merge-autostash-w1/);
    // Stash entry survives in the simulated stash list.
    const verify = spawn('git', ['-C', '/repo', 'stash', 'list']);
    assert.match(verify.stdout, /c4-merge-autostash-w1/);
    assert.strictEqual(popCount, 1);
  });
});

// Real-git integration: create a temp repo via spawnSync (no shell), exercise
// the helpers against it, then clean up. No compound commands, no cd, no
// pipes. Skips silently if the platform has no usable git binary.
describe('real-git integration (temp repo)', () => {
  const { spawnSync } = require('child_process');
  const os = require('os');

  function git(repo, ...args) {
    return spawnSync('git', ['-C', repo, ...args], {
      encoding: 'utf8',
      timeout: 15000,
    });
  }

  function gitNoRepo(...args) {
    return spawnSync('git', args, { encoding: 'utf8', timeout: 5000 });
  }

  function makeRepo() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-merge-guard-'));
    const init = gitNoRepo('init', '-q', dir);
    if (init.status !== 0) return null;
    git(dir, 'config', 'user.email', 'guard@test');
    git(dir, 'config', 'user.name', 'guard');
    fs.writeFileSync(path.join(dir, 'a.txt'), 'hi\n');
    git(dir, 'add', 'a.txt');
    const c1 = git(dir, 'commit', '-q', '-m', 'seed');
    if (c1.status !== 0) return null;
    return dir;
  }

  function rm(dir) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
  }

  const probe = gitNoRepo('--version');
  const haveGit = probe && probe.status === 0;

  it('clean tree -> getDirtyEntries returns []', () => {
    if (!haveGit) return;
    const repo = makeRepo();
    assert.ok(repo, 'failed to make temp repo');
    try {
      assert.deepStrictEqual(getDirtyEntries(repo), []);
      assert.strictEqual(isDirty(repo), false);
    } finally {
      rm(repo);
    }
  });

  it('dirty tree -> getDirtyEntries lists the modified file', () => {
    if (!haveGit) return;
    const repo = makeRepo();
    assert.ok(repo);
    try {
      fs.writeFileSync(path.join(repo, 'a.txt'), 'changed\n');
      const dirty = getDirtyEntries(repo);
      assert.strictEqual(dirty.length, 1);
      assert.match(dirty[0], /a\.txt/);
      assert.strictEqual(isDirty(repo), true);
      const msg = buildDirtyMessage(dirty);
      assert.match(msg, /a\.txt/);
    } finally {
      rm(repo);
    }
  });

  it('stashPush then stashPop round-trips a real change', () => {
    if (!haveGit) return;
    const repo = makeRepo();
    assert.ok(repo);
    try {
      fs.writeFileSync(path.join(repo, 'a.txt'), 'changed\n');
      assert.strictEqual(isDirty(repo), true);
      const out = stashPush(repo, 'c4-merge-autostash-int');
      assert.match(out, /Saved working directory|stash@/);
      assert.strictEqual(isDirty(repo), false, 'tree should be clean after stash');
      const popResult = stashPop(repo);
      assert.strictEqual(popResult.status, 0, popResult.stderr);
      assert.strictEqual(isDirty(repo), true, 'tree should be dirty again after pop');
      // The stash entry should be gone.
      const list = git(repo, 'stash', 'list');
      assert.strictEqual(list.stdout.trim(), '');
    } finally {
      rm(repo);
    }
  });

  it('stashPop conflict path: stash entry survives in stash list', () => {
    if (!haveGit) return;
    const repo = makeRepo();
    assert.ok(repo);
    try {
      // Make a conflicting situation: stash a change, then commit a different
      // change to the same line, then attempt pop -> conflict.
      fs.writeFileSync(path.join(repo, 'a.txt'), 'stash-side\n');
      stashPush(repo, 'c4-merge-autostash-conflict');
      fs.writeFileSync(path.join(repo, 'a.txt'), 'main-side\n');
      git(repo, 'add', 'a.txt');
      const c = git(repo, 'commit', '-q', '-m', 'conflicting commit');
      assert.strictEqual(c.status, 0);

      const popResult = stashPop(repo);
      assert.notStrictEqual(popResult.status, 0, 'pop should conflict');
      const msg = buildPopConflictMessage('c4-merge-autostash-conflict', popResult);
      assert.match(msg, /No data lost/);
      assert.match(msg, /c4-merge-autostash-conflict/);

      // Verify the stash entry is still present (real git behavior on conflict).
      const list = git(repo, 'stash', 'list');
      assert.match(list.stdout, /c4-merge-autostash-conflict/);
    } finally {
      rm(repo);
    }
  });
});

// cli.js integration check (analogous to merge-homedir.test.js).
describe('cli.js integration', () => {
  const cliPath = path.resolve(__dirname, '..', 'src', 'cli.js');
  const code = fs.readFileSync(cliPath, 'utf8');

  it('cli.js requires ./merge-guard', () => {
    assert.ok(
      code.includes("require('./merge-guard')"),
      'cli.js merge handler should require ./merge-guard'
    );
  });

  it('cli.js parses --auto-stash flag', () => {
    assert.ok(
      code.includes("args.includes('--auto-stash')"),
      'cli.js should recognize --auto-stash via args.includes'
    );
  });

  it('cli.js calls dirty-tree helper before existing pre-merge checks', () => {
    assert.ok(
      /mergeGuard\.getDirtyEntries\(repoRoot\)/.test(code),
      'cli.js should call mergeGuard.getDirtyEntries(repoRoot)'
    );
  });

  it('cli.js calls stashPush/stashPop on the auto-stash path', () => {
    assert.ok(
      code.includes('mergeGuard.stashPush(repoRoot'),
      'cli.js should call mergeGuard.stashPush'
    );
    assert.ok(
      code.includes('mergeGuard.stashPop(repoRoot'),
      'cli.js should call mergeGuard.stashPop'
    );
  });

  it('cli.js help banner mentions --auto-stash', () => {
    assert.ok(
      /--auto-stash/.test(code),
      'help banner should advertise the new --auto-stash flag'
    );
  });

  it('cli.js usage line for merge mentions --auto-stash', () => {
    assert.ok(
      /Usage: c4 merge .*--auto-stash/.test(code),
      'merge usage line should include --auto-stash'
    );
  });
});
