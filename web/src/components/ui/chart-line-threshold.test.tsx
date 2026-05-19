import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

import {
  ChartLineThreshold,
  DEFAULT_CHART_LINE_THRESHOLD_WIDTH,
  DEFAULT_CHART_LINE_THRESHOLD_HEIGHT,
  DEFAULT_CHART_LINE_THRESHOLD_PADDING,
  DEFAULT_CHART_LINE_THRESHOLD_TICK_COUNT,
  DEFAULT_CHART_LINE_THRESHOLD_STROKE_WIDTH,
  DEFAULT_CHART_LINE_THRESHOLD_DOT_RADIUS,
  DEFAULT_CHART_LINE_THRESHOLD_LINE_OPACITY,
  DEFAULT_CHART_LINE_THRESHOLD_REFERENCE_OPACITY,
  DEFAULT_CHART_LINE_THRESHOLD_REFERENCE_WIDTH,
  DEFAULT_CHART_LINE_THRESHOLD_REFERENCE_DASH,
  DEFAULT_CHART_LINE_THRESHOLD_ZONE_OPACITY,
  DEFAULT_CHART_LINE_THRESHOLD_GRID_COLOR,
  DEFAULT_CHART_LINE_THRESHOLD_AXIS_COLOR,
  DEFAULT_CHART_LINE_THRESHOLD_DEFAULT_COLOR,
  DEFAULT_CHART_LINE_THRESHOLD_PALETTE,
  buildLineThresholdPath,
  classifyLineThresholdPoint,
  computeLineThresholdLayout,
  describeLineThresholdChart,
  getLineThresholdBounds,
  getLineThresholdDefaultColor,
  getLineThresholdFinitePoints,
  getLineThresholdFiniteThresholds,
  getLineThresholdTicks,
  type ChartLineThresholdSpec,
  type ChartLineThresholdSeries,
} from './chart-line-threshold';

afterEach(() => {
  cleanup();
});

describe('chart-line-threshold / constants', () => {
  it('exports sensible defaults', () => {
    expect(DEFAULT_CHART_LINE_THRESHOLD_WIDTH).toBe(560);
    expect(DEFAULT_CHART_LINE_THRESHOLD_HEIGHT).toBe(320);
    expect(DEFAULT_CHART_LINE_THRESHOLD_PADDING).toBe(40);
    expect(DEFAULT_CHART_LINE_THRESHOLD_TICK_COUNT).toBe(5);
    expect(DEFAULT_CHART_LINE_THRESHOLD_STROKE_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_THRESHOLD_DOT_RADIUS).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_THRESHOLD_LINE_OPACITY).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_THRESHOLD_REFERENCE_OPACITY).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_THRESHOLD_REFERENCE_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_THRESHOLD_REFERENCE_DASH).toMatch(/\d/);
    expect(DEFAULT_CHART_LINE_THRESHOLD_ZONE_OPACITY).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_THRESHOLD_ZONE_OPACITY).toBeLessThan(1);
    expect(DEFAULT_CHART_LINE_THRESHOLD_GRID_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_LINE_THRESHOLD_AXIS_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_LINE_THRESHOLD_DEFAULT_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_LINE_THRESHOLD_PALETTE).toHaveLength(10);
  });
});

describe('chart-line-threshold / getLineThresholdDefaultColor', () => {
  it('wraps with modulo', () => {
    expect(getLineThresholdDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_THRESHOLD_PALETTE[0],
    );
    expect(getLineThresholdDefaultColor(10)).toBe(
      DEFAULT_CHART_LINE_THRESHOLD_PALETTE[0],
    );
  });

  it('falls back to first colour for invalid indices', () => {
    expect(getLineThresholdDefaultColor(-1)).toBe(
      DEFAULT_CHART_LINE_THRESHOLD_PALETTE[0],
    );
    expect(getLineThresholdDefaultColor(NaN)).toBe(
      DEFAULT_CHART_LINE_THRESHOLD_PALETTE[0],
    );
  });
});

