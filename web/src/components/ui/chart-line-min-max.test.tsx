import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  ChartLineMinMax,
  DEFAULT_CHART_LINE_MIN_MAX_HEIGHT,
  DEFAULT_CHART_LINE_MIN_MAX_MAX_COLOR,
  DEFAULT_CHART_LINE_MIN_MAX_MIN_COLOR,
  DEFAULT_CHART_LINE_MIN_MAX_PADDING,
  DEFAULT_CHART_LINE_MIN_MAX_PALETTE,
  DEFAULT_CHART_LINE_MIN_MAX_TICK_COUNT,
  DEFAULT_CHART_LINE_MIN_MAX_WIDTH,
  buildLineMinMaxMarkerPath,
  computeLineMinMaxLayout,
  describeLineMinMaxChart,
  findLineMinMaxExtrema,
  getLineMinMaxDefaultColor,
  getLineMinMaxFinitePoints,
  type ChartLineMinMaxSeries,
} from './chart-line-min-max';

const seriesA: ChartLineMinMaxSeries = {
  id: 'a',
  label: 'A',
  data: [
    { x: 0, y: 10 },
    { x: 1, y: 30 },
    { x: 2, y: 5 },
    { x: 3, y: 25 },
    { x: 4, y: 50 },
    { x: 5, y: 15 },
  ],
};

const seriesB: ChartLineMinMaxSeries = {
  id: 'b',
  label: 'B',
  data: [
    { x: 0, y: 100 },
    { x: 1, y: 80 },
    { x: 2, y: 200 },
  ],
};

