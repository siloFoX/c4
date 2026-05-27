import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineAtrDivergenceCross,
  DEFAULT_CHART_LINE_ATR_DIVERGENCE_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_ATR_DIVERGENCE_CROSS_PADDING,
  DEFAULT_CHART_LINE_ATR_DIVERGENCE_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_ATR_DIVERGENCE_CROSS_PERIOD,
  DEFAULT_CHART_LINE_ATR_DIVERGENCE_CROSS_WIDTH,
  classifyLineAtrDivergenceCrossBias,
  classifyLineAtrDivergenceCrossRegime,
  computeLineAtrDivergenceCross,
  computeLineAtrDivergenceCrossLayout,
  describeLineAtrDivergenceCrossChart,
  detectLineAtrDivergenceCrossCrosses,
  getLineAtrDivergenceCrossFinitePoints,
  normalizeLineAtrDivergenceCrossLength,
  runLineAtrDivergenceCross,
  type ChartLineAtrDivergenceCrossPoint,
  type ChartLineAtrDivergenceCrossRegime,
} from './chart-line-atr-divergence-cross';

const PERIOD = 14;
const WARMUP = PERIOD; // ATR first valid at i = period

const buildConstBand = (
  n: number,
  k: number,
): ChartLineAtrDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: k + 1,
    low: k - 1,
    close: k,
  }));

const buildLinearUp = (n: number): ChartLineAtrDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: i + 1,
    low: i - 1,
    close: i,
  }));

const buildLinearDown = (n: number): ChartLineAtrDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: -i + 1,
    low: -i - 1,
    close: -i,
  }));

describe('ChartLineAtrDivergenceCross defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_ATR_DIVERGENCE_CROSS_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_ATR_DIVERGENCE_CROSS_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_ATR_DIVERGENCE_CROSS_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_ATR_DIVERGENCE_CROSS_PANEL_GAP).toBe(12);
  });

  it('exports canonical ATR tuning', () => {
    expect(DEFAULT_CHART_LINE_ATR_DIVERGENCE_CROSS_PERIOD).toBe(14);
  });
});

describe('getLineAtrDivergenceCrossFinitePoints', () => {
  it('filters NaN/Infinity and high<low', () => {
    const points = [
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: NaN, high: 2, low: 1, close: 1.5 },
      { x: 1, high: 1, low: 2, close: 1.5 },
      { x: 2, high: Infinity, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ];
    expect(getLineAtrDivergenceCrossFinitePoints(points)).toEqual([
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ]);
  });

  it('returns empty for null and non-array', () => {
    expect(getLineAtrDivergenceCrossFinitePoints(null)).toEqual([]);
    expect(getLineAtrDivergenceCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineAtrDivergenceCrossFinitePoints(
        // @ts-expect-error -- intentionally bad
        'oops',
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineAtrDivergenceCrossLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineAtrDivergenceCrossLength(14.7, 14)).toBe(14);
    expect(normalizeLineAtrDivergenceCrossLength(0, 14)).toBe(14);
    expect(normalizeLineAtrDivergenceCrossLength(NaN, 14)).toBe(14);
  });
});

describe('computeLineAtrDivergenceCross CONST band', () => {
  it('TR = 2 from i>=1, ATR = 2 from i>=period', () => {
    const data = buildConstBand(40, 50);
    const out = computeLineAtrDivergenceCross(data);
    expect(out.trueRange[0]).toBeNull();
    for (let i = 1; i < 40; i += 1) {
      expect(out.trueRange[i] as number).toBeCloseTo(2, 9);
    }
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.atr[i] as number).toBeCloseTo(2, 9);
    }
  });
});

describe('computeLineAtrDivergenceCross LINEAR UP', () => {
  it('TR = 2, ATR = 2 (per-bar range constant during steady uptrend)', () => {
    const data = buildLinearUp(40);
    const out = computeLineAtrDivergenceCross(data);
    for (let i = 1; i < 40; i += 1) {
      expect(out.trueRange[i] as number).toBeCloseTo(2, 9);
    }
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.atr[i] as number).toBeCloseTo(2, 9);
    }
  });
});

