import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  ForwardedRef,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
} from 'react';
import { cn } from '../../lib/cn';

// (v1.11.416, TODO 11.398) CmdHistory primitive.
//
// Terminal command history list with:
//   - Search box (case-insensitive substring match against command
//     + output + cwd).
//   - ANSI color rendering for the captured output (CSI SGR codes:
//     reset / bold / italic / underline / dim / 8-color fg + bg /
//     bright variants).
//   - Per-row copy-to-clipboard (command / output / both).
//   - Scroll restoration via opt-in `storageKey`.
//   - Keyboard navigation (ArrowDown / ArrowUp / Home / End / Enter
//     to select, focus moves with the active row).
//
// Reference: /root/c4/arps-design-system-v1/.

export interface CmdHistoryEntry {
  id: string;
  command: string;
  output?: string;
  timestamp?: number;
  exitCode?: number;
  durationMs?: number;
  cwd?: string;
}

export type CmdHistoryCopyTarget = 'command' | 'output' | 'both';

export interface CmdHistoryProps {
  entries: CmdHistoryEntry[];

  query?: string;
  defaultQuery?: string;
  onQueryChange?: (query: string) => void;

  selectedId?: string | null;
  defaultSelectedId?: string | null;
  onSelectedIdChange?: (id: string | null) => void;

  storageKey?: string;
  showTimestamps?: boolean;
  showExitCodes?: boolean;
  renderCommand?: (entry: CmdHistoryEntry) => ReactNode;

  onCopy?: (
    entry: CmdHistoryEntry,
    target: CmdHistoryCopyTarget,
  ) => void;

  ariaLabel?: string;
  className?: string;
  searchPlaceholder?: string;
  emptyLabel?: ReactNode;
}

// ---------------------------------------------------------------
// ANSI parser
// ---------------------------------------------------------------

export interface AnsiStyle {
  fg?: string;
  bg?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  dim?: boolean;
  inverse?: boolean;
  strikethrough?: boolean;
}

export interface AnsiSegment {
  text: string;
  style: AnsiStyle;
}

const ANSI_FG: Record<number, string> = {
  30: 'text-neutral-900',
  31: 'text-red-500',
  32: 'text-emerald-500',
  33: 'text-amber-500',
  34: 'text-blue-500',
  35: 'text-fuchsia-500',
  36: 'text-cyan-500',
  37: 'text-zinc-300',
  39: '',
  90: 'text-neutral-500',
  91: 'text-red-400',
  92: 'text-emerald-400',
  93: 'text-amber-400',
  94: 'text-blue-400',
  95: 'text-fuchsia-400',
  96: 'text-cyan-400',
  97: 'text-white',
};

const ANSI_BG: Record<number, string> = {
  40: 'bg-neutral-900',
  41: 'bg-red-500/30',
  42: 'bg-emerald-500/30',
  43: 'bg-amber-500/30',
  44: 'bg-blue-500/30',
  45: 'bg-fuchsia-500/30',
  46: 'bg-cyan-500/30',
  47: 'bg-zinc-300/30',
  49: '',
  100: 'bg-neutral-500/30',
  101: 'bg-red-400/30',
  102: 'bg-emerald-400/30',
  103: 'bg-amber-400/30',
  104: 'bg-blue-400/30',
  105: 'bg-fuchsia-400/30',
  106: 'bg-cyan-400/30',
  107: 'bg-white/20',
};

