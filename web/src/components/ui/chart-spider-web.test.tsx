import { afterEach, describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import {
  ChartSpiderWeb,
  computeSpiderWebLayout,
  describeSpiderWebChart,
  getSpiderWebDegree,
  getSpiderWebGroups,
  getSpiderWebNodeWeight,
  polarToCartesian,
  DEFAULT_CHART_SPIDER_WEB_WIDTH,
  DEFAULT_CHART_SPIDER_WEB_HEIGHT,
  DEFAULT_CHART_SPIDER_WEB_PADDING,
  DEFAULT_CHART_SPIDER_WEB_HUB_RADIUS,
  DEFAULT_CHART_SPIDER_WEB_SPOKE_RADIUS,
  DEFAULT_CHART_SPIDER_WEB_START_ANGLE,
  DEFAULT_CHART_SPIDER_WEB_HUB_COLOR,
  DEFAULT_CHART_SPIDER_WEB_SPOKE_COLOR,
  DEFAULT_CHART_SPIDER_WEB_EDGE_COLOR,
  DEFAULT_CHART_SPIDER_WEB_RING_COLOR,
  type ChartSpiderWebEdge,
  type ChartSpiderWebNode,
} from './chart-spider-web';

afterEach(() => cleanup());

const NODES: ChartSpiderWebNode[] = [
  { id: 'hub', label: 'Hub' },
  { id: 's1', label: 'Spoke 1', group: 'A' },
  { id: 's2', label: 'Spoke 2', group: 'A' },
  { id: 's3', label: 'Spoke 3', group: 'B' },
  { id: 's4', label: 'Spoke 4', group: 'B' },
];

const EDGES: ChartSpiderWebEdge[] = [
  { source: 'hub', target: 's1', weight: 2 },
  { source: 'hub', target: 's2' },
  { source: 'hub', target: 's3' },
  { source: 's1', target: 's2' },
];

describe('chart-spider-web constants', () => {
  it('exports the documented defaults', () => {
    expect(DEFAULT_CHART_SPIDER_WEB_WIDTH).toBe(420);
    expect(DEFAULT_CHART_SPIDER_WEB_HEIGHT).toBe(420);
    expect(DEFAULT_CHART_SPIDER_WEB_PADDING).toBe(32);
    expect(DEFAULT_CHART_SPIDER_WEB_HUB_RADIUS).toBe(12);
    expect(DEFAULT_CHART_SPIDER_WEB_SPOKE_RADIUS).toBe(8);
    expect(DEFAULT_CHART_SPIDER_WEB_START_ANGLE).toBeCloseTo(-Math.PI / 2);
    expect(DEFAULT_CHART_SPIDER_WEB_HUB_COLOR).toBe('#2563eb');
    expect(DEFAULT_CHART_SPIDER_WEB_SPOKE_COLOR).toBe('#0891b2');
    expect(DEFAULT_CHART_SPIDER_WEB_EDGE_COLOR).toBe('#94a3b8');
    expect(DEFAULT_CHART_SPIDER_WEB_RING_COLOR).toBe('#e2e8f0');
  });
});

describe('polarToCartesian', () => {
  it('returns the center when radius is 0', () => {
    expect(polarToCartesian(5, 7, 0, 1.23)).toEqual({ x: 5, y: 7 });
  });
  it('moves rightward at angle 0', () => {
    const p = polarToCartesian(0, 0, 10, 0);
    expect(p.x).toBeCloseTo(10);
    expect(p.y).toBeCloseTo(0);
  });
  it('moves downward at angle pi/2', () => {
    const p = polarToCartesian(0, 0, 10, Math.PI / 2);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(10);
  });
});

describe('getSpiderWebNodeWeight', () => {
  it('returns 1 by default', () => {
    expect(getSpiderWebNodeWeight({ id: 'a', label: 'A' })).toBe(1);
  });
  it('returns explicit weight when positive + finite', () => {
    expect(
      getSpiderWebNodeWeight({ id: 'a', label: 'A', weight: 5 })
    ).toBe(5);
  });
  it('returns 1 for non-positive / non-finite weight', () => {
    expect(
      getSpiderWebNodeWeight({ id: 'a', label: 'A', weight: 0 })
    ).toBe(1);
    expect(
      getSpiderWebNodeWeight({ id: 'a', label: 'A', weight: -2 })
    ).toBe(1);
    expect(
      getSpiderWebNodeWeight({ id: 'a', label: 'A', weight: Number.NaN })
    ).toBe(1);
  });
});

describe('getSpiderWebGroups', () => {
  it('returns unique groups in first-seen order excluding hub', () => {
    expect(getSpiderWebGroups(NODES, 'hub')).toEqual(['A', 'B']);
  });
  it('uses "" for ungrouped nodes', () => {
    const nodes: ChartSpiderWebNode[] = [
      { id: 'hub', label: 'H' },
      { id: 's1', label: 'A' },
      { id: 's2', label: 'B', group: 'G1' },
    ];
    expect(getSpiderWebGroups(nodes, 'hub')).toEqual(['', 'G1']);
  });
  it('returns empty array for hub-only graph', () => {
    expect(getSpiderWebGroups([{ id: 'hub', label: 'H' }], 'hub')).toEqual([]);
  });
});

describe('getSpiderWebDegree', () => {
  it('counts every incident edge', () => {
    expect(getSpiderWebDegree('hub', EDGES)).toBe(3);
    expect(getSpiderWebDegree('s1', EDGES)).toBe(2);
    expect(getSpiderWebDegree('s4', EDGES)).toBe(0);
  });
});

describe('computeSpiderWebLayout', () => {
  const cx = 210;
  const cy = 210;
  const outerRadius = 160;

  it('places the hub at the center', () => {
    const r = computeSpiderWebLayout({
      nodes: NODES,
      edges: EDGES,
      hubId: 'hub',
      cx,
      cy,
      outerRadius,
      startAngle: -Math.PI / 2,
      hubColor: '#hub',
      spokeColor: '#spoke',
      edgeColor: '#edge',
      groupRings: false,
    });
    expect(r.hub).not.toBeNull();
    expect(r.hub!.id).toBe('hub');
    expect(r.hub!.x).toBeCloseTo(cx);
    expect(r.hub!.y).toBeCloseTo(cy);
  });

  it('lays spokes evenly on the perimeter (single-ring)', () => {
    const r = computeSpiderWebLayout({
      nodes: NODES,
      edges: EDGES,
      hubId: 'hub',
      cx,
      cy,
      outerRadius,
      startAngle: -Math.PI / 2,
      hubColor: '#hub',
      spokeColor: '#spoke',
      edgeColor: '#edge',
      groupRings: false,
    });
    expect(r.spokes).toHaveLength(4);
    for (const s of r.spokes) {
      const dist = Math.hypot(s.x - cx, s.y - cy);
      expect(dist).toBeCloseTo(outerRadius);
    }
    // first spoke at startAngle
    expect(r.spokes[0]!.angle).toBeCloseTo(-Math.PI / 2);
  });

  it('groups by data-group when groupRings=true', () => {
    const r = computeSpiderWebLayout({
      nodes: NODES,
      edges: EDGES,
      hubId: 'hub',
      cx,
      cy,
      outerRadius,
      startAngle: -Math.PI / 2,
      hubColor: '#hub',
      spokeColor: '#spoke',
      edgeColor: '#edge',
      groupRings: true,
    });
    const aGroupRadii = r.spokes.filter((s) => s.group === 'A').map((s) => s.radius);
    const bGroupRadii = r.spokes.filter((s) => s.group === 'B').map((s) => s.radius);
    expect(new Set(aGroupRadii).size).toBe(1);
    expect(new Set(bGroupRadii).size).toBe(1);
    expect(aGroupRadii[0]).not.toBe(bGroupRadii[0]);
  });

  it('rings.radii match the configured count', () => {
    const r = computeSpiderWebLayout({
      nodes: NODES,
      edges: EDGES,
      hubId: 'hub',
      cx,
      cy,
      outerRadius,
      startAngle: -Math.PI / 2,
      hubColor: '#hub',
      spokeColor: '#spoke',
      edgeColor: '#edge',
      groupRings: true,
    });
    expect(r.rings.groups).toEqual(['A', 'B']);
    expect(r.rings.radii.length).toBe(2);
  });

  it('hub-spoke edges flagged isHubSpoke=true', () => {
    const r = computeSpiderWebLayout({
      nodes: NODES,
      edges: EDGES,
      hubId: 'hub',
      cx,
      cy,
      outerRadius,
      startAngle: -Math.PI / 2,
      hubColor: '#hub',
      spokeColor: '#spoke',
      edgeColor: '#edge',
      groupRings: false,
    });
    expect(r.edges).toHaveLength(4);
    const hubEdges = r.edges.filter((e) => e.isHubSpoke);
    const interSpoke = r.edges.filter((e) => !e.isHubSpoke);
    expect(hubEdges.length).toBe(3);
    expect(interSpoke.length).toBe(1);
    expect(interSpoke[0]!.source).toBe('s1');
    expect(interSpoke[0]!.target).toBe('s2');
  });

  it('edges referencing unknown ids are silently dropped', () => {
    const r = computeSpiderWebLayout({
      nodes: NODES,
      edges: [
        ...EDGES,
        { source: 'hub', target: 'zzz' },
        { source: 'unknown', target: 's1' },
      ],
      hubId: 'hub',
      cx,
      cy,
      outerRadius,
      startAngle: -Math.PI / 2,
      hubColor: '#hub',
      spokeColor: '#spoke',
      edgeColor: '#edge',
      groupRings: false,
    });
    expect(r.edges).toHaveLength(4);
  });

  it('edge endpoints match node coordinates', () => {
    const r = computeSpiderWebLayout({
      nodes: NODES,
      edges: EDGES,
      hubId: 'hub',
      cx,
      cy,
      outerRadius,
      startAngle: -Math.PI / 2,
      hubColor: '#hub',
      spokeColor: '#spoke',
      edgeColor: '#edge',
      groupRings: false,
    });
    const e = r.edges[0]!;
    const src = [...(r.hub ? [r.hub] : []), ...r.spokes].find(
      (n) => n.id === e.source
    )!;
    const tgt = [...(r.hub ? [r.hub] : []), ...r.spokes].find(
      (n) => n.id === e.target
    )!;
    expect(e.x1).toBeCloseTo(src.x);
    expect(e.y1).toBeCloseTo(src.y);
    expect(e.x2).toBeCloseTo(tgt.x);
    expect(e.y2).toBeCloseTo(tgt.y);
  });

  it('hub degree matches incident-edge count', () => {
    const r = computeSpiderWebLayout({
      nodes: NODES,
      edges: EDGES,
      hubId: 'hub',
      cx,
      cy,
      outerRadius,
      startAngle: -Math.PI / 2,
      hubColor: '#hub',
      spokeColor: '#spoke',
      edgeColor: '#edge',
      groupRings: false,
    });
    expect(r.hub!.degree).toBe(3);
    const s1 = r.spokes.find((s) => s.id === 's1')!;
    expect(s1.degree).toBe(2);
  });

  it('empty inputs return an empty layout', () => {
    const r = computeSpiderWebLayout({
      nodes: [],
      edges: [],
      cx,
      cy,
      outerRadius,
      startAngle: 0,
      hubColor: '#hub',
      spokeColor: '#spoke',
      edgeColor: '#edge',
      groupRings: false,
    });
    expect(r.hub).toBeNull();
    expect(r.spokes).toEqual([]);
    expect(r.edges).toEqual([]);
  });

  it('non-positive outer radius returns an empty layout', () => {
    const r = computeSpiderWebLayout({
      nodes: NODES,
      edges: EDGES,
      cx,
      cy,
      outerRadius: 0,
      startAngle: 0,
      hubColor: '#hub',
      spokeColor: '#spoke',
      edgeColor: '#edge',
      groupRings: false,
    });
    expect(r.hub).toBeNull();
    expect(r.spokes).toEqual([]);
  });

  it('falls back to first node when hubId not in nodes', () => {
    const r = computeSpiderWebLayout({
      nodes: NODES,
      edges: EDGES,
      hubId: 'no-such-node',
      cx,
      cy,
      outerRadius,
      startAngle: 0,
      hubColor: '#hub',
      spokeColor: '#spoke',
      edgeColor: '#edge',
      groupRings: false,
    });
    expect(r.hub!.id).toBe('hub');
  });

  it('per-node + per-edge color overrides beat defaults', () => {
    const r = computeSpiderWebLayout({
      nodes: [
        { id: 'hub', label: 'H', color: '#aaa' },
        { id: 's1', label: 'S1', color: '#bbb' },
      ],
      edges: [{ source: 'hub', target: 's1', color: '#ccc' }],
      hubId: 'hub',
      cx,
      cy,
      outerRadius,
      startAngle: 0,
      hubColor: '#hub',
      spokeColor: '#spoke',
      edgeColor: '#edge',
      groupRings: false,
    });
    expect(r.hub!.color).toBe('#aaa');
    expect(r.spokes[0]!.color).toBe('#bbb');
    expect(r.edges[0]!.color).toBe('#ccc');
  });
});

describe('describeSpiderWebChart', () => {
  it('returns "No data" for empty', () => {
    expect(describeSpiderWebChart([], [])).toBe('No data');
  });
  it('reports hub + spoke + edge counts + hub degree', () => {
    const d = describeSpiderWebChart(NODES, EDGES, 'hub');
    expect(d).toContain('Hub');
    expect(d).toContain('4 spoke');
    expect(d).toContain('4 edges');
    expect(d).toContain('hub has 3 connections');
  });
});

describe('<ChartSpiderWeb> component', () => {
  it('renders region + custom aria-label', () => {
    const { getByRole } = render(
      <ChartSpiderWeb nodes={NODES} edges={EDGES} ariaLabel="Test spider" />
    );
    expect(getByRole('region', { name: 'Test spider' })).toBeTruthy();
  });

  it('renders hub + spoke nodes', () => {
    const { container } = render(<ChartSpiderWeb nodes={NODES} edges={EDGES} />);
    expect(
      container.querySelectorAll(
        '[data-section="chart-spider-web-node"]'
      ).length
    ).toBe(5);
    expect(
      container.querySelector('[data-node-is-hub="true"]')
    ).not.toBeNull();
    expect(
      container.querySelectorAll('[data-node-is-hub="false"]').length
    ).toBe(4);
  });

  it('renders edges with hub-spoke flag', () => {
    const { container } = render(<ChartSpiderWeb nodes={NODES} edges={EDGES} />);
    expect(
      container.querySelectorAll(
        '[data-section="chart-spider-web-edge"]'
      ).length
    ).toBe(4);
    expect(
      container.querySelectorAll(
        '[data-section="chart-spider-web-edge"][data-edge-hub-spoke="true"]'
      ).length
    ).toBe(3);
  });

  it('node + edge data attrs mirror layout', () => {
    const { container } = render(<ChartSpiderWeb nodes={NODES} edges={EDGES} />);
    const hubNode = container.querySelector(
      '[data-node-id="hub"]'
    ) as HTMLElement;
    expect(hubNode.getAttribute('data-node-is-hub')).toBe('true');
    expect(hubNode.getAttribute('data-node-degree')).toBe('3');
    const s1 = container.querySelector(
      '[data-node-id="s1"]'
    ) as HTMLElement;
    expect(s1.getAttribute('data-node-group')).toBe('A');
    expect(s1.getAttribute('data-node-degree')).toBe('2');
    const edge = container.querySelector(
      '[data-section="chart-spider-web-edge"]'
    ) as HTMLElement;
    expect(edge.getAttribute('data-edge-source')).toBeTruthy();
    expect(edge.getAttribute('data-edge-target')).toBeTruthy();
    expect(edge.getAttribute('data-edge-weight')).toBeTruthy();
  });

  it('node circle + edge line are role=graphics-symbol + tabIndex=0 + aria-label', () => {
    const { container } = render(<ChartSpiderWeb nodes={NODES} edges={EDGES} />);
    const circle = container.querySelector(
      '[data-section="chart-spider-web-node-circle"]'
    ) as SVGCircleElement;
    expect(circle.getAttribute('role')).toBe('graphics-symbol');
    expect(circle.getAttribute('tabindex')).toBe('0');
    expect(circle.getAttribute('aria-label')).toContain('Spoke 1');
    expect(circle.getAttribute('aria-label')).toContain('degree');
    const line = container.querySelector(
      '[data-section="chart-spider-web-edge"]'
    ) as SVGLineElement;
    expect(line.getAttribute('role')).toBe('graphics-symbol');
    expect(line.getAttribute('tabindex')).toBe('0');
    expect(line.getAttribute('aria-label')).toContain('weight');
  });

  it('root mirrors node + spoke + edge counts + hub + animate', () => {
    const { container } = render(<ChartSpiderWeb nodes={NODES} edges={EDGES} />);
    const root = container.querySelector('[data-section="chart-spider-web"]');
    expect(root?.getAttribute('data-node-count')).toBe('5');
    expect(root?.getAttribute('data-spoke-count')).toBe('4');
    expect(root?.getAttribute('data-edge-count')).toBe('4');
    expect(root?.getAttribute('data-hub-id')).toBe('hub');
    expect(root?.getAttribute('data-group-rings')).toBe('false');
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('rings hidden by default; showRings + groupRings render them', () => {
    const a = render(<ChartSpiderWeb nodes={NODES} edges={EDGES} />);
    expect(
      a.container.querySelector('[data-section="chart-spider-web-rings"]')
    ).toBeNull();
    cleanup();
    const b = render(
      <ChartSpiderWeb nodes={NODES} edges={EDGES} showRings groupRings />
    );
    expect(
      b.container.querySelectorAll(
        '[data-section="chart-spider-web-ring"]'
      ).length
    ).toBe(2);
  });

  it('labels render by default + suppression', () => {
    const a = render(<ChartSpiderWeb nodes={NODES} edges={EDGES} />);
    expect(
      a.container.querySelectorAll(
        '[data-section="chart-spider-web-node-label"]'
      ).length
    ).toBe(5);
    cleanup();
    const b = render(
      <ChartSpiderWeb nodes={NODES} edges={EDGES} showLabels={false} />
    );
    expect(
      b.container.querySelector(
        '[data-section="chart-spider-web-node-label"]'
      )
    ).toBeNull();
  });

  it('hover on a node opens node tooltip with label + degree', () => {
    const { container } = render(<ChartSpiderWeb nodes={NODES} edges={EDGES} />);
    const node = container.querySelector('[data-node-id="s1"]') as HTMLElement;
    fireEvent.mouseEnter(node);
    expect(
      container.querySelector('[data-section="chart-spider-web-tooltip"]')
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-spider-web-tooltip-label"]'
      )?.textContent
    ).toBe('Spoke 1');
    expect(
      container.querySelector(
        '[data-section="chart-spider-web-tooltip-degree"]'
      )?.textContent
    ).toContain('degree:');
  });

  it('hover on hub node prefixes label with "Hub:"', () => {
    const { container } = render(<ChartSpiderWeb nodes={NODES} edges={EDGES} />);
    fireEvent.mouseEnter(
      container.querySelector('[data-node-id="hub"]')! as HTMLElement
    );
    expect(
      container.querySelector(
        '[data-section="chart-spider-web-tooltip-label"]'
      )?.textContent
    ).toContain('Hub');
  });

  it('hover on edge opens edge tooltip with src/tgt + weight', () => {
    const { container } = render(<ChartSpiderWeb nodes={NODES} edges={EDGES} />);
    const edge = container.querySelector(
      '[data-section="chart-spider-web-edge"]'
    ) as HTMLElement;
    fireEvent.mouseEnter(edge);
    expect(
      container.querySelector(
        '[data-section="chart-spider-web-edge-tooltip"]'
      )
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-spider-web-edge-tooltip-weight"]'
      )?.textContent
    ).toContain('weight:');
  });

  it('tooltip hides on mouseleave', () => {
    const { container } = render(<ChartSpiderWeb nodes={NODES} edges={EDGES} />);
    const node = container.querySelector('[data-node-id="s1"]') as HTMLElement;
    fireEvent.mouseEnter(node);
    expect(
      container.querySelector('[data-section="chart-spider-web-tooltip"]')
    ).not.toBeNull();
    fireEvent.mouseLeave(node);
    expect(
      container.querySelector('[data-section="chart-spider-web-tooltip"]')
    ).toBeNull();
  });

  it('showTooltip=false suppresses both node + edge tooltips', () => {
    const { container } = render(
      <ChartSpiderWeb nodes={NODES} edges={EDGES} showTooltip={false} />
    );
    fireEvent.mouseEnter(
      container.querySelector('[data-node-id="s1"]')! as HTMLElement
    );
    expect(
      container.querySelector('[data-section="chart-spider-web-tooltip"]')
    ).toBeNull();
  });

  it('onNodeClick fires with node + layout', () => {
    const onNodeClick = vi.fn();
    const { container } = render(
      <ChartSpiderWeb
        nodes={NODES}
        edges={EDGES}
        onNodeClick={onNodeClick}
      />
    );
    fireEvent.click(
      container.querySelector('[data-node-id="s2"]')! as HTMLElement
    );
    expect(onNodeClick).toHaveBeenCalledTimes(1);
    expect(onNodeClick.mock.calls[0]![0].node.id).toBe('s2');
    expect(onNodeClick.mock.calls[0]![0].layout.id).toBe('s2');
  });

  it('onEdgeClick fires with edge + layout', () => {
    const onEdgeClick = vi.fn();
    const { container } = render(
      <ChartSpiderWeb
        nodes={NODES}
        edges={EDGES}
        onEdgeClick={onEdgeClick}
      />
    );
    fireEvent.click(
      container.querySelector(
        '[data-section="chart-spider-web-edge"]'
      )! as HTMLElement
    );
    expect(onEdgeClick).toHaveBeenCalledTimes(1);
    expect(onEdgeClick.mock.calls[0]![0].layout.index).toBe(0);
  });

  it('data-hovered mirrors node hover state', () => {
    const { container } = render(<ChartSpiderWeb nodes={NODES} edges={EDGES} />);
    const node = container.querySelector('[data-node-id="s1"]') as HTMLElement;
    expect(node.getAttribute('data-hovered')).toBe('false');
    fireEvent.mouseEnter(node);
    expect(node.getAttribute('data-hovered')).toBe('true');
    fireEvent.mouseLeave(node);
    expect(node.getAttribute('data-hovered')).toBe('false');
  });

  it('hubId prop selects which node is the hub', () => {
    const { container } = render(
      <ChartSpiderWeb nodes={NODES} edges={EDGES} hubId="s1" />
    );
    const root = container.querySelector('[data-section="chart-spider-web"]');
    expect(root?.getAttribute('data-hub-id')).toBe('s1');
    const hub = container.querySelector('[data-node-is-hub="true"]');
    expect(hub?.getAttribute('data-node-id')).toBe('s1');
  });

  it('auto ARIA description renders by default', () => {
    const { container } = render(<ChartSpiderWeb nodes={NODES} edges={EDGES} />);
    expect(
      container.querySelector(
        '[data-section="chart-spider-web-aria-desc"]'
      )?.textContent
    ).toContain('Hub');
  });

  it('ariaDescription override beats auto', () => {
    const { container } = render(
      <ChartSpiderWeb
        nodes={NODES}
        edges={EDGES}
        ariaDescription="Override"
      />
    );
    expect(
      container.querySelector(
        '[data-section="chart-spider-web-aria-desc"]'
      )?.textContent
    ).toBe('Override');
  });

  it('SVG mirrors width / height / viewBox', () => {
    const { container } = render(
      <ChartSpiderWeb nodes={NODES} edges={EDGES} width={500} height={500} />
    );
    const svg = container.querySelector(
      '[data-section="chart-spider-web-svg"]'
    ) as SVGElement;
    expect(svg.getAttribute('width')).toBe('500');
    expect(svg.getAttribute('height')).toBe('500');
    expect(svg.getAttribute('viewBox')).toBe('0 0 500 500');
  });

  it('empty input renders without crashing', () => {
    const { container } = render(<ChartSpiderWeb nodes={[]} edges={[]} />);
    expect(
      container.querySelectorAll(
        '[data-section="chart-spider-web-node"]'
      ).length
    ).toBe(0);
    expect(
      container.querySelector(
        '[data-section="chart-spider-web-aria-desc"]'
      )?.textContent
    ).toBe('No data');
  });

  it('forwards ref to root', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartSpiderWeb nodes={NODES} edges={EDGES} ref={ref} />);
    expect(ref.current?.dataset.section).toBe('chart-spider-web');
  });

  it('has stable displayName', () => {
    expect(ChartSpiderWeb.displayName).toBe('ChartSpiderWeb');
  });

  it('data-animate mirrors prop', () => {
    const { container } = render(
      <ChartSpiderWeb nodes={NODES} edges={EDGES} animate={false} />
    );
    expect(
      container.querySelector('[data-section="chart-spider-web"]')!
        .getAttribute('data-animate')
    ).toBe('false');
  });
});
