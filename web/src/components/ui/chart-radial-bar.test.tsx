import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartRadialBar,
  DEFAULT_CHART_RADIAL_BAR_BAR_GAP,
  DEFAULT_CHART_RADIAL_BAR_BAR_WIDTH,
  DEFAULT_CHART_RADIAL_BAR_END_ANGLE,
  DEFAULT_CHART_RADIAL_BAR_HEIGHT,
  DEFAULT_CHART_RADIAL_BAR_START_ANGLE,
  DEFAULT_CHART_RADIAL_BAR_TICK_COUNT,
  DEFAULT_CHART_RADIAL_BAR_TRACK_COLOR,
  DEFAULT_CHART_RADIAL_BAR_WIDTH,
  buildRadialArcPath,
  describeRadialBarChart,
  getDefaultRadialBarColor,
  getRadialBarMax,
  getRadialBarRatio,
  getRadialTickPositions,
  polarToCartesian,
} from './chart-radial-bar';
import type { ChartRadialBarSeries } from './chart-radial-bar';

const series: ChartRadialBarSeries[] = [
  { id: 'a', label: 'Active', value: 70 },
  { id: 'b', label: 'Blocked', value: 30 },
  { id: 'c', label: 'Closed', value: 100, color: '#ff00aa' },
];

describe('chart-radial-bar pure helpers', () => {
  describe('getRadialBarMax', () => {
    it('uses override when positive + finite', () => {
      expect(getRadialBarMax(series, 200)).toBe(200);
    });
    it('falls back to data max when override is non-positive', () => {
      expect(getRadialBarMax(series, 0)).toBe(100);
      expect(getRadialBarMax(series, -5)).toBe(100);
    });
    it('picks largest finite value', () => {
      expect(getRadialBarMax(series)).toBe(100);
    });
    it('falls back to 1 when no positive finite value is present', () => {
      expect(getRadialBarMax([])).toBe(1);
      expect(
        getRadialBarMax([
          { id: 'x', label: 'x', value: Number.NaN },
        ]),
      ).toBe(1);
    });
  });

  describe('getRadialBarRatio', () => {
    it('maps value linearly into [0,1]', () => {
      expect(getRadialBarRatio(50, 100)).toBe(0.5);
    });
    it('clamps over-max to 1', () => {
      expect(getRadialBarRatio(150, 100)).toBe(1);
    });
    it('returns 0 for non-positive value', () => {
      expect(getRadialBarRatio(0, 100)).toBe(0);
      expect(getRadialBarRatio(-10, 100)).toBe(0);
    });
    it('returns 0 for non-finite inputs', () => {
      expect(getRadialBarRatio(Number.NaN, 100)).toBe(0);
      expect(getRadialBarRatio(50, Number.NaN)).toBe(0);
      expect(getRadialBarRatio(50, 0)).toBe(0);
    });
  });

  describe('polarToCartesian', () => {
    it('returns the center for radius 0', () => {
      const p = polarToCartesian(100, 100, 0, 0);
      expect(p.x).toBeCloseTo(100);
      expect(p.y).toBeCloseTo(100);
    });
    it('places 0deg at East', () => {
      const p = polarToCartesian(0, 0, 10, 0);
      expect(p.x).toBeCloseTo(10);
      expect(p.y).toBeCloseTo(0);
    });
    it('places -90deg at North (top)', () => {
      const p = polarToCartesian(0, 0, 10, -90);
      expect(p.x).toBeCloseTo(0);
      expect(p.y).toBeCloseTo(-10);
    });
    it('places 90deg at South (bottom)', () => {
      const p = polarToCartesian(0, 0, 10, 90);
      expect(p.x).toBeCloseTo(0);
      expect(p.y).toBeCloseTo(10);
    });
  });

  describe('buildRadialArcPath', () => {
    it('emits a closed path with A commands', () => {
      const path = buildRadialArcPath(
        100,
        100,
        50,
        80,
        -90,
        90,
      );
      expect(path).toMatch(/^M /);
      expect(path).toMatch(/Z$/);
      expect((path.match(/A/g) || []).length).toBe(2);
      expect((path.match(/L/g) || []).length).toBe(1);
    });
    it('uses largeArc flag for sweeps > 180', () => {
      const path = buildRadialArcPath(
        100,
        100,
        50,
        80,
        -90,
        270,
      );
      expect(path).toContain('A 80 80 0 1 1');
    });
    it('returns "" for zero outer radius', () => {
      expect(
        buildRadialArcPath(100, 100, 0, 0, -90, 90),
      ).toBe('');
    });
    it('returns "" for zero sweep', () => {
      expect(
        buildRadialArcPath(100, 100, 50, 80, 0, 0),
      ).toBe('');
    });
  });

  describe('getRadialTickPositions', () => {
    it('emits evenly-spaced angles including endpoints', () => {
      const ticks = getRadialTickPositions(-90, 270, 5);
      expect(ticks).toEqual([-90, 0, 90, 180, 270]);
    });
    it('defaults to DEFAULT_CHART_RADIAL_BAR_TICK_COUNT', () => {
      const ticks = getRadialTickPositions(-90, 270);
      expect(ticks.length).toBe(
        DEFAULT_CHART_RADIAL_BAR_TICK_COUNT,
      );
    });
    it('clamps minimum count to 2', () => {
      const ticks = getRadialTickPositions(-90, 270, 1);
      expect(ticks).toEqual([-90, 270]);
    });
    it('returns [] for non-finite angles', () => {
      expect(
        getRadialTickPositions(Number.NaN, 90),
      ).toEqual([]);
    });
  });

  describe('describeRadialBarChart', () => {
    it('returns "No data" for empty series', () => {
      expect(describeRadialBarChart([], 100)).toBe('No data');
    });
    it('summarises series + percent of max', () => {
      const text = describeRadialBarChart(series, 100);
      expect(text).toContain('3 series');
      expect(text).toContain('Active 70');
      expect(text).toContain('70.0%');
    });
    it('honours formatValue + formatPercent', () => {
      const text = describeRadialBarChart(
        series,
        100,
        (v) => `${v}u`,
        (v) => `${(v * 100).toFixed(0)}p`,
      );
      expect(text).toContain('70u');
      expect(text).toContain('70p');
    });
  });

  describe('getDefaultRadialBarColor', () => {
    it('returns the same colour for the same index', () => {
      expect(getDefaultRadialBarColor(0)).toBe(
        getDefaultRadialBarColor(0),
      );
    });
    it('returns different colours for different indices', () => {
      expect(getDefaultRadialBarColor(0)).not.toBe(
        getDefaultRadialBarColor(1),
      );
    });
    it('wraps around with modulo', () => {
      expect(getDefaultRadialBarColor(8)).toBe(
        getDefaultRadialBarColor(0),
      );
    });
    it('returns the first colour for negative index', () => {
      expect(getDefaultRadialBarColor(-1)).toBe(
        getDefaultRadialBarColor(0),
      );
    });
  });

  it('exports default constants', () => {
    expect(DEFAULT_CHART_RADIAL_BAR_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_RADIAL_BAR_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_RADIAL_BAR_BAR_WIDTH).toBeGreaterThan(0);
    expect(
      DEFAULT_CHART_RADIAL_BAR_BAR_GAP,
    ).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_CHART_RADIAL_BAR_START_ANGLE).toBe(-90);
    expect(DEFAULT_CHART_RADIAL_BAR_END_ANGLE).toBe(270);
    expect(DEFAULT_CHART_RADIAL_BAR_TICK_COUNT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_RADIAL_BAR_TRACK_COLOR).toMatch(/^#/);
  });
});

