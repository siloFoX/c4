import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

import {
  ChartLineConfidence,
  DEFAULT_CHART_LINE_CONFIDENCE_WIDTH,
  DEFAULT_CHART_LINE_CONFIDENCE_HEIGHT,
  DEFAULT_CHART_LINE_CONFIDENCE_PADDING,
  DEFAULT_CHART_LINE_CONFIDENCE_TICK_COUNT,
  DEFAULT_CHART_LINE_CONFIDENCE_STROKE_WIDTH,
  DEFAULT_CHART_LINE_CONFIDENCE_DOT_RADIUS,
  DEFAULT_CHART_LINE_CONFIDENCE_LINE_OPACITY,
  DEFAULT_CHART_LINE_CONFIDENCE_BAND_OPACITY,
  DEFAULT_CHART_LINE_CONFIDENCE_BAND_STROKE_WIDTH,
  DEFAULT_CHART_LINE_CONFIDENCE_GRID_COLOR,
  DEFAULT_CHART_LINE_CONFIDENCE_AXIS_COLOR,
  DEFAULT_CHART_LINE_CONFIDENCE_PALETTE,
  buildLineConfidenceBandSegments,
  buildLineConfidenceLinePath,
  computeLineConfidenceLayout,
  describeLineConfidenceChart,
  getLineConfidenceBounds,
  getLineConfidenceDefaultColor,
  getLineConfidenceFinitePoints,
  getLineConfidenceTicks,
  type ChartLineConfidenceSeries,
} from './chart-line-confidence';

afterEach(() => {
  cleanup();
});

describe('chart-line-confidence / constants', () => {
  it('exports sensible defaults', () => {
    expect(DEFAULT_CHART_LINE_CONFIDENCE_WIDTH).toBe(560);
    expect(DEFAULT_CHART_LINE_CONFIDENCE_HEIGHT).toBe(320);
    expect(DEFAULT_CHART_LINE_CONFIDENCE_PADDING).toBe(40);
    expect(DEFAULT_CHART_LINE_CONFIDENCE_TICK_COUNT).toBe(5);
    expect(DEFAULT_CHART_LINE_CONFIDENCE_STROKE_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_CONFIDENCE_DOT_RADIUS).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_CONFIDENCE_LINE_OPACITY).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_CONFIDENCE_BAND_OPACITY).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_CONFIDENCE_BAND_OPACITY).toBeLessThan(1);
    expect(DEFAULT_CHART_LINE_CONFIDENCE_BAND_STROKE_WIDTH).toBe(0);
    expect(DEFAULT_CHART_LINE_CONFIDENCE_GRID_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_LINE_CONFIDENCE_AXIS_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_LINE_CONFIDENCE_PALETTE).toHaveLength(10);
  });
});

describe('chart-line-confidence / getLineConfidenceDefaultColor', () => {
  it('wraps with modulo', () => {
    expect(getLineConfidenceDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_CONFIDENCE_PALETTE[0],
    );
    expect(getLineConfidenceDefaultColor(10)).toBe(
      DEFAULT_CHART_LINE_CONFIDENCE_PALETTE[0],
    );
  });

  it('falls back to first colour for invalid indices', () => {
    expect(getLineConfidenceDefaultColor(-1)).toBe(
      DEFAULT_CHART_LINE_CONFIDENCE_PALETTE[0],
    );
    expect(getLineConfidenceDefaultColor(NaN)).toBe(
      DEFAULT_CHART_LINE_CONFIDENCE_PALETTE[0],
    );
  });
});

describe('chart-line-confidence / getLineConfidenceFinitePoints', () => {
  it('drops points with non-finite x or y (band fields not required)', () => {
    const out = getLineConfidenceFinitePoints([
      { x: 1, y: 1 },
      { x: NaN, y: 2, yLower: 1, yUpper: 3 },
      { x: 3, y: Infinity, yLower: 2, yUpper: 4 },
      { x: 4, y: 4, yLower: 3, yUpper: 5 },
    ]);
    expect(out.map((p) => p.x)).toEqual([1, 4]);
  });

  it('returns [] for non-array input', () => {
    expect(
      getLineConfidenceFinitePoints(null as unknown as never[]),
    ).toEqual([]);
  });
});

