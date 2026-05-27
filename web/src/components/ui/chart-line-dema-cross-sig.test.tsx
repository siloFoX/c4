import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineDemaCrossSig,
  DEFAULT_CHART_LINE_DEMA_CROSS_SIG_HEIGHT,
  DEFAULT_CHART_LINE_DEMA_CROSS_SIG_PADDING,
  DEFAULT_CHART_LINE_DEMA_CROSS_SIG_PANEL_GAP,
  DEFAULT_CHART_LINE_DEMA_CROSS_SIG_PERIOD,
  DEFAULT_CHART_LINE_DEMA_CROSS_SIG_SIGNAL_LENGTH,
  DEFAULT_CHART_LINE_DEMA_CROSS_SIG_WIDTH,
  applyLineDemaCrossSigDema,
  applyLineDemaCrossSigSma,
  applyLineDemaCrossSigSmaSeededEma,
  classifyLineDemaCrossSigBias,
  classifyLineDemaCrossSigRegime,
  computeLineDemaCrossSig,
  computeLineDemaCrossSigLayout,
  describeLineDemaCrossSigChart,
  detectLineDemaCrossSigCrosses,
  getLineDemaCrossSigFinitePoints,
  normalizeLineDemaCrossSigLength,
  runLineDemaCrossSig,
  type ChartLineDemaCrossSigPoint,
} from './chart-line-dema-cross-sig';

const PERIOD = 14;
const SIGNAL = 3;
const DEMA_WARMUP = 2 * (PERIOD - 1); // 26 (first valid dema)
const WARMUP = DEMA_WARMUP + SIGNAL - 1; // 28 (first valid signal)

const buildConst = (n: number, k: number): ChartLineDemaCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: k }));

const buildLinearUp = (n: number): ChartLineDemaCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: i }));

const buildLinearDown = (n: number): ChartLineDemaCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: -i }));

describe('ChartLineDemaCrossSig defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_DEMA_CROSS_SIG_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_DEMA_CROSS_SIG_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_DEMA_CROSS_SIG_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_DEMA_CROSS_SIG_PANEL_GAP).toBe(12);
  });

  it('exports canonical DEMA tuning', () => {
    expect(DEFAULT_CHART_LINE_DEMA_CROSS_SIG_PERIOD).toBe(14);
    expect(DEFAULT_CHART_LINE_DEMA_CROSS_SIG_SIGNAL_LENGTH).toBe(3);
  });
});

