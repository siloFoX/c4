import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineTemaCrossSig,
  DEFAULT_CHART_LINE_TEMA_CROSS_SIG_HEIGHT,
  DEFAULT_CHART_LINE_TEMA_CROSS_SIG_PADDING,
  DEFAULT_CHART_LINE_TEMA_CROSS_SIG_PANEL_GAP,
  DEFAULT_CHART_LINE_TEMA_CROSS_SIG_PERIOD,
  DEFAULT_CHART_LINE_TEMA_CROSS_SIG_SIGNAL_LENGTH,
  DEFAULT_CHART_LINE_TEMA_CROSS_SIG_WIDTH,
  applyLineTemaCrossSigSma,
  applyLineTemaCrossSigSmaSeededEma,
  applyLineTemaCrossSigTema,
  classifyLineTemaCrossSigBias,
  classifyLineTemaCrossSigRegime,
  computeLineTemaCrossSig,
  computeLineTemaCrossSigLayout,
  describeLineTemaCrossSigChart,
  detectLineTemaCrossSigCrosses,
  getLineTemaCrossSigFinitePoints,
  normalizeLineTemaCrossSigLength,
  runLineTemaCrossSig,
  type ChartLineTemaCrossSigPoint,
} from './chart-line-tema-cross-sig';

const PERIOD = 14;
const SIGNAL = 3;
const TEMA_WARMUP = 3 * (PERIOD - 1); // 39 (first valid tema)
const WARMUP = TEMA_WARMUP + SIGNAL - 1; // 41 (first valid signal)

const buildConst = (n: number, k: number): ChartLineTemaCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: k }));

const buildLinearUp = (n: number): ChartLineTemaCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: i }));

const buildLinearDown = (n: number): ChartLineTemaCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: -i }));

describe('ChartLineTemaCrossSig defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_TEMA_CROSS_SIG_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_TEMA_CROSS_SIG_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_TEMA_CROSS_SIG_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_TEMA_CROSS_SIG_PANEL_GAP).toBe(12);
  });

  it('exports canonical TEMA tuning', () => {
    expect(DEFAULT_CHART_LINE_TEMA_CROSS_SIG_PERIOD).toBe(14);
    expect(DEFAULT_CHART_LINE_TEMA_CROSS_SIG_SIGNAL_LENGTH).toBe(3);
  });
});

