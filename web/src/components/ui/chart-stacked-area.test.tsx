import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartStackedArea,
  DEFAULT_CHART_STACKED_AREA_HEIGHT,
  DEFAULT_CHART_STACKED_AREA_MODE,
  DEFAULT_CHART_STACKED_AREA_PADDING,
  DEFAULT_CHART_STACKED_AREA_TICK_COUNT,
  DEFAULT_CHART_STACKED_AREA_WIDTH,
  buildStackedAreaBandPath,
  computeStackedAreaLayout,
  describeStackedAreaChart,
  getStackedAreaMaxTotal,
  getStackedAreaTicks,
  getStackedAreaTotalAt,
} from './chart-stacked-area';
import type {
  ChartStackedAreaSeries,
  StackedAreaPoint,
} from './chart-stacked-area';

const series: ChartStackedAreaSeries[] = [
  { id: 'a', label: 'A', data: [10, 20, 30, 20, 10] },
  { id: 'b', label: 'B', data: [5, 15, 25, 35, 25] },
  { id: 'c', label: 'C', data: [3, 6, 9, 12, 15] },
];

describe('chart-stacked-area pure helpers', () => {
  describe('getStackedAreaTotalAt', () => {
    it('sums visible series at index', () => {
      expect(
        getStackedAreaTotalAt(series, new Set(), 0),
      ).toBe(18);
      expect(
        getStackedAreaTotalAt(series, new Set(), 3),
      ).toBe(67);
    });
    it('skips hidden series', () => {
      expect(
        getStackedAreaTotalAt(series, new Set(['b']), 0),
      ).toBe(13);
    });
    it('ignores non-finite + non-positive values', () => {
      expect(
        getStackedAreaTotalAt(
          [
            {
              id: 'x',
              label: 'x',
              data: [10, Number.NaN, -3],
            },
          ],
          new Set(),
          1,
        ),
      ).toBe(0);
      expect(
        getStackedAreaTotalAt(
          [
            {
              id: 'x',
              label: 'x',
              data: [10, Number.NaN, -3],
            },
          ],
          new Set(),
          2,
        ),
      ).toBe(0);
    });
    it('returns 0 for empty series', () => {
      expect(getStackedAreaTotalAt([], new Set(), 0)).toBe(0);
    });
  });

  describe('getStackedAreaMaxTotal', () => {
    it('returns largest column total', () => {
      expect(getStackedAreaMaxTotal(series, new Set())).toBe(67);
    });
    it('respects hidden series filter', () => {
      const max = getStackedAreaMaxTotal(
        series,
        new Set(['b']),
      );
      // visible: a + c; column sums = 13, 26, 39, 32, 25 -> 39
      expect(max).toBe(39);
    });
    it('falls back to 1 for empty / zero-length', () => {
      expect(getStackedAreaMaxTotal([], new Set())).toBe(1);
      expect(
        getStackedAreaMaxTotal(
          [{ id: 'x', label: 'x', data: [] }],
          new Set(),
        ),
      ).toBe(1);
    });
    it('falls back to 1 when all data is non-finite', () => {
      expect(
        getStackedAreaMaxTotal(
          [
            { id: 'x', label: 'x', data: [Number.NaN] },
            { id: 'y', label: 'y', data: [Number.NaN] },
          ],
          new Set(),
        ),
      ).toBe(1);
    });
  });

  describe('computeStackedAreaLayout', () => {
    it('returns [] for empty series', () => {
      expect(
        computeStackedAreaLayout(
          [],
          new Set(),
          'absolute',
          100,
          100,
          0,
          0,
        ),
      ).toEqual([]);
    });
    it('emits one entry per series with one point per sample', () => {
      const layout = computeStackedAreaLayout(
        series,
        new Set(),
        'absolute',
        300,
        100,
        0,
        0,
      );
      expect(layout.length).toBe(series.length);
      for (const entry of layout) {
        expect(entry.points.length).toBe(5);
      }
    });
    it('stacks layers without overlap in absolute mode', () => {
      const layout = computeStackedAreaLayout(
        series,
        new Set(),
        'absolute',
        300,
        100,
        0,
        0,
      );
      for (let i = 0; i < layout.length - 1; i += 1) {
        const a = layout[i]!.points[0]!;
        const b = layout[i + 1]!.points[0]!;
        // SVG y grows downward; the chart paints from
        // the baseline (largest y) upward. Series 0 sits
        // at the bottom of the stack, series 1 above it.
        // Their boundary: a.upperY (top of A) === b.lowerY (bottom of B).
        expect(a.upperY).toBeCloseTo(b.lowerY, 2);
      }
    });
    it('normalises every column to 1 in percentage mode', () => {
      const layout = computeStackedAreaLayout(
        series,
        new Set(),
        'percentage',
        300,
        100,
        0,
        0,
      );
      // For each x index, summing the visible series ratios should == 1
      const length = 5;
      for (let i = 0; i < length; i += 1) {
        const totalRatio = layout.reduce(
          (s, l) => s + (l.points[i]?.ratio ?? 0),
          0,
        );
        expect(totalRatio).toBeCloseTo(1, 5);
      }
    });
    it('collapses hidden layers to baseline', () => {
      const layout = computeStackedAreaLayout(
        series,
        new Set(['b']),
        'absolute',
        300,
        100,
        0,
        0,
      );
      const b = layout.find((l) => l.series.id === 'b');
      expect(b?.hidden).toBe(true);
      for (const p of b?.points ?? []) {
        expect(p.upperY).toBe(p.lowerY);
        expect(p.rawValue).toBe(0);
      }
    });
  });

  describe('buildStackedAreaBandPath', () => {
    it('returns "" for empty points', () => {
      expect(buildStackedAreaBandPath([], false)).toBe('');
    });
    it('handles a single point with a closing Z', () => {
      const path = buildStackedAreaBandPath(
        [
          {
            x: 10,
            upperY: 5,
            lowerY: 15,
            rawValue: 1,
            total: 1,
            ratio: 1,
          },
        ],
        false,
      );
      expect(path).toMatch(/^M /);
      expect(path).toMatch(/Z$/);
    });
    it('emits L segments when smooth=false', () => {
      const pts: StackedAreaPoint[] = [
        { x: 0, upperY: 0, lowerY: 10, rawValue: 1, total: 1, ratio: 1 },
        { x: 10, upperY: 0, lowerY: 10, rawValue: 1, total: 1, ratio: 1 },
        { x: 20, upperY: 0, lowerY: 10, rawValue: 1, total: 1, ratio: 1 },
      ];
      const path = buildStackedAreaBandPath(pts, false);
      expect(path).toMatch(/^M /);
      expect((path.match(/L /g) || []).length).toBeGreaterThan(0);
      expect((path.match(/C /g) || []).length).toBe(0);
    });
    it('emits C commands when smooth=true with >= 3 points', () => {
      const pts: StackedAreaPoint[] = [
        { x: 0, upperY: 0, lowerY: 10, rawValue: 1, total: 1, ratio: 1 },
        { x: 10, upperY: 5, lowerY: 15, rawValue: 1, total: 1, ratio: 1 },
        { x: 20, upperY: 0, lowerY: 10, rawValue: 1, total: 1, ratio: 1 },
      ];
      const path = buildStackedAreaBandPath(pts, true);
      expect((path.match(/C /g) || []).length).toBeGreaterThan(0);
    });
  });

  describe('getStackedAreaTicks', () => {
    it('emits absolute ticks from 0 to max', () => {
      expect(getStackedAreaTicks(100, 'absolute', 5)).toEqual([
        0, 25, 50, 75, 100,
      ]);
    });
    it('emits percentage ticks from 0 to 1', () => {
      expect(getStackedAreaTicks(100, 'percentage', 5)).toEqual([
        0, 0.25, 0.5, 0.75, 1,
      ]);
    });
    it('returns [0] when max is non-positive in absolute mode', () => {
      expect(getStackedAreaTicks(0, 'absolute')).toEqual([0]);
    });
    it('clamps minimum count to 2', () => {
      expect(getStackedAreaTicks(100, 'absolute', 1)).toEqual([
        0, 100,
      ]);
    });
  });

  describe('describeStackedAreaChart', () => {
    it('returns "No data" for empty input', () => {
      expect(
        describeStackedAreaChart(
          [],
          new Set(),
          'absolute',
        ),
      ).toBe('No data');
    });
    it('summarises mode + per-layer sum', () => {
      const text = describeStackedAreaChart(
        series,
        new Set(),
        'absolute',
      );
      expect(text).toContain('absolute');
      expect(text).toContain('3 visible layers');
      expect(text).toContain('A sum');
    });
    it('reports percentage mode', () => {
      const text = describeStackedAreaChart(
        series,
        new Set(),
        'percentage',
      );
      expect(text).toContain('percentage');
    });
    it('excludes hidden layers from visible count', () => {
      const text = describeStackedAreaChart(
        series,
        new Set(['b']),
        'absolute',
      );
      expect(text).toContain('2 visible layers');
      expect(text).not.toContain('B sum');
    });
  });

  it('exports default constants', () => {
    expect(DEFAULT_CHART_STACKED_AREA_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_STACKED_AREA_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_STACKED_AREA_PADDING).toBeGreaterThan(0);
    expect(DEFAULT_CHART_STACKED_AREA_TICK_COUNT).toBeGreaterThan(
      0,
    );
    expect(DEFAULT_CHART_STACKED_AREA_MODE).toBe('absolute');
  });
});

