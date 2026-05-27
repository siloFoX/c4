import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineAdxTrendCross,
  DEFAULT_CHART_LINE_ADX_TREND_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_ADX_TREND_CROSS_LOWER,
  DEFAULT_CHART_LINE_ADX_TREND_CROSS_PADDING,
  DEFAULT_CHART_LINE_ADX_TREND_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_ADX_TREND_CROSS_PERIOD,
  DEFAULT_CHART_LINE_ADX_TREND_CROSS_UPPER,
  DEFAULT_CHART_LINE_ADX_TREND_CROSS_WIDTH,
  classifyLineAdxTrendCrossBias,
  classifyLineAdxTrendCrossRegime,
  computeLineAdxTrendCross,
  computeLineAdxTrendCrossLayout,
  describeLineAdxTrendCrossChart,
  detectLineAdxTrendCrossCrosses,
  getLineAdxTrendCrossFinitePoints,
  normalizeLineAdxTrendCrossLength,
  normalizeLineAdxTrendCrossThreshold,
  runLineAdxTrendCross,
  type ChartLineAdxTrendCrossPoint,
} from './chart-line-adx-trend-cross';

const PERIOD = 14;
const LOWER = 20;
const UPPER = 25;
const ADX_INIT = 2 * PERIOD - 1; // 27 -- first valid ADX index

const buildConstBand = (
  n: number,
  k: number,
): ChartLineAdxTrendCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: k + 1,
    low: k - 1,
    close: k,
  }));

const buildLinearUp = (n: number): ChartLineAdxTrendCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: i + 1,
    low: i - 1,
    close: i,
  }));

const buildLinearDown = (n: number): ChartLineAdxTrendCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: -i + 1,
    low: -i - 1,
    close: -i,
  }));

describe('ChartLineAdxTrendCross defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_ADX_TREND_CROSS_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_ADX_TREND_CROSS_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_ADX_TREND_CROSS_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_ADX_TREND_CROSS_PANEL_GAP).toBe(12);
  });

  it('exports canonical ADX tuning', () => {
    expect(DEFAULT_CHART_LINE_ADX_TREND_CROSS_PERIOD).toBe(14);
    expect(DEFAULT_CHART_LINE_ADX_TREND_CROSS_LOWER).toBe(20);
    expect(DEFAULT_CHART_LINE_ADX_TREND_CROSS_UPPER).toBe(25);
  });
});