describe('DEFAULT_CHART_LINE_MIN_MAX_* defaults', () => {
  it('has positive width, height, padding, and tick count', () => {
    expect(DEFAULT_CHART_LINE_MIN_MAX_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_MIN_MAX_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_MIN_MAX_PADDING).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_CHART_LINE_MIN_MAX_TICK_COUNT).toBeGreaterThanOrEqual(2);
  });

  it('exposes a 10-color palette', () => {
    expect(DEFAULT_CHART_LINE_MIN_MAX_PALETTE).toHaveLength(10);
  });

  it('has distinct min and max default colors', () => {
    expect(DEFAULT_CHART_LINE_MIN_MAX_MIN_COLOR).toMatch(/^#[0-9a-f]{6}$/i);
    expect(DEFAULT_CHART_LINE_MIN_MAX_MAX_COLOR).toMatch(/^#[0-9a-f]{6}$/i);
    expect(DEFAULT_CHART_LINE_MIN_MAX_MIN_COLOR).not.toBe(
      DEFAULT_CHART_LINE_MIN_MAX_MAX_COLOR,
    );
  });
});

describe('getLineMinMaxDefaultColor', () => {
  it('cycles through the palette by index', () => {
    expect(getLineMinMaxDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_MIN_MAX_PALETTE[0],
    );
    expect(getLineMinMaxDefaultColor(11)).toBe(
      DEFAULT_CHART_LINE_MIN_MAX_PALETTE[1],
    );
  });

  it('falls back to first color on invalid index', () => {
    expect(getLineMinMaxDefaultColor(-1)).toBe(
      DEFAULT_CHART_LINE_MIN_MAX_PALETTE[0],
    );
    expect(getLineMinMaxDefaultColor(Number.NaN)).toBe(
      DEFAULT_CHART_LINE_MIN_MAX_PALETTE[0],
    );
  });
});

describe('getLineMinMaxFinitePoints', () => {
  it('drops non-finite samples', () => {
    expect(
      getLineMinMaxFinitePoints([
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
      getLineMinMaxFinitePoints(
        null as unknown as ReadonlyArray<{ x: number; y: number }>,
      ),
    ).toEqual([]);
  });
});

describe('findLineMinMaxExtrema', () => {
  it('returns null for empty or null input', () => {
    expect(findLineMinMaxExtrema(null)).toBeNull();
    expect(findLineMinMaxExtrema([])).toBeNull();
  });

  it('returns null when no finite samples', () => {
    expect(
      findLineMinMaxExtrema([
        { x: Number.NaN, y: 1 },
        { x: 0, y: Number.POSITIVE_INFINITY },
      ]),
    ).toBeNull();
  });

  it('finds min and max by y', () => {
    const r = findLineMinMaxExtrema(seriesA.data);
    expect(r?.min.index).toBe(2);
    expect(r?.min.x).toBe(2);
    expect(r?.min.y).toBe(5);
    expect(r?.max.index).toBe(4);
    expect(r?.max.x).toBe(4);
    expect(r?.max.y).toBe(50);
  });

  it('first occurrence wins on ties', () => {
    const r = findLineMinMaxExtrema([
      { x: 0, y: 10 },
      { x: 1, y: 10 },
      { x: 2, y: 10 },
    ]);
    // All ties: min and max both pick first index.
    expect(r?.min.index).toBe(0);
    expect(r?.max.index).toBe(0);
  });

  it('uses original-array indices (not finite-only subset)', () => {
    const r = findLineMinMaxExtrema([
      { x: 0, y: Number.NaN }, // skipped (index 0)
      { x: 1, y: 5 }, // index 1, will be min
      { x: 2, y: 10 }, // index 2
      { x: 3, y: 20 }, // index 3, will be max
    ]);
    expect(r?.min.index).toBe(1);
    expect(r?.max.index).toBe(3);
  });

  it('handles single finite sample', () => {
    const r = findLineMinMaxExtrema([{ x: 0, y: 42 }]);
    expect(r?.min.index).toBe(0);
    expect(r?.max.index).toBe(0);
    expect(r?.min.y).toBe(42);
    expect(r?.max.y).toBe(42);
  });
});

describe('buildLineMinMaxMarkerPath', () => {
  it('returns empty for non-finite or non-positive r', () => {
    expect(buildLineMinMaxMarkerPath('max', Number.NaN, 5, 7)).toBe('');
    expect(buildLineMinMaxMarkerPath('max', 5, Number.NaN, 7)).toBe('');
    expect(buildLineMinMaxMarkerPath('max', 5, 5, Number.NaN)).toBe('');
    expect(buildLineMinMaxMarkerPath('max', 5, 5, 0)).toBe('');
    expect(buildLineMinMaxMarkerPath('max', 5, 5, -1)).toBe('');
  });

  it('builds a closed triangle for max with apex above center', () => {
    const d = buildLineMinMaxMarkerPath('max', 100, 50, 8);
    expect(d).toMatch(/^M /);
    expect(d).toMatch(/Z$/);
    // First Y after M should be smaller than cy (=50): apex is above.
    const firstY = Number(d.split(' ')[2]);
    expect(firstY).toBeLessThan(50);
  });

  it('builds a closed triangle for min with apex below center', () => {
    const d = buildLineMinMaxMarkerPath('min', 100, 50, 8);
    expect(d).toMatch(/^M /);
    expect(d).toMatch(/Z$/);
    const firstY = Number(d.split(' ')[2]);
    expect(firstY).toBeGreaterThan(50);
  });
});

describe('computeLineMinMaxLayout', () => {
  it('returns empty when no series', () => {
    const layout = computeLineMinMaxLayout({
      series: [],
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series).toEqual([]);
  });

  it('returns empty when canvas degenerate', () => {
    const layout = computeLineMinMaxLayout({
      series: [seriesA],
      width: 20,
      height: 20,
      padding: 30,
    });
    expect(layout.series).toEqual([]);
  });

  it('returns empty when all series hidden', () => {
    const layout = computeLineMinMaxLayout({
      series: [seriesA, seriesB],
      hiddenSeries: new Set(['a', 'b']),
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series).toEqual([]);
    expect(layout.visibleSeriesCount).toBe(0);
  });

  it('builds layout series with min/max markers', () => {
    const layout = computeLineMinMaxLayout({
      series: [seriesA],
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series).toHaveLength(1);
    const s = layout.series[0]!;
    expect(s.minMarker).not.toBeNull();
    expect(s.maxMarker).not.toBeNull();
    expect(s.minMarker?.y).toBe(5);
    expect(s.maxMarker?.y).toBe(50);
    expect(s.minMarker?.kind).toBe('min');
    expect(s.maxMarker?.kind).toBe('max');
    expect(s.minMarker?.iconPath).toMatch(/^M /);
    expect(s.maxMarker?.iconPath).toMatch(/^M /);
  });

  it('omits min marker when showMin=false', () => {
    const layout = computeLineMinMaxLayout({
      series: [seriesA],
      showMin: false,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series[0]?.minMarker).toBeNull();
    expect(layout.series[0]?.maxMarker).not.toBeNull();
  });

  it('omits max marker when showMax=false', () => {
    const layout = computeLineMinMaxLayout({
      series: [seriesA],
      showMax: false,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series[0]?.maxMarker).toBeNull();
    expect(layout.series[0]?.minMarker).not.toBeNull();
  });

  it('flags points isMin / isMax for the canonical extremes', () => {
    const layout = computeLineMinMaxLayout({
      series: [seriesA],
      width: 400,
      height: 300,
      padding: 30,
    });
    const pts = layout.series[0]!.points;
    expect(pts.find((p) => p.index === 2)?.isMin).toBe(true);
    expect(pts.find((p) => p.index === 4)?.isMax).toBe(true);
  });

  it('honours per-series minColor and maxColor overrides', () => {
    const custom: ChartLineMinMaxSeries = {
      ...seriesA,
      minColor: '#123456',
      maxColor: '#abcdef',
    };
    const layout = computeLineMinMaxLayout({
      series: [custom],
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series[0]?.minColor).toBe('#123456');
    expect(layout.series[0]?.maxColor).toBe('#abcdef');
    expect(layout.series[0]?.minMarker?.color).toBe('#123456');
    expect(layout.series[0]?.maxMarker?.color).toBe('#abcdef');
  });

  it('honours hidden series filter', () => {
    const layout = computeLineMinMaxLayout({
      series: [seriesA, seriesB],
      hiddenSeries: new Set(['a']),
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series).toHaveLength(1);
    expect(layout.series[0]?.id).toBe('b');
    expect(layout.series[0]?.index).toBe(1);
  });

  it('respects user-supplied bounds overrides', () => {
    const layout = computeLineMinMaxLayout({
      series: [seriesA],
      width: 400,
      height: 300,
      padding: 30,
      xMin: -10,
      xMax: 20,
      yMin: -50,
      yMax: 100,
    });
    expect(layout.xMin).toBe(-10);
    expect(layout.xMax).toBe(20);
    expect(layout.yMin).toBe(-50);
    expect(layout.yMax).toBe(100);
  });

  it('produces axis ticks at the requested step count', () => {
    const layout = computeLineMinMaxLayout({
      series: [seriesA],
      width: 400,
      height: 300,
      padding: 30,
      tickCount: 6,
    });
    expect(layout.xTicks).toHaveLength(6);
    expect(layout.yTicks).toHaveLength(6);
  });

  it('drop-line endpoints land on the x-axis', () => {
    const layout = computeLineMinMaxLayout({
      series: [seriesA],
      width: 400,
      height: 300,
      padding: 30,
    });
    const expectedAxisY = 30 + (300 - 60); // padding + innerHeight
    expect(layout.series[0]?.minMarker?.dropY2).toBe(expectedAxisY);
    expect(layout.series[0]?.maxMarker?.dropY2).toBe(expectedAxisY);
  });

  it('returns null markers when series has no finite samples', () => {
    const layout = computeLineMinMaxLayout({
      series: [
        seriesA,
        { id: 'empty', label: 'empty', data: [] as readonly { x: number; y: number }[] },
      ],
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series[1]?.minMarker).toBeNull();
    expect(layout.series[1]?.maxMarker).toBeNull();
  });
});

describe('describeLineMinMaxChart', () => {
  it('returns "No data" when no series', () => {
    expect(describeLineMinMaxChart(null)).toBe('No data');
    expect(describeLineMinMaxChart([])).toBe('No data');
  });

  it('returns "No data" when all hidden', () => {
    expect(
      describeLineMinMaxChart([seriesA], new Set(['a'])),
    ).toBe('No data');
  });

  it('returns "No data" when no finite samples', () => {
    expect(
      describeLineMinMaxChart([
        { id: 'x', label: 'X', data: [{ x: Number.NaN, y: 1 }] },
      ]),
    ).toBe('No data');
  });

  it('summarises min and max per series', () => {
    const text = describeLineMinMaxChart([seriesA, seriesB]);
    expect(text).toContain('2 series');
    expect(text).toContain('A: min 5 at x=2');
    expect(text).toContain('max 50 at x=4');
    expect(text).toContain('B: min 80');
    expect(text).toContain('max 200');
  });

  it('uses formatValue formatter', () => {
    const text = describeLineMinMaxChart(
      [seriesA],
      undefined,
      (n) => `${n}u`,
    );
    expect(text).toContain('50u');
  });
});

describe('<ChartLineMinMax /> rendering', () => {
  it('renders nothing meaningful when empty series', () => {
    const { container } = render(<ChartLineMinMax series={[]} />);
    const root = container.querySelector(
      '[data-section="chart-line-min-max"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-series-count')).toBe('0');
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-min-max-marker"]',
      ),
    ).toHaveLength(0);
  });

  it('renders one line path per series', () => {
    const { container } = render(
      <ChartLineMinMax series={[seriesA, seriesB]} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-min-max-path"]'),
    ).toHaveLength(2);
  });

  it('renders one min marker and one max marker per series', () => {
    const { container } = render(<ChartLineMinMax series={[seriesA]} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-min-max-marker"]',
    );
    expect(markers).toHaveLength(2);
    const kinds = Array.from(markers).map((m) =>
      m.getAttribute('data-extremum-kind'),
    );
    expect(kinds).toContain('min');
    expect(kinds).toContain('max');
  });

  it('omits min marker when showMin=false', () => {
    const { container } = render(
      <ChartLineMinMax series={[seriesA]} showMin={false} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-min-max-marker"]',
    );
    expect(markers).toHaveLength(1);
    expect(markers[0]?.getAttribute('data-extremum-kind')).toBe('max');
  });

  it('omits max marker when showMax=false', () => {
    const { container } = render(
      <ChartLineMinMax series={[seriesA]} showMax={false} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-min-max-marker"]',
    );
    expect(markers).toHaveLength(1);
    expect(markers[0]?.getAttribute('data-extremum-kind')).toBe('min');
  });

  it('renders horizontal reference lines by default', () => {
    const { container } = render(<ChartLineMinMax series={[seriesA]} />);
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-min-max-ref-line"]',
      ),
    ).toHaveLength(2);
  });

  it('omits reference lines when showRefLines=false', () => {
    const { container } = render(
      <ChartLineMinMax series={[seriesA]} showRefLines={false} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-min-max-ref-line"]',
      ),
    ).toHaveLength(0);
  });

  it('renders drop lines when showDropLines=true', () => {
    const { container } = render(
      <ChartLineMinMax series={[seriesA]} showDropLines={true} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-min-max-drop-line"]',
      ),
    ).toHaveLength(2);
  });

  it('omits drop lines by default', () => {
    const { container } = render(<ChartLineMinMax series={[seriesA]} />);
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-min-max-drop-line"]',
      ),
    ).toHaveLength(0);
  });

  it('renders marker labels by default', () => {
    const { container } = render(<ChartLineMinMax series={[seriesA]} />);
    const labels = container.querySelectorAll(
      '[data-section="chart-line-min-max-marker-label"]',
    );
    expect(labels).toHaveLength(2);
    expect(labels[0]?.textContent).toMatch(/^min |^max /);
  });

  it('omits marker labels when showMarkerLabels=false', () => {
    const { container } = render(
      <ChartLineMinMax series={[seriesA]} showMarkerLabels={false} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-min-max-marker-label"]',
      ),
    ).toHaveLength(0);
  });

  it('marks the canonical min and max dots with data-is-min / data-is-max', () => {
    const { container } = render(<ChartLineMinMax series={[seriesA]} />);
    const minDot = container.querySelector(
      '[data-section="chart-line-min-max-dot"][data-point-index="2"]',
    );
    expect(minDot?.getAttribute('data-is-min')).toBe('true');
    const maxDot = container.querySelector(
      '[data-section="chart-line-min-max-dot"][data-point-index="4"]',
    );
    expect(maxDot?.getAttribute('data-is-max')).toBe('true');
  });

  it('renders dots per finite point', () => {
    const { container } = render(<ChartLineMinMax series={[seriesA]} />);
    expect(
      container.querySelectorAll('[data-section="chart-line-min-max-dot"]'),
    ).toHaveLength(6);
  });

  it('hides dots when showDots=false', () => {
    const { container } = render(
      <ChartLineMinMax series={[seriesA]} showDots={false} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-min-max-dot"]'),
    ).toHaveLength(0);
  });

  it('renders aria description and labels region', () => {
    render(<ChartLineMinMax series={[seriesA]} />);
    expect(
      screen.getByRole('region', {
        name: /line chart with min\/max markers/i,
      }),
    ).toBeTruthy();
  });

  it('shows marker tooltip on marker hover', () => {
    const { container } = render(<ChartLineMinMax series={[seriesA]} />);
    const maxMarker = container.querySelector(
      '[data-section="chart-line-min-max-marker"][data-extremum-kind="max"]',
    ) as SVGPathElement;
    fireEvent.mouseEnter(maxMarker);
    const tip = container.querySelector(
      '[data-section="chart-line-min-max-tooltip"]',
    );
    expect(tip).not.toBeNull();
    expect(
      tip?.querySelector(
        '[data-section="chart-line-min-max-tooltip-kind"]',
      )?.textContent,
    ).toMatch(/Max: 50/);
  });

  it('shows point tooltip on dot hover', () => {
    const { container } = render(<ChartLineMinMax series={[seriesA]} />);
    const dot = container.querySelector(
      '[data-section="chart-line-min-max-dot"][data-point-index="1"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    const tip = container.querySelector(
      '[data-section="chart-line-min-max-point-tooltip"]',
    );
    expect(tip).not.toBeNull();
  });

  it('shows the min/max tag in the point tooltip when the dot is an extremum', () => {
    const { container } = render(<ChartLineMinMax series={[seriesA]} />);
    const maxDot = container.querySelector(
      '[data-section="chart-line-min-max-dot"][data-point-index="4"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(maxDot);
    expect(
      container.querySelector(
        '[data-section="chart-line-min-max-point-tooltip-tag"]',
      )?.textContent,
    ).toMatch(/max/);
  });

  it('hides tooltip on mouseLeave', () => {
    const { container } = render(<ChartLineMinMax series={[seriesA]} />);
    const marker = container.querySelector(
      '[data-section="chart-line-min-max-marker"][data-extremum-kind="min"]',
    ) as SVGPathElement;
    fireEvent.mouseEnter(marker);
    expect(
      container.querySelector('[data-section="chart-line-min-max-tooltip"]'),
    ).not.toBeNull();
    fireEvent.mouseLeave(marker);
    expect(
      container.querySelector('[data-section="chart-line-min-max-tooltip"]'),
    ).toBeNull();
  });

  it('omits tooltips when showTooltip=false', () => {
    const { container } = render(
      <ChartLineMinMax series={[seriesA]} showTooltip={false} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-min-max-marker"][data-extremum-kind="max"]',
    ) as SVGPathElement;
    fireEvent.mouseEnter(marker);
    expect(
      container.querySelector('[data-section="chart-line-min-max-tooltip"]'),
    ).toBeNull();
  });

  it('invokes onMarkerClick when a marker is clicked', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ChartLineMinMax series={[seriesA]} onMarkerClick={onClick} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-min-max-marker"][data-extremum-kind="max"]',
    ) as SVGPathElement;
    fireEvent.click(marker);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0]?.[0].marker.kind).toBe('max');
    expect(onClick.mock.calls[0]?.[0].marker.y).toBe(50);
  });

  it('invokes onPointClick when a dot is clicked', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ChartLineMinMax series={[seriesA]} onPointClick={onClick} />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-min-max-dot"][data-point-index="2"]',
    ) as SVGCircleElement;
    fireEvent.click(dot);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0]?.[0].point.index).toBe(2);
  });

  it('legend shows the (min .. max) range per series', () => {
    const { container } = render(<ChartLineMinMax series={[seriesA]} />);
    const stats = container.querySelector(
      '[data-section="chart-line-min-max-legend-stats"]',
    );
    expect(stats?.textContent).toMatch(/5/);
    expect(stats?.textContent).toMatch(/50/);
  });

  it('toggles series via the legend (uncontrolled)', () => {
    const { container } = render(
      <ChartLineMinMax series={[seriesA, seriesB]} />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-min-max-legend-button"][data-series-id="a"]',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(
      container.querySelectorAll('[data-section="chart-line-min-max-path"]'),
    ).toHaveLength(1);
  });

  it('respects controlled hiddenSeries prop', () => {
    const { container } = render(
      <ChartLineMinMax
        series={[seriesA, seriesB]}
        hiddenSeries={new Set(['b'])}
      />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-min-max-path"]'),
    ).toHaveLength(1);
  });

  it('emits onHiddenSeriesChange on legend toggle', () => {
    const onChange = vi.fn();
    const { container } = render(
      <ChartLineMinMax
        series={[seriesA]}
        onHiddenSeriesChange={onChange}
      />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-min-max-legend-button"][data-series-id="a"]',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0].has('a')).toBe(true);
  });

  it('omits legend entirely when showLegend=false', () => {
    const { container } = render(
      <ChartLineMinMax series={[seriesA]} showLegend={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-min-max-legend"]'),
    ).toBeNull();
  });

  it('animate flag toggles data-animate and fade-in class', () => {
    const { container } = render(<ChartLineMinMax series={[seriesA]} />);
    const root = container.querySelector(
      '[data-section="chart-line-min-max"]',
    ) as HTMLDivElement;
    expect(root.getAttribute('data-animate')).toBe('true');
    expect(root.className).toContain('motion-safe:animate-fade-in');
    const { container: c2 } = render(
      <ChartLineMinMax series={[seriesA]} animate={false} />,
    );
    const r2 = c2.querySelector(
      '[data-section="chart-line-min-max"]',
    ) as HTMLDivElement;
    expect(r2.getAttribute('data-animate')).toBe('false');
    expect(r2.className).not.toContain('motion-safe:animate-fade-in');
  });

  it('exposes data-show-min / data-show-max on root', () => {
    const { container } = render(
      <ChartLineMinMax series={[seriesA]} showMin={false} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-min-max"]',
    ) as HTMLDivElement;
    expect(root.getAttribute('data-show-min')).toBe('false');
    expect(root.getAttribute('data-show-max')).toBe('true');
  });

  it('forwards ref to root div', () => {
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineMinMax ref={ref} series={[seriesA]} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-min-max',
    );
  });

  it('renders a stable displayName for devtools', () => {
    expect(ChartLineMinMax.displayName).toBe('ChartLineMinMax');
  });
});
