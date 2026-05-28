import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineIchimokuKijunCross,
  DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_KIJUN_PERIOD,
  DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_PADDING,
  DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_SENKOU_B_PERIOD,
  DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_TENKAN_PERIOD,
  DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_WIDTH,
  classifyLineIchimokuKijunCrossCloudBias,
  classifyLineIchimokuKijunCrossRegime,
  computeLineIchimokuKijunCross,
  computeLineIchimokuKijunCrossLayout,
  describeLineIchimokuKijunCrossChart,
  detectLineIchimokuKijunCrossCrosses,
  getLineIchimokuKijunCrossFinitePoints,
  normalizeLineIchimokuKijunCrossLength,
  runLineIchimokuKijunCross,
  type ChartLineIchimokuKijunCrossPoint,
} from './chart-line-ichimoku-kijun-cross';

const TENKAN = 9;
const KIJUN = 26;
const SENKOU_B = 52;
const CROSS_WARMUP = KIJUN; // 26 for kijun cross (kijun valid at i, i-1)
const CLOUD_WARMUP = SENKOU_B - 1; // 51 for cloud bias valid

const buildConstBand = (
  n: number,
  k: number,
): ChartLineIchimokuKijunCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: k + 1,
    low: k - 1,
    close: k,
  }));

const buildLinearUp = (n: number): ChartLineIchimokuKijunCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: i + 1,
    low: i - 1,
    close: i,
  }));

const buildLinearDown = (n: number): ChartLineIchimokuKijunCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: -i + 1,
    low: -i - 1,
    close: -i,
  }));

// Rises for the first half then falls: the close crosses below the
// lagging kijun-sen baseline after the peak, producing a bearish
// kijun cross.
const buildPeak = (n: number): ChartLineIchimokuKijunCrossPoint[] => {
  const half = Math.floor(n / 2);
  return Array.from({ length: n }, (_, i) => {
    const c = i < half ? i : 2 * (half - 1) - i + (half - 1);
    return { x: i, high: c + 1, low: c - 1, close: c };
  });
};

describe('ChartLineIchimokuKijunCross defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_PANEL_GAP).toBe(12);
  });

  it('exports canonical Ichimoku tuning', () => {
    expect(DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_TENKAN_PERIOD).toBe(9);
    expect(DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_KIJUN_PERIOD).toBe(26);
    expect(DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_SENKOU_B_PERIOD).toBe(52);
  });
});

describe('getLineIchimokuKijunCrossFinitePoints', () => {
  it('filters NaN/Infinity and high<low', () => {
    const points = [
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: NaN, high: 2, low: 1, close: 1.5 },
      { x: 1, high: 1, low: 2, close: 1.5 },
      { x: 2, high: Infinity, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ];
    expect(getLineIchimokuKijunCrossFinitePoints(points)).toEqual([
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ]);
  });

  it('returns empty for null/non-array', () => {
    expect(getLineIchimokuKijunCrossFinitePoints(null)).toEqual([]);
    expect(getLineIchimokuKijunCrossFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineIchimokuKijunCrossLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineIchimokuKijunCrossLength(26.7, 26)).toBe(26);
  });
  it('falls back on invalid', () => {
    expect(normalizeLineIchimokuKijunCrossLength(0, 26)).toBe(26);
    expect(normalizeLineIchimokuKijunCrossLength(NaN, 26)).toBe(26);
  });
});

describe('computeLineIchimokuKijunCross CONST band', () => {
  it('kijun = K constant; senkouA === senkouB (flat cloud)', () => {
    const data = buildConstBand(80, 50);
    const out = computeLineIchimokuKijunCross(data);
    for (let i = KIJUN - 1; i < 80; i += 1) {
      expect(out.kijun[i] as number).toBe(50);
    }
    for (let i = CLOUD_WARMUP; i < 80; i += 1) {
      expect(out.senkouA[i] as number).toBe(out.senkouB[i] as number);
    }
  });
});

