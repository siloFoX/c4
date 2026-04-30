// 10.5 cost report tests.

'use strict';

const { describe, it } = require('node:test');
const assert = require('assert');

const PtyManager = require('../src/pty-manager');

function makeManager(config) {
  const mgr = Object.create(PtyManager.prototype);
  mgr.config = config;
  mgr._tokenUsage = {
    daily: {
      '2026-04-01': { input: 1_000_000, output: 500_000 },
      '2026-04-15': { input: 2_000_000, output: 1_000_000 },
      '2026-04-30': { input: 500_000,   output: 250_000 },
    },
    lastScan: 0,
    offsets: {},
  };
  return mgr;
}

describe('getCostReport (10.5)', () => {
  it('aggregates totals across all days when no range', () => {
    const mgr = makeManager({
      tokenMonitor: {
        pricing: { test: { inputPer1M: 3, outputPer1M: 15 } },
        defaultModel: 'test',
      },
    });
    const r = mgr.getCostReport();
    assert.strictEqual(r.totals.input, 3_500_000);
    assert.strictEqual(r.totals.output, 1_750_000);
    // 3.5 * $3 + 1.75 * $15 = 10.5 + 26.25 = 36.75
    assert.strictEqual(Math.round(r.totals.costUSD * 100) / 100, 36.75);
  });

  it('honors since/until range', () => {
    const mgr = makeManager({
      tokenMonitor: {
        pricing: { test: { inputPer1M: 1, outputPer1M: 1 } },
        defaultModel: 'test',
      },
    });
    const r = mgr.getCostReport({ since: '2026-04-15', until: '2026-04-15' });
    assert.strictEqual(r.totals.input, 2_000_000);
    assert.strictEqual(r.totals.output, 1_000_000);
  });

  it('returns null cost when pricing is absent', () => {
    const mgr = makeManager({ tokenMonitor: {} });
    const r = mgr.getCostReport();
    assert.strictEqual(r.totals.costUSD, null);
  });

  it('flags overBudget when monthly cost exceeds budget', () => {
    const mgr = makeManager({
      tokenMonitor: {
        pricing: { test: { inputPer1M: 100, outputPer1M: 100 } },
        defaultModel: 'test',
        monthlyBudget: 1, // $1 budget vs millions of tokens → over
      },
    });
    const r = mgr.getCostReport();
    assert.strictEqual(r.budget.overBudget, true);
    assert.ok(r.monthly.costUSD > r.budget.monthlyUSD);
  });

  it('caller-supplied model overrides defaultModel', () => {
    const mgr = makeManager({
      tokenMonitor: {
        pricing: {
          cheap: { inputPer1M: 1,  outputPer1M: 1 },
          opus:  { inputPer1M: 15, outputPer1M: 75 },
        },
        defaultModel: 'cheap',
      },
    });
    const r = mgr.getCostReport({ model: 'opus' });
    // 3.5 * 15 + 1.75 * 75 = 52.5 + 131.25 = 183.75
    assert.strictEqual(Math.round(r.totals.costUSD * 100) / 100, 183.75);
  });
});
