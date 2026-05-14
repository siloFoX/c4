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
  return !!item && !item.separator && !item.disabled;
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

export const ContextMenu = forwardRef<HTMLElement, ContextMenuProps>(
  function ContextMenu({ trigger, items, ariaLabel, className }, forwardedRef) {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState<MenuPos>({ x: 0, y: 0 });
    const [highlight, setHighlight] = useState(-1);
    const triggerRef = useRef<HTMLElement | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);

    const close = useCallback((opts?: { restoreFocus?: boolean }) => {
      setOpen(false);
      setHighlight(-1);
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
        setOpen(true);
      },
      [items],
    );

    // Click-outside dismiss (mousedown capture).
    useEffect(() => {
      if (!open) return;
      const onDown = (e: MouseEvent) => {
        const root = menuRef.current;
        if (!root) return;
        if (e.target instanceof Node && !root.contains(e.target)) close();
      };
      document.addEventListener('mousedown', onDown, true);
      return () => document.removeEventListener('mousedown', onDown, true);
    }, [open, close]);

    // Keyboard navigation.
    useEffect(() => {
      if (!open) return;
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const dir: 1 | -1 = e.key === 'ArrowDown' ? 1 : -1;
          setHighlight((prev) => {
            const start = prev < 0 ? (dir === 1 ? -1 : 0) : prev;
            return findNextSelectable(items, start, dir);
          });
          return;
        }
        if (e.key === 'Enter') {
          const item = items[highlight];
          if (item && isSelectable(item)) {
            e.preventDefault();
            item.onSelect?.();
            close({ restoreFocus: true });
          }
          return;
        }
      };
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    }, [open, items, highlight, close]);

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

    const handleItemClick = useCallback(
      (item: ContextMenuItem) => {
        if (!isSelectable(item)) return;
        item.onSelect?.();
        close({ restoreFocus: true });
      },
      [close],
    );

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

    return (
      <>
        {triggerEl}
        {open && portalTarget
          ? createPortal(
              <div
                ref={menuRef}
                role="menu"
                aria-label={ariaLabel ?? 'Context menu'}
                aria-orientation="vertical"
                tabIndex={-1}
                style={{ position: 'absolute', top: pos.y, left: pos.x }}
                className={cn(
                  'z-50 min-w-[10rem] rounded-md border border-border bg-popover text-popover-foreground shadow-md focus:outline-none',
                  className,
                )}
              >
                <ul className="flex flex-col py-1">
                  {items.map((item, idx) => {
                    if (item.separator) {
                      return (
                        <li
                          key={item.id}
                          role="separator"
                          className="my-1 h-px bg-border"
                        />
                      );
                    }
                    const active = highlight === idx && !item.disabled;
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          role="menuitem"
                          disabled={item.disabled}
                          aria-disabled={item.disabled || undefined}
                          tabIndex={-1}
                          onMouseEnter={() =>
                            !item.disabled && setHighlight(idx)
                          }
                          onClick={() => handleItemClick(item)}
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
              </div>,
              portalTarget,
            )
          : null}
      </>
    );
  },
);
