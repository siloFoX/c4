import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineAdxPosNegDivergence,
  DEFAULT_CHART_LINE_ADX_POS_NEG_DIVERGENCE_HEIGHT,
  DEFAULT_CHART_LINE_ADX_POS_NEG_DIVERGENCE_PADDING,
  DEFAULT_CHART_LINE_ADX_POS_NEG_DIVERGENCE_PANEL_GAP,
  DEFAULT_CHART_LINE_ADX_POS_NEG_DIVERGENCE_PERIOD,
  DEFAULT_CHART_LINE_ADX_POS_NEG_DIVERGENCE_WIDTH,
  classifyLineAdxPosNegDivergenceBias,
  classifyLineAdxPosNegDivergenceRegime,
  computeLineAdxPosNegDivergence,
  computeLineAdxPosNegDivergenceLayout,
  describeLineAdxPosNegDivergenceChart,
  detectLineAdxPosNegDivergenceCrosses,
  getLineAdxPosNegDivergenceFinitePoints,
  normalizeLineAdxPosNegDivergenceLength,
  runLineAdxPosNegDivergence,
  type ChartLineAdxPosNegDivergencePoint,
  type ChartLineAdxPosNegDivergenceRegime,
} from './chart-line-adx-pos-neg-divergence';

const PERIOD = 14;
const WARMUP = PERIOD; // 14

const buildConstBand = (
  n: number,
  k: number,
): ChartLineAdxPosNegDivergencePoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: k + 1,
    low: k - 1,
    close: k,
  }));

const buildLinearUp = (n: number): ChartLineAdxPosNegDivergencePoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: i + 1,
    low: i - 1,
    close: i,
  }));

const buildLinearDown = (n: number): ChartLineAdxPosNegDivergencePoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: -i + 1,
    low: -i - 1,
    close: -i,
  }));

describe('ChartLineAdxPosNegDivergence defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_ADX_POS_NEG_DIVERGENCE_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_ADX_POS_NEG_DIVERGENCE_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_ADX_POS_NEG_DIVERGENCE_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_ADX_POS_NEG_DIVERGENCE_PANEL_GAP).toBe(12);
  });

  it('exports canonical ADX tuning', () => {
    expect(DEFAULT_CHART_LINE_ADX_POS_NEG_DIVERGENCE_PERIOD).toBe(14);
  });
});

describe('getLineAdxPosNegDivergenceFinitePoints', () => {
  it('filters NaN/Infinity and high<low', () => {
    const points = [
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: NaN, high: 2, low: 1, close: 1.5 },
      { x: 1, high: 1, low: 2, close: 1.5 },
      { x: 2, high: Infinity, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ];
    expect(getLineAdxPosNegDivergenceFinitePoints(points)).toEqual([
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ]);
  });

  it('returns empty for null/non-array', () => {
    expect(getLineAdxPosNegDivergenceFinitePoints(null)).toEqual([]);
    expect(getLineAdxPosNegDivergenceFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineAdxPosNegDivergenceLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineAdxPosNegDivergenceLength(14.7, 14)).toBe(14);
    expect(normalizeLineAdxPosNegDivergenceLength(0, 14)).toBe(14);
  });
});

describe('computeLineAdxPosNegDivergence CONST band', () => {
  it('+DI = -DI = 0 (no directional movement)', () => {
    const data = buildConstBand(40, 50);
    const out = computeLineAdxPosNegDivergence(data);
    for (let i = PERIOD; i < 40; i += 1) {
      expect(out.plusDI[i] as number).toBe(0);
      expect(out.minusDI[i] as number).toBe(0);
    }
  });
});

describe('computeLineAdxPosNegDivergence LINEAR UP', () => {
  it('+DI = 50, -DI = 0 (pure bullish directional movement)', () => {
    const data = buildLinearUp(40);
    const out = computeLineAdxPosNegDivergence(data);
    for (let i = PERIOD; i < 40; i += 1) {
      expect(out.plusDI[i] as number).toBeCloseTo(50, 9);
      expect(out.minusDI[i] as number).toBeCloseTo(0, 9);
    }
  });
});

describe('computeLineAdxPosNegDivergence LINEAR DOWN', () => {
  it('+DI = 0, -DI = 50 (pure bearish directional movement)', () => {
    const data = buildLinearDown(40);
    const out = computeLineAdxPosNegDivergence(data);
    for (let i = PERIOD; i < 40; i += 1) {
      expect(out.plusDI[i] as number).toBeCloseTo(0, 9);
      expect(out.minusDI[i] as number).toBeCloseTo(50, 9);
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineAdxPosNegDivergence([])).toEqual({
      plusDI: [],
      minusDI: [],
    });
  });
});

