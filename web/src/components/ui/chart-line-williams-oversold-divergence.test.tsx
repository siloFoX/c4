import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineWilliamsOversoldDivergence,
  DEFAULT_CHART_LINE_WILLIAMS_OVERSOLD_DIVERGENCE_HEIGHT,
  DEFAULT_CHART_LINE_WILLIAMS_OVERSOLD_DIVERGENCE_OVERSOLD_LEVEL,
  DEFAULT_CHART_LINE_WILLIAMS_OVERSOLD_DIVERGENCE_PADDING,
  DEFAULT_CHART_LINE_WILLIAMS_OVERSOLD_DIVERGENCE_PANEL_GAP,
  DEFAULT_CHART_LINE_WILLIAMS_OVERSOLD_DIVERGENCE_PERIOD,
  DEFAULT_CHART_LINE_WILLIAMS_OVERSOLD_DIVERGENCE_WIDTH,
  classifyLineWilliamsOversoldDivergenceBias,
  classifyLineWilliamsOversoldDivergenceRegime,
  computeLineWilliamsOversoldDivergence,
  computeLineWilliamsOversoldDivergenceLayout,
  describeLineWilliamsOversoldDivergenceChart,
  detectLineWilliamsOversoldDivergenceCrosses,
  getLineWilliamsOversoldDivergenceFinitePoints,
  normalizeLineWilliamsOversoldDivergenceLength,
  normalizeLineWilliamsOversoldDivergenceLevel,
  runLineWilliamsOversoldDivergence,
  type ChartLineWilliamsOversoldDivergencePoint,
  type ChartLineWilliamsOversoldDivergenceRegime,
} from './chart-line-williams-oversold-divergence';

const PERIOD = 14;
const OVERSOLD = -80;
const WARMUP = PERIOD + 1; // 15

const buildConst = (
  n: number,
  k: number,
): ChartLineWilliamsOversoldDivergencePoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: k + 1,
    low: k - 1,
    close: k,
  }));

const buildLinearUp = (
  n: number,
): ChartLineWilliamsOversoldDivergencePoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: i + 1,
    low: i - 1,
    close: i,
  }));

const buildLinearDown = (
  n: number,
): ChartLineWilliamsOversoldDivergencePoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: -i + 1,
    low: -i - 1,
    close: -i,
  }));

describe('ChartLineWilliamsOversoldDivergence defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_WILLIAMS_OVERSOLD_DIVERGENCE_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_WILLIAMS_OVERSOLD_DIVERGENCE_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_WILLIAMS_OVERSOLD_DIVERGENCE_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_WILLIAMS_OVERSOLD_DIVERGENCE_PANEL_GAP).toBe(
      12,
    );
  });

  it('exports canonical Williams %R tuning', () => {
    expect(DEFAULT_CHART_LINE_WILLIAMS_OVERSOLD_DIVERGENCE_PERIOD).toBe(14);
    expect(
      DEFAULT_CHART_LINE_WILLIAMS_OVERSOLD_DIVERGENCE_OVERSOLD_LEVEL,
    ).toBe(-80);
  });
});

describe('getLineWilliamsOversoldDivergenceFinitePoints', () => {
  it('filters NaN/Infinity and high<low', () => {
    const points = [
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: NaN, high: 2, low: 1, close: 1.5 },
      { x: 1, high: 1, low: 2, close: 1.5 },
      { x: 2, high: Infinity, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ];
    expect(getLineWilliamsOversoldDivergenceFinitePoints(points)).toEqual([
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ]);
  });

  it('returns empty for null/non-array', () => {
    expect(getLineWilliamsOversoldDivergenceFinitePoints(null)).toEqual([]);
    expect(
      getLineWilliamsOversoldDivergenceFinitePoints(undefined),
    ).toEqual([]);
  });
});

describe('normalizeLineWilliamsOversoldDivergenceLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineWilliamsOversoldDivergenceLength(14.7, 14)).toBe(14);
  });
  it('falls back on invalid', () => {
    expect(normalizeLineWilliamsOversoldDivergenceLength(0, 14)).toBe(14);
    expect(normalizeLineWilliamsOversoldDivergenceLength(NaN, 14)).toBe(14);
  });
});

