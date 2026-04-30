// (TODO 8.41) Minimal dropdown / popover menu primitive used by the
// sidebar AccountMenu. Deliberately small — no portal, no animation,
// no submenu support. The trigger is a plain button passed in as
// children; the menu opens beneath / above the trigger and closes on
// click-outside, Escape, or item activation.
//
// Why not adopt @radix-ui/react-dropdown-menu? Two reasons: the rest
// of the UI primitive layer is hand-rolled (button.tsx, tooltip.tsx,
// card.tsx, etc.) so radix would be the only third-party UI dep, and
// the surface we need (one trigger, a flat item list) is small enough
// that 120 lines of pure React keep the bundle lean.

import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import type { KeyboardEvent, ReactElement, ReactNode } from 'react';
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
  // Aria label for the menu container — defaults to 'Menu'.
  ariaLabel?: string;
  // Optional additional content rendered above the items (e.g. a
  // header card showing the current user). Receives no props; the
  // parent owns the layout.
  header?: ReactNode;
  className?: string;
}

export function DropdownMenu({
  trigger,
  items,
  placement = 'top',
  ariaLabel = 'Menu',
  header,
  className,
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();

  const close = useCallback(() => {
    setOpen(false);
    setHighlight(-1);
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

  // Escape dismiss + arrow nav.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const len = items.length;
        if (len === 0) return;
        setHighlight((prev) => {
          let next = prev;
          for (let step = 0; step < len; step++) {
            next = (next + (e.key === 'ArrowDown' ? 1 : -1) + len) % len;
            if (!items[next].disabled) break;
          }
          requestAnimationFrame(() => itemsRef.current[next]?.focus());
          return next;
        });
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, items, close]);

  const handleItemActivate = useCallback(
    (item: DropdownMenuItem) => {
      if (item.disabled) return;
      try {
        item.onSelect();
      } finally {
        close();
      }
    },
    [close],
  );

  // Wrap the trigger so the consumer doesn't have to re-wire onClick /
  // aria-expanded / aria-controls.
  const triggerEl = isValidElement(trigger)
    ? cloneElement(trigger, {
        onClick: toggle,
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': menuId,
      } as Record<string, unknown>)
    : trigger;

  const placementClass =
    placement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2';

  return (
    <div className={cn('relative inline-block', className)} ref={containerRef}>
      {triggerEl}
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={ariaLabel}
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
                      handleItemActivate(item);
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
