import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineMomentumDivergenceCross,
  DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_CROSS_PADDING,
  DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_CROSS_PERIOD,
  DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_CROSS_WIDTH,
  classifyLineMomentumDivergenceCrossBias,
  classifyLineMomentumDivergenceCrossRegime,
  computeLineMomentumDivergenceCross,
  computeLineMomentumDivergenceCrossLayout,
  describeLineMomentumDivergenceCrossChart,
  detectLineMomentumDivergenceCrossCrosses,
  getLineMomentumDivergenceCrossFinitePoints,
  normalizeLineMomentumDivergenceCrossLength,
  runLineMomentumDivergenceCross,
  type ChartLineMomentumDivergenceCrossPoint,
  type ChartLineMomentumDivergenceCrossRegime,
} from './chart-line-momentum-divergence-cross';

const PERIOD = 10;
const WARMUP = PERIOD + 1; // 11

const buildConst = (
  n: number,
  k: number,
): ChartLineMomentumDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: k }));

const buildLinearUp = (n: number): ChartLineMomentumDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: i }));

const buildLinearDown = (n: number): ChartLineMomentumDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: -i }));

// Quadratic up: aligned-bullish throughout (price up, momentum up)
const buildQuadraticUp = (
  n: number,
): ChartLineMomentumDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: i * i }));

// Decelerating climb: price still rising but momentum decaying.
// close[i] = i^0.5 -- monotonically increasing but slope decreases.
const buildSqrtUp = (n: number): ChartLineMomentumDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: Math.sqrt(i + 1) }));

describe('ChartLineMomentumDivergenceCross defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_CROSS_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_CROSS_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_CROSS_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_CROSS_PANEL_GAP).toBe(12);
  });

  it('exports canonical Momentum tuning', () => {
    expect(DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_CROSS_PERIOD).toBe(10);
  });
});

describe('getLineMomentumDivergenceCrossFinitePoints', () => {
  it('filters NaN/Infinity', () => {
    const points = [
      { x: 0, close: 1.5 },
      { x: NaN, close: 1.5 },
      { x: 2, close: Infinity },
      { x: 3, close: 2 },
    ];
    expect(getLineMomentumDivergenceCrossFinitePoints(points)).toEqual([
      { x: 0, close: 1.5 },
      { x: 3, close: 2 },
    ]);
  });

  it('returns empty for null/non-array', () => {
    expect(getLineMomentumDivergenceCrossFinitePoints(null)).toEqual([]);
    expect(getLineMomentumDivergenceCrossFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineMomentumDivergenceCrossLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineMomentumDivergenceCrossLength(10.7, 10)).toBe(10);
  });
  it('falls back on invalid', () => {
    expect(normalizeLineMomentumDivergenceCrossLength(0, 10)).toBe(10);
    expect(normalizeLineMomentumDivergenceCrossLength(-1, 10)).toBe(10);
    expect(normalizeLineMomentumDivergenceCrossLength(NaN, 10)).toBe(10);
  });
});

describe('computeLineMomentumDivergenceCross CONST', () => {
  it('M = 0 from i = period onwards', () => {
    const data = buildConst(40, 50);
    const out = computeLineMomentumDivergenceCross(data);
    for (let i = 0; i < PERIOD; i += 1) expect(out[i]).toBeNull();
    for (let i = PERIOD; i < 40; i += 1) expect(out[i] as number).toBe(0);
  });
});

describe('computeLineMomentumDivergenceCross LINEAR UP', () => {
  it('M = period (constant) from i = period onwards', () => {
    const data = buildLinearUp(40);
    const out = computeLineMomentumDivergenceCross(data);
    for (let i = PERIOD; i < 40; i += 1) {
      expect(out[i] as number).toBe(PERIOD);
    }
  });
});

describe('computeLineMomentumDivergenceCross LINEAR DOWN', () => {
  it('M = -period (constant) from i = period onwards', () => {
    const data = buildLinearDown(40);
    const out = computeLineMomentumDivergenceCross(data);
    for (let i = PERIOD; i < 40; i += 1) {
      expect(out[i] as number).toBe(-PERIOD);
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineMomentumDivergenceCross([])).toEqual([]);
  });
});