describe('<ChartRadialBar />', () => {
  it('renders a region with role + aria-label', () => {
    render(<ChartRadialBar series={series} />);
    const root = screen.getByRole('region', {
      name: 'Radial bar chart',
    });
    expect(root).toBeInTheDocument();
    expect(root).toHaveAttribute(
      'data-section',
      'chart-radial-bar',
    );
    expect(root).toHaveAttribute('data-series-count', '3');
    expect(root).toHaveAttribute('data-max', '100');
  });

  it('renders a custom aria-label', () => {
    render(
      <ChartRadialBar series={series} ariaLabel="Pipeline" />,
    );
    expect(
      screen.getByRole('region', { name: 'Pipeline' }),
    ).toBeInTheDocument();
  });

  it('renders one series group per series', () => {
    const { container } = render(
      <ChartRadialBar series={series} />,
    );
    const groups = container.querySelectorAll(
      '[data-section="chart-radial-bar-series"]',
    );
    expect(groups.length).toBe(series.length);
  });

  it('renders a track per series', () => {
    const { container } = render(
      <ChartRadialBar series={series} />,
    );
    const tracks = container.querySelectorAll(
      '[data-section="chart-radial-bar-track"]',
    );
    expect(tracks.length).toBe(series.length);
  });

  it('renders a value arc per series with positive value', () => {
    const { container } = render(
      <ChartRadialBar series={series} />,
    );
    const arcs = container.querySelectorAll(
      '[data-section="chart-radial-bar-arc"]',
    );
    expect(arcs.length).toBe(series.length);
  });

  it('omits the arc for zero-value series', () => {
    const withZero: ChartRadialBarSeries[] = [
      ...series,
      { id: 'z', label: 'Zero', value: 0 },
    ];
    const { container } = render(
      <ChartRadialBar series={withZero} />,
    );
    const zeroGroup = container.querySelector(
      '[data-section="chart-radial-bar-series"][data-series-id="z"]',
    );
    expect(
      zeroGroup?.querySelector(
        '[data-section="chart-radial-bar-arc"]',
      ),
    ).toBeNull();
  });

  it('mirrors series metadata on each group', () => {
    const { container } = render(
      <ChartRadialBar series={series} />,
    );
    const aGroup = container.querySelector(
      '[data-section="chart-radial-bar-series"][data-series-id="a"]',
    );
    expect(aGroup?.getAttribute('data-series-value')).toBe('70');
    expect(aGroup?.getAttribute('data-series-ratio')).toBe(
      '0.7000',
    );
    const cGroup = container.querySelector(
      '[data-section="chart-radial-bar-series"][data-series-id="c"]',
    );
    expect(cGroup?.getAttribute('data-series-color')).toBe(
      '#ff00aa',
    );
  });

  it('uses the default palette for series without explicit colour', () => {
    const { container } = render(
      <ChartRadialBar series={series} />,
    );
    const aGroup = container.querySelector(
      '[data-section="chart-radial-bar-series"][data-series-id="a"]',
    );
    expect(aGroup?.getAttribute('data-series-color')).toBe(
      getDefaultRadialBarColor(0),
    );
  });

  it('renders axis ticks by default', () => {
    const { container } = render(
      <ChartRadialBar series={series} />,
    );
    const ticks = container.querySelectorAll(
      '[data-section="chart-radial-bar-tick"]',
    );
    expect(ticks.length).toBeGreaterThan(0);
  });

  it('suppresses ticks when showAxisTicks=false', () => {
    const { container } = render(
      <ChartRadialBar series={series} showAxisTicks={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-radial-bar-tick"]',
      ),
    ).toBeNull();
  });

  it('renders labels by default', () => {
    const { container } = render(
      <ChartRadialBar series={series} />,
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-radial-bar-label"]',
    );
    expect(labels.length).toBe(series.length);
    expect(labels[0]?.textContent).toContain('Active');
    expect(labels[0]?.textContent).toContain('70');
  });

  it('suppresses labels when showLabels=false', () => {
    const { container } = render(
      <ChartRadialBar series={series} showLabels={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-radial-bar-label"]',
      ),
    ).toBeNull();
  });

  it('omits value from label when showValues=false', () => {
    const { container } = render(
      <ChartRadialBar series={series} showValues={false} />,
    );
    const label = container.querySelector(
      '[data-section="chart-radial-bar-label"]',
    );
    expect(label?.textContent).toBe('Active');
  });

  it('renders the center label slot when provided', () => {
    const { container, getByText } = render(
      <ChartRadialBar
        series={series}
        centerLabel={<span>200 total</span>}
      />,
    );
    expect(getByText('200 total')).toBeInTheDocument();
    expect(
      container.querySelector(
        '[data-section="chart-radial-bar-center"]',
      ),
    ).not.toBeNull();
  });

  it('omits the center label slot when not provided', () => {
    const { container } = render(
      <ChartRadialBar series={series} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-radial-bar-center"]',
      ),
    ).toBeNull();
  });

  it('suppresses center label when showCenterLabel=false', () => {
    const { container } = render(
      <ChartRadialBar
        series={series}
        centerLabel={<span>x</span>}
        showCenterLabel={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-radial-bar-center"]',
      ),
    ).toBeNull();
  });

  it('shows tooltip on arc hover with label + value + percent', () => {
    const { container } = render(
      <ChartRadialBar series={series} />,
    );
    const arc = container.querySelector(
      '[data-section="chart-radial-bar-arc"][data-series-id="a"]',
    );
    fireEvent.mouseEnter(arc!);
    const tip = container.querySelector(
      '[data-section="chart-radial-bar-tooltip"]',
    );
    expect(tip).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-radial-bar-tooltip-label"]',
      )?.textContent,
    ).toBe('Active');
    expect(
      container.querySelector(
        '[data-section="chart-radial-bar-tooltip-value"]',
      )?.textContent,
    ).toBe('70');
    expect(
      container.querySelector(
        '[data-section="chart-radial-bar-tooltip-percent"]',
      )?.textContent,
    ).toContain('70.0%');
  });

  it('hides tooltip on mouse-leave', () => {
    const { container } = render(
      <ChartRadialBar series={series} />,
    );
    const arc = container.querySelector(
      '[data-section="chart-radial-bar-arc"]',
    );
    fireEvent.mouseEnter(arc!);
    fireEvent.mouseLeave(arc!);
    expect(
      container.querySelector(
        '[data-section="chart-radial-bar-tooltip"]',
      ),
    ).toBeNull();
  });

  it('suppresses tooltip when showTooltip=false', () => {
    const { container } = render(
      <ChartRadialBar series={series} showTooltip={false} />,
    );
    const arc = container.querySelector(
      '[data-section="chart-radial-bar-arc"]',
    );
    fireEvent.mouseEnter(arc!);
    expect(
      container.querySelector(
        '[data-section="chart-radial-bar-tooltip"]',
      ),
    ).toBeNull();
  });

  it('uses formatValue + formatPercent in tooltip + label', () => {
    const { container } = render(
      <ChartRadialBar
        series={series}
        formatValue={(v) => `${v}u`}
        formatPercent={(v) => `${(v * 100).toFixed(0)}p`}
      />,
    );
    const label = container.querySelector(
      '[data-section="chart-radial-bar-label"]',
    );
    expect(label?.textContent).toContain('70u');
    const arc = container.querySelector(
      '[data-section="chart-radial-bar-arc"]',
    );
    fireEvent.mouseEnter(arc!);
    expect(
      container.querySelector(
        '[data-section="chart-radial-bar-tooltip-value"]',
      )?.textContent,
    ).toBe('70u');
    expect(
      container.querySelector(
        '[data-section="chart-radial-bar-tooltip-percent"]',
      )?.textContent,
    ).toContain('70p');
  });

  it('honours custom trackColor', () => {
    const { container } = render(
      <ChartRadialBar
        series={series}
        trackColor="#abcdef"
      />,
    );
    const track = container.querySelector(
      '[data-section="chart-radial-bar-track"]',
    );
    expect(track?.getAttribute('fill')).toBe('#abcdef');
  });

  it('invokes onSeriesClick with series + index + value + ratio', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ChartRadialBar
        series={series}
        onSeriesClick={onClick}
      />,
    );
    const arc = container.querySelector(
      '[data-section="chart-radial-bar-arc"][data-series-id="a"]',
    );
    fireEvent.click(arc!);
    expect(onClick).toHaveBeenCalledTimes(1);
    const arg = onClick.mock.calls[0]?.[0];
    expect(arg?.series?.id).toBe('a');
    expect(arg?.index).toBe(0);
    expect(arg?.value).toBe(70);
    expect(arg?.ratio).toBeCloseTo(0.7);
  });

  it('does not bind onClick when onSeriesClick is missing', () => {
    const { container } = render(
      <ChartRadialBar series={series} />,
    );
    const arc = container.querySelector(
      '[data-section="chart-radial-bar-arc"]',
    ) as SVGElement & { style: CSSStyleDeclaration };
    expect(arc.style.cursor).toBe('default');
  });

  it('mirrors data-hovered on hovered series group', () => {
    const { container } = render(
      <ChartRadialBar series={series} />,
    );
    const arc = container.querySelector(
      '[data-section="chart-radial-bar-arc"][data-series-id="b"]',
    );
    fireEvent.mouseEnter(arc!);
    const bGroup = container.querySelector(
      '[data-section="chart-radial-bar-series"][data-series-id="b"]',
    );
    expect(bGroup?.getAttribute('data-hovered')).toBe('true');
    const aGroup = container.querySelector(
      '[data-section="chart-radial-bar-series"][data-series-id="a"]',
    );
    expect(aGroup?.getAttribute('data-hovered')).toBe('false');
  });

  it('exposes role=graphics-symbol + aria-label per arc', () => {
    const { container } = render(
      <ChartRadialBar series={series} />,
    );
    const arc = container.querySelector(
      '[data-section="chart-radial-bar-arc"]',
    );
    expect(arc?.getAttribute('role')).toBe('graphics-symbol');
    expect(arc?.getAttribute('aria-label')).toContain('Active');
    expect(arc?.getAttribute('aria-label')).toContain('70');
  });

  it('mirrors animate flag on the root', () => {
    const { container, rerender } = render(
      <ChartRadialBar series={series} />,
    );
    expect(
      container
        .querySelector('[data-section="chart-radial-bar"]')
        ?.getAttribute('data-animate'),
    ).toBe('true');
    rerender(
      <ChartRadialBar series={series} animate={false} />,
    );
    expect(
      container
        .querySelector('[data-section="chart-radial-bar"]')
        ?.getAttribute('data-animate'),
    ).toBe('false');
  });

  it('mirrors size on the svg', () => {
    const { container } = render(
      <ChartRadialBar
        series={series}
        width={400}
        height={400}
      />,
    );
    const svg = container.querySelector(
      '[data-section="chart-radial-bar-svg"]',
    );
    expect(svg?.getAttribute('width')).toBe('400');
    expect(svg?.getAttribute('height')).toBe('400');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 400 400');
  });

  it('renders auto-generated ARIA description by default', () => {
    const { container } = render(
      <ChartRadialBar series={series} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-radial-bar-aria-desc"]',
    );
    expect(desc?.textContent).toContain(
      'Radial bar chart with 3 series',
    );
  });

  it('honours ariaDescription override', () => {
    const { container } = render(
      <ChartRadialBar
        series={series}
        ariaDescription="custom"
      />,
    );
    const desc = container.querySelector(
      '[data-section="chart-radial-bar-aria-desc"]',
    );
    expect(desc?.textContent).toBe('custom');
  });

  it('handles empty series without crashing', () => {
    const { container } = render(<ChartRadialBar series={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-radial-bar"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelectorAll(
        '[data-section="chart-radial-bar-series"]',
      ).length,
    ).toBe(0);
  });

  it('forwards ref to the root region', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartRadialBar ref={ref} series={series} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-radial-bar',
    );
  });

  it('has a stable displayName', () => {
    expect(ChartRadialBar.displayName).toBe('ChartRadialBar');
  });
});