describe('chart-line-confidence / getLineConfidenceBounds', () => {
  it('returns unit square for empty input', () => {
    expect(getLineConfidenceBounds([])).toEqual({
      xMin: 0,
      xMax: 1,
      yMin: 0,
      yMax: 1,
    });
  });

  it('includes lower and upper bounds in the range when valid', () => {
    expect(
      getLineConfidenceBounds([
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: 5, yLower: 1, yUpper: 9 },
            { x: 1, y: 5, yLower: 2, yUpper: 8 },
          ],
        },
      ]),
    ).toEqual({ xMin: 0, xMax: 1, yMin: 1, yMax: 9 });
  });

  it('excludes band when showBand is false', () => {
    expect(
      getLineConfidenceBounds([
        {
          id: 'a',
          label: 'A',
          showBand: false,
          data: [
            { x: 0, y: 5, yLower: -100, yUpper: 100 },
            { x: 1, y: 6, yLower: -100, yUpper: 100 },
          ],
        },
      ]),
    ).toEqual({ xMin: 0, xMax: 1, yMin: 5, yMax: 6 });
  });

  it('excludes hidden series', () => {
    expect(
      getLineConfidenceBounds(
        [
          { id: 'a', label: 'A', data: [{ x: 1, y: 1 }] },
          { id: 'b', label: 'B', data: [{ x: 100, y: 100 }] },
        ],
        ['b'],
      ),
    ).toEqual({ xMin: 0.5, xMax: 1.5, yMin: 0.5, yMax: 1.5 });
  });

  it('ignores partial / inverted band data', () => {
    expect(
      getLineConfidenceBounds([
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: 5, yLower: NaN, yUpper: 9 },
            { x: 1, y: 5, yLower: 9, yUpper: 1 },
            { x: 2, y: 5 },
          ],
        },
      ]),
    ).toEqual({ xMin: 0, xMax: 2, yMin: 4.5, yMax: 5.5 });
  });
});

describe('chart-line-confidence / getLineConfidenceTicks', () => {
  it('returns evenly-spaced ticks', () => {
    const ticks = getLineConfidenceTicks(0, 10, 5);
    expect(ticks).toHaveLength(5);
    expect(ticks[0]!.value).toBe(0);
    expect(ticks[4]!.value).toBe(10);
  });

  it('returns [] for invalid range', () => {
    expect(getLineConfidenceTicks(10, 5, 4)).toEqual([]);
  });
});

describe('chart-line-confidence / buildLineConfidenceLinePath', () => {
  it('returns "" for empty input', () => {
    expect(buildLineConfidenceLinePath([])).toBe('');
  });

  it('returns M-only for single point', () => {
    expect(buildLineConfidenceLinePath([{ px: 5, py: 10 }])).toBe(
      'M 5.000 10.000',
    );
  });

  it('emits one L per additional point', () => {
    const out = buildLineConfidenceLinePath([
      { px: 0, py: 0 },
      { px: 10, py: 5 },
      { px: 20, py: 0 },
    ]);
    expect((out.match(/L /g) ?? []).length).toBe(2);
  });
});

