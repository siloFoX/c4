// pty-manager.attributedCostsByGroup tests. Verifies that monthly
// per-session token totals are mapped to live worker names and shaped
// into the byGroup format OrgManager.computeUsage expects.

'use strict';

const { describe, it } = require('node:test');
const assert = require('assert');

const PtyManager = require('../src/pty-manager');

function makeMgr(opts = {}) {
  const mgr = Object.create(PtyManager.prototype);
  mgr.config = opts.config || {
    costs: { models: { default: { input: 3, output: 15 } } },
  };
  mgr.workers = new Map();
  mgr._tokenUsage = opts.tokenUsage || { daily: {}, lastScan: 0, offsets: {} };
  return mgr;
}

function setMonthlyUsage(mgr, sessionId, input, output) {
  const now = new Date();
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const day = `${month}-15`;
  if (!mgr._tokenUsage.daily[day]) {
    mgr._tokenUsage.daily[day] = { input: 0, output: 0, bySession: {} };
  }
  mgr._tokenUsage.daily[day].bySession[sessionId] = { input, output };
}

describe('attributedCostsByGroup', () => {
  it('returns empty byGroup when no token data', () => {
    const mgr = makeMgr();
    const r = mgr.attributedCostsByGroup();
    assert.deepStrictEqual(r, { byGroup: [] });
  });

  it('maps live workers to byGroup entries with tokens + costUSD', () => {
    const mgr = makeMgr();
    mgr.workers.set('w-eng', { alive: true, _sessionId: 'sess-eng' });
    mgr.workers.set('w-ops', { alive: true, _sessionId: 'sess-ops' });
    setMonthlyUsage(mgr, 'sess-eng', 1_000_000, 200_000);  // $3 + $3 = $6
    setMonthlyUsage(mgr, 'sess-ops',   500_000, 100_000);  // $1.5 + $1.5 = $3

    const r = mgr.attributedCostsByGroup();
    const byName = Object.fromEntries(r.byGroup.map((g) => [g.name, g]));
    assert.strictEqual(byName['w-eng'].tokens, 1_200_000);
    assert.strictEqual(byName['w-eng'].costUSD, 6);
    assert.strictEqual(byName['w-ops'].tokens, 600_000);
    assert.strictEqual(byName['w-ops'].costUSD, 3);
  });

  it('puts orphan sessions in an "unattributed" bucket', () => {
    const mgr = makeMgr();
    mgr.workers.set('w-known', { alive: true, _sessionId: 'sess-known' });
    setMonthlyUsage(mgr, 'sess-known',  1_000_000, 0);  // $3
    setMonthlyUsage(mgr, 'sess-orphan', 1_000_000, 0);  // $3 → unattributed

    const r = mgr.attributedCostsByGroup();
    const byName = Object.fromEntries(r.byGroup.map((g) => [g.name, g]));
    assert.strictEqual(byName['w-known'].costUSD, 3);
    assert.strictEqual(byName['unattributed'].costUSD, 3);
    assert.strictEqual(byName['unattributed'].tokens, 1_000_000);
  });

  it('falls back to tokens-only when pricing is missing', () => {
    const mgr = makeMgr({ config: {} });
    mgr.workers.set('w', { alive: true, _sessionId: 'sess' });
    setMonthlyUsage(mgr, 'sess', 1_000_000, 500_000);
    const r = mgr.attributedCostsByGroup();
    assert.strictEqual(r.byGroup.length, 1);
    assert.strictEqual(r.byGroup[0].tokens, 1_500_000);
    assert.strictEqual(r.byGroup[0].costUSD, 0); // no rate → 0
  });

  it('honors opts.model to pick a non-default pricing tier', () => {
    const mgr = makeMgr({
      config: {
        costs: {
          models: {
            default: { input: 3, output: 15 },
            opus: { input: 15, output: 75 },
          },
        },
      },
    });
    mgr.workers.set('w', { alive: true, _sessionId: 'sess' });
    setMonthlyUsage(mgr, 'sess', 1_000_000, 0);
    const cheap = mgr.attributedCostsByGroup({ model: 'default' });
    const opus = mgr.attributedCostsByGroup({ model: 'opus' });
    assert.strictEqual(cheap.byGroup[0].costUSD, 3);
    assert.strictEqual(opus.byGroup[0].costUSD, 15);
  });
});