describe('classifyLineAdxPosNegDivergenceRegime', () => {
  it('null -> none', () => {
    expect(classifyLineAdxPosNegDivergenceRegime(null, 1, 5, 4)).toBe(
      'none',
    );
  });
  it('plusUp + minusUp -> aligned-bullish', () => {
    expect(classifyLineAdxPosNegDivergenceRegime(60, 50, 60, 50)).toBe(
      'aligned-bullish',
    );
  });
  it('plusDown + minusDown -> aligned-bearish', () => {
    expect(classifyLineAdxPosNegDivergenceRegime(40, 50, 40, 50)).toBe(
      'aligned-bearish',
    );
  });
  it('plusUp + minusDown -> divergent-bullish (canonical bull confirmation)', () => {
    expect(classifyLineAdxPosNegDivergenceRegime(60, 50, 40, 50)).toBe(
      'divergent-bullish',
    );
  });
  it('plusDown + minusUp -> divergent-bearish (canonical bear confirmation)', () => {
    expect(classifyLineAdxPosNegDivergenceRegime(40, 50, 60, 50)).toBe(
      'divergent-bearish',
    );
  });
  it('flat sides -> none', () => {
    expect(classifyLineAdxPosNegDivergenceRegime(50, 50, 60, 50)).toBe(
      'none',
    );
    expect(classifyLineAdxPosNegDivergenceRegime(60, 50, 50, 50)).toBe(
      'none',
    );
  });
});

describe('classifyLineAdxPosNegDivergenceBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineAdxPosNegDivergenceBias(60, 50)).toBe('up');
    expect(classifyLineAdxPosNegDivergenceBias(40, 50)).toBe('down');
    expect(classifyLineAdxPosNegDivergenceBias(50, 50)).toBe('flat');
    expect(classifyLineAdxPosNegDivergenceBias(null, 50)).toBe('none');
  });
});

describe('detectLineAdxPosNegDivergenceCrosses', () => {
  it('fires bullish on transition into divergent-bullish', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const regimes: ChartLineAdxPosNegDivergenceRegime[] = [
      'aligned-bullish',
      'aligned-bullish',
      'divergent-bullish',
      'divergent-bullish',
    ];
    const diff: Array<number | null> = [1, 2, 3, 4];
    const out = detectLineAdxPosNegDivergenceCrosses(series, regimes, diff);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
    expect(out[0]?.index).toBe(2);
  });

  it('fires bearish on transition into divergent-bearish', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const regimes: ChartLineAdxPosNegDivergenceRegime[] = [
      'aligned-bearish',
      'aligned-bearish',
      'divergent-bearish',
      'divergent-bearish',
    ];
    const diff: Array<number | null> = [4, 3, 2, 1];
    const out = detectLineAdxPosNegDivergenceCrosses(series, regimes, diff);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
  });

  it('does not double-fire while in same divergent state', () => {
    const series = Array.from({ length: 5 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const regimes: ChartLineAdxPosNegDivergenceRegime[] = [
      'none',
      'divergent-bullish',
      'divergent-bullish',
      'divergent-bullish',
      'aligned-bullish',
    ];
    const diff: Array<number | null> = [1, 2, 3, 4, 5];
    const out = detectLineAdxPosNegDivergenceCrosses(series, regimes, diff);
    expect(out).toHaveLength(1);
  });
});

