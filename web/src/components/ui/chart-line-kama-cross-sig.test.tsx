import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineKamaCrossSig,
  DEFAULT_CHART_LINE_KAMA_CROSS_SIG_EFFICIENCY_PERIOD,
  DEFAULT_CHART_LINE_KAMA_CROSS_SIG_FAST_PERIOD,
  DEFAULT_CHART_LINE_KAMA_CROSS_SIG_HEIGHT,
  DEFAULT_CHART_LINE_KAMA_CROSS_SIG_PADDING,
  DEFAULT_CHART_LINE_KAMA_CROSS_SIG_PANEL_GAP,
  DEFAULT_CHART_LINE_KAMA_CROSS_SIG_SIGNAL_LENGTH,
  DEFAULT_CHART_LINE_KAMA_CROSS_SIG_SLOW_PERIOD,
  DEFAULT_CHART_LINE_KAMA_CROSS_SIG_WIDTH,
  applyLineKamaCrossSigKama,
  applyLineKamaCrossSigSma,
  classifyLineKamaCrossSigBias,
  classifyLineKamaCrossSigRegime,
  computeLineKamaCrossSig,
  computeLineKamaCrossSigLayout,
  describeLineKamaCrossSigChart,
  detectLineKamaCrossSigCrosses,
  getLineKamaCrossSigFinitePoints,
  normalizeLineKamaCrossSigLength,
  runLineKamaCrossSig,
  type ChartLineKamaCrossSigPoint,
} from './chart-line-kama-cross-sig';

const EFF = 10;
const FAST = 2;
const SLOW = 30;
const SIGNAL = 3;
const KAMA_WARMUP = EFF - 1; // 9 (first valid kama)
const WARMUP = KAMA_WARMUP + SIGNAL - 1; // 11 (first valid signal)
// Steady-state assertion threshold for LINEAR UP/DOWN convergence.
const STEADY_FROM = 50;

const buildConst = (n: number, k: number): ChartLineKamaCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: k }));

const buildLinearUp = (n: number): ChartLineKamaCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: i }));

const buildLinearDown = (n: number): ChartLineKamaCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: -i }));

describe('ChartLineKamaCrossSig defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_KAMA_CROSS_SIG_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_KAMA_CROSS_SIG_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_KAMA_CROSS_SIG_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_KAMA_CROSS_SIG_PANEL_GAP).toBe(12);
  });

  it('exports canonical KAMA tuning', () => {
    expect(DEFAULT_CHART_LINE_KAMA_CROSS_SIG_EFFICIENCY_PERIOD).toBe(10);
    expect(DEFAULT_CHART_LINE_KAMA_CROSS_SIG_FAST_PERIOD).toBe(2);
    expect(DEFAULT_CHART_LINE_KAMA_CROSS_SIG_SLOW_PERIOD).toBe(30);
    expect(DEFAULT_CHART_LINE_KAMA_CROSS_SIG_SIGNAL_LENGTH).toBe(3);
  });
});

