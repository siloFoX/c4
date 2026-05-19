import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

import {
  ChartLineSmooth,
  DEFAULT_CHART_LINE_SMOOTH_WIDTH,
  DEFAULT_CHART_LINE_SMOOTH_HEIGHT,
  DEFAULT_CHART_LINE_SMOOTH_PADDING,
  DEFAULT_CHART_LINE_SMOOTH_TICK_COUNT,
  DEFAULT_CHART_LINE_SMOOTH_STROKE_WIDTH,
  DEFAULT_CHART_LINE_SMOOTH_DOT_RADIUS,
  DEFAULT_CHART_LINE_SMOOTH_LINE_OPACITY,
  DEFAULT_CHART_LINE_SMOOTH_TENSION,
  DEFAULT_CHART_LINE_SMOOTH_CURVE,
  DEFAULT_CHART_LINE_SMOOTH_GRID_COLOR,
  DEFAULT_CHART_LINE_SMOOTH_AXIS_COLOR,
  DEFAULT_CHART_LINE_SMOOTH_PALETTE,
  buildCatmullRomPath,
  buildMonotonePath,
  buildSmoothLinePath,
  computeLineSmoothLayout,
  describeLineSmoothChart,
  getLineSmoothBounds,
  getLineSmoothDefaultColor,
  getLineSmoothFinitePoints,
  getLineSmoothTicks,
  type ChartLineSmoothSeries,
} from './chart-line-smooth';

afterEach(() => {
  cleanup();
});

describe('chart-line-smooth / constants', () => {
  it('exports sensible defaults', () => {
    expect(DEFAULT_CHART_LINE_SMOOTH_WIDTH).toBe(560);
    expect(DEFAULT_CHART_LINE_SMOOTH_HEIGHT).toBe(320);
    expect(DEFAULT_CHART_LINE_SMOOTH_PADDING).toBe(40);
    expect(DEFAULT_CHART_LINE_SMOOTH_TICK_COUNT).toBe(5);
    expect(DEFAULT_CHART_LINE_SMOOTH_STROKE_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_SMOOTH_DOT_RADIUS).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_SMOOTH_LINE_OPACITY).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_SMOOTH_TENSION).toBe(0.5);
    expect(DEFAULT_CHART_LINE_SMOOTH_CURVE).toBe('catmullRom');
    expect(DEFAULT_CHART_LINE_SMOOTH_GRID_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_LINE_SMOOTH_AXIS_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_LINE_SMOOTH_PALETTE).toHaveLength(10);
  });
});

describe('chart-line-smooth / getLineSmoothDefaultColor', () => {
  it('wraps with modulo', () => {
    expect(getLineSmoothDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_SMOOTH_PALETTE[0],
    );
    expect(getLineSmoothDefaultColor(10)).toBe(
      DEFAULT_CHART_LINE_SMOOTH_PALETTE[0],
    );
  });

  it('falls back to first colour for invalid indices', () => {
    expect(getLineSmoothDefaultColor(-1)).toBe(
      DEFAULT_CHART_LINE_SMOOTH_PALETTE[0],
    );
    expect(getLineSmoothDefaultColor(NaN)).toBe(
      DEFAULT_CHART_LINE_SMOOTH_PALETTE[0],
    );
  });
});

describe('chart-line-smooth / getLineSmoothFinitePoints', () => {
  it('drops points with non-finite x or y', () => {
    const out = getLineSmoothFinitePoints([
      { x: 1, y: 1 },
      { x: NaN, y: 2 },
      { x: 3, y: Infinity },
      { x: 4, y: 4 },
    ]);
    expect(out).toEqual([
      { x: 1, y: 1 },
      { x: 4, y: 4 },
    ]);
  });

  it('returns [] for non-array input', () => {
    expect(getLineSmoothFinitePoints(null as unknown as never[])).toEqual([]);
  });
});

