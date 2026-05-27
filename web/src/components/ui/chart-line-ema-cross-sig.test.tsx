import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineEmaCrossSig,
  DEFAULT_CHART_LINE_EMA_CROSS_SIG_HEIGHT,
  DEFAULT_CHART_LINE_EMA_CROSS_SIG_PADDING,
  DEFAULT_CHART_LINE_EMA_CROSS_SIG_PANEL_GAP,
  DEFAULT_CHART_LINE_EMA_CROSS_SIG_PERIOD,
  DEFAULT_CHART_LINE_EMA_CROSS_SIG_SIGNAL_LENGTH,
  DEFAULT_CHART_LINE_EMA_CROSS_SIG_WIDTH,
  applyLineEmaCrossSigSma,
  applyLineEmaCrossSigSmaSeededEma,
  classifyLineEmaCrossSigBias,
  classifyLineEmaCrossSigRegime,
  computeLineEmaCrossSig,
  computeLineEmaCrossSigLayout,
  describeLineEmaCrossSigChart,
  detectLineEmaCrossSigCrosses,
  getLineEmaCrossSigFinitePoints,
  normalizeLineEmaCrossSigLength,
  runLineEmaCrossSig,
  type ChartLineEmaCrossSigPoint,
} from './chart-line-ema-cross-sig';

const PERIOD = 14;
const SIGNAL = 3;
const EMA_WARMUP = PERIOD - 1; // 13 (first valid ema)
const WARMUP = EMA_WARMUP + SIGNAL - 1; // 15 (first valid signal)
const LAG = (PERIOD - 1) / 2; // 6.5
const SIGNAL_LAG = LAG + (SIGNAL - 1) / 2; // 7.5
const DIFF = SIGNAL_LAG - LAG; // 1.0

const buildConst = (n: number, k: number): ChartLineEmaCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: k }));

const buildLinearUp = (n: number): ChartLineEmaCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: i }));

const buildLinearDown = (n: number): ChartLineEmaCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: -i }));

describe('ChartLineEmaCrossSig defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_EMA_CROSS_SIG_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_EMA_CROSS_SIG_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_EMA_CROSS_SIG_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_EMA_CROSS_SIG_PANEL_GAP).toBe(12);
  });

  it('exports canonical EMA tuning', () => {
    expect(DEFAULT_CHART_LINE_EMA_CROSS_SIG_PERIOD).toBe(14);
    expect(DEFAULT_CHART_LINE_EMA_CROSS_SIG_SIGNAL_LENGTH).toBe(3);
  });
});

