import {
  useCallback,
  useEffect,
  useId,
  useRef,
} from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/cn';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}

// Selector matching focusable elements inside the card. Mirrors the
// canonical list used by most a11y libraries; sufficient for the
// modals in this codebase (button / link / input / select / textarea
// / explicit tabindex>=0).
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusables(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1);
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

  // Escape closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Initial focus on open: first focusable inside card, else the card.
  useEffect(() => {
    if (!open) return;
    const card = cardRef.current;
    if (!card) return;
    const focusables = getFocusables(card);
    if (focusables.length > 0) {
      focusables[0].focus();
    } else {
      card.focus();
    }
  }, [open]);

  // Focus trap: Tab / Shift+Tab cycle inside card.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const card = cardRef.current;
      if (!card) return;
      const focusables = getFocusables(card);
      if (focusables.length === 0) {
        e.preventDefault();
        card.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !card.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !card.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

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
