import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineTrixDivergenceCross,
  DEFAULT_CHART_LINE_TRIX_DIVERGENCE_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_TRIX_DIVERGENCE_CROSS_LENGTH,
  DEFAULT_CHART_LINE_TRIX_DIVERGENCE_CROSS_PADDING,
  DEFAULT_CHART_LINE_TRIX_DIVERGENCE_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_TRIX_DIVERGENCE_CROSS_WIDTH,
  DEFAULT_CHART_LINE_TRIX_DIVERGENCE_CROSS_WINDOW,
  applyLineTrixDivergenceCrossSmaSeededEma,
  applyLineTrixDivergenceCrossTrix,
  classifyLineTrixDivergenceCrossRegime,
  computeLineTrixDivergenceCross,
  computeLineTrixDivergenceCrossLayout,
  describeLineTrixDivergenceCrossChart,
  detectLineTrixDivergenceCrossCrosses,
  getLineTrixDivergenceCrossFinitePoints,
  normalizeLineTrixDivergenceCrossLength,
  normalizeLineTrixDivergenceCrossWindow,
  runLineTrixDivergenceCross,
  type ChartLineTrixDivergenceCrossPoint,
  type ChartLineTrixDivergenceCrossRegime,
} from './chart-line-trix-divergence-cross';

const L = 15;
const WIN = 5;
const WARMUP = 3 * (L - 1) + 1; // 43 (first index where trix is valid)
const VALID_FROM = WARMUP + WIN; // 48

const buildConst = (
  n: number,
  k: number,
): ChartLineTrixDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: k }));

const buildLinearUp = (n: number): ChartLineTrixDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: i }));

const buildLinearDown = (n: number): ChartLineTrixDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: -i }));

describe('ChartLineTrixDivergenceCross defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_TRIX_DIVERGENCE_CROSS_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_TRIX_DIVERGENCE_CROSS_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_TRIX_DIVERGENCE_CROSS_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_TRIX_DIVERGENCE_CROSS_PANEL_GAP).toBe(12);
  });

  it('exports canonical TRIX tuning', () => {
    expect(DEFAULT_CHART_LINE_TRIX_DIVERGENCE_CROSS_LENGTH).toBe(15);
    expect(DEFAULT_CHART_LINE_TRIX_DIVERGENCE_CROSS_WINDOW).toBe(5);
  });
});

describe('getLineTrixDivergenceCrossFinitePoints', () => {
  it('filters finite x and close', () => {
    const points = [
      { x: 0, close: 1 },
      { x: NaN, close: 2 },
      { x: 2, close: Infinity },
      { x: 3, close: 4 },
    ];
    const result = getLineTrixDivergenceCrossFinitePoints(points);
    expect(result).toEqual([
      { x: 0, close: 1 },
      { x: 3, close: 4 },
    ]);
  });

  it('returns empty array for null and non-array', () => {
    expect(getLineTrixDivergenceCrossFinitePoints(null)).toEqual([]);
    expect(getLineTrixDivergenceCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineTrixDivergenceCrossFinitePoints(
        // @ts-expect-error -- intentionally bad
        'oops',
      ),
    ).toEqual([]);
  });

  it('skips falsy entries', () => {
    const points = [
      null as unknown as ChartLineTrixDivergenceCrossPoint,
      { x: 1, close: 1 },
      undefined as unknown as ChartLineTrixDivergenceCrossPoint,
    ];
    expect(getLineTrixDivergenceCrossFinitePoints(points)).toEqual([
      { x: 1, close: 1 },
    ]);
  });
});

describe('normalizeLineTrixDivergenceCrossLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineTrixDivergenceCrossLength(15.7, 15)).toBe(15);
    expect(normalizeLineTrixDivergenceCrossLength(1, 15)).toBe(1);
  });

  it('falls back when invalid', () => {
    expect(normalizeLineTrixDivergenceCrossLength(0, 15)).toBe(15);
    expect(normalizeLineTrixDivergenceCrossLength(-3, 15)).toBe(15);
    expect(normalizeLineTrixDivergenceCrossLength(NaN, 15)).toBe(15);
    expect(normalizeLineTrixDivergenceCrossLength('big', 15)).toBe(15);
  });
});

describe('normalizeLineTrixDivergenceCrossWindow', () => {
  it('floors finite >=1 windows', () => {
    expect(normalizeLineTrixDivergenceCrossWindow(5.9, 5)).toBe(5);
    expect(normalizeLineTrixDivergenceCrossWindow(1, 5)).toBe(1);
  });

  it('falls back when invalid', () => {
    expect(normalizeLineTrixDivergenceCrossWindow(0, 5)).toBe(5);
    expect(normalizeLineTrixDivergenceCrossWindow(-1, 5)).toBe(5);
    expect(normalizeLineTrixDivergenceCrossWindow(NaN, 5)).toBe(5);
  });
});

