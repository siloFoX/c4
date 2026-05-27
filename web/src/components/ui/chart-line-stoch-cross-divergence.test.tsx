import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineStochCrossDivergence,
  DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_HEIGHT,
  DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_PADDING,
  DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_PANEL_GAP,
  DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_PERIOD,
  DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_SMOOTH_D,
  DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_SMOOTH_K,
  DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_WIDTH,
  applyLineStochCrossDivergenceSma,
  classifyLineStochCrossDivergenceBias,
  classifyLineStochCrossDivergenceRegime,
  computeLineStochCrossDivergence,
  computeLineStochCrossDivergenceLayout,
  describeLineStochCrossDivergenceChart,
  detectLineStochCrossDivergenceCrosses,
  getLineStochCrossDivergenceFinitePoints,
  normalizeLineStochCrossDivergenceLength,
  runLineStochCrossDivergence,
  type ChartLineStochCrossDivergencePoint,
  type ChartLineStochCrossDivergenceRegime,
} from './chart-line-stoch-cross-divergence';

const PERIOD = 14;
const SMOOTH_K = 3;
const SMOOTH_D = 3;
const WARMUP = PERIOD + SMOOTH_K + SMOOTH_D - 2; // 18

const K_UP = 280 / 3; // ~ 93.33 LINEAR UP
const K_DOWN = 20 / 3; // ~ 6.67 LINEAR DOWN

const buildConstBand = (
  n: number,
  k: number,
): ChartLineStochCrossDivergencePoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: k + 1,
    low: k - 1,
    close: k,
  }));

const buildLinearUp = (n: number): ChartLineStochCrossDivergencePoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: i + 1,
    low: i - 1,
    close: i,
  }));

const buildLinearDown = (n: number): ChartLineStochCrossDivergencePoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: -i + 1,
    low: -i - 1,
    close: -i,
  }));

describe('ChartLineStochCrossDivergence defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_PANEL_GAP).toBe(12);
  });

  it('exports canonical Stochastic tuning', () => {
    expect(DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_PERIOD).toBe(14);
    expect(DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_SMOOTH_K).toBe(3);
    expect(DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_SMOOTH_D).toBe(3);
  });
});

describe('getLineStochCrossDivergenceFinitePoints', () => {
  it('filters NaN/Infinity and high<low', () => {
    const points = [
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: NaN, high: 2, low: 1, close: 1.5 },
      { x: 1, high: 1, low: 2, close: 1.5 },
      { x: 2, high: Infinity, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ];
    expect(getLineStochCrossDivergenceFinitePoints(points)).toEqual([
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ]);
  });
});

describe('normalizeLineStochCrossDivergenceLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineStochCrossDivergenceLength(14.7, 14)).toBe(14);
    expect(normalizeLineStochCrossDivergenceLength(0, 14)).toBe(14);
  });
});

describe('applyLineStochCrossDivergenceSma', () => {
  it('SMA over linear input', () => {
    const out = applyLineStochCrossDivergenceSma([0, 1, 2, 3, 4, 5], 3);
    expect(out[2]).toBe(1);
    expect(out[5]).toBe(4);
  });
  it('passthrough at length 1', () => {
    expect(applyLineStochCrossDivergenceSma([1, 2, 3], 1)).toEqual([
      1, 2, 3,
    ]);
  });
});

describe('computeLineStochCrossDivergence CONST band', () => {
  it('rawK = smoothK = D = 50 (midline)', () => {
    const data = buildConstBand(40, 50);
    const out = computeLineStochCrossDivergence(data);
    for (let i = PERIOD - 1; i < 40; i += 1) {
      expect(out.rawK[i] as number).toBe(50);
    }
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.smoothK[i] as number).toBe(50);
      expect(out.d[i] as number).toBe(50);
    }
  });
});

describe('computeLineStochCrossDivergence LINEAR UP', () => {
  it('rawK = K = D = 280/3 (overbought zone), no spread', () => {
    const data = buildLinearUp(40);
    const out = computeLineStochCrossDivergence(data);
    for (let i = PERIOD - 1; i < 40; i += 1) {
      expect(out.rawK[i] as number).toBeCloseTo(K_UP, 9);
    }
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.smoothK[i] as number).toBeCloseTo(K_UP, 9);
      expect(out.d[i] as number).toBeCloseTo(K_UP, 9);
    }
  });
});

describe('computeLineStochCrossDivergence LINEAR DOWN', () => {
  it('rawK = K = D = 20/3 (oversold zone, mirror)', () => {
    const data = buildLinearDown(40);
    const out = computeLineStochCrossDivergence(data);
    for (let i = PERIOD - 1; i < 40; i += 1) {
      expect(out.rawK[i] as number).toBeCloseTo(K_DOWN, 9);
    }
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.smoothK[i] as number).toBeCloseTo(K_DOWN, 9);
      expect(out.d[i] as number).toBeCloseTo(K_DOWN, 9);
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineStochCrossDivergence([])).toEqual({
      rawK: [],
      smoothK: [],
      d: [],
    });
  });
});

