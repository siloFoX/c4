import { fireEvent, render, screen, within } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  ChartLineControl,
  DEFAULT_CHART_LINE_CONTROL_HEIGHT,
  DEFAULT_CHART_LINE_CONTROL_K_SIGMA,
  DEFAULT_CHART_LINE_CONTROL_PALETTE,
  DEFAULT_CHART_LINE_CONTROL_WIDTH,
  classifyLineControlState,
  computeLineControlLayout,
  computeLineControlStats,
  describeLineControlChart,
  getLineControlDefaultColor,
  getLineControlFinitePoints,
  normaliseLineControlKSigma,
  type ChartLineControlSeries,
} from './chart-line-control';

const stable: ChartLineControlSeries = {
  id: 's',
  label: 'Stable',
  data: [
    { x: 0, y: 10 },
    { x: 1, y: 11 },
    { x: 2, y: 9 },
    { x: 3, y: 12 },
    { x: 4, y: 8 },
    { x: 5, y: 11 },
  ],
};

const drifty: ChartLineControlSeries = {
  id: 'd',
  label: 'Drifty',
  data: [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 2, y: 0 },
    { x: 3, y: 0 },
    { x: 4, y: 0 },
    { x: 5, y: 0 },
    { x: 6, y: 0 },
    { x: 7, y: 0 },
    { x: 8, y: 100 }, // huge spike
    { x: 9, y: 0 },
  ],
};

describe('chart-line-control: defaults', () => {
  it('has positive width and height defaults', () => {
    expect(DEFAULT_CHART_LINE_CONTROL_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_CONTROL_HEIGHT).toBeGreaterThan(0);
  });

  it('default k-sigma is 3', () => {
    expect(DEFAULT_CHART_LINE_CONTROL_K_SIGMA).toBe(3);
  });

  it('has 10-color palette', () => {
    expect(DEFAULT_CHART_LINE_CONTROL_PALETTE.length).toBe(10);
  });
});

describe('getLineControlDefaultColor', () => {
  it('cycles through palette', () => {
    expect(getLineControlDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_CONTROL_PALETTE[0],
    );
    expect(getLineControlDefaultColor(10)).toBe(
      DEFAULT_CHART_LINE_CONTROL_PALETTE[0],
    );
  });

  it('falls back to color 0 for NaN/negative', () => {
    expect(getLineControlDefaultColor(Number.NaN)).toBe(
      DEFAULT_CHART_LINE_CONTROL_PALETTE[0],
    );
    expect(getLineControlDefaultColor(-3)).toBe(
      DEFAULT_CHART_LINE_CONTROL_PALETTE[0],
    );
  });
});

describe('getLineControlFinitePoints', () => {
  it('drops non-finite', () => {
    const finite = getLineControlFinitePoints([
      { x: 0, y: 0 },
      { x: Number.NaN, y: 1 },
      { x: 2, y: Number.POSITIVE_INFINITY },
      { x: 3, y: 3 },
    ]);
    expect(finite).toHaveLength(2);
  });

  it('returns [] for null/non-array', () => {
    expect(getLineControlFinitePoints(null)).toEqual([]);
    expect(getLineControlFinitePoints(undefined)).toEqual([]);
  });
});

describe('normaliseLineControlKSigma', () => {
  it('returns default for non-finite or non-positive', () => {
    expect(normaliseLineControlKSigma(Number.NaN)).toBe(3);
    expect(normaliseLineControlKSigma(0)).toBe(3);
    expect(normaliseLineControlKSigma(-1)).toBe(3);
  });

  it('returns positive k unchanged', () => {
    expect(normaliseLineControlKSigma(2)).toBe(2);
    expect(normaliseLineControlKSigma(2.5)).toBe(2.5);
  });
});

