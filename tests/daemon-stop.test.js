const assert = require('assert');
const { describe, it } = require('node:test');

// Test daemon-manager stop() logic by extracting and mocking its dependencies.
// We re-implement the stop logic using injectable functions to test all branches.

function createStopFn({ readPid, isProcessAlive, killProcess, execSyncFn, removePid, healthCheck, sleep, platform }) {
  return async function stop() {
    let pid = readPid();

    if (!pid) {
      const health = await healthCheck();
      if (!health) {
        return { error: 'Daemon is not running' };
      }
      return { error: 'Daemon responding but no PID file — kill manually' };
    }

    if (!isProcessAlive(pid)) {
      removePid();
      return { ok: true, note: 'Already dead, cleaned PID file' };
    }

    try {
      if (platform === 'win32') {
        execSyncFn(`taskkill /PID ${pid} /T /F`);
      } else {
        killProcess(pid, 'SIGTERM');
      }
    } catch (err) {
      if (!isProcessAlive(pid)) {
        removePid();
        return { ok: true, pid, note: 'Process exited during kill' };
      }
      return { error: `Failed to kill PID ${pid}: ${err.message}` };
    }

    for (let i = 0; i < 10; i++) {
      await sleep(300);
      if (!isProcessAlive(pid)) {
        removePid();
        return { ok: true, pid };
      }
    }

    if (platform !== 'win32') {
      try {
        killProcess(pid, 'SIGKILL');
      } catch {
        if (!isProcessAlive(pid)) {
          removePid();
          return { ok: true, pid, note: 'Process exited during SIGKILL' };
        }
      }

      for (let i = 0; i < 10; i++) {
        await sleep(200);
        if (!isProcessAlive(pid)) {
          removePid();
          return { ok: true, pid, note: 'Killed with SIGKILL' };
        }
      }
    }

    if (isProcessAlive(pid)) {
      return { error: `Failed to kill PID ${pid}: process survived SIGTERM and SIGKILL` };
    }

    removePid();
    return { ok: true, pid };
  };
}

describe('daemon stop() zombie fix', () => {
  it('returns error when no PID and no health', async () => {
    const stop = createStopFn({
      readPid: () => null,
      isProcessAlive: () => false,
      killProcess: () => {},
      execSyncFn: () => {},
      removePid: () => {},
      healthCheck: async () => null,
      sleep: async () => {},
      platform: 'linux'
    });

    const result = await stop();
    assert.ok(result.error);
    assert.ok(result.error.includes('not running'));
  });

  it('cleans PID file when process already dead', async () => {
    let pidRemoved = false;
    const stop = createStopFn({
      readPid: () => 12345,
      isProcessAlive: () => false,
      killProcess: () => {},
      execSyncFn: () => {},
      removePid: () => { pidRemoved = true; },
      healthCheck: async () => null,
      sleep: async () => {},
      platform: 'linux'
    });

    const result = await stop();
    assert.ok(result.ok);
    assert.strictEqual(result.note, 'Already dead, cleaned PID file');
    assert.ok(pidRemoved);
  });

  it('kills with SIGTERM and verifies death', async () => {
    let killed = false;
    let aliveCount = 0;
    const stop = createStopFn({
      readPid: () => 12345,
      isProcessAlive: () => {
        aliveCount++;
        // First call: alive (pre-check), second call: dead (after SIGTERM wait)
        return aliveCount <= 1;
      },
      killProcess: (pid, sig) => { killed = true; },
      execSyncFn: () => {},
      removePid: () => {},
      healthCheck: async () => null,
      sleep: async () => {},
      platform: 'linux'
    });

    const result = await stop();
    assert.ok(result.ok);
    assert.strictEqual(result.pid, 12345);
    assert.ok(killed);
  });

  it('escalates to SIGKILL when SIGTERM fails', async () => {
    let signals = [];
    let aliveCount = 0;
    const stop = createStopFn({
      readPid: () => 99999,
      isProcessAlive: () => {
        aliveCount++;
        // alive for pre-check + all 10 SIGTERM waits, then dead after SIGKILL
        return aliveCount <= 12;
      },
      killProcess: (pid, sig) => { signals.push(sig); },
      execSyncFn: () => {},
      removePid: () => {},
      healthCheck: async () => null,
      sleep: async () => {},
      platform: 'linux'
    });

    const result = await stop();
    assert.ok(result.ok);
    assert.ok(signals.includes('SIGTERM'));
    assert.ok(signals.includes('SIGKILL'));
    assert.strictEqual(result.note, 'Killed with SIGKILL');
  });

  it('returns error when process survives SIGKILL', async () => {
    const stop = createStopFn({
      readPid: () => 66666,
      isProcessAlive: () => true, // never dies
      killProcess: () => {},
      execSyncFn: () => {},
      removePid: () => {},
      healthCheck: async () => null,
      sleep: async () => {},
      platform: 'linux'
    });

    const result = await stop();
    assert.ok(result.error);
    assert.ok(result.error.includes('survived SIGTERM and SIGKILL'));
    assert.ok(result.error.includes('66666'));
  });

  it('Windows: uses taskkill and skips SIGKILL', async () => {
    let taskkillCmd = null;
    let aliveCount = 0;
    const stop = createStopFn({
      readPid: () => 77777,
      isProcessAlive: () => {
        aliveCount++;
        return aliveCount <= 1; // alive on pre-check, dead after taskkill
      },
      killProcess: () => { throw new Error('should not call process.kill on Windows'); },
      execSyncFn: (cmd) => { taskkillCmd = cmd; },
      removePid: () => {},
      healthCheck: async () => null,
      sleep: async () => {},
      platform: 'win32'
    });

    const result = await stop();
    assert.ok(result.ok);
    assert.ok(taskkillCmd.includes('taskkill'));
    assert.ok(taskkillCmd.includes('77777'));
  });

  it('Windows: returns error when taskkill fails and process survives', async () => {
    const stop = createStopFn({
      readPid: () => 88888,
      isProcessAlive: () => true,
      killProcess: () => {},
      execSyncFn: () => {},
      removePid: () => {},
      healthCheck: async () => null,
      sleep: async () => {},
      platform: 'win32'
    });

    const result = await stop();
    assert.ok(result.error);
    assert.ok(result.error.includes('survived'));
  });

  it('handles kill error with race condition (process dies during kill)', async () => {
    let aliveCount = 0;
    let pidRemoved = false;
    const stop = createStopFn({
      readPid: () => 55555,
      isProcessAlive: (pid) => {
        aliveCount++;
        // First call: alive (pre-check), second call (after kill error): dead
        return aliveCount <= 1;
      },
      killProcess: () => { throw new Error('ESRCH'); },
      execSyncFn: () => {},
      removePid: () => { pidRemoved = true; },
      healthCheck: async () => null,
      sleep: async () => {},
      platform: 'linux'
    });

    const result = await stop();
    assert.ok(result.ok);
    assert.strictEqual(result.note, 'Process exited during kill');
    assert.ok(pidRemoved);
  });

  it('no PID but daemon responding returns manual kill hint', async () => {
    const stop = createStopFn({
      readPid: () => null,
      isProcessAlive: () => false,
      killProcess: () => {},
      execSyncFn: () => {},
      removePid: () => {},
      healthCheck: async () => ({ ok: true }),
      sleep: async () => {},
      platform: 'linux'
    });

    const result = await stop();
    assert.ok(result.error);
    assert.ok(result.error.includes('kill manually'));
  });
});
