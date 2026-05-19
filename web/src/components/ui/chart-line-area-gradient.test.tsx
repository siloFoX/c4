import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

import {
  ChartLineAreaGradient,
  DEFAULT_CHART_LINE_AREA_GRADIENT_WIDTH,
  DEFAULT_CHART_LINE_AREA_GRADIENT_HEIGHT,
  DEFAULT_CHART_LINE_AREA_GRADIENT_PADDING,
  DEFAULT_CHART_LINE_AREA_GRADIENT_TICK_COUNT,
  DEFAULT_CHART_LINE_AREA_GRADIENT_STROKE_WIDTH,
  DEFAULT_CHART_LINE_AREA_GRADIENT_DOT_RADIUS,
  DEFAULT_CHART_LINE_AREA_GRADIENT_LINE_OPACITY,
  DEFAULT_CHART_LINE_AREA_GRADIENT_TOP_OPACITY,
  DEFAULT_CHART_LINE_AREA_GRADIENT_BOTTOM_OPACITY,
  DEFAULT_CHART_LINE_AREA_GRADIENT_GRID_COLOR,
  DEFAULT_CHART_LINE_AREA_GRADIENT_AXIS_COLOR,
  DEFAULT_CHART_LINE_AREA_GRADIENT_PALETTE,
  buildLineAreaGradientAreaPath,
  buildLineAreaGradientLinePath,
  computeLineAreaGradientLayout,
  describeLineAreaGradientChart,
  getLineAreaGradientBounds,
  getLineAreaGradientDefaultColor,
  getLineAreaGradientFinitePoints,
  getLineAreaGradientTicks,
  resolveLineAreaGradientBaseline,
  type ChartLineAreaGradientSeries,
} from './chart-line-area-gradient';

afterEach(() => {
  cleanup();
});

describe('chart-line-area-gradient / constants', () => {
  it('exports sensible defaults', () => {
    expect(DEFAULT_CHART_LINE_AREA_GRADIENT_WIDTH).toBe(560);
    expect(DEFAULT_CHART_LINE_AREA_GRADIENT_HEIGHT).toBe(320);
    expect(DEFAULT_CHART_LINE_AREA_GRADIENT_PADDING).toBe(40);
    expect(DEFAULT_CHART_LINE_AREA_GRADIENT_TICK_COUNT).toBe(5);
    expect(DEFAULT_CHART_LINE_AREA_GRADIENT_STROKE_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_AREA_GRADIENT_DOT_RADIUS).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_AREA_GRADIENT_LINE_OPACITY).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_AREA_GRADIENT_TOP_OPACITY).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_AREA_GRADIENT_TOP_OPACITY).toBeLessThanOrEqual(1);
    expect(DEFAULT_CHART_LINE_AREA_GRADIENT_BOTTOM_OPACITY).toBe(0);
    expect(DEFAULT_CHART_LINE_AREA_GRADIENT_GRID_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_LINE_AREA_GRADIENT_AXIS_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_LINE_AREA_GRADIENT_PALETTE).toHaveLength(10);
  });
});

describe('chart-line-area-gradient / getLineAreaGradientDefaultColor', () => {
  it('wraps with modulo', () => {
    expect(getLineAreaGradientDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_AREA_GRADIENT_PALETTE[0],
    );
    expect(getLineAreaGradientDefaultColor(10)).toBe(
      DEFAULT_CHART_LINE_AREA_GRADIENT_PALETTE[0],
    );
  });

  it('falls back to first colour for invalid indices', () => {
    expect(getLineAreaGradientDefaultColor(-1)).toBe(
      DEFAULT_CHART_LINE_AREA_GRADIENT_PALETTE[0],
    );
    expect(getLineAreaGradientDefaultColor(NaN)).toBe(
      DEFAULT_CHART_LINE_AREA_GRADIENT_PALETTE[0],
    );
  });
});

