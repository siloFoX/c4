// (TODO 8.41) Minimal dropdown / popover menu primitive used by the
// sidebar AccountMenu. Deliberately small -- no portal, no animation,
// no submenu support. The trigger is a plain button passed in as
// children; the menu opens beneath / above the trigger and closes on
// click-outside, Escape, or item activation.
//
// Why not adopt @radix-ui/react-dropdown-menu? Two reasons: the rest
// of the UI primitive layer is hand-rolled (button.tsx, tooltip.tsx,
// card.tsx, etc.) so radix would be the only third-party UI dep, and
// the surface we need (one trigger, a flat item list) is small enough
// that ~200 lines of pure React keep the bundle lean.

import { t, useLocale } from '../../lib/i18n';
import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import type {
  KeyboardEvent,
  MutableRefObject,
  ReactElement,
  ReactNode,
  Ref,
  RefCallback,
} from 'react';
import { cn } from '../../lib/cn';

export type DropdownPlacement = 'top' | 'bottom';

export interface DropdownMenuItem {
  key: string;
  label: ReactNode;
  // Optional leading icon (lucide). Pass `undefined` for plain text rows.
  icon?: ReactNode;
  // Optional muted secondary text rendered to the right of the label.
  hint?: ReactNode;
  // Variant: 'default' = normal item, 'danger' = destructive (red).
  variant?: 'default' | 'danger';
  disabled?: boolean;
  onSelect: () => void;
}

interface DropdownMenuProps {
  // The trigger element (a Button, IconButton, etc). The menu mirrors
  // its open state to aria-expanded.
  trigger: ReactElement;
  items: DropdownMenuItem[];
  placement?: DropdownPlacement;
  // Aria label for the menu container -- defaults to 'Menu'.
  ariaLabel?: string;
  // Optional additional content rendered above the items (e.g. a
  // header card showing the current user). Receives no props; the
  // parent owns the layout.
  header?: ReactNode;
  className?: string;
}

// Type-ahead reset window. Single-letter keys reset the buffer if the
// user pauses longer than this between keystrokes.
const TYPEAHEAD_RESET_MS = 500;

function mergeRefs<T>(
  ...refs: Array<Ref<T> | undefined>
): RefCallback<T> {
  return (value) => {
    for (const ref of refs) {
      if (!ref) continue;
      if (typeof ref === 'function') {
        ref(value);
      } else {
        (ref as MutableRefObject<T | null>).current = value;
      }
    }
  };
}

function labelString(label: ReactNode): string {
  return typeof label === 'string' ? label : '';
}

