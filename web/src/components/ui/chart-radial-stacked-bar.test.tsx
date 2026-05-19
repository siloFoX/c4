import { afterEach, describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import {
  ChartRadialStackedBar,
  computeRadialStackedBarLayout,
  describeRadialStackedBarChart,
  getRadialStackedBarCategoryTotal,
  getRadialStackedBarDefaultColor,
  polarToCartesian,
  DEFAULT_CHART_RADIAL_STACKED_BAR_WIDTH,
  DEFAULT_CHART_RADIAL_STACKED_BAR_HEIGHT,
  DEFAULT_CHART_RADIAL_STACKED_BAR_PADDING,
  DEFAULT_CHART_RADIAL_STACKED_BAR_INNER_RADIUS,
  DEFAULT_CHART_RADIAL_STACKED_BAR_RING_GAP,
  DEFAULT_CHART_RADIAL_STACKED_BAR_PAD_ANGLE,
  DEFAULT_CHART_RADIAL_STACKED_BAR_START_ANGLE,
  DEFAULT_CHART_RADIAL_STACKED_BAR_FILL_OPACITY,
  DEFAULT_CHART_RADIAL_STACKED_BAR_PALETTE,
  type ChartRadialStackedBarCategory,
  type ChartRadialStackedBarSeries,
} from './chart-radial-stacked-bar';

afterEach(() => cleanup());

const SERIES: ChartRadialStackedBarSeries[] = [
  { id: 's1', label: 'Series 1' },
  { id: 's2', label: 'Series 2' },
  { id: 's3', label: 'Series 3' },
];

const CATEGORIES: ChartRadialStackedBarCategory[] = [
  { id: 'c1', label: 'Q1', values: [10, 20, 30] }, // total 60
  { id: 'c2', label: 'Q2', values: [25, 25, 0] }, // total 50
  { id: 'c3', label: 'Q3', values: [5, 15, 20] }, // total 40
];

describe('chart-radial-stacked-bar constants', () => {
  it('exports the documented defaults', () => {
    expect(DEFAULT_CHART_RADIAL_STACKED_BAR_WIDTH).toBe(380);
    expect(DEFAULT_CHART_RADIAL_STACKED_BAR_HEIGHT).toBe(380);
    expect(DEFAULT_CHART_RADIAL_STACKED_BAR_PADDING).toBe(32);
    expect(DEFAULT_CHART_RADIAL_STACKED_BAR_INNER_RADIUS).toBe(36);
    expect(DEFAULT_CHART_RADIAL_STACKED_BAR_RING_GAP).toBe(6);
    expect(DEFAULT_CHART_RADIAL_STACKED_BAR_PAD_ANGLE).toBeCloseTo(0.01);
    expect(DEFAULT_CHART_RADIAL_STACKED_BAR_START_ANGLE).toBeCloseTo(-Math.PI / 2);
    expect(DEFAULT_CHART_RADIAL_STACKED_BAR_FILL_OPACITY).toBeCloseTo(0.85);
    expect(DEFAULT_CHART_RADIAL_STACKED_BAR_PALETTE.length).toBe(10);
  });
});

describe('getRadialStackedBarDefaultColor', () => {
  it('palette + modulo + invalid fallback', () => {
    expect(getRadialStackedBarDefaultColor(0)).toBe(
      DEFAULT_CHART_RADIAL_STACKED_BAR_PALETTE[0]
    );
    expect(
      getRadialStackedBarDefaultColor(
        DEFAULT_CHART_RADIAL_STACKED_BAR_PALETTE.length
      )
    ).toBe(DEFAULT_CHART_RADIAL_STACKED_BAR_PALETTE[0]);
    expect(getRadialStackedBarDefaultColor(-1)).toBe(
      DEFAULT_CHART_RADIAL_STACKED_BAR_PALETTE[0]
    );
  });
});

describe('polarToCartesian', () => {
  it('center at radius=0; right at 0; down at pi/2', () => {
    expect(polarToCartesian(5, 7, 0, 1)).toEqual({ x: 5, y: 7 });
    const r = polarToCartesian(0, 0, 10, 0);
    expect(r.x).toBeCloseTo(10);
    expect(r.y).toBeCloseTo(0);
    const d = polarToCartesian(0, 0, 10, Math.PI / 2);
    expect(d.y).toBeCloseTo(10);
  });
});

describe('getRadialStackedBarCategoryTotal', () => {
  it('sums positive finite values', () => {
    expect(getRadialStackedBarCategoryTotal([10, 20, 30], new Set())).toBe(60);
  });
  it('respects hidden indices', () => {
    expect(getRadialStackedBarCategoryTotal([10, 20, 30], new Set([0]))).toBe(50);
  });
  it('skips non-finite + non-positive', () => {
    expect(
      getRadialStackedBarCategoryTotal([5, -1, Number.NaN, 0, 3], new Set())
    ).toBe(8);
  });
});

describe('computeRadialStackedBarLayout', () => {
  const cx = 190;
  const cy = 190;
  const innerRadius = 30;
  const outerRadius = 160;

  it('null / empty -> empty', () => {
    const r = computeRadialStackedBarLayout({
      categories: [],
      series: SERIES,
      hiddenSeries: new Set(),
      cx,
      cy,
      innerRadius,
      outerRadius,
      ringGap: 6,
      padAngle: 0,
      startAngle: 0,
      fallbackColor: '#999',
    });
    expect(r.rings).toEqual([]);
  });

  it('non-positive outerRadius / outer<=inner -> empty', () => {
    const a = computeRadialStackedBarLayout({
      categories: CATEGORIES,
      series: SERIES,
      hiddenSeries: new Set(),
      cx,
      cy,
      innerRadius,
      outerRadius: 0,
      ringGap: 6,
      padAngle: 0,
      startAngle: 0,
      fallbackColor: '#999',
    });
    expect(a.rings).toEqual([]);
    const b = computeRadialStackedBarLayout({
      categories: CATEGORIES,
      series: SERIES,
      hiddenSeries: new Set(),
      cx,
      cy,
      innerRadius: 200,
      outerRadius: 100,
      ringGap: 6,
      padAngle: 0,
      startAngle: 0,
      fallbackColor: '#999',
    });
    expect(b.rings).toEqual([]);
  });

  it('produces one ring per category', () => {
    const r = computeRadialStackedBarLayout({
      categories: CATEGORIES,
      series: SERIES,
      hiddenSeries: new Set(),
      cx,
      cy,
      innerRadius,
      outerRadius,
      ringGap: 6,
      padAngle: 0,
      startAngle: 0,
      fallbackColor: '#999',
    });
    expect(r.rings).toHaveLength(3);
  });

  it('rings stack outward (innerRadius < outerRadius; consecutive rings move outward)', () => {
    const r = computeRadialStackedBarLayout({
      categories: CATEGORIES,
      series: SERIES,
      hiddenSeries: new Set(),
      cx,
      cy,
      innerRadius,
      outerRadius,
      ringGap: 6,
      padAngle: 0,
      startAngle: 0,
      fallbackColor: '#999',
    });
    for (const ring of r.rings) {
      expect(ring.outerRadius).toBeGreaterThan(ring.innerRadius);
    }
    expect(r.rings[1]!.innerRadius).toBeGreaterThan(r.rings[0]!.outerRadius);
  });

  it('every ring stack sums to ~2pi (with no pad angle)', () => {
    const r = computeRadialStackedBarLayout({
      categories: CATEGORIES,
      series: SERIES,
      hiddenSeries: new Set(),
      cx,
      cy,
      innerRadius,
      outerRadius,
      ringGap: 0,
      padAngle: 0,
      startAngle: 0,
      fallbackColor: '#999',
    });
    for (const ring of r.rings) {
      if (ring.total <= 0) continue;
      let span = 0;
      for (const seg of ring.segments) span += seg.endAngle - seg.startAngle;
      expect(span).toBeCloseTo(Math.PI * 2);
    }
  });

  it('segment shareWithinCategory = value / categoryTotal', () => {
    const r = computeRadialStackedBarLayout({
      categories: CATEGORIES,
      series: SERIES,
      hiddenSeries: new Set(),
      cx,
      cy,
      innerRadius,
      outerRadius,
      ringGap: 0,
      padAngle: 0,
      startAngle: 0,
      fallbackColor: '#999',
    });
    const q1 = r.rings.find((ring) => ring.id === 'c1')!;
    const seg0 = q1.segments.find((s) => s.seriesId === 's1')!;
    expect(seg0.shareWithinCategory).toBeCloseTo(10 / 60);
    const seg2 = q1.segments.find((s) => s.seriesId === 's3')!;
    expect(seg2.shareWithinCategory).toBeCloseTo(30 / 60);
  });

  it('non-positive values produce no segment for that series in that ring', () => {
    const r = computeRadialStackedBarLayout({
      categories: CATEGORIES,
      series: SERIES,
      hiddenSeries: new Set(),
      cx,
      cy,
      innerRadius,
      outerRadius,
      ringGap: 0,
      padAngle: 0,
      startAngle: 0,
      fallbackColor: '#999',
    });
    const q2 = r.rings.find((ring) => ring.id === 'c2')!;
    // c2 has values [25, 25, 0] -> s3 has 0 value, so no segment
    const seg = q2.segments.find((s) => s.seriesId === 's3');
    expect(seg).toBeUndefined();
  });

  it('hidden series drop their segments from every ring', () => {
    const r = computeRadialStackedBarLayout({
      categories: CATEGORIES,
      series: SERIES,
      hiddenSeries: new Set(['s2']),
      cx,
      cy,
      innerRadius,
      outerRadius,
      ringGap: 0,
      padAngle: 0,
      startAngle: 0,
      fallbackColor: '#999',
    });
    for (const ring of r.rings) {
      const seriesIds = ring.segments.map((s) => s.seriesId);
      expect(seriesIds).not.toContain('s2');
    }
  });

  it('padAngle introduces gaps between segments within a ring', () => {
    const r = computeRadialStackedBarLayout({
      categories: CATEGORIES,
      series: SERIES,
      hiddenSeries: new Set(),
      cx,
      cy,
      innerRadius,
      outerRadius,
      ringGap: 0,
      padAngle: 0.1,
      startAngle: 0,
      fallbackColor: '#999',
    });
    const q1 = r.rings.find((ring) => ring.id === 'c1')!;
    for (let i = 0; i < q1.segments.length - 1; i++) {
      expect(
        q1.segments[i + 1]!.startAngle - q1.segments[i]!.endAngle
      ).toBeCloseTo(0.1);
    }
  });

  it('per-series color override beats palette', () => {
    const series: ChartRadialStackedBarSeries[] = [
      { id: 's1', label: 'A', color: '#abcdef' },
    ];
    const cats: ChartRadialStackedBarCategory[] = [
      { id: 'c1', label: 'Q', values: [10] },
    ];
    const r = computeRadialStackedBarLayout({
      categories: cats,
      series,
      hiddenSeries: new Set(),
      cx,
      cy,
      innerRadius,
      outerRadius,
      ringGap: 0,
      padAngle: 0,
      startAngle: 0,
      fallbackColor: '#999',
    });
    expect(r.rings[0]!.segments[0]!.color).toBe('#abcdef');
  });

  it('totalsByCategory matches per-category sums', () => {
    const r = computeRadialStackedBarLayout({
      categories: CATEGORIES,
      series: SERIES,
      hiddenSeries: new Set(),
      cx,
      cy,
      innerRadius,
      outerRadius,
      ringGap: 0,
      padAngle: 0,
      startAngle: 0,
      fallbackColor: '#999',
    });
    expect(r.totalsByCategory).toEqual([60, 50, 40]);
  });

  it('ringThickness = (available - gaps) / ringCount', () => {
    const r = computeRadialStackedBarLayout({
      categories: CATEGORIES,
      series: SERIES,
      hiddenSeries: new Set(),
      cx,
      cy,
      innerRadius,
      outerRadius,
      ringGap: 0,
      padAngle: 0,
      startAngle: 0,
      fallbackColor: '#999',
    });
    expect(r.ringThickness).toBeCloseTo((outerRadius - innerRadius) / 3);
  });

  it('every segment emits an M-prefixed path', () => {
    const r = computeRadialStackedBarLayout({
      categories: CATEGORIES,
      series: SERIES,
      hiddenSeries: new Set(),
      cx,
      cy,
      innerRadius,
      outerRadius,
      ringGap: 0,
      padAngle: 0,
      startAngle: 0,
      fallbackColor: '#999',
    });
    for (const ring of r.rings) {
      for (const seg of ring.segments) {
        expect(seg.path.startsWith('M')).toBe(true);
      }
    }
  });
});

describe('describeRadialStackedBarChart', () => {
  it('empty -> "No data"', () => {
    expect(describeRadialStackedBarChart([], SERIES, new Set())).toBe('No data');
    expect(describeRadialStackedBarChart(CATEGORIES, [], new Set())).toBe(
      'No data'
    );
  });
  it('all-hidden -> "No data"', () => {
    expect(
      describeRadialStackedBarChart(
        CATEGORIES,
        SERIES,
        new Set(['s1', 's2', 's3'])
      )
    ).toBe('No data');
  });
  it('includes ring count + visible series count + total', () => {
    const d = describeRadialStackedBarChart(CATEGORIES, SERIES, new Set());
    expect(d).toContain('3 rings');
    expect(d).toContain('3 visible series');
    expect(d).toContain('150');
  });
});

describe('<ChartRadialStackedBar> component', () => {
  it('renders region + custom aria-label', () => {
    const { getByRole } = render(
      <ChartRadialStackedBar
        categories={CATEGORIES}
        series={SERIES}
        ariaLabel="Test radial stack"
      />
    );
    expect(getByRole('region', { name: 'Test radial stack' })).toBeTruthy();
  });

  it('renders one ring per category', () => {
    const { container } = render(
      <ChartRadialStackedBar categories={CATEGORIES} series={SERIES} />
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-radial-stacked-bar-ring"]'
      ).length
    ).toBe(3);
  });

  it('renders one segment per (ring, visible series) with positive value', () => {
    const { container } = render(
      <ChartRadialStackedBar categories={CATEGORIES} series={SERIES} />
    );
    // c1: 3 segments, c2: 2 segments (s3=0 dropped), c3: 3 segments => 8 total
    expect(
      container.querySelectorAll(
        '[data-section="chart-radial-stacked-bar-segment"]'
      ).length
    ).toBe(8);
  });

  it('ring + segment data attrs mirror the layout', () => {
    const { container } = render(
      <ChartRadialStackedBar categories={CATEGORIES} series={SERIES} />
    );
    const ring = container.querySelector(
      '[data-ring-id="c1"]'
    ) as HTMLElement;
    expect(ring.getAttribute('data-ring-index')).toBe('0');
    expect(ring.getAttribute('data-ring-total')).toBe('60');
    const seg = container.querySelector(
      '[data-section="chart-radial-stacked-bar-segment"]'
    ) as HTMLElement;
    expect(seg.getAttribute('data-category-id')).toBe('c1');
    expect(seg.getAttribute('data-series-id')).toBeTruthy();
    expect(seg.getAttribute('data-segment-value')).toBeTruthy();
    expect(seg.getAttribute('data-segment-share')).toBeTruthy();
    expect(seg.getAttribute('data-segment-color')).toBeTruthy();
  });

  it('segment path role=graphics-symbol + tabIndex=0 + aria-label', () => {
    const { container } = render(
      <ChartRadialStackedBar categories={CATEGORIES} series={SERIES} />
    );
    const path = container.querySelector(
      '[data-section="chart-radial-stacked-bar-path"]'
    ) as SVGPathElement;
    expect(path.getAttribute('role')).toBe('graphics-symbol');
    expect(path.getAttribute('tabindex')).toBe('0');
    expect(path.getAttribute('aria-label')).toContain('Q1');
    expect(path.getAttribute('aria-label')).toContain('Series 1');
    expect(path.getAttribute('aria-label')).toContain('of Q1');
  });

  it('root mirrors counts + grand-total + ring-thickness + animate', () => {
    const { container } = render(
      <ChartRadialStackedBar categories={CATEGORIES} series={SERIES} />
    );
    const root = container.querySelector(
      '[data-section="chart-radial-stacked-bar"]'
    );
    expect(root?.getAttribute('data-category-count')).toBe('3');
    expect(root?.getAttribute('data-series-count')).toBe('3');
    expect(root?.getAttribute('data-visible-series-count')).toBe('3');
    expect(root?.getAttribute('data-segment-count')).toBe('8');
    expect(root?.getAttribute('data-grand-total')).toBe('150');
    expect(root?.getAttribute('data-animate')).toBe('true');
    expect(root?.getAttribute('data-ring-thickness')).toBeTruthy();
  });

  it('legend renders one button per series', () => {
    const { container } = render(
      <ChartRadialStackedBar categories={CATEGORIES} series={SERIES} />
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-radial-stacked-bar-legend-button"]'
      ).length
    ).toBe(3);
  });

  it('legend toggle fires onSeriesToggle + reduces visible-count (uncontrolled)', () => {
    const onSeriesToggle = vi.fn();
    const { container } = render(
      <ChartRadialStackedBar
        categories={CATEGORIES}
        series={SERIES}
        onSeriesToggle={onSeriesToggle}
      />
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-radial-stacked-bar-legend-button"]'
    );
    fireEvent.click(buttons[1]! as HTMLElement);
    expect(onSeriesToggle).toHaveBeenCalledTimes(1);
    expect(onSeriesToggle.mock.calls[0]![0].series.id).toBe('s2');
    expect(onSeriesToggle.mock.calls[0]![0].hidden).toBe(true);
    const root = container.querySelector(
      '[data-section="chart-radial-stacked-bar"]'
    );
    expect(root?.getAttribute('data-visible-series-count')).toBe('2');
  });

  it('legend respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartRadialStackedBar
        categories={CATEGORIES}
        series={SERIES}
        hiddenSeries={['s3']}
      />
    );
    const root = container.querySelector(
      '[data-section="chart-radial-stacked-bar"]'
    );
    expect(root?.getAttribute('data-visible-series-count')).toBe('2');
  });

  it('showLegend=false suppresses the legend', () => {
    const { container } = render(
      <ChartRadialStackedBar
        categories={CATEGORIES}
        series={SERIES}
        showLegend={false}
      />
    );
    expect(
      container.querySelector(
        '[data-section="chart-radial-stacked-bar-legend"]'
      )
    ).toBeNull();
  });

  it('legend placement = right reverses layout', () => {
    const { container } = render(
      <ChartRadialStackedBar
        categories={CATEGORIES}
        series={SERIES}
        legendPlacement="right"
      />
    );
    const legend = container.querySelector(
      '[data-section="chart-radial-stacked-bar-legend"]'
    );
    expect(legend?.getAttribute('data-placement')).toBe('right');
  });

  it('center total renders grand total by default', () => {
    const { container } = render(
      <ChartRadialStackedBar categories={CATEGORIES} series={SERIES} />
    );
    expect(
      container.querySelector(
        '[data-section="chart-radial-stacked-bar-center-value"]'
      )?.textContent
    ).toBe('150');
  });

  it('centerLabel renders alongside the value', () => {
    const { container } = render(
      <ChartRadialStackedBar
        categories={CATEGORIES}
        series={SERIES}
        centerLabel="Total"
      />
    );
    expect(
      container.querySelector(
        '[data-section="chart-radial-stacked-bar-center-label"]'
      )?.textContent
    ).toBe('Total');
  });

  it('showCenterTotal=false suppresses the center group', () => {
    const { container } = render(
      <ChartRadialStackedBar
        categories={CATEGORIES}
        series={SERIES}
        showCenterTotal={false}
      />
    );
    expect(
      container.querySelector(
        '[data-section="chart-radial-stacked-bar-center"]'
      )
    ).toBeNull();
  });

  it('tooltip opens on segment hover with category + series + value + share', () => {
    const { container } = render(
      <ChartRadialStackedBar categories={CATEGORIES} series={SERIES} />
    );
    const seg = container.querySelector(
      '[data-section="chart-radial-stacked-bar-segment"]'
    ) as HTMLElement;
    fireEvent.mouseEnter(seg);
    expect(
      container.querySelector(
        '[data-section="chart-radial-stacked-bar-tooltip"]'
      )
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-radial-stacked-bar-tooltip-label"]'
      )?.textContent
    ).toContain('Q1');
    expect(
      container.querySelector(
        '[data-section="chart-radial-stacked-bar-tooltip-value"]'
      )?.textContent
    ).toBe('10');
    expect(
      container.querySelector(
        '[data-section="chart-radial-stacked-bar-tooltip-share"]'
      )?.textContent
    ).toContain('17%');
  });

  it('tooltip hides on mouseleave', () => {
    const { container } = render(
      <ChartRadialStackedBar categories={CATEGORIES} series={SERIES} />
    );
    const seg = container.querySelector(
      '[data-section="chart-radial-stacked-bar-segment"]'
    ) as HTMLElement;
    fireEvent.mouseEnter(seg);
    expect(
      container.querySelector(
        '[data-section="chart-radial-stacked-bar-tooltip"]'
      )
    ).not.toBeNull();
    fireEvent.mouseLeave(seg);
    expect(
      container.querySelector(
        '[data-section="chart-radial-stacked-bar-tooltip"]'
      )
    ).toBeNull();
  });

  it('showTooltip=false suppresses the tooltip', () => {
    const { container } = render(
      <ChartRadialStackedBar
        categories={CATEGORIES}
        series={SERIES}
        showTooltip={false}
      />
    );
    fireEvent.mouseEnter(
      container.querySelector(
        '[data-section="chart-radial-stacked-bar-segment"]'
      )! as HTMLElement
    );
    expect(
      container.querySelector(
        '[data-section="chart-radial-stacked-bar-tooltip"]'
      )
    ).toBeNull();
  });

  it('formatValue + formatPercent reach tooltip + aria-label', () => {
    const { container } = render(
      <ChartRadialStackedBar
        categories={CATEGORIES}
        series={SERIES}
        formatValue={(v) => `${v}u`}
        formatPercent={(p) => `${(p * 100).toFixed(1)}pct`}
      />
    );
    const path = container.querySelector(
      '[data-section="chart-radial-stacked-bar-path"]'
    ) as SVGPathElement;
    expect(path.getAttribute('aria-label')).toContain('u');
    expect(path.getAttribute('aria-label')).toContain('pct');
    fireEvent.mouseEnter(
      container.querySelector(
        '[data-section="chart-radial-stacked-bar-segment"]'
      )! as HTMLElement
    );
    expect(
      container.querySelector(
        '[data-section="chart-radial-stacked-bar-tooltip-value"]'
      )?.textContent
    ).toBe('10u');
  });

  it('onSegmentClick fires with segment payload', () => {
    const onSegmentClick = vi.fn();
    const { container } = render(
      <ChartRadialStackedBar
        categories={CATEGORIES}
        series={SERIES}
        onSegmentClick={onSegmentClick}
      />
    );
    const segs = container.querySelectorAll(
      '[data-section="chart-radial-stacked-bar-segment"]'
    );
    fireEvent.click(segs[1]! as HTMLElement);
    expect(onSegmentClick).toHaveBeenCalledTimes(1);
    expect(onSegmentClick.mock.calls[0]![0].segment.categoryId).toBe('c1');
  });

  it('data-hovered mirrors hover state', () => {
    const { container } = render(
      <ChartRadialStackedBar categories={CATEGORIES} series={SERIES} />
    );
    const seg = container.querySelector(
      '[data-section="chart-radial-stacked-bar-segment"]'
    ) as HTMLElement;
    expect(seg.getAttribute('data-hovered')).toBe('false');
    fireEvent.mouseEnter(seg);
    expect(seg.getAttribute('data-hovered')).toBe('true');
    fireEvent.mouseLeave(seg);
    expect(seg.getAttribute('data-hovered')).toBe('false');
  });

  it('auto ARIA description renders by default', () => {
    const { container } = render(
      <ChartRadialStackedBar categories={CATEGORIES} series={SERIES} />
    );
    expect(
      container.querySelector(
        '[data-section="chart-radial-stacked-bar-aria-desc"]'
      )?.textContent
    ).toContain('3 rings');
  });

  it('ariaDescription override beats auto', () => {
    const { container } = render(
      <ChartRadialStackedBar
        categories={CATEGORIES}
        series={SERIES}
        ariaDescription="Override"
      />
    );
    expect(
      container.querySelector(
        '[data-section="chart-radial-stacked-bar-aria-desc"]'
      )?.textContent
    ).toBe('Override');
  });

  it('SVG mirrors width / height / viewBox', () => {
    const { container } = render(
      <ChartRadialStackedBar
        categories={CATEGORIES}
        series={SERIES}
        width={400}
        height={400}
      />
    );
    const svg = container.querySelector(
      '[data-section="chart-radial-stacked-bar-svg"]'
    ) as SVGElement;
    expect(svg.getAttribute('width')).toBe('400');
    expect(svg.getAttribute('height')).toBe('400');
    expect(svg.getAttribute('viewBox')).toBe('0 0 400 400');
  });

  it('empty input renders without crashing', () => {
    const { container } = render(
      <ChartRadialStackedBar categories={[]} series={SERIES} />
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-radial-stacked-bar-segment"]'
      ).length
    ).toBe(0);
    expect(
      container.querySelector(
        '[data-section="chart-radial-stacked-bar-aria-desc"]'
      )?.textContent
    ).toBe('No data');
  });

  it('forwards ref to root', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartRadialStackedBar
        categories={CATEGORIES}
        series={SERIES}
        ref={ref}
      />
    );
    expect(ref.current?.dataset.section).toBe('chart-radial-stacked-bar');
  });

  it('has stable displayName', () => {
    expect(ChartRadialStackedBar.displayName).toBe('ChartRadialStackedBar');
  });

  it('data-animate mirrors prop', () => {
    const { container } = render(
      <ChartRadialStackedBar
        categories={CATEGORIES}
        series={SERIES}
        animate={false}
      />
    );
    expect(
      container.querySelector('[data-section="chart-radial-stacked-bar"]')!
        .getAttribute('data-animate')
    ).toBe('false');
  });
});
