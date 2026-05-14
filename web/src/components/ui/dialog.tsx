import { useCallback, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/cn';
import { useFocusTrap } from '../../hooks/use-focus-trap';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  className,
}: DialogProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useFocusTrap(cardRef, {
    active: open,
    onEscape: onClose,
  });

  const handleBackdropClick = useCallback(() => {
    onClose();
  }, [onClose]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  const node = (
    <div
      data-dialog-backdrop
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={cn(
          'w-full max-w-lg rounded-lg border border-border bg-card p-4 shadow-xl outline-none',
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {title ? (
          <h2
            id={titleId}
            className="text-base font-semibold text-foreground"
          >
            {title}
          </h2>
        ) : null}
        {children ? <div className={title ? 'mt-2' : undefined}>{children}</div> : null}
        {footer ? <div className="mt-4 flex justify-end gap-2">{footer}</div> : null}
      </div>
    </div>
  );

  return createPortal(node, document.body);
}

Dialog.displayName = 'Dialog';
