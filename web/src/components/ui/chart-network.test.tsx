import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartNetwork,
  DEFAULT_CHART_NETWORK_DAMPING,
  DEFAULT_CHART_NETWORK_EDGE_COLOR,
  DEFAULT_CHART_NETWORK_HEIGHT,
  DEFAULT_CHART_NETWORK_ITERATIONS,
  DEFAULT_CHART_NETWORK_NODE_COLOR,
  DEFAULT_CHART_NETWORK_NODE_RADIUS,
  DEFAULT_CHART_NETWORK_WIDTH,
  computeNodeDegree,
  describeNetworkChart,
  findNodeAtPoint,
  getNetworkBounds,
  getNodeRadius,
  runForceLayout,
  seedNetworkPositions,
  stepForceSimulation,
} from './chart-network';
import type {
  ChartNetworkEdge,
  ChartNetworkNode,
  NetworkSimulationNode,
  NetworkSimulationParams,
} from './chart-network';

const nodes: ChartNetworkNode[] = [
  { id: 'a', label: 'A' },
  { id: 'b', label: 'B', group: 'g1' },
  { id: 'c', label: 'C', group: 'g1', weight: 4 },
  { id: 'd', label: 'D' },
];

const edges: ChartNetworkEdge[] = [
  { source: 'a', target: 'b', weight: 2 },
  { source: 'a', target: 'c' },
  { source: 'b', target: 'd', weight: 5 },
  { source: 'c', target: 'd', weight: 1 },
];

const params: NetworkSimulationParams = {
  width: 200,
  height: 200,
  repulsion: 100,
  springLength: 30,
  springStrength: 0.05,
  gravity: 0.01,
  damping: 0.85,
};

