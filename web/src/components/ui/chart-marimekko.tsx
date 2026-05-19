import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_MARIMEKKO_WIDTH = 560;
export const DEFAULT_CHART_MARIMEKKO_HEIGHT = 360;
export const DEFAULT_CHART_MARIMEKKO_PADDING = 36;
export const DEFAULT_CHART_MARIMEKKO_CELL_GAP = 1;
export const DEFAULT_CHART_MARIMEKKO_COLUMN_GAP = 2;
export const DEFAULT_CHART_MARIMEKKO_LABEL_MIN_AREA = 280;
export const DEFAULT_CHART_MARIMEKKO_PALETTE = [
  '#2563eb',
  '#16a34a',
  '#f59e0b',
  '#dc2626',
  '#9333ea',
  '#0891b2',
  '#db2777',
  '#65a30d',
  '#7c3aed',
  '#0d9488',
];

export interface ChartMarimekkoSeries {
  id: string;
  label: string;
  color?: string;
}

export interface ChartMarimekkoColumn {
  id: string;
  label: string;
  values: readonly number[];
}

export interface ChartMarimekkoCell {
  columnId: string;
  columnIndex: number;
  seriesId: string;
  seriesIndex: number;
  value: number;
  columnTotal: number;
  columnShare: number;
  cellShare: number;
  overallShare: number;
}

export interface ChartMarimekkoLayoutCell extends ChartMarimekkoCell {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  label: string;
  seriesLabel: string;
  columnLabel: string;
}

export interface ChartMarimekkoLayoutColumn {
  id: string;
  index: number;
  label: string;
  total: number;
  share: number;
  x: number;
  y: number;
  width: number;
  height: number;
  cells: ChartMarimekkoLayoutCell[];
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function clamp01(v: number): number {
  if (!isFiniteNumber(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

export function getMarimekkoDefaultColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    return DEFAULT_CHART_MARIMEKKO_PALETTE[0]!;
  }
  return DEFAULT_CHART_MARIMEKKO_PALETTE[
    Math.floor(index) % DEFAULT_CHART_MARIMEKKO_PALETTE.length
  ]!;
}

export function getMarimekkoColumnTotal(
  column: ChartMarimekkoColumn,
  hiddenSeriesIndices: ReadonlySet<number>
): number {
  let total = 0;
  for (let i = 0; i < column.values.length; i++) {
    if (hiddenSeriesIndices.has(i)) continue;
    const v = column.values[i];
    if (isFiniteNumber(v) && v > 0) total += v;
  }
  return total;
}

export function getMarimekkoGrandTotal(
  columns: readonly ChartMarimekkoColumn[],
  hiddenSeriesIndices: ReadonlySet<number>
): number {
  let total = 0;
  for (const c of columns) {
    total += getMarimekkoColumnTotal(c, hiddenSeriesIndices);
  }
  return total;
}

export interface ComputeMarimekkoLayoutInput {
  columns: readonly ChartMarimekkoColumn[];
  series: readonly ChartMarimekkoSeries[];
  hiddenSeries: ReadonlySet<string>;
  innerW: number;
  innerH: number;
  padX: number;
  padY: number;
  cellGap: number;
  columnGap: number;
}

export function computeMarimekkoLayout(
  input: ComputeMarimekkoLayoutInput
): ChartMarimekkoLayoutColumn[] {
  const {
    columns,
    series,
    hiddenSeries,
    innerW,
    innerH,
    padX,
    padY,
    cellGap,
    columnGap,
  } = input;
  if (innerW <= 0 || innerH <= 0 || !columns.length) return [];
  const hiddenIdx = new Set<number>();
  for (let i = 0; i < series.length; i++) {
    if (hiddenSeries.has(series[i]!.id)) hiddenIdx.add(i);
  }
  const grandTotal = getMarimekkoGrandTotal(columns, hiddenIdx);
  if (grandTotal <= 0) return [];

  const colTotals: number[] = [];
  for (const c of columns) {
    colTotals.push(getMarimekkoColumnTotal(c, hiddenIdx));
  }

  const totalColumnGap = Math.max(0, columnGap) * Math.max(0, columns.length - 1);
  const widthBudget = Math.max(0, innerW - totalColumnGap);

  const out: ChartMarimekkoLayoutColumn[] = [];
  let cursorX = padX;
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i]!;
    const total = colTotals[i] ?? 0;
    const share = grandTotal > 0 ? total / grandTotal : 0;
    const colWidth = widthBudget * share;
    const colX = cursorX;
    const colY = padY;
    const cells: ChartMarimekkoLayoutCell[] = [];
    if (colWidth > 0 && total > 0) {
      let cursorY = padY;
      for (let s = 0; s < series.length; s++) {
        if (hiddenIdx.has(s)) continue;
        const raw = col.values[s];
        if (!isFiniteNumber(raw) || raw <= 0) continue;
        const cellShare = raw / total;
        const overallShare = grandTotal > 0 ? raw / grandTotal : 0;
        const rawH = cellShare * innerH;
        const cap = Math.min(cellGap, rawH / 2);
        const cellH = Math.max(0, rawH - cap);
        const cellW = Math.max(0, colWidth - cap);
        const seriesDef = series[s]!;
        const color = seriesDef.color ?? getMarimekkoDefaultColor(s);
        cells.push({
          columnId: col.id,
          columnIndex: i,
          seriesId: seriesDef.id,
          seriesIndex: s,
          value: raw,
          columnTotal: total,
          columnShare: share,
          cellShare,
          overallShare,
          x: colX + cap / 2,
          y: cursorY + cap / 2,
          width: cellW,
          height: cellH,
          color,
          label: seriesDef.label,
          seriesLabel: seriesDef.label,
          columnLabel: col.label,
        });
        cursorY += rawH;
      }
    }
    out.push({
      id: col.id,
      index: i,
      label: col.label,
      total,
      share,
      x: colX,
      y: colY,
      width: colWidth,
      height: innerH,
      cells,
    });
    cursorX += colWidth + columnGap;
  }
  return out;
}

