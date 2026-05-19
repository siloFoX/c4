import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  ChartLineSparkBar,
  DEFAULT_CHART_LINE_SPARK_BAR_BAR_RATIO,
  DEFAULT_CHART_LINE_SPARK_BAR_HEIGHT,
  DEFAULT_CHART_LINE_SPARK_BAR_PADDING,
  DEFAULT_CHART_LINE_SPARK_BAR_PALETTE,
  DEFAULT_CHART_LINE_SPARK_BAR_WIDTH,
  computeLineSparkBarBounds,
  computeLineSparkBarLayout,
  describeLineSparkBarChart,
  getLineSparkBarDefaultColor,
  getLineSparkBarFinitePoints,
  type ChartLineSparkBarPoint,
  type ChartLineSparkBarSeries,
} from './chart-line-spark-bar';

const series: ChartLineSparkBarSeries = {
  id: 'a',
  label: 'Activity',
  data: [
    { x: 0, value: 10, bar: 5 },
    { x: 1, value: 12, bar: 8 },
    { x: 2, value: 9, bar: 6 },
    { x: 3, value: 15, bar: 12 },
    { x: 4, value: 13, bar: 7 },
  ],
};

const signedSeries: ChartLineSparkBarSeries = {
  id: 'b',
  label: 'Net',
  data: [
    { x: 0, value: 100, bar: 5 },
    { x: 1, value: 105, bar: -3 },
    { x: 2, value: 102, bar: 8 },
    { x: 3, value: 110, bar: -4 },
  ],
};

describe('DEFAULT_CHART_LINE_SPARK_BAR_* defaults', () => {
  it('uses compact width / height / padding sized for sparklines', () => {
    expect(DEFAULT_CHART_LINE_SPARK_BAR_WIDTH).toBeLessThanOrEqual(200);
    expect(DEFAULT_CHART_LINE_SPARK_BAR_HEIGHT).toBeLessThanOrEqual(72);
    expect(DEFAULT_CHART_LINE_SPARK_BAR_PADDING).toBeLessThanOrEqual(8);
  });

  it('bar ratio in (0, 1)', () => {
    expect(DEFAULT_CHART_LINE_SPARK_BAR_BAR_RATIO).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_SPARK_BAR_BAR_RATIO).toBeLessThan(1);
  });

  it('exposes a 10-color palette', () => {
    expect(DEFAULT_CHART_LINE_SPARK_BAR_PALETTE).toHaveLength(10);
  });
});

describe('getLineSparkBarDefaultColor', () => {
  it('cycles through the palette', () => {
    expect(getLineSparkBarDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_SPARK_BAR_PALETTE[0],
    );
    expect(getLineSparkBarDefaultColor(11)).toBe(
      DEFAULT_CHART_LINE_SPARK_BAR_PALETTE[1],
    );
  });

  it('falls back to first color on invalid index', () => {
    expect(getLineSparkBarDefaultColor(-1)).toBe(
      DEFAULT_CHART_LINE_SPARK_BAR_PALETTE[0],
    );
    expect(getLineSparkBarDefaultColor(Number.NaN)).toBe(
      DEFAULT_CHART_LINE_SPARK_BAR_PALETTE[0],
    );
  });
});

describe('getLineSparkBarFinitePoints', () => {
  it('drops non-finite samples', () => {
    expect(
      getLineSparkBarFinitePoints([
        { x: 0, value: 1, bar: 1 },
        { x: Number.NaN, value: 2, bar: 2 },
        { x: 3, value: Number.POSITIVE_INFINITY, bar: 3 },
        { x: 4, value: 4, bar: Number.NaN },
        { x: 5, value: 5, bar: 5 },
      ]),
    ).toEqual([
      { x: 0, value: 1, bar: 1 },
      { x: 5, value: 5, bar: 5 },
    ]);
  });

  it('returns [] for non-array', () => {
    expect(
      getLineSparkBarFinitePoints(
        null as unknown as ReadonlyArray<ChartLineSparkBarPoint>,
      ),
    ).toEqual([]);
  });
});

