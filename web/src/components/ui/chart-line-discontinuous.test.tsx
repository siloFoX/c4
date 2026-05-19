import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

import {
  ChartLineDiscontinuous,
  DEFAULT_CHART_LINE_DISCONTINUOUS_WIDTH,
  DEFAULT_CHART_LINE_DISCONTINUOUS_HEIGHT,
  DEFAULT_CHART_LINE_DISCONTINUOUS_PADDING,
  DEFAULT_CHART_LINE_DISCONTINUOUS_TICK_COUNT,
  DEFAULT_CHART_LINE_DISCONTINUOUS_STROKE_WIDTH,
  DEFAULT_CHART_LINE_DISCONTINUOUS_DOT_RADIUS,
  DEFAULT_CHART_LINE_DISCONTINUOUS_LINE_OPACITY,
  DEFAULT_CHART_LINE_DISCONTINUOUS_GAP_MARKER_OPACITY,
  DEFAULT_CHART_LINE_DISCONTINUOUS_GAP_MARKER_DASH,
  DEFAULT_CHART_LINE_DISCONTINUOUS_GRID_COLOR,
  DEFAULT_CHART_LINE_DISCONTINUOUS_AXIS_COLOR,
  DEFAULT_CHART_LINE_DISCONTINUOUS_PALETTE,
  buildLineDiscontinuousRuns,
  computeLineDiscontinuousLayout,
  describeLineDiscontinuousChart,
  getLineDiscontinuousBounds,
  getLineDiscontinuousDefaultColor,
  getLineDiscontinuousFinitePoints,
  getLineDiscontinuousGapCount,
  getLineDiscontinuousTicks,
  isFiniteDiscontinuousPoint,
  isLineDiscontinuousGap,
  type ChartLineDiscontinuousSeries,
} from './chart-line-discontinuous';

afterEach(() => {
  cleanup();
});

describe('chart-line-discontinuous / constants', () => {
  it('exports sensible defaults', () => {
    expect(DEFAULT_CHART_LINE_DISCONTINUOUS_WIDTH).toBe(560);
    expect(DEFAULT_CHART_LINE_DISCONTINUOUS_HEIGHT).toBe(320);
    expect(DEFAULT_CHART_LINE_DISCONTINUOUS_PADDING).toBe(40);
    expect(DEFAULT_CHART_LINE_DISCONTINUOUS_TICK_COUNT).toBe(5);
    expect(DEFAULT_CHART_LINE_DISCONTINUOUS_STROKE_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_DISCONTINUOUS_DOT_RADIUS).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_DISCONTINUOUS_LINE_OPACITY).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_DISCONTINUOUS_GAP_MARKER_OPACITY).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_DISCONTINUOUS_GAP_MARKER_DASH).toMatch(/\d/);
    expect(DEFAULT_CHART_LINE_DISCONTINUOUS_GRID_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_LINE_DISCONTINUOUS_AXIS_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_LINE_DISCONTINUOUS_PALETTE).toHaveLength(10);
  });
});

describe('chart-line-discontinuous / isFiniteDiscontinuousPoint', () => {
  it('returns true for finite x AND finite y', () => {
    expect(isFiniteDiscontinuousPoint({ x: 0, y: 0 })).toBe(true);
    expect(isFiniteDiscontinuousPoint({ x: 5, y: -3 })).toBe(true);
  });

  it('returns false for null / undefined y', () => {
    expect(isFiniteDiscontinuousPoint({ x: 0, y: null })).toBe(false);
    expect(isFiniteDiscontinuousPoint({ x: 0, y: undefined })).toBe(false);
  });

  it('returns false for non-finite y', () => {
    expect(isFiniteDiscontinuousPoint({ x: 0, y: NaN })).toBe(false);
    expect(isFiniteDiscontinuousPoint({ x: 0, y: Infinity })).toBe(false);
  });

  it('returns false for non-finite x', () => {
    expect(isFiniteDiscontinuousPoint({ x: NaN, y: 1 })).toBe(false);
  });
});

