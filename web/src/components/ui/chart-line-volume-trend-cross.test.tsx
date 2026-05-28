import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineVolumeTrendCross,
  DEFAULT_CHART_LINE_VOLUME_TREND_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_VOLUME_TREND_CROSS_PADDING,
  DEFAULT_CHART_LINE_VOLUME_TREND_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_VOLUME_TREND_CROSS_PERIOD,
  DEFAULT_CHART_LINE_VOLUME_TREND_CROSS_WIDTH,
  classifyLineVolumeTrendCrossBias,
  classifyLineVolumeTrendCrossRegime,
  computeLineVolumeTrendCross,
  computeLineVolumeTrendCrossLayout,
  describeLineVolumeTrendCrossChart,
  detectLineVolumeTrendCrossCrosses,
  getLineVolumeTrendCrossFinitePoints,
  normalizeLineVolumeTrendCrossLength,
  runLineVolumeTrendCross,
  type ChartLineVolumeTrendCrossPoint,
} from './chart-line-volume-trend-cross';

const PERIOD = 20;
const WARMUP = PERIOD; // first cross at i = period

const buildConst = (
  n: number,
  k: number,
  v = 10,
): ChartLineVolumeTrendCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: k, volume: v }));

// Linear up price, CONSTANT volume -> VWMA === SMA exactly.
const buildLinearUpConstVol = (
  n: number,
  v = 10,
): ChartLineVolumeTrendCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: i, volume: v }));

// Linear up price, RISING volume -> higher prices carry more
// volume -> VWMA > SMA.
const buildLinearUpRisingVol = (
  n: number,
): ChartLineVolumeTrendCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: i, volume: i + 1 }));

// Volume regime shift: alternating price (100 / 110); volume
// concentrated on the LOW bars for the first half (VWMA < SMA,
// bearish), then on the HIGH bars for the second half (VWMA > SMA,
// bullish) -> a bullish cross as the window slides into the second
// regime.
const buildVolumeShift = (n: number): ChartLineVolumeTrendCrossPoint[] => {
  const half = Math.floor(n / 2);
  return Array.from({ length: n }, (_, i) => {
    const isHighPrice = i % 2 === 1;
    const close = isHighPrice ? 110 : 100;
    let volume: number;
    if (i < half) {
      volume = isHighPrice ? 1 : 10; // weight LOW prices
    } else {
      volume = isHighPrice ? 10 : 1; // weight HIGH prices
    }
    return { x: i, close, volume };
  });
};

describe('ChartLineVolumeTrendCross defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_VOLUME_TREND_CROSS_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_VOLUME_TREND_CROSS_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_VOLUME_TREND_CROSS_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_VOLUME_TREND_CROSS_PANEL_GAP).toBe(12);
  });

  it('exports canonical VWMA tuning', () => {
    expect(DEFAULT_CHART_LINE_VOLUME_TREND_CROSS_PERIOD).toBe(20);
  });
});

describe('getLineVolumeTrendCrossFinitePoints', () => {
  it('filters NaN/Infinity and negative volume', () => {
    const points = [
      { x: 0, close: 1.5, volume: 10 },
      { x: NaN, close: 1.5, volume: 10 },
      { x: 1, close: 1.5, volume: -5 },
      { x: 2, close: Infinity, volume: 10 },
      { x: 3, close: 2, volume: 0 },
    ];
    expect(getLineVolumeTrendCrossFinitePoints(points)).toEqual([
      { x: 0, close: 1.5, volume: 10 },
      { x: 3, close: 2, volume: 0 },
    ]);
  });

  it('returns empty for null/non-array', () => {
    expect(getLineVolumeTrendCrossFinitePoints(null)).toEqual([]);
    expect(getLineVolumeTrendCrossFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineVolumeTrendCrossLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineVolumeTrendCrossLength(20.7, 20)).toBe(20);
  });
  it('falls back on invalid', () => {
    expect(normalizeLineVolumeTrendCrossLength(0, 20)).toBe(20);
    expect(normalizeLineVolumeTrendCrossLength(NaN, 20)).toBe(20);
  });
});