describe('computeLineAtrDivergenceCross LINEAR DOWN', () => {
  it('TR = 2, ATR = 2 (mirror)', () => {
    const data = buildLinearDown(40);
    const out = computeLineAtrDivergenceCross(data);
    for (let i = 1; i < 40; i += 1) {
      expect(out.trueRange[i] as number).toBeCloseTo(2, 9);
    }
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.atr[i] as number).toBeCloseTo(2, 9);
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineAtrDivergenceCross([])).toEqual({
      trueRange: [],
      atr: [],
    });
  });
});

describe('classifyLineAtrDivergenceCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineAtrDivergenceCrossRegime(null, 1, 5, 4)).toBe('none');
  });
  it('priceUp + atrUp -> aligned-bullish', () => {
    expect(classifyLineAtrDivergenceCrossRegime(2, 1, 5, 4)).toBe(
      'aligned-bullish',
    );
  });
  it('priceDown + atrDown -> aligned-bearish', () => {
    expect(classifyLineAtrDivergenceCrossRegime(1, 2, 4, 5)).toBe(
      'aligned-bearish',
    );
  });
  it('priceDown + atrUp -> divergent-bullish', () => {
    expect(classifyLineAtrDivergenceCrossRegime(1, 2, 5, 4)).toBe(
      'divergent-bullish',
    );
  });
  it('priceUp + atrDown -> divergent-bearish', () => {
    expect(classifyLineAtrDivergenceCrossRegime(2, 1, 4, 5)).toBe(
      'divergent-bearish',
    );
  });
  it('flat sides -> none', () => {
    expect(classifyLineAtrDivergenceCrossRegime(1, 1, 5, 4)).toBe('none');
    expect(classifyLineAtrDivergenceCrossRegime(2, 1, 5, 5)).toBe('none');
  });
});

describe('classifyLineAtrDivergenceCrossBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineAtrDivergenceCrossBias(60, 50)).toBe('up');
    expect(classifyLineAtrDivergenceCrossBias(40, 50)).toBe('down');
    expect(classifyLineAtrDivergenceCrossBias(50, 50)).toBe('flat');
    expect(classifyLineAtrDivergenceCrossBias(null, 50)).toBe('none');
  });
});

describe('detectLineAtrDivergenceCrossCrosses', () => {
  it('fires bullish on transition into divergent-bullish', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const regimes: ChartLineAtrDivergenceCrossRegime[] = [
      'aligned-bullish',
      'aligned-bullish',
      'divergent-bullish',
      'divergent-bullish',
    ];
    const atr: Array<number | null> = [1, 2, 3, 4];
    const out = detectLineAtrDivergenceCrossCrosses(series, regimes, atr);
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
    const regimes: ChartLineAtrDivergenceCrossRegime[] = [
      'aligned-bullish',
      'aligned-bullish',
      'divergent-bearish',
      'divergent-bearish',
    ];
    const atr: Array<number | null> = [4, 3, 2, 1];
    const out = detectLineAtrDivergenceCrossCrosses(series, regimes, atr);
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
    const regimes: ChartLineAtrDivergenceCrossRegime[] = [
      'none',
      'divergent-bullish',
      'divergent-bullish',
      'divergent-bullish',
      'aligned-bullish',
    ];
    const atr: Array<number | null> = [1, 2, 3, 4, 5];
    const out = detectLineAtrDivergenceCrossCrosses(series, regimes, atr);
    expect(out).toHaveLength(1);
  });
});

