// TODO #95 — per-worker process metrics (CPU%/RSS/threads).
//
// Linux: reads /proc/<pid>/{status,stat}. Other platforms return null fields
// gracefully (we don't ship pidusage to keep deps lean — daemons typically
// run on Linux servers anyway).
//
// CPU% is computed against the *previous* sample stored in `prevCache` so the
// first reading after a worker spawns reports null until a delta exists.

'use strict';

const fs = require('fs');
const os = require('os');

const IS_LINUX = process.platform === 'linux';

// On Linux this is the kernel's user_hz (clock ticks per second).
// Almost always 100, but we don't depend on it being exact.
const CLK_TCK = 100;

function _readStat(pid) {
  const raw = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
  // The 2nd field (comm) is wrapped in parens and may contain spaces or ')'.
  const i = raw.lastIndexOf(')');
  const tail = raw.slice(i + 2).split(' ');
  // Field index in `tail` = field index in /proc - 3 (we already past pid+comm).
  // utime=field 14 → tail[11], stime=field 15 → tail[12], num_threads=field 20 → tail[17].
  return {
    utime: Number(tail[11]),
    stime: Number(tail[12]),
    threads: Number(tail[17]),
  };
}

function _readRssKb(pid) {
  const raw = fs.readFileSync(`/proc/${pid}/status`, 'utf8');
  const m = raw.match(/^VmRSS:\s+(\d+)\s*kB/m);
  return m ? Number(m[1]) : null;
}

/**
 * Sample one process and (when prev exists) return CPU% over the interval.
 *
 * @param {number} pid
 * @param {{utime:number,stime:number,sampledAt:number}|null} prev
 * @returns {{rssKb:number|null, threads:number|null, cpuPct:number|null,
 *            sample:{utime:number,stime:number,sampledAt:number}|null}}
 */
function sample(pid, prev) {
  if (!IS_LINUX || !pid) {
    return { rssKb: null, threads: null, cpuPct: null, sample: null };
  }
  let stat;
  let rssKb;
  try {
    stat = _readStat(pid);
    rssKb = _readRssKb(pid);
  } catch {
    // Process gone, /proc unmounted, etc. — treat as no metrics.
    return { rssKb: null, threads: null, cpuPct: null, sample: null };
  }
  const now = Date.now();
  const newSample = { utime: stat.utime, stime: stat.stime, sampledAt: now };
  let cpuPct = null;
  if (prev && prev.sampledAt && now > prev.sampledAt) {
    const dTicks = (stat.utime + stat.stime) - (prev.utime + prev.stime);
    const dMs = now - prev.sampledAt;
    if (dTicks >= 0 && dMs > 0) {
      // 100% = 1 core fully busy (single-thread). Multi-core capable up to N*100%.
      cpuPct = (dTicks / CLK_TCK) * 1000 / dMs * 100;
      // Floor tiny noise to 0.
      if (cpuPct < 0.05) cpuPct = 0;
      cpuPct = Math.round(cpuPct * 10) / 10;
    }
  }
  return { rssKb, threads: stat.threads, cpuPct, sample: newSample };
}

/**
 * Aggregate snapshot of the daemon process itself plus a count of live workers.
 * Used by GET /metrics so ops dashboards can see daemon-level pressure.
 */
function daemonSnapshot() {
  const mu = process.memoryUsage();
  return {
    platform: process.platform,
    pid: process.pid,
    uptimeSec: Math.round(process.uptime()),
    rssKb: Math.round(mu.rss / 1024),
    heapUsedKb: Math.round(mu.heapUsed / 1024),
    heapTotalKb: Math.round(mu.heapTotal / 1024),
    cpus: os.cpus().length,
    loadavg: os.loadavg(),
  };
}

module.exports = { sample, daemonSnapshot, IS_LINUX };
