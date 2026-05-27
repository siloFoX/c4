import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineSchaffDivergenceCross,
  DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_CYCLE_LENGTH,
  DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_FACTOR,
  DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_FAST_LENGTH,
  DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_PADDING,
  DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_SLOW_LENGTH,
  DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_WIDTH,
  DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_WINDOW,
  applyLineSchaffDivergenceCrossEma,
  applyLineSchaffDivergenceCrossSma,
  applyLineSchaffDivergenceCrossStochastic,
  classifyLineSchaffDivergenceCrossRegime,
  computeLineSchaffDivergenceCross,
  computeLineSchaffDivergenceCrossLayout,
  describeLineSchaffDivergenceCrossChart,
  detectLineSchaffDivergenceCrossCrosses,
  getLineSchaffDivergenceCrossFinitePoints,
  normalizeLineSchaffDivergenceCrossFactor,
  normalizeLineSchaffDivergenceCrossLength,
  normalizeLineSchaffDivergenceCrossWindow,
  runLineSchaffDivergenceCross,
  type ChartLineSchaffDivergenceCrossPoint,
  type ChartLineSchaffDivergenceCrossRegime,
} from './chart-line-schaff-divergence-cross';

const FAST = 23;
const SLOW = 50;
const CYCLE = 10;
const FACTOR = 0.5;
const WIN = 5;
// stc valid from slowLength - 1 + 2*(cycleLength - 1) = 49 + 18 = 67
const WARMUP = SLOW - 1 + 2 * (CYCLE - 1); // 67
const VALID_FROM = WARMUP + WIN; // 72

const buildConst = (
  n: number,
  k: number,
): ChartLineSchaffDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: k }));

const buildLinearUp = (n: number): ChartLineSchaffDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: i }));

const buildLinearDown = (n: number): ChartLineSchaffDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: -i }));

describe('ChartLineSchaffDivergenceCross defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_PANEL_GAP).toBe(12);
  });

  it('exports canonical STC tuning', () => {
    expect(DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_FAST_LENGTH).toBe(23);
    expect(DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_SLOW_LENGTH).toBe(50);
    expect(DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_CYCLE_LENGTH).toBe(10);
    expect(DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_FACTOR).toBe(0.5);
    expect(DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_WINDOW).toBe(5);
  });
});

describe('getLineSchaffDivergenceCrossFinitePoints', () => {
  it('filters finite x and close', () => {
    const points = [
      { x: 0, close: 1 },
      { x: NaN, close: 2 },
      { x: 2, close: Infinity },
      { x: 3, close: 4 },
    ];
    const result = getLineSchaffDivergenceCrossFinitePoints(points);
    expect(result).toEqual([
      { x: 0, close: 1 },
      { x: 3, close: 4 },
    ]);
  });

  it('returns empty array for null and non-array', () => {
    expect(getLineSchaffDivergenceCrossFinitePoints(null)).toEqual([]);
    expect(getLineSchaffDivergenceCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineSchaffDivergenceCrossFinitePoints(
        // @ts-expect-error -- intentionally bad
        'oops',
      ),
    ).toEqual([]);
  });

  it('skips falsy entries', () => {
    const points = [
      null as unknown as ChartLineSchaffDivergenceCrossPoint,
      { x: 1, close: 1 },
      undefined as unknown as ChartLineSchaffDivergenceCrossPoint,
    ];
    expect(getLineSchaffDivergenceCrossFinitePoints(points)).toEqual([
      { x: 1, close: 1 },
    ]);
  });
});

describe('normalizeLineSchaffDivergenceCrossLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineSchaffDivergenceCrossLength(23.7, 23)).toBe(23);
    expect(normalizeLineSchaffDivergenceCrossLength(1, 23)).toBe(1);
  });

  it('falls back when invalid', () => {
    expect(normalizeLineSchaffDivergenceCrossLength(0, 23)).toBe(23);
    expect(normalizeLineSchaffDivergenceCrossLength(-3, 23)).toBe(23);
    expect(normalizeLineSchaffDivergenceCrossLength(NaN, 23)).toBe(23);
    expect(normalizeLineSchaffDivergenceCrossLength('big', 23)).toBe(23);
  });
});