describe('classifyLineMomentumDivergenceCrossRegime', () => {
  it('null inputs -> none', () => {
    expect(
      classifyLineMomentumDivergenceCrossRegime(null, 1, 1, 1),
    ).toBe('none');
    expect(
      classifyLineMomentumDivergenceCrossRegime(1, null, 1, 1),
    ).toBe('none');
    expect(
      classifyLineMomentumDivergenceCrossRegime(1, 1, null, 1),
    ).toBe('none');
    expect(
      classifyLineMomentumDivergenceCrossRegime(1, 1, 1, null),
    ).toBe('none');
  });

  it('price up + mom up -> aligned-bullish', () => {
    expect(classifyLineMomentumDivergenceCrossRegime(10, 5, 4, 2)).toBe(
      'aligned-bullish',
    );
  });

  it('price down + mom down -> aligned-bearish', () => {
    expect(classifyLineMomentumDivergenceCrossRegime(5, 10, 2, 4)).toBe(
      'aligned-bearish',
    );
  });

  it('price down + mom up -> divergent-bullish', () => {
    expect(classifyLineMomentumDivergenceCrossRegime(5, 10, 4, 2)).toBe(
      'divergent-bullish',
    );
  });

  it('price up + mom down -> divergent-bearish', () => {
    expect(classifyLineMomentumDivergenceCrossRegime(10, 5, 2, 4)).toBe(
      'divergent-bearish',
    );
  });

  it('flat price or flat momentum -> none', () => {
    expect(classifyLineMomentumDivergenceCrossRegime(5, 5, 4, 2)).toBe(
      'none',
    );
    expect(classifyLineMomentumDivergenceCrossRegime(10, 5, 4, 4)).toBe(
      'none',
    );
  });
});

describe('classifyLineMomentumDivergenceCrossBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineMomentumDivergenceCrossBias(60, 50)).toBe('up');
    expect(classifyLineMomentumDivergenceCrossBias(40, 50)).toBe('down');
    expect(classifyLineMomentumDivergenceCrossBias(50, 50)).toBe('flat');
    expect(classifyLineMomentumDivergenceCrossBias(null, 50)).toBe('none');
    expect(classifyLineMomentumDivergenceCrossBias(50, null)).toBe('none');
  });
});

describe('detectLineMomentumDivergenceCrossCrosses', () => {
  it('fires BULLISH on entry into divergent-bullish', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: i,
    }));
    const regimes: ChartLineMomentumDivergenceCrossRegime[] = [
      'none',
      'aligned-bullish',
      'divergent-bullish',
      'divergent-bullish',
    ];
    const mom: Array<number | null> = [1, 2, 3, 4];
    // i=1: prev none -> aligned-bullish, no cross
    // i=2: prev aligned -> divergent-bullish, BULLISH cross
    // i=3: prev divergent-bullish -> divergent-bullish, no new cross
    const out = detectLineMomentumDivergenceCrossCrosses(series, regimes, mom);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
    expect(out[0]?.index).toBe(2);
  });

  it('fires BEARISH on entry into divergent-bearish', () => {
    const series = Array.from({ length: 3 }, (_, i) => ({
      x: i,
      close: i,
    }));
    const regimes: ChartLineMomentumDivergenceCrossRegime[] = [
      'none',
      'aligned-bullish',
      'divergent-bearish',
    ];
    const mom: Array<number | null> = [4, 3, 2];
    const out = detectLineMomentumDivergenceCrossCrosses(series, regimes, mom);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
    expect(out[0]?.index).toBe(2);
  });

  it('does not fire when divergent state persists', () => {
    const series = Array.from({ length: 3 }, (_, i) => ({
      x: i,
      close: i,
    }));
    const regimes: ChartLineMomentumDivergenceCrossRegime[] = [
      'divergent-bullish',
      'divergent-bullish',
      'divergent-bullish',
    ];
    const mom: Array<number | null> = [1, 2, 3];
    const out = detectLineMomentumDivergenceCrossCrosses(series, regimes, mom);
    expect(out).toHaveLength(0);
  });

  it('bias up when momentum rises at the cross', () => {
    const series = Array.from({ length: 2 }, (_, i) => ({
      x: i,
      close: i,
    }));
    const regimes: ChartLineMomentumDivergenceCrossRegime[] = [
      'aligned-bullish',
      'divergent-bullish',
    ];
    const mom: Array<number | null> = [1, 5];
    const out = detectLineMomentumDivergenceCrossCrosses(series, regimes, mom);
    expect(out[0]?.bias).toBe('up');
  });
});

