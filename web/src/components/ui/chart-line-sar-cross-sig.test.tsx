import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineSarCrossSig,
  DEFAULT_CHART_LINE_SAR_CROSS_SIG_HEIGHT,
  DEFAULT_CHART_LINE_SAR_CROSS_SIG_MAX_STEP,
  DEFAULT_CHART_LINE_SAR_CROSS_SIG_PADDING,
  DEFAULT_CHART_LINE_SAR_CROSS_SIG_PANEL_GAP,
  DEFAULT_CHART_LINE_SAR_CROSS_SIG_SIGNAL_LENGTH,
  DEFAULT_CHART_LINE_SAR_CROSS_SIG_STEP,
  DEFAULT_CHART_LINE_SAR_CROSS_SIG_WIDTH,
  classifyLineSarCrossSigBias,
  classifyLineSarCrossSigRegime,
  computeLineSarCrossSig,
  computeLineSarCrossSigLayout,
  describeLineSarCrossSigChart,
  detectLineSarCrossSigCrosses,
  getLineSarCrossSigFinitePoints,
  normalizeLineSarCrossSigLength,
  normalizeLineSarCrossSigStep,
  runLineSarCrossSig,
  type ChartLineSarCrossSigPoint,
} from './chart-line-sar-cross-sig';

const SIGNAL = 9;

const buildConst = (n: number, k: number): ChartLineSarCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, value: k }));

const buildLinearUp = (n: number): ChartLineSarCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, value: i }));

const buildLinearDown = (n: number): ChartLineSarCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, value: -i }));

describe('ChartLineSarCrossSig defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_SAR_CROSS_SIG_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_SAR_CROSS_SIG_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_SAR_CROSS_SIG_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_SAR_CROSS_SIG_PANEL_GAP).toBe(12);
  });

  it('exports canonical Wilder SAR tuning', () => {
    expect(DEFAULT_CHART_LINE_SAR_CROSS_SIG_STEP).toBeCloseTo(0.02, 6);
    expect(DEFAULT_CHART_LINE_SAR_CROSS_SIG_MAX_STEP).toBeCloseTo(0.2, 6);
    expect(DEFAULT_CHART_LINE_SAR_CROSS_SIG_SIGNAL_LENGTH).toBe(9);
  });
});

describe('getLineSarCrossSigFinitePoints', () => {
  it('filters NaN/Infinity', () => {
    const points = [
      { x: 0, value: 1.5 },
      { x: NaN, value: 1.5 },
      { x: 2, value: Infinity },
      { x: 3, value: 2 },
    ];
    expect(getLineSarCrossSigFinitePoints(points)).toEqual([
      { x: 0, value: 1.5 },
      { x: 3, value: 2 },
    ]);
  });

  it('returns empty for null/non-array', () => {
    expect(getLineSarCrossSigFinitePoints(null)).toEqual([]);
    expect(getLineSarCrossSigFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineSarCrossSigLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineSarCrossSigLength(9.7, 9)).toBe(9);
  });
  it('falls back on invalid', () => {
    expect(normalizeLineSarCrossSigLength(0, 9)).toBe(9);
    expect(normalizeLineSarCrossSigLength(-1, 9)).toBe(9);
    expect(normalizeLineSarCrossSigLength(NaN, 9)).toBe(9);
  });
});

describe('normalizeLineSarCrossSigStep', () => {
  it('keeps positive finite values', () => {
    expect(normalizeLineSarCrossSigStep(0.05, 0.02)).toBeCloseTo(0.05, 6);
  });
  it('falls back on non-positive or non-finite', () => {
    expect(normalizeLineSarCrossSigStep(0, 0.02)).toBeCloseTo(0.02, 6);
    expect(normalizeLineSarCrossSigStep(-1, 0.02)).toBeCloseTo(0.02, 6);
    expect(normalizeLineSarCrossSigStep(NaN, 0.02)).toBeCloseTo(0.02, 6);
  });
});

describe('computeLineSarCrossSig CONST', () => {
  it('SAR = K constant for all bars', () => {
    const data = buildConst(40, 50);
    const out = computeLineSarCrossSig(data);
    for (let i = 0; i < 40; i += 1) {
      expect(out.sar[i] as number).toBe(50);
    }
  });

  it('signal = K constant from signalLength-1 onwards', () => {
    const data = buildConst(40, 50);
    const out = computeLineSarCrossSig(data);
    for (let i = SIGNAL - 1; i < 40; i += 1) {
      expect(out.signal[i] as number).toBe(50);
    }
  });
});

