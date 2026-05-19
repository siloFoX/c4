import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

import {
  ChartStrip,
  DEFAULT_CHART_STRIP_WIDTH,
  DEFAULT_CHART_STRIP_HEIGHT,
  DEFAULT_CHART_STRIP_PADDING,
  DEFAULT_CHART_STRIP_LANE_GAP,
  DEFAULT_CHART_STRIP_TICK_COUNT,
  DEFAULT_CHART_STRIP_MARK_TICK_SIZE,
  DEFAULT_CHART_STRIP_MARK_DOT_SIZE,
  DEFAULT_CHART_STRIP_MARK_OPACITY,
  DEFAULT_CHART_STRIP_STROKE_WIDTH,
  DEFAULT_CHART_STRIP_GRID_COLOR,
  DEFAULT_CHART_STRIP_AXIS_COLOR,
  DEFAULT_CHART_STRIP_ORIENTATION,
  DEFAULT_CHART_STRIP_MARK,
  DEFAULT_CHART_STRIP_JITTER,
  DEFAULT_CHART_STRIP_JITTER_SEED,
  DEFAULT_CHART_STRIP_PALETTE,
  computeStripLayout,
  describeStripChart,
  getStripBounds,
  getStripDefaultColor,
  getStripFiniteValues,
  getStripJitter,
  getStripTicks,
  type ChartStripGroup,
} from './chart-strip';

afterEach(() => {
  cleanup();
});

describe('chart-strip / constants', () => {
  it('exports sensible defaults', () => {
    expect(DEFAULT_CHART_STRIP_WIDTH).toBe(560);
    expect(DEFAULT_CHART_STRIP_HEIGHT).toBe(320);
    expect(DEFAULT_CHART_STRIP_PADDING).toBe(40);
    expect(DEFAULT_CHART_STRIP_LANE_GAP).toBe(8);
    expect(DEFAULT_CHART_STRIP_TICK_COUNT).toBe(5);
    expect(DEFAULT_CHART_STRIP_MARK_TICK_SIZE).toBeGreaterThan(0);
    expect(DEFAULT_CHART_STRIP_MARK_DOT_SIZE).toBeGreaterThan(0);
    expect(DEFAULT_CHART_STRIP_MARK_OPACITY).toBeGreaterThan(0);
    expect(DEFAULT_CHART_STRIP_MARK_OPACITY).toBeLessThanOrEqual(1);
    expect(DEFAULT_CHART_STRIP_STROKE_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_STRIP_GRID_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_STRIP_AXIS_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_STRIP_ORIENTATION).toBe('horizontal');
    expect(DEFAULT_CHART_STRIP_MARK).toBe('tick');
    expect(DEFAULT_CHART_STRIP_JITTER).toBe(0);
    expect(DEFAULT_CHART_STRIP_JITTER_SEED).toBe(1);
    expect(DEFAULT_CHART_STRIP_PALETTE).toHaveLength(10);
  });
});

describe('chart-strip / getStripDefaultColor', () => {
  it('returns a palette colour and wraps with modulo', () => {
    expect(getStripDefaultColor(0)).toBe(DEFAULT_CHART_STRIP_PALETTE[0]);
    expect(getStripDefaultColor(1)).toBe(DEFAULT_CHART_STRIP_PALETTE[1]);
    expect(getStripDefaultColor(10)).toBe(DEFAULT_CHART_STRIP_PALETTE[0]);
    expect(getStripDefaultColor(11)).toBe(DEFAULT_CHART_STRIP_PALETTE[1]);
  });

  it('falls back to first colour for invalid indices', () => {
    expect(getStripDefaultColor(-1)).toBe(DEFAULT_CHART_STRIP_PALETTE[0]);
    expect(getStripDefaultColor(NaN)).toBe(DEFAULT_CHART_STRIP_PALETTE[0]);
  });
});

describe('chart-strip / getStripFiniteValues', () => {
  it('keeps only finite numbers', () => {
    expect(getStripFiniteValues([1, 2, NaN, Infinity, -Infinity, 3])).toEqual([
      1, 2, 3,
    ]);
  });

  it('returns [] for non-array input', () => {
    expect(getStripFiniteValues(null as unknown as number[])).toEqual([]);
    expect(getStripFiniteValues(undefined as unknown as number[])).toEqual([]);
  });
});

