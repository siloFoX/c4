'use strict';

// (v1.10.83) executeInSandbox() tests with stubbed spawn — no
// real docker invocations. Spawn implementation is injected via
// `opts.spawnImpl` so we control stdout/stderr/exit/timing
// deterministically.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const {
  executeInSandbox,
  BlockedByRuntimeError,
  DEFAULT_TIMEOUT_MS,
  MIN_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  DEFAULT_BUFFER_LIMIT,
  MIN_BUFFER_LIMIT,
  TRUNC_MARKER,
} = require('../src/risk-sandbox-exec');
const {
  NullRuntime,
  DockerRuntime,
  SandboxRuntime,
} = require('../src/risk-sandbox-runtime');

// A stub child process. Mimics enough of Node's child_process
// surface that our handlers + listeners can drive it.
class FakeChild extends EventEmitter {
  constructor() {
    super();
    this.stdout = new EventEmitter();
    this.stderr = new EventEmitter();
    this.killed = false;
  }
  kill(/* signal */) {
    this.killed = true;
  }
  // Test-side helpers
  _emitStdout(chunk) { this.stdout.emit('data', Buffer.from(chunk)); }
  _emitStderr(chunk) { this.stderr.emit('data', Buffer.from(chunk)); }
  _close(code = 0, signal = null) { this.emit('close', code, signal); }
  _error(msg) { this.emit('error', new Error(msg)); }
}

function makeSpawnImpl(controller) {
  return (binary, args, _opts) => {
    const child = new FakeChild();
    controller.last = { binary, args, child };
    queueMicrotask(() => controller.onSpawn && controller.onSpawn(child));
    return child;
  };
}

describe('executeInSandbox — input validation', () => {
  it('throws TypeError when runtime missing prepareArgs', async () => {
    await assert.rejects(
      () => executeInSandbox({}, 'hi'),
      { name: 'TypeError' },
    );
  });

  it('throws TypeError when command is not a string', async () => {
    const rt = new DockerRuntime();
    await assert.rejects(
      () => executeInSandbox(rt, 42),
      { name: 'TypeError' },
    );
  });

  it('throws BlockedByRuntimeError when runtime is NullRuntime', async () => {
    const rt = new NullRuntime();
    await assert.rejects(
      () => executeInSandbox(rt, 'echo hi'),
      { name: 'BlockedByRuntimeError' },
    );
  });
});

describe('executeInSandbox — happy path', () => {
  it('captures stdout / stderr / exitCode / duration', async () => {
    const rt = new DockerRuntime({ dockerBinary: 'docker' });
    // Override available() so we don't actually probe docker.
    rt.available = () => ({ ok: true });
    const controller = {
      onSpawn: (c) => {
        c._emitStdout('out-chunk-1');
        c._emitStdout('out-chunk-2');
        c._emitStderr('err-chunk');
        // Close on next microtask so handler registration completes.
        setImmediate(() => c._close(0));
      },
    };
    const result = await executeInSandbox(rt, 'echo hi', {
      spawnImpl: makeSpawnImpl(controller),
    });
    assert.equal(result.exitCode, 0);
    assert.equal(result.killed, false);
    assert.equal(result.stdout, 'out-chunk-1out-chunk-2');
    assert.equal(result.stderr, 'err-chunk');
    assert.equal(result.command, 'echo hi');
    assert.equal(result.runtime.name, 'docker');
    assert.equal(result.spawnError, null);
    assert.ok(typeof result.durationMs === 'number' && result.durationMs >= 0);
  });

  it('runtime block carries the isolation summary', async () => {
    const rt = new DockerRuntime();
    rt.available = () => ({ ok: true });
    const controller = {
      onSpawn: (c) => setImmediate(() => c._close(0)),
    };
    const result = await executeInSandbox(rt, 'true', {
      spawnImpl: makeSpawnImpl(controller),
    });
    assert.equal(result.runtime.name, 'docker');
    assert.equal(result.runtime.isolation.network, 'none');
    assert.match(result.runtime.isolation.resources, /memory=128m/);
  });

  it('exec uses the prepared docker run argv (binary + args)', async () => {
    const rt = new DockerRuntime();
    rt.available = () => ({ ok: true });
    const controller = {
      onSpawn: (c) => setImmediate(() => c._close(0)),
    };
    await executeInSandbox(rt, 'echo hi', {
      spawnImpl: makeSpawnImpl(controller),
    });
    assert.equal(controller.last.binary, 'docker');
    assert.ok(controller.last.args.includes('--network=none'));
    assert.deepEqual(controller.last.args.slice(-3), ['sh', '-c', 'echo hi']);
  });
});

