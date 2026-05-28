import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineAdxPosCross,
  DEFAULT_CHART_LINE_ADX_POS_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_ADX_POS_CROSS_PADDING,
  DEFAULT_CHART_LINE_ADX_POS_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_ADX_POS_CROSS_PERIOD,
  DEFAULT_CHART_LINE_ADX_POS_CROSS_WIDTH,
  classifyLineAdxPosCrossBias,
  classifyLineAdxPosCrossRegime,
  computeLineAdxPosCross,
  computeLineAdxPosCrossLayout,
  describeLineAdxPosCrossChart,
  detectLineAdxPosCrossCrosses,
  getLineAdxPosCrossFinitePoints,
  normalizeLineAdxPosCrossLength,
  runLineAdxPosCross,
  type ChartLineAdxPosCrossPoint,
} from './chart-line-adx-pos-cross';

const PERIOD = 14;
const WARMUP = PERIOD + 1; // 15

const buildConstBand = (
  n: number,
  k: number,
): ChartLineAdxPosCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: k + 1,
    low: k - 1,
    close: k,
  }));

const buildLinearUp = (n: number): ChartLineAdxPosCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: i + 1,
    low: i - 1,
    close: i,
  }));

const buildLinearDown = (n: number): ChartLineAdxPosCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: -i + 1,
    low: -i - 1,
    close: -i,
  }));

describe('ChartLineAdxPosCross defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_ADX_POS_CROSS_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_ADX_POS_CROSS_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_ADX_POS_CROSS_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_ADX_POS_CROSS_PANEL_GAP).toBe(12);
  });

  it('exports canonical ADX tuning', () => {
    expect(DEFAULT_CHART_LINE_ADX_POS_CROSS_PERIOD).toBe(14);
  });
});

describe('getLineAdxPosCrossFinitePoints', () => {
  it('filters NaN/Infinity and high<low', () => {
    const points = [
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: NaN, high: 2, low: 1, close: 1.5 },
      { x: 1, high: 1, low: 2, close: 1.5 },
      { x: 2, high: Infinity, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ];
    expect(getLineAdxPosCrossFinitePoints(points)).toEqual([
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ]);
  });

  it('returns empty for null/non-array', () => {
    expect(getLineAdxPosCrossFinitePoints(null)).toEqual([]);
    expect(getLineAdxPosCrossFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineAdxPosCrossLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineAdxPosCrossLength(14.7, 14)).toBe(14);
    expect(normalizeLineAdxPosCrossLength(0, 14)).toBe(14);
  });
});

describe('computeLineAdxPosCross CONST band', () => {
  it('+DI = 0 (no directional movement)', () => {
    const data = buildConstBand(40, 50);
    const out = computeLineAdxPosCross(data);
    for (let i = PERIOD; i < 40; i += 1) {
      expect(out[i] as number).toBe(0);
    }
  });
});

describe('computeLineAdxPosCross LINEAR UP', () => {
  it('+DI = 50 (constant, pure bullish directional movement)', () => {
    const data = buildLinearUp(40);
    const out = computeLineAdxPosCross(data);
    for (let i = PERIOD; i < 40; i += 1) {
      expect(out[i] as number).toBeCloseTo(50, 9);
    }
  });
});

describe('computeLineAdxPosCross LINEAR DOWN', () => {
  it('+DI = 0 (pure bearish, no bullish movement)', () => {
    const data = buildLinearDown(40);
    const out = computeLineAdxPosCross(data);
    for (let i = PERIOD; i < 40; i += 1) {
      expect(out[i] as number).toBe(0);
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineAdxPosCross([])).toEqual([]);
  });
});

describe('classifyLineAdxPosCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineAdxPosCrossRegime(null)).toBe('none');
  });
  it('+DI > 0 -> bullish', () => {
    expect(classifyLineAdxPosCrossRegime(10)).toBe('bullish');
  });
  it('+DI === 0 -> none (no movement)', () => {
    expect(classifyLineAdxPosCrossRegime(0)).toBe('none');
  });
  it('+DI < 0 -> bearish (never in practice but classifier supports)', () => {
    expect(classifyLineAdxPosCrossRegime(-1)).toBe('bearish');
  });
});

describe('classifyLineAdxPosCrossBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineAdxPosCrossBias(60, 50)).toBe('up');
    expect(classifyLineAdxPosCrossBias(40, 50)).toBe('down');
    expect(classifyLineAdxPosCrossBias(50, 50)).toBe('flat');
    expect(classifyLineAdxPosCrossBias(null, 50)).toBe('none');
  });
});

describe('detectLineAdxPosCrossCrosses', () => {
  it('fires bullish on +DI transition from 0 -> positive', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const plusDI: Array<number | null> = [0, 0, 15, 30];
    const out = detectLineAdxPosCrossCrosses(series, plusDI);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
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
    const plusDI: Array<number | null> = [0, 0, 0, 0];
    const out = detectLineAdxPosCrossCrosses(series, plusDI);
    expect(out).toHaveLength(0);
  });

  it('does not fire when +DI stays positive (already above 0)', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const plusDI: Array<number | null> = [10, 20, 30, 40];
    const out = detectLineAdxPosCrossCrosses(series, plusDI);
    expect(out).toHaveLength(0);
  });

  it('skips null-prev bars', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const plusDI: Array<number | null> = [null, null, 0, 30];
    const out = detectLineAdxPosCrossCrosses(series, plusDI);
    // i=2: prev=null, skip. i=3: prev=0, cur=30 -> fire bullish.
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
  });
});

