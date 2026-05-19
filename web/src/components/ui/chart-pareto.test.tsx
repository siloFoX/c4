import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartPareto,
  DEFAULT_CHART_PARETO_BAR_COLOR,
  DEFAULT_CHART_PARETO_BAR_GAP,
  DEFAULT_CHART_PARETO_HEIGHT,
  DEFAULT_CHART_PARETO_LINE_COLOR,
  DEFAULT_CHART_PARETO_PADDING,
  DEFAULT_CHART_PARETO_THRESHOLD,
  DEFAULT_CHART_PARETO_THRESHOLD_COLOR,
  DEFAULT_CHART_PARETO_TICK_COUNT,
  DEFAULT_CHART_PARETO_WIDTH,
  describeParetoChart,
  findParetoThresholdIndex,
  getParetoCumulative,
  getParetoCumulativePercent,
  getParetoTicks,
  getParetoTotal,
  sortParetoCategoriesDesc,
} from './chart-pareto';
import type { ChartParetoCategory } from './chart-pareto';

const categories: ChartParetoCategory[] = [
  { id: 'b', label: 'B', value: 30 },
  { id: 'a', label: 'A', value: 50 },
  { id: 'c', label: 'C', value: 15 },
  { id: 'd', label: 'D', value: 5 },
];

