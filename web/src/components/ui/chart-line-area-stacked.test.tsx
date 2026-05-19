import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

import {
  ChartLineAreaStacked,
  DEFAULT_CHART_LINE_AREA_STACKED_WIDTH,
  DEFAULT_CHART_LINE_AREA_STACKED_HEIGHT,
  DEFAULT_CHART_LINE_AREA_STACKED_PADDING,
  DEFAULT_CHART_LINE_AREA_STACKED_TICK_COUNT,
  DEFAULT_CHART_LINE_AREA_STACKED_STROKE_WIDTH,
  DEFAULT_CHART_LINE_AREA_STACKED_DOT_RADIUS,
  DEFAULT_CHART_LINE_AREA_STACKED_LINE_OPACITY,
  DEFAULT_CHART_LINE_AREA_STACKED_AREA_OPACITY,
  DEFAULT_CHART_LINE_AREA_STACKED_GRID_COLOR,
  DEFAULT_CHART_LINE_AREA_STACKED_AXIS_COLOR,
  DEFAULT_CHART_LINE_AREA_STACKED_STACK_MODE,
  DEFAULT_CHART_LINE_AREA_STACKED_PALETTE,
  buildLineAreaStackedYLookup,
  collectLineAreaStackedXValues,
  computeLineAreaStackedLayout,
  describeLineAreaStackedChart,
  getLineAreaStackedDefaultColor,
  getLineAreaStackedFinitePoints,
  type ChartLineAreaStackedSeries,
} from './chart-line-area-stacked';

afterEach(() => {
  cleanup();
});

describe('chart-line-area-stacked / constants', () => {
  it('exports sensible defaults', () => {
    expect(DEFAULT_CHART_LINE_AREA_STACKED_WIDTH).toBe(560);
    expect(DEFAULT_CHART_LINE_AREA_STACKED_HEIGHT).toBe(320);
    expect(DEFAULT_CHART_LINE_AREA_STACKED_PADDING).toBe(40);
    expect(DEFAULT_CHART_LINE_AREA_STACKED_TICK_COUNT).toBe(5);
    expect(DEFAULT_CHART_LINE_AREA_STACKED_STROKE_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_AREA_STACKED_DOT_RADIUS).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_AREA_STACKED_LINE_OPACITY).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_AREA_STACKED_AREA_OPACITY).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_AREA_STACKED_AREA_OPACITY).toBeLessThanOrEqual(1);
    expect(DEFAULT_CHART_LINE_AREA_STACKED_GRID_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_LINE_AREA_STACKED_AXIS_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_LINE_AREA_STACKED_STACK_MODE).toBe('absolute');
    expect(DEFAULT_CHART_LINE_AREA_STACKED_PALETTE).toHaveLength(10);
  });
});

describe('chart-line-area-stacked / getLineAreaStackedDefaultColor', () => {
  it('wraps with modulo', () => {
    expect(getLineAreaStackedDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_AREA_STACKED_PALETTE[0],
    );
    expect(getLineAreaStackedDefaultColor(10)).toBe(
      DEFAULT_CHART_LINE_AREA_STACKED_PALETTE[0],
    );
  });

  it('falls back to first colour for invalid indices', () => {
    expect(getLineAreaStackedDefaultColor(-1)).toBe(
      DEFAULT_CHART_LINE_AREA_STACKED_PALETTE[0],
    );
    expect(getLineAreaStackedDefaultColor(NaN)).toBe(
      DEFAULT_CHART_LINE_AREA_STACKED_PALETTE[0],
    );
  });
});

describe('chart-line-area-stacked / getLineAreaStackedFinitePoints', () => {
  it('drops points with non-finite x or y', () => {
    expect(
      getLineAreaStackedFinitePoints([
        { x: 1, y: 1 },
        { x: NaN, y: 2 },
        { x: 3, y: Infinity },
        { x: 4, y: 4 },
      ]).map((p) => p.x),
    ).toEqual([1, 4]);
  });

  it('returns [] for non-array input', () => {
    expect(
      getLineAreaStackedFinitePoints(null as unknown as never[]),
    ).toEqual([]);
  });
});