describe('computeLineVolumeTrendCross CONST', () => {
  it('VWMA = SMA = K from i = period - 1 onwards', () => {
    const data = buildConst(40, 50);
    const out = computeLineVolumeTrendCross(data);
    for (let i = 0; i < PERIOD - 1; i += 1) {
      expect(out.vwma[i]).toBeNull();
      expect(out.sma[i]).toBeNull();
    }
    for (let i = PERIOD - 1; i < 40; i += 1) {
      expect(out.vwma[i] as number).toBe(50);
      expect(out.sma[i] as number).toBe(50);
    }
  });

  it('VWMA null when window volume sum is 0', () => {
    const data = buildConst(40, 50, 0);
    const out = computeLineVolumeTrendCross(data);
    for (let i = PERIOD - 1; i < 40; i += 1) {
      expect(out.vwma[i]).toBeNull();
      expect(out.sma[i] as number).toBe(50); // SMA still valid
    }
  });
});

describe('computeLineVolumeTrendCross LINEAR UP, CONST volume', () => {
  it('VWMA === SMA exactly (constant-volume identity)', () => {
    const data = buildLinearUpConstVol(40);
    const out = computeLineVolumeTrendCross(data);
    for (let i = PERIOD - 1; i < 40; i += 1) {
      expect(out.vwma[i] as number).toBeCloseTo(out.sma[i] as number, 9);
    }
  });
});

describe('computeLineVolumeTrendCross LINEAR UP, RISING volume', () => {
  it('VWMA > SMA (higher prices carry more volume)', () => {
    const data = buildLinearUpRisingVol(40);
    const out = computeLineVolumeTrendCross(data);
    for (let i = PERIOD - 1; i < 40; i += 1) {
      expect(out.vwma[i] as number).toBeGreaterThan(out.sma[i] as number);
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineVolumeTrendCross([])).toEqual({ vwma: [], sma: [] });
  });
});

describe('classifyLineVolumeTrendCrossRegime', () => {
  it('null inputs -> none', () => {
    expect(classifyLineVolumeTrendCrossRegime(null, 10)).toBe('none');
    expect(classifyLineVolumeTrendCrossRegime(10, null)).toBe('none');
  });
  it('VWMA >= SMA -> bullish (incl. equal)', () => {
    expect(classifyLineVolumeTrendCrossRegime(30, 10)).toBe('bullish');
    expect(classifyLineVolumeTrendCrossRegime(10, 10)).toBe('bullish');
  });
  it('VWMA < SMA -> bearish', () => {
    expect(classifyLineVolumeTrendCrossRegime(5, 10)).toBe('bearish');
  });
});

describe('classifyLineVolumeTrendCrossBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineVolumeTrendCrossBias(6, 5)).toBe('up');
    expect(classifyLineVolumeTrendCrossBias(4, 5)).toBe('down');
    expect(classifyLineVolumeTrendCrossBias(5, 5)).toBe('flat');
    expect(classifyLineVolumeTrendCrossBias(null, 5)).toBe('none');
    expect(classifyLineVolumeTrendCrossBias(5, null)).toBe('none');
  });
});

describe('detectLineVolumeTrendCrossCrosses', () => {
  it('fires BULLISH when VWMA crosses up through SMA', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: i,
      volume: 10,
    }));
    const vwma: Array<number | null> = [10, 20, 35, 40];
    const sma: Array<number | null> = [30, 25, 20, 15];
    const out = detectLineVolumeTrendCrossCrosses(series, vwma, sma);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
    expect(out[0]?.index).toBe(2);
  });

  it('fires BEARISH when VWMA crosses down through SMA', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: i,
      volume: 10,
    }));
    const vwma: Array<number | null> = [30, 25, 15, 10];
    const sma: Array<number | null> = [10, 20, 30, 35];
    const out = detectLineVolumeTrendCrossCrosses(series, vwma, sma);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
  });

  it('does not fire when VWMA stays on same side of SMA', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: i,
      volume: 10,
    }));
    const vwma: Array<number | null> = [30, 35, 40, 45];
    const sma: Array<number | null> = [10, 15, 20, 25];
    const out = detectLineVolumeTrendCrossCrosses(series, vwma, sma);
    expect(out).toHaveLength(0);
  });

  it('skips bars with null values', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: i,
      volume: 10,
    }));
    const vwma: Array<number | null> = [null, null, 20, 35];
    const sma: Array<number | null> = [null, null, 25, 20];
    const out = detectLineVolumeTrendCrossCrosses(series, vwma, sma);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
  });

  it('bias up when (VWMA - SMA) rises across the cross', () => {
    const series = Array.from({ length: 3 }, (_, i) => ({
      x: i,
      close: i,
      volume: 10,
    }));
    const vwma: Array<number | null> = [20, 35, 40];
    const sma: Array<number | null> = [25, 20, 15];
    const out = detectLineVolumeTrendCrossCrosses(series, vwma, sma);
    expect(out[0]?.bias).toBe('up');
  });
});

