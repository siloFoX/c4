import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartBoxplot,
  DEFAULT_CHART_BOXPLOT_BOX_COLOR,
  DEFAULT_CHART_BOXPLOT_BOX_GAP,
  DEFAULT_CHART_BOXPLOT_HEIGHT,
  DEFAULT_CHART_BOXPLOT_OUTLIER_MULTIPLIER,
  DEFAULT_CHART_BOXPLOT_PADDING,
  DEFAULT_CHART_BOXPLOT_TICK_COUNT,
  DEFAULT_CHART_BOXPLOT_WIDTH,
  describeBoxplotChart,
  getBoxplotBounds,
  getBoxplotQuantile,
  getBoxplotStats,
  getBoxplotTicks,
} from './chart-boxplot';
import type { ChartBoxplotSeries } from './chart-boxplot';

const series: ChartBoxplotSeries[] = [
  {
    id: 'a',
    label: 'A',
    data: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  },
  {
    id: 'b',
    label: 'B',
    data: [5, 5, 5, 5, 5, 5, 5, 5, 5, 100], // 100 is an outlier
  },
  {
    id: 'c',
    label: 'C',
    data: [10, 11, 12, 12, 13, 14],
    color: '#ff00aa',
  },
];

describe('chart-boxplot pure helpers', () => {
  describe('getBoxplotQuantile', () => {
    it('returns 0 for empty data', () => {
      expect(getBoxplotQuantile([], 0.5)).toBe(0);
    });
    it('returns the single value for one-element data', () => {
      expect(getBoxplotQuantile([42], 0.25)).toBe(42);
    });
    it('returns endpoints for q=0 and q=1', () => {
      expect(getBoxplotQuantile([1, 2, 3, 4, 5], 0)).toBe(1);
      expect(getBoxplotQuantile([1, 2, 3, 4, 5], 1)).toBe(5);
    });
    it('returns the median for q=0.5', () => {
      expect(getBoxplotQuantile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    });
    it('interpolates linearly between adjacent values', () => {
      // 5-element array, idx = 0.25 * 4 = 1.0
      expect(getBoxplotQuantile([1, 2, 3, 4, 5], 0.25)).toBe(2);
      // 4-element array: idx = 0.5 * 3 = 1.5 -> halfway between 2 and 3 = 2.5
      expect(getBoxplotQuantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    });
    it('clamps q to [0, 1]', () => {
      expect(getBoxplotQuantile([1, 2, 3], 2)).toBe(3);
      expect(getBoxplotQuantile([1, 2, 3], -1)).toBe(1);
    });
  });

  describe('getBoxplotStats', () => {
    it('returns zeros for empty data', () => {
      const s = getBoxplotStats([]);
      expect(s.min).toBe(0);
      expect(s.q1).toBe(0);
      expect(s.median).toBe(0);
      expect(s.q3).toBe(0);
      expect(s.max).toBe(0);
      expect(s.mean).toBe(0);
      expect(s.count).toBe(0);
      expect(s.outliers).toEqual([]);
    });
    it('drops non-finite values', () => {
      const s = getBoxplotStats([
        1,
        Number.NaN,
        2,
        Number.POSITIVE_INFINITY,
        3,
      ]);
      expect(s.count).toBe(3);
      expect(s.min).toBe(1);
      expect(s.max).toBe(3);
    });
    it('returns the five-number summary for an even array', () => {
      const s = getBoxplotStats([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(s.min).toBe(1);
      expect(s.q1).toBeCloseTo(3.25);
      expect(s.median).toBe(5.5);
      expect(s.q3).toBeCloseTo(7.75);
      expect(s.max).toBe(10);
    });
    it('computes mean', () => {
      const s = getBoxplotStats([2, 4, 6, 8]);
      expect(s.mean).toBe(5);
    });
    it('classifies outliers via the 1.5 IQR fence', () => {
      const s = getBoxplotStats([
        5, 5, 5, 5, 5, 5, 5, 5, 5, 100,
      ]);
      expect(s.outliers.length).toBeGreaterThan(0);
      expect(s.outliers).toContain(100);
    });
    it('produces no outliers when data is uniform', () => {
      const s = getBoxplotStats([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(s.outliers.length).toBe(0);
    });
    it('whiskers stay within the data range', () => {
      const s = getBoxplotStats([
        5, 5, 5, 5, 5, 5, 5, 5, 5, 100,
      ]);
      expect(s.lowerWhisker).toBeGreaterThanOrEqual(s.min);
      expect(s.upperWhisker).toBeLessThanOrEqual(s.max);
    });
    it('honours a custom outlierMultiplier', () => {
      // A loose multiplier collects fewer outliers.
      const tight = getBoxplotStats(
        [5, 5, 5, 5, 5, 5, 5, 5, 5, 100],
        0.5,
      );
      const loose = getBoxplotStats(
        [5, 5, 5, 5, 5, 5, 5, 5, 5, 100],
        100,
      );
      expect(tight.outliers.length).toBeGreaterThanOrEqual(
        loose.outliers.length,
      );
    });
  });

  describe('getBoxplotBounds', () => {
    it('returns min/max across all data', () => {
      const b = getBoxplotBounds(series);
      expect(b.min).toBe(1);
      expect(b.max).toBe(100);
    });
    it('falls back to (0, 1) for empty / all-non-finite', () => {
      expect(getBoxplotBounds([])).toEqual({ min: 0, max: 1 });
      expect(
        getBoxplotBounds([
          {
            id: 'x',
            label: 'x',
            data: [Number.NaN, Number.NaN],
          },
        ]),
      ).toEqual({ min: 0, max: 1 });
    });
    it('expands collapsed range', () => {
      const b = getBoxplotBounds([
        { id: 'x', label: 'x', data: [5, 5, 5] },
      ]);
      expect(b.min).toBeLessThan(5);
      expect(b.max).toBeGreaterThan(5);
    });
  });

  describe('getBoxplotTicks', () => {
    it('emits evenly-spaced ticks', () => {
      expect(getBoxplotTicks(0, 100, 5)).toEqual([
        0, 25, 50, 75, 100,
      ]);
    });
    it('returns [min] for collapsed range', () => {
      expect(getBoxplotTicks(50, 50)).toEqual([50]);
      expect(getBoxplotTicks(60, 40)).toEqual([60]);
    });
    it('clamps minimum count to 2', () => {
      expect(getBoxplotTicks(0, 100, 1)).toEqual([0, 100]);
    });
    it('defaults to DEFAULT_CHART_BOXPLOT_TICK_COUNT', () => {
      expect(getBoxplotTicks(0, 100).length).toBe(
        DEFAULT_CHART_BOXPLOT_TICK_COUNT,
      );
    });
  });

  describe('describeBoxplotChart', () => {
    it('returns "No data" for empty input', () => {
      expect(describeBoxplotChart([])).toBe('No data');
    });
    it('summarises every series', () => {
      const text = describeBoxplotChart(series);
      expect(text).toContain('3 series');
      expect(text).toContain('A median');
      expect(text).toContain('B median');
      expect(text).toContain('IQR');
    });
    it('honours formatValue', () => {
      const text = describeBoxplotChart(series, (v) => `${v}u`);
      expect(text).toContain('u');
    });
  });

  it('exports default constants', () => {
    expect(DEFAULT_CHART_BOXPLOT_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_BOXPLOT_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_BOXPLOT_PADDING).toBeGreaterThan(0);
    expect(DEFAULT_CHART_BOXPLOT_BOX_GAP).toBeGreaterThanOrEqual(0);
    expect(
      DEFAULT_CHART_BOXPLOT_OUTLIER_MULTIPLIER,
    ).toBeCloseTo(1.5);
    expect(DEFAULT_CHART_BOXPLOT_TICK_COUNT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_BOXPLOT_BOX_COLOR).toMatch(/^#/);
  });
});

describe('<ChartBoxplot />', () => {
  it('renders a region with role + aria-label', () => {
    render(<ChartBoxplot series={series} />);
    const root = screen.getByRole('region', {
      name: 'Box plot',
    });
    expect(root).toBeInTheDocument();
    expect(root).toHaveAttribute(
      'data-section',
      'chart-boxplot',
    );
    expect(root).toHaveAttribute('data-series-count', '3');
  });

  it('renders a custom aria-label', () => {
    render(<ChartBoxplot series={series} ariaLabel="Latency" />);
    expect(
      screen.getByRole('region', { name: 'Latency' }),
    ).toBeInTheDocument();
  });

  it('renders one box per series', () => {
    const { container } = render(<ChartBoxplot series={series} />);
    const boxes = container.querySelectorAll(
      '[data-section="chart-boxplot-box"]',
    );
    expect(boxes.length).toBe(series.length);
  });

  it('mirrors series metadata on the group', () => {
    const { container } = render(<ChartBoxplot series={series} />);
    const a = container.querySelector(
      '[data-section="chart-boxplot-series"][data-series-id="a"]',
    );
    expect(a?.getAttribute('data-series-count')).toBe('10');
    expect(a?.getAttribute('data-series-color')).toBe(
      DEFAULT_CHART_BOXPLOT_BOX_COLOR,
    );
    const c = container.querySelector(
      '[data-section="chart-boxplot-series"][data-series-id="c"]',
    );
    expect(c?.getAttribute('data-series-color')).toBe(
      '#ff00aa',
    );
  });

  it('renders a median line per series', () => {
    const { container } = render(<ChartBoxplot series={series} />);
    const medians = container.querySelectorAll(
      '[data-section="chart-boxplot-median"]',
    );
    expect(medians.length).toBe(series.length);
  });

  it('renders upper + lower whiskers per series', () => {
    const { container } = render(<ChartBoxplot series={series} />);
    const upper = container.querySelectorAll(
      '[data-section="chart-boxplot-whisker-upper"]',
    );
    const lower = container.querySelectorAll(
      '[data-section="chart-boxplot-whisker-lower"]',
    );
    expect(upper.length).toBe(series.length);
    expect(lower.length).toBe(series.length);
  });

  it('renders outlier dots when present', () => {
    const { container } = render(<ChartBoxplot series={series} />);
    const outliers = container.querySelectorAll(
      '[data-section="chart-boxplot-outlier"]',
    );
    expect(outliers.length).toBeGreaterThan(0);
  });

  it('suppresses outliers when showOutliers=false', () => {
    const { container } = render(
      <ChartBoxplot series={series} showOutliers={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-boxplot-outlier"]',
      ),
    ).toBeNull();
  });

  it('mirrors data-outlier-count on series group', () => {
    const { container } = render(<ChartBoxplot series={series} />);
    const b = container.querySelector(
      '[data-section="chart-boxplot-series"][data-series-id="b"]',
    );
    const cnt = parseInt(
      b?.getAttribute('data-outlier-count') ?? '0',
      10,
    );
    expect(cnt).toBeGreaterThan(0);
  });

  it('renders mean marker by default', () => {
    const { container } = render(<ChartBoxplot series={series} />);
    const means = container.querySelectorAll(
      '[data-section="chart-boxplot-mean"]',
    );
    expect(means.length).toBe(series.length);
  });

  it('suppresses mean when showMean=false', () => {
    const { container } = render(
      <ChartBoxplot series={series} showMean={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-boxplot-mean"]',
      ),
    ).toBeNull();
  });

  it('renders labels by default', () => {
    const { container } = render(<ChartBoxplot series={series} />);
    const labels = container.querySelectorAll(
      '[data-section="chart-boxplot-label"]',
    );
    expect(labels.length).toBe(series.length);
    expect(labels[0]?.textContent).toBe('A');
  });

  it('suppresses labels when showLabels=false', () => {
    const { container } = render(
      <ChartBoxplot series={series} showLabels={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-boxplot-label"]',
      ),
    ).toBeNull();
  });

  it('renders axis ticks by default', () => {
    const { container } = render(<ChartBoxplot series={series} />);
    const ticks = container.querySelectorAll(
      '[data-section="chart-boxplot-tick"]',
    );
    expect(ticks.length).toBeGreaterThan(0);
  });

  it('suppresses ticks when showAxisTicks=false', () => {
    const { container } = render(
      <ChartBoxplot series={series} showAxisTicks={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-boxplot-tick"]',
      ),
    ).toBeNull();
  });

  it('shows tooltip with 5-number summary on hover', () => {
    const { container } = render(<ChartBoxplot series={series} />);
    const box = container.querySelector(
      '[data-section="chart-boxplot-box"][data-series-id="a"]',
    );
    fireEvent.mouseEnter(box!);
    const tip = container.querySelector(
      '[data-section="chart-boxplot-tooltip"]',
    );
    expect(tip).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-boxplot-tooltip-min"]',
      )?.textContent,
    ).toContain('1');
    expect(
      container.querySelector(
        '[data-section="chart-boxplot-tooltip-q1"]',
      )?.textContent,
    ).toContain('3.25');
    expect(
      container.querySelector(
        '[data-section="chart-boxplot-tooltip-median"]',
      )?.textContent,
    ).toContain('5.5');
    expect(
      container.querySelector(
        '[data-section="chart-boxplot-tooltip-q3"]',
      )?.textContent,
    ).toContain('7.75');
    expect(
      container.querySelector(
        '[data-section="chart-boxplot-tooltip-max"]',
      )?.textContent,
    ).toContain('10');
  });

  it('shows outlier count in tooltip when outliers exist', () => {
    const { container } = render(<ChartBoxplot series={series} />);
    const box = container.querySelector(
      '[data-section="chart-boxplot-box"][data-series-id="b"]',
    );
    fireEvent.mouseEnter(box!);
    const out = container.querySelector(
      '[data-section="chart-boxplot-tooltip-outliers"]',
    );
    expect(out).not.toBeNull();
  });

  it('omits outlier count in tooltip when zero outliers', () => {
    const { container } = render(<ChartBoxplot series={series} />);
    const box = container.querySelector(
      '[data-section="chart-boxplot-box"][data-series-id="a"]',
    );
    fireEvent.mouseEnter(box!);
    expect(
      container.querySelector(
        '[data-section="chart-boxplot-tooltip-outliers"]',
      ),
    ).toBeNull();
  });

  it('shows mean row in tooltip by default', () => {
    const { container } = render(<ChartBoxplot series={series} />);
    const box = container.querySelector(
      '[data-section="chart-boxplot-box"]',
    );
    fireEvent.mouseEnter(box!);
    const mean = container.querySelector(
      '[data-section="chart-boxplot-tooltip-mean"]',
    );
    expect(mean).not.toBeNull();
  });

  it('omits mean row when showMean=false', () => {
    const { container } = render(
      <ChartBoxplot series={series} showMean={false} />,
    );
    const box = container.querySelector(
      '[data-section="chart-boxplot-box"]',
    );
    fireEvent.mouseEnter(box!);
    expect(
      container.querySelector(
        '[data-section="chart-boxplot-tooltip-mean"]',
      ),
    ).toBeNull();
  });

  it('hides tooltip on mouse-leave', () => {
    const { container } = render(<ChartBoxplot series={series} />);
    const box = container.querySelector(
      '[data-section="chart-boxplot-box"]',
    );
    fireEvent.mouseEnter(box!);
    fireEvent.mouseLeave(box!);
    expect(
      container.querySelector(
        '[data-section="chart-boxplot-tooltip"]',
      ),
    ).toBeNull();
  });

  it('suppresses tooltip when showTooltip=false', () => {
    const { container } = render(
      <ChartBoxplot series={series} showTooltip={false} />,
    );
    const box = container.querySelector(
      '[data-section="chart-boxplot-box"]',
    );
    fireEvent.mouseEnter(box!);
    expect(
      container.querySelector(
        '[data-section="chart-boxplot-tooltip"]',
      ),
    ).toBeNull();
  });

  it('uses formatValue in tooltip', () => {
    const { container } = render(
      <ChartBoxplot
        series={series}
        formatValue={(v) => `${v}u`}
      />,
    );
    const box = container.querySelector(
      '[data-section="chart-boxplot-box"][data-series-id="a"]',
    );
    fireEvent.mouseEnter(box!);
    expect(
      container.querySelector(
        '[data-section="chart-boxplot-tooltip-median"]',
      )?.textContent,
    ).toContain('5.5u');
  });

  it('invokes onBoxClick with series + index + stats', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ChartBoxplot series={series} onBoxClick={onClick} />,
    );
    const box = container.querySelector(
      '[data-section="chart-boxplot-box"][data-series-id="b"]',
    );
    fireEvent.click(box!);
    expect(onClick).toHaveBeenCalledTimes(1);
    const arg = onClick.mock.calls[0]?.[0];
    expect(arg?.series?.id).toBe('b');
    expect(arg?.index).toBe(1);
    expect(arg?.stats?.outliers?.length).toBeGreaterThan(0);
  });

  it('exposes role=graphics-symbol + aria-label per box', () => {
    const { container } = render(<ChartBoxplot series={series} />);
    const box = container.querySelector(
      '[data-section="chart-boxplot-box"]',
    );
    expect(box?.getAttribute('role')).toBe('graphics-symbol');
    expect(box?.getAttribute('aria-label')).toContain('A');
    expect(box?.getAttribute('aria-label')).toContain(
      'median',
    );
  });

  it('mirrors animate flag on the root', () => {
    const { container, rerender } = render(
      <ChartBoxplot series={series} />,
    );
    expect(
      container
        .querySelector('[data-section="chart-boxplot"]')
        ?.getAttribute('data-animate'),
    ).toBe('true');
    rerender(<ChartBoxplot series={series} animate={false} />);
    expect(
      container
        .querySelector('[data-section="chart-boxplot"]')
        ?.getAttribute('data-animate'),
    ).toBe('false');
  });

  it('mirrors size on the svg', () => {
    const { container } = render(
      <ChartBoxplot series={series} width={800} height={400} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-boxplot-svg"]',
    );
    expect(svg?.getAttribute('width')).toBe('800');
    expect(svg?.getAttribute('height')).toBe('400');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 800 400');
  });

  it('mirrors outlier-multiplier on root', () => {
    const { container } = render(
      <ChartBoxplot
        series={series}
        outlierMultiplier={3}
      />,
    );
    expect(
      container
        .querySelector('[data-section="chart-boxplot"]')
        ?.getAttribute('data-outlier-multiplier'),
    ).toBe('3');
  });

  it('renders auto-generated ARIA description by default', () => {
    const { container } = render(<ChartBoxplot series={series} />);
    const desc = container.querySelector(
      '[data-section="chart-boxplot-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Box plot with 3 series');
  });

  it('honours ariaDescription override', () => {
    const { container } = render(
      <ChartBoxplot series={series} ariaDescription="custom" />,
    );
    const desc = container.querySelector(
      '[data-section="chart-boxplot-aria-desc"]',
    );
    expect(desc?.textContent).toBe('custom');
  });

  it('handles empty series without crashing', () => {
    const { container } = render(<ChartBoxplot series={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-boxplot"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelectorAll(
        '[data-section="chart-boxplot-box"]',
      ).length,
    ).toBe(0);
  });

  it('forwards ref to the root region', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartBoxplot ref={ref} series={series} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-boxplot',
    );
  });

  it('has a stable displayName', () => {
    expect(ChartBoxplot.displayName).toBe('ChartBoxplot');
  });
});
