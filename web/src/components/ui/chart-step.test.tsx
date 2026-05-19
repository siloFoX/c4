import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartStep,
  DEFAULT_CHART_STEP_AREA_OPACITY,
  DEFAULT_CHART_STEP_HEIGHT,
  DEFAULT_CHART_STEP_PADDING,
  DEFAULT_CHART_STEP_STROKE_WIDTH,
  DEFAULT_CHART_STEP_TICK_COUNT,
  DEFAULT_CHART_STEP_TYPE,
  DEFAULT_CHART_STEP_WIDTH,
  buildStepAreaPath,
  buildStepPath,
  describeStepChart,
  findStepHitIndex,
  getStepTicks,
  getStepXLabels,
  getStepYBounds,
} from './chart-step';
import type {
  ChartStepSeries,
  StepXY,
} from './chart-step';

const series: ChartStepSeries[] = [
  {
    id: 'a',
    label: 'A',
    data: [
      { x: 'Mon', y: 10 },
      { x: 'Tue', y: 30 },
      { x: 'Wed', y: 20 },
      { x: 'Thu', y: 50 },
      { x: 'Fri', y: 40 },
    ],
  },
  {
    id: 'b',
    label: 'B',
    data: [
      { x: 'Mon', y: 5 },
      { x: 'Tue', y: 25 },
      { x: 'Wed', y: 15 },
      { x: 'Thu', y: 35 },
      { x: 'Fri', y: 30 },
    ],
    color: '#ff00aa',
  },
];

