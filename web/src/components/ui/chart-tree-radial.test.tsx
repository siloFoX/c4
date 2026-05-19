import { afterEach, describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import {
  ChartTreeRadial,
  buildTreeRadialLinkPath,
  computeTreeRadialLayout,
  describeTreeRadialChart,
  flattenTreeRadialHierarchy,
  getTreeRadialDefaultColor,
  getTreeRadialLeaves,
  getTreeRadialMaxDepth,
  polarToCartesian,
  DEFAULT_CHART_TREE_RADIAL_WIDTH,
  DEFAULT_CHART_TREE_RADIAL_HEIGHT,
  DEFAULT_CHART_TREE_RADIAL_PADDING,
  DEFAULT_CHART_TREE_RADIAL_LEAF_LABEL_RESERVE,
  DEFAULT_CHART_TREE_RADIAL_NODE_RADIUS,
  DEFAULT_CHART_TREE_RADIAL_LEAF_RADIUS,
  DEFAULT_CHART_TREE_RADIAL_LABEL_GAP,
  DEFAULT_CHART_TREE_RADIAL_START_ANGLE,
  DEFAULT_CHART_TREE_RADIAL_LINK_COLOR,
  DEFAULT_CHART_TREE_RADIAL_LEAF_COLOR,
  DEFAULT_CHART_TREE_RADIAL_INTERNAL_COLOR,
  DEFAULT_CHART_TREE_RADIAL_LINK_STYLE,
  type ChartTreeRadialNode,
} from './chart-tree-radial';

afterEach(() => cleanup());

const ROOT: ChartTreeRadialNode = {
  id: 'root',
  label: 'Root',
  children: [
    {
      id: 'a',
      label: 'A',
      children: [
        { id: 'a1', label: 'A1' },
        { id: 'a2', label: 'A2' },
      ],
    },
    {
      id: 'b',
      label: 'B',
      children: [{ id: 'b1', label: 'B1' }],
    },
    { id: 'c', label: 'C' },
  ],
};

describe('chart-tree-radial constants', () => {
  it('exports the documented defaults', () => {
    expect(DEFAULT_CHART_TREE_RADIAL_WIDTH).toBe(420);
    expect(DEFAULT_CHART_TREE_RADIAL_HEIGHT).toBe(420);
    expect(DEFAULT_CHART_TREE_RADIAL_PADDING).toBe(32);
    expect(DEFAULT_CHART_TREE_RADIAL_LEAF_LABEL_RESERVE).toBe(60);
    expect(DEFAULT_CHART_TREE_RADIAL_NODE_RADIUS).toBe(3);
    expect(DEFAULT_CHART_TREE_RADIAL_LEAF_RADIUS).toBe(4);
    expect(DEFAULT_CHART_TREE_RADIAL_LABEL_GAP).toBe(6);
    expect(DEFAULT_CHART_TREE_RADIAL_START_ANGLE).toBeCloseTo(-Math.PI / 2);
    expect(DEFAULT_CHART_TREE_RADIAL_LINK_COLOR).toBe('#94a3b8');
    expect(DEFAULT_CHART_TREE_RADIAL_LEAF_COLOR).toBe('#2563eb');
    expect(DEFAULT_CHART_TREE_RADIAL_INTERNAL_COLOR).toBe('#64748b');
    expect(DEFAULT_CHART_TREE_RADIAL_LINK_STYLE).toBe('curve');
  });
});

describe('polarToCartesian', () => {
  it('returns center at radius=0', () => {
    expect(polarToCartesian(5, 7, 0, 1)).toEqual({ x: 5, y: 7 });
  });
  it('moves right at angle 0', () => {
    const p = polarToCartesian(0, 0, 10, 0);
    expect(p.x).toBeCloseTo(10);
    expect(p.y).toBeCloseTo(0);
  });
  it('moves down at angle pi/2', () => {
    const p = polarToCartesian(0, 0, 10, Math.PI / 2);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(10);
  });
});

describe('getTreeRadialDefaultColor', () => {
  it('returns leaf vs internal color based on flag', () => {
    expect(getTreeRadialDefaultColor(true, '#leaf', '#int')).toBe('#leaf');
    expect(getTreeRadialDefaultColor(false, '#leaf', '#int')).toBe('#int');
  });
});

describe('flattenTreeRadialHierarchy', () => {
  it('returns one entry per node with depth + path', () => {
    const flat = flattenTreeRadialHierarchy(ROOT);
    expect(flat).toHaveLength(7);
    expect(flat[0]!.id).toBe('root');
    const a1 = flat.find((n) => n.id === 'a1')!;
    expect(a1.depth).toBe(2);
    expect(a1.parentId).toBe('a');
    expect(a1.path).toEqual(['root', 'a', 'a1']);
    expect(a1.isLeaf).toBe(true);
  });
  it('null root -> []', () => {
    expect(flattenTreeRadialHierarchy(null)).toEqual([]);
  });
});

describe('getTreeRadialLeaves', () => {
  it('returns only leaves in DFS order', () => {
    const leaves = getTreeRadialLeaves(ROOT);
    expect(leaves.map((n) => n.id)).toEqual(['a1', 'a2', 'b1', 'c']);
  });
});

describe('getTreeRadialMaxDepth', () => {
  it('returns the deepest depth value', () => {
    expect(getTreeRadialMaxDepth(flattenTreeRadialHierarchy(ROOT))).toBe(2);
  });
  it('empty -> 0', () => {
    expect(getTreeRadialMaxDepth([])).toBe(0);
  });
});

describe('buildTreeRadialLinkPath', () => {
  const cx = 200;
  const cy = 200;
  it('line style emits straight M + L only', () => {
    const p = buildTreeRadialLinkPath(
      { angle: 0, radius: 0 },
      { angle: Math.PI / 4, radius: 100 },
      cx,
      cy,
      'line'
    );
    expect(p.startsWith('M')).toBe(true);
    expect(p).toContain('L');
    expect(p).not.toContain('C');
    expect(p).not.toContain('A');
  });
  it('curve style emits a cubic bezier C command', () => {
    const p = buildTreeRadialLinkPath(
      { angle: 0, radius: 50 },
      { angle: Math.PI / 2, radius: 100 },
      cx,
      cy,
      'curve'
    );
    expect(p).toContain('C');
  });
  it('elbow style emits an arc then a line', () => {
    const p = buildTreeRadialLinkPath(
      { angle: 0, radius: 50 },
      { angle: Math.PI / 2, radius: 100 },
      cx,
      cy,
      'elbow'
    );
    expect(p).toContain('A');
    expect(p).toContain('L');
  });
  it('elbow with zero source radius falls back to line', () => {
    const p = buildTreeRadialLinkPath(
      { angle: 0, radius: 0 },
      { angle: Math.PI / 2, radius: 100 },
      cx,
      cy,
      'elbow'
    );
    expect(p).not.toContain('A');
    expect(p).toContain('L');
  });
});

describe('computeTreeRadialLayout', () => {
  const cx = 210;
  const cy = 210;
  const outerRadius = 160;

  it('null root -> empty', () => {
    const r = computeTreeRadialLayout({
      root: null,
      centerX: cx,
      centerY: cy,
      outerRadius,
      startAngle: 0,
      linkStyle: 'curve',
      leafColor: '#leaf',
      internalColor: '#int',
    });
    expect(r.nodes).toEqual([]);
    expect(r.links).toEqual([]);
  });

  it('non-positive radius -> empty', () => {
    const r = computeTreeRadialLayout({
      root: ROOT,
      centerX: cx,
      centerY: cy,
      outerRadius: 0,
      startAngle: 0,
      linkStyle: 'curve',
      leafColor: '#leaf',
      internalColor: '#int',
    });
    expect(r.nodes).toEqual([]);
  });

  it('produces one node per input + N-1 links', () => {
    const r = computeTreeRadialLayout({
      root: ROOT,
      centerX: cx,
      centerY: cy,
      outerRadius,
      startAngle: -Math.PI / 2,
      linkStyle: 'curve',
      leafColor: '#leaf',
      internalColor: '#int',
    });
    expect(r.nodes).toHaveLength(7);
    expect(r.links).toHaveLength(6);
    expect(r.leafCount).toBe(4);
    expect(r.maxDepth).toBe(2);
  });

  it('root sits at the centre', () => {
    const r = computeTreeRadialLayout({
      root: ROOT,
      centerX: cx,
      centerY: cy,
      outerRadius,
      startAngle: -Math.PI / 2,
      linkStyle: 'curve',
      leafColor: '#leaf',
      internalColor: '#int',
    });
    const root = r.nodes.find((n) => n.id === 'root')!;
    expect(root.x).toBeCloseTo(cx);
    expect(root.y).toBeCloseTo(cy);
    expect(root.radius).toBe(0);
  });

  it('leaves sit at outerRadius', () => {
    const r = computeTreeRadialLayout({
      root: ROOT,
      centerX: cx,
      centerY: cy,
      outerRadius,
      startAngle: -Math.PI / 2,
      linkStyle: 'curve',
      leafColor: '#leaf',
      internalColor: '#int',
    });
    for (const node of r.nodes) {
      if (node.isLeaf) {
        const dist = Math.hypot(node.x - cx, node.y - cy);
        expect(dist).toBeCloseTo(outerRadius);
      }
    }
  });

  it('leaves are evenly spaced angularly', () => {
    const r = computeTreeRadialLayout({
      root: ROOT,
      centerX: cx,
      centerY: cy,
      outerRadius,
      startAngle: -Math.PI / 2,
      linkStyle: 'curve',
      leafColor: '#leaf',
      internalColor: '#int',
    });
    const leaves = r.nodes
      .filter((n) => n.isLeaf)
      .sort((a, b) => a.leafIndex - b.leafIndex);
    const step = leaves[1]!.angle - leaves[0]!.angle;
    for (let i = 1; i < leaves.length; i++) {
      expect(leaves[i]!.angle - leaves[i - 1]!.angle).toBeCloseTo(step);
    }
  });

  it('internal-node angle equals mean of children angles', () => {
    const r = computeTreeRadialLayout({
      root: ROOT,
      centerX: cx,
      centerY: cy,
      outerRadius,
      startAngle: -Math.PI / 2,
      linkStyle: 'curve',
      leafColor: '#leaf',
      internalColor: '#int',
    });
    const a = r.nodes.find((n) => n.id === 'a')!;
    const a1 = r.nodes.find((n) => n.id === 'a1')!;
    const a2 = r.nodes.find((n) => n.id === 'a2')!;
    expect(a.angle).toBeCloseTo((a1.angle + a2.angle) / 2);
  });

  it('node radius matches depth * step', () => {
    const r = computeTreeRadialLayout({
      root: ROOT,
      centerX: cx,
      centerY: cy,
      outerRadius,
      startAngle: -Math.PI / 2,
      linkStyle: 'curve',
      leafColor: '#leaf',
      internalColor: '#int',
    });
    const a = r.nodes.find((n) => n.id === 'a')!;
    expect(a.radius).toBeCloseTo(outerRadius / 2);
  });

  it('every link emits a path string', () => {
    const r = computeTreeRadialLayout({
      root: ROOT,
      centerX: cx,
      centerY: cy,
      outerRadius,
      startAngle: -Math.PI / 2,
      linkStyle: 'curve',
      leafColor: '#leaf',
      internalColor: '#int',
    });
    for (const link of r.links) {
      expect(link.path.startsWith('M')).toBe(true);
    }
  });

  it('per-node color override beats default', () => {
    const colored: ChartTreeRadialNode = {
      id: 'r',
      label: 'R',
      color: '#abcdef',
      children: [{ id: 'x', label: 'X' }],
    };
    const r = computeTreeRadialLayout({
      root: colored,
      centerX: cx,
      centerY: cy,
      outerRadius,
      startAngle: -Math.PI / 2,
      linkStyle: 'curve',
      leafColor: '#leaf',
      internalColor: '#int',
    });
    expect(r.nodes.find((n) => n.id === 'r')!.color).toBe('#abcdef');
    expect(r.nodes.find((n) => n.id === 'x')!.color).toBe('#leaf');
  });

  it('leafCount on internal nodes equals subtree leaf count', () => {
    const r = computeTreeRadialLayout({
      root: ROOT,
      centerX: cx,
      centerY: cy,
      outerRadius,
      startAngle: 0,
      linkStyle: 'curve',
      leafColor: '#leaf',
      internalColor: '#int',
    });
    expect(r.nodes.find((n) => n.id === 'a')!.leafCount).toBe(2);
    expect(r.nodes.find((n) => n.id === 'root')!.leafCount).toBe(4);
  });

  it('childCount equals direct children count', () => {
    const r = computeTreeRadialLayout({
      root: ROOT,
      centerX: cx,
      centerY: cy,
      outerRadius,
      startAngle: 0,
      linkStyle: 'curve',
      leafColor: '#leaf',
      internalColor: '#int',
    });
    expect(r.nodes.find((n) => n.id === 'root')!.childCount).toBe(3);
    expect(r.nodes.find((n) => n.id === 'a')!.childCount).toBe(2);
    expect(r.nodes.find((n) => n.id === 'c')!.childCount).toBe(0);
  });
});

describe('describeTreeRadialChart', () => {
  it('null -> "No data"', () => {
    expect(describeTreeRadialChart(null)).toBe('No data');
  });
  it('includes node count + leaf count + depth', () => {
    const d = describeTreeRadialChart(ROOT);
    expect(d).toContain('Radial tree');
    expect(d).toContain('7 nodes');
    expect(d).toContain('4 leaves');
    expect(d).toContain('depth 2');
  });
});

describe('<ChartTreeRadial> component', () => {
  it('renders region + custom aria-label', () => {
    const { getByRole } = render(
      <ChartTreeRadial root={ROOT} ariaLabel="Test radial" />
    );
    expect(getByRole('region', { name: 'Test radial' })).toBeTruthy();
  });

  it('renders one node group + N-1 links', () => {
    const { container } = render(<ChartTreeRadial root={ROOT} />);
    expect(
      container.querySelectorAll(
        '[data-section="chart-tree-radial-node"]'
      ).length
    ).toBe(7);
    expect(
      container.querySelectorAll(
        '[data-section="chart-tree-radial-link"]'
      ).length
    ).toBe(6);
  });

  it('node data attrs mirror id / depth / parent / leaf / leafCount / childCount / angle / radius / color', () => {
    const { container } = render(<ChartTreeRadial root={ROOT} />);
    const a = container.querySelector(
      '[data-node-id="a"]'
    ) as HTMLElement;
    expect(a.getAttribute('data-node-depth')).toBe('1');
    expect(a.getAttribute('data-node-parent')).toBe('root');
    expect(a.getAttribute('data-node-is-leaf')).toBe('false');
    expect(a.getAttribute('data-node-leaf-count')).toBe('2');
    expect(a.getAttribute('data-node-child-count')).toBe('2');
    expect(a.getAttribute('data-node-angle')).toBeTruthy();
    expect(a.getAttribute('data-node-radius')).toBeTruthy();
    expect(a.getAttribute('data-node-color')).toBeTruthy();
    const a1 = container.querySelector('[data-node-id="a1"]') as HTMLElement;
    expect(a1.getAttribute('data-node-is-leaf')).toBe('true');
    expect(a1.getAttribute('data-node-leaf-index')).toBe('0');
  });

  it('link data attrs mirror source + target', () => {
    const { container } = render(<ChartTreeRadial root={ROOT} />);
    const link = container.querySelector(
      '[data-section="chart-tree-radial-link"]'
    ) as HTMLElement;
    expect(link.getAttribute('data-link-source')).toBeTruthy();
    expect(link.getAttribute('data-link-target')).toBeTruthy();
    expect(link.getAttribute('role')).toBe('graphics-symbol');
    expect(link.getAttribute('tabindex')).toBe('0');
  });

  it('node circle role=graphics-symbol + tabIndex=0 + aria-label', () => {
    const { container } = render(<ChartTreeRadial root={ROOT} />);
    const rootNode = container.querySelector(
      '[data-node-id="root"]'
    ) as HTMLElement;
    const circle = rootNode.querySelector(
      '[data-section="chart-tree-radial-node-circle"]'
    ) as SVGCircleElement;
    expect(circle.getAttribute('role')).toBe('graphics-symbol');
    expect(circle.getAttribute('tabindex')).toBe('0');
    expect(circle.getAttribute('aria-label')).toContain('Root');
    expect(circle.getAttribute('aria-label')).toContain('4 leaves');
  });

  it('root mirrors counts + max-depth + linkStyle + animate', () => {
    const { container } = render(<ChartTreeRadial root={ROOT} />);
    const root = container.querySelector(
      '[data-section="chart-tree-radial"]'
    );
    expect(root?.getAttribute('data-node-count')).toBe('7');
    expect(root?.getAttribute('data-link-count')).toBe('6');
    expect(root?.getAttribute('data-leaf-count')).toBe('4');
    expect(root?.getAttribute('data-max-depth')).toBe('2');
    expect(root?.getAttribute('data-link-style')).toBe('curve');
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('linkStyle prop switches', () => {
    const { container } = render(
      <ChartTreeRadial root={ROOT} linkStyle="line" />
    );
    expect(
      container.querySelector('[data-section="chart-tree-radial"]')!
        .getAttribute('data-link-style')
    ).toBe('line');
  });

  it('leaf labels render by default; suppression', () => {
    const a = render(<ChartTreeRadial root={ROOT} />);
    const labels = Array.from(
      a.container.querySelectorAll(
        '[data-section="chart-tree-radial-node-label"]'
      )
    ).map((n) => n.textContent);
    expect(labels).toContain('A1');
    cleanup();
    const b = render(
      <ChartTreeRadial root={ROOT} showLeafLabels={false} />
    );
    expect(
      b.container.querySelector(
        '[data-section="chart-tree-radial-node-label"]'
      )
    ).toBeNull();
  });

  it('internal labels hidden by default; showInternalLabels enables them', () => {
    const a = render(<ChartTreeRadial root={ROOT} />);
    const labelsA = Array.from(
      a.container.querySelectorAll(
        '[data-section="chart-tree-radial-node-label"]'
      )
    ).map((n) => n.textContent);
    expect(labelsA).not.toContain('A');
    cleanup();
    const b = render(
      <ChartTreeRadial root={ROOT} showInternalLabels />
    );
    const labelsB = Array.from(
      b.container.querySelectorAll(
        '[data-section="chart-tree-radial-node-label"]'
      )
    ).map((n) => n.textContent);
    expect(labelsB).toContain('A');
    expect(labelsB).toContain('Root');
  });

  it('rotateLeafLabels=false uses absolute label positions', () => {
    const a = render(<ChartTreeRadial root={ROOT} />);
    const aLabels = a.container.querySelectorAll(
      '[data-section="chart-tree-radial-node-label"]'
    );
    const hasTransform = Array.from(aLabels).some((l) =>
      l.getAttribute('transform')
    );
    expect(hasTransform).toBe(true);
    cleanup();
    const b = render(
      <ChartTreeRadial root={ROOT} rotateLeafLabels={false} />
    );
    const bLabels = b.container.querySelectorAll(
      '[data-section="chart-tree-radial-node-label"]'
    );
    const hasTransformB = Array.from(bLabels).some((l) =>
      l.getAttribute('transform')
    );
    expect(hasTransformB).toBe(false);
  });

  it('showNodes=false suppresses node circles', () => {
    const { container } = render(
      <ChartTreeRadial root={ROOT} showNodes={false} />
    );
    expect(
      container.querySelector('[data-section="chart-tree-radial-node"]')
    ).toBeNull();
  });

  it('hover node opens tooltip', () => {
    const { container } = render(<ChartTreeRadial root={ROOT} />);
    fireEvent.mouseEnter(
      container.querySelector('[data-node-id="a"]')! as HTMLElement
    );
    expect(
      container.querySelector('[data-section="chart-tree-radial-tooltip"]')
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-tree-radial-tooltip-label"]'
      )?.textContent
    ).toBe('A');
    expect(
      container.querySelector(
        '[data-section="chart-tree-radial-tooltip-leaves"]'
      )?.textContent
    ).toContain('2 leaves');
  });

  it('leaf hover shows "leaf"', () => {
    const { container } = render(<ChartTreeRadial root={ROOT} />);
    fireEvent.mouseEnter(
      container.querySelector('[data-node-id="a1"]')! as HTMLElement
    );
    expect(
      container.querySelector(
        '[data-section="chart-tree-radial-tooltip-leaves"]'
      )?.textContent
    ).toBe('leaf');
  });

  it('hover link opens link tooltip', () => {
    const { container } = render(<ChartTreeRadial root={ROOT} />);
    fireEvent.mouseEnter(
      container.querySelector(
        '[data-section="chart-tree-radial-link"]'
      )! as HTMLElement
    );
    expect(
      container.querySelector(
        '[data-section="chart-tree-radial-link-tooltip"]'
      )
    ).not.toBeNull();
  });

  it('tooltip hides on mouseleave', () => {
    const { container } = render(<ChartTreeRadial root={ROOT} />);
    const a = container.querySelector('[data-node-id="a"]') as HTMLElement;
    fireEvent.mouseEnter(a);
    expect(
      container.querySelector('[data-section="chart-tree-radial-tooltip"]')
    ).not.toBeNull();
    fireEvent.mouseLeave(a);
    expect(
      container.querySelector('[data-section="chart-tree-radial-tooltip"]')
    ).toBeNull();
  });

  it('showTooltip=false suppresses both tooltips', () => {
    const { container } = render(
      <ChartTreeRadial root={ROOT} showTooltip={false} />
    );
    fireEvent.mouseEnter(
      container.querySelector('[data-node-id="a"]')! as HTMLElement
    );
    expect(
      container.querySelector('[data-section="chart-tree-radial-tooltip"]')
    ).toBeNull();
  });

  it('formatLabel rewrites node labels', () => {
    const { container } = render(
      <ChartTreeRadial
        root={ROOT}
        formatLabel={(label, node) => `${node.depth}:${label}`}
      />
    );
    const labels = Array.from(
      container.querySelectorAll(
        '[data-section="chart-tree-radial-node-label"]'
      )
    ).map((n) => n.textContent);
    expect(labels).toContain('2:A1');
  });

  it('onNodeClick fires with node payload', () => {
    const onNodeClick = vi.fn();
    const { container } = render(
      <ChartTreeRadial root={ROOT} onNodeClick={onNodeClick} />
    );
    fireEvent.click(
      container.querySelector('[data-node-id="a1"]')! as HTMLElement
    );
    expect(onNodeClick).toHaveBeenCalledTimes(1);
    expect(onNodeClick.mock.calls[0]![0].node.id).toBe('a1');
  });

  it('onLinkClick fires with link payload', () => {
    const onLinkClick = vi.fn();
    const { container } = render(
      <ChartTreeRadial root={ROOT} onLinkClick={onLinkClick} />
    );
    fireEvent.click(
      container.querySelector(
        '[data-section="chart-tree-radial-link"]'
      )! as HTMLElement
    );
    expect(onLinkClick).toHaveBeenCalledTimes(1);
    expect(onLinkClick.mock.calls[0]![0].link.index).toBe(0);
  });

  it('data-hovered mirrors hover state', () => {
    const { container } = render(<ChartTreeRadial root={ROOT} />);
    const a = container.querySelector('[data-node-id="a"]') as HTMLElement;
    expect(a.getAttribute('data-hovered')).toBe('false');
    fireEvent.mouseEnter(a);
    expect(a.getAttribute('data-hovered')).toBe('true');
    fireEvent.mouseLeave(a);
    expect(a.getAttribute('data-hovered')).toBe('false');
  });

  it('auto ARIA description renders by default', () => {
    const { container } = render(<ChartTreeRadial root={ROOT} />);
    expect(
      container.querySelector(
        '[data-section="chart-tree-radial-aria-desc"]'
      )?.textContent
    ).toContain('Radial tree');
  });

  it('ariaDescription override beats auto', () => {
    const { container } = render(
      <ChartTreeRadial root={ROOT} ariaDescription="Override" />
    );
    expect(
      container.querySelector(
        '[data-section="chart-tree-radial-aria-desc"]'
      )?.textContent
    ).toBe('Override');
  });

  it('SVG mirrors width / height / viewBox', () => {
    const { container } = render(
      <ChartTreeRadial root={ROOT} width={500} height={500} />
    );
    const svg = container.querySelector(
      '[data-section="chart-tree-radial-svg"]'
    ) as SVGElement;
    expect(svg.getAttribute('width')).toBe('500');
    expect(svg.getAttribute('height')).toBe('500');
    expect(svg.getAttribute('viewBox')).toBe('0 0 500 500');
  });

  it('null root renders without crashing', () => {
    const { container } = render(<ChartTreeRadial root={null} />);
    expect(
      container.querySelectorAll('[data-section="chart-tree-radial-node"]').length
    ).toBe(0);
    expect(
      container.querySelector(
        '[data-section="chart-tree-radial-aria-desc"]'
      )?.textContent
    ).toBe('No data');
  });

  it('forwards ref to root', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartTreeRadial root={ROOT} ref={ref} />);
    expect(ref.current?.dataset.section).toBe('chart-tree-radial');
  });

  it('has stable displayName', () => {
    expect(ChartTreeRadial.displayName).toBe('ChartTreeRadial');
  });

  it('data-animate mirrors prop', () => {
    const { container } = render(
      <ChartTreeRadial root={ROOT} animate={false} />
    );
    expect(
      container.querySelector('[data-section="chart-tree-radial"]')!
        .getAttribute('data-animate')
    ).toBe('false');
  });
});
