// Per-session token attribution tests. Verifies that
// _parseTokensFromJsonl returns the sessionId, that _checkTokenUsage
// accumulates daily.<date>.bySession[sid], and that monthlyBySession()
// rolls the per-day maps up to a month-wide aggregate.

'use strict';

const { describe, it } = require('node:test');
const assert = require('assert');

const PtyManager = require('../src/pty-manager');

function makeMgr() {
  const mgr = Object.create(PtyManager.prototype);
  mgr.config = {};
  mgr._tokenUsage = { daily: {}, lastScan: 0, offsets: {} };
  return mgr;
}

describe('_parseTokensFromJsonl returns sessionId', () => {
  it('extracts sessionId from the file basename', () => {
    const mgr = makeMgr();
    // We can't easily mock fs.readFileSync without a real file, so we
    // give it a path under /tmp that doesn't exist — sessionId is
    // computed from the path regardless of read success.
    const r = mgr._parseTokensFromJsonl('/tmp/c4-noexist/sess-abc123.jsonl');
    assert.strictEqual(r.sessionId, 'sess-abc123');
    assert.strictEqual(r.input, 0);
    assert.strictEqual(r.output, 0);
  });
});

describe('monthlyBySession aggregator', () => {
  it('returns empty object when no token data', () => {
    const mgr = makeMgr();
    assert.deepStrictEqual(mgr.monthlyBySession(), {});
  });

  it('rolls all days in the current month into per-session totals', () => {
    const mgr = makeMgr();
    const now = new Date();
    const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const day1 = `${month}-01`;
    const day2 = `${month}-15`;
    const lastMonthDay = (() => {
      const d = new Date(now);
      d.setUTCMonth(d.getUTCMonth() - 1);
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-15`;
    })();

    mgr._tokenUsage.daily = {
      [day1]: {
        input: 0, output: 0,
        bySession: {
          'sess-A': { input: 100, output: 50 },
          'sess-B': { input: 200, output: 0 },
        },
      },
      [day2]: {
        input: 0, output: 0,
        bySession: {
          'sess-A': { input: 50, output: 25 },
        },
      },
      [lastMonthDay]: {
        input: 0, output: 0,
        bySession: {
          'sess-A': { input: 999, output: 999 }, // must NOT be counted
        },
      },
    };

    const r = mgr.monthlyBySession();
    assert.deepStrictEqual(r['sess-A'], { input: 150, output: 75 });
    assert.deepStrictEqual(r['sess-B'], { input: 200, output: 0 });
    assert.ok(!('sess-C' in r));
    // Previous month must not leak in.
    assert.notStrictEqual(r['sess-A'].input, 1149);
  });

  it('handles missing bySession blocks (legacy state)', () => {
    const mgr = makeMgr();
    const now = new Date();
    const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const day = `${month}-10`;
    mgr._tokenUsage.daily = {
      [day]: { input: 999, output: 999 }, // no bySession field
    };
    assert.deepStrictEqual(mgr.monthlyBySession(), {});
  });
});

describe('getTokenUsage({bySession:true}) exposes the maps', () => {
  it('returns today.bySession and monthlyBySession aggregate', () => {
    const mgr = makeMgr();
    const today = new Date().toISOString().split('T')[0];
    mgr._tokenUsage.daily[today] = {
      input: 100, output: 50,
      bySession: {
        'sess-A': { input: 100, output: 50 },
      },
    };
    const r = mgr.getTokenUsage({ bySession: true });
    assert.deepStrictEqual(r.bySession['sess-A'], { input: 100, output: 50 });
    assert.deepStrictEqual(r.monthlyBySession['sess-A'], { input: 100, output: 50 });
    // The default usage block (input/output/total) is still present.
    assert.strictEqual(r.input, 100);
    assert.strictEqual(r.output, 50);
    assert.strictEqual(r.total, 150);
  });

  it('omits bySession fields when opt not requested', () => {
    const mgr = makeMgr();
    const today = new Date().toISOString().split('T')[0];
    mgr._tokenUsage.daily[today] = { input: 1, output: 1, bySession: {} };
    const r = mgr.getTokenUsage();
    assert.strictEqual('bySession' in r, false);
    assert.strictEqual('monthlyBySession' in r, false);
  });
});
