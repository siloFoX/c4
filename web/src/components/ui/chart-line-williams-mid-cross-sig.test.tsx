import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineWilliamsMidCrossSig,
  DEFAULT_CHART_LINE_WILLIAMS_MID_CROSS_SIG_HEIGHT,
  DEFAULT_CHART_LINE_WILLIAMS_MID_CROSS_SIG_PADDING,
  DEFAULT_CHART_LINE_WILLIAMS_MID_CROSS_SIG_PANEL_GAP,
  DEFAULT_CHART_LINE_WILLIAMS_MID_CROSS_SIG_PERIOD,
  DEFAULT_CHART_LINE_WILLIAMS_MID_CROSS_SIG_SIGNAL_LENGTH,
  DEFAULT_CHART_LINE_WILLIAMS_MID_CROSS_SIG_WIDTH,
  applyLineWilliamsMidCrossSigSma,
  classifyLineWilliamsMidCrossSigBias,
  classifyLineWilliamsMidCrossSigRegime,
  computeLineWilliamsMidCrossSig,
  computeLineWilliamsMidCrossSigLayout,
  describeLineWilliamsMidCrossSigChart,
  detectLineWilliamsMidCrossSigCrosses,
  getLineWilliamsMidCrossSigFinitePoints,
  normalizeLineWilliamsMidCrossSigLength,
  runLineWilliamsMidCrossSig,
  type ChartLineWilliamsMidCrossSigPoint,
} from './chart-line-williams-mid-cross-sig';

const PERIOD = 14;
const SIGNAL = 3;
const WARMUP = PERIOD + SIGNAL - 2; // 15

const PCT_R_UP = -20 / 3; // ~ -6.67 LINEAR UP
const PCT_R_DOWN = -280 / 3; // ~ -93.33 LINEAR DOWN

const buildConstBand = (
  n: number,
  k: number,
): ChartLineWilliamsMidCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: k + 1,
    low: k - 1,
    close: k,
  }));

const buildLinearUp = (n: number): ChartLineWilliamsMidCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: i + 1,
    low: i - 1,
    close: i,
  }));

const buildLinearDown = (n: number): ChartLineWilliamsMidCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: -i + 1,
    low: -i - 1,
    close: -i,
  }));

describe('ChartLineWilliamsMidCrossSig defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_WILLIAMS_MID_CROSS_SIG_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_WILLIAMS_MID_CROSS_SIG_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_WILLIAMS_MID_CROSS_SIG_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_WILLIAMS_MID_CROSS_SIG_PANEL_GAP).toBe(12);
  });

  it('exports canonical Williams tuning', () => {
    expect(DEFAULT_CHART_LINE_WILLIAMS_MID_CROSS_SIG_PERIOD).toBe(14);
    expect(DEFAULT_CHART_LINE_WILLIAMS_MID_CROSS_SIG_SIGNAL_LENGTH).toBe(3);
  });
});

describe('getLineWilliamsMidCrossSigFinitePoints', () => {
  it('filters NaN/Infinity and high<low', () => {
    const points = [
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: NaN, high: 2, low: 1, close: 1.5 },
      { x: 1, high: 1, low: 2, close: 1.5 },
      { x: 2, high: Infinity, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ];
    expect(getLineWilliamsMidCrossSigFinitePoints(points)).toEqual([
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ]);
  });

  it('returns empty for null/non-array', () => {
    expect(getLineWilliamsMidCrossSigFinitePoints(null)).toEqual([]);
    expect(getLineWilliamsMidCrossSigFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineWilliamsMidCrossSigLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineWilliamsMidCrossSigLength(14.7, 14)).toBe(14);
    expect(normalizeLineWilliamsMidCrossSigLength(0, 14)).toBe(14);
    expect(normalizeLineWilliamsMidCrossSigLength(NaN, 14)).toBe(14);
  });
});

describe('applyLineWilliamsMidCrossSigSma', () => {
  it('SMA over linear input', () => {
    const out = applyLineWilliamsMidCrossSigSma([0, 1, 2, 3, 4, 5], 3);
    expect(out[2]).toBe(1);
    expect(out[5]).toBe(4);
  });
  it('passthrough at length 1', () => {
    expect(applyLineWilliamsMidCrossSigSma([1, 2, 3], 1)).toEqual([1, 2, 3]);
  });
});

describe('computeLineWilliamsMidCrossSig CONST band', () => {
  it('%R = -50 (centerline), signal = -50', () => {
    const data = buildConstBand(40, 50);
    const out = computeLineWilliamsMidCrossSig(data);
    for (let i = PERIOD - 1; i < 40; i += 1) {
      expect(out.pctR[i] as number).toBe(-50);
    }
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.signal[i] as number).toBe(-50);
    }
  });
});