describe('chart-network pure helpers', () => {
  describe('seedNetworkPositions', () => {
    it('returns one entry per node', () => {
      const seeds = seedNetworkPositions(nodes, 200, 200);
      expect(seeds.length).toBe(nodes.length);
    });
    it('preserves explicit (x, y) on nodes', () => {
      const withCoords: ChartNetworkNode[] = [
        { id: 'a', label: 'A', x: 50, y: 60 },
        { id: 'b', label: 'B' },
      ];
      const seeds = seedNetworkPositions(withCoords, 200, 200);
      expect(seeds[0]?.x).toBe(50);
      expect(seeds[0]?.y).toBe(60);
    });
    it('mirrors `fixed` flag', () => {
      const fixed: ChartNetworkNode[] = [
        { id: 'a', label: 'A', fixed: true },
        { id: 'b', label: 'B' },
      ];
      const seeds = seedNetworkPositions(fixed, 100, 100);
      expect(seeds[0]?.fixed).toBe(true);
      expect(seeds[1]?.fixed).toBe(false);
    });
    it('places nodes near the canvas center', () => {
      const seeds = seedNetworkPositions(nodes, 100, 100);
      for (const s of seeds) {
        expect(s.x).toBeGreaterThanOrEqual(0);
        expect(s.x).toBeLessThanOrEqual(100);
        expect(s.y).toBeGreaterThanOrEqual(0);
        expect(s.y).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('stepForceSimulation', () => {
    it('moves free nodes in a single step', () => {
      const seeds = seedNetworkPositions(nodes, 200, 200);
      const next = stepForceSimulation(seeds, edges, params);
      expect(next.length).toBe(seeds.length);
      // At least one node should have moved
      const moved = next.some(
        (n, i) =>
          Math.abs(n.x - seeds[i]!.x) > 1e-6 ||
          Math.abs(n.y - seeds[i]!.y) > 1e-6,
      );
      expect(moved).toBe(true);
    });
    it('keeps pinned nodes stationary', () => {
      const seeds: NetworkSimulationNode[] = [
        {
          id: 'a',
          x: 50,
          y: 50,
          vx: 0,
          vy: 0,
          fixed: true,
        },
        {
          id: 'b',
          x: 60,
          y: 60,
          vx: 0,
          vy: 0,
          fixed: false,
        },
      ];
      const next = stepForceSimulation(seeds, edges, params);
      expect(next[0]?.x).toBe(50);
      expect(next[0]?.y).toBe(50);
      expect(next[0]?.vx).toBe(0);
      expect(next[0]?.vy).toBe(0);
    });
    it('does not mutate the input array', () => {
      const seeds = seedNetworkPositions(nodes, 200, 200);
      const copy = seeds.map((s) => ({ ...s }));
      stepForceSimulation(seeds, edges, params);
      expect(seeds).toEqual(copy);
    });
    it('jitters identical positions to avoid NaN', () => {
      const seeds: NetworkSimulationNode[] = [
        {
          id: 'a',
          x: 50,
          y: 50,
          vx: 0,
          vy: 0,
          fixed: false,
        },
        {
          id: 'b',
          x: 50,
          y: 50,
          vx: 0,
          vy: 0,
          fixed: false,
        },
      ];
      const next = stepForceSimulation(seeds, [], params);
      expect(Number.isFinite(next[0]!.x)).toBe(true);
      expect(Number.isFinite(next[0]!.y)).toBe(true);
    });
  });

  describe('runForceLayout', () => {
    it('returns positions for every node', () => {
      const out = runForceLayout(nodes, edges, params, 20);
      expect(out.length).toBe(nodes.length);
    });
    it('is deterministic for the same inputs', () => {
      const a = runForceLayout(nodes, edges, params, 20);
      const b = runForceLayout(nodes, edges, params, 20);
      for (let i = 0; i < a.length; i += 1) {
        expect(a[i]?.x).toBeCloseTo(b[i]?.x ?? 0, 6);
        expect(a[i]?.y).toBeCloseTo(b[i]?.y ?? 0, 6);
      }
    });
    it('returns initial seed for iterations=0', () => {
      const out = runForceLayout(nodes, edges, params, 0);
      const seed = seedNetworkPositions(
        nodes,
        params.width,
        params.height,
      );
      for (let i = 0; i < out.length; i += 1) {
        expect(out[i]?.x).toBe(seed[i]?.x);
        expect(out[i]?.y).toBe(seed[i]?.y);
      }
    });
  });

  describe('getNetworkBounds', () => {
    it('returns min/max across nodes', () => {
      const b = getNetworkBounds([
        { x: 10, y: 20 },
        { x: 100, y: 50 },
        { x: -5, y: 200 },
      ]);
      expect(b.minX).toBe(-5);
      expect(b.minY).toBe(20);
      expect(b.maxX).toBe(100);
      expect(b.maxY).toBe(200);
    });
    it('falls back for empty input', () => {
      expect(getNetworkBounds([])).toEqual({
        minX: 0,
        minY: 0,
        maxX: 1,
        maxY: 1,
      });
    });
    it('ignores non-finite coordinates', () => {
      const b = getNetworkBounds([
        { x: 10, y: 10 },
        { x: Number.NaN, y: Number.NaN },
      ]);
      expect(b.minX).toBe(10);
      expect(b.maxX).toBe(10);
    });
  });

  describe('computeNodeDegree', () => {
    it('counts edges incident on a node', () => {
      expect(computeNodeDegree('a', edges)).toBe(2);
      expect(computeNodeDegree('b', edges)).toBe(2);
      expect(computeNodeDegree('d', edges)).toBe(2);
    });
    it('returns 0 for isolated node', () => {
      expect(computeNodeDegree('e', edges)).toBe(0);
    });
  });

  describe('findNodeAtPoint', () => {
    const pts = [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 50, y: 50 },
      { id: 'c', x: 100, y: 100 },
    ];
    it('returns the closest node within radius', () => {
      expect(findNodeAtPoint(pts, 52, 50, 10)).toBe('b');
    });
    it('returns null when nothing is close enough', () => {
      expect(findNodeAtPoint(pts, 500, 500, 5)).toBeNull();
    });
    it('returns the centermost id at radius=0', () => {
      expect(findNodeAtPoint(pts, 0, 0, 0)).toBe('a');
    });
  });

  describe('getNodeRadius', () => {
    it('scales by sqrt(weight)', () => {
      expect(
        getNodeRadius(
          { id: 'x', label: 'x', weight: 4 },
          10,
        ),
      ).toBeCloseTo(20);
    });
    it('falls back to default for missing / invalid weight', () => {
      expect(
        getNodeRadius({ id: 'x', label: 'x' }, 8),
      ).toBe(8);
      expect(
        getNodeRadius(
          { id: 'x', label: 'x', weight: Number.NaN },
          8,
        ),
      ).toBe(8);
      expect(
        getNodeRadius(
          { id: 'x', label: 'x', weight: -3 },
          8,
        ),
      ).toBe(8);
    });
    it('floor at 2 px', () => {
      expect(
        getNodeRadius(
          { id: 'x', label: 'x', weight: 0.01 },
          8,
        ),
      ).toBe(2);
    });
  });

  describe('describeNetworkChart', () => {
    it('returns "No data" for empty nodes', () => {
      expect(describeNetworkChart([], [])).toBe('No data');
    });
    it('summarises top-degree nodes', () => {
      const text = describeNetworkChart(nodes, edges);
      expect(text).toContain('4 nodes');
      expect(text).toContain('4 edges');
      expect(text).toMatch(/degree \d/);
    });
    it('honours formatValue', () => {
      const text = describeNetworkChart(
        nodes,
        edges,
        (v) => `${v}d`,
      );
      expect(text).toContain('2d');
    });
  });

  it('exports default constants', () => {
    expect(DEFAULT_CHART_NETWORK_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_NETWORK_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_NETWORK_ITERATIONS).toBeGreaterThan(0);
    expect(DEFAULT_CHART_NETWORK_DAMPING).toBeGreaterThan(0);
    expect(DEFAULT_CHART_NETWORK_NODE_RADIUS).toBeGreaterThan(0);
    expect(DEFAULT_CHART_NETWORK_NODE_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_NETWORK_EDGE_COLOR).toMatch(/^#/);
  });
});

describe('<ChartNetwork />', () => {
  it('renders a region with role + aria-label', () => {
    render(<ChartNetwork nodes={nodes} edges={edges} />);
    const root = screen.getByRole('region', {
      name: 'Network graph',
    });
    expect(root).toBeInTheDocument();
    expect(root).toHaveAttribute('data-section', 'chart-network');
    expect(root).toHaveAttribute('data-node-count', '4');
    expect(root).toHaveAttribute('data-edge-count', '4');
  });

  it('renders a custom aria-label', () => {
    render(
      <ChartNetwork
        nodes={nodes}
        edges={edges}
        ariaLabel="Service mesh"
      />,
    );
    expect(
      screen.getByRole('region', { name: 'Service mesh' }),
    ).toBeInTheDocument();
  });

  it('renders one node group + one edge group', () => {
    const { container } = render(
      <ChartNetwork nodes={nodes} edges={edges} />,
    );
    const nGroups = container.querySelectorAll(
      '[data-section="chart-network-node"]',
    );
    const eGroups = container.querySelectorAll(
      '[data-section="chart-network-edge"]',
    );
    expect(nGroups.length).toBe(nodes.length);
    expect(eGroups.length).toBe(edges.length);
  });

  it('mirrors node degree on the group', () => {
    const { container } = render(
      <ChartNetwork nodes={nodes} edges={edges} />,
    );
    const aNode = container.querySelector(
      '[data-section="chart-network-node"][data-node-id="a"]',
    );
    expect(aNode?.getAttribute('data-node-degree')).toBe('2');
  });

  it('mirrors node group attribute', () => {
    const { container } = render(
      <ChartNetwork nodes={nodes} edges={edges} />,
    );
    const bNode = container.querySelector(
      '[data-section="chart-network-node"][data-node-id="b"]',
    );
    expect(bNode?.getAttribute('data-node-group')).toBe('g1');
  });

  it('honours custom node color', () => {
    const colored: ChartNetworkNode[] = nodes.map((n, i) =>
      i === 0 ? { ...n, color: '#ff00aa' } : n,
    );
    const { container } = render(
      <ChartNetwork nodes={colored} edges={edges} />,
    );
    const aGroup = container.querySelector(
      '[data-section="chart-network-node"][data-node-id="a"]',
    );
    expect(aGroup?.getAttribute('data-node-color')).toBe(
      '#ff00aa',
    );
  });

  it('honours custom edge color', () => {
    const colored: ChartNetworkEdge[] = edges.map((e, i) =>
      i === 0 ? { ...e, color: '#00ffaa' } : e,
    );
    const { container } = render(
      <ChartNetwork nodes={nodes} edges={colored} />,
    );
    const edge = container.querySelector(
      '[data-section="chart-network-edge-line"]',
    );
    expect(edge?.getAttribute('stroke')).toBe('#00ffaa');
  });

  it('mirrors edge weight on the group', () => {
    const { container } = render(
      <ChartNetwork nodes={nodes} edges={edges} />,
    );
    const group = container.querySelector(
      '[data-section="chart-network-edge"][data-edge-index="2"]',
    );
    expect(group?.getAttribute('data-edge-weight')).toBe('5');
  });

  it('renders labels by default', () => {
    const { container } = render(
      <ChartNetwork nodes={nodes} edges={edges} />,
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-network-label"]',
    );
    expect(labels.length).toBe(nodes.length);
  });

  it('suppresses labels when showLabels=false', () => {
    const { container } = render(
      <ChartNetwork
        nodes={nodes}
        edges={edges}
        showLabels={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-network-label"]',
      ),
    ).toBeNull();
  });

  it('renders zoom controls by default', () => {
    const { container } = render(
      <ChartNetwork nodes={nodes} edges={edges} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-network-zoom-in"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-network-zoom-out"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-network-zoom-reset"]',
      ),
    ).not.toBeNull();
  });

  it('suppresses zoom controls when showZoomControls=false', () => {
    const { container } = render(
      <ChartNetwork
        nodes={nodes}
        edges={edges}
        showZoomControls={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-network-zoom-controls"]',
      ),
    ).toBeNull();
  });

  it('zoom in changes data-zoom', () => {
    const { container } = render(
      <ChartNetwork nodes={nodes} edges={edges} />,
    );
    const root = container.querySelector(
      '[data-section="chart-network"]',
    );
    const initial = parseFloat(
      root?.getAttribute('data-zoom') ?? '1',
    );
    const zoomIn = container.querySelector(
      '[data-section="chart-network-zoom-in"]',
    );
    fireEvent.click(zoomIn!);
    const after = parseFloat(
      root?.getAttribute('data-zoom') ?? '1',
    );
    expect(after).toBeGreaterThan(initial);
  });

  it('zoom out changes data-zoom', () => {
    const { container } = render(
      <ChartNetwork nodes={nodes} edges={edges} />,
    );
    const root = container.querySelector(
      '[data-section="chart-network"]',
    );
    const zoomOut = container.querySelector(
      '[data-section="chart-network-zoom-out"]',
    );
    fireEvent.click(zoomOut!);
    const after = parseFloat(
      root?.getAttribute('data-zoom') ?? '1',
    );
    expect(after).toBeLessThan(1);
  });

  it('reset view restores zoom to 1', () => {
    const { container } = render(
      <ChartNetwork nodes={nodes} edges={edges} />,
    );
    const root = container.querySelector(
      '[data-section="chart-network"]',
    );
    const zoomIn = container.querySelector(
      '[data-section="chart-network-zoom-in"]',
    );
    fireEvent.click(zoomIn!);
    fireEvent.click(zoomIn!);
    const reset = container.querySelector(
      '[data-section="chart-network-zoom-reset"]',
    );
    fireEvent.click(reset!);
    expect(root?.getAttribute('data-zoom')).toBe('1.000');
  });

  it('shows node tooltip on hover', () => {
    const { container } = render(
      <ChartNetwork nodes={nodes} edges={edges} />,
    );
    const node = container.querySelector(
      '[data-section="chart-network-node-circle"][data-node-id="b"]',
    );
    fireEvent.mouseEnter(node!);
    const tip = container.querySelector(
      '[data-section="chart-network-node-tooltip"]',
    );
    expect(tip).not.toBeNull();
    const label = container.querySelector(
      '[data-section="chart-network-tooltip-label"]',
    );
    expect(label?.textContent).toBe('B');
  });

  it('shows degree in node tooltip', () => {
    const { container } = render(
      <ChartNetwork nodes={nodes} edges={edges} />,
    );
    const node = container.querySelector(
      '[data-section="chart-network-node-circle"][data-node-id="a"]',
    );
    fireEvent.mouseEnter(node!);
    const degree = container.querySelector(
      '[data-section="chart-network-tooltip-degree"]',
    );
    expect(degree?.textContent).toContain('2');
  });

  it('shows group in node tooltip when present', () => {
    const { container } = render(
      <ChartNetwork nodes={nodes} edges={edges} />,
    );
    const node = container.querySelector(
      '[data-section="chart-network-node-circle"][data-node-id="b"]',
    );
    fireEvent.mouseEnter(node!);
    const group = container.querySelector(
      '[data-section="chart-network-tooltip-group"]',
    );
    expect(group?.textContent).toContain('g1');
  });

  it('omits group row when node has no group', () => {
    const { container } = render(
      <ChartNetwork nodes={nodes} edges={edges} />,
    );
    const node = container.querySelector(
      '[data-section="chart-network-node-circle"][data-node-id="a"]',
    );
    fireEvent.mouseEnter(node!);
    expect(
      container.querySelector(
        '[data-section="chart-network-tooltip-group"]',
      ),
    ).toBeNull();
  });

  it('hides node tooltip on mouse-leave', () => {
    const { container } = render(
      <ChartNetwork nodes={nodes} edges={edges} />,
    );
    const node = container.querySelector(
      '[data-section="chart-network-node-circle"]',
    );
    fireEvent.mouseEnter(node!);
    fireEvent.mouseLeave(node!);
    expect(
      container.querySelector(
        '[data-section="chart-network-node-tooltip"]',
      ),
    ).toBeNull();
  });

  it('suppresses tooltip when showTooltip=false', () => {
    const { container } = render(
      <ChartNetwork
        nodes={nodes}
        edges={edges}
        showTooltip={false}
      />,
    );
    const node = container.querySelector(
      '[data-section="chart-network-node-circle"]',
    );
    fireEvent.mouseEnter(node!);
    expect(
      container.querySelector(
        '[data-section="chart-network-node-tooltip"]',
      ),
    ).toBeNull();
  });

  it('invokes onNodeClick with node + degree', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ChartNetwork
        nodes={nodes}
        edges={edges}
        onNodeClick={onClick}
      />,
    );
    const node = container.querySelector(
      '[data-section="chart-network-node-circle"][data-node-id="a"]',
    );
    fireEvent.click(node!);
    expect(onClick).toHaveBeenCalledTimes(1);
    const arg = onClick.mock.calls[0]?.[0];
    expect(arg?.node?.id).toBe('a');
    expect(arg?.degree).toBe(2);
  });

  it('invokes onEdgeClick with edge + source + target', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ChartNetwork
        nodes={nodes}
        edges={edges}
        onEdgeClick={onClick}
      />,
    );
    const edge = container.querySelector(
      '[data-section="chart-network-edge-line"]',
    );
    fireEvent.click(edge!);
    expect(onClick).toHaveBeenCalledTimes(1);
    const arg = onClick.mock.calls[0]?.[0];
    expect(arg?.edge?.source).toBe('a');
    expect(arg?.source?.id).toBe('a');
    expect(arg?.target?.id).toBe('b');
  });

  it('exposes role=graphics-symbol + aria-label per node + edge', () => {
    const { container } = render(
      <ChartNetwork nodes={nodes} edges={edges} />,
    );
    const node = container.querySelector(
      '[data-section="chart-network-node-circle"]',
    );
    expect(node?.getAttribute('role')).toBe('graphics-symbol');
    expect(node?.getAttribute('aria-label')).toContain('A');
    const edge = container.querySelector(
      '[data-section="chart-network-edge-line"]',
    );
    expect(edge?.getAttribute('role')).toBe('graphics-symbol');
    expect(edge?.getAttribute('aria-label')).toContain(
      'a to b',
    );
  });

  it('mirrors animate flag on the root', () => {
    const { container, rerender } = render(
      <ChartNetwork nodes={nodes} edges={edges} />,
    );
    expect(
      container
        .querySelector('[data-section="chart-network"]')
        ?.getAttribute('data-animate'),
    ).toBe('true');
    rerender(
      <ChartNetwork
        nodes={nodes}
        edges={edges}
        animate={false}
      />,
    );
    expect(
      container
        .querySelector('[data-section="chart-network"]')
        ?.getAttribute('data-animate'),
    ).toBe('false');
  });

  it('mirrors size on the svg', () => {
    const { container } = render(
      <ChartNetwork
        nodes={nodes}
        edges={edges}
        width={800}
        height={500}
      />,
    );
    const svg = container.querySelector(
      '[data-section="chart-network-svg"]',
    );
    expect(svg?.getAttribute('width')).toBe('800');
    expect(svg?.getAttribute('height')).toBe('500');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 800 500');
  });

  it('renders auto-generated ARIA description by default', () => {
    const { container } = render(
      <ChartNetwork nodes={nodes} edges={edges} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-network-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Network graph');
    expect(desc?.textContent).toContain('4 nodes');
  });

  it('honours ariaDescription override', () => {
    const { container } = render(
      <ChartNetwork
        nodes={nodes}
        edges={edges}
        ariaDescription="custom"
      />,
    );
    const desc = container.querySelector(
      '[data-section="chart-network-aria-desc"]',
    );
    expect(desc?.textContent).toBe('custom');
  });

  it('handles empty data without crashing', () => {
    const { container } = render(
      <ChartNetwork nodes={[]} edges={[]} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-network"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelectorAll(
        '[data-section="chart-network-node"]',
      ).length,
    ).toBe(0);
  });

  it('mirrors data-fixed when node is pinned', () => {
    const pinned: ChartNetworkNode[] = nodes.map((n) =>
      n.id === 'a' ? { ...n, fixed: true } : n,
    );
    const { container } = render(
      <ChartNetwork nodes={pinned} edges={edges} />,
    );
    const aGroup = container.querySelector(
      '[data-section="chart-network-node"][data-node-id="a"]',
    );
    expect(aGroup?.getAttribute('data-fixed')).toBe('true');
  });

  it('forwards ref to the root region', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartNetwork ref={ref} nodes={nodes} edges={edges} />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-network',
    );
  });

  it('has a stable displayName', () => {
    expect(ChartNetwork.displayName).toBe('ChartNetwork');
  });
});
