import {
  forwardRef,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  ForwardedRef,
  MouseEvent as ReactMouseEvent,
} from 'react';
import { cn } from '../../lib/cn';

// (v1.11.479, TODO 11.461) ChartParallel primitive.
//
// Pure-SVG parallel coordinates plot. Each `dimension`
// becomes a vertical axis; each row becomes a polyline
// crossing every axis at the data value for that
// dimension. Drag on an axis to brush a y-range -- rows
// whose values fall within every active brush stay
// visible; the rest fade out. Hovering a row highlights
// it and dims the others. Brushes are controllable via
// `brushes` + `onBrushesChange` for host-driven filter
// state.
//
// Reference: /root/c4/arps-design-system-v1/.

export interface ChartParallelDimension {
  id: string;
  label: string;
  min?: number;
  max?: number;
  format?: (v: number) => string;
}

export interface ChartParallelRow {
  id: string;
  label?: string;
  values: Record<string, number>;
  color?: string;
  category?: string;
}

export interface ChartParallelBrush {
  dimensionId: string;
  min: number;
  max: number;
}

export interface ChartParallelProps {
  dimensions: readonly ChartParallelDimension[];
  rows: readonly ChartParallelRow[];
  width?: number;
  height?: number;
  padding?: number;
  brushes?: readonly ChartParallelBrush[];
  defaultBrushes?: readonly ChartParallelBrush[];
  onBrushesChange?: (brushes: ChartParallelBrush[]) => void;
  showAxisLabels?: boolean;
  showAxisTicks?: boolean;
  showTooltip?: boolean;
  highlightOnHover?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  defaultLineColor?: string;
  lineOpacity?: number;
  strokeWidth?: number;
  tickCount?: number;
  onRowClick?: (args: {
    row: ChartParallelRow;
    index: number;
  }) => void;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export const DEFAULT_CHART_PARALLEL_WIDTH = 640;
export const DEFAULT_CHART_PARALLEL_HEIGHT = 320;
export const DEFAULT_CHART_PARALLEL_PADDING = 36;
export const DEFAULT_CHART_PARALLEL_TICK_COUNT = 5;
export const DEFAULT_CHART_PARALLEL_LINE_OPACITY = 0.45;
export const DEFAULT_CHART_PARALLEL_STROKE_WIDTH = 1.2;
export const DEFAULT_CHART_PARALLEL_LINE_COLOR = '#2563eb';

// Compute the (min, max) bounds for a single dimension.
// Uses explicit dimension.min / dimension.max when
// supplied; otherwise scans the row values. Falls back to
// (0, 1) when no finite value is found.
export function getParallelDimensionBounds(
  dim: ChartParallelDimension,
  rows: readonly ChartParallelRow[],
): { min: number; max: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const r of rows) {
    const v = r.values[dim.id];
    if (typeof v === 'number' && Number.isFinite(v)) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (dim.min !== undefined && Number.isFinite(dim.min)) min = dim.min;
  if (dim.max !== undefined && Number.isFinite(dim.max)) max = dim.max;
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: 0, max: 1 };
  }
  if (min === max) return { min: min - 0.5, max: max + 0.5 };
  return { min, max };
}

// Test whether a row passes every active brush. Brushes
// are AND-combined; rows with non-finite values for any
// brushed dimension fail by default.
export function isRowInBrushes(
  row: ChartParallelRow,
  brushes: readonly ChartParallelBrush[],
): boolean {
  for (const b of brushes) {
    const v = row.values[b.dimensionId];
    if (!Number.isFinite(v)) return false;
    if ((v as number) < b.min || (v as number) > b.max) return false;
  }
  return true;
}

// Apply every brush against the row set and return only
// the rows that pass.
export function applyBrushFilter(
  rows: readonly ChartParallelRow[],
  brushes: readonly ChartParallelBrush[],
): ChartParallelRow[] {
  if (brushes.length === 0) return [...rows];
  return rows.filter((r) => isRowInBrushes(r, brushes));
}

// Build the SVG path for one row by stitching together
// projected (x, y) points for every dimension. Rows that
// miss a dimension value snap to that axis's centre so the
// polyline stays continuous.
export interface ParallelXY {
  x: number;
  y: number;
}

export function buildParallelRowPath(
  points: readonly ParallelXY[],
): string {
  if (points.length === 0) return '';
  const out: string[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    out.push(
      `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`,
    );
  }
  return out.join(' ');
}

// Evenly-spaced numeric ticks across [min, max].
export function getParallelTicks(
  min: number,
  max: number,
  count: number = DEFAULT_CHART_PARALLEL_TICK_COUNT,
): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0];
  if (max <= min) return [min];
  const safeCount = Math.max(2, Math.floor(count));
  const step = (max - min) / (safeCount - 1);
  const out: number[] = [];
  for (let i = 0; i < safeCount; i += 1) out.push(min + i * step);
  return out;
}

