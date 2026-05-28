import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineAdxNegCross,
  DEFAULT_CHART_LINE_ADX_NEG_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_ADX_NEG_CROSS_PADDING,
  DEFAULT_CHART_LINE_ADX_NEG_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_ADX_NEG_CROSS_PERIOD,
  DEFAULT_CHART_LINE_ADX_NEG_CROSS_WIDTH,
  classifyLineAdxNegCrossBias,
  classifyLineAdxNegCrossRegime,
  computeLineAdxNegCross,
  computeLineAdxNegCrossLayout,
  describeLineAdxNegCrossChart,
  detectLineAdxNegCrossCrosses,
  getLineAdxNegCrossFinitePoints,
  normalizeLineAdxNegCrossLength,
  runLineAdxNegCross,
  type ChartLineAdxNegCrossPoint,
} from './chart-line-adx-neg-cross';

const PERIOD = 14;
const WARMUP = PERIOD + 1; // 15

const buildConstBand = (
  n: number,
  k: number,
): ChartLineAdxNegCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: k + 1,
    low: k - 1,
    close: k,
  }));

const buildLinearUp = (n: number): ChartLineAdxNegCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: i + 1,
    low: i - 1,
    close: i,
  }));

const buildLinearDown = (n: number): ChartLineAdxNegCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: -i + 1,
    low: -i - 1,
    close: -i,
  }));

describe('ChartLineAdxNegCross defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_ADX_NEG_CROSS_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_ADX_NEG_CROSS_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_ADX_NEG_CROSS_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_ADX_NEG_CROSS_PANEL_GAP).toBe(12);
  });

  it('exports canonical ADX tuning', () => {
    expect(DEFAULT_CHART_LINE_ADX_NEG_CROSS_PERIOD).toBe(14);
  });
});

describe('getLineAdxNegCrossFinitePoints', () => {
  it('filters NaN/Infinity and high<low', () => {
    const points = [
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: NaN, high: 2, low: 1, close: 1.5 },
      { x: 1, high: 1, low: 2, close: 1.5 },
      { x: 2, high: Infinity, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ];
    expect(getLineAdxNegCrossFinitePoints(points)).toEqual([
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ]);
  });

  it('returns empty for null/non-array', () => {
    expect(getLineAdxNegCrossFinitePoints(null)).toEqual([]);
    expect(getLineAdxNegCrossFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineAdxNegCrossLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineAdxNegCrossLength(14.7, 14)).toBe(14);
    expect(normalizeLineAdxNegCrossLength(0, 14)).toBe(14);
  });
});

describe('computeLineAdxNegCross CONST band', () => {
  it('-DI = 0 (no directional movement)', () => {
    const data = buildConstBand(40, 50);
    const out = computeLineAdxNegCross(data);
    for (let i = PERIOD; i < 40; i += 1) {
      expect(out[i] as number).toBe(0);
    }
  });
});

describe('computeLineAdxNegCross LINEAR UP', () => {
  it('-DI = 0 (no bearish movement)', () => {
    const data = buildLinearUp(40);
    const out = computeLineAdxNegCross(data);
    for (let i = PERIOD; i < 40; i += 1) {
      expect(out[i] as number).toBe(0);
    }
  });
});

describe('computeLineAdxNegCross LINEAR DOWN', () => {
  it('-DI = 50 (constant, pure bearish directional movement)', () => {
    const data = buildLinearDown(40);
    const out = computeLineAdxNegCross(data);
    for (let i = PERIOD; i < 40; i += 1) {
      expect(out[i] as number).toBeCloseTo(50, 9);
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineAdxNegCross([])).toEqual([]);
  });
});

describe('classifyLineAdxNegCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineAdxNegCrossRegime(null)).toBe('none');
  });
  it('-DI > 0 -> bearish (downtrend pressure active)', () => {
    expect(classifyLineAdxNegCrossRegime(10)).toBe('bearish');
  });
  it('-DI === 0 -> none (no movement)', () => {
    expect(classifyLineAdxNegCrossRegime(0)).toBe('none');
  });
  it('-DI < 0 -> bullish (never in practice but classifier supports)', () => {
    expect(classifyLineAdxNegCrossRegime(-1)).toBe('bullish');
  });
});

describe('classifyLineAdxNegCrossBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineAdxNegCrossBias(60, 50)).toBe('up');
    expect(classifyLineAdxNegCrossBias(40, 50)).toBe('down');
    expect(classifyLineAdxNegCrossBias(50, 50)).toBe('flat');
    expect(classifyLineAdxNegCrossBias(null, 50)).toBe('none');
  });
});

describe('detectLineAdxNegCrossCrosses (inverted semantics)', () => {
  it('fires BEARISH on -DI transition from 0 -> positive (downtrend emerging)', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const minusDI: Array<number | null> = [0, 0, 15, 30];
    const out = detectLineAdxNegCrossCrosses(series, minusDI);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
    expect(out[0]?.index).toBe(2);
    expect(out[0]?.bias).toBe('up');
  });

  it('does not fire when both prev and cur are zero', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const minusDI: Array<number | null> = [0, 0, 0, 0];
    const out = detectLineAdxNegCrossCrosses(series, minusDI);
    expect(out).toHaveLength(0);
  });

  it('does not fire when -DI stays positive (already above 0)', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const minusDI: Array<number | null> = [10, 20, 30, 40];
    const out = detectLineAdxNegCrossCrosses(series, minusDI);
    expect(out).toHaveLength(0);
  });

  it('skips null-prev bars', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const minusDI: Array<number | null> = [null, null, 0, 30];
    const out = detectLineAdxNegCrossCrosses(series, minusDI);
    // i=2: prev=null, skip. i=3: prev=0, cur=30 -> fire bearish.
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
  });
});

