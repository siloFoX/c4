import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineDonchianMidCrossSig,
  DEFAULT_CHART_LINE_DONCHIAN_MID_CROSS_SIG_HEIGHT,
  DEFAULT_CHART_LINE_DONCHIAN_MID_CROSS_SIG_PADDING,
  DEFAULT_CHART_LINE_DONCHIAN_MID_CROSS_SIG_PANEL_GAP,
  DEFAULT_CHART_LINE_DONCHIAN_MID_CROSS_SIG_PERIOD,
  DEFAULT_CHART_LINE_DONCHIAN_MID_CROSS_SIG_SIGNAL_LENGTH,
  DEFAULT_CHART_LINE_DONCHIAN_MID_CROSS_SIG_WIDTH,
  applyLineDonchianMidCrossSigRollingMax,
  applyLineDonchianMidCrossSigRollingMin,
  applyLineDonchianMidCrossSigSma,
  classifyLineDonchianMidCrossSigBias,
  classifyLineDonchianMidCrossSigRegime,
  computeLineDonchianMidCrossSig,
  computeLineDonchianMidCrossSigLayout,
  describeLineDonchianMidCrossSigChart,
  detectLineDonchianMidCrossSigCrosses,
  getLineDonchianMidCrossSigFinitePoints,
  normalizeLineDonchianMidCrossSigLength,
  runLineDonchianMidCrossSig,
  type ChartLineDonchianMidCrossSigPoint,
} from './chart-line-donchian-mid-cross-sig';

const PERIOD = 20;
const SIGNAL = 3;
const MIDDLE_WARMUP = PERIOD - 1; // 19
const WARMUP = MIDDLE_WARMUP + SIGNAL - 1; // 21
const MIDDLE_LAG = (PERIOD - 1) / 2; // 9.5
const SIGNAL_LAG = MIDDLE_LAG + (SIGNAL - 1) / 2; // 10.5
const DIFF = SIGNAL_LAG - MIDDLE_LAG; // 1

const buildConstBand = (
  n: number,
  k: number,
): ChartLineDonchianMidCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: k + 1,
    low: k - 1,
    close: k,
  }));

const buildLinearUp = (n: number): ChartLineDonchianMidCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: i + 1,
    low: i - 1,
    close: i,
  }));

const buildLinearDown = (n: number): ChartLineDonchianMidCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: -i + 1,
    low: -i - 1,
    close: -i,
  }));

describe('ChartLineDonchianMidCrossSig defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_DONCHIAN_MID_CROSS_SIG_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_DONCHIAN_MID_CROSS_SIG_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_DONCHIAN_MID_CROSS_SIG_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_DONCHIAN_MID_CROSS_SIG_PANEL_GAP).toBe(12);
  });

  it('exports canonical Donchian middle tuning', () => {
    expect(DEFAULT_CHART_LINE_DONCHIAN_MID_CROSS_SIG_PERIOD).toBe(20);
    expect(DEFAULT_CHART_LINE_DONCHIAN_MID_CROSS_SIG_SIGNAL_LENGTH).toBe(3);
  });
});

