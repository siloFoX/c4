import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineTemaDivergenceCross,
  DEFAULT_CHART_LINE_TEMA_DIVERGENCE_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_TEMA_DIVERGENCE_CROSS_PADDING,
  DEFAULT_CHART_LINE_TEMA_DIVERGENCE_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_TEMA_DIVERGENCE_CROSS_PERIOD,
  DEFAULT_CHART_LINE_TEMA_DIVERGENCE_CROSS_WIDTH,
  applyLineTemaDivergenceCrossEma,
  classifyLineTemaDivergenceCrossBias,
  classifyLineTemaDivergenceCrossRegime,
  computeLineTemaDivergenceCross,
  computeLineTemaDivergenceCrossLayout,
  describeLineTemaDivergenceCrossChart,
  detectLineTemaDivergenceCrossCrosses,
  getLineTemaDivergenceCrossFinitePoints,
  normalizeLineTemaDivergenceCrossLength,
  runLineTemaDivergenceCross,
  type ChartLineTemaDivergenceCrossPoint,
  type ChartLineTemaDivergenceCrossRegime,
} from './chart-line-tema-divergence-cross';

const PERIOD = 14;
const WARMUP = 3 * (PERIOD - 1); // 39, first valid TEMA

const buildConst = (
  n: number,
  k: number,
): ChartLineTemaDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: k }));

const buildLinearUp = (n: number): ChartLineTemaDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: i }));

const buildLinearDown = (n: number): ChartLineTemaDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: -i }));

describe('ChartLineTemaDivergenceCross defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_TEMA_DIVERGENCE_CROSS_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_TEMA_DIVERGENCE_CROSS_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_TEMA_DIVERGENCE_CROSS_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_TEMA_DIVERGENCE_CROSS_PANEL_GAP).toBe(12);
  });

  it('exports canonical TEMA tuning', () => {
    expect(DEFAULT_CHART_LINE_TEMA_DIVERGENCE_CROSS_PERIOD).toBe(14);
  });
});

