import { fireEvent, render, screen, within } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  ChartLineMomentum,
  DEFAULT_CHART_LINE_MOMENTUM_HEIGHT,
  DEFAULT_CHART_LINE_MOMENTUM_NEGATIVE_COLOR,
  DEFAULT_CHART_LINE_MOMENTUM_PALETTE,
  DEFAULT_CHART_LINE_MOMENTUM_PERIOD,
  DEFAULT_CHART_LINE_MOMENTUM_POSITIVE_COLOR,
  DEFAULT_CHART_LINE_MOMENTUM_WIDTH,
  buildLineMomentumSamples,
  classifyLineMomentumSign,
  computeLineMomentumLayout,
  computeLineMomentumValues,
  describeLineMomentumChart,
  getLineMomentumDefaultColor,
  getLineMomentumFinitePoints,
  normaliseLineMomentumPeriod,
  normaliseLineMomentumSubHeightRatio,
  type ChartLineMomentumSeries,
} from './chart-line-momentum';

const sample: ChartLineMomentumSeries = {
  id: 'a',
  label: 'A',
  data: [
    { x: 0, y: 10 },
    { x: 1, y: 12 },
    { x: 2, y: 11 },
    { x: 3, y: 14 },
    { x: 4, y: 16 },
    { x: 5, y: 13 },
    { x: 6, y: 15 },
    { x: 7, y: 18 },
  ],
};

const downSeries: ChartLineMomentumSeries = {
  id: 'b',
  label: 'B',
  data: [
    { x: 0, y: 20 },
    { x: 1, y: 18 },
    { x: 2, y: 17 },
    { x: 3, y: 15 },
    { x: 4, y: 12 },
  ],
};

describe('chart-line-momentum: defaults', () => {
  it('has positive width and height defaults', () => {
    expect(DEFAULT_CHART_LINE_MOMENTUM_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_MOMENTUM_HEIGHT).toBeGreaterThan(0);
  });

  it('has distinct positive and negative colors', () => {
    expect(DEFAULT_CHART_LINE_MOMENTUM_POSITIVE_COLOR).not.toBe(
      DEFAULT_CHART_LINE_MOMENTUM_NEGATIVE_COLOR,
    );
  });

  it('has default period >= 1', () => {
    expect(DEFAULT_CHART_LINE_MOMENTUM_PERIOD).toBeGreaterThanOrEqual(1);
  });

  it('has a 10-color palette', () => {
    expect(DEFAULT_CHART_LINE_MOMENTUM_PALETTE.length).toBe(10);
  });
});

describe('getLineMomentumDefaultColor', () => {
  it('cycles through the palette', () => {
    expect(getLineMomentumDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_MOMENTUM_PALETTE[0],
    );
    expect(getLineMomentumDefaultColor(10)).toBe(
      DEFAULT_CHART_LINE_MOMENTUM_PALETTE[0],
    );
  });

  it('falls back to color 0 for NaN / negative', () => {
    expect(getLineMomentumDefaultColor(Number.NaN)).toBe(
      DEFAULT_CHART_LINE_MOMENTUM_PALETTE[0],
    );
    expect(getLineMomentumDefaultColor(-3)).toBe(
      DEFAULT_CHART_LINE_MOMENTUM_PALETTE[0],
    );
  });
});

describe('getLineMomentumFinitePoints', () => {
  it('drops non-finite x/y', () => {
    const finite = getLineMomentumFinitePoints([
      { x: 0, y: 0 },
      { x: Number.NaN, y: 1 },
      { x: 2, y: Number.POSITIVE_INFINITY },
      { x: 3, y: 3 },
    ]);
    expect(finite).toHaveLength(2);
  });

  it('returns [] for null/non-array', () => {
    expect(getLineMomentumFinitePoints(null)).toEqual([]);
    expect(getLineMomentumFinitePoints(undefined)).toEqual([]);
  });
});

