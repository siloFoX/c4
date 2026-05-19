import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  ChartLineCorrelation,
  DEFAULT_CHART_LINE_CORRELATION_HEIGHT,
  DEFAULT_CHART_LINE_CORRELATION_MODERATE_THRESHOLD,
  DEFAULT_CHART_LINE_CORRELATION_NEGATIVE_COLOR,
  DEFAULT_CHART_LINE_CORRELATION_PADDING,
  DEFAULT_CHART_LINE_CORRELATION_PALETTE,
  DEFAULT_CHART_LINE_CORRELATION_POSITIVE_COLOR,
  DEFAULT_CHART_LINE_CORRELATION_STRONG_THRESHOLD,
  DEFAULT_CHART_LINE_CORRELATION_TICK_COUNT,
  DEFAULT_CHART_LINE_CORRELATION_WEAK_THRESHOLD,
  DEFAULT_CHART_LINE_CORRELATION_WIDTH,
  classifyLineCorrelationDirection,
  classifyLineCorrelationStrength,
  computeLineCorrelation,
  computeLineCorrelationLayout,
  computePearsonCorrelation,
  describeLineCorrelationChart,
  getLineCorrelationDefaultColor,
  getLineCorrelationFinitePoints,
  pairLineCorrelationByX,
  type ChartLineCorrelationSeries,
} from './chart-line-correlation';

const tempSeries: ChartLineCorrelationSeries = {
  id: 'temp',
  label: 'Temperature',
  data: [
    { x: 0, y: 60 },
    { x: 1, y: 65 },
    { x: 2, y: 70 },
    { x: 3, y: 75 },
    { x: 4, y: 80 },
  ],
};

const salesSeries: ChartLineCorrelationSeries = {
  id: 'sales',
  label: 'Sales',
  data: [
    { x: 0, y: 100 },
    { x: 1, y: 150 },
    { x: 2, y: 200 },
    { x: 3, y: 280 },
    { x: 4, y: 320 },
  ],
};

const inverseSeries: ChartLineCorrelationSeries = {
  id: 'inv',
  label: 'Inverse',
  data: [
    { x: 0, y: 500 },
    { x: 1, y: 400 },
    { x: 2, y: 300 },
    { x: 3, y: 200 },
    { x: 4, y: 100 },
  ],
};

describe('DEFAULT_CHART_LINE_CORRELATION_* defaults', () => {
  it('has positive width, height, padding, tick count', () => {
    expect(DEFAULT_CHART_LINE_CORRELATION_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_CORRELATION_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_CORRELATION_PADDING).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_CHART_LINE_CORRELATION_TICK_COUNT).toBeGreaterThanOrEqual(2);
  });

  it('has strength thresholds in 0..1 with strong > moderate > weak', () => {
    expect(DEFAULT_CHART_LINE_CORRELATION_STRONG_THRESHOLD).toBeGreaterThan(
      DEFAULT_CHART_LINE_CORRELATION_MODERATE_THRESHOLD,
    );
    expect(DEFAULT_CHART_LINE_CORRELATION_MODERATE_THRESHOLD).toBeGreaterThan(
      DEFAULT_CHART_LINE_CORRELATION_WEAK_THRESHOLD,
    );
    expect(DEFAULT_CHART_LINE_CORRELATION_STRONG_THRESHOLD).toBeLessThan(1);
    expect(DEFAULT_CHART_LINE_CORRELATION_WEAK_THRESHOLD).toBeGreaterThan(0);
  });

  it('has distinct positive/negative direction colors', () => {
    expect(DEFAULT_CHART_LINE_CORRELATION_POSITIVE_COLOR).not.toBe(
      DEFAULT_CHART_LINE_CORRELATION_NEGATIVE_COLOR,
    );
  });

  it('exposes a 10-color palette', () => {
    expect(DEFAULT_CHART_LINE_CORRELATION_PALETTE).toHaveLength(10);
  });
});

