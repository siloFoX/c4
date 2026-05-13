'use strict';

// (11.73) Tests for src/daemon-checkpoint.js -- the per-worker checkpoint
// writer + graceful shutdown sequence used by `c4 daemon stop`.
//
// Mirrors the DI / mock pattern in tests/daemon-stop.test.js: the unit under
// test takes injectable kill / clock / delay / fs handles so the tests can
// jump time and assert payload + signal sequencing without spawning real
// processes.

const assert = require('assert');
const { describe, it } = require('node:test');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ckpt = require('../src/daemon-checkpoint');

function makeFakeFs() {
  const writes = {};
  const renames = [];
  const dirs = [];
  return {
    mkdirSync: (dir) => { dirs.push(dir); },
    writeFileSync: (p, data) => { writes[p] = data; },
    renameSync: (src, dst) => { renames.push({ src, dst }); writes[dst] = writes[src]; delete writes[src]; },
    writes,
    renames,
    dirs,
  };
}

function makeWorker(overrides = {}) {
  const base = {
    name: 'w1',
    alive: true,
    proc: { pid: 11111 },
    branch: 'c4/auto-w1',
    worktree: '/root/c4-worktree-auto-w1',
    target: 'local',
    tier: 'worker',
    _taskText: 'fix bug in src/foo.js',
    _taskStartedAt: '2026-05-13T16:30:00.000Z',
  };
  return Object.assign(base, overrides);
}

function makeFakeClock() {
  const state = { now: 0 };
  return {
    now: () => state.now,
    advance: (ms) => { state.now += ms; },
    state,
  };
}

// Drives shutdownWorkers' poll loop deterministically by capturing the
// delay() callbacks and advancing the fake clock on demand. Mirrors what
// vi.useFakeTimers gives you, without the dependency.
function makeFakeDelay(clock) {
  const pending = [];
  return {
    delay: (ms) => new Promise((resolve) => { pending.push({ ms, resolve }); }),
    flush: async () => {
      while (pending.length) {
        const entry = pending.shift();
        clock.advance(entry.ms);
        entry.resolve();
        await Promise.resolve();
      }
    },
    pending,
  };
}

