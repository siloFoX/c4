import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineFisherDivergenceCross,
  DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_CLAMP_LIMIT,
  DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_LENGTH,
  DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_PADDING,
  DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_WIDTH,
  DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_WINDOW,
  applyLineFisherDivergenceCrossFisher,
  classifyLineFisherDivergenceCrossRegime,
  computeLineFisherDivergenceCross,
  computeLineFisherDivergenceCrossLayout,
  describeLineFisherDivergenceCrossChart,
  detectLineFisherDivergenceCrossCrosses,
  getLineFisherDivergenceCrossFinitePoints,
  normalizeLineFisherDivergenceCrossClamp,
  normalizeLineFisherDivergenceCrossLength,
  normalizeLineFisherDivergenceCrossWindow,
  runLineFisherDivergenceCross,
  type ChartLineFisherDivergenceCrossPoint,
  type ChartLineFisherDivergenceCrossRegime,
} from './chart-line-fisher-divergence-cross';

const L = 9;
const WIN = 5;
const CLAMP = 0.999;
const WARMUP = L - 1; // 8 (first index where fisher is valid)
const VALID_FROM = WARMUP + WIN; // 13
const SATURATED = Math.atanh(CLAMP);

const buildConst = (
  n: number,
  k: number,
): ChartLineFisherDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: k }));

const buildLinearUp = (n: number): ChartLineFisherDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: i }));

const buildLinearDown = (n: number): ChartLineFisherDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: -i }));

describe('ChartLineFisherDivergenceCross defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_PANEL_GAP).toBe(12);
  });

  it('exports canonical Fisher tuning', () => {
    expect(DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_LENGTH).toBe(9);
    expect(DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_WINDOW).toBe(5);
    expect(DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_CLAMP_LIMIT).toBe(
      0.999,
    );
  });
});

describe('getLineFisherDivergenceCrossFinitePoints', () => {
  it('filters finite x and close', () => {
    const points = [
      { x: 0, close: 1 },
      { x: NaN, close: 2 },
      { x: 2, close: Infinity },
      { x: 3, close: 4 },
    ];
    const result = getLineFisherDivergenceCrossFinitePoints(points);
    expect(result).toEqual([
      { x: 0, close: 1 },
      { x: 3, close: 4 },
    ]);
  });

  it('returns empty array for null and non-array', () => {
    expect(getLineFisherDivergenceCrossFinitePoints(null)).toEqual([]);
    expect(getLineFisherDivergenceCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineFisherDivergenceCrossFinitePoints(
        // @ts-expect-error -- intentionally bad
        'oops',
      ),
    ).toEqual([]);
  });

  it('skips falsy entries', () => {
    const points = [
      null as unknown as ChartLineFisherDivergenceCrossPoint,
      { x: 1, close: 1 },
      undefined as unknown as ChartLineFisherDivergenceCrossPoint,
    ];
    expect(getLineFisherDivergenceCrossFinitePoints(points)).toEqual([
      { x: 1, close: 1 },
    ]);
  });
});

describe('normalizeLineFisherDivergenceCrossLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineFisherDivergenceCrossLength(9.7, 9)).toBe(9);
    expect(normalizeLineFisherDivergenceCrossLength(1, 9)).toBe(1);
  });

  it('falls back when invalid', () => {
    expect(normalizeLineFisherDivergenceCrossLength(0, 9)).toBe(9);
    expect(normalizeLineFisherDivergenceCrossLength(-3, 9)).toBe(9);
    expect(normalizeLineFisherDivergenceCrossLength(NaN, 9)).toBe(9);
    expect(normalizeLineFisherDivergenceCrossLength('big', 9)).toBe(9);
  });
});

describe('normalizeLineFisherDivergenceCrossWindow', () => {
  it('floors finite >=1 windows', () => {
    expect(normalizeLineFisherDivergenceCrossWindow(5.9, 5)).toBe(5);
    expect(normalizeLineFisherDivergenceCrossWindow(1, 5)).toBe(1);
  });

  it('falls back when invalid', () => {
    expect(normalizeLineFisherDivergenceCrossWindow(0, 5)).toBe(5);
    expect(normalizeLineFisherDivergenceCrossWindow(-1, 5)).toBe(5);
    expect(normalizeLineFisherDivergenceCrossWindow(NaN, 5)).toBe(5);
  });
});

