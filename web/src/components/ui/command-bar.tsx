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
import { cn } from '../../lib/cn';

// (v1.11.413, TODO 11.395) CommandBar primitive.
//
// Bottom-anchored quick action bar that surfaces while a
// multi-selection is active (data table rows, file picker tiles,
// canvas items). Pairs with `<VirtualTable>` (11.375), file
// upload progress (11.374), and any host that owns its own
// selection state.
//
// Reference: /root/c4/arps-design-system-v1/.
//
// API contract:
//   - The host owns `selectedCount`. The bar auto-hides when
//     the count is 0 (override via `visible`).
//   - `actions` is a flat array of either action records or
//     `{ type: 'separator' }` markers. Order is preserved.
//   - Single-tabstop toolbar pattern (WAI-ARIA): one button is
//     tabbable at a time; ArrowLeft / ArrowRight / Home / End
//     move the active tabstop without leaving the toolbar.
//     Escape clears the selection (when `onClearSelection` is
//     supplied + a clear button is rendered).
//   - Position default is 'bottom' (fixed-positioned, centered).
//     Other modes: 'top' (fixed-positioned at top edge) and
//     'static' (inline, no fixed position -- caller decides
//     positioning).

export interface CommandBarAction {
  id: string;
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  variant?: 'default' | 'primary' | 'destructive';
  disabled?: boolean;
  shortcut?: string;
  ariaLabel?: string;
}

export interface CommandBarSeparator {
  id: string;
  type: 'separator';
}

export type CommandBarItem = CommandBarAction | CommandBarSeparator;

export interface CommandBarProps {
  selectedCount: number;
  actions: CommandBarItem[];
  onClearSelection?: () => void;
  selectionLabel?: (count: number) => ReactNode;
  visible?: boolean;
  position?: 'bottom' | 'top' | 'static';
  align?: 'left' | 'center' | 'right';
  className?: string;
  ariaLabel?: string;
  showClearButton?: boolean;
  clearLabel?: string;
  motionSafe?: boolean;
}

export function isCommandBarSeparator(
  item: CommandBarItem,
): item is CommandBarSeparator {
  return (item as CommandBarSeparator).type === 'separator';
}

export function defaultSelectionLabel(count: number): string {
  if (count <= 0) return 'No selection';
  if (count === 1) return '1 selected';
  return `${count} selected`;
}

const VARIANT_CLASS: Record<
  NonNullable<CommandBarAction['variant']>,
  string
> = {
  default:
    'border border-border bg-background text-foreground hover:bg-muted',
  primary:
    'border border-primary bg-primary text-primary-foreground hover:bg-primary/90',
  destructive:
    'border border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90',
};

const POSITION_CLASS: Record<
  NonNullable<CommandBarProps['position']>,
  string
> = {
  bottom: 'fixed left-1/2 bottom-4 -translate-x-1/2 z-40',
  top: 'fixed left-1/2 top-4 -translate-x-1/2 z-40',
  static: '',
};

const ALIGN_CLASS: Record<
  NonNullable<CommandBarProps['align']>,
  string
> = {
  left: 'mr-auto',
  center: 'mx-auto',
  right: 'ml-auto',
};