describe('getLineDemaCrossSigFinitePoints', () => {
  it('filters finite x and close', () => {
    const points = [
      { x: 0, close: 1 },
      { x: NaN, close: 2 },
      { x: 2, close: Infinity },
      { x: 3, close: 4 },
    ];
    expect(getLineDemaCrossSigFinitePoints(points)).toEqual([
      { x: 0, close: 1 },
      { x: 3, close: 4 },
    ]);
  });

  it('returns empty for null and non-array', () => {
    expect(getLineDemaCrossSigFinitePoints(null)).toEqual([]);
    expect(getLineDemaCrossSigFinitePoints(undefined)).toEqual([]);
    expect(
      getLineDemaCrossSigFinitePoints(
        // @ts-expect-error -- intentionally bad
        'oops',
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineDemaCrossSigLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineDemaCrossSigLength(14.7, 14)).toBe(14);
    expect(normalizeLineDemaCrossSigLength(0, 14)).toBe(14);
    expect(normalizeLineDemaCrossSigLength(NaN, 14)).toBe(14);
  });
});

describe('applyLineDemaCrossSigSmaSeededEma', () => {
  it('LINEAR settles at i - (L-1)/2', () => {
    const values: Array<number | null> = Array.from(
      { length: 30 },
      (_, i) => i,
    );
    const ema = applyLineDemaCrossSigSmaSeededEma(values, PERIOD);
    for (let i = PERIOD - 1; i < 30; i += 1) {
      expect(ema[i] as number).toBeCloseTo(i - (PERIOD - 1) / 2, 9);
    }
  });
});

describe('applyLineDemaCrossSigSma', () => {
  it('CONST returns constant', () => {
    const values: Array<number | null> = Array.from({ length: 10 }, () => 7);
    const sma = applyLineDemaCrossSigSma(values, SIGNAL);
    for (let i = SIGNAL - 1; i < 10; i += 1) expect(sma[i]).toBe(7);
  });
});

describe('applyLineDemaCrossSigDema', () => {
  it('CONST close=K returns DEMA=K from warmup', () => {
    for (const K of [0, 1, 50, 200, 1234]) {
      const closes = Array.from({ length: 60 }, () => K);
      const dema = applyLineDemaCrossSigDema(closes, PERIOD);
      for (let i = 0; i < DEMA_WARMUP; i += 1) expect(dema[i]).toBeNull();
      for (let i = DEMA_WARMUP; i < 60; i += 1) {
        expect(dema[i] as number).toBeCloseTo(K, 9);
      }
    }
  });

  it('LINEAR UP returns DEMA=i with zero lag (Mulloy identity)', () => {
    const closes = Array.from({ length: 60 }, (_, i) => i);
    const dema = applyLineDemaCrossSigDema(closes, PERIOD);
    for (let i = DEMA_WARMUP; i < 60; i += 1) {
      expect(dema[i] as number).toBeCloseTo(i, 9);
    }
  });

  it('LINEAR DOWN returns DEMA=-i', () => {
    const closes = Array.from({ length: 60 }, (_, i) => -i);
    const dema = applyLineDemaCrossSigDema(closes, PERIOD);
    for (let i = DEMA_WARMUP; i < 60; i += 1) {
      expect(dema[i] as number).toBeCloseTo(-i, 9);
    }
  });

  it('returns nulls when period < 1', () => {
    expect(
      applyLineDemaCrossSigDema([1, 2, 3, 4, 5], 0).every((v) => v === null),
    ).toBe(true);
  });
});

describe('computeLineDemaCrossSig', () => {
  it('CONST close=K returns dema=K and signal=K from warmup', () => {
    const data = buildConst(60, 50);
    const out = computeLineDemaCrossSig(data);
    expect(out.dema[DEMA_WARMUP] as number).toBeCloseTo(50, 9);
    expect(out.signal[WARMUP] as number).toBeCloseTo(50, 9);
  });

  it('LINEAR UP: dema=i, signal=i-1, dema-signal=+1', () => {
    const data = buildLinearUp(60);
    const out = computeLineDemaCrossSig(data);
    for (let i = WARMUP; i < 60; i += 1) {
      const d = out.dema[i] as number;
      const s = out.signal[i] as number;
      expect(d).toBeCloseTo(i, 9);
      expect(s).toBeCloseTo(i - 1, 9);
      expect(d - s).toBeCloseTo(1, 9);
    }
  });

  it('LINEAR DOWN: dema=-i, signal=-i+1, dema-signal=-1', () => {
    const data = buildLinearDown(60);
    const out = computeLineDemaCrossSig(data);
    for (let i = WARMUP; i < 60; i += 1) {
      const d = out.dema[i] as number;
      const s = out.signal[i] as number;
      expect(d).toBeCloseTo(-i, 9);
      expect(s).toBeCloseTo(-i + 1, 9);
      expect(d - s).toBeCloseTo(-1, 9);
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineDemaCrossSig([])).toEqual({ dema: [], signal: [] });
  });
});

describe('classifyLineDemaCrossSigRegime', () => {
  it('null -> none', () => {
    expect(classifyLineDemaCrossSigRegime(null, 50)).toBe('none');
  });
  it('dema >= signal -> bullish', () => {
    expect(classifyLineDemaCrossSigRegime(50, 50)).toBe('bullish');
    expect(classifyLineDemaCrossSigRegime(60, 50)).toBe('bullish');
  });
  it('dema < signal -> bearish', () => {
    expect(classifyLineDemaCrossSigRegime(40, 50)).toBe('bearish');
  });
});

describe('classifyLineDemaCrossSigBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineDemaCrossSigBias(60, 50)).toBe('up');
    expect(classifyLineDemaCrossSigBias(40, 50)).toBe('down');
    expect(classifyLineDemaCrossSigBias(50, 50)).toBe('flat');
    expect(classifyLineDemaCrossSigBias(null, 50)).toBe('none');
  });
});

describe('detectLineDemaCrossSigCrosses', () => {
  it('detects bullish trigger', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const dema: Array<number | null> = [4, 5, 7, 8];
    const signal: Array<number | null> = [5, 5, 6, 6];
    const out = detectLineDemaCrossSigCrosses(series, dema, signal);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
  });

  it('detects bearish trigger', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const dema: Array<number | null> = [8, 7, 5, 4];
    const signal: Array<number | null> = [6, 6, 6, 6];
    const out = detectLineDemaCrossSigCrosses(series, dema, signal);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
  });

  it('does not fire on null values', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const dema: Array<number | null> = [null, null, 5, 7];
    const signal: Array<number | null> = [null, null, 4, 4];
    expect(detectLineDemaCrossSigCrosses(series, dema, signal)).toHaveLength(
      0,
    );
  });

  it('does not double-fire', () => {
    const series = Array.from({ length: 5 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const dema: Array<number | null> = [4, 5, 6, 7, 8];
    const signal: Array<number | null> = [5, 4, 4, 4, 4];
    expect(detectLineDemaCrossSigCrosses(series, dema, signal)).toHaveLength(
      1,
    );
  });
});

