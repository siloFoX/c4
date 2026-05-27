import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineVwapDivergenceCross,
  DEFAULT_CHART_LINE_VWAP_DIVERGENCE_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_VWAP_DIVERGENCE_CROSS_PADDING,
  DEFAULT_CHART_LINE_VWAP_DIVERGENCE_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_VWAP_DIVERGENCE_CROSS_PERIOD,
  DEFAULT_CHART_LINE_VWAP_DIVERGENCE_CROSS_WIDTH,
  classifyLineVwapDivergenceCrossBias,
  classifyLineVwapDivergenceCrossRegime,
  computeLineVwapDivergenceCross,
  computeLineVwapDivergenceCrossLayout,
  describeLineVwapDivergenceCrossChart,
  detectLineVwapDivergenceCrossCrosses,
  getLineVwapDivergenceCrossFinitePoints,
  normalizeLineVwapDivergenceCrossLength,
  runLineVwapDivergenceCross,
  type ChartLineVwapDivergenceCrossPoint,
  type ChartLineVwapDivergenceCrossRegime,
} from './chart-line-vwap-divergence-cross';

const PERIOD = 14;
const WARMUP = PERIOD - 1; // 13, first valid VWAP
const VWAP_LAG = (PERIOD - 1) / 2; // 6.5 -- matches SMA centroid when volume constant

const buildConstBand = (
  n: number,
  k: number,
  volume = 1,
): ChartLineVwapDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: k + 1,
    low: k - 1,
    close: k,
    volume,
  }));

const buildLinearUp = (
  n: number,
  volume = 1,
): ChartLineVwapDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: i + 1,
    low: i - 1,
    close: i,
    volume,
  }));

const buildLinearDown = (
  n: number,
  volume = 1,
): ChartLineVwapDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: -i + 1,
    low: -i - 1,
    close: -i,
    volume,
  }));

describe('ChartLineVwapDivergenceCross defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_VWAP_DIVERGENCE_CROSS_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_VWAP_DIVERGENCE_CROSS_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_VWAP_DIVERGENCE_CROSS_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_VWAP_DIVERGENCE_CROSS_PANEL_GAP).toBe(12);
  });

  it('exports canonical VWAP tuning', () => {
    expect(DEFAULT_CHART_LINE_VWAP_DIVERGENCE_CROSS_PERIOD).toBe(14);
  });
});

describe('getLineVwapDivergenceCrossFinitePoints', () => {
  it('filters NaN/Infinity/high<low/negative volume', () => {
    const points = [
      { x: 0, high: 2, low: 1, close: 1.5, volume: 1 },
      { x: NaN, high: 2, low: 1, close: 1.5, volume: 1 },
      { x: 1, high: 1, low: 2, close: 1.5, volume: 1 },
      { x: 2, high: Infinity, low: 1, close: 1.5, volume: 1 },
      { x: 3, high: 4, low: 1, close: 2, volume: 1 },
      { x: 4, high: 4, low: 1, close: 2, volume: -1 },
    ];
    expect(getLineVwapDivergenceCrossFinitePoints(points)).toEqual([
      { x: 0, high: 2, low: 1, close: 1.5, volume: 1 },
      { x: 3, high: 4, low: 1, close: 2, volume: 1 },
    ]);
  });

  it('returns empty for null and non-array', () => {
    expect(getLineVwapDivergenceCrossFinitePoints(null)).toEqual([]);
    expect(getLineVwapDivergenceCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineVwapDivergenceCrossFinitePoints(
        // @ts-expect-error -- intentionally bad
        'oops',
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineVwapDivergenceCrossLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineVwapDivergenceCrossLength(14.7, 14)).toBe(14);
    expect(normalizeLineVwapDivergenceCrossLength(0, 14)).toBe(14);
    expect(normalizeLineVwapDivergenceCrossLength(NaN, 14)).toBe(14);
  });
});

describe('computeLineVwapDivergenceCross CONST', () => {
  it('VWAP = K, typical = K from warmup', () => {
    const data = buildConstBand(40, 50);
    const out = computeLineVwapDivergenceCross(data);
    for (let i = 0; i < 40; i += 1) {
      expect(out.typical[i] as number).toBeCloseTo(50, 9);
    }
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.vwap[i] as number).toBeCloseTo(50, 9);
    }
  });
});

describe('computeLineVwapDivergenceCross LINEAR UP', () => {
  it('typical = i, VWAP = i - 6.5 from warmup', () => {
    const data = buildLinearUp(40);
    const out = computeLineVwapDivergenceCross(data);
    for (let i = 0; i < 40; i += 1) {
      expect(out.typical[i] as number).toBeCloseTo(i, 9);
    }
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.vwap[i] as number).toBeCloseTo(i - VWAP_LAG, 9);
    }
  });
});