describe('getLineAdxTrendCrossFinitePoints', () => {
  it('filters NaN/Infinity and high<low', () => {
    const points = [
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: NaN, high: 2, low: 1, close: 1.5 },
      { x: 1, high: 1, low: 2, close: 1.5 },
      { x: 2, high: Infinity, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ];
    expect(getLineAdxTrendCrossFinitePoints(points)).toEqual([
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ]);
  });

  it('returns empty for null and non-array', () => {
    expect(getLineAdxTrendCrossFinitePoints(null)).toEqual([]);
    expect(getLineAdxTrendCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineAdxTrendCrossFinitePoints(
        // @ts-expect-error -- intentionally bad
        'oops',
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineAdxTrendCrossLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineAdxTrendCrossLength(14.7, 14)).toBe(14);
    expect(normalizeLineAdxTrendCrossLength(0, 14)).toBe(14);
    expect(normalizeLineAdxTrendCrossLength(NaN, 14)).toBe(14);
  });
});

describe('normalizeLineAdxTrendCrossThreshold', () => {
  it('accepts finite >=0 values', () => {
    expect(normalizeLineAdxTrendCrossThreshold(20, 20)).toBe(20);
    expect(normalizeLineAdxTrendCrossThreshold(22.5, 20)).toBe(22.5);
    expect(normalizeLineAdxTrendCrossThreshold(-1, 20)).toBe(20);
    expect(normalizeLineAdxTrendCrossThreshold(NaN, 20)).toBe(20);
  });
});

describe('computeLineAdxTrendCross CONST band', () => {
  it('ADX = 0 from warmup', () => {
    const data = buildConstBand(50, 50);
    const out = computeLineAdxTrendCross(data);
    for (let i = 0; i < ADX_INIT; i += 1) {
      expect(out.adx[i]).toBeNull();
    }
    for (let i = ADX_INIT; i < 50; i += 1) {
      expect(out.adx[i] as number).toBeCloseTo(0, 9);
    }
  });

  it('+DI = -DI = 0, DX = 0 from i = period', () => {
    const data = buildConstBand(50, 50);
    const out = computeLineAdxTrendCross(data);
    for (let i = PERIOD; i < 50; i += 1) {
      expect(out.diPlus[i] as number).toBeCloseTo(0, 9);
      expect(out.diMinus[i] as number).toBeCloseTo(0, 9);
      expect(out.dx[i] as number).toBeCloseTo(0, 9);
    }
  });
});

describe('computeLineAdxTrendCross LINEAR UP', () => {
  it('ADX = 100 from warmup', () => {
    const data = buildLinearUp(50);
    const out = computeLineAdxTrendCross(data);
    for (let i = 0; i < ADX_INIT; i += 1) {
      expect(out.adx[i]).toBeNull();
    }
    for (let i = ADX_INIT; i < 50; i += 1) {
      expect(out.adx[i] as number).toBeCloseTo(100, 9);
    }
  });

  it('+DI = 50, -DI = 0, DX = 100', () => {
    const data = buildLinearUp(50);
    const out = computeLineAdxTrendCross(data);
    for (let i = PERIOD; i < 50; i += 1) {
      expect(out.diPlus[i] as number).toBeCloseTo(50, 9);
      expect(out.diMinus[i] as number).toBeCloseTo(0, 9);
      expect(out.dx[i] as number).toBeCloseTo(100, 9);
    }
  });
});

describe('computeLineAdxTrendCross LINEAR DOWN', () => {
  it('ADX = 100 from warmup (mirror of LINEAR UP)', () => {
    const data = buildLinearDown(50);
    const out = computeLineAdxTrendCross(data);
    for (let i = ADX_INIT; i < 50; i += 1) {
      expect(out.adx[i] as number).toBeCloseTo(100, 9);
    }
  });

  it('+DI = 0, -DI = 50, DX = 100', () => {
    const data = buildLinearDown(50);
    const out = computeLineAdxTrendCross(data);
    for (let i = PERIOD; i < 50; i += 1) {
      expect(out.diPlus[i] as number).toBeCloseTo(0, 9);
      expect(out.diMinus[i] as number).toBeCloseTo(50, 9);
      expect(out.dx[i] as number).toBeCloseTo(100, 9);
    }
  });

  it('returns empty for empty data', () => {
    const out = computeLineAdxTrendCross([]);
    expect(out.vmPlus).toEqual([]);
    expect(out.adx).toEqual([]);
  });
});

describe('classifyLineAdxTrendCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineAdxTrendCrossRegime(null, LOWER, UPPER)).toBe('none');
  });
  it('below lower -> weak', () => {
    expect(classifyLineAdxTrendCrossRegime(15, LOWER, UPPER)).toBe('weak');
    expect(classifyLineAdxTrendCrossRegime(0, LOWER, UPPER)).toBe('weak');
  });
  it('lower <= adx < upper -> forming', () => {
    expect(classifyLineAdxTrendCrossRegime(20, LOWER, UPPER)).toBe('forming');
    expect(classifyLineAdxTrendCrossRegime(22, LOWER, UPPER)).toBe('forming');
    expect(classifyLineAdxTrendCrossRegime(24.9, LOWER, UPPER)).toBe(
      'forming',
    );
  });
  it('adx >= upper -> strong', () => {
    expect(classifyLineAdxTrendCrossRegime(25, LOWER, UPPER)).toBe('strong');
    expect(classifyLineAdxTrendCrossRegime(100, LOWER, UPPER)).toBe('strong');
  });
});

describe('classifyLineAdxTrendCrossBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineAdxTrendCrossBias(30, 25)).toBe('up');
    expect(classifyLineAdxTrendCrossBias(15, 25)).toBe('down');
    expect(classifyLineAdxTrendCrossBias(25, 25)).toBe('flat');
    expect(classifyLineAdxTrendCrossBias(null, 25)).toBe('none');
  });
});