describe('applyLineTrixDivergenceCrossSmaSeededEma', () => {
  it('seeds with SMA and recurs', () => {
    const values: Array<number | null> = [null, 1, 1, 1, 1, 1, 1];
    const out = applyLineTrixDivergenceCrossSmaSeededEma(values, 3);
    expect(out[0]).toBeNull();
    expect(out[1]).toBeNull();
    expect(out[2]).toBeNull();
    expect(out[3]).toBe(1);
    expect(out[4]).toBe(1);
    expect(out[5]).toBe(1);
    expect(out[6]).toBe(1);
  });

  it('returns all nulls when input empty', () => {
    expect(applyLineTrixDivergenceCrossSmaSeededEma([], 5)).toEqual([]);
  });

  it('returns all nulls when length < 1', () => {
    const out = applyLineTrixDivergenceCrossSmaSeededEma([1, 2, 3], 0);
    expect(out.every((v) => v === null)).toBe(true);
  });

  it('returns all nulls when no valid values', () => {
    const out = applyLineTrixDivergenceCrossSmaSeededEma(
      [null, null, null],
      2,
    );
    expect(out.every((v) => v === null)).toBe(true);
  });

  it('returns all nulls when seedEnd >= length', () => {
    const out = applyLineTrixDivergenceCrossSmaSeededEma([1, 2], 5);
    expect(out.every((v) => v === null)).toBe(true);
  });

  it('stops at gap after seed', () => {
    const out = applyLineTrixDivergenceCrossSmaSeededEma(
      [1, 1, 1, null, 1, 1],
      3,
    );
    expect(out[2]).toBe(1);
    expect(out[3]).toBeNull();
    expect(out[4]).toBeNull();
    expect(out[5]).toBeNull();
  });

  it('returns all nulls when gap during seed', () => {
    const out = applyLineTrixDivergenceCrossSmaSeededEma(
      [1, null, 1, 1, 1],
      3,
    );
    expect(out.every((v) => v === null)).toBe(true);
  });

  it('converts -0 to +0', () => {
    const out = applyLineTrixDivergenceCrossSmaSeededEma([-0, -0, -0], 3);
    expect(Object.is(out[2], 0)).toBe(true);
  });
});

describe('applyLineTrixDivergenceCrossTrix', () => {
  it('CONST close=K (K>0) returns 0 from warmup onwards', () => {
    for (const K of [1, 7, 100, 1234]) {
      const closes = Array.from({ length: 60 }, () => K);
      const trix = applyLineTrixDivergenceCrossTrix(closes, L);
      for (let i = 0; i < WARMUP; i += 1) {
        expect(trix[i]).toBeNull();
      }
      for (let i = WARMUP; i < closes.length; i += 1) {
        expect(trix[i]).toBe(0);
      }
    }
  });

  it('CONST close=0 hits degenerate fallback and returns 0', () => {
    const closes = Array.from({ length: 60 }, () => 0);
    const trix = applyLineTrixDivergenceCrossTrix(closes, L);
    for (let i = 0; i < WARMUP; i += 1) {
      expect(trix[i]).toBeNull();
    }
    for (let i = WARMUP; i < closes.length; i += 1) {
      expect(trix[i]).toBe(0);
      expect(Object.is(trix[i], 0)).toBe(true);
    }
  });

  it('LINEAR UP yields trix = 100 / (i - 22) and decays', () => {
    const closes = Array.from({ length: 60 }, (_, i) => i);
    const trix = applyLineTrixDivergenceCrossTrix(closes, L);
    for (let i = 0; i < WARMUP; i += 1) {
      expect(trix[i]).toBeNull();
    }
    for (let i = WARMUP; i < closes.length; i += 1) {
      expect(trix[i]).not.toBeNull();
      expect(trix[i] as number).toBeCloseTo(100 / (i - 22), 6);
    }
    for (let i = WARMUP + 1; i < closes.length; i += 1) {
      expect(trix[i] as number).toBeLessThan(trix[i - 1] as number);
    }
  });

  it('LINEAR DOWN yields trix = 100 / (i - 22) (same magnitude as UP)', () => {
    const closes = Array.from({ length: 60 }, (_, i) => -i);
    const trix = applyLineTrixDivergenceCrossTrix(closes, L);
    for (let i = WARMUP; i < closes.length; i += 1) {
      expect(trix[i] as number).toBeCloseTo(100 / (i - 22), 6);
    }
    for (let i = WARMUP + 1; i < closes.length; i += 1) {
      expect(trix[i] as number).toBeLessThan(trix[i - 1] as number);
    }
  });

  it('returns all nulls when length < 1', () => {
    const trix = applyLineTrixDivergenceCrossTrix([1, 2, 3, 4], 0);
    expect(trix.every((v) => v === null)).toBe(true);
  });

  it('returns empty when closes empty', () => {
    expect(applyLineTrixDivergenceCrossTrix([], L)).toEqual([]);
  });

  it('returns single null for length 1 series', () => {
    expect(applyLineTrixDivergenceCrossTrix([5], L)).toEqual([null]);
  });
});

