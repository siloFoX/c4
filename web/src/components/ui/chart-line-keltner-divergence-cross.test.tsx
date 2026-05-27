import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineKeltnerDivergenceCross,
  DEFAULT_CHART_LINE_KELTNER_DIVERGENCE_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_KELTNER_DIVERGENCE_CROSS_MULTIPLIER,
  DEFAULT_CHART_LINE_KELTNER_DIVERGENCE_CROSS_PADDING,
  DEFAULT_CHART_LINE_KELTNER_DIVERGENCE_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_KELTNER_DIVERGENCE_CROSS_PERIOD,
  DEFAULT_CHART_LINE_KELTNER_DIVERGENCE_CROSS_WIDTH,
  applyLineKeltnerDivergenceCrossEma,
  classifyLineKeltnerDivergenceCrossBias,
  classifyLineKeltnerDivergenceCrossRegime,
  computeLineKeltnerDivergenceCross,
  computeLineKeltnerDivergenceCrossLayout,
  describeLineKeltnerDivergenceCrossChart,
  detectLineKeltnerDivergenceCrossCrosses,
  getLineKeltnerDivergenceCrossFinitePoints,
  normalizeLineKeltnerDivergenceCrossLength,
  normalizeLineKeltnerDivergenceCrossMultiplier,
  runLineKeltnerDivergenceCross,
  type ChartLineKeltnerDivergenceCrossPoint,
  type ChartLineKeltnerDivergenceCrossRegime,
} from './chart-line-keltner-divergence-cross';

const PERIOD = 20;
const MULT = 2;
const WARMUP = PERIOD; // 20

const buildConstBand = (
  n: number,
  k: number,
): ChartLineKeltnerDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: k + 1,
    low: k - 1,
    close: k,
  }));

const buildLinearUp = (n: number): ChartLineKeltnerDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: i + 1,
    low: i - 1,
    close: i,
  }));

const buildLinearDown = (n: number): ChartLineKeltnerDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: -i + 1,
    low: -i - 1,
    close: -i,
  }));

describe('ChartLineKeltnerDivergenceCross defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_KELTNER_DIVERGENCE_CROSS_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_KELTNER_DIVERGENCE_CROSS_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_KELTNER_DIVERGENCE_CROSS_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_KELTNER_DIVERGENCE_CROSS_PANEL_GAP).toBe(12);
  });

  it('exports canonical Keltner tuning', () => {
    expect(DEFAULT_CHART_LINE_KELTNER_DIVERGENCE_CROSS_PERIOD).toBe(20);
    expect(DEFAULT_CHART_LINE_KELTNER_DIVERGENCE_CROSS_MULTIPLIER).toBe(2);
  });
});

