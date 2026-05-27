import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineKvoDivergenceCross,
  DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_FAST_LENGTH,
  DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_PADDING,
  DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_SLOW_LENGTH,
  DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_WIDTH,
  DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_WINDOW,
  applyLineKvoDivergenceCrossKvo,
  applyLineKvoDivergenceCrossSma,
  classifyLineKvoDivergenceCrossRegime,
  computeLineKvoDivergenceCross,
  computeLineKvoDivergenceCrossLayout,
  describeLineKvoDivergenceCrossChart,
  detectLineKvoDivergenceCrossCrosses,
  getLineKvoDivergenceCrossFinitePoints,
  normalizeLineKvoDivergenceCrossLength,
  normalizeLineKvoDivergenceCrossWindow,
  runLineKvoDivergenceCross,
  type ChartLineKvoDivergenceCrossPoint,
  type ChartLineKvoDivergenceCrossRegime,
} from './chart-line-kvo-divergence-cross';

const FAST = 34;
const SLOW = 55;
const WIN = 5;
const WARMUP = SLOW; // kvo valid from i = slowLength (vf valid from i=1, then SMA needs 55 values starting at i=1, ends at i=55)
const VALID_FROM = WARMUP + WIN; // 60

const buildConst = (
  n: number,
  k: number,
  v = 1000,
): ChartLineKvoDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: k,
    low: k,
    close: k,
    volume: v,
  }));

const buildLinearUp = (
  n: number,
  v = 1000,
): ChartLineKvoDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: i,
    low: i,
    close: i,
    volume: v,
  }));

const buildLinearDown = (
  n: number,
  v = 1000,
): ChartLineKvoDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: -i,
    low: -i,
    close: -i,
    volume: v,
  }));

describe('ChartLineKvoDivergenceCross defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_PANEL_GAP).toBe(12);
  });

  it('exports canonical KVO tuning', () => {
    expect(DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_FAST_LENGTH).toBe(34);
    expect(DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_SLOW_LENGTH).toBe(55);
    expect(DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_WINDOW).toBe(5);
  });
});

describe('getLineKvoDivergenceCrossFinitePoints', () => {
  it('filters finite x, HLC, volume', () => {
    const points = [
      { x: 0, high: 1, low: 0, close: 0.5, volume: 100 },
      { x: NaN, high: 1, low: 0, close: 0.5, volume: 100 },
      { x: 2, high: Infinity, low: 0, close: 0.5, volume: 100 },
      { x: 3, high: 1, low: NaN, close: 0.5, volume: 100 },
      { x: 4, high: 1, low: 0, close: Infinity, volume: 100 },
      { x: 5, high: 1, low: 0, close: 0.5, volume: NaN },
      { x: 6, high: 1, low: 0, close: 0.5, volume: 100 },
    ];
    const result = getLineKvoDivergenceCrossFinitePoints(points);
    expect(result).toEqual([
      { x: 0, high: 1, low: 0, close: 0.5, volume: 100 },
      { x: 6, high: 1, low: 0, close: 0.5, volume: 100 },
    ]);
  });

  it('returns empty array for null and non-array', () => {
    expect(getLineKvoDivergenceCrossFinitePoints(null)).toEqual([]);
    expect(getLineKvoDivergenceCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineKvoDivergenceCrossFinitePoints(
        // @ts-expect-error -- intentionally bad
        'oops',
      ),
    ).toEqual([]);
  });

  it('skips falsy entries', () => {
    const points = [
      null as unknown as ChartLineKvoDivergenceCrossPoint,
      { x: 1, high: 1, low: 0, close: 0.5, volume: 100 },
      undefined as unknown as ChartLineKvoDivergenceCrossPoint,
    ];
    expect(getLineKvoDivergenceCrossFinitePoints(points)).toEqual([
      { x: 1, high: 1, low: 0, close: 0.5, volume: 100 },
    ]);
  });
});

describe('normalizeLineKvoDivergenceCrossLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineKvoDivergenceCrossLength(34.7, 34)).toBe(34);
    expect(normalizeLineKvoDivergenceCrossLength(1, 34)).toBe(1);
  });

  it('falls back when invalid', () => {
    expect(normalizeLineKvoDivergenceCrossLength(0, 34)).toBe(34);
    expect(normalizeLineKvoDivergenceCrossLength(-3, 34)).toBe(34);
    expect(normalizeLineKvoDivergenceCrossLength(NaN, 34)).toBe(34);
    expect(normalizeLineKvoDivergenceCrossLength('big', 34)).toBe(34);
  });
});

describe('normalizeLineKvoDivergenceCrossWindow', () => {
  it('floors finite >=1 windows', () => {
    expect(normalizeLineKvoDivergenceCrossWindow(5.9, 5)).toBe(5);
    expect(normalizeLineKvoDivergenceCrossWindow(1, 5)).toBe(1);
  });

  it('falls back when invalid', () => {
    expect(normalizeLineKvoDivergenceCrossWindow(0, 5)).toBe(5);
    expect(normalizeLineKvoDivergenceCrossWindow(-1, 5)).toBe(5);
    expect(normalizeLineKvoDivergenceCrossWindow(NaN, 5)).toBe(5);
  });
});

describe('applyLineKvoDivergenceCrossSma', () => {
  it('CONST returns constant', () => {
    const values: Array<number | null> = Array.from({ length: 10 }, () => 50);
    const sma = applyLineKvoDivergenceCrossSma(values, 3);
    for (let i = 0; i < 2; i += 1) expect(sma[i]).toBeNull();
    for (let i = 2; i < 10; i += 1) expect(sma[i]).toBe(50);
  });

  it('returns all nulls when length < 1', () => {
    const sma = applyLineKvoDivergenceCrossSma([1, 2, 3], 0);
    expect(sma.every((v) => v === null)).toBe(true);
  });

  it('stops at null gap', () => {
    const sma = applyLineKvoDivergenceCrossSma(
      [1, 1, 1, null, 1, 1, 1],
      3,
    );
    expect(sma[2]).toBe(1);
    expect(sma[3]).toBeNull();
    expect(sma[6]).toBe(1);
  });
});

describe('applyLineKvoDivergenceCrossKvo', () => {
  it('CONST HLC=K returns kvo=0 from warmup onwards', () => {
    for (const K of [0, 1, 50, 200, 1234]) {
      const closes = Array.from({ length: 80 }, () => K);
      const volumes = Array.from({ length: 80 }, () => 1000);
      const kvo = applyLineKvoDivergenceCrossKvo(
        closes,
        closes,
        closes,
        volumes,
        FAST,
        SLOW,
      );
      for (let i = 0; i < WARMUP; i += 1) {
        expect(kvo[i]).toBeNull();
      }
      for (let i = WARMUP; i < 80; i += 1) {
        expect(kvo[i]).toBe(0);
        expect(Object.is(kvo[i], 0)).toBe(true);
      }
    }
  });

  it('LINEAR UP returns kvo=0 (fast SMA = slow SMA on constant vf)', () => {
    const n = 80;
    const highs = Array.from({ length: n }, (_, i) => i);
    const lows = Array.from({ length: n }, (_, i) => i);
    const closes = Array.from({ length: n }, (_, i) => i);
    const volumes = Array.from({ length: n }, () => 1000);
    const kvo = applyLineKvoDivergenceCrossKvo(
      highs,
      lows,
      closes,
      volumes,
      FAST,
      SLOW,
    );
    for (let i = 0; i < WARMUP; i += 1) {
      expect(kvo[i]).toBeNull();
    }
    for (let i = WARMUP; i < n; i += 1) {
      expect(kvo[i] as number).toBeCloseTo(0, 9);
    }
  });

  it('LINEAR DOWN returns kvo=0 (fast SMA = slow SMA on constant -vf)', () => {
    const n = 80;
    const highs = Array.from({ length: n }, (_, i) => -i);
    const lows = Array.from({ length: n }, (_, i) => -i);
    const closes = Array.from({ length: n }, (_, i) => -i);
    const volumes = Array.from({ length: n }, () => 1000);
    const kvo = applyLineKvoDivergenceCrossKvo(
      highs,
      lows,
      closes,
      volumes,
      FAST,
      SLOW,
    );
    for (let i = WARMUP; i < n; i += 1) {
      expect(kvo[i] as number).toBeCloseTo(0, 9);
    }
  });

  it('returns all nulls when fastLength < 1', () => {
    const closes = [1, 2, 3, 4];
    const kvo = applyLineKvoDivergenceCrossKvo(
      closes,
      closes,
      closes,
      closes,
      0,
      SLOW,
    );
    expect(kvo.every((v) => v === null)).toBe(true);
  });

  it('returns all nulls when slowLength < 1', () => {
    const closes = [1, 2, 3, 4];
    const kvo = applyLineKvoDivergenceCrossKvo(
      closes,
      closes,
      closes,
      closes,
      FAST,
      0,
    );
    expect(kvo.every((v) => v === null)).toBe(true);
  });

  it('returns empty when inputs empty', () => {
    expect(applyLineKvoDivergenceCrossKvo([], [], [], [], FAST, SLOW)).toEqual(
      [],
    );
  });
});

