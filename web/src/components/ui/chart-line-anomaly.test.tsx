import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  ChartLineAnomaly,
  DEFAULT_CHART_LINE_ANOMALY_HEIGHT,
  DEFAULT_CHART_LINE_ANOMALY_HIGH_COLOR,
  DEFAULT_CHART_LINE_ANOMALY_LOW_COLOR,
  DEFAULT_CHART_LINE_ANOMALY_PADDING,
  DEFAULT_CHART_LINE_ANOMALY_PALETTE,
  DEFAULT_CHART_LINE_ANOMALY_THRESHOLD,
  DEFAULT_CHART_LINE_ANOMALY_TICK_COUNT,
  DEFAULT_CHART_LINE_ANOMALY_WIDTH,
  classifyLineAnomalyDirection,
  computeLineAnomalyLayout,
  computeLineAnomalyStats,
  computeLineAnomalyZScore,
  describeLineAnomalyChart,
  getLineAnomalyDefaultColor,
  getLineAnomalyFinitePoints,
  type ChartLineAnomalyPoint,
  type ChartLineAnomalySeries,
} from './chart-line-anomaly';

const seriesA: ChartLineAnomalySeries = {
  id: 'a',
  label: 'Sensor',
  data: [
    { x: 0, y: 10 },
    { x: 1, y: 11 },
    { x: 2, y: 9 },
    { x: 3, y: 10 },
    { x: 4, y: 50 }, // big positive spike (high anomaly)
    { x: 5, y: 11 },
    { x: 6, y: 9 },
    { x: 7, y: -30 }, // big negative spike (low anomaly)
    { x: 8, y: 10 },
    { x: 9, y: 11 },
  ],
};

const constantSeries: ChartLineAnomalySeries = {
  id: 'c',
  label: 'Constant',
  data: [
    { x: 0, y: 5 },
    { x: 1, y: 5 },
    { x: 2, y: 5 },
  ],
};

describe('DEFAULT_CHART_LINE_ANOMALY_* defaults', () => {
  it('has positive width, height, padding, tick count', () => {
    expect(DEFAULT_CHART_LINE_ANOMALY_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_ANOMALY_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_ANOMALY_PADDING).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_CHART_LINE_ANOMALY_TICK_COUNT).toBeGreaterThanOrEqual(2);
  });

  it('default threshold is 2 (sigma)', () => {
    expect(DEFAULT_CHART_LINE_ANOMALY_THRESHOLD).toBe(2);
  });

  it('has distinct high / low anomaly colors', () => {
    expect(DEFAULT_CHART_LINE_ANOMALY_HIGH_COLOR).not.toBe(
      DEFAULT_CHART_LINE_ANOMALY_LOW_COLOR,
    );
  });

  it('exposes a 10-color palette', () => {
    expect(DEFAULT_CHART_LINE_ANOMALY_PALETTE).toHaveLength(10);
  });
});

describe('getLineAnomalyDefaultColor', () => {
  it('cycles through the palette', () => {
    expect(getLineAnomalyDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_ANOMALY_PALETTE[0],
    );
    expect(getLineAnomalyDefaultColor(11)).toBe(
      DEFAULT_CHART_LINE_ANOMALY_PALETTE[1],
    );
  });

  it('falls back to first color on invalid index', () => {
    expect(getLineAnomalyDefaultColor(-1)).toBe(
      DEFAULT_CHART_LINE_ANOMALY_PALETTE[0],
    );
    expect(getLineAnomalyDefaultColor(Number.NaN)).toBe(
      DEFAULT_CHART_LINE_ANOMALY_PALETTE[0],
    );
  });
});