describe('getLineKeltnerDivergenceCrossFinitePoints', () => {
  it('filters NaN/Infinity and high<low', () => {
    const points = [
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: NaN, high: 2, low: 1, close: 1.5 },
      { x: 1, high: 1, low: 2, close: 1.5 },
      { x: 2, high: Infinity, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ];
    expect(getLineKeltnerDivergenceCrossFinitePoints(points)).toEqual([
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ]);
  });

  it('returns empty for null and non-array', () => {
    expect(getLineKeltnerDivergenceCrossFinitePoints(null)).toEqual([]);
    expect(getLineKeltnerDivergenceCrossFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizers', () => {
  it('floors finite >=1 length values', () => {
    expect(normalizeLineKeltnerDivergenceCrossLength(20.7, 20)).toBe(20);
    expect(normalizeLineKeltnerDivergenceCrossLength(0, 20)).toBe(20);
  });

  it('rejects non-positive multiplier', () => {
    expect(normalizeLineKeltnerDivergenceCrossMultiplier(2.5, 2)).toBe(2.5);
    expect(normalizeLineKeltnerDivergenceCrossMultiplier(0, 2)).toBe(2);
    expect(normalizeLineKeltnerDivergenceCrossMultiplier(-1, 2)).toBe(2);
  });
});

describe('applyLineKeltnerDivergenceCrossEma', () => {
  it('SMA-seeded EMA on linear input', () => {
    const values: Array<number | null> = Array.from(
      { length: 40 },
      (_, i) => i,
    );
    const out = applyLineKeltnerDivergenceCrossEma(values, 20);
    // SMA seed at i=19: mean of 0..19 = 9.5 = 19 - 9.5
    expect(out[19]).toBe(9.5);
    // Steady state: ema[i] = i - 9.5
    for (let i = 20; i < 40; i += 1) {
      expect(out[i] as number).toBeCloseTo(i - 9.5, 9);
    }
  });

  it('passthrough at length 1', () => {
    expect(applyLineKeltnerDivergenceCrossEma([1, 2, 3], 1)).toEqual([
      1, 2, 3,
    ]);
  });
});

describe('computeLineKeltnerDivergenceCross CONST band', () => {
  it('TR=2, ATR=2, midline=K constant, bands=K +/- 4', () => {
    const data = buildConstBand(40, 50);
    const out = computeLineKeltnerDivergenceCross(data);
    for (let i = PERIOD; i < 40; i += 1) {
      expect(out.atr[i] as number).toBe(2);
      expect(out.midline[i] as number).toBe(50);
      expect(out.upperBand[i] as number).toBe(54);
      expect(out.lowerBand[i] as number).toBe(46);
    }
  });
});

describe('computeLineKeltnerDivergenceCross LINEAR UP', () => {
  it('midline = i - 9.5, upper = i - 5.5, lower = i - 13.5', () => {
    const data = buildLinearUp(40);
    const out = computeLineKeltnerDivergenceCross(data);
    for (let i = PERIOD; i < 40; i += 1) {
      expect(out.atr[i] as number).toBeCloseTo(2, 9);
      expect(out.midline[i] as number).toBeCloseTo(i - 9.5, 9);
      expect(out.upperBand[i] as number).toBeCloseTo(i - 5.5, 9);
      expect(out.lowerBand[i] as number).toBeCloseTo(i - 13.5, 9);
    }
  });
});

describe('computeLineKeltnerDivergenceCross LINEAR DOWN', () => {
  it('midline = -i + 9.5 (mirror)', () => {
    const data = buildLinearDown(40);
    const out = computeLineKeltnerDivergenceCross(data);
    for (let i = PERIOD; i < 40; i += 1) {
      expect(out.midline[i] as number).toBeCloseTo(-i + 9.5, 9);
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineKeltnerDivergenceCross([])).toEqual({
      trueRange: [],
      atr: [],
      midline: [],
      upperBand: [],
      lowerBand: [],
    });
  });
});

describe('classifyLineKeltnerDivergenceCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineKeltnerDivergenceCrossRegime(null, 1, 5, 4)).toBe(
      'none',
    );
  });
  it('priceUp + midUp -> aligned-bullish', () => {
    expect(classifyLineKeltnerDivergenceCrossRegime(2, 1, 5, 4)).toBe(
      'aligned-bullish',
    );
  });
  it('priceDown + midDown -> aligned-bearish', () => {
    expect(classifyLineKeltnerDivergenceCrossRegime(1, 2, 4, 5)).toBe(
      'aligned-bearish',
    );
  });
  it('priceDown + midUp -> divergent-bullish', () => {
    expect(classifyLineKeltnerDivergenceCrossRegime(1, 2, 5, 4)).toBe(
      'divergent-bullish',
    );
  });
  it('priceUp + midDown -> divergent-bearish', () => {
    expect(classifyLineKeltnerDivergenceCrossRegime(2, 1, 4, 5)).toBe(
      'divergent-bearish',
    );
  });
  it('flat sides -> none', () => {
    expect(classifyLineKeltnerDivergenceCrossRegime(1, 1, 5, 4)).toBe(
      'none',
    );
    expect(classifyLineKeltnerDivergenceCrossRegime(2, 1, 5, 5)).toBe(
      'none',
    );
  });
});

describe('classifyLineKeltnerDivergenceCrossBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineKeltnerDivergenceCrossBias(60, 50)).toBe('up');
    expect(classifyLineKeltnerDivergenceCrossBias(40, 50)).toBe('down');
    expect(classifyLineKeltnerDivergenceCrossBias(50, 50)).toBe('flat');
    expect(classifyLineKeltnerDivergenceCrossBias(null, 50)).toBe('none');
  });
});

describe('detectLineKeltnerDivergenceCrossCrosses', () => {
  it('fires bullish on transition into divergent-bullish', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const regimes: ChartLineKeltnerDivergenceCrossRegime[] = [
      'aligned-bullish',
      'aligned-bullish',
      'divergent-bullish',
      'divergent-bullish',
    ];
    const mid: Array<number | null> = [1, 2, 3, 4];
    const out = detectLineKeltnerDivergenceCrossCrosses(series, regimes, mid);
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
    const regimes: ChartLineKeltnerDivergenceCrossRegime[] = [
      'aligned-bullish',
      'aligned-bullish',
      'divergent-bearish',
      'divergent-bearish',
    ];
    const mid: Array<number | null> = [4, 3, 2, 1];
    const out = detectLineKeltnerDivergenceCrossCrosses(series, regimes, mid);
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
    const regimes: ChartLineKeltnerDivergenceCrossRegime[] = [
      'none',
      'divergent-bullish',
      'divergent-bullish',
      'divergent-bullish',
      'aligned-bullish',
    ];
    const mid: Array<number | null> = [1, 2, 3, 4, 5];
    const out = detectLineKeltnerDivergenceCrossCrosses(series, regimes, mid);
    expect(out).toHaveLength(1);
  });
});

