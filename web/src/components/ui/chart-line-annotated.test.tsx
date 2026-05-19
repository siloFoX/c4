import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

import {
  ChartLineAnnotated,
  DEFAULT_CHART_LINE_ANNOTATED_WIDTH,
  DEFAULT_CHART_LINE_ANNOTATED_HEIGHT,
  DEFAULT_CHART_LINE_ANNOTATED_PADDING,
  DEFAULT_CHART_LINE_ANNOTATED_TICK_COUNT,
  DEFAULT_CHART_LINE_ANNOTATED_STROKE_WIDTH,
  DEFAULT_CHART_LINE_ANNOTATED_DOT_RADIUS,
  DEFAULT_CHART_LINE_ANNOTATED_LINE_OPACITY,
  DEFAULT_CHART_LINE_ANNOTATED_ANNOTATION_OPACITY,
  DEFAULT_CHART_LINE_ANNOTATED_ANNOTATION_DASH,
  DEFAULT_CHART_LINE_ANNOTATED_ANNOTATION_COLOR,
  DEFAULT_CHART_LINE_ANNOTATED_ANNOTATION_POSITION,
  DEFAULT_CHART_LINE_ANNOTATED_GRID_COLOR,
  DEFAULT_CHART_LINE_ANNOTATED_AXIS_COLOR,
  DEFAULT_CHART_LINE_ANNOTATED_PALETTE,
  buildLineAnnotatedPath,
  computeLineAnnotatedLayout,
  describeLineAnnotatedChart,
  getLineAnnotatedBounds,
  getLineAnnotatedDefaultColor,
  getLineAnnotatedFiniteAnnotations,
  getLineAnnotatedFinitePoints,
  getLineAnnotatedTicks,
  resolveLineAnnotatedLabel,
  type ChartLineAnnotatedAnnotation,
  type ChartLineAnnotatedSeries,
} from './chart-line-annotated';

afterEach(() => {
  cleanup();
});

describe('chart-line-annotated / constants', () => {
  it('exports sensible defaults', () => {
    expect(DEFAULT_CHART_LINE_ANNOTATED_WIDTH).toBe(560);
    expect(DEFAULT_CHART_LINE_ANNOTATED_HEIGHT).toBe(320);
    expect(DEFAULT_CHART_LINE_ANNOTATED_PADDING).toBe(48);
    expect(DEFAULT_CHART_LINE_ANNOTATED_TICK_COUNT).toBe(5);
    expect(DEFAULT_CHART_LINE_ANNOTATED_STROKE_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_ANNOTATED_DOT_RADIUS).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_ANNOTATED_LINE_OPACITY).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_ANNOTATED_ANNOTATION_OPACITY).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_ANNOTATED_ANNOTATION_DASH).toMatch(/\d/);
    expect(DEFAULT_CHART_LINE_ANNOTATED_ANNOTATION_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_LINE_ANNOTATED_ANNOTATION_POSITION).toBe('top');
    expect(DEFAULT_CHART_LINE_ANNOTATED_GRID_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_LINE_ANNOTATED_AXIS_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_LINE_ANNOTATED_PALETTE).toHaveLength(10);
  });
});

describe('chart-line-annotated / getLineAnnotatedDefaultColor', () => {
  it('wraps with modulo', () => {
    expect(getLineAnnotatedDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_ANNOTATED_PALETTE[0],
    );
    expect(getLineAnnotatedDefaultColor(10)).toBe(
      DEFAULT_CHART_LINE_ANNOTATED_PALETTE[0],
    );
  });

  it('falls back to first colour for invalid indices', () => {
    expect(getLineAnnotatedDefaultColor(-1)).toBe(
      DEFAULT_CHART_LINE_ANNOTATED_PALETTE[0],
    );
    expect(getLineAnnotatedDefaultColor(NaN)).toBe(
      DEFAULT_CHART_LINE_ANNOTATED_PALETTE[0],
    );
  });
});

describe('chart-line-annotated / getLineAnnotatedFinitePoints', () => {
  it('drops points with non-finite x or y', () => {
    expect(
      getLineAnnotatedFinitePoints([
        { x: 1, y: 1 },
        { x: NaN, y: 2 },
        { x: 3, y: Infinity },
        { x: 4, y: 4 },
      ]).map((p) => p.x),
    ).toEqual([1, 4]);
  });

  it('returns [] for non-array input', () => {
    expect(
      getLineAnnotatedFinitePoints(null as unknown as never[]),
    ).toEqual([]);
  });
});