describe('getLineEmaCrossSigFinitePoints', () => {
  it('filters finite x and close', () => {
    const points = [
      { x: 0, close: 1 },
      { x: NaN, close: 2 },
      { x: 2, close: Infinity },
      { x: 3, close: 4 },
    ];
    expect(getLineEmaCrossSigFinitePoints(points)).toEqual([
      { x: 0, close: 1 },
      { x: 3, close: 4 },
    ]);
  });

  it('returns empty for null and non-array', () => {
    expect(getLineEmaCrossSigFinitePoints(null)).toEqual([]);
    expect(getLineEmaCrossSigFinitePoints(undefined)).toEqual([]);
    expect(
      getLineEmaCrossSigFinitePoints(
        // @ts-expect-error -- intentionally bad
        'oops',
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineEmaCrossSigLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineEmaCrossSigLength(14.7, 14)).toBe(14);
    expect(normalizeLineEmaCrossSigLength(0, 14)).toBe(14);
    expect(normalizeLineEmaCrossSigLength(NaN, 14)).toBe(14);
  });
});

describe('applyLineEmaCrossSigSmaSeededEma', () => {
  it('LINEAR UP settles at i - (period-1)/2', () => {
    const values: Array<number | null> = Array.from(
      { length: 30 },
      (_, i) => i,
    );
    const ema = applyLineEmaCrossSigSmaSeededEma(values, PERIOD);
    for (let i = EMA_WARMUP; i < 30; i += 1) {
      expect(ema[i] as number).toBeCloseTo(i - LAG, 9);
    }
  });

  it('CONST returns constant', () => {
    const values: Array<number | null> = Array.from({ length: 30 }, () => 50);
    const ema = applyLineEmaCrossSigSmaSeededEma(values, PERIOD);
    for (let i = EMA_WARMUP; i < 30; i += 1) {
      expect(ema[i] as number).toBeCloseTo(50, 9);
    }
  });

  it('returns nulls when length < 1', () => {
    expect(
      applyLineEmaCrossSigSmaSeededEma([1, 2, 3], 0).every((v) => v === null),
    ).toBe(true);
  });
});

describe('applyLineEmaCrossSigSma', () => {
  it('CONST returns constant', () => {
    const values: Array<number | null> = Array.from({ length: 10 }, () => 7);
    const sma = applyLineEmaCrossSigSma(values, SIGNAL);
    for (let i = SIGNAL - 1; i < 10; i += 1) expect(sma[i]).toBe(7);
  });
});

describe('computeLineEmaCrossSig', () => {
  it('CONST close=K returns ema=K and signal=K from warmup', () => {
    const data = buildConst(40, 50);
    const out = computeLineEmaCrossSig(data);
    expect(out.ema[EMA_WARMUP] as number).toBeCloseTo(50, 9);
    expect(out.signal[WARMUP] as number).toBeCloseTo(50, 9);
  });

  it('LINEAR UP: ema - signal = +1', () => {
    const data = buildLinearUp(40);
    const out = computeLineEmaCrossSig(data);
    for (let i = WARMUP; i < 40; i += 1) {
      const e = out.ema[i] as number;
      const s = out.signal[i] as number;
      expect(e - s).toBeCloseTo(DIFF, 9);
    }
  });

  it('LINEAR DOWN: ema - signal = -1', () => {
    const data = buildLinearDown(40);
    const out = computeLineEmaCrossSig(data);
    for (let i = WARMUP; i < 40; i += 1) {
      const e = out.ema[i] as number;
      const s = out.signal[i] as number;
      expect(e - s).toBeCloseTo(-DIFF, 9);
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineEmaCrossSig([])).toEqual({ ema: [], signal: [] });
  });
});

describe('classifyLineEmaCrossSigRegime', () => {
  it('null -> none', () => {
    expect(classifyLineEmaCrossSigRegime(null, 50)).toBe('none');
    expect(classifyLineEmaCrossSigRegime(50, null)).toBe('none');
  });
  it('ema >= signal -> bullish', () => {
    expect(classifyLineEmaCrossSigRegime(50, 50)).toBe('bullish');
    expect(classifyLineEmaCrossSigRegime(60, 50)).toBe('bullish');
  });
  it('ema < signal -> bearish', () => {
    expect(classifyLineEmaCrossSigRegime(40, 50)).toBe('bearish');
  });
});

describe('classifyLineEmaCrossSigBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineEmaCrossSigBias(60, 50)).toBe('up');
    expect(classifyLineEmaCrossSigBias(40, 50)).toBe('down');
    expect(classifyLineEmaCrossSigBias(50, 50)).toBe('flat');
    expect(classifyLineEmaCrossSigBias(null, 50)).toBe('none');
  });
});

describe('detectLineEmaCrossSigCrosses', () => {
  it('detects bullish trigger on EMA crossing up through signal', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const ema: Array<number | null> = [4, 5, 7, 8];
    const signal: Array<number | null> = [5, 5, 6, 6];
    const out = detectLineEmaCrossSigCrosses(series, ema, signal);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
    expect(out[0]?.index).toBe(2);
  });

  it('detects bearish trigger on EMA crossing down through signal', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const ema: Array<number | null> = [8, 7, 5, 4];
    const signal: Array<number | null> = [6, 6, 6, 6];
    const out = detectLineEmaCrossSigCrosses(series, ema, signal);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
  });

  it('does not fire when any value is null', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const ema: Array<number | null> = [null, null, 5, 7];
    const signal: Array<number | null> = [null, null, 4, 4];
    expect(detectLineEmaCrossSigCrosses(series, ema, signal)).toHaveLength(0);
  });

  it('does not double-fire when state holds steady', () => {
    const series = Array.from({ length: 5 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const ema: Array<number | null> = [4, 5, 6, 7, 8];
    const signal: Array<number | null> = [5, 4, 4, 4, 4];
    expect(detectLineEmaCrossSigCrosses(series, ema, signal)).toHaveLength(1);
  });
});

