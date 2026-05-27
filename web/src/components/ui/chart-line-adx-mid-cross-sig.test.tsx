import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineAdxMidCrossSig,
  DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_HEIGHT,
  DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_K_SMOOTHING,
  DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_LENGTH,
  DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_PADDING,
  DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_PANEL_GAP,
  DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_THRESHOLD,
  DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_WIDTH,
  applyLineAdxMidCrossSigAdx,
  applyLineAdxMidCrossSigSma,
  applyLineAdxMidCrossSigSmaSeededRma,
  classifyLineAdxMidCrossSigBias,
  classifyLineAdxMidCrossSigRegime,
  computeLineAdxMidCrossSig,
  computeLineAdxMidCrossSigLayout,
  describeLineAdxMidCrossSigChart,
  detectLineAdxMidCrossSigCrosses,
  getLineAdxMidCrossSigFinitePoints,
  normalizeLineAdxMidCrossSigLength,
  normalizeLineAdxMidCrossSigThreshold,
  runLineAdxMidCrossSig,
  type ChartLineAdxMidCrossSigPoint,
} from './chart-line-adx-mid-cross-sig';

const L = 14;
const KSM = 3;
const THRESH = 25;
const WARMUP = 2 * L - 1 + KSM - 1; // 29
const ADX_WARMUP = 2 * L - 1; // 27 (first valid adx)

const buildConst = (
  n: number,
  k: number,
): ChartLineAdxMidCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: k,
    low: k,
    close: k,
  }));

const buildLinearUp = (n: number): ChartLineAdxMidCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: i + 1,
    low: i - 1,
    close: i,
  }));

const buildLinearDown = (n: number): ChartLineAdxMidCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: -i + 1,
    low: -i - 1,
    close: -i,
  }));

describe('ChartLineAdxMidCrossSig defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_PANEL_GAP).toBe(12);
  });

  it('exports canonical ADX mid tuning', () => {
    expect(DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_LENGTH).toBe(14);
    expect(DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_K_SMOOTHING).toBe(3);
    expect(DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_THRESHOLD).toBe(25);
  });
});

describe('getLineAdxMidCrossSigFinitePoints', () => {
  it('filters finite x, HLC', () => {
    const points = [
      { x: 0, high: 1, low: 0, close: 0.5 },
      { x: NaN, high: 1, low: 0, close: 0.5 },
      { x: 2, high: Infinity, low: 0, close: 0.5 },
      { x: 3, high: 1, low: 0, close: 0.5 },
    ];
    expect(getLineAdxMidCrossSigFinitePoints(points)).toEqual([
      { x: 0, high: 1, low: 0, close: 0.5 },
      { x: 3, high: 1, low: 0, close: 0.5 },
    ]);
  });

  it('returns empty array for null and non-array', () => {
    expect(getLineAdxMidCrossSigFinitePoints(null)).toEqual([]);
    expect(getLineAdxMidCrossSigFinitePoints(undefined)).toEqual([]);
    expect(
      getLineAdxMidCrossSigFinitePoints(
        // @ts-expect-error -- intentionally bad
        'oops',
      ),
    ).toEqual([]);
  });
});

describe('normalize helpers', () => {
  it('length: floors finite >=1', () => {
    expect(normalizeLineAdxMidCrossSigLength(14.7, 14)).toBe(14);
    expect(normalizeLineAdxMidCrossSigLength(0, 14)).toBe(14);
    expect(normalizeLineAdxMidCrossSigLength(NaN, 14)).toBe(14);
  });

  it('threshold: accepts any finite number', () => {
    expect(normalizeLineAdxMidCrossSigThreshold(40, 25)).toBe(40);
    expect(normalizeLineAdxMidCrossSigThreshold(-10, 25)).toBe(-10);
    expect(normalizeLineAdxMidCrossSigThreshold(NaN, 25)).toBe(25);
    expect(normalizeLineAdxMidCrossSigThreshold(Infinity, 25)).toBe(25);
  });
});

describe('applyLineAdxMidCrossSigSmaSeededRma', () => {
  it('seeds with SMA and uses Wilder alpha = 1/length', () => {
    const out = applyLineAdxMidCrossSigSmaSeededRma(
      [null, 2, 2, 2, 14, 14],
      3,
    );
    expect(out[3]).toBe(2);
    expect(out[4]).toBeCloseTo(2 * (1 - 1 / 3) + 14 * (1 / 3), 9);
  });

  it('returns all nulls when length < 1', () => {
    expect(
      applyLineAdxMidCrossSigSmaSeededRma([1, 2, 3], 0).every(
        (v) => v === null,
      ),
    ).toBe(true);
  });
});