describe('chart-strip / getStripBounds', () => {
  it('returns (0..1) for empty input', () => {
    expect(getStripBounds([])).toEqual({ min: 0, max: 1 });
  });

  it('returns min/max across visible groups', () => {
    const groups: ChartStripGroup[] = [
      { id: 'a', label: 'A', values: [1, 2, 3] },
      { id: 'b', label: 'B', values: [5, 9] },
    ];
    expect(getStripBounds(groups)).toEqual({ min: 1, max: 9 });
  });

  it('expands +/- 0.5 when collapsed', () => {
    const groups: ChartStripGroup[] = [
      { id: 'a', label: 'A', values: [5, 5, 5] },
    ];
    expect(getStripBounds(groups)).toEqual({ min: 4.5, max: 5.5 });
  });

  it('excludes hidden groups', () => {
    const groups: ChartStripGroup[] = [
      { id: 'a', label: 'A', values: [1] },
      { id: 'b', label: 'B', values: [100] },
    ];
    expect(getStripBounds(groups, ['b'])).toEqual({ min: 0.5, max: 1.5 });
  });

  it('drops non-finite values', () => {
    const groups: ChartStripGroup[] = [
      { id: 'a', label: 'A', values: [Infinity, 3, NaN, 7] },
    ];
    expect(getStripBounds(groups)).toEqual({ min: 3, max: 7 });
  });
});

describe('chart-strip / getStripTicks', () => {
  it('returns evenly-spaced ticks', () => {
    const ticks = getStripTicks(0, 10, 5);
    expect(ticks).toHaveLength(5);
    expect(ticks[0]!.value).toBe(0);
    expect(ticks[4]!.value).toBe(10);
    expect(ticks[4]!.position).toBeCloseTo(1, 10);
  });

  it('returns single tick for collapsed range', () => {
    expect(getStripTicks(5, 5, 4)).toEqual([{ value: 5, position: 0 }]);
  });

  it('returns [] for invalid range', () => {
    expect(getStripTicks(10, 5, 4)).toEqual([]);
    expect(getStripTicks(NaN, 5, 4)).toEqual([]);
  });

  it('respects custom tick counts', () => {
    expect(getStripTicks(0, 1, 3)).toHaveLength(3);
    expect(getStripTicks(0, 1, 2)).toHaveLength(2);
    expect(getStripTicks(0, 1, 1)).toHaveLength(2);
  });
});

