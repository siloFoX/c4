import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

import {
  ChartBeeswarm,
  DEFAULT_CHART_BEESWARM_WIDTH,
  DEFAULT_CHART_BEESWARM_HEIGHT,
  DEFAULT_CHART_BEESWARM_PADDING,
  DEFAULT_CHART_BEESWARM_LANE_GAP,
  DEFAULT_CHART_BEESWARM_TICK_COUNT,
  DEFAULT_CHART_BEESWARM_RADIUS,
  DEFAULT_CHART_BEESWARM_GAP,
  DEFAULT_CHART_BEESWARM_OPACITY,
  DEFAULT_CHART_BEESWARM_STROKE_WIDTH,
  DEFAULT_CHART_BEESWARM_GRID_COLOR,
  DEFAULT_CHART_BEESWARM_AXIS_COLOR,
  DEFAULT_CHART_BEESWARM_ORIENTATION,
  DEFAULT_CHART_BEESWARM_PALETTE,
  computeBeeswarmLayout,
  describeBeeswarmChart,
  getBeeswarmBounds,
  getBeeswarmDefaultColor,
  getBeeswarmFiniteValues,
  getBeeswarmTicks,
  packBeeswarmGroup,
  type ChartBeeswarmGroup,
  type BeeswarmPackInput,
} from './chart-beeswarm';

afterEach(() => {
  cleanup();
});

describe('chart-beeswarm / constants', () => {
  it('exports sensible defaults', () => {
    expect(DEFAULT_CHART_BEESWARM_WIDTH).toBe(560);
    expect(DEFAULT_CHART_BEESWARM_HEIGHT).toBe(320);
    expect(DEFAULT_CHART_BEESWARM_PADDING).toBe(40);
    expect(DEFAULT_CHART_BEESWARM_LANE_GAP).toBe(16);
    expect(DEFAULT_CHART_BEESWARM_TICK_COUNT).toBe(5);
    expect(DEFAULT_CHART_BEESWARM_RADIUS).toBe(3);
    expect(DEFAULT_CHART_BEESWARM_GAP).toBe(1);
    expect(DEFAULT_CHART_BEESWARM_OPACITY).toBeGreaterThan(0);
    expect(DEFAULT_CHART_BEESWARM_OPACITY).toBeLessThanOrEqual(1);
    expect(DEFAULT_CHART_BEESWARM_STROKE_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_BEESWARM_GRID_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_BEESWARM_AXIS_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_BEESWARM_ORIENTATION).toBe('horizontal');
    expect(DEFAULT_CHART_BEESWARM_PALETTE).toHaveLength(10);
  });
});

describe('chart-beeswarm / getBeeswarmDefaultColor', () => {
  it('returns a palette colour and wraps with modulo', () => {
    expect(getBeeswarmDefaultColor(0)).toBe(DEFAULT_CHART_BEESWARM_PALETTE[0]);
    expect(getBeeswarmDefaultColor(1)).toBe(DEFAULT_CHART_BEESWARM_PALETTE[1]);
    expect(getBeeswarmDefaultColor(10)).toBe(DEFAULT_CHART_BEESWARM_PALETTE[0]);
  });

  it('falls back to first colour for invalid indices', () => {
    expect(getBeeswarmDefaultColor(-1)).toBe(DEFAULT_CHART_BEESWARM_PALETTE[0]);
    expect(getBeeswarmDefaultColor(NaN)).toBe(DEFAULT_CHART_BEESWARM_PALETTE[0]);
  });
});

describe('chart-beeswarm / getBeeswarmFiniteValues', () => {
  it('keeps only finite numbers', () => {
    expect(getBeeswarmFiniteValues([1, NaN, Infinity, -Infinity, 2])).toEqual([
      1, 2,
    ]);
  });

  it('returns [] for non-array input', () => {
    expect(getBeeswarmFiniteValues(null as unknown as number[])).toEqual([]);
  });
});

describe('chart-beeswarm / getBeeswarmBounds', () => {
  it('returns (0..1) for empty input', () => {
    expect(getBeeswarmBounds([])).toEqual({ min: 0, max: 1 });
  });

  it('returns min/max across visible groups', () => {
    const groups: ChartBeeswarmGroup[] = [
      { id: 'a', label: 'A', values: [1, 2, 3] },
      { id: 'b', label: 'B', values: [10, 20] },
    ];
    expect(getBeeswarmBounds(groups)).toEqual({ min: 1, max: 20 });
  });

  it('expands +/- 0.5 when collapsed', () => {
    expect(
      getBeeswarmBounds([{ id: 'a', label: 'A', values: [7, 7, 7] }]),
    ).toEqual({ min: 6.5, max: 7.5 });
  });

  it('excludes hidden groups', () => {
    const groups: ChartBeeswarmGroup[] = [
      { id: 'a', label: 'A', values: [1] },
      { id: 'b', label: 'B', values: [100] },
    ];
    expect(getBeeswarmBounds(groups, ['b'])).toEqual({ min: 0.5, max: 1.5 });
  });
});