describe('computeLineKvoDivergenceCross', () => {
  it('uses defaults when not provided', () => {
    const data = buildConst(80, 50);
    const out = computeLineKvoDivergenceCross(data);
    expect(out.kvo[WARMUP]).toBe(0);
    expect(out.kvo[WARMUP - 1]).toBeNull();
  });

  it('returns empty kvo for empty data', () => {
    expect(computeLineKvoDivergenceCross([])).toEqual({ kvo: [] });
    expect(computeLineKvoDivergenceCross(null)).toEqual({ kvo: [] });
  });

  it('falls back to defaults on invalid inputs', () => {
    const out = computeLineKvoDivergenceCross(buildLinearUp(80), {
      fastLength: 0,
      slowLength: 0,
    });
    expect(out.kvo[WARMUP] as number).toBeCloseTo(0, 9);
  });
});

describe('classifyLineKvoDivergenceCrossRegime', () => {
  const cases: Array<{
    priceUp: boolean | null;
    kvoUp: boolean | null;
    expected: ChartLineKvoDivergenceCrossRegime;
  }> = [
    { priceUp: true, kvoUp: true, expected: 'aligned-bullish' },
    { priceUp: false, kvoUp: false, expected: 'aligned-bearish' },
    { priceUp: false, kvoUp: true, expected: 'divergent-bullish' },
    { priceUp: true, kvoUp: false, expected: 'divergent-bearish' },
    { priceUp: null, kvoUp: false, expected: 'none' },
    { priceUp: true, kvoUp: null, expected: 'none' },
    { priceUp: null, kvoUp: null, expected: 'none' },
  ];
  it.each(cases)(
    'classifies priceUp=$priceUp kvoUp=$kvoUp as $expected',
    ({ priceUp, kvoUp, expected }) => {
      expect(classifyLineKvoDivergenceCrossRegime(priceUp, kvoUp)).toBe(
        expected,
      );
    },
  );
});