describe('computeLineWilliamsMidCrossSig LINEAR UP', () => {
  it('%R = -20/3 (~-6.67, overbought zone), signal = same', () => {
    const data = buildLinearUp(40);
    const out = computeLineWilliamsMidCrossSig(data);
    for (let i = PERIOD - 1; i < 40; i += 1) {
      expect(out.pctR[i] as number).toBeCloseTo(PCT_R_UP, 9);
    }
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.signal[i] as number).toBeCloseTo(PCT_R_UP, 9);
    }
  });
});

describe('computeLineWilliamsMidCrossSig LINEAR DOWN', () => {
  it('%R = -280/3 (~-93.33, oversold zone), signal = same', () => {
    const data = buildLinearDown(40);
    const out = computeLineWilliamsMidCrossSig(data);
    for (let i = PERIOD - 1; i < 40; i += 1) {
      expect(out.pctR[i] as number).toBeCloseTo(PCT_R_DOWN, 9);
    }
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.signal[i] as number).toBeCloseTo(PCT_R_DOWN, 9);
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineWilliamsMidCrossSig([])).toEqual({
      pctR: [],
      signal: [],
    });
  });
});

describe('classifyLineWilliamsMidCrossSigRegime', () => {
  it('null -> none', () => {
    expect(classifyLineWilliamsMidCrossSigRegime(null, 5)).toBe('none');
  });
  it('%R > signal -> bullish', () => {
    expect(classifyLineWilliamsMidCrossSigRegime(-20, -40)).toBe('bullish');
  });
  it('%R === signal -> bullish (>=)', () => {
    expect(classifyLineWilliamsMidCrossSigRegime(-50, -50)).toBe('bullish');
  });
  it('%R < signal -> bearish', () => {
    expect(classifyLineWilliamsMidCrossSigRegime(-80, -50)).toBe('bearish');
  });
});

describe('classifyLineWilliamsMidCrossSigBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineWilliamsMidCrossSigBias(-20, -40)).toBe('up');
    expect(classifyLineWilliamsMidCrossSigBias(-60, -40)).toBe('down');
    expect(classifyLineWilliamsMidCrossSigBias(-50, -50)).toBe('flat');
    expect(classifyLineWilliamsMidCrossSigBias(null, -50)).toBe('none');
  });
});

describe('detectLineWilliamsMidCrossSigCrosses', () => {
  it('fires bullish on %R crossing up signal', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const pr: Array<number | null> = [-60, -55, -45, -40];
    const sig: Array<number | null> = [-50, -50, -50, -50];
    const out = detectLineWilliamsMidCrossSigCrosses(series, pr, sig);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
    expect(out[0]?.index).toBe(2);
  });

  it('fires bearish on %R crossing down signal', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const pr: Array<number | null> = [-40, -45, -55, -60];
    const sig: Array<number | null> = [-50, -50, -50, -50];
    const out = detectLineWilliamsMidCrossSigCrosses(series, pr, sig);
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
    const pr: Array<number | null> = [null, null, -45, -40];
    const sig: Array<number | null> = [null, null, -50, -50];
    const out = detectLineWilliamsMidCrossSigCrosses(series, pr, sig);
    expect(out).toHaveLength(0);
  });
});

