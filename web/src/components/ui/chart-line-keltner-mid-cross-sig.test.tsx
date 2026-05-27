import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineKeltnerMidCrossSig,
  DEFAULT_CHART_LINE_KELTNER_MID_CROSS_SIG_HEIGHT,
  DEFAULT_CHART_LINE_KELTNER_MID_CROSS_SIG_PADDING,
  DEFAULT_CHART_LINE_KELTNER_MID_CROSS_SIG_PANEL_GAP,
  DEFAULT_CHART_LINE_KELTNER_MID_CROSS_SIG_PERIOD,
  DEFAULT_CHART_LINE_KELTNER_MID_CROSS_SIG_SIGNAL_LENGTH,
  DEFAULT_CHART_LINE_KELTNER_MID_CROSS_SIG_WIDTH,
  applyLineKeltnerMidCrossSigEma,
  applyLineKeltnerMidCrossSigSma,
  classifyLineKeltnerMidCrossSigBias,
  classifyLineKeltnerMidCrossSigRegime,
  computeLineKeltnerMidCrossSig,
  computeLineKeltnerMidCrossSigLayout,
  describeLineKeltnerMidCrossSigChart,
  detectLineKeltnerMidCrossSigCrosses,
  getLineKeltnerMidCrossSigFinitePoints,
  normalizeLineKeltnerMidCrossSigLength,
  runLineKeltnerMidCrossSig,
  type ChartLineKeltnerMidCrossSigPoint,
} from './chart-line-keltner-mid-cross-sig';

const PERIOD = 20;
const SIGNAL = 3;
const MIDDLE_WARMUP = PERIOD - 1; // 19
const WARMUP = MIDDLE_WARMUP + SIGNAL - 1; // 21
const MIDDLE_LAG = (PERIOD - 1) / 2; // 9.5
const SIGNAL_LAG = MIDDLE_LAG + (SIGNAL - 1) / 2; // 10.5
const DIFF = SIGNAL_LAG - MIDDLE_LAG; // 1

const buildConst = (
  n: number,
  k: number,
): ChartLineKeltnerMidCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: k }));

const buildLinearUp = (n: number): ChartLineKeltnerMidCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: i }));

const buildLinearDown = (n: number): ChartLineKeltnerMidCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: -i }));

describe('ChartLineKeltnerMidCrossSig defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_KELTNER_MID_CROSS_SIG_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_KELTNER_MID_CROSS_SIG_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_KELTNER_MID_CROSS_SIG_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_KELTNER_MID_CROSS_SIG_PANEL_GAP).toBe(12);
  });

  it('exports canonical Keltner middle tuning', () => {
    expect(DEFAULT_CHART_LINE_KELTNER_MID_CROSS_SIG_PERIOD).toBe(20);
    expect(DEFAULT_CHART_LINE_KELTNER_MID_CROSS_SIG_SIGNAL_LENGTH).toBe(3);
  });
});

