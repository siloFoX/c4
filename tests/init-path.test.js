// init PATH registration tests
//
// Verifies src/init-path.js — the helper used by `c4 init` to auto-register
// ~/.local/bin in the user's shell PATH after the symlink fallback runs.

'use strict';

const assert = require('assert');
const { describe, it } = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  MARKER,
  EXPORT_LINE,
  isLocalBinInPath,
  detectRcFiles,
  rcHasLocalBinPath,
  appendPathExport,
  registerLocalBinInPath,
} = require('../src/init-path');

function mkTmpHome() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-init-path-'));
  return dir;
}

function rmDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {}
}

describe('isLocalBinInPath', () => {
  it('returns true when exact path is in PATH', () => {
    const home = '/home/user';
    const localBin = path.join(home, '.local', 'bin');
    const pathEnv = ['/usr/bin', localBin, '/usr/local/bin'].join(':');
    assert.strictEqual(isLocalBinInPath(localBin, pathEnv, false), true);
  });

  it('returns false when ~/.local/bin is not in PATH', () => {
    const home = '/home/user';
    const localBin = path.join(home, '.local', 'bin');
    const pathEnv = ['/usr/bin', '/usr/local/bin'].join(':');
    assert.strictEqual(isLocalBinInPath(localBin, pathEnv, false), false);
  });

  it('ignores trailing slashes in PATH entries', () => {
    const home = '/home/user';
    const localBin = path.join(home, '.local', 'bin');
    const pathEnv = ['/usr/bin', localBin + '/', '/usr/local/bin'].join(':');
    assert.strictEqual(isLocalBinInPath(localBin, pathEnv, false), true);
  });

  it('returns false for empty or missing PATH', () => {
    assert.strictEqual(isLocalBinInPath('/home/user/.local/bin', '', false), false);
    assert.strictEqual(isLocalBinInPath('/home/user/.local/bin', undefined, false), false);
  });

  it('uses ; separator on Windows', () => {
    const localBin = 'C:/Users/u/.local/bin';
    const pathEnv = ['C:/Windows', localBin, 'C:/Program Files'].join(';');
    assert.strictEqual(isLocalBinInPath(localBin, pathEnv, true), true);
  });
});

describe('detectRcFiles', () => {
  it('returns only .bashrc for bash SHELL', () => {
    const home = '/home/user';
    const files = detectRcFiles(home, '/bin/bash');
    assert.deepStrictEqual(files, [path.join(home, '.bashrc')]);
  });

  it('returns .bashrc and .zshrc for zsh SHELL', () => {
    const home = '/home/user';
    const files = detectRcFiles(home, '/bin/zsh');
    assert.deepStrictEqual(files, [
      path.join(home, '.bashrc'),
      path.join(home, '.zshrc'),
    ]);
  });

  it('detects zsh in non-standard path', () => {
    const home = '/home/user';
    const files = detectRcFiles(home, '/usr/local/bin/zsh');
    assert.ok(files.includes(path.join(home, '.zshrc')));
  });

  it('does not add .zshrc when SHELL is empty or bash-like', () => {
    const home = '/home/user';
    assert.deepStrictEqual(detectRcFiles(home, ''), [path.join(home, '.bashrc')]);
    assert.deepStrictEqual(detectRcFiles(home, '/bin/sh'), [path.join(home, '.bashrc')]);
  });
});

describe('rcHasLocalBinPath', () => {
  it('returns false for empty content', () => {
    assert.strictEqual(rcHasLocalBinPath(''), false);
    assert.strictEqual(rcHasLocalBinPath(undefined), false);
  });

  it('detects export PATH line with $HOME/.local/bin', () => {
    const rc = 'export PATH="$HOME/.local/bin:$PATH"\n';
    assert.strictEqual(rcHasLocalBinPath(rc), true);
  });

  it('detects export PATH line with literal ~/.local/bin', () => {
    // ~ expansion happens in shell; we only care about the string match.
    // But the literal "~/.local/bin" is a reasonable form a user may have.
    const rc = 'export PATH=~/.local/bin:$PATH\n';
    // Our regex keys on ".local/bin" substring + export PATH — this matches.
    assert.strictEqual(rcHasLocalBinPath(rc), true);
  });

  it('detects bare PATH= assignment (no export)', () => {
    const rc = 'PATH="$HOME/.local/bin:$PATH"\n';
    assert.strictEqual(rcHasLocalBinPath(rc), true);
  });

  it('ignores comment lines mentioning .local/bin', () => {
    const rc = '# formerly added .local/bin to PATH\n';
    assert.strictEqual(rcHasLocalBinPath(rc), false);
  });

  it('returns false when .local/bin appears outside a PATH assignment', () => {
    const rc = 'alias mycmd="$HOME/.local/bin/mycmd"\n';
    assert.strictEqual(rcHasLocalBinPath(rc), false);
  });

  it('finds match in the middle of a multi-line rc file', () => {
    const rc = [
      '# shell prompt',
      'PS1="> "',
      '',
      'export PATH="$HOME/.local/bin:$PATH"',
      '',
      'alias ll="ls -la"',
    ].join('\n');
    assert.strictEqual(rcHasLocalBinPath(rc), true);
  });
});