describe('runLineWilliamsMidCrossSig CONST band', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST band ${K}: %R = signal = -50, regime bullish, 0 crosses`, () => {
      const data = buildConstBand(40, K);
      const run = runLineWilliamsMidCrossSig(data);
      expect(run.period).toBe(PERIOD);
      expect(run.signalLength).toBe(SIGNAL);
      for (let i = WARMUP; i < 40; i += 1) {
        expect(run.pctRValues[i] as number).toBe(-50);
        expect(run.signalValues[i] as number).toBe(-50);
      }
      expect(run.crosses).toHaveLength(0);
      expect(run.ok).toBe(true);
    });
  }
});

describe('runLineWilliamsMidCrossSig LINEAR UP', () => {
  it('%R = -20/3 constant (overbought), regime bullish (===), 0 crosses', () => {
    const data = buildLinearUp(40);
    const run = runLineWilliamsMidCrossSig(data);
    for (let i = WARMUP; i < 40; i += 1) {
      expect(run.pctRValues[i] as number).toBeCloseTo(PCT_R_UP, 9);
      expect(run.signalValues[i] as number).toBeCloseTo(PCT_R_UP, 9);
    }
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineWilliamsMidCrossSig LINEAR DOWN', () => {
  it('%R = -280/3 constant (oversold), regime bullish (===), 0 crosses', () => {
    const data = buildLinearDown(40);
    const run = runLineWilliamsMidCrossSig(data);
    for (let i = WARMUP; i < 40; i += 1) {
      expect(run.pctRValues[i] as number).toBeCloseTo(PCT_R_DOWN, 9);
      expect(run.signalValues[i] as number).toBeCloseTo(PCT_R_DOWN, 9);
    }
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineWilliamsMidCrossSig misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineWilliamsMidCrossSigPoint[] = [
      { x: 2, high: 1, low: 0, close: 0.5 },
      { x: 0, high: 1, low: 0, close: 0.5 },
      { x: 1, high: 1, low: 0, close: 0.5 },
    ];
    const run = runLineWilliamsMidCrossSig(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConstBand(15, 50);
    const run = runLineWilliamsMidCrossSig(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineWilliamsMidCrossSig([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom period and signalLength', () => {
    const data = buildLinearUp(40);
    const run = runLineWilliamsMidCrossSig(data, {
      period: 7,
      signalLength: 5,
    });
    expect(run.period).toBe(7);
    expect(run.signalLength).toBe(5);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(40);
    const run = runLineWilliamsMidCrossSig(data);
    expect(run.bullishCount + run.bearishCount + run.noneCount).toBe(40);
  });
});

describe('computeLineWilliamsMidCrossSigLayout', () => {
  it('renders SVG paths for LINEAR UP', () => {
    const data = buildLinearUp(40);
    const layout = computeLineWilliamsMidCrossSigLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(40);
    expect(layout.pctRPath).toContain('M ');
    expect(layout.signalPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('oscillator panel is hard-locked to [-100, 0]', () => {
    const layout = computeLineWilliamsMidCrossSigLayout({
      data: buildLinearUp(40),
    });
    expect(layout.oscMin).toBe(-100);
    expect(layout.oscMax).toBe(0);
  });

  it('centerline (-50) renders within view', () => {
    const layout = computeLineWilliamsMidCrossSigLayout({
      data: buildLinearUp(40),
    });
    expect(layout.centerlineY).toBeGreaterThanOrEqual(layout.oscTop);
    expect(layout.centerlineY).toBeLessThanOrEqual(layout.oscBottom);
  });

  it('falls back when no data', () => {
    const layout = computeLineWilliamsMidCrossSigLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.pctRPath).toBe('');
    expect(layout.signalPath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineWilliamsMidCrossSigLayout({
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
    const layout = computeLineWilliamsMidCrossSigLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });
});

describe('describeLineWilliamsMidCrossSigChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineWilliamsMidCrossSigChart([])).toBe('No data');
  });

  it('mentions bar count, period, signalLength, centerline momentum trigger', () => {
    const desc = describeLineWilliamsMidCrossSigChart(buildLinearUp(40));
    expect(desc).toContain('40 bars');
    expect(desc).toContain('period 14');
    expect(desc).toContain('signalLength 3');
    expect(desc).toContain('centerline momentum trigger');
    expect(desc).toContain('bias coloring');
  });
});

describe('<ChartLineWilliamsMidCrossSig /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(40);
    const { container } = render(<ChartLineWilliamsMidCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-williams-mid-cross-sig"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-period')).toBe(String(PERIOD));
    expect(root?.getAttribute('data-signal-length')).toBe(String(SIGNAL));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(<ChartLineWilliamsMidCrossSig data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-mid-cross-sig-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders %R + signal paths', () => {
    const data = buildLinearUp(40);
    const { container } = render(<ChartLineWilliamsMidCrossSig data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-mid-cross-sig-pct-r-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-mid-cross-sig-signal-path"]',
      ),
    ).not.toBeNull();
  });

  it('renders centerline by default', () => {
    const data = buildLinearUp(40);
    const { container } = render(<ChartLineWilliamsMidCrossSig data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-mid-cross-sig-centerline"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineWilliamsMidCrossSig data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-mid-cross-sig-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildLinearUp(40);
    const { container } = render(<ChartLineWilliamsMidCrossSig data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-williams-mid-cross-sig-badge"]',
    );
    expect(badge?.textContent).toContain('period 14');
    expect(badge?.textContent).toContain('signal 3');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(40);
    const { container } = render(<ChartLineWilliamsMidCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-williams-mid-cross-sig"]',
    );
    expect(root?.getAttribute('aria-label')).toBe(
      'Williams %R midline-over-Signal chart',
    );
  });

  it('exposes data-cross-count counter for LINEAR UP', () => {
    const data = buildLinearUp(40);
    const { container } = render(<ChartLineWilliamsMidCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-williams-mid-cross-sig"]',
    );
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineWilliamsMidCrossSig data={data} hiddenSeries={['signal']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-mid-cross-sig-signal-path"]',
      ),
    ).toBeNull();
  });
});
