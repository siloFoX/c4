import { afterEach, describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import {
  ChartBubble,
  computeBubbleLayout,
  describeBubbleChart,
  getBubbleBounds,
  getBubbleCategories,
  getBubbleCategoryColor,
  getBubbleDefaultColor,
  getBubbleRadius,
  getBubbleTicks,
  DEFAULT_CHART_BUBBLE_WIDTH,
  DEFAULT_CHART_BUBBLE_HEIGHT,
  DEFAULT_CHART_BUBBLE_PADDING,
  DEFAULT_CHART_BUBBLE_TICK_COUNT,
  DEFAULT_CHART_BUBBLE_MIN_RADIUS,
  DEFAULT_CHART_BUBBLE_MAX_RADIUS,
  DEFAULT_CHART_BUBBLE_COLOR,
  DEFAULT_CHART_BUBBLE_PALETTE,
  type ChartBubblePoint,
} from './chart-bubble';

afterEach(() => cleanup());

const SAMPLE: ChartBubblePoint[] = [
  { id: 'a', label: 'Alpha', x: 1, y: 10, size: 5, category: 'red' },
  { id: 'b', label: 'Beta', x: 2, y: 20, size: 10, category: 'red' },
  { id: 'c', label: 'Gamma', x: 3, y: 30, size: 20, category: 'blue' },
  { id: 'd', label: 'Delta', x: 4, y: 40, size: 1, category: 'blue' },
];

describe('chart-bubble constants', () => {
  it('exports the documented defaults', () => {
    expect(DEFAULT_CHART_BUBBLE_WIDTH).toBe(560);
    expect(DEFAULT_CHART_BUBBLE_HEIGHT).toBe(360);
    expect(DEFAULT_CHART_BUBBLE_PADDING).toBe(40);
    expect(DEFAULT_CHART_BUBBLE_TICK_COUNT).toBe(5);
    expect(DEFAULT_CHART_BUBBLE_MIN_RADIUS).toBe(4);
    expect(DEFAULT_CHART_BUBBLE_MAX_RADIUS).toBe(28);
    expect(DEFAULT_CHART_BUBBLE_COLOR).toBe('#2563eb');
    expect(DEFAULT_CHART_BUBBLE_PALETTE.length).toBe(10);
  });
});

describe('getBubbleDefaultColor', () => {
  it('returns the palette entry at the given index', () => {
    expect(getBubbleDefaultColor(0)).toBe(DEFAULT_CHART_BUBBLE_PALETTE[0]);
    expect(getBubbleDefaultColor(2)).toBe(DEFAULT_CHART_BUBBLE_PALETTE[2]);
  });
  it('wraps modulo the palette length', () => {
    expect(getBubbleDefaultColor(DEFAULT_CHART_BUBBLE_PALETTE.length)).toBe(
      DEFAULT_CHART_BUBBLE_PALETTE[0]
    );
  });
  it('falls back to color 0 for invalid input', () => {
    expect(getBubbleDefaultColor(Number.NaN)).toBe(DEFAULT_CHART_BUBBLE_PALETTE[0]);
    expect(getBubbleDefaultColor(-1)).toBe(DEFAULT_CHART_BUBBLE_PALETTE[0]);
  });
});

describe('getBubbleBounds', () => {
  it('returns (0..1, 0..1) for an empty list', () => {
    const b = getBubbleBounds([]);
    expect(b.xMin).toBe(0);
    expect(b.xMax).toBe(1);
    expect(b.yMin).toBe(0);
    expect(b.yMax).toBe(1);
    expect(b.sizeMin).toBe(0);
    expect(b.sizeMax).toBe(0);
  });
  it('computes min/max across x/y/size', () => {
    const b = getBubbleBounds(SAMPLE);
    expect(b.xMin).toBe(1);
    expect(b.xMax).toBe(4);
    expect(b.yMin).toBe(10);
    expect(b.yMax).toBe(40);
    expect(b.sizeMin).toBe(1);
    expect(b.sizeMax).toBe(20);
  });
  it('expands collapsed x range by +/-0.5', () => {
    const b = getBubbleBounds([
      { id: 'a', x: 5, y: 1, size: 1 },
      { id: 'b', x: 5, y: 2, size: 2 },
    ]);
    expect(b.xMin).toBeCloseTo(4.5);
    expect(b.xMax).toBeCloseTo(5.5);
  });
  it('expands collapsed y range by +/-0.5', () => {
    const b = getBubbleBounds([
      { id: 'a', x: 1, y: 7, size: 1 },
      { id: 'b', x: 2, y: 7, size: 2 },
    ]);
    expect(b.yMin).toBeCloseTo(6.5);
    expect(b.yMax).toBeCloseTo(7.5);
  });
  it('ignores non-finite x / y (collapsed range then expands)', () => {
    const b = getBubbleBounds([
      { id: 'a', x: Number.NaN, y: 5, size: 1 },
      { id: 'b', x: 2, y: 3, size: 2 },
    ]);
    expect(b.xMin).toBeCloseTo(1.5);
    expect(b.xMax).toBeCloseTo(2.5);
  });
});

describe('getBubbleRadius', () => {
  it('returns minRadius when size is 0 and range is healthy', () => {
    expect(getBubbleRadius(0, 0, 100, 4, 28)).toBeCloseTo(4);
  });
  it('returns maxRadius when size is at the upper bound', () => {
    expect(getBubbleRadius(100, 0, 100, 4, 28)).toBeCloseTo(28);
  });
  it('uses the sqrt interpolation', () => {
    const r = getBubbleRadius(25, 0, 100, 0, 10);
    expect(r).toBeCloseTo(5);
  });
  it('returns (min+max)/2 when sizeMax <= sizeMin', () => {
    expect(getBubbleRadius(7, 5, 5, 4, 28)).toBeCloseTo(16);
  });
  it('clamps non-finite / negative size to 0', () => {
    expect(getBubbleRadius(Number.NaN, 0, 100, 4, 28)).toBeCloseTo(4);
    expect(getBubbleRadius(-5, 0, 100, 4, 28)).toBeCloseTo(4);
  });
});

describe('getBubbleCategories', () => {
  it('returns the unique non-empty categories in first-seen order', () => {
    expect(getBubbleCategories(SAMPLE)).toEqual(['red', 'blue']);
  });
  it('skips empty / undefined categories', () => {
    const cats = getBubbleCategories([
      { id: 'a', x: 1, y: 1, size: 1 },
      { id: 'b', x: 2, y: 2, size: 1, category: '' },
      { id: 'c', x: 3, y: 3, size: 1, category: 'X' },
    ]);
    expect(cats).toEqual(['X']);
  });
});

describe('getBubbleCategoryColor', () => {
  it('returns palette[idx] for a known category', () => {
    const cats = ['red', 'blue', 'green'];
    expect(getBubbleCategoryColor('red', cats)).toBe(getBubbleDefaultColor(0));
    expect(getBubbleCategoryColor('blue', cats)).toBe(getBubbleDefaultColor(1));
  });
  it('returns the default color for unknown / null', () => {
    expect(getBubbleCategoryColor(null, ['x'])).toBe(DEFAULT_CHART_BUBBLE_COLOR);
    expect(getBubbleCategoryColor('zzz', ['x'])).toBe(
      DEFAULT_CHART_BUBBLE_COLOR
    );
  });
});

describe('getBubbleTicks', () => {
  it('returns count evenly-spaced inclusive ticks', () => {
    const t = getBubbleTicks(0, 10, 5);
    expect(t).toHaveLength(5);
    expect(t[0]).toBeCloseTo(0);
    expect(t[4]).toBeCloseTo(10);
  });
  it('collapsed range returns [min]', () => {
    expect(getBubbleTicks(5, 5, 5)).toEqual([5]);
  });
  it('clamps count to >= 2', () => {
    expect(getBubbleTicks(0, 1, 1).length).toBe(2);
  });
});

describe('computeBubbleLayout', () => {
  const bounds = getBubbleBounds(SAMPLE);
  const innerW = 480;
  const innerH = 280;
  const padX = 40;
  const padY = 40;

  it('returns one entry per visible valid point', () => {
    const out = computeBubbleLayout({
      points: SAMPLE,
      hidden: new Set(),
      categories: ['red', 'blue'],
      bounds,
      innerW,
      innerH,
      padX,
      padY,
      minRadius: 4,
      maxRadius: 28,
    });
    expect(out).toHaveLength(4);
  });

  it('skips hidden categories', () => {
    const out = computeBubbleLayout({
      points: SAMPLE,
      hidden: new Set(['red']),
      categories: ['red', 'blue'],
      bounds,
      innerW,
      innerH,
      padX,
      padY,
      minRadius: 4,
      maxRadius: 28,
    });
    expect(out.map((p) => p.id)).toEqual(['c', 'd']);
  });

  it('also skips id-level hidden ids', () => {
    const out = computeBubbleLayout({
      points: SAMPLE,
      hidden: new Set(['a']),
      categories: ['red', 'blue'],
      bounds,
      innerW,
      innerH,
      padX,
      padY,
      minRadius: 4,
      maxRadius: 28,
    });
    expect(out.map((p) => p.id)).toEqual(['b', 'c', 'd']);
  });

  it('skips non-finite x / y entries', () => {
    const data: ChartBubblePoint[] = [
      { id: 'a', x: Number.NaN, y: 1, size: 1 },
      { id: 'b', x: 2, y: 2, size: 1 },
    ];
    const out = computeBubbleLayout({
      points: data,
      hidden: new Set(),
      categories: [],
      bounds: getBubbleBounds(data),
      innerW,
      innerH,
      padX,
      padY,
      minRadius: 4,
      maxRadius: 28,
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe('b');
  });

  it('maps x to cx (left edge at xMin, right edge at xMax)', () => {
    const out = computeBubbleLayout({
      points: SAMPLE,
      hidden: new Set(),
      categories: ['red', 'blue'],
      bounds,
      innerW,
      innerH,
      padX,
      padY,
      minRadius: 4,
      maxRadius: 28,
    });
    const first = out.find((p) => p.id === 'a')!;
    const last = out.find((p) => p.id === 'd')!;
    expect(first.cx).toBeCloseTo(padX);
    expect(last.cx).toBeCloseTo(padX + innerW);
  });

  it('maps y to cy with SVG y-down (yMax at top, yMin at bottom)', () => {
    const out = computeBubbleLayout({
      points: SAMPLE,
      hidden: new Set(),
      categories: ['red', 'blue'],
      bounds,
      innerW,
      innerH,
      padX,
      padY,
      minRadius: 4,
      maxRadius: 28,
    });
    const top = out.find((p) => p.id === 'd')!;
    const bottom = out.find((p) => p.id === 'a')!;
    expect(top.cy).toBeCloseTo(padY);
    expect(bottom.cy).toBeCloseTo(padY + innerH);
  });

  it('radius is sqrt-scaled to size', () => {
    const out = computeBubbleLayout({
      points: SAMPLE,
      hidden: new Set(),
      categories: ['red', 'blue'],
      bounds,
      innerW,
      innerH,
      padX,
      padY,
      minRadius: 4,
      maxRadius: 28,
    });
    const smallest = out.find((p) => p.id === 'd')!;
    const largest = out.find((p) => p.id === 'c')!;
    expect(smallest.r).toBeCloseTo(4);
    expect(largest.r).toBeCloseTo(28);
  });

  it('falls back to default color when no category present', () => {
    const out = computeBubbleLayout({
      points: [{ id: 'a', x: 1, y: 1, size: 1 }],
      hidden: new Set(),
      categories: [],
      bounds: getBubbleBounds([{ id: 'a', x: 1, y: 1, size: 1 }]),
      innerW,
      innerH,
      padX,
      padY,
      minRadius: 4,
      maxRadius: 28,
    });
    expect(out[0]!.color).toBe(DEFAULT_CHART_BUBBLE_COLOR);
  });

  it('per-point color override beats category palette', () => {
    const data: ChartBubblePoint[] = [
      { id: 'a', x: 1, y: 1, size: 1, category: 'red', color: '#abcdef' },
    ];
    const out = computeBubbleLayout({
      points: data,
      hidden: new Set(),
      categories: ['red'],
      bounds: getBubbleBounds(data),
      innerW,
      innerH,
      padX,
      padY,
      minRadius: 4,
      maxRadius: 28,
    });
    expect(out[0]!.color).toBe('#abcdef');
  });

  it('returns [] when inner dimensions are non-positive', () => {
    const out = computeBubbleLayout({
      points: SAMPLE,
      hidden: new Set(),
      categories: [],
      bounds,
      innerW: 0,
      innerH: 0,
      padX,
      padY,
      minRadius: 4,
      maxRadius: 28,
    });
    expect(out).toEqual([]);
  });
});

describe('describeBubbleChart', () => {
  it('returns "No data" for an empty list', () => {
    expect(describeBubbleChart([])).toBe('No data');
  });
  it('returns "No data" when no point has finite x/y', () => {
    expect(
      describeBubbleChart([
        { id: 'a', x: Number.NaN, y: 1, size: 1 },
      ])
    ).toBe('No data');
  });
  it('includes count + x/y ranges', () => {
    const desc = describeBubbleChart(SAMPLE);
    expect(desc).toContain('4 bubbles');
    expect(desc).toContain('x range 1');
    expect(desc).toContain('y range 10');
  });
  it('mentions categories when present', () => {
    expect(describeBubbleChart(SAMPLE)).toContain('2 categories');
  });
  it('honors formatValue', () => {
    const desc = describeBubbleChart(SAMPLE, (v) => `$${v}`);
    expect(desc).toContain('$1');
  });
});

describe('<ChartBubble> component', () => {
  it('renders a region with role + custom aria-label', () => {
    const { getByRole } = render(
      <ChartBubble data={SAMPLE} ariaLabel="Test bubble" />
    );
    expect(getByRole('region', { name: 'Test bubble' })).toBeTruthy();
  });

  it('renders one bubble per visible valid point', () => {
    const { container } = render(<ChartBubble data={SAMPLE} />);
    const pts = container.querySelectorAll('[data-section="chart-bubble-point"]');
    expect(pts.length).toBe(4);
  });

  it('per-point data attrs carry x/y/size/color/category/r', () => {
    const { container } = render(<ChartBubble data={SAMPLE} />);
    const pts = container.querySelectorAll(
      '[data-section="chart-bubble-point"]'
    );
    const last = pts[pts.length - 1]!;
    expect(last.getAttribute('data-point-id')).toBe('d');
    expect(last.getAttribute('data-point-x')).toBe('4');
    expect(last.getAttribute('data-point-y')).toBe('40');
    expect(last.getAttribute('data-point-size')).toBe('1');
    expect(last.getAttribute('data-point-category')).toBe('blue');
    expect(last.getAttribute('data-point-color')).toBeTruthy();
    expect(last.getAttribute('data-point-r')).toBeTruthy();
  });

  it('root mirrors counts + animate', () => {
    const { container } = render(
      <ChartBubble data={SAMPLE} defaultHiddenCategories={['red']} />
    );
    const root = container.querySelector('[data-section="chart-bubble"]');
    expect(root?.getAttribute('data-bubble-count')).toBe('4');
    expect(root?.getAttribute('data-visible-count')).toBe('2');
    expect(root?.getAttribute('data-category-count')).toBe('2');
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('circle path is role=graphics-symbol + tabIndex=0 with aria-label', () => {
    const { container } = render(<ChartBubble data={SAMPLE} />);
    const c = container.querySelector(
      '[data-section="chart-bubble-circle"]'
    ) as SVGCircleElement | null;
    expect(c).not.toBeNull();
    expect(c!.getAttribute('role')).toBe('graphics-symbol');
    expect(c!.getAttribute('tabindex')).toBe('0');
    expect(c!.getAttribute('aria-label')).toContain('Alpha');
    expect(c!.getAttribute('aria-label')).toContain('x 1');
    expect(c!.getAttribute('aria-label')).toContain('y 10');
    expect(c!.getAttribute('aria-label')).toContain('size 5');
  });

  it('legend renders one button per category', () => {
    const { container } = render(<ChartBubble data={SAMPLE} />);
    const buttons = container.querySelectorAll(
      '[data-section="chart-bubble-legend-button"]'
    );
    expect(buttons.length).toBe(2);
  });

  it('legend toggle fires onCategoryToggle + reduces visible count (uncontrolled)', () => {
    const onCategoryToggle = vi.fn();
    const { container } = render(
      <ChartBubble data={SAMPLE} onCategoryToggle={onCategoryToggle} />
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-bubble-legend-button"]'
    );
    fireEvent.click(buttons[0]!);
    expect(onCategoryToggle).toHaveBeenCalledTimes(1);
    const arg = onCategoryToggle.mock.calls[0]![0];
    expect(arg.category).toBe('red');
    expect(arg.hidden).toBe(true);
    const root = container.querySelector('[data-section="chart-bubble"]');
    expect(root?.getAttribute('data-visible-count')).toBe('2');
  });

  it('legend respects controlled hiddenCategories', () => {
    const { container } = render(
      <ChartBubble data={SAMPLE} hiddenCategories={['blue']} />
    );
    const root = container.querySelector('[data-section="chart-bubble"]');
    expect(root?.getAttribute('data-visible-count')).toBe('2');
  });

  it('showLegend=false suppresses the legend', () => {
    const { container } = render(<ChartBubble data={SAMPLE} showLegend={false} />);
    expect(
      container.querySelector('[data-section="chart-bubble-legend"]')
    ).toBeNull();
  });

  it('legend is absent when no point has a category', () => {
    const data: ChartBubblePoint[] = [
      { id: 'a', x: 1, y: 1, size: 1 },
      { id: 'b', x: 2, y: 2, size: 1 },
    ];
    const { container } = render(<ChartBubble data={data} />);
    expect(
      container.querySelector('[data-section="chart-bubble-legend"]')
    ).toBeNull();
  });

  it('legend placement = right reverses layout', () => {
    const { container } = render(
      <ChartBubble data={SAMPLE} legendPlacement="right" />
    );
    const legend = container.querySelector(
      '[data-section="chart-bubble-legend"]'
    );
    expect(legend?.getAttribute('data-placement')).toBe('right');
  });

  it('axis ticks render by default', () => {
    const { container } = render(<ChartBubble data={SAMPLE} />);
    expect(
      container.querySelectorAll('[data-section="chart-bubble-tick"]').length
    ).toBeGreaterThan(0);
  });

  it('showAxisTicks=false suppresses ticks', () => {
    const { container } = render(<ChartBubble data={SAMPLE} showAxisTicks={false} />);
    expect(
      container.querySelector('[data-section="chart-bubble-ticks"]')
    ).toBeNull();
  });

  it('grid renders by default; showGrid=false suppresses', () => {
    const a = render(<ChartBubble data={SAMPLE} />);
    expect(
      a.container.querySelector('[data-section="chart-bubble-grid"]')
    ).not.toBeNull();
    cleanup();
    const b = render(<ChartBubble data={SAMPLE} showGrid={false} />);
    expect(
      b.container.querySelector('[data-section="chart-bubble-grid"]')
    ).toBeNull();
  });

  it('x / y labels render when supplied', () => {
    const { container } = render(
      <ChartBubble data={SAMPLE} xLabel="X axis" yLabel="Y axis" />
    );
    expect(
      container.querySelector('[data-section="chart-bubble-x-label"]')!
        .textContent
    ).toBe('X axis');
    expect(
      container.querySelector('[data-section="chart-bubble-y-label"]')!
        .textContent
    ).toBe('Y axis');
  });

  it('tooltip opens on bubble mouseenter with label / category / x / y / size', () => {
    const { container } = render(<ChartBubble data={SAMPLE} />);
    const pts = container.querySelectorAll(
      '[data-section="chart-bubble-point"]'
    );
    fireEvent.mouseEnter(pts[2]! as HTMLElement);
    expect(
      container.querySelector('[data-section="chart-bubble-tooltip"]')
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-bubble-tooltip-label"]'
      )?.textContent
    ).toBe('Gamma');
    expect(
      container.querySelector(
        '[data-section="chart-bubble-tooltip-category"]'
      )?.textContent
    ).toBe('blue');
    expect(
      container.querySelector(
        '[data-section="chart-bubble-tooltip-x"]'
      )?.textContent
    ).toBe('x: 3');
    expect(
      container.querySelector(
        '[data-section="chart-bubble-tooltip-y"]'
      )?.textContent
    ).toBe('y: 30');
    expect(
      container.querySelector(
        '[data-section="chart-bubble-tooltip-size"]'
      )?.textContent
    ).toBe('size: 20');
  });

  it('tooltip hides on mouseleave', () => {
    const { container } = render(<ChartBubble data={SAMPLE} />);
    const pts = container.querySelectorAll(
      '[data-section="chart-bubble-point"]'
    );
    fireEvent.mouseEnter(pts[0]! as HTMLElement);
    expect(
      container.querySelector('[data-section="chart-bubble-tooltip"]')
    ).not.toBeNull();
    fireEvent.mouseLeave(pts[0]! as HTMLElement);
    expect(
      container.querySelector('[data-section="chart-bubble-tooltip"]')
    ).toBeNull();
  });

  it('showTooltip=false suppresses tooltip', () => {
    const { container } = render(
      <ChartBubble data={SAMPLE} showTooltip={false} />
    );
    fireEvent.mouseEnter(
      container.querySelector(
        '[data-section="chart-bubble-point"]'
      )! as HTMLElement
    );
    expect(
      container.querySelector('[data-section="chart-bubble-tooltip"]')
    ).toBeNull();
  });

  it('formatValue + formatSize reach the tooltip', () => {
    const { container } = render(
      <ChartBubble
        data={SAMPLE}
        formatValue={(v) => `$${v}`}
        formatSize={(v) => `${v}sz`}
      />
    );
    fireEvent.mouseEnter(
      container.querySelector(
        '[data-section="chart-bubble-point"]'
      )! as HTMLElement
    );
    expect(
      container.querySelector(
        '[data-section="chart-bubble-tooltip-x"]'
      )?.textContent
    ).toBe('x: $1');
    expect(
      container.querySelector(
        '[data-section="chart-bubble-tooltip-size"]'
      )?.textContent
    ).toBe('size: 5sz');
  });

  it('onBubbleClick fires with point + layout', () => {
    const onBubbleClick = vi.fn();
    const { container } = render(
      <ChartBubble data={SAMPLE} onBubbleClick={onBubbleClick} />
    );
    const pts = container.querySelectorAll(
      '[data-section="chart-bubble-point"]'
    );
    fireEvent.click(pts[1]! as HTMLElement);
    expect(onBubbleClick).toHaveBeenCalledTimes(1);
    const payload = onBubbleClick.mock.calls[0]![0];
    expect(payload.point.id).toBe('b');
    expect(payload.layout.id).toBe('b');
  });

  it('data-hovered mirrors hover state', () => {
    const { container } = render(<ChartBubble data={SAMPLE} />);
    const pt = container.querySelector(
      '[data-section="chart-bubble-point"]'
    ) as HTMLElement;
    expect(pt.getAttribute('data-hovered')).toBe('false');
    fireEvent.mouseEnter(pt);
    expect(pt.getAttribute('data-hovered')).toBe('true');
    fireEvent.mouseLeave(pt);
    expect(pt.getAttribute('data-hovered')).toBe('false');
  });

  it('auto aria description renders', () => {
    const { container } = render(<ChartBubble data={SAMPLE} />);
    const d = container.querySelector('[data-section="chart-bubble-aria-desc"]');
    expect(d?.textContent).toContain('4 bubbles');
  });

  it('aria-description override beats auto', () => {
    const { container } = render(
      <ChartBubble data={SAMPLE} ariaDescription="Override" />
    );
    expect(
      container.querySelector('[data-section="chart-bubble-aria-desc"]')!
        .textContent
    ).toBe('Override');
  });

  it('controlled bounds override auto bounds', () => {
    const { container } = render(
      <ChartBubble
        data={SAMPLE}
        xMin={0}
        xMax={10}
        yMin={0}
        yMax={100}
      />
    );
    const last = container.querySelectorAll(
      '[data-section="chart-bubble-point"]'
    );
    const d = Array.from(last).find(
      (n) => n.getAttribute('data-point-id') === 'd'
    )!;
    expect(d).toBeTruthy();
  });

  it('data-animate mirrors prop', () => {
    const a = render(<ChartBubble data={SAMPLE} animate={false} />);
    expect(
      a.container.querySelector('[data-section="chart-bubble"]')!
        .getAttribute('data-animate')
    ).toBe('false');
  });

  it('SVG mirrors width / height / viewBox', () => {
    const { container } = render(
      <ChartBubble data={SAMPLE} width={400} height={200} />
    );
    const svg = container.querySelector(
      '[data-section="chart-bubble-svg"]'
    ) as SVGElement;
    expect(svg.getAttribute('width')).toBe('400');
    expect(svg.getAttribute('height')).toBe('200');
    expect(svg.getAttribute('viewBox')).toBe('0 0 400 200');
  });

  it('empty data renders without crashing', () => {
    const { container } = render(<ChartBubble data={[]} />);
    expect(
      container.querySelectorAll('[data-section="chart-bubble-point"]').length
    ).toBe(0);
    expect(
      container.querySelector('[data-section="chart-bubble-aria-desc"]')!
        .textContent
    ).toBe('No data');
  });

  it('forwards ref to root', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartBubble data={SAMPLE} ref={ref} />);
    expect(ref.current?.dataset.section).toBe('chart-bubble');
  });

  it('has stable displayName', () => {
    expect(ChartBubble.displayName).toBe('ChartBubble');
  });
});
