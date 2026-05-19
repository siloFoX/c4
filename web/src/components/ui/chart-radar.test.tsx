import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartRadar,
  DEFAULT_CHART_RADAR_FILL_OPACITY,
  DEFAULT_CHART_RADAR_LEVELS,
  DEFAULT_CHART_RADAR_PADDING,
  DEFAULT_CHART_RADAR_POINT_SIZE,
  DEFAULT_CHART_RADAR_SIZE,
  DEFAULT_CHART_RADAR_STROKE_WIDTH,
  buildRadarGridLevelPoints,
  buildRadarSeriesPoints,
  describeRadarChart,
  findRadarPointHit,
  getRadarAxisAngle,
  getRadarMax,
  getRadarPoint,
} from './chart-radar';
import type {
  ChartRadarAxis,
  ChartRadarSeries,
} from './chart-radar';

const axes: ChartRadarAxis[] = [
  { id: 'speed', label: 'Speed' },
  { id: 'power', label: 'Power' },
  { id: 'range', label: 'Range' },
  { id: 'agility', label: 'Agility' },
  { id: 'comfort', label: 'Comfort' },
];

const seriesA: ChartRadarSeries = {
  id: 'a',
  label: 'Alpha',
  data: [80, 60, 70, 90, 50],
};
const seriesB: ChartRadarSeries = {
  id: 'b',
  label: 'Beta',
  data: [40, 80, 60, 50, 90],
  color: '#ff00aa',
  fillOpacity: 0.35,
};