describe('classifyLineStochCrossDivergenceRegime', () => {
  it('null -> none', () => {
    expect(classifyLineStochCrossDivergenceRegime(null, 1, 50, 40)).toBe(
      'none',
    );
  });
  it('priceUp + KUp -> aligned-bullish', () => {
    expect(classifyLineStochCrossDivergenceRegime(2, 1, 50, 40)).toBe(
      'aligned-bullish',
    );
  });
  it('priceDown + KDown -> aligned-bearish', () => {
    expect(classifyLineStochCrossDivergenceRegime(1, 2, 40, 50)).toBe(
      'aligned-bearish',
    );
  });
  it('priceDown + KUp -> divergent-bullish', () => {
    expect(classifyLineStochCrossDivergenceRegime(1, 2, 50, 40)).toBe(
      'divergent-bullish',
    );
  });
  it('priceUp + KDown -> divergent-bearish', () => {
    expect(classifyLineStochCrossDivergenceRegime(2, 1, 40, 50)).toBe(
      'divergent-bearish',
    );
  });
});

describe('classifyLineStochCrossDivergenceBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineStochCrossDivergenceBias(60, 50)).toBe('up');
    expect(classifyLineStochCrossDivergenceBias(40, 50)).toBe('down');
    expect(classifyLineStochCrossDivergenceBias(50, 50)).toBe('flat');
    expect(classifyLineStochCrossDivergenceBias(null, 50)).toBe('none');
  });
});

describe('detectLineStochCrossDivergenceCrosses', () => {
  it('fires bullish on K-over-D cross AND divergent-bullish regime', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const regimes: ChartLineStochCrossDivergenceRegime[] = [
      'none',
      'none',
      'divergent-bullish',
      'none',
    ];
    const k: Array<number | null> = [30, 35, 45, 50];
    const d: Array<number | null> = [40, 40, 40, 40];
    const out = detectLineStochCrossDivergenceCrosses(
      series,
      regimes,
      k,
      d,
    );
    // i=2: prevK=35 <= prevD=40, curK=45 > curD=40 -> raw bullish cross AND regime divergent-bullish -> fire
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
    expect(out[0]?.index).toBe(2);
  });

  it('does NOT fire bullish when K-over-D cross but regime is aligned-bullish (not divergent)', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const regimes: ChartLineStochCrossDivergenceRegime[] = [
      'none',
      'none',
      'aligned-bullish',
      'none',
    ];
    const k: Array<number | null> = [30, 35, 45, 50];
    const d: Array<number | null> = [40, 40, 40, 40];
    const out = detectLineStochCrossDivergenceCrosses(
      series,
      regimes,
      k,
      d,
    );
    // Cross happens at i=2 but regime is aligned, not divergent -> filtered out.
    expect(out).toHaveLength(0);
  });

  it('fires bearish on K-over-D cross AND divergent-bearish regime', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const regimes: ChartLineStochCrossDivergenceRegime[] = [
      'none',
      'none',
      'divergent-bearish',
      'none',
    ];
    const k: Array<number | null> = [70, 65, 55, 50];
    const d: Array<number | null> = [60, 60, 60, 60];
    const out = detectLineStochCrossDivergenceCrosses(
      series,
      regimes,
      k,
      d,
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
  });

  it('does NOT fire bearish when K-over-D cross but regime is aligned-bearish', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const regimes: ChartLineStochCrossDivergenceRegime[] = [
      'none',
      'none',
      'aligned-bearish',
      'none',
    ];
    const k: Array<number | null> = [70, 65, 55, 50];
    const d: Array<number | null> = [60, 60, 60, 60];
    const out = detectLineStochCrossDivergenceCrosses(
      series,
      regimes,
      k,
      d,
    );
    expect(out).toHaveLength(0);
  });

  it('skips null-window bars', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const regimes: ChartLineStochCrossDivergenceRegime[] = [
      'none',
      'none',
      'divergent-bullish',
      'none',
    ];
    const k: Array<number | null> = [null, null, 45, 50];
    const d: Array<number | null> = [null, null, 40, 40];
    const out = detectLineStochCrossDivergenceCrosses(
      series,
      regimes,
      k,
      d,
    );
    // At i=2, prevK=null -> skip.
    expect(out).toHaveLength(0);
  });
});

