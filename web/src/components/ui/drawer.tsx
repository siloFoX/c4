import { forwardRef, useCallback, useId, useImperativeHandle, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useFocusTrap } from '../../hooks/use-focus-trap';

export type DrawerSide = 'left' | 'right';

export interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side?: DrawerSide;
  width?: number | string;
  title?: ReactNode;
  description?: ReactNode;
  showCloseButton?: boolean;
  closeOnBackdropClick?: boolean;
  closeOnEsc?: boolean;
  className?: string;
  children: ReactNode;
}

export const Drawer = forwardRef<HTMLDivElement, DrawerProps>(function Drawer(
  {
    open,
    onOpenChange,
    side = 'right',
    width = '320px',
    title,
    description,
    showCloseButton = true,
    closeOnBackdropClick = true,
    closeOnEsc = true,
    className,
    children,
  },
  forwardedRef,
) {
  const panelRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(forwardedRef, () => panelRef.current as HTMLDivElement);

  const titleId = useId();
  const descriptionId = useId();

  useFocusTrap(panelRef, {
    active: open,
    restoreFocusOnUnmount: true,
    onEscape: closeOnEsc ? () => onOpenChange(false) : undefined,
  });

  const handleBackdropClick = useCallback(() => {
    if (closeOnBackdropClick) onOpenChange(false);
  }, [closeOnBackdropClick, onOpenChange]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  const widthStyle: CSSProperties = {
    width: typeof width === 'number' ? `${width}px` : width,
  };

  const sideClasses =
    side === 'left'
      ? 'left-0 border-r border-border'
      : 'right-0 border-l border-border';

  const node = (
    <div
      data-drawer-backdrop
      className="fixed inset-0 z-[100] bg-black/40 animate-in fade-in"
      onClick={handleBackdropClick}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        data-drawer-side={side}
        style={widthStyle}
        className={cn(
          // (v1.11.253, TODO 11.235) `motion-duration-normal` +
          // `motion-ease-standard` route Drawer transform through
          // the central scale (`styles/motion.css`) instead of
          // Tailwind's default 150ms/ease-in-out. Standard easing
          // matches Dialog / Popover / Toast so a Drawer that
          // opens beside a Dialog reads on the same curve.
          'fixed top-0 bottom-0 flex max-w-full flex-col bg-background text-foreground shadow-xl outline-none transition-transform motion-duration-normal motion-ease-standard',
          sideClasses,
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || description || showCloseButton) && (
          <div className="flex items-start justify-between gap-2 border-b border-border p-4">
            <div className="min-w-0 flex-1">
              {title ? (
                <h2
                  id={titleId}
                  className="text-base font-semibold text-foreground"
                >
                  {title}
                </h2>
              ) : null}
              {description ? (
                <p
                  id={descriptionId}
                  className="mt-1 text-xs text-muted-foreground"
                >
                  {description}
                </p>
              ) : null}
            </div>
            {showCloseButton ? (
              <button
                type="button"
                aria-label="Close"
                data-drawer-close
                onClick={() => onOpenChange(false)}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
});

Drawer.displayName = 'Drawer';
