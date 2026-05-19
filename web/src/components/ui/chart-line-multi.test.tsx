import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

import {
  ChartLineMulti,
  DEFAULT_CHART_LINE_MULTI_WIDTH,
  DEFAULT_CHART_LINE_MULTI_HEIGHT,
  DEFAULT_CHART_LINE_MULTI_PADDING,
  DEFAULT_CHART_LINE_MULTI_TICK_COUNT,
  DEFAULT_CHART_LINE_MULTI_STROKE_WIDTH,
  DEFAULT_CHART_LINE_MULTI_DOT_RADIUS,
  DEFAULT_CHART_LINE_MULTI_LINE_OPACITY,
  DEFAULT_CHART_LINE_MULTI_CROSSHAIR_COLOR,
  DEFAULT_CHART_LINE_MULTI_GRID_COLOR,
  DEFAULT_CHART_LINE_MULTI_AXIS_COLOR,
  DEFAULT_CHART_LINE_MULTI_PALETTE,
  buildLineMultiPath,
  collectLineMultiXValues,
  computeLineMultiLayout,
  describeLineMultiChart,
  findNearestPointInSeries,
  findNearestXIndex,
  getLineMultiBounds,
  getLineMultiDefaultColor,
  getLineMultiFinitePoints,
  getLineMultiTicks,
  type ChartLineMultiLayoutPoint,
  type ChartLineMultiSeries,
} from './chart-line-multi';

afterEach(() => {
  cleanup();
});

describe('chart-line-multi / constants', () => {
  it('exports sensible defaults', () => {
    expect(DEFAULT_CHART_LINE_MULTI_WIDTH).toBe(560);
    expect(DEFAULT_CHART_LINE_MULTI_HEIGHT).toBe(320);
    expect(DEFAULT_CHART_LINE_MULTI_PADDING).toBe(40);
    expect(DEFAULT_CHART_LINE_MULTI_TICK_COUNT).toBe(5);
    expect(DEFAULT_CHART_LINE_MULTI_STROKE_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_MULTI_DOT_RADIUS).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_MULTI_LINE_OPACITY).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_MULTI_CROSSHAIR_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_LINE_MULTI_GRID_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_LINE_MULTI_AXIS_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_LINE_MULTI_PALETTE).toHaveLength(10);
  });
});

describe('chart-line-multi / getLineMultiDefaultColor', () => {
  it('wraps with modulo', () => {
    expect(getLineMultiDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_MULTI_PALETTE[0],
    );
    expect(getLineMultiDefaultColor(10)).toBe(
      DEFAULT_CHART_LINE_MULTI_PALETTE[0],
    );
  });

  it('falls back to first colour for invalid indices', () => {
    expect(getLineMultiDefaultColor(-1)).toBe(
      DEFAULT_CHART_LINE_MULTI_PALETTE[0],
    );
    expect(getLineMultiDefaultColor(NaN)).toBe(
      DEFAULT_CHART_LINE_MULTI_PALETTE[0],
    );
  });
});

describe('chart-line-multi / getLineMultiFinitePoints', () => {
  it('drops points with non-finite x or y', () => {
    const out = getLineMultiFinitePoints([
      { x: 1, y: 1 },
      { x: NaN, y: 2 },
      { x: 3, y: Infinity },
      { x: 4, y: 4 },
    ]);
    expect(out.map((p) => p.x)).toEqual([1, 4]);
  });

  it('returns [] for non-array input', () => {
    expect(getLineMultiFinitePoints(null as unknown as never[])).toEqual([]);
  });
});