describe('getLineKeltnerMidCrossSigFinitePoints', () => {
  it('filters finite x and close', () => {
    const points = [
      { x: 0, close: 1 },
      { x: NaN, close: 2 },
      { x: 2, close: Infinity },
      { x: 3, close: 4 },
    ];
    expect(getLineKeltnerMidCrossSigFinitePoints(points)).toEqual([
      { x: 0, close: 1 },
      { x: 3, close: 4 },
    ]);
  });

  it('returns empty for null and non-array', () => {
    expect(getLineKeltnerMidCrossSigFinitePoints(null)).toEqual([]);
    expect(getLineKeltnerMidCrossSigFinitePoints(undefined)).toEqual([]);
    expect(
      getLineKeltnerMidCrossSigFinitePoints(
        // @ts-expect-error -- intentionally bad
        'oops',
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineKeltnerMidCrossSigLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineKeltnerMidCrossSigLength(20.7, 20)).toBe(20);
    expect(normalizeLineKeltnerMidCrossSigLength(0, 20)).toBe(20);
    expect(normalizeLineKeltnerMidCrossSigLength(NaN, 20)).toBe(20);
  });
});

describe('applyLineKeltnerMidCrossSigEma', () => {
  it('CONST returns constant after SMA seed', () => {
    const values: Array<number | null> = Array.from({ length: 30 }, () => 7);
    const ema = applyLineKeltnerMidCrossSigEma(values, PERIOD);
    for (let i = PERIOD - 1; i < 30; i += 1) expect(ema[i]).toBe(7);
  });

  it('LINEAR UP: SMA-seeded EMA settles at i - (period-1)/2 from seed bar', () => {
    const values: Array<number | null> = Array.from(
      { length: 60 },
      (_, i) => i,
    );
    const ema = applyLineKeltnerMidCrossSigEma(values, PERIOD);
    for (let i = PERIOD - 1; i < 60; i += 1) {
      expect(ema[i] as number).toBeCloseTo(i - MIDDLE_LAG, 9);
    }
  });

  it('returns nulls when length < 1', () => {
    expect(
      applyLineKeltnerMidCrossSigEma([1, 2, 3], 0).every((v) => v === null),
    ).toBe(true);
  });

  it('length 1 returns values verbatim', () => {
    const out = applyLineKeltnerMidCrossSigEma([1, 2, 3, null, 5], 1);
    expect(out).toEqual([1, 2, 3, null, 5]);
  });

  it('null gap resets seed', () => {
    const values: Array<number | null> = [
      1,
      1,
      1,
      null,
      1,
      1,
      1,
    ];
    const ema = applyLineKeltnerMidCrossSigEma(values, 3);
    expect(ema[2]).toBe(1);
    expect(ema[3]).toBeNull();
    expect(ema[4]).toBeNull();
    expect(ema[5]).toBeNull();
    expect(ema[6]).toBe(1);
  });
});

describe('applyLineKeltnerMidCrossSigSma', () => {
  it('CONST returns constant', () => {
    const values: Array<number | null> = Array.from({ length: 10 }, () => 7);
    const sma = applyLineKeltnerMidCrossSigSma(values, SIGNAL);
    for (let i = SIGNAL - 1; i < 10; i += 1) expect(sma[i]).toBe(7);
  });
});

describe('computeLineKeltnerMidCrossSig', () => {
  it('CONST close=K returns middle=K and signal=K from warmup', () => {
    const data = buildConst(40, 50);
    const out = computeLineKeltnerMidCrossSig(data);
    expect(out.middle[MIDDLE_WARMUP] as number).toBeCloseTo(50, 9);
    expect(out.signal[WARMUP] as number).toBeCloseTo(50, 9);
  });

  it('LINEAR UP: middle - signal = +1', () => {
    const data = buildLinearUp(40);
    const out = computeLineKeltnerMidCrossSig(data);
    for (let i = WARMUP; i < 40; i += 1) {
      const m = out.middle[i] as number;
      const s = out.signal[i] as number;
      expect(m - s).toBeCloseTo(DIFF, 9);
    }
  });

  it('LINEAR DOWN: middle - signal = -1', () => {
    const data = buildLinearDown(40);
    const out = computeLineKeltnerMidCrossSig(data);
    for (let i = WARMUP; i < 40; i += 1) {
      const m = out.middle[i] as number;
      const s = out.signal[i] as number;
      expect(m - s).toBeCloseTo(-DIFF, 9);
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineKeltnerMidCrossSig([])).toEqual({
      middle: [],
      signal: [],
    });
  });
});

describe('classifyLineKeltnerMidCrossSigRegime', () => {
  it('null -> none', () => {
    expect(classifyLineKeltnerMidCrossSigRegime(null, 50)).toBe('none');
  });
  it('middle >= signal -> bullish', () => {
    expect(classifyLineKeltnerMidCrossSigRegime(50, 50)).toBe('bullish');
    expect(classifyLineKeltnerMidCrossSigRegime(60, 50)).toBe('bullish');
  });
  it('middle < signal -> bearish', () => {
    expect(classifyLineKeltnerMidCrossSigRegime(40, 50)).toBe('bearish');
  });
});

describe('classifyLineKeltnerMidCrossSigBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineKeltnerMidCrossSigBias(60, 50)).toBe('up');
    expect(classifyLineKeltnerMidCrossSigBias(40, 50)).toBe('down');
    expect(classifyLineKeltnerMidCrossSigBias(50, 50)).toBe('flat');
    expect(classifyLineKeltnerMidCrossSigBias(null, 50)).toBe('none');
  });
});

describe('detectLineKeltnerMidCrossSigCrosses', () => {
  it('detects bullish trigger', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const middle: Array<number | null> = [4, 5, 7, 8];
    const signal: Array<number | null> = [5, 5, 6, 6];
    const out = detectLineKeltnerMidCrossSigCrosses(series, middle, signal);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
  });

  it('detects bearish trigger', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const middle: Array<number | null> = [8, 7, 5, 4];
    const signal: Array<number | null> = [6, 6, 6, 6];
    const out = detectLineKeltnerMidCrossSigCrosses(series, middle, signal);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
  });

  it('does not fire on null values', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const middle: Array<number | null> = [null, null, 5, 7];
    const signal: Array<number | null> = [null, null, 4, 4];
    expect(
      detectLineKeltnerMidCrossSigCrosses(series, middle, signal),
    ).toHaveLength(0);
  });

  it('does not double-fire', () => {
    const series = Array.from({ length: 5 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const middle: Array<number | null> = [4, 5, 6, 7, 8];
    const signal: Array<number | null> = [5, 4, 4, 4, 4];
    expect(
      detectLineKeltnerMidCrossSigCrosses(series, middle, signal),
    ).toHaveLength(1);
  });
});

