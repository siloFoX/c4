import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineSmaCrossSig,
  DEFAULT_CHART_LINE_SMA_CROSS_SIG_HEIGHT,
  DEFAULT_CHART_LINE_SMA_CROSS_SIG_PADDING,
  DEFAULT_CHART_LINE_SMA_CROSS_SIG_PANEL_GAP,
  DEFAULT_CHART_LINE_SMA_CROSS_SIG_PERIOD,
  DEFAULT_CHART_LINE_SMA_CROSS_SIG_SIGNAL_LENGTH,
  DEFAULT_CHART_LINE_SMA_CROSS_SIG_WIDTH,
  applyLineSmaCrossSigSma,
  classifyLineSmaCrossSigBias,
  classifyLineSmaCrossSigRegime,
  computeLineSmaCrossSig,
  computeLineSmaCrossSigLayout,
  describeLineSmaCrossSigChart,
  detectLineSmaCrossSigCrosses,
  getLineSmaCrossSigFinitePoints,
  normalizeLineSmaCrossSigLength,
  runLineSmaCrossSig,
  type ChartLineSmaCrossSigPoint,
} from './chart-line-sma-cross-sig';

const PERIOD = 14;
const SIGNAL = 3;
const SMA_WARMUP = PERIOD - 1; // 13
const WARMUP = SMA_WARMUP + SIGNAL - 1; // 15
const LAG = (PERIOD - 1) / 2; // 6.5
const SIGNAL_LAG = LAG + (SIGNAL - 1) / 2; // 7.5
const DIFF = SIGNAL_LAG - LAG; // 1.0

const buildConst = (n: number, k: number): ChartLineSmaCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: k }));

const buildLinearUp = (n: number): ChartLineSmaCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: i }));

const buildLinearDown = (n: number): ChartLineSmaCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: -i }));

describe('ChartLineSmaCrossSig defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_SMA_CROSS_SIG_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_SMA_CROSS_SIG_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_SMA_CROSS_SIG_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_SMA_CROSS_SIG_PANEL_GAP).toBe(12);
  });

  it('exports canonical SMA tuning', () => {
    expect(DEFAULT_CHART_LINE_SMA_CROSS_SIG_PERIOD).toBe(14);
    expect(DEFAULT_CHART_LINE_SMA_CROSS_SIG_SIGNAL_LENGTH).toBe(3);
  });
});