describe('computeLineSarCrossSig LINEAR UP', () => {
  it('SAR exists for every bar', () => {
    const data = buildLinearUp(40);
    const out = computeLineSarCrossSig(data);
    for (let i = 0; i < 40; i += 1) {
      expect(out.sar[i]).not.toBeNull();
    }
  });

  it('signal exists from signalLength-1 onwards', () => {
    const data = buildLinearUp(40);
    const out = computeLineSarCrossSig(data);
    for (let i = SIGNAL - 1; i < 40; i += 1) {
      expect(out.signal[i]).not.toBeNull();
    }
  });

  it('trend stays up throughout (no piercing)', () => {
    const data = buildLinearUp(40);
    const out = computeLineSarCrossSig(data);
    for (let i = 1; i < 40; i += 1) {
      expect(out.trends[i]).toBe('up');
    }
  });
});

describe('computeLineSarCrossSig LINEAR DOWN', () => {
  it('SAR exists for every bar', () => {
    const data = buildLinearDown(40);
    const out = computeLineSarCrossSig(data);
    for (let i = 0; i < 40; i += 1) {
      expect(out.sar[i]).not.toBeNull();
    }
  });

  it('trend stays down throughout (no piercing)', () => {
    const data = buildLinearDown(40);
    const out = computeLineSarCrossSig(data);
    for (let i = 1; i < 40; i += 1) {
      expect(out.trends[i]).toBe('down');
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineSarCrossSig([])).toEqual({
      sar: [],
      signal: [],
      trends: [],
      reversed: [],
    });
  });
});

describe('classifyLineSarCrossSigRegime', () => {
  it('null inputs -> none', () => {
    expect(classifyLineSarCrossSigRegime(null, 10)).toBe('none');
    expect(classifyLineSarCrossSigRegime(10, null)).toBe('none');
    expect(classifyLineSarCrossSigRegime(null, null)).toBe('none');
  });
  it('SAR > signal -> bullish', () => {
    expect(classifyLineSarCrossSigRegime(30, 10)).toBe('bullish');
  });
  it('SAR === signal -> bullish (via >=)', () => {
    expect(classifyLineSarCrossSigRegime(20, 20)).toBe('bullish');
    expect(classifyLineSarCrossSigRegime(0, 0)).toBe('bullish');
  });
  it('SAR < signal -> bearish', () => {
    expect(classifyLineSarCrossSigRegime(10, 30)).toBe('bearish');
  });
});

describe('classifyLineSarCrossSigBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineSarCrossSigBias(60, 50)).toBe('up');
    expect(classifyLineSarCrossSigBias(40, 50)).toBe('down');
    expect(classifyLineSarCrossSigBias(50, 50)).toBe('flat');
    expect(classifyLineSarCrossSigBias(null, 50)).toBe('none');
    expect(classifyLineSarCrossSigBias(50, null)).toBe('none');
  });
});

describe('detectLineSarCrossSigCrosses', () => {
  it('fires BULLISH when SAR crosses up through signal', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      value: i,
    }));
    const sar: Array<number | null> = [10, 20, 35, 40];
    const sig: Array<number | null> = [30, 25, 20, 15];
    // i=1: prev(10<=30) cur(20<=25) -> no cross
    // i=2: prev(20<=25) cur(35>20) -> BULLISH
    const out = detectLineSarCrossSigCrosses(series, sar, sig);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
    expect(out[0]?.index).toBe(2);
  });

  it('fires BEARISH when SAR crosses down through signal', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      value: i,
    }));
    const sar: Array<number | null> = [30, 25, 15, 10];
    const sig: Array<number | null> = [10, 20, 30, 35];
    // i=2: prev(25>=20) cur(15<30) -> BEARISH
    const out = detectLineSarCrossSigCrosses(series, sar, sig);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
    expect(out[0]?.index).toBe(2);
  });

  it('does not fire when values stay on same side', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      value: i,
    }));
    const sar: Array<number | null> = [30, 35, 40, 45];
    const sig: Array<number | null> = [10, 15, 20, 25];
    const out = detectLineSarCrossSigCrosses(series, sar, sig);
    expect(out).toHaveLength(0);
  });

  it('skips bars with null values', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      value: i,
    }));
    const sar: Array<number | null> = [null, null, 20, 35];
    const sig: Array<number | null> = [null, null, 25, 20];
    // i=3: prev(20<=25) cur(35>20) -> BULLISH
    const out = detectLineSarCrossSigCrosses(series, sar, sig);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
  });

  it('bias up when (SAR - signal) rises across the cross', () => {
    const series = Array.from({ length: 3 }, (_, i) => ({
      x: i,
      value: i,
    }));
    const sar: Array<number | null> = [20, 35, 40];
    const sig: Array<number | null> = [25, 20, 15];
    // i=1: prev diff=-5 cur diff=15 -> up
    const out = detectLineSarCrossSigCrosses(series, sar, sig);
    expect(out[0]?.bias).toBe('up');
  });
});

