import { fireEvent, render, screen, within } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  ChartLineBurndown,
  DEFAULT_CHART_LINE_BURNDOWN_AHEAD_COLOR,
  DEFAULT_CHART_LINE_BURNDOWN_BEHIND_COLOR,
  DEFAULT_CHART_LINE_BURNDOWN_HEIGHT,
  DEFAULT_CHART_LINE_BURNDOWN_WIDTH,
  classifyBurndownStatus,
  computeBurndownIdealY,
  computeBurndownLayout,
  describeBurndownChart,
  getBurndownFinitePoints,
} from './chart-line-burndown';

const aheadData = [
  { x: 0, y: 10 },
  { x: 1, y: 7 }, // ideal 8 -> ahead by 1
  { x: 2, y: 4 }, // ideal 6 -> ahead by 2
  { x: 3, y: 2 }, // ideal 4 -> ahead by 2
  { x: 4, y: 0 }, // ideal 2 -> ahead by 2
  { x: 5, y: 0 }, // ideal 0 -> on-track
];

const behindData = [
  { x: 0, y: 10 },
  { x: 1, y: 9 }, // ideal 8 -> behind by 1
  { x: 2, y: 8 }, // ideal 6 -> behind by 2
  { x: 3, y: 6 }, // ideal 4 -> behind by 2
  { x: 4, y: 4 }, // ideal 2 -> behind by 2
  { x: 5, y: 2 }, // ideal 0 -> behind by 2
];

describe('chart-line-burndown: defaults', () => {
  it('positive width / height defaults', () => {
    expect(DEFAULT_CHART_LINE_BURNDOWN_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_BURNDOWN_HEIGHT).toBeGreaterThan(0);
  });

  it('distinct ahead/behind colors', () => {
    expect(DEFAULT_CHART_LINE_BURNDOWN_AHEAD_COLOR).not.toBe(
      DEFAULT_CHART_LINE_BURNDOWN_BEHIND_COLOR,
    );
  });
});

describe('getBurndownFinitePoints', () => {
  it('drops non-finite', () => {
    const finite = getBurndownFinitePoints([
      { x: 0, y: 0 },
      { x: Number.NaN, y: 1 },
      { x: 2, y: Number.POSITIVE_INFINITY },
      { x: 3, y: 3 },
    ]);
    expect(finite).toHaveLength(2);
  });

  it('returns [] for null', () => {
    expect(getBurndownFinitePoints(null)).toEqual([]);
    expect(getBurndownFinitePoints(undefined)).toEqual([]);
  });
});

describe('computeBurndownIdealY', () => {
  it('returns startTotal at startX and 0 at endX', () => {
    expect(computeBurndownIdealY(0, 0, 5, 10)).toBe(10);
    expect(computeBurndownIdealY(5, 0, 5, 10)).toBe(0);
  });

  it('linearly interpolates between', () => {
    // midpoint at x=2.5 -> ideal=5
    expect(computeBurndownIdealY(2.5, 0, 5, 10)).toBe(5);
  });

  it('clamps before startX to startTotal', () => {
    expect(computeBurndownIdealY(-3, 0, 5, 10)).toBe(10);
  });

  it('clamps after endX to 0', () => {
    expect(computeBurndownIdealY(10, 0, 5, 10)).toBe(0);
  });

  it('handles startX==endX collapse', () => {
    expect(computeBurndownIdealY(-1, 5, 5, 10)).toBe(10);
    expect(computeBurndownIdealY(10, 5, 5, 10)).toBe(0);
  });

  it('returns NaN for non-finite inputs', () => {
    expect(Number.isNaN(computeBurndownIdealY(Number.NaN, 0, 5, 10))).toBe(true);
  });
});

describe('classifyBurndownStatus', () => {
  it('positive delta is behind', () => {
    expect(classifyBurndownStatus(2)).toBe('behind');
  });

  it('negative delta is ahead', () => {
    expect(classifyBurndownStatus(-2)).toBe('ahead');
  });

  it('zero delta is on-track', () => {
    expect(classifyBurndownStatus(0)).toBe('on-track');
  });

  it('within epsilon is on-track', () => {
    expect(classifyBurndownStatus(0.05, 0.1)).toBe('on-track');
    expect(classifyBurndownStatus(-0.05, 0.1)).toBe('on-track');
  });

  it('non-finite is on-track', () => {
    expect(classifyBurndownStatus(Number.NaN)).toBe('on-track');
  });
});