describe('normaliseLineMomentumPeriod', () => {
  it('returns default for non-finite', () => {
    expect(normaliseLineMomentumPeriod(Number.NaN)).toBe(
      DEFAULT_CHART_LINE_MOMENTUM_PERIOD,
    );
    expect(normaliseLineMomentumPeriod('abc')).toBe(
      DEFAULT_CHART_LINE_MOMENTUM_PERIOD,
    );
  });

  it('clamps to >= 1', () => {
    expect(normaliseLineMomentumPeriod(0)).toBe(1);
    expect(normaliseLineMomentumPeriod(-5)).toBe(1);
  });

  it('floors fractional', () => {
    expect(normaliseLineMomentumPeriod(3.7)).toBe(3);
  });
});

describe('normaliseLineMomentumSubHeightRatio', () => {
  it('clamps below to 0.1 and above to 0.9', () => {
    expect(normaliseLineMomentumSubHeightRatio(0)).toBe(0.1);
    expect(normaliseLineMomentumSubHeightRatio(1)).toBe(0.9);
    expect(normaliseLineMomentumSubHeightRatio(-1)).toBe(0.1);
  });

  it('returns valid ratio unchanged', () => {
    expect(normaliseLineMomentumSubHeightRatio(0.25)).toBe(0.25);
  });

  it('falls back to default for non-finite', () => {
    expect(normaliseLineMomentumSubHeightRatio(Number.NaN)).toBeGreaterThan(0);
  });
});

describe('classifyLineMomentumSign', () => {
  it('positive for > 0', () => {
    expect(classifyLineMomentumSign(0.5)).toBe('positive');
  });

  it('negative for < 0', () => {
    expect(classifyLineMomentumSign(-1)).toBe('negative');
  });

  it('zero for exact 0', () => {
    expect(classifyLineMomentumSign(0)).toBe('zero');
  });

  it('zero for null / non-finite', () => {
    expect(classifyLineMomentumSign(null)).toBe('zero');
    expect(classifyLineMomentumSign(Number.NaN)).toBe('zero');
  });
});

describe('computeLineMomentumValues', () => {
  it('returns [] for null / empty', () => {
    expect(computeLineMomentumValues(null)).toEqual([]);
    expect(computeLineMomentumValues([])).toEqual([]);
  });

  it('returns nulls for the first <period> entries and y[i]-y[i-p] thereafter', () => {
    const m = computeLineMomentumValues(sample.data, 2);
    expect(m[0]).toBeNull();
    expect(m[1]).toBeNull();
    // i=2: 11 - 10 = 1
    expect(m[2]).toBe(1);
    // i=3: 14 - 12 = 2
    expect(m[3]).toBe(2);
    // i=4: 16 - 11 = 5
    expect(m[4]).toBe(5);
    // i=5: 13 - 14 = -1
    expect(m[5]).toBe(-1);
    expect(m).toHaveLength(8);
  });

  it('returns all nulls when period >= length', () => {
    const m = computeLineMomentumValues(sample.data, 100);
    expect(m.every((v) => v === null)).toBe(true);
  });

  it('uses default period when undefined', () => {
    const m = computeLineMomentumValues(sample.data);
    // default period = 10, len = 8 -> all null
    expect(m.every((v) => v === null)).toBe(true);
  });

  it('sorts ascending before computing', () => {
    const m = computeLineMomentumValues(
      [
        { x: 2, y: 11 },
        { x: 0, y: 10 },
        { x: 1, y: 12 },
      ],
      1,
    );
    // sorted: [10, 12, 11]; diffs: null, 2, -1
    expect(m[0]).toBeNull();
    expect(m[1]).toBe(2);
    expect(m[2]).toBe(-1);
  });

  it('drops non-finite before computing', () => {
    const m = computeLineMomentumValues(
      [
        { x: 0, y: 1 },
        { x: 1, y: Number.NaN },
        { x: 2, y: 3 },
        { x: 3, y: 5 },
      ],
      1,
    );
    // sorted finite: [1, 3, 5]; momentum: null, 2, 2
    expect(m).toEqual([null, 2, 2]);
  });
});

