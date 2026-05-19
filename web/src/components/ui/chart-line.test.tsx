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
  ChartLine,
  DEFAULT_CHART_LINE_HEIGHT,
  DEFAULT_CHART_LINE_PADDING,
  DEFAULT_CHART_LINE_TICK_COUNT,
  DEFAULT_CHART_LINE_WIDTH,
  buildLinePath,
  findNearestPointIndex,
  formatChartLineTick,
  getChartLineBounds,
  getChartLineTicks,
  getLinearScale,
} from './chart-line';
import type { ChartLineSeries } from './chart-line';

afterEach(() => {
  cleanup();
});

const SERIES_A: ChartLineSeries = {
  id: 'a',
  label: 'A',
  data: [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
    { x: 2, y: 4 },
    { x: 3, y: 2 },
    { x: 4, y: 5 },
  ],
};
const SERIES_B: ChartLineSeries = {
  id: 'b',
  label: 'B',
  data: [
    { x: 0, y: 3 },
    { x: 1, y: 2 },
    { x: 2, y: null },
    { x: 3, y: 4 },
    { x: 4, y: 3 },
  ],
};

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

describe('getChartLineBounds', () => {
  it('derives bounds from data', () => {
    const b = getChartLineBounds([SERIES_A]);
    expect(b.xMin).toBe(0);
    expect(b.xMax).toBe(4);
    expect(b.yMin).toBe(0);
    expect(b.yMax).toBe(5);
  });
  it('ignores null y values', () => {
    const b = getChartLineBounds([SERIES_B]);
    expect(b.yMin).toBe(2);
    expect(b.yMax).toBe(4);
  });
  it('empty input falls back to (0,1) on both axes', () => {
    const b = getChartLineBounds([]);
    expect(b.xMin).toBe(0);
    expect(b.xMax).toBe(1);
    expect(b.yMin).toBe(0);
    expect(b.yMax).toBe(1);
  });
  it('single-point bounds expand by 1', () => {
    const b = getChartLineBounds([
      { id: 's', label: 's', data: [{ x: 5, y: 7 }] },
    ]);
    expect(b.xMax).toBe(b.xMin + 1);
    expect(b.yMax).toBe(b.yMin + 1);
  });
  it('xDomain / yDomain overrides win', () => {
    const b = getChartLineBounds([SERIES_A], [-5, 5], [0, 10]);
    expect(b.xMin).toBe(-5);
    expect(b.xMax).toBe(5);
    expect(b.yMin).toBe(0);
    expect(b.yMax).toBe(10);
  });
});

describe('getLinearScale', () => {
  it('maps min -> 0 and max -> length', () => {
    const scale = getLinearScale(0, 10, 100);
    expect(scale(0)).toBe(0);
    expect(scale(5)).toBe(50);
    expect(scale(10)).toBe(100);
  });
  it('handles zero-range domain', () => {
    const scale = getLinearScale(5, 5, 100);
    expect(scale(5)).toBe(0);
  });
  it('handles zero-range length (collapses to 0..1)', () => {
    const scale = getLinearScale(0, 10, 0);
    expect(scale(5)).toBe(0.5);
  });
  it('non-finite input -> 0', () => {
    const scale = getLinearScale(0, 10, 100);
    expect(scale(Number.NaN)).toBe(0);
  });
});

describe('buildLinePath', () => {
  it('returns empty for empty', () => {
    expect(buildLinePath([])).toBe('');
  });
  it('returns M/L path for straight mode', () => {
    const path = buildLinePath(
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 0 },
      ],
      false,
    );
    expect(path).toContain('M 0.00 0.00');
    expect(path).toContain('L 1.00 1.00');
    expect(path).toContain('L 2.00 0.00');
  });
  it('returns cubic bezier path for smooth mode', () => {
    const path = buildLinePath(
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 0 },
      ],
      true,
    );
    expect(path).toContain('M 0.00 0.00');
    expect(path).toContain('C ');
  });
  it('breaks the path on null y (gap)', () => {
    const path = buildLinePath(
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: null },
        { x: 3, y: 3 },
        { x: 4, y: 4 },
      ],
      false,
    );
    // Two move-to commands (M) -> two sub-paths
    expect((path.match(/M /g) ?? []).length).toBe(2);
  });
  it('all-null produces empty path', () => {
    const path = buildLinePath(
      [
        { x: 0, y: null },
        { x: 1, y: null },
      ],
      false,
    );
    expect(path).toBe('');
  });
  it('single-point smooth path renders just the move-to', () => {
    const path = buildLinePath([{ x: 1, y: 2 }], true);
    expect(path).toBe('M 1.00 2.00');
  });
  it('two-point smooth path renders straight', () => {
    const path = buildLinePath(
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      true,
    );
    expect(path).toContain('L 1.00 1.00');
  });
});

