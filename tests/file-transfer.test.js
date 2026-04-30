// Tests for src/file-transfer.js (TODO 9.8: machine-to-machine file transfer).
//
// Covers:
//   - buildRsyncArgs: -avzP + --info=progress2 + --exclude / --delete
//   - buildSshCommand + buildSshTarget: port / user / default opts
//   - normalizeExcludes: rejects shell metacharacters
//   - parseRsyncProgress: real-world --info=progress2 sample output
//   - parseRsyncFileLine: ignores indented + status lines
//   - validateSrcPath: allowed roots, traversal, shell metacharacters,
//     ALWAYS_DENY system prefixes, allowSystem bypass
//   - validateDestPath: absolute-path guard, traversal, shell metachars
//   - resolveMachine: reads fleet entry, surfaces ssh* overrides
//   - buildGitPushArgs: -C localRepo + push <alias>:<remoteRepo> branch
//     + --force-with-lease never plain --force
//   - buildGitEnv: GIT_SSH_COMMAND carries BatchMode + port
//   - transferFiles: spawn invoked with rsync + built args, progress
//     callback drained from piped stdout, onComplete on exit 0, onError
//     on 'error' event
//   - pushRepo: spawn invoked with git + built args, env includes
//     GIT_SSH_COMMAND, progress streamed from stderr (git push convention)
//   - daemon + cli source-grep wiring

'use strict';

const assert = require('assert');
const { describe, it } = require('node:test');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ft = require('../src/file-transfer');

// ---- fakes ----------------------------------------------------------------

function makeFakeChild() {
  const child = new EventEmitter();
  child.pid = 1234;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  return child;
}

function makeFakeSpawn(capture) {
  return function fakeSpawn(cmd, args, opts) {
    const child = makeFakeChild();
    capture.push({ cmd, args: args.slice(), opts });
    // Return synchronously; tests can emit stdout/stderr/exit/error after.
    capture.lastChild = child;
    return child;
  };
}

// ---- basic validation -----------------------------------------------------

describe('validateAlias', () => {
  it('accepts standard fleet-style aliases', () => {
    assert.strictEqual(ft.validateAlias('dgx'), 'dgx');
    assert.strictEqual(ft.validateAlias('gpu-1'), 'gpu-1');
    assert.strictEqual(ft.validateAlias('worker_01'), 'worker_01');
  });
  it('rejects empty / non-string', () => {
    assert.throws(() => ft.validateAlias(''), /non-empty/);
    assert.throws(() => ft.validateAlias(null), /non-empty/);
    assert.throws(() => ft.validateAlias(5), /non-empty/);
  });
  it('rejects shell-unsafe chars', () => {
    assert.throws(() => ft.validateAlias('has space'), /invalid alias/);
    assert.throws(() => ft.validateAlias('with;semi'), /invalid alias/);
  });
});

describe('hasShellMetachars', () => {
  it('detects shell metacharacters (command chaining, substitution, quoting)', () => {
    assert.strictEqual(ft.hasShellMetachars('a;b'), true);
    assert.strictEqual(ft.hasShellMetachars('$(whoami)'), true);
    assert.strictEqual(ft.hasShellMetachars('a|b'), true);
    assert.strictEqual(ft.hasShellMetachars('a`b`c'), true);
    assert.strictEqual(ft.hasShellMetachars('foo && bar'), true);
    assert.strictEqual(ft.hasShellMetachars("o'quote"), true);
  });
  it('accepts plain paths (spaces, dashes, slashes are not metachars)', () => {
    assert.strictEqual(ft.hasShellMetachars('/root/project/file.txt'), false);
    assert.strictEqual(ft.hasShellMetachars('src-v1.tar.gz'), false);
    // globs are rejected for full paths (shell would expand) but allowed
    // by normalizeExcludes which passes them to rsync as argv tokens.
    assert.strictEqual(ft.hasShellMetachars('*.tmp'), true);
    assert.strictEqual(ft.hasShellMetachars('a?b'), true);
  });
});

// ---- path guards ----------------------------------------------------------

