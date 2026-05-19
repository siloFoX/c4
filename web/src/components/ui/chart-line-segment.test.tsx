import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

import {
  ChartLineSegment,
  DEFAULT_CHART_LINE_SEGMENT_WIDTH,
  DEFAULT_CHART_LINE_SEGMENT_HEIGHT,
  DEFAULT_CHART_LINE_SEGMENT_PADDING,
  DEFAULT_CHART_LINE_SEGMENT_TICK_COUNT,
  DEFAULT_CHART_LINE_SEGMENT_STROKE_WIDTH,
  DEFAULT_CHART_LINE_SEGMENT_DOT_RADIUS,
  DEFAULT_CHART_LINE_SEGMENT_LINE_OPACITY,
  DEFAULT_CHART_LINE_SEGMENT_CLASSIFY_BY,
  DEFAULT_CHART_LINE_SEGMENT_FALLBACK_COLOR,
  DEFAULT_CHART_LINE_SEGMENT_GRID_COLOR,
  DEFAULT_CHART_LINE_SEGMENT_AXIS_COLOR,
  DEFAULT_CHART_LINE_SEGMENT_PALETTE,
  buildLineSegmentPath,
  classifyLineSegmentValue,
  computeLineSegmentLayout,
  describeLineSegmentChart,
  getLineSegmentBounds,
  getLineSegmentDefaultColor,
  getLineSegmentFinitePoints,
  getLineSegmentTicks,
  pickLineSegmentColor,
  type ChartLineSegmentSeries,
  type ChartLineSegmentThreshold,
} from './chart-line-segment';

afterEach(() => {
  cleanup();
});

describe('chart-line-segment / constants', () => {
  it('exports sensible defaults', () => {
    expect(DEFAULT_CHART_LINE_SEGMENT_WIDTH).toBe(560);
    expect(DEFAULT_CHART_LINE_SEGMENT_HEIGHT).toBe(320);
    expect(DEFAULT_CHART_LINE_SEGMENT_PADDING).toBe(40);
    expect(DEFAULT_CHART_LINE_SEGMENT_TICK_COUNT).toBe(5);
    expect(DEFAULT_CHART_LINE_SEGMENT_STROKE_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_SEGMENT_DOT_RADIUS).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_SEGMENT_LINE_OPACITY).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_SEGMENT_CLASSIFY_BY).toBe('max');
    expect(DEFAULT_CHART_LINE_SEGMENT_FALLBACK_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_LINE_SEGMENT_GRID_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_LINE_SEGMENT_AXIS_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_LINE_SEGMENT_PALETTE).toHaveLength(10);
  });
});

describe('chart-line-segment / getLineSegmentDefaultColor', () => {
  it('wraps with modulo', () => {
    expect(getLineSegmentDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_SEGMENT_PALETTE[0],
    );
    expect(getLineSegmentDefaultColor(10)).toBe(
      DEFAULT_CHART_LINE_SEGMENT_PALETTE[0],
    );
  });

  it('falls back to first colour for invalid indices', () => {
    expect(getLineSegmentDefaultColor(-1)).toBe(
      DEFAULT_CHART_LINE_SEGMENT_PALETTE[0],
    );
    expect(getLineSegmentDefaultColor(NaN)).toBe(
      DEFAULT_CHART_LINE_SEGMENT_PALETTE[0],
    );
  });
});

describe('chart-line-segment / getLineSegmentFinitePoints', () => {
  it('drops points with non-finite x or y', () => {
    expect(
      getLineSegmentFinitePoints([
        { x: 1, y: 1 },
        { x: NaN, y: 2 },
        { x: 3, y: Infinity },
        { x: 4, y: 4 },
      ]).map((p) => p.x),
    ).toEqual([1, 4]);
  });

  it('returns [] for non-array input', () => {
    expect(getLineSegmentFinitePoints(null as unknown as never[])).toEqual([]);
  });
});