describe('chart-line-discontinuous / isLineDiscontinuousGap', () => {
  it('returns true for null and undefined y', () => {
    expect(isLineDiscontinuousGap({ x: 0, y: null })).toBe(true);
    expect(isLineDiscontinuousGap({ x: 0, y: undefined })).toBe(true);
  });

  it('returns false for finite y', () => {
    expect(isLineDiscontinuousGap({ x: 0, y: 5 })).toBe(false);
  });

  it('returns false for NaN (non-finite is NOT a gap marker)', () => {
    expect(isLineDiscontinuousGap({ x: 0, y: NaN })).toBe(false);
  });
});

describe('chart-line-discontinuous / getLineDiscontinuousDefaultColor', () => {
  it('wraps with modulo', () => {
    expect(getLineDiscontinuousDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_DISCONTINUOUS_PALETTE[0],
    );
    expect(getLineDiscontinuousDefaultColor(10)).toBe(
      DEFAULT_CHART_LINE_DISCONTINUOUS_PALETTE[0],
    );
  });
});

describe('chart-line-discontinuous / getLineDiscontinuousFinitePoints', () => {
  it('keeps only finite points and records originalIndex', () => {
    const out = getLineDiscontinuousFinitePoints([
      { x: 0, y: 1 },
      { x: 1, y: null },
      { x: 2, y: 3 },
      { x: NaN, y: 5 },
      { x: 4, y: undefined },
      { x: 5, y: 7 },
    ]);
    expect(out.map((o) => o.originalIndex)).toEqual([0, 2, 5]);
  });

  it('returns [] for non-array input', () => {
    expect(
      getLineDiscontinuousFinitePoints(null as unknown as never[]),
    ).toEqual([]);
  });
});

describe('chart-line-discontinuous / getLineDiscontinuousGapCount', () => {
  it('counts null + undefined markers', () => {
    expect(
      getLineDiscontinuousGapCount([
        { x: 0, y: 1 },
        { x: 1, y: null },
        { x: 2, y: undefined },
        { x: 3, y: 2 },
      ]),
    ).toBe(2);
  });

  it('does not count non-finite y as a gap', () => {
    expect(
      getLineDiscontinuousGapCount([
        { x: 0, y: NaN },
        { x: 1, y: Infinity },
      ]),
    ).toBe(0);
  });

  it('returns 0 for non-array input', () => {
    expect(getLineDiscontinuousGapCount(null as unknown as never[])).toBe(0);
  });
});

describe('chart-line-discontinuous / getLineDiscontinuousBounds', () => {
  it('returns unit square for empty input', () => {
    expect(getLineDiscontinuousBounds([])).toEqual({
      xMin: 0,
      xMax: 1,
      yMin: 0,
      yMax: 1,
    });
  });

  it('spans only finite y points but includes gap x positions', () => {
    expect(
      getLineDiscontinuousBounds([
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: 10 },
            { x: 5, y: null },
            { x: 10, y: 20 },
          ],
        },
      ]),
    ).toEqual({ xMin: 0, xMax: 10, yMin: 10, yMax: 20 });
  });

  it('excludes hidden series', () => {
    expect(
      getLineDiscontinuousBounds(
        [
          { id: 'a', label: 'A', data: [{ x: 1, y: 1 }] },
          { id: 'b', label: 'B', data: [{ x: 100, y: 100 }] },
        ],
        ['b'],
      ),
    ).toEqual({ xMin: 0.5, xMax: 1.5, yMin: 0.5, yMax: 1.5 });
  });
});

describe('chart-line-discontinuous / getLineDiscontinuousTicks', () => {
  it('returns evenly-spaced ticks', () => {
    expect(getLineDiscontinuousTicks(0, 10, 5)).toHaveLength(5);
  });

  it('returns [] for invalid range', () => {
    expect(getLineDiscontinuousTicks(10, 5, 4)).toEqual([]);
  });
});