describe('normalizeLineSchaffDivergenceCrossWindow', () => {
  it('floors finite >=1 windows', () => {
    expect(normalizeLineSchaffDivergenceCrossWindow(5.9, 5)).toBe(5);
    expect(normalizeLineSchaffDivergenceCrossWindow(1, 5)).toBe(1);
  });

  it('falls back when invalid', () => {
    expect(normalizeLineSchaffDivergenceCrossWindow(0, 5)).toBe(5);
    expect(normalizeLineSchaffDivergenceCrossWindow(-1, 5)).toBe(5);
    expect(normalizeLineSchaffDivergenceCrossWindow(NaN, 5)).toBe(5);
  });
});

describe('normalizeLineSchaffDivergenceCrossFactor', () => {
  it('accepts strictly 0 < v <= 1', () => {
    expect(normalizeLineSchaffDivergenceCrossFactor(0.5, 0.5)).toBe(0.5);
    expect(normalizeLineSchaffDivergenceCrossFactor(1, 0.5)).toBe(1);
  });

  it('falls back on boundary and invalid', () => {
    expect(normalizeLineSchaffDivergenceCrossFactor(0, 0.5)).toBe(0.5);
    expect(normalizeLineSchaffDivergenceCrossFactor(-0.5, 0.5)).toBe(0.5);
    expect(normalizeLineSchaffDivergenceCrossFactor(1.5, 0.5)).toBe(0.5);
    expect(normalizeLineSchaffDivergenceCrossFactor(NaN, 0.5)).toBe(0.5);
  });
});

describe('applyLineSchaffDivergenceCrossSma', () => {
  it('CONST values return constant', () => {
    const values: Array<number | null> = Array.from({ length: 10 }, () => 7);
    const sma = applyLineSchaffDivergenceCrossSma(values, 3);
    for (let i = 0; i < 2; i += 1) expect(sma[i]).toBeNull();
    for (let i = 2; i < 10; i += 1) expect(sma[i]).toBe(7);
  });

  it('LINEAR closes return i - (length-1)/2', () => {
    const values: Array<number | null> = Array.from(
      { length: 20 },
      (_, i) => i,
    );
    const sma = applyLineSchaffDivergenceCrossSma(values, 5);
    for (let i = 4; i < 20; i += 1) {
      expect(sma[i] as number).toBeCloseTo(i - 2, 9);
    }
  });

  it('length=1 returns identity', () => {
    const sma = applyLineSchaffDivergenceCrossSma([1, 2, 3], 1);
    expect(sma).toEqual([1, 2, 3]);
  });

  it('returns all nulls when length < 1', () => {
    const sma = applyLineSchaffDivergenceCrossSma([1, 2, 3], 0);
    expect(sma.every((v) => v === null)).toBe(true);
  });

  it('stops at null gap', () => {
    const sma = applyLineSchaffDivergenceCrossSma(
      [1, 1, 1, null, 1, 1, 1],
      3,
    );
    expect(sma[2]).toBe(1);
    expect(sma[3]).toBeNull();
    expect(sma[4]).toBeNull();
    expect(sma[5]).toBeNull();
    expect(sma[6]).toBe(1);
  });
});

describe('applyLineSchaffDivergenceCrossStochastic', () => {
  it('CONST returns degenerate 50', () => {
    const values: Array<number | null> = Array.from({ length: 10 }, () => 7);
    const out = applyLineSchaffDivergenceCrossStochastic(values, 4);
    for (let i = 3; i < 10; i += 1) expect(out[i]).toBe(50);
  });

  it('LINEAR UP returns 100 at the top', () => {
    const values: Array<number | null> = Array.from(
      { length: 10 },
      (_, i) => i,
    );
    const out = applyLineSchaffDivergenceCrossStochastic(values, 4);
    for (let i = 3; i < 10; i += 1) {
      expect(out[i] as number).toBeCloseTo(100, 9);
    }
  });

  it('returns nulls when length < 1', () => {
    const out = applyLineSchaffDivergenceCrossStochastic([1, 2, 3], 0);
    expect(out.every((v) => v === null)).toBe(true);
  });
});