describe('getLineKamaCrossSigFinitePoints', () => {
  it('filters finite x and close', () => {
    const points = [
      { x: 0, close: 1 },
      { x: NaN, close: 2 },
      { x: 2, close: Infinity },
      { x: 3, close: 4 },
    ];
    expect(getLineKamaCrossSigFinitePoints(points)).toEqual([
      { x: 0, close: 1 },
      { x: 3, close: 4 },
    ]);
  });

  it('returns empty for null and non-array', () => {
    expect(getLineKamaCrossSigFinitePoints(null)).toEqual([]);
    expect(getLineKamaCrossSigFinitePoints(undefined)).toEqual([]);
    expect(
      getLineKamaCrossSigFinitePoints(
        // @ts-expect-error -- intentionally bad
        'oops',
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineKamaCrossSigLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineKamaCrossSigLength(10.7, 10)).toBe(10);
    expect(normalizeLineKamaCrossSigLength(0, 10)).toBe(10);
    expect(normalizeLineKamaCrossSigLength(NaN, 10)).toBe(10);
  });
});

describe('applyLineKamaCrossSigSma', () => {
  it('CONST returns constant', () => {
    const values: Array<number | null> = Array.from({ length: 10 }, () => 7);
    const sma = applyLineKamaCrossSigSma(values, SIGNAL);
    for (let i = SIGNAL - 1; i < 10; i += 1) expect(sma[i]).toBe(7);
  });
});

describe('applyLineKamaCrossSigKama', () => {
  it('CONST close=K returns KAMA=K from warmup', () => {
    for (const K of [0, 1, 50, 200, 1234]) {
      const closes = Array.from({ length: 80 }, () => K);
      const kama = applyLineKamaCrossSigKama(closes, EFF, FAST, SLOW);
      for (let i = 0; i < KAMA_WARMUP; i += 1) expect(kama[i]).toBeNull();
      for (let i = KAMA_WARMUP; i < 80; i += 1) {
        expect(kama[i] as number).toBeCloseTo(K, 9);
      }
    }
  });

  it('LINEAR UP: KAMA converges to i - 1.25 lag', () => {
    const closes = Array.from({ length: 80 }, (_, i) => i);
    const kama = applyLineKamaCrossSigKama(closes, EFF, FAST, SLOW);
    for (let i = STEADY_FROM; i < 80; i += 1) {
      expect(kama[i] as number).toBeCloseTo(i - 1.25, 4);
    }
  });

  it('LINEAR DOWN: KAMA converges to -i + 1.25', () => {
    const closes = Array.from({ length: 80 }, (_, i) => -i);
    const kama = applyLineKamaCrossSigKama(closes, EFF, FAST, SLOW);
    for (let i = STEADY_FROM; i < 80; i += 1) {
      expect(kama[i] as number).toBeCloseTo(-i + 1.25, 4);
    }
  });

  it('returns nulls when efficiencyPeriod < 1', () => {
    expect(
      applyLineKamaCrossSigKama([1, 2, 3, 4, 5], 0, FAST, SLOW).every(
        (v) => v === null,
      ),
    ).toBe(true);
  });

  it('returns nulls when series shorter than efficiencyPeriod', () => {
    expect(
      applyLineKamaCrossSigKama([1, 2, 3], EFF, FAST, SLOW).every(
        (v) => v === null,
      ),
    ).toBe(true);
  });
});

describe('computeLineKamaCrossSig', () => {
  it('CONST close=K returns kama=K and signal=K from warmup', () => {
    const data = buildConst(80, 50);
    const out = computeLineKamaCrossSig(data);
    expect(out.kama[KAMA_WARMUP] as number).toBeCloseTo(50, 9);
    expect(out.signal[WARMUP] as number).toBeCloseTo(50, 9);
  });

  it('LINEAR UP: kama > signal in steady state', () => {
    const data = buildLinearUp(80);
    const out = computeLineKamaCrossSig(data);
    for (let i = STEADY_FROM; i < 80; i += 1) {
      const k = out.kama[i] as number;
      const s = out.signal[i] as number;
      expect(k - s).toBeCloseTo(1, 4);
    }
  });

  it('LINEAR DOWN: kama < signal in steady state', () => {
    const data = buildLinearDown(80);
    const out = computeLineKamaCrossSig(data);
    for (let i = STEADY_FROM; i < 80; i += 1) {
      const k = out.kama[i] as number;
      const s = out.signal[i] as number;
      expect(k - s).toBeCloseTo(-1, 4);
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineKamaCrossSig([])).toEqual({ kama: [], signal: [] });
  });
});

describe('classifyLineKamaCrossSigRegime', () => {
  it('null -> none', () => {
    expect(classifyLineKamaCrossSigRegime(null, 50)).toBe('none');
  });
  it('kama >= signal -> bullish', () => {
    expect(classifyLineKamaCrossSigRegime(50, 50)).toBe('bullish');
    expect(classifyLineKamaCrossSigRegime(60, 50)).toBe('bullish');
  });
  it('kama < signal -> bearish', () => {
    expect(classifyLineKamaCrossSigRegime(40, 50)).toBe('bearish');
  });
});

describe('classifyLineKamaCrossSigBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineKamaCrossSigBias(60, 50)).toBe('up');
    expect(classifyLineKamaCrossSigBias(40, 50)).toBe('down');
    expect(classifyLineKamaCrossSigBias(50, 50)).toBe('flat');
    expect(classifyLineKamaCrossSigBias(null, 50)).toBe('none');
  });
});

describe('detectLineKamaCrossSigCrosses', () => {
  it('detects bullish trigger', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const kama: Array<number | null> = [4, 5, 7, 8];
    const signal: Array<number | null> = [5, 5, 6, 6];
    const out = detectLineKamaCrossSigCrosses(series, kama, signal);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
  });

  it('detects bearish trigger', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const kama: Array<number | null> = [8, 7, 5, 4];
    const signal: Array<number | null> = [6, 6, 6, 6];
    const out = detectLineKamaCrossSigCrosses(series, kama, signal);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
  });

  it('does not fire on null values', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const kama: Array<number | null> = [null, null, 5, 7];
    const signal: Array<number | null> = [null, null, 4, 4];
    expect(detectLineKamaCrossSigCrosses(series, kama, signal)).toHaveLength(
      0,
    );
  });

  it('does not double-fire', () => {
    const series = Array.from({ length: 5 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const kama: Array<number | null> = [4, 5, 6, 7, 8];
    const signal: Array<number | null> = [5, 4, 4, 4, 4];
    expect(detectLineKamaCrossSigCrosses(series, kama, signal)).toHaveLength(
      1,
    );
  });
});

