import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineWmaCrossSig,
  DEFAULT_CHART_LINE_WMA_CROSS_SIG_HEIGHT,
  DEFAULT_CHART_LINE_WMA_CROSS_SIG_PADDING,
  DEFAULT_CHART_LINE_WMA_CROSS_SIG_PANEL_GAP,
  DEFAULT_CHART_LINE_WMA_CROSS_SIG_PERIOD,
  DEFAULT_CHART_LINE_WMA_CROSS_SIG_SIGNAL_LENGTH,
  DEFAULT_CHART_LINE_WMA_CROSS_SIG_WIDTH,
  applyLineWmaCrossSigSma,
  applyLineWmaCrossSigWma,
  classifyLineWmaCrossSigBias,
  classifyLineWmaCrossSigRegime,
  computeLineWmaCrossSig,
  computeLineWmaCrossSigLayout,
  describeLineWmaCrossSigChart,
  detectLineWmaCrossSigCrosses,
  getLineWmaCrossSigFinitePoints,
  normalizeLineWmaCrossSigLength,
  runLineWmaCrossSig,
  type ChartLineWmaCrossSigPoint,
} from './chart-line-wma-cross-sig';

const PERIOD = 14;
const SIGNAL = 3;
const WMA_WARMUP = PERIOD - 1; // 13
const WARMUP = WMA_WARMUP + SIGNAL - 1; // 15
const WMA_LAG = (PERIOD - 1) / 3; // 13/3 ~= 4.333
const SIGNAL_LAG = WMA_LAG + (SIGNAL - 1) / 2; // + 1 = 16/3 ~= 5.333
const DIFF = SIGNAL_LAG - WMA_LAG; // 1

const buildConst = (n: number, k: number): ChartLineWmaCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: k }));

const buildLinearUp = (n: number): ChartLineWmaCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: i }));

const buildLinearDown = (n: number): ChartLineWmaCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: -i }));

describe('ChartLineWmaCrossSig defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_WMA_CROSS_SIG_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_WMA_CROSS_SIG_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_WMA_CROSS_SIG_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_WMA_CROSS_SIG_PANEL_GAP).toBe(12);
  });

  it('exports canonical WMA tuning', () => {
    expect(DEFAULT_CHART_LINE_WMA_CROSS_SIG_PERIOD).toBe(14);
    expect(DEFAULT_CHART_LINE_WMA_CROSS_SIG_SIGNAL_LENGTH).toBe(3);
  });
});

