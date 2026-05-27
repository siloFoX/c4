import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineSupertrendMidCrossSig,
  DEFAULT_CHART_LINE_SUPERTREND_MID_CROSS_SIG_HEIGHT,
  DEFAULT_CHART_LINE_SUPERTREND_MID_CROSS_SIG_MULTIPLIER,
  DEFAULT_CHART_LINE_SUPERTREND_MID_CROSS_SIG_PADDING,
  DEFAULT_CHART_LINE_SUPERTREND_MID_CROSS_SIG_PANEL_GAP,
  DEFAULT_CHART_LINE_SUPERTREND_MID_CROSS_SIG_PERIOD,
  DEFAULT_CHART_LINE_SUPERTREND_MID_CROSS_SIG_SIGNAL_LENGTH,
  DEFAULT_CHART_LINE_SUPERTREND_MID_CROSS_SIG_WIDTH,
  applyLineSupertrendMidCrossSigSma,
  classifyLineSupertrendMidCrossSigBias,
  classifyLineSupertrendMidCrossSigRegime,
  computeLineSupertrendMidCrossSig,
  computeLineSupertrendMidCrossSigLayout,
  describeLineSupertrendMidCrossSigChart,
  detectLineSupertrendMidCrossSigCrosses,
  getLineSupertrendMidCrossSigFinitePoints,
  normalizeLineSupertrendMidCrossSigLength,
  normalizeLineSupertrendMidCrossSigMultiplier,
  runLineSupertrendMidCrossSig,
  type ChartLineSupertrendMidCrossSigPoint,
} from './chart-line-supertrend-mid-cross-sig';

const PERIOD = 10;
const MULT = 3;
const SIGNAL = 3;
const WARMUP = PERIOD + SIGNAL - 1; // 12

const buildConstBand = (
  n: number,
  k: number,
): ChartLineSupertrendMidCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: k + 1,
    low: k - 1,
    close: k,
  }));

const buildLinearUp = (n: number): ChartLineSupertrendMidCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: i + 1,
    low: i - 1,
    close: i,
  }));

const buildLinearDown = (n: number): ChartLineSupertrendMidCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: -i + 1,
    low: -i - 1,
    close: -i,
  }));

describe('ChartLineSupertrendMidCrossSig defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_SUPERTREND_MID_CROSS_SIG_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_SUPERTREND_MID_CROSS_SIG_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_SUPERTREND_MID_CROSS_SIG_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_SUPERTREND_MID_CROSS_SIG_PANEL_GAP).toBe(12);
  });

  it('exports canonical Supertrend tuning', () => {
    expect(DEFAULT_CHART_LINE_SUPERTREND_MID_CROSS_SIG_PERIOD).toBe(10);
    expect(DEFAULT_CHART_LINE_SUPERTREND_MID_CROSS_SIG_MULTIPLIER).toBe(3);
    expect(DEFAULT_CHART_LINE_SUPERTREND_MID_CROSS_SIG_SIGNAL_LENGTH).toBe(3);
  });
});

describe('getLineSupertrendMidCrossSigFinitePoints', () => {
  it('filters NaN/Infinity and high<low', () => {
    const points = [
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: NaN, high: 2, low: 1, close: 1.5 },
      { x: 1, high: 1, low: 2, close: 1.5 },
      { x: 2, high: Infinity, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ];
    expect(getLineSupertrendMidCrossSigFinitePoints(points)).toEqual([
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ]);
  });

  it('returns empty for null and non-array', () => {
    expect(getLineSupertrendMidCrossSigFinitePoints(null)).toEqual([]);
    expect(getLineSupertrendMidCrossSigFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizers', () => {
  it('floors finite >=1 length values', () => {
    expect(normalizeLineSupertrendMidCrossSigLength(10.7, 10)).toBe(10);
    expect(normalizeLineSupertrendMidCrossSigLength(0, 10)).toBe(10);
  });
  it('rejects non-positive multiplier', () => {
    expect(normalizeLineSupertrendMidCrossSigMultiplier(3.5, 3)).toBe(3.5);
    expect(normalizeLineSupertrendMidCrossSigMultiplier(0, 3)).toBe(3);
    expect(normalizeLineSupertrendMidCrossSigMultiplier(-1, 3)).toBe(3);
  });
});

describe('applyLineSupertrendMidCrossSigSma', () => {
  it('SMA over linear input', () => {
    const out = applyLineSupertrendMidCrossSigSma([0, 1, 2, 3, 4, 5], 3);
    expect(out[2]).toBe(1);
    expect(out[5]).toBe(4);
  });
  it('passthrough at length 1', () => {
    expect(applyLineSupertrendMidCrossSigSma([1, 2, 3], 1)).toEqual([
      1, 2, 3,
    ]);
  });
});

describe('computeLineSupertrendMidCrossSig CONST band', () => {
  it('supertrend = K - 6, signal = K - 6 (init uptrend)', () => {
    const data = buildConstBand(40, 50);
    const out = computeLineSupertrendMidCrossSig(data);
    for (let i = PERIOD; i < 40; i += 1) {
      expect(out.supertrend[i] as number).toBe(50 - 6);
    }
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.signal[i] as number).toBe(50 - 6);
    }
  });
});

describe('computeLineSupertrendMidCrossSig LINEAR UP', () => {
  it('supertrend = i - 6, signal = i - 7 (1-bar SMA lag)', () => {
    const data = buildLinearUp(40);
    const out = computeLineSupertrendMidCrossSig(data);
    for (let i = PERIOD; i < 40; i += 1) {
      expect(out.supertrend[i] as number).toBeCloseTo(i - 6, 9);
    }
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.signal[i] as number).toBeCloseTo(i - 7, 9);
    }
  });
});

