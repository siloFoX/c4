import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineObvMidCrossSig,
  DEFAULT_CHART_LINE_OBV_MID_CROSS_SIG_HEIGHT,
  DEFAULT_CHART_LINE_OBV_MID_CROSS_SIG_PADDING,
  DEFAULT_CHART_LINE_OBV_MID_CROSS_SIG_PANEL_GAP,
  DEFAULT_CHART_LINE_OBV_MID_CROSS_SIG_SIGNAL_LENGTH,
  DEFAULT_CHART_LINE_OBV_MID_CROSS_SIG_WIDTH,
  applyLineObvMidCrossSigSma,
  classifyLineObvMidCrossSigBias,
  classifyLineObvMidCrossSigRegime,
  computeLineObvMidCrossSig,
  computeLineObvMidCrossSigLayout,
  describeLineObvMidCrossSigChart,
  detectLineObvMidCrossSigCrosses,
  getLineObvMidCrossSigFinitePoints,
  normalizeLineObvMidCrossSigLength,
  runLineObvMidCrossSig,
  type ChartLineObvMidCrossSigPoint,
} from './chart-line-obv-mid-cross-sig';

const SIGNAL = 14;
const WARMUP = SIGNAL - 1; // 13
const SIGNAL_LAG = (SIGNAL - 1) / 2; // 6.5

const buildConst = (
  n: number,
  k: number,
  volume = 1,
): ChartLineObvMidCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: k, volume }));

const buildLinearUp = (
  n: number,
  volume = 1,
): ChartLineObvMidCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: i, volume }));

const buildLinearDown = (
  n: number,
  volume = 1,
): ChartLineObvMidCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: -i, volume }));

describe('ChartLineObvMidCrossSig defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_OBV_MID_CROSS_SIG_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_OBV_MID_CROSS_SIG_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_OBV_MID_CROSS_SIG_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_OBV_MID_CROSS_SIG_PANEL_GAP).toBe(12);
  });

  it('exports canonical OBV tuning', () => {
    expect(DEFAULT_CHART_LINE_OBV_MID_CROSS_SIG_SIGNAL_LENGTH).toBe(14);
  });
});

describe('getLineObvMidCrossSigFinitePoints', () => {
  it('filters NaN/Infinity/negative volume', () => {
    const points = [
      { x: 0, close: 1, volume: 1 },
      { x: NaN, close: 2, volume: 1 },
      { x: 2, close: Infinity, volume: 1 },
      { x: 3, close: 4, volume: 1 },
      { x: 4, close: 5, volume: -1 },
    ];
    expect(getLineObvMidCrossSigFinitePoints(points)).toEqual([
      { x: 0, close: 1, volume: 1 },
      { x: 3, close: 4, volume: 1 },
    ]);
  });

  it('returns empty for null and non-array', () => {
    expect(getLineObvMidCrossSigFinitePoints(null)).toEqual([]);
    expect(getLineObvMidCrossSigFinitePoints(undefined)).toEqual([]);
    expect(
      getLineObvMidCrossSigFinitePoints(
        // @ts-expect-error -- intentionally bad
        'oops',
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineObvMidCrossSigLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineObvMidCrossSigLength(14.7, 14)).toBe(14);
    expect(normalizeLineObvMidCrossSigLength(0, 14)).toBe(14);
    expect(normalizeLineObvMidCrossSigLength(NaN, 14)).toBe(14);
  });
});

describe('applyLineObvMidCrossSigSma', () => {
  it('CONST returns constant', () => {
    const values: Array<number | null> = Array.from({ length: 20 }, () => 7);
    const sma = applyLineObvMidCrossSigSma(values, SIGNAL);
    for (let i = WARMUP; i < 20; i += 1) expect(sma[i]).toBe(7);
  });

  it('LINEAR returns i - (L-1)/2', () => {
    const values: Array<number | null> = Array.from(
      { length: 30 },
      (_, i) => i,
    );
    const sma = applyLineObvMidCrossSigSma(values, SIGNAL);
    for (let i = WARMUP; i < 30; i += 1) {
      expect(sma[i] as number).toBeCloseTo(i - SIGNAL_LAG, 9);
    }
  });
});

describe('computeLineObvMidCrossSig CONST', () => {
  it('OBV stays at 0 when close is flat', () => {
    const data = buildConst(40, 50);
    const out = computeLineObvMidCrossSig(data);
    for (let i = 0; i < 40; i += 1) {
      expect(out.obv[i]).toBe(0);
    }
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.signal[i]).toBe(0);
    }
  });
});