describe('chart-strip / getStripJitter', () => {
  it('returns values in the [-1, 1] range', () => {
    for (let g = 0; g < 5; g += 1) {
      for (let i = 0; i < 100; i += 1) {
        const v = getStripJitter(1, g, i);
        expect(v).toBeGreaterThanOrEqual(-1);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('is deterministic for the same input', () => {
    const a = getStripJitter(7, 2, 3);
    const b = getStripJitter(7, 2, 3);
    expect(a).toBe(b);
  });

  it('varies across point indices', () => {
    const a = getStripJitter(1, 0, 0);
    const b = getStripJitter(1, 0, 1);
    expect(a).not.toBe(b);
  });
});

describe('chart-strip / computeStripLayout', () => {
  it('returns empty when innerWidth or innerHeight is non-positive', () => {
    const out = computeStripLayout({
      groups: [{ id: 'a', label: 'A', values: [1] }],
      width: 10,
      height: 10,
      padding: 100,
    });
    expect(out.groups).toEqual([]);
    expect(out.ticks).toEqual([]);
  });

  it('returns empty when no groups', () => {
    const out = computeStripLayout({
      groups: [],
      width: 500,
      height: 200,
      padding: 20,
    });
    expect(out.groups).toEqual([]);
  });

  it('returns empty when every group is hidden', () => {
    const out = computeStripLayout({
      groups: [{ id: 'a', label: 'A', values: [1, 2] }],
      hidden: ['a'],
      width: 500,
      height: 200,
      padding: 20,
    });
    expect(out.groups).toEqual([]);
  });

  it('lays points along the value axis (horizontal)', () => {
    const out = computeStripLayout({
      groups: [{ id: 'a', label: 'A', values: [0, 5, 10] }],
      orientation: 'horizontal',
      valueMin: 0,
      valueMax: 10,
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.orientation).toBe('horizontal');
    expect(out.groups).toHaveLength(1);
    const pts = out.groups[0]!.points;
    expect(pts).toHaveLength(3);
    expect(pts[0]!.x).toBeCloseTo(40, 5);
    expect(pts[2]!.x).toBeCloseTo(40 + (500 - 80), 5);
    expect(pts[0]!.y).toBeCloseTo(pts[2]!.y, 5);
  });

  it('inverts the value axis for vertical orientation', () => {
    const out = computeStripLayout({
      groups: [{ id: 'a', label: 'A', values: [0, 10] }],
      orientation: 'vertical',
      valueMin: 0,
      valueMax: 10,
      width: 200,
      height: 500,
      padding: 40,
    });
    const pts = out.groups[0]!.points;
    expect(pts[0]!.y).toBeGreaterThan(pts[1]!.y);
    expect(pts[0]!.x).toBeCloseTo(pts[1]!.x, 5);
  });

  it('clamps out-of-range values to the explicit min/max', () => {
    const out = computeStripLayout({
      groups: [{ id: 'a', label: 'A', values: [-100, 50, 200] }],
      valueMin: 0,
      valueMax: 100,
      width: 500,
      height: 200,
      padding: 40,
    });
    const pts = out.groups[0]!.points;
    expect(pts).toHaveLength(3);
    expect(pts[0]!.x).toBeCloseTo(40, 5);
    expect(pts[2]!.x).toBeCloseTo(40 + (500 - 80), 5);
  });

  it('drops non-finite values from layout points but keeps totalCount', () => {
    const out = computeStripLayout({
      groups: [{ id: 'a', label: 'A', values: [1, NaN, Infinity, 4] }],
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.groups[0]!.points).toHaveLength(2);
    expect(out.groups[0]!.finiteCount).toBe(2);
    expect(out.groups[0]!.totalCount).toBe(4);
  });

  it('places multiple groups on distinct lanes', () => {
    const out = computeStripLayout({
      groups: [
        { id: 'a', label: 'A', values: [1, 2] },
        { id: 'b', label: 'B', values: [1, 2] },
      ],
      orientation: 'horizontal',
      width: 500,
      height: 300,
      padding: 40,
    });
    expect(out.groups).toHaveLength(2);
    const laneA = out.groups[0]!.laneCenter;
    const laneB = out.groups[1]!.laneCenter;
    expect(laneA).not.toBeCloseTo(laneB, 1);
    expect(out.groups[0]!.points[0]!.y).toBeCloseTo(laneA, 5);
  });

  it('applies jitter when jitter > 0', () => {
    const out = computeStripLayout({
      groups: [{ id: 'a', label: 'A', values: [1, 1, 1, 1] }],
      jitter: 1,
      jitterSeed: 42,
      orientation: 'horizontal',
      width: 500,
      height: 300,
      padding: 40,
    });
    const ys = out.groups[0]!.points.map((p) => p.y);
    const distinct = new Set(ys);
    expect(distinct.size).toBeGreaterThan(1);
  });

  it('does not jitter when jitter = 0', () => {
    const out = computeStripLayout({
      groups: [{ id: 'a', label: 'A', values: [1, 1, 1] }],
      jitter: 0,
      width: 500,
      height: 300,
      padding: 40,
    });
    const ys = out.groups[0]!.points.map((p) => p.y);
    expect(new Set(ys).size).toBe(1);
  });

  it('jitter offsets stay within lane half-height', () => {
    const out = computeStripLayout({
      groups: [{ id: 'a', label: 'A', values: Array.from({ length: 20 }, () => 1) }],
      jitter: 1,
      jitterSeed: 9,
      width: 500,
      height: 300,
      padding: 40,
    });
    const laneHeight = out.laneHeight;
    for (const p of out.groups[0]!.points) {
      expect(Math.abs(p.jitterOffset)).toBeLessThanOrEqual(laneHeight / 2 + 1e-9);
    }
  });

  it('produces tick positions inside the canvas', () => {
    const out = computeStripLayout({
      groups: [{ id: 'a', label: 'A', values: [0, 10] }],
      width: 500,
      height: 300,
      padding: 40,
    });
    expect(out.ticks.length).toBeGreaterThan(0);
    for (const t of out.ticks) {
      expect(t.position).toBeGreaterThanOrEqual(40 - 1e-6);
      expect(t.position).toBeLessThanOrEqual(500 - 40 + 1e-6);
    }
  });
});

describe('chart-strip / describeStripChart', () => {
  it('returns "No data" when empty', () => {
    expect(describeStripChart([])).toBe('No data');
  });

  it('returns "No data" when no finite values', () => {
    expect(
      describeStripChart([
        { id: 'a', label: 'A', values: [Infinity, NaN] },
      ]),
    ).toBe('No data');
  });

  it('summarises N values across M groups with range', () => {
    const out = describeStripChart([
      { id: 'a', label: 'A', values: [1, 2, 3] },
      { id: 'b', label: 'B', values: [4, 5] },
    ]);
    expect(out).toContain('5 values');
    expect(out).toContain('2 groups');
    expect(out).toContain('1');
    expect(out).toContain('5');
  });

  it('excludes hidden groups from the summary', () => {
    const out = describeStripChart(
      [
        { id: 'a', label: 'A', values: [1, 2, 3] },
        { id: 'b', label: 'B', values: [100] },
      ],
      ['b'],
    );
    expect(out).toContain('3 values');
    expect(out).toContain('1 group');
  });

  it('respects custom formatter', () => {
    const out = describeStripChart(
      [{ id: 'a', label: 'A', values: [1.234, 9.876] }],
      [],
      (n) => n.toFixed(1),
    );
    expect(out).toContain('1.2');
    expect(out).toContain('9.9');
  });
});

const FIXTURE: ChartStripGroup[] = [
  { id: 'a', label: 'Group A', values: [1, 2, 3, 4] },
  { id: 'b', label: 'Group B', values: [5, 6, 7] },
];

describe('chart-strip / <ChartStrip>', () => {
  it('renders a root region with the default aria label', () => {
    render(<ChartStrip groups={FIXTURE} />);
    const root = document.querySelector('[data-section="chart-strip"]');
    expect(root).not.toBeNull();
    expect(root!.getAttribute('aria-label')).toBe('Strip plot');
  });

  it('exposes orientation + mark + jitter as data attrs', () => {
    render(
      <ChartStrip
        groups={FIXTURE}
        orientation="vertical"
        mark="dot"
        jitter={0.5}
      />,
    );
    const root = document.querySelector('[data-section="chart-strip"]')!;
    expect(root.getAttribute('data-orientation')).toBe('vertical');
    expect(root.getAttribute('data-mark')).toBe('dot');
    expect(root.getAttribute('data-jitter')).toBe('0.5');
  });

  it('renders an aria description span with summary text', () => {
    render(<ChartStrip groups={FIXTURE} />);
    const desc = document.querySelector('[data-section="chart-strip-aria-desc"]');
    expect(desc?.textContent ?? '').toContain('Strip plot of 7 values');
  });

  it('respects a custom aria description', () => {
    render(<ChartStrip groups={FIXTURE} ariaDescription="custom" />);
    const desc = document.querySelector('[data-section="chart-strip-aria-desc"]');
    expect(desc?.textContent).toBe('custom');
  });

  it('renders one mark per finite value', () => {
    render(<ChartStrip groups={FIXTURE} />);
    const marks = document.querySelectorAll('[data-section="chart-strip-mark"]');
    expect(marks.length).toBe(7);
  });

  it('uses circles when mark="dot"', () => {
    render(<ChartStrip groups={FIXTURE} mark="dot" />);
    const dots = document.querySelectorAll(
      '[data-section="chart-strip-mark"][data-mark-kind="dot"]',
    );
    expect(dots.length).toBe(7);
    expect(dots[0]!.tagName.toLowerCase()).toBe('circle');
  });

  it('uses lines when mark="tick"', () => {
    render(<ChartStrip groups={FIXTURE} mark="tick" />);
    const ticks = document.querySelectorAll(
      '[data-section="chart-strip-mark"][data-mark-kind="tick"]',
    );
    expect(ticks.length).toBe(7);
    expect(ticks[0]!.tagName.toLowerCase()).toBe('line');
  });

  it('renders a legend item per group', () => {
    render(<ChartStrip groups={FIXTURE} />);
    const items = document.querySelectorAll(
      '[data-section="chart-strip-legend-item"]',
    );
    expect(items.length).toBe(2);
  });

  it('toggles hidden state when legend button clicked (uncontrolled)', () => {
    render(<ChartStrip groups={FIXTURE} />);
    const btn = document.querySelector(
      '[data-section="chart-strip-legend-item"][data-group-id="a"] [data-section="chart-strip-legend-button"]',
    ) as HTMLElement;
    fireEvent.click(btn);
    const item = document.querySelector(
      '[data-section="chart-strip-legend-item"][data-group-id="a"]',
    )!;
    expect(item.getAttribute('data-hidden')).toBe('true');
  });

  it('does not mutate hiddenGroups when controlled', () => {
    const handler = vi.fn();
    render(
      <ChartStrip
        groups={FIXTURE}
        hiddenGroups={[]}
        onHiddenGroupsChange={handler}
      />,
    );
    const btn = document.querySelector(
      '[data-section="chart-strip-legend-item"][data-group-id="a"] [data-section="chart-strip-legend-button"]',
    ) as HTMLElement;
    fireEvent.click(btn);
    expect(handler).toHaveBeenCalledWith(['a']);
    const item = document.querySelector(
      '[data-section="chart-strip-legend-item"][data-group-id="a"]',
    )!;
    expect(item.getAttribute('data-hidden')).toBe('false');
  });

  it('fires onGroupToggle with the hidden flag', () => {
    const handler = vi.fn();
    render(<ChartStrip groups={FIXTURE} onGroupToggle={handler} />);
    const btn = document.querySelector(
      '[data-section="chart-strip-legend-item"][data-group-id="b"] [data-section="chart-strip-legend-button"]',
    ) as HTMLElement;
    fireEvent.click(btn);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0]!.hidden).toBe(true);
    expect(handler.mock.calls[0]![0]!.group.id).toBe('b');
  });

  it('respects defaultHiddenGroups on mount', () => {
    render(<ChartStrip groups={FIXTURE} defaultHiddenGroups={['a']} />);
    const item = document.querySelector(
      '[data-section="chart-strip-legend-item"][data-group-id="a"]',
    )!;
    expect(item.getAttribute('data-hidden')).toBe('true');
    const aMarks = document.querySelectorAll(
      '[data-section="chart-strip-mark"][data-group-id="a"]',
    );
    expect(aMarks.length).toBe(0);
  });

  it('shows tooltip on mark hover', () => {
    render(<ChartStrip groups={FIXTURE} />);
    const mark = document.querySelectorAll(
      '[data-section="chart-strip-mark"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(mark);
    const tip = document.querySelector('[data-section="chart-strip-tooltip"]');
    expect(tip).not.toBeNull();
    expect(tip!.textContent).toContain('Group A');
  });

  it('hides tooltip on mouse leave', () => {
    render(<ChartStrip groups={FIXTURE} />);
    const mark = document.querySelectorAll(
      '[data-section="chart-strip-mark"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(mark);
    fireEvent.mouseLeave(mark);
    const tip = document.querySelector('[data-section="chart-strip-tooltip"]');
    expect(tip).toBeNull();
  });

  it('fires onPointClick with group + point', () => {
    const handler = vi.fn();
    render(<ChartStrip groups={FIXTURE} onPointClick={handler} />);
    const mark = document.querySelectorAll(
      '[data-section="chart-strip-mark"]',
    )[0] as SVGElement;
    fireEvent.click(mark);
    expect(handler).toHaveBeenCalledTimes(1);
    const arg = handler.mock.calls[0]![0]!;
    expect(arg.group.id).toBe('a');
    expect(typeof arg.point.value).toBe('number');
  });

  it('hides axis ticks when showAxis=false', () => {
    render(<ChartStrip groups={FIXTURE} showAxis={false} />);
    expect(document.querySelector('[data-section="chart-strip-axes"]')).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    render(<ChartStrip groups={FIXTURE} showGrid={false} />);
    expect(document.querySelector('[data-section="chart-strip-grid"]')).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    render(<ChartStrip groups={FIXTURE} showLegend={false} />);
    expect(document.querySelector('[data-section="chart-strip-legend"]')).toBeNull();
  });

  it('hides lane labels when showLaneLabels=false', () => {
    render(<ChartStrip groups={FIXTURE} showLaneLabels={false} />);
    expect(
      document.querySelector('[data-section="chart-strip-lane-labels"]'),
    ).toBeNull();
  });

  it('hides tooltip when showTooltip=false', () => {
    render(<ChartStrip groups={FIXTURE} showTooltip={false} />);
    const mark = document.querySelectorAll(
      '[data-section="chart-strip-mark"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(mark);
    expect(document.querySelector('[data-section="chart-strip-tooltip"]')).toBeNull();
  });

  it('applies the animate flag to the data attribute', () => {
    render(<ChartStrip groups={FIXTURE} animate={false} />);
    const root = document.querySelector('[data-section="chart-strip"]')!;
    expect(root.getAttribute('data-animate')).toBe('false');
  });

  it('renders the optional value label', () => {
    render(<ChartStrip groups={FIXTURE} valueLabel="dB" />);
    const lbl = document.querySelector('[data-section="chart-strip-value-label"]');
    expect(lbl?.textContent).toBe('dB');
  });

  it('uses formatValue for axis labels', () => {
    render(<ChartStrip groups={FIXTURE} formatValue={(n) => `v${n}`} />);
    const t = document.querySelector('[data-section="chart-strip-tick-label"]');
    expect(t?.textContent?.startsWith('v')).toBe(true);
  });

  it('uses formatGroup for tooltip header', () => {
    render(
      <ChartStrip groups={FIXTURE} formatGroup={(g) => `${g.label}!`} />,
    );
    const mark = document.querySelectorAll(
      '[data-section="chart-strip-mark"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(mark);
    const tip = document.querySelector('[data-section="chart-strip-tooltip-label"]');
    expect(tip?.textContent).toBe('Group A!');
  });

  it('overrides default colour via group.color', () => {
    render(
      <ChartStrip
        groups={[
          { id: 'a', label: 'A', values: [1], color: '#abcdef' },
        ]}
      />,
    );
    const grp = document.querySelector('[data-section="chart-strip-group"]')!;
    expect(grp.getAttribute('data-group-color')).toBe('#abcdef');
  });

  it('exposes mark data attrs (value, index, jitter offset)', () => {
    render(<ChartStrip groups={FIXTURE} jitter={1} jitterSeed={5} />);
    const mark = document.querySelectorAll(
      '[data-section="chart-strip-mark"]',
    )[0] as SVGElement;
    expect(mark.getAttribute('data-value')).toBe('1');
    expect(mark.getAttribute('data-point-index')).toBe('0');
    expect(mark.hasAttribute('data-jitter-offset')).toBe(true);
  });

  it('renders empty state when no groups', () => {
    render(<ChartStrip groups={[]} />);
    const desc = document.querySelector('[data-section="chart-strip-aria-desc"]');
    expect(desc?.textContent).toBe('No data');
    expect(
      document.querySelectorAll('[data-section="chart-strip-mark"]').length,
    ).toBe(0);
  });

  it('renders lane labels when enabled (default)', () => {
    render(<ChartStrip groups={FIXTURE} />);
    const labels = document.querySelectorAll(
      '[data-section="chart-strip-lane-label"]',
    );
    expect(labels.length).toBe(2);
    expect(labels[0]?.textContent).toBe('Group A');
  });

  it('renders per-mark aria-label with group and value', () => {
    render(<ChartStrip groups={FIXTURE} />);
    const mark = document.querySelectorAll(
      '[data-section="chart-strip-mark"]',
    )[0] as SVGElement;
    expect(mark.getAttribute('aria-label')).toContain('Group A');
    expect(mark.getAttribute('aria-label')).toContain('1');
  });

  it('keyboard focus opens the tooltip', () => {
    render(<ChartStrip groups={FIXTURE} />);
    const mark = document.querySelectorAll(
      '[data-section="chart-strip-mark"]',
    )[0] as SVGElement;
    fireEvent.focus(mark);
    expect(
      document.querySelector('[data-section="chart-strip-tooltip"]'),
    ).not.toBeNull();
  });

  it('keyboard blur closes the tooltip', () => {
    render(<ChartStrip groups={FIXTURE} />);
    const mark = document.querySelectorAll(
      '[data-section="chart-strip-mark"]',
    )[0] as SVGElement;
    fireEvent.focus(mark);
    fireEvent.blur(mark);
    expect(
      document.querySelector('[data-section="chart-strip-tooltip"]'),
    ).toBeNull();
  });

  it('sets data-hovered on the hovered mark', () => {
    render(<ChartStrip groups={FIXTURE} />);
    const mark = document.querySelectorAll(
      '[data-section="chart-strip-mark"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(mark);
    expect(mark.getAttribute('data-hovered')).toBe('true');
  });

  it('renders grid lines per tick when showGrid=true', () => {
    render(<ChartStrip groups={FIXTURE} tickCount={4} />);
    const lines = document.querySelectorAll(
      '[data-section="chart-strip-grid-line"]',
    );
    expect(lines.length).toBeGreaterThanOrEqual(2);
  });
});
