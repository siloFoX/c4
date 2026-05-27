import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineMacdZeroCrossSig,
  DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_FAST_LENGTH,
  DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_HEIGHT,
  DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_PADDING,
  DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_PANEL_GAP,
  DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_SIGNAL_LENGTH,
  DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_SLOW_LENGTH,
  DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_THRESHOLD,
  DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_WIDTH,
  applyLineMacdZeroCrossSigSmaSeededEma,
  classifyLineMacdZeroCrossSigBias,
  classifyLineMacdZeroCrossSigRegime,
  computeLineMacdZeroCrossSig,
  computeLineMacdZeroCrossSigLayout,
  describeLineMacdZeroCrossSigChart,
  detectLineMacdZeroCrossSigCrosses,
  getLineMacdZeroCrossSigFinitePoints,
  normalizeLineMacdZeroCrossSigLength,
  normalizeLineMacdZeroCrossSigThreshold,
  runLineMacdZeroCrossSig,
  type ChartLineMacdZeroCrossSigPoint,
} from './chart-line-macd-zero-cross-sig';

const FAST = 12;
const SLOW = 26;
const SIG = 9;
const THRESH = 0;
const WARMUP = SLOW + SIG - 2; // 33 (first valid signal index)
const MACD_WARMUP = SLOW - 1; // 25 (first valid macd index)

const buildConst = (
  n: number,
  k: number,
): ChartLineMacdZeroCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: k }));

const buildLinearUp = (n: number): ChartLineMacdZeroCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: i }));

const buildLinearDown = (n: number): ChartLineMacdZeroCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: -i }));

describe('ChartLineMacdZeroCrossSig defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_PANEL_GAP).toBe(12);
  });

  it('exports canonical MACD tuning', () => {
    expect(DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_FAST_LENGTH).toBe(12);
    expect(DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_SLOW_LENGTH).toBe(26);
    expect(DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_SIGNAL_LENGTH).toBe(9);
    expect(DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_THRESHOLD).toBe(0);
  });
});

describe('getLineMacdZeroCrossSigFinitePoints', () => {
  it('filters finite x and close', () => {
    const points = [
      { x: 0, close: 1 },
      { x: NaN, close: 2 },
      { x: 2, close: Infinity },
      { x: 3, close: 4 },
    ];
    expect(getLineMacdZeroCrossSigFinitePoints(points)).toEqual([
      { x: 0, close: 1 },
      { x: 3, close: 4 },
    ]);
  });

  it('returns empty for null and non-array', () => {
    expect(getLineMacdZeroCrossSigFinitePoints(null)).toEqual([]);
    expect(getLineMacdZeroCrossSigFinitePoints(undefined)).toEqual([]);
    expect(
      getLineMacdZeroCrossSigFinitePoints(
        // @ts-expect-error -- intentionally bad
        'oops',
      ),
    ).toEqual([]);
  });
});

describe('normalize helpers', () => {
  it('length: floors finite >=1', () => {
    expect(normalizeLineMacdZeroCrossSigLength(12.7, 12)).toBe(12);
    expect(normalizeLineMacdZeroCrossSigLength(0, 12)).toBe(12);
    expect(normalizeLineMacdZeroCrossSigLength(NaN, 12)).toBe(12);
  });

  it('threshold: accepts any finite number', () => {
    expect(normalizeLineMacdZeroCrossSigThreshold(0, 0)).toBe(0);
    expect(normalizeLineMacdZeroCrossSigThreshold(-5, 0)).toBe(-5);
    expect(normalizeLineMacdZeroCrossSigThreshold(NaN, 0)).toBe(0);
    expect(normalizeLineMacdZeroCrossSigThreshold(Infinity, 0)).toBe(0);
  });
});

describe('applyLineMacdZeroCrossSigSmaSeededEma', () => {
  it('seeds with SMA and recurs', () => {
    const out = applyLineMacdZeroCrossSigSmaSeededEma(
      [null, 1, 1, 1, 1, 1, 1],
      3,
    );
    expect(out[2]).toBeNull();
    expect(out[3]).toBe(1);
    expect(out[6]).toBe(1);
  });

  it('returns nulls when length < 1', () => {
    expect(
      applyLineMacdZeroCrossSigSmaSeededEma([1, 2, 3], 0).every(
        (v) => v === null,
      ),
    ).toBe(true);
  });

  it('LINEAR UP settles at i - (L-1)/2', () => {
    const closes: Array<number | null> = Array.from(
      { length: 20 },
      (_, i) => i,
    );
    const ema = applyLineMacdZeroCrossSigSmaSeededEma(closes, 5);
    for (let i = 4; i < 20; i += 1) {
      expect(ema[i] as number).toBeCloseTo(i - 2, 9);
    }
  });
});