describe('chart-line-area-gradient / getLineAreaGradientFinitePoints', () => {
  it('drops points with non-finite x or y', () => {
    expect(
      getLineAreaGradientFinitePoints([
        { x: 1, y: 1 },
        { x: NaN, y: 2 },
        { x: 3, y: Infinity },
        { x: 4, y: 4 },
      ]).map((p) => p.x),
    ).toEqual([1, 4]);
  });

  it('returns [] for non-array input', () => {
    expect(
      getLineAreaGradientFinitePoints(null as unknown as never[]),
    ).toEqual([]);
  });
});

describe('chart-line-area-gradient / resolveLineAreaGradientBaseline', () => {
  it('returns explicit baseline when finite', () => {
    expect(
      resolveLineAreaGradientBaseline({ yMin: 5, yMax: 10 }, 0),
    ).toBe(0);
  });

  it('falls back to bounds.yMin when no explicit baseline', () => {
    expect(
      resolveLineAreaGradientBaseline({ yMin: 5, yMax: 10 }),
    ).toBe(5);
  });

  it('falls back to yMin for non-finite explicit', () => {
    expect(
      resolveLineAreaGradientBaseline({ yMin: 5, yMax: 10 }, NaN),
    ).toBe(5);
    expect(
      resolveLineAreaGradientBaseline(
        { yMin: 5, yMax: 10 },
        Infinity,
      ),
    ).toBe(5);
  });
});

