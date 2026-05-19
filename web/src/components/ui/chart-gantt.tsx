import {
  forwardRef,
  useCallback,
  useMemo,
  useState,
} from 'react';
import type { ForwardedRef } from 'react';
import { cn } from '../../lib/cn';

// (v1.11.473, TODO 11.455) ChartGantt primitive.
//
// Pure-SVG horizontal Gantt chart. Each row is a task bar
// stretched between `start` and `end`. Optional progress
// fill shades the completed portion. Dependency arrows
// route from one task's end to another task's start.
// A `today` marker line highlights the current date.
// Per-task tooltip surfaces label, start, end, progress.
//
// Reference: /root/c4/arps-design-system-v1/.

export interface ChartGanttTask {
  id: string;
  label: string;
  start: string | number;
  end: string | number;
  progress?: number;
  color?: string;
  group?: string;
  dependencies?: readonly string[];
}

export interface ChartGanttProps {
  tasks: readonly ChartGanttTask[];
  width?: number;
  height?: number;
  rowHeight?: number;
  rowGap?: number;
  labelWidth?: number;
  startDate?: string | number;
  endDate?: string | number;
  today?: string | number;
  showToday?: boolean;
  showDependencies?: boolean;
  showLabels?: boolean;
  showTooltip?: boolean;
  showAxisTicks?: boolean;
  showProgress?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatDate?: (d: string | number) => string;
  tickCount?: number;
  defaultBarColor?: string;
  todayColor?: string;
  onTaskClick?: (args: {
    task: ChartGanttTask;
    index: number;
  }) => void;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export const DEFAULT_CHART_GANTT_WIDTH = 720;
export const DEFAULT_CHART_GANTT_HEIGHT = 280;
export const DEFAULT_CHART_GANTT_ROW_HEIGHT = 20;
export const DEFAULT_CHART_GANTT_ROW_GAP = 6;
export const DEFAULT_CHART_GANTT_LABEL_WIDTH = 120;
export const DEFAULT_CHART_GANTT_TICK_COUNT = 5;
export const DEFAULT_CHART_GANTT_BAR_COLOR = '#2563eb';
export const DEFAULT_CHART_GANTT_TODAY_COLOR = '#dc2626';

// Convert a date (ISO string or epoch number) to epoch ms.
// Non-finite or unparseable inputs return null so callers
// can fall back to a default value.
export function parseGanttDate(
  d: string | number,
): number | null {
  if (typeof d === 'number') {
    if (!Number.isFinite(d)) return null;
    return d;
  }
  if (typeof d !== 'string') return null;
  const parsed = Date.parse(d);
  if (Number.isNaN(parsed)) return null;
  return parsed;
}

// Compute the min / max of every task's date range. Honours
// explicit `startOverride` / `endOverride`. Falls back to
// (0, 1) when no parseable date is present.
export function getGanttDateBounds(
  tasks: readonly ChartGanttTask[],
  startOverride?: string | number,
  endOverride?: string | number,
): { min: number; max: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const t of tasks) {
    const s = parseGanttDate(t.start);
    const e = parseGanttDate(t.end);
    if (s !== null && s < min) min = s;
    if (e !== null && e > max) max = e;
  }
  const so =
    startOverride !== undefined
      ? parseGanttDate(startOverride)
      : null;
  const eo =
    endOverride !== undefined
      ? parseGanttDate(endOverride)
      : null;
  if (so !== null) min = so;
  if (eo !== null) max = eo;
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: 0, max: 1 };
  }
  if (min === max) return { min, max: max + 1 };
  return { min, max };
}

// Clamp value to [0, 1] of [min, max].
export function getGanttRangeRatio(
  value: number,
  min: number,
  max: number,
): number {
  if (!Number.isFinite(value)) return 0;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return 0;
  if (max <= min) return 0;
  if (value <= min) return 0;
  if (value >= max) return 1;
  return (value - min) / (max - min);
}

// Decide a task bar's fill colour. Per-task color wins;
// otherwise default.
export function getGanttTaskColor(
  task: ChartGanttTask,
  defaultColor: string,
): string {
  if (task.color) return task.color;
  return defaultColor;
}