describe('chart-step pure helpers', () => {
  describe('getStepYBounds', () => {
    it('returns min/max across data', () => {
      const b = getStepYBounds(series);
      expect(b.min).toBe(5);
      expect(b.max).toBe(50);
    });
    it('falls back to (0, 1) for empty / all-non-finite', () => {
      expect(getStepYBounds([])).toEqual({ min: 0, max: 1 });
      expect(
        getStepYBounds([
          {
            id: 'x',
            label: 'x',
            data: [{ x: 0, y: Number.NaN }],
          },
        ]),
      ).toEqual({ min: 0, max: 1 });
    });
    it('expands collapsed range', () => {
      const b = getStepYBounds([
        {
          id: 'x',
          label: 'x',
          data: [
            { x: 0, y: 5 },
            { x: 1, y: 5 },
          ],
        },
      ]);
      expect(b.min).toBeLessThan(5);
      expect(b.max).toBeGreaterThan(5);
    });
  });

  describe('getStepXLabels', () => {
    it('returns unique x labels in declaration order', () => {
      const labels = getStepXLabels(series);
      expect(labels).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
    });
    it('preserves numeric x values', () => {
      const labels = getStepXLabels([
        {
          id: 'a',
          label: 'a',
          data: [
            { x: 0, y: 1 },
            { x: 1, y: 2 },
          ],
        },
      ]);
      expect(labels).toEqual([0, 1]);
    });
    it('deduplicates across series', () => {
      const labels = getStepXLabels([
        {
          id: 'a',
          label: 'a',
          data: [
            { x: 'Mon', y: 1 },
            { x: 'Tue', y: 2 },
          ],
        },
        {
          id: 'b',
          label: 'b',
          data: [
            { x: 'Tue', y: 3 },
            { x: 'Wed', y: 4 },
          ],
        },
      ]);
      expect(labels).toEqual(['Mon', 'Tue', 'Wed']);
    });
    it('handles empty input', () => {
      expect(getStepXLabels([])).toEqual([]);
    });
  });

  describe('buildStepPath', () => {
    const pts: StepXY[] = [
      { x: 0, y: 10 },
      { x: 10, y: 20 },
      { x: 20, y: 15 },
    ];
    it('returns "" for empty points', () => {
      expect(buildStepPath([], 'after')).toBe('');
    });
    it('returns just a Move for one point', () => {
      const path = buildStepPath(
        [{ x: 0, y: 0 }],
        'after',
      );
      expect(path).toMatch(/^M /);
      expect(path).not.toContain('L');
    });
    it('emits horizontal-then-vertical for "after"', () => {
      const path = buildStepPath(pts, 'after');
      // For "after" pattern: M x0,y0 L x1,y0 L x1,y1 L x2,y1 L x2,y2
      expect(path).toContain('M 0.00 10.00');
      expect(path).toContain('L 10.00 10.00');
      expect(path).toContain('L 10.00 20.00');
      expect(path).toContain('L 20.00 20.00');
      expect(path).toContain('L 20.00 15.00');
    });
    it('emits vertical-then-horizontal for "before"', () => {
      const path = buildStepPath(pts, 'before');
      // For "before": M x0,y0 L x0,y1 L x1,y1 L x1,y2 L x2,y2
      expect(path).toContain('M 0.00 10.00');
      expect(path).toContain('L 0.00 20.00');
      expect(path).toContain('L 10.00 20.00');
      expect(path).toContain('L 10.00 15.00');
      expect(path).toContain('L 20.00 15.00');
    });
    it('emits midpoint pattern for "middle"', () => {
      const path = buildStepPath(pts, 'middle');
      // For "middle": M x0,y0 L mid01,y0 L mid01,y1 L x1,y1 L mid12,y1 L mid12,y2 L x2,y2
      expect(path).toContain('M 0.00 10.00');
      expect(path).toContain('L 5.00 10.00');
      expect(path).toContain('L 5.00 20.00');
      expect(path).toContain('L 10.00 20.00');
    });
  });

  describe('buildStepAreaPath', () => {
    const pts: StepXY[] = [
      { x: 0, y: 10 },
      { x: 10, y: 20 },
    ];
    it('returns "" for empty points', () => {
      expect(buildStepAreaPath([], 'after', 100)).toBe('');
    });
    it('closes to baseline for a single point', () => {
      const path = buildStepAreaPath(
        [{ x: 5, y: 5 }],
        'after',
        100,
      );
      expect(path).toMatch(/^M /);
      expect(path).toMatch(/Z$/);
      expect(path).toContain('100.00');
    });
    it('appends baseline closure to step path', () => {
      const path = buildStepAreaPath(pts, 'after', 100);
      expect(path).toMatch(/Z$/);
      expect(path).toContain('100.00');
    });
  });

  describe('findStepHitIndex', () => {
    const pts: StepXY[] = [
      { x: 0, y: 0 },
      { x: 50, y: 50 },
      { x: 100, y: 100 },
    ];
    it('returns -1 for empty positions', () => {
      expect(findStepHitIndex([], 50)).toBe(-1);
    });
    it('returns the closest index within maxDistance', () => {
      expect(findStepHitIndex(pts, 52)).toBe(1);
    });
    it('returns -1 when out of range', () => {
      expect(findStepHitIndex(pts, 500, 5)).toBe(-1);
    });
    it('honours custom maxDistance', () => {
      expect(findStepHitIndex(pts, 30, 5)).toBe(-1);
      // screenX=30: pt0(x=0) dist 30, pt1(x=50) dist 20 -> pt1 wins
      expect(findStepHitIndex(pts, 30, 100)).toBe(1);
      // small radius around pt0
      expect(findStepHitIndex(pts, 0, 5)).toBe(0);
    });
  });

  describe('getStepTicks', () => {
    it('emits evenly-spaced ticks', () => {
      expect(getStepTicks(0, 100, 5)).toEqual([
        0, 25, 50, 75, 100,
      ]);
    });
    it('returns [min] for collapsed range', () => {
      expect(getStepTicks(50, 50)).toEqual([50]);
    });
    it('defaults to DEFAULT_CHART_STEP_TICK_COUNT', () => {
      expect(getStepTicks(0, 100).length).toBe(
        DEFAULT_CHART_STEP_TICK_COUNT,
      );
    });
  });

  describe('describeStepChart', () => {
    it('returns "No data" for empty input', () => {
      expect(describeStepChart([])).toBe('No data');
    });
    it('summarises first/last per series', () => {
      const text = describeStepChart(series);
      expect(text).toContain('2 series');
      expect(text).toContain('A from 10 to 40');
      expect(text).toContain('B from 5 to 30');
    });
    it('handles empty series', () => {
      const text = describeStepChart([
        { id: 'x', label: 'x', data: [] },
      ]);
      expect(text).toContain('empty');
    });
    it('honours formatY', () => {
      const text = describeStepChart(
        series,
        (v) => `${v}u`,
      );
      expect(text).toContain('10u');
    });
  });

  it('exports default constants', () => {
    expect(DEFAULT_CHART_STEP_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_STEP_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_STEP_PADDING).toBeGreaterThan(0);
    expect(DEFAULT_CHART_STEP_TICK_COUNT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_STEP_STROKE_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_STEP_AREA_OPACITY).toBeGreaterThan(0);
    expect(DEFAULT_CHART_STEP_TYPE).toBe('after');
  });
});

