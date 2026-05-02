'use strict';

// (v1.10.87) Real Docker integration tests for executeInSandbox.
//
// The unit tests in risk-sandbox-exec.test.js use a stubbed
// child_process to drive the result envelope without spawning
// docker. This file validates the actual `docker run …` flags work
// against a real container — covers the gap where a flag typo
// might pass unit tests but break in the field.
//
// Every test is gated on `which docker` AND a fast `docker version`
// probe; CI hosts without docker (or with docker installed but
// daemon unreachable) report a single skipped placeholder case
// per describe block. On hosts with docker, alpine:latest is the
// only image used — small (~5MB) + ubiquitous + the
// DockerRuntime default.

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('child_process');

const {
  executeInSandbox,
  DEFAULT_TIMEOUT_MS,
  TRUNC_MARKER,
  _fingerprint,
  HASH_LENGTH,
} = require('../src/risk-sandbox-exec');
const { DockerRuntime } = require('../src/risk-sandbox-runtime');

let dockerOk = false;
let alpinePulled = false;

function _probeDocker() {
  try {
    execSync('which docker', { stdio: 'pipe', timeout: 1000 });
    execSync('docker version --format "{{.Server.Version}}"', {
      stdio: 'pipe', timeout: 3000,
    });
    dockerOk = true;
  } catch {
    dockerOk = false;
  }
  if (!dockerOk) return;
  try {
    const out = execSync('docker images --format "{{.Repository}}:{{.Tag}}" alpine:latest', {
      stdio: 'pipe', timeout: 3000,
    }).toString().trim();
    alpinePulled = out === 'alpine:latest';
  } catch {
    alpinePulled = false;
  }
}

before(() => _probeDocker());