describe('chart-line-discontinuous / buildLineDiscontinuousRuns', () => {
  it('returns no runs / no gaps for empty input', () => {
    expect(buildLineDiscontinuousRuns([], false)).toEqual({
      runs: [],
      gaps: [],
    });
  });

  it('returns one single-point run for one point', () => {
    const out = buildLineDiscontinuousRuns(
      [{ index: 0, x: 0, y: 1, px: 0, py: 0 }],
      false,
    );
    expect(out.runs).toHaveLength(1);
    expect(out.runs[0]!.path).toBe('M 0.000 0.000');
    expect(out.gaps).toHaveLength(0);
  });

  it('returns one run when no gaps are present', () => {
    const out = buildLineDiscontinuousRuns(
      [
        { index: 0, x: 0, y: 1, px: 0, py: 0 },
        { index: 1, x: 1, y: 2, px: 10, py: 0 },
        { index: 2, x: 2, y: 3, px: 20, py: 0 },
      ],
      false,
    );
    expect(out.runs).toHaveLength(1);
    expect(out.runs[0]!.pointCount).toBe(3);
    expect(out.gaps).toHaveLength(0);
  });

  it('splits into two runs at a single gap', () => {
    const out = buildLineDiscontinuousRuns(
      [
        { index: 0, x: 0, y: 1, px: 0, py: 0 },
        { index: 1, x: 1, y: 2, px: 10, py: 0 },
        { index: 2, x: 2, y: 0, px: 20, py: 0, isGap: true },
        { index: 3, x: 3, y: 3, px: 30, py: 0 },
        { index: 4, x: 4, y: 4, px: 40, py: 0 },
      ],
      false,
    );
    expect(out.runs).toHaveLength(2);
    expect(out.runs[0]!.startIndex).toBe(0);
    expect(out.runs[0]!.endIndex).toBe(1);
    expect(out.runs[1]!.startIndex).toBe(3);
    expect(out.runs[1]!.endIndex).toBe(4);
  });

  it('records the gap span (startIndex/endIndex/x/width)', () => {
    const out = buildLineDiscontinuousRuns(
      [
        { index: 0, x: 0, y: 1, px: 0, py: 0 },
        { index: 1, x: 1, y: 2, px: 10, py: 0 },
        { index: 2, x: 2, y: 0, px: 20, py: 0, isGap: true },
        { index: 3, x: 3, y: 3, px: 30, py: 0 },
      ],
      false,
    );
    expect(out.gaps).toHaveLength(1);
    expect(out.gaps[0]!.startIndex).toBe(1);
    expect(out.gaps[0]!.endIndex).toBe(3);
    expect(out.gaps[0]!.startX).toBe(10);
    expect(out.gaps[0]!.endX).toBe(30);
    expect(out.gaps[0]!.width).toBe(20);
  });

  it('handles multiple gaps -> N+1 runs (or fewer at the edges)', () => {
    const out = buildLineDiscontinuousRuns(
      [
        { index: 0, x: 0, y: 1, px: 0, py: 0 },
        { index: 1, x: 1, y: 0, px: 10, py: 0, isGap: true },
        { index: 2, x: 2, y: 1, px: 20, py: 0 },
        { index: 3, x: 3, y: 0, px: 30, py: 0, isGap: true },
        { index: 4, x: 4, y: 1, px: 40, py: 0 },
      ],
      false,
    );
    expect(out.runs).toHaveLength(3);
    expect(out.gaps).toHaveLength(2);
  });

  it('handles leading gaps (no run before first gap)', () => {
    const out = buildLineDiscontinuousRuns(
      [
        { index: 0, x: 0, y: 0, px: 0, py: 0, isGap: true },
        { index: 1, x: 1, y: 1, px: 10, py: 0 },
        { index: 2, x: 2, y: 2, px: 20, py: 0 },
      ],
      false,
    );
    expect(out.runs).toHaveLength(1);
    expect(out.gaps).toHaveLength(0); // no preceding finite point to bracket
  });

  it('handles trailing gaps (no run after last gap)', () => {
    const out = buildLineDiscontinuousRuns(
      [
        { index: 0, x: 0, y: 1, px: 0, py: 0 },
        { index: 1, x: 1, y: 2, px: 10, py: 0 },
        { index: 2, x: 2, y: 0, px: 20, py: 0, isGap: true },
      ],
      false,
    );
    expect(out.runs).toHaveLength(1);
    expect(out.gaps).toHaveLength(0); // no following finite point to bracket
  });

  it('connectGaps=true collapses to a single run that spans the gaps', () => {
    const out = buildLineDiscontinuousRuns(
      [
        { index: 0, x: 0, y: 1, px: 0, py: 0 },
        { index: 1, x: 1, y: 2, px: 10, py: 0 },
        { index: 2, x: 2, y: 0, px: 20, py: 0, isGap: true },
        { index: 3, x: 3, y: 3, px: 30, py: 0 },
      ],
      true,
    );
    expect(out.runs).toHaveLength(1);
    expect(out.runs[0]!.pointCount).toBe(3);
    expect(out.gaps).toHaveLength(1);
  });

  it('runs emit valid M+L path commands', () => {
    const out = buildLineDiscontinuousRuns(
      [
        { index: 0, x: 0, y: 1, px: 0, py: 0 },
        { index: 1, x: 1, y: 2, px: 10, py: 5 },
        { index: 2, x: 2, y: 3, px: 20, py: 0 },
      ],
      false,
    );
    expect(out.runs[0]!.path.startsWith('M ')).toBe(true);
    expect((out.runs[0]!.path.match(/L /g) ?? []).length).toBe(2);
  });
});