export function DropdownMenu({
  trigger,
  items,
  placement = 'top',
  ariaLabel,
  header,
  className,
}: DropdownMenuProps) {
  useLocale();
  const resolvedAriaLabel = ariaLabel ?? t('common.menu');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const itemsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const typeAheadRef = useRef<{ buffer: string; timer: number | null }>({
    buffer: '',
    timer: null,
  });
  const menuId = useId();
  const itemIdPrefix = `${menuId}-item-`;

  const focusItem = useCallback((idx: number) => {
    requestAnimationFrame(() => itemsRef.current[idx]?.focus());
  }, []);

  const close = useCallback((opts?: { restoreFocus?: boolean }) => {
    setOpen(false);
    setHighlight(-1);
    if (opts?.restoreFocus) {
      const el = triggerRef.current;
      if (el && typeof (el as HTMLElement).focus === 'function') {
        (el as HTMLElement).focus();
      }
    }
  }, []);

  const toggle = useCallback(() => {
    setOpen((v) => !v);
  }, []);

  // Click-outside dismiss. Capturing-phase handler so item clicks still
  // fire their onSelect before the menu closes.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const root = containerRef.current;
      if (!root) return;
      if (e.target instanceof Node && !root.contains(e.target)) close();
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open, close]);

  const findNextEnabled = useCallback(
    (start: number, dir: 1 | -1, len: number): number => {
      if (len === 0) return -1;
      // No previous highlight: ArrowDown -> first, ArrowUp -> last.
      let next = start < 0 ? (dir === 1 ? -1 : 0) : start;
      for (let step = 0; step < len; step++) {
        next = (next + dir + len) % len;
        if (!items[next]?.disabled) return next;
      }
      return -1;
    },
    [items],
  );

  const firstEnabled = useCallback((): number => {
    for (let i = 0; i < items.length; i++) {
      if (!items[i]?.disabled) return i;
    }
    return -1;
  }, [items]);

  const lastEnabled = useCallback((): number => {
    for (let i = items.length - 1; i >= 0; i--) {
      if (!items[i]?.disabled) return i;
    }
    return -1;
  }, [items]);

  const handleTypeAhead = useCallback(
    (key: string) => {
      const state = typeAheadRef.current;
      if (state.timer !== null) {
        clearTimeout(state.timer);
      }
      // Single-letter type-ahead: the search "buffer" is always the
      // most recent key. Repeated presses of the same key within the
      // 500ms window advance through items that start with that key
      // (handled below by searching from `highlight + 1`). The timer
      // resets the buffer once the user pauses.
      state.buffer = key.toLowerCase();
      state.timer = setTimeout(() => {
        state.buffer = '';
        state.timer = null;
      }, TYPEAHEAD_RESET_MS) as unknown as number;

      const buf = state.buffer;
      const len = items.length;
      const startFrom = highlight >= 0 ? highlight : -1;
      // Cycle through items starting from the one after the current
      // highlight so repeated presses of the same key advance through
      // matches.
      for (let step = 1; step <= len; step++) {
        const idx = (startFrom + step + len) % len;
        const item = items[idx];
        if (!item || item.disabled) continue;
        const text = labelString(item.label).toLowerCase();
        if (text.startsWith(buf)) {
          setHighlight(idx);
          focusItem(idx);
          return;
        }
      }
    },
    [items, highlight, focusItem],
  );

  // Keyboard navigation.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close({ restoreFocus: true });
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const len = items.length;
        if (len === 0) return;
        const dir: 1 | -1 = e.key === 'ArrowDown' ? 1 : -1;
        setHighlight((prev) => {
          const next = findNextEnabled(prev, dir, len);
          if (next >= 0) focusItem(next);
          return next;
        });
        return;
      }
      if (e.key === 'Home') {
        e.preventDefault();
        const idx = firstEnabled();
        if (idx >= 0) {
          setHighlight(idx);
          focusItem(idx);
        }
        return;
      }
      if (e.key === 'End') {
        e.preventDefault();
        const idx = lastEnabled();
        if (idx >= 0) {
          setHighlight(idx);
          focusItem(idx);
        }
        return;
      }
      // Single-letter type-ahead. Match printable single chars only;
      // ignore when modifier keys are held (Ctrl/Meta/Alt).
      if (
        e.key.length === 1 &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        /\S/.test(e.key)
      ) {
        // Skip Enter/Space here -- those are handled by the item button.
        if (e.key === ' ') return;
        e.preventDefault();
        handleTypeAhead(e.key);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [
    open,
    items,
    close,
    findNextEnabled,
    firstEnabled,
    lastEnabled,
    focusItem,
    handleTypeAhead,
  ]);

  // Clear type-ahead timer when menu closes / unmounts.
  useEffect(() => {
    if (!open) {
      const state = typeAheadRef.current;
      if (state.timer !== null) {
        clearTimeout(state.timer);
        state.timer = null;
      }
      state.buffer = '';
    }
    return () => {
      const state = typeAheadRef.current;
      if (state.timer !== null) {
        clearTimeout(state.timer);
        state.timer = null;
      }
    };
  }, [open]);

  const handleItemActivate = useCallback(
    (item: DropdownMenuItem, opts?: { restoreFocus?: boolean }) => {
      if (item.disabled) return;
      try {
        item.onSelect();
      } finally {
        close({ restoreFocus: opts?.restoreFocus });
      }
    },
    [close],
  );

  // Wrap the trigger so the consumer doesn't have to re-wire onClick /
  // aria-expanded / aria-controls. Preserve any existing ref on the
  // trigger so callers that pass <button ref={...}> still receive it.
  const existingRef = (trigger as ReactElement & { ref?: Ref<HTMLElement> })
    .ref;
  const triggerEl = isValidElement(trigger)
    ? cloneElement(trigger, {
        onClick: toggle,
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': menuId,
        ref: mergeRefs<HTMLElement>(triggerRef, existingRef),
      } as Record<string, unknown>)
    : trigger;

  const placementClass =
    placement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2';

  const activeItemId =
    highlight >= 0 && highlight < items.length && !items[highlight]?.disabled
      ? `${itemIdPrefix}${highlight}`
      : undefined;

  return (
    <div className={cn('relative inline-block', className)} ref={containerRef}>
      {triggerEl}
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={resolvedAriaLabel}
          aria-orientation="vertical"
          aria-activedescendant={activeItemId}
          className={cn(
            'absolute left-0 z-50 min-w-[12rem] rounded-md border border-border bg-popover text-popover-foreground shadow-md focus:outline-none',
            placementClass,
          )}
        >
          {header ? (
            <div className="border-b border-border px-3 py-2">{header}</div>
          ) : null}
          <ul className="flex flex-col py-1">
            {items.map((item, idx) => (
              <li key={item.key}>
                <button
                  id={`${itemIdPrefix}${idx}`}
                  ref={(el) => {
                    itemsRef.current[idx] = el;
                  }}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onMouseEnter={() => setHighlight(idx)}
                  onClick={() => handleItemActivate(item)}
                  onKeyDown={(e: KeyboardEvent<HTMLButtonElement>) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleItemActivate(item, { restoreFocus: true });
                    }
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
                    'focus:outline-none focus:bg-accent focus:text-accent-foreground',
                    item.disabled
                      ? 'cursor-not-allowed opacity-50'
                      : 'hover:bg-accent hover:text-accent-foreground',
                    item.variant === 'danger'
                      ? 'text-destructive hover:bg-destructive/10 hover:text-destructive focus:bg-destructive/10 focus:text-destructive'
                      : '',
                    highlight === idx && !item.disabled
                      ? item.variant === 'danger'
                        ? 'bg-destructive/10 text-destructive'
                        : 'bg-accent text-accent-foreground'
                      : '',
                  )}
                >
                  {item.icon ? (
                    <span aria-hidden="true" className="flex h-4 w-4 items-center justify-center">
                      {item.icon}
                    </span>
                  ) : null}
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.hint ? (
                    <span className="text-[11px] text-muted-foreground">
                      {item.hint}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
