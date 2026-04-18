import type { DetailMode } from '../components/layout/DetailTabs';
import type { SidebarMode } from '../components/layout/Sidebar';
import type { TopView } from '../components/layout/TopTabs';

export type ThemeMode = 'light' | 'dark' | 'system';

export const SIDEBAR_MODE_KEY = 'c4.sidebar.mode';
export const DETAIL_MODE_KEY = 'c4.detail.mode';
export const TOP_VIEW_KEY = 'c4.topView';
export const THEME_KEY = 'c4.theme';

export const DEFAULT_SIDEBAR_MODE: SidebarMode = 'list';
export const DEFAULT_DETAIL_MODE: DetailMode = 'terminal';
export const DEFAULT_TOP_VIEW: TopView = 'workers';
export const DEFAULT_THEME: ThemeMode = 'dark';

const SIDEBAR_VALUES: readonly SidebarMode[] = ['list', 'tree'];
const DETAIL_VALUES: readonly DetailMode[] = ['terminal', 'chat', 'control'];
const TOP_VIEW_VALUES: readonly TopView[] = [
  'workers',
  'history',
  'chat',
  'workflows',
];
const THEME_VALUES: readonly ThemeMode[] = ['light', 'dark', 'system'];

function readString(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeString(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private-mode browsers may throw; preferences stay in-memory only.
  }
}

function removeString(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function readEnum<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const raw = readString(key);
  return (allowed as readonly string[]).includes(raw ?? '')
    ? (raw as T)
    : fallback;
}

export function readSidebarMode(): SidebarMode {
  return readEnum(SIDEBAR_MODE_KEY, SIDEBAR_VALUES, DEFAULT_SIDEBAR_MODE);
}

export function readDetailMode(): DetailMode {
  return readEnum(DETAIL_MODE_KEY, DETAIL_VALUES, DEFAULT_DETAIL_MODE);
}

export function readTopView(): TopView {
  return readEnum(TOP_VIEW_KEY, TOP_VIEW_VALUES, DEFAULT_TOP_VIEW);
}

export function readTheme(): ThemeMode {
  return readEnum(THEME_KEY, THEME_VALUES, DEFAULT_THEME);
}

export function writeSidebarMode(value: SidebarMode): void {
  writeString(SIDEBAR_MODE_KEY, value);
}

export function writeDetailMode(value: DetailMode): void {
  writeString(DETAIL_MODE_KEY, value);
}

export function writeTopView(value: TopView): void {
  writeString(TOP_VIEW_KEY, value);
}

export function writeTheme(value: ThemeMode): void {
  writeString(THEME_KEY, value);
}

export function resetPreferences(): void {
  removeString(SIDEBAR_MODE_KEY);
  removeString(DETAIL_MODE_KEY);
  removeString(TOP_VIEW_KEY);
  removeString(THEME_KEY);
}

// Resolves 'system' to 'light'/'dark' via prefers-color-scheme.
export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'light' || mode === 'dark') return mode;
  if (typeof window === 'undefined') return 'dark';
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  } catch {
    return 'dark';
  }
}

// Applies the resolved theme to <html> by toggling the `dark` class.
export function applyTheme(mode: ThemeMode): void {
  if (typeof document === 'undefined') return;
  const resolved = resolveTheme(mode);
  const root = document.documentElement;
  if (resolved === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
}
