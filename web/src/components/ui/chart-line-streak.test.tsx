import { fireEvent, render, screen, within } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  ChartLineStreak,
  DEFAULT_CHART_LINE_STREAK_DOWN_COLOR,
  DEFAULT_CHART_LINE_STREAK_HEIGHT,
  DEFAULT_CHART_LINE_STREAK_MIN_LENGTH,
  DEFAULT_CHART_LINE_STREAK_PALETTE,
  DEFAULT_CHART_LINE_STREAK_UP_COLOR,
  DEFAULT_CHART_LINE_STREAK_WIDTH,
  classifyLineStreakStep,
  computeLineStreakLayout,
  computeLineStreakLongest,
  computeLineStreaks,
  describeLineStreakChart,
  getLineStreakDefaultColor,
  getLineStreakFinitePoints,
  normaliseLineStreakFlatEpsilon,
  normaliseLineStreakMinLength,
  type ChartLineStreakSeries,
} from './chart-line-streak';

const ups: ChartLineStreakSeries = {
  id: 'ups',
  label: 'Ups',
  data: [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
    { x: 2, y: 2 },
    { x: 3, y: 3 },
    { x: 4, y: 2 },
    { x: 5, y: 1 },
  ],
};

const altSeries: ChartLineStreakSeries = {
  id: 'alt',
  label: 'Alt',
  data: [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
    { x: 2, y: 0 },
    { x: 3, y: 1 },
    { x: 4, y: 0 },
  ],
};

describe('chart-line-streak: defaults', () => {
  it('has positive width and height defaults', () => {
    expect(DEFAULT_CHART_LINE_STREAK_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_STREAK_HEIGHT).toBeGreaterThan(0);
  });

  it('has distinct up and down colors', () => {
    expect(DEFAULT_CHART_LINE_STREAK_UP_COLOR).not.toBe(
      DEFAULT_CHART_LINE_STREAK_DOWN_COLOR,
    );
  });

  it('has minLength default >= 2', () => {
    expect(DEFAULT_CHART_LINE_STREAK_MIN_LENGTH).toBeGreaterThanOrEqual(2);
  });

  it('has 10-color palette', () => {
    expect(DEFAULT_CHART_LINE_STREAK_PALETTE.length).toBe(10);
  });
});

describe('getLineStreakDefaultColor', () => {
  it('cycles through the palette', () => {
    expect(getLineStreakDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_STREAK_PALETTE[0],
    );
    expect(getLineStreakDefaultColor(10)).toBe(
      DEFAULT_CHART_LINE_STREAK_PALETTE[0],
    );
  });

  it('falls back to color 0 for NaN / negative', () => {
    expect(getLineStreakDefaultColor(Number.NaN)).toBe(
      DEFAULT_CHART_LINE_STREAK_PALETTE[0],
    );
    expect(getLineStreakDefaultColor(-3)).toBe(
      DEFAULT_CHART_LINE_STREAK_PALETTE[0],
    );
  });
});

describe('getLineStreakFinitePoints', () => {
  it('drops non-finite x/y', () => {
    const finite = getLineStreakFinitePoints([
      { x: 0, y: 0 },
      { x: Number.NaN, y: 1 },
      { x: 2, y: Number.POSITIVE_INFINITY },
      { x: 3, y: 3 },
    ]);
    expect(finite).toHaveLength(2);
  });

  it('returns [] for null/non-array', () => {
    expect(getLineStreakFinitePoints(null)).toEqual([]);
    expect(getLineStreakFinitePoints(undefined)).toEqual([]);
  });
});

describe('normaliseLineStreakMinLength', () => {
  it('returns default for non-finite', () => {
    expect(normaliseLineStreakMinLength(Number.NaN)).toBe(
      DEFAULT_CHART_LINE_STREAK_MIN_LENGTH,
    );
    expect(normaliseLineStreakMinLength('abc')).toBe(
      DEFAULT_CHART_LINE_STREAK_MIN_LENGTH,
    );
  });

  it('clamps to >= 2', () => {
    expect(normaliseLineStreakMinLength(1)).toBe(2);
    expect(normaliseLineStreakMinLength(0)).toBe(2);
    expect(normaliseLineStreakMinLength(-5)).toBe(2);
  });

  it('floors fractional values', () => {
    expect(normaliseLineStreakMinLength(3.7)).toBe(3);
  });
});

