import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

import {
  ChartLollipop,
  DEFAULT_CHART_LOLLIPOP_WIDTH,
  DEFAULT_CHART_LOLLIPOP_HEIGHT,
  DEFAULT_CHART_LOLLIPOP_PADDING,
  DEFAULT_CHART_LOLLIPOP_TICK_COUNT,
  DEFAULT_CHART_LOLLIPOP_HEAD_RADIUS,
  DEFAULT_CHART_LOLLIPOP_STICK_WIDTH,
  DEFAULT_CHART_LOLLIPOP_BASELINE,
  DEFAULT_CHART_LOLLIPOP_OPACITY,
  DEFAULT_CHART_LOLLIPOP_GRID_COLOR,
  DEFAULT_CHART_LOLLIPOP_AXIS_COLOR,
  DEFAULT_CHART_LOLLIPOP_ORIENTATION,
  DEFAULT_CHART_LOLLIPOP_PALETTE,
  computeLollipopLayout,
  describeLollipopChart,
  getLollipopBounds,
  getLollipopDefaultColor,
  getLollipopFiniteItems,
  getLollipopTicks,
  sortLollipopItems,
  type ChartLollipopItem,
} from './chart-lollipop';

afterEach(() => {
  cleanup();
});

describe('chart-lollipop / constants', () => {
  it('exports sensible defaults', () => {
    expect(DEFAULT_CHART_LOLLIPOP_WIDTH).toBe(560);
    expect(DEFAULT_CHART_LOLLIPOP_HEIGHT).toBe(320);
    expect(DEFAULT_CHART_LOLLIPOP_PADDING).toBe(40);
    expect(DEFAULT_CHART_LOLLIPOP_TICK_COUNT).toBe(5);
    expect(DEFAULT_CHART_LOLLIPOP_HEAD_RADIUS).toBe(5);
    expect(DEFAULT_CHART_LOLLIPOP_STICK_WIDTH).toBe(1.5);
    expect(DEFAULT_CHART_LOLLIPOP_BASELINE).toBe(0);
    expect(DEFAULT_CHART_LOLLIPOP_OPACITY).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LOLLIPOP_OPACITY).toBeLessThanOrEqual(1);
    expect(DEFAULT_CHART_LOLLIPOP_GRID_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_LOLLIPOP_AXIS_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_LOLLIPOP_ORIENTATION).toBe('vertical');
    expect(DEFAULT_CHART_LOLLIPOP_PALETTE).toHaveLength(10);
  });
});

describe('chart-lollipop / getLollipopDefaultColor', () => {
  it('wraps with modulo', () => {
    expect(getLollipopDefaultColor(0)).toBe(DEFAULT_CHART_LOLLIPOP_PALETTE[0]);
    expect(getLollipopDefaultColor(10)).toBe(DEFAULT_CHART_LOLLIPOP_PALETTE[0]);
    expect(getLollipopDefaultColor(11)).toBe(DEFAULT_CHART_LOLLIPOP_PALETTE[1]);
  });

  it('falls back to first colour for invalid indices', () => {
    expect(getLollipopDefaultColor(-1)).toBe(DEFAULT_CHART_LOLLIPOP_PALETTE[0]);
    expect(getLollipopDefaultColor(NaN)).toBe(DEFAULT_CHART_LOLLIPOP_PALETTE[0]);
  });
});

describe('chart-lollipop / getLollipopFiniteItems', () => {
  it('drops items with non-finite values', () => {
    const items: ChartLollipopItem[] = [
      { id: 'a', label: 'A', value: 1 },
      { id: 'b', label: 'B', value: NaN },
      { id: 'c', label: 'C', value: Infinity },
      { id: 'd', label: 'D', value: 4 },
    ];
    const out = getLollipopFiniteItems(items);
    expect(out.map((x) => x.id)).toEqual(['a', 'd']);
  });

  it('drops items with non-string ids', () => {
    const items = [
      { id: 'a', label: 'A', value: 1 },
      { id: 5 as unknown as string, label: 'B', value: 2 },
    ];
    expect(getLollipopFiniteItems(items)).toHaveLength(1);
  });

  it('returns [] for non-array input', () => {
    expect(getLollipopFiniteItems(null as unknown as ChartLollipopItem[])).toEqual([]);
  });
});

