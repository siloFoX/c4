import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

import {
  ChartLineMarker,
  DEFAULT_CHART_LINE_MARKER_WIDTH,
  DEFAULT_CHART_LINE_MARKER_HEIGHT,
  DEFAULT_CHART_LINE_MARKER_PADDING,
  DEFAULT_CHART_LINE_MARKER_TICK_COUNT,
  DEFAULT_CHART_LINE_MARKER_STROKE_WIDTH,
  DEFAULT_CHART_LINE_MARKER_MARKER_SIZE,
  DEFAULT_CHART_LINE_MARKER_LINE_OPACITY,
  DEFAULT_CHART_LINE_MARKER_MARKER_OPACITY,
  DEFAULT_CHART_LINE_MARKER_MARKER_STROKE_WIDTH,
  DEFAULT_CHART_LINE_MARKER_DEFAULT_SHAPE,
  DEFAULT_CHART_LINE_MARKER_GRID_COLOR,
  DEFAULT_CHART_LINE_MARKER_AXIS_COLOR,
  DEFAULT_CHART_LINE_MARKER_PALETTE,
  LINE_MARKER_SHAPES,
  buildLineMarkerLinePath,
  buildLineMarkerShapePath,
  computeLineMarkerLayout,
  describeLineMarkerChart,
  getLineMarkerBounds,
  getLineMarkerDefaultColor,
  getLineMarkerFinitePoints,
  getLineMarkerTicks,
  resolveLineMarkerShape,
  type ChartLineMarkerSeries,
} from './chart-line-marker';

afterEach(() => {
  cleanup();
});

describe('chart-line-marker / constants', () => {
  it('exports sensible defaults', () => {
    expect(DEFAULT_CHART_LINE_MARKER_WIDTH).toBe(560);
    expect(DEFAULT_CHART_LINE_MARKER_HEIGHT).toBe(320);
    expect(DEFAULT_CHART_LINE_MARKER_PADDING).toBe(40);
    expect(DEFAULT_CHART_LINE_MARKER_TICK_COUNT).toBe(5);
    expect(DEFAULT_CHART_LINE_MARKER_STROKE_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_MARKER_MARKER_SIZE).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_MARKER_LINE_OPACITY).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_MARKER_MARKER_OPACITY).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_MARKER_MARKER_STROKE_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_MARKER_DEFAULT_SHAPE).toBe('circle');
    expect(DEFAULT_CHART_LINE_MARKER_GRID_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_LINE_MARKER_AXIS_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_LINE_MARKER_PALETTE).toHaveLength(10);
  });

  it('exports the canonical shape set', () => {
    expect(LINE_MARKER_SHAPES).toEqual([
      'circle',
      'square',
      'triangle',
      'diamond',
      'none',
    ]);
  });
});

describe('chart-line-marker / getLineMarkerDefaultColor', () => {
  it('wraps with modulo', () => {
    expect(getLineMarkerDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_MARKER_PALETTE[0],
    );
    expect(getLineMarkerDefaultColor(10)).toBe(
      DEFAULT_CHART_LINE_MARKER_PALETTE[0],
    );
  });

  it('falls back to first colour for invalid indices', () => {
    expect(getLineMarkerDefaultColor(-1)).toBe(
      DEFAULT_CHART_LINE_MARKER_PALETTE[0],
    );
    expect(getLineMarkerDefaultColor(NaN)).toBe(
      DEFAULT_CHART_LINE_MARKER_PALETTE[0],
    );
  });
});

describe('chart-line-marker / getLineMarkerFinitePoints', () => {
  it('drops points with non-finite x or y', () => {
    expect(
      getLineMarkerFinitePoints([
        { x: 1, y: 1 },
        { x: NaN, y: 2 },
        { x: 3, y: Infinity },
        { x: 4, y: 4 },
      ]).map((p) => p.x),
    ).toEqual([1, 4]);
  });

  it('returns [] for non-array input', () => {
    expect(getLineMarkerFinitePoints(null as unknown as never[])).toEqual([]);
  });
});

