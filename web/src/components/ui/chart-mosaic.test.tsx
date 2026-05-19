import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartMosaic,
  DEFAULT_CHART_MOSAIC_CELL_GAP,
  DEFAULT_CHART_MOSAIC_HEIGHT,
  DEFAULT_CHART_MOSAIC_NEGATIVE_COLOR,
  DEFAULT_CHART_MOSAIC_NEUTRAL_COLOR,
  DEFAULT_CHART_MOSAIC_PADDING,
  DEFAULT_CHART_MOSAIC_POSITIVE_COLOR,
  DEFAULT_CHART_MOSAIC_RESIDUAL_CLAMP,
  DEFAULT_CHART_MOSAIC_WIDTH,
  buildMosaicLayout,
  describeMosaicChart,
  getMosaicExpectedCount,
  getMosaicFirstSeen,
  getMosaicResidual,
  getMosaicResidualColor,
  getMosaicTotals,
} from './chart-mosaic';
import type { ChartMosaicCell } from './chart-mosaic';

const cells: ChartMosaicCell[] = [
  { row: 'A', column: 'X', count: 30 },
  { row: 'A', column: 'Y', count: 20 },
  { row: 'B', column: 'X', count: 10 },
  { row: 'B', column: 'Y', count: 40 },
];

describe('chart-mosaic pure helpers', () => {
  describe('getMosaicFirstSeen', () => {
    it('returns rows in first-seen order', () => {
      expect(getMosaicFirstSeen(cells, 'row')).toEqual([
        'A',
        'B',
      ]);
    });
    it('returns columns in first-seen order', () => {
      expect(getMosaicFirstSeen(cells, 'column')).toEqual([
        'X',
        'Y',
      ]);
    });
    it('handles empty input', () => {
      expect(getMosaicFirstSeen([], 'row')).toEqual([]);
    });
  });

  describe('getMosaicTotals', () => {
    it('sums row, column, and grand totals', () => {
      const t = getMosaicTotals(cells);
      expect(t.rows.get('A')).toBe(50);
      expect(t.rows.get('B')).toBe(50);
      expect(t.columns.get('X')).toBe(40);
      expect(t.columns.get('Y')).toBe(60);
      expect(t.grand).toBe(100);
    });
    it('drops non-finite / non-positive counts', () => {
      const t = getMosaicTotals([
        { row: 'r', column: 'c', count: 10 },
        { row: 'r', column: 'c', count: 0 },
        { row: 'r', column: 'c', count: Number.NaN },
        { row: 'r', column: 'c', count: -5 },
      ]);
      expect(t.grand).toBe(10);
    });
    it('returns empty maps + zero for empty input', () => {
      const t = getMosaicTotals([]);
      expect(t.rows.size).toBe(0);
      expect(t.columns.size).toBe(0);
      expect(t.grand).toBe(0);
    });
  });

  describe('getMosaicExpectedCount', () => {
    it('computes (R * C) / N', () => {
      expect(getMosaicExpectedCount(50, 40, 100)).toBe(20);
      expect(getMosaicExpectedCount(50, 60, 100)).toBe(30);
    });
    it('returns 0 for non-positive grand total', () => {
      expect(getMosaicExpectedCount(10, 20, 0)).toBe(0);
    });
    it('returns 0 for non-finite inputs', () => {
      expect(
        getMosaicExpectedCount(Number.NaN, 20, 100),
      ).toBe(0);
      expect(
        getMosaicExpectedCount(20, Number.NaN, 100),
      ).toBe(0);
    });
  });

  describe('getMosaicResidual', () => {
    it('computes (O - E) / sqrt(E)', () => {
      expect(getMosaicResidual(30, 20)).toBeCloseTo(
        10 / Math.sqrt(20),
      );
    });
    it('returns 0 for non-positive expected', () => {
      expect(getMosaicResidual(5, 0)).toBe(0);
      expect(getMosaicResidual(5, -1)).toBe(0);
    });
    it('returns 0 for non-finite observed / expected', () => {
      expect(
        getMosaicResidual(Number.NaN, 20),
      ).toBe(0);
      expect(
        getMosaicResidual(5, Number.NaN),
      ).toBe(0);
    });
    it('returns positive for over-represented cells', () => {
      expect(getMosaicResidual(40, 20)).toBeGreaterThan(0);
    });
    it('returns negative for under-represented cells', () => {
      expect(getMosaicResidual(10, 20)).toBeLessThan(0);
    });
  });

  describe('buildMosaicLayout', () => {
    it('returns [] when grand total is 0', () => {
      expect(
        buildMosaicLayout([], ['r'], ['c'], 100, 100, 0, 0, 0),
      ).toEqual([]);
    });
    it('returns [] for zero-area canvas', () => {
      expect(
        buildMosaicLayout(cells, ['A'], ['X'], 0, 0, 0, 0, 0),
      ).toEqual([]);
    });
    it('emits one entry per (row, column) pair', () => {
      const layout = buildMosaicLayout(
        cells,
        ['A', 'B'],
        ['X', 'Y'],
        100,
        100,
        0,
        0,
        0,
      );
      // 2 rows x 2 columns = 4 entries
      expect(layout.length).toBe(4);
    });
    it('cell widths are proportional to column marginal totals', () => {
      const layout = buildMosaicLayout(
        cells,
        ['A', 'B'],
        ['X', 'Y'],
        100,
        100,
        0,
        0,
        0,
      );
      // Column X total = 40 / 100; column Y total = 60 / 100
      const xCells = layout.filter((c) => c.column === 'X');
      const yCells = layout.filter((c) => c.column === 'Y');
      expect(xCells[0]?.w).toBeCloseTo(40);
      expect(yCells[0]?.w).toBeCloseTo(60);
    });
    it('cell heights inside a column sum to inner height', () => {
      const layout = buildMosaicLayout(
        cells,
        ['A', 'B'],
        ['X', 'Y'],
        100,
        100,
        0,
        0,
        0,
      );
      const xCells = layout.filter((c) => c.column === 'X');
      const totalX = xCells.reduce((s, c) => s + c.h, 0);
      expect(totalX).toBeCloseTo(100, 1);
    });
    it('residual reflects independence formula', () => {
      const layout = buildMosaicLayout(
        cells,
        ['A', 'B'],
        ['X', 'Y'],
        100,
        100,
        0,
        0,
        0,
      );
      const ax = layout.find(
        (c) => c.row === 'A' && c.column === 'X',
      )!;
      // E = (50 * 40) / 100 = 20; O = 30; residual = 10/sqrt(20)
      expect(ax.expected).toBe(20);
      expect(ax.residual).toBeCloseTo(10 / Math.sqrt(20));
    });
    it('skips empty columns entirely', () => {
      const layout = buildMosaicLayout(
        cells,
        ['A', 'B'],
        ['X', 'Y', 'Z'],
        100,
        100,
        0,
        0,
        0,
      );
      const z = layout.filter((c) => c.column === 'Z');
      expect(z.length).toBe(0);
    });
    it('records empty rows within a column without rendering width', () => {
      const data: ChartMosaicCell[] = [
        { row: 'A', column: 'X', count: 50 },
      ];
      const layout = buildMosaicLayout(
        data,
        ['A', 'B'],
        ['X'],
        100,
        100,
        0,
        0,
        0,
      );
      const b = layout.find((c) => c.row === 'B')!;
      expect(b.h).toBe(0);
      expect(b.count).toBe(0);
    });
  });

  describe('getMosaicResidualColor', () => {
    it('returns neutralColor for residual=0', () => {
      expect(
        getMosaicResidualColor(0, '#ff0000', '#00ff00', '#cccccc'),
      ).toBe('#cccccc');
    });
    it('returns neutralColor for non-finite residual', () => {
      expect(
        getMosaicResidualColor(
          Number.NaN,
          '#ff0000',
          '#00ff00',
          '#cccccc',
        ),
      ).toBe('#cccccc');
    });
    it('interpolates toward positiveColor for positive residual', () => {
      const c = getMosaicResidualColor(
        3,
        '#ffffff',
        '#000000',
        '#000000',
        3,
      );
      // At clamp, ratio=1 -> positive color
      expect(c).toBe('#ffffff');
    });
    it('interpolates toward negativeColor for negative residual', () => {
      const c = getMosaicResidualColor(
        -3,
        '#000000',
        '#ffffff',
        '#000000',
        3,
      );
      expect(c).toBe('#ffffff');
    });
    it('clamps |residual| > clamp to the same color as |residual| = clamp', () => {
      const c1 = getMosaicResidualColor(
        5,
        '#000000',
        '#ffffff',
        '#888888',
        3,
      );
      const c2 = getMosaicResidualColor(
        3,
        '#000000',
        '#ffffff',
        '#888888',
        3,
      );
      expect(c1).toBe(c2);
    });
  });

  describe('describeMosaicChart', () => {
    it('returns "No data" for empty input', () => {
      expect(describeMosaicChart([])).toBe('No data');
    });
    it('returns "No data" for all-zero counts', () => {
      expect(
        describeMosaicChart([
          { row: 'r', column: 'c', count: 0 },
        ]),
      ).toBe('No data');
    });
    it('summarises rows, columns, grand total', () => {
      const text = describeMosaicChart(cells);
      expect(text).toContain('2 rows');
      expect(text).toContain('2 columns');
      expect(text).toContain('100');
    });
    it('honours formatCount', () => {
      const text = describeMosaicChart(cells, (v) => `${v}u`);
      expect(text).toContain('100u');
    });
  });

  it('exports default constants', () => {
    expect(DEFAULT_CHART_MOSAIC_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_MOSAIC_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_MOSAIC_PADDING).toBeGreaterThan(0);
    expect(DEFAULT_CHART_MOSAIC_CELL_GAP).toBeGreaterThanOrEqual(
      0,
    );
    expect(DEFAULT_CHART_MOSAIC_POSITIVE_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_MOSAIC_NEGATIVE_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_MOSAIC_NEUTRAL_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_MOSAIC_RESIDUAL_CLAMP).toBeGreaterThan(
      0,
    );
  });
});

