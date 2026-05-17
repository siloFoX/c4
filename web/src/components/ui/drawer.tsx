import { forwardRef, useCallback, useId, useImperativeHandle, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useFocusTrap } from '../../hooks/use-focus-trap';
import { useReducedMotion } from '../../hooks/use-reduced-motion';

// (v1.11.297, TODO 11.279) Side-anchored Drawer primitive.
// Supports four anchor edges (left / right / top / bottom),
// each with its own size axis (width for left+right, height
// for top+bottom). Focus trap + Esc + backdrop-click close +
// portal mount are unchanged from the earlier left/right
// version. The slide animation is now gated by
// `useReducedMotion` so an operator with
// `prefers-reduced-motion: reduce` sees an instant open/close
// instead of the 200ms slide.

export type DrawerSide = 'left' | 'right' | 'top' | 'bottom';

export interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side?: DrawerSide;
  // For left/right drawers. Accepts a number (px) or any CSS
  // length string. Ignored for top/bottom.
  width?: number | string;
  // For top/bottom drawers. Accepts a number (px) or any CSS
  // length string. Ignored for left/right. Defaults to a
  // sensible value when omitted (`50%` for top/bottom).
  height?: number | string;
  title?: ReactNode;
  description?: ReactNode;
  showCloseButton?: boolean;
  closeOnBackdropClick?: boolean;
  closeOnEsc?: boolean;
  className?: string;
  children: ReactNode;
}

// Per-side anchor classes -- where the panel docks, plus the
// matching border so the divider sits on the canvas side.
const SIDE_ANCHOR_CLASS: Record<DrawerSide, string> = {
  left: 'left-0 top-0 bottom-0 border-r border-border',
  right: 'right-0 top-0 bottom-0 border-l border-border',
  top: 'left-0 right-0 top-0 border-b border-border',
  bottom: 'left-0 right-0 bottom-0 border-t border-border',
};

// Per-side flex direction. Left/right drawers run their body
// + footer column-wise; top/bottom drawers do the same so the
// title bar sits flush along the docking edge. Kept verbose to
// stay future-proof against per-side overrides.
const SIDE_FLEX_CLASS: Record<DrawerSide, string> = {
  left: 'flex-col',
  right: 'flex-col',
  top: 'flex-col',
  bottom: 'flex-col',
};

export const Drawer = forwardRef<HTMLDivElement, DrawerProps>(function Drawer(
  {
    open,
    onOpenChange,
    side = 'right',
    width = '320px',
    height,
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
  const reducedMotion = useReducedMotion();

  useFocusTrap(panelRef, {
    active: open,
    restoreFocusOnUnmount: true,
    ...(closeOnEsc ? { onEscape: () => onOpenChange(false) } : {}),
  });

  const handleBackdropClick = useCallback(() => {
    if (closeOnBackdropClick) onOpenChange(false);
  }, [closeOnBackdropClick, onOpenChange]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  // Side-aware sizing. For left/right drawers we set `width`;
  // for top/bottom we set `height`. `maxWidth: 100%` /
  // `maxHeight: 100%` clamps the panel so a number/length
  // larger than the viewport still fits.
  const sizeStyle: CSSProperties =
    side === 'left' || side === 'right'
      ? {
          width: typeof width === 'number' ? `${width}px` : width,
          maxWidth: '100%',
        }
      : {
          height:
            height === undefined
              ? '50%'
              : typeof height === 'number'
                ? `${height}px`
                : height,
          maxHeight: '100%',
        };

  const node = (
    <div
      data-drawer-backdrop
      data-section="drawer-backdrop"
      className={cn(
        'fixed inset-0 z-[100] bg-black/40',
        // Backdrop fade only when motion is allowed; reduced-
        // motion users get an instant overlay.
        !reducedMotion && 'animate-in fade-in',
      )}
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
        data-section="drawer"
        data-reduced-motion={reducedMotion ? 'true' : 'false'}
        style={sizeStyle}
        className={cn(
          'fixed flex max-w-full max-h-full bg-background text-foreground shadow-xl outline-none',
          SIDE_FLEX_CLASS[side],
          SIDE_ANCHOR_CLASS[side],
          // (v1.11.297) Slide transition only when the
          // operator allows motion. Otherwise the panel
          // appears in place with no transform animation.
          !reducedMotion &&
            'transition-transform motion-duration-normal motion-ease-standard',
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