describe('chart-line-multi / getLineMultiBounds', () => {
  it('returns unit square for empty input', () => {
    expect(getLineMultiBounds([])).toEqual({
      xMin: 0,
      xMax: 1,
      yMin: 0,
      yMax: 1,
    });
  });

  it('spans all visible series', () => {
    expect(
      getLineMultiBounds([
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: 5 },
            { x: 5, y: 10 },
          ],
        },
        {
          id: 'b',
          label: 'B',
          data: [
            { x: 1, y: 1 },
            { x: 8, y: 20 },
          ],
        },
      ]),
    ).toEqual({ xMin: 0, xMax: 8, yMin: 1, yMax: 20 });
  });

  it('excludes hidden series', () => {
    expect(
      getLineMultiBounds(
        [
          { id: 'a', label: 'A', data: [{ x: 1, y: 1 }] },
          { id: 'b', label: 'B', data: [{ x: 100, y: 100 }] },
        ],
        ['b'],
      ),
    ).toEqual({ xMin: 0.5, xMax: 1.5, yMin: 0.5, yMax: 1.5 });
  });
});

describe('chart-line-multi / getLineMultiTicks', () => {
  it('returns evenly-spaced ticks', () => {
    const ticks = getLineMultiTicks(0, 10, 5);
    expect(ticks).toHaveLength(5);
    expect(ticks[0]!.value).toBe(0);
    expect(ticks[4]!.value).toBe(10);
  });

  it('returns [] for invalid range', () => {
    expect(getLineMultiTicks(10, 5, 4)).toEqual([]);
  });
});

describe('chart-line-multi / collectLineMultiXValues', () => {
  it('returns [] for empty input', () => {
    expect(collectLineMultiXValues([])).toEqual([]);
  });

  it('dedupes and sorts x values across series', () => {
    const out = collectLineMultiXValues([
      {
        id: 'a',
        label: 'A',
        data: [
          { x: 0, y: 0 },
          { x: 2, y: 1 },
          { x: 4, y: 2 },
        ],
      },
      {
        id: 'b',
        label: 'B',
        data: [
          { x: 1, y: 5 },
          { x: 2, y: 6 },
          { x: 3, y: 7 },
        ],
      },
    ]);
    expect(out).toEqual([0, 1, 2, 3, 4]);
  });

  it('excludes hidden series', () => {
    expect(
      collectLineMultiXValues(
        [
          { id: 'a', label: 'A', data: [{ x: 1, y: 1 }] },
          { id: 'b', label: 'B', data: [{ x: 99, y: 1 }] },
        ],
        ['b'],
      ),
    ).toEqual([1]);
  });

  it('drops non-finite x values', () => {
    expect(
      collectLineMultiXValues([
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 1, y: 1 },
            { x: NaN, y: 2 },
            { x: 3, y: 3 },
          ],
        },
      ]),
    ).toEqual([1, 3]);
  });
});

describe('chart-line-multi / findNearestXIndex', () => {
  it('returns -1 for empty input', () => {
    expect(findNearestXIndex([], 5)).toBe(-1);
  });

  it('returns -1 for non-finite target', () => {
    expect(findNearestXIndex([0, 1, 2], NaN)).toBe(-1);
  });

  it('clamps to lo when target is below the range', () => {
    expect(findNearestXIndex([1, 5, 10], -100)).toBe(0);
  });

  it('clamps to hi when target is above the range', () => {
    expect(findNearestXIndex([1, 5, 10], 100)).toBe(2);
  });

  it('returns the exact-match index', () => {
    expect(findNearestXIndex([0, 5, 10, 15, 20], 10)).toBe(2);
  });

  it('returns the nearest index when between values', () => {
    expect(findNearestXIndex([0, 10, 20], 12)).toBe(1);
    expect(findNearestXIndex([0, 10, 20], 18)).toBe(2);
  });

  it('breaks ties toward the lower index', () => {
    expect(findNearestXIndex([0, 10, 20], 5)).toBe(0);
    expect(findNearestXIndex([0, 10, 20], 15)).toBe(1);
  });
});