describe('chart-line-annotated / getLineAnnotatedFiniteAnnotations', () => {
  it('drops annotations with non-string id', () => {
    const out = getLineAnnotatedFiniteAnnotations([
      { id: 'a', x: 1, label: 'A' },
      { id: 5 as unknown as string, x: 2, label: 'B' },
    ]);
    expect(out).toHaveLength(1);
  });

  it('drops annotations with non-finite x', () => {
    const out = getLineAnnotatedFiniteAnnotations([
      { id: 'a', x: 1, label: 'A' },
      { id: 'b', x: NaN, label: 'B' },
      { id: 'c', x: Infinity, label: 'C' },
    ]);
    expect(out.map((a) => a.id)).toEqual(['a']);
  });

  it('preserves input order', () => {
    const out = getLineAnnotatedFiniteAnnotations([
      { id: 'b', x: 10, label: 'B' },
      { id: 'a', x: 5, label: 'A' },
    ]);
    expect(out.map((a) => a.id)).toEqual(['b', 'a']);
  });

  it('returns [] for non-array / undefined input', () => {
    expect(getLineAnnotatedFiniteAnnotations(undefined)).toEqual([]);
    expect(
      getLineAnnotatedFiniteAnnotations(
        null as unknown as ChartLineAnnotatedAnnotation[],
      ),
    ).toEqual([]);
  });
});

