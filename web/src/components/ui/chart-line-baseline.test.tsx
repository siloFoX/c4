import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

import {
  ChartLineBaseline,
  DEFAULT_CHART_LINE_BASELINE_WIDTH,
  DEFAULT_CHART_LINE_BASELINE_HEIGHT,
  DEFAULT_CHART_LINE_BASELINE_PADDING,
  DEFAULT_CHART_LINE_BASELINE_TICK_COUNT,
  DEFAULT_CHART_LINE_BASELINE_STROKE_WIDTH,
  DEFAULT_CHART_LINE_BASELINE_DOT_RADIUS,
  DEFAULT_CHART_LINE_BASELINE_LINE_OPACITY,
  DEFAULT_CHART_LINE_BASELINE_BASELINE_VALUE,
  DEFAULT_CHART_LINE_BASELINE_BASELINE_WIDTH,
  DEFAULT_CHART_LINE_BASELINE_BASELINE_DASH,
  DEFAULT_CHART_LINE_BASELINE_BASELINE_COLOR,
  DEFAULT_CHART_LINE_BASELINE_ABOVE_COLOR,
  DEFAULT_CHART_LINE_BASELINE_BELOW_COLOR,
  DEFAULT_CHART_LINE_BASELINE_EQUAL_COLOR,
  DEFAULT_CHART_LINE_BASELINE_GRID_COLOR,
  DEFAULT_CHART_LINE_BASELINE_AXIS_COLOR,
  DEFAULT_CHART_LINE_BASELINE_PALETTE,
  buildLineBaselinePath,
  classifyLineBaselinePoint,
  computeLineBaselineLayout,
  describeLineBaselineChart,
  getLineBaselineBounds,
  getLineBaselineDefaultColor,
  getLineBaselineFinitePoints,
  getLineBaselineTicks,
  pickLineBaselineDotColor,
  type ChartLineBaselineSeries,
} from './chart-line-baseline';

afterEach(() => {
  cleanup();
});

describe('chart-line-baseline / constants', () => {
  it('exports sensible defaults', () => {
    expect(DEFAULT_CHART_LINE_BASELINE_WIDTH).toBe(560);
    expect(DEFAULT_CHART_LINE_BASELINE_HEIGHT).toBe(320);
    expect(DEFAULT_CHART_LINE_BASELINE_PADDING).toBe(40);
    expect(DEFAULT_CHART_LINE_BASELINE_TICK_COUNT).toBe(5);
    expect(DEFAULT_CHART_LINE_BASELINE_STROKE_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_BASELINE_DOT_RADIUS).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_BASELINE_LINE_OPACITY).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_BASELINE_BASELINE_VALUE).toBe(0);
    expect(DEFAULT_CHART_LINE_BASELINE_BASELINE_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_BASELINE_BASELINE_DASH).toMatch(/\d/);
    expect(DEFAULT_CHART_LINE_BASELINE_BASELINE_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_LINE_BASELINE_ABOVE_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_LINE_BASELINE_BELOW_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_LINE_BASELINE_EQUAL_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_LINE_BASELINE_GRID_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_LINE_BASELINE_AXIS_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_LINE_BASELINE_PALETTE).toHaveLength(10);
  });
});

describe('chart-line-baseline / getLineBaselineDefaultColor', () => {
  it('wraps with modulo', () => {
    expect(getLineBaselineDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_BASELINE_PALETTE[0],
    );
    expect(getLineBaselineDefaultColor(10)).toBe(
      DEFAULT_CHART_LINE_BASELINE_PALETTE[0],
    );
  });

  it('falls back to first colour for invalid indices', () => {
    expect(getLineBaselineDefaultColor(-1)).toBe(
      DEFAULT_CHART_LINE_BASELINE_PALETTE[0],
    );
    expect(getLineBaselineDefaultColor(NaN)).toBe(
      DEFAULT_CHART_LINE_BASELINE_PALETTE[0],
    );
  });
});

