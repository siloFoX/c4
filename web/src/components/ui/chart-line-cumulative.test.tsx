import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  ChartLineCumulative,
  DEFAULT_CHART_LINE_CUMULATIVE_BASELINE,
  DEFAULT_CHART_LINE_CUMULATIVE_HEIGHT,
  DEFAULT_CHART_LINE_CUMULATIVE_PADDING,
  DEFAULT_CHART_LINE_CUMULATIVE_PALETTE,
  DEFAULT_CHART_LINE_CUMULATIVE_TICK_COUNT,
  DEFAULT_CHART_LINE_CUMULATIVE_WIDTH,
  buildLineCumulativeRunningPoints,
  computeLineCumulativeLayout,
  computeLineCumulativeStats,
  computeRunningCumulative,
  describeLineCumulativeChart,
  getLineCumulativeDefaultColor,
  getLineCumulativeFinitePoints,
  type ChartLineCumulativePoint,
  type ChartLineCumulativeSeries,
} from './chart-line-cumulative';

const sales: ChartLineCumulativeSeries = {
  id: 'a',
  label: 'Sales',
  data: [
    { x: 0, value: 10 },
    { x: 1, value: 20 },
    { x: 2, value: 15 },
    { x: 3, value: 25 },
    { x: 4, value: 30 },
  ],
};

const churn: ChartLineCumulativeSeries = {
  id: 'b',
  label: 'Net',
  data: [
    { x: 0, value: 10 },
    { x: 1, value: -3 },
    { x: 2, value: 8 },
    { x: 3, value: -2 },
    { x: 4, value: 5 },
  ],
};

describe('DEFAULT_CHART_LINE_CUMULATIVE_* defaults', () => {
  it('has positive width, height, padding, tick count', () => {
    expect(DEFAULT_CHART_LINE_CUMULATIVE_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_CUMULATIVE_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_CUMULATIVE_PADDING).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_CHART_LINE_CUMULATIVE_TICK_COUNT).toBeGreaterThanOrEqual(2);
  });

  it('default baseline is 0', () => {
    expect(DEFAULT_CHART_LINE_CUMULATIVE_BASELINE).toBe(0);
  });

  it('exposes a 10-color palette', () => {
    expect(DEFAULT_CHART_LINE_CUMULATIVE_PALETTE).toHaveLength(10);
  });
});

describe('getLineCumulativeDefaultColor', () => {
  it('cycles through the palette by index', () => {
    expect(getLineCumulativeDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_CUMULATIVE_PALETTE[0],
    );
    expect(getLineCumulativeDefaultColor(11)).toBe(
      DEFAULT_CHART_LINE_CUMULATIVE_PALETTE[1],
    );
  });

  it('falls back to first color on invalid index', () => {
    expect(getLineCumulativeDefaultColor(-1)).toBe(
      DEFAULT_CHART_LINE_CUMULATIVE_PALETTE[0],
    );
    expect(getLineCumulativeDefaultColor(Number.NaN)).toBe(
      DEFAULT_CHART_LINE_CUMULATIVE_PALETTE[0],
    );
  });
});

describe('getLineCumulativeFinitePoints', () => {
  it('drops non-finite samples', () => {
    expect(
      getLineCumulativeFinitePoints([
        { x: 0, value: 1 },
        { x: Number.NaN, value: 2 },
        { x: 3, value: Number.POSITIVE_INFINITY },
        { x: 5, value: 8 },
      ]),
    ).toEqual([
      { x: 0, value: 1 },
      { x: 5, value: 8 },
    ]);
  });

  it('returns [] for non-array', () => {
    expect(
      getLineCumulativeFinitePoints(
        null as unknown as ReadonlyArray<ChartLineCumulativePoint>,
      ),
    ).toEqual([]);
  });
});

describe('computeRunningCumulative', () => {
  it('computes running sums from baseline 0', () => {
    expect(computeRunningCumulative([1, 2, 3, 4])).toEqual([1, 3, 6, 10]);
  });

  it('honors a non-zero baseline', () => {
    expect(computeRunningCumulative([1, 2, 3], 100)).toEqual([
      101, 103, 106,
    ]);
  });

  it('treats non-finite values as 0 without resetting the sum', () => {
    expect(
      computeRunningCumulative([1, Number.NaN, 3, Number.POSITIVE_INFINITY, 5]),
    ).toEqual([1, 1, 4, 4, 9]);
  });

  it('returns [] for non-array', () => {
    expect(
      computeRunningCumulative(null as unknown as readonly number[]),
    ).toEqual([]);
  });

  it('falls back to 0 baseline when baseline is non-finite', () => {
    expect(
      computeRunningCumulative([1, 2], Number.NaN),
    ).toEqual([1, 3]);
  });
});

