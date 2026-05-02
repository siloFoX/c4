'use strict';

// (v1.10.52) `c4 risk "<cmd>"` CLI integration.
//
// Spawns the CLI as a subprocess (no daemon dependency — the CLI
// degrades gracefully when /config is unreachable, classifying with
// built-in patterns only). Asserts:
//   - critical → "Level:    CRITICAL" + exit 1
//   - low      → "Level:    LOW"      + exit 0
//   - high     → "Level:    HIGH"     + exit 0 (default autoDeny=critical)
//   - --json   → parseable JSON with the canonical shape
//   - missing arg → usage on stderr + exit 1

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const CLI = path.resolve(__dirname, '..', 'src', 'cli.js');

function _run(args, env) {
  return spawnSync('node', [CLI, 'risk', ...args], {
    encoding: 'utf8',
    timeout: 10000,
    // Force daemon URL to a port that won't respond so the CLI
    // takes the "config fetch failed" path — keeps the test
    // hermetic even when a real daemon is running on 3456.
    env: { ...process.env, C4_DAEMON_URL: 'http://127.0.0.1:1', ...env },
  });
}

describe('c4 risk CLI', () => {
  it('critical command → CRITICAL + exit 1', () => {
    const r = _run(['rm -rf /']);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /Level:\s+(?:\x1b\[\d+m)?CRITICAL/);
    assert.match(r.stdout, /\[rm-rf-root\]/);
  });

  it('high command → HIGH + exit 0 (default autoDeny=critical)', () => {
    const r = _run(['git push --force origin main']);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /Level:\s+(?:\x1b\[\d+m)?HIGH/);
    assert.match(r.stdout, /\[git-force-push\]/);
  });

  it('low command → LOW + exit 0', () => {
    const r = _run(['echo hello']);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /Level:\s+(?:\x1b\[\d+m)?LOW/);
    assert.match(r.stdout, /no patterns matched/);
  });

  it('--json prints parseable JSON with canonical fields', () => {
    const r = _run(['--json', 'rm -rf /']);
    assert.equal(r.status, 1);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.level, 'critical');
    assert.equal(parsed.suggestedAction, 'deny');
    assert.ok(Array.isArray(parsed.reasons));
    assert.equal(parsed.reasons[0].code, 'rm-rf-root');
  });

  it('missing argument → exit 1 with usage on stderr', () => {
    const r = _run([]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Usage: c4 risk/);
  });

  it('--decoded surfaces the inspected source on obfuscated cases', () => {
    // base64-encoded 'rm -rf /' → 'cm0gLXJmIC8='
    const r = _run(['--decoded', 'echo "cm0gLXJmIC8=" | base64 -d | sh']);
    // Critical because the denoise step exposes rm -rf, even though
    // the literal command string would otherwise look benign.
    assert.equal(r.status, 1);
    assert.match(r.stdout, /Decoded:/);
  });

  it('multiple positional args concatenate as a single command', () => {
    // CLI joins positional args with spaces so users don't need
    // to wrap in quotes for simple cases.
    const r = _run(['rm', '-rf', '/']);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /CRITICAL/);
  });
});
