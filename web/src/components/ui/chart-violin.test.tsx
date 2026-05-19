import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartViolin,
  DEFAULT_CHART_VIOLIN_COLOR,
  DEFAULT_CHART_VIOLIN_GAP,
  DEFAULT_CHART_VIOLIN_HEIGHT,
  DEFAULT_CHART_VIOLIN_PADDING,
  DEFAULT_CHART_VIOLIN_RESOLUTION,
  DEFAULT_CHART_VIOLIN_TICK_COUNT,
  DEFAULT_CHART_VIOLIN_WIDTH,
  buildViolinPath,
  computeKDE,
  describeViolinChart,
  gaussianKernel,
  getViolinBounds,
  getViolinEvalPoints,
  getViolinStats,
  getViolinStdDev,
  getViolinTicks,
  silvermanBandwidth,
} from './chart-violin';
import type {
  ChartViolinSeries,
  ViolinDensityPoint,
} from './chart-violin';

const series: ChartViolinSeries[] = [
  {
    id: 'a',
    label: 'A',
    data: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  },
  {
    id: 'b',
    label: 'B',
    data: [5, 5, 5, 5, 5, 5, 5, 5, 5, 100],
  },
  {
    id: 'c',
    label: 'C',
    data: [2, 3, 4, 5, 6],
    color: '#ff00aa',
  },
];

