import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  ChartLineTarget,
  DEFAULT_CHART_LINE_TARGET_HEIGHT,
  DEFAULT_CHART_LINE_TARGET_OVER_COLOR,
  DEFAULT_CHART_LINE_TARGET_PADDING,
  DEFAULT_CHART_LINE_TARGET_PALETTE,
  DEFAULT_CHART_LINE_TARGET_TICK_COUNT,
  DEFAULT_CHART_LINE_TARGET_UNDER_COLOR,
  DEFAULT_CHART_LINE_TARGET_WIDTH,
  classifyLineTargetPoint,
  computeLineTargetLayout,
  computeLineTargetStats,
  describeLineTargetChart,
  findLineTargetCrossing,
  getLineTargetDefaultColor,
  getLineTargetFinitePoints,
  type ChartLineTargetSeries,
} from './chart-line-target';

const goalSeries: ChartLineTargetSeries = {
  id: 'a',
  label: 'Sales',
  data: [
    { x: 0, y: 80 },
    { x: 1, y: 110 },
    { x: 2, y: 90 },
    { x: 3, y: 130 },
    { x: 4, y: 70 },
    { x: 5, y: 120 },
  ],
};

const crossingSeries: ChartLineTargetSeries = {
  id: 'c',
  label: 'Cross',
  data: [
    { x: 0, y: 0 },
    { x: 10, y: 10 },
  ],
};

