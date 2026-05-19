import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

import {
  ChartClevelandDot,
  DEFAULT_CHART_CLEVELAND_DOT_WIDTH,
  DEFAULT_CHART_CLEVELAND_DOT_HEIGHT,
  DEFAULT_CHART_CLEVELAND_DOT_PADDING,
  DEFAULT_CHART_CLEVELAND_DOT_TICK_COUNT,
  DEFAULT_CHART_CLEVELAND_DOT_DOT_RADIUS,
  DEFAULT_CHART_CLEVELAND_DOT_CONNECTOR_WIDTH,
  DEFAULT_CHART_CLEVELAND_DOT_OPACITY,
  DEFAULT_CHART_CLEVELAND_DOT_GRID_COLOR,
  DEFAULT_CHART_CLEVELAND_DOT_AXIS_COLOR,
  DEFAULT_CHART_CLEVELAND_DOT_BEFORE_COLOR,
  DEFAULT_CHART_CLEVELAND_DOT_AFTER_COLOR,
  DEFAULT_CHART_CLEVELAND_DOT_POSITIVE_COLOR,
  DEFAULT_CHART_CLEVELAND_DOT_NEGATIVE_COLOR,
  DEFAULT_CHART_CLEVELAND_DOT_NEUTRAL_COLOR,
  DEFAULT_CHART_CLEVELAND_DOT_ORIENTATION,
  computeClevelandDotLayout,
  describeClevelandDotChart,
  getClevelandDotBounds,
  getClevelandDotDirection,
  getClevelandDotFiniteItems,
  getClevelandDotTicks,
  sortClevelandDotItems,
  type ChartClevelandDotItem,
} from './chart-cleveland-dot';

afterEach(() => {
  cleanup();
});

describe('chart-cleveland-dot / constants', () => {
  it('exports sensible defaults', () => {
    expect(DEFAULT_CHART_CLEVELAND_DOT_WIDTH).toBe(560);
    expect(DEFAULT_CHART_CLEVELAND_DOT_HEIGHT).toBe(360);
    expect(DEFAULT_CHART_CLEVELAND_DOT_PADDING).toBe(48);
    expect(DEFAULT_CHART_CLEVELAND_DOT_TICK_COUNT).toBe(5);
    expect(DEFAULT_CHART_CLEVELAND_DOT_DOT_RADIUS).toBe(5);
    expect(DEFAULT_CHART_CLEVELAND_DOT_CONNECTOR_WIDTH).toBe(1.5);
    expect(DEFAULT_CHART_CLEVELAND_DOT_OPACITY).toBeGreaterThan(0);
    expect(DEFAULT_CHART_CLEVELAND_DOT_GRID_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_CLEVELAND_DOT_AXIS_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_CLEVELAND_DOT_BEFORE_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_CLEVELAND_DOT_AFTER_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_CLEVELAND_DOT_POSITIVE_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_CLEVELAND_DOT_NEGATIVE_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_CLEVELAND_DOT_NEUTRAL_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_CLEVELAND_DOT_ORIENTATION).toBe('horizontal');
  });
});

describe('chart-cleveland-dot / getClevelandDotDirection', () => {
  it('classifies up/down/flat based on delta', () => {
    expect(getClevelandDotDirection(1, 5)).toBe('up');
    expect(getClevelandDotDirection(5, 1)).toBe('down');
    expect(getClevelandDotDirection(3, 3)).toBe('flat');
  });

  it('treats deltas within epsilon as flat', () => {
    expect(getClevelandDotDirection(10, 10.05, 0.1)).toBe('flat');
    expect(getClevelandDotDirection(10, 10.2, 0.1)).toBe('up');
  });

  it('returns flat for non-finite inputs', () => {
    expect(getClevelandDotDirection(NaN, 5)).toBe('flat');
    expect(getClevelandDotDirection(1, Infinity)).toBe('flat');
  });
});

describe('chart-cleveland-dot / getClevelandDotFiniteItems', () => {
  it('drops items with non-finite before or after', () => {
    const items: ChartClevelandDotItem[] = [
      { id: 'a', label: 'A', before: 1, after: 5 },
      { id: 'b', label: 'B', before: NaN, after: 5 },
      { id: 'c', label: 'C', before: 1, after: Infinity },
      { id: 'd', label: 'D', before: 2, after: 6 },
    ];
    const out = getClevelandDotFiniteItems(items);
    expect(out.map((x) => x.id)).toEqual(['a', 'd']);
  });

  it('drops items with non-string ids', () => {
    const items = [
      { id: 'a', label: 'A', before: 1, after: 2 },
      { id: 5 as unknown as string, label: 'B', before: 1, after: 2 },
    ];
    expect(getClevelandDotFiniteItems(items)).toHaveLength(1);
  });

  it('returns [] for non-array input', () => {
    expect(
      getClevelandDotFiniteItems(null as unknown as ChartClevelandDotItem[]),
    ).toEqual([]);
  });
});

