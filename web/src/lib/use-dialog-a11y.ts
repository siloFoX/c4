import { useEffect, type RefObject } from 'react';

// (v1.10.755) Generic dialog accessibility wiring —
// Escape-to-close (busy-gated, with stopPropagation
// so a parent dialog above doesn't also close), focus
// the dialog on open, and restore the previously-
// focused element when the dialog closes. The
// stopPropagation is what distinguishes this from
// the simpler `useEscapeToClose` (lib/use-escape-
// to-close.ts) — confirm dialogs typically nest under
// another modal that owns its own keydown listener.
//
// Only fires while `open` is true; a tear-down
// closure restores the prior `document.activeElement`
// so the operator returns to the trigger element
// after dismiss.

export function useDialogA11y(args: {
  open: boolean;
  busy: boolean;
  onCancel: () => void;
  dialogRef: RefObject<HTMLElement | null>;
}): void {
  const { open, busy, onCancel, dialogRef } = args;
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
  }, [open, busy, onCancel, dialogRef]);
}
