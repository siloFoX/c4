'use strict';

// Tests for src/prometheus-format.js (v1.11.101 / TODO 11.83).
//
// formatMetrics(workers, counters) produces the body of the daemon's
// /api/metrics/prometheus endpoint. These tests pin the exposition
// format: every snapshot is asserted as a full string so a regression
// in label escaping or section ordering shows up as a single failing
// assert with a readable diff.

const { describe, it } = require('node:test');
const assert = require('assert');

const { formatMetrics, escapeLabelValue } = require('../src/prometheus-format');

describe('prometheus-format escapeLabelValue', () => {
  it('passes plain ascii through unchanged', () => {
    assert.strictEqual(escapeLabelValue('auto-w1'), 'auto-w1');
  });

  it('escapes backslash, quote, and newline per spec', () => {
    assert.strictEqual(escapeLabelValue('a\\b'), 'a\\\\b');
    assert.strictEqual(escapeLabelValue('a"b'), 'a\\"b');
    assert.strictEqual(escapeLabelValue('a\nb'), 'a\\nb');
    assert.strictEqual(escapeLabelValue('a\r\nb'), 'a\\nb');
  });

  it('returns empty string for null / undefined', () => {
    assert.strictEqual(escapeLabelValue(null), '');
    assert.strictEqual(escapeLabelValue(undefined), '');
  });
});