describe('normalizeLineFisherDivergenceCrossClamp', () => {
  it('accepts strictly 0 < v < 1', () => {
    expect(normalizeLineFisherDivergenceCrossClamp(0.5, 0.999)).toBe(0.5);
    expect(normalizeLineFisherDivergenceCrossClamp(0.99, 0.999)).toBe(0.99);
  });

  it('falls back on boundary and invalid', () => {
    expect(normalizeLineFisherDivergenceCrossClamp(0, 0.999)).toBe(0.999);
    expect(normalizeLineFisherDivergenceCrossClamp(1, 0.999)).toBe(0.999);
    expect(normalizeLineFisherDivergenceCrossClamp(-0.5, 0.999)).toBe(0.999);
    expect(normalizeLineFisherDivergenceCrossClamp(NaN, 0.999)).toBe(0.999);
  });
});

describe('applyLineFisherDivergenceCrossFisher', () => {
  it('CONST close=K returns degenerate 0 from warmup onwards', () => {
    for (const K of [0, 1, 7, 100, 1234]) {
      const closes = Array.from({ length: 60 }, () => K);
      const fisher = applyLineFisherDivergenceCrossFisher(closes, L, CLAMP);
      for (let i = 0; i < WARMUP; i += 1) {
        expect(fisher[i]).toBeNull();
      }
      for (let i = WARMUP; i < closes.length; i += 1) {
        expect(fisher[i]).toBe(0);
        expect(Object.is(fisher[i], 0)).toBe(true);
      }
    }
  });

  it('LINEAR UP saturates fisher at atanh(clampLimit)', () => {
    const closes = Array.from({ length: 60 }, (_, i) => i);
    const fisher = applyLineFisherDivergenceCrossFisher(closes, L, CLAMP);
    for (let i = 0; i < WARMUP; i += 1) {
      expect(fisher[i]).toBeNull();
    }
    for (let i = WARMUP; i < closes.length; i += 1) {
      expect(fisher[i] as number).toBeCloseTo(SATURATED, 9);
    }
  });

  it('LINEAR DOWN saturates fisher at -atanh(clampLimit)', () => {
    const closes = Array.from({ length: 60 }, (_, i) => -i);
    const fisher = applyLineFisherDivergenceCrossFisher(closes, L, CLAMP);
    for (let i = WARMUP; i < closes.length; i += 1) {
      expect(fisher[i] as number).toBeCloseTo(-SATURATED, 9);
    }
  });

  it('returns all nulls when length < 1', () => {
    const fisher = applyLineFisherDivergenceCrossFisher(
      [1, 2, 3, 4],
      0,
      CLAMP,
    );
    expect(fisher.every((v) => v === null)).toBe(true);
  });

  it('returns empty when closes empty', () => {
    expect(applyLineFisherDivergenceCrossFisher([], L, CLAMP)).toEqual([]);
  });

  it('returns nulls for series shorter than length', () => {
    const fisher = applyLineFisherDivergenceCrossFisher([1, 2, 3], L, CLAMP);
    expect(fisher.every((v) => v === null)).toBe(true);
  });

  it('produces values within +/- atanh(clampLimit) bounds', () => {
    const closes = [10, 11, 9, 10, 12, 11, 13, 14, 12, 15, 11, 13, 14, 16];
    const fisher = applyLineFisherDivergenceCrossFisher(closes, L, CLAMP);
    for (let i = WARMUP; i < closes.length; i += 1) {
      const v = fisher[i] as number;
      expect(v).toBeGreaterThanOrEqual(-SATURATED);
      expect(v).toBeLessThanOrEqual(SATURATED);
    }
  });

  it('respects a custom clampLimit', () => {
    const closes = Array.from({ length: 60 }, (_, i) => i);
    const fisher = applyLineFisherDivergenceCrossFisher(closes, L, 0.5);
    for (let i = WARMUP; i < closes.length; i += 1) {
      expect(fisher[i] as number).toBeCloseTo(Math.atanh(0.5), 9);
    }
  });
});

describe('computeLineFisherDivergenceCross', () => {
  it('uses default length when not provided', () => {
    const data = buildConst(60, 50);
    const out = computeLineFisherDivergenceCross(data);
    expect(out.fisher[WARMUP]).toBe(0);
    expect(out.fisher[WARMUP - 1]).toBeNull();
  });

  it('returns empty fisher for empty data', () => {
    expect(computeLineFisherDivergenceCross([])).toEqual({ fisher: [] });
    expect(computeLineFisherDivergenceCross(null)).toEqual({ fisher: [] });
  });

  it('falls back to default on invalid length', () => {
    const out = computeLineFisherDivergenceCross(buildLinearUp(60), {
      length: 0,
    });
    expect(out.fisher[WARMUP] as number).toBeCloseTo(SATURATED, 9);
  });
});

