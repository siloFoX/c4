// (10.5) Cost report + billing tests.
//
// Exercises src/cost-report.js directly with in-memory record arrays so
// the suite runs without a daemon, without filesystem access for its
// core cases, and deterministically across timezones (we always build
// timestamps as UTC ISO strings).
//
// Coverage targets (30+ assertions):
//  - report() aggregation totals, rounding, and per-group accounting
//  - groupBy=project|team|machine|user|worker and unknown fallback
//  - monthlyReport() bounds for regular and leap-year months
//  - budgetCheck() warn at 0.8, exceeded at 1.0, group filtering
//  - getRate() unknown-model fallback to default
//  - loadHistoryRecords() over a tmpdir file, with malformed lines
//  - Zero-token empty periods report $0 without throwing

'use strict';
require('./jest-shim');

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  CostReporter,
  DEFAULT_COSTS,
  VALID_GROUP_BY,
  VALID_PERIODS,
  monthRange,
  periodRange,
  loadHistoryRecords,
  defaultHistoryPath,
} = require('../src/cost-report');

function mkTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'c4-cost-test-'));
}

function sampleRecords() {
  return [
    { timestamp: '2026-04-01T00:00:00Z', project: 'arps',  team: 'alpha', machine: 'dgx', user: 'shin', worker: 'w1', model: 'claude-opus',   inputTokens: 1000, outputTokens: 500 },
    { timestamp: '2026-04-02T00:00:00Z', project: 'arps',  team: 'alpha', machine: 'dgx', user: 'shin', worker: 'w1', model: 'claude-sonnet', inputTokens: 2000, outputTokens: 1000 },
    { timestamp: '2026-04-03T00:00:00Z', project: 'c4',    team: 'beta',  machine: 'mac', user: 'silo', worker: 'w2', model: 'claude-haiku',  inputTokens: 5000, outputTokens: 2000 },
    { timestamp: '2026-04-04T00:00:00Z', project: 'c4',    team: 'beta',  machine: 'mac', user: 'silo', worker: 'w3', model: 'local',         inputTokens: 9999, outputTokens: 9999 },
    { timestamp: '2026-03-31T00:00:00Z', project: 'arps',  team: 'alpha', machine: 'dgx', user: 'shin', worker: 'w1', model: 'claude-opus',   inputTokens: 100,  outputTokens: 100 },
    { timestamp: '2026-05-01T00:00:00Z', project: 'arps',  team: 'alpha', machine: 'dgx', user: 'shin', worker: 'w1', model: 'claude-opus',   inputTokens: 100,  outputTokens: 100 },
  ];
}

describe('(10.5) CostReporter helpers', () => {
  test('(a) DEFAULT_COSTS has opus/sonnet/haiku/local/default', () => {
    expect(DEFAULT_COSTS['claude-opus'].input).toBe(15);
    expect(DEFAULT_COSTS['claude-opus'].output).toBe(75);
    expect(DEFAULT_COSTS['claude-sonnet'].input).toBe(3);
    expect(DEFAULT_COSTS['claude-sonnet'].output).toBe(15);
    expect(DEFAULT_COSTS['claude-haiku'].input).toBe(0.8);
    expect(DEFAULT_COSTS['claude-haiku'].output).toBe(4);
    expect(DEFAULT_COSTS['local'].input).toBe(0);
    expect(DEFAULT_COSTS['local'].output).toBe(0);
    expect(DEFAULT_COSTS['default']).toBeDefined();
  });

  test('(b) VALID_GROUP_BY covers the four primary axes + worker', () => {
    expect(VALID_GROUP_BY).toContain('project');
    expect(VALID_GROUP_BY).toContain('team');
    expect(VALID_GROUP_BY).toContain('machine');
    expect(VALID_GROUP_BY).toContain('user');
    expect(VALID_GROUP_BY).toContain('worker');
  });

  test('(c) VALID_PERIODS includes day/week/month', () => {
    expect(VALID_PERIODS).toContain('day');
    expect(VALID_PERIODS).toContain('week');
    expect(VALID_PERIODS).toContain('month');
  });

  test('(d) monthRange produces first/last ISO of month', () => {
    const r = monthRange(2026, 4);
    expect(r.from).toBe('2026-04-01T00:00:00.000Z');
    expect(r.to.startsWith('2026-04-30T23:59:59')).toBe(true);
  });

  test('(e) monthRange handles leap-year February (2028-02)', () => {
    const r = monthRange(2028, 2);
    expect(r.from).toBe('2028-02-01T00:00:00.000Z');
    expect(r.to.startsWith('2028-02-29T23:59:59')).toBe(true);
  });

  test('(f) monthRange handles 31-day months (January)', () => {
    const r = monthRange(2026, 1);
    expect(r.from).toBe('2026-01-01T00:00:00.000Z');
    expect(r.to.startsWith('2026-01-31T23:59:59')).toBe(true);
  });

  test('(g) monthRange rejects invalid month', () => {
    expect(() => monthRange(2026, 13)).toThrow('1-12');
    expect(() => monthRange(2026, 0)).toThrow('1-12');
  });

  test('(h) periodRange day/week/month return valid ranges', () => {
    const now = new Date('2026-04-15T12:30:00Z');
    const day = periodRange('day', now);
    expect(day.from.startsWith('2026-04-15T00:00:00')).toBe(true);
    const week = periodRange('week', now);
    expect(week.from.endsWith('T00:00:00.000Z')).toBe(true);
    const month = periodRange('month', now);
    expect(month.from.startsWith('2026-04-01')).toBe(true);
  });
});

