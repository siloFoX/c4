import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartSankey,
  DEFAULT_CHART_SANKEY_HEIGHT,
  DEFAULT_CHART_SANKEY_LINK_COLOR,
  DEFAULT_CHART_SANKEY_NODE_COLOR,
  DEFAULT_CHART_SANKEY_NODE_PADDING,
  DEFAULT_CHART_SANKEY_NODE_WIDTH,
  DEFAULT_CHART_SANKEY_WIDTH,
  buildSankeyLinkPath,
  describeSankeyChart,
  findDownstreamNodes,
  findUpstreamNodes,
  getSankeyNodeLayers,
  getSankeyNodeValue,
} from './chart-sankey';
import type {
  ChartSankeyLink,
  ChartSankeyNode,
} from './chart-sankey';

const nodes: ChartSankeyNode[] = [
  { id: 'src', label: 'Source' },
  { id: 'mid1', label: 'Mid 1' },
  { id: 'mid2', label: 'Mid 2' },
  { id: 'sink', label: 'Sink' },
];

const links: ChartSankeyLink[] = [
  { source: 'src', target: 'mid1', value: 40 },
  { source: 'src', target: 'mid2', value: 60 },
  { source: 'mid1', target: 'sink', value: 40 },
  { source: 'mid2', target: 'sink', value: 60 },
];

describe('chart-sankey pure helpers', () => {
  describe('getSankeyNodeLayers', () => {
    it('places sources at layer 0', () => {
      const layers = getSankeyNodeLayers(nodes, links);
      expect(layers.get('src')).toBe(0);
    });
    it('places mid nodes at layer 1', () => {
      const layers = getSankeyNodeLayers(nodes, links);
      expect(layers.get('mid1')).toBe(1);
      expect(layers.get('mid2')).toBe(1);
    });
    it('places sink at layer 2', () => {
      const layers = getSankeyNodeLayers(nodes, links);
      expect(layers.get('sink')).toBe(2);
    });
    it('handles empty inputs', () => {
      const layers = getSankeyNodeLayers([], []);
      expect(layers.size).toBe(0);
    });
    it('parks cyclic nodes after the highest layer', () => {
      const cycNodes: ChartSankeyNode[] = [
        { id: 'a', label: 'a' },
        { id: 'b', label: 'b' },
      ];
      const cycLinks: ChartSankeyLink[] = [
        { source: 'a', target: 'b', value: 1 },
        { source: 'b', target: 'a', value: 1 },
      ];
      const layers = getSankeyNodeLayers(cycNodes, cycLinks);
      expect(layers.size).toBe(2);
    });
  });

  describe('getSankeyNodeValue', () => {
    it('returns sum of inflow for a sink', () => {
      expect(getSankeyNodeValue('sink', links)).toBe(100);
    });
    it('returns sum of outflow for a source', () => {
      expect(getSankeyNodeValue('src', links)).toBe(100);
    });
    it('returns max(in, out) for a mid node', () => {
      expect(getSankeyNodeValue('mid1', links)).toBe(40);
    });
    it('returns 0 for an isolated node', () => {
      expect(getSankeyNodeValue('isolated', links)).toBe(0);
    });
    it('ignores non-finite / non-positive link values', () => {
      const bad: ChartSankeyLink[] = [
        { source: 's', target: 't', value: Number.NaN },
        { source: 's', target: 't', value: -5 },
        { source: 's', target: 't', value: 10 },
      ];
      expect(getSankeyNodeValue('s', bad)).toBe(10);
    });
  });

  describe('findUpstreamNodes', () => {
    it('returns all ancestors', () => {
      const up = findUpstreamNodes('sink', links);
      expect(up.has('mid1')).toBe(true);
      expect(up.has('mid2')).toBe(true);
      expect(up.has('src')).toBe(true);
    });
    it('returns empty for a source', () => {
      const up = findUpstreamNodes('src', links);
      expect(up.size).toBe(0);
    });
    it('excludes the queried node itself', () => {
      const up = findUpstreamNodes('mid1', links);
      expect(up.has('mid1')).toBe(false);
    });
    it('handles cycles safely', () => {
      const cycLinks: ChartSankeyLink[] = [
        { source: 'a', target: 'b', value: 1 },
        { source: 'b', target: 'a', value: 1 },
      ];
      const up = findUpstreamNodes('a', cycLinks);
      expect(up.has('b')).toBe(true);
      expect(up.has('a')).toBe(false);
    });
  });

  describe('findDownstreamNodes', () => {
    it('returns all descendants', () => {
      const down = findDownstreamNodes('src', links);
      expect(down.has('mid1')).toBe(true);
      expect(down.has('mid2')).toBe(true);
      expect(down.has('sink')).toBe(true);
    });
    it('returns empty for a sink', () => {
      const down = findDownstreamNodes('sink', links);
      expect(down.size).toBe(0);
    });
    it('excludes the queried node itself', () => {
      const down = findDownstreamNodes('mid1', links);
      expect(down.has('mid1')).toBe(false);
    });
  });

  describe('buildSankeyLinkPath', () => {
    it('emits a closed cubic bezier path', () => {
      const path = buildSankeyLinkPath(0, 100, 10, 50, 5);
      expect(path).toMatch(/^M /);
      expect(path).toMatch(/Z$/);
      expect((path.match(/C/g) || []).length).toBe(2);
    });
  });

  describe('describeSankeyChart', () => {
    it('returns "No data" when nodes is empty', () => {
      expect(describeSankeyChart([], [])).toBe('No data');
    });
    it('summarises nodes + link count', () => {
      const text = describeSankeyChart(nodes, links);
      expect(text).toContain('4 nodes');
      expect(text).toContain('4 flows');
      expect(text).toContain('Source');
    });
    it('honours formatValue', () => {
      const text = describeSankeyChart(
        nodes,
        links,
        (v) => `${v}u`,
      );
      expect(text).toContain('100u');
    });
  });

  it('exports default constants', () => {
    expect(DEFAULT_CHART_SANKEY_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_SANKEY_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_SANKEY_NODE_WIDTH).toBeGreaterThan(0);
    expect(
      DEFAULT_CHART_SANKEY_NODE_PADDING,
    ).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_CHART_SANKEY_NODE_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_SANKEY_LINK_COLOR).toMatch(/^#/);
  });
});