describe('chart-pareto pure helpers', () => {
  describe('sortParetoCategoriesDesc', () => {
    it('returns categories sorted by value desc', () => {
      const sorted = sortParetoCategoriesDesc(categories);
      expect(sorted.map((c) => c.id)).toEqual([
        'a',
        'b',
        'c',
        'd',
      ]);
    });
    it('drops non-positive / non-finite values', () => {
      const sorted = sortParetoCategoriesDesc([
        { id: 'x', label: 'x', value: 10 },
        { id: 'y', label: 'y', value: 0 },
        { id: 'z', label: 'z', value: -5 },
        { id: 'q', label: 'q', value: Number.NaN },
      ]);
      expect(sorted.length).toBe(1);
      expect(sorted[0]?.id).toBe('x');
    });
    it('does not mutate the input', () => {
      const input = categories.slice();
      sortParetoCategoriesDesc(input);
      expect(input).toEqual(categories);
    });
    it('handles empty input', () => {
      expect(sortParetoCategoriesDesc([])).toEqual([]);
    });
  });

  describe('getParetoTotal', () => {
    it('sums positive finite values', () => {
      expect(getParetoTotal(categories)).toBe(100);
    });
    it('returns 0 for empty / all-non-positive', () => {
      expect(getParetoTotal([])).toBe(0);
      expect(
        getParetoTotal([
          { id: 'x', label: 'x', value: 0 },
          { id: 'y', label: 'y', value: -5 },
        ]),
      ).toBe(0);
    });
  });

  describe('getParetoCumulative', () => {
    it('returns running totals', () => {
      const cum = getParetoCumulative(
        sortParetoCategoriesDesc(categories),
      );
      expect(cum).toEqual([50, 80, 95, 100]);
    });
    it('skips non-positive values but preserves length', () => {
      const cum = getParetoCumulative([
        { id: 'a', label: 'a', value: 10 },
        { id: 'b', label: 'b', value: 0 },
        { id: 'c', label: 'c', value: 5 },
      ]);
      expect(cum).toEqual([10, 10, 15]);
    });
  });

  describe('getParetoCumulativePercent', () => {
    it('returns running fractions of total', () => {
      const cum = getParetoCumulativePercent(
        sortParetoCategoriesDesc(categories),
      );
      expect(cum).toEqual([0.5, 0.8, 0.95, 1]);
    });
    it('returns all zeros for zero total', () => {
      const cum = getParetoCumulativePercent([
        { id: 'a', label: 'a', value: 0 },
        { id: 'b', label: 'b', value: 0 },
      ]);
      expect(cum).toEqual([0, 0]);
    });
  });

  describe('findParetoThresholdIndex', () => {
    it('returns the first index where cumulative crosses threshold', () => {
      const cum = [0.5, 0.8, 0.95, 1];
      expect(findParetoThresholdIndex(cum, 0.8)).toBe(1);
      expect(findParetoThresholdIndex(cum, 0.5)).toBe(0);
      expect(findParetoThresholdIndex(cum, 0.99)).toBe(3);
    });
    it('returns -1 when nothing crosses', () => {
      expect(findParetoThresholdIndex([0.1, 0.3], 0.5)).toBe(
        -1,
      );
    });
    it('clamps threshold into [0, 1]', () => {
      const cum = [0.5, 0.8, 0.95, 1];
      expect(findParetoThresholdIndex(cum, 2)).toBe(3);
      expect(findParetoThresholdIndex(cum, -0.5)).toBe(0);
    });
    it('returns -1 for non-finite threshold', () => {
      expect(
        findParetoThresholdIndex([0.5], Number.NaN),
      ).toBe(-1);
    });
  });

  describe('getParetoTicks', () => {
    it('emits evenly-spaced ticks', () => {
      expect(getParetoTicks(100, 5)).toEqual([
        0, 25, 50, 75, 100,
      ]);
    });
    it('defaults to DEFAULT_CHART_PARETO_TICK_COUNT', () => {
      expect(getParetoTicks(100).length).toBe(
        DEFAULT_CHART_PARETO_TICK_COUNT,
      );
    });
    it('returns [0] for non-positive max', () => {
      expect(getParetoTicks(0)).toEqual([0]);
      expect(getParetoTicks(-1)).toEqual([0]);
    });
    it('clamps minimum count to 2', () => {
      expect(getParetoTicks(100, 1)).toEqual([0, 100]);
    });
  });

  describe('describeParetoChart', () => {
    it('returns "No data" for empty input', () => {
      expect(describeParetoChart([], 0.8)).toBe('No data');
    });
    it('returns "No data" when all values are non-positive', () => {
      expect(
        describeParetoChart(
          [
            { id: 'a', label: 'a', value: 0 },
            { id: 'b', label: 'b', value: -1 },
          ],
          0.8,
        ),
      ).toBe('No data');
    });
    it('summarises vital few + total', () => {
      const text = describeParetoChart(categories, 0.8);
      expect(text).toContain('4 categories');
      expect(text).toContain('Total 100');
      expect(text).toContain('80.0%');
      // sorted desc: A (50%), B (30%, cum 80%); vital few = A, B
      expect(text).toContain('A, B');
    });
    it('honours formatters', () => {
      const text = describeParetoChart(
        categories,
        0.8,
        (v) => `${v}u`,
        (v) => `${(v * 100).toFixed(0)}p`,
      );
      expect(text).toContain('100u');
      expect(text).toContain('80p');
    });
  });

  it('exports default constants', () => {
    expect(DEFAULT_CHART_PARETO_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_PARETO_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_PARETO_PADDING).toBeGreaterThan(0);
    expect(DEFAULT_CHART_PARETO_BAR_GAP).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_CHART_PARETO_THRESHOLD).toBeCloseTo(0.8);
    expect(DEFAULT_CHART_PARETO_TICK_COUNT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_PARETO_BAR_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_PARETO_LINE_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_PARETO_THRESHOLD_COLOR).toMatch(/^#/);
  });
});