describe('getLineSmaCrossSigFinitePoints', () => {
  it('filters finite x and close', () => {
    const points = [
      { x: 0, close: 1 },
      { x: NaN, close: 2 },
      { x: 2, close: Infinity },
      { x: 3, close: 4 },
    ];
    expect(getLineSmaCrossSigFinitePoints(points)).toEqual([
      { x: 0, close: 1 },
      { x: 3, close: 4 },
    ]);
  });

  it('returns empty for null and non-array', () => {
    expect(getLineSmaCrossSigFinitePoints(null)).toEqual([]);
    expect(getLineSmaCrossSigFinitePoints(undefined)).toEqual([]);
    expect(
      getLineSmaCrossSigFinitePoints(
        // @ts-expect-error -- intentionally bad
        'oops',
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineSmaCrossSigLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineSmaCrossSigLength(14.7, 14)).toBe(14);
    expect(normalizeLineSmaCrossSigLength(0, 14)).toBe(14);
    expect(normalizeLineSmaCrossSigLength(NaN, 14)).toBe(14);
  });
});

describe('applyLineSmaCrossSigSma', () => {
  it('CONST returns constant', () => {
    const values: Array<number | null> = Array.from({ length: 30 }, () => 50);
    const sma = applyLineSmaCrossSigSma(values, PERIOD);
    for (let i = SMA_WARMUP; i < 30; i += 1) expect(sma[i]).toBe(50);
  });

  it('LINEAR returns i - (L-1)/2', () => {
    const values: Array<number | null> = Array.from(
      { length: 30 },
      (_, i) => i,
    );
    const sma = applyLineSmaCrossSigSma(values, PERIOD);
    for (let i = SMA_WARMUP; i < 30; i += 1) {
      expect(sma[i] as number).toBeCloseTo(i - LAG, 9);
    }
  });

  it('length=1 returns identity', () => {
    const sma = applyLineSmaCrossSigSma([1, 2, 3], 1);
    expect(sma).toEqual([1, 2, 3]);
  });
});

describe('computeLineSmaCrossSig', () => {
  it('CONST close=K returns sma=K and signal=K from warmup', () => {
    const data = buildConst(40, 50);
    const out = computeLineSmaCrossSig(data);
    expect(out.sma[SMA_WARMUP] as number).toBeCloseTo(50, 9);
    expect(out.signal[WARMUP] as number).toBeCloseTo(50, 9);
  });

  it('LINEAR UP: sma - signal = +1', () => {
    const data = buildLinearUp(40);
    const out = computeLineSmaCrossSig(data);
    for (let i = WARMUP; i < 40; i += 1) {
      const m = out.sma[i] as number;
      const s = out.signal[i] as number;
      expect(m - s).toBeCloseTo(DIFF, 9);
    }
  });

  it('LINEAR DOWN: sma - signal = -1', () => {
    const data = buildLinearDown(40);
    const out = computeLineSmaCrossSig(data);
    for (let i = WARMUP; i < 40; i += 1) {
      const m = out.sma[i] as number;
      const s = out.signal[i] as number;
      expect(m - s).toBeCloseTo(-DIFF, 9);
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineSmaCrossSig([])).toEqual({ sma: [], signal: [] });
  });
});

describe('classifyLineSmaCrossSigRegime', () => {
  it('null -> none', () => {
    expect(classifyLineSmaCrossSigRegime(null, 50)).toBe('none');
  });
  it('sma >= signal -> bullish', () => {
    expect(classifyLineSmaCrossSigRegime(50, 50)).toBe('bullish');
    expect(classifyLineSmaCrossSigRegime(60, 50)).toBe('bullish');
  });
  it('sma < signal -> bearish', () => {
    expect(classifyLineSmaCrossSigRegime(40, 50)).toBe('bearish');
  });
});

describe('classifyLineSmaCrossSigBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineSmaCrossSigBias(60, 50)).toBe('up');
    expect(classifyLineSmaCrossSigBias(40, 50)).toBe('down');
    expect(classifyLineSmaCrossSigBias(50, 50)).toBe('flat');
    expect(classifyLineSmaCrossSigBias(null, 50)).toBe('none');
  });
});

describe('detectLineSmaCrossSigCrosses', () => {
  it('detects bullish trigger', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const sma: Array<number | null> = [4, 5, 7, 8];
    const signal: Array<number | null> = [5, 5, 6, 6];
    const out = detectLineSmaCrossSigCrosses(series, sma, signal);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
  });

  it('detects bearish trigger', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const sma: Array<number | null> = [8, 7, 5, 4];
    const signal: Array<number | null> = [6, 6, 6, 6];
    const out = detectLineSmaCrossSigCrosses(series, sma, signal);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
  });

  it('does not fire on null values', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const sma: Array<number | null> = [null, null, 5, 7];
    const signal: Array<number | null> = [null, null, 4, 4];
    expect(detectLineSmaCrossSigCrosses(series, sma, signal)).toHaveLength(0);
  });

  it('does not double-fire', () => {
    const series = Array.from({ length: 5 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const sma: Array<number | null> = [4, 5, 6, 7, 8];
    const signal: Array<number | null> = [5, 4, 4, 4, 4];
    expect(detectLineSmaCrossSigCrosses(series, sma, signal)).toHaveLength(1);
  });
});

