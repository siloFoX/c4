// One-shot wall-clock profiler for daemon list() and autonomous status.
// Builds N synthetic worker entries directly on a PtyManager instance and
// times the same hot code paths the HTTP handlers call.

'use strict';

const path = require('path');
const PtyManager = require(path.resolve(__dirname, '..', 'src', 'pty-manager'));

const N = parseInt(process.argv[2] || '20', 10);
const ITER = parseInt(process.argv[3] || '100', 10);

const mgr = new PtyManager({ idleThresholdMs: 1000, snapshotIntervalMs: 1000 });

// Seed N fake workers in the internal map. We bypass create() entirely so
// no real PTYs spawn — list() just enumerates whatever's in the map.
for (let i = 0; i < N; i++) {
  const name = `fake-w${i}`;
  const worker = {
    name,
    command: 'claude',
    proc: { pid: process.pid },
    alive: true,
    target: 'local',
    branch: `c4/auto-${i}`,
    worktree: null,
    parent: null,
    snapshots: [],
    snapshotIndex: 0,
    lastDataTime: Date.now() - 500,
    state: 'idle',
    screen: null,
    _errorHistory: [],
    _interventionState: null,
    _hadIntervention: false,
    _lastInterventionAt: null,
    _lastQuestion: null,
    _smState: null,
    _pinnedMemory: null,
    _lastCpuSample: null,
    kind: 'spawned',
    scopeGuard: null,
  };
  mgr.workers.set(name, worker);
}

function bucket(times) {
  const sorted = times.slice().sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const max = sorted[sorted.length - 1];
  const mean = sorted.reduce((s, x) => s + x, 0) / sorted.length;
  return { p50, p95, max, mean };
}

function profileList() {
  const wallTimes = [];
  for (let i = 0; i < ITER; i++) {
    const t0 = process.hrtime.bigint();
    const res = mgr.list();
    JSON.stringify(res);
    const t1 = process.hrtime.bigint();
    wallTimes.push(Number(t1 - t0) / 1e6);
  }
  return bucket(wallTimes);
}

// Sub-step breakdown: how much time is spent inside JSON.stringify vs the
// rest of list() (intervention check, worker-metrics sample, failure hint).
function profileBreakdown() {
  const listTimes = [];
  const stringifyTimes = [];
  const sampleTimes = [];
  const workerMetrics = require(path.resolve(__dirname, '..', 'src', 'worker-metrics'));
  for (let i = 0; i < ITER; i++) {
    const t0 = process.hrtime.bigint();
    const res = mgr.list();
    const t1 = process.hrtime.bigint();
    JSON.stringify(res);
    const t2 = process.hrtime.bigint();
    let sampleNs = 0n;
    for (const w of res.workers) {
      const ts = process.hrtime.bigint();
      workerMetrics.sample(w.pid, null);
      sampleNs += process.hrtime.bigint() - ts;
    }
    listTimes.push(Number(t1 - t0) / 1e6);
    stringifyTimes.push(Number(t2 - t1) / 1e6);
    sampleTimes.push(Number(sampleNs) / 1e6);
  }
  return {
    list: bucket(listTimes),
    stringify: bucket(stringifyTimes),
    workerMetricsSample: bucket(sampleTimes),
  };
}

const total = profileList();
const breakdown = profileBreakdown();

console.log(JSON.stringify({ N, ITER, total, breakdown }, null, 2));