describe('normaliseLineStreakFlatEpsilon', () => {
  it('returns default for non-finite or negative', () => {
    expect(normaliseLineStreakFlatEpsilon(Number.NaN)).toBe(0);
    expect(normaliseLineStreakFlatEpsilon(-1)).toBe(0);
  });

  it('returns positive epsilon unchanged', () => {
    expect(normaliseLineStreakFlatEpsilon(0.25)).toBe(0.25);
  });
});

describe('classifyLineStreakStep', () => {
  it('classifies positive as up', () => {
    expect(classifyLineStreakStep(1)).toBe('up');
  });

  it('classifies negative as down', () => {
    expect(classifyLineStreakStep(-1)).toBe('down');
  });

  it('classifies within epsilon as flat', () => {
    expect(classifyLineStreakStep(0)).toBe('flat');
    expect(classifyLineStreakStep(0.1, 0.5)).toBe('flat');
    expect(classifyLineStreakStep(-0.1, 0.5)).toBe('flat');
  });

  it('returns flat for non-finite', () => {
    expect(classifyLineStreakStep(Number.NaN)).toBe('flat');
  });
});

describe('computeLineStreaks', () => {
  it('returns empty for null/undefined/empty/single-point', () => {
    expect(computeLineStreaks(null)).toEqual([]);
    expect(computeLineStreaks(undefined)).toEqual([]);
    expect(computeLineStreaks([])).toEqual([]);
    expect(computeLineStreaks([{ x: 0, y: 0 }])).toEqual([]);
  });

  it('captures a single up run', () => {
    const runs = computeLineStreaks([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ]);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.direction).toBe('up');
    expect(runs[0]?.length).toBe(4);
    expect(runs[0]?.startIndex).toBe(0);
    expect(runs[0]?.endIndex).toBe(3);
  });

  it('splits at a direction change preserving the boundary point', () => {
    // peaks at index 3 -> up run [0..3] length 4, down run [3..5] length 3
    const runs = computeLineStreaks(ups.data);
    expect(runs).toHaveLength(2);
    expect(runs[0]?.direction).toBe('up');
    expect(runs[0]?.length).toBe(4);
    expect(runs[1]?.direction).toBe('down');
    expect(runs[1]?.length).toBe(3);
    expect(runs[0]?.endIndex).toBe(runs[1]?.startIndex);
  });

  it('drops runs shorter than minLength', () => {
    const runs = computeLineStreaks(
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 0 },
        { x: 3, y: 1 },
      ],
      { minLength: 3 },
    );
    expect(runs).toEqual([]);
  });

  it('keeps a min-length=2 run', () => {
    const runs = computeLineStreaks(
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      { minLength: 2 },
    );
    expect(runs).toHaveLength(1);
    expect(runs[0]?.length).toBe(2);
  });

  it('honors flatEpsilon by classifying small steps as flat', () => {
    // every step (0.05) falls within epsilon 0.5 -> one flat run of length 4
    const runs = computeLineStreaks(
      [
        { x: 0, y: 0 },
        { x: 1, y: 0.05 },
        { x: 2, y: 0.1 },
        { x: 3, y: 0.15 },
      ],
      { flatEpsilon: 0.5 },
    );
    expect(runs).toHaveLength(1);
    expect(runs[0]?.direction).toBe('flat');
    expect(runs[0]?.length).toBe(4);
  });

  it('sorts ascending by x before scanning', () => {
    const runs = computeLineStreaks([
      { x: 3, y: 3 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 0, y: 0 },
    ]);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.direction).toBe('up');
    expect(runs[0]?.length).toBe(4);
  });

  it('drops non-finite points before scanning', () => {
    const runs = computeLineStreaks([
      { x: 0, y: 0 },
      { x: 1, y: Number.NaN },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ]);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.length).toBe(3);
  });

  it('reports startX/endX/startY/endY/delta from run endpoints', () => {
    const runs = computeLineStreaks([
      { x: 0, y: 0 },
      { x: 1, y: 2 },
      { x: 2, y: 5 },
    ]);
    expect(runs[0]?.startX).toBe(0);
    expect(runs[0]?.endX).toBe(2);
    expect(runs[0]?.startY).toBe(0);
    expect(runs[0]?.endY).toBe(5);
    expect(runs[0]?.delta).toBe(5);
  });
});

