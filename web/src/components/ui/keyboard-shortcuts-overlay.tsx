import {
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
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { getPortalRoot } from '../../lib/portal-root';

// (v1.11.447, TODO 11.429) KeyboardShortcutsOverlay primitive.
//
// Modal panel listing shortcuts grouped by category, with a
// platform-aware key display, an opt-in search filter, and a
// configurable trigger combo (`Cmd+/` on Mac, `Ctrl+/`
// elsewhere by default). Each shortcut's key combo is rendered
// as a sequence of `<kbd>` chips wrapped in a `<dt>` /
// `<dd>` pair so screen readers can announce the action label
// alongside the keys.
//
// Reference: /root/c4/arps-design-system-v1/.

export type KeyboardPlatform = 'mac' | 'windows' | 'linux' | 'auto';

export interface KeyboardShortcut {
  id: string;
  keys: string;
  label: string;
  description?: string;
  category?: string;
}

export interface KeyboardShortcutsOverlayProps {
  shortcuts: KeyboardShortcut[];
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  triggerShortcut?: string;
  showSearch?: boolean;
  searchPlaceholder?: string;
  categoryOrder?: readonly string[];
  platform?: KeyboardPlatform;
  containerId?: string;
  ariaLabel?: string;
  emptyState?: ReactNode;
  closeOnEscape?: boolean;
  closeOnBackdropClick?: boolean;
  className?: string;
  panelClassName?: string;
  defaultCategory?: string;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export const DEFAULT_KEYBOARD_TRIGGER_SHORTCUT = 'mod+/';
export const DEFAULT_KEYBOARD_DEFAULT_CATEGORY = 'General';

// Cheap platform sniff. Tests can pass `platform` explicitly so
// they do not depend on `navigator`.
export function detectPlatform(): KeyboardPlatform {
  if (typeof navigator === 'undefined') return 'linux';
  const ua = `${navigator.platform || ''} ${navigator.userAgent || ''}`;
  if (/Mac|iPhone|iPad|iPod/i.test(ua)) return 'mac';
  if (/Win/i.test(ua)) return 'windows';
  return 'linux';
}

export function resolvePlatform(
  platform: KeyboardPlatform | undefined,
): Exclude<KeyboardPlatform, 'auto'> {
  if (!platform || platform === 'auto') {
    const detected = detectPlatform();
    return detected === 'auto' ? 'linux' : detected;
  }
  return platform;
}

export function getModKeyLabel(
  platform: KeyboardPlatform,
): string {
  const resolved = resolvePlatform(platform);
  return resolved === 'mac' ? 'Cmd' : 'Ctrl';
}

export function getAltKeyLabel(
  platform: KeyboardPlatform,
): string {
  const resolved = resolvePlatform(platform);
  return resolved === 'mac' ? 'Option' : 'Alt';
}

export function getShiftKeyLabel(): string {
  return 'Shift';
}

const ARROW_LABELS: Record<string, string> = {
  arrowup: 'Up',
  arrowdown: 'Down',
  arrowleft: 'Left',
  arrowright: 'Right',
};

export function parseShortcutString(str: string): string[] {
  if (!str) return [];
  return str
    .split('+')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function formatKeyLabel(
  key: string,
  platform: KeyboardPlatform = 'auto',
): string {
  const k = key.trim().toLowerCase();
  if (!k) return '';
  if (k === 'mod' || k === 'cmd' || k === 'meta') {
    return getModKeyLabel(platform);
  }
  if (k === 'ctrl' || k === 'control') {
    return resolvePlatform(platform) === 'mac' ? 'Ctrl' : 'Ctrl';
  }
  if (k === 'alt' || k === 'option' || k === 'opt') {
    return getAltKeyLabel(platform);
  }
  if (k === 'shift') return getShiftKeyLabel();
  if (k === 'esc' || k === 'escape') return 'Esc';
  if (k === 'enter' || k === 'return') return 'Enter';
  if (k === 'space' || k === ' ') return 'Space';
  if (k === 'tab') return 'Tab';
  if (k === 'backspace') return 'Backspace';
  if (k === 'delete' || k === 'del') return 'Delete';
  if (ARROW_LABELS[k] !== undefined) return ARROW_LABELS[k]!;
  if (k.length === 1) return k.toUpperCase();
  // Title-case fallback
  return k.charAt(0).toUpperCase() + k.slice(1);
}

export function formatShortcut(
  shortcut: string,
  platform: KeyboardPlatform = 'auto',
): string[] {
  return parseShortcutString(shortcut).map((k) =>
    formatKeyLabel(k, platform),
  );
}

// Match a KeyboardEvent against a shortcut string like 'mod+/'.
// `mod` resolves to metaKey on mac, ctrlKey otherwise.
export function matchesShortcut(
  event: KeyboardEvent | ReactKeyboardEvent<unknown>,
  shortcut: string,
  platform: KeyboardPlatform = 'auto',
): boolean {
  const tokens = parseShortcutString(shortcut).map((t) =>
    t.toLowerCase(),
  );
  if (tokens.length === 0) return false;
  let wantsMod = false;
  let wantsCtrl = false;
  let wantsAlt = false;
  let wantsShift = false;
  let wantsKey: string | null = null;
  for (const token of tokens) {
    if (token === 'mod' || token === 'cmd' || token === 'meta') {
      wantsMod = true;
    } else if (token === 'ctrl' || token === 'control') {
      wantsCtrl = true;
    } else if (
      token === 'alt' ||
      token === 'option' ||
      token === 'opt'
    ) {
      wantsAlt = true;
    } else if (token === 'shift') {
      wantsShift = true;
    } else {
      wantsKey = token;
    }
  }
  if (!wantsKey) return false;
  const resolved = resolvePlatform(platform);
  const modPressed =
    resolved === 'mac' ? event.metaKey : event.ctrlKey;
  if (wantsMod && !modPressed) return false;
  if (!wantsMod && modPressed && resolved === 'mac') {
    // exclude bare keypresses that also pressed Cmd on mac
    return false;
  }
  if (wantsCtrl && !event.ctrlKey) return false;
  if (wantsAlt && !event.altKey) return false;
  if (wantsShift && !event.shiftKey) return false;
  if (!wantsAlt && event.altKey) return false;
  if (!wantsShift && event.shiftKey) return false;
  return event.key.toLowerCase() === wantsKey;
}

export function filterShortcuts(
  shortcuts: readonly KeyboardShortcut[],
  query: string,
): KeyboardShortcut[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [...shortcuts];
  return shortcuts.filter((s) => {
    if (s.label.toLowerCase().includes(trimmed)) return true;
    if (s.description?.toLowerCase().includes(trimmed)) return true;
    if (s.category?.toLowerCase().includes(trimmed)) return true;
    if (s.keys.toLowerCase().includes(trimmed)) return true;
    return false;
  });
}

export function groupShortcuts(
  shortcuts: readonly KeyboardShortcut[],
  categoryOrder: readonly string[] = [],
  defaultCategory: string = DEFAULT_KEYBOARD_DEFAULT_CATEGORY,
): Array<{ category: string; shortcuts: KeyboardShortcut[] }> {
  const buckets = new Map<string, KeyboardShortcut[]>();
  for (const s of shortcuts) {
    const cat = s.category ?? defaultCategory;
    const bucket = buckets.get(cat);
    if (bucket) bucket.push(s);
    else buckets.set(cat, [s]);
  }
  const orderedKeys = new Set<string>();
  const out: Array<{
    category: string;
    shortcuts: KeyboardShortcut[];
  }> = [];
  for (const key of categoryOrder) {
    const list = buckets.get(key);
    if (list) {
      out.push({ category: key, shortcuts: list });
      orderedKeys.add(key);
    }
  }
  for (const [key, list] of buckets) {
    if (!orderedKeys.has(key)) {
      out.push({ category: key, shortcuts: list });
    }
  }
  return out;
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export const KeyboardShortcutsOverlay = forwardRef(
  function KeyboardShortcutsOverlay(
    {
      shortcuts,
      open: openProp,
      defaultOpen = false,
      onOpenChange,
      triggerShortcut = DEFAULT_KEYBOARD_TRIGGER_SHORTCUT,
      showSearch = true,
      searchPlaceholder = 'Search shortcuts...',
      categoryOrder = [],
      platform = 'auto',
      containerId = 'app-portal-root',
      ariaLabel = 'Keyboard shortcuts',
      emptyState = 'No matching shortcuts',
      closeOnEscape = true,
      closeOnBackdropClick = true,
      className,
      panelClassName,
      defaultCategory = DEFAULT_KEYBOARD_DEFAULT_CATEGORY,
    }: KeyboardShortcutsOverlayProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const isControlled = openProp !== undefined;
    const [internalOpen, setInternalOpen] = useState<boolean>(
      defaultOpen,
    );
    const effectiveOpen = isControlled
      ? !!openProp
      : internalOpen;

    const onOpenChangeRef = useRef(onOpenChange);
    useEffect(() => {
      onOpenChangeRef.current = onOpenChange;
    }, [onOpenChange]);

    const emitOpen = useCallback(
      (next: boolean) => {
        if (!isControlled) setInternalOpen(next);
        onOpenChangeRef.current?.(next);
      },
      [isControlled],
    );

    const resolvedPlatform = useMemo(
      () => resolvePlatform(platform),
      [platform],
    );

    // Global trigger listener (Cmd+/ default)
    useEffect(() => {
      if (typeof window === 'undefined') return undefined;
      const onKeyDown = (event: KeyboardEvent) => {
        if (matchesShortcut(event, triggerShortcut, resolvedPlatform)) {
          event.preventDefault();
          emitOpen(!effectiveOpen);
        }
      };
      window.addEventListener('keydown', onKeyDown);
      return () => {
        window.removeEventListener('keydown', onKeyDown);
      };
    }, [emitOpen, effectiveOpen, resolvedPlatform, triggerShortcut]);

    const [query, setQuery] = useState<string>('');
    useEffect(() => {
      // Reset the search every time the overlay opens so users
      // do not see stale filter state from a previous session.
      if (effectiveOpen) setQuery('');
    }, [effectiveOpen]);

    const filtered = useMemo(
      () => filterShortcuts(shortcuts, query),
      [query, shortcuts],
    );

    const grouped = useMemo(
      () => groupShortcuts(filtered, categoryOrder, defaultCategory),
      [categoryOrder, defaultCategory, filtered],
    );

    const onKeyDownPanel = useCallback(
      (event: ReactKeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Escape' && closeOnEscape) {
          event.preventDefault();
          emitOpen(false);
        }
      },
      [closeOnEscape, emitOpen],
    );

    const onQueryChange = useCallback(
      (event: ChangeEvent<HTMLInputElement>) => {
        setQuery(event.target.value);
      },
      [],
    );

    const [portalTarget, setPortalTarget] =
      useState<HTMLElement | null>(null);
    useEffect(() => {
      if (!effectiveOpen) {
        setPortalTarget(null);
        return undefined;
      }
      setPortalTarget(getPortalRoot(containerId));
      return undefined;
    }, [containerId, effectiveOpen]);

    if (!effectiveOpen || !portalTarget) return null;

    const triggerLabel = formatShortcut(
      triggerShortcut,
      resolvedPlatform,
    );

    return createPortal(
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        data-section="keyboard-shortcuts-overlay"
        data-platform={resolvedPlatform}
        data-shortcut-count={shortcuts.length}
        data-trigger={triggerShortcut}
        onKeyDown={onKeyDownPanel}
        onClick={(event) => {
          if (
            closeOnBackdropClick &&
            event.target === event.currentTarget
          ) {
            emitOpen(false);
          }
        }}
        className={cn(
          'fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-6 outline-none',
          className,
        )}
      >
        <div
          data-section="keyboard-shortcuts-overlay-panel"
          className={cn(
            'flex max-h-[80vh] w-full max-w-2xl flex-col gap-3 overflow-hidden rounded-md border border-border bg-popover p-4 text-popover-foreground shadow-xl',
            panelClassName,
          )}
        >
          <div
            data-section="keyboard-shortcuts-overlay-header"
            className="flex items-center justify-between gap-2"
          >
            <div className="flex items-center gap-2">
              <h2
                data-section="keyboard-shortcuts-overlay-title"
                className="text-base font-semibold"
              >
                {ariaLabel}
              </h2>
              <span
                aria-hidden="true"
                data-section="keyboard-shortcuts-overlay-trigger-hint"
                className="hidden items-center gap-1 text-xs text-muted-foreground sm:inline-flex"
              >
                {triggerLabel.map((label, idx) => (
                  <kbd
                    key={`${label}-${idx}`}
                    data-section="keyboard-shortcuts-overlay-trigger-key"
                    className="rounded border border-border bg-muted px-1 font-mono text-[10px]"
                  >
                    {label}
                  </kbd>
                ))}
              </span>
            </div>
            <button
              type="button"
              data-section="keyboard-shortcuts-overlay-close"
              aria-label="Close shortcuts overlay"
              onClick={() => emitOpen(false)}
              className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
          {showSearch ? (
            <div
              data-section="keyboard-shortcuts-overlay-search"
              className="flex items-center gap-2 rounded border border-border bg-background px-2"
            >
              <Search
                aria-hidden="true"
                className="h-4 w-4 text-muted-foreground"
              />
              <input
                type="text"
                value={query}
                onChange={onQueryChange}
                placeholder={searchPlaceholder}
                aria-label="Filter shortcuts"
                data-section="keyboard-shortcuts-overlay-search-input"
                className="h-9 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
          ) : null}
          <div
            data-section="keyboard-shortcuts-overlay-grid"
            className="grid flex-1 grid-cols-1 gap-4 overflow-y-auto md:grid-cols-2"
          >
            {grouped.length === 0 ? (
              <div
                data-section="keyboard-shortcuts-overlay-empty"
                className="col-span-full px-3 py-6 text-center text-sm text-muted-foreground"
              >
                {emptyState}
              </div>
            ) : (
              grouped.map(({ category, shortcuts: list }) => (
                <section
                  key={category}
                  data-section="keyboard-shortcuts-overlay-category"
                  data-category={category}
                  className="flex flex-col gap-2"
                >
                  <h3
                    data-section="keyboard-shortcuts-overlay-category-title"
                    className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    {category}
                  </h3>
                  <dl
                    data-section="keyboard-shortcuts-overlay-list"
                    className="flex flex-col gap-1"
                  >
                    {list.map((s) => {
                      const keyLabels = formatShortcut(
                        s.keys,
                        resolvedPlatform,
                      );
                      return (
                        <div
                          key={s.id}
                          data-section="keyboard-shortcuts-overlay-shortcut"
                          data-shortcut-id={s.id}
                          className="flex items-start justify-between gap-3 rounded border border-transparent px-2 py-1 text-sm hover:bg-muted/40"
                        >
                          <dt
                            data-section="keyboard-shortcuts-overlay-shortcut-label"
                            className="flex flex-1 flex-col text-foreground"
                          >
                            <span>{s.label}</span>
                            {s.description !== undefined ? (
                              <span
                                data-section="keyboard-shortcuts-overlay-shortcut-description"
                                className="text-xs text-muted-foreground"
                              >
                                {s.description}
                              </span>
                            ) : null}
                          </dt>
                          <dd
                            data-section="keyboard-shortcuts-overlay-shortcut-keys"
                            className="flex items-center gap-1"
                          >
                            {keyLabels.map((label, idx) => (
                              <kbd
                                key={`${label}-${idx}`}
                                data-section="keyboard-shortcuts-overlay-key"
                                className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs"
                              >
                                {label}
                              </kbd>
                            ))}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                </section>
              ))
            )}
          </div>
        </div>
      </div>,
      portalTarget,
    );
  },
);

KeyboardShortcutsOverlay.displayName = 'KeyboardShortcutsOverlay';