describe('getLineDonchianMidCrossSigFinitePoints', () => {
  it('filters NaN/Infinity and high<low', () => {
    const points = [
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: NaN, high: 2, low: 1, close: 1.5 },
      { x: 1, high: 1, low: 2, close: 1.5 },
      { x: 2, high: Infinity, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ];
    expect(getLineDonchianMidCrossSigFinitePoints(points)).toEqual([
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ]);
  });

  it('returns empty for null and non-array', () => {
    expect(getLineDonchianMidCrossSigFinitePoints(null)).toEqual([]);
    expect(getLineDonchianMidCrossSigFinitePoints(undefined)).toEqual([]);
    expect(
      getLineDonchianMidCrossSigFinitePoints(
        // @ts-expect-error -- intentionally bad
        'oops',
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineDonchianMidCrossSigLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineDonchianMidCrossSigLength(20.7, 20)).toBe(20);
    expect(normalizeLineDonchianMidCrossSigLength(0, 20)).toBe(20);
    expect(normalizeLineDonchianMidCrossSigLength(NaN, 20)).toBe(20);
  });
});

describe('applyLineDonchianMidCrossSigRollingMax', () => {
  it('CONST returns constant', () => {
    const values: Array<number | null> = Array.from(
      { length: 25 },
      () => 7,
    );
    const max = applyLineDonchianMidCrossSigRollingMax(values, PERIOD);
    for (let i = PERIOD - 1; i < 25; i += 1) expect(max[i]).toBe(7);
  });

  it('LINEAR UP returns latest value (i)', () => {
    const values: Array<number | null> = Array.from(
      { length: 30 },
      (_, i) => i,
    );
    const max = applyLineDonchianMidCrossSigRollingMax(values, PERIOD);
    for (let i = PERIOD - 1; i < 30; i += 1) {
      expect(max[i]).toBe(i);
    }
  });

  it('returns nulls when length < 1', () => {
    expect(
      applyLineDonchianMidCrossSigRollingMax([1, 2, 3], 0).every(
        (v) => v === null,
      ),
    ).toBe(true);
  });
});

describe('applyLineDonchianMidCrossSigRollingMin', () => {
  it('CONST returns constant', () => {
    const values: Array<number | null> = Array.from(
      { length: 25 },
      () => 7,
    );
    const min = applyLineDonchianMidCrossSigRollingMin(values, PERIOD);
    for (let i = PERIOD - 1; i < 25; i += 1) expect(min[i]).toBe(7);
  });

  it('LINEAR UP returns oldest value (i - period + 1)', () => {
    const values: Array<number | null> = Array.from(
      { length: 30 },
      (_, i) => i,
    );
    const min = applyLineDonchianMidCrossSigRollingMin(values, PERIOD);
    for (let i = PERIOD - 1; i < 30; i += 1) {
      expect(min[i]).toBe(i - PERIOD + 1);
    }
  });
});

describe('applyLineDonchianMidCrossSigSma', () => {
  it('CONST returns constant', () => {
    const values: Array<number | null> = Array.from({ length: 10 }, () => 7);
    const sma = applyLineDonchianMidCrossSigSma(values, SIGNAL);
    for (let i = SIGNAL - 1; i < 10; i += 1) expect(sma[i]).toBe(7);
  });
});

describe('computeLineDonchianMidCrossSig CONST band', () => {
  it('upper=K+1, lower=K-1, middle=K, signal=K from warmup', () => {
    const data = buildConstBand(40, 50);
    const out = computeLineDonchianMidCrossSig(data);
    for (let i = MIDDLE_WARMUP; i < 40; i += 1) {
      expect(out.upper[i] as number).toBeCloseTo(51, 9);
      expect(out.lower[i] as number).toBeCloseTo(49, 9);
      expect(out.middle[i] as number).toBeCloseTo(50, 9);
    }
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.signal[i] as number).toBeCloseTo(50, 9);
    }
  });
});

describe('computeLineDonchianMidCrossSig LINEAR UP', () => {
  it('upper=i+1, lower=i-20, middle=i-9.5, signal=i-10.5', () => {
    const data = buildLinearUp(40);
    const out = computeLineDonchianMidCrossSig(data);
    for (let i = MIDDLE_WARMUP; i < 40; i += 1) {
      expect(out.upper[i] as number).toBeCloseTo(i + 1, 9);
      expect(out.lower[i] as number).toBeCloseTo(i - 20, 9);
      expect(out.middle[i] as number).toBeCloseTo(i - MIDDLE_LAG, 9);
    }
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.signal[i] as number).toBeCloseTo(i - SIGNAL_LAG, 9);
    }
  });

  it('middle - signal = +1', () => {
    const data = buildLinearUp(40);
    const out = computeLineDonchianMidCrossSig(data);
    for (let i = WARMUP; i < 40; i += 1) {
      const m = out.middle[i] as number;
      const s = out.signal[i] as number;
      expect(m - s).toBeCloseTo(DIFF, 9);
    }
  });
});