describe('computeLineVwapDivergenceCross LINEAR DOWN', () => {
  it('typical = -i, VWAP = -i + 6.5 from warmup', () => {
    const data = buildLinearDown(40);
    const out = computeLineVwapDivergenceCross(data);
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.vwap[i] as number).toBeCloseTo(-i + VWAP_LAG, 9);
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineVwapDivergenceCross([])).toEqual({
      typical: [],
      vwap: [],
    });
  });
});

describe('computeLineVwapDivergenceCross varying volume', () => {
  it('higher recent volume pulls VWAP toward newer prices', () => {
    const data: ChartLineVwapDivergenceCrossPoint[] = Array.from(
      { length: 20 },
      (_, i) => ({
        x: i,
        high: i + 1,
        low: i - 1,
        close: i,
        volume: i === 19 ? 100 : 1,
      }),
    );
    const out = computeLineVwapDivergenceCross(data);
    const vwapAtEnd = out.vwap[19] as number;
    // With constant volume the SMA would be 19 - 6.5 = 12.5. With
    // volume=100 at i=19, the VWAP should be much closer to 19.
    expect(vwapAtEnd).toBeGreaterThan(12.5);
    expect(vwapAtEnd).toBeLessThan(19);
  });

  it('skips windows where volume sum is zero', () => {
    const data: ChartLineVwapDivergenceCrossPoint[] = Array.from(
      { length: 20 },
      (_, i) => ({
        x: i,
        high: i + 1,
        low: i - 1,
        close: i,
        volume: 0,
      }),
    );
    const out = computeLineVwapDivergenceCross(data);
    // All windows have volume sum 0 -> all VWAP values should be null.
    for (let i = WARMUP; i < 20; i += 1) {
      expect(out.vwap[i]).toBeNull();
    }
  });
});

describe('classifyLineVwapDivergenceCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineVwapDivergenceCrossRegime(null, 1, 5, 4)).toBe(
      'none',
    );
  });
  it('priceUp + vwapUp -> aligned-bullish', () => {
    expect(classifyLineVwapDivergenceCrossRegime(2, 1, 5, 4)).toBe(
      'aligned-bullish',
    );
  });
  it('priceDown + vwapDown -> aligned-bearish', () => {
    expect(classifyLineVwapDivergenceCrossRegime(1, 2, 4, 5)).toBe(
      'aligned-bearish',
    );
  });
  it('priceDown + vwapUp -> divergent-bullish', () => {
    expect(classifyLineVwapDivergenceCrossRegime(1, 2, 5, 4)).toBe(
      'divergent-bullish',
    );
  });
  it('priceUp + vwapDown -> divergent-bearish', () => {
    expect(classifyLineVwapDivergenceCrossRegime(2, 1, 4, 5)).toBe(
      'divergent-bearish',
    );
  });
  it('flat sides -> none', () => {
    expect(classifyLineVwapDivergenceCrossRegime(1, 1, 5, 4)).toBe('none');
    expect(classifyLineVwapDivergenceCrossRegime(2, 1, 5, 5)).toBe('none');
  });
});

describe('classifyLineVwapDivergenceCrossBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineVwapDivergenceCrossBias(60, 50)).toBe('up');
    expect(classifyLineVwapDivergenceCrossBias(40, 50)).toBe('down');
    expect(classifyLineVwapDivergenceCrossBias(50, 50)).toBe('flat');
    expect(classifyLineVwapDivergenceCrossBias(null, 50)).toBe('none');
  });
});

describe('detectLineVwapDivergenceCrossCrosses', () => {
  it('fires bullish on transition into divergent-bullish', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
      volume: 1,
    }));
    const regimes: ChartLineVwapDivergenceCrossRegime[] = [
      'aligned-bullish',
      'aligned-bullish',
      'divergent-bullish',
      'divergent-bullish',
    ];
    const vwap: Array<number | null> = [1, 2, 3, 4];
    const out = detectLineVwapDivergenceCrossCrosses(series, regimes, vwap);
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
      volume: 1,
    }));
    const regimes: ChartLineVwapDivergenceCrossRegime[] = [
      'aligned-bullish',
      'aligned-bullish',
      'divergent-bearish',
      'divergent-bearish',
    ];
    const vwap: Array<number | null> = [4, 3, 2, 1];
    const out = detectLineVwapDivergenceCrossCrosses(series, regimes, vwap);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
  });

  it('does not double-fire while in same divergent state', () => {
    const series = Array.from({ length: 5 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
      volume: 1,
    }));
    const regimes: ChartLineVwapDivergenceCrossRegime[] = [
      'none',
      'divergent-bullish',
      'divergent-bullish',
      'divergent-bullish',
      'aligned-bullish',
    ];
    const vwap: Array<number | null> = [1, 2, 3, 4, 5];
    const out = detectLineVwapDivergenceCrossCrosses(series, regimes, vwap);
    expect(out).toHaveLength(1);
  });
});