describe('computeLineControlStats', () => {
  it('returns ok=false for empty/null', () => {
    expect(computeLineControlStats(null).ok).toBe(false);
    expect(computeLineControlStats([]).ok).toBe(false);
  });

  it('computes mean, sigma, UCL, LCL', () => {
    const stats = computeLineControlStats(
      [
        { x: 0, y: 2 },
        { x: 1, y: 4 },
        { x: 2, y: 4 },
        { x: 3, y: 4 },
        { x: 4, y: 5 },
        { x: 5, y: 5 },
        { x: 6, y: 7 },
        { x: 7, y: 9 },
      ],
      { kSigma: 3 },
    );
    // mean = 40/8 = 5
    expect(stats.mean).toBeCloseTo(5, 5);
    // population sigma sqrt(varSum/8): squared dev = 9+1+1+1+0+0+4+16 = 32; var=4; sigma=2
    expect(stats.sigma).toBeCloseTo(2, 5);
    expect(stats.ucl).toBeCloseTo(11, 5);
    expect(stats.lcl).toBeCloseTo(-1, 5);
    expect(stats.count).toBe(8);
    expect(stats.ok).toBe(true);
    expect(stats.kSigma).toBe(3);
  });

  it('uses custom kSigma', () => {
    const stats = computeLineControlStats(
      [
        { x: 0, y: 0 },
        { x: 1, y: 10 },
      ],
      { kSigma: 2 },
    );
    // mean = 5, sigma = 5, +-2sigma -> ucl=15 / lcl=-5
    expect(stats.ucl).toBe(15);
    expect(stats.lcl).toBe(-5);
  });

  it('honors centerLine override (target chart)', () => {
    const stats = computeLineControlStats(
      [
        { x: 0, y: 8 },
        { x: 1, y: 12 },
      ],
      { kSigma: 3, centerLine: 10 },
    );
    expect(stats.mean).toBe(10);
    // sigma from data (population): sqrt(((8-10)^2 + (12-10)^2)/2) = sqrt(8/2) = 2
    expect(stats.sigma).toBeCloseTo(2, 5);
  });

  it('honors sigma override', () => {
    const stats = computeLineControlStats(
      [
        { x: 0, y: 5 },
        { x: 1, y: 5 },
      ],
      { kSigma: 3, sigma: 1 },
    );
    expect(stats.sigma).toBe(1);
    expect(stats.ucl).toBe(8);
    expect(stats.lcl).toBe(2);
  });

  it('falls back to default kSigma when not specified', () => {
    const stats = computeLineControlStats([
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ]);
    expect(stats.kSigma).toBe(3);
  });
});

describe('classifyLineControlState', () => {
  const stats = computeLineControlStats(
    [
      { x: 0, y: 0 },
      { x: 1, y: 10 },
    ],
    { kSigma: 1 },
  );
  // mean=5, sigma=5, ucl=10, lcl=0

  it('classifies above when > UCL', () => {
    expect(classifyLineControlState(11, stats)).toBe('above');
  });

  it('classifies below when < LCL', () => {
    expect(classifyLineControlState(-1, stats)).toBe('below');
  });

  it('classifies in when in range', () => {
    expect(classifyLineControlState(5, stats)).toBe('in');
  });

  it('classifies at boundary as in', () => {
    expect(classifyLineControlState(10, stats)).toBe('in');
    expect(classifyLineControlState(0, stats)).toBe('in');
  });

  it('returns in for non-finite or not-ok stats', () => {
    expect(classifyLineControlState(Number.NaN, stats)).toBe('in');
    const empty = computeLineControlStats([]);
    expect(classifyLineControlState(5, empty)).toBe('in');
  });
});

