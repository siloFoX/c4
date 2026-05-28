import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineWilliamsOverboughtDivergence,
  DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_HEIGHT,
  DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_OVERBOUGHT_LEVEL,
  DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_PADDING,
  DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_PANEL_GAP,
  DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_PERIOD,
  DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_WIDTH,
  classifyLineWilliamsOverboughtDivergenceBias,
  classifyLineWilliamsOverboughtDivergenceRegime,
  computeLineWilliamsOverboughtDivergence,
  computeLineWilliamsOverboughtDivergenceLayout,
  describeLineWilliamsOverboughtDivergenceChart,
  detectLineWilliamsOverboughtDivergenceCrosses,
  getLineWilliamsOverboughtDivergenceFinitePoints,
  normalizeLineWilliamsOverboughtDivergenceLength,
  normalizeLineWilliamsOverboughtDivergenceLevel,
  runLineWilliamsOverboughtDivergence,
  type ChartLineWilliamsOverboughtDivergencePoint,
  type ChartLineWilliamsOverboughtDivergenceRegime,
} from './chart-line-williams-overbought-divergence';

const PERIOD = 14;
const OVERBOUGHT = -20;
const WARMUP = PERIOD + 1; // 15

const buildConst = (
  n: number,
  k: number,
): ChartLineWilliamsOverboughtDivergencePoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: k + 1,
    low: k - 1,
    close: k,
  }));

const buildLinearUp = (
  n: number,
): ChartLineWilliamsOverboughtDivergencePoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: i + 1,
    low: i - 1,
    close: i,
  }));

const buildLinearDown = (
  n: number,
): ChartLineWilliamsOverboughtDivergencePoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: -i + 1,
    low: -i - 1,
    close: -i,
  }));

describe('ChartLineWilliamsOverboughtDivergence defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_HEIGHT).toBe(
      460,
    );
    expect(DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_PADDING).toBe(
      44,
    );
    expect(DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_PANEL_GAP).toBe(
      12,
    );
  });

  it('exports canonical Williams %R tuning', () => {
    expect(DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_PERIOD).toBe(14);
    expect(
      DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_OVERBOUGHT_LEVEL,
    ).toBe(-20);
  });
});

describe('getLineWilliamsOverboughtDivergenceFinitePoints', () => {
  it('filters NaN/Infinity and high<low', () => {
    const points = [
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: NaN, high: 2, low: 1, close: 1.5 },
      { x: 1, high: 1, low: 2, close: 1.5 },
      { x: 2, high: Infinity, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ];
    expect(getLineWilliamsOverboughtDivergenceFinitePoints(points)).toEqual([
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ]);
  });

  it('returns empty for null/non-array', () => {
    expect(getLineWilliamsOverboughtDivergenceFinitePoints(null)).toEqual([]);
    expect(
      getLineWilliamsOverboughtDivergenceFinitePoints(undefined),
    ).toEqual([]);
  });
});

describe('normalizeLineWilliamsOverboughtDivergenceLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineWilliamsOverboughtDivergenceLength(14.7, 14)).toBe(
      14,
    );
  });
  it('falls back on invalid', () => {
    expect(normalizeLineWilliamsOverboughtDivergenceLength(0, 14)).toBe(14);
    expect(normalizeLineWilliamsOverboughtDivergenceLength(NaN, 14)).toBe(14);
  });
});

describe('normalizeLineWilliamsOverboughtDivergenceLevel', () => {
  it('keeps finite values (including negatives)', () => {
    expect(normalizeLineWilliamsOverboughtDivergenceLevel(-10, -20)).toBe(
      -10,
    );
    expect(normalizeLineWilliamsOverboughtDivergenceLevel(-30, -20)).toBe(
      -30,
    );
  });
  it('falls back on non-finite', () => {
    expect(normalizeLineWilliamsOverboughtDivergenceLevel(NaN, -20)).toBe(
      -20,
    );
    expect(
      normalizeLineWilliamsOverboughtDivergenceLevel(Infinity, -20),
    ).toBe(-20);
  });
});

describe('computeLineWilliamsOverboughtDivergence CONST', () => {
  it('%R = -50 (constant midpoint) from i = period - 1 onwards', () => {
    const data = buildConst(40, 50);
    const out = computeLineWilliamsOverboughtDivergence(data);
    for (let i = 0; i < PERIOD - 1; i += 1) expect(out[i]).toBeNull();
    for (let i = PERIOD - 1; i < 40; i += 1) {
      expect(out[i] as number).toBeCloseTo(-50, 9);
    }
  });
});

