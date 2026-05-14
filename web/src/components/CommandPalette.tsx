import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from 'react';
import {
  HelpCircle,
  LogOut,
  RefreshCw,
  Search,
  Settings,
  Star,
  SunMoon,
} from 'lucide-react';
import { EmptyState, Kbd } from './ui';
import { Chip } from './ui/chip';
import { cn } from '../lib/cn';
import { useEscapeToClose } from '../lib/use-escape-to-close';
import { useTheme, type Theme } from '../hooks/use-theme';
import { getBinding, useBindings } from '../lib/keyboard-bindings';
import {
  SECTION_ORDER,
  buildPaletteCommands,
  filterCommands,
  type CommandContext,
  type CommandSection,
  type PaletteCommand,
} from './command-palette/commands';

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  ctx?: CommandContext;
  commands?: readonly PaletteCommand[];
}

export const RECENT_STORAGE_KEY = 'cmdk:recent';
export const RECENT_MAX = 5;
export const FAVORITES_STORAGE_KEY = 'c4:cmdk:favorites';
export const SHORTCUTS_OPEN_EVENT = 'c4:shortcuts-open';

function loadRecent(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((s): s is string => typeof s === 'string' && s.length > 0)
      .slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

function saveRecent(ids: readonly string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      RECENT_STORAGE_KEY,
      JSON.stringify(ids.slice(0, RECENT_MAX)),
    );
  } catch {
    // quota / disabled storage -- swallow.
  }
}

function loadFavorites(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((s): s is string => typeof s === 'string' && s.length > 0);
  } catch {
    return [];
  }
}

function saveFavorites(ids: readonly string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      FAVORITES_STORAGE_KEY,
      JSON.stringify(ids),
    );
  } catch {
    // quota / disabled storage -- swallow.
  }
}

// Wraps the characters of `label` that match `query` in <span
// className="font-semibold">.
export function highlightLabel(label: string, query: string): ReactNode {
  const q = (query || '').trim();
  if (!q || !label) return label;
  const ql = q.toLowerCase();
  const ll = label.toLowerCase();
  const idx = ll.indexOf(ql);
  if (idx >= 0) {
    return (
      <>
        {label.slice(0, idx)}
        <span className="font-semibold">{label.slice(idx, idx + q.length)}</span>
        {label.slice(idx + q.length)}
      </>
    );
  }
  const parts: ReactNode[] = [];
  let buffer = '';
  let qi = 0;
  for (let i = 0; i < label.length; i++) {
    const ch = label.charAt(i);
    if (qi < ql.length && ch.toLowerCase() === ql.charAt(qi)) {
      if (buffer) {
        parts.push(buffer);
        buffer = '';
      }
      parts.push(
        <span key={i} className="font-semibold">
          {ch}
        </span>,
      );
      qi += 1;
    } else {
      buffer += ch;
    }
  }
  if (qi < ql.length) return label;
  if (buffer) parts.push(buffer);
  return (
    <>
      {parts.map((p, i) =>
        typeof p === 'string' ? <Fragment key={`t${i}`}>{p}</Fragment> : p,
      )}
    </>
  );
}

type SectionLabel = CommandSection | 'Recent' | 'Favorites' | 'Actions';

interface SectionGroup {
  section: SectionLabel;
  items: PaletteCommand[];
}

type PaletteMode = 'nav' | 'action';

const THEME_CYCLE: Theme[] = ['system', 'light', 'dark'];