describe('chart-radar pure helpers', () => {
  describe('getRadarAxisAngle', () => {
    it('places the first axis at 12 o\'clock', () => {
      expect(getRadarAxisAngle(0, 4)).toBeCloseTo(-Math.PI / 2);
    });

    it('places subsequent axes clockwise', () => {
      expect(getRadarAxisAngle(1, 4)).toBeCloseTo(0);
      expect(getRadarAxisAngle(2, 4)).toBeCloseTo(Math.PI / 2);
      expect(getRadarAxisAngle(3, 4)).toBeCloseTo(Math.PI);
    });

    it('returns 0 when total is 0', () => {
      expect(getRadarAxisAngle(0, 0)).toBe(0);
    });
  });

  describe('getRadarPoint', () => {
    it('maps full value to chart edge', () => {
      const { x, y } = getRadarPoint(
        100,
        100,
        -Math.PI / 2,
        100,
        100,
        50,
      );
      expect(x).toBeCloseTo(100);
      expect(y).toBeCloseTo(50);
    });

    it('maps zero value to centre', () => {
      const { x, y } = getRadarPoint(
        0,
        100,
        0,
        100,
        100,
        50,
      );
      expect(x).toBeCloseTo(100);
      expect(y).toBeCloseTo(100);
    });

    it('clamps negatives to zero', () => {
      const { x, y } = getRadarPoint(
        -50,
        100,
        0,
        100,
        100,
        50,
      );
      expect(x).toBeCloseTo(100);
      expect(y).toBeCloseTo(100);
    });

    it('clamps over-max to chart edge', () => {
      const { x } = getRadarPoint(
        500,
        100,
        0,
        100,
        100,
        50,
      );
      expect(x).toBeCloseTo(150);
    });

    it('returns centre for non-finite value', () => {
      const { x, y } = getRadarPoint(
        Number.NaN,
        100,
        0,
        100,
        100,
        50,
      );
      expect(x).toBeCloseTo(100);
      expect(y).toBeCloseTo(100);
    });

    it('returns centre when max <= 0', () => {
      const { x, y } = getRadarPoint(50, 0, 0, 100, 100, 50);
      expect(x).toBeCloseTo(100);
      expect(y).toBeCloseTo(100);
    });
  });

  describe('getRadarMax', () => {
    it('uses the override when finite + positive', () => {
      expect(getRadarMax(axes, [seriesA], 150)).toBe(150);
    });

    it('falls back to 1 when override is non-positive', () => {
      expect(getRadarMax(axes, [seriesA], -5)).toBe(1);
      expect(getRadarMax(axes, [seriesA], 0)).toBe(1);
    });

    it('computes max across series data', () => {
      expect(getRadarMax(axes, [seriesA, seriesB])).toBe(90);
    });

    it('honours per-axis max overrides', () => {
      const withAxisMax: ChartRadarAxis[] = [
        { id: 'a', label: 'a', max: 200 },
        { id: 'b', label: 'b' },
      ];
      expect(getRadarMax(withAxisMax, [seriesA])).toBe(200);
    });

    it('falls back to 1 when no values are finite', () => {
      expect(getRadarMax([], [])).toBe(1);
      expect(
        getRadarMax(axes, [
          { id: 'x', label: 'x', data: [Number.NaN] },
        ]),
      ).toBe(1);
    });
  });

  describe('buildRadarGridLevelPoints', () => {
    it('returns empty string for zero axes', () => {
      expect(
        buildRadarGridLevelPoints(0, 0.5, 100, 100, 50),
      ).toBe('');
    });

    it('emits one point per axis', () => {
      const pts = buildRadarGridLevelPoints(4, 1, 100, 100, 50);
      expect(pts.split(' ').length).toBe(4);
    });

    it('clamps ratio between 0 and 1', () => {
      const ptsLow = buildRadarGridLevelPoints(4, -1, 100, 100, 50);
      expect(ptsLow).toContain('100.00,100.00');
      const ptsHigh = buildRadarGridLevelPoints(
        4,
        5,
        100,
        100,
        50,
      );
      // outer point on the first axis (top) = (100, 50)
      expect(ptsHigh.split(' ')[0]).toBe('100.00,50.00');
    });
  });

  describe('buildRadarSeriesPoints', () => {
    it('emits one point per axis', () => {
      const pts = buildRadarSeriesPoints(
        seriesA,
        axes,
        100,
        100,
        100,
        50,
      );
      expect(pts.split(' ').length).toBe(axes.length);
    });

    it('uses per-axis max override when provided', () => {
      const ax: ChartRadarAxis[] = [
        { id: 'x', label: 'x', max: 200 },
      ];
      const s: ChartRadarSeries = {
        id: 'x',
        label: 'x',
        data: [200],
      };
      const pts = buildRadarSeriesPoints(s, ax, 100, 100, 100, 50);
      // axisIndex=0 is at the top: angle=-pi/2 -> (cx, cy - radius)
      expect(pts).toBe('100.00,50.00');
    });

    it('falls back to 0 for missing data slots', () => {
      const short: ChartRadarSeries = {
        id: 's',
        label: 's',
        data: [50],
      };
      const pts = buildRadarSeriesPoints(
        short,
        axes,
        100,
        100,
        100,
        50,
      );
      const tokens = pts.split(' ');
      expect(tokens.length).toBe(axes.length);
      // the second slot is missing -> 0 -> centre coord
      expect(tokens[1]).toBe('100.00,100.00');
    });
  });

  describe('findRadarPointHit', () => {
    const positions = [
      [
        { x: 100, y: 100 },
        { x: 200, y: 200 },
      ],
    ];
    it('returns null when far away', () => {
      expect(findRadarPointHit(positions, 500, 500)).toBeNull();
    });
    it('finds the closest point inside maxDistance', () => {
      const hit = findRadarPointHit(positions, 202, 200);
      expect(hit).not.toBeNull();
      expect(hit?.seriesIndex).toBe(0);
      expect(hit?.axisIndex).toBe(1);
    });
    it('honours custom maxDistance', () => {
      const hit = findRadarPointHit(positions, 110, 100, 5);
      expect(hit).toBeNull();
    });
  });

  describe('describeRadarChart', () => {
    it('returns "No data" when empty', () => {
      expect(describeRadarChart([], [])).toBe('No data');
      expect(describeRadarChart(axes, [])).toBe('No data');
    });
    it('summarises axes and series', () => {
      const text = describeRadarChart(axes, [seriesA]);
      expect(text).toContain('Radar with 5 axes');
      expect(text).toContain('Alpha');
      expect(text).toContain('Speed');
    });
    it('honours formatValue', () => {
      const text = describeRadarChart(
        axes,
        [seriesA],
        (v) => `${v}pts`,
      );
      expect(text).toContain('80pts');
    });
  });

  it('exports default constants', () => {
    expect(DEFAULT_CHART_RADAR_SIZE).toBeGreaterThan(0);
    expect(DEFAULT_CHART_RADAR_PADDING).toBeGreaterThan(0);
    expect(DEFAULT_CHART_RADAR_LEVELS).toBeGreaterThan(0);
    expect(DEFAULT_CHART_RADAR_FILL_OPACITY).toBeGreaterThan(0);
    expect(DEFAULT_CHART_RADAR_POINT_SIZE).toBeGreaterThan(0);
    expect(DEFAULT_CHART_RADAR_STROKE_WIDTH).toBeGreaterThan(0);
  });
});

