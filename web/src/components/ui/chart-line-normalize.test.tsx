import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  ALL_CHART_LINE_NORMALIZE_MODES,
  ChartLineNormalize,
  DEFAULT_CHART_LINE_NORMALIZE_HEIGHT,
  DEFAULT_CHART_LINE_NORMALIZE_INDEX_BASE,
  DEFAULT_CHART_LINE_NORMALIZE_MODE,
  DEFAULT_CHART_LINE_NORMALIZE_PADDING,
  DEFAULT_CHART_LINE_NORMALIZE_PALETTE,
  DEFAULT_CHART_LINE_NORMALIZE_TICK_COUNT,
  DEFAULT_CHART_LINE_NORMALIZE_WIDTH,
  computeLineNormalizeLayout,
  describeLineNormalizeChart,
  findLineNormalizeReference,
  getLineNormalizeDefaultColor,
  getLineNormalizeFinitePoints,
  normalizeLineNormalizeSeries,
  resolveLineNormalizeYAtX,
  type ChartLineNormalizePoint,
  type ChartLineNormalizeSeries,
} from './chart-line-normalize';

const stockA: ChartLineNormalizeSeries = {
  id: 'a',
  label: 'Stock A',
  data: [
    { x: 0, y: 50 },
    { x: 1, y: 55 },
    { x: 2, y: 60 },
    { x: 3, y: 65 },
  ],
};

const stockB: ChartLineNormalizeSeries = {
  id: 'b',
  label: 'Stock B',
  data: [
    { x: 0, y: 200 },
    { x: 1, y: 210 },
    { x: 2, y: 190 },
    { x: 3, y: 240 },
  ],
};

describe('DEFAULT_CHART_LINE_NORMALIZE_* defaults', () => {
  it('has positive width, height, padding, tick count', () => {
    expect(DEFAULT_CHART_LINE_NORMALIZE_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_NORMALIZE_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_NORMALIZE_PADDING).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_CHART_LINE_NORMALIZE_TICK_COUNT).toBeGreaterThanOrEqual(2);
  });

  it('default indexBase is 100', () => {
    expect(DEFAULT_CHART_LINE_NORMALIZE_INDEX_BASE).toBe(100);
  });

  it('default mode is "first"', () => {
    expect(DEFAULT_CHART_LINE_NORMALIZE_MODE).toBe('first');
  });

  it('exposes the three mode keys', () => {
    expect(ALL_CHART_LINE_NORMALIZE_MODES).toEqual([
      'first',
      'value',
      'min',
    ]);
  });

  it('exposes a 10-color palette', () => {
    expect(DEFAULT_CHART_LINE_NORMALIZE_PALETTE).toHaveLength(10);
  });
});

describe('getLineNormalizeDefaultColor', () => {
  it('cycles through the palette by index', () => {
    expect(getLineNormalizeDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_NORMALIZE_PALETTE[0],
    );
    expect(getLineNormalizeDefaultColor(11)).toBe(
      DEFAULT_CHART_LINE_NORMALIZE_PALETTE[1],
    );
  });

  it('falls back to first color on invalid index', () => {
    expect(getLineNormalizeDefaultColor(-1)).toBe(
      DEFAULT_CHART_LINE_NORMALIZE_PALETTE[0],
    );
    expect(getLineNormalizeDefaultColor(Number.NaN)).toBe(
      DEFAULT_CHART_LINE_NORMALIZE_PALETTE[0],
    );
  });
});

