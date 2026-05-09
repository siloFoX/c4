import { useEffect, type RefObject } from 'react';

// (v1.10.692) Extracted from HelpDrawer. When `open`
// flips true (or `key` changes while open), scroll the
// referenced element into view on the next animation
// frame so the slide-in transition has time to settle.
// `block: 'start'` matches the original behaviour;
// callers that need a different scroll origin can fork
// this when they need it.

export function useScrollIntoViewOnOpen(args: {
  open: boolean;
  ref: RefObject<HTMLElement | null>;
  key?: unknown;
}): void {
  const { open, ref, key } = args;
  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      ref.current?.scrollIntoView({
        behavior: 'auto',
        block: 'start',
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, key, ref]);
}