describe('detectLineAdxTrendCrossCrosses', () => {
  it('detects bullish cross through lower', () => {
    const series = Array.from({ length: 3 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const adx: Array<number | null> = [10, 18, 22];
    const out = detectLineAdxTrendCrossCrosses(series, adx, LOWER, UPPER);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
    expect(out[0]?.threshold).toBe('lower');
  });

  it('detects bullish cross through upper', () => {
    const series = Array.from({ length: 3 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const adx: Array<number | null> = [22, 24, 28];
    const out = detectLineAdxTrendCrossCrosses(series, adx, LOWER, UPPER);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
    expect(out[0]?.threshold).toBe('upper');
  });

  it('detects two crosses when ADX leaps lower->above upper', () => {
    const series = Array.from({ length: 3 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const adx: Array<number | null> = [10, 18, 35];
    const out = detectLineAdxTrendCrossCrosses(series, adx, LOWER, UPPER);
    expect(out).toHaveLength(2);
    expect(out[0]?.threshold).toBe('lower');
    expect(out[1]?.threshold).toBe('upper');
  });

  it('detects bearish cross through upper', () => {
    const series = Array.from({ length: 3 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const adx: Array<number | null> = [30, 27, 22];
    const out = detectLineAdxTrendCrossCrosses(series, adx, LOWER, UPPER);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
    expect(out[0]?.threshold).toBe('upper');
  });

  it('detects bearish cross through lower', () => {
    const series = Array.from({ length: 3 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const adx: Array<number | null> = [22, 21, 18];
    const out = detectLineAdxTrendCrossCrosses(series, adx, LOWER, UPPER);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
    expect(out[0]?.threshold).toBe('lower');
  });

  it('does not fire on null values (warmup leaves no prev)', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const adx: Array<number | null> = [null, null, 18, 18];
    expect(detectLineAdxTrendCrossCrosses(series, adx, LOWER, UPPER)).toEqual(
      [],
    );
  });
});

describe('runLineAdxTrendCross CONST band', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST band centred at ${K}: ADX=0, all weak, 0 triggers`, () => {
      const data = buildConstBand(60, K);
      const run = runLineAdxTrendCross(data);
      expect(run.period).toBe(PERIOD);
      expect(run.lower).toBe(LOWER);
      expect(run.upper).toBe(UPPER);
      for (let i = 0; i < ADX_INIT; i += 1) {
        expect(run.adxValues[i]).toBeNull();
      }
      for (let i = ADX_INIT; i < 60; i += 1) {
        expect(run.adxValues[i] as number).toBeCloseTo(0, 9);
        expect(run.samples[i]?.regime).toBe('weak');
      }
      expect(run.weakCount).toBe(60 - ADX_INIT);
      expect(run.formingCount).toBe(0);
      expect(run.strongCount).toBe(0);
      expect(run.noneCount).toBe(ADX_INIT);
      expect(run.crosses).toHaveLength(0);
      expect(run.ok).toBe(true);
    });
  }
});

describe('runLineAdxTrendCross LINEAR UP', () => {
  it('LINEAR UP: ADX=100, all strong, 0 triggers', () => {
    const data = buildLinearUp(60);
    const run = runLineAdxTrendCross(data);
    for (let i = ADX_INIT; i < 60; i += 1) {
      expect(run.adxValues[i] as number).toBeCloseTo(100, 9);
      expect(run.samples[i]?.regime).toBe('strong');
    }
    expect(run.strongCount).toBe(60 - ADX_INIT);
    expect(run.weakCount).toBe(0);
    expect(run.formingCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineAdxTrendCross LINEAR DOWN', () => {
  it('LINEAR DOWN: ADX=100, all strong, 0 triggers', () => {
    const data = buildLinearDown(60);
    const run = runLineAdxTrendCross(data);
    for (let i = ADX_INIT; i < 60; i += 1) {
      expect(run.adxValues[i] as number).toBeCloseTo(100, 9);
      expect(run.samples[i]?.regime).toBe('strong');
    }
    expect(run.strongCount).toBe(60 - ADX_INIT);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineAdxTrendCross misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineAdxTrendCrossPoint[] = [
      { x: 2, high: 1, low: 0, close: 0.5 },
      { x: 0, high: 1, low: 0, close: 0.5 },
      { x: 1, high: 1, low: 0, close: 0.5 },
    ];
    const run = runLineAdxTrendCross(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConstBand(20, 50);
    const run = runLineAdxTrendCross(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineAdxTrendCross([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom tuning', () => {
    const data = buildLinearUp(60);
    const run = runLineAdxTrendCross(data, {
      period: 7,
      lower: 15,
      upper: 30,
    });
    expect(run.period).toBe(7);
    expect(run.lower).toBe(15);
    expect(run.upper).toBe(30);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(60);
    const run = runLineAdxTrendCross(data);
    expect(
      run.weakCount +
        run.formingCount +
        run.strongCount +
        run.noneCount,
    ).toBe(60);
  });

  it('+DM, -DM, TR are valid from i>=1', () => {
    const data = buildConstBand(20, 50);
    const run = runLineAdxTrendCross(data);
    expect(run.vmPlus[0]).toBeNull();
    expect(run.vmMinus[0]).toBeNull();
    expect(run.trueRange[0]).toBeNull();
    expect(run.vmPlus[1] as number).toBeCloseTo(0, 9);
    expect(run.vmMinus[1] as number).toBeCloseTo(0, 9);
    expect(run.trueRange[1] as number).toBeCloseTo(2, 9);
  });

  it('LINEAR UP: +DM=1, -DM=0, TR=2 from i>=1', () => {
    const data = buildLinearUp(20);
    const run = runLineAdxTrendCross(data);
    for (let i = 1; i < 20; i += 1) {
      expect(run.vmPlus[i] as number).toBeCloseTo(1, 9);
      expect(run.vmMinus[i] as number).toBeCloseTo(0, 9);
      expect(run.trueRange[i] as number).toBeCloseTo(2, 9);
    }
  });
});

describe('computeLineAdxTrendCrossLayout', () => {
  it('renders SVG paths for CONST K=50', () => {
    const data = buildConstBand(60, 50);
    const layout = computeLineAdxTrendCrossLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(60);
    expect(layout.adxPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('layout includes lowerY and upperY threshold positions', () => {
    const data = buildLinearUp(60);
    const layout = computeLineAdxTrendCrossLayout({ data });
    expect(Number.isFinite(layout.lowerY)).toBe(true);
    expect(Number.isFinite(layout.upperY)).toBe(true);
    expect(layout.lowerY).toBeGreaterThan(layout.upperY);
  });

  it('falls back when no data', () => {
    const layout = computeLineAdxTrendCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.adxPath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineAdxTrendCrossLayout({
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
    const layout = computeLineAdxTrendCrossLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });
});

describe('describeLineAdxTrendCrossChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineAdxTrendCrossChart([])).toBe('No data');
  });

  it('mentions bar count, period, thresholds', () => {
    const desc = describeLineAdxTrendCrossChart(buildLinearUp(60));
    expect(desc).toContain('60 bars');
    expect(desc).toContain('period 14');
    expect(desc).toContain('lower 20');
    expect(desc).toContain('upper 25');
    expect(desc).toContain('trend emerging');
    expect(desc).toContain('bias coloring');
  });
});

describe('<ChartLineAdxTrendCross /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineAdxTrendCross data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-adx-trend-cross"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-period')).toBe(String(PERIOD));
    expect(root?.getAttribute('data-lower')).toBe(String(LOWER));
    expect(root?.getAttribute('data-upper')).toBe(String(UPPER));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(<ChartLineAdxTrendCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-trend-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders ADX path and threshold lines', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineAdxTrendCross data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-trend-cross-adx-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-trend-cross-threshold-lower"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-trend-cross-threshold-upper"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineAdxTrendCross data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-trend-cross-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineAdxTrendCross data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-adx-trend-cross-badge"]',
    );
    expect(badge?.textContent).toContain('period 14');
    expect(badge?.textContent).toContain('lower 20');
    expect(badge?.textContent).toContain('upper 25');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineAdxTrendCross data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-adx-trend-cross"]',
    );
    expect(root?.getAttribute('aria-label')).toBe(
      'ADX trend-strength chart',
    );
  });

  it('exposes data-*-count counters for LINEAR UP', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineAdxTrendCross data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-adx-trend-cross"]',
    );
    expect(root?.getAttribute('data-strong-count')).toBe(
      String(60 - ADX_INIT),
    );
    expect(root?.getAttribute('data-weak-count')).toBe('0');
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('exposes data-weak-count for CONST band', () => {
    const data = buildConstBand(60, 50);
    const { container } = render(<ChartLineAdxTrendCross data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-adx-trend-cross"]',
    );
    expect(root?.getAttribute('data-weak-count')).toBe(
      String(60 - ADX_INIT),
    );
    expect(root?.getAttribute('data-strong-count')).toBe('0');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineAdxTrendCross data={data} hiddenSeries={['adx']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-trend-cross-adx-path"]',
      ),
    ).toBeNull();
  });
});