describe('chart-line-area-gradient / getLineAreaGradientBounds', () => {
  it('returns unit square for empty input', () => {
    expect(getLineAreaGradientBounds([])).toEqual({
      xMin: 0,
      xMax: 1,
      yMin: 0,
      yMax: 1,
    });
  });

  it('spans all visible series', () => {
    expect(
      getLineAreaGradientBounds([
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

  it('extends y range to include explicit baseline', () => {
    expect(
      getLineAreaGradientBounds(
        [
          {
            id: 'a',
            label: 'A',
            data: [
              { x: 1, y: 10 },
              { x: 2, y: 20 },
            ],
          },
        ],
        [],
        0,
      ),
    ).toEqual({ xMin: 1, xMax: 2, yMin: 0, yMax: 20 });
  });

  it('extends y range upward when baseline is above data', () => {
    expect(
      getLineAreaGradientBounds(
        [
          {
            id: 'a',
            label: 'A',
            data: [
              { x: 0, y: 1 },
              { x: 1, y: 5 },
            ],
          },
        ],
        [],
        100,
      ),
    ).toEqual({ xMin: 0, xMax: 1, yMin: 1, yMax: 100 });
  });

  it('excludes hidden series', () => {
    expect(
      getLineAreaGradientBounds(
        [
          { id: 'a', label: 'A', data: [{ x: 1, y: 1 }] },
          { id: 'b', label: 'B', data: [{ x: 100, y: 100 }] },
        ],
        ['b'],
      ),
    ).toEqual({ xMin: 0.5, xMax: 1.5, yMin: 0.5, yMax: 1.5 });
  });
});

describe('chart-line-area-gradient / getLineAreaGradientTicks', () => {
  it('returns evenly-spaced ticks', () => {
    const ticks = getLineAreaGradientTicks(0, 10, 5);
    expect(ticks).toHaveLength(5);
    expect(ticks[0]!.value).toBe(0);
    expect(ticks[4]!.value).toBe(10);
  });

  it('returns [] for invalid range', () => {
    expect(getLineAreaGradientTicks(10, 5, 4)).toEqual([]);
  });
});

describe('chart-line-area-gradient / buildLineAreaGradientLinePath', () => {
  it('returns "" for empty input', () => {
    expect(buildLineAreaGradientLinePath([])).toBe('');
  });

  it('returns M-only for single point', () => {
    expect(buildLineAreaGradientLinePath([{ px: 5, py: 10 }])).toBe(
      'M 5.000 10.000',
    );
  });

  it('emits one L per additional point', () => {
    const out = buildLineAreaGradientLinePath([
      { px: 0, py: 0 },
      { px: 10, py: 5 },
      { px: 20, py: 0 },
    ]);
    expect((out.match(/L /g) ?? []).length).toBe(2);
  });
});

describe('chart-line-area-gradient / buildLineAreaGradientAreaPath', () => {
  it('returns "" for empty input', () => {
    expect(buildLineAreaGradientAreaPath([], 100)).toBe('');
  });

  it('emits a degenerate sliver for single point', () => {
    const out = buildLineAreaGradientAreaPath([{ px: 5, py: 10 }], 100);
    expect(out.endsWith(' Z')).toBe(true);
    expect(out).toContain('M 5.000 100.000');
    expect(out).toContain('L 5.000 10.000');
  });

  it('emits a closed polygon from line down to baseline', () => {
    const out = buildLineAreaGradientAreaPath(
      [
        { px: 0, py: 50 },
        { px: 10, py: 30 },
        { px: 20, py: 40 },
      ],
      100,
    );
    expect(out.startsWith('M 0.000 50.000')).toBe(true);
    expect(out.endsWith(' Z')).toBe(true);
    // Should hit the baseline at the last x and the first x in order.
    expect(out).toContain('L 20.000 100.000');
    expect(out).toContain('L 0.000 100.000');
  });

  it('emits L commands in the right order (line, then closing baseline)', () => {
    const out = buildLineAreaGradientAreaPath(
      [
        { px: 0, py: 50 },
        { px: 10, py: 30 },
        { px: 20, py: 40 },
      ],
      100,
    );
    const lastXBaseline = out.indexOf('L 20.000 100.000');
    const firstXBaseline = out.indexOf('L 0.000 100.000');
    expect(lastXBaseline).toBeGreaterThan(0);
    expect(firstXBaseline).toBeGreaterThan(lastXBaseline);
  });

  it('treats non-finite baseline as 0', () => {
    const out = buildLineAreaGradientAreaPath(
      [
        { px: 0, py: 50 },
        { px: 10, py: 30 },
      ],
      NaN,
    );
    expect(out).toContain('L 10.000 0.000');
    expect(out).toContain('L 0.000 0.000');
  });
});

describe('chart-line-area-gradient / computeLineAreaGradientLayout', () => {
  it('returns empty when canvas is degenerate', () => {
    expect(
      computeLineAreaGradientLayout({
        series: [{ id: 'a', label: 'A', data: [{ x: 1, y: 1 }] }],
        width: 10,
        height: 10,
        padding: 100,
      }).series,
    ).toEqual([]);
  });

  it('returns empty when no series', () => {
    expect(
      computeLineAreaGradientLayout({
        series: [],
        width: 500,
        height: 200,
        padding: 20,
      }).series,
    ).toEqual([]);
  });

  it('returns empty when every series is hidden', () => {
    expect(
      computeLineAreaGradientLayout({
        series: [{ id: 'a', label: 'A', data: [{ x: 1, y: 1 }] }],
        hidden: ['a'],
        width: 500,
        height: 200,
        padding: 20,
      }).series,
    ).toEqual([]);
  });

  it('records baseline + baselineY in the layout', () => {
    const out = computeLineAreaGradientLayout({
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
      baseline: 0,
      yMin: 0,
      yMax: 10,
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.baseline).toBe(0);
    expect(out.baselineY).toBeCloseTo(40 + 120, 5);
  });

  it('falls back to yMin baseline when no explicit baseline given', () => {
    const out = computeLineAreaGradientLayout({
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
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.baseline).toBe(out.yMin);
  });

  it('clamps baseline pixel to inside the plot when baseline is outside range', () => {
    const out = computeLineAreaGradientLayout({
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
      baseline: -100,
      yMin: 0,
      yMax: 10,
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.baselineY).toBeGreaterThanOrEqual(40);
    expect(out.baselineY).toBeLessThanOrEqual(40 + 120);
  });

  it('builds linePath and areaPath per series', () => {
    const out = computeLineAreaGradientLayout({
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
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.series[0]!.linePath.startsWith('M ')).toBe(true);
    expect(out.series[0]!.areaPath.startsWith('M ')).toBe(true);
    expect(out.series[0]!.areaPath.endsWith(' Z')).toBe(true);
  });

  it('drops non-finite points but keeps totalCount', () => {
    const out = computeLineAreaGradientLayout({
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
    const out = computeLineAreaGradientLayout({
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

  it('honours fillColor override (separate from stroke color)', () => {
    const out = computeLineAreaGradientLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
          color: '#111111',
          fillColor: '#222222',
        },
      ],
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.series[0]!.color).toBe('#111111');
    expect(out.series[0]!.fillColor).toBe('#222222');
  });

  it('records topY equal to padding', () => {
    const out = computeLineAreaGradientLayout({
      series: [{ id: 'a', label: 'A', data: [{ x: 0, y: 1 }] }],
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.topY).toBe(40);
  });
});

describe('chart-line-area-gradient / describeLineAreaGradientChart', () => {
  it('returns "No data" when empty', () => {
    expect(describeLineAreaGradientChart([])).toBe('No data');
  });

  it('returns "No data" when no finite points', () => {
    expect(
      describeLineAreaGradientChart([
        {
          id: 'a',
          label: 'A',
          data: [{ x: NaN, y: 1 } as { x: number; y: number }],
        },
      ]),
    ).toBe('No data');
  });

  it('summarises series, points, and ranges', () => {
    const out = describeLineAreaGradientChart([
      {
        id: 'a',
        label: 'A',
        data: [
          { x: 0, y: 1 },
          { x: 1, y: 2 },
        ],
      },
    ]);
    expect(out).toContain('1 series');
    expect(out).toContain('2 points');
    expect(out).toContain('gradient area');
  });

  it('includes the explicit baseline in the summary', () => {
    const out = describeLineAreaGradientChart(
      [{ id: 'a', label: 'A', data: [{ x: 0, y: 5 }] }],
      [],
      0,
    );
    expect(out).toContain('baseline 0');
  });

  it('excludes hidden series', () => {
    const out = describeLineAreaGradientChart(
      [
        { id: 'a', label: 'A', data: [{ x: 0, y: 1 }] },
        { id: 'b', label: 'B', data: [{ x: 0, y: 100 }] },
      ],
      ['b'],
    );
    expect(out).toContain('1 series');
  });
});

const FIXTURE: ChartLineAreaGradientSeries[] = [
  {
    id: 'a',
    label: 'Revenue',
    data: [
      { x: 0, y: 100 },
      { x: 1, y: 130 },
      { x: 2, y: 110 },
      { x: 3, y: 160 },
      { x: 4, y: 190 },
    ],
  },
];

describe('chart-line-area-gradient / <ChartLineAreaGradient>', () => {
  it('renders a root region with the default aria label', () => {
    render(<ChartLineAreaGradient series={FIXTURE} />);
    const root = document.querySelector(
      '[data-section="chart-line-area-gradient"]',
    )!;
    expect(root.getAttribute('aria-label')).toBe(
      'Line and gradient area chart',
    );
  });

  it('exposes series counts and baseline as data attrs', () => {
    render(<ChartLineAreaGradient series={FIXTURE} baseline={0} />);
    const root = document.querySelector(
      '[data-section="chart-line-area-gradient"]',
    )!;
    expect(root.getAttribute('data-series-count')).toBe('1');
    expect(root.getAttribute('data-visible-series-count')).toBe('1');
    expect(root.getAttribute('data-total-points')).toBe('5');
    expect(root.getAttribute('data-baseline')).toBe('0');
  });

  it('renders an aria description with summary text', () => {
    render(<ChartLineAreaGradient series={FIXTURE} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-area-gradient-aria-desc"]',
      )?.textContent ?? '',
    ).toContain('gradient area');
  });

  it('respects a custom aria description', () => {
    render(
      <ChartLineAreaGradient series={FIXTURE} ariaDescription="custom" />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-area-gradient-aria-desc"]',
      )?.textContent,
    ).toBe('custom');
  });

  it('renders a gradient def per series', () => {
    render(<ChartLineAreaGradient series={FIXTURE} />);
    const defs = document.querySelectorAll(
      '[data-section="chart-line-area-gradient-gradient-def"]',
    );
    expect(defs.length).toBe(1);
    expect(defs[0]!.getAttribute('data-series-id')).toBe('a');
  });

  it('renders one area + one line path per series', () => {
    render(<ChartLineAreaGradient series={FIXTURE} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-area-gradient-area"]',
      ).length,
    ).toBe(1);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-area-gradient-path"]',
      ).length,
    ).toBe(1);
  });

  it('binds the area path to its gradient via url(#...)', () => {
    render(<ChartLineAreaGradient series={FIXTURE} />);
    const area = document.querySelector(
      '[data-section="chart-line-area-gradient-area"]',
    )!;
    const fill = area.getAttribute('fill') ?? '';
    expect(fill.startsWith('url(#')).toBe(true);
    expect(fill).toContain('-a-grad)');
  });

  it('configures gradient endpoints based on layout topY + baselineY', () => {
    render(<ChartLineAreaGradient series={FIXTURE} />);
    const grad = document.querySelector(
      '[data-section="chart-line-area-gradient-gradient-def"]',
    )! as SVGLinearGradientElement;
    expect(grad.getAttribute('gradientUnits')).toBe('userSpaceOnUse');
    expect(grad.getAttribute('y1')).toBe('40'); // padding default
    expect(Number(grad.getAttribute('y2'))).toBeGreaterThan(40);
  });

  it('gradient stop opacities use the prop values', () => {
    render(
      <ChartLineAreaGradient
        series={FIXTURE}
        gradientTopOpacity={0.8}
        gradientBottomOpacity={0.05}
      />,
    );
    const grad = document.querySelector(
      '[data-section="chart-line-area-gradient-gradient-def"]',
    )!;
    const stops = grad.querySelectorAll('stop');
    expect(stops[0]!.getAttribute('stop-opacity')).toBe('0.8');
    expect(stops[1]!.getAttribute('stop-opacity')).toBe('0.05');
  });

  it('renders one dot per finite point when showDots=true', () => {
    render(<ChartLineAreaGradient series={FIXTURE} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-area-gradient-dot"]')
        .length,
    ).toBe(5);
  });

  it('omits dots when showDots=false', () => {
    render(<ChartLineAreaGradient series={FIXTURE} showDots={false} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-area-gradient-dot"]')
        .length,
    ).toBe(0);
  });

  it('renders a legend item per series', () => {
    render(<ChartLineAreaGradient series={FIXTURE} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-area-gradient-legend-item"]',
      ).length,
    ).toBe(1);
  });

  it('toggles hidden state via legend (uncontrolled)', () => {
    render(<ChartLineAreaGradient series={FIXTURE} />);
    const btn = document.querySelector(
      '[data-section="chart-line-area-gradient-legend-item"][data-series-id="a"] [data-section="chart-line-area-gradient-legend-button"]',
    ) as HTMLElement;
    fireEvent.click(btn);
    const item = document.querySelector(
      '[data-section="chart-line-area-gradient-legend-item"][data-series-id="a"]',
    )!;
    expect(item.getAttribute('data-hidden')).toBe('true');
    expect(
      document.querySelectorAll('[data-section="chart-line-area-gradient-area"]')
        .length,
    ).toBe(0);
  });

  it('does not mutate hiddenSeries when controlled', () => {
    const handler = vi.fn();
    render(
      <ChartLineAreaGradient
        series={FIXTURE}
        hiddenSeries={[]}
        onHiddenSeriesChange={handler}
      />,
    );
    const btn = document.querySelector(
      '[data-section="chart-line-area-gradient-legend-item"][data-series-id="a"] [data-section="chart-line-area-gradient-legend-button"]',
    ) as HTMLElement;
    fireEvent.click(btn);
    expect(handler).toHaveBeenCalledWith(['a']);
  });

  it('fires onSeriesToggle with the hidden flag', () => {
    const handler = vi.fn();
    render(
      <ChartLineAreaGradient series={FIXTURE} onSeriesToggle={handler} />,
    );
    const btn = document.querySelector(
      '[data-section="chart-line-area-gradient-legend-item"][data-series-id="a"] [data-section="chart-line-area-gradient-legend-button"]',
    ) as HTMLElement;
    fireEvent.click(btn);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0]!.hidden).toBe(true);
  });

  it('respects defaultHiddenSeries on mount', () => {
    render(
      <ChartLineAreaGradient
        series={FIXTURE}
        defaultHiddenSeries={['a']}
      />,
    );
    const item = document.querySelector(
      '[data-section="chart-line-area-gradient-legend-item"][data-series-id="a"]',
    )!;
    expect(item.getAttribute('data-hidden')).toBe('true');
  });

  it('shows tooltip on dot hover', () => {
    render(<ChartLineAreaGradient series={FIXTURE} />);
    const dot = document.querySelectorAll(
      '[data-section="chart-line-area-gradient-dot"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(dot);
    const tip = document.querySelector(
      '[data-section="chart-line-area-gradient-tooltip"]',
    );
    expect(tip).not.toBeNull();
    expect(tip!.textContent).toContain('Revenue');
  });

  it('hides tooltip on mouse leave', () => {
    render(<ChartLineAreaGradient series={FIXTURE} />);
    const dot = document.querySelectorAll(
      '[data-section="chart-line-area-gradient-dot"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(dot);
    fireEvent.mouseLeave(dot);
    expect(
      document.querySelector(
        '[data-section="chart-line-area-gradient-tooltip"]',
      ),
    ).toBeNull();
  });

  it('fires onPointClick with series + point', () => {
    const handler = vi.fn();
    render(
      <ChartLineAreaGradient series={FIXTURE} onPointClick={handler} />,
    );
    const dot = document.querySelectorAll(
      '[data-section="chart-line-area-gradient-dot"]',
    )[0] as SVGElement;
    fireEvent.click(dot);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0]!.series.id).toBe('a');
  });

  it('hides axis when showAxis=false', () => {
    render(<ChartLineAreaGradient series={FIXTURE} showAxis={false} />);
    expect(
      document.querySelector('[data-section="chart-line-area-gradient-axes"]'),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    render(<ChartLineAreaGradient series={FIXTURE} showGrid={false} />);
    expect(
      document.querySelector('[data-section="chart-line-area-gradient-grid"]'),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    render(<ChartLineAreaGradient series={FIXTURE} showLegend={false} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-area-gradient-legend"]',
      ),
    ).toBeNull();
  });

  it('renders baseline guideline when showBaseline=true', () => {
    render(
      <ChartLineAreaGradient
        series={FIXTURE}
        baseline={50}
        showBaseline
      />,
    );
    const baseline = document.querySelector(
      '[data-section="chart-line-area-gradient-baseline"]',
    );
    expect(baseline).not.toBeNull();
    expect(baseline!.getAttribute('data-baseline-value')).toBe('50');
  });

  it('omits baseline guideline by default', () => {
    render(<ChartLineAreaGradient series={FIXTURE} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-area-gradient-baseline"]',
      ),
    ).toBeNull();
  });

  it('applies the animate flag to the data attribute', () => {
    render(<ChartLineAreaGradient series={FIXTURE} animate={false} />);
    const root = document.querySelector(
      '[data-section="chart-line-area-gradient"]',
    )!;
    expect(root.getAttribute('data-animate')).toBe('false');
  });

  it('renders optional axis labels', () => {
    render(
      <ChartLineAreaGradient series={FIXTURE} xLabel="t" yLabel="signal" />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-area-gradient-x-label"]',
      )?.textContent,
    ).toBe('t');
    expect(
      document.querySelector(
        '[data-section="chart-line-area-gradient-y-label"]',
      )?.textContent,
    ).toBe('signal');
  });

  it('uses formatValue / formatX for axis ticks', () => {
    render(
      <ChartLineAreaGradient
        series={FIXTURE}
        formatValue={(n) => `y${n}`}
        formatX={(n) => `x${n}`}
      />,
    );
    const xLabel = document.querySelector(
      '[data-section="chart-line-area-gradient-tick-label"][data-axis="x"]',
    );
    const yLabel = document.querySelector(
      '[data-section="chart-line-area-gradient-tick-label"][data-axis="y"]',
    );
    expect(xLabel?.textContent?.startsWith('x')).toBe(true);
    expect(yLabel?.textContent?.startsWith('y')).toBe(true);
  });

  it('overrides default colour via series.color', () => {
    render(
      <ChartLineAreaGradient
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
      '[data-section="chart-line-area-gradient-series-group"]',
    )!;
    expect(grp.getAttribute('data-series-color')).toBe('#abcdef');
  });

  it('uses fillColor when set, separate from stroke color', () => {
    render(
      <ChartLineAreaGradient
        series={[
          {
            id: 'a',
            label: 'A',
            data: [
              { x: 0, y: 0 },
              { x: 1, y: 1 },
            ],
            color: '#aaa',
            fillColor: '#bbb',
          },
        ]}
      />,
    );
    const grp = document.querySelector(
      '[data-section="chart-line-area-gradient-series-group"]',
    )!;
    expect(grp.getAttribute('data-series-fill-color')).toBe('#bbb');
    const stops = document.querySelectorAll(
      '[data-section="chart-line-area-gradient-gradient-def"] stop',
    );
    expect(stops[0]!.getAttribute('stop-color')).toBe('#bbb');
    expect(stops[1]!.getAttribute('stop-color')).toBe('#bbb');
  });

  it('exposes dot data attrs', () => {
    render(<ChartLineAreaGradient series={FIXTURE} />);
    const dot = document.querySelectorAll(
      '[data-section="chart-line-area-gradient-dot"]',
    )[0] as SVGElement;
    expect(dot.getAttribute('data-x')).toBe('0');
    expect(dot.getAttribute('data-y')).toBe('100');
    expect(dot.getAttribute('data-series-id')).toBe('a');
  });

  it('renders empty state when no series', () => {
    render(<ChartLineAreaGradient series={[]} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-area-gradient-path"]',
      ).length,
    ).toBe(0);
    expect(
      document.querySelector(
        '[data-section="chart-line-area-gradient-aria-desc"]',
      )?.textContent,
    ).toBe('No data');
  });

  it('keyboard focus on a dot opens the tooltip', () => {
    render(<ChartLineAreaGradient series={FIXTURE} />);
    const dot = document.querySelectorAll(
      '[data-section="chart-line-area-gradient-dot"]',
    )[0] as SVGElement;
    fireEvent.focus(dot);
    expect(
      document.querySelector(
        '[data-section="chart-line-area-gradient-tooltip"]',
      ),
    ).not.toBeNull();
  });

  it('sets data-hovered on the hovered dot and parent series group', () => {
    render(<ChartLineAreaGradient series={FIXTURE} />);
    const dot = document.querySelectorAll(
      '[data-section="chart-line-area-gradient-dot"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(dot);
    expect(dot.getAttribute('data-hovered')).toBe('true');
    const grp = document.querySelector(
      '[data-section="chart-line-area-gradient-series-group"][data-series-id="a"]',
    )!;
    expect(grp.getAttribute('data-hovered')).toBe('true');
  });

  it('renders grid lines per tick when showGrid=true', () => {
    render(<ChartLineAreaGradient series={FIXTURE} tickCount={4} />);
    const lines = document.querySelectorAll(
      '[data-section="chart-line-area-gradient-grid-line"]',
    );
    expect(lines.length).toBeGreaterThan(0);
  });

  it('renders multi-series with one gradient + area per series', () => {
    const fixture: ChartLineAreaGradientSeries[] = [
      {
        id: 'a',
        label: 'A',
        data: [
          { x: 0, y: 5 },
          { x: 1, y: 10 },
        ],
      },
      {
        id: 'b',
        label: 'B',
        data: [
          { x: 0, y: 2 },
          { x: 1, y: 8 },
        ],
      },
    ];
    render(<ChartLineAreaGradient series={fixture} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-area-gradient-gradient-def"]',
      ).length,
    ).toBe(2);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-area-gradient-area"]',
      ).length,
    ).toBe(2);
  });
});
