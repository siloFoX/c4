import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

import {
  ChartLineDashed,
  DEFAULT_CHART_LINE_DASHED_WIDTH,
  DEFAULT_CHART_LINE_DASHED_HEIGHT,
  DEFAULT_CHART_LINE_DASHED_PADDING,
  DEFAULT_CHART_LINE_DASHED_TICK_COUNT,
  DEFAULT_CHART_LINE_DASHED_STROKE_WIDTH,
  DEFAULT_CHART_LINE_DASHED_DOT_RADIUS,
  DEFAULT_CHART_LINE_DASHED_LINE_OPACITY,
  DEFAULT_CHART_LINE_DASHED_DASH_STYLE,
  DEFAULT_CHART_LINE_DASHED_GRID_COLOR,
  DEFAULT_CHART_LINE_DASHED_AXIS_COLOR,
  DEFAULT_CHART_LINE_DASHED_PALETTE,
  LINE_DASHED_PATTERNS,
  buildLineDashedSegments,
  computeLineDashedLayout,
  describeLineDashedChart,
  getLineDashedBounds,
  getLineDashedDefaultColor,
  getLineDashedFinitePoints,
  getLineDashedStrokeDashArray,
  getLineDashedTicks,
  resolveSegmentDashArray,
  type ChartLineDashedSeries,
} from './chart-line-dashed';

afterEach(() => {
  cleanup();
});

describe('chart-line-dashed / constants', () => {
  it('exports sensible defaults', () => {
    expect(DEFAULT_CHART_LINE_DASHED_WIDTH).toBe(560);
    expect(DEFAULT_CHART_LINE_DASHED_HEIGHT).toBe(320);
    expect(DEFAULT_CHART_LINE_DASHED_PADDING).toBe(40);
    expect(DEFAULT_CHART_LINE_DASHED_TICK_COUNT).toBe(5);
    expect(DEFAULT_CHART_LINE_DASHED_STROKE_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_DASHED_DOT_RADIUS).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_DASHED_LINE_OPACITY).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_DASHED_DASH_STYLE).toBe('dashed');
    expect(DEFAULT_CHART_LINE_DASHED_GRID_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_LINE_DASHED_AXIS_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_LINE_DASHED_PALETTE).toHaveLength(10);
  });

  it('exports the named dash patterns', () => {
    expect(LINE_DASHED_PATTERNS.solid).toBe('');
    expect(LINE_DASHED_PATTERNS.dashed).toBe('8 4');
    expect(LINE_DASHED_PATTERNS.dotted).toBe('2 4');
    expect(LINE_DASHED_PATTERNS.dashDot).toBe('8 4 2 4');
    expect(LINE_DASHED_PATTERNS.longDash).toBe('14 6');
  });
});

describe('chart-line-dashed / getLineDashedDefaultColor', () => {
  it('wraps with modulo', () => {
    expect(getLineDashedDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_DASHED_PALETTE[0],
    );
    expect(getLineDashedDefaultColor(10)).toBe(
      DEFAULT_CHART_LINE_DASHED_PALETTE[0],
    );
  });

  it('falls back to first colour for invalid indices', () => {
    expect(getLineDashedDefaultColor(-1)).toBe(
      DEFAULT_CHART_LINE_DASHED_PALETTE[0],
    );
    expect(getLineDashedDefaultColor(NaN)).toBe(
      DEFAULT_CHART_LINE_DASHED_PALETTE[0],
    );
  });
});

describe('chart-line-dashed / getLineDashedStrokeDashArray', () => {
  it('returns the named pattern', () => {
    expect(getLineDashedStrokeDashArray('dashed')).toBe('8 4');
    expect(getLineDashedStrokeDashArray('dotted')).toBe('2 4');
    expect(getLineDashedStrokeDashArray('solid')).toBe('');
  });

  it('returns "" for undefined', () => {
    expect(getLineDashedStrokeDashArray(undefined)).toBe('');
  });
});

describe('chart-line-dashed / getLineDashedFinitePoints', () => {
  it('drops points with non-finite x or y', () => {
    const out = getLineDashedFinitePoints([
      { x: 1, y: 1 },
      { x: NaN, y: 2 },
      { x: 3, y: Infinity },
      { x: 4, y: 4 },
    ]);
    expect(out.map((p) => p.x)).toEqual([1, 4]);
  });

  it('returns [] for non-array input', () => {
    expect(getLineDashedFinitePoints(null as unknown as never[])).toEqual([]);
  });
});

