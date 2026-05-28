import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineDonchianDivergenceCross,
  DEFAULT_CHART_LINE_DONCHIAN_DIVERGENCE_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_DONCHIAN_DIVERGENCE_CROSS_PADDING,
  DEFAULT_CHART_LINE_DONCHIAN_DIVERGENCE_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_DONCHIAN_DIVERGENCE_CROSS_PERIOD,
  DEFAULT_CHART_LINE_DONCHIAN_DIVERGENCE_CROSS_WIDTH,
  classifyLineDonchianDivergenceCrossBias,
  classifyLineDonchianDivergenceCrossRegime,
  computeLineDonchianDivergenceCross,
  computeLineDonchianDivergenceCrossLayout,
  describeLineDonchianDivergenceCrossChart,
  detectLineDonchianDivergenceCrossCrosses,
  getLineDonchianDivergenceCrossFinitePoints,
  normalizeLineDonchianDivergenceCrossLength,
  runLineDonchianDivergenceCross,
  type ChartLineDonchianDivergenceCrossPoint,
  type ChartLineDonchianDivergenceCrossRegime,
} from './chart-line-donchian-divergence-cross';

const PERIOD = 20;
const WARMUP = PERIOD; // 20

const buildConstBand = (
  n: number,
  k: number,
): ChartLineDonchianDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: k + 1,
    low: k - 1,
    close: k,
  }));

const buildLinearUp = (
  n: number,
): ChartLineDonchianDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: i + 1,
    low: i - 1,
    close: i,
  }));

const buildLinearDown = (
  n: number,
): ChartLineDonchianDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: -i + 1,
    low: -i - 1,
    close: -i,
  }));

describe('ChartLineDonchianDivergenceCross defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_DONCHIAN_DIVERGENCE_CROSS_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_DONCHIAN_DIVERGENCE_CROSS_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_DONCHIAN_DIVERGENCE_CROSS_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_DONCHIAN_DIVERGENCE_CROSS_PANEL_GAP).toBe(12);
  });

  it('exports canonical Donchian tuning', () => {
    expect(DEFAULT_CHART_LINE_DONCHIAN_DIVERGENCE_CROSS_PERIOD).toBe(20);
  });
});

describe('getLineDonchianDivergenceCrossFinitePoints', () => {
  it('filters NaN/Infinity and high<low', () => {
    const points = [
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: NaN, high: 2, low: 1, close: 1.5 },
      { x: 1, high: 1, low: 2, close: 1.5 },
      { x: 2, high: Infinity, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ];
    expect(getLineDonchianDivergenceCrossFinitePoints(points)).toEqual([
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ]);
  });

  it('returns empty for null/non-array', () => {
    expect(getLineDonchianDivergenceCrossFinitePoints(null)).toEqual([]);
    expect(getLineDonchianDivergenceCrossFinitePoints(undefined)).toEqual(
      [],
    );
  });
});

describe('normalizeLineDonchianDivergenceCrossLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineDonchianDivergenceCrossLength(20.7, 20)).toBe(20);
    expect(normalizeLineDonchianDivergenceCrossLength(0, 20)).toBe(20);
  });
});

describe('computeLineDonchianDivergenceCross CONST band', () => {
  it('upper=K+1, lower=K-1, midline=K (constant)', () => {
    const data = buildConstBand(40, 50);
    const out = computeLineDonchianDivergenceCross(data);
    for (let i = PERIOD - 1; i < 40; i += 1) {
      expect(out.upperBand[i] as number).toBe(51);
      expect(out.lowerBand[i] as number).toBe(49);
      expect(out.midline[i] as number).toBe(50);
    }
  });
});

describe('computeLineDonchianDivergenceCross LINEAR UP', () => {
  it('upper=i+1, lower=i-20, midline=i-9.5', () => {
    const data = buildLinearUp(40);
    const out = computeLineDonchianDivergenceCross(data);
    for (let i = PERIOD - 1; i < 40; i += 1) {
      expect(out.upperBand[i] as number).toBe(i + 1);
      expect(out.lowerBand[i] as number).toBe(i - 20);
      expect(out.midline[i] as number).toBe(i - 9.5);
    }
  });
});

