import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineEmaDivergenceCross,
  DEFAULT_CHART_LINE_EMA_DIVERGENCE_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_EMA_DIVERGENCE_CROSS_PADDING,
  DEFAULT_CHART_LINE_EMA_DIVERGENCE_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_EMA_DIVERGENCE_CROSS_PERIOD,
  DEFAULT_CHART_LINE_EMA_DIVERGENCE_CROSS_WIDTH,
  applyLineEmaDivergenceCrossEma,
  classifyLineEmaDivergenceCrossBias,
  classifyLineEmaDivergenceCrossRegime,
  computeLineEmaDivergenceCross,
  computeLineEmaDivergenceCrossLayout,
  describeLineEmaDivergenceCrossChart,
  detectLineEmaDivergenceCrossCrosses,
  getLineEmaDivergenceCrossFinitePoints,
  normalizeLineEmaDivergenceCrossLength,
  runLineEmaDivergenceCross,
  type ChartLineEmaDivergenceCrossPoint,
  type ChartLineEmaDivergenceCrossRegime,
} from './chart-line-ema-divergence-cross';

const PERIOD = 14;
const WARMUP = PERIOD - 1; // 13, first valid EMA
const EMA_LAG = (PERIOD - 1) / 2; // 6.5

const buildConst = (
  n: number,
  k: number,
): ChartLineEmaDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: k }));

const buildLinearUp = (n: number): ChartLineEmaDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: i }));

const buildLinearDown = (n: number): ChartLineEmaDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: -i }));

describe('ChartLineEmaDivergenceCross defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_EMA_DIVERGENCE_CROSS_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_EMA_DIVERGENCE_CROSS_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_EMA_DIVERGENCE_CROSS_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_EMA_DIVERGENCE_CROSS_PANEL_GAP).toBe(12);
  });

  it('exports canonical EMA tuning', () => {
    expect(DEFAULT_CHART_LINE_EMA_DIVERGENCE_CROSS_PERIOD).toBe(14);
  });
});

describe('getLineEmaDivergenceCrossFinitePoints', () => {
  it('filters NaN/Infinity', () => {
    const points = [
      { x: 0, close: 1 },
      { x: NaN, close: 2 },
      { x: 2, close: Infinity },
      { x: 3, close: 4 },
    ];
    expect(getLineEmaDivergenceCrossFinitePoints(points)).toEqual([
      { x: 0, close: 1 },
      { x: 3, close: 4 },
    ]);
  });

  it('returns empty for null and non-array', () => {
    expect(getLineEmaDivergenceCrossFinitePoints(null)).toEqual([]);
    expect(getLineEmaDivergenceCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineEmaDivergenceCrossFinitePoints(
        // @ts-expect-error -- intentionally bad
        'oops',
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineEmaDivergenceCrossLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineEmaDivergenceCrossLength(14.7, 14)).toBe(14);
    expect(normalizeLineEmaDivergenceCrossLength(0, 14)).toBe(14);
    expect(normalizeLineEmaDivergenceCrossLength(NaN, 14)).toBe(14);
  });
});

describe('applyLineEmaDivergenceCrossEma', () => {
  it('CONST returns constant', () => {
    const values: Array<number | null> = Array.from({ length: 30 }, () => 7);
    const ema = applyLineEmaDivergenceCrossEma(values, PERIOD);
    for (let i = WARMUP; i < 30; i += 1) expect(ema[i]).toBe(7);
  });

  it('LINEAR UP: settles at i - (period-1)/2 from seed bar', () => {
    const values: Array<number | null> = Array.from(
      { length: 40 },
      (_, i) => i,
    );
    const ema = applyLineEmaDivergenceCrossEma(values, PERIOD);
    for (let i = WARMUP; i < 40; i += 1) {
      expect(ema[i] as number).toBeCloseTo(i - EMA_LAG, 9);
    }
  });

  it('returns nulls when length < 1', () => {
    expect(
      applyLineEmaDivergenceCrossEma([1, 2, 3], 0).every((v) => v === null),
    ).toBe(true);
  });

  it('length 1 returns values verbatim', () => {
    const out = applyLineEmaDivergenceCrossEma([1, 2, 3, null, 5], 1);
    expect(out).toEqual([1, 2, 3, null, 5]);
  });

  it('null gap resets seed', () => {
    const values: Array<number | null> = [1, 1, 1, null, 1, 1, 1];
    const ema = applyLineEmaDivergenceCrossEma(values, 3);
    expect(ema[2]).toBe(1);
    expect(ema[3]).toBeNull();
    expect(ema[4]).toBeNull();
    expect(ema[5]).toBeNull();
    expect(ema[6]).toBe(1);
  });
});

describe('computeLineEmaDivergenceCross CONST', () => {
  it('EMA = K from warmup', () => {
    const data = buildConst(40, 50);
    const out = computeLineEmaDivergenceCross(data);
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.ema[i] as number).toBeCloseTo(50, 9);
    }
  });
});

