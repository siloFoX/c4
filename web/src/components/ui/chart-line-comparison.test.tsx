import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  ChartLineComparison,
  DEFAULT_CHART_LINE_COMPARISON_FILL_OPACITY,
  DEFAULT_CHART_LINE_COMPARISON_HEIGHT,
  DEFAULT_CHART_LINE_COMPARISON_PADDING,
  DEFAULT_CHART_LINE_COMPARISON_PALETTE,
  DEFAULT_CHART_LINE_COMPARISON_PRIMARY_ABOVE_COLOR,
  DEFAULT_CHART_LINE_COMPARISON_PRIMARY_BELOW_COLOR,
  DEFAULT_CHART_LINE_COMPARISON_PRIMARY_COLOR,
  DEFAULT_CHART_LINE_COMPARISON_SECONDARY_COLOR,
  DEFAULT_CHART_LINE_COMPARISON_TICK_COUNT,
  DEFAULT_CHART_LINE_COMPARISON_WIDTH,
  buildLineComparisonXUnion,
  buildLineComparisonYLookup,
  computeLineComparisonLayout,
  describeLineComparisonChart,
  findLineComparisonCrossing,
  getLineComparisonDefaultColor,
  getLineComparisonFinitePoints,
  interpolateLineComparisonY,
  type ChartLineComparisonSeries,
} from './chart-line-comparison';

const primarySeries: ChartLineComparisonSeries = {
  id: 'p',
  label: 'Primary',
  data: [
    { x: 0, y: 10 },
    { x: 1, y: 20 },
    { x: 2, y: 30 },
    { x: 3, y: 25 },
    { x: 4, y: 35 },
  ],
};

const secondarySeries: ChartLineComparisonSeries = {
  id: 's',
  label: 'Secondary',
  data: [
    { x: 0, y: 5 },
    { x: 1, y: 25 },
    { x: 2, y: 28 },
    { x: 3, y: 30 },
    { x: 4, y: 20 },
  ],
};

