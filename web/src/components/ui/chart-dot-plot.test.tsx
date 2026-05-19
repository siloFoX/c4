import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartDotPlot,
  DEFAULT_CHART_DOT_PLOT_DOT_COLOR,
  DEFAULT_CHART_DOT_PLOT_DOT_OPACITY,
  DEFAULT_CHART_DOT_PLOT_DOT_RADIUS,
  DEFAULT_CHART_DOT_PLOT_HEIGHT,
  DEFAULT_CHART_DOT_PLOT_JITTER,
  DEFAULT_CHART_DOT_PLOT_JITTER_SEED,
  DEFAULT_CHART_DOT_PLOT_MEDIAN_TICK_WIDTH,
  DEFAULT_CHART_DOT_PLOT_PADDING,
  DEFAULT_CHART_DOT_PLOT_TICK_COUNT,
  DEFAULT_CHART_DOT_PLOT_WIDTH,
  describeDotPlot,
  getDotPlotBounds,
  getDotPlotCategoryMedian,
  getDotPlotJitterOffset,
  getDotPlotPseudoRandom,
  getDotPlotTicks,
} from './chart-dot-plot';
import type { ChartDotPlotCategory } from './chart-dot-plot';

const categories: ChartDotPlotCategory[] = [
  {
    id: 'a',
    label: 'A',
    values: [1, 2, 3, 4, 5],
  },
  {
    id: 'b',
    label: 'B',
    values: [3, 4, 5, 6, 7, 8],
  },
  {
    id: 'c',
    label: 'C',
    values: [2, 4, 6],
    color: '#ff00aa',
  },
];

