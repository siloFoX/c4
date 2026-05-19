import { afterEach, describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import {
  ChartSunburst,
  computeSunburstLayout,
  describeSunburstChart,
  flattenSunburstHierarchy,
  getSunburstDefaultColor,
  getSunburstMaxDepth,
  getSunburstNodeValue,
  polarToCartesian,
  DEFAULT_CHART_SUNBURST_WIDTH,
  DEFAULT_CHART_SUNBURST_HEIGHT,
  DEFAULT_CHART_SUNBURST_PADDING,
  DEFAULT_CHART_SUNBURST_CENTER_RADIUS,
  DEFAULT_CHART_SUNBURST_FILL_OPACITY,
  DEFAULT_CHART_SUNBURST_LABEL_MIN_ARC,
  DEFAULT_CHART_SUNBURST_PALETTE,
  type ChartSunburstNode,
} from './chart-sunburst';

afterEach(() => cleanup());

const ROOT: ChartSunburstNode = {
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
      children: [
        { id: 'b1', label: 'B1', value: 30 },
      ],
    },
    { id: 'c', label: 'C', value: 40 },
  ],
};

describe('chart-sunburst constants', () => {
  it('exports the documented defaults', () => {
    expect(DEFAULT_CHART_SUNBURST_WIDTH).toBe(400);
    expect(DEFAULT_CHART_SUNBURST_HEIGHT).toBe(400);
    expect(DEFAULT_CHART_SUNBURST_PADDING).toBe(24);
    expect(DEFAULT_CHART_SUNBURST_CENTER_RADIUS).toBe(36);
    expect(DEFAULT_CHART_SUNBURST_FILL_OPACITY).toBeCloseTo(0.85);
    expect(DEFAULT_CHART_SUNBURST_LABEL_MIN_ARC).toBeCloseTo(0.18);
    expect(DEFAULT_CHART_SUNBURST_PALETTE.length).toBe(10);
  });
});

describe('getSunburstDefaultColor', () => {
  it('returns palette[index] + modulo + invalid fallback', () => {
    expect(getSunburstDefaultColor(0)).toBe(DEFAULT_CHART_SUNBURST_PALETTE[0]);
    expect(getSunburstDefaultColor(DEFAULT_CHART_SUNBURST_PALETTE.length)).toBe(
      DEFAULT_CHART_SUNBURST_PALETTE[0]
    );
    expect(getSunburstDefaultColor(-1)).toBe(DEFAULT_CHART_SUNBURST_PALETTE[0]);
    expect(getSunburstDefaultColor(Number.NaN)).toBe(
      DEFAULT_CHART_SUNBURST_PALETTE[0]
    );
  });
});

describe('polarToCartesian', () => {
  it('center when radius=0; right at 0; down at pi/2', () => {
    expect(polarToCartesian(5, 7, 0, 1)).toEqual({ x: 5, y: 7 });
    const r = polarToCartesian(0, 0, 10, 0);
    expect(r.x).toBeCloseTo(10);
    expect(r.y).toBeCloseTo(0);
    const d = polarToCartesian(0, 0, 10, Math.PI / 2);
    expect(d.y).toBeCloseTo(10);
  });
});

describe('getSunburstNodeValue', () => {
  it('leaf with explicit value returns the value', () => {
    expect(getSunburstNodeValue({ id: 'l', label: 'L', value: 5 })).toBe(5);
  });
  it('parent without value sums children', () => {
    expect(getSunburstNodeValue(ROOT)).toBe(10 + 20 + 30 + 40);
  });
  it('parent with explicit value falls back to child sum when children present', () => {
    expect(
      getSunburstNodeValue({
        id: 'p',
        label: 'P',
        value: 100,
        children: [{ id: 'c', label: 'C', value: 7 }],
      })
    ).toBe(7);
  });
  it('returns 0 for childless node without value', () => {
    expect(getSunburstNodeValue({ id: 'x', label: 'X' })).toBe(0);
  });
});

describe('flattenSunburstHierarchy', () => {
  it('returns one entry per node with depth + path', () => {
    const flat = flattenSunburstHierarchy(ROOT);
    expect(flat).toHaveLength(7);
    expect(flat[0]!.id).toBe('root');
    expect(flat[0]!.depth).toBe(0);
    const a = flat.find((n) => n.id === 'a')!;
    expect(a.depth).toBe(1);
    expect(a.parentId).toBe('root');
    expect(a.path).toEqual(['root', 'a']);
    const a1 = flat.find((n) => n.id === 'a1')!;
    expect(a1.path).toEqual(['root', 'a', 'a1']);
    expect(a1.isLeaf).toBe(true);
  });
  it('null root returns []', () => {
    expect(flattenSunburstHierarchy(null)).toEqual([]);
  });
});

