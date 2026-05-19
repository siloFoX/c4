import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  ALL_CHART_LINE_ACCELERATION_MODES,
  ChartLineAcceleration,
  DEFAULT_CHART_LINE_ACCELERATION_HEIGHT,
  DEFAULT_CHART_LINE_ACCELERATION_MODE,
  DEFAULT_CHART_LINE_ACCELERATION_NEGATIVE_COLOR,
  DEFAULT_CHART_LINE_ACCELERATION_PADDING,
  DEFAULT_CHART_LINE_ACCELERATION_PALETTE,
  DEFAULT_CHART_LINE_ACCELERATION_POSITIVE_COLOR,
  DEFAULT_CHART_LINE_ACCELERATION_TICK_COUNT,
  DEFAULT_CHART_LINE_ACCELERATION_WIDTH,
  computeAcceleration,
  computeLineAccelerationLayout,
  computeLineAccelerationStats,
  describeLineAccelerationChart,
  findLineAccelerationZeroCrossing,
  getLineAccelerationDefaultColor,
  getLineAccelerationFinitePoints,
  type ChartLineAccelerationPoint,
  type ChartLineAccelerationSeries,
} from './chart-line-acceleration';

// y = x^2 sampled at integer x: y'' = 2 (constant positive acceleration).
const parabola: ChartLineAccelerationSeries = {
  id: 'p',
  label: 'x^2',
  data: [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
    { x: 2, y: 4 },
    { x: 3, y: 9 },
    { x: 4, y: 16 },
  ],
};

// Linear y: y'' = 0 everywhere.
const linear: ChartLineAccelerationSeries = {
  id: 'l',
  label: 'linear',
  data: [
    { x: 0, y: 5 },
    { x: 1, y: 10 },
    { x: 2, y: 15 },
    { x: 3, y: 20 },
  ],
};

// Series that flips concavity (negative then positive acceleration).
const flipping: ChartLineAccelerationSeries = {
  id: 'f',
  label: 'flip',
  data: [
    { x: 0, y: 0 },
    { x: 1, y: 5 }, // slope 5
    { x: 2, y: 8 }, // slope 3 -> decelerating, accel < 0
    { x: 3, y: 10 }, // slope 2 -> decel continues
    { x: 4, y: 14 }, // slope 4 -> accelerating, accel > 0
    { x: 5, y: 20 }, // slope 6
  ],
};

describe('DEFAULT_CHART_LINE_ACCELERATION_* defaults', () => {
  it('has positive width, height, padding, tick count', () => {
    expect(DEFAULT_CHART_LINE_ACCELERATION_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_ACCELERATION_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_ACCELERATION_PADDING).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_CHART_LINE_ACCELERATION_TICK_COUNT).toBeGreaterThanOrEqual(
      2,
    );
  });

  it('default mode is "center"', () => {
    expect(DEFAULT_CHART_LINE_ACCELERATION_MODE).toBe('center');
  });

  it('exposes three mode keys', () => {
    expect(ALL_CHART_LINE_ACCELERATION_MODES).toEqual([
      'center',
      'left',
      'right',
    ]);
  });

  it('has distinct positive (accel) / negative (decel) colors', () => {
    expect(DEFAULT_CHART_LINE_ACCELERATION_POSITIVE_COLOR).not.toBe(
      DEFAULT_CHART_LINE_ACCELERATION_NEGATIVE_COLOR,
    );
  });

  it('exposes a 10-color palette', () => {
    expect(DEFAULT_CHART_LINE_ACCELERATION_PALETTE).toHaveLength(10);
  });
});

describe('getLineAccelerationDefaultColor', () => {
  it('cycles through the palette', () => {
    expect(getLineAccelerationDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_ACCELERATION_PALETTE[0],
    );
    expect(getLineAccelerationDefaultColor(11)).toBe(
      DEFAULT_CHART_LINE_ACCELERATION_PALETTE[1],
    );
  });

  it('falls back to first color on invalid index', () => {
    expect(getLineAccelerationDefaultColor(-1)).toBe(
      DEFAULT_CHART_LINE_ACCELERATION_PALETTE[0],
    );
    expect(getLineAccelerationDefaultColor(Number.NaN)).toBe(
      DEFAULT_CHART_LINE_ACCELERATION_PALETTE[0],
    );
  });
});

