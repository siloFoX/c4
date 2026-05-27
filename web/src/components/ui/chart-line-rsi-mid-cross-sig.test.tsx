import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineRsiMidCrossSig,
  DEFAULT_CHART_LINE_RSI_MID_CROSS_SIG_HEIGHT,
  DEFAULT_CHART_LINE_RSI_MID_CROSS_SIG_PADDING,
  DEFAULT_CHART_LINE_RSI_MID_CROSS_SIG_PANEL_GAP,
  DEFAULT_CHART_LINE_RSI_MID_CROSS_SIG_PERIOD,
  DEFAULT_CHART_LINE_RSI_MID_CROSS_SIG_SIGNAL_LENGTH,
  DEFAULT_CHART_LINE_RSI_MID_CROSS_SIG_WIDTH,
  applyLineRsiMidCrossSigSma,
  classifyLineRsiMidCrossSigBias,
  classifyLineRsiMidCrossSigRegime,
  computeLineRsiMidCrossSig,
  computeLineRsiMidCrossSigLayout,
  describeLineRsiMidCrossSigChart,
  detectLineRsiMidCrossSigCrosses,
  getLineRsiMidCrossSigFinitePoints,
  normalizeLineRsiMidCrossSigLength,
  runLineRsiMidCrossSig,
  type ChartLineRsiMidCrossSigPoint,
} from './chart-line-rsi-mid-cross-sig';

const PERIOD = 14;
const SIGNAL = 3;
const WARMUP = PERIOD + SIGNAL - 1; // 16

const buildConst = (n: number, k: number): ChartLineRsiMidCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: k }));

const buildLinearUp = (n: number): ChartLineRsiMidCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: i }));

const buildLinearDown = (n: number): ChartLineRsiMidCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: -i }));

describe('ChartLineRsiMidCrossSig defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_RSI_MID_CROSS_SIG_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_RSI_MID_CROSS_SIG_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_RSI_MID_CROSS_SIG_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_RSI_MID_CROSS_SIG_PANEL_GAP).toBe(12);
  });

  it('exports canonical RSI tuning', () => {
    expect(DEFAULT_CHART_LINE_RSI_MID_CROSS_SIG_PERIOD).toBe(14);
    expect(DEFAULT_CHART_LINE_RSI_MID_CROSS_SIG_SIGNAL_LENGTH).toBe(3);
  });
});

describe('getLineRsiMidCrossSigFinitePoints', () => {
  it('filters NaN/Infinity', () => {
    const points = [
      { x: 0, close: 1 },
      { x: NaN, close: 1 },
      { x: 1, close: Infinity },
      { x: 2, close: 2 },
    ];
    expect(getLineRsiMidCrossSigFinitePoints(points)).toEqual([
      { x: 0, close: 1 },
      { x: 2, close: 2 },
    ]);
  });

  it('returns empty for null/non-array', () => {
    expect(getLineRsiMidCrossSigFinitePoints(null)).toEqual([]);
    expect(getLineRsiMidCrossSigFinitePoints(undefined)).toEqual([]);
    expect(
      getLineRsiMidCrossSigFinitePoints(
        // @ts-expect-error -- intentionally bad
        'oops',
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineRsiMidCrossSigLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineRsiMidCrossSigLength(14.7, 14)).toBe(14);
    expect(normalizeLineRsiMidCrossSigLength(0, 14)).toBe(14);
    expect(normalizeLineRsiMidCrossSigLength(NaN, 14)).toBe(14);
  });
});

describe('applyLineRsiMidCrossSigSma', () => {
  it('SMA over linear input', () => {
    const out = applyLineRsiMidCrossSigSma([0, 1, 2, 3, 4, 5], 3);
    expect(out[2]).toBe(1);
    expect(out[3]).toBe(2);
    expect(out[5]).toBe(4);
  });
  it('passthrough at length 1', () => {
    expect(applyLineRsiMidCrossSigSma([1, 2, 3], 1)).toEqual([1, 2, 3]);
  });
  it('drops null-window outputs', () => {
    const out = applyLineRsiMidCrossSigSma([1, null, 3, 4, 5], 3);
    expect(out[3]).toBeNull();
    expect(out[4]).toBe(4);
  });
});

describe('computeLineRsiMidCrossSig CONST', () => {
  it('RSI = 50 (neutral fallback), signal = 50', () => {
    const data = buildConst(40, 50);
    const out = computeLineRsiMidCrossSig(data);
    for (let i = PERIOD; i < 40; i += 1) {
      expect(out.rsi[i] as number).toBe(50);
    }
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.signal[i] as number).toBe(50);
    }
  });
});