describe('chart-line-confidence / buildLineConfidenceBandSegments', () => {
  it('returns [] for empty input', () => {
    expect(buildLineConfidenceBandSegments([])).toEqual([]);
  });

  it('returns [] when no points have a band', () => {
    expect(
      buildLineConfidenceBandSegments([
        { px: 0, pyLower: null, pyUpper: null, hasBand: false, index: 0 },
        { px: 10, pyLower: null, pyUpper: null, hasBand: false, index: 1 },
      ]),
    ).toEqual([]);
  });

  it('emits exactly one segment when every point has a band', () => {
    const segs = buildLineConfidenceBandSegments([
      { px: 0, pyLower: 50, pyUpper: 30, hasBand: true, index: 0 },
      { px: 10, pyLower: 60, pyUpper: 20, hasBand: true, index: 1 },
      { px: 20, pyLower: 55, pyUpper: 25, hasBand: true, index: 2 },
    ]);
    expect(segs).toHaveLength(1);
    expect(segs[0]!.startIndex).toBe(0);
    expect(segs[0]!.endIndex).toBe(2);
    expect(segs[0]!.pointCount).toBe(3);
    expect(segs[0]!.path.startsWith('M ')).toBe(true);
    expect(segs[0]!.path.endsWith(' Z')).toBe(true);
  });

  it('emits one closed band polygon (N + N + 1 commands)', () => {
    const segs = buildLineConfidenceBandSegments([
      { px: 0, pyLower: 50, pyUpper: 30, hasBand: true, index: 0 },
      { px: 10, pyLower: 60, pyUpper: 20, hasBand: true, index: 1 },
    ]);
    const path = segs[0]!.path;
    expect((path.match(/M /g) ?? []).length).toBe(1);
    expect((path.match(/L /g) ?? []).length).toBe(3);
    expect((path.match(/ Z$/) ?? []).length).toBe(1);
  });

  it('splits into multiple segments when band gaps exist', () => {
    const segs = buildLineConfidenceBandSegments([
      { px: 0, pyLower: 50, pyUpper: 30, hasBand: true, index: 0 },
      { px: 10, pyLower: 60, pyUpper: 20, hasBand: true, index: 1 },
      { px: 20, pyLower: null, pyUpper: null, hasBand: false, index: 2 },
      { px: 30, pyLower: 65, pyUpper: 15, hasBand: true, index: 3 },
      { px: 40, pyLower: 55, pyUpper: 25, hasBand: true, index: 4 },
    ]);
    expect(segs).toHaveLength(2);
    expect(segs[0]!.startIndex).toBe(0);
    expect(segs[0]!.endIndex).toBe(1);
    expect(segs[1]!.startIndex).toBe(3);
    expect(segs[1]!.endIndex).toBe(4);
  });

  it('discards isolated single-point bands', () => {
    const segs = buildLineConfidenceBandSegments([
      { px: 0, pyLower: 50, pyUpper: 30, hasBand: true, index: 0 },
      { px: 10, pyLower: null, pyUpper: null, hasBand: false, index: 1 },
      { px: 20, pyLower: 50, pyUpper: 30, hasBand: true, index: 2 },
      { px: 30, pyLower: 55, pyUpper: 25, hasBand: true, index: 3 },
    ]);
    expect(segs).toHaveLength(1);
    expect(segs[0]!.startIndex).toBe(2);
    expect(segs[0]!.endIndex).toBe(3);
  });

  it('records forward-then-reversed point ordering in the path', () => {
    const segs = buildLineConfidenceBandSegments([
      { px: 0, pyLower: 50, pyUpper: 30, hasBand: true, index: 0 },
      { px: 10, pyLower: 60, pyUpper: 20, hasBand: true, index: 1 },
      { px: 20, pyLower: 55, pyUpper: 25, hasBand: true, index: 2 },
    ]);
    const path = segs[0]!.path;
    // Forward x: 0 -> 10 -> 20 (lower)
    // Reverse x: 20 -> 10 -> 0 (upper)
    const xs = Array.from(path.matchAll(/[ML] (\d+\.\d+) /g)).map((m) =>
      Number(m[1]),
    );
    expect(xs).toEqual([0, 10, 20, 20, 10, 0]);
  });
});