describe('chart-line-dashed / getLineDashedBounds', () => {
  it('returns unit square for empty input', () => {
    expect(getLineDashedBounds([])).toEqual({
      xMin: 0,
      xMax: 1,
      yMin: 0,
      yMax: 1,
    });
  });

  it('spans all visible series', () => {
    expect(
      getLineDashedBounds([
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 1, y: 10 },
            { x: 2, y: 20 },
          ],
        },
      ]),
    ).toEqual({ xMin: 1, xMax: 2, yMin: 10, yMax: 20 });
  });

  it('excludes hidden series', () => {
    expect(
      getLineDashedBounds(
        [
          { id: 'a', label: 'A', data: [{ x: 1, y: 1 }] },
          { id: 'b', label: 'B', data: [{ x: 100, y: 100 }] },
        ],
        ['b'],
      ),
    ).toEqual({ xMin: 0.5, xMax: 1.5, yMin: 0.5, yMax: 1.5 });
  });
});

describe('chart-line-dashed / getLineDashedTicks', () => {
  it('returns evenly-spaced ticks', () => {
    const ticks = getLineDashedTicks(0, 10, 5);
    expect(ticks).toHaveLength(5);
    expect(ticks[0]!.value).toBe(0);
    expect(ticks[4]!.value).toBe(10);
  });

  it('returns single tick for collapsed range', () => {
    expect(getLineDashedTicks(5, 5, 4)).toEqual([{ value: 5, position: 0 }]);
  });

  it('returns [] for invalid range', () => {
    expect(getLineDashedTicks(10, 5, 4)).toEqual([]);
  });
});

describe('chart-line-dashed / resolveSegmentDashArray', () => {
  it('uses series default when point has no override', () => {
    const out = resolveSegmentDashArray({ x: 0, y: 0 }, 'dashed');
    expect(out.dashArray).toBe('8 4');
    expect(out.styleName).toBe('dashed');
  });

  it('point segmentStyle wins over series default', () => {
    const out = resolveSegmentDashArray(
      { x: 0, y: 0, segmentStyle: 'dotted' },
      'dashed',
    );
    expect(out.dashArray).toBe('2 4');
    expect(out.styleName).toBe('dotted');
  });

  it('point segmentDashArray wins over segmentStyle', () => {
    const out = resolveSegmentDashArray(
      {
        x: 0,
        y: 0,
        segmentStyle: 'dotted',
        segmentDashArray: '20 5 2 5',
      },
      'dashed',
    );
    expect(out.dashArray).toBe('20 5 2 5');
    expect(out.styleName).toBe('custom');
  });

  it('series dashArray (raw) wins when point has no overrides', () => {
    const out = resolveSegmentDashArray(
      { x: 0, y: 0 },
      'dashed',
      '20 5',
    );
    expect(out.dashArray).toBe('20 5');
    expect(out.styleName).toBe('custom');
  });

  it('returns "" for solid', () => {
    const out = resolveSegmentDashArray({ x: 0, y: 0 }, 'solid');
    expect(out.dashArray).toBe('');
    expect(out.styleName).toBe('solid');
  });

  it('returns series default when point is undefined', () => {
    const out = resolveSegmentDashArray(undefined, 'longDash');
    expect(out.dashArray).toBe('14 6');
  });
});