describe('buildLineCumulativeRunningPoints', () => {
  it('returns running points sorted by x with original indices', () => {
    const r = buildLineCumulativeRunningPoints(
      [
        { x: 2, value: 30 },
        { x: 0, value: 10 },
        { x: 1, value: 20 },
      ],
      0,
    );
    expect(r.map((p) => p.x)).toEqual([0, 1, 2]);
    expect(r.map((p) => p.cumulative)).toEqual([10, 30, 60]);
    expect(r[0]?.index).toBe(1); // x=0 originally at index 1
    expect(r[2]?.index).toBe(0); // x=2 originally at index 0
  });

  it('drops non-finite samples', () => {
    const r = buildLineCumulativeRunningPoints(
      [
        { x: 0, value: 10 },
        { x: 1, value: Number.NaN },
        { x: 2, value: 20 },
      ],
      0,
    );
    expect(r).toHaveLength(2);
    expect(r[1]?.cumulative).toBe(30);
  });

  it('returns [] for empty / non-array', () => {
    expect(buildLineCumulativeRunningPoints([], 0)).toEqual([]);
    expect(
      buildLineCumulativeRunningPoints(
        null as unknown as readonly ChartLineCumulativePoint[],
        0,
      ),
    ).toEqual([]);
  });

  it('honors baseline', () => {
    const r = buildLineCumulativeRunningPoints(sales.data, 100);
    expect(r[0]?.cumulative).toBe(110);
    expect(r[r.length - 1]?.cumulative).toBe(200);
  });
});

describe('computeLineCumulativeStats', () => {
  it('returns empty stats for empty running array', () => {
    const s = computeLineCumulativeStats([], 0);
    expect(s.finiteCount).toBe(0);
    expect(s.totalValue).toBe(0);
    expect(s.maxIncrement).toBe(0);
    expect(s.minIncrement).toBe(0);
  });

  it('aggregates total + max/min increments', () => {
    const r = buildLineCumulativeRunningPoints(sales.data, 0);
    const s = computeLineCumulativeStats(r, 0);
    expect(s.totalValue).toBe(100);
    expect(s.total).toBe(100);
    expect(s.maxIncrement).toBe(30);
    expect(s.minIncrement).toBe(10);
  });

  it('records baseline', () => {
    const r = buildLineCumulativeRunningPoints(sales.data, 50);
    const s = computeLineCumulativeStats(r, 50);
    expect(s.baseline).toBe(50);
    expect(s.total).toBe(150);
  });

  it('finds the target crossing index when reached', () => {
    const r = buildLineCumulativeRunningPoints(sales.data, 0);
    const s = computeLineCumulativeStats(r, 0, 50);
    // cumulative: 10, 30, 45, 70, 100. First >= 50 is index 3 (value 70).
    expect(s.reachedTarget).toBe(true);
    expect(s.targetCrossingIndex).toBe(3);
    expect(s.targetCrossingX).not.toBeNull();
  });

  it('linearly interpolates the crossing x within a segment', () => {
    const r = buildLineCumulativeRunningPoints(
      [
        { x: 0, value: 10 },
        { x: 10, value: 10 },
      ],
      0,
    );
    // cumulative: 10, 20. target=15: crossing between x=0 (10) and x=10 (20).
    // expected x* = 0 + (10-0) * (15-10)/(20-10) = 5.
    const s = computeLineCumulativeStats(r, 0, 15);
    expect(s.reachedTarget).toBe(true);
    expect(s.targetCrossingX).toBeCloseTo(5, 6);
  });

  it('marks target as reached when first sample already exceeds', () => {
    const r = buildLineCumulativeRunningPoints(
      [
        { x: 0, value: 200 },
      ],
      0,
    );
    const s = computeLineCumulativeStats(r, 0, 50);
    expect(s.reachedTarget).toBe(true);
    expect(s.targetCrossingX).toBe(0);
  });

  it('returns reachedTarget=false when never reached', () => {
    const r = buildLineCumulativeRunningPoints(sales.data, 0);
    const s = computeLineCumulativeStats(r, 0, 1000);
    expect(s.reachedTarget).toBe(false);
    expect(s.targetCrossingX).toBeNull();
    expect(s.targetCrossingIndex).toBeNull();
  });

  it('reports percentToTarget clamped to [0,1]', () => {
    const r = buildLineCumulativeRunningPoints(sales.data, 0);
    const s = computeLineCumulativeStats(r, 0, 200);
    // totalValue 100 / 200 = 0.5.
    expect(s.percentToTarget).toBeCloseTo(0.5, 6);
  });
});

