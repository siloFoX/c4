import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineAtrBreakoutCross,
  DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_BASELINE_LENGTH,
  DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_MULTIPLIER,
  DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_PADDING,
  DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_PERIOD,
  DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_WIDTH,
  applyLineAtrBreakoutCrossSma,
  classifyLineAtrBreakoutCrossBias,
  classifyLineAtrBreakoutCrossRegime,
  computeLineAtrBreakoutCross,
  computeLineAtrBreakoutCrossLayout,
  describeLineAtrBreakoutCrossChart,
  detectLineAtrBreakoutCrossCrosses,
  getLineAtrBreakoutCrossFinitePoints,
  normalizeLineAtrBreakoutCrossLength,
  normalizeLineAtrBreakoutCrossMultiplier,
  runLineAtrBreakoutCross,
  type ChartLineAtrBreakoutCrossPoint,
} from './chart-line-atr-breakout-cross';

const PERIOD = 14;
const BASELINE_LENGTH = 20;
const MULTIPLIER = 1.5;
const WARMUP = PERIOD + BASELINE_LENGTH - 1; // 33

const buildConstBand = (
  n: number,
  k: number,
): ChartLineAtrBreakoutCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: k + 1,
    low: k - 1,
    close: k,
  }));

const buildWideConstBand = (
  n: number,
  k: number,
): ChartLineAtrBreakoutCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: k + 2,
    low: k - 2,
    close: k,
  }));

const buildLinearUp = (n: number): ChartLineAtrBreakoutCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: i + 1,
    low: i - 1,
    close: i,
  }));

const buildLinearDown = (n: number): ChartLineAtrBreakoutCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: -i + 1,
    low: -i - 1,
    close: -i,
  }));

describe('ChartLineAtrBreakoutCross defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_PANEL_GAP).toBe(12);
  });

  it('exports canonical ATR breakout tuning', () => {
    expect(DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_PERIOD).toBe(14);
    expect(DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_BASELINE_LENGTH).toBe(20);
    expect(DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_MULTIPLIER).toBe(1.5);
  });
});

