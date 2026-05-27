import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineStcDivergenceCross,
  DEFAULT_CHART_LINE_STC_DIVERGENCE_CROSS_CYCLE_LENGTH,
  DEFAULT_CHART_LINE_STC_DIVERGENCE_CROSS_FACTOR,
  DEFAULT_CHART_LINE_STC_DIVERGENCE_CROSS_FAST_LENGTH,
  DEFAULT_CHART_LINE_STC_DIVERGENCE_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_STC_DIVERGENCE_CROSS_PADDING,
  DEFAULT_CHART_LINE_STC_DIVERGENCE_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_STC_DIVERGENCE_CROSS_SLOW_LENGTH,
  DEFAULT_CHART_LINE_STC_DIVERGENCE_CROSS_WIDTH,
  DEFAULT_CHART_LINE_STC_DIVERGENCE_CROSS_WINDOW,
  classifyLineStcDivergenceCrossBias,
  classifyLineStcDivergenceCrossRegime,
  computeLineStcDivergenceCross,
  computeLineStcDivergenceCrossLayout,
  describeLineStcDivergenceCrossChart,
  detectLineStcDivergenceCrossCrosses,
  getLineStcDivergenceCrossFinitePoints,
  normalizeLineStcDivergenceCrossFactor,
  normalizeLineStcDivergenceCrossLength,
  normalizeLineStcDivergenceCrossWindow,
  runLineStcDivergenceCross,
  type ChartLineStcDivergenceCrossPoint,
  type ChartLineStcDivergenceCrossRegime,
} from './chart-line-stc-divergence-cross';

const FAST = 23;
const SLOW = 50;
const CYCLE = 10;
const FACTOR = 0.5;
const WIN = 5;
const WARMUP = SLOW - 1 + 2 * (CYCLE - 1); // 67
const VALID_FROM = WARMUP + WIN; // 72

const buildConst = (
  n: number,
  k: number,
): ChartLineStcDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: k }));

const buildLinearUp = (n: number): ChartLineStcDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: i }));

const buildLinearDown = (n: number): ChartLineStcDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: -i }));

describe('ChartLineStcDivergenceCross defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_STC_DIVERGENCE_CROSS_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_STC_DIVERGENCE_CROSS_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_STC_DIVERGENCE_CROSS_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_STC_DIVERGENCE_CROSS_PANEL_GAP).toBe(12);
  });

  it('exports canonical STC tuning', () => {
    expect(DEFAULT_CHART_LINE_STC_DIVERGENCE_CROSS_FAST_LENGTH).toBe(23);
    expect(DEFAULT_CHART_LINE_STC_DIVERGENCE_CROSS_SLOW_LENGTH).toBe(50);
    expect(DEFAULT_CHART_LINE_STC_DIVERGENCE_CROSS_CYCLE_LENGTH).toBe(10);
    expect(DEFAULT_CHART_LINE_STC_DIVERGENCE_CROSS_FACTOR).toBe(0.5);
    expect(DEFAULT_CHART_LINE_STC_DIVERGENCE_CROSS_WINDOW).toBe(5);
  });
});

describe('getLineStcDivergenceCrossFinitePoints', () => {
  it('filters finite x and close', () => {
    const points = [
      { x: 0, close: 1 },
      { x: NaN, close: 2 },
      { x: 2, close: Infinity },
      { x: 3, close: 4 },
    ];
    expect(getLineStcDivergenceCrossFinitePoints(points)).toEqual([
      { x: 0, close: 1 },
      { x: 3, close: 4 },
    ]);
  });

  it('returns empty array for null and non-array', () => {
    expect(getLineStcDivergenceCrossFinitePoints(null)).toEqual([]);
    expect(getLineStcDivergenceCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineStcDivergenceCrossFinitePoints(
        // @ts-expect-error -- intentionally bad
        'oops',
      ),
    ).toEqual([]);
  });
});

