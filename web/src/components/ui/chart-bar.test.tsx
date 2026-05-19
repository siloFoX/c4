import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { createRef } from 'react';
import {
  ChartBar,
  DEFAULT_CHART_BAR_HEIGHT,
  DEFAULT_CHART_BAR_PADDING,
  DEFAULT_CHART_BAR_PALETTE,
  DEFAULT_CHART_BAR_TICK_COUNT,
  DEFAULT_CHART_BAR_WIDTH,
  formatChartBarTick,
  getChartBarMax,
  getChartBarScale,
  getChartBarTicks,
  getDefaultBarColor,
} from './chart-bar';
import type { ChartBarSeries } from './chart-bar';

afterEach(() => {
  cleanup();
});

const DATA: ChartBarSeries[] = [
  { id: 'a', label: 'A', value: 10 },
  { id: 'b', label: 'B', value: 30 },
  { id: 'c', label: 'C', value: 20 },
];

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

describe('getDefaultBarColor', () => {
  it('returns palette[0] for invalid index', () => {
    expect(getDefaultBarColor(-1)).toBe(
      DEFAULT_CHART_BAR_PALETTE[0],
    );
    expect(getDefaultBarColor(Number.NaN)).toBe(
      DEFAULT_CHART_BAR_PALETTE[0],
    );
  });
  it('cycles through the palette', () => {
    for (let i = 0; i < DEFAULT_CHART_BAR_PALETTE.length; i += 1) {
      expect(getDefaultBarColor(i)).toBe(
        DEFAULT_CHART_BAR_PALETTE[i],
      );
    }
    expect(getDefaultBarColor(DEFAULT_CHART_BAR_PALETTE.length)).toBe(
      DEFAULT_CHART_BAR_PALETTE[0],
    );
  });
});

describe('getChartBarMax', () => {
  it('returns highest positive value', () => {
    expect(getChartBarMax(DATA)).toBe(30);
  });
  it('floors at 1 when no positive values', () => {
    expect(getChartBarMax([])).toBe(1);
    expect(
      getChartBarMax([
        { id: 'x', label: 'x', value: 0 },
        { id: 'y', label: 'y', value: -5 },
      ]),
    ).toBe(1);
  });
  it('override wins when positive', () => {
    expect(getChartBarMax(DATA, 100)).toBe(100);
  });
  it('ignores non-finite values', () => {
    expect(
      getChartBarMax([
        { id: 'x', label: 'x', value: Number.NaN },
        { id: 'y', label: 'y', value: 5 },
      ]),
    ).toBe(5);
  });
});

describe('getChartBarScale', () => {
  it('linear scale mapping', () => {
    const scale = getChartBarScale(100, 200);
    expect(scale(0)).toBe(0);
    expect(scale(50)).toBe(100);
    expect(scale(100)).toBe(200);
  });
  it('returns 0 for non-finite or negative input', () => {
    const scale = getChartBarScale(100, 200);
    expect(scale(Number.NaN)).toBe(0);
    expect(scale(-5)).toBe(0);
  });
  it('safe defaults for zero / negative max + length', () => {
    const scale = getChartBarScale(0, 0);
    expect(scale(50)).toBe(50);
  });
});

describe('formatChartBarTick', () => {
  it('integer pass-through', () => {
    expect(formatChartBarTick(7)).toBe('7');
  });
  it('trims float trailing zeros', () => {
    expect(formatChartBarTick(7.5)).toBe('7.5');
    expect(formatChartBarTick(1 / 3)).toBe('0.33');
  });
  it('custom formatter wins', () => {
    expect(formatChartBarTick(1234, (n) => `$${n}`)).toBe('$1234');
  });
  it('NaN -> 0', () => {
    expect(formatChartBarTick(Number.NaN)).toBe('0');
  });
});