describe('chart-beeswarm / getBeeswarmTicks', () => {
  it('returns evenly-spaced ticks', () => {
    const ticks = getBeeswarmTicks(0, 100, 5);
    expect(ticks).toHaveLength(5);
    expect(ticks[0]!.value).toBe(0);
    expect(ticks[4]!.value).toBe(100);
    expect(ticks[4]!.position).toBeCloseTo(1, 10);
  });

  it('returns single tick for collapsed range', () => {
    expect(getBeeswarmTicks(5, 5, 5)).toEqual([{ value: 5, position: 0 }]);
  });

  it('returns [] for invalid range', () => {
    expect(getBeeswarmTicks(10, 5, 5)).toEqual([]);
    expect(getBeeswarmTicks(NaN, 1, 5)).toEqual([]);
  });
});

describe('chart-beeswarm / packBeeswarmGroup', () => {
  function minSeparation(
    placed: ReadonlyArray<{ along: number; across: number }>,
  ): number {
    let minDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < placed.length; i += 1) {
      for (let j = i + 1; j < placed.length; j += 1) {
        const dx = placed[i]!.along - placed[j]!.along;
        const dy = placed[i]!.across - placed[j]!.across;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < minDist) minDist = d;
      }
    }
    return minDist;
  }

  it('places a single point at lane center', () => {
    const out = packBeeswarmGroup(
      [{ index: 0, value: 5, along: 100 }],
      50,
      3,
      1,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.across).toBe(50);
  });

  it('keeps two well-separated points at lane center', () => {
    const out = packBeeswarmGroup(
      [
        { index: 0, value: 1, along: 100 },
        { index: 1, value: 10, along: 200 },
      ],
      50,
      3,
      1,
    );
    expect(out[0]!.across).toBe(50);
    expect(out[1]!.across).toBe(50);
  });

  it('displaces overlapping points to keep spacing', () => {
    const radius = 3;
    const gap = 1;
    const out = packBeeswarmGroup(
      [
        { index: 0, value: 1, along: 100 },
        { index: 1, value: 1, along: 100 },
        { index: 2, value: 1, along: 100 },
      ],
      50,
      radius,
      gap,
    );
    expect(out).toHaveLength(3);
    const sep = minSeparation(out);
    expect(sep).toBeGreaterThanOrEqual(2 * radius + gap - 1e-6);
  });

  it('returns deterministic output for repeated calls', () => {
    const items: BeeswarmPackInput[] = Array.from({ length: 20 }, (_, i) => ({
      index: i,
      value: i,
      along: 100 + (i % 3),
    }));
    const a = packBeeswarmGroup(items, 50, 4, 1);
    const b = packBeeswarmGroup(items, 50, 4, 1);
    for (let i = 0; i < a.length; i += 1) {
      expect(a[i]!.across).toBe(b[i]!.across);
    }
  });

  it('respects minimum separation under heavy collisions', () => {
    const items: BeeswarmPackInput[] = Array.from({ length: 60 }, (_, i) => ({
      index: i,
      value: i,
      along: 100 + (i % 5),
    }));
    const radius = 4;
    const gap = 2;
    const out = packBeeswarmGroup(items, 80, radius, gap);
    expect(out).toHaveLength(60);
    const sep = minSeparation(out);
    expect(sep).toBeGreaterThanOrEqual(2 * radius + gap - 1e-6);
  });

  it('returns inputs unchanged when spacing is zero', () => {
    const out = packBeeswarmGroup(
      [
        { index: 0, value: 1, along: 100 },
        { index: 1, value: 1, along: 100 },
      ],
      50,
      0,
      0,
    );
    expect(out[0]!.across).toBe(50);
    expect(out[1]!.across).toBe(50);
  });

  it('returns output sorted by original index', () => {
    const items: BeeswarmPackInput[] = [
      { index: 2, value: 1, along: 100 },
      { index: 0, value: 2, along: 105 },
      { index: 1, value: 3, along: 110 },
    ];
    const out = packBeeswarmGroup(items, 50, 4, 1);
    expect(out.map((p) => p.index)).toEqual([0, 1, 2]);
  });

  it('balances offsets symmetrically when possible', () => {
    const items: BeeswarmPackInput[] = [
      { index: 0, value: 1, along: 100 },
      { index: 1, value: 1, along: 100 },
      { index: 2, value: 1, along: 100 },
    ];
    const out = packBeeswarmGroup(items, 50, 3, 1);
    const offsets = out.map((p) => p.across - 50);
    expect(offsets[0]).toBe(0);
    const off1 = offsets[1]!;
    const off2 = offsets[2]!;
    expect(off1 !== 0 && off2 !== 0).toBe(true);
    expect(Math.sign(off1)).not.toBe(Math.sign(off2));
  });
});