describe('chart-dot-plot pure helpers', () => {
  describe('getDotPlotBounds', () => {
    it('returns chart-wide min / max', () => {
      const b = getDotPlotBounds(categories);
      expect(b.min).toBe(1);
      expect(b.max).toBe(8);
    });
    it('drops non-finite values', () => {
      const b = getDotPlotBounds([
        {
          id: 'x',
          label: 'x',
          values: [1, Number.NaN, 5],
        },
      ]);
      expect(b.min).toBe(1);
      expect(b.max).toBe(5);
    });
    it('falls back to (0, 1) for empty / all-non-finite', () => {
      expect(getDotPlotBounds([])).toEqual({
        min: 0,
        max: 1,
      });
      expect(
        getDotPlotBounds([
          { id: 'x', label: 'x', values: [Number.NaN] },
        ]),
      ).toEqual({ min: 0, max: 1 });
    });
    it('expands collapsed range', () => {
      const b = getDotPlotBounds([
        { id: 'x', label: 'x', values: [5, 5, 5] },
      ]);
      expect(b.min).toBeLessThan(5);
      expect(b.max).toBeGreaterThan(5);
    });
  });

  describe('getDotPlotCategoryMedian', () => {
    it('computes the median of finite values', () => {
      expect(getDotPlotCategoryMedian([1, 2, 3, 4, 5])).toBe(3);
      expect(getDotPlotCategoryMedian([1, 2, 3, 4])).toBe(2.5);
    });
    it('drops non-finite before computing', () => {
      expect(
        getDotPlotCategoryMedian([1, 2, Number.NaN, 4, 5]),
      ).toBe(3);
    });
    it('returns null for empty / all-non-finite', () => {
      expect(getDotPlotCategoryMedian([])).toBeNull();
      expect(
        getDotPlotCategoryMedian([Number.NaN, Number.NaN]),
      ).toBeNull();
    });
  });

  describe('getDotPlotPseudoRandom', () => {
    it('returns a value in [0, 1)', () => {
      const r = getDotPlotPseudoRandom(1, 0);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(1);
    });
    it('is deterministic for the same inputs', () => {
      expect(getDotPlotPseudoRandom(42, 7)).toBe(
        getDotPlotPseudoRandom(42, 7),
      );
    });
    it('returns different values for different indices', () => {
      const a = getDotPlotPseudoRandom(1, 0);
      const b = getDotPlotPseudoRandom(1, 1);
      const c = getDotPlotPseudoRandom(1, 2);
      const d = getDotPlotPseudoRandom(1, 3);
      const set = new Set([a, b, c, d]);
      // 4 different indices should produce at least 3 different values
      expect(set.size).toBeGreaterThanOrEqual(3);
    });
    it('returns different values for different seeds', () => {
      expect(getDotPlotPseudoRandom(1, 5)).not.toBe(
        getDotPlotPseudoRandom(2, 5),
      );
    });
    it('handles non-finite seed by treating as 0', () => {
      const r = getDotPlotPseudoRandom(Number.NaN, 3);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(1);
    });
  });

  describe('getDotPlotJitterOffset', () => {
    it('returns 0 when jitter is 0', () => {
      expect(getDotPlotJitterOffset(1, 0, 0, 100)).toBe(0);
    });
    it('returns 0 when slotWidth is 0', () => {
      expect(getDotPlotJitterOffset(1, 0, 0.5, 0)).toBe(0);
    });
    it('returns 0 for non-finite inputs', () => {
      expect(
        getDotPlotJitterOffset(1, 0, Number.NaN, 100),
      ).toBe(0);
      expect(
        getDotPlotJitterOffset(1, 0, 0.5, Number.NaN),
      ).toBe(0);
    });
    it('stays within +/- (jitter * slotWidth / 2)', () => {
      for (let i = 0; i < 20; i += 1) {
        const off = getDotPlotJitterOffset(1, i, 0.4, 100);
        expect(Math.abs(off)).toBeLessThanOrEqual(0.4 * 100 / 2);
      }
    });
    it('is deterministic for the same inputs', () => {
      expect(getDotPlotJitterOffset(1, 5, 0.4, 100)).toBe(
        getDotPlotJitterOffset(1, 5, 0.4, 100),
      );
    });
  });

  describe('getDotPlotTicks', () => {
    it('emits evenly-spaced ticks', () => {
      expect(getDotPlotTicks(0, 100, 5)).toEqual([
        0, 25, 50, 75, 100,
      ]);
    });
    it('returns [min] for collapsed range', () => {
      expect(getDotPlotTicks(50, 50)).toEqual([50]);
    });
    it('defaults to DEFAULT_CHART_DOT_PLOT_TICK_COUNT', () => {
      expect(getDotPlotTicks(0, 100).length).toBe(
        DEFAULT_CHART_DOT_PLOT_TICK_COUNT,
      );
    });
  });

  describe('describeDotPlot', () => {
    it('returns "No data" for empty input', () => {
      expect(describeDotPlot([])).toBe('No data');
    });
    it('summarises every category with count + median', () => {
      const text = describeDotPlot(categories);
      expect(text).toContain('3 categories');
      expect(text).toContain('A n=5');
      expect(text).toContain('median 3');
      expect(text).toContain('B n=6');
    });
    it('honours formatValue', () => {
      const text = describeDotPlot(
        categories,
        (v) => `${v}u`,
      );
      expect(text).toContain('3u');
    });
  });

  it('exports default constants', () => {
    expect(DEFAULT_CHART_DOT_PLOT_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_DOT_PLOT_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_DOT_PLOT_PADDING).toBeGreaterThan(0);
    expect(DEFAULT_CHART_DOT_PLOT_DOT_RADIUS).toBeGreaterThan(0);
    expect(DEFAULT_CHART_DOT_PLOT_JITTER).toBeGreaterThan(0);
    expect(DEFAULT_CHART_DOT_PLOT_JITTER_SEED).toBeDefined();
    expect(DEFAULT_CHART_DOT_PLOT_DOT_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_DOT_PLOT_DOT_OPACITY).toBeGreaterThan(0);
    expect(
      DEFAULT_CHART_DOT_PLOT_MEDIAN_TICK_WIDTH,
    ).toBeGreaterThan(0);
    expect(DEFAULT_CHART_DOT_PLOT_TICK_COUNT).toBeGreaterThan(0);
  });
});

