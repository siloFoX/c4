import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineSupertrendDivergenceCross,
  DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_MULTIPLIER,
  DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_PADDING,
  DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_PERIOD,
  DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_WIDTH,
  classifyLineSupertrendDivergenceCrossBias,
  classifyLineSupertrendDivergenceCrossRegime,
  computeLineSupertrendDivergenceCross,
  computeLineSupertrendDivergenceCrossLayout,
  describeLineSupertrendDivergenceCrossChart,
  detectLineSupertrendDivergenceCrossCrosses,
  getLineSupertrendDivergenceCrossFinitePoints,
  normalizeLineSupertrendDivergenceCrossLength,
  normalizeLineSupertrendDivergenceCrossMultiplier,
  runLineSupertrendDivergenceCross,
  type ChartLineSupertrendDivergenceCrossPoint,
  type ChartLineSupertrendDivergenceCrossRegime,
} from './chart-line-supertrend-divergence-cross';

const PERIOD = 10;
const MULTIPLIER = 3;
const BAND_OFFSET = MULTIPLIER * 2; // ATR=2 on canonical anchors
const WARMUP = PERIOD; // supertrend first valid at i=period

const buildConstBand = (
  n: number,
  k: number,
): ChartLineSupertrendDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: k + 1,
    low: k - 1,
    close: k,
  }));

const buildLinearUp = (
  n: number,
): ChartLineSupertrendDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: i + 1,
    low: i - 1,
    close: i,
  }));

const buildLinearDown = (
  n: number,
): ChartLineSupertrendDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: -i + 1,
    low: -i - 1,
    close: -i,
  }));

describe('ChartLineSupertrendDivergenceCross defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_PANEL_GAP).toBe(
      12,
    );
  });

  it('exports canonical Supertrend tuning', () => {
    expect(DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_PERIOD).toBe(10);
    expect(DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_MULTIPLIER).toBe(
      3,
    );
  });
});

describe('getLineSupertrendDivergenceCrossFinitePoints', () => {
  it('filters NaN/Infinity and high<low', () => {
    const points = [
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: NaN, high: 2, low: 1, close: 1.5 },
      { x: 1, high: 1, low: 2, close: 1.5 },
      { x: 2, high: Infinity, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ];
    expect(getLineSupertrendDivergenceCrossFinitePoints(points)).toEqual([
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ]);
  });

  it('returns empty for null and non-array', () => {
    expect(getLineSupertrendDivergenceCrossFinitePoints(null)).toEqual([]);
    expect(getLineSupertrendDivergenceCrossFinitePoints(undefined)).toEqual(
      [],
    );
    expect(
      getLineSupertrendDivergenceCrossFinitePoints(
        // @ts-expect-error -- intentionally bad
        'oops',
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineSupertrendDivergenceCrossLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineSupertrendDivergenceCrossLength(10.7, 10)).toBe(10);
    expect(normalizeLineSupertrendDivergenceCrossLength(0, 10)).toBe(10);
    expect(normalizeLineSupertrendDivergenceCrossLength(NaN, 10)).toBe(10);
  });
});

describe('normalizeLineSupertrendDivergenceCrossMultiplier', () => {
  it('accepts finite >0 values', () => {
    expect(normalizeLineSupertrendDivergenceCrossMultiplier(3, 3)).toBe(3);
    expect(normalizeLineSupertrendDivergenceCrossMultiplier(0, 3)).toBe(3);
    expect(normalizeLineSupertrendDivergenceCrossMultiplier(-1, 3)).toBe(3);
    expect(normalizeLineSupertrendDivergenceCrossMultiplier(NaN, 3)).toBe(3);
  });
});

describe('computeLineSupertrendDivergenceCross CONST band', () => {
  it('ATR=2, bands K+/-6, supertrend=K-6 (uptrend init) flat throughout', () => {
    const data = buildConstBand(40, 50);
    const out = computeLineSupertrendDivergenceCross(data);
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.atr[i] as number).toBeCloseTo(2, 9);
      expect(out.upperBand[i] as number).toBeCloseTo(56, 9);
      expect(out.lowerBand[i] as number).toBeCloseTo(44, 9);
      expect(out.supertrend[i] as number).toBeCloseTo(44, 9);
      expect(out.trend[i]).toBe('up');
    }
  });
});

describe('computeLineSupertrendDivergenceCross LINEAR UP', () => {
  it('ATR=2, supertrend = i - 6 (lowerBand), rising at +1/bar', () => {
    const data = buildLinearUp(40);
    const out = computeLineSupertrendDivergenceCross(data);
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.atr[i] as number).toBeCloseTo(2, 9);
      expect(out.supertrend[i] as number).toBeCloseTo(i - BAND_OFFSET, 9);
      expect(out.trend[i]).toBe('up');
    }
  });
});