describe('chart-line-discontinuous / computeLineDiscontinuousLayout', () => {
  it('returns empty when canvas is degenerate', () => {
    expect(
      computeLineDiscontinuousLayout({
        series: [{ id: 'a', label: 'A', data: [{ x: 1, y: 1 }] }],
        width: 10,
        height: 10,
        padding: 100,
      }).series,
    ).toEqual([]);
  });

  it('returns empty when no series', () => {
    expect(
      computeLineDiscontinuousLayout({
        series: [],
        width: 500,
        height: 200,
        padding: 20,
      }).series,
    ).toEqual([]);
  });

  it('returns empty when every series is hidden', () => {
    expect(
      computeLineDiscontinuousLayout({
        series: [{ id: 'a', label: 'A', data: [{ x: 1, y: 1 }] }],
        hidden: ['a'],
        width: 500,
        height: 200,
        padding: 20,
      }).series,
    ).toEqual([]);
  });

  it('splits a series with a null gap into two runs', () => {
    const out = computeLineDiscontinuousLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: 10 },
            { x: 1, y: 20 },
            { x: 2, y: null },
            { x: 3, y: 30 },
            { x: 4, y: 40 },
          ],
        },
      ],
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.series[0]!.runs).toHaveLength(2);
    expect(out.series[0]!.gaps).toHaveLength(1);
    expect(out.series[0]!.gapCount).toBe(1);
    expect(out.series[0]!.finiteCount).toBe(4);
    expect(out.series[0]!.totalCount).toBe(5);
  });

  it('collapses runs when series.connectGaps=true but keeps gap records', () => {
    const out = computeLineDiscontinuousLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          connectGaps: true,
          data: [
            { x: 0, y: 10 },
            { x: 1, y: 20 },
            { x: 2, y: null },
            { x: 3, y: 30 },
          ],
        },
      ],
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.series[0]!.runs).toHaveLength(1);
    expect(out.series[0]!.gaps).toHaveLength(1);
    expect(out.series[0]!.connectGaps).toBe(true);
  });

  it('handles consecutive gaps (gap of size 2)', () => {
    const out = computeLineDiscontinuousLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: 10 },
            { x: 1, y: null },
            { x: 2, y: null },
            { x: 3, y: 30 },
          ],
        },
      ],
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.series[0]!.runs).toHaveLength(2);
    expect(out.series[0]!.gapCount).toBe(2);
  });

  it('dots render only at finite points', () => {
    const out = computeLineDiscontinuousLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: 1 },
            { x: 1, y: null },
            { x: 2, y: 3 },
          ],
        },
      ],
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.series[0]!.points).toHaveLength(2);
    expect(out.series[0]!.points.map((p) => p.index)).toEqual([0, 2]);
  });

  it('records series index across hidden-series filter', () => {
    const out = computeLineDiscontinuousLayout({
      series: [
        { id: 'a', label: 'A', data: [{ x: 0, y: 1 }] },
        { id: 'b', label: 'B', data: [{ x: 0, y: 1 }] },
        { id: 'c', label: 'C', data: [{ x: 0, y: 1 }] },
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

  it('drops non-finite x points entirely (not treated as gaps)', () => {
    const out = computeLineDiscontinuousLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: 1 },
            { x: NaN, y: 2 },
            { x: 2, y: 3 },
          ],
        },
      ],
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.series[0]!.runs).toHaveLength(1);
    expect(out.series[0]!.gapCount).toBe(0);
    expect(out.series[0]!.points).toHaveLength(2);
  });

  it('records gap pixel span between bracketing finite points', () => {
    const out = computeLineDiscontinuousLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: 0 },
            { x: 5, y: 10 },
            { x: 6, y: null },
            { x: 10, y: 20 },
          ],
        },
      ],
      xMin: 0,
      xMax: 10,
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.series[0]!.gaps).toHaveLength(1);
    const gap = out.series[0]!.gaps[0]!;
    expect(gap.startIndex).toBe(1);
    expect(gap.endIndex).toBe(3);
    expect(gap.width).toBeGreaterThan(0);
  });
});