describe('computeLineMacdZeroCrossSig', () => {
  it('CONST close=K returns macd=0 and signal=0 from warmup', () => {
    const data = buildConst(60, 50);
    const out = computeLineMacdZeroCrossSig(data);
    expect(out.macd[MACD_WARMUP]).toBe(0);
    expect(out.signal[WARMUP]).toBe(0);
  });

  it('LINEAR UP returns macd=+7 and signal=+7 from warmup', () => {
    const data = buildLinearUp(60);
    const out = computeLineMacdZeroCrossSig(data);
    for (let i = MACD_WARMUP; i < 60; i += 1) {
      expect(out.macd[i] as number).toBeCloseTo(7, 9);
    }
    for (let i = WARMUP; i < 60; i += 1) {
      expect(out.signal[i] as number).toBeCloseTo(7, 9);
    }
  });

  it('LINEAR DOWN returns macd=-7 and signal=-7 from warmup', () => {
    const data = buildLinearDown(60);
    const out = computeLineMacdZeroCrossSig(data);
    for (let i = WARMUP; i < 60; i += 1) {
      expect(out.signal[i] as number).toBeCloseTo(-7, 9);
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineMacdZeroCrossSig([])).toEqual({
      macd: [],
      signal: [],
    });
  });
});

describe('classifyLineMacdZeroCrossSigRegime', () => {
  it('null -> none', () => {
    expect(classifyLineMacdZeroCrossSigRegime(null, 0)).toBe('none');
  });
  it('>= threshold -> bullish', () => {
    expect(classifyLineMacdZeroCrossSigRegime(0, 0)).toBe('bullish');
    expect(classifyLineMacdZeroCrossSigRegime(10, 0)).toBe('bullish');
  });
  it('< threshold -> bearish', () => {
    expect(classifyLineMacdZeroCrossSigRegime(-0.1, 0)).toBe('bearish');
    expect(classifyLineMacdZeroCrossSigRegime(-10, 0)).toBe('bearish');
  });
});

describe('classifyLineMacdZeroCrossSigBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineMacdZeroCrossSigBias(3, 1)).toBe('up');
    expect(classifyLineMacdZeroCrossSigBias(1, 3)).toBe('down');
    expect(classifyLineMacdZeroCrossSigBias(1, 1)).toBe('flat');
    expect(classifyLineMacdZeroCrossSigBias(null, 1)).toBe('none');
    expect(classifyLineMacdZeroCrossSigBias(1, null)).toBe('none');
  });
});