describe('computeLineIchimokuKijunCross LINEAR UP', () => {
  it('kijun = i - 12.5 (close stays 12.5 above kijun)', () => {
    const data = buildLinearUp(80);
    const out = computeLineIchimokuKijunCross(data);
    for (let i = KIJUN - 1; i < 80; i += 1) {
      expect(out.kijun[i] as number).toBeCloseTo(i - 12.5, 9);
    }
  });

  it('senkouA > senkouB (bullish cloud) once both valid', () => {
    const data = buildLinearUp(80);
    const out = computeLineIchimokuKijunCross(data);
    for (let i = CLOUD_WARMUP; i < 80; i += 1) {
      expect(out.senkouA[i] as number).toBeGreaterThan(
        out.senkouB[i] as number,
      );
    }
  });
});

describe('computeLineIchimokuKijunCross LINEAR DOWN', () => {
  it('kijun = -i + 12.5; senkouA < senkouB (bearish cloud)', () => {
    const data = buildLinearDown(80);
    const out = computeLineIchimokuKijunCross(data);
    for (let i = KIJUN - 1; i < 80; i += 1) {
      expect(out.kijun[i] as number).toBeCloseTo(-i + 12.5, 9);
    }
    for (let i = CLOUD_WARMUP; i < 80; i += 1) {
      expect(out.senkouA[i] as number).toBeLessThan(
        out.senkouB[i] as number,
      );
    }
  });

  it('returns empty channels for empty data', () => {
    expect(computeLineIchimokuKijunCross([])).toEqual({
      tenkan: [],
      kijun: [],
      senkouA: [],
      senkouB: [],
    });
  });
});

describe('classifyLineIchimokuKijunCrossRegime', () => {
  it('null inputs -> none', () => {
    expect(classifyLineIchimokuKijunCrossRegime(null, 10)).toBe('none');
    expect(classifyLineIchimokuKijunCrossRegime(10, null)).toBe('none');
  });
  it('close >= kijun -> bullish (incl. equal)', () => {
    expect(classifyLineIchimokuKijunCrossRegime(30, 10)).toBe('bullish');
    expect(classifyLineIchimokuKijunCrossRegime(10, 10)).toBe('bullish');
  });
  it('close < kijun -> bearish', () => {
    expect(classifyLineIchimokuKijunCrossRegime(5, 10)).toBe('bearish');
  });
});

describe('classifyLineIchimokuKijunCrossCloudBias', () => {
  it('senkouA > senkouB -> bullish cloud', () => {
    expect(classifyLineIchimokuKijunCrossCloudBias(10, 5)).toBe('bullish');
  });
  it('senkouA < senkouB -> bearish cloud', () => {
    expect(classifyLineIchimokuKijunCrossCloudBias(5, 10)).toBe('bearish');
  });
  it('senkouA === senkouB -> flat cloud', () => {
    expect(classifyLineIchimokuKijunCrossCloudBias(7, 7)).toBe('flat');
  });
  it('null inputs -> none', () => {
    expect(classifyLineIchimokuKijunCrossCloudBias(null, 5)).toBe('none');
    expect(classifyLineIchimokuKijunCrossCloudBias(5, null)).toBe('none');
  });
});

