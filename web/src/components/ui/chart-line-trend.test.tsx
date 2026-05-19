import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  ChartLineTrend,
  DEFAULT_CHART_LINE_TREND_HEIGHT,
  DEFAULT_CHART_LINE_TREND_PADDING,
  DEFAULT_CHART_LINE_TREND_PALETTE,
  DEFAULT_CHART_LINE_TREND_TICK_COUNT,
  DEFAULT_CHART_LINE_TREND_TREND_DASH,
  DEFAULT_CHART_LINE_TREND_WIDTH,
  computeLineTrendLayout,
  computeLineTrendRegression,
  describeLineTrendChart,
  getLineTrendDefaultColor,
  getLineTrendFinitePoints,
  getLineTrendXRange,
  predictLineTrendY,
  type ChartLineTrendSeries,
} from './chart-line-trend';

const linearUp: ChartLineTrendSeries = {
  id: 'a',
  label: 'Linear up',
  data: [
    { x: 0, y: 0 },
    { x: 1, y: 2 },
    { x: 2, y: 4 },
    { x: 3, y: 6 },
    { x: 4, y: 8 },
  ],
};

const noisyUp: ChartLineTrendSeries = {
  id: 'b',
  label: 'Noisy up',
  data: [
    { x: 0, y: 1 },
    { x: 1, y: 1.5 },
    { x: 2, y: 3 },
    { x: 3, y: 5 },
    { x: 4, y: 7 },
  ],
};

const flat: ChartLineTrendSeries = {
  id: 'c',
  label: 'Flat',
  data: [
    { x: 0, y: 5 },
    { x: 1, y: 5 },
    { x: 2, y: 5 },
    { x: 3, y: 5 },
  ],
};

