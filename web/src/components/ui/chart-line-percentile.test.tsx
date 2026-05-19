import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  ChartLinePercentile,
  DEFAULT_CHART_LINE_PERCENTILE_HEIGHT,
  DEFAULT_CHART_LINE_PERCENTILE_PADDING,
  DEFAULT_CHART_LINE_PERCENTILE_PALETTE,
  DEFAULT_CHART_LINE_PERCENTILE_PERCENTILES,
  DEFAULT_CHART_LINE_PERCENTILE_TICK_COUNT,
  DEFAULT_CHART_LINE_PERCENTILE_WIDTH,
  buildLinePercentileBucket,
  computeLinePercentile,
  computeLinePercentileLayout,
  computePercentileFromSorted,
  describeLinePercentileChart,
  getLinePercentileDefaultColor,
  normaliseLinePercentiles,
  sortFiniteLinePercentileValues,
  type ChartLinePercentileSeries,
} from './chart-line-percentile';

const seriesA: ChartLinePercentileSeries = {
  id: 'a',
  label: 'A',
  data: [
    { x: 0, values: [1, 2, 3, 4, 5] },
    { x: 1, values: [2, 4, 6, 8, 10] },
    { x: 2, values: [10, 20, 30, 40, 50] },
  ],
};

const seriesB: ChartLinePercentileSeries = {
  id: 'b',
  label: 'B',
  data: [
    { x: 0, values: [5, 5, 5, 5, 5] },
    { x: 1, values: [4, 5, 6, 7, 8] },
    { x: 2, values: [3, 6, 9, 12, 15] },
  ],
};

