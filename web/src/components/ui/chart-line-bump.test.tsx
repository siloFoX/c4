import { afterEach, describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import {
  ChartLineBump,
  DEFAULT_CHART_LINE_BUMP_HEIGHT,
  DEFAULT_CHART_LINE_BUMP_PADDING,
  DEFAULT_CHART_LINE_BUMP_PALETTE,
  DEFAULT_CHART_LINE_BUMP_WIDTH,
  computeLineBumpColumns,
  computeLineBumpLayout,
  describeLineBumpChart,
  getLineBumpDefaultColor,
  getLineBumpFinitePoints,
  runLineBump,
  type ChartLineBumpSeries,
} from './chart-line-bump';

afterEach(() => {
  cleanup();
});

// 3 series across 3 columns; every series visits ranks 1, 2 and 3.
const BUMP_SERIES: ChartLineBumpSeries[] = [
  {
    id: 'a',
    label: 'A',
    data: [
      { x: 0, value: 10 },
      { x: 1, value: 30 },
      { x: 2, value: 20 },
    ],
  },
  {
    id: 'b',
    label: 'B',
    data: [
      { x: 0, value: 20 },
      { x: 1, value: 10 },
      { x: 2, value: 30 },
    ],
  },
  {
    id: 'c',
    label: 'C',
    data: [
      { x: 0, value: 30 },
      { x: 1, value: 20 },
      { x: 2, value: 10 },
    ],
  },
];
// two series tied at the same value at x=0
const TIE_SERIES: ChartLineBumpSeries[] = [
  { id: 'p', label: 'P', data: [{ x: 0, value: 50 }] },
  { id: 'q', label: 'Q', data: [{ x: 0, value: 50 }] },
];
// one full series, one that only appears at x=0
const PARTIAL_SERIES: ChartLineBumpSeries[] = [
  {
    id: 'a',
    label: 'A',
    data: [
      { x: 0, value: 10 },
      { x: 1, value: 30 },
      { x: 2, value: 20 },
    ],
  },
  { id: 'd', label: 'D', data: [{ x: 0, value: 5 }] },
];
const SINGLE_SERIES: ChartLineBumpSeries[] = [
  {
    id: 's',
    label: 'S',
    data: [
      { x: 0, value: 1 },
      { x: 1, value: 2 },
      { x: 2, value: 3 },
    ],
  },
];

describe('chart-line-bump defaults', () => {
  it('positive size defaults', () => {
    expect(DEFAULT_CHART_LINE_BUMP_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_BUMP_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_BUMP_PADDING).toBeGreaterThan(0);
  });
  it('palette has 10 colours', () => {
    expect(DEFAULT_CHART_LINE_BUMP_PALETTE.length).toBe(10);
  });
});

describe('getLineBumpDefaultColor', () => {
  it('cycles through the palette', () => {
    const len = DEFAULT_CHART_LINE_BUMP_PALETTE.length;
    expect(getLineBumpDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_BUMP_PALETTE[0],
    );
    expect(getLineBumpDefaultColor(len + 1)).toBe(
      DEFAULT_CHART_LINE_BUMP_PALETTE[1],
    );
  });
  it('handles non-finite and negative', () => {
    expect(getLineBumpDefaultColor(NaN)).toBe(
      DEFAULT_CHART_LINE_BUMP_PALETTE[0],
    );
    expect(getLineBumpDefaultColor(-1)).toBe(
      DEFAULT_CHART_LINE_BUMP_PALETTE[0],
    );
  });
});

describe('getLineBumpFinitePoints', () => {
  it('drops points with non-finite x or value', () => {
    const r = getLineBumpFinitePoints([
      { x: 0, value: 0 },
      { x: NaN, value: 1 },
      { x: 1, value: Infinity },
      { x: 2, value: 4 },
    ]);
    expect(r.length).toBe(2);
  });
  it('null returns []', () => {
    expect(getLineBumpFinitePoints(null)).toEqual([]);
    expect(getLineBumpFinitePoints(undefined)).toEqual([]);
  });
});

describe('computeLineBumpColumns', () => {
  it('builds the sorted union of x values', () => {
    const { xValues } = computeLineBumpColumns(BUMP_SERIES);
    expect(xValues).toEqual([0, 1, 2]);
  });
  it('desc: the highest value gets rank 1', () => {
    const { columns } = computeLineBumpColumns(BUMP_SERIES, 'desc');
    expect(columns[0]!.entries.map((e) => e.seriesId)).toEqual([
      'c',
      'b',
      'a',
    ]);
    expect(columns[0]!.entries.map((e) => e.rank)).toEqual([1, 2, 3]);
  });
  it('asc: the lowest value gets rank 1', () => {
    const { columns } = computeLineBumpColumns(BUMP_SERIES, 'asc');
    expect(columns[0]!.entries.map((e) => e.seriesId)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });
  it('breaks ties by series declaration order', () => {
    const { columns } = computeLineBumpColumns(TIE_SERIES, 'desc');
    expect(columns[0]!.entries.map((e) => e.seriesId)).toEqual(['p', 'q']);
    expect(columns[0]!.entries.map((e) => e.rank)).toEqual([1, 2]);
  });
  it('a series missing at an x is absent from that column', () => {
    const { columns } = computeLineBumpColumns(PARTIAL_SERIES, 'desc');
    // column at x=1 has only series 'a'
    const col1 = columns.find((c) => c.x === 1)!;
    expect(col1.entries.length).toBe(1);
    expect(col1.entries[0]!.seriesId).toBe('a');
  });
  it('drops non-finite points', () => {
    const { xValues } = computeLineBumpColumns([
      {
        id: 'a',
        label: 'A',
        data: [
          { x: 0, value: 10 },
          { x: NaN, value: 5 },
          { x: 1, value: 20 },
        ],
      },
    ]);
    expect(xValues).toEqual([0, 1]);
  });
  it('empty input -> no columns', () => {
    const r = computeLineBumpColumns([]);
    expect(r.xValues).toEqual([]);
    expect(r.columns).toEqual([]);
  });
  it('single series -> every column rank 1', () => {
    const { columns } = computeLineBumpColumns(SINGLE_SERIES);
    expect(columns.every((c) => c.entries[0]!.rank === 1)).toBe(true);
  });
});

describe('runLineBump', () => {
  it('empty -> zero series and columns', () => {
    const r = runLineBump([]);
    expect(r.seriesCount).toBe(0);
    expect(r.columnCount).toBe(0);
  });
  it('produces per-series rank trajectories', () => {
    const r = runLineBump(BUMP_SERIES, 'desc');
    expect(r.series[0]!.nodes.map((n) => n.rank)).toEqual([3, 1, 2]);
    expect(r.series[2]!.nodes.map((n) => n.rank)).toEqual([1, 2, 3]);
  });
  it('reports best / worst / mean rank per series', () => {
    const r = runLineBump(BUMP_SERIES, 'desc');
    expect(r.series[0]!.bestRank).toBe(1);
    expect(r.series[0]!.worstRank).toBe(3);
    expect(r.series[0]!.meanRank).toBeCloseTo(2, 10);
  });
  it('maxRank is the largest column size', () => {
    expect(runLineBump(BUMP_SERIES).maxRank).toBe(3);
  });
  it('reports series and column counts', () => {
    const r = runLineBump(BUMP_SERIES);
    expect(r.seriesCount).toBe(3);
    expect(r.columnCount).toBe(3);
  });
  it('honours asc rank order', () => {
    const r = runLineBump(BUMP_SERIES, 'asc');
    // series 'a' has the lowest value at x=0 -> rank 1
    expect(r.series[0]!.nodes[0]!.rank).toBe(1);
  });
  it('a partial series only has nodes where it appears', () => {
    const r = runLineBump(PARTIAL_SERIES, 'desc');
    const d = r.series.find((s) => s.id === 'd')!;
    expect(d.nodeCount).toBe(1);
    expect(d.nodes[0]!.rank).toBe(2);
  });
  it('single series -> maxRank 1', () => {
    expect(runLineBump(SINGLE_SERIES).maxRank).toBe(1);
  });
  it('nodes preserve x and value', () => {
    const r = runLineBump(BUMP_SERIES, 'desc');
    expect(r.series[0]!.nodes[1]!.x).toBe(1);
    expect(r.series[0]!.nodes[1]!.value).toBe(30);
  });
});

describe('computeLineBumpLayout', () => {
  it('empty series -> ok=false', () => {
    const layout = computeLineBumpLayout({
      series: [],
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.ok).toBe(false);
  });

  it('degenerate canvas -> ok=false', () => {
    const layout = computeLineBumpLayout({
      series: BUMP_SERIES,
      width: 20,
      height: 20,
      padding: 30,
    });
    expect(layout.ok).toBe(false);
  });

  it('projects each series with px / py nodes', () => {
    const layout = computeLineBumpLayout({
      series: BUMP_SERIES,
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.ok).toBe(true);
    expect(layout.series.length).toBe(3);
    for (const n of layout.series[0]!.nodes) {
      expect(Number.isFinite(n.px)).toBe(true);
      expect(Number.isFinite(n.py)).toBe(true);
    }
  });

  it('builds a curved path by default and a straight one when curved=false', () => {
    const curved = computeLineBumpLayout({
      series: BUMP_SERIES,
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(curved.series[0]!.path).toContain(' C ');
    const straight = computeLineBumpLayout({
      series: BUMP_SERIES,
      curved: false,
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(straight.series[0]!.path).toContain(' L ');
    expect(straight.series[0]!.path).not.toContain(' C ');
  });

  it('rank 1 projects above rank maxRank', () => {
    const layout = computeLineBumpLayout({
      series: BUMP_SERIES,
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.rankTicks[0]!.rank).toBe(1);
    expect(layout.rankTicks[2]!.rank).toBe(3);
    expect(layout.rankTicks[0]!.py).toBeLessThan(layout.rankTicks[2]!.py);
  });

  it('exposes maxRank and column count', () => {
    const layout = computeLineBumpLayout({
      series: BUMP_SERIES,
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.maxRank).toBe(3);
    expect(layout.columnCount).toBe(3);
    expect(layout.xTicks.length).toBe(3);
  });

  it('marks hidden series and counts the visible ones', () => {
    const layout = computeLineBumpLayout({
      series: BUMP_SERIES,
      hiddenSeries: ['b'],
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.visibleSeriesCount).toBe(2);
    expect(layout.series.find((s) => s.id === 'b')!.visible).toBe(false);
  });

  it('ranking is global -- hiding a series does not re-rank the others', () => {
    const full = computeLineBumpLayout({
      series: BUMP_SERIES,
      width: 400,
      height: 200,
      padding: 30,
    });
    const hidden = computeLineBumpLayout({
      series: BUMP_SERIES,
      hiddenSeries: ['c'],
      width: 400,
      height: 200,
      padding: 30,
    });
    const fullA = full.series.find((s) => s.id === 'a')!;
    const hiddenA = hidden.series.find((s) => s.id === 'a')!;
    expect(hiddenA.nodes.map((n) => n.rank)).toEqual(
      fullA.nodes.map((n) => n.rank),
    );
  });

  it('x bounds overrides honoured', () => {
    const layout = computeLineBumpLayout({
      series: BUMP_SERIES,
      width: 400,
      height: 200,
      padding: 30,
      xMin: -5,
      xMax: 20,
    });
    expect(layout.xMin).toBe(-5);
    expect(layout.xMax).toBe(20);
  });
});

describe('describeLineBumpChart', () => {
  it('no data -> No data', () => {
    expect(describeLineBumpChart([])).toBe('No data');
    expect(describeLineBumpChart(null)).toBe('No data');
  });
  it('summary mentions bump + rank', () => {
    const s = describeLineBumpChart(BUMP_SERIES);
    expect(s).toContain('Bump');
    expect(s).toContain('rank');
  });
  it('all series hidden -> No data', () => {
    expect(
      describeLineBumpChart(BUMP_SERIES, { hidden: ['a', 'b', 'c'] }),
    ).toBe('No data');
  });
});

describe('<ChartLineBump> render', () => {
  it('renders empty state with no series', () => {
    render(<ChartLineBump series={[]} />);
    const root = document.querySelector('[data-section="chart-line-bump"]');
    expect(root!.getAttribute('data-empty')).toBe('true');
  });

  it('renders one path per series', () => {
    render(<ChartLineBump series={BUMP_SERIES} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-bump-path"]')
        .length,
    ).toBe(3);
  });

  it('renders a node for every rank position', () => {
    render(<ChartLineBump series={BUMP_SERIES} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-bump-node"]')
        .length,
    ).toBe(9);
  });

  it('hides a series via hiddenSeries', () => {
    render(<ChartLineBump series={BUMP_SERIES} hiddenSeries={['a']} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-bump-series-group"][data-series-id="a"]',
      ),
    ).toBeNull();
    expect(
      document.querySelectorAll('[data-section="chart-line-bump-path"]')
        .length,
    ).toBe(2);
  });

  it('hides nodes via showNodes=false', () => {
    render(<ChartLineBump series={BUMP_SERIES} showNodes={false} />);
    expect(
      document.querySelector('[data-section="chart-line-bump-node"]'),
    ).toBeNull();
  });

  it('rank labels are off by default and shown via showRankLabels', () => {
    const { rerender } = render(<ChartLineBump series={BUMP_SERIES} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-bump-rank-label"]',
      ),
    ).toBeNull();
    rerender(<ChartLineBump series={BUMP_SERIES} showRankLabels />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-bump-rank-label"]',
      ).length,
    ).toBe(9);
  });

  it('paths are curved by default and straight via curved=false', () => {
    const { rerender } = render(<ChartLineBump series={BUMP_SERIES} />);
    expect(
      document
        .querySelector('[data-section="chart-line-bump-path"]')!
        .getAttribute('d'),
    ).toContain(' C ');
    rerender(<ChartLineBump series={BUMP_SERIES} curved={false} />);
    expect(
      document
        .querySelector('[data-section="chart-line-bump-path"]')!
        .getAttribute('d'),
    ).toContain(' L ');
  });

  it('renders rank ticks and x ticks', () => {
    render(<ChartLineBump series={BUMP_SERIES} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-bump-tick"][data-axis="rank"]',
      ).length,
    ).toBe(3);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-bump-tick"][data-axis="x"]',
      ).length,
    ).toBe(3);
  });

  it('config badge shows the series and column counts', () => {
    render(<ChartLineBump series={BUMP_SERIES} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-bump-badge-series"]',
      )?.textContent,
    ).toBe('series=3');
    expect(
      document.querySelector(
        '[data-section="chart-line-bump-badge-columns"]',
      )?.textContent,
    ).toBe('cols=3');
  });

  it('hides the config badge via showConfigBadge=false', () => {
    render(<ChartLineBump series={BUMP_SERIES} showConfigBadge={false} />);
    expect(
      document.querySelector('[data-section="chart-line-bump-badge"]'),
    ).toBeNull();
  });

  it('ARIA: region + img + sr-only desc', () => {
    render(<ChartLineBump series={BUMP_SERIES} />);
    expect(
      document
        .querySelector('[data-section="chart-line-bump"]')!
        .getAttribute('role'),
    ).toBe('region');
    expect(
      document
        .querySelector('[data-section="chart-line-bump-svg"]')!
        .getAttribute('role'),
    ).toBe('img');
    expect(
      document.querySelector('[data-section="chart-line-bump-aria-desc"]')!
        .textContent,
    ).toContain('rank');
  });

  it('root carries data-* attributes', () => {
    render(<ChartLineBump series={BUMP_SERIES} />);
    const root = document.querySelector('[data-section="chart-line-bump"]');
    expect(root!.getAttribute('data-series-count')).toBe('3');
    expect(root!.getAttribute('data-visible-series-count')).toBe('3');
    expect(root!.getAttribute('data-column-count')).toBe('3');
    expect(root!.getAttribute('data-max-rank')).toBe('3');
  });

  it('series group exposes data-* attributes', () => {
    render(<ChartLineBump series={BUMP_SERIES} />);
    const grp = document.querySelector(
      '[data-section="chart-line-bump-series-group"][data-series-id="a"]',
    );
    expect(grp!.getAttribute('data-series-best-rank')).toBe('1');
    expect(grp!.getAttribute('data-series-worst-rank')).toBe('3');
    expect(grp!.getAttribute('data-series-node-count')).toBe('3');
  });

  it('node exposes rank / x / value attributes', () => {
    render(<ChartLineBump series={BUMP_SERIES} />);
    const node = document.querySelector(
      '[data-section="chart-line-bump-node"][data-series-id="c"]',
    );
    // series c at x=0 has value 30 and rank 1
    expect(node!.getAttribute('data-rank')).toBe('1');
    expect(node!.getAttribute('data-x')).toBe('0');
    expect(node!.getAttribute('data-value')).toBe('30');
  });

  it('tooltip on a node shows label + x + rank + value', () => {
    render(<ChartLineBump series={BUMP_SERIES} />);
    const circle = document.querySelector(
      '[data-section="chart-line-bump-node"] circle',
    );
    fireEvent.mouseEnter(circle!);
    expect(
      document.querySelector(
        '[data-section="chart-line-bump-tooltip-rank"]',
      )?.textContent,
    ).toBe('rank: 3 of 3');
    expect(
      document.querySelector(
        '[data-section="chart-line-bump-tooltip-value"]',
      ),
    ).not.toBeNull();
    fireEvent.mouseLeave(circle!);
    expect(
      document.querySelector('[data-section="chart-line-bump-tooltip"]'),
    ).toBeNull();
  });

  it('omits the tooltip when showTooltip=false', () => {
    render(<ChartLineBump series={BUMP_SERIES} showTooltip={false} />);
    const circle = document.querySelector(
      '[data-section="chart-line-bump-node"] circle',
    );
    fireEvent.mouseEnter(circle!);
    expect(
      document.querySelector('[data-section="chart-line-bump-tooltip"]'),
    ).toBeNull();
  });

  it('onNodeClick fires with the series + node payload', () => {
    let captured: { seriesId: string; nodeIndex: number } | null = null;
    render(
      <ChartLineBump
        series={BUMP_SERIES}
        onNodeClick={({ series, node }) => {
          captured = { seriesId: series.id, nodeIndex: node.index };
        }}
      />,
    );
    const circle = document.querySelector(
      '[data-section="chart-line-bump-node"] circle',
    );
    fireEvent.click(circle!);
    expect(captured).not.toBeNull();
    expect(captured!.seriesId).toBe('a');
  });

  it('legend has one item per series and toggles a series', () => {
    let lastHidden: ReadonlySet<string> | null = null;
    render(
      <ChartLineBump
        series={BUMP_SERIES}
        onHiddenSeriesChange={(h) => {
          lastHidden = h;
        }}
      />,
    );
    const items = document.querySelectorAll(
      '[data-section="chart-line-bump-legend-item"]',
    );
    expect(items.length).toBe(3);
    fireEvent.click(items[0]!);
    expect(lastHidden).not.toBeNull();
    expect(lastHidden!.has('a')).toBe(true);
  });

  it('legend reports the column count', () => {
    render(<ChartLineBump series={BUMP_SERIES} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-bump-legend-columns"]',
      )?.textContent,
    ).toBe('3 columns');
  });

  it('omits the legend when showLegend=false', () => {
    render(<ChartLineBump series={BUMP_SERIES} showLegend={false} />);
    expect(
      document.querySelector('[data-section="chart-line-bump-legend"]'),
    ).toBeNull();
  });

  it('animate flag toggles data-animate + class', () => {
    const { rerender } = render(
      <ChartLineBump series={BUMP_SERIES} animate={true} />,
    );
    const root = document.querySelector('[data-section="chart-line-bump"]');
    expect(root!.getAttribute('data-animate')).toBe('true');
    expect(root!.className).toContain('motion-safe:animate-fade-in');
    rerender(<ChartLineBump series={BUMP_SERIES} animate={false} />);
    expect(
      document
        .querySelector('[data-section="chart-line-bump"]')!
        .getAttribute('data-animate'),
    ).toBe('false');
  });

  it('ref forwarding', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineBump ref={ref} series={BUMP_SERIES} />);
    expect(ref.current!.getAttribute('data-section')).toBe(
      'chart-line-bump',
    );
  });

  it('has displayName', () => {
    expect(ChartLineBump.displayName).toBe('ChartLineBump');
  });

  it('custom ariaLabel applied to root and svg', () => {
    render(<ChartLineBump series={BUMP_SERIES} ariaLabel="Rank race" />);
    expect(
      document
        .querySelector('[data-section="chart-line-bump"]')!
        .getAttribute('aria-label'),
    ).toBe('Rank race');
    expect(
      document
        .querySelector('[data-section="chart-line-bump-svg"]')!
        .getAttribute('aria-label'),
    ).toBe('Rank race');
  });

  it('xLabel and yLabel render axis text', () => {
    render(
      <ChartLineBump series={BUMP_SERIES} xLabel="week" yLabel="rank" />,
    );
    expect(screen.getByText('week').getAttribute('data-section')).toBe(
      'chart-line-bump-x-label',
    );
    expect(screen.getByText('rank').getAttribute('data-section')).toBe(
      'chart-line-bump-y-label',
    );
  });
});
