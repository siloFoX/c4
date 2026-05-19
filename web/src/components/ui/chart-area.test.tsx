import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { createRef } from 'react';
import {
  ChartArea,
  DEFAULT_CHART_AREA_FILL_OPACITY,
  DEFAULT_CHART_AREA_HEIGHT,
  DEFAULT_CHART_AREA_MODE,
  DEFAULT_CHART_AREA_PADDING,
  DEFAULT_CHART_AREA_TICK_COUNT,
  DEFAULT_CHART_AREA_WIDTH,
  buildAreaPath,
  buildAreaStack,
  findNearestAreaIndex,
  getChartAreaBounds,
} from './chart-area';
import type { ChartAreaSeries } from './chart-area';

afterEach(() => {
  cleanup();
});

const SERIES_A: ChartAreaSeries = {
  id: 'a',
  label: 'A',
  data: [
    { x: 0, y: 1 },
    { x: 1, y: 3 },
    { x: 2, y: 2 },
  ],
};
const SERIES_B: ChartAreaSeries = {
  id: 'b',
  label: 'B',
  data: [
    { x: 0, y: 2 },
    { x: 1, y: 1 },
    { x: 2, y: 4 },
  ],
};

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

describe('buildAreaStack', () => {
  it('returns empty for empty input', () => {
    expect(buildAreaStack([], 'overlaid')).toEqual([]);
  });
  it('overlaid mode: every series has y0=0', () => {
    const out = buildAreaStack([SERIES_A], 'overlaid');
    expect(out[0]).toEqual([
      { x: 0, y0: 0, y1: 1, value: 1 },
      { x: 1, y0: 0, y1: 3, value: 3 },
      { x: 2, y0: 0, y1: 2, value: 2 },
    ]);
  });
  it('overlaid mode: NaN y collapses to 0', () => {
    const out = buildAreaStack(
      [
        {
          id: 'n',
          label: 'n',
          data: [
            { x: 0, y: Number.NaN },
            { x: 1, y: 5 },
          ],
        },
      ],
      'overlaid',
    );
    expect(out[0]?.[0]?.y1).toBe(0);
    expect(out[0]?.[1]?.y1).toBe(5);
  });
  it('stacked mode: each series cumulates the baseline per x', () => {
    const out = buildAreaStack([SERIES_A, SERIES_B], 'stacked');
    expect(out[0]?.[0]).toEqual({ x: 0, y0: 0, y1: 1, value: 1 });
    expect(out[1]?.[0]).toEqual({ x: 0, y0: 1, y1: 3, value: 2 });
    expect(out[1]?.[2]).toEqual({ x: 2, y0: 2, y1: 6, value: 4 });
  });
  it('stacked mode: negative values clamp to 0 in stack', () => {
    const out = buildAreaStack(
      [
        {
          id: 'n',
          label: 'n',
          data: [
            { x: 0, y: -5 },
            { x: 1, y: 3 },
          ],
        },
      ],
      'stacked',
    );
    expect(out[0]?.[0]?.y1).toBe(0);
    expect(out[0]?.[1]?.y1).toBe(3);
  });
});

describe('getChartAreaBounds', () => {
  it('derives bounds from stack', () => {
    const stack = buildAreaStack([SERIES_A, SERIES_B], 'stacked');
    const b = getChartAreaBounds(stack);
    expect(b.xMin).toBe(0);
    expect(b.xMax).toBe(2);
    expect(b.yMin).toBe(0);
    expect(b.yMax).toBe(6); // stacked top
  });
  it('overlaid bounds use the max y across series', () => {
    const stack = buildAreaStack([SERIES_A, SERIES_B], 'overlaid');
    const b = getChartAreaBounds(stack);
    expect(b.yMax).toBe(4); // overlaid: highest single value
  });
  it('empty stack falls back to (0,1) / (0,1)', () => {
    const b = getChartAreaBounds([]);
    expect(b.xMin).toBe(0);
    expect(b.xMax).toBe(1);
    expect(b.yMax).toBe(1);
  });
  it('xDomain / yDomain overrides win', () => {
    const stack = buildAreaStack([SERIES_A], 'overlaid');
    const b = getChartAreaBounds(stack, [-5, 5], [0, 100]);
    expect(b.xMin).toBe(-5);
    expect(b.xMax).toBe(5);
    expect(b.yMax).toBe(100);
  });
  it('single-x stack expands to xMin+1', () => {
    const b = getChartAreaBounds([
      [{ x: 3, y0: 0, y1: 1, value: 1 }],
    ]);
    expect(b.xMax).toBe(b.xMin + 1);
  });
});