describe('detectLineKvoDivergenceCrossCrosses', () => {
  it('suppresses crosses entered from none', () => {
    const series = Array.from({ length: 6 }, (_, i) => ({
      x: i,
      high: 1,
      low: 1,
      close: 1,
      volume: 1,
    }));
    const states: ChartLineKvoDivergenceCrossRegime[] = [
      'none',
      'none',
      'none',
      'none',
      'divergent-bullish',
      'divergent-bullish',
    ];
    const out = detectLineKvoDivergenceCrossCrosses(series, states);
    expect(out).toHaveLength(0);
  });

  it('detects bullish cross', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 1,
      close: 1,
      volume: 1,
    }));
    const states: ChartLineKvoDivergenceCrossRegime[] = [
      'aligned-bearish',
      'aligned-bearish',
      'divergent-bullish',
      'divergent-bullish',
    ];
    const out = detectLineKvoDivergenceCrossCrosses(series, states);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
    expect(out[0]?.index).toBe(2);
  });

  it('detects bearish cross', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 1,
      close: 1,
      volume: 1,
    }));
    const states: ChartLineKvoDivergenceCrossRegime[] = [
      'aligned-bullish',
      'aligned-bullish',
      'divergent-bearish',
      'divergent-bearish',
    ];
    const out = detectLineKvoDivergenceCrossCrosses(series, states);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
    expect(out[0]?.index).toBe(2);
  });

  it('does not double-fire when state holds steady', () => {
    const series = Array.from({ length: 5 }, (_, i) => ({
      x: i,
      high: 1,
      low: 1,
      close: 1,
      volume: 1,
    }));
    const states: ChartLineKvoDivergenceCrossRegime[] = [
      'aligned-bearish',
      'divergent-bullish',
      'divergent-bullish',
      'divergent-bullish',
      'divergent-bullish',
    ];
    const out = detectLineKvoDivergenceCrossCrosses(series, states);
    expect(out).toHaveLength(1);
  });

  it('handles alternating crosses', () => {
    const series = Array.from({ length: 5 }, (_, i) => ({
      x: i,
      high: 1,
      low: 1,
      close: 1,
      volume: 1,
    }));
    const states: ChartLineKvoDivergenceCrossRegime[] = [
      'aligned-bullish',
      'divergent-bullish',
      'divergent-bearish',
      'divergent-bullish',
      'aligned-bullish',
    ];
    const out = detectLineKvoDivergenceCrossCrosses(series, states);
    expect(out.map((c) => c.kind)).toEqual([
      'bullish',
      'bearish',
      'bullish',
    ]);
  });
});