describe('<ChartDotPlot />', () => {
  it('renders a region with role + aria-label', () => {
    render(<ChartDotPlot categories={categories} />);
    const root = screen.getByRole('region', {
      name: 'Dot plot',
    });
    expect(root).toBeInTheDocument();
    expect(root).toHaveAttribute(
      'data-section',
      'chart-dot-plot',
    );
    expect(root).toHaveAttribute('data-category-count', '3');
  });

  it('renders a custom aria-label', () => {
    render(
      <ChartDotPlot
        categories={categories}
        ariaLabel="Test scores"
      />,
    );
    expect(
      screen.getByRole('region', { name: 'Test scores' }),
    ).toBeInTheDocument();
  });

  it('renders one dot per value in each category', () => {
    const { container } = render(
      <ChartDotPlot categories={categories} />,
    );
    const dots = container.querySelectorAll(
      '[data-section="chart-dot-plot-dot"]',
    );
    const totalValues = categories.reduce(
      (s, c) => s + c.values.length,
      0,
    );
    expect(dots.length).toBe(totalValues);
  });

  it('drops non-finite values from rendering', () => {
    const withNaN: ChartDotPlotCategory[] = [
      {
        id: 'x',
        label: 'X',
        values: [1, 2, Number.NaN, 3],
      },
    ];
    const { container } = render(
      <ChartDotPlot categories={withNaN} />,
    );
    const dots = container.querySelectorAll(
      '[data-section="chart-dot-plot-dot"]',
    );
    expect(dots.length).toBe(3);
  });

  it('mirrors category metadata on the group', () => {
    const { container } = render(
      <ChartDotPlot categories={categories} />,
    );
    const cGroup = container.querySelector(
      '[data-section="chart-dot-plot-category"][data-category-id="c"]',
    );
    expect(cGroup?.getAttribute('data-category-color')).toBe(
      '#ff00aa',
    );
    expect(cGroup?.getAttribute('data-category-count')).toBe(
      '3',
    );
    expect(cGroup?.getAttribute('data-category-median')).toBe(
      '4',
    );
  });

  it('uses defaultDotColor when category has no color', () => {
    const { container } = render(
      <ChartDotPlot categories={categories} />,
    );
    const aGroup = container.querySelector(
      '[data-section="chart-dot-plot-category"][data-category-id="a"]',
    );
    expect(aGroup?.getAttribute('data-category-color')).toBe(
      DEFAULT_CHART_DOT_PLOT_DOT_COLOR,
    );
  });

  it('renders median ticks by default', () => {
    const { container } = render(
      <ChartDotPlot categories={categories} />,
    );
    const medians = container.querySelectorAll(
      '[data-section="chart-dot-plot-median"]',
    );
    expect(medians.length).toBe(categories.length);
  });

  it('suppresses median ticks when showMedianTick=false', () => {
    const { container } = render(
      <ChartDotPlot
        categories={categories}
        showMedianTick={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-dot-plot-median"]',
      ),
    ).toBeNull();
  });

  it('renders axis ticks by default', () => {
    const { container } = render(
      <ChartDotPlot categories={categories} />,
    );
    const ticks = container.querySelectorAll(
      '[data-section="chart-dot-plot-tick"]',
    );
    expect(ticks.length).toBeGreaterThan(0);
  });

  it('suppresses axis ticks when showAxisTicks=false', () => {
    const { container } = render(
      <ChartDotPlot
        categories={categories}
        showAxisTicks={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-dot-plot-tick"]',
      ),
    ).toBeNull();
  });

  it('renders category labels by default', () => {
    const { container } = render(
      <ChartDotPlot categories={categories} />,
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-dot-plot-label"]',
    );
    expect(labels.length).toBe(categories.length);
    expect(labels[0]?.textContent).toBe('A');
  });

  it('suppresses labels when showLabels=false', () => {
    const { container } = render(
      <ChartDotPlot
        categories={categories}
        showLabels={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-dot-plot-label"]',
      ),
    ).toBeNull();
  });

  it('omits legend by default', () => {
    const { container } = render(
      <ChartDotPlot categories={categories} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-dot-plot-legend"]',
      ),
    ).toBeNull();
  });

  it('renders legend when showLegend=true', () => {
    const { container } = render(
      <ChartDotPlot categories={categories} showLegend />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-dot-plot-legend"]',
      ),
    ).not.toBeNull();
    const items = container.querySelectorAll(
      '[data-section="chart-dot-plot-legend-item"]',
    );
    expect(items.length).toBe(categories.length);
  });

  it('mirrors jitter + seed on root', () => {
    const { container } = render(
      <ChartDotPlot
        categories={categories}
        jitter={0.42}
        jitterSeed={7}
      />,
    );
    expect(
      container
        .querySelector('[data-section="chart-dot-plot"]')
        ?.getAttribute('data-jitter'),
    ).toBe('0.42');
    expect(
      container
        .querySelector('[data-section="chart-dot-plot"]')
        ?.getAttribute('data-jitter-seed'),
    ).toBe('7');
  });

  it('produces deterministic jitter for same seed (snapshot)', () => {
    const { container: a } = render(
      <ChartDotPlot
        categories={categories}
        jitter={0.4}
        jitterSeed={5}
      />,
    );
    const { container: b } = render(
      <ChartDotPlot
        categories={categories}
        jitter={0.4}
        jitterSeed={5}
      />,
    );
    const cxA = Array.from(
      a.querySelectorAll(
        '[data-section="chart-dot-plot-dot"]',
      ),
    ).map((d) => d.getAttribute('cx'));
    const cxB = Array.from(
      b.querySelectorAll(
        '[data-section="chart-dot-plot-dot"]',
      ),
    ).map((d) => d.getAttribute('cx'));
    expect(cxA).toEqual(cxB);
  });

  it('shows tooltip on dot hover with category + value', () => {
    const { container } = render(
      <ChartDotPlot categories={categories} />,
    );
    const aDot = container.querySelector(
      '[data-section="chart-dot-plot-dot"][data-category-id="a"][data-value-index="2"]',
    );
    fireEvent.mouseEnter(aDot!);
    const tip = container.querySelector(
      '[data-section="chart-dot-plot-tooltip"]',
    );
    expect(tip).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-dot-plot-tooltip-label"]',
      )?.textContent,
    ).toBe('A');
    expect(
      container.querySelector(
        '[data-section="chart-dot-plot-tooltip-value"]',
      )?.textContent,
    ).toBe('3');
  });

  it('hides tooltip on mouse-leave', () => {
    const { container } = render(
      <ChartDotPlot categories={categories} />,
    );
    const dot = container.querySelector(
      '[data-section="chart-dot-plot-dot"]',
    );
    fireEvent.mouseEnter(dot!);
    fireEvent.mouseLeave(dot!);
    expect(
      container.querySelector(
        '[data-section="chart-dot-plot-tooltip"]',
      ),
    ).toBeNull();
  });

  it('suppresses tooltip when showTooltip=false', () => {
    const { container } = render(
      <ChartDotPlot
        categories={categories}
        showTooltip={false}
      />,
    );
    const dot = container.querySelector(
      '[data-section="chart-dot-plot-dot"]',
    );
    fireEvent.mouseEnter(dot!);
    expect(
      container.querySelector(
        '[data-section="chart-dot-plot-tooltip"]',
      ),
    ).toBeNull();
  });

  it('uses formatValue in tooltip + ticks', () => {
    const { container } = render(
      <ChartDotPlot
        categories={categories}
        formatValue={(v) => `${v}u`}
      />,
    );
    const tick = container.querySelector(
      '[data-section="chart-dot-plot-tick-label"]',
    );
    expect(tick?.textContent).toMatch(/u$/);
    const dot = container.querySelector(
      '[data-section="chart-dot-plot-dot"][data-category-id="a"][data-value-index="0"]',
    );
    fireEvent.mouseEnter(dot!);
    expect(
      container.querySelector(
        '[data-section="chart-dot-plot-tooltip-value"]',
      )?.textContent,
    ).toBe('1u');
  });

  it('mirrors data-hovered on hovered dot', () => {
    const { container } = render(
      <ChartDotPlot categories={categories} />,
    );
    const dots = container.querySelectorAll(
      '[data-section="chart-dot-plot-dot"]',
    );
    fireEvent.mouseEnter(dots[3]!);
    expect(dots[3]?.getAttribute('data-hovered')).toBe('true');
    expect(dots[0]?.getAttribute('data-hovered')).toBe('false');
  });

  it('invokes onDotClick with category + index + value + valueIndex', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ChartDotPlot
        categories={categories}
        onDotClick={onClick}
      />,
    );
    const dot = container.querySelector(
      '[data-section="chart-dot-plot-dot"][data-category-id="b"][data-value-index="3"]',
    );
    fireEvent.click(dot!);
    expect(onClick).toHaveBeenCalledTimes(1);
    const arg = onClick.mock.calls[0]?.[0];
    expect(arg?.category?.id).toBe('b');
    expect(arg?.categoryIndex).toBe(1);
    expect(arg?.value).toBe(6);
    expect(arg?.valueIndex).toBe(3);
  });

  it('exposes role=graphics-symbol + aria-label per dot', () => {
    const { container } = render(
      <ChartDotPlot categories={categories} />,
    );
    const dot = container.querySelector(
      '[data-section="chart-dot-plot-dot"]',
    );
    expect(dot?.getAttribute('role')).toBe('graphics-symbol');
    expect(dot?.getAttribute('aria-label')).toContain('A');
    expect(dot?.getAttribute('aria-label')).toContain('1');
  });

  it('mirrors animate flag on the root', () => {
    const { container, rerender } = render(
      <ChartDotPlot categories={categories} />,
    );
    expect(
      container
        .querySelector('[data-section="chart-dot-plot"]')
        ?.getAttribute('data-animate'),
    ).toBe('true');
    rerender(
      <ChartDotPlot
        categories={categories}
        animate={false}
      />,
    );
    expect(
      container
        .querySelector('[data-section="chart-dot-plot"]')
        ?.getAttribute('data-animate'),
    ).toBe('false');
  });

  it('mirrors size on the svg', () => {
    const { container } = render(
      <ChartDotPlot
        categories={categories}
        width={800}
        height={400}
      />,
    );
    const svg = container.querySelector(
      '[data-section="chart-dot-plot-svg"]',
    );
    expect(svg?.getAttribute('width')).toBe('800');
    expect(svg?.getAttribute('height')).toBe('400');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 800 400');
  });

  it('renders auto-generated ARIA description by default', () => {
    const { container } = render(
      <ChartDotPlot categories={categories} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-dot-plot-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Dot plot with 3 categories');
  });

  it('honours ariaDescription override', () => {
    const { container } = render(
      <ChartDotPlot
        categories={categories}
        ariaDescription="custom"
      />,
    );
    const desc = container.querySelector(
      '[data-section="chart-dot-plot-aria-desc"]',
    );
    expect(desc?.textContent).toBe('custom');
  });

  it('handles empty categories without crashing', () => {
    const { container } = render(
      <ChartDotPlot categories={[]} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-dot-plot"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelectorAll(
        '[data-section="chart-dot-plot-dot"]',
      ).length,
    ).toBe(0);
  });

  it('forwards ref to the root region', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartDotPlot
        ref={ref}
        categories={categories}
      />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-dot-plot',
    );
  });

  it('has a stable displayName', () => {
    expect(ChartDotPlot.displayName).toBe('ChartDotPlot');
  });
});