describe('chart-line-baseline / getLineBaselineFinitePoints', () => {
  it('drops points with non-finite x or y', () => {
    expect(
      getLineBaselineFinitePoints([
        { x: 1, y: 1 },
        { x: NaN, y: 2 },
        { x: 3, y: Infinity },
        { x: 4, y: 4 },
      ]).map((p) => p.x),
    ).toEqual([1, 4]);
  });

  it('returns [] for non-array input', () => {
    expect(
      getLineBaselineFinitePoints(null as unknown as never[]),
    ).toEqual([]);
  });
});

describe('chart-line-baseline / classifyLineBaselinePoint', () => {
  it('returns above for y > baseline', () => {
    expect(classifyLineBaselinePoint(10, 5).direction).toBe('above');
    expect(classifyLineBaselinePoint(10, 5).delta).toBe(5);
  });

  it('returns below for y < baseline', () => {
    expect(classifyLineBaselinePoint(3, 5).direction).toBe('below');
    expect(classifyLineBaselinePoint(3, 5).delta).toBe(-2);
  });

  it('returns equal for y === baseline', () => {
    expect(classifyLineBaselinePoint(5, 5).direction).toBe('equal');
    expect(classifyLineBaselinePoint(5, 5).delta).toBe(0);
  });

  it('respects epsilon noise band', () => {
    expect(classifyLineBaselinePoint(5.05, 5, 0.1).direction).toBe('equal');
    expect(classifyLineBaselinePoint(5.5, 5, 0.1).direction).toBe('above');
    expect(classifyLineBaselinePoint(4.5, 5, 0.1).direction).toBe('below');
  });

  it('returns equal/0 for non-finite inputs', () => {
    expect(classifyLineBaselinePoint(NaN, 5).direction).toBe('equal');
    expect(classifyLineBaselinePoint(NaN, 5).delta).toBe(0);
    expect(classifyLineBaselinePoint(5, NaN).direction).toBe('equal');
  });
});

describe('chart-line-baseline / pickLineBaselineDotColor', () => {
  it('returns aboveColor for above', () => {
    expect(
      pickLineBaselineDotColor('above', '#111', '#aaa', '#bbb', '#ccc'),
    ).toBe('#aaa');
  });

  it('returns belowColor for below', () => {
    expect(
      pickLineBaselineDotColor('below', '#111', '#aaa', '#bbb', '#ccc'),
    ).toBe('#bbb');
  });

  it('returns equalColor for equal', () => {
    expect(
      pickLineBaselineDotColor('equal', '#111', '#aaa', '#bbb', '#ccc'),
    ).toBe('#ccc');
  });

  it('falls back to fallback color when direction color is empty', () => {
    expect(pickLineBaselineDotColor('above', '#111', '', '#bbb', '#ccc')).toBe(
      '#111',
    );
    expect(pickLineBaselineDotColor('below', '#111', '#aaa', '', '#ccc')).toBe(
      '#111',
    );
  });
});

