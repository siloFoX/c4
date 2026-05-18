import { useEffect, useState } from 'react';
import {
  applyTheme,
  readTheme,
  writeTheme,
  THEME_KEY,
  type ThemeMode,
} from './preferences';

// (v1.10.671) Extracted from App. Three slices in one
// hook: the persisted `theme` state slot, the
// write+apply effect that runs on every change, and the
// OS-prefers-color-scheme listener that re-applies
// `'system'` whenever the user's macOS / Windows theme
// flips.
//
// (v1.11.371, TODO 11.353) Adds the cross-tab
// `storage` event listener so a theme flip in one tab
// immediately re-applies in every other open tab.
// Previously this was wired at App level alongside the
// four other preferences -- moving it into the hook
// keeps the theme primitive self-contained and lets
// tests drive the cross-tab path through the hook
// directly.

interface ThemeBundle {
  theme: ThemeMode;
  setTheme: (next: ThemeMode) => void;
}

function isValidTheme(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function useTheme(): ThemeBundle {
  const [theme, setTheme] = useState<ThemeMode>(readTheme);

  useEffect(() => {
    writeTheme(theme);
    applyTheme(theme);
  }, [theme]);

  // Track OS theme changes when user picked 'system'.
  useEffect(() => {
    if (theme !== 'system' || typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  // (v1.11.371, TODO 11.353) Cross-tab sync.
  // When another tab writes the theme into
  // localStorage, the browser dispatches a
  // `storage` event to every other tab; we
  // mirror the value into local state so the
  // tab re-applies the theme without a reload.
  // `e.newValue === null` is a `localStorage.clear()`
  // signal -- fall back to the read-from-storage
  // default so the tab does not get stuck on a
  // stale value.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = (e: StorageEvent): void => {
      if (e.key !== THEME_KEY) return;
      if (e.newValue === null) {
        setTheme(readTheme());
        return;
      }
      if (isValidTheme(e.newValue)) {
        setTheme(e.newValue);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return { theme, setTheme };
}
