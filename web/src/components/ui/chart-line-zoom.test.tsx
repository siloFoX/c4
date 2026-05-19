import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

import {
  ChartLineZoom,
  DEFAULT_CHART_LINE_ZOOM_WIDTH,
  DEFAULT_CHART_LINE_ZOOM_HEIGHT,
  DEFAULT_CHART_LINE_ZOOM_PADDING,
  DEFAULT_CHART_LINE_ZOOM_TICK_COUNT,
  DEFAULT_CHART_LINE_ZOOM_STROKE_WIDTH,
  DEFAULT_CHART_LINE_ZOOM_DOT_RADIUS,
  DEFAULT_CHART_LINE_ZOOM_LINE_OPACITY,
  DEFAULT_CHART_LINE_ZOOM_MIN_BRUSH_WIDTH,
  DEFAULT_CHART_LINE_ZOOM_BRUSH_FILL,
  DEFAULT_CHART_LINE_ZOOM_BRUSH_OPACITY,
  DEFAULT_CHART_LINE_ZOOM_BRUSH_BORDER,
  DEFAULT_CHART_LINE_ZOOM_GRID_COLOR,
  DEFAULT_CHART_LINE_ZOOM_AXIS_COLOR,
  DEFAULT_CHART_LINE_ZOOM_PALETTE,
  buildLineZoomPath,
  clampLineZoomRange,
  computeLineZoomLayout,
  describeLineZoomChart,
  getLineZoomBounds,
  getLineZoomDefaultColor,
  getLineZoomFinitePoints,
  getLineZoomTicks,
  isLineZoomBrushValid,
  type ChartLineZoomSeries,
} from './chart-line-zoom';

afterEach(() => {
  cleanup();
});

describe('chart-line-zoom / constants', () => {
  it('exports sensible defaults', () => {
    expect(DEFAULT_CHART_LINE_ZOOM_WIDTH).toBe(560);
    expect(DEFAULT_CHART_LINE_ZOOM_HEIGHT).toBe(320);
    expect(DEFAULT_CHART_LINE_ZOOM_PADDING).toBe(40);
    expect(DEFAULT_CHART_LINE_ZOOM_TICK_COUNT).toBe(5);
    expect(DEFAULT_CHART_LINE_ZOOM_STROKE_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_ZOOM_DOT_RADIUS).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_ZOOM_LINE_OPACITY).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_ZOOM_MIN_BRUSH_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_ZOOM_BRUSH_FILL).toMatch(/^#/);
    expect(DEFAULT_CHART_LINE_ZOOM_BRUSH_OPACITY).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_ZOOM_BRUSH_BORDER).toMatch(/^#/);
    expect(DEFAULT_CHART_LINE_ZOOM_GRID_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_LINE_ZOOM_AXIS_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_LINE_ZOOM_PALETTE).toHaveLength(10);
  });
});

describe('chart-line-zoom / getLineZoomDefaultColor', () => {
  it('wraps with modulo', () => {
    expect(getLineZoomDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_ZOOM_PALETTE[0],
    );
    expect(getLineZoomDefaultColor(10)).toBe(
      DEFAULT_CHART_LINE_ZOOM_PALETTE[0],
    );
  });

  it('falls back to first colour for invalid indices', () => {
    expect(getLineZoomDefaultColor(-1)).toBe(
      DEFAULT_CHART_LINE_ZOOM_PALETTE[0],
    );
    expect(getLineZoomDefaultColor(NaN)).toBe(
      DEFAULT_CHART_LINE_ZOOM_PALETTE[0],
    );
  });
});

describe('chart-line-zoom / getLineZoomFinitePoints', () => {
  it('drops points with non-finite x or y', () => {
    const out = getLineZoomFinitePoints([
      { x: 1, y: 1 },
      { x: NaN, y: 2 },
      { x: 3, y: Infinity },
      { x: 4, y: 4 },
    ]);
    expect(out.map((p) => p.x)).toEqual([1, 4]);
  });

  it('returns [] for non-array input', () => {
    expect(getLineZoomFinitePoints(null as unknown as never[])).toEqual([]);
  });
});

