import { useEffect, type RefObject } from 'react';

// (v1.10.691) Extracted from HelpDrawer. Bundles the
// Esc-to-close + focus-on-open contract for a sliding
// drawer. The raf-delay before focus lets the slide-in
// animation finish first so screen readers announce
// the focused element after it lands at its final
// position.

export function useDrawerKeyboard(args: {
  open: boolean;
  onClose: () => void;
  focusRef: RefObject<HTMLElement | HTMLInputElement | null>;
}): void {
  const { open, onClose, focusRef } = args;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const raf = window.requestAnimationFrame(() => focusRef.current?.focus());
    return () => {
      window.removeEventListener('keydown', onKey);
      window.cancelAnimationFrame(raf);
    };
  }, [open, onClose, focusRef]);
}
