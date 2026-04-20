import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Button, IconButton } from './ui';
import { cn } from '../lib/cn';
import { t, useLocale } from '../lib/i18n';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  // Concrete preview — list of items that will be affected (e.g. the
  // branches + worktrees about to be deleted). Rendered verbatim so the
  // caller can pass any ReactNode, not just strings.
  preview?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// 8.33: shared confirm dialog for destructive actions. Callers pass a
// concrete preview (the actual items to be removed/rolled-back) so the
// user sees WHAT is about to happen, not just a yes/no prompt.

export function ConfirmDialog({
  open,
  title,
  description,
  preview,
  confirmLabel,
  cancelLabel,
  destructive = true,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useLocale();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prevActive =
      typeof document !== 'undefined'
        ? (document.activeElement as HTMLElement | null)
        : null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    dialogRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      prevActive?.focus?.();
    };
  }, [open, busy, onCancel]);

  if (!open) return null;

  const confirmText = confirmLabel || t('common.confirm');
  const cancelText = cancelLabel || t('common.cancel');

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          'w-full max-w-lg rounded-lg border border-border bg-card p-4 shadow-xl outline-none',
          destructive && 'border-destructive/40',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            {destructive && (
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
                aria-hidden="true"
              />
            )}
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
          </div>
          <IconButton
            aria-label={t('common.close')}
            onClick={onCancel}
            disabled={busy}
            icon={<X className="h-4 w-4" />}
          />
        </div>
        {description && (
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        )}
        {preview && (
          <div className="mt-3 rounded-md border border-border bg-muted/30 p-3 text-xs">
            <div className="mb-1 uppercase tracking-wide text-muted-foreground">
              {t('common.preview')}
            </div>
            <div>{preview}</div>
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelText}
          </Button>
          <Button
            type="button"
            variant={destructive ? 'destructive' : 'default'}
            size="sm"
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
}

ConfirmDialog.displayName = 'ConfirmDialog';