describe('runLineKeltnerDivergenceCross CONST band', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST band ${K}: midline=K flat, all none, 0 triggers`, () => {
      const data = buildConstBand(60, K);
      const run = runLineKeltnerDivergenceCross(data);
      expect(run.period).toBe(PERIOD);
      expect(run.multiplier).toBe(MULT);
      for (let i = WARMUP; i < 60; i += 1) {
        expect(run.midlineValues[i] as number).toBe(K);
      }
      expect(run.alignedBullishCount).toBe(0);
      expect(run.alignedBearishCount).toBe(0);
      expect(run.divergentBullishCount).toBe(0);
      expect(run.divergentBearishCount).toBe(0);
      expect(run.crosses).toHaveLength(0);
      expect(run.ok).toBe(true);
    });
  }
});

describe('runLineKeltnerDivergenceCross LINEAR UP', () => {
  it('midline = i - 9.5 (slope +1), regime aligned-bullish, 0 crosses', () => {
    const data = buildLinearUp(60);
    const run = runLineKeltnerDivergenceCross(data);
    for (let i = WARMUP; i < 60; i += 1) {
      expect(run.midlineValues[i] as number).toBeCloseTo(i - 9.5, 9);
    }
    expect(run.alignedBullishCount).toBeGreaterThan(0);
    expect(run.divergentBullishCount).toBe(0);
    expect(run.divergentBearishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineKeltnerDivergenceCross LINEAR DOWN', () => {
  it('midline = -i + 9.5, regime aligned-bearish, 0 crosses', () => {
    const data = buildLinearDown(60);
    const run = runLineKeltnerDivergenceCross(data);
    for (let i = WARMUP; i < 60; i += 1) {
      expect(run.midlineValues[i] as number).toBeCloseTo(-i + 9.5, 9);
    }
    expect(run.alignedBearishCount).toBeGreaterThan(0);
    expect(run.divergentBullishCount).toBe(0);
    expect(run.divergentBearishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineKeltnerDivergenceCross misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineKeltnerDivergenceCrossPoint[] = [
      { x: 2, high: 1, low: 0, close: 0.5 },
      { x: 0, high: 1, low: 0, close: 0.5 },
      { x: 1, high: 1, low: 0, close: 0.5 },
    ];
    const run = runLineKeltnerDivergenceCross(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConstBand(20, 50);
    const run = runLineKeltnerDivergenceCross(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineKeltnerDivergenceCross([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom tuning', () => {
    const data = buildLinearUp(60);
    const run = runLineKeltnerDivergenceCross(data, {
      period: 10,
      multiplier: 1.5,
    });
    expect(run.period).toBe(10);
    expect(run.multiplier).toBe(1.5);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(60);
    const run = runLineKeltnerDivergenceCross(data);
    expect(
      run.alignedBullishCount +
        run.alignedBearishCount +
        run.divergentBullishCount +
        run.divergentBearishCount +
        run.noneCount,
    ).toBe(60);
  });
});

describe('computeLineKeltnerDivergenceCrossLayout', () => {
  it('renders SVG paths for LINEAR UP', () => {
    const data = buildLinearUp(60);
    const layout = computeLineKeltnerDivergenceCrossLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(60);
    expect(layout.midlinePath).toContain('M ');
    expect(layout.upperBandPath).toContain('M ');
    expect(layout.lowerBandPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineKeltnerDivergenceCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.midlinePath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineKeltnerDivergenceCrossLayout({
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
    const layout = computeLineKeltnerDivergenceCrossLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });
});

describe('describeLineKeltnerDivergenceCrossChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineKeltnerDivergenceCrossChart([])).toBe('No data');
  });

  it('mentions bar count, period, multiplier, volatility-reversal warning', () => {
    const desc = describeLineKeltnerDivergenceCrossChart(buildLinearUp(60));
    expect(desc).toContain('60 bars');
    expect(desc).toContain('period 20');
    expect(desc).toContain('multiplier 2');
    expect(desc).toContain('volatility-reversal warning');
    expect(desc).toContain('bias coloring');
  });
});

describe('<ChartLineKeltnerDivergenceCross /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineKeltnerDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-keltner-divergence-cross"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-period')).toBe(String(PERIOD));
    expect(root?.getAttribute('data-multiplier')).toBe(String(MULT));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(
      <ChartLineKeltnerDivergenceCross data={[]} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-keltner-divergence-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders midline + upper + lower band paths', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineKeltnerDivergenceCross data={data} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-keltner-divergence-cross-midline-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-keltner-divergence-cross-upper-band-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-keltner-divergence-cross-lower-band-path"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineKeltnerDivergenceCross data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-keltner-divergence-cross-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineKeltnerDivergenceCross data={data} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-keltner-divergence-cross-badge"]',
    );
    expect(badge?.textContent).toContain('period 20');
    expect(badge?.textContent).toContain('mult 2');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineKeltnerDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-keltner-divergence-cross"]',
    );
    expect(root?.getAttribute('aria-label')).toBe(
      'Keltner divergence chart',
    );
  });

  it('exposes data-*-count counters for LINEAR UP', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineKeltnerDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-keltner-divergence-cross"]',
    );
    expect(root?.getAttribute('data-aligned-bullish-count')).not.toBe('0');
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineKeltnerDivergenceCross
        data={data}
        hiddenSeries={['midline']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-keltner-divergence-cross-midline-path"]',
      ),
    ).toBeNull();
  });
});
