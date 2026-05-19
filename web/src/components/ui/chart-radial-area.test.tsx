import { afterEach, describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import {
  ChartRadialArea,
  buildRadialAreaClosedPath,
  computeRadialAreaLayout,
  describeRadialAreaChart,
  getRadialAreaAngle,
  getRadialAreaDefaultColor,
  getRadialAreaMaxValue,
  getRadialAreaSampleCount,
  getRadialAreaTicks,
  polarToCartesian,
  DEFAULT_CHART_RADIAL_AREA_WIDTH,
  DEFAULT_CHART_RADIAL_AREA_HEIGHT,
  DEFAULT_CHART_RADIAL_AREA_PADDING,
  DEFAULT_CHART_RADIAL_AREA_INNER_RADIUS,
  DEFAULT_CHART_RADIAL_AREA_START_ANGLE,
  DEFAULT_CHART_RADIAL_AREA_TICK_COUNT,
  DEFAULT_CHART_RADIAL_AREA_STROKE_WIDTH,
  DEFAULT_CHART_RADIAL_AREA_FILL_OPACITY,
  DEFAULT_CHART_RADIAL_AREA_GRID_COLOR,
  DEFAULT_CHART_RADIAL_AREA_AXIS_COLOR,
  DEFAULT_CHART_RADIAL_AREA_STACK_MODE,
  DEFAULT_CHART_RADIAL_AREA_CURVE,
  DEFAULT_CHART_RADIAL_AREA_PALETTE,
  type ChartRadialAreaSeries,
} from './chart-radial-area';

afterEach(() => cleanup());

const SAMPLE: ChartRadialAreaSeries[] = [
  { id: 'a', label: 'Alpha', data: [10, 15, 20, 18, 12, 8] },
  { id: 'b', label: 'Beta', data: [5, 8, 10, 14, 16, 12] },
];

const LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

describe('chart-radial-area constants', () => {
  it('exports the documented defaults', () => {
    expect(DEFAULT_CHART_RADIAL_AREA_WIDTH).toBe(380);
    expect(DEFAULT_CHART_RADIAL_AREA_HEIGHT).toBe(380);
    expect(DEFAULT_CHART_RADIAL_AREA_PADDING).toBe(32);
    expect(DEFAULT_CHART_RADIAL_AREA_INNER_RADIUS).toBe(24);
    expect(DEFAULT_CHART_RADIAL_AREA_START_ANGLE).toBeCloseTo(-Math.PI / 2);
    expect(DEFAULT_CHART_RADIAL_AREA_TICK_COUNT).toBe(4);
    expect(DEFAULT_CHART_RADIAL_AREA_STROKE_WIDTH).toBeCloseTo(1.2);
    expect(DEFAULT_CHART_RADIAL_AREA_FILL_OPACITY).toBeCloseTo(0.55);
    expect(DEFAULT_CHART_RADIAL_AREA_GRID_COLOR).toBe('#e2e8f0');
    expect(DEFAULT_CHART_RADIAL_AREA_AXIS_COLOR).toBe('#cbd5e1');
    expect(DEFAULT_CHART_RADIAL_AREA_STACK_MODE).toBe('overlay');
    expect(DEFAULT_CHART_RADIAL_AREA_CURVE).toBe('linear');
    expect(DEFAULT_CHART_RADIAL_AREA_PALETTE.length).toBe(10);
  });
});

describe('getRadialAreaDefaultColor', () => {
  it('palette + modulo + invalid fallback', () => {
    expect(getRadialAreaDefaultColor(0)).toBe(
      DEFAULT_CHART_RADIAL_AREA_PALETTE[0]
    );
    expect(
      getRadialAreaDefaultColor(DEFAULT_CHART_RADIAL_AREA_PALETTE.length)
    ).toBe(DEFAULT_CHART_RADIAL_AREA_PALETTE[0]);
    expect(getRadialAreaDefaultColor(-1)).toBe(
      DEFAULT_CHART_RADIAL_AREA_PALETTE[0]
    );
  });
});

describe('polarToCartesian', () => {
  it('center at radius=0; right at 0; down at pi/2', () => {
    expect(polarToCartesian(5, 7, 0, 1)).toEqual({ x: 5, y: 7 });
    const r = polarToCartesian(0, 0, 10, 0);
    expect(r.x).toBeCloseTo(10);
    const d = polarToCartesian(0, 0, 10, Math.PI / 2);
    expect(d.y).toBeCloseTo(10);
  });
});

describe('getRadialAreaAngle', () => {
  it('returns startAngle at position 0', () => {
    expect(getRadialAreaAngle(0, 6, -Math.PI / 2)).toBeCloseTo(-Math.PI / 2);
  });
  it('wraps fractionally across the cycle', () => {
    expect(getRadialAreaAngle(3, 6, 0)).toBeCloseTo(Math.PI);
  });
  it('non-positive cycle -> startAngle', () => {
    expect(getRadialAreaAngle(2, 0, Math.PI / 4)).toBeCloseTo(Math.PI / 4);
  });
});

describe('getRadialAreaSampleCount', () => {
  it('returns the longest visible series data length', () => {
    expect(getRadialAreaSampleCount(SAMPLE, new Set())).toBe(6);
  });
  it('respects hidden series', () => {
    expect(getRadialAreaSampleCount(SAMPLE, new Set(['a']))).toBe(6);
  });
});

describe('getRadialAreaMaxValue', () => {
  it('overlay mode: largest single value', () => {
    expect(getRadialAreaMaxValue(SAMPLE, new Set(), 'overlay')).toBe(20);
  });
  it('stacked mode: largest column sum', () => {
    expect(getRadialAreaMaxValue(SAMPLE, new Set(), 'stacked')).toBe(32);
  });
  it('respects hidden series', () => {
    expect(getRadialAreaMaxValue(SAMPLE, new Set(['a']), 'overlay')).toBe(16);
  });
  it('empty / all-hidden -> 1 fallback', () => {
    expect(getRadialAreaMaxValue([], new Set(), 'overlay')).toBe(1);
    expect(
      getRadialAreaMaxValue(SAMPLE, new Set(['a', 'b']), 'overlay')
    ).toBe(1);
  });
});

describe('getRadialAreaTicks', () => {
  it('non-positive max -> [0]', () => {
    expect(getRadialAreaTicks(0)).toEqual([0]);
  });
  it('count evenly-spaced 0..max', () => {
    const t = getRadialAreaTicks(100, 5);
    expect(t).toHaveLength(5);
    expect(t[0]).toBe(0);
    expect(t[4]).toBeCloseTo(100);
  });
});

describe('buildRadialAreaClosedPath', () => {
  it('empty outerPoints -> empty string', () => {
    expect(
      buildRadialAreaClosedPath([], [], 'linear')
    ).toBe('');
  });
  it('overlay (inner points collapsed) yields a single closed M..Z path', () => {
    const outer = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];
    const inner = outer.map(() => ({ x: 0, y: 0 }));
    const p = buildRadialAreaClosedPath(outer, inner, 'linear');
    expect(p.startsWith('M')).toBe(true);
    expect(p.endsWith('Z')).toBe(true);
    // only one M (outer ring)
    expect((p.match(/M/g) || []).length).toBe(1);
  });
  it('stacked (distinct inner ring) yields an annulus with two closed rings', () => {
    const outer = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];
    const inner = [
      { x: 2, y: 2 },
      { x: 8, y: 2 },
      { x: 8, y: 8 },
    ];
    const p = buildRadialAreaClosedPath(outer, inner, 'linear');
    expect((p.match(/M/g) || []).length).toBe(2);
    expect((p.match(/Z/g) || []).length).toBe(2);
  });
  it('cardinal curve emits cubic bezier C commands', () => {
    const outer = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];
    const inner = outer.map(() => ({ x: 0, y: 0 }));
    const p = buildRadialAreaClosedPath(outer, inner, 'cardinal');
    expect(p).toContain('C');
  });
});

