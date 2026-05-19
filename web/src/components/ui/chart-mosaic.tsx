import {
  forwardRef,
  useCallback,
  useMemo,
  useState,
} from 'react';
import type { ForwardedRef } from 'react';
import { cn } from '../../lib/cn';
import { interpolateColor } from './chart-funnel';

// (v1.11.478, TODO 11.460) ChartMosaic primitive.
//
// Pure-SVG mosaic plot for 2D contingency tables. Each
// column width is proportional to its marginal total; each
// row cell inside a column has height proportional to the
// conditional count. Cell fill encodes the standardized
// chi-square residual (O - E) / sqrt(E): blue = positive
// (more than expected), red = negative (less than
// expected). Hovering a cell shows count + expected +
// residual + conditional + marginal percent.
//
// Reference: /root/c4/arps-design-system-v1/.

export interface ChartMosaicCell {
  row: string;
  column: string;
  count: number;
}

export interface ChartMosaicProps {
  cells: readonly ChartMosaicCell[];
  rowOrder?: readonly string[];
  columnOrder?: readonly string[];
  width?: number;
  height?: number;
  padding?: number;
  cellGap?: number;
  showLabels?: boolean;
  showRowLabels?: boolean;
  showColumnLabels?: boolean;
  showResidualLegend?: boolean;
  showTooltip?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatCount?: (v: number) => string;
  formatPercent?: (v: number) => string;
  formatResidual?: (v: number) => string;
  positiveColor?: string;
  negativeColor?: string;
  neutralColor?: string;
  residualClamp?: number;
  onCellClick?: (args: {
    row: string;
    column: string;
    cell: ChartMosaicCell | undefined;
    count: number;
    expected: number;
    residual: number;
  }) => void;
}

export interface MosaicTotals {
  rows: Map<string, number>;
  columns: Map<string, number>;
  grand: number;
}

