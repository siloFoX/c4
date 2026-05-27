import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineKamaDivergenceCross,
  DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_FAST_LENGTH,
  DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_PADDING,
  DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_PERIOD,
  DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_SLOW_LENGTH,
  DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_WIDTH,
  classifyLineKamaDivergenceCrossBias,
  classifyLineKamaDivergenceCrossRegime,
  computeLineKamaDivergenceCross,
  computeLineKamaDivergenceCrossLayout,
  describeLineKamaDivergenceCrossChart,
  detectLineKamaDivergenceCrossCrosses,
  getLineKamaDivergenceCrossFinitePoints,
  normalizeLineKamaDivergenceCrossLength,
  runLineKamaDivergenceCross,
  type ChartLineKamaDivergenceCrossPoint,
  type ChartLineKamaDivergenceCrossRegime,
} from './chart-line-kama-divergence-cross';

const PERIOD = 10;
const WARMUP = PERIOD - 1; // 9, KAMA seed
const KAMA_STEADY_LAG = 1.25;

const buildConst = (
  n: number,
  k: number,
): ChartLineKamaDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: k }));

const buildLinearUp = (n: number): ChartLineKamaDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: i }));

const buildLinearDown = (n: number): ChartLineKamaDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: -i }));

describe('ChartLineKamaDivergenceCross defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_PANEL_GAP).toBe(12);
  });

  it('exports canonical KAMA tuning', () => {
    expect(DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_PERIOD).toBe(10);
    expect(DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_FAST_LENGTH).toBe(2);
    expect(DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_SLOW_LENGTH).toBe(30);
  });
});

describe('getLineKamaDivergenceCrossFinitePoints', () => {
  it('filters NaN/Infinity', () => {
    const points = [
      { x: 0, close: 1 },
      { x: NaN, close: 2 },
      { x: 2, close: Infinity },
      { x: 3, close: 4 },
    ];
    expect(getLineKamaDivergenceCrossFinitePoints(points)).toEqual([
      { x: 0, close: 1 },
      { x: 3, close: 4 },
    ]);
  });

  it('returns empty for null and non-array', () => {
    expect(getLineKamaDivergenceCrossFinitePoints(null)).toEqual([]);
    expect(getLineKamaDivergenceCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineKamaDivergenceCrossFinitePoints(
        // @ts-expect-error -- intentionally bad
        'oops',
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineKamaDivergenceCrossLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineKamaDivergenceCrossLength(10.7, 10)).toBe(10);
    expect(normalizeLineKamaDivergenceCrossLength(0, 10)).toBe(10);
    expect(normalizeLineKamaDivergenceCrossLength(NaN, 10)).toBe(10);
  });
});

describe('computeLineKamaDivergenceCross CONST', () => {
  it('KAMA stays at K (flat input, KAMA recurrence yields K + sc*0 = K)', () => {
    const data = buildConst(60, 50);
    const out = computeLineKamaDivergenceCross(data);
    expect(out.kama[WARMUP]).toBe(50);
    for (let i = PERIOD; i < 60; i += 1) {
      expect(out.kama[i] as number).toBeCloseTo(50, 9);
    }
  });

  it('ER = 0 on CONST (0/0 zero-volat guard)', () => {
    const data = buildConst(60, 50);
    const out = computeLineKamaDivergenceCross(data);
    for (let i = PERIOD; i < 60; i += 1) {
      expect(out.efficiency[i]).toBe(0);
    }
  });
});

describe('computeLineKamaDivergenceCross LINEAR UP', () => {
  it('KAMA converges to steady-state i - 1.25 (asymptote checked at series tail)', () => {
    const data = buildLinearUp(100);
    const out = computeLineKamaDivergenceCross(data);
    // After enough bars (50+), KAMA converges to steady-state within 1e-9.
    for (let i = 70; i < 100; i += 1) {
      expect(out.kama[i] as number).toBeCloseTo(i - KAMA_STEADY_LAG, 9);
    }
  });

  it('ER = 1 on LINEAR UP', () => {
    const data = buildLinearUp(100);
    const out = computeLineKamaDivergenceCross(data);
    for (let i = PERIOD; i < 100; i += 1) {
      expect(out.efficiency[i] as number).toBeCloseTo(1, 9);
    }
  });

  it('KAMA monotonically rises throughout', () => {
    const data = buildLinearUp(60);
    const out = computeLineKamaDivergenceCross(data);
    for (let i = PERIOD; i < 60; i += 1) {
      const cur = out.kama[i] as number;
      const prev = out.kama[i - 1] as number;
      expect(cur).toBeGreaterThan(prev);
    }
  });
});

describe('computeLineKamaDivergenceCross LINEAR DOWN', () => {
  it('KAMA converges to -i + 1.25 and monotonically falls', () => {
    const data = buildLinearDown(100);
    const out = computeLineKamaDivergenceCross(data);
    for (let i = 70; i < 100; i += 1) {
      expect(out.kama[i] as number).toBeCloseTo(-i + KAMA_STEADY_LAG, 9);
    }
    for (let i = PERIOD; i < 60; i += 1) {
      const cur = out.kama[i] as number;
      const prev = out.kama[i - 1] as number;
      expect(cur).toBeLessThan(prev);
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineKamaDivergenceCross([])).toEqual({
      kama: [],
      efficiency: [],
    });
  });
});

describe('classifyLineKamaDivergenceCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineKamaDivergenceCrossRegime(null, 1, 5, 4)).toBe(
      'none',
    );
  });
  it('priceUp + kamaUp -> aligned-bullish', () => {
    expect(classifyLineKamaDivergenceCrossRegime(2, 1, 5, 4)).toBe(
      'aligned-bullish',
    );
  });
  it('priceDown + kamaDown -> aligned-bearish', () => {
    expect(classifyLineKamaDivergenceCrossRegime(1, 2, 4, 5)).toBe(
      'aligned-bearish',
    );
  });
  it('priceDown + kamaUp -> divergent-bullish', () => {
    expect(classifyLineKamaDivergenceCrossRegime(1, 2, 5, 4)).toBe(
      'divergent-bullish',
    );
  });
  it('priceUp + kamaDown -> divergent-bearish', () => {
    expect(classifyLineKamaDivergenceCrossRegime(2, 1, 4, 5)).toBe(
      'divergent-bearish',
    );
  });
  it('flat sides -> none', () => {
    expect(classifyLineKamaDivergenceCrossRegime(1, 1, 5, 4)).toBe('none');
    expect(classifyLineKamaDivergenceCrossRegime(2, 1, 5, 5)).toBe('none');
  });
});

describe('classifyLineKamaDivergenceCrossBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineKamaDivergenceCrossBias(60, 50)).toBe('up');
    expect(classifyLineKamaDivergenceCrossBias(40, 50)).toBe('down');
    expect(classifyLineKamaDivergenceCrossBias(50, 50)).toBe('flat');
    expect(classifyLineKamaDivergenceCrossBias(null, 50)).toBe('none');
  });
});

describe('detectLineKamaDivergenceCrossCrosses', () => {
  it('fires bullish on transition into divergent-bullish', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const regimes: ChartLineKamaDivergenceCrossRegime[] = [
      'aligned-bullish',
      'aligned-bullish',
      'divergent-bullish',
      'divergent-bullish',
    ];
    const kama: Array<number | null> = [1, 2, 3, 4];
    const out = detectLineKamaDivergenceCrossCrosses(series, regimes, kama);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
    expect(out[0]?.index).toBe(2);
  });

  it('fires bearish on transition into divergent-bearish', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const regimes: ChartLineKamaDivergenceCrossRegime[] = [
      'aligned-bullish',
      'aligned-bullish',
      'divergent-bearish',
      'divergent-bearish',
    ];
    const kama: Array<number | null> = [4, 3, 2, 1];
    const out = detectLineKamaDivergenceCrossCrosses(series, regimes, kama);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
  });

  it('does not double-fire while in same divergent state', () => {
    const series = Array.from({ length: 5 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const regimes: ChartLineKamaDivergenceCrossRegime[] = [
      'none',
      'divergent-bullish',
      'divergent-bullish',
      'divergent-bullish',
      'aligned-bullish',
    ];
    const kama: Array<number | null> = [1, 2, 3, 4, 5];
    const out = detectLineKamaDivergenceCrossCrosses(series, regimes, kama);
    expect(out).toHaveLength(1);
  });
});