describe('chart-line-baseline / getLineBaselineBounds', () => {
  it('returns unit square for empty input', () => {
    expect(getLineBaselineBounds([])).toEqual({
      xMin: 0,
      xMax: 1,
      yMin: 0,
      yMax: 1,
    });
  });

  it('spans all visible series', () => {
    expect(
      getLineBaselineBounds([
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

  it('extends y range to include baseline above data', () => {
    expect(
      getLineBaselineBounds(
        [
          {
            id: 'a',
            label: 'A',
            data: [
              { x: 0, y: 5 },
              { x: 5, y: 10 },
            ],
          },
        ],
        [],
        50,
      ),
    ).toEqual({ xMin: 0, xMax: 5, yMin: 5, yMax: 50 });
  });

  it('extends y range to include baseline below data', () => {
    expect(
      getLineBaselineBounds(
        [
          {
            id: 'a',
            label: 'A',
            data: [
              { x: 0, y: 5 },
              { x: 5, y: 10 },
            ],
          },
        ],
        [],
        0,
      ),
    ).toEqual({ xMin: 0, xMax: 5, yMin: 0, yMax: 10 });
  });

  it('excludes hidden series', () => {
    expect(
      getLineBaselineBounds(
        [
          { id: 'a', label: 'A', data: [{ x: 1, y: 1 }] },
          { id: 'b', label: 'B', data: [{ x: 100, y: 100 }] },
        ],
        ['b'],
      ),
    ).toEqual({ xMin: 0.5, xMax: 1.5, yMin: 0.5, yMax: 1.5 });
  });
});

describe('chart-line-baseline / getLineBaselineTicks', () => {
  it('returns evenly-spaced ticks', () => {
    expect(getLineBaselineTicks(0, 10, 5)).toHaveLength(5);
  });

  it('returns [] for invalid range', () => {
    expect(getLineBaselineTicks(10, 5, 4)).toEqual([]);
  });
});

describe('chart-line-baseline / buildLineBaselinePath', () => {
  it('returns "" for empty input', () => {
    expect(buildLineBaselinePath([])).toBe('');
  });

  it('returns M-only for single point', () => {
    expect(buildLineBaselinePath([{ px: 5, py: 10 }])).toBe(
      'M 5.000 10.000',
    );
  });

  it('emits one L per additional point', () => {
    const out = buildLineBaselinePath([
      { px: 0, py: 0 },
      { px: 10, py: 5 },
      { px: 20, py: 0 },
    ]);
    expect((out.match(/L /g) ?? []).length).toBe(2);
  });
});

describe('chart-line-baseline / computeLineBaselineLayout', () => {
  it('returns empty when canvas is degenerate', () => {
    expect(
      computeLineBaselineLayout({
        series: [{ id: 'a', label: 'A', data: [{ x: 1, y: 1 }] }],
        width: 10,
        height: 10,
        padding: 100,
      }).series,
    ).toEqual([]);
  });

  it('returns empty when no series', () => {
    expect(
      computeLineBaselineLayout({
        series: [],
        width: 500,
        height: 200,
        padding: 20,
      }).series,
    ).toEqual([]);
  });

  it('returns empty when every series is hidden', () => {
    expect(
      computeLineBaselineLayout({
        series: [{ id: 'a', label: 'A', data: [{ x: 1, y: 1 }] }],
        hidden: ['a'],
        width: 500,
        height: 200,
        padding: 20,
      }).series,
    ).toEqual([]);
  });

  it('records baseline + baselineY', () => {
    const out = computeLineBaselineLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: 0 },
            { x: 1, y: 10 },
          ],
        },
      ],
      baseline: 5,
      yMin: 0,
      yMax: 10,
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.baseline).toBe(5);
    expect(out.baselineY).toBeCloseTo(40 + 60, 5);
  });

  it('clamps baselineY to inside the inner plot when baseline is outside the y range', () => {
    const out = computeLineBaselineLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: 5 },
            { x: 1, y: 10 },
          ],
        },
      ],
      baseline: 500,
      yMin: 0,
      yMax: 10,
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.baselineY).toBeGreaterThanOrEqual(40);
    expect(out.baselineY).toBeLessThanOrEqual(40 + 120);
  });

  it('classifies points relative to baseline (above / below / equal)', () => {
    const out = computeLineBaselineLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: 5 },
            { x: 1, y: 15 },
            { x: 2, y: 10 },
            { x: 3, y: -5 },
          ],
        },
      ],
      baseline: 10,
      width: 500,
      height: 200,
      padding: 40,
    });
    const pts = out.series[0]!.points;
    expect(pts[0]!.direction).toBe('below');
    expect(pts[0]!.delta).toBe(-5);
    expect(pts[1]!.direction).toBe('above');
    expect(pts[1]!.delta).toBe(5);
    expect(pts[2]!.direction).toBe('equal');
    expect(pts[2]!.delta).toBe(0);
    expect(pts[3]!.direction).toBe('below');
    expect(pts[3]!.delta).toBe(-15);
  });

  it('aggregates above/below/equal counts per series', () => {
    const out = computeLineBaselineLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: 5 },
            { x: 1, y: 15 },
            { x: 2, y: 10 },
            { x: 3, y: 20 },
          ],
        },
      ],
      baseline: 10,
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.series[0]!.aboveCount).toBe(2);
    expect(out.series[0]!.belowCount).toBe(1);
    expect(out.series[0]!.equalCount).toBe(1);
  });

  it('respects epsilon for equal classification', () => {
    const out = computeLineBaselineLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: 9.95 },
            { x: 1, y: 10.05 },
          ],
        },
      ],
      baseline: 10,
      epsilon: 0.1,
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.series[0]!.points[0]!.direction).toBe('equal');
    expect(out.series[0]!.points[1]!.direction).toBe('equal');
  });

  it('drops non-finite points but keeps totalCount', () => {
    const out = computeLineBaselineLayout({
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
    const out = computeLineBaselineLayout({
      series: [
        { id: 'a', label: 'A', data: [{ x: 0, y: 0 }] },
        { id: 'b', label: 'B', data: [{ x: 1, y: 1 }] },
        { id: 'c', label: 'C', data: [{ x: 2, y: 2 }] },
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

  it('falls back to default baseline (0) when omitted', () => {
    const out = computeLineBaselineLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: -5 },
            { x: 1, y: 5 },
          ],
        },
      ],
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.baseline).toBe(0);
    expect(out.series[0]!.aboveCount).toBe(1);
    expect(out.series[0]!.belowCount).toBe(1);
  });
});