describe('runLineVolumeTrendCross CONST', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST ${K}: VWMA = SMA = K, regime bullish, 0 crosses`, () => {
      const data = buildConst(40, K);
      const run = runLineVolumeTrendCross(data);
      expect(run.period).toBe(PERIOD);
      for (let i = PERIOD - 1; i < 40; i += 1) {
        expect(run.vwmaValues[i] as number).toBe(K);
        expect(run.smaValues[i] as number).toBe(K);
      }
      expect(run.bullishCount).toBeGreaterThan(0);
      expect(run.bearishCount).toBe(0);
      expect(run.crosses).toHaveLength(0);
      expect(run.ok).toBe(true);
    });
  }
});

describe('runLineVolumeTrendCross LINEAR UP CONST volume', () => {
  it('VWMA === SMA, regime bullish, 0 crosses (volume weights cancel)', () => {
    const data = buildLinearUpConstVol(40);
    const run = runLineVolumeTrendCross(data);
    for (let i = PERIOD - 1; i < 40; i += 1) {
      expect(run.vwmaValues[i] as number).toBeCloseTo(
        run.smaValues[i] as number,
        9,
      );
    }
    expect(run.bullishCount).toBeGreaterThan(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineVolumeTrendCross LINEAR UP RISING volume', () => {
  it('VWMA above SMA throughout, regime bullish, 0 crosses', () => {
    const data = buildLinearUpRisingVol(40);
    const run = runLineVolumeTrendCross(data);
    for (let i = PERIOD; i < 40; i += 1) {
      expect((run.vwmaValues[i] as number) > (run.smaValues[i] as number)).toBe(
        true,
      );
    }
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBeGreaterThan(0);
  });
});

describe('runLineVolumeTrendCross VOLUME SHIFT', () => {
  it('produces at least one cross when the volume regime flips', () => {
    const data = buildVolumeShift(80);
    const run = runLineVolumeTrendCross(data);
    expect(run.crosses.length).toBeGreaterThan(0);
  });

  it('exposes both bullish and bearish regime bars across the shift', () => {
    const data = buildVolumeShift(80);
    const run = runLineVolumeTrendCross(data);
    expect(run.bullishCount).toBeGreaterThan(0);
    expect(run.bearishCount).toBeGreaterThan(0);
  });
});

describe('runLineVolumeTrendCross misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineVolumeTrendCrossPoint[] = [
      { x: 2, close: 1, volume: 10 },
      { x: 0, close: 1, volume: 10 },
      { x: 1, close: 1, volume: 10 },
    ];
    const run = runLineVolumeTrendCross(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConst(PERIOD, 50);
    const run = runLineVolumeTrendCross(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineVolumeTrendCross([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom period', () => {
    const data = buildLinearUpConstVol(40);
    const run = runLineVolumeTrendCross(data, { period: 5 });
    expect(run.period).toBe(5);
  });

  it('regime counts sum to series length', () => {
    const data = buildVolumeShift(80);
    const run = runLineVolumeTrendCross(data);
    expect(run.bullishCount + run.bearishCount + run.noneCount).toBe(80);
  });

  it('cross counts match crosses length', () => {
    const data = buildVolumeShift(80);
    const run = runLineVolumeTrendCross(data);
    expect(run.bullishCrossCount + run.bearishCrossCount).toBe(
      run.crosses.length,
    );
  });

  it('exposes diffValues = VWMA - SMA (zero for constant volume)', () => {
    const data = buildLinearUpConstVol(40);
    const run = runLineVolumeTrendCross(data);
    for (let i = PERIOD - 1; i < 40; i += 1) {
      expect(run.diffValues[i] as number).toBeCloseTo(0, 9);
    }
  });
});

describe('computeLineVolumeTrendCrossLayout', () => {
  it('renders SVG paths for LINEAR UP rising volume', () => {
    const data = buildLinearUpRisingVol(40);
    const layout = computeLineVolumeTrendCrossLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(40);
    expect(layout.vwmaPath).toContain('M ');
    expect(layout.smaPath).toContain('M ');
  });

  it('CONST volume LINEAR UP produces 0 cross markers', () => {
    const layout = computeLineVolumeTrendCrossLayout({
      data: buildLinearUpConstVol(40),
    });
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('VOLUME SHIFT produces > 0 cross markers', () => {
    const layout = computeLineVolumeTrendCrossLayout({
      data: buildVolumeShift(80),
    });
    expect(layout.crossMarkers.length).toBeGreaterThan(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineVolumeTrendCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.vwmaPath).toBe('');
    expect(layout.smaPath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineVolumeTrendCrossLayout({
      data: buildLinearUpRisingVol(40),
      width: 600,
      height: 320,
      padding: 32,
      panelGap: 8,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(320);
  });

  it('pads degenerate priceMin === priceMax', () => {
    const data = buildConst(40, 100);
    const layout = computeLineVolumeTrendCrossLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });
});

describe('describeLineVolumeTrendCrossChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineVolumeTrendCrossChart([])).toBe('No data');
  });

  it('mentions bar count, period, volume regime change', () => {
    const desc = describeLineVolumeTrendCrossChart(buildLinearUpRisingVol(40));
    expect(desc).toContain('40 bars');
    expect(desc).toContain('period 20');
    expect(desc).toContain('volume regime change');
    expect(desc).toContain('VWMA');
  });
});

describe('<ChartLineVolumeTrendCross /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUpRisingVol(40);
    const { container } = render(<ChartLineVolumeTrendCross data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-volume-trend-cross"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-period')).toBe(String(PERIOD));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(<ChartLineVolumeTrendCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-volume-trend-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders VWMA and SMA paths', () => {
    const data = buildLinearUpRisingVol(40);
    const { container } = render(<ChartLineVolumeTrendCross data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-volume-trend-cross-vwma-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-volume-trend-cross-sma-path"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUpRisingVol(40);
    const { container } = render(
      <ChartLineVolumeTrendCross data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-volume-trend-cross-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildLinearUpRisingVol(40);
    const { container } = render(<ChartLineVolumeTrendCross data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-volume-trend-cross-badge"]',
    );
    expect(badge?.textContent).toContain('period 20');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUpRisingVol(40);
    const { container } = render(<ChartLineVolumeTrendCross data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-volume-trend-cross"]',
    );
    expect(root?.getAttribute('aria-label')).toBe(
      'Volume-weighted trend cross chart',
    );
  });

  it('exposes data-cross-count counter (zero for CONST volume)', () => {
    const data = buildLinearUpConstVol(40);
    const { container } = render(<ChartLineVolumeTrendCross data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-volume-trend-cross"]',
    );
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('exposes non-zero cross-count for VOLUME SHIFT', () => {
    const data = buildVolumeShift(80);
    const { container } = render(<ChartLineVolumeTrendCross data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-volume-trend-cross"]',
    );
    const crossCount = Number(root?.getAttribute('data-cross-count'));
    expect(crossCount).toBeGreaterThan(0);
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUpRisingVol(40);
    const { container } = render(
      <ChartLineVolumeTrendCross data={data} hiddenSeries={['vwma']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-volume-trend-cross-vwma-path"]',
      ),
    ).toBeNull();
  });

  it('renders three legend buttons (close, VWMA, SMA)', () => {
    const data = buildLinearUpRisingVol(40);
    const { container } = render(<ChartLineVolumeTrendCross data={data} />);
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-volume-trend-cross-legend"] button',
    );
    expect(buttons).toHaveLength(3);
  });
});