describe('computeLineStreakLongest', () => {
  it('returns 0/flat for empty / null', () => {
    expect(computeLineStreakLongest([])).toEqual({
      length: 0,
      direction: 'flat',
    });
    expect(computeLineStreakLongest(null)).toEqual({
      length: 0,
      direction: 'flat',
    });
  });

  it('picks the longest run', () => {
    const runs = computeLineStreaks(ups.data);
    const longest = computeLineStreakLongest(runs);
    expect(longest.length).toBe(4);
    expect(longest.direction).toBe('up');
  });
});

describe('computeLineStreakLayout', () => {
  it('returns empty for empty series', () => {
    const layout = computeLineStreakLayout({
      series: [],
      width: 400,
      height: 300,
      padding: 40,
    });
    expect(layout.series).toEqual([]);
    expect(layout.totalPoints).toBe(0);
  });

  it('returns empty for degenerate canvas', () => {
    const layout = computeLineStreakLayout({
      series: [ups],
      width: 10,
      height: 10,
      padding: 40,
    });
    expect(layout.series).toEqual([]);
  });

  it('builds per-series runs and points', () => {
    const layout = computeLineStreakLayout({
      series: [ups],
      width: 400,
      height: 300,
      padding: 40,
    });
    expect(layout.series).toHaveLength(1);
    expect(layout.series[0]?.runs).toHaveLength(2);
    expect(layout.series[0]?.points).toHaveLength(6);
  });

  it('marks points in a run with the run direction', () => {
    const layout = computeLineStreakLayout({
      series: [ups],
      width: 400,
      height: 300,
      padding: 40,
    });
    const points = layout.series[0]?.points ?? [];
    expect(points[0]?.inStreak).toBe(true);
    expect(points[5]?.inStreak).toBe(true);
    // the peak is shared between runs; later run (down) wins
    expect(points[3]?.direction).toBe('down');
  });

  it('drops hidden series', () => {
    const layout = computeLineStreakLayout({
      series: [ups, altSeries],
      hiddenSeries: ['alt'],
      width: 400,
      height: 300,
      padding: 40,
    });
    expect(layout.series).toHaveLength(1);
    expect(layout.series[0]?.id).toBe('ups');
  });

  it('records longest run per series', () => {
    const layout = computeLineStreakLayout({
      series: [ups],
      width: 400,
      height: 300,
      padding: 40,
    });
    expect(layout.series[0]?.longestRunLength).toBe(4);
    expect(layout.series[0]?.longestRunDirection).toBe('up');
  });

  it('counts up/down/flat runs separately', () => {
    const layout = computeLineStreakLayout({
      series: [ups],
      width: 400,
      height: 300,
      padding: 40,
    });
    expect(layout.series[0]?.upRunCount).toBe(1);
    expect(layout.series[0]?.downRunCount).toBe(1);
    expect(layout.series[0]?.flatRunCount).toBe(0);
  });

  it('respects bounds overrides', () => {
    const layout = computeLineStreakLayout({
      series: [ups],
      width: 400,
      height: 300,
      padding: 40,
      yMin: -10,
      yMax: 10,
    });
    expect(layout.yMin).toBe(-10);
    expect(layout.yMax).toBe(10);
  });

  it('builds non-empty tick arrays at default count', () => {
    const layout = computeLineStreakLayout({
      series: [ups],
      width: 400,
      height: 300,
      padding: 40,
    });
    expect(layout.xTicks.length).toBeGreaterThan(0);
    expect(layout.yTicks.length).toBeGreaterThan(0);
  });

  it('attaches up/down color to runs', () => {
    const layout = computeLineStreakLayout({
      series: [ups],
      width: 400,
      height: 300,
      padding: 40,
    });
    const upRun = layout.series[0]?.runs.find((r) => r.direction === 'up');
    const downRun = layout.series[0]?.runs.find((r) => r.direction === 'down');
    expect(upRun?.color).toBe(DEFAULT_CHART_LINE_STREAK_UP_COLOR);
    expect(downRun?.color).toBe(DEFAULT_CHART_LINE_STREAK_DOWN_COLOR);
  });

  it('records visibleSeriesCount and totalPoints', () => {
    const layout = computeLineStreakLayout({
      series: [ups, altSeries],
      width: 400,
      height: 300,
      padding: 40,
    });
    expect(layout.visibleSeriesCount).toBe(2);
    expect(layout.totalPoints).toBe(6 + 5);
  });
});