describe('prometheus-format formatMetrics', () => {
  it('emits only HELP / TYPE + zero counters for empty input', () => {
    const out = formatMetrics([], {});
    const expected = [
      '# HELP c4_worker_rss_bytes Resident set size of a c4 worker process',
      '# TYPE c4_worker_rss_bytes gauge',
      '# HELP c4_worker_cpu_percent CPU percent of a c4 worker process (last sample)',
      '# TYPE c4_worker_cpu_percent gauge',
      '# HELP c4_dispatch_total_count Total autonomous dispatch events since daemon start',
      '# TYPE c4_dispatch_total_count counter',
      'c4_dispatch_total_count 0',
      '# HELP c4_escalation_total_count Total escalation events since daemon start',
      '# TYPE c4_escalation_total_count counter',
      'c4_escalation_total_count 0',
      '',
    ].join('\n');
    assert.strictEqual(out, expected);
  });

  it('treats null / undefined / non-iterable as empty worker set', () => {
    const a = formatMetrics(null, null);
    const b = formatMetrics(undefined, undefined);
    const c = formatMetrics(42, 'nope');
    assert.strictEqual(a, b);
    assert.strictEqual(a, c);
    // No gauge rows (the only gauge text is the HELP / TYPE pair).
    const rssRows = a.split('\n').filter((l) => l.startsWith('c4_worker_rss_bytes{'));
    assert.strictEqual(rssRows.length, 0);
    const cpuRows = a.split('\n').filter((l) => l.startsWith('c4_worker_cpu_percent{'));
    assert.strictEqual(cpuRows.length, 0);
  });

  it('sorts worker rows by name across rss + cpu sections', () => {
    const workers = [
      { name: 'zeta', rssKb: 100, cpuPct: 9.9 },
      { name: 'alpha', rssKb: 200, cpuPct: 1.1 },
      { name: 'mike', rssKb: 150, cpuPct: 5.5 },
    ];
    const out = formatMetrics(workers, {});
    const rssRows = out.split('\n').filter((l) => l.startsWith('c4_worker_rss_bytes{'));
    const cpuRows = out.split('\n').filter((l) => l.startsWith('c4_worker_cpu_percent{'));
    assert.deepStrictEqual(
      rssRows.map((l) => l.match(/name="([^"]+)"/)[1]),
      ['alpha', 'mike', 'zeta'],
    );
    assert.deepStrictEqual(
      cpuRows.map((l) => l.match(/name="([^"]+)"/)[1]),
      ['alpha', 'mike', 'zeta'],
    );
  });

  it('renders full label set name/tier/target with defaults', () => {
    const workers = [
      { name: 'auto-w1', rssKb: 100, cpuPct: 1.23 },
      { name: 'mgr-1', tier: 'manager', target: 'dgx', rssKb: 200, cpuPct: 4.5 },
    ];
    const out = formatMetrics(workers, {});
    assert.ok(out.includes('c4_worker_rss_bytes{name="auto-w1",tier="worker",target="local"} 102400'));
    assert.ok(out.includes('c4_worker_cpu_percent{name="auto-w1",tier="worker",target="local"} 1.23'));
    assert.ok(out.includes('c4_worker_rss_bytes{name="mgr-1",tier="manager",target="dgx"} 204800'));
    assert.ok(out.includes('c4_worker_cpu_percent{name="mgr-1",tier="manager",target="dgx"} 4.5'));
  });

  it('escapes backslash, quote, and newline in label values', () => {
    const workers = [
      { name: 'a\\b', rssKb: 1, cpuPct: 0.1 },
      { name: 'a"b', rssKb: 2, cpuPct: 0.2 },
      { name: 'a\nb', rssKb: 3, cpuPct: 0.3 },
    ];
    const out = formatMetrics(workers, {});
    assert.ok(out.includes('name="a\\\\b"'));
    assert.ok(out.includes('name="a\\"b"'));
    assert.ok(out.includes('name="a\\nb"'));
    // No raw newline inside any gauge row (would break Prometheus parser).
    const lines = out.split('\n');
    for (const l of lines) {
      if (l.startsWith('c4_worker_')) {
        assert.ok(!/\r/.test(l), 'no raw CR in row: ' + l);
      }
    }
  });

  it('reflects counters when present', () => {
    const out = formatMetrics([], { dispatch: 42, escalation: 3 });
    assert.ok(out.includes('c4_dispatch_total_count 42'));
    assert.ok(out.includes('c4_escalation_total_count 3'));
  });

  it('renders missing counters as 0', () => {
    const out = formatMetrics([], {});
    assert.ok(out.includes('c4_dispatch_total_count 0'));
    assert.ok(out.includes('c4_escalation_total_count 0'));
  });

  it('renders negative / NaN counters as 0 (defensive)', () => {
    const out = formatMetrics([], { dispatch: -5, escalation: Number.NaN });
    assert.ok(out.includes('c4_dispatch_total_count 0'));
    assert.ok(out.includes('c4_escalation_total_count 0'));
  });

  it('skips gauge rows when rss / cpu values are null', () => {
    const workers = [
      { name: 'no-rss', rssKb: null, cpuPct: 2.0 },
      { name: 'no-cpu', rssKb: 1024, cpuPct: null },
      { name: 'fully-null', rssKb: null, cpuPct: null },
    ];
    const out = formatMetrics(workers, {});
    assert.ok(!out.includes('c4_worker_rss_bytes{name="no-rss"'));
    assert.ok(out.includes('c4_worker_rss_bytes{name="no-cpu",tier="worker",target="local"} 1048576'));
    assert.ok(out.includes('c4_worker_cpu_percent{name="no-rss",tier="worker",target="local"} 2'));
    assert.ok(!out.includes('c4_worker_cpu_percent{name="no-cpu"'));
    assert.ok(!out.includes('c4_worker_rss_bytes{name="fully-null"'));
    assert.ok(!out.includes('c4_worker_cpu_percent{name="fully-null"'));
  });

  it('prefers rssBytes over rssKb when both are present', () => {
    const workers = [
      { name: 'w', rssBytes: 7, rssKb: 999, cpuPct: 0 },
    ];
    const out = formatMetrics(workers, {});
    assert.ok(out.includes('c4_worker_rss_bytes{name="w",tier="worker",target="local"} 7'));
    assert.ok(!out.includes(' 999'));
  });

  it('accepts a Map of workers and ignores entries without a name', () => {
    const m = new Map([
      ['a', { name: 'a', rssKb: 10, cpuPct: 0.5 }],
      ['b', { name: 'b', rssKb: 20, cpuPct: 1.0 }],
      ['c', { rssKb: 30, cpuPct: 1.5 }],
      ['d', null],
    ]);
    const out = formatMetrics(m, {});
    const rssRows = out.split('\n').filter((l) => l.startsWith('c4_worker_rss_bytes{'));
    assert.strictEqual(rssRows.length, 2);
    assert.deepStrictEqual(
      rssRows.map((l) => l.match(/name="([^"]+)"/)[1]),
      ['a', 'b'],
    );
  });

  it('accepts a plain object map keyed by name', () => {
    const out = formatMetrics(
      {
        beta: { name: 'beta', rssKb: 2, cpuPct: 0.2 },
        alpha: { name: 'alpha', rssKb: 1, cpuPct: 0.1 },
      },
      {},
    );
    const rssRows = out.split('\n').filter((l) => l.startsWith('c4_worker_rss_bytes{'));
    assert.deepStrictEqual(
      rssRows.map((l) => l.match(/name="([^"]+)"/)[1]),
      ['alpha', 'beta'],
    );
  });

  it('emits sections in fixed order: rss, cpu, dispatch, escalation', () => {
    const out = formatMetrics(
      [{ name: 'w', rssKb: 1, cpuPct: 0.1 }],
      { dispatch: 1, escalation: 1 },
    );
    const idxRss = out.indexOf('# TYPE c4_worker_rss_bytes');
    const idxCpu = out.indexOf('# TYPE c4_worker_cpu_percent');
    const idxDisp = out.indexOf('# TYPE c4_dispatch_total_count');
    const idxEsc = out.indexOf('# TYPE c4_escalation_total_count');
    assert.ok(idxRss >= 0 && idxCpu > idxRss && idxDisp > idxCpu && idxEsc > idxDisp,
      'section order: rss < cpu < dispatch < escalation');
  });

  it('terminates output with a single trailing newline', () => {
    const out = formatMetrics([], {});
    assert.ok(out.endsWith('\n'));
    assert.ok(!out.endsWith('\n\n'));
  });
});