describe('computeLineSparkBarBounds', () => {
  it('returns unit-ish defaults for empty', () => {
    const b = computeLineSparkBarBounds([]);
    expect(b.xMin).toBe(0);
    expect(b.xMax).toBe(1);
    expect(b.valueMin).toBe(0);
    expect(b.valueMax).toBe(1);
    expect(b.barMin).toBe(0);
    expect(b.barMax).toBe(1);
  });

  it('clamps barMin to 0 when all bars non-negative', () => {
    const b = computeLineSparkBarBounds([series]);
    expect(b.barMin).toBe(0);
    expect(b.barMax).toBeGreaterThanOrEqual(12);
  });

  it('does not clamp barMin when negative bars exist', () => {
    const b = computeLineSparkBarBounds([signedSeries]);
    expect(b.barMin).toBeLessThan(0);
    expect(b.barMax).toBeGreaterThan(0);
  });

  it('honors hidden series filter', () => {
    const b = computeLineSparkBarBounds(
      [series, signedSeries],
      new Set(['a']),
    );
    // Only signedSeries contributes; bar range spans negative + positive.
    expect(b.barMin).toBeLessThan(0);
  });

  it('returns 0..1 when only non-finite points present', () => {
    const b = computeLineSparkBarBounds([
      {
        id: 'x',
        label: 'x',
        data: [{ x: Number.NaN, value: 1, bar: 1 }],
      },
    ]);
    expect(b.valueMin).toBe(0);
    expect(b.valueMax).toBe(1);
  });
});

