import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  ChartLineDistribution,
  DEFAULT_CHART_LINE_DISTRIBUTION_BIN_COUNT,
  DEFAULT_CHART_LINE_DISTRIBUTION_HEIGHT,
  DEFAULT_CHART_LINE_DISTRIBUTION_HISTOGRAM_RATIO,
  DEFAULT_CHART_LINE_DISTRIBUTION_PADDING,
  DEFAULT_CHART_LINE_DISTRIBUTION_PALETTE,
  DEFAULT_CHART_LINE_DISTRIBUTION_TICK_COUNT,
  DEFAULT_CHART_LINE_DISTRIBUTION_WIDTH,
  computeLineDistributionBins,
  computeLineDistributionLayout,
  computeLineDistributionMean,
  computeLineDistributionMedian,
  describeLineDistributionChart,
  getLineDistributionDefaultColor,
  getLineDistributionFinitePoints,
  normaliseLineDistributionBinCount,
  type ChartLineDistributionPoint,
  type ChartLineDistributionSeries,
} from './chart-line-distribution';

const seriesA: ChartLineDistributionSeries = {
  id: 'a',
  label: 'Latency',
  data: [
    { x: 0, y: 5 },
    { x: 1, y: 7 },
    { x: 2, y: 12 },
    { x: 3, y: 9 },
    { x: 4, y: 15 },
    { x: 5, y: 6 },
    { x: 6, y: 18 },
    { x: 7, y: 8 },
  ],
};

const seriesB: ChartLineDistributionSeries = {
  id: 'b',
  label: 'Throughput',
  data: [
    { x: 0, y: 10 },
    { x: 1, y: 11 },
    { x: 2, y: 13 },
    { x: 3, y: 14 },
  ],
};

describe('DEFAULT_CHART_LINE_DISTRIBUTION_* defaults', () => {
  it('has positive width, height, padding, tick count', () => {
    expect(DEFAULT_CHART_LINE_DISTRIBUTION_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_DISTRIBUTION_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_DISTRIBUTION_PADDING).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_CHART_LINE_DISTRIBUTION_TICK_COUNT).toBeGreaterThanOrEqual(2);
  });

  it('default bin count is positive', () => {
    expect(DEFAULT_CHART_LINE_DISTRIBUTION_BIN_COUNT).toBeGreaterThan(0);
  });

  it('default histogram ratio is in (0, 1)', () => {
    expect(DEFAULT_CHART_LINE_DISTRIBUTION_HISTOGRAM_RATIO).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_DISTRIBUTION_HISTOGRAM_RATIO).toBeLessThan(1);
  });

  it('exposes a 10-color palette', () => {
    expect(DEFAULT_CHART_LINE_DISTRIBUTION_PALETTE).toHaveLength(10);
  });
});

describe('getLineDistributionDefaultColor', () => {
  it('cycles through the palette', () => {
    expect(getLineDistributionDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_DISTRIBUTION_PALETTE[0],
    );
    expect(getLineDistributionDefaultColor(11)).toBe(
      DEFAULT_CHART_LINE_DISTRIBUTION_PALETTE[1],
    );
  });

  it('falls back to first color on invalid index', () => {
    expect(getLineDistributionDefaultColor(-1)).toBe(
      DEFAULT_CHART_LINE_DISTRIBUTION_PALETTE[0],
    );
    expect(getLineDistributionDefaultColor(Number.NaN)).toBe(
      DEFAULT_CHART_LINE_DISTRIBUTION_PALETTE[0],
    );
  });
});

describe('getLineDistributionFinitePoints', () => {
  it('drops non-finite samples', () => {
    expect(
      getLineDistributionFinitePoints([
        { x: 0, y: 1 },
        { x: Number.NaN, y: 2 },
        { x: 3, y: Number.POSITIVE_INFINITY },
        { x: 5, y: 8 },
      ]),
    ).toEqual([
      { x: 0, y: 1 },
      { x: 5, y: 8 },
    ]);
  });

  it('returns [] for non-array', () => {
    expect(
      getLineDistributionFinitePoints(
        null as unknown as ReadonlyArray<ChartLineDistributionPoint>,
      ),
    ).toEqual([]);
  });
});

