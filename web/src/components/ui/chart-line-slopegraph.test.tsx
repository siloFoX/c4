import { afterEach, describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import {
  ChartLineSlopegraph,
  DEFAULT_CHART_LINE_SLOPEGRAPH_DOWN_COLOR,
  DEFAULT_CHART_LINE_SLOPEGRAPH_HEIGHT,
  DEFAULT_CHART_LINE_SLOPEGRAPH_PADDING,
  DEFAULT_CHART_LINE_SLOPEGRAPH_PALETTE,
  DEFAULT_CHART_LINE_SLOPEGRAPH_UP_COLOR,
  DEFAULT_CHART_LINE_SLOPEGRAPH_WIDTH,
  computeLineSlopegraphLayout,
  describeLineSlopegraphChart,
  getLineSlopegraphDefaultColor,
  getLineSlopegraphDirection,
  getLineSlopegraphFinitePoints,
  resolveLineSlopegraphEndpoints,
  runLineSlopegraph,
  type ChartLineSlopegraphSeries,
} from './chart-line-slopegraph';

afterEach(() => {
  cleanup();
});

// 3 series, aligned x 0..3. A rises, B falls, C is flat.
const SERIES: ChartLineSlopegraphSeries[] = [
  {
    id: 'a',
    label: 'A',
    data: [
      { x: 0, value: 10 },
      { x: 1, value: 12 },
      { x: 2, value: 11 },
      { x: 3, value: 20 },
    ],
  },
  {
    id: 'b',
    label: 'B',
    data: [
      { x: 0, value: 30 },
      { x: 1, value: 25 },
      { x: 2, value: 22 },
      { x: 3, value: 15 },
    ],
  },
  {
    id: 'c',
    label: 'C',
    data: [
      { x: 0, value: 18 },
      { x: 1, value: 18 },
      { x: 2, value: 18 },
      { x: 3, value: 18 },
    ],
  },
];
// A spans 0..3, D only reaches x=1 -> D is incomplete at endX=3
const INCOMPLETE: ChartLineSlopegraphSeries[] = [
  SERIES[0]!,
  {
    id: 'd',
    label: 'D',
    data: [
      { x: 0, value: 5 },
      { x: 1, value: 7 },
    ],
  },
];
// every point shares the same x -> no two-endpoint window
const ONE_X: ChartLineSlopegraphSeries[] = [
  { id: 'a', label: 'A', data: [{ x: 0, value: 1 }] },
  { id: 'b', label: 'B', data: [{ x: 0, value: 2 }] },
];

describe('chart-line-slopegraph defaults', () => {
  it('positive size defaults', () => {
    expect(DEFAULT_CHART_LINE_SLOPEGRAPH_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_SLOPEGRAPH_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_SLOPEGRAPH_PADDING).toBeGreaterThan(0);
  });
  it('palette has 10 colours', () => {
    expect(DEFAULT_CHART_LINE_SLOPEGRAPH_PALETTE.length).toBe(10);
  });
});

describe('getLineSlopegraphDefaultColor', () => {
  it('cycles through the palette', () => {
    const len = DEFAULT_CHART_LINE_SLOPEGRAPH_PALETTE.length;
    expect(getLineSlopegraphDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_SLOPEGRAPH_PALETTE[0],
    );
    expect(getLineSlopegraphDefaultColor(len + 2)).toBe(
      DEFAULT_CHART_LINE_SLOPEGRAPH_PALETTE[2],
    );
  });
  it('handles non-finite and negative', () => {
    expect(getLineSlopegraphDefaultColor(NaN)).toBe(
      DEFAULT_CHART_LINE_SLOPEGRAPH_PALETTE[0],
    );
    expect(getLineSlopegraphDefaultColor(-1)).toBe(
      DEFAULT_CHART_LINE_SLOPEGRAPH_PALETTE[0],
    );
  });
});

describe('getLineSlopegraphFinitePoints', () => {
  it('drops points with non-finite x or value', () => {
    const r = getLineSlopegraphFinitePoints([
      { x: 0, value: 0 },
      { x: NaN, value: 1 },
      { x: 1, value: Infinity },
      { x: 2, value: 4 },
    ]);
    expect(r.length).toBe(2);
  });
  it('null returns []', () => {
    expect(getLineSlopegraphFinitePoints(null)).toEqual([]);
  });
});

describe('getLineSlopegraphDirection', () => {
  it('classifies up / down / flat', () => {
    expect(getLineSlopegraphDirection(10, 20)).toBe('up');
    expect(getLineSlopegraphDirection(20, 10)).toBe('down');
    expect(getLineSlopegraphDirection(5, 5)).toBe('flat');
  });
  it('non-finite -> flat', () => {
    expect(getLineSlopegraphDirection(NaN, 1)).toBe('flat');
  });
});

describe('resolveLineSlopegraphEndpoints', () => {
  it('defaults to the global min / max x', () => {
    expect(resolveLineSlopegraphEndpoints(SERIES)).toEqual({
      startX: 0,
      endX: 3,
    });
  });
  it('uses explicit endpoints verbatim', () => {
    expect(resolveLineSlopegraphEndpoints(SERIES, 1, 2)).toEqual({
      startX: 1,
      endX: 2,
    });
  });
});

describe('runLineSlopegraph', () => {
  it('empty -> ok=false', () => {
    expect(runLineSlopegraph([]).ok).toBe(false);
  });
  it('single shared x -> ok=false (no window)', () => {
    expect(runLineSlopegraph(ONE_X).ok).toBe(false);
  });
  it('extracts start and end values at the endpoints', () => {
    const r = runLineSlopegraph(SERIES);
    expect(r.startX).toBe(0);
    expect(r.endX).toBe(3);
    expect(r.series[0]!.startValue).toBe(10);
    expect(r.series[0]!.endValue).toBe(20);
  });
  it('computes delta and direction per series', () => {
    const r = runLineSlopegraph(SERIES);
    expect(r.series[0]!.delta).toBe(10);
    expect(r.series[0]!.direction).toBe('up');
    expect(r.series[1]!.delta).toBe(-15);
    expect(r.series[1]!.direction).toBe('down');
    expect(r.series[2]!.direction).toBe('flat');
  });
  it('pctChange is delta over the absolute start value', () => {
    const r = runLineSlopegraph(SERIES);
    expect(r.series[0]!.pctChange).toBeCloseTo(1, 10); // 10 / 10
    expect(r.series[1]!.pctChange).toBeCloseTo(-0.5, 10); // -15 / 30
  });
  it('pctChange is NaN when the start value is 0', () => {
    const r = runLineSlopegraph([
      {
        id: 'z',
        label: 'Z',
        data: [
          { x: 0, value: 0 },
          { x: 3, value: 5 },
        ],
      },
    ]);
    expect(Number.isNaN(r.series[0]!.pctChange)).toBe(true);
  });
  it('counts rising / falling / flat series', () => {
    const r = runLineSlopegraph(SERIES);
    expect(r.risingCount).toBe(1);
    expect(r.fallingCount).toBe(1);
    expect(r.flatCount).toBe(1);
    expect(r.completeCount).toBe(3);
  });
  it('a series missing an endpoint is incomplete', () => {
    const r = runLineSlopegraph(INCOMPLETE);
    const d = r.series.find((s) => s.id === 'd')!;
    expect(d.complete).toBe(false);
    expect(r.completeCount).toBe(1);
  });
  it('honours explicit endpoints', () => {
    const r = runLineSlopegraph(SERIES, 1, 2);
    expect(r.series[0]!.startValue).toBe(12);
    expect(r.series[0]!.endValue).toBe(11);
    expect(r.series[0]!.direction).toBe('down');
  });
});

describe('computeLineSlopegraphLayout', () => {
  it('empty series -> ok=false', () => {
    const layout = computeLineSlopegraphLayout({
      series: [],
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.ok).toBe(false);
  });

  it('degenerate canvas -> ok=false', () => {
    const layout = computeLineSlopegraphLayout({
      series: SERIES,
      width: 20,
      height: 20,
      padding: 30,
    });
    expect(layout.ok).toBe(false);
  });

  it('single shared x -> ok=false', () => {
    const layout = computeLineSlopegraphLayout({
      series: ONE_X,
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.ok).toBe(false);
  });

  it('builds a slope path and a trajectory path per complete series', () => {
    const layout = computeLineSlopegraphLayout({
      series: SERIES,
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.ok).toBe(true);
    expect(layout.series[0]!.slopePath).toContain('M ');
    expect(layout.series[0]!.slopePath).toContain(' L ');
    expect(layout.series[0]!.trajectoryPath).toContain('M ');
  });

  it('places endpoint nodes on the two columns', () => {
    const layout = computeLineSlopegraphLayout({
      series: SERIES,
      width: 400,
      height: 200,
      padding: 30,
    });
    const s = layout.series[0]!;
    expect(s.startNode!.px).toBe(layout.leftColX);
    expect(s.endNode!.px).toBe(layout.rightColX);
  });

  it('exposes the resolved endpoints', () => {
    const layout = computeLineSlopegraphLayout({
      series: SERIES,
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.startX).toBe(0);
    expect(layout.endX).toBe(3);
  });

  it('the y range covers every finite value', () => {
    const layout = computeLineSlopegraphLayout({
      series: SERIES,
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.yMin).toBe(10);
    expect(layout.yMax).toBe(30);
  });

  it('counts rising / falling / flat over visible series', () => {
    const layout = computeLineSlopegraphLayout({
      series: SERIES,
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.risingCount).toBe(1);
    expect(layout.fallingCount).toBe(1);
    expect(layout.flatCount).toBe(1);
    expect(layout.completeCount).toBe(3);
  });

  it('an incomplete series has no slope path', () => {
    const layout = computeLineSlopegraphLayout({
      series: INCOMPLETE,
      width: 400,
      height: 200,
      padding: 30,
    });
    const d = layout.series.find((s) => s.id === 'd')!;
    expect(d.complete).toBe(false);
    expect(d.slopePath).toBe('');
    expect(d.startNode).toBeNull();
  });

  it('hidden series are marked and excluded from counts', () => {
    const layout = computeLineSlopegraphLayout({
      series: SERIES,
      hiddenSeries: ['b'],
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.visibleSeriesCount).toBe(2);
    expect(layout.fallingCount).toBe(0); // B was the falling series
  });

  it('all series hidden -> ok=false', () => {
    const layout = computeLineSlopegraphLayout({
      series: SERIES,
      hiddenSeries: ['a', 'b', 'c'],
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.ok).toBe(false);
  });

  it('y bounds overrides honoured', () => {
    const layout = computeLineSlopegraphLayout({
      series: SERIES,
      width: 400,
      height: 200,
      padding: 30,
      yMin: -5,
      yMax: 99,
    });
    expect(layout.yMin).toBe(-5);
    expect(layout.yMax).toBe(99);
  });
});

describe('describeLineSlopegraphChart', () => {
  it('no data -> No data', () => {
    expect(describeLineSlopegraphChart([])).toBe('No data');
    expect(describeLineSlopegraphChart(null)).toBe('No data');
  });
  it('summary mentions slopegraph + rising + falling', () => {
    const s = describeLineSlopegraphChart(SERIES);
    expect(s).toContain('Slopegraph');
    expect(s).toContain('rising');
    expect(s).toContain('falling');
  });
  it('all series hidden -> No data', () => {
    expect(
      describeLineSlopegraphChart(SERIES, { hidden: ['a', 'b', 'c'] }),
    ).toBe('No data');
  });
});

describe('<ChartLineSlopegraph> render', () => {
  it('renders empty state with no series', () => {
    render(<ChartLineSlopegraph series={[]} />);
    expect(
      document
        .querySelector('[data-section="chart-line-slopegraph"]')!
        .getAttribute('data-empty'),
    ).toBe('true');
  });

  it('renders one slope line per complete series', () => {
    render(<ChartLineSlopegraph series={SERIES} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-slopegraph-slope-line"]',
      ).length,
    ).toBe(3);
  });

  it('renders a trajectory per series by default', () => {
    render(<ChartLineSlopegraph series={SERIES} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-slopegraph-trajectory"]',
      ).length,
    ).toBe(3);
  });

  it('hides the trajectory via showTrajectory=false', () => {
    render(<ChartLineSlopegraph series={SERIES} showTrajectory={false} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-slopegraph-trajectory"]',
      ),
    ).toBeNull();
  });

  it('renders two endpoint dots per complete series', () => {
    render(<ChartLineSlopegraph series={SERIES} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-slopegraph-endpoint"]',
      ).length,
    ).toBe(6);
  });

  it('hides endpoint dots via showEndpointDots=false', () => {
    render(
      <ChartLineSlopegraph series={SERIES} showEndpointDots={false} />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-slopegraph-endpoint"]',
      ),
    ).toBeNull();
  });

  it('renders endpoint value labels and hides them via prop', () => {
    const { rerender } = render(<ChartLineSlopegraph series={SERIES} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-slopegraph-endpoint-value"]',
      ).length,
    ).toBe(6);
    rerender(
      <ChartLineSlopegraph series={SERIES} showEndpointValues={false} />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-slopegraph-endpoint-value"]',
      ),
    ).toBeNull();
  });

  it('an incomplete series renders no slope line', () => {
    render(<ChartLineSlopegraph series={INCOMPLETE} />);
    // only A is complete
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-slopegraph-slope-line"]',
      ).length,
    ).toBe(1);
  });

  it('hides a series via hiddenSeries', () => {
    render(<ChartLineSlopegraph series={SERIES} hiddenSeries={['a']} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-slopegraph-series-group"][data-series-id="a"]',
      ),
    ).toBeNull();
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-slopegraph-slope-line"]',
      ).length,
    ).toBe(2);
  });

  it('renders two column guides and two column labels', () => {
    render(<ChartLineSlopegraph series={SERIES} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-slopegraph-column-guide"]',
      ).length,
    ).toBe(2);
    expect(
      document.querySelector(
        '[data-section="chart-line-slopegraph-column-label"][data-edge="start"]',
      )?.textContent,
    ).toBe('0');
    expect(
      document.querySelector(
        '[data-section="chart-line-slopegraph-column-label"][data-edge="end"]',
      )?.textContent,
    ).toBe('3');
  });

  it('config badge shows up / down / flat counts', () => {
    render(<ChartLineSlopegraph series={SERIES} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-slopegraph-badge-up"]',
      )?.textContent,
    ).toBe('up=1');
    expect(
      document.querySelector(
        '[data-section="chart-line-slopegraph-badge-down"]',
      )?.textContent,
    ).toBe('down=1');
    expect(
      document.querySelector(
        '[data-section="chart-line-slopegraph-badge-flat"]',
      )?.textContent,
    ).toBe('flat=1');
  });

  it('hides the config badge via showConfigBadge=false', () => {
    render(
      <ChartLineSlopegraph series={SERIES} showConfigBadge={false} />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-slopegraph-badge"]',
      ),
    ).toBeNull();
  });

  it('colorMode=series uses the palette colour', () => {
    render(<ChartLineSlopegraph series={SERIES} />);
    const line = document.querySelector(
      '[data-section="chart-line-slopegraph-slope-line"][data-series-id="a"]',
    );
    expect(line!.getAttribute('stroke')).toBe(
      DEFAULT_CHART_LINE_SLOPEGRAPH_PALETTE[0],
    );
  });

  it('colorMode=direction colours by up / down', () => {
    render(<ChartLineSlopegraph series={SERIES} colorMode="direction" />);
    expect(
      document
        .querySelector(
          '[data-section="chart-line-slopegraph-slope-line"][data-series-id="a"]',
        )!
        .getAttribute('stroke'),
    ).toBe(DEFAULT_CHART_LINE_SLOPEGRAPH_UP_COLOR);
    expect(
      document
        .querySelector(
          '[data-section="chart-line-slopegraph-slope-line"][data-series-id="b"]',
        )!
        .getAttribute('stroke'),
    ).toBe(DEFAULT_CHART_LINE_SLOPEGRAPH_DOWN_COLOR);
  });

  it('ARIA: region + img + sr-only desc', () => {
    render(<ChartLineSlopegraph series={SERIES} />);
    expect(
      document
        .querySelector('[data-section="chart-line-slopegraph"]')!
        .getAttribute('role'),
    ).toBe('region');
    expect(
      document
        .querySelector('[data-section="chart-line-slopegraph-svg"]')!
        .getAttribute('role'),
    ).toBe('img');
    expect(
      document.querySelector(
        '[data-section="chart-line-slopegraph-aria-desc"]',
      )!.textContent,
    ).toContain('Slopegraph');
  });

  it('root carries data-* attributes', () => {
    render(<ChartLineSlopegraph series={SERIES} />);
    const root = document.querySelector(
      '[data-section="chart-line-slopegraph"]',
    );
    expect(root!.getAttribute('data-series-count')).toBe('3');
    expect(root!.getAttribute('data-complete-count')).toBe('3');
    expect(root!.getAttribute('data-rising-count')).toBe('1');
    expect(root!.getAttribute('data-falling-count')).toBe('1');
    expect(root!.getAttribute('data-flat-count')).toBe('1');
    expect(Number(root!.getAttribute('data-start-x'))).toBe(0);
    expect(Number(root!.getAttribute('data-end-x'))).toBe(3);
  });

  it('series group exposes direction / delta attributes', () => {
    render(<ChartLineSlopegraph series={SERIES} />);
    const grp = document.querySelector(
      '[data-section="chart-line-slopegraph-series-group"][data-series-id="a"]',
    );
    expect(grp!.getAttribute('data-direction')).toBe('up');
    expect(grp!.getAttribute('data-complete')).toBe('true');
    expect(Number(grp!.getAttribute('data-delta'))).toBe(10);
  });

  it('tooltip on a slope line shows start + end + delta', () => {
    render(<ChartLineSlopegraph series={SERIES} />);
    const line = document.querySelector(
      '[data-section="chart-line-slopegraph-slope-line"][data-series-id="a"]',
    );
    fireEvent.mouseEnter(line!);
    expect(
      document.querySelector(
        '[data-section="chart-line-slopegraph-tooltip-start"]',
      )?.textContent,
    ).toBe('start: 10');
    expect(
      document.querySelector(
        '[data-section="chart-line-slopegraph-tooltip-end"]',
      )?.textContent,
    ).toBe('end: 20');
    const delta = document.querySelector(
      '[data-section="chart-line-slopegraph-tooltip-delta"]',
    );
    expect(delta!.textContent).toContain('+10');
    expect(delta!.textContent).toContain('up');
    fireEvent.mouseLeave(line!);
    expect(
      document.querySelector(
        '[data-section="chart-line-slopegraph-tooltip"]',
      ),
    ).toBeNull();
  });

  it('tooltip also opens from an endpoint dot', () => {
    render(<ChartLineSlopegraph series={SERIES} />);
    const dot = document.querySelector(
      '[data-section="chart-line-slopegraph-endpoint"]',
    );
    fireEvent.mouseEnter(dot!);
    expect(
      document.querySelector(
        '[data-section="chart-line-slopegraph-tooltip"]',
      ),
    ).not.toBeNull();
  });

  it('omits the tooltip when showTooltip=false', () => {
    render(<ChartLineSlopegraph series={SERIES} showTooltip={false} />);
    const line = document.querySelector(
      '[data-section="chart-line-slopegraph-slope-line"]',
    );
    fireEvent.mouseEnter(line!);
    expect(
      document.querySelector(
        '[data-section="chart-line-slopegraph-tooltip"]',
      ),
    ).toBeNull();
  });

  it('onSeriesClick fires with the series payload', () => {
    let captured: string | null = null;
    render(
      <ChartLineSlopegraph
        series={SERIES}
        onSeriesClick={({ series }) => {
          captured = series.id;
        }}
      />,
    );
    const line = document.querySelector(
      '[data-section="chart-line-slopegraph-slope-line"][data-series-id="b"]',
    );
    fireEvent.click(line!);
    expect(captured).toBe('b');
  });

  it('legend has one item per series and toggles a series', () => {
    let lastHidden: ReadonlySet<string> | null = null;
    render(
      <ChartLineSlopegraph
        series={SERIES}
        onHiddenSeriesChange={(h) => {
          lastHidden = h;
        }}
      />,
    );
    const items = document.querySelectorAll(
      '[data-section="chart-line-slopegraph-legend-item"]',
    );
    expect(items.length).toBe(3);
    fireEvent.click(items[0]!);
    expect(lastHidden).not.toBeNull();
    expect(lastHidden!.has('a')).toBe(true);
  });

  it('legend stats report the direction tally', () => {
    render(<ChartLineSlopegraph series={SERIES} />);
    const stats = document.querySelector(
      '[data-section="chart-line-slopegraph-legend-stats"]',
    );
    expect(stats!.textContent).toContain('1 up');
    expect(stats!.textContent).toContain('1 down');
    expect(stats!.textContent).toContain('1 flat');
  });

  it('omits the legend when showLegend=false', () => {
    render(<ChartLineSlopegraph series={SERIES} showLegend={false} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-slopegraph-legend"]',
      ),
    ).toBeNull();
  });

  it('animate flag toggles data-animate + class', () => {
    const { rerender } = render(
      <ChartLineSlopegraph series={SERIES} animate={true} />,
    );
    const root = document.querySelector(
      '[data-section="chart-line-slopegraph"]',
    );
    expect(root!.getAttribute('data-animate')).toBe('true');
    expect(root!.className).toContain('motion-safe:animate-fade-in');
    rerender(<ChartLineSlopegraph series={SERIES} animate={false} />);
    expect(
      document
        .querySelector('[data-section="chart-line-slopegraph"]')!
        .getAttribute('data-animate'),
    ).toBe('false');
  });

  it('ref forwarding', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineSlopegraph ref={ref} series={SERIES} />);
    expect(ref.current!.getAttribute('data-section')).toBe(
      'chart-line-slopegraph',
    );
  });

  it('has displayName', () => {
    expect(ChartLineSlopegraph.displayName).toBe('ChartLineSlopegraph');
  });

  it('custom ariaLabel applied to root and svg', () => {
    render(
      <ChartLineSlopegraph series={SERIES} ariaLabel="Before vs after" />,
    );
    expect(
      document
        .querySelector('[data-section="chart-line-slopegraph"]')!
        .getAttribute('aria-label'),
    ).toBe('Before vs after');
    expect(
      document
        .querySelector('[data-section="chart-line-slopegraph-svg"]')!
        .getAttribute('aria-label'),
    ).toBe('Before vs after');
  });

  it('yLabel renders axis text', () => {
    render(<ChartLineSlopegraph series={SERIES} yLabel="metric" />);
    expect(screen.getByText('metric').getAttribute('data-section')).toBe(
      'chart-line-slopegraph-y-label',
    );
  });
});
