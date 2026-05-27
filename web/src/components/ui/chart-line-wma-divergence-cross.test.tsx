import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineWmaDivergenceCross,
  DEFAULT_CHART_LINE_WMA_DIVERGENCE_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_WMA_DIVERGENCE_CROSS_PADDING,
  DEFAULT_CHART_LINE_WMA_DIVERGENCE_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_WMA_DIVERGENCE_CROSS_PERIOD,
  DEFAULT_CHART_LINE_WMA_DIVERGENCE_CROSS_WIDTH,
  applyLineWmaDivergenceCrossWma,
  classifyLineWmaDivergenceCrossBias,
  classifyLineWmaDivergenceCrossRegime,
  computeLineWmaDivergenceCross,
  computeLineWmaDivergenceCrossLayout,
  describeLineWmaDivergenceCrossChart,
  detectLineWmaDivergenceCrossCrosses,
  getLineWmaDivergenceCrossFinitePoints,
  normalizeLineWmaDivergenceCrossLength,
  runLineWmaDivergenceCross,
  type ChartLineWmaDivergenceCrossPoint,
  type ChartLineWmaDivergenceCrossRegime,
} from './chart-line-wma-divergence-cross';

const PERIOD = 14;
const WARMUP = PERIOD - 1; // 13, first valid WMA
const WMA_LAG = (PERIOD - 1) / 3; // 13/3

const buildConst = (
  n: number,
  k: number,
): ChartLineWmaDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: k }));

const buildLinearUp = (n: number): ChartLineWmaDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: i }));

const buildLinearDown = (n: number): ChartLineWmaDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: -i }));

describe('ChartLineWmaDivergenceCross defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_WMA_DIVERGENCE_CROSS_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_WMA_DIVERGENCE_CROSS_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_WMA_DIVERGENCE_CROSS_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_WMA_DIVERGENCE_CROSS_PANEL_GAP).toBe(12);
  });

  it('exports canonical WMA tuning', () => {
    expect(DEFAULT_CHART_LINE_WMA_DIVERGENCE_CROSS_PERIOD).toBe(14);
  });
});

describe('getLineWmaDivergenceCrossFinitePoints', () => {
  it('filters NaN/Infinity', () => {
    const points = [
      { x: 0, close: 1 },
      { x: NaN, close: 2 },
      { x: 2, close: Infinity },
      { x: 3, close: 4 },
    ];
    expect(getLineWmaDivergenceCrossFinitePoints(points)).toEqual([
      { x: 0, close: 1 },
      { x: 3, close: 4 },
    ]);
  });

  it('returns empty for null and non-array', () => {
    expect(getLineWmaDivergenceCrossFinitePoints(null)).toEqual([]);
    expect(getLineWmaDivergenceCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineWmaDivergenceCrossFinitePoints(
        // @ts-expect-error -- intentionally bad
        'oops',
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineWmaDivergenceCrossLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineWmaDivergenceCrossLength(14.7, 14)).toBe(14);
    expect(normalizeLineWmaDivergenceCrossLength(0, 14)).toBe(14);
    expect(normalizeLineWmaDivergenceCrossLength(NaN, 14)).toBe(14);
  });
});

describe('applyLineWmaDivergenceCrossWma', () => {
  it('CONST returns constant', () => {
    const values: Array<number | null> = Array.from({ length: 30 }, () => 7);
    const wma = applyLineWmaDivergenceCrossWma(values, PERIOD);
    for (let i = WARMUP; i < 30; i += 1) expect(wma[i]).toBe(7);
  });

  it('LINEAR returns i - (L-1)/3', () => {
    const values: Array<number | null> = Array.from(
      { length: 40 },
      (_, i) => i,
    );
    const wma = applyLineWmaDivergenceCrossWma(values, PERIOD);
    for (let i = WARMUP; i < 40; i += 1) {
      expect(wma[i] as number).toBeCloseTo(i - WMA_LAG, 9);
    }
  });

  it('returns nulls when length < 1', () => {
    expect(
      applyLineWmaDivergenceCrossWma([1, 2, 3], 0).every((v) => v === null),
    ).toBe(true);
  });

  it('null gap aborts windows that touch it', () => {
    const wma = applyLineWmaDivergenceCrossWma([1, 1, null, 1, 1, 1], 3);
    expect(wma[1]).toBeNull();
    expect(wma[2]).toBeNull();
    expect(wma[3]).toBeNull();
    expect(wma[4]).toBeNull();
    expect(wma[5]).toBe(1);
  });
});

describe('computeLineWmaDivergenceCross CONST', () => {
  it('WMA = K from warmup', () => {
    const data = buildConst(40, 50);
    const out = computeLineWmaDivergenceCross(data);
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.wma[i] as number).toBeCloseTo(50, 9);
    }
  });
});