describe('computeLineSparkBarLayout', () => {
  it('returns empty when no series', () => {
    const layout = computeLineSparkBarLayout({
      series: [],
      width: 160,
      height: 48,
      padding: 4,
    });
    expect(layout.series).toEqual([]);
  });

  it('returns empty when canvas degenerate', () => {
    const layout = computeLineSparkBarLayout({
      series: [series],
      width: 4,
      height: 4,
      padding: 4,
    });
    expect(layout.series).toEqual([]);
  });

  it('builds layout with path + per-point bar geometry', () => {
    const layout = computeLineSparkBarLayout({
      series: [series],
      width: 160,
      height: 48,
      padding: 4,
    });
    expect(layout.series).toHaveLength(1);
    const s = layout.series[0]!;
    expect(s.path).toMatch(/^M /);
    expect(s.points).toHaveLength(5);
    for (const p of s.points) {
      expect(p.barHeight).toBeGreaterThanOrEqual(0);
      expect(p.barWidth).toBeGreaterThan(0);
    }
  });

  it('splits canvas into line + bar tracks separated by trackGap', () => {
    const layout = computeLineSparkBarLayout({
      series: [series],
      width: 160,
      height: 48,
      padding: 4,
      trackGap: 2,
    });
    expect(layout.lineTrackBottom).toBeLessThan(layout.barTrackTop);
    expect(layout.barTrackTop - layout.lineTrackBottom).toBe(2);
    expect(layout.barTrackBottom).toBeGreaterThan(layout.barTrackTop);
  });

  it('honors barRatio in (0, 1)', () => {
    const layoutA = computeLineSparkBarLayout({
      series: [series],
      width: 160,
      height: 48,
      padding: 4,
      barRatio: 0.3,
    });
    const layoutB = computeLineSparkBarLayout({
      series: [series],
      width: 160,
      height: 48,
      padding: 4,
      barRatio: 0.8,
    });
    const barA = layoutA.barTrackBottom - layoutA.barTrackTop;
    const barB = layoutB.barTrackBottom - layoutB.barTrackTop;
    expect(barB).toBeGreaterThan(barA);
  });

  it('clamps barRatio to [0.05, 0.95]', () => {
    const layout = computeLineSparkBarLayout({
      series: [series],
      width: 160,
      height: 48,
      padding: 4,
      barRatio: 5,
    });
    const barHeight = layout.barTrackBottom - layout.barTrackTop;
    const innerHeight = layout.innerHeight;
    expect(barHeight).toBeLessThanOrEqual(innerHeight);
  });

  it('records barZeroY at bar==0 within bar track', () => {
    const layout = computeLineSparkBarLayout({
      series: [signedSeries],
      width: 160,
      height: 48,
      padding: 4,
    });
    expect(layout.barZeroY).toBeGreaterThanOrEqual(layout.barTrackTop);
    expect(layout.barZeroY).toBeLessThanOrEqual(layout.barTrackBottom);
  });

  it('positions positive bars above barZeroY (smaller y)', () => {
    const layout = computeLineSparkBarLayout({
      series: [signedSeries],
      width: 160,
      height: 48,
      padding: 4,
    });
    const posPoint = layout.series[0]!.points.find(
      (p) => p.barSign === 'positive',
    );
    expect(posPoint).toBeTruthy();
    if (posPoint) {
      expect(posPoint.barY).toBeLessThan(layout.barZeroY);
    }
  });

  it('positions negative bars below barZeroY (larger y)', () => {
    const layout = computeLineSparkBarLayout({
      series: [signedSeries],
      width: 160,
      height: 48,
      padding: 4,
    });
    const negPoint = layout.series[0]!.points.find(
      (p) => p.barSign === 'negative',
    );
    expect(negPoint).toBeTruthy();
    if (negPoint) {
      expect(negPoint.barY).toBeGreaterThanOrEqual(layout.barZeroY);
    }
  });

  it('flags per-point isMin / isMax for the canonical extremes', () => {
    const layout = computeLineSparkBarLayout({
      series: [series],
      width: 160,
      height: 48,
      padding: 4,
    });
    const minPt = layout.series[0]!.points.find((p) => p.isMin);
    const maxPt = layout.series[0]!.points.find((p) => p.isMax);
    expect(minPt?.value).toBe(9);
    expect(maxPt?.value).toBe(15);
  });

  it('honors hidden series filter', () => {
    const layout = computeLineSparkBarLayout({
      series: [series, signedSeries],
      hiddenSeries: new Set(['a']),
      width: 160,
      height: 48,
      padding: 4,
    });
    expect(layout.series).toHaveLength(1);
    expect(layout.series[0]?.id).toBe('b');
  });

  it('respects user-supplied bounds overrides', () => {
    const layout = computeLineSparkBarLayout({
      series: [series],
      width: 160,
      height: 48,
      padding: 4,
      xMin: -10,
      xMax: 20,
      valueMin: 0,
      valueMax: 100,
      barMin: -5,
      barMax: 50,
    });
    expect(layout.bounds.xMin).toBe(-10);
    expect(layout.bounds.xMax).toBe(20);
    expect(layout.bounds.valueMin).toBe(0);
    expect(layout.bounds.valueMax).toBe(100);
    expect(layout.bounds.barMin).toBe(-5);
    expect(layout.bounds.barMax).toBe(50);
  });

  it('exposes finalValue, minValue, maxValue, totalBar on the series', () => {
    const layout = computeLineSparkBarLayout({
      series: [series],
      width: 160,
      height: 48,
      padding: 4,
    });
    const s = layout.series[0]!;
    expect(s.finalValue).toBe(13);
    expect(s.minValue).toBe(9);
    expect(s.maxValue).toBe(15);
    expect(s.totalBar).toBe(5 + 8 + 6 + 12 + 7);
  });
});

describe('describeLineSparkBarChart', () => {
  it('returns "No data" on empty / hidden / no finite', () => {
    expect(describeLineSparkBarChart(null)).toBe('No data');
    expect(describeLineSparkBarChart([])).toBe('No data');
    expect(
      describeLineSparkBarChart([series], new Set(['a'])),
    ).toBe('No data');
  });

  it('summarises last value + range + bar total per series', () => {
    const text = describeLineSparkBarChart([series]);
    expect(text).toContain('1 series');
    expect(text).toContain('Activity');
    expect(text).toContain('last 13');
    expect(text).toContain('range 9 to 15');
    expect(text).toContain('bar total 38');
  });
});

