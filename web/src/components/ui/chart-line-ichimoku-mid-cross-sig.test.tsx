import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineIchimokuMidCrossSig,
  DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_HEIGHT,
  DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_KIJUN_PERIOD,
  DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_PADDING,
  DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_PANEL_GAP,
  DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_SENKOU_B_PERIOD,
  DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_SIGNAL_LENGTH,
  DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_TENKAN_PERIOD,
  DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_WIDTH,
  applyLineIchimokuMidCrossSigSma,
  classifyLineIchimokuMidCrossSigBias,
  classifyLineIchimokuMidCrossSigRegime,
  computeLineIchimokuMidCrossSig,
  computeLineIchimokuMidCrossSigLayout,
  describeLineIchimokuMidCrossSigChart,
  detectLineIchimokuMidCrossSigCrosses,
  getLineIchimokuMidCrossSigFinitePoints,
  normalizeLineIchimokuMidCrossSigLength,
  runLineIchimokuMidCrossSig,
  type ChartLineIchimokuMidCrossSigPoint,
} from './chart-line-ichimoku-mid-cross-sig';

const TENKAN = 9;
const KIJUN = 26;
const SENKOU_B = 52;
const SIGNAL = 3;
const WARMUP = SENKOU_B + SIGNAL - 2; // 53

const buildConstBand = (
  n: number,
  k: number,
): ChartLineIchimokuMidCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: k + 1,
    low: k - 1,
    close: k,
  }));

const buildLinearUp = (n: number): ChartLineIchimokuMidCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: i + 1,
    low: i - 1,
    close: i,
  }));

const buildLinearDown = (n: number): ChartLineIchimokuMidCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: -i + 1,
    low: -i - 1,
    close: -i,
  }));

describe('ChartLineIchimokuMidCrossSig defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_PANEL_GAP).toBe(12);
  });

  it('exports canonical Ichimoku tuning', () => {
    expect(DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_TENKAN_PERIOD).toBe(9);
    expect(DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_KIJUN_PERIOD).toBe(26);
    expect(DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_SENKOU_B_PERIOD).toBe(
      52,
    );
    expect(DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_SIGNAL_LENGTH).toBe(3);
  });
});

describe('getLineIchimokuMidCrossSigFinitePoints', () => {
  it('filters NaN/Infinity and high<low', () => {
    const points = [
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: NaN, high: 2, low: 1, close: 1.5 },
      { x: 1, high: 1, low: 2, close: 1.5 },
      { x: 2, high: Infinity, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ];
    expect(getLineIchimokuMidCrossSigFinitePoints(points)).toEqual([
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ]);
  });

  it('returns empty for null and non-array', () => {
    expect(getLineIchimokuMidCrossSigFinitePoints(null)).toEqual([]);
    expect(getLineIchimokuMidCrossSigFinitePoints(undefined)).toEqual([]);
    expect(
      getLineIchimokuMidCrossSigFinitePoints(
        // @ts-expect-error -- intentionally bad
        'oops',
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineIchimokuMidCrossSigLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineIchimokuMidCrossSigLength(14.7, 14)).toBe(14);
    expect(normalizeLineIchimokuMidCrossSigLength(0, 14)).toBe(14);
    expect(normalizeLineIchimokuMidCrossSigLength(NaN, 14)).toBe(14);
  });
});

describe('applyLineIchimokuMidCrossSigSma', () => {
  it('SMA over linear input', () => {
    const out = applyLineIchimokuMidCrossSigSma([0, 1, 2, 3, 4, 5], 3);
    expect(out[2]).toBe(1);
    expect(out[5]).toBe(4);
  });
  it('passthrough at length 1', () => {
    expect(applyLineIchimokuMidCrossSigSma([1, 2, 3], 1)).toEqual([1, 2, 3]);
  });
});

describe('computeLineIchimokuMidCrossSig CONST band', () => {
  it('kumoMid=K, signal=K', () => {
    const data = buildConstBand(80, 50);
    const out = computeLineIchimokuMidCrossSig(data);
    for (let i = SENKOU_B - 1; i < 80; i += 1) {
      expect(out.kumoMid[i] as number).toBe(50);
    }
    for (let i = WARMUP; i < 80; i += 1) {
      expect(out.signal[i] as number).toBe(50);
    }
  });
});

describe('computeLineIchimokuMidCrossSig LINEAR UP', () => {
  it('kumoMid = i - 16.875, signal = i - 17.875 (1-bar SMA lag)', () => {
    const data = buildLinearUp(80);
    const out = computeLineIchimokuMidCrossSig(data);
    for (let i = SENKOU_B - 1; i < 80; i += 1) {
      expect(out.kumoMid[i] as number).toBeCloseTo(i - 16.875, 9);
    }
    for (let i = WARMUP; i < 80; i += 1) {
      expect(out.signal[i] as number).toBeCloseTo(i - 17.875, 9);
    }
  });
});

describe('computeLineIchimokuMidCrossSig LINEAR DOWN', () => {
  it('kumoMid = -i + 16.875, signal = -i + 17.875 (mirror)', () => {
    const data = buildLinearDown(80);
    const out = computeLineIchimokuMidCrossSig(data);
    for (let i = SENKOU_B - 1; i < 80; i += 1) {
      expect(out.kumoMid[i] as number).toBeCloseTo(-i + 16.875, 9);
    }
    for (let i = WARMUP; i < 80; i += 1) {
      expect(out.signal[i] as number).toBeCloseTo(-i + 17.875, 9);
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineIchimokuMidCrossSig([])).toEqual({
      tenkan: [],
      kijun: [],
      senkouA: [],
      senkouB: [],
      kumoMid: [],
      signal: [],
    });
  });
});

describe('classifyLineIchimokuMidCrossSigRegime', () => {
  it('null -> none', () => {
    expect(classifyLineIchimokuMidCrossSigRegime(null, 5)).toBe('none');
  });
  it('kumoMid > signal -> bullish', () => {
    expect(classifyLineIchimokuMidCrossSigRegime(10, 5)).toBe('bullish');
  });
  it('kumoMid === signal -> bullish (>=)', () => {
    expect(classifyLineIchimokuMidCrossSigRegime(5, 5)).toBe('bullish');
  });
  it('kumoMid < signal -> bearish', () => {
    expect(classifyLineIchimokuMidCrossSigRegime(5, 10)).toBe('bearish');
  });
});

describe('classifyLineIchimokuMidCrossSigBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineIchimokuMidCrossSigBias(60, 50)).toBe('up');
    expect(classifyLineIchimokuMidCrossSigBias(40, 50)).toBe('down');
    expect(classifyLineIchimokuMidCrossSigBias(50, 50)).toBe('flat');
    expect(classifyLineIchimokuMidCrossSigBias(null, 50)).toBe('none');
  });
});