describe('chart-line-marker / getLineMarkerBounds', () => {
  it('returns unit square for empty input', () => {
    expect(getLineMarkerBounds([])).toEqual({
      xMin: 0,
      xMax: 1,
      yMin: 0,
      yMax: 1,
    });
  });

  it('spans all visible series', () => {
    expect(
      getLineMarkerBounds([
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: 5 },
            { x: 5, y: 10 },
          ],
        },
      ]),
    ).toEqual({ xMin: 0, xMax: 5, yMin: 5, yMax: 10 });
  });

  it('excludes hidden series', () => {
    expect(
      getLineMarkerBounds(
        [
          { id: 'a', label: 'A', data: [{ x: 1, y: 1 }] },
          { id: 'b', label: 'B', data: [{ x: 100, y: 100 }] },
        ],
        ['b'],
      ),
    ).toEqual({ xMin: 0.5, xMax: 1.5, yMin: 0.5, yMax: 1.5 });
  });
});

describe('chart-line-marker / getLineMarkerTicks', () => {
  it('returns evenly-spaced ticks', () => {
    const ticks = getLineMarkerTicks(0, 10, 5);
    expect(ticks).toHaveLength(5);
    expect(ticks[0]!.value).toBe(0);
    expect(ticks[4]!.value).toBe(10);
  });

  it('returns [] for invalid range', () => {
    expect(getLineMarkerTicks(10, 5, 4)).toEqual([]);
  });
});

describe('chart-line-marker / buildLineMarkerLinePath', () => {
  it('returns "" for empty input', () => {
    expect(buildLineMarkerLinePath([])).toBe('');
  });

  it('returns M-only for single point', () => {
    expect(buildLineMarkerLinePath([{ px: 5, py: 10 }])).toBe(
      'M 5.000 10.000',
    );
  });

  it('emits one L per additional point', () => {
    const out = buildLineMarkerLinePath([
      { px: 0, py: 0 },
      { px: 10, py: 5 },
      { px: 20, py: 0 },
    ]);
    expect((out.match(/L /g) ?? []).length).toBe(2);
  });
});

describe('chart-line-marker / resolveLineMarkerShape', () => {
  it('falls back to circle when no point and no series default', () => {
    expect(resolveLineMarkerShape(undefined, undefined)).toBe('circle');
  });

  it('uses series default when point has no marker', () => {
    expect(resolveLineMarkerShape({ x: 0, y: 0 }, 'square')).toBe('square');
  });

  it('point marker wins over series default', () => {
    expect(
      resolveLineMarkerShape(
        { x: 0, y: 0, marker: 'diamond' },
        'square',
      ),
    ).toBe('diamond');
  });

  it('honours per-point "none" override', () => {
    expect(
      resolveLineMarkerShape({ x: 0, y: 0, marker: 'none' }, 'square'),
    ).toBe('none');
  });
});

describe('chart-line-marker / buildLineMarkerShapePath', () => {
  it('returns "" for none', () => {
    expect(buildLineMarkerShapePath('none', 10, 10, 5)).toBe('');
  });

  it('returns "" for non-positive size', () => {
    expect(buildLineMarkerShapePath('circle', 10, 10, 0)).toBe('');
    expect(buildLineMarkerShapePath('circle', 10, 10, -1)).toBe('');
  });

  it('returns "" for non-finite center', () => {
    expect(buildLineMarkerShapePath('square', NaN, 10, 5)).toBe('');
  });

  it('builds a closed circle path with two arcs', () => {
    const out = buildLineMarkerShapePath('circle', 10, 10, 5);
    expect(out.startsWith('M ')).toBe(true);
    expect(out).toContain('A ');
    expect(out.endsWith(' Z')).toBe(true);
    expect((out.match(/A /g) ?? []).length).toBe(2);
  });

  it('builds a closed 4-vertex square path', () => {
    const out = buildLineMarkerShapePath('square', 10, 10, 5);
    expect(out.startsWith('M ')).toBe(true);
    expect(out.endsWith(' Z')).toBe(true);
    expect((out.match(/L /g) ?? []).length).toBe(3);
    expect(out).toContain('M 5.000 5.000');
  });

  it('builds a closed 3-vertex triangle pointing up', () => {
    const out = buildLineMarkerShapePath('triangle', 10, 10, 5);
    expect(out.endsWith(' Z')).toBe(true);
    expect((out.match(/L /g) ?? []).length).toBe(2);
    expect(out).toContain('M 10.000 5.000'); // apex above center
  });

  it('builds a closed 4-vertex diamond at cardinal points', () => {
    const out = buildLineMarkerShapePath('diamond', 10, 10, 5);
    expect(out.endsWith(' Z')).toBe(true);
    expect((out.match(/L /g) ?? []).length).toBe(3);
    expect(out).toContain('M 10.000 5.000'); // top vertex
    expect(out).toContain('L 15.000 10.000'); // right vertex
  });

  it('all five shapes produce distinct (or empty) paths', () => {
    const paths = LINE_MARKER_SHAPES.map((s) =>
      buildLineMarkerShapePath(s, 10, 10, 5),
    );
    // The 4 real shapes must be unique; 'none' is ''.
    const real = paths.filter((p) => p !== '');
    expect(real.length).toBe(4);
    expect(new Set(real).size).toBe(4);
  });
});

