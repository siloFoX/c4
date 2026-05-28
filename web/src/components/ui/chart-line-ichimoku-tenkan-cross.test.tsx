import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineIchimokuTenkanCross,
  DEFAULT_CHART_LINE_ICHIMOKU_TENKAN_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_ICHIMOKU_TENKAN_CROSS_KIJUN_PERIOD,
  DEFAULT_CHART_LINE_ICHIMOKU_TENKAN_CROSS_PADDING,
  DEFAULT_CHART_LINE_ICHIMOKU_TENKAN_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_ICHIMOKU_TENKAN_CROSS_SENKOU_B_PERIOD,
  DEFAULT_CHART_LINE_ICHIMOKU_TENKAN_CROSS_TENKAN_PERIOD,
  DEFAULT_CHART_LINE_ICHIMOKU_TENKAN_CROSS_WIDTH,
  classifyLineIchimokuTenkanCrossCloudBias,
  classifyLineIchimokuTenkanCrossRegime,
  computeLineIchimokuTenkanCross,
  computeLineIchimokuTenkanCrossLayout,
  describeLineIchimokuTenkanCrossChart,
  detectLineIchimokuTenkanCrossCrosses,
  getLineIchimokuTenkanCrossFinitePoints,
  normalizeLineIchimokuTenkanCrossLength,
  runLineIchimokuTenkanCross,
  type ChartLineIchimokuTenkanCrossPoint,
} from './chart-line-ichimoku-tenkan-cross';

const TENKAN = 9;
const KIJUN = 26;
const SENKOU_B = 52;
const CROSS_WARMUP = KIJUN; // 26 for TK cross
const CLOUD_WARMUP = SENKOU_B - 1; // 51 for cloud bias valid

const buildConstBand = (
  n: number,
  k: number,
): ChartLineIchimokuTenkanCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: k + 1,
    low: k - 1,
    close: k,
  }));

const buildLinearUp = (n: number): ChartLineIchimokuTenkanCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: i + 1,
    low: i - 1,
    close: i,
  }));

const buildLinearDown = (n: number): ChartLineIchimokuTenkanCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: -i + 1,
    low: -i - 1,
    close: -i,
  }));

describe('ChartLineIchimokuTenkanCross defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_ICHIMOKU_TENKAN_CROSS_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_ICHIMOKU_TENKAN_CROSS_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_ICHIMOKU_TENKAN_CROSS_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_ICHIMOKU_TENKAN_CROSS_PANEL_GAP).toBe(12);
  });

  it('exports canonical Ichimoku tuning', () => {
    expect(DEFAULT_CHART_LINE_ICHIMOKU_TENKAN_CROSS_TENKAN_PERIOD).toBe(9);
    expect(DEFAULT_CHART_LINE_ICHIMOKU_TENKAN_CROSS_KIJUN_PERIOD).toBe(26);
    expect(DEFAULT_CHART_LINE_ICHIMOKU_TENKAN_CROSS_SENKOU_B_PERIOD).toBe(
      52,
    );
  });
});

describe('getLineIchimokuTenkanCrossFinitePoints', () => {
  it('filters NaN/Infinity and high<low', () => {
    const points = [
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: NaN, high: 2, low: 1, close: 1.5 },
      { x: 1, high: 1, low: 2, close: 1.5 },
      { x: 2, high: Infinity, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ];
    expect(getLineIchimokuTenkanCrossFinitePoints(points)).toEqual([
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ]);
  });

  it('returns empty for null/non-array', () => {
    expect(getLineIchimokuTenkanCrossFinitePoints(null)).toEqual([]);
    expect(getLineIchimokuTenkanCrossFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineIchimokuTenkanCrossLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineIchimokuTenkanCrossLength(14.7, 14)).toBe(14);
    expect(normalizeLineIchimokuTenkanCrossLength(0, 14)).toBe(14);
  });
});

describe('computeLineIchimokuTenkanCross CONST band', () => {
  it('tenkan = kijun = senkouA = senkouB = K', () => {
    const data = buildConstBand(80, 50);
    const out = computeLineIchimokuTenkanCross(data);
    for (let i = SENKOU_B - 1; i < 80; i += 1) {
      expect(out.tenkan[i] as number).toBe(50);
      expect(out.kijun[i] as number).toBe(50);
      expect(out.senkouA[i] as number).toBe(50);
      expect(out.senkouB[i] as number).toBe(50);
    }
  });
});