function applySgr(style: AnsiStyle, code: number): AnsiStyle {
  if (code === 0) return {};
  if (code === 1) return { ...style, bold: true };
  if (code === 2) return { ...style, dim: true };
  if (code === 3) return { ...style, italic: true };
  if (code === 4) return { ...style, underline: true };
  if (code === 7) return { ...style, inverse: true };
  if (code === 9) return { ...style, strikethrough: true };
  if (code === 22) return { ...style, bold: false, dim: false };
  if (code === 23) return { ...style, italic: false };
  if (code === 24) return { ...style, underline: false };
  if (code === 27) return { ...style, inverse: false };
  if (code === 29) return { ...style, strikethrough: false };
  if ((code >= 30 && code <= 39) || (code >= 90 && code <= 97)) {
    const next: AnsiStyle = { ...style };
    if (code === 39) {
      delete next.fg;
    } else {
      next.fg = ANSI_FG[code] ?? '';
    }
    return next;
  }
  if ((code >= 40 && code <= 49) || (code >= 100 && code <= 107)) {
    const next: AnsiStyle = { ...style };
    if (code === 49) {
      delete next.bg;
    } else {
      next.bg = ANSI_BG[code] ?? '';
    }
    return next;
  }
  return style;
}

const ANSI_PATTERN = /\x1b\[([0-9;]*)m/g;

export function parseAnsi(text: string): AnsiSegment[] {
  if (text === '') return [];
  const segments: AnsiSegment[] = [];
  let style: AnsiStyle = {};
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  // Reset regex state explicitly (defensive after iteration).
  ANSI_PATTERN.lastIndex = 0;
  while ((match = ANSI_PATTERN.exec(text)) !== null) {
    const start = match.index;
    if (start > lastIndex) {
      segments.push({
        text: text.slice(lastIndex, start),
        style,
      });
    }
    const params = match[1] ?? '';
    const codes = params.length === 0 ? [0] : params.split(';').map((n) => Number(n));
    for (const code of codes) {
      if (Number.isFinite(code)) {
        style = applySgr(style, code);
      }
    }
    lastIndex = start + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), style });
  }
  return segments;
}

export function ansiStyleToClassName(style: AnsiStyle): string {
  return cn(
    style.fg,
    style.bg,
    style.bold && 'font-bold',
    style.dim && 'opacity-60',
    style.italic && 'italic',
    style.underline && 'underline',
    style.strikethrough && 'line-through',
    style.inverse && 'invert',
  );
}

// ---------------------------------------------------------------
// Filter + helpers
// ---------------------------------------------------------------

export function filterCmdHistory(
  entries: CmdHistoryEntry[],
  query: string,
): CmdHistoryEntry[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed === '') return entries;
  return entries.filter((entry) => {
    if (entry.command.toLowerCase().includes(trimmed)) return true;
    if (entry.output && entry.output.toLowerCase().includes(trimmed))
      return true;
    if (entry.cwd && entry.cwd.toLowerCase().includes(trimmed))
      return true;
    return false;
  });
}

export function formatCmdHistoryClipboard(
  entry: CmdHistoryEntry,
  target: CmdHistoryCopyTarget,
): string {
  if (target === 'command') return entry.command;
  if (target === 'output') return entry.output ?? '';
  // both
  const parts: string[] = [entry.command];
  if (entry.output) parts.push('---', entry.output);
  return parts.join('\n');
}