describe('(10.5) CostReporter.getRate', () => {
  test('(i) known model returns configured rate', () => {
    const r = new CostReporter();
    expect(r.getRate('claude-opus').input).toBe(15);
    expect(r.getRate('claude-sonnet').output).toBe(15);
    expect(r.getRate('local').input).toBe(0);
  });

  test('(j) unknown model falls back to default entry', () => {
    const r = new CostReporter();
    const rate = r.getRate('claude-ultra-mega');
    expect(rate.input).toBe(DEFAULT_COSTS.default.input);
    expect(rate.output).toBe(DEFAULT_COSTS.default.output);
  });

  test('(k) missing default falls back to zero', () => {
    const r = new CostReporter({ costs: { 'claude-opus': { input: 1, output: 2 } } });
    // costs merge with DEFAULT_COSTS so default still exists; remove it
    // on a fresh instance by overwriting with {} + known-only entry
    const r2 = new CostReporter();
    r2.costs = { 'claude-opus': { input: 1, output: 2 } };
    expect(r2.getRate('unknown').input).toBe(0);
    expect(r2.getRate('unknown').output).toBe(0);
    expect(r.getRate('claude-opus').input).toBe(1);
  });

  test('(l) costForRecord applies per-1K rate correctly', () => {
    const r = new CostReporter();
    const c1 = r.costForRecord({ timestamp: 't', model: 'claude-opus', inputTokens: 1000, outputTokens: 500 });
    expect(c1).toBe(15 + 37.5);
    const c2 = r.costForRecord({ timestamp: 't', model: 'local', inputTokens: 9999, outputTokens: 9999 });
    expect(c2).toBe(0);
  });
});

describe('(10.5) CostReporter.report groupBy variations', () => {
  test('(m) groupBy=project aggregates per project', () => {
    const r = new CostReporter({ records: sampleRecords() });
    const out = r.report({ groupBy: 'project' });
    expect(out.total.records).toBe(6);
    expect(out.byGroup.length).toBe(2);
    const arps = out.byGroup.find((g) => g.name === 'arps');
    const c4 = out.byGroup.find((g) => g.name === 'c4');
    expect(arps).toBeDefined();
    expect(c4).toBeDefined();
    expect(arps.records).toBe(4);
    expect(c4.records).toBe(2);
  });

  test('(n) groupBy=team aggregates per team', () => {
    const r = new CostReporter({ records: sampleRecords() });
    const out = r.report({ groupBy: 'team' });
    expect(out.byGroup.length).toBe(2);
    const alpha = out.byGroup.find((g) => g.name === 'alpha');
    expect(alpha.records).toBe(4);
  });

  test('(o) groupBy=machine splits dgx vs mac', () => {
    const r = new CostReporter({ records: sampleRecords() });
    const out = r.report({ groupBy: 'machine' });
    const names = out.byGroup.map((g) => g.name).sort();
    expect(names).toEqual(['dgx', 'mac']);
  });

  test('(p) groupBy=user splits silo vs shin', () => {
    const r = new CostReporter({ records: sampleRecords() });
    const out = r.report({ groupBy: 'user' });
    const names = out.byGroup.map((g) => g.name).sort();
    expect(names).toEqual(['shin', 'silo']);
  });

  test('(q) groupBy=worker splits per worker name', () => {
    const r = new CostReporter({ records: sampleRecords() });
    const out = r.report({ groupBy: 'worker' });
    const names = out.byGroup.map((g) => g.name).sort();
    expect(names).toEqual(['w1', 'w2', 'w3']);
  });

  test('(r) missing group field falls back to unknown label', () => {
    const r = new CostReporter({ records: [
      { timestamp: '2026-04-17T00:00:00Z', model: 'claude-opus', inputTokens: 100, outputTokens: 100 }
    ] });
    const out = r.report({ groupBy: 'project' });
    expect(out.byGroup.length).toBe(1);
    expect(out.byGroup[0].name).toBe('unknown');
  });

  test('(s) custom unknownLabel surfaces on missing group field', () => {
    const r = new CostReporter({ records: [
      { timestamp: '2026-04-17T00:00:00Z', model: 'claude-opus', inputTokens: 10, outputTokens: 10 }
    ] });
    const out = r.report({ groupBy: 'team', unknownLabel: 'no-team' });
    expect(out.byGroup[0].name).toBe('no-team');
  });

  test('(t) invalid groupBy coerces to default', () => {
    const r = new CostReporter({ records: sampleRecords(), defaultGroupBy: 'machine' });
    const out = r.report({ groupBy: 'nonsense' });
    expect(out.groupBy).toBe('machine');
  });
});