describe('runLineDemaCrossSig CONST K', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST close=${K}: dema=K, signal=K, all bullish, 0 triggers`, () => {
      const data = buildConst(60, K);
      const run = runLineDemaCrossSig(data);
      expect(run.period).toBe(PERIOD);
      expect(run.signalLength).toBe(SIGNAL);
      for (let i = 0; i < WARMUP; i += 1) {
        expect(run.signalValues[i]).toBeNull();
      }
      for (let i = WARMUP; i < 60; i += 1) {
        expect(run.demaValues[i] as number).toBeCloseTo(K, 9);
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

describe('runLineDemaCrossSig LINEAR UP', () => {
  it('LINEAR UP: dema-signal=+1, all bullish, 0 triggers', () => {
    const data = buildLinearUp(60);
    const run = runLineDemaCrossSig(data);
    for (let i = WARMUP; i < 60; i += 1) {
      expect(run.samples[i]?.regime).toBe('bullish');
      const d = run.demaValues[i] as number;
      const s = run.signalValues[i] as number;
      expect(d - s).toBeCloseTo(1, 9);
    }
    expect(run.bullishCount).toBe(60 - WARMUP);
    expect(run.bearishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineDemaCrossSig LINEAR DOWN', () => {
  it('LINEAR DOWN: dema-signal=-1, all bearish, 0 triggers', () => {
    const data = buildLinearDown(60);
    const run = runLineDemaCrossSig(data);
    for (let i = WARMUP; i < 60; i += 1) {
      expect(run.samples[i]?.regime).toBe('bearish');
      const d = run.demaValues[i] as number;
      const s = run.signalValues[i] as number;
      expect(d - s).toBeCloseTo(-1, 9);
    }
    expect(run.bearishCount).toBe(60 - WARMUP);
    expect(run.bullishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineDemaCrossSig misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineDemaCrossSigPoint[] = [
      { x: 2, close: 1 },
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    const run = runLineDemaCrossSig(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConst(20, 50);
    const run = runLineDemaCrossSig(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineDemaCrossSig([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom tuning', () => {
    const data = buildLinearUp(60);
    const run = runLineDemaCrossSig(data, { period: 7, signalLength: 2 });
    expect(run.period).toBe(7);
    expect(run.signalLength).toBe(2);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(60);
    const run = runLineDemaCrossSig(data);
    expect(run.bullishCount + run.bearishCount + run.noneCount).toBe(60);
  });
});

describe('computeLineDemaCrossSigLayout', () => {
  it('renders SVG paths for CONST K=50', () => {
    const data = buildConst(60, 50);
    const layout = computeLineDemaCrossSigLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(60);
    expect(layout.demaPath).toContain('M ');
    expect(layout.signalPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineDemaCrossSigLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.demaPath).toBe('');
    expect(layout.signalPath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineDemaCrossSigLayout({
      data: buildLinearUp(60),
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
    const layout = computeLineDemaCrossSigLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });
});

describe('describeLineDemaCrossSigChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineDemaCrossSigChart([])).toBe('No data');
  });

  it('mentions bar count, period, signal', () => {
    const desc = describeLineDemaCrossSigChart(buildLinearUp(60));
    expect(desc).toContain('60 bars');
    expect(desc).toContain('period 14');
    expect(desc).toContain('signalLength 3');
    expect(desc).toContain('bias coloring');
  });
});

describe('<ChartLineDemaCrossSig /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineDemaCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-dema-cross-sig"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-period')).toBe(String(PERIOD));
    expect(root?.getAttribute('data-signal-length')).toBe(String(SIGNAL));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(<ChartLineDemaCrossSig data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-dema-cross-sig-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders DEMA and signal paths', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineDemaCrossSig data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-dema-cross-sig-dema-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-dema-cross-sig-signal-path"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineDemaCrossSig data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dema-cross-sig-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineDemaCrossSig data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-dema-cross-sig-badge"]',
    );
    expect(badge?.textContent).toContain('period 14');
    expect(badge?.textContent).toContain('signal 3');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineDemaCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-dema-cross-sig"]',
    );
    expect(root?.getAttribute('aria-label')).toBe('DEMA-over-Signal chart');
  });

  it('exposes data-*-count counters', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineDemaCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-dema-cross-sig"]',
    );
    expect(root?.getAttribute('data-bullish-count')).toBe(
      String(60 - WARMUP),
    );
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineDemaCrossSig data={data} hiddenSeries={['signal']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dema-cross-sig-signal-path"]',
      ),
    ).toBeNull();
  });
});