describe('runLineKamaCrossSig CONST K', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST close=${K}: kama=K, signal=K, all bullish, 0 triggers`, () => {
      const data = buildConst(80, K);
      const run = runLineKamaCrossSig(data);
      expect(run.efficiencyPeriod).toBe(EFF);
      expect(run.fastPeriod).toBe(FAST);
      expect(run.slowPeriod).toBe(SLOW);
      expect(run.signalLength).toBe(SIGNAL);
      for (let i = 0; i < WARMUP; i += 1) {
        expect(run.signalValues[i]).toBeNull();
      }
      for (let i = WARMUP; i < 80; i += 1) {
        expect(run.kamaValues[i] as number).toBeCloseTo(K, 9);
        expect(run.signalValues[i] as number).toBeCloseTo(K, 9);
        expect(run.samples[i]?.regime).toBe('bullish');
      }
      expect(run.bullishCount).toBe(80 - WARMUP);
      expect(run.bearishCount).toBe(0);
      expect(run.noneCount).toBe(WARMUP);
      expect(run.crosses).toHaveLength(0);
      expect(run.ok).toBe(true);
    });
  }
});

describe('runLineKamaCrossSig LINEAR UP', () => {
  it('LINEAR UP: KAMA leads signal, all bullish, 0 triggers', () => {
    const data = buildLinearUp(80);
    const run = runLineKamaCrossSig(data);
    for (let i = WARMUP; i < 80; i += 1) {
      expect(run.samples[i]?.regime).toBe('bullish');
    }
    expect(run.bullishCount).toBe(80 - WARMUP);
    expect(run.bearishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineKamaCrossSig LINEAR DOWN', () => {
  it('LINEAR DOWN: KAMA lags signal, all bearish, 0 triggers', () => {
    const data = buildLinearDown(80);
    const run = runLineKamaCrossSig(data);
    for (let i = WARMUP; i < 80; i += 1) {
      expect(run.samples[i]?.regime).toBe('bearish');
    }
    expect(run.bearishCount).toBe(80 - WARMUP);
    expect(run.bullishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineKamaCrossSig misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineKamaCrossSigPoint[] = [
      { x: 2, close: 1 },
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    const run = runLineKamaCrossSig(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConst(8, 50);
    const run = runLineKamaCrossSig(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineKamaCrossSig([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom tuning', () => {
    const data = buildLinearUp(80);
    const run = runLineKamaCrossSig(data, {
      efficiencyPeriod: 5,
      fastPeriod: 2,
      slowPeriod: 20,
      signalLength: 2,
    });
    expect(run.efficiencyPeriod).toBe(5);
    expect(run.fastPeriod).toBe(2);
    expect(run.slowPeriod).toBe(20);
    expect(run.signalLength).toBe(2);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(80);
    const run = runLineKamaCrossSig(data);
    expect(run.bullishCount + run.bearishCount + run.noneCount).toBe(80);
  });
});

describe('computeLineKamaCrossSigLayout', () => {
  it('renders SVG paths for CONST K=50', () => {
    const data = buildConst(80, 50);
    const layout = computeLineKamaCrossSigLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(80);
    expect(layout.kamaPath).toContain('M ');
    expect(layout.signalPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineKamaCrossSigLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.kamaPath).toBe('');
    expect(layout.signalPath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineKamaCrossSigLayout({
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
    const data = buildConst(60, 100);
    const layout = computeLineKamaCrossSigLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });
});

describe('describeLineKamaCrossSigChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineKamaCrossSigChart([])).toBe('No data');
  });

  it('mentions all four tuning parameters', () => {
    const desc = describeLineKamaCrossSigChart(buildLinearUp(80));
    expect(desc).toContain('80 bars');
    expect(desc).toContain('efficiencyPeriod 10');
    expect(desc).toContain('fastPeriod 2');
    expect(desc).toContain('slowPeriod 30');
    expect(desc).toContain('signalLength 3');
    expect(desc).toContain('bias coloring');
  });
});

describe('<ChartLineKamaCrossSig /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(80);
    const { container } = render(<ChartLineKamaCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-kama-cross-sig"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-efficiency-period')).toBe(String(EFF));
    expect(root?.getAttribute('data-fast-period')).toBe(String(FAST));
    expect(root?.getAttribute('data-slow-period')).toBe(String(SLOW));
    expect(root?.getAttribute('data-signal-length')).toBe(String(SIGNAL));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(<ChartLineKamaCrossSig data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-kama-cross-sig-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders KAMA and signal paths', () => {
    const data = buildLinearUp(80);
    const { container } = render(<ChartLineKamaCrossSig data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-kama-cross-sig-kama-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-kama-cross-sig-signal-path"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineKamaCrossSig data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kama-cross-sig-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildLinearUp(80);
    const { container } = render(<ChartLineKamaCrossSig data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-kama-cross-sig-badge"]',
    );
    expect(badge?.textContent).toContain('eff 10');
    expect(badge?.textContent).toContain('fast 2');
    expect(badge?.textContent).toContain('slow 30');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(80);
    const { container } = render(<ChartLineKamaCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-kama-cross-sig"]',
    );
    expect(root?.getAttribute('aria-label')).toBe('KAMA-over-Signal chart');
  });

  it('exposes data-*-count counters', () => {
    const data = buildLinearUp(80);
    const { container } = render(<ChartLineKamaCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-kama-cross-sig"]',
    );
    expect(root?.getAttribute('data-bullish-count')).toBe(
      String(80 - WARMUP),
    );
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineKamaCrossSig data={data} hiddenSeries={['signal']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kama-cross-sig-signal-path"]',
      ),
    ).toBeNull();
  });
});