describe('detectLineIchimokuMidCrossSigCrosses', () => {
  it('fires bullish on kumoMid crossing up signal', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const km: Array<number | null> = [-5, -3, 2, 5];
    const sig: Array<number | null> = [0, 0, 0, 0];
    const out = detectLineIchimokuMidCrossSigCrosses(series, km, sig);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
    expect(out[0]?.index).toBe(2);
  });

  it('fires bearish on kumoMid crossing down signal', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const km: Array<number | null> = [5, 3, -2, -5];
    const sig: Array<number | null> = [0, 0, 0, 0];
    const out = detectLineIchimokuMidCrossSigCrosses(series, km, sig);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
  });

  it('skips null-window bars', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const km: Array<number | null> = [null, null, 2, 5];
    const sig: Array<number | null> = [null, null, 0, 0];
    const out = detectLineIchimokuMidCrossSigCrosses(series, km, sig);
    expect(out).toHaveLength(0);
  });
});

describe('runLineIchimokuMidCrossSig CONST band', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST band ${K}: kumoMid=signal=K, regime bullish, 0 crosses`, () => {
      const data = buildConstBand(80, K);
      const run = runLineIchimokuMidCrossSig(data);
      expect(run.tenkanPeriod).toBe(TENKAN);
      expect(run.kijunPeriod).toBe(KIJUN);
      expect(run.senkouBPeriod).toBe(SENKOU_B);
      expect(run.signalLength).toBe(SIGNAL);
      for (let i = WARMUP; i < 80; i += 1) {
        expect(run.kumoMidValues[i] as number).toBe(K);
        expect(run.signalValues[i] as number).toBe(K);
      }
      expect(run.crosses).toHaveLength(0);
      expect(run.ok).toBe(true);
    });
  }
});

describe('runLineIchimokuMidCrossSig LINEAR UP', () => {
  it('kumoMid above signal by 1, regime bullish, 0 crosses', () => {
    const data = buildLinearUp(80);
    const run = runLineIchimokuMidCrossSig(data);
    for (let i = WARMUP; i < 80; i += 1) {
      const km = run.kumoMidValues[i] as number;
      const sig = run.signalValues[i] as number;
      expect(km - sig).toBeCloseTo(1, 9);
    }
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineIchimokuMidCrossSig LINEAR DOWN', () => {
  it('kumoMid below signal by 1, regime bearish, 0 crosses', () => {
    const data = buildLinearDown(80);
    const run = runLineIchimokuMidCrossSig(data);
    for (let i = WARMUP; i < 80; i += 1) {
      const km = run.kumoMidValues[i] as number;
      const sig = run.signalValues[i] as number;
      expect(km - sig).toBeCloseTo(-1, 9);
    }
    expect(run.bearishCount).toBeGreaterThan(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineIchimokuMidCrossSig misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineIchimokuMidCrossSigPoint[] = [
      { x: 2, high: 1, low: 0, close: 0.5 },
      { x: 0, high: 1, low: 0, close: 0.5 },
      { x: 1, high: 1, low: 0, close: 0.5 },
    ];
    const run = runLineIchimokuMidCrossSig(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConstBand(53, 50);
    const run = runLineIchimokuMidCrossSig(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineIchimokuMidCrossSig([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom periods', () => {
    const data = buildLinearUp(80);
    const run = runLineIchimokuMidCrossSig(data, {
      tenkanPeriod: 5,
      kijunPeriod: 13,
      senkouBPeriod: 26,
      signalLength: 5,
    });
    expect(run.tenkanPeriod).toBe(5);
    expect(run.kijunPeriod).toBe(13);
    expect(run.senkouBPeriod).toBe(26);
    expect(run.signalLength).toBe(5);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(80);
    const run = runLineIchimokuMidCrossSig(data);
    expect(run.bullishCount + run.bearishCount + run.noneCount).toBe(80);
  });
});

describe('computeLineIchimokuMidCrossSigLayout', () => {
  it('renders SVG paths for LINEAR UP', () => {
    const data = buildLinearUp(80);
    const layout = computeLineIchimokuMidCrossSigLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(80);
    expect(layout.kumoMidPath).toContain('M ');
    expect(layout.signalPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineIchimokuMidCrossSigLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.kumoMidPath).toBe('');
    expect(layout.signalPath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineIchimokuMidCrossSigLayout({
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
    const layout = computeLineIchimokuMidCrossSigLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });
});

describe('describeLineIchimokuMidCrossSigChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineIchimokuMidCrossSigChart([])).toBe('No data');
  });

  it('mentions bar count, periods, cloud centerline trend trigger', () => {
    const desc = describeLineIchimokuMidCrossSigChart(buildLinearUp(80));
    expect(desc).toContain('80 bars');
    expect(desc).toContain('tenkan 9');
    expect(desc).toContain('kijun 26');
    expect(desc).toContain('senkouB 52');
    expect(desc).toContain('signalLength 3');
    expect(desc).toContain('cloud centerline trend trigger');
    expect(desc).toContain('bias coloring');
  });
});

describe('<ChartLineIchimokuMidCrossSig /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(80);
    const { container } = render(<ChartLineIchimokuMidCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-ichimoku-mid-cross-sig"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-tenkan-period')).toBe(String(TENKAN));
    expect(root?.getAttribute('data-kijun-period')).toBe(String(KIJUN));
    expect(root?.getAttribute('data-senkou-b-period')).toBe(String(SENKOU_B));
    expect(root?.getAttribute('data-signal-length')).toBe(String(SIGNAL));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(<ChartLineIchimokuMidCrossSig data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-ichimoku-mid-cross-sig-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders kumo mid + signal paths', () => {
    const data = buildLinearUp(80);
    const { container } = render(<ChartLineIchimokuMidCrossSig data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-ichimoku-mid-cross-sig-kumo-mid-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-ichimoku-mid-cross-sig-signal-path"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineIchimokuMidCrossSig data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ichimoku-mid-cross-sig-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildLinearUp(80);
    const { container } = render(<ChartLineIchimokuMidCrossSig data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-ichimoku-mid-cross-sig-badge"]',
    );
    expect(badge?.textContent).toContain('tenkan 9');
    expect(badge?.textContent).toContain('kijun 26');
    expect(badge?.textContent).toContain('senkouB 52');
    expect(badge?.textContent).toContain('signal 3');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(80);
    const { container } = render(<ChartLineIchimokuMidCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-ichimoku-mid-cross-sig"]',
    );
    expect(root?.getAttribute('aria-label')).toBe(
      'Ichimoku kumo-midline-over-Signal chart',
    );
  });

  it('exposes data-*-count counters for LINEAR UP', () => {
    const data = buildLinearUp(80);
    const { container } = render(<ChartLineIchimokuMidCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-ichimoku-mid-cross-sig"]',
    );
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineIchimokuMidCrossSig data={data} hiddenSeries={['signal']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ichimoku-mid-cross-sig-signal-path"]',
      ),
    ).toBeNull();
  });
});