describe('computeLineDonchianMidCrossSig LINEAR DOWN', () => {
  it('upper=-i+20, lower=-i-1, middle=-i+9.5, signal=-i+10.5', () => {
    const data = buildLinearDown(40);
    const out = computeLineDonchianMidCrossSig(data);
    for (let i = MIDDLE_WARMUP; i < 40; i += 1) {
      expect(out.upper[i] as number).toBeCloseTo(-i + 20, 9);
      expect(out.lower[i] as number).toBeCloseTo(-i - 1, 9);
      expect(out.middle[i] as number).toBeCloseTo(-i + MIDDLE_LAG, 9);
    }
  });

  it('middle - signal = -1', () => {
    const data = buildLinearDown(40);
    const out = computeLineDonchianMidCrossSig(data);
    for (let i = WARMUP; i < 40; i += 1) {
      const m = out.middle[i] as number;
      const s = out.signal[i] as number;
      expect(m - s).toBeCloseTo(-DIFF, 9);
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineDonchianMidCrossSig([])).toEqual({
      upper: [],
      lower: [],
      middle: [],
      signal: [],
    });
  });
});

describe('classifyLineDonchianMidCrossSigRegime', () => {
  it('null -> none', () => {
    expect(classifyLineDonchianMidCrossSigRegime(null, 50)).toBe('none');
  });
  it('middle >= signal -> bullish', () => {
    expect(classifyLineDonchianMidCrossSigRegime(50, 50)).toBe('bullish');
    expect(classifyLineDonchianMidCrossSigRegime(60, 50)).toBe('bullish');
  });
  it('middle < signal -> bearish', () => {
    expect(classifyLineDonchianMidCrossSigRegime(40, 50)).toBe('bearish');
  });
});

describe('classifyLineDonchianMidCrossSigBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineDonchianMidCrossSigBias(60, 50)).toBe('up');
    expect(classifyLineDonchianMidCrossSigBias(40, 50)).toBe('down');
    expect(classifyLineDonchianMidCrossSigBias(50, 50)).toBe('flat');
    expect(classifyLineDonchianMidCrossSigBias(null, 50)).toBe('none');
  });
});

describe('detectLineDonchianMidCrossSigCrosses', () => {
  it('detects bullish trigger', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const middle: Array<number | null> = [4, 5, 7, 8];
    const signal: Array<number | null> = [5, 5, 6, 6];
    const out = detectLineDonchianMidCrossSigCrosses(series, middle, signal);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
  });

  it('detects bearish trigger', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const middle: Array<number | null> = [8, 7, 5, 4];
    const signal: Array<number | null> = [6, 6, 6, 6];
    const out = detectLineDonchianMidCrossSigCrosses(series, middle, signal);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
  });

  it('does not fire on null values', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const middle: Array<number | null> = [null, null, 5, 7];
    const signal: Array<number | null> = [null, null, 4, 4];
    expect(
      detectLineDonchianMidCrossSigCrosses(series, middle, signal),
    ).toHaveLength(0);
  });

  it('does not double-fire', () => {
    const series = Array.from({ length: 5 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const middle: Array<number | null> = [4, 5, 6, 7, 8];
    const signal: Array<number | null> = [5, 4, 4, 4, 4];
    expect(
      detectLineDonchianMidCrossSigCrosses(series, middle, signal),
    ).toHaveLength(1);
  });
});