export const CommandBar = forwardRef(function CommandBar(
  {
    selectedCount,
    actions,
    onClearSelection,
    selectionLabel,
    visible,
    position = 'bottom',
    align = 'center',
    className,
    ariaLabel = 'Selection actions',
    showClearButton = true,
    clearLabel = 'Clear selection',
    motionSafe = true,
  }: CommandBarProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const isVisible = visible ?? selectedCount > 0;
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const focusableIndexes = useMemo(() => {
    const indexes: number[] = [];
    actions.forEach((item, idx) => {
      if (isCommandBarSeparator(item)) return;
      if ((item as CommandBarAction).disabled) return;
      indexes.push(idx);
    });
    return indexes;
  }, [actions]);

  useEffect(() => {
    if (focusableIndexes.length === 0) {
      setActiveIndex(0);
      return;
    }
    if (!focusableIndexes.includes(activeIndex)) {
      const first = focusableIndexes[0];
      if (typeof first === 'number') setActiveIndex(first);
    }
  }, [focusableIndexes, activeIndex]);

  const moveFocus = useCallback(
    (delta: 1 | -1) => {
      if (focusableIndexes.length === 0) return;
      const currentPos = Math.max(
        0,
        focusableIndexes.indexOf(activeIndex),
      );
      const nextPos =
        (currentPos + delta + focusableIndexes.length) %
        focusableIndexes.length;
      const nextActionIndex = focusableIndexes[nextPos];
      if (typeof nextActionIndex !== 'number') return;
      setActiveIndex(nextActionIndex);
      buttonRefs.current[nextActionIndex]?.focus();
    },
    [focusableIndexes, activeIndex],
  );

  const moveTo = useCallback(
    (target: 'first' | 'last') => {
      if (focusableIndexes.length === 0) return;
      const idx =
        target === 'first'
          ? focusableIndexes[0]
          : focusableIndexes[focusableIndexes.length - 1];
      if (typeof idx !== 'number') return;
      setActiveIndex(idx);
      buttonRefs.current[idx]?.focus();
    },
    [focusableIndexes],
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
        case 'Escape':
          if (onClearSelection) {
            event.preventDefault();
            onClearSelection();
          }
          break;
        default:
          break;
      }
    },
    [moveFocus, moveTo, onClearSelection],
  );

  if (!isVisible) return null;

  const labelText = selectionLabel
    ? selectionLabel(selectedCount)
    : defaultSelectionLabel(selectedCount);

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-orientation="horizontal"
      aria-label={ariaLabel}
      data-section="command-bar"
      data-position={position}
      data-align={align}
      data-selected-count={selectedCount}
      onKeyDown={handleKeyDown}
      className={cn(
        'flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 shadow-lg',
        POSITION_CLASS[position],
        position === 'static' ? ALIGN_CLASS[align] : null,
        motionSafe &&
          'motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4',
        className,
      )}
    >
      <span
        data-section="command-bar-selection-label"
        className="text-sm font-medium"
      >
        {labelText}
      </span>

      {actions.length > 0 ? (
        <div
          data-section="command-bar-actions"
          className="flex items-center gap-1"
        >
          {actions.map((item, idx) => {
            if (isCommandBarSeparator(item)) {
              return (
                <div
                  key={item.id}
                  role="separator"
                  aria-orientation="vertical"
                  data-section="command-bar-separator"
                  className="h-5 w-px bg-border"
                />
              );
            }
            const action = item;
            const isActive = idx === activeIndex;
            const variant = action.variant ?? 'default';
            return (
              <button
                key={action.id}
                ref={(el) => {
                  buttonRefs.current[idx] = el;
                }}
                type="button"
                onClick={action.disabled ? undefined : action.onClick}
                disabled={action.disabled === true}
                tabIndex={isActive ? 0 : -1}
                aria-label={action.ariaLabel ?? action.label}
                data-section="command-bar-action"
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
                    data-section="command-bar-action-icon"
                    className="inline-flex items-center"
                  >
                    {action.icon}
                  </span>
                ) : null}
                <span data-section="command-bar-action-label">
                  {action.label}
                </span>
                {action.shortcut ? (
                  <kbd
                    data-section="command-bar-action-shortcut"
                    className="ml-1 rounded border border-border bg-muted px-1 text-xs"
                  >
                    {action.shortcut}
                  </kbd>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {showClearButton && onClearSelection ? (
        <button
          type="button"
          onClick={onClearSelection}
          data-section="command-bar-clear"
          aria-label={clearLabel}
          className="ml-2 inline-flex items-center rounded px-2 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {clearLabel}
        </button>
      ) : null}
    </div>
  );
});

CommandBar.displayName = 'CommandBar';