describe('detectLineMacdZeroCrossSigCrosses', () => {
  it('detects bullish trigger on rising cross through zero', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const signal: Array<number | null> = [-2, -1, 0.5, 1];
    const out = detectLineMacdZeroCrossSigCrosses(series, signal, 0);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
    expect(out[0]?.bias).toBe('up');
    expect(out[0]?.index).toBe(2);
  });

  it('detects bearish trigger on falling cross through zero', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const signal: Array<number | null> = [2, 1, -0.5, -1];
    const out = detectLineMacdZeroCrossSigCrosses(series, signal, 0);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
    expect(out[0]?.bias).toBe('down');
  });

  it('does not fire when prev or cur is null', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const signal: Array<number | null> = [null, null, 5, 5];
    expect(
      detectLineMacdZeroCrossSigCrosses(series, signal, 0),
    ).toHaveLength(0);
  });

  it('does not double-fire on consecutive bars above threshold', () => {
    const series = Array.from({ length: 5 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const signal: Array<number | null> = [-2, 1, 2, 3, 4];
    expect(
      detectLineMacdZeroCrossSigCrosses(series, signal, 0),
    ).toHaveLength(1);
  });

  it('boundary equality uses prev <= 0 && cur > 0', () => {
    const series = Array.from({ length: 3 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const signal: Array<number | null> = [0, 0.5, 1];
    const out = detectLineMacdZeroCrossSigCrosses(series, signal, 0);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
    expect(out[0]?.index).toBe(1);
  });
});

describe('runLineMacdZeroCrossSig CONST K', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST close=${K}: signal=0, all bullish, 0 triggers`, () => {
      const data = buildConst(80, K);
      const run = runLineMacdZeroCrossSig(data);
      expect(run.fastLength).toBe(FAST);
      expect(run.slowLength).toBe(SLOW);
      expect(run.signalLength).toBe(SIG);
      expect(run.threshold).toBe(THRESH);
      for (let i = 0; i < WARMUP; i += 1) {
        expect(run.signalValues[i]).toBeNull();
      }
      for (let i = WARMUP; i < 80; i += 1) {
        expect(run.signalValues[i]).toBe(0);
        expect(run.samples[i]?.regime).toBe('bullish');
      }
      expect(run.bullishCount).toBe(80 - WARMUP);
      expect(run.bearishCount).toBe(0);
      expect(run.noneCount).toBe(WARMUP);
      expect(run.crosses).toHaveLength(0);
      // First valid signal at WARMUP has prev null -> bias none. From WARMUP+1 onwards, signal[i]===signal[i-1]===0 -> bias flat.
      expect(run.samples[WARMUP]?.bias).toBe('none');
      for (let i = WARMUP + 1; i < 80; i += 1) {
        expect(run.samples[i]?.bias).toBe('flat');
      }
      expect(run.flatBiasCount).toBe(80 - WARMUP - 1);
      expect(run.upBiasCount).toBe(0);
      expect(run.downBiasCount).toBe(0);
      expect(run.ok).toBe(true);
    });
  }
});

describe('runLineMacdZeroCrossSig LINEAR UP', () => {
  it('LINEAR UP: macd=+7, signal=+7, all bullish, 0 triggers', () => {
    const data = buildLinearUp(80);
    const run = runLineMacdZeroCrossSig(data);
    for (let i = WARMUP; i < 80; i += 1) {
      expect(run.signalValues[i] as number).toBeCloseTo(7, 9);
      expect(run.samples[i]?.regime).toBe('bullish');
    }
    expect(run.bullishCount).toBe(80 - WARMUP);
    expect(run.bearishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
    // Bias on LINEAR UP exhibits float-point drift near the steady-state
    // value (signal ~= 7 with tiny noise from EMA recurrence). The bias
    // counts may include a small number of up/down samples; total bias-
    // classified samples should equal the valid-signal sample count
    // (80 - WARMUP - 1, where the first sample at WARMUP has bias = 'none').
    expect(
      run.upBiasCount + run.downBiasCount + run.flatBiasCount,
    ).toBe(80 - WARMUP - 1);
  });
});

describe('runLineMacdZeroCrossSig LINEAR DOWN', () => {
  it('LINEAR DOWN: macd=-7, signal=-7, all bearish, 0 triggers', () => {
    const data = buildLinearDown(80);
    const run = runLineMacdZeroCrossSig(data);
    for (let i = WARMUP; i < 80; i += 1) {
      expect(run.signalValues[i] as number).toBeCloseTo(-7, 9);
      expect(run.samples[i]?.regime).toBe('bearish');
    }
    expect(run.bearishCount).toBe(80 - WARMUP);
    expect(run.bullishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
    expect(
      run.upBiasCount + run.downBiasCount + run.flatBiasCount,
    ).toBe(80 - WARMUP - 1);
  });
});

describe('runLineMacdZeroCrossSig misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineMacdZeroCrossSigPoint[] = [
      { x: 2, close: 1 },
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    const run = runLineMacdZeroCrossSig(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConst(20, 50);
    const run = runLineMacdZeroCrossSig(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineMacdZeroCrossSig([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom tuning', () => {
    const data = buildLinearUp(40);
    const run = runLineMacdZeroCrossSig(data, {
      fastLength: 5,
      slowLength: 10,
      signalLength: 3,
      threshold: 1,
    });
    expect(run.fastLength).toBe(5);
    expect(run.slowLength).toBe(10);
    expect(run.signalLength).toBe(3);
    expect(run.threshold).toBe(1);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(80);
    const run = runLineMacdZeroCrossSig(data);
    expect(
      run.bullishCount + run.bearishCount + run.noneCount,
    ).toBe(80);
  });
});

describe('computeLineMacdZeroCrossSigLayout', () => {
  it('renders SVG paths for CONST K=50', () => {
    const data = buildConst(80, 50);
    const layout = computeLineMacdZeroCrossSigLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(80);
    expect(layout.macdPath).toContain('M ');
    expect(layout.signalPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineMacdZeroCrossSigLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.macdPath).toBe('');
    expect(layout.signalPath).toBe('');
  });

  it('symmetric oscillator range with fallback when span is 0', () => {
    const layout = computeLineMacdZeroCrossSigLayout({
      data: buildConst(80, 50),
    });
    expect(layout.oscMin).toBe(-1);
    expect(layout.oscMax).toBe(1);
    expect(layout.thresholdY).toBeGreaterThan(layout.oscTop);
    expect(layout.thresholdY).toBeLessThan(layout.oscBottom);
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineMacdZeroCrossSigLayout({
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
    const layout = computeLineMacdZeroCrossSigLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });
});

describe('describeLineMacdZeroCrossSigChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineMacdZeroCrossSigChart([])).toBe('No data');
  });

  it('mentions bar count, fast, slow, signal, threshold', () => {
    const desc = describeLineMacdZeroCrossSigChart(buildLinearUp(80));
    expect(desc).toContain('80 bars');
    expect(desc).toContain('fast 12');
    expect(desc).toContain('slow 26');
    expect(desc).toContain('signal 9');
    expect(desc).toContain('threshold 0');
    expect(desc).toContain('bias coloring');
  });
});

describe('<ChartLineMacdZeroCrossSig /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(80);
    const { container } = render(<ChartLineMacdZeroCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-macd-zero-cross-sig"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-fast-length')).toBe(String(FAST));
    expect(root?.getAttribute('data-slow-length')).toBe(String(SLOW));
    expect(root?.getAttribute('data-signal-length')).toBe(String(SIG));
    expect(root?.getAttribute('data-threshold')).toBe(String(THRESH));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(<ChartLineMacdZeroCrossSig data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-zero-cross-sig-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders MACD and signal paths', () => {
    const data = buildLinearUp(80);
    const { container } = render(<ChartLineMacdZeroCrossSig data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-zero-cross-sig-macd-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-zero-cross-sig-signal-path"]',
      ),
    ).not.toBeNull();
  });

  it('renders threshold reference line', () => {
    const data = buildConst(80, 50);
    const { container } = render(<ChartLineMacdZeroCrossSig data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-zero-cross-sig-threshold-line"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineMacdZeroCrossSig data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-zero-cross-sig-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge with crosses count', () => {
    const data = buildLinearUp(80);
    const { container } = render(<ChartLineMacdZeroCrossSig data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-macd-zero-cross-sig-badge"]',
    );
    expect(badge?.textContent).toContain('fast 12');
    expect(badge?.textContent).toContain('slow 26');
    expect(badge?.textContent).toContain('signal 9');
    expect(badge?.textContent).toContain('threshold 0');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(80);
    const { container } = render(<ChartLineMacdZeroCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-macd-zero-cross-sig"]',
    );
    expect(root?.getAttribute('aria-label')).toBe(
      'MACD Zero-over-Signal chart',
    );
  });

  it('exposes data-*-count and bias counters', () => {
    const data = buildLinearUp(80);
    const { container } = render(<ChartLineMacdZeroCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-macd-zero-cross-sig"]',
    );
    expect(root?.getAttribute('data-bullish-count')).toBe(
      String(80 - WARMUP),
    );
    expect(root?.getAttribute('data-bullish-cross-count')).toBe('0');
    expect(root?.getAttribute('data-bearish-cross-count')).toBe('0');
    expect(root?.getAttribute('data-cross-count')).toBe('0');
    // up + down + flat bias counts sum to valid-signal samples (minus
    // the first, which has bias 'none' due to null prev).
    const up = Number(root?.getAttribute('data-up-bias-count'));
    const down = Number(root?.getAttribute('data-down-bias-count'));
    const flat = Number(root?.getAttribute('data-flat-bias-count'));
    expect(up + down + flat).toBe(80 - WARMUP - 1);
  });

  it('renders title and aria description elements', () => {
    const data = buildLinearUp(80);
    const { container } = render(<ChartLineMacdZeroCrossSig data={data} />);
    const desc = container.querySelector(
      '[data-section="chart-line-macd-zero-cross-sig-aria-desc"]',
    );
    expect(desc?.textContent).toContain('MACD Zero-over-Signal chart');
    expect(desc?.textContent).toContain('bias coloring');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineMacdZeroCrossSig data={data} hiddenSeries={['signal']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-zero-cross-sig-signal-path"]',
      ),
    ).toBeNull();
  });
});
