import { forwardRef } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Button } from './button';
import { IconButton } from './icon-button';
import { useReducedMotion } from '../../hooks/use-reduced-motion';

export interface BulkAction {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  onClick: () => void;
  tone?: 'default' | 'danger';
  disabled?: boolean;
}

export interface BulkActionToolbarProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'role'> {
  selectedCount: number;
  actions: BulkAction[];
  onClearSelection?: () => void;
  position?: 'top' | 'bottom';
  ariaLabel?: string;
}

const POSITION_CLASSES: Record<NonNullable<BulkActionToolbarProps['position']>, string> = {
  bottom: 'fixed bottom-4 left-1/2 -translate-x-1/2 z-40',
  top: 'sticky top-0 z-30 mx-auto',
};

const ENTRANCE_CLASSES: Record<NonNullable<BulkActionToolbarProps['position']>, string> = {
  bottom: 'animate-in fade-in slide-in-from-bottom-2 duration-200',
  top: 'animate-in fade-in slide-in-from-top-2 duration-200',
};

export const BulkActionToolbar = forwardRef<HTMLDivElement, BulkActionToolbarProps>(
  (
    {
      selectedCount,
      actions,
      onClearSelection,
      position = 'bottom',
      ariaLabel,
      className,
      ...rest
    },
    ref,
  ) => {
    const reducedMotion = useReducedMotion();
    if (selectedCount <= 0) return null;

    const countLabel = `${selectedCount} ${selectedCount === 1 ? 'item selected' : 'selected'}`;

    return (
      <div
        ref={ref}
        role="toolbar"
        aria-label={ariaLabel ?? 'Bulk actions'}
        className={cn(
          'flex items-center gap-3 rounded-full border border-border bg-card/95 px-4 py-2 shadow-lg backdrop-blur',
          POSITION_CLASSES[position],
          reducedMotion ? '' : ENTRANCE_CLASSES[position],
          className,
        )}
        {...rest}
      >
        <span className="text-sm font-medium text-foreground">{countLabel}</span>
        <div className="flex items-center gap-2">
          {actions.map((action) => (
            <Button
              key={action.id}
              size="sm"
              variant={action.tone === 'danger' ? 'destructive' : 'default'}
              disabled={action.disabled}
              onClick={action.onClick}
              data-action-id={action.id}
            >
              {action.icon != null ? (
                <span className="inline-flex shrink-0 items-center" aria-hidden>
                  {action.icon}
                </span>
              ) : null}
              <span>{action.label}</span>
            </Button>
          ))}
        </div>
        {onClearSelection ? (
          <IconButton
            aria-label="Clear selection"
            icon={<X className="h-4 w-4" />}
            onClick={onClearSelection}
            className="ml-1 h-7 w-7 min-h-0 min-w-0"
          />
        ) : null}
      </div>
    );
  },
);
BulkActionToolbar.displayName = 'BulkActionToolbar';