describe('computeBurndownLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeBurndownLayout({
      data: [],
      width: 400,
      height: 300,
      padding: 40,
    });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=false for degenerate canvas', () => {
    const layout = computeBurndownLayout({
      data: aheadData,
      width: 10,
      height: 10,
      padding: 40,
    });
    expect(layout.ok).toBe(false);
  });

  it('derives startTotal from first point when not specified', () => {
    const layout = computeBurndownLayout({
      data: aheadData,
      width: 500,
      height: 300,
      padding: 40,
    });
    expect(layout.startTotal).toBe(10);
  });

  it('derives startX/endX from data when not specified', () => {
    const layout = computeBurndownLayout({
      data: aheadData,
      width: 500,
      height: 300,
      padding: 40,
    });
    expect(layout.startX).toBe(0);
    expect(layout.endX).toBe(5);
  });

  it('honors explicit startTotal/startX/endX', () => {
    const layout = computeBurndownLayout({
      data: aheadData,
      width: 500,
      height: 300,
      padding: 40,
      startTotal: 20,
      startX: -1,
      endX: 10,
    });
    expect(layout.startTotal).toBe(20);
    expect(layout.startX).toBe(-1);
    expect(layout.endX).toBe(10);
  });

  it('builds per-point ideal + delta + status', () => {
    const layout = computeBurndownLayout({
      data: aheadData,
      width: 500,
      height: 300,
      padding: 40,
    });
    const p1 = layout.actualPoints[1]!;
    expect(p1.idealY).toBe(8);
    expect(p1.delta).toBe(-1);
    expect(p1.status).toBe('ahead');
  });

  it('counts ahead vs behind vs on-track', () => {
    const layout = computeBurndownLayout({
      data: aheadData,
      width: 500,
      height: 300,
      padding: 40,
    });
    expect(layout.aheadCount).toBeGreaterThan(0);
    expect(layout.behindCount).toBe(0);
  });

  it('reports currentStatus from last point', () => {
    const behind = computeBurndownLayout({
      data: behindData,
      width: 500,
      height: 300,
      padding: 40,
    });
    expect(behind.currentStatus).toBe('behind');
    // explicit endX past the last sample so the ideal at last sample is > 0
    // last sample at x=3 y=2; ideal(3) = 10*(1 - 3/5) = 4 -> actual below ideal -> ahead
    const ahead = computeBurndownLayout({
      data: aheadData.slice(0, 4),
      width: 500,
      height: 300,
      padding: 40,
      endX: 5,
    });
    expect(ahead.currentStatus).toBe('ahead');
  });

  it('projects ideal start point at top-left and end at bottom-right (when start < end and startTotal > 0)', () => {
    const layout = computeBurndownLayout({
      data: aheadData,
      width: 500,
      height: 300,
      padding: 40,
    });
    // start: x=0 (left) y=10 (top in screen). end: x=5 (right) y=0 (bottom)
    expect(layout.idealStartPx).toBeLessThan(layout.idealEndPx);
    expect(layout.idealStartPy).toBeLessThan(layout.idealEndPy);
  });

  it('builds ahead and behind shading paths', () => {
    const ahead = computeBurndownLayout({
      data: aheadData,
      width: 500,
      height: 300,
      padding: 40,
    });
    expect(ahead.aheadFillPath.length).toBeGreaterThan(0);
    expect(ahead.behindFillPath).toBe('');

    const behind = computeBurndownLayout({
      data: behindData,
      width: 500,
      height: 300,
      padding: 40,
    });
    expect(behind.behindFillPath.length).toBeGreaterThan(0);
    expect(behind.aheadFillPath).toBe('');
  });

  it('y range includes 0 and startTotal at minimum', () => {
    const layout = computeBurndownLayout({
      data: aheadData,
      width: 500,
      height: 300,
      padding: 40,
    });
    expect(layout.yMin).toBeLessThanOrEqual(0);
    expect(layout.yMax).toBeGreaterThanOrEqual(10);
  });

  it('honors bounds overrides', () => {
    const layout = computeBurndownLayout({
      data: aheadData,
      width: 500,
      height: 300,
      padding: 40,
      yMin: -5,
      yMax: 20,
    });
    expect(layout.yMin).toBe(-5);
    expect(layout.yMax).toBe(20);
  });

  it('drops non-finite from data', () => {
    const layout = computeBurndownLayout({
      data: [
        { x: 0, y: 10 },
        { x: 1, y: Number.NaN },
        { x: 2, y: 5 },
      ],
      width: 500,
      height: 300,
      padding: 40,
    });
    expect(layout.finiteCount).toBe(2);
  });

  it('reports daysRemaining when last sample x < endX', () => {
    const layout = computeBurndownLayout({
      data: aheadData.slice(0, 4),
      width: 500,
      height: 300,
      padding: 40,
      endX: 10,
    });
    expect(layout.daysRemaining).toBeGreaterThan(0);
  });

  it('sorts ascending by x before scanning', () => {
    const layout = computeBurndownLayout({
      data: [
        { x: 3, y: 4 },
        { x: 0, y: 10 },
        { x: 2, y: 6 },
        { x: 1, y: 8 },
      ],
      width: 500,
      height: 300,
      padding: 40,
      endX: 3,
    });
    expect(layout.actualPoints[0]?.x).toBe(0);
    expect(layout.actualPoints[3]?.x).toBe(3);
  });
});

