import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineTrixMidCrossSig,
  DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_HEIGHT,
  DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_PADDING,
  DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_PANEL_GAP,
  DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_PERIOD,
  DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_SIGNAL_LENGTH,
  DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_WIDTH,
  applyLineTrixMidCrossSigEma,
  applyLineTrixMidCrossSigSma,
  classifyLineTrixMidCrossSigBias,
  classifyLineTrixMidCrossSigRegime,
  computeLineTrixMidCrossSig,
  computeLineTrixMidCrossSigLayout,
  describeLineTrixMidCrossSigChart,
  detectLineTrixMidCrossSigCrosses,
  getLineTrixMidCrossSigFinitePoints,
  normalizeLineTrixMidCrossSigLength,
  runLineTrixMidCrossSig,
  type ChartLineTrixMidCrossSigPoint,
} from './chart-line-trix-mid-cross-sig';

const PERIOD = 15;
const SIGNAL = 3;
const WARMUP = 3 * (PERIOD - 1) + SIGNAL; // 45

const buildConst = (n: number, k: number): ChartLineTrixMidCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: k }));

const buildLinearUp = (n: number): ChartLineTrixMidCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: i }));

const buildLinearDown = (n: number): ChartLineTrixMidCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: -i }));

describe('ChartLineTrixMidCrossSig defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_PANEL_GAP).toBe(12);
  });

  it('exports canonical TRIX tuning', () => {
    expect(DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_PERIOD).toBe(15);
    expect(DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_SIGNAL_LENGTH).toBe(3);
  });
});

describe('getLineTrixMidCrossSigFinitePoints', () => {
  it('filters NaN/Infinity', () => {
    const points = [
      { x: 0, close: 1 },
      { x: NaN, close: 1 },
      { x: 1, close: Infinity },
      { x: 2, close: 2 },
    ];
    expect(getLineTrixMidCrossSigFinitePoints(points)).toEqual([
      { x: 0, close: 1 },
      { x: 2, close: 2 },
    ]);
  });

  it('returns empty for null/non-array', () => {
    expect(getLineTrixMidCrossSigFinitePoints(null)).toEqual([]);
    expect(getLineTrixMidCrossSigFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineTrixMidCrossSigLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineTrixMidCrossSigLength(15.7, 15)).toBe(15);
    expect(normalizeLineTrixMidCrossSigLength(0, 15)).toBe(15);
    expect(normalizeLineTrixMidCrossSigLength(NaN, 15)).toBe(15);
  });
});

describe('applyLineTrixMidCrossSigEma', () => {
  it('SMA seed at i = length - 1 on linear input', () => {
    const values: Array<number | null> = Array.from(
      { length: 30 },
      (_, i) => i,
    );
    const out = applyLineTrixMidCrossSigEma(values, 15);
    // SMA(0..14, 15) = 7 = 14 - 7
    expect(out[14]).toBe(7);
    // EMA on linear with SMA seed: ema[i] = i - 7
    for (let i = 15; i < 30; i += 1) {
      expect(out[i] as number).toBeCloseTo(i - 7, 9);
    }
  });

  it('passthrough at length 1', () => {
    expect(applyLineTrixMidCrossSigEma([1, 2, 3], 1)).toEqual([1, 2, 3]);
  });

  it('returns nulls when shorter than period', () => {
    const out = applyLineTrixMidCrossSigEma([1, 2, 3], 5);
    expect(out.every((v) => v === null)).toBe(true);
  });

  it('null in input breaks recurrence', () => {
    const out = applyLineTrixMidCrossSigEma(
      [1, 2, 3, null, 5, 6],
      3,
    );
    expect(out[2]).toBe(2);
    // Index 3 has null input -> recurrence stops, out[3..] stays null.
    expect(out[3]).toBeNull();
    expect(out[5]).toBeNull();
  });
});

describe('applyLineTrixMidCrossSigSma', () => {
  it('SMA over linear input', () => {
    const out = applyLineTrixMidCrossSigSma([0, 1, 2, 3, 4, 5], 3);
    expect(out[2]).toBe(1);
    expect(out[5]).toBe(4);
  });
  it('passthrough at length 1', () => {
    expect(applyLineTrixMidCrossSigSma([1, 2, 3], 1)).toEqual([1, 2, 3]);
  });
});

describe('computeLineTrixMidCrossSig CONST', () => {
  it('EMA1 = EMA2 = EMA3 = K, TRIX = 0, signal = 0', () => {
    const data = buildConst(100, 50);
    const out = computeLineTrixMidCrossSig(data);
    for (let i = 3 * (PERIOD - 1); i < 100; i += 1) {
      expect(out.ema1[i] as number).toBe(50);
      expect(out.ema2[i] as number).toBe(50);
      expect(out.ema3[i] as number).toBe(50);
    }
    for (let i = 3 * (PERIOD - 1) + 1; i < 100; i += 1) {
      expect(out.trix[i] as number).toBe(0);
    }
    for (let i = WARMUP; i < 100; i += 1) {
      expect(out.signal[i] as number).toBe(0);
    }
  });
});