describe('runLineKeltnerMidCrossSig CONST K', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST close=${K}: middle=K, signal=K, all bullish, 0 triggers`, () => {
      const data = buildConst(60, K);
      const run = runLineKeltnerMidCrossSig(data);
      expect(run.period).toBe(PERIOD);
      expect(run.signalLength).toBe(SIGNAL);
      for (let i = 0; i < WARMUP; i += 1) {
        expect(run.signalValues[i]).toBeNull();
      }
      for (let i = WARMUP; i < 60; i += 1) {
        expect(run.middleValues[i] as number).toBeCloseTo(K, 9);
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

describe('runLineKeltnerMidCrossSig LINEAR UP', () => {
  it('LINEAR UP: middle > signal by 1, all bullish, 0 triggers', () => {
    const data = buildLinearUp(60);
    const run = runLineKeltnerMidCrossSig(data);
    for (let i = WARMUP; i < 60; i += 1) {
      expect(run.samples[i]?.regime).toBe('bullish');
      const m = run.middleValues[i] as number;
      const s = run.signalValues[i] as number;
      expect(m - s).toBeCloseTo(DIFF, 9);
      expect(m).toBeCloseTo(i - MIDDLE_LAG, 9);
      expect(s).toBeCloseTo(i - SIGNAL_LAG, 9);
    }
    expect(run.bullishCount).toBe(60 - WARMUP);
    expect(run.bearishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineKeltnerMidCrossSig LINEAR DOWN', () => {
  it('LINEAR DOWN: middle < signal by 1, all bearish, 0 triggers', () => {
    const data = buildLinearDown(60);
    const run = runLineKeltnerMidCrossSig(data);
    for (let i = WARMUP; i < 60; i += 1) {
      expect(run.samples[i]?.regime).toBe('bearish');
      const m = run.middleValues[i] as number;
      const s = run.signalValues[i] as number;
      expect(m - s).toBeCloseTo(-DIFF, 9);
    }
    expect(run.bearishCount).toBe(60 - WARMUP);
    expect(run.bullishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineKeltnerMidCrossSig misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineKeltnerMidCrossSigPoint[] = [
      { x: 2, close: 1 },
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    const run = runLineKeltnerMidCrossSig(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConst(15, 50);
    const run = runLineKeltnerMidCrossSig(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineKeltnerMidCrossSig([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom tuning', () => {
    const data = buildLinearUp(60);
    const run = runLineKeltnerMidCrossSig(data, {
      period: 7,
      signalLength: 2,
    });
    expect(run.period).toBe(7);
    expect(run.signalLength).toBe(2);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(60);
    const run = runLineKeltnerMidCrossSig(data);
    expect(run.bullishCount + run.bearishCount + run.noneCount).toBe(60);
  });
});

describe('computeLineKeltnerMidCrossSigLayout', () => {
  it('renders SVG paths for CONST K=50', () => {
    const data = buildConst(60, 50);
    const layout = computeLineKeltnerMidCrossSigLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(60);
    expect(layout.middlePath).toContain('M ');
    expect(layout.signalPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineKeltnerMidCrossSigLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.middlePath).toBe('');
    expect(layout.signalPath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineKeltnerMidCrossSigLayout({
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
    const layout = computeLineKeltnerMidCrossSigLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });
});

describe('describeLineKeltnerMidCrossSigChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineKeltnerMidCrossSigChart([])).toBe('No data');
  });

  it('mentions bar count, period, signal, volatility', () => {
    const desc = describeLineKeltnerMidCrossSigChart(buildLinearUp(60));
    expect(desc).toContain('60 bars');
    expect(desc).toContain('period 20');
    expect(desc).toContain('signalLength 3');
    expect(desc).toContain('volatility');
    expect(desc).toContain('bias coloring');
  });
});

describe('<ChartLineKeltnerMidCrossSig /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineKeltnerMidCrossSig data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-keltner-mid-cross-sig"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-period')).toBe(String(PERIOD));
    expect(root?.getAttribute('data-signal-length')).toBe(String(SIGNAL));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(<ChartLineKeltnerMidCrossSig data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-keltner-mid-cross-sig-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders middle and signal paths', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineKeltnerMidCrossSig data={data} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-keltner-mid-cross-sig-middle-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-keltner-mid-cross-sig-signal-path"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineKeltnerMidCrossSig data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-keltner-mid-cross-sig-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineKeltnerMidCrossSig data={data} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-keltner-mid-cross-sig-badge"]',
    );
    expect(badge?.textContent).toContain('period 20');
    expect(badge?.textContent).toContain('signal 3');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineKeltnerMidCrossSig data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-keltner-mid-cross-sig"]',
    );
    expect(root?.getAttribute('aria-label')).toBe(
      'Keltner middle-over-Signal chart',
    );
  });

  it('exposes data-*-count counters', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineKeltnerMidCrossSig data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-keltner-mid-cross-sig"]',
    );
    expect(root?.getAttribute('data-bullish-count')).toBe(
      String(60 - WARMUP),
    );
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineKeltnerMidCrossSig
        data={data}
        hiddenSeries={['signal']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-keltner-mid-cross-sig-signal-path"]',
      ),
    ).toBeNull();
  });
});
