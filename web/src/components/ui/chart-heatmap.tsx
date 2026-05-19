import {
  forwardRef,
  useCallback,
  useMemo,
  useState,
} from 'react';
import type { ForwardedRef } from 'react';
import { cn } from '../../lib/cn';

// (v1.11.460, TODO 11.442) ChartHeatmap primitive.
//
// Calendar-style heatmap (GitHub-contributions layout). Each
// column is an ISO week; each row is a day-of-week starting
// at the configured `weekStartsOn`. Cells are coloured along
// a 5-step quantile scale (no-data / q1 / q2 / q3 / q4) so
// adopters can read intensity at a glance. Day-hover shows a
// tooltip and an optional click handler exposes the resolved
// `Date` + cell payload.
//
// Reference: /root/c4/arps-design-system-v1/.

export interface ChartHeatmapCell {
  date: string | Date;
  value: number;
  label?: string;
}

export interface ChartHeatmapResolvedCell {
  date: Date;
  iso: string;
  value: number;
  label?: string;
  bucket: number;
}

export interface ChartHeatmapProps {
  data: readonly ChartHeatmapCell[];
  startDate?: string | Date;
  endDate?: string | Date;
  cellSize?: number;
  cellGap?: number;
  colorScale?: readonly string[];
  emptyColor?: string;
  showWeekdayLabels?: boolean;
  showMonthLabels?: boolean;
  showLegend?: boolean;
  formatValue?: (v: number) => string;
  formatDate?: (d: Date) => string;
  onCellClick?: (cell: ChartHeatmapResolvedCell) => void;
  className?: string;
  ariaLabel?: string;
  weekStartsOn?: 0 | 1;
  legendLowLabel?: string;
  legendHighLabel?: string;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export const DEFAULT_HEATMAP_CELL_SIZE = 12;
export const DEFAULT_HEATMAP_CELL_GAP = 2;
export const DEFAULT_HEATMAP_EMPTY_COLOR = 'rgba(120, 120, 120, 0.18)';

// GitHub-style greens. Index 0 = no data; 1..4 = intensity tiers.
export const DEFAULT_HEATMAP_COLOR_SCALE: readonly string[] = [
  DEFAULT_HEATMAP_EMPTY_COLOR,
  '#9be9a8',
  '#40c463',
  '#30a14e',
  '#216e39',
];

const ISO_DAY_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ISO_MONTH = [
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

export function formatIsoDate(value: Date | string | number): string {
  const d =
    value instanceof Date
      ? value
      : new Date(typeof value === 'number' ? value : `${value}`);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getUTCFullYear();
  const m = `${d.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${d.getUTCDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDate(value: string | Date | number): Date {
  if (value instanceof Date) return new Date(value.getTime());
  if (typeof value === 'number') return new Date(value);
  // Force ISO-date parsing in UTC so the cell calendar does
  // not drift across timezones.
  return new Date(`${value}T00:00:00Z`);
}

function startOfWeek(date: Date, weekStartsOn: 0 | 1): Date {
  const d = new Date(date.getTime());
  const dow = d.getUTCDay();
  const delta = (dow - weekStartsOn + 7) % 7;
  d.setUTCDate(d.getUTCDate() - delta);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

// Bucket the input data by ISO date so the renderer can
// look up a cell in O(1) per day.
export function bucketHeatmapData(
  data: readonly ChartHeatmapCell[],
): Map<string, ChartHeatmapCell> {
  const map = new Map<string, ChartHeatmapCell>();
  for (const c of data) {
    const iso = formatIsoDate(c.date);
    if (iso.length > 0) map.set(iso, c);
  }
  return map;
}

export function getHeatmapMax(
  data: readonly ChartHeatmapCell[],
): number {
  let max = 0;
  for (const c of data) {
    if (Number.isFinite(c.value) && c.value > max) max = c.value;
  }
  return max;
}

// Returns the bucket index (0..4) for a value relative to the
// observed max. Bucket 0 means "no data" (value <= 0);
// buckets 1..4 are quantile tiers across the (0, max] range.
export function getHeatmapBucket(
  value: number,
  max: number,
  bucketCount: number = 4,
): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (max <= 0) return 0;
  const ratio = Math.min(value / max, 1);
  const tier = Math.ceil(ratio * bucketCount);
  return Math.max(1, Math.min(bucketCount, tier));
}

export function getHeatmapColor(
  value: number,
  max: number,
  scale: readonly string[] = DEFAULT_HEATMAP_COLOR_SCALE,
): string {
  const idx = getHeatmapBucket(value, max, scale.length - 1);
  return scale[idx] ?? scale[0] ?? DEFAULT_HEATMAP_EMPTY_COLOR;
}

export interface HeatmapWeek {
  // ISO date of the first day of this column
  start: string;
  // 7 cells in row order; null = before/after the requested range
  cells: Array<ChartHeatmapResolvedCell | null>;
  // Month index of the first cell (for column header alignment)
  monthIndex: number;
}

// Compute the week-grid layout. Each entry is one column
// (week) containing seven row cells. Cells outside the
// requested range render as `null` so the column always has
// seven rows.
export function getHeatmapWeeks(
  data: readonly ChartHeatmapCell[],
  options: {
    startDate?: string | Date | number;
    endDate?: string | Date | number;
    weekStartsOn?: 0 | 1;
  } = {},
): HeatmapWeek[] {
  const weekStartsOn = options.weekStartsOn ?? 0;
  const buckets = bucketHeatmapData(data);
  const max = getHeatmapMax(data);
  const dates = data
    .map((c) => parseDate(c.date))
    .filter((d) => !Number.isNaN(d.getTime()));
  const inferredStart =
    options.startDate !== undefined
      ? parseDate(options.startDate)
      : dates.length > 0
        ? new Date(
            Math.min(...dates.map((d) => d.getTime())),
          )
        : new Date();
  const inferredEnd =
    options.endDate !== undefined
      ? parseDate(options.endDate)
      : dates.length > 0
        ? new Date(
            Math.max(...dates.map((d) => d.getTime())),
          )
        : inferredStart;
  if (Number.isNaN(inferredStart.getTime()) || Number.isNaN(inferredEnd.getTime())) {
    return [];
  }
  const firstWeekStart = startOfWeek(inferredStart, weekStartsOn);
  const lastWeekStart = startOfWeek(inferredEnd, weekStartsOn);
  const weeks: HeatmapWeek[] = [];
  let cursor = firstWeekStart;
  while (cursor.getTime() <= lastWeekStart.getTime()) {
    const weekCells: HeatmapWeek['cells'] = [];
    for (let i = 0; i < 7; i += 1) {
      const day = addDays(cursor, i);
      if (
        day.getTime() < inferredStart.getTime() ||
        day.getTime() > inferredEnd.getTime()
      ) {
        weekCells.push(null);
        continue;
      }
      const iso = formatIsoDate(day);
      const cell = buckets.get(iso);
      const value = cell?.value ?? 0;
      weekCells.push({
        date: day,
        iso,
        value,
        bucket: getHeatmapBucket(value, max),
        ...(cell?.label !== undefined ? { label: cell.label } : {}),
      });
    }
    weeks.push({
      start: formatIsoDate(cursor),
      cells: weekCells,
      monthIndex: cursor.getUTCMonth(),
    });
    cursor = addDays(cursor, 7);
  }
  return weeks;
}

export function defaultFormatHeatmapDate(d: Date): string {
  return formatIsoDate(d);
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export const ChartHeatmap = forwardRef(function ChartHeatmap(
  {
    data,
    startDate,
    endDate,
    cellSize = DEFAULT_HEATMAP_CELL_SIZE,
    cellGap = DEFAULT_HEATMAP_CELL_GAP,
    colorScale = DEFAULT_HEATMAP_COLOR_SCALE,
    emptyColor = DEFAULT_HEATMAP_EMPTY_COLOR,
    showWeekdayLabels = true,
    showMonthLabels = true,
    showLegend = true,
    formatValue,
    formatDate = defaultFormatHeatmapDate,
    onCellClick,
    className,
    ariaLabel = 'Activity heatmap',
    weekStartsOn = 0,
    legendLowLabel = 'Less',
    legendHighLabel = 'More',
  }: ChartHeatmapProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const weeks = useMemo(
    () =>
      getHeatmapWeeks(data, {
        ...(startDate !== undefined ? { startDate } : {}),
        ...(endDate !== undefined ? { endDate } : {}),
        weekStartsOn,
      }),
    [data, endDate, startDate, weekStartsOn],
  );

  const [hoverIso, setHoverIso] = useState<string | null>(null);

  const hoveredCell = useMemo(() => {
    if (!hoverIso) return null;
    for (const w of weeks) {
      for (const c of w.cells) {
        if (c && c.iso === hoverIso) return c;
      }
    }
    return null;
  }, [hoverIso, weeks]);

  const handleEnter = useCallback((iso: string) => {
    setHoverIso(iso);
  }, []);
  const handleLeave = useCallback(() => {
    setHoverIso(null);
  }, []);

  const handleClick = useCallback(
    (cell: ChartHeatmapResolvedCell) => {
      onCellClick?.(cell);
    },
    [onCellClick],
  );

  const colWidth = cellSize + cellGap;
  const rowHeight = cellSize + cellGap;
  const monthLabelHeight = showMonthLabels ? 14 : 0;
  const weekdayLabelWidth = showWeekdayLabels ? 24 : 0;

  // Month label positions: emit the abbreviated month name
  // at the first column where the month changes.
  const monthLabels: Array<{ x: number; month: string }> = [];
  let lastMonth = -1;
  weeks.forEach((w, idx) => {
    if (w.monthIndex !== lastMonth) {
      monthLabels.push({
        x: weekdayLabelWidth + idx * colWidth,
        month: ISO_MONTH[w.monthIndex]!,
      });
      lastMonth = w.monthIndex;
    }
  });

  const orderedWeekdays = useMemo(() => {
    if (weekStartsOn === 1) {
      return [
        ...ISO_DAY_OF_WEEK.slice(1),
        ISO_DAY_OF_WEEK[0]!,
      ];
    }
    return ISO_DAY_OF_WEEK;
  }, [weekStartsOn]);

  const width =
    weekdayLabelWidth + weeks.length * colWidth - cellGap;
  const height = monthLabelHeight + 7 * rowHeight - cellGap;

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      data-section="chart-heatmap"
      data-cell-count={data.length}
      data-week-count={weeks.length}
      data-week-starts-on={weekStartsOn}
      className={cn('relative inline-flex flex-col gap-2', className)}
    >
      <svg
        role="img"
        aria-label={ariaLabel}
        viewBox={`0 0 ${Math.max(0, width)} ${Math.max(0, height)}`}
        width={Math.max(0, width)}
        height={Math.max(0, height)}
        data-section="chart-heatmap-svg"
      >
        {showMonthLabels
          ? monthLabels.map((m, idx) => (
              <text
                key={`${m.month}-${idx}`}
                data-section="chart-heatmap-month"
                data-month-index={ISO_MONTH.indexOf(m.month)}
                x={m.x}
                y={10}
                fontSize={10}
                fill="currentColor"
                fillOpacity={0.6}
              >
                {m.month}
              </text>
            ))
          : null}
        {showWeekdayLabels
          ? orderedWeekdays.map((day, idx) => (
              <text
                key={day}
                data-section="chart-heatmap-weekday"
                data-day-index={idx}
                x={0}
                y={monthLabelHeight + idx * rowHeight + cellSize - 2}
                fontSize={9}
                fill="currentColor"
                fillOpacity={0.6}
              >
                {day}
              </text>
            ))
          : null}
        {weeks.map((week, weekIdx) =>
          week.cells.map((cell, dayIdx) => {
            if (cell === null) return null;
            const x = weekdayLabelWidth + weekIdx * colWidth;
            const y = monthLabelHeight + dayIdx * rowHeight;
            const fill =
              cell.value > 0
                ? colorScale[
                    Math.min(cell.bucket, colorScale.length - 1)
                  ]!
                : emptyColor;
            const isHovered = hoverIso === cell.iso;
            const ariaLabelCell = `${formatDate(cell.date)}: ${
              formatValue ? formatValue(cell.value) : cell.value
            }`;
            return (
              <rect
                key={`${week.start}-${dayIdx}`}
                role="graphics-symbol"
                tabIndex={0}
                aria-label={ariaLabelCell}
                data-section="chart-heatmap-cell"
                data-iso={cell.iso}
                data-bucket={cell.bucket}
                data-value={cell.value}
                data-hovered={isHovered ? 'true' : 'false'}
                x={x}
                y={y}
                width={cellSize}
                height={cellSize}
                fill={fill}
                stroke={isHovered ? 'currentColor' : 'none'}
                strokeOpacity={isHovered ? 0.4 : 0}
                rx={2}
                onMouseEnter={() => handleEnter(cell.iso)}
                onMouseLeave={handleLeave}
                onFocus={() => handleEnter(cell.iso)}
                onBlur={handleLeave}
                onClick={onCellClick ? () => handleClick(cell) : undefined}
                style={{
                  cursor: onCellClick ? 'pointer' : 'default',
                }}
              />
            );
          }),
        )}
      </svg>
      {showLegend ? (
        <div
          data-section="chart-heatmap-legend"
          className="flex items-center gap-1 text-[10px] text-muted-foreground"
        >
          <span data-section="chart-heatmap-legend-low">
            {legendLowLabel}
          </span>
          {colorScale.map((c, idx) => (
            <span
              key={idx}
              data-section="chart-heatmap-legend-swatch"
              data-bucket={idx}
              className="inline-block rounded-sm"
              style={{
                backgroundColor: c,
                width: cellSize,
                height: cellSize,
              }}
            />
          ))}
          <span data-section="chart-heatmap-legend-high">
            {legendHighLabel}
          </span>
        </div>
      ) : null}
      {hoveredCell ? (
        <div
          role="tooltip"
          data-section="chart-heatmap-tooltip"
          data-iso={hoveredCell.iso}
          className="pointer-events-none absolute top-0 left-0 -translate-y-full rounded border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow"
        >
          <div
            data-section="chart-heatmap-tooltip-date"
            className="font-medium"
          >
            {formatDate(hoveredCell.date)}
          </div>
          <div
            data-section="chart-heatmap-tooltip-value"
            className="font-mono text-muted-foreground"
          >
            {hoveredCell.label !== undefined
              ? hoveredCell.label
              : formatValue
                ? formatValue(hoveredCell.value)
                : `${hoveredCell.value}`}
          </div>
        </div>
      ) : null}
    </div>
  );
});

ChartHeatmap.displayName = 'ChartHeatmap';
