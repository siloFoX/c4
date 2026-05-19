import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartRadarSpider,
  DEFAULT_CHART_RADAR_SPIDER_AXIS_PALETTE,
  DEFAULT_CHART_RADAR_SPIDER_LEVELS,
  DEFAULT_CHART_RADAR_SPIDER_OUTLINE_OPACITY,
  DEFAULT_CHART_RADAR_SPIDER_PADDING,
  DEFAULT_CHART_RADAR_SPIDER_SIZE,
  DEFAULT_CHART_RADAR_SPIDER_WEDGE_OPACITY,
  buildRadarSpiderGridPolygon,
  buildRadarSpiderWedgePath,
  describeRadarSpiderChart,
  getDefaultRadarSpiderAxisColor,
  getRadarSpiderAngle,
  getRadarSpiderMax,
  getRadarSpiderPoint,
  getRadarSpiderRatio,
} from './chart-radar-spider';
import type {
  ChartRadarSpiderAxis,
  ChartRadarSpiderSeries,
} from './chart-radar-spider';

const axes: ChartRadarSpiderAxis[] = [
  { id: 'speed', label: 'Speed' },
  { id: 'power', label: 'Power' },
  { id: 'range', label: 'Range' },
  { id: 'agility', label: 'Agility' },
  { id: 'comfort', label: 'Comfort' },
];

const series: ChartRadarSpiderSeries[] = [
  {
    id: 'alpha',
    label: 'Alpha',
    data: [80, 60, 70, 90, 50],
  },
  {
    id: 'beta',
    label: 'Beta',
    data: [40, 80, 60, 50, 90],
  },
];