describe('runLineAdxNegCross CONST band', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST band ${K}: -DI = 0 constant, 0 crosses`, () => {
      const data = buildConstBand(40, K);
      const run = runLineAdxNegCross(data);
      expect(run.period).toBe(PERIOD);
      for (let i = WARMUP; i < 40; i += 1) {
        expect(run.minusDIValues[i] as number).toBe(0);
      }
      expect(run.bearishCount).toBe(0); // -DI = 0 -> regime none
      expect(run.crosses).toHaveLength(0);
      expect(run.ok).toBe(true);
    });
  }
});

describe('runLineAdxNegCross LINEAR UP', () => {
  it('-DI = 0 constant (no bearish movement), 0 crosses', () => {
    const data = buildLinearUp(40);
    const run = runLineAdxNegCross(data);
    for (let i = WARMUP; i < 40; i += 1) {
      expect(run.minusDIValues[i] as number).toBe(0);
    }
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineAdxNegCross LINEAR DOWN', () => {
  it('-DI = 50 constant (no transition from 0), 0 crosses, regime bearish', () => {
    const data = buildLinearDown(40);
    const run = runLineAdxNegCross(data);
    for (let i = WARMUP; i < 40; i += 1) {
      expect(run.minusDIValues[i] as number).toBeCloseTo(50, 9);
    }
    expect(run.bearishCount).toBeGreaterThan(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineAdxNegCross misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineAdxNegCrossPoint[] = [
      { x: 2, high: 1, low: 0, close: 0.5 },
      { x: 0, high: 1, low: 0, close: 0.5 },
      { x: 1, high: 1, low: 0, close: 0.5 },
    ];
    const run = runLineAdxNegCross(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConstBand(15, 50);
    const run = runLineAdxNegCross(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineAdxNegCross([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom period', () => {
    const data = buildLinearDown(60);
    const run = runLineAdxNegCross(data, { period: 7 });
    expect(run.period).toBe(7);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearDown(40);
    const run = runLineAdxNegCross(data);
    expect(run.bullishCount + run.bearishCount + run.noneCount).toBe(40);
  });
});

describe('computeLineAdxNegCrossLayout', () => {
  it('renders SVG paths for LINEAR DOWN', () => {
    const data = buildLinearDown(40);
    const layout = computeLineAdxNegCrossLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(40);
    expect(layout.minusDIPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('panel hard-locked to [0, 100]', () => {
    const layout = computeLineAdxNegCrossLayout({
      data: buildLinearDown(40),
    });
    expect(layout.oscMin).toBe(0);
    expect(layout.oscMax).toBe(100);
  });

  it('zero line renders at oscBottom', () => {
    const layout = computeLineAdxNegCrossLayout({
      data: buildLinearDown(40),
    });
    expect(layout.zeroLineY).toBe(layout.oscBottom);
  });

  it('falls back when no data', () => {
    const layout = computeLineAdxNegCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineAdxNegCrossLayout({
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
    const data = buildConstBand(40, 100);
    const layout = computeLineAdxNegCrossLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });
});

describe('describeLineAdxNegCrossChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineAdxNegCrossChart([])).toBe('No data');
  });

  it('mentions bar count, period, downtrend strength trigger', () => {
    const desc = describeLineAdxNegCrossChart(buildLinearDown(40));
    expect(desc).toContain('40 bars');
    expect(desc).toContain('period 14');
    expect(desc).toContain('downtrend strength trigger');
    expect(desc).toContain('bias coloring');
  });
});

describe('<ChartLineAdxNegCross /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearDown(40);
    const { container } = render(<ChartLineAdxNegCross data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-adx-neg-cross"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-period')).toBe(String(PERIOD));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(<ChartLineAdxNegCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-neg-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders -DI path and zero line', () => {
    const data = buildLinearDown(40);
    const { container } = render(<ChartLineAdxNegCross data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-neg-cross-minus-di-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-neg-cross-zero-line"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearDown(40);
    const { container } = render(
      <ChartLineAdxNegCross data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-neg-cross-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildLinearDown(40);
    const { container } = render(<ChartLineAdxNegCross data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-adx-neg-cross-badge"]',
    );
    expect(badge?.textContent).toContain('period 14');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearDown(40);
    const { container } = render(<ChartLineAdxNegCross data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-adx-neg-cross"]',
    );
    expect(root?.getAttribute('aria-label')).toBe(
      'ADX -DI zero-cross chart',
    );
  });

  it('exposes data-cross-count counter for LINEAR DOWN', () => {
    const data = buildLinearDown(40);
    const { container } = render(<ChartLineAdxNegCross data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-adx-neg-cross"]',
    );
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearDown(40);
    const { container } = render(
      <ChartLineAdxNegCross data={data} hiddenSeries={['minusDI']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-neg-cross-minus-di-path"]',
      ),
    ).toBeNull();
  });
});