describe('computeLineWilliamsOverboughtDivergence LINEAR UP', () => {
  it('%R = -6.667 (constant) -- in overbought zone (close near high)', () => {
    const data = buildLinearUp(40);
    const out = computeLineWilliamsOverboughtDivergence(data);
    for (let i = PERIOD - 1; i < 40; i += 1) {
      expect(out[i] as number).toBeCloseTo((-1 / (PERIOD + 1)) * 100, 6);
      expect(out[i] as number).toBeGreaterThanOrEqual(OVERBOUGHT);
    }
  });
});

describe('computeLineWilliamsOverboughtDivergence LINEAR DOWN', () => {
  it('%R = -93.333 (constant) -- NOT in overbought (close near low)', () => {
    const data = buildLinearDown(40);
    const out = computeLineWilliamsOverboughtDivergence(data);
    for (let i = PERIOD - 1; i < 40; i += 1) {
      expect(out[i] as number).toBeCloseTo((-PERIOD / (PERIOD + 1)) * 100, 6);
      expect(out[i] as number).toBeLessThan(OVERBOUGHT);
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineWilliamsOverboughtDivergence([])).toEqual([]);
  });
});

describe('classifyLineWilliamsOverboughtDivergenceRegime', () => {
  it('null inputs -> none', () => {
    expect(
      classifyLineWilliamsOverboughtDivergenceRegime(null, 1, 1, 1),
    ).toBe('none');
    expect(
      classifyLineWilliamsOverboughtDivergenceRegime(1, null, 1, 1),
    ).toBe('none');
    expect(
      classifyLineWilliamsOverboughtDivergenceRegime(1, 1, null, 1),
    ).toBe('none');
    expect(
      classifyLineWilliamsOverboughtDivergenceRegime(1, 1, 1, null),
    ).toBe('none');
  });

  it('price up + %R up -> aligned-bullish', () => {
    expect(
      classifyLineWilliamsOverboughtDivergenceRegime(10, 5, -10, -30),
    ).toBe('aligned-bullish');
  });

  it('price down + %R down -> aligned-bearish', () => {
    expect(
      classifyLineWilliamsOverboughtDivergenceRegime(5, 10, -30, -10),
    ).toBe('aligned-bearish');
  });

  it('price down + %R up -> divergent-bullish', () => {
    expect(
      classifyLineWilliamsOverboughtDivergenceRegime(5, 10, -10, -30),
    ).toBe('divergent-bullish');
  });

  it('price up + %R down -> divergent-bearish (PRIMARY at overbought)', () => {
    expect(
      classifyLineWilliamsOverboughtDivergenceRegime(10, 5, -30, -10),
    ).toBe('divergent-bearish');
  });

  it('flat price or flat %R -> none', () => {
    expect(
      classifyLineWilliamsOverboughtDivergenceRegime(5, 5, -10, -30),
    ).toBe('none');
    expect(
      classifyLineWilliamsOverboughtDivergenceRegime(10, 5, -10, -10),
    ).toBe('none');
  });
});

describe('classifyLineWilliamsOverboughtDivergenceBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineWilliamsOverboughtDivergenceBias(-10, -30)).toBe('up');
    expect(classifyLineWilliamsOverboughtDivergenceBias(-30, -10)).toBe(
      'down',
    );
    expect(classifyLineWilliamsOverboughtDivergenceBias(-20, -20)).toBe(
      'flat',
    );
    expect(classifyLineWilliamsOverboughtDivergenceBias(null, -20)).toBe(
      'none',
    );
    expect(classifyLineWilliamsOverboughtDivergenceBias(-20, null)).toBe(
      'none',
    );
  });
});