describe('appendPathExport', () => {
  it('creates file and writes marker + export when file does not exist', () => {
    const home = mkTmpHome();
    try {
      const rc = path.join(home, '.bashrc');
      const res = appendPathExport(rc);
      assert.strictEqual(res.result, 'appended');
      const content = fs.readFileSync(rc, 'utf8');
      assert.ok(content.includes(MARKER));
      assert.ok(content.includes(EXPORT_LINE));
    } finally {
      rmDir(home);
    }
  });

  it('appends to existing file without clobbering prior content', () => {
    const home = mkTmpHome();
    try {
      const rc = path.join(home, '.bashrc');
      fs.writeFileSync(rc, '# existing\nalias ll="ls -la"\n');
      const res = appendPathExport(rc);
      assert.strictEqual(res.result, 'appended');
      const content = fs.readFileSync(rc, 'utf8');
      assert.ok(content.startsWith('# existing\nalias ll="ls -la"\n'));
      assert.ok(content.includes(MARKER));
      assert.ok(content.includes(EXPORT_LINE));
    } finally {
      rmDir(home);
    }
  });

  it('skips when an existing PATH export for .local/bin is present', () => {
    const home = mkTmpHome();
    try {
      const rc = path.join(home, '.bashrc');
      const original = 'export PATH="$HOME/.local/bin:$PATH"\n';
      fs.writeFileSync(rc, original);
      const res = appendPathExport(rc);
      assert.strictEqual(res.result, 'already-present');
      const content = fs.readFileSync(rc, 'utf8');
      assert.strictEqual(content, original);
    } finally {
      rmDir(home);
    }
  });

  it('running twice in a row does not create duplicate blocks', () => {
    const home = mkTmpHome();
    try {
      const rc = path.join(home, '.bashrc');
      fs.writeFileSync(rc, '# existing\n');
      appendPathExport(rc);
      const second = appendPathExport(rc);
      assert.strictEqual(second.result, 'already-present');
      const content = fs.readFileSync(rc, 'utf8');
      const markerCount = content.split(MARKER).length - 1;
      assert.strictEqual(markerCount, 1);
      const exportCount = content.split(EXPORT_LINE).length - 1;
      assert.strictEqual(exportCount, 1);
    } finally {
      rmDir(home);
    }
  });

  it('returns error when filesystem write fails', () => {
    // Use a fake fs that throws on appendFileSync
    const fakeFs = {
      readFileSync: () => '',
      appendFileSync: () => { throw new Error('EACCES: permission denied'); },
    };
    const res = appendPathExport('/tmp/unwritable', fakeFs);
    assert.strictEqual(res.result, 'error');
    assert.ok(/EACCES/.test(res.error));
  });
});

