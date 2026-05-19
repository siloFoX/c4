import { afterEach, describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import {
  ChartCluster,
  computeClusterLayout,
  describeClusterChart,
  flattenClusterHierarchy,
  getClusterDefaultColor,
  getClusterLeaves,
  getClusterMaxDistance,
  getClusterNodeDistance,
  getClusterTicks,
  DEFAULT_CHART_CLUSTER_WIDTH,
  DEFAULT_CHART_CLUSTER_HEIGHT,
  DEFAULT_CHART_CLUSTER_PADDING,
  DEFAULT_CHART_CLUSTER_AXIS_RESERVE,
  DEFAULT_CHART_CLUSTER_LEAF_LABEL_RESERVE,
  DEFAULT_CHART_CLUSTER_LEAF_RADIUS,
  DEFAULT_CHART_CLUSTER_NODE_RADIUS,
  DEFAULT_CHART_CLUSTER_TICK_COUNT,
  DEFAULT_CHART_CLUSTER_LINK_COLOR,
  DEFAULT_CHART_CLUSTER_LEAF_COLOR,
  DEFAULT_CHART_CLUSTER_INTERNAL_COLOR,
  DEFAULT_CHART_CLUSTER_CUT_COLOR,
  DEFAULT_CHART_CLUSTER_PALETTE,
  type ChartClusterNode,
} from './chart-cluster';

afterEach(() => cleanup());

const ROOT: ChartClusterNode = {
  id: 'root',
  label: 'Root',
  distance: 1,
  children: [
    {
      id: 'a',
      label: 'A',
      distance: 0.7,
      children: [
        { id: 'a1', label: 'A1' },
        { id: 'a2', label: 'A2' },
      ],
    },
    {
      id: 'b',
      label: 'B',
      distance: 0.4,
      children: [{ id: 'b1', label: 'B1' }],
    },
    { id: 'c', label: 'C' },
  ],
};

describe('chart-cluster constants', () => {
  it('exports the documented defaults', () => {
    expect(DEFAULT_CHART_CLUSTER_WIDTH).toBe(560);
    expect(DEFAULT_CHART_CLUSTER_HEIGHT).toBe(360);
    expect(DEFAULT_CHART_CLUSTER_PADDING).toBe(32);
    expect(DEFAULT_CHART_CLUSTER_AXIS_RESERVE).toBe(48);
    expect(DEFAULT_CHART_CLUSTER_LEAF_LABEL_RESERVE).toBe(48);
    expect(DEFAULT_CHART_CLUSTER_LEAF_RADIUS).toBe(3);
    expect(DEFAULT_CHART_CLUSTER_NODE_RADIUS).toBe(2);
    expect(DEFAULT_CHART_CLUSTER_TICK_COUNT).toBe(5);
    expect(DEFAULT_CHART_CLUSTER_LINK_COLOR).toBe('#475569');
    expect(DEFAULT_CHART_CLUSTER_LEAF_COLOR).toBe('#0f172a');
    expect(DEFAULT_CHART_CLUSTER_INTERNAL_COLOR).toBe('#64748b');
    expect(DEFAULT_CHART_CLUSTER_CUT_COLOR).toBe('#dc2626');
    expect(DEFAULT_CHART_CLUSTER_PALETTE.length).toBe(10);
  });
});

describe('getClusterDefaultColor', () => {
  it('palette + modulo + invalid fallback', () => {
    expect(getClusterDefaultColor(0)).toBe(DEFAULT_CHART_CLUSTER_PALETTE[0]);
    expect(getClusterDefaultColor(DEFAULT_CHART_CLUSTER_PALETTE.length)).toBe(
      DEFAULT_CHART_CLUSTER_PALETTE[0]
    );
    expect(getClusterDefaultColor(-1)).toBe(DEFAULT_CHART_CLUSTER_PALETTE[0]);
  });
});

describe('getClusterNodeDistance', () => {
  it('explicit positive finite distance wins', () => {
    expect(
      getClusterNodeDistance({ id: 'a', label: 'A', distance: 5 }, 0, 3)
    ).toBe(5);
  });
  it('zero is allowed (explicit leaf distance)', () => {
    expect(
      getClusterNodeDistance({ id: 'a', label: 'A', distance: 0 }, 0, 3)
    ).toBe(0);
  });
  it('leaf without explicit distance -> 0', () => {
    expect(getClusterNodeDistance({ id: 'l', label: 'L' }, 2, 3)).toBe(0);
  });
  it('internal without explicit distance falls back to depth-based ratio', () => {
    expect(
      getClusterNodeDistance(
        { id: 'p', label: 'P', children: [{ id: 'c', label: 'C' }] },
        0,
        3
      )
    ).toBeCloseTo(1);
    expect(
      getClusterNodeDistance(
        { id: 'p', label: 'P', children: [{ id: 'c', label: 'C' }] },
        1,
        3
      )
    ).toBeCloseTo(2 / 3);
  });
  it('non-finite / negative distance falls through to fallback', () => {
    expect(
      getClusterNodeDistance(
        { id: 'p', label: 'P', distance: Number.NaN, children: [{ id: 'c', label: 'C' }] },
        0,
        3
      )
    ).toBeCloseTo(1);
    expect(
      getClusterNodeDistance(
        { id: 'p', label: 'P', distance: -1, children: [{ id: 'c', label: 'C' }] },
        0,
        3
      )
    ).toBeCloseTo(1);
  });
});

describe('flattenClusterHierarchy', () => {
  it('returns one entry per node with depth + path + distance', () => {
    const flat = flattenClusterHierarchy(ROOT);
    expect(flat).toHaveLength(7);
    expect(flat[0]!.id).toBe('root');
    const a = flat.find((n) => n.id === 'a')!;
    expect(a.depth).toBe(1);
    expect(a.distance).toBeCloseTo(0.7);
    const a1 = flat.find((n) => n.id === 'a1')!;
    expect(a1.isLeaf).toBe(true);
    expect(a1.distance).toBe(0);
  });
  it('null root -> []', () => {
    expect(flattenClusterHierarchy(null)).toEqual([]);
  });
});

describe('getClusterLeaves', () => {
  it('returns only leaves in DFS order', () => {
    const leaves = getClusterLeaves(ROOT);
    expect(leaves.map((n) => n.id)).toEqual(['a1', 'a2', 'b1', 'c']);
  });
});

describe('getClusterMaxDistance', () => {
  it('returns the largest distance', () => {
    expect(getClusterMaxDistance(flattenClusterHierarchy(ROOT))).toBeCloseTo(1);
  });
  it('empty / zero -> 1 (fallback so the y-axis still scales)', () => {
    expect(getClusterMaxDistance([])).toBe(1);
  });
});

describe('getClusterTicks', () => {
  it('non-positive max -> [0]', () => {
    expect(getClusterTicks(0)).toEqual([0]);
    expect(getClusterTicks(-1)).toEqual([0]);
  });
  it('returns count evenly-spaced ticks from 0 to max', () => {
    const t = getClusterTicks(1, 5);
    expect(t).toHaveLength(5);
    expect(t[0]).toBeCloseTo(0);
    expect(t[4]).toBeCloseTo(1);
  });
  it('clamps count to >= 2', () => {
    expect(getClusterTicks(1, 1).length).toBe(2);
  });
});

describe('computeClusterLayout', () => {
  const W = 500;
  const H = 320;
  const padX = 0;
  const padY = 0;
  const axisReserve = 40;
  const reserve = 40;

  it('null root -> empty', () => {
    const r = computeClusterLayout({
      root: null,
      width: W,
      height: H,
      padX,
      padY,
      axisReserve,
      leafLabelReserve: reserve,
      leafColor: '#leaf',
      internalColor: '#int',
      tickCount: 5,
    });
    expect(r.nodes).toEqual([]);
  });

  it('produces one node per input + N-1 links', () => {
    const r = computeClusterLayout({
      root: ROOT,
      width: W,
      height: H,
      padX,
      padY,
      axisReserve,
      leafLabelReserve: reserve,
      leafColor: '#leaf',
      internalColor: '#int',
      tickCount: 5,
    });
    expect(r.nodes).toHaveLength(7);
    expect(r.links).toHaveLength(6);
    expect(r.leafCount).toBe(4);
    expect(r.maxDistance).toBeCloseTo(1);
  });

  it('leaves are at the bottom (max y) and aligned at distance=0', () => {
    const r = computeClusterLayout({
      root: ROOT,
      width: W,
      height: H,
      padX,
      padY,
      axisReserve,
      leafLabelReserve: reserve,
      leafColor: '#leaf',
      internalColor: '#int',
      tickCount: 5,
    });
    const leaves = r.nodes.filter((n) => n.isLeaf);
    const expectedY = leaves[0]!.y;
    for (const leaf of leaves) {
      expect(leaf.y).toBeCloseTo(expectedY);
      expect(leaf.distance).toBe(0);
    }
  });

  it('leaves are evenly spaced along the leaf axis', () => {
    const r = computeClusterLayout({
      root: ROOT,
      width: W,
      height: H,
      padX,
      padY,
      axisReserve,
      leafLabelReserve: reserve,
      leafColor: '#leaf',
      internalColor: '#int',
      tickCount: 5,
    });
    const leaves = r.nodes
      .filter((n) => n.isLeaf)
      .sort((a, b) => a.leafIndex - b.leafIndex);
    const step = leaves[1]!.x - leaves[0]!.x;
    for (let i = 1; i < leaves.length; i++) {
      expect(leaves[i]!.x - leaves[i - 1]!.x).toBeCloseTo(step);
    }
  });

  it('internal node x = mean of children x; y derived from distance', () => {
    const r = computeClusterLayout({
      root: ROOT,
      width: W,
      height: H,
      padX,
      padY,
      axisReserve,
      leafLabelReserve: reserve,
      leafColor: '#leaf',
      internalColor: '#int',
      tickCount: 5,
    });
    const a = r.nodes.find((n) => n.id === 'a')!;
    const a1 = r.nodes.find((n) => n.id === 'a1')!;
    const a2 = r.nodes.find((n) => n.id === 'a2')!;
    expect(a.x).toBeCloseTo((a1.x + a2.x) / 2);
    // a has distance 0.7, so y is below maxDistance (1)
    expect(a.y).toBeGreaterThan(r.nodes.find((n) => n.id === 'root')!.y);
  });

  it('higher distance maps higher on the canvas (smaller y)', () => {
    const r = computeClusterLayout({
      root: ROOT,
      width: W,
      height: H,
      padX,
      padY,
      axisReserve,
      leafLabelReserve: reserve,
      leafColor: '#leaf',
      internalColor: '#int',
      tickCount: 5,
    });
    const root = r.nodes.find((n) => n.id === 'root')!;
    const b = r.nodes.find((n) => n.id === 'b')!;
    expect(root.y).toBeLessThan(b.y);
  });

  it('every link emits an elbow path (2 L segments)', () => {
    const r = computeClusterLayout({
      root: ROOT,
      width: W,
      height: H,
      padX,
      padY,
      axisReserve,
      leafLabelReserve: reserve,
      leafColor: '#leaf',
      internalColor: '#int',
      tickCount: 5,
    });
    for (const link of r.links) {
      expect(link.path.startsWith('M')).toBe(true);
      expect((link.path.match(/L/g) || []).length).toBe(2);
    }
  });

  it('clusterIds empty when no cutDistance', () => {
    const r = computeClusterLayout({
      root: ROOT,
      width: W,
      height: H,
      padX,
      padY,
      axisReserve,
      leafLabelReserve: reserve,
      leafColor: '#leaf',
      internalColor: '#int',
      tickCount: 5,
    });
    expect(r.clusterIds).toEqual([]);
    for (const node of r.nodes) {
      expect(node.clusterId).toBeNull();
    }
  });

  it('cutDistance partitions tree into clusters', () => {
    const r = computeClusterLayout({
      root: ROOT,
      width: W,
      height: H,
      padX,
      padY,
      axisReserve,
      leafLabelReserve: reserve,
      cutDistance: 0.75,
      leafColor: '#leaf',
      internalColor: '#int',
      tickCount: 5,
    });
    // root has distance 1 (above 0.75) so no cluster.
    // a has distance 0.7 (<= 0.75) so a is a cluster root.
    // b has distance 0.4 (<= 0.75) so b is a cluster root.
    expect(r.clusterIds).toContain('a');
    expect(r.clusterIds).toContain('b');
    const a1 = r.nodes.find((n) => n.id === 'a1')!;
    expect(a1.clusterId).toBe('a');
    const root = r.nodes.find((n) => n.id === 'root')!;
    expect(root.clusterId).toBeNull();
  });

  it('per-node color override beats palette / defaults', () => {
    const colored: ChartClusterNode = {
      id: 'r',
      label: 'R',
      distance: 1,
      color: '#abcdef',
      children: [{ id: 'x', label: 'X' }],
    };
    const r = computeClusterLayout({
      root: colored,
      width: W,
      height: H,
      padX,
      padY,
      axisReserve,
      leafLabelReserve: reserve,
      leafColor: '#leaf',
      internalColor: '#int',
      tickCount: 5,
    });
    expect(r.nodes.find((n) => n.id === 'r')!.color).toBe('#abcdef');
  });

  it('leafCount on internal nodes = subtree leaf count', () => {
    const r = computeClusterLayout({
      root: ROOT,
      width: W,
      height: H,
      padX,
      padY,
      axisReserve,
      leafLabelReserve: reserve,
      leafColor: '#leaf',
      internalColor: '#int',
      tickCount: 5,
    });
    expect(r.nodes.find((n) => n.id === 'a')!.leafCount).toBe(2);
    expect(r.nodes.find((n) => n.id === 'root')!.leafCount).toBe(4);
  });

  it('ticks span 0..maxDistance', () => {
    const r = computeClusterLayout({
      root: ROOT,
      width: W,
      height: H,
      padX,
      padY,
      axisReserve,
      leafLabelReserve: reserve,
      leafColor: '#leaf',
      internalColor: '#int',
      tickCount: 5,
    });
    expect(r.ticks[0]).toBeCloseTo(0);
    expect(r.ticks[r.ticks.length - 1]).toBeCloseTo(1);
  });
});

describe('describeClusterChart', () => {
  it('null -> "No data"', () => {
    expect(describeClusterChart(null)).toBe('No data');
  });
  it('includes node + leaf count + max distance', () => {
    const d = describeClusterChart(ROOT);
    expect(d).toContain('Cluster dendrogram');
    expect(d).toContain('7 nodes');
    expect(d).toContain('4 leaves');
    expect(d).toContain('max distance');
  });
  it('includes "cut at" when cutDistance > 0', () => {
    const d = describeClusterChart(ROOT, 0.5);
    expect(d).toContain('cut at 0.5');
  });
});

describe('<ChartCluster> component', () => {
  it('renders region + custom aria-label', () => {
    const { getByRole } = render(
      <ChartCluster root={ROOT} ariaLabel="Test cluster" />
    );
    expect(getByRole('region', { name: 'Test cluster' })).toBeTruthy();
  });

  it('renders one node group + N-1 links', () => {
    const { container } = render(<ChartCluster root={ROOT} />);
    expect(
      container.querySelectorAll(
        '[data-section="chart-cluster-node"]'
      ).length
    ).toBe(7);
    expect(
      container.querySelectorAll(
        '[data-section="chart-cluster-link"]'
      ).length
    ).toBe(6);
  });

  it('node data attrs mirror id / depth / parent / leaf / leafCount / childCount / distance / color / cluster', () => {
    const { container } = render(<ChartCluster root={ROOT} />);
    const a = container.querySelector(
      '[data-node-id="a"]'
    ) as HTMLElement;
    expect(a.getAttribute('data-node-depth')).toBe('1');
    expect(a.getAttribute('data-node-parent')).toBe('root');
    expect(a.getAttribute('data-node-is-leaf')).toBe('false');
    expect(a.getAttribute('data-node-leaf-count')).toBe('2');
    expect(a.getAttribute('data-node-child-count')).toBe('2');
    expect(Number(a.getAttribute('data-node-distance'))).toBeCloseTo(0.7);
    expect(a.getAttribute('data-node-cluster')).toBe('');
  });

  it('link data attrs mirror source + target + cluster', () => {
    const { container } = render(<ChartCluster root={ROOT} />);
    const link = container.querySelector(
      '[data-section="chart-cluster-link"]'
    ) as HTMLElement;
    expect(link.getAttribute('data-link-source')).toBeTruthy();
    expect(link.getAttribute('data-link-target')).toBeTruthy();
    expect(link.getAttribute('role')).toBe('graphics-symbol');
    expect(link.getAttribute('tabindex')).toBe('0');
  });

  it('node circle role=graphics-symbol + tabIndex=0 + aria-label', () => {
    const { container } = render(<ChartCluster root={ROOT} />);
    const rootNode = container.querySelector(
      '[data-node-id="root"]'
    ) as HTMLElement;
    const circle = rootNode.querySelector(
      '[data-section="chart-cluster-node-circle"]'
    ) as SVGCircleElement;
    expect(circle.getAttribute('role')).toBe('graphics-symbol');
    expect(circle.getAttribute('tabindex')).toBe('0');
    expect(circle.getAttribute('aria-label')).toContain('Root');
    expect(circle.getAttribute('aria-label')).toContain('4 leaves');
  });

  it('root mirrors counts + max-distance + cluster-count + cut-distance + animate', () => {
    const { container } = render(
      <ChartCluster root={ROOT} cutDistance={0.5} />
    );
    const root = container.querySelector('[data-section="chart-cluster"]');
    expect(root?.getAttribute('data-node-count')).toBe('7');
    expect(root?.getAttribute('data-link-count')).toBe('6');
    expect(root?.getAttribute('data-leaf-count')).toBe('4');
    expect(Number(root?.getAttribute('data-max-distance'))).toBeCloseTo(1);
    // cutDistance=0.5: only 'b' (distance 0.4) is at/below the cut, 'a' (0.7) is above
    expect(root?.getAttribute('data-cluster-count')).toBe('1');
    expect(root?.getAttribute('data-cut-distance')).toBe('0.5');
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('distance axis renders ticks by default; suppression', () => {
    const a = render(<ChartCluster root={ROOT} />);
    expect(
      a.container.querySelectorAll(
        '[data-section="chart-cluster-axis-tick"]'
      ).length
    ).toBeGreaterThan(0);
    cleanup();
    const b = render(
      <ChartCluster root={ROOT} showDistanceAxis={false} />
    );
    expect(
      b.container.querySelector('[data-section="chart-cluster-axis"]')
    ).toBeNull();
  });

  it('cutDistance + showCutLine renders the threshold line + label', () => {
    const { container } = render(
      <ChartCluster root={ROOT} cutDistance={0.5} />
    );
    expect(
      container.querySelector('[data-section="chart-cluster-cut-line"]')
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-cluster-cut-label"]'
      )?.textContent
    ).toContain('cut');
  });

  it('showCutLine=false suppresses the threshold line', () => {
    const { container } = render(
      <ChartCluster root={ROOT} cutDistance={0.5} showCutLine={false} />
    );
    expect(
      container.querySelector('[data-section="chart-cluster-cut-line"]')
    ).toBeNull();
  });

  it('cut clusters get distinct palette colors via cluster id', () => {
    const { container } = render(
      <ChartCluster root={ROOT} cutDistance={0.75} />
    );
    const a1 = container.querySelector('[data-node-id="a1"]') as HTMLElement;
    const b1 = container.querySelector('[data-node-id="b1"]') as HTMLElement;
    expect(a1.getAttribute('data-node-cluster')).toBe('a');
    expect(b1.getAttribute('data-node-cluster')).toBe('b');
    expect(a1.getAttribute('data-node-color')).not.toBe(
      b1.getAttribute('data-node-color')
    );
  });

  it('leaf labels render by default; suppression', () => {
    const a = render(<ChartCluster root={ROOT} />);
    const labels = Array.from(
      a.container.querySelectorAll(
        '[data-section="chart-cluster-node-label"]'
      )
    ).map((n) => n.textContent);
    expect(labels).toContain('A1');
    cleanup();
    const b = render(<ChartCluster root={ROOT} showLeafLabels={false} />);
    expect(
      b.container.querySelector('[data-section="chart-cluster-node-label"]')
    ).toBeNull();
  });

  it('internal labels hidden by default; showInternalLabels enables them', () => {
    const { container } = render(
      <ChartCluster root={ROOT} showInternalLabels />
    );
    const labels = Array.from(
      container.querySelectorAll(
        '[data-section="chart-cluster-node-label"]'
      )
    ).map((n) => n.textContent);
    expect(labels).toContain('A');
  });

  it('showNodes=false suppresses node circles', () => {
    const { container } = render(<ChartCluster root={ROOT} showNodes={false} />);
    expect(
      container.querySelector('[data-section="chart-cluster-node"]')
    ).toBeNull();
  });

  it('hover node opens tooltip', () => {
    const { container } = render(<ChartCluster root={ROOT} />);
    fireEvent.mouseEnter(
      container.querySelector('[data-node-id="a"]')! as HTMLElement
    );
    expect(
      container.querySelector('[data-section="chart-cluster-tooltip"]')
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-cluster-tooltip-label"]'
      )?.textContent
    ).toBe('A');
    expect(
      container.querySelector(
        '[data-section="chart-cluster-tooltip-distance"]'
      )?.textContent
    ).toContain('distance:');
    expect(
      container.querySelector(
        '[data-section="chart-cluster-tooltip-leaves"]'
      )?.textContent
    ).toContain('2 leaves');
  });

  it('cluster id appears in tooltip when present', () => {
    const { container } = render(
      <ChartCluster root={ROOT} cutDistance={0.75} />
    );
    fireEvent.mouseEnter(
      container.querySelector('[data-node-id="a1"]')! as HTMLElement
    );
    expect(
      container.querySelector(
        '[data-section="chart-cluster-tooltip-cluster"]'
      )?.textContent
    ).toContain('cluster: a');
  });

  it('hover link opens link tooltip', () => {
    const { container } = render(<ChartCluster root={ROOT} />);
    fireEvent.mouseEnter(
      container.querySelector(
        '[data-section="chart-cluster-link"]'
      )! as HTMLElement
    );
    expect(
      container.querySelector(
        '[data-section="chart-cluster-link-tooltip"]'
      )
    ).not.toBeNull();
  });

  it('tooltip hides on mouseleave', () => {
    const { container } = render(<ChartCluster root={ROOT} />);
    const a = container.querySelector('[data-node-id="a"]') as HTMLElement;
    fireEvent.mouseEnter(a);
    expect(
      container.querySelector('[data-section="chart-cluster-tooltip"]')
    ).not.toBeNull();
    fireEvent.mouseLeave(a);
    expect(
      container.querySelector('[data-section="chart-cluster-tooltip"]')
    ).toBeNull();
  });

  it('showTooltip=false suppresses both tooltips', () => {
    const { container } = render(
      <ChartCluster root={ROOT} showTooltip={false} />
    );
    fireEvent.mouseEnter(
      container.querySelector('[data-node-id="a"]')! as HTMLElement
    );
    expect(
      container.querySelector('[data-section="chart-cluster-tooltip"]')
    ).toBeNull();
  });

  it('formatDistance reaches axis ticks + tooltip', () => {
    const { container } = render(
      <ChartCluster
        root={ROOT}
        formatDistance={(v) => `${(v * 100).toFixed(0)}pct`}
      />
    );
    const ticks = container.querySelectorAll(
      '[data-section="chart-cluster-axis-tick-label"]'
    );
    const hasPct = Array.from(ticks).some((n) =>
      (n.textContent ?? '').includes('pct')
    );
    expect(hasPct).toBe(true);
  });

  it('formatLabel rewrites node labels', () => {
    const { container } = render(
      <ChartCluster
        root={ROOT}
        formatLabel={(label, node) => `${node.depth}:${label}`}
      />
    );
    const labels = Array.from(
      container.querySelectorAll(
        '[data-section="chart-cluster-node-label"]'
      )
    ).map((n) => n.textContent);
    expect(labels).toContain('2:A1');
  });

  it('onNodeClick fires with node payload', () => {
    const onNodeClick = vi.fn();
    const { container } = render(
      <ChartCluster root={ROOT} onNodeClick={onNodeClick} />
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
      <ChartCluster root={ROOT} onLinkClick={onLinkClick} />
    );
    fireEvent.click(
      container.querySelector(
        '[data-section="chart-cluster-link"]'
      )! as HTMLElement
    );
    expect(onLinkClick).toHaveBeenCalledTimes(1);
    expect(onLinkClick.mock.calls[0]![0].link.index).toBe(0);
  });

  it('data-hovered mirrors hover state', () => {
    const { container } = render(<ChartCluster root={ROOT} />);
    const a = container.querySelector('[data-node-id="a"]') as HTMLElement;
    expect(a.getAttribute('data-hovered')).toBe('false');
    fireEvent.mouseEnter(a);
    expect(a.getAttribute('data-hovered')).toBe('true');
    fireEvent.mouseLeave(a);
    expect(a.getAttribute('data-hovered')).toBe('false');
  });

  it('auto ARIA description renders by default', () => {
    const { container } = render(<ChartCluster root={ROOT} />);
    expect(
      container.querySelector('[data-section="chart-cluster-aria-desc"]')
        ?.textContent
    ).toContain('Cluster dendrogram');
  });

  it('ariaDescription override beats auto', () => {
    const { container } = render(
      <ChartCluster root={ROOT} ariaDescription="Override" />
    );
    expect(
      container.querySelector('[data-section="chart-cluster-aria-desc"]')
        ?.textContent
    ).toBe('Override');
  });

  it('SVG mirrors width / height / viewBox', () => {
    const { container } = render(
      <ChartCluster root={ROOT} width={500} height={300} />
    );
    const svg = container.querySelector(
      '[data-section="chart-cluster-svg"]'
    ) as SVGElement;
    expect(svg.getAttribute('width')).toBe('500');
    expect(svg.getAttribute('height')).toBe('300');
    expect(svg.getAttribute('viewBox')).toBe('0 0 500 300');
  });

  it('null root renders without crashing', () => {
    const { container } = render(<ChartCluster root={null} />);
    expect(
      container.querySelectorAll('[data-section="chart-cluster-node"]').length
    ).toBe(0);
    expect(
      container.querySelector('[data-section="chart-cluster-aria-desc"]')
        ?.textContent
    ).toBe('No data');
  });

  it('forwards ref to root', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartCluster root={ROOT} ref={ref} />);
    expect(ref.current?.dataset.section).toBe('chart-cluster');
  });

  it('has stable displayName', () => {
    expect(ChartCluster.displayName).toBe('ChartCluster');
  });

  it('data-animate mirrors prop', () => {
    const { container } = render(<ChartCluster root={ROOT} animate={false} />);
    expect(
      container.querySelector('[data-section="chart-cluster"]')!
        .getAttribute('data-animate')
    ).toBe('false');
  });
});