describe('chart-line-area-stacked / collectLineAreaStackedXValues', () => {
  it('returns [] for empty input', () => {
    expect(collectLineAreaStackedXValues([])).toEqual([]);
  });

  it('dedupes and sorts x values across visible series', () => {
    expect(
      collectLineAreaStackedXValues([
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: 1 },
            { x: 2, y: 1 },
            { x: 4, y: 1 },
          ],
        },
        {
          id: 'b',
          label: 'B',
          data: [
            { x: 1, y: 1 },
            { x: 2, y: 1 },
            { x: 3, y: 1 },
          ],
        },
      ]),
    ).toEqual([0, 1, 2, 3, 4]);
  });

  it('excludes hidden series', () => {
    expect(
      collectLineAreaStackedXValues(
        [
          { id: 'a', label: 'A', data: [{ x: 1, y: 1 }] },
          { id: 'b', label: 'B', data: [{ x: 99, y: 1 }] },
        ],
        ['b'],
      ),
    ).toEqual([1]);
  });
});

describe('chart-line-area-stacked / buildLineAreaStackedYLookup', () => {
  it('returns a finite-only lookup', () => {
    const out = buildLineAreaStackedYLookup({
      id: 'a',
      label: 'A',
      data: [
        { x: 1, y: 10 },
        { x: 2, y: 20 },
        { x: NaN, y: 99 },
      ],
    });
    expect(out.get(1)).toBe(10);
    expect(out.get(2)).toBe(20);
    expect(out.size).toBe(2);
  });
});

