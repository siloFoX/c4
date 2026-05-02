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
    env: { ...process.env, C4_URL: 'http://127.0.0.1:1', ...env },
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
    // v1.10.55 added the `stats` subcommand, so usage now spans two
    // lines under a leading "Usage:" header.
    assert.match(r.stderr, /Usage:[\s\S]*c4 risk "<command>"/);
    assert.match(r.stderr, /c4 risk stats/);
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

describe('c4 risk --sandbox-preview (v1.10.79)', () => {
  it('docker preview prints the docker run argv (no exec)', () => {
    const r = _run(['--sandbox-preview', 'docker', 'echo hi']);
    // Always exit 0 — `echo hi` is benign so classification is `low`.
    assert.equal(r.status, 0);
    assert.match(r.stdout, /Sandbox runtime: docker/);
    assert.match(r.stdout, /isolation: network=none/);
    assert.match(r.stdout, /docker run --rm --network=none/);
    assert.match(r.stdout, /alpine:latest/);
    assert.match(r.stdout, /sh -c 'echo hi'/);
  });

  it('null preview reports "runs on host"', () => {
    const r = _run(['--sandbox-preview', 'null', 'echo hi']);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /Sandbox runtime: null/);
    assert.match(r.stdout, /no isolation — runs on host/);
  });

  it('unknown runtime name surfaces as a non-fatal error', () => {
    const r = _run(['--sandbox-preview', 'nonsuch', 'echo hi']);
    // Classification still completes (exit 0), but stderr carries
    // the runtime error so operators see the typo.
    assert.equal(r.status, 0);
    assert.match(r.stderr, /sandbox-preview error.*Unknown sandbox runtime/);
  });

  it('preview path does not eat positional command terms', () => {
    const r = _run(['--sandbox-preview', 'docker', 'rm', '-rf', '/']);
    // Critical → exit 1. The flag parser must NOT swallow `rm`.
    assert.equal(r.status, 1);
    assert.match(r.stdout, /CRITICAL/);
    assert.match(r.stdout, /sh -c 'rm -rf \/'/);
  });
});

describe('c4 risk stats CLI (v1.10.55)', () => {
  // The stats subcommand calls the running daemon. With the unit
  // env's bogus C4_DAEMON_URL the request fails and the CLI exits
  // non-zero, which is itself a useful regression to lock in. A
  // separate integration test (full daemon) lives downstream.
  it('subcommand fails cleanly when daemon unreachable', () => {
    const r = spawnSync('node', [CLI, 'risk', 'stats'], {
      encoding: 'utf8',
      timeout: 10000,
      env: { ...process.env, C4_URL: 'http://127.0.0.1:1' },
    });
    assert.equal(r.status, 1, 'should exit non-zero on unreachable daemon');
    // The CLI's request() helper throws a "Daemon not running?" error
    // before our code path sees it — matches either prefix to stay
    // robust against future error-message tweaks.
    assert.match(r.stderr, /Daemon not running|Failed:/);
  });
});