describe('applyLineAdxMidCrossSigSma', () => {
  it('CONST returns constant', () => {
    const values: Array<number | null> = Array.from({ length: 10 }, () => 50);
    const sma = applyLineAdxMidCrossSigSma(values, KSM);
    for (let i = 0; i < KSM - 1; i += 1) expect(sma[i]).toBeNull();
    for (let i = KSM - 1; i < 10; i += 1) expect(sma[i]).toBe(50);
  });
});

describe('applyLineAdxMidCrossSigAdx', () => {
  it('CONST HLC=K returns ADX=0 from warmup', () => {
    for (const K of [0, 1, 50, 200, 1234]) {
      const closes = Array.from({ length: 60 }, () => K);
      const adx = applyLineAdxMidCrossSigAdx(closes, closes, closes, L);
      for (let i = 0; i < ADX_WARMUP; i += 1) expect(adx[i]).toBeNull();
      for (let i = ADX_WARMUP; i < 60; i += 1) expect(adx[i]).toBe(0);
    }
  });

  it('LINEAR UP saturates ADX at 100', () => {
    const n = 60;
    const highs = Array.from({ length: n }, (_, i) => i + 1);
    const lows = Array.from({ length: n }, (_, i) => i - 1);
    const closes = Array.from({ length: n }, (_, i) => i);
    const adx = applyLineAdxMidCrossSigAdx(highs, lows, closes, L);
    for (let i = ADX_WARMUP; i < n; i += 1) {
      expect(adx[i] as number).toBeCloseTo(100, 9);
    }
  });

  it('LINEAR DOWN saturates ADX at 100', () => {
    const n = 60;
    const highs = Array.from({ length: n }, (_, i) => -i + 1);
    const lows = Array.from({ length: n }, (_, i) => -i - 1);
    const closes = Array.from({ length: n }, (_, i) => -i);
    const adx = applyLineAdxMidCrossSigAdx(highs, lows, closes, L);
    for (let i = ADX_WARMUP; i < n; i += 1) {
      expect(adx[i] as number).toBeCloseTo(100, 9);
    }
  });
});

describe('computeLineAdxMidCrossSig', () => {
  it('CONST HLC=K returns adx=0 and signal=0 from warmup', () => {
    const data = buildConst(60, 50);
    const out = computeLineAdxMidCrossSig(data);
    expect(out.adx[ADX_WARMUP]).toBe(0);
    expect(out.signal[WARMUP]).toBe(0);
  });

  it('LINEAR UP returns signal=100 from warmup', () => {
    const data = buildLinearUp(60);
    const out = computeLineAdxMidCrossSig(data);
    expect(out.signal[WARMUP] as number).toBeCloseTo(100, 9);
  });

  it('returns empty for empty data', () => {
    expect(computeLineAdxMidCrossSig([])).toEqual({ adx: [], signal: [] });
  });
});

describe('classifyLineAdxMidCrossSigRegime', () => {
  it('null -> none', () => {
    expect(classifyLineAdxMidCrossSigRegime(null, 25)).toBe('none');
  });
  it('>= threshold -> bullish', () => {
    expect(classifyLineAdxMidCrossSigRegime(25, 25)).toBe('bullish');
    expect(classifyLineAdxMidCrossSigRegime(60, 25)).toBe('bullish');
  });
  it('< threshold -> bearish', () => {
    expect(classifyLineAdxMidCrossSigRegime(24, 25)).toBe('bearish');
    expect(classifyLineAdxMidCrossSigRegime(0, 25)).toBe('bearish');
  });
});

describe('classifyLineAdxMidCrossSigBias', () => {
  it('returns up/down/flat/none correctly', () => {
    expect(classifyLineAdxMidCrossSigBias(60, 50)).toBe('up');
    expect(classifyLineAdxMidCrossSigBias(40, 50)).toBe('down');
    expect(classifyLineAdxMidCrossSigBias(50, 50)).toBe('flat');
    expect(classifyLineAdxMidCrossSigBias(null, 50)).toBe('none');
    expect(classifyLineAdxMidCrossSigBias(50, null)).toBe('none');
  });
});

