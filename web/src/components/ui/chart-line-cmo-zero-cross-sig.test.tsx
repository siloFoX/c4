import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineCmoZeroCrossSig,
  DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_HEIGHT,
  DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_PADDING,
  DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_PANEL_GAP,
  DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_PERIOD,
  DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_SIGNAL_LENGTH,
  DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_WIDTH,
  classifyLineCmoZeroCrossSigBias,
  classifyLineCmoZeroCrossSigRegime,
  computeLineCmoZeroCrossSig,
  computeLineCmoZeroCrossSigLayout,
  describeLineCmoZeroCrossSigChart,
  detectLineCmoZeroCrossSigCrosses,
  getLineCmoZeroCrossSigFinitePoints,
  normalizeLineCmoZeroCrossSigLength,
  runLineCmoZeroCrossSig,
  type ChartLineCmoZeroCrossSigPoint,
} from './chart-line-cmo-zero-cross-sig';

const PERIOD = 14;
const SIGNAL = 9;
const WARMUP = PERIOD + SIGNAL; // 23

const buildConst = (n: number, k: number): ChartLineCmoZeroCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: k }));

const buildLinearUp = (n: number): ChartLineCmoZeroCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: i }));

const buildLinearDown = (n: number): ChartLineCmoZeroCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: -i }));

// Synthetic series that generates CMO-vs-signal crossings:
// linear up for first half, then linear down for second half.
const buildPeak = (n: number): ChartLineCmoZeroCrossSigPoint[] => {
  const half = Math.floor(n / 2);
  return Array.from({ length: n }, (_, i) => ({
    x: i,
    close: i < half ? i : 2 * (half - 1) - i + (half - 1),
  }));
};

describe('ChartLineCmoZeroCrossSig defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_PANEL_GAP).toBe(12);
  });

  it('exports canonical Chande tuning', () => {
    expect(DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_PERIOD).toBe(14);
    expect(DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_SIGNAL_LENGTH).toBe(9);
  });
});

describe('getLineCmoZeroCrossSigFinitePoints', () => {
  it('filters NaN/Infinity', () => {
    const points = [
      { x: 0, close: 1.5 },
      { x: NaN, close: 1.5 },
      { x: 2, close: Infinity },
      { x: 3, close: 2 },
    ];
    expect(getLineCmoZeroCrossSigFinitePoints(points)).toEqual([
      { x: 0, close: 1.5 },
      { x: 3, close: 2 },
    ]);
  });

  it('returns empty for null/non-array', () => {
    expect(getLineCmoZeroCrossSigFinitePoints(null)).toEqual([]);
    expect(getLineCmoZeroCrossSigFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineCmoZeroCrossSigLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineCmoZeroCrossSigLength(14.7, 14)).toBe(14);
  });
  it('falls back on invalid', () => {
    expect(normalizeLineCmoZeroCrossSigLength(0, 14)).toBe(14);
    expect(normalizeLineCmoZeroCrossSigLength(-1, 9)).toBe(9);
    expect(normalizeLineCmoZeroCrossSigLength(NaN, 14)).toBe(14);
  });
});

describe('computeLineCmoZeroCrossSig CONST', () => {
  it('CMO = 0 from i = period onwards (divide-by-zero guard)', () => {
    const data = buildConst(40, 50);
    const out = computeLineCmoZeroCrossSig(data);
    for (let i = 0; i < PERIOD; i += 1) expect(out.cmo[i]).toBeNull();
    for (let i = PERIOD; i < 40; i += 1) expect(out.cmo[i] as number).toBe(0);
  });

  it('signal = 0 from i = period + signalLength - 1 onwards', () => {
    const data = buildConst(40, 50);
    const out = computeLineCmoZeroCrossSig(data);
    for (let i = PERIOD + SIGNAL - 1; i < 40; i += 1) {
      expect(out.signal[i] as number).toBe(0);
    }
  });
});