describe('describeBurndownChart', () => {
  it('returns No data for empty', () => {
    expect(describeBurndownChart([])).toBe('No data');
    expect(describeBurndownChart(null)).toBe('No data');
  });

  it('describes scope + current remaining + status', () => {
    const desc = describeBurndownChart(behindData);
    expect(desc).toMatch(/scope /);
    expect(desc).toMatch(/current remaining /);
    expect(desc).toMatch(/behind/);
  });
});

describe('<ChartLineBurndown> render', () => {
  it('renders empty when no data', () => {
    const { container } = render(<ChartLineBurndown data={[]} />);
    const root = container.querySelector(
      '[data-section="chart-line-burndown"]',
    );
    expect(root?.getAttribute('data-empty')).toBe('true');
  });

  it('renders ideal line with kind=ideal', () => {
    render(<ChartLineBurndown data={aheadData} />);
    const ideal = document.querySelector(
      '[data-section="chart-line-burndown-ideal"]',
    );
    expect(ideal?.getAttribute('data-kind')).toBe('ideal');
  });

  it('renders actual line with kind=actual', () => {
    render(<ChartLineBurndown data={aheadData} />);
    const actual = document.querySelector(
      '[data-section="chart-line-burndown-actual"]',
    );
    expect(actual?.getAttribute('data-kind')).toBe('actual');
  });

  it('ideal line is dashed', () => {
    render(<ChartLineBurndown data={aheadData} />);
    const ideal = document.querySelector(
      '[data-section="chart-line-burndown-ideal"]',
    );
    expect(ideal?.getAttribute('stroke-dasharray')).toBeTruthy();
  });

  it('hides ideal when showIdeal=false', () => {
    render(<ChartLineBurndown data={aheadData} showIdeal={false} />);
    expect(
      document.querySelector('[data-section="chart-line-burndown-ideal"]'),
    ).toBeNull();
  });

  it('renders ahead fill when ahead', () => {
    render(<ChartLineBurndown data={aheadData} />);
    const ahead = document.querySelector(
      '[data-section="chart-line-burndown-fill"][data-status="ahead"]',
    );
    expect(ahead).not.toBeNull();
  });

  it('renders behind fill when behind', () => {
    render(<ChartLineBurndown data={behindData} />);
    const behind = document.querySelector(
      '[data-section="chart-line-burndown-fill"][data-status="behind"]',
    );
    expect(behind).not.toBeNull();
  });

  it('hides ahead fill via showAheadFill=false', () => {
    render(<ChartLineBurndown data={aheadData} showAheadFill={false} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-burndown-fill"][data-status="ahead"]',
      ),
    ).toBeNull();
  });

  it('hides behind fill via showBehindFill=false', () => {
    render(<ChartLineBurndown data={behindData} showBehindFill={false} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-burndown-fill"][data-status="behind"]',
      ),
    ).toBeNull();
  });

  it('renders dots with status + delta attrs', () => {
    render(<ChartLineBurndown data={aheadData} />);
    const dot1 = document.querySelector(
      '[data-section="chart-line-burndown-dot"][data-point-index="1"]',
    );
    expect(dot1?.getAttribute('data-status')).toBe('ahead');
    expect(Number(dot1?.getAttribute('data-delta'))).toBe(-1);
    expect(Number(dot1?.getAttribute('data-ideal-y'))).toBe(8);
  });

  it('hides dots when showDots=false', () => {
    render(<ChartLineBurndown data={aheadData} showDots={false} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-burndown-dot"]',
      ).length,
    ).toBe(0);
  });

  it('renders status badge with current status', () => {
    render(<ChartLineBurndown data={behindData} />);
    const badge = document.querySelector(
      '[data-section="chart-line-burndown-badge"]',
    );
    expect(badge?.getAttribute('data-status')).toBe('behind');
  });

  it('hides status badge when showStatusBadge=false', () => {
    render(
      <ChartLineBurndown data={aheadData} showStatusBadge={false} />,
    );
    expect(
      document.querySelector('[data-section="chart-line-burndown-badge"]'),
    ).toBeNull();
  });

  it('has region+img ARIA', () => {
    render(<ChartLineBurndown data={aheadData} ariaLabel="burn" />);
    const region = screen.getByRole('region', { name: 'burn' });
    const img = within(region).getByRole('img', { name: 'burn' });
    expect(img.tagName.toLowerCase()).toBe('svg');
  });

  it('mirrors data-status + counts on root', () => {
    render(<ChartLineBurndown data={behindData} />);
    const root = document.querySelector('[data-section="chart-line-burndown"]');
    expect(root?.getAttribute('data-status')).toBe('behind');
    expect(Number(root?.getAttribute('data-behind-count'))).toBeGreaterThan(0);
    expect(root?.getAttribute('data-total-points')).toBe('6');
  });

  it('tooltip shows ideal + status rows on hover', () => {
    render(<ChartLineBurndown data={behindData} />);
    const dot = document.querySelector(
      '[data-section="chart-line-burndown-dot"][data-point-index="3"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(dot);
    const ideal = document.querySelector(
      '[data-section="chart-line-burndown-tooltip-ideal"]',
    );
    const status = document.querySelector(
      '[data-section="chart-line-burndown-tooltip-status"]',
    );
    expect(ideal?.textContent).toMatch(/ideal/);
    expect(status?.textContent).toMatch(/behind/);
  });

  it('hides tooltip on leave', () => {
    render(<ChartLineBurndown data={behindData} />);
    const dot = document.querySelector(
      '[data-section="chart-line-burndown-dot"][data-point-index="3"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(dot);
    fireEvent.mouseLeave(dot);
    expect(
      document.querySelector(
        '[data-section="chart-line-burndown-tooltip"]',
      ),
    ).toBeNull();
  });

  it('omits tooltip via showTooltip=false', () => {
    render(<ChartLineBurndown data={behindData} showTooltip={false} />);
    const dot = document.querySelector(
      '[data-section="chart-line-burndown-dot"][data-point-index="3"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(dot);
    expect(
      document.querySelector(
        '[data-section="chart-line-burndown-tooltip"]',
      ),
    ).toBeNull();
  });

  it('fires onPointClick payload', () => {
    const onPointClick = vi.fn();
    render(
      <ChartLineBurndown data={aheadData} onPointClick={onPointClick} />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-burndown-dot"][data-point-index="2"]',
    ) as HTMLElement;
    fireEvent.click(dot);
    expect(onPointClick).toHaveBeenCalledTimes(1);
    expect(onPointClick.mock.calls[0]?.[0]?.point?.index).toBe(2);
  });

  it('legend has actual + ideal items', () => {
    render(<ChartLineBurndown data={aheadData} />);
    const actualItem = document.querySelector(
      '[data-section="chart-line-burndown-legend-item"][data-kind="actual"]',
    );
    const idealItem = document.querySelector(
      '[data-section="chart-line-burndown-legend-item"][data-kind="ideal"]',
    );
    expect(actualItem).not.toBeNull();
    expect(idealItem).not.toBeNull();
  });

  it('omits legend via showLegend=false', () => {
    render(<ChartLineBurndown data={aheadData} showLegend={false} />);
    expect(
      document.querySelector('[data-section="chart-line-burndown-legend"]'),
    ).toBeNull();
  });

  it('applies animate class', () => {
    const { container } = render(<ChartLineBurndown data={aheadData} animate />);
    const root = container.querySelector(
      '[data-section="chart-line-burndown"]',
    );
    expect(root?.className).toMatch(/animate-fade-in/);
  });

  it('omits animate class when animate=false', () => {
    const { container } = render(
      <ChartLineBurndown data={aheadData} animate={false} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-burndown"]',
    );
    expect(root?.className ?? '').not.toMatch(/animate-fade-in/);
  });

  it('forwards ref to root', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineBurndown ref={ref} data={aheadData} />);
    expect(ref.current).not.toBeNull();
  });

  it('has stable displayName', () => {
    expect(ChartLineBurndown.displayName).toBe('ChartLineBurndown');
  });
});