describe('computeLineSupertrendDivergenceCross LINEAR DOWN', () => {
  it('ATR=2, supertrend = -i + 6 (upperBand), falling at -1/bar', () => {
    const data = buildLinearDown(40);
    const out = computeLineSupertrendDivergenceCross(data);
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.atr[i] as number).toBeCloseTo(2, 9);
      expect(out.supertrend[i] as number).toBeCloseTo(
        -i + BAND_OFFSET,
        9,
      );
      expect(out.trend[i]).toBe('down');
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineSupertrendDivergenceCross([])).toEqual({
      atr: [],
      upperBand: [],
      lowerBand: [],
      finalUpper: [],
      finalLower: [],
      supertrend: [],
      trend: [],
    });
  });
});

describe('classifyLineSupertrendDivergenceCrossRegime', () => {
  it('null -> none', () => {
    expect(
      classifyLineSupertrendDivergenceCrossRegime(null, 1, 5, 4),
    ).toBe('none');
  });
  it('priceUp + stUp -> aligned-bullish', () => {
    expect(classifyLineSupertrendDivergenceCrossRegime(2, 1, 5, 4)).toBe(
      'aligned-bullish',
    );
  });
  it('priceDown + stDown -> aligned-bearish', () => {
    expect(classifyLineSupertrendDivergenceCrossRegime(1, 2, 4, 5)).toBe(
      'aligned-bearish',
    );
  });
  it('priceDown + stUp -> divergent-bullish', () => {
    expect(classifyLineSupertrendDivergenceCrossRegime(1, 2, 5, 4)).toBe(
      'divergent-bullish',
    );
  });
  it('priceUp + stDown -> divergent-bearish', () => {
    expect(classifyLineSupertrendDivergenceCrossRegime(2, 1, 4, 5)).toBe(
      'divergent-bearish',
    );
  });
  it('flat sides -> none', () => {
    expect(classifyLineSupertrendDivergenceCrossRegime(1, 1, 5, 4)).toBe(
      'none',
    );
    expect(classifyLineSupertrendDivergenceCrossRegime(2, 1, 5, 5)).toBe(
      'none',
    );
  });
});

describe('classifyLineSupertrendDivergenceCrossBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineSupertrendDivergenceCrossBias(60, 50)).toBe('up');
    expect(classifyLineSupertrendDivergenceCrossBias(40, 50)).toBe('down');
    expect(classifyLineSupertrendDivergenceCrossBias(50, 50)).toBe('flat');
    expect(classifyLineSupertrendDivergenceCrossBias(null, 50)).toBe(
      'none',
    );
  });
});

describe('detectLineSupertrendDivergenceCrossCrosses', () => {
  it('fires bullish on transition into divergent-bullish', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const regimes: ChartLineSupertrendDivergenceCrossRegime[] = [
      'aligned-bullish',
      'aligned-bullish',
      'divergent-bullish',
      'divergent-bullish',
    ];
    const st: Array<number | null> = [1, 2, 3, 4];
    const out = detectLineSupertrendDivergenceCrossCrosses(
      series,
      regimes,
      st,
    );
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
    const regimes: ChartLineSupertrendDivergenceCrossRegime[] = [
      'aligned-bullish',
      'aligned-bullish',
      'divergent-bearish',
      'divergent-bearish',
    ];
    const st: Array<number | null> = [4, 3, 2, 1];
    const out = detectLineSupertrendDivergenceCrossCrosses(
      series,
      regimes,
      st,
    );
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
    const regimes: ChartLineSupertrendDivergenceCrossRegime[] = [
      'none',
      'divergent-bullish',
      'divergent-bullish',
      'divergent-bullish',
      'aligned-bullish',
    ];
    const st: Array<number | null> = [1, 2, 3, 4, 5];
    const out = detectLineSupertrendDivergenceCrossCrosses(
      series,
      regimes,
      st,
    );
    expect(out).toHaveLength(1);
  });
});