describe('DEFAULT_CHART_LINE_TARGET_* defaults', () => {
  it('has positive width, height, padding, tick count', () => {
    expect(DEFAULT_CHART_LINE_TARGET_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_TARGET_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_TARGET_PADDING).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_CHART_LINE_TARGET_TICK_COUNT).toBeGreaterThanOrEqual(2);
  });

  it('has distinct over and under colours', () => {
    expect(DEFAULT_CHART_LINE_TARGET_OVER_COLOR).not.toBe(
      DEFAULT_CHART_LINE_TARGET_UNDER_COLOR,
    );
    expect(DEFAULT_CHART_LINE_TARGET_OVER_COLOR).toMatch(/^#[0-9a-f]{6}$/i);
    expect(DEFAULT_CHART_LINE_TARGET_UNDER_COLOR).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('exposes a 10-color palette', () => {
    expect(DEFAULT_CHART_LINE_TARGET_PALETTE).toHaveLength(10);
  });
});

describe('getLineTargetDefaultColor', () => {
  it('cycles through the palette by index', () => {
    expect(getLineTargetDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_TARGET_PALETTE[0],
    );
    expect(getLineTargetDefaultColor(11)).toBe(
      DEFAULT_CHART_LINE_TARGET_PALETTE[1],
    );
  });

  it('falls back to first color on invalid index', () => {
    expect(getLineTargetDefaultColor(-1)).toBe(
      DEFAULT_CHART_LINE_TARGET_PALETTE[0],
    );
    expect(getLineTargetDefaultColor(Number.NaN)).toBe(
      DEFAULT_CHART_LINE_TARGET_PALETTE[0],
    );
  });
});

describe('getLineTargetFinitePoints', () => {
  it('drops non-finite samples', () => {
    expect(
      getLineTargetFinitePoints([
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
      getLineTargetFinitePoints(
        null as unknown as ReadonlyArray<{ x: number; y: number }>,
      ),
    ).toEqual([]);
  });
});

describe('classifyLineTargetPoint', () => {
  it('returns over when y > target', () => {
    expect(classifyLineTargetPoint(10, 5).direction).toBe('over');
    expect(classifyLineTargetPoint(10, 5).delta).toBe(5);
  });

  it('returns under when y < target', () => {
    expect(classifyLineTargetPoint(2, 5).direction).toBe('under');
    expect(classifyLineTargetPoint(2, 5).delta).toBe(-3);
  });

  it('returns at when y == target', () => {
    expect(classifyLineTargetPoint(5, 5).direction).toBe('at');
    expect(classifyLineTargetPoint(5, 5).delta).toBe(0);
  });

  it('honours epsilon equality band', () => {
    expect(classifyLineTargetPoint(5.5, 5, 1).direction).toBe('at');
    expect(classifyLineTargetPoint(5.5, 5, 0.1).direction).toBe('over');
  });

  it('returns at + delta 0 for non-finite y', () => {
    const c = classifyLineTargetPoint(Number.NaN, 5);
    expect(c.direction).toBe('at');
    expect(c.delta).toBe(0);
  });

  it('falls back to target 0 when target is non-finite', () => {
    expect(classifyLineTargetPoint(3, Number.NaN).direction).toBe('over');
  });
});

describe('findLineTargetCrossing', () => {
  it('returns the crossing x when curve crosses target', () => {
    // (0, 0) -> (10, 10) crosses target=5 at x=5.
    expect(findLineTargetCrossing(0, 0, 10, 10, 5)).toBeCloseTo(5, 6);
  });

  it('returns null when both endpoints on same side', () => {
    expect(findLineTargetCrossing(0, 1, 1, 2, 5)).toBeNull();
  });

  it('returns null when one endpoint sits exactly on target', () => {
    expect(findLineTargetCrossing(0, 5, 1, 10, 5)).toBeNull();
  });

  it('returns null on degenerate segment (x1 == x2)', () => {
    expect(findLineTargetCrossing(5, 0, 5, 10, 5)).toBeNull();
  });

  it('returns null on non-finite inputs', () => {
    expect(findLineTargetCrossing(Number.NaN, 0, 1, 10, 5)).toBeNull();
    expect(findLineTargetCrossing(0, 0, 1, 10, Number.NaN)).toBeNull();
  });

  it('biases the crossing toward the curve closer to target', () => {
    // (0, 0) -> (10, 20). target=5. delta1 = -5, delta2 = +15. crossing
    // at 0 + 10 * 5 / 20 = 2.5.
    expect(findLineTargetCrossing(0, 0, 10, 20, 5)).toBeCloseTo(2.5, 6);
  });
});

describe('computeLineTargetStats', () => {
  it('returns empty stats for null / empty / non-array', () => {
    const empty = computeLineTargetStats(null, 0);
    expect(empty.finiteCount).toBe(0);
    expect(empty.overCount).toBe(0);
    expect(empty.underCount).toBe(0);
    expect(computeLineTargetStats([], 0).finiteCount).toBe(0);
  });

  it('counts over / under / at per target', () => {
    const s = computeLineTargetStats(goalSeries.data, 100);
    // 80,110,90,130,70,120 vs 100 -> over=110,130,120 (3); under=80,90,70 (3); at=0.
    expect(s.overCount).toBe(3);
    expect(s.underCount).toBe(3);
    expect(s.atCount).toBe(0);
    expect(s.finiteCount).toBe(6);
  });

  it('records max over / max under gaps', () => {
    const s = computeLineTargetStats(goalSeries.data, 100);
    // max over = 130-100 = 30; max under = 100-70 = 30.
    expect(s.maxOverGap).toBe(30);
    expect(s.maxUnderGap).toBe(30);
  });

  it('returns percent over / under / at', () => {
    const s = computeLineTargetStats(goalSeries.data, 100);
    expect(s.percentOver).toBeCloseTo(3 / 6, 6);
    expect(s.percentUnder).toBeCloseTo(3 / 6, 6);
    expect(s.percentAt).toBe(0);
  });

  it('handles epsilon equality band', () => {
    const s = computeLineTargetStats(
      [
        { x: 0, y: 5 },
        { x: 1, y: 5.4 },
        { x: 2, y: 4.6 },
      ],
      5,
      0.5,
    );
    expect(s.atCount).toBe(3);
    expect(s.overCount).toBe(0);
    expect(s.underCount).toBe(0);
  });

  it('drops non-finite samples', () => {
    const s = computeLineTargetStats(
      [
        { x: 0, y: 5 },
        { x: 1, y: Number.NaN },
        { x: 2, y: 10 },
      ],
      0,
    );
    expect(s.finiteCount).toBe(2);
    expect(s.overCount).toBe(2);
  });

  it('totalArea grows with absolute gap', () => {
    const s = computeLineTargetStats(
      [
        { x: 0, y: 10 },
        { x: 4, y: 10 },
      ],
      0,
    );
    // |10-0| trapezoid (10+10)/2 * 4 = 40.
    expect(s.totalArea).toBeCloseTo(40, 6);
  });
});

describe('computeLineTargetLayout', () => {
  it('returns empty when no series', () => {
    const layout = computeLineTargetLayout({
      series: [],
      target: 0,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series).toEqual([]);
  });

  it('returns empty when canvas degenerate', () => {
    const layout = computeLineTargetLayout({
      series: [goalSeries],
      target: 100,
      width: 20,
      height: 20,
      padding: 30,
    });
    expect(layout.series).toEqual([]);
  });

  it('builds layout series with path and stats', () => {
    const layout = computeLineTargetLayout({
      series: [goalSeries],
      target: 100,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series).toHaveLength(1);
    const s = layout.series[0]!;
    expect(s.path).toMatch(/^M /);
    expect(s.stats.overCount).toBe(3);
    expect(s.stats.underCount).toBe(3);
  });

  it('expands y bounds to include the target', () => {
    const layout = computeLineTargetLayout({
      series: [
        {
          id: 'x',
          label: 'X',
          data: [{ x: 0, y: 10 }, { x: 1, y: 20 }],
        },
      ],
      target: 100,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.yMax).toBeGreaterThanOrEqual(100);
  });

  it('builds per-segment regions (no crossing)', () => {
    const layout = computeLineTargetLayout({
      series: [
        {
          id: 'p',
          label: 'P',
          data: [
            { x: 0, y: 50 },
            { x: 1, y: 60 },
            { x: 2, y: 70 },
          ],
        },
      ],
      target: 100,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series[0]?.regions).toHaveLength(2);
    for (const r of layout.series[0]!.regions) {
      expect(r.isOver).toBe(false);
    }
  });

  it('splits a crossing segment into two regions with opposite directions', () => {
    const layout = computeLineTargetLayout({
      series: [crossingSeries],
      target: 5,
      width: 400,
      height: 300,
      padding: 30,
    });
    const regions = layout.series[0]!.regions;
    expect(regions).toHaveLength(2);
    expect(regions[0]?.isOver).toBe(false);
    expect(regions[1]?.isOver).toBe(true);
    expect(regions[0]?.endX).toBeCloseTo(5, 6);
  });

  it('honors showOverUnderShading=false', () => {
    const layout = computeLineTargetLayout({
      series: [goalSeries],
      target: 100,
      showOverUnderShading: false,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series[0]?.regions).toEqual([]);
  });

  it('honors per-series overColor / underColor overrides', () => {
    const layout = computeLineTargetLayout({
      series: [
        { ...goalSeries, overColor: '#aaaaaa', underColor: '#bbbbbb' },
      ],
      target: 100,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series[0]?.overColor).toBe('#aaaaaa');
    expect(layout.series[0]?.underColor).toBe('#bbbbbb');
    const overRegion = layout.series[0]!.regions.find((r) => r.isOver);
    const underRegion = layout.series[0]!.regions.find((r) => !r.isOver);
    expect(overRegion?.fillColor).toBe('#aaaaaa');
    expect(underRegion?.fillColor).toBe('#bbbbbb');
  });

  it('honors hidden series filter', () => {
    const layout = computeLineTargetLayout({
      series: [
        goalSeries,
        { id: 'b', label: 'B', data: [{ x: 0, y: 5 }] },
      ],
      target: 100,
      hiddenSeries: new Set(['a']),
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series).toHaveLength(1);
    expect(layout.series[0]?.id).toBe('b');
  });

  it('records targetY and includes target in y range', () => {
    const layout = computeLineTargetLayout({
      series: [goalSeries],
      target: 100,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.target).toBe(100);
    expect(layout.targetY).toBeGreaterThan(0);
  });

  it('falls back to target 0 when target is non-finite', () => {
    const layout = computeLineTargetLayout({
      series: [goalSeries],
      target: Number.NaN,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.target).toBe(0);
  });

  it('respects user-supplied bounds overrides', () => {
    const layout = computeLineTargetLayout({
      series: [goalSeries],
      target: 100,
      width: 400,
      height: 300,
      padding: 30,
      yMin: -50,
      yMax: 500,
    });
    expect(layout.yMin).toBe(-50);
    expect(layout.yMax).toBe(500);
  });

  it('produces axis ticks at the requested step count', () => {
    const layout = computeLineTargetLayout({
      series: [goalSeries],
      target: 100,
      tickCount: 6,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.xTicks).toHaveLength(6);
    expect(layout.yTicks).toHaveLength(6);
  });

  it('per-point direction is over/under/at', () => {
    const layout = computeLineTargetLayout({
      series: [goalSeries],
      target: 100,
      width: 400,
      height: 300,
      padding: 30,
    });
    const pts = layout.series[0]!.points;
    expect(pts[0]?.direction).toBe('under'); // 80 < 100
    expect(pts[1]?.direction).toBe('over'); // 110 > 100
  });
});

describe('describeLineTargetChart', () => {
  it('returns "No data" when no series', () => {
    expect(describeLineTargetChart(null, 0)).toBe('No data');
    expect(describeLineTargetChart([], 0)).toBe('No data');
  });

  it('returns "No data" when all hidden', () => {
    expect(
      describeLineTargetChart([goalSeries], 100, new Set(['a'])),
    ).toBe('No data');
  });

  it('returns "No data" when no finite samples', () => {
    expect(
      describeLineTargetChart(
        [{ id: 'x', label: 'X', data: [{ x: Number.NaN, y: 1 }] }],
        0,
      ),
    ).toBe('No data');
  });

  it('summarises target + per-series over/under/peak gaps', () => {
    const text = describeLineTargetChart([goalSeries], 100);
    expect(text).toContain('Line chart vs target 100');
    expect(text).toContain('3/6 over');
    expect(text).toContain('peak over 30');
    expect(text).toContain('peak under 30');
  });

  it('uses formatValue formatter', () => {
    expect(
      describeLineTargetChart(
        [goalSeries],
        100,
        undefined,
        (n) => `$${n}`,
      ),
    ).toContain('$100');
  });
});

describe('<ChartLineTarget /> rendering', () => {
  it('renders nothing meaningful when empty series', () => {
    const { container } = render(<ChartLineTarget series={[]} />);
    const root = container.querySelector(
      '[data-section="chart-line-target"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-series-count')).toBe('0');
    expect(
      container.querySelectorAll('[data-section="chart-line-target-region"]'),
    ).toHaveLength(0);
  });

  it('renders one line path per series', () => {
    const { container } = render(
      <ChartLineTarget series={[goalSeries]} target={100} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-target-path"]'),
    ).toHaveLength(1);
  });

  it('renders shaded over/under regions per segment', () => {
    const { container } = render(
      <ChartLineTarget series={[goalSeries]} target={100} />,
    );
    const regions = container.querySelectorAll(
      '[data-section="chart-line-target-region"]',
    );
    expect(regions.length).toBeGreaterThan(0);
    const isOverVals = Array.from(regions).map((r) =>
      r.getAttribute('data-region-is-over'),
    );
    expect(isOverVals).toContain('true');
    expect(isOverVals).toContain('false');
  });

  it('omits regions when showOverUnderShading=false', () => {
    const { container } = render(
      <ChartLineTarget
        series={[goalSeries]}
        target={100}
        showOverUnderShading={false}
      />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-target-region"]'),
    ).toHaveLength(0);
  });

  it('renders the target reference line and label by default', () => {
    const { container } = render(
      <ChartLineTarget series={[goalSeries]} target={100} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-target-target-line"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-target-target-label"]',
      )?.textContent,
    ).toMatch(/Target: 100/);
  });

  it('omits target line when showTargetLine=false', () => {
    const { container } = render(
      <ChartLineTarget
        series={[goalSeries]}
        target={100}
        showTargetLine={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-target-target-line"]',
      ),
    ).toBeNull();
  });

  it('omits target label when showTargetLabel=false', () => {
    const { container } = render(
      <ChartLineTarget
        series={[goalSeries]}
        target={100}
        showTargetLabel={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-target-target-label"]',
      ),
    ).toBeNull();
  });

  it('uses custom targetLabel in the label text', () => {
    const { container } = render(
      <ChartLineTarget
        series={[goalSeries]}
        target={100}
        targetLabel="SLO"
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-target-target-label"]',
      )?.textContent,
    ).toMatch(/SLO:/);
  });

  it('renders dots per finite point with per-direction fill', () => {
    const { container } = render(
      <ChartLineTarget series={[goalSeries]} target={100} />,
    );
    const dots = container.querySelectorAll(
      '[data-section="chart-line-target-dot"]',
    );
    expect(dots).toHaveLength(6);
    const overDot = container.querySelector(
      '[data-section="chart-line-target-dot"][data-point-index="1"]',
    );
    expect(overDot?.getAttribute('data-direction')).toBe('over');
    const underDot = container.querySelector(
      '[data-section="chart-line-target-dot"][data-point-index="0"]',
    );
    expect(underDot?.getAttribute('data-direction')).toBe('under');
  });

  it('hides dots when showDots=false', () => {
    const { container } = render(
      <ChartLineTarget
        series={[goalSeries]}
        target={100}
        showDots={false}
      />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-target-dot"]'),
    ).toHaveLength(0);
  });

  it('renders aria description and labels region', () => {
    render(<ChartLineTarget series={[goalSeries]} target={100} />);
    expect(
      screen.getByRole('region', { name: /line chart vs target/i }),
    ).toBeTruthy();
  });

  it('shows tooltip on dot hover with direction and delta', () => {
    const { container } = render(
      <ChartLineTarget series={[goalSeries]} target={100} />,
    );
    const overDot = container.querySelector(
      '[data-section="chart-line-target-dot"][data-point-index="3"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(overDot);
    const tip = container.querySelector(
      '[data-section="chart-line-target-tooltip"]',
    );
    expect(tip).not.toBeNull();
    expect(
      tip?.querySelector(
        '[data-section="chart-line-target-tooltip-delta"]',
      )?.textContent,
    ).toMatch(/over/);
    expect(
      tip?.querySelector(
        '[data-section="chart-line-target-tooltip-delta"]',
      )?.textContent,
    ).toMatch(/\+30/);
  });

  it('hides tooltip on mouseLeave', () => {
    const { container } = render(
      <ChartLineTarget series={[goalSeries]} target={100} />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-target-dot"][data-point-index="0"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    expect(
      container.querySelector('[data-section="chart-line-target-tooltip"]'),
    ).not.toBeNull();
    fireEvent.mouseLeave(dot);
    expect(
      container.querySelector('[data-section="chart-line-target-tooltip"]'),
    ).toBeNull();
  });

  it('omits tooltip when showTooltip=false', () => {
    const { container } = render(
      <ChartLineTarget
        series={[goalSeries]}
        target={100}
        showTooltip={false}
      />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-target-dot"][data-point-index="0"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    expect(
      container.querySelector('[data-section="chart-line-target-tooltip"]'),
    ).toBeNull();
  });

  it('invokes onPointClick with series + point', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ChartLineTarget
        series={[goalSeries]}
        target={100}
        onPointClick={onClick}
      />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-target-dot"][data-point-index="2"]',
    ) as SVGCircleElement;
    fireEvent.click(dot);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0]?.[0].point.index).toBe(2);
  });

  it('invokes onRegionClick when a region path is clicked', () => {
    const onRegionClick = vi.fn();
    const { container } = render(
      <ChartLineTarget
        series={[goalSeries]}
        target={100}
        onRegionClick={onRegionClick}
      />,
    );
    const region = container.querySelector(
      '[data-section="chart-line-target-region"]',
    ) as SVGPathElement;
    fireEvent.click(region);
    expect(onRegionClick).toHaveBeenCalledTimes(1);
    expect(onRegionClick.mock.calls[0]?.[0].region.index).toBe(0);
  });

  it('legend shows progress (over/total + percent) when showProgress=true', () => {
    const { container } = render(
      <ChartLineTarget series={[goalSeries]} target={100} />,
    );
    const progress = container.querySelector(
      '[data-section="chart-line-target-legend-progress"]',
    );
    expect(progress?.textContent).toMatch(/3\/6 over/);
    expect(progress?.textContent).toMatch(/50%/);
  });

  it('omits legend progress when showProgress=false', () => {
    const { container } = render(
      <ChartLineTarget
        series={[goalSeries]}
        target={100}
        showProgress={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-target-legend-progress"]',
      ),
    ).toBeNull();
  });

  it('toggles series via the legend (uncontrolled)', () => {
    const { container } = render(
      <ChartLineTarget
        series={[
          goalSeries,
          { id: 'b', label: 'B', data: [{ x: 0, y: 5 }] },
        ]}
        target={100}
      />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-target-legend-button"][data-series-id="a"]',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(
      container.querySelectorAll('[data-section="chart-line-target-path"]'),
    ).toHaveLength(1);
  });

  it('respects controlled hiddenSeries prop', () => {
    const { container } = render(
      <ChartLineTarget
        series={[goalSeries, { id: 'b', label: 'B', data: [{ x: 0, y: 5 }] }]}
        target={100}
        hiddenSeries={new Set(['b'])}
      />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-target-path"]'),
    ).toHaveLength(1);
  });

  it('emits onHiddenSeriesChange on legend toggle', () => {
    const onChange = vi.fn();
    const { container } = render(
      <ChartLineTarget
        series={[goalSeries]}
        target={100}
        onHiddenSeriesChange={onChange}
      />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-target-legend-button"][data-series-id="a"]',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0].has('a')).toBe(true);
  });

  it('omits legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineTarget
        series={[goalSeries]}
        target={100}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-target-legend"]'),
    ).toBeNull();
  });

  it('exposes per-series stats via data attrs', () => {
    const { container } = render(
      <ChartLineTarget series={[goalSeries]} target={100} />,
    );
    const group = container.querySelector(
      '[data-section="chart-line-target-series-group"][data-series-id="a"]',
    );
    expect(group?.getAttribute('data-series-over-count')).toBe('3');
    expect(group?.getAttribute('data-series-under-count')).toBe('3');
    expect(group?.getAttribute('data-series-max-over-gap')).toBe('30');
    expect(group?.getAttribute('data-series-max-under-gap')).toBe('30');
  });

  it('animate flag toggles data-animate and fade-in class', () => {
    const { container } = render(
      <ChartLineTarget series={[goalSeries]} target={100} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-target"]',
    ) as HTMLDivElement;
    expect(root.getAttribute('data-animate')).toBe('true');
    expect(root.className).toContain('motion-safe:animate-fade-in');
    const { container: c2 } = render(
      <ChartLineTarget
        series={[goalSeries]}
        target={100}
        animate={false}
      />,
    );
    const r2 = c2.querySelector(
      '[data-section="chart-line-target"]',
    ) as HTMLDivElement;
    expect(r2.getAttribute('data-animate')).toBe('false');
    expect(r2.className).not.toContain('motion-safe:animate-fade-in');
  });

  it('forwards ref to root div', () => {
    const ref = { current: null as HTMLDivElement | null };
    render(
      <ChartLineTarget
        ref={ref}
        series={[goalSeries]}
        target={100}
      />,
    );
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-target',
    );
  });

  it('renders a stable displayName for devtools', () => {
    expect(ChartLineTarget.displayName).toBe('ChartLineTarget');
  });
});