function buildActionCommands(
  ctx: CommandContext,
  onClose: () => void,
  currentTheme: Theme,
  setTheme: (t: Theme) => void,
): PaletteCommand[] {
  return [
    {
      id: 'action:quit',
      label: 'Quit',
      shortcut: 'q',
      section: 'Navigate',
      Icon: LogOut,
      run: () => {
        onClose();
      },
    },
    {
      id: 'action:reload',
      label: 'Reload',
      shortcut: 'r',
      section: 'Navigate',
      Icon: RefreshCw,
      run: () => {
        if (typeof window !== 'undefined') {
          window.location.reload();
        }
      },
    },
    {
      id: 'action:toggle-theme',
      label: 'Toggle theme',
      shortcut: getBinding('toggleTheme'),
      section: 'Navigate',
      Icon: SunMoon,
      run: () => {
        const i = THEME_CYCLE.indexOf(currentTheme);
        const next = THEME_CYCLE[(i + 1) % THEME_CYCLE.length] ?? 'system';
        setTheme(next);
      },
    },
    {
      id: 'action:open-settings',
      label: 'Open Settings',
      shortcut: 's',
      section: 'Navigate',
      Icon: Settings,
      run: () => {
        ctx.navigateTopView?.('settings');
      },
    },
    {
      id: 'action:show-shortcuts',
      label: 'Show shortcuts',
      shortcut: getBinding('help'),
      section: 'Navigate',
      Icon: HelpCircle,
      run: () => {
        if (typeof window === 'undefined') return;
        try {
          window.dispatchEvent(new CustomEvent(SHORTCUTS_OPEN_EVENT));
        } catch {
          // non-browser test env
        }
      },
    },
  ];
}