describe('computeLineCmoZeroCrossSig LINEAR UP', () => {
  it('CMO = 100 constant (Su = period, Sd = 0)', () => {
    const data = buildLinearUp(40);
    const out = computeLineCmoZeroCrossSig(data);
    for (let i = PERIOD; i < 40; i += 1) {
      expect(out.cmo[i] as number).toBe(100);
    }
  });

  it('signal = 100 constant from i = period + signalLength - 1', () => {
    const data = buildLinearUp(40);
    const out = computeLineCmoZeroCrossSig(data);
    for (let i = PERIOD + SIGNAL - 1; i < 40; i += 1) {
      expect(out.signal[i] as number).toBe(100);
    }
  });
});

describe('computeLineCmoZeroCrossSig LINEAR DOWN', () => {
  it('CMO = -100 constant (Su = 0, Sd = period)', () => {
    const data = buildLinearDown(40);
    const out = computeLineCmoZeroCrossSig(data);
    for (let i = PERIOD; i < 40; i += 1) {
      expect(out.cmo[i] as number).toBe(-100);
    }
  });

  it('signal = -100 constant', () => {
    const data = buildLinearDown(40);
    const out = computeLineCmoZeroCrossSig(data);
    for (let i = PERIOD + SIGNAL - 1; i < 40; i += 1) {
      expect(out.signal[i] as number).toBe(-100);
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineCmoZeroCrossSig([])).toEqual({ cmo: [], signal: [] });
  });
});

describe('classifyLineCmoZeroCrossSigRegime', () => {
  it('null inputs -> none', () => {
    expect(classifyLineCmoZeroCrossSigRegime(null, 10)).toBe('none');
    expect(classifyLineCmoZeroCrossSigRegime(10, null)).toBe('none');
    expect(classifyLineCmoZeroCrossSigRegime(null, null)).toBe('none');
  });
  it('CMO > signal -> bullish', () => {
    expect(classifyLineCmoZeroCrossSigRegime(30, 10)).toBe('bullish');
  });
  it('CMO === signal -> bullish (via >=)', () => {
    expect(classifyLineCmoZeroCrossSigRegime(20, 20)).toBe('bullish');
    expect(classifyLineCmoZeroCrossSigRegime(0, 0)).toBe('bullish');
  });
  it('CMO < signal -> bearish', () => {
    expect(classifyLineCmoZeroCrossSigRegime(10, 30)).toBe('bearish');
  });
});

describe('classifyLineCmoZeroCrossSigBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineCmoZeroCrossSigBias(60, 50)).toBe('up');
    expect(classifyLineCmoZeroCrossSigBias(40, 50)).toBe('down');
    expect(classifyLineCmoZeroCrossSigBias(50, 50)).toBe('flat');
    expect(classifyLineCmoZeroCrossSigBias(null, 50)).toBe('none');
    expect(classifyLineCmoZeroCrossSigBias(50, null)).toBe('none');
  });
});

describe('detectLineCmoZeroCrossSigCrosses', () => {
  it('fires BULLISH when CMO crosses up through signal', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: i,
    }));
    const cmo: Array<number | null> = [10, 20, 35, 40];
    const sig: Array<number | null> = [30, 25, 20, 15];
    const out = detectLineCmoZeroCrossSigCrosses(series, cmo, sig);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
    expect(out[0]?.index).toBe(2);
  });

  it('fires BEARISH when CMO crosses down through signal', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: i,
    }));
    const cmo: Array<number | null> = [30, 25, 15, 10];
    const sig: Array<number | null> = [10, 20, 30, 35];
    const out = detectLineCmoZeroCrossSigCrosses(series, cmo, sig);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
    expect(out[0]?.index).toBe(2);
  });

  it('does not fire when values stay on same side', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: i,
    }));
    const cmo: Array<number | null> = [30, 35, 40, 45];
    const sig: Array<number | null> = [10, 15, 20, 25];
    const out = detectLineCmoZeroCrossSigCrosses(series, cmo, sig);
    expect(out).toHaveLength(0);
  });

  it('skips bars with null values', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: i,
    }));
    const cmo: Array<number | null> = [null, null, 20, 35];
    const sig: Array<number | null> = [null, null, 25, 20];
    const out = detectLineCmoZeroCrossSigCrosses(series, cmo, sig);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
  });

  it('bias up when (CMO - signal) rises across the cross', () => {
    const series = Array.from({ length: 3 }, (_, i) => ({
      x: i,
      close: i,
    }));
    const cmo: Array<number | null> = [20, 35, 40];
    const sig: Array<number | null> = [25, 20, 15];
    const out = detectLineCmoZeroCrossSigCrosses(series, cmo, sig);
    expect(out[0]?.bias).toBe('up');
  });
});

