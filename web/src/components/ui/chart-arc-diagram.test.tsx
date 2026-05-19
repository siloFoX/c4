import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartArcDiagram,
  DEFAULT_CHART_ARC_DIAGRAM_EDGE_COLOR,
  DEFAULT_CHART_ARC_DIAGRAM_EDGE_OPACITY,
  DEFAULT_CHART_ARC_DIAGRAM_HEIGHT,
  DEFAULT_CHART_ARC_DIAGRAM_NODE_COLOR,
  DEFAULT_CHART_ARC_DIAGRAM_NODE_RADIUS,
  DEFAULT_CHART_ARC_DIAGRAM_PADDING,
  DEFAULT_CHART_ARC_DIAGRAM_WIDTH,
  buildArcDiagramEdgePath,
  computeArcDiagramNodeDegree,
  describeArcDiagram,
  getArcDiagramNodePositions,
  getArcDiagramNodeRadius,
} from './chart-arc-diagram';
import type {
  ChartArcDiagramEdge,
  ChartArcDiagramNode,
} from './chart-arc-diagram';

const nodes: ChartArcDiagramNode[] = [
  { id: 'a', label: 'A' },
  { id: 'b', label: 'B', group: 'g1' },
  { id: 'c', label: 'C', group: 'g1', weight: 4 },
  { id: 'd', label: 'D', color: '#ff00aa' },
];

const edges: ChartArcDiagramEdge[] = [
  { source: 'a', target: 'b', weight: 2 },
  { source: 'a', target: 'c' },
  { source: 'b', target: 'd', weight: 5 },
  { source: 'c', target: 'd', weight: 1 },
];