describe('chart-beeswarm / computeBeeswarmLayout', () => {
  it('returns empty when canvas is degenerate', () => {
    const out = computeBeeswarmLayout({
      groups: [{ id: 'a', label: 'A', values: [1] }],
      width: 10,
      height: 10,
      padding: 100,
    });
    expect(out.groups).toEqual([]);
  });

  it('returns empty when no groups', () => {
    expect(
      computeBeeswarmLayout({
        groups: [],
        width: 500,
        height: 200,
        padding: 20,
      }).groups,
    ).toEqual([]);
  });

  it('returns empty when every group is hidden', () => {
    expect(
      computeBeeswarmLayout({
        groups: [{ id: 'a', label: 'A', values: [1, 2] }],
        hidden: ['a'],
        width: 500,
        height: 200,
        padding: 20,
      }).groups,
    ).toEqual([]);
  });

  it('places points along the value axis (horizontal)', () => {
    const out = computeBeeswarmLayout({
      groups: [{ id: 'a', label: 'A', values: [0, 5, 10] }],
      orientation: 'horizontal',
      valueMin: 0,
      valueMax: 10,
      width: 500,
      height: 200,
      padding: 40,
      radius: 3,
      gap: 1,
    });
    const pts = out.groups[0]!.points;
    expect(pts).toHaveLength(3);
    expect(pts[0]!.x).toBeCloseTo(40, 5);
    expect(pts[2]!.x).toBeCloseTo(40 + (500 - 80), 5);
  });

  it('inverts the value axis for vertical orientation', () => {
    const out = computeBeeswarmLayout({
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
  });

  it('clamps out-of-range values to range endpoints', () => {
    const out = computeBeeswarmLayout({
      groups: [{ id: 'a', label: 'A', values: [-100, 50, 200] }],
      valueMin: 0,
      valueMax: 100,
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.groups[0]!.points).toHaveLength(3);
  });

  it('drops non-finite values from layout points', () => {
    const out = computeBeeswarmLayout({
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
    const out = computeBeeswarmLayout({
      groups: [
        { id: 'a', label: 'A', values: [1, 2] },
        { id: 'b', label: 'B', values: [1, 2] },
      ],
      width: 500,
      height: 300,
      padding: 40,
    });
    const laneA = out.groups[0]!.laneCenter;
    const laneB = out.groups[1]!.laneCenter;
    expect(laneA).not.toBeCloseTo(laneB, 1);
  });

  it('guarantees non-overlap among packed points', () => {
    const values = Array.from({ length: 40 }, () => 5 + Math.random() * 0.1);
    const out = computeBeeswarmLayout({
      groups: [{ id: 'a', label: 'A', values }],
      width: 600,
      height: 320,
      padding: 40,
      radius: 5,
      gap: 1,
    });
    const pts = out.groups[0]!.points;
    const spacing = 2 * 5 + 1;
    for (let i = 0; i < pts.length; i += 1) {
      for (let j = i + 1; j < pts.length; j += 1) {
        const dx = pts[i]!.along - pts[j]!.along;
        const dy = pts[i]!.across - pts[j]!.across;
        const d2 = dx * dx + dy * dy;
        expect(d2).toBeGreaterThanOrEqual(spacing * spacing - 1e-6);
      }
    }
  });

  it('records swarmExtent based on across spread', () => {
    const out = computeBeeswarmLayout({
      groups: [{ id: 'a', label: 'A', values: [1, 1, 1, 1] }],
      width: 600,
      height: 320,
      padding: 40,
      radius: 5,
      gap: 1,
    });
    expect(out.groups[0]!.swarmExtent).toBeGreaterThan(0);
  });

  it('produces tick positions inside the canvas', () => {
    const out = computeBeeswarmLayout({
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

describe('chart-beeswarm / describeBeeswarmChart', () => {
  it('returns "No data" when empty', () => {
    expect(describeBeeswarmChart([])).toBe('No data');
  });

  it('returns "No data" when no finite values', () => {
    expect(
      describeBeeswarmChart([
        { id: 'a', label: 'A', values: [NaN, Infinity] },
      ]),
    ).toBe('No data');
  });

  it('summarises N values across M groups with range', () => {
    const out = describeBeeswarmChart([
      { id: 'a', label: 'A', values: [1, 2, 3] },
      { id: 'b', label: 'B', values: [4, 5] },
    ]);
    expect(out).toContain('5 values');
    expect(out).toContain('2 groups');
    expect(out).toContain('1');
    expect(out).toContain('5');
  });

  it('excludes hidden groups from the summary', () => {
    const out = describeBeeswarmChart(
      [
        { id: 'a', label: 'A', values: [1, 2] },
        { id: 'b', label: 'B', values: [100] },
      ],
      ['b'],
    );
    expect(out).toContain('2 values');
    expect(out).toContain('1 group');
  });
});

const FIXTURE: ChartBeeswarmGroup[] = [
  { id: 'a', label: 'Group A', values: [1, 2, 3, 4] },
  { id: 'b', label: 'Group B', values: [5, 6, 7] },
];

describe('chart-beeswarm / <ChartBeeswarm>', () => {
  it('renders a root region with the default aria label', () => {
    render(<ChartBeeswarm groups={FIXTURE} />);
    const root = document.querySelector('[data-section="chart-beeswarm"]')!;
    expect(root.getAttribute('aria-label')).toBe('Beeswarm plot');
  });

  it('exposes orientation + radius + gap as data attrs', () => {
    render(
      <ChartBeeswarm groups={FIXTURE} orientation="vertical" radius={5} gap={2} />,
    );
    const root = document.querySelector('[data-section="chart-beeswarm"]')!;
    expect(root.getAttribute('data-orientation')).toBe('vertical');
    expect(root.getAttribute('data-radius')).toBe('5');
    expect(root.getAttribute('data-gap')).toBe('2');
  });

  it('renders an aria description with summary', () => {
    render(<ChartBeeswarm groups={FIXTURE} />);
    const desc = document.querySelector(
      '[data-section="chart-beeswarm-aria-desc"]',
    );
    expect(desc?.textContent ?? '').toContain('Beeswarm plot of 7 values');
  });

  it('respects a custom aria description', () => {
    render(<ChartBeeswarm groups={FIXTURE} ariaDescription="custom" />);
    expect(
      document.querySelector('[data-section="chart-beeswarm-aria-desc"]')
        ?.textContent,
    ).toBe('custom');
  });

  it('renders one circle mark per finite value', () => {
    render(<ChartBeeswarm groups={FIXTURE} />);
    const marks = document.querySelectorAll(
      '[data-section="chart-beeswarm-mark"]',
    );
    expect(marks.length).toBe(7);
    expect(marks[0]!.tagName.toLowerCase()).toBe('circle');
  });

  it('renders a legend item per group', () => {
    render(<ChartBeeswarm groups={FIXTURE} />);
    const items = document.querySelectorAll(
      '[data-section="chart-beeswarm-legend-item"]',
    );
    expect(items.length).toBe(2);
  });

  it('toggles hidden state via legend click (uncontrolled)', () => {
    render(<ChartBeeswarm groups={FIXTURE} />);
    const btn = document.querySelector(
      '[data-section="chart-beeswarm-legend-item"][data-group-id="a"] [data-section="chart-beeswarm-legend-button"]',
    ) as HTMLElement;
    fireEvent.click(btn);
    const item = document.querySelector(
      '[data-section="chart-beeswarm-legend-item"][data-group-id="a"]',
    )!;
    expect(item.getAttribute('data-hidden')).toBe('true');
  });

  it('does not mutate hiddenGroups when controlled', () => {
    const handler = vi.fn();
    render(
      <ChartBeeswarm
        groups={FIXTURE}
        hiddenGroups={[]}
        onHiddenGroupsChange={handler}
      />,
    );
    const btn = document.querySelector(
      '[data-section="chart-beeswarm-legend-item"][data-group-id="a"] [data-section="chart-beeswarm-legend-button"]',
    ) as HTMLElement;
    fireEvent.click(btn);
    expect(handler).toHaveBeenCalledWith(['a']);
  });

  it('fires onGroupToggle with the hidden flag', () => {
    const handler = vi.fn();
    render(<ChartBeeswarm groups={FIXTURE} onGroupToggle={handler} />);
    const btn = document.querySelector(
      '[data-section="chart-beeswarm-legend-item"][data-group-id="b"] [data-section="chart-beeswarm-legend-button"]',
    ) as HTMLElement;
    fireEvent.click(btn);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0]!.hidden).toBe(true);
    expect(handler.mock.calls[0]![0]!.group.id).toBe('b');
  });

  it('respects defaultHiddenGroups on mount', () => {
    render(<ChartBeeswarm groups={FIXTURE} defaultHiddenGroups={['a']} />);
    const item = document.querySelector(
      '[data-section="chart-beeswarm-legend-item"][data-group-id="a"]',
    )!;
    expect(item.getAttribute('data-hidden')).toBe('true');
    const aMarks = document.querySelectorAll(
      '[data-section="chart-beeswarm-mark"][data-group-id="a"]',
    );
    expect(aMarks.length).toBe(0);
  });

  it('shows tooltip on mark hover', () => {
    render(<ChartBeeswarm groups={FIXTURE} />);
    const mark = document.querySelectorAll(
      '[data-section="chart-beeswarm-mark"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(mark);
    const tip = document.querySelector(
      '[data-section="chart-beeswarm-tooltip"]',
    );
    expect(tip).not.toBeNull();
    expect(tip!.textContent).toContain('Group A');
  });

  it('hides tooltip on mouse leave', () => {
    render(<ChartBeeswarm groups={FIXTURE} />);
    const mark = document.querySelectorAll(
      '[data-section="chart-beeswarm-mark"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(mark);
    fireEvent.mouseLeave(mark);
    expect(
      document.querySelector('[data-section="chart-beeswarm-tooltip"]'),
    ).toBeNull();
  });

  it('fires onPointClick with group + point', () => {
    const handler = vi.fn();
    render(<ChartBeeswarm groups={FIXTURE} onPointClick={handler} />);
    const mark = document.querySelectorAll(
      '[data-section="chart-beeswarm-mark"]',
    )[0] as SVGElement;
    fireEvent.click(mark);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0]!.group.id).toBe('a');
    expect(typeof handler.mock.calls[0]![0]!.point.value).toBe('number');
  });

  it('hides axis ticks when showAxis=false', () => {
    render(<ChartBeeswarm groups={FIXTURE} showAxis={false} />);
    expect(
      document.querySelector('[data-section="chart-beeswarm-axes"]'),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    render(<ChartBeeswarm groups={FIXTURE} showGrid={false} />);
    expect(
      document.querySelector('[data-section="chart-beeswarm-grid"]'),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    render(<ChartBeeswarm groups={FIXTURE} showLegend={false} />);
    expect(
      document.querySelector('[data-section="chart-beeswarm-legend"]'),
    ).toBeNull();
  });

  it('hides lane labels when showLaneLabels=false', () => {
    render(<ChartBeeswarm groups={FIXTURE} showLaneLabels={false} />);
    expect(
      document.querySelector('[data-section="chart-beeswarm-lane-labels"]'),
    ).toBeNull();
  });

  it('hides tooltip when showTooltip=false', () => {
    render(<ChartBeeswarm groups={FIXTURE} showTooltip={false} />);
    const mark = document.querySelectorAll(
      '[data-section="chart-beeswarm-mark"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(mark);
    expect(
      document.querySelector('[data-section="chart-beeswarm-tooltip"]'),
    ).toBeNull();
  });

  it('applies the animate flag to the data attribute', () => {
    render(<ChartBeeswarm groups={FIXTURE} animate={false} />);
    const root = document.querySelector('[data-section="chart-beeswarm"]')!;
    expect(root.getAttribute('data-animate')).toBe('false');
  });

  it('renders the optional value label', () => {
    render(<ChartBeeswarm groups={FIXTURE} valueLabel="ms" />);
    const lbl = document.querySelector(
      '[data-section="chart-beeswarm-value-label"]',
    );
    expect(lbl?.textContent).toBe('ms');
  });

  it('uses formatValue for axis labels', () => {
    render(<ChartBeeswarm groups={FIXTURE} formatValue={(n) => `v${n}`} />);
    const t = document.querySelector(
      '[data-section="chart-beeswarm-tick-label"]',
    );
    expect(t?.textContent?.startsWith('v')).toBe(true);
  });

  it('uses formatGroup for tooltip header', () => {
    render(
      <ChartBeeswarm groups={FIXTURE} formatGroup={(g) => `${g.label}!`} />,
    );
    const mark = document.querySelectorAll(
      '[data-section="chart-beeswarm-mark"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(mark);
    const tip = document.querySelector(
      '[data-section="chart-beeswarm-tooltip-label"]',
    );
    expect(tip?.textContent).toBe('Group A!');
  });

  it('overrides default colour via group.color', () => {
    render(
      <ChartBeeswarm
        groups={[{ id: 'a', label: 'A', values: [1], color: '#abcdef' }]}
      />,
    );
    const grp = document.querySelector(
      '[data-section="chart-beeswarm-group"]',
    )!;
    expect(grp.getAttribute('data-group-color')).toBe('#abcdef');
  });

  it('exposes mark data attrs (value, along, across)', () => {
    render(<ChartBeeswarm groups={FIXTURE} />);
    const mark = document.querySelectorAll(
      '[data-section="chart-beeswarm-mark"]',
    )[0] as SVGElement;
    expect(mark.hasAttribute('data-value')).toBe(true);
    expect(mark.hasAttribute('data-along')).toBe(true);
    expect(mark.hasAttribute('data-across')).toBe(true);
  });

  it('renders empty state when no groups', () => {
    render(<ChartBeeswarm groups={[]} />);
    const desc = document.querySelector(
      '[data-section="chart-beeswarm-aria-desc"]',
    );
    expect(desc?.textContent).toBe('No data');
    expect(
      document.querySelectorAll('[data-section="chart-beeswarm-mark"]').length,
    ).toBe(0);
  });

  it('renders lane labels when enabled (default)', () => {
    render(<ChartBeeswarm groups={FIXTURE} />);
    const labels = document.querySelectorAll(
      '[data-section="chart-beeswarm-lane-label"]',
    );
    expect(labels.length).toBe(2);
    expect(labels[0]?.textContent).toBe('Group A');
  });

  it('renders per-mark aria-label with group and value', () => {
    render(<ChartBeeswarm groups={FIXTURE} />);
    const mark = document.querySelectorAll(
      '[data-section="chart-beeswarm-mark"]',
    )[0] as SVGElement;
    expect(mark.getAttribute('aria-label')).toContain('Group A');
    expect(mark.getAttribute('aria-label')).toContain('1');
  });

  it('keyboard focus opens the tooltip', () => {
    render(<ChartBeeswarm groups={FIXTURE} />);
    const mark = document.querySelectorAll(
      '[data-section="chart-beeswarm-mark"]',
    )[0] as SVGElement;
    fireEvent.focus(mark);
    expect(
      document.querySelector('[data-section="chart-beeswarm-tooltip"]'),
    ).not.toBeNull();
  });

  it('keyboard blur closes the tooltip', () => {
    render(<ChartBeeswarm groups={FIXTURE} />);
    const mark = document.querySelectorAll(
      '[data-section="chart-beeswarm-mark"]',
    )[0] as SVGElement;
    fireEvent.focus(mark);
    fireEvent.blur(mark);
    expect(
      document.querySelector('[data-section="chart-beeswarm-tooltip"]'),
    ).toBeNull();
  });

  it('sets data-hovered on the hovered mark', () => {
    render(<ChartBeeswarm groups={FIXTURE} />);
    const mark = document.querySelectorAll(
      '[data-section="chart-beeswarm-mark"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(mark);
    expect(mark.getAttribute('data-hovered')).toBe('true');
  });

  it('renders grid lines per tick when showGrid=true', () => {
    render(<ChartBeeswarm groups={FIXTURE} tickCount={4} />);
    const lines = document.querySelectorAll(
      '[data-section="chart-beeswarm-grid-line"]',
    );
    expect(lines.length).toBeGreaterThanOrEqual(2);
  });

  it('handles dash-containing group ids in the tooltip', () => {
    const groups: ChartBeeswarmGroup[] = [
      { id: 'group-a-b', label: 'Hyphenated', values: [1, 2, 3] },
    ];
    render(<ChartBeeswarm groups={groups} />);
    const mark = document.querySelector(
      '[data-section="chart-beeswarm-mark"]',
    ) as SVGElement;
    fireEvent.mouseEnter(mark);
    const tip = document.querySelector(
      '[data-section="chart-beeswarm-tooltip"]',
    );
    expect(tip).not.toBeNull();
    expect(tip!.textContent).toContain('Hyphenated');
  });
});
