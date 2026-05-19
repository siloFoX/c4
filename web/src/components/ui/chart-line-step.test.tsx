import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

import {
  ChartLineStep,
  DEFAULT_CHART_LINE_STEP_WIDTH,
  DEFAULT_CHART_LINE_STEP_HEIGHT,
  DEFAULT_CHART_LINE_STEP_PADDING,
  DEFAULT_CHART_LINE_STEP_TICK_COUNT,
  DEFAULT_CHART_LINE_STEP_STROKE_WIDTH,
  DEFAULT_CHART_LINE_STEP_DOT_RADIUS,
  DEFAULT_CHART_LINE_STEP_LINE_OPACITY,
  DEFAULT_CHART_LINE_STEP_GRID_COLOR,
  DEFAULT_CHART_LINE_STEP_AXIS_COLOR,
  DEFAULT_CHART_LINE_STEP_TYPE,
  DEFAULT_CHART_LINE_STEP_PALETTE,
  buildStepLinePath,
  computeLineStepLayout,
  describeLineStepChart,
  getLineStepBounds,
  getLineStepDefaultColor,
  getLineStepFinitePoints,
  getLineStepTicks,
  type ChartLineStepSeries,
} from './chart-line-step';

afterEach(() => {
  cleanup();
});

describe('chart-line-step / constants', () => {
  it('exports sensible defaults', () => {
    expect(DEFAULT_CHART_LINE_STEP_WIDTH).toBe(560);
    expect(DEFAULT_CHART_LINE_STEP_HEIGHT).toBe(320);
    expect(DEFAULT_CHART_LINE_STEP_PADDING).toBe(40);
    expect(DEFAULT_CHART_LINE_STEP_TICK_COUNT).toBe(5);
    expect(DEFAULT_CHART_LINE_STEP_STROKE_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_STEP_DOT_RADIUS).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_STEP_LINE_OPACITY).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_STEP_GRID_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_LINE_STEP_AXIS_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_LINE_STEP_TYPE).toBe('after');
    expect(DEFAULT_CHART_LINE_STEP_PALETTE).toHaveLength(10);
  });
});

describe('chart-line-step / getLineStepDefaultColor', () => {
  it('wraps with modulo', () => {
    expect(getLineStepDefaultColor(0)).toBe(DEFAULT_CHART_LINE_STEP_PALETTE[0]);
    expect(getLineStepDefaultColor(10)).toBe(DEFAULT_CHART_LINE_STEP_PALETTE[0]);
  });

  it('falls back to first colour for invalid indices', () => {
    expect(getLineStepDefaultColor(-1)).toBe(
      DEFAULT_CHART_LINE_STEP_PALETTE[0],
    );
    expect(getLineStepDefaultColor(NaN)).toBe(
      DEFAULT_CHART_LINE_STEP_PALETTE[0],
    );
  });
});

