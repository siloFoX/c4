import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  ALL_CHART_LINE_RATE_MODES,
  ChartLineRate,
  DEFAULT_CHART_LINE_RATE_HEIGHT,
  DEFAULT_CHART_LINE_RATE_MODE,
  DEFAULT_CHART_LINE_RATE_NEGATIVE_COLOR,
  DEFAULT_CHART_LINE_RATE_PADDING,
  DEFAULT_CHART_LINE_RATE_PALETTE,
  DEFAULT_CHART_LINE_RATE_POSITIVE_COLOR,
  DEFAULT_CHART_LINE_RATE_TICK_COUNT,
  DEFAULT_CHART_LINE_RATE_WIDTH,
  computeLineRateLayout,
  computeLineRateStats,
  computeRateOfChange,
  describeLineRateChart,
  findLineRateZeroCrossing,
  getLineRateDefaultColor,
  getLineRateFinitePoints,
  type ChartLineRatePoint,
  type ChartLineRateSeries,
} from './chart-line-rate';

const accel: ChartLineRateSeries = {
  id: 'a',
  label: 'Velocity',
  data: [
    { x: 0, y: 0 },
    { x: 1, y: 10 },
    { x: 2, y: 25 },
    { x: 3, y: 35 },
    { x: 4, y: 30 },
    { x: 5, y: 40 },
  ],
};

describe('DEFAULT_CHART_LINE_RATE_* defaults', () => {
  it('has positive width, height, padding, tick count', () => {
    expect(DEFAULT_CHART_LINE_RATE_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_RATE_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_RATE_PADDING).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_CHART_LINE_RATE_TICK_COUNT).toBeGreaterThanOrEqual(2);
  });

  it('has distinct positive and negative colors', () => {
    expect(DEFAULT_CHART_LINE_RATE_POSITIVE_COLOR).not.toBe(
      DEFAULT_CHART_LINE_RATE_NEGATIVE_COLOR,
    );
  });

  it('default mode is "right"', () => {
    expect(DEFAULT_CHART_LINE_RATE_MODE).toBe('right');
  });

  it('exposes three mode keys', () => {
    expect(ALL_CHART_LINE_RATE_MODES).toEqual([
      'midpoint',
      'left',
      'right',
    ]);
  });

  it('exposes a 10-color palette', () => {
    expect(DEFAULT_CHART_LINE_RATE_PALETTE).toHaveLength(10);
  });
});

describe('getLineRateDefaultColor', () => {
  it('cycles through the palette by index', () => {
    expect(getLineRateDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_RATE_PALETTE[0],
    );
    expect(getLineRateDefaultColor(11)).toBe(
      DEFAULT_CHART_LINE_RATE_PALETTE[1],
    );
  });

  it('falls back to first color on invalid index', () => {
    expect(getLineRateDefaultColor(-1)).toBe(
      DEFAULT_CHART_LINE_RATE_PALETTE[0],
    );
    expect(getLineRateDefaultColor(Number.NaN)).toBe(
      DEFAULT_CHART_LINE_RATE_PALETTE[0],
    );
  });
});