describe('chart-line-annotated / getLineAnnotatedBounds', () => {
  it('returns unit square for empty input', () => {
    expect(getLineAnnotatedBounds([], [])).toEqual({
      xMin: 0,
      xMax: 1,
      yMin: 0,
      yMax: 1,
    });
  });

  it('spans series points', () => {
    expect(
      getLineAnnotatedBounds(
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

  it('expands x range to include annotations outside the data', () => {
    expect(
      getLineAnnotatedBounds(
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
        [{ id: 'deploy', x: 10, label: 'deploy' }],
      ),
    ).toEqual({ xMin: 0, xMax: 10, yMin: 5, yMax: 10 });
  });

  it('returns sensible defaults when only annotations exist', () => {
    const out = getLineAnnotatedBounds(
      [],
      [
        { id: 'a', x: 0, label: 'A' },
        { id: 'b', x: 10, label: 'B' },
      ],
    );
    expect(out.xMin).toBe(0);
    expect(out.xMax).toBe(10);
    // y bounds fall back to defaults when no finite y points exist.
    expect(out.yMin).toBe(0);
    expect(out.yMax).toBe(1);
  });

  it('excludes hidden series', () => {
    expect(
      getLineAnnotatedBounds(
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

describe('chart-line-annotated / getLineAnnotatedTicks', () => {
  it('returns evenly-spaced ticks', () => {
    expect(getLineAnnotatedTicks(0, 10, 5)).toHaveLength(5);
  });

  it('returns [] for invalid range', () => {
    expect(getLineAnnotatedTicks(10, 5, 4)).toEqual([]);
  });
});

describe('chart-line-annotated / buildLineAnnotatedPath', () => {
  it('returns "" for empty input', () => {
    expect(buildLineAnnotatedPath([])).toBe('');
  });

  it('returns M-only for single point', () => {
    expect(buildLineAnnotatedPath([{ px: 5, py: 10 }])).toBe(
      'M 5.000 10.000',
    );
  });

  it('emits one L per additional point', () => {
    const out = buildLineAnnotatedPath([
      { px: 0, py: 0 },
      { px: 10, py: 5 },
      { px: 20, py: 0 },
    ]);
    expect((out.match(/L /g) ?? []).length).toBe(2);
  });
});

describe('chart-line-annotated / resolveLineAnnotatedLabel', () => {
  it('places label above the plot for "top"', () => {
    const out = resolveLineAnnotatedLabel(100, 'top', 40, 200);
    expect(out.labelY).toBe(34);
    expect(out.labelX).toBe(100);
    expect(out.labelAnchor).toBe('middle');
  });

  it('places label inside the plot for "inline"', () => {
    const out = resolveLineAnnotatedLabel(100, 'inline', 40, 200);
    expect(out.labelY).toBe(52);
  });

  it('places label below the plot for "bottom"', () => {
    const out = resolveLineAnnotatedLabel(100, 'bottom', 40, 200);
    expect(out.labelY).toBe(40 + 200 + 18);
  });

  it('clamps labelY for top when padding < 6', () => {
    const out = resolveLineAnnotatedLabel(100, 'top', 4, 200);
    expect(out.labelY).toBeGreaterThanOrEqual(0);
  });

  it('falls back to padding when px is non-finite', () => {
    const out = resolveLineAnnotatedLabel(NaN, 'top', 40, 200);
    expect(out.labelX).toBe(40);
  });
});

describe('chart-line-annotated / computeLineAnnotatedLayout', () => {
  it('returns empty when canvas is degenerate', () => {
    expect(
      computeLineAnnotatedLayout({
        series: [{ id: 'a', label: 'A', data: [{ x: 1, y: 1 }] }],
        width: 10,
        height: 10,
        padding: 100,
      }).series,
    ).toEqual([]);
  });

  it('returns empty when no series and no annotations', () => {
    expect(
      computeLineAnnotatedLayout({
        series: [],
        annotations: [],
        width: 500,
        height: 200,
        padding: 20,
      }).series,
    ).toEqual([]);
  });

  it('still emits annotations even when no series', () => {
    const out = computeLineAnnotatedLayout({
      series: [],
      annotations: [{ id: 'a', x: 50, label: 'launch' }],
      xMin: 0,
      xMax: 100,
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.series).toEqual([]);
    expect(out.annotations).toHaveLength(1);
    expect(out.annotations[0]!.inRange).toBe(true);
  });

  it('drops annotations with non-finite x', () => {
    const out = computeLineAnnotatedLayout({
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
      annotations: [
        { id: 'good', x: 5, label: 'good' },
        { id: 'bad', x: NaN, label: 'bad' },
      ],
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.annotations).toHaveLength(1);
    expect(out.annotations[0]!.id).toBe('good');
  });

  it('flags inRange=false for annotations outside explicit x bounds', () => {
    const out = computeLineAnnotatedLayout({
      series: [],
      annotations: [
        { id: 'a', x: 50, label: 'in' },
        { id: 'b', x: 500, label: 'out' },
      ],
      xMin: 0,
      xMax: 100,
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.annotations[0]!.inRange).toBe(true);
    expect(out.annotations[1]!.inRange).toBe(false);
  });

  it('honours per-annotation color and dashArray overrides', () => {
    const out = computeLineAnnotatedLayout({
      series: [],
      annotations: [
        {
          id: 'a',
          x: 5,
          label: 'A',
          color: '#abcdef',
          dashArray: '8 4',
        },
      ],
      xMin: 0,
      xMax: 10,
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.annotations[0]!.color).toBe('#abcdef');
    expect(out.annotations[0]!.dashArray).toBe('8 4');
  });

  it('falls back to default color and dash when not specified', () => {
    const out = computeLineAnnotatedLayout({
      series: [],
      annotations: [{ id: 'a', x: 5, label: 'A' }],
      xMin: 0,
      xMax: 10,
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.annotations[0]!.color).toBe(
      DEFAULT_CHART_LINE_ANNOTATED_ANNOTATION_COLOR,
    );
    expect(out.annotations[0]!.dashArray).toBe(
      DEFAULT_CHART_LINE_ANNOTATED_ANNOTATION_DASH,
    );
  });

  it('falls back to default position "top"', () => {
    const out = computeLineAnnotatedLayout({
      series: [],
      annotations: [{ id: 'a', x: 5, label: 'A' }],
      xMin: 0,
      xMax: 10,
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.annotations[0]!.position).toBe('top');
  });

  it('respects per-annotation position override', () => {
    const out = computeLineAnnotatedLayout({
      series: [],
      annotations: [
        { id: 'a', x: 5, label: 'A', position: 'bottom' },
        { id: 'b', x: 7, label: 'B', position: 'inline' },
      ],
      xMin: 0,
      xMax: 10,
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.annotations[0]!.position).toBe('bottom');
    expect(out.annotations[1]!.position).toBe('inline');
  });

  it('maps annotation x to pixel space', () => {
    const out = computeLineAnnotatedLayout({
      series: [],
      annotations: [
        { id: 'a', x: 0, label: 'A' },
        { id: 'b', x: 10, label: 'B' },
      ],
      xMin: 0,
      xMax: 10,
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.annotations[0]!.px).toBeCloseTo(40, 5);
    expect(out.annotations[1]!.px).toBeCloseTo(40 + (500 - 80), 5);
  });

  it('drops non-finite center points from the series but keeps totalCount', () => {
    const out = computeLineAnnotatedLayout({
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
    const out = computeLineAnnotatedLayout({
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

  it('records originalIndex on each annotation', () => {
    const annotations: ChartLineAnnotatedAnnotation[] = [
      { id: 'a', x: 1, label: 'A' },
      { id: 'b', x: NaN, label: 'bad' }, // dropped
      { id: 'c', x: 3, label: 'C' },
    ];
    const out = computeLineAnnotatedLayout({
      series: [],
      annotations,
      width: 500,
      height: 200,
      padding: 40,
    });
    expect(out.annotations).toHaveLength(2);
    expect(out.annotations[0]!.originalIndex).toBe(0);
    expect(out.annotations[1]!.originalIndex).toBe(2);
  });
});

describe('chart-line-annotated / describeLineAnnotatedChart', () => {
  it('returns "No data" when empty everywhere', () => {
    expect(describeLineAnnotatedChart([], [])).toBe('No data');
  });

  it('returns "No data" when no finite points and no annotations', () => {
    expect(
      describeLineAnnotatedChart(
        [{ id: 'a', label: 'A', data: [{ x: NaN, y: 1 }] }],
        [],
      ),
    ).toBe('No data');
  });

  it('summarises series + points with annotations', () => {
    const out = describeLineAnnotatedChart(
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
        { id: 'deploy', x: 0.5, label: 'deploy' },
        { id: 'oncall', x: 0.7, label: 'oncall' },
      ],
    );
    expect(out).toContain('1 series');
    expect(out).toContain('2 points');
    expect(out).toContain('2 annotations');
    expect(out).toContain('deploy');
  });

  it('uses singular annotation wording for one annotation', () => {
    const out = describeLineAnnotatedChart(
      [
        {
          id: 'a',
          label: 'A',
          data: [{ x: 0, y: 1 }],
        },
      ],
      [{ id: 'deploy', x: 0.5, label: 'deploy' }],
    );
    expect(out).toContain('1 annotation.');
  });

  it('omits annotation list when no annotations', () => {
    const out = describeLineAnnotatedChart(
      [
        {
          id: 'a',
          label: 'A',
          data: [{ x: 0, y: 1 }],
        },
      ],
      [],
    );
    expect(out).toContain('1 series');
    expect(out).not.toContain('annotation');
  });

  it('excludes hidden series from the count', () => {
    const out = describeLineAnnotatedChart(
      [
        { id: 'a', label: 'A', data: [{ x: 0, y: 1 }] },
        { id: 'b', label: 'B', data: [{ x: 0, y: 100 }] },
      ],
      [],
      ['b'],
    );
    expect(out).toContain('1 series');
  });
});

const FIXTURE: ChartLineAnnotatedSeries[] = [
  {
    id: 'rps',
    label: 'Requests/s',
    data: [
      { x: 0, y: 100 },
      { x: 1, y: 110 },
      { x: 2, y: 130 },
      { x: 3, y: 200 },
      { x: 4, y: 220 },
    ],
  },
];

const ANNOTATIONS: ChartLineAnnotatedAnnotation[] = [
  {
    id: 'deploy',
    x: 2,
    label: 'deploy v2.3',
    color: '#16a34a',
  },
  {
    id: 'incident',
    x: 3.5,
    label: 'incident',
    color: '#dc2626',
    position: 'bottom',
  },
];

describe('chart-line-annotated / <ChartLineAnnotated>', () => {
  it('renders a root region with the default aria label', () => {
    render(<ChartLineAnnotated series={FIXTURE} annotations={ANNOTATIONS} />);
    const root = document.querySelector(
      '[data-section="chart-line-annotated"]',
    )!;
    expect(root.getAttribute('aria-label')).toBe('Annotated line chart');
  });

  it('exposes series + annotation counts as data attrs', () => {
    render(<ChartLineAnnotated series={FIXTURE} annotations={ANNOTATIONS} />);
    const root = document.querySelector(
      '[data-section="chart-line-annotated"]',
    )!;
    expect(root.getAttribute('data-series-count')).toBe('1');
    expect(root.getAttribute('data-total-points')).toBe('5');
    expect(root.getAttribute('data-annotation-count')).toBe('2');
  });

  it('renders an aria description with summary text', () => {
    render(<ChartLineAnnotated series={FIXTURE} annotations={ANNOTATIONS} />);
    expect(
      document.querySelector('[data-section="chart-line-annotated-aria-desc"]')
        ?.textContent ?? '',
    ).toContain('2 annotations');
  });

  it('respects a custom aria description', () => {
    render(
      <ChartLineAnnotated
        series={FIXTURE}
        annotations={ANNOTATIONS}
        ariaDescription="custom"
      />,
    );
    expect(
      document.querySelector('[data-section="chart-line-annotated-aria-desc"]')
        ?.textContent,
    ).toBe('custom');
  });

  it('renders one annotation line per annotation', () => {
    render(<ChartLineAnnotated series={FIXTURE} annotations={ANNOTATIONS} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-annotated-annotation-line"]',
      ).length,
    ).toBe(2);
  });

  it('renders one annotation label per annotation', () => {
    render(<ChartLineAnnotated series={FIXTURE} annotations={ANNOTATIONS} />);
    const labels = document.querySelectorAll(
      '[data-section="chart-line-annotated-annotation-label"]',
    );
    expect(labels.length).toBe(2);
    expect(labels[0]?.textContent).toBe('deploy v2.3');
  });

  it('omits annotation lines when showAnnotationLines=false', () => {
    render(
      <ChartLineAnnotated
        series={FIXTURE}
        annotations={ANNOTATIONS}
        showAnnotationLines={false}
      />,
    );
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-annotated-annotation-line"]',
      ).length,
    ).toBe(0);
  });

  it('omits annotation labels when showAnnotationLabels=false', () => {
    render(
      <ChartLineAnnotated
        series={FIXTURE}
        annotations={ANNOTATIONS}
        showAnnotationLabels={false}
      />,
    );
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-annotated-annotation-label"]',
      ).length,
    ).toBe(0);
  });

  it('exposes annotation data attrs (id, x, color, position)', () => {
    render(<ChartLineAnnotated series={FIXTURE} annotations={ANNOTATIONS} />);
    const anno = document.querySelectorAll(
      '[data-section="chart-line-annotated-annotation"]',
    )[0]!;
    expect(anno.getAttribute('data-annotation-id')).toBe('deploy');
    expect(anno.getAttribute('data-annotation-x')).toBe('2');
    expect(anno.getAttribute('data-annotation-color')).toBe('#16a34a');
    expect(anno.getAttribute('data-annotation-position')).toBe('top');
  });

  it('renders one line path per series', () => {
    render(<ChartLineAnnotated series={FIXTURE} annotations={ANNOTATIONS} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-annotated-path"]')
        .length,
    ).toBe(1);
  });

  it('renders one dot per finite point when showDots=true', () => {
    render(<ChartLineAnnotated series={FIXTURE} annotations={ANNOTATIONS} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-annotated-dot"]')
        .length,
    ).toBe(5);
  });

  it('omits dots when showDots=false', () => {
    render(
      <ChartLineAnnotated
        series={FIXTURE}
        annotations={ANNOTATIONS}
        showDots={false}
      />,
    );
    expect(
      document.querySelectorAll('[data-section="chart-line-annotated-dot"]')
        .length,
    ).toBe(0);
  });

  it('fires onAnnotationClick with the annotation payload', () => {
    const handler = vi.fn();
    render(
      <ChartLineAnnotated
        series={FIXTURE}
        annotations={ANNOTATIONS}
        onAnnotationClick={handler}
      />,
    );
    const line = document.querySelector(
      '[data-section="chart-line-annotated-annotation-line"]',
    ) as SVGElement;
    fireEvent.click(line);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0]!.annotation.id).toBe('deploy');
  });

  it('shows tooltip on dot hover', () => {
    render(<ChartLineAnnotated series={FIXTURE} annotations={ANNOTATIONS} />);
    const dot = document.querySelectorAll(
      '[data-section="chart-line-annotated-dot"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(dot);
    const tip = document.querySelector(
      '[data-section="chart-line-annotated-tooltip"]',
    );
    expect(tip).not.toBeNull();
    expect(tip!.textContent).toContain('Requests/s');
  });

  it('hides tooltip on mouse leave', () => {
    render(<ChartLineAnnotated series={FIXTURE} annotations={ANNOTATIONS} />);
    const dot = document.querySelector(
      '[data-section="chart-line-annotated-dot"]',
    ) as SVGElement;
    fireEvent.mouseEnter(dot);
    fireEvent.mouseLeave(dot);
    expect(
      document.querySelector('[data-section="chart-line-annotated-tooltip"]'),
    ).toBeNull();
  });

  it('fires onPointClick with series + point', () => {
    const handler = vi.fn();
    render(
      <ChartLineAnnotated
        series={FIXTURE}
        annotations={ANNOTATIONS}
        onPointClick={handler}
      />,
    );
    const dot = document.querySelectorAll(
      '[data-section="chart-line-annotated-dot"]',
    )[0] as SVGElement;
    fireEvent.click(dot);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0]!.series.id).toBe('rps');
  });

  it('hides axis when showAxis=false', () => {
    render(
      <ChartLineAnnotated
        series={FIXTURE}
        annotations={ANNOTATIONS}
        showAxis={false}
      />,
    );
    expect(
      document.querySelector('[data-section="chart-line-annotated-axes"]'),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    render(
      <ChartLineAnnotated
        series={FIXTURE}
        annotations={ANNOTATIONS}
        showGrid={false}
      />,
    );
    expect(
      document.querySelector('[data-section="chart-line-annotated-grid"]'),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    render(
      <ChartLineAnnotated
        series={FIXTURE}
        annotations={ANNOTATIONS}
        showLegend={false}
      />,
    );
    expect(
      document.querySelector('[data-section="chart-line-annotated-legend"]'),
    ).toBeNull();
  });

  it('applies the animate flag to the data attribute', () => {
    render(
      <ChartLineAnnotated
        series={FIXTURE}
        annotations={ANNOTATIONS}
        animate={false}
      />,
    );
    const root = document.querySelector(
      '[data-section="chart-line-annotated"]',
    )!;
    expect(root.getAttribute('data-animate')).toBe('false');
  });

  it('toggles hidden state via legend (uncontrolled)', () => {
    render(<ChartLineAnnotated series={FIXTURE} annotations={ANNOTATIONS} />);
    const btn = document.querySelector(
      '[data-section="chart-line-annotated-legend-item"][data-series-id="rps"] [data-section="chart-line-annotated-legend-button"]',
    ) as HTMLElement;
    fireEvent.click(btn);
    const item = document.querySelector(
      '[data-section="chart-line-annotated-legend-item"][data-series-id="rps"]',
    )!;
    expect(item.getAttribute('data-hidden')).toBe('true');
  });

  it('fires onSeriesToggle with the hidden flag', () => {
    const handler = vi.fn();
    render(
      <ChartLineAnnotated
        series={FIXTURE}
        annotations={ANNOTATIONS}
        onSeriesToggle={handler}
      />,
    );
    const btn = document.querySelector(
      '[data-section="chart-line-annotated-legend-item"][data-series-id="rps"] [data-section="chart-line-annotated-legend-button"]',
    ) as HTMLElement;
    fireEvent.click(btn);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0]!.hidden).toBe(true);
  });

  it('respects defaultHiddenSeries on mount', () => {
    render(
      <ChartLineAnnotated
        series={FIXTURE}
        annotations={ANNOTATIONS}
        defaultHiddenSeries={['rps']}
      />,
    );
    const item = document.querySelector(
      '[data-section="chart-line-annotated-legend-item"][data-series-id="rps"]',
    )!;
    expect(item.getAttribute('data-hidden')).toBe('true');
  });

  it('renders optional axis labels', () => {
    render(
      <ChartLineAnnotated
        series={FIXTURE}
        annotations={ANNOTATIONS}
        xLabel="t"
        yLabel="rps"
      />,
    );
    expect(
      document.querySelector('[data-section="chart-line-annotated-x-label"]')
        ?.textContent,
    ).toBe('t');
    expect(
      document.querySelector('[data-section="chart-line-annotated-y-label"]')
        ?.textContent,
    ).toBe('rps');
  });

  it('uses formatValue / formatX for axis ticks', () => {
    render(
      <ChartLineAnnotated
        series={FIXTURE}
        annotations={ANNOTATIONS}
        formatValue={(n) => `y${n}`}
        formatX={(n) => `x${n}`}
      />,
    );
    const xLabel = document.querySelector(
      '[data-section="chart-line-annotated-tick-label"][data-axis="x"]',
    );
    const yLabel = document.querySelector(
      '[data-section="chart-line-annotated-tick-label"][data-axis="y"]',
    );
    expect(xLabel?.textContent?.startsWith('x')).toBe(true);
    expect(yLabel?.textContent?.startsWith('y')).toBe(true);
  });

  it('renders empty state when no series and no annotations', () => {
    render(<ChartLineAnnotated series={[]} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-annotated-annotation"]',
      ).length,
    ).toBe(0);
    expect(
      document.querySelector(
        '[data-section="chart-line-annotated-aria-desc"]',
      )?.textContent,
    ).toBe('No data');
  });

  it('annotations sit at correct positions: top label is above, bottom is below', () => {
    render(<ChartLineAnnotated series={FIXTURE} annotations={ANNOTATIONS} />);
    const labels = document.querySelectorAll(
      '[data-section="chart-line-annotated-annotation-label"]',
    );
    const topY = Number(labels[0]!.getAttribute('y'));
    const bottomY = Number(labels[1]!.getAttribute('y'));
    expect(topY).toBeLessThan(bottomY);
  });

  it('annotation aria-label includes label text and x value', () => {
    render(<ChartLineAnnotated series={FIXTURE} annotations={ANNOTATIONS} />);
    const line = document.querySelector(
      '[data-section="chart-line-annotated-annotation-line"]',
    ) as SVGElement;
    const aria = line.getAttribute('aria-label') ?? '';
    expect(aria).toContain('deploy v2.3');
    expect(aria).toContain('2');
  });

  it('handles a chart with only annotations (no series data)', () => {
    render(
      <ChartLineAnnotated
        series={[]}
        annotations={[
          { id: 'a', x: 0, label: 'A' },
          { id: 'b', x: 10, label: 'B' },
        ]}
      />,
    );
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-annotated-annotation-line"]',
      ).length,
    ).toBe(2);
    expect(
      document.querySelectorAll('[data-section="chart-line-annotated-path"]')
        .length,
    ).toBe(0);
  });

  it('sets data-hovered on the hovered dot and parent series group', () => {
    render(<ChartLineAnnotated series={FIXTURE} annotations={ANNOTATIONS} />);
    const dot = document.querySelectorAll(
      '[data-section="chart-line-annotated-dot"]',
    )[0] as SVGElement;
    fireEvent.mouseEnter(dot);
    expect(dot.getAttribute('data-hovered')).toBe('true');
    const grp = document.querySelector(
      '[data-section="chart-line-annotated-series-group"][data-series-id="rps"]',
    )!;
    expect(grp.getAttribute('data-hovered')).toBe('true');
  });

  it('renders grid lines per tick when showGrid=true', () => {
    render(
      <ChartLineAnnotated
        series={FIXTURE}
        annotations={ANNOTATIONS}
        tickCount={4}
      />,
    );
    const lines = document.querySelectorAll(
      '[data-section="chart-line-annotated-grid-line"]',
    );
    expect(lines.length).toBeGreaterThan(0);
  });

  it('skips annotations outside the explicit x range', () => {
    render(
      <ChartLineAnnotated
        series={FIXTURE}
        annotations={[
          { id: 'in', x: 2, label: 'in' },
          { id: 'out', x: 1000, label: 'out' },
        ]}
        xMin={0}
        xMax={5}
      />,
    );
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-annotated-annotation-line"]',
      ).length,
    ).toBe(1);
  });
});