describe('chart-radar-spider pure helpers', () => {
  describe('getRadarSpiderAngle', () => {
    it("places axis 0 at 12 o'clock (-90deg)", () => {
      expect(getRadarSpiderAngle(0, 4)).toBe(-90);
    });
    it('places subsequent axes clockwise', () => {
      expect(getRadarSpiderAngle(1, 4)).toBe(0);
      expect(getRadarSpiderAngle(2, 4)).toBe(90);
      expect(getRadarSpiderAngle(3, 4)).toBe(180);
    });
    it('short-circuits to -90 when total is 0', () => {
      expect(getRadarSpiderAngle(0, 0)).toBe(-90);
    });
  });

  describe('getDefaultRadarSpiderAxisColor', () => {
    it('returns palette[0] for index 0', () => {
      expect(getDefaultRadarSpiderAxisColor(0)).toBe(
        DEFAULT_CHART_RADAR_SPIDER_AXIS_PALETTE[0],
      );
    });
    it('wraps around with modulo', () => {
      const palette = DEFAULT_CHART_RADAR_SPIDER_AXIS_PALETTE;
      expect(
        getDefaultRadarSpiderAxisColor(palette.length),
      ).toBe(palette[0]);
    });
    it('returns first color for negative index', () => {
      expect(getDefaultRadarSpiderAxisColor(-1)).toBe(
        DEFAULT_CHART_RADAR_SPIDER_AXIS_PALETTE[0],
      );
    });
  });

  describe('getRadarSpiderMax', () => {
    it('uses override when positive + finite', () => {
      expect(getRadarSpiderMax(axes, series, 200)).toBe(200);
    });
    it('falls back to data max when override is non-positive', () => {
      expect(getRadarSpiderMax(axes, series, 0)).toBe(90);
      expect(getRadarSpiderMax(axes, series, -5)).toBe(90);
    });
    it('picks largest finite value across axes and series', () => {
      expect(getRadarSpiderMax(axes, series)).toBe(90);
    });
    it('honours per-axis max', () => {
      const withAxisMax: ChartRadarSpiderAxis[] = [
        { id: 'a', label: 'a', max: 200 },
        { id: 'b', label: 'b' },
      ];
      expect(
        getRadarSpiderMax(withAxisMax, series),
      ).toBe(200);
    });
    it('falls back to 1 when no finite values', () => {
      expect(getRadarSpiderMax([], [])).toBe(1);
      expect(
        getRadarSpiderMax(axes, [
          { id: 'x', label: 'x', data: [Number.NaN] },
        ]),
      ).toBe(1);
    });
  });

  describe('getRadarSpiderRatio', () => {
    it('maps value linearly into [0,1]', () => {
      expect(getRadarSpiderRatio(50, 100)).toBe(0.5);
    });
    it('clamps over-max to 1', () => {
      expect(getRadarSpiderRatio(500, 100)).toBe(1);
    });
    it('returns 0 for non-finite / non-positive', () => {
      expect(getRadarSpiderRatio(Number.NaN, 100)).toBe(0);
      expect(getRadarSpiderRatio(-5, 100)).toBe(0);
      expect(getRadarSpiderRatio(50, 0)).toBe(0);
      expect(getRadarSpiderRatio(50, Number.NaN)).toBe(0);
    });
  });

  describe('getRadarSpiderPoint', () => {
    it('places ratio=0 at centre', () => {
      const p = getRadarSpiderPoint(0, 4, 0, 100, 100, 50);
      expect(p.x).toBeCloseTo(100);
      expect(p.y).toBeCloseTo(100);
    });
    it('places axis 0 above centre at full ratio', () => {
      const p = getRadarSpiderPoint(0, 4, 1, 100, 100, 50);
      expect(p.x).toBeCloseTo(100);
      expect(p.y).toBeCloseTo(50);
    });
    it('places axis 1 (90deg) to the right at full ratio', () => {
      const p = getRadarSpiderPoint(1, 4, 1, 100, 100, 50);
      expect(p.x).toBeCloseTo(150);
      expect(p.y).toBeCloseTo(100);
    });
    it('clamps ratio outside [0,1]', () => {
      const pUnder = getRadarSpiderPoint(
        0,
        4,
        -5,
        100,
        100,
        50,
      );
      expect(pUnder.y).toBeCloseTo(100);
      const pOver = getRadarSpiderPoint(
        0,
        4,
        5,
        100,
        100,
        50,
      );
      expect(pOver.y).toBeCloseTo(50);
    });
  });

  describe('buildRadarSpiderWedgePath', () => {
    it('emits a closed triangle path', () => {
      const path = buildRadarSpiderWedgePath(
        100,
        100,
        { x: 100, y: 50 },
        { x: 150, y: 100 },
      );
      expect(path).toMatch(/^M /);
      expect((path.match(/L /g) || []).length).toBe(2);
      expect(path).toMatch(/Z$/);
    });
    it('returns "" for non-finite points', () => {
      expect(
        buildRadarSpiderWedgePath(
          100,
          100,
          { x: Number.NaN, y: 50 },
          { x: 150, y: 100 },
        ),
      ).toBe('');
    });
  });

  describe('buildRadarSpiderGridPolygon', () => {
    it('emits one point per axis', () => {
      const pts = buildRadarSpiderGridPolygon(
        4,
        1,
        100,
        100,
        50,
      );
      expect(pts.split(' ').length).toBe(4);
    });
    it('returns "" for zero axes', () => {
      expect(
        buildRadarSpiderGridPolygon(0, 1, 100, 100, 50),
      ).toBe('');
    });
  });

  describe('describeRadarSpiderChart', () => {
    it('returns "No data" when empty', () => {
      expect(describeRadarSpiderChart([], [])).toBe('No data');
      expect(describeRadarSpiderChart(axes, [])).toBe(
        'No data',
      );
    });
    it('summarises every series across every axis', () => {
      const text = describeRadarSpiderChart(axes, series);
      expect(text).toContain('5 axes');
      expect(text).toContain('2 series');
      expect(text).toContain('Alpha');
      expect(text).toContain('Speed');
    });
    it('honours formatValue', () => {
      const text = describeRadarSpiderChart(
        axes,
        series,
        (v) => `${v}pt`,
      );
      expect(text).toContain('80pt');
    });
  });

  it('exports default constants', () => {
    expect(DEFAULT_CHART_RADAR_SPIDER_SIZE).toBeGreaterThan(0);
    expect(DEFAULT_CHART_RADAR_SPIDER_PADDING).toBeGreaterThan(0);
    expect(DEFAULT_CHART_RADAR_SPIDER_LEVELS).toBeGreaterThan(0);
    expect(
      DEFAULT_CHART_RADAR_SPIDER_WEDGE_OPACITY,
    ).toBeGreaterThan(0);
    expect(
      DEFAULT_CHART_RADAR_SPIDER_OUTLINE_OPACITY,
    ).toBeGreaterThan(0);
    expect(
      DEFAULT_CHART_RADAR_SPIDER_AXIS_PALETTE.length,
    ).toBeGreaterThan(0);
  });
});

