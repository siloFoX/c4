import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartChord,
  DEFAULT_CHART_CHORD_ARC_GAP,
  DEFAULT_CHART_CHORD_ARC_WIDTH,
  DEFAULT_CHART_CHORD_CATEGORY_COLOR,
  DEFAULT_CHART_CHORD_HEIGHT,
  DEFAULT_CHART_CHORD_PADDING,
  DEFAULT_CHART_CHORD_RIBBON_OPACITY,
  DEFAULT_CHART_CHORD_WIDTH,
  buildChordArcPath,
  buildChordLayout,
  buildChordRibbonPath,
  chordPolarToCartesian,
  describeChordChart,
  getChordCategoryTotals,
} from './chart-chord';
import type {
  ChartChordCategory,
  ChartChordFlow,
} from './chart-chord';

const categories: ChartChordCategory[] = [
  { id: 'a', label: 'A' },
  { id: 'b', label: 'B', color: '#ff00aa' },
  { id: 'c', label: 'C' },
];

const flows: ChartChordFlow[] = [
  { source: 'a', target: 'b', value: 10 },
  { source: 'a', target: 'c', value: 5 },
  { source: 'b', target: 'c', value: 15 },
];

describe('chart-chord pure helpers', () => {
  describe('getChordCategoryTotals', () => {
    it('sums per-category totals across flows', () => {
      const t = getChordCategoryTotals(categories, flows);
      // a: 10 (a->b) + 5 (a->c) = 15
      // b: 10 (a->b) + 15 (b->c) = 25
      // c: 5 (a->c) + 15 (b->c) = 20
      expect(t.get('a')).toBe(15);
      expect(t.get('b')).toBe(25);
      expect(t.get('c')).toBe(20);
    });
    it('counts self-loops once', () => {
      const t = getChordCategoryTotals(
        [{ id: 'a', label: 'A' }],
        [{ source: 'a', target: 'a', value: 10 }],
      );
      expect(t.get('a')).toBe(10);
    });
    it('skips non-finite / non-positive flows', () => {
      const t = getChordCategoryTotals(categories, [
        { source: 'a', target: 'b', value: Number.NaN },
        { source: 'a', target: 'b', value: -5 },
        { source: 'a', target: 'b', value: 0 },
        { source: 'a', target: 'b', value: 10 },
      ]);
      expect(t.get('a')).toBe(10);
      expect(t.get('b')).toBe(10);
    });
    it('skips flows with unknown source / target ids', () => {
      const t = getChordCategoryTotals(categories, [
        { source: 'a', target: 'unknown', value: 10 },
        { source: 'unknown', target: 'b', value: 5 },
      ]);
      expect(t.get('a')).toBe(0);
      expect(t.get('b')).toBe(0);
    });
    it('initialises totals at 0 for every category', () => {
      const t = getChordCategoryTotals(categories, []);
      expect(t.get('a')).toBe(0);
      expect(t.get('b')).toBe(0);
      expect(t.get('c')).toBe(0);
    });
  });

  describe('chordPolarToCartesian', () => {
    it('returns the centre at radius 0', () => {
      const p = chordPolarToCartesian(100, 100, 0, 0);
      expect(p.x).toBeCloseTo(100);
      expect(p.y).toBeCloseTo(100);
    });
    it('places angle 0 to the right', () => {
      const p = chordPolarToCartesian(0, 0, 10, 0);
      expect(p.x).toBeCloseTo(10);
      expect(p.y).toBeCloseTo(0);
    });
    it('places angle -pi/2 above the centre', () => {
      const p = chordPolarToCartesian(0, 0, 10, -Math.PI / 2);
      expect(p.x).toBeCloseTo(0);
      expect(p.y).toBeCloseTo(-10);
    });
  });

  describe('buildChordArcPath', () => {
    it('emits a closed annular arc', () => {
      const path = buildChordArcPath(
        100,
        100,
        40,
        50,
        0,
        Math.PI / 2,
      );
      expect(path).toMatch(/^M /);
      expect(path).toMatch(/Z$/);
      expect((path.match(/A /g) || []).length).toBe(2);
    });
    it('returns "" when angles collapse', () => {
      expect(
        buildChordArcPath(100, 100, 40, 50, 1, 1),
      ).toBe('');
    });
    it('returns "" when inner >= outer', () => {
      expect(
        buildChordArcPath(100, 100, 50, 50, 0, 1),
      ).toBe('');
    });
    it('uses largeArc flag for sweeps > pi', () => {
      const path = buildChordArcPath(
        100,
        100,
        40,
        50,
        0,
        Math.PI + 1,
      );
      expect(path).toContain('A 50 50 0 1 1');
    });
  });

  describe('buildChordRibbonPath', () => {
    it('emits a closed bezier ribbon', () => {
      const path = buildChordRibbonPath(
        100,
        100,
        50,
        0,
        0.3,
        Math.PI / 2,
        Math.PI / 2 + 0.3,
      );
      expect(path).toMatch(/^M /);
      expect(path).toMatch(/Z$/);
      expect((path.match(/Q /g) || []).length).toBe(2);
      expect((path.match(/A /g) || []).length).toBe(2);
    });
    it('returns "" for zero inner radius', () => {
      expect(
        buildChordRibbonPath(100, 100, 0, 0, 0.3, 1, 1.3),
      ).toBe('');
    });
    it('returns "" when both arcs collapse', () => {
      expect(
        buildChordRibbonPath(100, 100, 50, 0, 0, 1, 1),
      ).toBe('');
    });
  });

  describe('buildChordLayout', () => {
    it('emits one arc per active category', () => {
      const { arcs } = buildChordLayout(
        categories,
        flows,
        DEFAULT_CHART_CHORD_ARC_GAP,
      );
      expect(arcs.length).toBe(3);
      expect(arcs.map((a) => a.id)).toEqual(['a', 'b', 'c']);
    });
    it('skips zero-total categories', () => {
      const { arcs } = buildChordLayout(
        [...categories, { id: 'empty', label: 'Empty' }],
        flows,
        DEFAULT_CHART_CHORD_ARC_GAP,
      );
      expect(arcs.find((a) => a.id === 'empty')).toBeUndefined();
    });
    it('returns empty layout when no flows or zero grand total', () => {
      const { arcs, ribbons } = buildChordLayout(
        categories,
        [],
        DEFAULT_CHART_CHORD_ARC_GAP,
      );
      expect(arcs).toEqual([]);
      expect(ribbons).toEqual([]);
    });
    it('arc sizes are proportional to category totals', () => {
      const { arcs } = buildChordLayout(
        categories,
        flows,
        0,
      );
      // totals: a=15, b=25, c=20; sum=60; with gap=0, sizes proportional
      const a = arcs.find((x) => x.id === 'a')!;
      const b = arcs.find((x) => x.id === 'b')!;
      const aSize = a.end - a.start;
      const bSize = b.end - b.start;
      expect(bSize / aSize).toBeCloseTo(25 / 15, 5);
    });
    it('emits one ribbon per positive-value flow', () => {
      const { ribbons } = buildChordLayout(
        categories,
        flows,
        DEFAULT_CHART_CHORD_ARC_GAP,
      );
      expect(ribbons.length).toBe(flows.length);
    });
    it('ribbon sub-arcs are within their category arcs', () => {
      const { arcs, ribbons } = buildChordLayout(
        categories,
        flows,
        DEFAULT_CHART_CHORD_ARC_GAP,
      );
      const tol = 1e-9;
      for (const r of ribbons) {
        const sa = arcs.find((a) => a.id === r.source)!;
        const ta = arcs.find((a) => a.id === r.target)!;
        expect(r.sourceStart).toBeGreaterThanOrEqual(sa.start - tol);
        expect(r.sourceEnd).toBeLessThanOrEqual(sa.end + tol);
        expect(r.targetStart).toBeGreaterThanOrEqual(ta.start - tol);
        expect(r.targetEnd).toBeLessThanOrEqual(ta.end + tol);
      }
    });
    it('drops flows with unknown source / target', () => {
      const { ribbons } = buildChordLayout(
        categories,
        [
          ...flows,
          { source: 'a', target: 'unknown', value: 5 },
        ],
        DEFAULT_CHART_CHORD_ARC_GAP,
      );
      expect(ribbons.length).toBe(flows.length);
    });
  });

  describe('describeChordChart', () => {
    it('returns "No data" for empty input', () => {
      expect(describeChordChart([], [])).toBe('No data');
      expect(describeChordChart(categories, [])).toBe(
        'No data',
      );
    });
    it('summarises category totals', () => {
      const text = describeChordChart(categories, flows);
      expect(text).toContain('3 categories');
      expect(text).toContain('3 flows');
      expect(text).toContain('A 15');
      expect(text).toContain('B 25');
    });
    it('honours formatValue', () => {
      const text = describeChordChart(
        categories,
        flows,
        (v) => `${v}u`,
      );
      expect(text).toContain('15u');
    });
  });

  it('exports default constants', () => {
    expect(DEFAULT_CHART_CHORD_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_CHORD_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_CHORD_PADDING).toBeGreaterThan(0);
    expect(DEFAULT_CHART_CHORD_ARC_WIDTH).toBeGreaterThan(0);
    expect(
      DEFAULT_CHART_CHORD_ARC_GAP,
    ).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_CHART_CHORD_RIBBON_OPACITY).toBeGreaterThan(
      0,
    );
    expect(DEFAULT_CHART_CHORD_CATEGORY_COLOR).toMatch(/^#/);
  });
});