describe('normaliseLineDistributionBinCount', () => {
  it('floors fractional input', () => {
    expect(normaliseLineDistributionBinCount(3.9)).toBe(3);
  });

  it('returns 1 for non-finite / <1 / non-numeric', () => {
    expect(normaliseLineDistributionBinCount(0)).toBe(1);
    expect(normaliseLineDistributionBinCount(-5)).toBe(1);
    expect(normaliseLineDistributionBinCount(Number.NaN)).toBe(1);
    expect(
      normaliseLineDistributionBinCount('3' as unknown as number),
    ).toBe(1);
  });
});

describe('computeLineDistributionMean', () => {
  it('returns 0 on empty / non-array', () => {
    expect(computeLineDistributionMean(null)).toBe(0);
    expect(computeLineDistributionMean([])).toBe(0);
  });

  it('computes arithmetic mean', () => {
    expect(computeLineDistributionMean([1, 2, 3, 4])).toBe(2.5);
  });

  it('drops non-finite values', () => {
    expect(computeLineDistributionMean([1, Number.NaN, 5])).toBe(3);
  });
});

describe('computeLineDistributionMedian', () => {
  it('returns 0 on empty / non-array', () => {
    expect(computeLineDistributionMedian(null)).toBe(0);
    expect(computeLineDistributionMedian([])).toBe(0);
  });

  it('odd n returns middle sample after sort', () => {
    expect(computeLineDistributionMedian([5, 1, 3])).toBe(3);
  });

  it('even n averages the two middle samples', () => {
    expect(computeLineDistributionMedian([1, 2, 3, 4])).toBe(2.5);
  });

  it('drops non-finite values', () => {
    // After dropping NaN: [1, 5, 7, 9] (even n=4); median = (5+7)/2 = 6.
    expect(
      computeLineDistributionMedian([1, Number.NaN, 5, 7, 9]),
    ).toBe(6);
  });
});

