import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartParallel,
  DEFAULT_CHART_PARALLEL_HEIGHT,
  DEFAULT_CHART_PARALLEL_LINE_COLOR,
  DEFAULT_CHART_PARALLEL_LINE_OPACITY,
  DEFAULT_CHART_PARALLEL_PADDING,
  DEFAULT_CHART_PARALLEL_STROKE_WIDTH,
  DEFAULT_CHART_PARALLEL_TICK_COUNT,
  DEFAULT_CHART_PARALLEL_WIDTH,
  applyBrushFilter,
  buildParallelRowPath,
  describeParallelChart,
  getParallelDimensionBounds,
  getParallelTicks,
  isRowInBrushes,
} from './chart-parallel';
import type {
  ChartParallelBrush,
  ChartParallelDimension,
  ChartParallelRow,
} from './chart-parallel';

const dimensions: ChartParallelDimension[] = [
  { id: 'mpg', label: 'MPG' },
  { id: 'hp', label: 'Horsepower' },
  { id: 'weight', label: 'Weight' },
];

const rows: ChartParallelRow[] = [
  {
    id: 'a',
    label: 'Compact',
    values: { mpg: 30, hp: 100, weight: 2000 },
  },
  {
    id: 'b',
    label: 'Sedan',
    values: { mpg: 24, hp: 180, weight: 3000 },
  },
  {
    id: 'c',
    label: 'SUV',
    values: { mpg: 18, hp: 240, weight: 4200 },
  },
  {
    id: 'd',
    label: 'Sports',
    values: { mpg: 22, hp: 320, weight: 3300 },
    color: '#ff00aa',
    category: 'fast',
  },
];