describe('runLineKvoDivergenceCross CONST HLC=K', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST HLC=${K}: kvo=0, aligned-bearish, 0 crosses`, () => {
      const data = buildConst(120, K);
      const run = runLineKvoDivergenceCross(data);
      expect(run.fastLength).toBe(FAST);
      expect(run.slowLength).toBe(SLOW);
      expect(run.divergenceWindow).toBe(WIN);
      expect(run.series).toHaveLength(120);
      for (let i = 0; i < WARMUP; i += 1) {
        expect(run.kvoValues[i]).toBeNull();
      }
      for (let i = WARMUP; i < 120; i += 1) {
        expect(run.kvoValues[i]).toBe(0);
      }
      for (let i = 0; i < VALID_FROM; i += 1) {
        expect(run.samples[i]?.regime).toBe('none');
      }
      for (let i = VALID_FROM; i < 120; i += 1) {
        expect(run.samples[i]?.regime).toBe('aligned-bearish');
        expect(run.samples[i]?.priceUp).toBe(false);
        expect(run.samples[i]?.kvoUp).toBe(false);
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

describe('runLineKvoDivergenceCross LINEAR UP', () => {
  it('LINEAR UP: kvo=0 (SMAs collapse), divergent-bearish, 0 crosses', () => {
    const data = buildLinearUp(120);
    const run = runLineKvoDivergenceCross(data);
    for (let i = 0; i < WARMUP; i += 1) {
      expect(run.kvoValues[i]).toBeNull();
    }
    for (let i = WARMUP; i < 120; i += 1) {
      expect(run.kvoValues[i] as number).toBeCloseTo(0, 9);
    }
    for (let i = VALID_FROM; i < 120; i += 1) {
      expect(run.samples[i]?.regime).toBe('divergent-bearish');
      expect(run.samples[i]?.priceUp).toBe(true);
      expect(run.samples[i]?.kvoUp).toBe(false);
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

describe('runLineKvoDivergenceCross LINEAR DOWN', () => {
  it('LINEAR DOWN: kvo=0 (SMAs collapse), aligned-bearish, 0 crosses', () => {
    const data = buildLinearDown(120);
    const run = runLineKvoDivergenceCross(data);
    for (let i = WARMUP; i < 120; i += 1) {
      expect(run.kvoValues[i] as number).toBeCloseTo(0, 9);
    }
    for (let i = VALID_FROM; i < 120; i += 1) {
      expect(run.samples[i]?.regime).toBe('aligned-bearish');
      expect(run.samples[i]?.priceUp).toBe(false);
      expect(run.samples[i]?.kvoUp).toBe(false);
    }
    expect(run.alignedBearishCount).toBe(120 - VALID_FROM);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineKvoDivergenceCross misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineKvoDivergenceCrossPoint[] = [
      { x: 2, high: 1, low: 1, close: 1, volume: 1 },
      { x: 0, high: 1, low: 1, close: 1, volume: 1 },
      { x: 1, high: 1, low: 1, close: 1, volume: 1 },
    ];
    const run = runLineKvoDivergenceCross(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when series too short', () => {
    const data = buildConst(30, 50);
    const run = runLineKvoDivergenceCross(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineKvoDivergenceCross([]);
    expect(run.series).toEqual([]);
    expect(run.kvoValues).toEqual([]);
    expect(run.samples).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom tuning', () => {
    const data = buildLinearUp(40);
    const run = runLineKvoDivergenceCross(data, {
      fastLength: 5,
      slowLength: 10,
      divergenceWindow: 1,
    });
    expect(run.fastLength).toBe(5);
    expect(run.slowLength).toBe(10);
    expect(run.divergenceWindow).toBe(1);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(120);
    const run = runLineKvoDivergenceCross(data);
    const total =
      run.alignedBullishCount +
      run.alignedBearishCount +
      run.divergentBullishCount +
      run.divergentBearishCount +
      run.noneCount;
    expect(total).toBe(120);
  });
});

describe('computeLineKvoDivergenceCrossLayout', () => {
  it('returns a non-empty SVG path for CONST K=50', () => {
    const data = buildConst(120, 50);
    const layout = computeLineKvoDivergenceCrossLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toContain(' L ');
    expect(layout.priceDots).toHaveLength(120);
    expect(layout.kvoPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineKvoDivergenceCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.kvoPath).toBe('');
    expect(layout.priceDots).toEqual([]);
    expect(layout.crossMarkers).toEqual([]);
  });

  it('pads degenerate priceMin === priceMax', () => {
    const data = buildConst(120, 100);
    const layout = computeLineKvoDivergenceCrossLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });

  it('uses symmetric oscillator range with default fallback when kvo span is 0', () => {
    const layout = computeLineKvoDivergenceCrossLayout({
      data: buildConst(120, 50),
    });
    expect(layout.oscMin).toBe(-1);
    expect(layout.oscMax).toBe(1);
    expect(layout.zeroY).toBeGreaterThan(layout.oscTop);
    expect(layout.zeroY).toBeLessThan(layout.oscBottom);
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineKvoDivergenceCrossLayout({
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

describe('describeLineKvoDivergenceCrossChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineKvoDivergenceCrossChart([])).toBe('No data');
  });

  it('mentions bar count, fast, slow, window', () => {
    const desc = describeLineKvoDivergenceCrossChart(buildLinearUp(120));
    expect(desc).toContain('120 bars');
    expect(desc).toContain('fast 34');
    expect(desc).toContain('slow 55');
    expect(desc).toContain('divergenceWindow 5');
  });
});

describe('<ChartLineKvoDivergenceCross /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(120);
    const { container } = render(
      <ChartLineKvoDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-kvo-divergence-cross"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-fast-length')).toBe(String(FAST));
    expect(root?.getAttribute('data-slow-length')).toBe(String(SLOW));
    expect(root?.getAttribute('data-divergence-window')).toBe(String(WIN));
  });

  it('renders an empty fallback when data is empty', () => {
    const { container } = render(<ChartLineKvoDivergenceCross data={[]} />);
    const empty = container.querySelector(
      '[data-section="chart-line-kvo-divergence-cross-empty"]',
    );
    expect(empty).not.toBeNull();
  });

  it('renders the price and KVO paths', () => {
    const data = buildLinearUp(120);
    const { container } = render(
      <ChartLineKvoDivergenceCross data={data} />,
    );
    const price = container.querySelector(
      '[data-section="chart-line-kvo-divergence-cross-price-path"]',
    );
    const kvo = container.querySelector(
      '[data-section="chart-line-kvo-divergence-cross-kvo-path"]',
    );
    expect(price).not.toBeNull();
    expect(kvo).not.toBeNull();
  });

  it('renders the zero reference line', () => {
    const data = buildConst(120, 50);
    const { container } = render(
      <ChartLineKvoDivergenceCross data={data} />,
    );
    const zero = container.querySelector(
      '[data-section="chart-line-kvo-divergence-cross-zero-line"]',
    );
    expect(zero).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(120);
    const { container } = render(
      <ChartLineKvoDivergenceCross data={data} showLegend={false} />,
    );
    const legend = container.querySelector(
      '[data-section="chart-line-kvo-divergence-cross-legend"]',
    );
    expect(legend).toBeNull();
  });

  it('respects showAxis=false and showGrid=false', () => {
    const data = buildLinearUp(120);
    const { container } = render(
      <ChartLineKvoDivergenceCross
        data={data}
        showAxis={false}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kvo-divergence-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-kvo-divergence-cross-grid"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge with crosses count', () => {
    const data = buildLinearUp(120);
    const { container } = render(
      <ChartLineKvoDivergenceCross data={data} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-kvo-divergence-cross-badge"]',
    );
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain('fast 34');
    expect(badge?.textContent).toContain('slow 55');
    expect(badge?.textContent).toContain('window 5');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('emits empty when data filters down to nothing', () => {
    const data = [
      { x: NaN, high: 1, low: 1, close: 1, volume: 100 },
      { x: 1, high: 1, low: NaN, close: 1, volume: 100 },
    ];
    const { container } = render(
      <ChartLineKvoDivergenceCross data={data} />,
    );
    const empty = container.querySelector(
      '[data-section="chart-line-kvo-divergence-cross-empty"]',
    );
    expect(empty).not.toBeNull();
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(120);
    const { container } = render(
      <ChartLineKvoDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-kvo-divergence-cross"]',
    );
    expect(root?.getAttribute('aria-label')).toBe(
      'KVO Divergence Cross chart',
    );
  });

  it('exposes data-*-count counters', () => {
    const data = buildLinearUp(120);
    const { container } = render(
      <ChartLineKvoDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-kvo-divergence-cross"]',
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
      <ChartLineKvoDivergenceCross data={data} />,
    );
    const title = container.querySelector(
      '[data-section="chart-line-kvo-divergence-cross-title"]',
    );
    const desc = container.querySelector(
      '[data-section="chart-line-kvo-divergence-cross-aria-desc"]',
    );
    expect(title).not.toBeNull();
    expect(desc).not.toBeNull();
    expect(desc?.textContent).toContain('KVO Divergence Cross chart');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(120);
    const { container } = render(
      <ChartLineKvoDivergenceCross data={data} hiddenSeries={['kvo']} />,
    );
    const kvo = container.querySelector(
      '[data-section="chart-line-kvo-divergence-cross-kvo-path"]',
    );
    expect(kvo).toBeNull();
  });
});
