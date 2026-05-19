import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  ChartLinePeriodCompare,
  DEFAULT_CHART_LINE_PERIOD_COMPARE_DOWN_COLOR,
  DEFAULT_CHART_LINE_PERIOD_COMPARE_HEIGHT,
  DEFAULT_CHART_LINE_PERIOD_COMPARE_PADDING,
  DEFAULT_CHART_LINE_PERIOD_COMPARE_PALETTE,
  DEFAULT_CHART_LINE_PERIOD_COMPARE_TICK_COUNT,
  DEFAULT_CHART_LINE_PERIOD_COMPARE_UP_COLOR,
  DEFAULT_CHART_LINE_PERIOD_COMPARE_WIDTH,
  classifyLinePeriodCompareDirection,
  computeLinePeriodCompareLayout,
  computeLinePeriodCompareTotals,
  describeLinePeriodCompareChart,
  getLinePeriodCompareDefaultColor,
  getLinePeriodCompareFinitePoints,
  pairLinePeriodCompareByX,
  type ChartLinePeriodCompareSeries,
} from './chart-line-period-compare';

const currentSeries: ChartLinePeriodCompareSeries = {
  id: 'cur',
  label: 'This week',
  data: [
    { x: 0, y: 110 },
    { x: 1, y: 120 },
    { x: 2, y: 130 },
    { x: 3, y: 140 },
    { x: 4, y: 150 },
  ],
};

const priorSeries: ChartLinePeriodCompareSeries = {
  id: 'pri',
  label: 'Last week',
  data: [
    { x: 0, y: 100 },
    { x: 1, y: 100 },
    { x: 2, y: 100 },
    { x: 3, y: 100 },
    { x: 4, y: 100 },
  ],
};

describe('DEFAULT_CHART_LINE_PERIOD_COMPARE_* defaults', () => {
  it('has positive width, height, padding, tick count', () => {
    expect(DEFAULT_CHART_LINE_PERIOD_COMPARE_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_PERIOD_COMPARE_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_PERIOD_COMPARE_PADDING).toBeGreaterThanOrEqual(
      0,
    );
    expect(
      DEFAULT_CHART_LINE_PERIOD_COMPARE_TICK_COUNT,
    ).toBeGreaterThanOrEqual(2);
  });

  it('has distinct up / down direction colors', () => {
    expect(DEFAULT_CHART_LINE_PERIOD_COMPARE_UP_COLOR).not.toBe(
      DEFAULT_CHART_LINE_PERIOD_COMPARE_DOWN_COLOR,
    );
  });

  it('exposes a 10-color palette', () => {
    expect(DEFAULT_CHART_LINE_PERIOD_COMPARE_PALETTE).toHaveLength(10);
  });
});

describe('getLinePeriodCompareDefaultColor', () => {
  it('cycles through the palette', () => {
    expect(getLinePeriodCompareDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_PERIOD_COMPARE_PALETTE[0],
    );
    expect(getLinePeriodCompareDefaultColor(11)).toBe(
      DEFAULT_CHART_LINE_PERIOD_COMPARE_PALETTE[1],
    );
  });

  it('falls back to first color on invalid index', () => {
    expect(getLinePeriodCompareDefaultColor(-1)).toBe(
      DEFAULT_CHART_LINE_PERIOD_COMPARE_PALETTE[0],
    );
    expect(getLinePeriodCompareDefaultColor(Number.NaN)).toBe(
      DEFAULT_CHART_LINE_PERIOD_COMPARE_PALETTE[0],
    );
  });
});