describe('computeLineIchimokuTenkanCross LINEAR UP', () => {
  it('tenkan = i - 4, kijun = i - 12.5, senkouA = i - 8.25, senkouB = i - 25.5', () => {
    const data = buildLinearUp(80);
    const out = computeLineIchimokuTenkanCross(data);
    for (let i = TENKAN - 1; i < 80; i += 1) {
      expect(out.tenkan[i] as number).toBeCloseTo(i - 4, 9);
    }
    for (let i = KIJUN - 1; i < 80; i += 1) {
      expect(out.kijun[i] as number).toBeCloseTo(i - 12.5, 9);
      expect(out.senkouA[i] as number).toBeCloseTo(i - 8.25, 9);
    }
    for (let i = SENKOU_B - 1; i < 80; i += 1) {
      expect(out.senkouB[i] as number).toBeCloseTo(i - 25.5, 9);
    }
  });

  it('tenkan - kijun = +8.5 (tenkan always above kijun)', () => {
    const data = buildLinearUp(80);
    const out = computeLineIchimokuTenkanCross(data);
    for (let i = KIJUN - 1; i < 80; i += 1) {
      const t = out.tenkan[i] as number;
      const k = out.kijun[i] as number;
      expect(t - k).toBeCloseTo(8.5, 9);
    }
  });

  it('senkouA - senkouB = +17.25 (bullish cloud)', () => {
    const data = buildLinearUp(80);
    const out = computeLineIchimokuTenkanCross(data);
    for (let i = SENKOU_B - 1; i < 80; i += 1) {
      const a = out.senkouA[i] as number;
      const b = out.senkouB[i] as number;
      expect(a - b).toBeCloseTo(17.25, 9);
    }
  });
});

describe('computeLineIchimokuTenkanCross LINEAR DOWN', () => {
  it('mirror: tenkan = -i + 4, kijun = -i + 12.5, senkouA - senkouB = -17.25', () => {
    const data = buildLinearDown(80);
    const out = computeLineIchimokuTenkanCross(data);
    for (let i = KIJUN - 1; i < 80; i += 1) {
      expect(out.tenkan[i] as number).toBeCloseTo(-i + 4, 9);
      expect(out.kijun[i] as number).toBeCloseTo(-i + 12.5, 9);
    }
    for (let i = SENKOU_B - 1; i < 80; i += 1) {
      const a = out.senkouA[i] as number;
      const b = out.senkouB[i] as number;
      expect(a - b).toBeCloseTo(-17.25, 9);
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineIchimokuTenkanCross([])).toEqual({
      tenkan: [],
      kijun: [],
      senkouA: [],
      senkouB: [],
    });
  });
});

describe('classifyLineIchimokuTenkanCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineIchimokuTenkanCrossRegime(null, 5)).toBe('none');
  });
  it('tenkan > kijun -> bullish', () => {
    expect(classifyLineIchimokuTenkanCrossRegime(10, 5)).toBe('bullish');
  });
  it('tenkan === kijun -> bullish (>=)', () => {
    expect(classifyLineIchimokuTenkanCrossRegime(5, 5)).toBe('bullish');
  });
  it('tenkan < kijun -> bearish', () => {
    expect(classifyLineIchimokuTenkanCrossRegime(5, 10)).toBe('bearish');
  });
});

describe('classifyLineIchimokuTenkanCrossCloudBias', () => {
  it('senkouA > senkouB -> bullish (green cloud)', () => {
    expect(classifyLineIchimokuTenkanCrossCloudBias(10, 5)).toBe('bullish');
  });
  it('senkouA < senkouB -> bearish (red cloud)', () => {
    expect(classifyLineIchimokuTenkanCrossCloudBias(5, 10)).toBe('bearish');
  });
  it('senkouA === senkouB -> flat', () => {
    expect(classifyLineIchimokuTenkanCrossCloudBias(5, 5)).toBe('flat');
  });
  it('null -> none', () => {
    expect(classifyLineIchimokuTenkanCrossCloudBias(null, 5)).toBe('none');
    expect(classifyLineIchimokuTenkanCrossCloudBias(5, null)).toBe('none');
  });
});