describe('computeLineRsiMidCrossSig LINEAR UP', () => {
  it('RSI = 100, signal = 100', () => {
    const data = buildLinearUp(40);
    const out = computeLineRsiMidCrossSig(data);
    for (let i = PERIOD; i < 40; i += 1) {
      expect(out.rsi[i] as number).toBe(100);
    }
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.signal[i] as number).toBe(100);
    }
  });
});

describe('computeLineRsiMidCrossSig LINEAR DOWN', () => {
  it('RSI = 0, signal = 0', () => {
    const data = buildLinearDown(40);
    const out = computeLineRsiMidCrossSig(data);
    for (let i = PERIOD; i < 40; i += 1) {
      expect(out.rsi[i] as number).toBe(0);
    }
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.signal[i] as number).toBe(0);
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineRsiMidCrossSig([])).toEqual({ rsi: [], signal: [] });
  });

  it('returns null arrays when n < period+1', () => {
    const out = computeLineRsiMidCrossSig(buildConst(5, 50));
    expect(out.rsi.every((v) => v === null)).toBe(true);
  });
});

describe('classifyLineRsiMidCrossSigRegime', () => {
  it('null -> none', () => {
    expect(classifyLineRsiMidCrossSigRegime(null, 5)).toBe('none');
    expect(classifyLineRsiMidCrossSigRegime(5, null)).toBe('none');
  });
  it('RSI > signal -> bullish', () => {
    expect(classifyLineRsiMidCrossSigRegime(60, 50)).toBe('bullish');
  });
  it('RSI === signal -> bullish (>=)', () => {
    expect(classifyLineRsiMidCrossSigRegime(50, 50)).toBe('bullish');
  });
  it('RSI < signal -> bearish', () => {
    expect(classifyLineRsiMidCrossSigRegime(40, 50)).toBe('bearish');
  });
});

describe('classifyLineRsiMidCrossSigBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineRsiMidCrossSigBias(60, 50)).toBe('up');
    expect(classifyLineRsiMidCrossSigBias(40, 50)).toBe('down');
    expect(classifyLineRsiMidCrossSigBias(50, 50)).toBe('flat');
    expect(classifyLineRsiMidCrossSigBias(null, 50)).toBe('none');
  });
});

describe('detectLineRsiMidCrossSigCrosses', () => {
  it('fires bullish on RSI crossing up signal', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({ x: i, close: 1 }));
    const rsi: Array<number | null> = [45, 48, 52, 55];
    const sig: Array<number | null> = [50, 50, 50, 50];
    const out = detectLineRsiMidCrossSigCrosses(series, rsi, sig);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
    expect(out[0]?.index).toBe(2);
  });

  it('fires bearish on RSI crossing down signal', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({ x: i, close: 1 }));
    const rsi: Array<number | null> = [55, 52, 48, 45];
    const sig: Array<number | null> = [50, 50, 50, 50];
    const out = detectLineRsiMidCrossSigCrosses(series, rsi, sig);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
  });

  it('skips null-window bars', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({ x: i, close: 1 }));
    const rsi: Array<number | null> = [null, null, 52, 55];
    const sig: Array<number | null> = [null, null, 50, 50];
    const out = detectLineRsiMidCrossSigCrosses(series, rsi, sig);
    expect(out).toHaveLength(0);
  });
});