describe('DEFAULT_CHART_LINE_COMPARISON_* defaults', () => {
  it('has positive width, height, padding, and tick count', () => {
    expect(DEFAULT_CHART_LINE_COMPARISON_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_COMPARISON_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_COMPARISON_PADDING).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_CHART_LINE_COMPARISON_TICK_COUNT).toBeGreaterThanOrEqual(2);
  });

  it('has fill opacity strictly between 0 and 1', () => {
    expect(DEFAULT_CHART_LINE_COMPARISON_FILL_OPACITY).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_COMPARISON_FILL_OPACITY).toBeLessThan(1);
  });

  it('has primary, secondary, and direction colors', () => {
    expect(DEFAULT_CHART_LINE_COMPARISON_PRIMARY_COLOR).toMatch(/^#[0-9a-f]{6}$/i);
    expect(DEFAULT_CHART_LINE_COMPARISON_SECONDARY_COLOR).toMatch(/^#[0-9a-f]{6}$/i);
    expect(DEFAULT_CHART_LINE_COMPARISON_PRIMARY_ABOVE_COLOR).toMatch(/^#[0-9a-f]{6}$/i);
    expect(DEFAULT_CHART_LINE_COMPARISON_PRIMARY_BELOW_COLOR).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('exposes a 10-color palette', () => {
    expect(DEFAULT_CHART_LINE_COMPARISON_PALETTE).toHaveLength(10);
    for (const c of DEFAULT_CHART_LINE_COMPARISON_PALETTE) {
      expect(c).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe('getLineComparisonDefaultColor', () => {
  it('cycles through the palette by index', () => {
    expect(getLineComparisonDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_COMPARISON_PALETTE[0],
    );
    expect(getLineComparisonDefaultColor(1)).toBe(
      DEFAULT_CHART_LINE_COMPARISON_PALETTE[1],
    );
    expect(getLineComparisonDefaultColor(11)).toBe(
      DEFAULT_CHART_LINE_COMPARISON_PALETTE[1],
    );
  });

  it('falls back to first color on invalid index', () => {
    expect(getLineComparisonDefaultColor(-1)).toBe(
      DEFAULT_CHART_LINE_COMPARISON_PALETTE[0],
    );
    expect(getLineComparisonDefaultColor(Number.NaN)).toBe(
      DEFAULT_CHART_LINE_COMPARISON_PALETTE[0],
    );
    expect(getLineComparisonDefaultColor(Number.POSITIVE_INFINITY)).toBe(
      DEFAULT_CHART_LINE_COMPARISON_PALETTE[0],
    );
  });

  it('floors fractional indices', () => {
    expect(getLineComparisonDefaultColor(2.7)).toBe(
      DEFAULT_CHART_LINE_COMPARISON_PALETTE[2],
    );
  });
});

describe('getLineComparisonFinitePoints', () => {
  it('keeps fully finite samples', () => {
    expect(
      getLineComparisonFinitePoints([
        { x: 0, y: 1 },
        { x: 2, y: 3 },
      ]),
    ).toEqual([
      { x: 0, y: 1 },
      { x: 2, y: 3 },
    ]);
  });

  it('drops samples with non-finite x or y', () => {
    const filtered = getLineComparisonFinitePoints([
      { x: 0, y: 1 },
      { x: Number.NaN, y: 2 },
      { x: 3, y: Number.POSITIVE_INFINITY },
      { x: Number.NEGATIVE_INFINITY, y: 4 },
      { x: 5, y: Number.NaN },
      { x: 7, y: 8 },
    ]);
    expect(filtered).toEqual([
      { x: 0, y: 1 },
      { x: 7, y: 8 },
    ]);
  });

  it('returns [] for a non-array input', () => {
    expect(
      getLineComparisonFinitePoints(
        null as unknown as ReadonlyArray<{ x: number; y: number }>,
      ),
    ).toEqual([]);
  });
});

describe('buildLineComparisonXUnion', () => {
  it('returns sorted unique x values across both series', () => {
    const u = buildLineComparisonXUnion(
      {
        id: 'a',
        label: 'A',
        data: [
          { x: 5, y: 1 },
          { x: 1, y: 1 },
          { x: 3, y: 1 },
        ],
      },
      {
        id: 'b',
        label: 'B',
        data: [
          { x: 2, y: 1 },
          { x: 3, y: 1 },
          { x: 7, y: 1 },
        ],
      },
    );
    expect(u).toEqual([1, 2, 3, 5, 7]);
  });

  it('skips non-finite samples', () => {
    const u = buildLineComparisonXUnion(
      {
        id: 'a',
        label: 'A',
        data: [
          { x: 1, y: 1 },
          { x: Number.NaN, y: 1 },
        ],
      },
      { id: 'b', label: 'B', data: [{ x: 2, y: Number.NaN }] },
    );
    expect(u).toEqual([1]);
  });

  it('returns [] when both series are missing or empty', () => {
    expect(buildLineComparisonXUnion(null, null)).toEqual([]);
    expect(
      buildLineComparisonXUnion(
        { id: 'a', label: 'A', data: [] },
        { id: 'b', label: 'B', data: [] },
      ),
    ).toEqual([]);
  });
});

describe('buildLineComparisonYLookup', () => {
  it('maps x to y for finite samples', () => {
    const m = buildLineComparisonYLookup({
      id: 'a',
      label: 'A',
      data: [
        { x: 1, y: 10 },
        { x: 2, y: 20 },
      ],
    });
    expect(m.get(1)).toBe(10);
    expect(m.get(2)).toBe(20);
    expect(m.has(3)).toBe(false);
  });

  it('returns empty Map for null or empty series', () => {
    expect(buildLineComparisonYLookup(null).size).toBe(0);
    expect(
      buildLineComparisonYLookup({ id: 'a', label: 'A', data: [] }).size,
    ).toBe(0);
  });
});

describe('interpolateLineComparisonY', () => {
  it('linearly interpolates between two points', () => {
    expect(interpolateLineComparisonY(1, 0, 0, 2, 10)).toBe(5);
  });

  it('returns y1 when x1 === x2', () => {
    expect(interpolateLineComparisonY(5, 3, 7, 3, 9)).toBe(7);
  });

  it('falls back to y1 on non-finite x', () => {
    expect(interpolateLineComparisonY(Number.NaN, 0, 5, 1, 10)).toBe(5);
  });

  it('returns 0 when even y1 is non-finite', () => {
    expect(
      interpolateLineComparisonY(Number.NaN, 0, Number.NaN, 1, 10),
    ).toBe(0);
  });

  it('extrapolates when x is outside [x1, x2]', () => {
    expect(interpolateLineComparisonY(4, 0, 0, 2, 10)).toBe(20);
  });
});

describe('findLineComparisonCrossing', () => {
  it('returns the crossing x when curves swap order', () => {
    // primary (0, 0) -> (10, 10); secondary (0, 5) -> (10, 5).
    // crossing at delta1=-5, delta2=+5; midpoint at x=5.
    const c = findLineComparisonCrossing(0, 0, 5, 10, 10, 5);
    expect(c).toBeCloseTo(5, 6);
  });

  it('returns null when no crossing exists (same sign)', () => {
    expect(findLineComparisonCrossing(0, 10, 5, 1, 20, 8)).toBeNull();
  });

  it('returns null when one delta is exactly zero', () => {
    expect(findLineComparisonCrossing(0, 5, 5, 1, 10, 8)).toBeNull();
  });

  it('returns null on degenerate segment (x1 === x2)', () => {
    expect(findLineComparisonCrossing(3, 0, 5, 3, 10, 5)).toBeNull();
  });

  it('returns null on non-finite inputs', () => {
    expect(
      findLineComparisonCrossing(Number.NaN, 0, 5, 1, 10, 5),
    ).toBeNull();
    expect(
      findLineComparisonCrossing(0, Number.NaN, 5, 1, 10, 5),
    ).toBeNull();
  });

  it('biases the crossing toward the curve with the smaller starting gap', () => {
    // p1=0 - s1=10 -> d1=-10 (large); p2=20 - s2=5 -> d2=+15.
    // expected x* = 0 + 10 * 10 / 25 = 4.
    const c = findLineComparisonCrossing(0, 0, 10, 10, 20, 5);
    expect(c).toBeCloseTo(4, 6);
  });
});

describe('computeLineComparisonLayout', () => {
  it('returns empty when both series are null', () => {
    const layout = computeLineComparisonLayout({
      primary: null,
      secondary: null,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.primary).toBeNull();
    expect(layout.secondary).toBeNull();
    expect(layout.regions).toEqual([]);
    expect(layout.stats.xUnionCount).toBe(0);
  });

  it('returns empty when inner area is non-positive', () => {
    const layout = computeLineComparisonLayout({
      primary: primarySeries,
      secondary: secondarySeries,
      width: 20,
      height: 20,
      padding: 30,
    });
    expect(layout.primary).toBeNull();
    expect(layout.regions).toEqual([]);
  });

  it('builds layout tracks with finiteCount and path', () => {
    const layout = computeLineComparisonLayout({
      primary: primarySeries,
      secondary: secondarySeries,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.primary).not.toBeNull();
    expect(layout.primary?.finiteCount).toBe(5);
    expect(layout.primary?.totalCount).toBe(5);
    expect(layout.primary?.path).toMatch(/^M /);
    expect(layout.primary?.track).toBe('primary');
    expect(layout.secondary?.track).toBe('secondary');
  });

  it('uses series.color when provided and falls back to direction defaults otherwise', () => {
    const layout = computeLineComparisonLayout({
      primary: { ...primarySeries, color: '#123456' },
      secondary: secondarySeries,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.primary?.color).toBe('#123456');
    expect(layout.secondary?.color).toBe(
      DEFAULT_CHART_LINE_COMPARISON_SECONDARY_COLOR,
    );
  });

  it('returns regions matching the number of x-union segments without crossings', () => {
    const monotonicPrimary: ChartLineComparisonSeries = {
      id: 'p',
      label: 'P',
      data: [
        { x: 0, y: 10 },
        { x: 1, y: 20 },
        { x: 2, y: 30 },
      ],
    };
    const monotonicSecondary: ChartLineComparisonSeries = {
      id: 's',
      label: 'S',
      data: [
        { x: 0, y: 0 },
        { x: 1, y: 5 },
        { x: 2, y: 9 },
      ],
    };
    const layout = computeLineComparisonLayout({
      primary: monotonicPrimary,
      secondary: monotonicSecondary,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.regions).toHaveLength(2);
    expect(layout.stats.crossingCount).toBe(0);
    for (const r of layout.regions) {
      expect(r.primaryHigher).toBe(true);
      expect(r.fillColor).toBe(
        DEFAULT_CHART_LINE_COMPARISON_PRIMARY_ABOVE_COLOR,
      );
    }
  });

  it('splits the segment at the crossing into two regions with opposite directions', () => {
    const p: ChartLineComparisonSeries = {
      id: 'p',
      label: 'P',
      data: [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ],
    };
    const s: ChartLineComparisonSeries = {
      id: 's',
      label: 'S',
      data: [
        { x: 0, y: 5 },
        { x: 10, y: 5 },
      ],
    };
    const layout = computeLineComparisonLayout({
      primary: p,
      secondary: s,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.regions).toHaveLength(2);
    expect(layout.stats.crossingCount).toBe(1);
    const [first, second] = layout.regions;
    expect(first?.primaryHigher).toBe(false);
    expect(second?.primaryHigher).toBe(true);
    expect(first?.endX).toBeCloseTo(5, 6);
    expect(second?.startX).toBeCloseTo(5, 6);
    expect(first?.fillColor).toBe(
      DEFAULT_CHART_LINE_COMPARISON_PRIMARY_BELOW_COLOR,
    );
    expect(second?.fillColor).toBe(
      DEFAULT_CHART_LINE_COMPARISON_PRIMARY_ABOVE_COLOR,
    );
  });

  it('skips segments where either side is missing', () => {
    const p: ChartLineComparisonSeries = {
      id: 'p',
      label: 'P',
      data: [
        { x: 0, y: 1 },
        { x: 2, y: 5 },
      ],
    };
    const s: ChartLineComparisonSeries = {
      id: 's',
      label: 'S',
      data: [{ x: 1, y: 4 }],
    };
    const layout = computeLineComparisonLayout({
      primary: p,
      secondary: s,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.regions).toHaveLength(0);
    expect(layout.stats.crossingCount).toBe(0);
    expect(layout.stats.xUnionCount).toBe(3);
  });

  it('aggregates stats from shared x samples', () => {
    const layout = computeLineComparisonLayout({
      primary: primarySeries,
      secondary: secondarySeries,
      width: 400,
      height: 300,
      padding: 30,
    });
    // shared x: 0,1,2,3,4
    // p>s at x=0 (10>5), x=2 (30>28), x=4 (35>20) -> 3
    // s>p at x=1 (20<25), x=3 (25<30) -> 2
    expect(layout.stats.primaryHigherCount).toBe(3);
    expect(layout.stats.secondaryHigherCount).toBe(2);
    expect(layout.stats.equalCount).toBe(0);
    expect(layout.stats.maxPrimaryGap).toBe(15); // x=4: 35-20
    expect(layout.stats.maxSecondaryGap).toBe(5); // x=1: 25-20
  });

  it('counts equal points when curves match exactly', () => {
    const p: ChartLineComparisonSeries = {
      id: 'p',
      label: 'P',
      data: [{ x: 0, y: 5 }],
    };
    const s: ChartLineComparisonSeries = {
      id: 's',
      label: 'S',
      data: [{ x: 0, y: 5 }],
    };
    const layout = computeLineComparisonLayout({
      primary: p,
      secondary: s,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.stats.equalCount).toBe(1);
    expect(layout.stats.primaryHigherCount).toBe(0);
    expect(layout.stats.secondaryHigherCount).toBe(0);
  });

  it('respects user-supplied bounds overrides', () => {
    const layout = computeLineComparisonLayout({
      primary: primarySeries,
      secondary: secondarySeries,
      width: 400,
      height: 300,
      padding: 30,
      xMin: -10,
      xMax: 20,
      yMin: -50,
      yMax: 100,
    });
    expect(layout.xMin).toBe(-10);
    expect(layout.xMax).toBe(20);
    expect(layout.yMin).toBe(-50);
    expect(layout.yMax).toBe(100);
  });

  it('expands a zero-range bound by 0.5', () => {
    const p: ChartLineComparisonSeries = {
      id: 'p',
      label: 'P',
      data: [{ x: 3, y: 5 }],
    };
    const layout = computeLineComparisonLayout({
      primary: p,
      secondary: null,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.xMin).toBe(2.5);
    expect(layout.xMax).toBe(3.5);
    expect(layout.yMin).toBe(4.5);
    expect(layout.yMax).toBe(5.5);
  });

  it('swaps inverted bounds', () => {
    const layout = computeLineComparisonLayout({
      primary: primarySeries,
      secondary: secondarySeries,
      width: 400,
      height: 300,
      padding: 30,
      xMin: 50,
      xMax: 10,
      yMin: 100,
      yMax: 0,
    });
    expect(layout.xMin).toBe(10);
    expect(layout.xMax).toBe(50);
    expect(layout.yMin).toBe(0);
    expect(layout.yMax).toBe(100);
  });

  it('uses primaryAboveColor / primaryBelowColor overrides on regions', () => {
    const p: ChartLineComparisonSeries = {
      id: 'p',
      label: 'P',
      data: [
        { x: 0, y: 10 },
        { x: 1, y: 0 },
      ],
    };
    const s: ChartLineComparisonSeries = {
      id: 's',
      label: 'S',
      data: [
        { x: 0, y: 0 },
        { x: 1, y: 10 },
      ],
    };
    const layout = computeLineComparisonLayout({
      primary: p,
      secondary: s,
      width: 400,
      height: 300,
      padding: 30,
      primaryAboveColor: '#aaaaaa',
      primaryBelowColor: '#bbbbbb',
    });
    expect(layout.regions[0]?.fillColor).toBe('#aaaaaa');
    expect(layout.regions[1]?.fillColor).toBe('#bbbbbb');
  });

  it('computes positive region area as |gap| * |dx|', () => {
    const p: ChartLineComparisonSeries = {
      id: 'p',
      label: 'P',
      data: [
        { x: 0, y: 10 },
        { x: 4, y: 14 },
      ],
    };
    const s: ChartLineComparisonSeries = {
      id: 's',
      label: 'S',
      data: [
        { x: 0, y: 0 },
        { x: 4, y: 4 },
      ],
    };
    const layout = computeLineComparisonLayout({
      primary: p,
      secondary: s,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.regions).toHaveLength(1);
    expect(layout.regions[0]?.area).toBeCloseTo(40, 6);
  });

  it('produces axis ticks at the requested step count', () => {
    const layout = computeLineComparisonLayout({
      primary: primarySeries,
      secondary: secondarySeries,
      width: 400,
      height: 300,
      padding: 30,
      tickCount: 6,
    });
    expect(layout.xTicks).toHaveLength(6);
    expect(layout.yTicks).toHaveLength(6);
  });
});

describe('describeLineComparisonChart', () => {
  it('returns "No data" when both series missing', () => {
    expect(describeLineComparisonChart(null, null)).toBe('No data');
  });

  it('returns "No data" when no shared finite samples', () => {
    expect(
      describeLineComparisonChart(
        { id: 'p', label: 'P', data: [{ x: 0, y: 1 }] },
        { id: 's', label: 'S', data: [{ x: 1, y: 1 }] },
      ),
    ).toBe('No data');
  });

  it('summarises counts and peak gaps', () => {
    const text = describeLineComparisonChart(primarySeries, secondarySeries);
    expect(text).toContain('Primary');
    expect(text).toContain('Secondary');
    expect(text).toContain('3 where Primary higher');
    expect(text).toContain('2 where Secondary higher');
    expect(text).toContain('Peak Primary gap');
  });

  it('uses the optional formatValue formatter', () => {
    const text = describeLineComparisonChart(
      primarySeries,
      secondarySeries,
      (n) => `$${n}`,
    );
    expect(text).toContain('$15');
    expect(text).toContain('$5');
  });
});

describe('<ChartLineComparison /> rendering', () => {
  it('renders nothing meaningful when both series are null', () => {
    const { container } = render(
      <ChartLineComparison primary={null} secondary={null} />,
    );
    const root = container.querySelector('[data-section="chart-line-comparison"]');
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-x-union-count')).toBe('0');
    expect(root?.getAttribute('data-region-count')).toBe('0');
    expect(
      container.querySelectorAll('[data-section="chart-line-comparison-region"]'),
    ).toHaveLength(0);
  });

  it('renders both line paths with track-specific attrs', () => {
    const { container } = render(
      <ChartLineComparison primary={primarySeries} secondary={secondarySeries} />,
    );
    const paths = container.querySelectorAll(
      '[data-section="chart-line-comparison-path"]',
    );
    expect(paths).toHaveLength(2);
    const tracks = Array.from(paths).map((p) => p.getAttribute('data-track'));
    expect(tracks).toContain('primary');
    expect(tracks).toContain('secondary');
  });

  it('renders region polygons between curves', () => {
    const { container } = render(
      <ChartLineComparison primary={primarySeries} secondary={secondarySeries} />,
    );
    const regions = container.querySelectorAll(
      '[data-section="chart-line-comparison-region"]',
    );
    expect(regions.length).toBeGreaterThan(0);
    for (const r of Array.from(regions)) {
      expect(r.getAttribute('d')).toMatch(/^M /);
      expect(r.getAttribute('d')).toMatch(/Z$/);
      expect(r.getAttribute('data-region-fill-color')).toMatch(/^#/);
    }
  });

  it('hides regions when showRegions=false', () => {
    const { container } = render(
      <ChartLineComparison
        primary={primarySeries}
        secondary={secondarySeries}
        showRegions={false}
      />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-comparison-region"]'),
    ).toHaveLength(0);
  });

  it('renders dots per finite point when showDots is true', () => {
    const { container } = render(
      <ChartLineComparison primary={primarySeries} secondary={secondarySeries} />,
    );
    const dots = container.querySelectorAll(
      '[data-section="chart-line-comparison-dot"]',
    );
    expect(dots).toHaveLength(10);
  });

  it('hides dots when showDots=false', () => {
    const { container } = render(
      <ChartLineComparison
        primary={primarySeries}
        secondary={secondarySeries}
        showDots={false}
      />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-comparison-dot"]'),
    ).toHaveLength(0);
  });

  it('renders aria description and labels region', () => {
    render(<ChartLineComparison primary={primarySeries} secondary={secondarySeries} />);
    const region = screen.getByRole('region', { name: /comparison line chart/i });
    expect(region).toBeTruthy();
    expect(region.getAttribute('aria-describedby')).toBeTruthy();
  });

  it('honours custom ariaLabel and ariaDescription', () => {
    const { container } = render(
      <ChartLineComparison
        primary={primarySeries}
        secondary={secondarySeries}
        ariaLabel="Quarterly comparison"
        ariaDescription="Custom description here."
      />,
    );
    expect(screen.getByRole('region', { name: /quarterly comparison/i })).toBeTruthy();
    const desc = container.querySelector(
      '[data-section="chart-line-comparison-aria-desc"]',
    );
    expect(desc?.textContent).toBe('Custom description here.');
  });

  it('renders legend when showLegend=true', () => {
    const { container } = render(
      <ChartLineComparison primary={primarySeries} secondary={secondarySeries} />,
    );
    const legend = container.querySelector(
      '[data-section="chart-line-comparison-legend"]',
    );
    expect(legend).not.toBeNull();
    expect(
      legend?.querySelectorAll(
        '[data-section="chart-line-comparison-legend-item"]',
      ),
    ).toHaveLength(2);
    expect(
      legend?.querySelectorAll(
        '[data-section="chart-line-comparison-legend-region"]',
      ),
    ).toHaveLength(2);
  });

  it('omits legend entirely when showLegend=false', () => {
    const { container } = render(
      <ChartLineComparison
        primary={primarySeries}
        secondary={secondarySeries}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-comparison-legend"]'),
    ).toBeNull();
  });

  it('renders gridlines for both axes', () => {
    const { container } = render(
      <ChartLineComparison primary={primarySeries} secondary={secondarySeries} />,
    );
    const xGrid = container.querySelectorAll(
      '[data-section="chart-line-comparison-grid-line"][data-axis="x"]',
    );
    const yGrid = container.querySelectorAll(
      '[data-section="chart-line-comparison-grid-line"][data-axis="y"]',
    );
    expect(xGrid.length).toBeGreaterThan(0);
    expect(yGrid.length).toBeGreaterThan(0);
  });

  it('omits grid when showGrid=false', () => {
    const { container } = render(
      <ChartLineComparison
        primary={primarySeries}
        secondary={secondarySeries}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-comparison-grid"]'),
    ).toBeNull();
  });

  it('omits axes when showAxis=false', () => {
    const { container } = render(
      <ChartLineComparison
        primary={primarySeries}
        secondary={secondarySeries}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-comparison-axes"]'),
    ).toBeNull();
  });

  it('renders x and y axis labels when provided', () => {
    const { container } = render(
      <ChartLineComparison
        primary={primarySeries}
        secondary={secondarySeries}
        xLabel="Quarter"
        yLabel="Revenue"
      />,
    );
    const xLabel = container.querySelector(
      '[data-section="chart-line-comparison-x-label"]',
    );
    const yLabel = container.querySelector(
      '[data-section="chart-line-comparison-y-label"]',
    );
    expect(xLabel?.textContent).toBe('Quarter');
    expect(yLabel?.textContent).toBe('Revenue');
  });

  it('uses formatValue for y tick labels', () => {
    const { container } = render(
      <ChartLineComparison
        primary={primarySeries}
        secondary={secondarySeries}
        formatValue={(n) => `${n.toFixed(0)}u`}
      />,
    );
    const yTicks = container.querySelectorAll(
      '[data-section="chart-line-comparison-tick-label"][data-axis="y"]',
    );
    expect(yTicks.length).toBeGreaterThan(0);
    expect(yTicks[0]?.textContent).toMatch(/u$/);
  });

  it('uses formatX for x tick labels', () => {
    const { container } = render(
      <ChartLineComparison
        primary={primarySeries}
        secondary={secondarySeries}
        formatX={(n) => `Q${n}`}
      />,
    );
    const xTicks = container.querySelectorAll(
      '[data-section="chart-line-comparison-tick-label"][data-axis="x"]',
    );
    expect(xTicks.length).toBeGreaterThan(0);
    expect(xTicks[0]?.textContent).toMatch(/^Q/);
  });

  it('shows tooltip on dot hover with x, y, and delta vs other curve', () => {
    const { container } = render(
      <ChartLineComparison primary={primarySeries} secondary={secondarySeries} />,
    );
    const firstPrimary = container.querySelector(
      '[data-section="chart-line-comparison-dot"][data-track="primary"][data-point-index="0"]',
    ) as SVGCircleElement;
    expect(firstPrimary).not.toBeNull();
    fireEvent.mouseEnter(firstPrimary);
    const tooltip = container.querySelector(
      '[data-section="chart-line-comparison-tooltip"]',
    );
    expect(tooltip).not.toBeNull();
    expect(
      tooltip?.querySelector(
        '[data-section="chart-line-comparison-tooltip-delta"]',
      )?.textContent,
    ).toMatch(/Secondary/);
  });

  it('hides tooltip on mouse leave', () => {
    const { container } = render(
      <ChartLineComparison primary={primarySeries} secondary={secondarySeries} />,
    );
    const firstPrimary = container.querySelector(
      '[data-section="chart-line-comparison-dot"][data-track="primary"][data-point-index="0"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(firstPrimary);
    expect(
      container.querySelector('[data-section="chart-line-comparison-tooltip"]'),
    ).not.toBeNull();
    fireEvent.mouseLeave(firstPrimary);
    expect(
      container.querySelector('[data-section="chart-line-comparison-tooltip"]'),
    ).toBeNull();
  });

  it('omits delta tooltip row when no matching x on other track', () => {
    const onlyPrimary: ChartLineComparisonSeries = {
      id: 'p',
      label: 'OnlyP',
      data: [
        { x: 0, y: 1 },
        { x: 1, y: 2 },
      ],
    };
    const otherX: ChartLineComparisonSeries = {
      id: 's',
      label: 'OtherS',
      data: [
        { x: 0.5, y: 1 },
        { x: 1.5, y: 2 },
      ],
    };
    const { container } = render(
      <ChartLineComparison primary={onlyPrimary} secondary={otherX} />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-comparison-dot"][data-track="primary"][data-point-index="0"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    expect(
      container.querySelector(
        '[data-section="chart-line-comparison-tooltip-delta"]',
      ),
    ).toBeNull();
  });

  it('does not show tooltip at all when showTooltip=false', () => {
    const { container } = render(
      <ChartLineComparison
        primary={primarySeries}
        secondary={secondarySeries}
        showTooltip={false}
      />,
    );
    const firstPrimary = container.querySelector(
      '[data-section="chart-line-comparison-dot"][data-track="primary"][data-point-index="0"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(firstPrimary);
    expect(
      container.querySelector('[data-section="chart-line-comparison-tooltip"]'),
    ).toBeNull();
  });

  it('invokes onPointClick with track + point', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ChartLineComparison
        primary={primarySeries}
        secondary={secondarySeries}
        onPointClick={onClick}
      />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-comparison-dot"][data-track="primary"][data-point-index="2"]',
    ) as SVGCircleElement;
    fireEvent.click(dot);
    expect(onClick).toHaveBeenCalledTimes(1);
    const arg = onClick.mock.calls[0]?.[0];
    expect(arg.track.track).toBe('primary');
    expect(arg.point.index).toBe(2);
    expect(arg.point.x).toBe(2);
    expect(arg.point.y).toBe(30);
  });

  it('invokes onRegionClick when a region is clicked', () => {
    const onRegionClick = vi.fn();
    const { container } = render(
      <ChartLineComparison
        primary={primarySeries}
        secondary={secondarySeries}
        onRegionClick={onRegionClick}
      />,
    );
    const region = container.querySelector(
      '[data-section="chart-line-comparison-region"]',
    ) as SVGPathElement;
    fireEvent.click(region);
    expect(onRegionClick).toHaveBeenCalledTimes(1);
    expect(onRegionClick.mock.calls[0]?.[0].region.index).toBe(0);
  });

  it('animate=true sets data-animate true and adds fade-in class', () => {
    const { container } = render(
      <ChartLineComparison primary={primarySeries} secondary={secondarySeries} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-comparison"]',
    ) as HTMLDivElement;
    expect(root.getAttribute('data-animate')).toBe('true');
    expect(root.className).toContain('motion-safe:animate-fade-in');
  });

  it('animate=false drops the fade-in class', () => {
    const { container } = render(
      <ChartLineComparison
        primary={primarySeries}
        secondary={secondarySeries}
        animate={false}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-comparison"]',
    ) as HTMLDivElement;
    expect(root.getAttribute('data-animate')).toBe('false');
    expect(root.className).not.toContain('motion-safe:animate-fade-in');
  });

  it('applies the user-supplied className alongside defaults', () => {
    const { container } = render(
      <ChartLineComparison
        primary={primarySeries}
        secondary={secondarySeries}
        className="custom-cls"
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-comparison"]',
    ) as HTMLDivElement;
    expect(root.className).toContain('custom-cls');
  });

  it('forwards ref to the root div', () => {
    const ref = { current: null as HTMLDivElement | null };
    render(
      <ChartLineComparison
        ref={ref}
        primary={primarySeries}
        secondary={secondarySeries}
      />,
    );
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(
      ref.current?.getAttribute('data-section'),
    ).toBe('chart-line-comparison');
  });

  it('exposes data-crossing-count and other stat attrs', () => {
    const p: ChartLineComparisonSeries = {
      id: 'p',
      label: 'P',
      data: [
        { x: 0, y: 0 },
        { x: 1, y: 10 },
        { x: 2, y: 0 },
      ],
    };
    const s: ChartLineComparisonSeries = {
      id: 's',
      label: 'S',
      data: [
        { x: 0, y: 10 },
        { x: 1, y: 0 },
        { x: 2, y: 10 },
      ],
    };
    const { container } = render(<ChartLineComparison primary={p} secondary={s} />);
    const root = container.querySelector(
      '[data-section="chart-line-comparison"]',
    ) as HTMLDivElement;
    expect(root.getAttribute('data-crossing-count')).toBe('2');
    expect(root.getAttribute('data-primary-higher-count')).toBe('1');
    expect(root.getAttribute('data-secondary-higher-count')).toBe('2');
  });

  it('renders a stable displayName for devtools', () => {
    expect(ChartLineComparison.displayName).toBe('ChartLineComparison');
  });

  it('drops non-finite samples but preserves totalCount on the track', () => {
    const p: ChartLineComparisonSeries = {
      id: 'p',
      label: 'P',
      data: [
        { x: 0, y: 1 },
        { x: Number.NaN, y: 2 },
        { x: 2, y: 3 },
      ],
    };
    const { container } = render(
      <ChartLineComparison primary={p} secondary={null} />,
    );
    const path = container.querySelector(
      '[data-section="chart-line-comparison-track-group"][data-track="primary"]',
    );
    expect(path?.getAttribute('data-series-finite-count')).toBe('2');
    expect(path?.getAttribute('data-series-point-count')).toBe('2');
  });
});
