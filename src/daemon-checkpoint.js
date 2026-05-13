'use strict';

// (11.73) Per-worker checkpoint + graceful shutdown for `c4 daemon stop`.
// The daemon enumerates live workers, writes
// <projectRoot>/.c4/checkpoints/<name>.json for each, sends SIGTERM, then
// waits CHECKPOINT_GRACE_MS before escalating to SIGKILL. Worktrees and
// branches are intentionally preserved so an operator can recover the
// session after restart (`cat .c4/checkpoints/<name>.json` to see the
// last branch / worktree / task summary).
//
// (11.74) Auto-reconcile on daemon start. reconcileOrphans() enumerates
// c4-worktree-* paths left over from the previous run, pairs them with
// matching <projectRoot>/.c4/checkpoints/<name>.json, and decides per
// worker: ADOPT (pid still alive) or LOST (no checkpoint / dead pid /
// malformed json). The pure planner returns an array of decisions so the
// PtyManager can apply them (mutate workers / lostWorkers maps) and the
// daemon HTTP layer can reuse the same algorithm for
// POST /api/workers/:name/reconnect.

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
const DEFAULT_VERSION = '1.11.92';

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

// (11.74) Default check: process.kill(pid, 0) succeeds iff the pid is
// alive and we may signal it. ESRCH means dead; EPERM means alive but
// not signallable (still alive for our purposes). Injectable so tests
// drive the live/dead branches without touching real PIDs.
function defaultIsPidAlive(pid) {
  if (typeof pid !== 'number' || !Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if (err && err.code === 'EPERM') return true;
    return false;
  }
}

// (11.74) Read + parse a single checkpoint file. Returns
// { found, payload, malformed, error } so callers can distinguish
// "no checkpoint" (treat as LOST/no-checkpoint) from "checkpoint
// present but malformed" (treat as LOST/malformed-checkpoint).
function readCheckpoint(name, projectRoot, opts = {}) {
  const fsLib = opts.fs || fs;
  const dir = opts.dir || checkpointDir(projectRoot);
  const filePath = path.join(dir, `${name}.json`);
  let raw;
  try {
    raw = fsLib.readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return { found: false, path: filePath, payload: null, malformed: false, error: null };
    }
    return { found: false, path: filePath, payload: null, malformed: false, error: err };
  }
  try {
    const payload = JSON.parse(raw);
    return { found: true, path: filePath, payload, malformed: false, error: null };
  } catch (err) {
    return { found: true, path: filePath, payload: null, malformed: true, error: err };
  }
}

// (11.74) Derive a worker name from a c4-worktree-<name> path. Returns
// null when the basename doesn't carry the c4-worktree- prefix.
function workerNameFromWorktreePath(worktreePath) {
  if (typeof worktreePath !== 'string' || !worktreePath) return null;
  const base = path.basename(worktreePath);
  if (!base.startsWith('c4-worktree-')) return null;
  const name = base.slice('c4-worktree-'.length);
  return name || null;
}

// (11.74) Build a single reconcile plan for a (worktree, name) pair.
// Pulled out so the daemon endpoint POST /api/workers/:name/reconnect
// can run the same logic on a single name without enumerating the
// whole worktree list.
function planReconnect(name, opts = {}) {
  if (!name || typeof name !== 'string') {
    return { name: null, action: 'lost', reason: 'invalid-name' };
  }
  const projectRoot = opts.projectRoot;
  const isPidAlive = opts.isPidAlive || defaultIsPidAlive;
  const ck = readCheckpoint(name, projectRoot, opts);
  if (!ck.found) {
    return { name, action: 'lost', reason: 'no-checkpoint', checkpoint: null };
  }
  if (ck.malformed) {
    return {
      name,
      action: 'lost',
      reason: 'malformed-checkpoint',
      checkpoint: null,
      checkpointPath: ck.path,
    };
  }
  const payload = ck.payload || {};
  const pid = typeof payload.pid === 'number' ? payload.pid : null;
  if (pid == null) {
    return {
      name,
      action: 'lost',
      reason: 'no-pid',
      checkpoint: payload,
      checkpointPath: ck.path,
    };
  }
  if (!isPidAlive(pid)) {
    return {
      name,
      action: 'lost',
      reason: 'pid-dead',
      pid,
      checkpoint: payload,
      checkpointPath: ck.path,
    };
  }
  return {
    name,
    action: 'adopt',
    pid,
    checkpoint: payload,
    checkpointPath: ck.path,
  };
}

// (11.74) Pure planner. Given a list of c4-worktree-* entries from
// `git worktree list --porcelain` and access to the checkpoint
// directory, classify each as ADOPT (pid alive) or LOST (no-checkpoint
// / pid-dead / malformed-checkpoint / no-pid). Returns an array of
// plan records; callers (PtyManager) apply the side effects.
//
// Defensive: never throws. A malformed checkpoint is reported as
// reason='malformed-checkpoint' rather than crashing.
function reconcileOrphans(opts = {}) {
  const worktrees = Array.isArray(opts.worktrees) ? opts.worktrees : [];
  const skip = new Set(Array.isArray(opts.skipNames) ? opts.skipNames : []);
  const log = typeof opts.log === 'function' ? opts.log : () => {};
  const plans = [];
  const seen = new Set();
  for (const entry of worktrees) {
    if (!entry || typeof entry !== 'object') continue;
    const wtPath = typeof entry.worktree === 'string' ? entry.worktree : null;
    const name = workerNameFromWorktreePath(wtPath);
    if (!name) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    if (skip.has(name)) continue;
    let plan;
    try {
      plan = planReconnect(name, opts);
    } catch (err) {
      plan = {
        name,
        action: 'lost',
        reason: 'malformed-checkpoint',
        checkpoint: null,
        error: err && err.message ? err.message : String(err),
      };
    }
    plan.worktree = wtPath;
    plan.branch = (entry.branch && typeof entry.branch === 'string') ? entry.branch : (plan.checkpoint && plan.checkpoint.branch) || null;
    if (plan.action === 'adopt') {
      log(`[reconnect] auto-adopted ${name} (pid=${plan.pid}, branch=${plan.branch || '-'}) from checkpoint`);
    } else {
      log(`[reconnect] worker ${name} marked LOST (reason: ${plan.reason})`);
    }
    plans.push(plan);
  }
  return plans;
}

module.exports = {
  CHECKPOINT_GRACE_MS,
  DEFAULT_POLL_MS,
  DEFAULT_VERSION,
  checkpointDir,
  buildCheckpointPayload,
  writeCheckpoint,
  shutdownWorkers,
  // (11.74) Reconcile / reconnect helpers
  defaultIsPidAlive,
  readCheckpoint,
  workerNameFromWorktreePath,
  planReconnect,
  reconcileOrphans,
};