describe('buildAreaPath', () => {
  it('returns empty for empty', () => {
    expect(buildAreaPath([])).toBe('');
  });
  it('single point renders a vertical line + close', () => {
    const p = buildAreaPath([{ x: 10, yTop: 20, yBottom: 50 }]);
    expect(p).toContain('M 10.00 20.00');
    expect(p).toContain('L 10.00 50.00');
    expect(p).toContain('Z');
  });
  it('straight path: top edge L commands + bottom edge L + Z', () => {
    const p = buildAreaPath(
      [
        { x: 0, yTop: 10, yBottom: 50 },
        { x: 10, yTop: 20, yBottom: 50 },
      ],
      false,
    );
    expect(p).toContain('M 0.00 10.00');
    expect(p).toContain('L 10.00 20.00');
    expect(p).toContain('L 10.00 50.00');
    expect(p).toContain('L 0.00 50.00');
    expect(p).toContain('Z');
  });
  it('smooth path emits cubic bezier (C) commands', () => {
    const p = buildAreaPath(
      [
        { x: 0, yTop: 10, yBottom: 50 },
        { x: 10, yTop: 20, yBottom: 50 },
        { x: 20, yTop: 5, yBottom: 50 },
      ],
      true,
    );
    expect(p).toContain('C ');
    expect(p).toContain('Z');
  });
});

describe('findNearestAreaIndex', () => {
  it('returns -1 for empty', () => {
    expect(findNearestAreaIndex([], 0)).toBe(-1);
  });
  it('returns the closest by absolute x', () => {
    const data = [
      { x: 0, y0: 0, y1: 0, value: 0 },
      { x: 5, y0: 0, y1: 0, value: 0 },
      { x: 10, y0: 0, y1: 0, value: 0 },
    ];
    expect(findNearestAreaIndex(data, 4)).toBe(1);
    expect(findNearestAreaIndex(data, 9)).toBe(2);
    expect(findNearestAreaIndex(data, -2)).toBe(0);
  });
});

describe('Constants', () => {
  it('default mode is overlaid', () => {
    expect(DEFAULT_CHART_AREA_MODE).toBe('overlaid');
  });
  it('defaults for layout + fill', () => {
    expect(DEFAULT_CHART_AREA_WIDTH).toBe(520);
    expect(DEFAULT_CHART_AREA_HEIGHT).toBe(280);
    expect(DEFAULT_CHART_AREA_PADDING).toBe(36);
    expect(DEFAULT_CHART_AREA_TICK_COUNT).toBe(4);
    expect(DEFAULT_CHART_AREA_FILL_OPACITY).toBeCloseTo(0.35, 2);
  });
});

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