describe('applyLineSchaffDivergenceCrossEma', () => {
  it('seeds at first valid value', () => {
    const out = applyLineSchaffDivergenceCrossEma([null, 100, 100], 0.5);
    expect(out[0]).toBeNull();
    expect(out[1]).toBe(100);
    expect(out[2]).toBe(100);
  });

  it('CONST input stays constant', () => {
    const out = applyLineSchaffDivergenceCrossEma([50, 50, 50, 50, 50], 0.5);
    expect(out.every((v) => v === 50)).toBe(true);
  });
});

describe('computeLineSchaffDivergenceCross', () => {
  it('returns empty channels for empty data', () => {
    expect(computeLineSchaffDivergenceCross([])).toEqual({
      macd: [],
      k1: [],
      d1: [],
      k2: [],
      stc: [],
    });
    expect(computeLineSchaffDivergenceCross(null)).toEqual({
      macd: [],
      k1: [],
      d1: [],
      k2: [],
      stc: [],
    });
  });

  it('CONST close=K returns stc=50 from warmup', () => {
    const data = buildConst(80, 50);
    const out = computeLineSchaffDivergenceCross(data);
    expect(out.stc[WARMUP] as number).toBeCloseTo(50, 9);
    expect(out.stc[WARMUP - 1]).toBeNull();
  });

  it('LINEAR UP returns stc=50 from warmup (constant macd -> degenerate stochastic)', () => {
    const data = buildLinearUp(120);
    const out = computeLineSchaffDivergenceCross(data);
    for (let i = WARMUP; i < 120; i += 1) {
      expect(out.stc[i] as number).toBeCloseTo(50, 9);
    }
  });
});

describe('classifyLineSchaffDivergenceCrossRegime', () => {
  const cases: Array<{
    priceUp: boolean | null;
    stcUp: boolean | null;
    expected: ChartLineSchaffDivergenceCrossRegime;
  }> = [
    { priceUp: true, stcUp: true, expected: 'aligned-bullish' },
    { priceUp: false, stcUp: false, expected: 'aligned-bearish' },
    { priceUp: false, stcUp: true, expected: 'divergent-bullish' },
    { priceUp: true, stcUp: false, expected: 'divergent-bearish' },
    { priceUp: null, stcUp: false, expected: 'none' },
    { priceUp: true, stcUp: null, expected: 'none' },
    { priceUp: null, stcUp: null, expected: 'none' },
  ];
  it.each(cases)(
    'classifies priceUp=$priceUp stcUp=$stcUp as $expected',
    ({ priceUp, stcUp, expected }) => {
      expect(classifyLineSchaffDivergenceCrossRegime(priceUp, stcUp)).toBe(
        expected,
      );
    },
  );
});