describe('buildLineMomentumSamples', () => {
  it('attaches momentum + sign per point', () => {
    const samples = buildLineMomentumSamples(sample.data, 2);
    expect(samples).toHaveLength(8);
    expect(samples[0]?.sign).toBe('zero');
    expect(samples[2]?.sign).toBe('positive');
    expect(samples[5]?.sign).toBe('negative');
  });

  it('returns [] for null', () => {
    expect(buildLineMomentumSamples(null)).toEqual([]);
  });
});

describe('computeLineMomentumLayout', () => {
  it('returns empty for empty series', () => {
    const layout = computeLineMomentumLayout({
      series: [],
      width: 400,
      height: 300,
      padding: 40,
    });
    expect(layout.series).toEqual([]);
    expect(layout.totalPoints).toBe(0);
  });

  it('returns empty for degenerate canvas', () => {
    const layout = computeLineMomentumLayout({
      series: [sample],
      width: 10,
      height: 10,
      padding: 40,
    });
    expect(layout.series).toEqual([]);
  });

  it('builds per-series momentum samples and counts', () => {
    const layout = computeLineMomentumLayout({
      series: [sample],
      width: 500,
      height: 400,
      padding: 40,
      period: 2,
    });
    expect(layout.series).toHaveLength(1);
    const s = layout.series[0]!;
    expect(s.period).toBe(2);
    expect(s.momentumValidCount).toBe(6);
    // momentums (period=2): +1, +2, +5, -1, -1, +5 -> 4 pos / 2 neg / 0 zero
    expect(s.positiveCount + s.negativeCount + s.zeroCount).toBe(6);
    expect(s.positiveCount).toBe(4);
    expect(s.negativeCount).toBe(2);
  });

  it('centers momentum range on zero when both signs present', () => {
    const layout = computeLineMomentumLayout({
      series: [sample],
      width: 500,
      height: 400,
      padding: 40,
      period: 2,
    });
    expect(layout.momentumMin).toBe(-layout.momentumMax);
  });

  it('records latestMomentum and latestSign per series', () => {
    const layout = computeLineMomentumLayout({
      series: [sample],
      width: 500,
      height: 400,
      padding: 40,
      period: 2,
    });
    const s = layout.series[0]!;
    // last momentum at i=7: 18 - 13 = 5
    expect(s.latestMomentum).toBe(5);
    expect(s.latestSign).toBe('positive');
  });

  it('drops hidden series', () => {
    const layout = computeLineMomentumLayout({
      series: [sample, downSeries],
      hiddenSeries: ['b'],
      width: 500,
      height: 400,
      padding: 40,
      period: 2,
    });
    expect(layout.series).toHaveLength(1);
    expect(layout.series[0]?.id).toBe('a');
  });

  it('respects bounds overrides', () => {
    const layout = computeLineMomentumLayout({
      series: [sample],
      width: 500,
      height: 400,
      padding: 40,
      period: 2,
      yMin: 0,
      yMax: 100,
      momentumMin: -10,
      momentumMax: 10,
    });
    expect(layout.yMin).toBe(0);
    expect(layout.yMax).toBe(100);
    expect(layout.momentumMin).toBe(-10);
    expect(layout.momentumMax).toBe(10);
  });

  it('builds tick arrays', () => {
    const layout = computeLineMomentumLayout({
      series: [sample],
      width: 500,
      height: 400,
      padding: 40,
      period: 2,
    });
    expect(layout.xTicks.length).toBeGreaterThan(0);
    expect(layout.yTicks.length).toBeGreaterThan(0);
    expect(layout.momentumTicks.length).toBeGreaterThan(0);
  });

  it('per-point carries momentum + momentumPy', () => {
    const layout = computeLineMomentumLayout({
      series: [sample],
      width: 500,
      height: 400,
      padding: 40,
      period: 2,
    });
    const pts = layout.series[0]?.points ?? [];
    expect(pts[2]?.momentum).toBe(1);
    expect(pts[2]?.momentumPy).not.toBeNull();
    expect(pts[0]?.momentum).toBeNull();
    expect(pts[0]?.momentumPy).toBeNull();
  });

  it('builds positive and negative sign-split paths', () => {
    const layout = computeLineMomentumLayout({
      series: [sample],
      width: 500,
      height: 400,
      padding: 40,
      period: 2,
    });
    const s = layout.series[0]!;
    expect(s.positivePath.length).toBeGreaterThan(0);
    expect(s.negativePath.length).toBeGreaterThan(0);
  });

  it('main + sub panels sum to inner height minus gap', () => {
    const layout = computeLineMomentumLayout({
      series: [sample],
      width: 500,
      height: 400,
      padding: 40,
      period: 2,
    });
    expect(layout.mainHeight + layout.subHeight).toBeLessThanOrEqual(
      400 - 40 * 2,
    );
    expect(layout.subHeight).toBeGreaterThan(0);
    expect(layout.mainHeight).toBeGreaterThan(0);
  });

  it('per-series period override beats chart period', () => {
    const layout = computeLineMomentumLayout({
      series: [{ ...sample, period: 3 }],
      width: 500,
      height: 400,
      padding: 40,
      period: 2,
    });
    expect(layout.series[0]?.period).toBe(3);
  });

  it('records totalPoints + visibleSeriesCount', () => {
    const layout = computeLineMomentumLayout({
      series: [sample, downSeries],
      width: 500,
      height: 400,
      padding: 40,
      period: 1,
    });
    expect(layout.visibleSeriesCount).toBe(2);
    expect(layout.totalPoints).toBe(8 + 5);
  });
});