describe('runLineKamaDivergenceCross CONST K', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST close=${K}: KAMA=K, all none, 0 triggers`, () => {
      const data = buildConst(60, K);
      const run = runLineKamaDivergenceCross(data);
      expect(run.period).toBe(PERIOD);
      for (let i = 0; i < WARMUP; i += 1) {
        expect(run.kamaValues[i]).toBeNull();
      }
      for (let i = WARMUP; i < 60; i += 1) {
        expect(run.kamaValues[i] as number).toBeCloseTo(K, 9);
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

describe('runLineKamaDivergenceCross LINEAR UP', () => {
  it('LINEAR UP: KAMA monotonically rises, all aligned-bullish from i>=period', () => {
    const data = buildLinearUp(60);
    const run = runLineKamaDivergenceCross(data);
    for (let i = PERIOD; i < 60; i += 1) {
      expect(run.samples[i]?.regime).toBe('aligned-bullish');
    }
    // i = WARMUP (period - 1) is the seed bar; KAMA value exists
    // but prev KAMA is null, so regime is 'none' at that index.
    expect(run.samples[WARMUP]?.regime).toBe('none');
    expect(run.alignedBullishCount).toBe(60 - PERIOD);
    expect(run.alignedBearishCount).toBe(0);
    expect(run.divergentBullishCount).toBe(0);
    expect(run.divergentBearishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineKamaDivergenceCross LINEAR DOWN', () => {
  it('LINEAR DOWN: KAMA monotonically falls, all aligned-bearish from i>=period', () => {
    const data = buildLinearDown(60);
    const run = runLineKamaDivergenceCross(data);
    for (let i = PERIOD; i < 60; i += 1) {
      expect(run.samples[i]?.regime).toBe('aligned-bearish');
    }
    expect(run.alignedBearishCount).toBe(60 - PERIOD);
    expect(run.alignedBullishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineKamaDivergenceCross misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineKamaDivergenceCrossPoint[] = [
      { x: 2, close: 1 },
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    const run = runLineKamaDivergenceCross(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConst(9, 50);
    const run = runLineKamaDivergenceCross(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineKamaDivergenceCross([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom tuning', () => {
    const data = buildLinearUp(60);
    const run = runLineKamaDivergenceCross(data, {
      period: 14,
      fastLength: 3,
      slowLength: 20,
    });
    expect(run.period).toBe(14);
    expect(run.fastLength).toBe(3);
    expect(run.slowLength).toBe(20);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(60);
    const run = runLineKamaDivergenceCross(data);
    expect(
      run.alignedBullishCount +
        run.alignedBearishCount +
        run.divergentBullishCount +
        run.divergentBearishCount +
        run.noneCount,
    ).toBe(60);
  });
});

describe('computeLineKamaDivergenceCrossLayout', () => {
  it('renders SVG paths for LINEAR UP', () => {
    const data = buildLinearUp(60);
    const layout = computeLineKamaDivergenceCrossLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(60);
    expect(layout.kamaPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineKamaDivergenceCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.kamaPath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineKamaDivergenceCrossLayout({
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
    const layout = computeLineKamaDivergenceCrossLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });
});

describe('describeLineKamaDivergenceCrossChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineKamaDivergenceCrossChart([])).toBe('No data');
  });

  it('mentions bar count, period, volatility-adaptive', () => {
    const desc = describeLineKamaDivergenceCrossChart(buildLinearUp(60));
    expect(desc).toContain('60 bars');
    expect(desc).toContain('period 10');
    expect(desc).toContain('volatility-adaptive');
    expect(desc).toContain('bias coloring');
  });
});

describe('<ChartLineKamaDivergenceCross /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineKamaDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-kama-divergence-cross"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-period')).toBe(String(PERIOD));
    expect(root?.getAttribute('data-fast-length')).toBe('2');
    expect(root?.getAttribute('data-slow-length')).toBe('30');
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(<ChartLineKamaDivergenceCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-kama-divergence-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders KAMA path', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineKamaDivergenceCross data={data} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kama-divergence-cross-kama-path"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineKamaDivergenceCross data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kama-divergence-cross-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineKamaDivergenceCross data={data} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-kama-divergence-cross-badge"]',
    );
    expect(badge?.textContent).toContain('period 10');
    expect(badge?.textContent).toContain('fast 2');
    expect(badge?.textContent).toContain('slow 30');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineKamaDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-kama-divergence-cross"]',
    );
    expect(root?.getAttribute('aria-label')).toBe('KAMA divergence chart');
  });

  it('exposes data-*-count counters for LINEAR UP', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineKamaDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-kama-divergence-cross"]',
    );
    expect(root?.getAttribute('data-aligned-bullish-count')).toBe(
      String(60 - PERIOD),
    );
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineKamaDivergenceCross data={data} hiddenSeries={['kama']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kama-divergence-cross-kama-path"]',
      ),
    ).toBeNull();
  });
});