describe('chart-line-baseline / describeLineBaselineChart', () => {
  it('returns "No data" when empty', () => {
    expect(describeLineBaselineChart([], 0)).toBe('No data');
  });

  it('returns "No data" when no finite points', () => {
    expect(
      describeLineBaselineChart(
        [
          {
            id: 'a',
            label: 'A',
            data: [{ x: NaN, y: 1 } as { x: number; y: number }],
          },
        ],
        0,
      ),
    ).toBe('No data');
  });

  it('summarises with baseline, counts, and direction breakdown', () => {
    const out = describeLineBaselineChart(
      [
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: 5 },
            { x: 1, y: 15 },
            { x: 2, y: 10 },
            { x: 3, y: 20 },
          ],
        },
      ],
      10,
    );
    expect(out).toContain('baseline at 10');
    expect(out).toContain('1 series');
    expect(out).toContain('4 points');
    expect(out).toContain('2 above');
    expect(out).toContain('1 below');
    expect(out).toContain('1 equal');
  });

  it('excludes hidden series', () => {
    const out = describeLineBaselineChart(
      [
        { id: 'a', label: 'A', data: [{ x: 0, y: 1 }] },
        { id: 'b', label: 'B', data: [{ x: 0, y: 100 }] },
      ],
      0,
      ['b'],
    );
    expect(out).toContain('1 series');
  });
});

const FIXTURE: ChartLineBaselineSeries[] = [
  {
    id: 'sales',
    label: 'Sales',
    data: [
      { x: 0, y: 80 },
      { x: 1, y: 120 },
      { x: 2, y: 100 },
      { x: 3, y: 150 },
      { x: 4, y: 90 },
    ],
  },
];

