import { afterEach, describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import {
  ChartDonut,
  computeDonutArcs,
  describeDonutChart,
  getDonutDefaultColor,
  getDonutTotal,
  getDonutVisibleTotal,
  polarToCartesian,
  DEFAULT_CHART_DONUT_WIDTH,
  DEFAULT_CHART_DONUT_HEIGHT,
  DEFAULT_CHART_DONUT_PADDING,
  DEFAULT_CHART_DONUT_THICKNESS_RATIO,
  DEFAULT_CHART_DONUT_PAD_ANGLE,
  DEFAULT_CHART_DONUT_CORNER_RADIUS,
  DEFAULT_CHART_DONUT_START_ANGLE,
  DEFAULT_CHART_DONUT_COLORS,
  type ChartDonutSlice,
} from './chart-donut';

afterEach(() => cleanup());

const SAMPLE: ChartDonutSlice[] = [
  { id: 'a', label: 'Alpha', value: 30 },
  { id: 'b', label: 'Beta', value: 50 },
  { id: 'c', label: 'Gamma', value: 20 },
];

describe('chart-donut constants', () => {
  it('exports all the documented defaults', () => {
    expect(DEFAULT_CHART_DONUT_WIDTH).toBe(320);
    expect(DEFAULT_CHART_DONUT_HEIGHT).toBe(320);
    expect(DEFAULT_CHART_DONUT_PADDING).toBe(24);
    expect(DEFAULT_CHART_DONUT_THICKNESS_RATIO).toBeCloseTo(0.32);
    expect(DEFAULT_CHART_DONUT_PAD_ANGLE).toBeCloseTo(0.012);
    expect(DEFAULT_CHART_DONUT_CORNER_RADIUS).toBe(0);
    expect(DEFAULT_CHART_DONUT_START_ANGLE).toBeCloseTo(-Math.PI / 2);
    expect(DEFAULT_CHART_DONUT_COLORS.length).toBe(10);
  });
});

describe('getDonutDefaultColor', () => {
  it('returns a stable palette entry for valid indices', () => {
    expect(getDonutDefaultColor(0)).toBe(DEFAULT_CHART_DONUT_COLORS[0]);
    expect(getDonutDefaultColor(3)).toBe(DEFAULT_CHART_DONUT_COLORS[3]);
  });
  it('wraps modulo the palette length', () => {
    const len = DEFAULT_CHART_DONUT_COLORS.length;
    expect(getDonutDefaultColor(len)).toBe(DEFAULT_CHART_DONUT_COLORS[0]);
    expect(getDonutDefaultColor(len + 2)).toBe(DEFAULT_CHART_DONUT_COLORS[2]);
  });
  it('falls back to the first color for invalid / negative input', () => {
    expect(getDonutDefaultColor(Number.NaN)).toBe(DEFAULT_CHART_DONUT_COLORS[0]);
    expect(getDonutDefaultColor(-1)).toBe(DEFAULT_CHART_DONUT_COLORS[0]);
  });
});

describe('polarToCartesian', () => {
  it('returns the center at any angle when radius is zero', () => {
    expect(polarToCartesian(10, 20, 0, 1.23)).toEqual({ x: 10, y: 20 });
  });
  it('moves rightward at angle 0', () => {
    const p = polarToCartesian(0, 0, 5, 0);
    expect(p.x).toBeCloseTo(5);
    expect(p.y).toBeCloseTo(0);
  });
  it('moves downward at angle pi/2 (SVG y grows down)', () => {
    const p = polarToCartesian(0, 0, 5, Math.PI / 2);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(5);
  });
});

describe('getDonutTotal / getDonutVisibleTotal', () => {
  it('sums positive numeric values', () => {
    expect(getDonutTotal(SAMPLE)).toBe(100);
  });
  it('skips non-finite / non-positive values', () => {
    const slices: ChartDonutSlice[] = [
      { id: 'a', label: 'A', value: Number.NaN },
      { id: 'b', label: 'B', value: -2 },
      { id: 'c', label: 'C', value: 5 },
    ];
    expect(getDonutTotal(slices)).toBe(5);
  });
  it('respects the hidden set', () => {
    expect(getDonutVisibleTotal(SAMPLE, new Set(['b']))).toBe(50);
    expect(getDonutVisibleTotal(SAMPLE, new Set(['a', 'b', 'c']))).toBe(0);
  });
});

describe('computeDonutArcs', () => {
  const cx = 160;
  const cy = 160;
  const outerRadius = 120;

  it('returns [] for an empty slice list', () => {
    expect(
      computeDonutArcs({
        slices: [],
        hidden: new Set(),
        cx,
        cy,
        outerRadius,
        thicknessRatio: 0.32,
        startAngle: 0,
        padAngle: 0,
        cornerRadius: 0,
      })
    ).toEqual([]);
  });

  it('returns [] when outer radius is non-positive', () => {
    expect(
      computeDonutArcs({
        slices: SAMPLE,
        hidden: new Set(),
        cx,
        cy,
        outerRadius: 0,
        thicknessRatio: 0.32,
        startAngle: 0,
        padAngle: 0,
        cornerRadius: 0,
      })
    ).toEqual([]);
  });

  it('produces one arc per visible positive slice', () => {
    const arcs = computeDonutArcs({
      slices: SAMPLE,
      hidden: new Set(),
      cx,
      cy,
      outerRadius,
      thicknessRatio: 0.32,
      startAngle: 0,
      padAngle: 0,
      cornerRadius: 0,
    });
    expect(arcs).toHaveLength(3);
    expect(arcs[0]!.id).toBe('a');
    expect(arcs[1]!.id).toBe('b');
    expect(arcs[2]!.id).toBe('c');
  });

  it('skips hidden + non-positive slices and reproportions the rest', () => {
    const slices: ChartDonutSlice[] = [
      { id: 'a', label: 'A', value: 25 },
      { id: 'b', label: 'B', value: 0 },
      { id: 'c', label: 'C', value: 75 },
    ];
    const arcs = computeDonutArcs({
      slices,
      hidden: new Set(['a']),
      cx,
      cy,
      outerRadius,
      thicknessRatio: 0.32,
      startAngle: 0,
      padAngle: 0,
      cornerRadius: 0,
    });
    expect(arcs.map((a) => a.id)).toEqual(['c']);
    expect(arcs[0]!.fraction).toBeCloseTo(1);
  });

  it('sums arc fractions to 1', () => {
    const arcs = computeDonutArcs({
      slices: SAMPLE,
      hidden: new Set(),
      cx,
      cy,
      outerRadius,
      thicknessRatio: 0.32,
      startAngle: 0,
      padAngle: 0,
      cornerRadius: 0,
    });
    const sum = arcs.reduce((acc, a) => acc + a.fraction, 0);
    expect(sum).toBeCloseTo(1);
  });

  it('arc sweep is proportional to value (no pad angle)', () => {
    const arcs = computeDonutArcs({
      slices: SAMPLE,
      hidden: new Set(),
      cx,
      cy,
      outerRadius,
      thicknessRatio: 0.32,
      startAngle: 0,
      padAngle: 0,
      cornerRadius: 0,
    });
    const [a, b, c] = arcs;
    expect(a!.endAngle - a!.startAngle).toBeCloseTo((Math.PI * 2) * 0.3);
    expect(b!.endAngle - b!.startAngle).toBeCloseTo((Math.PI * 2) * 0.5);
    expect(c!.endAngle - c!.startAngle).toBeCloseTo((Math.PI * 2) * 0.2);
  });

  it('arcs are angularly contiguous when padAngle is zero', () => {
    const arcs = computeDonutArcs({
      slices: SAMPLE,
      hidden: new Set(),
      cx,
      cy,
      outerRadius,
      thicknessRatio: 0.32,
      startAngle: 0,
      padAngle: 0,
      cornerRadius: 0,
    });
    expect(arcs[1]!.startAngle).toBeCloseTo(arcs[0]!.endAngle);
    expect(arcs[2]!.startAngle).toBeCloseTo(arcs[1]!.endAngle);
  });

  it('padAngle introduces gaps between consecutive arcs', () => {
    const padAngle = 0.1;
    const arcs = computeDonutArcs({
      slices: SAMPLE,
      hidden: new Set(),
      cx,
      cy,
      outerRadius,
      thicknessRatio: 0.32,
      startAngle: 0,
      padAngle,
      cornerRadius: 0,
    });
    expect(arcs[1]!.startAngle - arcs[0]!.endAngle).toBeCloseTo(padAngle);
    expect(arcs[2]!.startAngle - arcs[1]!.endAngle).toBeCloseTo(padAngle);
  });

  it('inner radius reflects the thickness ratio', () => {
    const arcs = computeDonutArcs({
      slices: SAMPLE,
      hidden: new Set(),
      cx,
      cy,
      outerRadius,
      thicknessRatio: 0.5,
      startAngle: 0,
      padAngle: 0,
      cornerRadius: 0,
    });
    expect(arcs[0]!.innerRadius).toBeCloseTo(60);
    expect(arcs[0]!.outerRadius).toBe(120);
  });

  it('clamps thicknessRatio outside [0, 1]', () => {
    const above = computeDonutArcs({
      slices: SAMPLE,
      hidden: new Set(),
      cx,
      cy,
      outerRadius,
      thicknessRatio: 2,
      startAngle: 0,
      padAngle: 0,
      cornerRadius: 0,
    });
    expect(above[0]!.innerRadius).toBeCloseTo(0);
    const below = computeDonutArcs({
      slices: SAMPLE,
      hidden: new Set(),
      cx,
      cy,
      outerRadius,
      thicknessRatio: -1,
      startAngle: 0,
      padAngle: 0,
      cornerRadius: 0,
    });
    expect(below[0]!.innerRadius).toBeCloseTo(outerRadius);
  });

  it('mid angle is the midpoint of the arc', () => {
    const arcs = computeDonutArcs({
      slices: SAMPLE,
      hidden: new Set(),
      cx,
      cy,
      outerRadius,
      thicknessRatio: 0.32,
      startAngle: 0,
      padAngle: 0,
      cornerRadius: 0,
    });
    for (const a of arcs) {
      expect(a.midAngle).toBeCloseTo((a.startAngle + a.endAngle) / 2);
    }
  });

  it('emits a path string per arc', () => {
    const arcs = computeDonutArcs({
      slices: SAMPLE,
      hidden: new Set(),
      cx,
      cy,
      outerRadius,
      thicknessRatio: 0.32,
      startAngle: 0,
      padAngle: 0,
      cornerRadius: 0,
    });
    for (const a of arcs) {
      expect(typeof a.path).toBe('string');
      expect(a.path.length).toBeGreaterThan(10);
      expect(a.path[0]).toBe('M');
    }
  });

  it('returns a complete-ring path when there is exactly one visible positive slice', () => {
    const arcs = computeDonutArcs({
      slices: [{ id: 'only', label: 'Only', value: 7 }],
      hidden: new Set(),
      cx,
      cy,
      outerRadius,
      thicknessRatio: 0.4,
      startAngle: 0,
      padAngle: 0,
      cornerRadius: 0,
    });
    expect(arcs).toHaveLength(1);
    expect(arcs[0]!.fraction).toBeCloseTo(1);
    expect(arcs[0]!.path.includes('A')).toBe(true);
  });

  it('per-slice color override beats the palette', () => {
    const slices: ChartDonutSlice[] = [
      { id: 'a', label: 'A', value: 1, color: '#abcdef' },
      { id: 'b', label: 'B', value: 2 },
    ];
    const arcs = computeDonutArcs({
      slices,
      hidden: new Set(),
      cx,
      cy,
      outerRadius,
      thicknessRatio: 0.32,
      startAngle: 0,
      padAngle: 0,
      cornerRadius: 0,
    });
    expect(arcs[0]!.color).toBe('#abcdef');
    expect(arcs[1]!.color).toBe(getDonutDefaultColor(1));
  });
});

describe('describeDonutChart', () => {
  it('returns "No data" for an empty list', () => {
    expect(describeDonutChart([], new Set())).toBe('No data');
  });
  it('returns "No data" when every visible slice is non-positive / hidden', () => {
    const slices: ChartDonutSlice[] = [
      { id: 'a', label: 'A', value: -1 },
      { id: 'b', label: 'B', value: 2 },
    ];
    expect(describeDonutChart(slices, new Set(['b']))).toBe('No data');
  });
  it('includes the count + total + per-slice breakdown', () => {
    const desc = describeDonutChart(SAMPLE, new Set());
    expect(desc).toContain('3 slices');
    expect(desc).toContain('total 100');
    expect(desc).toContain('Alpha');
    expect(desc).toContain('30%');
  });
  it('respects the formatValue override', () => {
    const desc = describeDonutChart(SAMPLE, new Set(), (v) => `$${v}`);
    expect(desc).toContain('$30');
    expect(desc).toContain('$100');
  });
});

describe('<ChartDonut> component', () => {
  it('renders a region with role + custom aria-label', () => {
    const { getByRole } = render(
      <ChartDonut slices={SAMPLE} ariaLabel="Test donut" />
    );
    const region = getByRole('region', { name: 'Test donut' });
    expect(region.dataset.section).toBe('chart-donut');
  });

  it('renders one arc per visible positive slice', () => {
    const { container } = render(<ChartDonut slices={SAMPLE} />);
    const arcs = container.querySelectorAll('[data-section="chart-donut-arc"]');
    expect(arcs.length).toBe(3);
  });

  it('mirrors slice + visible + hidden counts on the root', () => {
    const { container } = render(
      <ChartDonut slices={SAMPLE} defaultHiddenSlices={['b']} />
    );
    const root = container.querySelector('[data-section="chart-donut"]');
    expect(root?.getAttribute('data-slice-count')).toBe('3');
    expect(root?.getAttribute('data-visible-count')).toBe('2');
    expect(root?.getAttribute('data-hidden-count')).toBe('1');
  });

  it('per-arc data attributes carry id + value + color + fraction', () => {
    const { container } = render(<ChartDonut slices={SAMPLE} />);
    const arcs = container.querySelectorAll('[data-section="chart-donut-arc"]');
    const first = arcs[0]!;
    expect(first.getAttribute('data-slice-id')).toBe('a');
    expect(first.getAttribute('data-arc-value')).toBe('30');
    expect(first.getAttribute('data-arc-fraction')).not.toBeNull();
    expect(first.getAttribute('data-arc-color')).toBeTruthy();
  });

  it('per-arc path is role=graphics-symbol + tabIndex=0 with aria-label', () => {
    const { container } = render(<ChartDonut slices={SAMPLE} />);
    const path = container.querySelector(
      '[data-section="chart-donut-path"]'
    ) as SVGPathElement | null;
    expect(path).not.toBeNull();
    expect(path!.getAttribute('role')).toBe('graphics-symbol');
    expect(path!.getAttribute('tabindex')).toBe('0');
    expect(path!.getAttribute('aria-label')).toContain('Alpha');
    expect(path!.getAttribute('aria-label')).toContain('30');
  });

  it('legend renders one button per slice and toggles hidden state (uncontrolled)', () => {
    const onSliceToggle = vi.fn();
    const { container } = render(
      <ChartDonut slices={SAMPLE} onSliceToggle={onSliceToggle} />
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-donut-legend-button"]'
    );
    expect(buttons.length).toBe(3);
    fireEvent.click(buttons[1]!);
    expect(onSliceToggle).toHaveBeenCalledTimes(1);
    const arg = onSliceToggle.mock.calls[0]![0];
    expect(arg.hidden).toBe(true);
    expect(arg.slice.id).toBe('b');
    const root = container.querySelector('[data-section="chart-donut"]');
    expect(root?.getAttribute('data-visible-count')).toBe('2');
  });

  it('legend respects controlled hiddenSlices', () => {
    const { container } = render(
      <ChartDonut slices={SAMPLE} hiddenSlices={['a']} />
    );
    const root = container.querySelector('[data-section="chart-donut"]');
    expect(root?.getAttribute('data-visible-count')).toBe('2');
    const items = container.querySelectorAll(
      '[data-section="chart-donut-legend-item"]'
    );
    expect(items[0]!.getAttribute('data-slice-hidden')).toBe('true');
    expect(items[1]!.getAttribute('data-slice-hidden')).toBe('false');
  });

  it('legend swatch carries the per-slice color', () => {
    const slices: ChartDonutSlice[] = [
      { id: 'a', label: 'A', value: 1, color: '#ff00aa' },
    ];
    const { container } = render(<ChartDonut slices={slices} />);
    const swatch = container.querySelector(
      '[data-section="chart-donut-legend-swatch"]'
    ) as HTMLElement | null;
    expect(swatch?.style.backgroundColor).toBe('rgb(255, 0, 170)');
  });

  it('showLegend=false suppresses the legend entirely', () => {
    const { container } = render(<ChartDonut slices={SAMPLE} showLegend={false} />);
    expect(
      container.querySelector('[data-section="chart-donut-legend"]')
    ).toBeNull();
  });

  it('legend placement = right reverses the layout direction', () => {
    const { container } = render(
      <ChartDonut slices={SAMPLE} legendPlacement="right" />
    );
    const legend = container.querySelector(
      '[data-section="chart-donut-legend"]'
    );
    expect(legend?.getAttribute('data-placement')).toBe('right');
  });

  it('center primary + secondary render by default and use the total', () => {
    const { container } = render(
      <ChartDonut slices={SAMPLE} centerLabel="Total" />
    );
    const primary = container.querySelector(
      '[data-section="chart-donut-center-primary"]'
    );
    const secondary = container.querySelector(
      '[data-section="chart-donut-center-secondary"]'
    );
    expect(primary?.textContent).toBe('100');
    expect(secondary?.textContent).toBe('Total');
  });

  it('centerValue overrides the total', () => {
    const { container } = render(
      <ChartDonut slices={SAMPLE} centerValue="custom" centerLabel="Label" />
    );
    const primary = container.querySelector(
      '[data-section="chart-donut-center-primary"]'
    );
    expect(primary?.textContent).toBe('custom');
  });

  it('center honors hidden state for total when uncontrolled', () => {
    const { container } = render(
      <ChartDonut slices={SAMPLE} defaultHiddenSlices={['a']} />
    );
    const primary = container.querySelector(
      '[data-section="chart-donut-center-primary"]'
    );
    expect(primary?.textContent).toBe('70');
  });

  it('showCenter=false removes the center group entirely', () => {
    const { container } = render(
      <ChartDonut slices={SAMPLE} showCenter={false} />
    );
    expect(
      container.querySelector('[data-section="chart-donut-center"]')
    ).toBeNull();
  });

  it('tooltip opens on arc mouseenter and shows label + value + percent', () => {
    const { container } = render(<ChartDonut slices={SAMPLE} />);
    const arc = container.querySelectorAll(
      '[data-section="chart-donut-arc"]'
    )[1]! as HTMLElement;
    fireEvent.mouseEnter(arc);
    const tt = container.querySelector('[data-section="chart-donut-tooltip"]');
    expect(tt).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-donut-tooltip-label"]')!
        .textContent
    ).toBe('Beta');
    expect(
      container.querySelector('[data-section="chart-donut-tooltip-value"]')!
        .textContent
    ).toBe('50');
    expect(
      container.querySelector('[data-section="chart-donut-tooltip-percent"]')!
        .textContent
    ).toBe('50%');
  });

  it('tooltip hides on mouseleave', () => {
    const { container } = render(<ChartDonut slices={SAMPLE} />);
    const arc = container.querySelectorAll(
      '[data-section="chart-donut-arc"]'
    )[0]! as HTMLElement;
    fireEvent.mouseEnter(arc);
    expect(
      container.querySelector('[data-section="chart-donut-tooltip"]')
    ).not.toBeNull();
    fireEvent.mouseLeave(arc);
    expect(
      container.querySelector('[data-section="chart-donut-tooltip"]')
    ).toBeNull();
  });

  it('showTooltip=false suppresses the tooltip', () => {
    const { container } = render(
      <ChartDonut slices={SAMPLE} showTooltip={false} />
    );
    const arc = container.querySelectorAll(
      '[data-section="chart-donut-arc"]'
    )[0]! as HTMLElement;
    fireEvent.mouseEnter(arc);
    expect(
      container.querySelector('[data-section="chart-donut-tooltip"]')
    ).toBeNull();
  });

  it('formatValue reaches the tooltip + center', () => {
    const { container } = render(
      <ChartDonut
        slices={SAMPLE}
        formatValue={(v) => `$${v}`}
        centerLabel="Total"
      />
    );
    const primary = container.querySelector(
      '[data-section="chart-donut-center-primary"]'
    );
    expect(primary?.textContent).toBe('$100');
    const arc = container.querySelectorAll(
      '[data-section="chart-donut-arc"]'
    )[0]! as HTMLElement;
    fireEvent.mouseEnter(arc);
    expect(
      container.querySelector('[data-section="chart-donut-tooltip-value"]')!
        .textContent
    ).toBe('$30');
  });

  it('formatPercent reaches the tooltip', () => {
    const { container } = render(
      <ChartDonut
        slices={SAMPLE}
        formatPercent={(p) => `${p.toFixed(1)}pct`}
      />
    );
    const arc = container.querySelectorAll(
      '[data-section="chart-donut-arc"]'
    )[1]! as HTMLElement;
    fireEvent.mouseEnter(arc);
    expect(
      container.querySelector('[data-section="chart-donut-tooltip-percent"]')!
        .textContent
    ).toBe('50.0pct');
  });

  it('onArcClick fires with slice + arc payload', () => {
    const onArcClick = vi.fn();
    const { container } = render(
      <ChartDonut slices={SAMPLE} onArcClick={onArcClick} />
    );
    const arc = container.querySelectorAll(
      '[data-section="chart-donut-arc"]'
    )[2]! as HTMLElement;
    fireEvent.click(arc);
    expect(onArcClick).toHaveBeenCalledTimes(1);
    const payload = onArcClick.mock.calls[0]![0];
    expect(payload.slice.id).toBe('c');
    expect(payload.arc.id).toBe('c');
    expect(payload.arc.value).toBe(20);
  });

  it('data-hovered mirrors the hover state', () => {
    const { container } = render(<ChartDonut slices={SAMPLE} />);
    const arc = container.querySelectorAll(
      '[data-section="chart-donut-arc"]'
    )[0]! as HTMLElement;
    expect(arc.getAttribute('data-hovered')).toBe('false');
    fireEvent.mouseEnter(arc);
    expect(arc.getAttribute('data-hovered')).toBe('true');
    fireEvent.mouseLeave(arc);
    expect(arc.getAttribute('data-hovered')).toBe('false');
  });

  it('arc labels render when showLabels=true and fraction > 5%', () => {
    const { container } = render(<ChartDonut slices={SAMPLE} showLabels />);
    const labels = container.querySelectorAll(
      '[data-section="chart-donut-label"]'
    );
    expect(labels.length).toBe(3);
    expect(labels[1]!.textContent).toBe('50%');
  });

  it('arc labels are absent by default', () => {
    const { container } = render(<ChartDonut slices={SAMPLE} />);
    expect(
      container.querySelector('[data-section="chart-donut-label"]')
    ).toBeNull();
  });

  it('aria-description override beats the auto description', () => {
    const { container } = render(
      <ChartDonut slices={SAMPLE} ariaDescription="My description" />
    );
    const desc = container.querySelector(
      '[data-section="chart-donut-aria-desc"]'
    );
    expect(desc?.textContent).toBe('My description');
  });

  it('renders the auto description by default', () => {
    const { container } = render(<ChartDonut slices={SAMPLE} />);
    const desc = container.querySelector(
      '[data-section="chart-donut-aria-desc"]'
    );
    expect(desc?.textContent).toContain('3 slices');
    expect(desc?.textContent).toContain('total 100');
  });

  it('SVG mirrors width / height / viewBox', () => {
    const { container } = render(
      <ChartDonut slices={SAMPLE} width={400} height={400} />
    );
    const svg = container.querySelector('[data-section="chart-donut-svg"]') as SVGElement;
    expect(svg.getAttribute('width')).toBe('400');
    expect(svg.getAttribute('height')).toBe('400');
    expect(svg.getAttribute('viewBox')).toBe('0 0 400 400');
  });

  it('data-animate mirrors the prop', () => {
    const a = render(<ChartDonut slices={SAMPLE} animate={false} />);
    expect(
      a.container.querySelector('[data-section="chart-donut"]')!
        .getAttribute('data-animate')
    ).toBe('false');
    cleanup();
    const b = render(<ChartDonut slices={SAMPLE} animate />);
    expect(
      b.container.querySelector('[data-section="chart-donut"]')!
        .getAttribute('data-animate')
    ).toBe('true');
  });

  it('empty slice list renders without crashing', () => {
    const { container } = render(<ChartDonut slices={[]} />);
    expect(
      container.querySelectorAll('[data-section="chart-donut-arc"]').length
    ).toBe(0);
    expect(
      container.querySelector('[data-section="chart-donut-aria-desc"]')
        ?.textContent
    ).toBe('No data');
  });

  it('forwards ref to the root region', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartDonut slices={SAMPLE} ref={ref} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.dataset.section).toBe('chart-donut');
  });

  it('has a stable displayName', () => {
    expect(ChartDonut.displayName).toBe('ChartDonut');
  });

  it('thicknessRatio mirrored on root as data attribute', () => {
    const { container } = render(
      <ChartDonut slices={SAMPLE} thicknessRatio={0.6} />
    );
    const root = container.querySelector('[data-section="chart-donut"]');
    expect(root?.getAttribute('data-thickness-ratio')).toBe('0.6');
  });

  it('centerContent.primary / secondary fallback when centerValue / centerLabel are absent', () => {
    const { container } = render(
      <ChartDonut
        slices={SAMPLE}
        centerContent={{ primary: 'P', secondary: 'S' }}
      />
    );
    expect(
      container.querySelector('[data-section="chart-donut-center-primary"]')
        ?.textContent
    ).toBe('P');
    expect(
      container.querySelector('[data-section="chart-donut-center-secondary"]')
        ?.textContent
    ).toBe('S');
  });
});