describe('chart-cleveland-dot / getClevelandDotBounds', () => {
  it('spans across both endpoints', () => {
    expect(
      getClevelandDotBounds([
        { id: 'a', label: 'A', before: 1, after: 10 },
        { id: 'b', label: 'B', before: 3, after: 8 },
      ]),
    ).toEqual({ min: 1, max: 10 });
  });

  it('returns (0..1) for empty input', () => {
    expect(getClevelandDotBounds([])).toEqual({ min: 0, max: 1 });
  });

  it('expands +/- 0.5 when collapsed', () => {
    expect(
      getClevelandDotBounds([{ id: 'a', label: 'A', before: 5, after: 5 }]),
    ).toEqual({ min: 4.5, max: 5.5 });
  });
});

describe('chart-cleveland-dot / getClevelandDotTicks', () => {
  it('returns evenly-spaced ticks', () => {
    const ticks = getClevelandDotTicks(0, 100, 5);
    expect(ticks).toHaveLength(5);
    expect(ticks[0]!.value).toBe(0);
    expect(ticks[4]!.value).toBe(100);
  });

  it('returns single tick for collapsed range', () => {
    expect(getClevelandDotTicks(5, 5, 4)).toEqual([{ value: 5, position: 0 }]);
  });

  it('returns [] for invalid range', () => {
    expect(getClevelandDotTicks(10, 5, 4)).toEqual([]);
  });
});

describe('chart-cleveland-dot / sortClevelandDotItems', () => {
  const items: ChartClevelandDotItem[] = [
    { id: 'a', label: 'A', before: 5, after: 3 },
    { id: 'b', label: 'B', before: 1, after: 7 },
    { id: 'c', label: 'C', before: 3, after: 5 },
  ];

  it('preserves order when no sort given', () => {
    const out = sortClevelandDotItems(items);
    expect(out.map((x) => x.item.id)).toEqual(['a', 'b', 'c']);
  });

  it('sorts ascending by before', () => {
    const out = sortClevelandDotItems(items, 'before', 'asc');
    expect(out.map((x) => x.item.id)).toEqual(['b', 'c', 'a']);
  });

  it('sorts ascending by after', () => {
    const out = sortClevelandDotItems(items, 'after', 'asc');
    expect(out.map((x) => x.item.id)).toEqual(['a', 'c', 'b']);
  });

  it('sorts ascending by signed delta', () => {
    const out = sortClevelandDotItems(items, 'delta', 'asc');
    expect(out.map((x) => x.item.id)).toEqual(['a', 'c', 'b']);
  });

  it('sorts descending by abs delta', () => {
    const out = sortClevelandDotItems(items, 'absDelta', 'desc');
    expect(out[0]!.item.id).toBe('b');
  });

  it('preserves original indices after sort', () => {
    const out = sortClevelandDotItems(items, 'before', 'asc');
    expect(out.map((x) => x.originalIndex)).toEqual([1, 2, 0]);
  });
});