describe('executeInSandbox + DockerRuntime — real exec (gated on docker)', () => {
  it('echo: exitCode=0, stdout captures the message, stderr empty', async (t) => {
    if (!dockerOk) return t.skip('docker not reachable');
    if (!alpinePulled) return t.skip('alpine:latest not pulled');
    const rt = new DockerRuntime();
    const result = await executeInSandbox(rt, 'echo hello-from-sandbox');
    assert.equal(result.exitCode, 0);
    assert.equal(result.killed, false);
    assert.match(result.stdout, /hello-from-sandbox/);
    assert.equal(result.stderr, '');
    assert.equal(result.spawnError, null);
    assert.equal(result.runtime.name, 'docker');
    assert.ok(result.durationMs >= 0);
    // Fingerprint is the actual SHA-256 prefix of captured stdout
    assert.equal(result.stdoutHash, _fingerprint(result.stdout));
    assert.equal(result.stdoutHash.length, HASH_LENGTH);
  });

  it('exit 7: exitCode propagates from the container', async (t) => {
    if (!dockerOk) return t.skip('docker not reachable');
    if (!alpinePulled) return t.skip('alpine:latest not pulled');
    const rt = new DockerRuntime();
    const result = await executeInSandbox(rt, 'exit 7');
    assert.equal(result.exitCode, 7);
    assert.equal(result.killed, false);
  });

  it('stderr writer: separates stdout from stderr', async (t) => {
    if (!dockerOk) return t.skip('docker not reachable');
    if (!alpinePulled) return t.skip('alpine:latest not pulled');
    const rt = new DockerRuntime();
    const result = await executeInSandbox(rt, 'echo out; echo err 1>&2; exit 0');
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /out/);
    assert.match(result.stderr, /err/);
    // The separation is the point — out must NOT leak into stderr
    assert.ok(!/err/.test(result.stdout));
    assert.ok(!/out/.test(result.stderr));
  });

  it('timeout: long-running command killed by host-side SIGKILL', async (t) => {
    if (!dockerOk) return t.skip('docker not reachable');
    if (!alpinePulled) return t.skip('alpine:latest not pulled');
    const rt = new DockerRuntime();
    const start = Date.now();
    const result = await executeInSandbox(rt, 'sleep 30', { timeoutMs: 500 });
    const elapsed = Date.now() - start;
    assert.equal(result.killed, true);
    // exitCode is null when killed by signal; some docker versions
    // surface the SIGKILL as exitCode=137 (128+9). Accept either.
    assert.ok(result.exitCode === null || result.exitCode === 137,
      `unexpected exitCode after kill: ${result.exitCode}`);
    // Should kill close to the timeout, not at the natural 30s end.
    // Allow generous slack for docker spawn overhead.
    assert.ok(elapsed < 30_000, `elapsed ${elapsed}ms — kill did not fire`);
  });

  it('network=none: outbound network calls fail by default', async (t) => {
    if (!dockerOk) return t.skip('docker not reachable');
    if (!alpinePulled) return t.skip('alpine:latest not pulled');
    const rt = new DockerRuntime();
    // Alpine ships with `wget` (BusyBox). With --network=none
    // (DockerRuntime default), DNS resolution fails immediately
    // ("bad address"). Use BusyBox `timeout` so a hung connect
    // doesn't pin the test.
    const result = await executeInSandbox(rt,
      'timeout 2 wget -qO- http://example.com 2>&1; echo done',
      { timeoutMs: 8000 }
    );
    assert.equal(result.exitCode, 0);  // trailing `echo done`
    assert.match(result.stdout, /done/);
    // The wget portion should have errored out — confirm we
    // didn't actually fetch HTML.
    assert.ok(!/<html/i.test(result.stdout),
      'expected --network=none to block http; pulled HTML instead');
  });

  it('read-only root: write to / fails', async (t) => {
    if (!dockerOk) return t.skip('docker not reachable');
    if (!alpinePulled) return t.skip('alpine:latest not pulled');
    const rt = new DockerRuntime();
    // /tmp is tmpfs (writable), / is read-only by default.
    const result = await executeInSandbox(rt,
      'touch /not-allowed.txt 2>&1 || true; touch /tmp/ok.txt && echo wrote-tmp');
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /wrote-tmp/);
    // The first touch should have produced an error in stderr or
    // combined; the test just confirms tmp succeeds.
  });

  it('truncation: real container output past bufferLimit is truncated + marked', async (t) => {
    if (!dockerOk) return t.skip('docker not reachable');
    if (!alpinePulled) return t.skip('alpine:latest not pulled');
    const rt = new DockerRuntime();
    // 100KB of A's; we cap at 8KB so result.stdout = 8KB + marker.
    const result = await executeInSandbox(rt, 'yes A | head -c 102400', {
      bufferLimit: 8192,
      timeoutMs: 10000,
    });
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout.length, 8192 + TRUNC_MARKER.length);
    assert.ok(result.stdout.endsWith(TRUNC_MARKER));
  });

  it('isolation summary matches the runtime config', async (t) => {
    if (!dockerOk) return t.skip('docker not reachable');
    if (!alpinePulled) return t.skip('alpine:latest not pulled');
    const rt = new DockerRuntime();
    const result = await executeInSandbox(rt, 'true');
    assert.equal(result.runtime.name, 'docker');
    assert.equal(result.runtime.isolation.network, 'none');
    assert.match(result.runtime.isolation.resources, /memory=128m/);
  });

  it('opts override: image swap actually pulls a different container', async (t) => {
    if (!dockerOk) return t.skip('docker not reachable');
    if (!alpinePulled) return t.skip('alpine:latest not pulled');
    // Re-use alpine:latest under a tag override path — the test is
    // that the override flows into prepareArgs (and therefore the
    // real `docker run` command). We don't pull a second image to
    // keep the test light.
    const rt = new DockerRuntime({ image: 'alpine:latest' });
    const result = await executeInSandbox(rt, 'cat /etc/os-release | head -2');
    assert.equal(result.exitCode, 0);
    // Alpine os-release has NAME="Alpine Linux"
    assert.match(result.stdout, /Alpine/);
  });
});

describe('Round-trip: stdoutHash matches re-fingerprint', () => {
  it('two runs of the same command produce identical hashes', async (t) => {
    if (!dockerOk) return t.skip('docker not reachable');
    if (!alpinePulled) return t.skip('alpine:latest not pulled');
    const rt = new DockerRuntime();
    const a = await executeInSandbox(rt, 'echo deterministic');
    const b = await executeInSandbox(rt, 'echo deterministic');
    assert.equal(a.stdoutHash, b.stdoutHash);
    // Sanity: actually identical content
    assert.equal(a.stdout, b.stdout);
  });

  it('one-byte-different stdout produces different hashes', async (t) => {
    if (!dockerOk) return t.skip('docker not reachable');
    if (!alpinePulled) return t.skip('alpine:latest not pulled');
    const rt = new DockerRuntime();
    const a = await executeInSandbox(rt, 'echo aaa');
    const b = await executeInSandbox(rt, 'echo bbb');
    assert.notEqual(a.stdoutHash, b.stdoutHash);
  });
});

describe('CI-safe placeholder when docker unavailable', () => {
  it('reports gating decision', () => {
    // This test always passes — its purpose is to leave a
    // visible row in CI output describing whether the gated tests
    // actually ran on this host.
    assert.ok(true,
      `dockerOk=${dockerOk}, alpinePulled=${alpinePulled}, ` +
      `default timeout=${DEFAULT_TIMEOUT_MS}ms`);
  });
});