describe('chart-line-segment / getLineSegmentBounds', () => {
  it('returns unit square for empty input', () => {
    expect(getLineSegmentBounds([])).toEqual({
      xMin: 0,
      xMax: 1,
      yMin: 0,
      yMax: 1,
    });
  });

  it('spans all visible series', () => {
    expect(
      getLineSegmentBounds([
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
      getLineSegmentBounds(
        [
          { id: 'a', label: 'A', data: [{ x: 1, y: 1 }] },
          { id: 'b', label: 'B', data: [{ x: 100, y: 100 }] },
        ],
        ['b'],
      ),
    ).toEqual({ xMin: 0.5, xMax: 1.5, yMin: 0.5, yMax: 1.5 });
  });
});

describe('chart-line-segment / getLineSegmentTicks', () => {
  it('returns evenly-spaced ticks', () => {
    const ticks = getLineSegmentTicks(0, 10, 5);
    expect(ticks).toHaveLength(5);
    expect(ticks[0]!.value).toBe(0);
    expect(ticks[4]!.value).toBe(10);
  });

  it('returns [] for invalid range', () => {
    expect(getLineSegmentTicks(10, 5, 4)).toEqual([]);
  });
});

describe('chart-line-segment / classifyLineSegmentValue', () => {
  it('default classifyBy=max returns the larger y', () => {
    expect(classifyLineSegmentValue(3, 9)).toBe(9);
    expect(classifyLineSegmentValue(7, 5)).toBe(7);
  });

  it('min returns the smaller y', () => {
    expect(classifyLineSegmentValue(3, 9, 'min')).toBe(3);
  });

  it('avg returns the arithmetic mean', () => {
    expect(classifyLineSegmentValue(2, 8, 'avg')).toBe(5);
  });

  it('start returns the left endpoint', () => {
    expect(classifyLineSegmentValue(2, 8, 'start')).toBe(2);
  });

  it('end returns the right endpoint', () => {
    expect(classifyLineSegmentValue(2, 8, 'end')).toBe(8);
  });

  it('non-finite inputs collapse to 0', () => {
    expect(classifyLineSegmentValue(NaN, 5, 'max')).toBe(5);
    expect(classifyLineSegmentValue(5, Infinity, 'max')).toBe(5);
    expect(classifyLineSegmentValue(NaN, NaN, 'avg')).toBe(0);
  });
});

describe('chart-line-segment / pickLineSegmentColor', () => {
  const thresholds: ChartLineSegmentThreshold[] = [
    { value: 50, color: '#16a34a', label: 'ok' },
    { value: 80, color: '#f59e0b', label: 'warn' },
    { value: 95, color: '#dc2626', label: 'crit' },
  ];

  it('returns fallback for empty thresholds', () => {
    const out = pickLineSegmentColor(50, [], '#000');
    expect(out.color).toBe('#000');
    expect(out.thresholdLabel).toBeNull();
    expect(out.thresholdValue).toBeNull();
  });

  it('returns fallback for undefined thresholds', () => {
    expect(
      pickLineSegmentColor(50, undefined, '#000').color,
    ).toBe('#000');
  });

  it('returns fallback when value is below the lowest threshold', () => {
    const out = pickLineSegmentColor(10, thresholds, '#000');
    expect(out.color).toBe('#000');
    expect(out.thresholdLabel).toBeNull();
  });

  it('walks thresholds top to bottom and returns the highest matching one', () => {
    expect(pickLineSegmentColor(97, thresholds, '#000').color).toBe('#dc2626');
    expect(pickLineSegmentColor(85, thresholds, '#000').color).toBe('#f59e0b');
    expect(pickLineSegmentColor(60, thresholds, '#000').color).toBe('#16a34a');
  });

  it('exact match against the threshold value counts as crossed', () => {
    expect(pickLineSegmentColor(80, thresholds, '#000').color).toBe('#f59e0b');
    expect(pickLineSegmentColor(95, thresholds, '#000').color).toBe('#dc2626');
  });

  it('exposes the matched threshold label + value', () => {
    const out = pickLineSegmentColor(60, thresholds, '#000');
    expect(out.thresholdLabel).toBe('ok');
    expect(out.thresholdValue).toBe(50);
  });

  it('drops thresholds with non-finite values', () => {
    const noisy: ChartLineSegmentThreshold[] = [
      { value: NaN, color: '#abc' },
      { value: 50, color: '#def' },
    ];
    expect(pickLineSegmentColor(75, noisy, '#000').color).toBe('#def');
  });

  it('non-finite input value returns fallback', () => {
    expect(pickLineSegmentColor(NaN, thresholds, '#000').color).toBe('#000');
  });
});

describe('chart-line-segment / buildLineSegmentPath', () => {
  it('returns [] for empty input', () => {
    expect(buildLineSegmentPath([], [], 'max', '#000')).toEqual([]);
  });

  it('returns [] for a single point', () => {
    expect(
      buildLineSegmentPath(
        [{ index: 0, x: 0, y: 0, px: 0, py: 0 }],
        [],
        'max',
        '#000',
      ),
    ).toEqual([]);
  });

  it('returns one segment for two points', () => {
    const segs = buildLineSegmentPath(
      [
        { index: 0, x: 0, y: 1, px: 0, py: 0 },
        { index: 1, x: 1, y: 2, px: 10, py: 0 },
      ],
      [],
      'max',
      '#abc',
    );
    expect(segs).toHaveLength(1);
    expect(segs[0]!.color).toBe('#abc');
  });

  it('merges consecutive same-color segments into one', () => {
    const segs = buildLineSegmentPath(
      [
        { index: 0, x: 0, y: 10, px: 0, py: 0 },
        { index: 1, x: 1, y: 20, px: 10, py: 0 },
        { index: 2, x: 2, y: 15, px: 20, py: 0 },
      ],
      [],
      'max',
      '#abc',
    );
    expect(segs).toHaveLength(1);
    expect(segs[0]!.startIndex).toBe(0);
    expect(segs[0]!.endIndex).toBe(2);
  });

  it('splits when a segment crosses a threshold', () => {
    const segs = buildLineSegmentPath(
      [
        { index: 0, x: 0, y: 10, px: 0, py: 0 },
        { index: 1, x: 1, y: 60, px: 10, py: 0 },
        { index: 2, x: 2, y: 90, px: 20, py: 0 },
      ],
      [
        { value: 50, color: '#16a34a', label: 'ok' },
        { value: 80, color: '#dc2626', label: 'crit' },
      ],
      'max',
      '#94a3b8',
    );
    // Segment 0..1: max(10, 60) = 60 -> ok (#16a34a)
    // Segment 1..2: max(60, 90) = 90 -> crit (#dc2626)
    expect(segs).toHaveLength(2);
    expect(segs[0]!.color).toBe('#16a34a');
    expect(segs[0]!.thresholdLabel).toBe('ok');
    expect(segs[1]!.color).toBe('#dc2626');
    expect(segs[1]!.thresholdLabel).toBe('crit');
  });

  it('records value (the classifyBy result) on each segment', () => {
    const segs = buildLineSegmentPath(
      [
        { index: 0, x: 0, y: 10, px: 0, py: 0 },
        { index: 1, x: 1, y: 60, px: 10, py: 0 },
      ],
      [],
      'max',
      '#abc',
    );
    expect(segs[0]!.value).toBe(60);
  });

  it('honours classifyBy=avg', () => {
    const segs = buildLineSegmentPath(
      [
        { index: 0, x: 0, y: 0, px: 0, py: 0 },
        { index: 1, x: 1, y: 100, px: 10, py: 0 },
      ],
      [
        { value: 50, color: '#dc2626' },
      ],
      'avg',
      '#abc',
    );
    // avg(0, 100) = 50, matches threshold 50
    expect(segs[0]!.color).toBe('#dc2626');
  });

  it('emits valid SVG path with M and L commands', () => {
    const segs = buildLineSegmentPath(
      [
        { index: 0, x: 0, y: 1, px: 0, py: 0 },
        { index: 1, x: 1, y: 2, px: 10, py: 5 },
        { index: 2, x: 2, y: 1, px: 20, py: 0 },
      ],
      [],
      'max',
      '#abc',
    );
    expect(segs[0]!.path.startsWith('M ')).toBe(true);
    expect(segs[0]!.path).toContain('L ');
  });

  it('alternates segments correctly for 4-segment threshold cross-over', () => {
    const segs = buildLineSegmentPath(
      [
        { index: 0, x: 0, y: 10, px: 0, py: 0 },
        { index: 1, x: 1, y: 90, px: 10, py: 0 },
        { index: 2, x: 2, y: 10, px: 20, py: 0 },
        { index: 3, x: 3, y: 90, px: 30, py: 0 },
        { index: 4, x: 4, y: 10, px: 40, py: 0 },
      ],
      [
        { value: 50, color: '#dc2626' },
      ],
      'max',
      '#000',
    );
    // max picks 90 for segments 0-1, 1-2, 2-3, 3-4 (since 90>50)
    // ALL segments are red (max=90 every time)
    expect(segs).toHaveLength(1);
    expect(segs[0]!.color).toBe('#dc2626');
  });

  it('alternates correctly when classifyBy=min for the same data', () => {
    const segs = buildLineSegmentPath(
      [
        { index: 0, x: 0, y: 10, px: 0, py: 0 },
        { index: 1, x: 1, y: 90, px: 10, py: 0 },
        { index: 2, x: 2, y: 10, px: 20, py: 0 },
        { index: 3, x: 3, y: 90, px: 30, py: 0 },
        { index: 4, x: 4, y: 10, px: 40, py: 0 },
      ],
      [
        { value: 50, color: '#dc2626' },
      ],
      'min',
      '#000',
    );
    // min picks 10 for all segments -> all fallback color
    expect(segs).toHaveLength(1);
    expect(segs[0]!.color).toBe('#000');
  });
});

describe('chart-line-segment / computeLineSegmentLayout', () => {
  it('returns empty when canvas is degenerate', () => {
    expect(
      computeLineSegmentLayout({
        series: [{ id: 'a', label: 'A', data: [{ x: 1, y: 1 }] }],
        width: 10,
        height: 10,
        padding: 100,
      }).series,
    ).toEqual([]);
  });

  it('returns empty when no series', () => {
    expect(
      computeLineSegmentLayout({
        series: [],
        width: 500,
        height: 200,
        padding: 20,
      }).series,
    ).toEqual([]);
  });

  it('returns empty when every series is hidden', () => {
    expect(
      computeLineSegmentLayout({
        series: [{ id: 'a', label: 'A', data: [{ x: 1, y: 1 }] }],
        hidden: ['a'],
        width: 500,
        height: 200,
        padding: 20,
      }).series,
    ).toEqual([]);
  });

  it('records classifyBy and threshold count per series', () => {
    const out = computeLineSegmentLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          classifyBy: 'avg',
          thresholds: [
            { value: 50, color: '#1' },
            { value: 80, color: '#2' },
          ],
          data: [
            { x: 0, y: 0 },
            { x: 1, y: 10 },
          ],
        },
      ],
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.series[0]!.classifyBy).toBe('avg');
    expect(out.series[0]!.thresholds).toHaveLength(2);
  });

  it('builds segments split at threshold crossings', () => {
    const out = computeLineSegmentLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          thresholds: [{ value: 50, color: '#dc2626' }],
          data: [
            { x: 0, y: 10 },
            { x: 1, y: 30 },
            { x: 2, y: 70 },
            { x: 3, y: 60 },
          ],
        },
      ],
      width: 500,
      height: 200,
      padding: 40,
    });
    // max classify: seg0 max=30, seg1 max=70, seg2 max=70
    // -> seg0 fallback, seg1+seg2 red (merged)
    expect(out.series[0]!.segments).toHaveLength(2);
    expect(out.series[0]!.segments[0]!.color).not.toBe('#dc2626');
    expect(out.series[0]!.segments[1]!.color).toBe('#dc2626');
  });

  it('drops non-finite points but keeps totalCount', () => {
    const out = computeLineSegmentLayout({
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
    const out = computeLineSegmentLayout({
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
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
        },
        {
          id: 'c',
          label: 'C',
          data: [
            { x: 0, y: 0 },
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

  it('uses series.color as fallback when no threshold matches', () => {
    const out = computeLineSegmentLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          color: '#abcdef',
          thresholds: [{ value: 1000, color: '#dc2626' }],
          data: [
            { x: 0, y: 1 },
            { x: 1, y: 5 },
          ],
        },
      ],
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.series[0]!.segments[0]!.color).toBe('#abcdef');
  });

  it('records segment startIndex/endIndex from original data indices', () => {
    const out = computeLineSegmentLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          thresholds: [{ value: 50, color: '#dc2626' }],
          data: [
            { x: 0, y: 10 },
            { x: 1, y: 30 },
            { x: 2, y: 70 },
          ],
        },
      ],
      width: 500,
      height: 200,
      padding: 40,
    });
    const segs = out.series[0]!.segments;
    expect(segs).toHaveLength(2);
    expect(segs[0]!.startIndex).toBe(0);
    expect(segs[0]!.endIndex).toBe(1);
    expect(segs[1]!.startIndex).toBe(1);
    expect(segs[1]!.endIndex).toBe(2);
  });
});

