import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  ForwardedRef,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
} from 'react';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '../../lib/cn';

// (v1.11.426, TODO 11.408) ActionMenu primitive.
//
// Primary / secondary action grouping with overflow handling for
// page-level action bars. The first `maxVisible` actions render
// as inline buttons; the rest collapse behind a "More" overflow
// menu. Full WAI-ARIA toolbar pattern (single-tabstop arrow nav).
//
// Distinct from:
//   - `<CommandBar>` (11.395) -- selection-scoped bottom bar
//     with mandatory Clear button. ActionMenu is the inline
//     page-level variant.
//   - `<ListActionMenu>` (11.262) -- per-row hover affordance
//     in a list. ActionMenu is the page-level top-bar variant.
//
// Reference: /root/c4/arps-design-system-v1/.

export interface ActionMenuAction {
  id: string;
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  variant?: 'primary' | 'secondary' | 'destructive';
  disabled?: boolean;
  shortcut?: string;
  ariaLabel?: string;
}

export interface ActionMenuSeparator {
  id: string;
  type: 'separator';
}

export type ActionMenuItem = ActionMenuAction | ActionMenuSeparator;

export type ActionMenuAlign = 'start' | 'end';

export interface ActionMenuProps {
  actions: ActionMenuItem[];
  maxVisible?: number;
  ariaLabel?: string;
  className?: string;
  overflowLabel?: string;
  align?: ActionMenuAlign;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export function isActionMenuSeparator(
  item: ActionMenuItem,
): item is ActionMenuSeparator {
  return (item as ActionMenuSeparator).type === 'separator';
}

export interface ActionMenuPartition {
  visible: ActionMenuItem[];
  overflow: ActionMenuItem[];
}

// Partition the actions array into visible vs overflow. The
// canonical rule:
//
//   - Trailing separators on either side of the split are
//     dropped to avoid orphan dividers.
//   - When the total number of actions (ignoring separators) is
//     <= maxVisible, everything is visible (no overflow).
//   - Otherwise the first `maxVisible` ACTIONS (separators do
//     not count toward the budget) are visible; the rest go
//     into overflow.
export function partitionActionMenu(
  items: ActionMenuItem[],
  maxVisible: number,
): ActionMenuPartition {
  const cap = Number.isFinite(maxVisible) && maxVisible >= 0
    ? Math.floor(maxVisible)
    : 0;
  if (items.length === 0) return { visible: [], overflow: [] };
  // Count actions (non-separator) for the cap.
  const actionCount = items.filter(
    (i) => !isActionMenuSeparator(i),
  ).length;
  if (actionCount <= cap) {
    return { visible: items.slice(), overflow: [] };
  }
  const visible: ActionMenuItem[] = [];
  let actionBudget = cap;
  let i = 0;
  while (i < items.length && actionBudget > 0) {
    const item = items[i]!;
    if (isActionMenuSeparator(item)) {
      // Skip separators at the boundary; they'd orphan.
      visible.push(item);
    } else {
      visible.push(item);
      actionBudget -= 1;
    }
    i += 1;
  }
  // Trim trailing separators from visible.
  while (
    visible.length > 0 &&
    isActionMenuSeparator(visible[visible.length - 1]!)
  ) {
    visible.pop();
    i -= 1;
  }
  const overflow = items.slice(i);
  // Trim leading separators from overflow.
  while (
    overflow.length > 0 &&
    isActionMenuSeparator(overflow[0]!)
  ) {
    overflow.shift();
  }
  return { visible, overflow };
}

const VARIANT_CLASS: Record<
  NonNullable<ActionMenuAction['variant']>,
  string
> = {
  primary:
    'border border-primary bg-primary text-primary-foreground hover:bg-primary/90',
  secondary:
    'border border-border bg-background text-foreground hover:bg-muted',
  destructive:
    'border border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90',
};

const DEFAULT_MAX_VISIBLE = 3;

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export const ActionMenu = forwardRef(function ActionMenu(
  {
    actions,
    maxVisible = DEFAULT_MAX_VISIBLE,
    ariaLabel = 'Page actions',
    className,
    overflowLabel = 'More',
    align = 'end',
  }: ActionMenuProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const partition = useMemo(
    () => partitionActionMenu(actions, maxVisible),
    [actions, maxVisible],
  );

  const focusableVisibleIndexes = useMemo(() => {
    const indexes: number[] = [];
    partition.visible.forEach((item, idx) => {
      if (isActionMenuSeparator(item)) return;
      if ((item as ActionMenuAction).disabled) return;
      indexes.push(idx);
    });
    return indexes;
  }, [partition.visible]);

  const [activeIndex, setActiveIndex] = useState<number>(
    () => focusableVisibleIndexes[0] ?? 0,
  );
  useEffect(() => {
    if (focusableVisibleIndexes.length === 0) return;
    if (!focusableVisibleIndexes.includes(activeIndex)) {
      setActiveIndex(focusableVisibleIndexes[0] ?? 0);
    }
  }, [focusableVisibleIndexes, activeIndex]);

  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const moveFocus = useCallback(
    (delta: 1 | -1) => {
      if (focusableVisibleIndexes.length === 0) return;
      const currentPos = Math.max(
        0,
        focusableVisibleIndexes.indexOf(activeIndex),
      );
      const nextPos =
        (currentPos + delta + focusableVisibleIndexes.length) %
        focusableVisibleIndexes.length;
      const nextIdx = focusableVisibleIndexes[nextPos];
      if (typeof nextIdx !== 'number') return;
      setActiveIndex(nextIdx);
      buttonRefs.current[nextIdx]?.focus();
    },
    [focusableVisibleIndexes, activeIndex],
  );

  const moveTo = useCallback(
    (target: 'first' | 'last') => {
      if (focusableVisibleIndexes.length === 0) return;
      const idx =
        target === 'first'
          ? focusableVisibleIndexes[0]
          : focusableVisibleIndexes[focusableVisibleIndexes.length - 1];
      if (typeof idx !== 'number') return;
      setActiveIndex(idx);
      buttonRefs.current[idx]?.focus();
    },
    [focusableVisibleIndexes],
  );

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      switch (event.key) {
        case 'ArrowRight':
          event.preventDefault();
          moveFocus(1);
          break;
        case 'ArrowLeft':
          event.preventDefault();
          moveFocus(-1);
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
    [moveFocus, moveTo],
  );

  // Overflow popover state -------------------------------------
  const [open, setOpen] = useState<boolean>(false);
  const overflowRef = useRef<HTMLDivElement | null>(null);
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (overflowRef.current?.contains(target)) return;
      if (moreButtonRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        moreButtonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handleOverflowItemClick = useCallback(
    (action: ActionMenuAction) => {
      if (action.disabled) return;
      action.onClick();
      setOpen(false);
      moreButtonRef.current?.focus();
    },
    [],
  );

  const renderVisibleButton = (
    item: ActionMenuItem,
    idx: number,
  ): ReactNode => {
    if (isActionMenuSeparator(item)) {
      return (
        <div
          key={item.id}
          role="separator"
          aria-orientation="vertical"
          data-section="action-menu-separator"
          className="mx-1 h-5 w-px bg-border"
        />
      );
    }
    const action = item;
    const variant = action.variant ?? 'secondary';
    const isActive = idx === activeIndex;
    return (
      <button
        key={action.id}
        ref={(el) => {
          buttonRefs.current[idx] = el;
        }}
        type="button"
        aria-label={action.ariaLabel ?? action.label}
        disabled={action.disabled === true}
        tabIndex={isActive ? 0 : -1}
        onClick={action.disabled ? undefined : action.onClick}
        data-section="action-menu-action"
        data-action-id={action.id}
        data-action-variant={variant}
        data-disabled={action.disabled === true ? 'true' : 'false'}
        className={cn(
          'inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          VARIANT_CLASS[variant],
        )}
      >
        {action.icon ? (
          <span
            aria-hidden="true"
            data-section="action-menu-action-icon"
            className="inline-flex items-center"
          >
            {action.icon}
          </span>
        ) : null}
        <span data-section="action-menu-action-label">
          {action.label}
        </span>
        {action.shortcut ? (
          <kbd
            data-section="action-menu-action-shortcut"
            className="ml-1 rounded border border-border bg-muted px-1 text-xs"
          >
            {action.shortcut}
          </kbd>
        ) : null}
      </button>
    );
  };

  const overflowActions = partition.overflow.filter(
    (i): i is ActionMenuAction => !isActionMenuSeparator(i),
  );
  const showMore = overflowActions.length > 0;

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-orientation="horizontal"
      aria-label={ariaLabel}
      data-section="action-menu"
      data-align={align}
      data-visible-count={partition.visible.length}
      data-overflow-count={partition.overflow.length}
      data-overflow-open={open ? 'true' : 'false'}
      onKeyDown={handleKeyDown}
      className={cn(
        'relative inline-flex items-center gap-1',
        align === 'end' ? 'justify-end' : 'justify-start',
        className,
      )}
    >
      <div
        data-section="action-menu-visible"
        className="flex items-center gap-1"
      >
        {partition.visible.map((item, idx) =>
          renderVisibleButton(item, idx),
        )}
      </div>
      {showMore ? (
        <div data-section="action-menu-overflow" className="relative">
          <button
            ref={moreButtonRef}
            type="button"
            aria-label={overflowLabel}
            aria-haspopup="menu"
            aria-expanded={open}
            data-section="action-menu-more"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-sm text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <MoreHorizontal
              className="h-3.5 w-3.5"
              aria-hidden="true"
            />
            <span>{overflowLabel}</span>
          </button>
          {open ? (
            <div
              ref={overflowRef}
              role="menu"
              aria-label={`${ariaLabel} overflow`}
              data-section="action-menu-overflow-popover"
              className="absolute right-0 top-full z-30 mt-1 min-w-[180px] rounded-md border border-border bg-popover py-1 shadow-md"
            >
              {partition.overflow.map((item) => {
                if (isActionMenuSeparator(item)) {
                  return (
                    <div
                      key={item.id}
                      role="separator"
                      data-section="action-menu-overflow-separator"
                      className="my-1 h-px bg-border"
                    />
                  );
                }
                const variant = item.variant ?? 'secondary';
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    aria-label={item.ariaLabel ?? item.label}
                    disabled={item.disabled === true}
                    onClick={() => handleOverflowItemClick(item)}
                    data-section="action-menu-overflow-item"
                    data-action-id={item.id}
                    data-action-variant={variant}
                    data-disabled={
                      item.disabled === true ? 'true' : 'false'
                    }
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-1 text-left text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50',
                      variant === 'destructive' && 'text-destructive',
                    )}
                  >
                    {item.icon ? (
                      <span
                        aria-hidden="true"
                        data-section="action-menu-overflow-item-icon"
                      >
                        {item.icon}
                      </span>
                    ) : null}
                    <span
                      data-section="action-menu-overflow-item-label"
                      className="flex-1"
                    >
                      {item.label}
                    </span>
                    {item.shortcut ? (
                      <kbd
                        data-section="action-menu-overflow-item-shortcut"
                        className="rounded border border-border bg-muted px-1 text-xs text-muted-foreground"
                      >
                        {item.shortcut}
                      </kbd>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});

ActionMenu.displayName = 'ActionMenu';