export interface MosaicLayoutCell {
  row: string;
  column: string;
  count: number;
  expected: number;
  residual: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export const DEFAULT_CHART_MOSAIC_WIDTH = 540;
export const DEFAULT_CHART_MOSAIC_HEIGHT = 320;
export const DEFAULT_CHART_MOSAIC_PADDING = 36;
export const DEFAULT_CHART_MOSAIC_CELL_GAP = 1;
export const DEFAULT_CHART_MOSAIC_POSITIVE_COLOR = '#1d4ed8';
export const DEFAULT_CHART_MOSAIC_NEGATIVE_COLOR = '#b91c1c';
export const DEFAULT_CHART_MOSAIC_NEUTRAL_COLOR = '#f1f5f9';
export const DEFAULT_CHART_MOSAIC_RESIDUAL_CLAMP = 3;

// First-seen ordered list of unique values for the given
// field across the cells.
export function getMosaicFirstSeen(
  cells: readonly ChartMosaicCell[],
  field: 'row' | 'column',
): string[] {
  const seen: string[] = [];
  const set = new Set<string>();
  for (const c of cells) {
    const v = c[field];
    if (!set.has(v)) {
      set.add(v);
      seen.push(v);
    }
  }
  return seen;
}

// Compute row, column, and grand totals across the cells.
// Non-finite / non-positive counts are dropped.
export function getMosaicTotals(
  cells: readonly ChartMosaicCell[],
): MosaicTotals {
  const rows = new Map<string, number>();
  const columns = new Map<string, number>();
  let grand = 0;
  for (const c of cells) {
    if (!Number.isFinite(c.count) || c.count <= 0) continue;
    rows.set(c.row, (rows.get(c.row) ?? 0) + c.count);
    columns.set(
      c.column,
      (columns.get(c.column) ?? 0) + c.count,
    );
    grand += c.count;
  }
  return { rows, columns, grand };
}

// Expected count under independence: E = (R * C) / N.
export function getMosaicExpectedCount(
  rowTotal: number,
  columnTotal: number,
  grandTotal: number,
): number {
  if (
    !Number.isFinite(rowTotal) ||
    !Number.isFinite(columnTotal) ||
    !Number.isFinite(grandTotal) ||
    grandTotal <= 0
  ) {
    return 0;
  }
  return (rowTotal * columnTotal) / grandTotal;
}

// Standardized Pearson residual: (O - E) / sqrt(E).
// Returns 0 when expected is non-finite / non-positive.
export function getMosaicResidual(
  observed: number,
  expected: number,
): number {
  if (
    !Number.isFinite(observed) ||
    !Number.isFinite(expected) ||
    expected <= 0
  ) {
    return 0;
  }
  return (observed - expected) / Math.sqrt(expected);
}

// Build a layout for the mosaic plot. Columns get widths
// proportional to their marginal totals; within each
// column, rows stack with heights proportional to their
// conditional counts.
export function buildMosaicLayout(
  cells: readonly ChartMosaicCell[],
  rowOrder: readonly string[],
  columnOrder: readonly string[],
  innerWidth: number,
  innerHeight: number,
  originX: number,
  originY: number,
  cellGap: number,
): MosaicLayoutCell[] {
  const totals = getMosaicTotals(cells);
  if (totals.grand <= 0 || innerWidth <= 0 || innerHeight <= 0) {
    return [];
  }
  const out: MosaicLayoutCell[] = [];
  let cursorX = originX;
  for (
    let colIdx = 0;
    colIdx < columnOrder.length;
    colIdx += 1
  ) {
    const col = columnOrder[colIdx]!;
    const colTotal = totals.columns.get(col) ?? 0;
    const colWidth =
      colTotal > 0
        ? (colTotal / totals.grand) * innerWidth
        : 0;
    if (colWidth <= 0) {
      // Skip empty column entirely (no cells, no x cursor advance)
      continue;
    }
    let cursorY = originY;
    for (
      let rowIdx = 0;
      rowIdx < rowOrder.length;
      rowIdx += 1
    ) {
      const row = rowOrder[rowIdx]!;
      const cell = cells.find(
        (c) => c.row === row && c.column === col,
      );
      const count =
        cell && Number.isFinite(cell.count) && cell.count > 0
          ? cell.count
          : 0;
      const cellHeight =
        colTotal > 0
          ? (count / colTotal) * innerHeight
          : 0;
      const rowTotal = totals.rows.get(row) ?? 0;
      const expected = getMosaicExpectedCount(
        rowTotal,
        colTotal,
        totals.grand,
      );
      const residual = getMosaicResidual(count, expected);
      if (cellHeight <= 0) {
        // Empty cell -- skip rendering but record for hover lookup
        out.push({
          row,
          column: col,
          count,
          expected,
          residual,
          x: cursorX,
          y: cursorY,
          w: 0,
          h: 0,
        });
        continue;
      }
      out.push({
        row,
        column: col,
        count,
        expected,
        residual,
        x: cursorX,
        y: cursorY,
        w: Math.max(0, colWidth - cellGap),
        h: Math.max(0, cellHeight - cellGap),
      });
      cursorY += cellHeight;
    }
    cursorX += colWidth;
  }
  return out;
}

// Decide a cell's fill colour from its standardized
// residual. Positive residuals trend toward `positiveColor`;
// negative toward `negativeColor`; zero residual is
// `neutralColor`. `clamp` caps the absolute residual for
// the colour interpolation so visualizations stay readable.
export function getMosaicResidualColor(
  residual: number,
  positiveColor: string,
  negativeColor: string,
  neutralColor: string,
  clamp: number = DEFAULT_CHART_MOSAIC_RESIDUAL_CLAMP,
): string {
  if (!Number.isFinite(residual) || residual === 0) {
    return neutralColor;
  }
  const safeClamp =
    Number.isFinite(clamp) && clamp > 0 ? clamp : 1;
  const ratio = Math.min(
    Math.abs(residual) / safeClamp,
    1,
  );
  if (residual > 0) {
    return interpolateColor(neutralColor, positiveColor, ratio);
  }
  return interpolateColor(neutralColor, negativeColor, ratio);
}

// One-line ARIA summary.
export function describeMosaicChart(
  cells: readonly ChartMosaicCell[],
  formatCount?: (v: number) => string,
): string {
  if (cells.length === 0) return 'No data';
  const fc = (v: number) =>
    formatCount ? formatCount(v) : `${v}`;
  const totals = getMosaicTotals(cells);
  if (totals.grand <= 0) return 'No data';
  const rowCount = totals.rows.size;
  const colCount = totals.columns.size;
  return `Mosaic plot with ${rowCount} rows and ${colCount} columns. Grand total ${fc(totals.grand)}.`;
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export const ChartMosaic = forwardRef(function ChartMosaic(
  {
    cells,
    rowOrder,
    columnOrder,
    width = DEFAULT_CHART_MOSAIC_WIDTH,
    height = DEFAULT_CHART_MOSAIC_HEIGHT,
    padding = DEFAULT_CHART_MOSAIC_PADDING,
    cellGap = DEFAULT_CHART_MOSAIC_CELL_GAP,
    showLabels = true,
    showRowLabels = true,
    showColumnLabels = true,
    showResidualLegend = true,
    showTooltip = true,
    animate = true,
    className,
    ariaLabel = 'Mosaic plot',
    ariaDescription,
    formatCount,
    formatPercent,
    formatResidual,
    positiveColor = DEFAULT_CHART_MOSAIC_POSITIVE_COLOR,
    negativeColor = DEFAULT_CHART_MOSAIC_NEGATIVE_COLOR,
    neutralColor = DEFAULT_CHART_MOSAIC_NEUTRAL_COLOR,
    residualClamp = DEFAULT_CHART_MOSAIC_RESIDUAL_CLAMP,
    onCellClick,
  }: ChartMosaicProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const totals = useMemo(() => getMosaicTotals(cells), [cells]);

  const resolvedRows = useMemo(
    () =>
      rowOrder && rowOrder.length > 0
        ? Array.from(rowOrder)
        : getMosaicFirstSeen(cells, 'row'),
    [cells, rowOrder],
  );
  const resolvedColumns = useMemo(
    () =>
      columnOrder && columnOrder.length > 0
        ? Array.from(columnOrder)
        : getMosaicFirstSeen(cells, 'column'),
    [cells, columnOrder],
  );

  const labelMargin = showColumnLabels ? 16 : 0;
  const rowLabelMargin = showRowLabels ? 36 : 0;
  const originX = padding + rowLabelMargin;
  const originY = padding;
  const innerWidth = Math.max(
    0,
    width - originX - padding,
  );
  const innerHeight = Math.max(
    0,
    height - originY - padding - labelMargin,
  );

  const layout = useMemo(
    () =>
      buildMosaicLayout(
        cells,
        resolvedRows,
        resolvedColumns,
        innerWidth,
        innerHeight,
        originX,
        originY,
        cellGap,
      ),
    [
      cellGap,
      cells,
      innerHeight,
      innerWidth,
      originX,
      originY,
      resolvedColumns,
      resolvedRows,
    ],
  );

  const description = useMemo(
    () =>
      ariaDescription ?? describeMosaicChart(cells, formatCount),
    [ariaDescription, cells, formatCount],
  );

  const [hovered, setHovered] = useState<{
    row: string;
    column: string;
  } | null>(null);

  const handleEnter = useCallback(
    (row: string, column: string) => {
      setHovered({ row, column });
    },
    [],
  );
  const handleLeave = useCallback(() => {
    setHovered(null);
  }, []);

  const fc = (v: number) =>
    formatCount ? formatCount(v) : `${v}`;
  const fp = (v: number) =>
    formatPercent
      ? formatPercent(v)
      : `${(v * 100).toFixed(1)}%`;
  const fr = (v: number) =>
    formatResidual ? formatResidual(v) : v.toFixed(2);

  const hoveredCell = useMemo(
    () =>
      hovered
        ? layout.find(
            (l) =>
              l.row === hovered.row && l.column === hovered.column,
          ) ?? null
        : null,
    [hovered, layout],
  );

  // Column header positions
  const colXMap = useMemo(() => {
    const m = new Map<string, { x: number; w: number }>();
    if (totals.grand <= 0) return m;
    let cursor = originX;
    for (const col of resolvedColumns) {
      const colTotal = totals.columns.get(col) ?? 0;
      if (colTotal <= 0) {
        m.set(col, { x: cursor, w: 0 });
        continue;
      }
      const w = (colTotal / totals.grand) * innerWidth;
      m.set(col, { x: cursor, w });
      cursor += w;
    }
    return m;
  }, [
    innerWidth,
    originX,
    resolvedColumns,
    totals.columns,
    totals.grand,
  ]);

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      data-section="chart-mosaic"
      data-row-count={resolvedRows.length}
      data-column-count={resolvedColumns.length}
      data-grand-total={totals.grand}
      data-animate={animate ? 'true' : 'false'}
      className={cn(
        'relative inline-block w-full max-w-full',
        className,
      )}
      style={{ width }}
    >
      <span
        data-section="chart-mosaic-aria-desc"
        className="sr-only"
      >
        {description}
      </span>
      <svg
        role="img"
        aria-label={ariaLabel}
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        data-section="chart-mosaic-svg"
        className="h-auto w-full"
      >
        {/* Column labels (top) */}
        {showColumnLabels
          ? resolvedColumns.map((col) => {
              const meta = colXMap.get(col);
              if (!meta || meta.w <= 0) return null;
              return (
                <text
                  key={`col-${col}`}
                  aria-hidden="true"
                  data-section="chart-mosaic-column-label"
                  data-column={col}
                  x={meta.x + meta.w / 2}
                  y={originY - 4}
                  textAnchor="middle"
                  fontSize={10}
                  fill="currentColor"
                  fillOpacity={0.75}
                >
                  {col}
                </text>
              );
            })
          : null}
        {/* Cells */}
        {layout.map((c) => {
          if (c.w <= 0 || c.h <= 0) return null;
          const fill = getMosaicResidualColor(
            c.residual,
            positiveColor,
            negativeColor,
            neutralColor,
            residualClamp,
          );
          const isHovered =
            hovered?.row === c.row &&
            hovered?.column === c.column;
          return (
            <g
              key={`cell-${c.column}-${c.row}`}
              data-section="chart-mosaic-cell"
              data-row={c.row}
              data-column={c.column}
              data-count={c.count}
              data-expected={c.expected.toFixed(4)}
              data-residual={c.residual.toFixed(4)}
              data-hovered={isHovered ? 'true' : 'false'}
              className={cn(
                animate && 'motion-safe:animate-fade-in',
              )}
            >
              <rect
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`${c.row} x ${c.column}: count ${fc(c.count)}, expected ${fc(c.expected)}, residual ${fr(c.residual)}`}
                data-section="chart-mosaic-rect"
                data-row={c.row}
                data-column={c.column}
                x={c.x}
                y={c.y}
                width={c.w}
                height={c.h}
                fill={fill}
                stroke={isHovered ? '#0f172a' : '#ffffff'}
                strokeWidth={isHovered ? 1.5 : 1}
                onMouseEnter={() =>
                  handleEnter(c.row, c.column)
                }
                onMouseLeave={handleLeave}
                onFocus={() => handleEnter(c.row, c.column)}
                onBlur={handleLeave}
                onClick={
                  onCellClick
                    ? () =>
                        onCellClick({
                          row: c.row,
                          column: c.column,
                          cell: cells.find(
                            (orig) =>
                              orig.row === c.row &&
                              orig.column === c.column,
                          ),
                          count: c.count,
                          expected: c.expected,
                          residual: c.residual,
                        })
                    : undefined
                }
                style={{
                  cursor: onCellClick
                    ? 'pointer'
                    : 'default',
                }}
              />
              {showLabels && c.w > 32 && c.h > 14 ? (
                <text
                  aria-hidden="true"
                  data-section="chart-mosaic-cell-label"
                  data-row={c.row}
                  data-column={c.column}
                  x={c.x + c.w / 2}
                  y={c.y + c.h / 2 + 3}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={600}
                  fill="#0f172a"
                  fillOpacity={0.85}
                >
                  {fc(c.count)}
                </text>
              ) : null}
            </g>
          );
        })}
        {/* Row labels (left) */}
        {showRowLabels
          ? resolvedRows.map((row) => {
              // Find the first cell rendered for this row across columns
              const cell = layout.find(
                (l) => l.row === row && l.h > 0,
              );
              if (!cell) return null;
              return (
                <text
                  key={`row-${row}`}
                  aria-hidden="true"
                  data-section="chart-mosaic-row-label"
                  data-row={row}
                  x={originX - 4}
                  y={cell.y + cell.h / 2 + 3}
                  textAnchor="end"
                  fontSize={10}
                  fill="currentColor"
                  fillOpacity={0.75}
                >
                  {row}
                </text>
              );
            })
          : null}
        {/* Residual legend (bottom-right) */}
        {showResidualLegend ? (
          <g
            data-section="chart-mosaic-residual-legend"
            aria-hidden="true"
            transform={`translate(${width - padding - 60}, ${height - padding + 4})`}
          >
            <rect
              data-section="chart-mosaic-legend-swatch-neg"
              x={0}
              y={0}
              width={12}
              height={8}
              fill={negativeColor}
            />
            <rect
              data-section="chart-mosaic-legend-swatch-neu"
              x={14}
              y={0}
              width={12}
              height={8}
              fill={neutralColor}
            />
            <rect
              data-section="chart-mosaic-legend-swatch-pos"
              x={28}
              y={0}
              width={12}
              height={8}
              fill={positiveColor}
            />
            <text
              data-section="chart-mosaic-legend-label"
              x={42}
              y={7}
              fontSize={9}
              fill="currentColor"
              fillOpacity={0.65}
            >
              residual
            </text>
          </g>
        ) : null}
      </svg>
      {showTooltip && hoveredCell ? (
        <div
          role="tooltip"
          data-section="chart-mosaic-tooltip"
          data-row={hoveredCell.row}
          data-column={hoveredCell.column}
          style={{
            left: hoveredCell.x + hoveredCell.w / 2 + 6,
            top: hoveredCell.y + 4,
          }}
          className="pointer-events-none absolute rounded border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow"
        >
          <div
            data-section="chart-mosaic-tooltip-label"
            className="font-medium"
          >
            {hoveredCell.row} x {hoveredCell.column}
          </div>
          <div
            data-section="chart-mosaic-tooltip-count"
            className="font-mono"
          >
            count: {fc(hoveredCell.count)}
          </div>
          <div
            data-section="chart-mosaic-tooltip-expected"
            className="font-mono text-muted-foreground"
          >
            expected: {fc(hoveredCell.expected)}
          </div>
          <div
            data-section="chart-mosaic-tooltip-residual"
            className="font-mono text-muted-foreground"
          >
            residual: {fr(hoveredCell.residual)}
          </div>
          {totals.grand > 0 ? (
            <div
              data-section="chart-mosaic-tooltip-percent"
              className="text-muted-foreground"
            >
              {fp(hoveredCell.count / totals.grand)} of total
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});

ChartMosaic.displayName = 'ChartMosaic';