describe('getLineTemaDivergenceCrossFinitePoints', () => {
  it('filters NaN/Infinity', () => {
    const points = [
      { x: 0, close: 1 },
      { x: NaN, close: 2 },
      { x: 2, close: Infinity },
      { x: 3, close: 4 },
    ];
    expect(getLineTemaDivergenceCrossFinitePoints(points)).toEqual([
      { x: 0, close: 1 },
      { x: 3, close: 4 },
    ]);
  });

  it('returns empty for null and non-array', () => {
    expect(getLineTemaDivergenceCrossFinitePoints(null)).toEqual([]);
    expect(getLineTemaDivergenceCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineTemaDivergenceCrossFinitePoints(
        // @ts-expect-error -- intentionally bad
        'oops',
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineTemaDivergenceCrossLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineTemaDivergenceCrossLength(14.7, 14)).toBe(14);
    expect(normalizeLineTemaDivergenceCrossLength(0, 14)).toBe(14);
    expect(normalizeLineTemaDivergenceCrossLength(NaN, 14)).toBe(14);
  });
});

describe('applyLineTemaDivergenceCrossEma', () => {
  it('CONST returns constant', () => {
    const values: Array<number | null> = Array.from({ length: 30 }, () => 7);
    const ema = applyLineTemaDivergenceCrossEma(values, PERIOD);
    for (let i = PERIOD - 1; i < 30; i += 1) expect(ema[i]).toBe(7);
  });

  it('LINEAR returns i - (L-1)/2 from seed bar', () => {
    const values: Array<number | null> = Array.from(
      { length: 40 },
      (_, i) => i,
    );
    const ema = applyLineTemaDivergenceCrossEma(values, PERIOD);
    for (let i = PERIOD - 1; i < 40; i += 1) {
      expect(ema[i] as number).toBeCloseTo(i - 6.5, 9);
    }
  });
});

describe('computeLineTemaDivergenceCross CONST', () => {
  it('TEMA = K from warmup', () => {
    const data = buildConst(60, 50);
    const out = computeLineTemaDivergenceCross(data);
    for (let i = WARMUP; i < 60; i += 1) {
      expect(out.tema[i] as number).toBeCloseTo(50, 9);
    }
  });

  it('all EMA layers settle at K', () => {
    const data = buildConst(60, 50);
    const out = computeLineTemaDivergenceCross(data);
    for (let i = WARMUP; i < 60; i += 1) {
      expect(out.ema1[i] as number).toBeCloseTo(50, 9);
      expect(out.ema2[i] as number).toBeCloseTo(50, 9);
      expect(out.ema3[i] as number).toBeCloseTo(50, 9);
    }
  });
});

describe('computeLineTemaDivergenceCross LINEAR UP', () => {
  it('TEMA = i from warmup (Mulloy zero-lag identity)', () => {
    const data = buildLinearUp(60);
    const out = computeLineTemaDivergenceCross(data);
    for (let i = WARMUP; i < 60; i += 1) {
      expect(out.tema[i] as number).toBeCloseTo(i, 9);
    }
  });

  it('EMA layers settle at i-6.5, i-13, i-19.5 (Mulloy stack)', () => {
    const data = buildLinearUp(60);
    const out = computeLineTemaDivergenceCross(data);
    for (let i = WARMUP; i < 60; i += 1) {
      expect(out.ema1[i] as number).toBeCloseTo(i - 6.5, 9);
      expect(out.ema2[i] as number).toBeCloseTo(i - 13, 9);
      expect(out.ema3[i] as number).toBeCloseTo(i - 19.5, 9);
    }
  });
});

describe('computeLineTemaDivergenceCross LINEAR DOWN', () => {
  it('TEMA = -i from warmup', () => {
    const data = buildLinearDown(60);
    const out = computeLineTemaDivergenceCross(data);
    for (let i = WARMUP; i < 60; i += 1) {
      expect(out.tema[i] as number).toBeCloseTo(-i, 9);
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineTemaDivergenceCross([])).toEqual({
      ema1: [],
      ema2: [],
      ema3: [],
      tema: [],
    });
  });
});

describe('classifyLineTemaDivergenceCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineTemaDivergenceCrossRegime(null, 1, 5, 4)).toBe(
      'none',
    );
  });
  it('priceUp + temaUp -> aligned-bullish', () => {
    expect(classifyLineTemaDivergenceCrossRegime(2, 1, 5, 4)).toBe(
      'aligned-bullish',
    );
  });
  it('priceDown + temaDown -> aligned-bearish', () => {
    expect(classifyLineTemaDivergenceCrossRegime(1, 2, 4, 5)).toBe(
      'aligned-bearish',
    );
  });
  it('priceDown + temaUp -> divergent-bullish', () => {
    expect(classifyLineTemaDivergenceCrossRegime(1, 2, 5, 4)).toBe(
      'divergent-bullish',
    );
  });
  it('priceUp + temaDown -> divergent-bearish', () => {
    expect(classifyLineTemaDivergenceCrossRegime(2, 1, 4, 5)).toBe(
      'divergent-bearish',
    );
  });
  it('flat sides -> none', () => {
    expect(classifyLineTemaDivergenceCrossRegime(1, 1, 5, 4)).toBe('none');
    expect(classifyLineTemaDivergenceCrossRegime(2, 1, 5, 5)).toBe('none');
  });
});

describe('classifyLineTemaDivergenceCrossBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineTemaDivergenceCrossBias(60, 50)).toBe('up');
    expect(classifyLineTemaDivergenceCrossBias(40, 50)).toBe('down');
    expect(classifyLineTemaDivergenceCrossBias(50, 50)).toBe('flat');
    expect(classifyLineTemaDivergenceCrossBias(null, 50)).toBe('none');
  });
});

describe('detectLineTemaDivergenceCrossCrosses', () => {
  it('fires bullish on transition into divergent-bullish', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const regimes: ChartLineTemaDivergenceCrossRegime[] = [
      'aligned-bullish',
      'aligned-bullish',
      'divergent-bullish',
      'divergent-bullish',
    ];
    const tema: Array<number | null> = [1, 2, 3, 4];
    const out = detectLineTemaDivergenceCrossCrosses(series, regimes, tema);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
    expect(out[0]?.index).toBe(2);
  });

  it('fires bearish on transition into divergent-bearish', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const regimes: ChartLineTemaDivergenceCrossRegime[] = [
      'aligned-bullish',
      'aligned-bullish',
      'divergent-bearish',
      'divergent-bearish',
    ];
    const tema: Array<number | null> = [4, 3, 2, 1];
    const out = detectLineTemaDivergenceCrossCrosses(series, regimes, tema);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
  });

  it('does not double-fire while in same divergent state', () => {
    const series = Array.from({ length: 5 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const regimes: ChartLineTemaDivergenceCrossRegime[] = [
      'none',
      'divergent-bullish',
      'divergent-bullish',
      'divergent-bullish',
      'aligned-bullish',
    ];
    const tema: Array<number | null> = [1, 2, 3, 4, 5];
    const out = detectLineTemaDivergenceCrossCrosses(series, regimes, tema);
    expect(out).toHaveLength(1);
  });
});