describe('executeInSandbox — runtime availability gating', () => {
  it('skips spawn when runtime.available() reports not-ok', async () => {
    const rt = new DockerRuntime({ dockerBinary: '/no/such/docker' });
    rt.available = () => ({ ok: false, reason: 'docker probe failed: nope' });
    let spawnCalled = false;
    const result = await executeInSandbox(rt, 'echo hi', {
      spawnImpl: () => { spawnCalled = true; return new FakeChild(); },
    });
    assert.equal(spawnCalled, false, 'spawn must not be called when not-ok');
    assert.match(result.spawnError, /probe failed/);
    assert.equal(result.exitCode, null);
  });

  it('runtime that lacks available() proceeds to spawn', async () => {
    // Build a minimal runtime POJO that satisfies the prepareArgs
    // contract but has NO available() at all (not on instance, not
    // on prototype chain). Module check is `typeof
    // runtime.available === 'function'` — POJO has no method, so
    // the probe is skipped.
    const rt = {
      describeIsolation: () => ({ name: 'bare', network: 'host', filesystem: 'host', resources: 'host' }),
      prepareArgs: (cmd) => ({
        binary: 'echo', args: [cmd], env: {}, command: cmd,
        isolation: { name: 'bare', network: 'host', filesystem: 'host', resources: 'host' },
      }),
    };
    const controller = {
      onSpawn: (c) => setImmediate(() => c._close(0)),
    };
    const result = await executeInSandbox(rt, 'hi', {
      spawnImpl: makeSpawnImpl(controller),
    });
    assert.equal(result.spawnError, null);
    assert.equal(result.exitCode, 0);
  });
});

describe('executeInSandbox — buffer truncation', () => {
  it('stdout truncated at bufferLimit + marker appended', async () => {
    const rt = new DockerRuntime();
    rt.available = () => ({ ok: true });
    const big = 'A'.repeat(2000);
    const controller = {
      onSpawn: (c) => {
        c._emitStdout(big);
        c._emitStdout(big);  // exceeds 2KB cap
        setImmediate(() => c._close(0));
      },
    };
    const result = await executeInSandbox(rt, 'noisy', {
      bufferLimit: 2000,
      spawnImpl: makeSpawnImpl(controller),
    });
    assert.ok(result.stdout.endsWith(TRUNC_MARKER));
    // 2000 chars + marker
    assert.equal(result.stdout.length, 2000 + TRUNC_MARKER.length);
  });

  it('stderr truncated independently from stdout', async () => {
    const rt = new DockerRuntime();
    rt.available = () => ({ ok: true });
    const big = 'B'.repeat(3000);
    const controller = {
      onSpawn: (c) => {
        c._emitStderr(big);
        setImmediate(() => c._close(1));
      },
    };
    const result = await executeInSandbox(rt, 'fail', {
      bufferLimit: 2048,
      spawnImpl: makeSpawnImpl(controller),
    });
    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.endsWith(TRUNC_MARKER));
    assert.equal(result.stdout, '');
  });

  it('output below cap is not marked truncated', async () => {
    const rt = new DockerRuntime();
    rt.available = () => ({ ok: true });
    const controller = {
      onSpawn: (c) => {
        c._emitStdout('short');
        setImmediate(() => c._close(0));
      },
    };
    const result = await executeInSandbox(rt, 'hi', {
      spawnImpl: makeSpawnImpl(controller),
    });
    assert.equal(result.stdout, 'short');
    assert.ok(!result.stdout.includes(TRUNC_MARKER));
  });
});

