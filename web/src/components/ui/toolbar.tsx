import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { HTMLAttributes, KeyboardEvent, ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Button } from './button';
import { IconButton } from './icon-button';
import { Popover } from './popover';

// (v1.11.284, TODO 11.266) Toolbar -- generic horizontal row of
// related action buttons. Built for "editor action bars" and
// "row footers" where the existing <BulkActionToolbar> (a
// floating bulk-selection HUD) is the wrong shape. Differences:
//
//   - Inline, not floating: lives in the document flow next to
//     the surface it acts on.
//   - Mixed buttons + dividers: actions can be `type: 'divider'`
//     to group sets of buttons visually.
//   - Optional overflow into a Popover when more than
//     `overflowAfter` buttons are configured (the excess folds
//     under a More menu instead of wrapping).
//   - Keyboard arrow navigation between buttons via roving
//     tabindex (matches the WAI-ARIA toolbar pattern).
//
// Reach for `<BulkActionToolbar>` instead when the surface is a
// transient "N selected" HUD that floats over the content.

export type ToolbarSize = 'sm' | 'md';

export type ToolbarItemVariant =
  | 'default'
  | 'ghost'
  | 'outline'
  | 'destructive';

export interface ToolbarButtonItem {
  id: string;
  type?: 'button';
  label?: ReactNode;
  // Optional leading icon. Required when `label` is null/empty
  // (icon-only buttons must still have an accessible name via
  // `ariaLabel`).
  icon?: ReactNode;
  ariaLabel?: string;
  variant?: ToolbarItemVariant;
  disabled?: boolean;
  onClick?: () => void;
}

export interface ToolbarDividerItem {
  id: string;
  type: 'divider';
}

export type ToolbarItem = ToolbarButtonItem | ToolbarDividerItem;

export interface ToolbarProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'role' | 'onKeyDown' | 'children'> {
  // (v1.11.284, TODO 11.266) Two render modes:
  //
  //   1. `items` (declarative): pass an array of
  //      ToolbarItems and the primitive renders the buttons,
  //      dividers, and overflow Popover. This is the simplest
  //      adoption path for action lists that don't need per-
  //      button Tooltips or other JSX wrappers.
  //
  //   2. `children` (escape hatch): pass arbitrary JSX (e.g.
  //      pre-existing `<Tooltip><Button/></Tooltip>` rows) and
  //      the primitive only contributes the role=toolbar shell
  //      + keyboard arrow nav + the consistent height /
  //      padding / border tokens. No items array, no overflow
  //      behaviour, no roving tabindex tracking (the caller
  //      owns focus management for their custom children).
  //
  // Passing both `items` and `children` is allowed: `children`
  // render after the items, useful when an editor needs a
  // few canonical actions plus one bespoke control.
  items?: ToolbarItem[];
  children?: ReactNode;
  size?: ToolbarSize;
  ariaLabel?: string;
  // When set, items beyond the first N render under a More
  // popover instead of inline. Dividers count toward the N cap
  // but never render at the boundary (we trim a trailing
  // divider in the inline list so the More chip is not
  // preceded by a dangling pipe). Only honoured when `items`
  // is set -- `children` rows render verbatim.
  overflowAfter?: number;
  className?: string;
}

const SIZE_CLASSES: Record<ToolbarSize, {
  root: string;
  button: string;
}> = {
  sm: {
    root: 'h-7 gap-0.5 px-1',
    button: 'h-6 text-[11px]',
  },
  md: {
    root: 'h-9 gap-1 px-1.5',
    button: 'h-7 text-xs',
  },
};

function isDivider(item: ToolbarItem): item is ToolbarDividerItem {
  return item.type === 'divider';
}

// Trim trailing dividers from a slice so the inline row never
// ends on a pipe (visually noisy when followed by the More
// chip).
function trimTrailingDivider(items: ToolbarItem[]): ToolbarItem[] {
  const out = [...items];
  while (out.length > 0 && isDivider(out[out.length - 1]!)) {
    out.pop();
  }
  return out;
}

interface ButtonProps {
  item: ToolbarButtonItem;
  size: ToolbarSize;
  isFocused: boolean;
  onFocus: () => void;
  refCallback: (el: HTMLButtonElement | null) => void;
}

function ToolbarButton({
  item,
  size,
  isFocused,
  onFocus,
  refCallback,
}: ButtonProps) {
  const sizing = SIZE_CLASSES[size];
  const variant: ToolbarItemVariant = item.variant ?? 'ghost';
  const iconOnly = !item.label && Boolean(item.icon);
  const ariaLabel =
    item.ariaLabel ??
    (typeof item.label === 'string' ? item.label : undefined);
  return (
    <Button
      ref={refCallback}
      type="button"
      variant={variant}
      size="sm"
      disabled={item.disabled}
      onClick={item.onClick}
      onFocus={onFocus}
      tabIndex={isFocused ? 0 : -1}
      aria-label={iconOnly ? ariaLabel : undefined}
      data-toolbar-item={item.id}
      data-toolbar-item-type="button"
      className={cn(sizing.button, iconOnly && 'w-7 px-0')}
    >
      {item.icon ? (
        <span aria-hidden="true" className="inline-flex shrink-0 items-center">
          {item.icon}
        </span>
      ) : null}
      {item.label ? <span>{item.label}</span> : null}
    </Button>
  );
}

