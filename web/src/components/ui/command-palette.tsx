import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Search } from 'lucide-react';
import { cn } from '../../lib/cn';
import { getPortalRoot } from '../../lib/portal-root';
import { useFocusTrap } from '../../hooks/use-focus-trap';
import { motionClass } from '../../lib/motion';
import { useReducedMotion } from '../../hooks/use-reduced-motion';

// (v1.11.295, TODO 11.277) Command palette -- Cmd+K (or Ctrl+K)
// global launcher with fuzzy search, recent commands, and
// optional scoped command groups.
//
// Usage:
//   const [open, setOpen] = useState(false);
//   useCommandPaletteShortcut(() => setOpen((v) => !v));
//   <CommandPalette
//     open={open}
//     onOpenChange={setOpen}
//     commands={[
//       { id: 'go.workers', label: 'Go to Workers', group: 'Navigate',
//         shortcut: 'g w', action: () => setTopView('workers') },
//       ...
//     ]}
//   />
//
// The primitive is intentionally minimal: it does not render its
// own trigger button (most apps wire the shortcut globally) and
// it does not fetch commands -- the host supplies them. Recent
// commands are persisted in localStorage under `recentsKey` (or
// `c4:command-palette:recents` by default), capped to the most
// recent 5 invocations, and surfaced in their own group when no
// query is typed.

export interface Command {
  id: string;
  label: ReactNode;
  // Optional group name -- commands with the same group are
  // rendered under one heading. When omitted, the command falls
  // into the implicit "Other" group.
  group?: string;
  // Optional shorter hint string (e.g. "g w" for the chord
  // shortcut, or "Settings").
  shortcut?: string;
  // Optional keyword list that the filter also matches against.
  // Useful for synonyms ("logout" -> sign out).
  keywords?: string[];
  // Optional disabled state. Disabled commands stay visible but
  // are skipped by arrow nav and ignored by Enter.
  disabled?: boolean;
  // Required action handler. The palette closes itself after the
  // command runs. Throw inside the action to surface an error to
  // the host's error boundary; the palette will still close.
  action: () => void;
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  commands: Command[];
  searchPlaceholder?: string;
  // Recent-commands group label. Defaults to "Recent".
  recentsLabel?: string;
  // localStorage key for persisting recents. Defaults to
  // `c4:command-palette:recents`.
  recentsKey?: string;
  // Maximum number of recent commands to track. Defaults to 5.
  recentsCap?: number;
  // Empty-state copy. Defaults to "No matches.".
  emptyContent?: ReactNode;
  className?: string;
  'data-testid'?: string;
}

const DEFAULT_RECENTS_KEY = 'c4:command-palette:recents';
const DEFAULT_RECENTS_CAP = 5;

function readRecents(key: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string');
  } catch {
    return [];
  }
}

function writeRecents(key: string, ids: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    /* quota / disabled */
  }
}

// Tiny fuzzy match: every token in the query must appear (in
// order, but not contiguously) in the haystack. This keeps
// "stsv" -> "Status: Settings View" working without pulling in a
// dependency.
function fuzzyScore(query: string, haystack: string): number {
  if (!query) return 1;
  let qi = 0;
  let score = 0;
  let lastMatch = -1;
  for (let i = 0; i < haystack.length && qi < query.length; i += 1) {
    if (haystack[i] === query[qi]) {
      // Reward adjacency.
      if (lastMatch === i - 1) score += 2;
      else score += 1;
      lastMatch = i;
      qi += 1;
    }
  }
  if (qi < query.length) return 0;
  return score;
}

function commandHaystack(c: Command): string {
  const label = typeof c.label === 'string' ? c.label : c.id;
  const kw = c.keywords?.join(' ') ?? '';
  const group = c.group ?? '';
  return `${label} ${kw} ${group}`.toLowerCase();
}

interface GroupedCommands {
  group: string;
  commands: Command[];
}

function groupCommands(commands: Command[]): GroupedCommands[] {
  const map = new Map<string, Command[]>();
  for (const cmd of commands) {
    const g = cmd.group ?? 'Other';
    if (!map.has(g)) map.set(g, []);
    map.get(g)!.push(cmd);
  }
  return Array.from(map.entries()).map(([group, cmds]) => ({
    group,
    commands: cmds,
  }));
}

