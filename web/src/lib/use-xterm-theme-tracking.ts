import { useEffect, type RefObject } from 'react';
import type { Terminal } from '@xterm/xterm';
import { buildXtermTheme } from './xterm-theme';

// (v1.10.645) Extracted from XtermView. Watches `<html>`'s
// classList for the shadcn dark-mode flip and rebuilds the
// xterm theme each time. Runs once on mount to apply the
// initial theme too. Re-runs when `workerName` changes so a
// fresh terminal swap-in always picks up the current theme.

export function useXtermThemeTracking(args: {
  termRef: RefObject<Terminal | null>;
  workerName: string;
}): void {
  const { termRef, workerName } = args;
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    const apply = () => {
      term.options.theme = buildXtermTheme();
    };
    apply();
    if (typeof MutationObserver === 'undefined') return;
    const obs = new MutationObserver(apply);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => obs.disconnect();
  }, [workerName]);
}
