import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import type {
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
} from 'react';
import { cn } from '../../lib/cn';

// (v1.11.405, TODO 11.387) Menubar -- horizontal menu strip
// with top-level triggers (File / Edit / View / Help ...)
// each opening a dropdown sub-menu of items.
//
// Why a dedicated primitive (not just a row of DropdownMenu)?
//   - The WAI-ARIA "menubar" pattern carries an aggregate
//     role on the strip itself + roving tabindex across
//     top-level triggers. Composing DropdownMenu rows would
//     re-implement that wiring per call site.
//   - The cross-trigger keyboard contract (ArrowLeft /
//     ArrowRight between triggers, ArrowDown opens dropdown,
//     hover-swap after one trigger is active) is a
//     menubar-specific affordance.
//
// Design constraints:
//   - Single open menu at a time. Opening one trigger's
//     dropdown closes any other open dropdown.
//   - Roving tabindex: only the focused (or first if none
//     focused) trigger has tabindex=0; the rest have -1.
//   - Hover-swap: once ANY dropdown is open, hovering a
//     sibling trigger opens its dropdown without an extra
//     click.
//   - Keyboard contract is the full WAI-ARIA menubar
//     pattern: ArrowLeft / ArrowRight (with wrap) between
//     triggers; ArrowDown opens; ArrowUp / ArrowDown nav
//     inside the open dropdown; Home / End jumps to
//     first/last selectable item; Escape closes + returns
//     focus to the trigger; Tab exits.

export interface MenubarMenuItem {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  danger?: boolean;
  onSelect?: () => void;
  separator?: boolean;
}

export interface MenubarMenu {
  id: string;
  /** Trigger label shown in the bar. */
  label: ReactNode;
  /** Items in the dropdown panel. */
  items: MenubarMenuItem[];
  disabled?: boolean;
}

export interface MenubarProps {
  menus: MenubarMenu[];
  ariaLabel?: string;
  className?: string;
  'data-testid'?: string;
}

function isSelectable(item: MenubarMenuItem | undefined): boolean {
  return !!item && !item.separator && !item.disabled;
}

function firstSelectable(items: MenubarMenuItem[]): number {
  for (let i = 0; i < items.length; i += 1) {
    if (isSelectable(items[i])) return i;
  }
  return -1;
}

function lastSelectable(items: MenubarMenuItem[]): number {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    if (isSelectable(items[i])) return i;
  }
  return -1;
}

function findNextSelectable(
  items: MenubarMenuItem[],
  start: number,
  dir: 1 | -1,
): number {
  const len = items.length;
  if (len === 0) return -1;
  let idx = start;
  for (let step = 0; step < len; step += 1) {
    idx = (idx + dir + len) % len;
    if (isSelectable(items[idx])) return idx;
  }
  return -1;
}

// (v1.11.405, TODO 11.387) Cross-trigger nav helper. Skips
// disabled top-level menus while cycling.
function findNextEnabledMenu(
  menus: MenubarMenu[],
  start: number,
  dir: 1 | -1,
): number {
  const len = menus.length;
  if (len === 0) return -1;
  let idx = start;
  for (let step = 0; step < len; step += 1) {
    idx = (idx + dir + len) % len;
    if (!menus[idx]?.disabled) return idx;
  }
  return -1;
}