describe('getSunburstMaxDepth', () => {
  it('returns the deepest depth value', () => {
    const flat = flattenSunburstHierarchy(ROOT);
    expect(getSunburstMaxDepth(flat)).toBe(2);
  });
  it('empty -> 0', () => {
    expect(getSunburstMaxDepth([])).toBe(0);
  });
});

describe('computeSunburstLayout', () => {
  const cx = 200;
  const cy = 200;
  const outerRadius = 160;
  const centerRadius = 36;

  it('returns 0 arcs when root is null', () => {
    const r = computeSunburstLayout({
      root: null,
      focusPath: [],
      cx,
      cy,
      outerRadius,
      centerRadius,
      fallbackColor: '#999',
    });
    expect(r.arcs).toEqual([]);
    expect(r.focusNode).toBeNull();
  });

  it('produces arcs for every visible node when focus = root', () => {
    const r = computeSunburstLayout({
      root: ROOT,
      focusPath: ['root'],
      cx,
      cy,
      outerRadius,
      centerRadius,
      fallbackColor: '#999',
    });
    // expected: root + a + b + c + a1 + a2 + b1 = 7 arcs
    expect(r.arcs).toHaveLength(7);
    expect(r.focusNode?.id).toBe('root');
    expect(r.focusValue).toBe(100);
  });

  it('arc spans for top-level children sum to 2pi', () => {
    const r = computeSunburstLayout({
      root: ROOT,
      focusPath: ['root'],
      cx,
      cy,
      outerRadius,
      centerRadius,
      fallbackColor: '#999',
    });
    let sum = 0;
    for (const arc of r.arcs) {
      if (arc.depth === 1) sum += arc.endAngle - arc.startAngle;
    }
    expect(sum).toBeCloseTo(Math.PI * 2);
  });

  it('share equals value / focus value', () => {
    const r = computeSunburstLayout({
      root: ROOT,
      focusPath: ['root'],
      cx,
      cy,
      outerRadius,
      centerRadius,
      fallbackColor: '#999',
    });
    const c = r.arcs.find((a) => a.id === 'c')!;
    expect(c.share).toBeCloseTo(40 / 100);
    expect(c.globalShare).toBeCloseTo(40 / 100);
  });

  it('arc rings step by ringWidth', () => {
    const r = computeSunburstLayout({
      root: ROOT,
      focusPath: ['root'],
      cx,
      cy,
      outerRadius,
      centerRadius,
      fallbackColor: '#999',
    });
    expect(r.ringWidth).toBeCloseTo((outerRadius - centerRadius) / 3);
    const rootArc = r.arcs.find((a) => a.id === 'root')!;
    expect(rootArc.innerRadius).toBeCloseTo(centerRadius);
    expect(rootArc.outerRadius).toBeCloseTo(centerRadius + r.ringWidth);
    const aArc = r.arcs.find((a) => a.id === 'a')!;
    expect(aArc.innerRadius).toBeCloseTo(centerRadius + r.ringWidth);
  });

  it('zooming into "a" only renders descendants of a', () => {
    const r = computeSunburstLayout({
      root: ROOT,
      focusPath: ['root', 'a'],
      cx,
      cy,
      outerRadius,
      centerRadius,
      fallbackColor: '#999',
    });
    expect(r.focusNode?.id).toBe('a');
    expect(r.focusValue).toBe(30);
    const ids = new Set(r.arcs.map((a) => a.id));
    expect(ids.has('a')).toBe(true);
    expect(ids.has('a1')).toBe(true);
    expect(ids.has('a2')).toBe(true);
    expect(ids.has('b')).toBe(false);
    expect(ids.has('c')).toBe(false);
  });

  it('zoomed-in subtree spans the full 2pi', () => {
    const r = computeSunburstLayout({
      root: ROOT,
      focusPath: ['root', 'a'],
      cx,
      cy,
      outerRadius,
      centerRadius,
      fallbackColor: '#999',
    });
    const aArc = r.arcs.find((arc) => arc.id === 'a')!;
    expect(aArc.endAngle - aArc.startAngle).toBeCloseTo(Math.PI * 2);
    let childSum = 0;
    for (const arc of r.arcs) {
      if (arc.parentId === 'a') childSum += arc.endAngle - arc.startAngle;
    }
    expect(childSum).toBeCloseTo(Math.PI * 2);
  });

  it('unknown focus path falls back to root', () => {
    const r = computeSunburstLayout({
      root: ROOT,
      focusPath: ['nope'],
      cx,
      cy,
      outerRadius,
      centerRadius,
      fallbackColor: '#999',
    });
    expect(r.focusNode?.id).toBe('root');
  });

  it('every arc emits a pathD string', () => {
    const r = computeSunburstLayout({
      root: ROOT,
      focusPath: ['root'],
      cx,
      cy,
      outerRadius,
      centerRadius,
      fallbackColor: '#999',
    });
    for (const arc of r.arcs) {
      expect(typeof arc.pathD).toBe('string');
      expect(arc.pathD.length).toBeGreaterThan(0);
    }
  });

  it('non-positive outer / zero focus -> empty arcs', () => {
    const r = computeSunburstLayout({
      root: ROOT,
      focusPath: ['root'],
      cx,
      cy,
      outerRadius: 0,
      centerRadius,
      fallbackColor: '#999',
    });
    expect(r.arcs).toEqual([]);
  });

  it('per-node color override beats palette', () => {
    const colored: ChartSunburstNode = {
      id: 'r',
      label: 'R',
      children: [
        { id: 'x', label: 'X', value: 1, color: '#abcdef' },
      ],
    };
    const r = computeSunburstLayout({
      root: colored,
      focusPath: ['r'],
      cx,
      cy,
      outerRadius,
      centerRadius,
      fallbackColor: '#999',
    });
    const x = r.arcs.find((a) => a.id === 'x')!;
    expect(x.color).toBe('#abcdef');
  });
});