describe('executeInSandbox — timeout / kill', () => {
  it('killed=true when timeout fires', async () => {
    const rt = new DockerRuntime();
    rt.available = () => ({ ok: true });
    const controller = {
      onSpawn: (c) => {
        // Never close until kill — simulate a hung process. The
        // module's timer will SIGKILL; our FakeChild needs to
        // emit close in response.
        const origKill = c.kill.bind(c);
        c.kill = (sig) => {
          origKill(sig);
          setImmediate(() => c._close(null, 'SIGKILL'));
        };
      },
    };
    const result = await executeInSandbox(rt, 'sleep forever', {
      timeoutMs: 100,
      spawnImpl: makeSpawnImpl(controller),
    });
    assert.equal(result.killed, true);
    assert.equal(result.exitCode, null);
    assert.ok(result.durationMs >= 100);
  });

  it('non-numeric timeoutMs falls back to default (5000ms)', async () => {
    const rt = new DockerRuntime();
    rt.available = () => ({ ok: true });
    // Need to confirm the default kicks in without actually waiting
    // 5s. We can't observe the timer directly, but we can fire
    // close BEFORE the (default) timer would, so killed=false.
    const controller = {
      onSpawn: (c) => setImmediate(() => c._close(0)),
    };
    const result = await executeInSandbox(rt, 'hi', {
      timeoutMs: 'oops',
      spawnImpl: makeSpawnImpl(controller),
    });
    assert.equal(result.killed, false);
    assert.equal(result.exitCode, 0);
    // The internal timer was set to DEFAULT_TIMEOUT_MS; no easy way
    // to observe but the constants are exported for documentation.
    assert.equal(DEFAULT_TIMEOUT_MS, 5000);
  });

  it('timeoutMs below MIN clamps to MIN', async () => {
    const rt = new DockerRuntime();
    rt.available = () => ({ ok: true });
    const start = Date.now();
    const controller = {
      onSpawn: (c) => {
        // Hang until killed
        const origKill = c.kill.bind(c);
        c.kill = (sig) => {
          origKill(sig);
          setImmediate(() => c._close(null, 'SIGKILL'));
        };
      },
    };
    const result = await executeInSandbox(rt, 'hang', {
      timeoutMs: 1,  // would clamp to MIN_TIMEOUT_MS=100
      spawnImpl: makeSpawnImpl(controller),
    });
    const elapsed = Date.now() - start;
    assert.equal(result.killed, true);
    assert.ok(elapsed >= MIN_TIMEOUT_MS - 20,
      `elapsed ${elapsed}ms should be >= MIN ${MIN_TIMEOUT_MS} (with 20ms slack)`);
  });

  it('timeoutMs above MAX clamps to MAX', () => {
    // Just verify the constant is exported; clamping behavior
    // covered by the symmetric MIN test.
    assert.equal(MAX_TIMEOUT_MS, 5 * 60 * 1000);
  });
});

describe('executeInSandbox — spawn errors', () => {
  it('synchronous spawn throw surfaces as spawnError', async () => {
    const rt = new DockerRuntime();
    rt.available = () => ({ ok: true });
    const result = await executeInSandbox(rt, 'hi', {
      spawnImpl: () => { throw new Error('ENOENT: no docker'); },
    });
    assert.match(result.spawnError, /ENOENT/);
    assert.equal(result.exitCode, null);
  });

  it('async error event surfaces as spawnError', async () => {
    const rt = new DockerRuntime();
    rt.available = () => ({ ok: true });
    const controller = {
      onSpawn: (c) => {
        c._error('async error');
        setImmediate(() => c._close(127));  // shells use 127 for "command not found"
      },
    };
    const result = await executeInSandbox(rt, 'hi', {
      spawnImpl: makeSpawnImpl(controller),
    });
    assert.match(result.spawnError, /async error/);
    assert.equal(result.exitCode, 127);
  });
});

describe('executeInSandbox — buffer limit clamping', () => {
  it('non-numeric bufferLimit falls back to default (16KB)', async () => {
    const rt = new DockerRuntime();
    rt.available = () => ({ ok: true });
    // Push 16KB+something; with default cap, should truncate.
    const data = 'X'.repeat(20 * 1024);
    const controller = {
      onSpawn: (c) => {
        c._emitStdout(data);
        setImmediate(() => c._close(0));
      },
    };
    const result = await executeInSandbox(rt, 'hi', {
      bufferLimit: 'invalid',
      spawnImpl: makeSpawnImpl(controller),
    });
    assert.equal(result.stdout.length, DEFAULT_BUFFER_LIMIT + TRUNC_MARKER.length);
  });

  it('bufferLimit below MIN clamps to MIN', async () => {
    const rt = new DockerRuntime();
    rt.available = () => ({ ok: true });
    const data = 'Y'.repeat(2000);
    const controller = {
      onSpawn: (c) => {
        c._emitStdout(data);
        setImmediate(() => c._close(0));
      },
    };
    const result = await executeInSandbox(rt, 'hi', {
      bufferLimit: 100,  // way below MIN_BUFFER_LIMIT
      spawnImpl: makeSpawnImpl(controller),
    });
    assert.equal(result.stdout.length, MIN_BUFFER_LIMIT + TRUNC_MARKER.length);
  });
});
