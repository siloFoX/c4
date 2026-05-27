import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineIchimokuDivergenceCross,
  DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_KIJUN_LENGTH,
  DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_PADDING,
  DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_SENKOU_B_LENGTH,
  DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_TENKAN_LENGTH,
  DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_WIDTH,
  applyLineIchimokuDivergenceCrossRangeMidpoint,
  classifyLineIchimokuDivergenceCrossBias,
  classifyLineIchimokuDivergenceCrossRegime,
  computeLineIchimokuDivergenceCross,
  computeLineIchimokuDivergenceCrossLayout,
  describeLineIchimokuDivergenceCrossChart,
  detectLineIchimokuDivergenceCrossCrosses,
  getLineIchimokuDivergenceCrossFinitePoints,
  normalizeLineIchimokuDivergenceCrossLength,
  runLineIchimokuDivergenceCross,
  type ChartLineIchimokuDivergenceCrossPoint,
  type ChartLineIchimokuDivergenceCrossRegime,
} from './chart-line-ichimoku-divergence-cross';

const TENKAN = 9;
const KIJUN = 26;
const SENKOU_B = 52;
const WARMUP = SENKOU_B - 1; // 51
const KUMO_LAG = 16.875;

const buildConstBand = (
  n: number,
  k: number,
): ChartLineIchimokuDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: k + 1,
    low: k - 1,
    close: k,
  }));

const buildLinearUp = (
  n: number,
): ChartLineIchimokuDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: i + 1,
    low: i - 1,
    close: i,
  }));

const buildLinearDown = (
  n: number,
): ChartLineIchimokuDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: -i + 1,
    low: -i - 1,
    close: -i,
  }));

describe('ChartLineIchimokuDivergenceCross defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_PANEL_GAP).toBe(12);
  });

  it('exports canonical Ichimoku tuning', () => {
    expect(DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_TENKAN_LENGTH).toBe(
      9,
    );
    expect(DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_KIJUN_LENGTH).toBe(
      26,
    );
    expect(
      DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_SENKOU_B_LENGTH,
    ).toBe(52);
  });
});

