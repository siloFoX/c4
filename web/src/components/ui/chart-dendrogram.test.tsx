import { afterEach, describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import {
  ChartDendrogram,
  buildDendrogramElbowPath,
  computeDendrogramLayout,
  describeDendrogramChart,
  flattenDendrogramHierarchy,
  getDendrogramDefaultColor,
  getDendrogramLeaves,
  getDendrogramMaxDepth,
  DEFAULT_CHART_DENDROGRAM_WIDTH,
  DEFAULT_CHART_DENDROGRAM_HEIGHT,
  DEFAULT_CHART_DENDROGRAM_PADDING,
  DEFAULT_CHART_DENDROGRAM_LABEL_GAP,
  DEFAULT_CHART_DENDROGRAM_NODE_RADIUS,
  DEFAULT_CHART_DENDROGRAM_LEAF_RADIUS,
  DEFAULT_CHART_DENDROGRAM_ORIENTATION,
  DEFAULT_CHART_DENDROGRAM_LINK_COLOR,
  DEFAULT_CHART_DENDROGRAM_LEAF_COLOR,
  DEFAULT_CHART_DENDROGRAM_INTERNAL_COLOR,
  type ChartDendrogramNode,
} from './chart-dendrogram';

afterEach(() => cleanup());

const ROOT: ChartDendrogramNode = {
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

describe('chart-dendrogram constants', () => {
  it('exports the documented defaults', () => {
    expect(DEFAULT_CHART_DENDROGRAM_WIDTH).toBe(560);
    expect(DEFAULT_CHART_DENDROGRAM_HEIGHT).toBe(360);
    expect(DEFAULT_CHART_DENDROGRAM_PADDING).toBe(24);
    expect(DEFAULT_CHART_DENDROGRAM_LABEL_GAP).toBe(6);
    expect(DEFAULT_CHART_DENDROGRAM_NODE_RADIUS).toBe(3);
    expect(DEFAULT_CHART_DENDROGRAM_LEAF_RADIUS).toBe(4);
    expect(DEFAULT_CHART_DENDROGRAM_ORIENTATION).toBe('right');
    expect(DEFAULT_CHART_DENDROGRAM_LINK_COLOR).toBe('#94a3b8');
    expect(DEFAULT_CHART_DENDROGRAM_LEAF_COLOR).toBe('#2563eb');
    expect(DEFAULT_CHART_DENDROGRAM_INTERNAL_COLOR).toBe('#64748b');
  });
});

describe('getDendrogramDefaultColor', () => {
  it('returns leaf or internal color based on flag', () => {
    expect(getDendrogramDefaultColor(true, '#leaf', '#int')).toBe('#leaf');
    expect(getDendrogramDefaultColor(false, '#leaf', '#int')).toBe('#int');
  });
});

describe('flattenDendrogramHierarchy', () => {
  it('returns one entry per node with depth + path', () => {
    const flat = flattenDendrogramHierarchy(ROOT);
    expect(flat).toHaveLength(7);
    expect(flat[0]!.id).toBe('root');
    const a1 = flat.find((n) => n.id === 'a1')!;
    expect(a1.depth).toBe(2);
    expect(a1.parentId).toBe('a');
    expect(a1.path).toEqual(['root', 'a', 'a1']);
    expect(a1.isLeaf).toBe(true);
  });
  it('null root -> []', () => {
    expect(flattenDendrogramHierarchy(null)).toEqual([]);
  });
});

describe('getDendrogramLeaves', () => {
  it('returns only leaves in DFS order', () => {
    const leaves = getDendrogramLeaves(ROOT);
    expect(leaves.map((n) => n.id)).toEqual(['a1', 'a2', 'b1', 'c']);
  });
  it('null root -> []', () => {
    expect(getDendrogramLeaves(null)).toEqual([]);
  });
});

describe('getDendrogramMaxDepth', () => {
  it('returns the deepest depth value', () => {
    expect(getDendrogramMaxDepth(flattenDendrogramHierarchy(ROOT))).toBe(2);
  });
  it('empty -> 0', () => {
    expect(getDendrogramMaxDepth([])).toBe(0);
  });
});

describe('buildDendrogramElbowPath', () => {
  it('right orientation: horizontal then vertical', () => {
    const p = buildDendrogramElbowPath(
      { x: 0, y: 0 },
      { x: 100, y: 50 },
      'right'
    );
    expect(p.startsWith('M 0.00 0.00')).toBe(true);
    expect(p).toContain('L 100.00 0.00');
    expect(p).toContain('L 100.00 50.00');
  });
  it('left orientation: same x-first elbow', () => {
    const p = buildDendrogramElbowPath(
      { x: 100, y: 0 },
      { x: 0, y: 50 },
      'left'
    );
    expect(p).toContain('L 0.00 0.00');
    expect(p).toContain('L 0.00 50.00');
  });
  it('down orientation: vertical then horizontal', () => {
    const p = buildDendrogramElbowPath(
      { x: 0, y: 0 },
      { x: 50, y: 100 },
      'down'
    );
    expect(p).toContain('L 0.00 100.00');
    expect(p).toContain('L 50.00 100.00');
  });
  it('up orientation: y-first elbow', () => {
    const p = buildDendrogramElbowPath(
      { x: 0, y: 100 },
      { x: 50, y: 0 },
      'up'
    );
    expect(p).toContain('L 0.00 0.00');
    expect(p).toContain('L 50.00 0.00');
  });
});

describe('computeDendrogramLayout', () => {
  const W = 500;
  const H = 320;
  const padX = 0;
  const padY = 0;
  const labelGap = 6;
  const reserve = 80;

  it('null root -> empty', () => {
    const r = computeDendrogramLayout({
      root: null,
      orientation: 'right',
      width: W,
      height: H,
      padX,
      padY,
      labelGap,
      leafLabelReserve: reserve,
      leafColor: '#leaf',
      internalColor: '#int',
    });
    expect(r.nodes).toEqual([]);
    expect(r.links).toEqual([]);
  });

  it('non-positive dims -> empty', () => {
    const r = computeDendrogramLayout({
      root: ROOT,
      orientation: 'right',
      width: 0,
      height: H,
      padX,
      padY,
      labelGap,
      leafLabelReserve: reserve,
      leafColor: '#leaf',
      internalColor: '#int',
    });
    expect(r.nodes).toEqual([]);
  });

  it('produces one node per input + N-1 links', () => {
    const r = computeDendrogramLayout({
      root: ROOT,
      orientation: 'right',
      width: W,
      height: H,
      padX,
      padY,
      labelGap,
      leafLabelReserve: reserve,
      leafColor: '#leaf',
      internalColor: '#int',
    });
    expect(r.nodes).toHaveLength(7);
    expect(r.links).toHaveLength(6);
    expect(r.leafCount).toBe(4);
    expect(r.maxDepth).toBe(2);
  });

  it('right orientation: root x at left; leaves x at the right (minus reserve)', () => {
    const r = computeDendrogramLayout({
      root: ROOT,
      orientation: 'right',
      width: W,
      height: H,
      padX,
      padY,
      labelGap,
      leafLabelReserve: reserve,
      leafColor: '#leaf',
      internalColor: '#int',
    });
    const root = r.nodes.find((n) => n.id === 'root')!;
    const a1 = r.nodes.find((n) => n.id === 'a1')!;
    expect(root.x).toBeCloseTo(0);
    expect(a1.x).toBeCloseTo(W - reserve);
  });

  it('down orientation: root y at top; leaves y at the bottom', () => {
    const r = computeDendrogramLayout({
      root: ROOT,
      orientation: 'down',
      width: W,
      height: H,
      padX,
      padY,
      labelGap,
      leafLabelReserve: reserve,
      leafColor: '#leaf',
      internalColor: '#int',
    });
    const root = r.nodes.find((n) => n.id === 'root')!;
    const a1 = r.nodes.find((n) => n.id === 'a1')!;
    expect(root.y).toBeCloseTo(0);
    expect(a1.y).toBeCloseTo(H - reserve);
  });

  it('leaves are evenly spaced on the leaf axis (right orientation)', () => {
    const r = computeDendrogramLayout({
      root: ROOT,
      orientation: 'right',
      width: W,
      height: H,
      padX,
      padY,
      labelGap,
      leafLabelReserve: reserve,
      leafColor: '#leaf',
      internalColor: '#int',
    });
    const leaves = r.nodes
      .filter((n) => n.isLeaf)
      .sort((a, b) => a.leafIndex - b.leafIndex);
    const step = leaves[1]!.y - leaves[0]!.y;
    for (let i = 1; i < leaves.length; i++) {
      expect(leaves[i]!.y - leaves[i - 1]!.y).toBeCloseTo(step);
    }
  });

  it('internal-node leaf position equals centroid of its children', () => {
    const r = computeDendrogramLayout({
      root: ROOT,
      orientation: 'right',
      width: W,
      height: H,
      padX,
      padY,
      labelGap,
      leafLabelReserve: reserve,
      leafColor: '#leaf',
      internalColor: '#int',
    });
    const a = r.nodes.find((n) => n.id === 'a')!;
    const a1 = r.nodes.find((n) => n.id === 'a1')!;
    const a2 = r.nodes.find((n) => n.id === 'a2')!;
    expect(a.y).toBeCloseTo((a1.y + a2.y) / 2);
  });

  it('every link has elbow path between source and target', () => {
    const r = computeDendrogramLayout({
      root: ROOT,
      orientation: 'right',
      width: W,
      height: H,
      padX,
      padY,
      labelGap,
      leafLabelReserve: reserve,
      leafColor: '#leaf',
      internalColor: '#int',
    });
    for (const link of r.links) {
      expect(link.path.startsWith('M')).toBe(true);
      expect((link.path.match(/L /g) || []).length).toBe(2);
    }
  });

  it('per-node color override beats default', () => {
    const colored: ChartDendrogramNode = {
      id: 'r',
      label: 'R',
      color: '#abcdef',
      children: [{ id: 'x', label: 'X' }],
    };
    const r = computeDendrogramLayout({
      root: colored,
      orientation: 'right',
      width: W,
      height: H,
      padX,
      padY,
      labelGap,
      leafLabelReserve: reserve,
      leafColor: '#leaf',
      internalColor: '#int',
    });
    expect(r.nodes.find((n) => n.id === 'r')!.color).toBe('#abcdef');
    expect(r.nodes.find((n) => n.id === 'x')!.color).toBe('#leaf');
  });

  it('leafCount on internal nodes equals the subtree leaf count', () => {
    const r = computeDendrogramLayout({
      root: ROOT,
      orientation: 'right',
      width: W,
      height: H,
      padX,
      padY,
      labelGap,
      leafLabelReserve: reserve,
      leafColor: '#leaf',
      internalColor: '#int',
    });
    const a = r.nodes.find((n) => n.id === 'a')!;
    expect(a.leafCount).toBe(2);
    const root = r.nodes.find((n) => n.id === 'root')!;
    expect(root.leafCount).toBe(4);
  });

  it('childCount on internal nodes equals direct children count', () => {
    const r = computeDendrogramLayout({
      root: ROOT,
      orientation: 'right',
      width: W,
      height: H,
      padX,
      padY,
      labelGap,
      leafLabelReserve: reserve,
      leafColor: '#leaf',
      internalColor: '#int',
    });
    expect(r.nodes.find((n) => n.id === 'root')!.childCount).toBe(3);
    expect(r.nodes.find((n) => n.id === 'a')!.childCount).toBe(2);
    expect(r.nodes.find((n) => n.id === 'c')!.childCount).toBe(0);
  });

  it('single-leaf tree centres the leaf', () => {
    const r = computeDendrogramLayout({
      root: { id: 'only', label: 'Only' },
      orientation: 'right',
      width: W,
      height: H,
      padX,
      padY,
      labelGap,
      leafLabelReserve: reserve,
      leafColor: '#leaf',
      internalColor: '#int',
    });
    expect(r.nodes).toHaveLength(1);
    expect(r.nodes[0]!.y).toBeCloseTo(H / 2);
  });
});

describe('describeDendrogramChart', () => {
  it('null -> "No data"', () => {
    expect(describeDendrogramChart(null, 'right')).toBe('No data');
  });
  it('includes orientation + node count + leaf count + depth', () => {
    const d = describeDendrogramChart(ROOT, 'down');
    expect(d).toContain('Dendrogram (down)');
    expect(d).toContain('7 nodes');
    expect(d).toContain('4 leaves');
    expect(d).toContain('depth 2');
  });
});

describe('<ChartDendrogram> component', () => {
  it('renders region + custom aria-label', () => {
    const { getByRole } = render(
      <ChartDendrogram root={ROOT} ariaLabel="Test dendrogram" />
    );
    expect(getByRole('region', { name: 'Test dendrogram' })).toBeTruthy();
  });

  it('renders one node group + N-1 links', () => {
    const { container } = render(<ChartDendrogram root={ROOT} />);
    expect(
      container.querySelectorAll(
        '[data-section="chart-dendrogram-node"]'
      ).length
    ).toBe(7);
    expect(
      container.querySelectorAll(
        '[data-section="chart-dendrogram-link"]'
      ).length
    ).toBe(6);
  });

  it('node data attrs mirror id / depth / parent / leaf / leafCount / childCount / color', () => {
    const { container } = render(<ChartDendrogram root={ROOT} />);
    const a = container.querySelector(
      '[data-node-id="a"]'
    ) as HTMLElement;
    expect(a.getAttribute('data-node-depth')).toBe('1');
    expect(a.getAttribute('data-node-parent')).toBe('root');
    expect(a.getAttribute('data-node-is-leaf')).toBe('false');
    expect(a.getAttribute('data-node-leaf-count')).toBe('2');
    expect(a.getAttribute('data-node-child-count')).toBe('2');
    expect(a.getAttribute('data-node-color')).toBeTruthy();
    const a1 = container.querySelector(
      '[data-node-id="a1"]'
    ) as HTMLElement;
    expect(a1.getAttribute('data-node-is-leaf')).toBe('true');
    expect(a1.getAttribute('data-node-leaf-index')).toBe('0');
  });

  it('link data attrs mirror source + target', () => {
    const { container } = render(<ChartDendrogram root={ROOT} />);
    const link = container.querySelector(
      '[data-section="chart-dendrogram-link"]'
    ) as HTMLElement;
    expect(link.getAttribute('data-link-source')).toBeTruthy();
    expect(link.getAttribute('data-link-target')).toBeTruthy();
    expect(link.getAttribute('role')).toBe('graphics-symbol');
    expect(link.getAttribute('tabindex')).toBe('0');
  });

  it('node circle role=graphics-symbol + tabIndex=0 + aria-label', () => {
    const { container } = render(<ChartDendrogram root={ROOT} />);
    const rootNode = container.querySelector(
      '[data-node-id="root"]'
    ) as HTMLElement;
    const circle = rootNode.querySelector(
      '[data-section="chart-dendrogram-node-circle"]'
    ) as SVGCircleElement;
    expect(circle.getAttribute('role')).toBe('graphics-symbol');
    expect(circle.getAttribute('tabindex')).toBe('0');
    expect(circle.getAttribute('aria-label')).toContain('Root');
    expect(circle.getAttribute('aria-label')).toContain('4 leaves');
  });

  it('root mirrors node + link + leaf counts + max-depth + orientation + animate', () => {
    const { container } = render(<ChartDendrogram root={ROOT} />);
    const root = container.querySelector('[data-section="chart-dendrogram"]');
    expect(root?.getAttribute('data-node-count')).toBe('7');
    expect(root?.getAttribute('data-link-count')).toBe('6');
    expect(root?.getAttribute('data-leaf-count')).toBe('4');
    expect(root?.getAttribute('data-max-depth')).toBe('2');
    expect(root?.getAttribute('data-orientation')).toBe('right');
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('orientation prop switches', () => {
    const { container } = render(
      <ChartDendrogram root={ROOT} orientation="down" />
    );
    expect(
      container.querySelector('[data-section="chart-dendrogram"]')!
        .getAttribute('data-orientation')
    ).toBe('down');
  });

  it('leaf labels render by default; suppression', () => {
    const a = render(<ChartDendrogram root={ROOT} />);
    const labels = Array.from(
      a.container.querySelectorAll(
        '[data-section="chart-dendrogram-node-label"]'
      )
    ).map((n) => n.textContent);
    expect(labels).toContain('A1');
    expect(labels).toContain('C');
    cleanup();
    const b = render(<ChartDendrogram root={ROOT} showLeafLabels={false} />);
    expect(
      b.container.querySelector(
        '[data-section="chart-dendrogram-node-label"]'
      )
    ).toBeNull();
  });

  it('internal labels hidden by default; showInternalLabels=true renders them', () => {
    const a = render(<ChartDendrogram root={ROOT} />);
    const labelsA = Array.from(
      a.container.querySelectorAll(
        '[data-section="chart-dendrogram-node-label"]'
      )
    ).map((n) => n.textContent);
    expect(labelsA).not.toContain('A');
    cleanup();
    const b = render(<ChartDendrogram root={ROOT} showInternalLabels />);
    const labelsB = Array.from(
      b.container.querySelectorAll(
        '[data-section="chart-dendrogram-node-label"]'
      )
    ).map((n) => n.textContent);
    expect(labelsB).toContain('A');
    expect(labelsB).toContain('Root');
  });

  it('showNodes=false suppresses node circles', () => {
    const { container } = render(
      <ChartDendrogram root={ROOT} showNodes={false} />
    );
    expect(
      container.querySelector('[data-section="chart-dendrogram-node"]')
    ).toBeNull();
  });

  it('hover node opens node tooltip with label + depth + leaves', () => {
    const { container } = render(<ChartDendrogram root={ROOT} />);
    fireEvent.mouseEnter(
      container.querySelector('[data-node-id="a"]')! as HTMLElement
    );
    expect(
      container.querySelector('[data-section="chart-dendrogram-tooltip"]')
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-dendrogram-tooltip-label"]'
      )?.textContent
    ).toBe('A');
    expect(
      container.querySelector(
        '[data-section="chart-dendrogram-tooltip-depth"]'
      )?.textContent
    ).toContain('depth:');
    expect(
      container.querySelector(
        '[data-section="chart-dendrogram-tooltip-leaves"]'
      )?.textContent
    ).toContain('2 leaves');
  });

  it('leaf hover shows "leaf" not "N leaves"', () => {
    const { container } = render(<ChartDendrogram root={ROOT} />);
    fireEvent.mouseEnter(
      container.querySelector('[data-node-id="a1"]')! as HTMLElement
    );
    expect(
      container.querySelector(
        '[data-section="chart-dendrogram-tooltip-leaves"]'
      )?.textContent
    ).toBe('leaf');
  });

  it('hover link opens link tooltip', () => {
    const { container } = render(<ChartDendrogram root={ROOT} />);
    const link = container.querySelector(
      '[data-section="chart-dendrogram-link"]'
    ) as HTMLElement;
    fireEvent.mouseEnter(link);
    expect(
      container.querySelector(
        '[data-section="chart-dendrogram-link-tooltip"]'
      )
    ).not.toBeNull();
  });

  it('tooltip hides on mouseleave', () => {
    const { container } = render(<ChartDendrogram root={ROOT} />);
    const a = container.querySelector('[data-node-id="a"]') as HTMLElement;
    fireEvent.mouseEnter(a);
    expect(
      container.querySelector('[data-section="chart-dendrogram-tooltip"]')
    ).not.toBeNull();
    fireEvent.mouseLeave(a);
    expect(
      container.querySelector('[data-section="chart-dendrogram-tooltip"]')
    ).toBeNull();
  });

  it('showTooltip=false suppresses both node + link tooltips', () => {
    const { container } = render(
      <ChartDendrogram root={ROOT} showTooltip={false} />
    );
    fireEvent.mouseEnter(
      container.querySelector('[data-node-id="a"]')! as HTMLElement
    );
    expect(
      container.querySelector('[data-section="chart-dendrogram-tooltip"]')
    ).toBeNull();
  });

  it('formatLabel rewrites node labels', () => {
    const { container } = render(
      <ChartDendrogram
        root={ROOT}
        formatLabel={(label, node) => `${node.depth}:${label}`}
      />
    );
    const labels = Array.from(
      container.querySelectorAll(
        '[data-section="chart-dendrogram-node-label"]'
      )
    ).map((n) => n.textContent);
    expect(labels).toContain('2:A1');
  });

  it('onNodeClick fires with node payload', () => {
    const onNodeClick = vi.fn();
    const { container } = render(
      <ChartDendrogram root={ROOT} onNodeClick={onNodeClick} />
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
      <ChartDendrogram root={ROOT} onLinkClick={onLinkClick} />
    );
    fireEvent.click(
      container.querySelector(
        '[data-section="chart-dendrogram-link"]'
      )! as HTMLElement
    );
    expect(onLinkClick).toHaveBeenCalledTimes(1);
    expect(onLinkClick.mock.calls[0]![0].link.index).toBe(0);
  });

  it('data-hovered mirrors hover state', () => {
    const { container } = render(<ChartDendrogram root={ROOT} />);
    const a = container.querySelector('[data-node-id="a"]') as HTMLElement;
    expect(a.getAttribute('data-hovered')).toBe('false');
    fireEvent.mouseEnter(a);
    expect(a.getAttribute('data-hovered')).toBe('true');
    fireEvent.mouseLeave(a);
    expect(a.getAttribute('data-hovered')).toBe('false');
  });

  it('auto ARIA description renders by default', () => {
    const { container } = render(<ChartDendrogram root={ROOT} />);
    expect(
      container.querySelector(
        '[data-section="chart-dendrogram-aria-desc"]'
      )?.textContent
    ).toContain('Dendrogram');
  });

  it('ariaDescription override beats auto', () => {
    const { container } = render(
      <ChartDendrogram root={ROOT} ariaDescription="Override" />
    );
    expect(
      container.querySelector(
        '[data-section="chart-dendrogram-aria-desc"]'
      )?.textContent
    ).toBe('Override');
  });

  it('SVG mirrors width / height / viewBox', () => {
    const { container } = render(
      <ChartDendrogram root={ROOT} width={500} height={300} />
    );
    const svg = container.querySelector(
      '[data-section="chart-dendrogram-svg"]'
    ) as SVGElement;
    expect(svg.getAttribute('width')).toBe('500');
    expect(svg.getAttribute('height')).toBe('300');
    expect(svg.getAttribute('viewBox')).toBe('0 0 500 300');
  });

  it('null root renders without crashing', () => {
    const { container } = render(<ChartDendrogram root={null} />);
    expect(
      container.querySelectorAll('[data-section="chart-dendrogram-node"]').length
    ).toBe(0);
    expect(
      container.querySelector('[data-section="chart-dendrogram-aria-desc"]')
        ?.textContent
    ).toBe('No data');
  });

  it('forwards ref to root', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartDendrogram root={ROOT} ref={ref} />);
    expect(ref.current?.dataset.section).toBe('chart-dendrogram');
  });

  it('has stable displayName', () => {
    expect(ChartDendrogram.displayName).toBe('ChartDendrogram');
  });

  it('data-animate mirrors prop', () => {
    const { container } = render(
      <ChartDendrogram root={ROOT} animate={false} />
    );
    expect(
      container.querySelector('[data-section="chart-dendrogram"]')!
        .getAttribute('data-animate')
    ).toBe('false');
  });
});
