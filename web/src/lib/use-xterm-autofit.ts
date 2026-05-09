import { useCallback, useRef, type MutableRefObject } from 'react';
import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import { apiFetch } from './api';

// (v1.10.672) Extracted from XtermView. Owns the
// fit→POST /api/resize loop: a 120ms debounce shared
// across window.resize + ResizeObserver, a `lastResize`
// ref that drops no-op requests, and a clamp that
// mirrors the daemon-side `_clampResizeDims` in
// `src/pty-manager.js` so the UI never asks for
// something the daemon will reject.

const FIT_DEBOUNCE_MS = 120;

// Mirrors src/pty-manager.js _clampResizeDims.
const MIN_COLS = 20;
const MAX_COLS = 400;
const MIN_ROWS = 5;
const MAX_ROWS = 200;

// VITE_AUTOFIT_DEBUG=1 prints one console.debug per recompute.
const AUTOFIT_DEBUG: boolean = (() => {
  try {
    const env = (import.meta as unknown as { env?: Record<string, unknown> }).env;
    const v = env?.['VITE_AUTOFIT_DEBUG'];
    return v === '1' || v === 'true' || v === true;
  } catch {
    return false;
  }
})();

function clampInt(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}

interface XtermAutofitState {
  fitTimerRef: MutableRefObject<number | null>;
  lastResizeRef: MutableRefObject<{ cols: number; rows: number } | null>;
  runFit: () => void;
  scheduleFit: () => void;
}

export function useXtermAutofit(args: {
  termRef: MutableRefObject<Terminal | null>;
  fitRef: MutableRefObject<FitAddon | null>;
  workerName: string;
}): XtermAutofitState {
  const { termRef, fitRef, workerName } = args;
  const fitTimerRef = useRef<number | null>(null);
  const lastResizeRef = useRef<{ cols: number; rows: number } | null>(null);

  const runFit = useCallback(() => {
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term || !fit) return;
    try {
      fit.fit();
    } catch {
      // fit throws if the container is 0x0 (tab hidden). Bail -- next
      // resize event will retry once the terminal is visible.
      return;
    }
    const rawCols = term.cols;
    const rawRows = term.rows;
    if (!Number.isFinite(rawCols) || !Number.isFinite(rawRows) || rawCols <= 0 || rawRows <= 0) return;
    const cols = clampInt(rawCols, MIN_COLS, MAX_COLS);
    const rows = clampInt(rawRows, MIN_ROWS, MAX_ROWS);
    const last = lastResizeRef.current;
    if (last && last.cols === cols && last.rows === rows) return;
    lastResizeRef.current = { cols, rows };
    if (AUTOFIT_DEBUG) {
      // eslint-disable-next-line no-console
      console.debug('[autofit] cols=%d rows=%d -> POST /api/resize', cols, rows);
    }
    void apiFetch('/api/resize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: workerName, cols, rows }),
    }).catch(() => {
      // Resize is best-effort; the daemon already clamps via
      // _clampResizeDims and a failed POST just means the next fit tries
      // again. Swallow so we do not page on transient HTTP hiccups.
    });
  }, [workerName, termRef, fitRef]);

  const scheduleFit = useCallback(() => {
    if (fitTimerRef.current != null) {
      window.clearTimeout(fitTimerRef.current);
    }
    fitTimerRef.current = window.setTimeout(() => {
      fitTimerRef.current = null;
      runFit();
    }, FIT_DEBOUNCE_MS);
  }, [runFit]);

  return { fitTimerRef, lastResizeRef, runFit, scheduleFit };
}

export { FIT_DEBOUNCE_MS, MIN_COLS, MAX_COLS, MIN_ROWS, MAX_ROWS };