describe('(10.5) CostReporter.report totals and time filter', () => {
  test('(u) from/to filter excludes out-of-range records', () => {
    const r = new CostReporter({ records: sampleRecords() });
    const out = r.report({ from: '2026-04-01T00:00:00Z', to: '2026-04-30T23:59:59Z' });
    expect(out.total.records).toBe(4);
  });

  test('(v) total costUSD matches hand-computed sum', () => {
    const r = new CostReporter({ records: [
      { timestamp: '2026-04-01T00:00:00Z', project: 'a', model: 'claude-opus',   inputTokens: 1000, outputTokens: 1000 },
      { timestamp: '2026-04-02T00:00:00Z', project: 'a', model: 'claude-sonnet', inputTokens: 2000, outputTokens: 2000 },
    ] });
    const out = r.report({ groupBy: 'project' });
    const opusCost = (1000 / 1000) * 15 + (1000 / 1000) * 75;
    const sonnetCost = (2000 / 1000) * 3 + (2000 / 1000) * 15;
    expect(out.total.costUSD).toBe(opusCost + sonnetCost);
  });

  test('(w) includeModels expands per-model breakdown on each group', () => {
    const r = new CostReporter({ records: sampleRecords() });
    const out = r.report({ groupBy: 'project', includeModels: true });
    const arps = out.byGroup.find((g) => g.name === 'arps');
    expect(arps.perModel).toBeDefined();
    expect(arps.perModel['claude-opus']).toBeDefined();
    expect(arps.perModel['claude-sonnet']).toBeDefined();
  });

  test('(x) includeModels=false omits perModel on groups', () => {
    const r = new CostReporter({ records: sampleRecords() });
    const out = r.report({ groupBy: 'project' });
    expect(out.byGroup[0].perModel).toBeUndefined();
  });

  test('(y) zero records yields zero totals and empty byGroup', () => {
    const r = new CostReporter({ records: [] });
    const out = r.report({ groupBy: 'project' });
    expect(out.total.tokens).toBe(0);
    expect(out.total.costUSD).toBe(0);
    expect(out.byGroup.length).toBe(0);
  });

  test('(z) zero-token records contribute zero cost but still count', () => {
    const r = new CostReporter({ records: [
      { timestamp: '2026-04-17T00:00:00Z', project: 'a', model: 'claude-opus', inputTokens: 0, outputTokens: 0 }
    ] });
    const out = r.report({ groupBy: 'project' });
    expect(out.total.records).toBe(1);
    expect(out.total.costUSD).toBe(0);
  });

  test('(aa) malformed records are silently dropped', () => {
    const r = new CostReporter({ records: [
      null,
      'not an object',
      { notTimestamp: true },
      { timestamp: '2026-04-17T00:00:00Z', project: 'a', model: 'claude-opus', inputTokens: 100, outputTokens: 100 }
    ] });
    const out = r.report({ groupBy: 'project' });
    expect(out.total.records).toBe(1);
  });

  test('(bb) byGroup is sorted by costUSD descending', () => {
    const r = new CostReporter({ records: [
      { timestamp: '2026-04-01T00:00:00Z', project: 'small', model: 'claude-haiku', inputTokens: 100, outputTokens: 100 },
      { timestamp: '2026-04-02T00:00:00Z', project: 'big',   model: 'claude-opus',  inputTokens: 10000, outputTokens: 10000 },
    ] });
    const out = r.report({ groupBy: 'project' });
    expect(out.byGroup[0].name).toBe('big');
    expect(out.byGroup[1].name).toBe('small');
  });
});