describe('validateSrcPath', () => {
  it('accepts paths under allowed roots (default /root + cwd)', () => {
    const resolved = ft.validateSrcPath('/root/project/file.txt', { home: '/root' });
    assert.strictEqual(resolved, '/root/project/file.txt');
  });
  it('accepts paths under cwd when projectRoot points at cwd', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-ft-src-'));
    try {
      const resolved = ft.validateSrcPath(path.join(tmp, 'a.bin'), {
        home: '/nowhere',
        projectRoot: tmp,
      });
      assert.strictEqual(resolved, path.join(tmp, 'a.bin'));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
  it('rejects paths outside allowed roots without allowSystem', () => {
    assert.throws(
      () => ft.validateSrcPath('/var/log/syslog', { home: '/root', projectRoot: '/root/c4' }),
      /outside allowed roots/
    );
  });
  it('rejects traversal that escapes the allowed root even after resolve', () => {
    // Resolving /root/../etc yields /etc which is an always-deny prefix.
    assert.throws(
      () => ft.validateSrcPath('/root/../etc/passwd', { home: '/root' }),
      /protected system path|outside allowed roots/
    );
  });
  it('always denies system prefixes even with allowSystem', () => {
    assert.throws(
      () => ft.validateSrcPath('/etc/passwd', { allowSystem: true }),
      /protected system path/
    );
    assert.throws(
      () => ft.validateSrcPath('/dev/sda', { allowSystem: true }),
      /protected system path/
    );
  });
  it('allowSystem bypasses allowed-root check for non-deny paths', () => {
    const resolved = ft.validateSrcPath('/var/tmp/artifact.bin', { allowSystem: true });
    assert.strictEqual(resolved, '/var/tmp/artifact.bin');
  });
  it('rejects shell metacharacters in src', () => {
    assert.throws(
      () => ft.validateSrcPath('/root/a;rm -rf .', {}),
      /shell metacharacters/
    );
  });
  it('rejects empty / non-string', () => {
    assert.throws(() => ft.validateSrcPath('', {}), /non-empty/);
    assert.throws(() => ft.validateSrcPath(null, {}), /non-empty/);
  });
});

describe('validateDestPath', () => {
  it('accepts relative remote paths', () => {
    assert.strictEqual(ft.validateDestPath('projects/arps/data', {}), 'projects/arps/data');
    assert.strictEqual(ft.validateDestPath('data/', {}), 'data/');
  });
  it('rejects absolute paths without allowSystem', () => {
    assert.throws(() => ft.validateDestPath('/home/shinc/arps', {}), /absolute remote path/);
  });
  it('accepts absolute paths with allowSystem', () => {
    assert.strictEqual(
      ft.validateDestPath('/home/shinc/arps', { allowSystem: true }),
      '/home/shinc/arps'
    );
  });
  it('rejects .. traversal in any segment', () => {
    assert.throws(() => ft.validateDestPath('arps/../../etc', {}), /traversal/);
  });
  it('rejects shell metacharacters in dest', () => {
    assert.throws(() => ft.validateDestPath('arps;rm', {}), /shell metacharacters/);
  });
});

describe('validateRemoteRepoPath', () => {
  it('accepts relative repo paths', () => {
    assert.strictEqual(
      ft.validateRemoteRepoPath('repos/arps.git', {}),
      'repos/arps.git'
    );
  });
  it('rejects absolute paths without allowSystem', () => {
    assert.throws(
      () => ft.validateRemoteRepoPath('/srv/git/arps.git', {}),
      /absolute remote path/
    );
  });
  it('rejects traversal', () => {
    assert.throws(
      () => ft.validateRemoteRepoPath('repos/../../etc', {}),
      /traversal/
    );
  });
});

describe('isPathTraversal', () => {
  it('flags .. segments and leaves clean paths alone', () => {
    assert.strictEqual(ft.isPathTraversal('a/../b'), true);
    assert.strictEqual(ft.isPathTraversal('../up'), true);
    assert.strictEqual(ft.isPathTraversal('a/b/c'), false);
    assert.strictEqual(ft.isPathTraversal(''), false);
    assert.strictEqual(ft.isPathTraversal(null), false);
  });
});

// ---- rsync args -----------------------------------------------------------

describe('buildSshCommand', () => {
  it('produces BatchMode + StrictHostKeyChecking opts', () => {
    const cmd = ft.buildSshCommand({ host: 'dgx' });
    assert.ok(cmd.includes('BatchMode=yes'), 'BatchMode=yes missing');
    assert.ok(cmd.includes('StrictHostKeyChecking=accept-new'), 'Strict missing');
    assert.ok(cmd.startsWith('ssh '), 'must start with ssh');
  });
  it('adds -p when sshPort is given', () => {
    const cmd = ft.buildSshCommand({ host: 'dgx', sshPort: 2222 });
    assert.ok(/-p 2222/.test(cmd), `expected -p 2222 in ${cmd}`);
  });
  it('rejects invalid sshPort', () => {
    assert.throws(() => ft.buildSshCommand({ host: 'h', sshPort: 99999 }), /invalid sshPort/);
    assert.throws(() => ft.buildSshCommand({ host: 'h', sshPort: -1 }), /invalid sshPort/);
  });
});

describe('buildSshTarget', () => {
  it('returns host alone when no user', () => {
    assert.strictEqual(ft.buildSshTarget({ host: 'dgx' }), 'dgx');
  });
  it('returns user@host when user present', () => {
    assert.strictEqual(
      ft.buildSshTarget({ host: '192.168.10.222', sshUser: 'shinc' }),
      'shinc@192.168.10.222'
    );
  });
  it('prefers sshHost over host', () => {
    assert.strictEqual(
      ft.buildSshTarget({ host: '10.0.0.1', sshHost: 'dgx.lan' }),
      'dgx.lan'
    );
  });
  it('rejects shell-unsafe host', () => {
    assert.throws(
      () => ft.buildSshTarget({ host: 'h$(whoami)' }),
      /unsafe characters/
    );
  });
});

describe('normalizeExcludes', () => {
  it('returns [] for null / undefined', () => {
    assert.deepStrictEqual(ft.normalizeExcludes(null), []);
    assert.deepStrictEqual(ft.normalizeExcludes(undefined), []);
  });
  it('trims and keeps valid patterns', () => {
    assert.deepStrictEqual(
      ft.normalizeExcludes(['*.tmp', ' node_modules ', 'build/']),
      ['*.tmp', 'node_modules', 'build/']
    );
  });
  it('rejects non-array input', () => {
    assert.throws(() => ft.normalizeExcludes('*.tmp'), /array of strings/);
  });
  it('rejects metachars in pattern', () => {
    assert.throws(() => ft.normalizeExcludes(['bad;rm']), /shell metacharacters/);
  });
});

describe('buildRsyncArgs', () => {
  const machine = { host: '192.168.10.222', sshUser: 'shinc' };

  it('includes -a -v -z -P + --info=progress2 by default', () => {
    const args = ft.buildRsyncArgs({
      src: '/root/project',
      dest: 'project',
      machine,
    });
    assert.ok(args.includes('-a'));
    assert.ok(args.includes('-v'));
    assert.ok(args.includes('-z'));
    assert.ok(args.includes('-P'));
    assert.ok(args.includes('--info=progress2'));
  });

  it('appends --delete when requested', () => {
    const args = ft.buildRsyncArgs({
      src: '/root/project',
      dest: 'project',
      machine,
      delete: true,
    });
    assert.ok(args.includes('--delete'));
  });

  it('omits --delete by default', () => {
    const args = ft.buildRsyncArgs({
      src: '/root/project',
      dest: 'project',
      machine,
    });
    assert.ok(!args.includes('--delete'), `--delete should not be present: ${args}`);
  });

  it('emits --exclude <pattern> per entry in opts.excludes', () => {
    const args = ft.buildRsyncArgs({
      src: '/root/project',
      dest: 'project',
      machine,
      excludes: ['node_modules', '.git', '*.log'],
    });
    const pairs = [];
    for (let i = 0; i < args.length - 1; i++) {
      if (args[i] === '--exclude') pairs.push(args[i + 1]);
    }
    assert.deepStrictEqual(pairs, ['node_modules', '.git', '*.log']);
  });

  it('passes -e "ssh BatchMode ..." and the user@host:dest target', () => {
    const args = ft.buildRsyncArgs({
      src: '/root/project/file.bin',
      dest: 'incoming/',
      machine: { host: 'dgx.lan', sshUser: 'shinc', sshPort: 2222 },
    });
    const eIdx = args.indexOf('-e');
    assert.ok(eIdx >= 0, '-e missing');
    const sshCmd = args[eIdx + 1];
    assert.ok(sshCmd.startsWith('ssh '), 'ssh cmd must start with ssh');
    assert.ok(/-p 2222/.test(sshCmd), '-p 2222 expected');
    // last two tokens: src, user@host:dest
    assert.strictEqual(args[args.length - 2], '/root/project/file.bin');
    assert.strictEqual(args[args.length - 1], 'shinc@dgx.lan:incoming/');
  });

  it('adds -n for dry-run', () => {
    const args = ft.buildRsyncArgs({
      src: '/root/project',
      dest: 'project',
      machine,
      dryRun: true,
    });
    assert.ok(args.includes('-n'));
  });

  it('rejects missing fields', () => {
    assert.throws(() => ft.buildRsyncArgs({ dest: 'd', machine }), /src is required/);
    assert.throws(() => ft.buildRsyncArgs({ src: 's', machine }), /dest is required/);
    assert.throws(() => ft.buildRsyncArgs({ src: 's', dest: 'd' }), /machine is required/);
  });
});

// ---- progress parsing -----------------------------------------------------

describe('parseRsyncProgress', () => {
  it('parses the progress2 cumulative line', () => {
    const out = ft.parseRsyncProgress('     32,768  25%   32.68MB/s    0:00:00');
    assert.strictEqual(out.bytes, 32768);
    assert.strictEqual(out.percent, 25);
    assert.strictEqual(out.bytesPerSec, '32.68MB/s');
    assert.strictEqual(out.eta, '0:00:00');
  });

  it('parses a 100% completed line', () => {
    const out = ft.parseRsyncProgress('    102,400 100%  100.23MB/s    0:00:02');
    assert.strictEqual(out.percent, 100);
    assert.strictEqual(out.bytes, 102400);
  });

  it('returns null for non-progress lines', () => {
    assert.strictEqual(ft.parseRsyncProgress(''), null);
    assert.strictEqual(ft.parseRsyncProgress('sending incremental file list'), null);
    assert.strictEqual(ft.parseRsyncProgress('file1.txt'), null);
    assert.strictEqual(ft.parseRsyncProgress(null), null);
  });
});

describe('parseRsyncFileLine', () => {
  it('picks out filename-only lines', () => {
    assert.strictEqual(ft.parseRsyncFileLine('src/file.bin'), 'src/file.bin');
    assert.strictEqual(ft.parseRsyncFileLine('README.md'), 'README.md');
  });
  it('rejects indented / progress / status lines', () => {
    assert.strictEqual(ft.parseRsyncFileLine('     32,768  25%   32.68MB/s    0:00:00'), null);
    assert.strictEqual(ft.parseRsyncFileLine('sending incremental file list'), null);
    assert.strictEqual(ft.parseRsyncFileLine('sent 123 bytes  received 45 bytes  1234.56 bytes/sec'), null);
    assert.strictEqual(ft.parseRsyncFileLine('total size is 1234  speedup is 1.00'), null);
    assert.strictEqual(ft.parseRsyncFileLine(''), null);
  });
});

// ---- resolveMachine -------------------------------------------------------

describe('resolveMachine', () => {
  it('surfaces fleet-stored machine info as the machine payload', () => {
    const fakeFleet = {
      getMachine(alias) {
        if (alias !== 'dgx') return null;
        return {
          alias: 'dgx',
          host: '192.168.10.222',
          port: 3456,
          authToken: 'T',
          tags: ['gpu'],
        };
      },
    };
    const m = ft.resolveMachine('dgx', { fleet: fakeFleet });
    assert.strictEqual(m.alias, 'dgx');
    assert.strictEqual(m.host, '192.168.10.222');
    assert.strictEqual(m.sshHost, '192.168.10.222'); // falls back to host
    assert.deepStrictEqual(m.tags, ['gpu']);
  });
  it('uses sshHost / sshUser / sshPort overrides when the row carries them', () => {
    const fakeFleet = {
      getMachine() {
        return {
          alias: 'dgx',
          host: '192.168.10.222',
          port: 3456,
          sshHost: 'dgx.lan',
          sshUser: 'shinc',
          sshPort: 2222,
        };
      },
    };
    const m = ft.resolveMachine('dgx', { fleet: fakeFleet });
    assert.strictEqual(m.sshHost, 'dgx.lan');
    assert.strictEqual(m.sshUser, 'shinc');
    assert.strictEqual(m.sshPort, 2222);
  });
  it('throws when alias missing in fleet', () => {
    const fakeFleet = { getMachine: () => null };
    assert.throws(() => ft.resolveMachine('ghost', { fleet: fakeFleet }), /not found in fleet/);
  });
});

// ---- git push arg building ------------------------------------------------

describe('buildGitPushArgs', () => {
  it('produces "-C <local> push <alias>:<remote> <branch>"', () => {
    const args = ft.buildGitPushArgs({
      machine: { host: 'dgx.lan', sshUser: 'shinc' },
      localRepoPath: '/root/c4-worktree-foo',
      remoteRepoPath: 'repos/c4.git',
      branch: 'c4/file-transfer',
    });
    assert.deepStrictEqual(args, [
      '-C', '/root/c4-worktree-foo',
      'push',
      'shinc@dgx.lan:repos/c4.git',
      'c4/file-transfer',
    ]);
  });
  it('never passes plain --force; maps force=true to --force-with-lease', () => {
    const args = ft.buildGitPushArgs({
      machine: { host: 'dgx' },
      localRepoPath: '/root/repo',
      remoteRepoPath: 'repos/x.git',
      branch: 'main',
      force: true,
    });
    assert.ok(args.includes('--force-with-lease'), '--force-with-lease missing');
    assert.ok(!args.includes('--force'), 'plain --force must never appear');
  });
  it('omits branch arg when branch is empty', () => {
    const args = ft.buildGitPushArgs({
      machine: { host: 'dgx' },
      localRepoPath: '/root/repo',
      remoteRepoPath: 'repos/x.git',
    });
    // last arg should be remote url, no extra branch
    assert.strictEqual(args[args.length - 1], 'dgx:repos/x.git');
  });
  it('rejects shell metacharacters in branch or localRepoPath', () => {
    assert.throws(() => ft.buildGitPushArgs({
      machine: { host: 'dgx' },
      localRepoPath: '/root/repo',
      remoteRepoPath: 'repos/x.git',
      branch: 'main;rm',
    }), /shell metacharacters/);
    assert.throws(() => ft.buildGitPushArgs({
      machine: { host: 'dgx' },
      localRepoPath: '/root/repo$(x)',
      remoteRepoPath: 'repos/x.git',
    }), /shell metacharacters/);
  });
  it('requires machine, localRepoPath, remoteRepoPath', () => {
    assert.throws(() => ft.buildGitPushArgs({
      localRepoPath: '/root/repo', remoteRepoPath: 'r',
    }), /machine is required/);
    assert.throws(() => ft.buildGitPushArgs({
      machine: { host: 'dgx' }, remoteRepoPath: 'r',
    }), /localRepoPath is required/);
    assert.throws(() => ft.buildGitPushArgs({
      machine: { host: 'dgx' }, localRepoPath: '/root/repo',
    }), /remoteRepoPath is required/);
  });
});

describe('buildGitEnv', () => {
  it('assembles GIT_SSH_COMMAND with BatchMode', () => {
    const env = ft.buildGitEnv({ host: 'dgx' });
    assert.ok(env.GIT_SSH_COMMAND.startsWith('ssh '));
    assert.ok(/BatchMode=yes/.test(env.GIT_SSH_COMMAND));
    assert.ok(/StrictHostKeyChecking=accept-new/.test(env.GIT_SSH_COMMAND));
  });
  it('threads -p <port> into GIT_SSH_COMMAND', () => {
    const env = ft.buildGitEnv({ host: 'dgx', sshPort: 2222 });
    assert.ok(/-p 2222/.test(env.GIT_SSH_COMMAND));
  });
});

// ---- transferFiles driver -------------------------------------------------

describe('transferFiles', () => {
  const machine = { host: 'dgx.lan', sshUser: 'shinc' };

  it('invokes spawn("rsync", args) with the full arg list + exposes pid', () => {
    const capture = [];
    const spawn = makeFakeSpawn(capture);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-ft-tx-'));
    try {
      const srcPath = path.join(tmp, 'a.bin');
      fs.writeFileSync(srcPath, 'hello');
      const handle = ft.transferFiles(srcPath, 'remote/', {
        machine,
        excludes: ['*.tmp'],
        delete: true,
        allowSystem: false,
        projectRoot: tmp,
        home: '/nowhere',
        spawn,
      });
      assert.strictEqual(handle.started, true);
      assert.strictEqual(handle.pid, 1234);
      assert.strictEqual(capture.length, 1);
      assert.strictEqual(capture[0].cmd, 'rsync');
      const args = capture[0].args;
      assert.ok(args.includes('--delete'));
      assert.ok(args.includes('--exclude'));
      assert.ok(args.includes('*.tmp'));
      assert.ok(args.includes('-P'));
      assert.ok(args.includes('--info=progress2'));
      assert.strictEqual(args[args.length - 1], 'shinc@dgx.lan:remote/');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('emits onProgress for filename + progress lines from stdout', () => {
    const capture = [];
    const events = [];
    const spawn = makeFakeSpawn(capture);
    // /root/project assumes the test runs as root; allowSystem skips the
    // home/cwd allow-list check so the test passes for any user.
    const handle = ft.transferFiles('/root/project', 'dest/', {
      machine,
      spawn,
      allowSystem: true,
      onProgress: (ev) => events.push(ev),
    });
    const child = capture.lastChild;
    child.stdout.emit('data', 'src/a.bin\n');
    child.stdout.emit('data', '     32,768  25%   32.68MB/s    0:00:00\n');
    child.stdout.emit('data', '    102,400 100%  100.23MB/s    0:00:02\n');
    assert.strictEqual(events.length, 3);
    assert.deepStrictEqual(events[0], { type: 'file', file: 'src/a.bin' });
    assert.strictEqual(events[1].type, 'progress');
    assert.strictEqual(events[1].percent, 25);
    assert.strictEqual(events[1].file, 'src/a.bin');
    assert.strictEqual(events[2].percent, 100);
    assert.ok(handle); // drained via handle.child via capture.lastChild
  });

  it('fires onComplete on exit and onError on error', () => {
    const capture = [];
    const spawn = makeFakeSpawn(capture);
    let completed = null;
    let errored = null;
    ft.transferFiles('/root/project', 'dest/', {
      machine,
      spawn,
      allowSystem: true,
      onComplete: (info) => { completed = info; },
      onError: (err) => { errored = err; },
    });
    const child = capture.lastChild;
    child.emit('exit', 0, null);
    assert.strictEqual(completed.ok, true);
    assert.strictEqual(completed.code, 0);
    child.emit('error', new Error('rsync missing'));
    assert.strictEqual(errored.message, 'rsync missing');
  });

  it('refuses src outside allowed roots before spawning', () => {
    const capture = [];
    const spawn = makeFakeSpawn(capture);
    assert.throws(() => ft.transferFiles('/var/log/syslog', 'dest/', {
      machine,
      spawn,
      home: '/root',
      projectRoot: '/root/c4',
    }), /outside allowed roots/);
    assert.strictEqual(capture.length, 0, 'spawn must NOT run when guard rejects');
  });
});

// ---- pushRepo driver ------------------------------------------------------

describe('pushRepo', () => {
  const machine = { host: 'dgx.lan', sshUser: 'shinc' };

  it('invokes spawn("git", [-C repo, push, url, branch]) with GIT_SSH_COMMAND env', () => {
    const capture = [];
    const spawn = makeFakeSpawn(capture);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-ft-push-'));
    try {
      const handle = ft.pushRepo(machine, tmp, 'c4/file-transfer', {
        remoteRepoPath: 'repos/c4.git',
        projectRoot: tmp,
        home: '/nowhere',
        spawn,
      });
      assert.strictEqual(handle.started, true);
      assert.strictEqual(capture[0].cmd, 'git');
      assert.deepStrictEqual(capture[0].args.slice(0, 2), ['-C', tmp]);
      assert.strictEqual(capture[0].args[2], 'push');
      assert.strictEqual(capture[0].args[3], 'shinc@dgx.lan:repos/c4.git');
      assert.strictEqual(capture[0].args[4], 'c4/file-transfer');
      assert.ok(capture[0].opts.env.GIT_SSH_COMMAND.includes('BatchMode=yes'));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('streams progress from stderr (git push convention)', () => {
    const capture = [];
    const events = [];
    const spawn = makeFakeSpawn(capture);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-ft-push2-'));
    try {
      ft.pushRepo(machine, tmp, 'main', {
        remoteRepoPath: 'repos/c4.git',
        projectRoot: tmp,
        home: '/nowhere',
        spawn,
        onProgress: (ev) => events.push(ev),
      });
      const child = capture.lastChild;
      child.stderr.emit('data', 'Counting objects: 5, done.\n');
      child.stderr.emit('data', 'Writing objects: 100% (5/5), done.\n');
      assert.strictEqual(events.length, 2);
      assert.strictEqual(events[0].type, 'git');
      assert.ok(events[0].line.includes('Counting objects'));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('refuses localRepoPath outside allowed roots', () => {
    const capture = [];
    const spawn = makeFakeSpawn(capture);
    assert.throws(() => ft.pushRepo(machine, '/var/otherrepo', 'main', {
      remoteRepoPath: 'repos/x.git',
      home: '/root',
      projectRoot: '/root/c4',
      spawn,
    }), /outside allowed roots/);
    assert.strictEqual(capture.length, 0);
  });
});

// ---- daemon + cli wiring --------------------------------------------------

describe('daemon + cli wiring', () => {
  const daemonSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'daemon.js'), 'utf8');
  const cliSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'cli.js'), 'utf8');

  it('daemon.js imports file-transfer module', () => {
    assert.ok(/require\('\.\/file-transfer'\)/.test(daemonSrc), 'require(./file-transfer) missing');
  });

  it('daemon.js exposes POST /transfer', () => {
    assert.ok(/route === '\/transfer'/.test(daemonSrc), '/transfer route missing');
    assert.ok(/fileTransfer\.transferFiles\(/.test(daemonSrc), 'transferFiles call missing');
    assert.ok(/fileTransfer\.pushRepo\(/.test(daemonSrc), 'pushRepo call missing');
    assert.ok(/fileTransfer\.resolveMachine\(/.test(daemonSrc), 'resolveMachine call missing');
  });

  it('daemon.js emits SSE transfer-progress / transfer-complete / transfer-error', () => {
    assert.ok(/transfer-progress/.test(daemonSrc), 'transfer-progress event missing');
    assert.ok(/transfer-complete/.test(daemonSrc), 'transfer-complete event missing');
    assert.ok(/transfer-error/.test(daemonSrc), 'transfer-error event missing');
  });

  it('cli.js exposes send-file + push-repo subcommands', () => {
    assert.ok(/case 'send-file':/.test(cliSrc), 'send-file case missing');
    assert.ok(/case 'push-repo':/.test(cliSrc), 'push-repo case missing');
    assert.ok(/\/transfer/.test(cliSrc), '/transfer endpoint missing');
  });

  it('cli.js send-file accepts --delete + --exclude + --allow-system', () => {
    assert.ok(/--delete/.test(cliSrc), '--delete flag missing');
    assert.ok(/--exclude/.test(cliSrc), '--exclude flag missing');
    assert.ok(/--allow-system/.test(cliSrc), '--allow-system flag missing');
  });

  it('cli.js push-repo accepts --remote-repo + --force', () => {
    assert.ok(/--remote-repo/.test(cliSrc), '--remote-repo flag missing');
    assert.ok(/--force/.test(cliSrc), '--force flag missing');
  });

  it('cli.js help text documents send-file + push-repo', () => {
    assert.ok(/send-file <alias>/.test(cliSrc), 'send-file help line missing');
    assert.ok(/push-repo <alias>/.test(cliSrc), 'push-repo help line missing');
  });
});