describe('runLineTemaDivergenceCross CONST K', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST close=${K}: TEMA=K, all none, 0 triggers`, () => {
      const data = buildConst(60, K);
      const run = runLineTemaDivergenceCross(data);
      expect(run.period).toBe(PERIOD);
      for (let i = 0; i < WARMUP; i += 1) {
        expect(run.temaValues[i]).toBeNull();
      }
      for (let i = WARMUP; i < 60; i += 1) {
        expect(run.temaValues[i] as number).toBeCloseTo(K, 9);
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

describe('runLineTemaDivergenceCross LINEAR UP', () => {
  it('LINEAR UP: TEMA=i (zero lag), all aligned-bullish from warmup+1', () => {
    const data = buildLinearUp(60);
    const run = runLineTemaDivergenceCross(data);
    for (let i = WARMUP + 1; i < 60; i += 1) {
      expect(run.samples[i]?.regime).toBe('aligned-bullish');
      expect(run.temaValues[i] as number).toBeCloseTo(i, 9);
    }
    expect(run.alignedBullishCount).toBe(60 - WARMUP - 1);
    expect(run.alignedBearishCount).toBe(0);
    expect(run.divergentBullishCount).toBe(0);
    expect(run.divergentBearishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineTemaDivergenceCross LINEAR DOWN', () => {
  it('LINEAR DOWN: TEMA=-i (zero lag), all aligned-bearish from warmup+1', () => {
    const data = buildLinearDown(60);
    const run = runLineTemaDivergenceCross(data);
    for (let i = WARMUP + 1; i < 60; i += 1) {
      expect(run.samples[i]?.regime).toBe('aligned-bearish');
      expect(run.temaValues[i] as number).toBeCloseTo(-i, 9);
    }
    expect(run.alignedBearishCount).toBe(60 - WARMUP - 1);
    expect(run.alignedBullishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineTemaDivergenceCross misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineTemaDivergenceCrossPoint[] = [
      { x: 2, close: 1 },
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    const run = runLineTemaDivergenceCross(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConst(39, 50);
    const run = runLineTemaDivergenceCross(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineTemaDivergenceCross([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom period', () => {
    const data = buildLinearUp(60);
    const run = runLineTemaDivergenceCross(data, { period: 7 });
    expect(run.period).toBe(7);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(80);
    const run = runLineTemaDivergenceCross(data);
    expect(
      run.alignedBullishCount +
        run.alignedBearishCount +
        run.divergentBullishCount +
        run.divergentBearishCount +
        run.noneCount,
    ).toBe(80);
  });
});

describe('computeLineTemaDivergenceCrossLayout', () => {
  it('renders SVG paths for LINEAR UP', () => {
    const data = buildLinearUp(80);
    const layout = computeLineTemaDivergenceCrossLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(80);
    expect(layout.temaPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineTemaDivergenceCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.temaPath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineTemaDivergenceCrossLayout({
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
    const data = buildConst(80, 100);
    const layout = computeLineTemaDivergenceCrossLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });
});

describe('describeLineTemaDivergenceCrossChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineTemaDivergenceCrossChart([])).toBe('No data');
  });

  it('mentions bar count, period, responsive reversal', () => {
    const desc = describeLineTemaDivergenceCrossChart(buildLinearUp(80));
    expect(desc).toContain('80 bars');
    expect(desc).toContain('period 14');
    expect(desc).toContain('responsive');
    expect(desc).toContain('reversal');
    expect(desc).toContain('bias coloring');
  });
});

describe('<ChartLineTemaDivergenceCross /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineTemaDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-tema-divergence-cross"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-period')).toBe(String(PERIOD));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(<ChartLineTemaDivergenceCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-tema-divergence-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders TEMA path', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineTemaDivergenceCross data={data} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-tema-divergence-cross-tema-path"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineTemaDivergenceCross data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-tema-divergence-cross-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineTemaDivergenceCross data={data} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-tema-divergence-cross-badge"]',
    );
    expect(badge?.textContent).toContain('period 14');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineTemaDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-tema-divergence-cross"]',
    );
    expect(root?.getAttribute('aria-label')).toBe('TEMA divergence chart');
  });

  it('exposes data-*-count counters for LINEAR UP', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineTemaDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-tema-divergence-cross"]',
    );
    expect(root?.getAttribute('data-aligned-bullish-count')).toBe(
      String(80 - WARMUP - 1),
    );
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineTemaDivergenceCross data={data} hiddenSeries={['tema']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-tema-divergence-cross-tema-path"]',
      ),
    ).toBeNull();
  });
});
