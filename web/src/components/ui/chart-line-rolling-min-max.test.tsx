import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  ALL_CHART_LINE_ROLLING_MIN_MAX_MODES,
  ChartLineRollingMinMax,
  DEFAULT_CHART_LINE_ROLLING_MIN_MAX_HEIGHT,
  DEFAULT_CHART_LINE_ROLLING_MIN_MAX_MODE,
  DEFAULT_CHART_LINE_ROLLING_MIN_MAX_PADDING,
  DEFAULT_CHART_LINE_ROLLING_MIN_MAX_PALETTE,
  DEFAULT_CHART_LINE_ROLLING_MIN_MAX_TICK_COUNT,
  DEFAULT_CHART_LINE_ROLLING_MIN_MAX_WIDTH,
  DEFAULT_CHART_LINE_ROLLING_MIN_MAX_WINDOW,
  buildLineRollingMinMaxBandPaths,
  buildLineRollingMinMaxEnvelopePath,
  computeLineRollingMinMaxLayout,
  computeRollingMinMax,
  describeLineRollingMinMaxChart,
  getLineRollingMinMaxDefaultColor,
  getLineRollingMinMaxFinitePoints,
  normaliseLineRollingMinMaxWindow,
  type ChartLineRollingMinMaxPoint,
  type ChartLineRollingMinMaxSeries,
} from './chart-line-rolling-min-max';

const series: ChartLineRollingMinMaxSeries = {
  id: 'a',
  label: 'Series',
  data: [
    { x: 0, y: 10 },
    { x: 1, y: 30 },
    { x: 2, y: 20 },
    { x: 3, y: 40 },
    { x: 4, y: 25 },
    { x: 5, y: 15 },
  ],
};

describe('DEFAULT_CHART_LINE_ROLLING_MIN_MAX_* defaults', () => {
  it('has positive width, height, padding, tick count, window', () => {
    expect(DEFAULT_CHART_LINE_ROLLING_MIN_MAX_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_ROLLING_MIN_MAX_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_ROLLING_MIN_MAX_PADDING).toBeGreaterThanOrEqual(
      0,
    );
    expect(
      DEFAULT_CHART_LINE_ROLLING_MIN_MAX_TICK_COUNT,
    ).toBeGreaterThanOrEqual(2);
    expect(
      DEFAULT_CHART_LINE_ROLLING_MIN_MAX_WINDOW,
    ).toBeGreaterThanOrEqual(1);
  });

  it('default mode is "trailing"', () => {
    expect(DEFAULT_CHART_LINE_ROLLING_MIN_MAX_MODE).toBe('trailing');
  });

  it('exposes three mode keys', () => {
    expect(ALL_CHART_LINE_ROLLING_MIN_MAX_MODES).toEqual([
      'trailing',
      'centered',
      'edge',
    ]);
  });

  it('exposes a 10-color palette', () => {
    expect(DEFAULT_CHART_LINE_ROLLING_MIN_MAX_PALETTE).toHaveLength(10);
  });
});

describe('getLineRollingMinMaxDefaultColor', () => {
  it('cycles through the palette', () => {
    expect(getLineRollingMinMaxDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_ROLLING_MIN_MAX_PALETTE[0],
    );
    expect(getLineRollingMinMaxDefaultColor(11)).toBe(
      DEFAULT_CHART_LINE_ROLLING_MIN_MAX_PALETTE[1],
    );
  });

  it('falls back to first color on invalid index', () => {
    expect(getLineRollingMinMaxDefaultColor(-1)).toBe(
      DEFAULT_CHART_LINE_ROLLING_MIN_MAX_PALETTE[0],
    );
    expect(getLineRollingMinMaxDefaultColor(Number.NaN)).toBe(
      DEFAULT_CHART_LINE_ROLLING_MIN_MAX_PALETTE[0],
    );
  });
});