describe('getChartBarTicks', () => {
  it('returns count+1 evenly-spaced ticks', () => {
    expect(getChartBarTicks(100, 4)).toEqual([
      0, 25, 50, 75, 100,
    ]);
  });
  it('default count when omitted', () => {
    expect(getChartBarTicks(100).length).toBe(
      DEFAULT_CHART_BAR_TICK_COUNT + 1,
    );
  });
  it('safe for max=0 / negative count', () => {
    expect(getChartBarTicks(0, 4)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(getChartBarTicks(100, -1)).toEqual([0, 100]);
  });
});

describe('Constants', () => {
  it('default width / height / padding', () => {
    expect(DEFAULT_CHART_BAR_WIDTH).toBe(480);
    expect(DEFAULT_CHART_BAR_HEIGHT).toBe(280);
    expect(DEFAULT_CHART_BAR_PADDING).toBe(32);
  });
  it('default tick count = 4', () => {
    expect(DEFAULT_CHART_BAR_TICK_COUNT).toBe(4);
  });
});

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

describe('ChartBar component', () => {
  it('renders a region with default aria-label', () => {
    render(<ChartBar data={DATA} />);
    expect(
      screen.getByRole('region', { name: 'Bar chart' }),
    ).toBeInTheDocument();
  });

  it('honors custom ariaLabel', () => {
    render(
      <ChartBar
        data={DATA}
        ariaLabel="Daily sales"
      />,
    );
    expect(
      screen.getByRole('region', { name: 'Daily sales' }),
    ).toBeInTheDocument();
  });

  it('renders one bar per series', () => {
    const { container } = render(<ChartBar data={DATA} />);
    expect(
      container.querySelectorAll(
        '[data-section="chart-bar-bar"]',
      ).length,
    ).toBe(3);
  });

  it('default orientation is vertical', () => {
    render(<ChartBar data={DATA} />);
    expect(screen.getByRole('region')).toHaveAttribute(
      'data-orientation',
      'vertical',
    );
  });

  it('horizontal orientation reflects on data-orientation', () => {
    render(<ChartBar data={DATA} orientation="horizontal" />);
    expect(screen.getByRole('region')).toHaveAttribute(
      'data-orientation',
      'horizontal',
    );
  });

  it('each bar exposes role=graphics-symbol with aria-label', () => {
    const { container } = render(<ChartBar data={DATA} />);
    const bars = container.querySelectorAll(
      '[data-section="chart-bar-bar"]',
    );
    expect(bars[0]).toHaveAttribute(
      'role',
      'graphics-symbol',
    );
    expect(bars[0]).toHaveAttribute(
      'aria-label',
      'A: 10',
    );
    expect(bars[1]).toHaveAttribute(
      'aria-label',
      'B: 30',
    );
  });

  it('per-bar data-bar-id mirrors the series id', () => {
    const { container } = render(<ChartBar data={DATA} />);
    const bars = container.querySelectorAll(
      '[data-section="chart-bar-bar"]',
    );
    expect(bars[0]).toHaveAttribute('data-bar-id', 'a');
    expect(bars[2]).toHaveAttribute('data-bar-id', 'c');
  });

  it('rect height (vertical) scales with the value', () => {
    const { container } = render(
      <ChartBar
        data={[
          { id: 'a', label: 'A', value: 10 },
          { id: 'b', label: 'B', value: 30 },
        ]}
        height={300}
        padding={20}
      />,
    );
    const rects = container.querySelectorAll(
      '[data-section="chart-bar-rect"]',
    );
    const aHeight = Number(rects[0]?.getAttribute('height') ?? '0');
    const bHeight = Number(rects[1]?.getAttribute('height') ?? '0');
    expect(bHeight).toBeGreaterThan(aHeight);
  });

  it('rect width (horizontal) scales with the value', () => {
    const { container } = render(
      <ChartBar
        data={[
          { id: 'a', label: 'A', value: 10 },
          { id: 'b', label: 'B', value: 30 },
        ]}
        orientation="horizontal"
        width={400}
        padding={20}
      />,
    );
    const rects = container.querySelectorAll(
      '[data-section="chart-bar-rect"]',
    );
    const aWidth = Number(rects[0]?.getAttribute('width') ?? '0');
    const bWidth = Number(rects[1]?.getAttribute('width') ?? '0');
    expect(bWidth).toBeGreaterThan(aWidth);
  });

  it('per-series color override applies', () => {
    const { container } = render(
      <ChartBar
        data={[
          {
            id: 'a',
            label: 'A',
            value: 10,
            color: '#ff00ff',
          },
        ]}
      />,
    );
    const rect = container.querySelector(
      '[data-section="chart-bar-rect"]',
    );
    expect(rect).toHaveAttribute('fill', '#ff00ff');
  });

  it('default colour from palette when no per-series color', () => {
    const { container } = render(<ChartBar data={DATA} />);
    const rects = container.querySelectorAll(
      '[data-section="chart-bar-rect"]',
    );
    expect(rects[0]).toHaveAttribute(
      'fill',
      DEFAULT_CHART_BAR_PALETTE[0],
    );
    expect(rects[1]).toHaveAttribute(
      'fill',
      DEFAULT_CHART_BAR_PALETTE[1],
    );
  });

  it('grid renders 5 tick lines by default', () => {
    const { container } = render(<ChartBar data={DATA} />);
    expect(
      container.querySelectorAll(
        '[data-section="chart-bar-grid"]',
      ).length,
    ).toBe(DEFAULT_CHART_BAR_TICK_COUNT + 1);
  });

  it('showGrid=false hides every grid line', () => {
    const { container } = render(
      <ChartBar data={DATA} showGrid={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-bar-grid"]'),
    ).toBeNull();
  });

  it('tick label text reflects the value', () => {
    const { container } = render(
      <ChartBar
        data={[{ id: 'a', label: 'A', value: 100 }]}
        tickCount={4}
      />,
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-bar-tick-label"]',
    );
    expect(labels[0]?.textContent).toBe('0');
    expect(labels[4]?.textContent).toBe('100');
  });

  it('formatValue override formats tick labels', () => {
    const { container } = render(
      <ChartBar
        data={[{ id: 'a', label: 'A', value: 1000 }]}
        tickCount={2}
        formatValue={(n) => `$${n / 1000}k`}
      />,
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-bar-tick-label"]',
    );
    expect(labels[0]?.textContent).toBe('$0k');
    expect(labels[2]?.textContent).toBe('$1k');
  });

  it('hovering a bar shows the tooltip with label + value', () => {
    const { container } = render(<ChartBar data={DATA} />);
    const bar = container.querySelector(
      '[data-section="chart-bar-bar"][data-bar-id="b"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(bar);
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toBeInTheDocument();
    expect(
      tooltip.querySelector(
        '[data-section="chart-bar-tooltip-label"]',
      )?.textContent,
    ).toBe('B');
    expect(
      tooltip.querySelector(
        '[data-section="chart-bar-tooltip-value"]',
      )?.textContent,
    ).toBe('30');
  });

  it('mouse leave hides the tooltip', () => {
    const { container } = render(<ChartBar data={DATA} />);
    const bar = container.querySelector(
      '[data-section="chart-bar-bar"][data-bar-id="b"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(bar);
    fireEvent.mouseLeave(bar);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('showTooltip=false suppresses the tooltip', () => {
    const { container } = render(
      <ChartBar data={DATA} showTooltip={false} />,
    );
    const bar = container.querySelector(
      '[data-section="chart-bar-bar"][data-bar-id="b"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(bar);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('focus opens the tooltip (keyboard accessibility)', () => {
    const { container } = render(<ChartBar data={DATA} />);
    const bar = container.querySelector(
      '[data-section="chart-bar-bar"][data-bar-id="b"]',
    ) as HTMLElement;
    fireEvent.focus(bar);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('onBarClick fires with the series', () => {
    const onBarClick = vi.fn();
    const { container } = render(
      <ChartBar data={DATA} onBarClick={onBarClick} />,
    );
    const bar = container.querySelector(
      '[data-section="chart-bar-bar"][data-bar-id="c"]',
    ) as HTMLElement;
    fireEvent.click(bar);
    expect(onBarClick).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c' }),
    );
  });

  it('axis labels render when supplied', () => {
    render(
      <ChartBar
        data={DATA}
        axisLabel={{ x: 'Category', y: 'Revenue' }}
      />,
    );
    expect(screen.getByText('Category')).toBeInTheDocument();
    expect(screen.getByText('Revenue')).toBeInTheDocument();
  });

  it('axis lines render', () => {
    const { container } = render(<ChartBar data={DATA} />);
    expect(
      container.querySelector(
        '[data-section="chart-bar-axis-x"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '[data-section="chart-bar-axis-y"]',
      ),
    ).toBeInTheDocument();
  });

  it('empty data renders zero bars without crashing', () => {
    const { container } = render(<ChartBar data={[]} />);
    expect(
      container.querySelectorAll(
        '[data-section="chart-bar-bar"]',
      ).length,
    ).toBe(0);
  });

  it('animate=false swaps data-animate to false', () => {
    render(<ChartBar data={DATA} animate={false} />);
    expect(screen.getByRole('region')).toHaveAttribute(
      'data-animate',
      'false',
    );
  });

  it('per-bar data-hovered mirrors hover state', () => {
    const { container } = render(<ChartBar data={DATA} />);
    const bar = container.querySelector(
      '[data-section="chart-bar-bar"][data-bar-id="a"]',
    ) as HTMLElement;
    expect(bar).toHaveAttribute('data-hovered', 'false');
    fireEvent.mouseEnter(bar);
    expect(bar).toHaveAttribute('data-hovered', 'true');
  });

  it('exposes a stable displayName', () => {
    expect(ChartBar.displayName).toBe('ChartBar');
  });

  it('forwards ref to the root region', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartBar ref={ref} data={DATA} />);
    expect(ref.current?.getAttribute('role')).toBe('region');
  });

  it('root data-bar-count mirrors the series length', () => {
    render(<ChartBar data={DATA} />);
    expect(screen.getByRole('region')).toHaveAttribute(
      'data-bar-count',
      '3',
    );
  });

  it('svg viewBox respects width + height props', () => {
    const { container } = render(
      <ChartBar
        data={DATA}
        width={400}
        height={200}
      />,
    );
    const svg = container.querySelector(
      '[data-section="chart-bar-svg"]',
    );
    expect(svg).toHaveAttribute('viewBox', '0 0 400 200');
  });
});
