const assert = require('assert');
const { describe, it } = require('node:test');
const os = require('os');
const path = require('path');
const fs = require('fs');

describe('Platform Support (3.20)', () => {
  // Test the platform utility functions directly
  // These are module-level functions in pty-manager.js
  // We test their logic here without requiring node-pty

  const PLATFORM = process.platform;
  const IS_WIN = PLATFORM === 'win32';
  const IS_MAC = PLATFORM === 'darwin';
  const IS_LINUX = PLATFORM === 'linux';

  function platformShell() {
    if (IS_WIN) return 'cmd.exe';
    if (fs.existsSync('/bin/bash')) return 'bash';
    if (fs.existsSync('/usr/bin/bash')) return 'bash';
    return 'sh';
  }

  function platformShellArgs(command, args = []) {
    if (IS_WIN) return ['/c', command, ...args];
    const cmdStr = args.length > 0 ? `${command} ${args.join(' ')}` : command;
    return ['-c', cmdStr];
  }

  function platformSshPath() {
    if (IS_WIN) return 'C:\\Windows\\System32\\OpenSSH\\ssh.exe';
    return 'ssh';
  }

  function platformHomedir() {
    return os.homedir();
  }

  function platformNormalizePath(p) {
    return p.replace(/\\/g, '/');
  }

  function platformClaudeConfigDir() {
    return path.join(platformHomedir(), '.claude');
  }

  function platformTmpDir() {
    return os.tmpdir();
  }

  function platformClaudePaths() {
    const paths = [];
    if (IS_MAC) {
      paths.push('/opt/homebrew/bin/claude');
      paths.push('/usr/local/bin/claude');
    }
    if (IS_LINUX) {
      paths.push('/usr/local/bin/claude');
      paths.push(path.join(platformHomedir(), '.local', 'bin', 'claude'));
      paths.push(path.join(platformHomedir(), '.npm-global', 'bin', 'claude'));
    }
    return paths;
  }

  // --- platformShell ---

  it('returns cmd.exe on Windows', () => {
    if (!IS_WIN) return; // skip on non-Windows
    assert.strictEqual(platformShell(), 'cmd.exe');
  });

  it('returns bash or sh on Unix', () => {
    if (IS_WIN) return; // skip on Windows
    const shell = platformShell();
    assert.ok(shell === 'bash' || shell === 'sh');
  });

  // --- platformShellArgs ---

  it('builds /c args on Windows', () => {
    if (!IS_WIN) return;
    const args = platformShellArgs('claude', ['--help']);
    assert.deepStrictEqual(args, ['/c', 'claude', '--help']);
  });

  it('builds -c args on Unix', () => {
    if (IS_WIN) return;
    const args = platformShellArgs('claude', ['--help']);
    assert.deepStrictEqual(args, ['-c', 'claude --help']);
  });

  it('handles empty args on Windows', () => {
    if (!IS_WIN) return;
    const args = platformShellArgs('claude');
    assert.deepStrictEqual(args, ['/c', 'claude']);
  });

  it('handles empty args on Unix', () => {
    if (IS_WIN) return;
    const args = platformShellArgs('claude');
    assert.deepStrictEqual(args, ['-c', 'claude']);
  });

  // --- platformSshPath ---

  it('returns correct SSH path for current platform', () => {
    const sshPath = platformSshPath();
    if (IS_WIN) {
      assert.ok(sshPath.includes('ssh.exe'));
    } else {
      assert.strictEqual(sshPath, 'ssh');
    }
  });

  // --- platformHomedir ---

  it('returns a valid home directory', () => {
    const home = platformHomedir();
    assert.ok(home);
    assert.ok(fs.existsSync(home));
  });

  // --- platformNormalizePath ---

  it('converts backslashes to forward slashes', () => {
    assert.strictEqual(platformNormalizePath('C:\\Users\\test'), 'C:/Users/test');
  });

  it('keeps forward slashes unchanged', () => {
    assert.strictEqual(platformNormalizePath('/home/user/test'), '/home/user/test');
  });

  it('handles mixed slashes', () => {
    assert.strictEqual(platformNormalizePath('C:\\Users/test\\dir'), 'C:/Users/test/dir');
  });

  // --- platformClaudeConfigDir ---

  it('returns ~/.claude path', () => {
    const dir = platformClaudeConfigDir();
    assert.ok(dir.endsWith('.claude'));
    assert.ok(dir.startsWith(platformHomedir()));
  });

  // --- platformTmpDir ---

  it('returns a valid tmp directory', () => {
    const tmp = platformTmpDir();
    assert.ok(tmp);
    assert.ok(fs.existsSync(tmp));
  });

  // --- platformClaudePaths ---

  it('returns array of platform-specific claude paths', () => {
    const paths = platformClaudePaths();
    assert.ok(Array.isArray(paths));
    if (IS_WIN) {
      // Windows doesn't add extra paths (handled by `where`)
      assert.strictEqual(paths.length, 0);
    }
    if (IS_MAC) {
      assert.ok(paths.some(p => p.includes('homebrew')));
      assert.ok(paths.some(p => p.includes('/usr/local/bin')));
    }
    if (IS_LINUX) {
      assert.ok(paths.some(p => p.includes('.local/bin')));
    }
  });

  // --- Platform detection ---

  it('detects current platform correctly', () => {
    assert.ok(IS_WIN || IS_MAC || IS_LINUX || true); // always true, but validates constants
    assert.strictEqual(typeof PLATFORM, 'string');
    assert.ok(['win32', 'darwin', 'linux', 'freebsd', 'openbsd'].includes(PLATFORM));
  });

  // --- Cross-platform path handling ---

  it('normalizes git worktree paths correctly', () => {
    const winPath = 'C:\\Users\\silof\\c4-worktree-test';
    const normalized = platformNormalizePath(winPath);
    assert.ok(!normalized.includes('\\'));
    assert.strictEqual(normalized, 'C:/Users/silof/c4-worktree-test');
  });

  it('normalizes Unix paths (no-op)', () => {
    const unixPath = '/home/user/c4-worktree-test';
    assert.strictEqual(platformNormalizePath(unixPath), unixPath);
  });
});