describe('chart-line-marker / computeLineMarkerLayout', () => {
  it('returns empty when canvas is degenerate', () => {
    expect(
      computeLineMarkerLayout({
        series: [{ id: 'a', label: 'A', data: [{ x: 1, y: 1 }] }],
        width: 10,
        height: 10,
        padding: 100,
      }).series,
    ).toEqual([]);
  });

  it('returns empty when no series', () => {
    expect(
      computeLineMarkerLayout({
        series: [],
        width: 500,
        height: 200,
        padding: 20,
      }).series,
    ).toEqual([]);
  });

  it('returns empty when every series is hidden', () => {
    expect(
      computeLineMarkerLayout({
        series: [{ id: 'a', label: 'A', data: [{ x: 1, y: 1 }] }],
        hidden: ['a'],
        width: 500,
        height: 200,
        padding: 20,
      }).series,
    ).toEqual([]);
  });

  it('maps x and y to pixel coordinates', () => {
    const out = computeLineMarkerLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: 0 },
            { x: 10, y: 10 },
          ],
        },
      ],
      xMin: 0,
      xMax: 10,
      yMin: 0,
      yMax: 10,
      width: 500,
      height: 200,
      padding: 40,
    });
    const pts = out.series[0]!.points;
    expect(pts[0]!.px).toBeCloseTo(40, 5);
    expect(pts[0]!.py).toBeCloseTo(40 + 120, 5);
    expect(pts[1]!.px).toBeCloseTo(40 + (500 - 80), 5);
    expect(pts[1]!.py).toBeCloseTo(40, 5);
  });

  it('attaches default shape to each point from series.marker', () => {
    const out = computeLineMarkerLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          marker: 'square',
          data: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
        },
      ],
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.series[0]!.defaultShape).toBe('square');
    expect(out.series[0]!.points.every((p) => p.shape === 'square')).toBe(true);
  });

  it('per-point marker overrides series default', () => {
    const out = computeLineMarkerLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          marker: 'square',
          data: [
            { x: 0, y: 0 },
            { x: 1, y: 1, marker: 'diamond' },
            { x: 2, y: 2 },
          ],
        },
      ],
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.series[0]!.points.map((p) => p.shape)).toEqual([
      'square',
      'diamond',
      'square',
    ]);
  });

  it('builds markerPath per point', () => {
    const out = computeLineMarkerLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
        },
      ],
      width: 500,
      height: 200,
      padding: 40,
    });
    for (const p of out.series[0]!.points) {
      expect(p.markerPath).not.toBe('');
      expect(p.markerPath.startsWith('M ')).toBe(true);
      expect(p.markerPath.endsWith(' Z')).toBe(true);
    }
  });

  it('emits empty markerPath when shape is "none"', () => {
    const out = computeLineMarkerLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          marker: 'none',
          data: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
        },
      ],
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.series[0]!.points.every((p) => p.markerPath === '')).toBe(true);
  });

  it('drops non-finite points but keeps totalCount', () => {
    const out = computeLineMarkerLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 1, y: 1 },
            { x: NaN, y: 2 } as { x: number; y: number },
            { x: 3, y: 3 },
          ],
        },
      ],
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.series[0]!.points).toHaveLength(2);
    expect(out.series[0]!.finiteCount).toBe(2);
    expect(out.series[0]!.totalCount).toBe(3);
  });

  it('records series index across hidden-series filter', () => {
    const out = computeLineMarkerLayout({
      series: [
        { id: 'a', label: 'A', data: [{ x: 1, y: 1 }] },
        { id: 'b', label: 'B', data: [{ x: 2, y: 2 }] },
        { id: 'c', label: 'C', data: [{ x: 3, y: 3 }] },
      ],
      hidden: ['b'],
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.series).toHaveLength(2);
    expect(out.series[0]!.index).toBe(0);
    expect(out.series[1]!.index).toBe(2);
  });

  it('respects custom markerSize', () => {
    const small = computeLineMarkerLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          marker: 'square',
          data: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
        },
      ],
      width: 500,
      height: 200,
      padding: 40,
      markerSize: 2,
    });
    const big = computeLineMarkerLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          marker: 'square',
          data: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
        },
      ],
      width: 500,
      height: 200,
      padding: 40,
      markerSize: 10,
    });
    expect(small.series[0]!.points[0]!.markerPath).not.toBe(
      big.series[0]!.points[0]!.markerPath,
    );
  });
});