describe('getLineTemaCrossSigFinitePoints', () => {
  it('filters finite x and close', () => {
    const points = [
      { x: 0, close: 1 },
      { x: NaN, close: 2 },
      { x: 2, close: Infinity },
      { x: 3, close: 4 },
    ];
    expect(getLineTemaCrossSigFinitePoints(points)).toEqual([
      { x: 0, close: 1 },
      { x: 3, close: 4 },
    ]);
  });

  it('returns empty for null and non-array', () => {
    expect(getLineTemaCrossSigFinitePoints(null)).toEqual([]);
    expect(getLineTemaCrossSigFinitePoints(undefined)).toEqual([]);
    expect(
      getLineTemaCrossSigFinitePoints(
        // @ts-expect-error -- intentionally bad
        'oops',
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineTemaCrossSigLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineTemaCrossSigLength(14.7, 14)).toBe(14);
    expect(normalizeLineTemaCrossSigLength(0, 14)).toBe(14);
    expect(normalizeLineTemaCrossSigLength(NaN, 14)).toBe(14);
  });
});

describe('applyLineTemaCrossSigSmaSeededEma', () => {
  it('LINEAR settles at i - (L-1)/2', () => {
    const values: Array<number | null> = Array.from(
      { length: 30 },
      (_, i) => i,
    );
    const ema = applyLineTemaCrossSigSmaSeededEma(values, PERIOD);
    for (let i = PERIOD - 1; i < 30; i += 1) {
      expect(ema[i] as number).toBeCloseTo(i - (PERIOD - 1) / 2, 9);
    }
  });
});

describe('applyLineTemaCrossSigSma', () => {
  it('CONST returns constant', () => {
    const values: Array<number | null> = Array.from({ length: 10 }, () => 7);
    const sma = applyLineTemaCrossSigSma(values, SIGNAL);
    for (let i = SIGNAL - 1; i < 10; i += 1) expect(sma[i]).toBe(7);
  });
});

describe('applyLineTemaCrossSigTema', () => {
  it('CONST close=K returns TEMA=K from warmup', () => {
    for (const K of [0, 1, 50, 200, 1234]) {
      const closes = Array.from({ length: 80 }, () => K);
      const tema = applyLineTemaCrossSigTema(closes, PERIOD);
      for (let i = 0; i < TEMA_WARMUP; i += 1) expect(tema[i]).toBeNull();
      for (let i = TEMA_WARMUP; i < 80; i += 1) {
        expect(tema[i] as number).toBeCloseTo(K, 9);
      }
    }
  });

  it('LINEAR UP returns TEMA=i with zero lag (Mulloy identity)', () => {
    const closes = Array.from({ length: 80 }, (_, i) => i);
    const tema = applyLineTemaCrossSigTema(closes, PERIOD);
    for (let i = TEMA_WARMUP; i < 80; i += 1) {
      expect(tema[i] as number).toBeCloseTo(i, 9);
    }
  });

  it('LINEAR DOWN returns TEMA=-i', () => {
    const closes = Array.from({ length: 80 }, (_, i) => -i);
    const tema = applyLineTemaCrossSigTema(closes, PERIOD);
    for (let i = TEMA_WARMUP; i < 80; i += 1) {
      expect(tema[i] as number).toBeCloseTo(-i, 9);
    }
  });

  it('returns nulls when period < 1', () => {
    expect(
      applyLineTemaCrossSigTema([1, 2, 3, 4, 5], 0).every((v) => v === null),
    ).toBe(true);
  });
});

describe('computeLineTemaCrossSig', () => {
  it('CONST close=K returns tema=K and signal=K from warmup', () => {
    const data = buildConst(80, 50);
    const out = computeLineTemaCrossSig(data);
    expect(out.tema[TEMA_WARMUP] as number).toBeCloseTo(50, 9);
    expect(out.signal[WARMUP] as number).toBeCloseTo(50, 9);
  });

  it('LINEAR UP: tema=i, signal=i-1, tema-signal=+1', () => {
    const data = buildLinearUp(80);
    const out = computeLineTemaCrossSig(data);
    for (let i = WARMUP; i < 80; i += 1) {
      const t = out.tema[i] as number;
      const s = out.signal[i] as number;
      expect(t).toBeCloseTo(i, 9);
      expect(s).toBeCloseTo(i - 1, 9);
      expect(t - s).toBeCloseTo(1, 9);
    }
  });

  it('LINEAR DOWN: tema=-i, signal=-i+1, tema-signal=-1', () => {
    const data = buildLinearDown(80);
    const out = computeLineTemaCrossSig(data);
    for (let i = WARMUP; i < 80; i += 1) {
      const t = out.tema[i] as number;
      const s = out.signal[i] as number;
      expect(t).toBeCloseTo(-i, 9);
      expect(s).toBeCloseTo(-i + 1, 9);
      expect(t - s).toBeCloseTo(-1, 9);
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineTemaCrossSig([])).toEqual({ tema: [], signal: [] });
  });
});

describe('classifyLineTemaCrossSigRegime', () => {
  it('null -> none', () => {
    expect(classifyLineTemaCrossSigRegime(null, 50)).toBe('none');
  });
  it('tema >= signal -> bullish', () => {
    expect(classifyLineTemaCrossSigRegime(50, 50)).toBe('bullish');
    expect(classifyLineTemaCrossSigRegime(60, 50)).toBe('bullish');
  });
  it('tema < signal -> bearish', () => {
    expect(classifyLineTemaCrossSigRegime(40, 50)).toBe('bearish');
  });
});

describe('classifyLineTemaCrossSigBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineTemaCrossSigBias(60, 50)).toBe('up');
    expect(classifyLineTemaCrossSigBias(40, 50)).toBe('down');
    expect(classifyLineTemaCrossSigBias(50, 50)).toBe('flat');
    expect(classifyLineTemaCrossSigBias(null, 50)).toBe('none');
  });
});

describe('detectLineTemaCrossSigCrosses', () => {
  it('detects bullish trigger', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const tema: Array<number | null> = [4, 5, 7, 8];
    const signal: Array<number | null> = [5, 5, 6, 6];
    const out = detectLineTemaCrossSigCrosses(series, tema, signal);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
  });

  it('detects bearish trigger', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const tema: Array<number | null> = [8, 7, 5, 4];
    const signal: Array<number | null> = [6, 6, 6, 6];
    const out = detectLineTemaCrossSigCrosses(series, tema, signal);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
  });

  it('does not fire on null values', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const tema: Array<number | null> = [null, null, 5, 7];
    const signal: Array<number | null> = [null, null, 4, 4];
    expect(detectLineTemaCrossSigCrosses(series, tema, signal)).toHaveLength(
      0,
    );
  });

  it('does not double-fire', () => {
    const series = Array.from({ length: 5 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const tema: Array<number | null> = [4, 5, 6, 7, 8];
    const signal: Array<number | null> = [5, 4, 4, 4, 4];
    expect(detectLineTemaCrossSigCrosses(series, tema, signal)).toHaveLength(
      1,
    );
  });
});