describe('chart-line-smooth / getLineSmoothBounds', () => {
  it('returns unit square for empty input', () => {
    expect(getLineSmoothBounds([])).toEqual({
      xMin: 0,
      xMax: 1,
      yMin: 0,
      yMax: 1,
    });
  });

  it('spans all visible series', () => {
    expect(
      getLineSmoothBounds([
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 1, y: 10 },
            { x: 2, y: 20 },
          ],
        },
        {
          id: 'b',
          label: 'B',
          data: [
            { x: 0, y: 5 },
            { x: 3, y: 25 },
          ],
        },
      ]),
    ).toEqual({ xMin: 0, xMax: 3, yMin: 5, yMax: 25 });
  });

  it('expands +/- 0.5 when each axis is collapsed', () => {
    expect(
      getLineSmoothBounds([
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 5, y: 5 },
            { x: 5, y: 5 },
          ],
        },
      ]),
    ).toEqual({ xMin: 4.5, xMax: 5.5, yMin: 4.5, yMax: 5.5 });
  });

  it('excludes hidden series', () => {
    expect(
      getLineSmoothBounds(
        [
          { id: 'a', label: 'A', data: [{ x: 1, y: 1 }] },
          { id: 'b', label: 'B', data: [{ x: 100, y: 100 }] },
        ],
        ['b'],
      ),
    ).toEqual({ xMin: 0.5, xMax: 1.5, yMin: 0.5, yMax: 1.5 });
  });
});

describe('chart-line-smooth / getLineSmoothTicks', () => {
  it('returns evenly-spaced ticks', () => {
    const ticks = getLineSmoothTicks(0, 10, 5);
    expect(ticks).toHaveLength(5);
    expect(ticks[0]!.value).toBe(0);
    expect(ticks[4]!.value).toBe(10);
  });

  it('returns single tick for collapsed range', () => {
    expect(getLineSmoothTicks(5, 5, 4)).toEqual([{ value: 5, position: 0 }]);
  });

  it('returns [] for invalid range', () => {
    expect(getLineSmoothTicks(10, 5, 4)).toEqual([]);
  });
});

describe('chart-line-smooth / buildCatmullRomPath', () => {
  it('returns "" for empty input', () => {
    expect(buildCatmullRomPath([])).toBe('');
  });

  it('returns M-only for single point', () => {
    expect(buildCatmullRomPath([{ x: 5, y: 10 }])).toBe('M 5.000 10.000');
  });

  it('emits one C command for two points', () => {
    const out = buildCatmullRomPath(
      [
        { x: 0, y: 0 },
        { x: 10, y: 5 },
      ],
      0.5,
    );
    expect(out.startsWith('M 0.000 0.000')).toBe(true);
    expect(out).toContain('C ');
    expect((out.match(/C /g) ?? []).length).toBe(1);
  });

  it('emits N-1 C commands for N points', () => {
    const out = buildCatmullRomPath(
      [
        { x: 0, y: 0 },
        { x: 10, y: 5 },
        { x: 20, y: 0 },
        { x: 30, y: 10 },
      ],
      0.5,
    );
    expect((out.match(/C /g) ?? []).length).toBe(3);
  });

  it('collapses to straight lines when tension=0', () => {
    const out = buildCatmullRomPath(
      [
        { x: 0, y: 0 },
        { x: 10, y: 5 },
      ],
      0,
    );
    // With tension=0, CP1 = P0, CP2 = P1, so curve is a straight line
    expect(out).toContain('C 0.000 0.000 10.000 5.000 10.000 5.000');
  });

  it('clamps tension to [0, 1]', () => {
    const a = buildCatmullRomPath(
      [
        { x: 0, y: 0 },
        { x: 10, y: 5 },
        { x: 20, y: 0 },
      ],
      2,
    );
    const b = buildCatmullRomPath(
      [
        { x: 0, y: 0 },
        { x: 10, y: 5 },
        { x: 20, y: 0 },
      ],
      1,
    );
    expect(a).toBe(b);
  });
});