describe('computeLineObvMidCrossSig LINEAR UP', () => {
  it('OBV = i (volume=1 added each bar)', () => {
    const data = buildLinearUp(40);
    const out = computeLineObvMidCrossSig(data);
    for (let i = 0; i < 40; i += 1) {
      expect(out.obv[i]).toBe(i);
    }
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.signal[i] as number).toBeCloseTo(i - SIGNAL_LAG, 9);
    }
  });

  it('OBV - signal = +6.5 from warmup', () => {
    const data = buildLinearUp(40);
    const out = computeLineObvMidCrossSig(data);
    for (let i = WARMUP; i < 40; i += 1) {
      const o = out.obv[i] as number;
      const s = out.signal[i] as number;
      expect(o - s).toBeCloseTo(SIGNAL_LAG, 9);
    }
  });
});

describe('computeLineObvMidCrossSig LINEAR DOWN', () => {
  it('OBV = -i (volume=1 subtracted each bar)', () => {
    const data = buildLinearDown(40);
    const out = computeLineObvMidCrossSig(data);
    expect(out.obv[0]).toBe(0); // -0 is normalised to +0 by posZero
    for (let i = 1; i < 40; i += 1) {
      expect(out.obv[i]).toBe(-i);
    }
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.signal[i] as number).toBeCloseTo(-i + SIGNAL_LAG, 9);
    }
  });

  it('OBV - signal = -6.5 from warmup', () => {
    const data = buildLinearDown(40);
    const out = computeLineObvMidCrossSig(data);
    for (let i = WARMUP; i < 40; i += 1) {
      const o = out.obv[i] as number;
      const s = out.signal[i] as number;
      expect(o - s).toBeCloseTo(-SIGNAL_LAG, 9);
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineObvMidCrossSig([])).toEqual({ obv: [], signal: [] });
  });
});

describe('computeLineObvMidCrossSig with varying volume', () => {
  it('honours per-bar volume in the cumulative sum', () => {
    const data: ChartLineObvMidCrossSigPoint[] = [
      { x: 0, close: 0, volume: 0 },
      { x: 1, close: 1, volume: 10 },
      { x: 2, close: 2, volume: 5 },
      { x: 3, close: 1, volume: 3 },
    ];
    const out = computeLineObvMidCrossSig(data);
    expect(out.obv[0]).toBe(0);
    expect(out.obv[1]).toBe(10);
    expect(out.obv[2]).toBe(15);
    expect(out.obv[3]).toBe(12);
  });
});

describe('classifyLineObvMidCrossSigRegime', () => {
  it('null -> none', () => {
    expect(classifyLineObvMidCrossSigRegime(null, 5)).toBe('none');
  });
  it('OBV >= signal -> bullish', () => {
    expect(classifyLineObvMidCrossSigRegime(5, 5)).toBe('bullish');
    expect(classifyLineObvMidCrossSigRegime(10, 5)).toBe('bullish');
  });
  it('OBV < signal -> bearish', () => {
    expect(classifyLineObvMidCrossSigRegime(2, 5)).toBe('bearish');
  });
});

describe('classifyLineObvMidCrossSigBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineObvMidCrossSigBias(10, 5)).toBe('up');
    expect(classifyLineObvMidCrossSigBias(2, 5)).toBe('down');
    expect(classifyLineObvMidCrossSigBias(5, 5)).toBe('flat');
    expect(classifyLineObvMidCrossSigBias(null, 5)).toBe('none');
  });
});

describe('detectLineObvMidCrossSigCrosses', () => {
  it('detects bullish trigger', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
      volume: 1,
    }));
    const obv: Array<number | null> = [4, 5, 7, 8];
    const signal: Array<number | null> = [5, 5, 6, 6];
    const out = detectLineObvMidCrossSigCrosses(series, obv, signal);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
  });

  it('detects bearish trigger', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
      volume: 1,
    }));
    const obv: Array<number | null> = [8, 7, 5, 4];
    const signal: Array<number | null> = [6, 6, 6, 6];
    const out = detectLineObvMidCrossSigCrosses(series, obv, signal);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
  });

  it('does not fire on null values', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
      volume: 1,
    }));
    const obv: Array<number | null> = [null, null, 5, 7];
    const signal: Array<number | null> = [null, null, 4, 4];
    expect(
      detectLineObvMidCrossSigCrosses(series, obv, signal),
    ).toHaveLength(0);
  });

  it('does not double-fire', () => {
    const series = Array.from({ length: 5 }, (_, i) => ({
      x: i,
      close: 1,
      volume: 1,
    }));
    const obv: Array<number | null> = [4, 5, 6, 7, 8];
    const signal: Array<number | null> = [5, 4, 4, 4, 4];
    expect(detectLineObvMidCrossSigCrosses(series, obv, signal)).toHaveLength(
      1,
    );
  });
});