// One-line ARIA summary.
export function describeParallelChart(
  dimensions: readonly ChartParallelDimension[],
  rows: readonly ChartParallelRow[],
  brushes: readonly ChartParallelBrush[] = [],
): string {
  if (dimensions.length === 0 || rows.length === 0) return 'No data';
  const filtered = applyBrushFilter(rows, brushes);
  return `Parallel coordinates plot with ${dimensions.length} dimensions and ${rows.length} rows${brushes.length > 0 ? ` (${filtered.length} after brush)` : ''}.`;
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export const ChartParallel = forwardRef(function ChartParallel(
  {
    dimensions,
    rows,
    width = DEFAULT_CHART_PARALLEL_WIDTH,
    height = DEFAULT_CHART_PARALLEL_HEIGHT,
    padding = DEFAULT_CHART_PARALLEL_PADDING,
    brushes,
    defaultBrushes,
    onBrushesChange,
    showAxisLabels = true,
    showAxisTicks = true,
    showTooltip = true,
    highlightOnHover = true,
    animate = true,
    className,
    ariaLabel = 'Parallel coordinates plot',
    ariaDescription,
    defaultLineColor = DEFAULT_CHART_PARALLEL_LINE_COLOR,
    lineOpacity = DEFAULT_CHART_PARALLEL_LINE_OPACITY,
    strokeWidth = DEFAULT_CHART_PARALLEL_STROKE_WIDTH,
    tickCount = DEFAULT_CHART_PARALLEL_TICK_COUNT,
    onRowClick,
  }: ChartParallelProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const [internalBrushes, setInternalBrushes] = useState<
    ChartParallelBrush[]
  >(() =>
    defaultBrushes ? [...defaultBrushes] : [],
  );
  const activeBrushes = brushes ?? internalBrushes;

  const innerWidth = Math.max(0, width - padding * 2);
  const innerHeight = Math.max(
    0,
    height - padding - (showAxisLabels ? 22 : 0) - 4,
  );

  const dimCount = dimensions.length;
  const xFor = useCallback(
    (idx: number) => {
      if (dimCount === 0) return padding;
      if (dimCount === 1) return padding + innerWidth / 2;
      const step = innerWidth / (dimCount - 1);
      return padding + idx * step;
    },
    [dimCount, innerWidth, padding],
  );

  const dimBounds = useMemo(
    () => dimensions.map((d) => getParallelDimensionBounds(d, rows)),
    [dimensions, rows],
  );

  const yForDimension = useCallback(
    (dimIdx: number, value: number) => {
      const b = dimBounds[dimIdx];
      if (!b) return padding + innerHeight;
      const span = b.max - b.min;
      if (span <= 0) return padding + innerHeight;
      if (!Number.isFinite(value)) return padding + innerHeight / 2;
      const ratio = (value - b.min) / span;
      const clamped = Math.max(0, Math.min(1, ratio));
      return padding + innerHeight - innerHeight * clamped;
    },
    [dimBounds, innerHeight, padding],
  );

  // Pre-compute row points + path + brush-pass flag.
  const rowGeoms = useMemo(() => {
    return rows.map((row) => {
      const pts: ParallelXY[] = [];
      for (let i = 0; i < dimensions.length; i += 1) {
        const dim = dimensions[i]!;
        const v = row.values[dim.id];
        const x = xFor(i);
        const y = yForDimension(
          i,
          typeof v === 'number' ? v : Number.NaN,
        );
        pts.push({ x, y });
      }
      const path = buildParallelRowPath(pts);
      const passes = isRowInBrushes(row, activeBrushes);
      return { row, pts, path, passes };
    });
  }, [
    activeBrushes,
    dimensions,
    rows,
    xFor,
    yForDimension,
  ]);

  const description = useMemo(
    () =>
      ariaDescription ??
      describeParallelChart(dimensions, rows, activeBrushes),
    [activeBrushes, ariaDescription, dimensions, rows],
  );

  const [hovered, setHovered] = useState<number | null>(null);
  const handleEnter = useCallback((idx: number) => {
    setHovered(idx);
  }, []);
  const handleLeave = useCallback(() => {
    setHovered(null);
  }, []);

  // Brush drag state
  const brushDragRef = useRef<{
    dimensionIdx: number;
    startY: number;
    currentY: number;
  } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const yToValue = useCallback(
    (dimIdx: number, y: number) => {
      const b = dimBounds[dimIdx];
      if (!b) return 0;
      const span = b.max - b.min;
      if (span <= 0) return b.min;
      const ratio =
        (padding + innerHeight - y) / innerHeight;
      const clamped = Math.max(0, Math.min(1, ratio));
      return b.min + clamped * span;
    },
    [dimBounds, innerHeight, padding],
  );

  const commitBrushes = useCallback(
    (next: ChartParallelBrush[]) => {
      if (brushes === undefined) setInternalBrushes(next);
      onBrushesChange?.(next);
    },
    [brushes, onBrushesChange],
  );

  const handleAxisMouseDown = useCallback(
    (dimIdx: number, e: ReactMouseEvent<SVGElement>) => {
      e.stopPropagation();
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const localY =
        ((e.clientY - rect.top) / rect.height) * height;
      brushDragRef.current = {
        dimensionIdx: dimIdx,
        startY: localY,
        currentY: localY,
      };
    },
    [height],
  );

  const handleSvgMouseMove = useCallback(
    (e: ReactMouseEvent<SVGSVGElement>) => {
      if (!brushDragRef.current) return;
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const localY =
        ((e.clientY - rect.top) / rect.height) * height;
      brushDragRef.current.currentY = localY;
      const dimIdx = brushDragRef.current.dimensionIdx;
      const y1 = Math.min(
        brushDragRef.current.startY,
        localY,
      );
      const y2 = Math.max(
        brushDragRef.current.startY,
        localY,
      );
      const dim = dimensions[dimIdx];
      if (!dim) return;
      const top = yToValue(dimIdx, y1);
      const bot = yToValue(dimIdx, y2);
      const next = activeBrushes.filter(
        (b) => b.dimensionId !== dim.id,
      );
      next.push({
        dimensionId: dim.id,
        min: Math.min(top, bot),
        max: Math.max(top, bot),
      });
      commitBrushes(next);
    },
    [activeBrushes, commitBrushes, dimensions, height, yToValue],
  );

  const handleSvgMouseUp = useCallback(() => {
    brushDragRef.current = null;
  }, []);

  const clearBrushForDimension = useCallback(
    (dimensionId: string) => {
      const next = activeBrushes.filter(
        (b) => b.dimensionId !== dimensionId,
      );
      commitBrushes(next);
    },
    [activeBrushes, commitBrushes],
  );

  const hoveredRow = hovered !== null ? rows[hovered] : null;
  const hoveredGeom = hovered !== null ? rowGeoms[hovered] : null;

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      data-section="chart-parallel"
      data-dimension-count={dimensions.length}
      data-row-count={rows.length}
      data-brush-count={activeBrushes.length}
      data-filtered-count={
        rowGeoms.filter((g) => g.passes).length
      }
      data-animate={animate ? 'true' : 'false'}
      className={cn(
        'relative inline-block w-full max-w-full',
        className,
      )}
      style={{ width }}
    >
      <span
        data-section="chart-parallel-aria-desc"
        className="sr-only"
      >
        {description}
      </span>
      <svg
        ref={svgRef}
        role="img"
        aria-label={ariaLabel}
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        data-section="chart-parallel-svg"
        className="h-auto w-full"
        onMouseMove={handleSvgMouseMove}
        onMouseUp={handleSvgMouseUp}
        onMouseLeave={handleSvgMouseUp}
      >
        {/* Rows */}
        {rowGeoms.map((geom, i) => {
          const isHovered = hovered === i;
          const isFiltered = !geom.passes;
          const color =
            geom.row.color ?? defaultLineColor;
          const baseOp = isFiltered ? 0.08 : lineOpacity;
          const op =
            highlightOnHover && hovered !== null
              ? isHovered
                ? 0.95
                : Math.min(baseOp, 0.18)
              : baseOp;
          return (
            <g
              key={geom.row.id}
              data-section="chart-parallel-row"
              data-row-id={geom.row.id}
              data-row-index={i}
              data-row-passes={geom.passes ? 'true' : 'false'}
              data-row-category={geom.row.category ?? ''}
              data-hovered={isHovered ? 'true' : 'false'}
              className={cn(
                animate && 'motion-safe:animate-fade-in',
              )}
            >
              {geom.path ? (
                <path
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={
                    geom.row.label ?? geom.row.id
                  }
                  data-section="chart-parallel-line"
                  data-row-id={geom.row.id}
                  d={geom.path}
                  fill="none"
                  stroke={color}
                  strokeOpacity={op}
                  strokeWidth={
                    isHovered ? strokeWidth + 1 : strokeWidth
                  }
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  onMouseEnter={() => handleEnter(i)}
                  onMouseLeave={handleLeave}
                  onFocus={() => handleEnter(i)}
                  onBlur={handleLeave}
                  onClick={
                    onRowClick
                      ? () =>
                          onRowClick({
                            row: geom.row,
                            index: i,
                          })
                      : undefined
                  }
                  style={{
                    cursor: onRowClick
                      ? 'pointer'
                      : 'default',
                  }}
                />
              ) : null}
            </g>
          );
        })}
        {/* Axes */}
        {dimensions.map((dim, i) => {
          const x = xFor(i);
          const bounds = dimBounds[i]!;
          const brush = activeBrushes.find(
            (b) => b.dimensionId === dim.id,
          );
          const ticks = getParallelTicks(
            bounds.min,
            bounds.max,
            tickCount,
          );
          return (
            <g
              key={`axis-${dim.id}`}
              data-section="chart-parallel-axis"
              data-dimension-id={dim.id}
              data-dimension-index={i}
              data-axis-min={bounds.min}
              data-axis-max={bounds.max}
              data-has-brush={brush ? 'true' : 'false'}
            >
              <rect
                aria-hidden="true"
                data-section="chart-parallel-axis-hit"
                data-dimension-id={dim.id}
                x={x - 8}
                y={padding}
                width={16}
                height={innerHeight}
                fill="transparent"
                onMouseDown={(e) => handleAxisMouseDown(i, e)}
                onDoubleClick={() =>
                  clearBrushForDimension(dim.id)
                }
                style={{ cursor: 'ns-resize' }}
              />
              <line
                aria-hidden="true"
                data-section="chart-parallel-axis-line"
                x1={x}
                y1={padding}
                x2={x}
                y2={padding + innerHeight}
                stroke="currentColor"
                strokeOpacity={0.3}
              />
              {showAxisTicks
                ? ticks.map((t, idx) => {
                    const y = yForDimension(i, t);
                    return (
                      <g
                        key={`tick-${dim.id}-${idx}`}
                        data-section="chart-parallel-axis-tick"
                        data-tick-value={t}
                      >
                        <line
                          aria-hidden="true"
                          x1={x - 3}
                          y1={y}
                          x2={x + 3}
                          y2={y}
                          stroke="currentColor"
                          strokeOpacity={0.35}
                        />
                        <text
                          aria-hidden="true"
                          data-section="chart-parallel-axis-tick-label"
                          x={x - 6}
                          y={y}
                          textAnchor="end"
                          alignmentBaseline="middle"
                          fontSize={9}
                          fill="currentColor"
                          fillOpacity={0.6}
                        >
                          {dim.format
                            ? dim.format(t)
                            : `${t.toFixed(1)}`}
                        </text>
                      </g>
                    );
                  })
                : null}
              {showAxisLabels ? (
                <text
                  aria-hidden="true"
                  data-section="chart-parallel-axis-label"
                  data-dimension-id={dim.id}
                  x={x}
                  y={padding + innerHeight + 14}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={500}
                  fill="currentColor"
                  fillOpacity={0.85}
                >
                  {dim.label}
                </text>
              ) : null}
              {brush ? (
                <rect
                  aria-hidden="true"
                  data-section="chart-parallel-brush"
                  data-dimension-id={dim.id}
                  data-brush-min={brush.min}
                  data-brush-max={brush.max}
                  x={x - 6}
                  y={yForDimension(i, brush.max)}
                  width={12}
                  height={Math.max(
                    1,
                    yForDimension(i, brush.min) -
                      yForDimension(i, brush.max),
                  )}
                  fill="#0f172a"
                  fillOpacity={0.18}
                  stroke="#0f172a"
                  strokeOpacity={0.45}
                />
              ) : null}
            </g>
          );
        })}
      </svg>
      {showTooltip && hoveredRow && hoveredGeom ? (
        <div
          role="tooltip"
          data-section="chart-parallel-tooltip"
          data-row-id={hoveredRow.id}
          style={{
            left: padding,
            top: padding,
          }}
          className="pointer-events-none absolute rounded border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow"
        >
          <div
            data-section="chart-parallel-tooltip-label"
            className="font-medium"
          >
            {hoveredRow.label ?? hoveredRow.id}
          </div>
          {dimensions.map((dim) => {
            const v = hoveredRow.values[dim.id];
            if (typeof v !== 'number') return null;
            return (
              <div
                key={`tt-${dim.id}`}
                data-section="chart-parallel-tooltip-row"
                data-dimension-id={dim.id}
                className="font-mono text-muted-foreground"
              >
                {dim.label}:{' '}
                {dim.format ? dim.format(v) : v}
              </div>
            );
          })}
          {!hoveredGeom.passes ? (
            <div
              data-section="chart-parallel-tooltip-filtered"
              className="text-muted-foreground"
            >
              filtered out
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});

ChartParallel.displayName = 'ChartParallel';