describe('runLineRsiMidCrossSig CONST', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST ${K}: RSI=50, signal=50, regime bullish, 0 triggers`, () => {
      const data = buildConst(60, K);
      const run = runLineRsiMidCrossSig(data);
      expect(run.period).toBe(PERIOD);
      expect(run.signalLength).toBe(SIGNAL);
      for (let i = WARMUP; i < 60; i += 1) {
        expect(run.rsiValues[i] as number).toBe(50);
        expect(run.signalValues[i] as number).toBe(50);
      }
      expect(run.crosses).toHaveLength(0);
      expect(run.ok).toBe(true);
    });
  }
});

describe('runLineRsiMidCrossSig LINEAR UP', () => {
  it('RSI = 100, signal = 100, regime bullish, 0 triggers', () => {
    const data = buildLinearUp(60);
    const run = runLineRsiMidCrossSig(data);
    for (let i = WARMUP; i < 60; i += 1) {
      expect(run.rsiValues[i] as number).toBe(100);
      expect(run.signalValues[i] as number).toBe(100);
    }
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineRsiMidCrossSig LINEAR DOWN', () => {
  it('RSI = 0, signal = 0, regime bullish (===), 0 triggers', () => {
    const data = buildLinearDown(60);
    const run = runLineRsiMidCrossSig(data);
    for (let i = WARMUP; i < 60; i += 1) {
      expect(run.rsiValues[i] as number).toBe(0);
      expect(run.signalValues[i] as number).toBe(0);
    }
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineRsiMidCrossSig misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineRsiMidCrossSigPoint[] = [
      { x: 2, close: 5 },
      { x: 0, close: 5 },
      { x: 1, close: 5 },
    ];
    const run = runLineRsiMidCrossSig(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConst(16, 50);
    const run = runLineRsiMidCrossSig(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineRsiMidCrossSig([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom period and signalLength', () => {
    const data = buildLinearUp(60);
    const run = runLineRsiMidCrossSig(data, { period: 7, signalLength: 5 });
    expect(run.period).toBe(7);
    expect(run.signalLength).toBe(5);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(60);
    const run = runLineRsiMidCrossSig(data);
    expect(run.bullishCount + run.bearishCount + run.noneCount).toBe(60);
  });

  it('produces both bullish and bearish on alternating noise', () => {
    const data: ChartLineRsiMidCrossSigPoint[] = [];
    for (let i = 0; i < 80; i += 1) {
      data.push({ x: i, close: 100 + (i % 2 === 0 ? 0 : 10) });
    }
    const run = runLineRsiMidCrossSig(data);
    expect(run.crosses.length).toBeGreaterThan(0);
  });
});

describe('computeLineRsiMidCrossSigLayout', () => {
  it('renders SVG paths for LINEAR UP', () => {
    const data = buildLinearUp(60);
    const layout = computeLineRsiMidCrossSigLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(60);
    expect(layout.rsiPath).toContain('M ');
    expect(layout.signalPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('oscillator panel is hard-locked to [0, 100]', () => {
    const layout = computeLineRsiMidCrossSigLayout({
      data: buildLinearUp(60),
    });
    expect(layout.oscMin).toBe(0);
    expect(layout.oscMax).toBe(100);
  });

  it('centerline (50) renders within view', () => {
    const layout = computeLineRsiMidCrossSigLayout({
      data: buildLinearUp(60),
    });
    expect(layout.centerlineY).toBeGreaterThanOrEqual(layout.oscTop);
    expect(layout.centerlineY).toBeLessThanOrEqual(layout.oscBottom);
  });

  it('falls back when no data', () => {
    const layout = computeLineRsiMidCrossSigLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.rsiPath).toBe('');
    expect(layout.signalPath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineRsiMidCrossSigLayout({
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
    const data = buildConst(60, 100);
    const layout = computeLineRsiMidCrossSigLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });
});

describe('describeLineRsiMidCrossSigChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineRsiMidCrossSigChart([])).toBe('No data');
  });

  it('mentions bar count, period, signalLength, momentum centerline trend trigger', () => {
    const desc = describeLineRsiMidCrossSigChart(buildLinearUp(60));
    expect(desc).toContain('60 bars');
    expect(desc).toContain('period 14');
    expect(desc).toContain('signalLength 3');
    expect(desc).toContain('momentum centerline trend trigger');
    expect(desc).toContain('bias coloring');
  });
});

describe('<ChartLineRsiMidCrossSig /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineRsiMidCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-rsi-mid-cross-sig"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-period')).toBe(String(PERIOD));
    expect(root?.getAttribute('data-signal-length')).toBe(String(SIGNAL));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(<ChartLineRsiMidCrossSig data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-rsi-mid-cross-sig-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders RSI + signal paths', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineRsiMidCrossSig data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-rsi-mid-cross-sig-rsi-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-rsi-mid-cross-sig-signal-path"]',
      ),
    ).not.toBeNull();
  });

  it('renders centerline by default', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineRsiMidCrossSig data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-rsi-mid-cross-sig-centerline"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineRsiMidCrossSig data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-rsi-mid-cross-sig-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineRsiMidCrossSig data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-rsi-mid-cross-sig-badge"]',
    );
    expect(badge?.textContent).toContain('period 14');
    expect(badge?.textContent).toContain('signal 3');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineRsiMidCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-rsi-mid-cross-sig"]',
    );
    expect(root?.getAttribute('aria-label')).toBe(
      'RSI midline-over-Signal chart',
    );
  });

  it('exposes data-*-count counters for LINEAR UP', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineRsiMidCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-rsi-mid-cross-sig"]',
    );
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineRsiMidCrossSig data={data} hiddenSeries={['signal']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-rsi-mid-cross-sig-signal-path"]',
      ),
    ).toBeNull();
  });
});