describe('normalize helpers', () => {
  it('length: floors finite >=1', () => {
    expect(normalizeLineStcDivergenceCrossLength(23.7, 23)).toBe(23);
    expect(normalizeLineStcDivergenceCrossLength(0, 23)).toBe(23);
    expect(normalizeLineStcDivergenceCrossLength(NaN, 23)).toBe(23);
  });

  it('window: floors finite >=1', () => {
    expect(normalizeLineStcDivergenceCrossWindow(5.9, 5)).toBe(5);
    expect(normalizeLineStcDivergenceCrossWindow(0, 5)).toBe(5);
  });

  it('factor: accepts strictly 0 < v <= 1', () => {
    expect(normalizeLineStcDivergenceCrossFactor(0.5, 0.5)).toBe(0.5);
    expect(normalizeLineStcDivergenceCrossFactor(1, 0.5)).toBe(1);
    expect(normalizeLineStcDivergenceCrossFactor(0, 0.5)).toBe(0.5);
    expect(normalizeLineStcDivergenceCrossFactor(1.5, 0.5)).toBe(0.5);
    expect(normalizeLineStcDivergenceCrossFactor(NaN, 0.5)).toBe(0.5);
  });
});

describe('classifyLineStcDivergenceCrossRegime', () => {
  const cases: Array<{
    priceUp: boolean | null;
    stcUp: boolean | null;
    expected: ChartLineStcDivergenceCrossRegime;
  }> = [
    { priceUp: true, stcUp: true, expected: 'aligned-bullish' },
    { priceUp: false, stcUp: false, expected: 'aligned-bearish' },
    { priceUp: false, stcUp: true, expected: 'divergent-bullish' },
    { priceUp: true, stcUp: false, expected: 'divergent-bearish' },
    { priceUp: null, stcUp: false, expected: 'none' },
    { priceUp: true, stcUp: null, expected: 'none' },
  ];
  it.each(cases)(
    'classifies priceUp=$priceUp stcUp=$stcUp as $expected',
    ({ priceUp, stcUp, expected }) => {
      expect(classifyLineStcDivergenceCrossRegime(priceUp, stcUp)).toBe(
        expected,
      );
    },
  );
});

describe('classifyLineStcDivergenceCrossBias', () => {
  it('returns up when cur > prev', () => {
    expect(classifyLineStcDivergenceCrossBias(60, 50)).toBe('up');
  });

  it('returns down when cur < prev', () => {
    expect(classifyLineStcDivergenceCrossBias(40, 50)).toBe('down');
  });

  it('returns flat when cur === prev', () => {
    expect(classifyLineStcDivergenceCrossBias(50, 50)).toBe('flat');
  });

  it('returns none when either is null', () => {
    expect(classifyLineStcDivergenceCrossBias(null, 50)).toBe('none');
    expect(classifyLineStcDivergenceCrossBias(50, null)).toBe('none');
    expect(classifyLineStcDivergenceCrossBias(null, null)).toBe('none');
  });
});