describe('runLineSmaCrossSig CONST K', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST close=${K}: sma=K, signal=K, all bullish, 0 triggers`, () => {
      const data = buildConst(60, K);
      const run = runLineSmaCrossSig(data);
      expect(run.period).toBe(PERIOD);
      expect(run.signalLength).toBe(SIGNAL);
      for (let i = 0; i < WARMUP; i += 1) {
        expect(run.signalValues[i]).toBeNull();
      }
      for (let i = WARMUP; i < 60; i += 1) {
        expect(run.smaValues[i] as number).toBeCloseTo(K, 9);
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

describe('runLineSmaCrossSig LINEAR UP', () => {
  it('LINEAR UP: sma > signal by 1, all bullish, 0 triggers', () => {
    const data = buildLinearUp(60);
    const run = runLineSmaCrossSig(data);
    for (let i = WARMUP; i < 60; i += 1) {
      expect(run.samples[i]?.regime).toBe('bullish');
      const m = run.smaValues[i] as number;
      const s = run.signalValues[i] as number;
      expect(m - s).toBeCloseTo(DIFF, 9);
    }
    expect(run.bullishCount).toBe(60 - WARMUP);
    expect(run.bearishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineSmaCrossSig LINEAR DOWN', () => {
  it('LINEAR DOWN: sma < signal by 1, all bearish, 0 triggers', () => {
    const data = buildLinearDown(60);
    const run = runLineSmaCrossSig(data);
    for (let i = WARMUP; i < 60; i += 1) {
      expect(run.samples[i]?.regime).toBe('bearish');
      const m = run.smaValues[i] as number;
      const s = run.signalValues[i] as number;
      expect(m - s).toBeCloseTo(-DIFF, 9);
    }
    expect(run.bearishCount).toBe(60 - WARMUP);
    expect(run.bullishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineSmaCrossSig misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineSmaCrossSigPoint[] = [
      { x: 2, close: 1 },
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    const run = runLineSmaCrossSig(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConst(10, 50);
    const run = runLineSmaCrossSig(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineSmaCrossSig([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom tuning', () => {
    const data = buildLinearUp(60);
    const run = runLineSmaCrossSig(data, { period: 7, signalLength: 2 });
    expect(run.period).toBe(7);
    expect(run.signalLength).toBe(2);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(60);
    const run = runLineSmaCrossSig(data);
    expect(run.bullishCount + run.bearishCount + run.noneCount).toBe(60);
  });
});

describe('computeLineSmaCrossSigLayout', () => {
  it('renders SVG paths for CONST K=50', () => {
    const data = buildConst(60, 50);
    const layout = computeLineSmaCrossSigLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(60);
    expect(layout.smaPath).toContain('M ');
    expect(layout.signalPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineSmaCrossSigLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.smaPath).toBe('');
    expect(layout.signalPath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineSmaCrossSigLayout({
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
    const layout = computeLineSmaCrossSigLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });
});

describe('describeLineSmaCrossSigChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineSmaCrossSigChart([])).toBe('No data');
  });

  it('mentions bar count, period, signal', () => {
    const desc = describeLineSmaCrossSigChart(buildLinearUp(60));
    expect(desc).toContain('60 bars');
    expect(desc).toContain('period 14');
    expect(desc).toContain('signalLength 3');
    expect(desc).toContain('bias coloring');
  });
});

describe('<ChartLineSmaCrossSig /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineSmaCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-sma-cross-sig"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-period')).toBe(String(PERIOD));
    expect(root?.getAttribute('data-signal-length')).toBe(String(SIGNAL));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(<ChartLineSmaCrossSig data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-sma-cross-sig-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders SMA and signal paths', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineSmaCrossSig data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-sma-cross-sig-sma-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-sma-cross-sig-signal-path"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineSmaCrossSig data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-sma-cross-sig-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineSmaCrossSig data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-sma-cross-sig-badge"]',
    );
    expect(badge?.textContent).toContain('period 14');
    expect(badge?.textContent).toContain('signal 3');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineSmaCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-sma-cross-sig"]',
    );
    expect(root?.getAttribute('aria-label')).toBe('SMA-over-Signal chart');
  });

  it('exposes data-*-count counters', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineSmaCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-sma-cross-sig"]',
    );
    expect(root?.getAttribute('data-bullish-count')).toBe(
      String(60 - WARMUP),
    );
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineSmaCrossSig data={data} hiddenSeries={['signal']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-sma-cross-sig-signal-path"]',
      ),
    ).toBeNull();
  });
});
