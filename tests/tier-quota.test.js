'use strict';

// (8.3) Tier-based token quota + complexity-driven model selection.
// Each suite uses a fresh tmpdir as baseDir so the persisted JSON
// file (~/.c4/tier-quota-YYYY-MM-DD.json shape) is real but isolated.
// `now` is injected so the daily roll-over test can fast-forward time
// without monkey-patching Date.

const assert = require('assert');
const { describe, it, beforeEach } = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tierQuotaMod = require('../src/tier-quota');
const { TierQuota, selectModel, mergeTiers, DEFAULT_TIERS, quotaFilePath, todayUtc } = tierQuotaMod;

function mkTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'c4-tier-quota-'));
}

const FIXED_DAY_MS = Date.UTC(2026, 3, 18, 12, 0, 0); // 2026-04-18 noon UTC
const NEXT_DAY_MS  = Date.UTC(2026, 3, 19, 12, 0, 0); // 2026-04-19 noon UTC

describe('tier-quota: defaults + mergeTiers', () => {
  it('exports the three required tier names with sane defaults', () => {
    assert.deepStrictEqual(Object.keys(DEFAULT_TIERS).sort(), ['manager', 'mid', 'worker']);
    assert.strictEqual(DEFAULT_TIERS.manager.dailyTokens, 500000);
    assert.strictEqual(DEFAULT_TIERS.mid.dailyTokens, 200000);
    assert.strictEqual(DEFAULT_TIERS.worker.dailyTokens, 100000);
    assert.deepStrictEqual(DEFAULT_TIERS.manager.models, ['opus']);
    assert.deepStrictEqual(DEFAULT_TIERS.mid.models, ['opus', 'sonnet']);
    assert.deepStrictEqual(DEFAULT_TIERS.worker.models, ['sonnet', 'haiku']);
  });

  it('mergeTiers overlays config without losing fields', () => {
    const merged = mergeTiers({ worker: { dailyTokens: 50000 }, mid: { models: ['sonnet'] } });
    assert.strictEqual(merged.worker.dailyTokens, 50000);
    assert.deepStrictEqual(merged.worker.models, ['sonnet', 'haiku']); // models preserved
    assert.strictEqual(merged.mid.dailyTokens, 200000);                 // dailyTokens preserved
    assert.deepStrictEqual(merged.mid.models, ['sonnet']);              // overridden
    assert.strictEqual(merged.manager.dailyTokens, 500000);             // untouched
  });

  it('mergeTiers ignores non-object overrides safely', () => {
    assert.deepStrictEqual(mergeTiers(null), DEFAULT_TIERS);
    assert.deepStrictEqual(mergeTiers(undefined), DEFAULT_TIERS);
    const merged = mergeTiers({ worker: null, mid: 'bogus' });
    assert.deepStrictEqual(merged.worker, DEFAULT_TIERS.worker);
    assert.deepStrictEqual(merged.mid, DEFAULT_TIERS.mid);
  });
});

describe('tier-quota: chargeTier + getRemaining', () => {
  let baseDir;
  let q;

  beforeEach(() => {
    baseDir = mkTmpDir();
    q = new TierQuota({ baseDir, now: () => FIXED_DAY_MS });
  });

  it('starts at zero usage with full remaining for every tier', () => {
    assert.strictEqual(q.getUsage('worker'), 0);
    assert.strictEqual(q.getUsage('mid'), 0);
    assert.strictEqual(q.getUsage('manager'), 0);
    assert.strictEqual(q.getRemaining('worker'), 100000);
    assert.strictEqual(q.getRemaining('mid'), 200000);
    assert.strictEqual(q.getRemaining('manager'), 500000);
  });

  it('chargeTier accumulates and persists usage across instances', () => {
    q.chargeTier('worker', 30000);
    q.chargeTier('worker', 5000);
    assert.strictEqual(q.getUsage('worker'), 35000);
    assert.strictEqual(q.getRemaining('worker'), 65000);

    // A second instance for the same baseDir/day must see the same numbers
    const q2 = new TierQuota({ baseDir, now: () => FIXED_DAY_MS });
    assert.strictEqual(q2.getUsage('worker'), 35000);
    assert.strictEqual(q2.getRemaining('worker'), 65000);
  });

  it('writes the canonical ~/.c4/tier-quota-YYYY-MM-DD.json shape', () => {
    q.chargeTier('mid', 12345);
    const file = quotaFilePath(baseDir, todayUtc(FIXED_DAY_MS));
    assert.ok(fs.existsSync(file), `expected ${file} to be written`);
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.strictEqual(raw.date, '2026-04-18');
    assert.strictEqual(raw.tiers.mid, 12345);
  });

  it('rejects unknown tier names on every method', () => {
    assert.throws(() => q.chargeTier('admin', 1), /Unknown tier/);
    assert.throws(() => q.getUsage('admin'), /Unknown tier/);
    assert.throws(() => q.getRemaining('admin'), /Unknown tier/);
  });

  it('rejects negative or non-numeric token amounts', () => {
    assert.throws(() => q.chargeTier('worker', -1), /non-negative/);
    assert.throws(() => q.chargeTier('worker', 'abc'), /non-negative/);
  });
});