describe('chart-line-marker / describeLineMarkerChart', () => {
  it('returns "No data" when empty', () => {
    expect(describeLineMarkerChart([])).toBe('No data');
  });

  it('returns "No data" when no finite points', () => {
    expect(
      describeLineMarkerChart([
        {
          id: 'a',
          label: 'A',
          data: [{ x: NaN, y: 1 } as { x: number; y: number }],
        },
      ]),
    ).toBe('No data');
  });

  it('summarises series count + total points + per-series shape', () => {
    const out = describeLineMarkerChart([
      {
        id: 'a',
        label: 'A',
        marker: 'square',
        data: [
          { x: 0, y: 1 },
          { x: 1, y: 2 },
        ],
      },
      {
        id: 'b',
        label: 'B',
        marker: 'triangle',
        data: [
          { x: 0, y: 2 },
          { x: 1, y: 3 },
        ],
      },
    ]);
    expect(out).toContain('2 series');
    expect(out).toContain('4 points');
    expect(out).toContain('A (square)');
    expect(out).toContain('B (triangle)');
  });

  it('excludes hidden series', () => {
    const out = describeLineMarkerChart(
      [
        { id: 'a', label: 'A', data: [{ x: 0, y: 1 }] },
        { id: 'b', label: 'B', data: [{ x: 0, y: 100 }] },
      ],
      ['b'],
    );
    expect(out).toContain('1 series');
  });
});

const FIXTURE: ChartLineMarkerSeries[] = [
  {
    id: 'a',
    label: 'Latency',
    marker: 'circle',
    data: [
      { x: 0, y: 12 },
      { x: 1, y: 18 },
      { x: 2, y: 30, marker: 'diamond' },
      { x: 3, y: 24 },
    ],
  },
  {
    id: 'b',
    label: 'Errors',
    marker: 'triangle',
    data: [
      { x: 0, y: 1 },
      { x: 1, y: 3 },
      { x: 2, y: 5 },
      { x: 3, y: 2 },
    ],
  },
];

