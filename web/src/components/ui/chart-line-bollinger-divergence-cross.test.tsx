import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineBollingerDivergenceCross,
  DEFAULT_CHART_LINE_BOLLINGER_DIVERGENCE_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_BOLLINGER_DIVERGENCE_CROSS_NUM_STDEV,
  DEFAULT_CHART_LINE_BOLLINGER_DIVERGENCE_CROSS_PADDING,
  DEFAULT_CHART_LINE_BOLLINGER_DIVERGENCE_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_BOLLINGER_DIVERGENCE_CROSS_PERIOD,
  DEFAULT_CHART_LINE_BOLLINGER_DIVERGENCE_CROSS_WIDTH,
  classifyLineBollingerDivergenceCrossBias,
  classifyLineBollingerDivergenceCrossRegime,
  computeLineBollingerDivergenceCross,
  computeLineBollingerDivergenceCrossLayout,
  describeLineBollingerDivergenceCrossChart,
  detectLineBollingerDivergenceCrossCrosses,
  getLineBollingerDivergenceCrossFinitePoints,
  normalizeLineBollingerDivergenceCrossLength,
  normalizeLineBollingerDivergenceCrossNumStdev,
  runLineBollingerDivergenceCross,
  type ChartLineBollingerDivergenceCrossPoint,
  type ChartLineBollingerDivergenceCrossRegime,
} from './chart-line-bollinger-divergence-cross';

const PERIOD = 20;
const NUM_STDEV = 2;
const WARMUP = PERIOD; // 20
const STDEV_LINEAR = Math.sqrt(133) / 2; // ~5.766

const buildConstBand = (
  n: number,
  k: number,
): ChartLineBollingerDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: k + 1,
    low: k - 1,
    close: k,
  }));

const buildLinearUp = (n: number): ChartLineBollingerDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: i + 1,
    low: i - 1,
    close: i,
  }));

const buildLinearDown = (
  n: number,
): ChartLineBollingerDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: -i + 1,
    low: -i - 1,
    close: -i,
  }));

describe('ChartLineBollingerDivergenceCross defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_BOLLINGER_DIVERGENCE_CROSS_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_BOLLINGER_DIVERGENCE_CROSS_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_BOLLINGER_DIVERGENCE_CROSS_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_BOLLINGER_DIVERGENCE_CROSS_PANEL_GAP).toBe(12);
  });

  it('exports canonical Bollinger tuning', () => {
    expect(DEFAULT_CHART_LINE_BOLLINGER_DIVERGENCE_CROSS_PERIOD).toBe(20);
    expect(DEFAULT_CHART_LINE_BOLLINGER_DIVERGENCE_CROSS_NUM_STDEV).toBe(2);
  });
});

describe('getLineBollingerDivergenceCrossFinitePoints', () => {
  it('filters NaN/Infinity and high<low', () => {
    const points = [
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: NaN, high: 2, low: 1, close: 1.5 },
      { x: 1, high: 1, low: 2, close: 1.5 },
      { x: 2, high: Infinity, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ];
    expect(getLineBollingerDivergenceCrossFinitePoints(points)).toEqual([
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ]);
  });

  it('returns empty for null and non-array', () => {
    expect(getLineBollingerDivergenceCrossFinitePoints(null)).toEqual([]);
    expect(getLineBollingerDivergenceCrossFinitePoints(undefined)).toEqual(
      [],
    );
  });
});

describe('normalizers', () => {
  it('floors finite >=1 length values', () => {
    expect(normalizeLineBollingerDivergenceCrossLength(20.7, 20)).toBe(20);
    expect(normalizeLineBollingerDivergenceCrossLength(0, 20)).toBe(20);
  });

  it('rejects non-positive numStdev', () => {
    expect(normalizeLineBollingerDivergenceCrossNumStdev(2.5, 2)).toBe(2.5);
    expect(normalizeLineBollingerDivergenceCrossNumStdev(0, 2)).toBe(2);
    expect(normalizeLineBollingerDivergenceCrossNumStdev(-1, 2)).toBe(2);
  });
});

describe('computeLineBollingerDivergenceCross CONST band', () => {
  it('midline = K, stdev = 0, bands = K', () => {
    const data = buildConstBand(40, 50);
    const out = computeLineBollingerDivergenceCross(data);
    for (let i = PERIOD - 1; i < 40; i += 1) {
      expect(out.midline[i] as number).toBe(50);
      expect(out.stdev[i] as number).toBe(0);
      expect(out.upperBand[i] as number).toBe(50);
      expect(out.lowerBand[i] as number).toBe(50);
    }
  });
});