describe('computeLineWmaDivergenceCross LINEAR UP', () => {
  it('WMA = i - 13/3 from warmup', () => {
    const data = buildLinearUp(40);
    const out = computeLineWmaDivergenceCross(data);
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.wma[i] as number).toBeCloseTo(i - WMA_LAG, 9);
    }
  });
});

describe('computeLineWmaDivergenceCross LINEAR DOWN', () => {
  it('WMA = -i + 13/3 from warmup', () => {
    const data = buildLinearDown(40);
    const out = computeLineWmaDivergenceCross(data);
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.wma[i] as number).toBeCloseTo(-i + WMA_LAG, 9);
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineWmaDivergenceCross([])).toEqual({ wma: [] });
  });
});

describe('classifyLineWmaDivergenceCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineWmaDivergenceCrossRegime(null, 1, 5, 4)).toBe('none');
  });
  it('priceUp + wmaUp -> aligned-bullish', () => {
    expect(classifyLineWmaDivergenceCrossRegime(2, 1, 5, 4)).toBe(
      'aligned-bullish',
    );
  });
  it('priceDown + wmaDown -> aligned-bearish', () => {
    expect(classifyLineWmaDivergenceCrossRegime(1, 2, 4, 5)).toBe(
      'aligned-bearish',
    );
  });
  it('priceDown + wmaUp -> divergent-bullish', () => {
    expect(classifyLineWmaDivergenceCrossRegime(1, 2, 5, 4)).toBe(
      'divergent-bullish',
    );
  });
  it('priceUp + wmaDown -> divergent-bearish', () => {
    expect(classifyLineWmaDivergenceCrossRegime(2, 1, 4, 5)).toBe(
      'divergent-bearish',
    );
  });
  it('flat sides -> none', () => {
    expect(classifyLineWmaDivergenceCrossRegime(1, 1, 5, 4)).toBe('none');
    expect(classifyLineWmaDivergenceCrossRegime(2, 1, 5, 5)).toBe('none');
  });
});

describe('classifyLineWmaDivergenceCrossBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineWmaDivergenceCrossBias(60, 50)).toBe('up');
    expect(classifyLineWmaDivergenceCrossBias(40, 50)).toBe('down');
    expect(classifyLineWmaDivergenceCrossBias(50, 50)).toBe('flat');
    expect(classifyLineWmaDivergenceCrossBias(null, 50)).toBe('none');
  });
});

describe('detectLineWmaDivergenceCrossCrosses', () => {
  it('fires bullish on transition into divergent-bullish', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const regimes: ChartLineWmaDivergenceCrossRegime[] = [
      'aligned-bullish',
      'aligned-bullish',
      'divergent-bullish',
      'divergent-bullish',
    ];
    const wma: Array<number | null> = [1, 2, 3, 4];
    const out = detectLineWmaDivergenceCrossCrosses(series, regimes, wma);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
    expect(out[0]?.index).toBe(2);
  });

  it('fires bearish on transition into divergent-bearish', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const regimes: ChartLineWmaDivergenceCrossRegime[] = [
      'aligned-bullish',
      'aligned-bullish',
      'divergent-bearish',
      'divergent-bearish',
    ];
    const wma: Array<number | null> = [4, 3, 2, 1];
    const out = detectLineWmaDivergenceCrossCrosses(series, regimes, wma);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
  });

  it('does not double-fire while in same divergent state', () => {
    const series = Array.from({ length: 5 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const regimes: ChartLineWmaDivergenceCrossRegime[] = [
      'none',
      'divergent-bullish',
      'divergent-bullish',
      'divergent-bullish',
      'aligned-bullish',
    ];
    const wma: Array<number | null> = [1, 2, 3, 4, 5];
    const out = detectLineWmaDivergenceCrossCrosses(series, regimes, wma);
    expect(out).toHaveLength(1);
  });
});

