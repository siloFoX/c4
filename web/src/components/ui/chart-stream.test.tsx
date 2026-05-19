import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartStream,
  DEFAULT_CHART_STREAM_HEIGHT,
  DEFAULT_CHART_STREAM_PADDING,
  DEFAULT_CHART_STREAM_WIDTH,
  buildStreamPath,
  computeStreamLayout,
  describeStreamChart,
  getStreamMax,
  getStreamTotalAt,
} from './chart-stream';
import type {
  ChartStreamSeries,
  StreamLayoutPoint,
} from './chart-stream';

const series: ChartStreamSeries[] = [
  { id: 'a', label: 'A', data: [10, 20, 30, 20, 10] },
  { id: 'b', label: 'B', data: [5, 15, 25, 35, 25] },
  { id: 'c', label: 'C', data: [3, 6, 9, 12, 15] },
];

describe('chart-stream pure helpers', () => {
  describe('getStreamTotalAt', () => {
    it('sums values across series at an index', () => {
      expect(getStreamTotalAt(series, 0)).toBe(18);
      expect(getStreamTotalAt(series, 3)).toBe(67);
    });
    it('clamps non-finite + non-positive values to zero', () => {
      expect(
        getStreamTotalAt(
          [
            { id: 'x', label: 'x', data: [5, Number.NaN] },
            { id: 'y', label: 'y', data: [-3, 10] },
          ],
          0,
        ),
      ).toBe(5);
      expect(
        getStreamTotalAt(
          [
            { id: 'x', label: 'x', data: [5, Number.NaN] },
            { id: 'y', label: 'y', data: [-3, 10] },
          ],
          1,
        ),
      ).toBe(10);
    });
    it('returns 0 for empty series', () => {
      expect(getStreamTotalAt([], 0)).toBe(0);
    });
  });

  describe('getStreamMax', () => {
    it('returns the largest column sum', () => {
      expect(getStreamMax(series)).toBe(67);
    });
    it('falls back to 1 for empty series', () => {
      expect(getStreamMax([])).toBe(1);
    });
    it('falls back to 1 for zero-length data', () => {
      expect(
        getStreamMax([{ id: 'x', label: 'x', data: [] }]),
      ).toBe(1);
    });
    it('falls back to 1 when all data is non-finite or zero', () => {
      expect(
        getStreamMax([
          { id: 'x', label: 'x', data: [0, 0] },
          { id: 'y', label: 'y', data: [Number.NaN, Number.NaN] },
        ]),
      ).toBe(1);
    });
  });

  describe('computeStreamLayout', () => {
    it('returns [] for empty series', () => {
      expect(
        computeStreamLayout([], 100, 100, 10, 10),
      ).toEqual([]);
    });
    it('returns empty points for zero-length data', () => {
      const layout = computeStreamLayout(
        [{ id: 'x', label: 'x', data: [] }],
        100,
        100,
        10,
        10,
      );
      expect(layout.length).toBe(1);
      expect(layout[0]?.points.length).toBe(0);
    });
    it('emits one point per data sample per series', () => {
      const layout = computeStreamLayout(
        series,
        300,
        100,
        10,
        10,
      );
      expect(layout.length).toBe(series.length);
      for (const entry of layout) {
        expect(entry.points.length).toBe(5);
      }
    });
    it('first series bands sit above subsequent series', () => {
      const layout = computeStreamLayout(
        series,
        300,
        100,
        10,
        10,
      );
      const aPoint = layout[0]?.points[0]!;
      const bPoint = layout[1]?.points[0]!;
      expect(aPoint.lowerY).toBeCloseTo(bPoint.upperY, 2);
    });
    it('stack is centered around chart middle', () => {
      const layout = computeStreamLayout(
        series,
        300,
        100,
        10,
        10,
      );
      // centerY = 10 + 50 = 60
      // for x=3 total=67, max=67 -> totalH=100, top=10, bottom=110
      const top = layout[0]?.points[3]!.upperY;
      const bottom = layout[layout.length - 1]?.points[3]!.lowerY;
      const mid = ((top ?? 0) + (bottom ?? 0)) / 2;
      expect(mid).toBeCloseTo(60, 1);
    });
  });

  describe('buildStreamPath', () => {
    it('returns "" for empty points', () => {
      expect(buildStreamPath([], false)).toBe('');
    });
    it('handles a single point', () => {
      const path = buildStreamPath(
        [{ x: 10, upperY: 5, lowerY: 15 }],
        false,
      );
      expect(path).toContain('M');
      expect(path).toContain('Z');
    });
    it('emits a closed polyline when smooth=false', () => {
      const pts: StreamLayoutPoint[] = [
        { x: 0, upperY: 0, lowerY: 10 },
        { x: 10, upperY: 0, lowerY: 10 },
        { x: 20, upperY: 0, lowerY: 10 },
      ];
      const path = buildStreamPath(pts, false);
      expect(path).toMatch(/^M /);
      expect(path).toMatch(/Z$/);
      expect((path.match(/L/g) || []).length).toBeGreaterThan(0);
      expect((path.match(/C/g) || []).length).toBe(0);
    });
    it('emits C commands when smooth=true with >= 3 points', () => {
      const pts: StreamLayoutPoint[] = [
        { x: 0, upperY: 0, lowerY: 10 },
        { x: 10, upperY: 5, lowerY: 15 },
        { x: 20, upperY: 0, lowerY: 10 },
        { x: 30, upperY: 8, lowerY: 18 },
      ];
      const path = buildStreamPath(pts, true);
      expect((path.match(/C /g) || []).length).toBeGreaterThan(0);
    });
    it('falls back to polyline when smooth=true but < 3 points', () => {
      const pts: StreamLayoutPoint[] = [
        { x: 0, upperY: 0, lowerY: 10 },
        { x: 10, upperY: 0, lowerY: 10 },
      ];
      const path = buildStreamPath(pts, true);
      expect((path.match(/C /g) || []).length).toBe(0);
    });
  });

  describe('describeStreamChart', () => {
    it('returns "No data" for empty series', () => {
      expect(describeStreamChart([])).toBe('No data');
    });
    it('summarises layer count + per-layer sums', () => {
      const text = describeStreamChart(series);
      expect(text).toContain('3 layers');
      expect(text).toContain('5 samples');
      expect(text).toContain('A sum 90');
    });
    it('honours formatValue', () => {
      const text = describeStreamChart(
        series,
        (v) => `${v}u`,
      );
      expect(text).toContain('90u');
    });
  });

  it('exports default constants', () => {
    expect(DEFAULT_CHART_STREAM_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_STREAM_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_STREAM_PADDING).toBeGreaterThan(0);
  });
});

