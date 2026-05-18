// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BUNDLE_BUDGETS,
  checkBundleBudgets,
  classifyChunk,
  formatReport,
} from './bundle-budget.mjs';

describe('classifyChunk', () => {
  it('returns "vendor" for vendor-* chunks', () => {
    expect(classifyChunk('vendor-react.abc.js')).toBe('vendor');
    expect(classifyChunk('vendor-react-dom.def.js')).toBe('vendor');
    expect(classifyChunk('vendor-xterm.123.js')).toBe('vendor');
    expect(classifyChunk('vendor-lucide.456.js')).toBe('vendor');
    expect(classifyChunk('vendor.789.js')).toBe('vendor');
  });

  it('returns "main" for index-* / main-* chunks', () => {
    expect(classifyChunk('index.abc.js')).toBe('main');
    expect(classifyChunk('index-abc.js')).toBe('main');
    expect(classifyChunk('main.def.js')).toBe('main');
  });

  it('returns "route" for any other chunk filename', () => {
    expect(classifyChunk('Queue-abc.js')).toBe('route');
    expect(classifyChunk('Workers.def.js')).toBe('route');
    expect(classifyChunk('SessionsView.123.js')).toBe('route');
  });
});

describe('DEFAULT_BUNDLE_BUDGETS', () => {
  it('matches the dispatch spec (main < 500KB, vendor < 800KB) in bytes', () => {
    expect(DEFAULT_BUNDLE_BUDGETS.main).toBe(500 * 1024);
    expect(DEFAULT_BUNDLE_BUDGETS.vendor).toBe(800 * 1024);
    expect(DEFAULT_BUNDLE_BUDGETS.route).toBe(200 * 1024);
  });

  it('is frozen so adopters cannot mutate it accidentally', () => {
    expect(Object.isFrozen(DEFAULT_BUNDLE_BUDGETS)).toBe(true);
  });
});

