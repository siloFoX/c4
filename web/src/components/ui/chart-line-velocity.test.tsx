import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  ALL_CHART_LINE_VELOCITY_ARROW_MODES,
  ChartLineVelocity,
  DEFAULT_CHART_LINE_VELOCITY_ARROW_MODE,
  DEFAULT_CHART_LINE_VELOCITY_ARROW_SIZE,
  DEFAULT_CHART_LINE_VELOCITY_HEIGHT,
  DEFAULT_CHART_LINE_VELOCITY_NEGATIVE_COLOR,
  DEFAULT_CHART_LINE_VELOCITY_PADDING,
  DEFAULT_CHART_LINE_VELOCITY_PALETTE,
  DEFAULT_CHART_LINE_VELOCITY_POSITIVE_COLOR,
  DEFAULT_CHART_LINE_VELOCITY_TICK_COUNT,
  DEFAULT_CHART_LINE_VELOCITY_WIDTH,
  buildLineVelocityArrowPath,
  computeLineVelocityLayout,
  computeVelocity,
  describeLineVelocityChart,
  getLineVelocityDefaultColor,
  getLineVelocityFinitePoints,
  type ChartLineVelocityPoint,
  type ChartLineVelocitySeries,
} from './chart-line-velocity';

const series: ChartLineVelocitySeries = {
  id: 'a',
  label: 'Velocity',
  data: [
    { x: 0, y: 10 },
    { x: 1, y: 15 }, // up
    { x: 2, y: 20 }, // up
    { x: 3, y: 18 }, // down
    { x: 4, y: 18 }, // flat
    { x: 5, y: 25 }, // up
  ],
};

describe('DEFAULT_CHART_LINE_VELOCITY_* defaults', () => {
  it('has positive width, height, padding, tick count', () => {
    expect(DEFAULT_CHART_LINE_VELOCITY_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_VELOCITY_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_VELOCITY_PADDING).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_CHART_LINE_VELOCITY_TICK_COUNT).toBeGreaterThanOrEqual(2);
  });

  it('default arrow size is positive', () => {
    expect(DEFAULT_CHART_LINE_VELOCITY_ARROW_SIZE).toBeGreaterThan(0);
  });

  it('default arrow mode is "tangent"', () => {
    expect(DEFAULT_CHART_LINE_VELOCITY_ARROW_MODE).toBe('tangent');
  });

  it('exposes two arrow modes', () => {
    expect(ALL_CHART_LINE_VELOCITY_ARROW_MODES).toEqual(['sign', 'tangent']);
  });

  it('has distinct positive / negative direction colors', () => {
    expect(DEFAULT_CHART_LINE_VELOCITY_POSITIVE_COLOR).not.toBe(
      DEFAULT_CHART_LINE_VELOCITY_NEGATIVE_COLOR,
    );
  });

  it('exposes a 10-color palette', () => {
    expect(DEFAULT_CHART_LINE_VELOCITY_PALETTE).toHaveLength(10);
  });
});

describe('getLineVelocityDefaultColor', () => {
  it('cycles through the palette', () => {
    expect(getLineVelocityDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_VELOCITY_PALETTE[0],
    );
    expect(getLineVelocityDefaultColor(11)).toBe(
      DEFAULT_CHART_LINE_VELOCITY_PALETTE[1],
    );
  });

  it('falls back to first color on invalid index', () => {
    expect(getLineVelocityDefaultColor(-1)).toBe(
      DEFAULT_CHART_LINE_VELOCITY_PALETTE[0],
    );
    expect(getLineVelocityDefaultColor(Number.NaN)).toBe(
      DEFAULT_CHART_LINE_VELOCITY_PALETTE[0],
    );
  });
});

