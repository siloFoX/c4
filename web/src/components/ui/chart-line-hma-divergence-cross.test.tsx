import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineHmaDivergenceCross,
  DEFAULT_CHART_LINE_HMA_DIVERGENCE_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_HMA_DIVERGENCE_CROSS_PADDING,
  DEFAULT_CHART_LINE_HMA_DIVERGENCE_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_HMA_DIVERGENCE_CROSS_PERIOD,
  DEFAULT_CHART_LINE_HMA_DIVERGENCE_CROSS_WIDTH,
  applyLineHmaDivergenceCrossWma,
  classifyLineHmaDivergenceCrossBias,
  classifyLineHmaDivergenceCrossRegime,
  computeLineHmaDivergenceCross,
  computeLineHmaDivergenceCrossLayout,
  describeLineHmaDivergenceCrossChart,
  detectLineHmaDivergenceCrossCrosses,
  getLineHmaDivergenceCrossFinitePoints,
  normalizeLineHmaDivergenceCrossLength,
  runLineHmaDivergenceCross,
  type ChartLineHmaDivergenceCrossPoint,
  type ChartLineHmaDivergenceCrossRegime,
} from './chart-line-hma-divergence-cross';

const PERIOD = 14;
const SQRT_PERIOD = 4; // round(sqrt(14))
const WARMUP = PERIOD + SQRT_PERIOD - 2; // 16, first valid HMA
const HMA_LAG = 2 / 3;

const buildConst = (
  n: number,
  k: number,
): ChartLineHmaDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: k }));

const buildLinearUp = (n: number): ChartLineHmaDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: i }));

const buildLinearDown = (n: number): ChartLineHmaDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: -i }));

describe('ChartLineHmaDivergenceCross defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_HMA_DIVERGENCE_CROSS_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_HMA_DIVERGENCE_CROSS_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_HMA_DIVERGENCE_CROSS_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_HMA_DIVERGENCE_CROSS_PANEL_GAP).toBe(12);
  });

  it('exports canonical HMA tuning', () => {
    expect(DEFAULT_CHART_LINE_HMA_DIVERGENCE_CROSS_PERIOD).toBe(14);
  });
});

describe('getLineHmaDivergenceCrossFinitePoints', () => {
  it('filters NaN/Infinity', () => {
    const points = [
      { x: 0, close: 1 },
      { x: NaN, close: 2 },
      { x: 2, close: Infinity },
      { x: 3, close: 4 },
    ];
    expect(getLineHmaDivergenceCrossFinitePoints(points)).toEqual([
      { x: 0, close: 1 },
      { x: 3, close: 4 },
    ]);
  });

  it('returns empty for null and non-array', () => {
    expect(getLineHmaDivergenceCrossFinitePoints(null)).toEqual([]);
    expect(getLineHmaDivergenceCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineHmaDivergenceCrossFinitePoints(
        // @ts-expect-error -- intentionally bad
        'oops',
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineHmaDivergenceCrossLength', () => {
  it('floors finite >=2 values', () => {
    expect(normalizeLineHmaDivergenceCrossLength(14.7, 14)).toBe(14);
    expect(normalizeLineHmaDivergenceCrossLength(1, 14)).toBe(14);
    expect(normalizeLineHmaDivergenceCrossLength(0, 14)).toBe(14);
    expect(normalizeLineHmaDivergenceCrossLength(NaN, 14)).toBe(14);
  });
});

describe('applyLineHmaDivergenceCrossWma', () => {
  it('CONST returns constant', () => {
    const values: Array<number | null> = Array.from({ length: 20 }, () => 5);
    const wma = applyLineHmaDivergenceCrossWma(values, 7);
    for (let i = 6; i < 20; i += 1) expect(wma[i]).toBe(5);
  });

  it('LINEAR returns i - (L-1)/3', () => {
    const values: Array<number | null> = Array.from(
      { length: 20 },
      (_, i) => i,
    );
    const wma = applyLineHmaDivergenceCrossWma(values, 7);
    for (let i = 6; i < 20; i += 1) {
      expect(wma[i] as number).toBeCloseTo(i - 2, 9);
    }
  });

  it('returns nulls when length < 1', () => {
    expect(
      applyLineHmaDivergenceCrossWma([1, 2, 3], 0).every((v) => v === null),
    ).toBe(true);
  });
});

describe('computeLineHmaDivergenceCross CONST', () => {
  it('HMA = K from warmup', () => {
    const data = buildConst(40, 50);
    const out = computeLineHmaDivergenceCross(data);
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.hma[i] as number).toBeCloseTo(50, 9);
    }
  });

  it('inner = K, wmaHalf = K, wmaFull = K from period-1', () => {
    const data = buildConst(40, 50);
    const out = computeLineHmaDivergenceCross(data);
    for (let i = PERIOD - 1; i < 40; i += 1) {
      expect(out.wmaHalf[i] as number).toBeCloseTo(50, 9);
      expect(out.wmaFull[i] as number).toBeCloseTo(50, 9);
      expect(out.inner[i] as number).toBeCloseTo(50, 9);
    }
  });
});

describe('computeLineHmaDivergenceCross LINEAR UP', () => {
  it('HMA = i - 2/3 from warmup', () => {
    const data = buildLinearUp(40);
    const out = computeLineHmaDivergenceCross(data);
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.hma[i] as number).toBeCloseTo(i - HMA_LAG, 9);
    }
  });

  it('wmaHalf=i-2, wmaFull=i-13/3, inner=i+1/3 from period-1', () => {
    const data = buildLinearUp(40);
    const out = computeLineHmaDivergenceCross(data);
    for (let i = PERIOD - 1; i < 40; i += 1) {
      expect(out.wmaHalf[i] as number).toBeCloseTo(i - 2, 9);
      expect(out.wmaFull[i] as number).toBeCloseTo(i - 13 / 3, 9);
      expect(out.inner[i] as number).toBeCloseTo(i + 1 / 3, 9);
    }
  });
});