describe('getLineAtrBreakoutCrossFinitePoints', () => {
  it('filters NaN/Infinity and high<low', () => {
    const points = [
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: NaN, high: 2, low: 1, close: 1.5 },
      { x: 1, high: 1, low: 2, close: 1.5 },
      { x: 2, high: Infinity, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ];
    expect(getLineAtrBreakoutCrossFinitePoints(points)).toEqual([
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ]);
  });

  it('returns empty for null and non-array', () => {
    expect(getLineAtrBreakoutCrossFinitePoints(null)).toEqual([]);
    expect(getLineAtrBreakoutCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineAtrBreakoutCrossFinitePoints(
        // @ts-expect-error -- intentionally bad
        'oops',
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineAtrBreakoutCrossLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineAtrBreakoutCrossLength(14.7, 14)).toBe(14);
    expect(normalizeLineAtrBreakoutCrossLength(0, 14)).toBe(14);
    expect(normalizeLineAtrBreakoutCrossLength(NaN, 14)).toBe(14);
  });
});

describe('normalizeLineAtrBreakoutCrossMultiplier', () => {
  it('accepts finite >0 values', () => {
    expect(normalizeLineAtrBreakoutCrossMultiplier(1.5, 1.5)).toBe(1.5);
    expect(normalizeLineAtrBreakoutCrossMultiplier(2.0, 1.5)).toBe(2.0);
    expect(normalizeLineAtrBreakoutCrossMultiplier(0, 1.5)).toBe(1.5);
    expect(normalizeLineAtrBreakoutCrossMultiplier(-1, 1.5)).toBe(1.5);
    expect(normalizeLineAtrBreakoutCrossMultiplier(NaN, 1.5)).toBe(1.5);
  });
});

describe('applyLineAtrBreakoutCrossSma', () => {
  it('CONST returns constant', () => {
    const values: Array<number | null> = Array.from({ length: 10 }, () => 5);
    const sma = applyLineAtrBreakoutCrossSma(values, 3);
    for (let i = 2; i < 10; i += 1) expect(sma[i]).toBe(5);
  });

  it('returns nulls when length < 1', () => {
    expect(
      applyLineAtrBreakoutCrossSma([1, 2, 3], 0).every((v) => v === null),
    ).toBe(true);
  });

  it('length 1 returns values verbatim', () => {
    const out = applyLineAtrBreakoutCrossSma([1, 2, 3, null, 5], 1);
    expect(out).toEqual([1, 2, 3, null, 5]);
  });
});

describe('computeLineAtrBreakoutCross CONST band', () => {
  it('TR=2, ATR=2, baseline=2, threshold=3 from warmup', () => {
    const data = buildConstBand(50, 50);
    const out = computeLineAtrBreakoutCross(data);
    for (let i = 1; i < 50; i += 1) {
      expect(out.trueRange[i] as number).toBeCloseTo(2, 9);
    }
    for (let i = PERIOD; i < 50; i += 1) {
      expect(out.atr[i] as number).toBeCloseTo(2, 9);
    }
    for (let i = WARMUP; i < 50; i += 1) {
      expect(out.baseline[i] as number).toBeCloseTo(2, 9);
      expect(out.threshold[i] as number).toBeCloseTo(3, 9);
    }
  });
});

describe('computeLineAtrBreakoutCross WIDE CONST band', () => {
  it('TR=4, ATR=4, baseline=4, threshold=6 from warmup', () => {
    const data = buildWideConstBand(50, 50);
    const out = computeLineAtrBreakoutCross(data);
    for (let i = 1; i < 50; i += 1) {
      expect(out.trueRange[i] as number).toBeCloseTo(4, 9);
    }
    for (let i = PERIOD; i < 50; i += 1) {
      expect(out.atr[i] as number).toBeCloseTo(4, 9);
    }
    for (let i = WARMUP; i < 50; i += 1) {
      expect(out.baseline[i] as number).toBeCloseTo(4, 9);
      expect(out.threshold[i] as number).toBeCloseTo(6, 9);
    }
  });
});

describe('computeLineAtrBreakoutCross LINEAR UP', () => {
  it('TR=2, ATR=2 from warmup', () => {
    const data = buildLinearUp(50);
    const out = computeLineAtrBreakoutCross(data);
    for (let i = 1; i < 50; i += 1) {
      expect(out.trueRange[i] as number).toBeCloseTo(2, 9);
    }
    for (let i = PERIOD; i < 50; i += 1) {
      expect(out.atr[i] as number).toBeCloseTo(2, 9);
    }
  });
});

describe('computeLineAtrBreakoutCross LINEAR DOWN', () => {
  it('TR=2, ATR=2 from warmup (mirror)', () => {
    const data = buildLinearDown(50);
    const out = computeLineAtrBreakoutCross(data);
    for (let i = 1; i < 50; i += 1) {
      expect(out.trueRange[i] as number).toBeCloseTo(2, 9);
    }
    for (let i = PERIOD; i < 50; i += 1) {
      expect(out.atr[i] as number).toBeCloseTo(2, 9);
    }
  });

  it('returns empty for empty data', () => {
    const out = computeLineAtrBreakoutCross([]);
    expect(out.trueRange).toEqual([]);
    expect(out.atr).toEqual([]);
    expect(out.baseline).toEqual([]);
    expect(out.threshold).toEqual([]);
  });
});

describe('classifyLineAtrBreakoutCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineAtrBreakoutCrossRegime(null, 2, 3)).toBe('none');
    expect(classifyLineAtrBreakoutCrossRegime(2, null, 3)).toBe('none');
    expect(classifyLineAtrBreakoutCrossRegime(2, 2, null)).toBe('none');
  });
  it('ATR < baseline -> compressed', () => {
    expect(classifyLineAtrBreakoutCrossRegime(1.5, 2, 3)).toBe('compressed');
  });
  it('baseline <= ATR < threshold -> neutral', () => {
    expect(classifyLineAtrBreakoutCrossRegime(2, 2, 3)).toBe('neutral');
    expect(classifyLineAtrBreakoutCrossRegime(2.5, 2, 3)).toBe('neutral');
  });
  it('ATR >= threshold -> expanded', () => {
    expect(classifyLineAtrBreakoutCrossRegime(3, 2, 3)).toBe('expanded');
    expect(classifyLineAtrBreakoutCrossRegime(5, 2, 3)).toBe('expanded');
  });
});

describe('classifyLineAtrBreakoutCrossBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineAtrBreakoutCrossBias(3, 2)).toBe('up');
    expect(classifyLineAtrBreakoutCrossBias(1, 2)).toBe('down');
    expect(classifyLineAtrBreakoutCrossBias(2, 2)).toBe('flat');
    expect(classifyLineAtrBreakoutCrossBias(null, 2)).toBe('none');
  });
});