describe('tier-quota: quota exceeded reject', () => {
  let baseDir;
  let q;

  beforeEach(() => {
    baseDir = mkTmpDir();
    q = new TierQuota({
      baseDir,
      now: () => FIXED_DAY_MS,
      tiers: { worker: { dailyTokens: 10000, models: ['haiku'] } },
    });
  });

  it('throws QUOTA_EXCEEDED when the next charge would cross the daily cap', () => {
    q.chargeTier('worker', 8000);
    assert.strictEqual(q.getRemaining('worker'), 2000);
    let caught;
    try { q.chargeTier('worker', 5000); } catch (e) { caught = e; }
    assert.ok(caught, 'expected charge to throw');
    assert.strictEqual(caught.code, 'QUOTA_EXCEEDED');
    assert.strictEqual(caught.tier, 'worker');
    assert.strictEqual(caught.limit, 10000);
    // Failed charge must NOT advance the counter
    assert.strictEqual(q.getUsage('worker'), 8000);
  });

  it('drops to zero remaining once the cap is exactly hit', () => {
    q.chargeTier('worker', 10000);
    assert.strictEqual(q.getRemaining('worker'), 0);
    assert.throws(() => q.chargeTier('worker', 1), /Quota exceeded/);
  });

  it('treats dailyTokens=0 as unlimited (Infinity remaining, no reject)', () => {
    const unlimited = new TierQuota({
      baseDir: mkTmpDir(),
      now: () => FIXED_DAY_MS,
      tiers: { worker: { dailyTokens: 0, models: ['haiku'] } },
    });
    assert.strictEqual(unlimited.getRemaining('worker'), Infinity);
    unlimited.chargeTier('worker', 999999999);
    assert.strictEqual(unlimited.getRemaining('worker'), Infinity);
  });
});

describe('tier-quota: daily reset + roll-over', () => {
  it('resetDaily(tier) zeroes a single tier and persists to disk', () => {
    const baseDir = mkTmpDir();
    const q = new TierQuota({ baseDir, now: () => FIXED_DAY_MS });
    q.chargeTier('worker', 7000);
    q.chargeTier('mid', 50000);
    q.resetDaily('worker');
    assert.strictEqual(q.getUsage('worker'), 0);
    assert.strictEqual(q.getUsage('mid'), 50000); // untouched

    const reloaded = new TierQuota({ baseDir, now: () => FIXED_DAY_MS });
    assert.strictEqual(reloaded.getUsage('worker'), 0);
    assert.strictEqual(reloaded.getUsage('mid'), 50000);
  });

  it('resetDaily() with no tier zeroes every tier', () => {
    const q = new TierQuota({ baseDir: mkTmpDir(), now: () => FIXED_DAY_MS });
    q.chargeTier('worker', 3000);
    q.chargeTier('mid', 4000);
    q.chargeTier('manager', 5000);
    q.resetDaily();
    assert.strictEqual(q.getUsage('worker'), 0);
    assert.strictEqual(q.getUsage('mid'), 0);
    assert.strictEqual(q.getUsage('manager'), 0);
  });

  it('rolls over to a new day automatically when the clock advances', () => {
    const baseDir = mkTmpDir();
    let nowMs = FIXED_DAY_MS;
    const q = new TierQuota({ baseDir, now: () => nowMs });

    q.chargeTier('worker', 60000);
    assert.strictEqual(q.getUsage('worker'), 60000);

    // Day 2 — same instance, fast-forwarded clock.
    nowMs = NEXT_DAY_MS;
    assert.strictEqual(q.getUsage('worker'), 0);
    assert.strictEqual(q.getRemaining('worker'), 100000);

    // Day 1's file must still exist with the original total — proof we
    // moved to a NEW file rather than mutating the old one.
    const day1 = JSON.parse(fs.readFileSync(quotaFilePath(baseDir, '2026-04-18'), 'utf8'));
    assert.strictEqual(day1.tiers.worker, 60000);

    // Day 2 charge writes a separate file
    q.chargeTier('worker', 1234);
    const day2 = JSON.parse(fs.readFileSync(quotaFilePath(baseDir, '2026-04-19'), 'utf8'));
    assert.strictEqual(day2.date, '2026-04-19');
    assert.strictEqual(day2.tiers.worker, 1234);
  });
});