describe('detectLineIchimokuTenkanCrossCrosses', () => {
  it('fires bullish on tenkan crossing up kijun', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const tenkan: Array<number | null> = [-5, -3, 2, 5];
    const kijun: Array<number | null> = [0, 0, 0, 0];
    const senkouA: Array<number | null> = [10, 10, 10, 10];
    const senkouB: Array<number | null> = [5, 5, 5, 5];
    const out = detectLineIchimokuTenkanCrossCrosses(
      series,
      tenkan,
      kijun,
      senkouA,
      senkouB,
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
    expect(out[0]?.index).toBe(2);
    // senkouA > senkouB -> cloud bullish
    expect(out[0]?.bias).toBe('bullish');
  });

  it('fires bearish on tenkan crossing down kijun', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const tenkan: Array<number | null> = [5, 3, -2, -5];
    const kijun: Array<number | null> = [0, 0, 0, 0];
    const senkouA: Array<number | null> = [5, 5, 5, 5];
    const senkouB: Array<number | null> = [10, 10, 10, 10];
    const out = detectLineIchimokuTenkanCrossCrosses(
      series,
      tenkan,
      kijun,
      senkouA,
      senkouB,
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
    // senkouA < senkouB -> cloud bearish
    expect(out[0]?.bias).toBe('bearish');
  });

  it('cross with null cloud -> bias none', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const tenkan: Array<number | null> = [-5, -3, 2, 5];
    const kijun: Array<number | null> = [0, 0, 0, 0];
    const senkouA: Array<number | null> = [null, null, null, null];
    const senkouB: Array<number | null> = [null, null, null, null];
    const out = detectLineIchimokuTenkanCrossCrosses(
      series,
      tenkan,
      kijun,
      senkouA,
      senkouB,
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.bias).toBe('none');
  });

  it('skips null-window bars', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const tenkan: Array<number | null> = [null, null, 2, 5];
    const kijun: Array<number | null> = [null, null, 0, 0];
    const senkouA: Array<number | null> = [null, null, 10, 10];
    const senkouB: Array<number | null> = [null, null, 5, 5];
    const out = detectLineIchimokuTenkanCrossCrosses(
      series,
      tenkan,
      kijun,
      senkouA,
      senkouB,
    );
    expect(out).toHaveLength(0);
  });
});

