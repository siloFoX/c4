import { useEffect, useState } from 'react';
import { applyTheme, readTheme, writeTheme, type ThemeMode } from './preferences';

// (v1.10.671) Extracted from App. Three slices in one
// hook: the persisted `theme` state slot, the
// write+apply effect that runs on every change, and the
// OS-prefers-color-scheme listener that re-applies
// `'system'` whenever the user's macOS / Windows theme
// flips. Cross-tab storage sync is *not* part of this
// hook — that listener is shared with the four other
// preferences and stays in App's storage useEffect.

interface ThemeBundle {
  theme: ThemeMode;
  setTheme: (next: ThemeMode) => void;
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

  return { theme, setTheme };
}