describe('describeLineStreakChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineStreakChart([])).toBe('No data');
    expect(describeLineStreakChart(null)).toBe('No data');
  });

  it('mentions longest streak per series', () => {
    const desc = describeLineStreakChart([ups]);
    expect(desc).toMatch(/Ups: longest up streak 4/);
  });
});

describe('<ChartLineStreak> render', () => {
  it('renders empty when no series', () => {
    const { container } = render(<ChartLineStreak series={[]} />);
    const root = container.querySelector('[data-section="chart-line-streak"]');
    expect(root?.getAttribute('data-empty')).toBe('true');
  });

  it('renders base path with kind=base', () => {
    render(<ChartLineStreak series={[ups]} />);
    const basePath = document.querySelector(
      '[data-section="chart-line-streak-path"]',
    );
    expect(basePath?.getAttribute('data-kind')).toBe('base');
  });

  it('renders run overlays with up/down direction', () => {
    render(<ChartLineStreak series={[ups]} />);
    const runs = document.querySelectorAll(
      '[data-section="chart-line-streak-run"]',
    );
    expect(runs.length).toBe(2);
    const dirs = Array.from(runs).map((n) => n.getAttribute('data-direction'));
    expect(dirs).toContain('up');
    expect(dirs).toContain('down');
  });

  it('attaches data-length to each run overlay', () => {
    render(<ChartLineStreak series={[ups]} />);
    const runs = document.querySelectorAll(
      '[data-section="chart-line-streak-run"]',
    );
    const lengths = Array.from(runs).map((n) =>
      Number(n.getAttribute('data-length')),
    );
    expect(lengths).toContain(4);
    expect(lengths).toContain(3);
  });

  it('renders dots when showDots is true', () => {
    render(<ChartLineStreak series={[ups]} />);
    const dots = document.querySelectorAll(
      '[data-section="chart-line-streak-dot"]',
    );
    expect(dots.length).toBe(6);
  });

  it('hides dots when showDots=false', () => {
    render(<ChartLineStreak series={[ups]} showDots={false} />);
    const dots = document.querySelectorAll(
      '[data-section="chart-line-streak-dot"]',
    );
    expect(dots.length).toBe(0);
  });

  it('dots in a streak carry data-in-streak=true', () => {
    render(<ChartLineStreak series={[ups]} />);
    const dot0 = document.querySelector(
      '[data-section="chart-line-streak-dot"][data-point-index="0"]',
    );
    expect(dot0?.getAttribute('data-in-streak')).toBe('true');
  });

  it('dots carry data-direction', () => {
    render(<ChartLineStreak series={[ups]} />);
    const dot0 = document.querySelector(
      '[data-section="chart-line-streak-dot"][data-point-index="0"]',
    );
    expect(dot0?.getAttribute('data-direction')).toBe('up');
  });

  it('renders run badge with direction and length', () => {
    render(<ChartLineStreak series={[ups]} />);
    const badge = document.querySelector(
      '[data-section="chart-line-streak-badge"]',
    );
    expect(badge?.getAttribute('data-direction')).toBe('up');
    expect(badge?.getAttribute('data-length')).toBe('4');
  });

  it('hides run badge when showRunBadge=false', () => {
    render(<ChartLineStreak series={[ups]} showRunBadge={false} />);
    const badge = document.querySelector(
      '[data-section="chart-line-streak-badge"]',
    );
    expect(badge).toBeNull();
  });

  it('has region+img ARIA roles and aria-describedby', () => {
    render(<ChartLineStreak series={[ups]} ariaLabel="my chart" />);
    const region = screen.getByRole('region', { name: 'my chart' });
    expect(region.getAttribute('aria-describedby')).toBeTruthy();
    const img = within(region).getByRole('img', { name: 'my chart' });
    expect(img.tagName.toLowerCase()).toBe('svg');
  });

  it('mirrors data attrs on root', () => {
    render(<ChartLineStreak series={[ups]} />);
    const root = document.querySelector('[data-section="chart-line-streak"]');
    expect(root?.getAttribute('data-series-count')).toBe('1');
    expect(root?.getAttribute('data-total-points')).toBe('6');
    expect(root?.getAttribute('data-longest-length')).toBe('4');
    expect(root?.getAttribute('data-longest-direction')).toBe('up');
    expect(root?.getAttribute('data-min-length')).toBe('2');
  });

  it('shows tooltip on dot hover with streak row', () => {
    render(<ChartLineStreak series={[ups]} />);
    const dot = document.querySelector(
      '[data-section="chart-line-streak-dot"][data-point-index="0"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(dot);
    const tooltip = document.querySelector(
      '[data-section="chart-line-streak-tooltip"]',
    );
    expect(tooltip).not.toBeNull();
    const streakRow = document.querySelector(
      '[data-section="chart-line-streak-tooltip-streak"]',
    );
    expect(streakRow?.textContent).toMatch(/up streak/);
  });

  it('hides tooltip on mouseleave', () => {
    render(<ChartLineStreak series={[ups]} />);
    const dot = document.querySelector(
      '[data-section="chart-line-streak-dot"][data-point-index="0"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(dot);
    fireEvent.mouseLeave(dot);
    const tooltip = document.querySelector(
      '[data-section="chart-line-streak-tooltip"]',
    );
    expect(tooltip).toBeNull();
  });

  it('omits tooltip when showTooltip=false', () => {
    render(<ChartLineStreak series={[ups]} showTooltip={false} />);
    const dot = document.querySelector(
      '[data-section="chart-line-streak-dot"][data-point-index="0"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(dot);
    const tooltip = document.querySelector(
      '[data-section="chart-line-streak-tooltip"]',
    );
    expect(tooltip).toBeNull();
  });

  it('fires onPointClick with series + point payload', () => {
    const onPointClick = vi.fn();
    render(<ChartLineStreak series={[ups]} onPointClick={onPointClick} />);
    const dot = document.querySelector(
      '[data-section="chart-line-streak-dot"][data-point-index="2"]',
    ) as HTMLElement;
    fireEvent.click(dot);
    expect(onPointClick).toHaveBeenCalledTimes(1);
    expect(onPointClick.mock.calls[0]?.[0]?.point?.index).toBe(2);
  });

  it('renders legend items with run count', () => {
    render(<ChartLineStreak series={[ups]} />);
    const legendItems = document.querySelectorAll(
      '[data-section="chart-line-streak-legend-item"]',
    );
    expect(legendItems.length).toBe(1);
    const runs = document.querySelector(
      '[data-section="chart-line-streak-legend-runs"]',
    );
    expect(runs?.textContent).toMatch(/2 runs/);
  });

  it('toggles series visibility from legend (uncontrolled)', () => {
    const onToggle = vi.fn();
    render(<ChartLineStreak series={[ups]} onSeriesToggle={onToggle} />);
    const button = document.querySelector(
      '[data-section="chart-line-streak-legend-item"]',
    ) as HTMLElement;
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({ series: ups, hidden: true });
  });

  it('omits legend when showLegend=false', () => {
    render(<ChartLineStreak series={[ups]} showLegend={false} />);
    expect(
      document.querySelector('[data-section="chart-line-streak-legend"]'),
    ).toBeNull();
  });

  it('marks alternating series with 0 streaks (all single steps) under minLength=3', () => {
    render(<ChartLineStreak series={[altSeries]} minLength={3} />);
    const runs = document.querySelectorAll(
      '[data-section="chart-line-streak-run"]',
    );
    expect(runs.length).toBe(0);
  });

  it('applies animate class when animate=true', () => {
    const { container } = render(<ChartLineStreak series={[ups]} animate />);
    const root = container.querySelector('[data-section="chart-line-streak"]');
    expect(root?.className).toMatch(/animate-fade-in/);
  });

  it('omits animate class when animate=false', () => {
    const { container } = render(
      <ChartLineStreak series={[ups]} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-streak"]');
    expect(root?.className ?? '').not.toMatch(/animate-fade-in/);
  });

  it('forwards ref to root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineStreak ref={ref} series={[ups]} />);
    expect(ref.current).not.toBeNull();
  });

  it('has stable displayName', () => {
    expect(ChartLineStreak.displayName).toBe('ChartLineStreak');
  });
});
