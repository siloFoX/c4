import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineHmaCrossSig,
  DEFAULT_CHART_LINE_HMA_CROSS_SIG_HEIGHT,
  DEFAULT_CHART_LINE_HMA_CROSS_SIG_PADDING,
  DEFAULT_CHART_LINE_HMA_CROSS_SIG_PANEL_GAP,
  DEFAULT_CHART_LINE_HMA_CROSS_SIG_PERIOD,
  DEFAULT_CHART_LINE_HMA_CROSS_SIG_SIGNAL_LENGTH,
  DEFAULT_CHART_LINE_HMA_CROSS_SIG_WIDTH,
  applyLineHmaCrossSigHma,
  applyLineHmaCrossSigSma,
  applyLineHmaCrossSigWma,
  classifyLineHmaCrossSigBias,
  classifyLineHmaCrossSigRegime,
  computeLineHmaCrossSig,
  computeLineHmaCrossSigLayout,
  describeLineHmaCrossSigChart,
  detectLineHmaCrossSigCrosses,
  getLineHmaCrossSigFinitePoints,
  normalizeLineHmaCrossSigLength,
  runLineHmaCrossSig,
  type ChartLineHmaCrossSigPoint,
} from './chart-line-hma-cross-sig';

const PERIOD = 16;
const SIGNAL = 3;
const SQRT = 4; // floor(sqrt(16))
const HMA_WARMUP = PERIOD + SQRT - 2; // 18 (first valid hma)
const WARMUP = HMA_WARMUP + SIGNAL - 1; // 20 (first valid signal)

const buildConst = (n: number, k: number): ChartLineHmaCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: k }));

const buildLinearUp = (n: number): ChartLineHmaCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: i }));

const buildLinearDown = (n: number): ChartLineHmaCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: -i }));

describe('ChartLineHmaCrossSig defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_HMA_CROSS_SIG_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_HMA_CROSS_SIG_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_HMA_CROSS_SIG_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_HMA_CROSS_SIG_PANEL_GAP).toBe(12);
  });

  it('exports canonical HMA tuning', () => {
    expect(DEFAULT_CHART_LINE_HMA_CROSS_SIG_PERIOD).toBe(16);
    expect(DEFAULT_CHART_LINE_HMA_CROSS_SIG_SIGNAL_LENGTH).toBe(3);
  });
});

