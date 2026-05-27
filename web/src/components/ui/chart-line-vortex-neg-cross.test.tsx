import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineVortexNegCross,
  DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_PADDING,
  DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_PERIOD,
  DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_SIGNAL_LENGTH,
  DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_WIDTH,
  applyLineVortexNegCrossSma,
  classifyLineVortexNegCrossBias,
  classifyLineVortexNegCrossRegime,
  computeLineVortexNegCross,
  computeLineVortexNegCrossLayout,
  describeLineVortexNegCrossChart,
  detectLineVortexNegCrossCrosses,
  getLineVortexNegCrossFinitePoints,
  normalizeLineVortexNegCrossLength,
  runLineVortexNegCross,
  type ChartLineVortexNegCrossPoint,
} from './chart-line-vortex-neg-cross';

const PERIOD = 14;
const SIGNAL = 3;
const WARMUP = PERIOD + SIGNAL - 1; // 16

const buildConstBand = (
  n: number,
  k: number,
): ChartLineVortexNegCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: k + 1,
    low: k - 1,
    close: k,
  }));

const buildLinearUp = (n: number): ChartLineVortexNegCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: i + 1,
    low: i - 1,
    close: i,
  }));

const buildLinearDown = (n: number): ChartLineVortexNegCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: -i + 1,
    low: -i - 1,
    close: -i,
  }));

describe('ChartLineVortexNegCross defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_PANEL_GAP).toBe(12);
  });

  it('exports canonical Vortex tuning', () => {
    expect(DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_PERIOD).toBe(14);
    expect(DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_SIGNAL_LENGTH).toBe(3);
  });
});

describe('getLineVortexNegCrossFinitePoints', () => {
  it('filters NaN/Infinity and high<low', () => {
    const points = [
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: NaN, high: 2, low: 1, close: 1.5 },
      { x: 1, high: 1, low: 2, close: 1.5 },
      { x: 2, high: Infinity, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ];
    expect(getLineVortexNegCrossFinitePoints(points)).toEqual([
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ]);
  });

  it('returns empty for null and non-array', () => {
    expect(getLineVortexNegCrossFinitePoints(null)).toEqual([]);
    expect(getLineVortexNegCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineVortexNegCrossFinitePoints(
        // @ts-expect-error -- intentionally bad
        'oops',
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineVortexNegCrossLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineVortexNegCrossLength(14.7, 14)).toBe(14);
    expect(normalizeLineVortexNegCrossLength(0, 14)).toBe(14);
    expect(normalizeLineVortexNegCrossLength(NaN, 14)).toBe(14);
  });
});

describe('applyLineVortexNegCrossSma', () => {
  it('CONST returns constant', () => {
    const values: Array<number | null> = Array.from({ length: 10 }, () => 7);
    const sma = applyLineVortexNegCrossSma(values, SIGNAL);
    for (let i = SIGNAL - 1; i < 10; i += 1) expect(sma[i]).toBe(7);
  });

  it('returns nulls when length < 1', () => {
    expect(
      applyLineVortexNegCrossSma([1, 2, 3], 0).every((v) => v === null),
    ).toBe(true);
  });

  it('length 1 returns values verbatim', () => {
    const out = applyLineVortexNegCrossSma([1, 2, 3, null, 5], 1);
    expect(out).toEqual([1, 2, 3, null, 5]);
  });
});

describe('computeLineVortexNegCross CONST band', () => {
  it('VI- = 1, signal = 1 from warmup; bullish; 0 crosses', () => {
    const data = buildConstBand(40, 50);
    const out = computeLineVortexNegCross(data);
    for (let i = PERIOD; i < 40; i += 1) {
      expect(out.vortex[i] as number).toBeCloseTo(1, 9);
    }
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.signal[i] as number).toBeCloseTo(1, 9);
    }
  });
});

describe('computeLineVortexNegCross LINEAR UP', () => {
  it('VI- = 0.5 from warmup', () => {
    const data = buildLinearUp(40);
    const out = computeLineVortexNegCross(data);
    for (let i = PERIOD; i < 40; i += 1) {
      expect(out.vortex[i] as number).toBeCloseTo(0.5, 9);
    }
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.signal[i] as number).toBeCloseTo(0.5, 9);
    }
  });
});