describe('detectLineSchaffDivergenceCrossCrosses', () => {
  it('suppresses crosses entered from none', () => {
    const series = Array.from({ length: 6 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const states: ChartLineSchaffDivergenceCrossRegime[] = [
      'none',
      'none',
      'none',
      'none',
      'divergent-bullish',
      'divergent-bullish',
    ];
    const out = detectLineSchaffDivergenceCrossCrosses(series, states);
    expect(out).toHaveLength(0);
  });

  it('detects bullish cross from aligned-bearish to divergent-bullish', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const states: ChartLineSchaffDivergenceCrossRegime[] = [
      'aligned-bearish',
      'aligned-bearish',
      'divergent-bullish',
      'divergent-bullish',
    ];
    const out = detectLineSchaffDivergenceCrossCrosses(series, states);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
    expect(out[0]?.index).toBe(2);
  });

  it('detects bearish cross from aligned-bullish to divergent-bearish', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const states: ChartLineSchaffDivergenceCrossRegime[] = [
      'aligned-bullish',
      'aligned-bullish',
      'divergent-bearish',
      'divergent-bearish',
    ];
    const out = detectLineSchaffDivergenceCrossCrosses(series, states);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
    expect(out[0]?.index).toBe(2);
  });

  it('does not double-fire when state holds steady', () => {
    const series = Array.from({ length: 5 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const states: ChartLineSchaffDivergenceCrossRegime[] = [
      'aligned-bearish',
      'divergent-bullish',
      'divergent-bullish',
      'divergent-bullish',
      'divergent-bullish',
    ];
    const out = detectLineSchaffDivergenceCrossCrosses(series, states);
    expect(out).toHaveLength(1);
  });

  it('handles alternating crosses', () => {
    const series = Array.from({ length: 5 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const states: ChartLineSchaffDivergenceCrossRegime[] = [
      'aligned-bullish',
      'divergent-bullish',
      'divergent-bearish',
      'divergent-bullish',
      'aligned-bullish',
    ];
    const out = detectLineSchaffDivergenceCrossCrosses(series, states);
    expect(out.map((c) => c.kind)).toEqual([
      'bullish',
      'bearish',
      'bullish',
    ]);
  });
});

describe('runLineSchaffDivergenceCross CONST K', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST close=${K}: stc=50, aligned-bearish, 0 crosses`, () => {
      const data = buildConst(120, K);
      const run = runLineSchaffDivergenceCross(data);
      expect(run.fastLength).toBe(FAST);
      expect(run.slowLength).toBe(SLOW);
      expect(run.cycleLength).toBe(CYCLE);
      expect(run.factor).toBe(FACTOR);
      expect(run.divergenceWindow).toBe(WIN);
      expect(run.series).toHaveLength(120);
      for (let i = 0; i < WARMUP; i += 1) {
        expect(run.stcValues[i]).toBeNull();
      }
      for (let i = WARMUP; i < 120; i += 1) {
        expect(run.stcValues[i] as number).toBeCloseTo(50, 9);
      }
      for (let i = 0; i < VALID_FROM; i += 1) {
        expect(run.samples[i]?.regime).toBe('none');
      }
      for (let i = VALID_FROM; i < 120; i += 1) {
        expect(run.samples[i]?.regime).toBe('aligned-bearish');
        expect(run.samples[i]?.priceUp).toBe(false);
        expect(run.samples[i]?.stcUp).toBe(false);
      }
      expect(run.crosses).toHaveLength(0);
      expect(run.bullishCrossCount).toBe(0);
      expect(run.bearishCrossCount).toBe(0);
      expect(run.noneCount).toBe(VALID_FROM);
      expect(run.alignedBearishCount).toBe(120 - VALID_FROM);
      expect(run.alignedBullishCount).toBe(0);
      expect(run.divergentBullishCount).toBe(0);
      expect(run.divergentBearishCount).toBe(0);
      expect(run.ok).toBe(true);
    });
  }
});

describe('runLineSchaffDivergenceCross LINEAR UP', () => {
  it('LINEAR UP: stc=50 saturated, divergent-bearish, 0 crosses', () => {
    const data = buildLinearUp(120);
    const run = runLineSchaffDivergenceCross(data);
    for (let i = 0; i < WARMUP; i += 1) {
      expect(run.stcValues[i]).toBeNull();
    }
    for (let i = WARMUP; i < 120; i += 1) {
      expect(run.stcValues[i] as number).toBeCloseTo(50, 9);
    }
    for (let i = VALID_FROM; i < 120; i += 1) {
      expect(run.samples[i]?.regime).toBe('divergent-bearish');
      expect(run.samples[i]?.priceUp).toBe(true);
      expect(run.samples[i]?.stcUp).toBe(false);
    }
    expect(run.divergentBearishCount).toBe(120 - VALID_FROM);
    expect(run.alignedBullishCount).toBe(0);
    expect(run.alignedBearishCount).toBe(0);
    expect(run.divergentBullishCount).toBe(0);
    expect(run.noneCount).toBe(VALID_FROM);
    expect(run.crosses).toHaveLength(0);
    expect(run.ok).toBe(true);
  });
});

describe('runLineSchaffDivergenceCross LINEAR DOWN', () => {
  it('LINEAR DOWN: stc=50 saturated, aligned-bearish, 0 crosses', () => {
    const data = buildLinearDown(120);
    const run = runLineSchaffDivergenceCross(data);
    for (let i = WARMUP; i < 120; i += 1) {
      expect(run.stcValues[i] as number).toBeCloseTo(50, 9);
    }
    for (let i = VALID_FROM; i < 120; i += 1) {
      expect(run.samples[i]?.regime).toBe('aligned-bearish');
      expect(run.samples[i]?.priceUp).toBe(false);
      expect(run.samples[i]?.stcUp).toBe(false);
    }
    expect(run.alignedBearishCount).toBe(120 - VALID_FROM);
    expect(run.divergentBullishCount).toBe(0);
    expect(run.divergentBearishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineSchaffDivergenceCross misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineSchaffDivergenceCrossPoint[] = [
      { x: 2, close: 1 },
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    const run = runLineSchaffDivergenceCross(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when series too short for warmup+window', () => {
    const data = buildConst(60, 50);
    const run = runLineSchaffDivergenceCross(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineSchaffDivergenceCross([]);
    expect(run.series).toEqual([]);
    expect(run.stcValues).toEqual([]);
    expect(run.samples).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom tuning', () => {
    const data = buildLinearUp(40);
    const run = runLineSchaffDivergenceCross(data, {
      fastLength: 5,
      slowLength: 10,
      cycleLength: 3,
      factor: 0.5,
      divergenceWindow: 1,
    });
    expect(run.fastLength).toBe(5);
    expect(run.slowLength).toBe(10);
    expect(run.cycleLength).toBe(3);
    expect(run.factor).toBe(0.5);
    expect(run.divergenceWindow).toBe(1);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(120);
    const run = runLineSchaffDivergenceCross(data);
    const total =
      run.alignedBullishCount +
      run.alignedBearishCount +
      run.divergentBullishCount +
      run.divergentBearishCount +
      run.noneCount;
    expect(total).toBe(120);
  });
});

describe('computeLineSchaffDivergenceCrossLayout', () => {
  it('returns a non-empty SVG path for CONST K=50', () => {
    const data = buildConst(120, 50);
    const layout = computeLineSchaffDivergenceCrossLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toContain(' L ');
    expect(layout.priceDots).toHaveLength(120);
    expect(layout.stcPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineSchaffDivergenceCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.stcPath).toBe('');
    expect(layout.priceDots).toEqual([]);
    expect(layout.crossMarkers).toEqual([]);
  });

  it('pads degenerate priceMin === priceMax', () => {
    const data = buildConst(120, 100);
    const layout = computeLineSchaffDivergenceCrossLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });

  it('uses fixed 0..100 oscillator range', () => {
    const layout = computeLineSchaffDivergenceCrossLayout({
      data: buildConst(120, 50),
    });
    expect(layout.oscMin).toBe(0);
    expect(layout.oscMax).toBe(100);
    expect(layout.zeroY).toBe(layout.oscBottom);
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineSchaffDivergenceCrossLayout({
      data: buildLinearUp(120),
      width: 600,
      height: 320,
      padding: 32,
      panelGap: 8,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(320);
    expect(layout.padding).toBe(32);
    expect(layout.panelGap).toBe(8);
  });
});

describe('describeLineSchaffDivergenceCrossChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineSchaffDivergenceCrossChart([])).toBe('No data');
  });

  it('mentions bar count, fast, slow, cycle, window', () => {
    const desc = describeLineSchaffDivergenceCrossChart(buildLinearUp(120));
    expect(desc).toContain('120 bars');
    expect(desc).toContain('fast 23');
    expect(desc).toContain('slow 50');
    expect(desc).toContain('cycle 10');
    expect(desc).toContain('divergenceWindow 5');
  });
});

describe('<ChartLineSchaffDivergenceCross /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(120);
    const { container } = render(
      <ChartLineSchaffDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-schaff-divergence-cross"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-fast-length')).toBe(String(FAST));
    expect(root?.getAttribute('data-slow-length')).toBe(String(SLOW));
    expect(root?.getAttribute('data-cycle-length')).toBe(String(CYCLE));
    expect(root?.getAttribute('data-divergence-window')).toBe(String(WIN));
  });

  it('renders an empty fallback when data is empty', () => {
    const { container } = render(
      <ChartLineSchaffDivergenceCross data={[]} />,
    );
    const empty = container.querySelector(
      '[data-section="chart-line-schaff-divergence-cross-empty"]',
    );
    expect(empty).not.toBeNull();
  });

  it('renders the price and STC paths', () => {
    const data = buildLinearUp(120);
    const { container } = render(
      <ChartLineSchaffDivergenceCross data={data} />,
    );
    const price = container.querySelector(
      '[data-section="chart-line-schaff-divergence-cross-price-path"]',
    );
    const stc = container.querySelector(
      '[data-section="chart-line-schaff-divergence-cross-stc-path"]',
    );
    expect(price).not.toBeNull();
    expect(stc).not.toBeNull();
  });

  it('renders the zero reference line', () => {
    const data = buildConst(120, 50);
    const { container } = render(
      <ChartLineSchaffDivergenceCross data={data} />,
    );
    const zero = container.querySelector(
      '[data-section="chart-line-schaff-divergence-cross-zero-line"]',
    );
    expect(zero).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(120);
    const { container } = render(
      <ChartLineSchaffDivergenceCross data={data} showLegend={false} />,
    );
    const legend = container.querySelector(
      '[data-section="chart-line-schaff-divergence-cross-legend"]',
    );
    expect(legend).toBeNull();
  });

  it('respects showAxis=false and showGrid=false', () => {
    const data = buildLinearUp(120);
    const { container } = render(
      <ChartLineSchaffDivergenceCross
        data={data}
        showAxis={false}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-schaff-divergence-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-schaff-divergence-cross-grid"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge with crosses count', () => {
    const data = buildLinearUp(120);
    const { container } = render(
      <ChartLineSchaffDivergenceCross data={data} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-schaff-divergence-cross-badge"]',
    );
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain('fast 23');
    expect(badge?.textContent).toContain('slow 50');
    expect(badge?.textContent).toContain('cycle 10');
    expect(badge?.textContent).toContain('window 5');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('emits empty when data filters down to nothing', () => {
    const data = [
      { x: NaN, close: 1 },
      { x: 1, close: NaN },
    ];
    const { container } = render(
      <ChartLineSchaffDivergenceCross data={data} />,
    );
    const empty = container.querySelector(
      '[data-section="chart-line-schaff-divergence-cross-empty"]',
    );
    expect(empty).not.toBeNull();
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(120);
    const { container } = render(
      <ChartLineSchaffDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-schaff-divergence-cross"]',
    );
    expect(root?.getAttribute('aria-label')).toBe(
      'Schaff STC Divergence Cross chart',
    );
  });

  it('exposes data-*-count counters', () => {
    const data = buildLinearUp(120);
    const { container } = render(
      <ChartLineSchaffDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-schaff-divergence-cross"]',
    );
    expect(root?.getAttribute('data-aligned-bullish-count')).toBe('0');
    expect(root?.getAttribute('data-aligned-bearish-count')).toBe('0');
    expect(root?.getAttribute('data-divergent-bullish-count')).toBe('0');
    expect(root?.getAttribute('data-divergent-bearish-count')).toBe(
      String(120 - VALID_FROM),
    );
    expect(root?.getAttribute('data-bullish-cross-count')).toBe('0');
    expect(root?.getAttribute('data-bearish-cross-count')).toBe('0');
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('renders the title and aria description elements', () => {
    const data = buildLinearUp(120);
    const { container } = render(
      <ChartLineSchaffDivergenceCross data={data} />,
    );
    const title = container.querySelector(
      '[data-section="chart-line-schaff-divergence-cross-title"]',
    );
    const desc = container.querySelector(
      '[data-section="chart-line-schaff-divergence-cross-aria-desc"]',
    );
    expect(title).not.toBeNull();
    expect(desc).not.toBeNull();
    expect(desc?.textContent).toContain('Schaff STC Divergence Cross chart');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(120);
    const { container } = render(
      <ChartLineSchaffDivergenceCross data={data} hiddenSeries={['stc']} />,
    );
    const stc = container.querySelector(
      '[data-section="chart-line-schaff-divergence-cross-stc-path"]',
    );
    expect(stc).toBeNull();
  });
});