describe('runLineAtrDivergenceCross CONST band', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST band ${K}: ATR=2 flat, all none, 0 triggers`, () => {
      const data = buildConstBand(60, K);
      const run = runLineAtrDivergenceCross(data);
      expect(run.period).toBe(PERIOD);
      for (let i = 0; i < WARMUP; i += 1) {
        expect(run.atrValues[i]).toBeNull();
      }
      for (let i = WARMUP; i < 60; i += 1) {
        expect(run.atrValues[i] as number).toBeCloseTo(2, 9);
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

describe('runLineAtrDivergenceCross LINEAR UP', () => {
  it('LINEAR UP: ATR=2 flat, regime none (price up but ATR flat), 0 triggers', () => {
    const data = buildLinearUp(60);
    const run = runLineAtrDivergenceCross(data);
    for (let i = WARMUP; i < 60; i += 1) {
      expect(run.atrValues[i] as number).toBeCloseTo(2, 9);
    }
    // ATR flat -> all regimes are 'none' (priceUp + atrFlat -> none)
    expect(run.alignedBullishCount).toBe(0);
    expect(run.divergentBearishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineAtrDivergenceCross LINEAR DOWN', () => {
  it('LINEAR DOWN: ATR=2 flat, regime none, 0 triggers', () => {
    const data = buildLinearDown(60);
    const run = runLineAtrDivergenceCross(data);
    for (let i = WARMUP; i < 60; i += 1) {
      expect(run.atrValues[i] as number).toBeCloseTo(2, 9);
    }
    expect(run.alignedBearishCount).toBe(0);
    expect(run.divergentBullishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineAtrDivergenceCross misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineAtrDivergenceCrossPoint[] = [
      { x: 2, high: 1, low: 0, close: 0.5 },
      { x: 0, high: 1, low: 0, close: 0.5 },
      { x: 1, high: 1, low: 0, close: 0.5 },
    ];
    const run = runLineAtrDivergenceCross(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConstBand(14, 50);
    const run = runLineAtrDivergenceCross(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineAtrDivergenceCross([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom period', () => {
    const data = buildLinearUp(60);
    const run = runLineAtrDivergenceCross(data, { period: 7 });
    expect(run.period).toBe(7);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(60);
    const run = runLineAtrDivergenceCross(data);
    expect(
      run.alignedBullishCount +
        run.alignedBearishCount +
        run.divergentBullishCount +
        run.divergentBearishCount +
        run.noneCount,
    ).toBe(60);
  });
});

describe('computeLineAtrDivergenceCrossLayout', () => {
  it('renders SVG paths for LINEAR UP', () => {
    const data = buildLinearUp(60);
    const layout = computeLineAtrDivergenceCrossLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(60);
    expect(layout.atrPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('clamps oscMin to 0 (ATR is non-negative)', () => {
    const layout = computeLineAtrDivergenceCrossLayout({
      data: buildLinearUp(60),
    });
    expect(layout.oscMin).toBeGreaterThanOrEqual(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineAtrDivergenceCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.atrPath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineAtrDivergenceCrossLayout({
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
    const data = buildConstBand(60, 100);
    const layout = computeLineAtrDivergenceCrossLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });
});

describe('describeLineAtrDivergenceCrossChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineAtrDivergenceCrossChart([])).toBe('No data');
  });

  it('mentions bar count, period, volatility regime reversal', () => {
    const desc = describeLineAtrDivergenceCrossChart(buildLinearUp(60));
    expect(desc).toContain('60 bars');
    expect(desc).toContain('period 14');
    expect(desc).toContain('volatility regime reversal');
    expect(desc).toContain('bias coloring');
  });
});

describe('<ChartLineAtrDivergenceCross /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineAtrDivergenceCross data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-atr-divergence-cross"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-period')).toBe(String(PERIOD));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(<ChartLineAtrDivergenceCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-divergence-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders ATR path', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineAtrDivergenceCross data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-divergence-cross-atr-path"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineAtrDivergenceCross data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-divergence-cross-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineAtrDivergenceCross data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-atr-divergence-cross-badge"]',
    );
    expect(badge?.textContent).toContain('period 14');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineAtrDivergenceCross data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-atr-divergence-cross"]',
    );
    expect(root?.getAttribute('aria-label')).toBe('ATR divergence chart');
  });

  it('exposes data-*-count counters for LINEAR UP', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineAtrDivergenceCross data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-atr-divergence-cross"]',
    );
    expect(root?.getAttribute('data-aligned-bullish-count')).toBe('0');
    expect(root?.getAttribute('data-none-count')).toBe('60');
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineAtrDivergenceCross data={data} hiddenSeries={['atr']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-divergence-cross-atr-path"]',
      ),
    ).toBeNull();
  });
});
