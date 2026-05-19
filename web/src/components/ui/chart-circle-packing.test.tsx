import { afterEach, describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import {
  ChartCirclePacking,
  computeCirclePackingLayout,
  describeCirclePackingChart,
  flattenCirclePackingHierarchy,
  getCirclePackingDefaultColor,
  getCirclePackingEnclosingCircle,
  getCirclePackingNodeValue,
  packCirclesFrontChain,
  DEFAULT_CHART_CIRCLE_PACKING_WIDTH,
  DEFAULT_CHART_CIRCLE_PACKING_HEIGHT,
  DEFAULT_CHART_CIRCLE_PACKING_PADDING,
  DEFAULT_CHART_CIRCLE_PACKING_CHILD_PADDING,
  DEFAULT_CHART_CIRCLE_PACKING_FILL_OPACITY,
  DEFAULT_CHART_CIRCLE_PACKING_LABEL_MIN_RADIUS,
  DEFAULT_CHART_CIRCLE_PACKING_PALETTE,
  type ChartCirclePackingNode,
} from './chart-circle-packing';

afterEach(() => cleanup());

const ROOT: ChartCirclePackingNode = {
  id: 'root',
  label: 'Root',
  children: [
    {
      id: 'a',
      label: 'A',
      children: [
        { id: 'a1', label: 'A1', value: 10 },
        { id: 'a2', label: 'A2', value: 20 },
      ],
    },
    {
      id: 'b',
      label: 'B',
      children: [{ id: 'b1', label: 'B1', value: 30 }],
    },
    { id: 'c', label: 'C', value: 40 },
  ],
};

describe('chart-circle-packing constants', () => {
  it('exports the documented defaults', () => {
    expect(DEFAULT_CHART_CIRCLE_PACKING_WIDTH).toBe(400);
    expect(DEFAULT_CHART_CIRCLE_PACKING_HEIGHT).toBe(400);
    expect(DEFAULT_CHART_CIRCLE_PACKING_PADDING).toBe(16);
    expect(DEFAULT_CHART_CIRCLE_PACKING_CHILD_PADDING).toBe(4);
    expect(DEFAULT_CHART_CIRCLE_PACKING_FILL_OPACITY).toBeCloseTo(0.6);
    expect(DEFAULT_CHART_CIRCLE_PACKING_LABEL_MIN_RADIUS).toBe(16);
    expect(DEFAULT_CHART_CIRCLE_PACKING_PALETTE.length).toBe(10);
  });
});

describe('getCirclePackingDefaultColor', () => {
  it('palette + modulo + invalid fallback', () => {
    expect(getCirclePackingDefaultColor(0)).toBe(
      DEFAULT_CHART_CIRCLE_PACKING_PALETTE[0]
    );
    expect(
      getCirclePackingDefaultColor(DEFAULT_CHART_CIRCLE_PACKING_PALETTE.length)
    ).toBe(DEFAULT_CHART_CIRCLE_PACKING_PALETTE[0]);
    expect(getCirclePackingDefaultColor(-1)).toBe(
      DEFAULT_CHART_CIRCLE_PACKING_PALETTE[0]
    );
  });
});

describe('getCirclePackingNodeValue', () => {
  it('leaf with explicit value returns value', () => {
    expect(getCirclePackingNodeValue({ id: 'l', label: 'L', value: 5 })).toBe(5);
  });
  it('parent sums children when children have positive values', () => {
    expect(getCirclePackingNodeValue(ROOT)).toBe(100);
  });
  it('parent with no positive children falls back to explicit value', () => {
    expect(
      getCirclePackingNodeValue({
        id: 'p',
        label: 'P',
        value: 7,
        children: [{ id: 'c', label: 'C', value: 0 }],
      })
    ).toBe(7);
  });
  it('childless without value -> 0', () => {
    expect(getCirclePackingNodeValue({ id: 'x', label: 'X' })).toBe(0);
  });
});

describe('flattenCirclePackingHierarchy', () => {
  it('returns one entry per node with depth + path', () => {
    const flat = flattenCirclePackingHierarchy(ROOT);
    expect(flat).toHaveLength(7);
    expect(flat[0]!.id).toBe('root');
    const a1 = flat.find((n) => n.id === 'a1')!;
    expect(a1.depth).toBe(2);
    expect(a1.path).toEqual(['root', 'a', 'a1']);
    expect(a1.isLeaf).toBe(true);
  });
  it('null root -> []', () => {
    expect(flattenCirclePackingHierarchy(null)).toEqual([]);
  });
});

describe('packCirclesFrontChain', () => {
  it('empty input -> []', () => {
    expect(packCirclesFrontChain([])).toEqual([]);
  });
  it('single radius -> single circle at origin', () => {
    const r = packCirclesFrontChain([5]);
    expect(r).toHaveLength(1);
    expect(r[0]!.r).toBe(5);
  });
  it('two radii -> tangent placement (centers d = r0+r1)', () => {
    const r = packCirclesFrontChain([3, 4]);
    expect(r).toHaveLength(2);
    const d = Math.hypot(r[0]!.x - r[1]!.x, r[0]!.y - r[1]!.y);
    expect(d).toBeCloseTo(3 + 4);
  });
  it('three radii -> all mutually tangent or non-overlapping', () => {
    const r = packCirclesFrontChain([3, 3, 3]);
    expect(r).toHaveLength(3);
    for (let i = 0; i < r.length; i++) {
      for (let j = i + 1; j < r.length; j++) {
        const d = Math.hypot(r[i]!.x - r[j]!.x, r[i]!.y - r[j]!.y);
        expect(d).toBeGreaterThanOrEqual(r[i]!.r + r[j]!.r - 1e-6);
      }
    }
  });
  it('many circles -> non-overlapping (within epsilon)', () => {
    const radii = [10, 8, 6, 5, 4, 3, 3, 2];
    const r = packCirclesFrontChain(radii);
    for (let i = 0; i < r.length; i++) {
      for (let j = i + 1; j < r.length; j++) {
        const d = Math.hypot(r[i]!.x - r[j]!.x, r[i]!.y - r[j]!.y);
        expect(d).toBeGreaterThan(r[i]!.r + r[j]!.r - 1e-3);
      }
    }
  });
  it('non-positive / non-finite radii produce zero-radius placeholder', () => {
    const r = packCirclesFrontChain([5, 0, Number.NaN, -1, 3]);
    expect(r).toHaveLength(5);
    expect(r[1]).toEqual({ x: 0, y: 0, r: 0 });
    expect(r[2]).toEqual({ x: 0, y: 0, r: 0 });
    expect(r[3]).toEqual({ x: 0, y: 0, r: 0 });
  });
});

describe('getCirclePackingEnclosingCircle', () => {
  it('empty -> zero', () => {
    expect(getCirclePackingEnclosingCircle([])).toEqual({ x: 0, y: 0, r: 0 });
  });
  it('single -> same as input', () => {
    const c = getCirclePackingEnclosingCircle([{ x: 5, y: 7, r: 3 }]);
    expect(c.r).toBeCloseTo(3);
  });
  it('encloses all circles', () => {
    const circles = [
      { x: 0, y: 0, r: 1 },
      { x: 4, y: 0, r: 2 },
      { x: 0, y: 5, r: 1 },
    ];
    const e = getCirclePackingEnclosingCircle(circles);
    for (const c of circles) {
      const d = Math.hypot(c.x - e.x, c.y - e.y);
      expect(d + c.r).toBeLessThanOrEqual(e.r + 1e-3);
    }
  });
});

describe('computeCirclePackingLayout', () => {
  const cx = 200;
  const cy = 200;
  const radius = 160;

  it('null root -> empty', () => {
    const r = computeCirclePackingLayout({
      root: null,
      cx,
      cy,
      radius,
      childPadding: 0,
      fallbackColor: '#999',
    });
    expect(r.circles).toEqual([]);
    expect(r.rootValue).toBe(0);
  });

  it('non-positive radius -> empty', () => {
    const r = computeCirclePackingLayout({
      root: ROOT,
      cx,
      cy,
      radius: 0,
      childPadding: 0,
      fallbackColor: '#999',
    });
    expect(r.circles).toEqual([]);
  });

  it('produces one circle per node', () => {
    const r = computeCirclePackingLayout({
      root: ROOT,
      cx,
      cy,
      radius,
      childPadding: 4,
      fallbackColor: '#999',
    });
    expect(r.circles).toHaveLength(7);
    expect(r.rootValue).toBe(100);
  });

  it('root circle sits at the center with the given outer radius', () => {
    const r = computeCirclePackingLayout({
      root: ROOT,
      cx,
      cy,
      radius,
      childPadding: 4,
      fallbackColor: '#999',
    });
    const rootCircle = r.circles.find((c) => c.id === 'root')!;
    expect(rootCircle.cx).toBeCloseTo(cx);
    expect(rootCircle.cy).toBeCloseTo(cy);
    expect(rootCircle.r).toBeCloseTo(radius);
    expect(rootCircle.isFocus).toBe(true);
  });

  it('every child circle fits inside its parent (within tolerance)', () => {
    const r = computeCirclePackingLayout({
      root: ROOT,
      cx,
      cy,
      radius,
      childPadding: 4,
      fallbackColor: '#999',
    });
    const lookup = new Map(r.circles.map((c) => [c.id, c]));
    for (const c of r.circles) {
      if (!c.parentId) continue;
      const parent = lookup.get(c.parentId);
      if (!parent) continue;
      const dist = Math.hypot(c.cx - parent.cx, c.cy - parent.cy);
      expect(dist + c.r).toBeLessThanOrEqual(parent.r + 1);
    }
  });

  it('siblings do not overlap (within tolerance)', () => {
    const r = computeCirclePackingLayout({
      root: ROOT,
      cx,
      cy,
      radius,
      childPadding: 4,
      fallbackColor: '#999',
    });
    const byParent = new Map<string, typeof r.circles>();
    for (const c of r.circles) {
      const key = c.parentId ?? '';
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(c);
    }
    for (const [, siblings] of byParent) {
      for (let i = 0; i < siblings.length; i++) {
        for (let j = i + 1; j < siblings.length; j++) {
          const d = Math.hypot(
            siblings[i]!.cx - siblings[j]!.cx,
            siblings[i]!.cy - siblings[j]!.cy
          );
          expect(d + 0.5).toBeGreaterThanOrEqual(
            siblings[i]!.r + siblings[j]!.r - 1
          );
        }
      }
    }
  });

  it('isLeaf=true for leaves; isLeaf=false for parents', () => {
    const r = computeCirclePackingLayout({
      root: ROOT,
      cx,
      cy,
      radius,
      childPadding: 4,
      fallbackColor: '#999',
    });
    expect(r.circles.find((c) => c.id === 'root')!.isLeaf).toBe(false);
    expect(r.circles.find((c) => c.id === 'a1')!.isLeaf).toBe(true);
    expect(r.circles.find((c) => c.id === 'c')!.isLeaf).toBe(true);
  });

  it('share matches value / rootValue', () => {
    const r = computeCirclePackingLayout({
      root: ROOT,
      cx,
      cy,
      radius,
      childPadding: 4,
      fallbackColor: '#999',
    });
    const c = r.circles.find((circle) => circle.id === 'c')!;
    expect(c.share).toBeCloseTo(40 / 100);
  });

  it('per-node color override beats palette', () => {
    const colored: ChartCirclePackingNode = {
      id: 'r',
      label: 'R',
      children: [{ id: 'x', label: 'X', value: 1, color: '#abcdef' }],
    };
    const r = computeCirclePackingLayout({
      root: colored,
      cx,
      cy,
      radius,
      childPadding: 4,
      fallbackColor: '#999',
    });
    expect(r.circles.find((c) => c.id === 'x')!.color).toBe('#abcdef');
  });
});

describe('describeCirclePackingChart', () => {
  it('null / zero -> "No data"', () => {
    expect(describeCirclePackingChart(null)).toBe('No data');
    expect(
      describeCirclePackingChart({ id: 'r', label: 'R' })
    ).toBe('No data');
  });
  it('includes nodes + levels + total', () => {
    const d = describeCirclePackingChart(ROOT);
    expect(d).toContain('7 nodes');
    expect(d).toContain('3 levels');
    expect(d).toContain('100');
  });
});

describe('<ChartCirclePacking> component', () => {
  it('renders region + custom aria-label', () => {
    const { getByRole } = render(
      <ChartCirclePacking root={ROOT} ariaLabel="Test circles" />
    );
    expect(getByRole('region', { name: 'Test circles' })).toBeTruthy();
  });

  it('renders one circle per node', () => {
    const { container } = render(<ChartCirclePacking root={ROOT} />);
    expect(
      container.querySelectorAll(
        '[data-section="chart-circle-packing-circle"]'
      ).length
    ).toBe(7);
  });

  it('circle data attrs mirror id / depth / parent / value / share / radius / leaf / focus', () => {
    const { container } = render(<ChartCirclePacking root={ROOT} />);
    const a = container.querySelector('[data-circle-id="a"]') as HTMLElement;
    expect(a.getAttribute('data-circle-depth')).toBe('1');
    expect(a.getAttribute('data-circle-parent')).toBe('root');
    expect(a.getAttribute('data-circle-value')).toBe('30');
    expect(a.getAttribute('data-circle-share')).toBeTruthy();
    expect(a.getAttribute('data-circle-color')).toBeTruthy();
    expect(a.getAttribute('data-circle-radius')).toBeTruthy();
    expect(a.getAttribute('data-circle-is-leaf')).toBe('false');
    const rootCircle = container.querySelector(
      '[data-circle-id="root"]'
    ) as HTMLElement;
    expect(rootCircle.getAttribute('data-circle-is-focus')).toBe('true');
    const a1 = container.querySelector('[data-circle-id="a1"]') as HTMLElement;
    expect(a1.getAttribute('data-circle-is-leaf')).toBe('true');
  });

  it('shape role=graphics-symbol + tabIndex=0 + aria-label', () => {
    const { container } = render(<ChartCirclePacking root={ROOT} />);
    const circle = container.querySelector(
      '[data-section="chart-circle-packing-shape"]'
    ) as SVGCircleElement;
    expect(circle.getAttribute('role')).toBe('graphics-symbol');
    expect(circle.getAttribute('tabindex')).toBe('0');
    expect(circle.getAttribute('aria-label')).toContain('Root');
  });

  it('root mirrors counts + root-value + animate', () => {
    const { container } = render(<ChartCirclePacking root={ROOT} />);
    const root = container.querySelector(
      '[data-section="chart-circle-packing"]'
    );
    expect(root?.getAttribute('data-node-count')).toBe('7');
    expect(root?.getAttribute('data-circle-count')).toBe('7');
    expect(root?.getAttribute('data-root-value')).toBe('100');
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('labels render only on leaves (and root) by default', () => {
    const { container } = render(
      <ChartCirclePacking root={ROOT} labelMinRadius={0} />
    );
    const labelTexts = Array.from(
      container.querySelectorAll(
        '[data-section="chart-circle-packing-label"]'
      )
    ).map((n) => n.textContent);
    expect(labelTexts).toContain('A1');
    expect(labelTexts).toContain('A2');
    expect(labelTexts).toContain('B1');
    expect(labelTexts).toContain('C');
    expect(labelTexts).toContain('Root');
    // Non-root, non-leaf nodes 'a' / 'b' should NOT have labels by default
    expect(labelTexts).not.toContain('A');
    expect(labelTexts).not.toContain('B');
  });

  it('showLeafLabelsOnly=false labels every visible circle', () => {
    const { container } = render(
      <ChartCirclePacking
        root={ROOT}
        labelMinRadius={0}
        showLeafLabelsOnly={false}
      />
    );
    const labelTexts = Array.from(
      container.querySelectorAll(
        '[data-section="chart-circle-packing-label"]'
      )
    ).map((n) => n.textContent);
    expect(labelTexts).toContain('A');
    expect(labelTexts).toContain('B');
  });

  it('showLabels=false suppresses all labels', () => {
    const { container } = render(
      <ChartCirclePacking root={ROOT} showLabels={false} labelMinRadius={0} />
    );
    expect(
      container.querySelector('[data-section="chart-circle-packing-label"]')
    ).toBeNull();
  });

  it('labelMinRadius above max hides labels', () => {
    const { container } = render(
      <ChartCirclePacking root={ROOT} labelMinRadius={10000} />
    );
    expect(
      container.querySelector('[data-section="chart-circle-packing-label"]')
    ).toBeNull();
  });

  it('tooltip opens on hover with path + value + share', () => {
    const { container } = render(<ChartCirclePacking root={ROOT} />);
    fireEvent.mouseEnter(
      container.querySelector('[data-circle-id="a1"]')! as HTMLElement
    );
    expect(
      container.querySelector(
        '[data-section="chart-circle-packing-tooltip"]'
      )
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-circle-packing-tooltip-label"]'
      )?.textContent
    ).toContain('root / a / a1');
    expect(
      container.querySelector(
        '[data-section="chart-circle-packing-tooltip-value"]'
      )?.textContent
    ).toBe('10');
    expect(
      container.querySelector(
        '[data-section="chart-circle-packing-tooltip-share"]'
      )?.textContent
    ).toContain('10%');
  });

  it('tooltip hides on mouseleave', () => {
    const { container } = render(<ChartCirclePacking root={ROOT} />);
    const a = container.querySelector('[data-circle-id="a"]') as HTMLElement;
    fireEvent.mouseEnter(a);
    expect(
      container.querySelector(
        '[data-section="chart-circle-packing-tooltip"]'
      )
    ).not.toBeNull();
    fireEvent.mouseLeave(a);
    expect(
      container.querySelector(
        '[data-section="chart-circle-packing-tooltip"]'
      )
    ).toBeNull();
  });

  it('showTooltip=false suppresses the tooltip', () => {
    const { container } = render(
      <ChartCirclePacking root={ROOT} showTooltip={false} />
    );
    fireEvent.mouseEnter(
      container.querySelector('[data-circle-id="a"]')! as HTMLElement
    );
    expect(
      container.querySelector(
        '[data-section="chart-circle-packing-tooltip"]'
      )
    ).toBeNull();
  });

  it('formatValue + formatPercent reach tooltip + aria-label', () => {
    const { container } = render(
      <ChartCirclePacking
        root={ROOT}
        formatValue={(v) => `${v}u`}
        formatPercent={(p) => `${(p * 100).toFixed(1)}pct`}
      />
    );
    const circle = container.querySelector(
      '[data-section="chart-circle-packing-shape"]'
    ) as SVGCircleElement;
    expect(circle.getAttribute('aria-label')).toContain('u');
    expect(circle.getAttribute('aria-label')).toContain('pct');
  });

  it('onCircleClick fires with circle payload', () => {
    const onCircleClick = vi.fn();
    const { container } = render(
      <ChartCirclePacking root={ROOT} onCircleClick={onCircleClick} />
    );
    fireEvent.click(
      container.querySelector('[data-circle-id="b"]')! as HTMLElement
    );
    expect(onCircleClick).toHaveBeenCalledTimes(1);
    expect(onCircleClick.mock.calls[0]![0].circle.id).toBe('b');
  });

  it('data-hovered mirrors hover state', () => {
    const { container } = render(<ChartCirclePacking root={ROOT} />);
    const a = container.querySelector('[data-circle-id="a"]') as HTMLElement;
    expect(a.getAttribute('data-hovered')).toBe('false');
    fireEvent.mouseEnter(a);
    expect(a.getAttribute('data-hovered')).toBe('true');
    fireEvent.mouseLeave(a);
    expect(a.getAttribute('data-hovered')).toBe('false');
  });

  it('auto ARIA description renders by default', () => {
    const { container } = render(<ChartCirclePacking root={ROOT} />);
    expect(
      container.querySelector(
        '[data-section="chart-circle-packing-aria-desc"]'
      )?.textContent
    ).toContain('7 nodes');
  });

  it('ariaDescription override beats auto', () => {
    const { container } = render(
      <ChartCirclePacking root={ROOT} ariaDescription="Override" />
    );
    expect(
      container.querySelector(
        '[data-section="chart-circle-packing-aria-desc"]'
      )?.textContent
    ).toBe('Override');
  });

  it('SVG mirrors width / height / viewBox', () => {
    const { container } = render(
      <ChartCirclePacking root={ROOT} width={500} height={500} />
    );
    const svg = container.querySelector(
      '[data-section="chart-circle-packing-svg"]'
    ) as SVGElement;
    expect(svg.getAttribute('width')).toBe('500');
    expect(svg.getAttribute('height')).toBe('500');
    expect(svg.getAttribute('viewBox')).toBe('0 0 500 500');
  });

  it('null root renders without crashing', () => {
    const { container } = render(<ChartCirclePacking root={null} />);
    expect(
      container.querySelectorAll(
        '[data-section="chart-circle-packing-circle"]'
      ).length
    ).toBe(0);
    expect(
      container.querySelector(
        '[data-section="chart-circle-packing-aria-desc"]'
      )?.textContent
    ).toBe('No data');
  });

  it('forwards ref to root', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartCirclePacking root={ROOT} ref={ref} />);
    expect(ref.current?.dataset.section).toBe('chart-circle-packing');
  });

  it('has stable displayName', () => {
    expect(ChartCirclePacking.displayName).toBe('ChartCirclePacking');
  });

  it('data-animate mirrors prop', () => {
    const { container } = render(
      <ChartCirclePacking root={ROOT} animate={false} />
    );
    expect(
      container.querySelector('[data-section="chart-circle-packing"]')!
        .getAttribute('data-animate')
    ).toBe('false');
  });
});