describe('getLineAccelerationFinitePoints', () => {
  it('drops non-finite samples', () => {
    expect(
      getLineAccelerationFinitePoints([
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
      getLineAccelerationFinitePoints(
        null as unknown as ReadonlyArray<ChartLineAccelerationPoint>,
      ),
    ).toEqual([]);
  });
});

describe('computeAcceleration', () => {
  it('returns [] for fewer than 3 finite samples', () => {
    expect(computeAcceleration([])).toEqual([]);
    expect(computeAcceleration([{ x: 0, y: 0 }])).toEqual([]);
    expect(
      computeAcceleration([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ]),
    ).toEqual([]);
  });

  it('returns (n-2) samples for n finite inputs', () => {
    const r = computeAcceleration(parabola.data);
    expect(r).toHaveLength(3);
  });

  it('y = x^2 -> constant acceleration 2', () => {
    const r = computeAcceleration(parabola.data);
    for (const s of r) {
      expect(s.acceleration).toBeCloseTo(2, 6);
    }
  });

  it('linear y -> zero acceleration', () => {
    const r = computeAcceleration(linear.data);
    expect(r).toHaveLength(2);
    for (const s of r) {
      expect(s.acceleration).toBeCloseTo(0, 6);
    }
  });

  it('center mode anchors at the middle x', () => {
    const r = computeAcceleration(parabola.data);
    expect(r[0]?.x).toBe(1);
    expect(r[1]?.x).toBe(2);
    expect(r[2]?.x).toBe(3);
  });

  it('left mode anchors at the leftmost x', () => {
    const r = computeAcceleration(parabola.data, 'left');
    expect(r[0]?.x).toBe(0);
    expect(r[1]?.x).toBe(1);
    expect(r[2]?.x).toBe(2);
  });

  it('right mode anchors at the rightmost x', () => {
    const r = computeAcceleration(parabola.data, 'right');
    expect(r[0]?.x).toBe(2);
    expect(r[1]?.x).toBe(3);
    expect(r[2]?.x).toBe(4);
  });

  it('sorts unsorted input by x', () => {
    const r = computeAcceleration([
      { x: 4, y: 16 },
      { x: 0, y: 0 },
      { x: 2, y: 4 },
      { x: 1, y: 1 },
      { x: 3, y: 9 },
    ]);
    expect(r[0]?.midX).toBe(1);
    expect(r[2]?.midX).toBe(3);
  });

  it('preserves original-array leftIndex / midIndex / rightIndex', () => {
    const r = computeAcceleration([
      { x: 4, y: 16 }, // original 0
      { x: 0, y: 0 }, // original 1
      { x: 2, y: 4 }, // original 2
      { x: 1, y: 1 }, // original 3
      { x: 3, y: 9 }, // original 4
    ]);
    // After sort by x: 1, 3, 2, 4, 0. First triple (1, 3, 2).
    expect(r[0]?.leftIndex).toBe(1);
    expect(r[0]?.midIndex).toBe(3);
    expect(r[0]?.rightIndex).toBe(2);
  });

  it('drops triples where any dx is zero', () => {
    const r = computeAcceleration([
      { x: 0, y: 0 },
      { x: 0, y: 5 }, // duplicate x with previous
      { x: 1, y: 7 },
      { x: 2, y: 12 },
    ]);
    // The triple including the duplicate x is dropped.
    expect(r.length).toBeLessThan(2);
  });

  it('finds both positive and negative accelerations in flipping series', () => {
    const r = computeAcceleration(flipping.data);
    const signs = r.map((s) =>
      s.acceleration > 0 ? 'pos' : s.acceleration < 0 ? 'neg' : 'zero',
    );
    expect(signs).toContain('pos');
    expect(signs).toContain('neg');
  });

  it('returns [] for non-array input', () => {
    expect(
      computeAcceleration(
        null as unknown as readonly ChartLineAccelerationPoint[],
      ),
    ).toEqual([]);
  });
});

describe('findLineAccelerationZeroCrossing', () => {
  it('returns crossing when accel flips sign', () => {
    expect(findLineAccelerationZeroCrossing(0, -10, 10, 10)).toBeCloseTo(
      5,
      6,
    );
  });

  it('returns null on same sign', () => {
    expect(findLineAccelerationZeroCrossing(0, 1, 10, 5)).toBeNull();
  });

  it('returns null on endpoint at zero', () => {
    expect(findLineAccelerationZeroCrossing(0, 0, 10, 5)).toBeNull();
  });

  it('returns null on degenerate segment', () => {
    expect(findLineAccelerationZeroCrossing(5, -1, 5, 1)).toBeNull();
  });

  it('returns null on non-finite input', () => {
    expect(findLineAccelerationZeroCrossing(Number.NaN, -1, 1, 1)).toBeNull();
  });
});

describe('computeLineAccelerationStats', () => {
  it('returns zero stats for empty input', () => {
    const s = computeLineAccelerationStats([]);
    expect(s.finiteCount).toBe(0);
    expect(s.maxAcceleration).toBe(0);
    expect(s.minAcceleration).toBe(0);
    expect(s.averageAcceleration).toBe(0);
  });

  it('aggregates max + min + average', () => {
    const r = computeAcceleration(parabola.data);
    const s = computeLineAccelerationStats(r);
    expect(s.finiteCount).toBe(3);
    expect(s.maxAcceleration).toBeCloseTo(2, 6);
    expect(s.minAcceleration).toBeCloseTo(2, 6);
    expect(s.averageAcceleration).toBeCloseTo(2, 6);
    expect(s.positiveCount).toBe(3);
    expect(s.negativeCount).toBe(0);
  });

  it('counts decel samples for flipping series', () => {
    const r = computeAcceleration(flipping.data);
    const s = computeLineAccelerationStats(r);
    expect(s.positiveCount + s.negativeCount + s.zeroCount).toBe(r.length);
    expect(s.negativeCount).toBeGreaterThan(0);
  });

  it('totalAbsoluteArea is non-negative', () => {
    const r = computeAcceleration(parabola.data);
    const s = computeLineAccelerationStats(r);
    expect(s.totalAbsoluteArea).toBeGreaterThanOrEqual(0);
  });
});

describe('computeLineAccelerationLayout', () => {
  it('returns empty when no series', () => {
    const layout = computeLineAccelerationLayout({
      series: [],
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series).toEqual([]);
  });

  it('returns empty when canvas degenerate', () => {
    const layout = computeLineAccelerationLayout({
      series: [parabola],
      width: 20,
      height: 20,
      padding: 30,
    });
    expect(layout.series).toEqual([]);
  });

  it('builds layout with path + samples + regions + stats', () => {
    const layout = computeLineAccelerationLayout({
      series: [parabola],
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series).toHaveLength(1);
    const s = layout.series[0]!;
    expect(s.path).toMatch(/^M /);
    expect(s.samples).toHaveLength(3);
    expect(s.stats.averageAcceleration).toBeCloseTo(2, 6);
  });

  it('expands y bounds to include zero', () => {
    const layout = computeLineAccelerationLayout({
      series: [parabola],
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.yMin).toBeLessThanOrEqual(0);
  });

  it('records zeroY inside the inner plot', () => {
    const layout = computeLineAccelerationLayout({
      series: [parabola],
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(isFinite(layout.zeroY)).toBe(true);
  });

  it('splits a sign-crossing segment into two regions', () => {
    const layout = computeLineAccelerationLayout({
      series: [flipping],
      width: 400,
      height: 300,
      padding: 30,
    });
    const regions = layout.series[0]!.regions;
    const signs = regions.map((r) => (r.isPositive ? 'pos' : 'neg'));
    expect(signs).toContain('pos');
    expect(signs).toContain('neg');
  });

  it('omits sign-fill regions when showSignFill=false', () => {
    const layout = computeLineAccelerationLayout({
      series: [parabola],
      showSignFill: false,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series[0]?.regions).toEqual([]);
  });

  it('honors hidden series filter', () => {
    const layout = computeLineAccelerationLayout({
      series: [parabola, linear],
      hiddenSeries: new Set(['p']),
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series).toHaveLength(1);
    expect(layout.series[0]?.id).toBe('l');
  });

  it('honors per-series mode override', () => {
    const layout = computeLineAccelerationLayout({
      series: [{ ...parabola, mode: 'left' }],
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series[0]?.mode).toBe('left');
  });

  it('respects user-supplied bounds overrides', () => {
    const layout = computeLineAccelerationLayout({
      series: [parabola],
      width: 400,
      height: 300,
      padding: 30,
      xMin: -10,
      xMax: 20,
      yMin: -10,
      yMax: 50,
    });
    expect(layout.xMin).toBe(-10);
    expect(layout.xMax).toBe(20);
    expect(layout.yMin).toBe(-10);
    expect(layout.yMax).toBe(50);
  });

  it('produces axis ticks at the requested step count', () => {
    const layout = computeLineAccelerationLayout({
      series: [parabola],
      tickCount: 6,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.xTicks).toHaveLength(6);
    expect(layout.yTicks).toHaveLength(6);
  });

  it('per-sample isPositive / isNegative reflect sign', () => {
    const layout = computeLineAccelerationLayout({
      series: [parabola],
      width: 400,
      height: 300,
      padding: 30,
    });
    for (const s of layout.series[0]!.samples) {
      expect(s.isPositive).toBe(true);
      expect(s.isNegative).toBe(false);
    }
  });
});

describe('describeLineAccelerationChart', () => {
  it('returns "No data" on empty / hidden / no finite', () => {
    expect(describeLineAccelerationChart(null)).toBe('No data');
    expect(describeLineAccelerationChart([])).toBe('No data');
    expect(
      describeLineAccelerationChart(
        [parabola],
        'center',
        new Set(['p']),
      ),
    ).toBe('No data');
    expect(
      describeLineAccelerationChart([
        { id: 'x', label: 'X', data: [{ x: 0, y: 1 }, { x: 1, y: 2 }] },
      ]),
    ).toBe('No data');
  });

  it('summarises avg / max / min + counts per series', () => {
    const text = describeLineAccelerationChart([parabola]);
    expect(text).toContain('1 series');
    expect(text).toContain('x^2');
    expect(text).toMatch(/3 accel/);
  });
});

describe('<ChartLineAcceleration /> rendering', () => {
  it('renders nothing meaningful when empty series', () => {
    const { container } = render(<ChartLineAcceleration series={[]} />);
    const root = container.querySelector(
      '[data-section="chart-line-acceleration"]',
    );
    expect(root).not.toBeNull();
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-acceleration-dot"]',
      ),
    ).toHaveLength(0);
  });

  it('renders one acceleration line per series', () => {
    const { container } = render(
      <ChartLineAcceleration series={[parabola]} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-acceleration-path"]',
      ),
    ).toHaveLength(1);
  });

  it('renders one dot per acceleration sample (n-2 for n input)', () => {
    const { container } = render(
      <ChartLineAcceleration series={[parabola]} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-acceleration-dot"]',
      ),
    ).toHaveLength(3);
  });

  it('renders sign-fill regions by default', () => {
    const { container } = render(
      <ChartLineAcceleration series={[flipping]} />,
    );
    const regions = container.querySelectorAll(
      '[data-section="chart-line-acceleration-region"]',
    );
    expect(regions.length).toBeGreaterThan(0);
    const signs = Array.from(regions).map((r) =>
      r.getAttribute('data-region-is-positive'),
    );
    expect(signs).toContain('true');
    expect(signs).toContain('false');
  });

  it('omits sign-fill regions when showSignFill=false', () => {
    const { container } = render(
      <ChartLineAcceleration series={[parabola]} showSignFill={false} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-acceleration-region"]',
      ),
    ).toHaveLength(0);
  });

  it('renders the zero baseline by default', () => {
    const { container } = render(
      <ChartLineAcceleration series={[parabola]} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-acceleration-zero-line"]',
      ),
    ).not.toBeNull();
  });

  it('omits zero baseline when showZeroLine=false', () => {
    const { container } = render(
      <ChartLineAcceleration series={[parabola]} showZeroLine={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-acceleration-zero-line"]',
      ),
    ).toBeNull();
  });

  it('exposes per-dot data-acceleration-sign + leftIndex/midIndex/rightIndex', () => {
    const { container } = render(
      <ChartLineAcceleration series={[parabola]} />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-acceleration-dot"][data-sample-index="0"]',
    );
    expect(dot?.getAttribute('data-acceleration-sign')).toBe('positive');
    expect(dot?.getAttribute('data-left-index')).toBeTruthy();
    expect(dot?.getAttribute('data-mid-index')).toBeTruthy();
    expect(dot?.getAttribute('data-right-index')).toBeTruthy();
  });

  it('hides dots when showDots=false', () => {
    const { container } = render(
      <ChartLineAcceleration series={[parabola]} showDots={false} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-acceleration-dot"]',
      ),
    ).toHaveLength(0);
  });

  it('renders aria description and labels region', () => {
    render(<ChartLineAcceleration series={[parabola]} />);
    expect(
      screen.getByRole('region', { name: /acceleration .* line chart/i }),
    ).toBeTruthy();
  });

  it('shows tooltip on dot hover with acceleration + concavity tag', () => {
    const { container } = render(
      <ChartLineAcceleration series={[parabola]} />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-acceleration-dot"][data-sample-index="0"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    const tip = container.querySelector(
      '[data-section="chart-line-acceleration-tooltip"]',
    );
    expect(tip).not.toBeNull();
    expect(tip?.getAttribute('data-acceleration-sign')).toBe('positive');
    expect(
      tip?.querySelector(
        '[data-section="chart-line-acceleration-tooltip-acceleration"]',
      )?.textContent,
    ).toMatch(/concave up/);
  });

  it('hides tooltip on mouseLeave', () => {
    const { container } = render(
      <ChartLineAcceleration series={[parabola]} />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-acceleration-dot"][data-sample-index="0"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    expect(
      container.querySelector(
        '[data-section="chart-line-acceleration-tooltip"]',
      ),
    ).not.toBeNull();
    fireEvent.mouseLeave(dot);
    expect(
      container.querySelector(
        '[data-section="chart-line-acceleration-tooltip"]',
      ),
    ).toBeNull();
  });

  it('omits tooltip when showTooltip=false', () => {
    const { container } = render(
      <ChartLineAcceleration series={[parabola]} showTooltip={false} />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-acceleration-dot"][data-sample-index="0"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    expect(
      container.querySelector(
        '[data-section="chart-line-acceleration-tooltip"]',
      ),
    ).toBeNull();
  });

  it('invokes onSampleClick with series + sample', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ChartLineAcceleration
        series={[parabola]}
        onSampleClick={onClick}
      />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-acceleration-dot"][data-sample-index="1"]',
    ) as SVGCircleElement;
    fireEvent.click(dot);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0]?.[0].sample.acceleration).toBeCloseTo(
      2,
      6,
    );
  });

  it('invokes onRegionClick when a region is clicked', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ChartLineAcceleration
        series={[parabola]}
        onRegionClick={onClick}
      />,
    );
    const region = container.querySelector(
      '[data-section="chart-line-acceleration-region"]',
    ) as SVGPathElement;
    fireEvent.click(region);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0]?.[0].region.index).toBe(0);
  });

  it('legend shows positive / negative counts', () => {
    const { container } = render(
      <ChartLineAcceleration series={[flipping]} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-acceleration-legend-stats"]',
      )?.textContent,
    ).toMatch(/\+/);
    expect(
      container.querySelector(
        '[data-section="chart-line-acceleration-legend-stats"]',
      )?.textContent,
    ).toMatch(/-/);
  });

  it('toggles series via the legend (uncontrolled)', () => {
    const { container } = render(
      <ChartLineAcceleration series={[parabola, linear]} />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-acceleration-legend-button"][data-series-id="p"]',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-acceleration-path"]',
      ),
    ).toHaveLength(1);
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLineAcceleration
        series={[parabola, linear]}
        hiddenSeries={new Set(['l'])}
      />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-acceleration-path"]',
      ),
    ).toHaveLength(1);
  });

  it('emits onHiddenSeriesChange on legend toggle', () => {
    const onChange = vi.fn();
    const { container } = render(
      <ChartLineAcceleration
        series={[parabola]}
        onHiddenSeriesChange={onChange}
      />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-acceleration-legend-button"][data-series-id="p"]',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0].has('p')).toBe(true);
  });

  it('omits legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineAcceleration series={[parabola]} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-acceleration-legend"]',
      ),
    ).toBeNull();
  });

  it('exposes data-mode on root', () => {
    const { container } = render(
      <ChartLineAcceleration series={[parabola]} mode="left" />,
    );
    expect(
      container
        .querySelector('[data-section="chart-line-acceleration"]')
        ?.getAttribute('data-mode'),
    ).toBe('left');
  });

  it('animate flag toggles data-animate and fade-in class', () => {
    const { container } = render(
      <ChartLineAcceleration series={[parabola]} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-acceleration"]',
    ) as HTMLDivElement;
    expect(root.getAttribute('data-animate')).toBe('true');
    expect(root.className).toContain('motion-safe:animate-fade-in');
    const { container: c2 } = render(
      <ChartLineAcceleration series={[parabola]} animate={false} />,
    );
    const r2 = c2.querySelector(
      '[data-section="chart-line-acceleration"]',
    ) as HTMLDivElement;
    expect(r2.getAttribute('data-animate')).toBe('false');
    expect(r2.className).not.toContain('motion-safe:animate-fade-in');
  });

  it('forwards ref to root div', () => {
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineAcceleration ref={ref} series={[parabola]} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-acceleration',
    );
  });

  it('renders a stable displayName for devtools', () => {
    expect(ChartLineAcceleration.displayName).toBe('ChartLineAcceleration');
  });
});