describe('chart-line-multi / findNearestPointInSeries', () => {
  const layoutPoints: ChartLineMultiLayoutPoint[] = [
    { index: 0, x: 0, y: 0, px: 0, py: 0 },
    { index: 1, x: 5, y: 0, px: 5, py: 0 },
    { index: 2, x: 10, y: 0, px: 10, py: 0 },
  ];

  it('returns null for empty input', () => {
    expect(findNearestPointInSeries([], 5)).toBeNull();
  });

  it('returns null for non-finite target', () => {
    expect(findNearestPointInSeries(layoutPoints, NaN)).toBeNull();
  });

  it('returns the closest point', () => {
    expect(findNearestPointInSeries(layoutPoints, 4)?.index).toBe(1);
    expect(findNearestPointInSeries(layoutPoints, 7)?.index).toBe(1);
    expect(findNearestPointInSeries(layoutPoints, 9)?.index).toBe(2);
  });

  it('returns first match on ties (lower-index wins on tie)', () => {
    // x=2.5 is equidistant from 0 and 5 -- algorithm prefers lower (first) match
    expect(findNearestPointInSeries(layoutPoints, 2.5)?.index).toBe(0);
  });
});

describe('chart-line-multi / buildLineMultiPath', () => {
  it('returns "" for empty input', () => {
    expect(buildLineMultiPath([])).toBe('');
  });

  it('returns M-only for single point', () => {
    expect(buildLineMultiPath([{ px: 5, py: 10 }])).toBe('M 5.000 10.000');
  });

  it('emits one L per additional point', () => {
    const out = buildLineMultiPath([
      { px: 0, py: 0 },
      { px: 5, py: 5 },
      { px: 10, py: 0 },
    ]);
    expect(out.startsWith('M 0.000 0.000')).toBe(true);
    expect((out.match(/L /g) ?? []).length).toBe(2);
  });
});