describe('chart-line-confidence / computeLineConfidenceLayout', () => {
  it('returns empty when canvas is degenerate', () => {
    expect(
      computeLineConfidenceLayout({
        series: [{ id: 'a', label: 'A', data: [{ x: 1, y: 1 }] }],
        width: 10,
        height: 10,
        padding: 100,
      }).series,
    ).toEqual([]);
  });

  it('returns empty when no series', () => {
    expect(
      computeLineConfidenceLayout({
        series: [],
        width: 500,
        height: 200,
        padding: 20,
      }).series,
    ).toEqual([]);
  });

  it('returns empty when every series is hidden', () => {
    expect(
      computeLineConfidenceLayout({
        series: [{ id: 'a', label: 'A', data: [{ x: 1, y: 1 }] }],
        hidden: ['a'],
        width: 500,
        height: 200,
        padding: 20,
      }).series,
    ).toEqual([]);
  });

  it('builds a band segment for the series', () => {
    const out = computeLineConfidenceLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: 5, yLower: 3, yUpper: 7 },
            { x: 5, y: 6, yLower: 4, yUpper: 8 },
            { x: 10, y: 5, yLower: 3, yUpper: 7 },
          ],
        },
      ],
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.series[0]!.bandSegments).toHaveLength(1);
    expect(out.series[0]!.bandSegments[0]!.pointCount).toBe(3);
    expect(out.series[0]!.bandCount).toBe(3);
  });

  it('respects showBand=false on a series', () => {
    const out = computeLineConfidenceLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          showBand: false,
          data: [
            { x: 0, y: 5, yLower: 3, yUpper: 7 },
            { x: 5, y: 6, yLower: 4, yUpper: 8 },
          ],
        },
      ],
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.series[0]!.bandSegments).toEqual([]);
    expect(out.series[0]!.bandCount).toBe(0);
  });

  it('splits band segments around invalid points', () => {
    const out = computeLineConfidenceLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: 1, yLower: 0, yUpper: 2 },
            { x: 1, y: 1, yLower: 0, yUpper: 2 },
            { x: 2, y: 1 },
            { x: 3, y: 1, yLower: 0, yUpper: 2 },
            { x: 4, y: 1, yLower: 0, yUpper: 2 },
          ],
        },
      ],
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.series[0]!.bandSegments).toHaveLength(2);
  });

  it('maps band positions to pixel space', () => {
    const out = computeLineConfidenceLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: 5, yLower: 0, yUpper: 10 },
            { x: 10, y: 5, yLower: 0, yUpper: 10 },
          ],
        },
      ],
      yMin: 0,
      yMax: 10,
      width: 500,
      height: 200,
      padding: 40,
    });
    const p = out.series[0]!.points[0]!;
    expect(p.pyLower).toBeCloseTo(40 + 120, 5);
    expect(p.pyUpper).toBeCloseTo(40, 5);
    expect(p.hasBand).toBe(true);
  });

  it('drops non-finite center points but keeps totalCount', () => {
    const out = computeLineConfidenceLayout({
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

  it('builds a line path through the central points', () => {
    const out = computeLineConfidenceLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: 0, yLower: -1, yUpper: 1 },
            { x: 10, y: 10, yLower: 9, yUpper: 11 },
          ],
        },
      ],
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.series[0]!.linePath.startsWith('M ')).toBe(true);
    expect(out.series[0]!.linePath).toContain('L ');
  });

  it('records series index across hidden-series filter', () => {
    const out = computeLineConfidenceLayout({
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

  it('marks per-point hasBand only when bounds are valid', () => {
    const out = computeLineConfidenceLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: 1, yLower: 0, yUpper: 2 },
            { x: 1, y: 1 },
            { x: 2, y: 1, yLower: 5, yUpper: 0 }, // inverted -> rejected
          ],
        },
      ],
      width: 500,
      height: 200,
      padding: 40,
    });
    const pts = out.series[0]!.points;
    expect(pts[0]!.hasBand).toBe(true);
    expect(pts[1]!.hasBand).toBe(false);
    expect(pts[2]!.hasBand).toBe(false);
  });
});