describe('detectLineIchimokuKijunCrossCrosses', () => {
  it('fires BULLISH when close crosses up through kijun', () => {
    const series = Array.from({ length: 3 }, (_, i) => ({
      x: i,
      high: i + 1,
      low: i - 1,
      close: i,
    }));
    // close path provided via series.close (0, 1, 2)
    const kijun: Array<number | null> = [5, 5, 1]; // i=2: prev 1<=5, cur 2>1
    const senkouA: Array<number | null> = [10, 10, 10];
    const senkouB: Array<number | null> = [5, 5, 5];
    const out = detectLineIchimokuKijunCrossCrosses(
      series,
      kijun,
      senkouA,
      senkouB,
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
    expect(out[0]?.index).toBe(2);
    expect(out[0]?.bias).toBe('bullish');
  });

  it('fires BEARISH when close crosses down through kijun', () => {
    const series = [
      { x: 0, high: 1, low: -1, close: 5 },
      { x: 1, high: 1, low: -1, close: 5 },
      { x: 2, high: 1, low: -1, close: 0 },
    ];
    const kijun: Array<number | null> = [3, 3, 3]; // i=2: prev 5>=3, cur 0<3
    const senkouA: Array<number | null> = [5, 5, 5];
    const senkouB: Array<number | null> = [10, 10, 10];
    const out = detectLineIchimokuKijunCrossCrosses(
      series,
      kijun,
      senkouA,
      senkouB,
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
    expect(out[0]?.bias).toBe('bearish');
  });

  it('does not fire when close stays on the same side of kijun', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: i + 1,
      low: i - 1,
      close: i + 10,
    }));
    const kijun: Array<number | null> = [1, 2, 3, 4];
    const senkouA: Array<number | null> = [1, 1, 1, 1];
    const senkouB: Array<number | null> = [1, 1, 1, 1];
    const out = detectLineIchimokuKijunCrossCrosses(
      series,
      kijun,
      senkouA,
      senkouB,
    );
    expect(out).toHaveLength(0);
  });

  it('skips bars with null kijun', () => {
    const series = Array.from({ length: 3 }, (_, i) => ({
      x: i,
      high: i + 1,
      low: i - 1,
      close: i,
    }));
    const kijun: Array<number | null> = [null, null, 1];
    const senkouA: Array<number | null> = [null, null, null];
    const senkouB: Array<number | null> = [null, null, null];
    const out = detectLineIchimokuKijunCrossCrosses(
      series,
      kijun,
      senkouA,
      senkouB,
    );
    expect(out).toHaveLength(0);
  });

  it('cross before senkouB valid carries bias none', () => {
    const series = Array.from({ length: 3 }, (_, i) => ({
      x: i,
      high: i + 1,
      low: i - 1,
      close: i,
    }));
    const kijun: Array<number | null> = [5, 5, 1];
    const senkouA: Array<number | null> = [null, null, null];
    const senkouB: Array<number | null> = [null, null, null];
    const out = detectLineIchimokuKijunCrossCrosses(
      series,
      kijun,
      senkouA,
      senkouB,
    );
    expect(out[0]?.bias).toBe('none');
  });
});

