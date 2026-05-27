import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineSmaDivergenceCross,
  DEFAULT_CHART_LINE_SMA_DIVERGENCE_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_SMA_DIVERGENCE_CROSS_PADDING,
  DEFAULT_CHART_LINE_SMA_DIVERGENCE_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_SMA_DIVERGENCE_CROSS_PERIOD,
  DEFAULT_CHART_LINE_SMA_DIVERGENCE_CROSS_WIDTH,
  applyLineSmaDivergenceCrossSma,
  classifyLineSmaDivergenceCrossBias,
  classifyLineSmaDivergenceCrossRegime,
  computeLineSmaDivergenceCross,
  computeLineSmaDivergenceCrossLayout,
  describeLineSmaDivergenceCrossChart,
  detectLineSmaDivergenceCrossCrosses,
  getLineSmaDivergenceCrossFinitePoints,
  normalizeLineSmaDivergenceCrossLength,
  runLineSmaDivergenceCross,
  type ChartLineSmaDivergenceCrossPoint,
  type ChartLineSmaDivergenceCrossRegime,
} from './chart-line-sma-divergence-cross';

const PERIOD = 14;
const WARMUP = PERIOD - 1; // 13, first valid SMA
const SMA_LAG = (PERIOD - 1) / 2; // 6.5

const buildConst = (
  n: number,
  k: number,
): ChartLineSmaDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: k }));

const buildLinearUp = (n: number): ChartLineSmaDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: i }));

const buildLinearDown = (n: number): ChartLineSmaDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: -i }));

describe('ChartLineSmaDivergenceCross defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_SMA_DIVERGENCE_CROSS_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_SMA_DIVERGENCE_CROSS_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_SMA_DIVERGENCE_CROSS_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_SMA_DIVERGENCE_CROSS_PANEL_GAP).toBe(12);
  });

  it('exports canonical SMA tuning', () => {
    expect(DEFAULT_CHART_LINE_SMA_DIVERGENCE_CROSS_PERIOD).toBe(14);
  });
});

describe('getLineSmaDivergenceCrossFinitePoints', () => {
  it('filters NaN/Infinity', () => {
    const points = [
      { x: 0, close: 1 },
      { x: NaN, close: 2 },
      { x: 2, close: Infinity },
      { x: 3, close: 4 },
    ];
    expect(getLineSmaDivergenceCrossFinitePoints(points)).toEqual([
      { x: 0, close: 1 },
      { x: 3, close: 4 },
    ]);
  });

  it('returns empty for null and non-array', () => {
    expect(getLineSmaDivergenceCrossFinitePoints(null)).toEqual([]);
    expect(getLineSmaDivergenceCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineSmaDivergenceCrossFinitePoints(
        // @ts-expect-error -- intentionally bad
        'oops',
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineSmaDivergenceCrossLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineSmaDivergenceCrossLength(14.7, 14)).toBe(14);
    expect(normalizeLineSmaDivergenceCrossLength(0, 14)).toBe(14);
    expect(normalizeLineSmaDivergenceCrossLength(NaN, 14)).toBe(14);
  });
});

describe('applyLineSmaDivergenceCrossSma', () => {
  it('CONST returns constant', () => {
    const values: Array<number | null> = Array.from({ length: 30 }, () => 7);
    const sma = applyLineSmaDivergenceCrossSma(values, PERIOD);
    for (let i = WARMUP; i < 30; i += 1) expect(sma[i]).toBe(7);
  });

  it('LINEAR returns i - (L-1)/2', () => {
    const values: Array<number | null> = Array.from(
      { length: 40 },
      (_, i) => i,
    );
    const sma = applyLineSmaDivergenceCrossSma(values, PERIOD);
    for (let i = WARMUP; i < 40; i += 1) {
      expect(sma[i] as number).toBeCloseTo(i - SMA_LAG, 9);
    }
  });

  it('returns nulls when length < 1', () => {
    expect(
      applyLineSmaDivergenceCrossSma([1, 2, 3], 0).every((v) => v === null),
    ).toBe(true);
  });

  it('length 1 returns values verbatim', () => {
    const out = applyLineSmaDivergenceCrossSma([1, 2, 3, null, 5], 1);
    expect(out).toEqual([1, 2, 3, null, 5]);
  });
});

describe('computeLineSmaDivergenceCross CONST', () => {
  it('SMA = K from warmup', () => {
    const data = buildConst(40, 50);
    const out = computeLineSmaDivergenceCross(data);
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.sma[i] as number).toBeCloseTo(50, 9);
    }
  });
});