describe('detectLineAdxMidCrossSigCrosses', () => {
  it('detects bullish trigger on rising cross', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const signal: Array<number | null> = [20, 22, 27, 30];
    const out = detectLineAdxMidCrossSigCrosses(series, signal, 25);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
    expect(out[0]?.bias).toBe('up');
    expect(out[0]?.index).toBe(2);
  });

  it('detects bearish trigger on falling cross', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const signal: Array<number | null> = [30, 27, 22, 20];
    const out = detectLineAdxMidCrossSigCrosses(series, signal, 25);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
    expect(out[0]?.bias).toBe('down');
  });

  it('does not fire when prev or cur is null', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const signal: Array<number | null> = [null, null, 30, 30];
    const out = detectLineAdxMidCrossSigCrosses(series, signal, 25);
    expect(out).toHaveLength(0);
  });

  it('does not double-fire on consecutive bars above threshold', () => {
    const series = Array.from({ length: 5 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const signal: Array<number | null> = [20, 26, 27, 28, 29];
    const out = detectLineAdxMidCrossSigCrosses(series, signal, 25);
    expect(out).toHaveLength(1);
  });

  it('boundary equality uses prev <= and cur > for bullish', () => {
    const series = Array.from({ length: 3 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const signal: Array<number | null> = [25, 26, 30];
    const out = detectLineAdxMidCrossSigCrosses(series, signal, 25);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
  });
});

describe('runLineAdxMidCrossSig CONST K', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST HLC=${K}: signal=0, all bearish, 0 triggers`, () => {
      const data = buildConst(80, K);
      const run = runLineAdxMidCrossSig(data);
      expect(run.length).toBe(L);
      expect(run.kSmoothing).toBe(KSM);
      expect(run.threshold).toBe(THRESH);
      for (let i = 0; i < WARMUP; i += 1) {
        expect(run.signalValues[i]).toBeNull();
      }
      for (let i = WARMUP; i < 80; i += 1) {
        expect(run.signalValues[i]).toBe(0);
        expect(run.samples[i]?.regime).toBe('bearish');
      }
      expect(run.bearishCount).toBe(80 - WARMUP);
      expect(run.bullishCount).toBe(0);
      expect(run.noneCount).toBe(WARMUP);
      expect(run.crosses).toHaveLength(0);
      // bias: first valid signal at WARMUP has prev null -> none.
      // From WARMUP+1 onwards bias = flat (0 === 0).
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

describe('runLineAdxMidCrossSig LINEAR UP', () => {
  it('LINEAR UP: signal=100, all bullish, 0 triggers', () => {
    const data = buildLinearUp(80);
    const run = runLineAdxMidCrossSig(data);
    for (let i = WARMUP; i < 80; i += 1) {
      expect(run.signalValues[i] as number).toBeCloseTo(100, 9);
      expect(run.samples[i]?.regime).toBe('bullish');
    }
    expect(run.bullishCount).toBe(80 - WARMUP);
    expect(run.bearishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
    expect(run.flatBiasCount).toBe(80 - WARMUP - 1);
  });
});

describe('runLineAdxMidCrossSig LINEAR DOWN', () => {
  it('LINEAR DOWN: signal=100, all bullish, 0 triggers', () => {
    const data = buildLinearDown(80);
    const run = runLineAdxMidCrossSig(data);
    for (let i = WARMUP; i < 80; i += 1) {
      expect(run.signalValues[i] as number).toBeCloseTo(100, 9);
      expect(run.samples[i]?.regime).toBe('bullish');
    }
    expect(run.bullishCount).toBe(80 - WARMUP);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineAdxMidCrossSig misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineAdxMidCrossSigPoint[] = [
      { x: 2, high: 1, low: 0, close: 0.5 },
      { x: 0, high: 1, low: 0, close: 0.5 },
      { x: 1, high: 1, low: 0, close: 0.5 },
    ];
    const run = runLineAdxMidCrossSig(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConst(20, 50);
    const run = runLineAdxMidCrossSig(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineAdxMidCrossSig([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom tuning', () => {
    const data = buildLinearUp(40);
    const run = runLineAdxMidCrossSig(data, {
      length: 5,
      kSmoothing: 2,
      threshold: 50,
    });
    expect(run.length).toBe(5);
    expect(run.kSmoothing).toBe(2);
    expect(run.threshold).toBe(50);
  });

  it('regime + bias counts sum correctly', () => {
    const data = buildLinearUp(80);
    const run = runLineAdxMidCrossSig(data);
    expect(
      run.bullishCount + run.bearishCount + run.noneCount,
    ).toBe(80);
  });
});

describe('computeLineAdxMidCrossSigLayout', () => {
  it('renders SVG paths for CONST K=50', () => {
    const data = buildConst(80, 50);
    const layout = computeLineAdxMidCrossSigLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(80);
    expect(layout.adxPath).toContain('M ');
    expect(layout.signalPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineAdxMidCrossSigLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.adxPath).toBe('');
    expect(layout.signalPath).toBe('');
  });

  it('threshold line projects at oscMin..oscMax mapping', () => {
    const layout = computeLineAdxMidCrossSigLayout({
      data: buildConst(80, 50),
    });
    expect(layout.oscMin).toBe(0);
    expect(layout.oscMax).toBe(100);
    expect(layout.thresholdY).toBeGreaterThan(layout.oscTop);
    expect(layout.thresholdY).toBeLessThan(layout.oscBottom);
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineAdxMidCrossSigLayout({
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
    const layout = computeLineAdxMidCrossSigLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });
});

describe('describeLineAdxMidCrossSigChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineAdxMidCrossSigChart([])).toBe('No data');
  });

  it('mentions bar count, length, k, threshold', () => {
    const desc = describeLineAdxMidCrossSigChart(buildLinearUp(80));
    expect(desc).toContain('80 bars');
    expect(desc).toContain('length 14');
    expect(desc).toContain('kSmoothing 3');
    expect(desc).toContain('threshold 25');
  });
});

describe('<ChartLineAdxMidCrossSig /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(80);
    const { container } = render(<ChartLineAdxMidCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-adx-mid-cross-sig"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-length')).toBe(String(L));
    expect(root?.getAttribute('data-k-smoothing')).toBe(String(KSM));
    expect(root?.getAttribute('data-threshold')).toBe(String(THRESH));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(<ChartLineAdxMidCrossSig data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-mid-cross-sig-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders ADX and signal paths', () => {
    const data = buildLinearUp(80);
    const { container } = render(<ChartLineAdxMidCrossSig data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-mid-cross-sig-adx-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-mid-cross-sig-signal-path"]',
      ),
    ).not.toBeNull();
  });

  it('renders threshold reference line', () => {
    const data = buildConst(80, 50);
    const { container } = render(<ChartLineAdxMidCrossSig data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-mid-cross-sig-threshold-line"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineAdxMidCrossSig data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-mid-cross-sig-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge with crosses count', () => {
    const data = buildLinearUp(80);
    const { container } = render(<ChartLineAdxMidCrossSig data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-adx-mid-cross-sig-badge"]',
    );
    expect(badge?.textContent).toContain('length 14');
    expect(badge?.textContent).toContain('threshold 25');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(80);
    const { container } = render(<ChartLineAdxMidCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-adx-mid-cross-sig"]',
    );
    expect(root?.getAttribute('aria-label')).toBe(
      'ADX Midline-over-Signal chart',
    );
  });

  it('exposes data-*-count and bias counters', () => {
    const data = buildLinearUp(80);
    const { container } = render(<ChartLineAdxMidCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-adx-mid-cross-sig"]',
    );
    expect(root?.getAttribute('data-bullish-count')).toBe(
      String(80 - WARMUP),
    );
    expect(root?.getAttribute('data-bullish-cross-count')).toBe('0');
    expect(root?.getAttribute('data-bearish-cross-count')).toBe('0');
    expect(root?.getAttribute('data-cross-count')).toBe('0');
    expect(root?.getAttribute('data-flat-bias-count')).toBe(
      String(80 - WARMUP - 1),
    );
  });

  it('renders title and aria description elements', () => {
    const data = buildLinearUp(80);
    const { container } = render(<ChartLineAdxMidCrossSig data={data} />);
    const desc = container.querySelector(
      '[data-section="chart-line-adx-mid-cross-sig-aria-desc"]',
    );
    expect(desc?.textContent).toContain('ADX Midline-over-Signal chart');
    expect(desc?.textContent).toContain('25');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineAdxMidCrossSig data={data} hiddenSeries={['signal']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-mid-cross-sig-signal-path"]',
      ),
    ).toBeNull();
  });
});