describe('detectLineAtrBreakoutCrossCrosses', () => {
  it('detects bullish breakout', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const atr: Array<number | null> = [2.5, 2.8, 3.5, 3.7];
    const threshold: Array<number | null> = [3, 3, 3, 3];
    const out = detectLineAtrBreakoutCrossCrosses(series, atr, threshold);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
  });

  it('detects bearish compression', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const atr: Array<number | null> = [3.7, 3.5, 2.8, 2.5];
    const threshold: Array<number | null> = [3, 3, 3, 3];
    const out = detectLineAtrBreakoutCrossCrosses(series, atr, threshold);
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
    const atr: Array<number | null> = [null, null, 2.5, 2.5];
    const threshold: Array<number | null> = [null, null, 3, 3];
    expect(
      detectLineAtrBreakoutCrossCrosses(series, atr, threshold),
    ).toEqual([]);
  });

  it('does not double-fire', () => {
    const series = Array.from({ length: 5 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const atr: Array<number | null> = [2.5, 2.8, 3.5, 3.7, 3.9];
    const threshold: Array<number | null> = [3, 3, 3, 3, 3];
    expect(
      detectLineAtrBreakoutCrossCrosses(series, atr, threshold),
    ).toHaveLength(1);
  });
});

describe('runLineAtrBreakoutCross CONST band', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST band centred at ${K}: ATR=2, baseline=2, threshold=3, all neutral, 0 triggers`, () => {
      const data = buildConstBand(60, K);
      const run = runLineAtrBreakoutCross(data);
      expect(run.period).toBe(PERIOD);
      expect(run.baselineLength).toBe(BASELINE_LENGTH);
      expect(run.multiplier).toBe(MULTIPLIER);
      for (let i = 0; i < WARMUP; i += 1) {
        expect(run.baselineValues[i]).toBeNull();
        expect(run.thresholdValues[i]).toBeNull();
      }
      for (let i = WARMUP; i < 60; i += 1) {
        expect(run.atrValues[i] as number).toBeCloseTo(2, 9);
        expect(run.baselineValues[i] as number).toBeCloseTo(2, 9);
        expect(run.thresholdValues[i] as number).toBeCloseTo(3, 9);
        expect(run.samples[i]?.regime).toBe('neutral');
      }
      expect(run.neutralCount).toBe(60 - WARMUP);
      expect(run.compressedCount).toBe(0);
      expect(run.expandedCount).toBe(0);
      expect(run.noneCount).toBe(WARMUP);
      expect(run.crosses).toHaveLength(0);
      expect(run.ok).toBe(true);
    });
  }
});

describe('runLineAtrBreakoutCross WIDE CONST band', () => {
  it('WIDE CONST: ATR=4, baseline=4, threshold=6, neutral, 0 triggers', () => {
    const data = buildWideConstBand(60, 100);
    const run = runLineAtrBreakoutCross(data);
    for (let i = WARMUP; i < 60; i += 1) {
      expect(run.atrValues[i] as number).toBeCloseTo(4, 9);
      expect(run.baselineValues[i] as number).toBeCloseTo(4, 9);
      expect(run.thresholdValues[i] as number).toBeCloseTo(6, 9);
      expect(run.samples[i]?.regime).toBe('neutral');
    }
    expect(run.neutralCount).toBe(60 - WARMUP);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineAtrBreakoutCross LINEAR UP', () => {
  it('LINEAR UP: ATR=2, baseline=2, threshold=3, neutral, 0 triggers', () => {
    const data = buildLinearUp(60);
    const run = runLineAtrBreakoutCross(data);
    for (let i = WARMUP; i < 60; i += 1) {
      expect(run.samples[i]?.regime).toBe('neutral');
      expect(run.atrValues[i] as number).toBeCloseTo(2, 9);
    }
    expect(run.neutralCount).toBe(60 - WARMUP);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineAtrBreakoutCross LINEAR DOWN', () => {
  it('LINEAR DOWN: ATR=2, baseline=2, threshold=3, neutral, 0 triggers', () => {
    const data = buildLinearDown(60);
    const run = runLineAtrBreakoutCross(data);
    for (let i = WARMUP; i < 60; i += 1) {
      expect(run.samples[i]?.regime).toBe('neutral');
      expect(run.atrValues[i] as number).toBeCloseTo(2, 9);
    }
    expect(run.neutralCount).toBe(60 - WARMUP);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineAtrBreakoutCross misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineAtrBreakoutCrossPoint[] = [
      { x: 2, high: 1, low: 0, close: 0.5 },
      { x: 0, high: 1, low: 0, close: 0.5 },
      { x: 1, high: 1, low: 0, close: 0.5 },
    ];
    const run = runLineAtrBreakoutCross(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConstBand(20, 50);
    const run = runLineAtrBreakoutCross(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineAtrBreakoutCross([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom tuning', () => {
    const data = buildLinearUp(60);
    const run = runLineAtrBreakoutCross(data, {
      period: 7,
      baselineLength: 10,
      multiplier: 2,
    });
    expect(run.period).toBe(7);
    expect(run.baselineLength).toBe(10);
    expect(run.multiplier).toBe(2);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(60);
    const run = runLineAtrBreakoutCross(data);
    expect(
      run.compressedCount +
        run.neutralCount +
        run.expandedCount +
        run.noneCount,
    ).toBe(60);
  });

  it('TR is valid from i>=1', () => {
    const data = buildConstBand(20, 50);
    const run = runLineAtrBreakoutCross(data);
    expect(run.trueRange[0]).toBeNull();
    expect(run.trueRange[1] as number).toBeCloseTo(2, 9);
  });

  it('threshold === baseline * multiplier', () => {
    const data = buildWideConstBand(60, 100);
    const run = runLineAtrBreakoutCross(data);
    for (let i = WARMUP; i < 60; i += 1) {
      const b = run.baselineValues[i] as number;
      const t = run.thresholdValues[i] as number;
      expect(t).toBeCloseTo(b * MULTIPLIER, 9);
    }
  });
});

describe('computeLineAtrBreakoutCrossLayout', () => {
  it('renders SVG paths for CONST K=50', () => {
    const data = buildConstBand(60, 50);
    const layout = computeLineAtrBreakoutCrossLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(60);
    expect(layout.atrPath).toContain('M ');
    expect(layout.baselinePath).toContain('M ');
    expect(layout.thresholdPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineAtrBreakoutCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.atrPath).toBe('');
    expect(layout.baselinePath).toBe('');
    expect(layout.thresholdPath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineAtrBreakoutCrossLayout({
      data: buildLinearUp(60),
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
    const layout = computeLineAtrBreakoutCrossLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });
});

describe('describeLineAtrBreakoutCrossChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineAtrBreakoutCrossChart([])).toBe('No data');
  });

  it('mentions bar count, period, baseline, multiplier, volatility', () => {
    const desc = describeLineAtrBreakoutCrossChart(buildLinearUp(60));
    expect(desc).toContain('60 bars');
    expect(desc).toContain('period 14');
    expect(desc).toContain('baselineLength 20');
    expect(desc).toContain('multiplier 1.5');
    expect(desc).toContain('volatility');
    expect(desc).toContain('range expansion');
    expect(desc).toContain('bias coloring');
  });
});

describe('<ChartLineAtrBreakoutCross /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineAtrBreakoutCross data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-atr-breakout-cross"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-period')).toBe(String(PERIOD));
    expect(root?.getAttribute('data-baseline-length')).toBe(
      String(BASELINE_LENGTH),
    );
    expect(root?.getAttribute('data-multiplier')).toBe(String(MULTIPLIER));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(<ChartLineAtrBreakoutCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-breakout-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders ATR, baseline, threshold paths', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineAtrBreakoutCross data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-breakout-cross-atr-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-breakout-cross-baseline-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-breakout-cross-threshold-path"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineAtrBreakoutCross data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-breakout-cross-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineAtrBreakoutCross data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-atr-breakout-cross-badge"]',
    );
    expect(badge?.textContent).toContain('period 14');
    expect(badge?.textContent).toContain('baseline 20');
    expect(badge?.textContent).toContain('mult 1.5');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineAtrBreakoutCross data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-atr-breakout-cross"]',
    );
    expect(root?.getAttribute('aria-label')).toBe(
      'ATR volatility breakout chart',
    );
  });

  it('exposes data-*-count counters', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineAtrBreakoutCross data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-atr-breakout-cross"]',
    );
    expect(root?.getAttribute('data-neutral-count')).toBe(
      String(60 - WARMUP),
    );
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineAtrBreakoutCross data={data} hiddenSeries={['threshold']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-breakout-cross-threshold-path"]',
      ),
    ).toBeNull();
  });
});
