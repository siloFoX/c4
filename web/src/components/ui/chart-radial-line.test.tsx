import { afterEach, describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import {
  ChartRadialLine,
  computeRadialLineLayout,
  describeRadialLineChart,
  getRadialLineCyclicAngle,
  getRadialLineDefaultColor,
  getRadialLineMaxValue,
  getRadialLineSampleCount,
  getRadialLineTicks,
  polarToCartesian,
  DEFAULT_CHART_RADIAL_LINE_WIDTH,
  DEFAULT_CHART_RADIAL_LINE_HEIGHT,
  DEFAULT_CHART_RADIAL_LINE_PADDING,
  DEFAULT_CHART_RADIAL_LINE_INNER_RADIUS,
  DEFAULT_CHART_RADIAL_LINE_START_ANGLE,
  DEFAULT_CHART_RADIAL_LINE_TICK_COUNT,
  DEFAULT_CHART_RADIAL_LINE_STROKE_WIDTH,
  DEFAULT_CHART_RADIAL_LINE_POINT_RADIUS,
  DEFAULT_CHART_RADIAL_LINE_FILL_OPACITY,
  DEFAULT_CHART_RADIAL_LINE_GRID_COLOR,
  DEFAULT_CHART_RADIAL_LINE_AXIS_COLOR,
  DEFAULT_CHART_RADIAL_LINE_PALETTE,
  type ChartRadialLineSeries,
} from './chart-radial-line';

afterEach(() => cleanup());

const HOURS: ChartRadialLineSeries[] = [
  {
    id: 'mon',
    label: 'Monday',
    data: [
      5, 4, 3, 2, 2, 3, 8, 15, 25, 30, 28, 25, 22, 20, 22, 25, 30, 35, 28, 20,
      15, 12, 10, 7,
    ],
  },
  {
    id: 'sat',
    label: 'Saturday',
    data: [
      8, 7, 5, 3, 2, 2, 4, 6, 8, 12, 15, 18, 20, 22, 24, 22, 20, 18, 18, 16,
      14, 12, 10, 9,
    ],
  },
];

const HOURS_LABELS = Array.from({ length: 24 }, (_, i) => `${i}h`);

describe('chart-radial-line constants', () => {
  it('exports the documented defaults', () => {
    expect(DEFAULT_CHART_RADIAL_LINE_WIDTH).toBe(380);
    expect(DEFAULT_CHART_RADIAL_LINE_HEIGHT).toBe(380);
    expect(DEFAULT_CHART_RADIAL_LINE_PADDING).toBe(32);
    expect(DEFAULT_CHART_RADIAL_LINE_INNER_RADIUS).toBe(24);
    expect(DEFAULT_CHART_RADIAL_LINE_START_ANGLE).toBeCloseTo(-Math.PI / 2);
    expect(DEFAULT_CHART_RADIAL_LINE_TICK_COUNT).toBe(4);
    expect(DEFAULT_CHART_RADIAL_LINE_STROKE_WIDTH).toBeCloseTo(1.6);
    expect(DEFAULT_CHART_RADIAL_LINE_POINT_RADIUS).toBe(3);
    expect(DEFAULT_CHART_RADIAL_LINE_FILL_OPACITY).toBeCloseTo(0.15);
    expect(DEFAULT_CHART_RADIAL_LINE_GRID_COLOR).toBe('#e2e8f0');
    expect(DEFAULT_CHART_RADIAL_LINE_AXIS_COLOR).toBe('#cbd5e1');
    expect(DEFAULT_CHART_RADIAL_LINE_PALETTE.length).toBe(10);
  });
});

describe('getRadialLineDefaultColor', () => {
  it('palette + modulo + invalid fallback', () => {
    expect(getRadialLineDefaultColor(0)).toBe(
      DEFAULT_CHART_RADIAL_LINE_PALETTE[0]
    );
    expect(getRadialLineDefaultColor(DEFAULT_CHART_RADIAL_LINE_PALETTE.length)).toBe(
      DEFAULT_CHART_RADIAL_LINE_PALETTE[0]
    );
    expect(getRadialLineDefaultColor(-1)).toBe(
      DEFAULT_CHART_RADIAL_LINE_PALETTE[0]
    );
  });
});

describe('polarToCartesian', () => {
  it('center at radius=0; right at 0; down at pi/2', () => {
    expect(polarToCartesian(5, 7, 0, 1)).toEqual({ x: 5, y: 7 });
    const r = polarToCartesian(0, 0, 10, 0);
    expect(r.x).toBeCloseTo(10);
    const d = polarToCartesian(0, 0, 10, Math.PI / 2);
    expect(d.y).toBeCloseTo(10);
  });
});

describe('getRadialLineCyclicAngle', () => {
  it('returns startAngle at position 0', () => {
    expect(getRadialLineCyclicAngle(0, 12, -Math.PI / 2)).toBeCloseTo(
      -Math.PI / 2
    );
  });
  it('wraps fractionally across the cycle', () => {
    expect(getRadialLineCyclicAngle(6, 12, 0)).toBeCloseTo(Math.PI);
    expect(getRadialLineCyclicAngle(3, 12, 0)).toBeCloseTo(Math.PI / 2);
  });
  it('non-positive cycleLength -> startAngle', () => {
    expect(getRadialLineCyclicAngle(5, 0, 0)).toBe(0);
  });
});

describe('getRadialLineMaxValue', () => {
  it('returns the largest visible positive value', () => {
    expect(getRadialLineMaxValue(HOURS, new Set())).toBe(35);
  });
  it('respects hidden series', () => {
    expect(getRadialLineMaxValue(HOURS, new Set(['mon']))).toBe(24);
  });
  it('empty / all-hidden / all-non-positive -> 1 fallback', () => {
    expect(getRadialLineMaxValue([], new Set())).toBe(1);
    expect(getRadialLineMaxValue(HOURS, new Set(['mon', 'sat']))).toBe(1);
  });
});

describe('getRadialLineSampleCount', () => {
  it('returns the longest data length', () => {
    expect(getRadialLineSampleCount(HOURS, new Set())).toBe(24);
  });
  it('respects hidden series', () => {
    expect(
      getRadialLineSampleCount(
        [
          { id: 'a', label: 'A', data: [1, 2, 3, 4, 5] },
          { id: 'b', label: 'B', data: [1, 2] },
        ],
        new Set(['a'])
      )
    ).toBe(2);
  });
});

describe('getRadialLineTicks', () => {
  it('non-positive -> [0]', () => {
    expect(getRadialLineTicks(0)).toEqual([0]);
  });
  it('returns count evenly-spaced ticks 0..max', () => {
    const t = getRadialLineTicks(100, 5);
    expect(t).toHaveLength(5);
    expect(t[0]).toBe(0);
    expect(t[4]).toBeCloseTo(100);
  });
  it('clamps count to >= 2', () => {
    expect(getRadialLineTicks(10, 1).length).toBe(2);
  });
});

describe('computeRadialLineLayout', () => {
  const cx = 190;
  const cy = 190;
  const innerRadius = 24;
  const outerRadius = 160;

  it('null / non-positive radius / non-positive cycle -> empty', () => {
    const a = computeRadialLineLayout({
      series: [],
      hidden: new Set(),
      mode: 'cyclic',
      cycleLength: 12,
      cx,
      cy,
      innerRadius,
      outerRadius,
      startAngle: 0,
      tickCount: 4,
      closeCyclic: true,
    });
    expect(a.series).toEqual([]);
    const b = computeRadialLineLayout({
      series: HOURS,
      hidden: new Set(),
      mode: 'cyclic',
      cycleLength: 0,
      cx,
      cy,
      innerRadius,
      outerRadius,
      startAngle: 0,
      tickCount: 4,
      closeCyclic: true,
    });
    expect(b.series).toEqual([]);
  });

  it('cyclic mode: produces one series per visible input + axis spokes per cycle position', () => {
    const r = computeRadialLineLayout({
      series: HOURS,
      hidden: new Set(),
      mode: 'cyclic',
      cycleLength: 24,
      cx,
      cy,
      innerRadius,
      outerRadius,
      startAngle: -Math.PI / 2,
      tickCount: 4,
      closeCyclic: true,
    });
    expect(r.series).toHaveLength(2);
    expect(r.axisAngles).toHaveLength(24);
  });

  it('cyclic mode: closeCyclic appends Z to fillPath', () => {
    const r = computeRadialLineLayout({
      series: HOURS,
      hidden: new Set(),
      mode: 'cyclic',
      cycleLength: 24,
      cx,
      cy,
      innerRadius,
      outerRadius,
      startAngle: 0,
      tickCount: 4,
      closeCyclic: true,
    });
    for (const ser of r.series) {
      expect(ser.fillPath.endsWith('Z')).toBe(true);
    }
  });

  it('closeCyclic=false leaves the line open (no Z)', () => {
    const r = computeRadialLineLayout({
      series: HOURS,
      hidden: new Set(),
      mode: 'cyclic',
      cycleLength: 24,
      cx,
      cy,
      innerRadius,
      outerRadius,
      startAngle: 0,
      tickCount: 4,
      closeCyclic: false,
    });
    for (const ser of r.series) {
      expect(ser.fillPath).toBe('');
    }
  });

  it('cyclic angle at index 0 equals startAngle', () => {
    const r = computeRadialLineLayout({
      series: HOURS,
      hidden: new Set(),
      mode: 'cyclic',
      cycleLength: 24,
      cx,
      cy,
      innerRadius,
      outerRadius,
      startAngle: -Math.PI / 2,
      tickCount: 4,
      closeCyclic: true,
    });
    const first = r.series[0]!.points[0]!;
    expect(first.angle).toBeCloseTo(-Math.PI / 2);
  });

  it('point position in cycle wraps modulo cycleLength', () => {
    const r = computeRadialLineLayout({
      series: HOURS,
      hidden: new Set(),
      mode: 'cyclic',
      cycleLength: 24,
      cx,
      cy,
      innerRadius,
      outerRadius,
      startAngle: 0,
      tickCount: 4,
      closeCyclic: true,
    });
    const ser = r.series[0]!;
    for (const pt of ser.points) {
      expect(pt.positionInCycle).toBe(pt.index % 24);
    }
  });

  it('hidden series drop from the output', () => {
    const r = computeRadialLineLayout({
      series: HOURS,
      hidden: new Set(['mon']),
      mode: 'cyclic',
      cycleLength: 24,
      cx,
      cy,
      innerRadius,
      outerRadius,
      startAngle: 0,
      tickCount: 4,
      closeCyclic: true,
    });
    expect(r.series).toHaveLength(1);
    expect(r.series[0]!.id).toBe('sat');
  });

  it('non-finite values collapse to inner radius and break the line (M restart)', () => {
    const series: ChartRadialLineSeries[] = [
      { id: 'a', label: 'A', data: [10, Number.NaN, 20, 30] },
    ];
    const r = computeRadialLineLayout({
      series,
      hidden: new Set(),
      mode: 'cyclic',
      cycleLength: 4,
      cx,
      cy,
      innerRadius,
      outerRadius,
      startAngle: 0,
      tickCount: 4,
      closeCyclic: false,
    });
    const ser = r.series[0]!;
    expect(ser.points[1]!.isFinite).toBe(false);
    // The line path should contain at least two M commands (the initial + one
    // after the gap)
    const mCount = (ser.linePath.match(/M/g) || []).length;
    expect(mCount).toBeGreaterThanOrEqual(2);
  });

  it('spiral mode: radius increases with sample position', () => {
    const series: ChartRadialLineSeries[] = [
      { id: 'a', label: 'A', data: Array.from({ length: 48 }, (_, i) => i % 24) },
    ];
    const r = computeRadialLineLayout({
      series,
      hidden: new Set(),
      mode: 'spiral',
      cycleLength: 24,
      cx,
      cy,
      innerRadius,
      outerRadius,
      startAngle: 0,
      tickCount: 4,
      closeCyclic: false,
    });
    const points = r.series[0]!.points;
    // mid of cycle 1 should have radius greater than mid of cycle 0
    const c0Mid = points[12]!;
    const c1Mid = points[36]!;
    expect(c1Mid.radius).toBeGreaterThan(c0Mid.radius);
  });

  it('spiral mode: angles accumulate across cycles (cycle 1 sample 0 = startAngle + 2pi)', () => {
    const series: ChartRadialLineSeries[] = [
      { id: 'a', label: 'A', data: Array.from({ length: 48 }, () => 1) },
    ];
    const r = computeRadialLineLayout({
      series,
      hidden: new Set(),
      mode: 'spiral',
      cycleLength: 24,
      cx,
      cy,
      innerRadius,
      outerRadius,
      startAngle: 0,
      tickCount: 4,
      closeCyclic: false,
    });
    expect(r.series[0]!.points[0]!.angle).toBeCloseTo(0);
    expect(r.series[0]!.points[24]!.angle).toBeCloseTo(Math.PI * 2);
  });

  it('axis labels picked up from prop with fallback to index', () => {
    const r = computeRadialLineLayout({
      series: HOURS,
      hidden: new Set(),
      mode: 'cyclic',
      cycleLength: 24,
      axisLabels: HOURS_LABELS,
      cx,
      cy,
      innerRadius,
      outerRadius,
      startAngle: 0,
      tickCount: 4,
      closeCyclic: true,
    });
    expect(r.axisAngles[0]!.label).toBe('0h');
    expect(r.axisAngles[5]!.label).toBe('5h');
  });

  it('rings emitted at each tick value > 0', () => {
    const r = computeRadialLineLayout({
      series: HOURS,
      hidden: new Set(),
      mode: 'cyclic',
      cycleLength: 24,
      cx,
      cy,
      innerRadius,
      outerRadius,
      startAngle: 0,
      tickCount: 4,
      closeCyclic: true,
    });
    expect(r.rings.length).toBeGreaterThan(0);
    for (const ring of r.rings) {
      expect(ring.radius).toBeGreaterThan(innerRadius);
      expect(ring.radius).toBeLessThanOrEqual(outerRadius);
    }
  });

  it('per-series color override beats palette', () => {
    const series: ChartRadialLineSeries[] = [
      { id: 'a', label: 'A', data: [1, 2, 3], color: '#abcdef' },
    ];
    const r = computeRadialLineLayout({
      series,
      hidden: new Set(),
      mode: 'cyclic',
      cycleLength: 3,
      cx,
      cy,
      innerRadius,
      outerRadius,
      startAngle: 0,
      tickCount: 4,
      closeCyclic: true,
    });
    expect(r.series[0]!.color).toBe('#abcdef');
  });

  it('maxValueOverride wins over auto-derived max', () => {
    const r = computeRadialLineLayout({
      series: HOURS,
      hidden: new Set(),
      mode: 'cyclic',
      cycleLength: 24,
      cx,
      cy,
      innerRadius,
      outerRadius,
      startAngle: 0,
      tickCount: 4,
      closeCyclic: true,
      maxValueOverride: 100,
    });
    expect(r.maxValue).toBe(100);
  });

  it('totalCycles = ceil(sampleCount / cycleLength) in spiral mode', () => {
    const series: ChartRadialLineSeries[] = [
      { id: 'a', label: 'A', data: Array.from({ length: 70 }, () => 1) },
    ];
    const r = computeRadialLineLayout({
      series,
      hidden: new Set(),
      mode: 'spiral',
      cycleLength: 24,
      cx,
      cy,
      innerRadius,
      outerRadius,
      startAngle: 0,
      tickCount: 4,
      closeCyclic: false,
    });
    expect(r.totalCycles).toBe(3); // ceil(70 / 24) = 3
  });
});

describe('describeRadialLineChart', () => {
  it('empty / all-hidden / non-positive cycle -> "No data"', () => {
    expect(describeRadialLineChart([], new Set(), 'cyclic', 12)).toBe(
      'No data'
    );
    expect(
      describeRadialLineChart(HOURS, new Set(['mon', 'sat']), 'cyclic', 12)
    ).toBe('No data');
    expect(describeRadialLineChart(HOURS, new Set(), 'cyclic', 0)).toBe(
      'No data'
    );
  });
  it('includes mode + visible series count + cycle length + cycles + peak', () => {
    const d = describeRadialLineChart(HOURS, new Set(), 'cyclic', 24);
    expect(d).toContain('Radial line chart (cyclic)');
    expect(d).toContain('2 series');
    expect(d).toContain('cycle length 24');
    expect(d).toContain('1 cycle');
    expect(d).toContain('35');
  });
});

describe('<ChartRadialLine> component', () => {
  it('renders region + custom aria-label', () => {
    const { getByRole } = render(
      <ChartRadialLine
        series={HOURS}
        cycleLength={24}
        ariaLabel="Test radial line"
      />
    );
    expect(getByRole('region', { name: 'Test radial line' })).toBeTruthy();
  });

  it('renders one series group per visible series', () => {
    const { container } = render(
      <ChartRadialLine series={HOURS} cycleLength={24} />
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-radial-line-series-group"]'
      ).length
    ).toBe(2);
  });

  it('series group data attrs mirror layout', () => {
    const { container } = render(
      <ChartRadialLine series={HOURS} cycleLength={24} />
    );
    const grp = container.querySelector(
      '[data-series-id="mon"]'
    ) as HTMLElement;
    expect(grp.getAttribute('data-series-index')).toBe('0');
    expect(grp.getAttribute('data-series-color')).toBeTruthy();
    expect(grp.getAttribute('data-series-point-count')).toBe('24');
  });

  it('line path is role=graphics-symbol + tabIndex=0 + aria-label', () => {
    const { container } = render(
      <ChartRadialLine series={HOURS} cycleLength={24} />
    );
    const path = container.querySelector(
      '[data-section="chart-radial-line-path"]'
    ) as SVGPathElement;
    expect(path.getAttribute('role')).toBe('graphics-symbol');
    expect(path.getAttribute('tabindex')).toBe('0');
    expect(path.getAttribute('aria-label')).toContain('Monday');
    expect(path.getAttribute('aria-label')).toContain('24 samples');
  });

  it('root mirrors mode + cycle-length + counts + max-value + animate', () => {
    const { container } = render(
      <ChartRadialLine series={HOURS} cycleLength={24} />
    );
    const root = container.querySelector('[data-section="chart-radial-line"]');
    expect(root?.getAttribute('data-mode')).toBe('cyclic');
    expect(root?.getAttribute('data-cycle-length')).toBe('24');
    expect(root?.getAttribute('data-total-cycles')).toBe('1');
    expect(root?.getAttribute('data-series-count')).toBe('2');
    expect(root?.getAttribute('data-visible-series-count')).toBe('2');
    expect(root?.getAttribute('data-point-count')).toBe('48');
    expect(root?.getAttribute('data-max-value')).toBe('35');
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('rings render by default; suppression', () => {
    const a = render(<ChartRadialLine series={HOURS} cycleLength={24} />);
    expect(
      a.container.querySelectorAll(
        '[data-section="chart-radial-line-ring"]'
      ).length
    ).toBeGreaterThan(0);
    cleanup();
    const b = render(
      <ChartRadialLine series={HOURS} cycleLength={24} showRings={false} />
    );
    expect(
      b.container.querySelector('[data-section="chart-radial-line-rings"]')
    ).toBeNull();
  });

  it('spokes render by default; suppression', () => {
    const a = render(<ChartRadialLine series={HOURS} cycleLength={24} />);
    expect(
      a.container.querySelectorAll(
        '[data-section="chart-radial-line-spoke"]'
      ).length
    ).toBe(24);
    cleanup();
    const b = render(
      <ChartRadialLine series={HOURS} cycleLength={24} showSpokes={false} />
    );
    expect(
      b.container.querySelector('[data-section="chart-radial-line-spokes"]')
    ).toBeNull();
  });

  it('axis labels render by default with the provided strings', () => {
    const { container } = render(
      <ChartRadialLine
        series={HOURS}
        cycleLength={24}
        axisLabels={HOURS_LABELS}
      />
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-radial-line-axis-label"]'
    );
    expect(labels.length).toBe(24);
    expect(labels[0]!.textContent).toBe('0h');
  });

  it('showAxisLabels=false suppresses axis labels', () => {
    const { container } = render(
      <ChartRadialLine
        series={HOURS}
        cycleLength={24}
        axisLabels={HOURS_LABELS}
        showAxisLabels={false}
      />
    );
    expect(
      container.querySelector(
        '[data-section="chart-radial-line-axis-labels"]'
      )
    ).toBeNull();
  });

  it('formatAxis rewrites axis labels', () => {
    const { container } = render(
      <ChartRadialLine
        series={HOURS}
        cycleLength={24}
        axisLabels={HOURS_LABELS}
        formatAxis={(label, idx) => `${idx}:${label}`}
      />
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-radial-line-axis-label"]'
    );
    expect(labels[0]!.textContent).toBe('0:0h');
  });

  it('points hidden by default; showPoints=true renders one per sample', () => {
    const a = render(<ChartRadialLine series={HOURS} cycleLength={24} />);
    expect(
      a.container.querySelector('[data-section="chart-radial-line-point"]')
    ).toBeNull();
    cleanup();
    const b = render(
      <ChartRadialLine series={HOURS} cycleLength={24} showPoints />
    );
    expect(
      b.container.querySelectorAll(
        '[data-section="chart-radial-line-point"]'
      ).length
    ).toBe(48);
  });

  it('fill hidden by default; showFill=true renders fill path', () => {
    const a = render(<ChartRadialLine series={HOURS} cycleLength={24} />);
    expect(
      a.container.querySelector('[data-section="chart-radial-line-fill"]')
    ).toBeNull();
    cleanup();
    const b = render(
      <ChartRadialLine series={HOURS} cycleLength={24} showFill />
    );
    expect(
      b.container.querySelectorAll(
        '[data-section="chart-radial-line-fill"]'
      ).length
    ).toBe(2);
  });

  it('legend renders one button per series', () => {
    const { container } = render(
      <ChartRadialLine series={HOURS} cycleLength={24} />
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-radial-line-legend-button"]'
      ).length
    ).toBe(2);
  });

  it('legend click toggles series visibility (uncontrolled) + payload', () => {
    const onSeriesToggle = vi.fn();
    const { container } = render(
      <ChartRadialLine
        series={HOURS}
        cycleLength={24}
        onSeriesToggle={onSeriesToggle}
      />
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-radial-line-legend-button"]'
    );
    fireEvent.click(buttons[1]! as HTMLElement);
    expect(onSeriesToggle).toHaveBeenCalledTimes(1);
    expect(onSeriesToggle.mock.calls[0]![0].series.id).toBe('sat');
    expect(onSeriesToggle.mock.calls[0]![0].hidden).toBe(true);
    const root = container.querySelector(
      '[data-section="chart-radial-line"]'
    );
    expect(root?.getAttribute('data-visible-series-count')).toBe('1');
  });

  it('controlled hiddenSeries respected', () => {
    const { container } = render(
      <ChartRadialLine
        series={HOURS}
        cycleLength={24}
        hiddenSeries={['mon']}
      />
    );
    const root = container.querySelector('[data-section="chart-radial-line"]');
    expect(root?.getAttribute('data-visible-series-count')).toBe('1');
  });

  it('showLegend=false suppresses the legend', () => {
    const { container } = render(
      <ChartRadialLine
        series={HOURS}
        cycleLength={24}
        showLegend={false}
      />
    );
    expect(
      container.querySelector('[data-section="chart-radial-line-legend"]')
    ).toBeNull();
  });

  it('point hover opens tooltip with label + position + value', () => {
    const { container } = render(
      <ChartRadialLine
        series={HOURS}
        cycleLength={24}
        axisLabels={HOURS_LABELS}
        showPoints
      />
    );
    const point = container.querySelector(
      '[data-section="chart-radial-line-point"]'
    ) as HTMLElement;
    fireEvent.mouseEnter(point);
    expect(
      container.querySelector('[data-section="chart-radial-line-tooltip"]')
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-radial-line-tooltip-label"]'
      )?.textContent
    ).toBe('Monday');
    expect(
      container.querySelector(
        '[data-section="chart-radial-line-tooltip-position"]'
      )?.textContent
    ).toBe('0h');
    expect(
      container.querySelector(
        '[data-section="chart-radial-line-tooltip-value"]'
      )?.textContent
    ).toBe('5');
  });

  it('spiral mode tooltip includes cycle number', () => {
    const series: ChartRadialLineSeries[] = [
      { id: 'a', label: 'A', data: Array.from({ length: 48 }, () => 5) },
    ];
    const { container } = render(
      <ChartRadialLine
        series={series}
        cycleLength={24}
        mode="spiral"
        showPoints
      />
    );
    const points = container.querySelectorAll(
      '[data-section="chart-radial-line-point"]'
    );
    fireEvent.mouseEnter(points[30]! as HTMLElement);
    expect(
      container.querySelector(
        '[data-section="chart-radial-line-tooltip-position"]'
      )?.textContent
    ).toContain('cycle 2');
  });

  it('tooltip hides on mouseleave', () => {
    const { container } = render(
      <ChartRadialLine series={HOURS} cycleLength={24} showPoints />
    );
    const point = container.querySelector(
      '[data-section="chart-radial-line-point"]'
    ) as HTMLElement;
    fireEvent.mouseEnter(point);
    expect(
      container.querySelector('[data-section="chart-radial-line-tooltip"]')
    ).not.toBeNull();
    fireEvent.mouseLeave(point);
    expect(
      container.querySelector('[data-section="chart-radial-line-tooltip"]')
    ).toBeNull();
  });

  it('showTooltip=false suppresses the tooltip', () => {
    const { container } = render(
      <ChartRadialLine
        series={HOURS}
        cycleLength={24}
        showPoints
        showTooltip={false}
      />
    );
    fireEvent.mouseEnter(
      container.querySelector(
        '[data-section="chart-radial-line-point"]'
      )! as HTMLElement
    );
    expect(
      container.querySelector('[data-section="chart-radial-line-tooltip"]')
    ).toBeNull();
  });

  it('onPointClick fires with point + series payload', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartRadialLine
        series={HOURS}
        cycleLength={24}
        showPoints
        onPointClick={onPointClick}
      />
    );
    fireEvent.click(
      container.querySelector(
        '[data-section="chart-radial-line-point"]'
      )! as HTMLElement
    );
    expect(onPointClick).toHaveBeenCalledTimes(1);
    expect(onPointClick.mock.calls[0]![0].point.seriesId).toBe('mon');
    expect(onPointClick.mock.calls[0]![0].series.id).toBe('mon');
  });

  it('data-hovered mirrors hover state on points', () => {
    const { container } = render(
      <ChartRadialLine series={HOURS} cycleLength={24} showPoints />
    );
    const point = container.querySelector(
      '[data-section="chart-radial-line-point"]'
    ) as HTMLElement;
    expect(point.getAttribute('data-hovered')).toBe('false');
    fireEvent.mouseEnter(point);
    expect(point.getAttribute('data-hovered')).toBe('true');
    fireEvent.mouseLeave(point);
    expect(point.getAttribute('data-hovered')).toBe('false');
  });

  it('formatValue reaches tooltip + point aria-label', () => {
    const { container } = render(
      <ChartRadialLine
        series={HOURS}
        cycleLength={24}
        showPoints
        formatValue={(v) => `${v}u`}
      />
    );
    const point = container.querySelector(
      '[data-section="chart-radial-line-point"]'
    ) as SVGCircleElement;
    expect(point.getAttribute('aria-label')).toContain('u');
    fireEvent.mouseEnter(point);
    expect(
      container.querySelector(
        '[data-section="chart-radial-line-tooltip-value"]'
      )?.textContent
    ).toBe('5u');
  });

  it('auto ARIA description renders by default', () => {
    const { container } = render(
      <ChartRadialLine series={HOURS} cycleLength={24} />
    );
    expect(
      container.querySelector('[data-section="chart-radial-line-aria-desc"]')
        ?.textContent
    ).toContain('Radial line chart');
  });

  it('ariaDescription override beats auto', () => {
    const { container } = render(
      <ChartRadialLine
        series={HOURS}
        cycleLength={24}
        ariaDescription="Override"
      />
    );
    expect(
      container.querySelector('[data-section="chart-radial-line-aria-desc"]')
        ?.textContent
    ).toBe('Override');
  });

  it('SVG mirrors width / height / viewBox', () => {
    const { container } = render(
      <ChartRadialLine
        series={HOURS}
        cycleLength={24}
        width={400}
        height={400}
      />
    );
    const svg = container.querySelector(
      '[data-section="chart-radial-line-svg"]'
    ) as SVGElement;
    expect(svg.getAttribute('width')).toBe('400');
    expect(svg.getAttribute('height')).toBe('400');
    expect(svg.getAttribute('viewBox')).toBe('0 0 400 400');
  });

  it('empty input renders without crashing', () => {
    const { container } = render(
      <ChartRadialLine series={[]} cycleLength={24} />
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-radial-line-series-group"]'
      ).length
    ).toBe(0);
    expect(
      container.querySelector('[data-section="chart-radial-line-aria-desc"]')
        ?.textContent
    ).toBe('No data');
  });

  it('forwards ref to root', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartRadialLine series={HOURS} cycleLength={24} ref={ref} />
    );
    expect(ref.current?.dataset.section).toBe('chart-radial-line');
  });

  it('has stable displayName', () => {
    expect(ChartRadialLine.displayName).toBe('ChartRadialLine');
  });

  it('data-animate mirrors prop', () => {
    const { container } = render(
      <ChartRadialLine
        series={HOURS}
        cycleLength={24}
        animate={false}
      />
    );
    expect(
      container.querySelector('[data-section="chart-radial-line"]')!
        .getAttribute('data-animate')
    ).toBe('false');
  });
});
