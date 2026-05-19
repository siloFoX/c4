import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartWaterfall,
  DEFAULT_CHART_WATERFALL_BAR_GAP,
  DEFAULT_CHART_WATERFALL_HEIGHT,
  DEFAULT_CHART_WATERFALL_NEGATIVE_COLOR,
  DEFAULT_CHART_WATERFALL_PADDING,
  DEFAULT_CHART_WATERFALL_POSITIVE_COLOR,
  DEFAULT_CHART_WATERFALL_TICK_COUNT,
  DEFAULT_CHART_WATERFALL_TOTAL_COLOR,
  DEFAULT_CHART_WATERFALL_WIDTH,
  computeWaterfallSteps,
  describeWaterfallChart,
  getWaterfallBarColor,
  getWaterfallBounds,
  getWaterfallTicks,
} from './chart-waterfall';
import type { ChartWaterfallBar } from './chart-waterfall';

const bars: ChartWaterfallBar[] = [
  { id: 'start', label: 'Start', value: 100, type: 'total' },
  { id: 'rev', label: 'Revenue', value: 50 },
  { id: 'cost', label: 'Cost', value: -30 },
  { id: 'sub', label: 'Subtotal', value: 120, type: 'total' },
  { id: 'tax', label: 'Tax', value: -20 },
  { id: 'fin', label: 'Final', value: 100, type: 'total' },
];