describe('computeLineSupertrendMidCrossSig LINEAR DOWN', () => {
  it('supertrend = -i + 6, signal = -i + 7 (mirror)', () => {
    const data = buildLinearDown(40);
    const out = computeLineSupertrendMidCrossSig(data);
    for (let i = PERIOD; i < 40; i += 1) {
      expect(out.supertrend[i] as number).toBeCloseTo(-i + 6, 9);
    }
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.signal[i] as number).toBeCloseTo(-i + 7, 9);
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineSupertrendMidCrossSig([])).toEqual({
      atr: [],
      supertrend: [],
      trend: [],
      signal: [],
    });
  });
});

describe('classifyLineSupertrendMidCrossSigRegime', () => {
  it('null -> none', () => {
    expect(classifyLineSupertrendMidCrossSigRegime(null, 5)).toBe('none');
  });
  it('supertrend > signal -> bullish', () => {
    expect(classifyLineSupertrendMidCrossSigRegime(10, 5)).toBe('bullish');
  });
  it('supertrend === signal -> bullish (>=)', () => {
    expect(classifyLineSupertrendMidCrossSigRegime(5, 5)).toBe('bullish');
  });
  it('supertrend < signal -> bearish', () => {
    expect(classifyLineSupertrendMidCrossSigRegime(5, 10)).toBe('bearish');
  });
});

describe('classifyLineSupertrendMidCrossSigBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineSupertrendMidCrossSigBias(60, 50)).toBe('up');
    expect(classifyLineSupertrendMidCrossSigBias(40, 50)).toBe('down');
    expect(classifyLineSupertrendMidCrossSigBias(50, 50)).toBe('flat');
    expect(classifyLineSupertrendMidCrossSigBias(null, 50)).toBe('none');
  });
});

describe('detectLineSupertrendMidCrossSigCrosses', () => {
  it('fires bullish on supertrend crossing up signal', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const st: Array<number | null> = [-5, -3, 2, 5];
    const sig: Array<number | null> = [0, 0, 0, 0];
    const out = detectLineSupertrendMidCrossSigCrosses(series, st, sig);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
    expect(out[0]?.index).toBe(2);
  });

  it('fires bearish on supertrend crossing down signal', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const st: Array<number | null> = [5, 3, -2, -5];
    const sig: Array<number | null> = [0, 0, 0, 0];
    const out = detectLineSupertrendMidCrossSigCrosses(series, st, sig);
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
    const st: Array<number | null> = [null, null, 2, 5];
    const sig: Array<number | null> = [null, null, 0, 0];
    const out = detectLineSupertrendMidCrossSigCrosses(series, st, sig);
    expect(out).toHaveLength(0);
  });
});