describe('chart-line-threshold / getLineThresholdFinitePoints', () => {
  it('drops points with non-finite x or y', () => {
    expect(
      getLineThresholdFinitePoints([
        { x: 1, y: 1 },
        { x: NaN, y: 2 },
        { x: 3, y: Infinity },
        { x: 4, y: 4 },
      ]).map((p) => p.x),
    ).toEqual([1, 4]);
  });

  it('returns [] for non-array input', () => {
    expect(
      getLineThresholdFinitePoints(null as unknown as never[]),
    ).toEqual([]);
  });
});

describe('chart-line-threshold / getLineThresholdFiniteThresholds', () => {
  it('drops thresholds with non-finite value', () => {
    const out = getLineThresholdFiniteThresholds([
      { id: 'a', label: 'A', value: 10 },
      { id: 'b', label: 'B', value: NaN },
      { id: 'c', label: 'C', value: 20 },
    ]);
    expect(out.map((t) => t.id)).toEqual(['a', 'c']);
  });

  it('drops thresholds with non-string ids', () => {
    const out = getLineThresholdFiniteThresholds([
      { id: 'a', label: 'A', value: 10 },
      { id: 99 as unknown as string, label: 'B', value: 20 },
    ]);
    expect(out).toHaveLength(1);
  });

  it('returns [] for non-array input', () => {
    expect(
      getLineThresholdFiniteThresholds(null as unknown as ChartLineThresholdSpec[]),
    ).toEqual([]);
  });
});

describe('chart-line-threshold / getLineThresholdBounds', () => {
  it('returns unit square for empty input', () => {
    expect(getLineThresholdBounds([], [])).toEqual({
      xMin: 0,
      xMax: 1,
      yMin: 0,
      yMax: 1,
    });
  });

  it('spans series points', () => {
    expect(
      getLineThresholdBounds(
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
      ),
    ).toEqual({ xMin: 0, xMax: 5, yMin: 5, yMax: 10 });
  });

  it('expands the y range to include thresholds outside the data', () => {
    expect(
      getLineThresholdBounds(
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
        [
          { id: 't1', label: 'T1', value: 0 },
          { id: 't2', label: 'T2', value: 100 },
        ],
      ),
    ).toEqual({ xMin: 0, xMax: 5, yMin: 0, yMax: 100 });
  });

  it('returns a sensible default when only thresholds exist', () => {
    const out = getLineThresholdBounds(
      [],
      [
        { id: 't1', label: 'T1', value: 0 },
        { id: 't2', label: 'T2', value: 50 },
      ],
    );
    expect(out.yMin).toBe(0);
    expect(out.yMax).toBe(50);
    // x bounds fall back to defaults when no series provide x values.
    expect(out.xMin).toBe(0);
    expect(out.xMax).toBe(1);
  });

  it('excludes hidden series', () => {
    expect(
      getLineThresholdBounds(
        [
          { id: 'a', label: 'A', data: [{ x: 1, y: 1 }] },
          { id: 'b', label: 'B', data: [{ x: 100, y: 100 }] },
        ],
        [],
        ['b'],
      ),
    ).toEqual({ xMin: 0.5, xMax: 1.5, yMin: 0.5, yMax: 1.5 });
  });
});

describe('chart-line-threshold / getLineThresholdTicks', () => {
  it('returns evenly-spaced ticks', () => {
    const ticks = getLineThresholdTicks(0, 10, 5);
    expect(ticks).toHaveLength(5);
    expect(ticks[0]!.value).toBe(0);
    expect(ticks[4]!.value).toBe(10);
  });

  it('returns [] for invalid range', () => {
    expect(getLineThresholdTicks(10, 5, 4)).toEqual([]);
  });
});