describe('computeLineVortexNegCross LINEAR DOWN', () => {
  it('VI- = 1.5 from warmup', () => {
    const data = buildLinearDown(40);
    const out = computeLineVortexNegCross(data);
    for (let i = PERIOD; i < 40; i += 1) {
      expect(out.vortex[i] as number).toBeCloseTo(1.5, 9);
    }
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.signal[i] as number).toBeCloseTo(1.5, 9);
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineVortexNegCross([])).toEqual({
      vmPlus: [],
      vmMinus: [],
      trueRange: [],
      vortex: [],
      signal: [],
    });
  });
});

describe('classifyLineVortexNegCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineVortexNegCrossRegime(null, 1)).toBe('none');
  });
  it('VI- >= signal -> bullish', () => {
    expect(classifyLineVortexNegCrossRegime(1, 1)).toBe('bullish');
    expect(classifyLineVortexNegCrossRegime(1.5, 1)).toBe('bullish');
  });
  it('VI- < signal -> bearish', () => {
    expect(classifyLineVortexNegCrossRegime(0.5, 1)).toBe('bearish');
  });
});

describe('classifyLineVortexNegCrossBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineVortexNegCrossBias(1.5, 1)).toBe('up');
    expect(classifyLineVortexNegCrossBias(0.5, 1)).toBe('down');
    expect(classifyLineVortexNegCrossBias(1, 1)).toBe('flat');
    expect(classifyLineVortexNegCrossBias(null, 1)).toBe('none');
  });
});

describe('detectLineVortexNegCrossCrosses', () => {
  it('detects bullish trigger (VI- rising through signal -- downtrend confirmation)', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const vortex: Array<number | null> = [0.4, 0.5, 0.7, 0.8];
    const signal: Array<number | null> = [0.5, 0.5, 0.6, 0.6];
    const out = detectLineVortexNegCrossCrosses(series, vortex, signal);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
  });

  it('detects bearish trigger (VI- falling through signal -- downtrend lost)', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const vortex: Array<number | null> = [0.8, 0.7, 0.5, 0.4];
    const signal: Array<number | null> = [0.6, 0.6, 0.6, 0.6];
    const out = detectLineVortexNegCrossCrosses(series, vortex, signal);
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
    const vortex: Array<number | null> = [null, null, 0.5, 0.7];
    const signal: Array<number | null> = [null, null, 0.4, 0.4];
    expect(detectLineVortexNegCrossCrosses(series, vortex, signal)).toHaveLength(
      0,
    );
  });

  it('does not double-fire', () => {
    const series = Array.from({ length: 5 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const vortex: Array<number | null> = [0.4, 0.5, 0.6, 0.7, 0.8];
    const signal: Array<number | null> = [0.5, 0.4, 0.4, 0.4, 0.4];
    expect(detectLineVortexNegCrossCrosses(series, vortex, signal)).toHaveLength(
      1,
    );
  });
});

