import { useEffect, type MutableRefObject } from 'react';
import type { Terminal } from '@xterm/xterm';

// (v1.10.759) Extracted from XtermView. Pushes the
// `fontSize` prop into `term.options.fontSize` whenever
// it changes, then calls `scheduleFit` so the autofit
// hook recomputes columns/rows for the new metric. Kept
// out of the mount effect so a font-size flip doesn't
// drop scrollback (the mount effect re-keys on
// workerName, not fontSize).

export function useXtermFontSize(args: {
  termRef: MutableRefObject<Terminal | null>;
  fontSize: number;
  scheduleFit: () => void;
}): void {
  const { termRef, fontSize, scheduleFit } = args;
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.fontSize = fontSize;
    scheduleFit();
  }, [termRef, fontSize, scheduleFit]);
}