describe('getLineWmaCrossSigFinitePoints', () => {
  it('filters finite x and close', () => {
    const points = [
      { x: 0, close: 1 },
      { x: NaN, close: 2 },
      { x: 2, close: Infinity },
      { x: 3, close: 4 },
    ];
    expect(getLineWmaCrossSigFinitePoints(points)).toEqual([
      { x: 0, close: 1 },
      { x: 3, close: 4 },
    ]);
  });

  it('returns empty for null and non-array', () => {
    expect(getLineWmaCrossSigFinitePoints(null)).toEqual([]);
    expect(getLineWmaCrossSigFinitePoints(undefined)).toEqual([]);
    expect(
      getLineWmaCrossSigFinitePoints(
        // @ts-expect-error -- intentionally bad
        'oops',
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineWmaCrossSigLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineWmaCrossSigLength(14.7, 14)).toBe(14);
    expect(normalizeLineWmaCrossSigLength(0, 14)).toBe(14);
    expect(normalizeLineWmaCrossSigLength(NaN, 14)).toBe(14);
  });
});

describe('applyLineWmaCrossSigWma', () => {
  it('CONST returns constant', () => {
    const values: Array<number | null> = Array.from({ length: 30 }, () => 50);
    const wma = applyLineWmaCrossSigWma(values, PERIOD);
    for (let i = WMA_WARMUP; i < 30; i += 1) {
      expect(wma[i] as number).toBeCloseTo(50, 9);
    }
  });

  it('LINEAR returns i - (L-1)/3', () => {
    const values: Array<number | null> = Array.from(
      { length: 30 },
      (_, i) => i,
    );
    const wma = applyLineWmaCrossSigWma(values, PERIOD);
    for (let i = WMA_WARMUP; i < 30; i += 1) {
      expect(wma[i] as number).toBeCloseTo(i - WMA_LAG, 9);
    }
  });

  it('returns nulls when length < 1', () => {
    expect(
      applyLineWmaCrossSigWma([1, 2, 3], 0).every((v) => v === null),
    ).toBe(true);
  });

  it('null gap aborts windows that touch it', () => {
    const wma = applyLineWmaCrossSigWma([1, 1, null, 1, 1, 1], 3);
    expect(wma[1]).toBeNull();
    expect(wma[2]).toBeNull();
    expect(wma[3]).toBeNull();
    expect(wma[4]).toBeNull();
    expect(wma[5]).toBe(1);
  });
});

describe('applyLineWmaCrossSigSma', () => {
  it('CONST returns constant', () => {
    const values: Array<number | null> = Array.from({ length: 10 }, () => 7);
    const sma = applyLineWmaCrossSigSma(values, SIGNAL);
    for (let i = SIGNAL - 1; i < 10; i += 1) expect(sma[i]).toBe(7);
  });
});

describe('computeLineWmaCrossSig', () => {
  it('CONST close=K returns wma=K and signal=K from warmup', () => {
    const data = buildConst(40, 50);
    const out = computeLineWmaCrossSig(data);
    expect(out.wma[WMA_WARMUP] as number).toBeCloseTo(50, 9);
    expect(out.signal[WARMUP] as number).toBeCloseTo(50, 9);
  });

  it('LINEAR UP: wma - signal = +1', () => {
    const data = buildLinearUp(40);
    const out = computeLineWmaCrossSig(data);
    for (let i = WARMUP; i < 40; i += 1) {
      const w = out.wma[i] as number;
      const s = out.signal[i] as number;
      expect(w - s).toBeCloseTo(DIFF, 9);
    }
  });

  it('LINEAR DOWN: wma - signal = -1', () => {
    const data = buildLinearDown(40);
    const out = computeLineWmaCrossSig(data);
    for (let i = WARMUP; i < 40; i += 1) {
      const w = out.wma[i] as number;
      const s = out.signal[i] as number;
      expect(w - s).toBeCloseTo(-DIFF, 9);
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineWmaCrossSig([])).toEqual({ wma: [], signal: [] });
  });
});

describe('classifyLineWmaCrossSigRegime', () => {
  it('null -> none', () => {
    expect(classifyLineWmaCrossSigRegime(null, 50)).toBe('none');
  });
  it('wma >= signal -> bullish', () => {
    expect(classifyLineWmaCrossSigRegime(50, 50)).toBe('bullish');
    expect(classifyLineWmaCrossSigRegime(60, 50)).toBe('bullish');
  });
  it('wma < signal -> bearish', () => {
    expect(classifyLineWmaCrossSigRegime(40, 50)).toBe('bearish');
  });
});

describe('classifyLineWmaCrossSigBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineWmaCrossSigBias(60, 50)).toBe('up');
    expect(classifyLineWmaCrossSigBias(40, 50)).toBe('down');
    expect(classifyLineWmaCrossSigBias(50, 50)).toBe('flat');
    expect(classifyLineWmaCrossSigBias(null, 50)).toBe('none');
  });
});

describe('detectLineWmaCrossSigCrosses', () => {
  it('detects bullish trigger', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const wma: Array<number | null> = [4, 5, 7, 8];
    const signal: Array<number | null> = [5, 5, 6, 6];
    const out = detectLineWmaCrossSigCrosses(series, wma, signal);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
  });

  it('detects bearish trigger', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const wma: Array<number | null> = [8, 7, 5, 4];
    const signal: Array<number | null> = [6, 6, 6, 6];
    const out = detectLineWmaCrossSigCrosses(series, wma, signal);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
  });

  it('does not fire on null values', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const wma: Array<number | null> = [null, null, 5, 7];
    const signal: Array<number | null> = [null, null, 4, 4];
    expect(detectLineWmaCrossSigCrosses(series, wma, signal)).toHaveLength(0);
  });

  it('does not double-fire', () => {
    const series = Array.from({ length: 5 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const wma: Array<number | null> = [4, 5, 6, 7, 8];
    const signal: Array<number | null> = [5, 4, 4, 4, 4];
    expect(detectLineWmaCrossSigCrosses(series, wma, signal)).toHaveLength(1);
  });
});