describe('getLinePeriodCompareFinitePoints', () => {
  it('drops non-finite samples', () => {
    expect(
      getLinePeriodCompareFinitePoints([
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
      getLinePeriodCompareFinitePoints(
        null as unknown as ReadonlyArray<{ x: number; y: number }>,
      ),
    ).toEqual([]);
  });
});

describe('pairLinePeriodCompareByX', () => {
  it('returns [] on null inputs', () => {
    expect(pairLinePeriodCompareByX(null, priorSeries)).toEqual([]);
    expect(pairLinePeriodCompareByX(currentSeries, null)).toEqual([]);
  });

  it('returns [] on empty series', () => {
    expect(
      pairLinePeriodCompareByX(
        { id: 'a', label: 'A', data: [] },
        priorSeries,
      ),
    ).toEqual([]);
  });

  it('pairs by exact x match', () => {
    const pairs = pairLinePeriodCompareByX(currentSeries, priorSeries);
    expect(pairs).toHaveLength(5);
    expect(pairs[0]?.currentY).toBe(110);
    expect(pairs[0]?.priorY).toBe(100);
    expect(pairs[0]?.delta).toBe(10);
    expect(pairs[0]?.percentChange).toBeCloseTo(0.1, 6);
    expect(pairs[0]?.currentIndex).toBe(0);
    expect(pairs[0]?.priorIndex).toBe(0);
  });

  it('drops samples without a matching x', () => {
    const offset: ChartLinePeriodCompareSeries = {
      id: 'o',
      label: 'O',
      data: [
        { x: 0, y: 10 },
        { x: 10, y: 200 },
      ],
    };
    const pairs = pairLinePeriodCompareByX(currentSeries, offset);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.x).toBe(0);
  });

  it('uses |prior| in the denominator (signed prior, +percent change)', () => {
    const pairs = pairLinePeriodCompareByX(
      {
        id: 'c',
        label: 'c',
        data: [{ x: 0, y: -5 }],
      },
      {
        id: 'p',
        label: 'p',
        data: [{ x: 0, y: -10 }],
      },
    );
    // delta = -5 - (-10) = +5. percent = 5 / |-10| = +0.5 (gain).
    expect(pairs[0]?.delta).toBe(5);
    expect(pairs[0]?.percentChange).toBeCloseTo(0.5, 6);
  });

  it('collapses to 0% when prior is exactly 0', () => {
    const pairs = pairLinePeriodCompareByX(
      { id: 'c', label: 'c', data: [{ x: 0, y: 50 }] },
      { id: 'p', label: 'p', data: [{ x: 0, y: 0 }] },
    );
    expect(pairs[0]?.delta).toBe(50);
    expect(pairs[0]?.percentChange).toBe(0);
  });

  it('drops non-finite samples', () => {
    const messy: ChartLinePeriodCompareSeries = {
      id: 'm',
      label: 'm',
      data: [
        { x: 0, y: Number.NaN },
        { x: 1, y: 50 },
        { x: 2, y: Number.POSITIVE_INFINITY },
      ],
    };
    const pairs = pairLinePeriodCompareByX(currentSeries, messy);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.x).toBe(1);
  });

  it('sorts output by x ascending', () => {
    const a: ChartLinePeriodCompareSeries = {
      id: 'a',
      label: 'a',
      data: [
        { x: 5, y: 1 },
        { x: 1, y: 2 },
        { x: 3, y: 3 },
      ],
    };
    const b: ChartLinePeriodCompareSeries = {
      id: 'b',
      label: 'b',
      data: [
        { x: 1, y: 10 },
        { x: 5, y: 20 },
        { x: 3, y: 30 },
      ],
    };
    const pairs = pairLinePeriodCompareByX(a, b);
    expect(pairs.map((p) => p.x)).toEqual([1, 3, 5]);
  });
});

describe('classifyLinePeriodCompareDirection', () => {
  it('classifies up / down / flat', () => {
    expect(classifyLinePeriodCompareDirection(0.05)).toBe('up');
    expect(classifyLinePeriodCompareDirection(-0.05)).toBe('down');
    expect(classifyLinePeriodCompareDirection(0)).toBe('flat');
  });

  it('honors epsilon equality band', () => {
    expect(classifyLinePeriodCompareDirection(0.005, 0.01)).toBe('flat');
    expect(classifyLinePeriodCompareDirection(0.05, 0.01)).toBe('up');
  });

  it('returns "flat" on non-finite', () => {
    expect(classifyLinePeriodCompareDirection(Number.NaN)).toBe('flat');
  });
});

