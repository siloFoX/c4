import { useCallback, useEffect, useState } from 'react';

// (v1.11.263, TODO 11.245) Operator-local density preference.
// Three modes adjust the global spacing scale:
//   - compact:     tight rows / minimum padding, table-heavy workflows
//   - comfortable: shadcn defaults (the prior implicit baseline)
//   - cozy:        relaxed padding / generous gaps, easier on the eye
//
// The hook mirrors `use-theme`'s shape so adopting sites follow a
// familiar pattern: read via the hook, write via `setDensity`,
// hydrate from localStorage on mount, and reflect the choice on
// `<html data-density="...">` so CSS rules in `index.css` can swap
// the spacing variables (`--density-row-h`, `--density-card-p`,
// `--density-gap-x`).
//
// Persistence:
//   storage key: `c4:density`
//   accepted values: `compact | comfortable | cozy`
//   default: `comfortable`
//
// Cross-tab sync:
//   - `window.storage` event when the same key changes in another tab.
//   - Same-tab updates dispatch a `c4:density-changed` CustomEvent so
//     siblings in the same tab also re-sync.

export type Density = 'compact' | 'comfortable' | 'cozy';

const STORAGE_KEY = 'c4:density';
export const DENSITY_EVENT = 'c4:density-changed';
export const DEFAULT_DENSITY: Density = 'comfortable';
export const DENSITY_VALUES: readonly Density[] = [
  'compact',
  'comfortable',
  'cozy',
];

function isDensity(value: unknown): value is Density {
  return (
    value === 'compact' || value === 'comfortable' || value === 'cozy'
  );
}

function readStored(): Density {
  if (typeof window === 'undefined') return DEFAULT_DENSITY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isDensity(raw) ? raw : DEFAULT_DENSITY;
  } catch {
    return DEFAULT_DENSITY;
  }
}

function applyToDocument(density: Density): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-density', density);
}

export interface UseDensityResult {
  density: Density;
  setDensity: (next: Density) => void;
}

export function useDensity(): UseDensityResult {
  const [density, setDensityState] = useState<Density>(() => readStored());

  useEffect(() => {
    applyToDocument(density);
  }, [density]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      const next = isDensity(e.newValue) ? e.newValue : DEFAULT_DENSITY;
      setDensityState(next);
    };
    const onCustom = (e: Event) => {
      const ce = e as CustomEvent<{ density?: Density }>;
      if (ce.detail?.density && isDensity(ce.detail.density)) {
        setDensityState(ce.detail.density);
      }
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(DENSITY_EVENT, onCustom);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(DENSITY_EVENT, onCustom);
    };
  }, []);

  const setDensity = useCallback((next: Density) => {
    setDensityState(next);
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // quota / private mode -- swallow so the UI keeps working
    }
    try {
      window.dispatchEvent(
        new CustomEvent(DENSITY_EVENT, { detail: { density: next } }),
      );
    } catch {
      // older jsdom: no CustomEvent. The storage event still covers
      // cross-tab sync; this is a best-effort same-tab hop.
    }
  }, []);

  return { density, setDensity };
}

// (v1.11.263) Spacing scale exported so call sites that want to
// reference the same values from JS (e.g. for measurements or
// computed styles) don't drift from the CSS variables in
// `index.css`. Keep in lockstep with the CSS rules.
export interface DensityScale {
  rowHeightPx: number;
  cardPaddingPx: number;
  gapXPx: number;
}

export const DENSITY_SCALE: Record<Density, DensityScale> = {
  compact: { rowHeightPx: 28, cardPaddingPx: 8, gapXPx: 6 },
  comfortable: { rowHeightPx: 36, cardPaddingPx: 16, gapXPx: 12 },
  cozy: { rowHeightPx: 44, cardPaddingPx: 24, gapXPx: 16 },
};