describe('chart-line-zoom / getLineZoomBounds', () => {
  it('returns unit square for empty input', () => {
    expect(getLineZoomBounds([])).toEqual({
      xMin: 0,
      xMax: 1,
      yMin: 0,
      yMax: 1,
    });
  });

  it('spans all visible series', () => {
    expect(
      getLineZoomBounds([
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
      getLineZoomBounds(
        [
          { id: 'a', label: 'A', data: [{ x: 1, y: 1 }] },
          { id: 'b', label: 'B', data: [{ x: 100, y: 100 }] },
        ],
        ['b'],
      ),
    ).toEqual({ xMin: 0.5, xMax: 1.5, yMin: 0.5, yMax: 1.5 });
  });
});

describe('chart-line-zoom / getLineZoomTicks', () => {
  it('returns evenly-spaced ticks', () => {
    const ticks = getLineZoomTicks(0, 10, 5);
    expect(ticks).toHaveLength(5);
    expect(ticks[0]!.value).toBe(0);
    expect(ticks[4]!.value).toBe(10);
  });

  it('returns [] for invalid range', () => {
    expect(getLineZoomTicks(10, 5, 4)).toEqual([]);
  });
});

describe('chart-line-zoom / buildLineZoomPath', () => {
  it('returns "" for empty input', () => {
    expect(buildLineZoomPath([])).toBe('');
  });

  it('returns M-only for single point', () => {
    expect(buildLineZoomPath([{ px: 5, py: 10 }])).toBe('M 5.000 10.000');
  });

  it('emits one L per additional point', () => {
    const out = buildLineZoomPath([
      { px: 0, py: 0 },
      { px: 5, py: 5 },
      { px: 10, py: 0 },
    ]);
    expect((out.match(/L /g) ?? []).length).toBe(2);
  });
});

describe('chart-line-zoom / clampLineZoomRange', () => {
  it('returns null for null / undefined input', () => {
    expect(clampLineZoomRange(null, 0, 10)).toBeNull();
    expect(clampLineZoomRange(undefined, 0, 10)).toBeNull();
  });

  it('returns null for non-finite endpoints', () => {
    expect(clampLineZoomRange({ xMin: NaN, xMax: 5 }, 0, 10)).toBeNull();
    expect(clampLineZoomRange({ xMin: 0, xMax: Infinity }, 0, 10)).toBeNull();
  });

  it('normalises reversed ranges', () => {
    expect(clampLineZoomRange({ xMin: 8, xMax: 2 }, 0, 10)).toEqual({
      xMin: 2,
      xMax: 8,
    });
  });

  it('clamps to full bounds', () => {
    expect(clampLineZoomRange({ xMin: -5, xMax: 50 }, 0, 10)).toEqual({
      xMin: 0,
      xMax: 10,
    });
  });

  it('returns null for degenerate ranges after clamp', () => {
    expect(clampLineZoomRange({ xMin: 5, xMax: 5 }, 0, 10)).toBeNull();
    expect(clampLineZoomRange({ xMin: -10, xMax: -5 }, 0, 10)).toBeNull();
  });
});

describe('chart-line-zoom / isLineZoomBrushValid', () => {
  it('returns true when the brush is wide enough', () => {
    expect(isLineZoomBrushValid(0, 10, 4)).toBe(true);
  });

  it('returns false for narrow brushes', () => {
    expect(isLineZoomBrushValid(0, 2, 4)).toBe(false);
  });

  it('honours minBrushWidth = 0 (always commit)', () => {
    expect(isLineZoomBrushValid(0, 1, 0)).toBe(true);
  });

  it('returns false for non-finite endpoints', () => {
    expect(isLineZoomBrushValid(NaN, 10, 4)).toBe(false);
  });

  it('is sign-agnostic (right-to-left drag valid)', () => {
    expect(isLineZoomBrushValid(50, 10, 4)).toBe(true);
  });
});

describe('chart-line-zoom / computeLineZoomLayout', () => {
  it('returns empty when canvas is degenerate', () => {
    expect(
      computeLineZoomLayout({
        series: [{ id: 'a', label: 'A', data: [{ x: 1, y: 1 }] }],
        width: 10,
        height: 10,
        padding: 100,
      }).series,
    ).toEqual([]);
  });

  it('returns empty when no series', () => {
    expect(
      computeLineZoomLayout({
        series: [],
        width: 500,
        height: 200,
        padding: 20,
      }).series,
    ).toEqual([]);
  });

  it('returns empty when every series is hidden', () => {
    expect(
      computeLineZoomLayout({
        series: [{ id: 'a', label: 'A', data: [{ x: 1, y: 1 }] }],
        hidden: ['a'],
        width: 500,
        height: 200,
        padding: 20,
      }).series,
    ).toEqual([]);
  });

  it('uses full data range when zoom is null', () => {
    const out = computeLineZoomLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
          ],
        },
      ],
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.xMin).toBe(0);
    expect(out.xMax).toBe(100);
    expect(out.fullXMin).toBe(0);
    expect(out.fullXMax).toBe(100);
    expect(out.zoomActive).toBe(false);
  });

  it('applies the zoom range to xMin/xMax', () => {
    const out = computeLineZoomLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
          ],
        },
      ],
      zoom: { xMin: 20, xMax: 60 },
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.xMin).toBe(20);
    expect(out.xMax).toBe(60);
    expect(out.fullXMin).toBe(0);
    expect(out.fullXMax).toBe(100);
    expect(out.zoomActive).toBe(true);
  });

  it('clamps an over-wide zoom to fullX bounds', () => {
    const out = computeLineZoomLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
          ],
        },
      ],
      zoom: { xMin: -50, xMax: 200 },
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.xMin).toBe(0);
    expect(out.xMax).toBe(100);
    expect(out.zoomActive).toBe(true);
  });

  it('ignores a degenerate zoom', () => {
    const out = computeLineZoomLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
          ],
        },
      ],
      zoom: { xMin: 50, xMax: 50 },
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.zoomActive).toBe(false);
    expect(out.xMin).toBe(0);
    expect(out.xMax).toBe(100);
  });

  it('maps x and y to pixel coordinates against the zoomed range', () => {
    const out = computeLineZoomLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 20, y: 0 },
            { x: 60, y: 10 },
          ],
        },
      ],
      zoom: { xMin: 20, xMax: 60 },
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
    const out = computeLineZoomLayout({
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

  it('builds a straight-line path per series', () => {
    const out = computeLineZoomLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: 0 },
            { x: 5, y: 5 },
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
    const out = computeLineZoomLayout({
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

describe('chart-line-zoom / describeLineZoomChart', () => {
  it('returns "No data" when empty', () => {
    expect(describeLineZoomChart([])).toBe('No data');
  });

  it('returns "No data" when no finite points', () => {
    expect(
      describeLineZoomChart([
        {
          id: 'a',
          label: 'A',
          data: [{ x: NaN, y: 1 } as { x: number; y: number }],
        },
      ]),
    ).toBe('No data');
  });

  it('summarises with brush-to-zoom hint when zoom is null', () => {
    const out = describeLineZoomChart([
      {
        id: 'a',
        label: 'A',
        data: [
          { x: 0, y: 1 },
          { x: 1, y: 2 },
        ],
      },
    ]);
    expect(out).toContain('brush-to-zoom');
    expect(out).toContain('full range');
  });

  it('includes the zoom range when active', () => {
    const out = describeLineZoomChart(
      [
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: 1 },
            { x: 10, y: 2 },
          ],
        },
      ],
      [],
      { xMin: 2, xMax: 6 },
    );
    expect(out).toContain('zoomed');
    expect(out).toContain('2');
    expect(out).toContain('6');
  });
});

const FIXTURE: ChartLineZoomSeries[] = [
  {
    id: 'a',
    label: 'CPU',
    data: [
      { x: 0, y: 12 },
      { x: 25, y: 32 },
      { x: 50, y: 28 },
      { x: 75, y: 45 },
      { x: 100, y: 30 },
    ],
  },
  {
    id: 'b',
    label: 'Memory',
    data: [
      { x: 0, y: 60 },
      { x: 25, y: 65 },
      { x: 50, y: 70 },
      { x: 75, y: 68 },
      { x: 100, y: 72 },
    ],
  },
];

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
  // setPointerCapture / releasePointerCapture are no-ops in jsdom
  SVGElement.prototype.setPointerCapture = function () {};
  SVGElement.prototype.releasePointerCapture = function () {};
}

describe('chart-line-zoom / <ChartLineZoom>', () => {
  it('renders a root region with the default aria label', () => {
    render(<ChartLineZoom series={FIXTURE} />);
    const root = document.querySelector('[data-section="chart-line-zoom"]')!;
    expect(root.getAttribute('aria-label')).toBe('Zoomable line chart');
  });

  it('exposes series + zoom state as data attrs', () => {
    render(<ChartLineZoom series={FIXTURE} />);
    const root = document.querySelector('[data-section="chart-line-zoom"]')!;
    expect(root.getAttribute('data-series-count')).toBe('2');
    expect(root.getAttribute('data-visible-series-count')).toBe('2');
    expect(root.getAttribute('data-total-points')).toBe('10');
    expect(root.getAttribute('data-zoom-active')).toBe('false');
    expect(root.getAttribute('data-brushing')).toBe('false');
  });

  it('renders an aria description with summary text', () => {
    render(<ChartLineZoom series={FIXTURE} />);
    expect(
      document.querySelector('[data-section="chart-line-zoom-aria-desc"]')
        ?.textContent ?? '',
    ).toContain('brush-to-zoom');
  });

  it('respects a custom aria description', () => {
    render(<ChartLineZoom series={FIXTURE} ariaDescription="custom" />);
    expect(
      document.querySelector('[data-section="chart-line-zoom-aria-desc"]')
        ?.textContent,
    ).toBe('custom');
  });

  it('renders one path per visible series', () => {
    render(<ChartLineZoom series={FIXTURE} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-zoom-path"]')
        .length,
    ).toBe(2);
  });

  it('renders one dot per finite point when showDots=true', () => {
    render(<ChartLineZoom series={FIXTURE} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-zoom-dot"]')
        .length,
    ).toBe(10);
  });

  it('omits dots when showDots=false', () => {
    render(<ChartLineZoom series={FIXTURE} showDots={false} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-zoom-dot"]')
        .length,
    ).toBe(0);
  });

  it('renders an overlay rect for pointer capture', () => {
    render(<ChartLineZoom series={FIXTURE} />);
    expect(
      document.querySelector('[data-section="chart-line-zoom-overlay"]'),
    ).not.toBeNull();
  });

  it('clips series to the inner plot area via clipPath', () => {
    render(<ChartLineZoom series={FIXTURE} />);
    const seriesGroup = document.querySelector(
      '[data-section="chart-line-zoom-series"]',
    )!;
    expect(seriesGroup.getAttribute('clip-path')).toMatch(/^url\(#/);
  });

  it('shows the brush rectangle while dragging', () => {
    mockSvgRect(560, 320);
    render(<ChartLineZoom series={FIXTURE} />);
    const overlay = document.querySelector(
      '[data-section="chart-line-zoom-overlay"]',
    ) as SVGRectElement;
    fireEvent.pointerDown(overlay, { clientX: 100, clientY: 100, button: 0 });
    fireEvent.pointerMove(overlay, { clientX: 300, clientY: 100 });
    const brushRect = document.querySelector(
      '[data-section="chart-line-zoom-brush-rect"]',
    );
    expect(brushRect).not.toBeNull();
    const root = document.querySelector('[data-section="chart-line-zoom"]')!;
    expect(root.getAttribute('data-brushing')).toBe('true');
  });

  it('commits the brush as a zoom range on pointer up', () => {
    mockSvgRect(560, 320);
    render(<ChartLineZoom series={FIXTURE} />);
    const overlay = document.querySelector(
      '[data-section="chart-line-zoom-overlay"]',
    ) as SVGRectElement;
    fireEvent.pointerDown(overlay, { clientX: 100, clientY: 100, button: 0 });
    fireEvent.pointerMove(overlay, { clientX: 300, clientY: 100 });
    fireEvent.pointerUp(overlay, { clientX: 300, clientY: 100 });
    const root = document.querySelector('[data-section="chart-line-zoom"]')!;
    expect(root.getAttribute('data-zoom-active')).toBe('true');
    expect(root.getAttribute('data-brushing')).toBe('false');
    expect(
      document.querySelector('[data-section="chart-line-zoom-brush-rect"]'),
    ).toBeNull();
  });

  it('does not commit a brush narrower than minBrushWidth', () => {
    mockSvgRect(560, 320);
    render(<ChartLineZoom series={FIXTURE} minBrushWidth={20} />);
    const overlay = document.querySelector(
      '[data-section="chart-line-zoom-overlay"]',
    ) as SVGRectElement;
    fireEvent.pointerDown(overlay, { clientX: 100, clientY: 100, button: 0 });
    fireEvent.pointerMove(overlay, { clientX: 105, clientY: 100 });
    fireEvent.pointerUp(overlay, { clientX: 105, clientY: 100 });
    const root = document.querySelector('[data-section="chart-line-zoom"]')!;
    expect(root.getAttribute('data-zoom-active')).toBe('false');
  });

  it('fires onZoomChange with the committed range', () => {
    mockSvgRect(560, 320);
    const handler = vi.fn();
    render(<ChartLineZoom series={FIXTURE} onZoomChange={handler} />);
    const overlay = document.querySelector(
      '[data-section="chart-line-zoom-overlay"]',
    ) as SVGRectElement;
    fireEvent.pointerDown(overlay, { clientX: 100, clientY: 100, button: 0 });
    fireEvent.pointerMove(overlay, { clientX: 300, clientY: 100 });
    fireEvent.pointerUp(overlay, { clientX: 300, clientY: 100 });
    expect(handler).toHaveBeenCalledTimes(1);
    const range = handler.mock.calls[0]![0];
    expect(range).not.toBeNull();
    expect(typeof range!.xMin).toBe('number');
    expect(typeof range!.xMax).toBe('number');
    expect(range!.xMin).toBeLessThan(range!.xMax);
  });

  it('does not mutate zoom when controlled', () => {
    mockSvgRect(560, 320);
    const handler = vi.fn();
    render(
      <ChartLineZoom series={FIXTURE} zoom={null} onZoomChange={handler} />,
    );
    const overlay = document.querySelector(
      '[data-section="chart-line-zoom-overlay"]',
    ) as SVGRectElement;
    fireEvent.pointerDown(overlay, { clientX: 100, clientY: 100, button: 0 });
    fireEvent.pointerMove(overlay, { clientX: 300, clientY: 100 });
    fireEvent.pointerUp(overlay, { clientX: 300, clientY: 100 });
    expect(handler).toHaveBeenCalledTimes(1);
    const root = document.querySelector('[data-section="chart-line-zoom"]')!;
    // Controlled zoom prop stays null so data-zoom-active stays false.
    expect(root.getAttribute('data-zoom-active')).toBe('false');
  });

  it('respects defaultZoom on mount', () => {
    render(
      <ChartLineZoom
        series={FIXTURE}
        defaultZoom={{ xMin: 25, xMax: 75 }}
      />,
    );
    const root = document.querySelector('[data-section="chart-line-zoom"]')!;
    expect(root.getAttribute('data-zoom-active')).toBe('true');
    expect(root.getAttribute('data-zoom-min')).toBe('25');
    expect(root.getAttribute('data-zoom-max')).toBe('75');
  });

  it('renders the reset button when zoomed', () => {
    render(
      <ChartLineZoom
        series={FIXTURE}
        defaultZoom={{ xMin: 25, xMax: 75 }}
      />,
    );
    expect(
      document.querySelector('[data-section="chart-line-zoom-reset"]'),
    ).not.toBeNull();
  });

  it('reset button clears the zoom', () => {
    mockSvgRect(560, 320);
    render(
      <ChartLineZoom
        series={FIXTURE}
        defaultZoom={{ xMin: 25, xMax: 75 }}
      />,
    );
    const btn = document.querySelector(
      '[data-section="chart-line-zoom-reset"]',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    const root = document.querySelector('[data-section="chart-line-zoom"]')!;
    expect(root.getAttribute('data-zoom-active')).toBe('false');
  });

  it('omits the reset button when not zoomed', () => {
    render(<ChartLineZoom series={FIXTURE} />);
    expect(
      document.querySelector('[data-section="chart-line-zoom-reset"]'),
    ).toBeNull();
  });

  it('double-clicking the overlay resets the zoom', () => {
    mockSvgRect(560, 320);
    const handler = vi.fn();
    render(
      <ChartLineZoom
        series={FIXTURE}
        defaultZoom={{ xMin: 25, xMax: 75 }}
        onZoomChange={handler}
      />,
    );
    const overlay = document.querySelector(
      '[data-section="chart-line-zoom-overlay"]',
    ) as SVGRectElement;
    fireEvent.doubleClick(overlay);
    expect(handler).toHaveBeenCalledWith(null);
  });

  it('disables brush when showBrush=false', () => {
    mockSvgRect(560, 320);
    render(<ChartLineZoom series={FIXTURE} showBrush={false} />);
    const overlay = document.querySelector(
      '[data-section="chart-line-zoom-overlay"]',
    ) as SVGRectElement;
    fireEvent.pointerDown(overlay, { clientX: 100, clientY: 100, button: 0 });
    fireEvent.pointerMove(overlay, { clientX: 300, clientY: 100 });
    expect(
      document.querySelector('[data-section="chart-line-zoom-brush-rect"]'),
    ).toBeNull();
  });

  it('hides reset button when showResetButton=false even if zoomed', () => {
    render(
      <ChartLineZoom
        series={FIXTURE}
        defaultZoom={{ xMin: 25, xMax: 75 }}
        showResetButton={false}
      />,
    );
    expect(
      document.querySelector('[data-section="chart-line-zoom-reset"]'),
    ).toBeNull();
  });

  it('cancels brush on pointer cancel', () => {
    mockSvgRect(560, 320);
    render(<ChartLineZoom series={FIXTURE} />);
    const overlay = document.querySelector(
      '[data-section="chart-line-zoom-overlay"]',
    ) as SVGRectElement;
    fireEvent.pointerDown(overlay, { clientX: 100, clientY: 100, button: 0 });
    fireEvent.pointerMove(overlay, { clientX: 300, clientY: 100 });
    fireEvent.pointerCancel(overlay);
    expect(
      document.querySelector('[data-section="chart-line-zoom-brush-rect"]'),
    ).toBeNull();
    const root = document.querySelector('[data-section="chart-line-zoom"]')!;
    expect(root.getAttribute('data-zoom-active')).toBe('false');
  });

  it('renders a legend item per series', () => {
    render(<ChartLineZoom series={FIXTURE} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-zoom-legend-item"]',
      ).length,
    ).toBe(2);
  });

  it('toggles hidden state via legend (uncontrolled)', () => {
    render(<ChartLineZoom series={FIXTURE} />);
    const btn = document.querySelector(
      '[data-section="chart-line-zoom-legend-item"][data-series-id="a"] [data-section="chart-line-zoom-legend-button"]',
    ) as HTMLElement;
    fireEvent.click(btn);
    const item = document.querySelector(
      '[data-section="chart-line-zoom-legend-item"][data-series-id="a"]',
    )!;
    expect(item.getAttribute('data-hidden')).toBe('true');
  });

  it('fires onSeriesToggle with the hidden flag', () => {
    const handler = vi.fn();
    render(<ChartLineZoom series={FIXTURE} onSeriesToggle={handler} />);
    const btn = document.querySelector(
      '[data-section="chart-line-zoom-legend-item"][data-series-id="b"] [data-section="chart-line-zoom-legend-button"]',
    ) as HTMLElement;
    fireEvent.click(btn);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0]!.hidden).toBe(true);
  });

  it('respects defaultHiddenSeries on mount', () => {
    render(<ChartLineZoom series={FIXTURE} defaultHiddenSeries={['a']} />);
    const item = document.querySelector(
      '[data-section="chart-line-zoom-legend-item"][data-series-id="a"]',
    )!;
    expect(item.getAttribute('data-hidden')).toBe('true');
  });

  it('hides axis when showAxis=false', () => {
    render(<ChartLineZoom series={FIXTURE} showAxis={false} />);
    expect(
      document.querySelector('[data-section="chart-line-zoom-axes"]'),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    render(<ChartLineZoom series={FIXTURE} showGrid={false} />);
    expect(
      document.querySelector('[data-section="chart-line-zoom-grid"]'),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    render(<ChartLineZoom series={FIXTURE} showLegend={false} />);
    expect(
      document.querySelector('[data-section="chart-line-zoom-legend"]'),
    ).toBeNull();
  });

  it('applies the animate flag to the data attribute', () => {
    render(<ChartLineZoom series={FIXTURE} animate={false} />);
    const root = document.querySelector('[data-section="chart-line-zoom"]')!;
    expect(root.getAttribute('data-animate')).toBe('false');
  });

  it('renders optional axis labels', () => {
    render(<ChartLineZoom series={FIXTURE} xLabel="t" yLabel="signal" />);
    expect(
      document.querySelector('[data-section="chart-line-zoom-x-label"]')
        ?.textContent,
    ).toBe('t');
    expect(
      document.querySelector('[data-section="chart-line-zoom-y-label"]')
        ?.textContent,
    ).toBe('signal');
  });

  it('uses formatValue / formatX for axis ticks', () => {
    render(
      <ChartLineZoom
        series={FIXTURE}
        formatValue={(n) => `y${n}`}
        formatX={(n) => `x${n}`}
      />,
    );
    const xLabel = document.querySelector(
      '[data-section="chart-line-zoom-tick-label"][data-axis="x"]',
    );
    const yLabel = document.querySelector(
      '[data-section="chart-line-zoom-tick-label"][data-axis="y"]',
    );
    expect(xLabel?.textContent?.startsWith('x')).toBe(true);
    expect(yLabel?.textContent?.startsWith('y')).toBe(true);
  });

  it('renders empty state when no series', () => {
    render(<ChartLineZoom series={[]} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-zoom-path"]')
        .length,
    ).toBe(0);
    expect(
      document.querySelector('[data-section="chart-line-zoom-aria-desc"]')
        ?.textContent,
    ).toBe('No data');
  });

  it('shifts the rendered range when zoomed in', () => {
    const { rerender } = render(<ChartLineZoom series={FIXTURE} />);
    const fullXTicks = document.querySelectorAll(
      '[data-section="chart-line-zoom-tick-label"][data-axis="x"]',
    );
    const fullXMax = fullXTicks[fullXTicks.length - 1]!.getAttribute(
      'data-tick-value',
    );
    rerender(
      <ChartLineZoom series={FIXTURE} zoom={{ xMin: 25, xMax: 75 }} />,
    );
    const zoomedXTicks = document.querySelectorAll(
      '[data-section="chart-line-zoom-tick-label"][data-axis="x"]',
    );
    const zoomedXMax = zoomedXTicks[zoomedXTicks.length - 1]!.getAttribute(
      'data-tick-value',
    );
    expect(zoomedXMax).not.toBe(fullXMax);
    expect(Number(zoomedXMax)).toBeLessThan(Number(fullXMax));
  });
});
