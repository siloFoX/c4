import {
  Fragment,
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  ChangeEvent,
  ForwardedRef,
  ReactNode,
} from 'react';
import { Pause, Play, Search, Trash2 } from 'lucide-react';
import { cn } from '../../lib/cn';

// (v1.11.451, TODO 11.433) LogStream primitive.
//
// Auto-scrolling log viewer. Each entry rendered with a
// level chip, a time stamp, optional component / source tag,
// and a message body that is ANSI-color-parsed +
// search-highlighted. Level filters, free-text search, a
// time-range pair, and pause / resume controls let adopters
// triage live streams without leaving the panel. Auto-scroll
// pins the view to the latest entry while the viewer is not
// paused.
//
// Reference: /root/c4/arps-design-system-v1/.

export type LogLevel =
  | 'trace'
  | 'debug'
  | 'info'
  | 'warn'
  | 'error'
  | 'fatal';

export interface LogEntry {
  id: string;
  timestamp: string | number | Date;
  level: LogLevel;
  message: string;
  component?: string;
  source?: string;
}

export interface LogTimeRange {
  start?: string | number | Date;
  end?: string | number | Date;
}

export interface LogStreamProps {
  entries: LogEntry[];
  levels?: readonly LogLevel[];
  enabledLevels?: readonly LogLevel[];
  defaultEnabledLevels?: readonly LogLevel[];
  onEnabledLevelsChange?: (levels: LogLevel[]) => void;

  query?: string;
  defaultQuery?: string;
  onQueryChange?: (query: string) => void;

  isPaused?: boolean;
  defaultPaused?: boolean;
  onPausedChange?: (paused: boolean) => void;

  timeRange?: LogTimeRange;
  defaultTimeRange?: LogTimeRange;
  onTimeRangeChange?: (range: LogTimeRange) => void;