describe('runLineDonchianMidCrossSig CONST band', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST band centred at ${K}: middle=K, signal=K, all bullish, 0 triggers`, () => {
      const data = buildConstBand(60, K);
      const run = runLineDonchianMidCrossSig(data);
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

describe('runLineDonchianMidCrossSig LINEAR UP', () => {
  it('LINEAR UP: middle > signal by 1, all bullish, 0 triggers', () => {
    const data = buildLinearUp(60);
    const run = runLineDonchianMidCrossSig(data);
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

describe('runLineDonchianMidCrossSig LINEAR DOWN', () => {
  it('LINEAR DOWN: middle < signal by 1, all bearish, 0 triggers', () => {
    const data = buildLinearDown(60);
    const run = runLineDonchianMidCrossSig(data);
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

describe('runLineDonchianMidCrossSig misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineDonchianMidCrossSigPoint[] = [
      { x: 2, high: 1, low: 0, close: 0.5 },
      { x: 0, high: 1, low: 0, close: 0.5 },
      { x: 1, high: 1, low: 0, close: 0.5 },
    ];
    const run = runLineDonchianMidCrossSig(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConstBand(15, 50);
    const run = runLineDonchianMidCrossSig(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineDonchianMidCrossSig([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom tuning', () => {
    const data = buildLinearUp(60);
    const run = runLineDonchianMidCrossSig(data, {
      period: 7,
      signalLength: 2,
    });
    expect(run.period).toBe(7);
    expect(run.signalLength).toBe(2);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(60);
    const run = runLineDonchianMidCrossSig(data);
    expect(run.bullishCount + run.bearishCount + run.noneCount).toBe(60);
  });

  it('upper, lower exposed in run for the canonical band', () => {
    const data = buildConstBand(60, 100);
    const run = runLineDonchianMidCrossSig(data);
    for (let i = MIDDLE_WARMUP; i < 60; i += 1) {
      expect(run.upperValues[i]).toBe(101);
      expect(run.lowerValues[i]).toBe(99);
    }
  });
});

describe('computeLineDonchianMidCrossSigLayout', () => {
  it('renders SVG paths for CONST K=50', () => {
    const data = buildConstBand(60, 50);
    const layout = computeLineDonchianMidCrossSigLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(60);
    expect(layout.middlePath).toContain('M ');
    expect(layout.signalPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineDonchianMidCrossSigLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.middlePath).toBe('');
    expect(layout.signalPath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineDonchianMidCrossSigLayout({
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
    const data = buildConstBand(60, 100);
    const layout = computeLineDonchianMidCrossSigLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });
});

describe('describeLineDonchianMidCrossSigChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineDonchianMidCrossSigChart([])).toBe('No data');
  });

  it('mentions bar count, period, signal, range trend', () => {
    const desc = describeLineDonchianMidCrossSigChart(buildLinearUp(60));
    expect(desc).toContain('60 bars');
    expect(desc).toContain('period 20');
    expect(desc).toContain('signalLength 3');
    expect(desc).toContain('range trend');
    expect(desc).toContain('bias coloring');
  });
});

describe('<ChartLineDonchianMidCrossSig /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineDonchianMidCrossSig data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-donchian-mid-cross-sig"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-period')).toBe(String(PERIOD));
    expect(root?.getAttribute('data-signal-length')).toBe(String(SIGNAL));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(
      <ChartLineDonchianMidCrossSig data={[]} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-mid-cross-sig-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders middle and signal paths', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineDonchianMidCrossSig data={data} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-mid-cross-sig-middle-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-mid-cross-sig-signal-path"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineDonchianMidCrossSig data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-mid-cross-sig-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineDonchianMidCrossSig data={data} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-donchian-mid-cross-sig-badge"]',
    );
    expect(badge?.textContent).toContain('period 20');
    expect(badge?.textContent).toContain('signal 3');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineDonchianMidCrossSig data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-donchian-mid-cross-sig"]',
    );
    expect(root?.getAttribute('aria-label')).toBe(
      'Donchian middle-over-Signal chart',
    );
  });

  it('exposes data-*-count counters', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineDonchianMidCrossSig data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-donchian-mid-cross-sig"]',
    );
    expect(root?.getAttribute('data-bullish-count')).toBe(
      String(60 - WARMUP),
    );
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineDonchianMidCrossSig
        data={data}
        hiddenSeries={['signal']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-mid-cross-sig-signal-path"]',
      ),
    ).toBeNull();
  });
});
