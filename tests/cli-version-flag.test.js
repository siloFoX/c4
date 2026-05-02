'use strict';

// (v1.10.93) `c4 --version` / `-v` / `version` print the package
// version + exit cleanly. Before this cut, those forms fell
// through to the default "unknown command" branch which printed
// the entire usage block. Operators (and CI scripts that need to
// read the c4 version) now have a stable, parseable surface.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const CLI = path.resolve(__dirname, '..', 'src', 'cli.js');
const PKG = require('../package.json');

function _run(args) {
  return spawnSync('node', [CLI, ...args], {
    encoding: 'utf8',
    timeout: 5000,
    // Hermetic env — daemon is unreachable; version is a local-only
    // path so the URL doesn't matter, but pinning it keeps the
    // test independent of any actual running daemon.
    env: { ...process.env, C4_URL: 'http://127.0.0.1:1' },
  });
}

describe('c4 version flag (v1.10.93)', () => {
  it('c4 --version prints package version + exits 0', () => {
    const r = _run(['--version']);
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), PKG.version);
    assert.equal(r.stderr, '');
  });

  it('c4 -v prints package version + exits 0', () => {
    const r = _run(['-v']);
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), PKG.version);
  });

  it('c4 version prints package version + exits 0', () => {
    const r = _run(['version']);
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), PKG.version);
  });

  it('does NOT fall through to usage', () => {
    const r = _run(['--version']);
    assert.ok(!/Usage: c4 <command>/.test(r.stdout),
      'version should not print full usage block');
  });

  it('handles trailing args defensively (only first token is the version flag)', () => {
    const r = _run(['version', 'extra-arg', '--ignored']);
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), PKG.version);
  });

  it('usage block lists `version` as a command', () => {
    // Run without args to get the usage banner — verify the
    // version line is now documented so operators can discover it.
    const r = spawnSync('node', [CLI, 'unknown-cmd-xyzzy'], {
      encoding: 'utf8',
      timeout: 5000,
      env: { ...process.env, C4_URL: 'http://127.0.0.1:1' },
    });
    assert.match(r.stdout, /version \| --version \| -v/);
  });
});
