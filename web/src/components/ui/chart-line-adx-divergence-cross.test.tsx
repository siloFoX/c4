import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineAdxDivergenceCross,
  DEFAULT_CHART_LINE_ADX_DIVERGENCE_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_ADX_DIVERGENCE_CROSS_LENGTH,
  DEFAULT_CHART_LINE_ADX_DIVERGENCE_CROSS_PADDING,
  DEFAULT_CHART_LINE_ADX_DIVERGENCE_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_ADX_DIVERGENCE_CROSS_WIDTH,
  DEFAULT_CHART_LINE_ADX_DIVERGENCE_CROSS_WINDOW,
  applyLineAdxDivergenceCrossAdx,
  applyLineAdxDivergenceCrossSmaSeededRma,
  classifyLineAdxDivergenceCrossRegime,
  computeLineAdxDivergenceCross,
  computeLineAdxDivergenceCrossLayout,
  describeLineAdxDivergenceCrossChart,
  detectLineAdxDivergenceCrossCrosses,
  getLineAdxDivergenceCrossFinitePoints,
  normalizeLineAdxDivergenceCrossLength,
  normalizeLineAdxDivergenceCrossWindow,
  runLineAdxDivergenceCross,
  type ChartLineAdxDivergenceCrossPoint,
  type ChartLineAdxDivergenceCrossRegime,
} from './chart-line-adx-divergence-cross';

const L = 14;
const WIN = 5;
const WARMUP = 2 * L - 1; // 27 (first ADX valid index)
const VALID_FROM = WARMUP + WIN; // 32

const buildConst = (
  n: number,
  k: number,
): ChartLineAdxDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: k,
    low: k,
    close: k,
  }));

const buildLinearUp = (n: number): ChartLineAdxDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: i + 1,
    low: i - 1,
    close: i,
  }));

const buildLinearDown = (n: number): ChartLineAdxDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: -i + 1,
    low: -i - 1,
    close: -i,
  }));

describe('ChartLineAdxDivergenceCross defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_ADX_DIVERGENCE_CROSS_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_ADX_DIVERGENCE_CROSS_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_ADX_DIVERGENCE_CROSS_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_ADX_DIVERGENCE_CROSS_PANEL_GAP).toBe(12);
  });

  it('exports canonical ADX tuning', () => {
    expect(DEFAULT_CHART_LINE_ADX_DIVERGENCE_CROSS_LENGTH).toBe(14);
    expect(DEFAULT_CHART_LINE_ADX_DIVERGENCE_CROSS_WINDOW).toBe(5);
  });
});

describe('getLineAdxDivergenceCrossFinitePoints', () => {
  it('filters finite x, high, low, close', () => {
    const points = [
      { x: 0, high: 1, low: 0, close: 0.5 },
      { x: NaN, high: 1, low: 0, close: 0.5 },
      { x: 2, high: Infinity, low: 0, close: 0.5 },
      { x: 3, high: 1, low: NaN, close: 0.5 },
      { x: 4, high: 1, low: 0, close: Infinity },
      { x: 5, high: 1, low: 0, close: 0.5 },
    ];
    const result = getLineAdxDivergenceCrossFinitePoints(points);
    expect(result).toEqual([
      { x: 0, high: 1, low: 0, close: 0.5 },
      { x: 5, high: 1, low: 0, close: 0.5 },
    ]);
  });

  it('returns empty array for null and non-array', () => {
    expect(getLineAdxDivergenceCrossFinitePoints(null)).toEqual([]);
    expect(getLineAdxDivergenceCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineAdxDivergenceCrossFinitePoints(
        // @ts-expect-error -- intentionally bad
        'oops',
      ),
    ).toEqual([]);
  });

  it('skips falsy entries', () => {
    const points = [
      null as unknown as ChartLineAdxDivergenceCrossPoint,
      { x: 1, high: 1, low: 0, close: 0.5 },
      undefined as unknown as ChartLineAdxDivergenceCrossPoint,
    ];
    expect(getLineAdxDivergenceCrossFinitePoints(points)).toEqual([
      { x: 1, high: 1, low: 0, close: 0.5 },
    ]);
  });
});

describe('normalizeLineAdxDivergenceCrossLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineAdxDivergenceCrossLength(14.7, 14)).toBe(14);
    expect(normalizeLineAdxDivergenceCrossLength(1, 14)).toBe(1);
  });

  it('falls back when invalid', () => {
    expect(normalizeLineAdxDivergenceCrossLength(0, 14)).toBe(14);
    expect(normalizeLineAdxDivergenceCrossLength(-3, 14)).toBe(14);
    expect(normalizeLineAdxDivergenceCrossLength(NaN, 14)).toBe(14);
    expect(normalizeLineAdxDivergenceCrossLength('big', 14)).toBe(14);
  });
});

describe('normalizeLineAdxDivergenceCrossWindow', () => {
  it('floors finite >=1 windows', () => {
    expect(normalizeLineAdxDivergenceCrossWindow(5.9, 5)).toBe(5);
    expect(normalizeLineAdxDivergenceCrossWindow(1, 5)).toBe(1);
  });

  it('falls back when invalid', () => {
    expect(normalizeLineAdxDivergenceCrossWindow(0, 5)).toBe(5);
    expect(normalizeLineAdxDivergenceCrossWindow(-1, 5)).toBe(5);
    expect(normalizeLineAdxDivergenceCrossWindow(NaN, 5)).toBe(5);
  });
});

describe('applyLineAdxDivergenceCrossSmaSeededRma', () => {
  it('seeds with SMA and recurs', () => {
    const values: Array<number | null> = [null, 1, 1, 1, 1, 1, 1];
    const out = applyLineAdxDivergenceCrossSmaSeededRma(values, 3);
    expect(out[0]).toBeNull();
    expect(out[1]).toBeNull();
    expect(out[2]).toBeNull();
    expect(out[3]).toBe(1);
    expect(out[4]).toBe(1);
    expect(out[5]).toBe(1);
    expect(out[6]).toBe(1);
  });

  it('returns all nulls when input empty', () => {
    expect(applyLineAdxDivergenceCrossSmaSeededRma([], 5)).toEqual([]);
  });

  it('returns all nulls when length < 1', () => {
    const out = applyLineAdxDivergenceCrossSmaSeededRma([1, 2, 3], 0);
    expect(out.every((v) => v === null)).toBe(true);
  });

  it('returns all nulls when no valid values', () => {
    const out = applyLineAdxDivergenceCrossSmaSeededRma(
      [null, null, null],
      2,
    );
    expect(out.every((v) => v === null)).toBe(true);
  });

  it('returns all nulls when seedEnd >= length', () => {
    const out = applyLineAdxDivergenceCrossSmaSeededRma([1, 2], 5);
    expect(out.every((v) => v === null)).toBe(true);
  });

  it('stops at gap after seed', () => {
    const out = applyLineAdxDivergenceCrossSmaSeededRma(
      [1, 1, 1, null, 1, 1],
      3,
    );
    expect(out[2]).toBe(1);
    expect(out[3]).toBeNull();
  });

  it('uses Wilder alpha = 1/length', () => {
    const values: Array<number | null> = [null, 2, 2, 2, 14, 14];
    const out = applyLineAdxDivergenceCrossSmaSeededRma(values, 3);
    expect(out[3]).toBe(2);
    expect(out[4]).toBeCloseTo(2 * (1 - 1 / 3) + 14 * (1 / 3), 9);
  });

  it('converts -0 to +0', () => {
    const out = applyLineAdxDivergenceCrossSmaSeededRma([-0, -0, -0], 3);
    expect(Object.is(out[2], 0)).toBe(true);
  });
});