describe('computeLineControlLayout', () => {
  it('returns empty for empty series', () => {
    const layout = computeLineControlLayout({
      series: [],
      width: 400,
      height: 300,
      padding: 40,
    });
    expect(layout.series).toEqual([]);
  });

  it('returns empty for degenerate canvas', () => {
    const layout = computeLineControlLayout({
      series: [stable],
      width: 10,
      height: 10,
      padding: 40,
    });
    expect(layout.series).toEqual([]);
  });

  it('builds per-series stats + layout points', () => {
    const layout = computeLineControlLayout({
      series: [stable],
      width: 400,
      height: 300,
      padding: 40,
    });
    expect(layout.series).toHaveLength(1);
    expect(layout.series[0]?.stats.ok).toBe(true);
    expect(layout.series[0]?.points).toHaveLength(6);
  });

  it('flags out-of-control points for drifty series', () => {
    const layout = computeLineControlLayout({
      series: [drifty],
      width: 400,
      height: 300,
      padding: 40,
      kSigma: 1,
    });
    // The spike at 100 should be above UCL relative to a mean of 10 with high sigma
    // Use kSigma=1 to make the limit narrow enough to flag
    const series = layout.series[0]!;
    expect(series.outOfControlCount).toBeGreaterThan(0);
  });

  it('counts above vs below separately', () => {
    const layout = computeLineControlLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: -10 }, // below
            { x: 1, y: 0 },
            { x: 2, y: 0 },
            { x: 3, y: 0 },
            { x: 4, y: 0 },
            { x: 5, y: 0 },
            { x: 6, y: 0 },
            { x: 7, y: 0 },
            { x: 8, y: 0 },
            { x: 9, y: 10 }, // above
          ],
        },
      ],
      width: 400,
      height: 300,
      padding: 40,
      kSigma: 1,
    });
    const series = layout.series[0]!;
    expect(series.aboveCount).toBeGreaterThanOrEqual(1);
    expect(series.belowCount).toBeGreaterThanOrEqual(1);
  });

  it('drops hidden series', () => {
    const layout = computeLineControlLayout({
      series: [stable, drifty],
      hiddenSeries: ['d'],
      width: 400,
      height: 300,
      padding: 40,
    });
    expect(layout.series).toHaveLength(1);
    expect(layout.series[0]?.id).toBe('s');
  });

  it('expands y range to cover UCL/LCL', () => {
    const layout = computeLineControlLayout({
      series: [drifty],
      width: 400,
      height: 300,
      padding: 40,
      kSigma: 5, // wide limits
    });
    expect(layout.yMax).toBeGreaterThanOrEqual(layout.series[0]!.stats.ucl);
    expect(layout.yMin).toBeLessThanOrEqual(layout.series[0]!.stats.lcl);
  });

  it('respects bounds overrides', () => {
    const layout = computeLineControlLayout({
      series: [stable],
      width: 400,
      height: 300,
      padding: 40,
      yMin: -100,
      yMax: 100,
    });
    expect(layout.yMin).toBe(-100);
    expect(layout.yMax).toBe(100);
  });

  it('per-point carries state + deviation', () => {
    const layout = computeLineControlLayout({
      series: [drifty],
      width: 400,
      height: 300,
      padding: 40,
      kSigma: 1,
    });
    const points = layout.series[0]!.points;
    const spike = points[8]!;
    expect(spike.state).toBe('above');
    expect(spike.outOfControl).toBe(true);
    expect(spike.deviation).toBeGreaterThan(1);
  });

  it('per-series centerPy/uclPy/lclPy projected correctly (UCL above CL above LCL on screen)', () => {
    const layout = computeLineControlLayout({
      series: [stable],
      width: 400,
      height: 300,
      padding: 40,
    });
    const s = layout.series[0]!;
    // In SVG y increases downward; UCL is higher y value -> smaller py
    expect(s.uclPy).toBeLessThan(s.centerPy);
    expect(s.centerPy).toBeLessThan(s.lclPy);
  });

  it('per-series kSigma override beats chart kSigma', () => {
    const layout = computeLineControlLayout({
      series: [{ ...stable, kSigma: 2 }],
      width: 400,
      height: 300,
      padding: 40,
      kSigma: 3,
    });
    expect(layout.series[0]?.stats.kSigma).toBe(2);
  });

  it('records totalPoints + visibleSeriesCount', () => {
    const layout = computeLineControlLayout({
      series: [stable, drifty],
      width: 400,
      height: 300,
      padding: 40,
    });
    expect(layout.visibleSeriesCount).toBe(2);
    expect(layout.totalPoints).toBe(6 + 10);
  });
});

describe('describeLineControlChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineControlChart([])).toBe('No data');
    expect(describeLineControlChart(null)).toBe('No data');
  });

  it('mentions CL / UCL / LCL / out per series', () => {
    const desc = describeLineControlChart([stable]);
    expect(desc).toMatch(/CL /);
    expect(desc).toMatch(/UCL /);
    expect(desc).toMatch(/LCL /);
    expect(desc).toMatch(/out /);
  });
});