describe('ChartArea component', () => {
  it('renders a region with default aria-label', () => {
    render(<ChartArea series={[SERIES_A]} />);
    expect(
      screen.getByRole('region', { name: 'Area chart' }),
    ).toBeInTheDocument();
  });

  it('honors custom ariaLabel', () => {
    render(
      <ChartArea
        series={[SERIES_A]}
        ariaLabel="Cumulative revenue"
      />,
    );
    expect(
      screen.getByRole('region', { name: 'Cumulative revenue' }),
    ).toBeInTheDocument();
  });

  it('renders one series group per series', () => {
    const { container } = render(
      <ChartArea series={[SERIES_A, SERIES_B]} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-area-series"]',
      ).length,
    ).toBe(2);
  });

  it('default mode is overlaid; flips to stacked when set', () => {
    const { rerender } = render(
      <ChartArea series={[SERIES_A]} />,
    );
    expect(screen.getByRole('region')).toHaveAttribute(
      'data-mode',
      'overlaid',
    );
    rerender(
      <ChartArea series={[SERIES_A]} mode="stacked" />,
    );
    expect(screen.getByRole('region')).toHaveAttribute(
      'data-mode',
      'stacked',
    );
  });

  it('each series fill path has role=graphics-symbol with aria-label', () => {
    const { container } = render(
      <ChartArea series={[SERIES_A]} />,
    );
    const fill = container.querySelector(
      '[data-section="chart-area-fill"]',
    );
    expect(fill).toHaveAttribute('role', 'graphics-symbol');
    expect(fill).toHaveAttribute('aria-label', 'A');
  });

  it('smooth=false generates a straight area path (L only)', () => {
    const { container } = render(
      <ChartArea series={[SERIES_A]} />,
    );
    const d =
      container
        .querySelector('[data-section="chart-area-fill"]')
        ?.getAttribute('d') ?? '';
    expect(d).toContain('L ');
    expect(d).not.toContain('C ');
  });

  it('smooth=true generates a cubic-bezier area path', () => {
    const { container } = render(
      <ChartArea series={[SERIES_A]} smooth />,
    );
    const d =
      container
        .querySelector('[data-section="chart-area-fill"]')
        ?.getAttribute('d') ?? '';
    expect(d).toContain('C ');
  });

  it('top line renders when showLines=true (default)', () => {
    const { container } = render(
      <ChartArea series={[SERIES_A]} />,
    );
    expect(
      container.querySelector('[data-section="chart-area-line"]'),
    ).toBeInTheDocument();
  });

  it('showLines=false hides top line stroke', () => {
    const { container } = render(
      <ChartArea series={[SERIES_A]} showLines={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-area-line"]'),
    ).toBeNull();
  });

  it('fillOpacity prop applies to the fill', () => {
    const { container } = render(
      <ChartArea series={[SERIES_A]} fillOpacity={0.8} />,
    );
    const fill = container.querySelector(
      '[data-section="chart-area-fill"]',
    );
    expect(fill).toHaveAttribute('fill-opacity', '0.8');
  });

  it('showGrid=false hides grid lines', () => {
    const { container } = render(
      <ChartArea series={[SERIES_A]} showGrid={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-area-grid-y"]',
      ),
    ).toBeNull();
  });

  it('y tick labels reflect bounds', () => {
    const { container } = render(
      <ChartArea
        series={[
          {
            id: 's',
            label: 's',
            data: [
              { x: 0, y: 0 },
              { x: 1, y: 100 },
            ],
          },
        ]}
        tickCount={4}
      />,
    );
    const ticks = container.querySelectorAll(
      '[data-section="chart-area-tick-y"]',
    );
    expect(ticks[0]?.textContent).toBe('0');
    expect(ticks[4]?.textContent).toBe('100');
  });

  it('formatY formats every y tick', () => {
    const { container } = render(
      <ChartArea
        series={[
          {
            id: 's',
            label: 's',
            data: [
              { x: 0, y: 0 },
              { x: 1, y: 1000 },
            ],
          },
        ]}
        tickCount={2}
        formatY={(n) => `${n / 1000}k`}
      />,
    );
    const ticks = container.querySelectorAll(
      '[data-section="chart-area-tick-y"]',
    );
    expect(ticks[0]?.textContent).toBe('0k');
    expect(ticks[2]?.textContent).toBe('1k');
  });

  it('formatX formats every x tick', () => {
    const { container } = render(
      <ChartArea
        series={[
          {
            id: 's',
            label: 's',
            data: [
              { x: 0, y: 0 },
              { x: 10, y: 1 },
            ],
          },
        ]}
        tickCount={2}
        formatX={(n) => `t${n}`}
      />,
    );
    const ticks = container.querySelectorAll(
      '[data-section="chart-area-tick-x"]',
    );
    expect(ticks[0]?.textContent).toBe('t0');
    expect(ticks[2]?.textContent).toBe('t10');
  });

  it('mouse move on the svg shows hover layer + tooltip', () => {
    const { container } = render(
      <ChartArea series={[SERIES_A, SERIES_B]} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-area-svg"]',
    ) as SVGSVGElement;
    Object.defineProperty(svg, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        top: 0,
        left: 0,
        right: 520,
        bottom: 280,
        width: 520,
        height: 280,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });
    fireEvent.mouseMove(svg, { clientX: 260, clientY: 140 });
    expect(
      container.querySelector(
        '[data-section="chart-area-hover-layer"]',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('mouse leave clears the hover layer + tooltip', () => {
    const { container } = render(
      <ChartArea series={[SERIES_A]} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-area-svg"]',
    ) as SVGSVGElement;
    Object.defineProperty(svg, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        top: 0,
        left: 0,
        right: 520,
        bottom: 280,
        width: 520,
        height: 280,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });
    fireEvent.mouseMove(svg, { clientX: 260, clientY: 140 });
    fireEvent.mouseLeave(svg);
    expect(
      container.querySelector(
        '[data-section="chart-area-hover-layer"]',
      ),
    ).toBeNull();
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('showTooltip=false suppresses the tooltip overlay', () => {
    const { container } = render(
      <ChartArea series={[SERIES_A]} showTooltip={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-area-svg"]',
    ) as SVGSVGElement;
    Object.defineProperty(svg, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        top: 0,
        left: 0,
        right: 520,
        bottom: 280,
        width: 520,
        height: 280,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });
    fireEvent.mouseMove(svg, { clientX: 260, clientY: 140 });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('axis title labels render when supplied', () => {
    render(
      <ChartArea
        series={[SERIES_A]}
        axisLabel={{ x: 'Time', y: 'Value' }}
      />,
    );
    expect(screen.getByText('Time')).toBeInTheDocument();
    expect(screen.getByText('Value')).toBeInTheDocument();
  });

  it('per-series color override applies to fill stroke', () => {
    const { container } = render(
      <ChartArea
        series={[
          {
            id: 'a',
            label: 'A',
            data: [{ x: 0, y: 1 }, { x: 1, y: 2 }],
            color: '#abc123',
          },
        ]}
      />,
    );
    const fill = container.querySelector(
      '[data-section="chart-area-fill"]',
    );
    expect(fill).toHaveAttribute('fill', '#abc123');
  });

  it('empty series renders without crashing', () => {
    const { container } = render(<ChartArea series={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-area-series"]',
      ),
    ).toBeNull();
  });

  it('animate=false flips data-animate', () => {
    render(<ChartArea series={[SERIES_A]} animate={false} />);
    expect(screen.getByRole('region')).toHaveAttribute(
      'data-animate',
      'false',
    );
  });

  it('smooth=true reflects on data-smooth', () => {
    render(<ChartArea series={[SERIES_A]} smooth />);
    expect(screen.getByRole('region')).toHaveAttribute(
      'data-smooth',
      'true',
    );
  });

  it('data-series-count mirrors series.length', () => {
    render(<ChartArea series={[SERIES_A, SERIES_B]} />);
    expect(screen.getByRole('region')).toHaveAttribute(
      'data-series-count',
      '2',
    );
  });

  it('forwards ref to the root region', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartArea ref={ref} series={[SERIES_A]} />);
    expect(ref.current?.getAttribute('role')).toBe('region');
  });

  it('exposes a stable displayName', () => {
    expect(ChartArea.displayName).toBe('ChartArea');
  });

  it('svg viewBox respects width + height', () => {
    const { container } = render(
      <ChartArea
        series={[SERIES_A]}
        width={400}
        height={200}
      />,
    );
    const svg = container.querySelector(
      '[data-section="chart-area-svg"]',
    );
    expect(svg).toHaveAttribute('viewBox', '0 0 400 200');
  });
});