describe('chart-line-dashed / buildLineDashedSegments', () => {
  it('returns [] for empty input', () => {
    expect(buildLineDashedSegments([], 'dashed')).toEqual([]);
  });

  it('returns [] for a single point', () => {
    expect(
      buildLineDashedSegments(
        [{ px: 0, py: 0, index: 0 }],
        'dashed',
      ),
    ).toEqual([]);
  });

  it('returns one segment when all points share the series dash', () => {
    const segs = buildLineDashedSegments(
      [
        { px: 0, py: 0, index: 0 },
        { px: 10, py: 5, index: 1 },
        { px: 20, py: 10, index: 2 },
      ],
      'dashed',
    );
    expect(segs).toHaveLength(1);
    expect(segs[0]!.dashArray).toBe('8 4');
    expect(segs[0]!.startIndex).toBe(0);
    expect(segs[0]!.endIndex).toBe(2);
    expect(segs[0]!.path).toContain('M ');
    expect(segs[0]!.path).toContain('L ');
  });

  it('splits when a point overrides the segment style', () => {
    const segs = buildLineDashedSegments(
      [
        { px: 0, py: 0, index: 0 },
        { px: 10, py: 5, index: 1 },
        { px: 20, py: 10, index: 2, segmentStyle: 'dotted' },
        { px: 30, py: 15, index: 3, segmentStyle: 'dotted' },
      ],
      'dashed',
    );
    expect(segs).toHaveLength(2);
    expect(segs[0]!.dashArray).toBe('8 4');
    expect(segs[0]!.endIndex).toBe(1);
    expect(segs[1]!.dashArray).toBe('2 4');
    expect(segs[1]!.startIndex).toBe(1);
    expect(segs[1]!.endIndex).toBe(3);
  });

  it('emits exactly one segment for two points', () => {
    const segs = buildLineDashedSegments(
      [
        { px: 0, py: 0, index: 0 },
        { px: 10, py: 5, index: 1 },
      ],
      'solid',
    );
    expect(segs).toHaveLength(1);
    expect(segs[0]!.dashArray).toBe('');
  });

  it('per-segment dashArray overrides the named style', () => {
    const segs = buildLineDashedSegments(
      [
        { px: 0, py: 0, index: 0 },
        {
          px: 10,
          py: 5,
          index: 1,
          segmentDashArray: '20 5 2 5',
        },
      ],
      'dashed',
    );
    expect(segs[0]!.dashArray).toBe('20 5 2 5');
    expect(segs[0]!.styleName).toBe('custom');
  });

  it('produces 3 segments for an alternating series', () => {
    const segs = buildLineDashedSegments(
      [
        { px: 0, py: 0, index: 0 },
        { px: 10, py: 5, index: 1 },
        {
          px: 20,
          py: 10,
          index: 2,
          segmentStyle: 'dotted',
        },
        { px: 30, py: 15, index: 3 },
      ],
      'dashed',
    );
    expect(segs).toHaveLength(3);
    expect(segs.map((s) => s.dashArray)).toEqual(['8 4', '2 4', '8 4']);
  });
});

