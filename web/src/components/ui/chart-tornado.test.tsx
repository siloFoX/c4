import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

import {
  ChartTornado,
  DEFAULT_CHART_TORNADO_WIDTH,
  DEFAULT_CHART_TORNADO_HEIGHT,
  DEFAULT_CHART_TORNADO_PADDING,
  DEFAULT_CHART_TORNADO_CENTER_GAP,
  DEFAULT_CHART_TORNADO_TICK_COUNT,
  DEFAULT_CHART_TORNADO_BAND_GAP,
  DEFAULT_CHART_TORNADO_BAR_OPACITY,
  DEFAULT_CHART_TORNADO_GRID_COLOR,
  DEFAULT_CHART_TORNADO_AXIS_COLOR,
  DEFAULT_CHART_TORNADO_CENTER_LINE_COLOR,
  DEFAULT_CHART_TORNADO_LEFT_COLOR,
  DEFAULT_CHART_TORNADO_RIGHT_COLOR,
  DEFAULT_CHART_TORNADO_ORIENTATION,
  DEFAULT_CHART_TORNADO_SCALE_MODE,
  computeTornadoLayout,
  describeTornadoChart,
  getTornadoFiniteItems,
  getTornadoMaxValue,
  getTornadoTicks,
  sortTornadoItems,
  type ChartTornadoItem,
} from './chart-tornado';

afterEach(() => {
  cleanup();
});

describe('chart-tornado / constants', () => {
  it('exports sensible defaults', () => {
    expect(DEFAULT_CHART_TORNADO_WIDTH).toBe(560);
    expect(DEFAULT_CHART_TORNADO_HEIGHT).toBe(360);
    expect(DEFAULT_CHART_TORNADO_PADDING).toBe(48);
    expect(DEFAULT_CHART_TORNADO_CENTER_GAP).toBe(4);
    expect(DEFAULT_CHART_TORNADO_TICK_COUNT).toBe(5);
    expect(DEFAULT_CHART_TORNADO_BAND_GAP).toBe(4);
    expect(DEFAULT_CHART_TORNADO_BAR_OPACITY).toBeGreaterThan(0);
    expect(DEFAULT_CHART_TORNADO_BAR_OPACITY).toBeLessThanOrEqual(1);
    expect(DEFAULT_CHART_TORNADO_GRID_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_TORNADO_AXIS_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_TORNADO_CENTER_LINE_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_TORNADO_LEFT_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_TORNADO_RIGHT_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_TORNADO_ORIENTATION).toBe('horizontal');
    expect(DEFAULT_CHART_TORNADO_SCALE_MODE).toBe('shared');
  });
});

describe('chart-tornado / getTornadoFiniteItems', () => {
  it('drops items with non-finite left or right', () => {
    const items: ChartTornadoItem[] = [
      { id: 'a', label: 'A', left: 1, right: 5 },
      { id: 'b', label: 'B', left: NaN, right: 5 },
      { id: 'c', label: 'C', left: 1, right: Infinity },
      { id: 'd', label: 'D', left: 2, right: 6 },
    ];
    const out = getTornadoFiniteItems(items);
    expect(out.map((x) => x.id)).toEqual(['a', 'd']);
  });

  it('drops items with non-string ids', () => {
    const items = [
      { id: 'a', label: 'A', left: 1, right: 2 },
      { id: 5 as unknown as string, label: 'B', left: 1, right: 2 },
    ];
    expect(getTornadoFiniteItems(items)).toHaveLength(1);
  });

  it('returns [] for non-array input', () => {
    expect(
      getTornadoFiniteItems(null as unknown as ChartTornadoItem[]),
    ).toEqual([]);
  });
});

