import {
  forwardRef,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_CALENDAR_HEATMAP_CELL_SIZE = 12;
export const DEFAULT_CHART_CALENDAR_HEATMAP_CELL_GAP = 3;
export const DEFAULT_CHART_CALENDAR_HEATMAP_TOP_PAD = 18;
export const DEFAULT_CHART_CALENDAR_HEATMAP_LEFT_PAD = 28;
export const DEFAULT_CHART_CALENDAR_HEATMAP_RIGHT_PAD = 8;
export const DEFAULT_CHART_CALENDAR_HEATMAP_BOTTOM_PAD = 22;
export const DEFAULT_CHART_CALENDAR_HEATMAP_EMPTY_COLOR = '#e5e7eb';
export const DEFAULT_CHART_CALENDAR_HEATMAP_PALETTE = [
  '#bbf7d0',
  '#86efac',
  '#4ade80',
  '#22c55e',
  '#15803d',
];
export const DEFAULT_CHART_CALENDAR_HEATMAP_MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
export const DEFAULT_CHART_CALENDAR_HEATMAP_DOW_LABELS = [
  'Sun',
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
];

export type ChartCalendarHeatmapWeekStart = 0 | 1;

export interface ChartCalendarHeatmapValue {
  date: string;
  value: number;
}

export interface ChartCalendarHeatmapCell {
  date: string;
  value: number;
  color: string;
  level: number;
  col: number;
  row: number;
  x: number;
  y: number;
}

export interface ChartCalendarHeatmapWeek {
  weekIndex: number;
  startDate: string;
  cells: ChartCalendarHeatmapCell[];
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function pad2(n: number): string {
  const v = Math.floor(n);
  return v < 10 ? `0${v}` : String(v);
}

export function toISODate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export function parseISODate(s: string): Date | null {
  if (typeof s !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function getYearRange(year: number): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(year, 0, 1)),
    end: new Date(Date.UTC(year, 11, 31)),
  };
}

export function getCalendarHeatmapColor(
  value: number,
  max: number,
  palette: readonly string[] = DEFAULT_CHART_CALENDAR_HEATMAP_PALETTE,
  emptyColor: string = DEFAULT_CHART_CALENDAR_HEATMAP_EMPTY_COLOR
): { color: string; level: number } {
  if (!isFiniteNumber(value) || value <= 0) return { color: emptyColor, level: 0 };
  if (!palette.length) return { color: emptyColor, level: 0 };
  if (!isFiniteNumber(max) || max <= 0) {
    return { color: palette[palette.length - 1]!, level: palette.length };
  }
  const ratio = Math.max(0, Math.min(1, value / max));
  if (ratio <= 0) return { color: emptyColor, level: 0 };
  const stepCount = palette.length;
  let step = Math.ceil(ratio * stepCount);
  if (step < 1) step = 1;
  if (step > stepCount) step = stepCount;
  return { color: palette[step - 1]!, level: step };
}

export interface ComputeCalendarHeatmapInput {
  values: readonly ChartCalendarHeatmapValue[];
  startDate: string;
  endDate: string;
  weekStart?: ChartCalendarHeatmapWeekStart;
  cellSize?: number;
  cellGap?: number;
  topPad?: number;
  leftPad?: number;
  palette?: readonly string[];
  emptyColor?: string;
  maxValue?: number;
}

export interface ComputeCalendarHeatmapResult {
  weeks: ChartCalendarHeatmapWeek[];
  cells: ChartCalendarHeatmapCell[];
  monthLabels: { col: number; label: string; index: number }[];
  width: number;
  height: number;
  max: number;
  weekStart: ChartCalendarHeatmapWeekStart;
  cellSize: number;
  cellGap: number;
  topPad: number;
  leftPad: number;
}

function getDayOfWeekIndex(d: Date, weekStart: ChartCalendarHeatmapWeekStart): number {
  const dow = d.getUTCDay();
  if (weekStart === 0) return dow;
  return (dow + 6) % 7;
}

export function computeCalendarHeatmap(
  input: ComputeCalendarHeatmapInput
): ComputeCalendarHeatmapResult {
  const {
    values,
    startDate,
    endDate,
    weekStart = 0,
    cellSize = DEFAULT_CHART_CALENDAR_HEATMAP_CELL_SIZE,
    cellGap = DEFAULT_CHART_CALENDAR_HEATMAP_CELL_GAP,
    topPad = DEFAULT_CHART_CALENDAR_HEATMAP_TOP_PAD,
    leftPad = DEFAULT_CHART_CALENDAR_HEATMAP_LEFT_PAD,
    palette = DEFAULT_CHART_CALENDAR_HEATMAP_PALETTE,
    emptyColor = DEFAULT_CHART_CALENDAR_HEATMAP_EMPTY_COLOR,
    maxValue,
  } = input;

  const start = parseISODate(startDate);
  const end = parseISODate(endDate);
  if (!start || !end || start.getTime() > end.getTime()) {
    return {
      weeks: [],
      cells: [],
      monthLabels: [],
      width: leftPad,
      height: topPad,
      max: 0,
      weekStart,
      cellSize,
      cellGap,
      topPad,
      leftPad,
    };
  }

  const lookup = new Map<string, number>();
  let derivedMax = 0;
  for (const v of values) {
    if (typeof v.date !== 'string') continue;
    if (!isFiniteNumber(v.value)) continue;
    lookup.set(v.date, v.value);
    if (v.value > derivedMax) derivedMax = v.value;
  }
  const max =
    isFiniteNumber(maxValue) && maxValue > 0 ? maxValue : derivedMax;

  const startOffset = getDayOfWeekIndex(start, weekStart);
  const gridStart = addDays(start, -startOffset);

  const totalDays =
    Math.round((end.getTime() - gridStart.getTime()) / 86400000) + 1;
  const totalCols = Math.ceil(totalDays / 7);

  const cells: ChartCalendarHeatmapCell[] = [];
  const weeks: ChartCalendarHeatmapWeek[] = [];
  const seenMonthByCol = new Map<number, number>();
  const monthLabelByCol = new Map<number, { label: string; index: number }>();

  for (let col = 0; col < totalCols; col++) {
    const weekCells: ChartCalendarHeatmapCell[] = [];
    const weekStartDate = addDays(gridStart, col * 7);
    for (let row = 0; row < 7; row++) {
      const date = addDays(weekStartDate, row);
      if (
        date.getTime() < start.getTime() ||
        date.getTime() > end.getTime()
      ) {
        continue;
      }
      const iso = toISODate(date);
      const rawValue = lookup.get(iso);
      const value = isFiniteNumber(rawValue) ? rawValue : 0;
      const colorInfo = getCalendarHeatmapColor(
        value,
        max,
        palette,
        emptyColor
      );
      const x = leftPad + col * (cellSize + cellGap);
      const y = topPad + row * (cellSize + cellGap);
      const cell: ChartCalendarHeatmapCell = {
        date: iso,
        value,
        color: colorInfo.color,
        level: colorInfo.level,
        col,
        row,
        x,
        y,
      };
      cells.push(cell);
      weekCells.push(cell);
      const monthIdx = date.getUTCMonth();
      if (!seenMonthByCol.has(monthIdx)) {
        seenMonthByCol.set(monthIdx, col);
        monthLabelByCol.set(col, {
          label: DEFAULT_CHART_CALENDAR_HEATMAP_MONTH_LABELS[monthIdx]!,
          index: monthIdx,
        });
      }
    }
    if (weekCells.length) {
      weeks.push({
        weekIndex: col,
        startDate: toISODate(weekStartDate),
        cells: weekCells,
      });
    }
  }

  const width = leftPad + totalCols * (cellSize + cellGap);
  const height = topPad + 7 * (cellSize + cellGap);

  const monthLabels = Array.from(monthLabelByCol.entries())
    .map(([col, info]) => ({ col, label: info.label, index: info.index }))
    .sort((a, b) => a.col - b.col);

  return {
    weeks,
    cells,
    monthLabels,
    width,
    height,
    max,
    weekStart,
    cellSize,
    cellGap,
    topPad,
    leftPad,
  };
}

export function describeCalendarHeatmap(
  values: readonly ChartCalendarHeatmapValue[],
  startDate: string,
  endDate: string,
  formatValue?: (v: number) => string
): string {
  const fmt = formatValue ?? ((n: number) => String(n));
  if (
    typeof startDate !== 'string' ||
    typeof endDate !== 'string' ||
    !parseISODate(startDate) ||
    !parseISODate(endDate)
  ) {
    return 'No data';
  }
  let total = 0;
  let days = 0;
  let max = 0;
  for (const v of values) {
    if (!isFiniteNumber(v.value)) continue;
    total += v.value;
    if (v.value > max) max = v.value;
    if (v.value > 0) days++;
  }
  return `Calendar heatmap from ${startDate} to ${endDate}. ${days} active days, total ${fmt(total)}, peak ${fmt(max)}.`;
}

export interface ChartCalendarHeatmapProps {
  values: readonly ChartCalendarHeatmapValue[];
  startDate?: string;
  endDate?: string;
  year?: number;
  weekStart?: ChartCalendarHeatmapWeekStart;
  cellSize?: number;
  cellGap?: number;
  topPad?: number;
  leftPad?: number;
  rightPad?: number;
  bottomPad?: number;
  palette?: readonly string[];
  emptyColor?: string;
  maxValue?: number;
  showMonthLabels?: boolean;
  showDowLabels?: boolean;
  showLegend?: boolean;
  showTooltip?: boolean;
  animate?: boolean;
  monthLabels?: readonly string[];
  dowLabels?: readonly string[];
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (v: number) => string;
  formatDate?: (date: string) => string;
  onCellClick?: (cell: ChartCalendarHeatmapCell) => void;
  style?: CSSProperties;
}

function defaultFormatValue(v: number): string {
  return String(v);
}

function defaultFormatDate(d: string): string {
  return d;
}

const ChartCalendarHeatmapInner = (
  {
    values,
    startDate,
    endDate,
    year,
    weekStart = 0,
    cellSize = DEFAULT_CHART_CALENDAR_HEATMAP_CELL_SIZE,
    cellGap = DEFAULT_CHART_CALENDAR_HEATMAP_CELL_GAP,
    topPad = DEFAULT_CHART_CALENDAR_HEATMAP_TOP_PAD,
    leftPad = DEFAULT_CHART_CALENDAR_HEATMAP_LEFT_PAD,
    rightPad = DEFAULT_CHART_CALENDAR_HEATMAP_RIGHT_PAD,
    bottomPad = DEFAULT_CHART_CALENDAR_HEATMAP_BOTTOM_PAD,
    palette = DEFAULT_CHART_CALENDAR_HEATMAP_PALETTE,
    emptyColor = DEFAULT_CHART_CALENDAR_HEATMAP_EMPTY_COLOR,
    maxValue,
    showMonthLabels = true,
    showDowLabels = true,
    showLegend = true,
    showTooltip = true,
    animate = true,
    monthLabels = DEFAULT_CHART_CALENDAR_HEATMAP_MONTH_LABELS,
    dowLabels = DEFAULT_CHART_CALENDAR_HEATMAP_DOW_LABELS,
    className,
    ariaLabel = 'Calendar heatmap',
    ariaDescription,
    formatValue = defaultFormatValue,
    formatDate = defaultFormatDate,
    onCellClick,
    style,
  }: ChartCalendarHeatmapProps,
  ref: ForwardedRef<HTMLDivElement>
) => {
  const reactId = useId();
  const descriptionId = `chart-calendar-heatmap-desc-${reactId}`;
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

  const resolved = useMemo(() => {
    if (startDate && endDate) return { startDate, endDate };
    const y =
      isFiniteNumber(year) && year > 0
        ? Math.floor(year)
        : new Date().getUTCFullYear();
    const range = getYearRange(y);
    return {
      startDate: toISODate(range.start),
      endDate: toISODate(range.end),
    };
  }, [startDate, endDate, year]);

  const computed = useMemo(
    () =>
      computeCalendarHeatmap({
        values,
        startDate: resolved.startDate,
        endDate: resolved.endDate,
        weekStart,
        cellSize,
        cellGap,
        topPad,
        leftPad,
        palette,
        emptyColor,
        ...(isFiniteNumber(maxValue) ? { maxValue } : {}),
      }),
    [
      values,
      resolved.startDate,
      resolved.endDate,
      weekStart,
      cellSize,
      cellGap,
      topPad,
      leftPad,
      palette,
      emptyColor,
      maxValue,
    ]
  );

  const svgWidth = computed.width + rightPad;
  const svgHeight = computed.height + bottomPad;

  const autoDescription = useMemo(
    () =>
      describeCalendarHeatmap(
        values,
        resolved.startDate,
        resolved.endDate,
        formatValue
      ),
    [values, resolved.startDate, resolved.endDate, formatValue]
  );

  const hovered = useMemo(
    () => computed.cells.find((c) => c.date === hoveredDate) ?? null,
    [computed.cells, hoveredDate]
  );

  const visibleDowRows = useMemo(() => {
    if (weekStart === 0) return [1, 3, 5];
    return [0, 2, 4];
  }, [weekStart]);

  const orderedDowLabels = useMemo(() => {
    const labels: string[] = [];
    for (let i = 0; i < 7; i++) {
      const idx = weekStart === 0 ? i : (i + 1) % 7;
      labels[i] = dowLabels[idx] ?? '';
    }
    return labels;
  }, [dowLabels, weekStart]);

  return (
    <div
      ref={ref}
      data-section="chart-calendar-heatmap"
      data-cell-count={computed.cells.length}
      data-week-count={computed.weeks.length}
      data-week-start={weekStart}
      data-start-date={resolved.startDate}
      data-end-date={resolved.endDate}
      data-max={computed.max}
      data-animate={animate ? 'true' : 'false'}
      className={[
        'chart-calendar-heatmap flex flex-col gap-2',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="region"
      aria-label={ariaLabel}
      style={style}
    >
      <div
        data-section="chart-calendar-heatmap-canvas"
        className="relative inline-block"
        style={{ width: svgWidth, height: svgHeight }}
      >
        <span
          id={descriptionId}
          data-section="chart-calendar-heatmap-aria-desc"
          className="sr-only"
        >
          {ariaDescription ?? autoDescription}
        </span>
        <svg
          data-section="chart-calendar-heatmap-svg"
          width={svgWidth}
          height={svgHeight}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          role="img"
          aria-label={ariaLabel}
          aria-describedby={descriptionId}
          style={{ display: 'block' }}
        >
          {showMonthLabels && (
            <g data-section="chart-calendar-heatmap-months" pointerEvents="none">
              {computed.monthLabels.map((m) => {
                const x = leftPad + m.col * (cellSize + cellGap);
                const label = monthLabels[m.index] ?? m.label;
                return (
                  <text
                    key={`m-${m.col}`}
                    data-section="chart-calendar-heatmap-month-label"
                    data-month-index={m.index}
                    data-month-col={m.col}
                    x={x}
                    y={topPad - 6}
                    fontSize={10}
                    fill="rgb(71 85 105)"
                  >
                    {label}
                  </text>
                );
              })}
            </g>
          )}
          {showDowLabels && (
            <g data-section="chart-calendar-heatmap-dow" pointerEvents="none">
              {visibleDowRows.map((row) => {
                const y =
                  topPad + row * (cellSize + cellGap) + cellSize - 1;
                const label = orderedDowLabels[row] ?? '';
                return (
                  <text
                    key={`d-${row}`}
                    data-section="chart-calendar-heatmap-dow-label"
                    data-dow-row={row}
                    x={leftPad - 6}
                    y={y}
                    textAnchor="end"
                    fontSize={9}
                    fill="rgb(100 116 139)"
                  >
                    {label}
                  </text>
                );
              })}
            </g>
          )}
          <g data-section="chart-calendar-heatmap-cells">
            {computed.cells.map((c) => {
              const isHovered = hoveredDate === c.date;
              return (
                <rect
                  key={c.date}
                  data-section="chart-calendar-heatmap-cell"
                  data-cell-date={c.date}
                  data-cell-value={c.value}
                  data-cell-level={c.level}
                  data-cell-color={c.color}
                  data-cell-col={c.col}
                  data-cell-row={c.row}
                  data-hovered={isHovered ? 'true' : 'false'}
                  className={
                    animate ? 'motion-safe:animate-fade-in' : undefined
                  }
                  x={c.x}
                  y={c.y}
                  width={cellSize}
                  height={cellSize}
                  rx={2}
                  ry={2}
                  fill={c.color}
                  stroke="rgba(15, 23, 42, 0.04)"
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`${formatDate(c.date)}: ${formatValue(c.value)}`}
                  onMouseEnter={() => setHoveredDate(c.date)}
                  onMouseLeave={() =>
                    setHoveredDate((cur) => (cur === c.date ? null : cur))
                  }
                  onFocus={() => setHoveredDate(c.date)}
                  onBlur={() =>
                    setHoveredDate((cur) => (cur === c.date ? null : cur))
                  }
                  onClick={() => onCellClick?.(c)}
                />
              );
            })}
          </g>
        </svg>
        {showTooltip && hovered && (
          <div
            data-section="chart-calendar-heatmap-tooltip"
            className="pointer-events-none absolute left-1/2 top-1 -translate-x-1/2 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs shadow"
          >
            <div
              data-section="chart-calendar-heatmap-tooltip-date"
              className="font-semibold"
            >
              {formatDate(hovered.date)}
            </div>
            <div
              data-section="chart-calendar-heatmap-tooltip-value"
              className="font-mono text-slate-700"
            >
              {formatValue(hovered.value)}
            </div>
          </div>
        )}
      </div>
      {showLegend && (
        <div
          data-section="chart-calendar-heatmap-legend"
          className="flex items-center gap-1 text-[10px] text-slate-500"
        >
          <span data-section="chart-calendar-heatmap-legend-low">Less</span>
          <span
            data-section="chart-calendar-heatmap-legend-swatch"
            data-legend-level={0}
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: emptyColor }}
          />
          {palette.map((color, idx) => (
            <span
              key={`l-${idx}`}
              data-section="chart-calendar-heatmap-legend-swatch"
              data-legend-level={idx + 1}
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: color }}
            />
          ))}
          <span data-section="chart-calendar-heatmap-legend-high">More</span>
        </div>
      )}
    </div>
  );
};

export const ChartCalendarHeatmap = forwardRef<
  HTMLDivElement,
  ChartCalendarHeatmapProps
>(ChartCalendarHeatmapInner);
ChartCalendarHeatmap.displayName = 'ChartCalendarHeatmap';
