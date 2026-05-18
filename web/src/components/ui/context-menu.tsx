import {
  cloneElement,
  forwardRef,
  isValidElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import type {
  MouseEvent as ReactMouseEvent,
  MutableRefObject,
  ReactElement,
  ReactNode,
  Ref,
  RefCallback,
} from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useFocusTrap } from '../../hooks/use-focus-trap';

export interface ContextMenuItem {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  danger?: boolean;
  onSelect?: () => void;
  separator?: boolean;
  // (v1.11.404, TODO 11.386) Section heading. Renders as a
  // non-interactive label row above the items that follow.
  // Useful for grouping items by purpose ("Edit" / "View"
  // / "Help"). Mutually exclusive with `separator`,
  // `onSelect`, and `items`.
  sectionHeading?: boolean;
  // (v1.11.404, TODO 11.386) Sub-menu children. When set,
  // the item renders with a trailing chevron; hovering or
  // pressing ArrowRight opens a nested menu to the right
  // (auto-flips left when off-screen). `onSelect` is
  // ignored when `items` is non-empty -- a parent item
  // is an opener, not a leaf.
  items?: ContextMenuItem[];
}

export interface ContextMenuProps {
  trigger: ReactElement;
  items: ContextMenuItem[];
  ariaLabel?: string;
  className?: string;
}

interface MenuPos {
  x: number;
  y: number;
}

function mergeRefs<T>(...refs: Array<Ref<T> | undefined>): RefCallback<T> {
  return (value) => {
    for (const ref of refs) {
      if (!ref) continue;
      if (typeof ref === 'function') ref(value);
      else (ref as MutableRefObject<T | null>).current = value;
    }
  };
}

function isSelectable(item: ContextMenuItem | undefined): boolean {
  return (
    !!item &&
    !item.separator &&
    !item.sectionHeading &&
    !item.disabled
  );
}

// (v1.11.404, TODO 11.386) Returns true when the item is a
// parent (sub-menu opener) rather than a leaf.
function hasChildren(item: ContextMenuItem | undefined): boolean {
  return !!item && Array.isArray(item.items) && item.items.length > 0;
}

// (v1.11.404, TODO 11.386) Helper used by tests + by the
// menu render path to pick the last selectable item for
// the End keyboard shortcut.
function lastSelectable(items: ContextMenuItem[]): number {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    if (isSelectable(items[i])) return i;
  }
  return -1;
}

function findNextSelectable(
  items: ContextMenuItem[],
  start: number,
  dir: 1 | -1,
): number {
  const len = items.length;
  if (len === 0) return -1;
  let idx = start;
  for (let step = 0; step < len; step++) {
    idx = (idx + dir + len) % len;
    if (isSelectable(items[idx])) return idx;
  }
  return -1;
}

function firstSelectable(items: ContextMenuItem[]): number {
  for (let i = 0; i < items.length; i++) {
    if (isSelectable(items[i])) return i;
  }
  return -1;
}

// (v1.11.404, TODO 11.386) Sub-menu state. Tracks which
// parent item opened a sub-menu and the rendered position.
interface SubMenuState {
  parentIndex: number;
  pos: MenuPos;
  highlight: number;
}

