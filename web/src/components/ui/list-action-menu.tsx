import { forwardRef } from 'react';
import type { ReactNode } from 'react';
import { MoreVertical } from 'lucide-react';
import { cn } from '../../lib/cn';
import { IconButton } from './icon-button';
import {
  DropdownMenu,
  type DropdownMenuItem,
  type DropdownPlacement,
} from './dropdown-menu';

// (v1.11.280, TODO 11.262) ListActionMenu -- canonical "row
// overflow" affordance: a three-dot vertical-ellipsis IconButton
// that opens a DropdownMenu of action rows (rename, duplicate,
// archive, delete with destructive variant). Built as a thin
// composition over the existing DropdownMenu primitive so it
// inherits the keyboard contract (ArrowUp/Down navigation,
// type-ahead, Escape close, Enter select), the WAI-ARIA role +
// `aria-expanded` plumbing, and the focus-return-to-trigger
// behaviour that DropdownMenu already implements. The thin
// wrapper trims the cost-per-adoption from "wire IconButton +
// MoreVertical icon + DropdownMenu + items map every time" to a
// one-prop call: `<ListActionMenu actions={...} />`.
//
// The component is intentionally narrow: it only models the
// "three-dot at end of list row" case. For richer menus
// (multi-section, header content, custom triggers) reach for
// `<DropdownMenu>` directly.

export type ListActionMenuSize = 'sm' | 'md';

export interface ListActionMenuAction {
  id: string;
  label: ReactNode;
  // Optional leading icon (lucide). Pass `undefined` for text-only rows.
  icon?: ReactNode;
  // Optional muted hint text rendered to the right of the label.
  hint?: ReactNode;
  // 'default' = neutral row; 'danger' = destructive (red).
  variant?: 'default' | 'danger';
  disabled?: boolean;
  onSelect: () => void;
  // Forwarded from DropdownMenuItem.onPrefetch: fires on hover /
  // focus before commit so call sites can warm a lazy chunk.
  onPrefetch?: () => void;
}

export interface ListActionMenuProps {
  actions: ListActionMenuAction[];
  size?: ListActionMenuSize;
  ariaLabel?: string;
  placement?: DropdownPlacement;
  // Optional override of the trigger button's accessible name.
  // Defaults to `ariaLabel` -> "Row actions" so the trigger always
  // has a screen-reader name even when the parent omits both.
  triggerAriaLabel?: string;
  // Custom data-testid on the trigger button -- useful when the
  // adopter needs to address a specific row's menu in e2e.
  triggerTestId?: string;
  className?: string;
}

const SIZE_PX: Record<ListActionMenuSize, { trigger: string; glyph: string }> = {
  sm: { trigger: 'h-6 w-6', glyph: 'h-3 w-3' },
  md: { trigger: 'h-7 w-7', glyph: 'h-3.5 w-3.5' },
};

// Adapt the public ListActionMenuAction shape to DropdownMenuItem.
// Kept as a separate function (rather than inlining inside the
// render) so tests can verify the mapping in isolation.
export function toDropdownItem(
  action: ListActionMenuAction,
): DropdownMenuItem {
  const base: DropdownMenuItem = {
    key: action.id,
    label: action.label,
    onSelect: action.onSelect,
  };
  if (action.icon !== undefined) base.icon = action.icon;
  if (action.hint !== undefined) base.hint = action.hint;
  if (action.variant !== undefined) base.variant = action.variant;
  if (action.disabled !== undefined) base.disabled = action.disabled;
  if (action.onPrefetch !== undefined) base.onPrefetch = action.onPrefetch;
  return base;
}

export const ListActionMenu = forwardRef<HTMLDivElement, ListActionMenuProps>(
  (
    {
      actions,
      size = 'md',
      ariaLabel,
      placement = 'bottom',
      triggerAriaLabel,
      triggerTestId,
      className,
    },
    ref,
  ) => {
    const sizing = SIZE_PX[size];
    const menuAriaLabel = ariaLabel ?? 'Row actions';
    const trigger = (
      <IconButton
        type="button"
        variant="ghost"
        aria-label={triggerAriaLabel ?? menuAriaLabel}
        data-section="list-action-menu-trigger"
        data-size={size}
        {...(triggerTestId ? { 'data-testid': triggerTestId } : {})}
        className={cn(sizing.trigger, 'shrink-0 rounded-md')}
        icon={<MoreVertical aria-hidden="true" className={sizing.glyph} />}
      />
    );

    return (
      <div
        ref={ref}
        data-section="list-action-menu"
        data-size={size}
        className={cn('inline-flex shrink-0', className)}
      >
        <DropdownMenu
          trigger={trigger}
          items={actions.map(toDropdownItem)}
          placement={placement}
          ariaLabel={menuAriaLabel}
        />
      </div>
    );
  },
);
ListActionMenu.displayName = 'ListActionMenu';