describe('<ChartRadarSpider />', () => {
  it('renders a region with role + aria-label', () => {
    render(<ChartRadarSpider axes={axes} series={series} />);
    const root = screen.getByRole('region', {
      name: 'Spider chart',
    });
    expect(root).toBeInTheDocument();
    expect(root).toHaveAttribute(
      'data-section',
      'chart-radar-spider',
    );
    expect(root).toHaveAttribute('data-axis-count', '5');
    expect(root).toHaveAttribute('data-series-count', '2');
  });

  it('renders a custom aria-label', () => {
    render(
      <ChartRadarSpider
        axes={axes}
        series={series}
        ariaLabel="Capability profile"
      />,
    );
    expect(
      screen.getByRole('region', {
        name: 'Capability profile',
      }),
    ).toBeInTheDocument();
  });

  it('renders one wedge per (series, axis) pair', () => {
    const { container } = render(
      <ChartRadarSpider axes={axes} series={series} />,
    );
    const wedges = container.querySelectorAll(
      '[data-section="chart-radar-spider-wedge"]',
    );
    expect(wedges.length).toBe(axes.length * series.length);
  });

  it('mirrors wedge axis-color on the wedge', () => {
    const { container } = render(
      <ChartRadarSpider axes={axes} series={series} />,
    );
    const wedge = container.querySelector(
      '[data-section="chart-radar-spider-wedge"][data-axis-index="0"]',
    );
    expect(wedge?.getAttribute('data-wedge-color')).toBe(
      DEFAULT_CHART_RADAR_SPIDER_AXIS_PALETTE[0],
    );
  });

  it('honours per-axis color override', () => {
    const colored: ChartRadarSpiderAxis[] = axes.map((a, i) =>
      i === 0 ? { ...a, color: '#ff00aa' } : a,
    );
    const { container } = render(
      <ChartRadarSpider axes={colored} series={series} />,
    );
    const wedge = container.querySelector(
      '[data-section="chart-radar-spider-wedge"][data-axis-index="0"]',
    );
    expect(wedge?.getAttribute('data-wedge-color')).toBe(
      '#ff00aa',
    );
  });

  it('renders the outline polygon by default per series', () => {
    const { container } = render(
      <ChartRadarSpider axes={axes} series={series} />,
    );
    const outlines = container.querySelectorAll(
      '[data-section="chart-radar-spider-outline"]',
    );
    expect(outlines.length).toBe(series.length);
  });

  it('suppresses outline when showOutline=false', () => {
    const { container } = render(
      <ChartRadarSpider
        axes={axes}
        series={series}
        showOutline={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-radar-spider-outline"]',
      ),
    ).toBeNull();
  });

  it('renders per-axis data points by default', () => {
    const { container } = render(
      <ChartRadarSpider axes={axes} series={series} />,
    );
    const pts = container.querySelectorAll(
      '[data-section="chart-radar-spider-point"]',
    );
    expect(pts.length).toBe(axes.length * series.length);
  });

  it('suppresses points when showPoints=false', () => {
    const { container } = render(
      <ChartRadarSpider
        axes={axes}
        series={series}
        showPoints={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-radar-spider-point"]',
      ),
    ).toBeNull();
  });

  it('renders axis labels by default', () => {
    const { container } = render(
      <ChartRadarSpider axes={axes} series={series} />,
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-radar-spider-axis-label"]',
    );
    expect(labels.length).toBe(axes.length);
    expect(labels[0]?.textContent).toBe('Speed');
  });

  it('suppresses axis labels when showAxisLabels=false', () => {
    const { container } = render(
      <ChartRadarSpider
        axes={axes}
        series={series}
        showAxisLabels={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-radar-spider-axis-label"]',
      ),
    ).toBeNull();
  });

  it('renders grid level polygons + spokes by default', () => {
    const { container } = render(
      <ChartRadarSpider axes={axes} series={series} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-radar-spider-grid-level"]',
      ).length,
    ).toBe(DEFAULT_CHART_RADAR_SPIDER_LEVELS);
    expect(
      container.querySelectorAll(
        '[data-section="chart-radar-spider-spoke"]',
      ).length,
    ).toBe(axes.length);
  });

  it('suppresses grid when showGrid=false', () => {
    const { container } = render(
      <ChartRadarSpider
        axes={axes}
        series={series}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-radar-spider-grid-level"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-radar-spider-spoke"]',
      ),
    ).toBeNull();
  });

  it('renders a legend per axis (per-axis colour encoding)', () => {
    const { container } = render(
      <ChartRadarSpider axes={axes} series={series} />,
    );
    const items = container.querySelectorAll(
      '[data-section="chart-radar-spider-legend-item"]',
    );
    expect(items.length).toBe(axes.length);
  });

  it('suppresses legend when showLegend=false', () => {
    const { container } = render(
      <ChartRadarSpider
        axes={axes}
        series={series}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-radar-spider-legend"]',
      ),
    ).toBeNull();
  });

  it('legend placement defaults to right + bottom override', () => {
    const { container, rerender } = render(
      <ChartRadarSpider axes={axes} series={series} />,
    );
    expect(
      container
        .querySelector(
          '[data-section="chart-radar-spider-legend"]',
        )
        ?.getAttribute('data-placement'),
    ).toBe('right');
    rerender(
      <ChartRadarSpider
        axes={axes}
        series={series}
        legendPlacement="bottom"
      />,
    );
    expect(
      container
        .querySelector(
          '[data-section="chart-radar-spider-legend"]',
        )
        ?.getAttribute('data-placement'),
    ).toBe('bottom');
  });

  it('shows tooltip on wedge hover with series + axis + value', () => {
    const { container } = render(
      <ChartRadarSpider axes={axes} series={series} />,
    );
    const wedge = container.querySelector(
      '[data-section="chart-radar-spider-wedge"][data-axis-index="0"]',
    );
    fireEvent.mouseEnter(wedge!);
    const tip = container.querySelector(
      '[data-section="chart-radar-spider-tooltip"]',
    );
    expect(tip).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-radar-spider-tooltip-series"]',
      )?.textContent,
    ).toBe('Alpha');
    expect(
      container.querySelector(
        '[data-section="chart-radar-spider-tooltip-axis"]',
      )?.textContent,
    ).toBe('Speed');
    expect(
      container.querySelector(
        '[data-section="chart-radar-spider-tooltip-value"]',
      )?.textContent,
    ).toContain('80');
  });

  it('hides tooltip on mouse-leave', () => {
    const { container } = render(
      <ChartRadarSpider axes={axes} series={series} />,
    );
    const wedge = container.querySelector(
      '[data-section="chart-radar-spider-wedge"]',
    );
    fireEvent.mouseEnter(wedge!);
    fireEvent.mouseLeave(wedge!);
    expect(
      container.querySelector(
        '[data-section="chart-radar-spider-tooltip"]',
      ),
    ).toBeNull();
  });

  it('formats value via formatValue', () => {
    const { container } = render(
      <ChartRadarSpider
        axes={axes}
        series={series}
        formatValue={(v) => `${v}pt`}
      />,
    );
    const wedge = container.querySelector(
      '[data-section="chart-radar-spider-wedge"][data-axis-index="0"]',
    );
    fireEvent.mouseEnter(wedge!);
    expect(
      container.querySelector(
        '[data-section="chart-radar-spider-tooltip-value"]',
      )?.textContent,
    ).toBe('80pt');
  });

  it('suppresses tooltip when showTooltip=false', () => {
    const { container } = render(
      <ChartRadarSpider
        axes={axes}
        series={series}
        showTooltip={false}
      />,
    );
    const wedge = container.querySelector(
      '[data-section="chart-radar-spider-wedge"]',
    );
    fireEvent.mouseEnter(wedge!);
    expect(
      container.querySelector(
        '[data-section="chart-radar-spider-tooltip"]',
      ),
    ).toBeNull();
  });

  it('mirrors data-hovered on the hovered wedge', () => {
    const { container } = render(
      <ChartRadarSpider axes={axes} series={series} />,
    );
    const wedges = container.querySelectorAll(
      '[data-section="chart-radar-spider-wedge"]',
    );
    fireEvent.mouseEnter(wedges[2]!);
    expect(wedges[2]?.getAttribute('data-hovered')).toBe('true');
    expect(wedges[0]?.getAttribute('data-hovered')).toBe(
      'false',
    );
  });

  it('invokes onWedgeClick with series + axis + indices + value', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ChartRadarSpider
        axes={axes}
        series={series}
        onWedgeClick={onClick}
      />,
    );
    const wedge = container.querySelector(
      '[data-section="chart-radar-spider-wedge"][data-axis-index="2"][data-series-id="beta"]',
    );
    fireEvent.click(wedge!);
    expect(onClick).toHaveBeenCalledTimes(1);
    const arg = onClick.mock.calls[0]?.[0];
    expect(arg?.series?.id).toBe('beta');
    expect(arg?.axis?.id).toBe('range');
    expect(arg?.seriesIndex).toBe(1);
    expect(arg?.axisIndex).toBe(2);
    expect(arg?.value).toBe(60);
  });

  it('exposes role=graphics-symbol + aria-label per wedge', () => {
    const { container } = render(
      <ChartRadarSpider axes={axes} series={series} />,
    );
    const wedge = container.querySelector(
      '[data-section="chart-radar-spider-wedge"]',
    );
    expect(wedge?.getAttribute('role')).toBe('graphics-symbol');
    expect(wedge?.getAttribute('aria-label')).toContain(
      'Alpha',
    );
    expect(wedge?.getAttribute('aria-label')).toContain(
      'Speed',
    );
  });

  it('mirrors animate flag on the root', () => {
    const { container, rerender } = render(
      <ChartRadarSpider axes={axes} series={series} />,
    );
    expect(
      container
        .querySelector('[data-section="chart-radar-spider"]')
        ?.getAttribute('data-animate'),
    ).toBe('true');
    rerender(
      <ChartRadarSpider
        axes={axes}
        series={series}
        animate={false}
      />,
    );
    expect(
      container
        .querySelector('[data-section="chart-radar-spider"]')
        ?.getAttribute('data-animate'),
    ).toBe('false');
  });

  it('mirrors size on the svg', () => {
    const { container } = render(
      <ChartRadarSpider
        axes={axes}
        series={series}
        size={400}
      />,
    );
    const svg = container.querySelector(
      '[data-section="chart-radar-spider-svg"]',
    );
    expect(svg?.getAttribute('width')).toBe('400');
    expect(svg?.getAttribute('height')).toBe('400');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 400 400');
  });

  it('renders auto ARIA description by default', () => {
    const { container } = render(
      <ChartRadarSpider axes={axes} series={series} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-radar-spider-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Spider chart with 5 axes');
  });

  it('honours ariaDescription override', () => {
    const { container } = render(
      <ChartRadarSpider
        axes={axes}
        series={series}
        ariaDescription="custom"
      />,
    );
    const desc = container.querySelector(
      '[data-section="chart-radar-spider-aria-desc"]',
    );
    expect(desc?.textContent).toBe('custom');
  });

  it('handles empty data without crashing', () => {
    const { container } = render(
      <ChartRadarSpider axes={[]} series={[]} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-radar-spider"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelectorAll(
        '[data-section="chart-radar-spider-wedge"]',
      ).length,
    ).toBe(0);
  });

  it('forwards ref to the root region', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartRadarSpider
        ref={ref}
        axes={axes}
        series={series}
      />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-radar-spider',
    );
  });

  it('has a stable displayName', () => {
    expect(ChartRadarSpider.displayName).toBe(
      'ChartRadarSpider',
    );
  });
});