describe('runLineWmaCrossSig CONST K', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST close=${K}: wma=K, signal=K, all bullish, 0 triggers`, () => {
      const data = buildConst(60, K);
      const run = runLineWmaCrossSig(data);
      expect(run.period).toBe(PERIOD);
      expect(run.signalLength).toBe(SIGNAL);
      for (let i = 0; i < WARMUP; i += 1) {
        expect(run.signalValues[i]).toBeNull();
      }
      for (let i = WARMUP; i < 60; i += 1) {
        expect(run.wmaValues[i] as number).toBeCloseTo(K, 9);
        expect(run.signalValues[i] as number).toBeCloseTo(K, 9);
        expect(run.samples[i]?.regime).toBe('bullish');
      }
      expect(run.bullishCount).toBe(60 - WARMUP);
      expect(run.bearishCount).toBe(0);
      expect(run.noneCount).toBe(WARMUP);
      expect(run.crosses).toHaveLength(0);
      expect(run.ok).toBe(true);
    });
  }
});

describe('runLineWmaCrossSig LINEAR UP', () => {
  it('LINEAR UP: wma > signal by 1, all bullish, 0 triggers', () => {
    const data = buildLinearUp(60);
    const run = runLineWmaCrossSig(data);
    for (let i = WARMUP; i < 60; i += 1) {
      expect(run.samples[i]?.regime).toBe('bullish');
      const w = run.wmaValues[i] as number;
      const s = run.signalValues[i] as number;
      expect(w - s).toBeCloseTo(DIFF, 9);
    }
    expect(run.bullishCount).toBe(60 - WARMUP);
    expect(run.bearishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineWmaCrossSig LINEAR DOWN', () => {
  it('LINEAR DOWN: wma < signal by 1, all bearish, 0 triggers', () => {
    const data = buildLinearDown(60);
    const run = runLineWmaCrossSig(data);
    for (let i = WARMUP; i < 60; i += 1) {
      expect(run.samples[i]?.regime).toBe('bearish');
      const w = run.wmaValues[i] as number;
      const s = run.signalValues[i] as number;
      expect(w - s).toBeCloseTo(-DIFF, 9);
    }
    expect(run.bearishCount).toBe(60 - WARMUP);
    expect(run.bullishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineWmaCrossSig misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineWmaCrossSigPoint[] = [
      { x: 2, close: 1 },
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    const run = runLineWmaCrossSig(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConst(10, 50);
    const run = runLineWmaCrossSig(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineWmaCrossSig([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom tuning', () => {
    const data = buildLinearUp(60);
    const run = runLineWmaCrossSig(data, { period: 7, signalLength: 2 });
    expect(run.period).toBe(7);
    expect(run.signalLength).toBe(2);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(60);
    const run = runLineWmaCrossSig(data);
    expect(run.bullishCount + run.bearishCount + run.noneCount).toBe(60);
  });
});

describe('computeLineWmaCrossSigLayout', () => {
  it('renders SVG paths for CONST K=50', () => {
    const data = buildConst(60, 50);
    const layout = computeLineWmaCrossSigLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(60);
    expect(layout.wmaPath).toContain('M ');
    expect(layout.signalPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineWmaCrossSigLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.wmaPath).toBe('');
    expect(layout.signalPath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineWmaCrossSigLayout({
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
    const layout = computeLineWmaCrossSigLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });
});

describe('describeLineWmaCrossSigChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineWmaCrossSigChart([])).toBe('No data');
  });

  it('mentions bar count, period, signal', () => {
    const desc = describeLineWmaCrossSigChart(buildLinearUp(60));
    expect(desc).toContain('60 bars');
    expect(desc).toContain('period 14');
    expect(desc).toContain('signalLength 3');
    expect(desc).toContain('bias coloring');
  });
});

describe('<ChartLineWmaCrossSig /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineWmaCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-wma-cross-sig"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-period')).toBe(String(PERIOD));
    expect(root?.getAttribute('data-signal-length')).toBe(String(SIGNAL));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(<ChartLineWmaCrossSig data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-wma-cross-sig-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders WMA and signal paths', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineWmaCrossSig data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-wma-cross-sig-wma-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-wma-cross-sig-signal-path"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineWmaCrossSig data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-wma-cross-sig-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineWmaCrossSig data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-wma-cross-sig-badge"]',
    );
    expect(badge?.textContent).toContain('period 14');
    expect(badge?.textContent).toContain('signal 3');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineWmaCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-wma-cross-sig"]',
    );
    expect(root?.getAttribute('aria-label')).toBe('WMA-over-Signal chart');
  });

  it('exposes data-*-count counters', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineWmaCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-wma-cross-sig"]',
    );
    expect(root?.getAttribute('data-bullish-count')).toBe(
      String(60 - WARMUP),
    );
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineWmaCrossSig data={data} hiddenSeries={['signal']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-wma-cross-sig-signal-path"]',
      ),
    ).toBeNull();
  });
});