describe('<ChartStream />', () => {
  it('renders a region with role + aria-label', () => {
    render(<ChartStream series={series} />);
    const root = screen.getByRole('region', {
      name: 'Stream graph',
    });
    expect(root).toBeInTheDocument();
    expect(root).toHaveAttribute('data-section', 'chart-stream');
    expect(root).toHaveAttribute('data-layer-count', '3');
    expect(root).toHaveAttribute('data-sample-count', '5');
  });

  it('renders a custom aria-label', () => {
    render(
      <ChartStream series={series} ariaLabel="Bandwidth" />,
    );
    expect(
      screen.getByRole('region', { name: 'Bandwidth' }),
    ).toBeInTheDocument();
  });

  it('renders one layer per series', () => {
    const { container } = render(<ChartStream series={series} />);
    const layers = container.querySelectorAll(
      '[data-section="chart-stream-layer"]',
    );
    expect(layers.length).toBe(series.length);
  });

  it('renders one band path per layer', () => {
    const { container } = render(<ChartStream series={series} />);
    const bands = container.querySelectorAll(
      '[data-section="chart-stream-band"]',
    );
    expect(bands.length).toBe(series.length);
  });

  it('honours custom series colour', () => {
    const colored: ChartStreamSeries[] = series.map((s, i) =>
      i === 0 ? { ...s, color: '#ff00aa' } : s,
    );
    const { container } = render(
      <ChartStream series={colored} />,
    );
    const layer = container.querySelector(
      '[data-section="chart-stream-layer"][data-series-id="a"]',
    );
    expect(layer?.getAttribute('data-series-color')).toBe(
      '#ff00aa',
    );
  });

  it('uses default palette when series.color is missing', () => {
    const { container } = render(<ChartStream series={series} />);
    const layer = container.querySelector(
      '[data-section="chart-stream-layer"]',
    );
    expect(layer?.getAttribute('data-series-color')).toMatch(/^#/);
  });

  it('renders a legend by default', () => {
    const { container } = render(<ChartStream series={series} />);
    const legend = container.querySelector(
      '[data-section="chart-stream-legend"]',
    );
    expect(legend).not.toBeNull();
    const items = container.querySelectorAll(
      '[data-section="chart-stream-legend-item"]',
    );
    expect(items.length).toBe(3);
  });

  it('suppresses legend when showLegend=false', () => {
    const { container } = render(
      <ChartStream series={series} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-stream-legend"]',
      ),
    ).toBeNull();
  });

  it('default legend placement is bottom', () => {
    const { container } = render(<ChartStream series={series} />);
    const legend = container.querySelector(
      '[data-section="chart-stream-legend"]',
    );
    expect(legend?.getAttribute('data-placement')).toBe('bottom');
  });

  it('legend placement right when configured', () => {
    const { container } = render(
      <ChartStream
        series={series}
        legendPlacement="right"
      />,
    );
    const legend = container.querySelector(
      '[data-section="chart-stream-legend"]',
    );
    expect(legend?.getAttribute('data-placement')).toBe('right');
  });

  it('mirrors smooth flag on the root', () => {
    const { container, rerender } = render(
      <ChartStream series={series} />,
    );
    expect(
      container
        .querySelector('[data-section="chart-stream"]')
        ?.getAttribute('data-smooth'),
    ).toBe('true');
    rerender(<ChartStream series={series} smooth={false} />);
    expect(
      container
        .querySelector('[data-section="chart-stream"]')
        ?.getAttribute('data-smooth'),
    ).toBe('false');
  });

  it('mirrors animate flag on the root', () => {
    const { container, rerender } = render(
      <ChartStream series={series} />,
    );
    expect(
      container
        .querySelector('[data-section="chart-stream"]')
        ?.getAttribute('data-animate'),
    ).toBe('true');
    rerender(<ChartStream series={series} animate={false} />);
    expect(
      container
        .querySelector('[data-section="chart-stream"]')
        ?.getAttribute('data-animate'),
    ).toBe('false');
  });

  it('renders x labels when supplied + showAxisLabels=true', () => {
    const { container } = render(
      <ChartStream
        series={series}
        xLabels={['Jan', 'Feb', 'Mar', 'Apr', 'May']}
      />,
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-stream-xlabel"]',
    );
    expect(labels.length).toBe(5);
    expect(labels[0]?.textContent).toBe('Jan');
    expect(labels[4]?.textContent).toBe('May');
  });

  it('suppresses x labels when showAxisLabels=false', () => {
    const { container } = render(
      <ChartStream
        series={series}
        xLabels={['Jan', 'Feb', 'Mar', 'Apr', 'May']}
        showAxisLabels={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-stream-xlabel"]',
      ),
    ).toBeNull();
  });

  it('uses formatXLabel for x label text', () => {
    const { container } = render(
      <ChartStream
        series={series}
        xLabels={['Jan', 'Feb', 'Mar', 'Apr', 'May']}
        formatXLabel={(l, i) => `${i}:${l}`}
      />,
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-stream-xlabel"]',
    );
    expect(labels[0]?.textContent).toBe('0:Jan');
  });

  it('shows tooltip on layer hover', () => {
    const { container } = render(<ChartStream series={series} />);
    const band = container.querySelector(
      '[data-section="chart-stream-band"]',
    );
    fireEvent.mouseEnter(band!, { clientX: 100 });
    const tip = container.querySelector(
      '[data-section="chart-stream-tooltip"]',
    );
    expect(tip).not.toBeNull();
    const label = container.querySelector(
      '[data-section="chart-stream-tooltip-label"]',
    );
    expect(label?.textContent).toBe('A');
  });

  it('shows total in tooltip', () => {
    const { container } = render(<ChartStream series={series} />);
    const band = container.querySelector(
      '[data-section="chart-stream-band"]',
    );
    fireEvent.mouseEnter(band!, { clientX: 0 });
    const total = container.querySelector(
      '[data-section="chart-stream-tooltip-total"]',
    );
    expect(total).not.toBeNull();
    expect(total?.textContent).toContain('total:');
  });

  it('hides tooltip on mouse-leave', () => {
    const { container } = render(<ChartStream series={series} />);
    const band = container.querySelector(
      '[data-section="chart-stream-band"]',
    );
    fireEvent.mouseEnter(band!, { clientX: 0 });
    fireEvent.mouseLeave(band!);
    expect(
      container.querySelector(
        '[data-section="chart-stream-tooltip"]',
      ),
    ).toBeNull();
  });

  it('suppresses tooltip when showTooltip=false', () => {
    const { container } = render(
      <ChartStream series={series} showTooltip={false} />,
    );
    const band = container.querySelector(
      '[data-section="chart-stream-band"]',
    );
    fireEvent.mouseEnter(band!, { clientX: 0 });
    expect(
      container.querySelector(
        '[data-section="chart-stream-tooltip"]',
      ),
    ).toBeNull();
  });

  it('dims other layers when hover highlight is on', () => {
    const { container } = render(<ChartStream series={series} />);
    const bands = container.querySelectorAll(
      '[data-section="chart-stream-band"]',
    );
    fireEvent.mouseEnter(bands[1]!, { clientX: 0 });
    const otherBand = bands[0]!;
    const dim = otherBand.getAttribute('fill-opacity');
    expect(dim).toBe('0.25');
  });

  it('does not dim others when highlightOnHover=false', () => {
    const { container } = render(
      <ChartStream
        series={series}
        highlightOnHover={false}
      />,
    );
    const bands = container.querySelectorAll(
      '[data-section="chart-stream-band"]',
    );
    fireEvent.mouseEnter(bands[1]!, { clientX: 0 });
    const otherBand = bands[0]!;
    expect(otherBand.getAttribute('fill-opacity')).toBe('0.9');
  });

  it('invokes onSeriesClick with series + index + total', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ChartStream series={series} onSeriesClick={onClick} />,
    );
    const band = container.querySelector(
      '[data-section="chart-stream-band"]',
    );
    fireEvent.mouseEnter(band!, { clientX: 0 });
    fireEvent.click(band!);
    expect(onClick).toHaveBeenCalledTimes(1);
    const arg = onClick.mock.calls[0]?.[0];
    expect(arg?.series?.id).toBe('a');
    expect(arg?.index).toBe(0);
  });

  it('exposes role=graphics-symbol + aria-label per band', () => {
    const { container } = render(<ChartStream series={series} />);
    const band = container.querySelector(
      '[data-section="chart-stream-band"]',
    );
    expect(band?.getAttribute('role')).toBe('graphics-symbol');
    expect(band?.getAttribute('aria-label')).toBe('A');
  });

  it('mirrors size on the svg', () => {
    const { container } = render(
      <ChartStream
        series={series}
        width={800}
        height={300}
      />,
    );
    const svg = container.querySelector(
      '[data-section="chart-stream-svg"]',
    );
    expect(svg?.getAttribute('width')).toBe('800');
    expect(svg?.getAttribute('height')).toBe('300');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 800 300');
  });

  it('renders auto-generated ARIA description by default', () => {
    const { container } = render(<ChartStream series={series} />);
    const desc = container.querySelector(
      '[data-section="chart-stream-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Stream graph');
    expect(desc?.textContent).toContain('3 layers');
  });

  it('honours ariaDescription override', () => {
    const { container } = render(
      <ChartStream series={series} ariaDescription="custom" />,
    );
    const desc = container.querySelector(
      '[data-section="chart-stream-aria-desc"]',
    );
    expect(desc?.textContent).toBe('custom');
  });

  it('handles empty series without crashing', () => {
    const { container } = render(<ChartStream series={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-stream"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelectorAll(
        '[data-section="chart-stream-layer"]',
      ).length,
    ).toBe(0);
  });

  it('forwards ref to the root region', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartStream ref={ref} series={series} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-stream',
    );
  });

  it('has a stable displayName', () => {
    expect(ChartStream.displayName).toBe('ChartStream');
  });
});