describe('computeLinePeriodCompareTotals', () => {
  it('returns ok=false when both null/empty', () => {
    expect(
      computeLinePeriodCompareTotals(null, null).ok,
    ).toBe(false);
  });

  it('computes per-series totals + delta', () => {
    const t = computeLinePeriodCompareTotals(currentSeries, priorSeries);
    expect(t.currentTotal).toBe(110 + 120 + 130 + 140 + 150);
    expect(t.priorTotal).toBe(500);
    expect(t.totalDelta).toBe(t.currentTotal - 500);
    expect(t.direction).toBe('up');
    expect(t.pairCount).toBe(5);
    expect(t.currentCount).toBe(5);
    expect(t.priorCount).toBe(5);
  });

  it('reports total percent change relative to |priorTotal|', () => {
    const t = computeLinePeriodCompareTotals(currentSeries, priorSeries);
    // delta 150 / 500 = 0.3.
    expect(t.totalPercentChange).toBeCloseTo(0.3, 6);
  });

  it('collapses percent to 0 when prior total is 0', () => {
    const t = computeLinePeriodCompareTotals(
      {
        id: 'c',
        label: 'c',
        data: [{ x: 0, y: 50 }],
      },
      {
        id: 'p',
        label: 'p',
        data: [{ x: 0, y: 0 }],
      },
    );
    expect(t.priorTotal).toBe(0);
    expect(t.totalDelta).toBe(50);
    expect(t.totalPercentChange).toBe(0);
  });

  it('classifies direction as down when current < prior', () => {
    const decline: ChartLinePeriodCompareSeries = {
      id: 'd',
      label: 'd',
      data: [
        { x: 0, y: 50 },
        { x: 1, y: 60 },
      ],
    };
    const t = computeLinePeriodCompareTotals(decline, priorSeries);
    expect(t.direction).toBe('down');
  });
});

