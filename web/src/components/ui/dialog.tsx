import { useCallback, useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import { cn } from '../../lib/cn';
import { getPortalRoot } from '../../lib/portal-root';
import { useFocusTrap } from '../../hooks/use-focus-trap';
import { motionClass } from '../../lib/motion';
import { useReducedMotion } from '../../hooks/use-reduced-motion';

// (v1.11.302, TODO 11.284) Dialog enhancements:
//   - `variant: 'default' | 'destructive' | 'confirmation'`
//     -- visual treatment for the panel border + an optional
//     leading icon in the header. Destructive surfaces the
//     AlertTriangle palette; confirmation surfaces the
//     HelpCircle (question-mark) glyph.
//   - `description?: ReactNode` -- header subtitle slot
//     wired through aria-describedby so screen-reader users
//     hear the body context after the title.
//   - `lockBodyScroll?: boolean` (default true) -- prevents
//     the underlying page from scrolling while the modal is
//     open by toggling document.body.style.overflow.
//   - `closeOnBackdropClick?: boolean` (default true) -- opt
//     out so confirmation flows can require the explicit
//     Cancel button instead of a stray backdrop tap.
//   - data-section selectors:
//     `data-section="dialog-backdrop"` on the scrim,
//     `data-section="dialog"` on the panel,
//     `data-variant` on the panel.

export type DialogVariant = 'default' | 'destructive' | 'confirmation';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  variant?: DialogVariant;
  // (v1.11.302) Optional leading icon override. When false
  // suppresses the auto-icon shipped with destructive /
  // confirmation variants. When a ReactNode, replaces the
  // auto-icon verbatim. Default (undefined) renders the
  // per-variant icon.
  icon?: ReactNode | false;
  lockBodyScroll?: boolean;
  closeOnBackdropClick?: boolean;
  closeOnEsc?: boolean;
  className?: string;
}

const VARIANT_BORDER: Record<DialogVariant, string> = {
  default: 'border-border',
  destructive: 'border-destructive/40',
  confirmation: 'border-warning/40',
};

const VARIANT_ICON: Record<DialogVariant, ReactNode | null> = {
  default: null,
  destructive: (
    <AlertTriangle
      className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
      aria-hidden="true"
    />
  ),
  confirmation: (
    <HelpCircle
      className="mt-0.5 h-4 w-4 shrink-0 text-warning"
      aria-hidden="true"
    />
  ),
};

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  variant = 'default',
  icon,
  lockBodyScroll = true,
  closeOnBackdropClick = true,
  closeOnEsc = true,
  className,
}: DialogProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const reducedMotion = useReducedMotion();

  useFocusTrap(cardRef, {
    active: open,
    ...(closeOnEsc ? { onEscape: onClose } : {}),
  });

  // (v1.11.302, TODO 11.284) Body scroll lock. Saves the
  // previous overflow value so the cleanup restores it
  // verbatim -- avoids stomping on a host page that already
  // set overflow:hidden for its own reason.
  useEffect(() => {
    if (!open) return;
    if (!lockBodyScroll) return;
    if (typeof document === 'undefined') return;
    const body = document.body;
    const prev = body.style.overflow;
    body.style.overflow = 'hidden';
    return () => {
      body.style.overflow = prev;
    };
  }, [open, lockBodyScroll]);

  const handleBackdropClick = useCallback(() => {
    if (closeOnBackdropClick) onClose();
  }, [closeOnBackdropClick, onClose]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  const resolvedIcon: ReactNode | null =
    icon === false ? null : icon !== undefined ? icon : VARIANT_ICON[variant];

  const ariaDescribedBy = description ? descriptionId : undefined;

  const node = (
    <div
      data-dialog-backdrop
      data-section="dialog-backdrop"
      className={cn(
        'fixed inset-0 z-[100] flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm',
        motionClass('fadeIn', reducedMotion),
      )}
      onClick={handleBackdropClick}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={ariaDescribedBy}
        data-section="dialog"
        data-variant={variant}
        tabIndex={-1}
        className={cn(
          'w-full max-w-lg rounded-lg border bg-card p-4 shadow-xl outline-none',
          VARIANT_BORDER[variant],
          motionClass('scaleIn', reducedMotion),
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || resolvedIcon) ? (
          <div className="flex items-start gap-2">
            {resolvedIcon}
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
                  className={cn(
                    'text-xs text-muted-foreground',
                    title ? 'mt-1' : undefined,
                  )}
                >
                  {description}
                </p>
              ) : null}
            </div>
          </div>
        ) : description ? (
          <p
            id={descriptionId}
            className="text-xs text-muted-foreground"
          >
            {description}
          </p>
        ) : null}
        {children ? (
          <div
            data-section="dialog-body"
            className={title || description || resolvedIcon ? 'mt-2' : undefined}
          >
            {children}
          </div>
        ) : null}
        {footer ? (
          <div
            data-section="dialog-footer"
            className="mt-4 flex justify-end gap-2"
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );

  const target = getPortalRoot('dialog-root') ?? document.body;
  return createPortal(node, target);
}

Dialog.displayName = 'Dialog';