describe('runLineObvMidCrossSig CONST K', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST close=${K}, vol=1: OBV=0, signal=0, all bullish, 0 triggers`, () => {
      const data = buildConst(60, K);
      const run = runLineObvMidCrossSig(data);
      expect(run.signalLength).toBe(SIGNAL);
      for (let i = 0; i < WARMUP; i += 1) {
        expect(run.signalValues[i]).toBeNull();
      }
      for (let i = WARMUP; i < 60; i += 1) {
        expect(run.obvValues[i]).toBe(0);
        expect(run.signalValues[i]).toBe(0);
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

describe('runLineObvMidCrossSig LINEAR UP', () => {
  it('LINEAR UP: OBV - signal = +6.5, all bullish, 0 triggers', () => {
    const data = buildLinearUp(60);
    const run = runLineObvMidCrossSig(data);
    for (let i = WARMUP; i < 60; i += 1) {
      expect(run.samples[i]?.regime).toBe('bullish');
      const o = run.obvValues[i] as number;
      const s = run.signalValues[i] as number;
      expect(o - s).toBeCloseTo(SIGNAL_LAG, 9);
    }
    expect(run.bullishCount).toBe(60 - WARMUP);
    expect(run.bearishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineObvMidCrossSig LINEAR DOWN', () => {
  it('LINEAR DOWN: OBV - signal = -6.5, all bearish, 0 triggers', () => {
    const data = buildLinearDown(60);
    const run = runLineObvMidCrossSig(data);
    for (let i = WARMUP; i < 60; i += 1) {
      expect(run.samples[i]?.regime).toBe('bearish');
      const o = run.obvValues[i] as number;
      const s = run.signalValues[i] as number;
      expect(o - s).toBeCloseTo(-SIGNAL_LAG, 9);
    }
    expect(run.bearishCount).toBe(60 - WARMUP);
    expect(run.bullishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineObvMidCrossSig misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineObvMidCrossSigPoint[] = [
      { x: 2, close: 1, volume: 1 },
      { x: 0, close: 1, volume: 1 },
      { x: 1, close: 1, volume: 1 },
    ];
    const run = runLineObvMidCrossSig(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConst(13, 50);
    const run = runLineObvMidCrossSig(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineObvMidCrossSig([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom signalLength', () => {
    const data = buildLinearUp(60);
    const run = runLineObvMidCrossSig(data, { signalLength: 7 });
    expect(run.signalLength).toBe(7);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(60);
    const run = runLineObvMidCrossSig(data);
    expect(run.bullishCount + run.bearishCount + run.noneCount).toBe(60);
  });
});

describe('computeLineObvMidCrossSigLayout', () => {
  it('renders SVG paths for LINEAR UP', () => {
    const data = buildLinearUp(60);
    const layout = computeLineObvMidCrossSigLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(60);
    expect(layout.obvPath).toContain('M ');
    expect(layout.signalPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineObvMidCrossSigLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.obvPath).toBe('');
    expect(layout.signalPath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineObvMidCrossSigLayout({
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
    const layout = computeLineObvMidCrossSigLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });
});

describe('describeLineObvMidCrossSigChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineObvMidCrossSigChart([])).toBe('No data');
  });

  it('mentions bar count, signal length, accumulation distribution', () => {
    const desc = describeLineObvMidCrossSigChart(buildLinearUp(60));
    expect(desc).toContain('60 bars');
    expect(desc).toContain('signalLength 14');
    expect(desc).toContain('accumulation distribution');
    expect(desc).toContain('bias coloring');
  });
});

describe('<ChartLineObvMidCrossSig /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineObvMidCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-obv-mid-cross-sig"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-signal-length')).toBe(String(SIGNAL));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(<ChartLineObvMidCrossSig data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-obv-mid-cross-sig-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders OBV and signal paths', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineObvMidCrossSig data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-obv-mid-cross-sig-obv-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-obv-mid-cross-sig-signal-path"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineObvMidCrossSig data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-obv-mid-cross-sig-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineObvMidCrossSig data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-obv-mid-cross-sig-badge"]',
    );
    expect(badge?.textContent).toContain('signal 14');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineObvMidCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-obv-mid-cross-sig"]',
    );
    expect(root?.getAttribute('aria-label')).toBe(
      'OBV centerline-over-Signal chart',
    );
  });

  it('exposes data-*-count counters for LINEAR UP', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineObvMidCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-obv-mid-cross-sig"]',
    );
    expect(root?.getAttribute('data-bullish-count')).toBe(
      String(60 - WARMUP),
    );
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineObvMidCrossSig data={data} hiddenSeries={['signal']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-obv-mid-cross-sig-signal-path"]',
      ),
    ).toBeNull();
  });
});