export function CommandPalette({
  open,
  onOpenChange,
  commands,
  searchPlaceholder = 'Type a command or search...',
  recentsLabel = 'Recent',
  recentsKey = DEFAULT_RECENTS_KEY,
  recentsCap = DEFAULT_RECENTS_CAP,
  emptyContent = 'No matches.',
  className,
  'data-testid': testId,
}: CommandPaletteProps) {
  const reducedMotion = useReducedMotion();
  const cardRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const inputId = useId();

  const [query, setQuery] = useState<string>('');
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [recents, setRecents] = useState<string[]>(() => readRecents(recentsKey));

  // Reset query + active index every time the palette opens.
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      setRecents(readRecents(recentsKey));
    }
  }, [open, recentsKey]);

  // Cross-tab sync for recents: when another tab writes a recent
  // command we mirror it here so the next open reflects the most
  // current shape.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== recentsKey) return;
      setRecents(readRecents(recentsKey));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [recentsKey]);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  useFocusTrap(cardRef, {
    active: open,
    initialFocusRef: inputRef,
    onEscape: close,
  });

  // Order: filtered groups first; if no query, recents appear as
  // a sticky first group.
  const visible = useMemo<GroupedCommands[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      // Build a recents group from the persisted ids (preserve
      // call order, skip ids that no longer exist).
      const byId = new Map(commands.map((c) => [c.id, c]));
      const recentList: Command[] = [];
      for (const id of recents) {
        const c = byId.get(id);
        if (c) recentList.push(c);
        if (recentList.length >= recentsCap) break;
      }
      const grouped = groupCommands(commands);
      if (recentList.length === 0) return grouped;
      return [
        { group: recentsLabel, commands: recentList },
        ...grouped,
      ];
    }
    // Filter + score.
    const scored = commands
      .map((c) => ({ c, s: fuzzyScore(q, commandHaystack(c)) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s);
    return groupCommands(scored.map((x) => x.c));
  }, [commands, query, recents, recentsLabel, recentsCap]);

  // Flat list of enabled commands for arrow nav. Re-derived
  // every render so the index math always lines up with what the
  // user sees.
  const flat = useMemo<Command[]>(() => {
    const out: Command[] = [];
    for (const g of visible) {
      for (const cmd of g.commands) {
        if (!cmd.disabled) out.push(cmd);
      }
    }
    return out;
  }, [visible]);

  // Clamp active index when the list shrinks (e.g. typing
  // narrows the result set).
  useEffect(() => {
    if (activeIndex >= flat.length) {
      setActiveIndex(Math.max(0, flat.length - 1));
    }
  }, [flat.length, activeIndex]);

  const runCommand = useCallback(
    (cmd: Command) => {
      if (cmd.disabled) return;
      // Record in recents (most-recent first, dedup).
      const next = [cmd.id, ...recents.filter((id) => id !== cmd.id)].slice(
        0,
        recentsCap,
      );
      setRecents(next);
      writeRecents(recentsKey, next);
      close();
      // Run after close so the trigger surface is restored
      // before any focus side-effect.
      queueMicrotask(() => {
        try {
          cmd.action();
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[CommandPalette] command action threw', err);
        }
      });
    },
    [recents, recentsCap, recentsKey, close],
  );

  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(flat.length - 1, i + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
      } else if (e.key === 'Home') {
        e.preventDefault();
        setActiveIndex(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setActiveIndex(Math.max(0, flat.length - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = flat[activeIndex];
        if (cmd) runCommand(cmd);
      }
    },
    [flat, activeIndex, runCommand],
  );

  // Scroll the active row into view when arrow nav moves past
  // the viewport.
  useEffect(() => {
    if (!open) return;
    const root = listRef.current;
    if (!root) return;
    const active = root.querySelector<HTMLElement>(
      `[data-command-active="true"]`,
    );
    if (active && typeof active.scrollIntoView === 'function') {
      active.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex, open]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  // Map flat command index -> render id so each row knows
  // whether it is the active row.
  const flatIds = new Set<string>();
  const idIndex = new Map<string, number>();
  for (let i = 0; i < flat.length; i += 1) {
    const cmd = flat[i];
    if (!cmd) continue;
    flatIds.add(cmd.id);
    idIndex.set(cmd.id, i);
  }

  const node = (
    <div
      data-command-palette-backdrop
      data-section="command-palette"
      className={cn(
        'fixed inset-0 z-[110] flex items-start justify-center bg-background/70 p-4 pt-[10vh] backdrop-blur-sm',
        motionClass('fadeIn', reducedMotion),
      )}
      onClick={close}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        tabIndex={-1}
        data-testid={testId}
        className={cn(
          'w-full max-w-xl rounded-lg border border-border bg-card shadow-xl outline-none',
          motionClass('scaleIn', reducedMotion),
          className,
        )}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Search
            aria-hidden="true"
            className="h-4 w-4 shrink-0 text-muted-foreground"
          />
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listboxId}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
            placeholder={searchPlaceholder}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            data-section="command-palette-input"
          />
        </div>
        <div
          ref={listRef}
          role="listbox"
          id={listboxId}
          aria-label="Commands"
          className="max-h-[60vh] overflow-y-auto py-1"
        >
          {flat.length === 0 ? (
            <div
              data-section="command-palette-empty"
              className="px-3 py-6 text-center text-xs text-muted-foreground"
            >
              {emptyContent}
            </div>
          ) : (
            visible.map((g) => (
              <div key={g.group} data-command-group={g.group}>
                <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {g.group}
                </div>
                <div>
                  {g.commands.map((cmd) => {
                    const i = idIndex.get(cmd.id);
                    const isActive = i === activeIndex;
                    return (
                      <button
                        key={cmd.id}
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        aria-disabled={cmd.disabled || undefined}
                        data-command-id={cmd.id}
                        data-command-active={isActive ? 'true' : 'false'}
                        disabled={cmd.disabled}
                        onMouseEnter={() => {
                          if (typeof i === 'number') setActiveIndex(i);
                        }}
                        onClick={() => runCommand(cmd)}
                        className={cn(
                          'flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm transition-colors',
                          cmd.disabled
                            ? 'cursor-not-allowed text-muted-foreground opacity-60'
                            : isActive
                              ? 'bg-accent text-accent-foreground'
                              : 'text-foreground hover:bg-muted',
                        )}
                      >
                        <span className="min-w-0 truncate">{cmd.label}</span>
                        {cmd.shortcut ? (
                          <kbd className="shrink-0 rounded border border-border bg-muted px-1 py-[1px] text-[10px] text-muted-foreground">
                            {cmd.shortcut}
                          </kbd>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );

  const target = getPortalRoot('dialog-root') ?? document.body;
  return createPortal(node, target);
}

CommandPalette.displayName = 'CommandPalette';

// (v1.11.295, TODO 11.277) Global Cmd+K / Ctrl+K listener that
// flips the palette open / closed. The hook does NOT manage the
// open state itself -- it just calls onToggle when the chord
// fires so the host owns the truth.
//
// The chord is gated while the user is typing into an input /
// textarea / contenteditable surface so a real Cmd+K keystroke
// in those fields (e.g., a chat composer's own override) wins.
// To opt out of the gate, pass `interceptInInputs: true`.
export function useCommandPaletteShortcut(
  onToggle: () => void,
  options?: { interceptInInputs?: boolean },
): void {
  const interceptInInputs = options?.interceptInInputs ?? false;
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      // Cmd+K on macOS, Ctrl+K elsewhere. Guard against the
      // synthetic-event shapes that some test runners produce
      // (e.target may be window itself; e.key may be missing).
      const key = typeof e.key === 'string' ? e.key.toLowerCase() : '';
      const isCmdK = (e.metaKey || e.ctrlKey) && key === 'k';
      if (!isCmdK) return;
      if (!interceptInInputs) {
        const target = e.target;
        if (target instanceof HTMLElement) {
          const tag = target.tagName.toLowerCase();
          if (
            tag === 'input' ||
            tag === 'textarea' ||
            target.isContentEditable === true
          ) {
            return;
          }
        }
      }
      e.preventDefault();
      onToggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onToggle, interceptInInputs]);
}
