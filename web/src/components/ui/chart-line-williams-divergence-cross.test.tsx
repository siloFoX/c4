import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineWilliamsDivergenceCross,
  DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_PADDING,
  DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_PERIOD,
  DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_WIDTH,
  classifyLineWilliamsDivergenceCrossBias,
  classifyLineWilliamsDivergenceCrossRegime,
  computeLineWilliamsDivergenceCross,
  computeLineWilliamsDivergenceCrossLayout,
  describeLineWilliamsDivergenceCrossChart,
  detectLineWilliamsDivergenceCrossCrosses,
  getLineWilliamsDivergenceCrossFinitePoints,
  normalizeLineWilliamsDivergenceCrossLength,
  runLineWilliamsDivergenceCross,
  type ChartLineWilliamsDivergenceCrossPoint,
  type ChartLineWilliamsDivergenceCrossRegime,
} from './chart-line-williams-divergence-cross';

const PERIOD = 14;
const WARMUP = PERIOD - 1; // 13

const buildConstBand = (
  n: number,
  k: number,
): ChartLineWilliamsDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: k + 1,
    low: k - 1,
    close: k,
  }));

const buildLinearUp = (
  n: number,
): ChartLineWilliamsDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: i + 1,
    low: i - 1,
    close: i,
  }));

const buildLinearDown = (
  n: number,
): ChartLineWilliamsDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: -i + 1,
    low: -i - 1,
    close: -i,
  }));

describe('ChartLineWilliamsDivergenceCross defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_PANEL_GAP).toBe(12);
  });

  it('exports canonical Williams tuning', () => {
    expect(DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_PERIOD).toBe(14);
  });
});

describe('getLineWilliamsDivergenceCrossFinitePoints', () => {
  it('filters NaN/Infinity and high<low', () => {
    const points = [
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: NaN, high: 2, low: 1, close: 1.5 },
      { x: 1, high: 1, low: 2, close: 1.5 },
      { x: 2, high: Infinity, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ];
    expect(getLineWilliamsDivergenceCrossFinitePoints(points)).toEqual([
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ]);
  });

  it('returns empty for null and non-array', () => {
    expect(getLineWilliamsDivergenceCrossFinitePoints(null)).toEqual([]);
    expect(getLineWilliamsDivergenceCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineWilliamsDivergenceCrossFinitePoints(
        // @ts-expect-error -- intentionally bad
        'oops',
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineWilliamsDivergenceCrossLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineWilliamsDivergenceCrossLength(14.7, 14)).toBe(14);
    expect(normalizeLineWilliamsDivergenceCrossLength(0, 14)).toBe(14);
    expect(normalizeLineWilliamsDivergenceCrossLength(NaN, 14)).toBe(14);
  });
});

describe('computeLineWilliamsDivergenceCross CONST band', () => {
  it('%R = -50 from warmup (close at mid-range)', () => {
    const data = buildConstBand(40, 50);
    const out = computeLineWilliamsDivergenceCross(data);
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.williams[i] as number).toBeCloseTo(-50, 9);
    }
  });

  it('returns null when HH == LL (zero range)', () => {
    const data: ChartLineWilliamsDivergenceCrossPoint[] = Array.from(
      { length: 20 },
      (_, i) => ({ x: i, high: 50, low: 50, close: 50 }),
    );
    const out = computeLineWilliamsDivergenceCross(data);
    for (let i = WARMUP; i < 20; i += 1) {
      expect(out.williams[i]).toBeNull();
    }
  });
});

describe('computeLineWilliamsDivergenceCross LINEAR UP', () => {
  it('%R = -100/(period+1) constant near-overbought (-6.667 for period=14)', () => {
    const data = buildLinearUp(40);
    const out = computeLineWilliamsDivergenceCross(data);
    const expected = -100 / (PERIOD + 1);
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.williams[i] as number).toBeCloseTo(expected, 9);
    }
  });
});

describe('computeLineWilliamsDivergenceCross LINEAR DOWN', () => {
  it('%R = -100*period/(period+1) constant near-oversold (-93.333)', () => {
    const data = buildLinearDown(40);
    const out = computeLineWilliamsDivergenceCross(data);
    const expected = (-100 * PERIOD) / (PERIOD + 1);
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.williams[i] as number).toBeCloseTo(expected, 9);
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineWilliamsDivergenceCross([])).toEqual({ williams: [] });
  });
});

describe('classifyLineWilliamsDivergenceCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineWilliamsDivergenceCrossRegime(null, 1, 5, 4)).toBe(
      'none',
    );
  });
  it('priceUp + wUp -> aligned-bullish', () => {
    expect(classifyLineWilliamsDivergenceCrossRegime(2, 1, 5, 4)).toBe(
      'aligned-bullish',
    );
  });
  it('priceDown + wDown -> aligned-bearish', () => {
    expect(classifyLineWilliamsDivergenceCrossRegime(1, 2, 4, 5)).toBe(
      'aligned-bearish',
    );
  });
  it('priceDown + wUp -> divergent-bullish', () => {
    expect(classifyLineWilliamsDivergenceCrossRegime(1, 2, 5, 4)).toBe(
      'divergent-bullish',
    );
  });
  it('priceUp + wDown -> divergent-bearish', () => {
    expect(classifyLineWilliamsDivergenceCrossRegime(2, 1, 4, 5)).toBe(
      'divergent-bearish',
    );
  });
  it('flat sides -> none', () => {
    expect(classifyLineWilliamsDivergenceCrossRegime(1, 1, 5, 4)).toBe(
      'none',
    );
    expect(classifyLineWilliamsDivergenceCrossRegime(2, 1, 5, 5)).toBe(
      'none',
    );
  });
});

describe('classifyLineWilliamsDivergenceCrossBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineWilliamsDivergenceCrossBias(-20, -50)).toBe('up');
    expect(classifyLineWilliamsDivergenceCrossBias(-80, -50)).toBe('down');
    expect(classifyLineWilliamsDivergenceCrossBias(-50, -50)).toBe('flat');
    expect(classifyLineWilliamsDivergenceCrossBias(null, -50)).toBe('none');
  });
});

describe('detectLineWilliamsDivergenceCrossCrosses', () => {
  it('fires bullish on transition into divergent-bullish', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const regimes: ChartLineWilliamsDivergenceCrossRegime[] = [
      'aligned-bullish',
      'aligned-bullish',
      'divergent-bullish',
      'divergent-bullish',
    ];
    const w: Array<number | null> = [-80, -70, -60, -50];
    const out = detectLineWilliamsDivergenceCrossCrosses(series, regimes, w);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
    expect(out[0]?.index).toBe(2);
  });

  it('fires bearish on transition into divergent-bearish', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const regimes: ChartLineWilliamsDivergenceCrossRegime[] = [
      'aligned-bullish',
      'aligned-bullish',
      'divergent-bearish',
      'divergent-bearish',
    ];
    const w: Array<number | null> = [-20, -30, -40, -50];
    const out = detectLineWilliamsDivergenceCrossCrosses(series, regimes, w);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
  });

  it('does not double-fire while in same divergent state', () => {
    const series = Array.from({ length: 5 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const regimes: ChartLineWilliamsDivergenceCrossRegime[] = [
      'none',
      'divergent-bullish',
      'divergent-bullish',
      'divergent-bullish',
      'aligned-bullish',
    ];
    const w: Array<number | null> = [-80, -70, -60, -50, -40];
    const out = detectLineWilliamsDivergenceCrossCrosses(series, regimes, w);
    expect(out).toHaveLength(1);
  });
});