  autoScroll?: boolean;
  maxHeight?: number | string;
  ariaLabel?: string;
  emptyState?: ReactNode;
  className?: string;
  onClear?: () => void;
  showSearch?: boolean;
  showTimeRange?: boolean;
  showClear?: boolean;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export const LOG_LEVELS: readonly LogLevel[] = [
  'trace',
  'debug',
  'info',
  'warn',
  'error',
  'fatal',
];

export function getLogLevelRank(level: LogLevel): number {
  const i = LOG_LEVELS.indexOf(level);
  return i < 0 ? 0 : i;
}

export function getLogLevelClass(level: LogLevel): string {
  switch (level) {
    case 'trace':
      return 'bg-muted text-muted-foreground border-border';
    case 'debug':
      return 'bg-muted text-foreground border-border';
    case 'info':
      return 'bg-primary/15 text-primary border-primary/40';
    case 'warn':
      return 'bg-warning/15 text-warning border-warning/40';
    case 'error':
      return 'bg-destructive/15 text-destructive border-destructive/40';
    case 'fatal':
      return 'bg-destructive text-destructive-foreground border-destructive';
    default:
      return 'bg-muted text-foreground border-border';
  }
}

function toEpoch(value: LogEntry['timestamp']): number {
  if (value === undefined || value === null) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatLogTimestamp(
  value: LogEntry['timestamp'],
): string {
  const ms = toEpoch(value);
  if (ms <= 0) return '';
  const d = new Date(ms);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(Math.floor(d.getMilliseconds() / 10))}`;
}

export function inLogTimeRange(
  timestamp: LogEntry['timestamp'],
  range: LogTimeRange | undefined,
): boolean {
  if (!range) return true;
  const t = toEpoch(timestamp);
  if (range.start !== undefined) {
    const s = toEpoch(range.start);
    if (s > 0 && t < s) return false;
  }
  if (range.end !== undefined) {
    const e = toEpoch(range.end);
    if (e > 0 && t > e) return false;
  }
  return true;
}

export interface LogFilterOptions {
  enabledLevels?: readonly LogLevel[];
  query?: string;
  timeRange?: LogTimeRange;
}

export function filterLogEntries(
  entries: readonly LogEntry[],
  options: LogFilterOptions = {},
): LogEntry[] {
  const enabled = options.enabledLevels
    ? new Set(options.enabledLevels)
    : null;
  const q = options.query?.trim().toLowerCase() ?? '';
  return entries.filter((e) => {
    if (enabled && !enabled.has(e.level)) return false;
    if (!inLogTimeRange(e.timestamp, options.timeRange)) return false;
    if (q.length > 0) {
      const haystack = `${e.message} ${e.component ?? ''} ${e.source ?? ''}`
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

// ---------------------------------------------------------------
// ANSI parsing
// ---------------------------------------------------------------

export interface AnsiSegment {
  text: string;
  fgColor?: string;
  bgColor?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  dim?: boolean;
}

const ANSI_FG: Record<number, string> = {
  30: '#1f2937',
  31: '#ef4444',
  32: '#22c55e',
  33: '#f59e0b',
  34: '#3b82f6',
  35: '#a855f7',
  36: '#06b6d4',
  37: '#e5e7eb',
  90: '#6b7280',
  91: '#fca5a5',
  92: '#86efac',
  93: '#fcd34d',
  94: '#93c5fd',
  95: '#d8b4fe',
  96: '#67e8f9',
  97: '#f9fafb',
};
const ANSI_BG: Record<number, string> = {
  40: '#1f2937',
  41: '#ef4444',
  42: '#22c55e',
  43: '#f59e0b',
  44: '#3b82f6',
  45: '#a855f7',
  46: '#06b6d4',
  47: '#e5e7eb',
  100: '#6b7280',
  101: '#fca5a5',
  102: '#86efac',
  103: '#fcd34d',
  104: '#93c5fd',
  105: '#d8b4fe',
  106: '#67e8f9',
  107: '#f9fafb',
};

const ANSI_REGEX = /\x1b\[([\d;]*)m/g;

export function parseAnsi(input: string): AnsiSegment[] {
  if (!input) return [];
  const segments: AnsiSegment[] = [];
  let cursor = 0;
  let state: Omit<AnsiSegment, 'text'> = {};
  ANSI_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ANSI_REGEX.exec(input)) !== null) {
    const before = input.slice(cursor, match.index);
    if (before.length > 0) {
      segments.push({ text: before, ...state });
    }
    const codes = (match[1] ?? '')
      .split(';')
      .filter((s) => s.length > 0)
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isFinite(n));
    if (codes.length === 0) {
      // bare ESC[m == reset
      state = {};
    } else {
      state = applyAnsiCodes(state, codes);
    }
    cursor = match.index + match[0].length;
  }
  const tail = input.slice(cursor);
  if (tail.length > 0) {
    segments.push({ text: tail, ...state });
  }
  return segments;
}

function applyAnsiCodes(
  current: Omit<AnsiSegment, 'text'>,
  codes: number[],
): Omit<AnsiSegment, 'text'> {
  let next: Omit<AnsiSegment, 'text'> = { ...current };
  for (const code of codes) {
    if (code === 0) {
      next = {};
    } else if (code === 1) {
      next.bold = true;
    } else if (code === 2) {
      next.dim = true;
    } else if (code === 3) {
      next.italic = true;
    } else if (code === 4) {
      next.underline = true;
    } else if (code === 22) {
      next.bold = false;
      next.dim = false;
    } else if (code === 23) {
      next.italic = false;
    } else if (code === 24) {
      next.underline = false;
    } else if (code === 39) {
      delete next.fgColor;
    } else if (code === 49) {
      delete next.bgColor;
    } else if (ANSI_FG[code] !== undefined) {
      next.fgColor = ANSI_FG[code];
    } else if (ANSI_BG[code] !== undefined) {
      next.bgColor = ANSI_BG[code];
    }
  }
  return next;
}

// ---------------------------------------------------------------
// Search highlight (returns ReactNode)
// ---------------------------------------------------------------

const REGEX_SPECIALS_RE = /[.*+?^${}()|[\]\\]/g;

export function highlightLogMatches(
  text: string,
  query: string | undefined | null,
): ReactNode {
  if (!query) return text;
  const trimmed = query.trim();
  if (!trimmed) return text;
  const escaped = trimmed.replace(REGEX_SPECIALS_RE, '\\$&');
  let regex: RegExp;
  try {
    regex = new RegExp(`(${escaped})`, 'gi');
  } catch {
    return text;
  }
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <mark
            key={`m-${index}`}
            data-section="log-stream-mark"
            className="rounded bg-yellow-200 px-0.5 text-foreground dark:bg-yellow-500/30"
          >
            {part}
          </mark>
        ) : (
          <Fragment key={`t-${index}`}>{part}</Fragment>
        ),
      )}
    </>
  );
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export const LogStream = forwardRef(function LogStream(
  {
    entries,
    levels = LOG_LEVELS,
    enabledLevels,
    defaultEnabledLevels,
    onEnabledLevelsChange,

    query,
    defaultQuery = '',
    onQueryChange,

    isPaused,
    defaultPaused = false,
    onPausedChange,

    timeRange,
    defaultTimeRange,
    onTimeRangeChange,

    autoScroll = true,
    maxHeight = 320,
    ariaLabel = 'Log stream',
    emptyState = 'No log entries',
    className,
    onClear,
    showSearch = true,
    showTimeRange = true,
    showClear = false,
  }: LogStreamProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const isLevelsControlled = enabledLevels !== undefined;
  const [internalLevels, setInternalLevels] = useState<readonly LogLevel[]>(
    defaultEnabledLevels ?? levels,
  );
  const effectiveLevels = isLevelsControlled
    ? (enabledLevels ?? levels)
    : internalLevels;

  const isQueryControlled = query !== undefined;
  const [internalQuery, setInternalQuery] = useState<string>(
    defaultQuery,
  );
  const effectiveQuery = isQueryControlled
    ? (query ?? '')
    : internalQuery;

  const isPausedControlled = isPaused !== undefined;
  const [internalPaused, setInternalPaused] = useState<boolean>(
    defaultPaused,
  );
  const effectivePaused = isPausedControlled
    ? !!isPaused
    : internalPaused;

  const isRangeControlled = timeRange !== undefined;
  const [internalRange, setInternalRange] = useState<LogTimeRange>(
    defaultTimeRange ?? {},
  );
  const effectiveRange = isRangeControlled
    ? (timeRange ?? {})
    : internalRange;

  const refLevels = useRef(onEnabledLevelsChange);
  const refQuery = useRef(onQueryChange);
  const refPaused = useRef(onPausedChange);
  const refRange = useRef(onTimeRangeChange);
  useEffect(() => {
    refLevels.current = onEnabledLevelsChange;
  }, [onEnabledLevelsChange]);
  useEffect(() => {
    refQuery.current = onQueryChange;
  }, [onQueryChange]);
  useEffect(() => {
    refPaused.current = onPausedChange;
  }, [onPausedChange]);
  useEffect(() => {
    refRange.current = onTimeRangeChange;
  }, [onTimeRangeChange]);

  const toggleLevel = useCallback(
    (level: LogLevel) => {
      const set = new Set(effectiveLevels);
      if (set.has(level)) set.delete(level);
      else set.add(level);
      const next = levels.filter((l) => set.has(l));
      if (!isLevelsControlled) setInternalLevels(next);
      refLevels.current?.(next);
    },
    [effectiveLevels, isLevelsControlled, levels],
  );

  const handleQueryChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const v = event.target.value;
      if (!isQueryControlled) setInternalQuery(v);
      refQuery.current?.(v);
    },
    [isQueryControlled],
  );

  const togglePaused = useCallback(() => {
    const next = !effectivePaused;
    if (!isPausedControlled) setInternalPaused(next);
    refPaused.current?.(next);
  }, [effectivePaused, isPausedControlled]);

  const handleRangeChange = useCallback(
    (key: 'start' | 'end', value: string) => {
      const merged: LogTimeRange = { ...effectiveRange };
      if (value === '') {
        delete merged[key];
      } else {
        merged[key] = value;
      }
      if (!isRangeControlled) setInternalRange(merged);
      refRange.current?.(merged);
    },
    [effectiveRange, isRangeControlled],
  );

  const filtered = useMemo(
    () =>
      filterLogEntries(entries, {
        enabledLevels: effectiveLevels,
        query: effectiveQuery,
        timeRange: effectiveRange,
      }),
    [effectiveLevels, effectiveQuery, effectiveRange, entries],
  );

  // Auto-scroll to the bottom whenever new entries arrive
  // (unless paused). We track the last scrolled length so
  // adopters that re-render the entire list do not retrigger
  // scroll on a no-op rerender.
  const listRef = useRef<HTMLDivElement | null>(null);
  const lastLengthRef = useRef<number>(0);
  useEffect(() => {
    if (!autoScroll) return;
    if (effectivePaused) return;
    const el = listRef.current;
    if (!el) return;
    if (filtered.length === lastLengthRef.current) return;
    lastLengthRef.current = filtered.length;
    el.scrollTop = el.scrollHeight;
  }, [autoScroll, effectivePaused, filtered.length]);

  const setRefs = useCallback(
    (el: HTMLDivElement | null) => {
      listRef.current = el;
      if (typeof ref === 'function') ref(el);
      else if (ref) ref.current = el;
    },
    [ref],
  );

  const maxHeightStyle =
    typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight;

  return (
    <div
      role="region"
      aria-label={ariaLabel}
      data-section="log-stream"
      data-paused={effectivePaused ? 'true' : 'false'}
      data-entry-count={entries.length}
      data-filtered-count={filtered.length}
      data-auto-scroll={autoScroll ? 'true' : 'false'}
      className={cn(
        'flex w-full flex-col gap-2 rounded-md border border-border bg-card p-2',
        className,
      )}
    >
      <div
        data-section="log-stream-controls"
        className="flex flex-wrap items-center gap-2"
      >
        <div
          data-section="log-stream-level-filter"
          role="group"
          aria-label="Log level filters"
          className="flex flex-wrap items-center gap-1"
        >
          {levels.map((level) => {
            const enabled = effectiveLevels.includes(level);
            return (
              <button
                key={level}
                type="button"
                role="switch"
                aria-checked={enabled}
                data-section="log-stream-level-toggle"
                data-level={level}
                data-enabled={enabled ? 'true' : 'false'}
                onClick={() => toggleLevel(level)}
                className={cn(
                  'rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  enabled
                    ? getLogLevelClass(level)
                    : 'border-border bg-background text-muted-foreground opacity-50',
                )}
              >
                {level}
              </button>
            );
          })}
        </div>
        {showSearch ? (
          <div
            data-section="log-stream-search"
            className="flex flex-1 items-center gap-1 rounded border border-border bg-background px-2"
          >
            <Search
              aria-hidden="true"
              className="h-3 w-3 text-muted-foreground"
            />
            <input
              type="text"
              value={effectiveQuery}
              onChange={handleQueryChange}
              placeholder="Search logs..."
              aria-label="Filter log entries"
              data-section="log-stream-search-input"
              className="h-7 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            />
          </div>
        ) : null}
        {showTimeRange ? (
          <div
            data-section="log-stream-time-range"
            className="flex items-center gap-1 text-xs"
          >
            <label
              data-section="log-stream-time-range-start-label"
              className="text-muted-foreground"
            >
              From
            </label>
            <input
              type="datetime-local"
              value={
                typeof effectiveRange.start === 'string'
                  ? effectiveRange.start
                  : ''
              }
              onChange={(e) =>
                handleRangeChange('start', e.target.value)
              }
              aria-label="Filter logs after"
              data-section="log-stream-time-range-start"
              className="h-7 rounded border border-border bg-background px-1 text-xs"
            />
            <label
              data-section="log-stream-time-range-end-label"
              className="text-muted-foreground"
            >
              To
            </label>
            <input
              type="datetime-local"
              value={
                typeof effectiveRange.end === 'string'
                  ? effectiveRange.end
                  : ''
              }
              onChange={(e) =>
                handleRangeChange('end', e.target.value)
              }
              aria-label="Filter logs before"
              data-section="log-stream-time-range-end"
              className="h-7 rounded border border-border bg-background px-1 text-xs"
            />
          </div>
        ) : null}
        <button
          type="button"
          data-section="log-stream-pause"
          aria-label={
            effectivePaused ? 'Resume stream' : 'Pause stream'
          }
          onClick={togglePaused}
          className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {effectivePaused ? (
            <Play aria-hidden="true" className="h-3 w-3" />
          ) : (
            <Pause aria-hidden="true" className="h-3 w-3" />
          )}
        </button>
        {showClear && onClear ? (
          <button
            type="button"
            data-section="log-stream-clear"
            aria-label="Clear log stream"
            onClick={onClear}
            className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Trash2 aria-hidden="true" className="h-3 w-3" />
          </button>
        ) : null}
      </div>

      <div
        ref={setRefs}
        data-section="log-stream-list"
        style={{ maxHeight: maxHeightStyle }}
        className="overflow-auto rounded bg-muted/20 font-mono text-xs"
      >
        {filtered.length === 0 ? (
          <div
            data-section="log-stream-empty"
            className="px-3 py-6 text-center text-muted-foreground"
          >
            {emptyState}
          </div>
        ) : (
          <ul
            data-section="log-stream-entries"
            className="flex flex-col"
          >
            {filtered.map((entry) => {
              const segments = parseAnsi(entry.message);
              return (
                <li
                  key={entry.id}
                  data-section="log-stream-entry"
                  data-entry-id={entry.id}
                  data-level={entry.level}
                  className={cn(
                    'flex items-baseline gap-2 border-b border-border/30 px-2 py-1 last:border-b-0',
                  )}
                >
                  <span
                    data-section="log-stream-entry-time"
                    className="text-muted-foreground"
                  >
                    {formatLogTimestamp(entry.timestamp)}
                  </span>
                  <span
                    data-section="log-stream-entry-level"
                    className={cn(
                      'shrink-0 rounded border px-1 text-[10px] font-semibold uppercase tracking-wide',
                      getLogLevelClass(entry.level),
                    )}
                  >
                    {entry.level}
                  </span>
                  {entry.component !== undefined ? (
                    <span
                      data-section="log-stream-entry-component"
                      className="shrink-0 text-primary"
                    >
                      [{entry.component}]
                    </span>
                  ) : null}
                  <span
                    data-section="log-stream-entry-message"
                    className="flex-1 whitespace-pre-wrap break-words"
                  >
                    {segments.map((seg, idx) => (
                      <span
                        key={`s-${idx}`}
                        data-section="log-stream-entry-segment"
                        style={{
                          ...(seg.fgColor ? { color: seg.fgColor } : {}),
                          ...(seg.bgColor
                            ? { backgroundColor: seg.bgColor }
                            : {}),
                          ...(seg.bold
                            ? { fontWeight: 'bold' }
                            : {}),
                          ...(seg.italic
                            ? { fontStyle: 'italic' }
                            : {}),
                          ...(seg.underline
                            ? { textDecoration: 'underline' }
                            : {}),
                          ...(seg.dim ? { opacity: 0.7 } : {}),
                        }}
                      >
                        {highlightLogMatches(
                          seg.text,
                          effectiveQuery,
                        )}
                      </span>
                    ))}
                  </span>
                  {entry.source !== undefined ? (
                    <span
                      data-section="log-stream-entry-source"
                      className="shrink-0 text-muted-foreground"
                    >
                      {entry.source}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
});

LogStream.displayName = 'LogStream';