describe('<ChartStep />', () => {
  it('renders a region with role + aria-label', () => {
    render(<ChartStep series={series} />);
    const root = screen.getByRole('region', { name: 'Step chart' });
    expect(root).toBeInTheDocument();
    expect(root).toHaveAttribute('data-section', 'chart-step');
    expect(root).toHaveAttribute('data-series-count', '2');
    expect(root).toHaveAttribute('data-sample-count', '5');
    expect(root).toHaveAttribute(
      'data-step-type',
      DEFAULT_CHART_STEP_TYPE,
    );
  });

  it('renders a custom aria-label', () => {
    render(<ChartStep series={series} ariaLabel="Latency" />);
    expect(
      screen.getByRole('region', { name: 'Latency' }),
    ).toBeInTheDocument();
  });

  it('renders one line path per series', () => {
    const { container } = render(<ChartStep series={series} />);
    const lines = container.querySelectorAll(
      '[data-section="chart-step-line"]',
    );
    expect(lines.length).toBe(series.length);
  });

  it('renders dots per data point by default', () => {
    const { container } = render(<ChartStep series={series} />);
    const dots = container.querySelectorAll(
      '[data-section="chart-step-dot"]',
    );
    expect(dots.length).toBe(
      series[0]!.data.length + series[1]!.data.length,
    );
  });

  it('suppresses dots when showDots=false', () => {
    const { container } = render(
      <ChartStep series={series} showDots={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-step-dot"]'),
    ).toBeNull();
  });

  it('mirrors step type on root', () => {
    const { container, rerender } = render(
      <ChartStep series={series} stepType="before" />,
    );
    expect(
      container
        .querySelector('[data-section="chart-step"]')
        ?.getAttribute('data-step-type'),
    ).toBe('before');
    rerender(<ChartStep series={series} stepType="middle" />);
    expect(
      container
        .querySelector('[data-section="chart-step"]')
        ?.getAttribute('data-step-type'),
    ).toBe('middle');
  });

  it('honours custom series color', () => {
    const { container } = render(<ChartStep series={series} />);
    const aGroup = container.querySelector(
      '[data-section="chart-step-series"][data-series-id="a"]',
    );
    expect(aGroup?.getAttribute('data-series-color')).toMatch(
      /^#/,
    );
    const bGroup = container.querySelector(
      '[data-section="chart-step-series"][data-series-id="b"]',
    );
    expect(bGroup?.getAttribute('data-series-color')).toBe(
      '#ff00aa',
    );
  });

  it('renders y-axis grid + tick labels by default', () => {
    const { container } = render(<ChartStep series={series} />);
    const ticks = container.querySelectorAll(
      '[data-section="chart-step-tick"]',
    );
    const tickLabels = container.querySelectorAll(
      '[data-section="chart-step-tick-label"]',
    );
    expect(ticks.length).toBeGreaterThan(0);
    expect(tickLabels.length).toBeGreaterThan(0);
  });

  it('suppresses tick labels when showAxisTicks=false', () => {
    const { container } = render(
      <ChartStep series={series} showAxisTicks={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-step-tick-label"]',
      ),
    ).toBeNull();
  });

  it('suppresses grid lines when showGrid=false', () => {
    const { container } = render(
      <ChartStep
        series={series}
        showGrid={false}
        showAxisTicks={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-step-tick"] line',
      ),
    ).toBeNull();
  });

  it('renders x-axis labels by default', () => {
    const { container } = render(<ChartStep series={series} />);
    const labels = container.querySelectorAll(
      '[data-section="chart-step-xlabel"]',
    );
    expect(labels.length).toBe(5);
    expect(labels[0]?.textContent).toBe('Mon');
  });

  it('suppresses x labels when showLabels=false', () => {
    const { container } = render(
      <ChartStep series={series} showLabels={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-step-xlabel"]',
      ),
    ).toBeNull();
  });

  it('renders a legend by default', () => {
    const { container } = render(<ChartStep series={series} />);
    const legend = container.querySelector(
      '[data-section="chart-step-legend"]',
    );
    expect(legend).not.toBeNull();
    const items = container.querySelectorAll(
      '[data-section="chart-step-legend-item"]',
    );
    expect(items.length).toBe(2);
  });

  it('suppresses legend when showLegend=false', () => {
    const { container } = render(
      <ChartStep series={series} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-step-legend"]',
      ),
    ).toBeNull();
  });

  it('legend placement defaults to right', () => {
    const { container } = render(<ChartStep series={series} />);
    expect(
      container
        .querySelector('[data-section="chart-step-legend"]')
        ?.getAttribute('data-placement'),
    ).toBe('right');
  });

  it('legend placement bottom when configured', () => {
    const { container } = render(
      <ChartStep series={series} legendPlacement="bottom" />,
    );
    expect(
      container
        .querySelector('[data-section="chart-step-legend"]')
        ?.getAttribute('data-placement'),
    ).toBe('bottom');
  });

  it('renders area fill when showArea=true', () => {
    const { container } = render(
      <ChartStep series={series} showArea />,
    );
    const areas = container.querySelectorAll(
      '[data-section="chart-step-area"]',
    );
    expect(areas.length).toBe(series.length);
  });

  it('omits area fill by default', () => {
    const { container } = render(<ChartStep series={series} />);
    expect(
      container.querySelector(
        '[data-section="chart-step-area"]',
      ),
    ).toBeNull();
  });

  it('shows tooltip on dot hover with x + y rows', () => {
    const { container } = render(<ChartStep series={series} />);
    const dot = container.querySelector(
      '[data-section="chart-step-dot"][data-series-id="a"][data-point-index="2"]',
    );
    fireEvent.mouseEnter(dot!);
    const tip = container.querySelector(
      '[data-section="chart-step-tooltip"]',
    );
    expect(tip).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-step-tooltip-label"]',
      )?.textContent,
    ).toBe('A');
    expect(
      container.querySelector(
        '[data-section="chart-step-tooltip-x"]',
      )?.textContent,
    ).toContain('Wed');
    expect(
      container.querySelector(
        '[data-section="chart-step-tooltip-y"]',
      )?.textContent,
    ).toContain('20');
  });

  it('hides tooltip on mouse-leave', () => {
    const { container } = render(<ChartStep series={series} />);
    const dot = container.querySelector(
      '[data-section="chart-step-dot"]',
    );
    fireEvent.mouseEnter(dot!);
    fireEvent.mouseLeave(dot!);
    expect(
      container.querySelector(
        '[data-section="chart-step-tooltip"]',
      ),
    ).toBeNull();
  });

  it('suppresses tooltip when showTooltip=false', () => {
    const { container } = render(
      <ChartStep series={series} showTooltip={false} />,
    );
    const dot = container.querySelector(
      '[data-section="chart-step-dot"]',
    );
    fireEvent.mouseEnter(dot!);
    expect(
      container.querySelector(
        '[data-section="chart-step-tooltip"]',
      ),
    ).toBeNull();
  });

  it('mirrors data-hovered on hovered dot', () => {
    const { container } = render(<ChartStep series={series} />);
    const dots = container.querySelectorAll(
      '[data-section="chart-step-dot"]',
    );
    fireEvent.mouseEnter(dots[3]!);
    expect(dots[3]?.getAttribute('data-hovered')).toBe('true');
    expect(dots[0]?.getAttribute('data-hovered')).toBe('false');
  });

  it('uses formatX + formatY in tooltip + labels', () => {
    const { container } = render(
      <ChartStep
        series={series}
        formatX={(v) => `<${v}>`}
        formatY={(v) => `${v}u`}
      />,
    );
    const tickLabel = container.querySelector(
      '[data-section="chart-step-tick-label"]',
    );
    expect(tickLabel?.textContent).toMatch(/u$/);
    const xLabel = container.querySelector(
      '[data-section="chart-step-xlabel"]',
    );
    expect(xLabel?.textContent).toBe('<Mon>');
    const dot = container.querySelector(
      '[data-section="chart-step-dot"]',
    );
    fireEvent.mouseEnter(dot!);
    expect(
      container.querySelector(
        '[data-section="chart-step-tooltip-x"]',
      )?.textContent,
    ).toContain('<Mon>');
  });

  it('invokes onPointClick with series + point + index + seriesIndex', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ChartStep series={series} onPointClick={onClick} />,
    );
    const dot = container.querySelector(
      '[data-section="chart-step-dot"][data-series-id="b"][data-point-index="3"]',
    );
    fireEvent.click(dot!);
    expect(onClick).toHaveBeenCalledTimes(1);
    const arg = onClick.mock.calls[0]?.[0];
    expect(arg?.series?.id).toBe('b');
    expect(arg?.point?.x).toBe('Thu');
    expect(arg?.point?.y).toBe(35);
    expect(arg?.index).toBe(3);
    expect(arg?.seriesIndex).toBe(1);
  });

  it('exposes role=graphics-symbol + aria-label per dot', () => {
    const { container } = render(<ChartStep series={series} />);
    const dot = container.querySelector(
      '[data-section="chart-step-dot"]',
    );
    expect(dot?.getAttribute('role')).toBe('graphics-symbol');
    expect(dot?.getAttribute('aria-label')).toContain('A');
    expect(dot?.getAttribute('aria-label')).toContain('Mon');
  });

  it('mirrors animate flag on the root', () => {
    const { container, rerender } = render(
      <ChartStep series={series} />,
    );
    expect(
      container
        .querySelector('[data-section="chart-step"]')
        ?.getAttribute('data-animate'),
    ).toBe('true');
    rerender(<ChartStep series={series} animate={false} />);
    expect(
      container
        .querySelector('[data-section="chart-step"]')
        ?.getAttribute('data-animate'),
    ).toBe('false');
  });

  it('mirrors size on the svg', () => {
    const { container } = render(
      <ChartStep series={series} width={800} height={400} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-step-svg"]',
    );
    expect(svg?.getAttribute('width')).toBe('800');
    expect(svg?.getAttribute('height')).toBe('400');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 800 400');
  });

  it('renders auto-generated ARIA description by default', () => {
    const { container } = render(<ChartStep series={series} />);
    const desc = container.querySelector(
      '[data-section="chart-step-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Step chart with 2 series');
  });

  it('honours ariaDescription override', () => {
    const { container } = render(
      <ChartStep series={series} ariaDescription="custom" />,
    );
    const desc = container.querySelector(
      '[data-section="chart-step-aria-desc"]',
    );
    expect(desc?.textContent).toBe('custom');
  });

  it('handles empty series without crashing', () => {
    const { container } = render(<ChartStep series={[]} />);
    expect(
      container.querySelector('[data-section="chart-step"]'),
    ).not.toBeNull();
    expect(
      container.querySelectorAll(
        '[data-section="chart-step-line"]',
      ).length,
    ).toBe(0);
  });

  it('forwards ref to the root region', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartStep ref={ref} series={series} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-step',
    );
  });

  it('has a stable displayName', () => {
    expect(ChartStep.displayName).toBe('ChartStep');
  });
});