describe('<ChartPareto />', () => {
  it('renders a region with role + aria-label', () => {
    render(<ChartPareto categories={categories} />);
    const root = screen.getByRole('region', {
      name: 'Pareto chart',
    });
    expect(root).toBeInTheDocument();
    expect(root).toHaveAttribute(
      'data-section',
      'chart-pareto',
    );
    expect(root).toHaveAttribute('data-category-count', '4');
    expect(root).toHaveAttribute('data-total', '100');
  });

  it('renders a custom aria-label', () => {
    render(
      <ChartPareto
        categories={categories}
        ariaLabel="Defect causes"
      />,
    );
    expect(
      screen.getByRole('region', { name: 'Defect causes' }),
    ).toBeInTheDocument();
  });

  it('renders one bar group per positive-value category, sorted desc', () => {
    const { container } = render(
      <ChartPareto categories={categories} />,
    );
    const bars = container.querySelectorAll(
      '[data-section="chart-pareto-bar"]',
    );
    expect(bars.length).toBe(categories.length);
    expect(bars[0]?.getAttribute('data-category-id')).toBe('a');
    expect(bars[1]?.getAttribute('data-category-id')).toBe('b');
    expect(bars[2]?.getAttribute('data-category-id')).toBe('c');
    expect(bars[3]?.getAttribute('data-category-id')).toBe('d');
  });

  it('drops non-positive categories from rendering', () => {
    const mixed: ChartParetoCategory[] = [
      ...categories,
      { id: 'zero', label: 'Z', value: 0 },
    ];
    const { container } = render(<ChartPareto categories={mixed} />);
    const bars = container.querySelectorAll(
      '[data-section="chart-pareto-bar"]',
    );
    expect(bars.length).toBe(categories.length);
  });

  it('mirrors cumulative percent + vital-few on bar group', () => {
    const { container } = render(
      <ChartPareto categories={categories} />,
    );
    const a = container.querySelector(
      '[data-section="chart-pareto-bar"][data-category-id="a"]',
    );
    expect(
      a?.getAttribute('data-cumulative-percent'),
    ).toBe('0.5000');
    expect(a?.getAttribute('data-vital-few')).toBe('true');
    const c = container.querySelector(
      '[data-section="chart-pareto-bar"][data-category-id="c"]',
    );
    expect(c?.getAttribute('data-vital-few')).toBe('false');
  });

  it('honours custom bar colour', () => {
    const colored: ChartParetoCategory[] = categories.map((c) =>
      c.id === 'a' ? { ...c, color: '#ff00aa' } : c,
    );
    const { container } = render(
      <ChartPareto categories={colored} />,
    );
    const a = container.querySelector(
      '[data-section="chart-pareto-bar"][data-category-id="a"]',
    );
    expect(a?.getAttribute('data-category-color')).toBe(
      '#ff00aa',
    );
  });

  it('uses defaultBarColor when category has no colour', () => {
    const { container } = render(
      <ChartPareto categories={categories} />,
    );
    const bar = container.querySelector(
      '[data-section="chart-pareto-bar"]',
    );
    expect(bar?.getAttribute('data-category-color')).toBe(
      DEFAULT_CHART_PARETO_BAR_COLOR,
    );
  });

  it('renders the cumulative line by default', () => {
    const { container } = render(
      <ChartPareto categories={categories} />,
    );
    const line = container.querySelector(
      '[data-section="chart-pareto-line"]',
    );
    expect(line).not.toBeNull();
    const markers = container.querySelectorAll(
      '[data-section="chart-pareto-line-marker"]',
    );
    expect(markers.length).toBe(categories.length);
  });

  it('suppresses the line when showLine=false', () => {
    const { container } = render(
      <ChartPareto categories={categories} showLine={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-pareto-line"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-pareto-line-marker"]',
      ),
    ).toBeNull();
  });

  it('renders bars by default', () => {
    const { container } = render(
      <ChartPareto categories={categories} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-pareto-bar-rect"]',
      ).length,
    ).toBe(categories.length);
  });

  it('suppresses bars when showBars=false', () => {
    const { container } = render(
      <ChartPareto categories={categories} showBars={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-pareto-bar-rect"]',
      ),
    ).toBeNull();
  });

  it('renders the threshold reference line by default', () => {
    const { container } = render(
      <ChartPareto categories={categories} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-pareto-threshold"]',
      ),
    ).not.toBeNull();
  });

  it('suppresses threshold when showThreshold=false', () => {
    const { container } = render(
      <ChartPareto
        categories={categories}
        showThreshold={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-pareto-threshold"]',
      ),
    ).toBeNull();
  });

  it('mirrors data-threshold + data-vital-few-count on root', () => {
    const { container } = render(
      <ChartPareto
        categories={categories}
        paretoThreshold={0.5}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-pareto"]',
    );
    expect(root?.getAttribute('data-threshold')).toBe(
      '0.5000',
    );
    expect(root?.getAttribute('data-vital-few-count')).toBe(
      '1',
    );
  });

  it('renders labels by default', () => {
    const { container } = render(
      <ChartPareto categories={categories} />,
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-pareto-label"]',
    );
    expect(labels.length).toBe(categories.length);
    expect(labels[0]?.textContent).toBe('A');
  });

  it('suppresses labels when showLabels=false', () => {
    const { container } = render(
      <ChartPareto categories={categories} showLabels={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-pareto-label"]',
      ),
    ).toBeNull();
  });

  it('renders the left axis by default', () => {
    const { container } = render(
      <ChartPareto categories={categories} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-pareto-left-axis"]',
      ),
    ).not.toBeNull();
  });

  it('suppresses left axis when showLeftAxis=false', () => {
    const { container } = render(
      <ChartPareto
        categories={categories}
        showLeftAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-pareto-left-axis"]',
      ),
    ).toBeNull();
  });

  it('renders the right axis by default', () => {
    const { container } = render(
      <ChartPareto categories={categories} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-pareto-right-axis"]',
      ),
    ).not.toBeNull();
  });

  it('suppresses right axis when showRightAxis=false', () => {
    const { container } = render(
      <ChartPareto
        categories={categories}
        showRightAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-pareto-right-axis"]',
      ),
    ).toBeNull();
  });

  it('shows tooltip on bar hover with value + cumulative rows', () => {
    const { container } = render(
      <ChartPareto categories={categories} />,
    );
    const bar = container.querySelector(
      '[data-section="chart-pareto-bar-rect"][data-category-id="a"]',
    );
    fireEvent.mouseEnter(bar!);
    const tip = container.querySelector(
      '[data-section="chart-pareto-tooltip"]',
    );
    expect(tip).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-pareto-tooltip-label"]',
      )?.textContent,
    ).toBe('A');
    expect(
      container.querySelector(
        '[data-section="chart-pareto-tooltip-value"]',
      )?.textContent,
    ).toContain('50');
    expect(
      container.querySelector(
        '[data-section="chart-pareto-tooltip-cumulative"]',
      )?.textContent,
    ).toContain('50%');
  });

  it('shows vital-few hint in tooltip for vital-few bars', () => {
    const { container } = render(
      <ChartPareto categories={categories} />,
    );
    const a = container.querySelector(
      '[data-section="chart-pareto-bar-rect"][data-category-id="a"]',
    );
    fireEvent.mouseEnter(a!);
    expect(
      container.querySelector(
        '[data-section="chart-pareto-tooltip-vital"]',
      ),
    ).not.toBeNull();
  });

  it('omits vital-few hint for non-vital bars', () => {
    const { container } = render(
      <ChartPareto categories={categories} />,
    );
    const d = container.querySelector(
      '[data-section="chart-pareto-bar-rect"][data-category-id="d"]',
    );
    fireEvent.mouseEnter(d!);
    expect(
      container.querySelector(
        '[data-section="chart-pareto-tooltip-vital"]',
      ),
    ).toBeNull();
  });

  it('hides tooltip on mouse-leave', () => {
    const { container } = render(
      <ChartPareto categories={categories} />,
    );
    const bar = container.querySelector(
      '[data-section="chart-pareto-bar-rect"]',
    );
    fireEvent.mouseEnter(bar!);
    fireEvent.mouseLeave(bar!);
    expect(
      container.querySelector(
        '[data-section="chart-pareto-tooltip"]',
      ),
    ).toBeNull();
  });

  it('suppresses tooltip when showTooltip=false', () => {
    const { container } = render(
      <ChartPareto
        categories={categories}
        showTooltip={false}
      />,
    );
    const bar = container.querySelector(
      '[data-section="chart-pareto-bar-rect"]',
    );
    fireEvent.mouseEnter(bar!);
    expect(
      container.querySelector(
        '[data-section="chart-pareto-tooltip"]',
      ),
    ).toBeNull();
  });

  it('uses formatValue + formatPercent in tooltip', () => {
    const { container } = render(
      <ChartPareto
        categories={categories}
        formatValue={(v) => `${v}u`}
        formatPercent={(v) => `${(v * 100).toFixed(0)}p`}
      />,
    );
    const bar = container.querySelector(
      '[data-section="chart-pareto-bar-rect"][data-category-id="a"]',
    );
    fireEvent.mouseEnter(bar!);
    expect(
      container.querySelector(
        '[data-section="chart-pareto-tooltip-value"]',
      )?.textContent,
    ).toContain('50u');
    expect(
      container.querySelector(
        '[data-section="chart-pareto-tooltip-cumulative"]',
      )?.textContent,
    ).toContain('50p');
  });

  it('invokes onBarClick with category + index + cumulativePercent', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ChartPareto
        categories={categories}
        onBarClick={onClick}
      />,
    );
    const bar = container.querySelector(
      '[data-section="chart-pareto-bar-rect"][data-category-id="b"]',
    );
    fireEvent.click(bar!);
    expect(onClick).toHaveBeenCalledTimes(1);
    const arg = onClick.mock.calls[0]?.[0];
    expect(arg?.category?.id).toBe('b');
    expect(arg?.index).toBe(1);
    expect(arg?.cumulativePercent).toBeCloseTo(0.8);
  });

  it('exposes role=graphics-symbol + aria-label per bar', () => {
    const { container } = render(
      <ChartPareto categories={categories} />,
    );
    const bar = container.querySelector(
      '[data-section="chart-pareto-bar-rect"]',
    );
    expect(bar?.getAttribute('role')).toBe('graphics-symbol');
    expect(bar?.getAttribute('aria-label')).toContain('A');
    expect(bar?.getAttribute('aria-label')).toContain('cumulative');
  });

  it('honours custom lineColor + thresholdColor', () => {
    const { container } = render(
      <ChartPareto
        categories={categories}
        lineColor="#0000ff"
        thresholdColor="#ffff00"
      />,
    );
    const line = container.querySelector(
      '[data-section="chart-pareto-line"]',
    );
    expect(line?.getAttribute('stroke')).toBe('#0000ff');
    const threshold = container.querySelector(
      '[data-section="chart-pareto-threshold"] line',
    );
    expect(threshold?.getAttribute('stroke')).toBe('#ffff00');
  });

  it('mirrors animate flag on the root', () => {
    const { container, rerender } = render(
      <ChartPareto categories={categories} />,
    );
    expect(
      container
        .querySelector('[data-section="chart-pareto"]')
        ?.getAttribute('data-animate'),
    ).toBe('true');
    rerender(
      <ChartPareto categories={categories} animate={false} />,
    );
    expect(
      container
        .querySelector('[data-section="chart-pareto"]')
        ?.getAttribute('data-animate'),
    ).toBe('false');
  });

  it('mirrors size on the svg', () => {
    const { container } = render(
      <ChartPareto
        categories={categories}
        width={800}
        height={400}
      />,
    );
    const svg = container.querySelector(
      '[data-section="chart-pareto-svg"]',
    );
    expect(svg?.getAttribute('width')).toBe('800');
    expect(svg?.getAttribute('height')).toBe('400');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 800 400');
  });

  it('renders auto-generated ARIA description by default', () => {
    const { container } = render(
      <ChartPareto categories={categories} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-pareto-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Pareto chart with 4 categories');
  });

  it('honours ariaDescription override', () => {
    const { container } = render(
      <ChartPareto
        categories={categories}
        ariaDescription="custom"
      />,
    );
    const desc = container.querySelector(
      '[data-section="chart-pareto-aria-desc"]',
    );
    expect(desc?.textContent).toBe('custom');
  });

  it('handles empty categories without crashing', () => {
    const { container } = render(<ChartPareto categories={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-pareto"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelectorAll(
        '[data-section="chart-pareto-bar"]',
      ).length,
    ).toBe(0);
  });

  it('forwards ref to the root region', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartPareto ref={ref} categories={categories} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-pareto',
    );
  });

  it('has a stable displayName', () => {
    expect(ChartPareto.displayName).toBe('ChartPareto');
  });
});