describe('getLineAnomalyFinitePoints', () => {
  it('drops non-finite samples', () => {
    expect(
      getLineAnomalyFinitePoints([
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
      getLineAnomalyFinitePoints(
        null as unknown as ReadonlyArray<ChartLineAnomalyPoint>,
      ),
    ).toEqual([]);
  });
});

describe('computeLineAnomalyStats', () => {
  it('returns zeros for empty / non-array', () => {
    expect(computeLineAnomalyStats([])).toEqual({
      finiteCount: 0,
      mean: 0,
      stddev: 0,
      ok: false,
    });
    expect(
      computeLineAnomalyStats(
        null as unknown as readonly ChartLineAnomalyPoint[],
      ),
    ).toEqual({
      finiteCount: 0,
      mean: 0,
      stddev: 0,
      ok: false,
    });
  });

  it('ok=false when n<2', () => {
    const s = computeLineAnomalyStats([{ x: 0, y: 5 }]);
    expect(s.finiteCount).toBe(1);
    expect(s.mean).toBe(5);
    expect(s.stddev).toBe(0);
    expect(s.ok).toBe(false);
  });

  it('ok=false when stddev is 0 (constant series)', () => {
    const s = computeLineAnomalyStats(constantSeries.data);
    expect(s.mean).toBe(5);
    expect(s.stddev).toBe(0);
    expect(s.ok).toBe(false);
  });

  it('uses sample stddev (Bessel n-1)', () => {
    // [2, 4]: mean=3, ss = (2-3)^2 + (4-3)^2 = 2, sample stddev = sqrt(2/1) = sqrt(2).
    const s = computeLineAnomalyStats([
      { x: 0, y: 2 },
      { x: 1, y: 4 },
    ]);
    expect(s.mean).toBe(3);
    expect(s.stddev).toBeCloseTo(Math.sqrt(2), 6);
    expect(s.ok).toBe(true);
  });

  it('drops non-finite samples before computing', () => {
    const s = computeLineAnomalyStats([
      { x: 0, y: 2 },
      { x: 1, y: Number.NaN },
      { x: 2, y: 4 },
    ]);
    expect(s.finiteCount).toBe(2);
    expect(s.mean).toBe(3);
  });
});

describe('computeLineAnomalyZScore', () => {
  it('computes (y - mean) / stddev', () => {
    expect(computeLineAnomalyZScore(10, 5, 2.5)).toBe(2);
  });

  it('returns 0 on non-finite or zero stddev', () => {
    expect(computeLineAnomalyZScore(Number.NaN, 5, 2)).toBe(0);
    expect(computeLineAnomalyZScore(5, Number.NaN, 2)).toBe(0);
    expect(computeLineAnomalyZScore(5, 5, Number.NaN)).toBe(0);
    expect(computeLineAnomalyZScore(10, 5, 0)).toBe(0);
    expect(computeLineAnomalyZScore(10, 5, -1)).toBe(0);
  });
});

describe('classifyLineAnomalyDirection', () => {
  it('classifies high / low / normal', () => {
    expect(classifyLineAnomalyDirection(3, 2)).toBe('high');
    expect(classifyLineAnomalyDirection(-3, 2)).toBe('low');
    expect(classifyLineAnomalyDirection(1, 2)).toBe('normal');
    expect(classifyLineAnomalyDirection(0, 2)).toBe('normal');
  });

  it('treats |z| === threshold as anomaly (inclusive)', () => {
    expect(classifyLineAnomalyDirection(2, 2)).toBe('high');
    expect(classifyLineAnomalyDirection(-2, 2)).toBe('low');
  });

  it('returns normal for non-finite z', () => {
    expect(classifyLineAnomalyDirection(Number.NaN, 2)).toBe('normal');
  });

  it('falls back to default threshold for non-finite / negative threshold', () => {
    expect(classifyLineAnomalyDirection(2.5, Number.NaN)).toBe('high');
    expect(classifyLineAnomalyDirection(2.5, -1)).toBe('high');
  });
});

describe('computeLineAnomalyLayout', () => {
  it('returns empty when no series', () => {
    const layout = computeLineAnomalyLayout({
      series: [],
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series).toEqual([]);
  });

  it('returns empty when canvas degenerate', () => {
    const layout = computeLineAnomalyLayout({
      series: [seriesA],
      width: 20,
      height: 20,
      padding: 30,
    });
    expect(layout.series).toEqual([]);
  });

  it('detects high and low anomalies at default threshold', () => {
    const layout = computeLineAnomalyLayout({
      series: [seriesA],
      width: 400,
      height: 300,
      padding: 30,
    });
    const s = layout.series[0]!;
    expect(s.stats.ok).toBe(true);
    const high = s.points.find((p) => p.direction === 'high');
    const low = s.points.find((p) => p.direction === 'low');
    expect(high?.index).toBe(4);
    expect(low?.index).toBe(7);
    expect(s.highCount).toBeGreaterThanOrEqual(1);
    expect(s.lowCount).toBeGreaterThanOrEqual(1);
  });

  it('honors per-series threshold override', () => {
    const layout = computeLineAnomalyLayout({
      series: [{ ...seriesA, threshold: 5 }],
      threshold: 2,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series[0]?.threshold).toBe(5);
    // With a higher threshold, fewer anomalies are detected.
    expect(layout.series[0]?.anomalyCount).toBeLessThanOrEqual(2);
  });

  it('produces an empty band for stats with ok=false', () => {
    const layout = computeLineAnomalyLayout({
      series: [constantSeries],
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series[0]?.bandValid).toBe(false);
    expect(layout.series[0]?.bandPath).toBe('');
    expect(layout.series[0]?.anomalyCount).toBe(0);
  });

  it('expands y bounds to include the upper / lower band', () => {
    const noisy: ChartLineAnomalySeries = {
      id: 'n',
      label: 'N',
      data: [
        { x: 0, y: 5 },
        { x: 1, y: 5 },
        { x: 2, y: 100 },
        { x: 3, y: 5 },
      ],
    };
    const layout = computeLineAnomalyLayout({
      series: [noisy],
      threshold: 1,
      width: 400,
      height: 300,
      padding: 30,
    });
    const s = layout.series[0]!;
    // upper bound = mean + threshold * stddev.
    expect(layout.yMax).toBeGreaterThanOrEqual(
      s.stats.mean + s.threshold * s.stats.stddev,
    );
    expect(layout.yMin).toBeLessThanOrEqual(
      s.stats.mean - s.threshold * s.stats.stddev,
    );
  });

  it('omits band expansion when showBand=false', () => {
    const noisy: ChartLineAnomalySeries = {
      id: 'n',
      label: 'N',
      data: [
        { x: 0, y: 5 },
        { x: 1, y: 6 },
        { x: 2, y: 7 },
      ],
    };
    const layout = computeLineAnomalyLayout({
      series: [noisy],
      threshold: 10,
      showBand: false,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series[0]?.bandPath).toBe('');
  });

  it('honors hidden series filter', () => {
    const layout = computeLineAnomalyLayout({
      series: [seriesA, { id: 'b', label: 'B', data: [{ x: 0, y: 5 }] }],
      hiddenSeries: new Set(['a']),
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series).toHaveLength(1);
    expect(layout.series[0]?.id).toBe('b');
  });

  it('records totalAnomalies across all visible series', () => {
    const layout = computeLineAnomalyLayout({
      series: [seriesA],
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.totalAnomalies).toBeGreaterThanOrEqual(2);
  });

  it('respects user-supplied bounds overrides', () => {
    const layout = computeLineAnomalyLayout({
      series: [seriesA],
      width: 400,
      height: 300,
      padding: 30,
      xMin: -10,
      xMax: 20,
      yMin: -100,
      yMax: 100,
    });
    expect(layout.xMin).toBe(-10);
    expect(layout.xMax).toBe(20);
    expect(layout.yMin).toBe(-100);
    expect(layout.yMax).toBe(100);
  });

  it('produces axis ticks at the requested step count', () => {
    const layout = computeLineAnomalyLayout({
      series: [seriesA],
      tickCount: 6,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.xTicks).toHaveLength(6);
    expect(layout.yTicks).toHaveLength(6);
  });

  it('per-point z-score is reported on each layout point', () => {
    const layout = computeLineAnomalyLayout({
      series: [seriesA],
      width: 400,
      height: 300,
      padding: 30,
    });
    const pts = layout.series[0]!.points;
    expect(pts.every((p) => isFinite(p.zScore))).toBe(true);
    const anomalies = pts.filter((p) => p.isAnomaly);
    for (const a of anomalies) {
      expect(Math.abs(a.zScore)).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('describeLineAnomalyChart', () => {
  it('returns "No data" on empty / hidden / no finite', () => {
    expect(describeLineAnomalyChart(null)).toBe('No data');
    expect(describeLineAnomalyChart([])).toBe('No data');
    expect(
      describeLineAnomalyChart([seriesA], 2, new Set(['a'])),
    ).toBe('No data');
  });

  it('summarises mean + stddev + anomaly counts per series', () => {
    const text = describeLineAnomalyChart([seriesA]);
    expect(text).toContain('1 series');
    expect(text).toContain('Sensor');
    expect(text).toContain('mean');
    expect(text).toContain('stddev');
    expect(text).toMatch(/anomaly|anomalies/);
  });

  it('mentions threshold in the per-series part', () => {
    const text = describeLineAnomalyChart([seriesA], 3);
    expect(text).toContain('threshold 3');
  });

  it('reports 0 anomalies for a constant series', () => {
    const text = describeLineAnomalyChart([constantSeries]);
    expect(text).toMatch(/0 anomalies/);
  });
});

describe('<ChartLineAnomaly /> rendering', () => {
  it('renders nothing meaningful when empty series', () => {
    const { container } = render(<ChartLineAnomaly series={[]} />);
    const root = container.querySelector(
      '[data-section="chart-line-anomaly"]',
    );
    expect(root).not.toBeNull();
    expect(
      container.querySelectorAll('[data-section="chart-line-anomaly-dot"]'),
    ).toHaveLength(0);
  });

  it('renders one line path per series', () => {
    const { container } = render(<ChartLineAnomaly series={[seriesA]} />);
    expect(
      container.querySelectorAll('[data-section="chart-line-anomaly-path"]'),
    ).toHaveLength(1);
  });

  it('renders the normal-range band by default', () => {
    const { container } = render(<ChartLineAnomaly series={[seriesA]} />);
    expect(
      container.querySelector('[data-section="chart-line-anomaly-band"]'),
    ).not.toBeNull();
  });

  it('omits the band when showBand=false', () => {
    const { container } = render(
      <ChartLineAnomaly series={[seriesA]} showBand={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-anomaly-band"]'),
    ).toBeNull();
  });

  it('omits the band when stats.ok=false', () => {
    const { container } = render(
      <ChartLineAnomaly series={[constantSeries]} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-anomaly-band"]'),
    ).toBeNull();
  });

  it('renders the mean line and bound lines by default', () => {
    const { container } = render(<ChartLineAnomaly series={[seriesA]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-anomaly-mean-line"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-anomaly-bound-line"]',
      ).length,
    ).toBe(2);
  });

  it('omits mean line when showMeanLine=false', () => {
    const { container } = render(
      <ChartLineAnomaly series={[seriesA]} showMeanLine={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-anomaly-mean-line"]',
      ),
    ).toBeNull();
  });

  it('omits bound lines when showBoundLines=false', () => {
    const { container } = render(
      <ChartLineAnomaly series={[seriesA]} showBoundLines={false} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-anomaly-bound-line"]',
      ),
    ).toHaveLength(0);
  });

  it('renders one dot per finite point with direction + z-score data attrs', () => {
    const { container } = render(<ChartLineAnomaly series={[seriesA]} />);
    const dots = container.querySelectorAll(
      '[data-section="chart-line-anomaly-dot"]',
    );
    expect(dots).toHaveLength(seriesA.data.length);
    const highDot = container.querySelector(
      '[data-section="chart-line-anomaly-dot"][data-point-index="4"]',
    );
    expect(highDot?.getAttribute('data-direction')).toBe('high');
    expect(highDot?.getAttribute('data-is-anomaly')).toBe('true');
    const lowDot = container.querySelector(
      '[data-section="chart-line-anomaly-dot"][data-point-index="7"]',
    );
    expect(lowDot?.getAttribute('data-direction')).toBe('low');
    expect(lowDot?.getAttribute('data-is-anomaly')).toBe('true');
    const normalDot = container.querySelector(
      '[data-section="chart-line-anomaly-dot"][data-point-index="0"]',
    );
    expect(normalDot?.getAttribute('data-is-anomaly')).toBe('false');
  });

  it('hides dots when showDots=false', () => {
    const { container } = render(
      <ChartLineAnomaly series={[seriesA]} showDots={false} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-anomaly-dot"]'),
    ).toHaveLength(0);
  });

  it('renders aria description and labels region', () => {
    render(<ChartLineAnomaly series={[seriesA]} />);
    expect(
      screen.getByRole('region', { name: /anomaly-aware line chart/i }),
    ).toBeTruthy();
  });

  it('shows tooltip on dot hover with z + direction', () => {
    const { container } = render(<ChartLineAnomaly series={[seriesA]} />);
    const dot = container.querySelector(
      '[data-section="chart-line-anomaly-dot"][data-point-index="4"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    const tip = container.querySelector(
      '[data-section="chart-line-anomaly-tooltip"]',
    );
    expect(tip).not.toBeNull();
    expect(tip?.getAttribute('data-direction')).toBe('high');
    expect(
      tip?.querySelector(
        '[data-section="chart-line-anomaly-tooltip-z"]',
      )?.textContent,
    ).toMatch(/high anomaly/);
  });

  it('hides tooltip on mouseLeave', () => {
    const { container } = render(<ChartLineAnomaly series={[seriesA]} />);
    const dot = container.querySelector(
      '[data-section="chart-line-anomaly-dot"][data-point-index="0"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    expect(
      container.querySelector('[data-section="chart-line-anomaly-tooltip"]'),
    ).not.toBeNull();
    fireEvent.mouseLeave(dot);
    expect(
      container.querySelector('[data-section="chart-line-anomaly-tooltip"]'),
    ).toBeNull();
  });

  it('omits tooltip when showTooltip=false', () => {
    const { container } = render(
      <ChartLineAnomaly series={[seriesA]} showTooltip={false} />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-anomaly-dot"][data-point-index="0"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    expect(
      container.querySelector('[data-section="chart-line-anomaly-tooltip"]'),
    ).toBeNull();
  });

  it('invokes onPointClick with series + point', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ChartLineAnomaly series={[seriesA]} onPointClick={onClick} />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-anomaly-dot"][data-point-index="4"]',
    ) as SVGCircleElement;
    fireEvent.click(dot);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0]?.[0].point.direction).toBe('high');
  });

  it('exposes per-series anomaly counts via data attrs', () => {
    const { container } = render(<ChartLineAnomaly series={[seriesA]} />);
    const group = container.querySelector(
      '[data-section="chart-line-anomaly-series-group"][data-series-id="a"]',
    );
    expect(
      Number(group?.getAttribute('data-series-anomaly-count')),
    ).toBeGreaterThanOrEqual(2);
    expect(
      Number(group?.getAttribute('data-series-high-count')),
    ).toBeGreaterThanOrEqual(1);
    expect(
      Number(group?.getAttribute('data-series-low-count')),
    ).toBeGreaterThanOrEqual(1);
    expect(group?.getAttribute('data-series-stats-ok')).toBe('true');
  });

  it('legend shows anomaly count', () => {
    const { container } = render(<ChartLineAnomaly series={[seriesA]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-anomaly-legend-stats"]',
      )?.textContent,
    ).toMatch(/anomaly|anomalies/);
  });

  it('toggles series via the legend (uncontrolled)', () => {
    const { container } = render(
      <ChartLineAnomaly
        series={[seriesA, { id: 'b', label: 'B', data: [{ x: 0, y: 5 }] }]}
      />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-anomaly-legend-button"][data-series-id="a"]',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(
      container.querySelectorAll('[data-section="chart-line-anomaly-path"]'),
    ).toHaveLength(1);
  });

  it('respects controlled hiddenSeries prop', () => {
    const { container } = render(
      <ChartLineAnomaly
        series={[seriesA, { id: 'b', label: 'B', data: [{ x: 0, y: 5 }] }]}
        hiddenSeries={new Set(['b'])}
      />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-anomaly-path"]'),
    ).toHaveLength(1);
  });

  it('emits onHiddenSeriesChange', () => {
    const onChange = vi.fn();
    const { container } = render(
      <ChartLineAnomaly
        series={[seriesA]}
        onHiddenSeriesChange={onChange}
      />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-anomaly-legend-button"][data-series-id="a"]',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0].has('a')).toBe(true);
  });

  it('omits legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineAnomaly series={[seriesA]} showLegend={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-anomaly-legend"]'),
    ).toBeNull();
  });

  it('exposes data-threshold and data-total-anomalies on root', () => {
    const { container } = render(
      <ChartLineAnomaly series={[seriesA]} threshold={3} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-anomaly"]',
    ) as HTMLDivElement;
    expect(root.getAttribute('data-threshold')).toBe('3');
    expect(Number(root.getAttribute('data-total-anomalies'))).toBeGreaterThanOrEqual(0);
  });

  it('animate flag toggles data-animate and fade-in class', () => {
    const { container } = render(<ChartLineAnomaly series={[seriesA]} />);
    const root = container.querySelector(
      '[data-section="chart-line-anomaly"]',
    ) as HTMLDivElement;
    expect(root.getAttribute('data-animate')).toBe('true');
    expect(root.className).toContain('motion-safe:animate-fade-in');
    const { container: c2 } = render(
      <ChartLineAnomaly series={[seriesA]} animate={false} />,
    );
    const r2 = c2.querySelector(
      '[data-section="chart-line-anomaly"]',
    ) as HTMLDivElement;
    expect(r2.getAttribute('data-animate')).toBe('false');
    expect(r2.className).not.toContain('motion-safe:animate-fade-in');
  });

  it('forwards ref to root div', () => {
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineAnomaly ref={ref} series={[seriesA]} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-anomaly',
    );
  });

  it('renders a stable displayName for devtools', () => {
    expect(ChartLineAnomaly.displayName).toBe('ChartLineAnomaly');
  });
});