describe('chart-line-multi / computeLineMultiLayout', () => {
  it('returns empty when canvas is degenerate', () => {
    expect(
      computeLineMultiLayout({
        series: [{ id: 'a', label: 'A', data: [{ x: 1, y: 1 }] }],
        width: 10,
        height: 10,
        padding: 100,
      }).series,
    ).toEqual([]);
  });

  it('returns empty when no series', () => {
    expect(
      computeLineMultiLayout({
        series: [],
        width: 500,
        height: 200,
        padding: 20,
      }).series,
    ).toEqual([]);
  });

  it('returns empty when every series is hidden', () => {
    expect(
      computeLineMultiLayout({
        series: [{ id: 'a', label: 'A', data: [{ x: 1, y: 1 }] }],
        hidden: ['a'],
        width: 500,
        height: 200,
        padding: 20,
      }).series,
    ).toEqual([]);
  });

  it('builds an xUnion across visible series', () => {
    const out = computeLineMultiLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
        },
        {
          id: 'b',
          label: 'B',
          data: [
            { x: 1, y: 5 },
            { x: 2, y: 6 },
          ],
        },
      ],
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.xUnion).toEqual([0, 1, 2]);
    expect(out.xUnionPx).toHaveLength(3);
  });

  it('excludes hidden series from xUnion', () => {
    const out = computeLineMultiLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
        },
        {
          id: 'b',
          label: 'B',
          data: [{ x: 99, y: 99 }],
        },
      ],
      hidden: ['b'],
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.xUnion).toEqual([0, 1]);
  });

  it('maps x and y to pixel coordinates', () => {
    const out = computeLineMultiLayout({
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
    expect(pts[1]!.px).toBeCloseTo(40 + (500 - 80), 5);
  });

  it('drops non-finite points but keeps totalCount', () => {
    const out = computeLineMultiLayout({
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

  it('builds a per-series straight-line path', () => {
    const out = computeLineMultiLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
            { x: 2, y: 0 },
          ],
        },
      ],
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.series[0]!.path.startsWith('M ')).toBe(true);
    expect(out.series[0]!.path).toContain('L ');
  });

  it('records series index across hidden-series filter', () => {
    const out = computeLineMultiLayout({
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

  it('produces tick positions inside the canvas', () => {
    const out = computeLineMultiLayout({
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
      width: 500,
      height: 300,
      padding: 40,
    });
    for (const t of out.xTicks) {
      expect(t.position).toBeGreaterThanOrEqual(40 - 1e-6);
      expect(t.position).toBeLessThanOrEqual(500 - 40 + 1e-6);
    }
  });
});

describe('chart-line-multi / describeLineMultiChart', () => {
  it('returns "No data" when empty', () => {
    expect(describeLineMultiChart([])).toBe('No data');
  });

  it('returns "No data" when no finite points', () => {
    expect(
      describeLineMultiChart([
        {
          id: 'a',
          label: 'A',
          data: [{ x: NaN, y: 1 } as { x: number; y: number }],
        },
      ]),
    ).toBe('No data');
  });

  it('summarises series count, total points, range, and crosshair', () => {
    const out = describeLineMultiChart([
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
    expect(out).toContain('crosshair');
  });

  it('excludes hidden series from the summary', () => {
    const out = describeLineMultiChart(
      [
        { id: 'a', label: 'A', data: [{ x: 0, y: 1 }] },
        { id: 'b', label: 'B', data: [{ x: 0, y: 100 }] },
      ],
      ['b'],
    );
    expect(out).toContain('1 series');
  });
});

const FIXTURE: ChartLineMultiSeries[] = [
  {
    id: 'a',
    label: 'CPU',
    data: [
      { x: 0, y: 12 },
      { x: 1, y: 32 },
      { x: 2, y: 28 },
      { x: 3, y: 45 },
    ],
  },
  {
    id: 'b',
    label: 'Memory',
    data: [
      { x: 0, y: 60 },
      { x: 1, y: 65 },
      { x: 2, y: 70 },
      { x: 3, y: 68 },
    ],
  },
];

// jsdom returns 0-rects from getBoundingClientRect by default; mock it so
// the overlay's pointer-to-pixel mapping produces sensible coordinates.
function mockSvgRect(width: number, height: number): void {
  SVGSVGElement.prototype.getBoundingClientRect = function () {
    return {
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: width,
      bottom: height,
      width,
      height,
      toJSON: () => ({}),
    } as DOMRect;
  };
}

describe('chart-line-multi / <ChartLineMulti>', () => {
  it('renders a root region with the default aria label', () => {
    render(<ChartLineMulti series={FIXTURE} />);
    const root = document.querySelector('[data-section="chart-line-multi"]')!;
    expect(root.getAttribute('aria-label')).toBe('Multi-series line chart');
  });

  it('exposes series + xUnion counts as data attrs', () => {
    render(<ChartLineMulti series={FIXTURE} />);
    const root = document.querySelector('[data-section="chart-line-multi"]')!;
    expect(root.getAttribute('data-series-count')).toBe('2');
    expect(root.getAttribute('data-visible-series-count')).toBe('2');
    expect(root.getAttribute('data-total-points')).toBe('8');
    expect(root.getAttribute('data-x-union-count')).toBe('4');
    expect(root.getAttribute('data-crosshair-active')).toBe('false');
  });

  it('renders an aria description with summary text', () => {
    render(<ChartLineMulti series={FIXTURE} />);
    expect(
      document.querySelector('[data-section="chart-line-multi-aria-desc"]')
        ?.textContent ?? '',
    ).toContain('2 series');
  });

  it('respects a custom aria description', () => {
    render(<ChartLineMulti series={FIXTURE} ariaDescription="custom" />);
    expect(
      document.querySelector('[data-section="chart-line-multi-aria-desc"]')
        ?.textContent,
    ).toBe('custom');
  });

  it('renders one path per visible series', () => {
    render(<ChartLineMulti series={FIXTURE} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-multi-path"]')
        .length,
    ).toBe(2);
  });

  it('renders one dot per finite point when showDots=true', () => {
    render(<ChartLineMulti series={FIXTURE} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-multi-dot"]')
        .length,
    ).toBe(8);
  });

  it('omits dots when showDots=false', () => {
    render(<ChartLineMulti series={FIXTURE} showDots={false} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-multi-dot"]')
        .length,
    ).toBe(0);
  });

  it('renders an overlay rect for pointer capture', () => {
    render(<ChartLineMulti series={FIXTURE} />);
    expect(
      document.querySelector('[data-section="chart-line-multi-overlay"]'),
    ).not.toBeNull();
  });

  it('shows crosshair + tooltip listing all visible series on hover', () => {
    mockSvgRect(560, 320);
    render(<ChartLineMulti series={FIXTURE} />);
    const overlay = document.querySelector(
      '[data-section="chart-line-multi-overlay"]',
    ) as SVGRectElement;
    // x=1 in data space lives roughly 1/3 across the inner width. Aim for x=2
    // in data, which is at roughly 2/3 across. Inner width = 560 - 80 = 480, so
    // 2/3 of that is 320, plus padding 40 = 360 clientX.
    fireEvent.pointerMove(overlay, { clientX: 360, clientY: 100 });
    const root = document.querySelector('[data-section="chart-line-multi"]')!;
    expect(root.getAttribute('data-crosshair-active')).toBe('true');
    const rows = document.querySelectorAll(
      '[data-section="chart-line-multi-tooltip-row"]',
    );
    expect(rows.length).toBe(2);
    const ids = Array.from(rows).map((r) => r.getAttribute('data-series-id'));
    expect(ids).toEqual(['a', 'b']);
    expect(
      document.querySelector('[data-section="chart-line-multi-crosshair-line"]'),
    ).not.toBeNull();
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-multi-crosshair-marker"]',
      ).length,
    ).toBe(2);
  });

  it('closes the crosshair on pointer leave', () => {
    mockSvgRect(560, 320);
    render(<ChartLineMulti series={FIXTURE} />);
    const overlay = document.querySelector(
      '[data-section="chart-line-multi-overlay"]',
    ) as SVGRectElement;
    fireEvent.pointerMove(overlay, { clientX: 200, clientY: 100 });
    fireEvent.pointerLeave(overlay);
    const root = document.querySelector('[data-section="chart-line-multi"]')!;
    expect(root.getAttribute('data-crosshair-active')).toBe('false');
    expect(
      document.querySelector('[data-section="chart-line-multi-crosshair-line"]'),
    ).toBeNull();
    expect(
      document.querySelector('[data-section="chart-line-multi-tooltip"]'),
    ).toBeNull();
  });

  it('fires onCrosshairChange with the snapped x and per-series points', () => {
    mockSvgRect(560, 320);
    const handler = vi.fn();
    render(
      <ChartLineMulti series={FIXTURE} onCrosshairChange={handler} />,
    );
    const overlay = document.querySelector(
      '[data-section="chart-line-multi-overlay"]',
    ) as SVGRectElement;
    fireEvent.pointerMove(overlay, { clientX: 200, clientY: 100 });
    expect(handler).toHaveBeenCalled();
    const arg = handler.mock.calls[handler.mock.calls.length - 1]![0];
    expect(arg).not.toBeNull();
    expect(arg!.points).toHaveLength(2);
    expect(arg!.points[0]!.series.id).toBe('a');
    expect(arg!.points[1]!.series.id).toBe('b');
  });

  it('fires onCrosshairChange(null) on pointer leave', () => {
    mockSvgRect(560, 320);
    const handler = vi.fn();
    render(
      <ChartLineMulti series={FIXTURE} onCrosshairChange={handler} />,
    );
    const overlay = document.querySelector(
      '[data-section="chart-line-multi-overlay"]',
    ) as SVGRectElement;
    fireEvent.pointerMove(overlay, { clientX: 200, clientY: 100 });
    handler.mockClear();
    fireEvent.pointerLeave(overlay);
    expect(handler).toHaveBeenCalledWith(null);
  });

  it('marks the crosshair-hit dots via data-crosshair-hit', () => {
    mockSvgRect(560, 320);
    render(<ChartLineMulti series={FIXTURE} />);
    const overlay = document.querySelector(
      '[data-section="chart-line-multi-overlay"]',
    ) as SVGRectElement;
    fireEvent.pointerMove(overlay, { clientX: 200, clientY: 100 });
    const hits = document.querySelectorAll(
      '[data-section="chart-line-multi-dot"][data-crosshair-hit="true"]',
    );
    expect(hits.length).toBe(2);
  });

  it('hides crosshair when showCrosshair=false', () => {
    mockSvgRect(560, 320);
    render(<ChartLineMulti series={FIXTURE} showCrosshair={false} />);
    const overlay = document.querySelector(
      '[data-section="chart-line-multi-overlay"]',
    ) as SVGRectElement;
    fireEvent.pointerMove(overlay, { clientX: 200, clientY: 100 });
    expect(
      document.querySelector('[data-section="chart-line-multi-crosshair"]'),
    ).toBeNull();
  });

  it('hides tooltip when showTooltip=false', () => {
    mockSvgRect(560, 320);
    render(<ChartLineMulti series={FIXTURE} showTooltip={false} />);
    const overlay = document.querySelector(
      '[data-section="chart-line-multi-overlay"]',
    ) as SVGRectElement;
    fireEvent.pointerMove(overlay, { clientX: 200, clientY: 100 });
    expect(
      document.querySelector('[data-section="chart-line-multi-tooltip"]'),
    ).toBeNull();
  });

  it('renders a legend item per series', () => {
    render(<ChartLineMulti series={FIXTURE} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-multi-legend-item"]',
      ).length,
    ).toBe(2);
  });

  it('toggles hidden state via legend (uncontrolled)', () => {
    render(<ChartLineMulti series={FIXTURE} />);
    const btn = document.querySelector(
      '[data-section="chart-line-multi-legend-item"][data-series-id="a"] [data-section="chart-line-multi-legend-button"]',
    ) as HTMLElement;
    fireEvent.click(btn);
    const item = document.querySelector(
      '[data-section="chart-line-multi-legend-item"][data-series-id="a"]',
    )!;
    expect(item.getAttribute('data-hidden')).toBe('true');
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-multi-path"][data-series-id="a"]',
      ).length,
    ).toBe(0);
  });

  it('does not mutate hiddenSeries when controlled', () => {
    const handler = vi.fn();
    render(
      <ChartLineMulti
        series={FIXTURE}
        hiddenSeries={[]}
        onHiddenSeriesChange={handler}
      />,
    );
    const btn = document.querySelector(
      '[data-section="chart-line-multi-legend-item"][data-series-id="a"] [data-section="chart-line-multi-legend-button"]',
    ) as HTMLElement;
    fireEvent.click(btn);
    expect(handler).toHaveBeenCalledWith(['a']);
  });

  it('fires onSeriesToggle with the hidden flag', () => {
    const handler = vi.fn();
    render(<ChartLineMulti series={FIXTURE} onSeriesToggle={handler} />);
    const btn = document.querySelector(
      '[data-section="chart-line-multi-legend-item"][data-series-id="b"] [data-section="chart-line-multi-legend-button"]',
    ) as HTMLElement;
    fireEvent.click(btn);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0]!.hidden).toBe(true);
  });

  it('respects defaultHiddenSeries on mount', () => {
    render(<ChartLineMulti series={FIXTURE} defaultHiddenSeries={['a']} />);
    const item = document.querySelector(
      '[data-section="chart-line-multi-legend-item"][data-series-id="a"]',
    )!;
    expect(item.getAttribute('data-hidden')).toBe('true');
  });

  it('hides axis when showAxis=false', () => {
    render(<ChartLineMulti series={FIXTURE} showAxis={false} />);
    expect(
      document.querySelector('[data-section="chart-line-multi-axes"]'),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    render(<ChartLineMulti series={FIXTURE} showGrid={false} />);
    expect(
      document.querySelector('[data-section="chart-line-multi-grid"]'),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    render(<ChartLineMulti series={FIXTURE} showLegend={false} />);
    expect(
      document.querySelector('[data-section="chart-line-multi-legend"]'),
    ).toBeNull();
  });

  it('applies the animate flag to the data attribute', () => {
    render(<ChartLineMulti series={FIXTURE} animate={false} />);
    const root = document.querySelector('[data-section="chart-line-multi"]')!;
    expect(root.getAttribute('data-animate')).toBe('false');
  });

  it('renders optional axis labels', () => {
    render(<ChartLineMulti series={FIXTURE} xLabel="t" yLabel="signal" />);
    expect(
      document.querySelector('[data-section="chart-line-multi-x-label"]')
        ?.textContent,
    ).toBe('t');
    expect(
      document.querySelector('[data-section="chart-line-multi-y-label"]')
        ?.textContent,
    ).toBe('signal');
  });

  it('uses formatValue / formatX for axis ticks', () => {
    render(
      <ChartLineMulti
        series={FIXTURE}
        formatValue={(n) => `y${n}`}
        formatX={(n) => `x${n}`}
      />,
    );
    const xLabel = document.querySelector(
      '[data-section="chart-line-multi-tick-label"][data-axis="x"]',
    );
    const yLabel = document.querySelector(
      '[data-section="chart-line-multi-tick-label"][data-axis="y"]',
    );
    expect(xLabel?.textContent?.startsWith('x')).toBe(true);
    expect(yLabel?.textContent?.startsWith('y')).toBe(true);
  });

  it('tooltip uses formatX for the x header and formatValue for each row', () => {
    mockSvgRect(560, 320);
    render(
      <ChartLineMulti
        series={FIXTURE}
        formatX={(n) => `t=${n}`}
        formatValue={(n) => `${n}u`}
      />,
    );
    const overlay = document.querySelector(
      '[data-section="chart-line-multi-overlay"]',
    ) as SVGRectElement;
    fireEvent.pointerMove(overlay, { clientX: 200, clientY: 100 });
    const xLine = document.querySelector(
      '[data-section="chart-line-multi-tooltip-x"]',
    );
    expect(xLine?.textContent?.startsWith('x:')).toBe(true);
    expect(xLine?.textContent).toContain('t=');
    const firstValue = document.querySelector(
      '[data-section="chart-line-multi-tooltip-value"]',
    );
    expect(firstValue?.textContent?.endsWith('u')).toBe(true);
  });

  it('overrides default colour via series.color', () => {
    render(
      <ChartLineMulti
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
      '[data-section="chart-line-multi-series-group"]',
    )!;
    expect(grp.getAttribute('data-series-color')).toBe('#abcdef');
  });

  it('renders empty state when no series', () => {
    render(<ChartLineMulti series={[]} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-multi-path"]')
        .length,
    ).toBe(0);
    expect(
      document.querySelector('[data-section="chart-line-multi-aria-desc"]')
        ?.textContent,
    ).toBe('No data');
  });

  it('renders grid lines per tick when showGrid=true', () => {
    render(<ChartLineMulti series={FIXTURE} tickCount={4} />);
    const lines = document.querySelectorAll(
      '[data-section="chart-line-multi-grid-line"]',
    );
    expect(lines.length).toBeGreaterThan(0);
  });

  it('hidden series rows do not appear in the tooltip', () => {
    mockSvgRect(560, 320);
    render(<ChartLineMulti series={FIXTURE} defaultHiddenSeries={['b']} />);
    const overlay = document.querySelector(
      '[data-section="chart-line-multi-overlay"]',
    ) as SVGRectElement;
    fireEvent.pointerMove(overlay, { clientX: 200, clientY: 100 });
    const rows = document.querySelectorAll(
      '[data-section="chart-line-multi-tooltip-row"]',
    );
    expect(rows.length).toBe(1);
    expect(rows[0]!.getAttribute('data-series-id')).toBe('a');
  });
});
