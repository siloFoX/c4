import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineSupertrendFlipCross,
  DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_MULTIPLIER,
  DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_PADDING,
  DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_PERIOD,
  DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_WIDTH,
  classifyLineSupertrendFlipCrossBias,
  computeLineSupertrendFlipCross,
  computeLineSupertrendFlipCrossLayout,
  describeLineSupertrendFlipCrossChart,
  detectLineSupertrendFlipCrossCrosses,
  getLineSupertrendFlipCrossFinitePoints,
  normalizeLineSupertrendFlipCrossLength,
  normalizeLineSupertrendFlipCrossMultiplier,
  runLineSupertrendFlipCross,
  type ChartLineSupertrendFlipCrossPoint,
} from './chart-line-supertrend-flip-cross';

const PERIOD = 10;
const MULT = 3;
const WARMUP = PERIOD; // 10

const buildConstBand = (
  n: number,
  k: number,
): ChartLineSupertrendFlipCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: k + 1,
    low: k - 1,
    close: k,
  }));

const buildLinearUp = (n: number): ChartLineSupertrendFlipCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: i + 1,
    low: i - 1,
    close: i,
  }));

const buildLinearDown = (n: number): ChartLineSupertrendFlipCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: -i + 1,
    low: -i - 1,
    close: -i,
  }));

describe('ChartLineSupertrendFlipCross defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_PANEL_GAP).toBe(12);
  });

  it('exports canonical Supertrend tuning', () => {
    expect(DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_PERIOD).toBe(10);
    expect(DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_MULTIPLIER).toBe(3);
  });
});

describe('getLineSupertrendFlipCrossFinitePoints', () => {
  it('filters NaN/Infinity and high<low', () => {
    const points = [
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: NaN, high: 2, low: 1, close: 1.5 },
      { x: 1, high: 1, low: 2, close: 1.5 },
      { x: 2, high: Infinity, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ];
    expect(getLineSupertrendFlipCrossFinitePoints(points)).toEqual([
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ]);
  });
});

describe('normalizers', () => {
  it('floors finite >=1 length values', () => {
    expect(normalizeLineSupertrendFlipCrossLength(10.7, 10)).toBe(10);
    expect(normalizeLineSupertrendFlipCrossLength(0, 10)).toBe(10);
  });
  it('rejects non-positive multiplier', () => {
    expect(normalizeLineSupertrendFlipCrossMultiplier(3.5, 3)).toBe(3.5);
    expect(normalizeLineSupertrendFlipCrossMultiplier(0, 3)).toBe(3);
    expect(normalizeLineSupertrendFlipCrossMultiplier(-1, 3)).toBe(3);
  });
});

describe('computeLineSupertrendFlipCross CONST band', () => {
  it('supertrend = K - 6 (init uptrend), trend uptrend', () => {
    const data = buildConstBand(40, 50);
    const out = computeLineSupertrendFlipCross(data);
    for (let i = PERIOD; i < 40; i += 1) {
      expect(out.supertrend[i] as number).toBe(50 - 6);
      expect(out.trend[i]).toBe(1);
    }
  });
});

describe('computeLineSupertrendFlipCross LINEAR UP', () => {
  it('supertrend = i - 6 (init uptrend), trend uptrend', () => {
    const data = buildLinearUp(40);
    const out = computeLineSupertrendFlipCross(data);
    for (let i = PERIOD; i < 40; i += 1) {
      expect(out.supertrend[i] as number).toBeCloseTo(i - 6, 9);
      expect(out.trend[i]).toBe(1);
    }
  });
});

describe('computeLineSupertrendFlipCross LINEAR DOWN', () => {
  it('supertrend = -i + 6 (init downtrend), trend downtrend', () => {
    const data = buildLinearDown(40);
    const out = computeLineSupertrendFlipCross(data);
    for (let i = PERIOD; i < 40; i += 1) {
      expect(out.supertrend[i] as number).toBeCloseTo(-i + 6, 9);
      expect(out.trend[i]).toBe(-1);
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineSupertrendFlipCross([])).toEqual({
      atr: [],
      supertrend: [],
      trend: [],
    });
  });
});

describe('classifyLineSupertrendFlipCrossBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineSupertrendFlipCrossBias(60, 50)).toBe('up');
    expect(classifyLineSupertrendFlipCrossBias(40, 50)).toBe('down');
    expect(classifyLineSupertrendFlipCrossBias(50, 50)).toBe('flat');
    expect(classifyLineSupertrendFlipCrossBias(null, 50)).toBe('none');
  });
});

describe('detectLineSupertrendFlipCrossCrosses', () => {
  it('fires bullish on downtrend -> uptrend transition', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const trend: Array<1 | -1 | null> = [-1, -1, 1, 1];
    const st: Array<number | null> = [10, 9, 5, 4];
    const out = detectLineSupertrendFlipCrossCrosses(series, trend, st);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
    expect(out[0]?.index).toBe(2);
    // supertrend went 9 -> 5 at flip bar -> bias = down
    expect(out[0]?.bias).toBe('down');
  });

  it('fires bearish on uptrend -> downtrend transition', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const trend: Array<1 | -1 | null> = [1, 1, -1, -1];
    const st: Array<number | null> = [4, 5, 9, 10];
    const out = detectLineSupertrendFlipCrossCrosses(series, trend, st);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
    // supertrend jumps up at bearish flip -> bias = up
    expect(out[0]?.bias).toBe('up');
  });

  it('does not double-fire while in same trend state', () => {
    const series = Array.from({ length: 5 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const trend: Array<1 | -1 | null> = [-1, 1, 1, 1, -1];
    const st: Array<number | null> = [10, 5, 6, 7, 12];
    const out = detectLineSupertrendFlipCrossCrosses(series, trend, st);
    expect(out).toHaveLength(2);
    expect(out[0]?.kind).toBe('bullish');
    expect(out[1]?.kind).toBe('bearish');
  });

  it('skips null-window bars', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const trend: Array<1 | -1 | null> = [null, null, 1, -1];
    const st: Array<number | null> = [null, null, 5, 10];
    const out = detectLineSupertrendFlipCrossCrosses(series, trend, st);
    // At i=2: prev=null, skip. At i=3: prev=1, cur=-1 -> bearish.
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
  });
});