describe('getLineCorrelationDefaultColor', () => {
  it('cycles through the palette', () => {
    expect(getLineCorrelationDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_CORRELATION_PALETTE[0],
    );
    expect(getLineCorrelationDefaultColor(11)).toBe(
      DEFAULT_CHART_LINE_CORRELATION_PALETTE[1],
    );
  });

  it('falls back to first color on invalid index', () => {
    expect(getLineCorrelationDefaultColor(-1)).toBe(
      DEFAULT_CHART_LINE_CORRELATION_PALETTE[0],
    );
    expect(getLineCorrelationDefaultColor(Number.NaN)).toBe(
      DEFAULT_CHART_LINE_CORRELATION_PALETTE[0],
    );
  });
});

describe('getLineCorrelationFinitePoints', () => {
  it('drops non-finite samples', () => {
    expect(
      getLineCorrelationFinitePoints([
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
      getLineCorrelationFinitePoints(
        null as unknown as ReadonlyArray<{ x: number; y: number }>,
      ),
    ).toEqual([]);
  });
});

describe('pairLineCorrelationByX', () => {
  it('returns [] on null inputs', () => {
    expect(pairLineCorrelationByX(null, tempSeries)).toEqual([]);
    expect(pairLineCorrelationByX(tempSeries, null)).toEqual([]);
  });

  it('returns [] when either series empty', () => {
    expect(
      pairLineCorrelationByX(
        { id: 'a', label: 'A', data: [] },
        tempSeries,
      ),
    ).toEqual([]);
  });

  it('pairs by exact x match', () => {
    const pairs = pairLineCorrelationByX(tempSeries, salesSeries);
    expect(pairs).toHaveLength(5);
    expect(pairs[0]?.ya).toBe(60);
    expect(pairs[0]?.yb).toBe(100);
    expect(pairs[0]?.indexA).toBe(0);
    expect(pairs[0]?.indexB).toBe(0);
  });

  it('drops samples where x has no match in the other series', () => {
    const offset: ChartLineCorrelationSeries = {
      id: 'o',
      label: 'O',
      data: [
        { x: 0, y: 100 },
        { x: 10, y: 200 },
        { x: 4, y: 300 },
      ],
    };
    const pairs = pairLineCorrelationByX(tempSeries, offset);
    // Only x=0 and x=4 overlap.
    expect(pairs).toHaveLength(2);
    expect(pairs[0]?.x).toBe(0);
    expect(pairs[1]?.x).toBe(4);
  });

  it('drops non-finite samples', () => {
    const messy: ChartLineCorrelationSeries = {
      id: 'm',
      label: 'M',
      data: [
        { x: 0, y: Number.NaN },
        { x: 1, y: 150 },
        { x: 2, y: Number.POSITIVE_INFINITY },
      ],
    };
    const pairs = pairLineCorrelationByX(tempSeries, messy);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.x).toBe(1);
  });

  it('sorts output by x ascending', () => {
    const a: ChartLineCorrelationSeries = {
      id: 'a',
      label: 'A',
      data: [
        { x: 5, y: 1 },
        { x: 1, y: 2 },
        { x: 3, y: 3 },
      ],
    };
    const b: ChartLineCorrelationSeries = {
      id: 'b',
      label: 'B',
      data: [
        { x: 3, y: 10 },
        { x: 1, y: 20 },
        { x: 5, y: 30 },
      ],
    };
    const pairs = pairLineCorrelationByX(a, b);
    expect(pairs.map((p) => p.x)).toEqual([1, 3, 5]);
  });
});

describe('computePearsonCorrelation', () => {
  it('returns NaN + ok=false for <2 pairs', () => {
    expect(computePearsonCorrelation([]).ok).toBe(false);
    expect(
      computePearsonCorrelation([
        { x: 0, ya: 1, yb: 1, indexA: 0, indexB: 0 },
      ]).ok,
    ).toBe(false);
  });

  it('returns r=1 for perfectly correlated pairs', () => {
    const pairs = [
      { x: 0, ya: 0, yb: 0, indexA: 0, indexB: 0 },
      { x: 1, ya: 1, yb: 2, indexA: 1, indexB: 1 },
      { x: 2, ya: 2, yb: 4, indexA: 2, indexB: 2 },
      { x: 3, ya: 3, yb: 6, indexA: 3, indexB: 3 },
    ];
    const { r, ok } = computePearsonCorrelation(pairs);
    expect(ok).toBe(true);
    expect(r).toBeCloseTo(1, 6);
  });

  it('returns r=-1 for perfectly inverse pairs', () => {
    const pairs = [
      { x: 0, ya: 0, yb: 10, indexA: 0, indexB: 0 },
      { x: 1, ya: 1, yb: 8, indexA: 1, indexB: 1 },
      { x: 2, ya: 2, yb: 6, indexA: 2, indexB: 2 },
      { x: 3, ya: 3, yb: 4, indexA: 3, indexB: 3 },
    ];
    const { r, ok } = computePearsonCorrelation(pairs);
    expect(ok).toBe(true);
    expect(r).toBeCloseTo(-1, 6);
  });

  it('returns ok=false when one side is constant (zero variance)', () => {
    const pairs = [
      { x: 0, ya: 5, yb: 0, indexA: 0, indexB: 0 },
      { x: 1, ya: 5, yb: 1, indexA: 1, indexB: 1 },
      { x: 2, ya: 5, yb: 2, indexA: 2, indexB: 2 },
    ];
    const { ok } = computePearsonCorrelation(pairs);
    expect(ok).toBe(false);
  });

  it('records mean of both sides', () => {
    const pairs = [
      { x: 0, ya: 1, yb: 10, indexA: 0, indexB: 0 },
      { x: 1, ya: 3, yb: 20, indexA: 1, indexB: 1 },
    ];
    const { meanA, meanB } = computePearsonCorrelation(pairs);
    expect(meanA).toBeCloseTo(2, 6);
    expect(meanB).toBeCloseTo(15, 6);
  });

  it('clamps to [-1, 1]', () => {
    // We can't easily fabricate floating-point overshoot in a stable
    // way -- but we can verify that the perfectly-correlated case
    // never exceeds 1, even when scaled to ridiculously large values.
    const pairs = [
      { x: 0, ya: 1e10, yb: 2e10, indexA: 0, indexB: 0 },
      { x: 1, ya: 2e10, yb: 4e10, indexA: 1, indexB: 1 },
      { x: 2, ya: 3e10, yb: 6e10, indexA: 2, indexB: 2 },
    ];
    const { r } = computePearsonCorrelation(pairs);
    expect(r).toBeLessThanOrEqual(1);
    expect(r).toBeGreaterThanOrEqual(-1);
  });
});

describe('classifyLineCorrelationStrength', () => {
  it('classifies strong / moderate / weak / none', () => {
    expect(classifyLineCorrelationStrength(0.85)).toBe('strong');
    expect(classifyLineCorrelationStrength(-0.85)).toBe('strong');
    expect(classifyLineCorrelationStrength(0.55)).toBe('moderate');
    expect(classifyLineCorrelationStrength(-0.55)).toBe('moderate');
    expect(classifyLineCorrelationStrength(0.25)).toBe('weak');
    expect(classifyLineCorrelationStrength(0.1)).toBe('none');
  });

  it('honors custom thresholds', () => {
    expect(classifyLineCorrelationStrength(0.5, 0.4, 0.2, 0.1)).toBe('strong');
  });

  it('returns "none" for non-finite r', () => {
    expect(classifyLineCorrelationStrength(Number.NaN)).toBe('none');
  });

  it('falls back to default thresholds when non-finite', () => {
    expect(
      classifyLineCorrelationStrength(0.85, Number.NaN, Number.NaN, Number.NaN),
    ).toBe('strong');
  });
});

describe('classifyLineCorrelationDirection', () => {
  it('classifies positive / negative / neutral', () => {
    expect(classifyLineCorrelationDirection(0.5)).toBe('positive');
    expect(classifyLineCorrelationDirection(-0.5)).toBe('negative');
    expect(classifyLineCorrelationDirection(0)).toBe('neutral');
  });

  it('returns "neutral" for non-finite r', () => {
    expect(classifyLineCorrelationDirection(Number.NaN)).toBe('neutral');
  });
});

describe('computeLineCorrelation', () => {
  it('returns ok=false when no pairs', () => {
    expect(computeLineCorrelation(tempSeries, null).ok).toBe(false);
  });

  it('returns strong positive for temp + sales', () => {
    const r = computeLineCorrelation(tempSeries, salesSeries);
    expect(r.ok).toBe(true);
    expect(r.r).toBeGreaterThan(0.95);
    expect(r.strength).toBe('strong');
    expect(r.direction).toBe('positive');
    expect(r.pairCount).toBe(5);
  });

  it('returns strong negative for temp + inverse', () => {
    const r = computeLineCorrelation(tempSeries, inverseSeries);
    expect(r.r).toBeCloseTo(-1, 6);
    expect(r.strength).toBe('strong');
    expect(r.direction).toBe('negative');
  });
});

describe('computeLineCorrelationLayout', () => {
  it('returns empty when both null', () => {
    const layout = computeLineCorrelationLayout({
      primary: null,
      secondary: null,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.primary).toBeNull();
    expect(layout.secondary).toBeNull();
  });

  it('returns empty when canvas degenerate', () => {
    const layout = computeLineCorrelationLayout({
      primary: tempSeries,
      secondary: salesSeries,
      width: 20,
      height: 20,
      padding: 30,
    });
    expect(layout.primary).toBeNull();
    expect(layout.secondary).toBeNull();
  });

  it('builds layout for both series on separate axes', () => {
    const layout = computeLineCorrelationLayout({
      primary: tempSeries,
      secondary: salesSeries,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.primary?.axis).toBe('left');
    expect(layout.secondary?.axis).toBe('right');
    expect(layout.primary?.finiteCount).toBe(5);
    expect(layout.secondary?.finiteCount).toBe(5);
  });

  it('records the correlation result on the layout', () => {
    const layout = computeLineCorrelationLayout({
      primary: tempSeries,
      secondary: salesSeries,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.correlation.ok).toBe(true);
    expect(layout.correlation.strength).toBe('strong');
    expect(layout.correlation.direction).toBe('positive');
    expect(layout.correlation.pairCount).toBe(5);
  });

  it('emits separate ticks for left + right axes', () => {
    const layout = computeLineCorrelationLayout({
      primary: tempSeries,
      secondary: salesSeries,
      width: 400,
      height: 300,
      padding: 30,
      tickCount: 6,
    });
    expect(layout.xTicks).toHaveLength(6);
    expect(layout.yLeftTicks).toHaveLength(6);
    expect(layout.yRightTicks).toHaveLength(6);
  });

  it('uses separate y ranges per axis', () => {
    const layout = computeLineCorrelationLayout({
      primary: tempSeries,
      secondary: salesSeries,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.primary?.yMin).toBeLessThanOrEqual(60);
    expect(layout.primary?.yMax).toBeGreaterThanOrEqual(80);
    expect(layout.secondary?.yMin).toBeLessThanOrEqual(100);
    expect(layout.secondary?.yMax).toBeGreaterThanOrEqual(320);
  });

  it('respects user-supplied bounds overrides per axis', () => {
    const layout = computeLineCorrelationLayout({
      primary: tempSeries,
      secondary: salesSeries,
      width: 400,
      height: 300,
      padding: 30,
      xMin: -10,
      xMax: 20,
      primaryYMin: 0,
      primaryYMax: 200,
      secondaryYMin: 0,
      secondaryYMax: 500,
    });
    expect(layout.xMin).toBe(-10);
    expect(layout.xMax).toBe(20);
    expect(layout.primary?.yMin).toBe(0);
    expect(layout.primary?.yMax).toBe(200);
    expect(layout.secondary?.yMin).toBe(0);
    expect(layout.secondary?.yMax).toBe(500);
  });
});

describe('describeLineCorrelationChart', () => {
  it('returns "No data" when both null', () => {
    expect(describeLineCorrelationChart(null, null)).toBe('No data');
  });

  it('summarises both series and r when correlation is computable', () => {
    const text = describeLineCorrelationChart(tempSeries, salesSeries);
    expect(text).toContain('Temperature');
    expect(text).toContain('Sales');
    expect(text).toContain('Pearson r');
    expect(text).toContain('strong positive');
  });

  it('falls back to "No correlation computable" when r is NaN', () => {
    expect(
      describeLineCorrelationChart(
        { id: 'a', label: 'A', data: [{ x: 0, y: 1 }] },
        null,
      ),
    ).toMatch(/No correlation computable/);
  });
});

describe('<ChartLineCorrelation /> rendering', () => {
  it('renders nothing meaningful when both null', () => {
    const { container } = render(
      <ChartLineCorrelation primary={null} secondary={null} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-correlation"]',
    );
    expect(root).not.toBeNull();
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-correlation-path"]',
      ),
    ).toHaveLength(0);
  });

  it('renders one path per visible series', () => {
    const { container } = render(
      <ChartLineCorrelation primary={tempSeries} secondary={salesSeries} />,
    );
    const paths = container.querySelectorAll(
      '[data-section="chart-line-correlation-path"]',
    );
    expect(paths).toHaveLength(2);
    expect(
      Array.from(paths).map((p) => p.getAttribute('data-series-axis')),
    ).toEqual(expect.arrayContaining(['left', 'right']));
  });

  it('renders left + right y axes by default', () => {
    const { container } = render(
      <ChartLineCorrelation primary={tempSeries} secondary={salesSeries} />,
    );
    const axes = container.querySelectorAll(
      '[data-section="chart-line-correlation-axis"]',
    );
    const axisKinds = Array.from(axes).map((a) =>
      a.getAttribute('data-axis'),
    );
    expect(axisKinds).toContain('y-left');
    expect(axisKinds).toContain('y-right');
  });

  it('omits the right axis when showRightAxis=false', () => {
    const { container } = render(
      <ChartLineCorrelation
        primary={tempSeries}
        secondary={salesSeries}
        showRightAxis={false}
      />,
    );
    const axes = container.querySelectorAll(
      '[data-section="chart-line-correlation-axis"]',
    );
    expect(
      Array.from(axes).map((a) => a.getAttribute('data-axis')),
    ).not.toContain('y-right');
  });

  it('renders the correlation badge with r value and strength', () => {
    const { container } = render(
      <ChartLineCorrelation primary={tempSeries} secondary={salesSeries} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-correlation-badge"]',
    );
    expect(badge).not.toBeNull();
    expect(badge?.getAttribute('data-strength')).toBe('strong');
    expect(badge?.getAttribute('data-direction')).toBe('positive');
    expect(
      badge?.querySelector(
        '[data-section="chart-line-correlation-badge-r"]',
      )?.textContent,
    ).toMatch(/r =/);
  });

  it('badge shows "no correlation" when r is not computable', () => {
    const { container } = render(
      <ChartLineCorrelation
        primary={{
          id: 'p',
          label: 'P',
          data: [{ x: 0, y: 1 }],
        }}
        secondary={null}
      />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-correlation-badge"]',
    );
    expect(badge?.getAttribute('data-correlation-ok')).toBe('false');
    expect(
      badge?.querySelector(
        '[data-section="chart-line-correlation-badge-strength"]',
      )?.textContent,
    ).toMatch(/no correlation/);
  });

  it('omits badge when showCorrelationBadge=false', () => {
    const { container } = render(
      <ChartLineCorrelation
        primary={tempSeries}
        secondary={salesSeries}
        showCorrelationBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-correlation-badge"]',
      ),
    ).toBeNull();
  });

  it('renders ARIA description with correlation summary', () => {
    render(
      <ChartLineCorrelation primary={tempSeries} secondary={salesSeries} />,
    );
    expect(
      screen.getByRole('region', { name: /dual-axis correlation/i }),
    ).toBeTruthy();
  });

  it('renders dots per finite point with per-axis data attrs', () => {
    const { container } = render(
      <ChartLineCorrelation primary={tempSeries} secondary={salesSeries} />,
    );
    const dots = container.querySelectorAll(
      '[data-section="chart-line-correlation-dot"]',
    );
    expect(dots).toHaveLength(10);
    const axes = Array.from(dots).map((d) =>
      d.getAttribute('data-series-axis'),
    );
    expect(axes.filter((a) => a === 'left')).toHaveLength(5);
    expect(axes.filter((a) => a === 'right')).toHaveLength(5);
  });

  it('hides dots when showDots=false', () => {
    const { container } = render(
      <ChartLineCorrelation
        primary={tempSeries}
        secondary={salesSeries}
        showDots={false}
      />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-correlation-dot"]',
      ),
    ).toHaveLength(0);
  });

  it('shows tooltip on dot hover with axis label', () => {
    const { container } = render(
      <ChartLineCorrelation primary={tempSeries} secondary={salesSeries} />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-correlation-dot"][data-series-id="temp"][data-point-index="2"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    const tip = container.querySelector(
      '[data-section="chart-line-correlation-tooltip"]',
    );
    expect(tip).not.toBeNull();
    expect(tip?.getAttribute('data-series-axis')).toBe('left');
  });

  it('hides tooltip on mouseLeave', () => {
    const { container } = render(
      <ChartLineCorrelation primary={tempSeries} secondary={salesSeries} />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-correlation-dot"][data-series-id="temp"][data-point-index="0"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    expect(
      container.querySelector(
        '[data-section="chart-line-correlation-tooltip"]',
      ),
    ).not.toBeNull();
    fireEvent.mouseLeave(dot);
    expect(
      container.querySelector(
        '[data-section="chart-line-correlation-tooltip"]',
      ),
    ).toBeNull();
  });

  it('omits tooltip when showTooltip=false', () => {
    const { container } = render(
      <ChartLineCorrelation
        primary={tempSeries}
        secondary={salesSeries}
        showTooltip={false}
      />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-correlation-dot"][data-series-id="temp"][data-point-index="0"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    expect(
      container.querySelector(
        '[data-section="chart-line-correlation-tooltip"]',
      ),
    ).toBeNull();
  });

  it('invokes onPointClick with series + point', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ChartLineCorrelation
        primary={tempSeries}
        secondary={salesSeries}
        onPointClick={onClick}
      />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-correlation-dot"][data-series-id="sales"][data-point-index="3"]',
    ) as SVGCircleElement;
    fireEvent.click(dot);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0]?.[0].series.axis).toBe('right');
    expect(onClick.mock.calls[0]?.[0].point.y).toBe(280);
  });

  it('legend lists both axes (left + right)', () => {
    const { container } = render(
      <ChartLineCorrelation primary={tempSeries} secondary={salesSeries} />,
    );
    const items = container.querySelectorAll(
      '[data-section="chart-line-correlation-legend-item"]',
    );
    expect(items).toHaveLength(2);
    const axes = Array.from(items).map((i) =>
      i.getAttribute('data-series-axis'),
    );
    expect(axes).toContain('left');
    expect(axes).toContain('right');
  });

  it('omits legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineCorrelation
        primary={tempSeries}
        secondary={salesSeries}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-correlation-legend"]',
      ),
    ).toBeNull();
  });

  it('exposes data-r, data-pair-count, data-strength, data-direction on root', () => {
    const { container } = render(
      <ChartLineCorrelation primary={tempSeries} secondary={inverseSeries} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-correlation"]',
    ) as HTMLDivElement;
    expect(root.getAttribute('data-strength')).toBe('strong');
    expect(root.getAttribute('data-direction')).toBe('negative');
    expect(root.getAttribute('data-pair-count')).toBe('5');
    expect(Number(root.getAttribute('data-r'))).toBeCloseTo(-1, 6);
    expect(root.getAttribute('data-correlation-ok')).toBe('true');
  });

  it('animate flag toggles data-animate and fade-in class', () => {
    const { container } = render(
      <ChartLineCorrelation primary={tempSeries} secondary={salesSeries} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-correlation"]',
    ) as HTMLDivElement;
    expect(root.getAttribute('data-animate')).toBe('true');
    expect(root.className).toContain('motion-safe:animate-fade-in');
    const { container: c2 } = render(
      <ChartLineCorrelation
        primary={tempSeries}
        secondary={salesSeries}
        animate={false}
      />,
    );
    const r2 = c2.querySelector(
      '[data-section="chart-line-correlation"]',
    ) as HTMLDivElement;
    expect(r2.getAttribute('data-animate')).toBe('false');
    expect(r2.className).not.toContain('motion-safe:animate-fade-in');
  });

  it('forwards ref to root div', () => {
    const ref = { current: null as HTMLDivElement | null };
    render(
      <ChartLineCorrelation
        ref={ref}
        primary={tempSeries}
        secondary={salesSeries}
      />,
    );
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-correlation',
    );
  });

  it('renders a stable displayName for devtools', () => {
    expect(ChartLineCorrelation.displayName).toBe('ChartLineCorrelation');
  });
});