export function describeMarimekkoChart(
  columns: readonly ChartMarimekkoColumn[],
  series: readonly ChartMarimekkoSeries[],
  hiddenSeries: ReadonlySet<string>,
  formatValue?: (v: number) => string
): string {
  if (!columns.length || !series.length) return 'No data';
  const fmt = formatValue ?? ((n: number) => String(n));
  const hiddenIdx = new Set<number>();
  for (let i = 0; i < series.length; i++) {
    if (hiddenSeries.has(series[i]!.id)) hiddenIdx.add(i);
  }
  const grand = getMarimekkoGrandTotal(columns, hiddenIdx);
  if (grand <= 0) return 'No data';
  return `Marimekko chart with ${columns.length} columns and ${series.length - hiddenIdx.size} visible series. Total ${fmt(grand)}.`;
}

export interface ChartMarimekkoProps {
  columns: readonly ChartMarimekkoColumn[];
  series: readonly ChartMarimekkoSeries[];
  width?: number;
  height?: number;
  padding?: number;
  cellGap?: number;
  columnGap?: number;
  labelMinArea?: number;
  hiddenSeries?: readonly string[];
  defaultHiddenSeries?: readonly string[];
  onHiddenSeriesChange?: (hidden: string[]) => void;
  showLegend?: boolean;
  showTooltip?: boolean;
  showPercentageLabels?: boolean;
  showColumnLabels?: boolean;
  showColumnTotals?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (v: number) => string;
  formatPercent?: (p: number) => string;
  legendPlacement?: 'right' | 'bottom';
  onCellClick?: (args: {
    cell: ChartMarimekkoLayoutCell;
  }) => void;
  onSeriesToggle?: (args: { series: ChartMarimekkoSeries; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isControlled<T>(prop: T | undefined): prop is T {
  return prop !== undefined;
}

function defaultFormatValue(v: number): string {
  if (!Number.isFinite(v)) return String(v);
  if (Math.abs(v) >= 1000 || (Math.abs(v) > 0 && Math.abs(v) < 0.01)) {
    return v.toPrecision(3);
  }
  return String(Math.round(v * 100) / 100);
}

function defaultFormatPercent(p: number): string {
  return `${Math.round(p * 100)}%`;
}

const ChartMarimekkoInner = (
  {
    columns,
    series,
    width = DEFAULT_CHART_MARIMEKKO_WIDTH,
    height = DEFAULT_CHART_MARIMEKKO_HEIGHT,
    padding = DEFAULT_CHART_MARIMEKKO_PADDING,
    cellGap = DEFAULT_CHART_MARIMEKKO_CELL_GAP,
    columnGap = DEFAULT_CHART_MARIMEKKO_COLUMN_GAP,
    labelMinArea = DEFAULT_CHART_MARIMEKKO_LABEL_MIN_AREA,
    hiddenSeries,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    showLegend = true,
    showTooltip = true,
    showPercentageLabels = true,
    showColumnLabels = true,
    showColumnTotals = false,
    animate = true,
    className,
    ariaLabel = 'Marimekko chart',
    ariaDescription,
    formatValue = defaultFormatValue,
    formatPercent = defaultFormatPercent,
    legendPlacement = 'bottom',
    onCellClick,
    onSeriesToggle,
    style,
  }: ChartMarimekkoProps,
  ref: ForwardedRef<HTMLDivElement>
) => {
  const reactId = useId();
  const descriptionId = `chart-marimekko-desc-${reactId}`;
  const [internalHidden, setInternalHidden] = useState<Set<string>>(
    () => new Set(defaultHiddenSeries ?? [])
  );
  const hiddenSet = useMemo(
    () =>
      isControlled(hiddenSeries) ? new Set(hiddenSeries) : internalHidden,
    [hiddenSeries, internalHidden]
  );
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const innerW = Math.max(0, width - padding * 2);
  const innerH = Math.max(0, height - padding * 2);

  const layout = useMemo(
    () =>
      computeMarimekkoLayout({
        columns,
        series,
        hiddenSeries: hiddenSet,
        innerW,
        innerH,
        padX: padding,
        padY: padding,
        cellGap,
        columnGap,
      }),
    [columns, series, hiddenSet, innerW, innerH, padding, cellGap, columnGap]
  );

  const cellCount = useMemo(
    () => layout.reduce((acc, c) => acc + c.cells.length, 0),
    [layout]
  );

  const grandTotal = useMemo(() => {
    const hiddenIdx = new Set<number>();
    for (let i = 0; i < series.length; i++) {
      if (hiddenSet.has(series[i]!.id)) hiddenIdx.add(i);
    }
    return getMarimekkoGrandTotal(columns, hiddenIdx);
  }, [columns, series, hiddenSet]);

  const autoDescription = useMemo(
    () => describeMarimekkoChart(columns, series, hiddenSet, formatValue),
    [columns, series, hiddenSet, formatValue]
  );

  const toggleSeries = useCallback(
    (idx: number) => {
      const s = series[idx];
      if (!s) return;
      const next = new Set(hiddenSet);
      const willHide = !next.has(s.id);
      if (willHide) next.add(s.id);
      else next.delete(s.id);
      if (!isControlled(hiddenSeries)) setInternalHidden(next);
      onHiddenSeriesChange?.(Array.from(next));
      onSeriesToggle?.({ series: s, hidden: willHide });
    },
    [series, hiddenSet, hiddenSeries, onHiddenSeriesChange, onSeriesToggle]
  );

  const hovered = useMemo(() => {
    if (!hoveredKey) return null;
    for (const col of layout) {
      for (const cell of col.cells) {
        if (`${cell.columnId}::${cell.seriesId}` === hoveredKey) return cell;
      }
    }
    return null;
  }, [layout, hoveredKey]);

  const showRightLegend = showLegend && legendPlacement === 'right';
  const showBottomLegend = showLegend && legendPlacement === 'bottom';

  return (
    <div
      ref={ref}
      data-section="chart-marimekko"
      data-column-count={columns.length}
      data-series-count={series.length}
      data-visible-series-count={series.length - hiddenSet.size}
      data-cell-count={cellCount}
      data-grand-total={grandTotal}
      data-animate={animate ? 'true' : 'false'}
      className={[
        'chart-marimekko flex',
        showRightLegend ? 'flex-row items-start gap-4' : 'flex-col gap-2',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="region"
      aria-label={ariaLabel}
      style={style}
    >
      <div
        data-section="chart-marimekko-canvas"
        className="relative inline-block"
        style={{ width, height }}
      >
        <span
          id={descriptionId}
          data-section="chart-marimekko-aria-desc"
          className="sr-only"
        >
          {ariaDescription ?? autoDescription}
        </span>
        <svg
          data-section="chart-marimekko-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={ariaLabel}
          aria-describedby={descriptionId}
          style={{ display: 'block' }}
        >
          <g data-section="chart-marimekko-columns">
            {layout.map((col) => (
              <g
                key={col.id}
                data-section="chart-marimekko-column"
                data-column-id={col.id}
                data-column-index={col.index}
                data-column-total={col.total}
                data-column-share={col.share}
                data-column-width={col.width}
              >
                {col.cells.map((cell) => {
                  const key = `${cell.columnId}::${cell.seriesId}`;
                  const isHovered = hoveredKey === key;
                  const area = cell.width * cell.height;
                  const showLabel =
                    showPercentageLabels && area >= labelMinArea;
                  return (
                    <g
                      key={key}
                      data-section="chart-marimekko-cell"
                      data-column-id={cell.columnId}
                      data-series-id={cell.seriesId}
                      data-series-index={cell.seriesIndex}
                      data-cell-value={cell.value}
                      data-cell-color={cell.color}
                      data-cell-share={cell.cellShare}
                      data-column-share={cell.columnShare}
                      data-overall-share={cell.overallShare}
                      data-hovered={isHovered ? 'true' : 'false'}
                      className={
                        animate ? 'motion-safe:animate-fade-in' : undefined
                      }
                      onMouseEnter={() => setHoveredKey(key)}
                      onMouseLeave={() =>
                        setHoveredKey((cur) => (cur === key ? null : cur))
                      }
                      onFocus={() => setHoveredKey(key)}
                      onBlur={() =>
                        setHoveredKey((cur) => (cur === key ? null : cur))
                      }
                      onClick={() => onCellClick?.({ cell })}
                    >
                      <rect
                        data-section="chart-marimekko-rect"
                        x={cell.x}
                        y={cell.y}
                        width={cell.width}
                        height={cell.height}
                        fill={cell.color}
                        fillOpacity={0.85}
                        stroke={cell.color}
                        strokeWidth={1}
                        role="graphics-symbol"
                        tabIndex={0}
                        aria-label={`${cell.columnLabel} / ${cell.seriesLabel}: ${formatValue(
                          cell.value
                        )} (${formatPercent(cell.cellShare)} of column)`}
                      />
                      {showLabel && (
                        <text
                          data-section="chart-marimekko-cell-label"
                          x={cell.x + cell.width / 2}
                          y={cell.y + cell.height / 2 + 4}
                          textAnchor="middle"
                          fontSize={11}
                          fontWeight={500}
                          fill="rgb(255 255 255)"
                          pointerEvents="none"
                        >
                          {formatPercent(cell.cellShare)}
                        </text>
                      )}
                    </g>
                  );
                })}
                {showColumnLabels && col.width > 0 && (
                  <text
                    data-section="chart-marimekko-column-label"
                    data-column-id={col.id}
                    x={col.x + col.width / 2}
                    y={padding + innerH + 14}
                    textAnchor="middle"
                    fontSize={10}
                    fill="rgb(71 85 105)"
                  >
                    {col.label}
                  </text>
                )}
                {showColumnTotals && col.width > 0 && (
                  <text
                    data-section="chart-marimekko-column-total"
                    data-column-id={col.id}
                    x={col.x + col.width / 2}
                    y={padding - 6}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight={500}
                    fill="rgb(51 65 85)"
                  >
                    {formatValue(col.total)}
                  </text>
                )}
              </g>
            ))}
          </g>
        </svg>
        {showTooltip && hovered && (
          <div
            data-section="chart-marimekko-tooltip"
            className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs shadow"
          >
            <div
              data-section="chart-marimekko-tooltip-label"
              className="font-semibold"
            >
              {hovered.columnLabel} / {hovered.seriesLabel}
            </div>
            <div
              data-section="chart-marimekko-tooltip-value"
              className="font-mono text-slate-700"
            >
              {formatValue(hovered.value)}
            </div>
            <div
              data-section="chart-marimekko-tooltip-column"
              className="font-mono text-slate-500"
            >
              column: {formatPercent(hovered.cellShare)}
            </div>
            <div
              data-section="chart-marimekko-tooltip-overall"
              className="font-mono text-slate-500"
            >
              overall: {formatPercent(hovered.overallShare)}
            </div>
          </div>
        )}
      </div>
      {showBottomLegend && (
        <ul
          data-section="chart-marimekko-legend"
          data-placement="bottom"
          className="flex flex-wrap gap-2 text-xs"
        >
          {series.map((s, idx) => {
            const color = s.color ?? getMarimekkoDefaultColor(idx);
            const isHidden = hiddenSet.has(s.id);
            return (
              <li
                key={s.id}
                data-section="chart-marimekko-legend-item"
                data-series-id={s.id}
                data-series-hidden={isHidden ? 'true' : 'false'}
              >
                <button
                  type="button"
                  data-section="chart-marimekko-legend-button"
                  aria-pressed={!isHidden}
                  aria-label={`Toggle ${s.label}`}
                  className={[
                    'flex items-center gap-1 rounded px-1 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-slate-400',
                    isHidden ? 'opacity-40' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => toggleSeries(idx)}
                >
                  <span
                    data-section="chart-marimekko-legend-swatch"
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: color }}
                  />
                  <span
                    data-section="chart-marimekko-legend-label"
                    className="text-slate-700"
                  >
                    {s.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {showRightLegend && (
        <ul
          data-section="chart-marimekko-legend"
          data-placement="right"
          className="flex flex-col gap-1 text-xs"
        >
          {series.map((s, idx) => {
            const color = s.color ?? getMarimekkoDefaultColor(idx);
            const isHidden = hiddenSet.has(s.id);
            return (
              <li
                key={s.id}
                data-section="chart-marimekko-legend-item"
                data-series-id={s.id}
                data-series-hidden={isHidden ? 'true' : 'false'}
              >
                <button
                  type="button"
                  data-section="chart-marimekko-legend-button"
                  aria-pressed={!isHidden}
                  aria-label={`Toggle ${s.label}`}
                  className={[
                    'flex items-center gap-1 rounded px-1 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-slate-400',
                    isHidden ? 'opacity-40' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => toggleSeries(idx)}
                >
                  <span
                    data-section="chart-marimekko-legend-swatch"
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: color }}
                  />
                  <span
                    data-section="chart-marimekko-legend-label"
                    className="text-slate-700"
                  >
                    {s.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export const ChartMarimekko = forwardRef<HTMLDivElement, ChartMarimekkoProps>(
  ChartMarimekkoInner
);
ChartMarimekko.displayName = 'ChartMarimekko';

// Re-export helper for testers
export { clamp01 as marimekkoClamp01 };