describe('applyLineAdxDivergenceCrossAdx', () => {
  it('CONST HLC=K returns ADX=0 from warmup onwards', () => {
    for (const K of [0, 1, 50, 200, 1234]) {
      const closes = Array.from({ length: 60 }, () => K);
      const highs = closes.slice();
      const lows = closes.slice();
      const adx = applyLineAdxDivergenceCrossAdx(highs, lows, closes, L);
      for (let i = 0; i < WARMUP; i += 1) {
        expect(adx[i]).toBeNull();
      }
      for (let i = WARMUP; i < closes.length; i += 1) {
        expect(adx[i]).toBe(0);
        expect(Object.is(adx[i], 0)).toBe(true);
      }
    }
  });

  it('LINEAR UP saturates ADX at 100', () => {
    const n = 60;
    const highs = Array.from({ length: n }, (_, i) => i + 1);
    const lows = Array.from({ length: n }, (_, i) => i - 1);
    const closes = Array.from({ length: n }, (_, i) => i);
    const adx = applyLineAdxDivergenceCrossAdx(highs, lows, closes, L);
    for (let i = 0; i < WARMUP; i += 1) {
      expect(adx[i]).toBeNull();
    }
    for (let i = WARMUP; i < n; i += 1) {
      expect(adx[i] as number).toBeCloseTo(100, 9);
    }
  });

  it('LINEAR DOWN saturates ADX at 100', () => {
    const n = 60;
    const highs = Array.from({ length: n }, (_, i) => -i + 1);
    const lows = Array.from({ length: n }, (_, i) => -i - 1);
    const closes = Array.from({ length: n }, (_, i) => -i);
    const adx = applyLineAdxDivergenceCrossAdx(highs, lows, closes, L);
    for (let i = WARMUP; i < n; i += 1) {
      expect(adx[i] as number).toBeCloseTo(100, 9);
    }
  });

  it('returns all nulls when length < 1', () => {
    const closes = [1, 2, 3, 4];
    const adx = applyLineAdxDivergenceCrossAdx(closes, closes, closes, 0);
    expect(adx.every((v) => v === null)).toBe(true);
  });

  it('returns empty when input empty', () => {
    expect(applyLineAdxDivergenceCrossAdx([], [], [], L)).toEqual([]);
  });

  it('stays in 0..100 bounds for mixed input', () => {
    const closes = [10, 11, 9, 10, 12, 11, 13, 14, 12, 15];
    const highs = closes.map((c) => c + 1);
    const lows = closes.map((c) => c - 1);
    const closesExt = [...closes];
    const highsExt = [...highs];
    const lowsExt = [...lows];
    for (let i = closes.length; i < 60; i += 1) {
      const c = closesExt[i - 1]! + ((i % 3) - 1);
      closesExt.push(c);
      highsExt.push(c + 1);
      lowsExt.push(c - 1);
    }
    const adx = applyLineAdxDivergenceCrossAdx(
      highsExt,
      lowsExt,
      closesExt,
      L,
    );
    for (let i = WARMUP; i < closesExt.length; i += 1) {
      const v = adx[i];
      expect(v).not.toBeNull();
      expect(v as number).toBeGreaterThanOrEqual(0);
      expect(v as number).toBeLessThanOrEqual(100);
    }
  });
});

describe('computeLineAdxDivergenceCross', () => {
  it('uses default length when not provided', () => {
    const data = buildConst(60, 50);
    const out = computeLineAdxDivergenceCross(data);
    expect(out.adx[WARMUP]).toBe(0);
    expect(out.adx[WARMUP - 1]).toBeNull();
  });

  it('returns empty adx for empty data', () => {
    expect(computeLineAdxDivergenceCross([])).toEqual({ adx: [] });
    expect(computeLineAdxDivergenceCross(null)).toEqual({ adx: [] });
  });

  it('falls back to default on invalid length', () => {
    const out = computeLineAdxDivergenceCross(buildLinearUp(60), {
      length: 0,
    });
    expect(out.adx[WARMUP] as number).toBeCloseTo(100, 9);
  });
});

describe('classifyLineAdxDivergenceCrossRegime', () => {
  const cases: Array<{
    priceUp: boolean | null;
    adxUp: boolean | null;
    expected: ChartLineAdxDivergenceCrossRegime;
  }> = [
    { priceUp: true, adxUp: true, expected: 'aligned-bullish' },
    { priceUp: false, adxUp: false, expected: 'aligned-bearish' },
    { priceUp: false, adxUp: true, expected: 'divergent-bullish' },
    { priceUp: true, adxUp: false, expected: 'divergent-bearish' },
    { priceUp: null, adxUp: false, expected: 'none' },
    { priceUp: true, adxUp: null, expected: 'none' },
    { priceUp: null, adxUp: null, expected: 'none' },
  ];
  it.each(cases)(
    'classifies priceUp=$priceUp adxUp=$adxUp as $expected',
    ({ priceUp, adxUp, expected }) => {
      expect(classifyLineAdxDivergenceCrossRegime(priceUp, adxUp)).toBe(
        expected,
      );
    },
  );
});