describe('chart-line-smooth / buildMonotonePath', () => {
  it('returns "" for empty input', () => {
    expect(buildMonotonePath([])).toBe('');
  });

  it('returns M-only for single point', () => {
    expect(buildMonotonePath([{ x: 5, y: 10 }])).toBe('M 5.000 10.000');
  });

  it('emits N-1 C commands', () => {
    const out = buildMonotonePath([
      { x: 0, y: 0 },
      { x: 10, y: 5 },
      { x: 20, y: 8 },
    ]);
    expect((out.match(/C /g) ?? []).length).toBe(2);
  });

  it('produces a finite, parseable path for monotonic ascending data', () => {
    const out = buildMonotonePath([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 4 },
      { x: 3, y: 9 },
      { x: 4, y: 16 },
    ]);
    expect(out.startsWith('M ')).toBe(true);
    expect(out).not.toContain('NaN');
    expect(out).not.toContain('Infinity');
  });

  it('handles flat segments without dividing by zero', () => {
    const out = buildMonotonePath([
      { x: 0, y: 5 },
      { x: 1, y: 5 },
      { x: 2, y: 5 },
    ]);
    expect(out).not.toContain('NaN');
  });

  it('handles vertical segments (dx=0) without dividing by zero', () => {
    const out = buildMonotonePath([
      { x: 1, y: 0 },
      { x: 1, y: 5 },
      { x: 2, y: 10 },
    ]);
    expect(out).not.toContain('NaN');
  });
});

describe('chart-line-smooth / buildSmoothLinePath', () => {
  it('dispatches to catmullRom by default', () => {
    const cr = buildCatmullRomPath(
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      0.5,
    );
    const out = buildSmoothLinePath(
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      'catmullRom',
      0.5,
    );
    expect(out).toBe(cr);
  });

  it('dispatches to monotone when requested', () => {
    const m = buildMonotonePath([
      { x: 0, y: 0 },
      { x: 1, y: 2 },
      { x: 2, y: 4 },
    ]);
    const out = buildSmoothLinePath(
      [
        { x: 0, y: 0 },
        { x: 1, y: 2 },
        { x: 2, y: 4 },
      ],
      'monotone',
    );
    expect(out).toBe(m);
  });
});