describe('getLineHmaCrossSigFinitePoints', () => {
  it('filters finite x and close', () => {
    const points = [
      { x: 0, close: 1 },
      { x: NaN, close: 2 },
      { x: 2, close: Infinity },
      { x: 3, close: 4 },
    ];
    expect(getLineHmaCrossSigFinitePoints(points)).toEqual([
      { x: 0, close: 1 },
      { x: 3, close: 4 },
    ]);
  });

  it('returns empty for null and non-array', () => {
    expect(getLineHmaCrossSigFinitePoints(null)).toEqual([]);
    expect(getLineHmaCrossSigFinitePoints(undefined)).toEqual([]);
    expect(
      getLineHmaCrossSigFinitePoints(
        // @ts-expect-error -- intentionally bad
        'oops',
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineHmaCrossSigLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineHmaCrossSigLength(16.7, 16)).toBe(16);
    expect(normalizeLineHmaCrossSigLength(0, 16)).toBe(16);
    expect(normalizeLineHmaCrossSigLength(NaN, 16)).toBe(16);
  });
});

describe('applyLineHmaCrossSigWma', () => {
  it('LINEAR returns i - (L-1)/3', () => {
    const values: Array<number | null> = Array.from(
      { length: 20 },
      (_, i) => i,
    );
    const wma = applyLineHmaCrossSigWma(values, 4);
    for (let i = 3; i < 20; i += 1) {
      expect(wma[i] as number).toBeCloseTo(i - 1, 9);
    }
  });

  it('CONST returns the constant', () => {
    const values: Array<number | null> = Array.from({ length: 10 }, () => 5);
    const wma = applyLineHmaCrossSigWma(values, 4);
    for (let i = 3; i < 10; i += 1) {
      expect(wma[i] as number).toBeCloseTo(5, 9);
    }
  });

  it('returns null at any window touching null', () => {
    const wma = applyLineHmaCrossSigWma([1, 1, null, 1, 1, 1, 1], 3);
    expect(wma[1]).toBeNull();
    expect(wma[2]).toBeNull();
    expect(wma[3]).toBeNull();
    expect(wma[4]).toBeNull();
    expect(wma[5]).toBe(1);
  });
});

describe('applyLineHmaCrossSigSma', () => {
  it('CONST returns constant', () => {
    const values: Array<number | null> = Array.from({ length: 10 }, () => 7);
    const sma = applyLineHmaCrossSigSma(values, 3);
    for (let i = 2; i < 10; i += 1) expect(sma[i]).toBe(7);
  });
});

describe('applyLineHmaCrossSigHma', () => {
  it('CONST close=K returns HMA=K from warmup', () => {
    const closes = Array.from({ length: 30 }, () => 50);
    const hma = applyLineHmaCrossSigHma(closes, PERIOD);
    for (let i = HMA_WARMUP; i < 30; i += 1) {
      expect(hma[i] as number).toBeCloseTo(50, 9);
    }
  });

  it('LINEAR UP: HMA = i - 2/3', () => {
    const closes = Array.from({ length: 30 }, (_, i) => i);
    const hma = applyLineHmaCrossSigHma(closes, PERIOD);
    for (let i = HMA_WARMUP; i < 30; i += 1) {
      expect(hma[i] as number).toBeCloseTo(i - 2 / 3, 9);
    }
  });

  it('LINEAR DOWN: HMA = -i + 2/3', () => {
    const closes = Array.from({ length: 30 }, (_, i) => -i);
    const hma = applyLineHmaCrossSigHma(closes, PERIOD);
    for (let i = HMA_WARMUP; i < 30; i += 1) {
      expect(hma[i] as number).toBeCloseTo(-i + 2 / 3, 9);
    }
  });
});

describe('computeLineHmaCrossSig', () => {
  it('CONST close=K returns hma=K and signal=K from warmup', () => {
    const data = buildConst(40, 50);
    const out = computeLineHmaCrossSig(data);
    expect(out.hma[HMA_WARMUP] as number).toBeCloseTo(50, 9);
    expect(out.signal[WARMUP] as number).toBeCloseTo(50, 9);
  });

  it('LINEAR UP: hma - signal = 1', () => {
    const data = buildLinearUp(40);
    const out = computeLineHmaCrossSig(data);
    for (let i = WARMUP; i < 40; i += 1) {
      const h = out.hma[i] as number;
      const s = out.signal[i] as number;
      expect(h - s).toBeCloseTo(1, 9);
    }
  });

  it('LINEAR DOWN: hma - signal = -1', () => {
    const data = buildLinearDown(40);
    const out = computeLineHmaCrossSig(data);
    for (let i = WARMUP; i < 40; i += 1) {
      const h = out.hma[i] as number;
      const s = out.signal[i] as number;
      expect(h - s).toBeCloseTo(-1, 9);
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineHmaCrossSig([])).toEqual({ hma: [], signal: [] });
  });
});

describe('classifyLineHmaCrossSigRegime', () => {
  it('null -> none', () => {
    expect(classifyLineHmaCrossSigRegime(null, 50)).toBe('none');
    expect(classifyLineHmaCrossSigRegime(50, null)).toBe('none');
  });
  it('hma >= signal -> bullish', () => {
    expect(classifyLineHmaCrossSigRegime(50, 50)).toBe('bullish');
    expect(classifyLineHmaCrossSigRegime(60, 50)).toBe('bullish');
  });
  it('hma < signal -> bearish', () => {
    expect(classifyLineHmaCrossSigRegime(40, 50)).toBe('bearish');
  });
});

describe('classifyLineHmaCrossSigBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineHmaCrossSigBias(60, 50)).toBe('up');
    expect(classifyLineHmaCrossSigBias(40, 50)).toBe('down');
    expect(classifyLineHmaCrossSigBias(50, 50)).toBe('flat');
    expect(classifyLineHmaCrossSigBias(null, 50)).toBe('none');
  });
});

describe('detectLineHmaCrossSigCrosses', () => {
  it('detects bullish trigger on HMA crossing up through signal', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const hma: Array<number | null> = [4, 5, 7, 8];
    const signal: Array<number | null> = [5, 5, 6, 6];
    const out = detectLineHmaCrossSigCrosses(series, hma, signal);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
    expect(out[0]?.index).toBe(2);
  });

  it('detects bearish trigger on HMA crossing down through signal', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const hma: Array<number | null> = [8, 7, 5, 4];
    const signal: Array<number | null> = [6, 6, 6, 6];
    const out = detectLineHmaCrossSigCrosses(series, hma, signal);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
  });

  it('does not fire when any value is null', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const hma: Array<number | null> = [null, null, 5, 7];
    const signal: Array<number | null> = [null, null, 4, 4];
    expect(
      detectLineHmaCrossSigCrosses(series, hma, signal),
    ).toHaveLength(0);
  });

  it('does not double-fire when state holds steady', () => {
    const series = Array.from({ length: 5 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const hma: Array<number | null> = [4, 5, 6, 7, 8];
    const signal: Array<number | null> = [5, 4, 4, 4, 4];
    const out = detectLineHmaCrossSigCrosses(series, hma, signal);
    expect(out).toHaveLength(1);
  });
});