describe('getLineNormalizeFinitePoints', () => {
  it('drops non-finite samples', () => {
    expect(
      getLineNormalizeFinitePoints([
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
      getLineNormalizeFinitePoints(
        null as unknown as ReadonlyArray<ChartLineNormalizePoint>,
      ),
    ).toEqual([]);
  });
});

describe('resolveLineNormalizeYAtX', () => {
  it('returns null on empty / non-array / non-finite x', () => {
    expect(resolveLineNormalizeYAtX(null, 0)).toBeNull();
    expect(resolveLineNormalizeYAtX([], 0)).toBeNull();
    expect(resolveLineNormalizeYAtX(stockA.data, Number.NaN)).toBeNull();
  });

  it('returns endpoint y when x is outside range (clamped)', () => {
    expect(resolveLineNormalizeYAtX(stockA.data, -100)).toBe(50);
    expect(resolveLineNormalizeYAtX(stockA.data, 100)).toBe(65);
  });

  it('returns exact sample y when x matches', () => {
    expect(resolveLineNormalizeYAtX(stockA.data, 2)).toBe(60);
  });

  it('linearly interpolates between bracketing samples', () => {
    // (1, 55) -> (2, 60): at x=1.5, y=57.5.
    expect(resolveLineNormalizeYAtX(stockA.data, 1.5)).toBeCloseTo(57.5, 6);
  });
});

describe('findLineNormalizeReference', () => {
  it('returns null on empty / no-finite', () => {
    expect(findLineNormalizeReference([], 'first')).toBeNull();
    expect(
      findLineNormalizeReference([{ x: Number.NaN, y: 1 }], 'first'),
    ).toBeNull();
  });

  it('first mode returns y of first sample after x-sort', () => {
    expect(findLineNormalizeReference(stockA.data, 'first')).toBe(50);
  });

  it('min mode returns the minimum finite y', () => {
    expect(findLineNormalizeReference(stockB.data, 'min')).toBe(190);
  });

  it('value mode returns null when no referenceX supplied', () => {
    expect(findLineNormalizeReference(stockA.data, 'value')).toBeNull();
  });

  it('value mode returns interpolated y at referenceX', () => {
    expect(findLineNormalizeReference(stockA.data, 'value', 1.5)).toBeCloseTo(
      57.5,
      6,
    );
  });
});

describe('normalizeLineNormalizeSeries', () => {
  it('returns ok=false when reference is null', () => {
    const r = normalizeLineNormalizeSeries([], 'first', 100);
    expect(r.ok).toBe(false);
    expect(r.normalized).toEqual([]);
  });

  it('returns ok=false when reference is zero', () => {
    const r = normalizeLineNormalizeSeries(
      [
        { x: 0, y: 0 },
        { x: 1, y: 10 },
      ],
      'first',
      100,
    );
    expect(r.ok).toBe(false);
    expect(r.reference).toBe(0);
  });

  it('rebases first-mode to indexBase at the first sample', () => {
    const r = normalizeLineNormalizeSeries(stockA.data, 'first', 100);
    expect(r.ok).toBe(true);
    expect(r.reference).toBe(50);
    expect(r.normalized[0]?.y).toBe(100); // (50/50)*100
    expect(r.normalized[3]?.y).toBe(130); // (65/50)*100
  });

  it('rebases min-mode so the min sample lands at indexBase', () => {
    const r = normalizeLineNormalizeSeries(stockB.data, 'min', 100);
    expect(r.ok).toBe(true);
    expect(r.reference).toBe(190);
    // The min sample 190 maps to (190/190)*100 = 100.
    const minSample = r.normalized.find((p) => p.y === 100);
    expect(minSample).toBeTruthy();
  });

  it('rebases value-mode at the supplied referenceX', () => {
    const r = normalizeLineNormalizeSeries(stockA.data, 'value', 100, 2);
    expect(r.ok).toBe(true);
    expect(r.reference).toBe(60); // y at x=2
    expect(r.normalized[2]?.y).toBe(100);
  });

  it('honors a custom indexBase', () => {
    const r = normalizeLineNormalizeSeries(stockA.data, 'first', 1000);
    expect(r.normalized[0]?.y).toBe(1000);
    expect(r.normalized[3]?.y).toBe(1300);
  });

  it('drops non-finite samples before normalization', () => {
    const r = normalizeLineNormalizeSeries(
      [
        { x: 0, y: 50 },
        { x: 1, y: Number.NaN },
        { x: 2, y: 100 },
      ],
      'first',
      100,
    );
    expect(r.normalized).toHaveLength(2);
    expect(r.normalized[1]?.y).toBe(200);
  });

  it('falls back to default indexBase for non-finite indexBase', () => {
    const r = normalizeLineNormalizeSeries(
      stockA.data,
      'first',
      Number.NaN,
    );
    expect(r.normalized[0]?.y).toBe(
      DEFAULT_CHART_LINE_NORMALIZE_INDEX_BASE,
    );
  });

  it('returns ok=false for non-array input', () => {
    const r = normalizeLineNormalizeSeries(
      null as unknown as readonly ChartLineNormalizePoint[],
      'first',
      100,
    );
    expect(r.ok).toBe(false);
  });
});

describe('computeLineNormalizeLayout', () => {
  it('returns empty when no series', () => {
    const layout = computeLineNormalizeLayout({
      series: [],
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series).toEqual([]);
  });

  it('returns empty when canvas degenerate', () => {
    const layout = computeLineNormalizeLayout({
      series: [stockA],
      width: 20,
      height: 20,
      padding: 30,
    });
    expect(layout.series).toEqual([]);
  });

  it('builds layout series with normalised points + stats', () => {
    const layout = computeLineNormalizeLayout({
      series: [stockA, stockB],
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series).toHaveLength(2);
    const aFinal = layout.series[0]!.points[3]!.normalized;
    const bFinal = layout.series[1]!.points[3]!.normalized;
    expect(aFinal).toBe(130);
    expect(bFinal).toBe(120); // (240/200)*100
    // Both first points lie on indexBase = 100.
    expect(layout.series[0]!.points[0]!.normalized).toBe(100);
    expect(layout.series[1]!.points[0]!.normalized).toBe(100);
  });

  it('expands y bounds to include indexBase', () => {
    const layout = computeLineNormalizeLayout({
      series: [
        {
          id: 'x',
          label: 'X',
          data: [{ x: 0, y: 50 }, { x: 1, y: 60 }],
        },
      ],
      indexBase: 500,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.yMax).toBeGreaterThanOrEqual(500);
  });

  it('records baselineY at indexBase', () => {
    const layout = computeLineNormalizeLayout({
      series: [stockA],
      indexBase: 100,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(isFinite(layout.baselineY)).toBe(true);
  });

  it('honors hidden series filter', () => {
    const layout = computeLineNormalizeLayout({
      series: [stockA, stockB],
      hiddenSeries: new Set(['a']),
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series).toHaveLength(1);
    expect(layout.series[0]?.id).toBe('b');
  });

  it('honors per-series mode override', () => {
    const layout = computeLineNormalizeLayout({
      series: [{ ...stockA, mode: 'min' }],
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series[0]?.mode).toBe('min');
  });

  it('honors per-series referenceX override for value-mode', () => {
    const layout = computeLineNormalizeLayout({
      series: [{ ...stockA, mode: 'value', referenceX: 2 }],
      indexBase: 100,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series[0]?.reference).toBe(60);
    expect(layout.series[0]?.points[2]?.normalized).toBe(100);
  });

  it('marks referenceOk=false when reference is zero', () => {
    const layout = computeLineNormalizeLayout({
      series: [
        {
          id: 'z',
          label: 'Z',
          data: [
            { x: 0, y: 0 },
            { x: 1, y: 10 },
          ],
        },
      ],
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series[0]?.referenceOk).toBe(false);
    expect(layout.series[0]?.points).toEqual([]);
  });

  it('respects user-supplied bounds overrides', () => {
    const layout = computeLineNormalizeLayout({
      series: [stockA],
      width: 400,
      height: 300,
      padding: 30,
      yMin: 50,
      yMax: 200,
    });
    expect(layout.yMin).toBe(50);
    expect(layout.yMax).toBe(200);
  });

  it('produces axis ticks at the requested step count', () => {
    const layout = computeLineNormalizeLayout({
      series: [stockA],
      tickCount: 6,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.xTicks).toHaveLength(6);
    expect(layout.yTicks).toHaveLength(6);
  });

  it('per-point percentChange uses indexBase', () => {
    const layout = computeLineNormalizeLayout({
      series: [stockA],
      indexBase: 100,
      width: 400,
      height: 300,
      padding: 30,
    });
    const last = layout.series[0]!.points[3]!;
    expect(last.percentChange).toBeCloseTo(30, 6);
  });
});

describe('describeLineNormalizeChart', () => {
  it('returns "No data" on empty / hidden / no finite', () => {
    expect(describeLineNormalizeChart(null)).toBe('No data');
    expect(describeLineNormalizeChart([])).toBe('No data');
    expect(
      describeLineNormalizeChart(
        [stockA],
        100,
        'first',
        new Set(['a']),
      ),
    ).toBe('No data');
  });

  it('summarises final percent change per series', () => {
    const text = describeLineNormalizeChart([stockA, stockB], 100, 'first');
    expect(text).toContain('2 series');
    expect(text).toContain('index 100');
    expect(text).toContain('Stock A: final 130');
    expect(text).toContain('Stock B: final 120');
    expect(text).toContain('+30%');
    expect(text).toContain('+20%');
  });

  it('uses formatValue formatter', () => {
    const text = describeLineNormalizeChart(
      [stockA],
      100,
      'first',
      undefined,
      (n) => `${n}u`,
    );
    expect(text).toContain('100u');
  });
});

describe('<ChartLineNormalize /> rendering', () => {
  it('renders nothing meaningful when empty series', () => {
    const { container } = render(<ChartLineNormalize series={[]} />);
    const root = container.querySelector(
      '[data-section="chart-line-normalize"]',
    );
    expect(root).not.toBeNull();
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-normalize-path"]',
      ),
    ).toHaveLength(0);
  });

  it('renders one normalised path per series', () => {
    const { container } = render(
      <ChartLineNormalize series={[stockA, stockB]} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-normalize-path"]',
      ),
    ).toHaveLength(2);
  });

  it('renders dots per finite point with normalised data attrs', () => {
    const { container } = render(<ChartLineNormalize series={[stockA]} />);
    const dots = container.querySelectorAll(
      '[data-section="chart-line-normalize-dot"]',
    );
    expect(dots).toHaveLength(4);
    const firstDot = container.querySelector(
      '[data-section="chart-line-normalize-dot"][data-point-index="0"]',
    );
    expect(firstDot?.getAttribute('data-normalized')).toBe('100');
    expect(firstDot?.getAttribute('data-percent')).toBe('0');
  });

  it('renders the baseline line + label by default', () => {
    const { container } = render(<ChartLineNormalize series={[stockA]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-normalize-baseline-line"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-normalize-baseline-label"]',
      )?.textContent,
    ).toMatch(/Base: 100/);
  });

  it('omits baseline line when showBaseline=false', () => {
    const { container } = render(
      <ChartLineNormalize series={[stockA]} showBaseline={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-normalize-baseline-line"]',
      ),
    ).toBeNull();
  });

  it('omits baseline label when showBaselineLabel=false', () => {
    const { container } = render(
      <ChartLineNormalize
        series={[stockA]}
        showBaselineLabel={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-normalize-baseline-label"]',
      ),
    ).toBeNull();
  });

  it('uses custom baselineLabel', () => {
    const { container } = render(
      <ChartLineNormalize
        series={[stockA]}
        baselineLabel="Start"
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-normalize-baseline-label"]',
      )?.textContent,
    ).toMatch(/Start:/);
  });

  it('renders aria description and labels region', () => {
    render(<ChartLineNormalize series={[stockA]} />);
    expect(
      screen.getByRole('region', {
        name: /normalised line chart/i,
      }),
    ).toBeTruthy();
  });

  it('shows tooltip on dot hover with raw + normalised + percent rows', () => {
    const { container } = render(<ChartLineNormalize series={[stockA]} />);
    const dot = container.querySelector(
      '[data-section="chart-line-normalize-dot"][data-point-index="3"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    const tip = container.querySelector(
      '[data-section="chart-line-normalize-tooltip"]',
    );
    expect(tip).not.toBeNull();
    expect(
      tip?.querySelector(
        '[data-section="chart-line-normalize-tooltip-raw"]',
      )?.textContent,
    ).toMatch(/65/);
    expect(
      tip?.querySelector(
        '[data-section="chart-line-normalize-tooltip-normalized"]',
      )?.textContent,
    ).toMatch(/130/);
    expect(
      tip?.querySelector(
        '[data-section="chart-line-normalize-tooltip-percent"]',
      )?.textContent,
    ).toMatch(/\+30/);
  });

  it('hides tooltip on mouseLeave', () => {
    const { container } = render(<ChartLineNormalize series={[stockA]} />);
    const dot = container.querySelector(
      '[data-section="chart-line-normalize-dot"][data-point-index="0"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    expect(
      container.querySelector(
        '[data-section="chart-line-normalize-tooltip"]',
      ),
    ).not.toBeNull();
    fireEvent.mouseLeave(dot);
    expect(
      container.querySelector(
        '[data-section="chart-line-normalize-tooltip"]',
      ),
    ).toBeNull();
  });

  it('omits tooltip when showTooltip=false', () => {
    const { container } = render(
      <ChartLineNormalize series={[stockA]} showTooltip={false} />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-normalize-dot"][data-point-index="0"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    expect(
      container.querySelector(
        '[data-section="chart-line-normalize-tooltip"]',
      ),
    ).toBeNull();
  });

  it('invokes onPointClick with series + point', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ChartLineNormalize
        series={[stockA]}
        onPointClick={onClick}
      />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-normalize-dot"][data-point-index="2"]',
    ) as SVGCircleElement;
    fireEvent.click(dot);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0]?.[0].point.normalized).toBe(120);
  });

  it('exposes per-series stats via data attrs', () => {
    const { container } = render(
      <ChartLineNormalize series={[stockA, stockB]} />,
    );
    const groupA = container.querySelector(
      '[data-section="chart-line-normalize-series-group"][data-series-id="a"]',
    );
    expect(groupA?.getAttribute('data-series-reference')).toBe('50');
    expect(groupA?.getAttribute('data-series-final-normalized')).toBe('130');
    const groupB = container.querySelector(
      '[data-section="chart-line-normalize-series-group"][data-series-id="b"]',
    );
    expect(groupB?.getAttribute('data-series-reference')).toBe('200');
  });

  it('legend shows final percent per series', () => {
    const { container } = render(
      <ChartLineNormalize series={[stockA, stockB]} />,
    );
    const stats = container.querySelectorAll(
      '[data-section="chart-line-normalize-legend-stats"]',
    );
    expect(stats).toHaveLength(2);
    expect(stats[0]?.textContent).toMatch(/\+30/);
  });

  it('toggles series via the legend (uncontrolled)', () => {
    const { container } = render(
      <ChartLineNormalize series={[stockA, stockB]} />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-normalize-legend-button"][data-series-id="a"]',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-normalize-path"]',
      ),
    ).toHaveLength(1);
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLineNormalize
        series={[stockA, stockB]}
        hiddenSeries={new Set(['b'])}
      />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-normalize-path"]',
      ),
    ).toHaveLength(1);
  });

  it('emits onHiddenSeriesChange', () => {
    const onChange = vi.fn();
    const { container } = render(
      <ChartLineNormalize
        series={[stockA]}
        onHiddenSeriesChange={onChange}
      />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-normalize-legend-button"][data-series-id="a"]',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0].has('a')).toBe(true);
  });

  it('omits legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineNormalize
        series={[stockA]}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-normalize-legend"]',
      ),
    ).toBeNull();
  });

  it('exposes data-mode and data-index-base on root', () => {
    const { container } = render(
      <ChartLineNormalize
        series={[stockA]}
        mode="min"
        indexBase={1000}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-normalize"]',
    ) as HTMLDivElement;
    expect(root.getAttribute('data-mode')).toBe('min');
    expect(root.getAttribute('data-index-base')).toBe('1000');
  });

  it('animate flag toggles data-animate and fade-in class', () => {
    const { container } = render(<ChartLineNormalize series={[stockA]} />);
    const root = container.querySelector(
      '[data-section="chart-line-normalize"]',
    ) as HTMLDivElement;
    expect(root.getAttribute('data-animate')).toBe('true');
    expect(root.className).toContain('motion-safe:animate-fade-in');
    const { container: c2 } = render(
      <ChartLineNormalize series={[stockA]} animate={false} />,
    );
    const r2 = c2.querySelector(
      '[data-section="chart-line-normalize"]',
    ) as HTMLDivElement;
    expect(r2.getAttribute('data-animate')).toBe('false');
    expect(r2.className).not.toContain('motion-safe:animate-fade-in');
  });

  it('forwards ref to root div', () => {
    const ref = { current: null as HTMLDivElement | null };
    render(
      <ChartLineNormalize ref={ref} series={[stockA]} />,
    );
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-normalize',
    );
  });

  it('renders a stable displayName for devtools', () => {
    expect(ChartLineNormalize.displayName).toBe('ChartLineNormalize');
  });
});
