import {
  forwardRef,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_TREEMAP_SQUARIFIED_WIDTH = 560;
export const DEFAULT_CHART_TREEMAP_SQUARIFIED_HEIGHT = 360;
export const DEFAULT_CHART_TREEMAP_SQUARIFIED_PADDING = 24;
export const DEFAULT_CHART_TREEMAP_SQUARIFIED_CELL_GAP = 2;
export const DEFAULT_CHART_TREEMAP_SQUARIFIED_LABEL_MIN_AREA = 360;
export const DEFAULT_CHART_TREEMAP_SQUARIFIED_FILL_OPACITY = 0.85;
export const DEFAULT_CHART_TREEMAP_SQUARIFIED_PALETTE = [
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

export interface ChartTreemapSquarifiedItem {
  id: string;
  label: string;
  value: number;
  color?: string;
}

export interface ChartTreemapSquarifiedLayoutCell {
  id: string;
  label: string;
  index: number;
  value: number;
  share: number;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
  aspectRatio: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function getTreemapSquarifiedDefaultColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    return DEFAULT_CHART_TREEMAP_SQUARIFIED_PALETTE[0]!;
  }
  return DEFAULT_CHART_TREEMAP_SQUARIFIED_PALETTE[
    Math.floor(index) % DEFAULT_CHART_TREEMAP_SQUARIFIED_PALETTE.length
  ]!;
}

export function sortTreemapSquarifiedDesc(
  items: readonly ChartTreemapSquarifiedItem[]
): { item: ChartTreemapSquarifiedItem; originalIndex: number }[] {
  const out: { item: ChartTreemapSquarifiedItem; originalIndex: number }[] = [];
  for (let i = 0; i < items.length; i++) {
    const v = items[i]!.value;
    if (!isFiniteNumber(v) || v <= 0) continue;
    out.push({ item: items[i]!, originalIndex: i });
  }
  out.sort((a, b) => b.item.value - a.item.value);
  return out;
}

export function getTreemapSquarifiedTotal(
  items: readonly ChartTreemapSquarifiedItem[]
): number {
  let total = 0;
  for (const item of items) {
    if (isFiniteNumber(item.value) && item.value > 0) total += item.value;
  }
  return total;
}

interface NormalizedItem {
  id: string;
  label: string;
  originalIndex: number;
  value: number;
  share: number;
  normalizedArea: number;
  color: string;
}

function buildNormalized(
  items: readonly ChartTreemapSquarifiedItem[],
  innerW: number,
  innerH: number
): NormalizedItem[] {
  const total = getTreemapSquarifiedTotal(items);
  if (total <= 0 || innerW <= 0 || innerH <= 0) return [];
  const sorted = sortTreemapSquarifiedDesc(items);
  const totalArea = innerW * innerH;
  return sorted.map((entry) => {
    const share = entry.item.value / total;
    return {
      id: entry.item.id,
      label: entry.item.label,
      originalIndex: entry.originalIndex,
      value: entry.item.value,
      share,
      normalizedArea: share * totalArea,
      color:
        entry.item.color ?? getTreemapSquarifiedDefaultColor(entry.originalIndex),
    };
  });
}

function worstAspectRatio(row: NormalizedItem[], shortSide: number): number {
  if (!row.length || shortSide <= 0) return Number.POSITIVE_INFINITY;
  let sum = 0;
  let max = 0;
  let min = Number.POSITIVE_INFINITY;
  for (const r of row) {
    sum += r.normalizedArea;
    if (r.normalizedArea > max) max = r.normalizedArea;
    if (r.normalizedArea < min) min = r.normalizedArea;
  }
  if (sum <= 0) return Number.POSITIVE_INFINITY;
  const s2 = shortSide * shortSide;
  const s2sum = sum * sum;
  return Math.max(
    (s2 * max) / s2sum,
    s2sum / (s2 * min)
  );
}

interface FreeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function layoutRow(
  row: NormalizedItem[],
  freeRect: FreeRect,
  cellGap: number
): {
  cells: ChartTreemapSquarifiedLayoutCell[];
  remaining: FreeRect;
} {
  const cells: ChartTreemapSquarifiedLayoutCell[] = [];
  if (!row.length) {
    return { cells, remaining: freeRect };
  }
  const free = { ...freeRect };
  // row lays along the SHORT side; the row block extends along the LONG side.
  const isShortSideWidth = free.width <= free.height;
  let sum = 0;
  for (const r of row) sum += r.normalizedArea;
  if (sum <= 0) {
    return { cells, remaining: free };
  }
  if (isShortSideWidth) {
    // short side = width: row is a horizontal strip across the top.
    // every cell in the row shares a common height (rowHeight); widths sum to free.width
    const rowHeight = sum / free.width;
    let cursorX = free.x;
    for (let i = 0; i < row.length; i++) {
      const r = row[i]!;
      const cellWidth = r.normalizedArea / rowHeight;
      const halfGap = Math.min(cellGap, cellWidth / 2, rowHeight / 2) / 2;
      cells.push({
        id: r.id,
        label: r.label,
        index: r.originalIndex,
        value: r.value,
        share: r.share,
        color: r.color,
        x: cursorX + halfGap,
        y: free.y + halfGap,
        width: Math.max(0, cellWidth - halfGap * 2),
        height: Math.max(0, rowHeight - halfGap * 2),
        aspectRatio:
          cellWidth > 0 && rowHeight > 0
            ? Math.max(cellWidth / rowHeight, rowHeight / cellWidth)
            : Number.POSITIVE_INFINITY,
      });
      cursorX += cellWidth;
    }
    return {
      cells,
      remaining: {
        x: free.x,
        y: free.y + rowHeight,
        width: free.width,
        height: Math.max(0, free.height - rowHeight),
      },
    };
  }
  // short side = height: row is a vertical strip on the left.
  // every cell in the row shares a common width (rowWidth); heights sum to free.height
  const rowWidth = sum / free.height;
  let cursorY = free.y;
  for (let i = 0; i < row.length; i++) {
    const r = row[i]!;
    const cellHeight = r.normalizedArea / rowWidth;
    const halfGap = Math.min(cellGap, rowWidth / 2, cellHeight / 2) / 2;
    cells.push({
      id: r.id,
      label: r.label,
      index: r.originalIndex,
      value: r.value,
      share: r.share,
      color: r.color,
      x: free.x + halfGap,
      y: cursorY + halfGap,
      width: Math.max(0, rowWidth - halfGap * 2),
      height: Math.max(0, cellHeight - halfGap * 2),
      aspectRatio:
        rowWidth > 0 && cellHeight > 0
          ? Math.max(rowWidth / cellHeight, cellHeight / rowWidth)
          : Number.POSITIVE_INFINITY,
    });
    cursorY += cellHeight;
  }
  return {
    cells,
    remaining: {
      x: free.x + rowWidth,
      y: free.y,
      width: Math.max(0, free.width - rowWidth),
      height: free.height,
    },
  };
}

export interface ComputeTreemapSquarifiedLayoutInput {
  items: readonly ChartTreemapSquarifiedItem[];
  innerW: number;
  innerH: number;
  padX: number;
  padY: number;
  cellGap: number;
}

export function computeTreemapSquarifiedLayout(
  input: ComputeTreemapSquarifiedLayoutInput
): ChartTreemapSquarifiedLayoutCell[] {
  const { items, innerW, innerH, padX, padY, cellGap } = input;
  if (innerW <= 0 || innerH <= 0 || !items.length) return [];
  const normalized = buildNormalized(items, innerW, innerH);
  if (!normalized.length) return [];
  let free: FreeRect = {
    x: padX,
    y: padY,
    width: innerW,
    height: innerH,
  };
  const cells: ChartTreemapSquarifiedLayoutCell[] = [];
  let currentRow: NormalizedItem[] = [];
  let i = 0;
  while (i < normalized.length) {
    const shortSide = Math.min(free.width, free.height);
    if (shortSide <= 0) break;
    const candidate = normalized[i]!;
    const nextRow = [...currentRow, candidate];
    const currentWorst = worstAspectRatio(currentRow, shortSide);
    const nextWorst = worstAspectRatio(nextRow, shortSide);
    if (currentRow.length === 0 || nextWorst <= currentWorst) {
      currentRow = nextRow;
      i++;
    } else {
      const result = layoutRow(currentRow, free, cellGap);
      cells.push(...result.cells);
      free = result.remaining;
      currentRow = [];
    }
  }
  if (currentRow.length) {
    const result = layoutRow(currentRow, free, cellGap);
    cells.push(...result.cells);
  }
  return cells;
}

export function describeTreemapSquarifiedChart(
  items: readonly ChartTreemapSquarifiedItem[],
  formatValue?: (v: number) => string
): string {
  const total = getTreemapSquarifiedTotal(items);
  if (!items.length || total <= 0) return 'No data';
  const fmt = formatValue ?? ((n: number) => String(n));
  const sorted = sortTreemapSquarifiedDesc(items);
  if (!sorted.length) return 'No data';
  const top = sorted[0]!.item;
  return `Squarified treemap with ${sorted.length} cells, total ${fmt(total)}. Largest cell ${top.label} ${fmt(top.value)}.`;
}

export interface ChartTreemapSquarifiedProps {
  items: readonly ChartTreemapSquarifiedItem[];
  width?: number;
  height?: number;
  padding?: number;
  cellGap?: number;
  labelMinArea?: number;
  fillOpacity?: number;
  showLegend?: boolean;
  showTooltip?: boolean;
  showLabels?: boolean;
  showValues?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (v: number) => string;
  formatPercent?: (p: number) => string;
  legendPlacement?: 'right' | 'bottom';
  onCellClick?: (args: {
    item: ChartTreemapSquarifiedItem;
    layout: ChartTreemapSquarifiedLayoutCell;
  }) => void;
  style?: CSSProperties;
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

const ChartTreemapSquarifiedInner = (
  {
    items,
    width = DEFAULT_CHART_TREEMAP_SQUARIFIED_WIDTH,
    height = DEFAULT_CHART_TREEMAP_SQUARIFIED_HEIGHT,
    padding = DEFAULT_CHART_TREEMAP_SQUARIFIED_PADDING,
    cellGap = DEFAULT_CHART_TREEMAP_SQUARIFIED_CELL_GAP,
    labelMinArea = DEFAULT_CHART_TREEMAP_SQUARIFIED_LABEL_MIN_AREA,
    fillOpacity = DEFAULT_CHART_TREEMAP_SQUARIFIED_FILL_OPACITY,
    showLegend = false,
    showTooltip = true,
    showLabels = true,
    showValues = true,
    animate = true,
    className,
    ariaLabel = 'Squarified treemap',
    ariaDescription,
    formatValue = defaultFormatValue,
    formatPercent = defaultFormatPercent,
    legendPlacement = 'bottom',
    onCellClick,
    style,
  }: ChartTreemapSquarifiedProps,
  ref: ForwardedRef<HTMLDivElement>
) => {
  const reactId = useId();
  const descriptionId = `chart-treemap-squarified-desc-${reactId}`;
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const innerW = Math.max(0, width - padding * 2);
  const innerH = Math.max(0, height - padding * 2);

  const layout = useMemo(
    () =>
      computeTreemapSquarifiedLayout({
        items,
        innerW,
        innerH,
        padX: padding,
        padY: padding,
        cellGap,
      }),
    [items, innerW, innerH, padding, cellGap]
  );

  const total = useMemo(() => getTreemapSquarifiedTotal(items), [items]);

  const autoDescription = useMemo(
    () => describeTreemapSquarifiedChart(items, formatValue),
    [items, formatValue]
  );

  const hovered = useMemo(
    () => layout.find((c) => c.id === hoveredId) ?? null,
    [layout, hoveredId]
  );

  const worstAR = useMemo(() => {
    let max = 0;
    for (const cell of layout) {
      if (cell.aspectRatio > max && Number.isFinite(cell.aspectRatio)) {
        max = cell.aspectRatio;
      }
    }
    return max;
  }, [layout]);

  const showRightLegend = showLegend && legendPlacement === 'right';
  const showBottomLegend = showLegend && legendPlacement === 'bottom';

  return (
    <div
      ref={ref}
      data-section="chart-treemap-squarified"
      data-item-count={items.length}
      data-cell-count={layout.length}
      data-total={total}
      data-worst-aspect-ratio={worstAR > 0 ? worstAR.toFixed(2) : '0'}
      data-animate={animate ? 'true' : 'false'}
      className={[
        'chart-treemap-squarified flex',
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
        data-section="chart-treemap-squarified-canvas"
        className="relative inline-block"
        style={{ width, height }}
      >
        <span
          id={descriptionId}
          data-section="chart-treemap-squarified-aria-desc"
          className="sr-only"
        >
          {ariaDescription ?? autoDescription}
        </span>
        <svg
          data-section="chart-treemap-squarified-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={ariaLabel}
          aria-describedby={descriptionId}
          style={{ display: 'block' }}
        >
          <g data-section="chart-treemap-squarified-cells">
            {layout.map((cell) => {
              const isHovered = hoveredId === cell.id;
              const area = cell.width * cell.height;
              const showLabel =
                showLabels && cell.width > 32 && cell.height > 14 && area >= labelMinArea;
              const showValue =
                showValues && cell.width > 32 && cell.height > 28 && area >= labelMinArea;
              return (
                <g
                  key={cell.id}
                  data-section="chart-treemap-squarified-cell"
                  data-cell-id={cell.id}
                  data-cell-index={cell.index}
                  data-cell-value={cell.value}
                  data-cell-share={cell.share}
                  data-cell-color={cell.color}
                  data-cell-aspect-ratio={cell.aspectRatio.toFixed(2)}
                  data-hovered={isHovered ? 'true' : 'false'}
                  className={
                    animate ? 'motion-safe:animate-fade-in' : undefined
                  }
                  onMouseEnter={() => setHoveredId(cell.id)}
                  onMouseLeave={() =>
                    setHoveredId((cur) => (cur === cell.id ? null : cur))
                  }
                  onFocus={() => setHoveredId(cell.id)}
                  onBlur={() =>
                    setHoveredId((cur) => (cur === cell.id ? null : cur))
                  }
                  onClick={() => {
                    const orig = items[cell.index];
                    if (orig) onCellClick?.({ item: orig, layout: cell });
                  }}
                >
                  <rect
                    data-section="chart-treemap-squarified-rect"
                    x={cell.x}
                    y={cell.y}
                    width={cell.width}
                    height={cell.height}
                    fill={cell.color}
                    fillOpacity={fillOpacity}
                    stroke={cell.color}
                    strokeWidth={1}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${cell.label}: ${formatValue(cell.value)} (${formatPercent(cell.share)})`}
                  />
                  {showLabel && (
                    <text
                      data-section="chart-treemap-squarified-label"
                      x={cell.x + 6}
                      y={cell.y + 14}
                      fontSize={11}
                      fontWeight={500}
                      fill="rgb(255 255 255)"
                      pointerEvents="none"
                    >
                      {cell.label}
                    </text>
                  )}
                  {showValue && (
                    <text
                      data-section="chart-treemap-squarified-value"
                      x={cell.x + 6}
                      y={cell.y + 28}
                      fontSize={10}
                      fill="rgb(255 255 255)"
                      pointerEvents="none"
                    >
                      {formatValue(cell.value)}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
        {showTooltip && hovered && (
          <div
            data-section="chart-treemap-squarified-tooltip"
            className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs shadow"
          >
            <div
              data-section="chart-treemap-squarified-tooltip-label"
              className="font-semibold"
            >
              {hovered.label}
            </div>
            <div
              data-section="chart-treemap-squarified-tooltip-value"
              className="font-mono text-slate-700"
            >
              {formatValue(hovered.value)}
            </div>
            <div
              data-section="chart-treemap-squarified-tooltip-share"
              className="font-mono text-slate-500"
            >
              share: {formatPercent(hovered.share)}
            </div>
            <div
              data-section="chart-treemap-squarified-tooltip-aspect"
              className="font-mono text-slate-500"
            >
              aspect: {hovered.aspectRatio.toFixed(2)}
            </div>
          </div>
        )}
      </div>
      {(showBottomLegend || showRightLegend) && (
        <ul
          data-section="chart-treemap-squarified-legend"
          data-placement={showRightLegend ? 'right' : 'bottom'}
          className={
            showRightLegend
              ? 'flex flex-col gap-1 text-xs'
              : 'flex flex-wrap gap-2 text-xs'
          }
        >
          {items.map((item, idx) => {
            const color = item.color ?? getTreemapSquarifiedDefaultColor(idx);
            return (
              <li
                key={item.id}
                data-section="chart-treemap-squarified-legend-item"
                data-cell-id={item.id}
              >
                <div
                  data-section="chart-treemap-squarified-legend-row"
                  className="flex items-center gap-1"
                >
                  <span
                    data-section="chart-treemap-squarified-legend-swatch"
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: color }}
                  />
                  <span
                    data-section="chart-treemap-squarified-legend-label"
                    className="text-slate-700"
                  >
                    {item.label}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export const ChartTreemapSquarified = forwardRef<
  HTMLDivElement,
  ChartTreemapSquarifiedProps
>(ChartTreemapSquarifiedInner);
ChartTreemapSquarified.displayName = 'ChartTreemapSquarified';