describe('checkBundleBudgets', () => {
  it('returns ok=true and zero breaches for an empty record set', () => {
    const result = checkBundleBudgets([]);
    expect(result.ok).toBe(true);
    expect(result.breaches).toEqual([]);
    expect(result.perClass).toEqual({ main: 0, vendor: 0, route: 0 });
  });

  it('returns ok=true when every class stays within budget', () => {
    const records = [
      { name: 'index.abc.js', rawSize: 0, gzipSize: 100 * 1024 },
      { name: 'vendor-react.def.js', rawSize: 0, gzipSize: 200 * 1024 },
      { name: 'Workers.123.js', rawSize: 0, gzipSize: 50 * 1024 },
    ];
    const result = checkBundleBudgets(records);
    expect(result.ok).toBe(true);
    expect(result.breaches).toEqual([]);
    expect(result.perClass.main).toBe(100 * 1024);
    expect(result.perClass.vendor).toBe(200 * 1024);
    expect(result.perClass.route).toBe(50 * 1024);
  });

  it('reports a breach when main exceeds its budget', () => {
    const records = [
      { name: 'index.abc.js', rawSize: 0, gzipSize: 600 * 1024 },
    ];
    const result = checkBundleBudgets(records);
    expect(result.ok).toBe(false);
    expect(result.breaches).toHaveLength(1);
    expect(result.breaches[0].class).toBe('main');
    expect(result.breaches[0].actual).toBe(600 * 1024);
    expect(result.breaches[0].budget).toBe(500 * 1024);
    expect(result.breaches[0].delta).toBe(100 * 1024);
  });

  it('reports a breach when vendor exceeds its budget', () => {
    const records = [
      { name: 'vendor.abc.js', rawSize: 0, gzipSize: 900 * 1024 },
    ];
    const result = checkBundleBudgets(records);
    expect(result.ok).toBe(false);
    expect(result.breaches[0].class).toBe('vendor');
    expect(result.breaches[0].delta).toBe(100 * 1024);
  });

  it('reports multiple breaches when multiple classes exceed', () => {
    const records = [
      { name: 'index.abc.js', rawSize: 0, gzipSize: 600 * 1024 },
      { name: 'vendor.def.js', rawSize: 0, gzipSize: 900 * 1024 },
      { name: 'Queue.123.js', rawSize: 0, gzipSize: 300 * 1024 },
    ];
    const result = checkBundleBudgets(records);
    expect(result.breaches).toHaveLength(3);
    const classes = result.breaches.map((b) => b.class).sort();
    expect(classes).toEqual(['main', 'route', 'vendor']);
  });

  it('sums per-class bytes across multiple chunks in the same class', () => {
    const records = [
      { name: 'vendor-react.a.js', rawSize: 0, gzipSize: 200 * 1024 },
      { name: 'vendor-xterm.b.js', rawSize: 0, gzipSize: 300 * 1024 },
      { name: 'vendor-lucide.c.js', rawSize: 0, gzipSize: 100 * 1024 },
    ];
    const result = checkBundleBudgets(records);
    expect(result.perClass.vendor).toBe(600 * 1024);
    expect(result.ok).toBe(true);
  });

  it('does NOT breach at exactly the budget boundary', () => {
    const records = [
      { name: 'index.js', rawSize: 0, gzipSize: 500 * 1024 },
    ];
    const result = checkBundleBudgets(records);
    expect(result.ok).toBe(true);
    expect(result.breaches).toEqual([]);
  });

  it('breaches when one byte over the budget', () => {
    const records = [
      { name: 'index.js', rawSize: 0, gzipSize: 500 * 1024 + 1 },
    ];
    const result = checkBundleBudgets(records);
    expect(result.ok).toBe(false);
    expect(result.breaches[0].delta).toBe(1);
  });

  it('groups records by class in the report (byClass)', () => {
    const records = [
      { name: 'index.js', rawSize: 0, gzipSize: 100 },
      { name: 'vendor.js', rawSize: 0, gzipSize: 200 },
      { name: 'Queue.js', rawSize: 0, gzipSize: 50 },
      { name: 'Workers.js', rawSize: 0, gzipSize: 60 },
    ];
    const result = checkBundleBudgets(records);
    expect(result.byClass.main.map((r) => r.name)).toEqual(['index.js']);
    expect(result.byClass.vendor.map((r) => r.name)).toEqual(['vendor.js']);
    expect(result.byClass.route.map((r) => r.name).sort()).toEqual([
      'Queue.js',
      'Workers.js',
    ]);
  });

  it('honours caller-supplied budgets', () => {
    const records = [
      { name: 'index.js', rawSize: 0, gzipSize: 10 },
    ];
    const result = checkBundleBudgets(records, {
      main: 5,
      vendor: 1000,
      route: 1000,
    });
    expect(result.ok).toBe(false);
    expect(result.breaches[0].budget).toBe(5);
  });
});

describe('formatReport', () => {
  it('renders per-class status lines with [ok] or [OVER]', () => {
    const records = [
      { name: 'index.js', rawSize: 0, gzipSize: 100 * 1024 },
      { name: 'vendor.js', rawSize: 0, gzipSize: 900 * 1024 },
    ];
    const result = checkBundleBudgets(records);
    const out = formatReport(result);
    expect(out).toContain('Bundle budget report');
    expect(out).toContain('[ok] main');
    expect(out).toContain('[OVER] vendor');
    expect(out).toContain('Breaches');
    expect(out).toContain('vendor:');
  });

  it('omits the Breaches section when ok=true', () => {
    const records = [
      { name: 'index.js', rawSize: 0, gzipSize: 100 * 1024 },
    ];
    const result = checkBundleBudgets(records);
    const out = formatReport(result);
    expect(out).not.toContain('Breaches:');
  });

  it('includes per-chunk size lines (gz / raw)', () => {
    const records = [
      { name: 'index.abc.js', rawSize: 1000, gzipSize: 500 },
    ];
    const result = checkBundleBudgets(records);
    const out = formatReport(result);
    expect(out).toContain('index.abc.js');
    expect(out).toContain('gz');
    expect(out).toContain('raw');
  });
});