export const Toolbar = forwardRef<HTMLDivElement, ToolbarProps>(
  (
    {
      items,
      children,
      size = 'md',
      ariaLabel = 'Toolbar',
      overflowAfter,
      className,
      ...rest
    },
    ref,
  ) => {
    const sizing = SIZE_CLASSES[size];
    const resolvedItems = items ?? [];

    // Split into inline + overflow groups.
    const { inlineItems, overflowItems } = useMemo(() => {
      if (
        typeof overflowAfter !== 'number' ||
        overflowAfter < 0 ||
        resolvedItems.length <= overflowAfter
      ) {
        return { inlineItems: resolvedItems, overflowItems: [] as ToolbarItem[] };
      }
      return {
        inlineItems: trimTrailingDivider(resolvedItems.slice(0, overflowAfter)),
        overflowItems: resolvedItems.slice(overflowAfter),
      };
    }, [resolvedItems, overflowAfter]);

    // Roving tabindex. Track the focused button by ID (not
    // index) so re-ordering or list shrinking doesn't strand
    // focus on a gone-away slot.
    const buttonItems = inlineItems.filter(
      (it): it is ToolbarButtonItem => !isDivider(it),
    );
    const [focusedId, setFocusedId] = useState<string | null>(
      buttonItems.length > 0 ? buttonItems[0]!.id : null,
    );

    // Keep focusedId valid when items change.
    useEffect(() => {
      if (buttonItems.length === 0) {
        setFocusedId(null);
        return;
      }
      const stillPresent = buttonItems.some((b) => b.id === focusedId);
      if (!stillPresent) setFocusedId(buttonItems[0]!.id);
    }, [buttonItems, focusedId]);

    const refs = useRef<Record<string, HTMLButtonElement | null>>({});

    const moveFocus = useCallback(
      (delta: 1 | -1) => {
        if (buttonItems.length === 0) return;
        const idx = buttonItems.findIndex((b) => b.id === focusedId);
        const nextIdx = idx === -1 ? 0 : (idx + delta + buttonItems.length) % buttonItems.length;
        const next = buttonItems[nextIdx]!;
        setFocusedId(next.id);
        refs.current[next.id]?.focus();
      },
      [buttonItems, focusedId],
    );

    const focusFirst = useCallback(() => {
      const first = buttonItems[0];
      if (!first) return;
      setFocusedId(first.id);
      refs.current[first.id]?.focus();
    }, [buttonItems]);

    const focusLast = useCallback(() => {
      const last = buttonItems[buttonItems.length - 1];
      if (!last) return;
      setFocusedId(last.id);
      refs.current[last.id]?.focus();
    }, [buttonItems]);

    const handleKeyDown = useCallback(
      (e: KeyboardEvent<HTMLDivElement>) => {
        switch (e.key) {
          case 'ArrowRight':
            e.preventDefault();
            moveFocus(1);
            break;
          case 'ArrowLeft':
            e.preventDefault();
            moveFocus(-1);
            break;
          case 'Home':
            e.preventDefault();
            focusFirst();
            break;
          case 'End':
            e.preventDefault();
            focusLast();
            break;
          default:
            break;
        }
      },
      [focusFirst, focusLast, moveFocus],
    );

    return (
      <div
        ref={ref}
        role="toolbar"
        aria-label={ariaLabel}
        data-section="toolbar"
        data-size={size}
        onKeyDown={handleKeyDown}
        className={cn(
          'inline-flex items-center rounded-md border border-border bg-card/40',
          sizing.root,
          className,
        )}
        {...rest}
      >
        {inlineItems.map((it) =>
          isDivider(it) ? (
            <span
              key={it.id}
              aria-hidden="true"
              data-toolbar-item={it.id}
              data-toolbar-item-type="divider"
              className="mx-1 h-4 w-px self-center bg-border"
            />
          ) : (
            <ToolbarButton
              key={it.id}
              item={it}
              size={size}
              isFocused={it.id === focusedId}
              onFocus={() => setFocusedId(it.id)}
              refCallback={(el) => {
                refs.current[it.id] = el;
              }}
            />
          ),
        )}
        {children}
        {overflowItems.length > 0 ? (
          <Popover
            placement="bottom"
            align="end"
            trigger={
              <IconButton
                type="button"
                aria-label="More toolbar actions"
                data-toolbar-overflow-trigger="true"
                className={cn(sizing.button, 'w-7 px-0')}
                icon={
                  <MoreHorizontal aria-hidden="true" className="h-3.5 w-3.5" />
                }
              />
            }
            content={
              <div
                role="menu"
                data-toolbar-overflow-menu="true"
                className="flex min-w-[10rem] flex-col gap-0.5"
              >
                {overflowItems.map((it) =>
                  isDivider(it) ? (
                    <span
                      key={it.id}
                      aria-hidden="true"
                      className="my-1 h-px w-full bg-border"
                      data-toolbar-overflow-divider="true"
                    />
                  ) : (
                    <button
                      key={it.id}
                      type="button"
                      role="menuitem"
                      disabled={it.disabled}
                      onClick={it.onClick}
                      data-toolbar-overflow-item={it.id}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                        it.variant === 'destructive' && 'text-destructive',
                      )}
                    >
                      {it.icon ? (
                        <span
                          aria-hidden="true"
                          className="inline-flex shrink-0 items-center"
                        >
                          {it.icon}
                        </span>
                      ) : null}
                      {it.label ? (
                        <span>{it.label}</span>
                      ) : (
                        <span className="sr-only">
                          {it.ariaLabel ?? it.id}
                        </span>
                      )}
                    </button>
                  ),
                )}
              </div>
            }
          />
        ) : null}
      </div>
    );
  },
);
Toolbar.displayName = 'Toolbar';
