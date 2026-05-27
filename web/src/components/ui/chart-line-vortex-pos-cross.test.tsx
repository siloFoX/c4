import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineVortexPosCross,
  DEFAULT_CHART_LINE_VORTEX_POS_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_VORTEX_POS_CROSS_PADDING,
  DEFAULT_CHART_LINE_VORTEX_POS_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_VORTEX_POS_CROSS_PERIOD,
  DEFAULT_CHART_LINE_VORTEX_POS_CROSS_SIGNAL_LENGTH,
  DEFAULT_CHART_LINE_VORTEX_POS_CROSS_WIDTH,
  applyLineVortexPosCrossSma,
  classifyLineVortexPosCrossBias,
  classifyLineVortexPosCrossRegime,
  computeLineVortexPosCross,
  computeLineVortexPosCrossLayout,
  describeLineVortexPosCrossChart,
  detectLineVortexPosCrossCrosses,
  getLineVortexPosCrossFinitePoints,
  normalizeLineVortexPosCrossLength,
  runLineVortexPosCross,
  type ChartLineVortexPosCrossPoint,
} from './chart-line-vortex-pos-cross';

const PERIOD = 14;
const SIGNAL = 3;
const WARMUP = PERIOD + SIGNAL - 1; // 16

const buildConstBand = (
  n: number,
  k: number,
): ChartLineVortexPosCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: k + 1,
    low: k - 1,
    close: k,
  }));

const buildLinearUp = (n: number): ChartLineVortexPosCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: i + 1,
    low: i - 1,
    close: i,
  }));

const buildLinearDown = (n: number): ChartLineVortexPosCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: -i + 1,
    low: -i - 1,
    close: -i,
  }));

describe('ChartLineVortexPosCross defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_VORTEX_POS_CROSS_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_VORTEX_POS_CROSS_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_VORTEX_POS_CROSS_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_VORTEX_POS_CROSS_PANEL_GAP).toBe(12);
  });

  it('exports canonical Vortex tuning', () => {
    expect(DEFAULT_CHART_LINE_VORTEX_POS_CROSS_PERIOD).toBe(14);
    expect(DEFAULT_CHART_LINE_VORTEX_POS_CROSS_SIGNAL_LENGTH).toBe(3);
  });
});

describe('getLineVortexPosCrossFinitePoints', () => {
  it('filters NaN/Infinity and high<low', () => {
    const points = [
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: NaN, high: 2, low: 1, close: 1.5 },
      { x: 1, high: 1, low: 2, close: 1.5 },
      { x: 2, high: Infinity, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ];
    expect(getLineVortexPosCrossFinitePoints(points)).toEqual([
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ]);
  });

  it('returns empty for null and non-array', () => {
    expect(getLineVortexPosCrossFinitePoints(null)).toEqual([]);
    expect(getLineVortexPosCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineVortexPosCrossFinitePoints(
        // @ts-expect-error -- intentionally bad
        'oops',
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineVortexPosCrossLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineVortexPosCrossLength(14.7, 14)).toBe(14);
    expect(normalizeLineVortexPosCrossLength(0, 14)).toBe(14);
    expect(normalizeLineVortexPosCrossLength(NaN, 14)).toBe(14);
  });
});

describe('applyLineVortexPosCrossSma', () => {
  it('CONST returns constant', () => {
    const values: Array<number | null> = Array.from({ length: 10 }, () => 7);
    const sma = applyLineVortexPosCrossSma(values, SIGNAL);
    for (let i = SIGNAL - 1; i < 10; i += 1) expect(sma[i]).toBe(7);
  });

  it('returns nulls when length < 1', () => {
    expect(
      applyLineVortexPosCrossSma([1, 2, 3], 0).every((v) => v === null),
    ).toBe(true);
  });

  it('length 1 returns values verbatim', () => {
    const out = applyLineVortexPosCrossSma([1, 2, 3, null, 5], 1);
    expect(out).toEqual([1, 2, 3, null, 5]);
  });
});

describe('computeLineVortexPosCross CONST band', () => {
  it('VI+ = 1, signal = 1 from warmup; bullish; 0 crosses', () => {
    const data = buildConstBand(40, 50);
    const out = computeLineVortexPosCross(data);
    expect(out.vortex[WARMUP - SIGNAL + 1 - 1]).toBeNull(); // before VI+ valid
    for (let i = PERIOD; i < 40; i += 1) {
      expect(out.vortex[i] as number).toBeCloseTo(1, 9);
    }
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.signal[i] as number).toBeCloseTo(1, 9);
    }
  });
});