describe('findNearestPointIndex', () => {
  it('empty -> -1', () => {
    expect(findNearestPointIndex([], 3)).toBe(-1);
  });
  it('returns the closest by absolute x', () => {
    const data = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 10, y: 0 },
    ];
    expect(findNearestPointIndex(data, 4)).toBe(1);
    expect(findNearestPointIndex(data, 9)).toBe(2);
    expect(findNearestPointIndex(data, -2)).toBe(0);
  });
});

describe('getChartLineTicks', () => {
  it('returns count+1 evenly-spaced ticks', () => {
    expect(getChartLineTicks(0, 100, 4)).toEqual([
      0, 25, 50, 75, 100,
    ]);
  });
  it('default count when omitted', () => {
    expect(getChartLineTicks(0, 100).length).toBe(
      DEFAULT_CHART_LINE_TICK_COUNT + 1,
    );
  });
  it('safe for zero range', () => {
    expect(getChartLineTicks(5, 5, 4)).toEqual([5, 5, 5, 5, 5]);
  });
});

describe('formatChartLineTick', () => {
  it('integer pass-through', () => {
    expect(formatChartLineTick(42)).toBe('42');
  });
  it('float trimming', () => {
    expect(formatChartLineTick(1 / 3)).toBe('0.33');
  });
  it('custom formatter wins', () => {
    expect(formatChartLineTick(50, (n) => `${n}%`)).toBe('50%');
  });
  it('NaN -> 0', () => {
    expect(formatChartLineTick(Number.NaN)).toBe('0');
  });
});

describe('Constants', () => {
  it('default width / height / padding / tick count', () => {
    expect(DEFAULT_CHART_LINE_WIDTH).toBe(520);
    expect(DEFAULT_CHART_LINE_HEIGHT).toBe(280);
    expect(DEFAULT_CHART_LINE_PADDING).toBe(36);
    expect(DEFAULT_CHART_LINE_TICK_COUNT).toBe(4);
  });
});

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