describe('chart-parallel pure helpers', () => {
  describe('getParallelDimensionBounds', () => {
    it('uses explicit min / max when supplied', () => {
      const b = getParallelDimensionBounds(
        { id: 'x', label: 'x', min: -10, max: 100 },
        rows,
      );
      expect(b.min).toBe(-10);
      expect(b.max).toBe(100);
    });
    it('falls back to data min / max', () => {
      const b = getParallelDimensionBounds(
        { id: 'hp', label: 'Horsepower' },
        rows,
      );
      expect(b.min).toBe(100);
      expect(b.max).toBe(320);
    });
    it('falls back to (0, 1) for empty / non-finite', () => {
      expect(
        getParallelDimensionBounds(
          { id: 'missing', label: 'missing' },
          rows,
        ),
      ).toEqual({ min: 0, max: 1 });
      expect(
        getParallelDimensionBounds(
          { id: 'x', label: 'x' },
          [],
        ),
      ).toEqual({ min: 0, max: 1 });
    });
    it('expands collapsed range', () => {
      const b = getParallelDimensionBounds(
        { id: 'mpg', label: 'MPG' },
        [
          {
            id: 'a',
            values: { mpg: 30 },
          } as ChartParallelRow,
          {
            id: 'b',
            values: { mpg: 30 },
          } as ChartParallelRow,
        ],
      );
      expect(b.min).toBeLessThan(30);
      expect(b.max).toBeGreaterThan(30);
    });
  });

  describe('isRowInBrushes', () => {
    it('returns true when no brushes are active', () => {
      expect(isRowInBrushes(rows[0]!, [])).toBe(true);
    });
    it('returns true when row passes every brush', () => {
      const brushes: ChartParallelBrush[] = [
        { dimensionId: 'mpg', min: 20, max: 35 },
        { dimensionId: 'hp', min: 50, max: 200 },
      ];
      expect(isRowInBrushes(rows[0]!, brushes)).toBe(true);
    });
    it('returns false when row fails any brush', () => {
      const brushes: ChartParallelBrush[] = [
        { dimensionId: 'mpg', min: 25, max: 35 },
      ];
      expect(isRowInBrushes(rows[2]!, brushes)).toBe(false);
    });
    it('returns false for non-finite values on brushed dimensions', () => {
      const row: ChartParallelRow = {
        id: 'x',
        values: { mpg: Number.NaN },
      };
      const brushes: ChartParallelBrush[] = [
        { dimensionId: 'mpg', min: 0, max: 100 },
      ];
      expect(isRowInBrushes(row, brushes)).toBe(false);
    });
  });

  describe('applyBrushFilter', () => {
    it('returns a copy of rows when no brushes are active', () => {
      const out = applyBrushFilter(rows, []);
      expect(out.length).toBe(rows.length);
      expect(out).not.toBe(rows);
    });
    it('drops rows that fail any brush', () => {
      const out = applyBrushFilter(rows, [
        { dimensionId: 'hp', min: 90, max: 200 },
      ]);
      // hp >= 90, <= 200 -> a (100) yes, b (180) yes, c (240) no, d (320) no
      expect(out.map((r) => r.id)).toEqual(['a', 'b']);
    });
  });

  describe('buildParallelRowPath', () => {
    it('returns "" for empty points', () => {
      expect(buildParallelRowPath([])).toBe('');
    });
    it('emits a Move and L segments', () => {
      const path = buildParallelRowPath([
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        { x: 20, y: 5 },
      ]);
      expect(path).toMatch(/^M /);
      expect((path.match(/L /g) || []).length).toBe(2);
    });
  });

  describe('getParallelTicks', () => {
    it('emits evenly-spaced ticks', () => {
      expect(getParallelTicks(0, 100, 5)).toEqual([
        0, 25, 50, 75, 100,
      ]);
    });
    it('returns [min] for collapsed range', () => {
      expect(getParallelTicks(50, 50)).toEqual([50]);
    });
    it('defaults to DEFAULT_CHART_PARALLEL_TICK_COUNT', () => {
      expect(getParallelTicks(0, 100).length).toBe(
        DEFAULT_CHART_PARALLEL_TICK_COUNT,
      );
    });
  });

  describe('describeParallelChart', () => {
    it('returns "No data" for empty input', () => {
      expect(describeParallelChart([], [])).toBe('No data');
      expect(describeParallelChart(dimensions, [])).toBe('No data');
    });
    it('summarises dimensions + rows', () => {
      const text = describeParallelChart(dimensions, rows);
      expect(text).toContain('3 dimensions');
      expect(text).toContain('4 rows');
    });
    it('includes filtered count when brushes active', () => {
      const text = describeParallelChart(
        dimensions,
        rows,
        [{ dimensionId: 'hp', min: 90, max: 200 }],
      );
      expect(text).toContain('after brush');
      expect(text).toContain('2 after brush');
    });
  });

  it('exports default constants', () => {
    expect(DEFAULT_CHART_PARALLEL_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_PARALLEL_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_PARALLEL_PADDING).toBeGreaterThan(0);
    expect(DEFAULT_CHART_PARALLEL_TICK_COUNT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_PARALLEL_LINE_OPACITY).toBeGreaterThan(
      0,
    );
    expect(DEFAULT_CHART_PARALLEL_STROKE_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_PARALLEL_LINE_COLOR).toMatch(/^#/);
  });
});

describe('<ChartParallel />', () => {
  it('renders a region with role + aria-label', () => {
    render(<ChartParallel dimensions={dimensions} rows={rows} />);
    const root = screen.getByRole('region', {
      name: 'Parallel coordinates plot',
    });
    expect(root).toBeInTheDocument();
    expect(root).toHaveAttribute(
      'data-section',
      'chart-parallel',
    );
    expect(root).toHaveAttribute('data-dimension-count', '3');
    expect(root).toHaveAttribute('data-row-count', '4');
    expect(root).toHaveAttribute('data-brush-count', '0');
    expect(root).toHaveAttribute('data-filtered-count', '4');
  });

  it('renders a custom aria-label', () => {
    render(
      <ChartParallel
        dimensions={dimensions}
        rows={rows}
        ariaLabel="Car spec compare"
      />,
    );
    expect(
      screen.getByRole('region', { name: 'Car spec compare' }),
    ).toBeInTheDocument();
  });

  it('renders one axis per dimension', () => {
    const { container } = render(
      <ChartParallel dimensions={dimensions} rows={rows} />,
    );
    const axes = container.querySelectorAll(
      '[data-section="chart-parallel-axis"]',
    );
    expect(axes.length).toBe(dimensions.length);
  });

  it('renders one line per row', () => {
    const { container } = render(
      <ChartParallel dimensions={dimensions} rows={rows} />,
    );
    const lines = container.querySelectorAll(
      '[data-section="chart-parallel-line"]',
    );
    expect(lines.length).toBe(rows.length);
  });

  it('mirrors row metadata on the group', () => {
    const { container } = render(
      <ChartParallel dimensions={dimensions} rows={rows} />,
    );
    const d = container.querySelector(
      '[data-section="chart-parallel-row"][data-row-id="d"]',
    );
    expect(d?.getAttribute('data-row-category')).toBe('fast');
    expect(d?.getAttribute('data-row-passes')).toBe('true');
  });

  it('mirrors axis bounds on the axis group', () => {
    const { container } = render(
      <ChartParallel dimensions={dimensions} rows={rows} />,
    );
    const hp = container.querySelector(
      '[data-section="chart-parallel-axis"][data-dimension-id="hp"]',
    );
    expect(hp?.getAttribute('data-axis-min')).toBe('100');
    expect(hp?.getAttribute('data-axis-max')).toBe('320');
  });

  it('uses custom row color when supplied', () => {
    const { container } = render(
      <ChartParallel dimensions={dimensions} rows={rows} />,
    );
    const d = container.querySelector(
      '[data-section="chart-parallel-line"][data-row-id="d"]',
    );
    expect(d?.getAttribute('stroke')).toBe('#ff00aa');
  });

  it('uses defaultLineColor for rows without color', () => {
    const { container } = render(
      <ChartParallel dimensions={dimensions} rows={rows} />,
    );
    const a = container.querySelector(
      '[data-section="chart-parallel-line"][data-row-id="a"]',
    );
    expect(a?.getAttribute('stroke')).toBe(
      DEFAULT_CHART_PARALLEL_LINE_COLOR,
    );
  });

  it('renders axis labels by default', () => {
    const { container } = render(
      <ChartParallel dimensions={dimensions} rows={rows} />,
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-parallel-axis-label"]',
    );
    expect(labels.length).toBe(dimensions.length);
    expect(labels[0]?.textContent).toBe('MPG');
  });

  it('suppresses axis labels when showAxisLabels=false', () => {
    const { container } = render(
      <ChartParallel
        dimensions={dimensions}
        rows={rows}
        showAxisLabels={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-parallel-axis-label"]',
      ),
    ).toBeNull();
  });

  it('renders axis ticks by default', () => {
    const { container } = render(
      <ChartParallel dimensions={dimensions} rows={rows} />,
    );
    const ticks = container.querySelectorAll(
      '[data-section="chart-parallel-axis-tick"]',
    );
    expect(ticks.length).toBeGreaterThan(0);
  });

  it('suppresses axis ticks when showAxisTicks=false', () => {
    const { container } = render(
      <ChartParallel
        dimensions={dimensions}
        rows={rows}
        showAxisTicks={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-parallel-axis-tick"]',
      ),
    ).toBeNull();
  });

  it('applies controlled brushes', () => {
    const brushes: ChartParallelBrush[] = [
      { dimensionId: 'hp', min: 90, max: 200 },
    ];
    const { container } = render(
      <ChartParallel
        dimensions={dimensions}
        rows={rows}
        brushes={brushes}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-parallel"]',
    );
    expect(root?.getAttribute('data-brush-count')).toBe('1');
    expect(root?.getAttribute('data-filtered-count')).toBe('2');
    const cRow = container.querySelector(
      '[data-section="chart-parallel-row"][data-row-id="c"]',
    );
    expect(cRow?.getAttribute('data-row-passes')).toBe('false');
  });

  it('renders brush handle when active', () => {
    const brushes: ChartParallelBrush[] = [
      { dimensionId: 'mpg', min: 20, max: 28 },
    ];
    const { container } = render(
      <ChartParallel
        dimensions={dimensions}
        rows={rows}
        brushes={brushes}
      />,
    );
    const brushRect = container.querySelector(
      '[data-section="chart-parallel-brush"]',
    );
    expect(brushRect).not.toBeNull();
    expect(brushRect?.getAttribute('data-dimension-id')).toBe(
      'mpg',
    );
    expect(brushRect?.getAttribute('data-brush-min')).toBe('20');
    expect(brushRect?.getAttribute('data-brush-max')).toBe('28');
  });

  it('honours defaultBrushes initially', () => {
    const { container } = render(
      <ChartParallel
        dimensions={dimensions}
        rows={rows}
        defaultBrushes={[
          { dimensionId: 'hp', min: 90, max: 200 },
        ]}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-parallel"]',
    );
    expect(root?.getAttribute('data-brush-count')).toBe('1');
  });

  it('shows tooltip on row hover with per-dimension values', () => {
    const { container } = render(
      <ChartParallel dimensions={dimensions} rows={rows} />,
    );
    const line = container.querySelector(
      '[data-section="chart-parallel-line"][data-row-id="a"]',
    );
    fireEvent.mouseEnter(line!);
    const tip = container.querySelector(
      '[data-section="chart-parallel-tooltip"]',
    );
    expect(tip).not.toBeNull();
    const label = container.querySelector(
      '[data-section="chart-parallel-tooltip-label"]',
    );
    expect(label?.textContent).toBe('Compact');
    const rows3 = container.querySelectorAll(
      '[data-section="chart-parallel-tooltip-row"]',
    );
    expect(rows3.length).toBe(3);
  });

  it('shows filtered-out hint in tooltip for filtered rows', () => {
    const { container } = render(
      <ChartParallel
        dimensions={dimensions}
        rows={rows}
        brushes={[
          { dimensionId: 'hp', min: 90, max: 200 },
        ]}
      />,
    );
    const cLine = container.querySelector(
      '[data-section="chart-parallel-line"][data-row-id="c"]',
    );
    fireEvent.mouseEnter(cLine!);
    expect(
      container.querySelector(
        '[data-section="chart-parallel-tooltip-filtered"]',
      ),
    ).not.toBeNull();
  });

  it('hides tooltip on mouse-leave', () => {
    const { container } = render(
      <ChartParallel dimensions={dimensions} rows={rows} />,
    );
    const line = container.querySelector(
      '[data-section="chart-parallel-line"]',
    );
    fireEvent.mouseEnter(line!);
    fireEvent.mouseLeave(line!);
    expect(
      container.querySelector(
        '[data-section="chart-parallel-tooltip"]',
      ),
    ).toBeNull();
  });

  it('suppresses tooltip when showTooltip=false', () => {
    const { container } = render(
      <ChartParallel
        dimensions={dimensions}
        rows={rows}
        showTooltip={false}
      />,
    );
    const line = container.querySelector(
      '[data-section="chart-parallel-line"]',
    );
    fireEvent.mouseEnter(line!);
    expect(
      container.querySelector(
        '[data-section="chart-parallel-tooltip"]',
      ),
    ).toBeNull();
  });

  it('dims other lines on hover when highlightOnHover=true', () => {
    const { container } = render(
      <ChartParallel dimensions={dimensions} rows={rows} />,
    );
    const lines = container.querySelectorAll(
      '[data-section="chart-parallel-line"]',
    );
    fireEvent.mouseEnter(lines[0]!);
    const otherOp = parseFloat(
      lines[1]!.getAttribute('stroke-opacity') ?? '1',
    );
    expect(otherOp).toBeLessThan(0.5);
  });

  it('does not dim when highlightOnHover=false', () => {
    const { container } = render(
      <ChartParallel
        dimensions={dimensions}
        rows={rows}
        highlightOnHover={false}
      />,
    );
    const lines = container.querySelectorAll(
      '[data-section="chart-parallel-line"]',
    );
    fireEvent.mouseEnter(lines[0]!);
    // Stroke opacity stays at the default line opacity
    expect(
      parseFloat(
        lines[1]!.getAttribute('stroke-opacity') ?? '0',
      ),
    ).toBeCloseTo(DEFAULT_CHART_PARALLEL_LINE_OPACITY);
  });

  it('invokes onRowClick with row + index', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ChartParallel
        dimensions={dimensions}
        rows={rows}
        onRowClick={onClick}
      />,
    );
    const cLine = container.querySelector(
      '[data-section="chart-parallel-line"][data-row-id="c"]',
    );
    fireEvent.click(cLine!);
    expect(onClick).toHaveBeenCalledTimes(1);
    const arg = onClick.mock.calls[0]?.[0];
    expect(arg?.row?.id).toBe('c');
    expect(arg?.index).toBe(2);
  });

  it('clears brush on axis double-click', () => {
    const onChange = vi.fn();
    const { container } = render(
      <ChartParallel
        dimensions={dimensions}
        rows={rows}
        defaultBrushes={[
          { dimensionId: 'mpg', min: 20, max: 28 },
        ]}
        onBrushesChange={onChange}
      />,
    );
    const hit = container.querySelector(
      '[data-section="chart-parallel-axis-hit"][data-dimension-id="mpg"]',
    );
    fireEvent.doubleClick(hit!);
    expect(onChange).toHaveBeenCalled();
    const lastArg =
      onChange.mock.calls[onChange.mock.calls.length - 1]?.[0];
    expect(lastArg).toEqual([]);
  });

  it('exposes role=graphics-symbol + aria-label per line', () => {
    const { container } = render(
      <ChartParallel dimensions={dimensions} rows={rows} />,
    );
    const line = container.querySelector(
      '[data-section="chart-parallel-line"]',
    );
    expect(line?.getAttribute('role')).toBe('graphics-symbol');
    expect(line?.getAttribute('aria-label')).toBe('Compact');
  });

  it('mirrors animate flag on the root', () => {
    const { container, rerender } = render(
      <ChartParallel dimensions={dimensions} rows={rows} />,
    );
    expect(
      container
        .querySelector('[data-section="chart-parallel"]')
        ?.getAttribute('data-animate'),
    ).toBe('true');
    rerender(
      <ChartParallel
        dimensions={dimensions}
        rows={rows}
        animate={false}
      />,
    );
    expect(
      container
        .querySelector('[data-section="chart-parallel"]')
        ?.getAttribute('data-animate'),
    ).toBe('false');
  });

  it('mirrors size on the svg', () => {
    const { container } = render(
      <ChartParallel
        dimensions={dimensions}
        rows={rows}
        width={800}
        height={400}
      />,
    );
    const svg = container.querySelector(
      '[data-section="chart-parallel-svg"]',
    );
    expect(svg?.getAttribute('width')).toBe('800');
    expect(svg?.getAttribute('height')).toBe('400');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 800 400');
  });

  it('renders auto-generated ARIA description by default', () => {
    const { container } = render(
      <ChartParallel dimensions={dimensions} rows={rows} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-parallel-aria-desc"]',
    );
    expect(desc?.textContent).toContain(
      'Parallel coordinates plot with 3 dimensions',
    );
  });

  it('honours ariaDescription override', () => {
    const { container } = render(
      <ChartParallel
        dimensions={dimensions}
        rows={rows}
        ariaDescription="custom"
      />,
    );
    const desc = container.querySelector(
      '[data-section="chart-parallel-aria-desc"]',
    );
    expect(desc?.textContent).toBe('custom');
  });

  it('handles empty data without crashing', () => {
    const { container } = render(
      <ChartParallel dimensions={[]} rows={[]} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-parallel"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelectorAll(
        '[data-section="chart-parallel-axis"]',
      ).length,
    ).toBe(0);
  });

  it('forwards ref to the root region', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartParallel
        ref={ref}
        dimensions={dimensions}
        rows={rows}
      />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-parallel',
    );
  });

  it('has a stable displayName', () => {
    expect(ChartParallel.displayName).toBe('ChartParallel');
  });
});