describe('runLineWilliamsDivergenceCross CONST band', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST band ${K}: %R=-50 flat, all none, 0 triggers`, () => {
      const data = buildConstBand(60, K);
      const run = runLineWilliamsDivergenceCross(data);
      expect(run.period).toBe(PERIOD);
      for (let i = 0; i < WARMUP; i += 1) {
        expect(run.williamsValues[i]).toBeNull();
      }
      for (let i = WARMUP; i < 60; i += 1) {
        expect(run.williamsValues[i] as number).toBeCloseTo(-50, 9);
      }
      expect(run.alignedBullishCount).toBe(0);
      expect(run.alignedBearishCount).toBe(0);
      expect(run.divergentBullishCount).toBe(0);
      expect(run.divergentBearishCount).toBe(0);
      expect(run.noneCount).toBe(60);
      expect(run.crosses).toHaveLength(0);
      expect(run.ok).toBe(true);
    });
  }
});

describe('runLineWilliamsDivergenceCross LINEAR UP', () => {
  it('LINEAR UP: %R pinned near-overbought, regime none (flat %R), 0 triggers', () => {
    const data = buildLinearUp(60);
    const run = runLineWilliamsDivergenceCross(data);
    const expected = -100 / (PERIOD + 1);
    for (let i = WARMUP; i < 60; i += 1) {
      expect(run.williamsValues[i] as number).toBeCloseTo(expected, 9);
    }
    // %R is flat -> regime classification yields 'none' for all bars
    expect(run.alignedBullishCount).toBe(0);
    expect(run.divergentBearishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineWilliamsDivergenceCross LINEAR DOWN', () => {
  it('LINEAR DOWN: %R pinned near-oversold, regime none, 0 triggers', () => {
    const data = buildLinearDown(60);
    const run = runLineWilliamsDivergenceCross(data);
    const expected = (-100 * PERIOD) / (PERIOD + 1);
    for (let i = WARMUP; i < 60; i += 1) {
      expect(run.williamsValues[i] as number).toBeCloseTo(expected, 9);
    }
    expect(run.alignedBearishCount).toBe(0);
    expect(run.divergentBullishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineWilliamsDivergenceCross misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineWilliamsDivergenceCrossPoint[] = [
      { x: 2, high: 1, low: 0, close: 0.5 },
      { x: 0, high: 1, low: 0, close: 0.5 },
      { x: 1, high: 1, low: 0, close: 0.5 },
    ];
    const run = runLineWilliamsDivergenceCross(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConstBand(13, 50);
    const run = runLineWilliamsDivergenceCross(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineWilliamsDivergenceCross([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom period', () => {
    const data = buildLinearUp(60);
    const run = runLineWilliamsDivergenceCross(data, { period: 7 });
    expect(run.period).toBe(7);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(60);
    const run = runLineWilliamsDivergenceCross(data);
    expect(
      run.alignedBullishCount +
        run.alignedBearishCount +
        run.divergentBullishCount +
        run.divergentBearishCount +
        run.noneCount,
    ).toBe(60);
  });
});

describe('computeLineWilliamsDivergenceCrossLayout', () => {
  it('renders SVG paths for LINEAR UP', () => {
    const data = buildLinearUp(60);
    const layout = computeLineWilliamsDivergenceCrossLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(60);
    expect(layout.williamsPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('oscMin=-100, oscMax=0 (bounded %R range)', () => {
    const layout = computeLineWilliamsDivergenceCrossLayout({
      data: buildLinearUp(60),
    });
    expect(layout.oscMin).toBe(-100);
    expect(layout.oscMax).toBe(0);
  });

  it('exposes overboughtY and oversoldY threshold positions', () => {
    const layout = computeLineWilliamsDivergenceCrossLayout({
      data: buildLinearUp(60),
    });
    expect(Number.isFinite(layout.overboughtY)).toBe(true);
    expect(Number.isFinite(layout.oversoldY)).toBe(true);
    expect(layout.oversoldY).toBeGreaterThan(layout.overboughtY);
  });

  it('falls back when no data', () => {
    const layout = computeLineWilliamsDivergenceCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.williamsPath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineWilliamsDivergenceCrossLayout({
      data: buildLinearUp(40),
      width: 600,
      height: 320,
      padding: 32,
      panelGap: 8,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(320);
  });

  it('pads degenerate priceMin === priceMax', () => {
    const data = buildConstBand(60, 100);
    const layout = computeLineWilliamsDivergenceCrossLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });
});

describe('describeLineWilliamsDivergenceCrossChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineWilliamsDivergenceCrossChart([])).toBe('No data');
  });

  it('mentions bar count, period, oversold/overbought, momentum reversal', () => {
    const desc = describeLineWilliamsDivergenceCrossChart(
      buildLinearUp(60),
    );
    expect(desc).toContain('60 bars');
    expect(desc).toContain('period 14');
    expect(desc).toContain('-100');
    expect(desc).toContain('oversold');
    expect(desc).toContain('overbought');
    expect(desc).toContain('momentum reversal');
    expect(desc).toContain('bias coloring');
  });
});

describe('<ChartLineWilliamsDivergenceCross /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineWilliamsDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-williams-divergence-cross"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-period')).toBe(String(PERIOD));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(
      <ChartLineWilliamsDivergenceCross data={[]} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-divergence-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders %R path and overbought/oversold thresholds', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineWilliamsDivergenceCross data={data} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-divergence-cross-williams-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-divergence-cross-overbought-line"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-divergence-cross-oversold-line"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineWilliamsDivergenceCross data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-divergence-cross-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineWilliamsDivergenceCross data={data} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-williams-divergence-cross-badge"]',
    );
    expect(badge?.textContent).toContain('period 14');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineWilliamsDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-williams-divergence-cross"]',
    );
    expect(root?.getAttribute('aria-label')).toBe(
      'Williams %R divergence chart',
    );
  });

  it('exposes data-*-count counters for LINEAR UP', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineWilliamsDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-williams-divergence-cross"]',
    );
    expect(root?.getAttribute('data-aligned-bullish-count')).toBe('0');
    expect(root?.getAttribute('data-none-count')).toBe('60');
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineWilliamsDivergenceCross
        data={data}
        hiddenSeries={['williams']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-divergence-cross-williams-path"]',
      ),
    ).toBeNull();
  });
});