describe('<ChartRadar />', () => {
  it('renders a region with role + aria-label', () => {
    render(<ChartRadar axes={axes} series={[seriesA]} />);
    const root = screen.getByRole('region', {
      name: 'Radar chart',
    });
    expect(root).toBeInTheDocument();
    expect(root).toHaveAttribute(
      'data-section',
      'chart-radar',
    );
    expect(root).toHaveAttribute('data-axis-count', '5');
    expect(root).toHaveAttribute('data-series-count', '1');
  });

  it('renders a custom aria-label', () => {
    render(
      <ChartRadar
        axes={axes}
        series={[seriesA]}
        ariaLabel="Vehicle stats"
      />,
    );
    expect(
      screen.getByRole('region', { name: 'Vehicle stats' }),
    ).toBeInTheDocument();
  });

  it('renders one polygon per series', () => {
    const { container } = render(
      <ChartRadar axes={axes} series={[seriesA, seriesB]} />,
    );
    const polys = container.querySelectorAll(
      '[data-section="chart-radar-polygon"]',
    );
    expect(polys.length).toBe(2);
  });

  it('renders one data point per axis per series when showPoints=true', () => {
    const { container } = render(
      <ChartRadar axes={axes} series={[seriesA, seriesB]} />,
    );
    const pts = container.querySelectorAll(
      '[data-section="chart-radar-point"]',
    );
    expect(pts.length).toBe(axes.length * 2);
  });

  it('suppresses points when showPoints=false', () => {
    const { container } = render(
      <ChartRadar
        axes={axes}
        series={[seriesA]}
        showPoints={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-radar-point"]'),
    ).toBeNull();
  });

  it('renders grid levels and spokes by default', () => {
    const { container } = render(
      <ChartRadar axes={axes} series={[seriesA]} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-radar-grid-level"]',
      ).length,
    ).toBe(DEFAULT_CHART_RADAR_LEVELS);
    expect(
      container.querySelectorAll(
        '[data-section="chart-radar-spoke"]',
      ).length,
    ).toBe(axes.length);
  });

  it('renders the requested number of grid levels', () => {
    const { container } = render(
      <ChartRadar axes={axes} series={[seriesA]} levels={6} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-radar-grid-level"]',
      ).length,
    ).toBe(6);
  });

  it('suppresses grid when showGrid=false', () => {
    const { container } = render(
      <ChartRadar
        axes={axes}
        series={[seriesA]}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-radar-grid-level"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-radar-spoke"]',
      ),
    ).toBeNull();
  });

  it('renders axis labels by default', () => {
    const { container } = render(
      <ChartRadar axes={axes} series={[seriesA]} />,
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-radar-axis-label"]',
    );
    expect(labels.length).toBe(axes.length);
    expect(labels[0]?.textContent).toBe('Speed');
  });

  it('suppresses axis labels when showAxisLabels=false', () => {
    const { container } = render(
      <ChartRadar
        axes={axes}
        series={[seriesA]}
        showAxisLabels={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-radar-axis-label"]',
      ),
    ).toBeNull();
  });

  it('renders a legend by default', () => {
    const { container } = render(
      <ChartRadar axes={axes} series={[seriesA, seriesB]} />,
    );
    const legend = container.querySelector(
      '[data-section="chart-radar-legend"]',
    );
    expect(legend).not.toBeNull();
    const items = container.querySelectorAll(
      '[data-section="chart-radar-legend-item"]',
    );
    expect(items.length).toBe(2);
  });

  it('suppresses the legend when showLegend=false', () => {
    const { container } = render(
      <ChartRadar
        axes={axes}
        series={[seriesA]}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-radar-legend"]',
      ),
    ).toBeNull();
  });

  it('renders legend with placement bottom', () => {
    const { container } = render(
      <ChartRadar
        axes={axes}
        series={[seriesA]}
        legendPlacement="bottom"
      />,
    );
    const legend = container.querySelector(
      '[data-section="chart-radar-legend"]',
    );
    expect(legend?.getAttribute('data-placement')).toBe(
      'bottom',
    );
  });

  it('uses default palette when series.color is missing', () => {
    const { container } = render(
      <ChartRadar axes={axes} series={[seriesA]} />,
    );
    const group = container.querySelector(
      '[data-section="chart-radar-series"]',
    );
    expect(group?.getAttribute('data-series-color')).toMatch(
      /^#/,
    );
  });

  it('honours custom series.color', () => {
    const { container } = render(
      <ChartRadar axes={axes} series={[seriesB]} />,
    );
    const group = container.querySelector(
      '[data-section="chart-radar-series"]',
    );
    expect(group?.getAttribute('data-series-color')).toBe(
      '#ff00aa',
    );
  });

  it('shows tooltip on point hover', () => {
    const { container } = render(
      <ChartRadar axes={axes} series={[seriesA]} />,
    );
    const point = container.querySelector(
      '[data-section="chart-radar-point"]',
    );
    expect(point).not.toBeNull();
    fireEvent.mouseEnter(point!);
    const tip = container.querySelector(
      '[data-section="chart-radar-tooltip"]',
    );
    expect(tip).not.toBeNull();
    const sLabel = container.querySelector(
      '[data-section="chart-radar-tooltip-series"]',
    );
    const aLabel = container.querySelector(
      '[data-section="chart-radar-tooltip-axis"]',
    );
    expect(sLabel?.textContent).toBe('Alpha');
    expect(aLabel?.textContent).toBe('Speed');
  });

  it('hides tooltip on mouse-leave', () => {
    const { container } = render(
      <ChartRadar axes={axes} series={[seriesA]} />,
    );
    const point = container.querySelector(
      '[data-section="chart-radar-point"]',
    );
    fireEvent.mouseEnter(point!);
    fireEvent.mouseLeave(point!);
    expect(
      container.querySelector(
        '[data-section="chart-radar-tooltip"]',
      ),
    ).toBeNull();
  });

  it('formats tooltip value via formatValue', () => {
    const { container } = render(
      <ChartRadar
        axes={axes}
        series={[seriesA]}
        formatValue={(v) => `${v}pts`}
      />,
    );
    const point = container.querySelector(
      '[data-section="chart-radar-point"]',
    );
    fireEvent.mouseEnter(point!);
    const val = container.querySelector(
      '[data-section="chart-radar-tooltip-value"]',
    );
    expect(val?.textContent).toBe('80pts');
  });

  it('suppresses tooltip when showTooltip=false', () => {
    const { container } = render(
      <ChartRadar
        axes={axes}
        series={[seriesA]}
        showTooltip={false}
      />,
    );
    const point = container.querySelector(
      '[data-section="chart-radar-point"]',
    );
    fireEvent.mouseEnter(point!);
    expect(
      container.querySelector(
        '[data-section="chart-radar-tooltip"]',
      ),
    ).toBeNull();
  });

  it('invokes onPointClick with series + axis + value', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ChartRadar
        axes={axes}
        series={[seriesA]}
        onPointClick={onClick}
      />,
    );
    const point = container.querySelector(
      '[data-section="chart-radar-point"]',
    );
    fireEvent.click(point!);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0]?.[0]).toMatchObject({
      seriesIndex: 0,
      axisIndex: 0,
      value: 80,
      series: seriesA,
      axis: axes[0],
    });
  });

  it('does not bind onClick when onPointClick is missing', () => {
    const { container } = render(
      <ChartRadar axes={axes} series={[seriesA]} />,
    );
    const point = container.querySelector(
      '[data-section="chart-radar-point"]',
    ) as SVGElement & { style: CSSStyleDeclaration };
    expect(point.style.cursor).toBe('default');
  });

  it('mirrors data-hovered on the hovered point', () => {
    const { container } = render(
      <ChartRadar axes={axes} series={[seriesA]} />,
    );
    const points = container.querySelectorAll(
      '[data-section="chart-radar-point"]',
    );
    fireEvent.mouseEnter(points[2]!);
    expect(points[2]?.getAttribute('data-hovered')).toBe('true');
    expect(points[0]?.getAttribute('data-hovered')).toBe('false');
  });

  it('exposes role=graphics-symbol + aria-label per point', () => {
    const { container } = render(
      <ChartRadar axes={axes} series={[seriesA]} />,
    );
    const pt = container.querySelector(
      '[data-section="chart-radar-point"]',
    );
    expect(pt?.getAttribute('role')).toBe('graphics-symbol');
    expect(pt?.getAttribute('aria-label')).toContain('Alpha');
    expect(pt?.getAttribute('aria-label')).toContain('Speed');
  });

  it('mirrors animate flag on the root', () => {
    const { container, rerender } = render(
      <ChartRadar axes={axes} series={[seriesA]} />,
    );
    expect(
      container
        .querySelector('[data-section="chart-radar"]')
        ?.getAttribute('data-animate'),
    ).toBe('true');
    rerender(
      <ChartRadar
        axes={axes}
        series={[seriesA]}
        animate={false}
      />,
    );
    expect(
      container
        .querySelector('[data-section="chart-radar"]')
        ?.getAttribute('data-animate'),
    ).toBe('false');
  });

  it('mirrors size on the canvas + svg', () => {
    const { container } = render(
      <ChartRadar axes={axes} series={[seriesA]} size={400} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-radar-svg"]',
    );
    expect(svg?.getAttribute('width')).toBe('400');
    expect(svg?.getAttribute('height')).toBe('400');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 400 400');
  });

  it('renders the auto-generated ARIA description by default', () => {
    const { container } = render(
      <ChartRadar axes={axes} series={[seriesA]} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-radar-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Radar with 5 axes');
    expect(desc?.textContent).toContain('Alpha');
  });

  it('uses ariaDescription override', () => {
    const { container } = render(
      <ChartRadar
        axes={axes}
        series={[seriesA]}
        ariaDescription="custom desc"
      />,
    );
    const desc = container.querySelector(
      '[data-section="chart-radar-aria-desc"]',
    );
    expect(desc?.textContent).toBe('custom desc');
  });

  it('renders "No data" description when series is empty', () => {
    const { container } = render(
      <ChartRadar axes={axes} series={[]} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-radar-aria-desc"]',
    );
    expect(desc?.textContent).toBe('No data');
  });

  it('handles empty axes without crashing', () => {
    const { container } = render(
      <ChartRadar axes={[]} series={[seriesA]} />,
    );
    expect(
      container.querySelector('[data-section="chart-radar"]'),
    ).not.toBeNull();
  });

  it('forwards ref to the root region', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartRadar
        ref={ref}
        axes={axes}
        series={[seriesA]}
      />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-radar',
    );
  });

  it('has a stable displayName', () => {
    expect(ChartRadar.displayName).toBe('ChartRadar');
  });
});