describe('chart-line-threshold / buildLineThresholdPath', () => {
  it('returns "" for empty input', () => {
    expect(buildLineThresholdPath([])).toBe('');
  });

  it('returns M-only for single point', () => {
    expect(buildLineThresholdPath([{ px: 5, py: 10 }])).toBe(
      'M 5.000 10.000',
    );
  });

  it('emits one L per additional point', () => {
    const out = buildLineThresholdPath([
      { px: 0, py: 0 },
      { px: 10, py: 5 },
      { px: 20, py: 0 },
    ]);
    expect((out.match(/L /g) ?? []).length).toBe(2);
  });
});

describe('chart-line-threshold / classifyLineThresholdPoint', () => {
  it('classifies above when y > threshold value', () => {
    const out = classifyLineThresholdPoint(15, { value: 10 });
    expect(out.isAbove).toBe(true);
    expect(out.isBelow).toBe(false);
  });

  it('classifies below when y < threshold value', () => {
    const out = classifyLineThresholdPoint(5, { value: 10 });
    expect(out.isAbove).toBe(false);
    expect(out.isBelow).toBe(true);
  });

  it('classifies neither when y === threshold value', () => {
    const out = classifyLineThresholdPoint(10, { value: 10 });
    expect(out.isAbove).toBe(false);
    expect(out.isBelow).toBe(false);
  });

  it('marks isInZone for above-zone hits', () => {
    expect(
      classifyLineThresholdPoint(15, { value: 10, zone: 'above' }).isInZone,
    ).toBe(true);
    expect(
      classifyLineThresholdPoint(5, { value: 10, zone: 'above' }).isInZone,
    ).toBe(false);
  });

  it('marks isInZone for below-zone hits', () => {
    expect(
      classifyLineThresholdPoint(5, { value: 10, zone: 'below' }).isInZone,
    ).toBe(true);
    expect(
      classifyLineThresholdPoint(15, { value: 10, zone: 'below' }).isInZone,
    ).toBe(false);
  });

  it('never marks isInZone when zone="none"', () => {
    expect(
      classifyLineThresholdPoint(15, { value: 10, zone: 'none' }).isInZone,
    ).toBe(false);
    expect(
      classifyLineThresholdPoint(5, { value: 10 }).isInZone,
    ).toBe(false);
  });

  it('returns neither for non-finite inputs', () => {
    const out = classifyLineThresholdPoint(NaN, { value: 10 });
    expect(out.isAbove).toBe(false);
    expect(out.isBelow).toBe(false);
    expect(out.isInZone).toBe(false);
  });
});