describe('describeSunburstChart', () => {
  it('returns "No data" for null / zero-value', () => {
    expect(describeSunburstChart(null, [])).toBe('No data');
    expect(
      describeSunburstChart({ id: 'r', label: 'R' }, ['r'])
    ).toBe('No data');
  });
  it('includes node count + level count + total + focus', () => {
    const d = describeSunburstChart(ROOT, ['root']);
    expect(d).toContain('Sunburst');
    expect(d).toContain('7 nodes');
    expect(d).toContain('3 levels');
    expect(d).toContain('Root');
  });
});

describe('<ChartSunburst> component', () => {
  it('renders region + custom aria-label', () => {
    const { getByRole } = render(
      <ChartSunburst root={ROOT} ariaLabel="Test sunburst" />
    );
    expect(getByRole('region', { name: 'Test sunburst' })).toBeTruthy();
  });

  it('renders one arc per visible node when focused on root', () => {
    const { container } = render(<ChartSunburst root={ROOT} />);
    expect(
      container.querySelectorAll('[data-section="chart-sunburst-arc"]').length
    ).toBe(7);
  });

  it('arc data attrs carry id / depth / parent / value / share', () => {
    const { container } = render(<ChartSunburst root={ROOT} />);
    const a = container.querySelector('[data-arc-id="a"]') as HTMLElement;
    expect(a.getAttribute('data-arc-depth')).toBe('1');
    expect(a.getAttribute('data-arc-parent')).toBe('root');
    expect(a.getAttribute('data-arc-value')).toBe('30');
    expect(a.getAttribute('data-arc-share')).toBeTruthy();
    expect(a.getAttribute('data-arc-global-share')).toBeTruthy();
    expect(a.getAttribute('data-arc-color')).toBeTruthy();
  });

  it('arc path is role=graphics-symbol + tabIndex=0 + aria-label', () => {
    const { container } = render(<ChartSunburst root={ROOT} />);
    const path = container.querySelector(
      '[data-section="chart-sunburst-path"]'
    ) as SVGPathElement;
    expect(path.getAttribute('role')).toBe('graphics-symbol');
    expect(path.getAttribute('tabindex')).toBe('0');
    expect(path.getAttribute('aria-label')).toContain('Root');
  });

  it('root mirrors node-count + arc-count + focus + max-depth + animate', () => {
    const { container } = render(<ChartSunburst root={ROOT} />);
    const root = container.querySelector('[data-section="chart-sunburst"]');
    expect(root?.getAttribute('data-node-count')).toBe('7');
    expect(root?.getAttribute('data-arc-count')).toBe('7');
    expect(root?.getAttribute('data-focus-id')).toBe('root');
    expect(root?.getAttribute('data-focus-depth')).toBe('0');
    expect(root?.getAttribute('data-max-depth')).toBe('2');
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('click on an arc updates the focus (uncontrolled)', () => {
    const { container } = render(<ChartSunburst root={ROOT} />);
    const a = container.querySelector('[data-arc-id="a"]') as HTMLElement;
    fireEvent.click(a);
    const root = container.querySelector('[data-section="chart-sunburst"]');
    expect(root?.getAttribute('data-focus-id')).toBe('a');
    // After zoom, only a + its descendants render
    expect(
      container.querySelectorAll('[data-section="chart-sunburst-arc"]').length
    ).toBe(3);
  });

  it('onFocusPathChange fires with new path', () => {
    const onFocusPathChange = vi.fn();
    const { container } = render(
      <ChartSunburst
        root={ROOT}
        onFocusPathChange={onFocusPathChange}
      />
    );
    fireEvent.click(
      container.querySelector('[data-arc-id="b"]')! as HTMLElement
    );
    expect(onFocusPathChange).toHaveBeenCalledTimes(1);
    expect(onFocusPathChange.mock.calls[0]![0]).toEqual(['root', 'b']);
  });

  it('onArcClick fires with becameFocus flag', () => {
    const onArcClick = vi.fn();
    const { container } = render(
      <ChartSunburst root={ROOT} onArcClick={onArcClick} />
    );
    fireEvent.click(
      container.querySelector('[data-arc-id="a"]')! as HTMLElement
    );
    expect(onArcClick).toHaveBeenCalledTimes(1);
    expect(onArcClick.mock.calls[0]![0].becameFocus).toBe(true);
    expect(onArcClick.mock.calls[0]![0].node.id).toBe('a');
  });

  it('controlled focusPath wins over internal state', () => {
    const { container } = render(
      <ChartSunburst root={ROOT} focusPath={['root', 'b']} />
    );
    const root = container.querySelector('[data-section="chart-sunburst"]');
    expect(root?.getAttribute('data-focus-id')).toBe('b');
  });

  it('center disc shows the focus label + value', () => {
    const { container } = render(<ChartSunburst root={ROOT} />);
    expect(
      container.querySelector('[data-section="chart-sunburst-center-label"]')
        ?.textContent
    ).toBe('Root');
    expect(
      container.querySelector('[data-section="chart-sunburst-center-value"]')
        ?.textContent
    ).toBe('100');
  });

  it('clicking the center disc zooms out one level', () => {
    const { container } = render(
      <ChartSunburst root={ROOT} defaultFocusPath={['root', 'a']} />
    );
    fireEvent.click(
      container.querySelector('[data-section="chart-sunburst-center"]')! as HTMLElement
    );
    const root = container.querySelector('[data-section="chart-sunburst"]');
    expect(root?.getAttribute('data-focus-id')).toBe('root');
  });

  it('showCenterLabel=false suppresses the center group', () => {
    const { container } = render(
      <ChartSunburst root={ROOT} showCenterLabel={false} />
    );
    expect(
      container.querySelector('[data-section="chart-sunburst-center"]')
    ).toBeNull();
  });

  it('arc label renders when arc is large enough', () => {
    const { container } = render(<ChartSunburst root={ROOT} labelMinArc={0} />);
    const labels = container.querySelectorAll(
      '[data-section="chart-sunburst-arc-label"]'
    );
    expect(labels.length).toBeGreaterThan(0);
  });

  it('showLabels=false suppresses arc labels', () => {
    const { container } = render(
      <ChartSunburst root={ROOT} showLabels={false} labelMinArc={0} />
    );
    expect(
      container.querySelector('[data-section="chart-sunburst-arc-label"]')
    ).toBeNull();
  });

  it('labelMinArc above all arc spans hides labels', () => {
    const { container } = render(
      <ChartSunburst root={ROOT} labelMinArc={Math.PI * 3} />
    );
    expect(
      container.querySelector('[data-section="chart-sunburst-arc-label"]')
    ).toBeNull();
  });

  it('tooltip opens on arc hover with path + value + share + global', () => {
    const { container } = render(<ChartSunburst root={ROOT} />);
    const a = container.querySelector('[data-arc-id="a1"]') as HTMLElement;
    fireEvent.mouseEnter(a);
    expect(
      container.querySelector('[data-section="chart-sunburst-tooltip"]')
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-sunburst-tooltip-label"]'
      )?.textContent
    ).toContain('root / a / a1');
    expect(
      container.querySelector(
        '[data-section="chart-sunburst-tooltip-value"]'
      )?.textContent
    ).toBe('10');
    expect(
      container.querySelector(
        '[data-section="chart-sunburst-tooltip-share"]'
      )?.textContent
    ).toContain('10%');
    expect(
      container.querySelector(
        '[data-section="chart-sunburst-tooltip-global"]'
      )?.textContent
    ).toContain('10%');
  });

  it('tooltip hides on mouseleave', () => {
    const { container } = render(<ChartSunburst root={ROOT} />);
    const a = container.querySelector('[data-arc-id="a"]') as HTMLElement;
    fireEvent.mouseEnter(a);
    expect(
      container.querySelector('[data-section="chart-sunburst-tooltip"]')
    ).not.toBeNull();
    fireEvent.mouseLeave(a);
    expect(
      container.querySelector('[data-section="chart-sunburst-tooltip"]')
    ).toBeNull();
  });

  it('showTooltip=false suppresses the tooltip', () => {
    const { container } = render(
      <ChartSunburst root={ROOT} showTooltip={false} />
    );
    fireEvent.mouseEnter(
      container.querySelector('[data-arc-id="a"]')! as HTMLElement
    );
    expect(
      container.querySelector('[data-section="chart-sunburst-tooltip"]')
    ).toBeNull();
  });

  it('formatValue + formatPercent reach tooltip + aria-label', () => {
    const { container } = render(
      <ChartSunburst
        root={ROOT}
        formatValue={(v) => `${v}u`}
        formatPercent={(p) => `${(p * 100).toFixed(1)}pct`}
      />
    );
    const path = container.querySelector(
      '[data-section="chart-sunburst-path"]'
    ) as SVGPathElement;
    expect(path.getAttribute('aria-label')).toContain('u');
    expect(path.getAttribute('aria-label')).toContain('pct');
  });

  it('data-hovered mirrors hover state', () => {
    const { container } = render(<ChartSunburst root={ROOT} />);
    const a = container.querySelector('[data-arc-id="a"]') as HTMLElement;
    expect(a.getAttribute('data-hovered')).toBe('false');
    fireEvent.mouseEnter(a);
    expect(a.getAttribute('data-hovered')).toBe('true');
    fireEvent.mouseLeave(a);
    expect(a.getAttribute('data-hovered')).toBe('false');
  });

  it('focus arc data-arc-is-focus="true" for the focused node', () => {
    const { container } = render(<ChartSunburst root={ROOT} />);
    const focus = container.querySelector('[data-arc-is-focus="true"]');
    expect(focus?.getAttribute('data-arc-id')).toBe('root');
  });

  it('auto ARIA description renders by default', () => {
    const { container } = render(<ChartSunburst root={ROOT} />);
    expect(
      container.querySelector('[data-section="chart-sunburst-aria-desc"]')
        ?.textContent
    ).toContain('7 nodes');
  });

  it('ariaDescription override beats auto', () => {
    const { container } = render(
      <ChartSunburst root={ROOT} ariaDescription="Override" />
    );
    expect(
      container.querySelector('[data-section="chart-sunburst-aria-desc"]')
        ?.textContent
    ).toBe('Override');
  });

  it('SVG mirrors width / height / viewBox', () => {
    const { container } = render(
      <ChartSunburst root={ROOT} width={500} height={500} />
    );
    const svg = container.querySelector(
      '[data-section="chart-sunburst-svg"]'
    ) as SVGElement;
    expect(svg.getAttribute('width')).toBe('500');
    expect(svg.getAttribute('height')).toBe('500');
    expect(svg.getAttribute('viewBox')).toBe('0 0 500 500');
  });

  it('null root renders without crashing', () => {
    const { container } = render(<ChartSunburst root={null} />);
    expect(
      container.querySelectorAll('[data-section="chart-sunburst-arc"]').length
    ).toBe(0);
    expect(
      container.querySelector('[data-section="chart-sunburst-aria-desc"]')
        ?.textContent
    ).toBe('No data');
  });

  it('forwards ref to root', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartSunburst root={ROOT} ref={ref} />);
    expect(ref.current?.dataset.section).toBe('chart-sunburst');
  });

  it('has stable displayName', () => {
    expect(ChartSunburst.displayName).toBe('ChartSunburst');
  });

  it('data-animate mirrors prop', () => {
    const { container } = render(
      <ChartSunburst root={ROOT} animate={false} />
    );
    expect(
      container.querySelector('[data-section="chart-sunburst"]')!
        .getAttribute('data-animate')
    ).toBe('false');
  });
});