describe('tier-quota: selectModel keyword + length heuristic', () => {
  it('opus keywords win for any tier that allows opus', () => {
    assert.strictEqual(selectModel('design the new auth flow', 'manager'), 'opus');
    assert.strictEqual(selectModel('refactor the dispatcher', 'mid'), 'opus');
    assert.strictEqual(selectModel('plan the migration', 'manager'), 'opus');
  });

  it('haiku keywords win when the tier allows haiku', () => {
    assert.strictEqual(selectModel('rename foo to bar', 'worker'), 'haiku');
    assert.strictEqual(selectModel('fix typo in README', 'worker'), 'haiku');
    assert.strictEqual(selectModel('format code with prettier', 'worker'), 'haiku');
  });

  it('implementation keywords pick sonnet for the worker tier', () => {
    assert.strictEqual(selectModel('implement rate limiter', 'worker'), 'sonnet');
    assert.strictEqual(selectModel('add JWT validation to API handler', 'worker'), 'sonnet');
  });

  it('falls back to length when no keyword matches', () => {
    const longText = 'x'.repeat(600);
    assert.strictEqual(selectModel(longText, 'mid'), 'opus');
    assert.strictEqual(selectModel('quick tweak', 'worker'), 'haiku'); // < 80 chars
    assert.strictEqual(selectModel('a sentence with about thirty characters here too', 'worker'), 'haiku');
  });

  it('constrains the choice to the tier allow-list', () => {
    // manager only allows opus -> haiku-keyword still resolves to opus
    assert.strictEqual(selectModel('rename token field', 'manager'), 'opus');
    // worker has no opus -> opus-keyword falls back to sonnet (next-best)
    assert.strictEqual(selectModel('design the new schema', 'worker'), 'sonnet');
    // mid allows opus and sonnet -> haiku-keyword should pick sonnet (smallest allowed)
    assert.strictEqual(selectModel('rename a constant', 'mid'), 'sonnet');
  });

  it('returns null for an unknown tier or an empty allow-list', () => {
    assert.strictEqual(selectModel('anything', 'admin'), null);
    const tiers = mergeTiers({ worker: { models: [] } });
    // mergeTiers preserves defaults when an empty array is passed; force a
    // truly empty allow-list via direct override
    const emptied = { worker: { dailyTokens: 1000, models: [] } };
    assert.strictEqual(selectModel('anything', 'worker', { tiers: emptied }), null);
    assert.ok(tiers.worker.models.length > 0); // sanity: mergeTiers kept defaults
  });

  it('TierQuota.selectModel honours the instance tier override', () => {
    const q = new TierQuota({
      baseDir: mkTmpDir(),
      now: () => FIXED_DAY_MS,
      tiers: { worker: { dailyTokens: 1000, models: ['opus', 'sonnet', 'haiku'] } },
    });
    // worker now allows opus -> opus-keyword resolves to opus
    assert.strictEqual(q.selectModel('design the dispatcher rewrite', 'worker'), 'opus');
    assert.strictEqual(q.selectModel('rename foo', 'worker'), 'haiku');
  });
});

describe('tier-quota: snapshot output', () => {
  it('exposes used / remaining / models for every tier', () => {
    const q = new TierQuota({
      baseDir: mkTmpDir(),
      now: () => FIXED_DAY_MS,
      tiers: { worker: { dailyTokens: 1000, models: ['sonnet'] } },
    });
    q.chargeTier('worker', 250);
    const snap = q.snapshot();
    assert.strictEqual(snap.date, '2026-04-18');
    assert.strictEqual(snap.tiers.worker.dailyTokens, 1000);
    assert.strictEqual(snap.tiers.worker.used, 250);
    assert.strictEqual(snap.tiers.worker.remaining, 750);
    assert.deepStrictEqual(snap.tiers.worker.models, ['sonnet']);
    assert.strictEqual(snap.tiers.manager.used, 0);
    assert.strictEqual(snap.tiers.manager.remaining, 500000);
  });

  it('snapshot reports remaining=-1 for unlimited tiers', () => {
    const q = new TierQuota({
      baseDir: mkTmpDir(),
      now: () => FIXED_DAY_MS,
      tiers: { worker: { dailyTokens: 0, models: ['haiku'] } },
    });
    const snap = q.snapshot();
    assert.strictEqual(snap.tiers.worker.dailyTokens, 0);
    assert.strictEqual(snap.tiers.worker.remaining, -1);
  });
});