describe('computeLineHmaDivergenceCross LINEAR DOWN', () => {
  it('HMA = -i + 2/3 from warmup', () => {
    const data = buildLinearDown(40);
    const out = computeLineHmaDivergenceCross(data);
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.hma[i] as number).toBeCloseTo(-i + HMA_LAG, 9);
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineHmaDivergenceCross([])).toEqual({
      wmaHalf: [],
      wmaFull: [],
      inner: [],
      hma: [],
    });
  });
});

describe('classifyLineHmaDivergenceCrossRegime', () => {
  it('null -> none', () => {
    expect(
      classifyLineHmaDivergenceCrossRegime(null, 1, 5, 4),
    ).toBe('none');
  });
  it('priceUp + hmaUp -> aligned-bullish', () => {
    expect(
      classifyLineHmaDivergenceCrossRegime(2, 1, 5, 4),
    ).toBe('aligned-bullish');
  });
  it('priceDown + hmaDown -> aligned-bearish', () => {
    expect(
      classifyLineHmaDivergenceCrossRegime(1, 2, 4, 5),
    ).toBe('aligned-bearish');
  });
  it('priceDown + hmaUp -> divergent-bullish', () => {
    expect(
      classifyLineHmaDivergenceCrossRegime(1, 2, 5, 4),
    ).toBe('divergent-bullish');
  });
  it('priceUp + hmaDown -> divergent-bearish', () => {
    expect(
      classifyLineHmaDivergenceCrossRegime(2, 1, 4, 5),
    ).toBe('divergent-bearish');
  });
  it('flat sides -> none', () => {
    expect(
      classifyLineHmaDivergenceCrossRegime(1, 1, 5, 4),
    ).toBe('none');
    expect(
      classifyLineHmaDivergenceCrossRegime(2, 1, 5, 5),
    ).toBe('none');
  });
});

describe('classifyLineHmaDivergenceCrossBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineHmaDivergenceCrossBias(60, 50)).toBe('up');
    expect(classifyLineHmaDivergenceCrossBias(40, 50)).toBe('down');
    expect(classifyLineHmaDivergenceCrossBias(50, 50)).toBe('flat');
    expect(classifyLineHmaDivergenceCrossBias(null, 50)).toBe('none');
  });
});

describe('detectLineHmaDivergenceCrossCrosses', () => {
  it('fires bullish on transition into divergent-bullish', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const regimes: ChartLineHmaDivergenceCrossRegime[] = [
      'aligned-bullish',
      'aligned-bullish',
      'divergent-bullish',
      'divergent-bullish',
    ];
    const hma: Array<number | null> = [1, 2, 3, 4];
    const out = detectLineHmaDivergenceCrossCrosses(series, regimes, hma);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
    expect(out[0]?.index).toBe(2);
  });

  it('fires bearish on transition into divergent-bearish', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const regimes: ChartLineHmaDivergenceCrossRegime[] = [
      'aligned-bullish',
      'aligned-bullish',
      'divergent-bearish',
      'divergent-bearish',
    ];
    const hma: Array<number | null> = [4, 3, 2, 1];
    const out = detectLineHmaDivergenceCrossCrosses(series, regimes, hma);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
  });

  it('does not double-fire while in same divergent state', () => {
    const series = Array.from({ length: 5 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const regimes: ChartLineHmaDivergenceCrossRegime[] = [
      'none',
      'divergent-bullish',
      'divergent-bullish',
      'divergent-bullish',
      'aligned-bullish',
    ];
    const hma: Array<number | null> = [1, 2, 3, 4, 5];
    const out = detectLineHmaDivergenceCrossCrosses(series, regimes, hma);
    expect(out).toHaveLength(1);
  });
});