describe('detectLineAdxDivergenceCrossCrosses', () => {
  it('suppresses crosses entered from none', () => {
    const series = Array.from({ length: 6 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const states: ChartLineAdxDivergenceCrossRegime[] = [
      'none',
      'none',
      'none',
      'none',
      'divergent-bullish',
      'divergent-bullish',
    ];
    const out = detectLineAdxDivergenceCrossCrosses(series, states);
    expect(out).toHaveLength(0);
  });

  it('detects a bullish cross from aligned-bearish to divergent-bullish', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const states: ChartLineAdxDivergenceCrossRegime[] = [
      'aligned-bearish',
      'aligned-bearish',
      'divergent-bullish',
      'divergent-bullish',
    ];
    const out = detectLineAdxDivergenceCrossCrosses(series, states);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
    expect(out[0]?.index).toBe(2);
  });

  it('detects a bearish cross from aligned-bullish to divergent-bearish', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const states: ChartLineAdxDivergenceCrossRegime[] = [
      'aligned-bullish',
      'aligned-bullish',
      'divergent-bearish',
      'divergent-bearish',
    ];
    const out = detectLineAdxDivergenceCrossCrosses(series, states);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
    expect(out[0]?.index).toBe(2);
  });

  it('does not double-fire when state holds steady', () => {
    const series = Array.from({ length: 5 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const states: ChartLineAdxDivergenceCrossRegime[] = [
      'aligned-bearish',
      'divergent-bullish',
      'divergent-bullish',
      'divergent-bullish',
      'divergent-bullish',
    ];
    const out = detectLineAdxDivergenceCrossCrosses(series, states);
    expect(out).toHaveLength(1);
  });

  it('handles alternating crosses', () => {
    const series = Array.from({ length: 5 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const states: ChartLineAdxDivergenceCrossRegime[] = [
      'aligned-bullish',
      'divergent-bullish',
      'divergent-bearish',
      'divergent-bullish',
      'aligned-bullish',
    ];
    const out = detectLineAdxDivergenceCrossCrosses(series, states);
    expect(out.map((c) => c.kind)).toEqual([
      'bullish',
      'bearish',
      'bullish',
    ]);
  });
});

describe('runLineAdxDivergenceCross CONST HLC=K', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST HLC=${K}: adx=0, aligned-bearish, 0 crosses`, () => {
      const data = buildConst(80, K);
      const run = runLineAdxDivergenceCross(data);
      expect(run.length).toBe(L);
      expect(run.divergenceWindow).toBe(WIN);
      expect(run.series).toHaveLength(80);
      for (let i = 0; i < WARMUP; i += 1) {
        expect(run.adxValues[i]).toBeNull();
      }
      for (let i = WARMUP; i < 80; i += 1) {
        expect(run.adxValues[i]).toBe(0);
      }
      for (let i = 0; i < VALID_FROM; i += 1) {
        expect(run.samples[i]?.regime).toBe('none');
      }
      for (let i = VALID_FROM; i < 80; i += 1) {
        expect(run.samples[i]?.regime).toBe('aligned-bearish');
        expect(run.samples[i]?.priceUp).toBe(false);
        expect(run.samples[i]?.adxUp).toBe(false);
      }
      expect(run.crosses).toHaveLength(0);
      expect(run.bullishCrossCount).toBe(0);
      expect(run.bearishCrossCount).toBe(0);
      expect(run.noneCount).toBe(VALID_FROM);
      expect(run.alignedBearishCount).toBe(80 - VALID_FROM);
      expect(run.alignedBullishCount).toBe(0);
      expect(run.divergentBullishCount).toBe(0);
      expect(run.divergentBearishCount).toBe(0);
      expect(run.ok).toBe(true);
    });
  }
});

describe('runLineAdxDivergenceCross LINEAR UP', () => {
  it('LINEAR UP: adx=100 saturated, divergent-bearish, 0 crosses', () => {
    const data = buildLinearUp(80);
    const run = runLineAdxDivergenceCross(data);
    for (let i = 0; i < WARMUP; i += 1) {
      expect(run.adxValues[i]).toBeNull();
    }
    for (let i = WARMUP; i < 80; i += 1) {
      expect(run.adxValues[i] as number).toBeCloseTo(100, 9);
    }
    for (let i = VALID_FROM; i < 80; i += 1) {
      expect(run.samples[i]?.regime).toBe('divergent-bearish');
      expect(run.samples[i]?.priceUp).toBe(true);
      expect(run.samples[i]?.adxUp).toBe(false);
    }
    expect(run.divergentBearishCount).toBe(80 - VALID_FROM);
    expect(run.alignedBullishCount).toBe(0);
    expect(run.alignedBearishCount).toBe(0);
    expect(run.divergentBullishCount).toBe(0);
    expect(run.noneCount).toBe(VALID_FROM);
    expect(run.crosses).toHaveLength(0);
    expect(run.ok).toBe(true);
  });
});

describe('runLineAdxDivergenceCross LINEAR DOWN', () => {
  it('LINEAR DOWN: adx=100 saturated, aligned-bearish, 0 crosses', () => {
    const data = buildLinearDown(80);
    const run = runLineAdxDivergenceCross(data);
    for (let i = WARMUP; i < 80; i += 1) {
      expect(run.adxValues[i] as number).toBeCloseTo(100, 9);
    }
    for (let i = VALID_FROM; i < 80; i += 1) {
      expect(run.samples[i]?.regime).toBe('aligned-bearish');
      expect(run.samples[i]?.priceUp).toBe(false);
      expect(run.samples[i]?.adxUp).toBe(false);
    }
    expect(run.alignedBearishCount).toBe(80 - VALID_FROM);
    expect(run.divergentBullishCount).toBe(0);
    expect(run.divergentBearishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineAdxDivergenceCross misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineAdxDivergenceCrossPoint[] = [
      { x: 2, high: 1, low: 0, close: 0.5 },
      { x: 0, high: 1, low: 0, close: 0.5 },
      { x: 1, high: 1, low: 0, close: 0.5 },
    ];
    const run = runLineAdxDivergenceCross(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when series too short for warmup+window', () => {
    const data = buildConst(20, 50);
    const run = runLineAdxDivergenceCross(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineAdxDivergenceCross([]);
    expect(run.series).toEqual([]);
    expect(run.adxValues).toEqual([]);
    expect(run.samples).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom length / divergenceWindow', () => {
    const data = buildLinearUp(40);
    const run = runLineAdxDivergenceCross(data, {
      length: 3,
      divergenceWindow: 1,
    });
    expect(run.length).toBe(3);
    expect(run.divergenceWindow).toBe(1);
    const warm = 2 * 3 - 1;
    for (let i = warm; i < 40; i += 1) {
      expect(run.adxValues[i]).not.toBeNull();
    }
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(80);
    const run = runLineAdxDivergenceCross(data);
    const total =
      run.alignedBullishCount +
      run.alignedBearishCount +
      run.divergentBullishCount +
      run.divergentBearishCount +
      run.noneCount;
    expect(total).toBe(80);
  });
});

describe('computeLineAdxDivergenceCrossLayout', () => {
  it('returns a non-empty SVG path for CONST K=50', () => {
    const data = buildConst(80, 50);
    const layout = computeLineAdxDivergenceCrossLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toContain(' L ');
    expect(layout.priceDots).toHaveLength(80);
    expect(layout.adxPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineAdxDivergenceCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.adxPath).toBe('');
    expect(layout.priceDots).toEqual([]);
    expect(layout.crossMarkers).toEqual([]);
  });

  it('pads degenerate priceMin === priceMax', () => {
    const data = buildConst(80, 100);
    const layout = computeLineAdxDivergenceCrossLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });

  it('uses fixed 0..100 oscillator range', () => {
    const layout = computeLineAdxDivergenceCrossLayout({
      data: buildConst(80, 50),
    });
    expect(layout.oscMin).toBe(0);
    expect(layout.oscMax).toBe(100);
    expect(layout.zeroY).toBe(layout.oscBottom);
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineAdxDivergenceCrossLayout({
      data: buildLinearUp(60),
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

describe('describeLineAdxDivergenceCrossChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineAdxDivergenceCrossChart([])).toBe('No data');
  });

  it('mentions bar count, length, window', () => {
    const desc = describeLineAdxDivergenceCrossChart(buildLinearUp(50), {
      length: 14,
      divergenceWindow: 5,
    });
    expect(desc).toContain('50 bars');
    expect(desc).toContain('length 14');
    expect(desc).toContain('divergenceWindow 5');
  });
});

describe('<ChartLineAdxDivergenceCross /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineAdxDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-adx-divergence-cross"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-length')).toBe(String(L));
    expect(root?.getAttribute('data-divergence-window')).toBe(String(WIN));
  });

  it('renders an empty fallback when data is empty', () => {
    const { container } = render(<ChartLineAdxDivergenceCross data={[]} />);
    const empty = container.querySelector(
      '[data-section="chart-line-adx-divergence-cross-empty"]',
    );
    expect(empty).not.toBeNull();
  });

  it('renders the price and ADX paths', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineAdxDivergenceCross data={data} />,
    );
    const price = container.querySelector(
      '[data-section="chart-line-adx-divergence-cross-price-path"]',
    );
    const adx = container.querySelector(
      '[data-section="chart-line-adx-divergence-cross-adx-path"]',
    );
    expect(price).not.toBeNull();
    expect(adx).not.toBeNull();
  });

  it('renders the zero reference line', () => {
    const data = buildConst(80, 50);
    const { container } = render(
      <ChartLineAdxDivergenceCross data={data} />,
    );
    const zero = container.querySelector(
      '[data-section="chart-line-adx-divergence-cross-zero-line"]',
    );
    expect(zero).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineAdxDivergenceCross data={data} showLegend={false} />,
    );
    const legend = container.querySelector(
      '[data-section="chart-line-adx-divergence-cross-legend"]',
    );
    expect(legend).toBeNull();
  });

  it('respects showAxis=false and showGrid=false', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineAdxDivergenceCross
        data={data}
        showAxis={false}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-divergence-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-divergence-cross-grid"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge with crosses count', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineAdxDivergenceCross data={data} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-adx-divergence-cross-badge"]',
    );
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain('length 14');
    expect(badge?.textContent).toContain('window 5');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('emits empty when data filters down to nothing', () => {
    const data = [
      { x: NaN, high: 1, low: 0, close: 0.5 },
      { x: 1, high: 1, low: NaN, close: 0.5 },
    ];
    const { container } = render(
      <ChartLineAdxDivergenceCross data={data} />,
    );
    const empty = container.querySelector(
      '[data-section="chart-line-adx-divergence-cross-empty"]',
    );
    expect(empty).not.toBeNull();
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineAdxDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-adx-divergence-cross"]',
    );
    expect(root?.getAttribute('aria-label')).toBe(
      'ADX Divergence Cross chart',
    );
  });

  it('exposes data-*-count counters', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineAdxDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-adx-divergence-cross"]',
    );
    expect(root?.getAttribute('data-aligned-bullish-count')).toBe('0');
    expect(root?.getAttribute('data-aligned-bearish-count')).toBe('0');
    expect(root?.getAttribute('data-divergent-bullish-count')).toBe('0');
    expect(root?.getAttribute('data-divergent-bearish-count')).toBe(
      String(80 - VALID_FROM),
    );
    expect(root?.getAttribute('data-bullish-cross-count')).toBe('0');
    expect(root?.getAttribute('data-bearish-cross-count')).toBe('0');
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('renders the title and aria description elements', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineAdxDivergenceCross data={data} />,
    );
    const title = container.querySelector(
      '[data-section="chart-line-adx-divergence-cross-title"]',
    );
    const desc = container.querySelector(
      '[data-section="chart-line-adx-divergence-cross-aria-desc"]',
    );
    expect(title).not.toBeNull();
    expect(desc).not.toBeNull();
    expect(desc?.textContent).toContain('ADX Divergence Cross chart');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineAdxDivergenceCross data={data} hiddenSeries={['adx']} />,
    );
    const adx = container.querySelector(
      '[data-section="chart-line-adx-divergence-cross-adx-path"]',
    );
    expect(adx).toBeNull();
  });
});