describe('chart-line-area-stacked / computeLineAreaStackedLayout', () => {
  it('returns empty when canvas is degenerate', () => {
    expect(
      computeLineAreaStackedLayout({
        series: [{ id: 'a', label: 'A', data: [{ x: 1, y: 1 }] }],
        width: 10,
        height: 10,
        padding: 100,
      }).series,
    ).toEqual([]);
  });

  it('returns empty when no series', () => {
    expect(
      computeLineAreaStackedLayout({
        series: [],
        width: 500,
        height: 200,
        padding: 20,
      }).series,
    ).toEqual([]);
  });

  it('returns empty when every series is hidden', () => {
    expect(
      computeLineAreaStackedLayout({
        series: [{ id: 'a', label: 'A', data: [{ x: 1, y: 1 }] }],
        hidden: ['a'],
        width: 500,
        height: 200,
        padding: 20,
      }).series,
    ).toEqual([]);
  });

  it('records stackMode and xUnion in the layout', () => {
    const out = computeLineAreaStackedLayout({
      series: [
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
            { x: 0, y: 3 },
            { x: 1, y: 4 },
          ],
        },
      ],
      stackMode: 'absolute',
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.stackMode).toBe('absolute');
    expect(out.xUnion).toEqual([0, 1]);
    expect(out.totals).toEqual([4, 6]);
  });

  it('stacks layers so layer N bottom = layer N-1 top (absolute)', () => {
    const out = computeLineAreaStackedLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: 10 },
            { x: 1, y: 20 },
          ],
        },
        {
          id: 'b',
          label: 'B',
          data: [
            { x: 0, y: 5 },
            { x: 1, y: 15 },
          ],
        },
      ],
      stackMode: 'absolute',
      width: 500,
      height: 200,
      padding: 40,
    });
    const a = out.series[0]!;
    const b = out.series[1]!;
    expect(a.points[0]!.yBottom).toBe(0);
    expect(a.points[0]!.yTop).toBe(10);
    expect(b.points[0]!.yBottom).toBe(10);
    expect(b.points[0]!.yTop).toBe(15);
    expect(a.points[1]!.yTop).toBe(20);
    expect(b.points[1]!.yBottom).toBe(20);
    expect(b.points[1]!.yTop).toBe(35);
  });

  it('peak total drives auto yMax in absolute mode', () => {
    const out = computeLineAreaStackedLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: 10 },
            { x: 1, y: 30 },
          ],
        },
        {
          id: 'b',
          label: 'B',
          data: [
            { x: 0, y: 5 },
            { x: 1, y: 15 },
          ],
        },
      ],
      stackMode: 'absolute',
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.yMax).toBe(45);
    expect(out.yMin).toBe(0);
  });

  it('normalises per-x in percent mode (sum of layer top = 1)', () => {
    const out = computeLineAreaStackedLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: 1 },
            { x: 1, y: 9 },
          ],
        },
        {
          id: 'b',
          label: 'B',
          data: [
            { x: 0, y: 3 },
            { x: 1, y: 1 },
          ],
        },
      ],
      stackMode: 'percent',
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.yMin).toBe(0);
    expect(out.yMax).toBe(1);
    const lastLayer = out.series[out.series.length - 1]!;
    // At each x, last layer's top should be 1.
    expect(lastLayer.points[0]!.yTop).toBeCloseTo(1, 6);
    expect(lastLayer.points[1]!.yTop).toBeCloseTo(1, 6);
  });

  it('percent share matches yTop - yBottom', () => {
    const out = computeLineAreaStackedLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: 1 },
            { x: 1, y: 3 },
          ],
        },
        {
          id: 'b',
          label: 'B',
          data: [
            { x: 0, y: 3 },
            { x: 1, y: 1 },
          ],
        },
      ],
      stackMode: 'percent',
      width: 500,
      height: 200,
      padding: 40,
    });
    for (const s of out.series) {
      for (const p of s.points) {
        expect(p.yTop - p.yBottom).toBeCloseTo(p.share, 6);
      }
    }
  });

  it('percent mode with zero total at an x leaves layer collapsed', () => {
    const out = computeLineAreaStackedLayout({
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
      stackMode: 'percent',
      width: 500,
      height: 200,
      padding: 40,
    });
    const layer = out.series[0]!;
    expect(layer.points[0]!.yTop).toBe(layer.points[0]!.yBottom);
    expect(layer.points[0]!.share).toBe(0);
    expect(layer.points[1]!.share).toBeCloseTo(1, 6);
  });

  it('zero-fills missing x values in a series', () => {
    const out = computeLineAreaStackedLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: 5 },
            { x: 2, y: 7 },
          ],
        },
        {
          id: 'b',
          label: 'B',
          data: [
            { x: 1, y: 3 },
          ],
        },
      ],
      stackMode: 'absolute',
      width: 500,
      height: 200,
      padding: 40,
    });
    // xUnion = [0, 1, 2]; A contributes [5, 0, 7]; B contributes [0, 3, 0].
    expect(out.xUnion).toEqual([0, 1, 2]);
    expect(out.series[0]!.points.map((p) => p.yRaw)).toEqual([5, 0, 7]);
    expect(out.series[1]!.points.map((p) => p.yRaw)).toEqual([0, 3, 0]);
    expect(out.totals).toEqual([5, 3, 7]);
  });

  it('treats negative contributions as 0', () => {
    const out = computeLineAreaStackedLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: -5 },
            { x: 1, y: 10 },
          ],
        },
      ],
      stackMode: 'absolute',
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.series[0]!.points[0]!.yRaw).toBe(0);
    expect(out.series[0]!.points[1]!.yRaw).toBe(10);
  });

  it('builds linePath + areaPath per layer', () => {
    const out = computeLineAreaStackedLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: 1 },
            { x: 1, y: 2 },
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

  it('records series index across hidden-series filter', () => {
    const out = computeLineAreaStackedLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: 1 },
            { x: 1, y: 1 },
          ],
        },
        {
          id: 'b',
          label: 'B',
          data: [
            { x: 0, y: 1 },
            { x: 1, y: 1 },
          ],
        },
        {
          id: 'c',
          label: 'C',
          data: [
            { x: 0, y: 1 },
            { x: 1, y: 1 },
          ],
        },
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
    const out = computeLineAreaStackedLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: 10 },
            { x: 1, y: 5 },
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

describe('chart-line-area-stacked / describeLineAreaStackedChart', () => {
  it('returns "No data" when empty', () => {
    expect(describeLineAreaStackedChart([])).toBe('No data');
  });

  it('returns "No data" when no finite points', () => {
    expect(
      describeLineAreaStackedChart([
        {
          id: 'a',
          label: 'A',
          data: [{ x: NaN, y: 1 } as { x: number; y: number }],
        },
      ]),
    ).toBe('No data');
  });

  it('summarises with stack mode and counts', () => {
    const out = describeLineAreaStackedChart(
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
            { x: 0, y: 3 },
            { x: 1, y: 4 },
          ],
        },
      ],
      [],
      'percent',
    );
    expect(out).toContain('percent');
    expect(out).toContain('2 series');
    expect(out).toContain('4 points');
    expect(out).toContain('2 x samples');
  });

  it('excludes hidden series from the count', () => {
    const out = describeLineAreaStackedChart(
      [
        {
          id: 'a',
          label: 'A',
          data: [{ x: 0, y: 1 }],
        },
        {
          id: 'b',
          label: 'B',
          data: [{ x: 0, y: 5 }],
        },
      ],
      ['b'],
    );
    expect(out).toContain('1 series');
  });
});

