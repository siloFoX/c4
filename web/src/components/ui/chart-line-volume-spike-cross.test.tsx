import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineVolumeSpikeCross,
  DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_MULTIPLIER,
  DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_PADDING,
  DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_PERIOD,
  DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_WIDTH,
  applyLineVolumeSpikeCrossSma,
  classifyLineVolumeSpikeCrossBias,
  classifyLineVolumeSpikeCrossRegime,
  computeLineVolumeSpikeCross,
  computeLineVolumeSpikeCrossLayout,
  describeLineVolumeSpikeCrossChart,
  detectLineVolumeSpikeCrossCrosses,
  getLineVolumeSpikeCrossFinitePoints,
  normalizeLineVolumeSpikeCrossLength,
  normalizeLineVolumeSpikeCrossMultiplier,
  runLineVolumeSpikeCross,
  type ChartLineVolumeSpikeCrossPoint,
} from './chart-line-volume-spike-cross';

const PERIOD = 20;
const MULT = 2;
const WARMUP = PERIOD + 1; // 21

const buildConst = (n: number, v: number): ChartLineVolumeSpikeCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: 100, volume: v }));

const buildLinearUp = (
  n: number,
  offset: number,
): ChartLineVolumeSpikeCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    close: 100,
    volume: i + offset,
  }));

const buildLinearDown = (
  n: number,
  offset: number,
): ChartLineVolumeSpikeCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    close: 100,
    volume: offset - i,
  }));

describe('ChartLineVolumeSpikeCross defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_PANEL_GAP).toBe(12);
  });

  it('exports canonical Volume tuning', () => {
    expect(DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_PERIOD).toBe(20);
    expect(DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_MULTIPLIER).toBe(2);
  });
});

describe('getLineVolumeSpikeCrossFinitePoints', () => {
  it('filters NaN/Infinity and negative volume', () => {
    const points = [
      { x: 0, close: 100, volume: 10 },
      { x: NaN, close: 100, volume: 10 },
      { x: 1, close: 100, volume: -1 }, // negative volume rejected
      { x: 2, close: 100, volume: Infinity },
      { x: 3, close: 100, volume: 0 }, // zero volume accepted
      { x: 4, close: 100, volume: 20 },
    ];
    expect(getLineVolumeSpikeCrossFinitePoints(points)).toEqual([
      { x: 0, close: 100, volume: 10 },
      { x: 3, close: 100, volume: 0 },
      { x: 4, close: 100, volume: 20 },
    ]);
  });

  it('returns empty for null/non-array', () => {
    expect(getLineVolumeSpikeCrossFinitePoints(null)).toEqual([]);
    expect(getLineVolumeSpikeCrossFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizers', () => {
  it('floors finite >=1 length values', () => {
    expect(normalizeLineVolumeSpikeCrossLength(20.7, 20)).toBe(20);
    expect(normalizeLineVolumeSpikeCrossLength(0, 20)).toBe(20);
  });

  it('rejects non-positive multiplier', () => {
    expect(normalizeLineVolumeSpikeCrossMultiplier(2.5, 2)).toBe(2.5);
    expect(normalizeLineVolumeSpikeCrossMultiplier(0, 2)).toBe(2);
    expect(normalizeLineVolumeSpikeCrossMultiplier(-1, 2)).toBe(2);
  });
});

describe('applyLineVolumeSpikeCrossSma', () => {
  it('SMA over linear input', () => {
    const out = applyLineVolumeSpikeCrossSma([0, 1, 2, 3, 4, 5], 3);
    expect(out[2]).toBe(1);
    expect(out[5]).toBe(4);
  });
});

describe('computeLineVolumeSpikeCross CONST', () => {
  it('avg = V, threshold = 2V', () => {
    const data = buildConst(40, 50);
    const out = computeLineVolumeSpikeCross(data);
    for (let i = PERIOD - 1; i < 40; i += 1) {
      expect(out.avgVolume[i] as number).toBe(50);
      expect(out.threshold[i] as number).toBe(100);
    }
  });
});

describe('computeLineVolumeSpikeCross LINEAR UP', () => {
  it('avg = i + 90.5, threshold = 2*(i+90.5) (volume = i + 100)', () => {
    const data = buildLinearUp(40, 100);
    const out = computeLineVolumeSpikeCross(data);
    // avg of (i-19+100, ..., i+100) = mean = i + 100 - 9.5 = i + 90.5
    for (let i = PERIOD - 1; i < 40; i += 1) {
      expect(out.avgVolume[i] as number).toBe(i + 90.5);
      expect(out.threshold[i] as number).toBe(2 * (i + 90.5));
    }
  });
});

describe('computeLineVolumeSpikeCross LINEAR DOWN', () => {
  it('mirror with offset=1000: avg = 1009.5 - i, threshold = 2*(1009.5 - i)', () => {
    const data = buildLinearDown(40, 1000);
    const out = computeLineVolumeSpikeCross(data);
    for (let i = PERIOD - 1; i < 40; i += 1) {
      expect(out.avgVolume[i] as number).toBe(1009.5 - i);
      expect(out.threshold[i] as number).toBe(2 * (1009.5 - i));
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineVolumeSpikeCross([])).toEqual({
      avgVolume: [],
      threshold: [],
    });
  });
});

describe('classifyLineVolumeSpikeCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineVolumeSpikeCrossRegime(null, 100)).toBe('none');
    expect(classifyLineVolumeSpikeCrossRegime(100, null)).toBe('none');
  });
  it('volume >= threshold -> bullish (spike active)', () => {
    expect(classifyLineVolumeSpikeCrossRegime(150, 100)).toBe('bullish');
    expect(classifyLineVolumeSpikeCrossRegime(100, 100)).toBe('bullish');
  });
  it('volume < threshold -> bearish (below)', () => {
    expect(classifyLineVolumeSpikeCrossRegime(50, 100)).toBe('bearish');
  });
});

describe('classifyLineVolumeSpikeCrossBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineVolumeSpikeCrossBias(60, 50)).toBe('up');
    expect(classifyLineVolumeSpikeCrossBias(40, 50)).toBe('down');
    expect(classifyLineVolumeSpikeCrossBias(50, 50)).toBe('flat');
    expect(classifyLineVolumeSpikeCrossBias(null, 50)).toBe('none');
  });
});

describe('detectLineVolumeSpikeCrossCrosses', () => {
  it('fires bullish on volume crossing up threshold (spike entry)', () => {
    const series: ChartLineVolumeSpikeCrossPoint[] = [
      { x: 0, close: 100, volume: 50 },
      { x: 1, close: 100, volume: 80 },
      { x: 2, close: 100, volume: 250 }, // spike!
      { x: 3, close: 100, volume: 260 },
    ];
    const threshold: Array<number | null> = [100, 100, 100, 100];
    const out = detectLineVolumeSpikeCrossCrosses(series, threshold);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
    expect(out[0]?.index).toBe(2);
    expect(out[0]?.bias).toBe('up');
  });

  it('fires bearish on volume crossing down threshold (spike exit)', () => {
    const series: ChartLineVolumeSpikeCrossPoint[] = [
      { x: 0, close: 100, volume: 250 },
      { x: 1, close: 100, volume: 200 },
      { x: 2, close: 100, volume: 50 },
      { x: 3, close: 100, volume: 40 },
    ];
    const threshold: Array<number | null> = [100, 100, 100, 100];
    const out = detectLineVolumeSpikeCrossCrosses(series, threshold);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
    expect(out[0]?.index).toBe(2);
    expect(out[0]?.bias).toBe('down');
  });

  it('skips null-threshold bars', () => {
    const series: ChartLineVolumeSpikeCrossPoint[] = [
      { x: 0, close: 100, volume: 50 },
      { x: 1, close: 100, volume: 80 },
      { x: 2, close: 100, volume: 250 },
      { x: 3, close: 100, volume: 260 },
    ];
    const threshold: Array<number | null> = [null, null, 100, 100];
    const out = detectLineVolumeSpikeCrossCrosses(series, threshold);
    // At i=2: prevThreshold null, skipped. At i=3: pv=250, pt=100, cv=260, ct=100. pv>pt, cv>ct -> no cross.
    expect(out).toHaveLength(0);
  });
});

describe('runLineVolumeSpikeCross CONST', () => {
  for (const V of [0, 1, 50, 200, 1234]) {
    it(`CONST V=${V}: volume=V < threshold=2V, regime bearish, 0 crosses`, () => {
      const data = buildConst(40, V);
      const run = runLineVolumeSpikeCross(data);
      expect(run.period).toBe(PERIOD);
      expect(run.multiplier).toBe(MULT);
      for (let i = WARMUP; i < 40; i += 1) {
        expect(run.avgVolumeValues[i] as number).toBe(V);
        expect(run.thresholdValues[i] as number).toBe(2 * V);
      }
      // For V=0, volume = threshold = 0 -> regime bullish (>=).
      if (V === 0) {
        expect(run.bullishCount).toBeGreaterThan(0);
      } else {
        expect(run.bearishCount).toBeGreaterThan(0);
        expect(run.bullishCount).toBe(0);
      }
      expect(run.crosses).toHaveLength(0);
      expect(run.ok).toBe(true);
    });
  }
});