describe('computeLineDistributionBins', () => {
  it('returns [] when range invalid', () => {
    expect(
      computeLineDistributionBins([seriesA], 4, 10, 0),
    ).toEqual([]);
    expect(
      computeLineDistributionBins([seriesA], 4, Number.NaN, 10),
    ).toEqual([]);
  });

  it('returns [] for non-array series', () => {
    expect(
      computeLineDistributionBins(
        null as unknown as readonly ChartLineDistributionSeries[],
        4,
        0,
        10,
      ),
    ).toEqual([]);
  });

  it('returns binCount bins of equal width', () => {
    const bins = computeLineDistributionBins([seriesA], 4, 0, 20);
    expect(bins).toHaveLength(4);
    expect(bins[0]?.binMin).toBe(0);
    expect(bins[0]?.binMax).toBe(5);
    expect(bins[1]?.binMin).toBe(5);
    expect(bins[3]?.binMax).toBe(20);
  });

  it('places samples in correct bins', () => {
    // y values: 5, 7, 12, 9, 15, 6, 18, 8 across [0,20] with 4 bins.
    // bin 0 [0..5): {} (5 lands on bin boundary, goes to bin 1)
    // Actually: at exact bin boundary, samples between bins use Math.floor:
    // y=5 -> floor((5-0)/5) = 1, so bin 1.
    // y=20 (rangeMax) -> last bin (special case).
    const bins = computeLineDistributionBins([seriesA], 4, 0, 20);
    // Compute expected:
    // bin 0 [0..5): {} (no y < 5)
    // bin 1 [5..10): 5, 7, 9, 6, 8 -> 5 samples
    // bin 2 [10..15): 12 -> 1 sample
    // bin 3 [15..20]: 15, 18 -> 2 samples
    expect(bins[0]?.total).toBe(0);
    expect(bins[1]?.total).toBe(5);
    expect(bins[2]?.total).toBe(1);
    expect(bins[3]?.total).toBe(2);
  });

  it('combines per-series counts in each bin', () => {
    const bins = computeLineDistributionBins([seriesA, seriesB], 4, 0, 20);
    // seriesB y values: 10, 11, 13, 14 -> all in bin 2 [10..15).
    const bin2 = bins[2]!;
    expect(bin2.total).toBe(5); // 1 from A + 4 from B
    const aCount = bin2.perSeries.find((p) => p.id === 'a')?.count ?? 0;
    const bCount = bin2.perSeries.find((p) => p.id === 'b')?.count ?? 0;
    expect(aCount).toBe(1);
    expect(bCount).toBe(4);
  });

  it('puts values equal to rangeMax in the last bin', () => {
    const onlyMax: ChartLineDistributionSeries = {
      id: 'm',
      label: 'M',
      data: [{ x: 0, y: 10 }],
    };
    const bins = computeLineDistributionBins([onlyMax], 4, 0, 10);
    expect(bins[3]?.total).toBe(1);
  });

  it('drops out-of-range samples', () => {
    const oob: ChartLineDistributionSeries = {
      id: 'o',
      label: 'O',
      data: [
        { x: 0, y: -5 },
        { x: 1, y: 25 },
        { x: 2, y: 8 },
      ],
    };
    const bins = computeLineDistributionBins([oob], 4, 0, 20);
    const total = bins.reduce((acc, b) => acc + b.total, 0);
    expect(total).toBe(1);
  });

  it('drops non-finite samples', () => {
    const messy: ChartLineDistributionSeries = {
      id: 'm',
      label: 'M',
      data: [
        { x: 0, y: 5 },
        { x: 1, y: Number.NaN },
        { x: 2, y: 15 },
      ],
    };
    const bins = computeLineDistributionBins([messy], 4, 0, 20);
    const total = bins.reduce((acc, b) => acc + b.total, 0);
    expect(total).toBe(2);
  });

  it('only emits non-zero perSeries entries', () => {
    const bins = computeLineDistributionBins([seriesA, seriesB], 4, 0, 20);
    // bin 0 has zero entries, so perSeries should be empty.
    expect(bins[0]?.perSeries).toEqual([]);
    // bin 2 has entries from both, but bin 3 might only have seriesA.
    expect(bins[3]?.perSeries.length).toBeGreaterThan(0);
    for (const part of bins[3]!.perSeries) {
      expect(part.count).toBeGreaterThan(0);
    }
  });
});