const FIXTURE: ChartLineAreaStackedSeries[] = [
  {
    id: 'a',
    label: 'Free',
    data: [
      { x: 0, y: 5 },
      { x: 1, y: 6 },
      { x: 2, y: 8 },
      { x: 3, y: 9 },
    ],
  },
  {
    id: 'b',
    label: 'Pro',
    data: [
      { x: 0, y: 2 },
      { x: 1, y: 4 },
      { x: 2, y: 7 },
      { x: 3, y: 12 },
    ],
  },
  {
    id: 'c',
    label: 'Enterprise',
    data: [
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 4 },
    ],
  },
];

describe('chart-line-area-stacked / <ChartLineAreaStacked>', () => {
  it('renders a root region with the default aria label', () => {
    render(<ChartLineAreaStacked series={FIXTURE} />);
    const root = document.querySelector(
      '[data-section="chart-line-area-stacked"]',
    )!;
    expect(root.getAttribute('aria-label')).toBe(
      'Stacked line + area chart',
    );
  });

  it('exposes stackMode + counts as data attrs', () => {
    render(<ChartLineAreaStacked series={FIXTURE} stackMode="percent" />);
    const root = document.querySelector(
      '[data-section="chart-line-area-stacked"]',
    )!;
    expect(root.getAttribute('data-stack-mode')).toBe('percent');
    expect(root.getAttribute('data-series-count')).toBe('3');
    expect(root.getAttribute('data-visible-series-count')).toBe('3');
    expect(root.getAttribute('data-x-union-count')).toBe('4');
  });

  it('renders an aria description with summary text', () => {
    render(<ChartLineAreaStacked series={FIXTURE} stackMode="percent" />);
    expect(
      document.querySelector(
        '[data-section="chart-line-area-stacked-aria-desc"]',
      )?.textContent ?? '',
    ).toContain('percent');
  });

  it('respects a custom aria description', () => {
    render(
      <ChartLineAreaStacked series={FIXTURE} ariaDescription="custom" />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-area-stacked-aria-desc"]',
      )?.textContent,
    ).toBe('custom');
  });

  it('renders one area + one line per visible series', () => {
    render(<ChartLineAreaStacked series={FIXTURE} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-area-stacked-area"]',
      ).length,
    ).toBe(3);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-area-stacked-path"]',
      ).length,
    ).toBe(3);
  });

  it('renders one dot per finite point when showDots=true', () => {
    render(<ChartLineAreaStacked series={FIXTURE} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-area-stacked-dot"]',
      ).length,
    ).toBe(12); // 3 series * 4 finite points each
  });

  it('omits dots when showDots=false', () => {
    render(<ChartLineAreaStacked series={FIXTURE} showDots={false} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-area-stacked-dot"]',
      ).length,
    ).toBe(0);
  });

  it('renders a legend item per series', () => {
    render(<ChartLineAreaStacked series={FIXTURE} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-area-stacked-legend-item"]',
      ).length,
    ).toBe(3);
  });

  it('toggles hidden state via legend (uncontrolled)', () => {
    render(<ChartLineAreaStacked series={FIXTURE} />);
    const btn = document.querySelector(
      '[data-section="chart-line-area-stacked-legend-item"][data-series-id="a"] [data-section="chart-line-area-stacked-legend-button"]',
    ) as HTMLElement;
    fireEvent.click(btn);
    const item = document.querySelector(
      '[data-section="chart-line-area-stacked-legend-item"][data-series-id="a"]',
    )!;
    expect(item.getAttribute('data-hidden')).toBe('true');
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-area-stacked-area"][data-series-id="a"]',
      ).length,
    ).toBe(0);
  });

  it('does not mutate hiddenSeries when controlled', () => {
    const handler = vi.fn();
    render(
      <ChartLineAreaStacked
        series={FIXTURE}
        hiddenSeries={[]}
        onHiddenSeriesChange={handler}
      />,
    );
    const btn = document.querySelector(
      '[data-section="chart-line-area-stacked-legend-item"][data-series-id="a"] [data-section="chart-line-area-stacked-legend-button"]',
    ) as HTMLElement;
    fireEvent.click(btn);
    expect(handler).toHaveBeenCalledWith(['a']);
  });

  it('fires onSeriesToggle with the hidden flag', () => {
    const handler = vi.fn();
    render(
      <ChartLineAreaStacked series={FIXTURE} onSeriesToggle={handler} />,
    );
    const btn = document.querySelector(
      '[data-section="chart-line-area-stacked-legend-item"][data-series-id="a"] [data-section="chart-line-area-stacked-legend-button"]',
    ) as HTMLElement;
    fireEvent.click(btn);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0]!.hidden).toBe(true);
  });

  it('respects defaultHiddenSeries on mount', () => {
    render(
      <ChartLineAreaStacked
        series={FIXTURE}
        defaultHiddenSeries={['a']}
      />,
    );
    const item = document.querySelector(
      '[data-section="chart-line-area-stacked-legend-item"][data-series-id="a"]',
    )!;
    expect(item.getAttribute('data-hidden')).toBe('true');
  });

  it('shows tooltip on dot hover with share row', () => {
    render(<ChartLineAreaStacked series={FIXTURE} />);
    const dot = document.querySelectorAll(
      '[data-section="chart-line-area-stacked-dot"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(dot);
    const tip = document.querySelector(
      '[data-section="chart-line-area-stacked-tooltip"]',
    );
    expect(tip).not.toBeNull();
    expect(tip!.textContent).toContain('Free');
    const share = document.querySelector(
      '[data-section="chart-line-area-stacked-tooltip-share"]',
    );
    expect(share).not.toBeNull();
    expect(share!.textContent).toContain('share');
  });

  it('hides tooltip on mouse leave', () => {
    render(<ChartLineAreaStacked series={FIXTURE} />);
    const dot = document.querySelector(
      '[data-section="chart-line-area-stacked-dot"]',
    ) as SVGElement;
    fireEvent.mouseEnter(dot);
    fireEvent.mouseLeave(dot);
    expect(
      document.querySelector(
        '[data-section="chart-line-area-stacked-tooltip"]',
      ),
    ).toBeNull();
  });

  it('fires onPointClick with series + point', () => {
    const handler = vi.fn();
    render(
      <ChartLineAreaStacked series={FIXTURE} onPointClick={handler} />,
    );
    const dot = document.querySelectorAll(
      '[data-section="chart-line-area-stacked-dot"]',
    )[0] as SVGElement;
    fireEvent.click(dot);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0]!.series.id).toBe('a');
    expect(typeof handler.mock.calls[0]![0]!.point.share).toBe('number');
  });

  it('hides axis when showAxis=false', () => {
    render(<ChartLineAreaStacked series={FIXTURE} showAxis={false} />);
    expect(
      document.querySelector('[data-section="chart-line-area-stacked-axes"]'),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    render(<ChartLineAreaStacked series={FIXTURE} showGrid={false} />);
    expect(
      document.querySelector('[data-section="chart-line-area-stacked-grid"]'),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    render(<ChartLineAreaStacked series={FIXTURE} showLegend={false} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-area-stacked-legend"]',
      ),
    ).toBeNull();
  });

  it('hides tooltip when showTooltip=false', () => {
    render(<ChartLineAreaStacked series={FIXTURE} showTooltip={false} />);
    const dot = document.querySelector(
      '[data-section="chart-line-area-stacked-dot"]',
    ) as SVGElement;
    fireEvent.mouseEnter(dot);
    expect(
      document.querySelector(
        '[data-section="chart-line-area-stacked-tooltip"]',
      ),
    ).toBeNull();
  });

  it('applies the animate flag to the data attribute', () => {
    render(<ChartLineAreaStacked series={FIXTURE} animate={false} />);
    const root = document.querySelector(
      '[data-section="chart-line-area-stacked"]',
    )!;
    expect(root.getAttribute('data-animate')).toBe('false');
  });

  it('formats y axis as percent in percent mode', () => {
    render(<ChartLineAreaStacked series={FIXTURE} stackMode="percent" />);
    const yLabel = document.querySelector(
      '[data-section="chart-line-area-stacked-tick-label"][data-axis="y"]',
    );
    expect(yLabel?.textContent).toMatch(/%$/);
  });

  it('uses formatValue for absolute y axis ticks', () => {
    render(
      <ChartLineAreaStacked
        series={FIXTURE}
        stackMode="absolute"
        formatValue={(n) => `${n}u`}
      />,
    );
    const yLabel = document.querySelector(
      '[data-section="chart-line-area-stacked-tick-label"][data-axis="y"]',
    );
    expect(yLabel?.textContent?.endsWith('u')).toBe(true);
  });

  it('overrides default colour via series.color', () => {
    render(
      <ChartLineAreaStacked
        series={[
          {
            id: 'a',
            label: 'A',
            data: [
              { x: 0, y: 1 },
              { x: 1, y: 1 },
            ],
            color: '#abcdef',
          },
        ]}
      />,
    );
    const grp = document.querySelector(
      '[data-section="chart-line-area-stacked-series-group"]',
    )!;
    expect(grp.getAttribute('data-series-color')).toBe('#abcdef');
  });

  it('exposes per-dot stacked coordinates as data attrs', () => {
    render(<ChartLineAreaStacked series={FIXTURE} />);
    const dot = document.querySelector(
      '[data-section="chart-line-area-stacked-dot"][data-series-id="a"]',
    ) as SVGElement;
    expect(dot.getAttribute('data-x')).toBe('0');
    expect(dot.getAttribute('data-y-raw')).toBe('5');
    expect(dot.getAttribute('data-y-bottom')).toBe('0');
    expect(dot.getAttribute('data-y-top')).toBe('5');
    expect(typeof dot.getAttribute('data-share')).toBe('string');
  });

  it('renders empty state when no series', () => {
    render(<ChartLineAreaStacked series={[]} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-area-stacked-area"]',
      ).length,
    ).toBe(0);
    expect(
      document.querySelector(
        '[data-section="chart-line-area-stacked-aria-desc"]',
      )?.textContent,
    ).toBe('No data');
  });

  it('sets data-hovered on the hovered dot and parent series group', () => {
    render(<ChartLineAreaStacked series={FIXTURE} />);
    const dot = document.querySelectorAll(
      '[data-section="chart-line-area-stacked-dot"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(dot);
    expect(dot.getAttribute('data-hovered')).toBe('true');
    const grp = document.querySelector(
      '[data-section="chart-line-area-stacked-series-group"][data-series-id="a"]',
    )!;
    expect(grp.getAttribute('data-hovered')).toBe('true');
  });

  it('renders grid lines per tick when showGrid=true', () => {
    render(<ChartLineAreaStacked series={FIXTURE} tickCount={4} />);
    const lines = document.querySelectorAll(
      '[data-section="chart-line-area-stacked-grid-line"]',
    );
    expect(lines.length).toBeGreaterThan(0);
  });

  it('renders optional axis labels', () => {
    render(
      <ChartLineAreaStacked series={FIXTURE} xLabel="t" yLabel="seats" />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-area-stacked-x-label"]',
      )?.textContent,
    ).toBe('t');
    expect(
      document.querySelector(
        '[data-section="chart-line-area-stacked-y-label"]',
      )?.textContent,
    ).toBe('seats');
  });

  it('switches y axis from raw to percent when stackMode changes', () => {
    const { rerender } = render(
      <ChartLineAreaStacked series={FIXTURE} stackMode="absolute" />,
    );
    const absLabel = document.querySelector(
      '[data-section="chart-line-area-stacked-tick-label"][data-axis="y"]',
    );
    expect(absLabel?.textContent?.endsWith('%')).toBe(false);
    rerender(
      <ChartLineAreaStacked series={FIXTURE} stackMode="percent" />,
    );
    const pctLabel = document.querySelector(
      '[data-section="chart-line-area-stacked-tick-label"][data-axis="y"]',
    );
    expect(pctLabel?.textContent?.endsWith('%')).toBe(true);
  });
});
