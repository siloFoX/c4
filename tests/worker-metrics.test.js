// Worker metrics unit tests (TODO #95).
//
// Linux-only paths cover /proc/{pid}/{stat,status} parsing + CPU% delta math.
// Non-Linux hosts get the graceful-null branch.

'use strict';

const { describe, it } = require('node:test');
const assert = require('assert');
const workerMetrics = require('../src/worker-metrics');

describe('workerMetrics.daemonSnapshot', () => {
  it('returns a sane process snapshot', () => {
    const s = workerMetrics.daemonSnapshot();
    assert.strictEqual(typeof s.pid, 'number');
    assert.ok(s.pid > 0, 'daemon pid > 0');
    assert.ok(s.rssKb > 0, 'daemon rss > 0');
    assert.ok(s.heapUsedKb > 0, 'heap used > 0');
    assert.ok(Array.isArray(s.loadavg), 'loadavg is array');
    assert.strictEqual(s.loadavg.length, 3);
    assert.ok(s.cpus >= 1, 'cpu count');
    assert.ok(s.uptimeSec >= 0, 'non-negative uptime');
    assert.strictEqual(s.platform, process.platform);
  });
});

describe('workerMetrics.sample', () => {
  it('returns null fields for null pid', () => {
    const r = workerMetrics.sample(null, null);
    assert.strictEqual(r.rssKb, null);
    assert.strictEqual(r.cpuPct, null);
    assert.strictEqual(r.threads, null);
    assert.strictEqual(r.sample, null);
  });

  it('returns null fields for non-existent pid', () => {
    // pid 1 always exists on Linux but we want a "definitely gone" pid.
    // 2^22 - 1 (the typical Linux pid_max ceiling) is unallocated unless
    // the host is in deep trouble.
    const r = workerMetrics.sample(4194303, null);
    assert.strictEqual(r.rssKb, null);
    assert.strictEqual(r.cpuPct, null);
    assert.strictEqual(r.threads, null);
    assert.strictEqual(r.sample, null);
  });

  if (workerMetrics.IS_LINUX) {
    it('samples this process on Linux and reports rss/threads', () => {
      const r = workerMetrics.sample(process.pid, null);
      assert.ok(r.rssKb > 0, 'self rss > 0');
      assert.ok(r.threads >= 1, 'at least 1 thread');
      assert.strictEqual(r.cpuPct, null, 'first sample has no delta');
      assert.ok(r.sample, 'sample object returned for caching');
      assert.strictEqual(typeof r.sample.utime, 'number');
      assert.strictEqual(typeof r.sample.stime, 'number');
    });

    it('computes CPU% over a delta', async () => {
      const first = workerMetrics.sample(process.pid, null);
      assert.ok(first.sample);
      // Burn a little CPU so utime/stime advance reliably.
      const start = Date.now();
      let n = 0;
      while (Date.now() - start < 50) n++;
      // Force prev.sampledAt to ~50ms ago even if the burn was below CLK_TCK
      // resolution (10ms on Linux): we just need a positive dMs.
      const prev = { ...first.sample, sampledAt: first.sample.sampledAt - 100 };
      const second = workerMetrics.sample(process.pid, prev);
      assert.ok(second.sample, 'follow-up sample returned');
      assert.notStrictEqual(second.cpuPct, null, 'cpu% computed on second call');
      assert.ok(second.cpuPct >= 0, 'cpu% non-negative');
      assert.ok(n > 0); // touched n so the burn loop isn't optimized away
    });

    it('handles disappearing pid mid-flight', () => {
      // Same far-out pid as above; even if we have a prev sample we should
      // bail cleanly.
      const r = workerMetrics.sample(4194303, {
        utime: 0, stime: 0, sampledAt: Date.now() - 1000,
      });
      assert.strictEqual(r.rssKb, null);
      assert.strictEqual(r.cpuPct, null);
    });
  }
});