describe('classifyLineFisherDivergenceCrossRegime', () => {
  const cases: Array<{
    priceUp: boolean | null;
    fisherUp: boolean | null;
    expected: ChartLineFisherDivergenceCrossRegime;
  }> = [
    { priceUp: true, fisherUp: true, expected: 'aligned-bullish' },
    { priceUp: false, fisherUp: false, expected: 'aligned-bearish' },
    { priceUp: false, fisherUp: true, expected: 'divergent-bullish' },
    { priceUp: true, fisherUp: false, expected: 'divergent-bearish' },
    { priceUp: null, fisherUp: false, expected: 'none' },
    { priceUp: true, fisherUp: null, expected: 'none' },
    { priceUp: null, fisherUp: null, expected: 'none' },
  ];
  it.each(cases)(
    'classifies priceUp=$priceUp fisherUp=$fisherUp as $expected',
    ({ priceUp, fisherUp, expected }) => {
      expect(
        classifyLineFisherDivergenceCrossRegime(priceUp, fisherUp),
      ).toBe(expected);
    },
  );
});

describe('detectLineFisherDivergenceCrossCrosses', () => {
  it('suppresses crosses entered from none', () => {
    const series = Array.from({ length: 6 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const states: ChartLineFisherDivergenceCrossRegime[] = [
      'none',
      'none',
      'none',
      'none',
      'divergent-bullish',
      'divergent-bullish',
    ];
    const out = detectLineFisherDivergenceCrossCrosses(series, states);
    expect(out).toHaveLength(0);
  });

  it('detects a bullish cross from aligned-bearish to divergent-bullish', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const states: ChartLineFisherDivergenceCrossRegime[] = [
      'aligned-bearish',
      'aligned-bearish',
      'divergent-bullish',
      'divergent-bullish',
    ];
    const out = detectLineFisherDivergenceCrossCrosses(series, states);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
    expect(out[0]?.index).toBe(2);
  });

  it('detects a bearish cross from aligned-bullish to divergent-bearish', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const states: ChartLineFisherDivergenceCrossRegime[] = [
      'aligned-bullish',
      'aligned-bullish',
      'divergent-bearish',
      'divergent-bearish',
    ];
    const out = detectLineFisherDivergenceCrossCrosses(series, states);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
    expect(out[0]?.index).toBe(2);
  });

  it('does not double-fire when state holds steady', () => {
    const series = Array.from({ length: 5 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const states: ChartLineFisherDivergenceCrossRegime[] = [
      'aligned-bearish',
      'divergent-bullish',
      'divergent-bullish',
      'divergent-bullish',
      'divergent-bullish',
    ];
    const out = detectLineFisherDivergenceCrossCrosses(series, states);
    expect(out).toHaveLength(1);
  });

  it('handles alternating crosses', () => {
    const series = Array.from({ length: 5 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const states: ChartLineFisherDivergenceCrossRegime[] = [
      'aligned-bullish',
      'divergent-bullish',
      'divergent-bearish',
      'divergent-bullish',
      'aligned-bullish',
    ];
    const out = detectLineFisherDivergenceCrossCrosses(series, states);
    expect(out.map((c) => c.kind)).toEqual([
      'bullish',
      'bearish',
      'bullish',
    ]);
  });
});

describe('runLineFisherDivergenceCross CONST K', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST close=${K}: fisher=0, aligned-bearish, 0 crosses`, () => {
      const data = buildConst(60, K);
      const run = runLineFisherDivergenceCross(data);
      expect(run.length).toBe(L);
      expect(run.divergenceWindow).toBe(WIN);
      expect(run.clampLimit).toBe(CLAMP);
      expect(run.series).toHaveLength(60);
      for (let i = 0; i < WARMUP; i += 1) {
        expect(run.fisherValues[i]).toBeNull();
      }
      for (let i = WARMUP; i < 60; i += 1) {
        expect(run.fisherValues[i]).toBe(0);
      }
      for (let i = 0; i < VALID_FROM; i += 1) {
        expect(run.samples[i]?.regime).toBe('none');
      }
      for (let i = VALID_FROM; i < 60; i += 1) {
        expect(run.samples[i]?.regime).toBe('aligned-bearish');
        expect(run.samples[i]?.priceUp).toBe(false);
        expect(run.samples[i]?.fisherUp).toBe(false);
      }
      expect(run.crosses).toHaveLength(0);
      expect(run.bullishCrossCount).toBe(0);
      expect(run.bearishCrossCount).toBe(0);
      expect(run.noneCount).toBe(VALID_FROM);
      expect(run.alignedBearishCount).toBe(60 - VALID_FROM);
      expect(run.alignedBullishCount).toBe(0);
      expect(run.divergentBullishCount).toBe(0);
      expect(run.divergentBearishCount).toBe(0);
      expect(run.ok).toBe(true);
    });
  }
});

describe('runLineFisherDivergenceCross LINEAR UP', () => {
  it('LINEAR UP: fisher saturated, divergent-bearish, 0 crosses', () => {
    const data = buildLinearUp(60);
    const run = runLineFisherDivergenceCross(data);
    for (let i = 0; i < WARMUP; i += 1) {
      expect(run.fisherValues[i]).toBeNull();
    }
    for (let i = WARMUP; i < 60; i += 1) {
      expect(run.fisherValues[i] as number).toBeCloseTo(SATURATED, 9);
    }
    for (let i = VALID_FROM; i < 60; i += 1) {
      expect(run.samples[i]?.regime).toBe('divergent-bearish');
      expect(run.samples[i]?.priceUp).toBe(true);
      expect(run.samples[i]?.fisherUp).toBe(false);
    }
    expect(run.divergentBearishCount).toBe(60 - VALID_FROM);
    expect(run.alignedBullishCount).toBe(0);
    expect(run.alignedBearishCount).toBe(0);
    expect(run.divergentBullishCount).toBe(0);
    expect(run.noneCount).toBe(VALID_FROM);
    expect(run.crosses).toHaveLength(0);
    expect(run.ok).toBe(true);
  });
});

describe('runLineFisherDivergenceCross LINEAR DOWN', () => {
  it('LINEAR DOWN: fisher saturated negative, aligned-bearish, 0 crosses', () => {
    const data = buildLinearDown(60);
    const run = runLineFisherDivergenceCross(data);
    for (let i = WARMUP; i < 60; i += 1) {
      expect(run.fisherValues[i] as number).toBeCloseTo(-SATURATED, 9);
    }
    for (let i = VALID_FROM; i < 60; i += 1) {
      expect(run.samples[i]?.regime).toBe('aligned-bearish');
      expect(run.samples[i]?.priceUp).toBe(false);
      expect(run.samples[i]?.fisherUp).toBe(false);
    }
    expect(run.alignedBearishCount).toBe(60 - VALID_FROM);
    expect(run.divergentBullishCount).toBe(0);
    expect(run.divergentBearishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineFisherDivergenceCross misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineFisherDivergenceCrossPoint[] = [
      { x: 2, close: 1 },
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    const run = runLineFisherDivergenceCross(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when series too short for warmup+window', () => {
    const data = buildConst(10, 50);
    const run = runLineFisherDivergenceCross(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineFisherDivergenceCross([]);
    expect(run.series).toEqual([]);
    expect(run.fisherValues).toEqual([]);
    expect(run.samples).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom length / divergenceWindow / clampLimit', () => {
    const data = buildLinearUp(40);
    const run = runLineFisherDivergenceCross(data, {
      length: 3,
      divergenceWindow: 1,
      clampLimit: 0.5,
    });
    expect(run.length).toBe(3);
    expect(run.divergenceWindow).toBe(1);
    expect(run.clampLimit).toBe(0.5);
    const warm = 3 - 1;
    for (let i = warm; i < 40; i += 1) {
      expect(run.fisherValues[i] as number).toBeCloseTo(Math.atanh(0.5), 9);
    }
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(60);
    const run = runLineFisherDivergenceCross(data);
    const total =
      run.alignedBullishCount +
      run.alignedBearishCount +
      run.divergentBullishCount +
      run.divergentBearishCount +
      run.noneCount;
    expect(total).toBe(60);
  });
});

describe('computeLineFisherDivergenceCrossLayout', () => {
  it('returns a non-empty SVG path for CONST K=50', () => {
    const data = buildConst(60, 50);
    const layout = computeLineFisherDivergenceCrossLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toContain(' L ');
    expect(layout.priceDots).toHaveLength(60);
    expect(layout.fisherPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineFisherDivergenceCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.fisherPath).toBe('');
    expect(layout.priceDots).toEqual([]);
    expect(layout.crossMarkers).toEqual([]);
  });

  it('pads degenerate priceMin === priceMax', () => {
    const data = buildConst(60, 100);
    const layout = computeLineFisherDivergenceCrossLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });

  it('derives oscillator range from atanh(clampLimit)', () => {
    const layout = computeLineFisherDivergenceCrossLayout({
      data: buildLinearUp(60),
    });
    expect(layout.oscMin).toBeCloseTo(-Math.atanh(CLAMP) * 1.1, 9);
    expect(layout.oscMax).toBeCloseTo(Math.atanh(CLAMP) * 1.1, 9);
    expect(layout.zeroY).toBeGreaterThan(layout.oscTop);
    expect(layout.zeroY).toBeLessThan(layout.oscBottom);
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineFisherDivergenceCrossLayout({
      data: buildLinearUp(50),
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

describe('describeLineFisherDivergenceCrossChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineFisherDivergenceCrossChart([])).toBe('No data');
  });

  it('mentions bar count, length, window', () => {
    const desc = describeLineFisherDivergenceCrossChart(buildLinearUp(50), {
      length: 9,
      divergenceWindow: 5,
    });
    expect(desc).toContain('50 bars');
    expect(desc).toContain('length 9');
    expect(desc).toContain('divergenceWindow 5');
  });
});

describe('<ChartLineFisherDivergenceCross /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineFisherDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-fisher-divergence-cross"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-length')).toBe(String(L));
    expect(root?.getAttribute('data-divergence-window')).toBe(String(WIN));
    expect(root?.getAttribute('data-clamp-limit')).toBe(String(CLAMP));
  });

  it('renders an empty fallback when data is empty', () => {
    const { container } = render(
      <ChartLineFisherDivergenceCross data={[]} />,
    );
    const empty = container.querySelector(
      '[data-section="chart-line-fisher-divergence-cross-empty"]',
    );
    expect(empty).not.toBeNull();
  });

  it('renders the price and Fisher paths', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineFisherDivergenceCross data={data} />,
    );
    const price = container.querySelector(
      '[data-section="chart-line-fisher-divergence-cross-price-path"]',
    );
    const fisher = container.querySelector(
      '[data-section="chart-line-fisher-divergence-cross-fisher-path"]',
    );
    expect(price).not.toBeNull();
    expect(fisher).not.toBeNull();
  });

  it('renders the zero reference line', () => {
    const data = buildConst(60, 50);
    const { container } = render(
      <ChartLineFisherDivergenceCross data={data} />,
    );
    const zero = container.querySelector(
      '[data-section="chart-line-fisher-divergence-cross-zero-line"]',
    );
    expect(zero).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineFisherDivergenceCross data={data} showLegend={false} />,
    );
    const legend = container.querySelector(
      '[data-section="chart-line-fisher-divergence-cross-legend"]',
    );
    expect(legend).toBeNull();
  });

  it('respects showAxis=false and showGrid=false', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineFisherDivergenceCross
        data={data}
        showAxis={false}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fisher-divergence-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-fisher-divergence-cross-grid"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge with crosses count', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineFisherDivergenceCross data={data} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-fisher-divergence-cross-badge"]',
    );
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain('length 9');
    expect(badge?.textContent).toContain('window 5');
    expect(badge?.textContent).toContain('clamp 0.999');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('emits empty when data filters down to nothing', () => {
    const data = [
      { x: NaN, close: 1 },
      { x: 1, close: NaN },
    ];
    const { container } = render(
      <ChartLineFisherDivergenceCross data={data} />,
    );
    const empty = container.querySelector(
      '[data-section="chart-line-fisher-divergence-cross-empty"]',
    );
    expect(empty).not.toBeNull();
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineFisherDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-fisher-divergence-cross"]',
    );
    expect(root?.getAttribute('aria-label')).toBe(
      'Fisher Divergence Cross chart',
    );
  });

  it('exposes data-*-count counters', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineFisherDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-fisher-divergence-cross"]',
    );
    expect(root?.getAttribute('data-aligned-bullish-count')).toBe('0');
    expect(root?.getAttribute('data-aligned-bearish-count')).toBe('0');
    expect(root?.getAttribute('data-divergent-bullish-count')).toBe('0');
    expect(root?.getAttribute('data-divergent-bearish-count')).toBe(
      String(60 - VALID_FROM),
    );
    expect(root?.getAttribute('data-bullish-cross-count')).toBe('0');
    expect(root?.getAttribute('data-bearish-cross-count')).toBe('0');
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('renders the title and aria description elements', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineFisherDivergenceCross data={data} />,
    );
    const title = container.querySelector(
      '[data-section="chart-line-fisher-divergence-cross-title"]',
    );
    const desc = container.querySelector(
      '[data-section="chart-line-fisher-divergence-cross-aria-desc"]',
    );
    expect(title).not.toBeNull();
    expect(desc).not.toBeNull();
    expect(desc?.textContent).toContain('Fisher Divergence Cross chart');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineFisherDivergenceCross
        data={data}
        hiddenSeries={['fisher']}
      />,
    );
    const fisher = container.querySelector(
      '[data-section="chart-line-fisher-divergence-cross-fisher-path"]',
    );
    expect(fisher).toBeNull();
  });
});