function formatTimestamp(ts: number | undefined): string {
  if (ts === undefined) return '';
  const date = new Date(ts);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export const CmdHistory = forwardRef(function CmdHistory(
  {
    entries,
    query,
    defaultQuery = '',
    onQueryChange,
    selectedId,
    defaultSelectedId = null,
    onSelectedIdChange,
    storageKey,
    showTimestamps = true,
    showExitCodes = true,
    renderCommand,
    onCopy,
    ariaLabel = 'Command history',
    className,
    searchPlaceholder = 'Search history...',
    emptyLabel = 'No commands match',
  }: CmdHistoryProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const isQueryControlled = query !== undefined;
  const isSelectedControlled = selectedId !== undefined;

  const [internalQuery, setInternalQuery] = useState<string>(
    defaultQuery,
  );
  const effectiveQuery = isQueryControlled ? (query ?? '') : internalQuery;

  const [internalSelected, setInternalSelected] = useState<string | null>(
    defaultSelectedId,
  );
  const effectiveSelected = isSelectedControlled
    ? (selectedId ?? null)
    : internalSelected;

  const onQueryChangeRef = useRef(onQueryChange);
  const onSelectedChangeRef = useRef(onSelectedIdChange);
  const onCopyRef = useRef(onCopy);
  useEffect(() => {
    onQueryChangeRef.current = onQueryChange;
    onSelectedChangeRef.current = onSelectedIdChange;
    onCopyRef.current = onCopy;
  }, [onQueryChange, onSelectedIdChange, onCopy]);

  const updateQuery = useCallback(
    (next: string) => {
      if (!isQueryControlled) setInternalQuery(next);
      onQueryChangeRef.current?.(next);
    },
    [isQueryControlled],
  );

  const updateSelected = useCallback(
    (next: string | null) => {
      if (!isSelectedControlled) setInternalSelected(next);
      onSelectedChangeRef.current?.(next);
    },
    [isSelectedControlled],
  );

  const filtered = useMemo(
    () => filterCmdHistory(entries, effectiveQuery),
    [entries, effectiveQuery],
  );

  // Scroll restoration via opt-in storageKey.
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!storageKey) return;
    if (typeof window === 'undefined') return;
    const el = scrollRef.current;
    if (!el) return;
    try {
      const raw = window.localStorage.getItem(
        `cmd-history-scroll:${storageKey}`,
      );
      if (raw) {
        const val = Number(raw);
        if (Number.isFinite(val) && val >= 0) {
          el.scrollTop = val;
        }
      }
    } catch {
      // ignore localStorage failures
    }
  }, [storageKey]);

  const handleScroll = useCallback(() => {
    if (!storageKey) return;
    if (typeof window === 'undefined') return;
    const el = scrollRef.current;
    if (!el) return;
    try {
      window.localStorage.setItem(
        `cmd-history-scroll:${storageKey}`,
        String(el.scrollTop),
      );
    } catch {
      // ignore quota / privacy mode
    }
  }, [storageKey]);

  const moveSelection = useCallback(
    (delta: 1 | -1) => {
      if (filtered.length === 0) return;
      const currentIdx = effectiveSelected
        ? filtered.findIndex((e) => e.id === effectiveSelected)
        : -1;
      let nextIdx = currentIdx + delta;
      if (nextIdx < 0) nextIdx = 0;
      if (nextIdx >= filtered.length) nextIdx = filtered.length - 1;
      const next = filtered[nextIdx];
      if (!next) return;
      updateSelected(next.id);
    },
    [filtered, effectiveSelected, updateSelected],
  );

  const moveTo = useCallback(
    (target: 'first' | 'last') => {
      if (filtered.length === 0) return;
      const entry =
        target === 'first' ? filtered[0] : filtered[filtered.length - 1];
      if (!entry) return;
      updateSelected(entry.id);
    },
    [filtered, updateSelected],
  );

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          moveSelection(1);
          break;
        case 'ArrowUp':
          event.preventDefault();
          moveSelection(-1);
          break;
        case 'Home':
          event.preventDefault();
          moveTo('first');
          break;
        case 'End':
          event.preventDefault();
          moveTo('last');
          break;
        default:
          break;
      }
    },
    [moveSelection, moveTo],
  );

  const handleCopy = useCallback(
    async (
      entry: CmdHistoryEntry,
      target: CmdHistoryCopyTarget,
    ) => {
      const text = formatCmdHistoryClipboard(entry, target);
      onCopyRef.current?.(entry, target);
      if (
        typeof navigator !== 'undefined' &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === 'function'
      ) {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          // ignore clipboard failures -- onCopy is the reliable
          // side channel for tests / non-https hosts.
        }
      }
    },
    [],
  );

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      data-section="cmd-history"
      data-entry-count={entries.length}
      data-filtered-count={filtered.length}
      className={cn(
        'flex flex-col rounded-md border border-border bg-card font-mono text-xs',
        className,
      )}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <header
        data-section="cmd-history-header"
        className="flex items-center gap-2 border-b border-border px-2 py-1"
      >
        <input
          type="search"
          value={effectiveQuery}
          placeholder={searchPlaceholder}
          aria-label="Search command history"
          data-section="cmd-history-search"
          onChange={(e) => updateQuery(e.target.value)}
          className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-0.5 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
        <span
          data-section="cmd-history-counter"
          className="shrink-0 text-muted-foreground"
        >
          {filtered.length} / {entries.length}
        </span>
      </header>

      <div
        ref={scrollRef}
        data-section="cmd-history-scroll"
        onScroll={handleScroll}
        className="flex max-h-96 flex-col overflow-y-auto"
        role="list"
      >
        {filtered.length === 0 ? (
          <div
            data-section="cmd-history-empty"
            className="px-2 py-1 text-muted-foreground"
          >
            {emptyLabel}
          </div>
        ) : (
          filtered.map((entry) => {
            const isSelected = effectiveSelected === entry.id;
            return (
              <article
                key={entry.id}
                role="listitem"
                data-section="cmd-history-row"
                data-entry-id={entry.id}
                data-selected={isSelected ? 'true' : 'false'}
                data-exit-code={entry.exitCode ?? ''}
                aria-label={`Command: ${entry.command}`}
                onClick={() => updateSelected(entry.id)}
                className={cn(
                  'cursor-pointer border-b border-border/40 px-2 py-1 hover:bg-muted/40',
                  isSelected && 'bg-primary/10',
                )}
              >
                <header
                  data-section="cmd-history-row-header"
                  className="flex items-center gap-2"
                >
                  {showTimestamps && entry.timestamp !== undefined ? (
                    <span
                      data-section="cmd-history-timestamp"
                      className="shrink-0 tabular-nums text-muted-foreground"
                    >
                      {formatTimestamp(entry.timestamp)}
                    </span>
                  ) : null}
                  {showExitCodes && entry.exitCode !== undefined ? (
                    <span
                      data-section="cmd-history-exit-code"
                      data-status={
                        entry.exitCode === 0 ? 'ok' : 'fail'
                      }
                      className={cn(
                        'shrink-0 rounded px-1 tabular-nums',
                        entry.exitCode === 0
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-red-500/20 text-red-300',
                      )}
                    >
                      {entry.exitCode}
                    </span>
                  ) : null}
                  <span
                    data-section="cmd-history-command"
                    className="min-w-0 flex-1 truncate text-foreground"
                  >
                    {renderCommand ? renderCommand(entry) : entry.command}
                  </span>
                  <div
                    data-section="cmd-history-row-actions"
                    className="flex shrink-0 items-center gap-1"
                  >
                    <button
                      type="button"
                      aria-label="Copy command"
                      data-section="cmd-history-copy-command"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleCopy(entry, 'command');
                      }}
                      className="rounded px-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      Cmd
                    </button>
                    {entry.output ? (
                      <button
                        type="button"
                        aria-label="Copy output"
                        data-section="cmd-history-copy-output"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleCopy(entry, 'output');
                        }}
                        className="rounded px-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        Out
                      </button>
                    ) : null}
                    {entry.output ? (
                      <button
                        type="button"
                        aria-label="Copy both"
                        data-section="cmd-history-copy-both"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleCopy(entry, 'both');
                        }}
                        className="rounded px-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        All
                      </button>
                    ) : null}
                  </div>
                </header>
                {entry.cwd ? (
                  <div
                    data-section="cmd-history-cwd"
                    className="ml-2 text-muted-foreground"
                  >
                    cwd: {entry.cwd}
                  </div>
                ) : null}
                {entry.output ? (
                  <pre
                    data-section="cmd-history-output"
                    className="ml-2 mt-0.5 max-h-40 overflow-y-auto whitespace-pre-wrap text-zinc-300"
                  >
                    {parseAnsi(entry.output).map((segment, idx) => (
                      <span
                        key={idx}
                        data-section="cmd-history-output-segment"
                        className={ansiStyleToClassName(segment.style)}
                      >
                        {segment.text}
                      </span>
                    ))}
                  </pre>
                ) : null}
              </article>
            );
          })
        )}
      </div>
    </div>
  );
});

CmdHistory.displayName = 'CmdHistory';