describe('getLineIchimokuDivergenceCrossFinitePoints', () => {
  it('filters NaN/Infinity and high<low', () => {
    const points = [
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: NaN, high: 2, low: 1, close: 1.5 },
      { x: 1, high: 1, low: 2, close: 1.5 },
      { x: 2, high: Infinity, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ];
    expect(getLineIchimokuDivergenceCrossFinitePoints(points)).toEqual([
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ]);
  });

  it('returns empty for null and non-array', () => {
    expect(getLineIchimokuDivergenceCrossFinitePoints(null)).toEqual([]);
    expect(getLineIchimokuDivergenceCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineIchimokuDivergenceCrossFinitePoints(
        // @ts-expect-error -- intentionally bad
        'oops',
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineIchimokuDivergenceCrossLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineIchimokuDivergenceCrossLength(9.7, 9)).toBe(9);
    expect(normalizeLineIchimokuDivergenceCrossLength(0, 9)).toBe(9);
    expect(normalizeLineIchimokuDivergenceCrossLength(NaN, 9)).toBe(9);
  });
});

describe('applyLineIchimokuDivergenceCrossRangeMidpoint', () => {
  it('CONST band returns midpoint constant', () => {
    const highs = Array.from({ length: 20 }, () => 11);
    const lows = Array.from({ length: 20 }, () => 9);
    const out = applyLineIchimokuDivergenceCrossRangeMidpoint(
      highs,
      lows,
      TENKAN,
    );
    for (let i = TENKAN - 1; i < 20; i += 1) expect(out[i]).toBe(10);
  });

  it('LINEAR UP returns (i+1 + i-L+1-1)/2 = i - (L-2)/2', () => {
    const n = 30;
    const highs = Array.from({ length: n }, (_, i) => i + 1);
    const lows = Array.from({ length: n }, (_, i) => i - 1);
    const L = TENKAN;
    const out = applyLineIchimokuDivergenceCrossRangeMidpoint(
      highs,
      lows,
      L,
    );
    for (let i = L - 1; i < n; i += 1) {
      // HH = high[i] = i+1, LL = low[i-L+1] = i-L
      // midpoint = (i+1 + i-L) / 2 = (2i - (L-1))/2 = i - (L-1)/2
      expect(out[i] as number).toBeCloseTo(i - (L - 1) / 2, 9);
    }
  });

  it('returns nulls when length < 1', () => {
    expect(
      applyLineIchimokuDivergenceCrossRangeMidpoint(
        [1, 2, 3],
        [0, 1, 2],
        0,
      ).every((v) => v === null),
    ).toBe(true);
  });
});

describe('computeLineIchimokuDivergenceCross CONST band', () => {
  it('all spans = K, midpoint = K from warmup', () => {
    const data = buildConstBand(80, 50);
    const out = computeLineIchimokuDivergenceCross(data);
    for (let i = WARMUP; i < 80; i += 1) {
      expect(out.tenkan[i] as number).toBeCloseTo(50, 9);
      expect(out.kijun[i] as number).toBeCloseTo(50, 9);
      expect(out.senkouA[i] as number).toBeCloseTo(50, 9);
      expect(out.senkouB[i] as number).toBeCloseTo(50, 9);
      expect(out.midpoint[i] as number).toBeCloseTo(50, 9);
    }
  });
});

describe('computeLineIchimokuDivergenceCross LINEAR UP', () => {
  it('Tenkan = i-4, Kijun = i-12.5, SenkouA = i-8.25, SenkouB = i-25.5, midpoint = i-16.875', () => {
    const data = buildLinearUp(80);
    const out = computeLineIchimokuDivergenceCross(data);
    for (let i = WARMUP; i < 80; i += 1) {
      expect(out.tenkan[i] as number).toBeCloseTo(i - 4, 9);
      expect(out.kijun[i] as number).toBeCloseTo(i - 12.5, 9);
      expect(out.senkouA[i] as number).toBeCloseTo(i - 8.25, 9);
      expect(out.senkouB[i] as number).toBeCloseTo(i - 25.5, 9);
      expect(out.midpoint[i] as number).toBeCloseTo(i - KUMO_LAG, 9);
    }
  });
});

describe('computeLineIchimokuDivergenceCross LINEAR DOWN', () => {
  it('midpoint = -i + 16.875 from warmup', () => {
    const data = buildLinearDown(80);
    const out = computeLineIchimokuDivergenceCross(data);
    for (let i = WARMUP; i < 80; i += 1) {
      expect(out.midpoint[i] as number).toBeCloseTo(-i + KUMO_LAG, 9);
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineIchimokuDivergenceCross([])).toEqual({
      tenkan: [],
      kijun: [],
      senkouA: [],
      senkouB: [],
      midpoint: [],
    });
  });
});

describe('classifyLineIchimokuDivergenceCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineIchimokuDivergenceCrossRegime(null, 1, 5, 4)).toBe(
      'none',
    );
  });
  it('priceUp + kumoUp -> aligned-bullish', () => {
    expect(classifyLineIchimokuDivergenceCrossRegime(2, 1, 5, 4)).toBe(
      'aligned-bullish',
    );
  });
  it('priceDown + kumoDown -> aligned-bearish', () => {
    expect(classifyLineIchimokuDivergenceCrossRegime(1, 2, 4, 5)).toBe(
      'aligned-bearish',
    );
  });
  it('priceDown + kumoUp -> divergent-bullish', () => {
    expect(classifyLineIchimokuDivergenceCrossRegime(1, 2, 5, 4)).toBe(
      'divergent-bullish',
    );
  });
  it('priceUp + kumoDown -> divergent-bearish', () => {
    expect(classifyLineIchimokuDivergenceCrossRegime(2, 1, 4, 5)).toBe(
      'divergent-bearish',
    );
  });
  it('flat sides -> none', () => {
    expect(classifyLineIchimokuDivergenceCrossRegime(1, 1, 5, 4)).toBe(
      'none',
    );
    expect(classifyLineIchimokuDivergenceCrossRegime(2, 1, 5, 5)).toBe(
      'none',
    );
  });
});