describe('runLineStochCrossDivergence CONST band', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST band ${K}: K=D=50, regime none, 0 crosses`, () => {
      const data = buildConstBand(60, K);
      const run = runLineStochCrossDivergence(data);
      expect(run.period).toBe(PERIOD);
      expect(run.smoothK).toBe(SMOOTH_K);
      expect(run.smoothD).toBe(SMOOTH_D);
      for (let i = WARMUP; i < 60; i += 1) {
        expect(run.smoothKValues[i] as number).toBe(50);
        expect(run.dValues[i] as number).toBe(50);
      }
      expect(run.divergentBullishCount).toBe(0);
      expect(run.divergentBearishCount).toBe(0);
      expect(run.crosses).toHaveLength(0);
      expect(run.ok).toBe(true);
    });
  }
});

describe('runLineStochCrossDivergence LINEAR UP', () => {
  it('K = D = 280/3, regime none (Kflat), 0 crosses', () => {
    const data = buildLinearUp(60);
    const run = runLineStochCrossDivergence(data);
    for (let i = WARMUP; i < 60; i += 1) {
      expect(run.smoothKValues[i] as number).toBeCloseTo(K_UP, 9);
      expect(run.dValues[i] as number).toBeCloseTo(K_UP, 9);
    }
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineStochCrossDivergence LINEAR DOWN', () => {
  it('K = D = 20/3 (mirror), regime none, 0 crosses', () => {
    const data = buildLinearDown(60);
    const run = runLineStochCrossDivergence(data);
    for (let i = WARMUP; i < 60; i += 1) {
      expect(run.smoothKValues[i] as number).toBeCloseTo(K_DOWN, 9);
      expect(run.dValues[i] as number).toBeCloseTo(K_DOWN, 9);
    }
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineStochCrossDivergence misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineStochCrossDivergencePoint[] = [
      { x: 2, high: 1, low: 0, close: 0.5 },
      { x: 0, high: 1, low: 0, close: 0.5 },
      { x: 1, high: 1, low: 0, close: 0.5 },
    ];
    const run = runLineStochCrossDivergence(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConstBand(18, 50);
    const run = runLineStochCrossDivergence(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineStochCrossDivergence([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom tuning', () => {
    const data = buildLinearUp(60);
    const run = runLineStochCrossDivergence(data, {
      period: 7,
      smoothK: 5,
      smoothD: 5,
    });
    expect(run.period).toBe(7);
    expect(run.smoothK).toBe(5);
    expect(run.smoothD).toBe(5);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(60);
    const run = runLineStochCrossDivergence(data);
    expect(
      run.alignedBullishCount +
        run.alignedBearishCount +
        run.divergentBullishCount +
        run.divergentBearishCount +
        run.noneCount,
    ).toBe(60);
  });
});

describe('computeLineStochCrossDivergenceLayout', () => {
  it('renders SVG paths for LINEAR UP', () => {
    const data = buildLinearUp(60);
    const layout = computeLineStochCrossDivergenceLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(60);
    expect(layout.kPath).toContain('M ');
    expect(layout.dPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('panel hard-locked to [0, 100]', () => {
    const layout = computeLineStochCrossDivergenceLayout({
      data: buildLinearUp(60),
    });
    expect(layout.oscMin).toBe(0);
    expect(layout.oscMax).toBe(100);
  });

  it('falls back when no data', () => {
    const layout = computeLineStochCrossDivergenceLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineStochCrossDivergenceLayout({
      data: buildLinearUp(60),
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
    const layout = computeLineStochCrossDivergenceLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });
});

describe('describeLineStochCrossDivergenceChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineStochCrossDivergenceChart([])).toBe('No data');
  });

  it('mentions bar count, periods, smoothed momentum crossover divergence trigger', () => {
    const desc = describeLineStochCrossDivergenceChart(buildLinearUp(60));
    expect(desc).toContain('60 bars');
    expect(desc).toContain('period 14');
    expect(desc).toContain('smoothK 3');
    expect(desc).toContain('smoothD 3');
    expect(desc).toContain('smoothed momentum crossover divergence');
    expect(desc).toContain('bias coloring');
  });
});

describe('<ChartLineStochCrossDivergence /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineStochCrossDivergence data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-stoch-cross-divergence"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-period')).toBe(String(PERIOD));
    expect(root?.getAttribute('data-smooth-k')).toBe(String(SMOOTH_K));
    expect(root?.getAttribute('data-smooth-d')).toBe(String(SMOOTH_D));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(<ChartLineStochCrossDivergence data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-cross-divergence-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders K + D paths', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineStochCrossDivergence data={data} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-cross-divergence-k-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-cross-divergence-d-path"]',
      ),
    ).not.toBeNull();
  });

  it('renders centerline by default', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineStochCrossDivergence data={data} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-cross-divergence-centerline"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineStochCrossDivergence data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-cross-divergence-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineStochCrossDivergence data={data} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-stoch-cross-divergence-badge"]',
    );
    expect(badge?.textContent).toContain('period 14');
    expect(badge?.textContent).toContain('smoothK 3');
    expect(badge?.textContent).toContain('smoothD 3');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineStochCrossDivergence data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-stoch-cross-divergence"]',
    );
    expect(root?.getAttribute('aria-label')).toBe(
      'Stochastic K/D cross-divergence chart',
    );
  });

  it('exposes data-cross-count counter for LINEAR UP', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineStochCrossDivergence data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-stoch-cross-divergence"]',
    );
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineStochCrossDivergence data={data} hiddenSeries={['d']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-cross-divergence-d-path"]',
      ),
    ).toBeNull();
  });
});