describe('chart-cleveland-dot / computeClevelandDotLayout', () => {
  it('returns empty when canvas is degenerate', () => {
    expect(
      computeClevelandDotLayout({
        items: [{ id: 'a', label: 'A', before: 1, after: 2 }],
        width: 10,
        height: 10,
        padding: 100,
      }).items,
    ).toEqual([]);
  });

  it('returns empty when no items', () => {
    expect(
      computeClevelandDotLayout({
        items: [],
        width: 500,
        height: 200,
        padding: 20,
      }).items,
    ).toEqual([]);
  });

  it('returns empty when no finite items', () => {
    expect(
      computeClevelandDotLayout({
        items: [{ id: 'a', label: 'A', before: NaN, after: 5 }],
        width: 500,
        height: 200,
        padding: 20,
      }).items,
    ).toEqual([]);
  });

  it('positions before + after dots on the same row (horizontal)', () => {
    const out = computeClevelandDotLayout({
      items: [
        { id: 'a', label: 'A', before: 0, after: 10 },
        { id: 'b', label: 'B', before: 5, after: 5 },
      ],
      orientation: 'horizontal',
      valueMin: 0,
      valueMax: 10,
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.items[0]!.beforeY).toBeCloseTo(out.items[0]!.afterY, 5);
    expect(out.items[0]!.beforeX).toBeCloseTo(40, 5);
    expect(out.items[0]!.afterX).toBeCloseTo(40 + (500 - 80), 5);
  });

  it('positions before + after dots on the same column (vertical)', () => {
    const out = computeClevelandDotLayout({
      items: [{ id: 'a', label: 'A', before: 0, after: 10 }],
      orientation: 'vertical',
      valueMin: 0,
      valueMax: 10,
      width: 200,
      height: 500,
      padding: 40,
    });
    expect(out.items[0]!.beforeX).toBeCloseTo(out.items[0]!.afterX, 5);
    expect(out.items[0]!.beforeY).toBeGreaterThan(out.items[0]!.afterY);
  });

  it('records direction per item', () => {
    const out = computeClevelandDotLayout({
      items: [
        { id: 'a', label: 'A', before: 1, after: 5 },
        { id: 'b', label: 'B', before: 5, after: 1 },
        { id: 'c', label: 'C', before: 3, after: 3 },
      ],
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.items[0]!.direction).toBe('up');
    expect(out.items[1]!.direction).toBe('down');
    expect(out.items[2]!.direction).toBe('flat');
  });

  it('counts up/down/flat in totals', () => {
    const out = computeClevelandDotLayout({
      items: [
        { id: 'a', label: 'A', before: 1, after: 5 },
        { id: 'b', label: 'B', before: 5, after: 1 },
        { id: 'c', label: 'C', before: 3, after: 3 },
        { id: 'd', label: 'D', before: 0, after: 5 },
      ],
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.upCount).toBe(2);
    expect(out.downCount).toBe(1);
    expect(out.flatCount).toBe(1);
  });

  it('respects sortBy + sortOrder', () => {
    const out = computeClevelandDotLayout({
      items: [
        { id: 'a', label: 'A', before: 5, after: 3 },
        { id: 'b', label: 'B', before: 1, after: 7 },
        { id: 'c', label: 'C', before: 3, after: 5 },
      ],
      sortBy: 'before',
      sortOrder: 'asc',
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.items.map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });

  it('preserves originalIndex after sort', () => {
    const out = computeClevelandDotLayout({
      items: [
        { id: 'a', label: 'A', before: 5, after: 3 },
        { id: 'b', label: 'B', before: 1, after: 7 },
      ],
      sortBy: 'before',
      sortOrder: 'asc',
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.items[0]!.originalIndex).toBe(1);
    expect(out.items[1]!.originalIndex).toBe(0);
  });

  it('paints connector with neutral colour by default', () => {
    const out = computeClevelandDotLayout({
      items: [{ id: 'a', label: 'A', before: 1, after: 5 }],
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.items[0]!.connectorColor).toBe(
      DEFAULT_CHART_CLEVELAND_DOT_NEUTRAL_COLOR,
    );
  });

  it('paints connector with positive colour when up and useDeltaColors=true', () => {
    const out = computeClevelandDotLayout({
      items: [{ id: 'a', label: 'A', before: 1, after: 5 }],
      useDeltaColors: true,
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.items[0]!.connectorColor).toBe(
      DEFAULT_CHART_CLEVELAND_DOT_POSITIVE_COLOR,
    );
  });

  it('paints connector with negative colour when down and useDeltaColors=true', () => {
    const out = computeClevelandDotLayout({
      items: [{ id: 'a', label: 'A', before: 5, after: 1 }],
      useDeltaColors: true,
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.items[0]!.connectorColor).toBe(
      DEFAULT_CHART_CLEVELAND_DOT_NEGATIVE_COLOR,
    );
  });

  it('overrides dot colour per item', () => {
    const out = computeClevelandDotLayout({
      items: [
        {
          id: 'a',
          label: 'A',
          before: 1,
          after: 5,
          beforeColor: '#aaa',
          afterColor: '#bbb',
        },
      ],
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.items[0]!.beforeColor).toBe('#aaa');
    expect(out.items[0]!.afterColor).toBe('#bbb');
  });

  it('drops items with non-finite endpoints from layout', () => {
    const out = computeClevelandDotLayout({
      items: [
        { id: 'a', label: 'A', before: NaN, after: 5 },
        { id: 'b', label: 'B', before: 1, after: 7 },
      ],
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.items).toHaveLength(1);
    expect(out.items[0]!.id).toBe('b');
  });

  it('records delta correctly', () => {
    const out = computeClevelandDotLayout({
      items: [{ id: 'a', label: 'A', before: 5, after: 8 }],
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.items[0]!.delta).toBeCloseTo(3, 10);
  });
});

describe('chart-cleveland-dot / describeClevelandDotChart', () => {
  it('returns "No data" when empty', () => {
    expect(describeClevelandDotChart([], 'Before', 'After')).toBe('No data');
  });

  it('returns "No data" when no finite items', () => {
    expect(
      describeClevelandDotChart(
        [{ id: 'a', label: 'A', before: NaN, after: 5 }],
        'Before',
        'After',
      ),
    ).toBe('No data');
  });

  it('summarises counts and range', () => {
    const out = describeClevelandDotChart(
      [
        { id: 'a', label: 'A', before: 1, after: 5 },
        { id: 'b', label: 'B', before: 5, after: 1 },
        { id: 'c', label: 'C', before: 3, after: 3 },
      ],
      'Before',
      'After',
    );
    expect(out).toContain('Before');
    expect(out).toContain('After');
    expect(out).toContain('3 categor');
    expect(out).toContain('1 up');
    expect(out).toContain('1 down');
    expect(out).toContain('1 flat');
  });

  it('uses singular "category" for one item', () => {
    const out = describeClevelandDotChart(
      [{ id: 'a', label: 'A', before: 1, after: 5 }],
      'B',
      'A',
    );
    expect(out).toContain('1 category');
  });

  it('uses custom formatter', () => {
    const out = describeClevelandDotChart(
      [{ id: 'a', label: 'A', before: 1, after: 5 }],
      'B',
      'A',
      (n) => `${n}%`,
    );
    expect(out).toContain('1%');
    expect(out).toContain('5%');
  });
});

const FIXTURE: ChartClevelandDotItem[] = [
  { id: 'a', label: 'Alpha', before: 30, after: 50 },
  { id: 'b', label: 'Beta', before: 80, after: 40 },
  { id: 'c', label: 'Gamma', before: 20, after: 20 },
];

describe('chart-cleveland-dot / <ChartClevelandDot>', () => {
  it('renders a root region with the default aria label', () => {
    render(<ChartClevelandDot items={FIXTURE} />);
    const root = document.querySelector(
      '[data-section="chart-cleveland-dot"]',
    )!;
    expect(root.getAttribute('aria-label')).toBe('Cleveland dot plot');
  });

  it('exposes orientation + counts + sort + delta flag as data attrs', () => {
    render(
      <ChartClevelandDot
        items={FIXTURE}
        orientation="vertical"
        sortBy="delta"
        sortOrder="desc"
        useDeltaColors
      />,
    );
    const root = document.querySelector(
      '[data-section="chart-cleveland-dot"]',
    )!;
    expect(root.getAttribute('data-orientation')).toBe('vertical');
    expect(root.getAttribute('data-sort-by')).toBe('delta');
    expect(root.getAttribute('data-sort-order')).toBe('desc');
    expect(root.getAttribute('data-use-delta-colors')).toBe('true');
    expect(root.getAttribute('data-up-count')).toBe('1');
    expect(root.getAttribute('data-down-count')).toBe('1');
    expect(root.getAttribute('data-flat-count')).toBe('1');
  });

  it('renders an aria description with summary text', () => {
    render(<ChartClevelandDot items={FIXTURE} />);
    const desc = document.querySelector(
      '[data-section="chart-cleveland-dot-aria-desc"]',
    );
    expect(desc?.textContent ?? '').toContain('3 categor');
  });

  it('respects a custom aria description', () => {
    render(<ChartClevelandDot items={FIXTURE} ariaDescription="custom" />);
    expect(
      document.querySelector('[data-section="chart-cleveland-dot-aria-desc"]')
        ?.textContent,
    ).toBe('custom');
  });

  it('renders two dots and one connector per item', () => {
    render(<ChartClevelandDot items={FIXTURE} />);
    expect(
      document.querySelectorAll('[data-section="chart-cleveland-dot-dot"]')
        .length,
    ).toBe(6);
    expect(
      document.querySelectorAll(
        '[data-section="chart-cleveland-dot-connector"]',
      ).length,
    ).toBe(3);
  });

  it('renders before + after dots with distinct data-series attrs', () => {
    render(<ChartClevelandDot items={FIXTURE} />);
    const beforeDots = document.querySelectorAll(
      '[data-section="chart-cleveland-dot-dot"][data-series="before"]',
    );
    const afterDots = document.querySelectorAll(
      '[data-section="chart-cleveland-dot-dot"][data-series="after"]',
    );
    expect(beforeDots.length).toBe(3);
    expect(afterDots.length).toBe(3);
  });

  it('renders a category label per item by default', () => {
    render(<ChartClevelandDot items={FIXTURE} />);
    const lbls = document.querySelectorAll(
      '[data-section="chart-cleveland-dot-category-text"]',
    );
    expect(lbls.length).toBe(3);
    expect(lbls[0]?.textContent).toBe('Alpha');
  });

  it('omits category labels when showCategoryLabels=false', () => {
    render(
      <ChartClevelandDot items={FIXTURE} showCategoryLabels={false} />,
    );
    expect(
      document.querySelectorAll(
        '[data-section="chart-cleveland-dot-category-text"]',
      ).length,
    ).toBe(0);
  });

  it('renders value labels when showValueLabels=true', () => {
    render(<ChartClevelandDot items={FIXTURE} showValueLabels />);
    const lbls = document.querySelectorAll(
      '[data-section="chart-cleveland-dot-value-text"]',
    );
    expect(lbls.length).toBe(6);
  });

  it('shows tooltip on dot hover', () => {
    render(<ChartClevelandDot items={FIXTURE} />);
    const dot = document.querySelectorAll(
      '[data-section="chart-cleveland-dot-dot"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(dot);
    const tip = document.querySelector(
      '[data-section="chart-cleveland-dot-tooltip"]',
    );
    expect(tip).not.toBeNull();
    expect(tip!.textContent).toContain('Alpha');
    expect(tip!.textContent).toContain('Before');
    expect(tip!.textContent).toContain('After');
  });

  it('hides tooltip on mouse leave', () => {
    render(<ChartClevelandDot items={FIXTURE} />);
    const dot = document.querySelectorAll(
      '[data-section="chart-cleveland-dot-dot"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(dot);
    fireEvent.mouseLeave(dot);
    expect(
      document.querySelector('[data-section="chart-cleveland-dot-tooltip"]'),
    ).toBeNull();
  });

  it('fires onItemClick with item + layout + series', () => {
    const handler = vi.fn();
    render(<ChartClevelandDot items={FIXTURE} onItemClick={handler} />);
    const dot = document.querySelectorAll(
      '[data-section="chart-cleveland-dot-dot"][data-series="after"]',
    )[0] as SVGElement;
    fireEvent.click(dot);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0]!.series).toBe('after');
    expect(handler.mock.calls[0]![0]!.item.id).toBe('a');
  });

  it('hides axis when showAxis=false', () => {
    render(<ChartClevelandDot items={FIXTURE} showAxis={false} />);
    expect(
      document.querySelector('[data-section="chart-cleveland-dot-axes"]'),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    render(<ChartClevelandDot items={FIXTURE} showGrid={false} />);
    expect(
      document.querySelector('[data-section="chart-cleveland-dot-grid"]'),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    render(<ChartClevelandDot items={FIXTURE} showLegend={false} />);
    expect(
      document.querySelector('[data-section="chart-cleveland-dot-legend"]'),
    ).toBeNull();
  });

  it('renders before + after labels in legend', () => {
    render(
      <ChartClevelandDot
        items={FIXTURE}
        beforeLabel="2020"
        afterLabel="2025"
      />,
    );
    const lbls = document.querySelectorAll(
      '[data-section="chart-cleveland-dot-legend-label"]',
    );
    expect(lbls[0]?.textContent).toBe('2020');
    expect(lbls[1]?.textContent).toBe('2025');
  });

  it('hides tooltip when showTooltip=false', () => {
    render(<ChartClevelandDot items={FIXTURE} showTooltip={false} />);
    const dot = document.querySelectorAll(
      '[data-section="chart-cleveland-dot-dot"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(dot);
    expect(
      document.querySelector('[data-section="chart-cleveland-dot-tooltip"]'),
    ).toBeNull();
  });

  it('applies the animate flag to the data attribute', () => {
    render(<ChartClevelandDot items={FIXTURE} animate={false} />);
    const root = document.querySelector(
      '[data-section="chart-cleveland-dot"]',
    )!;
    expect(root.getAttribute('data-animate')).toBe('false');
  });

  it('renders the optional value label', () => {
    render(<ChartClevelandDot items={FIXTURE} valueLabel="ms" />);
    expect(
      document.querySelector(
        '[data-section="chart-cleveland-dot-value-label"]',
      )?.textContent,
    ).toBe('ms');
  });

  it('uses formatValue for axis ticks', () => {
    render(
      <ChartClevelandDot items={FIXTURE} formatValue={(n) => `v${n}`} />,
    );
    const t = document.querySelector(
      '[data-section="chart-cleveland-dot-tick-label"]',
    );
    expect(t?.textContent?.startsWith('v')).toBe(true);
  });

  it('uses formatCategory for tooltip header', () => {
    render(
      <ChartClevelandDot
        items={FIXTURE}
        formatCategory={(it) => `${it.label}!`}
      />,
    );
    const dot = document.querySelectorAll(
      '[data-section="chart-cleveland-dot-dot"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(dot);
    const tip = document.querySelector(
      '[data-section="chart-cleveland-dot-tooltip-label"]',
    );
    expect(tip?.textContent).toBe('Alpha!');
  });

  it('exposes item data attrs', () => {
    render(<ChartClevelandDot items={FIXTURE} />);
    const it = document.querySelectorAll(
      '[data-section="chart-cleveland-dot-item"]',
    )[0] as HTMLElement;
    expect(it.getAttribute('data-item-id')).toBe('a');
    expect(it.getAttribute('data-item-direction')).toBe('up');
    expect(it.getAttribute('data-item-before')).toBe('30');
    expect(it.getAttribute('data-item-after')).toBe('50');
    expect(it.getAttribute('data-item-delta')).toBe('20');
  });

  it('renders empty state when no items', () => {
    render(<ChartClevelandDot items={[]} />);
    expect(
      document.querySelectorAll('[data-section="chart-cleveland-dot-dot"]')
        .length,
    ).toBe(0);
    expect(
      document.querySelector('[data-section="chart-cleveland-dot-aria-desc"]')
        ?.textContent,
    ).toBe('No data');
  });

  it('renders per-dot aria-label with category, both values, and direction', () => {
    render(<ChartClevelandDot items={FIXTURE} />);
    const dot = document.querySelectorAll(
      '[data-section="chart-cleveland-dot-dot"]',
    )[0] as SVGElement;
    const label = dot.getAttribute('aria-label') ?? '';
    expect(label).toContain('Alpha');
    expect(label).toContain('30');
    expect(label).toContain('50');
    expect(label).toContain('up');
  });

  it('keyboard focus opens the tooltip', () => {
    render(<ChartClevelandDot items={FIXTURE} />);
    const dot = document.querySelectorAll(
      '[data-section="chart-cleveland-dot-dot"]',
    )[0] as SVGElement;
    fireEvent.focus(dot);
    expect(
      document.querySelector('[data-section="chart-cleveland-dot-tooltip"]'),
    ).not.toBeNull();
  });

  it('sets data-hovered on the hovered item group', () => {
    render(<ChartClevelandDot items={FIXTURE} />);
    const dot = document.querySelectorAll(
      '[data-section="chart-cleveland-dot-dot"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(dot);
    const itemGroup = document.querySelector(
      '[data-section="chart-cleveland-dot-item"][data-item-id="a"]',
    )!;
    expect(itemGroup.getAttribute('data-hovered')).toBe('true');
  });

  it('renders grid lines per tick when showGrid=true', () => {
    render(<ChartClevelandDot items={FIXTURE} tickCount={4} />);
    const lines = document.querySelectorAll(
      '[data-section="chart-cleveland-dot-grid-line"]',
    );
    expect(lines.length).toBeGreaterThanOrEqual(2);
  });

  it('renders items in sorted order in the DOM', () => {
    render(
      <ChartClevelandDot items={FIXTURE} sortBy="delta" sortOrder="desc" />,
    );
    const itemEls = document.querySelectorAll(
      '[data-section="chart-cleveland-dot-item"]',
    );
    expect(itemEls[0]!.getAttribute('data-item-id')).toBe('a');
    expect(itemEls[2]!.getAttribute('data-item-id')).toBe('b');
  });
});