describe('normalizeLineWilliamsOversoldDivergenceLevel', () => {
  it('keeps finite values (including negatives)', () => {
    expect(normalizeLineWilliamsOversoldDivergenceLevel(-90, -80)).toBe(-90);
    expect(normalizeLineWilliamsOversoldDivergenceLevel(-70, -80)).toBe(-70);
  });
  it('falls back on non-finite', () => {
    expect(normalizeLineWilliamsOversoldDivergenceLevel(NaN, -80)).toBe(-80);
    expect(
      normalizeLineWilliamsOversoldDivergenceLevel(Infinity, -80),
    ).toBe(-80);
  });
});

describe('computeLineWilliamsOversoldDivergence CONST', () => {
  it('%R = -50 (constant midpoint) from i = period - 1 onwards', () => {
    const data = buildConst(40, 50);
    const out = computeLineWilliamsOversoldDivergence(data);
    for (let i = 0; i < PERIOD - 1; i += 1) expect(out[i]).toBeNull();
    for (let i = PERIOD - 1; i < 40; i += 1) {
      expect(out[i] as number).toBeCloseTo(-50, 9);
    }
  });
});

describe('computeLineWilliamsOversoldDivergence LINEAR UP', () => {
  it('%R = -6.667 (constant) -- NOT in oversold (close near high)', () => {
    const data = buildLinearUp(40);
    const out = computeLineWilliamsOversoldDivergence(data);
    for (let i = PERIOD - 1; i < 40; i += 1) {
      expect(out[i] as number).toBeCloseTo((-1 / (PERIOD + 1)) * 100, 6);
      expect(out[i] as number).toBeGreaterThan(OVERSOLD);
    }
  });
});

describe('computeLineWilliamsOversoldDivergence LINEAR DOWN', () => {
  it('%R = -93.333 (constant) -- IN oversold zone (close near low)', () => {
    const data = buildLinearDown(40);
    const out = computeLineWilliamsOversoldDivergence(data);
    for (let i = PERIOD - 1; i < 40; i += 1) {
      expect(out[i] as number).toBeCloseTo((-PERIOD / (PERIOD + 1)) * 100, 6);
      expect(out[i] as number).toBeLessThanOrEqual(OVERSOLD);
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineWilliamsOversoldDivergence([])).toEqual([]);
  });
});

describe('classifyLineWilliamsOversoldDivergenceRegime', () => {
  it('null inputs -> none', () => {
    expect(
      classifyLineWilliamsOversoldDivergenceRegime(null, 1, 1, 1),
    ).toBe('none');
    expect(
      classifyLineWilliamsOversoldDivergenceRegime(1, null, 1, 1),
    ).toBe('none');
    expect(
      classifyLineWilliamsOversoldDivergenceRegime(1, 1, null, 1),
    ).toBe('none');
    expect(
      classifyLineWilliamsOversoldDivergenceRegime(1, 1, 1, null),
    ).toBe('none');
  });

  it('price up + %R up -> aligned-bullish', () => {
    expect(
      classifyLineWilliamsOversoldDivergenceRegime(10, 5, -70, -90),
    ).toBe('aligned-bullish');
  });

  it('price down + %R down -> aligned-bearish', () => {
    expect(
      classifyLineWilliamsOversoldDivergenceRegime(5, 10, -90, -70),
    ).toBe('aligned-bearish');
  });

  it('price down + %R up -> divergent-bullish (PRIMARY at oversold)', () => {
    expect(
      classifyLineWilliamsOversoldDivergenceRegime(5, 10, -70, -90),
    ).toBe('divergent-bullish');
  });

  it('price up + %R down -> divergent-bearish', () => {
    expect(
      classifyLineWilliamsOversoldDivergenceRegime(10, 5, -90, -70),
    ).toBe('divergent-bearish');
  });

  it('flat price or flat %R -> none', () => {
    expect(
      classifyLineWilliamsOversoldDivergenceRegime(5, 5, -70, -90),
    ).toBe('none');
    expect(
      classifyLineWilliamsOversoldDivergenceRegime(10, 5, -90, -90),
    ).toBe('none');
  });
});