describe('getLineRollingMinMaxFinitePoints', () => {
  it('drops non-finite samples', () => {
    expect(
      getLineRollingMinMaxFinitePoints([
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
      getLineRollingMinMaxFinitePoints(
        null as unknown as ReadonlyArray<ChartLineRollingMinMaxPoint>,
      ),
    ).toEqual([]);
  });
});

describe('normaliseLineRollingMinMaxWindow', () => {
  it('floors fractional input', () => {
    expect(normaliseLineRollingMinMaxWindow(3.9)).toBe(3);
  });

  it('returns 1 for non-finite, <1, non-numeric', () => {
    expect(normaliseLineRollingMinMaxWindow(0)).toBe(1);
    expect(normaliseLineRollingMinMaxWindow(-5)).toBe(1);
    expect(normaliseLineRollingMinMaxWindow(Number.NaN)).toBe(1);
    expect(normaliseLineRollingMinMaxWindow('3' as unknown as number)).toBe(
      1,
    );
  });
});

describe('computeRollingMinMax (trailing)', () => {
  it('returns nulls for leading window-1 entries', () => {
    const r = computeRollingMinMax([1, 2, 3, 4, 5], 3);
    expect(r[0]).toEqual({ min: null, max: null });
    expect(r[1]).toEqual({ min: null, max: null });
    expect(r[2]).toEqual({ min: 1, max: 3 });
    expect(r[3]).toEqual({ min: 2, max: 4 });
    expect(r[4]).toEqual({ min: 3, max: 5 });
  });

  it('window=1 is passthrough', () => {
    const r = computeRollingMinMax([10, 20, 30], 1);
    expect(r).toEqual([
      { min: 10, max: 10 },
      { min: 20, max: 20 },
      { min: 30, max: 30 },
    ]);
  });

  it('window larger than length produces all nulls', () => {
    const r = computeRollingMinMax([1, 2, 3], 10);
    expect(r.every((e) => e.min === null && e.max === null)).toBe(true);
  });

  it('drops non-finite samples within window', () => {
    const r = computeRollingMinMax([1, Number.NaN, 3, 4], 3);
    // i=0,1 null (window not filled).
    // i=2: window [1, NaN, 3] -> min 1, max 3.
    // i=3: window [NaN, 3, 4] -> min 3, max 4.
    expect(r[2]).toEqual({ min: 1, max: 3 });
    expect(r[3]).toEqual({ min: 3, max: 4 });
  });

  it('returns null when entire window is non-finite', () => {
    const r = computeRollingMinMax(
      [Number.NaN, Number.NaN, Number.NaN],
      3,
    );
    expect(r[2]).toEqual({ min: null, max: null });
  });

  it('returns [] for non-array / empty', () => {
    expect(
      computeRollingMinMax(
        null as unknown as readonly number[],
        3,
      ),
    ).toEqual([]);
    expect(computeRollingMinMax([], 3)).toEqual([]);
  });

  it('normalises invalid window to 1', () => {
    expect(computeRollingMinMax([1, 2, 3], 0)).toEqual([
      { min: 1, max: 1 },
      { min: 2, max: 2 },
      { min: 3, max: 3 },
    ]);
  });
});

describe('computeRollingMinMax (centered)', () => {
  it('centers the window at the index', () => {
    const r = computeRollingMinMax([10, 20, 30, 40, 50], 3, 'centered');
    expect(r[0]).toEqual({ min: null, max: null });
    expect(r[1]).toEqual({ min: 10, max: 30 });
    expect(r[2]).toEqual({ min: 20, max: 40 });
    expect(r[3]).toEqual({ min: 30, max: 50 });
    expect(r[4]).toEqual({ min: null, max: null });
  });
});

describe('computeRollingMinMax (edge)', () => {
  it('uses partial-window at the leading edge', () => {
    const r = computeRollingMinMax([10, 20, 30, 40], 3, 'edge');
    expect(r[0]).toEqual({ min: 10, max: 10 });
    expect(r[1]).toEqual({ min: 10, max: 20 });
    expect(r[2]).toEqual({ min: 10, max: 30 });
    expect(r[3]).toEqual({ min: 20, max: 40 });
  });
});

describe('buildLineRollingMinMaxBandPaths', () => {
  it('returns [] for empty input', () => {
    expect(buildLineRollingMinMaxBandPaths([])).toEqual([]);
  });

  it('builds one closed polygon per contiguous run', () => {
    const paths = buildLineRollingMinMaxBandPaths([
      { px: 0, pyMin: 30, pyMax: 10 },
      { px: 10, pyMin: 30, pyMax: 10 },
      { px: 20, pyMin: null, pyMax: 10 },
      { px: 30, pyMin: 30, pyMax: 10 },
      { px: 40, pyMin: 30, pyMax: 10 },
    ]);
    expect(paths.length).toBe(2);
    for (const d of paths) {
      expect(d).toMatch(/^M /);
      expect(d).toMatch(/Z$/);
    }
  });

  it('omits single-entry runs (degenerate area)', () => {
    const paths = buildLineRollingMinMaxBandPaths([
      { px: 0, pyMin: 30, pyMax: 10 },
      { px: 10, pyMin: null, pyMax: null },
      { px: 20, pyMin: 30, pyMax: 10 },
      { px: 30, pyMin: 30, pyMax: 10 },
    ]);
    expect(paths.length).toBe(1);
  });
});

describe('buildLineRollingMinMaxEnvelopePath', () => {
  it('returns empty for empty', () => {
    expect(buildLineRollingMinMaxEnvelopePath([])).toBe('');
  });

  it('builds M ... L ... for a single run', () => {
    const d = buildLineRollingMinMaxEnvelopePath([
      { px: 0, py: 1 },
      { px: 10, py: 2 },
      { px: 20, py: 3 },
    ]);
    expect(d.split('L').length - 1).toBe(2);
  });

  it('breaks into runs at null', () => {
    const d = buildLineRollingMinMaxEnvelopePath([
      { px: 0, py: 1 },
      { px: 10, py: null },
      { px: 20, py: 3 },
    ]);
    expect(d.split('M').length - 1).toBe(2);
  });
});

describe('computeLineRollingMinMaxLayout', () => {
  it('returns empty when no series', () => {
    const layout = computeLineRollingMinMaxLayout({
      series: [],
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series).toEqual([]);
  });

  it('returns empty when canvas degenerate', () => {
    const layout = computeLineRollingMinMaxLayout({
      series: [series],
      width: 20,
      height: 20,
      padding: 30,
    });
    expect(layout.series).toEqual([]);
  });

  it('builds layout with raw path + min/max envelopes + band paths', () => {
    const layout = computeLineRollingMinMaxLayout({
      series: [series],
      window: 3,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series).toHaveLength(1);
    const s = layout.series[0]!;
    expect(s.path).toMatch(/^M /);
    expect(s.minPath).toMatch(/^M /);
    expect(s.maxPath).toMatch(/^M /);
    expect(s.bandPaths.length).toBeGreaterThan(0);
    expect(s.bandPaths[0]).toMatch(/Z$/);
  });

  it('expands y bounds to include rolling min/max', () => {
    const layout = computeLineRollingMinMaxLayout({
      series: [series],
      window: 3,
      width: 400,
      height: 300,
      padding: 30,
    });
    // raw y range is 10..40; the envelope shouldn't push outside that
    // when window <= length, so this just sanity checks bounds inclusion.
    expect(layout.yMin).toBeLessThanOrEqual(10);
    expect(layout.yMax).toBeGreaterThanOrEqual(40);
  });

  it('honors per-series window override', () => {
    const layout = computeLineRollingMinMaxLayout({
      series: [{ ...series, window: 2 }],
      window: 5,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series[0]?.window).toBe(2);
  });

  it('honors per-series mode override', () => {
    const layout = computeLineRollingMinMaxLayout({
      series: [{ ...series, mode: 'edge' }],
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series[0]?.mode).toBe('edge');
    // edge mode validates every index.
    expect(layout.series[0]?.validCount).toBe(series.data.length);
  });

  it('omits band paths when showBand=false', () => {
    const layout = computeLineRollingMinMaxLayout({
      series: [series],
      showBand: false,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series[0]?.bandPaths).toEqual([]);
  });

  it('honors hidden series filter', () => {
    const layout = computeLineRollingMinMaxLayout({
      series: [
        series,
        { id: 'b', label: 'B', data: [{ x: 0, y: 5 }, { x: 1, y: 10 }] },
      ],
      hiddenSeries: new Set(['a']),
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series).toHaveLength(1);
    expect(layout.series[0]?.id).toBe('b');
  });

  it('respects user-supplied bounds overrides', () => {
    const layout = computeLineRollingMinMaxLayout({
      series: [series],
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
    const layout = computeLineRollingMinMaxLayout({
      series: [series],
      tickCount: 6,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.xTicks).toHaveLength(6);
    expect(layout.yTicks).toHaveLength(6);
  });

  it('per-point min/max are populated for valid window indices', () => {
    const layout = computeLineRollingMinMaxLayout({
      series: [series],
      window: 3,
      width: 400,
      height: 300,
      padding: 30,
    });
    const pts = layout.series[0]!.points;
    expect(pts[0]?.min).toBeNull();
    expect(pts[1]?.min).toBeNull();
    expect(pts[2]?.min).toBe(10);
    expect(pts[2]?.max).toBe(30);
    expect(pts[5]?.min).toBe(15);
    expect(pts[5]?.max).toBe(40);
  });
});

describe('describeLineRollingMinMaxChart', () => {
  it('returns "No data" for empty / hidden / no finite', () => {
    expect(describeLineRollingMinMaxChart(null)).toBe('No data');
    expect(describeLineRollingMinMaxChart([])).toBe('No data');
    expect(
      describeLineRollingMinMaxChart(
        [series],
        5,
        'trailing',
        new Set(['a']),
      ),
    ).toBe('No data');
  });

  it('summarises window + mode per series', () => {
    const text = describeLineRollingMinMaxChart([series], 4, 'centered');
    expect(text).toContain('1 series');
    expect(text).toContain('window 4');
    expect(text).toContain('mode centered');
  });
});

describe('<ChartLineRollingMinMax /> rendering', () => {
  it('renders nothing meaningful when empty series', () => {
    const { container } = render(<ChartLineRollingMinMax series={[]} />);
    const root = container.querySelector(
      '[data-section="chart-line-rolling-min-max"]',
    );
    expect(root).not.toBeNull();
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-rolling-min-max-path"]',
      ),
    ).toHaveLength(0);
  });

  it('renders raw line + min envelope + max envelope + at least one band', () => {
    const { container } = render(
      <ChartLineRollingMinMax series={[series]} window={3} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-rolling-min-max-path"]',
      ),
    ).toHaveLength(1);
    const env = container.querySelectorAll(
      '[data-section="chart-line-rolling-min-max-envelope"]',
    );
    const kinds = Array.from(env).map((e) =>
      e.getAttribute('data-envelope-kind'),
    );
    expect(kinds).toContain('min');
    expect(kinds).toContain('max');
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-rolling-min-max-band"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('omits the raw line when showLine=false', () => {
    const { container } = render(
      <ChartLineRollingMinMax series={[series]} showLine={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-rolling-min-max-path"]',
      ),
    ).toBeNull();
  });

  it('omits the envelopes when showEnvelope=false', () => {
    const { container } = render(
      <ChartLineRollingMinMax series={[series]} showEnvelope={false} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-rolling-min-max-envelope"]',
      ),
    ).toHaveLength(0);
  });

  it('omits the band when showBand=false', () => {
    const { container } = render(
      <ChartLineRollingMinMax series={[series]} showBand={false} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-rolling-min-max-band"]',
      ),
    ).toHaveLength(0);
  });

  it('renders dots per finite point with rolling min/max data attrs', () => {
    const { container } = render(
      <ChartLineRollingMinMax series={[series]} window={3} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-rolling-min-max-dot"]',
      ),
    ).toHaveLength(6);
    const earlyDot = container.querySelector(
      '[data-section="chart-line-rolling-min-max-dot"][data-point-index="0"]',
    );
    expect(earlyDot?.getAttribute('data-rolling-min')).toBe('');
    expect(earlyDot?.getAttribute('data-rolling-max')).toBe('');
    const midDot = container.querySelector(
      '[data-section="chart-line-rolling-min-max-dot"][data-point-index="2"]',
    );
    expect(midDot?.getAttribute('data-rolling-min')).toBe('10');
    expect(midDot?.getAttribute('data-rolling-max')).toBe('30');
  });

  it('hides dots when showDots=false', () => {
    const { container } = render(
      <ChartLineRollingMinMax series={[series]} showDots={false} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-rolling-min-max-dot"]',
      ),
    ).toHaveLength(0);
  });

  it('renders aria description and labels region', () => {
    render(<ChartLineRollingMinMax series={[series]} />);
    expect(
      screen.getByRole('region', {
        name: /rolling min\/max envelope chart/i,
      }),
    ).toBeTruthy();
  });

  it('shows tooltip on dot hover with rolling min / max rows', () => {
    const { container } = render(
      <ChartLineRollingMinMax series={[series]} window={3} />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-rolling-min-max-dot"][data-point-index="3"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    const tip = container.querySelector(
      '[data-section="chart-line-rolling-min-max-tooltip"]',
    );
    expect(tip).not.toBeNull();
    expect(
      tip?.querySelector(
        '[data-section="chart-line-rolling-min-max-tooltip-max"]',
      )?.textContent,
    ).toMatch(/rolling max \(3\)/);
    expect(
      tip?.querySelector(
        '[data-section="chart-line-rolling-min-max-tooltip-min"]',
      )?.textContent,
    ).toMatch(/rolling min \(3\)/);
  });

  it('tooltip shows n/a when rolling values are unavailable', () => {
    const { container } = render(
      <ChartLineRollingMinMax series={[series]} window={3} />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-rolling-min-max-dot"][data-point-index="0"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    expect(
      container.querySelector(
        '[data-section="chart-line-rolling-min-max-tooltip-min"]',
      )?.textContent,
    ).toMatch(/n\/a/);
  });

  it('hides tooltip on mouseLeave', () => {
    const { container } = render(<ChartLineRollingMinMax series={[series]} />);
    const dot = container.querySelector(
      '[data-section="chart-line-rolling-min-max-dot"][data-point-index="0"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    expect(
      container.querySelector(
        '[data-section="chart-line-rolling-min-max-tooltip"]',
      ),
    ).not.toBeNull();
    fireEvent.mouseLeave(dot);
    expect(
      container.querySelector(
        '[data-section="chart-line-rolling-min-max-tooltip"]',
      ),
    ).toBeNull();
  });

  it('omits tooltip when showTooltip=false', () => {
    const { container } = render(
      <ChartLineRollingMinMax series={[series]} showTooltip={false} />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-rolling-min-max-dot"][data-point-index="0"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    expect(
      container.querySelector(
        '[data-section="chart-line-rolling-min-max-tooltip"]',
      ),
    ).toBeNull();
  });

  it('invokes onPointClick with series + point', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ChartLineRollingMinMax
        series={[series]}
        onPointClick={onClick}
      />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-rolling-min-max-dot"][data-point-index="3"]',
    ) as SVGCircleElement;
    fireEvent.click(dot);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0]?.[0].point.y).toBe(40);
  });

  it('legend shows the window per series', () => {
    const { container } = render(
      <ChartLineRollingMinMax series={[series]} window={4} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-rolling-min-max-legend-stats"]',
      )?.textContent,
    ).toMatch(/window 4/);
  });

  it('toggles series via the legend (uncontrolled)', () => {
    const { container } = render(
      <ChartLineRollingMinMax
        series={[
          series,
          { id: 'b', label: 'B', data: [{ x: 0, y: 5 }] },
        ]}
      />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-rolling-min-max-legend-button"][data-series-id="a"]',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-rolling-min-max-path"]',
      ),
    ).toHaveLength(1);
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLineRollingMinMax
        series={[
          series,
          { id: 'b', label: 'B', data: [{ x: 0, y: 5 }] },
        ]}
        hiddenSeries={new Set(['b'])}
      />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-rolling-min-max-path"]',
      ),
    ).toHaveLength(1);
  });

  it('emits onHiddenSeriesChange on legend toggle', () => {
    const onChange = vi.fn();
    const { container } = render(
      <ChartLineRollingMinMax
        series={[series]}
        onHiddenSeriesChange={onChange}
      />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-rolling-min-max-legend-button"][data-series-id="a"]',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0].has('a')).toBe(true);
  });

  it('omits legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineRollingMinMax series={[series]} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-rolling-min-max-legend"]',
      ),
    ).toBeNull();
  });

  it('exposes data-window + data-mode on root', () => {
    const { container } = render(
      <ChartLineRollingMinMax
        series={[series]}
        window={7}
        mode="centered"
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-rolling-min-max"]',
    ) as HTMLDivElement;
    expect(root.getAttribute('data-window')).toBe('7');
    expect(root.getAttribute('data-mode')).toBe('centered');
  });

  it('animate flag toggles data-animate and fade-in class', () => {
    const { container } = render(<ChartLineRollingMinMax series={[series]} />);
    const root = container.querySelector(
      '[data-section="chart-line-rolling-min-max"]',
    ) as HTMLDivElement;
    expect(root.getAttribute('data-animate')).toBe('true');
    expect(root.className).toContain('motion-safe:animate-fade-in');
    const { container: c2 } = render(
      <ChartLineRollingMinMax series={[series]} animate={false} />,
    );
    const r2 = c2.querySelector(
      '[data-section="chart-line-rolling-min-max"]',
    ) as HTMLDivElement;
    expect(r2.getAttribute('data-animate')).toBe('false');
    expect(r2.className).not.toContain('motion-safe:animate-fade-in');
  });

  it('forwards ref to root div', () => {
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineRollingMinMax ref={ref} series={[series]} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-rolling-min-max',
    );
  });

  it('renders a stable displayName for devtools', () => {
    expect(ChartLineRollingMinMax.displayName).toBe(
      'ChartLineRollingMinMax',
    );
  });
});