describe('runLineAdxPosCross CONST band', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST band ${K}: +DI = 0 constant, 0 crosses`, () => {
      const data = buildConstBand(40, K);
      const run = runLineAdxPosCross(data);
      expect(run.period).toBe(PERIOD);
      for (let i = WARMUP; i < 40; i += 1) {
        expect(run.plusDIValues[i] as number).toBe(0);
      }
      expect(run.bullishCount).toBe(0); // +DI = 0 -> regime none
      expect(run.crosses).toHaveLength(0);
      expect(run.ok).toBe(true);
    });
  }
});

describe('runLineAdxPosCross LINEAR UP', () => {
  it('+DI = 50 constant (no transition from 0), 0 crosses', () => {
    const data = buildLinearUp(40);
    const run = runLineAdxPosCross(data);
    for (let i = WARMUP; i < 40; i += 1) {
      expect(run.plusDIValues[i] as number).toBeCloseTo(50, 9);
    }
    expect(run.bullishCount).toBeGreaterThan(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineAdxPosCross LINEAR DOWN', () => {
  it('+DI = 0 constant (no bullish movement), 0 crosses', () => {
    const data = buildLinearDown(40);
    const run = runLineAdxPosCross(data);
    for (let i = WARMUP; i < 40; i += 1) {
      expect(run.plusDIValues[i] as number).toBe(0);
    }
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineAdxPosCross misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineAdxPosCrossPoint[] = [
      { x: 2, high: 1, low: 0, close: 0.5 },
      { x: 0, high: 1, low: 0, close: 0.5 },
      { x: 1, high: 1, low: 0, close: 0.5 },
    ];
    const run = runLineAdxPosCross(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConstBand(15, 50);
    const run = runLineAdxPosCross(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineAdxPosCross([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom period', () => {
    const data = buildLinearUp(60);
    const run = runLineAdxPosCross(data, { period: 7 });
    expect(run.period).toBe(7);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(40);
    const run = runLineAdxPosCross(data);
    expect(run.bullishCount + run.bearishCount + run.noneCount).toBe(40);
  });
});

describe('computeLineAdxPosCrossLayout', () => {
  it('renders SVG paths for LINEAR UP', () => {
    const data = buildLinearUp(40);
    const layout = computeLineAdxPosCrossLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(40);
    expect(layout.plusDIPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('panel hard-locked to [0, 100]', () => {
    const layout = computeLineAdxPosCrossLayout({
      data: buildLinearUp(40),
    });
    expect(layout.oscMin).toBe(0);
    expect(layout.oscMax).toBe(100);
  });

  it('zero line renders at oscBottom', () => {
    const layout = computeLineAdxPosCrossLayout({
      data: buildLinearUp(40),
    });
    expect(layout.zeroLineY).toBe(layout.oscBottom);
  });

  it('falls back when no data', () => {
    const layout = computeLineAdxPosCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineAdxPosCrossLayout({
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
    const data = buildConstBand(40, 100);
    const layout = computeLineAdxPosCrossLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });
});

describe('describeLineAdxPosCrossChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineAdxPosCrossChart([])).toBe('No data');
  });

  it('mentions bar count, period, uptrend strength trigger', () => {
    const desc = describeLineAdxPosCrossChart(buildLinearUp(40));
    expect(desc).toContain('40 bars');
    expect(desc).toContain('period 14');
    expect(desc).toContain('uptrend strength trigger');
    expect(desc).toContain('bias coloring');
  });
});

describe('<ChartLineAdxPosCross /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(40);
    const { container } = render(<ChartLineAdxPosCross data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-adx-pos-cross"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-period')).toBe(String(PERIOD));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(<ChartLineAdxPosCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-pos-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders +DI path and zero line', () => {
    const data = buildLinearUp(40);
    const { container } = render(<ChartLineAdxPosCross data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-pos-cross-plus-di-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-pos-cross-zero-line"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineAdxPosCross data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-pos-cross-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildLinearUp(40);
    const { container } = render(<ChartLineAdxPosCross data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-adx-pos-cross-badge"]',
    );
    expect(badge?.textContent).toContain('period 14');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(40);
    const { container } = render(<ChartLineAdxPosCross data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-adx-pos-cross"]',
    );
    expect(root?.getAttribute('aria-label')).toBe(
      'ADX +DI zero-cross chart',
    );
  });

  it('exposes data-cross-count counter for LINEAR UP', () => {
    const data = buildLinearUp(40);
    const { container } = render(<ChartLineAdxPosCross data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-adx-pos-cross"]',
    );
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineAdxPosCross data={data} hiddenSeries={['plusDI']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-pos-cross-plus-di-path"]',
      ),
    ).toBeNull();
  });
});