describe('runLineVolumeSpikeCross LINEAR UP', () => {
  it('volume always below threshold, regime bearish, 0 crosses', () => {
    const data = buildLinearUp(40, 100);
    const run = runLineVolumeSpikeCross(data);
    for (let i = WARMUP; i < 40; i += 1) {
      const v = data[i]!.volume;
      const t = run.thresholdValues[i] as number;
      expect(v).toBeLessThan(t);
    }
    expect(run.bearishCount).toBeGreaterThan(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineVolumeSpikeCross LINEAR DOWN', () => {
  it('volume always below threshold, regime bearish, 0 crosses', () => {
    const data = buildLinearDown(40, 1000);
    const run = runLineVolumeSpikeCross(data);
    for (let i = WARMUP; i < 40; i += 1) {
      const v = data[i]!.volume;
      const t = run.thresholdValues[i] as number;
      expect(v).toBeLessThan(t);
    }
    expect(run.bearishCount).toBeGreaterThan(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineVolumeSpikeCross misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineVolumeSpikeCrossPoint[] = [
      { x: 2, close: 100, volume: 10 },
      { x: 0, close: 100, volume: 10 },
      { x: 1, close: 100, volume: 10 },
    ];
    const run = runLineVolumeSpikeCross(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConst(21, 50);
    const run = runLineVolumeSpikeCross(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineVolumeSpikeCross([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom tuning', () => {
    const data = buildLinearUp(40, 100);
    const run = runLineVolumeSpikeCross(data, {
      period: 10,
      multiplier: 3,
    });
    expect(run.period).toBe(10);
    expect(run.multiplier).toBe(3);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(40, 100);
    const run = runLineVolumeSpikeCross(data);
    expect(run.bullishCount + run.bearishCount + run.noneCount).toBe(40);
  });

  it('detects synthetic volume spike in real data', () => {
    // Steady volume around 50, then a 5x spike at i=22.
    const data: ChartLineVolumeSpikeCrossPoint[] = [];
    for (let i = 0; i < 40; i += 1) {
      data.push({
        x: i,
        close: 100,
        volume: i === 22 ? 500 : 50,
      });
    }
    const run = runLineVolumeSpikeCross(data);
    expect(run.bullishCrossCount).toBeGreaterThan(0);
  });
});

describe('computeLineVolumeSpikeCrossLayout', () => {
  it('renders SVG paths + volume bars for LINEAR UP', () => {
    const data = buildLinearUp(40, 100);
    const layout = computeLineVolumeSpikeCrossLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(40);
    expect(layout.volumeBars).toHaveLength(40);
    expect(layout.thresholdPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('oscillator panel locks to [0, max] (volume is non-negative)', () => {
    const layout = computeLineVolumeSpikeCrossLayout({
      data: buildLinearUp(40, 100),
    });
    expect(layout.oscMin).toBe(0);
    expect(layout.oscMax).toBeGreaterThan(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineVolumeSpikeCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.volumeBars).toEqual([]);
    expect(layout.thresholdPath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineVolumeSpikeCrossLayout({
      data: buildLinearUp(40, 100),
      width: 600,
      height: 320,
      padding: 32,
      panelGap: 8,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(320);
  });

  it('pads degenerate priceMin === priceMax', () => {
    const data = buildConst(40, 50);
    const layout = computeLineVolumeSpikeCrossLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });
});

describe('describeLineVolumeSpikeCrossChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineVolumeSpikeCrossChart([])).toBe('No data');
  });

  it('mentions bar count, period, multiplier, abnormal volume surge', () => {
    const desc = describeLineVolumeSpikeCrossChart(buildLinearUp(40, 100));
    expect(desc).toContain('40 bars');
    expect(desc).toContain('period 20');
    expect(desc).toContain('multiplier 2');
    expect(desc).toContain('abnormal volume surge');
    expect(desc).toContain('bias coloring');
  });
});

describe('<ChartLineVolumeSpikeCross /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(40, 100);
    const { container } = render(<ChartLineVolumeSpikeCross data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-volume-spike-cross"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-period')).toBe(String(PERIOD));
    expect(root?.getAttribute('data-multiplier')).toBe(String(MULT));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(<ChartLineVolumeSpikeCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-volume-spike-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders volume bars + threshold path', () => {
    const data = buildLinearUp(40, 100);
    const { container } = render(<ChartLineVolumeSpikeCross data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-volume-spike-cross-volume-bars"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-volume-spike-cross-threshold-path"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(40, 100);
    const { container } = render(
      <ChartLineVolumeSpikeCross data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-volume-spike-cross-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildLinearUp(40, 100);
    const { container } = render(<ChartLineVolumeSpikeCross data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-volume-spike-cross-badge"]',
    );
    expect(badge?.textContent).toContain('period 20');
    expect(badge?.textContent).toContain('mult 2');
    expect(badge?.textContent).toContain('spikes 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(40, 100);
    const { container } = render(<ChartLineVolumeSpikeCross data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-volume-spike-cross"]',
    );
    expect(root?.getAttribute('aria-label')).toBe(
      'Volume spike-cross chart',
    );
  });

  it('exposes data-cross-count counter for LINEAR UP', () => {
    const data = buildLinearUp(40, 100);
    const { container } = render(<ChartLineVolumeSpikeCross data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-volume-spike-cross"]',
    );
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(40, 100);
    const { container } = render(
      <ChartLineVolumeSpikeCross data={data} hiddenSeries={['threshold']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-volume-spike-cross-threshold-path"]',
      ),
    ).toBeNull();
  });
});