describe('computeRadialAreaLayout', () => {
  const cx = 190;
  const cy = 190;
  const innerRadius = 24;
  const outerRadius = 160;

  it('empty / non-positive radius / non-positive cycle -> empty', () => {
    expect(
      computeRadialAreaLayout({
        series: [],
        hidden: new Set(),
        cycleLength: 6,
        stackMode: 'overlay',
        curve: 'linear',
        cx,
        cy,
        innerRadius,
        outerRadius,
        startAngle: 0,
        tickCount: 4,
      }).series
    ).toEqual([]);
    expect(
      computeRadialAreaLayout({
        series: SAMPLE,
        hidden: new Set(),
        cycleLength: 0,
        stackMode: 'overlay',
        curve: 'linear',
        cx,
        cy,
        innerRadius,
        outerRadius,
        startAngle: 0,
        tickCount: 4,
      }).series
    ).toEqual([]);
  });

  it('one series per visible input + axis spokes per cycle position', () => {
    const r = computeRadialAreaLayout({
      series: SAMPLE,
      hidden: new Set(),
      cycleLength: 6,
      stackMode: 'overlay',
      curve: 'linear',
      cx,
      cy,
      innerRadius,
      outerRadius,
      startAngle: -Math.PI / 2,
      tickCount: 4,
    });
    expect(r.series).toHaveLength(2);
    expect(r.axisAngles).toHaveLength(6);
  });

  it('hidden series drop from output', () => {
    const r = computeRadialAreaLayout({
      series: SAMPLE,
      hidden: new Set(['a']),
      cycleLength: 6,
      stackMode: 'overlay',
      curve: 'linear',
      cx,
      cy,
      innerRadius,
      outerRadius,
      startAngle: 0,
      tickCount: 4,
    });
    expect(r.series).toHaveLength(1);
    expect(r.series[0]!.id).toBe('b');
  });

  it('overlay mode: every layer starts from inner radius', () => {
    const r = computeRadialAreaLayout({
      series: SAMPLE,
      hidden: new Set(),
      cycleLength: 6,
      stackMode: 'overlay',
      curve: 'linear',
      cx,
      cy,
      innerRadius,
      outerRadius,
      startAngle: 0,
      tickCount: 4,
    });
    for (const ser of r.series) {
      for (const pt of ser.points) {
        expect(pt.innerRadius).toBeCloseTo(innerRadius);
      }
    }
  });

  it('stacked mode: layer N inner radius = layer N-1 outer radius (per sample)', () => {
    const r = computeRadialAreaLayout({
      series: SAMPLE,
      hidden: new Set(),
      cycleLength: 6,
      stackMode: 'stacked',
      curve: 'linear',
      cx,
      cy,
      innerRadius,
      outerRadius,
      startAngle: 0,
      tickCount: 4,
    });
    const a = r.series[0]!;
    const b = r.series[1]!;
    for (let i = 0; i < 6; i++) {
      expect(b.points[i]!.innerRadius).toBeCloseTo(a.points[i]!.outerRadius);
    }
  });

  it('stacked mode peak total maps to outerRadius', () => {
    const r = computeRadialAreaLayout({
      series: SAMPLE,
      hidden: new Set(),
      cycleLength: 6,
      stackMode: 'stacked',
      curve: 'linear',
      cx,
      cy,
      innerRadius,
      outerRadius,
      startAngle: 0,
      tickCount: 4,
    });
    expect(r.maxValue).toBe(32);
    // top series at peak sample should have outerRadius close to outerRadius
    const topPeak = r.series[r.series.length - 1]!.points.find(
      (p) => Math.abs(p.cumulative - 32) < 1e-6
    );
    expect(topPeak).toBeTruthy();
    expect(topPeak!.outerRadius).toBeCloseTo(outerRadius);
  });

  it('non-finite values clamp to 0 (overlay collapses to inner radius)', () => {
    const r = computeRadialAreaLayout({
      series: [
        { id: 'x', label: 'X', data: [Number.NaN, 10, 5] },
      ],
      hidden: new Set(),
      cycleLength: 3,
      stackMode: 'overlay',
      curve: 'linear',
      cx,
      cy,
      innerRadius,
      outerRadius,
      startAngle: 0,
      tickCount: 4,
    });
    const pt = r.series[0]!.points[0]!;
    expect(pt.isFinite).toBe(false);
    expect(pt.outerRadius).toBeCloseTo(innerRadius);
  });

  it('every series emits an outline + area path', () => {
    const r = computeRadialAreaLayout({
      series: SAMPLE,
      hidden: new Set(),
      cycleLength: 6,
      stackMode: 'overlay',
      curve: 'linear',
      cx,
      cy,
      innerRadius,
      outerRadius,
      startAngle: 0,
      tickCount: 4,
    });
    for (const ser of r.series) {
      expect(ser.outlinePath.length).toBeGreaterThan(0);
      expect(ser.areaPath.endsWith('Z')).toBe(true);
    }
  });

  it('cardinal curve produces C commands in paths', () => {
    const r = computeRadialAreaLayout({
      series: SAMPLE,
      hidden: new Set(),
      cycleLength: 6,
      stackMode: 'overlay',
      curve: 'cardinal',
      cx,
      cy,
      innerRadius,
      outerRadius,
      startAngle: 0,
      tickCount: 4,
    });
    for (const ser of r.series) {
      expect(ser.areaPath).toContain('C');
    }
  });

  it('per-series color override beats palette', () => {
    const r = computeRadialAreaLayout({
      series: [{ id: 'x', label: 'X', data: [1, 2, 3], color: '#abcdef' }],
      hidden: new Set(),
      cycleLength: 3,
      stackMode: 'overlay',
      curve: 'linear',
      cx,
      cy,
      innerRadius,
      outerRadius,
      startAngle: 0,
      tickCount: 4,
    });
    expect(r.series[0]!.color).toBe('#abcdef');
  });

  it('axis labels picked up + fallback to index', () => {
    const r = computeRadialAreaLayout({
      series: SAMPLE,
      hidden: new Set(),
      cycleLength: 6,
      stackMode: 'overlay',
      curve: 'linear',
      axisLabels: LABELS,
      cx,
      cy,
      innerRadius,
      outerRadius,
      startAngle: 0,
      tickCount: 4,
    });
    expect(r.axisAngles[0]!.label).toBe('Mon');
    expect(r.axisAngles[3]!.label).toBe('Thu');
  });

  it('rings rendered for each non-zero tick value', () => {
    const r = computeRadialAreaLayout({
      series: SAMPLE,
      hidden: new Set(),
      cycleLength: 6,
      stackMode: 'overlay',
      curve: 'linear',
      cx,
      cy,
      innerRadius,
      outerRadius,
      startAngle: 0,
      tickCount: 4,
    });
    expect(r.rings.length).toBeGreaterThan(0);
    for (const ring of r.rings) {
      expect(ring.radius).toBeGreaterThan(innerRadius);
      expect(ring.radius).toBeLessThanOrEqual(outerRadius);
    }
  });

  it('maxValueOverride wins', () => {
    const r = computeRadialAreaLayout({
      series: SAMPLE,
      hidden: new Set(),
      cycleLength: 6,
      stackMode: 'overlay',
      curve: 'linear',
      cx,
      cy,
      innerRadius,
      outerRadius,
      startAngle: 0,
      tickCount: 4,
      maxValueOverride: 100,
    });
    expect(r.maxValue).toBe(100);
  });
});