describe('computeLineVortexPosCross LINEAR UP', () => {
  it('VI+ = 1.5 from warmup', () => {
    const data = buildLinearUp(40);
    const out = computeLineVortexPosCross(data);
    for (let i = PERIOD; i < 40; i += 1) {
      expect(out.vortex[i] as number).toBeCloseTo(1.5, 9);
    }
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.signal[i] as number).toBeCloseTo(1.5, 9);
    }
  });
});

describe('computeLineVortexPosCross LINEAR DOWN', () => {
  it('VI+ = 0.5 from warmup', () => {
    const data = buildLinearDown(40);
    const out = computeLineVortexPosCross(data);
    for (let i = PERIOD; i < 40; i += 1) {
      expect(out.vortex[i] as number).toBeCloseTo(0.5, 9);
    }
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.signal[i] as number).toBeCloseTo(0.5, 9);
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineVortexPosCross([])).toEqual({
      vmPlus: [],
      vmMinus: [],
      trueRange: [],
      vortex: [],
      signal: [],
    });
  });
});

describe('classifyLineVortexPosCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineVortexPosCrossRegime(null, 1)).toBe('none');
  });
  it('VI+ >= signal -> bullish', () => {
    expect(classifyLineVortexPosCrossRegime(1, 1)).toBe('bullish');
    expect(classifyLineVortexPosCrossRegime(1.5, 1)).toBe('bullish');
  });
  it('VI+ < signal -> bearish', () => {
    expect(classifyLineVortexPosCrossRegime(0.5, 1)).toBe('bearish');
  });
});

describe('classifyLineVortexPosCrossBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineVortexPosCrossBias(1.5, 1)).toBe('up');
    expect(classifyLineVortexPosCrossBias(0.5, 1)).toBe('down');
    expect(classifyLineVortexPosCrossBias(1, 1)).toBe('flat');
    expect(classifyLineVortexPosCrossBias(null, 1)).toBe('none');
  });
});

describe('detectLineVortexPosCrossCrosses', () => {
  it('detects bullish trigger', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const vortex: Array<number | null> = [0.4, 0.5, 0.7, 0.8];
    const signal: Array<number | null> = [0.5, 0.5, 0.6, 0.6];
    const out = detectLineVortexPosCrossCrosses(series, vortex, signal);
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
    const vortex: Array<number | null> = [0.8, 0.7, 0.5, 0.4];
    const signal: Array<number | null> = [0.6, 0.6, 0.6, 0.6];
    const out = detectLineVortexPosCrossCrosses(series, vortex, signal);
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
    expect(detectLineVortexPosCrossCrosses(series, vortex, signal)).toHaveLength(
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
    expect(detectLineVortexPosCrossCrosses(series, vortex, signal)).toHaveLength(
      1,
    );
  });
});