describe('computeLineTrixMidCrossSig LINEAR UP', () => {
  it('EMA1 = i - 7, EMA2 = i - 14, EMA3 = i - 21, TRIX = +1, signal = +1', () => {
    const data = buildLinearUp(100);
    const out = computeLineTrixMidCrossSig(data);
    for (let i = PERIOD - 1; i < 100; i += 1) {
      expect(out.ema1[i] as number).toBeCloseTo(i - 7, 9);
    }
    for (let i = 2 * (PERIOD - 1); i < 100; i += 1) {
      expect(out.ema2[i] as number).toBeCloseTo(i - 14, 9);
    }
    for (let i = 3 * (PERIOD - 1); i < 100; i += 1) {
      expect(out.ema3[i] as number).toBeCloseTo(i - 21, 9);
    }
    for (let i = 3 * (PERIOD - 1) + 1; i < 100; i += 1) {
      expect(out.trix[i] as number).toBeCloseTo(1, 9);
    }
    for (let i = WARMUP; i < 100; i += 1) {
      expect(out.signal[i] as number).toBeCloseTo(1, 9);
    }
  });
});

describe('computeLineTrixMidCrossSig LINEAR DOWN', () => {
  it('EMA3 = -i + 21, TRIX = -1, signal = -1 (mirror)', () => {
    const data = buildLinearDown(100);
    const out = computeLineTrixMidCrossSig(data);
    for (let i = 3 * (PERIOD - 1); i < 100; i += 1) {
      expect(out.ema3[i] as number).toBeCloseTo(-i + 21, 9);
    }
    for (let i = 3 * (PERIOD - 1) + 1; i < 100; i += 1) {
      expect(out.trix[i] as number).toBeCloseTo(-1, 9);
    }
    for (let i = WARMUP; i < 100; i += 1) {
      expect(out.signal[i] as number).toBeCloseTo(-1, 9);
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineTrixMidCrossSig([])).toEqual({
      ema1: [],
      ema2: [],
      ema3: [],
      trix: [],
      signal: [],
    });
  });
});

describe('classifyLineTrixMidCrossSigRegime', () => {
  it('null -> none', () => {
    expect(classifyLineTrixMidCrossSigRegime(null, 5)).toBe('none');
  });
  it('TRIX > signal -> bullish', () => {
    expect(classifyLineTrixMidCrossSigRegime(2, 0)).toBe('bullish');
  });
  it('TRIX === signal -> bullish (>=)', () => {
    expect(classifyLineTrixMidCrossSigRegime(0, 0)).toBe('bullish');
  });
  it('TRIX < signal -> bearish', () => {
    expect(classifyLineTrixMidCrossSigRegime(-2, 0)).toBe('bearish');
  });
});

describe('classifyLineTrixMidCrossSigBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineTrixMidCrossSigBias(2, 1)).toBe('up');
    expect(classifyLineTrixMidCrossSigBias(0, 1)).toBe('down');
    expect(classifyLineTrixMidCrossSigBias(1, 1)).toBe('flat');
    expect(classifyLineTrixMidCrossSigBias(null, 1)).toBe('none');
  });
});

describe('detectLineTrixMidCrossSigCrosses', () => {
  it('fires bullish on TRIX crossing up signal', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({ x: i, close: 1 }));
    const trix: Array<number | null> = [-2, -1, 1, 2];
    const sig: Array<number | null> = [0, 0, 0, 0];
    const out = detectLineTrixMidCrossSigCrosses(series, trix, sig);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
    expect(out[0]?.index).toBe(2);
  });

  it('fires bearish on TRIX crossing down signal', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({ x: i, close: 1 }));
    const trix: Array<number | null> = [2, 1, -1, -2];
    const sig: Array<number | null> = [0, 0, 0, 0];
    const out = detectLineTrixMidCrossSigCrosses(series, trix, sig);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
  });

  it('skips null-window bars', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({ x: i, close: 1 }));
    const trix: Array<number | null> = [null, null, 1, 2];
    const sig: Array<number | null> = [null, null, 0, 0];
    const out = detectLineTrixMidCrossSigCrosses(series, trix, sig);
    expect(out).toHaveLength(0);
  });
});