describe('DEFAULT_CHART_LINE_PERCENTILE_* defaults', () => {
  it('has positive width, height, padding, and tick count', () => {
    expect(DEFAULT_CHART_LINE_PERCENTILE_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_PERCENTILE_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_PERCENTILE_PADDING).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_CHART_LINE_PERCENTILE_TICK_COUNT).toBeGreaterThanOrEqual(2);
  });

  it('exposes a 10-color palette', () => {
    expect(DEFAULT_CHART_LINE_PERCENTILE_PALETTE).toHaveLength(10);
    for (const c of DEFAULT_CHART_LINE_PERCENTILE_PALETTE) {
      expect(c).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('defaults percentiles to [25, 50, 75]', () => {
    expect(DEFAULT_CHART_LINE_PERCENTILE_PERCENTILES).toEqual([25, 50, 75]);
  });
});

describe('getLinePercentileDefaultColor', () => {
  it('cycles through the palette by index', () => {
    expect(getLinePercentileDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_PERCENTILE_PALETTE[0],
    );
    expect(getLinePercentileDefaultColor(11)).toBe(
      DEFAULT_CHART_LINE_PERCENTILE_PALETTE[1],
    );
  });

  it('falls back to first color on invalid index', () => {
    expect(getLinePercentileDefaultColor(-1)).toBe(
      DEFAULT_CHART_LINE_PERCENTILE_PALETTE[0],
    );
    expect(getLinePercentileDefaultColor(Number.NaN)).toBe(
      DEFAULT_CHART_LINE_PERCENTILE_PALETTE[0],
    );
  });
});

describe('sortFiniteLinePercentileValues', () => {
  it('returns ascending finite values', () => {
    expect(sortFiniteLinePercentileValues([3, 1, 2])).toEqual([1, 2, 3]);
  });

  it('drops non-finite entries', () => {
    expect(
      sortFiniteLinePercentileValues([
        1,
        Number.NaN,
        2,
        Number.POSITIVE_INFINITY,
        3,
      ]),
    ).toEqual([1, 2, 3]);
  });

  it('returns [] for non-array', () => {
    expect(
      sortFiniteLinePercentileValues(null as unknown as readonly number[]),
    ).toEqual([]);
  });

  it('returns [] for empty', () => {
    expect(sortFiniteLinePercentileValues([])).toEqual([]);
  });
});

describe('computePercentileFromSorted', () => {
  it('returns the exact value at p0 (min)', () => {
    expect(computePercentileFromSorted([1, 2, 3, 4, 5], 0)).toBe(1);
  });

  it('returns the exact value at p100 (max)', () => {
    expect(computePercentileFromSorted([1, 2, 3, 4, 5], 100)).toBe(5);
  });

  it('returns the median at p50 (odd n)', () => {
    expect(computePercentileFromSorted([1, 2, 3, 4, 5], 50)).toBe(3);
  });

  it('linearly interpolates p50 for even n', () => {
    expect(computePercentileFromSorted([1, 2, 3, 4], 50)).toBeCloseTo(2.5, 6);
  });

  it('returns NaN for empty', () => {
    expect(Number.isNaN(computePercentileFromSorted([], 50))).toBe(true);
  });

  it('returns the lone value for n=1 regardless of percentile', () => {
    expect(computePercentileFromSorted([7], 25)).toBe(7);
    expect(computePercentileFromSorted([7], 99)).toBe(7);
  });

  it('clamps percentile out of [0, 100]', () => {
    expect(computePercentileFromSorted([1, 2, 3, 4, 5], -10)).toBe(1);
    expect(computePercentileFromSorted([1, 2, 3, 4, 5], 250)).toBe(5);
  });

  it('p25 of [1..5] is 2 (R type 7)', () => {
    expect(computePercentileFromSorted([1, 2, 3, 4, 5], 25)).toBeCloseTo(2, 6);
  });

  it('p75 of [1..5] is 4 (R type 7)', () => {
    expect(computePercentileFromSorted([1, 2, 3, 4, 5], 75)).toBeCloseTo(4, 6);
  });
});

describe('computeLinePercentile', () => {
  it('sorts before percentile', () => {
    expect(computeLinePercentile([5, 1, 4, 2, 3], 50)).toBe(3);
  });

  it('drops non-finite and computes from the rest', () => {
    expect(computeLinePercentile([1, Number.NaN, 5], 50)).toBe(3);
  });

  it('returns NaN on empty / non-array', () => {
    expect(Number.isNaN(computeLinePercentile([], 50))).toBe(true);
    expect(
      Number.isNaN(computeLinePercentile(null, 50)),
    ).toBe(true);
  });
});

describe('normaliseLinePercentiles', () => {
  it('returns the default [25,50,75] when unset', () => {
    expect(normaliseLinePercentiles(undefined)).toEqual([25, 50, 75]);
  });

  it('clamps out-of-range values', () => {
    expect(normaliseLinePercentiles([-5, 50, 200])).toEqual([0, 50, 100]);
  });

  it('falls back to defaults for non-finite slots', () => {
    expect(
      normaliseLinePercentiles([Number.NaN, 50, Number.NaN]),
    ).toEqual([25, 50, 75]);
  });

  it('sorts ascending when out of order', () => {
    expect(normaliseLinePercentiles([75, 50, 25])).toEqual([25, 50, 75]);
  });
});

describe('buildLinePercentileBucket', () => {
  it('returns null on missing sample', () => {
    expect(buildLinePercentileBucket(null, [25, 50, 75], 0)).toBeNull();
  });

  it('returns null on non-finite x', () => {
    expect(
      buildLinePercentileBucket(
        { x: Number.NaN, values: [1, 2, 3] },
        [25, 50, 75],
        0,
      ),
    ).toBeNull();
  });

  it('returns null when no finite values', () => {
    expect(
      buildLinePercentileBucket(
        { x: 1, values: [Number.NaN, Number.POSITIVE_INFINITY] },
        [25, 50, 75],
        0,
      ),
    ).toBeNull();
  });

  it('computes min, max, lower, mid, upper, count', () => {
    const b = buildLinePercentileBucket(
      { x: 1, values: [5, 1, 4, 2, 3] },
      [25, 50, 75],
      7,
    );
    expect(b).not.toBeNull();
    expect(b?.index).toBe(7);
    expect(b?.x).toBe(1);
    expect(b?.count).toBe(5);
    expect(b?.min).toBe(1);
    expect(b?.max).toBe(5);
    expect(b?.mid).toBe(3);
    expect(b?.lower).toBeCloseTo(2, 6);
    expect(b?.upper).toBeCloseTo(4, 6);
  });
});

describe('computeLinePercentileLayout', () => {
  it('returns empty when no series', () => {
    const layout = computeLinePercentileLayout({
      series: [],
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series).toEqual([]);
  });

  it('returns empty when canvas degenerate', () => {
    const layout = computeLinePercentileLayout({
      series: [seriesA],
      width: 20,
      height: 20,
      padding: 30,
    });
    expect(layout.series).toEqual([]);
  });

  it('returns empty when all series hidden', () => {
    const layout = computeLinePercentileLayout({
      series: [seriesA, seriesB],
      hiddenSeries: new Set(['a', 'b']),
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series).toEqual([]);
    expect(layout.visibleSeriesCount).toBe(0);
  });

  it('builds mid + band paths per series', () => {
    const layout = computeLinePercentileLayout({
      series: [seriesA],
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series).toHaveLength(1);
    expect(layout.series[0]?.midPath).toMatch(/^M /);
    expect(layout.series[0]?.bandPath).toMatch(/Z$/);
    expect(layout.series[0]?.buckets).toHaveLength(3);
  });

  it('uses upper-bound (max) for y range when showWhiskers=true', () => {
    const layout = computeLinePercentileLayout({
      series: [seriesA],
      width: 400,
      height: 300,
      padding: 30,
      showWhiskers: true,
    });
    expect(layout.yMax).toBeGreaterThanOrEqual(50);
    expect(layout.yMin).toBeLessThanOrEqual(1);
  });

  it('uses p25/p75 for y range when showWhiskers=false (default)', () => {
    const tight: ChartLinePercentileSeries = {
      id: 't',
      label: 'T',
      data: [{ x: 0, values: [0, 5, 10, 20, 100] }],
    };
    const layout = computeLinePercentileLayout({
      series: [tight],
      width: 400,
      height: 300,
      padding: 30,
    });
    // p25 of [0,5,10,20,100] = 5, p75 = 20.
    // yMax should be tight to upper (=20), not max (=100).
    expect(layout.yMax).toBeLessThan(100);
    expect(layout.yMax).toBeGreaterThanOrEqual(20);
    expect(layout.yMin).toBeGreaterThanOrEqual(0);
  });

  it('respects user-supplied bounds overrides', () => {
    const layout = computeLinePercentileLayout({
      series: [seriesA],
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

  it('honours hidden series filter', () => {
    const layout = computeLinePercentileLayout({
      series: [seriesA, seriesB],
      hiddenSeries: new Set(['a']),
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series).toHaveLength(1);
    expect(layout.series[0]?.id).toBe('b');
    expect(layout.series[0]?.index).toBe(1);
  });

  it('drops buckets with non-finite x or no finite values', () => {
    const messy: ChartLinePercentileSeries = {
      id: 'm',
      label: 'M',
      data: [
        { x: 0, values: [1, 2, 3] },
        { x: Number.NaN, values: [9, 9, 9] },
        { x: 1, values: [Number.NaN, Number.NaN] },
        { x: 2, values: [4, 5, 6] },
      ],
    };
    const layout = computeLinePercentileLayout({
      series: [messy],
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series[0]?.buckets).toHaveLength(2);
    expect(layout.series[0]?.totalCount).toBe(4);
  });

  it('sorts buckets ascending by x', () => {
    const unsorted: ChartLinePercentileSeries = {
      id: 'u',
      label: 'U',
      data: [
        { x: 3, values: [1, 2, 3] },
        { x: 1, values: [4, 5, 6] },
        { x: 2, values: [7, 8, 9] },
      ],
    };
    const layout = computeLinePercentileLayout({
      series: [unsorted],
      width: 400,
      height: 300,
      padding: 30,
    });
    const xs = layout.series[0]?.buckets.map((b) => b.x);
    expect(xs).toEqual([1, 2, 3]);
  });

  it('honours custom percentiles', () => {
    const layout = computeLinePercentileLayout({
      series: [seriesA],
      width: 400,
      height: 300,
      padding: 30,
      percentiles: [10, 50, 90],
    });
    expect(layout.percentiles).toEqual([10, 50, 90]);
  });

  it('produces axis ticks at the requested step count', () => {
    const layout = computeLinePercentileLayout({
      series: [seriesA],
      width: 400,
      height: 300,
      padding: 30,
      tickCount: 6,
    });
    expect(layout.xTicks).toHaveLength(6);
    expect(layout.yTicks).toHaveLength(6);
  });
});

describe('describeLinePercentileChart', () => {
  it('returns "No data" when no series', () => {
    expect(describeLinePercentileChart(null)).toBe('No data');
    expect(describeLinePercentileChart([])).toBe('No data');
  });

  it('returns "No data" when all hidden', () => {
    expect(
      describeLinePercentileChart([seriesA], undefined, new Set(['a'])),
    ).toBe('No data');
  });

  it('summarises percentiles + buckets', () => {
    const text = describeLinePercentileChart([seriesA]);
    expect(text).toContain('p25-p75');
    expect(text).toContain('median p50');
    expect(text).toContain('3 buckets');
    expect(text).toContain('A: p50 ranges');
  });

  it('uses custom percentiles', () => {
    const text = describeLinePercentileChart([seriesA], [10, 50, 90]);
    expect(text).toContain('p10-p90');
  });
});

describe('<ChartLinePercentile /> rendering', () => {
  it('renders nothing meaningful when empty series', () => {
    const { container } = render(<ChartLinePercentile series={[]} />);
    expect(
      container.querySelectorAll('[data-section="chart-line-percentile-mid"]'),
    ).toHaveLength(0);
  });

  it('renders one mid line + one band per series', () => {
    const { container } = render(
      <ChartLinePercentile series={[seriesA, seriesB]} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-percentile-mid"]'),
    ).toHaveLength(2);
    expect(
      container.querySelectorAll('[data-section="chart-line-percentile-band"]'),
    ).toHaveLength(2);
  });

  it('omits band when showBand=false', () => {
    const { container } = render(
      <ChartLinePercentile series={[seriesA]} showBand={false} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-percentile-band"]'),
    ).toHaveLength(0);
  });

  it('renders min and max whiskers when showWhiskers=true', () => {
    const { container } = render(
      <ChartLinePercentile series={[seriesA]} showWhiskers={true} />,
    );
    const whiskers = container.querySelectorAll(
      '[data-section="chart-line-percentile-whisker"]',
    );
    expect(whiskers).toHaveLength(2);
    const directions = Array.from(whiskers).map((w) =>
      w.getAttribute('data-whisker'),
    );
    expect(directions).toContain('min');
    expect(directions).toContain('max');
  });

  it('omits whiskers when showWhiskers=false (default)', () => {
    const { container } = render(<ChartLinePercentile series={[seriesA]} />);
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-percentile-whisker"]',
      ),
    ).toHaveLength(0);
  });

  it('renders dots per bucket', () => {
    const { container } = render(<ChartLinePercentile series={[seriesA]} />);
    expect(
      container.querySelectorAll('[data-section="chart-line-percentile-dot"]'),
    ).toHaveLength(3);
  });

  it('hides dots when showDots=false', () => {
    const { container } = render(
      <ChartLinePercentile series={[seriesA]} showDots={false} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-percentile-dot"]'),
    ).toHaveLength(0);
  });

  it('renders aria description and labels region', () => {
    render(<ChartLinePercentile series={[seriesA]} />);
    const region = screen.getByRole('region', {
      name: /line chart with percentile band/i,
    });
    expect(region).toBeTruthy();
    expect(region.getAttribute('aria-describedby')).toBeTruthy();
  });

  it('honours custom percentiles via prop', () => {
    const { container } = render(
      <ChartLinePercentile series={[seriesA]} percentiles={[10, 50, 90]} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-percentile"]',
    ) as HTMLDivElement;
    expect(root.getAttribute('data-percentile-lower')).toBe('10');
    expect(root.getAttribute('data-percentile-upper')).toBe('90');
  });

  it('shows tooltip on dot hover with mid + lower + upper rows', () => {
    const { container } = render(<ChartLinePercentile series={[seriesA]} />);
    const dot = container.querySelector(
      '[data-section="chart-line-percentile-dot"][data-bucket-index="0"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    const tip = container.querySelector(
      '[data-section="chart-line-percentile-tooltip"]',
    );
    expect(tip).not.toBeNull();
    expect(
      tip?.querySelector(
        '[data-section="chart-line-percentile-tooltip-mid"]',
      )?.textContent,
    ).toMatch(/p50/);
    expect(
      tip?.querySelector(
        '[data-section="chart-line-percentile-tooltip-lower"]',
      )?.textContent,
    ).toMatch(/p25/);
    expect(
      tip?.querySelector(
        '[data-section="chart-line-percentile-tooltip-upper"]',
      )?.textContent,
    ).toMatch(/p75/);
  });

  it('shows min/max row in tooltip when showWhiskers=true', () => {
    const { container } = render(
      <ChartLinePercentile series={[seriesA]} showWhiskers={true} />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-percentile-dot"][data-bucket-index="0"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    expect(
      container.querySelector(
        '[data-section="chart-line-percentile-tooltip-range"]',
      ),
    ).not.toBeNull();
  });

  it('hides tooltip on mouse leave', () => {
    const { container } = render(<ChartLinePercentile series={[seriesA]} />);
    const dot = container.querySelector(
      '[data-section="chart-line-percentile-dot"][data-bucket-index="0"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    expect(
      container.querySelector('[data-section="chart-line-percentile-tooltip"]'),
    ).not.toBeNull();
    fireEvent.mouseLeave(dot);
    expect(
      container.querySelector('[data-section="chart-line-percentile-tooltip"]'),
    ).toBeNull();
  });

  it('omits tooltip entirely when showTooltip=false', () => {
    const { container } = render(
      <ChartLinePercentile series={[seriesA]} showTooltip={false} />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-percentile-dot"][data-bucket-index="0"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    expect(
      container.querySelector('[data-section="chart-line-percentile-tooltip"]'),
    ).toBeNull();
  });

  it('invokes onBucketClick with series + bucket', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ChartLinePercentile series={[seriesA]} onBucketClick={onClick} />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-percentile-dot"][data-bucket-index="1"]',
    ) as SVGCircleElement;
    fireEvent.click(dot);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0]?.[0].series.id).toBe('a');
    expect(onClick.mock.calls[0]?.[0].bucket.index).toBe(1);
  });

  it('renders legend with percentile triplet', () => {
    const { container } = render(<ChartLinePercentile series={[seriesA]} />);
    const stats = container.querySelector(
      '[data-section="chart-line-percentile-legend-stats"]',
    );
    expect(stats?.textContent).toContain('p25-p50-p75');
  });

  it('toggles series via legend (uncontrolled)', () => {
    const { container } = render(
      <ChartLinePercentile series={[seriesA, seriesB]} />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-percentile-legend-button"][data-series-id="a"]',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(
      container.querySelectorAll('[data-section="chart-line-percentile-mid"]'),
    ).toHaveLength(1);
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLinePercentile
        series={[seriesA, seriesB]}
        hiddenSeries={new Set(['b'])}
      />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-percentile-mid"]'),
    ).toHaveLength(1);
  });

  it('emits onSeriesToggle and onHiddenSeriesChange', () => {
    const onToggle = vi.fn();
    const onHidden = vi.fn();
    const { container } = render(
      <ChartLinePercentile
        series={[seriesA]}
        onSeriesToggle={onToggle}
        onHiddenSeriesChange={onHidden}
      />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-percentile-legend-button"][data-series-id="a"]',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onHidden).toHaveBeenCalledTimes(1);
    expect(onHidden.mock.calls[0]?.[0].has('a')).toBe(true);
  });

  it('renders gridlines + axes (and hides when toggled off)', () => {
    const { container } = render(<ChartLinePercentile series={[seriesA]} />);
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-percentile-grid-line"]',
      ).length,
    ).toBeGreaterThan(0);
    const { container: c2 } = render(
      <ChartLinePercentile
        series={[seriesA]}
        showGrid={false}
        showAxis={false}
      />,
    );
    expect(
      c2.querySelector('[data-section="chart-line-percentile-grid"]'),
    ).toBeNull();
    expect(
      c2.querySelector('[data-section="chart-line-percentile-axes"]'),
    ).toBeNull();
  });

  it('uses formatValue/formatX in axis ticks', () => {
    const { container } = render(
      <ChartLinePercentile
        series={[seriesA]}
        formatValue={(n) => `${n.toFixed(0)}u`}
        formatX={(n) => `D${n}`}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-percentile-tick-label"][data-axis="y"]',
      )?.textContent,
    ).toMatch(/u$/);
    expect(
      container.querySelector(
        '[data-section="chart-line-percentile-tick-label"][data-axis="x"]',
      )?.textContent,
    ).toMatch(/^D/);
  });

  it('animate flag toggles data-animate and fade-in class', () => {
    const { container } = render(<ChartLinePercentile series={[seriesA]} />);
    const root = container.querySelector(
      '[data-section="chart-line-percentile"]',
    ) as HTMLDivElement;
    expect(root.getAttribute('data-animate')).toBe('true');
    expect(root.className).toContain('motion-safe:animate-fade-in');
    const { container: c2 } = render(
      <ChartLinePercentile series={[seriesA]} animate={false} />,
    );
    const r2 = c2.querySelector(
      '[data-section="chart-line-percentile"]',
    ) as HTMLDivElement;
    expect(r2.getAttribute('data-animate')).toBe('false');
    expect(r2.className).not.toContain('motion-safe:animate-fade-in');
  });

  it('forwards ref to root div', () => {
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLinePercentile ref={ref} series={[seriesA]} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-percentile',
    );
  });

  it('renders a stable displayName for devtools', () => {
    expect(ChartLinePercentile.displayName).toBe('ChartLinePercentile');
  });

  it('exposes data-show-whiskers on root', () => {
    const { container } = render(
      <ChartLinePercentile series={[seriesA]} showWhiskers={true} />,
    );
    expect(
      container
        .querySelector('[data-section="chart-line-percentile"]')
        ?.getAttribute('data-show-whiskers'),
    ).toBe('true');
  });
});