describe('runLineSupertrendFlipCross CONST band', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST band ${K}: trend uptrend, 0 flips`, () => {
      const data = buildConstBand(40, K);
      const run = runLineSupertrendFlipCross(data);
      expect(run.period).toBe(PERIOD);
      expect(run.multiplier).toBe(MULT);
      for (let i = WARMUP; i < 40; i += 1) {
        expect(run.supertrendValues[i] as number).toBe(K - 6);
        expect(run.trendValues[i]).toBe(1);
      }
      expect(run.crosses).toHaveLength(0);
      expect(run.bullishCrossCount).toBe(0);
      expect(run.bearishCrossCount).toBe(0);
      expect(run.ok).toBe(true);
    });
  }
});

describe('runLineSupertrendFlipCross LINEAR UP', () => {
  it('trend always uptrend, 0 flips', () => {
    const data = buildLinearUp(40);
    const run = runLineSupertrendFlipCross(data);
    for (let i = WARMUP; i < 40; i += 1) {
      expect(run.trendValues[i]).toBe(1);
    }
    expect(run.uptrendCount).toBeGreaterThan(0);
    expect(run.downtrendCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineSupertrendFlipCross LINEAR DOWN', () => {
  it('trend always downtrend, 0 flips', () => {
    const data = buildLinearDown(40);
    const run = runLineSupertrendFlipCross(data);
    for (let i = WARMUP; i < 40; i += 1) {
      expect(run.trendValues[i]).toBe(-1);
    }
    expect(run.downtrendCount).toBeGreaterThan(0);
    expect(run.uptrendCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineSupertrendFlipCross misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineSupertrendFlipCrossPoint[] = [
      { x: 2, high: 1, low: 0, close: 0.5 },
      { x: 0, high: 1, low: 0, close: 0.5 },
      { x: 1, high: 1, low: 0, close: 0.5 },
    ];
    const run = runLineSupertrendFlipCross(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConstBand(11, 50);
    const run = runLineSupertrendFlipCross(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineSupertrendFlipCross([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom tuning', () => {
    const data = buildLinearUp(40);
    const run = runLineSupertrendFlipCross(data, {
      period: 7,
      multiplier: 2,
    });
    expect(run.period).toBe(7);
    expect(run.multiplier).toBe(2);
  });

  it('trend + none counts sum to series length', () => {
    const data = buildLinearUp(40);
    const run = runLineSupertrendFlipCross(data);
    expect(run.uptrendCount + run.downtrendCount + run.noneCount).toBe(
      40,
    );
  });
});

describe('computeLineSupertrendFlipCrossLayout', () => {
  it('renders SVG paths for LINEAR UP', () => {
    const data = buildLinearUp(40);
    const layout = computeLineSupertrendFlipCrossLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(40);
    expect(layout.supertrendPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineSupertrendFlipCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.supertrendPath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineSupertrendFlipCrossLayout({
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
    const layout = computeLineSupertrendFlipCrossLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });
});

describe('describeLineSupertrendFlipCrossChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineSupertrendFlipCrossChart([])).toBe('No data');
  });

  it('mentions bar count, period, trend stop reversal flip', () => {
    const desc = describeLineSupertrendFlipCrossChart(buildLinearUp(40));
    expect(desc).toContain('40 bars');
    expect(desc).toContain('period 10');
    expect(desc).toContain('multiplier 3');
    expect(desc).toContain('trend stop reversal flip');
    expect(desc).toContain('bias coloring');
  });
});

describe('<ChartLineSupertrendFlipCross /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineSupertrendFlipCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-supertrend-flip-cross"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-period')).toBe(String(PERIOD));
    expect(root?.getAttribute('data-multiplier')).toBe(String(MULT));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(
      <ChartLineSupertrendFlipCross data={[]} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-supertrend-flip-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders supertrend path', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineSupertrendFlipCross data={data} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-supertrend-flip-cross-supertrend-path"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineSupertrendFlipCross data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-supertrend-flip-cross-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineSupertrendFlipCross data={data} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-supertrend-flip-cross-badge"]',
    );
    expect(badge?.textContent).toContain('period 10');
    expect(badge?.textContent).toContain('mult 3');
    expect(badge?.textContent).toContain('flips 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineSupertrendFlipCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-supertrend-flip-cross"]',
    );
    expect(root?.getAttribute('aria-label')).toBe(
      'Supertrend flip-cross chart',
    );
  });

  it('exposes data-cross-count counter for LINEAR UP', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineSupertrendFlipCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-supertrend-flip-cross"]',
    );
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineSupertrendFlipCross
        data={data}
        hiddenSeries={['supertrend']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-supertrend-flip-cross-supertrend-path"]',
      ),
    ).toBeNull();
  });
});