describe('chart-line-threshold / computeLineThresholdLayout', () => {
  it('returns empty when canvas is degenerate', () => {
    expect(
      computeLineThresholdLayout({
        series: [{ id: 'a', label: 'A', data: [{ x: 1, y: 1 }] }],
        width: 10,
        height: 10,
        padding: 100,
      }).series,
    ).toEqual([]);
  });

  it('returns empty when no series and no thresholds', () => {
    expect(
      computeLineThresholdLayout({
        series: [],
        thresholds: [],
        width: 500,
        height: 200,
        padding: 20,
      }).series,
    ).toEqual([]);
  });

  it('still emits thresholds when no series', () => {
    const out = computeLineThresholdLayout({
      series: [],
      thresholds: [{ id: 't1', label: 'T1', value: 50 }],
      yMin: 0,
      yMax: 100,
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.series).toEqual([]);
    expect(out.thresholds).toHaveLength(1);
    expect(out.thresholds[0]!.inRange).toBe(true);
  });

  it('returns empty thresholds list when no thresholds passed', () => {
    expect(
      computeLineThresholdLayout({
        series: [{ id: 'a', label: 'A', data: [{ x: 1, y: 1 }] }],
        width: 500,
        height: 200,
        padding: 40,
      }).thresholds,
    ).toEqual([]);
  });

  it('flags inRange=false for thresholds outside the explicit y bounds', () => {
    const out = computeLineThresholdLayout({
      series: [],
      thresholds: [
        { id: 't1', label: 'T1', value: 50 },
        { id: 't2', label: 'T2', value: 500 },
      ],
      yMin: 0,
      yMax: 100,
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.thresholds[0]!.inRange).toBe(true);
    expect(out.thresholds[1]!.inRange).toBe(false);
  });

  it('computes a non-empty above-zone rectangle', () => {
    const out = computeLineThresholdLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: 0 },
            { x: 1, y: 100 },
          ],
        },
      ],
      thresholds: [{ id: 't1', label: 'T1', value: 80, zone: 'above' }],
      yMin: 0,
      yMax: 100,
      width: 500,
      height: 200,
      padding: 40,
    });
    const t = out.thresholds[0]!;
    expect(t.zone).toBe('above');
    expect(t.zoneHeight).toBeGreaterThan(0);
    // above-zone starts at padding (top) and extends down to threshold py.
    expect(t.zoneY).toBe(40);
  });

  it('computes a non-empty below-zone rectangle', () => {
    const out = computeLineThresholdLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: 0 },
            { x: 1, y: 100 },
          ],
        },
      ],
      thresholds: [{ id: 't1', label: 'T1', value: 20, zone: 'below' }],
      yMin: 0,
      yMax: 100,
      width: 500,
      height: 200,
      padding: 40,
    });
    const t = out.thresholds[0]!;
    expect(t.zone).toBe('below');
    expect(t.zoneHeight).toBeGreaterThan(0);
    // below-zone starts at threshold py and extends down to padding + innerHeight.
    expect(t.zoneY).toBe(t.py);
  });

  it('records zone=none with zero zoneHeight when not specified', () => {
    const out = computeLineThresholdLayout({
      series: [],
      thresholds: [{ id: 't1', label: 'T1', value: 50 }],
      yMin: 0,
      yMax: 100,
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.thresholds[0]!.zone).toBe('none');
    expect(out.thresholds[0]!.zoneHeight).toBe(0);
  });

  it('classifies per-point threshold state', () => {
    const out = computeLineThresholdLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: 10 },
            { x: 1, y: 50 },
            { x: 2, y: 90 },
          ],
        },
      ],
      thresholds: [{ id: 't1', label: 'T1', value: 50, zone: 'above' }],
      yMin: 0,
      yMax: 100,
      width: 500,
      height: 200,
      padding: 40,
    });
    const pts = out.series[0]!.points;
    expect(pts[0]!.thresholdState[0]!.isAbove).toBe(false);
    expect(pts[0]!.thresholdState[0]!.isInZone).toBe(false);
    expect(pts[1]!.thresholdState[0]!.isAbove).toBe(false); // y=50 == threshold
    expect(pts[1]!.thresholdState[0]!.isInZone).toBe(false);
    expect(pts[2]!.thresholdState[0]!.isAbove).toBe(true);
    expect(pts[2]!.thresholdState[0]!.isInZone).toBe(true);
  });

  it('drops non-finite center points but keeps totalCount', () => {
    const out = computeLineThresholdLayout({
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
    const out = computeLineThresholdLayout({
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

  it('uses default color and dash when threshold options absent', () => {
    const out = computeLineThresholdLayout({
      series: [],
      thresholds: [{ id: 't', label: 'T', value: 50 }],
      yMin: 0,
      yMax: 100,
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.thresholds[0]!.color).toBe(
      DEFAULT_CHART_LINE_THRESHOLD_DEFAULT_COLOR,
    );
    expect(out.thresholds[0]!.dashArray).toBe(
      DEFAULT_CHART_LINE_THRESHOLD_REFERENCE_DASH,
    );
  });

  it('honours per-threshold color and dash overrides', () => {
    const out = computeLineThresholdLayout({
      series: [],
      thresholds: [
        {
          id: 't',
          label: 'T',
          value: 50,
          color: '#abcdef',
          dashArray: '20 5',
        },
      ],
      yMin: 0,
      yMax: 100,
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.thresholds[0]!.color).toBe('#abcdef');
    expect(out.thresholds[0]!.dashArray).toBe('20 5');
  });
});

describe('chart-line-threshold / describeLineThresholdChart', () => {
  it('returns "No data" when empty everywhere', () => {
    expect(describeLineThresholdChart([], [])).toBe('No data');
  });

  it('summarises with N series and M thresholds', () => {
    const out = describeLineThresholdChart(
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
      [
        { id: 't1', label: 'Warning', value: 80, zone: 'above' },
        { id: 't2', label: 'Critical', value: 95 },
      ],
    );
    expect(out).toContain('1 series');
    expect(out).toContain('2 points');
    expect(out).toContain('2 thresholds');
    expect(out).toContain('Warning');
    expect(out).toContain('zone above');
    expect(out).toContain('Critical');
  });

  it('handles singular vs plural threshold count', () => {
    const out = describeLineThresholdChart(
      [{ id: 'a', label: 'A', data: [{ x: 0, y: 1 }] }],
      [{ id: 't', label: 'T', value: 80 }],
    );
    expect(out).toContain('1 threshold.');
  });

  it('excludes hidden series from the count', () => {
    const out = describeLineThresholdChart(
      [
        { id: 'a', label: 'A', data: [{ x: 0, y: 1 }] },
        { id: 'b', label: 'B', data: [{ x: 0, y: 2 }] },
      ],
      [],
      ['b'],
    );
    expect(out).toContain('1 series');
  });
});

const FIXTURE: ChartLineThresholdSeries[] = [
  {
    id: 'a',
    label: 'p95 latency',
    data: [
      { x: 0, y: 30 },
      { x: 1, y: 55 },
      { x: 2, y: 75 },
      { x: 3, y: 92 },
      { x: 4, y: 110 },
    ],
  },
];

const THRESHOLDS: ChartLineThresholdSpec[] = [
  {
    id: 't1',
    label: 'Warning',
    value: 80,
    zone: 'above',
    color: '#f59e0b',
  },
  {
    id: 't2',
    label: 'Critical',
    value: 100,
    zone: 'above',
    color: '#dc2626',
  },
];

describe('chart-line-threshold / <ChartLineThreshold>', () => {
  it('renders a root region with the default aria label', () => {
    render(<ChartLineThreshold series={FIXTURE} thresholds={THRESHOLDS} />);
    const root = document.querySelector(
      '[data-section="chart-line-threshold"]',
    )!;
    expect(root.getAttribute('aria-label')).toBe(
      'Line chart with thresholds',
    );
  });

  it('exposes series + threshold counts as data attrs', () => {
    render(<ChartLineThreshold series={FIXTURE} thresholds={THRESHOLDS} />);
    const root = document.querySelector(
      '[data-section="chart-line-threshold"]',
    )!;
    expect(root.getAttribute('data-series-count')).toBe('1');
    expect(root.getAttribute('data-visible-series-count')).toBe('1');
    expect(root.getAttribute('data-total-points')).toBe('5');
    expect(root.getAttribute('data-threshold-count')).toBe('2');
  });

  it('renders an aria description with summary text', () => {
    render(<ChartLineThreshold series={FIXTURE} thresholds={THRESHOLDS} />);
    const desc = document.querySelector(
      '[data-section="chart-line-threshold-aria-desc"]',
    );
    expect(desc?.textContent ?? '').toContain('2 thresholds');
    expect(desc?.textContent ?? '').toContain('Warning');
  });

  it('respects a custom aria description', () => {
    render(
      <ChartLineThreshold
        series={FIXTURE}
        thresholds={THRESHOLDS}
        ariaDescription="custom"
      />,
    );
    expect(
      document.querySelector('[data-section="chart-line-threshold-aria-desc"]')
        ?.textContent,
    ).toBe('custom');
  });

  it('renders one reference line per threshold', () => {
    render(<ChartLineThreshold series={FIXTURE} thresholds={THRESHOLDS} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-threshold-reference-line"]',
      ).length,
    ).toBe(2);
  });

  it('renders one zone rectangle per zone-shaded threshold', () => {
    render(<ChartLineThreshold series={FIXTURE} thresholds={THRESHOLDS} />);
    const zones = document.querySelectorAll(
      '[data-section="chart-line-threshold-zone"]',
    );
    expect(zones.length).toBe(2);
    expect(zones[0]!.getAttribute('data-threshold-zone')).toBe('above');
  });

  it('omits zones when showZones=false', () => {
    render(
      <ChartLineThreshold
        series={FIXTURE}
        thresholds={THRESHOLDS}
        showZones={false}
      />,
    );
    expect(
      document.querySelectorAll('[data-section="chart-line-threshold-zone"]')
        .length,
    ).toBe(0);
  });

  it('renders a threshold legend item per threshold', () => {
    render(<ChartLineThreshold series={FIXTURE} thresholds={THRESHOLDS} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-threshold-legend-threshold"]',
      ).length,
    ).toBe(2);
  });

  it('omits threshold-label text when showThresholdLabels=false', () => {
    render(
      <ChartLineThreshold
        series={FIXTURE}
        thresholds={THRESHOLDS}
        showThresholdLabels={false}
      />,
    );
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-threshold-reference-label"]',
      ).length,
    ).toBe(0);
  });

  it('shows zone shading for above zone but not for none-zone threshold', () => {
    render(
      <ChartLineThreshold
        series={FIXTURE}
        thresholds={[
          { id: 't1', label: 'Warning', value: 80, zone: 'above' },
          { id: 't2', label: 'Floor', value: 20 }, // zone='none' implicit
        ]}
      />,
    );
    const zones = document.querySelectorAll(
      '[data-section="chart-line-threshold-zone"]',
    );
    expect(zones.length).toBe(1);
    expect(zones[0]!.getAttribute('data-threshold-id')).toBe('t1');
  });

  it('renders one path + N dots for the series', () => {
    render(<ChartLineThreshold series={FIXTURE} thresholds={THRESHOLDS} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-threshold-path"]')
        .length,
    ).toBe(1);
    expect(
      document.querySelectorAll('[data-section="chart-line-threshold-dot"]')
        .length,
    ).toBe(5);
  });

  it('marks per-dot data-in-zone when the point crosses a zone threshold', () => {
    render(<ChartLineThreshold series={FIXTURE} thresholds={THRESHOLDS} />);
    const dots = document.querySelectorAll(
      '[data-section="chart-line-threshold-dot"]',
    );
    // Series values: 30, 55, 75, 92, 110.
    // Warning at 80 (above zone) -> 92, 110 in zone.
    // Critical at 100 (above zone) -> 110 in zone.
    // So dots 0..2 are NOT in any zone, dots 3..4 ARE.
    expect(dots[0]!.getAttribute('data-in-zone')).toBe('false');
    expect(dots[1]!.getAttribute('data-in-zone')).toBe('false');
    expect(dots[2]!.getAttribute('data-in-zone')).toBe('false');
    expect(dots[3]!.getAttribute('data-in-zone')).toBe('true');
    expect(dots[4]!.getAttribute('data-in-zone')).toBe('true');
  });

  it('shows tooltip on dot hover with crossed thresholds line', () => {
    render(<ChartLineThreshold series={FIXTURE} thresholds={THRESHOLDS} />);
    const dot = document.querySelectorAll(
      '[data-section="chart-line-threshold-dot"]',
    )[4] as SVGElement; // y=110, crosses both
    fireEvent.mouseEnter(dot);
    const tip = document.querySelector(
      '[data-section="chart-line-threshold-tooltip"]',
    );
    expect(tip).not.toBeNull();
    const crossedRow = document.querySelector(
      '[data-section="chart-line-threshold-tooltip-crossed"]',
    );
    expect(crossedRow).not.toBeNull();
    expect(crossedRow!.textContent).toContain('Warning');
    expect(crossedRow!.textContent).toContain('Critical');
  });

  it('hides the crossed row when no threshold is crossed', () => {
    render(<ChartLineThreshold series={FIXTURE} thresholds={THRESHOLDS} />);
    const dot = document.querySelectorAll(
      '[data-section="chart-line-threshold-dot"]',
    )[0] as SVGElement; // y=30, below all
    fireEvent.mouseEnter(dot);
    expect(
      document.querySelector(
        '[data-section="chart-line-threshold-tooltip-crossed"]',
      ),
    ).toBeNull();
  });

  it('hides tooltip on mouse leave', () => {
    render(<ChartLineThreshold series={FIXTURE} thresholds={THRESHOLDS} />);
    const dot = document.querySelector(
      '[data-section="chart-line-threshold-dot"]',
    ) as SVGElement;
    fireEvent.mouseEnter(dot);
    fireEvent.mouseLeave(dot);
    expect(
      document.querySelector('[data-section="chart-line-threshold-tooltip"]'),
    ).toBeNull();
  });

  it('fires onPointClick with series + point', () => {
    const handler = vi.fn();
    render(
      <ChartLineThreshold
        series={FIXTURE}
        thresholds={THRESHOLDS}
        onPointClick={handler}
      />,
    );
    const dot = document.querySelectorAll(
      '[data-section="chart-line-threshold-dot"]',
    )[0] as SVGElement;
    fireEvent.click(dot);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0]!.series.id).toBe('a');
  });

  it('renders empty state when no series and no thresholds', () => {
    render(<ChartLineThreshold series={[]} />);
    expect(
      document.querySelector('[data-section="chart-line-threshold-aria-desc"]')
        ?.textContent,
    ).toBe('No data');
  });

  it('toggles hidden state via legend (uncontrolled)', () => {
    const fixture = [
      ...FIXTURE,
      { id: 'b', label: 'p99', data: [{ x: 0, y: 60 }] },
    ];
    render(<ChartLineThreshold series={fixture} thresholds={THRESHOLDS} />);
    const btn = document.querySelector(
      '[data-section="chart-line-threshold-legend-item"][data-series-id="a"] [data-section="chart-line-threshold-legend-button"]',
    ) as HTMLElement;
    fireEvent.click(btn);
    const item = document.querySelector(
      '[data-section="chart-line-threshold-legend-item"][data-series-id="a"]',
    )!;
    expect(item.getAttribute('data-hidden')).toBe('true');
  });

  it('fires onSeriesToggle with the hidden flag', () => {
    const handler = vi.fn();
    render(
      <ChartLineThreshold
        series={FIXTURE}
        thresholds={THRESHOLDS}
        onSeriesToggle={handler}
      />,
    );
    const btn = document.querySelector(
      '[data-section="chart-line-threshold-legend-item"][data-series-id="a"] [data-section="chart-line-threshold-legend-button"]',
    ) as HTMLElement;
    fireEvent.click(btn);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0]!.hidden).toBe(true);
  });

  it('respects defaultHiddenSeries on mount', () => {
    render(
      <ChartLineThreshold
        series={FIXTURE}
        thresholds={THRESHOLDS}
        defaultHiddenSeries={['a']}
      />,
    );
    const item = document.querySelector(
      '[data-section="chart-line-threshold-legend-item"][data-series-id="a"]',
    )!;
    expect(item.getAttribute('data-hidden')).toBe('true');
  });

  it('hides axis when showAxis=false', () => {
    render(
      <ChartLineThreshold
        series={FIXTURE}
        thresholds={THRESHOLDS}
        showAxis={false}
      />,
    );
    expect(
      document.querySelector('[data-section="chart-line-threshold-axes"]'),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    render(
      <ChartLineThreshold
        series={FIXTURE}
        thresholds={THRESHOLDS}
        showGrid={false}
      />,
    );
    expect(
      document.querySelector('[data-section="chart-line-threshold-grid"]'),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    render(
      <ChartLineThreshold
        series={FIXTURE}
        thresholds={THRESHOLDS}
        showLegend={false}
      />,
    );
    expect(
      document.querySelector('[data-section="chart-line-threshold-legend"]'),
    ).toBeNull();
  });

  it('applies the animate flag to the data attribute', () => {
    render(
      <ChartLineThreshold
        series={FIXTURE}
        thresholds={THRESHOLDS}
        animate={false}
      />,
    );
    const root = document.querySelector(
      '[data-section="chart-line-threshold"]',
    )!;
    expect(root.getAttribute('data-animate')).toBe('false');
  });

  it('exposes threshold data attrs on reference groups', () => {
    render(<ChartLineThreshold series={FIXTURE} thresholds={THRESHOLDS} />);
    const ref = document.querySelectorAll(
      '[data-section="chart-line-threshold-reference"]',
    )[0]!;
    expect(ref.getAttribute('data-threshold-id')).toBe('t1');
    expect(ref.getAttribute('data-threshold-value')).toBe('80');
    expect(ref.getAttribute('data-threshold-zone')).toBe('above');
    expect(ref.getAttribute('data-threshold-color')).toBe('#f59e0b');
  });

  it('uses formatValue / formatX for axis ticks', () => {
    render(
      <ChartLineThreshold
        series={FIXTURE}
        thresholds={THRESHOLDS}
        formatValue={(n) => `y${n}`}
        formatX={(n) => `x${n}`}
      />,
    );
    const xLabel = document.querySelector(
      '[data-section="chart-line-threshold-tick-label"][data-axis="x"]',
    );
    const yLabel = document.querySelector(
      '[data-section="chart-line-threshold-tick-label"][data-axis="y"]',
    );
    expect(xLabel?.textContent?.startsWith('x')).toBe(true);
    expect(yLabel?.textContent?.startsWith('y')).toBe(true);
  });

  it('threshold label includes the formatted value', () => {
    render(
      <ChartLineThreshold
        series={FIXTURE}
        thresholds={THRESHOLDS}
        formatValue={(n) => `${n}ms`}
      />,
    );
    const lbls = document.querySelectorAll(
      '[data-section="chart-line-threshold-reference-label"]',
    );
    expect(lbls[0]?.textContent).toContain('80ms');
    expect(lbls[1]?.textContent).toContain('100ms');
  });

  it('renders empty when only thresholds and showLegend=false', () => {
    render(
      <ChartLineThreshold
        series={[]}
        thresholds={THRESHOLDS}
        showLegend={false}
      />,
    );
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-threshold-reference-line"]',
      ).length,
    ).toBe(2);
  });

  it('sets data-hovered on the hovered dot and parent series group', () => {
    render(<ChartLineThreshold series={FIXTURE} thresholds={THRESHOLDS} />);
    const dot = document.querySelectorAll(
      '[data-section="chart-line-threshold-dot"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(dot);
    expect(dot.getAttribute('data-hovered')).toBe('true');
    const grp = document.querySelector(
      '[data-section="chart-line-threshold-series-group"][data-series-id="a"]',
    )!;
    expect(grp.getAttribute('data-hovered')).toBe('true');
  });

  it('renders grid lines per tick when showGrid=true', () => {
    render(
      <ChartLineThreshold
        series={FIXTURE}
        thresholds={THRESHOLDS}
        tickCount={4}
      />,
    );
    const lines = document.querySelectorAll(
      '[data-section="chart-line-threshold-grid-line"]',
    );
    expect(lines.length).toBeGreaterThan(0);
  });

  it('renders threshold reference aria-label with value and zone', () => {
    render(<ChartLineThreshold series={FIXTURE} thresholds={THRESHOLDS} />);
    const refLine = document.querySelectorAll(
      '[data-section="chart-line-threshold-reference-line"]',
    )[0] as SVGElement;
    const aria = refLine.getAttribute('aria-label') ?? '';
    expect(aria).toContain('Warning');
    expect(aria).toContain('80');
    expect(aria).toContain('above');
  });
});