describe('detectLineStcDivergenceCrossCrosses', () => {
  it('suppresses crosses entered from none', () => {
    const series = Array.from({ length: 6 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const states: ChartLineStcDivergenceCrossRegime[] = [
      'none',
      'none',
      'none',
      'none',
      'divergent-bullish',
      'divergent-bullish',
    ];
    const stcVals: Array<number | null> = [
      null,
      null,
      null,
      50,
      60,
      60,
    ];
    const out = detectLineStcDivergenceCrossCrosses(series, states, stcVals);
    expect(out).toHaveLength(0);
  });

  it('detects bullish cross with up bias', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const states: ChartLineStcDivergenceCrossRegime[] = [
      'aligned-bearish',
      'aligned-bearish',
      'divergent-bullish',
      'divergent-bullish',
    ];
    const stcVals: Array<number | null> = [40, 50, 60, 70];
    const out = detectLineStcDivergenceCrossCrosses(series, states, stcVals);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
    expect(out[0]?.bias).toBe('up');
    expect(out[0]?.index).toBe(2);
  });

  it('detects bearish cross with down bias', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const states: ChartLineStcDivergenceCrossRegime[] = [
      'aligned-bullish',
      'aligned-bullish',
      'divergent-bearish',
      'divergent-bearish',
    ];
    const stcVals: Array<number | null> = [70, 60, 50, 40];
    const out = detectLineStcDivergenceCrossCrosses(series, states, stcVals);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
    expect(out[0]?.bias).toBe('down');
  });

  it('tags flat bias when slope is zero at cross', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const states: ChartLineStcDivergenceCrossRegime[] = [
      'aligned-bearish',
      'aligned-bearish',
      'divergent-bullish',
      'divergent-bullish',
    ];
    const stcVals: Array<number | null> = [50, 50, 50, 50];
    const out = detectLineStcDivergenceCrossCrosses(series, states, stcVals);
    expect(out).toHaveLength(1);
    expect(out[0]?.bias).toBe('flat');
  });

  it('does not double-fire when state holds steady', () => {
    const series = Array.from({ length: 5 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const states: ChartLineStcDivergenceCrossRegime[] = [
      'aligned-bearish',
      'divergent-bullish',
      'divergent-bullish',
      'divergent-bullish',
      'divergent-bullish',
    ];
    const stcVals: Array<number | null> = [40, 50, 60, 70, 80];
    const out = detectLineStcDivergenceCrossCrosses(series, states, stcVals);
    expect(out).toHaveLength(1);
  });
});

describe('computeLineStcDivergenceCross', () => {
  it('returns empty channels for empty data', () => {
    expect(computeLineStcDivergenceCross([])).toEqual({
      macd: [],
      k1: [],
      d1: [],
      k2: [],
      stc: [],
    });
  });

  it('CONST close=K returns stc=50 from warmup', () => {
    const data = buildConst(120, 50);
    const out = computeLineStcDivergenceCross(data);
    expect(out.stc[WARMUP] as number).toBeCloseTo(50, 9);
    expect(out.stc[WARMUP - 1]).toBeNull();
  });

  it('LINEAR UP returns stc=50 from warmup', () => {
    const data = buildLinearUp(120);
    const out = computeLineStcDivergenceCross(data);
    for (let i = WARMUP; i < 120; i += 1) {
      expect(out.stc[i] as number).toBeCloseTo(50, 9);
    }
  });
});

describe('runLineStcDivergenceCross CONST K', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST close=${K}: stc=50, aligned-bearish, all bias flat, 0 crosses`, () => {
      const data = buildConst(120, K);
      const run = runLineStcDivergenceCross(data);
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
      // Bias: first valid stc i=67 has prev=null -> bias none.
      // From i=68 onwards bias = flat (50 === 50).
      expect(run.samples[WARMUP]?.bias).toBe('none');
      for (let i = WARMUP + 1; i < 120; i += 1) {
        expect(run.samples[i]?.bias).toBe('flat');
      }
      for (let i = 0; i < VALID_FROM; i += 1) {
        expect(run.samples[i]?.regime).toBe('none');
      }
      for (let i = VALID_FROM; i < 120; i += 1) {
        expect(run.samples[i]?.regime).toBe('aligned-bearish');
      }
      expect(run.crosses).toHaveLength(0);
      expect(run.bullishCrossCount).toBe(0);
      expect(run.bearishCrossCount).toBe(0);
      expect(run.noneCount).toBe(VALID_FROM);
      expect(run.alignedBearishCount).toBe(120 - VALID_FROM);
      expect(run.flatBiasCount).toBe(120 - WARMUP - 1);
      expect(run.upBiasCount).toBe(0);
      expect(run.downBiasCount).toBe(0);
      expect(run.ok).toBe(true);
    });
  }
});

describe('runLineStcDivergenceCross LINEAR UP', () => {
  it('LINEAR UP: stc=50 saturated, divergent-bearish, all bias flat, 0 crosses', () => {
    const data = buildLinearUp(120);
    const run = runLineStcDivergenceCross(data);
    for (let i = WARMUP; i < 120; i += 1) {
      expect(run.stcValues[i] as number).toBeCloseTo(50, 9);
    }
    for (let i = VALID_FROM; i < 120; i += 1) {
      expect(run.samples[i]?.regime).toBe('divergent-bearish');
      expect(run.samples[i]?.priceUp).toBe(true);
      expect(run.samples[i]?.stcUp).toBe(false);
      expect(run.samples[i]?.bias).toBe('flat');
    }
    expect(run.divergentBearishCount).toBe(120 - VALID_FROM);
    expect(run.flatBiasCount).toBe(120 - WARMUP - 1);
    expect(run.upBiasCount).toBe(0);
    expect(run.downBiasCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineStcDivergenceCross LINEAR DOWN', () => {
  it('LINEAR DOWN: stc=50, aligned-bearish, all bias flat, 0 crosses', () => {
    const data = buildLinearDown(120);
    const run = runLineStcDivergenceCross(data);
    for (let i = WARMUP; i < 120; i += 1) {
      expect(run.stcValues[i] as number).toBeCloseTo(50, 9);
    }
    for (let i = VALID_FROM; i < 120; i += 1) {
      expect(run.samples[i]?.regime).toBe('aligned-bearish');
      expect(run.samples[i]?.bias).toBe('flat');
    }
    expect(run.alignedBearishCount).toBe(120 - VALID_FROM);
    expect(run.flatBiasCount).toBe(120 - WARMUP - 1);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineStcDivergenceCross misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineStcDivergenceCrossPoint[] = [
      { x: 2, close: 1 },
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    const run = runLineStcDivergenceCross(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConst(60, 50);
    const run = runLineStcDivergenceCross(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineStcDivergenceCross([]);
    expect(run.series).toEqual([]);
    expect(run.stcValues).toEqual([]);
    expect(run.samples).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom tuning', () => {
    const data = buildLinearUp(40);
    const run = runLineStcDivergenceCross(data, {
      fastLength: 5,
      slowLength: 10,
      cycleLength: 3,
      factor: 0.5,
      divergenceWindow: 1,
    });
    expect(run.fastLength).toBe(5);
    expect(run.slowLength).toBe(10);
    expect(run.cycleLength).toBe(3);
    expect(run.divergenceWindow).toBe(1);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(120);
    const run = runLineStcDivergenceCross(data);
    const total =
      run.alignedBullishCount +
      run.alignedBearishCount +
      run.divergentBullishCount +
      run.divergentBearishCount +
      run.noneCount;
    expect(total).toBe(120);
  });
});

describe('computeLineStcDivergenceCrossLayout', () => {
  it('returns a non-empty SVG path for CONST K=50', () => {
    const data = buildConst(120, 50);
    const layout = computeLineStcDivergenceCrossLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(120);
    expect(layout.stcPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineStcDivergenceCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.stcPath).toBe('');
    expect(layout.crossMarkers).toEqual([]);
  });

  it('pads degenerate priceMin === priceMax', () => {
    const data = buildConst(120, 100);
    const layout = computeLineStcDivergenceCrossLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });

  it('uses fixed 0..100 oscillator range', () => {
    const layout = computeLineStcDivergenceCrossLayout({
      data: buildConst(120, 50),
    });
    expect(layout.oscMin).toBe(0);
    expect(layout.oscMax).toBe(100);
    expect(layout.zeroY).toBe(layout.oscBottom);
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineStcDivergenceCrossLayout({
      data: buildLinearUp(120),
      width: 600,
      height: 320,
      padding: 32,
      panelGap: 8,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(320);
  });
});

describe('describeLineStcDivergenceCrossChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineStcDivergenceCrossChart([])).toBe('No data');
  });

  it('mentions bar count, fast, slow, cycle, window', () => {
    const desc = describeLineStcDivergenceCrossChart(buildLinearUp(120));
    expect(desc).toContain('120 bars');
    expect(desc).toContain('fast 23');
    expect(desc).toContain('slow 50');
    expect(desc).toContain('cycle 10');
    expect(desc).toContain('divergenceWindow 5');
    expect(desc).toContain('bias coloring');
  });
});

describe('<ChartLineStcDivergenceCross /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(120);
    const { container } = render(
      <ChartLineStcDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-stc-divergence-cross"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-fast-length')).toBe(String(FAST));
    expect(root?.getAttribute('data-slow-length')).toBe(String(SLOW));
    expect(root?.getAttribute('data-cycle-length')).toBe(String(CYCLE));
    expect(root?.getAttribute('data-divergence-window')).toBe(String(WIN));
  });

  it('renders an empty fallback when data is empty', () => {
    const { container } = render(<ChartLineStcDivergenceCross data={[]} />);
    const empty = container.querySelector(
      '[data-section="chart-line-stc-divergence-cross-empty"]',
    );
    expect(empty).not.toBeNull();
  });

  it('renders the price and STC paths', () => {
    const data = buildLinearUp(120);
    const { container } = render(
      <ChartLineStcDivergenceCross data={data} />,
    );
    const price = container.querySelector(
      '[data-section="chart-line-stc-divergence-cross-price-path"]',
    );
    const stc = container.querySelector(
      '[data-section="chart-line-stc-divergence-cross-stc-path"]',
    );
    expect(price).not.toBeNull();
    expect(stc).not.toBeNull();
  });

  it('renders the zero reference line', () => {
    const data = buildConst(120, 50);
    const { container } = render(
      <ChartLineStcDivergenceCross data={data} />,
    );
    const zero = container.querySelector(
      '[data-section="chart-line-stc-divergence-cross-zero-line"]',
    );
    expect(zero).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(120);
    const { container } = render(
      <ChartLineStcDivergenceCross data={data} showLegend={false} />,
    );
    const legend = container.querySelector(
      '[data-section="chart-line-stc-divergence-cross-legend"]',
    );
    expect(legend).toBeNull();
  });

  it('respects showAxis=false and showGrid=false', () => {
    const data = buildLinearUp(120);
    const { container } = render(
      <ChartLineStcDivergenceCross
        data={data}
        showAxis={false}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stc-divergence-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-stc-divergence-cross-grid"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge with crosses count', () => {
    const data = buildLinearUp(120);
    const { container } = render(
      <ChartLineStcDivergenceCross data={data} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-stc-divergence-cross-badge"]',
    );
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain('fast 23');
    expect(badge?.textContent).toContain('slow 50');
    expect(badge?.textContent).toContain('cycle 10');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(120);
    const { container } = render(
      <ChartLineStcDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-stc-divergence-cross"]',
    );
    expect(root?.getAttribute('aria-label')).toBe(
      'STC Divergence Cross chart',
    );
  });

  it('exposes data-*-count and bias counters', () => {
    const data = buildLinearUp(120);
    const { container } = render(
      <ChartLineStcDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-stc-divergence-cross"]',
    );
    expect(root?.getAttribute('data-divergent-bearish-count')).toBe(
      String(120 - VALID_FROM),
    );
    expect(root?.getAttribute('data-bullish-cross-count')).toBe('0');
    expect(root?.getAttribute('data-bearish-cross-count')).toBe('0');
    expect(root?.getAttribute('data-cross-count')).toBe('0');
    expect(root?.getAttribute('data-flat-bias-count')).toBe(
      String(120 - WARMUP - 1),
    );
    expect(root?.getAttribute('data-up-bias-count')).toBe('0');
    expect(root?.getAttribute('data-down-bias-count')).toBe('0');
  });

  it('renders the title and aria description elements', () => {
    const data = buildLinearUp(120);
    const { container } = render(
      <ChartLineStcDivergenceCross data={data} />,
    );
    const title = container.querySelector(
      '[data-section="chart-line-stc-divergence-cross-title"]',
    );
    const desc = container.querySelector(
      '[data-section="chart-line-stc-divergence-cross-aria-desc"]',
    );
    expect(title).not.toBeNull();
    expect(desc).not.toBeNull();
    expect(desc?.textContent).toContain('STC Divergence Cross chart');
    expect(desc?.textContent).toContain('bias coloring');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(120);
    const { container } = render(
      <ChartLineStcDivergenceCross data={data} hiddenSeries={['stc']} />,
    );
    const stc = container.querySelector(
      '[data-section="chart-line-stc-divergence-cross-stc-path"]',
    );
    expect(stc).toBeNull();
  });
});