describe('chart-line-segment / describeLineSegmentChart', () => {
  it('returns "No data" when empty', () => {
    expect(describeLineSegmentChart([])).toBe('No data');
  });

  it('returns "No data" when no finite points', () => {
    expect(
      describeLineSegmentChart([
        {
          id: 'a',
          label: 'A',
          data: [{ x: NaN, y: 1 } as { x: number; y: number }],
        },
      ]),
    ).toBe('No data');
  });

  it('summarises series, points, and threshold bands', () => {
    const out = describeLineSegmentChart([
      {
        id: 'a',
        label: 'A',
        thresholds: [
          { value: 50, color: '#1' },
          { value: 80, color: '#2' },
        ],
        data: [
          { x: 0, y: 1 },
          { x: 1, y: 2 },
        ],
      },
    ]);
    expect(out).toContain('1 series');
    expect(out).toContain('2 points');
    expect(out).toContain('2 threshold bands');
  });

  it('uses singular threshold band wording', () => {
    const out = describeLineSegmentChart([
      {
        id: 'a',
        label: 'A',
        thresholds: [{ value: 50, color: '#1' }],
        data: [
          { x: 0, y: 1 },
          { x: 1, y: 2 },
        ],
      },
    ]);
    expect(out).toContain('1 threshold band');
  });

  it('excludes hidden series', () => {
    const out = describeLineSegmentChart(
      [
        { id: 'a', label: 'A', data: [{ x: 0, y: 1 }] },
        { id: 'b', label: 'B', data: [{ x: 0, y: 100 }] },
      ],
      ['b'],
    );
    expect(out).toContain('1 series');
  });
});