describe('chart-line-baseline / <ChartLineBaseline>', () => {
  it('renders a root region with the default aria label', () => {
    render(<ChartLineBaseline series={FIXTURE} baseline={100} />);
    const root = document.querySelector(
      '[data-section="chart-line-baseline"]',
    )!;
    expect(root.getAttribute('aria-label')).toBe(
      'Line chart with adjustable baseline',
    );
  });

  it('exposes baseline + direction counts as data attrs', () => {
    render(<ChartLineBaseline series={FIXTURE} baseline={100} />);
    const root = document.querySelector(
      '[data-section="chart-line-baseline"]',
    )!;
    expect(root.getAttribute('data-baseline')).toBe('100');
    expect(root.getAttribute('data-above-count')).toBe('2');
    expect(root.getAttribute('data-below-count')).toBe('2');
    expect(root.getAttribute('data-equal-count')).toBe('1');
  });

  it('renders an aria description with summary text', () => {
    render(<ChartLineBaseline series={FIXTURE} baseline={100} />);
    expect(
      document.querySelector('[data-section="chart-line-baseline-aria-desc"]')
        ?.textContent ?? '',
    ).toContain('baseline at 100');
  });

  it('respects a custom aria description', () => {
    render(
      <ChartLineBaseline
        series={FIXTURE}
        baseline={100}
        ariaDescription="custom"
      />,
    );
    expect(
      document.querySelector('[data-section="chart-line-baseline-aria-desc"]')
        ?.textContent,
    ).toBe('custom');
  });

  it('renders one baseline reference line', () => {
    render(<ChartLineBaseline series={FIXTURE} baseline={100} />);
    const line = document.querySelector(
      '[data-section="chart-line-baseline-reference-line"]',
    );
    expect(line).not.toBeNull();
    expect(line!.getAttribute('data-baseline-value')).toBe('100');
  });

  it('renders the baseline label when baselineLabel is provided', () => {
    render(
      <ChartLineBaseline
        series={FIXTURE}
        baseline={100}
        baselineLabel="target"
      />,
    );
    const label = document.querySelector(
      '[data-section="chart-line-baseline-reference-label"]',
    );
    expect(label).not.toBeNull();
    expect(label!.textContent).toContain('target');
    expect(label!.textContent).toContain('100');
  });

  it('omits baseline when showBaseline=false', () => {
    render(
      <ChartLineBaseline series={FIXTURE} baseline={100} showBaseline={false} />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-baseline-reference-line"]',
      ),
    ).toBeNull();
  });

  it('omits baseline label when showBaselineLabel=false', () => {
    render(
      <ChartLineBaseline
        series={FIXTURE}
        baseline={100}
        baselineLabel="target"
        showBaselineLabel={false}
      />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-baseline-reference-label"]',
      ),
    ).toBeNull();
  });

  it('colours dots by direction when colorDotsByDirection=true', () => {
    render(<ChartLineBaseline series={FIXTURE} baseline={100} />);
    const dots = document.querySelectorAll(
      '[data-section="chart-line-baseline-dot"]',
    );
    const colors = Array.from(dots).map((d) => d.getAttribute('data-dot-color'));
    expect(new Set(colors).size).toBeGreaterThan(1);
  });

  it('paints all dots in series color when colorDotsByDirection=false', () => {
    render(
      <ChartLineBaseline
        series={[
          {
            id: 'a',
            label: 'A',
            color: '#abcdef',
            data: [
              { x: 0, y: 5 },
              { x: 1, y: 15 },
              { x: 2, y: 10 },
            ],
          },
        ]}
        baseline={10}
        colorDotsByDirection={false}
      />,
    );
    const dots = document.querySelectorAll(
      '[data-section="chart-line-baseline-dot"]',
    );
    const colors = Array.from(dots).map((d) => d.getAttribute('data-dot-color'));
    expect(new Set(colors)).toEqual(new Set(['#abcdef']));
  });

  it('exposes per-dot delta + direction data attrs', () => {
    render(<ChartLineBaseline series={FIXTURE} baseline={100} />);
    const dot = document.querySelectorAll(
      '[data-section="chart-line-baseline-dot"]',
    )[0] as SVGElement;
    expect(dot.getAttribute('data-y')).toBe('80');
    expect(dot.getAttribute('data-delta')).toBe('-20');
    expect(dot.getAttribute('data-direction')).toBe('below');
  });

  it('renders one path per visible series', () => {
    render(<ChartLineBaseline series={FIXTURE} baseline={100} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-baseline-path"]')
        .length,
    ).toBe(1);
  });

  it('renders one dot per finite point when showDots=true', () => {
    render(<ChartLineBaseline series={FIXTURE} baseline={100} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-baseline-dot"]')
        .length,
    ).toBe(5);
  });

  it('omits dots when showDots=false', () => {
    render(
      <ChartLineBaseline series={FIXTURE} baseline={100} showDots={false} />,
    );
    expect(
      document.querySelectorAll('[data-section="chart-line-baseline-dot"]')
        .length,
    ).toBe(0);
  });

  it('shows tooltip with delta row on dot hover', () => {
    render(<ChartLineBaseline series={FIXTURE} baseline={100} />);
    const dot = document.querySelectorAll(
      '[data-section="chart-line-baseline-dot"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(dot);
    const tip = document.querySelector(
      '[data-section="chart-line-baseline-tooltip"]',
    );
    expect(tip).not.toBeNull();
    expect(tip!.textContent).toContain('Sales');
    const delta = document.querySelector(
      '[data-section="chart-line-baseline-tooltip-delta"]',
    );
    expect(delta).not.toBeNull();
    expect(delta!.textContent).toContain('20');
  });

  it('omits delta row when showDeltaInTooltip=false', () => {
    render(
      <ChartLineBaseline
        series={FIXTURE}
        baseline={100}
        showDeltaInTooltip={false}
      />,
    );
    const dot = document.querySelectorAll(
      '[data-section="chart-line-baseline-dot"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(dot);
    expect(
      document.querySelector(
        '[data-section="chart-line-baseline-tooltip-delta"]',
      ),
    ).toBeNull();
  });

  it('hides tooltip on mouse leave', () => {
    render(<ChartLineBaseline series={FIXTURE} baseline={100} />);
    const dot = document.querySelectorAll(
      '[data-section="chart-line-baseline-dot"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(dot);
    fireEvent.mouseLeave(dot);
    expect(
      document.querySelector('[data-section="chart-line-baseline-tooltip"]'),
    ).toBeNull();
  });

  it('fires onPointClick with series + point', () => {
    const handler = vi.fn();
    render(
      <ChartLineBaseline
        series={FIXTURE}
        baseline={100}
        onPointClick={handler}
      />,
    );
    const dot = document.querySelectorAll(
      '[data-section="chart-line-baseline-dot"]',
    )[0] as SVGElement;
    fireEvent.click(dot);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0]!.series.id).toBe('sales');
  });

  it('hides axis when showAxis=false', () => {
    render(<ChartLineBaseline series={FIXTURE} showAxis={false} />);
    expect(
      document.querySelector('[data-section="chart-line-baseline-axes"]'),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    render(<ChartLineBaseline series={FIXTURE} showGrid={false} />);
    expect(
      document.querySelector('[data-section="chart-line-baseline-grid"]'),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    render(<ChartLineBaseline series={FIXTURE} showLegend={false} />);
    expect(
      document.querySelector('[data-section="chart-line-baseline-legend"]'),
    ).toBeNull();
  });

  it('hides tooltip when showTooltip=false', () => {
    render(<ChartLineBaseline series={FIXTURE} showTooltip={false} />);
    const dot = document.querySelectorAll(
      '[data-section="chart-line-baseline-dot"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(dot);
    expect(
      document.querySelector('[data-section="chart-line-baseline-tooltip"]'),
    ).toBeNull();
  });

  it('applies the animate flag to the data attribute', () => {
    render(<ChartLineBaseline series={FIXTURE} animate={false} />);
    const root = document.querySelector(
      '[data-section="chart-line-baseline"]',
    )!;
    expect(root.getAttribute('data-animate')).toBe('false');
  });

  it('uses formatValue / formatX for axis ticks', () => {
    render(
      <ChartLineBaseline
        series={FIXTURE}
        baseline={100}
        formatValue={(n) => `y${n}`}
        formatX={(n) => `x${n}`}
      />,
    );
    const xLabel = document.querySelector(
      '[data-section="chart-line-baseline-tick-label"][data-axis="x"]',
    );
    const yLabel = document.querySelector(
      '[data-section="chart-line-baseline-tick-label"][data-axis="y"]',
    );
    expect(xLabel?.textContent?.startsWith('x')).toBe(true);
    expect(yLabel?.textContent?.startsWith('y')).toBe(true);
  });

  it('uses formatDelta for the tooltip delta row', () => {
    render(
      <ChartLineBaseline
        series={FIXTURE}
        baseline={100}
        formatDelta={(n) => `delta:${n}`}
      />,
    );
    const dot = document.querySelectorAll(
      '[data-section="chart-line-baseline-dot"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(dot);
    const delta = document.querySelector(
      '[data-section="chart-line-baseline-tooltip-delta"]',
    );
    expect(delta?.textContent).toContain('delta:');
  });

  it('renders direction legend items when colorDotsByDirection=true', () => {
    render(<ChartLineBaseline series={FIXTURE} baseline={100} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-baseline-legend-direction"]',
      ).length,
    ).toBe(2);
  });

  it('omits direction legend items when colorDotsByDirection=false', () => {
    render(
      <ChartLineBaseline
        series={FIXTURE}
        baseline={100}
        colorDotsByDirection={false}
      />,
    );
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-baseline-legend-direction"]',
      ).length,
    ).toBe(0);
  });

  it('toggles hidden state via legend (uncontrolled)', () => {
    render(<ChartLineBaseline series={FIXTURE} baseline={100} />);
    const btn = document.querySelector(
      '[data-section="chart-line-baseline-legend-item"][data-series-id="sales"] [data-section="chart-line-baseline-legend-button"]',
    ) as HTMLElement;
    fireEvent.click(btn);
    const item = document.querySelector(
      '[data-section="chart-line-baseline-legend-item"][data-series-id="sales"]',
    )!;
    expect(item.getAttribute('data-hidden')).toBe('true');
  });

  it('fires onSeriesToggle with the hidden flag', () => {
    const handler = vi.fn();
    render(
      <ChartLineBaseline
        series={FIXTURE}
        baseline={100}
        onSeriesToggle={handler}
      />,
    );
    const btn = document.querySelector(
      '[data-section="chart-line-baseline-legend-item"][data-series-id="sales"] [data-section="chart-line-baseline-legend-button"]',
    ) as HTMLElement;
    fireEvent.click(btn);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0]!.hidden).toBe(true);
  });

  it('respects defaultHiddenSeries on mount', () => {
    render(
      <ChartLineBaseline
        series={FIXTURE}
        baseline={100}
        defaultHiddenSeries={['sales']}
      />,
    );
    const item = document.querySelector(
      '[data-section="chart-line-baseline-legend-item"][data-series-id="sales"]',
    )!;
    expect(item.getAttribute('data-hidden')).toBe('true');
  });

  it('renders empty state when no series', () => {
    render(<ChartLineBaseline series={[]} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-baseline-path"]')
        .length,
    ).toBe(0);
    expect(
      document.querySelector(
        '[data-section="chart-line-baseline-aria-desc"]',
      )?.textContent,
    ).toBe('No data');
  });

  it('renders per-dot aria-label with delta + direction', () => {
    render(<ChartLineBaseline series={FIXTURE} baseline={100} />);
    const dot = document.querySelectorAll(
      '[data-section="chart-line-baseline-dot"]',
    )[0] as SVGElement;
    const aria = dot.getAttribute('aria-label') ?? '';
    expect(aria).toContain('Sales');
    expect(aria).toContain('below');
    expect(aria).toContain('20');
  });

  it('sets data-hovered on the hovered dot and parent series group', () => {
    render(<ChartLineBaseline series={FIXTURE} baseline={100} />);
    const dot = document.querySelectorAll(
      '[data-section="chart-line-baseline-dot"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(dot);
    expect(dot.getAttribute('data-hovered')).toBe('true');
    const grp = document.querySelector(
      '[data-section="chart-line-baseline-series-group"][data-series-id="sales"]',
    )!;
    expect(grp.getAttribute('data-hovered')).toBe('true');
  });

  it('renders grid lines per tick when showGrid=true', () => {
    render(
      <ChartLineBaseline
        series={FIXTURE}
        baseline={100}
        tickCount={4}
      />,
    );
    const lines = document.querySelectorAll(
      '[data-section="chart-line-baseline-grid-line"]',
    );
    expect(lines.length).toBeGreaterThan(0);
  });

  it('exposes per-series direction breakdown attrs', () => {
    render(<ChartLineBaseline series={FIXTURE} baseline={100} />);
    const grp = document.querySelector(
      '[data-section="chart-line-baseline-series-group"][data-series-id="sales"]',
    )!;
    expect(grp.getAttribute('data-series-above-count')).toBe('2');
    expect(grp.getAttribute('data-series-below-count')).toBe('2');
    expect(grp.getAttribute('data-series-equal-count')).toBe('1');
  });
});