describe('chart-line-step / getLineStepFinitePoints', () => {
  it('drops points with non-finite x or y', () => {
    const out = getLineStepFinitePoints([
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
    expect(getLineStepFinitePoints(null as unknown as never[])).toEqual([]);
  });
});

describe('chart-line-step / getLineStepBounds', () => {
  it('returns unit square for empty input', () => {
    expect(getLineStepBounds([])).toEqual({
      xMin: 0,
      xMax: 1,
      yMin: 0,
      yMax: 1,
    });
  });

  it('spans all visible series', () => {
    expect(
      getLineStepBounds([
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
    const out = getLineStepBounds([
      {
        id: 'a',
        label: 'A',
        data: [
          { x: 5, y: 5 },
          { x: 5, y: 5 },
        ],
      },
    ]);
    expect(out).toEqual({ xMin: 4.5, xMax: 5.5, yMin: 4.5, yMax: 5.5 });
  });

  it('excludes hidden series', () => {
    expect(
      getLineStepBounds(
        [
          { id: 'a', label: 'A', data: [{ x: 1, y: 1 }] },
          { id: 'b', label: 'B', data: [{ x: 100, y: 100 }] },
        ],
        ['b'],
      ),
    ).toEqual({ xMin: 0.5, xMax: 1.5, yMin: 0.5, yMax: 1.5 });
  });
});

describe('chart-line-step / getLineStepTicks', () => {
  it('returns evenly-spaced ticks', () => {
    const ticks = getLineStepTicks(0, 10, 5);
    expect(ticks).toHaveLength(5);
    expect(ticks[0]!.value).toBe(0);
    expect(ticks[4]!.value).toBe(10);
  });

  it('returns single tick for collapsed range', () => {
    expect(getLineStepTicks(5, 5, 4)).toEqual([{ value: 5, position: 0 }]);
  });

  it('returns [] for invalid range', () => {
    expect(getLineStepTicks(10, 5, 4)).toEqual([]);
    expect(getLineStepTicks(NaN, 1, 4)).toEqual([]);
  });
});

describe('chart-line-step / buildStepLinePath', () => {
  it('returns "" for empty input', () => {
    expect(buildStepLinePath([], 'after')).toBe('');
  });

  it('returns M-only for single point', () => {
    expect(buildStepLinePath([{ x: 10, y: 20 }], 'after')).toBe('M 10.000 20.000');
  });

  it('emits H then V for "after" step', () => {
    const out = buildStepLinePath(
      [
        { x: 0, y: 0 },
        { x: 10, y: 5 },
        { x: 20, y: 3 },
      ],
      'after',
    );
    expect(out.startsWith('M 0.000 0.000')).toBe(true);
    expect(out).toContain('H 10.000 V 5.000');
    expect(out).toContain('H 20.000 V 3.000');
    const hIdx = out.indexOf('H 10.000');
    const vIdx = out.indexOf('V 5.000');
    expect(hIdx).toBeLessThan(vIdx);
  });

  it('emits V then H for "before" step', () => {
    const out = buildStepLinePath(
      [
        { x: 0, y: 0 },
        { x: 10, y: 5 },
      ],
      'before',
    );
    expect(out).toContain('V 5.000 H 10.000');
    const vIdx = out.indexOf('V 5.000');
    const hIdx = out.indexOf('H 10.000');
    expect(vIdx).toBeLessThan(hIdx);
  });

  it('emits H-V-H around the midpoint for "center" step', () => {
    const out = buildStepLinePath(
      [
        { x: 0, y: 0 },
        { x: 10, y: 5 },
      ],
      'center',
    );
    expect(out).toContain('H 5.000');
    expect(out).toContain('V 5.000');
    expect(out).toContain('H 10.000');
    const h1 = out.indexOf('H 5.000');
    const v = out.indexOf('V 5.000');
    const h2 = out.indexOf('H 10.000');
    expect(h1).toBeLessThan(v);
    expect(v).toBeLessThan(h2);
  });

  it('handles multiple segments per step type', () => {
    const out = buildStepLinePath(
      [
        { x: 0, y: 0 },
        { x: 10, y: 5 },
        { x: 20, y: 10 },
        { x: 30, y: 0 },
      ],
      'after',
    );
    const hOccurrences = (out.match(/H /g) ?? []).length;
    const vOccurrences = (out.match(/V /g) ?? []).length;
    expect(hOccurrences).toBe(3);
    expect(vOccurrences).toBe(3);
  });
});

describe('chart-line-step / computeLineStepLayout', () => {
  it('returns empty when canvas is degenerate', () => {
    expect(
      computeLineStepLayout({
        series: [{ id: 'a', label: 'A', data: [{ x: 1, y: 1 }] }],
        width: 10,
        height: 10,
        padding: 100,
      }).series,
    ).toEqual([]);
  });

  it('returns empty when no series', () => {
    expect(
      computeLineStepLayout({
        series: [],
        width: 500,
        height: 200,
        padding: 20,
      }).series,
    ).toEqual([]);
  });

  it('returns empty when every series is hidden', () => {
    expect(
      computeLineStepLayout({
        series: [{ id: 'a', label: 'A', data: [{ x: 1, y: 1 }] }],
        hidden: ['a'],
        width: 500,
        height: 200,
        padding: 20,
      }).series,
    ).toEqual([]);
  });

  it('maps x and y to pixel coordinates', () => {
    const out = computeLineStepLayout({
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
    const out = computeLineStepLayout({
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

  it('builds a per-series step path', () => {
    const out = computeLineStepLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: 0 },
            { x: 10, y: 5 },
          ],
        },
      ],
      stepType: 'after',
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.series[0]!.path.startsWith('M ')).toBe(true);
    expect(out.series[0]!.path).toContain('H ');
    expect(out.series[0]!.path).toContain('V ');
  });

  it('paths differ across step types', () => {
    const make = (st: 'before' | 'after' | 'center') =>
      computeLineStepLayout({
        series: [
          {
            id: 'a',
            label: 'A',
            data: [
              { x: 0, y: 0 },
              { x: 10, y: 5 },
            ],
          },
        ],
        stepType: st,
        width: 500,
        height: 200,
        padding: 40,
      }).series[0]!.path;
    const a = make('after');
    const b = make('before');
    const c = make('center');
    expect(a).not.toBe(b);
    expect(b).not.toBe(c);
    expect(a).not.toBe(c);
  });

  it('produces tick positions inside the canvas', () => {
    const out = computeLineStepLayout({
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

  it('records series index across hidden-series filter', () => {
    const out = computeLineStepLayout({
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

describe('chart-line-step / describeLineStepChart', () => {
  it('returns "No data" when empty', () => {
    expect(describeLineStepChart([])).toBe('No data');
  });

  it('returns "No data" when no finite points', () => {
    expect(
      describeLineStepChart([
        {
          id: 'a',
          label: 'A',
          data: [{ x: NaN, y: 1 } as { x: number; y: number }],
        },
      ]),
    ).toBe('No data');
  });

  it('summarises with step type, series count, total points, and ranges', () => {
    const out = describeLineStepChart(
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
      'before',
    );
    expect(out).toContain('before');
    expect(out).toContain('2 series');
    expect(out).toContain('4 points');
  });

  it('excludes hidden series from the summary', () => {
    const out = describeLineStepChart(
      [
        { id: 'a', label: 'A', data: [{ x: 0, y: 1 }] },
        { id: 'b', label: 'B', data: [{ x: 0, y: 100 }] },
      ],
      ['b'],
    );
    expect(out).toContain('1 series');
    expect(out).toContain('1 points');
  });

  it('uses custom formatter', () => {
    const out = describeLineStepChart(
      [
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: 1 },
            { x: 1, y: 2 },
          ],
        },
      ],
      [],
      'after',
      (n) => `v${n}`,
    );
    expect(out).toContain('v0');
    expect(out).toContain('v2');
  });
});

const FIXTURE: ChartLineStepSeries[] = [
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

describe('chart-line-step / <ChartLineStep>', () => {
  it('renders a root region with the default aria label', () => {
    render(<ChartLineStep series={FIXTURE} />);
    const root = document.querySelector('[data-section="chart-line-step"]')!;
    expect(root.getAttribute('aria-label')).toBe('Step line chart');
  });

  it('exposes stepType + counts as data attrs', () => {
    render(<ChartLineStep series={FIXTURE} stepType="center" />);
    const root = document.querySelector('[data-section="chart-line-step"]')!;
    expect(root.getAttribute('data-step-type')).toBe('center');
    expect(root.getAttribute('data-series-count')).toBe('2');
    expect(root.getAttribute('data-visible-series-count')).toBe('2');
    expect(root.getAttribute('data-total-points')).toBe('8');
  });

  it('renders an aria description with summary text', () => {
    render(<ChartLineStep series={FIXTURE} />);
    const desc = document.querySelector(
      '[data-section="chart-line-step-aria-desc"]',
    );
    expect(desc?.textContent ?? '').toContain('after');
    expect(desc?.textContent ?? '').toContain('2 series');
  });

  it('respects a custom aria description', () => {
    render(<ChartLineStep series={FIXTURE} ariaDescription="custom" />);
    expect(
      document.querySelector('[data-section="chart-line-step-aria-desc"]')
        ?.textContent,
    ).toBe('custom');
  });

  it('renders one path per series', () => {
    render(<ChartLineStep series={FIXTURE} />);
    const paths = document.querySelectorAll(
      '[data-section="chart-line-step-path"]',
    );
    expect(paths.length).toBe(2);
  });

  it('renders one dot per finite point when showDots=true', () => {
    render(<ChartLineStep series={FIXTURE} />);
    const dots = document.querySelectorAll(
      '[data-section="chart-line-step-dot"]',
    );
    expect(dots.length).toBe(8);
  });

  it('omits dots when showDots=false', () => {
    render(<ChartLineStep series={FIXTURE} showDots={false} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-step-dot"]').length,
    ).toBe(0);
  });

  it('renders a legend item per series', () => {
    render(<ChartLineStep series={FIXTURE} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-step-legend-item"]',
      ).length,
    ).toBe(2);
  });

  it('toggles hidden state via legend (uncontrolled)', () => {
    render(<ChartLineStep series={FIXTURE} />);
    const btn = document.querySelector(
      '[data-section="chart-line-step-legend-item"][data-series-id="a"] [data-section="chart-line-step-legend-button"]',
    ) as HTMLElement;
    fireEvent.click(btn);
    const item = document.querySelector(
      '[data-section="chart-line-step-legend-item"][data-series-id="a"]',
    )!;
    expect(item.getAttribute('data-hidden')).toBe('true');
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-step-path"][data-series-id="a"]',
      ).length,
    ).toBe(0);
  });

  it('does not mutate hiddenSeries when controlled', () => {
    const handler = vi.fn();
    render(
      <ChartLineStep
        series={FIXTURE}
        hiddenSeries={[]}
        onHiddenSeriesChange={handler}
      />,
    );
    const btn = document.querySelector(
      '[data-section="chart-line-step-legend-item"][data-series-id="a"] [data-section="chart-line-step-legend-button"]',
    ) as HTMLElement;
    fireEvent.click(btn);
    expect(handler).toHaveBeenCalledWith(['a']);
  });

  it('fires onSeriesToggle with the hidden flag', () => {
    const handler = vi.fn();
    render(<ChartLineStep series={FIXTURE} onSeriesToggle={handler} />);
    const btn = document.querySelector(
      '[data-section="chart-line-step-legend-item"][data-series-id="b"] [data-section="chart-line-step-legend-button"]',
    ) as HTMLElement;
    fireEvent.click(btn);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0]!.hidden).toBe(true);
    expect(handler.mock.calls[0]![0]!.series.id).toBe('b');
  });

  it('respects defaultHiddenSeries on mount', () => {
    render(
      <ChartLineStep series={FIXTURE} defaultHiddenSeries={['a']} />,
    );
    const item = document.querySelector(
      '[data-section="chart-line-step-legend-item"][data-series-id="a"]',
    )!;
    expect(item.getAttribute('data-hidden')).toBe('true');
  });

  it('shows tooltip on dot hover', () => {
    render(<ChartLineStep series={FIXTURE} />);
    const dot = document.querySelectorAll(
      '[data-section="chart-line-step-dot"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(dot);
    const tip = document.querySelector(
      '[data-section="chart-line-step-tooltip"]',
    );
    expect(tip).not.toBeNull();
    expect(tip!.textContent).toContain('Series A');
  });

  it('hides tooltip on mouse leave', () => {
    render(<ChartLineStep series={FIXTURE} />);
    const dot = document.querySelectorAll(
      '[data-section="chart-line-step-dot"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(dot);
    fireEvent.mouseLeave(dot);
    expect(
      document.querySelector('[data-section="chart-line-step-tooltip"]'),
    ).toBeNull();
  });

  it('fires onPointClick with series + point', () => {
    const handler = vi.fn();
    render(<ChartLineStep series={FIXTURE} onPointClick={handler} />);
    const dot = document.querySelectorAll(
      '[data-section="chart-line-step-dot"]',
    )[0] as SVGElement;
    fireEvent.click(dot);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0]!.series.id).toBe('a');
    expect(typeof handler.mock.calls[0]![0]!.point.x).toBe('number');
  });

  it('hides axis when showAxis=false', () => {
    render(<ChartLineStep series={FIXTURE} showAxis={false} />);
    expect(
      document.querySelector('[data-section="chart-line-step-axes"]'),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    render(<ChartLineStep series={FIXTURE} showGrid={false} />);
    expect(
      document.querySelector('[data-section="chart-line-step-grid"]'),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    render(<ChartLineStep series={FIXTURE} showLegend={false} />);
    expect(
      document.querySelector('[data-section="chart-line-step-legend"]'),
    ).toBeNull();
  });

  it('hides tooltip when showTooltip=false', () => {
    render(<ChartLineStep series={FIXTURE} showTooltip={false} />);
    const dot = document.querySelectorAll(
      '[data-section="chart-line-step-dot"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(dot);
    expect(
      document.querySelector('[data-section="chart-line-step-tooltip"]'),
    ).toBeNull();
  });

  it('applies the animate flag to the data attribute', () => {
    render(<ChartLineStep series={FIXTURE} animate={false} />);
    const root = document.querySelector('[data-section="chart-line-step"]')!;
    expect(root.getAttribute('data-animate')).toBe('false');
  });

  it('renders optional axis labels', () => {
    render(<ChartLineStep series={FIXTURE} xLabel="t" yLabel="signal" />);
    expect(
      document.querySelector('[data-section="chart-line-step-x-label"]')
        ?.textContent,
    ).toBe('t');
    expect(
      document.querySelector('[data-section="chart-line-step-y-label"]')
        ?.textContent,
    ).toBe('signal');
  });

  it('uses formatValue / formatX for axis ticks', () => {
    render(
      <ChartLineStep
        series={FIXTURE}
        formatValue={(n) => `y${n}`}
        formatX={(n) => `x${n}`}
      />,
    );
    const xLabel = document.querySelector(
      '[data-section="chart-line-step-tick-label"][data-axis="x"]',
    );
    const yLabel = document.querySelector(
      '[data-section="chart-line-step-tick-label"][data-axis="y"]',
    );
    expect(xLabel?.textContent?.startsWith('x')).toBe(true);
    expect(yLabel?.textContent?.startsWith('y')).toBe(true);
  });

  it('overrides default colour via series.color', () => {
    render(
      <ChartLineStep
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
      '[data-section="chart-line-step-series-group"]',
    )!;
    expect(grp.getAttribute('data-series-color')).toBe('#abcdef');
  });

  it('exposes dot data attrs', () => {
    render(<ChartLineStep series={FIXTURE} />);
    const dot = document.querySelectorAll(
      '[data-section="chart-line-step-dot"]',
    )[0] as SVGElement;
    expect(dot.getAttribute('data-x')).toBe('0');
    expect(dot.getAttribute('data-y')).toBe('1');
    expect(dot.getAttribute('data-series-id')).toBe('a');
  });

  it('renders empty state when no series', () => {
    render(<ChartLineStep series={[]} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-step-path"]')
        .length,
    ).toBe(0);
    expect(
      document.querySelector('[data-section="chart-line-step-aria-desc"]')
        ?.textContent,
    ).toBe('No data');
  });

  it('keyboard focus on a dot opens the tooltip', () => {
    render(<ChartLineStep series={FIXTURE} />);
    const dot = document.querySelectorAll(
      '[data-section="chart-line-step-dot"]',
    )[0] as SVGElement;
    fireEvent.focus(dot);
    expect(
      document.querySelector('[data-section="chart-line-step-tooltip"]'),
    ).not.toBeNull();
  });

  it('sets data-hovered on the hovered dot and parent series group', () => {
    render(<ChartLineStep series={FIXTURE} />);
    const dot = document.querySelectorAll(
      '[data-section="chart-line-step-dot"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(dot);
    expect(dot.getAttribute('data-hovered')).toBe('true');
    const grp = document.querySelector(
      '[data-section="chart-line-step-series-group"][data-series-id="a"]',
    )!;
    expect(grp.getAttribute('data-hovered')).toBe('true');
  });

  it('renders grid lines per tick when showGrid=true', () => {
    render(<ChartLineStep series={FIXTURE} tickCount={4} />);
    const lines = document.querySelectorAll(
      '[data-section="chart-line-step-grid-line"]',
    );
    expect(lines.length).toBeGreaterThan(0);
  });

  it('renders distinct paths for each step type', () => {
    const fixture: ChartLineStepSeries[] = [
      {
        id: 'a',
        label: 'A',
        data: [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
      },
    ];
    const renderAndGetPath = (stepType: 'before' | 'after' | 'center') => {
      const { container, unmount } = render(
        <ChartLineStep series={fixture} stepType={stepType} />,
      );
      const path = container.querySelector(
        '[data-section="chart-line-step-path"]',
      ) as SVGPathElement;
      const d = path.getAttribute('d') ?? '';
      unmount();
      return d;
    };
    const before = renderAndGetPath('before');
    const after = renderAndGetPath('after');
    const center = renderAndGetPath('center');
    expect(before).not.toBe(after);
    expect(before).not.toBe(center);
    expect(after).not.toBe(center);
  });
});