describe('runLineVortexPosCross CONST band', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST band centred at ${K}: VI+ = 1, signal = 1, all bullish, 0 triggers`, () => {
      const data = buildConstBand(60, K);
      const run = runLineVortexPosCross(data);
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

describe('runLineVortexPosCross LINEAR UP', () => {
  it('LINEAR UP: VI+ = 1.5, signal = 1.5, all bullish, 0 triggers', () => {
    const data = buildLinearUp(60);
    const run = runLineVortexPosCross(data);
    for (let i = WARMUP; i < 60; i += 1) {
      expect(run.samples[i]?.regime).toBe('bullish');
      expect(run.vortexValues[i] as number).toBeCloseTo(1.5, 9);
      expect(run.signalValues[i] as number).toBeCloseTo(1.5, 9);
    }
    expect(run.bullishCount).toBe(60 - WARMUP);
    expect(run.bearishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineVortexPosCross LINEAR DOWN', () => {
  it('LINEAR DOWN: VI+ = 0.5, signal = 0.5, all bullish (VI+ === signal), 0 triggers', () => {
    const data = buildLinearDown(60);
    const run = runLineVortexPosCross(data);
    for (let i = WARMUP; i < 60; i += 1) {
      expect(run.samples[i]?.regime).toBe('bullish');
      expect(run.vortexValues[i] as number).toBeCloseTo(0.5, 9);
      expect(run.signalValues[i] as number).toBeCloseTo(0.5, 9);
    }
    expect(run.bullishCount).toBe(60 - WARMUP);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineVortexPosCross misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineVortexPosCrossPoint[] = [
      { x: 2, high: 1, low: 0, close: 0.5 },
      { x: 0, high: 1, low: 0, close: 0.5 },
      { x: 1, high: 1, low: 0, close: 0.5 },
    ];
    const run = runLineVortexPosCross(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConstBand(10, 50);
    const run = runLineVortexPosCross(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineVortexPosCross([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom tuning', () => {
    const data = buildLinearUp(60);
    const run = runLineVortexPosCross(data, { period: 7, signalLength: 2 });
    expect(run.period).toBe(7);
    expect(run.signalLength).toBe(2);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(60);
    const run = runLineVortexPosCross(data);
    expect(run.bullishCount + run.bearishCount + run.noneCount).toBe(60);
  });

  it('VM+, VM-, TR are valid from i>=1', () => {
    const data = buildConstBand(20, 50);
    const run = runLineVortexPosCross(data);
    expect(run.vmPlus[0]).toBeNull();
    expect(run.vmMinus[0]).toBeNull();
    expect(run.trueRange[0]).toBeNull();
    expect(run.vmPlus[1]).toBeCloseTo(2, 9);
    expect(run.vmMinus[1]).toBeCloseTo(2, 9);
    expect(run.trueRange[1]).toBeCloseTo(2, 9);
  });
});

describe('computeLineVortexPosCrossLayout', () => {
  it('renders SVG paths for CONST K=50', () => {
    const data = buildConstBand(60, 50);
    const layout = computeLineVortexPosCrossLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(60);
    expect(layout.vortexPath).toContain('M ');
    expect(layout.signalPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineVortexPosCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.vortexPath).toBe('');
    expect(layout.signalPath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineVortexPosCrossLayout({
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
    const layout = computeLineVortexPosCrossLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });
});

describe('describeLineVortexPosCrossChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineVortexPosCrossChart([])).toBe('No data');
  });

  it('mentions bar count, period, signal', () => {
    const desc = describeLineVortexPosCrossChart(buildLinearUp(60));
    expect(desc).toContain('60 bars');
    expect(desc).toContain('period 14');
    expect(desc).toContain('signalLength 3');
    expect(desc).toContain('bias coloring');
  });
});

describe('<ChartLineVortexPosCross /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineVortexPosCross data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-vortex-pos-cross"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-period')).toBe(String(PERIOD));
    expect(root?.getAttribute('data-signal-length')).toBe(String(SIGNAL));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(<ChartLineVortexPosCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-vortex-pos-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders vortex and signal paths', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineVortexPosCross data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-vortex-pos-cross-vortex-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-vortex-pos-cross-signal-path"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineVortexPosCross data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vortex-pos-cross-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineVortexPosCross data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-vortex-pos-cross-badge"]',
    );
    expect(badge?.textContent).toContain('period 14');
    expect(badge?.textContent).toContain('signal 3');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineVortexPosCross data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-vortex-pos-cross"]',
    );
    expect(root?.getAttribute('aria-label')).toBe('Vortex+-over-Signal chart');
  });

  it('exposes data-*-count counters', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineVortexPosCross data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-vortex-pos-cross"]',
    );
    expect(root?.getAttribute('data-bullish-count')).toBe(
      String(60 - WARMUP),
    );
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineVortexPosCross data={data} hiddenSeries={['signal']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vortex-pos-cross-signal-path"]',
      ),
    ).toBeNull();
  });
});