describe('runLineCmoZeroCrossSig CONST', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST ${K}: CMO = signal = 0, regime bullish, 0 crosses`, () => {
      const data = buildConst(40, K);
      const run = runLineCmoZeroCrossSig(data);
      expect(run.period).toBe(PERIOD);
      expect(run.signalLength).toBe(SIGNAL);
      for (let i = PERIOD + SIGNAL - 1; i < 40; i += 1) {
        expect(run.cmoValues[i] as number).toBe(0);
        expect(run.signalValues[i] as number).toBe(0);
      }
      expect(run.bullishCount).toBeGreaterThan(0);
      expect(run.bearishCount).toBe(0);
      expect(run.crosses).toHaveLength(0);
      expect(run.ok).toBe(true);
    });
  }
});

describe('runLineCmoZeroCrossSig LINEAR UP', () => {
  it('CMO = signal = 100, regime bullish, 0 crosses', () => {
    const data = buildLinearUp(40);
    const run = runLineCmoZeroCrossSig(data);
    for (let i = PERIOD + SIGNAL - 1; i < 40; i += 1) {
      expect(run.cmoValues[i] as number).toBe(100);
      expect(run.signalValues[i] as number).toBe(100);
    }
    expect(run.bullishCount).toBeGreaterThan(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineCmoZeroCrossSig LINEAR DOWN', () => {
  it('CMO = signal = -100, regime bullish (via ===), 0 crosses', () => {
    const data = buildLinearDown(40);
    const run = runLineCmoZeroCrossSig(data);
    for (let i = PERIOD + SIGNAL - 1; i < 40; i += 1) {
      expect(run.cmoValues[i] as number).toBe(-100);
      expect(run.signalValues[i] as number).toBe(-100);
    }
    // Family convention: CMO === signal counts as bullish via `>=`
    expect(run.bullishCount).toBeGreaterThan(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineCmoZeroCrossSig PEAK (reversing series)', () => {
  it('produces at least one bearish cross when uptrend reverses', () => {
    const data = buildPeak(80);
    const run = runLineCmoZeroCrossSig(data);
    expect(run.crosses.length).toBeGreaterThan(0);
    const hasBearish = run.crosses.some((c) => c.kind === 'bearish');
    expect(hasBearish).toBe(true);
  });
});

describe('runLineCmoZeroCrossSig misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineCmoZeroCrossSigPoint[] = [
      { x: 2, close: 1 },
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    const run = runLineCmoZeroCrossSig(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConst(WARMUP, 50);
    const run = runLineCmoZeroCrossSig(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineCmoZeroCrossSig([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom period and signalLength', () => {
    const data = buildLinearUp(40);
    const run = runLineCmoZeroCrossSig(data, { period: 7, signalLength: 3 });
    expect(run.period).toBe(7);
    expect(run.signalLength).toBe(3);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(40);
    const run = runLineCmoZeroCrossSig(data);
    expect(run.bullishCount + run.bearishCount + run.noneCount).toBe(40);
  });

  it('cross counts match crosses length', () => {
    const data = buildPeak(80);
    const run = runLineCmoZeroCrossSig(data);
    expect(run.bullishCrossCount + run.bearishCrossCount).toBe(
      run.crosses.length,
    );
  });

  it('exposes diffValues = CMO - signal for audit', () => {
    const data = buildLinearUp(40);
    const run = runLineCmoZeroCrossSig(data);
    for (let i = PERIOD + SIGNAL - 1; i < 40; i += 1) {
      expect(run.diffValues[i] as number).toBe(0); // CMO=signal=100
    }
  });
});

describe('computeLineCmoZeroCrossSigLayout', () => {
  it('renders SVG paths for LINEAR UP', () => {
    const data = buildLinearUp(40);
    const layout = computeLineCmoZeroCrossSigLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(40);
    expect(layout.cmoPath).toContain('M ');
    expect(layout.signalPath).toContain('M ');
  });

  it('panel hard-locked to [-100, 100]', () => {
    const layout = computeLineCmoZeroCrossSigLayout({
      data: buildLinearUp(40),
    });
    expect(layout.oscMin).toBe(-100);
    expect(layout.oscMax).toBe(100);
  });

  it('zero line at panel midpoint', () => {
    const layout = computeLineCmoZeroCrossSigLayout({
      data: buildLinearUp(40),
    });
    const mid = (layout.oscTop + layout.oscBottom) / 2;
    expect(layout.zeroLineY).toBeCloseTo(mid, 6);
  });

  it('LINEAR UP produces 0 cross markers', () => {
    const layout = computeLineCmoZeroCrossSigLayout({
      data: buildLinearUp(40),
    });
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('PEAK produces > 0 cross markers', () => {
    const layout = computeLineCmoZeroCrossSigLayout({
      data: buildPeak(80),
    });
    expect(layout.crossMarkers.length).toBeGreaterThan(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineCmoZeroCrossSigLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.cmoPath).toBe('');
    expect(layout.signalPath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineCmoZeroCrossSigLayout({
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
    const data = buildConst(40, 100);
    const layout = computeLineCmoZeroCrossSigLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });
});

describe('describeLineCmoZeroCrossSigChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineCmoZeroCrossSigChart([])).toBe('No data');
  });

  it('mentions bar count, period, signal, centerline momentum trigger', () => {
    const desc = describeLineCmoZeroCrossSigChart(buildLinearUp(40));
    expect(desc).toContain('40 bars');
    expect(desc).toContain('period 14');
    expect(desc).toContain('signal 9');
    expect(desc).toContain('centerline momentum trigger');
  });
});

describe('<ChartLineCmoZeroCrossSig /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(40);
    const { container } = render(<ChartLineCmoZeroCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-cmo-zero-cross-sig"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-period')).toBe(String(PERIOD));
    expect(root?.getAttribute('data-signal-length')).toBe(String(SIGNAL));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(<ChartLineCmoZeroCrossSig data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-cmo-zero-cross-sig-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders CMO + signal paths and zero line', () => {
    const data = buildLinearUp(40);
    const { container } = render(<ChartLineCmoZeroCrossSig data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-cmo-zero-cross-sig-cmo-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-cmo-zero-cross-sig-signal-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-cmo-zero-cross-sig-zero-line"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineCmoZeroCrossSig data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cmo-zero-cross-sig-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildLinearUp(40);
    const { container } = render(<ChartLineCmoZeroCrossSig data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-cmo-zero-cross-sig-badge"]',
    );
    expect(badge?.textContent).toContain('period 14');
    expect(badge?.textContent).toContain('signal 9');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(40);
    const { container } = render(<ChartLineCmoZeroCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-cmo-zero-cross-sig"]',
    );
    expect(root?.getAttribute('aria-label')).toBe(
      'Chande Momentum Oscillator zero-line cross-sig chart',
    );
  });

  it('exposes data-cross-count counter for LINEAR UP', () => {
    const data = buildLinearUp(40);
    const { container } = render(<ChartLineCmoZeroCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-cmo-zero-cross-sig"]',
    );
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('exposes non-zero cross-count for PEAK', () => {
    const data = buildPeak(80);
    const { container } = render(<ChartLineCmoZeroCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-cmo-zero-cross-sig"]',
    );
    const crossCount = Number(root?.getAttribute('data-cross-count'));
    expect(crossCount).toBeGreaterThan(0);
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineCmoZeroCrossSig data={data} hiddenSeries={['cmo']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cmo-zero-cross-sig-cmo-path"]',
      ),
    ).toBeNull();
  });

  it('renders three legend buttons (close, CMO, signal)', () => {
    const data = buildLinearUp(40);
    const { container } = render(<ChartLineCmoZeroCrossSig data={data} />);
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-cmo-zero-cross-sig-legend"] button',
    );
    expect(buttons).toHaveLength(3);
  });

  it('exposes bullish-count counter', () => {
    const data = buildLinearUp(40);
    const { container } = render(<ChartLineCmoZeroCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-cmo-zero-cross-sig"]',
    );
    const c = Number(root?.getAttribute('data-bullish-count'));
    expect(c).toBeGreaterThan(0);
  });
});
