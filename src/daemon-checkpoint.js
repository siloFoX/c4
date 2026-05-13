'use strict';

// (11.73) Per-worker checkpoint + graceful shutdown for `c4 daemon stop`.
// The daemon enumerates live workers, writes
// <projectRoot>/.c4/checkpoints/<name>.json for each, sends SIGTERM, then
// waits CHECKPOINT_GRACE_MS before escalating to SIGKILL. Worktrees and
// branches are intentionally preserved so an operator can recover the
// session after restart (`cat .c4/checkpoints/<name>.json` to see the
// last branch / worktree / task summary).

const fs = require('fs');
const path = require('path');
const os = require('os');

// 30s ceiling between SIGTERM and SIGKILL. Future PRs can tune via a single
// constant change. Kept under systemd's default TimeoutStopSec=90s so the
// service unit never trips the kill timeout before this path finishes.
const CHECKPOINT_GRACE_MS = 30_000;

const DEFAULT_POLL_MS = 250;

// Default version stamp recorded in the checkpoint payload. Callers (the
// daemon) should pass the live `manager._daemonVersion` so the checkpoint
// records the exact daemon that wrote it.
const DEFAULT_VERSION = '1.11.91';

function checkpointDir(projectRoot) {
  return path.join(projectRoot, '.c4', 'checkpoints');
}

function _firstLineTrimmed(text, max) {
  if (typeof text !== 'string') return '';
  const head = text.replace(/\r/g, '').split('\n')[0] || '';
  const t = head.trim();
  return t.length > max ? t.slice(0, max) : t;
}

function _buildLastTask(worker, nowIso) {
  if (!worker) return null;
  if (worker.lastTask && typeof worker.lastTask.summary === 'string') {
    const summary = _firstLineTrimmed(worker.lastTask.summary, 200);
    if (!summary) return null;
    return {
      summary,
      timestamp: typeof worker.lastTask.timestamp === 'string' ? worker.lastTask.timestamp : nowIso,
    };
  }
  const text = typeof worker._taskText === 'string' ? worker._taskText : null;
  if (!text) return null;
  const summary = _firstLineTrimmed(text, 200);
  if (!summary) return null;
  const timestamp = typeof worker._taskStartedAt === 'string' ? worker._taskStartedAt : nowIso;
  return { summary, timestamp };
}

function buildCheckpointPayload(worker, opts = {}) {
  const now = opts.now || new Date().toISOString();
  const version = opts.version || DEFAULT_VERSION;
  const pid = (worker.proc && typeof worker.proc.pid === 'number')
    ? worker.proc.pid
    : (typeof worker.pid === 'number' ? worker.pid : null);
  return {
    name: worker.name,
    branch: worker.branch || null,
    worktree: worker.worktree || null,
    pid,
    target: worker.target || 'local',
    tier: worker.tier || 'worker',
    lastTask: _buildLastTask(worker, now),
    stoppedAt: now,
    version,
  };
}

// Atomic write: stage under os.tmpdir() then rename into place so a crash
// mid-write never leaves a half-written file.
function writeCheckpoint(worker, projectRoot, opts = {}) {
  if (!worker || typeof worker.name !== 'string' || worker.name === '') {
    throw new Error('writeCheckpoint: missing worker.name');
  }
  const fsLib = opts.fs || fs;
  const dir = opts.dir || checkpointDir(projectRoot);
  const tmpDir = opts.tmpDir || os.tmpdir();
  fsLib.mkdirSync(dir, { recursive: true });
  const payload = buildCheckpointPayload(worker, opts);
  const finalPath = path.join(dir, `${worker.name}.json`);
  const tmpPath = path.join(tmpDir, `${worker.name}.${process.pid}.json.tmp`);
  fsLib.writeFileSync(tmpPath, JSON.stringify(payload, null, 2));
  fsLib.renameSync(tmpPath, finalPath);
  return { path: finalPath, payload, tmpPath };
}

// Graceful shutdown: write checkpoints, SIGTERM, poll, SIGKILL.
// Returns an array of per-worker results: { name, checkpoint, outcome }.
//
// Contract:
//   workers          iterable of session objects (must expose .name + .proc.pid + .alive)
//   skipCheckpoint   true on uncaughtException path -- emergency shutdown
//                    must NOT write a checkpoint; worker state may be
//                    inconsistent and the recovery flow is different
//                    from a clean stop.
async function shutdownWorkers(workers, opts = {}) {
  const list = Array.from(workers || []);
  const projectRoot = opts.projectRoot || path.join(__dirname, '..');
  const skipCheckpoint = opts.skipCheckpoint === true;
  const graceMs = typeof opts.graceMs === 'number' ? opts.graceMs : CHECKPOINT_GRACE_MS;
  const pollMs = typeof opts.pollMs === 'number' ? opts.pollMs : DEFAULT_POLL_MS;
  const log = typeof opts.log === 'function' ? opts.log : (() => {});
  const killFn = opts.kill || ((pid, sig) => { try { process.kill(pid, sig); } catch {} });
  const isAlive = opts.isAlive || ((w) => !!(w && w.alive && w.proc && typeof w.proc.pid === 'number'));
  const version = opts.version || DEFAULT_VERSION;
  const now = opts.now || (() => Date.now());
  const delay = opts.delay || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const writer = opts.writeCheckpoint || writeCheckpoint;

  const results = [];
  const survivors = new Set();
  const startIso = new Date().toISOString();

  for (const w of list) {
    const entry = { name: w && w.name, checkpoint: null, outcome: null };

    if (!skipCheckpoint) {
      try {
        const r = writer(w, projectRoot, { version, now: startIso });
        entry.checkpoint = r && r.path ? r.path : null;
      } catch (err) {
        log(`[shutdown] ${entry.name} checkpoint write failed: ${err && err.message ? err.message : String(err)}`);
      }
    }

    if (!isAlive(w)) {
      entry.outcome = 'graceful exit';
      log(`[shutdown] ${entry.name}: graceful exit`);
      results.push(entry);
      continue;
    }

    try {
      killFn(w.proc.pid, 'SIGTERM');
      survivors.add(w);
    } catch (err) {
      entry.outcome = 'kill-error';
      log(`[shutdown] ${entry.name} SIGTERM failed: ${err && err.message ? err.message : String(err)}`);
    }
    results.push(entry);
  }

  if (survivors.size > 0) {
    const startMs = now();
    while (survivors.size > 0 && (now() - startMs) < graceMs) {
      await delay(pollMs);
      for (const w of [...survivors]) {
        if (!isAlive(w)) survivors.delete(w);
      }
    }
    const elapsedSec = Math.max(0, Math.round((now() - startMs) / 1000));
    for (const entry of results) {
      if (entry.outcome) continue;
      const w = list.find((x) => x && x.name === entry.name);
      if (!w || !isAlive(w)) {
        entry.outcome = 'graceful exit';
        log(`[shutdown] ${entry.name}: graceful exit`);
      } else {
        try { killFn(w.proc.pid, 'SIGKILL'); }
        catch (err) {
          log(`[shutdown] ${entry.name} SIGKILL failed: ${err && err.message ? err.message : String(err)}`);
        }
        entry.outcome = `force-killed after ${elapsedSec}s`;
        log(`[shutdown] ${entry.name}: force-killed after ${elapsedSec}s`);
      }
    }
  }

  return results;
}

module.exports = {
  CHECKPOINT_GRACE_MS,
  DEFAULT_POLL_MS,
  DEFAULT_VERSION,
  checkpointDir,
  buildCheckpointPayload,
  writeCheckpoint,
  shutdownWorkers,
};
