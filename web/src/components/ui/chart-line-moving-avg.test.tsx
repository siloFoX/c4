import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  ChartLineMovingAvg,
  DEFAULT_CHART_LINE_MOVING_AVG_HEIGHT,
  DEFAULT_CHART_LINE_MOVING_AVG_PADDING,
  DEFAULT_CHART_LINE_MOVING_AVG_PALETTE,
  DEFAULT_CHART_LINE_MOVING_AVG_TICK_COUNT,
  DEFAULT_CHART_LINE_MOVING_AVG_WIDTH,
  DEFAULT_CHART_LINE_MOVING_AVG_WINDOW,
  buildLineMovingAvgPath,
  computeLineMovingAvgLayout,
  computeSimpleMovingAverage,
  describeLineMovingAvgChart,
  getLineMovingAvgDefaultColor,
  getLineMovingAvgFinitePoints,
  normaliseLineMovingAvgWindow,
  type ChartLineMovingAvgSeries,
} from './chart-line-moving-avg';

const linearSeries: ChartLineMovingAvgSeries = {
  id: 'a',
  label: 'A',
  data: [
    { x: 0, y: 1 },
    { x: 1, y: 2 },
    { x: 2, y: 3 },
    { x: 3, y: 4 },
    { x: 4, y: 5 },
  ],
};

const noisySeries: ChartLineMovingAvgSeries = {
  id: 'b',
  label: 'B',
  data: [
    { x: 0, y: 10 },
    { x: 1, y: 12 },
    { x: 2, y: 8 },
    { x: 3, y: 14 },
    { x: 4, y: 10 },
    { x: 5, y: 16 },
    { x: 6, y: 12 },
  ],
};