describe('chart-line-discontinuous / describeLineDiscontinuousChart', () => {
  it('returns "No data" when empty', () => {
    expect(describeLineDiscontinuousChart([])).toBe('No data');
  });

  it('returns "No data" when no finite points', () => {
    expect(
      describeLineDiscontinuousChart([
        { id: 'a', label: 'A', data: [{ x: 0, y: null }] },
      ]),
    ).toBe('No data');
  });

  it('summarises series, points, and gap count', () => {
    const out = describeLineDiscontinuousChart([
      {
        id: 'a',
        label: 'A',
        data: [
          { x: 0, y: 1 },
          { x: 1, y: null },
          { x: 2, y: 2 },
          { x: 3, y: null },
          { x: 4, y: 3 },
        ],
      },
    ]);
    expect(out).toContain('1 series');
    expect(out).toContain('3 points');
    expect(out).toContain('2 gap markers');
  });

  it('uses singular gap marker wording', () => {
    const out = describeLineDiscontinuousChart([
      {
        id: 'a',
        label: 'A',
        data: [
          { x: 0, y: 1 },
          { x: 1, y: null },
          { x: 2, y: 2 },
        ],
      },
    ]);
    expect(out).toContain('1 gap marker');
  });

  it('excludes hidden series', () => {
    const out = describeLineDiscontinuousChart(
      [
        { id: 'a', label: 'A', data: [{ x: 0, y: 1 }] },
        { id: 'b', label: 'B', data: [{ x: 0, y: 100 }] },
      ],
      ['b'],
    );
    expect(out).toContain('1 series');
  });
});

const FIXTURE: ChartLineDiscontinuousSeries[] = [
  {
    id: 'a',
    label: 'Uptime',
    data: [
      { x: 0, y: 99 },
      { x: 1, y: 100 },
      { x: 2, y: null },
      { x: 3, y: null },
      { x: 4, y: 98 },
      { x: 5, y: 100 },
    ],
  },
];