describe('runLineSupertrendDivergenceCross CONST band', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST band ${K}: supertrend=K-6 (uptrend init flat), all none, 0 triggers`, () => {
      const data = buildConstBand(60, K);
      const run = runLineSupertrendDivergenceCross(data);
      expect(run.period).toBe(PERIOD);
      expect(run.multiplier).toBe(MULTIPLIER);
      for (let i = 0; i < WARMUP; i += 1) {
        expect(run.supertrendValues[i]).toBeNull();
      }
      for (let i = WARMUP; i < 60; i += 1) {
        expect(run.supertrendValues[i] as number).toBeCloseTo(
          K - BAND_OFFSET,
          9,
        );
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

describe('runLineSupertrendDivergenceCross LINEAR UP', () => {
  it('LINEAR UP: supertrend=i-6, all aligned-bullish from i>=period+1', () => {
    const data = buildLinearUp(60);
    const run = runLineSupertrendDivergenceCross(data);
    for (let i = WARMUP + 1; i < 60; i += 1) {
      expect(run.samples[i]?.regime).toBe('aligned-bullish');
      expect(run.supertrendValues[i] as number).toBeCloseTo(
        i - BAND_OFFSET,
        9,
      );
    }
    expect(run.alignedBullishCount).toBe(60 - WARMUP - 1);
    expect(run.alignedBearishCount).toBe(0);
    expect(run.divergentBullishCount).toBe(0);
    expect(run.divergentBearishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineSupertrendDivergenceCross LINEAR DOWN', () => {
  it('LINEAR DOWN: supertrend=-i+6, all aligned-bearish from i>=period+1', () => {
    const data = buildLinearDown(60);
    const run = runLineSupertrendDivergenceCross(data);
    for (let i = WARMUP + 1; i < 60; i += 1) {
      expect(run.samples[i]?.regime).toBe('aligned-bearish');
      expect(run.supertrendValues[i] as number).toBeCloseTo(
        -i + BAND_OFFSET,
        9,
      );
    }
    expect(run.alignedBearishCount).toBe(60 - WARMUP - 1);
    expect(run.alignedBullishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineSupertrendDivergenceCross misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineSupertrendDivergenceCrossPoint[] = [
      { x: 2, high: 1, low: 0, close: 0.5 },
      { x: 0, high: 1, low: 0, close: 0.5 },
      { x: 1, high: 1, low: 0, close: 0.5 },
    ];
    const run = runLineSupertrendDivergenceCross(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConstBand(10, 50);
    const run = runLineSupertrendDivergenceCross(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineSupertrendDivergenceCross([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom tuning', () => {
    const data = buildLinearUp(60);
    const run = runLineSupertrendDivergenceCross(data, {
      period: 7,
      multiplier: 2,
    });
    expect(run.period).toBe(7);
    expect(run.multiplier).toBe(2);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(60);
    const run = runLineSupertrendDivergenceCross(data);
    expect(
      run.alignedBullishCount +
        run.alignedBearishCount +
        run.divergentBullishCount +
        run.divergentBearishCount +
        run.noneCount,
    ).toBe(60);
  });
});

describe('computeLineSupertrendDivergenceCrossLayout', () => {
  it('renders SVG paths for LINEAR UP', () => {
    const data = buildLinearUp(60);
    const layout = computeLineSupertrendDivergenceCrossLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(60);
    expect(layout.supertrendPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineSupertrendDivergenceCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.supertrendPath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineSupertrendDivergenceCrossLayout({
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
    const layout = computeLineSupertrendDivergenceCrossLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });
});

describe('describeLineSupertrendDivergenceCrossChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineSupertrendDivergenceCrossChart([])).toBe('No data');
  });

  it('mentions bar count, period, multiplier, trend stop', () => {
    const desc = describeLineSupertrendDivergenceCrossChart(
      buildLinearUp(60),
    );
    expect(desc).toContain('60 bars');
    expect(desc).toContain('period 10');
    expect(desc).toContain('multiplier 3');
    expect(desc).toContain('trend stop');
    expect(desc).toContain('bias coloring');
  });
});

describe('<ChartLineSupertrendDivergenceCross /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineSupertrendDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-supertrend-divergence-cross"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-period')).toBe(String(PERIOD));
    expect(root?.getAttribute('data-multiplier')).toBe(String(MULTIPLIER));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(
      <ChartLineSupertrendDivergenceCross data={[]} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-supertrend-divergence-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders supertrend path', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineSupertrendDivergenceCross data={data} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-supertrend-divergence-cross-supertrend-path"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineSupertrendDivergenceCross data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-supertrend-divergence-cross-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineSupertrendDivergenceCross data={data} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-supertrend-divergence-cross-badge"]',
    );
    expect(badge?.textContent).toContain('period 10');
    expect(badge?.textContent).toContain('mult 3');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineSupertrendDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-supertrend-divergence-cross"]',
    );
    expect(root?.getAttribute('aria-label')).toBe(
      'Supertrend divergence chart',
    );
  });

  it('exposes data-*-count counters for LINEAR UP', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineSupertrendDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-supertrend-divergence-cross"]',
    );
    expect(root?.getAttribute('data-aligned-bullish-count')).toBe(
      String(60 - WARMUP - 1),
    );
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineSupertrendDivergenceCross
        data={data}
        hiddenSeries={['supertrend']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-supertrend-divergence-cross-supertrend-path"]',
      ),
    ).toBeNull();
  });
});