export const Menubar = forwardRef<HTMLDivElement, MenubarProps>(
  function Menubar(
    { menus, ariaLabel = 'Menu bar', className, ...rest },
    forwardedRef,
  ) {
    const baseId = useId();
    const rootRef = useRef<HTMLDivElement | null>(null);
    const triggerRefs = useRef<Array<HTMLButtonElement | null>>([]);
    // (v1.11.405, TODO 11.387) `openIndex` is the index of
    // the currently-open menu (or null if none). When set,
    // hovering a sibling trigger swaps the open menu.
    const [openIndex, setOpenIndex] = useState<number | null>(null);
    // Per-open menu: highlight inside the dropdown.
    const [highlight, setHighlight] = useState<number>(-1);
    // Roving tabindex pointer. Starts on first enabled menu;
    // ArrowLeft / ArrowRight + initial focus update it.
    const [focusIndex, setFocusIndex] = useState<number>(() => {
      for (let i = 0; i < menus.length; i += 1) {
        if (!menus[i]?.disabled) return i;
      }
      return 0;
    });

    const triggerId = useCallback((idx: number) => `${baseId}-trigger-${idx}`, [baseId]);
    const panelId = useCallback((idx: number) => `${baseId}-panel-${idx}`, [baseId]);

    const closeAll = useCallback(
      (opts?: { restoreFocus?: boolean }) => {
        setOpenIndex(null);
        setHighlight(-1);
        if (opts?.restoreFocus) {
          const el = triggerRefs.current[focusIndex];
          if (el && typeof el.focus === 'function') el.focus();
        }
      },
      [focusIndex],
    );

    const openMenu = useCallback(
      (idx: number) => {
        const menu = menus[idx];
        if (!menu || menu.disabled) return;
        setOpenIndex(idx);
        setHighlight(firstSelectable(menu.items));
        setFocusIndex(idx);
      },
      [menus],
    );

    const handleTriggerClick = useCallback(
      (idx: number) => {
        if (menus[idx]?.disabled) return;
        if (openIndex === idx) {
          // Toggle closed.
          closeAll();
        } else {
          openMenu(idx);
        }
      },
      [openIndex, menus, openMenu, closeAll],
    );

    const handleTriggerMouseEnter = useCallback(
      (idx: number) => {
        // (v1.11.405, TODO 11.387) Hover-swap. Only swap when
        // another menu is already open -- a plain hover with
        // no menu open does NOT open one (that would defeat
        // the click affordance for the trigger row).
        if (openIndex !== null && openIndex !== idx && !menus[idx]?.disabled) {
          openMenu(idx);
        }
      },
      [openIndex, menus, openMenu],
    );

    const moveTrigger = useCallback(
      (dir: 1 | -1) => {
        const next = findNextEnabledMenu(menus, focusIndex, dir);
        if (next < 0) return;
        setFocusIndex(next);
        // If a menu is already open, swap to the sibling.
        if (openIndex !== null) {
          openMenu(next);
        } else {
          const el = triggerRefs.current[next];
          if (el && typeof el.focus === 'function') el.focus();
        }
      },
      [menus, focusIndex, openIndex, openMenu],
    );

    const handleTriggerKeyDown = useCallback(
      (idx: number, e: ReactKeyboardEvent<HTMLButtonElement>) => {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          moveTrigger(1);
          return;
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          moveTrigger(-1);
          return;
        }
        if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openMenu(idx);
          return;
        }
        if (e.key === 'Home') {
          e.preventDefault();
          const first = findNextEnabledMenu(menus, -1, 1);
          if (first >= 0) {
            setFocusIndex(first);
            const el = triggerRefs.current[first];
            if (el && typeof el.focus === 'function') el.focus();
            if (openIndex !== null) openMenu(first);
          }
          return;
        }
        if (e.key === 'End') {
          e.preventDefault();
          const last = findNextEnabledMenu(menus, menus.length, -1);
          if (last >= 0) {
            setFocusIndex(last);
            const el = triggerRefs.current[last];
            if (el && typeof el.focus === 'function') el.focus();
            if (openIndex !== null) openMenu(last);
          }
          return;
        }
        if (e.key === 'Escape') {
          if (openIndex !== null) {
            e.preventDefault();
            closeAll({ restoreFocus: true });
          }
        }
      },
      [moveTrigger, openMenu, openIndex, menus, closeAll],
    );

    // Click-outside dismiss.
    useEffect(() => {
      if (openIndex === null) return;
      const onDown = (e: globalThis.MouseEvent) => {
        const root = rootRef.current;
        if (!root) return;
        if (e.target instanceof Node && !root.contains(e.target)) {
          closeAll();
        }
      };
      document.addEventListener('mousedown', onDown, true);
      return () => document.removeEventListener('mousedown', onDown, true);
    }, [openIndex, closeAll]);

    // Dropdown keyboard (active when openIndex !== null).
    useEffect(() => {
      if (openIndex === null) return;
      const items = menus[openIndex]?.items ?? [];
      const onKey = (e: globalThis.KeyboardEvent) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const dir: 1 | -1 = e.key === 'ArrowDown' ? 1 : -1;
          setHighlight((prev) => {
            const start = prev < 0 ? (dir === 1 ? -1 : 0) : prev;
            return findNextSelectable(items, start, dir);
          });
          return;
        }
        if (e.key === 'Home') {
          e.preventDefault();
          setHighlight(firstSelectable(items));
          return;
        }
        if (e.key === 'End') {
          e.preventDefault();
          setHighlight(lastSelectable(items));
          return;
        }
        if (e.key === 'Enter') {
          const it = items[highlight];
          if (it && isSelectable(it)) {
            e.preventDefault();
            it.onSelect?.();
            closeAll({ restoreFocus: true });
          }
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          closeAll({ restoreFocus: true });
          return;
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          // Move to the previous trigger AND open its menu.
          moveTrigger(-1);
          return;
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          moveTrigger(1);
          return;
        }
        if (e.key === 'Tab') {
          // Tab exits the menubar.
          closeAll();
        }
      };
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    }, [openIndex, menus, highlight, closeAll, moveTrigger]);

    return (
      <div
        ref={(node) => {
          rootRef.current = node;
          if (typeof forwardedRef === 'function') forwardedRef(node);
          else if (forwardedRef && typeof forwardedRef === 'object') {
            (forwardedRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
          }
        }}
        role="menubar"
        aria-label={ariaLabel}
        aria-orientation="horizontal"
        data-section="menubar"
        className={cn('relative inline-flex items-center gap-0.5', className)}
        {...rest}
      >
        {menus.map((menu, idx) => {
          const isOpen = openIndex === idx;
          const isFocused = focusIndex === idx;
          return (
            <div
              key={menu.id}
              className="relative"
              data-section="menubar-menu"
              data-menubar-menu={menu.id}
              data-menubar-open={isOpen ? 'true' : 'false'}
            >
              <button
                ref={(el) => {
                  triggerRefs.current[idx] = el;
                }}
                type="button"
                role="menuitem"
                id={triggerId(idx)}
                aria-haspopup="menu"
                aria-expanded={isOpen}
                aria-controls={panelId(idx)}
                disabled={menu.disabled}
                tabIndex={isFocused ? 0 : -1}
                onClick={() => handleTriggerClick(idx)}
                onMouseEnter={() => handleTriggerMouseEnter(idx)}
                onFocus={() => setFocusIndex(idx)}
                onKeyDown={(e) => handleTriggerKeyDown(idx, e)}
                data-section="menubar-trigger"
                data-menubar-trigger={menu.id}
                className={cn(
                  'rounded-sm px-2 py-1 text-sm transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background',
                  menu.disabled
                    ? 'cursor-not-allowed opacity-50'
                    : 'hover:bg-accent hover:text-accent-foreground',
                  isOpen && !menu.disabled && 'bg-accent text-accent-foreground',
                )}
              >
                {menu.label}
              </button>
              {isOpen ? (
                <div
                  role="menu"
                  id={panelId(idx)}
                  aria-orientation="vertical"
                  aria-labelledby={triggerId(idx)}
                  data-section="menubar-panel"
                  className="absolute left-0 top-full z-50 mt-1 min-w-[10rem] rounded-md border border-border bg-popover text-popover-foreground shadow-md focus:outline-none"
                >
                  <ul className="flex flex-col py-1">
                    {menu.items.map((item, itemIdx) => {
                      if (item.separator) {
                        return (
                          <li
                            key={item.id}
                            role="separator"
                            data-section="menubar-separator"
                            className="my-1 h-px bg-border"
                          />
                        );
                      }
                      const active =
                        highlight === itemIdx && !item.disabled;
                      return (
                        <li
                          key={item.id}
                          data-section="menubar-item"
                          data-menubar-item={item.id}
                        >
                          <button
                            type="button"
                            role="menuitem"
                            disabled={item.disabled}
                            aria-disabled={item.disabled || undefined}
                            tabIndex={-1}
                            onMouseEnter={() => {
                              if (!item.disabled) setHighlight(itemIdx);
                            }}
                            onClick={() => {
                              if (!isSelectable(item)) return;
                              item.onSelect?.();
                              closeAll({ restoreFocus: true });
                            }}
                            className={cn(
                              'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
                              'focus:outline-none',
                              item.disabled
                                ? 'cursor-not-allowed opacity-50'
                                : 'hover:bg-accent hover:text-accent-foreground',
                              item.danger
                                ? 'text-destructive hover:bg-destructive/10 hover:text-destructive'
                                : '',
                              active
                                ? item.danger
                                  ? 'bg-destructive/10 text-destructive'
                                  : 'bg-accent text-accent-foreground'
                                : '',
                            )}
                          >
                            {item.icon ? (
                              <span
                                aria-hidden="true"
                                className="flex h-4 w-4 items-center justify-center"
                              >
                                {item.icon}
                              </span>
                            ) : null}
                            <span className="flex-1 truncate">{item.label}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  },
);

Menubar.displayName = 'Menubar';