describe('chart-line-marker / <ChartLineMarker>', () => {
  it('renders a root region with the default aria label', () => {
    render(<ChartLineMarker series={FIXTURE} />);
    const root = document.querySelector('[data-section="chart-line-marker"]')!;
    expect(root.getAttribute('aria-label')).toBe('Line chart with markers');
  });

  it('exposes series counts and marker size as data attrs', () => {
    render(<ChartLineMarker series={FIXTURE} markerSize={6} />);
    const root = document.querySelector('[data-section="chart-line-marker"]')!;
    expect(root.getAttribute('data-series-count')).toBe('2');
    expect(root.getAttribute('data-visible-series-count')).toBe('2');
    expect(root.getAttribute('data-total-points')).toBe('8');
    expect(root.getAttribute('data-marker-size')).toBe('6');
  });

  it('renders an aria description with summary text', () => {
    render(<ChartLineMarker series={FIXTURE} />);
    expect(
      document.querySelector('[data-section="chart-line-marker-aria-desc"]')
        ?.textContent ?? '',
    ).toContain('Latency (circle)');
  });

  it('respects a custom aria description', () => {
    render(<ChartLineMarker series={FIXTURE} ariaDescription="custom" />);
    expect(
      document.querySelector('[data-section="chart-line-marker-aria-desc"]')
        ?.textContent,
    ).toBe('custom');
  });

  it('renders one line path + one marker per finite point per series', () => {
    render(<ChartLineMarker series={FIXTURE} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-marker-path"]')
        .length,
    ).toBe(2);
    expect(
      document.querySelectorAll('[data-section="chart-line-marker-marker"]')
        .length,
    ).toBe(8);
  });

  it('omits markers when showMarkers=false', () => {
    render(<ChartLineMarker series={FIXTURE} showMarkers={false} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-marker-marker"]')
        .length,
    ).toBe(0);
  });

  it('per-point marker override respected in data attr', () => {
    render(<ChartLineMarker series={FIXTURE} />);
    const overrideMarker = document.querySelector(
      '[data-section="chart-line-marker-marker"][data-series-id="a"][data-point-index="2"]',
    )!;
    expect(overrideMarker.getAttribute('data-marker-shape')).toBe('diamond');
  });

  it('series default marker carried through to non-overridden points', () => {
    render(<ChartLineMarker series={FIXTURE} />);
    const defaults = document.querySelectorAll(
      '[data-section="chart-line-marker-marker"][data-series-id="b"]',
    );
    expect(defaults.length).toBe(4);
    for (const m of Array.from(defaults)) {
      expect(m.getAttribute('data-marker-shape')).toBe('triangle');
    }
  });

  it('renders a legend item per series with the series marker', () => {
    render(<ChartLineMarker series={FIXTURE} />);
    const items = document.querySelectorAll(
      '[data-section="chart-line-marker-legend-item"]',
    );
    expect(items.length).toBe(2);
    expect(items[0]!.getAttribute('data-series-marker')).toBe('circle');
    expect(items[1]!.getAttribute('data-series-marker')).toBe('triangle');
  });

  it('toggles hidden state via legend (uncontrolled)', () => {
    render(<ChartLineMarker series={FIXTURE} />);
    const btn = document.querySelector(
      '[data-section="chart-line-marker-legend-item"][data-series-id="a"] [data-section="chart-line-marker-legend-button"]',
    ) as HTMLElement;
    fireEvent.click(btn);
    const item = document.querySelector(
      '[data-section="chart-line-marker-legend-item"][data-series-id="a"]',
    )!;
    expect(item.getAttribute('data-hidden')).toBe('true');
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-marker-marker"][data-series-id="a"]',
      ).length,
    ).toBe(0);
  });

  it('does not mutate hiddenSeries when controlled', () => {
    const handler = vi.fn();
    render(
      <ChartLineMarker
        series={FIXTURE}
        hiddenSeries={[]}
        onHiddenSeriesChange={handler}
      />,
    );
    const btn = document.querySelector(
      '[data-section="chart-line-marker-legend-item"][data-series-id="a"] [data-section="chart-line-marker-legend-button"]',
    ) as HTMLElement;
    fireEvent.click(btn);
    expect(handler).toHaveBeenCalledWith(['a']);
  });

  it('fires onSeriesToggle with the hidden flag', () => {
    const handler = vi.fn();
    render(<ChartLineMarker series={FIXTURE} onSeriesToggle={handler} />);
    const btn = document.querySelector(
      '[data-section="chart-line-marker-legend-item"][data-series-id="b"] [data-section="chart-line-marker-legend-button"]',
    ) as HTMLElement;
    fireEvent.click(btn);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0]!.hidden).toBe(true);
  });

  it('respects defaultHiddenSeries on mount', () => {
    render(
      <ChartLineMarker series={FIXTURE} defaultHiddenSeries={['a']} />,
    );
    const item = document.querySelector(
      '[data-section="chart-line-marker-legend-item"][data-series-id="a"]',
    )!;
    expect(item.getAttribute('data-hidden')).toBe('true');
  });

  it('shows tooltip on marker hover with shape line', () => {
    render(<ChartLineMarker series={FIXTURE} />);
    const marker = document.querySelectorAll(
      '[data-section="chart-line-marker-marker"][data-series-id="a"]',
    )[2] as SVGElement;
    fireEvent.mouseEnter(marker);
    const tip = document.querySelector(
      '[data-section="chart-line-marker-tooltip"]',
    );
    expect(tip).not.toBeNull();
    expect(tip!.textContent).toContain('Latency');
    const shapeRow = document.querySelector(
      '[data-section="chart-line-marker-tooltip-shape"]',
    );
    expect(shapeRow?.textContent).toContain('diamond');
  });

  it('hides tooltip on mouse leave', () => {
    render(<ChartLineMarker series={FIXTURE} />);
    const marker = document.querySelectorAll(
      '[data-section="chart-line-marker-marker"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(marker);
    fireEvent.mouseLeave(marker);
    expect(
      document.querySelector('[data-section="chart-line-marker-tooltip"]'),
    ).toBeNull();
  });

  it('fires onPointClick with series + point', () => {
    const handler = vi.fn();
    render(<ChartLineMarker series={FIXTURE} onPointClick={handler} />);
    const marker = document.querySelectorAll(
      '[data-section="chart-line-marker-marker"]',
    )[0] as SVGElement;
    fireEvent.click(marker);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0]!.series.id).toBe('a');
  });

  it('hides axis when showAxis=false', () => {
    render(<ChartLineMarker series={FIXTURE} showAxis={false} />);
    expect(
      document.querySelector('[data-section="chart-line-marker-axes"]'),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    render(<ChartLineMarker series={FIXTURE} showGrid={false} />);
    expect(
      document.querySelector('[data-section="chart-line-marker-grid"]'),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    render(<ChartLineMarker series={FIXTURE} showLegend={false} />);
    expect(
      document.querySelector('[data-section="chart-line-marker-legend"]'),
    ).toBeNull();
  });

  it('hides tooltip when showTooltip=false', () => {
    render(<ChartLineMarker series={FIXTURE} showTooltip={false} />);
    const marker = document.querySelectorAll(
      '[data-section="chart-line-marker-marker"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(marker);
    expect(
      document.querySelector('[data-section="chart-line-marker-tooltip"]'),
    ).toBeNull();
  });

  it('applies the animate flag to the data attribute', () => {
    render(<ChartLineMarker series={FIXTURE} animate={false} />);
    const root = document.querySelector('[data-section="chart-line-marker"]')!;
    expect(root.getAttribute('data-animate')).toBe('false');
  });

  it('renders optional axis labels', () => {
    render(<ChartLineMarker series={FIXTURE} xLabel="t" yLabel="value" />);
    expect(
      document.querySelector('[data-section="chart-line-marker-x-label"]')
        ?.textContent,
    ).toBe('t');
    expect(
      document.querySelector('[data-section="chart-line-marker-y-label"]')
        ?.textContent,
    ).toBe('value');
  });

  it('uses formatValue / formatX for axis ticks', () => {
    render(
      <ChartLineMarker
        series={FIXTURE}
        formatValue={(n) => `y${n}`}
        formatX={(n) => `x${n}`}
      />,
    );
    const xLabel = document.querySelector(
      '[data-section="chart-line-marker-tick-label"][data-axis="x"]',
    );
    const yLabel = document.querySelector(
      '[data-section="chart-line-marker-tick-label"][data-axis="y"]',
    );
    expect(xLabel?.textContent?.startsWith('x')).toBe(true);
    expect(yLabel?.textContent?.startsWith('y')).toBe(true);
  });

  it('overrides default colour via series.color', () => {
    render(
      <ChartLineMarker
        series={[
          {
            id: 'a',
            label: 'A',
            data: [
              { x: 0, y: 0 },
              { x: 1, y: 1 },
            ],
            color: '#abcdef',
          },
        ]}
      />,
    );
    const grp = document.querySelector(
      '[data-section="chart-line-marker-series-group"]',
    )!;
    expect(grp.getAttribute('data-series-color')).toBe('#abcdef');
  });

  it('marker fill respects series.markerFill override', () => {
    render(
      <ChartLineMarker
        series={[
          {
            id: 'a',
            label: 'A',
            data: [
              { x: 0, y: 0 },
              { x: 1, y: 1 },
            ],
            color: '#111',
            markerFill: '#fff',
            marker: 'square',
          },
        ]}
      />,
    );
    const m = document.querySelector(
      '[data-section="chart-line-marker-marker"]',
    )!;
    expect(m.getAttribute('fill')).toBe('#fff');
  });

  it('renders empty state when no series', () => {
    render(<ChartLineMarker series={[]} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-marker-path"]')
        .length,
    ).toBe(0);
    expect(
      document.querySelector('[data-section="chart-line-marker-aria-desc"]')
        ?.textContent,
    ).toBe('No data');
  });

  it('per-marker aria-label includes series, value, and shape', () => {
    render(<ChartLineMarker series={FIXTURE} />);
    const m = document.querySelector(
      '[data-section="chart-line-marker-marker"][data-series-id="a"][data-point-index="2"]',
    ) as SVGElement;
    const aria = m.getAttribute('aria-label') ?? '';
    expect(aria).toContain('Latency');
    expect(aria).toContain('30');
    expect(aria).toContain('diamond');
  });

  it('keyboard focus opens the tooltip', () => {
    render(<ChartLineMarker series={FIXTURE} />);
    const marker = document.querySelectorAll(
      '[data-section="chart-line-marker-marker"]',
    )[0] as SVGElement;
    fireEvent.focus(marker);
    expect(
      document.querySelector('[data-section="chart-line-marker-tooltip"]'),
    ).not.toBeNull();
  });

  it('sets data-hovered on the hovered marker and parent series group', () => {
    render(<ChartLineMarker series={FIXTURE} />);
    const marker = document.querySelectorAll(
      '[data-section="chart-line-marker-marker"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(marker);
    expect(marker.getAttribute('data-hovered')).toBe('true');
    const grp = document.querySelector(
      '[data-section="chart-line-marker-series-group"][data-series-id="a"]',
    )!;
    expect(grp.getAttribute('data-hovered')).toBe('true');
  });

  it('renders grid lines per tick when showGrid=true', () => {
    render(<ChartLineMarker series={FIXTURE} tickCount={4} />);
    const lines = document.querySelectorAll(
      '[data-section="chart-line-marker-grid-line"]',
    );
    expect(lines.length).toBeGreaterThan(0);
  });

  it('honours marker="none" on a series (no markers rendered)', () => {
    render(
      <ChartLineMarker
        series={[
          {
            id: 'a',
            label: 'A',
            marker: 'none',
            data: [
              { x: 0, y: 0 },
              { x: 1, y: 1 },
            ],
          },
        ]}
      />,
    );
    expect(
      document.querySelectorAll('[data-section="chart-line-marker-marker"]')
        .length,
    ).toBe(0);
  });

  it('honours per-point marker="none" override', () => {
    render(
      <ChartLineMarker
        series={[
          {
            id: 'a',
            label: 'A',
            marker: 'square',
            data: [
              { x: 0, y: 0 },
              { x: 1, y: 1, marker: 'none' },
              { x: 2, y: 2 },
            ],
          },
        ]}
      />,
    );
    const markers = document.querySelectorAll(
      '[data-section="chart-line-marker-marker"]',
    );
    expect(markers.length).toBe(2);
  });

  it('exposes per-marker shape data attrs for each of the 4 shapes', () => {
    const fixture: ChartLineMarkerSeries[] = [
      { id: 'c', label: 'C', marker: 'circle', data: [{ x: 0, y: 0 }] },
      { id: 's', label: 'S', marker: 'square', data: [{ x: 0, y: 1 }] },
      { id: 't', label: 'T', marker: 'triangle', data: [{ x: 0, y: 2 }] },
      { id: 'd', label: 'D', marker: 'diamond', data: [{ x: 0, y: 3 }] },
    ];
    render(<ChartLineMarker series={fixture} />);
    const shapes = Array.from(
      document.querySelectorAll('[data-section="chart-line-marker-marker"]'),
    ).map((m) => m.getAttribute('data-marker-shape'));
    expect(new Set(shapes)).toEqual(
      new Set(['circle', 'square', 'triangle', 'diamond']),
    );
  });
});