describe('<ChartChord />', () => {
  it('renders a region with role + aria-label', () => {
    render(
      <ChartChord categories={categories} flows={flows} />,
    );
    const root = screen.getByRole('region', {
      name: 'Chord diagram',
    });
    expect(root).toBeInTheDocument();
    expect(root).toHaveAttribute('data-section', 'chart-chord');
    expect(root).toHaveAttribute('data-category-count', '3');
    expect(root).toHaveAttribute('data-flow-count', '3');
    expect(root).toHaveAttribute('data-arc-count', '3');
    expect(root).toHaveAttribute('data-ribbon-count', '3');
  });

  it('renders a custom aria-label', () => {
    render(
      <ChartChord
        categories={categories}
        flows={flows}
        ariaLabel="Trade flows"
      />,
    );
    expect(
      screen.getByRole('region', { name: 'Trade flows' }),
    ).toBeInTheDocument();
  });

  it('renders one arc per category', () => {
    const { container } = render(
      <ChartChord categories={categories} flows={flows} />,
    );
    const arcs = container.querySelectorAll(
      '[data-section="chart-chord-arc"]',
    );
    expect(arcs.length).toBe(categories.length);
  });

  it('renders one ribbon per flow', () => {
    const { container } = render(
      <ChartChord categories={categories} flows={flows} />,
    );
    const ribbons = container.querySelectorAll(
      '[data-section="chart-chord-ribbon"]',
    );
    expect(ribbons.length).toBe(flows.length);
  });

  it('mirrors category metadata on the arc group', () => {
    const { container } = render(
      <ChartChord categories={categories} flows={flows} />,
    );
    const bArc = container.querySelector(
      '[data-section="chart-chord-arc"][data-category-id="b"]',
    );
    expect(bArc?.getAttribute('data-category-color')).toBe(
      '#ff00aa',
    );
    expect(bArc?.getAttribute('data-category-total')).toBe('25');
  });

  it('uses default colour when category has none', () => {
    const { container } = render(
      <ChartChord categories={categories} flows={flows} />,
    );
    const a = container.querySelector(
      '[data-section="chart-chord-arc"][data-category-id="a"]',
    );
    expect(a?.getAttribute('data-category-color')).toBe(
      DEFAULT_CHART_CHORD_CATEGORY_COLOR,
    );
  });

  it('mirrors flow metadata on the ribbon group', () => {
    const { container } = render(
      <ChartChord categories={categories} flows={flows} />,
    );
    const ribbon = container.querySelector(
      '[data-section="chart-chord-ribbon"][data-source-id="a"][data-target-id="b"]',
    );
    expect(ribbon?.getAttribute('data-ribbon-value')).toBe('10');
  });

  it('ribbon colour matches its source category', () => {
    const { container } = render(
      <ChartChord categories={categories} flows={flows} />,
    );
    const ribbon = container.querySelector(
      '[data-section="chart-chord-ribbon"][data-source-id="b"]',
    );
    expect(ribbon?.getAttribute('data-ribbon-color')).toBe(
      '#ff00aa',
    );
  });

  it('renders labels by default', () => {
    const { container } = render(
      <ChartChord categories={categories} flows={flows} />,
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-chord-arc-label"]',
    );
    expect(labels.length).toBe(3);
  });

  it('suppresses labels when showLabels=false', () => {
    const { container } = render(
      <ChartChord
        categories={categories}
        flows={flows}
        showLabels={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-chord-arc-label"]',
      ),
    ).toBeNull();
  });

  it('shows category tooltip on arc hover', () => {
    const { container } = render(
      <ChartChord categories={categories} flows={flows} />,
    );
    const arc = container.querySelector(
      '[data-section="chart-chord-arc-path"][data-category-id="a"]',
    );
    fireEvent.mouseEnter(arc!);
    const tip = container.querySelector(
      '[data-section="chart-chord-tooltip"]',
    );
    expect(tip).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-chord-tooltip-label"]',
      )?.textContent,
    ).toBe('A');
    expect(
      container.querySelector(
        '[data-section="chart-chord-tooltip-total"]',
      )?.textContent,
    ).toContain('15');
  });

  it('shows ribbon tooltip on ribbon hover', () => {
    const { container } = render(
      <ChartChord categories={categories} flows={flows} />,
    );
    const ribbon = container.querySelector(
      '[data-section="chart-chord-ribbon-path"]',
    );
    fireEvent.mouseEnter(ribbon!);
    const tip = container.querySelector(
      '[data-section="chart-chord-ribbon-tooltip"]',
    );
    expect(tip).not.toBeNull();
  });

  it('hides tooltip on mouse-leave', () => {
    const { container } = render(
      <ChartChord categories={categories} flows={flows} />,
    );
    const arc = container.querySelector(
      '[data-section="chart-chord-arc-path"]',
    );
    fireEvent.mouseEnter(arc!);
    fireEvent.mouseLeave(arc!);
    expect(
      container.querySelector(
        '[data-section="chart-chord-tooltip"]',
      ),
    ).toBeNull();
  });

  it('suppresses tooltip when showTooltip=false', () => {
    const { container } = render(
      <ChartChord
        categories={categories}
        flows={flows}
        showTooltip={false}
      />,
    );
    const arc = container.querySelector(
      '[data-section="chart-chord-arc-path"]',
    );
    fireEvent.mouseEnter(arc!);
    expect(
      container.querySelector(
        '[data-section="chart-chord-tooltip"]',
      ),
    ).toBeNull();
  });

  it('highlights connected ribbons on category hover', () => {
    const { container } = render(
      <ChartChord categories={categories} flows={flows} />,
    );
    const aArc = container.querySelector(
      '[data-section="chart-chord-arc-path"][data-category-id="a"]',
    );
    fireEvent.mouseEnter(aArc!);
    const abRibbon = container.querySelector(
      '[data-section="chart-chord-ribbon"][data-source-id="a"][data-target-id="b"]',
    );
    expect(abRibbon?.getAttribute('data-highlighted')).toBe(
      'true',
    );
    const bcRibbon = container.querySelector(
      '[data-section="chart-chord-ribbon"][data-source-id="b"][data-target-id="c"]',
    );
    expect(bcRibbon?.getAttribute('data-highlighted')).toBe(
      'false',
    );
  });

  it('does not dim when highlightOnHover=false', () => {
    const { container } = render(
      <ChartChord
        categories={categories}
        flows={flows}
        highlightOnHover={false}
      />,
    );
    const aArc = container.querySelector(
      '[data-section="chart-chord-arc-path"][data-category-id="a"]',
    );
    fireEvent.mouseEnter(aArc!);
    const bcRibbon = container.querySelector(
      '[data-section="chart-chord-ribbon-path"][data-ribbon-index="2"]',
    );
    const op = parseFloat(
      bcRibbon?.getAttribute('fill-opacity') ?? '0',
    );
    expect(op).toBeCloseTo(DEFAULT_CHART_CHORD_RIBBON_OPACITY);
  });

  it('invokes onCategoryClick with category + total', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ChartChord
        categories={categories}
        flows={flows}
        onCategoryClick={onClick}
      />,
    );
    const arc = container.querySelector(
      '[data-section="chart-chord-arc-path"][data-category-id="b"]',
    );
    fireEvent.click(arc!);
    expect(onClick).toHaveBeenCalledTimes(1);
    const arg = onClick.mock.calls[0]?.[0];
    expect(arg?.category?.id).toBe('b');
    expect(arg?.total).toBe(25);
  });

  it('invokes onFlowClick with flow + source + target', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ChartChord
        categories={categories}
        flows={flows}
        onFlowClick={onClick}
      />,
    );
    const ribbon = container.querySelector(
      '[data-section="chart-chord-ribbon-path"]',
    );
    fireEvent.click(ribbon!);
    expect(onClick).toHaveBeenCalledTimes(1);
    const arg = onClick.mock.calls[0]?.[0];
    expect(arg?.flow?.source).toBe('a');
    expect(arg?.source?.id).toBe('a');
    expect(arg?.target?.id).toBe('b');
  });

  it('exposes role=graphics-symbol + aria-label per arc + ribbon', () => {
    const { container } = render(
      <ChartChord categories={categories} flows={flows} />,
    );
    const arc = container.querySelector(
      '[data-section="chart-chord-arc-path"]',
    );
    expect(arc?.getAttribute('role')).toBe('graphics-symbol');
    expect(arc?.getAttribute('aria-label')).toContain('total');
    const ribbon = container.querySelector(
      '[data-section="chart-chord-ribbon-path"]',
    );
    expect(ribbon?.getAttribute('role')).toBe('graphics-symbol');
  });

  it('mirrors animate flag on the root', () => {
    const { container, rerender } = render(
      <ChartChord categories={categories} flows={flows} />,
    );
    expect(
      container
        .querySelector('[data-section="chart-chord"]')
        ?.getAttribute('data-animate'),
    ).toBe('true');
    rerender(
      <ChartChord
        categories={categories}
        flows={flows}
        animate={false}
      />,
    );
    expect(
      container
        .querySelector('[data-section="chart-chord"]')
        ?.getAttribute('data-animate'),
    ).toBe('false');
  });

  it('mirrors size on the svg', () => {
    const { container } = render(
      <ChartChord
        categories={categories}
        flows={flows}
        width={500}
        height={500}
      />,
    );
    const svg = container.querySelector(
      '[data-section="chart-chord-svg"]',
    );
    expect(svg?.getAttribute('width')).toBe('500');
    expect(svg?.getAttribute('height')).toBe('500');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 500 500');
  });

  it('renders auto-generated ARIA description by default', () => {
    const { container } = render(
      <ChartChord categories={categories} flows={flows} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-chord-aria-desc"]',
    );
    expect(desc?.textContent).toContain('3 categories');
  });

  it('honours ariaDescription override', () => {
    const { container } = render(
      <ChartChord
        categories={categories}
        flows={flows}
        ariaDescription="custom"
      />,
    );
    const desc = container.querySelector(
      '[data-section="chart-chord-aria-desc"]',
    );
    expect(desc?.textContent).toBe('custom');
  });

  it('handles empty data without crashing', () => {
    const { container } = render(
      <ChartChord categories={[]} flows={[]} />,
    );
    expect(
      container.querySelector('[data-section="chart-chord"]'),
    ).not.toBeNull();
    expect(
      container.querySelectorAll(
        '[data-section="chart-chord-arc"]',
      ).length,
    ).toBe(0);
  });

  it('forwards ref to the root region', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartChord
        ref={ref}
        categories={categories}
        flows={flows}
      />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-chord',
    );
  });

  it('has a stable displayName', () => {
    expect(ChartChord.displayName).toBe('ChartChord');
  });
});
