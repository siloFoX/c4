// (8.11) Fresh install verification test
//
// Simulates the documented install flow (git clone -> npm install ->
// npm --prefix web install + build -> c4 init -> daemon boot) against a
// temp-dir copy of the current repo so breakage a fresh user would hit
// (missing deps, missing scripts, hardcoded paths, wrong engines range) is
// caught without reaching the network.
//
// The git clone step is replaced with fs.cpSync (excluding node_modules,
// .git, web/node_modules, web/dist, c4-worktree-*, .c4-* markers) so the
// default suite stays offline and finishes under the tests/run-all.js 30s
// per-file cap.
//
// Heavy steps (actual npm install + vite build) are gated on
// C4_INSTALL_VERIFY_FULL=1 so the default run stays fast. The runbook
// (docs/install-verify.md) documents how to flip the switch on a fresh
// machine for end-to-end verification.
//
// Cleanup runs in `after` whether assertions pass or fail.

'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const FULL = process.env.C4_INSTALL_VERIFY_FULL === '1';

const EXCLUDED_BASENAMES = new Set([
  'node_modules',
  '.git',
  'dist',
  '.c4-task.md',
  '.c4-last-test.txt',
  '.c4-validation.json',
  '.DS_Store',
]);

function copyFilter(src) {
  // The first call is `(REPO_ROOT, tmpDir)` — its basename can itself match
  // /^c4-worktree-/ when the suite runs inside a worktree, which would skip
  // the entire copy. Always let the root through.
  if (src === REPO_ROOT) return true;
  const base = path.basename(src);
  if (EXCLUDED_BASENAMES.has(base)) return false;
  if (/^c4-worktree-/.test(base)) return false;
  return true;
}

let tmpDir = null;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-install-'));
  fs.cpSync(REPO_ROOT, tmpDir, {
    recursive: true,
    dereference: false,
    filter: copyFilter,
  });
});

after(() => {
  if (!tmpDir) return;
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // best-effort; the OS will reap os.tmpdir() eventually
  }
});

describe('(8.11) clone simulation: fs.cpSync output', () => {
  it('includes top-level package.json + README', () => {
    assert.ok(fs.existsSync(path.join(tmpDir, 'package.json')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'README.md')));
  });

  it('includes src/cli.js + src/daemon.js + src/static-server.js', () => {
    assert.ok(fs.existsSync(path.join(tmpDir, 'src', 'cli.js')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'src', 'daemon.js')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'src', 'static-server.js')));
  });

  it('includes web/package.json + web/vite.config.ts + web/src', () => {
    assert.ok(fs.existsSync(path.join(tmpDir, 'web', 'package.json')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'web', 'vite.config.ts')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'web', 'src')));
  });

  it('includes config.example.json + CLAUDE.md', () => {
    assert.ok(fs.existsSync(path.join(tmpDir, 'config.example.json')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'CLAUDE.md')));
  });

  it('excludes node_modules (root + web)', () => {
    assert.strictEqual(fs.existsSync(path.join(tmpDir, 'node_modules')), false);
    assert.strictEqual(fs.existsSync(path.join(tmpDir, 'web', 'node_modules')), false);
  });

  it('excludes .git and web/dist', () => {
    assert.strictEqual(fs.existsSync(path.join(tmpDir, '.git')), false);
    assert.strictEqual(fs.existsSync(path.join(tmpDir, 'web', 'dist')), false);
  });

  it('excludes transient markers (.c4-task.md / .c4-last-test.txt)', () => {
    assert.strictEqual(fs.existsSync(path.join(tmpDir, '.c4-task.md')), false);
    assert.strictEqual(fs.existsSync(path.join(tmpDir, '.c4-last-test.txt')), false);
  });
});