describe('computeLineDonchianDivergenceCross LINEAR DOWN', () => {
  it('upper=-i+20, lower=-i-1, midline=-i+9.5 (mirror)', () => {
    const data = buildLinearDown(40);
    const out = computeLineDonchianDivergenceCross(data);
    for (let i = PERIOD - 1; i < 40; i += 1) {
      expect(out.upperBand[i] as number).toBe(-i + 20);
      expect(out.lowerBand[i] as number).toBe(-i - 1);
      expect(out.midline[i] as number).toBe(-i + 9.5);
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineDonchianDivergenceCross([])).toEqual({
      midline: [],
      upperBand: [],
      lowerBand: [],
    });
  });
});

describe('classifyLineDonchianDivergenceCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineDonchianDivergenceCrossRegime(null, 1, 5, 4)).toBe(
      'none',
    );
  });
  it('priceUp + midUp -> aligned-bullish', () => {
    expect(classifyLineDonchianDivergenceCrossRegime(2, 1, 5, 4)).toBe(
      'aligned-bullish',
    );
  });
  it('priceDown + midDown -> aligned-bearish', () => {
    expect(classifyLineDonchianDivergenceCrossRegime(1, 2, 4, 5)).toBe(
      'aligned-bearish',
    );
  });
  it('priceDown + midUp -> divergent-bullish', () => {
    expect(classifyLineDonchianDivergenceCrossRegime(1, 2, 5, 4)).toBe(
      'divergent-bullish',
    );
  });
  it('priceUp + midDown -> divergent-bearish', () => {
    expect(classifyLineDonchianDivergenceCrossRegime(2, 1, 4, 5)).toBe(
      'divergent-bearish',
    );
  });
  it('flat sides -> none', () => {
    expect(classifyLineDonchianDivergenceCrossRegime(1, 1, 5, 4)).toBe(
      'none',
    );
    expect(classifyLineDonchianDivergenceCrossRegime(2, 1, 5, 5)).toBe(
      'none',
    );
  });
});

describe('classifyLineDonchianDivergenceCrossBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineDonchianDivergenceCrossBias(60, 50)).toBe('up');
    expect(classifyLineDonchianDivergenceCrossBias(40, 50)).toBe('down');
    expect(classifyLineDonchianDivergenceCrossBias(50, 50)).toBe('flat');
    expect(classifyLineDonchianDivergenceCrossBias(null, 50)).toBe('none');
  });
});