describe('chart-line-confidence / describeLineConfidenceChart', () => {
  it('returns "No data" when empty', () => {
    expect(describeLineConfidenceChart([])).toBe('No data');
  });

  it('returns "No data" when no finite points', () => {
    expect(
      describeLineConfidenceChart([
        {
          id: 'a',
          label: 'A',
          data: [{ x: NaN, y: 1 } as { x: number; y: number }],
        },
      ]),
    ).toBe('No data');
  });

  it('summarises series count, total points, and band count', () => {
    const out = describeLineConfidenceChart([
      {
        id: 'a',
        label: 'A',
        data: [
          { x: 0, y: 1, yLower: 0, yUpper: 2 },
          { x: 1, y: 2 },
          { x: 2, y: 3, yLower: 2, yUpper: 4 },
        ],
      },
    ]);
    expect(out).toContain('1 series');
    expect(out).toContain('3 points');
    expect(out).toContain('2 with bands');
  });

  it('excludes hidden series from the summary', () => {
    const out = describeLineConfidenceChart(
      [
        { id: 'a', label: 'A', data: [{ x: 0, y: 1, yLower: 0, yUpper: 2 }] },
        {
          id: 'b',
          label: 'B',
          data: [{ x: 0, y: 100, yLower: -1, yUpper: 200 }],
        },
      ],
      ['b'],
    );
    expect(out).toContain('1 series');
  });
});

const FIXTURE: ChartLineConfidenceSeries[] = [
  {
    id: 'a',
    label: 'Forecast',
    data: [
      { x: 0, y: 10, yLower: 8, yUpper: 12 },
      { x: 1, y: 12, yLower: 9, yUpper: 15 },
      { x: 2, y: 14, yLower: 10, yUpper: 18 },
      { x: 3, y: 16, yLower: 11, yUpper: 21 },
    ],
  },
  {
    id: 'b',
    label: 'Baseline',
    showBand: false,
    data: [
      { x: 0, y: 11 },
      { x: 1, y: 11 },
      { x: 2, y: 11 },
      { x: 3, y: 11 },
    ],
  },
];