describe('chart-line-smooth / computeLineSmoothLayout', () => {
  it('returns empty when canvas is degenerate', () => {
    expect(
      computeLineSmoothLayout({
        series: [{ id: 'a', label: 'A', data: [{ x: 1, y: 1 }] }],
        width: 10,
        height: 10,
        padding: 100,
      }).series,
    ).toEqual([]);
  });

  it('returns empty when no series', () => {
    expect(
      computeLineSmoothLayout({
        series: [],
        width: 500,
        height: 200,
        padding: 20,
      }).series,
    ).toEqual([]);
  });

  it('returns empty when every series is hidden', () => {
    expect(
      computeLineSmoothLayout({
        series: [{ id: 'a', label: 'A', data: [{ x: 1, y: 1 }] }],
        hidden: ['a'],
        width: 500,
        height: 200,
        padding: 20,
      }).series,
    ).toEqual([]);
  });

  it('maps x and y to pixel coordinates', () => {
    const out = computeLineSmoothLayout({
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
    const out = computeLineSmoothLayout({
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

  it('clamps tension to [0, 1] and records it on the layout', () => {
    const a = computeLineSmoothLayout({
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
      tension: 1.5,
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(a.tension).toBe(1);
    const b = computeLineSmoothLayout({
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
      tension: -1,
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(b.tension).toBe(0);
  });

  it('produces a per-series Bezier path', () => {
    const out = computeLineSmoothLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: 0 },
            { x: 10, y: 5 },
            { x: 20, y: 0 },
          ],
        },
      ],
      curve: 'catmullRom',
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.series[0]!.path.startsWith('M ')).toBe(true);
    expect(out.series[0]!.path).toContain('C ');
  });

  it('paths differ between catmullRom and monotone', () => {
    const make = (c: 'catmullRom' | 'monotone') =>
      computeLineSmoothLayout({
        series: [
          {
            id: 'a',
            label: 'A',
            data: [
              { x: 0, y: 0 },
              { x: 10, y: 5 },
              { x: 20, y: 8 },
              { x: 30, y: 2 },
            ],
          },
        ],
        curve: c,
        width: 500,
        height: 200,
        padding: 40,
      }).series[0]!.path;
    expect(make('catmullRom')).not.toBe(make('monotone'));
  });

  it('records series index across hidden-series filter', () => {
    const out = computeLineSmoothLayout({
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
    const out = computeLineSmoothLayout({
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
    for (const t of out.yTicks) {
      expect(t.position).toBeGreaterThanOrEqual(40 - 1e-6);
      expect(t.position).toBeLessThanOrEqual(300 - 40 + 1e-6);
    }
  });
});

describe('chart-line-smooth / describeLineSmoothChart', () => {
  it('returns "No data" when empty', () => {
    expect(describeLineSmoothChart([])).toBe('No data');
  });

  it('returns "No data" when no finite points', () => {
    expect(
      describeLineSmoothChart([
        {
          id: 'a',
          label: 'A',
          data: [{ x: NaN, y: 1 } as { x: number; y: number }],
        },
      ]),
    ).toBe('No data');
  });

  it('summarises with curve, series count, total points, and ranges', () => {
    const out = describeLineSmoothChart(
      [
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
      ],
      [],
      'monotone',
    );
    expect(out).toContain('monotone');
    expect(out).toContain('2 series');
    expect(out).toContain('4 points');
  });

  it('excludes hidden series from the summary', () => {
    const out = describeLineSmoothChart(
      [
        { id: 'a', label: 'A', data: [{ x: 0, y: 1 }] },
        { id: 'b', label: 'B', data: [{ x: 0, y: 100 }] },
      ],
      ['b'],
    );
    expect(out).toContain('1 series');
    expect(out).toContain('1 points');
  });
});

const FIXTURE: ChartLineSmoothSeries[] = [
  {
    id: 'a',
    label: 'Series A',
    data: [
      { x: 0, y: 1 },
      { x: 1, y: 3 },
      { x: 2, y: 2 },
      { x: 3, y: 5 },
    ],
  },
  {
    id: 'b',
    label: 'Series B',
    data: [
      { x: 0, y: 5 },
      { x: 1, y: 4 },
      { x: 2, y: 6 },
      { x: 3, y: 3 },
    ],
  },
];

describe('chart-line-smooth / <ChartLineSmooth>', () => {
  it('renders a root region with the default aria label', () => {
    render(<ChartLineSmooth series={FIXTURE} />);
    const root = document.querySelector(
      '[data-section="chart-line-smooth"]',
    )!;
    expect(root.getAttribute('aria-label')).toBe('Smooth line chart');
  });

  it('exposes curve + tension + counts as data attrs', () => {
    render(<ChartLineSmooth series={FIXTURE} curve="monotone" tension={0.8} />);
    const root = document.querySelector(
      '[data-section="chart-line-smooth"]',
    )!;
    expect(root.getAttribute('data-curve')).toBe('monotone');
    expect(root.getAttribute('data-tension')).toBe('0.8');
    expect(root.getAttribute('data-series-count')).toBe('2');
    expect(root.getAttribute('data-total-points')).toBe('8');
  });

  it('renders an aria description with summary text', () => {
    render(<ChartLineSmooth series={FIXTURE} />);
    const desc = document.querySelector(
      '[data-section="chart-line-smooth-aria-desc"]',
    );
    expect(desc?.textContent ?? '').toContain('catmullRom');
    expect(desc?.textContent ?? '').toContain('2 series');
  });

  it('respects a custom aria description', () => {
    render(<ChartLineSmooth series={FIXTURE} ariaDescription="custom" />);
    expect(
      document.querySelector('[data-section="chart-line-smooth-aria-desc"]')
        ?.textContent,
    ).toBe('custom');
  });

  it('renders one path per series', () => {
    render(<ChartLineSmooth series={FIXTURE} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-smooth-path"]')
        .length,
    ).toBe(2);
  });

  it('renders one dot per finite point when showDots=true', () => {
    render(<ChartLineSmooth series={FIXTURE} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-smooth-dot"]')
        .length,
    ).toBe(8);
  });

  it('omits dots when showDots=false', () => {
    render(<ChartLineSmooth series={FIXTURE} showDots={false} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-smooth-dot"]')
        .length,
    ).toBe(0);
  });

  it('renders a legend item per series', () => {
    render(<ChartLineSmooth series={FIXTURE} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-smooth-legend-item"]',
      ).length,
    ).toBe(2);
  });

  it('toggles hidden state via legend (uncontrolled)', () => {
    render(<ChartLineSmooth series={FIXTURE} />);
    const btn = document.querySelector(
      '[data-section="chart-line-smooth-legend-item"][data-series-id="a"] [data-section="chart-line-smooth-legend-button"]',
    ) as HTMLElement;
    fireEvent.click(btn);
    const item = document.querySelector(
      '[data-section="chart-line-smooth-legend-item"][data-series-id="a"]',
    )!;
    expect(item.getAttribute('data-hidden')).toBe('true');
  });

  it('does not mutate hiddenSeries when controlled', () => {
    const handler = vi.fn();
    render(
      <ChartLineSmooth
        series={FIXTURE}
        hiddenSeries={[]}
        onHiddenSeriesChange={handler}
      />,
    );
    const btn = document.querySelector(
      '[data-section="chart-line-smooth-legend-item"][data-series-id="a"] [data-section="chart-line-smooth-legend-button"]',
    ) as HTMLElement;
    fireEvent.click(btn);
    expect(handler).toHaveBeenCalledWith(['a']);
  });

  it('fires onSeriesToggle with the hidden flag', () => {
    const handler = vi.fn();
    render(<ChartLineSmooth series={FIXTURE} onSeriesToggle={handler} />);
    const btn = document.querySelector(
      '[data-section="chart-line-smooth-legend-item"][data-series-id="b"] [data-section="chart-line-smooth-legend-button"]',
    ) as HTMLElement;
    fireEvent.click(btn);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0]!.hidden).toBe(true);
  });

  it('respects defaultHiddenSeries on mount', () => {
    render(
      <ChartLineSmooth series={FIXTURE} defaultHiddenSeries={['a']} />,
    );
    const item = document.querySelector(
      '[data-section="chart-line-smooth-legend-item"][data-series-id="a"]',
    )!;
    expect(item.getAttribute('data-hidden')).toBe('true');
  });

  it('shows tooltip on dot hover', () => {
    render(<ChartLineSmooth series={FIXTURE} />);
    const dot = document.querySelectorAll(
      '[data-section="chart-line-smooth-dot"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(dot);
    const tip = document.querySelector(
      '[data-section="chart-line-smooth-tooltip"]',
    );
    expect(tip).not.toBeNull();
    expect(tip!.textContent).toContain('Series A');
  });

  it('hides tooltip on mouse leave', () => {
    render(<ChartLineSmooth series={FIXTURE} />);
    const dot = document.querySelectorAll(
      '[data-section="chart-line-smooth-dot"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(dot);
    fireEvent.mouseLeave(dot);
    expect(
      document.querySelector('[data-section="chart-line-smooth-tooltip"]'),
    ).toBeNull();
  });

  it('fires onPointClick with series + point', () => {
    const handler = vi.fn();
    render(<ChartLineSmooth series={FIXTURE} onPointClick={handler} />);
    const dot = document.querySelectorAll(
      '[data-section="chart-line-smooth-dot"]',
    )[0] as SVGElement;
    fireEvent.click(dot);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0]!.series.id).toBe('a');
  });

  it('hides axis when showAxis=false', () => {
    render(<ChartLineSmooth series={FIXTURE} showAxis={false} />);
    expect(
      document.querySelector('[data-section="chart-line-smooth-axes"]'),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    render(<ChartLineSmooth series={FIXTURE} showGrid={false} />);
    expect(
      document.querySelector('[data-section="chart-line-smooth-grid"]'),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    render(<ChartLineSmooth series={FIXTURE} showLegend={false} />);
    expect(
      document.querySelector('[data-section="chart-line-smooth-legend"]'),
    ).toBeNull();
  });

  it('hides tooltip when showTooltip=false', () => {
    render(<ChartLineSmooth series={FIXTURE} showTooltip={false} />);
    const dot = document.querySelectorAll(
      '[data-section="chart-line-smooth-dot"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(dot);
    expect(
      document.querySelector('[data-section="chart-line-smooth-tooltip"]'),
    ).toBeNull();
  });

  it('applies the animate flag to the data attribute', () => {
    render(<ChartLineSmooth series={FIXTURE} animate={false} />);
    const root = document.querySelector(
      '[data-section="chart-line-smooth"]',
    )!;
    expect(root.getAttribute('data-animate')).toBe('false');
  });

  it('renders optional axis labels', () => {
    render(<ChartLineSmooth series={FIXTURE} xLabel="t" yLabel="signal" />);
    expect(
      document.querySelector('[data-section="chart-line-smooth-x-label"]')
        ?.textContent,
    ).toBe('t');
    expect(
      document.querySelector('[data-section="chart-line-smooth-y-label"]')
        ?.textContent,
    ).toBe('signal');
  });

  it('uses formatValue / formatX for axis ticks', () => {
    render(
      <ChartLineSmooth
        series={FIXTURE}
        formatValue={(n) => `y${n}`}
        formatX={(n) => `x${n}`}
      />,
    );
    const xLabel = document.querySelector(
      '[data-section="chart-line-smooth-tick-label"][data-axis="x"]',
    );
    const yLabel = document.querySelector(
      '[data-section="chart-line-smooth-tick-label"][data-axis="y"]',
    );
    expect(xLabel?.textContent?.startsWith('x')).toBe(true);
    expect(yLabel?.textContent?.startsWith('y')).toBe(true);
  });

  it('overrides default colour via series.color', () => {
    render(
      <ChartLineSmooth
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
      '[data-section="chart-line-smooth-series-group"]',
    )!;
    expect(grp.getAttribute('data-series-color')).toBe('#abcdef');
  });

  it('exposes dot data attrs', () => {
    render(<ChartLineSmooth series={FIXTURE} />);
    const dot = document.querySelectorAll(
      '[data-section="chart-line-smooth-dot"]',
    )[0] as SVGElement;
    expect(dot.getAttribute('data-x')).toBe('0');
    expect(dot.getAttribute('data-y')).toBe('1');
    expect(dot.getAttribute('data-series-id')).toBe('a');
  });

  it('renders empty state when no series', () => {
    render(<ChartLineSmooth series={[]} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-smooth-path"]')
        .length,
    ).toBe(0);
    expect(
      document.querySelector('[data-section="chart-line-smooth-aria-desc"]')
        ?.textContent,
    ).toBe('No data');
  });

  it('keyboard focus on a dot opens the tooltip', () => {
    render(<ChartLineSmooth series={FIXTURE} />);
    const dot = document.querySelectorAll(
      '[data-section="chart-line-smooth-dot"]',
    )[0] as SVGElement;
    fireEvent.focus(dot);
    expect(
      document.querySelector('[data-section="chart-line-smooth-tooltip"]'),
    ).not.toBeNull();
  });

  it('sets data-hovered on the hovered dot and parent series group', () => {
    render(<ChartLineSmooth series={FIXTURE} />);
    const dot = document.querySelectorAll(
      '[data-section="chart-line-smooth-dot"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(dot);
    expect(dot.getAttribute('data-hovered')).toBe('true');
    const grp = document.querySelector(
      '[data-section="chart-line-smooth-series-group"][data-series-id="a"]',
    )!;
    expect(grp.getAttribute('data-hovered')).toBe('true');
  });

  it('renders grid lines per tick when showGrid=true', () => {
    render(<ChartLineSmooth series={FIXTURE} tickCount={4} />);
    const lines = document.querySelectorAll(
      '[data-section="chart-line-smooth-grid-line"]',
    );
    expect(lines.length).toBeGreaterThan(0);
  });

  it('renders distinct paths for catmullRom vs monotone', () => {
    const fixture: ChartLineSmoothSeries[] = [
      {
        id: 'a',
        label: 'A',
        data: [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
          { x: 2, y: 4 },
          { x: 3, y: 9 },
        ],
      },
    ];
    const renderAndGetPath = (curve: 'catmullRom' | 'monotone') => {
      const { container, unmount } = render(
        <ChartLineSmooth series={fixture} curve={curve} />,
      );
      const path = container.querySelector(
        '[data-section="chart-line-smooth-path"]',
      ) as SVGPathElement;
      const d = path.getAttribute('d') ?? '';
      unmount();
      return d;
    };
    expect(renderAndGetPath('catmullRom')).not.toBe(
      renderAndGetPath('monotone'),
    );
  });
});