describe('chart-line-discontinuous / <ChartLineDiscontinuous>', () => {
  it('renders a root region with the default aria label', () => {
    render(<ChartLineDiscontinuous series={FIXTURE} />);
    const root = document.querySelector(
      '[data-section="chart-line-discontinuous"]',
    )!;
    expect(root.getAttribute('aria-label')).toBe('Discontinuous line chart');
  });

  it('exposes series + run + gap counts as data attrs', () => {
    render(<ChartLineDiscontinuous series={FIXTURE} />);
    const root = document.querySelector(
      '[data-section="chart-line-discontinuous"]',
    )!;
    expect(root.getAttribute('data-series-count')).toBe('1');
    expect(root.getAttribute('data-total-points')).toBe('4');
    expect(root.getAttribute('data-total-gaps')).toBe('2');
    expect(root.getAttribute('data-total-runs')).toBe('2');
  });

  it('renders an aria description with summary text', () => {
    render(<ChartLineDiscontinuous series={FIXTURE} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-discontinuous-aria-desc"]',
      )?.textContent ?? '',
    ).toContain('2 gap markers');
  });

  it('respects a custom aria description', () => {
    render(
      <ChartLineDiscontinuous series={FIXTURE} ariaDescription="custom" />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-discontinuous-aria-desc"]',
      )?.textContent,
    ).toBe('custom');
  });

  it('renders one path per run (line breaks at gaps)', () => {
    render(<ChartLineDiscontinuous series={FIXTURE} />);
    const paths = document.querySelectorAll(
      '[data-section="chart-line-discontinuous-path"]',
    );
    expect(paths.length).toBe(2);
  });

  it('exposes run start/end/point-count attrs', () => {
    render(<ChartLineDiscontinuous series={FIXTURE} />);
    const paths = document.querySelectorAll(
      '[data-section="chart-line-discontinuous-path"]',
    );
    expect(paths[0]!.getAttribute('data-run-start')).toBe('0');
    expect(paths[0]!.getAttribute('data-run-end')).toBe('1');
    expect(paths[0]!.getAttribute('data-run-point-count')).toBe('2');
    expect(paths[1]!.getAttribute('data-run-start')).toBe('4');
    expect(paths[1]!.getAttribute('data-run-end')).toBe('5');
  });

  it('renders one dot per finite point (no dots at gap positions)', () => {
    render(<ChartLineDiscontinuous series={FIXTURE} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-discontinuous-dot"]',
      ).length,
    ).toBe(4);
  });

  it('omits dots when showDots=false', () => {
    render(<ChartLineDiscontinuous series={FIXTURE} showDots={false} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-discontinuous-dot"]',
      ).length,
    ).toBe(0);
  });

  it('renders one gap marker per gap when showGapMarkers=true', () => {
    render(<ChartLineDiscontinuous series={FIXTURE} />);
    const markers = document.querySelectorAll(
      '[data-section="chart-line-discontinuous-gap-marker"]',
    );
    // Single bracketed gap (one block of nulls between finite points)
    expect(markers.length).toBe(1);
  });

  it('omits gap markers when showGapMarkers=false', () => {
    render(<ChartLineDiscontinuous series={FIXTURE} showGapMarkers={false} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-discontinuous-gap-marker"]',
      ).length,
    ).toBe(0);
  });

  it('omits gap markers when series.connectGaps=true', () => {
    render(
      <ChartLineDiscontinuous
        series={[{ ...FIXTURE[0]!, connectGaps: true }]}
      />,
    );
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-discontinuous-gap-marker"]',
      ).length,
    ).toBe(0);
  });

  it('with connectGaps=true the line collapses to a single path', () => {
    render(
      <ChartLineDiscontinuous
        series={[{ ...FIXTURE[0]!, connectGaps: true }]}
      />,
    );
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-discontinuous-path"]',
      ).length,
    ).toBe(1);
  });

  it('exposes per-series gap + run counts as data attrs', () => {
    render(<ChartLineDiscontinuous series={FIXTURE} />);
    const grp = document.querySelector(
      '[data-section="chart-line-discontinuous-series-group"][data-series-id="a"]',
    )!;
    expect(grp.getAttribute('data-series-gap-count')).toBe('2');
    expect(grp.getAttribute('data-series-run-count')).toBe('2');
    expect(grp.getAttribute('data-series-finite-count')).toBe('4');
    expect(grp.getAttribute('data-series-connect-gaps')).toBe('false');
  });

  it('renders a legend item per series', () => {
    render(<ChartLineDiscontinuous series={FIXTURE} />);
    const items = document.querySelectorAll(
      '[data-section="chart-line-discontinuous-legend-item"]',
    );
    expect(items.length).toBe(1);
  });

  it('toggles hidden state via legend (uncontrolled)', () => {
    render(<ChartLineDiscontinuous series={FIXTURE} />);
    const btn = document.querySelector(
      '[data-section="chart-line-discontinuous-legend-item"][data-series-id="a"] [data-section="chart-line-discontinuous-legend-button"]',
    ) as HTMLElement;
    fireEvent.click(btn);
    const item = document.querySelector(
      '[data-section="chart-line-discontinuous-legend-item"][data-series-id="a"]',
    )!;
    expect(item.getAttribute('data-hidden')).toBe('true');
  });

  it('does not mutate hiddenSeries when controlled', () => {
    const handler = vi.fn();
    render(
      <ChartLineDiscontinuous
        series={FIXTURE}
        hiddenSeries={[]}
        onHiddenSeriesChange={handler}
      />,
    );
    const btn = document.querySelector(
      '[data-section="chart-line-discontinuous-legend-item"][data-series-id="a"] [data-section="chart-line-discontinuous-legend-button"]',
    ) as HTMLElement;
    fireEvent.click(btn);
    expect(handler).toHaveBeenCalledWith(['a']);
  });

  it('fires onSeriesToggle with the hidden flag', () => {
    const handler = vi.fn();
    render(
      <ChartLineDiscontinuous series={FIXTURE} onSeriesToggle={handler} />,
    );
    const btn = document.querySelector(
      '[data-section="chart-line-discontinuous-legend-item"][data-series-id="a"] [data-section="chart-line-discontinuous-legend-button"]',
    ) as HTMLElement;
    fireEvent.click(btn);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0]!.hidden).toBe(true);
  });

  it('respects defaultHiddenSeries on mount', () => {
    render(
      <ChartLineDiscontinuous
        series={FIXTURE}
        defaultHiddenSeries={['a']}
      />,
    );
    const item = document.querySelector(
      '[data-section="chart-line-discontinuous-legend-item"][data-series-id="a"]',
    )!;
    expect(item.getAttribute('data-hidden')).toBe('true');
  });

  it('shows tooltip on dot hover', () => {
    render(<ChartLineDiscontinuous series={FIXTURE} />);
    const dot = document.querySelectorAll(
      '[data-section="chart-line-discontinuous-dot"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(dot);
    const tip = document.querySelector(
      '[data-section="chart-line-discontinuous-tooltip"]',
    );
    expect(tip).not.toBeNull();
    expect(tip!.textContent).toContain('Uptime');
  });

  it('hides tooltip on mouse leave', () => {
    render(<ChartLineDiscontinuous series={FIXTURE} />);
    const dot = document.querySelector(
      '[data-section="chart-line-discontinuous-dot"]',
    ) as SVGElement;
    fireEvent.mouseEnter(dot);
    fireEvent.mouseLeave(dot);
    expect(
      document.querySelector(
        '[data-section="chart-line-discontinuous-tooltip"]',
      ),
    ).toBeNull();
  });

  it('fires onPointClick with series + point', () => {
    const handler = vi.fn();
    render(
      <ChartLineDiscontinuous series={FIXTURE} onPointClick={handler} />,
    );
    const dot = document.querySelectorAll(
      '[data-section="chart-line-discontinuous-dot"]',
    )[0] as SVGElement;
    fireEvent.click(dot);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0]!.series.id).toBe('a');
  });

  it('hides axis when showAxis=false', () => {
    render(<ChartLineDiscontinuous series={FIXTURE} showAxis={false} />);
    expect(
      document.querySelector('[data-section="chart-line-discontinuous-axes"]'),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    render(<ChartLineDiscontinuous series={FIXTURE} showGrid={false} />);
    expect(
      document.querySelector('[data-section="chart-line-discontinuous-grid"]'),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    render(<ChartLineDiscontinuous series={FIXTURE} showLegend={false} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-discontinuous-legend"]',
      ),
    ).toBeNull();
  });

  it('hides tooltip when showTooltip=false', () => {
    render(<ChartLineDiscontinuous series={FIXTURE} showTooltip={false} />);
    const dot = document.querySelectorAll(
      '[data-section="chart-line-discontinuous-dot"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(dot);
    expect(
      document.querySelector(
        '[data-section="chart-line-discontinuous-tooltip"]',
      ),
    ).toBeNull();
  });

  it('applies the animate flag to the data attribute', () => {
    render(<ChartLineDiscontinuous series={FIXTURE} animate={false} />);
    const root = document.querySelector(
      '[data-section="chart-line-discontinuous"]',
    )!;
    expect(root.getAttribute('data-animate')).toBe('false');
  });

  it('renders optional axis labels', () => {
    render(
      <ChartLineDiscontinuous series={FIXTURE} xLabel="t" yLabel="uptime" />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-discontinuous-x-label"]',
      )?.textContent,
    ).toBe('t');
    expect(
      document.querySelector(
        '[data-section="chart-line-discontinuous-y-label"]',
      )?.textContent,
    ).toBe('uptime');
  });

  it('uses formatValue / formatX for axis ticks', () => {
    render(
      <ChartLineDiscontinuous
        series={FIXTURE}
        formatValue={(n) => `y${n}`}
        formatX={(n) => `x${n}`}
      />,
    );
    const xLabel = document.querySelector(
      '[data-section="chart-line-discontinuous-tick-label"][data-axis="x"]',
    );
    const yLabel = document.querySelector(
      '[data-section="chart-line-discontinuous-tick-label"][data-axis="y"]',
    );
    expect(xLabel?.textContent?.startsWith('x')).toBe(true);
    expect(yLabel?.textContent?.startsWith('y')).toBe(true);
  });

  it('overrides default colour via series.color', () => {
    render(
      <ChartLineDiscontinuous
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
      '[data-section="chart-line-discontinuous-series-group"]',
    )!;
    expect(grp.getAttribute('data-series-color')).toBe('#abcdef');
  });

  it('renders empty state when no series', () => {
    render(<ChartLineDiscontinuous series={[]} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-discontinuous-path"]',
      ).length,
    ).toBe(0);
    expect(
      document.querySelector(
        '[data-section="chart-line-discontinuous-aria-desc"]',
      )?.textContent,
    ).toBe('No data');
  });

  it('sets data-hovered on the hovered dot and parent series group', () => {
    render(<ChartLineDiscontinuous series={FIXTURE} />);
    const dot = document.querySelectorAll(
      '[data-section="chart-line-discontinuous-dot"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(dot);
    expect(dot.getAttribute('data-hovered')).toBe('true');
    const grp = document.querySelector(
      '[data-section="chart-line-discontinuous-series-group"][data-series-id="a"]',
    )!;
    expect(grp.getAttribute('data-hovered')).toBe('true');
  });

  it('renders grid lines per tick when showGrid=true', () => {
    render(<ChartLineDiscontinuous series={FIXTURE} tickCount={4} />);
    const lines = document.querySelectorAll(
      '[data-section="chart-line-discontinuous-grid-line"]',
    );
    expect(lines.length).toBeGreaterThan(0);
  });

  it('handles a series with only gap markers (no finite points) as empty', () => {
    render(
      <ChartLineDiscontinuous
        series={[
          {
            id: 'a',
            label: 'A',
            data: [
              { x: 0, y: null },
              { x: 1, y: null },
            ],
          },
        ]}
      />,
    );
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-discontinuous-path"]',
      ).length,
    ).toBe(0);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-discontinuous-dot"]',
      ).length,
    ).toBe(0);
  });

  it('renders run aria-label with start/end indices and point count', () => {
    render(<ChartLineDiscontinuous series={FIXTURE} />);
    const path = document.querySelector(
      '[data-section="chart-line-discontinuous-path"]',
    ) as SVGElement;
    const aria = path.getAttribute('aria-label') ?? '';
    expect(aria).toContain('Uptime');
    expect(aria).toContain('points');
  });
});