describe('computeLinePeriodCompareLayout', () => {
  it('returns empty when both null', () => {
    const layout = computeLinePeriodCompareLayout({
      current: null,
      prior: null,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.current).toBeNull();
    expect(layout.prior).toBeNull();
  });

  it('returns empty when canvas degenerate', () => {
    const layout = computeLinePeriodCompareLayout({
      current: currentSeries,
      prior: priorSeries,
      width: 20,
      height: 20,
      padding: 30,
    });
    expect(layout.current).toBeNull();
    expect(layout.prior).toBeNull();
  });

  it('builds layout for both periods on the same axes', () => {
    const layout = computeLinePeriodCompareLayout({
      current: currentSeries,
      prior: priorSeries,
      width: 600,
      height: 300,
      padding: 30,
    });
    expect(layout.current?.role).toBe('current');
    expect(layout.prior?.role).toBe('prior');
    expect(layout.current?.finiteCount).toBe(5);
    expect(layout.prior?.finiteCount).toBe(5);
  });

  it('attaches per-point delta + percent + direction to current series', () => {
    const layout = computeLinePeriodCompareLayout({
      current: currentSeries,
      prior: priorSeries,
      width: 600,
      height: 300,
      padding: 30,
    });
    const first = layout.current!.points[0]!;
    expect(first.delta).toBe(10);
    expect(first.percentChange).toBeCloseTo(0.1, 6);
    expect(first.direction).toBe('up');
  });

  it('records totals on the layout', () => {
    const layout = computeLinePeriodCompareLayout({
      current: currentSeries,
      prior: priorSeries,
      width: 600,
      height: 300,
      padding: 30,
    });
    expect(layout.totals.ok).toBe(true);
    expect(layout.totals.direction).toBe('up');
    expect(layout.totals.pairCount).toBe(5);
    expect(layout.totals.totalDelta).toBe(150);
  });

  it('honors flatEpsilon for the totals direction', () => {
    const slight: ChartLinePeriodCompareSeries = {
      id: 's',
      label: 's',
      data: [{ x: 0, y: 100.5 }],
    };
    const baseline: ChartLinePeriodCompareSeries = {
      id: 'b',
      label: 'b',
      data: [{ x: 0, y: 100 }],
    };
    const layout = computeLinePeriodCompareLayout({
      current: slight,
      prior: baseline,
      flatEpsilon: 0.01,
      width: 400,
      height: 300,
      padding: 30,
    });
    // totalPercentChange = 0.5/100 = 0.005, which is below epsilon 0.01.
    expect(layout.totals.direction).toBe('flat');
  });

  it('per-point delta is null when there is no matching x in the prior series', () => {
    const offset: ChartLinePeriodCompareSeries = {
      id: 'o',
      label: 'o',
      data: [{ x: 99, y: 10 }],
    };
    const layout = computeLinePeriodCompareLayout({
      current: currentSeries,
      prior: offset,
      width: 600,
      height: 300,
      padding: 30,
    });
    // None of the current x values match x=99, so all per-point deltas
    // on current should be null.
    expect(
      layout.current?.points.every((p) => p.delta === null),
    ).toBe(true);
  });

  it('joint y range covers both periods', () => {
    const layout = computeLinePeriodCompareLayout({
      current: currentSeries,
      prior: priorSeries,
      width: 600,
      height: 300,
      padding: 30,
    });
    expect(layout.yMax).toBeGreaterThanOrEqual(150);
    expect(layout.yMin).toBeLessThanOrEqual(100);
  });

  it('respects user-supplied bounds overrides', () => {
    const layout = computeLinePeriodCompareLayout({
      current: currentSeries,
      prior: priorSeries,
      width: 600,
      height: 300,
      padding: 30,
      xMin: -10,
      xMax: 20,
      yMin: 0,
      yMax: 300,
    });
    expect(layout.xMin).toBe(-10);
    expect(layout.xMax).toBe(20);
    expect(layout.yMin).toBe(0);
    expect(layout.yMax).toBe(300);
  });

  it('produces axis ticks at the requested step count', () => {
    const layout = computeLinePeriodCompareLayout({
      current: currentSeries,
      prior: priorSeries,
      width: 600,
      height: 300,
      padding: 30,
      tickCount: 6,
    });
    expect(layout.xTicks).toHaveLength(6);
    expect(layout.yTicks).toHaveLength(6);
  });
});

describe('describeLinePeriodCompareChart', () => {
  it('returns "No data" when both null', () => {
    expect(describeLinePeriodCompareChart(null, null)).toBe('No data');
  });

  it('summarises both periods + total change', () => {
    const text = describeLinePeriodCompareChart(currentSeries, priorSeries);
    expect(text).toContain('This week');
    expect(text).toContain('Last week');
    expect(text).toContain('Total change');
    expect(text).toContain('(up)');
  });
});

describe('<ChartLinePeriodCompare /> rendering', () => {
  it('renders nothing meaningful when both null', () => {
    const { container } = render(
      <ChartLinePeriodCompare current={null} prior={null} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-period-compare"]',
    );
    expect(root).not.toBeNull();
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-period-compare-path"]',
      ),
    ).toHaveLength(0);
  });

  it('renders both current and prior paths with role data attr', () => {
    const { container } = render(
      <ChartLinePeriodCompare current={currentSeries} prior={priorSeries} />,
    );
    const paths = container.querySelectorAll(
      '[data-section="chart-line-period-compare-path"]',
    );
    expect(paths).toHaveLength(2);
    const roles = Array.from(paths).map((p) =>
      p.getAttribute('data-series-role'),
    );
    expect(roles).toContain('current');
    expect(roles).toContain('prior');
  });

  it('renders prior path with stroke-dasharray', () => {
    const { container } = render(
      <ChartLinePeriodCompare current={currentSeries} prior={priorSeries} />,
    );
    const priorPath = container.querySelector(
      '[data-section="chart-line-period-compare-path"][data-series-role="prior"]',
    );
    expect(priorPath?.getAttribute('stroke-dasharray')).toBeTruthy();
  });

  it('renders change badge with total percent + direction', () => {
    const { container } = render(
      <ChartLinePeriodCompare current={currentSeries} prior={priorSeries} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-period-compare-badge"]',
    );
    expect(badge).not.toBeNull();
    expect(badge?.getAttribute('data-direction')).toBe('up');
    expect(
      badge?.querySelector(
        '[data-section="chart-line-period-compare-badge-percent"]',
      )?.textContent,
    ).toMatch(/\+30/);
  });

  it('omits the change badge when showChangeBadge=false', () => {
    const { container } = render(
      <ChartLinePeriodCompare
        current={currentSeries}
        prior={priorSeries}
        showChangeBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-period-compare-badge"]',
      ),
    ).toBeNull();
  });

  it('renders dots per finite point with role data attr', () => {
    const { container } = render(
      <ChartLinePeriodCompare current={currentSeries} prior={priorSeries} />,
    );
    const dots = container.querySelectorAll(
      '[data-section="chart-line-period-compare-dot"]',
    );
    expect(dots).toHaveLength(10);
  });

  it('current dots carry data-delta + data-percent-change + data-direction', () => {
    const { container } = render(
      <ChartLinePeriodCompare current={currentSeries} prior={priorSeries} />,
    );
    const curDot = container.querySelector(
      '[data-section="chart-line-period-compare-dot"][data-series-role="current"][data-point-index="0"]',
    );
    expect(curDot?.getAttribute('data-delta')).toBe('10');
    expect(curDot?.getAttribute('data-direction')).toBe('up');
    expect(
      Number(curDot?.getAttribute('data-percent-change')),
    ).toBeCloseTo(0.1, 6);
  });

  it('prior dots have empty data-delta (no per-point comparison)', () => {
    const { container } = render(
      <ChartLinePeriodCompare current={currentSeries} prior={priorSeries} />,
    );
    const priorDot = container.querySelector(
      '[data-section="chart-line-period-compare-dot"][data-series-role="prior"][data-point-index="0"]',
    );
    expect(priorDot?.getAttribute('data-delta')).toBe('');
    expect(priorDot?.getAttribute('data-direction')).toBe('flat');
  });

  it('hides dots when showDots=false', () => {
    const { container } = render(
      <ChartLinePeriodCompare
        current={currentSeries}
        prior={priorSeries}
        showDots={false}
      />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-period-compare-dot"]',
      ),
    ).toHaveLength(0);
  });

  it('renders aria description and labels region', () => {
    render(
      <ChartLinePeriodCompare current={currentSeries} prior={priorSeries} />,
    );
    expect(
      screen.getByRole('region', { name: /period-over-period/i }),
    ).toBeTruthy();
  });

  it('shows tooltip on dot hover with delta + percent rows for current dots', () => {
    const { container } = render(
      <ChartLinePeriodCompare current={currentSeries} prior={priorSeries} />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-period-compare-dot"][data-series-role="current"][data-point-index="2"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    const tip = container.querySelector(
      '[data-section="chart-line-period-compare-tooltip"]',
    );
    expect(tip).not.toBeNull();
    expect(tip?.getAttribute('data-direction')).toBe('up');
    expect(
      tip?.querySelector(
        '[data-section="chart-line-period-compare-tooltip-delta"]',
      )?.textContent,
    ).toMatch(/vs prior/);
  });

  it('omits delta row in tooltip for prior dots', () => {
    const { container } = render(
      <ChartLinePeriodCompare current={currentSeries} prior={priorSeries} />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-period-compare-dot"][data-series-role="prior"][data-point-index="0"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    expect(
      container.querySelector(
        '[data-section="chart-line-period-compare-tooltip-delta"]',
      ),
    ).toBeNull();
  });

  it('hides tooltip on mouseLeave', () => {
    const { container } = render(
      <ChartLinePeriodCompare current={currentSeries} prior={priorSeries} />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-period-compare-dot"][data-series-role="current"][data-point-index="0"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    expect(
      container.querySelector(
        '[data-section="chart-line-period-compare-tooltip"]',
      ),
    ).not.toBeNull();
    fireEvent.mouseLeave(dot);
    expect(
      container.querySelector(
        '[data-section="chart-line-period-compare-tooltip"]',
      ),
    ).toBeNull();
  });

  it('omits tooltip when showTooltip=false', () => {
    const { container } = render(
      <ChartLinePeriodCompare
        current={currentSeries}
        prior={priorSeries}
        showTooltip={false}
      />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-period-compare-dot"][data-series-role="current"][data-point-index="0"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    expect(
      container.querySelector(
        '[data-section="chart-line-period-compare-tooltip"]',
      ),
    ).toBeNull();
  });

  it('invokes onPointClick with series + point', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ChartLinePeriodCompare
        current={currentSeries}
        prior={priorSeries}
        onPointClick={onClick}
      />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-period-compare-dot"][data-series-role="current"][data-point-index="3"]',
    ) as SVGCircleElement;
    fireEvent.click(dot);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0]?.[0].series.role).toBe('current');
    expect(onClick.mock.calls[0]?.[0].point.delta).toBe(40);
  });

  it('legend lists both periods (current + prior)', () => {
    const { container } = render(
      <ChartLinePeriodCompare current={currentSeries} prior={priorSeries} />,
    );
    const items = container.querySelectorAll(
      '[data-section="chart-line-period-compare-legend-item"]',
    );
    expect(items).toHaveLength(2);
    const roles = Array.from(items).map((i) =>
      i.getAttribute('data-series-role'),
    );
    expect(roles).toContain('current');
    expect(roles).toContain('prior');
  });

  it('omits legend when showLegend=false', () => {
    const { container } = render(
      <ChartLinePeriodCompare
        current={currentSeries}
        prior={priorSeries}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-period-compare-legend"]',
      ),
    ).toBeNull();
  });

  it('exposes data-* on root', () => {
    const { container } = render(
      <ChartLinePeriodCompare current={currentSeries} prior={priorSeries} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-period-compare"]',
    ) as HTMLDivElement;
    expect(root.getAttribute('data-direction')).toBe('up');
    expect(root.getAttribute('data-pair-count')).toBe('5');
    expect(Number(root.getAttribute('data-total-delta'))).toBe(150);
    expect(root.getAttribute('data-totals-ok')).toBe('true');
  });

  it('animate flag toggles data-animate and fade-in class', () => {
    const { container } = render(
      <ChartLinePeriodCompare current={currentSeries} prior={priorSeries} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-period-compare"]',
    ) as HTMLDivElement;
    expect(root.getAttribute('data-animate')).toBe('true');
    expect(root.className).toContain('motion-safe:animate-fade-in');
    const { container: c2 } = render(
      <ChartLinePeriodCompare
        current={currentSeries}
        prior={priorSeries}
        animate={false}
      />,
    );
    const r2 = c2.querySelector(
      '[data-section="chart-line-period-compare"]',
    ) as HTMLDivElement;
    expect(r2.getAttribute('data-animate')).toBe('false');
    expect(r2.className).not.toContain('motion-safe:animate-fade-in');
  });

  it('forwards ref to root div', () => {
    const ref = { current: null as HTMLDivElement | null };
    render(
      <ChartLinePeriodCompare
        ref={ref}
        current={currentSeries}
        prior={priorSeries}
      />,
    );
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-period-compare',
    );
  });

  it('renders a stable displayName for devtools', () => {
    expect(ChartLinePeriodCompare.displayName).toBe(
      'ChartLinePeriodCompare',
    );
  });
});