describe('computeLineEmaDivergenceCross LINEAR UP', () => {
  it('EMA = i - 6.5 from warmup', () => {
    const data = buildLinearUp(40);
    const out = computeLineEmaDivergenceCross(data);
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.ema[i] as number).toBeCloseTo(i - EMA_LAG, 9);
    }
  });
});

describe('computeLineEmaDivergenceCross LINEAR DOWN', () => {
  it('EMA = -i + 6.5 from warmup', () => {
    const data = buildLinearDown(40);
    const out = computeLineEmaDivergenceCross(data);
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.ema[i] as number).toBeCloseTo(-i + EMA_LAG, 9);
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineEmaDivergenceCross([])).toEqual({ ema: [] });
  });
});

describe('classifyLineEmaDivergenceCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineEmaDivergenceCrossRegime(null, 1, 5, 4)).toBe('none');
  });
  it('priceUp + emaUp -> aligned-bullish', () => {
    expect(classifyLineEmaDivergenceCrossRegime(2, 1, 5, 4)).toBe(
      'aligned-bullish',
    );
  });
  it('priceDown + emaDown -> aligned-bearish', () => {
    expect(classifyLineEmaDivergenceCrossRegime(1, 2, 4, 5)).toBe(
      'aligned-bearish',
    );
  });
  it('priceDown + emaUp -> divergent-bullish', () => {
    expect(classifyLineEmaDivergenceCrossRegime(1, 2, 5, 4)).toBe(
      'divergent-bullish',
    );
  });
  it('priceUp + emaDown -> divergent-bearish', () => {
    expect(classifyLineEmaDivergenceCrossRegime(2, 1, 4, 5)).toBe(
      'divergent-bearish',
    );
  });
  it('flat sides -> none', () => {
    expect(classifyLineEmaDivergenceCrossRegime(1, 1, 5, 4)).toBe('none');
    expect(classifyLineEmaDivergenceCrossRegime(2, 1, 5, 5)).toBe('none');
  });
});

describe('classifyLineEmaDivergenceCrossBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineEmaDivergenceCrossBias(60, 50)).toBe('up');
    expect(classifyLineEmaDivergenceCrossBias(40, 50)).toBe('down');
    expect(classifyLineEmaDivergenceCrossBias(50, 50)).toBe('flat');
    expect(classifyLineEmaDivergenceCrossBias(null, 50)).toBe('none');
  });
});

describe('detectLineEmaDivergenceCrossCrosses', () => {
  it('fires bullish on transition into divergent-bullish', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const regimes: ChartLineEmaDivergenceCrossRegime[] = [
      'aligned-bullish',
      'aligned-bullish',
      'divergent-bullish',
      'divergent-bullish',
    ];
    const ema: Array<number | null> = [1, 2, 3, 4];
    const out = detectLineEmaDivergenceCrossCrosses(series, regimes, ema);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
    expect(out[0]?.index).toBe(2);
  });

  it('fires bearish on transition into divergent-bearish', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const regimes: ChartLineEmaDivergenceCrossRegime[] = [
      'aligned-bullish',
      'aligned-bullish',
      'divergent-bearish',
      'divergent-bearish',
    ];
    const ema: Array<number | null> = [4, 3, 2, 1];
    const out = detectLineEmaDivergenceCrossCrosses(series, regimes, ema);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
  });

  it('does not double-fire while in same divergent state', () => {
    const series = Array.from({ length: 5 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const regimes: ChartLineEmaDivergenceCrossRegime[] = [
      'none',
      'divergent-bullish',
      'divergent-bullish',
      'divergent-bullish',
      'aligned-bullish',
    ];
    const ema: Array<number | null> = [1, 2, 3, 4, 5];
    const out = detectLineEmaDivergenceCrossCrosses(series, regimes, ema);
    expect(out).toHaveLength(1);
  });
});

