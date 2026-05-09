import { useEffect } from 'react';

// (v1.10.714) Generic Escape-key dismissal listener
// for modals / dialogs / overlays. Mounts a window
// keydown listener only while `open` is true; the
// optional `busy` gate suppresses dismissal during
// in-flight submits so a stray Esc does not
// unmount the modal mid-POST.

export function useEscapeToClose(args: {
  open: boolean;
  onClose: () => void;
  busy?: boolean;
}): void {
  const { open, onClose, busy } = args;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (busy) return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);
}
