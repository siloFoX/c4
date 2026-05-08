import { useCallback, useEffect, useState } from 'react';

// (v1.10.637) Extracted from WorkerDetail. Owns a clamped font
// size that persists to localStorage, with a `bump(delta)`
// helper for the +/- buttons. Initial value reads
// localStorage on mount; mutations write back, swallowing
// quota / disabled-storage errors.

const FONT_STORAGE_KEY = 'c4.term.fontSize';

function clamp(n: number, lo: number, hi: number) {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}

function readNumberStorage(key: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw == null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

interface PersistedFontSize {
  fontSize: number;
  setFontSize: (next: number) => void;
  bumpFont: (delta: number) => void;
}

export function usePersistedFontSize(args: {
  defaultFont: number;
  minFont: number;
  maxFont: number;
}): PersistedFontSize {
  const { defaultFont, minFont, maxFont } = args;
  const [fontSize, setFontSize] = useState<number>(() =>
    clamp(readNumberStorage(FONT_STORAGE_KEY, defaultFont), minFont, maxFont),
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(FONT_STORAGE_KEY, String(fontSize));
    } catch {
      /* ignore quota / disabled storage */
    }
  }, [fontSize]);

  const bumpFont = useCallback((delta: number) => {
    setFontSize((prev) => clamp(prev + delta, minFont, maxFont));
  }, [minFont, maxFont]);

  return { fontSize, setFontSize, bumpFont };
}