describe('DEFAULT_CHART_LINE_TREND_* defaults', () => {
  it('has positive width, height, padding, and tick count', () => {
    expect(DEFAULT_CHART_LINE_TREND_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_TREND_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_TREND_PADDING).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_CHART_LINE_TREND_TICK_COUNT).toBeGreaterThanOrEqual(2);
  });

  it('exposes a 10-color palette', () => {
    expect(DEFAULT_CHART_LINE_TREND_PALETTE).toHaveLength(10);
    for (const c of DEFAULT_CHART_LINE_TREND_PALETTE) {
      expect(c).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('has a non-empty dash pattern for trend lines', () => {
    expect(DEFAULT_CHART_LINE_TREND_TREND_DASH).toMatch(/\d/);
  });
});

describe('getLineTrendDefaultColor', () => {
  it('cycles through the palette by index', () => {
    expect(getLineTrendDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_TREND_PALETTE[0],
    );
    expect(getLineTrendDefaultColor(11)).toBe(
      DEFAULT_CHART_LINE_TREND_PALETTE[1],
    );
  });

  it('falls back to first color on invalid index', () => {
    expect(getLineTrendDefaultColor(-1)).toBe(
      DEFAULT_CHART_LINE_TREND_PALETTE[0],
    );
    expect(getLineTrendDefaultColor(Number.NaN)).toBe(
      DEFAULT_CHART_LINE_TREND_PALETTE[0],
    );
  });
});

describe('getLineTrendFinitePoints', () => {
  it('keeps fully finite samples', () => {
    expect(
      getLineTrendFinitePoints([
        { x: 0, y: 1 },
        { x: 2, y: 3 },
      ]),
    ).toEqual([
      { x: 0, y: 1 },
      { x: 2, y: 3 },
    ]);
  });

  it('drops samples with non-finite x or y', () => {
    const filtered = getLineTrendFinitePoints([
      { x: 0, y: 1 },
      { x: Number.NaN, y: 2 },
      { x: 3, y: Number.POSITIVE_INFINITY },
      { x: 5, y: 8 },
    ]);
    expect(filtered).toEqual([
      { x: 0, y: 1 },
      { x: 5, y: 8 },
    ]);
  });

  it('returns [] for a non-array input', () => {
    expect(
      getLineTrendFinitePoints(
        null as unknown as ReadonlyArray<{ x: number; y: number }>,
      ),
    ).toEqual([]);
  });
});

describe('getLineTrendXRange', () => {
  it('returns min and max x of finite points', () => {
    expect(
      getLineTrendXRange([
        { x: 5, y: 1 },
        { x: 1, y: 2 },
        { x: 3, y: 3 },
      ]),
    ).toEqual({ min: 1, max: 5 });
  });

  it('returns null when empty', () => {
    expect(getLineTrendXRange([])).toBeNull();
  });

  it('returns null when all samples are non-finite', () => {
    expect(getLineTrendXRange([{ x: Number.NaN, y: 1 }])).toBeNull();
  });
});

describe('computeLineTrendRegression', () => {
  it('returns slope 2, intercept 0, r2 1 for a perfectly linear series', () => {
    const reg = computeLineTrendRegression(linearUp.data);
    expect(reg.slope).toBeCloseTo(2, 6);
    expect(reg.intercept).toBeCloseTo(0, 6);
    expect(reg.r2).toBeCloseTo(1, 6);
    expect(reg.ok).toBe(true);
    expect(reg.sampleCount).toBe(5);
  });

  it('handles a positive but noisy series with 0 < r2 <= 1', () => {
    const reg = computeLineTrendRegression(noisyUp.data);
    expect(reg.slope).toBeGreaterThan(0);
    expect(reg.r2).toBeGreaterThan(0);
    expect(reg.r2).toBeLessThanOrEqual(1);
    expect(reg.ok).toBe(true);
  });

  it('returns slope 0 and r2 1 for a perfectly flat series', () => {
    const reg = computeLineTrendRegression(flat.data);
    expect(reg.slope).toBeCloseTo(0, 6);
    expect(reg.intercept).toBeCloseTo(5, 6);
    expect(reg.r2).toBeCloseTo(1, 6);
    expect(reg.ok).toBe(true);
  });

  it('returns ok=false when fewer than 2 finite samples', () => {
    expect(computeLineTrendRegression([]).ok).toBe(false);
    expect(computeLineTrendRegression([{ x: 1, y: 2 }]).ok).toBe(false);
  });

  it('returns ok=false when all x values are equal (vertical)', () => {
    const reg = computeLineTrendRegression([
      { x: 3, y: 1 },
      { x: 3, y: 2 },
      { x: 3, y: 3 },
    ]);
    expect(reg.ok).toBe(false);
    expect(reg.slope).toBe(0);
    expect(reg.intercept).toBeCloseTo(2, 6);
  });

  it('drops non-finite samples from regression', () => {
    const reg = computeLineTrendRegression([
      { x: 0, y: 0 },
      { x: Number.NaN, y: 999 },
      { x: 1, y: 2 },
      { x: 2, y: 4 },
    ]);
    expect(reg.slope).toBeCloseTo(2, 6);
    expect(reg.sampleCount).toBe(3);
  });

  it('clamps r2 to [0,1]', () => {
    // Manufacture a case where ssTot > 0 but the regression equals zero by
    // making y go up then down such that slope is exactly zero with non-flat
    // data; we expect r2 close to 0.
    const reg = computeLineTrendRegression([
      { x: 0, y: 5 },
      { x: 1, y: -5 },
      { x: 2, y: 5 },
      { x: 3, y: -5 },
    ]);
    expect(reg.r2).toBeGreaterThanOrEqual(0);
    expect(reg.r2).toBeLessThanOrEqual(1);
  });

  it('reports meanX and meanY', () => {
    const reg = computeLineTrendRegression(linearUp.data);
    expect(reg.meanX).toBeCloseTo(2, 6);
    expect(reg.meanY).toBeCloseTo(4, 6);
  });
});

describe('predictLineTrendY', () => {
  it('evaluates slope*x + intercept', () => {
    const reg = computeLineTrendRegression(linearUp.data);
    expect(predictLineTrendY(0, reg)).toBeCloseTo(0, 6);
    expect(predictLineTrendY(5, reg)).toBeCloseTo(10, 6);
  });

  it('returns intercept on non-finite x', () => {
    const reg = computeLineTrendRegression(linearUp.data);
    expect(predictLineTrendY(Number.NaN, reg)).toBe(reg.intercept);
  });
});

describe('computeLineTrendLayout', () => {
  it('returns empty when no series', () => {
    const layout = computeLineTrendLayout({
      series: [],
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series).toEqual([]);
    expect(layout.totalPoints).toBe(0);
  });

  it('returns empty when canvas degenerate', () => {
    const layout = computeLineTrendLayout({
      series: [linearUp],
      width: 20,
      height: 20,
      padding: 30,
    });
    expect(layout.series).toEqual([]);
  });

  it('returns empty when all series hidden', () => {
    const layout = computeLineTrendLayout({
      series: [linearUp, noisyUp],
      hiddenSeries: new Set(['a', 'b']),
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series).toEqual([]);
    expect(layout.visibleSeriesCount).toBe(0);
  });

  it('builds layout series with finite count, path, and regression', () => {
    const layout = computeLineTrendLayout({
      series: [linearUp, noisyUp],
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series).toHaveLength(2);
    expect(layout.series[0]?.id).toBe('a');
    expect(layout.series[0]?.path).toMatch(/^M /);
    expect(layout.series[0]?.regression.ok).toBe(true);
    expect(layout.series[0]?.regression.slope).toBeCloseTo(2, 6);
    expect(layout.series[0]?.regression.r2).toBeCloseTo(1, 6);
  });

  it('emits a trend path spanning the x range of the series', () => {
    const layout = computeLineTrendLayout({
      series: [linearUp],
      width: 400,
      height: 300,
      padding: 30,
    });
    const s = layout.series[0]!;
    expect(s.trendPath).toMatch(/^M .* L .*$/);
    expect(s.trendStartX).toBe(0);
    expect(s.trendEndX).toBe(4);
    expect(s.trendStartY).toBeCloseTo(0, 6);
    expect(s.trendEndY).toBeCloseTo(8, 6);
  });

  it('omits the trend path when regression is not ok', () => {
    const single: ChartLineTrendSeries = {
      id: 'x',
      label: 'X',
      data: [{ x: 1, y: 1 }],
    };
    const layout = computeLineTrendLayout({
      series: [single],
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series[0]?.regression.ok).toBe(false);
    expect(layout.series[0]?.trendPath).toBe('');
  });

  it('respects user-supplied bounds overrides', () => {
    const layout = computeLineTrendLayout({
      series: [linearUp],
      width: 400,
      height: 300,
      padding: 30,
      xMin: -10,
      xMax: 20,
      yMin: -50,
      yMax: 100,
    });
    expect(layout.xMin).toBe(-10);
    expect(layout.xMax).toBe(20);
    expect(layout.yMin).toBe(-50);
    expect(layout.yMax).toBe(100);
  });

  it('expands zero-range bounds by 0.5', () => {
    const single: ChartLineTrendSeries = {
      id: 'x',
      label: 'X',
      data: [{ x: 3, y: 5 }],
    };
    const layout = computeLineTrendLayout({
      series: [single],
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.xMin).toBe(2.5);
    expect(layout.xMax).toBe(3.5);
    expect(layout.yMin).toBe(4.5);
    expect(layout.yMax).toBe(5.5);
  });

  it('swaps inverted bounds', () => {
    const layout = computeLineTrendLayout({
      series: [linearUp],
      width: 400,
      height: 300,
      padding: 30,
      xMin: 50,
      xMax: 10,
      yMin: 100,
      yMax: 0,
    });
    expect(layout.xMin).toBe(10);
    expect(layout.xMax).toBe(50);
    expect(layout.yMin).toBe(0);
    expect(layout.yMax).toBe(100);
  });

  it('honors hidden series filter', () => {
    const layout = computeLineTrendLayout({
      series: [linearUp, noisyUp],
      hiddenSeries: new Set(['a']),
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series).toHaveLength(1);
    expect(layout.series[0]?.id).toBe('b');
    expect(layout.series[0]?.index).toBe(1);
  });

  it('uses per-series trendColor and trendDashArray overrides', () => {
    const customised: ChartLineTrendSeries = {
      ...linearUp,
      color: '#111111',
      trendColor: '#abc123',
      trendDashArray: '2 2',
    };
    const layout = computeLineTrendLayout({
      series: [customised],
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series[0]?.color).toBe('#111111');
    expect(layout.series[0]?.trendColor).toBe('#abc123');
    expect(layout.series[0]?.trendDashArray).toBe('2 2');
  });

  it('falls back to color for trendColor when only color provided', () => {
    const customised: ChartLineTrendSeries = {
      ...linearUp,
      color: '#222222',
    };
    const layout = computeLineTrendLayout({
      series: [customised],
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series[0]?.trendColor).toBe('#222222');
  });

  it('honors hideTrend flag on the series', () => {
    const customised: ChartLineTrendSeries = {
      ...linearUp,
      hideTrend: true,
    };
    const layout = computeLineTrendLayout({
      series: [customised],
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series[0]?.hideTrend).toBe(true);
  });

  it('produces axis ticks at the requested step count', () => {
    const layout = computeLineTrendLayout({
      series: [linearUp],
      width: 400,
      height: 300,
      padding: 30,
      tickCount: 6,
    });
    expect(layout.xTicks).toHaveLength(6);
    expect(layout.yTicks).toHaveLength(6);
  });
});

describe('describeLineTrendChart', () => {
  it('returns "No data" when no series', () => {
    expect(describeLineTrendChart(null)).toBe('No data');
    expect(describeLineTrendChart([])).toBe('No data');
  });

  it('returns "No data" when all series hidden', () => {
    expect(
      describeLineTrendChart([linearUp], new Set(['a'])),
    ).toBe('No data');
  });

  it('returns "No data" when no regression is computable', () => {
    expect(
      describeLineTrendChart([
        { id: 'x', label: 'X', data: [{ x: 1, y: 1 }] },
      ]),
    ).toBe('No data');
  });

  it('summarises slope and R-squared per series', () => {
    const text = describeLineTrendChart([linearUp, noisyUp]);
    expect(text).toContain('2 series');
    expect(text).toContain('Linear up: slope');
    expect(text).toContain('Noisy up: slope');
    expect(text).toContain('R2');
  });
});

describe('<ChartLineTrend /> rendering', () => {
  it('renders nothing meaningful when empty series', () => {
    const { container } = render(<ChartLineTrend series={[]} />);
    const root = container.querySelector('[data-section="chart-line-trend"]');
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-series-count')).toBe('0');
    expect(root?.getAttribute('data-visible-series-count')).toBe('0');
    expect(
      container.querySelectorAll('[data-section="chart-line-trend-path"]'),
    ).toHaveLength(0);
  });

  it('renders one line path per series', () => {
    const { container } = render(
      <ChartLineTrend series={[linearUp, noisyUp]} />,
    );
    const paths = container.querySelectorAll(
      '[data-section="chart-line-trend-path"]',
    );
    expect(paths).toHaveLength(2);
  });

  it('renders one trend line per series with regression data attrs', () => {
    const { container } = render(
      <ChartLineTrend series={[linearUp, noisyUp]} />,
    );
    const trends = container.querySelectorAll(
      '[data-section="chart-line-trend-trend"]',
    );
    expect(trends).toHaveLength(2);
    const first = trends[0] as SVGPathElement;
    expect(first.getAttribute('data-series-slope')).toBeTruthy();
    expect(first.getAttribute('data-series-r2')).toBeTruthy();
  });

  it('omits trend when showTrend=false', () => {
    const { container } = render(
      <ChartLineTrend series={[linearUp]} showTrend={false} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-trend-trend"]'),
    ).toHaveLength(0);
  });

  it('omits trend for series with hideTrend=true even when showTrend=true', () => {
    const { container } = render(
      <ChartLineTrend
        series={[{ ...linearUp, hideTrend: true }, noisyUp]}
      />,
    );
    const trends = container.querySelectorAll(
      '[data-section="chart-line-trend-trend"]',
    );
    expect(trends).toHaveLength(1);
    expect(trends[0]?.getAttribute('data-series-id')).toBe('b');
  });

  it('renders dots per finite point', () => {
    const { container } = render(<ChartLineTrend series={[linearUp]} />);
    expect(
      container.querySelectorAll('[data-section="chart-line-trend-dot"]'),
    ).toHaveLength(5);
  });

  it('hides dots when showDots=false', () => {
    const { container } = render(
      <ChartLineTrend series={[linearUp]} showDots={false} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-trend-dot"]'),
    ).toHaveLength(0);
  });

  it('renders aria description and labels region', () => {
    render(<ChartLineTrend series={[linearUp]} />);
    const region = screen.getByRole('region', {
      name: /line chart with linear trend/i,
    });
    expect(region).toBeTruthy();
    expect(region.getAttribute('aria-describedby')).toBeTruthy();
  });

  it('honours custom ariaLabel and ariaDescription', () => {
    const { container } = render(
      <ChartLineTrend
        series={[linearUp]}
        ariaLabel="Quarterly trend"
        ariaDescription="Custom description."
      />,
    );
    expect(screen.getByRole('region', { name: /quarterly trend/i })).toBeTruthy();
    const desc = container.querySelector(
      '[data-section="chart-line-trend-aria-desc"]',
    );
    expect(desc?.textContent).toBe('Custom description.');
  });

  it('shows tooltip on dot hover with trend + residual', () => {
    const { container } = render(<ChartLineTrend series={[noisyUp]} />);
    const dot = container.querySelector(
      '[data-section="chart-line-trend-dot"][data-point-index="0"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    const tooltip = container.querySelector(
      '[data-section="chart-line-trend-tooltip"]',
    );
    expect(tooltip).not.toBeNull();
    const trendLine = tooltip?.querySelector(
      '[data-section="chart-line-trend-tooltip-trend"]',
    );
    expect(trendLine).not.toBeNull();
    expect(trendLine?.textContent).toMatch(/resid/);
  });

  it('hides tooltip on mouse leave', () => {
    const { container } = render(<ChartLineTrend series={[noisyUp]} />);
    const dot = container.querySelector(
      '[data-section="chart-line-trend-dot"][data-point-index="0"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    expect(
      container.querySelector('[data-section="chart-line-trend-tooltip"]'),
    ).not.toBeNull();
    fireEvent.mouseLeave(dot);
    expect(
      container.querySelector('[data-section="chart-line-trend-tooltip"]'),
    ).toBeNull();
  });

  it('does not show tooltip at all when showTooltip=false', () => {
    const { container } = render(
      <ChartLineTrend series={[linearUp]} showTooltip={false} />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-trend-dot"][data-point-index="0"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    expect(
      container.querySelector('[data-section="chart-line-trend-tooltip"]'),
    ).toBeNull();
  });

  it('invokes onPointClick with series + point', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ChartLineTrend series={[linearUp]} onPointClick={onClick} />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-trend-dot"][data-point-index="2"]',
    ) as SVGCircleElement;
    fireEvent.click(dot);
    expect(onClick).toHaveBeenCalledTimes(1);
    const arg = onClick.mock.calls[0]?.[0];
    expect(arg.series.id).toBe('a');
    expect(arg.point.index).toBe(2);
  });

  it('renders legend with trend stats per series', () => {
    const { container } = render(
      <ChartLineTrend series={[linearUp, noisyUp]} />,
    );
    const legend = container.querySelector(
      '[data-section="chart-line-trend-legend"]',
    );
    expect(legend).not.toBeNull();
    const items = legend?.querySelectorAll(
      '[data-section="chart-line-trend-legend-item"]',
    );
    expect(items).toHaveLength(2);
    const stats = legend?.querySelectorAll(
      '[data-section="chart-line-trend-legend-stats"]',
    );
    expect(stats?.length).toBe(2);
    expect(stats?.[0]?.textContent).toMatch(/R2/);
  });

  it('omits legend stats when showTrendStats=false', () => {
    const { container } = render(
      <ChartLineTrend series={[linearUp]} showTrendStats={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-trend-legend-stats"]'),
    ).toBeNull();
  });

  it('toggles series via legend button (uncontrolled)', () => {
    const { container } = render(
      <ChartLineTrend series={[linearUp, noisyUp]} />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-trend-legend-button"][data-series-id="a"]',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    const item = container.querySelector(
      '[data-section="chart-line-trend-legend-item"][data-series-id="a"]',
    );
    expect(item?.getAttribute('data-series-hidden')).toBe('true');
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-trend-path"]',
      ),
    ).toHaveLength(1);
  });

  it('respects controlled hiddenSeries prop', () => {
    const { container } = render(
      <ChartLineTrend
        series={[linearUp, noisyUp]}
        hiddenSeries={new Set(['b'])}
      />,
    );
    const item = container.querySelector(
      '[data-section="chart-line-trend-legend-item"][data-series-id="b"]',
    );
    expect(item?.getAttribute('data-series-hidden')).toBe('true');
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-trend-path"]',
      ),
    ).toHaveLength(1);
  });

  it('calls onSeriesToggle and onHiddenSeriesChange when legend clicked', () => {
    const onToggle = vi.fn();
    const onHidden = vi.fn();
    const { container } = render(
      <ChartLineTrend
        series={[linearUp]}
        onSeriesToggle={onToggle}
        onHiddenSeriesChange={onHidden}
      />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-trend-legend-button"][data-series-id="a"]',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle.mock.calls[0]?.[0].hidden).toBe(true);
    expect(onHidden).toHaveBeenCalledTimes(1);
    expect(onHidden.mock.calls[0]?.[0].has('a')).toBe(true);
  });

  it('omits legend entirely when showLegend=false', () => {
    const { container } = render(
      <ChartLineTrend series={[linearUp]} showLegend={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-trend-legend"]'),
    ).toBeNull();
  });

  it('renders gridlines for both axes', () => {
    const { container } = render(<ChartLineTrend series={[linearUp]} />);
    const xGrid = container.querySelectorAll(
      '[data-section="chart-line-trend-grid-line"][data-axis="x"]',
    );
    const yGrid = container.querySelectorAll(
      '[data-section="chart-line-trend-grid-line"][data-axis="y"]',
    );
    expect(xGrid.length).toBeGreaterThan(0);
    expect(yGrid.length).toBeGreaterThan(0);
  });

  it('omits grid when showGrid=false', () => {
    const { container } = render(
      <ChartLineTrend series={[linearUp]} showGrid={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-trend-grid"]'),
    ).toBeNull();
  });

  it('omits axes when showAxis=false', () => {
    const { container } = render(
      <ChartLineTrend series={[linearUp]} showAxis={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-trend-axes"]'),
    ).toBeNull();
  });

  it('renders axis labels when provided', () => {
    const { container } = render(
      <ChartLineTrend
        series={[linearUp]}
        xLabel="Quarter"
        yLabel="Revenue"
      />,
    );
    const xLabel = container.querySelector(
      '[data-section="chart-line-trend-x-label"]',
    );
    const yLabel = container.querySelector(
      '[data-section="chart-line-trend-y-label"]',
    );
    expect(xLabel?.textContent).toBe('Quarter');
    expect(yLabel?.textContent).toBe('Revenue');
  });

  it('uses formatValue / formatX for tick labels', () => {
    const { container } = render(
      <ChartLineTrend
        series={[linearUp]}
        formatValue={(n) => `${n.toFixed(0)}u`}
        formatX={(n) => `Q${n}`}
      />,
    );
    const yTicks = container.querySelectorAll(
      '[data-section="chart-line-trend-tick-label"][data-axis="y"]',
    );
    expect(yTicks[0]?.textContent).toMatch(/u$/);
    const xTicks = container.querySelectorAll(
      '[data-section="chart-line-trend-tick-label"][data-axis="x"]',
    );
    expect(xTicks[0]?.textContent).toMatch(/^Q/);
  });

  it('uses formatSlope / formatR2 in legend stats', () => {
    const { container } = render(
      <ChartLineTrend
        series={[linearUp]}
        formatSlope={(n) => `slope=${n.toFixed(1)}`}
        formatR2={(n) => `r=${n.toFixed(1)}`}
      />,
    );
    const stats = container.querySelector(
      '[data-section="chart-line-trend-legend-stats"]',
    );
    expect(stats?.textContent).toContain('slope=2.0');
    expect(stats?.textContent).toContain('r=1.0');
  });

  it('animate=true sets data-animate true and adds fade-in class', () => {
    const { container } = render(<ChartLineTrend series={[linearUp]} />);
    const root = container.querySelector(
      '[data-section="chart-line-trend"]',
    ) as HTMLDivElement;
    expect(root.getAttribute('data-animate')).toBe('true');
    expect(root.className).toContain('motion-safe:animate-fade-in');
  });

  it('animate=false drops the fade-in class', () => {
    const { container } = render(
      <ChartLineTrend series={[linearUp]} animate={false} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-trend"]',
    ) as HTMLDivElement;
    expect(root.getAttribute('data-animate')).toBe('false');
    expect(root.className).not.toContain('motion-safe:animate-fade-in');
  });

  it('forwards ref to the root div', () => {
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineTrend ref={ref} series={[linearUp]} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-trend',
    );
  });

  it('renders a stable displayName for devtools', () => {
    expect(ChartLineTrend.displayName).toBe('ChartLineTrend');
  });

  it('drops non-finite samples but preserves totalCount on the series', () => {
    const tricky: ChartLineTrendSeries = {
      id: 't',
      label: 'T',
      data: [
        { x: 0, y: 1 },
        { x: Number.NaN, y: 2 },
        { x: 2, y: 3 },
      ],
    };
    const { container } = render(<ChartLineTrend series={[tricky]} />);
    const group = container.querySelector(
      '[data-section="chart-line-trend-series-group"]',
    );
    expect(group?.getAttribute('data-series-finite-count')).toBe('2');
    expect(group?.getAttribute('data-series-point-count')).toBe('2');
  });
});