describe('chart-arc-diagram pure helpers', () => {
  describe('getArcDiagramNodePositions', () => {
    it('returns evenly-spaced positions across innerWidth', () => {
      const positions = getArcDiagramNodePositions(
        nodes,
        300,
        20,
      );
      expect(positions.length).toBe(nodes.length);
      expect(positions[0]).toBe(20);
      expect(positions[positions.length - 1]).toBe(320);
    });
    it('snaps a single node to centre', () => {
      const positions = getArcDiagramNodePositions(
        [{ id: 'x', label: 'X' }],
        100,
        10,
      );
      expect(positions[0]).toBe(60);
    });
    it('returns [] for empty input', () => {
      expect(getArcDiagramNodePositions([], 100, 0)).toEqual([]);
    });
  });

  describe('getArcDiagramNodeRadius', () => {
    it('scales by sqrt(weight)', () => {
      expect(
        getArcDiagramNodeRadius(
          { id: 'x', label: 'x', weight: 4 },
          5,
        ),
      ).toBeCloseTo(10);
    });
    it('falls back to default for missing / invalid weight', () => {
      expect(
        getArcDiagramNodeRadius({ id: 'x', label: 'x' }, 5),
      ).toBe(5);
      expect(
        getArcDiagramNodeRadius(
          { id: 'x', label: 'x', weight: Number.NaN },
          5,
        ),
      ).toBe(5);
      expect(
        getArcDiagramNodeRadius(
          { id: 'x', label: 'x', weight: -3 },
          5,
        ),
      ).toBe(5);
    });
    it('floors at 2 px', () => {
      expect(
        getArcDiagramNodeRadius(
          { id: 'x', label: 'x', weight: 0.01 },
          5,
        ),
      ).toBe(2);
    });
  });

  describe('computeArcDiagramNodeDegree', () => {
    it('counts edges incident on a node', () => {
      expect(computeArcDiagramNodeDegree('a', edges)).toBe(2);
      expect(computeArcDiagramNodeDegree('b', edges)).toBe(2);
      expect(computeArcDiagramNodeDegree('c', edges)).toBe(2);
      expect(computeArcDiagramNodeDegree('d', edges)).toBe(2);
    });
    it('returns 0 for isolated node', () => {
      expect(computeArcDiagramNodeDegree('e', edges)).toBe(0);
    });
  });

  describe('buildArcDiagramEdgePath', () => {
    it('returns "" for non-finite coords', () => {
      expect(
        buildArcDiagramEdgePath(Number.NaN, 100, 50, true),
      ).toBe('');
    });
    it('emits a semicircular arc above the baseline', () => {
      const path = buildArcDiagramEdgePath(0, 100, 50, true);
      expect(path).toMatch(/^M /);
      expect(path).toContain('A 50.00 50.00 0 0 1');
      expect(path).toContain('100.00 50.00');
    });
    it('emits a semicircular arc below the baseline', () => {
      const path = buildArcDiagramEdgePath(0, 100, 50, false);
      expect(path).toContain('A 50.00 50.00 0 0 0');
    });
    it('handles x1 > x2 (orders the path left-to-right)', () => {
      const path = buildArcDiagramEdgePath(100, 0, 50, true);
      expect(path).toMatch(/^M 0\.00/);
      expect(path).toContain('100.00 50.00');
    });
    it('emits a small loop for self-edges', () => {
      const path = buildArcDiagramEdgePath(50, 50, 100, true);
      expect(path).toMatch(/^M 50\.00 100\.00/);
      expect(path).toContain('A 4 4');
    });
  });

  describe('describeArcDiagram', () => {
    it('returns "No data" for empty nodes', () => {
      expect(describeArcDiagram([], [])).toBe('No data');
    });
    it('summarises top-degree nodes', () => {
      const text = describeArcDiagram(nodes, edges);
      expect(text).toContain('4 nodes');
      expect(text).toContain('4 edges');
      expect(text).toMatch(/degree \d/);
    });
    it('honours formatValue', () => {
      const text = describeArcDiagram(
        nodes,
        edges,
        (v) => `${v}d`,
      );
      expect(text).toContain('2d');
    });
  });

  it('exports default constants', () => {
    expect(DEFAULT_CHART_ARC_DIAGRAM_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_ARC_DIAGRAM_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_ARC_DIAGRAM_PADDING).toBeGreaterThan(0);
    expect(
      DEFAULT_CHART_ARC_DIAGRAM_NODE_RADIUS,
    ).toBeGreaterThan(0);
    expect(
      DEFAULT_CHART_ARC_DIAGRAM_EDGE_OPACITY,
    ).toBeGreaterThan(0);
    expect(DEFAULT_CHART_ARC_DIAGRAM_NODE_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_ARC_DIAGRAM_EDGE_COLOR).toMatch(/^#/);
  });
});

describe('<ChartArcDiagram />', () => {
  it('renders a region with role + aria-label', () => {
    render(<ChartArcDiagram nodes={nodes} edges={edges} />);
    const root = screen.getByRole('region', {
      name: 'Arc diagram',
    });
    expect(root).toBeInTheDocument();
    expect(root).toHaveAttribute(
      'data-section',
      'chart-arc-diagram',
    );
    expect(root).toHaveAttribute('data-node-count', '4');
    expect(root).toHaveAttribute('data-edge-count', '4');
    expect(root).toHaveAttribute('data-arcs-below', 'false');
  });

  it('renders a custom aria-label', () => {
    render(
      <ChartArcDiagram
        nodes={nodes}
        edges={edges}
        ariaLabel="Network"
      />,
    );
    expect(
      screen.getByRole('region', { name: 'Network' }),
    ).toBeInTheDocument();
  });

  it('renders one node circle + one edge path per pair', () => {
    const { container } = render(
      <ChartArcDiagram nodes={nodes} edges={edges} />,
    );
    const nodeCircles = container.querySelectorAll(
      '[data-section="chart-arc-diagram-node-circle"]',
    );
    const edgePaths = container.querySelectorAll(
      '[data-section="chart-arc-diagram-edge-path"]',
    );
    expect(nodeCircles.length).toBe(nodes.length);
    expect(edgePaths.length).toBe(edges.length);
  });

  it('mirrors node metadata on the group', () => {
    const { container } = render(
      <ChartArcDiagram nodes={nodes} edges={edges} />,
    );
    const c = container.querySelector(
      '[data-section="chart-arc-diagram-node"][data-node-id="c"]',
    );
    expect(c?.getAttribute('data-node-group')).toBe('g1');
    expect(c?.getAttribute('data-node-degree')).toBe('2');
  });

  it('honours custom node + edge color', () => {
    const { container } = render(
      <ChartArcDiagram nodes={nodes} edges={edges} />,
    );
    const d = container.querySelector(
      '[data-section="chart-arc-diagram-node"][data-node-id="d"]',
    );
    expect(d?.getAttribute('data-node-color')).toBe('#ff00aa');
    const e = container.querySelector(
      '[data-section="chart-arc-diagram-edge"][data-edge-index="0"]',
    );
    expect(e?.getAttribute('data-edge-color')).toBe(
      DEFAULT_CHART_ARC_DIAGRAM_EDGE_COLOR,
    );
  });

  it('mirrors edge weight on the edge group', () => {
    const { container } = render(
      <ChartArcDiagram nodes={nodes} edges={edges} />,
    );
    const group = container.querySelector(
      '[data-section="chart-arc-diagram-edge"][data-edge-index="2"]',
    );
    expect(group?.getAttribute('data-edge-weight')).toBe('5');
  });

  it('renders labels by default', () => {
    const { container } = render(
      <ChartArcDiagram nodes={nodes} edges={edges} />,
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-arc-diagram-label"]',
    );
    expect(labels.length).toBe(nodes.length);
  });

  it('suppresses labels when showLabels=false', () => {
    const { container } = render(
      <ChartArcDiagram
        nodes={nodes}
        edges={edges}
        showLabels={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-arc-diagram-label"]',
      ),
    ).toBeNull();
  });

  it('renders the baseline', () => {
    const { container } = render(
      <ChartArcDiagram nodes={nodes} edges={edges} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-arc-diagram-baseline"]',
      ),
    ).not.toBeNull();
  });

  it('mirrors arcs-below flag on root', () => {
    const { container } = render(
      <ChartArcDiagram
        nodes={nodes}
        edges={edges}
        arcsBelowBaseline
      />,
    );
    expect(
      container
        .querySelector('[data-section="chart-arc-diagram"]')
        ?.getAttribute('data-arcs-below'),
    ).toBe('true');
  });

  it('shows node tooltip on hover with label + degree', () => {
    const { container } = render(
      <ChartArcDiagram nodes={nodes} edges={edges} />,
    );
    const aCircle = container.querySelector(
      '[data-section="chart-arc-diagram-node-circle"][data-node-id="a"]',
    );
    fireEvent.mouseEnter(aCircle!);
    const tip = container.querySelector(
      '[data-section="chart-arc-diagram-tooltip"]',
    );
    expect(tip).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-arc-diagram-tooltip-label"]',
      )?.textContent,
    ).toBe('A');
    expect(
      container.querySelector(
        '[data-section="chart-arc-diagram-tooltip-degree"]',
      )?.textContent,
    ).toContain('2');
  });

  it('shows group row when node has group; absent otherwise', () => {
    const { container } = render(
      <ChartArcDiagram nodes={nodes} edges={edges} />,
    );
    const b = container.querySelector(
      '[data-section="chart-arc-diagram-node-circle"][data-node-id="b"]',
    );
    fireEvent.mouseEnter(b!);
    expect(
      container.querySelector(
        '[data-section="chart-arc-diagram-tooltip-group"]',
      ),
    ).not.toBeNull();
    fireEvent.mouseLeave(b!);
    const a = container.querySelector(
      '[data-section="chart-arc-diagram-node-circle"][data-node-id="a"]',
    );
    fireEvent.mouseEnter(a!);
    expect(
      container.querySelector(
        '[data-section="chart-arc-diagram-tooltip-group"]',
      ),
    ).toBeNull();
  });

  it('shows edge tooltip on edge hover', () => {
    const { container } = render(
      <ChartArcDiagram nodes={nodes} edges={edges} />,
    );
    const edge = container.querySelector(
      '[data-section="chart-arc-diagram-edge-path"]',
    );
    fireEvent.mouseEnter(edge!);
    const tip = container.querySelector(
      '[data-section="chart-arc-diagram-edge-tooltip"]',
    );
    expect(tip).not.toBeNull();
  });

  it('hides tooltip on mouse-leave', () => {
    const { container } = render(
      <ChartArcDiagram nodes={nodes} edges={edges} />,
    );
    const aCircle = container.querySelector(
      '[data-section="chart-arc-diagram-node-circle"]',
    );
    fireEvent.mouseEnter(aCircle!);
    fireEvent.mouseLeave(aCircle!);
    expect(
      container.querySelector(
        '[data-section="chart-arc-diagram-tooltip"]',
      ),
    ).toBeNull();
  });

  it('suppresses tooltip when showTooltip=false', () => {
    const { container } = render(
      <ChartArcDiagram
        nodes={nodes}
        edges={edges}
        showTooltip={false}
      />,
    );
    const aCircle = container.querySelector(
      '[data-section="chart-arc-diagram-node-circle"]',
    );
    fireEvent.mouseEnter(aCircle!);
    expect(
      container.querySelector(
        '[data-section="chart-arc-diagram-tooltip"]',
      ),
    ).toBeNull();
  });

  it('highlights connected nodes + edges on node hover', () => {
    const { container } = render(
      <ChartArcDiagram nodes={nodes} edges={edges} />,
    );
    const aCircle = container.querySelector(
      '[data-section="chart-arc-diagram-node-circle"][data-node-id="a"]',
    );
    fireEvent.mouseEnter(aCircle!);
    const bGroup = container.querySelector(
      '[data-section="chart-arc-diagram-node"][data-node-id="b"]',
    );
    expect(bGroup?.getAttribute('data-highlighted')).toBe('true');
    const dGroup = container.querySelector(
      '[data-section="chart-arc-diagram-node"][data-node-id="d"]',
    );
    expect(dGroup?.getAttribute('data-highlighted')).toBe('false');
    const abEdge = container.querySelector(
      '[data-section="chart-arc-diagram-edge"][data-edge-index="0"]',
    );
    expect(abEdge?.getAttribute('data-highlighted')).toBe('true');
    const bdEdge = container.querySelector(
      '[data-section="chart-arc-diagram-edge"][data-edge-index="2"]',
    );
    expect(bdEdge?.getAttribute('data-highlighted')).toBe('false');
  });

  it('does not dim when highlightOnHover=false', () => {
    const { container } = render(
      <ChartArcDiagram
        nodes={nodes}
        edges={edges}
        highlightOnHover={false}
      />,
    );
    const aCircle = container.querySelector(
      '[data-section="chart-arc-diagram-node-circle"][data-node-id="a"]',
    );
    fireEvent.mouseEnter(aCircle!);
    const dCircle = container.querySelector(
      '[data-section="chart-arc-diagram-node-circle"][data-node-id="d"]',
    );
    const op = parseFloat(
      dCircle?.getAttribute('fill-opacity') ?? '0',
    );
    expect(op).toBeCloseTo(0.92);
  });

  it('invokes onNodeClick with node + index + degree', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ChartArcDiagram
        nodes={nodes}
        edges={edges}
        onNodeClick={onClick}
      />,
    );
    const c = container.querySelector(
      '[data-section="chart-arc-diagram-node-circle"][data-node-id="c"]',
    );
    fireEvent.click(c!);
    expect(onClick).toHaveBeenCalledTimes(1);
    const arg = onClick.mock.calls[0]?.[0];
    expect(arg?.node?.id).toBe('c');
    expect(arg?.index).toBe(2);
    expect(arg?.degree).toBe(2);
  });

  it('invokes onEdgeClick with edge + source + target', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ChartArcDiagram
        nodes={nodes}
        edges={edges}
        onEdgeClick={onClick}
      />,
    );
    const edge = container.querySelector(
      '[data-section="chart-arc-diagram-edge-path"]',
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
      <ChartArcDiagram nodes={nodes} edges={edges} />,
    );
    const node = container.querySelector(
      '[data-section="chart-arc-diagram-node-circle"]',
    );
    expect(node?.getAttribute('role')).toBe('graphics-symbol');
    expect(node?.getAttribute('aria-label')).toContain('A');
    const edge = container.querySelector(
      '[data-section="chart-arc-diagram-edge-path"]',
    );
    expect(edge?.getAttribute('role')).toBe('graphics-symbol');
    expect(edge?.getAttribute('aria-label')).toContain('a - b');
  });

  it('mirrors animate flag on the root', () => {
    const { container, rerender } = render(
      <ChartArcDiagram nodes={nodes} edges={edges} />,
    );
    expect(
      container
        .querySelector('[data-section="chart-arc-diagram"]')
        ?.getAttribute('data-animate'),
    ).toBe('true');
    rerender(
      <ChartArcDiagram
        nodes={nodes}
        edges={edges}
        animate={false}
      />,
    );
    expect(
      container
        .querySelector('[data-section="chart-arc-diagram"]')
        ?.getAttribute('data-animate'),
    ).toBe('false');
  });

  it('mirrors size on the svg', () => {
    const { container } = render(
      <ChartArcDiagram
        nodes={nodes}
        edges={edges}
        width={800}
        height={300}
      />,
    );
    const svg = container.querySelector(
      '[data-section="chart-arc-diagram-svg"]',
    );
    expect(svg?.getAttribute('width')).toBe('800');
    expect(svg?.getAttribute('height')).toBe('300');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 800 300');
  });

  it('renders auto-generated ARIA description by default', () => {
    const { container } = render(
      <ChartArcDiagram nodes={nodes} edges={edges} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-arc-diagram-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Arc diagram');
    expect(desc?.textContent).toContain('4 nodes');
  });

  it('honours ariaDescription override', () => {
    const { container } = render(
      <ChartArcDiagram
        nodes={nodes}
        edges={edges}
        ariaDescription="custom"
      />,
    );
    const desc = container.querySelector(
      '[data-section="chart-arc-diagram-aria-desc"]',
    );
    expect(desc?.textContent).toBe('custom');
  });

  it('handles empty data without crashing', () => {
    const { container } = render(
      <ChartArcDiagram nodes={[]} edges={[]} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-arc-diagram"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelectorAll(
        '[data-section="chart-arc-diagram-node"]',
      ).length,
    ).toBe(0);
  });

  it('skips edges with unknown source / target', () => {
    const { container } = render(
      <ChartArcDiagram
        nodes={nodes}
        edges={[
          ...edges,
          { source: 'a', target: 'unknown' },
          { source: 'unknown', target: 'b' },
        ]}
      />,
    );
    const paths = container.querySelectorAll(
      '[data-section="chart-arc-diagram-edge-path"]',
    );
    expect(paths.length).toBe(edges.length);
  });

  it('forwards ref to the root region', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartArcDiagram
        ref={ref}
        nodes={nodes}
        edges={edges}
      />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-arc-diagram',
    );
  });

  it('has a stable displayName', () => {
    expect(ChartArcDiagram.displayName).toBe('ChartArcDiagram');
  });
});