describe('(10.5) CostReporter.monthlyReport', () => {
  test('(cc) monthlyReport wraps report with calendar bounds', () => {
    const r = new CostReporter({ records: sampleRecords() });
    const out = r.monthlyReport(2026, 4);
    expect(out.month.year).toBe(2026);
    expect(out.month.month).toBe(4);
    expect(out.total.records).toBe(4); // excludes 2026-03 and 2026-05
  });

  test('(dd) monthlyReport March has 2 record (the 2026-03-31)', () => {
    const r = new CostReporter({ records: sampleRecords() });
    const out = r.monthlyReport(2026, 3);
    expect(out.total.records).toBe(1);
  });

  test('(ee) monthlyReport returns includeModels by default', () => {
    const r = new CostReporter({ records: sampleRecords() });
    const out = r.monthlyReport(2026, 4);
    const arps = out.byGroup.find((g) => g.name === 'arps');
    expect(arps.perModel).toBeDefined();
  });
});

describe('(10.5) CostReporter.budgetCheck', () => {
  test('(ff) throws when limit missing or non-positive', () => {
    const r = new CostReporter({ records: [] });
    expect(() => r.budgetCheck({ limit: 0 })).toThrow('positive limit');
    expect(() => r.budgetCheck({})).toThrow('positive limit');
    expect(() => r.budgetCheck({ limit: -5 })).toThrow('positive limit');
  });

  test('(gg) under warn threshold returns ok (warning=false, exceeded=false)', () => {
    const records = [
      { timestamp: '2026-04-17T00:00:00Z', project: 'a', model: 'claude-opus', inputTokens: 1000, outputTokens: 1000 }
    ];
    const r = new CostReporter({ records });
    const now = new Date('2026-04-17T12:00:00Z');
    const check = r.budgetCheck({ limit: 1000, period: 'month', now });
    expect(check.exceeded).toBe(false);
    expect(check.warning).toBe(false);
    expect(check.percent).toBeLessThan(0.8);
  });

  test('(hh) warning=true once percent >= 0.8 but < 1.0', () => {
    // 10 opus records at 1K/1K = 90 USD each, 10 total = 900, limit 1000 -> 0.9
    const records = Array.from({ length: 10 }).map((_, i) => ({
      timestamp: `2026-04-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
      project: 'a', model: 'claude-opus', inputTokens: 1000, outputTokens: 1000,
    }));
    const r = new CostReporter({ records });
    const now = new Date('2026-04-20T12:00:00Z');
    const check = r.budgetCheck({ limit: 1000, period: 'month', now });
    expect(check.warning).toBe(true);
    expect(check.exceeded).toBe(false);
    expect(check.percent).toBeGreaterThanOrEqual(0.8);
    expect(check.percent).toBeLessThan(1.0);
  });

  test('(ii) exceeded=true once used >= limit', () => {
    const records = [
      { timestamp: '2026-04-10T00:00:00Z', project: 'a', model: 'claude-opus', inputTokens: 100000, outputTokens: 100000 }
    ];
    const r = new CostReporter({ records });
    const now = new Date('2026-04-11T12:00:00Z');
    const check = r.budgetCheck({ limit: 100, period: 'month', now });
    expect(check.exceeded).toBe(true);
    expect(check.percent).toBeGreaterThanOrEqual(1.0);
  });

  test('(jj) group filter restricts used to that group only', () => {
    const records = [
      { timestamp: '2026-04-10T00:00:00Z', project: 'big',   model: 'claude-opus', inputTokens: 10000, outputTokens: 10000 },
      { timestamp: '2026-04-11T00:00:00Z', project: 'small', model: 'claude-opus', inputTokens: 10,    outputTokens: 10 },
    ];
    const r = new CostReporter({ records });
    const now = new Date('2026-04-15T12:00:00Z');
    const checkSmall = r.budgetCheck({ limit: 1, period: 'month', group: 'small', now });
    expect(checkSmall.used).toBeLessThan(1);
    expect(checkSmall.exceeded).toBe(false);
    const checkBig = r.budgetCheck({ limit: 1, period: 'month', group: 'big', now });
    expect(checkBig.exceeded).toBe(true);
  });

  test('(kk) custom warnAt threshold honored', () => {
    const records = [
      { timestamp: '2026-04-10T00:00:00Z', project: 'a', model: 'claude-opus', inputTokens: 1000, outputTokens: 1000 }
    ];
    const r = new CostReporter({ records });
    const now = new Date('2026-04-11T12:00:00Z');
    // 90 / 1000 = 0.09 — under 0.8 default, over 0.05 custom
    const check = r.budgetCheck({ limit: 1000, period: 'month', warnAt: 0.05, now });
    expect(check.warning).toBe(true);
    expect(check.warnAt).toBe(0.05);
  });

  test('(ll) unknown period throws', () => {
    const r = new CostReporter({ records: [] });
    expect(() => r.budgetCheck({ limit: 10, period: 'decade' })).toThrow('Unknown period');
  });

  test('(mm) group missing yields used=0 (no match)', () => {
    const records = [
      { timestamp: '2026-04-10T00:00:00Z', project: 'big', model: 'claude-opus', inputTokens: 1000, outputTokens: 1000 }
    ];
    const r = new CostReporter({ records });
    const now = new Date('2026-04-11T12:00:00Z');
    const check = r.budgetCheck({ limit: 100, period: 'month', group: 'does-not-exist', now });
    expect(check.used).toBe(0);
    expect(check.exceeded).toBe(false);
  });
});

describe('(10.5) loadHistoryRecords', () => {
  test('(nn) reads JSONL and maps fields to record shape', () => {
    const dir = mkTmpDir();
    const filePath = path.join(dir, 'history.jsonl');
    const rows = [
      { name: 'w1', branch: 'c4/x', task: 't', startedAt: '2026-04-01T00:00:00Z', completedAt: '2026-04-01T01:00:00Z', inputTokens: 500, outputTokens: 200, model: 'claude-opus', commits: [] },
      { name: 'w2', project: 'arps', completedAt: '2026-04-02T00:00:00Z', input: 100, output: 100, model: 'claude-haiku' },
    ];
    fs.writeFileSync(filePath, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
    const records = loadHistoryRecords(filePath);
    expect(records.length).toBe(2);
    expect(records[0].worker).toBe('w1');
    expect(records[0].inputTokens).toBe(500);
    expect(records[0].outputTokens).toBe(200);
    expect(records[1].project).toBe('arps');
    expect(records[1].inputTokens).toBe(100);
  });

  test('(oo) missing file returns empty array', () => {
    const records = loadHistoryRecords(path.join(mkTmpDir(), 'nope.jsonl'));
    expect(records).toEqual([]);
  });

  test('(pp) malformed lines are skipped', () => {
    const dir = mkTmpDir();
    const filePath = path.join(dir, 'history.jsonl');
    fs.writeFileSync(filePath, 'not-json\n{"name":"ok","completedAt":"2026-04-01T00:00:00Z","inputTokens":1}\n\n');
    const records = loadHistoryRecords(filePath);
    expect(records.length).toBe(1);
    expect(records[0].inputTokens).toBe(1);
  });

  test('(qq) defaultHistoryPath points into repo root', () => {
    const p = defaultHistoryPath();
    expect(p.endsWith('history.jsonl')).toBe(true);
  });

  test('(rr) CostReporter integrates loadHistoryRecords via loadRecords', () => {
    const dir = mkTmpDir();
    const filePath = path.join(dir, 'history.jsonl');
    fs.writeFileSync(filePath, JSON.stringify({
      name: 'w1', branch: 'c4/x', completedAt: '2026-04-17T00:00:00Z',
      inputTokens: 1000, outputTokens: 500, model: 'claude-opus',
    }) + '\n');
    const r = new CostReporter({
      loadRecords: () => loadHistoryRecords(filePath),
    });
    const out = r.report({ groupBy: 'worker' });
    expect(out.total.records).toBe(1);
    expect(out.byGroup[0].name).toBe('w1');
    expect(out.total.costUSD).toBe(52.5);
  });
});

describe('(10.5) CostReporter totals precision', () => {
  test('(ss) fractional tokens via haiku rate still aggregate', () => {
    const r = new CostReporter({ records: [
      { timestamp: '2026-04-01T00:00:00Z', project: 'a', model: 'claude-haiku', inputTokens: 1250, outputTokens: 0 }
    ] });
    const out = r.report({ groupBy: 'project' });
    expect(out.total.costUSD).toBe(1); // 1250/1000 * 0.8 = 1.0
  });

  test('(tt) multi-period records split correctly by from/to', () => {
    const r = new CostReporter({ records: sampleRecords() });
    const april = r.report({ from: '2026-04-01T00:00:00Z', to: '2026-04-30T23:59:59Z' });
    const march = r.report({ from: '2026-03-01T00:00:00Z', to: '2026-03-31T23:59:59Z' });
    const may = r.report({ from: '2026-05-01T00:00:00Z', to: '2026-05-31T23:59:59Z' });
    expect(april.total.records).toBe(4);
    expect(march.total.records).toBe(1);
    expect(may.total.records).toBe(1);
  });
});