describe('chart-lollipop / getLollipopBounds', () => {
  it('includes the baseline (0) by default', () => {
    expect(
      getLollipopBounds([
        { id: 'a', label: 'A', value: 5 },
        { id: 'b', label: 'B', value: 10 },
      ]),
    ).toEqual({ min: 0, max: 10 });
  });

  it('extends below the baseline for negative values', () => {
    expect(
      getLollipopBounds([
        { id: 'a', label: 'A', value: -5 },
        { id: 'b', label: 'B', value: 10 },
      ]),
    ).toEqual({ min: -5, max: 10 });
  });

  it('returns +/- 0.5 around baseline for empty input', () => {
    expect(getLollipopBounds([], 0)).toEqual({ min: -0.5, max: 0.5 });
  });

  it('uses a custom baseline', () => {
    expect(
      getLollipopBounds(
        [
          { id: 'a', label: 'A', value: 105 },
          { id: 'b', label: 'B', value: 110 },
        ],
        100,
      ),
    ).toEqual({ min: 100, max: 110 });
  });

  it('expands +/- 0.5 when collapsed', () => {
    expect(
      getLollipopBounds([{ id: 'a', label: 'A', value: 5 }], 5),
    ).toEqual({ min: 4.5, max: 5.5 });
  });
});

describe('chart-lollipop / getLollipopTicks', () => {
  it('returns evenly-spaced ticks', () => {
    const ticks = getLollipopTicks(0, 10, 5);
    expect(ticks).toHaveLength(5);
    expect(ticks[0]!.value).toBe(0);
    expect(ticks[4]!.value).toBe(10);
    expect(ticks[4]!.position).toBeCloseTo(1, 10);
  });

  it('returns single tick for collapsed range', () => {
    expect(getLollipopTicks(5, 5, 4)).toEqual([{ value: 5, position: 0 }]);
  });

  it('returns [] for invalid range', () => {
    expect(getLollipopTicks(10, 5, 4)).toEqual([]);
  });
});

describe('chart-lollipop / sortLollipopItems', () => {
  const items: ChartLollipopItem[] = [
    { id: 'a', label: 'A', value: 3 },
    { id: 'b', label: 'B', value: 1 },
    { id: 'c', label: 'C', value: 2 },
  ];

  it('sorts ascending by value', () => {
    const out = sortLollipopItems(items, 'asc');
    expect(out.map((x) => x.item.id)).toEqual(['b', 'c', 'a']);
  });

  it('sorts descending by value', () => {
    const out = sortLollipopItems(items, 'desc');
    expect(out.map((x) => x.item.id)).toEqual(['a', 'c', 'b']);
  });

  it('preserves order when no sort given', () => {
    const out = sortLollipopItems(items);
    expect(out.map((x) => x.item.id)).toEqual(['a', 'b', 'c']);
  });

  it('preserves original indices', () => {
    const out = sortLollipopItems(items, 'asc');
    expect(out.map((x) => x.originalIndex)).toEqual([1, 2, 0]);
  });
});