describe('writeCheckpoint()', () => {
  it('emits the full payload schema with all expected fields', () => {
    const fakeFs = makeFakeFs();
    const w = makeWorker();
    const r = ckpt.writeCheckpoint(w, '/proj', {
      fs: fakeFs,
      now: '2026-05-13T16:30:00.000Z',
      version: '1.11.91',
      tmpDir: '/tmp',
    });
    assert.strictEqual(r.payload.name, 'w1');
    assert.strictEqual(r.payload.branch, 'c4/auto-w1');
    assert.strictEqual(r.payload.worktree, '/root/c4-worktree-auto-w1');
    assert.strictEqual(r.payload.pid, 11111);
    assert.strictEqual(r.payload.target, 'local');
    assert.strictEqual(r.payload.tier, 'worker');
    assert.strictEqual(r.payload.lastTask.summary, 'fix bug in src/foo.js');
    assert.strictEqual(r.payload.lastTask.timestamp, '2026-05-13T16:30:00.000Z');
    assert.strictEqual(r.payload.stoppedAt, '2026-05-13T16:30:00.000Z');
    assert.strictEqual(r.payload.version, '1.11.91');
    const expectedDir = path.join('/proj', '.c4', 'checkpoints');
    assert.strictEqual(r.path, path.join(expectedDir, 'w1.json'));
  });

  it('serializes payload as readable JSON in the final path', () => {
    const fakeFs = makeFakeFs();
    const w = makeWorker();
    const r = ckpt.writeCheckpoint(w, '/proj', { fs: fakeFs, now: '2026-05-13T16:30:00.000Z', tmpDir: '/tmp' });
    const written = fakeFs.writes[r.path];
    assert.ok(typeof written === 'string');
    const parsed = JSON.parse(written);
    assert.strictEqual(parsed.name, 'w1');
    assert.strictEqual(parsed.pid, 11111);
    // Pretty-printed (two-space indent) so an operator running `cat` can read it.
    assert.ok(written.includes('\n  "name"'));
  });

  it('writes atomically: stages to a tmp file then renames into place', () => {
    const fakeFs = makeFakeFs();
    const w = makeWorker();
    const r = ckpt.writeCheckpoint(w, '/proj', { fs: fakeFs, tmpDir: '/tmp' });
    assert.strictEqual(fakeFs.renames.length, 1);
    assert.strictEqual(fakeFs.renames[0].dst, r.path);
    assert.ok(fakeFs.renames[0].src.endsWith('.json.tmp'));
    assert.ok(fakeFs.renames[0].src.startsWith('/tmp/'));
  });

  it('ensures .c4/checkpoints/ exists via mkdir recursive', () => {
    const fakeFs = makeFakeFs();
    const w = makeWorker();
    ckpt.writeCheckpoint(w, '/proj', { fs: fakeFs, tmpDir: '/tmp' });
    assert.deepStrictEqual(fakeFs.dirs, [path.join('/proj', '.c4', 'checkpoints')]);
  });

  it('sets lastTask=null when worker has no task text', () => {
    const fakeFs = makeFakeFs();
    const w = makeWorker({ _taskText: null });
    const r = ckpt.writeCheckpoint(w, '/proj', { fs: fakeFs, tmpDir: '/tmp' });
    assert.strictEqual(r.payload.lastTask, null);
  });

  it('truncates lastTask.summary to 200 chars and keeps only the first line', () => {
    const fakeFs = makeFakeFs();
    const long = 'A'.repeat(250) + '\nsecond line that should be dropped';
    const w = makeWorker({ _taskText: long });
    const r = ckpt.writeCheckpoint(w, '/proj', { fs: fakeFs, tmpDir: '/tmp', now: '2026-05-13T16:30:00.000Z' });
    assert.strictEqual(r.payload.lastTask.summary.length, 200);
    assert.ok(!r.payload.lastTask.summary.includes('\n'));
    assert.ok(!r.payload.lastTask.summary.includes('second line'));
  });

  it('falls back to "worker" tier and "local" target when worker omits them', () => {
    const fakeFs = makeFakeFs();
    const w = makeWorker({ tier: undefined, target: undefined });
    const r = ckpt.writeCheckpoint(w, '/proj', { fs: fakeFs, tmpDir: '/tmp' });
    assert.strictEqual(r.payload.tier, 'worker');
    assert.strictEqual(r.payload.target, 'local');
  });

  it('throws when worker.name is missing or empty', () => {
    const fakeFs = makeFakeFs();
    assert.throws(() => ckpt.writeCheckpoint({ name: '' }, '/proj', { fs: fakeFs, tmpDir: '/tmp' }), /missing worker.name/);
    assert.throws(() => ckpt.writeCheckpoint({}, '/proj', { fs: fakeFs, tmpDir: '/tmp' }), /missing worker.name/);
  });

  it('end-to-end: writes a real file under a tmp project root', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-ckpt-test-'));
    try {
      const w = makeWorker({ name: 'real-w' });
      const r = ckpt.writeCheckpoint(w, tmpRoot);
      assert.strictEqual(r.path, path.join(tmpRoot, '.c4', 'checkpoints', 'real-w.json'));
      const onDisk = JSON.parse(fs.readFileSync(r.path, 'utf8'));
      assert.strictEqual(onDisk.name, 'real-w');
      assert.strictEqual(onDisk.branch, 'c4/auto-w1');
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});

describe('shutdownWorkers()', () => {
  it('writes a checkpoint for every live worker and sends SIGTERM to each pid', async () => {
    const fakeFs = makeFakeFs();
    const w1 = makeWorker({ name: 'a', proc: { pid: 1001 } });
    const w2 = makeWorker({ name: 'b', proc: { pid: 1002 } });
    const signals = [];
    const clock = makeFakeClock();
    const fakeDelay = makeFakeDelay(clock);
    const isAlive = () => false; // both already-dead after SIGTERM -- short-circuits the poll

    const p = ckpt.shutdownWorkers([w1, w2], {
      projectRoot: '/proj',
      graceMs: 50,
      pollMs: 10,
      now: clock.now,
      delay: fakeDelay.delay,
      isAlive,
      kill: (pid, sig) => { signals.push([pid, sig]); },
      writeCheckpoint: (worker, root, o) => ckpt.writeCheckpoint(worker, root, { ...o, fs: fakeFs, tmpDir: '/tmp' }),
    });
    await fakeDelay.flush();
    const results = await p;

    // checkpoint for each
    assert.strictEqual(results.length, 2);
    assert.ok(results[0].checkpoint.endsWith('/a.json'));
    assert.ok(results[1].checkpoint.endsWith('/b.json'));
    // pre-poll outcome: workers report as 'graceful exit' since isAlive=false
    assert.ok(results.every((r) => r.outcome === 'graceful exit'));
    // No SIGTERM was sent because isAlive() returned false up front -- contract
    // is "skip the kill on a dead worker, but still write the checkpoint".
    assert.deepStrictEqual(signals, []);
  });

  it('sends SIGTERM to every live worker before polling', async () => {
    const fakeFs = makeFakeFs();
    const w1 = makeWorker({ name: 'a', proc: { pid: 1001 } });
    const w2 = makeWorker({ name: 'b', proc: { pid: 1002 } });
    const signals = [];
    const clock = makeFakeClock();
    const fakeDelay = makeFakeDelay(clock);
    let aliveMap = new Map([['a', true], ['b', true]]);
    const isAlive = (w) => aliveMap.get(w.name) === true;

    const p = ckpt.shutdownWorkers([w1, w2], {
      projectRoot: '/proj',
      graceMs: 100,
      pollMs: 10,
      now: clock.now,
      delay: fakeDelay.delay,
      isAlive,
      kill: (pid, sig) => {
        signals.push([pid, sig]);
        // simulate clean exit after SIGTERM
        if (sig === 'SIGTERM') {
          if (pid === 1001) aliveMap.set('a', false);
          if (pid === 1002) aliveMap.set('b', false);
        }
      },
      writeCheckpoint: (worker, root, o) => ckpt.writeCheckpoint(worker, root, { ...o, fs: fakeFs, tmpDir: '/tmp' }),
    });
    await fakeDelay.flush();
    const results = await p;

    assert.strictEqual(signals.length, 2);
    assert.deepStrictEqual(signals.sort(), [[1001, 'SIGTERM'], [1002, 'SIGTERM']]);
    assert.ok(results.every((r) => r.outcome === 'graceful exit'));
  });

  it('resolves early once all workers exit (no full 30s wait)', async () => {
    const fakeFs = makeFakeFs();
    const w = makeWorker({ name: 'a', proc: { pid: 1001 } });
    const clock = makeFakeClock();
    const fakeDelay = makeFakeDelay(clock);
    let alive = true;
    const isAlive = () => alive;

    const p = ckpt.shutdownWorkers([w], {
      projectRoot: '/proj',
      graceMs: 30_000,
      pollMs: 250,
      now: clock.now,
      delay: fakeDelay.delay,
      isAlive,
      kill: () => { alive = false; }, // dies immediately on SIGTERM
      writeCheckpoint: (worker, root, o) => ckpt.writeCheckpoint(worker, root, { ...o, fs: fakeFs, tmpDir: '/tmp' }),
    });
    await fakeDelay.flush();
    const results = await p;

    assert.strictEqual(results[0].outcome, 'graceful exit');
    // Only one delay() tick was consumed -- early-exit contract.
    assert.ok(clock.now() <= 250);
  });

  it('escalates to SIGKILL after CHECKPOINT_GRACE_MS when the worker never exits', async () => {
    const fakeFs = makeFakeFs();
    const w = makeWorker({ name: 'stuck', proc: { pid: 4242 } });
    const clock = makeFakeClock();
    const fakeDelay = makeFakeDelay(clock);
    const signals = [];

    const p = ckpt.shutdownWorkers([w], {
      projectRoot: '/proj',
      graceMs: 30_000,
      pollMs: 250,
      now: clock.now,
      delay: fakeDelay.delay,
      isAlive: () => true, // never exits
      kill: (pid, sig) => { signals.push([pid, sig]); },
      writeCheckpoint: (worker, root, o) => ckpt.writeCheckpoint(worker, root, { ...o, fs: fakeFs, tmpDir: '/tmp' }),
    });
    await fakeDelay.flush();
    const results = await p;

    assert.ok(signals.some((s) => s[1] === 'SIGTERM'));
    assert.ok(signals.some((s) => s[1] === 'SIGKILL'));
    assert.ok(/^force-killed after \d+s$/.test(results[0].outcome), `unexpected outcome: ${results[0].outcome}`);
    // Outcome reports the configured grace, not zero.
    assert.ok(clock.now() >= 30_000);
  });

  it('emits "graceful exit" log line per clean worker and "force-killed" per stuck worker', async () => {
    const fakeFs = makeFakeFs();
    const fast = makeWorker({ name: 'fast', proc: { pid: 1 } });
    const slow = makeWorker({ name: 'slow', proc: { pid: 2 } });
    const clock = makeFakeClock();
    const fakeDelay = makeFakeDelay(clock);
    const logs = [];
    let fastAlive = true;
    const isAlive = (w) => {
      if (w.name === 'fast') return fastAlive;
      return true; // slow never exits
    };

    const p = ckpt.shutdownWorkers([fast, slow], {
      projectRoot: '/proj',
      graceMs: 30_000,
      pollMs: 250,
      now: clock.now,
      delay: fakeDelay.delay,
      isAlive,
      kill: (pid, sig) => { if (sig === 'SIGTERM' && pid === 1) fastAlive = false; },
      log: (msg) => logs.push(msg),
      writeCheckpoint: (worker, root, o) => ckpt.writeCheckpoint(worker, root, { ...o, fs: fakeFs, tmpDir: '/tmp' }),
    });
    await fakeDelay.flush();
    await p;

    assert.ok(logs.some((m) => m.includes('fast') && m.includes('graceful exit')), logs.join(' | '));
    assert.ok(logs.some((m) => m.includes('slow') && m.includes('force-killed after')), logs.join(' | '));
  });

  it('does NOT write checkpoints when skipCheckpoint=true (uncaughtException path)', async () => {
    const writes = [];
    const w = makeWorker({ name: 'crash', proc: { pid: 99 } });
    const clock = makeFakeClock();
    const fakeDelay = makeFakeDelay(clock);

    const p = ckpt.shutdownWorkers([w], {
      projectRoot: '/proj',
      skipCheckpoint: true,
      graceMs: 100,
      pollMs: 10,
      now: clock.now,
      delay: fakeDelay.delay,
      isAlive: () => false,
      kill: () => {},
      writeCheckpoint: (worker) => { writes.push(worker.name); return { path: '/never' }; },
    });
    await fakeDelay.flush();
    const results = await p;

    assert.strictEqual(writes.length, 0);
    assert.strictEqual(results[0].checkpoint, null);
  });

  it('records the checkpoint path on each result entry', async () => {
    const fakeFs = makeFakeFs();
    const w = makeWorker({ name: 'pathy', proc: { pid: 7 } });
    const clock = makeFakeClock();
    const fakeDelay = makeFakeDelay(clock);
    const p = ckpt.shutdownWorkers([w], {
      projectRoot: '/proj',
      graceMs: 50,
      pollMs: 10,
      now: clock.now,
      delay: fakeDelay.delay,
      isAlive: () => false,
      kill: () => {},
      writeCheckpoint: (worker, root, o) => ckpt.writeCheckpoint(worker, root, { ...o, fs: fakeFs, tmpDir: '/tmp' }),
    });
    await fakeDelay.flush();
    const results = await p;
    assert.strictEqual(results[0].checkpoint, path.join('/proj', '.c4', 'checkpoints', 'pathy.json'));
  });

  it('survives a kill error and reports outcome=kill-error', async () => {
    const fakeFs = makeFakeFs();
    const w = makeWorker({ name: 'badkill', proc: { pid: 8 } });
    const clock = makeFakeClock();
    const fakeDelay = makeFakeDelay(clock);
    const p = ckpt.shutdownWorkers([w], {
      projectRoot: '/proj',
      graceMs: 50,
      pollMs: 10,
      now: clock.now,
      delay: fakeDelay.delay,
      isAlive: () => true,
      kill: () => { throw new Error('ESRCH'); },
      writeCheckpoint: (worker, root, o) => ckpt.writeCheckpoint(worker, root, { ...o, fs: fakeFs, tmpDir: '/tmp' }),
    });
    await fakeDelay.flush();
    const results = await p;
    assert.strictEqual(results[0].outcome, 'kill-error');
  });

  it('tolerates a writeCheckpoint failure and still SIGTERMs the worker', async () => {
    const w = makeWorker({ name: 'fsfail', proc: { pid: 99 } });
    const clock = makeFakeClock();
    const fakeDelay = makeFakeDelay(clock);
    const signals = [];
    const logs = [];
    const p = ckpt.shutdownWorkers([w], {
      projectRoot: '/proj',
      graceMs: 50,
      pollMs: 10,
      now: clock.now,
      delay: fakeDelay.delay,
      isAlive: () => false, // already-dead, so skip kill
      kill: (pid, sig) => { signals.push([pid, sig]); },
      log: (msg) => logs.push(msg),
      writeCheckpoint: () => { throw new Error('disk full'); },
    });
    await fakeDelay.flush();
    const results = await p;
    assert.strictEqual(results[0].checkpoint, null);
    assert.ok(logs.some((m) => m.includes('checkpoint write failed')));
    // already-dead so signals stay empty; key point: shutdown did not throw.
    assert.strictEqual(results[0].outcome, 'graceful exit');
  });

  it('CHECKPOINT_GRACE_MS exports the documented 30s ceiling', () => {
    assert.strictEqual(ckpt.CHECKPOINT_GRACE_MS, 30_000);
  });

  it('daemon.js wires shutdownWorkers BEFORE server.close() so the listening socket closes last', () => {
    // Read the source so we do not have to spawn the daemon. The contract is
    // a textual ordering: `await daemonCheckpoint.shutdownWorkers(` must
    // appear before `server.close()` in _gracefulShutdown.
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'daemon.js'), 'utf8');
    const shutdownIdx = src.indexOf('daemonCheckpoint.shutdownWorkers(');
    const closeIdx = src.indexOf('server.close()', shutdownIdx);
    assert.ok(shutdownIdx > 0, 'expected daemon.js to call daemonCheckpoint.shutdownWorkers');
    assert.ok(closeIdx > shutdownIdx, 'expected server.close() to come after shutdownWorkers');
  });
});