describe('runLineTemaCrossSig CONST K', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST close=${K}: tema=K, signal=K, all bullish, 0 triggers`, () => {
      const data = buildConst(80, K);
      const run = runLineTemaCrossSig(data);
      expect(run.period).toBe(PERIOD);
      expect(run.signalLength).toBe(SIGNAL);
      for (let i = 0; i < WARMUP; i += 1) {
        expect(run.signalValues[i]).toBeNull();
      }
      for (let i = WARMUP; i < 80; i += 1) {
        expect(run.temaValues[i] as number).toBeCloseTo(K, 9);
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

describe('runLineTemaCrossSig LINEAR UP', () => {
  it('LINEAR UP: tema-signal=+1, all bullish, 0 triggers', () => {
    const data = buildLinearUp(80);
    const run = runLineTemaCrossSig(data);
    for (let i = WARMUP; i < 80; i += 1) {
      expect(run.samples[i]?.regime).toBe('bullish');
      const t = run.temaValues[i] as number;
      const s = run.signalValues[i] as number;
      expect(t - s).toBeCloseTo(1, 9);
    }
    expect(run.bullishCount).toBe(80 - WARMUP);
    expect(run.bearishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineTemaCrossSig LINEAR DOWN', () => {
  it('LINEAR DOWN: tema-signal=-1, all bearish, 0 triggers', () => {
    const data = buildLinearDown(80);
    const run = runLineTemaCrossSig(data);
    for (let i = WARMUP; i < 80; i += 1) {
      expect(run.samples[i]?.regime).toBe('bearish');
      const t = run.temaValues[i] as number;
      const s = run.signalValues[i] as number;
      expect(t - s).toBeCloseTo(-1, 9);
    }
    expect(run.bearishCount).toBe(80 - WARMUP);
    expect(run.bullishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineTemaCrossSig misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineTemaCrossSigPoint[] = [
      { x: 2, close: 1 },
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    const run = runLineTemaCrossSig(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConst(30, 50);
    const run = runLineTemaCrossSig(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineTemaCrossSig([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom tuning', () => {
    const data = buildLinearUp(80);
    const run = runLineTemaCrossSig(data, { period: 7, signalLength: 2 });
    expect(run.period).toBe(7);
    expect(run.signalLength).toBe(2);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(80);
    const run = runLineTemaCrossSig(data);
    expect(run.bullishCount + run.bearishCount + run.noneCount).toBe(80);
  });
});

describe('computeLineTemaCrossSigLayout', () => {
  it('renders SVG paths for CONST K=50', () => {
    const data = buildConst(80, 50);
    const layout = computeLineTemaCrossSigLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(80);
    expect(layout.temaPath).toContain('M ');
    expect(layout.signalPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineTemaCrossSigLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.temaPath).toBe('');
    expect(layout.signalPath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineTemaCrossSigLayout({
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
    const data = buildConst(80, 100);
    const layout = computeLineTemaCrossSigLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });
});

describe('describeLineTemaCrossSigChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineTemaCrossSigChart([])).toBe('No data');
  });

  it('mentions bar count, period, signal', () => {
    const desc = describeLineTemaCrossSigChart(buildLinearUp(80));
    expect(desc).toContain('80 bars');
    expect(desc).toContain('period 14');
    expect(desc).toContain('signalLength 3');
    expect(desc).toContain('bias coloring');
  });
});

describe('<ChartLineTemaCrossSig /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(80);
    const { container } = render(<ChartLineTemaCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-tema-cross-sig"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-period')).toBe(String(PERIOD));
    expect(root?.getAttribute('data-signal-length')).toBe(String(SIGNAL));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(<ChartLineTemaCrossSig data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-tema-cross-sig-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders TEMA and signal paths', () => {
    const data = buildLinearUp(80);
    const { container } = render(<ChartLineTemaCrossSig data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-tema-cross-sig-tema-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-tema-cross-sig-signal-path"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineTemaCrossSig data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-tema-cross-sig-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildLinearUp(80);
    const { container } = render(<ChartLineTemaCrossSig data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-tema-cross-sig-badge"]',
    );
    expect(badge?.textContent).toContain('period 14');
    expect(badge?.textContent).toContain('signal 3');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(80);
    const { container } = render(<ChartLineTemaCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-tema-cross-sig"]',
    );
    expect(root?.getAttribute('aria-label')).toBe('TEMA-over-Signal chart');
  });

  it('exposes data-*-count counters', () => {
    const data = buildLinearUp(80);
    const { container } = render(<ChartLineTemaCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-tema-cross-sig"]',
    );
    expect(root?.getAttribute('data-bullish-count')).toBe(
      String(80 - WARMUP),
    );
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineTemaCrossSig data={data} hiddenSeries={['signal']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-tema-cross-sig-signal-path"]',
      ),
    ).toBeNull();
  });
});