describe('runLineSarCrossSig CONST', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST ${K}: SAR = signal = K, regime bullish, 0 crosses`, () => {
      const data = buildConst(40, K);
      const run = runLineSarCrossSig(data);
      expect(run.step).toBeCloseTo(0.02, 6);
      expect(run.signalLength).toBe(SIGNAL);
      for (let i = SIGNAL - 1; i < 40; i += 1) {
        expect(run.sarValues[i] as number).toBe(K);
        expect(run.signalValues[i] as number).toBe(K);
      }
      // SAR === signal = K every bar -> regime 'bullish' (via >=)
      expect(run.bullishCount).toBeGreaterThan(0);
      expect(run.bearishCount).toBe(0);
      expect(run.crosses).toHaveLength(0);
      expect(run.ok).toBe(true);
    });
  }
});

describe('runLineSarCrossSig LINEAR UP', () => {
  it('SAR >= signal throughout the post-warmup window', () => {
    const data = buildLinearUp(60);
    const run = runLineSarCrossSig(data);
    for (let i = SIGNAL; i < 60; i += 1) {
      const s = run.sarValues[i] as number;
      const g = run.signalValues[i] as number;
      expect(s).toBeGreaterThanOrEqual(g);
    }
  });

  it('0 crosses (no transition from below in steady uptrend)', () => {
    const data = buildLinearUp(60);
    const run = runLineSarCrossSig(data);
    expect(run.crosses).toHaveLength(0);
  });

  it('regime is predominantly bullish', () => {
    const data = buildLinearUp(60);
    const run = runLineSarCrossSig(data);
    expect(run.bullishCount).toBeGreaterThan(run.bearishCount);
  });

  it('no SAR reversals in steady uptrend', () => {
    const data = buildLinearUp(60);
    const run = runLineSarCrossSig(data);
    expect(run.reversalCount).toBe(0);
  });
});

describe('runLineSarCrossSig LINEAR DOWN', () => {
  it('SAR <= signal throughout the post-warmup window', () => {
    const data = buildLinearDown(60);
    const run = runLineSarCrossSig(data);
    for (let i = SIGNAL; i < 60; i += 1) {
      const s = run.sarValues[i] as number;
      const g = run.signalValues[i] as number;
      expect(s).toBeLessThanOrEqual(g);
    }
  });

  it('0 crosses (no transition from above in steady downtrend)', () => {
    const data = buildLinearDown(60);
    const run = runLineSarCrossSig(data);
    expect(run.crosses).toHaveLength(0);
  });

  it('regime is predominantly bearish', () => {
    const data = buildLinearDown(60);
    const run = runLineSarCrossSig(data);
    expect(run.bearishCount).toBeGreaterThan(run.bullishCount);
  });

  it('no SAR reversals in steady downtrend', () => {
    const data = buildLinearDown(60);
    const run = runLineSarCrossSig(data);
    expect(run.reversalCount).toBe(0);
  });
});

describe('runLineSarCrossSig misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineSarCrossSigPoint[] = [
      { x: 2, value: 1 },
      { x: 0, value: 1 },
      { x: 1, value: 1 },
    ];
    const run = runLineSarCrossSig(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConst(8, 50);
    const run = runLineSarCrossSig(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineSarCrossSig([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom signalLength', () => {
    const data = buildLinearUp(60);
    const run = runLineSarCrossSig(data, { signalLength: 5 });
    expect(run.signalLength).toBe(5);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(60);
    const run = runLineSarCrossSig(data);
    expect(run.bullishCount + run.bearishCount + run.noneCount).toBe(60);
  });

  it('exposes diffValues for audit', () => {
    const data = buildConst(40, 50);
    const run = runLineSarCrossSig(data);
    for (let i = SIGNAL - 1; i < 40; i += 1) {
      expect(run.diffValues[i] as number).toBe(0);
    }
  });
});

describe('computeLineSarCrossSigLayout', () => {
  it('renders SVG paths for LINEAR UP', () => {
    const data = buildLinearUp(40);
    const layout = computeLineSarCrossSigLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(40);
    expect(layout.sarPath).toContain('M ');
    expect(layout.signalPath).toContain('M ');
  });

  it('LINEAR UP produces 0 cross markers', () => {
    const layout = computeLineSarCrossSigLayout({
      data: buildLinearUp(60),
    });
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineSarCrossSigLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.sarPath).toBe('');
    expect(layout.signalPath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineSarCrossSigLayout({
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
    const layout = computeLineSarCrossSigLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });

  it('pads degenerate oscMin === oscMax', () => {
    const data = buildConst(40, 100);
    const layout = computeLineSarCrossSigLayout({ data });
    expect(layout.oscMin).toBe(99);
    expect(layout.oscMax).toBe(101);
  });
});

describe('describeLineSarCrossSigChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineSarCrossSigChart([])).toBe('No data');
  });

  it('mentions bar count, step, signal, trailing stop confirmation', () => {
    const desc = describeLineSarCrossSigChart(buildLinearUp(40));
    expect(desc).toContain('40 bars');
    expect(desc).toContain('step 0.02');
    expect(desc).toContain('signal 9');
    expect(desc).toContain('trailing stop confirmation');
  });
});

describe('<ChartLineSarCrossSig /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(40);
    const { container } = render(<ChartLineSarCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-sar-cross-sig"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-signal-length')).toBe(String(SIGNAL));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(<ChartLineSarCrossSig data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-sar-cross-sig-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders SAR and signal paths', () => {
    const data = buildLinearUp(40);
    const { container } = render(<ChartLineSarCrossSig data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-sar-cross-sig-sar-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-sar-cross-sig-signal-path"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineSarCrossSig data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-sar-cross-sig-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildLinearUp(40);
    const { container } = render(<ChartLineSarCrossSig data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-sar-cross-sig-badge"]',
    );
    expect(badge?.textContent).toContain('step 0.02');
    expect(badge?.textContent).toContain('signal 9');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(40);
    const { container } = render(<ChartLineSarCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-sar-cross-sig"]',
    );
    expect(root?.getAttribute('aria-label')).toBe(
      'Parabolic SAR vs signal cross-sig chart',
    );
  });

  it('exposes data-cross-count counter for LINEAR UP', () => {
    const data = buildLinearUp(40);
    const { container } = render(<ChartLineSarCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-sar-cross-sig"]',
    );
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('exposes data-reversal-count counter for LINEAR UP', () => {
    const data = buildLinearUp(40);
    const { container } = render(<ChartLineSarCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-sar-cross-sig"]',
    );
    expect(root?.getAttribute('data-reversal-count')).toBe('0');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineSarCrossSig data={data} hiddenSeries={['sar']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-sar-cross-sig-sar-path"]',
      ),
    ).toBeNull();
  });

  it('renders three legend buttons (value, SAR, signal)', () => {
    const data = buildLinearUp(40);
    const { container } = render(<ChartLineSarCrossSig data={data} />);
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-sar-cross-sig-legend"] button',
    );
    expect(buttons).toHaveLength(3);
  });

  it('exposes bullish-count for LINEAR UP', () => {
    const data = buildLinearUp(40);
    const { container } = render(<ChartLineSarCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-sar-cross-sig"]',
    );
    const bullishCount = Number(root?.getAttribute('data-bullish-count'));
    expect(bullishCount).toBeGreaterThan(0);
  });

  it('exposes bearish-count for LINEAR DOWN', () => {
    const data = buildLinearDown(60);
    const { container } = render(<ChartLineSarCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-sar-cross-sig"]',
    );
    const bearishCount = Number(root?.getAttribute('data-bearish-count'));
    expect(bearishCount).toBeGreaterThan(0);
  });
});