export const ContextMenu = forwardRef<HTMLElement, ContextMenuProps>(
  function ContextMenu({ trigger, items, ariaLabel, className }, forwardedRef) {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState<MenuPos>({ x: 0, y: 0 });
    const [highlight, setHighlight] = useState(-1);
    const [subMenu, setSubMenu] = useState<SubMenuState | null>(null);
    const triggerRef = useRef<HTMLElement | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const subMenuRef = useRef<HTMLDivElement | null>(null);
    const itemRefs = useRef<Array<HTMLLIElement | null>>([]);

    const close = useCallback((opts?: { restoreFocus?: boolean }) => {
      setOpen(false);
      setHighlight(-1);
      setSubMenu(null);
      if (opts?.restoreFocus) {
        const el = triggerRef.current;
        if (el && typeof el.focus === 'function') el.focus();
      }
    }, []);

    const handleContextMenu = useCallback(
      (e: ReactMouseEvent) => {
        e.preventDefault();
        setPos({ x: e.clientX, y: e.clientY });
        setHighlight(firstSelectable(items));
        setSubMenu(null);
        setOpen(true);
      },
      [items],
    );

    // (v1.11.404) Open the sub-menu for the parent item at
    // `index`. Computes the sub-menu position from the
    // parent item's bounding rect (right edge) so it sits
    // flush with the parent panel.
    const openSubMenu = useCallback(
      (index: number) => {
        const item = items[index];
        if (!item || !hasChildren(item)) return;
        const li = itemRefs.current[index];
        const menuEl = menuRef.current;
        if (!li || !menuEl) {
          // Fallback: position relative to the parent menu's
          // computed pos when refs are not yet attached.
          setSubMenu({
            parentIndex: index,
            pos: { x: pos.x + 200, y: pos.y },
            highlight: firstSelectable(item.items ?? []),
          });
          return;
        }
        const rect = li.getBoundingClientRect();
        setSubMenu({
          parentIndex: index,
          pos: { x: rect.right, y: rect.top },
          highlight: firstSelectable(item.items ?? []),
        });
      },
      [items, pos],
    );

    const closeSubMenu = useCallback(() => {
      setSubMenu(null);
    }, []);

    // Click-outside dismiss (mousedown capture).
    useEffect(() => {
      if (!open) return;
      const onDown = (e: MouseEvent) => {
        const root = menuRef.current;
        const sub = subMenuRef.current;
        const target = e.target as Node | null;
        if (!target) return;
        const insideRoot = root && root.contains(target);
        const insideSub = sub && sub.contains(target);
        if (!insideRoot && !insideSub) close();
      };
      document.addEventListener('mousedown', onDown, true);
      return () => document.removeEventListener('mousedown', onDown, true);
    }, [open, close]);

    // Keyboard navigation.
    useEffect(() => {
      if (!open) return;
      const onKey = (e: KeyboardEvent) => {
        // (v1.11.404, TODO 11.386) When the sub-menu is open,
        // its own keyboard handler drives nav inside the
        // submenu. ArrowLeft / Escape returns to the parent.
        if (subMenu) {
          const subItems = items[subMenu.parentIndex]?.items ?? [];
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const dir: 1 | -1 = e.key === 'ArrowDown' ? 1 : -1;
            setSubMenu((prev) => {
              if (!prev) return prev;
              const start =
                prev.highlight < 0 ? (dir === 1 ? -1 : 0) : prev.highlight;
              return {
                ...prev,
                highlight: findNextSelectable(subItems, start, dir),
              };
            });
            return;
          }
          if (e.key === 'Home') {
            e.preventDefault();
            setSubMenu((prev) =>
              prev ? { ...prev, highlight: firstSelectable(subItems) } : prev,
            );
            return;
          }
          if (e.key === 'End') {
            e.preventDefault();
            setSubMenu((prev) =>
              prev ? { ...prev, highlight: lastSelectable(subItems) } : prev,
            );
            return;
          }
          if (e.key === 'Enter') {
            const subItem = subItems[subMenu.highlight];
            if (subItem && isSelectable(subItem)) {
              e.preventDefault();
              subItem.onSelect?.();
              close({ restoreFocus: true });
            }
            return;
          }
          if (e.key === 'ArrowLeft' || e.key === 'Escape') {
            e.preventDefault();
            closeSubMenu();
            return;
          }
          return;
        }
        // Parent menu nav.
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
        // (v1.11.404, TODO 11.386) ArrowRight on a parent
        // item opens its sub-menu.
        if (e.key === 'ArrowRight') {
          const item = items[highlight];
          if (item && hasChildren(item) && !item.disabled) {
            e.preventDefault();
            openSubMenu(highlight);
          }
          return;
        }
        if (e.key === 'Enter') {
          const item = items[highlight];
          if (item && isSelectable(item)) {
            e.preventDefault();
            if (hasChildren(item)) {
              openSubMenu(highlight);
            } else {
              item.onSelect?.();
              close({ restoreFocus: true });
            }
          }
          return;
        }
      };
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    }, [open, items, highlight, subMenu, close, closeSubMenu, openSubMenu]);

    // Clamp position after measuring the menu box.
    useLayoutEffect(() => {
      if (!open) return;
      const node = menuRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let x = pos.x;
      let y = pos.y;
      if (x + rect.width > vw) x = Math.max(0, vw - rect.width);
      if (y + rect.height > vh) y = Math.max(0, vh - rect.height);
      if (x !== pos.x || y !== pos.y) setPos({ x, y });
    }, [open, pos]);

    useFocusTrap(menuRef, {
      active: open,
      onEscape: () => close({ restoreFocus: true }),
      restoreFocusOnUnmount: true,
    });

    const existingRef = (trigger as ReactElement & { ref?: Ref<HTMLElement> })
      .ref;
    const refSetter = mergeRefs<HTMLElement>(
      triggerRef,
      existingRef,
      forwardedRef,
    );

    const triggerEl = isValidElement(trigger)
      ? cloneElement(trigger, {
          onContextMenu: handleContextMenu,
          ref: refSetter,
        } as Record<string, unknown>)
      : trigger;

    const portalTarget =
      typeof document !== 'undefined' ? document.body : null;

    const handleParentMouseEnter = useCallback(
      (idx: number) => {
        if (items[idx]?.disabled) return;
        setHighlight(idx);
        // (v1.11.404, TODO 11.386) Hovering a sub-menu
        // opener auto-opens it; hovering a non-opener
        // closes any active sub-menu.
        if (hasChildren(items[idx])) {
          openSubMenu(idx);
        } else {
          setSubMenu(null);
        }
      },
      [items, openSubMenu],
    );

    const handleParentItemClick = useCallback(
      (item: ContextMenuItem, idx: number) => {
        if (!isSelectable(item)) return;
        if (hasChildren(item)) {
          openSubMenu(idx);
          return;
        }
        item.onSelect?.();
        close({ restoreFocus: true });
      },
      [openSubMenu, close],
    );

    function renderItem(
      item: ContextMenuItem,
      idx: number,
      activeIdx: number,
      onItemClick: (item: ContextMenuItem, idx: number) => void,
      onItemMouseEnter: (idx: number) => void,
      assignRef?: (el: HTMLLIElement | null, idx: number) => void,
    ): ReactNode {
      if (item.separator) {
        return (
          <li
            key={item.id}
            role="separator"
            data-section="context-menu-separator"
            className="my-1 h-px bg-border"
          />
        );
      }
      if (item.sectionHeading) {
        return (
          <li
            key={item.id}
            role="presentation"
            data-section="context-menu-section-heading"
            className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
          >
            {item.label}
          </li>
        );
      }
      const active = activeIdx === idx && !item.disabled;
      const isParent = hasChildren(item);
      return (
        <li
          key={item.id}
          ref={(el) => {
            if (assignRef) assignRef(el, idx);
          }}
          data-section="context-menu-item"
          data-context-menu-item={item.id}
        >
          <button
            type="button"
            role="menuitem"
            disabled={item.disabled}
            aria-disabled={item.disabled || undefined}
            aria-haspopup={isParent ? 'menu' : undefined}
            aria-expanded={
              isParent
                ? subMenu?.parentIndex === idx
                  ? true
                  : false
                : undefined
            }
            tabIndex={-1}
            onMouseEnter={() => onItemMouseEnter(idx)}
            onClick={() => onItemClick(item, idx)}
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
            {isParent ? (
              <ChevronRight
                aria-hidden="true"
                data-section="context-menu-submenu-chevron"
                className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
              />
            ) : null}
          </button>
        </li>
      );
    }

    return (
      <>
        {triggerEl}
        {open && portalTarget
          ? createPortal(
              <>
                <div
                  ref={menuRef}
                  role="menu"
                  aria-label={ariaLabel ?? 'Context menu'}
                  aria-orientation="vertical"
                  tabIndex={-1}
                  data-section="context-menu"
                  style={{ position: 'absolute', top: pos.y, left: pos.x }}
                  className={cn(
                    'z-50 min-w-[10rem] rounded-md border border-border bg-popover text-popover-foreground shadow-md focus:outline-none',
                    className,
                  )}
                >
                  <ul className="flex flex-col py-1">
                    {items.map((item, idx) =>
                      renderItem(
                        item,
                        idx,
                        highlight,
                        handleParentItemClick,
                        handleParentMouseEnter,
                        (el, i) => {
                          itemRefs.current[i] = el;
                        },
                      ),
                    )}
                  </ul>
                </div>
                {subMenu
                  ? (() => {
                      const parent = items[subMenu.parentIndex];
                      const subItems = parent?.items ?? [];
                      const onSubClick = (
                        item: ContextMenuItem,
                      ) => {
                        if (!isSelectable(item)) return;
                        item.onSelect?.();
                        close({ restoreFocus: true });
                      };
                      const onSubEnter = (idx: number) => {
                        if (subItems[idx]?.disabled) return;
                        setSubMenu((prev) =>
                          prev ? { ...prev, highlight: idx } : prev,
                        );
                      };
                      return (
                        <div
                          ref={subMenuRef}
                          role="menu"
                          aria-label={`${parent?.label ?? 'Sub menu'}`}
                          aria-orientation="vertical"
                          tabIndex={-1}
                          data-section="context-menu-submenu"
                          data-parent={parent?.id}
                          style={{
                            position: 'absolute',
                            top: subMenu.pos.y,
                            left: subMenu.pos.x,
                          }}
                          className={cn(
                            'z-50 min-w-[10rem] rounded-md border border-border bg-popover text-popover-foreground shadow-md focus:outline-none',
                          )}
                        >
                          <ul className="flex flex-col py-1">
                            {subItems.map((item, idx) =>
                              renderItem(
                                item,
                                idx,
                                subMenu.highlight,
                                onSubClick,
                                onSubEnter,
                              ),
                            )}
                          </ul>
                        </div>
                      );
                    })()
                  : null}
              </>,
              portalTarget,
            )
          : null}
      </>
    );
  },
);
