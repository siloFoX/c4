import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartScatter,
  DEFAULT_CHART_SCATTER_DOT_SIZE,
  DEFAULT_CHART_SCATTER_HEIGHT,
  DEFAULT_CHART_SCATTER_MAX_DOT_SIZE,
  DEFAULT_CHART_SCATTER_MIN_DOT_SIZE,
  DEFAULT_CHART_SCATTER_PADDING,
  DEFAULT_CHART_SCATTER_TICK_COUNT,
  DEFAULT_CHART_SCATTER_WIDTH,
  buildShapePath,
  findNearestScatterPoint,
  getChartScatterBounds,
  getSizeScale,
} from './chart-scatter';
import type { ChartScatterSeries } from './chart-scatter';

const seriesA: ChartScatterSeries = {
  id: 'a',
  label: 'Alpha',
  data: [
    { x: 0, y: 0 },
    { x: 5, y: 10 },
    { x: 10, y: 5 },
  ],
};

const seriesB: ChartScatterSeries = {
  id: 'b',
  label: 'Beta',
  data: [
    { x: 2, y: 4, size: 1 },
    { x: 6, y: 7, size: 5 },
    { x: 8, y: 2, size: 9 },
  ],
  color: '#ff00aa',
  shape: 'square',
};

describe('chart-scatter pure helpers', () => {
  describe('getChartScatterBounds', () => {
    it('computes bounds from x/y values', () => {
      const b = getChartScatterBounds([seriesA]);
      expect(b.xMin).toBe(0);
      expect(b.xMax).toBe(10);
      expect(b.yMin).toBe(0);
      expect(b.yMax).toBe(10);
    });

    it('honours xDomain / yDomain overrides', () => {
      const b = getChartScatterBounds([seriesA], [-5, 50], [-1, 100]);
      expect(b.xMin).toBe(-5);
      expect(b.xMax).toBe(50);
      expect(b.yMin).toBe(-1);
      expect(b.yMax).toBe(100);
    });

    it('falls back to (0,1) when data is empty or non-finite', () => {
      const empty = getChartScatterBounds([
        { id: 'e', label: 'e', data: [] },
      ]);
      expect(empty.xMin).toBe(0);
      expect(empty.xMax).toBe(1);
      expect(empty.yMin).toBe(0);
      expect(empty.yMax).toBe(1);

      const naFinite = getChartScatterBounds([
        {
          id: 'n',
          label: 'n',
          data: [{ x: Number.NaN, y: Number.NaN }],
        },
      ]);
      expect(naFinite.xMin).toBe(0);
      expect(naFinite.xMax).toBe(1);
    });

    it('expands collapsed range so xMin !== xMax', () => {
      const b = getChartScatterBounds([
        {
          id: 'c',
          label: 'c',
          data: [{ x: 7, y: 3 }],
        },
      ]);
      expect(b.xMin).toBe(7);
      expect(b.xMax).toBe(8);
      expect(b.yMin).toBe(3);
      expect(b.yMax).toBe(4);
    });

    it('computes size bounds across series', () => {
      const b = getChartScatterBounds([seriesA, seriesB]);
      expect(b.sizeMin).toBe(1);
      expect(b.sizeMax).toBe(9);
    });

    it('size bounds default to (0,0) when no sizes are present', () => {
      const b = getChartScatterBounds([seriesA]);
      expect(b.sizeMin).toBe(0);
      expect(b.sizeMax).toBe(0);
    });
  });

  describe('getSizeScale', () => {
    it('maps size value into [minPx, maxPx] linearly', () => {
      const scale = getSizeScale(0, 10, 2, 22);
      expect(scale(0)).toBe(2);
      expect(scale(10)).toBe(22);
      expect(scale(5)).toBe(12);
    });

    it('clamps inputs outside the source range', () => {
      const scale = getSizeScale(0, 10, 2, 22);
      expect(scale(-5)).toBe(2);
      expect(scale(15)).toBe(22);
    });

    it('returns minPx for undefined / non-finite / zero range', () => {
      const scale = getSizeScale(0, 0, 4, 18);
      expect(scale(undefined)).toBe(4);
      expect(scale(Number.NaN)).toBe(4);
      expect(scale(5)).toBe(4);

      const range = getSizeScale(0, 10, 4, 18);
      expect(range(undefined)).toBe(4);
    });
  });

  describe('findNearestScatterPoint', () => {
    const positions = [
      [
        { x: 10, y: 10 },
        { x: 50, y: 50 },
        { x: 90, y: 90 },
      ],
    ];
    const series: ChartScatterSeries[] = [
      {
        id: 's',
        label: 's',
        data: [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
          { x: 2, y: 2 },
        ],
      },
    ];

    it('returns null when no point is within maxDistance', () => {
      const hit = findNearestScatterPoint(series, 500, 500, positions);
      expect(hit).toBeNull();
    });

    it('finds the closest point within maxDistance', () => {
      const hit = findNearestScatterPoint(series, 52, 50, positions);
      expect(hit).not.toBeNull();
      expect(hit?.seriesIndex).toBe(0);
      expect(hit?.pointIndex).toBe(1);
    });

    it('honours a custom maxDistance', () => {
      const hit = findNearestScatterPoint(
        series,
        20,
        10,
        positions,
        5,
      );
      expect(hit).toBeNull();
    });
  });

  describe('buildShapePath', () => {
    it('builds a closed path for square', () => {
      const path = buildShapePath('square', 10, 10, 4);
      expect(path).toMatch(/^M /);
      expect(path).toMatch(/Z$/);
      // 4 line segments for a square => 3 L commands
      expect((path.match(/L/g) || []).length).toBe(3);
    });

    it('builds a closed path for triangle', () => {
      const path = buildShapePath('triangle', 0, 0, 5);
      expect(path).toMatch(/^M /);
      expect(path).toMatch(/Z$/);
      expect((path.match(/L/g) || []).length).toBe(2);
    });

    it('builds a closed path for diamond', () => {
      const path = buildShapePath('diamond', 0, 0, 5);
      expect(path).toMatch(/^M /);
      expect(path).toMatch(/Z$/);
      expect((path.match(/L/g) || []).length).toBe(3);
    });

    it('builds an arc-based path for circle', () => {
      const path = buildShapePath('circle', 0, 0, 5);
      expect(path).toMatch(/^M /);
      expect(path).toMatch(/A /);
      expect(path).toMatch(/Z$/);
    });
  });

  it('exports default constants', () => {
    expect(DEFAULT_CHART_SCATTER_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_SCATTER_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_SCATTER_PADDING).toBeGreaterThan(0);
    expect(DEFAULT_CHART_SCATTER_TICK_COUNT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_SCATTER_DOT_SIZE).toBeGreaterThan(0);
    expect(DEFAULT_CHART_SCATTER_MIN_DOT_SIZE).toBeGreaterThan(0);
    expect(DEFAULT_CHART_SCATTER_MAX_DOT_SIZE).toBeGreaterThan(0);
  });
});