describe('runLineEmaDivergenceCross CONST K', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST close=${K}: EMA=K, all none, 0 triggers`, () => {
      const data = buildConst(60, K);
      const run = runLineEmaDivergenceCross(data);
      expect(run.period).toBe(PERIOD);
      for (let i = 0; i < WARMUP; i += 1) {
        expect(run.emaValues[i]).toBeNull();
      }
      for (let i = WARMUP; i < 60; i += 1) {
        expect(run.emaValues[i] as number).toBeCloseTo(K, 9);
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

describe('runLineEmaDivergenceCross LINEAR UP', () => {
  it('LINEAR UP: EMA=i-6.5, all aligned-bullish from warmup+1', () => {
    const data = buildLinearUp(60);
    const run = runLineEmaDivergenceCross(data);
    for (let i = WARMUP + 1; i < 60; i += 1) {
      expect(run.samples[i]?.regime).toBe('aligned-bullish');
      expect(run.emaValues[i] as number).toBeCloseTo(i - EMA_LAG, 9);
    }
    expect(run.alignedBullishCount).toBe(60 - WARMUP - 1);
    expect(run.alignedBearishCount).toBe(0);
    expect(run.divergentBullishCount).toBe(0);
    expect(run.divergentBearishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineEmaDivergenceCross LINEAR DOWN', () => {
  it('LINEAR DOWN: EMA=-i+6.5, all aligned-bearish from warmup+1', () => {
    const data = buildLinearDown(60);
    const run = runLineEmaDivergenceCross(data);
    for (let i = WARMUP + 1; i < 60; i += 1) {
      expect(run.samples[i]?.regime).toBe('aligned-bearish');
      expect(run.emaValues[i] as number).toBeCloseTo(-i + EMA_LAG, 9);
    }
    expect(run.alignedBearishCount).toBe(60 - WARMUP - 1);
    expect(run.alignedBullishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineEmaDivergenceCross misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineEmaDivergenceCrossPoint[] = [
      { x: 2, close: 1 },
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    const run = runLineEmaDivergenceCross(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConst(13, 50);
    const run = runLineEmaDivergenceCross(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineEmaDivergenceCross([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom period', () => {
    const data = buildLinearUp(60);
    const run = runLineEmaDivergenceCross(data, { period: 9 });
    expect(run.period).toBe(9);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(60);
    const run = runLineEmaDivergenceCross(data);
    expect(
      run.alignedBullishCount +
        run.alignedBearishCount +
        run.divergentBullishCount +
        run.divergentBearishCount +
        run.noneCount,
    ).toBe(60);
  });
});

describe('computeLineEmaDivergenceCrossLayout', () => {
  it('renders SVG paths for LINEAR UP', () => {
    const data = buildLinearUp(60);
    const layout = computeLineEmaDivergenceCrossLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(60);
    expect(layout.emaPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineEmaDivergenceCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.emaPath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineEmaDivergenceCrossLayout({
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
    const layout = computeLineEmaDivergenceCrossLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });
});

describe('describeLineEmaDivergenceCrossChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineEmaDivergenceCrossChart([])).toBe('No data');
  });

  it('mentions bar count, period, reversal', () => {
    const desc = describeLineEmaDivergenceCrossChart(buildLinearUp(60));
    expect(desc).toContain('60 bars');
    expect(desc).toContain('period 14');
    expect(desc).toContain('reversal');
    expect(desc).toContain('bias coloring');
  });
});

describe('<ChartLineEmaDivergenceCross /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineEmaDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-ema-divergence-cross"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-period')).toBe(String(PERIOD));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(<ChartLineEmaDivergenceCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-ema-divergence-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders EMA path', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineEmaDivergenceCross data={data} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ema-divergence-cross-ema-path"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineEmaDivergenceCross data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ema-divergence-cross-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineEmaDivergenceCross data={data} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-ema-divergence-cross-badge"]',
    );
    expect(badge?.textContent).toContain('period 14');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineEmaDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-ema-divergence-cross"]',
    );
    expect(root?.getAttribute('aria-label')).toBe('EMA divergence chart');
  });

  it('exposes data-*-count counters for LINEAR UP', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineEmaDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-ema-divergence-cross"]',
    );
    expect(root?.getAttribute('data-aligned-bullish-count')).toBe(
      String(60 - WARMUP - 1),
    );
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineEmaDivergenceCross data={data} hiddenSeries={['ema']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ema-divergence-cross-ema-path"]',
      ),
    ).toBeNull();
  });
});