describe('runLineEmaCrossSig CONST K', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST close=${K}: ema=K, signal=K, all bullish, 0 triggers`, () => {
      const data = buildConst(60, K);
      const run = runLineEmaCrossSig(data);
      expect(run.period).toBe(PERIOD);
      expect(run.signalLength).toBe(SIGNAL);
      for (let i = 0; i < WARMUP; i += 1) {
        expect(run.signalValues[i]).toBeNull();
      }
      for (let i = WARMUP; i < 60; i += 1) {
        expect(run.emaValues[i] as number).toBeCloseTo(K, 9);
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

describe('runLineEmaCrossSig LINEAR UP', () => {
  it('LINEAR UP: ema > signal by 1, all bullish, 0 triggers', () => {
    const data = buildLinearUp(60);
    const run = runLineEmaCrossSig(data);
    for (let i = WARMUP; i < 60; i += 1) {
      expect(run.samples[i]?.regime).toBe('bullish');
      const e = run.emaValues[i] as number;
      const s = run.signalValues[i] as number;
      expect(e - s).toBeCloseTo(DIFF, 9);
    }
    expect(run.bullishCount).toBe(60 - WARMUP);
    expect(run.bearishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineEmaCrossSig LINEAR DOWN', () => {
  it('LINEAR DOWN: ema < signal by 1, all bearish, 0 triggers', () => {
    const data = buildLinearDown(60);
    const run = runLineEmaCrossSig(data);
    for (let i = WARMUP; i < 60; i += 1) {
      expect(run.samples[i]?.regime).toBe('bearish');
      const e = run.emaValues[i] as number;
      const s = run.signalValues[i] as number;
      expect(e - s).toBeCloseTo(-DIFF, 9);
    }
    expect(run.bearishCount).toBe(60 - WARMUP);
    expect(run.bullishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineEmaCrossSig misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineEmaCrossSigPoint[] = [
      { x: 2, close: 1 },
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    const run = runLineEmaCrossSig(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConst(10, 50);
    const run = runLineEmaCrossSig(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineEmaCrossSig([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom tuning', () => {
    const data = buildLinearUp(60);
    const run = runLineEmaCrossSig(data, { period: 7, signalLength: 2 });
    expect(run.period).toBe(7);
    expect(run.signalLength).toBe(2);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(60);
    const run = runLineEmaCrossSig(data);
    expect(run.bullishCount + run.bearishCount + run.noneCount).toBe(60);
  });
});

describe('computeLineEmaCrossSigLayout', () => {
  it('renders SVG paths for CONST K=50', () => {
    const data = buildConst(60, 50);
    const layout = computeLineEmaCrossSigLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(60);
    expect(layout.emaPath).toContain('M ');
    expect(layout.signalPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineEmaCrossSigLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.emaPath).toBe('');
    expect(layout.signalPath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineEmaCrossSigLayout({
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
    const layout = computeLineEmaCrossSigLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });
});

describe('describeLineEmaCrossSigChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineEmaCrossSigChart([])).toBe('No data');
  });

  it('mentions bar count, period, signal', () => {
    const desc = describeLineEmaCrossSigChart(buildLinearUp(60));
    expect(desc).toContain('60 bars');
    expect(desc).toContain('period 14');
    expect(desc).toContain('signalLength 3');
    expect(desc).toContain('bias coloring');
  });
});

describe('<ChartLineEmaCrossSig /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineEmaCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-ema-cross-sig"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-period')).toBe(String(PERIOD));
    expect(root?.getAttribute('data-signal-length')).toBe(String(SIGNAL));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(<ChartLineEmaCrossSig data={[]} />);
    expect(
      container.querySelector('[data-section="chart-line-ema-cross-sig-empty"]'),
    ).not.toBeNull();
  });

  it('renders EMA and signal paths', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineEmaCrossSig data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-ema-cross-sig-ema-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-ema-cross-sig-signal-path"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineEmaCrossSig data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ema-cross-sig-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineEmaCrossSig data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-ema-cross-sig-badge"]',
    );
    expect(badge?.textContent).toContain('period 14');
    expect(badge?.textContent).toContain('signal 3');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineEmaCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-ema-cross-sig"]',
    );
    expect(root?.getAttribute('aria-label')).toBe('EMA-over-Signal chart');
  });

  it('exposes data-*-count counters', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineEmaCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-ema-cross-sig"]',
    );
    expect(root?.getAttribute('data-bullish-count')).toBe(
      String(60 - WARMUP),
    );
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineEmaCrossSig data={data} hiddenSeries={['signal']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ema-cross-sig-signal-path"]',
      ),
    ).toBeNull();
  });
});