describe('runLineIchimokuTenkanCross CONST band', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST band ${K}: all = K, no cross, cloud flat`, () => {
      const data = buildConstBand(80, K);
      const run = runLineIchimokuTenkanCross(data);
      expect(run.tenkanPeriod).toBe(TENKAN);
      expect(run.kijunPeriod).toBe(KIJUN);
      expect(run.senkouBPeriod).toBe(SENKOU_B);
      for (let i = CLOUD_WARMUP; i < 80; i += 1) {
        expect(run.tenkanValues[i] as number).toBe(K);
        expect(run.kijunValues[i] as number).toBe(K);
        expect(run.senkouAValues[i] as number).toBe(K);
        expect(run.senkouBValues[i] as number).toBe(K);
      }
      expect(run.crosses).toHaveLength(0);
      expect(run.flatCloudCount).toBeGreaterThan(0);
      expect(run.ok).toBe(true);
    });
  }
});

describe('runLineIchimokuTenkanCross LINEAR UP', () => {
  it('tenkan above kijun by +8.5 (no cross), cloud bullish', () => {
    const data = buildLinearUp(80);
    const run = runLineIchimokuTenkanCross(data);
    for (let i = CROSS_WARMUP; i < 80; i += 1) {
      const t = run.tenkanValues[i] as number;
      const k = run.kijunValues[i] as number;
      expect(t - k).toBeCloseTo(8.5, 9);
    }
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCloudCount).toBeGreaterThan(0);
  });
});

describe('runLineIchimokuTenkanCross LINEAR DOWN', () => {
  it('tenkan below kijun by -8.5 (no cross), cloud bearish', () => {
    const data = buildLinearDown(80);
    const run = runLineIchimokuTenkanCross(data);
    for (let i = CROSS_WARMUP; i < 80; i += 1) {
      const t = run.tenkanValues[i] as number;
      const k = run.kijunValues[i] as number;
      expect(t - k).toBeCloseTo(-8.5, 9);
    }
    expect(run.crosses).toHaveLength(0);
    expect(run.bearishCloudCount).toBeGreaterThan(0);
  });
});

describe('runLineIchimokuTenkanCross misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineIchimokuTenkanCrossPoint[] = [
      { x: 2, high: 1, low: 0, close: 0.5 },
      { x: 0, high: 1, low: 0, close: 0.5 },
      { x: 1, high: 1, low: 0, close: 0.5 },
    ];
    const run = runLineIchimokuTenkanCross(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short for cross', () => {
    const data = buildConstBand(KIJUN, 50);
    const run = runLineIchimokuTenkanCross(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineIchimokuTenkanCross([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom periods', () => {
    const data = buildLinearUp(80);
    const run = runLineIchimokuTenkanCross(data, {
      tenkanPeriod: 5,
      kijunPeriod: 13,
      senkouBPeriod: 26,
    });
    expect(run.tenkanPeriod).toBe(5);
    expect(run.kijunPeriod).toBe(13);
    expect(run.senkouBPeriod).toBe(26);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(80);
    const run = runLineIchimokuTenkanCross(data);
    expect(run.bullishCount + run.bearishCount + run.noneCount).toBe(80);
  });
});

describe('computeLineIchimokuTenkanCrossLayout', () => {
  it('renders SVG paths for LINEAR UP', () => {
    const data = buildLinearUp(80);
    const layout = computeLineIchimokuTenkanCrossLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(80);
    expect(layout.tenkanPath).toContain('M ');
    expect(layout.kijunPath).toContain('M ');
    expect(layout.senkouAPath).toContain('M ');
    expect(layout.senkouBPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineIchimokuTenkanCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.tenkanPath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineIchimokuTenkanCrossLayout({
      data: buildLinearUp(80),
      width: 600,
      height: 320,
      padding: 32,
      panelGap: 8,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(320);
  });

  it('pads degenerate priceMin === priceMax', () => {
    const data = buildConstBand(80, 100);
    const layout = computeLineIchimokuTenkanCrossLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });
});

describe('describeLineIchimokuTenkanCrossChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineIchimokuTenkanCrossChart([])).toBe('No data');
  });

  it('mentions bar count, periods, conversion baseline trigger, cloud color', () => {
    const desc = describeLineIchimokuTenkanCrossChart(buildLinearUp(80));
    expect(desc).toContain('80 bars');
    expect(desc).toContain('tenkan 9');
    expect(desc).toContain('kijun 26');
    expect(desc).toContain('senkouB 52');
    expect(desc).toContain('conversion baseline trigger');
    expect(desc).toContain('cloud-color confirmation');
  });
});

describe('<ChartLineIchimokuTenkanCross /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineIchimokuTenkanCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-ichimoku-tenkan-cross"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-tenkan-period')).toBe(String(TENKAN));
    expect(root?.getAttribute('data-kijun-period')).toBe(String(KIJUN));
    expect(root?.getAttribute('data-senkou-b-period')).toBe(
      String(SENKOU_B),
    );
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(
      <ChartLineIchimokuTenkanCross data={[]} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ichimoku-tenkan-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders tenkan + kijun + senkouA + senkouB paths', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineIchimokuTenkanCross data={data} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ichimoku-tenkan-cross-tenkan-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-ichimoku-tenkan-cross-kijun-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-ichimoku-tenkan-cross-senkou-a-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-ichimoku-tenkan-cross-senkou-b-path"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineIchimokuTenkanCross data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ichimoku-tenkan-cross-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineIchimokuTenkanCross data={data} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-ichimoku-tenkan-cross-badge"]',
    );
    expect(badge?.textContent).toContain('tenkan 9');
    expect(badge?.textContent).toContain('kijun 26');
    expect(badge?.textContent).toContain('senkouB 52');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineIchimokuTenkanCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-ichimoku-tenkan-cross"]',
    );
    expect(root?.getAttribute('aria-label')).toBe(
      'Ichimoku tenkan-kijun cross chart',
    );
  });

  it('exposes data-cross-count counter for LINEAR UP', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineIchimokuTenkanCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-ichimoku-tenkan-cross"]',
    );
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineIchimokuTenkanCross
        data={data}
        hiddenSeries={['kijun']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ichimoku-tenkan-cross-kijun-path"]',
      ),
    ).toBeNull();
  });
});