describe('computeLineSmaDivergenceCross LINEAR UP', () => {
  it('SMA = i - 6.5 from warmup', () => {
    const data = buildLinearUp(40);
    const out = computeLineSmaDivergenceCross(data);
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.sma[i] as number).toBeCloseTo(i - SMA_LAG, 9);
    }
  });
});

describe('computeLineSmaDivergenceCross LINEAR DOWN', () => {
  it('SMA = -i + 6.5 from warmup', () => {
    const data = buildLinearDown(40);
    const out = computeLineSmaDivergenceCross(data);
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.sma[i] as number).toBeCloseTo(-i + SMA_LAG, 9);
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineSmaDivergenceCross([])).toEqual({ sma: [] });
  });
});

describe('classifyLineSmaDivergenceCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineSmaDivergenceCrossRegime(null, 1, 5, 4)).toBe('none');
  });
  it('priceUp + smaUp -> aligned-bullish', () => {
    expect(classifyLineSmaDivergenceCrossRegime(2, 1, 5, 4)).toBe(
      'aligned-bullish',
    );
  });
  it('priceDown + smaDown -> aligned-bearish', () => {
    expect(classifyLineSmaDivergenceCrossRegime(1, 2, 4, 5)).toBe(
      'aligned-bearish',
    );
  });
  it('priceDown + smaUp -> divergent-bullish', () => {
    expect(classifyLineSmaDivergenceCrossRegime(1, 2, 5, 4)).toBe(
      'divergent-bullish',
    );
  });
  it('priceUp + smaDown -> divergent-bearish', () => {
    expect(classifyLineSmaDivergenceCrossRegime(2, 1, 4, 5)).toBe(
      'divergent-bearish',
    );
  });
  it('flat sides -> none', () => {
    expect(classifyLineSmaDivergenceCrossRegime(1, 1, 5, 4)).toBe('none');
    expect(classifyLineSmaDivergenceCrossRegime(2, 1, 5, 5)).toBe('none');
  });
});

describe('classifyLineSmaDivergenceCrossBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineSmaDivergenceCrossBias(60, 50)).toBe('up');
    expect(classifyLineSmaDivergenceCrossBias(40, 50)).toBe('down');
    expect(classifyLineSmaDivergenceCrossBias(50, 50)).toBe('flat');
    expect(classifyLineSmaDivergenceCrossBias(null, 50)).toBe('none');
  });
});

describe('detectLineSmaDivergenceCrossCrosses', () => {
  it('fires bullish on transition into divergent-bullish', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const regimes: ChartLineSmaDivergenceCrossRegime[] = [
      'aligned-bullish',
      'aligned-bullish',
      'divergent-bullish',
      'divergent-bullish',
    ];
    const sma: Array<number | null> = [1, 2, 3, 4];
    const out = detectLineSmaDivergenceCrossCrosses(series, regimes, sma);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
    expect(out[0]?.index).toBe(2);
  });

  it('fires bearish on transition into divergent-bearish', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const regimes: ChartLineSmaDivergenceCrossRegime[] = [
      'aligned-bullish',
      'aligned-bullish',
      'divergent-bearish',
      'divergent-bearish',
    ];
    const sma: Array<number | null> = [4, 3, 2, 1];
    const out = detectLineSmaDivergenceCrossCrosses(series, regimes, sma);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
  });

  it('does not double-fire while in same divergent state', () => {
    const series = Array.from({ length: 5 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const regimes: ChartLineSmaDivergenceCrossRegime[] = [
      'none',
      'divergent-bullish',
      'divergent-bullish',
      'divergent-bullish',
      'aligned-bullish',
    ];
    const sma: Array<number | null> = [1, 2, 3, 4, 5];
    const out = detectLineSmaDivergenceCrossCrosses(series, regimes, sma);
    expect(out).toHaveLength(1);
  });
});

