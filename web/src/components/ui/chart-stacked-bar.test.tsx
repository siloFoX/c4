import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartStackedBar,
  DEFAULT_CHART_STACKED_BAR_BAR_GAP,
  DEFAULT_CHART_STACKED_BAR_HEIGHT,
  DEFAULT_CHART_STACKED_BAR_ORIENTATION,
  DEFAULT_CHART_STACKED_BAR_PADDING,
  DEFAULT_CHART_STACKED_BAR_TICK_COUNT,
  DEFAULT_CHART_STACKED_BAR_WIDTH,
  computeStackedBarLayout,
  describeStackedBarChart,
  getStackedBarCategoryTotal,
  getStackedBarMaxTotal,
  getStackedBarTicks,
} from './chart-stacked-bar';
import type { ChartStackedBarSeries } from './chart-stacked-bar';

const categories = ['Q1', 'Q2', 'Q3', 'Q4'];

const series: ChartStackedBarSeries[] = [
  { id: 'a', label: 'A', data: [10, 20, 30, 40] },
  { id: 'b', label: 'B', data: [15, 25, 20, 35] },
  { id: 'c', label: 'C', data: [5, 8, 12, 18], color: '#ff00aa' },
];

describe('chart-stacked-bar pure helpers', () => {
  describe('getStackedBarCategoryTotal', () => {
    it('sums visible series at category index', () => {
      expect(
        getStackedBarCategoryTotal(series, new Set(), 0),
      ).toBe(30); // 10+15+5
      expect(
        getStackedBarCategoryTotal(series, new Set(), 3),
      ).toBe(93); // 40+35+18
    });
    it('skips hidden series', () => {
      expect(
        getStackedBarCategoryTotal(series, new Set(['b']), 0),
      ).toBe(15);
    });
    it('clamps non-finite + non-positive to zero', () => {
      expect(
        getStackedBarCategoryTotal(
          [
            {
              id: 'x',
              label: 'x',
              data: [Number.NaN, -5, 0, 10],
            },
          ],
          new Set(),
          0,
        ),
      ).toBe(0);
      expect(
        getStackedBarCategoryTotal(
          [
            {
              id: 'x',
              label: 'x',
              data: [Number.NaN, -5, 0, 10],
            },
          ],
          new Set(),
          3,
        ),
      ).toBe(10);
    });
  });

  describe('getStackedBarMaxTotal', () => {
    it('returns largest category total', () => {
      expect(
        getStackedBarMaxTotal(categories, series, new Set()),
      ).toBe(93);
    });
    it('respects hidden series', () => {
      expect(
        getStackedBarMaxTotal(
          categories,
          series,
          new Set(['c']),
        ),
      ).toBe(75); // 40+35
    });
    it('falls back to 1 for empty / all-zero / all-non-finite', () => {
      expect(
        getStackedBarMaxTotal([], series, new Set()),
      ).toBe(1);
      expect(
        getStackedBarMaxTotal(categories, [], new Set()),
      ).toBe(1);
      expect(
        getStackedBarMaxTotal(
          categories,
          [
            { id: 'x', label: 'x', data: [0, 0, 0, 0] },
          ],
          new Set(),
        ),
      ).toBe(1);
    });
  });

  describe('computeStackedBarLayout', () => {
    it('returns [] for empty input', () => {
      expect(
        computeStackedBarLayout(
          [],
          series,
          new Set(),
          'vertical',
          400,
          200,
          0,
          0,
          0,
        ),
      ).toEqual([]);
      expect(
        computeStackedBarLayout(
          categories,
          [],
          new Set(),
          'vertical',
          400,
          200,
          0,
          0,
          0,
        ),
      ).toEqual([]);
    });

    it('emits one segment per visible (category, series) with value > 0', () => {
      const layout = computeStackedBarLayout(
        categories,
        series,
        new Set(),
        'vertical',
        400,
        200,
        0,
        0,
        0,
      );
      // 4 categories x 3 series, all positive = 12
      expect(layout.length).toBe(12);
    });

    it('drops zero-value segments to keep layout compact', () => {
      const withZeros: ChartStackedBarSeries[] = [
        {
          id: 'x',
          label: 'X',
          data: [10, 0, 0, 5],
        },
      ];
      const layout = computeStackedBarLayout(
        categories,
        withZeros,
        new Set(),
        'vertical',
        400,
        200,
        0,
        0,
        0,
      );
      expect(layout.length).toBe(2);
    });

    it('skips hidden series entirely', () => {
      const layout = computeStackedBarLayout(
        categories,
        series,
        new Set(['b']),
        'vertical',
        400,
        200,
        0,
        0,
        0,
      );
      const ids = new Set(layout.map((seg) => seg.series.id));
      expect(ids.has('b')).toBe(false);
      expect(ids.has('a')).toBe(true);
      expect(ids.has('c')).toBe(true);
    });

    it('vertical stack grows upward from the baseline', () => {
      const layout = computeStackedBarLayout(
        categories,
        series,
        new Set(),
        'vertical',
        400,
        200,
        0,
        0,
        0,
      );
      // Series 0 paints first; its bottom should equal baseline (innerHeight=200)
      const cat0 = layout
        .filter((s) => s.categoryIndex === 0)
        .sort((a, b) => a.seriesIndex - b.seriesIndex);
      const baseline = 200;
      // a is at the bottom
      expect(cat0[0]!.y + cat0[0]!.h).toBeCloseTo(baseline, 5);
      // a's top equals b's bottom
      expect(cat0[0]!.y).toBeCloseTo(
        cat0[1]!.y + cat0[1]!.h,
        5,
      );
      // b's top equals c's bottom
      expect(cat0[1]!.y).toBeCloseTo(
        cat0[2]!.y + cat0[2]!.h,
        5,
      );
    });

    it('horizontal stack grows rightward from the left axis', () => {
      const layout = computeStackedBarLayout(
        categories,
        series,
        new Set(),
        'horizontal',
        400,
        200,
        0,
        0,
        0,
      );
      const cat0 = layout
        .filter((s) => s.categoryIndex === 0)
        .sort((a, b) => a.seriesIndex - b.seriesIndex);
      // a sits on the left edge (x=0)
      expect(cat0[0]!.x).toBeCloseTo(0, 5);
      // a's right == b's left
      expect(cat0[0]!.x + cat0[0]!.w).toBeCloseTo(
        cat0[1]!.x,
        5,
      );
    });

    it('segment lengths are proportional to value', () => {
      const layout = computeStackedBarLayout(
        categories,
        series,
        new Set(),
        'vertical',
        400,
        200,
        0,
        0,
        0,
      );
      // max total = 93 -> innerHeight=200 mapped at max
      // Cat 3 total = 93, so total stacked height in cat3 == 200
      const cat3 = layout.filter((s) => s.categoryIndex === 3);
      const total = cat3.reduce((s, seg) => s + seg.h, 0);
      expect(total).toBeCloseTo(200, 1);
    });
  });

  describe('getStackedBarTicks', () => {
    it('emits 0..max evenly-spaced', () => {
      expect(getStackedBarTicks(100, 5)).toEqual([
        0, 25, 50, 75, 100,
      ]);
    });
    it('defaults to DEFAULT_CHART_STACKED_BAR_TICK_COUNT', () => {
      expect(getStackedBarTicks(100).length).toBe(
        DEFAULT_CHART_STACKED_BAR_TICK_COUNT,
      );
    });
    it('non-positive max -> [0]', () => {
      expect(getStackedBarTicks(0)).toEqual([0]);
      expect(getStackedBarTicks(-1)).toEqual([0]);
    });
    it('clamps min count to 2', () => {
      expect(getStackedBarTicks(100, 1)).toEqual([0, 100]);
    });
  });

  describe('describeStackedBarChart', () => {
    it('returns "No data" for empty input', () => {
      expect(
        describeStackedBarChart(
          [],
          [],
          new Set(),
          'vertical',
        ),
      ).toBe('No data');
    });
    it('summarises orientation + visible series + sums', () => {
      const text = describeStackedBarChart(
        categories,
        series,
        new Set(),
        'vertical',
      );
      expect(text).toContain('vertical');
      expect(text).toContain('4 categories');
      expect(text).toContain('3 visible series');
      expect(text).toContain('A sum');
    });
    it('reports horizontal orientation', () => {
      const text = describeStackedBarChart(
        categories,
        series,
        new Set(),
        'horizontal',
      );
      expect(text).toContain('horizontal');
    });
    it('excludes hidden series from visible count + summary', () => {
      const text = describeStackedBarChart(
        categories,
        series,
        new Set(['b']),
        'vertical',
      );
      expect(text).toContain('2 visible series');
      expect(text).not.toContain('B sum');
    });
  });

  it('exports default constants', () => {
    expect(DEFAULT_CHART_STACKED_BAR_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_STACKED_BAR_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_STACKED_BAR_PADDING).toBeGreaterThan(0);
    expect(
      DEFAULT_CHART_STACKED_BAR_BAR_GAP,
    ).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_CHART_STACKED_BAR_TICK_COUNT).toBeGreaterThan(
      0,
    );
    expect(DEFAULT_CHART_STACKED_BAR_ORIENTATION).toBe('vertical');
  });
});