describe('getLineVelocityFinitePoints', () => {
  it('drops non-finite samples', () => {
    expect(
      getLineVelocityFinitePoints([
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
      getLineVelocityFinitePoints(
        null as unknown as ReadonlyArray<ChartLineVelocityPoint>,
      ),
    ).toEqual([]);
  });
});

describe('computeVelocity', () => {
  it('returns null on null prev/curr', () => {
    expect(computeVelocity(null, { x: 0, y: 0 })).toBeNull();
    expect(computeVelocity({ x: 0, y: 0 }, null)).toBeNull();
  });

  it('returns null on non-finite points', () => {
    expect(
      computeVelocity(
        { x: Number.NaN, y: 0 },
        { x: 1, y: 1 },
      ),
    ).toBeNull();
    expect(
      computeVelocity(
        { x: 0, y: 0 },
        { x: 1, y: Number.NaN },
      ),
    ).toBeNull();
  });

  it('computes dx + dy + magnitude + direction "up" when dy > 0', () => {
    const v = computeVelocity({ x: 0, y: 0 }, { x: 1, y: 1 });
    expect(v?.dx).toBe(1);
    expect(v?.dy).toBe(1);
    expect(v?.magnitude).toBeCloseTo(Math.sqrt(2), 6);
    expect(v?.direction).toBe('up');
  });

  it('classifies "down" when dy < 0', () => {
    expect(
      computeVelocity({ x: 0, y: 5 }, { x: 1, y: 1 })?.direction,
    ).toBe('down');
  });

  it('classifies "right" when dy === 0', () => {
    expect(
      computeVelocity({ x: 0, y: 5 }, { x: 1, y: 5 })?.direction,
    ).toBe('right');
  });

  it('angle uses math convention (data space)', () => {
    // (0, 0) -> (1, 1): dy positive, angle = atan2(1, 1) = +PI/4.
    const v = computeVelocity({ x: 0, y: 0 }, { x: 1, y: 1 });
    expect(v?.angle).toBeCloseTo(Math.PI / 4, 6);
  });
});

describe('buildLineVelocityArrowPath', () => {
  it('returns empty for non-finite or non-positive size', () => {
    expect(buildLineVelocityArrowPath(Number.NaN, 0, 0, 8)).toBe('');
    expect(buildLineVelocityArrowPath(0, Number.NaN, 0, 8)).toBe('');
    expect(buildLineVelocityArrowPath(0, 0, Number.NaN, 8)).toBe('');
    expect(buildLineVelocityArrowPath(0, 0, 0, Number.NaN)).toBe('');
    expect(buildLineVelocityArrowPath(0, 0, 0, 0)).toBe('');
    expect(buildLineVelocityArrowPath(0, 0, 0, -1)).toBe('');
  });

  it('builds a two-segment chevron with tip at (tipX, tipY)', () => {
    const d = buildLineVelocityArrowPath(100, 50, 0, 8);
    expect(d.split('L').length - 1).toBe(2);
    expect(d).toMatch(/100\.000 50\.000/); // tip
  });

  it('produces different paths for different angles', () => {
    const a = buildLineVelocityArrowPath(0, 0, 0, 8);
    const b = buildLineVelocityArrowPath(0, 0, Math.PI / 2, 8);
    expect(a).not.toBe(b);
  });
});

describe('computeLineVelocityLayout', () => {
  it('returns empty when no series', () => {
    const layout = computeLineVelocityLayout({
      series: [],
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series).toEqual([]);
  });

  it('returns empty when canvas degenerate', () => {
    const layout = computeLineVelocityLayout({
      series: [series],
      width: 20,
      height: 20,
      padding: 30,
    });
    expect(layout.series).toEqual([]);
  });

  it('builds layout series with arrows for all but first point', () => {
    const layout = computeLineVelocityLayout({
      series: [series],
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series).toHaveLength(1);
    const s = layout.series[0]!;
    expect(s.points).toHaveLength(6);
    // First point has no previous -> no velocity / no arrow.
    expect(s.points[0]?.velocity).toBeNull();
    expect(s.points[0]?.arrowPath).toBe('');
    // Subsequent points have arrows.
    for (let i = 1; i < s.points.length; i += 1) {
      expect(s.points[i]?.velocity).not.toBeNull();
      expect(s.points[i]?.arrowPath).not.toBe('');
    }
  });

  it('classifies up/down/flat counts in stats', () => {
    const layout = computeLineVelocityLayout({
      series: [series],
      width: 400,
      height: 300,
      padding: 30,
    });
    const stats = layout.series[0]!.stats;
    // velocities: up, up, down, flat, up -> 3 up, 1 down, 1 flat.
    expect(stats.upCount).toBe(3);
    expect(stats.downCount).toBe(1);
    expect(stats.flatCount).toBe(1);
  });

  it('reports max + mean magnitude > 0', () => {
    const layout = computeLineVelocityLayout({
      series: [series],
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series[0]?.stats.maxMagnitude).toBeGreaterThan(0);
    expect(layout.series[0]?.stats.meanMagnitude).toBeGreaterThan(0);
  });

  it('arrow mode "sign" produces fixed up/down/right angles in pixel space', () => {
    const layout = computeLineVelocityLayout({
      series: [series],
      arrowMode: 'sign',
      width: 400,
      height: 300,
      padding: 30,
    });
    const pts = layout.series[0]!.points;
    // velocities: index1=up, index2=up, index3=down, index4=flat, index5=up
    expect(pts[1]?.arrowAngle).toBeCloseTo(-Math.PI / 2, 6);
    expect(pts[3]?.arrowAngle).toBeCloseTo(Math.PI / 2, 6);
    expect(pts[4]?.arrowAngle).toBe(0);
  });

  it('arrow mode "tangent" uses the pixel-space slope', () => {
    const layout = computeLineVelocityLayout({
      series: [series],
      arrowMode: 'tangent',
      width: 400,
      height: 300,
      padding: 30,
    });
    const pts = layout.series[0]!.points;
    // For y going up, in pixel space py decreases -> dyp < 0 -> angle in upper half (negative).
    expect(pts[1]?.arrowAngle).toBeLessThan(0);
    // For y going down in pixel space py increases -> angle positive.
    expect(pts[3]?.arrowAngle).toBeGreaterThan(0);
  });

  it('honors per-series arrowMode override', () => {
    const layout = computeLineVelocityLayout({
      series: [{ ...series, arrowMode: 'sign' }],
      arrowMode: 'tangent',
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series[0]?.arrowMode).toBe('sign');
  });

  it('honors hidden series filter', () => {
    const layout = computeLineVelocityLayout({
      series: [
        series,
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

  it('honors per-series direction color overrides', () => {
    const layout = computeLineVelocityLayout({
      series: [
        {
          ...series,
          positiveColor: '#abc111',
          negativeColor: '#def222',
          zeroColor: '#aaa333',
        },
      ],
      width: 400,
      height: 300,
      padding: 30,
    });
    const pts = layout.series[0]!.points;
    expect(pts[1]?.arrowColor).toBe('#abc111');
    expect(pts[3]?.arrowColor).toBe('#def222');
    expect(pts[4]?.arrowColor).toBe('#aaa333');
  });

  it('respects user-supplied bounds overrides', () => {
    const layout = computeLineVelocityLayout({
      series: [series],
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
    const layout = computeLineVelocityLayout({
      series: [series],
      tickCount: 6,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.xTicks).toHaveLength(6);
    expect(layout.yTicks).toHaveLength(6);
  });
});

describe('describeLineVelocityChart', () => {
  it('returns "No data" on empty / hidden', () => {
    expect(describeLineVelocityChart(null)).toBe('No data');
    expect(describeLineVelocityChart([])).toBe('No data');
    expect(
      describeLineVelocityChart([series], 'tangent', new Set(['a'])),
    ).toBe('No data');
  });

  it('summarises up / down / flat counts + max + mean magnitude', () => {
    const text = describeLineVelocityChart([series]);
    expect(text).toContain('1 series');
    expect(text).toContain('3 up');
    expect(text).toContain('1 down');
    expect(text).toContain('1 flat');
    expect(text).toContain('max |v|');
    expect(text).toContain('mean |v|');
  });

  it('mentions arrow mode in the summary header', () => {
    expect(describeLineVelocityChart([series], 'sign')).toContain(
      '(sign arrows)',
    );
  });
});

describe('<ChartLineVelocity /> rendering', () => {
  it('renders nothing meaningful when empty series', () => {
    const { container } = render(<ChartLineVelocity series={[]} />);
    const root = container.querySelector(
      '[data-section="chart-line-velocity"]',
    );
    expect(root).not.toBeNull();
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-velocity-arrow"]',
      ),
    ).toHaveLength(0);
  });

  it('renders one line path per series', () => {
    const { container } = render(<ChartLineVelocity series={[series]} />);
    expect(
      container.querySelectorAll('[data-section="chart-line-velocity-path"]'),
    ).toHaveLength(1);
  });

  it('renders one arrow per point after the first', () => {
    const { container } = render(<ChartLineVelocity series={[series]} />);
    const arrows = container.querySelectorAll(
      '[data-section="chart-line-velocity-arrow"]',
    );
    expect(arrows).toHaveLength(series.data.length - 1);
  });

  it('omits arrows when showArrows=false', () => {
    const { container } = render(
      <ChartLineVelocity series={[series]} showArrows={false} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-velocity-arrow"]',
      ),
    ).toHaveLength(0);
  });

  it('omits line when showLine=false', () => {
    const { container } = render(
      <ChartLineVelocity series={[series]} showLine={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-velocity-path"]'),
    ).toBeNull();
  });

  it('exposes per-arrow data-direction and data-magnitude', () => {
    const { container } = render(<ChartLineVelocity series={[series]} />);
    const upArrow = container.querySelector(
      '[data-section="chart-line-velocity-arrow"][data-point-index="1"]',
    );
    expect(upArrow?.getAttribute('data-direction')).toBe('up');
    const downArrow = container.querySelector(
      '[data-section="chart-line-velocity-arrow"][data-point-index="3"]',
    );
    expect(downArrow?.getAttribute('data-direction')).toBe('down');
    const flatArrow = container.querySelector(
      '[data-section="chart-line-velocity-arrow"][data-point-index="4"]',
    );
    expect(flatArrow?.getAttribute('data-direction')).toBe('right');
  });

  it('renders dots per finite point', () => {
    const { container } = render(<ChartLineVelocity series={[series]} />);
    expect(
      container.querySelectorAll('[data-section="chart-line-velocity-dot"]'),
    ).toHaveLength(6);
  });

  it('hides dots when showDots=false', () => {
    const { container } = render(
      <ChartLineVelocity series={[series]} showDots={false} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-velocity-dot"]'),
    ).toHaveLength(0);
  });

  it('renders aria description and labels region', () => {
    render(<ChartLineVelocity series={[series]} />);
    expect(
      screen.getByRole('region', { name: /velocity line chart/i }),
    ).toBeTruthy();
  });

  it('shows tooltip on dot hover with direction + magnitude', () => {
    const { container } = render(<ChartLineVelocity series={[series]} />);
    const dot = container.querySelector(
      '[data-section="chart-line-velocity-dot"][data-point-index="3"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    const tip = container.querySelector(
      '[data-section="chart-line-velocity-tooltip"]',
    );
    expect(tip).not.toBeNull();
    expect(tip?.getAttribute('data-direction')).toBe('down');
    expect(
      tip?.querySelector(
        '[data-section="chart-line-velocity-tooltip-direction"]',
      )?.textContent,
    ).toMatch(/down/);
  });

  it('tooltip shows "start of series" for the first point', () => {
    const { container } = render(<ChartLineVelocity series={[series]} />);
    const dot = container.querySelector(
      '[data-section="chart-line-velocity-dot"][data-point-index="0"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    expect(
      container.querySelector(
        '[data-section="chart-line-velocity-tooltip-direction"]',
      )?.textContent,
    ).toMatch(/start of series/);
  });

  it('hides tooltip on mouseLeave', () => {
    const { container } = render(<ChartLineVelocity series={[series]} />);
    const dot = container.querySelector(
      '[data-section="chart-line-velocity-dot"][data-point-index="0"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    expect(
      container.querySelector('[data-section="chart-line-velocity-tooltip"]'),
    ).not.toBeNull();
    fireEvent.mouseLeave(dot);
    expect(
      container.querySelector('[data-section="chart-line-velocity-tooltip"]'),
    ).toBeNull();
  });

  it('omits tooltip when showTooltip=false', () => {
    const { container } = render(
      <ChartLineVelocity series={[series]} showTooltip={false} />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-velocity-dot"][data-point-index="0"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    expect(
      container.querySelector('[data-section="chart-line-velocity-tooltip"]'),
    ).toBeNull();
  });

  it('invokes onPointClick with series + point', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ChartLineVelocity series={[series]} onPointClick={onClick} />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-velocity-dot"][data-point-index="3"]',
    ) as SVGCircleElement;
    fireEvent.click(dot);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0]?.[0].point.velocity?.direction).toBe('down');
  });

  it('exposes per-series direction counts via data attrs', () => {
    const { container } = render(<ChartLineVelocity series={[series]} />);
    const group = container.querySelector(
      '[data-section="chart-line-velocity-series-group"][data-series-id="a"]',
    );
    expect(group?.getAttribute('data-series-up-count')).toBe('3');
    expect(group?.getAttribute('data-series-down-count')).toBe('1');
    expect(group?.getAttribute('data-series-flat-count')).toBe('1');
    expect(
      Number(group?.getAttribute('data-series-max-magnitude')),
    ).toBeGreaterThan(0);
  });

  it('legend shows +/- counts per series', () => {
    const { container } = render(<ChartLineVelocity series={[series]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-velocity-legend-stats"]',
      )?.textContent,
    ).toMatch(/3\+/);
  });

  it('toggles series via the legend (uncontrolled)', () => {
    const { container } = render(
      <ChartLineVelocity
        series={[
          series,
          { id: 'b', label: 'B', data: [{ x: 0, y: 5 }, { x: 1, y: 10 }] },
        ]}
      />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-velocity-legend-button"][data-series-id="a"]',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(
      container.querySelectorAll('[data-section="chart-line-velocity-path"]'),
    ).toHaveLength(1);
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLineVelocity
        series={[
          series,
          { id: 'b', label: 'B', data: [{ x: 0, y: 5 }, { x: 1, y: 10 }] },
        ]}
        hiddenSeries={new Set(['b'])}
      />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-velocity-path"]'),
    ).toHaveLength(1);
  });

  it('emits onHiddenSeriesChange', () => {
    const onChange = vi.fn();
    const { container } = render(
      <ChartLineVelocity
        series={[series]}
        onHiddenSeriesChange={onChange}
      />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-velocity-legend-button"][data-series-id="a"]',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0].has('a')).toBe(true);
  });

  it('omits legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineVelocity series={[series]} showLegend={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-velocity-legend"]'),
    ).toBeNull();
  });

  it('exposes data-arrow-mode on root', () => {
    const { container } = render(
      <ChartLineVelocity series={[series]} arrowMode="sign" />,
    );
    expect(
      container
        .querySelector('[data-section="chart-line-velocity"]')
        ?.getAttribute('data-arrow-mode'),
    ).toBe('sign');
  });

  it('animate flag toggles data-animate and fade-in class', () => {
    const { container } = render(<ChartLineVelocity series={[series]} />);
    const root = container.querySelector(
      '[data-section="chart-line-velocity"]',
    ) as HTMLDivElement;
    expect(root.getAttribute('data-animate')).toBe('true');
    expect(root.className).toContain('motion-safe:animate-fade-in');
    const { container: c2 } = render(
      <ChartLineVelocity series={[series]} animate={false} />,
    );
    const r2 = c2.querySelector(
      '[data-section="chart-line-velocity"]',
    ) as HTMLDivElement;
    expect(r2.getAttribute('data-animate')).toBe('false');
    expect(r2.className).not.toContain('motion-safe:animate-fade-in');
  });

  it('forwards ref to root div', () => {
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineVelocity ref={ref} series={[series]} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-velocity',
    );
  });

  it('renders a stable displayName for devtools', () => {
    expect(ChartLineVelocity.displayName).toBe('ChartLineVelocity');
  });
});