describe('<ChartSankey />', () => {
  it('renders a region with role + aria-label', () => {
    render(<ChartSankey nodes={nodes} links={links} />);
    const root = screen.getByRole('region', {
      name: 'Sankey diagram',
    });
    expect(root).toBeInTheDocument();
    expect(root).toHaveAttribute(
      'data-section',
      'chart-sankey',
    );
    expect(root).toHaveAttribute('data-node-count', '4');
    expect(root).toHaveAttribute('data-link-count', '4');
  });

  it('renders a custom aria-label', () => {
    render(
      <ChartSankey
        nodes={nodes}
        links={links}
        ariaLabel="Energy flow"
      />,
    );
    expect(
      screen.getByRole('region', { name: 'Energy flow' }),
    ).toBeInTheDocument();
  });

  it('renders one node rect per node', () => {
    const { container } = render(
      <ChartSankey nodes={nodes} links={links} />,
    );
    const rects = container.querySelectorAll(
      '[data-section="chart-sankey-node-rect"]',
    );
    expect(rects.length).toBe(nodes.length);
  });

  it('renders one link path per link', () => {
    const { container } = render(
      <ChartSankey nodes={nodes} links={links} />,
    );
    const paths = container.querySelectorAll(
      '[data-section="chart-sankey-link"]',
    );
    expect(paths.length).toBe(links.length);
  });

  it('renders labels by default', () => {
    const { container } = render(
      <ChartSankey nodes={nodes} links={links} />,
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-sankey-label"]',
    );
    expect(labels.length).toBe(nodes.length);
  });

  it('suppresses labels when showLabels=false', () => {
    const { container } = render(
      <ChartSankey
        nodes={nodes}
        links={links}
        showLabels={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-sankey-label"]',
      ),
    ).toBeNull();
  });

  it('omits values from labels when showValues=false', () => {
    const { container } = render(
      <ChartSankey
        nodes={nodes}
        links={links}
        showValues={false}
      />,
    );
    const label = container.querySelector(
      '[data-section="chart-sankey-label"]',
    );
    expect(label?.textContent).toBe('Source');
  });

  it('renders the value alongside the label by default', () => {
    const { container } = render(
      <ChartSankey nodes={nodes} links={links} />,
    );
    const label = container.querySelector(
      '[data-section="chart-sankey-label"]',
    );
    expect(label?.textContent).toContain('Source');
    expect(label?.textContent).toContain('100');
  });

  it('shows tooltip on node hover', () => {
    const { container } = render(
      <ChartSankey nodes={nodes} links={links} />,
    );
    const rect = container.querySelector(
      '[data-section="chart-sankey-node-rect"][data-node-id="src"]',
    );
    fireEvent.mouseEnter(rect!);
    const tip = container.querySelector(
      '[data-section="chart-sankey-node-tooltip"]',
    );
    expect(tip).not.toBeNull();
    const label = container.querySelector(
      '[data-section="chart-sankey-tooltip-label"]',
    );
    expect(label?.textContent).toBe('Source');
  });

  it('hides node tooltip on mouse-leave', () => {
    const { container } = render(
      <ChartSankey nodes={nodes} links={links} />,
    );
    const rect = container.querySelector(
      '[data-section="chart-sankey-node-rect"][data-node-id="src"]',
    );
    fireEvent.mouseEnter(rect!);
    fireEvent.mouseLeave(rect!);
    expect(
      container.querySelector(
        '[data-section="chart-sankey-node-tooltip"]',
      ),
    ).toBeNull();
  });

  it('shows link tooltip on link hover', () => {
    const { container } = render(
      <ChartSankey nodes={nodes} links={links} />,
    );
    const link = container.querySelector(
      '[data-section="chart-sankey-link"]',
    );
    fireEvent.mouseEnter(link!);
    const tip = container.querySelector(
      '[data-section="chart-sankey-link-tooltip"]',
    );
    expect(tip).not.toBeNull();
  });

  it('hides link tooltip on mouse-leave', () => {
    const { container } = render(
      <ChartSankey nodes={nodes} links={links} />,
    );
    const link = container.querySelector(
      '[data-section="chart-sankey-link"]',
    );
    fireEvent.mouseEnter(link!);
    fireEvent.mouseLeave(link!);
    expect(
      container.querySelector(
        '[data-section="chart-sankey-link-tooltip"]',
      ),
    ).toBeNull();
  });

  it('suppresses tooltip when showTooltip=false', () => {
    const { container } = render(
      <ChartSankey
        nodes={nodes}
        links={links}
        showTooltip={false}
      />,
    );
    const rect = container.querySelector(
      '[data-section="chart-sankey-node-rect"][data-node-id="src"]',
    );
    fireEvent.mouseEnter(rect!);
    expect(
      container.querySelector(
        '[data-section="chart-sankey-node-tooltip"]',
      ),
    ).toBeNull();
  });

  it('highlights upstream + downstream nodes on hover', () => {
    const { container } = render(
      <ChartSankey nodes={nodes} links={links} />,
    );
    const mid1 = container.querySelector(
      '[data-section="chart-sankey-node-rect"][data-node-id="mid1"]',
    );
    fireEvent.mouseEnter(mid1!);
    const srcGroup = container.querySelector(
      '[data-section="chart-sankey-node"][data-node-id="src"]',
    );
    const sinkGroup = container.querySelector(
      '[data-section="chart-sankey-node"][data-node-id="sink"]',
    );
    const mid2Group = container.querySelector(
      '[data-section="chart-sankey-node"][data-node-id="mid2"]',
    );
    expect(srcGroup?.getAttribute('data-highlighted')).toBe(
      'true',
    );
    expect(sinkGroup?.getAttribute('data-highlighted')).toBe(
      'true',
    );
    expect(mid2Group?.getAttribute('data-highlighted')).toBe(
      'false',
    );
  });

  it('does not highlight when highlightOnHover=false', () => {
    const { container } = render(
      <ChartSankey
        nodes={nodes}
        links={links}
        highlightOnHover={false}
      />,
    );
    const mid1 = container.querySelector(
      '[data-section="chart-sankey-node-rect"][data-node-id="mid1"]',
    );
    fireEvent.mouseEnter(mid1!);
    const srcGroup = container.querySelector(
      '[data-section="chart-sankey-node"][data-node-id="src"]',
    );
    expect(srcGroup?.getAttribute('data-highlighted')).toBe(
      'false',
    );
  });

  it('mirrors data-layer on each node group', () => {
    const { container } = render(
      <ChartSankey nodes={nodes} links={links} />,
    );
    const sources = container.querySelectorAll(
      '[data-section="chart-sankey-node"][data-layer="0"]',
    );
    const sinks = container.querySelectorAll(
      '[data-section="chart-sankey-node"][data-layer="2"]',
    );
    expect(sources.length).toBe(1);
    expect(sinks.length).toBe(1);
  });

  it('invokes onNodeClick with node + value', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ChartSankey
        nodes={nodes}
        links={links}
        onNodeClick={onClick}
      />,
    );
    const rect = container.querySelector(
      '[data-section="chart-sankey-node-rect"][data-node-id="src"]',
    );
    fireEvent.click(rect!);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0]?.[0]?.node?.id).toBe('src');
    expect(onClick.mock.calls[0]?.[0]?.value).toBe(100);
  });

  it('invokes onLinkClick with link + source + target', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ChartSankey
        nodes={nodes}
        links={links}
        onLinkClick={onClick}
      />,
    );
    const link = container.querySelector(
      '[data-section="chart-sankey-link"]',
    );
    fireEvent.click(link!);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0]?.[0]?.link?.source).toBe(
      'src',
    );
  });

  it('exposes role=graphics-symbol + aria-label per node + link', () => {
    const { container } = render(
      <ChartSankey nodes={nodes} links={links} />,
    );
    const nodeRect = container.querySelector(
      '[data-section="chart-sankey-node-rect"]',
    );
    expect(nodeRect?.getAttribute('role')).toBe('graphics-symbol');
    expect(nodeRect?.getAttribute('aria-label')).toContain(
      'Source',
    );
    const link = container.querySelector(
      '[data-section="chart-sankey-link"]',
    );
    expect(link?.getAttribute('role')).toBe('graphics-symbol');
    expect(link?.getAttribute('aria-label')).toContain(
      'Source to Mid 1',
    );
  });

  it('honours custom node colour', () => {
    const colored: ChartSankeyNode[] = nodes.map((n, i) =>
      i === 0 ? { ...n, color: '#ff00aa' } : n,
    );
    const { container } = render(
      <ChartSankey nodes={colored} links={links} />,
    );
    const rect = container.querySelector(
      '[data-section="chart-sankey-node-rect"][data-node-id="src"]',
    );
    expect(rect?.getAttribute('fill')).toBe('#ff00aa');
  });

  it('honours custom link colour', () => {
    const colored: ChartSankeyLink[] = links.map((l, i) =>
      i === 0 ? { ...l, color: '#00ffaa' } : l,
    );
    const { container } = render(
      <ChartSankey nodes={nodes} links={colored} />,
    );
    const linkPath = container.querySelector(
      '[data-section="chart-sankey-link"][data-link-index="0"]',
    );
    expect(linkPath?.getAttribute('fill')).toBe('#00ffaa');
  });

  it('uses formatValue in labels + tooltip', () => {
    const { container } = render(
      <ChartSankey
        nodes={nodes}
        links={links}
        formatValue={(v) => `${v}u`}
      />,
    );
    const label = container.querySelector(
      '[data-section="chart-sankey-label"]',
    );
    expect(label?.textContent).toContain('100u');
    const rect = container.querySelector(
      '[data-section="chart-sankey-node-rect"][data-node-id="src"]',
    );
    fireEvent.mouseEnter(rect!);
    const tipVal = container.querySelector(
      '[data-section="chart-sankey-tooltip-value"]',
    );
    expect(tipVal?.textContent).toBe('100u');
  });

  it('mirrors animate flag on the root', () => {
    const { container, rerender } = render(
      <ChartSankey nodes={nodes} links={links} />,
    );
    expect(
      container
        .querySelector('[data-section="chart-sankey"]')
        ?.getAttribute('data-animate'),
    ).toBe('true');
    rerender(
      <ChartSankey
        nodes={nodes}
        links={links}
        animate={false}
      />,
    );
    expect(
      container
        .querySelector('[data-section="chart-sankey"]')
        ?.getAttribute('data-animate'),
    ).toBe('false');
  });

  it('mirrors size on the svg', () => {
    const { container } = render(
      <ChartSankey
        nodes={nodes}
        links={links}
        width={800}
        height={400}
      />,
    );
    const svg = container.querySelector(
      '[data-section="chart-sankey-svg"]',
    );
    expect(svg?.getAttribute('width')).toBe('800');
    expect(svg?.getAttribute('height')).toBe('400');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 800 400');
  });

  it('renders auto-generated ARIA description by default', () => {
    const { container } = render(
      <ChartSankey nodes={nodes} links={links} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-sankey-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Sankey with 4 nodes');
  });

  it('honours ariaDescription override', () => {
    const { container } = render(
      <ChartSankey
        nodes={nodes}
        links={links}
        ariaDescription="custom"
      />,
    );
    const desc = container.querySelector(
      '[data-section="chart-sankey-aria-desc"]',
    );
    expect(desc?.textContent).toBe('custom');
  });

  it('handles empty inputs without crashing', () => {
    const { container } = render(
      <ChartSankey nodes={[]} links={[]} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-sankey"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelectorAll(
        '[data-section="chart-sankey-node-rect"]',
      ).length,
    ).toBe(0);
  });

  it('forwards ref to the root region', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartSankey ref={ref} nodes={nodes} links={links} />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-sankey',
    );
  });

  it('has a stable displayName', () => {
    expect(ChartSankey.displayName).toBe('ChartSankey');
  });
});