describe('runLineWmaDivergenceCross CONST K', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST close=${K}: WMA=K, all none, 0 triggers`, () => {
      const data = buildConst(60, K);
      const run = runLineWmaDivergenceCross(data);
      expect(run.period).toBe(PERIOD);
      for (let i = 0; i < WARMUP; i += 1) {
        expect(run.wmaValues[i]).toBeNull();
      }
      for (let i = WARMUP; i < 60; i += 1) {
        expect(run.wmaValues[i] as number).toBeCloseTo(K, 9);
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

describe('runLineWmaDivergenceCross LINEAR UP', () => {
  it('LINEAR UP: WMA=i-13/3, all aligned-bullish from warmup+1', () => {
    const data = buildLinearUp(60);
    const run = runLineWmaDivergenceCross(data);
    for (let i = WARMUP + 1; i < 60; i += 1) {
      expect(run.samples[i]?.regime).toBe('aligned-bullish');
      expect(run.wmaValues[i] as number).toBeCloseTo(i - WMA_LAG, 9);
    }
    expect(run.alignedBullishCount).toBe(60 - WARMUP - 1);
    expect(run.alignedBearishCount).toBe(0);
    expect(run.divergentBullishCount).toBe(0);
    expect(run.divergentBearishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineWmaDivergenceCross LINEAR DOWN', () => {
  it('LINEAR DOWN: WMA=-i+13/3, all aligned-bearish from warmup+1', () => {
    const data = buildLinearDown(60);
    const run = runLineWmaDivergenceCross(data);
    for (let i = WARMUP + 1; i < 60; i += 1) {
      expect(run.samples[i]?.regime).toBe('aligned-bearish');
      expect(run.wmaValues[i] as number).toBeCloseTo(-i + WMA_LAG, 9);
    }
    expect(run.alignedBearishCount).toBe(60 - WARMUP - 1);
    expect(run.alignedBullishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineWmaDivergenceCross misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineWmaDivergenceCrossPoint[] = [
      { x: 2, close: 1 },
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    const run = runLineWmaDivergenceCross(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConst(13, 50);
    const run = runLineWmaDivergenceCross(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineWmaDivergenceCross([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom period', () => {
    const data = buildLinearUp(60);
    const run = runLineWmaDivergenceCross(data, { period: 7 });
    expect(run.period).toBe(7);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(60);
    const run = runLineWmaDivergenceCross(data);
    expect(
      run.alignedBullishCount +
        run.alignedBearishCount +
        run.divergentBullishCount +
        run.divergentBearishCount +
        run.noneCount,
    ).toBe(60);
  });
});

describe('computeLineWmaDivergenceCrossLayout', () => {
  it('renders SVG paths for LINEAR UP', () => {
    const data = buildLinearUp(60);
    const layout = computeLineWmaDivergenceCrossLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(60);
    expect(layout.wmaPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineWmaDivergenceCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.wmaPath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineWmaDivergenceCrossLayout({
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
    const layout = computeLineWmaDivergenceCrossLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });
});

describe('describeLineWmaDivergenceCrossChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineWmaDivergenceCrossChart([])).toBe('No data');
  });

  it('mentions bar count, period, recent-emphasis reversal', () => {
    const desc = describeLineWmaDivergenceCrossChart(buildLinearUp(60));
    expect(desc).toContain('60 bars');
    expect(desc).toContain('period 14');
    expect(desc).toContain('recent-emphasis');
    expect(desc).toContain('reversal');
    expect(desc).toContain('bias coloring');
  });
});

describe('<ChartLineWmaDivergenceCross /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineWmaDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-wma-divergence-cross"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-period')).toBe(String(PERIOD));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(<ChartLineWmaDivergenceCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-wma-divergence-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders WMA path', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineWmaDivergenceCross data={data} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-wma-divergence-cross-wma-path"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineWmaDivergenceCross data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-wma-divergence-cross-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineWmaDivergenceCross data={data} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-wma-divergence-cross-badge"]',
    );
    expect(badge?.textContent).toContain('period 14');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineWmaDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-wma-divergence-cross"]',
    );
    expect(root?.getAttribute('aria-label')).toBe('WMA divergence chart');
  });

  it('exposes data-*-count counters for LINEAR UP', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineWmaDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-wma-divergence-cross"]',
    );
    expect(root?.getAttribute('data-aligned-bullish-count')).toBe(
      String(60 - WARMUP - 1),
    );
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineWmaDivergenceCross data={data} hiddenSeries={['wma']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-wma-divergence-cross-wma-path"]',
      ),
    ).toBeNull();
  });
});