describe('runLineHmaDivergenceCross CONST K', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST close=${K}: HMA=K, all none, 0 triggers`, () => {
      const data = buildConst(60, K);
      const run = runLineHmaDivergenceCross(data);
      expect(run.period).toBe(PERIOD);
      expect(run.sqrtPeriod).toBe(SQRT_PERIOD);
      for (let i = 0; i < WARMUP; i += 1) {
        expect(run.hmaValues[i]).toBeNull();
      }
      for (let i = WARMUP; i < 60; i += 1) {
        expect(run.hmaValues[i] as number).toBeCloseTo(K, 9);
      }
      // All regimes are 'none' since both close and HMA are flat
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

describe('runLineHmaDivergenceCross LINEAR UP', () => {
  it('LINEAR UP: HMA=i-2/3, all aligned-bullish from warmup+1', () => {
    const data = buildLinearUp(60);
    const run = runLineHmaDivergenceCross(data);
    for (let i = WARMUP + 1; i < 60; i += 1) {
      expect(run.samples[i]?.regime).toBe('aligned-bullish');
      expect(run.hmaValues[i] as number).toBeCloseTo(i - HMA_LAG, 9);
    }
    expect(run.alignedBullishCount).toBe(60 - WARMUP - 1);
    expect(run.alignedBearishCount).toBe(0);
    expect(run.divergentBullishCount).toBe(0);
    expect(run.divergentBearishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineHmaDivergenceCross LINEAR DOWN', () => {
  it('LINEAR DOWN: HMA=-i+2/3, all aligned-bearish from warmup+1', () => {
    const data = buildLinearDown(60);
    const run = runLineHmaDivergenceCross(data);
    for (let i = WARMUP + 1; i < 60; i += 1) {
      expect(run.samples[i]?.regime).toBe('aligned-bearish');
      expect(run.hmaValues[i] as number).toBeCloseTo(-i + HMA_LAG, 9);
    }
    expect(run.alignedBearishCount).toBe(60 - WARMUP - 1);
    expect(run.alignedBullishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineHmaDivergenceCross misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineHmaDivergenceCrossPoint[] = [
      { x: 2, close: 1 },
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    const run = runLineHmaDivergenceCross(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConst(15, 50);
    const run = runLineHmaDivergenceCross(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineHmaDivergenceCross([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom period', () => {
    const data = buildLinearUp(60);
    const run = runLineHmaDivergenceCross(data, { period: 9 });
    expect(run.period).toBe(9);
    expect(run.sqrtPeriod).toBe(3); // round(sqrt(9)) = 3
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(60);
    const run = runLineHmaDivergenceCross(data);
    expect(
      run.alignedBullishCount +
        run.alignedBearishCount +
        run.divergentBullishCount +
        run.divergentBearishCount +
        run.noneCount,
    ).toBe(60);
  });

  it('exposes wmaHalf/wmaFull/inner on run for audit', () => {
    const data = buildLinearUp(40);
    const run = runLineHmaDivergenceCross(data);
    expect(run.wmaHalfValues[6] as number).toBeCloseTo(6 - 2, 9);
    expect(run.wmaFullValues[13] as number).toBeCloseTo(13 - 13 / 3, 9);
    expect(run.innerValues[13] as number).toBeCloseTo(13 + 1 / 3, 9);
  });
});

describe('computeLineHmaDivergenceCrossLayout', () => {
  it('renders SVG paths for LINEAR UP', () => {
    const data = buildLinearUp(60);
    const layout = computeLineHmaDivergenceCrossLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(60);
    expect(layout.hmaPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineHmaDivergenceCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.hmaPath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineHmaDivergenceCrossLayout({
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
    const layout = computeLineHmaDivergenceCrossLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });
});

describe('describeLineHmaDivergenceCrossChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineHmaDivergenceCrossChart([])).toBe('No data');
  });

  it('mentions bar count, period, reversal', () => {
    const desc = describeLineHmaDivergenceCrossChart(buildLinearUp(60));
    expect(desc).toContain('60 bars');
    expect(desc).toContain('period 14');
    expect(desc).toContain('reversal');
    expect(desc).toContain('bias coloring');
  });
});

describe('<ChartLineHmaDivergenceCross /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineHmaDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-hma-divergence-cross"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-period')).toBe(String(PERIOD));
    expect(root?.getAttribute('data-sqrt-period')).toBe(String(SQRT_PERIOD));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(<ChartLineHmaDivergenceCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-hma-divergence-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders HMA path', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineHmaDivergenceCross data={data} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hma-divergence-cross-hma-path"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineHmaDivergenceCross data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hma-divergence-cross-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineHmaDivergenceCross data={data} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-hma-divergence-cross-badge"]',
    );
    expect(badge?.textContent).toContain('period 14');
    expect(badge?.textContent).toContain('sqrt 4');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineHmaDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-hma-divergence-cross"]',
    );
    expect(root?.getAttribute('aria-label')).toBe('HMA divergence chart');
  });

  it('exposes data-*-count counters for LINEAR UP', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineHmaDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-hma-divergence-cross"]',
    );
    expect(root?.getAttribute('data-aligned-bullish-count')).toBe(
      String(60 - WARMUP - 1),
    );
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineHmaDivergenceCross data={data} hiddenSeries={['hma']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hma-divergence-cross-hma-path"]',
      ),
    ).toBeNull();
  });
});