describe('chart-violin pure helpers', () => {
  describe('gaussianKernel', () => {
    it('peaks at u=0', () => {
      expect(gaussianKernel(0)).toBeCloseTo(
        1 / Math.sqrt(2 * Math.PI),
      );
    });
    it('is symmetric', () => {
      expect(gaussianKernel(1.5)).toBeCloseTo(
        gaussianKernel(-1.5),
      );
    });
    it('decays away from 0', () => {
      expect(gaussianKernel(0)).toBeGreaterThan(
        gaussianKernel(2),
      );
    });
    it('returns 0 for non-finite input', () => {
      expect(gaussianKernel(Number.NaN)).toBe(0);
    });
  });

  describe('getViolinStdDev', () => {
    it('returns population std dev', () => {
      // [2,4,4,4,5,5,7,9] -> sigma = 2
      expect(
        getViolinStdDev([2, 4, 4, 4, 5, 5, 7, 9]),
      ).toBeCloseTo(2);
    });
    it('returns 0 for empty', () => {
      expect(getViolinStdDev([])).toBe(0);
    });
    it('drops non-finite values', () => {
      expect(
        getViolinStdDev([2, Number.NaN, 4, 4, 4, 5, 5, 7, 9]),
      ).toBeCloseTo(2);
    });
  });

  describe('silvermanBandwidth', () => {
    it('returns a positive bandwidth for normal data', () => {
      const h = silvermanBandwidth([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(h).toBeGreaterThan(0);
    });
    it('returns 1 for empty / single-point data', () => {
      expect(silvermanBandwidth([])).toBe(1);
      expect(silvermanBandwidth([5])).toBe(1);
    });
    it('returns 1 when all values are identical (sigma=0)', () => {
      expect(silvermanBandwidth([5, 5, 5, 5])).toBe(1);
    });
  });

  describe('computeKDE', () => {
    it('returns one density per eval point', () => {
      const out = computeKDE([1, 2, 3], [0, 1, 2, 3, 4], 1);
      expect(out.length).toBe(5);
    });
    it('returns zeros for empty data', () => {
      const out = computeKDE([], [0, 1, 2], 1);
      expect(out).toEqual([0, 0, 0]);
    });
    it('produces a peak near data centre', () => {
      const data = [5, 5, 5, 5, 5];
      const points = [3, 4, 5, 6, 7];
      const out = computeKDE(data, points, 1);
      const max = Math.max(...out);
      expect(out.indexOf(max)).toBe(2);
    });
    it('falls back to bandwidth=1 for non-positive bandwidth', () => {
      const out = computeKDE([1, 2, 3], [0], 0);
      expect(Number.isFinite(out[0])).toBe(true);
      expect(out[0]).toBeGreaterThan(0);
    });
  });

  describe('getViolinEvalPoints', () => {
    it('emits evenly-spaced points across [min, max]', () => {
      const pts = getViolinEvalPoints(0, 10, 5);
      expect(pts).toEqual([0, 2.5, 5, 7.5, 10]);
    });
    it('returns [min] for collapsed range', () => {
      expect(getViolinEvalPoints(5, 5, 10)).toEqual([5]);
      expect(getViolinEvalPoints(5, 3, 10)).toEqual([5]);
    });
    it('returns [] for non-finite bounds', () => {
      expect(
        getViolinEvalPoints(Number.NaN, 10, 5),
      ).toEqual([]);
    });
    it('clamps minimum resolution to 2', () => {
      expect(getViolinEvalPoints(0, 10, 1)).toEqual([0, 10]);
    });
  });

  describe('getViolinStats', () => {
    it('returns zero record for empty data', () => {
      const s = getViolinStats([]);
      expect(s.count).toBe(0);
      expect(s.density).toEqual([]);
    });
    it('computes median, IQR, range, count', () => {
      const s = getViolinStats([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
      ]);
      expect(s.median).toBe(5.5);
      expect(s.q1).toBeCloseTo(3.25);
      expect(s.q3).toBeCloseTo(7.75);
      expect(s.min).toBe(1);
      expect(s.max).toBe(10);
      expect(s.count).toBe(10);
    });
    it('produces a non-zero density for non-degenerate data', () => {
      const s = getViolinStats([1, 2, 3, 4, 5]);
      expect(s.density.length).toBeGreaterThan(0);
      expect(s.maxDensity).toBeGreaterThan(0);
    });
    it('uses options.bandwidth when supplied', () => {
      const a = getViolinStats([1, 2, 3, 4, 5], {
        bandwidth: 0.5,
      });
      const b = getViolinStats([1, 2, 3, 4, 5], {
        bandwidth: 5,
      });
      // Loose bandwidth -> lower peak density
      expect(b.maxDensity).toBeLessThan(a.maxDensity);
    });
    it('uses options.rangeMin / rangeMax to constrain eval points', () => {
      const s = getViolinStats([1, 2, 3, 4, 5], {
        rangeMin: -10,
        rangeMax: 20,
      });
      expect(s.density[0]?.y).toBe(-10);
      expect(s.density[s.density.length - 1]?.y).toBe(20);
    });
  });

  describe('getViolinBounds', () => {
    it('returns min/max across series', () => {
      const b = getViolinBounds(series);
      expect(b.min).toBe(1);
      expect(b.max).toBe(100);
    });
    it('falls back to (0, 1) for empty / all-non-finite', () => {
      expect(getViolinBounds([])).toEqual({ min: 0, max: 1 });
      expect(
        getViolinBounds([
          {
            id: 'x',
            label: 'x',
            data: [Number.NaN, Number.NaN],
          },
        ]),
      ).toEqual({ min: 0, max: 1 });
    });
    it('expands collapsed range', () => {
      const b = getViolinBounds([
        { id: 'x', label: 'x', data: [5, 5, 5] },
      ]);
      expect(b.min).toBeLessThan(5);
      expect(b.max).toBeGreaterThan(5);
    });
  });

  describe('getViolinTicks', () => {
    it('emits evenly-spaced ticks', () => {
      expect(getViolinTicks(0, 100, 5)).toEqual([
        0, 25, 50, 75, 100,
      ]);
    });
    it('returns [min] for collapsed range', () => {
      expect(getViolinTicks(50, 50)).toEqual([50]);
    });
    it('defaults to DEFAULT_CHART_VIOLIN_TICK_COUNT', () => {
      expect(getViolinTicks(0, 100).length).toBe(
        DEFAULT_CHART_VIOLIN_TICK_COUNT,
      );
    });
  });

  describe('buildViolinPath', () => {
    it('returns "" for empty density', () => {
      expect(
        buildViolinPath([], 0, 10, 1, (v) => v),
      ).toBe('');
    });
    it('builds a closed mirror polygon', () => {
      const density: ViolinDensityPoint[] = [
        { y: 0, density: 0.1 },
        { y: 5, density: 0.4 },
        { y: 10, density: 0.1 },
      ];
      const path = buildViolinPath(
        density,
        100,
        20,
        0.4,
        (v) => v,
      );
      expect(path).toMatch(/^M /);
      expect(path).toMatch(/Z$/);
      expect((path.match(/L /g) || []).length).toBeGreaterThan(0);
    });
    it('uses zero half-width when maxDensity is zero', () => {
      const density: ViolinDensityPoint[] = [
        { y: 0, density: 0 },
        { y: 5, density: 0 },
      ];
      const path = buildViolinPath(
        density,
        100,
        20,
        0,
        (v) => v,
      );
      // both edges collapse to the center
      expect(path).toContain('100.00');
    });
  });

  describe('describeViolinChart', () => {
    it('returns "No data" for empty input', () => {
      expect(describeViolinChart([])).toBe('No data');
    });
    it('summarises every series', () => {
      const text = describeViolinChart(series);
      expect(text).toContain('3 series');
      expect(text).toContain('A median');
      expect(text).toContain('n=10');
    });
    it('honours formatValue', () => {
      const text = describeViolinChart(
        series,
        (v) => `${v}u`,
      );
      expect(text).toContain('u');
    });
  });

  it('exports default constants', () => {
    expect(DEFAULT_CHART_VIOLIN_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_VIOLIN_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_VIOLIN_PADDING).toBeGreaterThan(0);
    expect(DEFAULT_CHART_VIOLIN_GAP).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_CHART_VIOLIN_RESOLUTION).toBeGreaterThan(0);
    expect(DEFAULT_CHART_VIOLIN_TICK_COUNT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_VIOLIN_COLOR).toMatch(/^#/);
  });
});

describe('<ChartViolin />', () => {
  it('renders a region with role + aria-label', () => {
    render(<ChartViolin series={series} />);
    const root = screen.getByRole('region', {
      name: 'Violin plot',
    });
    expect(root).toBeInTheDocument();
    expect(root).toHaveAttribute(
      'data-section',
      'chart-violin',
    );
    expect(root).toHaveAttribute('data-series-count', '3');
  });

  it('renders a custom aria-label', () => {
    render(
      <ChartViolin series={series} ariaLabel="Latency" />,
    );
    expect(
      screen.getByRole('region', { name: 'Latency' }),
    ).toBeInTheDocument();
  });

  it('renders one violin shape per series', () => {
    const { container } = render(<ChartViolin series={series} />);
    const shapes = container.querySelectorAll(
      '[data-section="chart-violin-shape"]',
    );
    expect(shapes.length).toBe(series.length);
  });

  it('mirrors series metadata on the group', () => {
    const { container } = render(<ChartViolin series={series} />);
    const a = container.querySelector(
      '[data-section="chart-violin-series"][data-series-id="a"]',
    );
    expect(a?.getAttribute('data-series-count')).toBe('10');
    expect(a?.getAttribute('data-series-color')).toBe(
      DEFAULT_CHART_VIOLIN_COLOR,
    );
    const c = container.querySelector(
      '[data-section="chart-violin-series"][data-series-id="c"]',
    );
    expect(c?.getAttribute('data-series-color')).toBe(
      '#ff00aa',
    );
  });

  it('mirrors bandwidth on the group', () => {
    const { container } = render(<ChartViolin series={series} />);
    const a = container.querySelector(
      '[data-section="chart-violin-series"][data-series-id="a"]',
    );
    const h = parseFloat(
      a?.getAttribute('data-series-bandwidth') ?? '0',
    );
    expect(h).toBeGreaterThan(0);
  });

  it('renders the inner mini-boxplot by default', () => {
    const { container } = render(<ChartViolin series={series} />);
    const inner = container.querySelectorAll(
      '[data-section="chart-violin-inner-box"]',
    );
    expect(inner.length).toBe(series.length);
  });

  it('suppresses inner box when showInnerBox=false', () => {
    const { container } = render(
      <ChartViolin series={series} showInnerBox={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-violin-inner-box"]',
      ),
    ).toBeNull();
  });

  it('renders the median dot by default', () => {
    const { container } = render(<ChartViolin series={series} />);
    const dots = container.querySelectorAll(
      '[data-section="chart-violin-median"]',
    );
    expect(dots.length).toBe(series.length);
  });

  it('suppresses median dot when showMedian=false', () => {
    const { container } = render(
      <ChartViolin series={series} showMedian={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-violin-median"]',
      ),
    ).toBeNull();
  });

  it('renders labels by default', () => {
    const { container } = render(<ChartViolin series={series} />);
    const labels = container.querySelectorAll(
      '[data-section="chart-violin-label"]',
    );
    expect(labels.length).toBe(series.length);
    expect(labels[0]?.textContent).toBe('A');
  });

  it('suppresses labels when showLabels=false', () => {
    const { container } = render(
      <ChartViolin series={series} showLabels={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-violin-label"]',
      ),
    ).toBeNull();
  });

  it('renders axis ticks by default', () => {
    const { container } = render(<ChartViolin series={series} />);
    const ticks = container.querySelectorAll(
      '[data-section="chart-violin-tick"]',
    );
    expect(ticks.length).toBeGreaterThan(0);
  });

  it('suppresses ticks when showAxisTicks=false', () => {
    const { container } = render(
      <ChartViolin series={series} showAxisTicks={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-violin-tick"]',
      ),
    ).toBeNull();
  });

  it('shows tooltip on hover with median + IQR + range + count', () => {
    const { container } = render(<ChartViolin series={series} />);
    const shape = container.querySelector(
      '[data-section="chart-violin-shape"][data-series-id="a"]',
    );
    fireEvent.mouseEnter(shape!);
    const tip = container.querySelector(
      '[data-section="chart-violin-tooltip"]',
    );
    expect(tip).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-violin-tooltip-median"]',
      )?.textContent,
    ).toContain('5.5');
    expect(
      container.querySelector(
        '[data-section="chart-violin-tooltip-iqr"]',
      )?.textContent,
    ).toContain('3.25');
    expect(
      container.querySelector(
        '[data-section="chart-violin-tooltip-range"]',
      )?.textContent,
    ).toContain('1');
    expect(
      container.querySelector(
        '[data-section="chart-violin-tooltip-count"]',
      )?.textContent,
    ).toContain('10');
  });

  it('hides tooltip on mouse-leave', () => {
    const { container } = render(<ChartViolin series={series} />);
    const shape = container.querySelector(
      '[data-section="chart-violin-shape"]',
    );
    fireEvent.mouseEnter(shape!);
    fireEvent.mouseLeave(shape!);
    expect(
      container.querySelector(
        '[data-section="chart-violin-tooltip"]',
      ),
    ).toBeNull();
  });

  it('suppresses tooltip when showTooltip=false', () => {
    const { container } = render(
      <ChartViolin series={series} showTooltip={false} />,
    );
    const shape = container.querySelector(
      '[data-section="chart-violin-shape"]',
    );
    fireEvent.mouseEnter(shape!);
    expect(
      container.querySelector(
        '[data-section="chart-violin-tooltip"]',
      ),
    ).toBeNull();
  });

  it('uses formatValue in tooltip', () => {
    const { container } = render(
      <ChartViolin
        series={series}
        formatValue={(v) => `${v}u`}
      />,
    );
    const shape = container.querySelector(
      '[data-section="chart-violin-shape"][data-series-id="a"]',
    );
    fireEvent.mouseEnter(shape!);
    expect(
      container.querySelector(
        '[data-section="chart-violin-tooltip-median"]',
      )?.textContent,
    ).toContain('5.5u');
  });

  it('invokes onViolinClick with series + index + stats', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ChartViolin
        series={series}
        onViolinClick={onClick}
      />,
    );
    const shape = container.querySelector(
      '[data-section="chart-violin-shape"][data-series-id="b"]',
    );
    fireEvent.click(shape!);
    expect(onClick).toHaveBeenCalledTimes(1);
    const arg = onClick.mock.calls[0]?.[0];
    expect(arg?.series?.id).toBe('b');
    expect(arg?.index).toBe(1);
    expect(arg?.stats?.count).toBe(10);
  });

  it('exposes role=graphics-symbol + aria-label per shape', () => {
    const { container } = render(<ChartViolin series={series} />);
    const shape = container.querySelector(
      '[data-section="chart-violin-shape"]',
    );
    expect(shape?.getAttribute('role')).toBe(
      'graphics-symbol',
    );
    expect(shape?.getAttribute('aria-label')).toContain('A');
    expect(shape?.getAttribute('aria-label')).toContain('n=10');
  });

  it('mirrors animate flag on the root', () => {
    const { container, rerender } = render(
      <ChartViolin series={series} />,
    );
    expect(
      container
        .querySelector('[data-section="chart-violin"]')
        ?.getAttribute('data-animate'),
    ).toBe('true');
    rerender(<ChartViolin series={series} animate={false} />);
    expect(
      container
        .querySelector('[data-section="chart-violin"]')
        ?.getAttribute('data-animate'),
    ).toBe('false');
  });

  it('mirrors size on the svg', () => {
    const { container } = render(
      <ChartViolin series={series} width={800} height={400} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-violin-svg"]',
    );
    expect(svg?.getAttribute('width')).toBe('800');
    expect(svg?.getAttribute('height')).toBe('400');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 800 400');
  });

  it('mirrors resolution prop on root', () => {
    const { container } = render(
      <ChartViolin series={series} resolution={32} />,
    );
    expect(
      container
        .querySelector('[data-section="chart-violin"]')
        ?.getAttribute('data-resolution'),
    ).toBe('32');
  });

  it('renders auto-generated ARIA description by default', () => {
    const { container } = render(<ChartViolin series={series} />);
    const desc = container.querySelector(
      '[data-section="chart-violin-aria-desc"]',
    );
    expect(desc?.textContent).toContain(
      'Violin plot with 3 series',
    );
  });

  it('honours ariaDescription override', () => {
    const { container } = render(
      <ChartViolin series={series} ariaDescription="custom" />,
    );
    const desc = container.querySelector(
      '[data-section="chart-violin-aria-desc"]',
    );
    expect(desc?.textContent).toBe('custom');
  });

  it('handles empty series without crashing', () => {
    const { container } = render(<ChartViolin series={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-violin"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelectorAll(
        '[data-section="chart-violin-shape"]',
      ).length,
    ).toBe(0);
  });

  it('forwards ref to the root region', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartViolin ref={ref} series={series} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-violin',
    );
  });

  it('has a stable displayName', () => {
    expect(ChartViolin.displayName).toBe('ChartViolin');
  });
});