describe('chart-line-dashed / computeLineDashedLayout', () => {
  it('returns empty when canvas is degenerate', () => {
    expect(
      computeLineDashedLayout({
        series: [{ id: 'a', label: 'A', data: [{ x: 1, y: 1 }] }],
        width: 10,
        height: 10,
        padding: 100,
      }).series,
    ).toEqual([]);
  });

  it('returns empty when no series', () => {
    expect(
      computeLineDashedLayout({
        series: [],
        width: 500,
        height: 200,
        padding: 20,
      }).series,
    ).toEqual([]);
  });

  it('returns empty when every series is hidden', () => {
    expect(
      computeLineDashedLayout({
        series: [{ id: 'a', label: 'A', data: [{ x: 1, y: 1 }] }],
        hidden: ['a'],
        width: 500,
        height: 200,
        padding: 20,
      }).series,
    ).toEqual([]);
  });

  it('maps x and y to pixel coordinates', () => {
    const out = computeLineDashedLayout({
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

  it('drops non-finite points but keeps totalCount', () => {
    const out = computeLineDashedLayout({
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

  it('attaches per-series default dash array based on dashStyle', () => {
    const out = computeLineDashedLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
          dashStyle: 'dotted',
        },
      ],
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.series[0]!.dashStyle).toBe('dotted');
    expect(out.series[0]!.defaultDashArray).toBe('2 4');
  });

  it('per-series dashArray override beats named style', () => {
    const out = computeLineDashedLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
          dashStyle: 'dotted',
          dashArray: '30 5',
        },
      ],
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.series[0]!.defaultDashArray).toBe('30 5');
    expect(out.series[0]!.segments[0]!.dashArray).toBe('30 5');
  });

  it('emits one segment per dash transition within a series', () => {
    const out = computeLineDashedLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          dashStyle: 'solid',
          data: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
            { x: 2, y: 2, segmentStyle: 'dashed' },
            { x: 3, y: 3, segmentStyle: 'dashed' },
          ],
        },
      ],
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.series[0]!.segments).toHaveLength(2);
    expect(out.series[0]!.segments[0]!.dashArray).toBe('');
    expect(out.series[0]!.segments[1]!.dashArray).toBe('8 4');
  });

  it('records segment startIndex / endIndex from the original data', () => {
    const out = computeLineDashedLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          dashStyle: 'solid',
          data: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
            { x: 2, y: 2, segmentStyle: 'dashed' },
          ],
        },
      ],
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.series[0]!.segments[0]!.startIndex).toBe(0);
    expect(out.series[0]!.segments[0]!.endIndex).toBe(1);
    expect(out.series[0]!.segments[1]!.startIndex).toBe(1);
    expect(out.series[0]!.segments[1]!.endIndex).toBe(2);
  });

  it('records series index across hidden-series filter', () => {
    const out = computeLineDashedLayout({
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
});

describe('chart-line-dashed / describeLineDashedChart', () => {
  it('returns "No data" when empty', () => {
    expect(describeLineDashedChart([])).toBe('No data');
  });

  it('returns "No data" when no finite points', () => {
    expect(
      describeLineDashedChart([
        {
          id: 'a',
          label: 'A',
          data: [{ x: NaN, y: 1 } as { x: number; y: number }],
        },
      ]),
    ).toBe('No data');
  });

  it('summarises series count, total points, and ranges', () => {
    const out = describeLineDashedChart([
      {
        id: 'a',
        label: 'A',
        data: [
          { x: 0, y: 1 },
          { x: 1, y: 2 },
        ],
      },
      {
        id: 'b',
        label: 'B',
        data: [
          { x: 2, y: 5 },
          { x: 3, y: 7 },
        ],
      },
    ]);
    expect(out).toContain('2 series');
    expect(out).toContain('4 points');
  });

  it('excludes hidden series from the summary', () => {
    const out = describeLineDashedChart(
      [
        { id: 'a', label: 'A', data: [{ x: 0, y: 1 }] },
        { id: 'b', label: 'B', data: [{ x: 0, y: 100 }] },
      ],
      ['b'],
    );
    expect(out).toContain('1 series');
  });
});

const FIXTURE: ChartLineDashedSeries[] = [
  {
    id: 'a',
    label: 'Actuals',
    dashStyle: 'solid',
    data: [
      { x: 0, y: 1 },
      { x: 1, y: 2 },
      { x: 2, y: 3, segmentStyle: 'dashed' },
      { x: 3, y: 4, segmentStyle: 'dashed' },
    ],
  },
  {
    id: 'b',
    label: 'Forecast',
    dashStyle: 'dotted',
    data: [
      { x: 0, y: 5 },
      { x: 1, y: 4 },
      { x: 2, y: 6 },
      { x: 3, y: 3 },
    ],
  },
];

describe('chart-line-dashed / <ChartLineDashed>', () => {
  it('renders a root region with the default aria label', () => {
    render(<ChartLineDashed series={FIXTURE} />);
    const root = document.querySelector(
      '[data-section="chart-line-dashed"]',
    )!;
    expect(root.getAttribute('aria-label')).toBe('Dashed line chart');
  });

  it('exposes series + segment counts as data attrs', () => {
    render(<ChartLineDashed series={FIXTURE} />);
    const root = document.querySelector(
      '[data-section="chart-line-dashed"]',
    )!;
    expect(root.getAttribute('data-series-count')).toBe('2');
    expect(root.getAttribute('data-visible-series-count')).toBe('2');
    expect(root.getAttribute('data-total-points')).toBe('8');
    // Series A has 2 segments (solid then dashed), Series B has 1 (all dotted)
    expect(root.getAttribute('data-total-segments')).toBe('3');
  });

  it('renders an aria description with summary text', () => {
    render(<ChartLineDashed series={FIXTURE} />);
    expect(
      document.querySelector('[data-section="chart-line-dashed-aria-desc"]')
        ?.textContent ?? '',
    ).toContain('2 series');
  });

  it('respects a custom aria description', () => {
    render(<ChartLineDashed series={FIXTURE} ariaDescription="custom" />);
    expect(
      document.querySelector('[data-section="chart-line-dashed-aria-desc"]')
        ?.textContent,
    ).toBe('custom');
  });

  it('renders one <path> per segment', () => {
    render(<ChartLineDashed series={FIXTURE} />);
    const paths = document.querySelectorAll(
      '[data-section="chart-line-dashed-path"]',
    );
    expect(paths.length).toBe(3);
  });

  it('applies stroke-dasharray per segment', () => {
    render(<ChartLineDashed series={FIXTURE} />);
    const seriesA = document.querySelectorAll(
      '[data-section="chart-line-dashed-path"][data-series-id="a"]',
    );
    expect(seriesA[0]!.getAttribute('data-segment-dash-array')).toBe('');
    expect(seriesA[1]!.getAttribute('data-segment-dash-array')).toBe('8 4');
    const seriesB = document.querySelectorAll(
      '[data-section="chart-line-dashed-path"][data-series-id="b"]',
    );
    expect(seriesB[0]!.getAttribute('data-segment-dash-array')).toBe('2 4');
  });

  it('exposes segment style data attrs', () => {
    render(<ChartLineDashed series={FIXTURE} />);
    const seg = document.querySelector(
      '[data-section="chart-line-dashed-path"][data-series-id="a"][data-segment-index="1"]',
    )!;
    expect(seg.getAttribute('data-segment-style')).toBe('dashed');
    expect(seg.getAttribute('data-segment-start')).toBe('1');
    expect(seg.getAttribute('data-segment-end')).toBe('3');
  });

  it('renders one dot per finite point when showDots=true', () => {
    render(<ChartLineDashed series={FIXTURE} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-dashed-dot"]')
        .length,
    ).toBe(8);
  });

  it('omits dots when showDots=false', () => {
    render(<ChartLineDashed series={FIXTURE} showDots={false} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-dashed-dot"]')
        .length,
    ).toBe(0);
  });

  it('renders a legend item per series', () => {
    render(<ChartLineDashed series={FIXTURE} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-dashed-legend-item"]',
      ).length,
    ).toBe(2);
  });

  it('legend swatch reflects series dash pattern', () => {
    render(<ChartLineDashed series={FIXTURE} />);
    const swatches = document.querySelectorAll(
      '[data-section="chart-line-dashed-legend-swatch"] line',
    );
    // First series is dashStyle='solid', so swatch line has no dasharray
    expect(swatches[0]!.getAttribute('stroke-dasharray')).toBeNull();
    // Second series is dashStyle='dotted'
    expect(swatches[1]!.getAttribute('stroke-dasharray')).toBe('2 4');
  });

  it('toggles hidden state via legend (uncontrolled)', () => {
    render(<ChartLineDashed series={FIXTURE} />);
    const btn = document.querySelector(
      '[data-section="chart-line-dashed-legend-item"][data-series-id="a"] [data-section="chart-line-dashed-legend-button"]',
    ) as HTMLElement;
    fireEvent.click(btn);
    const item = document.querySelector(
      '[data-section="chart-line-dashed-legend-item"][data-series-id="a"]',
    )!;
    expect(item.getAttribute('data-hidden')).toBe('true');
  });

  it('does not mutate hiddenSeries when controlled', () => {
    const handler = vi.fn();
    render(
      <ChartLineDashed
        series={FIXTURE}
        hiddenSeries={[]}
        onHiddenSeriesChange={handler}
      />,
    );
    const btn = document.querySelector(
      '[data-section="chart-line-dashed-legend-item"][data-series-id="a"] [data-section="chart-line-dashed-legend-button"]',
    ) as HTMLElement;
    fireEvent.click(btn);
    expect(handler).toHaveBeenCalledWith(['a']);
  });

  it('fires onSeriesToggle with the hidden flag', () => {
    const handler = vi.fn();
    render(<ChartLineDashed series={FIXTURE} onSeriesToggle={handler} />);
    const btn = document.querySelector(
      '[data-section="chart-line-dashed-legend-item"][data-series-id="b"] [data-section="chart-line-dashed-legend-button"]',
    ) as HTMLElement;
    fireEvent.click(btn);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0]!.hidden).toBe(true);
  });

  it('respects defaultHiddenSeries on mount', () => {
    render(
      <ChartLineDashed series={FIXTURE} defaultHiddenSeries={['a']} />,
    );
    const item = document.querySelector(
      '[data-section="chart-line-dashed-legend-item"][data-series-id="a"]',
    )!;
    expect(item.getAttribute('data-hidden')).toBe('true');
  });

  it('shows tooltip on dot hover', () => {
    render(<ChartLineDashed series={FIXTURE} />);
    const dot = document.querySelectorAll(
      '[data-section="chart-line-dashed-dot"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(dot);
    const tip = document.querySelector(
      '[data-section="chart-line-dashed-tooltip"]',
    );
    expect(tip).not.toBeNull();
    expect(tip!.textContent).toContain('Actuals');
  });

  it('hides tooltip on mouse leave', () => {
    render(<ChartLineDashed series={FIXTURE} />);
    const dot = document.querySelectorAll(
      '[data-section="chart-line-dashed-dot"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(dot);
    fireEvent.mouseLeave(dot);
    expect(
      document.querySelector('[data-section="chart-line-dashed-tooltip"]'),
    ).toBeNull();
  });

  it('fires onPointClick with series + point', () => {
    const handler = vi.fn();
    render(<ChartLineDashed series={FIXTURE} onPointClick={handler} />);
    const dot = document.querySelectorAll(
      '[data-section="chart-line-dashed-dot"]',
    )[0] as SVGElement;
    fireEvent.click(dot);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0]!.series.id).toBe('a');
  });

  it('hides axis when showAxis=false', () => {
    render(<ChartLineDashed series={FIXTURE} showAxis={false} />);
    expect(
      document.querySelector('[data-section="chart-line-dashed-axes"]'),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    render(<ChartLineDashed series={FIXTURE} showGrid={false} />);
    expect(
      document.querySelector('[data-section="chart-line-dashed-grid"]'),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    render(<ChartLineDashed series={FIXTURE} showLegend={false} />);
    expect(
      document.querySelector('[data-section="chart-line-dashed-legend"]'),
    ).toBeNull();
  });

  it('hides tooltip when showTooltip=false', () => {
    render(<ChartLineDashed series={FIXTURE} showTooltip={false} />);
    const dot = document.querySelectorAll(
      '[data-section="chart-line-dashed-dot"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(dot);
    expect(
      document.querySelector('[data-section="chart-line-dashed-tooltip"]'),
    ).toBeNull();
  });

  it('applies the animate flag to the data attribute', () => {
    render(<ChartLineDashed series={FIXTURE} animate={false} />);
    const root = document.querySelector(
      '[data-section="chart-line-dashed"]',
    )!;
    expect(root.getAttribute('data-animate')).toBe('false');
  });

  it('renders optional axis labels', () => {
    render(<ChartLineDashed series={FIXTURE} xLabel="t" yLabel="signal" />);
    expect(
      document.querySelector('[data-section="chart-line-dashed-x-label"]')
        ?.textContent,
    ).toBe('t');
    expect(
      document.querySelector('[data-section="chart-line-dashed-y-label"]')
        ?.textContent,
    ).toBe('signal');
  });

  it('overrides default colour via series.color', () => {
    render(
      <ChartLineDashed
        series={[
          {
            id: 'a',
            label: 'A',
            data: [{ x: 0, y: 0 }],
            color: '#abcdef',
          },
        ]}
      />,
    );
    const grp = document.querySelector(
      '[data-section="chart-line-dashed-series-group"]',
    )!;
    expect(grp.getAttribute('data-series-color')).toBe('#abcdef');
  });

  it('renders empty state when no series', () => {
    render(<ChartLineDashed series={[]} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-dashed-path"]')
        .length,
    ).toBe(0);
    expect(
      document.querySelector('[data-section="chart-line-dashed-aria-desc"]')
        ?.textContent,
    ).toBe('No data');
  });

  it('renders per-segment aria-label with series, style, range', () => {
    render(<ChartLineDashed series={FIXTURE} />);
    const seg = document.querySelector(
      '[data-section="chart-line-dashed-path"][data-series-id="a"][data-segment-index="0"]',
    ) as SVGElement;
    const aria = seg.getAttribute('aria-label') ?? '';
    expect(aria).toContain('Actuals');
    expect(aria).toContain('solid');
  });

  it('sets data-hovered on the hovered dot and parent series group', () => {
    render(<ChartLineDashed series={FIXTURE} />);
    const dot = document.querySelectorAll(
      '[data-section="chart-line-dashed-dot"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(dot);
    expect(dot.getAttribute('data-hovered')).toBe('true');
    const grp = document.querySelector(
      '[data-section="chart-line-dashed-series-group"][data-series-id="a"]',
    )!;
    expect(grp.getAttribute('data-hovered')).toBe('true');
  });

  it('renders distinct paths for each named pattern across series', () => {
    const fixture: ChartLineDashedSeries[] = [
      {
        id: 'a',
        label: 'Solid',
        dashStyle: 'solid',
        data: [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
      },
      {
        id: 'b',
        label: 'Dashed',
        dashStyle: 'dashed',
        data: [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
      },
      {
        id: 'c',
        label: 'Dotted',
        dashStyle: 'dotted',
        data: [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
      },
      {
        id: 'd',
        label: 'DashDot',
        dashStyle: 'dashDot',
        data: [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
      },
      {
        id: 'e',
        label: 'LongDash',
        dashStyle: 'longDash',
        data: [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
      },
    ];
    render(<ChartLineDashed series={fixture} />);
    const paths = document.querySelectorAll(
      '[data-section="chart-line-dashed-path"]',
    );
    expect(paths.length).toBe(5);
    const dashes = Array.from(paths).map((p) =>
      p.getAttribute('data-segment-dash-array'),
    );
    expect(new Set(dashes).size).toBe(5);
  });
});