describe('detectLineWilliamsOverboughtDivergenceCrosses', () => {
  it('fires BEARISH on entry into divergent-bearish IN overbought zone', () => {
    const series = Array.from({ length: 3 }, (_, i) => ({
      x: i,
      high: i + 1,
      low: i - 1,
      close: i,
    }));
    const regimes: ChartLineWilliamsOverboughtDivergenceRegime[] = [
      'none',
      'aligned-bullish',
      'divergent-bearish',
    ];
    const wr: Array<number | null> = [-10, -5, -15]; // all >= -20
    const out = detectLineWilliamsOverboughtDivergenceCrosses(
      series,
      regimes,
      wr,
      OVERBOUGHT,
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
  });

  it('does NOT fire when divergent-bearish but %R BELOW overbought zone', () => {
    const series = Array.from({ length: 3 }, (_, i) => ({
      x: i,
      high: i + 1,
      low: i - 1,
      close: i,
    }));
    const regimes: ChartLineWilliamsOverboughtDivergenceRegime[] = [
      'none',
      'aligned-bullish',
      'divergent-bearish',
    ];
    const wr: Array<number | null> = [-60, -55, -70]; // all < -20
    const out = detectLineWilliamsOverboughtDivergenceCrosses(
      series,
      regimes,
      wr,
      OVERBOUGHT,
    );
    expect(out).toHaveLength(0);
  });

  it('fires BULLISH on entry into divergent-bullish IN overbought zone', () => {
    const series = Array.from({ length: 3 }, (_, i) => ({
      x: i,
      high: i + 1,
      low: i - 1,
      close: i,
    }));
    const regimes: ChartLineWilliamsOverboughtDivergenceRegime[] = [
      'none',
      'aligned-bearish',
      'divergent-bullish',
    ];
    const wr: Array<number | null> = [-15, -18, -5]; // all >= -20
    const out = detectLineWilliamsOverboughtDivergenceCrosses(
      series,
      regimes,
      wr,
      OVERBOUGHT,
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
  });

  it('does not fire when state persists (no transition)', () => {
    const series = Array.from({ length: 3 }, (_, i) => ({
      x: i,
      high: i + 1,
      low: i - 1,
      close: i,
    }));
    const regimes: ChartLineWilliamsOverboughtDivergenceRegime[] = [
      'divergent-bearish',
      'divergent-bearish',
      'divergent-bearish',
    ];
    const wr: Array<number | null> = [-10, -10, -10];
    const out = detectLineWilliamsOverboughtDivergenceCrosses(
      series,
      regimes,
      wr,
      OVERBOUGHT,
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
    const regimes: ChartLineWilliamsOverboughtDivergenceRegime[] = [
      'none',
      'aligned-bullish',
      'divergent-bearish',
    ];
    const wr: Array<number | null> = [null, null, null];
    const out = detectLineWilliamsOverboughtDivergenceCrosses(
      series,
      regimes,
      wr,
      OVERBOUGHT,
    );
    expect(out).toHaveLength(0);
  });

  it('bias down when %R falls at the cross', () => {
    const series = Array.from({ length: 2 }, (_, i) => ({
      x: i,
      high: i + 1,
      low: i - 1,
      close: i,
    }));
    const regimes: ChartLineWilliamsOverboughtDivergenceRegime[] = [
      'aligned-bullish',
      'divergent-bearish',
    ];
    const wr: Array<number | null> = [-5, -15];
    const out = detectLineWilliamsOverboughtDivergenceCrosses(
      series,
      regimes,
      wr,
      OVERBOUGHT,
    );
    expect(out[0]?.bias).toBe('down');
  });
});

describe('runLineWilliamsOverboughtDivergence CONST', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST ${K}: %R = -50 (not overbought), regime none, 0 crosses`, () => {
      const data = buildConst(40, K);
      const run = runLineWilliamsOverboughtDivergence(data);
      expect(run.period).toBe(PERIOD);
      expect(run.overboughtLevel).toBe(OVERBOUGHT);
      for (let i = PERIOD - 1; i < 40; i += 1) {
        expect(run.wrValues[i] as number).toBeCloseTo(-50, 9);
      }
      expect(run.overboughtCount).toBe(0);
      expect(run.crosses).toHaveLength(0);
      expect(run.ok).toBe(true);
    });
  }
});

describe('runLineWilliamsOverboughtDivergence LINEAR UP', () => {
  it('%R in overbought zone but flat slope -> regime none, 0 crosses', () => {
    const data = buildLinearUp(40);
    const run = runLineWilliamsOverboughtDivergence(data);
    for (let i = PERIOD - 1; i < 40; i += 1) {
      expect(run.wrValues[i] as number).toBeCloseTo(
        (-1 / (PERIOD + 1)) * 100,
        6,
      );
    }
    expect(run.overboughtCount).toBeGreaterThan(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineWilliamsOverboughtDivergence LINEAR DOWN', () => {
  it('%R NOT in overbought zone (oversold), 0 crosses (gate filters)', () => {
    const data = buildLinearDown(40);
    const run = runLineWilliamsOverboughtDivergence(data);
    for (let i = PERIOD - 1; i < 40; i += 1) {
      expect(run.wrValues[i] as number).toBeCloseTo(
        (-PERIOD / (PERIOD + 1)) * 100,
        6,
      );
    }
    expect(run.overboughtCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineWilliamsOverboughtDivergence misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineWilliamsOverboughtDivergencePoint[] = [
      { x: 2, high: 2, low: 0, close: 1 },
      { x: 0, high: 2, low: 0, close: 1 },
      { x: 1, high: 2, low: 0, close: 1 },
    ];
    const run = runLineWilliamsOverboughtDivergence(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConst(WARMUP, 50);
    const run = runLineWilliamsOverboughtDivergence(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineWilliamsOverboughtDivergence([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom period and overboughtLevel', () => {
    const data = buildLinearUp(40);
    const run = runLineWilliamsOverboughtDivergence(data, {
      period: 7,
      overboughtLevel: -10,
    });
    expect(run.period).toBe(7);
    expect(run.overboughtLevel).toBe(-10);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(40);
    const run = runLineWilliamsOverboughtDivergence(data);
    expect(
      run.alignedBullishCount +
        run.alignedBearishCount +
        run.divergentBullishCount +
        run.divergentBearishCount +
        run.noneCount,
    ).toBe(40);
  });
});

describe('computeLineWilliamsOverboughtDivergenceLayout', () => {
  it('renders SVG paths for LINEAR UP', () => {
    const data = buildLinearUp(40);
    const layout = computeLineWilliamsOverboughtDivergenceLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(40);
    expect(layout.wrPath).toContain('M ');
  });

  it('panel hard-locked to [-100, 0]', () => {
    const layout = computeLineWilliamsOverboughtDivergenceLayout({
      data: buildLinearUp(40),
    });
    expect(layout.oscMin).toBe(-100);
    expect(layout.oscMax).toBe(0);
  });

  it('LINEAR UP produces 0 cross markers (flat %R in overbought)', () => {
    const layout = computeLineWilliamsOverboughtDivergenceLayout({
      data: buildLinearUp(40),
    });
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('LINEAR DOWN produces 0 cross markers (%R outside overbought)', () => {
    const layout = computeLineWilliamsOverboughtDivergenceLayout({
      data: buildLinearDown(40),
    });
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineWilliamsOverboughtDivergenceLayout({
      data: [],
    });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.wrPath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineWilliamsOverboughtDivergenceLayout({
      data: buildLinearUp(40),
      width: 600,
      height: 320,
      padding: 32,
      panelGap: 8,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(320);
  });

  it('reference lines: overbought (-20) above midline (-50) above oversold (-80)', () => {
    const layout = computeLineWilliamsOverboughtDivergenceLayout({
      data: buildLinearUp(40),
    });
    // higher %R (overbought -20) renders at smaller y (toward top)
    expect(layout.overboughtLineY).toBeLessThan(layout.zeroLineY);
    expect(layout.zeroLineY).toBeLessThan(layout.oversoldLineY);
  });
});

describe('describeLineWilliamsOverboughtDivergenceChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineWilliamsOverboughtDivergenceChart([])).toBe('No data');
  });

  it('mentions bar count, period, overbought, top reversal warning', () => {
    const desc = describeLineWilliamsOverboughtDivergenceChart(
      buildLinearUp(40),
    );
    expect(desc).toContain('40 bars');
    expect(desc).toContain('period 14');
    expect(desc).toContain('overbought -20');
    expect(desc).toContain('top reversal warning');
  });
});

describe('<ChartLineWilliamsOverboughtDivergence /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineWilliamsOverboughtDivergence data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-williams-overbought-divergence"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-period')).toBe(String(PERIOD));
    expect(root?.getAttribute('data-overbought-level')).toBe(
      String(OVERBOUGHT),
    );
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(
      <ChartLineWilliamsOverboughtDivergence data={[]} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-overbought-divergence-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders %R path and reference lines', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineWilliamsOverboughtDivergence data={data} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-overbought-divergence-wr-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-overbought-divergence-overbought-line"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-overbought-divergence-zero-line"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineWilliamsOverboughtDivergence
        data={data}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-overbought-divergence-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineWilliamsOverboughtDivergence data={data} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-williams-overbought-divergence-badge"]',
    );
    expect(badge?.textContent).toContain('period 14');
    expect(badge?.textContent).toContain('overbought -20');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineWilliamsOverboughtDivergence data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-williams-overbought-divergence"]',
    );
    expect(root?.getAttribute('aria-label')).toBe(
      'Williams %R overbought-zone divergence chart',
    );
  });

  it('exposes data-cross-count counter (zero for flat LINEAR UP)', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineWilliamsOverboughtDivergence data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-williams-overbought-divergence"]',
    );
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('exposes data-overbought-count > 0 for LINEAR UP (close near high)', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineWilliamsOverboughtDivergence data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-williams-overbought-divergence"]',
    );
    const c = Number(root?.getAttribute('data-overbought-count'));
    expect(c).toBeGreaterThan(0);
  });

  it('exposes data-overbought-count = 0 for LINEAR DOWN (close near low)', () => {
    const data = buildLinearDown(40);
    const { container } = render(
      <ChartLineWilliamsOverboughtDivergence data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-williams-overbought-divergence"]',
    );
    expect(root?.getAttribute('data-overbought-count')).toBe('0');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineWilliamsOverboughtDivergence
        data={data}
        hiddenSeries={['wr']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-overbought-divergence-wr-path"]',
      ),
    ).toBeNull();
  });

  it('renders two legend buttons (close, %R)', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineWilliamsOverboughtDivergence data={data} />,
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-williams-overbought-divergence-legend"] button',
    );
    expect(buttons).toHaveLength(2);
  });
});