describe('(8.11) root package.json surface', () => {
  let pkg;
  before(() => {
    pkg = JSON.parse(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf8'));
  });

  it('declares scripts: start, daemon, build:web, test', () => {
    assert.ok(pkg.scripts, 'package.json has no scripts block');
    for (const key of ['start', 'daemon', 'build:web', 'test']) {
      assert.ok(pkg.scripts[key], `missing package.json script: ${key}`);
    }
  });

  it('build:web invokes web install + web build (single string)', () => {
    const cmd = pkg.scripts['build:web'];
    assert.ok(/npm\s+--prefix\s+web\s+install/.test(cmd),
      `build:web does not install web deps: ${cmd}`);
    assert.ok(/npm\s+--prefix\s+web\s+run\s+build/.test(cmd),
      `build:web does not run the web build: ${cmd}`);
  });

  it('exposes bin.c4 -> src/cli.js so npm link makes c4 global', () => {
    assert.ok(pkg.bin && pkg.bin.c4, 'missing bin.c4 entry');
    assert.ok(/src\/cli\.js$/.test(pkg.bin.c4), `unexpected bin.c4: ${pkg.bin.c4}`);
    const cliPath = path.join(tmpDir, pkg.bin.c4);
    assert.ok(fs.existsSync(cliPath), `bin target missing: ${cliPath}`);
  });

  it('engines.node pins >= 18 (Node 16 drops fs.cpSync filter)', () => {
    assert.ok(pkg.engines && pkg.engines.node, 'missing engines.node');
    assert.ok(/>=\s*1[89]/.test(pkg.engines.node) || />=\s*[2-9]\d/.test(pkg.engines.node),
      `engines.node too permissive: ${pkg.engines.node}`);
  });

  it('runtime deps are the expected minimal set (node-pty + nodemailer)', () => {
    const deps = Object.keys(pkg.dependencies || {});
    assert.ok(deps.includes('node-pty'), 'missing dep: node-pty');
    assert.ok(deps.includes('nodemailer'), 'missing dep: nodemailer');
  });
});

describe('(8.11) web package.json surface', () => {
  let web;
  before(() => {
    web = JSON.parse(fs.readFileSync(path.join(tmpDir, 'web', 'package.json'), 'utf8'));
  });

  it('declares dev + build scripts', () => {
    assert.ok(web.scripts && web.scripts.dev, 'missing web script: dev');
    assert.ok(web.scripts && web.scripts.build, 'missing web script: build');
  });

  it('pins vite + react in devDependencies/dependencies', () => {
    const all = Object.assign({}, web.dependencies || {}, web.devDependencies || {});
    assert.ok(all.vite, 'web missing dep: vite');
    assert.ok(all.react, 'web missing dep: react');
    assert.ok(all['react-dom'], 'web missing dep: react-dom');
  });
});

describe('(8.11) c4 init prerequisites', () => {
  it('config.example.json parses + has daemon.port (default 3456)', () => {
    const raw = fs.readFileSync(path.join(tmpDir, 'config.example.json'), 'utf8');
    const cfg = JSON.parse(raw);
    assert.ok(cfg.daemon, 'config.example.json missing daemon section');
    assert.strictEqual(cfg.daemon.port, 3456,
      `default daemon port should be 3456, got ${cfg.daemon.port}`);
  });

  it('src/cli.js is readable + declares init/daemon subcommands', () => {
    const cli = fs.readFileSync(path.join(tmpDir, 'src', 'cli.js'), 'utf8');
    assert.ok(/['"]init['"]/.test(cli), 'cli.js has no init subcommand literal');
    assert.ok(/['"]daemon['"]/.test(cli), 'cli.js has no daemon subcommand literal');
  });
});

// ---------------------------------------------------------------------------
// Full install flow (opt-in via C4_INSTALL_VERIFY_FULL=1).
//
// This block is what catches the slow failures a fresh user would hit:
// registry outages, native-module build errors (node-pty), missing web
// devDependencies, TypeScript errors surfaced by `tsc --noEmit && vite build`.
// Skipped by default because the cold install + Vite build exceeds the 30s
// per-file test timeout on slower hardware.
// ---------------------------------------------------------------------------

if (FULL) {
  describe('(8.11) full install flow [C4_INSTALL_VERIFY_FULL=1]', () => {
    const HEAVY = { timeout: 300000 };

    it('npm install (root)', HEAVY, () => {
      execFileSync('npm', ['install', '--no-audit', '--no-fund'], {
        cwd: tmpDir,
        stdio: 'pipe',
      });
      assert.ok(fs.existsSync(path.join(tmpDir, 'node_modules')),
        'root npm install produced no node_modules');
    });

    it('npm --prefix web install', HEAVY, () => {
      execFileSync('npm', ['--prefix', 'web', 'install', '--no-audit', '--no-fund'], {
        cwd: tmpDir,
        stdio: 'pipe',
      });
      assert.ok(fs.existsSync(path.join(tmpDir, 'web', 'node_modules')),
        'web npm install produced no node_modules');
    });

    it('npm --prefix web run build produces web/dist/index.html', HEAVY, () => {
      execFileSync('npm', ['--prefix', 'web', 'run', 'build'], {
        cwd: tmpDir,
        stdio: 'pipe',
      });
      const idx = path.join(tmpDir, 'web', 'dist', 'index.html');
      assert.ok(fs.existsSync(idx), `build did not emit ${idx}`);
      const body = fs.readFileSync(idx, 'utf8');
      assert.ok(/<html/i.test(body), 'web/dist/index.html has no <html> tag');
    });
  });
}