describe('computeLineCumulativeLayout', () => {
  it('returns empty when no series', () => {
    const layout = computeLineCumulativeLayout({
      series: [],
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series).toEqual([]);
  });

  it('returns empty when canvas degenerate', () => {
    const layout = computeLineCumulativeLayout({
      series: [sales],
      width: 20,
      height: 20,
      padding: 30,
    });
    expect(layout.series).toEqual([]);
  });

  it('builds layout series with path and stats', () => {
    const layout = computeLineCumulativeLayout({
      series: [sales],
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series).toHaveLength(1);
    const s = layout.series[0]!;
    expect(s.path).toMatch(/^M /);
    expect(s.stats.total).toBe(100);
    expect(s.finiteCount).toBe(5);
  });

  it('expands y bounds to include the target', () => {
    const layout = computeLineCumulativeLayout({
      series: [
        { id: 'x', label: 'X', data: [{ x: 0, value: 5 }] },
      ],
      target: 200,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.yMax).toBeGreaterThanOrEqual(200);
  });

  it('honors hidden series filter', () => {
    const layout = computeLineCumulativeLayout({
      series: [sales, churn],
      hiddenSeries: new Set(['a']),
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series).toHaveLength(1);
    expect(layout.series[0]?.id).toBe('b');
  });

  it('records baseline + targetY + target', () => {
    const layout = computeLineCumulativeLayout({
      series: [{ ...sales, baseline: 50 }],
      target: 200,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series[0]?.baseline).toBe(50);
    expect(layout.target).toBe(200);
    expect(layout.targetY).not.toBeNull();
  });

  it('handles negative increments', () => {
    const layout = computeLineCumulativeLayout({
      series: [churn],
      width: 400,
      height: 300,
      padding: 30,
    });
    // cumulative: 10, 7, 15, 13, 18.
    const pts = layout.series[0]!.points;
    expect(pts[0]?.cumulative).toBe(10);
    expect(pts[1]?.cumulative).toBe(7);
    expect(pts[4]?.cumulative).toBe(18);
  });

  it('respects user-supplied bounds overrides', () => {
    const layout = computeLineCumulativeLayout({
      series: [sales],
      width: 400,
      height: 300,
      padding: 30,
      xMin: -10,
      xMax: 20,
      yMin: -50,
      yMax: 500,
    });
    expect(layout.xMin).toBe(-10);
    expect(layout.xMax).toBe(20);
    expect(layout.yMin).toBe(-50);
    expect(layout.yMax).toBe(500);
  });

  it('produces axis ticks at the requested step count', () => {
    const layout = computeLineCumulativeLayout({
      series: [sales],
      tickCount: 6,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.xTicks).toHaveLength(6);
    expect(layout.yTicks).toHaveLength(6);
  });

  it('per-point increment rects sit between cumulative and baseline', () => {
    const layout = computeLineCumulativeLayout({
      series: [sales],
      width: 400,
      height: 300,
      padding: 30,
    });
    for (const p of layout.series[0]!.points) {
      expect(p.incrementHeight).toBeGreaterThanOrEqual(0);
    }
  });

  it('layout target is null when no target supplied', () => {
    const layout = computeLineCumulativeLayout({
      series: [sales],
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.target).toBeNull();
    expect(layout.targetY).toBeNull();
  });
});

describe('describeLineCumulativeChart', () => {
  it('returns "No data" for empty / hidden / no finite', () => {
    expect(describeLineCumulativeChart(null)).toBe('No data');
    expect(describeLineCumulativeChart([])).toBe('No data');
    expect(
      describeLineCumulativeChart([sales], undefined, new Set(['a'])),
    ).toBe('No data');
    expect(
      describeLineCumulativeChart([
        { id: 'x', label: 'X', data: [{ x: Number.NaN, value: 1 }] },
      ]),
    ).toBe('No data');
  });

  it('summarises cumulative per series', () => {
    const text = describeLineCumulativeChart([sales]);
    expect(text).toContain('1 series');
    expect(text).toContain('Sales: cumulative 100');
  });

  it('mentions target reach status when target supplied', () => {
    expect(describeLineCumulativeChart([sales], 50)).toContain('reached target 50');
    expect(describeLineCumulativeChart([sales], 1000)).toContain(
      'did not reach target',
    );
  });
});

describe('<ChartLineCumulative /> rendering', () => {
  it('renders nothing meaningful when empty series', () => {
    const { container } = render(<ChartLineCumulative series={[]} />);
    const root = container.querySelector(
      '[data-section="chart-line-cumulative"]',
    );
    expect(root).not.toBeNull();
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-cumulative-path"]',
      ),
    ).toHaveLength(0);
  });

  it('renders one cumulative path per series', () => {
    const { container } = render(
      <ChartLineCumulative series={[sales, churn]} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-cumulative-path"]',
      ),
    ).toHaveLength(2);
  });

  it('renders increment rects per non-zero point by default', () => {
    const { container } = render(<ChartLineCumulative series={[sales]} />);
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-cumulative-increment"]',
      ),
    ).toHaveLength(5);
  });

  it('omits increments when showIncrements=false', () => {
    const { container } = render(
      <ChartLineCumulative series={[sales]} showIncrements={false} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-cumulative-increment"]',
      ),
    ).toHaveLength(0);
  });

  it('exposes increment sign via data-increment-sign', () => {
    const { container } = render(<ChartLineCumulative series={[churn]} />);
    const rects = container.querySelectorAll(
      '[data-section="chart-line-cumulative-increment"]',
    );
    const signs = Array.from(rects).map((r) =>
      r.getAttribute('data-increment-sign'),
    );
    expect(signs).toContain('positive');
    expect(signs).toContain('negative');
  });

  it('renders dots per finite point', () => {
    const { container } = render(<ChartLineCumulative series={[sales]} />);
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-cumulative-dot"]',
      ),
    ).toHaveLength(5);
  });

  it('hides dots when showDots=false', () => {
    const { container } = render(
      <ChartLineCumulative series={[sales]} showDots={false} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-cumulative-dot"]',
      ),
    ).toHaveLength(0);
  });

  it('renders target line and label when target supplied', () => {
    const { container } = render(
      <ChartLineCumulative series={[sales]} target={75} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cumulative-target-line"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-cumulative-target-label"]',
      )?.textContent,
    ).toMatch(/Target: 75/);
  });

  it('omits target line when showTarget=false', () => {
    const { container } = render(
      <ChartLineCumulative
        series={[sales]}
        target={75}
        showTarget={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cumulative-target-line"]',
      ),
    ).toBeNull();
  });

  it('omits target label when showTargetLabel=false', () => {
    const { container } = render(
      <ChartLineCumulative
        series={[sales]}
        target={75}
        showTargetLabel={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cumulative-target-label"]',
      ),
    ).toBeNull();
  });

  it('uses custom targetLabel', () => {
    const { container } = render(
      <ChartLineCumulative
        series={[sales]}
        target={75}
        targetLabel="Goal"
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cumulative-target-label"]',
      )?.textContent,
    ).toMatch(/Goal:/);
  });

  it('renders the baseline line by default', () => {
    const { container } = render(<ChartLineCumulative series={[sales]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-cumulative-baseline"]',
      ),
    ).not.toBeNull();
  });

  it('omits baseline when showBaseline=false', () => {
    const { container } = render(
      <ChartLineCumulative series={[sales]} showBaseline={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cumulative-baseline"]',
      ),
    ).toBeNull();
  });

  it('renders aria description and labels region', () => {
    render(<ChartLineCumulative series={[sales]} />);
    expect(
      screen.getByRole('region', {
        name: /running cumulative line chart/i,
      }),
    ).toBeTruthy();
  });

  it('shows tooltip on dot hover with value + cumulative', () => {
    const { container } = render(<ChartLineCumulative series={[sales]} />);
    const dot = container.querySelector(
      '[data-section="chart-line-cumulative-dot"][data-point-index="3"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    const tip = container.querySelector(
      '[data-section="chart-line-cumulative-tooltip"]',
    );
    expect(tip).not.toBeNull();
    expect(
      tip?.querySelector(
        '[data-section="chart-line-cumulative-tooltip-value"]',
      )?.textContent,
    ).toMatch(/\+25/);
    expect(
      tip?.querySelector(
        '[data-section="chart-line-cumulative-tooltip-cumulative"]',
      )?.textContent,
    ).toMatch(/70/);
  });

  it('hides tooltip on mouseLeave', () => {
    const { container } = render(<ChartLineCumulative series={[sales]} />);
    const dot = container.querySelector(
      '[data-section="chart-line-cumulative-dot"][data-point-index="0"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    expect(
      container.querySelector(
        '[data-section="chart-line-cumulative-tooltip"]',
      ),
    ).not.toBeNull();
    fireEvent.mouseLeave(dot);
    expect(
      container.querySelector(
        '[data-section="chart-line-cumulative-tooltip"]',
      ),
    ).toBeNull();
  });

  it('omits tooltip when showTooltip=false', () => {
    const { container } = render(
      <ChartLineCumulative series={[sales]} showTooltip={false} />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-cumulative-dot"][data-point-index="0"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    expect(
      container.querySelector(
        '[data-section="chart-line-cumulative-tooltip"]',
      ),
    ).toBeNull();
  });

  it('invokes onPointClick with series + point', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ChartLineCumulative series={[sales]} onPointClick={onClick} />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-cumulative-dot"][data-point-index="2"]',
    ) as SVGCircleElement;
    fireEvent.click(dot);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0]?.[0].point.cumulative).toBe(45);
  });

  it('exposes per-series totals and progress in data attrs', () => {
    const { container } = render(
      <ChartLineCumulative series={[sales]} target={75} />,
    );
    const group = container.querySelector(
      '[data-section="chart-line-cumulative-series-group"][data-series-id="a"]',
    );
    expect(group?.getAttribute('data-series-total')).toBe('100');
    expect(group?.getAttribute('data-series-reached-target')).toBe('true');
    const pct = Number(
      group?.getAttribute('data-series-percent-to-target'),
    );
    expect(pct).toBeGreaterThan(0);
    expect(pct).toBeLessThanOrEqual(1);
  });

  it('legend shows total and percent to target', () => {
    const { container } = render(
      <ChartLineCumulative series={[sales]} target={200} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cumulative-legend-stats"]',
      )?.textContent,
    ).toMatch(/total 100, 50%/);
  });

  it('toggles series via the legend', () => {
    const { container } = render(
      <ChartLineCumulative series={[sales, churn]} />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-cumulative-legend-button"][data-series-id="a"]',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-cumulative-path"]',
      ),
    ).toHaveLength(1);
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLineCumulative
        series={[sales, churn]}
        hiddenSeries={new Set(['b'])}
      />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-cumulative-path"]',
      ),
    ).toHaveLength(1);
  });

  it('emits onHiddenSeriesChange', () => {
    const onChange = vi.fn();
    const { container } = render(
      <ChartLineCumulative
        series={[sales]}
        onHiddenSeriesChange={onChange}
      />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-cumulative-legend-button"][data-series-id="a"]',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0].has('a')).toBe(true);
  });

  it('omits legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineCumulative series={[sales]} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cumulative-legend"]',
      ),
    ).toBeNull();
  });

  it('animate flag toggles data-animate and fade-in class', () => {
    const { container } = render(<ChartLineCumulative series={[sales]} />);
    const root = container.querySelector(
      '[data-section="chart-line-cumulative"]',
    ) as HTMLDivElement;
    expect(root.getAttribute('data-animate')).toBe('true');
    expect(root.className).toContain('motion-safe:animate-fade-in');
    const { container: c2 } = render(
      <ChartLineCumulative series={[sales]} animate={false} />,
    );
    const r2 = c2.querySelector(
      '[data-section="chart-line-cumulative"]',
    ) as HTMLDivElement;
    expect(r2.getAttribute('data-animate')).toBe('false');
    expect(r2.className).not.toContain('motion-safe:animate-fade-in');
  });

  it('forwards ref to root div', () => {
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineCumulative ref={ref} series={[sales]} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-cumulative',
    );
  });

  it('renders a stable displayName for devtools', () => {
    expect(ChartLineCumulative.displayName).toBe('ChartLineCumulative');
  });
});