describe('runLineHmaCrossSig CONST K', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST close=${K}: hma=K, signal=K, all bullish, 0 triggers`, () => {
      const data = buildConst(60, K);
      const run = runLineHmaCrossSig(data);
      expect(run.period).toBe(PERIOD);
      expect(run.signalLength).toBe(SIGNAL);
      for (let i = 0; i < WARMUP; i += 1) {
        expect(run.signalValues[i]).toBeNull();
      }
      for (let i = WARMUP; i < 60; i += 1) {
        expect(run.hmaValues[i] as number).toBeCloseTo(K, 9);
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

describe('runLineHmaCrossSig LINEAR UP', () => {
  it('LINEAR UP: hma > signal, all bullish, 0 triggers', () => {
    const data = buildLinearUp(60);
    const run = runLineHmaCrossSig(data);
    for (let i = WARMUP; i < 60; i += 1) {
      expect(run.samples[i]?.regime).toBe('bullish');
      const h = run.hmaValues[i] as number;
      const s = run.signalValues[i] as number;
      expect(h - s).toBeCloseTo(1, 9);
    }
    expect(run.bullishCount).toBe(60 - WARMUP);
    expect(run.bearishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineHmaCrossSig LINEAR DOWN', () => {
  it('LINEAR DOWN: hma < signal, all bearish, 0 triggers', () => {
    const data = buildLinearDown(60);
    const run = runLineHmaCrossSig(data);
    for (let i = WARMUP; i < 60; i += 1) {
      expect(run.samples[i]?.regime).toBe('bearish');
      const h = run.hmaValues[i] as number;
      const s = run.signalValues[i] as number;
      expect(h - s).toBeCloseTo(-1, 9);
    }
    expect(run.bearishCount).toBe(60 - WARMUP);
    expect(run.bullishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineHmaCrossSig misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineHmaCrossSigPoint[] = [
      { x: 2, close: 1 },
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    const run = runLineHmaCrossSig(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConst(15, 50);
    const run = runLineHmaCrossSig(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineHmaCrossSig([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom tuning', () => {
    const data = buildLinearUp(60);
    const run = runLineHmaCrossSig(data, {
      period: 9,
      signalLength: 2,
    });
    expect(run.period).toBe(9);
    expect(run.signalLength).toBe(2);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(60);
    const run = runLineHmaCrossSig(data);
    expect(
      run.bullishCount + run.bearishCount + run.noneCount,
    ).toBe(60);
  });
});

describe('computeLineHmaCrossSigLayout', () => {
  it('renders SVG paths for CONST K=50', () => {
    const data = buildConst(60, 50);
    const layout = computeLineHmaCrossSigLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(60);
    expect(layout.hmaPath).toContain('M ');
    expect(layout.signalPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineHmaCrossSigLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.hmaPath).toBe('');
    expect(layout.signalPath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineHmaCrossSigLayout({
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
    const layout = computeLineHmaCrossSigLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });
});

describe('describeLineHmaCrossSigChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineHmaCrossSigChart([])).toBe('No data');
  });

  it('mentions bar count, period, signal', () => {
    const desc = describeLineHmaCrossSigChart(buildLinearUp(60));
    expect(desc).toContain('60 bars');
    expect(desc).toContain('period 16');
    expect(desc).toContain('signalLength 3');
    expect(desc).toContain('bias coloring');
  });
});

describe('<ChartLineHmaCrossSig /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineHmaCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-hma-cross-sig"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-period')).toBe(String(PERIOD));
    expect(root?.getAttribute('data-signal-length')).toBe(String(SIGNAL));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(<ChartLineHmaCrossSig data={[]} />);
    expect(
      container.querySelector('[data-section="chart-line-hma-cross-sig-empty"]'),
    ).not.toBeNull();
  });

  it('renders HMA and signal paths', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineHmaCrossSig data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-hma-cross-sig-hma-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-hma-cross-sig-signal-path"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineHmaCrossSig data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hma-cross-sig-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineHmaCrossSig data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-hma-cross-sig-badge"]',
    );
    expect(badge?.textContent).toContain('period 16');
    expect(badge?.textContent).toContain('signal 3');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineHmaCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-hma-cross-sig"]',
    );
    expect(root?.getAttribute('aria-label')).toBe('HMA-over-Signal chart');
  });

  it('exposes data-*-count counters', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineHmaCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-hma-cross-sig"]',
    );
    expect(root?.getAttribute('data-bullish-count')).toBe(
      String(60 - WARMUP),
    );
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineHmaCrossSig data={data} hiddenSeries={['signal']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hma-cross-sig-signal-path"]',
      ),
    ).toBeNull();
  });
});