const FIXTURE: ChartLineSegmentSeries[] = [
  {
    id: 'cpu',
    label: 'CPU',
    color: '#94a3b8',
    classifyBy: 'max',
    thresholds: [
      { value: 80, color: '#dc2626', label: 'critical' },
      { value: 50, color: '#f59e0b', label: 'warning' },
    ],
    data: [
      { x: 0, y: 30 },
      { x: 1, y: 55 },
      { x: 2, y: 85 },
      { x: 3, y: 90 },
      { x: 4, y: 40 },
    ],
  },
];

describe('chart-line-segment / <ChartLineSegment>', () => {
  it('renders a root region with the default aria label', () => {
    render(<ChartLineSegment series={FIXTURE} />);
    const root = document.querySelector(
      '[data-section="chart-line-segment"]',
    )!;
    expect(root.getAttribute('aria-label')).toBe(
      'Threshold-coloured line chart',
    );
  });

  it('exposes series + segment counts as data attrs', () => {
    render(<ChartLineSegment series={FIXTURE} />);
    const root = document.querySelector(
      '[data-section="chart-line-segment"]',
    )!;
    expect(root.getAttribute('data-series-count')).toBe('1');
    expect(root.getAttribute('data-total-points')).toBe('5');
    expect(Number(root.getAttribute('data-total-segments'))).toBeGreaterThan(0);
  });

  it('renders an aria description with summary text', () => {
    render(<ChartLineSegment series={FIXTURE} />);
    expect(
      document.querySelector('[data-section="chart-line-segment-aria-desc"]')
        ?.textContent ?? '',
    ).toContain('2 threshold bands');
  });

  it('respects a custom aria description', () => {
    render(<ChartLineSegment series={FIXTURE} ariaDescription="custom" />);
    expect(
      document.querySelector('[data-section="chart-line-segment-aria-desc"]')
        ?.textContent,
    ).toBe('custom');
  });

  it('renders multiple path elements when thresholds split the line', () => {
    render(<ChartLineSegment series={FIXTURE} />);
    const paths = document.querySelectorAll(
      '[data-section="chart-line-segment-path"]',
    );
    // CPU data 30 -> 55 -> 85 -> 90 -> 40 with thresholds 50, 80:
    // seg0 (30->55) max=55 -> warning (#f59e0b)
    // seg1 (55->85) max=85 -> critical (#dc2626)
    // seg2 (85->90) max=90 -> critical (merged with seg1)
    // seg3 (90->40) max=90 -> critical (merged)
    // Wait: seg1, seg2, seg3 should all be critical -> merged into 1
    // So total: warning(1) + critical(merged 3) = 2 paths
    expect(paths.length).toBe(2);
  });

  it('exposes segment color + threshold attrs', () => {
    render(<ChartLineSegment series={FIXTURE} />);
    const paths = document.querySelectorAll(
      '[data-section="chart-line-segment-path"]',
    );
    const colors = Array.from(paths).map((p) =>
      p.getAttribute('data-segment-color'),
    );
    expect(colors).toContain('#f59e0b');
    expect(colors).toContain('#dc2626');
    const criticalPath = Array.from(paths).find(
      (p) => p.getAttribute('data-segment-color') === '#dc2626',
    );
    expect(criticalPath?.getAttribute('data-segment-threshold-label')).toBe(
      'critical',
    );
    expect(criticalPath?.getAttribute('data-segment-threshold-value')).toBe(
      '80',
    );
  });

  it('renders one dot per finite point when showDots=true', () => {
    render(<ChartLineSegment series={FIXTURE} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-segment-dot"]')
        .length,
    ).toBe(5);
  });

  it('omits dots when showDots=false', () => {
    render(<ChartLineSegment series={FIXTURE} showDots={false} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-segment-dot"]')
        .length,
    ).toBe(0);
  });

  it('renders a legend item per series', () => {
    render(<ChartLineSegment series={FIXTURE} />);
    const items = document.querySelectorAll(
      '[data-section="chart-line-segment-legend-item"]',
    );
    expect(items.length).toBe(1);
  });

  it('renders threshold swatches in the legend', () => {
    render(<ChartLineSegment series={FIXTURE} />);
    const thresholdItems = document.querySelectorAll(
      '[data-section="chart-line-segment-legend-threshold"]',
    );
    expect(thresholdItems.length).toBe(2);
  });

  it('toggles hidden state via legend (uncontrolled)', () => {
    render(<ChartLineSegment series={FIXTURE} />);
    const btn = document.querySelector(
      '[data-section="chart-line-segment-legend-item"][data-series-id="cpu"] [data-section="chart-line-segment-legend-button"]',
    ) as HTMLElement;
    fireEvent.click(btn);
    const item = document.querySelector(
      '[data-section="chart-line-segment-legend-item"][data-series-id="cpu"]',
    )!;
    expect(item.getAttribute('data-hidden')).toBe('true');
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-segment-path"][data-series-id="cpu"]',
      ).length,
    ).toBe(0);
  });

  it('does not mutate hiddenSeries when controlled', () => {
    const handler = vi.fn();
    render(
      <ChartLineSegment
        series={FIXTURE}
        hiddenSeries={[]}
        onHiddenSeriesChange={handler}
      />,
    );
    const btn = document.querySelector(
      '[data-section="chart-line-segment-legend-item"][data-series-id="cpu"] [data-section="chart-line-segment-legend-button"]',
    ) as HTMLElement;
    fireEvent.click(btn);
    expect(handler).toHaveBeenCalledWith(['cpu']);
  });

  it('fires onSeriesToggle with the hidden flag', () => {
    const handler = vi.fn();
    render(<ChartLineSegment series={FIXTURE} onSeriesToggle={handler} />);
    const btn = document.querySelector(
      '[data-section="chart-line-segment-legend-item"][data-series-id="cpu"] [data-section="chart-line-segment-legend-button"]',
    ) as HTMLElement;
    fireEvent.click(btn);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0]!.hidden).toBe(true);
  });

  it('respects defaultHiddenSeries on mount', () => {
    render(
      <ChartLineSegment series={FIXTURE} defaultHiddenSeries={['cpu']} />,
    );
    const item = document.querySelector(
      '[data-section="chart-line-segment-legend-item"][data-series-id="cpu"]',
    )!;
    expect(item.getAttribute('data-hidden')).toBe('true');
  });

  it('shows tooltip on dot hover with threshold info', () => {
    render(<ChartLineSegment series={FIXTURE} />);
    const dot = document.querySelectorAll(
      '[data-section="chart-line-segment-dot"]',
    )[3] as SVGElement; // y=90 (critical)
    fireEvent.mouseEnter(dot);
    const tip = document.querySelector(
      '[data-section="chart-line-segment-tooltip"]',
    );
    expect(tip).not.toBeNull();
    expect(tip!.textContent).toContain('CPU');
    const threshold = document.querySelector(
      '[data-section="chart-line-segment-tooltip-threshold"]',
    );
    expect(threshold).not.toBeNull();
    expect(threshold!.textContent).toContain('critical');
  });

  it('hides tooltip on mouse leave', () => {
    render(<ChartLineSegment series={FIXTURE} />);
    const dot = document.querySelectorAll(
      '[data-section="chart-line-segment-dot"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(dot);
    fireEvent.mouseLeave(dot);
    expect(
      document.querySelector('[data-section="chart-line-segment-tooltip"]'),
    ).toBeNull();
  });

  it('fires onPointClick with series + point', () => {
    const handler = vi.fn();
    render(<ChartLineSegment series={FIXTURE} onPointClick={handler} />);
    const dot = document.querySelectorAll(
      '[data-section="chart-line-segment-dot"]',
    )[0] as SVGElement;
    fireEvent.click(dot);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0]!.series.id).toBe('cpu');
  });

  it('fires onSegmentClick with series + segment', () => {
    const handler = vi.fn();
    render(<ChartLineSegment series={FIXTURE} onSegmentClick={handler} />);
    const path = document.querySelectorAll(
      '[data-section="chart-line-segment-path"]',
    )[0] as SVGElement;
    fireEvent.click(path);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0]!.series.id).toBe('cpu');
    expect(typeof handler.mock.calls[0]![0]!.segment.color).toBe('string');
  });

  it('hides axis when showAxis=false', () => {
    render(<ChartLineSegment series={FIXTURE} showAxis={false} />);
    expect(
      document.querySelector('[data-section="chart-line-segment-axes"]'),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    render(<ChartLineSegment series={FIXTURE} showGrid={false} />);
    expect(
      document.querySelector('[data-section="chart-line-segment-grid"]'),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    render(<ChartLineSegment series={FIXTURE} showLegend={false} />);
    expect(
      document.querySelector('[data-section="chart-line-segment-legend"]'),
    ).toBeNull();
  });

  it('hides tooltip when showTooltip=false', () => {
    render(<ChartLineSegment series={FIXTURE} showTooltip={false} />);
    const dot = document.querySelectorAll(
      '[data-section="chart-line-segment-dot"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(dot);
    expect(
      document.querySelector('[data-section="chart-line-segment-tooltip"]'),
    ).toBeNull();
  });

  it('applies the animate flag to the data attribute', () => {
    render(<ChartLineSegment series={FIXTURE} animate={false} />);
    const root = document.querySelector(
      '[data-section="chart-line-segment"]',
    )!;
    expect(root.getAttribute('data-animate')).toBe('false');
  });

  it('renders optional axis labels', () => {
    render(<ChartLineSegment series={FIXTURE} xLabel="t" yLabel="%" />);
    expect(
      document.querySelector('[data-section="chart-line-segment-x-label"]')
        ?.textContent,
    ).toBe('t');
    expect(
      document.querySelector('[data-section="chart-line-segment-y-label"]')
        ?.textContent,
    ).toBe('%');
  });

  it('uses formatValue / formatX for axis ticks', () => {
    render(
      <ChartLineSegment
        series={FIXTURE}
        formatValue={(n) => `y${n}`}
        formatX={(n) => `x${n}`}
      />,
    );
    const xLabel = document.querySelector(
      '[data-section="chart-line-segment-tick-label"][data-axis="x"]',
    );
    const yLabel = document.querySelector(
      '[data-section="chart-line-segment-tick-label"][data-axis="y"]',
    );
    expect(xLabel?.textContent?.startsWith('x')).toBe(true);
    expect(yLabel?.textContent?.startsWith('y')).toBe(true);
  });

  it('renders empty state when no series', () => {
    render(<ChartLineSegment series={[]} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-segment-path"]')
        .length,
    ).toBe(0);
    expect(
      document.querySelector('[data-section="chart-line-segment-aria-desc"]')
        ?.textContent,
    ).toBe('No data');
  });

  it('renders grid lines per tick when showGrid=true', () => {
    render(<ChartLineSegment series={FIXTURE} tickCount={4} />);
    const lines = document.querySelectorAll(
      '[data-section="chart-line-segment-grid-line"]',
    );
    expect(lines.length).toBeGreaterThan(0);
  });

  it('renders a per-segment aria-label with label info', () => {
    render(<ChartLineSegment series={FIXTURE} />);
    const path = document.querySelector(
      '[data-section="chart-line-segment-path"][data-segment-color="#dc2626"]',
    ) as SVGElement;
    const aria = path.getAttribute('aria-label') ?? '';
    expect(aria).toContain('CPU');
    expect(aria).toContain('critical');
  });

  it('sets data-hovered on the hovered dot and parent series group', () => {
    render(<ChartLineSegment series={FIXTURE} />);
    const dot = document.querySelectorAll(
      '[data-section="chart-line-segment-dot"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(dot);
    expect(dot.getAttribute('data-hovered')).toBe('true');
    const grp = document.querySelector(
      '[data-section="chart-line-segment-series-group"][data-series-id="cpu"]',
    )!;
    expect(grp.getAttribute('data-hovered')).toBe('true');
  });

  it('renders a single segment when no thresholds match anywhere', () => {
    render(
      <ChartLineSegment
        series={[
          {
            id: 'a',
            label: 'A',
            thresholds: [{ value: 1000, color: '#dc2626' }],
            color: '#abcdef',
            data: [
              { x: 0, y: 1 },
              { x: 1, y: 2 },
              { x: 2, y: 3 },
            ],
          },
        ]}
      />,
    );
    const paths = document.querySelectorAll(
      '[data-section="chart-line-segment-path"]',
    );
    expect(paths.length).toBe(1);
    expect(paths[0]!.getAttribute('data-segment-color')).toBe('#abcdef');
  });
});