describe('runLineVortexNegCross CONST band', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST band centred at ${K}: VI- = 1, signal = 1, all bullish, 0 triggers`, () => {
      const data = buildConstBand(60, K);
      const run = runLineVortexNegCross(data);
      expect(run.period).toBe(PERIOD);
      expect(run.signalLength).toBe(SIGNAL);
      for (let i = 0; i < PERIOD; i += 1) {
        expect(run.vortexValues[i]).toBeNull();
      }
      for (let i = 0; i < WARMUP; i += 1) {
        expect(run.signalValues[i]).toBeNull();
      }
      for (let i = PERIOD; i < 60; i += 1) {
        expect(run.vortexValues[i] as number).toBeCloseTo(1, 9);
      }
      for (let i = WARMUP; i < 60; i += 1) {
        expect(run.signalValues[i] as number).toBeCloseTo(1, 9);
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

describe('runLineVortexNegCross LINEAR UP', () => {
  it('LINEAR UP: VI- = 0.5, signal = 0.5, all bullish (==), 0 triggers', () => {
    const data = buildLinearUp(60);
    const run = runLineVortexNegCross(data);
    for (let i = WARMUP; i < 60; i += 1) {
      expect(run.samples[i]?.regime).toBe('bullish');
      expect(run.vortexValues[i] as number).toBeCloseTo(0.5, 9);
      expect(run.signalValues[i] as number).toBeCloseTo(0.5, 9);
    }
    expect(run.bullishCount).toBe(60 - WARMUP);
    expect(run.bearishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineVortexNegCross LINEAR DOWN', () => {
  it('LINEAR DOWN: VI- = 1.5, signal = 1.5, all bullish (==), 0 triggers', () => {
    const data = buildLinearDown(60);
    const run = runLineVortexNegCross(data);
    for (let i = WARMUP; i < 60; i += 1) {
      expect(run.samples[i]?.regime).toBe('bullish');
      expect(run.vortexValues[i] as number).toBeCloseTo(1.5, 9);
      expect(run.signalValues[i] as number).toBeCloseTo(1.5, 9);
    }
    expect(run.bullishCount).toBe(60 - WARMUP);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineVortexNegCross misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineVortexNegCrossPoint[] = [
      { x: 2, high: 1, low: 0, close: 0.5 },
      { x: 0, high: 1, low: 0, close: 0.5 },
      { x: 1, high: 1, low: 0, close: 0.5 },
    ];
    const run = runLineVortexNegCross(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConstBand(10, 50);
    const run = runLineVortexNegCross(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineVortexNegCross([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom tuning', () => {
    const data = buildLinearUp(60);
    const run = runLineVortexNegCross(data, { period: 7, signalLength: 2 });
    expect(run.period).toBe(7);
    expect(run.signalLength).toBe(2);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(60);
    const run = runLineVortexNegCross(data);
    expect(run.bullishCount + run.bearishCount + run.noneCount).toBe(60);
  });

  it('VM+, VM-, TR are valid from i>=1', () => {
    const data = buildConstBand(20, 50);
    const run = runLineVortexNegCross(data);
    expect(run.vmPlus[0]).toBeNull();
    expect(run.vmMinus[0]).toBeNull();
    expect(run.trueRange[0]).toBeNull();
    expect(run.vmPlus[1]).toBeCloseTo(2, 9);
    expect(run.vmMinus[1]).toBeCloseTo(2, 9);
    expect(run.trueRange[1]).toBeCloseTo(2, 9);
  });

  it('mirror relation: VI- on LINEAR UP equals VI+ on LINEAR DOWN', () => {
    const dataUp = buildLinearUp(60);
    const runUp = runLineVortexNegCross(dataUp);
    expect(runUp.vortexValues[PERIOD] as number).toBeCloseTo(0.5, 9);
  });
});

describe('computeLineVortexNegCrossLayout', () => {
  it('renders SVG paths for CONST K=50', () => {
    const data = buildConstBand(60, 50);
    const layout = computeLineVortexNegCrossLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(60);
    expect(layout.vortexPath).toContain('M ');
    expect(layout.signalPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineVortexNegCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.vortexPath).toBe('');
    expect(layout.signalPath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineVortexNegCrossLayout({
      data: buildLinearDown(40),
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
    const layout = computeLineVortexNegCrossLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });
});

describe('describeLineVortexNegCrossChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineVortexNegCrossChart([])).toBe('No data');
  });

  it('mentions bar count, period, signal, downtrend', () => {
    const desc = describeLineVortexNegCrossChart(buildLinearDown(60));
    expect(desc).toContain('60 bars');
    expect(desc).toContain('period 14');
    expect(desc).toContain('signalLength 3');
    expect(desc).toContain('downtrend');
    expect(desc).toContain('bias coloring');
  });
});

describe('<ChartLineVortexNegCross /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearDown(60);
    const { container } = render(<ChartLineVortexNegCross data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-vortex-neg-cross"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-period')).toBe(String(PERIOD));
    expect(root?.getAttribute('data-signal-length')).toBe(String(SIGNAL));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(<ChartLineVortexNegCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-vortex-neg-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders vortex and signal paths', () => {
    const data = buildLinearDown(60);
    const { container } = render(<ChartLineVortexNegCross data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-vortex-neg-cross-vortex-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-vortex-neg-cross-signal-path"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearDown(60);
    const { container } = render(
      <ChartLineVortexNegCross data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vortex-neg-cross-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildLinearDown(60);
    const { container } = render(<ChartLineVortexNegCross data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-vortex-neg-cross-badge"]',
    );
    expect(badge?.textContent).toContain('period 14');
    expect(badge?.textContent).toContain('signal 3');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearDown(60);
    const { container } = render(<ChartLineVortexNegCross data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-vortex-neg-cross"]',
    );
    expect(root?.getAttribute('aria-label')).toBe('Vortex--over-Signal chart');
  });

  it('exposes data-*-count counters', () => {
    const data = buildLinearDown(60);
    const { container } = render(<ChartLineVortexNegCross data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-vortex-neg-cross"]',
    );
    expect(root?.getAttribute('data-bullish-count')).toBe(
      String(60 - WARMUP),
    );
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearDown(60);
    const { container } = render(
      <ChartLineVortexNegCross data={data} hiddenSeries={['signal']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vortex-neg-cross-signal-path"]',
      ),
    ).toBeNull();
  });
});