describe('computeLineDistributionLayout', () => {
  it('returns empty when no series', () => {
    const layout = computeLineDistributionLayout({
      series: [],
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series).toEqual([]);
    expect(layout.bins).toEqual([]);
  });

  it('returns empty when canvas degenerate', () => {
    const layout = computeLineDistributionLayout({
      series: [seriesA],
      width: 20,
      height: 20,
      padding: 30,
    });
    expect(layout.series).toEqual([]);
  });

  it('builds layout series with path and stats', () => {
    const layout = computeLineDistributionLayout({
      series: [seriesA],
      width: 600,
      height: 300,
      padding: 30,
    });
    expect(layout.series).toHaveLength(1);
    const s = layout.series[0]!;
    expect(s.path).toMatch(/^M /);
    expect(s.finiteCount).toBe(seriesA.data.length);
    expect(s.stats.mean).toBeGreaterThan(0);
    expect(s.stats.median).toBeGreaterThan(0);
  });

  it('builds bins with the requested count', () => {
    const layout = computeLineDistributionLayout({
      series: [seriesA],
      binCount: 8,
      width: 600,
      height: 300,
      padding: 30,
    });
    expect(layout.bins).toHaveLength(8);
    expect(layout.binCount).toBe(8);
  });

  it('splits canvas into main + histogram tracks', () => {
    const layout = computeLineDistributionLayout({
      series: [seriesA],
      histogramRatio: 0.2,
      width: 600,
      height: 300,
      padding: 30,
    });
    expect(layout.mainTrackRight).toBeGreaterThan(layout.mainTrackLeft);
    expect(layout.histogramTrackRight).toBeGreaterThan(
      layout.histogramTrackLeft,
    );
    expect(layout.histogramTrackLeft).toBeGreaterThanOrEqual(
      layout.mainTrackRight,
    );
  });

  it('clamps histogramRatio to [0, 0.6]', () => {
    const layout = computeLineDistributionLayout({
      series: [seriesA],
      histogramRatio: 0.95,
      width: 600,
      height: 300,
      padding: 30,
    });
    const histogramWidth =
      layout.histogramTrackRight - layout.histogramTrackLeft;
    const innerWidth = layout.innerWidth;
    expect(histogramWidth).toBeLessThanOrEqual(innerWidth * 0.6);
  });

  it('records combined mean + median across visible series', () => {
    const layout = computeLineDistributionLayout({
      series: [seriesA, seriesB],
      width: 600,
      height: 300,
      padding: 30,
    });
    expect(layout.combinedFiniteCount).toBe(
      seriesA.data.length + seriesB.data.length,
    );
    expect(layout.combinedMean).toBeGreaterThan(0);
    expect(layout.combinedMedian).toBeGreaterThan(0);
  });

  it('records maxBinTotal across all bins', () => {
    const layout = computeLineDistributionLayout({
      series: [seriesA, seriesB],
      binCount: 4,
      width: 600,
      height: 300,
      padding: 30,
    });
    expect(layout.maxBinTotal).toBeGreaterThan(0);
  });

  it('honors hidden series filter (both layout series + bins)', () => {
    const layout = computeLineDistributionLayout({
      series: [seriesA, seriesB],
      hiddenSeries: new Set(['a']),
      binCount: 4,
      width: 600,
      height: 300,
      padding: 30,
    });
    expect(layout.series).toHaveLength(1);
    expect(layout.series[0]?.id).toBe('b');
    // Bins should only contain seriesB.
    const allParts = layout.bins.flatMap((b) =>
      b.segments.map((s) => s.id),
    );
    expect(allParts.every((id) => id === 'b')).toBe(true);
  });

  it('produces axis ticks at the requested step count', () => {
    const layout = computeLineDistributionLayout({
      series: [seriesA],
      tickCount: 6,
      width: 600,
      height: 300,
      padding: 30,
    });
    expect(layout.xTicks).toHaveLength(6);
    expect(layout.yTicks).toHaveLength(6);
  });

  it('respects user-supplied bounds overrides', () => {
    const layout = computeLineDistributionLayout({
      series: [seriesA],
      width: 600,
      height: 300,
      padding: 30,
      xMin: -10,
      xMax: 20,
      yMin: 0,
      yMax: 30,
    });
    expect(layout.xMin).toBe(-10);
    expect(layout.xMax).toBe(20);
    expect(layout.yMin).toBe(0);
    expect(layout.yMax).toBe(30);
  });

  it('bins use the active y range as their min/max', () => {
    const layout = computeLineDistributionLayout({
      series: [seriesA],
      yMin: 0,
      yMax: 20,
      binCount: 4,
      width: 600,
      height: 300,
      padding: 30,
    });
    expect(layout.bins[0]?.binMin).toBe(0);
    expect(layout.bins[3]?.binMax).toBe(20);
  });
});

describe('describeLineDistributionChart', () => {
  it('returns "No data" on empty / hidden / no finite', () => {
    expect(describeLineDistributionChart(null)).toBe('No data');
    expect(describeLineDistributionChart([])).toBe('No data');
    expect(
      describeLineDistributionChart([seriesA], 4, new Set(['a'])),
    ).toBe('No data');
  });

  it('summarises mean + median per series and combined', () => {
    const text = describeLineDistributionChart([seriesA, seriesB], 4);
    expect(text).toContain('2 series');
    expect(text).toContain('4 bins');
    expect(text).toContain('Latency: mean');
    expect(text).toContain('Throughput: mean');
    expect(text).toContain('Combined mean');
  });
});

describe('<ChartLineDistribution /> rendering', () => {
  it('renders nothing meaningful when empty series', () => {
    const { container } = render(<ChartLineDistribution series={[]} />);
    const root = container.querySelector(
      '[data-section="chart-line-distribution"]',
    );
    expect(root).not.toBeNull();
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-distribution-path"]',
      ),
    ).toHaveLength(0);
  });

  it('renders one line path per series', () => {
    const { container } = render(
      <ChartLineDistribution series={[seriesA, seriesB]} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-distribution-path"]',
      ),
    ).toHaveLength(2);
  });

  it('renders histogram bars by default', () => {
    const { container } = render(
      <ChartLineDistribution series={[seriesA]} binCount={6} />,
    );
    const bars = container.querySelectorAll(
      '[data-section="chart-line-distribution-bin"]',
    );
    expect(bars.length).toBeGreaterThan(0);
  });

  it('omits histogram when showHistogram=false', () => {
    const { container } = render(
      <ChartLineDistribution series={[seriesA]} showHistogram={false} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-distribution-bin"]',
      ),
    ).toHaveLength(0);
  });

  it('renders the histogram background by default', () => {
    const { container } = render(
      <ChartLineDistribution series={[seriesA]} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-distribution-histogram-bg"]',
      ),
    ).not.toBeNull();
  });

  it('omits histogram background when showHistogramBg=false', () => {
    const { container } = render(
      <ChartLineDistribution series={[seriesA]} showHistogramBg={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-distribution-histogram-bg"]',
      ),
    ).toBeNull();
  });

  it('renders mean + median reference lines by default', () => {
    const { container } = render(
      <ChartLineDistribution series={[seriesA]} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-distribution-mean-line"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-distribution-median-line"]',
      ),
    ).not.toBeNull();
  });

  it('omits mean line when showMeanLine=false', () => {
    const { container } = render(
      <ChartLineDistribution series={[seriesA]} showMeanLine={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-distribution-mean-line"]',
      ),
    ).toBeNull();
  });

  it('omits median line when showMedianLine=false', () => {
    const { container } = render(
      <ChartLineDistribution series={[seriesA]} showMedianLine={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-distribution-median-line"]',
      ),
    ).toBeNull();
  });

  it('exposes data-bin-* on bin segments', () => {
    const { container } = render(
      <ChartLineDistribution series={[seriesA]} binCount={4} />,
    );
    const bar = container.querySelector(
      '[data-section="chart-line-distribution-bin"]',
    );
    expect(bar?.getAttribute('data-bin-index')).toBeTruthy();
    expect(bar?.getAttribute('data-series-id')).toBe('a');
    expect(bar?.getAttribute('data-count')).toBeTruthy();
  });

  it('renders dots per finite point', () => {
    const { container } = render(
      <ChartLineDistribution series={[seriesA]} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-distribution-dot"]',
      ),
    ).toHaveLength(seriesA.data.length);
  });

  it('hides dots when showDots=false', () => {
    const { container } = render(
      <ChartLineDistribution series={[seriesA]} showDots={false} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-distribution-dot"]',
      ),
    ).toHaveLength(0);
  });

  it('renders aria description and labels region', () => {
    render(<ChartLineDistribution series={[seriesA]} />);
    expect(
      screen.getByRole('region', {
        name: /line chart with inline distribution histogram/i,
      }),
    ).toBeTruthy();
  });

  it('shows point tooltip on dot hover', () => {
    const { container } = render(
      <ChartLineDistribution series={[seriesA]} />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-distribution-dot"][data-point-index="3"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    expect(
      container.querySelector(
        '[data-section="chart-line-distribution-tooltip"]',
      ),
    ).not.toBeNull();
  });

  it('shows bin tooltip on bin hover with per-series counts', () => {
    const { container } = render(
      <ChartLineDistribution series={[seriesA, seriesB]} binCount={4} />,
    );
    const bar = container.querySelector(
      '[data-section="chart-line-distribution-bin"][data-bin-index="2"]',
    ) as SVGRectElement;
    fireEvent.mouseEnter(bar);
    const tip = container.querySelector(
      '[data-section="chart-line-distribution-bin-tooltip"]',
    );
    expect(tip).not.toBeNull();
    expect(
      tip?.querySelector(
        '[data-section="chart-line-distribution-bin-tooltip-total"]',
      )?.textContent,
    ).toMatch(/total:/);
    const seriesRows = tip?.querySelectorAll(
      '[data-section="chart-line-distribution-bin-tooltip-series"]',
    );
    expect(seriesRows?.length).toBeGreaterThan(0);
  });

  it('omits tooltips when showTooltip=false', () => {
    const { container } = render(
      <ChartLineDistribution
        series={[seriesA]}
        showTooltip={false}
      />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-distribution-dot"][data-point-index="0"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    expect(
      container.querySelector(
        '[data-section="chart-line-distribution-tooltip"]',
      ),
    ).toBeNull();
  });

  it('invokes onPointClick with series + point', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ChartLineDistribution
        series={[seriesA]}
        onPointClick={onClick}
      />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-distribution-dot"][data-point-index="2"]',
    ) as SVGCircleElement;
    fireEvent.click(dot);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0]?.[0].point.y).toBe(12);
  });

  it('invokes onBinClick when a bin is clicked', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ChartLineDistribution
        series={[seriesA]}
        binCount={4}
        onBinClick={onClick}
      />,
    );
    const bar = container.querySelector(
      '[data-section="chart-line-distribution-bin"]',
    ) as SVGRectElement;
    fireEvent.click(bar);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0]?.[0].bin.total).toBeGreaterThan(0);
  });

  it('legend shows mean per series', () => {
    const { container } = render(
      <ChartLineDistribution series={[seriesA]} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-distribution-legend-stats"]',
      )?.textContent,
    ).toMatch(/mean/);
  });

  it('toggles series via the legend (uncontrolled)', () => {
    const { container } = render(
      <ChartLineDistribution series={[seriesA, seriesB]} />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-distribution-legend-button"][data-series-id="a"]',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-distribution-path"]',
      ),
    ).toHaveLength(1);
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLineDistribution
        series={[seriesA, seriesB]}
        hiddenSeries={new Set(['b'])}
      />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-distribution-path"]',
      ),
    ).toHaveLength(1);
  });

  it('emits onHiddenSeriesChange', () => {
    const onChange = vi.fn();
    const { container } = render(
      <ChartLineDistribution
        series={[seriesA]}
        onHiddenSeriesChange={onChange}
      />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-distribution-legend-button"][data-series-id="a"]',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0].has('a')).toBe(true);
  });

  it('omits legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineDistribution series={[seriesA]} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-distribution-legend"]',
      ),
    ).toBeNull();
  });

  it('exposes data-bin-count and data-combined-mean/median on root', () => {
    const { container } = render(
      <ChartLineDistribution series={[seriesA]} binCount={6} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-distribution"]',
    ) as HTMLDivElement;
    expect(root.getAttribute('data-bin-count')).toBe('6');
    expect(Number(root.getAttribute('data-combined-mean'))).toBeGreaterThan(0);
    expect(Number(root.getAttribute('data-combined-median'))).toBeGreaterThan(
      0,
    );
  });

  it('animate flag toggles data-animate and fade-in class', () => {
    const { container } = render(
      <ChartLineDistribution series={[seriesA]} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-distribution"]',
    ) as HTMLDivElement;
    expect(root.getAttribute('data-animate')).toBe('true');
    expect(root.className).toContain('motion-safe:animate-fade-in');
    const { container: c2 } = render(
      <ChartLineDistribution series={[seriesA]} animate={false} />,
    );
    const r2 = c2.querySelector(
      '[data-section="chart-line-distribution"]',
    ) as HTMLDivElement;
    expect(r2.getAttribute('data-animate')).toBe('false');
    expect(r2.className).not.toContain('motion-safe:animate-fade-in');
  });

  it('forwards ref to root div', () => {
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineDistribution ref={ref} series={[seriesA]} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-distribution',
    );
  });

  it('renders a stable displayName for devtools', () => {
    expect(ChartLineDistribution.displayName).toBe('ChartLineDistribution');
  });
});