describe('ChartLine component', () => {
  it('renders a region with default aria-label', () => {
    render(<ChartLine series={[SERIES_A]} />);
    expect(
      screen.getByRole('region', { name: 'Line chart' }),
    ).toBeInTheDocument();
  });

  it('honors custom ariaLabel', () => {
    render(
      <ChartLine
        series={[SERIES_A]}
        ariaLabel="Daily traffic"
      />,
    );
    expect(
      screen.getByRole('region', { name: 'Daily traffic' }),
    ).toBeInTheDocument();
  });

  it('renders one series group per series', () => {
    const { container } = render(
      <ChartLine series={[SERIES_A, SERIES_B]} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-series"]',
      ).length,
    ).toBe(2);
  });

  it('each series exposes a path with the right aria-label', () => {
    const { container } = render(
      <ChartLine series={[SERIES_A]} />,
    );
    const path = container.querySelector(
      '[data-section="chart-line-path"]',
    );
    expect(path).toHaveAttribute('role', 'graphics-symbol');
    expect(path).toHaveAttribute('aria-label', 'A');
  });

  it('smooth=false generates a straight path (L commands)', () => {
    const { container } = render(
      <ChartLine series={[SERIES_A]} />,
    );
    const d = container
      .querySelector('[data-section="chart-line-path"]')
      ?.getAttribute('d') ?? '';
    expect(d).toContain('L ');
    expect(d).not.toContain('C ');
  });

  it('smooth=true generates a cubic bezier path (C commands)', () => {
    const { container } = render(
      <ChartLine series={[SERIES_A]} smooth />,
    );
    const d = container
      .querySelector('[data-section="chart-line-path"]')
      ?.getAttribute('d') ?? '';
    expect(d).toContain('C ');
  });

  it('null y splits the path on the gap', () => {
    const { container } = render(
      <ChartLine series={[SERIES_B]} />,
    );
    const d = container
      .querySelector('[data-section="chart-line-path"]')
      ?.getAttribute('d') ?? '';
    expect((d.match(/M /g) ?? []).length).toBe(2);
  });

  it('showGrid=false hides grid lines', () => {
    const { container } = render(
      <ChartLine series={[SERIES_A]} showGrid={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-grid-y"]',
      ),
    ).toBeNull();
  });

  it('y tick labels reflect bounds', () => {
    const { container } = render(
      <ChartLine
        series={[
          { id: 's', label: 's', data: [{ x: 0, y: 0 }, { x: 1, y: 100 }] },
        ]}
        tickCount={4}
      />,
    );
    const ticks = container.querySelectorAll(
      '[data-section="chart-line-tick-y"]',
    );
    expect(ticks[0]?.textContent).toBe('0');
    expect(ticks[4]?.textContent).toBe('100');
  });

  it('formatY override applies to y tick labels', () => {
    const { container } = render(
      <ChartLine
        series={[
          { id: 's', label: 's', data: [{ x: 0, y: 0 }, { x: 1, y: 100 }] },
        ]}
        tickCount={2}
        formatY={(n) => `${n}%`}
      />,
    );
    const ticks = container.querySelectorAll(
      '[data-section="chart-line-tick-y"]',
    );
    expect(ticks[0]?.textContent).toBe('0%');
    expect(ticks[2]?.textContent).toBe('100%');
  });

  it('formatX override applies to x tick labels', () => {
    const { container } = render(
      <ChartLine
        series={[
          { id: 's', label: 's', data: [{ x: 0, y: 0 }, { x: 10, y: 1 }] },
        ]}
        tickCount={2}
        formatX={(n) => `t${n}`}
      />,
    );
    const ticks = container.querySelectorAll(
      '[data-section="chart-line-tick-x"]',
    );
    expect(ticks[0]?.textContent).toBe('t0');
    expect(ticks[2]?.textContent).toBe('t10');
  });

  it('showDots renders one dot per non-null point', () => {
    const { container } = render(
      <ChartLine series={[SERIES_B]} showDots />,
    );
    const dots = container.querySelectorAll(
      '[data-section="chart-line-dot"]',
    );
    // SERIES_B has 5 points; one is null -> 4 dots
    expect(dots.length).toBe(4);
  });

  it('default showDots is off', () => {
    const { container } = render(
      <ChartLine series={[SERIES_A]} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-dot"]',
      ).length,
    ).toBe(0);
  });

  it('mouse move on the svg shows the hover layer + tooltip', () => {
    const { container } = render(
      <ChartLine series={[SERIES_A]} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-svg"]',
    ) as SVGSVGElement;
    // jsdom getBoundingClientRect returns 0 width by default;
    // stub it so the mouse-move math resolves.
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
        '[data-section="chart-line-hover-layer"]',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('mouse leave hides the hover layer + tooltip', () => {
    const { container } = render(
      <ChartLine series={[SERIES_A]} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-svg"]',
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
        '[data-section="chart-line-hover-layer"]',
      ),
    ).toBeNull();
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('showTooltip=false suppresses the tooltip overlay', () => {
    const { container } = render(
      <ChartLine series={[SERIES_A]} showTooltip={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-svg"]',
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
      <ChartLine
        series={[SERIES_A]}
        axisLabel={{ x: 'Time', y: 'Value' }}
      />,
    );
    expect(screen.getByText('Time')).toBeInTheDocument();
    expect(screen.getByText('Value')).toBeInTheDocument();
  });

  it('axis lines render', () => {
    const { container } = render(
      <ChartLine series={[SERIES_A]} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-axis-x"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '[data-section="chart-line-axis-y"]',
      ),
    ).toBeInTheDocument();
  });

  it('empty series renders without crashing', () => {
    const { container } = render(<ChartLine series={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-series"]',
      ),
    ).toBeNull();
  });

  it('animate=false flips data-animate', () => {
    render(
      <ChartLine series={[SERIES_A]} animate={false} />,
    );
    expect(screen.getByRole('region')).toHaveAttribute(
      'data-animate',
      'false',
    );
  });

  it('smooth=true reflects on data-smooth', () => {
    render(<ChartLine series={[SERIES_A]} smooth />);
    expect(screen.getByRole('region')).toHaveAttribute(
      'data-smooth',
      'true',
    );
  });

  it('per-series color override applies to the path stroke', () => {
    const { container } = render(
      <ChartLine
        series={[
          {
            id: 'p',
            label: 'P',
            data: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
            color: '#ff00ff',
          },
        ]}
      />,
    );
    const path = container.querySelector(
      '[data-section="chart-line-path"]',
    );
    expect(path).toHaveAttribute('stroke', '#ff00ff');
  });

  it('root data-series-count mirrors series.length', () => {
    render(
      <ChartLine series={[SERIES_A, SERIES_B]} />,
    );
    expect(screen.getByRole('region')).toHaveAttribute(
      'data-series-count',
      '2',
    );
  });

  it('forwards ref to the root region', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLine ref={ref} series={[SERIES_A]} />);
    expect(ref.current?.getAttribute('role')).toBe('region');
  });

  it('exposes a stable displayName', () => {
    expect(ChartLine.displayName).toBe('ChartLine');
  });

  it('svg viewBox respects width + height', () => {
    const { container } = render(
      <ChartLine
        series={[SERIES_A]}
        width={400}
        height={200}
      />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-svg"]',
    );
    expect(svg).toHaveAttribute('viewBox', '0 0 400 200');
  });
});