describe('<ChartMosaic />', () => {
  it('renders a region with role + aria-label', () => {
    render(<ChartMosaic cells={cells} />);
    const root = screen.getByRole('region', {
      name: 'Mosaic plot',
    });
    expect(root).toBeInTheDocument();
    expect(root).toHaveAttribute(
      'data-section',
      'chart-mosaic',
    );
    expect(root).toHaveAttribute('data-row-count', '2');
    expect(root).toHaveAttribute('data-column-count', '2');
    expect(root).toHaveAttribute('data-grand-total', '100');
  });

  it('renders a custom aria-label', () => {
    render(
      <ChartMosaic cells={cells} ariaLabel="Cross-tab" />,
    );
    expect(
      screen.getByRole('region', { name: 'Cross-tab' }),
    ).toBeInTheDocument();
  });

  it('renders one cell per (row, column) pair with positive count', () => {
    const { container } = render(<ChartMosaic cells={cells} />);
    const rects = container.querySelectorAll(
      '[data-section="chart-mosaic-rect"]',
    );
    expect(rects.length).toBe(cells.length);
  });

  it('mirrors row + column + count + expected + residual on cell group', () => {
    const { container } = render(<ChartMosaic cells={cells} />);
    const ax = container.querySelector(
      '[data-section="chart-mosaic-cell"][data-row="A"][data-column="X"]',
    );
    expect(ax?.getAttribute('data-count')).toBe('30');
    expect(ax?.getAttribute('data-expected')).toBe('20.0000');
    const r = parseFloat(
      ax?.getAttribute('data-residual') ?? '0',
    );
    expect(r).toBeCloseTo(10 / Math.sqrt(20));
  });

  it('renders column labels by default', () => {
    const { container } = render(<ChartMosaic cells={cells} />);
    const labels = container.querySelectorAll(
      '[data-section="chart-mosaic-column-label"]',
    );
    expect(labels.length).toBe(2);
  });

  it('suppresses column labels when showColumnLabels=false', () => {
    const { container } = render(
      <ChartMosaic
        cells={cells}
        showColumnLabels={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-mosaic-column-label"]',
      ),
    ).toBeNull();
  });

  it('renders row labels by default', () => {
    const { container } = render(<ChartMosaic cells={cells} />);
    const labels = container.querySelectorAll(
      '[data-section="chart-mosaic-row-label"]',
    );
    expect(labels.length).toBe(2);
  });

  it('suppresses row labels when showRowLabels=false', () => {
    const { container } = render(
      <ChartMosaic cells={cells} showRowLabels={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-mosaic-row-label"]',
      ),
    ).toBeNull();
  });

  it('renders residual legend by default', () => {
    const { container } = render(<ChartMosaic cells={cells} />);
    expect(
      container.querySelector(
        '[data-section="chart-mosaic-residual-legend"]',
      ),
    ).not.toBeNull();
  });

  it('suppresses residual legend when showResidualLegend=false', () => {
    const { container } = render(
      <ChartMosaic
        cells={cells}
        showResidualLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-mosaic-residual-legend"]',
      ),
    ).toBeNull();
  });

  it('shows tooltip on cell hover with all rows', () => {
    const { container } = render(<ChartMosaic cells={cells} />);
    const ax = container.querySelector(
      '[data-section="chart-mosaic-rect"][data-row="A"][data-column="X"]',
    );
    fireEvent.mouseEnter(ax!);
    const tip = container.querySelector(
      '[data-section="chart-mosaic-tooltip"]',
    );
    expect(tip).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-mosaic-tooltip-label"]',
      )?.textContent,
    ).toContain('A');
    expect(
      container.querySelector(
        '[data-section="chart-mosaic-tooltip-count"]',
      )?.textContent,
    ).toContain('30');
    expect(
      container.querySelector(
        '[data-section="chart-mosaic-tooltip-expected"]',
      )?.textContent,
    ).toContain('20');
    expect(
      container.querySelector(
        '[data-section="chart-mosaic-tooltip-residual"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-mosaic-tooltip-percent"]',
      )?.textContent,
    ).toContain('of total');
  });

  it('hides tooltip on mouse-leave', () => {
    const { container } = render(<ChartMosaic cells={cells} />);
    const rect = container.querySelector(
      '[data-section="chart-mosaic-rect"]',
    );
    fireEvent.mouseEnter(rect!);
    fireEvent.mouseLeave(rect!);
    expect(
      container.querySelector(
        '[data-section="chart-mosaic-tooltip"]',
      ),
    ).toBeNull();
  });

  it('suppresses tooltip when showTooltip=false', () => {
    const { container } = render(
      <ChartMosaic cells={cells} showTooltip={false} />,
    );
    const rect = container.querySelector(
      '[data-section="chart-mosaic-rect"]',
    );
    fireEvent.mouseEnter(rect!);
    expect(
      container.querySelector(
        '[data-section="chart-mosaic-tooltip"]',
      ),
    ).toBeNull();
  });

  it('uses formatCount + formatPercent + formatResidual in tooltip', () => {
    const { container } = render(
      <ChartMosaic
        cells={cells}
        formatCount={(v) => `${v}u`}
        formatPercent={(v) => `${(v * 100).toFixed(0)}p`}
        formatResidual={(v) => `R:${v.toFixed(1)}`}
      />,
    );
    const ax = container.querySelector(
      '[data-section="chart-mosaic-rect"][data-row="A"][data-column="X"]',
    );
    fireEvent.mouseEnter(ax!);
    expect(
      container.querySelector(
        '[data-section="chart-mosaic-tooltip-count"]',
      )?.textContent,
    ).toContain('30u');
    expect(
      container.querySelector(
        '[data-section="chart-mosaic-tooltip-percent"]',
      )?.textContent,
    ).toContain('30p');
    expect(
      container.querySelector(
        '[data-section="chart-mosaic-tooltip-residual"]',
      )?.textContent,
    ).toContain('R:');
  });

  it('invokes onCellClick with row + column + count + expected + residual', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ChartMosaic cells={cells} onCellClick={onClick} />,
    );
    const ax = container.querySelector(
      '[data-section="chart-mosaic-rect"][data-row="A"][data-column="X"]',
    );
    fireEvent.click(ax!);
    expect(onClick).toHaveBeenCalledTimes(1);
    const arg = onClick.mock.calls[0]?.[0];
    expect(arg?.row).toBe('A');
    expect(arg?.column).toBe('X');
    expect(arg?.count).toBe(30);
    expect(arg?.expected).toBe(20);
    expect(arg?.residual).toBeCloseTo(10 / Math.sqrt(20));
  });

  it('exposes role=graphics-symbol + aria-label per cell', () => {
    const { container } = render(<ChartMosaic cells={cells} />);
    const rect = container.querySelector(
      '[data-section="chart-mosaic-rect"]',
    );
    expect(rect?.getAttribute('role')).toBe('graphics-symbol');
    expect(rect?.getAttribute('aria-label')).toContain('A x X');
    expect(rect?.getAttribute('aria-label')).toContain('count');
  });

  it('honours rowOrder / columnOrder props', () => {
    const { container } = render(
      <ChartMosaic
        cells={cells}
        rowOrder={['B', 'A']}
        columnOrder={['Y', 'X']}
      />,
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-mosaic-column-label"]',
    );
    expect(labels[0]?.textContent).toBe('Y');
    expect(labels[1]?.textContent).toBe('X');
  });

  it('honours custom positive / negative / neutral colors', () => {
    const { container } = render(
      <ChartMosaic
        cells={cells}
        positiveColor="#0000ff"
        negativeColor="#ffff00"
        neutralColor="#cccccc"
        residualClamp={2}
      />,
    );
    const legendPos = container.querySelector(
      '[data-section="chart-mosaic-legend-swatch-pos"]',
    );
    expect(legendPos?.getAttribute('fill')).toBe('#0000ff');
    const legendNeg = container.querySelector(
      '[data-section="chart-mosaic-legend-swatch-neg"]',
    );
    expect(legendNeg?.getAttribute('fill')).toBe('#ffff00');
  });

  it('mirrors animate flag on the root', () => {
    const { container, rerender } = render(
      <ChartMosaic cells={cells} />,
    );
    expect(
      container
        .querySelector('[data-section="chart-mosaic"]')
        ?.getAttribute('data-animate'),
    ).toBe('true');
    rerender(<ChartMosaic cells={cells} animate={false} />);
    expect(
      container
        .querySelector('[data-section="chart-mosaic"]')
        ?.getAttribute('data-animate'),
    ).toBe('false');
  });

  it('mirrors size on the svg', () => {
    const { container } = render(
      <ChartMosaic cells={cells} width={800} height={400} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-mosaic-svg"]',
    );
    expect(svg?.getAttribute('width')).toBe('800');
    expect(svg?.getAttribute('height')).toBe('400');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 800 400');
  });

  it('renders auto-generated ARIA description by default', () => {
    const { container } = render(<ChartMosaic cells={cells} />);
    const desc = container.querySelector(
      '[data-section="chart-mosaic-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Mosaic plot');
    expect(desc?.textContent).toContain('2 rows');
  });

  it('honours ariaDescription override', () => {
    const { container } = render(
      <ChartMosaic cells={cells} ariaDescription="custom" />,
    );
    const desc = container.querySelector(
      '[data-section="chart-mosaic-aria-desc"]',
    );
    expect(desc?.textContent).toBe('custom');
  });

  it('handles empty cells without crashing', () => {
    const { container } = render(<ChartMosaic cells={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-mosaic"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelectorAll(
        '[data-section="chart-mosaic-rect"]',
      ).length,
    ).toBe(0);
  });

  it('forwards ref to the root region', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartMosaic ref={ref} cells={cells} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-mosaic',
    );
  });

  it('has a stable displayName', () => {
    expect(ChartMosaic.displayName).toBe('ChartMosaic');
  });
});