describe('DEFAULT_CHART_LINE_MOVING_AVG_* defaults', () => {
  it('has positive width, height, padding, tick count, and window', () => {
    expect(DEFAULT_CHART_LINE_MOVING_AVG_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_MOVING_AVG_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_MOVING_AVG_PADDING).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_CHART_LINE_MOVING_AVG_TICK_COUNT).toBeGreaterThanOrEqual(2);
    expect(DEFAULT_CHART_LINE_MOVING_AVG_WINDOW).toBeGreaterThanOrEqual(1);
  });

  it('exposes a 10-color palette', () => {
    expect(DEFAULT_CHART_LINE_MOVING_AVG_PALETTE).toHaveLength(10);
    for (const c of DEFAULT_CHART_LINE_MOVING_AVG_PALETTE) {
      expect(c).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe('getLineMovingAvgDefaultColor', () => {
  it('cycles through the palette by index', () => {
    expect(getLineMovingAvgDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_MOVING_AVG_PALETTE[0],
    );
    expect(getLineMovingAvgDefaultColor(11)).toBe(
      DEFAULT_CHART_LINE_MOVING_AVG_PALETTE[1],
    );
  });

  it('falls back to first color on invalid index', () => {
    expect(getLineMovingAvgDefaultColor(-1)).toBe(
      DEFAULT_CHART_LINE_MOVING_AVG_PALETTE[0],
    );
    expect(getLineMovingAvgDefaultColor(Number.NaN)).toBe(
      DEFAULT_CHART_LINE_MOVING_AVG_PALETTE[0],
    );
  });
});

describe('getLineMovingAvgFinitePoints', () => {
  it('drops non-finite samples', () => {
    expect(
      getLineMovingAvgFinitePoints([
        { x: 0, y: 1 },
        { x: Number.NaN, y: 2 },
        { x: 3, y: Number.POSITIVE_INFINITY },
        { x: 5, y: 8 },
      ]),
    ).toEqual([
      { x: 0, y: 1 },
      { x: 5, y: 8 },
    ]);
  });

  it('returns [] for non-array input', () => {
    expect(
      getLineMovingAvgFinitePoints(
        null as unknown as ReadonlyArray<{ x: number; y: number }>,
      ),
    ).toEqual([]);
  });
});

describe('normaliseLineMovingAvgWindow', () => {
  it('floors fractional input', () => {
    expect(normaliseLineMovingAvgWindow(3.7)).toBe(3);
  });

  it('returns 1 when input is non-finite, non-numeric, or < 1', () => {
    expect(normaliseLineMovingAvgWindow(0)).toBe(1);
    expect(normaliseLineMovingAvgWindow(-3)).toBe(1);
    expect(normaliseLineMovingAvgWindow(Number.NaN)).toBe(1);
    expect(normaliseLineMovingAvgWindow('5' as unknown as number)).toBe(1);
  });

  it('accepts a positive integer as-is', () => {
    expect(normaliseLineMovingAvgWindow(5)).toBe(5);
  });
});

describe('computeSimpleMovingAverage (trailing)', () => {
  it('returns nulls for the leading window-1 entries', () => {
    const r = computeSimpleMovingAverage([1, 2, 3, 4, 5], 3);
    expect(r.length).toBe(5);
    expect(r[0]).toBeNull();
    expect(r[1]).toBeNull();
    expect(r[2]).toBeCloseTo(2, 6);
    expect(r[3]).toBeCloseTo(3, 6);
    expect(r[4]).toBeCloseTo(4, 6);
  });

  it('window=1 is passthrough', () => {
    const r = computeSimpleMovingAverage([10, 20, 30], 1);
    expect(r).toEqual([10, 20, 30]);
  });

  it('window larger than length produces all nulls', () => {
    const r = computeSimpleMovingAverage([1, 2, 3], 10);
    expect(r).toEqual([null, null, null]);
  });

  it('returns [] for non-array input', () => {
    expect(
      computeSimpleMovingAverage(
        null as unknown as readonly number[],
        3,
      ),
    ).toEqual([]);
  });

  it('returns [] for empty array', () => {
    expect(computeSimpleMovingAverage([], 3)).toEqual([]);
  });

  it('drops non-finite entries from the moving sum', () => {
    const r = computeSimpleMovingAverage(
      [10, Number.NaN, 30, 40, 50],
      3,
    );
    // i=0: null (window not filled)
    // i=1: null (window not filled)
    // i=2: avg of [10, NaN, 30] -> avg of [10, 30] = 20
    // i=3: avg of [NaN, 30, 40] -> avg of [30, 40] = 35
    // i=4: avg of [30, 40, 50] = 40
    expect(r[2]).toBe(20);
    expect(r[3]).toBe(35);
    expect(r[4]).toBe(40);
  });

  it('returns null when the entire window is non-finite', () => {
    const r = computeSimpleMovingAverage(
      [Number.NaN, Number.NaN, Number.NaN],
      3,
    );
    expect(r[2]).toBeNull();
  });

  it('normalises invalid window to 1', () => {
    expect(computeSimpleMovingAverage([1, 2, 3], 0)).toEqual([1, 2, 3]);
    expect(computeSimpleMovingAverage([1, 2, 3], -5)).toEqual([1, 2, 3]);
  });
});

describe('computeSimpleMovingAverage (centered)', () => {
  it('centers the window at the index', () => {
    const r = computeSimpleMovingAverage([1, 2, 3, 4, 5], 3, 'centered');
    expect(r[0]).toBeNull();
    expect(r[1]).toBeCloseTo(2, 6); // (1+2+3)/3
    expect(r[2]).toBeCloseTo(3, 6);
    expect(r[3]).toBeCloseTo(4, 6);
    expect(r[4]).toBeNull();
  });

  it('handles odd vs even windows', () => {
    const odd = computeSimpleMovingAverage([10, 20, 30, 40, 50], 5, 'centered');
    expect(odd[0]).toBeNull();
    expect(odd[1]).toBeNull();
    expect(odd[2]).toBeCloseTo(30, 6);
    expect(odd[3]).toBeNull();
    expect(odd[4]).toBeNull();
  });
});

describe('computeSimpleMovingAverage (edge)', () => {
  it('uses partial-window averages at the leading edge', () => {
    const r = computeSimpleMovingAverage([10, 20, 30, 40, 50], 3, 'edge');
    expect(r[0]).toBeCloseTo(10, 6);
    expect(r[1]).toBeCloseTo(15, 6);
    expect(r[2]).toBeCloseTo(20, 6);
    expect(r[3]).toBeCloseTo(30, 6);
    expect(r[4]).toBeCloseTo(40, 6);
  });
});

describe('buildLineMovingAvgPath', () => {
  it('returns empty for empty input', () => {
    expect(buildLineMovingAvgPath([])).toBe('');
  });

  it('builds a single run when no nulls', () => {
    const d = buildLineMovingAvgPath([
      { px: 0, py: 0 },
      { px: 10, py: 5 },
      { px: 20, py: 10 },
    ]);
    expect(d).toMatch(/^M /);
    expect(d.split('M').length - 1).toBe(1);
    expect(d.split('L').length - 1).toBe(2);
  });

  it('breaks into multiple runs at null entries', () => {
    const d = buildLineMovingAvgPath([
      { px: 0, py: 0 },
      { px: 10, py: 5 },
      { px: 20, py: null },
      { px: 30, py: 15 },
      { px: 40, py: 20 },
    ]);
    expect(d.split('M').length - 1).toBe(2);
  });

  it('skips entries with non-finite px or py', () => {
    const d = buildLineMovingAvgPath([
      { px: 0, py: 0 },
      { px: Number.NaN, py: 5 },
      { px: 20, py: 10 },
    ]);
    expect(d.split('M').length - 1).toBe(2);
  });
});

describe('computeLineMovingAvgLayout', () => {
  it('returns empty when no series', () => {
    const layout = computeLineMovingAvgLayout({
      series: [],
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series).toEqual([]);
  });

  it('returns empty when canvas degenerate', () => {
    const layout = computeLineMovingAvgLayout({
      series: [linearSeries],
      width: 20,
      height: 20,
      padding: 30,
    });
    expect(layout.series).toEqual([]);
  });

  it('builds raw path and MA path per series', () => {
    const layout = computeLineMovingAvgLayout({
      series: [linearSeries],
      width: 400,
      height: 300,
      padding: 30,
      defaultWindow: 3,
    });
    expect(layout.series).toHaveLength(1);
    expect(layout.series[0]?.path).toMatch(/^M /);
    expect(layout.series[0]?.maPath).toMatch(/^M /);
    expect(layout.series[0]?.window).toBe(3);
    expect(layout.series[0]?.mode).toBe('trailing');
    expect(layout.series[0]?.maValidCount).toBe(3); // i=2,3,4
  });

  it('expands y bounds to include the MA values', () => {
    const upward: ChartLineMovingAvgSeries = {
      id: 'u',
      label: 'U',
      data: [
        { x: 0, y: 0 },
        { x: 1, y: 100 },
        { x: 2, y: 200 },
      ],
    };
    const layout = computeLineMovingAvgLayout({
      series: [upward],
      width: 400,
      height: 300,
      padding: 30,
      defaultWindow: 2,
    });
    // MA window=2 trailing produces nulls at 0, then 50 at i=1 and 150 at i=2.
    expect(layout.yMin).toBeLessThanOrEqual(0);
    expect(layout.yMax).toBeGreaterThanOrEqual(200);
  });

  it('honours per-series window override', () => {
    const layout = computeLineMovingAvgLayout({
      series: [{ ...noisySeries, window: 4 }],
      width: 400,
      height: 300,
      padding: 30,
      defaultWindow: 3,
    });
    expect(layout.series[0]?.window).toBe(4);
    expect(layout.series[0]?.maValidCount).toBe(4); // i=3,4,5,6
  });

  it('honours per-series mode override', () => {
    const layout = computeLineMovingAvgLayout({
      series: [{ ...linearSeries, mode: 'edge' }],
      width: 400,
      height: 300,
      padding: 30,
      defaultWindow: 3,
    });
    expect(layout.series[0]?.mode).toBe('edge');
    expect(layout.series[0]?.maValidCount).toBe(5); // all valid in edge mode
  });

  it('honours hideMa flag', () => {
    const layout = computeLineMovingAvgLayout({
      series: [{ ...linearSeries, hideMa: true }],
      width: 400,
      height: 300,
      padding: 30,
      defaultWindow: 3,
    });
    expect(layout.series[0]?.hideMa).toBe(true);
  });

  it('honours hidden series filter', () => {
    const layout = computeLineMovingAvgLayout({
      series: [linearSeries, noisySeries],
      hiddenSeries: new Set(['a']),
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series).toHaveLength(1);
    expect(layout.series[0]?.id).toBe('b');
    expect(layout.series[0]?.index).toBe(1);
  });

  it('returns empty when all series hidden', () => {
    const layout = computeLineMovingAvgLayout({
      series: [linearSeries],
      hiddenSeries: new Set(['a']),
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series).toEqual([]);
    expect(layout.visibleSeriesCount).toBe(0);
  });

  it('respects user-supplied bounds overrides', () => {
    const layout = computeLineMovingAvgLayout({
      series: [linearSeries],
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

  it('produces axis ticks at the requested step count', () => {
    const layout = computeLineMovingAvgLayout({
      series: [linearSeries],
      width: 400,
      height: 300,
      padding: 30,
      tickCount: 6,
    });
    expect(layout.xTicks).toHaveLength(6);
    expect(layout.yTicks).toHaveLength(6);
  });

  it('uses per-series color and maColor overrides', () => {
    const layout = computeLineMovingAvgLayout({
      series: [
        {
          ...linearSeries,
          color: '#111111',
          maColor: '#abc123',
        },
      ],
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series[0]?.color).toBe('#111111');
    expect(layout.series[0]?.maColor).toBe('#abc123');
  });

  it('falls back to color for maColor when not provided', () => {
    const layout = computeLineMovingAvgLayout({
      series: [{ ...linearSeries, color: '#222222' }],
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series[0]?.maColor).toBe('#222222');
  });
});

describe('describeLineMovingAvgChart', () => {
  it('returns "No data" when no series', () => {
    expect(describeLineMovingAvgChart(null)).toBe('No data');
    expect(describeLineMovingAvgChart([])).toBe('No data');
  });

  it('returns "No data" when all hidden', () => {
    expect(
      describeLineMovingAvgChart([linearSeries], new Set(['a'])),
    ).toBe('No data');
  });

  it('summarises window per series', () => {
    const text = describeLineMovingAvgChart([linearSeries, noisySeries]);
    expect(text).toContain('2 series');
    expect(text).toContain('A: window');
    expect(text).toContain('B: window');
  });
});

describe('<ChartLineMovingAvg /> rendering', () => {
  it('renders nothing meaningful when empty series', () => {
    const { container } = render(<ChartLineMovingAvg series={[]} />);
    const root = container.querySelector(
      '[data-section="chart-line-moving-avg"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-series-count')).toBe('0');
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-moving-avg-path"]',
      ),
    ).toHaveLength(0);
  });

  it('renders one line path per series', () => {
    const { container } = render(
      <ChartLineMovingAvg series={[linearSeries, noisySeries]} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-moving-avg-path"]',
      ),
    ).toHaveLength(2);
  });

  it('renders one MA path per series', () => {
    const { container } = render(
      <ChartLineMovingAvg series={[linearSeries, noisySeries]} window={3} />,
    );
    const mas = container.querySelectorAll(
      '[data-section="chart-line-moving-avg-ma"]',
    );
    expect(mas).toHaveLength(2);
    expect(mas[0]?.getAttribute('data-series-window')).toBe('3');
  });

  it('omits MA when showMa=false', () => {
    const { container } = render(
      <ChartLineMovingAvg series={[linearSeries]} showMa={false} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-moving-avg-ma"]',
      ),
    ).toHaveLength(0);
  });

  it('omits MA for series with hideMa=true', () => {
    const { container } = render(
      <ChartLineMovingAvg
        series={[
          { ...linearSeries, hideMa: true },
          noisySeries,
        ]}
      />,
    );
    const mas = container.querySelectorAll(
      '[data-section="chart-line-moving-avg-ma"]',
    );
    expect(mas).toHaveLength(1);
    expect(mas[0]?.getAttribute('data-series-id')).toBe('b');
  });

  it('renders dots per finite point', () => {
    const { container } = render(<ChartLineMovingAvg series={[linearSeries]} />);
    expect(
      container.querySelectorAll('[data-section="chart-line-moving-avg-dot"]'),
    ).toHaveLength(5);
  });

  it('hides dots when showDots=false', () => {
    const { container } = render(
      <ChartLineMovingAvg series={[linearSeries]} showDots={false} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-moving-avg-dot"]'),
    ).toHaveLength(0);
  });

  it('renders aria description and labels region', () => {
    render(<ChartLineMovingAvg series={[linearSeries]} />);
    const region = screen.getByRole('region', {
      name: /line chart with simple moving average/i,
    });
    expect(region).toBeTruthy();
    expect(region.getAttribute('aria-describedby')).toBeTruthy();
  });

  it('honours custom ariaLabel and ariaDescription', () => {
    const { container } = render(
      <ChartLineMovingAvg
        series={[linearSeries]}
        ariaLabel="Sales SMA"
        ariaDescription="Custom desc."
      />,
    );
    expect(screen.getByRole('region', { name: /sales sma/i })).toBeTruthy();
    expect(
      container.querySelector(
        '[data-section="chart-line-moving-avg-aria-desc"]',
      )?.textContent,
    ).toBe('Custom desc.');
  });

  it('shows tooltip on dot hover with SMA value', () => {
    const { container } = render(
      <ChartLineMovingAvg series={[noisySeries]} window={3} />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-moving-avg-dot"][data-point-index="3"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    const tooltip = container.querySelector(
      '[data-section="chart-line-moving-avg-tooltip"]',
    );
    expect(tooltip).not.toBeNull();
    expect(
      tooltip?.querySelector(
        '[data-section="chart-line-moving-avg-tooltip-ma"]',
      )?.textContent,
    ).toMatch(/SMA\(3\):/);
  });

  it('tooltip shows n/a when SMA is not available at that index', () => {
    const { container } = render(
      <ChartLineMovingAvg series={[noisySeries]} window={3} />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-moving-avg-dot"][data-point-index="0"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    expect(
      container.querySelector(
        '[data-section="chart-line-moving-avg-tooltip-ma"]',
      )?.textContent,
    ).toMatch(/n\/a/);
  });

  it('omits tooltip MA row when showMaInTooltip=false', () => {
    const { container } = render(
      <ChartLineMovingAvg
        series={[linearSeries]}
        window={3}
        showMaInTooltip={false}
      />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-moving-avg-dot"][data-point-index="3"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    expect(
      container.querySelector(
        '[data-section="chart-line-moving-avg-tooltip-ma"]',
      ),
    ).toBeNull();
  });

  it('hides tooltip on mouse leave', () => {
    const { container } = render(<ChartLineMovingAvg series={[linearSeries]} />);
    const dot = container.querySelector(
      '[data-section="chart-line-moving-avg-dot"][data-point-index="0"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    expect(
      container.querySelector(
        '[data-section="chart-line-moving-avg-tooltip"]',
      ),
    ).not.toBeNull();
    fireEvent.mouseLeave(dot);
    expect(
      container.querySelector(
        '[data-section="chart-line-moving-avg-tooltip"]',
      ),
    ).toBeNull();
  });

  it('does not show tooltip when showTooltip=false', () => {
    const { container } = render(
      <ChartLineMovingAvg series={[linearSeries]} showTooltip={false} />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-moving-avg-dot"][data-point-index="0"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    expect(
      container.querySelector(
        '[data-section="chart-line-moving-avg-tooltip"]',
      ),
    ).toBeNull();
  });

  it('invokes onPointClick with series + point', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ChartLineMovingAvg series={[linearSeries]} onPointClick={onClick} />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-moving-avg-dot"][data-point-index="2"]',
    ) as SVGCircleElement;
    fireEvent.click(dot);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0]?.[0].series.id).toBe('a');
    expect(onClick.mock.calls[0]?.[0].point.index).toBe(2);
  });

  it('renders legend with SMA window per series', () => {
    const { container } = render(
      <ChartLineMovingAvg series={[linearSeries]} window={4} />,
    );
    const stats = container.querySelector(
      '[data-section="chart-line-moving-avg-legend-stats"]',
    );
    expect(stats?.textContent).toContain('SMA 4');
  });

  it('toggles series via legend button (uncontrolled)', () => {
    const { container } = render(
      <ChartLineMovingAvg series={[linearSeries, noisySeries]} />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-moving-avg-legend-button"][data-series-id="a"]',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    const item = container.querySelector(
      '[data-section="chart-line-moving-avg-legend-item"][data-series-id="a"]',
    );
    expect(item?.getAttribute('data-series-hidden')).toBe('true');
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-moving-avg-path"]',
      ),
    ).toHaveLength(1);
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLineMovingAvg
        series={[linearSeries, noisySeries]}
        hiddenSeries={new Set(['b'])}
      />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-moving-avg-path"]',
      ),
    ).toHaveLength(1);
  });

  it('emits onSeriesToggle and onHiddenSeriesChange', () => {
    const onToggle = vi.fn();
    const onHidden = vi.fn();
    const { container } = render(
      <ChartLineMovingAvg
        series={[linearSeries]}
        onSeriesToggle={onToggle}
        onHiddenSeriesChange={onHidden}
      />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-moving-avg-legend-button"][data-series-id="a"]',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onHidden).toHaveBeenCalledTimes(1);
    expect(onHidden.mock.calls[0]?.[0].has('a')).toBe(true);
  });

  it('renders gridlines and axes (and hides when toggled off)', () => {
    const { container } = render(<ChartLineMovingAvg series={[linearSeries]} />);
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-moving-avg-grid-line"]',
      ).length,
    ).toBeGreaterThan(0);
    const { container: c2 } = render(
      <ChartLineMovingAvg
        series={[linearSeries]}
        showGrid={false}
        showAxis={false}
      />,
    );
    expect(
      c2.querySelector('[data-section="chart-line-moving-avg-grid"]'),
    ).toBeNull();
    expect(
      c2.querySelector('[data-section="chart-line-moving-avg-axes"]'),
    ).toBeNull();
  });

  it('renders axis labels when provided', () => {
    const { container } = render(
      <ChartLineMovingAvg
        series={[linearSeries]}
        xLabel="Day"
        yLabel="Sales"
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-moving-avg-x-label"]',
      )?.textContent,
    ).toBe('Day');
    expect(
      container.querySelector(
        '[data-section="chart-line-moving-avg-y-label"]',
      )?.textContent,
    ).toBe('Sales');
  });

  it('uses formatValue / formatX for tick labels', () => {
    const { container } = render(
      <ChartLineMovingAvg
        series={[linearSeries]}
        formatValue={(n) => `${n.toFixed(0)}u`}
        formatX={(n) => `D${n}`}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-moving-avg-tick-label"][data-axis="y"]',
      )?.textContent,
    ).toMatch(/u$/);
    expect(
      container.querySelector(
        '[data-section="chart-line-moving-avg-tick-label"][data-axis="x"]',
      )?.textContent,
    ).toMatch(/^D/);
  });

  it('animate flag toggles data-animate and fade-in class', () => {
    const { container } = render(<ChartLineMovingAvg series={[linearSeries]} />);
    const root = container.querySelector(
      '[data-section="chart-line-moving-avg"]',
    ) as HTMLDivElement;
    expect(root.getAttribute('data-animate')).toBe('true');
    expect(root.className).toContain('motion-safe:animate-fade-in');
    const { container: c2 } = render(
      <ChartLineMovingAvg series={[linearSeries]} animate={false} />,
    );
    const r2 = c2.querySelector(
      '[data-section="chart-line-moving-avg"]',
    ) as HTMLDivElement;
    expect(r2.getAttribute('data-animate')).toBe('false');
    expect(r2.className).not.toContain('motion-safe:animate-fade-in');
  });

  it('exposes data-window and data-mode on root', () => {
    const { container } = render(
      <ChartLineMovingAvg
        series={[linearSeries]}
        window={7}
        mode="centered"
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-moving-avg"]',
    ) as HTMLDivElement;
    expect(root.getAttribute('data-window')).toBe('7');
    expect(root.getAttribute('data-mode')).toBe('centered');
  });

  it('forwards ref to the root div', () => {
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineMovingAvg ref={ref} series={[linearSeries]} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-moving-avg',
    );
  });

  it('renders a stable displayName for devtools', () => {
    expect(ChartLineMovingAvg.displayName).toBe('ChartLineMovingAvg');
  });
});