describe('chart-lollipop / computeLollipopLayout', () => {
  it('returns empty when canvas is degenerate', () => {
    expect(
      computeLollipopLayout({
        items: [{ id: 'a', label: 'A', value: 1 }],
        width: 10,
        height: 10,
        padding: 100,
      }).items,
    ).toEqual([]);
  });

  it('returns empty when items list is empty', () => {
    expect(
      computeLollipopLayout({
        items: [],
        width: 500,
        height: 200,
        padding: 20,
      }).items,
    ).toEqual([]);
  });

  it('returns empty when no finite items', () => {
    expect(
      computeLollipopLayout({
        items: [{ id: 'a', label: 'A', value: NaN }],
        width: 500,
        height: 200,
        padding: 20,
      }).items,
    ).toEqual([]);
  });

  it('places vertical items spread across the inner width', () => {
    const out = computeLollipopLayout({
      items: [
        { id: 'a', label: 'A', value: 1 },
        { id: 'b', label: 'B', value: 2 },
        { id: 'c', label: 'C', value: 3 },
      ],
      orientation: 'vertical',
      width: 500,
      height: 200,
      padding: 40,
    });
    const xs = out.items.map((x) => x.centerX);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(xs[0]!).toBeGreaterThan(40);
    expect(xs[xs.length - 1]!).toBeLessThan(500 - 40 + 1);
  });

  it('places horizontal items spread across the inner height', () => {
    const out = computeLollipopLayout({
      items: [
        { id: 'a', label: 'A', value: 1 },
        { id: 'b', label: 'B', value: 2 },
      ],
      orientation: 'horizontal',
      width: 500,
      height: 200,
      padding: 40,
    });
    const ys = out.items.map((x) => x.centerY);
    expect(ys[0]!).toBeLessThan(ys[1]!);
  });

  it('positions head at value pixel along axis (vertical)', () => {
    const out = computeLollipopLayout({
      items: [
        { id: 'a', label: 'A', value: 0 },
        { id: 'b', label: 'B', value: 10 },
      ],
      orientation: 'vertical',
      baseline: 0,
      valueMin: 0,
      valueMax: 10,
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.items[0]!.headY).toBeCloseTo(40 + 120, 5);
    expect(out.items[1]!.headY).toBeCloseTo(40, 5);
  });

  it('inverts head positions for horizontal orientation', () => {
    const out = computeLollipopLayout({
      items: [
        { id: 'a', label: 'A', value: 0 },
        { id: 'b', label: 'B', value: 10 },
      ],
      orientation: 'horizontal',
      baseline: 0,
      valueMin: 0,
      valueMax: 10,
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.items[0]!.headX).toBeCloseTo(40, 5);
    expect(out.items[1]!.headX).toBeCloseTo(40 + (500 - 80), 5);
  });

  it('sticks start at the baseline and end at the head', () => {
    const out = computeLollipopLayout({
      items: [{ id: 'a', label: 'A', value: 10 }],
      orientation: 'vertical',
      baseline: 0,
      valueMin: 0,
      valueMax: 10,
      width: 500,
      height: 200,
      padding: 40,
    });
    const it = out.items[0]!;
    expect(it.stickY1).toBeCloseTo(it.baselineY, 5);
    expect(it.stickY2).toBeCloseTo(it.headY, 5);
    expect(it.stickX1).toBe(it.stickX2);
  });

  it('respects sort order ascending', () => {
    const out = computeLollipopLayout({
      items: [
        { id: 'a', label: 'A', value: 3 },
        { id: 'b', label: 'B', value: 1 },
        { id: 'c', label: 'C', value: 2 },
      ],
      sortOrder: 'asc',
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.items.map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });

  it('preserves originalIndex after sort', () => {
    const out = computeLollipopLayout({
      items: [
        { id: 'a', label: 'A', value: 3 },
        { id: 'b', label: 'B', value: 1 },
      ],
      sortOrder: 'asc',
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.items[0]!.originalIndex).toBe(1);
    expect(out.items[1]!.originalIndex).toBe(0);
  });

  it('marks items above and below baseline', () => {
    const out = computeLollipopLayout({
      items: [
        { id: 'a', label: 'A', value: 5 },
        { id: 'b', label: 'B', value: -5 },
      ],
      baseline: 0,
      valueMin: -5,
      valueMax: 5,
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.items[0]!.isAboveBaseline).toBe(true);
    expect(out.items[1]!.isAboveBaseline).toBe(false);
  });

  it('produces tick positions inside the canvas', () => {
    const out = computeLollipopLayout({
      items: [{ id: 'a', label: 'A', value: 10 }],
      width: 500,
      height: 300,
      padding: 40,
    });
    expect(out.ticks.length).toBeGreaterThan(0);
    for (const t of out.ticks) {
      expect(t.position).toBeGreaterThanOrEqual(40 - 1e-6);
    }
  });

  it('uses the provided baseline when computing the stick start', () => {
    const out = computeLollipopLayout({
      items: [{ id: 'a', label: 'A', value: 110 }],
      baseline: 100,
      valueMin: 100,
      valueMax: 110,
      width: 500,
      height: 200,
      padding: 40,
    });
    const it = out.items[0]!;
    expect(it.baselineY).toBeCloseTo(40 + 120, 5);
    expect(it.headY).toBeCloseTo(40, 5);
  });
});

describe('chart-lollipop / describeLollipopChart', () => {
  it('returns "No data" when empty', () => {
    expect(describeLollipopChart([])).toBe('No data');
  });

  it('returns "No data" when no finite items', () => {
    expect(
      describeLollipopChart([{ id: 'a', label: 'A', value: NaN }]),
    ).toBe('No data');
  });

  it('summarises count and range with min/max labels', () => {
    const out = describeLollipopChart([
      { id: 'a', label: 'Apples', value: 5 },
      { id: 'b', label: 'Berries', value: 10 },
      { id: 'c', label: 'Cherries', value: 1 },
    ]);
    expect(out).toContain('3 categories');
    expect(out).toContain('Cherries');
    expect(out).toContain('Berries');
    expect(out).toContain('1');
    expect(out).toContain('10');
  });

  it('respects custom formatter', () => {
    const out = describeLollipopChart(
      [
        { id: 'a', label: 'A', value: 5 },
        { id: 'b', label: 'B', value: 10 },
      ],
      (n) => `${n}%`,
    );
    expect(out).toContain('5%');
    expect(out).toContain('10%');
  });
});

const FIXTURE: ChartLollipopItem[] = [
  { id: 'a', label: 'Alpha', value: 12 },
  { id: 'b', label: 'Beta', value: 25 },
  { id: 'c', label: 'Gamma', value: 18 },
];

describe('chart-lollipop / <ChartLollipop>', () => {
  it('renders a root region with the default aria label', () => {
    render(<ChartLollipop items={FIXTURE} />);
    const root = document.querySelector('[data-section="chart-lollipop"]')!;
    expect(root.getAttribute('aria-label')).toBe('Lollipop chart');
  });

  it('exposes orientation + baseline + sortOrder as data attrs', () => {
    render(
      <ChartLollipop
        items={FIXTURE}
        orientation="horizontal"
        baseline={5}
        sortOrder="desc"
      />,
    );
    const root = document.querySelector('[data-section="chart-lollipop"]')!;
    expect(root.getAttribute('data-orientation')).toBe('horizontal');
    expect(root.getAttribute('data-baseline')).toBe('5');
    expect(root.getAttribute('data-sort-order')).toBe('desc');
  });

  it('renders an aria description with summary text', () => {
    render(<ChartLollipop items={FIXTURE} />);
    const desc = document.querySelector(
      '[data-section="chart-lollipop-aria-desc"]',
    );
    expect(desc?.textContent ?? '').toContain('3 categories');
  });

  it('respects a custom aria description', () => {
    render(<ChartLollipop items={FIXTURE} ariaDescription="custom" />);
    expect(
      document.querySelector('[data-section="chart-lollipop-aria-desc"]')
        ?.textContent,
    ).toBe('custom');
  });

  it('renders one sticker + head per category', () => {
    render(<ChartLollipop items={FIXTURE} />);
    expect(
      document.querySelectorAll('[data-section="chart-lollipop-stick"]').length,
    ).toBe(3);
    expect(
      document.querySelectorAll('[data-section="chart-lollipop-head"]').length,
    ).toBe(3);
  });

  it('renders one category-text label per item by default', () => {
    render(<ChartLollipop items={FIXTURE} />);
    const lbls = document.querySelectorAll(
      '[data-section="chart-lollipop-category-text"]',
    );
    expect(lbls.length).toBe(3);
    expect(lbls[0]?.textContent).toBe('Alpha');
  });

  it('omits category labels when showCategoryLabels=false', () => {
    render(<ChartLollipop items={FIXTURE} showCategoryLabels={false} />);
    expect(
      document.querySelectorAll('[data-section="chart-lollipop-category-text"]')
        .length,
    ).toBe(0);
  });

  it('renders value labels when showValueLabels=true', () => {
    render(<ChartLollipop items={FIXTURE} showValueLabels />);
    const lbls = document.querySelectorAll(
      '[data-section="chart-lollipop-value-text"]',
    );
    expect(lbls.length).toBe(3);
    expect(lbls[0]?.textContent).toBe('12');
  });

  it('shows tooltip on head hover', () => {
    render(<ChartLollipop items={FIXTURE} />);
    const head = document.querySelectorAll(
      '[data-section="chart-lollipop-head"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(head);
    const tip = document.querySelector(
      '[data-section="chart-lollipop-tooltip"]',
    );
    expect(tip).not.toBeNull();
    expect(tip!.textContent).toContain('Alpha');
  });

  it('hides tooltip on mouse leave', () => {
    render(<ChartLollipop items={FIXTURE} />);
    const head = document.querySelectorAll(
      '[data-section="chart-lollipop-head"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(head);
    fireEvent.mouseLeave(head);
    expect(
      document.querySelector('[data-section="chart-lollipop-tooltip"]'),
    ).toBeNull();
  });

  it('fires onItemClick with item + layout', () => {
    const handler = vi.fn();
    render(<ChartLollipop items={FIXTURE} onItemClick={handler} />);
    const head = document.querySelectorAll(
      '[data-section="chart-lollipop-head"]',
    )[0] as SVGElement;
    fireEvent.click(head);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0]!.item.id).toBe('a');
    expect(typeof handler.mock.calls[0]![0]!.layout.headY).toBe('number');
  });

  it('hides axis when showAxis=false', () => {
    render(<ChartLollipop items={FIXTURE} showAxis={false} />);
    expect(
      document.querySelector('[data-section="chart-lollipop-axes"]'),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    render(<ChartLollipop items={FIXTURE} showGrid={false} />);
    expect(
      document.querySelector('[data-section="chart-lollipop-grid"]'),
    ).toBeNull();
  });

  it('hides baseline when showBaseline=false', () => {
    render(<ChartLollipop items={FIXTURE} showBaseline={false} />);
    expect(
      document.querySelector('[data-section="chart-lollipop-baseline"]'),
    ).toBeNull();
  });

  it('hides tooltip when showTooltip=false', () => {
    render(<ChartLollipop items={FIXTURE} showTooltip={false} />);
    const head = document.querySelectorAll(
      '[data-section="chart-lollipop-head"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(head);
    expect(
      document.querySelector('[data-section="chart-lollipop-tooltip"]'),
    ).toBeNull();
  });

  it('applies the animate flag to the data attribute', () => {
    render(<ChartLollipop items={FIXTURE} animate={false} />);
    const root = document.querySelector('[data-section="chart-lollipop"]')!;
    expect(root.getAttribute('data-animate')).toBe('false');
  });

  it('renders the optional value label', () => {
    render(<ChartLollipop items={FIXTURE} valueLabel="ms" />);
    expect(
      document.querySelector('[data-section="chart-lollipop-value-label"]')
        ?.textContent,
    ).toBe('ms');
  });

  it('renders the optional category label', () => {
    render(<ChartLollipop items={FIXTURE} categoryLabel="Series" />);
    expect(
      document.querySelector('[data-section="chart-lollipop-category-label"]')
        ?.textContent,
    ).toBe('Series');
  });

  it('uses formatValue for axis ticks', () => {
    render(<ChartLollipop items={FIXTURE} formatValue={(n) => `v${n}`} />);
    const t = document.querySelector(
      '[data-section="chart-lollipop-tick-label"]',
    );
    expect(t?.textContent?.startsWith('v')).toBe(true);
  });

  it('uses formatCategory for tooltip header', () => {
    render(
      <ChartLollipop
        items={FIXTURE}
        formatCategory={(it) => `${it.label}!`}
      />,
    );
    const head = document.querySelectorAll(
      '[data-section="chart-lollipop-head"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(head);
    const tip = document.querySelector(
      '[data-section="chart-lollipop-tooltip-label"]',
    );
    expect(tip?.textContent).toBe('Alpha!');
  });

  it('overrides default colour via item.color', () => {
    render(
      <ChartLollipop
        items={[{ id: 'a', label: 'A', value: 1, color: '#abcdef' }]}
      />,
    );
    const it = document.querySelector('[data-section="chart-lollipop-item"]')!;
    expect(it.getAttribute('data-item-color')).toBe('#abcdef');
  });

  it('exposes item data attrs', () => {
    render(<ChartLollipop items={FIXTURE} />);
    const it = document.querySelectorAll(
      '[data-section="chart-lollipop-item"]',
    )[0] as HTMLElement;
    expect(it.getAttribute('data-item-id')).toBe('a');
    expect(it.getAttribute('data-item-value')).toBe('12');
    expect(it.getAttribute('data-above-baseline')).toBe('true');
  });

  it('renders empty state when no items', () => {
    render(<ChartLollipop items={[]} />);
    expect(
      document.querySelectorAll('[data-section="chart-lollipop-head"]').length,
    ).toBe(0);
    expect(
      document.querySelector('[data-section="chart-lollipop-aria-desc"]')
        ?.textContent,
    ).toBe('No data');
  });

  it('renders per-head aria-label with category and value', () => {
    render(<ChartLollipop items={FIXTURE} />);
    const head = document.querySelectorAll(
      '[data-section="chart-lollipop-head"]',
    )[0] as SVGElement;
    expect(head.getAttribute('aria-label')).toContain('Alpha');
    expect(head.getAttribute('aria-label')).toContain('12');
  });

  it('keyboard focus opens the tooltip', () => {
    render(<ChartLollipop items={FIXTURE} />);
    const head = document.querySelectorAll(
      '[data-section="chart-lollipop-head"]',
    )[0] as SVGElement;
    fireEvent.focus(head);
    expect(
      document.querySelector('[data-section="chart-lollipop-tooltip"]'),
    ).not.toBeNull();
  });

  it('keyboard blur closes the tooltip', () => {
    render(<ChartLollipop items={FIXTURE} />);
    const head = document.querySelectorAll(
      '[data-section="chart-lollipop-head"]',
    )[0] as SVGElement;
    fireEvent.focus(head);
    fireEvent.blur(head);
    expect(
      document.querySelector('[data-section="chart-lollipop-tooltip"]'),
    ).toBeNull();
  });

  it('sets data-hovered on the hovered item group', () => {
    render(<ChartLollipop items={FIXTURE} />);
    const head = document.querySelectorAll(
      '[data-section="chart-lollipop-head"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(head);
    const itemGroup = document.querySelector(
      '[data-section="chart-lollipop-item"][data-item-id="a"]',
    )!;
    expect(itemGroup.getAttribute('data-hovered')).toBe('true');
  });

  it('renders grid lines per tick when showGrid=true', () => {
    render(<ChartLollipop items={FIXTURE} tickCount={4} />);
    const lines = document.querySelectorAll(
      '[data-section="chart-lollipop-grid-line"]',
    );
    expect(lines.length).toBeGreaterThanOrEqual(2);
  });

  it('renders items in sorted order in the DOM', () => {
    render(<ChartLollipop items={FIXTURE} sortOrder="asc" />);
    const items = document.querySelectorAll(
      '[data-section="chart-lollipop-item"]',
    );
    expect(items[0]!.getAttribute('data-item-id')).toBe('a');
    expect(items[1]!.getAttribute('data-item-id')).toBe('c');
    expect(items[2]!.getAttribute('data-item-id')).toBe('b');
  });
});