describe('describeLineMomentumChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineMomentumChart([])).toBe('No data');
    expect(describeLineMomentumChart(null)).toBe('No data');
  });

  it('mentions period and latest momentum per series', () => {
    const desc = describeLineMomentumChart([sample], undefined, 2);
    expect(desc).toMatch(/period 2/);
    expect(desc).toMatch(/latest momentum/);
  });

  it('reports n/a when no momentum is valid', () => {
    const desc = describeLineMomentumChart(
      [{ id: 's', label: 'S', data: [{ x: 0, y: 1 }] }],
      undefined,
      5,
    );
    expect(desc).toMatch(/latest momentum n\/a/);
  });
});

describe('<ChartLineMomentum> render', () => {
  it('renders empty when no series', () => {
    const { container } = render(<ChartLineMomentum series={[]} />);
    const root = container.querySelector(
      '[data-section="chart-line-momentum"]',
    );
    expect(root?.getAttribute('data-empty')).toBe('true');
  });

  it('renders main path with kind=main', () => {
    render(<ChartLineMomentum series={[sample]} period={2} />);
    const path = document.querySelector(
      '[data-section="chart-line-momentum-path"]',
    );
    expect(path?.getAttribute('data-kind')).toBe('main');
  });

  it('renders momentum path with kind=momentum', () => {
    render(<ChartLineMomentum series={[sample]} period={2} />);
    const path = document.querySelector(
      '[data-section="chart-line-momentum-momentum-path"]',
    );
    expect(path?.getAttribute('data-kind')).toBe('momentum');
  });

  it('renders zero reference dashed line', () => {
    render(<ChartLineMomentum series={[sample]} period={2} />);
    const zero = document.querySelector(
      '[data-section="chart-line-momentum-zero-line"]',
    );
    expect(zero).not.toBeNull();
    expect(zero?.getAttribute('stroke-dasharray')).toBe('4 3');
  });

  it('renders positive + negative fills under momentum', () => {
    render(<ChartLineMomentum series={[sample]} period={2} />);
    const fills = document.querySelectorAll(
      '[data-section="chart-line-momentum-fill"]',
    );
    expect(fills.length).toBeGreaterThan(0);
    const signs = Array.from(fills).map((f) => f.getAttribute('data-sign'));
    expect(signs).toContain('positive');
    expect(signs).toContain('negative');
  });

  it('hides momentum fills when showMomentumFill=false', () => {
    render(
      <ChartLineMomentum
        series={[sample]}
        period={2}
        showMomentumFill={false}
      />,
    );
    const fills = document.querySelectorAll(
      '[data-section="chart-line-momentum-fill"]',
    );
    expect(fills.length).toBe(0);
  });

  it('renders sign badge with dominant sign and momentum', () => {
    render(<ChartLineMomentum series={[sample]} period={2} />);
    const badge = document.querySelector(
      '[data-section="chart-line-momentum-badge"]',
    );
    expect(badge?.getAttribute('data-sign')).toBe('positive');
  });

  it('hides badge when showSignBadge=false', () => {
    render(
      <ChartLineMomentum series={[sample]} period={2} showSignBadge={false} />,
    );
    expect(
      document.querySelector('[data-section="chart-line-momentum-badge"]'),
    ).toBeNull();
  });

  it('renders dots with momentum + sign attrs', () => {
    render(<ChartLineMomentum series={[sample]} period={2} />);
    const dot2 = document.querySelector(
      '[data-section="chart-line-momentum-dot"][data-point-index="2"]',
    );
    expect(dot2?.getAttribute('data-sign')).toBe('positive');
    expect(dot2?.getAttribute('data-momentum')).toBe('1');
    const dot5 = document.querySelector(
      '[data-section="chart-line-momentum-dot"][data-point-index="5"]',
    );
    expect(dot5?.getAttribute('data-sign')).toBe('negative');
  });

  it('renders early dots with empty momentum (period not filled)', () => {
    render(<ChartLineMomentum series={[sample]} period={2} />);
    const dot0 = document.querySelector(
      '[data-section="chart-line-momentum-dot"][data-point-index="0"]',
    );
    expect(dot0?.getAttribute('data-momentum')).toBe('');
    expect(dot0?.getAttribute('data-sign')).toBe('zero');
  });

  it('hides dots when showDots=false', () => {
    render(
      <ChartLineMomentum series={[sample]} period={2} showDots={false} />,
    );
    const dots = document.querySelectorAll(
      '[data-section="chart-line-momentum-dot"]',
    );
    expect(dots.length).toBe(0);
  });

  it('has region+img ARIA roles and aria-describedby', () => {
    render(<ChartLineMomentum series={[sample]} period={2} ariaLabel="m" />);
    const region = screen.getByRole('region', { name: 'm' });
    expect(region.getAttribute('aria-describedby')).toBeTruthy();
    const img = within(region).getByRole('img', { name: 'm' });
    expect(img.tagName.toLowerCase()).toBe('svg');
  });

  it('mirrors data attrs on root', () => {
    render(<ChartLineMomentum series={[sample]} period={2} />);
    const root = document.querySelector(
      '[data-section="chart-line-momentum"]',
    );
    expect(root?.getAttribute('data-series-count')).toBe('1');
    expect(root?.getAttribute('data-total-points')).toBe('8');
    expect(root?.getAttribute('data-period')).toBe('2');
    expect(root?.getAttribute('data-dominant-sign')).toBe('positive');
  });

  it('shows tooltip with momentum row on dot hover', () => {
    render(<ChartLineMomentum series={[sample]} period={2} />);
    const dot = document.querySelector(
      '[data-section="chart-line-momentum-dot"][data-point-index="3"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(dot);
    const tip = document.querySelector(
      '[data-section="chart-line-momentum-tooltip"]',
    );
    expect(tip).not.toBeNull();
    const mom = document.querySelector(
      '[data-section="chart-line-momentum-tooltip-momentum"]',
    );
    expect(mom?.textContent).toMatch(/momentum\(2\)/);
  });

  it('tooltip shows n/a for early points', () => {
    render(<ChartLineMomentum series={[sample]} period={2} />);
    const dot = document.querySelector(
      '[data-section="chart-line-momentum-dot"][data-point-index="0"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(dot);
    const mom = document.querySelector(
      '[data-section="chart-line-momentum-tooltip-momentum"]',
    );
    expect(mom?.textContent).toMatch(/n\/a/);
  });

  it('hides tooltip on mouse leave', () => {
    render(<ChartLineMomentum series={[sample]} period={2} />);
    const dot = document.querySelector(
      '[data-section="chart-line-momentum-dot"][data-point-index="3"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(dot);
    fireEvent.mouseLeave(dot);
    expect(
      document.querySelector(
        '[data-section="chart-line-momentum-tooltip"]',
      ),
    ).toBeNull();
  });

  it('omits tooltip when showTooltip=false', () => {
    render(
      <ChartLineMomentum
        series={[sample]}
        period={2}
        showTooltip={false}
      />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-momentum-dot"][data-point-index="3"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(dot);
    expect(
      document.querySelector(
        '[data-section="chart-line-momentum-tooltip"]',
      ),
    ).toBeNull();
  });

  it('fires onPointClick with series + point payload', () => {
    const onPointClick = vi.fn();
    render(
      <ChartLineMomentum
        series={[sample]}
        period={2}
        onPointClick={onPointClick}
      />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-momentum-dot"][data-point-index="2"]',
    ) as HTMLElement;
    fireEvent.click(dot);
    expect(onPointClick).toHaveBeenCalledTimes(1);
    expect(onPointClick.mock.calls[0]?.[0]?.point?.index).toBe(2);
  });

  it('legend shows series with (n=<period>)', () => {
    render(<ChartLineMomentum series={[sample]} period={2} />);
    const per = document.querySelector(
      '[data-section="chart-line-momentum-legend-period"]',
    );
    expect(per?.textContent).toMatch(/n=2/);
  });

  it('toggles series visibility via legend', () => {
    const onToggle = vi.fn();
    render(
      <ChartLineMomentum
        series={[sample]}
        period={2}
        onSeriesToggle={onToggle}
      />,
    );
    const item = document.querySelector(
      '[data-section="chart-line-momentum-legend-item"]',
    ) as HTMLElement;
    fireEvent.click(item);
    expect(onToggle).toHaveBeenCalledWith({ series: sample, hidden: true });
  });

  it('omits legend when showLegend=false', () => {
    render(
      <ChartLineMomentum series={[sample]} period={2} showLegend={false} />,
    );
    expect(
      document.querySelector('[data-section="chart-line-momentum-legend"]'),
    ).toBeNull();
  });

  it('renders momentum sub-panel label', () => {
    render(
      <ChartLineMomentum
        series={[sample]}
        period={2}
        momentumLabel="MOM"
      />,
    );
    const lbl = document.querySelector(
      '[data-section="chart-line-momentum-sub-label"]',
    );
    expect(lbl?.textContent).toBe('MOM');
  });

  it('applies animate class when animate=true', () => {
    const { container } = render(
      <ChartLineMomentum series={[sample]} period={2} animate />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-momentum"]',
    );
    expect(root?.className).toMatch(/animate-fade-in/);
  });

  it('omits animate class when animate=false', () => {
    const { container } = render(
      <ChartLineMomentum series={[sample]} period={2} animate={false} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-momentum"]',
    );
    expect(root?.className ?? '').not.toMatch(/animate-fade-in/);
  });

  it('forwards ref to root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineMomentum ref={ref} series={[sample]} period={2} />);
    expect(ref.current).not.toBeNull();
  });

  it('has stable displayName', () => {
    expect(ChartLineMomentum.displayName).toBe('ChartLineMomentum');
  });
});