describe('computeLineTrixDivergenceCross', () => {
  it('uses default length when not provided', () => {
    const data = buildConst(60, 50);
    const out = computeLineTrixDivergenceCross(data);
    expect(out.trix[WARMUP]).toBe(0);
    expect(out.trix[WARMUP - 1]).toBeNull();
  });

  it('returns empty trix for empty data', () => {
    expect(computeLineTrixDivergenceCross([])).toEqual({ trix: [] });
    expect(computeLineTrixDivergenceCross(null)).toEqual({ trix: [] });
  });

  it('falls back to default on invalid length', () => {
    const out = computeLineTrixDivergenceCross(buildLinearUp(60), {
      length: 0,
    });
    expect(out.trix[WARMUP]).not.toBeNull();
  });
});

describe('classifyLineTrixDivergenceCrossRegime', () => {
  const cases: Array<{
    priceUp: boolean | null;
    trixUp: boolean | null;
    expected: ChartLineTrixDivergenceCrossRegime;
  }> = [
    { priceUp: true, trixUp: true, expected: 'aligned-bullish' },
    { priceUp: false, trixUp: false, expected: 'aligned-bearish' },
    { priceUp: false, trixUp: true, expected: 'divergent-bullish' },
    { priceUp: true, trixUp: false, expected: 'divergent-bearish' },
    { priceUp: null, trixUp: false, expected: 'none' },
    { priceUp: true, trixUp: null, expected: 'none' },
    { priceUp: null, trixUp: null, expected: 'none' },
  ];
  it.each(cases)(
    'classifies priceUp=$priceUp trixUp=$trixUp as $expected',
    ({ priceUp, trixUp, expected }) => {
      expect(classifyLineTrixDivergenceCrossRegime(priceUp, trixUp)).toBe(
        expected,
      );
    },
  );
});