describe('<ChartLineSparkBar /> rendering', () => {
  it('renders nothing meaningful when empty series', () => {
    const { container } = render(<ChartLineSparkBar series={[]} />);
    const root = container.querySelector(
      '[data-section="chart-line-spark-bar"]',
    );
    expect(root).not.toBeNull();
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-spark-bar-bar"]',
      ),
    ).toHaveLength(0);
  });

  it('renders one bar per point by default', () => {
    const { container } = render(<ChartLineSparkBar series={[series]} />);
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-spark-bar-bar"]',
      ),
    ).toHaveLength(5);
  });

  it('omits bars when showBars=false', () => {
    const { container } = render(
      <ChartLineSparkBar series={[series]} showBars={false} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-spark-bar-bar"]',
      ),
    ).toHaveLength(0);
  });

  it('renders the spark line by default', () => {
    const { container } = render(<ChartLineSparkBar series={[series]} />);
    expect(
      container.querySelector('[data-section="chart-line-spark-bar-path"]'),
    ).not.toBeNull();
  });

  it('omits the line when showLine=false', () => {
    const { container } = render(
      <ChartLineSparkBar series={[series]} showLine={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-spark-bar-path"]'),
    ).toBeNull();
  });

  it('uses signed bar colors when signedBars=true', () => {
    const { container } = render(
      <ChartLineSparkBar series={[signedSeries]} signedBars={true} />,
    );
    const bars = container.querySelectorAll(
      '[data-section="chart-line-spark-bar-bar"]',
    );
    const signs = Array.from(bars).map((b) =>
      b.getAttribute('data-bar-sign'),
    );
    expect(signs).toContain('positive');
    expect(signs).toContain('negative');
  });

  it('renders min and max dots by default', () => {
    const { container } = render(<ChartLineSparkBar series={[series]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-spark-bar-min-dot"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-spark-bar-max-dot"]',
      ),
    ).not.toBeNull();
  });

  it('omits min/max dots when showMinMaxDots=false', () => {
    const { container } = render(
      <ChartLineSparkBar series={[series]} showMinMaxDots={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-spark-bar-min-dot"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-spark-bar-max-dot"]',
      ),
    ).toBeNull();
  });

  it('renders the last-value dot by default', () => {
    const { container } = render(<ChartLineSparkBar series={[series]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-spark-bar-last-dot"]',
      ),
    ).not.toBeNull();
  });

  it('hides last-value dot when showLastValueDot=false', () => {
    const { container } = render(
      <ChartLineSparkBar series={[series]} showLastValueDot={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-spark-bar-last-dot"]',
      ),
    ).toBeNull();
  });

  it('renders the last-value pill when showLastValuePill=true', () => {
    const { container } = render(
      <ChartLineSparkBar series={[series]} showLastValuePill={true} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-spark-bar-pill"]')
        ?.textContent,
    ).toBe('13');
  });

  it('omits the last-value pill by default', () => {
    const { container } = render(<ChartLineSparkBar series={[series]} />);
    expect(
      container.querySelector('[data-section="chart-line-spark-bar-pill"]'),
    ).toBeNull();
  });

  it('renders an aria description and labels region', () => {
    render(<ChartLineSparkBar series={[series]} />);
    expect(
      screen.getByRole('region', { name: /sparkline with bar overlay/i }),
    ).toBeTruthy();
  });

  it('shows tooltip on hover with value + bar rows', () => {
    const { container } = render(<ChartLineSparkBar series={[series]} />);
    const hit = container.querySelector(
      '[data-section="chart-line-spark-bar-hit"][data-point-index="3"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(hit);
    const tip = container.querySelector(
      '[data-section="chart-line-spark-bar-tooltip"]',
    );
    expect(tip).not.toBeNull();
    expect(
      tip?.querySelector(
        '[data-section="chart-line-spark-bar-tooltip-value"]',
      )?.textContent,
    ).toMatch(/value: 15/);
    expect(
      tip?.querySelector(
        '[data-section="chart-line-spark-bar-tooltip-bar"]',
      )?.textContent,
    ).toMatch(/bar: 12/);
  });

  it('hides tooltip on mouseLeave', () => {
    const { container } = render(<ChartLineSparkBar series={[series]} />);
    const hit = container.querySelector(
      '[data-section="chart-line-spark-bar-hit"][data-point-index="0"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(hit);
    expect(
      container.querySelector('[data-section="chart-line-spark-bar-tooltip"]'),
    ).not.toBeNull();
    fireEvent.mouseLeave(hit);
    expect(
      container.querySelector('[data-section="chart-line-spark-bar-tooltip"]'),
    ).toBeNull();
  });

  it('omits tooltip when showTooltip=false', () => {
    const { container } = render(
      <ChartLineSparkBar series={[series]} showTooltip={false} />,
    );
    const hit = container.querySelector(
      '[data-section="chart-line-spark-bar-hit"][data-point-index="0"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(hit);
    expect(
      container.querySelector('[data-section="chart-line-spark-bar-tooltip"]'),
    ).toBeNull();
  });

  it('invokes onPointClick with series + point', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ChartLineSparkBar series={[series]} onPointClick={onClick} />,
    );
    const hit = container.querySelector(
      '[data-section="chart-line-spark-bar-hit"][data-point-index="2"]',
    ) as SVGCircleElement;
    fireEvent.click(hit);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0]?.[0].point.value).toBe(9);
  });

  it('exposes per-series stats via data attrs', () => {
    const { container } = render(<ChartLineSparkBar series={[series]} />);
    const group = container.querySelector(
      '[data-section="chart-line-spark-bar-series-group"][data-series-id="a"]',
    );
    expect(group?.getAttribute('data-series-final-value')).toBe('13');
    expect(group?.getAttribute('data-series-min-value')).toBe('9');
    expect(group?.getAttribute('data-series-max-value')).toBe('15');
    expect(group?.getAttribute('data-series-total-bar')).toBe('38');
  });

  it('legend hidden by default; rendered when showLegend=true', () => {
    const { container: c1 } = render(<ChartLineSparkBar series={[series]} />);
    expect(
      c1.querySelector('[data-section="chart-line-spark-bar-legend"]'),
    ).toBeNull();
    const { container: c2 } = render(
      <ChartLineSparkBar series={[series]} showLegend={true} />,
    );
    expect(
      c2.querySelector('[data-section="chart-line-spark-bar-legend"]'),
    ).not.toBeNull();
  });

  it('toggles series via the legend (uncontrolled, when shown)', () => {
    const { container } = render(
      <ChartLineSparkBar
        series={[series, signedSeries]}
        showLegend={true}
      />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-spark-bar-legend-button"][data-series-id="a"]',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-spark-bar-path"]',
      ),
    ).toHaveLength(1);
  });

  it('emits onHiddenSeriesChange', () => {
    const onChange = vi.fn();
    const { container } = render(
      <ChartLineSparkBar
        series={[series]}
        showLegend={true}
        onHiddenSeriesChange={onChange}
      />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-spark-bar-legend-button"][data-series-id="a"]',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0].has('a')).toBe(true);
  });

  it('exposes data-signed-bars on root', () => {
    const { container } = render(
      <ChartLineSparkBar series={[series]} signedBars={true} />,
    );
    expect(
      container
        .querySelector('[data-section="chart-line-spark-bar"]')
        ?.getAttribute('data-signed-bars'),
    ).toBe('true');
  });

  it('animate flag toggles data-animate and fade-in class', () => {
    const { container } = render(<ChartLineSparkBar series={[series]} />);
    const root = container.querySelector(
      '[data-section="chart-line-spark-bar"]',
    ) as HTMLDivElement;
    expect(root.getAttribute('data-animate')).toBe('true');
    expect(root.className).toContain('motion-safe:animate-fade-in');
    const { container: c2 } = render(
      <ChartLineSparkBar series={[series]} animate={false} />,
    );
    const r2 = c2.querySelector(
      '[data-section="chart-line-spark-bar"]',
    ) as HTMLDivElement;
    expect(r2.getAttribute('data-animate')).toBe('false');
    expect(r2.className).not.toContain('motion-safe:animate-fade-in');
  });

  it('forwards ref to root div', () => {
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineSparkBar ref={ref} series={[series]} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-spark-bar',
    );
  });

  it('renders a stable displayName for devtools', () => {
    expect(ChartLineSparkBar.displayName).toBe('ChartLineSparkBar');
  });
});