describe('runLineSmaDivergenceCross CONST K', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST close=${K}: SMA=K, all none, 0 triggers`, () => {
      const data = buildConst(60, K);
      const run = runLineSmaDivergenceCross(data);
      expect(run.period).toBe(PERIOD);
      for (let i = 0; i < WARMUP; i += 1) {
        expect(run.smaValues[i]).toBeNull();
      }
      for (let i = WARMUP; i < 60; i += 1) {
        expect(run.smaValues[i] as number).toBeCloseTo(K, 9);
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

describe('runLineSmaDivergenceCross LINEAR UP', () => {
  it('LINEAR UP: SMA=i-6.5, all aligned-bullish from warmup+1', () => {
    const data = buildLinearUp(60);
    const run = runLineSmaDivergenceCross(data);
    for (let i = WARMUP + 1; i < 60; i += 1) {
      expect(run.samples[i]?.regime).toBe('aligned-bullish');
      expect(run.smaValues[i] as number).toBeCloseTo(i - SMA_LAG, 9);
    }
    expect(run.alignedBullishCount).toBe(60 - WARMUP - 1);
    expect(run.alignedBearishCount).toBe(0);
    expect(run.divergentBullishCount).toBe(0);
    expect(run.divergentBearishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineSmaDivergenceCross LINEAR DOWN', () => {
  it('LINEAR DOWN: SMA=-i+6.5, all aligned-bearish from warmup+1', () => {
    const data = buildLinearDown(60);
    const run = runLineSmaDivergenceCross(data);
    for (let i = WARMUP + 1; i < 60; i += 1) {
      expect(run.samples[i]?.regime).toBe('aligned-bearish');
      expect(run.smaValues[i] as number).toBeCloseTo(-i + SMA_LAG, 9);
    }
    expect(run.alignedBearishCount).toBe(60 - WARMUP - 1);
    expect(run.alignedBullishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineSmaDivergenceCross misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineSmaDivergenceCrossPoint[] = [
      { x: 2, close: 1 },
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    const run = runLineSmaDivergenceCross(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConst(13, 50);
    const run = runLineSmaDivergenceCross(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineSmaDivergenceCross([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom period', () => {
    const data = buildLinearUp(60);
    const run = runLineSmaDivergenceCross(data, { period: 9 });
    expect(run.period).toBe(9);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(60);
    const run = runLineSmaDivergenceCross(data);
    expect(
      run.alignedBullishCount +
        run.alignedBearishCount +
        run.divergentBullishCount +
        run.divergentBearishCount +
        run.noneCount,
    ).toBe(60);
  });
});

describe('computeLineSmaDivergenceCrossLayout', () => {
  it('renders SVG paths for LINEAR UP', () => {
    const data = buildLinearUp(60);
    const layout = computeLineSmaDivergenceCrossLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(60);
    expect(layout.smaPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineSmaDivergenceCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.smaPath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineSmaDivergenceCrossLayout({
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
    const data = buildConst(60, 100);
    const layout = computeLineSmaDivergenceCrossLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });
});

describe('describeLineSmaDivergenceCrossChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineSmaDivergenceCrossChart([])).toBe('No data');
  });

  it('mentions bar count, period, reversal', () => {
    const desc = describeLineSmaDivergenceCrossChart(buildLinearUp(60));
    expect(desc).toContain('60 bars');
    expect(desc).toContain('period 14');
    expect(desc).toContain('reversal');
    expect(desc).toContain('bias coloring');
  });
});

describe('<ChartLineSmaDivergenceCross /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineSmaDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-sma-divergence-cross"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-period')).toBe(String(PERIOD));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(<ChartLineSmaDivergenceCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-sma-divergence-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders SMA path', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineSmaDivergenceCross data={data} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-sma-divergence-cross-sma-path"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineSmaDivergenceCross data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-sma-divergence-cross-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineSmaDivergenceCross data={data} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-sma-divergence-cross-badge"]',
    );
    expect(badge?.textContent).toContain('period 14');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineSmaDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-sma-divergence-cross"]',
    );
    expect(root?.getAttribute('aria-label')).toBe('SMA divergence chart');
  });

  it('exposes data-*-count counters for LINEAR UP', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineSmaDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-sma-divergence-cross"]',
    );
    expect(root?.getAttribute('data-aligned-bullish-count')).toBe(
      String(60 - WARMUP - 1),
    );
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineSmaDivergenceCross data={data} hiddenSeries={['sma']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-sma-divergence-cross-sma-path"]',
      ),
    ).toBeNull();
  });
});