describe('<ChartStackedBar />', () => {
  it('renders a region with role + aria-label', () => {
    render(
      <ChartStackedBar
        categories={categories}
        series={series}
      />,
    );
    const root = screen.getByRole('region', {
      name: 'Stacked bar chart',
    });
    expect(root).toBeInTheDocument();
    expect(root).toHaveAttribute(
      'data-section',
      'chart-stacked-bar',
    );
    expect(root).toHaveAttribute('data-orientation', 'vertical');
    expect(root).toHaveAttribute('data-category-count', '4');
    expect(root).toHaveAttribute('data-series-count', '3');
    expect(root).toHaveAttribute('data-visible-count', '3');
    expect(root).toHaveAttribute('data-segment-count', '12');
  });

  it('renders a custom aria-label', () => {
    render(
      <ChartStackedBar
        categories={categories}
        series={series}
        ariaLabel="Revenue mix"
      />,
    );
    expect(
      screen.getByRole('region', { name: 'Revenue mix' }),
    ).toBeInTheDocument();
  });

  it('renders one segment per visible (category, series) with value > 0', () => {
    const { container } = render(
      <ChartStackedBar
        categories={categories}
        series={series}
      />,
    );
    const segments = container.querySelectorAll(
      '[data-section="chart-stacked-bar-segment"]',
    );
    expect(segments.length).toBe(12);
  });

  it('mirrors segment metadata on the group', () => {
    const { container } = render(
      <ChartStackedBar
        categories={categories}
        series={series}
      />,
    );
    const c2 = container.querySelector(
      '[data-section="chart-stacked-bar-segment"][data-series-id="c"][data-category-index="2"]',
    );
    expect(c2?.getAttribute('data-segment-value')).toBe('12');
    expect(c2?.getAttribute('data-segment-color')).toBe(
      '#ff00aa',
    );
  });

  it('renders orientation toggle by default + toggles orientation on click', () => {
    const { container } = render(
      <ChartStackedBar
        categories={categories}
        series={series}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-stacked-bar"]',
    );
    expect(root?.getAttribute('data-orientation')).toBe(
      'vertical',
    );
    const btn = container.querySelector(
      '[data-section="chart-stacked-bar-orientation-button"]',
    );
    fireEvent.click(btn!);
    expect(root?.getAttribute('data-orientation')).toBe(
      'horizontal',
    );
    fireEvent.click(btn!);
    expect(root?.getAttribute('data-orientation')).toBe(
      'vertical',
    );
  });

  it('honours defaultOrientation initially', () => {
    const { container } = render(
      <ChartStackedBar
        categories={categories}
        series={series}
        defaultOrientation="horizontal"
      />,
    );
    expect(
      container
        .querySelector('[data-section="chart-stacked-bar"]')
        ?.getAttribute('data-orientation'),
    ).toBe('horizontal');
  });

  it('respects controlled orientation prop', () => {
    const onChange = vi.fn();
    const { container } = render(
      <ChartStackedBar
        categories={categories}
        series={series}
        orientation="horizontal"
        onOrientationChange={onChange}
      />,
    );
    const btn = container.querySelector(
      '[data-section="chart-stacked-bar-orientation-button"]',
    );
    fireEvent.click(btn!);
    expect(onChange).toHaveBeenCalledWith('vertical');
    // root stays controlled (still horizontal)
    expect(
      container
        .querySelector('[data-section="chart-stacked-bar"]')
        ?.getAttribute('data-orientation'),
    ).toBe('horizontal');
  });

  it('suppresses orientation toggle when showOrientationToggle=false', () => {
    const { container } = render(
      <ChartStackedBar
        categories={categories}
        series={series}
        showOrientationToggle={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-stacked-bar-orientation-toggle"]',
      ),
    ).toBeNull();
  });

  it('renders a legend by default with one item per series', () => {
    const { container } = render(
      <ChartStackedBar
        categories={categories}
        series={series}
      />,
    );
    const items = container.querySelectorAll(
      '[data-section="chart-stacked-bar-legend-item"]',
    );
    expect(items.length).toBe(series.length);
  });

  it('suppresses legend when showLegend=false', () => {
    const { container } = render(
      <ChartStackedBar
        categories={categories}
        series={series}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-stacked-bar-legend"]',
      ),
    ).toBeNull();
  });

  it('toggles series visibility on legend click (uncontrolled)', () => {
    const { container } = render(
      <ChartStackedBar
        categories={categories}
        series={series}
      />,
    );
    const button = container.querySelector(
      '[data-section="chart-stacked-bar-legend-button"][data-series-id="b"]',
    );
    fireEvent.click(button!);
    const root = container.querySelector(
      '[data-section="chart-stacked-bar"]',
    );
    expect(root?.getAttribute('data-visible-count')).toBe('2');
    const item = container.querySelector(
      '[data-section="chart-stacked-bar-legend-item"][data-series-id="b"]',
    );
    expect(item?.getAttribute('data-series-hidden')).toBe(
      'true',
    );
  });

  it('respects controlled hiddenSeries prop', () => {
    const onChange = vi.fn();
    const { container } = render(
      <ChartStackedBar
        categories={categories}
        series={series}
        hiddenSeries={['a']}
        onHiddenSeriesChange={onChange}
      />,
    );
    expect(
      container
        .querySelector('[data-section="chart-stacked-bar"]')
        ?.getAttribute('data-visible-count'),
    ).toBe('2');
    const button = container.querySelector(
      '[data-section="chart-stacked-bar-legend-button"][data-series-id="a"]',
    );
    fireEvent.click(button!);
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('renders category labels by default', () => {
    const { container } = render(
      <ChartStackedBar
        categories={categories}
        series={series}
      />,
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-stacked-bar-category-label"]',
    );
    expect(labels.length).toBe(categories.length);
  });

  it('suppresses category labels when showLabels=false', () => {
    const { container } = render(
      <ChartStackedBar
        categories={categories}
        series={series}
        showLabels={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-stacked-bar-category-label"]',
      ),
    ).toBeNull();
  });

  it('renders axis ticks by default', () => {
    const { container } = render(
      <ChartStackedBar
        categories={categories}
        series={series}
      />,
    );
    const ticks = container.querySelectorAll(
      '[data-section="chart-stacked-bar-tick"]',
    );
    expect(ticks.length).toBeGreaterThan(0);
  });

  it('suppresses ticks + grid when both disabled', () => {
    const { container } = render(
      <ChartStackedBar
        categories={categories}
        series={series}
        showAxisTicks={false}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-stacked-bar-tick"]',
      ),
    ).toBeNull();
  });

  it('renders value labels when showValueLabels=true and segments are large enough', () => {
    const { container } = render(
      <ChartStackedBar
        categories={categories}
        series={series}
        showValueLabels
        width={800}
        height={600}
      />,
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-stacked-bar-value"]',
    );
    expect(labels.length).toBeGreaterThan(0);
  });

  it('omits value labels by default', () => {
    const { container } = render(
      <ChartStackedBar
        categories={categories}
        series={series}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-stacked-bar-value"]',
      ),
    ).toBeNull();
  });

  it('shows tooltip on segment hover with category + series + value + total', () => {
    const { container } = render(
      <ChartStackedBar
        categories={categories}
        series={series}
      />,
    );
    const seg = container.querySelector(
      '[data-section="chart-stacked-bar-rect"][data-series-id="a"][data-category="Q2"]',
    );
    fireEvent.mouseEnter(seg!);
    expect(
      container.querySelector(
        '[data-section="chart-stacked-bar-tooltip"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-stacked-bar-tooltip-category"]',
      )?.textContent,
    ).toBe('Q2');
    expect(
      container.querySelector(
        '[data-section="chart-stacked-bar-tooltip-series"]',
      )?.textContent,
    ).toBe('A');
    expect(
      container.querySelector(
        '[data-section="chart-stacked-bar-tooltip-value"]',
      )?.textContent,
    ).toContain('20');
    expect(
      container.querySelector(
        '[data-section="chart-stacked-bar-tooltip-total"]',
      )?.textContent,
    ).toContain('53'); // 20+25+8
  });

  it('hides tooltip on mouse-leave', () => {
    const { container } = render(
      <ChartStackedBar
        categories={categories}
        series={series}
      />,
    );
    const seg = container.querySelector(
      '[data-section="chart-stacked-bar-rect"]',
    );
    fireEvent.mouseEnter(seg!);
    fireEvent.mouseLeave(seg!);
    expect(
      container.querySelector(
        '[data-section="chart-stacked-bar-tooltip"]',
      ),
    ).toBeNull();
  });

  it('suppresses tooltip when showTooltip=false', () => {
    const { container } = render(
      <ChartStackedBar
        categories={categories}
        series={series}
        showTooltip={false}
      />,
    );
    const seg = container.querySelector(
      '[data-section="chart-stacked-bar-rect"]',
    );
    fireEvent.mouseEnter(seg!);
    expect(
      container.querySelector(
        '[data-section="chart-stacked-bar-tooltip"]',
      ),
    ).toBeNull();
  });

  it('uses formatValue in tooltip + ticks', () => {
    const { container } = render(
      <ChartStackedBar
        categories={categories}
        series={series}
        formatValue={(v) => `${v}u`}
      />,
    );
    const tick = container.querySelector(
      '[data-section="chart-stacked-bar-tick-label"]',
    );
    expect(tick?.textContent).toMatch(/u$/);
    const seg = container.querySelector(
      '[data-section="chart-stacked-bar-rect"]',
    );
    fireEvent.mouseEnter(seg!);
    expect(
      container.querySelector(
        '[data-section="chart-stacked-bar-tooltip-value"]',
      )?.textContent,
    ).toContain('u');
  });

  it('invokes onSegmentClick with full payload', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ChartStackedBar
        categories={categories}
        series={series}
        onSegmentClick={onClick}
      />,
    );
    const seg = container.querySelector(
      '[data-section="chart-stacked-bar-rect"][data-series-id="b"][data-category="Q3"]',
    );
    fireEvent.click(seg!);
    expect(onClick).toHaveBeenCalledTimes(1);
    const arg = onClick.mock.calls[0]?.[0];
    expect(arg?.series?.id).toBe('b');
    expect(arg?.category).toBe('Q3');
    expect(arg?.categoryIndex).toBe(2);
    expect(arg?.value).toBe(20);
  });

  it('invokes onSeriesClick when legend toggled', () => {
    const onSeries = vi.fn();
    const { container } = render(
      <ChartStackedBar
        categories={categories}
        series={series}
        onSeriesClick={onSeries}
      />,
    );
    const button = container.querySelector(
      '[data-section="chart-stacked-bar-legend-button"][data-series-id="c"]',
    );
    fireEvent.click(button!);
    expect(onSeries).toHaveBeenCalledTimes(1);
    const arg = onSeries.mock.calls[0]?.[0];
    expect(arg?.series?.id).toBe('c');
    expect(arg?.index).toBe(2);
    expect(arg?.hidden).toBe(true);
  });

  it('mirrors data-hovered on hovered segment', () => {
    const { container } = render(
      <ChartStackedBar
        categories={categories}
        series={series}
      />,
    );
    const segs = container.querySelectorAll(
      '[data-section="chart-stacked-bar-segment"]',
    );
    const rect = container.querySelector(
      '[data-section="chart-stacked-bar-rect"][data-series-id="a"][data-category="Q1"]',
    );
    fireEvent.mouseEnter(rect!);
    expect(segs[0]?.getAttribute('data-hovered')).toBe('true');
  });

  it('exposes role=graphics-symbol + aria-label per segment', () => {
    const { container } = render(
      <ChartStackedBar
        categories={categories}
        series={series}
      />,
    );
    const rect = container.querySelector(
      '[data-section="chart-stacked-bar-rect"]',
    );
    expect(rect?.getAttribute('role')).toBe('graphics-symbol');
    expect(rect?.getAttribute('aria-label')).toContain('Q1');
    expect(rect?.getAttribute('aria-label')).toContain('A');
  });

  it('mirrors animate flag on root', () => {
    const { container, rerender } = render(
      <ChartStackedBar
        categories={categories}
        series={series}
      />,
    );
    expect(
      container
        .querySelector('[data-section="chart-stacked-bar"]')
        ?.getAttribute('data-animate'),
    ).toBe('true');
    rerender(
      <ChartStackedBar
        categories={categories}
        series={series}
        animate={false}
      />,
    );
    expect(
      container
        .querySelector('[data-section="chart-stacked-bar"]')
        ?.getAttribute('data-animate'),
    ).toBe('false');
  });

  it('mirrors size on the svg', () => {
    const { container } = render(
      <ChartStackedBar
        categories={categories}
        series={series}
        width={800}
        height={400}
      />,
    );
    const svg = container.querySelector(
      '[data-section="chart-stacked-bar-svg"]',
    );
    expect(svg?.getAttribute('width')).toBe('800');
    expect(svg?.getAttribute('height')).toBe('400');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 800 400');
  });

  it('renders auto ARIA description by default', () => {
    const { container } = render(
      <ChartStackedBar
        categories={categories}
        series={series}
      />,
    );
    const desc = container.querySelector(
      '[data-section="chart-stacked-bar-aria-desc"]',
    );
    expect(desc?.textContent).toContain(
      'Stacked bar chart (vertical)',
    );
  });

  it('honours ariaDescription override', () => {
    const { container } = render(
      <ChartStackedBar
        categories={categories}
        series={series}
        ariaDescription="custom"
      />,
    );
    const desc = container.querySelector(
      '[data-section="chart-stacked-bar-aria-desc"]',
    );
    expect(desc?.textContent).toBe('custom');
  });

  it('handles empty data without crashing', () => {
    const { container } = render(
      <ChartStackedBar categories={[]} series={[]} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-stacked-bar"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelectorAll(
        '[data-section="chart-stacked-bar-segment"]',
      ).length,
    ).toBe(0);
  });

  it('forwards ref to the root region', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartStackedBar
        ref={ref}
        categories={categories}
        series={series}
      />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-stacked-bar',
    );
  });

  it('has a stable displayName', () => {
    expect(ChartStackedBar.displayName).toBe('ChartStackedBar');
  });
});