describe('detectLineDonchianDivergenceCrossCrosses', () => {
  it('fires bullish on transition into divergent-bullish', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const regimes: ChartLineDonchianDivergenceCrossRegime[] = [
      'aligned-bullish',
      'aligned-bullish',
      'divergent-bullish',
      'divergent-bullish',
    ];
    const mid: Array<number | null> = [1, 2, 3, 4];
    const out = detectLineDonchianDivergenceCrossCrosses(
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
    const regimes: ChartLineDonchianDivergenceCrossRegime[] = [
      'aligned-bullish',
      'aligned-bullish',
      'divergent-bearish',
      'divergent-bearish',
    ];
    const mid: Array<number | null> = [4, 3, 2, 1];
    const out = detectLineDonchianDivergenceCrossCrosses(
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
    const regimes: ChartLineDonchianDivergenceCrossRegime[] = [
      'none',
      'divergent-bullish',
      'divergent-bullish',
      'divergent-bullish',
      'aligned-bullish',
    ];
    const mid: Array<number | null> = [1, 2, 3, 4, 5];
    const out = detectLineDonchianDivergenceCrossCrosses(
      series,
      regimes,
      mid,
    );
    expect(out).toHaveLength(1);
  });
});

describe('runLineDonchianDivergenceCross CONST band', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST band ${K}: midline=K flat, regime none, 0 crosses`, () => {
      const data = buildConstBand(60, K);
      const run = runLineDonchianDivergenceCross(data);
      expect(run.period).toBe(PERIOD);
      for (let i = WARMUP; i < 60; i += 1) {
        expect(run.midlineValues[i] as number).toBe(K);
        expect(run.upperBandValues[i] as number).toBe(K + 1);
        expect(run.lowerBandValues[i] as number).toBe(K - 1);
      }
      expect(run.alignedBullishCount).toBe(0);
      expect(run.divergentBullishCount).toBe(0);
      expect(run.divergentBearishCount).toBe(0);
      expect(run.crosses).toHaveLength(0);
      expect(run.ok).toBe(true);
    });
  }
});

describe('runLineDonchianDivergenceCross LINEAR UP', () => {
  it('midline = i - 9.5, regime aligned-bullish, 0 crosses', () => {
    const data = buildLinearUp(60);
    const run = runLineDonchianDivergenceCross(data);
    for (let i = WARMUP; i < 60; i += 1) {
      expect(run.midlineValues[i] as number).toBe(i - 9.5);
    }
    expect(run.alignedBullishCount).toBeGreaterThan(0);
    expect(run.divergentBullishCount).toBe(0);
    expect(run.divergentBearishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineDonchianDivergenceCross LINEAR DOWN', () => {
  it('midline = -i + 9.5, regime aligned-bearish, 0 crosses', () => {
    const data = buildLinearDown(60);
    const run = runLineDonchianDivergenceCross(data);
    for (let i = WARMUP; i < 60; i += 1) {
      expect(run.midlineValues[i] as number).toBe(-i + 9.5);
    }
    expect(run.alignedBearishCount).toBeGreaterThan(0);
    expect(run.divergentBullishCount).toBe(0);
    expect(run.divergentBearishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineDonchianDivergenceCross misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineDonchianDivergenceCrossPoint[] = [
      { x: 2, high: 1, low: 0, close: 0.5 },
      { x: 0, high: 1, low: 0, close: 0.5 },
      { x: 1, high: 1, low: 0, close: 0.5 },
    ];
    const run = runLineDonchianDivergenceCross(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConstBand(20, 50);
    const run = runLineDonchianDivergenceCross(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineDonchianDivergenceCross([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom period', () => {
    const data = buildLinearUp(60);
    const run = runLineDonchianDivergenceCross(data, { period: 10 });
    expect(run.period).toBe(10);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(60);
    const run = runLineDonchianDivergenceCross(data);
    expect(
      run.alignedBullishCount +
        run.alignedBearishCount +
        run.divergentBullishCount +
        run.divergentBearishCount +
        run.noneCount,
    ).toBe(60);
  });
});

describe('computeLineDonchianDivergenceCrossLayout', () => {
  it('renders SVG paths for LINEAR UP', () => {
    const data = buildLinearUp(60);
    const layout = computeLineDonchianDivergenceCrossLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(60);
    expect(layout.midlinePath).toContain('M ');
    expect(layout.upperBandPath).toContain('M ');
    expect(layout.lowerBandPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineDonchianDivergenceCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.midlinePath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineDonchianDivergenceCrossLayout({
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
    const layout = computeLineDonchianDivergenceCrossLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });
});

describe('describeLineDonchianDivergenceCrossChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineDonchianDivergenceCrossChart([])).toBe('No data');
  });

  it('mentions bar count, period, range-break-reversal warning', () => {
    const desc = describeLineDonchianDivergenceCrossChart(
      buildLinearUp(60),
    );
    expect(desc).toContain('60 bars');
    expect(desc).toContain('period 20');
    expect(desc).toContain('range-break-reversal warning');
    expect(desc).toContain('bias coloring');
  });
});

describe('<ChartLineDonchianDivergenceCross /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineDonchianDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-donchian-divergence-cross"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-period')).toBe(String(PERIOD));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(
      <ChartLineDonchianDivergenceCross data={[]} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-divergence-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders midline + upper + lower band paths', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineDonchianDivergenceCross data={data} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-divergence-cross-midline-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-divergence-cross-upper-band-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-divergence-cross-lower-band-path"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineDonchianDivergenceCross data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-divergence-cross-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineDonchianDivergenceCross data={data} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-donchian-divergence-cross-badge"]',
    );
    expect(badge?.textContent).toContain('period 20');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineDonchianDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-donchian-divergence-cross"]',
    );
    expect(root?.getAttribute('aria-label')).toBe(
      'Donchian divergence chart',
    );
  });

  it('exposes data-*-count counters for LINEAR UP', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineDonchianDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-donchian-divergence-cross"]',
    );
    expect(root?.getAttribute('data-aligned-bullish-count')).not.toBe('0');
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineDonchianDivergenceCross
        data={data}
        hiddenSeries={['midline']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-divergence-cross-midline-path"]',
      ),
    ).toBeNull();
  });
});
