import { afterEach, describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import {
  ChartMarimekko,
  computeMarimekkoLayout,
  describeMarimekkoChart,
  getMarimekkoColumnTotal,
  getMarimekkoDefaultColor,
  getMarimekkoGrandTotal,
  DEFAULT_CHART_MARIMEKKO_WIDTH,
  DEFAULT_CHART_MARIMEKKO_HEIGHT,
  DEFAULT_CHART_MARIMEKKO_PADDING,
  DEFAULT_CHART_MARIMEKKO_CELL_GAP,
  DEFAULT_CHART_MARIMEKKO_COLUMN_GAP,
  DEFAULT_CHART_MARIMEKKO_LABEL_MIN_AREA,
  DEFAULT_CHART_MARIMEKKO_PALETTE,
  type ChartMarimekkoColumn,
  type ChartMarimekkoSeries,
} from './chart-marimekko';

afterEach(() => cleanup());

const SERIES: ChartMarimekkoSeries[] = [
  { id: 's1', label: 'Series 1' },
  { id: 's2', label: 'Series 2' },
  { id: 's3', label: 'Series 3' },
];

const COLUMNS: ChartMarimekkoColumn[] = [
  { id: 'c1', label: 'Q1', values: [10, 20, 30] }, // total 60
  { id: 'c2', label: 'Q2', values: [40, 50, 10] }, // total 100
  { id: 'c3', label: 'Q3', values: [20, 10, 10] }, // total 40
];

describe('chart-marimekko constants', () => {
  it('exports the documented defaults', () => {
    expect(DEFAULT_CHART_MARIMEKKO_WIDTH).toBe(560);
    expect(DEFAULT_CHART_MARIMEKKO_HEIGHT).toBe(360);
    expect(DEFAULT_CHART_MARIMEKKO_PADDING).toBe(36);
    expect(DEFAULT_CHART_MARIMEKKO_CELL_GAP).toBe(1);
    expect(DEFAULT_CHART_MARIMEKKO_COLUMN_GAP).toBe(2);
    expect(DEFAULT_CHART_MARIMEKKO_LABEL_MIN_AREA).toBe(280);
    expect(DEFAULT_CHART_MARIMEKKO_PALETTE.length).toBe(10);
  });
});

describe('getMarimekkoDefaultColor', () => {
  it('returns palette[index] for valid indices', () => {
    expect(getMarimekkoDefaultColor(0)).toBe(DEFAULT_CHART_MARIMEKKO_PALETTE[0]);
    expect(getMarimekkoDefaultColor(2)).toBe(DEFAULT_CHART_MARIMEKKO_PALETTE[2]);
  });
  it('wraps modulo palette length', () => {
    expect(getMarimekkoDefaultColor(DEFAULT_CHART_MARIMEKKO_PALETTE.length)).toBe(
      DEFAULT_CHART_MARIMEKKO_PALETTE[0]
    );
  });
  it('falls back to color 0 for invalid input', () => {
    expect(getMarimekkoDefaultColor(Number.NaN)).toBe(
      DEFAULT_CHART_MARIMEKKO_PALETTE[0]
    );
    expect(getMarimekkoDefaultColor(-1)).toBe(
      DEFAULT_CHART_MARIMEKKO_PALETTE[0]
    );
  });
});

describe('getMarimekkoColumnTotal', () => {
  it('sums positive finite values', () => {
    expect(getMarimekkoColumnTotal(COLUMNS[0]!, new Set())).toBe(60);
  });
  it('skips non-finite + non-positive values', () => {
    expect(
      getMarimekkoColumnTotal(
        { id: 'x', label: 'X', values: [10, Number.NaN, -5, 0, 20] },
        new Set()
      )
    ).toBe(30);
  });
  it('respects hidden series indices', () => {
    expect(getMarimekkoColumnTotal(COLUMNS[0]!, new Set([0]))).toBe(50);
    expect(getMarimekkoColumnTotal(COLUMNS[0]!, new Set([0, 1]))).toBe(30);
  });
});

describe('getMarimekkoGrandTotal', () => {
  it('sums all column totals', () => {
    expect(getMarimekkoGrandTotal(COLUMNS, new Set())).toBe(60 + 100 + 40);
  });
  it('respects hidden series indices', () => {
    expect(getMarimekkoGrandTotal(COLUMNS, new Set([0]))).toBe(50 + 60 + 20);
  });
});

describe('computeMarimekkoLayout', () => {
  const innerW = 480;
  const innerH = 320;
  const padX = 36;
  const padY = 36;

  it('returns one entry per column', () => {
    const out = computeMarimekkoLayout({
      columns: COLUMNS,
      series: SERIES,
      hiddenSeries: new Set(),
      innerW,
      innerH,
      padX,
      padY,
      cellGap: 1,
      columnGap: 2,
    });
    expect(out).toHaveLength(3);
  });

  it('column widths are proportional to column total', () => {
    const out = computeMarimekkoLayout({
      columns: COLUMNS,
      series: SERIES,
      hiddenSeries: new Set(),
      innerW,
      innerH,
      padX,
      padY,
      cellGap: 0,
      columnGap: 0,
    });
    // budgets: 480; totals 60/100/40 / 200 -> 0.3 / 0.5 / 0.2
    expect(out[0]!.width).toBeCloseTo(480 * 0.3);
    expect(out[1]!.width).toBeCloseTo(480 * 0.5);
    expect(out[2]!.width).toBeCloseTo(480 * 0.2);
  });

  it('column widths subtract columnGap from the width budget', () => {
    const out = computeMarimekkoLayout({
      columns: COLUMNS,
      series: SERIES,
      hiddenSeries: new Set(),
      innerW,
      innerH,
      padX,
      padY,
      cellGap: 0,
      columnGap: 6,
    });
    const sum = out.reduce((acc, c) => acc + c.width, 0);
    expect(sum).toBeCloseTo(innerW - 6 * 2);
  });

  it('cells stack top-to-bottom within a column', () => {
    const out = computeMarimekkoLayout({
      columns: COLUMNS,
      series: SERIES,
      hiddenSeries: new Set(),
      innerW,
      innerH,
      padX,
      padY,
      cellGap: 0,
      columnGap: 0,
    });
    const col = out[0]!;
    expect(col.cells).toHaveLength(3);
    expect(col.cells[0]!.y).toBeLessThan(col.cells[1]!.y);
    expect(col.cells[1]!.y).toBeLessThan(col.cells[2]!.y);
  });

  it('cell heights sum to innerH per visible column (no gaps)', () => {
    const out = computeMarimekkoLayout({
      columns: COLUMNS,
      series: SERIES,
      hiddenSeries: new Set(),
      innerW,
      innerH,
      padX,
      padY,
      cellGap: 0,
      columnGap: 0,
    });
    for (const col of out) {
      const sum = col.cells.reduce((acc, c) => acc + c.height, 0);
      expect(sum).toBeCloseTo(innerH);
    }
  });

  it('hidden series drop cells but keep visible cells unchanged', () => {
    const out = computeMarimekkoLayout({
      columns: COLUMNS,
      series: SERIES,
      hiddenSeries: new Set(['s2']),
      innerW,
      innerH,
      padX,
      padY,
      cellGap: 0,
      columnGap: 0,
    });
    for (const col of out) {
      const seriesIds = col.cells.map((c) => c.seriesId);
      expect(seriesIds).not.toContain('s2');
    }
  });

  it('non-positive values get skipped', () => {
    const cols: ChartMarimekkoColumn[] = [
      { id: 'a', label: 'A', values: [10, 0, -5] },
    ];
    const out = computeMarimekkoLayout({
      columns: cols,
      series: SERIES,
      hiddenSeries: new Set(),
      innerW,
      innerH,
      padX,
      padY,
      cellGap: 0,
      columnGap: 0,
    });
    expect(out[0]!.cells).toHaveLength(1);
    expect(out[0]!.cells[0]!.seriesId).toBe('s1');
  });

  it('cell columnShare sums to (column total / grand total)', () => {
    const out = computeMarimekkoLayout({
      columns: COLUMNS,
      series: SERIES,
      hiddenSeries: new Set(),
      innerW,
      innerH,
      padX,
      padY,
      cellGap: 0,
      columnGap: 0,
    });
    expect(out[0]!.share).toBeCloseTo(60 / 200);
    expect(out[1]!.share).toBeCloseTo(100 / 200);
    expect(out[2]!.share).toBeCloseTo(40 / 200);
  });

  it('cellShare values sum to 1 per column', () => {
    const out = computeMarimekkoLayout({
      columns: COLUMNS,
      series: SERIES,
      hiddenSeries: new Set(),
      innerW,
      innerH,
      padX,
      padY,
      cellGap: 0,
      columnGap: 0,
    });
    for (const col of out) {
      const sum = col.cells.reduce((acc, c) => acc + c.cellShare, 0);
      expect(sum).toBeCloseTo(1);
    }
  });

  it('overallShare values sum to 1 across the whole chart', () => {
    const out = computeMarimekkoLayout({
      columns: COLUMNS,
      series: SERIES,
      hiddenSeries: new Set(),
      innerW,
      innerH,
      padX,
      padY,
      cellGap: 0,
      columnGap: 0,
    });
    let sum = 0;
    for (const col of out) {
      for (const cell of col.cells) sum += cell.overallShare;
    }
    expect(sum).toBeCloseTo(1);
  });

  it('returns [] for non-positive inner dimensions', () => {
    const out = computeMarimekkoLayout({
      columns: COLUMNS,
      series: SERIES,
      hiddenSeries: new Set(),
      innerW: 0,
      innerH,
      padX,
      padY,
      cellGap: 0,
      columnGap: 0,
    });
    expect(out).toEqual([]);
  });

  it('returns [] for grand-total = 0', () => {
    const cols: ChartMarimekkoColumn[] = [
      { id: 'a', label: 'A', values: [0, 0, 0] },
    ];
    const out = computeMarimekkoLayout({
      columns: cols,
      series: SERIES,
      hiddenSeries: new Set(),
      innerW,
      innerH,
      padX,
      padY,
      cellGap: 0,
      columnGap: 0,
    });
    expect(out).toEqual([]);
  });

  it('per-series color override beats palette', () => {
    const series: ChartMarimekkoSeries[] = [
      { id: 's1', label: 'A', color: '#abcdef' },
    ];
    const cols: ChartMarimekkoColumn[] = [
      { id: 'c1', label: 'X', values: [1] },
    ];
    const out = computeMarimekkoLayout({
      columns: cols,
      series,
      hiddenSeries: new Set(),
      innerW,
      innerH,
      padX,
      padY,
      cellGap: 0,
      columnGap: 0,
    });
    expect(out[0]!.cells[0]!.color).toBe('#abcdef');
  });
});

describe('describeMarimekkoChart', () => {
  it('returns "No data" for empty', () => {
    expect(describeMarimekkoChart([], SERIES, new Set())).toBe('No data');
  });
  it('returns "No data" when grand total is 0', () => {
    expect(
      describeMarimekkoChart(
        [{ id: 'a', label: 'A', values: [0, 0, 0] }],
        SERIES,
        new Set()
      )
    ).toBe('No data');
  });
  it('includes column count + visible series + total', () => {
    const d = describeMarimekkoChart(COLUMNS, SERIES, new Set());
    expect(d).toContain('3 columns');
    expect(d).toContain('3 visible series');
    expect(d).toContain('200');
  });
  it('honors formatValue', () => {
    const d = describeMarimekkoChart(
      COLUMNS,
      SERIES,
      new Set(),
      (v) => `$${v}`
    );
    expect(d).toContain('$200');
  });
});

describe('<ChartMarimekko> component', () => {
  it('renders a region with role + custom aria-label', () => {
    const { getByRole } = render(
      <ChartMarimekko
        columns={COLUMNS}
        series={SERIES}
        ariaLabel="Test marimekko"
      />
    );
    expect(getByRole('region', { name: 'Test marimekko' })).toBeTruthy();
  });

  it('renders one column group per column', () => {
    const { container } = render(
      <ChartMarimekko columns={COLUMNS} series={SERIES} />
    );
    expect(
      container.querySelectorAll('[data-section="chart-marimekko-column"]').length
    ).toBe(3);
  });

  it('renders one cell per (column, visible series) with positive value', () => {
    const { container } = render(
      <ChartMarimekko columns={COLUMNS} series={SERIES} />
    );
    expect(
      container.querySelectorAll('[data-section="chart-marimekko-cell"]').length
    ).toBe(9);
  });

  it('column data attrs carry id / index / total / share / width', () => {
    const { container } = render(
      <ChartMarimekko columns={COLUMNS} series={SERIES} />
    );
    const col = container.querySelector(
      '[data-column-id="c1"]'
    ) as HTMLElement;
    expect(col.getAttribute('data-column-index')).toBe('0');
    expect(col.getAttribute('data-column-total')).toBe('60');
    expect(col.getAttribute('data-column-share')).toBeTruthy();
    expect(col.getAttribute('data-column-width')).toBeTruthy();
  });

  it('cell data attrs mirror value / share / color', () => {
    const { container } = render(
      <ChartMarimekko columns={COLUMNS} series={SERIES} />
    );
    const cells = container.querySelectorAll(
      '[data-section="chart-marimekko-cell"]'
    );
    const c0 = cells[0]!;
    expect(c0.getAttribute('data-cell-value')).toBe('10');
    expect(c0.getAttribute('data-cell-color')).toBeTruthy();
    expect(c0.getAttribute('data-cell-share')).toBeTruthy();
    expect(c0.getAttribute('data-overall-share')).toBeTruthy();
  });

  it('cell rect is role=graphics-symbol + tabIndex=0 + aria-label', () => {
    const { container } = render(
      <ChartMarimekko columns={COLUMNS} series={SERIES} />
    );
    const rect = container.querySelector(
      '[data-section="chart-marimekko-rect"]'
    ) as SVGRectElement;
    expect(rect.getAttribute('role')).toBe('graphics-symbol');
    expect(rect.getAttribute('tabindex')).toBe('0');
    expect(rect.getAttribute('aria-label')).toContain('Q1');
    expect(rect.getAttribute('aria-label')).toContain('Series 1');
    expect(rect.getAttribute('aria-label')).toContain('of column');
  });

  it('root mirrors column / series / cell counts + grand-total + animate', () => {
    const { container } = render(
      <ChartMarimekko columns={COLUMNS} series={SERIES} />
    );
    const root = container.querySelector('[data-section="chart-marimekko"]');
    expect(root?.getAttribute('data-column-count')).toBe('3');
    expect(root?.getAttribute('data-series-count')).toBe('3');
    expect(root?.getAttribute('data-visible-series-count')).toBe('3');
    expect(root?.getAttribute('data-cell-count')).toBe('9');
    expect(root?.getAttribute('data-grand-total')).toBe('200');
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('legend renders one button per series', () => {
    const { container } = render(
      <ChartMarimekko columns={COLUMNS} series={SERIES} />
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-marimekko-legend-button"]'
    );
    expect(buttons.length).toBe(3);
  });

  it('legend toggle fires onSeriesToggle + decrements visible count (uncontrolled)', () => {
    const onSeriesToggle = vi.fn();
    const { container } = render(
      <ChartMarimekko
        columns={COLUMNS}
        series={SERIES}
        onSeriesToggle={onSeriesToggle}
      />
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-marimekko-legend-button"]'
    );
    fireEvent.click(buttons[1]! as HTMLElement);
    expect(onSeriesToggle).toHaveBeenCalledTimes(1);
    const arg = onSeriesToggle.mock.calls[0]![0];
    expect(arg.series.id).toBe('s2');
    expect(arg.hidden).toBe(true);
    const root = container.querySelector('[data-section="chart-marimekko"]');
    expect(root?.getAttribute('data-visible-series-count')).toBe('2');
  });

  it('legend respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartMarimekko
        columns={COLUMNS}
        series={SERIES}
        hiddenSeries={['s3']}
      />
    );
    const root = container.querySelector('[data-section="chart-marimekko"]');
    expect(root?.getAttribute('data-visible-series-count')).toBe('2');
  });

  it('showLegend=false suppresses the legend', () => {
    const { container } = render(
      <ChartMarimekko columns={COLUMNS} series={SERIES} showLegend={false} />
    );
    expect(
      container.querySelector('[data-section="chart-marimekko-legend"]')
    ).toBeNull();
  });

  it('legend placement = right reverses layout', () => {
    const { container } = render(
      <ChartMarimekko
        columns={COLUMNS}
        series={SERIES}
        legendPlacement="right"
      />
    );
    const legend = container.querySelector(
      '[data-section="chart-marimekko-legend"]'
    );
    expect(legend?.getAttribute('data-placement')).toBe('right');
  });

  it('percentage labels render on cells whose area exceeds labelMinArea', () => {
    const { container } = render(
      <ChartMarimekko
        columns={COLUMNS}
        series={SERIES}
        width={600}
        height={400}
        labelMinArea={0}
      />
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-marimekko-cell-label"]'
    );
    expect(labels.length).toBe(9);
  });

  it('showPercentageLabels=false suppresses labels', () => {
    const { container } = render(
      <ChartMarimekko
        columns={COLUMNS}
        series={SERIES}
        showPercentageLabels={false}
        labelMinArea={0}
      />
    );
    expect(
      container.querySelector('[data-section="chart-marimekko-cell-label"]')
    ).toBeNull();
  });

  it('labelMinArea hides labels in cells below the threshold', () => {
    const { container } = render(
      <ChartMarimekko
        columns={COLUMNS}
        series={SERIES}
        labelMinArea={1_000_000}
      />
    );
    expect(
      container.querySelector('[data-section="chart-marimekko-cell-label"]')
    ).toBeNull();
  });

  it('column labels render by default; one per column', () => {
    const { container } = render(
      <ChartMarimekko columns={COLUMNS} series={SERIES} />
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-marimekko-column-label"]'
    );
    expect(labels.length).toBe(3);
    expect(labels[0]!.textContent).toBe('Q1');
  });

  it('showColumnLabels=false suppresses column labels', () => {
    const { container } = render(
      <ChartMarimekko
        columns={COLUMNS}
        series={SERIES}
        showColumnLabels={false}
      />
    );
    expect(
      container.querySelector('[data-section="chart-marimekko-column-label"]')
    ).toBeNull();
  });

  it('showColumnTotals=true renders one total per column', () => {
    const { container } = render(
      <ChartMarimekko
        columns={COLUMNS}
        series={SERIES}
        showColumnTotals
      />
    );
    const totals = container.querySelectorAll(
      '[data-section="chart-marimekko-column-total"]'
    );
    expect(totals.length).toBe(3);
    expect(totals[0]!.textContent).toBe('60');
  });

  it('tooltip opens on cell hover with column + series + value + shares', () => {
    const { container } = render(
      <ChartMarimekko columns={COLUMNS} series={SERIES} />
    );
    const cells = container.querySelectorAll(
      '[data-section="chart-marimekko-cell"]'
    );
    fireEvent.mouseEnter(cells[0]! as HTMLElement);
    expect(
      container.querySelector('[data-section="chart-marimekko-tooltip"]')
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-marimekko-tooltip-label"]'
      )?.textContent
    ).toBe('Q1 / Series 1');
    expect(
      container.querySelector(
        '[data-section="chart-marimekko-tooltip-value"]'
      )?.textContent
    ).toBe('10');
    expect(
      container.querySelector(
        '[data-section="chart-marimekko-tooltip-column"]'
      )?.textContent
    ).toContain('17%');
    expect(
      container.querySelector(
        '[data-section="chart-marimekko-tooltip-overall"]'
      )?.textContent
    ).toContain('5%');
  });

  it('tooltip hides on mouseleave', () => {
    const { container } = render(
      <ChartMarimekko columns={COLUMNS} series={SERIES} />
    );
    const cell = container.querySelector(
      '[data-section="chart-marimekko-cell"]'
    ) as HTMLElement;
    fireEvent.mouseEnter(cell);
    expect(
      container.querySelector('[data-section="chart-marimekko-tooltip"]')
    ).not.toBeNull();
    fireEvent.mouseLeave(cell);
    expect(
      container.querySelector('[data-section="chart-marimekko-tooltip"]')
    ).toBeNull();
  });

  it('showTooltip=false suppresses tooltip', () => {
    const { container } = render(
      <ChartMarimekko
        columns={COLUMNS}
        series={SERIES}
        showTooltip={false}
      />
    );
    fireEvent.mouseEnter(
      container.querySelector(
        '[data-section="chart-marimekko-cell"]'
      )! as HTMLElement
    );
    expect(
      container.querySelector('[data-section="chart-marimekko-tooltip"]')
    ).toBeNull();
  });

  it('formatPercent reaches the tooltip + cell aria-label', () => {
    const { container } = render(
      <ChartMarimekko
        columns={COLUMNS}
        series={SERIES}
        formatPercent={(p) => `${(p * 100).toFixed(1)}%`}
      />
    );
    const rect = container.querySelector(
      '[data-section="chart-marimekko-rect"]'
    ) as SVGRectElement;
    expect(rect.getAttribute('aria-label')).toContain('.');
    fireEvent.mouseEnter(
      container.querySelector(
        '[data-section="chart-marimekko-cell"]'
      )! as HTMLElement
    );
    expect(
      container.querySelector(
        '[data-section="chart-marimekko-tooltip-column"]'
      )?.textContent
    ).toContain('.');
  });

  it('onCellClick fires with the cell payload', () => {
    const onCellClick = vi.fn();
    const { container } = render(
      <ChartMarimekko
        columns={COLUMNS}
        series={SERIES}
        onCellClick={onCellClick}
      />
    );
    const cells = container.querySelectorAll(
      '[data-section="chart-marimekko-cell"]'
    );
    fireEvent.click(cells[3]! as HTMLElement);
    expect(onCellClick).toHaveBeenCalledTimes(1);
    expect(onCellClick.mock.calls[0]![0].cell.columnId).toBeTruthy();
  });

  it('data-hovered mirrors the hover state', () => {
    const { container } = render(
      <ChartMarimekko columns={COLUMNS} series={SERIES} />
    );
    const cell = container.querySelector(
      '[data-section="chart-marimekko-cell"]'
    ) as HTMLElement;
    expect(cell.getAttribute('data-hovered')).toBe('false');
    fireEvent.mouseEnter(cell);
    expect(cell.getAttribute('data-hovered')).toBe('true');
    fireEvent.mouseLeave(cell);
    expect(cell.getAttribute('data-hovered')).toBe('false');
  });

  it('auto ARIA description renders by default', () => {
    const { container } = render(
      <ChartMarimekko columns={COLUMNS} series={SERIES} />
    );
    expect(
      container.querySelector(
        '[data-section="chart-marimekko-aria-desc"]'
      )?.textContent
    ).toContain('3 columns');
  });

  it('ariaDescription override beats auto', () => {
    const { container } = render(
      <ChartMarimekko
        columns={COLUMNS}
        series={SERIES}
        ariaDescription="Override"
      />
    );
    expect(
      container.querySelector(
        '[data-section="chart-marimekko-aria-desc"]'
      )?.textContent
    ).toBe('Override');
  });

  it('SVG mirrors width / height / viewBox', () => {
    const { container } = render(
      <ChartMarimekko
        columns={COLUMNS}
        series={SERIES}
        width={400}
        height={200}
      />
    );
    const svg = container.querySelector(
      '[data-section="chart-marimekko-svg"]'
    ) as SVGElement;
    expect(svg.getAttribute('width')).toBe('400');
    expect(svg.getAttribute('height')).toBe('200');
    expect(svg.getAttribute('viewBox')).toBe('0 0 400 200');
  });

  it('empty input renders without crashing', () => {
    const { container } = render(
      <ChartMarimekko columns={[]} series={SERIES} />
    );
    expect(
      container.querySelectorAll('[data-section="chart-marimekko-cell"]').length
    ).toBe(0);
    expect(
      container.querySelector(
        '[data-section="chart-marimekko-aria-desc"]'
      )?.textContent
    ).toBe('No data');
  });

  it('forwards ref to root', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartMarimekko columns={COLUMNS} series={SERIES} ref={ref} />);
    expect(ref.current?.dataset.section).toBe('chart-marimekko');
  });

  it('has stable displayName', () => {
    expect(ChartMarimekko.displayName).toBe('ChartMarimekko');
  });

  it('data-animate mirrors prop', () => {
    const { container } = render(
      <ChartMarimekko columns={COLUMNS} series={SERIES} animate={false} />
    );
    expect(
      container.querySelector('[data-section="chart-marimekko"]')!
        .getAttribute('data-animate')
    ).toBe('false');
  });
});