describe('runLineSupertrendMidCrossSig CONST band', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST band ${K}: supertrend=signal=K-6, regime bullish, 0 crosses`, () => {
      const data = buildConstBand(40, K);
      const run = runLineSupertrendMidCrossSig(data);
      expect(run.period).toBe(PERIOD);
      expect(run.multiplier).toBe(MULT);
      expect(run.signalLength).toBe(SIGNAL);
      for (let i = WARMUP; i < 40; i += 1) {
        expect(run.supertrendValues[i] as number).toBe(K - 6);
        expect(run.signalValues[i] as number).toBe(K - 6);
      }
      expect(run.crosses).toHaveLength(0);
      expect(run.ok).toBe(true);
    });
  }
});

describe('runLineSupertrendMidCrossSig LINEAR UP', () => {
  it('supertrend above signal by 1, regime bullish, 0 crosses', () => {
    const data = buildLinearUp(40);
    const run = runLineSupertrendMidCrossSig(data);
    for (let i = WARMUP; i < 40; i += 1) {
      const st = run.supertrendValues[i] as number;
      const sig = run.signalValues[i] as number;
      expect(st - sig).toBeCloseTo(1, 9);
    }
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineSupertrendMidCrossSig LINEAR DOWN', () => {
  it('supertrend below signal by 1, regime bearish, 0 crosses', () => {
    const data = buildLinearDown(40);
    const run = runLineSupertrendMidCrossSig(data);
    for (let i = WARMUP; i < 40; i += 1) {
      const st = run.supertrendValues[i] as number;
      const sig = run.signalValues[i] as number;
      expect(st - sig).toBeCloseTo(-1, 9);
    }
    expect(run.bearishCount).toBeGreaterThan(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineSupertrendMidCrossSig misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineSupertrendMidCrossSigPoint[] = [
      { x: 2, high: 1, low: 0, close: 0.5 },
      { x: 0, high: 1, low: 0, close: 0.5 },
      { x: 1, high: 1, low: 0, close: 0.5 },
    ];
    const run = runLineSupertrendMidCrossSig(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConstBand(12, 50);
    const run = runLineSupertrendMidCrossSig(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineSupertrendMidCrossSig([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom tuning', () => {
    const data = buildLinearUp(40);
    const run = runLineSupertrendMidCrossSig(data, {
      period: 7,
      multiplier: 2,
      signalLength: 5,
    });
    expect(run.period).toBe(7);
    expect(run.multiplier).toBe(2);
    expect(run.signalLength).toBe(5);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(40);
    const run = runLineSupertrendMidCrossSig(data);
    expect(run.bullishCount + run.bearishCount + run.noneCount).toBe(40);
  });

  it('trend values record uptrend on LINEAR UP', () => {
    const data = buildLinearUp(40);
    const run = runLineSupertrendMidCrossSig(data);
    for (let i = PERIOD; i < 40; i += 1) {
      expect(run.trendValues[i]).toBe(1);
    }
  });

  it('trend values record downtrend on LINEAR DOWN', () => {
    const data = buildLinearDown(40);
    const run = runLineSupertrendMidCrossSig(data);
    for (let i = PERIOD; i < 40; i += 1) {
      expect(run.trendValues[i]).toBe(-1);
    }
  });
});

describe('computeLineSupertrendMidCrossSigLayout', () => {
  it('renders SVG paths for LINEAR UP', () => {
    const data = buildLinearUp(40);
    const layout = computeLineSupertrendMidCrossSigLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(40);
    expect(layout.supertrendPath).toContain('M ');
    expect(layout.signalPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineSupertrendMidCrossSigLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.supertrendPath).toBe('');
    expect(layout.signalPath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineSupertrendMidCrossSigLayout({
      data: buildLinearUp(40),
      width: 600,
      height: 320,
      padding: 32,
      panelGap: 8,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(320);
  });
});

describe('describeLineSupertrendMidCrossSigChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineSupertrendMidCrossSigChart([])).toBe('No data');
  });

  it('mentions bar count, period, multiplier, trend stop centerline', () => {
    const desc = describeLineSupertrendMidCrossSigChart(buildLinearUp(40));
    expect(desc).toContain('40 bars');
    expect(desc).toContain('period 10');
    expect(desc).toContain('multiplier 3');
    expect(desc).toContain('signalLength 3');
    expect(desc).toContain('trend stop centerline');
    expect(desc).toContain('bias coloring');
  });
});

describe('<ChartLineSupertrendMidCrossSig /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineSupertrendMidCrossSig data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-supertrend-mid-cross-sig"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-period')).toBe(String(PERIOD));
    expect(root?.getAttribute('data-multiplier')).toBe(String(MULT));
    expect(root?.getAttribute('data-signal-length')).toBe(String(SIGNAL));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(
      <ChartLineSupertrendMidCrossSig data={[]} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-supertrend-mid-cross-sig-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders supertrend + signal paths', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineSupertrendMidCrossSig data={data} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-supertrend-mid-cross-sig-supertrend-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-supertrend-mid-cross-sig-signal-path"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineSupertrendMidCrossSig data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-supertrend-mid-cross-sig-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineSupertrendMidCrossSig data={data} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-supertrend-mid-cross-sig-badge"]',
    );
    expect(badge?.textContent).toContain('period 10');
    expect(badge?.textContent).toContain('mult 3');
    expect(badge?.textContent).toContain('signal 3');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineSupertrendMidCrossSig data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-supertrend-mid-cross-sig"]',
    );
    expect(root?.getAttribute('aria-label')).toBe(
      'Supertrend-over-Signal chart',
    );
  });

  it('exposes data-cross-count for LINEAR UP', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineSupertrendMidCrossSig data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-supertrend-mid-cross-sig"]',
    );
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineSupertrendMidCrossSig
        data={data}
        hiddenSeries={['signal']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-supertrend-mid-cross-sig-signal-path"]',
      ),
    ).toBeNull();
  });
});