describe('chart-tornado / getTornadoMaxValue', () => {
  it('returns the max across both sides in shared mode', () => {
    expect(
      getTornadoMaxValue(
        [
          { id: 'a', label: 'A', left: 10, right: 5 },
          { id: 'b', label: 'B', left: 3, right: 20 },
        ],
        'left',
        'shared',
      ),
    ).toBe(20);
  });

  it('returns the per-side max in independent mode', () => {
    expect(
      getTornadoMaxValue(
        [
          { id: 'a', label: 'A', left: 10, right: 5 },
          { id: 'b', label: 'B', left: 3, right: 20 },
        ],
        'left',
        'independent',
      ),
    ).toBe(10);
    expect(
      getTornadoMaxValue(
        [
          { id: 'a', label: 'A', left: 10, right: 5 },
          { id: 'b', label: 'B', left: 3, right: 20 },
        ],
        'right',
        'independent',
      ),
    ).toBe(20);
  });

  it('returns 1 for empty input', () => {
    expect(getTornadoMaxValue([], 'left', 'shared')).toBe(1);
  });

  it('clamps negative values to 0', () => {
    expect(
      getTornadoMaxValue(
        [{ id: 'a', label: 'A', left: -5, right: -1 }],
        'left',
        'shared',
      ),
    ).toBe(1);
  });
});

describe('chart-tornado / getTornadoTicks', () => {
  it('returns evenly-spaced ticks from 0 to max', () => {
    const ticks = getTornadoTicks(100, 5);
    expect(ticks).toHaveLength(5);
    expect(ticks[0]!.value).toBe(0);
    expect(ticks[4]!.value).toBe(100);
    expect(ticks[4]!.position).toBeCloseTo(1, 10);
  });

  it('returns [0..1] fallback when max <= 0', () => {
    expect(getTornadoTicks(0)).toEqual([
      { value: 0, position: 0 },
      { value: 1, position: 1 },
    ]);
  });
});