describe('runLineVwapDivergenceCross CONST K', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST close=${K}, vol=1: VWAP=K, all none, 0 triggers`, () => {
      const data = buildConstBand(60, K);
      const run = runLineVwapDivergenceCross(data);
      expect(run.period).toBe(PERIOD);
      for (let i = 0; i < WARMUP; i += 1) {
        expect(run.vwapValues[i]).toBeNull();
      }
      for (let i = WARMUP; i < 60; i += 1) {
        expect(run.vwapValues[i] as number).toBeCloseTo(K, 9);
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

describe('runLineVwapDivergenceCross LINEAR UP', () => {
  it('LINEAR UP, vol=1: VWAP=i-6.5, all aligned-bullish from warmup+1', () => {
    const data = buildLinearUp(60);
    const run = runLineVwapDivergenceCross(data);
    for (let i = WARMUP + 1; i < 60; i += 1) {
      expect(run.samples[i]?.regime).toBe('aligned-bullish');
      expect(run.vwapValues[i] as number).toBeCloseTo(i - VWAP_LAG, 9);
    }
    expect(run.alignedBullishCount).toBe(60 - WARMUP - 1);
    expect(run.alignedBearishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineVwapDivergenceCross LINEAR DOWN', () => {
  it('LINEAR DOWN, vol=1: VWAP=-i+6.5, all aligned-bearish from warmup+1', () => {
    const data = buildLinearDown(60);
    const run = runLineVwapDivergenceCross(data);
    for (let i = WARMUP + 1; i < 60; i += 1) {
      expect(run.samples[i]?.regime).toBe('aligned-bearish');
      expect(run.vwapValues[i] as number).toBeCloseTo(-i + VWAP_LAG, 9);
    }
    expect(run.alignedBearishCount).toBe(60 - WARMUP - 1);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineVwapDivergenceCross misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineVwapDivergenceCrossPoint[] = [
      { x: 2, high: 1, low: 0, close: 0.5, volume: 1 },
      { x: 0, high: 1, low: 0, close: 0.5, volume: 1 },
      { x: 1, high: 1, low: 0, close: 0.5, volume: 1 },
    ];
    const run = runLineVwapDivergenceCross(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConstBand(13, 50);
    const run = runLineVwapDivergenceCross(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineVwapDivergenceCross([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom period', () => {
    const data = buildLinearUp(60);
    const run = runLineVwapDivergenceCross(data, { period: 9 });
    expect(run.period).toBe(9);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(60);
    const run = runLineVwapDivergenceCross(data);
    expect(
      run.alignedBullishCount +
        run.alignedBearishCount +
        run.divergentBullishCount +
        run.divergentBearishCount +
        run.noneCount,
    ).toBe(60);
  });
});

describe('computeLineVwapDivergenceCrossLayout', () => {
  it('renders SVG paths for LINEAR UP', () => {
    const data = buildLinearUp(60);
    const layout = computeLineVwapDivergenceCrossLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(60);
    expect(layout.vwapPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineVwapDivergenceCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.vwapPath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineVwapDivergenceCrossLayout({
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
    const layout = computeLineVwapDivergenceCrossLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });
});

describe('describeLineVwapDivergenceCrossChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineVwapDivergenceCrossChart([])).toBe('No data');
  });

  it('mentions bar count, period, institutional flow', () => {
    const desc = describeLineVwapDivergenceCrossChart(buildLinearUp(60));
    expect(desc).toContain('60 bars');
    expect(desc).toContain('period 14');
    expect(desc).toContain('institutional flow');
    expect(desc).toContain('bias coloring');
  });
});

describe('<ChartLineVwapDivergenceCross /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineVwapDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-vwap-divergence-cross"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-period')).toBe(String(PERIOD));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(
      <ChartLineVwapDivergenceCross data={[]} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vwap-divergence-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders VWAP path', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineVwapDivergenceCross data={data} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vwap-divergence-cross-vwap-path"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineVwapDivergenceCross data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vwap-divergence-cross-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineVwapDivergenceCross data={data} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-vwap-divergence-cross-badge"]',
    );
    expect(badge?.textContent).toContain('period 14');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineVwapDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-vwap-divergence-cross"]',
    );
    expect(root?.getAttribute('aria-label')).toBe('VWAP divergence chart');
  });

  it('exposes data-*-count counters for LINEAR UP', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineVwapDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-vwap-divergence-cross"]',
    );
    expect(root?.getAttribute('data-aligned-bullish-count')).toBe(
      String(60 - WARMUP - 1),
    );
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineVwapDivergenceCross data={data} hiddenSeries={['vwap']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vwap-divergence-cross-vwap-path"]',
      ),
    ).toBeNull();
  });
});
