// Theme toggle — persists choice in localStorage and sets `data-theme` on
// <html> so the CSS in index.css picks it up. Defaults follow the OS
// preference until the user explicitly selects.

export type Theme = 'dark' | 'light' | 'auto';

const KEY = 'c4.theme';

export function getTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'dark' || v === 'light' || v === 'auto') return v;
  } catch {}
  return 'auto';
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'auto') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', theme);
  }
}

export function setTheme(theme: Theme) {
  try { localStorage.setItem(KEY, theme); } catch {}
  applyTheme(theme);
}

export function initTheme() {
  applyTheme(getTheme());
}