describe('runLineIchimokuKijunCross CONST band', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST band ${K}: close === kijun, regime bullish, 0 crosses`, () => {
      const data = buildConstBand(80, K);
      const run = runLineIchimokuKijunCross(data);
      expect(run.tenkanPeriod).toBe(TENKAN);
      expect(run.kijunPeriod).toBe(KIJUN);
      for (let i = KIJUN - 1; i < 80; i += 1) {
        expect(run.kijunValues[i] as number).toBe(K);
      }
      expect(run.bearishCount).toBe(0);
      expect(run.bullishCount).toBeGreaterThan(0);
      expect(run.crosses).toHaveLength(0);
      expect(run.ok).toBe(true);
    });
  }
});

describe('runLineIchimokuKijunCross LINEAR UP', () => {
  it('close above kijun throughout, regime bullish, 0 crosses', () => {
    const data = buildLinearUp(80);
    const run = runLineIchimokuKijunCross(data);
    for (let i = CROSS_WARMUP; i < 80; i += 1) {
      expect((run.series[i]!.close as number) > (run.kijunValues[i] as number)).toBe(
        true,
      );
    }
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBeGreaterThan(0);
  });
});

describe('runLineIchimokuKijunCross LINEAR DOWN', () => {
  it('close below kijun throughout, regime bearish, 0 crosses', () => {
    const data = buildLinearDown(80);
    const run = runLineIchimokuKijunCross(data);
    for (let i = CROSS_WARMUP; i < 80; i += 1) {
      expect((run.series[i]!.close as number) < (run.kijunValues[i] as number)).toBe(
        true,
      );
    }
    expect(run.crosses).toHaveLength(0);
    expect(run.bearishCount).toBeGreaterThan(0);
  });
});

describe('runLineIchimokuKijunCross PEAK (reversing series)', () => {
  it('produces at least one bearish cross when price reverses below baseline', () => {
    const data = buildPeak(120);
    const run = runLineIchimokuKijunCross(data);
    expect(run.crosses.length).toBeGreaterThan(0);
    const hasBearish = run.crosses.some((c) => c.kind === 'bearish');
    expect(hasBearish).toBe(true);
  });
});

describe('runLineIchimokuKijunCross misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineIchimokuKijunCrossPoint[] = [
      { x: 2, high: 2, low: 0, close: 1 },
      { x: 0, high: 2, low: 0, close: 1 },
      { x: 1, high: 2, low: 0, close: 1 },
    ];
    const run = runLineIchimokuKijunCross(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConstBand(KIJUN, 50);
    const run = runLineIchimokuKijunCross(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineIchimokuKijunCross([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom periods', () => {
    const data = buildLinearUp(80);
    const run = runLineIchimokuKijunCross(data, {
      tenkanPeriod: 7,
      kijunPeriod: 14,
      senkouBPeriod: 28,
    });
    expect(run.tenkanPeriod).toBe(7);
    expect(run.kijunPeriod).toBe(14);
    expect(run.senkouBPeriod).toBe(28);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(80);
    const run = runLineIchimokuKijunCross(data);
    expect(run.bullishCount + run.bearishCount + run.noneCount).toBe(80);
  });

  it('cross counts match crosses length', () => {
    const data = buildPeak(120);
    const run = runLineIchimokuKijunCross(data);
    expect(run.bullishCrossCount + run.bearishCrossCount).toBe(
      run.crosses.length,
    );
  });
});

describe('computeLineIchimokuKijunCrossLayout', () => {
  it('renders SVG paths for LINEAR UP', () => {
    const data = buildLinearUp(80);
    const layout = computeLineIchimokuKijunCrossLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(80);
    expect(layout.kijunPath).toContain('M ');
  });

  it('LINEAR UP produces 0 cross markers', () => {
    const layout = computeLineIchimokuKijunCrossLayout({
      data: buildLinearUp(80),
    });
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('PEAK produces > 0 cross markers', () => {
    const layout = computeLineIchimokuKijunCrossLayout({
      data: buildPeak(120),
    });
    expect(layout.crossMarkers.length).toBeGreaterThan(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineIchimokuKijunCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.kijunPath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineIchimokuKijunCrossLayout({
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
    const layout = computeLineIchimokuKijunCrossLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });
});

describe('describeLineIchimokuKijunCrossChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineIchimokuKijunCrossChart([])).toBe('No data');
  });

  it('mentions bar count, periods, baseline trigger', () => {
    const desc = describeLineIchimokuKijunCrossChart(buildLinearUp(80));
    expect(desc).toContain('80 bars');
    expect(desc).toContain('kijun 26');
    expect(desc).toContain('baseline trigger');
    expect(desc).toContain('cloud');
  });
});

describe('<ChartLineIchimokuKijunCross /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(80);
    const { container } = render(<ChartLineIchimokuKijunCross data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-ichimoku-kijun-cross"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-kijun-period')).toBe(String(KIJUN));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(<ChartLineIchimokuKijunCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-ichimoku-kijun-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders kijun path', () => {
    const data = buildLinearUp(80);
    const { container } = render(<ChartLineIchimokuKijunCross data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-ichimoku-kijun-cross-kijun-path"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineIchimokuKijunCross data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ichimoku-kijun-cross-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildLinearUp(80);
    const { container } = render(<ChartLineIchimokuKijunCross data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-ichimoku-kijun-cross-badge"]',
    );
    expect(badge?.textContent).toContain('kijun 26');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(80);
    const { container } = render(<ChartLineIchimokuKijunCross data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-ichimoku-kijun-cross"]',
    );
    expect(root?.getAttribute('aria-label')).toBe(
      'Ichimoku kijun baseline cross chart',
    );
  });

  it('exposes data-cross-count counter (zero for LINEAR UP)', () => {
    const data = buildLinearUp(80);
    const { container } = render(<ChartLineIchimokuKijunCross data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-ichimoku-kijun-cross"]',
    );
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('exposes non-zero cross-count for PEAK', () => {
    const data = buildPeak(120);
    const { container } = render(<ChartLineIchimokuKijunCross data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-ichimoku-kijun-cross"]',
    );
    const crossCount = Number(root?.getAttribute('data-cross-count'));
    expect(crossCount).toBeGreaterThan(0);
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineIchimokuKijunCross data={data} hiddenSeries={['kijun']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ichimoku-kijun-cross-kijun-path"]',
      ),
    ).toBeNull();
  });
});
