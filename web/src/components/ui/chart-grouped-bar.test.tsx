import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartGroupedBar,
  DEFAULT_CHART_GROUPED_BAR_BAR_GAP,
  DEFAULT_CHART_GROUPED_BAR_GROUP_GAP,
  DEFAULT_CHART_GROUPED_BAR_HEIGHT,
  DEFAULT_CHART_GROUPED_BAR_PADDING,
  DEFAULT_CHART_GROUPED_BAR_TICK_COUNT,
  DEFAULT_CHART_GROUPED_BAR_WIDTH,
  computeGroupedBarLayout,
  describeGroupedBarChart,
  getGroupedBarMaxValue,
  getGroupedBarTicks,
} from './chart-grouped-bar';
import type { ChartGroupedBarSeries } from './chart-grouped-bar';

const categories = ['Q1', 'Q2', 'Q3', 'Q4'];

const series: ChartGroupedBarSeries[] = [
  { id: 'a', label: 'A', data: [10, 20, 30, 40] },
  { id: 'b', label: 'B', data: [15, 25, 20, 35] },
  { id: 'c', label: 'C', data: [5, 8, 12, 18], color: '#ff00aa' },
];

describe('chart-grouped-bar pure helpers', () => {
  describe('getGroupedBarMaxValue', () => {
    it('returns largest positive finite value across visible series', () => {
      expect(getGroupedBarMaxValue(series, new Set())).toBe(40);
    });
    it('respects hidden series', () => {
      expect(getGroupedBarMaxValue(series, new Set(['a']))).toBe(
        35,
      );
    });
    it('ignores non-finite + non-positive', () => {
      expect(
        getGroupedBarMaxValue(
          [
            {
              id: 'x',
              label: 'x',
              data: [Number.NaN, -5, 0, 10],
            },
          ],
          new Set(),
        ),
      ).toBe(10);
    });
    it('falls back to 1 for empty / all-zero / all-non-finite', () => {
      expect(getGroupedBarMaxValue([], new Set())).toBe(1);
      expect(
        getGroupedBarMaxValue(
          [{ id: 'x', label: 'x', data: [0, 0] }],
          new Set(),
        ),
      ).toBe(1);
      expect(
        getGroupedBarMaxValue(
          [
            {
              id: 'x',
              label: 'x',
              data: [Number.NaN, Number.NaN],
            },
          ],
          new Set(),
        ),
      ).toBe(1);
    });
  });

  describe('computeGroupedBarLayout', () => {
    it('returns [] for empty input', () => {
      expect(
        computeGroupedBarLayout([], series, new Set(), 100, 100, 0, 0, 0, 0),
      ).toEqual([]);
      expect(
        computeGroupedBarLayout(
          categories,
          [],
          new Set(),
          100,
          100,
          0,
          0,
          0,
          0,
        ),
      ).toEqual([]);
      expect(
        computeGroupedBarLayout(
          categories,
          series,
          new Set(['a', 'b', 'c']),
          100,
          100,
          0,
          0,
          0,
          0,
        ),
      ).toEqual([]);
    });
    it('emits one rect per (visible series, category) pair', () => {
      const layout = computeGroupedBarLayout(
        categories,
        series,
        new Set(),
        400,
        100,
        0,
        0,
        0,
        0,
      );
      expect(layout.length).toBe(categories.length * series.length);
    });
    it('skips hidden series from the layout', () => {
      const layout = computeGroupedBarLayout(
        categories,
        series,
        new Set(['b']),
        400,
        100,
        0,
        0,
        0,
        0,
      );
      const ids = new Set(layout.map((r) => r.series.id));
      expect(ids.has('a')).toBe(true);
      expect(ids.has('c')).toBe(true);
      expect(ids.has('b')).toBe(false);
    });
    it('bar heights are proportional to value', () => {
      const layout = computeGroupedBarLayout(
        categories,
        series,
        new Set(),
        400,
        100,
        0,
        0,
        0,
        0,
      );
      // max value across series is 40 (a[3]); innerHeight = 100
      const tallest = layout.reduce(
        (best, r) => (r.h > best.h ? r : best),
        layout[0]!,
      );
      expect(tallest.value).toBe(40);
      expect(tallest.h).toBeCloseTo(100, 5);
    });
    it('bars within a slot are side-by-side (no overlap)', () => {
      const layout = computeGroupedBarLayout(
        categories,
        series,
        new Set(),
        400,
        100,
        0,
        0,
        0,
        0,
      );
      // For category 0, look at the three visible bars; they should be ordered left-to-right
      const cat0 = layout
        .filter((r) => r.categoryIndex === 0)
        .sort((a, b) => a.seriesIndex - b.seriesIndex);
      for (let i = 0; i < cat0.length - 1; i += 1) {
        expect(cat0[i + 1]!.x).toBeGreaterThanOrEqual(
          cat0[i]!.x + cat0[i]!.w - 0.01,
        );
      }
    });
    it('clamps non-finite / non-positive values to zero height', () => {
      const layout = computeGroupedBarLayout(
        categories,
        [
          {
            id: 'x',
            label: 'X',
            data: [-5, Number.NaN, 0, 10],
          },
        ],
        new Set(),
        400,
        100,
        0,
        0,
        0,
        0,
      );
      expect(layout[0]?.h).toBe(0);
      expect(layout[1]?.h).toBe(0);
      expect(layout[2]?.h).toBe(0);
      expect(layout[3]?.h).toBeCloseTo(100, 5);
    });
  });

  describe('getGroupedBarTicks', () => {
    it('emits evenly-spaced ticks 0..max', () => {
      expect(getGroupedBarTicks(100, 5)).toEqual([
        0, 25, 50, 75, 100,
      ]);
    });
    it('defaults to DEFAULT_CHART_GROUPED_BAR_TICK_COUNT', () => {
      expect(getGroupedBarTicks(100).length).toBe(
        DEFAULT_CHART_GROUPED_BAR_TICK_COUNT,
      );
    });
    it('returns [0] for non-positive max', () => {
      expect(getGroupedBarTicks(0)).toEqual([0]);
      expect(getGroupedBarTicks(-5)).toEqual([0]);
    });
    it('clamps min count to 2', () => {
      expect(getGroupedBarTicks(100, 1)).toEqual([0, 100]);
    });
  });

  describe('describeGroupedBarChart', () => {
    it('returns "No data" for empty input', () => {
      expect(
        describeGroupedBarChart([], [], new Set()),
      ).toBe('No data');
      expect(
        describeGroupedBarChart(categories, [], new Set()),
      ).toBe('No data');
    });
    it('summarises categories + visible series', () => {
      const text = describeGroupedBarChart(
        categories,
        series,
        new Set(),
      );
      expect(text).toContain('4 categories');
      expect(text).toContain('3 visible series');
      expect(text).toContain('A sum');
    });
    it('excludes hidden series from visible count + sums', () => {
      const text = describeGroupedBarChart(
        categories,
        series,
        new Set(['b']),
      );
      expect(text).toContain('2 visible series');
      expect(text).not.toContain('B sum');
    });
    it('honours formatValue', () => {
      const text = describeGroupedBarChart(
        categories,
        series,
        new Set(),
        (v) => `${v}u`,
      );
      expect(text).toContain('u');
    });
  });

  it('exports default constants', () => {
    expect(DEFAULT_CHART_GROUPED_BAR_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_GROUPED_BAR_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_GROUPED_BAR_PADDING).toBeGreaterThan(0);
    expect(
      DEFAULT_CHART_GROUPED_BAR_GROUP_GAP,
    ).toBeGreaterThanOrEqual(0);
    expect(
      DEFAULT_CHART_GROUPED_BAR_BAR_GAP,
    ).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_CHART_GROUPED_BAR_TICK_COUNT).toBeGreaterThan(
      0,
    );
  });
});