describe('registerLocalBinInPath', () => {
  it('returns alreadyInPath when ~/.local/bin is already in PATH', () => {
    const home = mkTmpHome();
    try {
      const localBin = path.join(home, '.local', 'bin');
      const res = registerLocalBinInPath({
        home,
        localBin,
        pathEnv: ['/usr/bin', localBin].join(':'),
        shellEnv: '/bin/bash',
        isWin: false,
      });
      assert.strictEqual(res.alreadyInPath, true);
      assert.deepStrictEqual(res.updated, []);
      // No rc file should be created
      assert.strictEqual(fs.existsSync(path.join(home, '.bashrc')), false);
    } finally {
      rmDir(home);
    }
  });

  it('writes export to ~/.bashrc when PATH missing ~/.local/bin (bash user)', () => {
    const home = mkTmpHome();
    try {
      const localBin = path.join(home, '.local', 'bin');
      const res = registerLocalBinInPath({
        home,
        localBin,
        pathEnv: '/usr/bin:/usr/local/bin',
        shellEnv: '/bin/bash',
        isWin: false,
      });
      assert.strictEqual(res.alreadyInPath, false);
      assert.deepStrictEqual(res.updated, [path.join(home, '.bashrc')]);
      assert.deepStrictEqual(res.unchanged, []);
      const rc = fs.readFileSync(path.join(home, '.bashrc'), 'utf8');
      assert.ok(rc.includes(EXPORT_LINE));
      assert.ok(rc.includes(MARKER));
      // .zshrc should NOT be created for a bash user
      assert.strictEqual(fs.existsSync(path.join(home, '.zshrc')), false);
    } finally {
      rmDir(home);
    }
  });

  it('writes to both ~/.bashrc and ~/.zshrc for a zsh user', () => {
    const home = mkTmpHome();
    try {
      const localBin = path.join(home, '.local', 'bin');
      const res = registerLocalBinInPath({
        home,
        localBin,
        pathEnv: '/usr/bin',
        shellEnv: '/bin/zsh',
        isWin: false,
      });
      assert.strictEqual(res.alreadyInPath, false);
      assert.deepStrictEqual(res.updated, [
        path.join(home, '.bashrc'),
        path.join(home, '.zshrc'),
      ]);
      const bashContent = fs.readFileSync(path.join(home, '.bashrc'), 'utf8');
      const zshContent = fs.readFileSync(path.join(home, '.zshrc'), 'utf8');
      assert.ok(bashContent.includes(EXPORT_LINE));
      assert.ok(zshContent.includes(EXPORT_LINE));
    } finally {
      rmDir(home);
    }
  });

  it('marks rc as unchanged when it already has a .local/bin PATH export', () => {
    const home = mkTmpHome();
    try {
      const localBin = path.join(home, '.local', 'bin');
      const rc = path.join(home, '.bashrc');
      fs.writeFileSync(rc, 'export PATH="$HOME/.local/bin:$PATH"\n');
      const res = registerLocalBinInPath({
        home,
        localBin,
        pathEnv: '/usr/bin',
        shellEnv: '/bin/bash',
        isWin: false,
      });
      assert.deepStrictEqual(res.updated, []);
      assert.deepStrictEqual(res.unchanged, [rc]);
      // Content must be untouched
      const content = fs.readFileSync(rc, 'utf8');
      assert.strictEqual(content, 'export PATH="$HOME/.local/bin:$PATH"\n');
    } finally {
      rmDir(home);
    }
  });

  it('running twice is idempotent', () => {
    const home = mkTmpHome();
    try {
      const localBin = path.join(home, '.local', 'bin');
      const opts = {
        home,
        localBin,
        pathEnv: '/usr/bin',
        shellEnv: '/bin/bash',
        isWin: false,
      };
      registerLocalBinInPath(opts);
      const second = registerLocalBinInPath(opts);
      assert.deepStrictEqual(second.updated, []);
      assert.deepStrictEqual(second.unchanged, [path.join(home, '.bashrc')]);
      const content = fs.readFileSync(path.join(home, '.bashrc'), 'utf8');
      const markerCount = content.split(MARKER).length - 1;
      assert.strictEqual(markerCount, 1);
    } finally {
      rmDir(home);
    }
  });

  it('is a no-op on Windows (returns skipped)', () => {
    const home = mkTmpHome();
    try {
      const localBin = path.join(home, '.local', 'bin');
      const res = registerLocalBinInPath({
        home,
        localBin,
        pathEnv: 'C:/Windows',
        shellEnv: '',
        isWin: true,
      });
      assert.strictEqual(res.skipped, 'windows');
      assert.strictEqual(fs.existsSync(path.join(home, '.bashrc')), false);
    } finally {
      rmDir(home);
    }
  });
});

describe('Source-level integration (cli.js wires init-path helper)', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'cli.js'),
    'utf8'
  );

  it('cli.js requires ./init-path inside init handler', () => {
    assert.ok(
      /require\(['"]\.\/init-path['"]\)/.test(src),
      'cli.js should require ./init-path'
    );
  });

  it('cli.js calls registerLocalBinInPath with home and localBin', () => {
    assert.ok(
      /registerLocalBinInPath\(\s*\{\s*home\s*,\s*localBin\s*\}\s*\)/.test(src),
      'cli.js should call registerLocalBinInPath({ home, localBin })'
    );
  });

  it('cli.js no longer only-warns when ~/.local/bin is missing from PATH', () => {
    // The old message "add to your shell rc:" appears only as a fallback
    // (no rc files writable). The symlink branch must not rely solely on it.
    const symlinkBlock = src.match(/5b\. Linux\/macOS: ~\/\.local\/bin[\s\S]*?5c\. Windows/);
    assert.ok(symlinkBlock, 'could not locate 5b symlink block');
    assert.ok(
      /registerLocalBinInPath/.test(symlinkBlock[0]),
      '5b block should delegate to registerLocalBinInPath'
    );
  });
});
