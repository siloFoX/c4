import { useEffect, type MutableRefObject } from 'react';

// (v1.10.756) Extracted from XtermView. Wires the
// Ctrl+F (open search overlay) and Escape (close
// when open) keybinds — the listener is scoped to
// the terminal container so the same chord doesn't
// fire when focus is in the chat composer or
// elsewhere on the page. The dep on `searchOpen`
// rebuilds the listener so the Escape-when-open
// branch sees a fresh closure value.

export function useXtermSearchHotkey(args: {
  containerRef: MutableRefObject<HTMLElement | null>;
  searchOpen: boolean;
  setSearchOpen: (next: boolean) => void;
}): void {
  const { containerRef, searchOpen, setSearchOpen } = args;
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === 'Escape' && searchOpen) {
        setSearchOpen(false);
      }
    };
    container.addEventListener('keydown', onKey);
    return () => container.removeEventListener('keydown', onKey);
  }, [containerRef, searchOpen, setSearchOpen]);
}