// Evenly-spaced numeric ticks across [min, max] (epoch ms).
export function getGanttTicks(
  min: number,
  max: number,
  count: number = DEFAULT_CHART_GANTT_TICK_COUNT,
): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0];
  if (max <= min) return [min];
  const safeCount = Math.max(2, Math.floor(count));
  const step = (max - min) / (safeCount - 1);
  const out: number[] = [];
  for (let i = 0; i < safeCount; i += 1) out.push(min + i * step);
  return out;
}

// Format an epoch date for display. Falls back to
// YYYY-MM-DD when no formatter is supplied.
export function formatGanttDate(
  epoch: number,
  formatter?: (d: string | number) => string,
): string {
  if (!Number.isFinite(epoch)) return '';
  if (formatter) return formatter(epoch);
  const d = new Date(epoch);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

// Build the SVG path for a dependency arrow from
// (fromX, fromY) to (toX, toY). The arrow elbows
// horizontally then vertically.
export function buildGanttDependencyPath(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): string {
  const elbow = Math.max(fromX + 6, (fromX + toX) / 2);
  return `M ${fromX.toFixed(2)} ${fromY.toFixed(2)} L ${elbow.toFixed(2)} ${fromY.toFixed(2)} L ${elbow.toFixed(2)} ${toY.toFixed(2)} L ${toX.toFixed(2)} ${toY.toFixed(2)}`;
}

// Build the default ARIA description.
export function describeGanttChart(
  tasks: readonly ChartGanttTask[],
  formatDate?: (d: string | number) => string,
): string {
  if (tasks.length === 0) return 'No data';
  const parts: string[] = [];
  for (const t of tasks) {
    const s = parseGanttDate(t.start);
    const e = parseGanttDate(t.end);
    const sf = s !== null ? formatGanttDate(s, formatDate) : '?';
    const ef = e !== null ? formatGanttDate(e, formatDate) : '?';
    parts.push(`${t.label} ${sf} to ${ef}`);
  }
  return `Gantt chart with ${tasks.length} tasks. ${parts.join('. ')}.`;
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export const ChartGantt = forwardRef(function ChartGantt(
  {
    tasks,
    width = DEFAULT_CHART_GANTT_WIDTH,
    height = DEFAULT_CHART_GANTT_HEIGHT,
    rowHeight = DEFAULT_CHART_GANTT_ROW_HEIGHT,
    rowGap = DEFAULT_CHART_GANTT_ROW_GAP,
    labelWidth = DEFAULT_CHART_GANTT_LABEL_WIDTH,
    startDate,
    endDate,
    today,
    showToday = true,
    showDependencies = true,
    showLabels = true,
    showTooltip = true,
    showAxisTicks = true,
    showProgress = true,
    animate = true,
    className,
    ariaLabel = 'Gantt chart',
    ariaDescription,
    formatDate,
    tickCount = DEFAULT_CHART_GANTT_TICK_COUNT,
    defaultBarColor = DEFAULT_CHART_GANTT_BAR_COLOR,
    todayColor = DEFAULT_CHART_GANTT_TODAY_COLOR,
    onTaskClick,
  }: ChartGanttProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const bounds = useMemo(
    () => getGanttDateBounds(tasks, startDate, endDate),
    [endDate, startDate, tasks],
  );
  const ticks = useMemo(
    () => getGanttTicks(bounds.min, bounds.max, tickCount),
    [bounds.max, bounds.min, tickCount],
  );

  const padTop = 32;
  const trackX = labelWidth + 8;
  const trackWidth = Math.max(0, width - trackX - 8);
  const totalRowHeight = rowHeight + rowGap;
  const totalRowsHeight =
    tasks.length === 0 ? 0 : totalRowHeight * tasks.length;
  const computedHeight =
    Math.max(height, padTop + totalRowsHeight + 24);

  const xFor = useCallback(
    (date: number) =>
      trackX +
      trackWidth * getGanttRangeRatio(date, bounds.min, bounds.max),
    [bounds.max, bounds.min, trackWidth, trackX],
  );

  const todayEpoch = useMemo(() => {
    if (today === undefined) return null;
    return parseGanttDate(today);
  }, [today]);

  const description = useMemo(
    () =>
      ariaDescription ?? describeGanttChart(tasks, formatDate),
    [ariaDescription, formatDate, tasks],
  );

  const [hovered, setHovered] = useState<number | null>(null);
  const handleEnter = useCallback((idx: number) => {
    setHovered(idx);
  }, []);
  const handleLeave = useCallback(() => {
    setHovered(null);
  }, []);

  const fd = (d: string | number | number) => {
    if (typeof d === 'number') return formatGanttDate(d, formatDate);
    const parsed = parseGanttDate(d);
    return parsed !== null
      ? formatGanttDate(parsed, formatDate)
      : '';
  };

  const taskRows = useMemo(() => {
    return tasks.map((task, i) => {
      const s = parseGanttDate(task.start);
      const e = parseGanttDate(task.end);
      if (s === null || e === null) {
        return null;
      }
      const x1 = xFor(s);
      const x2 = xFor(e);
      const y = padTop + i * totalRowHeight;
      return {
        task,
        index: i,
        x1,
        x2,
        y,
        start: s,
        end: e,
      };
    });
  }, [padTop, tasks, totalRowHeight, xFor]);

  const hoveredTask = hovered !== null ? taskRows[hovered] : null;

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      data-section="chart-gantt"
      data-task-count={tasks.length}
      data-animate={animate ? 'true' : 'false'}
      className={cn(
        'relative inline-block w-full max-w-full',
        className,
      )}
      style={{ width }}
    >
      <span
        data-section="chart-gantt-aria-desc"
        className="sr-only"
      >
        {description}
      </span>
      <svg
        role="img"
        aria-label={ariaLabel}
        viewBox={`0 0 ${width} ${computedHeight}`}
        width={width}
        height={computedHeight}
        data-section="chart-gantt-svg"
        className="h-auto w-full"
      >
        {/* Tick lines + labels along the top */}
        {showAxisTicks
          ? ticks.map((t, idx) => {
              const x = xFor(t);
              return (
                <g
                  key={`tick-${idx}`}
                  data-section="chart-gantt-tick"
                  data-tick-value={t}
                >
                  <line
                    aria-hidden="true"
                    x1={x}
                    y1={padTop - 6}
                    x2={x}
                    y2={padTop + totalRowsHeight}
                    stroke="currentColor"
                    strokeOpacity={0.08}
                    strokeDasharray="2 4"
                  />
                  <text
                    aria-hidden="true"
                    data-section="chart-gantt-tick-label"
                    x={x}
                    y={padTop - 10}
                    textAnchor={
                      idx === 0
                        ? 'start'
                        : idx === ticks.length - 1
                          ? 'end'
                          : 'middle'
                    }
                    fontSize={10}
                    fill="currentColor"
                    fillOpacity={0.65}
                  >
                    {formatGanttDate(t, formatDate)}
                  </text>
                </g>
              );
            })
          : null}
        {/* Task rows */}
        {taskRows.map((row, i) => {
          if (!row) return null;
          const color = getGanttTaskColor(
            row.task,
            defaultBarColor,
          );
          const isHovered = hovered === i;
          const barW = Math.max(1, row.x2 - row.x1);
          const progress =
            row.task.progress !== undefined &&
            Number.isFinite(row.task.progress)
              ? Math.max(0, Math.min(1, row.task.progress))
              : 0;
          return (
            <g
              key={row.task.id}
              data-section="chart-gantt-row"
              data-task-id={row.task.id}
              data-task-index={i}
              data-task-color={color}
              data-task-group={row.task.group ?? ''}
              data-task-progress={progress.toFixed(4)}
              data-hovered={isHovered ? 'true' : 'false'}
              className={cn(
                animate && 'motion-safe:animate-fade-in',
              )}
            >
              {showLabels ? (
                <text
                  aria-hidden="true"
                  data-section="chart-gantt-label"
                  data-task-id={row.task.id}
                  x={labelWidth}
                  y={row.y + rowHeight / 2 + 3}
                  textAnchor="end"
                  fontSize={11}
                  fill="currentColor"
                  fillOpacity={0.85}
                >
                  {row.task.label}
                </text>
              ) : null}
              <rect
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`${row.task.label}: ${formatGanttDate(row.start, formatDate)} to ${formatGanttDate(row.end, formatDate)}`}
                data-section="chart-gantt-bar"
                data-task-id={row.task.id}
                x={row.x1}
                y={row.y}
                width={barW}
                height={rowHeight}
                fill={color}
                fillOpacity={isHovered ? 1 : 0.85}
                stroke={isHovered ? color : 'none'}
                strokeWidth={isHovered ? 1.5 : 0}
                rx={3}
                ry={3}
                onMouseEnter={() => handleEnter(i)}
                onMouseLeave={handleLeave}
                onFocus={() => handleEnter(i)}
                onBlur={handleLeave}
                onClick={
                  onTaskClick
                    ? () =>
                        onTaskClick({
                          task: row.task,
                          index: i,
                        })
                    : undefined
                }
                style={{
                  cursor: onTaskClick ? 'pointer' : 'default',
                }}
              />
              {showProgress && progress > 0 ? (
                <rect
                  aria-hidden="true"
                  data-section="chart-gantt-progress"
                  data-task-id={row.task.id}
                  data-progress-ratio={progress.toFixed(4)}
                  x={row.x1}
                  y={row.y}
                  width={barW * progress}
                  height={rowHeight}
                  fill="#0f172a"
                  fillOpacity={0.35}
                  rx={3}
                  ry={3}
                  style={{ pointerEvents: 'none' }}
                />
              ) : null}
            </g>
          );
        })}
        {/* Dependency arrows */}
        {showDependencies
          ? taskRows.map((row, i) => {
              if (!row || !row.task.dependencies) return null;
              return row.task.dependencies.map((depId, j) => {
                const fromIdx = taskRows.findIndex(
                  (r) => r?.task.id === depId,
                );
                const from = taskRows[fromIdx];
                if (!from) return null;
                const path = buildGanttDependencyPath(
                  from.x2,
                  from.y + rowHeight / 2,
                  row.x1,
                  row.y + rowHeight / 2,
                );
                return (
                  <path
                    key={`dep-${i}-${j}`}
                    aria-hidden="true"
                    data-section="chart-gantt-dependency"
                    data-from-task-id={depId}
                    data-to-task-id={row.task.id}
                    d={path}
                    fill="none"
                    stroke="currentColor"
                    strokeOpacity={0.45}
                    strokeWidth={1}
                    markerEnd="url(#chart-gantt-arrow)"
                  />
                );
              });
            })
          : null}
        {/* Arrow marker definition */}
        <defs>
          <marker
            id="chart-gantt-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path
              d="M 0 0 L 10 5 L 0 10 Z"
              fill="currentColor"
              fillOpacity={0.45}
            />
          </marker>
        </defs>
        {/* Today marker */}
        {showToday &&
        todayEpoch !== null &&
        todayEpoch >= bounds.min &&
        todayEpoch <= bounds.max ? (
          <g
            data-section="chart-gantt-today"
            data-today-epoch={todayEpoch}
          >
            <line
              aria-hidden="true"
              data-section="chart-gantt-today-line"
              x1={xFor(todayEpoch)}
              y1={padTop - 6}
              x2={xFor(todayEpoch)}
              y2={padTop + totalRowsHeight}
              stroke={todayColor}
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
            <text
              aria-hidden="true"
              data-section="chart-gantt-today-label"
              x={xFor(todayEpoch) + 4}
              y={padTop - 14}
              fontSize={10}
              fill={todayColor}
              fillOpacity={0.95}
            >
              today
            </text>
          </g>
        ) : null}
      </svg>
      {showTooltip && hoveredTask && hovered !== null ? (
        <div
          role="tooltip"
          data-section="chart-gantt-tooltip"
          data-task-id={hoveredTask.task.id}
          style={{
            left: hoveredTask.x1 + 8,
            top: hoveredTask.y - 8,
          }}
          className="pointer-events-none absolute rounded border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow"
        >
          <div
            data-section="chart-gantt-tooltip-label"
            className="font-medium"
          >
            {hoveredTask.task.label}
          </div>
          <div
            data-section="chart-gantt-tooltip-start"
            className="font-mono text-muted-foreground"
          >
            start: {fd(hoveredTask.start)}
          </div>
          <div
            data-section="chart-gantt-tooltip-end"
            className="font-mono text-muted-foreground"
          >
            end: {fd(hoveredTask.end)}
          </div>
          {hoveredTask.task.progress !== undefined ? (
            <div
              data-section="chart-gantt-tooltip-progress"
              className="text-muted-foreground"
            >
              progress:{' '}
              {(
                Math.max(
                  0,
                  Math.min(1, hoveredTask.task.progress),
                ) * 100
              ).toFixed(0)}
              %
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});

ChartGantt.displayName = 'ChartGantt';