describe('chart-tornado / sortTornadoItems', () => {
  const items: ChartTornadoItem[] = [
    { id: 'a', label: 'A', left: 30, right: 50 },
    { id: 'b', label: 'B', left: 80, right: 40 },
    { id: 'c', label: 'C', left: 20, right: 20 },
  ];

  it('preserves order when no sort given', () => {
    expect(sortTornadoItems(items).map((x) => x.item.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('sorts ascending by left', () => {
    expect(
      sortTornadoItems(items, 'left', 'asc').map((x) => x.item.id),
    ).toEqual(['c', 'a', 'b']);
  });

  it('sorts ascending by right', () => {
    expect(
      sortTornadoItems(items, 'right', 'asc').map((x) => x.item.id),
    ).toEqual(['c', 'b', 'a']);
  });

  it('sorts ascending by sum', () => {
    expect(
      sortTornadoItems(items, 'sum', 'asc').map((x) => x.item.id),
    ).toEqual(['c', 'a', 'b']);
  });

  it('sorts ascending by signed diff (right - left)', () => {
    expect(
      sortTornadoItems(items, 'diff', 'asc').map((x) => x.item.id),
    ).toEqual(['b', 'c', 'a']);
  });

  it('sorts descending by abs diff', () => {
    const out = sortTornadoItems(items, 'absDiff', 'desc');
    expect(out[0]!.item.id).toBe('b');
  });

  it('preserves originalIndex after sort', () => {
    expect(
      sortTornadoItems(items, 'left', 'asc').map((x) => x.originalIndex),
    ).toEqual([2, 0, 1]);
  });
});

describe('chart-tornado / computeTornadoLayout', () => {
  it('returns empty when canvas is degenerate', () => {
    expect(
      computeTornadoLayout({
        items: [{ id: 'a', label: 'A', left: 1, right: 2 }],
        width: 10,
        height: 10,
        padding: 100,
      }).items,
    ).toEqual([]);
  });

  it('returns empty when no items', () => {
    expect(
      computeTornadoLayout({
        items: [],
        width: 500,
        height: 200,
        padding: 20,
      }).items,
    ).toEqual([]);
  });

  it('returns empty when no finite items', () => {
    expect(
      computeTornadoLayout({
        items: [{ id: 'a', label: 'A', left: NaN, right: 5 }],
        width: 500,
        height: 200,
        padding: 20,
      }).items,
    ).toEqual([]);
  });

  it('places left bars on left half, right bars on right half (horizontal)', () => {
    const out = computeTornadoLayout({
      items: [{ id: 'a', label: 'A', left: 10, right: 20 }],
      orientation: 'horizontal',
      scaleMode: 'shared',
      width: 500,
      height: 200,
      padding: 40,
      centerGap: 0,
    });
    const it = out.items[0]!;
    expect(out.centerLine).toBeCloseTo(40 + (500 - 80) / 2, 5);
    expect(it.leftX + it.leftWidth).toBeCloseTo(out.centerLine, 5);
    expect(it.rightX).toBeCloseTo(out.centerLine, 5);
  });

  it('left + right bars have the same y on the same row (horizontal)', () => {
    const out = computeTornadoLayout({
      items: [{ id: 'a', label: 'A', left: 10, right: 5 }],
      orientation: 'horizontal',
      width: 500,
      height: 200,
      padding: 40,
    });
    const it = out.items[0]!;
    expect(it.leftY).toBeCloseTo(it.rightY, 5);
    expect(it.leftHeight).toBeCloseTo(it.rightHeight, 5);
  });

  it('left bar width scales with shared max', () => {
    const out = computeTornadoLayout({
      items: [
        { id: 'a', label: 'A', left: 10, right: 5 },
        { id: 'b', label: 'B', left: 5, right: 5 },
      ],
      scaleMode: 'shared',
      width: 500,
      height: 200,
      padding: 40,
      centerGap: 0,
    });
    expect(out.leftMax).toBe(10);
    expect(out.rightMax).toBe(10);
    const half = (500 - 80) / 2;
    expect(out.items[0]!.leftWidth).toBeCloseTo(half, 5);
    expect(out.items[1]!.leftWidth).toBeCloseTo(half / 2, 5);
  });

  it('left + right bars use independent scales in independent mode', () => {
    const out = computeTornadoLayout({
      items: [{ id: 'a', label: 'A', left: 100, right: 5 }],
      scaleMode: 'independent',
      width: 500,
      height: 200,
      padding: 40,
      centerGap: 0,
    });
    expect(out.leftMax).toBe(100);
    expect(out.rightMax).toBe(5);
    const half = (500 - 80) / 2;
    expect(out.items[0]!.leftWidth).toBeCloseTo(half, 5);
    expect(out.items[0]!.rightWidth).toBeCloseTo(half, 5);
  });

  it('clamps negative values to 0 width', () => {
    const out = computeTornadoLayout({
      items: [{ id: 'a', label: 'A', left: -5, right: -3 }],
      scaleMode: 'shared',
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.items[0]!.leftWidth).toBe(0);
    expect(out.items[0]!.rightWidth).toBe(0);
  });

  it('respects sortBy + sortOrder', () => {
    const out = computeTornadoLayout({
      items: [
        { id: 'a', label: 'A', left: 30, right: 50 },
        { id: 'b', label: 'B', left: 80, right: 40 },
        { id: 'c', label: 'C', left: 20, right: 20 },
      ],
      sortBy: 'sum',
      sortOrder: 'desc',
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.items.map((x) => x.id)).toEqual(['b', 'a', 'c']);
  });

  it('uses explicit barThickness when provided', () => {
    const out = computeTornadoLayout({
      items: [
        { id: 'a', label: 'A', left: 1, right: 1 },
        { id: 'b', label: 'B', left: 1, right: 1 },
      ],
      barThickness: 22,
      width: 500,
      height: 400,
      padding: 40,
    });
    expect(out.barThickness).toBe(22);
    expect(out.items[0]!.leftHeight).toBe(22);
  });

  it('records diff and sum', () => {
    const out = computeTornadoLayout({
      items: [{ id: 'a', label: 'A', left: 10, right: 30 }],
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.items[0]!.diff).toBe(20);
    expect(out.items[0]!.sum).toBe(40);
  });

  it('overrides bar colour per item', () => {
    const out = computeTornadoLayout({
      items: [
        {
          id: 'a',
          label: 'A',
          left: 1,
          right: 1,
          leftColor: '#aaa',
          rightColor: '#bbb',
        },
      ],
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.items[0]!.leftColor).toBe('#aaa');
    expect(out.items[0]!.rightColor).toBe('#bbb');
  });

  it('explicit valueMax wins over auto', () => {
    const out = computeTornadoLayout({
      items: [{ id: 'a', label: 'A', left: 50, right: 50 }],
      valueMax: 100,
      width: 500,
      height: 200,
      padding: 40,
      centerGap: 0,
    });
    expect(out.leftMax).toBe(100);
    expect(out.rightMax).toBe(100);
    const half = (500 - 80) / 2;
    expect(out.items[0]!.leftWidth).toBeCloseTo(half / 2, 5);
  });

  it('respects centerGap on either side', () => {
    const out = computeTornadoLayout({
      items: [{ id: 'a', label: 'A', left: 10, right: 10 }],
      scaleMode: 'shared',
      width: 500,
      height: 200,
      padding: 40,
      centerGap: 10,
    });
    expect(out.leftSideEnd).toBeCloseTo(out.centerLine - 10, 5);
    expect(out.rightSideStart).toBeCloseTo(out.centerLine + 10, 5);
  });

  it('inverts axis direction for vertical orientation', () => {
    const out = computeTornadoLayout({
      items: [{ id: 'a', label: 'A', left: 10, right: 5 }],
      orientation: 'vertical',
      scaleMode: 'shared',
      width: 200,
      height: 500,
      padding: 40,
      centerGap: 0,
    });
    const it = out.items[0]!;
    expect(it.leftY + it.leftHeight).toBeCloseTo(out.centerLine, 5);
    expect(it.rightY).toBeCloseTo(out.centerLine, 5);
  });
});

describe('chart-tornado / describeTornadoChart', () => {
  it('returns "No data" when empty', () => {
    expect(describeTornadoChart([], 'L', 'R')).toBe('No data');
  });

  it('returns "No data" when no finite items', () => {
    expect(
      describeTornadoChart(
        [{ id: 'a', label: 'A', left: NaN, right: 5 }],
        'L',
        'R',
      ),
    ).toBe('No data');
  });

  it('summarises peak values per side', () => {
    const out = describeTornadoChart(
      [
        { id: 'a', label: 'A', left: 10, right: 30 },
        { id: 'b', label: 'B', left: 50, right: 20 },
      ],
      'In',
      'Out',
    );
    expect(out).toContain('In');
    expect(out).toContain('Out');
    expect(out).toContain('50');
    expect(out).toContain('30');
    expect(out).toContain('2 categor');
  });

  it('uses singular "category" for one item', () => {
    const out = describeTornadoChart(
      [{ id: 'a', label: 'A', left: 1, right: 1 }],
      'L',
      'R',
    );
    expect(out).toContain('1 category');
  });

  it('uses custom formatter', () => {
    const out = describeTornadoChart(
      [{ id: 'a', label: 'A', left: 1, right: 5 }],
      'L',
      'R',
      (n) => `${n}%`,
    );
    expect(out).toContain('1%');
    expect(out).toContain('5%');
  });
});

const FIXTURE: ChartTornadoItem[] = [
  { id: 'a', label: 'Alpha', left: 30, right: 50 },
  { id: 'b', label: 'Beta', left: 80, right: 40 },
  { id: 'c', label: 'Gamma', left: 20, right: 20 },
];

describe('chart-tornado / <ChartTornado>', () => {
  it('renders a root region with the default aria label', () => {
    render(<ChartTornado items={FIXTURE} />);
    const root = document.querySelector('[data-section="chart-tornado"]')!;
    expect(root.getAttribute('aria-label')).toBe('Tornado chart');
  });

  it('exposes orientation + scaleMode + counts as data attrs', () => {
    render(
      <ChartTornado
        items={FIXTURE}
        orientation="vertical"
        scaleMode="independent"
        sortBy="sum"
        sortOrder="desc"
      />,
    );
    const root = document.querySelector('[data-section="chart-tornado"]')!;
    expect(root.getAttribute('data-orientation')).toBe('vertical');
    expect(root.getAttribute('data-scale-mode')).toBe('independent');
    expect(root.getAttribute('data-sort-by')).toBe('sum');
    expect(root.getAttribute('data-sort-order')).toBe('desc');
    expect(root.getAttribute('data-category-count')).toBe('3');
    expect(root.getAttribute('data-finite-count')).toBe('3');
  });

  it('renders an aria description with summary text', () => {
    render(<ChartTornado items={FIXTURE} />);
    const desc = document.querySelector(
      '[data-section="chart-tornado-aria-desc"]',
    );
    expect(desc?.textContent ?? '').toContain('3 categor');
  });

  it('respects a custom aria description', () => {
    render(<ChartTornado items={FIXTURE} ariaDescription="custom" />);
    expect(
      document.querySelector('[data-section="chart-tornado-aria-desc"]')
        ?.textContent,
    ).toBe('custom');
  });

  it('renders two bars per item with distinct side attrs', () => {
    render(<ChartTornado items={FIXTURE} />);
    const leftBars = document.querySelectorAll(
      '[data-section="chart-tornado-bar"][data-side="left"]',
    );
    const rightBars = document.querySelectorAll(
      '[data-section="chart-tornado-bar"][data-side="right"]',
    );
    expect(leftBars.length).toBe(3);
    expect(rightBars.length).toBe(3);
  });

  it('renders a category label per item by default', () => {
    render(<ChartTornado items={FIXTURE} />);
    const lbls = document.querySelectorAll(
      '[data-section="chart-tornado-category-text"]',
    );
    expect(lbls.length).toBe(3);
    expect(lbls[0]?.textContent).toBe('Alpha');
  });

  it('omits category labels when showCategoryLabels=false', () => {
    render(<ChartTornado items={FIXTURE} showCategoryLabels={false} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-tornado-category-text"]',
      ).length,
    ).toBe(0);
  });

  it('renders value labels when showValueLabels=true', () => {
    render(<ChartTornado items={FIXTURE} showValueLabels />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-tornado-value-text"]',
      ).length,
    ).toBe(6);
  });

  it('shows tooltip on bar hover', () => {
    render(<ChartTornado items={FIXTURE} />);
    const bar = document.querySelectorAll(
      '[data-section="chart-tornado-bar"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(bar);
    const tip = document.querySelector(
      '[data-section="chart-tornado-tooltip"]',
    );
    expect(tip).not.toBeNull();
    expect(tip!.textContent).toContain('Alpha');
    expect(tip!.textContent).toContain('Left');
    expect(tip!.textContent).toContain('Right');
  });

  it('hides tooltip on mouse leave', () => {
    render(<ChartTornado items={FIXTURE} />);
    const bar = document.querySelectorAll(
      '[data-section="chart-tornado-bar"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(bar);
    fireEvent.mouseLeave(bar);
    expect(
      document.querySelector('[data-section="chart-tornado-tooltip"]'),
    ).toBeNull();
  });

  it('fires onItemClick with item + layout + side', () => {
    const handler = vi.fn();
    render(<ChartTornado items={FIXTURE} onItemClick={handler} />);
    const bar = document.querySelectorAll(
      '[data-section="chart-tornado-bar"][data-side="right"]',
    )[0] as SVGElement;
    fireEvent.click(bar);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0]!.side).toBe('right');
    expect(handler.mock.calls[0]![0]!.item.id).toBe('a');
  });

  it('hides axis when showAxis=false', () => {
    render(<ChartTornado items={FIXTURE} showAxis={false} />);
    expect(
      document.querySelector('[data-section="chart-tornado-axes"]'),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    render(<ChartTornado items={FIXTURE} showGrid={false} />);
    expect(
      document.querySelector('[data-section="chart-tornado-grid"]'),
    ).toBeNull();
  });

  it('hides center line when showCenterLine=false', () => {
    render(<ChartTornado items={FIXTURE} showCenterLine={false} />);
    expect(
      document.querySelector('[data-section="chart-tornado-center-line"]'),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    render(<ChartTornado items={FIXTURE} showLegend={false} />);
    expect(
      document.querySelector('[data-section="chart-tornado-legend"]'),
    ).toBeNull();
  });

  it('renders left + right labels in legend', () => {
    render(
      <ChartTornado items={FIXTURE} leftLabel="Pros" rightLabel="Cons" />,
    );
    const lbls = document.querySelectorAll(
      '[data-section="chart-tornado-legend-label"]',
    );
    expect(lbls[0]?.textContent).toBe('Pros');
    expect(lbls[1]?.textContent).toBe('Cons');
  });

  it('hides tooltip when showTooltip=false', () => {
    render(<ChartTornado items={FIXTURE} showTooltip={false} />);
    const bar = document.querySelectorAll(
      '[data-section="chart-tornado-bar"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(bar);
    expect(
      document.querySelector('[data-section="chart-tornado-tooltip"]'),
    ).toBeNull();
  });

  it('applies the animate flag to the data attribute', () => {
    render(<ChartTornado items={FIXTURE} animate={false} />);
    const root = document.querySelector('[data-section="chart-tornado"]')!;
    expect(root.getAttribute('data-animate')).toBe('false');
  });

  it('renders the optional value label', () => {
    render(<ChartTornado items={FIXTURE} valueLabel="ms" />);
    expect(
      document.querySelector(
        '[data-section="chart-tornado-value-label"]',
      )?.textContent,
    ).toBe('ms');
  });

  it('uses formatValue for axis ticks', () => {
    render(<ChartTornado items={FIXTURE} formatValue={(n) => `v${n}`} />);
    const t = document.querySelector(
      '[data-section="chart-tornado-tick-label"]',
    );
    expect(t?.textContent?.startsWith('v')).toBe(true);
  });

  it('uses formatCategory for tooltip header', () => {
    render(
      <ChartTornado
        items={FIXTURE}
        formatCategory={(it) => `${it.label}!`}
      />,
    );
    const bar = document.querySelectorAll(
      '[data-section="chart-tornado-bar"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(bar);
    const tip = document.querySelector(
      '[data-section="chart-tornado-tooltip-label"]',
    );
    expect(tip?.textContent).toBe('Alpha!');
  });

  it('exposes item data attrs', () => {
    render(<ChartTornado items={FIXTURE} />);
    const it = document.querySelectorAll(
      '[data-section="chart-tornado-item"]',
    )[0] as HTMLElement;
    expect(it.getAttribute('data-item-id')).toBe('a');
    expect(it.getAttribute('data-item-left')).toBe('30');
    expect(it.getAttribute('data-item-right')).toBe('50');
    expect(it.getAttribute('data-item-diff')).toBe('20');
    expect(it.getAttribute('data-item-sum')).toBe('80');
  });

  it('renders empty state when no items', () => {
    render(<ChartTornado items={[]} />);
    expect(
      document.querySelectorAll('[data-section="chart-tornado-bar"]').length,
    ).toBe(0);
    expect(
      document.querySelector('[data-section="chart-tornado-aria-desc"]')
        ?.textContent,
    ).toBe('No data');
  });

  it('renders per-bar aria-label with category, side, value', () => {
    render(<ChartTornado items={FIXTURE} />);
    const bar = document.querySelector(
      '[data-section="chart-tornado-bar"][data-side="left"]',
    ) as SVGElement;
    const aria = bar.getAttribute('aria-label') ?? '';
    expect(aria).toContain('Alpha');
    expect(aria).toContain('Left');
    expect(aria).toContain('30');
  });

  it('keyboard focus opens the tooltip', () => {
    render(<ChartTornado items={FIXTURE} />);
    const bar = document.querySelectorAll(
      '[data-section="chart-tornado-bar"]',
    )[0] as SVGElement;
    fireEvent.focus(bar);
    expect(
      document.querySelector('[data-section="chart-tornado-tooltip"]'),
    ).not.toBeNull();
  });

  it('sets data-hovered on the hovered item group', () => {
    render(<ChartTornado items={FIXTURE} />);
    const bar = document.querySelectorAll(
      '[data-section="chart-tornado-bar"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(bar);
    const itemGroup = document.querySelector(
      '[data-section="chart-tornado-item"][data-item-id="a"]',
    )!;
    expect(itemGroup.getAttribute('data-hovered')).toBe('true');
  });

  it('renders grid lines for both sides when showGrid=true', () => {
    render(<ChartTornado items={FIXTURE} />);
    const lines = document.querySelectorAll(
      '[data-section="chart-tornado-grid-line"]',
    );
    expect(lines.length).toBeGreaterThanOrEqual(2);
  });

  it('renders items in sorted order in the DOM', () => {
    render(<ChartTornado items={FIXTURE} sortBy="sum" sortOrder="desc" />);
    const itemEls = document.querySelectorAll(
      '[data-section="chart-tornado-item"]',
    );
    expect(itemEls[0]!.getAttribute('data-item-id')).toBe('b');
    expect(itemEls[2]!.getAttribute('data-item-id')).toBe('c');
  });
});
