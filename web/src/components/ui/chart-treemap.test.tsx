import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartTreemap,
  DEFAULT_CHART_TREEMAP_GRADIENT_FROM,
  DEFAULT_CHART_TREEMAP_GRADIENT_TO,
  DEFAULT_CHART_TREEMAP_HEIGHT,
  DEFAULT_CHART_TREEMAP_PADDING,
  DEFAULT_CHART_TREEMAP_WIDTH,
  describeTreemap,
  findNodeByPath,
  getNodeValue,
  getTreemapColor,
  squarifyTreemap,
  worstAspectRatio,
} from './chart-treemap';
import type { ChartTreemapNode } from './chart-treemap';

const tree: ChartTreemapNode = {
  id: 'root',
  label: 'Root',
  children: [
    {
      id: 'a',
      label: 'A',
      children: [
        { id: 'a1', label: 'A1', value: 60 },
        { id: 'a2', label: 'A2', value: 30 },
      ],
    },
    { id: 'b', label: 'B', value: 70 },
    { id: 'c', label: 'C', value: 40 },
    { id: 'd', label: 'D', value: 15 },
  ],
};

describe('chart-treemap pure helpers', () => {
  describe('getNodeValue', () => {
    it('returns explicit leaf value', () => {
      expect(getNodeValue({ id: 'x', label: 'x', value: 42 })).toBe(
        42,
      );
    });
    it('sums children when value is undefined', () => {
      expect(getNodeValue(tree.children![0]!)).toBe(90);
    });
    it('prefers parent value when explicit', () => {
      const parent: ChartTreemapNode = {
        id: 'p',
        label: 'p',
        value: 1000,
        children: [{ id: 'c', label: 'c', value: 10 }],
      };
      expect(getNodeValue(parent)).toBe(1000);
    });
    it('returns 0 for non-positive value', () => {
      expect(getNodeValue({ id: 'x', label: 'x', value: 0 })).toBe(0);
      expect(getNodeValue({ id: 'x', label: 'x', value: -10 })).toBe(0);
    });
    it('returns 0 for leaf with no value', () => {
      expect(getNodeValue({ id: 'x', label: 'x' })).toBe(0);
    });
  });

  describe('findNodeByPath', () => {
    it('returns root when path is empty', () => {
      const { node, resolved } = findNodeByPath(tree, []);
      expect(node.id).toBe('root');
      expect(resolved).toEqual([]);
    });
    it('descends into a child', () => {
      const { node, resolved } = findNodeByPath(tree, ['a']);
      expect(node.id).toBe('a');
      expect(resolved).toEqual(['a']);
    });
    it('walks deep paths', () => {
      const { node, resolved } = findNodeByPath(tree, ['a', 'a1']);
      expect(node.id).toBe('a1');
      expect(resolved).toEqual(['a', 'a1']);
    });
    it('stops at the last resolved ancestor when path breaks', () => {
      const { node, resolved } = findNodeByPath(tree, [
        'a',
        'missing',
      ]);
      expect(node.id).toBe('a');
      expect(resolved).toEqual(['a']);
    });
    it('stops at root when no child matches', () => {
      const { node, resolved } = findNodeByPath(tree, ['nope']);
      expect(node.id).toBe('root');
      expect(resolved).toEqual([]);
    });
  });

  describe('worstAspectRatio', () => {
    it('returns +inf for empty input or zero length', () => {
      expect(
        Number.isFinite(worstAspectRatio([], 100)),
      ).toBe(false);
      expect(
        Number.isFinite(worstAspectRatio([10, 20], 0)),
      ).toBe(false);
    });
    it('returns +inf for non-positive min', () => {
      expect(
        Number.isFinite(worstAspectRatio([0, 50], 100)),
      ).toBe(false);
    });
    it('returns a finite ratio for valid inputs', () => {
      const ratio = worstAspectRatio([20, 80], 100);
      expect(Number.isFinite(ratio)).toBe(true);
      expect(ratio).toBeGreaterThan(0);
    });
  });

  describe('squarifyTreemap', () => {
    it('returns [] for empty items', () => {
      expect(
        squarifyTreemap([], { x: 0, y: 0, w: 100, h: 100 }),
      ).toEqual([]);
    });
    it('returns [] for zero-area rect', () => {
      expect(
        squarifyTreemap(
          [{ value: 10 }],
          { x: 0, y: 0, w: 0, h: 0 },
        ),
      ).toEqual([]);
    });
    it('drops items with non-positive value', () => {
      const out = squarifyTreemap(
        [
          { value: 0, id: 'a' },
          { value: -1, id: 'b' },
          { value: 10, id: 'c' },
        ],
        { x: 0, y: 0, w: 100, h: 100 },
      );
      expect(out.length).toBe(1);
      expect(out[0]?.item.id).toBe('c');
    });
    it('one item fills the entire rect', () => {
      const out = squarifyTreemap(
        [{ value: 50, id: 'a' }],
        { x: 0, y: 0, w: 200, h: 100 },
      );
      expect(out.length).toBe(1);
      expect(out[0]?.rect.x).toBe(0);
      expect(out[0]?.rect.y).toBe(0);
      expect(out[0]?.rect.w).toBeCloseTo(200);
      expect(out[0]?.rect.h).toBeCloseTo(100);
    });
    it('total area of cells equals rect area', () => {
      const out = squarifyTreemap(
        [
          { value: 30, id: 'a' },
          { value: 20, id: 'b' },
          { value: 10, id: 'c' },
        ],
        { x: 0, y: 0, w: 100, h: 100 },
      );
      const total = out.reduce(
        (s, c) => s + c.rect.w * c.rect.h,
        0,
      );
      expect(total).toBeCloseTo(10000, 0);
    });
    it('cells fit inside the rect bounds', () => {
      const out = squarifyTreemap(
        [
          { value: 50, id: 'a' },
          { value: 25, id: 'b' },
          { value: 25, id: 'c' },
        ],
        { x: 10, y: 5, w: 100, h: 60 },
      );
      for (const c of out) {
        expect(c.rect.x).toBeGreaterThanOrEqual(10 - 0.01);
        expect(c.rect.y).toBeGreaterThanOrEqual(5 - 0.01);
        expect(c.rect.x + c.rect.w).toBeLessThanOrEqual(
          10 + 100 + 0.01,
        );
        expect(c.rect.y + c.rect.h).toBeLessThanOrEqual(
          5 + 60 + 0.01,
        );
      }
    });
    it('areas are proportional to values', () => {
      const out = squarifyTreemap(
        [
          { value: 50, id: 'a' },
          { value: 25, id: 'b' },
        ],
        { x: 0, y: 0, w: 100, h: 100 },
      );
      const aArea = out.find((c) => c.item.id === 'a')!.rect;
      const bArea = out.find((c) => c.item.id === 'b')!.rect;
      const aSize = aArea.w * aArea.h;
      const bSize = bArea.w * bArea.h;
      expect(aSize).toBeCloseTo(bSize * 2, 0);
    });
  });

  describe('getTreemapColor', () => {
    it('returns the from colour at the min', () => {
      expect(
        getTreemapColor(10, 10, 100, '#000000', '#ffffff'),
      ).toBe('#000000');
    });
    it('returns the to colour at the max', () => {
      expect(
        getTreemapColor(100, 10, 100, '#000000', '#ffffff'),
      ).toBe('#ffffff');
    });
    it('interpolates between min and max', () => {
      const c = getTreemapColor(
        50,
        0,
        100,
        '#000000',
        '#ffffff',
      );
      expect(c).toBe('#808080');
    });
    it('returns to-colour when max <= min', () => {
      expect(
        getTreemapColor(50, 100, 100, '#000000', '#ffffff'),
      ).toBe('#ffffff');
    });
    it('returns from-colour for non-finite inputs', () => {
      expect(
        getTreemapColor(
          Number.NaN,
          0,
          100,
          '#000000',
          '#ffffff',
        ),
      ).toBe('#000000');
    });
  });

  describe('describeTreemap', () => {
    it('describes root with child summary', () => {
      const text = describeTreemap(tree, []);
      expect(text).toContain('Root');
      expect(text).toContain('4 children');
      expect(text).toContain('A');
      expect(text).toContain('B');
    });
    it('describes a leaf node', () => {
      const text = describeTreemap(tree, ['b']);
      expect(text).toContain('B');
      expect(text).toContain('leaf');
      expect(text).toContain('70');
    });
    it('honours formatValue', () => {
      const text = describeTreemap(
        tree,
        [],
        (v) => `${v}u`,
      );
      expect(text).toContain('70u');
    });
  });

  it('exports default constants', () => {
    expect(DEFAULT_CHART_TREEMAP_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_TREEMAP_HEIGHT).toBeGreaterThan(0);
    expect(
      DEFAULT_CHART_TREEMAP_PADDING,
    ).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_CHART_TREEMAP_GRADIENT_FROM).toMatch(/^#/);
    expect(DEFAULT_CHART_TREEMAP_GRADIENT_TO).toMatch(/^#/);
  });
});

describe('<ChartTreemap />', () => {
  it('renders a region with role + aria-label', () => {
    render(<ChartTreemap data={tree} />);
    const root = screen.getByRole('region', { name: 'Treemap' });
    expect(root).toBeInTheDocument();
    expect(root).toHaveAttribute(
      'data-section',
      'chart-treemap',
    );
    expect(root).toHaveAttribute('data-node-id', 'root');
    expect(root).toHaveAttribute('data-depth', '0');
    expect(root).toHaveAttribute('data-child-count', '4');
  });

  it('renders a custom aria-label', () => {
    render(<ChartTreemap data={tree} ariaLabel="Org tree" />);
    expect(
      screen.getByRole('region', { name: 'Org tree' }),
    ).toBeInTheDocument();
  });

  it('renders one cell per child', () => {
    const { container } = render(<ChartTreemap data={tree} />);
    const cells = container.querySelectorAll(
      '[data-section="chart-treemap-cell"]',
    );
    expect(cells.length).toBe(4);
  });

  it('drills into a child with children on click', () => {
    const { container } = render(<ChartTreemap data={tree} />);
    const aRect = container.querySelector(
      '[data-section="chart-treemap-rect"][data-node-id="a"]',
    );
    fireEvent.click(aRect!);
    const root = container.querySelector(
      '[data-section="chart-treemap"]',
    );
    expect(root?.getAttribute('data-node-id')).toBe('a');
    expect(root?.getAttribute('data-depth')).toBe('1');
    const cells = container.querySelectorAll(
      '[data-section="chart-treemap-cell"]',
    );
    expect(cells.length).toBe(2);
  });

  it('does not drill into a leaf child', () => {
    const { container } = render(<ChartTreemap data={tree} />);
    const bRect = container.querySelector(
      '[data-section="chart-treemap-rect"][data-node-id="b"]',
    );
    fireEvent.click(bRect!);
    const root = container.querySelector(
      '[data-section="chart-treemap"]',
    );
    expect(root?.getAttribute('data-node-id')).toBe('root');
  });

  it('emits onDrillChange when drilling', () => {
    const onDrill = vi.fn();
    const { container } = render(
      <ChartTreemap data={tree} onDrillChange={onDrill} />,
    );
    const aRect = container.querySelector(
      '[data-section="chart-treemap-rect"][data-node-id="a"]',
    );
    fireEvent.click(aRect!);
    expect(onDrill).toHaveBeenCalledWith(['a']);
  });

  it('respects controlled drillPath', () => {
    const { container } = render(
      <ChartTreemap data={tree} drillPath={['a']} />,
    );
    const root = container.querySelector(
      '[data-section="chart-treemap"]',
    );
    expect(root?.getAttribute('data-node-id')).toBe('a');
  });

  it('honours defaultDrillPath on initial mount', () => {
    const { container } = render(
      <ChartTreemap data={tree} defaultDrillPath={['a']} />,
    );
    const root = container.querySelector(
      '[data-section="chart-treemap"]',
    );
    expect(root?.getAttribute('data-node-id')).toBe('a');
  });

  it('shows tooltip on cell hover', () => {
    const { container } = render(<ChartTreemap data={tree} />);
    const bRect = container.querySelector(
      '[data-section="chart-treemap-rect"][data-node-id="b"]',
    );
    fireEvent.mouseEnter(bRect!);
    const tip = container.querySelector(
      '[data-section="chart-treemap-tooltip"]',
    );
    expect(tip).not.toBeNull();
    const label = container.querySelector(
      '[data-section="chart-treemap-tooltip-label"]',
    );
    expect(label?.textContent).toBe('B');
  });

  it('shows the drill hint in the tooltip for parents', () => {
    const { container } = render(<ChartTreemap data={tree} />);
    const aRect = container.querySelector(
      '[data-section="chart-treemap-rect"][data-node-id="a"]',
    );
    fireEvent.mouseEnter(aRect!);
    expect(
      container.querySelector(
        '[data-section="chart-treemap-tooltip-drill-hint"]',
      ),
    ).not.toBeNull();
  });

  it('omits the drill hint for leaves', () => {
    const { container } = render(<ChartTreemap data={tree} />);
    const bRect = container.querySelector(
      '[data-section="chart-treemap-rect"][data-node-id="b"]',
    );
    fireEvent.mouseEnter(bRect!);
    expect(
      container.querySelector(
        '[data-section="chart-treemap-tooltip-drill-hint"]',
      ),
    ).toBeNull();
  });

  it('hides tooltip on mouse-leave', () => {
    const { container } = render(<ChartTreemap data={tree} />);
    const bRect = container.querySelector(
      '[data-section="chart-treemap-rect"][data-node-id="b"]',
    );
    fireEvent.mouseEnter(bRect!);
    fireEvent.mouseLeave(bRect!);
    expect(
      container.querySelector(
        '[data-section="chart-treemap-tooltip"]',
      ),
    ).toBeNull();
  });

  it('suppresses tooltip when showTooltip=false', () => {
    const { container } = render(
      <ChartTreemap data={tree} showTooltip={false} />,
    );
    const bRect = container.querySelector(
      '[data-section="chart-treemap-rect"][data-node-id="b"]',
    );
    fireEvent.mouseEnter(bRect!);
    expect(
      container.querySelector(
        '[data-section="chart-treemap-tooltip"]',
      ),
    ).toBeNull();
  });

  it('uses formatValue for label + tooltip', () => {
    const { container } = render(
      <ChartTreemap
        data={tree}
        formatValue={(v) => `${v}u`}
      />,
    );
    const bRect = container.querySelector(
      '[data-section="chart-treemap-rect"][data-node-id="b"]',
    );
    fireEvent.mouseEnter(bRect!);
    const val = container.querySelector(
      '[data-section="chart-treemap-tooltip-value"]',
    );
    expect(val?.textContent).toBe('70u');
  });

  it('honours custom node colour', () => {
    const custom: ChartTreemapNode = {
      id: 'r',
      label: 'r',
      children: [
        {
          id: 'x',
          label: 'x',
          value: 100,
          color: '#abcdef',
        },
      ],
    };
    const { container } = render(<ChartTreemap data={custom} />);
    const cell = container.querySelector(
      '[data-section="chart-treemap-cell"][data-node-id="x"]',
    );
    expect(cell?.getAttribute('data-color')).toBe('#abcdef');
  });

  it('uses gradient palette across child values', () => {
    const { container } = render(<ChartTreemap data={tree} />);
    // 'a' sums to 90 (the max), 'd' is 15 (the min)
    const aCell = container.querySelector(
      '[data-section="chart-treemap-cell"][data-node-id="a"]',
    );
    expect(aCell?.getAttribute('data-color')).toBe(
      DEFAULT_CHART_TREEMAP_GRADIENT_TO,
    );
    const dCell = container.querySelector(
      '[data-section="chart-treemap-cell"][data-node-id="d"]',
    );
    expect(dCell?.getAttribute('data-color')).toBe(
      DEFAULT_CHART_TREEMAP_GRADIENT_FROM,
    );
  });

  it('honours custom gradient endpoints', () => {
    const { container } = render(
      <ChartTreemap
        data={tree}
        gradient={{ from: '#000000', to: '#ffffff' }}
      />,
    );
    // 'a' is the max child, so its colour resolves to the to-colour
    const aCell = container.querySelector(
      '[data-section="chart-treemap-cell"][data-node-id="a"]',
    );
    expect(aCell?.getAttribute('data-color')).toBe('#ffffff');
  });

  it('invokes onNodeClick with node + path + value + rect', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ChartTreemap data={tree} onNodeClick={onClick} />,
    );
    const bRect = container.querySelector(
      '[data-section="chart-treemap-rect"][data-node-id="b"]',
    );
    fireEvent.click(bRect!);
    expect(onClick).toHaveBeenCalledTimes(1);
    const arg = onClick.mock.calls[0]?.[0];
    expect(arg?.node?.id).toBe('b');
    expect(arg?.path).toEqual(['b']);
    expect(arg?.value).toBe(70);
    expect(arg?.rect).toBeDefined();
  });

  it('mirrors data-hovered on the hovered cell', () => {
    const { container } = render(<ChartTreemap data={tree} />);
    const cells = container.querySelectorAll(
      '[data-section="chart-treemap-cell"]',
    );
    const target = container.querySelector(
      '[data-section="chart-treemap-rect"][data-node-id="b"]',
    );
    fireEvent.mouseEnter(target!);
    const hoveredCell = container.querySelector(
      '[data-section="chart-treemap-cell"][data-node-id="b"]',
    );
    expect(hoveredCell?.getAttribute('data-hovered')).toBe(
      'true',
    );
    expect(cells[0]?.getAttribute('data-hovered')).toBeDefined();
  });

  it('exposes role=graphics-symbol + aria-label per cell', () => {
    const { container } = render(<ChartTreemap data={tree} />);
    const rect = container.querySelector(
      '[data-section="chart-treemap-rect"]',
    );
    expect(rect?.getAttribute('role')).toBe('graphics-symbol');
    expect(rect?.getAttribute('aria-label')).toContain(':');
  });

  it('mirrors animate flag on the root', () => {
    const { container, rerender } = render(
      <ChartTreemap data={tree} />,
    );
    expect(
      container
        .querySelector('[data-section="chart-treemap"]')
        ?.getAttribute('data-animate'),
    ).toBe('true');
    rerender(<ChartTreemap data={tree} animate={false} />);
    expect(
      container
        .querySelector('[data-section="chart-treemap"]')
        ?.getAttribute('data-animate'),
    ).toBe('false');
  });

  it('mirrors size on the svg', () => {
    const { container } = render(
      <ChartTreemap data={tree} width={600} height={400} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-treemap-svg"]',
    );
    expect(svg?.getAttribute('width')).toBe('600');
    expect(svg?.getAttribute('height')).toBe('400');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 600 400');
  });

  it('renders auto-generated ARIA description by default', () => {
    const { container } = render(<ChartTreemap data={tree} />);
    const desc = container.querySelector(
      '[data-section="chart-treemap-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Treemap of Root');
  });

  it('honours ariaDescription override', () => {
    const { container } = render(
      <ChartTreemap data={tree} ariaDescription="custom" />,
    );
    const desc = container.querySelector(
      '[data-section="chart-treemap-aria-desc"]',
    );
    expect(desc?.textContent).toBe('custom');
  });

  it('handles a leaf-only root (no children)', () => {
    const leaf: ChartTreemapNode = {
      id: 'r',
      label: 'r',
      value: 50,
    };
    const { container } = render(<ChartTreemap data={leaf} />);
    expect(
      container.querySelectorAll(
        '[data-section="chart-treemap-cell"]',
      ).length,
    ).toBe(0);
  });

  it('forwards ref to the root region', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartTreemap ref={ref} data={tree} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-treemap',
    );
  });

  it('has a stable displayName', () => {
    expect(ChartTreemap.displayName).toBe('ChartTreemap');
  });
});