describe('computeLineBollingerDivergenceCross LINEAR UP', () => {
  it('midline = i - 9.5, stdev = sqrt(133)/2, bands at +/- sqrt(133)', () => {
    const data = buildLinearUp(40);
    const out = computeLineBollingerDivergenceCross(data);
    for (let i = PERIOD - 1; i < 40; i += 1) {
      expect(out.midline[i] as number).toBeCloseTo(i - 9.5, 9);
      expect(out.stdev[i] as number).toBeCloseTo(STDEV_LINEAR, 9);
      expect(out.upperBand[i] as number).toBeCloseTo(
        i - 9.5 + 2 * STDEV_LINEAR,
        9,
      );
      expect(out.lowerBand[i] as number).toBeCloseTo(
        i - 9.5 - 2 * STDEV_LINEAR,
        9,
      );
    }
  });
});

describe('computeLineBollingerDivergenceCross LINEAR DOWN', () => {
  it('midline = -i + 9.5, stdev = sqrt(133)/2 (mirror)', () => {
    const data = buildLinearDown(40);
    const out = computeLineBollingerDivergenceCross(data);
    for (let i = PERIOD - 1; i < 40; i += 1) {
      expect(out.midline[i] as number).toBeCloseTo(-i + 9.5, 9);
      expect(out.stdev[i] as number).toBeCloseTo(STDEV_LINEAR, 9);
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineBollingerDivergenceCross([])).toEqual({
      midline: [],
      stdev: [],
      upperBand: [],
      lowerBand: [],
    });
  });
});

describe('classifyLineBollingerDivergenceCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineBollingerDivergenceCrossRegime(null, 1, 5, 4)).toBe(
      'none',
    );
  });
  it('priceUp + midUp -> aligned-bullish', () => {
    expect(classifyLineBollingerDivergenceCrossRegime(2, 1, 5, 4)).toBe(
      'aligned-bullish',
    );
  });
  it('priceDown + midDown -> aligned-bearish', () => {
    expect(classifyLineBollingerDivergenceCrossRegime(1, 2, 4, 5)).toBe(
      'aligned-bearish',
    );
  });
  it('priceDown + midUp -> divergent-bullish', () => {
    expect(classifyLineBollingerDivergenceCrossRegime(1, 2, 5, 4)).toBe(
      'divergent-bullish',
    );
  });
  it('priceUp + midDown -> divergent-bearish', () => {
    expect(classifyLineBollingerDivergenceCrossRegime(2, 1, 4, 5)).toBe(
      'divergent-bearish',
    );
  });
  it('flat sides -> none', () => {
    expect(classifyLineBollingerDivergenceCrossRegime(1, 1, 5, 4)).toBe(
      'none',
    );
    expect(classifyLineBollingerDivergenceCrossRegime(2, 1, 5, 5)).toBe(
      'none',
    );
  });
});

describe('classifyLineBollingerDivergenceCrossBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineBollingerDivergenceCrossBias(60, 50)).toBe('up');
    expect(classifyLineBollingerDivergenceCrossBias(40, 50)).toBe('down');
    expect(classifyLineBollingerDivergenceCrossBias(50, 50)).toBe('flat');
    expect(classifyLineBollingerDivergenceCrossBias(null, 50)).toBe('none');
  });
});

describe('detectLineBollingerDivergenceCrossCrosses', () => {
  it('fires bullish on transition into divergent-bullish', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const regimes: ChartLineBollingerDivergenceCrossRegime[] = [
      'aligned-bullish',
      'aligned-bullish',
      'divergent-bullish',
      'divergent-bullish',
    ];
    const mid: Array<number | null> = [1, 2, 3, 4];
    const out = detectLineBollingerDivergenceCrossCrosses(
      series,
      regimes,
      mid,
    );
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
    const regimes: ChartLineBollingerDivergenceCrossRegime[] = [
      'aligned-bullish',
      'aligned-bullish',
      'divergent-bearish',
      'divergent-bearish',
    ];
    const mid: Array<number | null> = [4, 3, 2, 1];
    const out = detectLineBollingerDivergenceCrossCrosses(
      series,
      regimes,
      mid,
    );
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
    const regimes: ChartLineBollingerDivergenceCrossRegime[] = [
      'none',
      'divergent-bullish',
      'divergent-bullish',
      'divergent-bullish',
      'aligned-bullish',
    ];
    const mid: Array<number | null> = [1, 2, 3, 4, 5];
    const out = detectLineBollingerDivergenceCrossCrosses(
      series,
      regimes,
      mid,
    );
    expect(out).toHaveLength(1);
  });
});