describe('detectLineTrixDivergenceCrossCrosses', () => {
  it('suppresses crosses entered from none', () => {
    const series = Array.from({ length: 6 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const states: ChartLineTrixDivergenceCrossRegime[] = [
      'none',
      'none',
      'none',
      'none',
      'divergent-bullish',
      'divergent-bullish',
    ];
    const out = detectLineTrixDivergenceCrossCrosses(series, states);
    expect(out).toHaveLength(0);
  });

  it('detects a bullish cross from aligned-bearish to divergent-bullish', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const states: ChartLineTrixDivergenceCrossRegime[] = [
      'aligned-bearish',
      'aligned-bearish',
      'divergent-bullish',
      'divergent-bullish',
    ];
    const out = detectLineTrixDivergenceCrossCrosses(series, states);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
    expect(out[0]?.index).toBe(2);
  });

  it('detects a bearish cross from aligned-bullish to divergent-bearish', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const states: ChartLineTrixDivergenceCrossRegime[] = [
      'aligned-bullish',
      'aligned-bullish',
      'divergent-bearish',
      'divergent-bearish',
    ];
    const out = detectLineTrixDivergenceCrossCrosses(series, states);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
    expect(out[0]?.index).toBe(2);
  });

  it('does not double-fire when state holds steady', () => {
    const series = Array.from({ length: 5 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const states: ChartLineTrixDivergenceCrossRegime[] = [
      'aligned-bearish',
      'divergent-bullish',
      'divergent-bullish',
      'divergent-bullish',
      'divergent-bullish',
    ];
    const out = detectLineTrixDivergenceCrossCrosses(series, states);
    expect(out).toHaveLength(1);
  });

  it('handles alternating crosses', () => {
    const series = Array.from({ length: 5 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const states: ChartLineTrixDivergenceCrossRegime[] = [
      'aligned-bullish',
      'divergent-bullish',
      'divergent-bearish',
      'divergent-bullish',
      'aligned-bullish',
    ];
    const out = detectLineTrixDivergenceCrossCrosses(series, states);
    expect(out.map((c) => c.kind)).toEqual([
      'bullish',
      'bearish',
      'bullish',
    ]);
  });
});

describe('runLineTrixDivergenceCross CONST K', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST close=${K}: trix=0, aligned-bearish, 0 crosses`, () => {
      const data = buildConst(80, K);
      const run = runLineTrixDivergenceCross(data);
      expect(run.length).toBe(L);
      expect(run.divergenceWindow).toBe(WIN);
      expect(run.series).toHaveLength(80);
      for (let i = 0; i < WARMUP; i += 1) {
        expect(run.trixValues[i]).toBeNull();
      }
      for (let i = WARMUP; i < 80; i += 1) {
        expect(run.trixValues[i]).toBe(0);
      }
      for (let i = 0; i < VALID_FROM; i += 1) {
        expect(run.samples[i]?.regime).toBe('none');
      }
      for (let i = VALID_FROM; i < 80; i += 1) {
        expect(run.samples[i]?.regime).toBe('aligned-bearish');
        expect(run.samples[i]?.priceUp).toBe(false);
        expect(run.samples[i]?.trixUp).toBe(false);
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

describe('runLineTrixDivergenceCross LINEAR UP', () => {
  it('LINEAR UP: trix decays positive, divergent-bearish, 0 crosses', () => {
    const data = buildLinearUp(80);
    const run = runLineTrixDivergenceCross(data);
    for (let i = 0; i < WARMUP; i += 1) {
      expect(run.trixValues[i]).toBeNull();
    }
    for (let i = WARMUP; i < 80; i += 1) {
      const expected = 100 / (i - 22);
      expect(run.trixValues[i] as number).toBeCloseTo(expected, 6);
    }
    for (let i = VALID_FROM; i < 80; i += 1) {
      expect(run.samples[i]?.regime).toBe('divergent-bearish');
      expect(run.samples[i]?.priceUp).toBe(true);
      expect(run.samples[i]?.trixUp).toBe(false);
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

describe('runLineTrixDivergenceCross LINEAR DOWN', () => {
  it('LINEAR DOWN: trix decays positive, aligned-bearish, 0 crosses', () => {
    const data = buildLinearDown(80);
    const run = runLineTrixDivergenceCross(data);
    for (let i = WARMUP; i < 80; i += 1) {
      const expected = 100 / (i - 22);
      expect(run.trixValues[i] as number).toBeCloseTo(expected, 6);
    }
    for (let i = VALID_FROM; i < 80; i += 1) {
      expect(run.samples[i]?.regime).toBe('aligned-bearish');
      expect(run.samples[i]?.priceUp).toBe(false);
      expect(run.samples[i]?.trixUp).toBe(false);
    }
    expect(run.alignedBearishCount).toBe(80 - VALID_FROM);
    expect(run.divergentBullishCount).toBe(0);
    expect(run.divergentBearishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineTrixDivergenceCross misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineTrixDivergenceCrossPoint[] = [
      { x: 2, close: 1 },
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    const run = runLineTrixDivergenceCross(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when series too short for warmup+window', () => {
    const data = buildConst(40, 50);
    const run = runLineTrixDivergenceCross(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineTrixDivergenceCross([]);
    expect(run.series).toEqual([]);
    expect(run.trixValues).toEqual([]);
    expect(run.samples).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom length / divergenceWindow', () => {
    const data = buildLinearUp(60);
    const run = runLineTrixDivergenceCross(data, {
      length: 3,
      divergenceWindow: 1,
    });
    expect(run.length).toBe(3);
    expect(run.divergenceWindow).toBe(1);
    const warm = 3 * (3 - 1) + 1;
    for (let i = warm; i < 60; i += 1) {
      expect(run.trixValues[i]).not.toBeNull();
    }
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(80);
    const run = runLineTrixDivergenceCross(data);
    const total =
      run.alignedBullishCount +
      run.alignedBearishCount +
      run.divergentBullishCount +
      run.divergentBearishCount +
      run.noneCount;
    expect(total).toBe(80);
  });
});

describe('computeLineTrixDivergenceCrossLayout', () => {
  it('returns a non-empty SVG path for CONST K=50', () => {
    const data = buildConst(80, 50);
    const layout = computeLineTrixDivergenceCrossLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toContain(' L ');
    expect(layout.priceDots).toHaveLength(80);
    expect(layout.trixPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineTrixDivergenceCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.trixPath).toBe('');
    expect(layout.priceDots).toEqual([]);
    expect(layout.crossMarkers).toEqual([]);
  });

  it('pads degenerate priceMin === priceMax', () => {
    const data = buildConst(80, 100);
    const layout = computeLineTrixDivergenceCrossLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });

  it('derives symmetric oscillator range from trix span', () => {
    const layout = computeLineTrixDivergenceCrossLayout({
      data: buildLinearUp(80),
    });
    expect(layout.oscMin).toBeLessThan(0);
    expect(layout.oscMax).toBeGreaterThan(0);
    expect(layout.oscMax).toBeCloseTo(-layout.oscMin, 6);
    expect(layout.zeroY).toBeGreaterThan(layout.oscTop);
    expect(layout.zeroY).toBeLessThan(layout.oscBottom);
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineTrixDivergenceCrossLayout({
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

describe('describeLineTrixDivergenceCrossChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineTrixDivergenceCrossChart([])).toBe('No data');
  });

  it('mentions bar count, length, window', () => {
    const desc = describeLineTrixDivergenceCrossChart(buildLinearUp(50), {
      length: 15,
      divergenceWindow: 5,
    });
    expect(desc).toContain('50 bars');
    expect(desc).toContain('length 15');
    expect(desc).toContain('divergenceWindow 5');
  });
});

describe('<ChartLineTrixDivergenceCross /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineTrixDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-trix-divergence-cross"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-length')).toBe(String(L));
    expect(root?.getAttribute('data-divergence-window')).toBe(String(WIN));
  });

  it('renders an empty fallback when data is empty', () => {
    const { container } = render(<ChartLineTrixDivergenceCross data={[]} />);
    const empty = container.querySelector(
      '[data-section="chart-line-trix-divergence-cross-empty"]',
    );
    expect(empty).not.toBeNull();
  });

  it('renders the price and TRIX paths', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineTrixDivergenceCross data={data} />,
    );
    const price = container.querySelector(
      '[data-section="chart-line-trix-divergence-cross-price-path"]',
    );
    const trix = container.querySelector(
      '[data-section="chart-line-trix-divergence-cross-trix-path"]',
    );
    expect(price).not.toBeNull();
    expect(trix).not.toBeNull();
  });

  it('renders the zero reference line', () => {
    const data = buildConst(80, 50);
    const { container } = render(
      <ChartLineTrixDivergenceCross data={data} />,
    );
    const zero = container.querySelector(
      '[data-section="chart-line-trix-divergence-cross-zero-line"]',
    );
    expect(zero).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineTrixDivergenceCross data={data} showLegend={false} />,
    );
    const legend = container.querySelector(
      '[data-section="chart-line-trix-divergence-cross-legend"]',
    );
    expect(legend).toBeNull();
  });

  it('respects showAxis=false and showGrid=false', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineTrixDivergenceCross
        data={data}
        showAxis={false}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trix-divergence-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-trix-divergence-cross-grid"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge with crosses count', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineTrixDivergenceCross data={data} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-trix-divergence-cross-badge"]',
    );
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain('length 15');
    expect(badge?.textContent).toContain('window 5');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('emits empty when data filters down to nothing', () => {
    const data = [
      { x: NaN, close: 1 },
      { x: 1, close: NaN },
    ];
    const { container } = render(
      <ChartLineTrixDivergenceCross data={data} />,
    );
    const empty = container.querySelector(
      '[data-section="chart-line-trix-divergence-cross-empty"]',
    );
    expect(empty).not.toBeNull();
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineTrixDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-trix-divergence-cross"]',
    );
    expect(root?.getAttribute('aria-label')).toBe(
      'TRIX Divergence Cross chart',
    );
  });

  it('exposes data-*-count counters', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineTrixDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-trix-divergence-cross"]',
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
      <ChartLineTrixDivergenceCross data={data} />,
    );
    const title = container.querySelector(
      '[data-section="chart-line-trix-divergence-cross-title"]',
    );
    const desc = container.querySelector(
      '[data-section="chart-line-trix-divergence-cross-aria-desc"]',
    );
    expect(title).not.toBeNull();
    expect(desc).not.toBeNull();
    expect(desc?.textContent).toContain('TRIX Divergence Cross chart');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineTrixDivergenceCross data={data} hiddenSeries={['trix']} />,
    );
    const trix = container.querySelector(
      '[data-section="chart-line-trix-divergence-cross-trix-path"]',
    );
    expect(trix).toBeNull();
  });
});
