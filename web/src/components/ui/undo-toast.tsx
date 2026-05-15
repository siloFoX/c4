import type { HTMLAttributes } from 'react';
import { Undo2 } from 'lucide-react';
import { Button } from './button';
import { cn } from '../../lib/cn';
import type { ActiveUndo } from '../../hooks/use-undo-toast';

// (v1.11.262, TODO 11.244) Presentational undo toast. Pairs with
// `useUndoToast` for the timer / commit / undo state. Renders a
// floating card with the message, an Undo button, and a thin
// progress bar that depletes as the countdown elapses. Position
// defaults to bottom-right; callers can override via `className`.

export interface UndoToastProps extends HTMLAttributes<HTMLDivElement> {
  active: ActiveUndo;
  undoLabel?: string;
  dismissLabel?: string;
}

export function UndoToast({
  active,
  undoLabel = 'Undo',
  dismissLabel = 'Dismiss',
  className,
  ...rest
}: UndoToastProps) {
  const pctRemaining = Math.round((1 - active.progress) * 100);
  return (
    <div
      role="status"
      aria-live="polite"
      data-section="undo-toast"
      {...rest}
      className={cn(
        'fixed bottom-4 right-4 z-40 w-72 overflow-hidden rounded-lg border border-border bg-card shadow-lg',
        className,
      )}
    >
      <div className="flex items-center gap-3 px-3 py-2">
        <span className="flex-1 text-sm text-foreground">{active.message}</span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={active.undo}
          aria-label={undoLabel}
          data-testid="undo-toast-action"
        >
          <Undo2 className="mr-1 h-3.5 w-3.5" />
          {undoLabel}
        </Button>
        <button
          type="button"
          onClick={active.dismiss}
          aria-label={dismissLabel}
          data-testid="undo-toast-dismiss"
          className="text-muted-foreground hover:text-foreground"
        >
          <span aria-hidden="true">x</span>
        </button>
      </div>
      {/* Countdown progress bar -- thin strip pinned to the bottom
          of the card. Width tracks the remaining fraction so the
          operator sees the window depleting in real time. */}
      <div
        role="progressbar"
        aria-label="Undo countdown"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pctRemaining}
        data-testid="undo-toast-progress"
        className="h-1 w-full bg-muted"
      >
        <div
          className="h-full bg-primary transition-[width] duration-75 ease-linear"
          style={{ width: `${pctRemaining}%` }}
        />
      </div>
    </div>
  );
}

UndoToast.displayName = 'UndoToast';