describe('classifyLineIchimokuDivergenceCrossBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineIchimokuDivergenceCrossBias(60, 50)).toBe('up');
    expect(classifyLineIchimokuDivergenceCrossBias(40, 50)).toBe('down');
    expect(classifyLineIchimokuDivergenceCrossBias(50, 50)).toBe('flat');
    expect(classifyLineIchimokuDivergenceCrossBias(null, 50)).toBe('none');
  });
});

describe('detectLineIchimokuDivergenceCrossCrosses', () => {
  it('fires bullish on transition into divergent-bullish', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const regimes: ChartLineIchimokuDivergenceCrossRegime[] = [
      'aligned-bullish',
      'aligned-bullish',
      'divergent-bullish',
      'divergent-bullish',
    ];
    const midpoint: Array<number | null> = [1, 2, 3, 4];
    const out = detectLineIchimokuDivergenceCrossCrosses(
      series,
      regimes,
      midpoint,
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
    const regimes: ChartLineIchimokuDivergenceCrossRegime[] = [
      'aligned-bullish',
      'aligned-bullish',
      'divergent-bearish',
      'divergent-bearish',
    ];
    const midpoint: Array<number | null> = [4, 3, 2, 1];
    const out = detectLineIchimokuDivergenceCrossCrosses(
      series,
      regimes,
      midpoint,
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
    const regimes: ChartLineIchimokuDivergenceCrossRegime[] = [
      'none',
      'divergent-bullish',
      'divergent-bullish',
      'divergent-bullish',
      'aligned-bullish',
    ];
    const midpoint: Array<number | null> = [1, 2, 3, 4, 5];
    const out = detectLineIchimokuDivergenceCrossCrosses(
      series,
      regimes,
      midpoint,
    );
    expect(out).toHaveLength(1);
  });
});

describe('runLineIchimokuDivergenceCross CONST band', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST band ${K}: midpoint=K, all none, 0 triggers`, () => {
      const data = buildConstBand(80, K);
      const run = runLineIchimokuDivergenceCross(data);
      expect(run.tenkanLength).toBe(TENKAN);
      expect(run.kijunLength).toBe(KIJUN);
      expect(run.senkouBLength).toBe(SENKOU_B);
      for (let i = 0; i < WARMUP; i += 1) {
        expect(run.midpointValues[i]).toBeNull();
      }
      for (let i = WARMUP; i < 80; i += 1) {
        expect(run.midpointValues[i] as number).toBeCloseTo(K, 9);
      }
      expect(run.alignedBullishCount).toBe(0);
      expect(run.alignedBearishCount).toBe(0);
      expect(run.divergentBullishCount).toBe(0);
      expect(run.divergentBearishCount).toBe(0);
      expect(run.noneCount).toBe(80);
      expect(run.crosses).toHaveLength(0);
      expect(run.ok).toBe(true);
    });
  }
});

describe('runLineIchimokuDivergenceCross LINEAR UP', () => {
  it('LINEAR UP: midpoint=i-16.875, all aligned-bullish from warmup+1', () => {
    const data = buildLinearUp(80);
    const run = runLineIchimokuDivergenceCross(data);
    for (let i = WARMUP + 1; i < 80; i += 1) {
      expect(run.samples[i]?.regime).toBe('aligned-bullish');
      expect(run.midpointValues[i] as number).toBeCloseTo(
        i - KUMO_LAG,
        9,
      );
    }
    expect(run.alignedBullishCount).toBe(80 - WARMUP - 1);
    expect(run.alignedBearishCount).toBe(0);
    expect(run.divergentBullishCount).toBe(0);
    expect(run.divergentBearishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineIchimokuDivergenceCross LINEAR DOWN', () => {
  it('LINEAR DOWN: midpoint=-i+16.875, all aligned-bearish from warmup+1', () => {
    const data = buildLinearDown(80);
    const run = runLineIchimokuDivergenceCross(data);
    for (let i = WARMUP + 1; i < 80; i += 1) {
      expect(run.samples[i]?.regime).toBe('aligned-bearish');
      expect(run.midpointValues[i] as number).toBeCloseTo(
        -i + KUMO_LAG,
        9,
      );
    }
    expect(run.alignedBearishCount).toBe(80 - WARMUP - 1);
    expect(run.alignedBullishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineIchimokuDivergenceCross misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineIchimokuDivergenceCrossPoint[] = [
      { x: 2, high: 1, low: 0, close: 0.5 },
      { x: 0, high: 1, low: 0, close: 0.5 },
      { x: 1, high: 1, low: 0, close: 0.5 },
    ];
    const run = runLineIchimokuDivergenceCross(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConstBand(51, 50);
    const run = runLineIchimokuDivergenceCross(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineIchimokuDivergenceCross([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom tuning', () => {
    const data = buildLinearUp(80);
    const run = runLineIchimokuDivergenceCross(data, {
      tenkanLength: 7,
      kijunLength: 14,
      senkouBLength: 28,
    });
    expect(run.tenkanLength).toBe(7);
    expect(run.kijunLength).toBe(14);
    expect(run.senkouBLength).toBe(28);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(80);
    const run = runLineIchimokuDivergenceCross(data);
    expect(
      run.alignedBullishCount +
        run.alignedBearishCount +
        run.divergentBullishCount +
        run.divergentBearishCount +
        run.noneCount,
    ).toBe(80);
  });
});

describe('computeLineIchimokuDivergenceCrossLayout', () => {
  it('renders SVG paths for LINEAR UP', () => {
    const data = buildLinearUp(80);
    const layout = computeLineIchimokuDivergenceCrossLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(80);
    expect(layout.kumoPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineIchimokuDivergenceCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.kumoPath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineIchimokuDivergenceCrossLayout({
      data: buildLinearUp(80),
      width: 600,
      height: 320,
      padding: 32,
      panelGap: 8,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(320);
  });

  it('pads degenerate priceMin === priceMax', () => {
    const data = buildConstBand(80, 100);
    const layout = computeLineIchimokuDivergenceCrossLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });
});

describe('describeLineIchimokuDivergenceCrossChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineIchimokuDivergenceCrossChart([])).toBe('No data');
  });

  it('mentions bar count, tenkan/kijun/senkouB, cloud reversal', () => {
    const desc = describeLineIchimokuDivergenceCrossChart(buildLinearUp(80));
    expect(desc).toContain('80 bars');
    expect(desc).toContain('tenkan 9');
    expect(desc).toContain('kijun 26');
    expect(desc).toContain('senkouB 52');
    expect(desc).toContain('cloud reversal');
    expect(desc).toContain('bias coloring');
  });
});

describe('<ChartLineIchimokuDivergenceCross /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineIchimokuDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-ichimoku-divergence-cross"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-tenkan-length')).toBe(String(TENKAN));
    expect(root?.getAttribute('data-kijun-length')).toBe(String(KIJUN));
    expect(root?.getAttribute('data-senkou-b-length')).toBe(
      String(SENKOU_B),
    );
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(
      <ChartLineIchimokuDivergenceCross data={[]} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ichimoku-divergence-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders kumo midpoint path', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineIchimokuDivergenceCross data={data} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ichimoku-divergence-cross-kumo-path"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineIchimokuDivergenceCross data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ichimoku-divergence-cross-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineIchimokuDivergenceCross data={data} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-ichimoku-divergence-cross-badge"]',
    );
    expect(badge?.textContent).toContain('tenkan 9');
    expect(badge?.textContent).toContain('kijun 26');
    expect(badge?.textContent).toContain('senkouB 52');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineIchimokuDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-ichimoku-divergence-cross"]',
    );
    expect(root?.getAttribute('aria-label')).toBe(
      'Ichimoku cloud divergence chart',
    );
  });

  it('exposes data-*-count counters for LINEAR UP', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineIchimokuDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-ichimoku-divergence-cross"]',
    );
    expect(root?.getAttribute('data-aligned-bullish-count')).toBe(
      String(80 - WARMUP - 1),
    );
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineIchimokuDivergenceCross
        data={data}
        hiddenSeries={['kumo']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ichimoku-divergence-cross-kumo-path"]',
      ),
    ).toBeNull();
  });
});