export default function CommandPalette({
  open,
  onClose,
  ctx,
  commands: providedCommands,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [recent, setRecent] = useState<string[]>(() => loadRecent());
  const [favorites, setFavorites] = useState<string[]>(() => loadFavorites());
  const inputRef = useRef<HTMLInputElement>(null);
  const { theme, setTheme } = useTheme();
  const bindings = useBindings();

  const mode: PaletteMode = query.startsWith('>') ? 'action' : 'nav';
  const effectiveQuery = mode === 'action' ? query.slice(1) : query;

  const navBuilt = useMemo(
    () => providedCommands ?? buildPaletteCommands(ctx ?? {}),
    [providedCommands, ctx],
  );
  const actionBuilt = useMemo(
    () => buildActionCommands(ctx ?? {}, onClose, theme, setTheme),
    // bindings is intentionally a dep so the displayed shortcut updates
    // when the user remaps via the Keyboard Remap page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx, onClose, theme, setTheme, bindings],
  );

  const built = mode === 'action' ? actionBuilt : navBuilt;

  const filtered = useMemo(
    () => filterCommands(built, effectiveQuery, recent),
    [built, effectiveQuery, recent],
  );

  const sections = useMemo<SectionGroup[]>(() => {
    if (mode === 'action') {
      if (filtered.length === 0) return [];
      return [{ section: 'Actions', items: filtered }];
    }
    const byKey: Record<CommandSection, PaletteCommand[]> = {
      Navigate: [],
      Workers: [],
      Queue: [],
    };
    for (const c of filtered) byKey[c.section].push(c);
    const regular: SectionGroup[] = SECTION_ORDER
      .map((s) => ({ section: s as SectionLabel, items: byKey[s] }))
      .filter((g) => g.items.length > 0);

    const showPinned = effectiveQuery.trim().length === 0;
    const out: SectionGroup[] = [];
    const consumed = new Set<string>();

    if (showPinned && favorites.length > 0) {
      const byId = new Map(built.map((c) => [c.id, c]));
      const favItems = favorites
        .map((id) => byId.get(id))
        .filter((c): c is PaletteCommand => Boolean(c));
      if (favItems.length > 0) {
        out.push({ section: 'Favorites', items: favItems });
        favItems.forEach((c) => consumed.add(c.id));
      }
    }

    if (showPinned && recent.length > 0) {
      const byId = new Map(built.map((c) => [c.id, c]));
      const recentItems = recent
        .map((id) => byId.get(id))
        .filter((c): c is PaletteCommand => Boolean(c) && !consumed.has(c!.id));
      if (recentItems.length > 0) {
        out.push({ section: 'Recent', items: recentItems });
        recentItems.forEach((c) => consumed.add(c.id));
      }
    }

    const deduped = regular
      .map((g) => ({
        section: g.section,
        items: g.items.filter((c) => !consumed.has(c.id)),
      }))
      .filter((g) => g.items.length > 0);

    return [...out, ...deduped];
  }, [mode, filtered, built, effectiveQuery, recent, favorites]);

  const flat = useMemo(() => sections.flatMap((g) => g.items), [sections]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
    setRecent(loadRecent());
    setFavorites(loadFavorites());
    const id = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEscapeToClose({ open, onClose });

  const recordRecent = useCallback((id: string) => {
    setRecent((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, RECENT_MAX);
      saveRecent(next);
      return next;
    });
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((prev) => {
      const next = prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id];
      saveFavorites(next);
      return next;
    });
  }, []);

  const activate = useCallback(
    (cmd: PaletteCommand) => {
      recordRecent(cmd.id);
      void cmd.run();
      onClose();
    },
    [recordRecent, onClose],
  );

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, Math.max(0, flat.length - 1)));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
      } else if (e.key === 'Enter') {
        if (flat.length === 0) return;
        e.preventDefault();
        const cmd = flat[Math.max(0, Math.min(activeIndex, flat.length - 1))];
        if (cmd) activate(cmd);
      }
    },
    [activeIndex, flat, activate],
  );

  if (!open) return null;

  let runningIndex = -1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      data-command-palette
      onClick={onClose}
      onKeyDown={onKeyDown}
      className={cn(
        'fixed inset-0 z-50 flex items-start justify-center bg-background/80 p-4 pt-[15vh] backdrop-blur',
        'motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150',
      )}
    >
      <div
        data-command-panel
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'w-full max-w-lg overflow-hidden rounded-lg border border-border bg-card shadow-lg',
          'motion-safe:animate-in motion-safe:slide-in-from-top-2 motion-safe:duration-150',
        )}
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Search
            aria-hidden="true"
            className="h-4 w-4 shrink-0 text-muted-foreground"
          />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={mode === 'action' ? 'Run an action...' : 'Search commands...'}
            aria-label="Search commands"
            data-command-input
            className="h-9 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:outline-none"
          />
          <Chip
            data-command-mode
            size="sm"
            variant={mode === 'action' ? 'solid' : 'subtle'}
            tone={mode === 'action' ? 'primary' : 'neutral'}
            aria-label={`Mode: ${mode === 'action' ? 'Action' : 'Nav'}`}
          >
            {mode === 'action' ? 'Action' : 'Nav'}
          </Chip>
        </div>
        <div
          role="listbox"
          aria-label="Commands"
          className="max-h-[60vh] overflow-y-auto py-1"
        >
          {sections.length === 0 ? (
            <div className="p-3">
              <EmptyState
                title="No matching commands"
                description="Try a different search term."
              />
            </div>
          ) : (
            sections.map((g) => (
              <div key={g.section} data-section={g.section}>
                <div
                  data-section-header
                  className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {g.section}
                </div>
                {g.items.map((cmd) => {
                  runningIndex += 1;
                  const idx = runningIndex;
                  const active = idx === activeIndex;
                  const Icon = cmd.Icon;
                  const isFav = favorites.includes(cmd.id);
                  return (
                    <button
                      key={`${g.section}:${cmd.id}`}
                      type="button"
                      role="option"
                      aria-selected={active}
                      data-command-id={cmd.id}
                      onClick={() => activate(cmd)}
                      onMouseEnter={() => setActiveIndex(idx)}
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                        active
                          ? 'bg-accent text-accent-foreground'
                          : 'text-foreground hover:bg-accent/40',
                      )}
                    >
                      <Icon
                        aria-hidden="true"
                        className="h-4 w-4 shrink-0 text-muted-foreground"
                      />
                      <span className="flex-1 truncate">
                        {highlightLabel(cmd.label, effectiveQuery)}
                      </span>
                      {cmd.shortcut ? (
                        <Kbd
                          data-command-shortcut
                          className="border-border py-0.5"
                        >
                          {cmd.shortcut}
                        </Kbd>
                      ) : null}
                      <span
                        role="button"
                        tabIndex={-1}
                        data-command-favorite
                        aria-label={isFav ? `Unstar ${cmd.label}` : `Star ${cmd.label}`}
                        aria-pressed={isFav}
                        onClick={(e: ReactMouseEvent<HTMLSpanElement>) => {
                          e.stopPropagation();
                          toggleFavorite(cmd.id);
                        }}
                        className={cn(
                          'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground',
                          isFav && 'text-warning',
                        )}
                      >
                        <Star
                          aria-hidden="true"
                          className={cn(
                            'h-4 w-4',
                            isFav && 'fill-current',
                          )}
                        />
                      </span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