describe('<ChartStackedArea />', () => {
  it('renders a region with role + aria-label', () => {
    render(<ChartStackedArea series={series} />);
    const root = screen.getByRole('region', {
      name: 'Stacked area chart',
    });
    expect(root).toBeInTheDocument();
    expect(root).toHaveAttribute(
      'data-section',
      'chart-stacked-area',
    );
    expect(root).toHaveAttribute('data-mode', 'absolute');
    expect(root).toHaveAttribute('data-series-count', '3');
    expect(root).toHaveAttribute('data-visible-count', '3');
    expect(root).toHaveAttribute('data-sample-count', '5');
  });

  it('renders a custom aria-label', () => {
    render(
      <ChartStackedArea
        series={series}
        ariaLabel="Bandwidth"
      />,
    );
    expect(
      screen.getByRole('region', { name: 'Bandwidth' }),
    ).toBeInTheDocument();
  });

  it('renders one band per series', () => {
    const { container } = render(
      <ChartStackedArea series={series} />,
    );
    const bands = container.querySelectorAll(
      '[data-section="chart-stacked-area-band"]',
    );
    expect(bands.length).toBe(series.length);
  });

  it('mirrors series metadata on the layer group', () => {
    const { container } = render(
      <ChartStackedArea series={series} />,
    );
    const aLayer = container.querySelector(
      '[data-section="chart-stacked-area-layer"][data-series-id="a"]',
    );
    expect(aLayer?.getAttribute('data-series-color')).toMatch(
      /^#/,
    );
  });

  it('honours custom series color', () => {
    const colored: ChartStackedAreaSeries[] = series.map(
      (s, i) => (i === 0 ? { ...s, color: '#ff00aa' } : s),
    );
    const { container } = render(
      <ChartStackedArea series={colored} />,
    );
    const aLayer = container.querySelector(
      '[data-section="chart-stacked-area-layer"][data-series-id="a"]',
    );
    expect(aLayer?.getAttribute('data-series-color')).toBe(
      '#ff00aa',
    );
  });

  it('renders mode toggle by default + toggles mode on click', () => {
    const { container } = render(
      <ChartStackedArea series={series} />,
    );
    const root = container.querySelector(
      '[data-section="chart-stacked-area"]',
    );
    expect(root?.getAttribute('data-mode')).toBe('absolute');
    const btn = container.querySelector(
      '[data-section="chart-stacked-area-mode-button"]',
    );
    fireEvent.click(btn!);
    expect(root?.getAttribute('data-mode')).toBe('percentage');
    fireEvent.click(btn!);
    expect(root?.getAttribute('data-mode')).toBe('absolute');
  });

  it('honours defaultMode initially', () => {
    const { container } = render(
      <ChartStackedArea
        series={series}
        defaultMode="percentage"
      />,
    );
    expect(
      container
        .querySelector('[data-section="chart-stacked-area"]')
        ?.getAttribute('data-mode'),
    ).toBe('percentage');
  });

  it('respects controlled mode prop', () => {
    const onChange = vi.fn();
    const { container } = render(
      <ChartStackedArea
        series={series}
        mode="percentage"
        onModeChange={onChange}
      />,
    );
    const btn = container.querySelector(
      '[data-section="chart-stacked-area-mode-button"]',
    );
    fireEvent.click(btn!);
    expect(onChange).toHaveBeenCalledWith('absolute');
    // root mode stays percentage because it's controlled
    expect(
      container
        .querySelector('[data-section="chart-stacked-area"]')
        ?.getAttribute('data-mode'),
    ).toBe('percentage');
  });

  it('suppresses mode toggle when showModeToggle=false', () => {
    const { container } = render(
      <ChartStackedArea
        series={series}
        showModeToggle={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-stacked-area-mode-toggle"]',
      ),
    ).toBeNull();
  });

  it('renders a legend by default', () => {
    const { container } = render(
      <ChartStackedArea series={series} />,
    );
    const items = container.querySelectorAll(
      '[data-section="chart-stacked-area-legend-item"]',
    );
    expect(items.length).toBe(series.length);
  });

  it('suppresses legend when showLegend=false', () => {
    const { container } = render(
      <ChartStackedArea
        series={series}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-stacked-area-legend"]',
      ),
    ).toBeNull();
  });

  it('toggles series visibility on legend click', () => {
    const { container } = render(
      <ChartStackedArea series={series} />,
    );
    const button = container.querySelector(
      '[data-section="chart-stacked-area-legend-button"][data-series-id="b"]',
    );
    fireEvent.click(button!);
    const root = container.querySelector(
      '[data-section="chart-stacked-area"]',
    );
    expect(root?.getAttribute('data-visible-count')).toBe('2');
    const bItem = container.querySelector(
      '[data-section="chart-stacked-area-legend-item"][data-series-id="b"]',
    );
    expect(bItem?.getAttribute('data-series-hidden')).toBe(
      'true',
    );
    const bands = container.querySelectorAll(
      '[data-section="chart-stacked-area-band"]',
    );
    expect(bands.length).toBe(2);
    fireEvent.click(button!);
    expect(root?.getAttribute('data-visible-count')).toBe('3');
  });

  it('respects controlled hiddenSeries prop', () => {
    const onHidden = vi.fn();
    const { container } = render(
      <ChartStackedArea
        series={series}
        hiddenSeries={['a']}
        onHiddenSeriesChange={onHidden}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-stacked-area"]',
    );
    expect(root?.getAttribute('data-visible-count')).toBe('2');
    const aButton = container.querySelector(
      '[data-section="chart-stacked-area-legend-button"][data-series-id="a"]',
    );
    fireEvent.click(aButton!);
    expect(onHidden).toHaveBeenCalledWith([]);
    // root stays controlled (still shows hidden)
    expect(root?.getAttribute('data-visible-count')).toBe('2');
  });

  it('honours defaultHiddenSeries initially', () => {
    const { container } = render(
      <ChartStackedArea
        series={series}
        defaultHiddenSeries={['c']}
      />,
    );
    expect(
      container
        .querySelector('[data-section="chart-stacked-area"]')
        ?.getAttribute('data-visible-count'),
    ).toBe('2');
  });

  it('renders y-axis tick labels with absolute values by default', () => {
    const { container } = render(
      <ChartStackedArea series={series} />,
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-stacked-area-tick-label"]',
    );
    expect(labels.length).toBeGreaterThan(0);
    expect(labels[0]?.textContent).not.toContain('%');
  });

  it('renders y-axis tick labels with percentages in percentage mode', () => {
    const { container } = render(
      <ChartStackedArea series={series} mode="percentage" />,
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-stacked-area-tick-label"]',
    );
    const hasPercent = Array.from(labels).some((l) =>
      l.textContent?.includes('%'),
    );
    expect(hasPercent).toBe(true);
  });

  it('suppresses tick labels when showAxisTicks=false', () => {
    const { container } = render(
      <ChartStackedArea
        series={series}
        showAxisTicks={false}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-stacked-area-tick-label"]',
      ),
    ).toBeNull();
  });

  it('renders x labels when supplied', () => {
    const { container } = render(
      <ChartStackedArea
        series={series}
        xLabels={['Jan', 'Feb', 'Mar', 'Apr', 'May']}
      />,
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-stacked-area-xlabel"]',
    );
    expect(labels.length).toBe(5);
    expect(labels[0]?.textContent).toBe('Jan');
  });

  it('shows tooltip on band hover with value rows', () => {
    const { container } = render(
      <ChartStackedArea series={series} />,
    );
    const band = container.querySelector(
      '[data-section="chart-stacked-area-band"]',
    );
    fireEvent.mouseEnter(band!, { clientX: 0 });
    const tip = container.querySelector(
      '[data-section="chart-stacked-area-tooltip"]',
    );
    expect(tip).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-stacked-area-tooltip-label"]',
      )?.textContent,
    ).toBe('A');
  });

  it('shows percent row in tooltip only when mode=percentage', () => {
    const { container, rerender } = render(
      <ChartStackedArea series={series} />,
    );
    const band = container.querySelector(
      '[data-section="chart-stacked-area-band"]',
    );
    fireEvent.mouseEnter(band!, { clientX: 0 });
    expect(
      container.querySelector(
        '[data-section="chart-stacked-area-tooltip-percent"]',
      ),
    ).toBeNull();
    rerender(
      <ChartStackedArea
        series={series}
        mode="percentage"
      />,
    );
    fireEvent.mouseEnter(band!, { clientX: 0 });
    expect(
      container.querySelector(
        '[data-section="chart-stacked-area-tooltip-percent"]',
      ),
    ).not.toBeNull();
  });

  it('hides tooltip on mouse-leave', () => {
    const { container } = render(
      <ChartStackedArea series={series} />,
    );
    const band = container.querySelector(
      '[data-section="chart-stacked-area-band"]',
    );
    fireEvent.mouseEnter(band!, { clientX: 0 });
    fireEvent.mouseLeave(band!);
    expect(
      container.querySelector(
        '[data-section="chart-stacked-area-tooltip"]',
      ),
    ).toBeNull();
  });

  it('suppresses tooltip when showTooltip=false', () => {
    const { container } = render(
      <ChartStackedArea
        series={series}
        showTooltip={false}
      />,
    );
    const band = container.querySelector(
      '[data-section="chart-stacked-area-band"]',
    );
    fireEvent.mouseEnter(band!, { clientX: 0 });
    expect(
      container.querySelector(
        '[data-section="chart-stacked-area-tooltip"]',
      ),
    ).toBeNull();
  });

  it('mirrors data-hovered on hovered layer', () => {
    const { container } = render(
      <ChartStackedArea series={series} />,
    );
    const bands = container.querySelectorAll(
      '[data-section="chart-stacked-area-band"]',
    );
    fireEvent.mouseEnter(bands[1]!, { clientX: 0 });
    const layer = container.querySelector(
      '[data-section="chart-stacked-area-layer"][data-series-id="b"]',
    );
    expect(layer?.getAttribute('data-hovered')).toBe('true');
  });

  it('invokes onSeriesClick when legend toggled', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ChartStackedArea
        series={series}
        onSeriesClick={onClick}
      />,
    );
    const button = container.querySelector(
      '[data-section="chart-stacked-area-legend-button"][data-series-id="b"]',
    );
    fireEvent.click(button!);
    expect(onClick).toHaveBeenCalledTimes(1);
    const arg = onClick.mock.calls[0]?.[0];
    expect(arg?.series?.id).toBe('b');
    expect(arg?.index).toBe(1);
    expect(arg?.hidden).toBe(true);
  });

  it('exposes role=graphics-symbol + aria-label per band', () => {
    const { container } = render(
      <ChartStackedArea series={series} />,
    );
    const band = container.querySelector(
      '[data-section="chart-stacked-area-band"]',
    );
    expect(band?.getAttribute('role')).toBe('graphics-symbol');
    expect(band?.getAttribute('aria-label')).toBe('A');
  });

  it('mirrors animate flag on the root', () => {
    const { container, rerender } = render(
      <ChartStackedArea series={series} />,
    );
    expect(
      container
        .querySelector('[data-section="chart-stacked-area"]')
        ?.getAttribute('data-animate'),
    ).toBe('true');
    rerender(
      <ChartStackedArea
        series={series}
        animate={false}
      />,
    );
    expect(
      container
        .querySelector('[data-section="chart-stacked-area"]')
        ?.getAttribute('data-animate'),
    ).toBe('false');
  });

  it('mirrors smooth flag on the root', () => {
    const { container, rerender } = render(
      <ChartStackedArea series={series} />,
    );
    expect(
      container
        .querySelector('[data-section="chart-stacked-area"]')
        ?.getAttribute('data-smooth'),
    ).toBe('true');
    rerender(
      <ChartStackedArea series={series} smooth={false} />,
    );
    expect(
      container
        .querySelector('[data-section="chart-stacked-area"]')
        ?.getAttribute('data-smooth'),
    ).toBe('false');
  });

  it('mirrors size on the svg', () => {
    const { container } = render(
      <ChartStackedArea
        series={series}
        width={800}
        height={400}
      />,
    );
    const svg = container.querySelector(
      '[data-section="chart-stacked-area-svg"]',
    );
    expect(svg?.getAttribute('width')).toBe('800');
    expect(svg?.getAttribute('height')).toBe('400');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 800 400');
  });

  it('renders auto ARIA description by default', () => {
    const { container } = render(
      <ChartStackedArea series={series} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-stacked-area-aria-desc"]',
    );
    expect(desc?.textContent).toContain(
      'Stacked area chart (absolute)',
    );
  });

  it('honours ariaDescription override', () => {
    const { container } = render(
      <ChartStackedArea
        series={series}
        ariaDescription="custom"
      />,
    );
    const desc = container.querySelector(
      '[data-section="chart-stacked-area-aria-desc"]',
    );
    expect(desc?.textContent).toBe('custom');
  });

  it('handles empty series without crashing', () => {
    const { container } = render(
      <ChartStackedArea series={[]} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-stacked-area"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelectorAll(
        '[data-section="chart-stacked-area-band"]',
      ).length,
    ).toBe(0);
  });

  it('forwards ref to the root region', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartStackedArea ref={ref} series={series} />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-stacked-area',
    );
  });

  it('has a stable displayName', () => {
    expect(ChartStackedArea.displayName).toBe(
      'ChartStackedArea',
    );
  });
});
