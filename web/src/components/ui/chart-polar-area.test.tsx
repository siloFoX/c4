import { afterEach, describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import {
  ChartPolarArea,
  computePolarAreaLayout,
  describePolarAreaChart,
  getPolarAreaDefaultColor,
  getPolarAreaMaxValue,
  getPolarAreaRadius,
  getPolarAreaTicks,
  polarToCartesian,
  DEFAULT_CHART_POLAR_AREA_WIDTH,
  DEFAULT_CHART_POLAR_AREA_HEIGHT,
  DEFAULT_CHART_POLAR_AREA_PADDING,
  DEFAULT_CHART_POLAR_AREA_START_ANGLE,
  DEFAULT_CHART_POLAR_AREA_PAD_ANGLE,
  DEFAULT_CHART_POLAR_AREA_TICK_COUNT,
  DEFAULT_CHART_POLAR_AREA_RADIUS_MODE,
  DEFAULT_CHART_POLAR_AREA_FILL_OPACITY,
  DEFAULT_CHART_POLAR_AREA_PALETTE,
  type ChartPolarAreaWedge,
} from './chart-polar-area';

afterEach(() => cleanup());

const SAMPLE: ChartPolarAreaWedge[] = [
  { id: 'a', label: 'Alpha', value: 100 },
  { id: 'b', label: 'Beta', value: 25 },
  { id: 'c', label: 'Gamma', value: 50 },
  { id: 'd', label: 'Delta', value: 75 },
];

describe('chart-polar-area constants', () => {
  it('exports the documented defaults', () => {
    expect(DEFAULT_CHART_POLAR_AREA_WIDTH).toBe(360);
    expect(DEFAULT_CHART_POLAR_AREA_HEIGHT).toBe(360);
    expect(DEFAULT_CHART_POLAR_AREA_PADDING).toBe(32);
    expect(DEFAULT_CHART_POLAR_AREA_START_ANGLE).toBeCloseTo(-Math.PI / 2);
    expect(DEFAULT_CHART_POLAR_AREA_PAD_ANGLE).toBe(0);
    expect(DEFAULT_CHART_POLAR_AREA_TICK_COUNT).toBe(4);
    expect(DEFAULT_CHART_POLAR_AREA_RADIUS_MODE).toBe('sqrt');
    expect(DEFAULT_CHART_POLAR_AREA_FILL_OPACITY).toBeCloseTo(0.7);
    expect(DEFAULT_CHART_POLAR_AREA_PALETTE.length).toBe(10);
  });
});

describe('getPolarAreaDefaultColor', () => {
  it('returns palette[index] for valid indices', () => {
    expect(getPolarAreaDefaultColor(0)).toBe(DEFAULT_CHART_POLAR_AREA_PALETTE[0]);
    expect(getPolarAreaDefaultColor(3)).toBe(DEFAULT_CHART_POLAR_AREA_PALETTE[3]);
  });
  it('wraps modulo palette length', () => {
    expect(
      getPolarAreaDefaultColor(DEFAULT_CHART_POLAR_AREA_PALETTE.length)
    ).toBe(DEFAULT_CHART_POLAR_AREA_PALETTE[0]);
  });
  it('falls back to color 0 for invalid / negative input', () => {
    expect(getPolarAreaDefaultColor(Number.NaN)).toBe(
      DEFAULT_CHART_POLAR_AREA_PALETTE[0]
    );
    expect(getPolarAreaDefaultColor(-1)).toBe(
      DEFAULT_CHART_POLAR_AREA_PALETTE[0]
    );
  });
});

describe('polarToCartesian', () => {
  it('returns the center at any angle when radius is 0', () => {
    expect(polarToCartesian(10, 20, 0, 1.23)).toEqual({ x: 10, y: 20 });
  });
  it('moves rightward at angle 0', () => {
    const p = polarToCartesian(0, 0, 5, 0);
    expect(p.x).toBeCloseTo(5);
    expect(p.y).toBeCloseTo(0);
  });
  it('moves downward at angle pi/2', () => {
    const p = polarToCartesian(0, 0, 5, Math.PI / 2);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(5);
  });
});

describe('getPolarAreaMaxValue', () => {
  it('returns 0 for empty', () => {
    expect(getPolarAreaMaxValue([])).toBe(0);
  });
  it('returns the largest finite value', () => {
    expect(getPolarAreaMaxValue(SAMPLE)).toBe(100);
  });
  it('skips non-finite values', () => {
    expect(
      getPolarAreaMaxValue([
        { id: 'a', label: 'A', value: Number.NaN },
        { id: 'b', label: 'B', value: 5 },
      ])
    ).toBe(5);
  });
});

describe('getPolarAreaRadius', () => {
  it('returns 0 for non-positive value', () => {
    expect(getPolarAreaRadius(0, 100, 80, 'sqrt')).toBe(0);
    expect(getPolarAreaRadius(-5, 100, 80, 'sqrt')).toBe(0);
    expect(getPolarAreaRadius(Number.NaN, 100, 80, 'sqrt')).toBe(0);
  });
  it('returns 0 for non-positive max', () => {
    expect(getPolarAreaRadius(5, 0, 80, 'sqrt')).toBe(0);
  });
  it('sqrt mode uses sqrt(ratio) * outerRadius', () => {
    expect(getPolarAreaRadius(100, 100, 80, 'sqrt')).toBeCloseTo(80);
    expect(getPolarAreaRadius(25, 100, 80, 'sqrt')).toBeCloseTo(40);
  });
  it('linear mode uses ratio * outerRadius', () => {
    expect(getPolarAreaRadius(50, 100, 80, 'linear')).toBeCloseTo(40);
    expect(getPolarAreaRadius(100, 100, 80, 'linear')).toBeCloseTo(80);
  });
  it('clamps ratio over 1', () => {
    expect(getPolarAreaRadius(200, 100, 80, 'sqrt')).toBeCloseTo(80);
    expect(getPolarAreaRadius(200, 100, 80, 'linear')).toBeCloseTo(80);
  });
});

describe('getPolarAreaTicks', () => {
  it('non-positive max -> [0]', () => {
    expect(getPolarAreaTicks(0)).toEqual([0]);
    expect(getPolarAreaTicks(-5)).toEqual([0]);
  });
  it('returns count evenly-spaced inclusive ticks (0..max)', () => {
    const t = getPolarAreaTicks(100, 5);
    expect(t).toHaveLength(5);
    expect(t[0]).toBe(0);
    expect(t[4]).toBeCloseTo(100);
  });
  it('clamps count to >= 2', () => {
    expect(getPolarAreaTicks(10, 1).length).toBe(2);
  });
});

describe('computePolarAreaLayout', () => {
  const cx = 180;
  const cy = 180;
  const outerRadius = 140;

  it('returns one wedge per visible item', () => {
    const r = computePolarAreaLayout({
      wedges: SAMPLE,
      hidden: new Set(),
      cx,
      cy,
      outerRadius,
      startAngle: 0,
      padAngle: 0,
      radiusMode: 'sqrt',
    });
    expect(r.wedges).toHaveLength(4);
    expect(r.maxValue).toBe(100);
  });

  it('skips hidden wedges and recomputes the layout', () => {
    const r = computePolarAreaLayout({
      wedges: SAMPLE,
      hidden: new Set(['a']),
      cx,
      cy,
      outerRadius,
      startAngle: 0,
      padAngle: 0,
      radiusMode: 'sqrt',
    });
    expect(r.wedges).toHaveLength(3);
    expect(r.maxValue).toBe(75);
  });

  it('wedge spans sum to 2pi when padAngle=0', () => {
    const r = computePolarAreaLayout({
      wedges: SAMPLE,
      hidden: new Set(),
      cx,
      cy,
      outerRadius,
      startAngle: 0,
      padAngle: 0,
      radiusMode: 'sqrt',
    });
    let total = 0;
    for (const w of r.wedges) total += w.endAngle - w.startAngle;
    expect(total).toBeCloseTo(Math.PI * 2);
  });

  it('wedge spans are equal regardless of value', () => {
    const r = computePolarAreaLayout({
      wedges: SAMPLE,
      hidden: new Set(),
      cx,
      cy,
      outerRadius,
      startAngle: 0,
      padAngle: 0,
      radiusMode: 'sqrt',
    });
    const span0 = r.wedges[0]!.endAngle - r.wedges[0]!.startAngle;
    for (const w of r.wedges) {
      expect(w.endAngle - w.startAngle).toBeCloseTo(span0);
    }
  });

  it('padAngle introduces gaps between consecutive wedges', () => {
    const r = computePolarAreaLayout({
      wedges: SAMPLE,
      hidden: new Set(),
      cx,
      cy,
      outerRadius,
      startAngle: 0,
      padAngle: 0.1,
      radiusMode: 'sqrt',
    });
    for (let s = 0; s < r.wedges.length - 1; s++) {
      expect(
        r.wedges[s + 1]!.startAngle - r.wedges[s]!.endAngle
      ).toBeCloseTo(0.1);
    }
  });

  it('outer radius reflects sqrt scaling', () => {
    const r = computePolarAreaLayout({
      wedges: SAMPLE,
      hidden: new Set(),
      cx,
      cy,
      outerRadius,
      startAngle: 0,
      padAngle: 0,
      radiusMode: 'sqrt',
    });
    const alpha = r.wedges.find((w) => w.id === 'a')!;
    const beta = r.wedges.find((w) => w.id === 'b')!;
    expect(alpha.outerRadius).toBeCloseTo(outerRadius);
    expect(beta.outerRadius).toBeCloseTo(outerRadius * Math.sqrt(0.25));
  });

  it('outer radius reflects linear scaling', () => {
    const r = computePolarAreaLayout({
      wedges: SAMPLE,
      hidden: new Set(),
      cx,
      cy,
      outerRadius,
      startAngle: 0,
      padAngle: 0,
      radiusMode: 'linear',
    });
    const gamma = r.wedges.find((w) => w.id === 'c')!;
    expect(gamma.outerRadius).toBeCloseTo(outerRadius * 0.5);
  });

  it('maxValueOverride wins over auto-derived max', () => {
    const r = computePolarAreaLayout({
      wedges: SAMPLE,
      hidden: new Set(),
      cx,
      cy,
      outerRadius,
      startAngle: 0,
      padAngle: 0,
      radiusMode: 'sqrt',
      maxValueOverride: 200,
    });
    expect(r.maxValue).toBe(200);
    const alpha = r.wedges.find((w) => w.id === 'a')!;
    expect(alpha.outerRadius).toBeCloseTo(outerRadius * Math.sqrt(0.5));
  });

  it('empty / hidden / non-positive radius -> empty result', () => {
    expect(
      computePolarAreaLayout({
        wedges: [],
        hidden: new Set(),
        cx,
        cy,
        outerRadius,
        startAngle: 0,
        padAngle: 0,
        radiusMode: 'sqrt',
      }).wedges
    ).toEqual([]);
    expect(
      computePolarAreaLayout({
        wedges: SAMPLE,
        hidden: new Set(['a', 'b', 'c', 'd']),
        cx,
        cy,
        outerRadius,
        startAngle: 0,
        padAngle: 0,
        radiusMode: 'sqrt',
      }).wedges
    ).toEqual([]);
    expect(
      computePolarAreaLayout({
        wedges: SAMPLE,
        hidden: new Set(),
        cx,
        cy,
        outerRadius: 0,
        startAngle: 0,
        padAngle: 0,
        radiusMode: 'sqrt',
      }).wedges
    ).toEqual([]);
  });

  it('per-wedge color override beats palette', () => {
    const wedges: ChartPolarAreaWedge[] = [
      { id: 'a', label: 'A', value: 1, color: '#abcdef' },
    ];
    const r = computePolarAreaLayout({
      wedges,
      hidden: new Set(),
      cx,
      cy,
      outerRadius,
      startAngle: 0,
      padAngle: 0,
      radiusMode: 'sqrt',
    });
    expect(r.wedges[0]!.color).toBe('#abcdef');
  });

  it('every wedge emits a path string starting with M', () => {
    const r = computePolarAreaLayout({
      wedges: SAMPLE,
      hidden: new Set(),
      cx,
      cy,
      outerRadius,
      startAngle: 0,
      padAngle: 0,
      radiusMode: 'sqrt',
    });
    for (const w of r.wedges) {
      expect(typeof w.path).toBe('string');
      expect(w.path.startsWith('M')).toBe(true);
    }
  });
});

describe('describePolarAreaChart', () => {
  it('returns "No data" for empty / all-hidden', () => {
    expect(describePolarAreaChart([], new Set(), 'sqrt')).toBe('No data');
    expect(
      describePolarAreaChart(SAMPLE, new Set(['a', 'b', 'c', 'd']), 'sqrt')
    ).toBe('No data');
  });
  it('includes mode + count + peak', () => {
    const d = describePolarAreaChart(SAMPLE, new Set(), 'sqrt');
    expect(d).toContain('sqrt radius');
    expect(d).toContain('4 wedges');
    expect(d).toContain('100');
  });
  it('honors formatValue', () => {
    const d = describePolarAreaChart(
      SAMPLE,
      new Set(),
      'sqrt',
      (v) => `$${v}`
    );
    expect(d).toContain('$100');
  });
});

describe('<ChartPolarArea> component', () => {
  it('renders region + custom aria-label', () => {
    const { getByRole } = render(
      <ChartPolarArea wedges={SAMPLE} ariaLabel="Test polar" />
    );
    expect(getByRole('region', { name: 'Test polar' })).toBeTruthy();
  });

  it('renders one wedge per input', () => {
    const { container } = render(<ChartPolarArea wedges={SAMPLE} />);
    expect(
      container.querySelectorAll(
        '[data-section="chart-polar-area-wedge"]'
      ).length
    ).toBe(4);
  });

  it('wedge data attrs mirror id / value / ratio / color / radius', () => {
    const { container } = render(<ChartPolarArea wedges={SAMPLE} />);
    const alpha = container.querySelector(
      '[data-wedge-id="a"]'
    ) as HTMLElement;
    expect(alpha.getAttribute('data-wedge-index')).toBe('0');
    expect(alpha.getAttribute('data-wedge-value')).toBe('100');
    expect(alpha.getAttribute('data-wedge-ratio')).toBe('1');
    expect(alpha.getAttribute('data-wedge-color')).toBeTruthy();
    expect(alpha.getAttribute('data-wedge-radius')).toBeTruthy();
  });

  it('wedge path is role=graphics-symbol + tabIndex=0 + aria-label', () => {
    const { container } = render(<ChartPolarArea wedges={SAMPLE} />);
    const path = container.querySelector(
      '[data-section="chart-polar-area-path"]'
    ) as SVGPathElement;
    expect(path.getAttribute('role')).toBe('graphics-symbol');
    expect(path.getAttribute('tabindex')).toBe('0');
    expect(path.getAttribute('aria-label')).toContain('Alpha');
    expect(path.getAttribute('aria-label')).toContain('100');
  });

  it('root mirrors counts + max + radiusMode + animate', () => {
    const { container } = render(
      <ChartPolarArea
        wedges={SAMPLE}
        radiusMode="linear"
        defaultHiddenWedges={['b']}
        animate={false}
      />
    );
    const root = container.querySelector('[data-section="chart-polar-area"]');
    expect(root?.getAttribute('data-wedge-count')).toBe('4');
    expect(root?.getAttribute('data-visible-count')).toBe('3');
    expect(root?.getAttribute('data-max-value')).toBe('100');
    expect(root?.getAttribute('data-radius-mode')).toBe('linear');
    expect(root?.getAttribute('data-animate')).toBe('false');
  });

  it('axis rings render by default + suppression', () => {
    const a = render(<ChartPolarArea wedges={SAMPLE} />);
    expect(
      a.container.querySelectorAll(
        '[data-section="chart-polar-area-ring"]'
      ).length
    ).toBeGreaterThan(0);
    cleanup();
    const b = render(<ChartPolarArea wedges={SAMPLE} showAxisRings={false} />);
    expect(
      b.container.querySelector('[data-section="chart-polar-area-rings"]')
    ).toBeNull();
  });

  it('axis labels render by default + suppression', () => {
    const a = render(<ChartPolarArea wedges={SAMPLE} />);
    expect(
      a.container.querySelectorAll(
        '[data-section="chart-polar-area-axis-label"]'
      ).length
    ).toBeGreaterThan(0);
    cleanup();
    const b = render(
      <ChartPolarArea wedges={SAMPLE} showAxisLabels={false} />
    );
    expect(
      b.container.querySelector(
        '[data-section="chart-polar-area-axis-labels"]'
      )
    ).toBeNull();
  });

  it('wedge labels hidden by default; showWedgeLabels=true renders them', () => {
    const a = render(<ChartPolarArea wedges={SAMPLE} />);
    expect(
      a.container.querySelector(
        '[data-section="chart-polar-area-wedge-label"]'
      )
    ).toBeNull();
    cleanup();
    const b = render(<ChartPolarArea wedges={SAMPLE} showWedgeLabels />);
    expect(
      b.container.querySelectorAll(
        '[data-section="chart-polar-area-wedge-label"]'
      ).length
    ).toBeGreaterThan(0);
  });

  it('legend renders one button per wedge', () => {
    const { container } = render(<ChartPolarArea wedges={SAMPLE} />);
    expect(
      container.querySelectorAll(
        '[data-section="chart-polar-area-legend-button"]'
      ).length
    ).toBe(4);
  });

  it('legend click toggles wedge visibility (uncontrolled) + fires onWedgeToggle', () => {
    const onWedgeToggle = vi.fn();
    const { container } = render(
      <ChartPolarArea wedges={SAMPLE} onWedgeToggle={onWedgeToggle} />
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-polar-area-legend-button"]'
    );
    fireEvent.click(buttons[2]! as HTMLElement);
    expect(onWedgeToggle).toHaveBeenCalledTimes(1);
    expect(onWedgeToggle.mock.calls[0]![0].wedge.id).toBe('c');
    expect(onWedgeToggle.mock.calls[0]![0].hidden).toBe(true);
    const root = container.querySelector('[data-section="chart-polar-area"]');
    expect(root?.getAttribute('data-visible-count')).toBe('3');
  });

  it('legend respects controlled hiddenWedges', () => {
    const { container } = render(
      <ChartPolarArea wedges={SAMPLE} hiddenWedges={['a']} />
    );
    const root = container.querySelector('[data-section="chart-polar-area"]');
    expect(root?.getAttribute('data-visible-count')).toBe('3');
  });

  it('showLegend=false suppresses the legend', () => {
    const { container } = render(
      <ChartPolarArea wedges={SAMPLE} showLegend={false} />
    );
    expect(
      container.querySelector('[data-section="chart-polar-area-legend"]')
    ).toBeNull();
  });

  it('legend placement = right reverses layout', () => {
    const { container } = render(
      <ChartPolarArea wedges={SAMPLE} legendPlacement="right" />
    );
    const legend = container.querySelector(
      '[data-section="chart-polar-area-legend"]'
    );
    expect(legend?.getAttribute('data-placement')).toBe('right');
  });

  it('tooltip opens on wedge hover with label + value + ratio', () => {
    const { container } = render(<ChartPolarArea wedges={SAMPLE} />);
    const w = container.querySelector('[data-wedge-id="b"]') as HTMLElement;
    fireEvent.mouseEnter(w);
    expect(
      container.querySelector('[data-section="chart-polar-area-tooltip"]')
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-polar-area-tooltip-label"]'
      )?.textContent
    ).toBe('Beta');
    expect(
      container.querySelector(
        '[data-section="chart-polar-area-tooltip-value"]'
      )?.textContent
    ).toBe('25');
    expect(
      container.querySelector(
        '[data-section="chart-polar-area-tooltip-ratio"]'
      )?.textContent
    ).toContain('25%');
  });

  it('tooltip hides on mouseleave', () => {
    const { container } = render(<ChartPolarArea wedges={SAMPLE} />);
    const w = container.querySelector('[data-wedge-id="a"]') as HTMLElement;
    fireEvent.mouseEnter(w);
    expect(
      container.querySelector('[data-section="chart-polar-area-tooltip"]')
    ).not.toBeNull();
    fireEvent.mouseLeave(w);
    expect(
      container.querySelector('[data-section="chart-polar-area-tooltip"]')
    ).toBeNull();
  });

  it('showTooltip=false suppresses tooltip', () => {
    const { container } = render(
      <ChartPolarArea wedges={SAMPLE} showTooltip={false} />
    );
    fireEvent.mouseEnter(
      container.querySelector('[data-wedge-id="a"]')! as HTMLElement
    );
    expect(
      container.querySelector('[data-section="chart-polar-area-tooltip"]')
    ).toBeNull();
  });

  it('formatValue reaches tooltip + aria-label', () => {
    const { container } = render(
      <ChartPolarArea wedges={SAMPLE} formatValue={(v) => `${v}u`} />
    );
    const path = container.querySelector(
      '[data-section="chart-polar-area-path"]'
    ) as SVGPathElement;
    expect(path.getAttribute('aria-label')).toContain('u');
    fireEvent.mouseEnter(
      container.querySelector('[data-wedge-id="a"]')! as HTMLElement
    );
    expect(
      container.querySelector(
        '[data-section="chart-polar-area-tooltip-value"]'
      )?.textContent
    ).toBe('100u');
  });

  it('onWedgeClick fires with wedge + layout payload', () => {
    const onWedgeClick = vi.fn();
    const { container } = render(
      <ChartPolarArea wedges={SAMPLE} onWedgeClick={onWedgeClick} />
    );
    fireEvent.click(
      container.querySelector('[data-wedge-id="c"]')! as HTMLElement
    );
    expect(onWedgeClick).toHaveBeenCalledTimes(1);
    expect(onWedgeClick.mock.calls[0]![0].wedge.id).toBe('c');
    expect(onWedgeClick.mock.calls[0]![0].layout.id).toBe('c');
  });

  it('data-hovered mirrors hover state', () => {
    const { container } = render(<ChartPolarArea wedges={SAMPLE} />);
    const w = container.querySelector('[data-wedge-id="a"]') as HTMLElement;
    expect(w.getAttribute('data-hovered')).toBe('false');
    fireEvent.mouseEnter(w);
    expect(w.getAttribute('data-hovered')).toBe('true');
    fireEvent.mouseLeave(w);
    expect(w.getAttribute('data-hovered')).toBe('false');
  });

  it('auto ARIA description renders by default', () => {
    const { container } = render(<ChartPolarArea wedges={SAMPLE} />);
    expect(
      container.querySelector('[data-section="chart-polar-area-aria-desc"]')
        ?.textContent
    ).toContain('4 wedges');
  });

  it('ariaDescription override beats auto', () => {
    const { container } = render(
      <ChartPolarArea wedges={SAMPLE} ariaDescription="Override" />
    );
    expect(
      container.querySelector('[data-section="chart-polar-area-aria-desc"]')
        ?.textContent
    ).toBe('Override');
  });

  it('SVG mirrors width / height / viewBox', () => {
    const { container } = render(
      <ChartPolarArea wedges={SAMPLE} width={400} height={400} />
    );
    const svg = container.querySelector(
      '[data-section="chart-polar-area-svg"]'
    ) as SVGElement;
    expect(svg.getAttribute('width')).toBe('400');
    expect(svg.getAttribute('height')).toBe('400');
    expect(svg.getAttribute('viewBox')).toBe('0 0 400 400');
  });

  it('empty input renders without crashing', () => {
    const { container } = render(<ChartPolarArea wedges={[]} />);
    expect(
      container.querySelectorAll(
        '[data-section="chart-polar-area-wedge"]'
      ).length
    ).toBe(0);
    expect(
      container.querySelector('[data-section="chart-polar-area-aria-desc"]')!
        .textContent
    ).toBe('No data');
  });

  it('forwards ref to root', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartPolarArea wedges={SAMPLE} ref={ref} />);
    expect(ref.current?.dataset.section).toBe('chart-polar-area');
  });

  it('has stable displayName', () => {
    expect(ChartPolarArea.displayName).toBe('ChartPolarArea');
  });

  it('maxValue prop overrides auto-derived max', () => {
    const { container } = render(
      <ChartPolarArea wedges={SAMPLE} maxValue={200} />
    );
    const root = container.querySelector('[data-section="chart-polar-area"]');
    expect(root?.getAttribute('data-max-value')).toBe('200');
  });
});