describe('classifyLineWilliamsOversoldDivergenceBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineWilliamsOversoldDivergenceBias(-70, -90)).toBe('up');
    expect(classifyLineWilliamsOversoldDivergenceBias(-90, -70)).toBe(
      'down',
    );
    expect(classifyLineWilliamsOversoldDivergenceBias(-80, -80)).toBe(
      'flat',
    );
    expect(classifyLineWilliamsOversoldDivergenceBias(null, -80)).toBe(
      'none',
    );
    expect(classifyLineWilliamsOversoldDivergenceBias(-80, null)).toBe(
      'none',
    );
  });
});

describe('detectLineWilliamsOversoldDivergenceCrosses', () => {
  it('fires BULLISH on entry into divergent-bullish IN oversold zone', () => {
    const series = Array.from({ length: 3 }, (_, i) => ({
      x: i,
      high: i + 1,
      low: i - 1,
      close: i,
    }));
    const regimes: ChartLineWilliamsOversoldDivergenceRegime[] = [
      'none',
      'aligned-bearish',
      'divergent-bullish',
    ];
    const wr: Array<number | null> = [-90, -95, -85]; // all <= -80
    const out = detectLineWilliamsOversoldDivergenceCrosses(
      series,
      regimes,
      wr,
      OVERSOLD,
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
  });

  it('does NOT fire when divergent-bullish but %R ABOVE oversold zone', () => {
    const series = Array.from({ length: 3 }, (_, i) => ({
      x: i,
      high: i + 1,
      low: i - 1,
      close: i,
    }));
    const regimes: ChartLineWilliamsOversoldDivergenceRegime[] = [
      'none',
      'aligned-bearish',
      'divergent-bullish',
    ];
    const wr: Array<number | null> = [-40, -45, -35]; // all > -80
    const out = detectLineWilliamsOversoldDivergenceCrosses(
      series,
      regimes,
      wr,
      OVERSOLD,
    );
    expect(out).toHaveLength(0);
  });

  it('fires BEARISH on entry into divergent-bearish IN oversold zone', () => {
    const series = Array.from({ length: 3 }, (_, i) => ({
      x: i,
      high: i + 1,
      low: i - 1,
      close: i,
    }));
    const regimes: ChartLineWilliamsOversoldDivergenceRegime[] = [
      'none',
      'aligned-bullish',
      'divergent-bearish',
    ];
    const wr: Array<number | null> = [-85, -82, -95]; // all <= -80
    const out = detectLineWilliamsOversoldDivergenceCrosses(
      series,
      regimes,
      wr,
      OVERSOLD,
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
  });

  it('does not fire when state persists (no transition)', () => {
    const series = Array.from({ length: 3 }, (_, i) => ({
      x: i,
      high: i + 1,
      low: i - 1,
      close: i,
    }));
    const regimes: ChartLineWilliamsOversoldDivergenceRegime[] = [
      'divergent-bullish',
      'divergent-bullish',
      'divergent-bullish',
    ];
    const wr: Array<number | null> = [-90, -90, -90];
    const out = detectLineWilliamsOversoldDivergenceCrosses(
      series,
      regimes,
      wr,
      OVERSOLD,
    );
    expect(out).toHaveLength(0);
  });

  it('skips null %R bars', () => {
    const series = Array.from({ length: 3 }, (_, i) => ({
      x: i,
      high: i + 1,
      low: i - 1,
      close: i,
    }));
    const regimes: ChartLineWilliamsOversoldDivergenceRegime[] = [
      'none',
      'aligned-bearish',
      'divergent-bullish',
    ];
    const wr: Array<number | null> = [null, null, null];
    const out = detectLineWilliamsOversoldDivergenceCrosses(
      series,
      regimes,
      wr,
      OVERSOLD,
    );
    expect(out).toHaveLength(0);
  });

  it('bias up when %R rises at the cross', () => {
    const series = Array.from({ length: 2 }, (_, i) => ({
      x: i,
      high: i + 1,
      low: i - 1,
      close: i,
    }));
    const regimes: ChartLineWilliamsOversoldDivergenceRegime[] = [
      'aligned-bearish',
      'divergent-bullish',
    ];
    const wr: Array<number | null> = [-95, -85];
    const out = detectLineWilliamsOversoldDivergenceCrosses(
      series,
      regimes,
      wr,
      OVERSOLD,
    );
    expect(out[0]?.bias).toBe('up');
  });
});

describe('runLineWilliamsOversoldDivergence CONST', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST ${K}: %R = -50 (not oversold), regime none, 0 crosses`, () => {
      const data = buildConst(40, K);
      const run = runLineWilliamsOversoldDivergence(data);
      expect(run.period).toBe(PERIOD);
      expect(run.oversoldLevel).toBe(OVERSOLD);
      for (let i = PERIOD - 1; i < 40; i += 1) {
        expect(run.wrValues[i] as number).toBeCloseTo(-50, 9);
      }
      expect(run.oversoldCount).toBe(0);
      expect(run.crosses).toHaveLength(0);
      expect(run.ok).toBe(true);
    });
  }
});

describe('runLineWilliamsOversoldDivergence LINEAR UP', () => {
  it('%R NOT in oversold zone (overbought), 0 crosses (gate filters)', () => {
    const data = buildLinearUp(40);
    const run = runLineWilliamsOversoldDivergence(data);
    for (let i = PERIOD - 1; i < 40; i += 1) {
      expect(run.wrValues[i] as number).toBeCloseTo(
        (-1 / (PERIOD + 1)) * 100,
        6,
      );
    }
    expect(run.oversoldCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineWilliamsOversoldDivergence LINEAR DOWN', () => {
  it('%R in oversold zone but flat slope -> regime none, 0 crosses', () => {
    const data = buildLinearDown(40);
    const run = runLineWilliamsOversoldDivergence(data);
    for (let i = PERIOD - 1; i < 40; i += 1) {
      expect(run.wrValues[i] as number).toBeCloseTo(
        (-PERIOD / (PERIOD + 1)) * 100,
        6,
      );
    }
    expect(run.oversoldCount).toBeGreaterThan(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineWilliamsOversoldDivergence misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineWilliamsOversoldDivergencePoint[] = [
      { x: 2, high: 2, low: 0, close: 1 },
      { x: 0, high: 2, low: 0, close: 1 },
      { x: 1, high: 2, low: 0, close: 1 },
    ];
    const run = runLineWilliamsOversoldDivergence(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConst(WARMUP, 50);
    const run = runLineWilliamsOversoldDivergence(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineWilliamsOversoldDivergence([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom period and oversoldLevel', () => {
    const data = buildLinearDown(40);
    const run = runLineWilliamsOversoldDivergence(data, {
      period: 7,
      oversoldLevel: -90,
    });
    expect(run.period).toBe(7);
    expect(run.oversoldLevel).toBe(-90);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearDown(40);
    const run = runLineWilliamsOversoldDivergence(data);
    expect(
      run.alignedBullishCount +
        run.alignedBearishCount +
        run.divergentBullishCount +
        run.divergentBearishCount +
        run.noneCount,
    ).toBe(40);
  });
});

describe('computeLineWilliamsOversoldDivergenceLayout', () => {
  it('renders SVG paths for LINEAR DOWN', () => {
    const data = buildLinearDown(40);
    const layout = computeLineWilliamsOversoldDivergenceLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(40);
    expect(layout.wrPath).toContain('M ');
  });

  it('panel hard-locked to [-100, 0]', () => {
    const layout = computeLineWilliamsOversoldDivergenceLayout({
      data: buildLinearDown(40),
    });
    expect(layout.oscMin).toBe(-100);
    expect(layout.oscMax).toBe(0);
  });

  it('LINEAR DOWN produces 0 cross markers (flat %R in oversold)', () => {
    const layout = computeLineWilliamsOversoldDivergenceLayout({
      data: buildLinearDown(40),
    });
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('LINEAR UP produces 0 cross markers (%R outside oversold)', () => {
    const layout = computeLineWilliamsOversoldDivergenceLayout({
      data: buildLinearUp(40),
    });
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineWilliamsOversoldDivergenceLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.wrPath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineWilliamsOversoldDivergenceLayout({
      data: buildLinearDown(40),
      width: 600,
      height: 320,
      padding: 32,
      panelGap: 8,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(320);
  });

  it('reference lines: overbought (-20) above midline (-50) above oversold (-80)', () => {
    const layout = computeLineWilliamsOversoldDivergenceLayout({
      data: buildLinearDown(40),
    });
    expect(layout.overboughtLineY).toBeLessThan(layout.zeroLineY);
    expect(layout.zeroLineY).toBeLessThan(layout.oversoldLineY);
  });
});

describe('describeLineWilliamsOversoldDivergenceChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineWilliamsOversoldDivergenceChart([])).toBe('No data');
  });

  it('mentions bar count, period, oversold, bottom reversal warning', () => {
    const desc = describeLineWilliamsOversoldDivergenceChart(
      buildLinearDown(40),
    );
    expect(desc).toContain('40 bars');
    expect(desc).toContain('period 14');
    expect(desc).toContain('oversold -80');
    expect(desc).toContain('bottom reversal warning');
  });
});

describe('<ChartLineWilliamsOversoldDivergence /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearDown(40);
    const { container } = render(
      <ChartLineWilliamsOversoldDivergence data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-williams-oversold-divergence"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-period')).toBe(String(PERIOD));
    expect(root?.getAttribute('data-oversold-level')).toBe(String(OVERSOLD));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(
      <ChartLineWilliamsOversoldDivergence data={[]} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-oversold-divergence-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders %R path and reference lines', () => {
    const data = buildLinearDown(40);
    const { container } = render(
      <ChartLineWilliamsOversoldDivergence data={data} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-oversold-divergence-wr-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-oversold-divergence-oversold-line"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-oversold-divergence-overbought-line"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearDown(40);
    const { container } = render(
      <ChartLineWilliamsOversoldDivergence data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-oversold-divergence-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildLinearDown(40);
    const { container } = render(
      <ChartLineWilliamsOversoldDivergence data={data} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-williams-oversold-divergence-badge"]',
    );
    expect(badge?.textContent).toContain('period 14');
    expect(badge?.textContent).toContain('oversold -80');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearDown(40);
    const { container } = render(
      <ChartLineWilliamsOversoldDivergence data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-williams-oversold-divergence"]',
    );
    expect(root?.getAttribute('aria-label')).toBe(
      'Williams %R oversold-zone divergence chart',
    );
  });

  it('exposes data-cross-count counter (zero for flat LINEAR DOWN)', () => {
    const data = buildLinearDown(40);
    const { container } = render(
      <ChartLineWilliamsOversoldDivergence data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-williams-oversold-divergence"]',
    );
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('exposes data-oversold-count > 0 for LINEAR DOWN (close near low)', () => {
    const data = buildLinearDown(40);
    const { container } = render(
      <ChartLineWilliamsOversoldDivergence data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-williams-oversold-divergence"]',
    );
    const c = Number(root?.getAttribute('data-oversold-count'));
    expect(c).toBeGreaterThan(0);
  });

  it('exposes data-oversold-count = 0 for LINEAR UP (close near high)', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineWilliamsOversoldDivergence data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-williams-oversold-divergence"]',
    );
    expect(root?.getAttribute('data-oversold-count')).toBe('0');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearDown(40);
    const { container } = render(
      <ChartLineWilliamsOversoldDivergence data={data} hiddenSeries={['wr']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-oversold-divergence-wr-path"]',
      ),
    ).toBeNull();
  });

  it('renders two legend buttons (close, %R)', () => {
    const data = buildLinearDown(40);
    const { container } = render(
      <ChartLineWilliamsOversoldDivergence data={data} />,
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-williams-oversold-divergence-legend"] button',
    );
    expect(buttons).toHaveLength(2);
  });
});