describe('runLineMomentumDivergenceCross CONST', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST ${K}: M = 0 constant, regime none, 0 crosses`, () => {
      const data = buildConst(40, K);
      const run = runLineMomentumDivergenceCross(data);
      expect(run.period).toBe(PERIOD);
      for (let i = PERIOD; i < 40; i += 1) {
        expect(run.momentumValues[i] as number).toBe(0);
      }
      // priceUp/Down both false (flat) -> regime 'none' throughout
      expect(run.alignedBullishCount).toBe(0);
      expect(run.alignedBearishCount).toBe(0);
      expect(run.divergentBullishCount).toBe(0);
      expect(run.divergentBearishCount).toBe(0);
      expect(run.crosses).toHaveLength(0);
      expect(run.ok).toBe(true);
    });
  }
});

describe('runLineMomentumDivergenceCross LINEAR UP', () => {
  it('M = period constant; momentum flat -> regime none, 0 crosses', () => {
    const data = buildLinearUp(40);
    const run = runLineMomentumDivergenceCross(data);
    for (let i = PERIOD; i < 40; i += 1) {
      expect(run.momentumValues[i] as number).toBe(PERIOD);
    }
    expect(run.crosses).toHaveLength(0);
    // Momentum is flat after warmup -> no aligned-bullish, no divergent
    expect(run.alignedBullishCount).toBe(0);
    expect(run.divergentBearishCount).toBe(0);
  });
});

describe('runLineMomentumDivergenceCross LINEAR DOWN', () => {
  it('M = -period constant; momentum flat -> regime none, 0 crosses', () => {
    const data = buildLinearDown(40);
    const run = runLineMomentumDivergenceCross(data);
    for (let i = PERIOD; i < 40; i += 1) {
      expect(run.momentumValues[i] as number).toBe(-PERIOD);
    }
    expect(run.crosses).toHaveLength(0);
    expect(run.alignedBearishCount).toBe(0);
    expect(run.divergentBullishCount).toBe(0);
  });
});

describe('runLineMomentumDivergenceCross QUADRATIC UP', () => {
  it('aligned-bullish throughout post-warmup window, 0 crosses', () => {
    const data = buildQuadraticUp(40);
    const run = runLineMomentumDivergenceCross(data);
    expect(run.alignedBullishCount).toBeGreaterThan(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineMomentumDivergenceCross SQRT UP (divergence)', () => {
  it('produces at least one divergent-bearish cross when price up but momentum decays', () => {
    const data = buildSqrtUp(60);
    const run = runLineMomentumDivergenceCross(data);
    expect(run.divergentBearishCount).toBeGreaterThan(0);
    const hasBearish = run.crosses.some((c) => c.kind === 'bearish');
    expect(hasBearish).toBe(true);
  });
});

describe('runLineMomentumDivergenceCross misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineMomentumDivergenceCrossPoint[] = [
      { x: 2, close: 1 },
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    const run = runLineMomentumDivergenceCross(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConst(WARMUP, 50);
    const run = runLineMomentumDivergenceCross(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineMomentumDivergenceCross([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom period', () => {
    const data = buildLinearUp(40);
    const run = runLineMomentumDivergenceCross(data, { period: 5 });
    expect(run.period).toBe(5);
    for (let i = 5; i < 40; i += 1) {
      expect(run.momentumValues[i] as number).toBe(5);
    }
  });

  it('regime counts sum to series length', () => {
    const data = buildQuadraticUp(40);
    const run = runLineMomentumDivergenceCross(data);
    expect(
      run.alignedBullishCount +
        run.alignedBearishCount +
        run.divergentBullishCount +
        run.divergentBearishCount +
        run.noneCount,
    ).toBe(40);
  });

  it('cross counts match crosses length', () => {
    const data = buildSqrtUp(60);
    const run = runLineMomentumDivergenceCross(data);
    expect(run.bullishCrossCount + run.bearishCrossCount).toBe(
      run.crosses.length,
    );
  });
});

describe('computeLineMomentumDivergenceCrossLayout', () => {
  it('renders SVG paths for QUADRATIC UP', () => {
    const data = buildQuadraticUp(40);
    const layout = computeLineMomentumDivergenceCrossLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(40);
    expect(layout.momentumPath).toContain('M ');
  });

  it('QUADRATIC UP produces 0 cross markers', () => {
    const layout = computeLineMomentumDivergenceCrossLayout({
      data: buildQuadraticUp(40),
    });
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('SQRT UP produces > 0 cross markers', () => {
    const layout = computeLineMomentumDivergenceCrossLayout({
      data: buildSqrtUp(60),
    });
    expect(layout.crossMarkers.length).toBeGreaterThan(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineMomentumDivergenceCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.momentumPath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineMomentumDivergenceCrossLayout({
      data: buildQuadraticUp(40),
      width: 600,
      height: 320,
      padding: 32,
      panelGap: 8,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(320);
  });

  it('pads degenerate priceMin === priceMax', () => {
    const data = buildConst(40, 100);
    const layout = computeLineMomentumDivergenceCrossLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });

  it('ensures zero is visible in momentum panel', () => {
    const data = buildLinearUp(40);
    const layout = computeLineMomentumDivergenceCrossLayout({ data });
    expect(layout.oscMin).toBeLessThanOrEqual(0);
    expect(layout.oscMax).toBeGreaterThanOrEqual(0);
  });
});

describe('describeLineMomentumDivergenceCrossChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineMomentumDivergenceCrossChart([])).toBe('No data');
  });

  it('mentions bar count, period, reversal warning', () => {
    const desc = describeLineMomentumDivergenceCrossChart(
      buildQuadraticUp(40),
    );
    expect(desc).toContain('40 bars');
    expect(desc).toContain('period 10');
    expect(desc).toContain('reversal warning');
    expect(desc).toContain('disagreement');
  });
});

describe('<ChartLineMomentumDivergenceCross /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildQuadraticUp(40);
    const { container } = render(
      <ChartLineMomentumDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-momentum-divergence-cross"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-period')).toBe(String(PERIOD));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(
      <ChartLineMomentumDivergenceCross data={[]} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-divergence-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders momentum path and zero line', () => {
    const data = buildQuadraticUp(40);
    const { container } = render(
      <ChartLineMomentumDivergenceCross data={data} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-divergence-cross-momentum-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-divergence-cross-zero-line"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildQuadraticUp(40);
    const { container } = render(
      <ChartLineMomentumDivergenceCross data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-divergence-cross-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildQuadraticUp(40);
    const { container } = render(
      <ChartLineMomentumDivergenceCross data={data} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-momentum-divergence-cross-badge"]',
    );
    expect(badge?.textContent).toContain('period 10');
    expect(badge?.textContent).toContain('divergences 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildQuadraticUp(40);
    const { container } = render(
      <ChartLineMomentumDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-momentum-divergence-cross"]',
    );
    expect(root?.getAttribute('aria-label')).toBe(
      'Momentum oscillator divergence-cross chart',
    );
  });

  it('exposes cross-count counter (zero for QUADRATIC UP)', () => {
    const data = buildQuadraticUp(40);
    const { container } = render(
      <ChartLineMomentumDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-momentum-divergence-cross"]',
    );
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('exposes non-zero cross-count for SQRT UP', () => {
    const data = buildSqrtUp(60);
    const { container } = render(
      <ChartLineMomentumDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-momentum-divergence-cross"]',
    );
    const crossCount = Number(root?.getAttribute('data-cross-count'));
    expect(crossCount).toBeGreaterThan(0);
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildQuadraticUp(40);
    const { container } = render(
      <ChartLineMomentumDivergenceCross
        data={data}
        hiddenSeries={['momentum']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-divergence-cross-momentum-path"]',
      ),
    ).toBeNull();
  });

  it('renders two legend buttons (close, Momentum)', () => {
    const data = buildQuadraticUp(40);
    const { container } = render(
      <ChartLineMomentumDivergenceCross data={data} />,
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-momentum-divergence-cross-legend"] button',
    );
    expect(buttons).toHaveLength(2);
  });

  it('exposes aligned-bullish-count for QUADRATIC UP', () => {
    const data = buildQuadraticUp(40);
    const { container } = render(
      <ChartLineMomentumDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-momentum-divergence-cross"]',
    );
    const c = Number(root?.getAttribute('data-aligned-bullish-count'));
    expect(c).toBeGreaterThan(0);
  });
});