describe('runLineAdxPosNegDivergence CONST band', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST band ${K}: +DI = -DI = 0, regime none, 0 crosses`, () => {
      const data = buildConstBand(40, K);
      const run = runLineAdxPosNegDivergence(data);
      expect(run.period).toBe(PERIOD);
      for (let i = WARMUP; i < 40; i += 1) {
        expect(run.plusDIValues[i] as number).toBe(0);
        expect(run.minusDIValues[i] as number).toBe(0);
      }
      expect(run.divergentBullishCount).toBe(0);
      expect(run.divergentBearishCount).toBe(0);
      expect(run.crosses).toHaveLength(0);
      expect(run.ok).toBe(true);
    });
  }
});

describe('runLineAdxPosNegDivergence LINEAR UP', () => {
  it('+DI = 50, -DI = 0 (constants), regime none, 0 crosses', () => {
    const data = buildLinearUp(40);
    const run = runLineAdxPosNegDivergence(data);
    for (let i = WARMUP; i < 40; i += 1) {
      expect(run.plusDIValues[i] as number).toBeCloseTo(50, 9);
      expect(run.minusDIValues[i] as number).toBeCloseTo(0, 9);
    }
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineAdxPosNegDivergence LINEAR DOWN', () => {
  it('+DI = 0, -DI = 50 (mirror), regime none, 0 crosses', () => {
    const data = buildLinearDown(40);
    const run = runLineAdxPosNegDivergence(data);
    for (let i = WARMUP; i < 40; i += 1) {
      expect(run.plusDIValues[i] as number).toBeCloseTo(0, 9);
      expect(run.minusDIValues[i] as number).toBeCloseTo(50, 9);
    }
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineAdxPosNegDivergence misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineAdxPosNegDivergencePoint[] = [
      { x: 2, high: 1, low: 0, close: 0.5 },
      { x: 0, high: 1, low: 0, close: 0.5 },
      { x: 1, high: 1, low: 0, close: 0.5 },
    ];
    const run = runLineAdxPosNegDivergence(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConstBand(15, 50);
    const run = runLineAdxPosNegDivergence(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineAdxPosNegDivergence([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom period', () => {
    const data = buildLinearUp(60);
    const run = runLineAdxPosNegDivergence(data, { period: 7 });
    expect(run.period).toBe(7);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(40);
    const run = runLineAdxPosNegDivergence(data);
    expect(
      run.alignedBullishCount +
        run.alignedBearishCount +
        run.divergentBullishCount +
        run.divergentBearishCount +
        run.noneCount,
    ).toBe(40);
  });

  it('diff values reflect +DI - -DI', () => {
    const data = buildLinearUp(40);
    const run = runLineAdxPosNegDivergence(data);
    for (let i = WARMUP; i < 40; i += 1) {
      expect(run.diffValues[i] as number).toBeCloseTo(50, 9);
    }
  });
});

describe('computeLineAdxPosNegDivergenceLayout', () => {
  it('renders SVG paths for LINEAR UP', () => {
    const data = buildLinearUp(40);
    const layout = computeLineAdxPosNegDivergenceLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(40);
    expect(layout.plusDIPath).toContain('M ');
    expect(layout.minusDIPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('panel hard-locked to [0, 100]', () => {
    const layout = computeLineAdxPosNegDivergenceLayout({
      data: buildLinearUp(40),
    });
    expect(layout.oscMin).toBe(0);
    expect(layout.oscMax).toBe(100);
  });

  it('falls back when no data', () => {
    const layout = computeLineAdxPosNegDivergenceLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineAdxPosNegDivergenceLayout({
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
    const data = buildConstBand(40, 100);
    const layout = computeLineAdxPosNegDivergenceLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });
});

describe('describeLineAdxPosNegDivergenceChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineAdxPosNegDivergenceChart([])).toBe('No data');
  });

  it('mentions bar count, period, trend strength divergence', () => {
    const desc = describeLineAdxPosNegDivergenceChart(buildLinearUp(40));
    expect(desc).toContain('40 bars');
    expect(desc).toContain('period 14');
    expect(desc).toContain('trend strength divergence');
    expect(desc).toContain('bias coloring');
  });
});

describe('<ChartLineAdxPosNegDivergence /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineAdxPosNegDivergence data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-adx-pos-neg-divergence"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-period')).toBe(String(PERIOD));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(<ChartLineAdxPosNegDivergence data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-pos-neg-divergence-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders +DI and -DI paths', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineAdxPosNegDivergence data={data} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-pos-neg-divergence-plus-di-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-pos-neg-divergence-minus-di-path"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineAdxPosNegDivergence data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-pos-neg-divergence-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineAdxPosNegDivergence data={data} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-adx-pos-neg-divergence-badge"]',
    );
    expect(badge?.textContent).toContain('period 14');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineAdxPosNegDivergence data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-adx-pos-neg-divergence"]',
    );
    expect(root?.getAttribute('aria-label')).toBe(
      'ADX +DI / -DI divergence chart',
    );
  });

  it('exposes data-cross-count counter for LINEAR UP', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineAdxPosNegDivergence data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-adx-pos-neg-divergence"]',
    );
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineAdxPosNegDivergence
        data={data}
        hiddenSeries={['minusDI']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-pos-neg-divergence-minus-di-path"]',
      ),
    ).toBeNull();
  });
});