describe('chart-line-confidence / <ChartLineConfidence>', () => {
  it('renders a root region with the default aria label', () => {
    render(<ChartLineConfidence series={FIXTURE} />);
    const root = document.querySelector(
      '[data-section="chart-line-confidence"]',
    )!;
    expect(root.getAttribute('aria-label')).toBe(
      'Line chart with confidence band',
    );
  });

  it('exposes series + band counts as data attrs', () => {
    render(<ChartLineConfidence series={FIXTURE} />);
    const root = document.querySelector(
      '[data-section="chart-line-confidence"]',
    )!;
    expect(root.getAttribute('data-series-count')).toBe('2');
    expect(root.getAttribute('data-visible-series-count')).toBe('2');
    expect(root.getAttribute('data-total-points')).toBe('8');
    expect(root.getAttribute('data-band-count')).toBe('4');
  });

  it('renders an aria description with summary text', () => {
    render(<ChartLineConfidence series={FIXTURE} />);
    expect(
      document.querySelector('[data-section="chart-line-confidence-aria-desc"]')
        ?.textContent ?? '',
    ).toContain('4 with bands');
  });

  it('respects a custom aria description', () => {
    render(<ChartLineConfidence series={FIXTURE} ariaDescription="custom" />);
    expect(
      document.querySelector('[data-section="chart-line-confidence-aria-desc"]')
        ?.textContent,
    ).toBe('custom');
  });

  it('renders one band path per series with bands', () => {
    render(<ChartLineConfidence series={FIXTURE} />);
    const bands = document.querySelectorAll(
      '[data-section="chart-line-confidence-band"]',
    );
    expect(bands.length).toBe(1);
    expect(bands[0]!.getAttribute('data-series-id')).toBe('a');
  });

  it('skips band rendering when series.showBand=false', () => {
    render(<ChartLineConfidence series={FIXTURE} />);
    const bandsB = document.querySelectorAll(
      '[data-section="chart-line-confidence-band"][data-series-id="b"]',
    );
    expect(bandsB.length).toBe(0);
  });

  it('renders one path per visible series', () => {
    render(<ChartLineConfidence series={FIXTURE} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-confidence-path"]')
        .length,
    ).toBe(2);
  });

  it('renders one dot per finite point when showDots=true', () => {
    render(<ChartLineConfidence series={FIXTURE} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-confidence-dot"]')
        .length,
    ).toBe(8);
  });

  it('omits dots when showDots=false', () => {
    render(<ChartLineConfidence series={FIXTURE} showDots={false} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-confidence-dot"]')
        .length,
    ).toBe(0);
  });

  it('shows tooltip on dot hover with band range when present', () => {
    render(<ChartLineConfidence series={FIXTURE} />);
    const dot = document.querySelector(
      '[data-section="chart-line-confidence-dot"][data-series-id="a"]',
    ) as SVGElement;
    fireEvent.mouseEnter(dot);
    const tip = document.querySelector(
      '[data-section="chart-line-confidence-tooltip"]',
    );
    expect(tip).not.toBeNull();
    expect(tip!.textContent).toContain('Forecast');
    const bandRow = document.querySelector(
      '[data-section="chart-line-confidence-tooltip-band"]',
    );
    expect(bandRow).not.toBeNull();
    expect(bandRow!.textContent).toContain('8');
    expect(bandRow!.textContent).toContain('12');
  });

  it('omits the tooltip band row when the point has no band', () => {
    render(<ChartLineConfidence series={FIXTURE} />);
    const dot = document.querySelector(
      '[data-section="chart-line-confidence-dot"][data-series-id="b"]',
    ) as SVGElement;
    fireEvent.mouseEnter(dot);
    const tip = document.querySelector(
      '[data-section="chart-line-confidence-tooltip"]',
    );
    expect(tip).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-confidence-tooltip-band"]',
      ),
    ).toBeNull();
  });

  it('hides tooltip on mouse leave', () => {
    render(<ChartLineConfidence series={FIXTURE} />);
    const dot = document.querySelector(
      '[data-section="chart-line-confidence-dot"]',
    ) as SVGElement;
    fireEvent.mouseEnter(dot);
    fireEvent.mouseLeave(dot);
    expect(
      document.querySelector('[data-section="chart-line-confidence-tooltip"]'),
    ).toBeNull();
  });

  it('fires onPointClick with series + point', () => {
    const handler = vi.fn();
    render(<ChartLineConfidence series={FIXTURE} onPointClick={handler} />);
    const dot = document.querySelectorAll(
      '[data-section="chart-line-confidence-dot"]',
    )[0] as SVGElement;
    fireEvent.click(dot);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0]!.series.id).toBe('a');
  });

  it('exposes per-dot data-has-band attr', () => {
    render(<ChartLineConfidence series={FIXTURE} />);
    const aDot = document.querySelector(
      '[data-section="chart-line-confidence-dot"][data-series-id="a"]',
    )!;
    const bDot = document.querySelector(
      '[data-section="chart-line-confidence-dot"][data-series-id="b"]',
    )!;
    expect(aDot.getAttribute('data-has-band')).toBe('true');
    expect(bDot.getAttribute('data-has-band')).toBe('false');
  });

  it('renders a legend item per series', () => {
    render(<ChartLineConfidence series={FIXTURE} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-confidence-legend-item"]',
      ).length,
    ).toBe(2);
  });

  it('toggles hidden state via legend (uncontrolled)', () => {
    render(<ChartLineConfidence series={FIXTURE} />);
    const btn = document.querySelector(
      '[data-section="chart-line-confidence-legend-item"][data-series-id="a"] [data-section="chart-line-confidence-legend-button"]',
    ) as HTMLElement;
    fireEvent.click(btn);
    const item = document.querySelector(
      '[data-section="chart-line-confidence-legend-item"][data-series-id="a"]',
    )!;
    expect(item.getAttribute('data-hidden')).toBe('true');
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-confidence-band"][data-series-id="a"]',
      ).length,
    ).toBe(0);
  });

  it('does not mutate hiddenSeries when controlled', () => {
    const handler = vi.fn();
    render(
      <ChartLineConfidence
        series={FIXTURE}
        hiddenSeries={[]}
        onHiddenSeriesChange={handler}
      />,
    );
    const btn = document.querySelector(
      '[data-section="chart-line-confidence-legend-item"][data-series-id="a"] [data-section="chart-line-confidence-legend-button"]',
    ) as HTMLElement;
    fireEvent.click(btn);
    expect(handler).toHaveBeenCalledWith(['a']);
  });

  it('fires onSeriesToggle with the hidden flag', () => {
    const handler = vi.fn();
    render(
      <ChartLineConfidence series={FIXTURE} onSeriesToggle={handler} />,
    );
    const btn = document.querySelector(
      '[data-section="chart-line-confidence-legend-item"][data-series-id="b"] [data-section="chart-line-confidence-legend-button"]',
    ) as HTMLElement;
    fireEvent.click(btn);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0]!.hidden).toBe(true);
  });

  it('respects defaultHiddenSeries on mount', () => {
    render(
      <ChartLineConfidence series={FIXTURE} defaultHiddenSeries={['a']} />,
    );
    const item = document.querySelector(
      '[data-section="chart-line-confidence-legend-item"][data-series-id="a"]',
    )!;
    expect(item.getAttribute('data-hidden')).toBe('true');
  });

  it('hides axis when showAxis=false', () => {
    render(<ChartLineConfidence series={FIXTURE} showAxis={false} />);
    expect(
      document.querySelector('[data-section="chart-line-confidence-axes"]'),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    render(<ChartLineConfidence series={FIXTURE} showGrid={false} />);
    expect(
      document.querySelector('[data-section="chart-line-confidence-grid"]'),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    render(<ChartLineConfidence series={FIXTURE} showLegend={false} />);
    expect(
      document.querySelector('[data-section="chart-line-confidence-legend"]'),
    ).toBeNull();
  });

  it('hides tooltip when showTooltip=false', () => {
    render(<ChartLineConfidence series={FIXTURE} showTooltip={false} />);
    const dot = document.querySelector(
      '[data-section="chart-line-confidence-dot"]',
    ) as SVGElement;
    fireEvent.mouseEnter(dot);
    expect(
      document.querySelector('[data-section="chart-line-confidence-tooltip"]'),
    ).toBeNull();
  });

  it('applies the animate flag to the data attribute', () => {
    render(<ChartLineConfidence series={FIXTURE} animate={false} />);
    const root = document.querySelector(
      '[data-section="chart-line-confidence"]',
    )!;
    expect(root.getAttribute('data-animate')).toBe('false');
  });

  it('renders optional axis labels', () => {
    render(
      <ChartLineConfidence series={FIXTURE} xLabel="t" yLabel="signal" />,
    );
    expect(
      document.querySelector('[data-section="chart-line-confidence-x-label"]')
        ?.textContent,
    ).toBe('t');
    expect(
      document.querySelector('[data-section="chart-line-confidence-y-label"]')
        ?.textContent,
    ).toBe('signal');
  });

  it('overrides default colour via series.color', () => {
    render(
      <ChartLineConfidence
        series={[
          {
            id: 'a',
            label: 'A',
            data: [{ x: 0, y: 0, yLower: -1, yUpper: 1 }],
            color: '#abcdef',
          },
        ]}
      />,
    );
    const grp = document.querySelector(
      '[data-section="chart-line-confidence-series-group"]',
    )!;
    expect(grp.getAttribute('data-series-color')).toBe('#abcdef');
  });

  it('uses bandColor when specified, falling back to color', () => {
    render(
      <ChartLineConfidence
        series={[
          {
            id: 'a',
            label: 'A',
            data: [
              { x: 0, y: 0, yLower: -1, yUpper: 1 },
              { x: 1, y: 1, yLower: 0, yUpper: 2 },
            ],
            color: '#aaa',
            bandColor: '#fff',
          },
        ]}
      />,
    );
    const grp = document.querySelector(
      '[data-section="chart-line-confidence-series-group"]',
    )!;
    expect(grp.getAttribute('data-series-band-color')).toBe('#fff');
    const band = document.querySelector(
      '[data-section="chart-line-confidence-band"]',
    )!;
    expect(band.getAttribute('fill')).toBe('#fff');
  });

  it('renders empty state when no series', () => {
    render(<ChartLineConfidence series={[]} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-confidence-path"]')
        .length,
    ).toBe(0);
    expect(
      document.querySelector('[data-section="chart-line-confidence-aria-desc"]')
        ?.textContent,
    ).toBe('No data');
  });

  it('renders per-segment data attrs on the band path', () => {
    render(<ChartLineConfidence series={FIXTURE} />);
    const band = document.querySelector(
      '[data-section="chart-line-confidence-band"][data-series-id="a"]',
    )!;
    expect(band.getAttribute('data-segment-index')).toBe('0');
    expect(band.getAttribute('data-segment-start')).toBe('0');
    expect(band.getAttribute('data-segment-end')).toBe('3');
    expect(band.getAttribute('data-segment-point-count')).toBe('4');
  });

  it('keyboard focus on a dot opens the tooltip', () => {
    render(<ChartLineConfidence series={FIXTURE} />);
    const dot = document.querySelectorAll(
      '[data-section="chart-line-confidence-dot"]',
    )[0] as SVGElement;
    fireEvent.focus(dot);
    expect(
      document.querySelector('[data-section="chart-line-confidence-tooltip"]'),
    ).not.toBeNull();
  });

  it('sets data-hovered on the hovered dot and parent series group', () => {
    render(<ChartLineConfidence series={FIXTURE} />);
    const dot = document.querySelectorAll(
      '[data-section="chart-line-confidence-dot"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(dot);
    expect(dot.getAttribute('data-hovered')).toBe('true');
    const grp = document.querySelector(
      '[data-section="chart-line-confidence-series-group"][data-series-id="a"]',
    )!;
    expect(grp.getAttribute('data-hovered')).toBe('true');
  });

  it('renders grid lines per tick when showGrid=true', () => {
    render(<ChartLineConfidence series={FIXTURE} tickCount={4} />);
    const lines = document.querySelectorAll(
      '[data-section="chart-line-confidence-grid-line"]',
    );
    expect(lines.length).toBeGreaterThan(0);
  });

  it('y-range expands to include band lower/upper across all points', () => {
    render(
      <ChartLineConfidence
        series={[
          {
            id: 'a',
            label: 'A',
            data: [
              { x: 0, y: 5, yLower: -100, yUpper: 100 },
              { x: 1, y: 5, yLower: 0, yUpper: 10 },
            ],
          },
        ]}
      />,
    );
    const yTickLabels = document.querySelectorAll(
      '[data-section="chart-line-confidence-tick-label"][data-axis="y"]',
    );
    const values = Array.from(yTickLabels).map((t) =>
      Number(t.getAttribute('data-tick-value')),
    );
    expect(Math.min(...values)).toBeLessThanOrEqual(-100);
    expect(Math.max(...values)).toBeGreaterThanOrEqual(100);
  });
});