describe('<ChartGroupedBar />', () => {
  it('renders a region with role + aria-label', () => {
    render(
      <ChartGroupedBar categories={categories} series={series} />,
    );
    const root = screen.getByRole('region', {
      name: 'Grouped bar chart',
    });
    expect(root).toBeInTheDocument();
    expect(root).toHaveAttribute(
      'data-section',
      'chart-grouped-bar',
    );
    expect(root).toHaveAttribute('data-category-count', '4');
    expect(root).toHaveAttribute('data-series-count', '3');
    expect(root).toHaveAttribute('data-visible-count', '3');
    expect(root).toHaveAttribute('data-bar-count', '12');
  });

  it('renders a custom aria-label', () => {
    render(
      <ChartGroupedBar
        categories={categories}
        series={series}
        ariaLabel="Revenue split"
      />,
    );
    expect(
      screen.getByRole('region', { name: 'Revenue split' }),
    ).toBeInTheDocument();
  });

  it('renders one bar per (category, visible series) pair', () => {
    const { container } = render(
      <ChartGroupedBar categories={categories} series={series} />,
    );
    const bars = container.querySelectorAll(
      '[data-section="chart-grouped-bar-bar"]',
    );
    expect(bars.length).toBe(categories.length * series.length);
  });

  it('mirrors bar metadata on the group', () => {
    const { container } = render(
      <ChartGroupedBar categories={categories} series={series} />,
    );
    const bar = container.querySelector(
      '[data-section="chart-grouped-bar-bar"][data-series-id="c"][data-category-index="2"]',
    );
    expect(bar?.getAttribute('data-bar-value')).toBe('12');
    expect(bar?.getAttribute('data-bar-color')).toBe('#ff00aa');
  });

  it('uses default palette when series has no color', () => {
    const { container } = render(
      <ChartGroupedBar categories={categories} series={series} />,
    );
    const aBar = container.querySelector(
      '[data-section="chart-grouped-bar-bar"][data-series-id="a"][data-category-index="0"]',
    );
    expect(aBar?.getAttribute('data-bar-color')).toMatch(/^#/);
  });

  it('renders category labels by default', () => {
    const { container } = render(
      <ChartGroupedBar categories={categories} series={series} />,
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-grouped-bar-label"]',
    );
    expect(labels.length).toBe(categories.length);
    expect(labels[0]?.textContent).toBe('Q1');
  });

  it('suppresses category labels when showLabels=false', () => {
    const { container } = render(
      <ChartGroupedBar
        categories={categories}
        series={series}
        showLabels={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-grouped-bar-label"]',
      ),
    ).toBeNull();
  });

  it('renders value-on-top text when showValues=true', () => {
    const { container } = render(
      <ChartGroupedBar
        categories={categories}
        series={series}
        showValues
      />,
    );
    const values = container.querySelectorAll(
      '[data-section="chart-grouped-bar-value"]',
    );
    expect(values.length).toBeGreaterThan(0);
  });

  it('omits value-on-top text by default', () => {
    const { container } = render(
      <ChartGroupedBar categories={categories} series={series} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-grouped-bar-value"]',
      ),
    ).toBeNull();
  });

  it('renders axis ticks by default', () => {
    const { container } = render(
      <ChartGroupedBar categories={categories} series={series} />,
    );
    const ticks = container.querySelectorAll(
      '[data-section="chart-grouped-bar-tick"]',
    );
    expect(ticks.length).toBeGreaterThan(0);
  });

  it('suppresses ticks + grid when both disabled', () => {
    const { container } = render(
      <ChartGroupedBar
        categories={categories}
        series={series}
        showAxisTicks={false}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-grouped-bar-tick"]',
      ),
    ).toBeNull();
  });

  it('renders a legend by default with one item per series', () => {
    const { container } = render(
      <ChartGroupedBar categories={categories} series={series} />,
    );
    const items = container.querySelectorAll(
      '[data-section="chart-grouped-bar-legend-item"]',
    );
    expect(items.length).toBe(series.length);
  });

  it('suppresses legend when showLegend=false', () => {
    const { container } = render(
      <ChartGroupedBar
        categories={categories}
        series={series}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-grouped-bar-legend"]',
      ),
    ).toBeNull();
  });

  it('toggles series visibility on legend click (uncontrolled)', () => {
    const { container } = render(
      <ChartGroupedBar categories={categories} series={series} />,
    );
    const button = container.querySelector(
      '[data-section="chart-grouped-bar-legend-button"][data-series-id="b"]',
    );
    fireEvent.click(button!);
    const root = container.querySelector(
      '[data-section="chart-grouped-bar"]',
    );
    expect(root?.getAttribute('data-visible-count')).toBe('2');
    expect(root?.getAttribute('data-bar-count')).toBe(
      `${categories.length * 2}`,
    );
    const item = container.querySelector(
      '[data-section="chart-grouped-bar-legend-item"][data-series-id="b"]',
    );
    expect(item?.getAttribute('data-series-hidden')).toBe('true');
    fireEvent.click(button!);
    expect(root?.getAttribute('data-visible-count')).toBe('3');
  });

  it('respects controlled hiddenSeries prop', () => {
    const onChange = vi.fn();
    const { container } = render(
      <ChartGroupedBar
        categories={categories}
        series={series}
        hiddenSeries={['a']}
        onHiddenSeriesChange={onChange}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-grouped-bar"]',
    );
    expect(root?.getAttribute('data-visible-count')).toBe('2');
    const button = container.querySelector(
      '[data-section="chart-grouped-bar-legend-button"][data-series-id="a"]',
    );
    fireEvent.click(button!);
    expect(onChange).toHaveBeenCalledWith([]);
    // root stays controlled
    expect(root?.getAttribute('data-visible-count')).toBe('2');
  });

  it('honours defaultHiddenSeries initially', () => {
    const { container } = render(
      <ChartGroupedBar
        categories={categories}
        series={series}
        defaultHiddenSeries={['c']}
      />,
    );
    expect(
      container
        .querySelector('[data-section="chart-grouped-bar"]')
        ?.getAttribute('data-visible-count'),
    ).toBe('2');
  });

  it('legend placement default bottom + right opt-in', () => {
    const { container, rerender } = render(
      <ChartGroupedBar categories={categories} series={series} />,
    );
    expect(
      container
        .querySelector(
          '[data-section="chart-grouped-bar-legend"]',
        )
        ?.getAttribute('data-placement'),
    ).toBe('bottom');
    rerender(
      <ChartGroupedBar
        categories={categories}
        series={series}
        legendPlacement="right"
      />,
    );
    expect(
      container
        .querySelector(
          '[data-section="chart-grouped-bar-legend"]',
        )
        ?.getAttribute('data-placement'),
    ).toBe('right');
  });

  it('shows tooltip on bar hover with category + series + value', () => {
    const { container } = render(
      <ChartGroupedBar categories={categories} series={series} />,
    );
    const bar = container.querySelector(
      '[data-section="chart-grouped-bar-rect"][data-series-id="a"][data-category="Q2"]',
    );
    fireEvent.mouseEnter(bar!);
    const tip = container.querySelector(
      '[data-section="chart-grouped-bar-tooltip"]',
    );
    expect(tip).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-grouped-bar-tooltip-category"]',
      )?.textContent,
    ).toBe('Q2');
    expect(
      container.querySelector(
        '[data-section="chart-grouped-bar-tooltip-series"]',
      )?.textContent,
    ).toBe('A');
    expect(
      container.querySelector(
        '[data-section="chart-grouped-bar-tooltip-value"]',
      )?.textContent,
    ).toContain('20');
  });

  it('hides tooltip on mouse-leave', () => {
    const { container } = render(
      <ChartGroupedBar categories={categories} series={series} />,
    );
    const bar = container.querySelector(
      '[data-section="chart-grouped-bar-rect"]',
    );
    fireEvent.mouseEnter(bar!);
    fireEvent.mouseLeave(bar!);
    expect(
      container.querySelector(
        '[data-section="chart-grouped-bar-tooltip"]',
      ),
    ).toBeNull();
  });

  it('suppresses tooltip when showTooltip=false', () => {
    const { container } = render(
      <ChartGroupedBar
        categories={categories}
        series={series}
        showTooltip={false}
      />,
    );
    const bar = container.querySelector(
      '[data-section="chart-grouped-bar-rect"]',
    );
    fireEvent.mouseEnter(bar!);
    expect(
      container.querySelector(
        '[data-section="chart-grouped-bar-tooltip"]',
      ),
    ).toBeNull();
  });

  it('uses formatValue in tooltip + ticks', () => {
    const { container } = render(
      <ChartGroupedBar
        categories={categories}
        series={series}
        formatValue={(v) => `${v}u`}
      />,
    );
    const tick = container.querySelector(
      '[data-section="chart-grouped-bar-tick-label"]',
    );
    expect(tick?.textContent).toMatch(/u$/);
    const bar = container.querySelector(
      '[data-section="chart-grouped-bar-rect"]',
    );
    fireEvent.mouseEnter(bar!);
    expect(
      container.querySelector(
        '[data-section="chart-grouped-bar-tooltip-value"]',
      )?.textContent,
    ).toContain('u');
  });

  it('invokes onBarClick with full payload', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ChartGroupedBar
        categories={categories}
        series={series}
        onBarClick={onClick}
      />,
    );
    const bar = container.querySelector(
      '[data-section="chart-grouped-bar-rect"][data-series-id="b"][data-category="Q3"]',
    );
    fireEvent.click(bar!);
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
      <ChartGroupedBar
        categories={categories}
        series={series}
        onSeriesClick={onSeries}
      />,
    );
    const button = container.querySelector(
      '[data-section="chart-grouped-bar-legend-button"][data-series-id="c"]',
    );
    fireEvent.click(button!);
    expect(onSeries).toHaveBeenCalledTimes(1);
    const arg = onSeries.mock.calls[0]?.[0];
    expect(arg?.series?.id).toBe('c');
    expect(arg?.index).toBe(2);
    expect(arg?.hidden).toBe(true);
  });

  it('mirrors data-hovered on hovered bar', () => {
    const { container } = render(
      <ChartGroupedBar categories={categories} series={series} />,
    );
    const bars = container.querySelectorAll(
      '[data-section="chart-grouped-bar-bar"]',
    );
    const rect = container.querySelector(
      '[data-section="chart-grouped-bar-rect"][data-series-id="a"][data-category="Q1"]',
    );
    fireEvent.mouseEnter(rect!);
    expect(bars[0]?.getAttribute('data-hovered')).toBe('true');
  });

  it('exposes role=graphics-symbol + aria-label per bar', () => {
    const { container } = render(
      <ChartGroupedBar categories={categories} series={series} />,
    );
    const rect = container.querySelector(
      '[data-section="chart-grouped-bar-rect"]',
    );
    expect(rect?.getAttribute('role')).toBe('graphics-symbol');
    expect(rect?.getAttribute('aria-label')).toContain('Q1');
    expect(rect?.getAttribute('aria-label')).toContain('A');
  });

  it('mirrors animate flag on root', () => {
    const { container, rerender } = render(
      <ChartGroupedBar categories={categories} series={series} />,
    );
    expect(
      container
        .querySelector('[data-section="chart-grouped-bar"]')
        ?.getAttribute('data-animate'),
    ).toBe('true');
    rerender(
      <ChartGroupedBar
        categories={categories}
        series={series}
        animate={false}
      />,
    );
    expect(
      container
        .querySelector('[data-section="chart-grouped-bar"]')
        ?.getAttribute('data-animate'),
    ).toBe('false');
  });

  it('mirrors size on the svg', () => {
    const { container } = render(
      <ChartGroupedBar
        categories={categories}
        series={series}
        width={800}
        height={400}
      />,
    );
    const svg = container.querySelector(
      '[data-section="chart-grouped-bar-svg"]',
    );
    expect(svg?.getAttribute('width')).toBe('800');
    expect(svg?.getAttribute('height')).toBe('400');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 800 400');
  });

  it('renders auto-generated ARIA description by default', () => {
    const { container } = render(
      <ChartGroupedBar categories={categories} series={series} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-grouped-bar-aria-desc"]',
    );
    expect(desc?.textContent).toContain(
      'Grouped bar chart with 4 categories',
    );
  });

  it('honours ariaDescription override', () => {
    const { container } = render(
      <ChartGroupedBar
        categories={categories}
        series={series}
        ariaDescription="custom"
      />,
    );
    const desc = container.querySelector(
      '[data-section="chart-grouped-bar-aria-desc"]',
    );
    expect(desc?.textContent).toBe('custom');
  });

  it('handles empty data without crashing', () => {
    const { container } = render(
      <ChartGroupedBar categories={[]} series={[]} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-grouped-bar"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelectorAll(
        '[data-section="chart-grouped-bar-bar"]',
      ).length,
    ).toBe(0);
  });

  it('forwards ref to the root region', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartGroupedBar
        ref={ref}
        categories={categories}
        series={series}
      />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-grouped-bar',
    );
  });

  it('has a stable displayName', () => {
    expect(ChartGroupedBar.displayName).toBe('ChartGroupedBar');
  });
});