describe('<ChartScatter />', () => {
  it('renders a region with role + aria-label', () => {
    render(<ChartScatter series={[seriesA]} />);
    const root = screen.getByRole('region', {
      name: 'Scatter plot',
    });
    expect(root).toBeInTheDocument();
    expect(root).toHaveAttribute(
      'data-section',
      'chart-scatter',
    );
    expect(root).toHaveAttribute('data-series-count', '1');
  });

  it('renders a custom aria-label', () => {
    render(
      <ChartScatter series={[seriesA]} ariaLabel="Income vs spend" />,
    );
    expect(
      screen.getByRole('region', { name: 'Income vs spend' }),
    ).toBeInTheDocument();
  });

  it('renders one point node per data point per series', () => {
    const { container } = render(
      <ChartScatter series={[seriesA, seriesB]} />,
    );
    const pts = container.querySelectorAll(
      '[data-section="chart-scatter-point"]',
    );
    expect(pts.length).toBe(seriesA.data.length + seriesB.data.length);
  });

  it('uses the default palette when series.color is missing', () => {
    const { container } = render(<ChartScatter series={[seriesA]} />);
    const series = container.querySelector(
      '[data-section="chart-scatter-series"]',
    );
    expect(series).not.toBeNull();
    expect(series?.getAttribute('data-series-color')).toMatch(
      /^#/,
    );
  });

  it('honours custom series.color + shape', () => {
    const { container } = render(<ChartScatter series={[seriesB]} />);
    const series = container.querySelector(
      '[data-section="chart-scatter-series"]',
    );
    expect(series).not.toBeNull();
    expect(series?.getAttribute('data-series-color')).toBe(
      '#ff00aa',
    );
    expect(series?.getAttribute('data-series-shape')).toBe(
      'square',
    );
  });

  it('renders a legend when showLegend defaults to true', () => {
    const { container } = render(
      <ChartScatter series={[seriesA, seriesB]} />,
    );
    const legend = container.querySelector(
      '[data-section="chart-scatter-legend"]',
    );
    expect(legend).not.toBeNull();
    const items = container.querySelectorAll(
      '[data-section="chart-scatter-legend-item"]',
    );
    expect(items.length).toBe(2);
  });

  it('suppresses the legend when showLegend=false', () => {
    const { container } = render(
      <ChartScatter series={[seriesA]} showLegend={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-scatter-legend"]'),
    ).toBeNull();
  });

  it('places the legend on the right by default', () => {
    const { container } = render(<ChartScatter series={[seriesA]} />);
    const legend = container.querySelector(
      '[data-section="chart-scatter-legend"]',
    );
    expect(legend?.getAttribute('data-placement')).toBe('right');
  });

  it('moves the legend below the canvas when legendPlacement="bottom"', () => {
    const { container } = render(
      <ChartScatter
        series={[seriesA]}
        legendPlacement="bottom"
      />,
    );
    const legend = container.querySelector(
      '[data-section="chart-scatter-legend"]',
    );
    expect(legend?.getAttribute('data-placement')).toBe('bottom');
  });

  it('renders axis grid lines and tick labels by default', () => {
    const { container } = render(<ChartScatter series={[seriesA]} />);
    expect(
      container.querySelectorAll(
        '[data-section="chart-scatter-grid-y"]',
      ).length,
    ).toBeGreaterThan(0);
    expect(
      container.querySelectorAll(
        '[data-section="chart-scatter-tick-y"]',
      ).length,
    ).toBeGreaterThan(0);
    expect(
      container.querySelectorAll(
        '[data-section="chart-scatter-tick-x"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('suppresses grid when showGrid=false', () => {
    const { container } = render(
      <ChartScatter series={[seriesA]} showGrid={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-scatter-grid-y"]'),
    ).toBeNull();
  });

  it('suppresses tick labels when showAxisTicks=false', () => {
    const { container } = render(
      <ChartScatter series={[seriesA]} showAxisTicks={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-scatter-tick-y"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-section="chart-scatter-tick-x"]'),
    ).toBeNull();
  });

  it('renders axis title labels when provided', () => {
    const { container } = render(
      <ChartScatter
        series={[seriesA]}
        axisLabel={{ x: 'time', y: 'value' }}
      />,
    );
    const xl = container.querySelector(
      '[data-section="chart-scatter-axis-x-label"]',
    );
    const yl = container.querySelector(
      '[data-section="chart-scatter-axis-y-label"]',
    );
    expect(xl?.textContent).toBe('time');
    expect(yl?.textContent).toBe('value');
  });

  it('shows tooltip on point hover', () => {
    const { container } = render(<ChartScatter series={[seriesA]} />);
    const point = container.querySelector(
      '[data-section="chart-scatter-point"]',
    );
    expect(point).not.toBeNull();
    fireEvent.mouseEnter(point!);
    const tip = container.querySelector(
      '[data-section="chart-scatter-tooltip"]',
    );
    expect(tip).not.toBeNull();
    const label = container.querySelector(
      '[data-section="chart-scatter-tooltip-label"]',
    );
    expect(label?.textContent).toBe('Alpha');
  });

  it('hides tooltip on point mouse-leave', () => {
    const { container } = render(<ChartScatter series={[seriesA]} />);
    const point = container.querySelector(
      '[data-section="chart-scatter-point"]',
    );
    fireEvent.mouseEnter(point!);
    fireEvent.mouseLeave(point!);
    expect(
      container.querySelector(
        '[data-section="chart-scatter-tooltip"]',
      ),
    ).toBeNull();
  });

  it('shows size in tooltip when point has a size', () => {
    const { container } = render(<ChartScatter series={[seriesB]} />);
    const points = container.querySelectorAll(
      '[data-section="chart-scatter-point"]',
    );
    fireEvent.mouseEnter(points[1]!);
    const sizeRow = container.querySelector(
      '[data-section="chart-scatter-tooltip-size"]',
    );
    expect(sizeRow?.textContent).toContain('5');
  });

  it('uses formatSize to format the size value', () => {
    const { container } = render(
      <ChartScatter
        series={[seriesB]}
        formatSize={(v) => `${v}px`}
      />,
    );
    const points = container.querySelectorAll(
      '[data-section="chart-scatter-point"]',
    );
    fireEvent.mouseEnter(points[0]!);
    const sizeRow = container.querySelector(
      '[data-section="chart-scatter-tooltip-size"]',
    );
    expect(sizeRow?.textContent).toContain('1px');
  });

  it('uses formatX / formatY to format axis ticks', () => {
    const { container } = render(
      <ChartScatter
        series={[seriesA]}
        formatX={(v) => `x${v}`}
        formatY={(v) => `y${v}`}
      />,
    );
    const xt = container.querySelector(
      '[data-section="chart-scatter-tick-x"]',
    );
    const yt = container.querySelector(
      '[data-section="chart-scatter-tick-y"]',
    );
    expect(xt?.textContent?.startsWith('x')).toBe(true);
    expect(yt?.textContent?.startsWith('y')).toBe(true);
  });

  it('shows point.label in tooltip when provided', () => {
    const labelled: ChartScatterSeries = {
      id: 'l',
      label: 'L',
      data: [{ x: 1, y: 1, label: 'Special point' }],
    };
    const { container } = render(
      <ChartScatter series={[labelled]} />,
    );
    const point = container.querySelector(
      '[data-section="chart-scatter-point"]',
    );
    fireEvent.mouseEnter(point!);
    const labelRow = container.querySelector(
      '[data-section="chart-scatter-tooltip-point-label"]',
    );
    expect(labelRow?.textContent).toBe('Special point');
  });

  it('suppresses tooltip when showTooltip=false', () => {
    const { container } = render(
      <ChartScatter series={[seriesA]} showTooltip={false} />,
    );
    const point = container.querySelector(
      '[data-section="chart-scatter-point"]',
    );
    fireEvent.mouseEnter(point!);
    expect(
      container.querySelector(
        '[data-section="chart-scatter-tooltip"]',
      ),
    ).toBeNull();
  });

  it('invokes onPointClick with the series + point', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ChartScatter
        series={[seriesA]}
        onPointClick={onClick}
      />,
    );
    const points = container.querySelectorAll(
      '[data-section="chart-scatter-point"]',
    );
    fireEvent.click(points[1]!);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0]?.[0]).toMatchObject({
      seriesIndex: 0,
      pointIndex: 1,
      series: seriesA,
      point: seriesA.data[1],
    });
  });

  it('does not bind onClick when onPointClick is missing', () => {
    const { container } = render(<ChartScatter series={[seriesA]} />);
    const point = container.querySelector(
      '[data-section="chart-scatter-point"]',
    ) as HTMLElement;
    expect(point.style.cursor).toBe('default');
  });

  it('mirrors data-hovered on the hovered point', () => {
    const { container } = render(<ChartScatter series={[seriesA]} />);
    const points = container.querySelectorAll(
      '[data-section="chart-scatter-point"]',
    );
    fireEvent.mouseEnter(points[2]!);
    expect(points[2]?.getAttribute('data-hovered')).toBe('true');
    expect(points[0]?.getAttribute('data-hovered')).toBe('false');
  });

  it('exposes role=graphics-symbol + aria-label per point', () => {
    const { container } = render(<ChartScatter series={[seriesA]} />);
    const pt = container.querySelector(
      '[data-section="chart-scatter-point"]',
    );
    expect(pt?.getAttribute('role')).toBe('graphics-symbol');
    expect(pt?.getAttribute('aria-label')).toContain('Alpha');
  });

  it('uses point.label as the aria-label when provided', () => {
    const labelled: ChartScatterSeries = {
      id: 'l',
      label: 'L',
      data: [{ x: 1, y: 1, label: 'P1' }],
    };
    const { container } = render(
      <ChartScatter series={[labelled]} />,
    );
    const pt = container.querySelector(
      '[data-section="chart-scatter-point"]',
    );
    expect(pt?.getAttribute('aria-label')).toBe('P1');
  });

  it('mirrors animate flag on the root', () => {
    const { container, rerender } = render(
      <ChartScatter series={[seriesA]} />,
    );
    expect(
      container.querySelector('[data-section="chart-scatter"]')
        ?.getAttribute('data-animate'),
    ).toBe('true');
    rerender(<ChartScatter series={[seriesA]} animate={false} />);
    expect(
      container.querySelector('[data-section="chart-scatter"]')
        ?.getAttribute('data-animate'),
    ).toBe('false');
  });

  it('mirrors width / height on the canvas wrapper + SVG', () => {
    const { container } = render(
      <ChartScatter series={[seriesA]} width={800} height={400} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-scatter-svg"]',
    );
    expect(svg?.getAttribute('width')).toBe('800');
    expect(svg?.getAttribute('height')).toBe('400');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 800 400');
  });

  it('handles empty series without crashing', () => {
    const { container } = render(<ChartScatter series={[]} />);
    expect(
      container.querySelector('[data-section="chart-scatter"]'),
    ).not.toBeNull();
    expect(
      container.querySelectorAll(
        '[data-section="chart-scatter-point"]',
      ).length,
    ).toBe(0);
  });

  it('forwards ref to the root region', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartScatter ref={ref} series={[seriesA]} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-scatter',
    );
  });

  it('has a stable displayName', () => {
    expect(ChartScatter.displayName).toBe('ChartScatter');
  });
});