describe('getLineRateFinitePoints', () => {
  it('drops non-finite samples', () => {
    expect(
      getLineRateFinitePoints([
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

  it('returns [] for non-array', () => {
    expect(
      getLineRateFinitePoints(
        null as unknown as ReadonlyArray<ChartLineRatePoint>,
      ),
    ).toEqual([]);
  });
});

describe('computeRateOfChange', () => {
  it('returns [] for <2 finite samples', () => {
    expect(computeRateOfChange([])).toEqual([]);
    expect(computeRateOfChange([{ x: 0, y: 1 }])).toEqual([]);
  });

  it('computes (n-1) rates from n samples', () => {
    const r = computeRateOfChange(accel.data);
    expect(r).toHaveLength(5);
  });

  it('rate equals dy/dx between consecutive samples', () => {
    const r = computeRateOfChange(accel.data);
    expect(r[0]?.rate).toBe(10); // (10-0)/(1-0)
    expect(r[1]?.rate).toBe(15); // (25-10)/(2-1)
    expect(r[3]?.rate).toBe(-5); // (30-35)/(4-3)
    expect(r[4]?.rate).toBe(10); // (40-30)/(5-4)
  });

  it('anchors x at the right endpoint in default mode', () => {
    const r = computeRateOfChange(accel.data);
    expect(r[0]?.x).toBe(1);
    expect(r[1]?.x).toBe(2);
  });

  it('anchors x at the left endpoint in "left" mode', () => {
    const r = computeRateOfChange(accel.data, 'left');
    expect(r[0]?.x).toBe(0);
    expect(r[1]?.x).toBe(1);
  });

  it('anchors x at the midpoint in "midpoint" mode', () => {
    const r = computeRateOfChange(accel.data, 'midpoint');
    expect(r[0]?.x).toBeCloseTo(0.5, 6);
    expect(r[1]?.x).toBeCloseTo(1.5, 6);
  });

  it('drops non-finite samples before segment walk', () => {
    const r = computeRateOfChange([
      { x: 0, y: 0 },
      { x: 1, y: Number.NaN },
      { x: 2, y: 20 },
    ]);
    // After dropping NaN: (0,0) -> (2,20) -> rate 10 at x=2 (right).
    expect(r).toHaveLength(1);
    expect(r[0]?.rate).toBe(10);
    expect(r[0]?.x).toBe(2);
  });

  it('drops dx=0 segments (duplicate x)', () => {
    const r = computeRateOfChange([
      { x: 0, y: 0 },
      { x: 0, y: 10 },
      { x: 1, y: 20 },
    ]);
    // Sort keeps the duplicate-x pair; only the non-zero-dx segment
    // survives: (0, 10) -> (1, 20) -> rate 10.
    expect(r).toHaveLength(1);
    expect(r[0]?.rate).toBe(10);
  });

  it('sorts unsorted input by x before computing', () => {
    const r = computeRateOfChange([
      { x: 5, y: 50 },
      { x: 0, y: 0 },
      { x: 2, y: 20 },
    ]);
    expect(r[0]?.fromX).toBe(0);
    expect(r[0]?.toX).toBe(2);
  });

  it('preserves original-array indices in fromIndex / toIndex', () => {
    const r = computeRateOfChange([
      { x: 5, y: 50 }, // original index 0
      { x: 0, y: 0 }, // original index 1
      { x: 2, y: 20 }, // original index 2
    ]);
    expect(r[0]?.fromIndex).toBe(1);
    expect(r[0]?.toIndex).toBe(2);
    expect(r[1]?.fromIndex).toBe(2);
    expect(r[1]?.toIndex).toBe(0);
  });

  it('returns [] for non-array input', () => {
    expect(
      computeRateOfChange(
        null as unknown as readonly ChartLineRatePoint[],
      ),
    ).toEqual([]);
  });
});

describe('findLineRateZeroCrossing', () => {
  it('returns the crossing x when sign flips', () => {
    expect(findLineRateZeroCrossing(0, -10, 10, 10)).toBeCloseTo(5, 6);
  });

  it('returns null on same sign', () => {
    expect(findLineRateZeroCrossing(0, 1, 10, 5)).toBeNull();
  });

  it('returns null when an endpoint sits on zero', () => {
    expect(findLineRateZeroCrossing(0, 0, 10, 5)).toBeNull();
    expect(findLineRateZeroCrossing(0, 5, 10, 0)).toBeNull();
  });

  it('returns null on degenerate segment (x1 == x2)', () => {
    expect(findLineRateZeroCrossing(5, -1, 5, 1)).toBeNull();
  });

  it('returns null on non-finite inputs', () => {
    expect(findLineRateZeroCrossing(Number.NaN, -1, 1, 1)).toBeNull();
  });

  it('biases the crossing toward the smaller-magnitude endpoint', () => {
    // x=[0,10], rates=[-1, +9]. Expected x* = 0 + 10 * 1/10 = 1.
    expect(findLineRateZeroCrossing(0, -1, 10, 9)).toBeCloseTo(1, 6);
  });
});

describe('computeLineRateStats', () => {
  it('returns zero stats for empty input', () => {
    const s = computeLineRateStats([]);
    expect(s.finiteCount).toBe(0);
    expect(s.maxRate).toBe(0);
    expect(s.minRate).toBe(0);
    expect(s.averageRate).toBe(0);
  });

  it('aggregates rate counts, max/min, average', () => {
    const r = computeRateOfChange(accel.data);
    const s = computeLineRateStats(r);
    expect(s.finiteCount).toBe(5);
    expect(s.maxRate).toBe(15);
    expect(s.minRate).toBe(-5);
    expect(s.positiveCount).toBe(4);
    expect(s.negativeCount).toBe(1);
    expect(s.averageRate).toBeCloseTo((10 + 15 + 10 - 5 + 10) / 5, 6);
  });

  it('counts zero-rate samples', () => {
    const r = computeRateOfChange([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 10 },
    ]);
    const s = computeLineRateStats(r);
    expect(s.zeroCount).toBe(1);
    expect(s.positiveCount).toBe(1);
  });

  it('totalAbsoluteArea is non-negative', () => {
    const r = computeRateOfChange(accel.data);
    const s = computeLineRateStats(r);
    expect(s.totalAbsoluteArea).toBeGreaterThanOrEqual(0);
  });
});

describe('computeLineRateLayout', () => {
  it('returns empty when no series', () => {
    const layout = computeLineRateLayout({
      series: [],
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series).toEqual([]);
  });

  it('returns empty when canvas degenerate', () => {
    const layout = computeLineRateLayout({
      series: [accel],
      width: 20,
      height: 20,
      padding: 30,
    });
    expect(layout.series).toEqual([]);
  });

  it('builds layout series with path + samples + regions + stats', () => {
    const layout = computeLineRateLayout({
      series: [accel],
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series).toHaveLength(1);
    const s = layout.series[0]!;
    expect(s.path).toMatch(/^M /);
    expect(s.samples).toHaveLength(5);
    expect(s.regions.length).toBeGreaterThan(0);
    expect(s.stats.maxRate).toBe(15);
  });

  it('expands y bounds to include zero', () => {
    const layout = computeLineRateLayout({
      series: [
        {
          id: 'pos',
          label: 'pos',
          data: [
            { x: 0, y: 100 },
            { x: 1, y: 200 },
          ],
        },
      ],
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.yMin).toBeLessThanOrEqual(0);
  });

  it('records zeroY where rate=0 lands', () => {
    const layout = computeLineRateLayout({
      series: [accel],
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(isFinite(layout.zeroY)).toBe(true);
  });

  it('splits a sign-crossing segment into two regions', () => {
    const seriesPlusMinus: ChartLineRateSeries = {
      id: 'x',
      label: 'X',
      data: [
        { x: 0, y: 0 },
        { x: 1, y: 10 }, // rate +10 at x=1
        { x: 2, y: 0 }, // rate -10 at x=2 (zero crossing between)
      ],
    };
    const layout = computeLineRateLayout({
      series: [seriesPlusMinus],
      width: 400,
      height: 300,
      padding: 30,
    });
    const regions = layout.series[0]!.regions;
    expect(regions).toHaveLength(2);
    expect(regions[0]?.isPositive).toBe(true);
    expect(regions[1]?.isPositive).toBe(false);
  });

  it('omits sign-fill regions when showSignFill=false', () => {
    const layout = computeLineRateLayout({
      series: [accel],
      showSignFill: false,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series[0]?.regions).toEqual([]);
  });

  it('honors hidden series filter', () => {
    const layout = computeLineRateLayout({
      series: [
        accel,
        { id: 'b', label: 'B', data: [{ x: 0, y: 5 }, { x: 1, y: 10 }] },
      ],
      hiddenSeries: new Set(['a']),
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series).toHaveLength(1);
    expect(layout.series[0]?.id).toBe('b');
  });

  it('honors per-series mode override', () => {
    const layout = computeLineRateLayout({
      series: [{ ...accel, mode: 'midpoint' }],
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series[0]?.mode).toBe('midpoint');
  });

  it('respects user-supplied bounds overrides', () => {
    const layout = computeLineRateLayout({
      series: [accel],
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
    const layout = computeLineRateLayout({
      series: [accel],
      tickCount: 6,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.xTicks).toHaveLength(6);
    expect(layout.yTicks).toHaveLength(6);
  });

  it('flags per-sample isPositive / isNegative', () => {
    const layout = computeLineRateLayout({
      series: [accel],
      width: 400,
      height: 300,
      padding: 30,
    });
    const samples = layout.series[0]!.samples;
    expect(samples[0]?.isPositive).toBe(true);
    const negSample = samples.find((s) => s.rate < 0);
    expect(negSample?.isNegative).toBe(true);
  });
});

describe('describeLineRateChart', () => {
  it('returns "No data" for empty / hidden / no-finite', () => {
    expect(describeLineRateChart(null)).toBe('No data');
    expect(describeLineRateChart([])).toBe('No data');
    expect(
      describeLineRateChart([accel], undefined, new Set(['a'])),
    ).toBe('No data');
    expect(
      describeLineRateChart([
        { id: 'x', label: 'X', data: [{ x: 0, y: 1 }] },
      ]),
    ).toBe('No data');
  });

  it('summarises avg / max / min rates per series', () => {
    const text = describeLineRateChart([accel]);
    expect(text).toContain('1 series');
    expect(text).toContain('5 segments');
    expect(text).toContain('Velocity');
    expect(text).toContain('max 15');
    expect(text).toContain('min -5');
  });
});

describe('<ChartLineRate /> rendering', () => {
  it('renders nothing meaningful when empty series', () => {
    const { container } = render(<ChartLineRate series={[]} />);
    const root = container.querySelector(
      '[data-section="chart-line-rate"]',
    );
    expect(root).not.toBeNull();
    expect(
      container.querySelectorAll('[data-section="chart-line-rate-path"]'),
    ).toHaveLength(0);
  });

  it('renders one rate line per series', () => {
    const { container } = render(<ChartLineRate series={[accel]} />);
    expect(
      container.querySelectorAll('[data-section="chart-line-rate-path"]'),
    ).toHaveLength(1);
  });

  it('renders one dot per rate sample (n-1 for n input points)', () => {
    const { container } = render(<ChartLineRate series={[accel]} />);
    expect(
      container.querySelectorAll('[data-section="chart-line-rate-dot"]'),
    ).toHaveLength(5);
  });

  it('renders sign-filled regions by default', () => {
    const { container } = render(<ChartLineRate series={[accel]} />);
    const regions = container.querySelectorAll(
      '[data-section="chart-line-rate-region"]',
    );
    expect(regions.length).toBeGreaterThan(0);
    const isPositiveVals = Array.from(regions).map((r) =>
      r.getAttribute('data-region-is-positive'),
    );
    expect(isPositiveVals).toContain('true');
    expect(isPositiveVals).toContain('false');
  });

  it('omits sign-fill regions when showSignFill=false', () => {
    const { container } = render(
      <ChartLineRate series={[accel]} showSignFill={false} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-rate-region"]',
      ),
    ).toHaveLength(0);
  });

  it('renders the zero baseline by default', () => {
    const { container } = render(<ChartLineRate series={[accel]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-rate-zero-line"]',
      ),
    ).not.toBeNull();
  });

  it('omits zero baseline when showZeroLine=false', () => {
    const { container } = render(
      <ChartLineRate series={[accel]} showZeroLine={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-rate-zero-line"]',
      ),
    ).toBeNull();
  });

  it('per-dot data attrs carry rate sign + indices', () => {
    const { container } = render(<ChartLineRate series={[accel]} />);
    const negDot = container.querySelector(
      '[data-section="chart-line-rate-dot"][data-sample-index="3"]',
    );
    expect(negDot?.getAttribute('data-rate-sign')).toBe('negative');
    expect(negDot?.getAttribute('data-from-index')).toBeTruthy();
    expect(negDot?.getAttribute('data-to-index')).toBeTruthy();
  });

  it('hides dots when showDots=false', () => {
    const { container } = render(
      <ChartLineRate series={[accel]} showDots={false} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-rate-dot"]'),
    ).toHaveLength(0);
  });

  it('renders aria description and labels region', () => {
    render(<ChartLineRate series={[accel]} />);
    expect(
      screen.getByRole('region', {
        name: /rate-of-change line chart/i,
      }),
    ).toBeTruthy();
  });

  it('shows tooltip on dot hover with rate + sign + mode', () => {
    const { container } = render(<ChartLineRate series={[accel]} />);
    const dot = container.querySelector(
      '[data-section="chart-line-rate-dot"][data-sample-index="3"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    const tip = container.querySelector(
      '[data-section="chart-line-rate-tooltip"]',
    );
    expect(tip).not.toBeNull();
    expect(tip?.getAttribute('data-rate-sign')).toBe('negative');
    expect(
      tip?.querySelector(
        '[data-section="chart-line-rate-tooltip-rate"]',
      )?.textContent,
    ).toMatch(/-5/);
    expect(
      tip?.querySelector(
        '[data-section="chart-line-rate-tooltip-mode"]',
      )?.textContent,
    ).toMatch(/right/);
  });

  it('hides tooltip on mouseLeave', () => {
    const { container } = render(<ChartLineRate series={[accel]} />);
    const dot = container.querySelector(
      '[data-section="chart-line-rate-dot"][data-sample-index="0"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    expect(
      container.querySelector('[data-section="chart-line-rate-tooltip"]'),
    ).not.toBeNull();
    fireEvent.mouseLeave(dot);
    expect(
      container.querySelector('[data-section="chart-line-rate-tooltip"]'),
    ).toBeNull();
  });

  it('omits tooltip when showTooltip=false', () => {
    const { container } = render(
      <ChartLineRate series={[accel]} showTooltip={false} />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-rate-dot"][data-sample-index="0"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    expect(
      container.querySelector('[data-section="chart-line-rate-tooltip"]'),
    ).toBeNull();
  });

  it('invokes onSampleClick with series + sample', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ChartLineRate series={[accel]} onSampleClick={onClick} />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-rate-dot"][data-sample-index="2"]',
    ) as SVGCircleElement;
    fireEvent.click(dot);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0]?.[0].sample.rate).toBe(10);
  });

  it('invokes onRegionClick when a sign-fill region is clicked', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ChartLineRate series={[accel]} onRegionClick={onClick} />,
    );
    const region = container.querySelector(
      '[data-section="chart-line-rate-region"]',
    ) as SVGPathElement;
    fireEvent.click(region);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0]?.[0].region.index).toBe(0);
  });

  it('legend shows avg rate + positive/negative counts', () => {
    const { container } = render(<ChartLineRate series={[accel]} />);
    const stats = container.querySelector(
      '[data-section="chart-line-rate-legend-stats"]',
    );
    expect(stats?.textContent).toMatch(/avg/);
    expect(stats?.textContent).toMatch(/4\+/);
    expect(stats?.textContent).toMatch(/1-/);
  });

  it('toggles series via the legend (uncontrolled)', () => {
    const { container } = render(
      <ChartLineRate
        series={[
          accel,
          {
            id: 'b',
            label: 'B',
            data: [{ x: 0, y: 0 }, { x: 1, y: 5 }],
          },
        ]}
      />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-rate-legend-button"][data-series-id="a"]',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(
      container.querySelectorAll('[data-section="chart-line-rate-path"]'),
    ).toHaveLength(1);
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLineRate
        series={[
          accel,
          {
            id: 'b',
            label: 'B',
            data: [{ x: 0, y: 0 }, { x: 1, y: 5 }],
          },
        ]}
        hiddenSeries={new Set(['b'])}
      />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-rate-path"]'),
    ).toHaveLength(1);
  });

  it('exposes per-series stats via data attrs', () => {
    const { container } = render(<ChartLineRate series={[accel]} />);
    const group = container.querySelector(
      '[data-section="chart-line-rate-series-group"][data-series-id="a"]',
    );
    expect(group?.getAttribute('data-series-max-rate')).toBe('15');
    expect(group?.getAttribute('data-series-min-rate')).toBe('-5');
    expect(group?.getAttribute('data-series-positive-count')).toBe('4');
    expect(group?.getAttribute('data-series-negative-count')).toBe('1');
  });

  it('emits onHiddenSeriesChange on legend toggle', () => {
    const onChange = vi.fn();
    const { container } = render(
      <ChartLineRate
        series={[accel]}
        onHiddenSeriesChange={onChange}
      />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-rate-legend-button"][data-series-id="a"]',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0].has('a')).toBe(true);
  });

  it('omits legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineRate series={[accel]} showLegend={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-rate-legend"]'),
    ).toBeNull();
  });

  it('animate flag toggles data-animate and fade-in class', () => {
    const { container } = render(<ChartLineRate series={[accel]} />);
    const root = container.querySelector(
      '[data-section="chart-line-rate"]',
    ) as HTMLDivElement;
    expect(root.getAttribute('data-animate')).toBe('true');
    expect(root.className).toContain('motion-safe:animate-fade-in');
    const { container: c2 } = render(
      <ChartLineRate series={[accel]} animate={false} />,
    );
    const r2 = c2.querySelector(
      '[data-section="chart-line-rate"]',
    ) as HTMLDivElement;
    expect(r2.getAttribute('data-animate')).toBe('false');
    expect(r2.className).not.toContain('motion-safe:animate-fade-in');
  });

  it('exposes data-mode on root', () => {
    const { container } = render(
      <ChartLineRate series={[accel]} mode="midpoint" />,
    );
    expect(
      container
        .querySelector('[data-section="chart-line-rate"]')
        ?.getAttribute('data-mode'),
    ).toBe('midpoint');
  });

  it('forwards ref to root div', () => {
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineRate ref={ref} series={[accel]} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-rate',
    );
  });

  it('renders a stable displayName for devtools', () => {
    expect(ChartLineRate.displayName).toBe('ChartLineRate');
  });
});