describe('runLineBollingerDivergenceCross CONST band', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST band ${K}: midline=K, stdev=0, regime none, 0 crosses`, () => {
      const data = buildConstBand(60, K);
      const run = runLineBollingerDivergenceCross(data);
      expect(run.period).toBe(PERIOD);
      expect(run.numStdev).toBe(NUM_STDEV);
      for (let i = WARMUP; i < 60; i += 1) {
        expect(run.midlineValues[i] as number).toBe(K);
        expect(run.stdevValues[i] as number).toBe(0);
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

describe('runLineBollingerDivergenceCross LINEAR UP', () => {
  it('midline = i - 9.5, regime aligned-bullish, 0 crosses', () => {
    const data = buildLinearUp(60);
    const run = runLineBollingerDivergenceCross(data);
    for (let i = WARMUP; i < 60; i += 1) {
      expect(run.midlineValues[i] as number).toBeCloseTo(i - 9.5, 9);
      expect(run.stdevValues[i] as number).toBeCloseTo(STDEV_LINEAR, 9);
    }
    expect(run.alignedBullishCount).toBeGreaterThan(0);
    expect(run.divergentBullishCount).toBe(0);
    expect(run.divergentBearishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineBollingerDivergenceCross LINEAR DOWN', () => {
  it('midline = -i + 9.5, regime aligned-bearish, 0 crosses', () => {
    const data = buildLinearDown(60);
    const run = runLineBollingerDivergenceCross(data);
    for (let i = WARMUP; i < 60; i += 1) {
      expect(run.midlineValues[i] as number).toBeCloseTo(-i + 9.5, 9);
    }
    expect(run.alignedBearishCount).toBeGreaterThan(0);
    expect(run.divergentBullishCount).toBe(0);
    expect(run.divergentBearishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineBollingerDivergenceCross misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineBollingerDivergenceCrossPoint[] = [
      { x: 2, high: 1, low: 0, close: 0.5 },
      { x: 0, high: 1, low: 0, close: 0.5 },
      { x: 1, high: 1, low: 0, close: 0.5 },
    ];
    const run = runLineBollingerDivergenceCross(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConstBand(20, 50);
    const run = runLineBollingerDivergenceCross(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineBollingerDivergenceCross([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom tuning', () => {
    const data = buildLinearUp(60);
    const run = runLineBollingerDivergenceCross(data, {
      period: 10,
      numStdev: 1.5,
    });
    expect(run.period).toBe(10);
    expect(run.numStdev).toBe(1.5);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(60);
    const run = runLineBollingerDivergenceCross(data);
    expect(
      run.alignedBullishCount +
        run.alignedBearishCount +
        run.divergentBullishCount +
        run.divergentBearishCount +
        run.noneCount,
    ).toBe(60);
  });
});

describe('computeLineBollingerDivergenceCrossLayout', () => {
  it('renders SVG paths for LINEAR UP', () => {
    const data = buildLinearUp(60);
    const layout = computeLineBollingerDivergenceCrossLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(60);
    expect(layout.midlinePath).toContain('M ');
    expect(layout.upperBandPath).toContain('M ');
    expect(layout.lowerBandPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineBollingerDivergenceCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.midlinePath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineBollingerDivergenceCrossLayout({
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
    const layout = computeLineBollingerDivergenceCrossLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });
});

describe('describeLineBollingerDivergenceCrossChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineBollingerDivergenceCrossChart([])).toBe('No data');
  });

  it('mentions bar count, period, numStdev, volatility-reversal warning', () => {
    const desc = describeLineBollingerDivergenceCrossChart(
      buildLinearUp(60),
    );
    expect(desc).toContain('60 bars');
    expect(desc).toContain('period 20');
    expect(desc).toContain('numStdev 2');
    expect(desc).toContain('volatility-reversal warning');
    expect(desc).toContain('bias coloring');
  });
});

describe('<ChartLineBollingerDivergenceCross /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineBollingerDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-bollinger-divergence-cross"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-period')).toBe(String(PERIOD));
    expect(root?.getAttribute('data-num-stdev')).toBe(String(NUM_STDEV));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(
      <ChartLineBollingerDivergenceCross data={[]} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-bollinger-divergence-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders midline + upper + lower band paths', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineBollingerDivergenceCross data={data} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-bollinger-divergence-cross-midline-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-bollinger-divergence-cross-upper-band-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-bollinger-divergence-cross-lower-band-path"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineBollingerDivergenceCross data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-bollinger-divergence-cross-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineBollingerDivergenceCross data={data} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-bollinger-divergence-cross-badge"]',
    );
    expect(badge?.textContent).toContain('period 20');
    expect(badge?.textContent).toContain('stdev 2');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineBollingerDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-bollinger-divergence-cross"]',
    );
    expect(root?.getAttribute('aria-label')).toBe(
      'Bollinger divergence chart',
    );
  });

  it('exposes data-*-count counters for LINEAR UP', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineBollingerDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-bollinger-divergence-cross"]',
    );
    expect(root?.getAttribute('data-aligned-bullish-count')).not.toBe('0');
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineBollingerDivergenceCross
        data={data}
        hiddenSeries={['midline']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-bollinger-divergence-cross-midline-path"]',
      ),
    ).toBeNull();
  });
});