describe('<ChartLineControl> render', () => {
  it('renders empty when no series', () => {
    const { container } = render(<ChartLineControl series={[]} />);
    const root = container.querySelector(
      '[data-section="chart-line-control"]',
    );
    expect(root?.getAttribute('data-empty')).toBe('true');
  });

  it('renders center line, UCL, LCL with kind attrs', () => {
    render(<ChartLineControl series={[stable]} />);
    const cl = document.querySelector(
      '[data-section="chart-line-control-center-line"]',
    );
    expect(cl?.getAttribute('data-kind')).toBe('cl');
    const ucl = document.querySelector(
      '[data-section="chart-line-control-limit"][data-kind="ucl"]',
    );
    const lcl = document.querySelector(
      '[data-section="chart-line-control-limit"][data-kind="lcl"]',
    );
    expect(ucl).not.toBeNull();
    expect(lcl).not.toBeNull();
  });

  it('UCL/LCL strokes are dashed', () => {
    render(<ChartLineControl series={[stable]} />);
    const ucl = document.querySelector(
      '[data-section="chart-line-control-limit"][data-kind="ucl"]',
    );
    expect(ucl?.getAttribute('stroke-dasharray')).toBeTruthy();
  });

  it('renders process series path', () => {
    render(<ChartLineControl series={[stable]} />);
    const path = document.querySelector(
      '[data-section="chart-line-control-path"]',
    );
    expect(path).not.toBeNull();
  });

  it('renders dots with state + out-of-control attrs', () => {
    render(<ChartLineControl series={[drifty]} kSigma={1} />);
    const spike = document.querySelector(
      '[data-section="chart-line-control-dot"][data-point-index="8"]',
    );
    expect(spike?.getAttribute('data-state')).toBe('above');
    expect(spike?.getAttribute('data-out-of-control')).toBe('true');
  });

  it('in-control dots carry data-out-of-control=false', () => {
    render(<ChartLineControl series={[stable]} />);
    const dot0 = document.querySelector(
      '[data-section="chart-line-control-dot"][data-point-index="0"]',
    );
    expect(dot0?.getAttribute('data-out-of-control')).toBe('false');
  });

  it('hides dots when showDots=false', () => {
    render(<ChartLineControl series={[stable]} showDots={false} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-control-dot"]')
        .length,
    ).toBe(0);
  });

  it('renders in-control fill rect', () => {
    render(<ChartLineControl series={[stable]} />);
    const fill = document.querySelector(
      '[data-section="chart-line-control-in-control-fill"]',
    );
    expect(fill).not.toBeNull();
  });

  it('hides in-control fill when showInControlFill=false', () => {
    render(<ChartLineControl series={[stable]} showInControlFill={false} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-control-in-control-fill"]',
      ),
    ).toBeNull();
  });

  it('renders control badge with out-of-control count', () => {
    render(<ChartLineControl series={[drifty]} kSigma={1} />);
    const badge = document.querySelector(
      '[data-section="chart-line-control-badge"]',
    );
    expect(badge?.getAttribute('data-state')).toBe('alert');
    expect(
      Number(badge?.getAttribute('data-out-of-control-count')),
    ).toBeGreaterThan(0);
  });

  it('badge shows ok state when all in control', () => {
    render(<ChartLineControl series={[stable]} />);
    const badge = document.querySelector(
      '[data-section="chart-line-control-badge"]',
    );
    expect(badge?.getAttribute('data-state')).toBe('ok');
  });

  it('hides badge when showControlBadge=false', () => {
    render(
      <ChartLineControl series={[stable]} showControlBadge={false} />,
    );
    expect(
      document.querySelector('[data-section="chart-line-control-badge"]'),
    ).toBeNull();
  });

  it('has region+img ARIA roles', () => {
    render(<ChartLineControl series={[stable]} ariaLabel="ctrl" />);
    const region = screen.getByRole('region', { name: 'ctrl' });
    expect(region.getAttribute('aria-describedby')).toBeTruthy();
    const img = within(region).getByRole('img', { name: 'ctrl' });
    expect(img.tagName.toLowerCase()).toBe('svg');
  });

  it('mirrors data attrs on root', () => {
    render(<ChartLineControl series={[stable]} />);
    const root = document.querySelector(
      '[data-section="chart-line-control"]',
    );
    expect(root?.getAttribute('data-series-count')).toBe('1');
    expect(root?.getAttribute('data-total-points')).toBe('6');
    expect(root?.getAttribute('data-k-sigma')).toBe('3');
    expect(root?.getAttribute('data-out-of-control-count')).toBe('0');
  });

  it('mirrors series stats on group', () => {
    render(<ChartLineControl series={[stable]} />);
    const group = document.querySelector(
      '[data-section="chart-line-control-series-group"]',
    );
    expect(group?.getAttribute('data-series-mean')).toBeTruthy();
    expect(group?.getAttribute('data-series-sigma')).toBeTruthy();
    expect(group?.getAttribute('data-series-ucl')).toBeTruthy();
    expect(group?.getAttribute('data-series-lcl')).toBeTruthy();
  });

  it('shows tooltip with CL + state rows on hover', () => {
    render(<ChartLineControl series={[drifty]} kSigma={1} />);
    const spike = document.querySelector(
      '[data-section="chart-line-control-dot"][data-point-index="8"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(spike);
    const cl = document.querySelector(
      '[data-section="chart-line-control-tooltip-cl"]',
    );
    const state = document.querySelector(
      '[data-section="chart-line-control-tooltip-state"]',
    );
    expect(cl?.textContent).toMatch(/CL:/);
    expect(state?.textContent).toMatch(/out of control/);
  });

  it('hides tooltip on mouse leave', () => {
    render(<ChartLineControl series={[stable]} />);
    const dot = document.querySelector(
      '[data-section="chart-line-control-dot"][data-point-index="0"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(dot);
    fireEvent.mouseLeave(dot);
    expect(
      document.querySelector('[data-section="chart-line-control-tooltip"]'),
    ).toBeNull();
  });

  it('omits tooltip when showTooltip=false', () => {
    render(<ChartLineControl series={[stable]} showTooltip={false} />);
    const dot = document.querySelector(
      '[data-section="chart-line-control-dot"][data-point-index="0"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(dot);
    expect(
      document.querySelector('[data-section="chart-line-control-tooltip"]'),
    ).toBeNull();
  });

  it('fires onPointClick with series + point payload', () => {
    const onPointClick = vi.fn();
    render(
      <ChartLineControl series={[stable]} onPointClick={onPointClick} />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-control-dot"][data-point-index="2"]',
    ) as HTMLElement;
    fireEvent.click(dot);
    expect(onPointClick).toHaveBeenCalledTimes(1);
    expect(onPointClick.mock.calls[0]?.[0]?.point?.index).toBe(2);
  });

  it('legend shows CL + out count per series', () => {
    render(<ChartLineControl series={[drifty]} kSigma={1} />);
    const stats = document.querySelector(
      '[data-section="chart-line-control-legend-stats"]',
    );
    expect(stats?.textContent).toMatch(/CL /);
    expect(stats?.textContent).toMatch(/out /);
  });

  it('toggles visibility via legend', () => {
    const onToggle = vi.fn();
    render(
      <ChartLineControl series={[stable]} onSeriesToggle={onToggle} />,
    );
    const item = document.querySelector(
      '[data-section="chart-line-control-legend-item"]',
    ) as HTMLElement;
    fireEvent.click(item);
    expect(onToggle).toHaveBeenCalledWith({ series: stable, hidden: true });
  });

  it('omits legend when showLegend=false', () => {
    render(<ChartLineControl series={[stable]} showLegend={false} />);
    expect(
      document.querySelector('[data-section="chart-line-control-legend"]'),
    ).toBeNull();
  });

  it('applies animate class when animate=true', () => {
    const { container } = render(
      <ChartLineControl series={[stable]} animate />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-control"]',
    );
    expect(root?.className).toMatch(/animate-fade-in/);
  });

  it('omits animate class when animate=false', () => {
    const { container } = render(
      <ChartLineControl series={[stable]} animate={false} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-control"]',
    );
    expect(root?.className ?? '').not.toMatch(/animate-fade-in/);
  });

  it('forwards ref to root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineControl ref={ref} series={[stable]} />);
    expect(ref.current).not.toBeNull();
  });

  it('has stable displayName', () => {
    expect(ChartLineControl.displayName).toBe('ChartLineControl');
  });
});