describe('runLineTrixMidCrossSig CONST', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST ${K}: TRIX = signal = 0, regime bullish (===), 0 crosses`, () => {
      const data = buildConst(100, K);
      const run = runLineTrixMidCrossSig(data);
      expect(run.period).toBe(PERIOD);
      expect(run.signalLength).toBe(SIGNAL);
      for (let i = WARMUP; i < 100; i += 1) {
        expect(run.trixValues[i] as number).toBe(0);
        expect(run.signalValues[i] as number).toBe(0);
      }
      expect(run.crosses).toHaveLength(0);
      expect(run.ok).toBe(true);
    });
  }
});

describe('runLineTrixMidCrossSig LINEAR UP', () => {
  it('TRIX = signal = +1, regime bullish (===), 0 crosses', () => {
    const data = buildLinearUp(100);
    const run = runLineTrixMidCrossSig(data);
    for (let i = WARMUP; i < 100; i += 1) {
      expect(run.trixValues[i] as number).toBeCloseTo(1, 9);
      expect(run.signalValues[i] as number).toBeCloseTo(1, 9);
    }
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineTrixMidCrossSig LINEAR DOWN', () => {
  it('TRIX = signal = -1 (mirror), regime bullish (===), 0 crosses', () => {
    const data = buildLinearDown(100);
    const run = runLineTrixMidCrossSig(data);
    for (let i = WARMUP; i < 100; i += 1) {
      expect(run.trixValues[i] as number).toBeCloseTo(-1, 9);
      expect(run.signalValues[i] as number).toBeCloseTo(-1, 9);
    }
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineTrixMidCrossSig misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineTrixMidCrossSigPoint[] = [
      { x: 2, close: 5 },
      { x: 0, close: 5 },
      { x: 1, close: 5 },
    ];
    const run = runLineTrixMidCrossSig(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConst(45, 50);
    const run = runLineTrixMidCrossSig(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineTrixMidCrossSig([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom period and signalLength', () => {
    const data = buildLinearUp(100);
    const run = runLineTrixMidCrossSig(data, {
      period: 9,
      signalLength: 5,
    });
    expect(run.period).toBe(9);
    expect(run.signalLength).toBe(5);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(100);
    const run = runLineTrixMidCrossSig(data);
    expect(run.bullishCount + run.bearishCount + run.noneCount).toBe(100);
  });
});

describe('computeLineTrixMidCrossSigLayout', () => {
  it('renders SVG paths for LINEAR UP', () => {
    const data = buildLinearUp(100);
    const layout = computeLineTrixMidCrossSigLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(100);
    expect(layout.trixPath).toContain('M ');
    expect(layout.signalPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('centerline (0) is within view', () => {
    const layout = computeLineTrixMidCrossSigLayout({
      data: buildLinearUp(100),
    });
    expect(layout.oscMin).toBeLessThanOrEqual(0);
    expect(layout.oscMax).toBeGreaterThanOrEqual(0);
    expect(layout.centerlineY).toBeGreaterThanOrEqual(layout.oscTop);
    expect(layout.centerlineY).toBeLessThanOrEqual(layout.oscBottom);
  });

  it('falls back when no data', () => {
    const layout = computeLineTrixMidCrossSigLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.trixPath).toBe('');
    expect(layout.signalPath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineTrixMidCrossSigLayout({
      data: buildLinearUp(100),
      width: 600,
      height: 320,
      padding: 32,
      panelGap: 8,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(320);
  });

  it('pads degenerate priceMin === priceMax', () => {
    const data = buildConst(100, 100);
    const layout = computeLineTrixMidCrossSigLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });
});

describe('describeLineTrixMidCrossSigChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineTrixMidCrossSigChart([])).toBe('No data');
  });

  it('mentions bar count, period, triple smoothed centerline trigger', () => {
    const desc = describeLineTrixMidCrossSigChart(buildLinearUp(100));
    expect(desc).toContain('100 bars');
    expect(desc).toContain('period 15');
    expect(desc).toContain('signalLength 3');
    expect(desc).toContain('triple smoothed centerline trigger');
    expect(desc).toContain('bias coloring');
  });
});

describe('<ChartLineTrixMidCrossSig /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(100);
    const { container } = render(<ChartLineTrixMidCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-trix-mid-cross-sig"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-period')).toBe(String(PERIOD));
    expect(root?.getAttribute('data-signal-length')).toBe(String(SIGNAL));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(<ChartLineTrixMidCrossSig data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-trix-mid-cross-sig-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders TRIX + signal paths', () => {
    const data = buildLinearUp(100);
    const { container } = render(<ChartLineTrixMidCrossSig data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-trix-mid-cross-sig-trix-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-trix-mid-cross-sig-signal-path"]',
      ),
    ).not.toBeNull();
  });

  it('renders centerline by default', () => {
    const data = buildLinearUp(100);
    const { container } = render(<ChartLineTrixMidCrossSig data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-trix-mid-cross-sig-centerline"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(100);
    const { container } = render(
      <ChartLineTrixMidCrossSig data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trix-mid-cross-sig-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildLinearUp(100);
    const { container } = render(<ChartLineTrixMidCrossSig data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-trix-mid-cross-sig-badge"]',
    );
    expect(badge?.textContent).toContain('period 15');
    expect(badge?.textContent).toContain('signal 3');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(100);
    const { container } = render(<ChartLineTrixMidCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-trix-mid-cross-sig"]',
    );
    expect(root?.getAttribute('aria-label')).toBe(
      'TRIX midline-over-Signal chart',
    );
  });

  it('exposes data-cross-count counter for LINEAR UP', () => {
    const data = buildLinearUp(100);
    const { container } = render(<ChartLineTrixMidCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-trix-mid-cross-sig"]',
    );
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(100);
    const { container } = render(
      <ChartLineTrixMidCrossSig data={data} hiddenSeries={['signal']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trix-mid-cross-sig-signal-path"]',
      ),
    ).toBeNull();
  });
});