describe('describeRadialAreaChart', () => {
  it('empty / all-hidden / non-positive cycle -> "No data"', () => {
    expect(describeRadialAreaChart([], new Set(), 'overlay', 6)).toBe(
      'No data'
    );
    expect(
      describeRadialAreaChart(SAMPLE, new Set(['a', 'b']), 'overlay', 6)
    ).toBe('No data');
    expect(describeRadialAreaChart(SAMPLE, new Set(), 'overlay', 0)).toBe(
      'No data'
    );
  });
  it('includes mode + count + cycle + peak', () => {
    const d = describeRadialAreaChart(SAMPLE, new Set(), 'stacked', 6);
    expect(d).toContain('Radial area chart (stacked)');
    expect(d).toContain('2 series');
    expect(d).toContain('cycle length 6');
    expect(d).toContain('32');
  });
});

describe('<ChartRadialArea> component', () => {
  it('renders region + custom aria-label', () => {
    const { getByRole } = render(
      <ChartRadialArea
        series={SAMPLE}
        cycleLength={6}
        ariaLabel="Test radial area"
      />
    );
    expect(getByRole('region', { name: 'Test radial area' })).toBeTruthy();
  });

  it('renders one series group per visible series', () => {
    const { container } = render(
      <ChartRadialArea series={SAMPLE} cycleLength={6} />
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-radial-area-series-group"]'
      ).length
    ).toBe(2);
  });

  it('series group data attrs mirror layout', () => {
    const { container } = render(
      <ChartRadialArea series={SAMPLE} cycleLength={6} />
    );
    const grp = container.querySelector('[data-series-id="a"]') as HTMLElement;
    expect(grp.getAttribute('data-series-index')).toBe('0');
    expect(grp.getAttribute('data-series-color')).toBeTruthy();
    expect(grp.getAttribute('data-series-point-count')).toBe('6');
  });

  it('fill + outline paths render by default', () => {
    const { container } = render(
      <ChartRadialArea series={SAMPLE} cycleLength={6} />
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-radial-area-fill"]'
      ).length
    ).toBe(2);
    expect(
      container.querySelectorAll(
        '[data-section="chart-radial-area-outline"]'
      ).length
    ).toBe(2);
  });

  it('showOutline=false suppresses outlines (keeps fill)', () => {
    const { container } = render(
      <ChartRadialArea
        series={SAMPLE}
        cycleLength={6}
        showOutline={false}
      />
    );
    expect(
      container.querySelector('[data-section="chart-radial-area-outline"]')
    ).toBeNull();
    expect(
      container.querySelectorAll(
        '[data-section="chart-radial-area-fill"]'
      ).length
    ).toBe(2);
  });

  it('outline path is role=graphics-symbol + tabIndex=0 + aria-label', () => {
    const { container } = render(
      <ChartRadialArea series={SAMPLE} cycleLength={6} />
    );
    const path = container.querySelector(
      '[data-section="chart-radial-area-outline"]'
    ) as SVGPathElement;
    expect(path.getAttribute('role')).toBe('graphics-symbol');
    expect(path.getAttribute('tabindex')).toBe('0');
    expect(path.getAttribute('aria-label')).toContain('Alpha');
    expect(path.getAttribute('aria-label')).toContain('6 samples');
  });

  it('root mirrors stackMode + curve + cycle + counts + max + animate', () => {
    const { container } = render(
      <ChartRadialArea
        series={SAMPLE}
        cycleLength={6}
        stackMode="stacked"
        curve="cardinal"
      />
    );
    const root = container.querySelector('[data-section="chart-radial-area"]');
    expect(root?.getAttribute('data-stack-mode')).toBe('stacked');
    expect(root?.getAttribute('data-curve')).toBe('cardinal');
    expect(root?.getAttribute('data-cycle-length')).toBe('6');
    expect(root?.getAttribute('data-series-count')).toBe('2');
    expect(root?.getAttribute('data-visible-series-count')).toBe('2');
    expect(root?.getAttribute('data-max-value')).toBe('32');
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('rings render by default; suppression', () => {
    const a = render(<ChartRadialArea series={SAMPLE} cycleLength={6} />);
    expect(
      a.container.querySelectorAll(
        '[data-section="chart-radial-area-ring"]'
      ).length
    ).toBeGreaterThan(0);
    cleanup();
    const b = render(
      <ChartRadialArea
        series={SAMPLE}
        cycleLength={6}
        showRings={false}
      />
    );
    expect(
      b.container.querySelector('[data-section="chart-radial-area-rings"]')
    ).toBeNull();
  });

  it('spokes render by default; suppression', () => {
    const a = render(<ChartRadialArea series={SAMPLE} cycleLength={6} />);
    expect(
      a.container.querySelectorAll(
        '[data-section="chart-radial-area-spoke"]'
      ).length
    ).toBe(6);
    cleanup();
    const b = render(
      <ChartRadialArea
        series={SAMPLE}
        cycleLength={6}
        showSpokes={false}
      />
    );
    expect(
      b.container.querySelector('[data-section="chart-radial-area-spokes"]')
    ).toBeNull();
  });

  it('axis labels render with provided strings + suppression', () => {
    const a = render(
      <ChartRadialArea
        series={SAMPLE}
        cycleLength={6}
        axisLabels={LABELS}
      />
    );
    const labels = a.container.querySelectorAll(
      '[data-section="chart-radial-area-axis-label"]'
    );
    expect(labels[0]!.textContent).toBe('Mon');
    cleanup();
    const b = render(
      <ChartRadialArea
        series={SAMPLE}
        cycleLength={6}
        showAxisLabels={false}
      />
    );
    expect(
      b.container.querySelector(
        '[data-section="chart-radial-area-axis-labels"]'
      )
    ).toBeNull();
  });

  it('formatAxis rewrites axis labels', () => {
    const { container } = render(
      <ChartRadialArea
        series={SAMPLE}
        cycleLength={6}
        axisLabels={LABELS}
        formatAxis={(label, idx) => `${idx}:${label}`}
      />
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-radial-area-axis-label"]'
    );
    expect(labels[0]!.textContent).toBe('0:Mon');
  });

  it('legend renders one button per series', () => {
    const { container } = render(
      <ChartRadialArea series={SAMPLE} cycleLength={6} />
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-radial-area-legend-button"]'
      ).length
    ).toBe(2);
  });

  it('legend click toggles series visibility (uncontrolled) + onSeriesToggle payload', () => {
    const onSeriesToggle = vi.fn();
    const { container } = render(
      <ChartRadialArea
        series={SAMPLE}
        cycleLength={6}
        onSeriesToggle={onSeriesToggle}
      />
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-radial-area-legend-button"]'
    );
    fireEvent.click(buttons[1]! as HTMLElement);
    expect(onSeriesToggle).toHaveBeenCalledTimes(1);
    expect(onSeriesToggle.mock.calls[0]![0].series.id).toBe('b');
    expect(onSeriesToggle.mock.calls[0]![0].hidden).toBe(true);
    const root = container.querySelector('[data-section="chart-radial-area"]');
    expect(root?.getAttribute('data-visible-series-count')).toBe('1');
  });

  it('controlled hiddenSeries respected', () => {
    const { container } = render(
      <ChartRadialArea
        series={SAMPLE}
        cycleLength={6}
        hiddenSeries={['a']}
      />
    );
    const root = container.querySelector('[data-section="chart-radial-area"]');
    expect(root?.getAttribute('data-visible-series-count')).toBe('1');
  });

  it('showLegend=false suppresses the legend', () => {
    const { container } = render(
      <ChartRadialArea
        series={SAMPLE}
        cycleLength={6}
        showLegend={false}
      />
    );
    expect(
      container.querySelector('[data-section="chart-radial-area-legend"]')
    ).toBeNull();
  });

  it('hover series opens tooltip (label + total + samples)', () => {
    const { container } = render(
      <ChartRadialArea series={SAMPLE} cycleLength={6} />
    );
    const grp = container.querySelector('[data-series-id="a"]') as HTMLElement;
    fireEvent.mouseEnter(grp);
    expect(
      container.querySelector('[data-section="chart-radial-area-tooltip"]')
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-radial-area-tooltip-label"]'
      )?.textContent
    ).toBe('Alpha');
    // a's data sums to 83
    expect(
      container.querySelector(
        '[data-section="chart-radial-area-tooltip-total"]'
      )?.textContent
    ).toContain('83');
    expect(
      container.querySelector(
        '[data-section="chart-radial-area-tooltip-samples"]'
      )?.textContent
    ).toContain('6');
  });

  it('tooltip hides on mouseleave', () => {
    const { container } = render(
      <ChartRadialArea series={SAMPLE} cycleLength={6} />
    );
    const grp = container.querySelector('[data-series-id="a"]') as HTMLElement;
    fireEvent.mouseEnter(grp);
    expect(
      container.querySelector('[data-section="chart-radial-area-tooltip"]')
    ).not.toBeNull();
    fireEvent.mouseLeave(grp);
    expect(
      container.querySelector('[data-section="chart-radial-area-tooltip"]')
    ).toBeNull();
  });

  it('showTooltip=false suppresses the tooltip', () => {
    const { container } = render(
      <ChartRadialArea
        series={SAMPLE}
        cycleLength={6}
        showTooltip={false}
      />
    );
    fireEvent.mouseEnter(
      container.querySelector('[data-series-id="a"]')! as HTMLElement
    );
    expect(
      container.querySelector('[data-section="chart-radial-area-tooltip"]')
    ).toBeNull();
  });

  it('onSeriesClick fires with series payload', () => {
    const onSeriesClick = vi.fn();
    const { container } = render(
      <ChartRadialArea
        series={SAMPLE}
        cycleLength={6}
        onSeriesClick={onSeriesClick}
      />
    );
    fireEvent.click(
      container.querySelector('[data-series-id="b"]')! as HTMLElement
    );
    expect(onSeriesClick).toHaveBeenCalledTimes(1);
    expect(onSeriesClick.mock.calls[0]![0].series.id).toBe('b');
  });

  it('data-hovered mirrors hover state on series', () => {
    const { container } = render(
      <ChartRadialArea series={SAMPLE} cycleLength={6} />
    );
    const grp = container.querySelector('[data-series-id="a"]') as HTMLElement;
    expect(grp.getAttribute('data-hovered')).toBe('false');
    fireEvent.mouseEnter(grp);
    expect(grp.getAttribute('data-hovered')).toBe('true');
    fireEvent.mouseLeave(grp);
    expect(grp.getAttribute('data-hovered')).toBe('false');
  });

  it('formatValue reaches tooltip total', () => {
    const { container } = render(
      <ChartRadialArea
        series={SAMPLE}
        cycleLength={6}
        formatValue={(v) => `${v}u`}
      />
    );
    fireEvent.mouseEnter(
      container.querySelector('[data-series-id="a"]')! as HTMLElement
    );
    expect(
      container.querySelector(
        '[data-section="chart-radial-area-tooltip-total"]'
      )?.textContent
    ).toContain('u');
  });

  it('auto ARIA description renders by default', () => {
    const { container } = render(
      <ChartRadialArea series={SAMPLE} cycleLength={6} />
    );
    expect(
      container.querySelector('[data-section="chart-radial-area-aria-desc"]')
        ?.textContent
    ).toContain('Radial area chart');
  });

  it('ariaDescription override beats auto', () => {
    const { container } = render(
      <ChartRadialArea
        series={SAMPLE}
        cycleLength={6}
        ariaDescription="Override"
      />
    );
    expect(
      container.querySelector('[data-section="chart-radial-area-aria-desc"]')
        ?.textContent
    ).toBe('Override');
  });

  it('SVG mirrors width / height / viewBox', () => {
    const { container } = render(
      <ChartRadialArea
        series={SAMPLE}
        cycleLength={6}
        width={400}
        height={400}
      />
    );
    const svg = container.querySelector(
      '[data-section="chart-radial-area-svg"]'
    ) as SVGElement;
    expect(svg.getAttribute('width')).toBe('400');
    expect(svg.getAttribute('height')).toBe('400');
    expect(svg.getAttribute('viewBox')).toBe('0 0 400 400');
  });

  it('empty input renders without crashing', () => {
    const { container } = render(
      <ChartRadialArea series={[]} cycleLength={6} />
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-radial-area-series-group"]'
      ).length
    ).toBe(0);
    expect(
      container.querySelector('[data-section="chart-radial-area-aria-desc"]')
        ?.textContent
    ).toBe('No data');
  });

  it('forwards ref to root', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartRadialArea series={SAMPLE} cycleLength={6} ref={ref} />);
    expect(ref.current?.dataset.section).toBe('chart-radial-area');
  });

  it('has stable displayName', () => {
    expect(ChartRadialArea.displayName).toBe('ChartRadialArea');
  });

  it('data-animate mirrors prop', () => {
    const { container } = render(
      <ChartRadialArea
        series={SAMPLE}
        cycleLength={6}
        animate={false}
      />
    );
    expect(
      container.querySelector('[data-section="chart-radial-area"]')!
        .getAttribute('data-animate')
    ).toBe('false');
  });
});