describe('chart-waterfall pure helpers', () => {
  describe('computeWaterfallSteps', () => {
    it('returns one step per bar', () => {
      const steps = computeWaterfallSteps(bars);
      expect(steps.length).toBe(bars.length);
    });
    it('marks total bars from zero to value', () => {
      const steps = computeWaterfallSteps(bars);
      expect(steps[0]?.isTotal).toBe(true);
      expect(steps[0]?.start).toBe(0);
      expect(steps[0]?.end).toBe(100);
    });
    it('tracks running total across deltas', () => {
      const steps = computeWaterfallSteps(bars);
      // After start=100, +50, -30 -> running = 120
      expect(steps[2]?.end).toBe(120);
    });
    it('total bars reset the running total to their value', () => {
      const steps = computeWaterfallSteps(bars);
      // subtotal bar declared value 120
      expect(steps[3]?.start).toBe(0);
      expect(steps[3]?.end).toBe(120);
      // subsequent tax delta starts from 120, ends at 100
      expect(steps[4]?.start).toBe(120);
      expect(steps[4]?.end).toBe(100);
    });
    it('delta defaults to 0 for non-finite values', () => {
      const steps = computeWaterfallSteps([
        { id: 'a', label: 'a', value: 50, type: 'total' },
        { id: 'b', label: 'b', value: Number.NaN },
      ]);
      expect(steps[1]?.delta).toBe(0);
      expect(steps[1]?.end).toBe(50);
    });
    it('total bars fall back to running total when value is non-finite', () => {
      const steps = computeWaterfallSteps([
        { id: 'a', label: 'a', value: 50, type: 'total' },
        { id: 'b', label: 'b', value: 25 },
        { id: 'c', label: 'c', value: Number.NaN, type: 'total' },
      ]);
      expect(steps[2]?.end).toBe(75);
    });
    it('handles empty input', () => {
      expect(computeWaterfallSteps([])).toEqual([]);
    });
  });

  describe('getWaterfallBounds', () => {
    it('returns chart-wide min/max', () => {
      const steps = computeWaterfallSteps(bars);
      const b = getWaterfallBounds(steps);
      expect(b.min).toBe(0);
      expect(b.max).toBe(150);
    });
    it('falls back to (0, 1) when no finite bar is present', () => {
      const b = getWaterfallBounds([]);
      expect(b.min).toBe(0);
      expect(b.max).toBe(1);
    });
    it('expands collapsed (min == max) range', () => {
      const steps = computeWaterfallSteps([
        { id: 'a', label: 'a', value: 0, type: 'total' },
      ]);
      const b = getWaterfallBounds(steps);
      expect(b.max).toBe(1);
    });
    it('handles negative-only deltas', () => {
      const steps = computeWaterfallSteps([
        { id: 'a', label: 'a', value: 100, type: 'total' },
        { id: 'b', label: 'b', value: -200 },
      ]);
      const b = getWaterfallBounds(steps);
      expect(b.min).toBe(-100);
      expect(b.max).toBe(100);
    });
  });

  describe('getWaterfallBarColor', () => {
    it('uses per-bar colour when supplied', () => {
      const steps = computeWaterfallSteps([
        {
          id: 'a',
          label: 'a',
          value: 10,
          color: '#ff00aa',
        },
      ]);
      expect(
        getWaterfallBarColor(
          steps[0]!,
          'p',
          'n',
          't',
        ),
      ).toBe('#ff00aa');
    });
    it('total bars take the total colour', () => {
      const steps = computeWaterfallSteps([
        { id: 'a', label: 'a', value: 50, type: 'total' },
      ]);
      expect(
        getWaterfallBarColor(steps[0]!, 'p', 'n', 't'),
      ).toBe('t');
    });
    it('positive deltas take the positive colour', () => {
      const steps = computeWaterfallSteps([
        { id: 'a', label: 'a', value: 50 },
      ]);
      expect(
        getWaterfallBarColor(steps[0]!, 'p', 'n', 't'),
      ).toBe('p');
    });
    it('negative deltas take the negative colour', () => {
      const steps = computeWaterfallSteps([
        { id: 'a', label: 'a', value: -50 },
      ]);
      expect(
        getWaterfallBarColor(steps[0]!, 'p', 'n', 't'),
      ).toBe('n');
    });
    it('zero delta takes the total (neutral) colour', () => {
      const steps = computeWaterfallSteps([
        { id: 'a', label: 'a', value: 0 },
      ]);
      expect(
        getWaterfallBarColor(steps[0]!, 'p', 'n', 't'),
      ).toBe('t');
    });
  });

  describe('getWaterfallTicks', () => {
    it('emits evenly-spaced ticks', () => {
      expect(getWaterfallTicks(0, 100, 5)).toEqual([
        0, 25, 50, 75, 100,
      ]);
    });
    it('defaults to 5 ticks', () => {
      expect(getWaterfallTicks(0, 100).length).toBe(
        DEFAULT_CHART_WATERFALL_TICK_COUNT,
      );
    });
    it('returns [min] when range is collapsed', () => {
      expect(getWaterfallTicks(50, 50)).toEqual([50]);
      expect(getWaterfallTicks(60, 40)).toEqual([60]);
    });
    it('handles negative ranges', () => {
      const t = getWaterfallTicks(-100, 100, 3);
      expect(t).toEqual([-100, 0, 100]);
    });
    it('clamps minimum tick count to 2', () => {
      const t = getWaterfallTicks(0, 100, 1);
      expect(t).toEqual([0, 100]);
    });
  });

  describe('describeWaterfallChart', () => {
    it('returns "No data" for empty bars', () => {
      expect(describeWaterfallChart([])).toBe('No data');
    });
    it('summarises totals + deltas', () => {
      const text = describeWaterfallChart(bars);
      expect(text).toContain('6 bars');
      expect(text).toContain('Start total 100');
      expect(text).toContain('Revenue +50');
      expect(text).toContain('Cost -30');
    });
    it('honours formatValue', () => {
      const text = describeWaterfallChart(
        bars,
        (v) => `$${v}`,
      );
      expect(text).toContain('$100');
      expect(text).toContain('+$50');
    });
  });

  it('exports default constants', () => {
    expect(DEFAULT_CHART_WATERFALL_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_WATERFALL_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_WATERFALL_PADDING).toBeGreaterThan(0);
    expect(DEFAULT_CHART_WATERFALL_TICK_COUNT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_WATERFALL_POSITIVE_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_WATERFALL_NEGATIVE_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_WATERFALL_TOTAL_COLOR).toMatch(/^#/);
    expect(
      DEFAULT_CHART_WATERFALL_BAR_GAP,
    ).toBeGreaterThanOrEqual(0);
  });
});

describe('<ChartWaterfall />', () => {
  it('renders a region with role + aria-label', () => {
    render(<ChartWaterfall bars={bars} />);
    const root = screen.getByRole('region', {
      name: 'Waterfall chart',
    });
    expect(root).toBeInTheDocument();
    expect(root).toHaveAttribute(
      'data-section',
      'chart-waterfall',
    );
    expect(root).toHaveAttribute('data-bar-count', '6');
  });

  it('renders a custom aria-label', () => {
    render(<ChartWaterfall bars={bars} ariaLabel="P&L" />);
    expect(
      screen.getByRole('region', { name: 'P&L' }),
    ).toBeInTheDocument();
  });

  it('renders one rect per bar', () => {
    const { container } = render(<ChartWaterfall bars={bars} />);
    const rects = container.querySelectorAll(
      '[data-section="chart-waterfall-rect"]',
    );
    expect(rects.length).toBe(bars.length);
  });

  it('mirrors bar metadata on each bar group', () => {
    const { container } = render(<ChartWaterfall bars={bars} />);
    const startBar = container.querySelector(
      '[data-section="chart-waterfall-bar"][data-bar-id="start"]',
    );
    expect(startBar?.getAttribute('data-bar-type')).toBe(
      'total',
    );
    expect(startBar?.getAttribute('data-bar-end')).toBe('100');
    const rev = container.querySelector(
      '[data-section="chart-waterfall-bar"][data-bar-id="rev"]',
    );
    expect(rev?.getAttribute('data-bar-direction')).toBe(
      'positive',
    );
    expect(rev?.getAttribute('data-bar-delta')).toBe('50');
    const cost = container.querySelector(
      '[data-section="chart-waterfall-bar"][data-bar-id="cost"]',
    );
    expect(cost?.getAttribute('data-bar-direction')).toBe(
      'negative',
    );
  });

  it('renders connector lines between consecutive bars by default', () => {
    const { container } = render(<ChartWaterfall bars={bars} />);
    const conns = container.querySelectorAll(
      '[data-section="chart-waterfall-connector"]',
    );
    expect(conns.length).toBe(bars.length - 1);
  });

  it('suppresses connectors when showConnectors=false', () => {
    const { container } = render(
      <ChartWaterfall bars={bars} showConnectors={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-waterfall-connector"]',
      ),
    ).toBeNull();
  });

  it('renders labels by default', () => {
    const { container } = render(<ChartWaterfall bars={bars} />);
    const labels = container.querySelectorAll(
      '[data-section="chart-waterfall-label"]',
    );
    expect(labels.length).toBe(bars.length);
    expect(labels[0]?.textContent).toBe('Start');
  });

  it('suppresses labels when showLabels=false', () => {
    const { container } = render(
      <ChartWaterfall bars={bars} showLabels={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-waterfall-label"]',
      ),
    ).toBeNull();
  });

  it('renders values + sign for deltas', () => {
    const { container } = render(<ChartWaterfall bars={bars} />);
    const values = container.querySelectorAll(
      '[data-section="chart-waterfall-value"]',
    );
    // start is total -> '100'; revenue is +50; cost is -30
    expect(values[0]?.textContent).toBe('100');
    expect(values[1]?.textContent).toBe('+50');
    expect(values[2]?.textContent).toBe('-30');
  });

  it('suppresses values when showValues=false', () => {
    const { container } = render(
      <ChartWaterfall bars={bars} showValues={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-waterfall-value"]',
      ),
    ).toBeNull();
  });

  it('renders axis ticks by default', () => {
    const { container } = render(<ChartWaterfall bars={bars} />);
    const ticks = container.querySelectorAll(
      '[data-section="chart-waterfall-tick"]',
    );
    expect(ticks.length).toBeGreaterThan(0);
  });

  it('suppresses ticks when showAxisTicks=false', () => {
    const { container } = render(
      <ChartWaterfall bars={bars} showAxisTicks={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-waterfall-tick"]',
      ),
    ).toBeNull();
  });

  it('renders zero line when range straddles zero', () => {
    const { container } = render(
      <ChartWaterfall
        bars={[
          { id: 'a', label: 'a', value: 100, type: 'total' },
          { id: 'b', label: 'b', value: -200 },
        ]}
      />,
    );
    const zero = container.querySelector(
      '[data-section="chart-waterfall-zero-line"]',
    );
    expect(zero).not.toBeNull();
  });

  it('omits zero line when range does not straddle zero', () => {
    const { container } = render(<ChartWaterfall bars={bars} />);
    expect(
      container.querySelector(
        '[data-section="chart-waterfall-zero-line"]',
      ),
    ).toBeNull();
  });

  it('shows tooltip on bar hover', () => {
    const { container } = render(<ChartWaterfall bars={bars} />);
    const rev = container.querySelector(
      '[data-section="chart-waterfall-rect"][data-bar-id="rev"]',
    );
    fireEvent.mouseEnter(rev!);
    const tip = container.querySelector(
      '[data-section="chart-waterfall-tooltip"]',
    );
    expect(tip).not.toBeNull();
    const label = container.querySelector(
      '[data-section="chart-waterfall-tooltip-label"]',
    );
    expect(label?.textContent).toBe('Revenue');
  });

  it('shows running total in tooltip for deltas', () => {
    const { container } = render(<ChartWaterfall bars={bars} />);
    const cost = container.querySelector(
      '[data-section="chart-waterfall-rect"][data-bar-id="cost"]',
    );
    fireEvent.mouseEnter(cost!);
    const running = container.querySelector(
      '[data-section="chart-waterfall-tooltip-running"]',
    );
    expect(running?.textContent).toContain('total: 120');
  });

  it('omits running total in tooltip for total bars', () => {
    const { container } = render(<ChartWaterfall bars={bars} />);
    const start = container.querySelector(
      '[data-section="chart-waterfall-rect"][data-bar-id="start"]',
    );
    fireEvent.mouseEnter(start!);
    expect(
      container.querySelector(
        '[data-section="chart-waterfall-tooltip-running"]',
      ),
    ).toBeNull();
  });

  it('hides tooltip on mouse-leave', () => {
    const { container } = render(<ChartWaterfall bars={bars} />);
    const rev = container.querySelector(
      '[data-section="chart-waterfall-rect"][data-bar-id="rev"]',
    );
    fireEvent.mouseEnter(rev!);
    fireEvent.mouseLeave(rev!);
    expect(
      container.querySelector(
        '[data-section="chart-waterfall-tooltip"]',
      ),
    ).toBeNull();
  });

  it('suppresses tooltip when showTooltip=false', () => {
    const { container } = render(
      <ChartWaterfall bars={bars} showTooltip={false} />,
    );
    const rev = container.querySelector(
      '[data-section="chart-waterfall-rect"][data-bar-id="rev"]',
    );
    fireEvent.mouseEnter(rev!);
    expect(
      container.querySelector(
        '[data-section="chart-waterfall-tooltip"]',
      ),
    ).toBeNull();
  });

  it('uses formatValue across labels + tooltip + ticks', () => {
    const { container } = render(
      <ChartWaterfall
        bars={bars}
        formatValue={(v) => `$${v}`}
      />,
    );
    const values = container.querySelectorAll(
      '[data-section="chart-waterfall-value"]',
    );
    expect(values[0]?.textContent).toBe('$100');
    expect(values[1]?.textContent).toBe('+$50');
    const rev = container.querySelector(
      '[data-section="chart-waterfall-rect"][data-bar-id="rev"]',
    );
    fireEvent.mouseEnter(rev!);
    const tipDelta = container.querySelector(
      '[data-section="chart-waterfall-tooltip-delta"]',
    );
    expect(tipDelta?.textContent).toBe('+$50');
  });

  it('honours custom colours', () => {
    const { container } = render(
      <ChartWaterfall
        bars={bars}
        positiveColor="#0000ff"
        negativeColor="#ffff00"
        totalColor="#000000"
      />,
    );
    const rev = container.querySelector(
      '[data-section="chart-waterfall-bar"][data-bar-id="rev"]',
    );
    expect(rev?.getAttribute('data-bar-color')).toBe('#0000ff');
    const cost = container.querySelector(
      '[data-section="chart-waterfall-bar"][data-bar-id="cost"]',
    );
    expect(cost?.getAttribute('data-bar-color')).toBe('#ffff00');
    const start = container.querySelector(
      '[data-section="chart-waterfall-bar"][data-bar-id="start"]',
    );
    expect(start?.getAttribute('data-bar-color')).toBe(
      '#000000',
    );
  });

  it('honours per-bar colour override', () => {
    const colored: ChartWaterfallBar[] = bars.map((b) =>
      b.id === 'rev' ? { ...b, color: '#ff00aa' } : b,
    );
    const { container } = render(
      <ChartWaterfall bars={colored} />,
    );
    const rev = container.querySelector(
      '[data-section="chart-waterfall-bar"][data-bar-id="rev"]',
    );
    expect(rev?.getAttribute('data-bar-color')).toBe('#ff00aa');
  });

  it('invokes onBarClick with bar + index + start + end', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ChartWaterfall bars={bars} onBarClick={onClick} />,
    );
    const cost = container.querySelector(
      '[data-section="chart-waterfall-rect"][data-bar-id="cost"]',
    );
    fireEvent.click(cost!);
    expect(onClick).toHaveBeenCalledTimes(1);
    const arg = onClick.mock.calls[0]?.[0];
    expect(arg?.bar?.id).toBe('cost');
    expect(arg?.index).toBe(2);
    expect(arg?.start).toBe(150);
    expect(arg?.end).toBe(120);
  });

  it('exposes role=graphics-symbol + aria-label per bar', () => {
    const { container } = render(<ChartWaterfall bars={bars} />);
    const rect = container.querySelector(
      '[data-section="chart-waterfall-rect"]',
    );
    expect(rect?.getAttribute('role')).toBe('graphics-symbol');
    expect(rect?.getAttribute('aria-label')).toContain('Start');
  });

  it('mirrors animate flag on the root', () => {
    const { container, rerender } = render(
      <ChartWaterfall bars={bars} />,
    );
    expect(
      container
        .querySelector('[data-section="chart-waterfall"]')
        ?.getAttribute('data-animate'),
    ).toBe('true');
    rerender(<ChartWaterfall bars={bars} animate={false} />);
    expect(
      container
        .querySelector('[data-section="chart-waterfall"]')
        ?.getAttribute('data-animate'),
    ).toBe('false');
  });

  it('mirrors size on the svg', () => {
    const { container } = render(
      <ChartWaterfall bars={bars} width={800} height={400} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-waterfall-svg"]',
    );
    expect(svg?.getAttribute('width')).toBe('800');
    expect(svg?.getAttribute('height')).toBe('400');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 800 400');
  });

  it('renders auto-generated ARIA description by default', () => {
    const { container } = render(<ChartWaterfall bars={bars} />);
    const desc = container.querySelector(
      '[data-section="chart-waterfall-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Waterfall with 6 bars');
  });

  it('honours ariaDescription override', () => {
    const { container } = render(
      <ChartWaterfall bars={bars} ariaDescription="custom" />,
    );
    const desc = container.querySelector(
      '[data-section="chart-waterfall-aria-desc"]',
    );
    expect(desc?.textContent).toBe('custom');
  });

  it('handles empty bars without crashing', () => {
    const { container } = render(<ChartWaterfall bars={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-waterfall"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelectorAll(
        '[data-section="chart-waterfall-rect"]',
      ).length,
    ).toBe(0);
  });

  it('forwards ref to the root region', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartWaterfall ref={ref} bars={bars} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-waterfall',
    );
  });

  it('has a stable displayName', () => {
    expect(ChartWaterfall.displayName).toBe('ChartWaterfall');
  });
});
