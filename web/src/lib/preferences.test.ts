import { describe, it, expect, beforeEach } from 'vitest';
import {
  SIDEBAR_MODE_KEY,
  SIDEBAR_COLLAPSED_KEY,
  DETAIL_MODE_KEY,
  TOP_VIEW_KEY,
  THEME_KEY,
  DEFAULT_SIDEBAR_MODE,
  DEFAULT_SIDEBAR_COLLAPSED,
  DEFAULT_DETAIL_MODE,
  DEFAULT_TOP_VIEW,
  DEFAULT_THEME,
  readSidebarMode,
  writeSidebarMode,
  readSidebarCollapsed,
  writeSidebarCollapsed,
  readDetailMode,
  writeDetailMode,
  readTopView,
  writeTopView,
  readTheme,
  writeTheme,
  resetPreferences,
  resolveTheme,
  applyTheme,
} from './preferences';

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.classList.remove('dark');
});

describe('readSidebarMode / writeSidebarMode', () => {
  it('returns the default when no value is stored', () => {
    expect(readSidebarMode()).toBe(DEFAULT_SIDEBAR_MODE);
  });
  it('round-trips a valid value', () => {
    writeSidebarMode('tree');
    expect(readSidebarMode()).toBe('tree');
  });
  it('falls back when an invalid value is stored', () => {
    window.localStorage.setItem(SIDEBAR_MODE_KEY, 'bogus');
    expect(readSidebarMode()).toBe(DEFAULT_SIDEBAR_MODE);
  });
});

describe('readSidebarCollapsed / writeSidebarCollapsed', () => {
  it("stores '1' for true and '0' for false", () => {
    writeSidebarCollapsed(true);
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe('1');
    writeSidebarCollapsed(false);
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe('0');
  });
  it('round-trips boolean state', () => {
    writeSidebarCollapsed(true);
    expect(readSidebarCollapsed()).toBe(true);
    writeSidebarCollapsed(false);
    expect(readSidebarCollapsed()).toBe(false);
  });
  it('falls back to default for missing or unrecognized payloads', () => {
    expect(readSidebarCollapsed()).toBe(DEFAULT_SIDEBAR_COLLAPSED);
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, 'bogus');
    expect(readSidebarCollapsed()).toBe(DEFAULT_SIDEBAR_COLLAPSED);
  });
});

describe('readDetailMode / writeDetailMode', () => {
  it('returns default when missing', () => {
    expect(readDetailMode()).toBe(DEFAULT_DETAIL_MODE);
  });
  it('round-trips a valid value', () => {
    writeDetailMode('chat');
    expect(readDetailMode()).toBe('chat');
  });
});

describe('readTopView / writeTopView', () => {
  it('returns default when missing', () => {
    expect(readTopView()).toBe(DEFAULT_TOP_VIEW);
  });
  it('round-trips a valid value', () => {
    writeTopView('history');
    expect(readTopView()).toBe('history');
  });
  it("does NOT persist the transient 'settings' value", () => {
    writeTopView('history');
    writeTopView('settings');
    expect(readTopView()).toBe('history');
    expect(window.localStorage.getItem(TOP_VIEW_KEY)).toBe('history');
  });
});

describe('readTheme / writeTheme', () => {
  it('returns the default when missing', () => {
    expect(readTheme()).toBe(DEFAULT_THEME);
  });
  it('round-trips light/dark/system', () => {
    writeTheme('light');
    expect(readTheme()).toBe('light');
    writeTheme('dark');
    expect(readTheme()).toBe('dark');
    writeTheme('system');
    expect(readTheme()).toBe('system');
  });
});

describe('resetPreferences', () => {
  it('clears every preference key', () => {
    writeSidebarMode('tree');
    writeSidebarCollapsed(true);
    writeDetailMode('chat');
    writeTopView('history');
    writeTheme('light');
    resetPreferences();
    expect(window.localStorage.getItem(SIDEBAR_MODE_KEY)).toBeNull();
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBeNull();
    expect(window.localStorage.getItem(DETAIL_MODE_KEY)).toBeNull();
    expect(window.localStorage.getItem(TOP_VIEW_KEY)).toBeNull();
    expect(window.localStorage.getItem(THEME_KEY)).toBeNull();
  });
});

describe('resolveTheme', () => {
  it('passes through explicit light/dark', () => {
    expect(resolveTheme('light')).toBe('light');
    expect(resolveTheme('dark')).toBe('dark');
  });
  it("resolves 'system' against prefers-color-scheme", () => {
    const out = resolveTheme('system');
    // jsdom's matchMedia is stubbed by setup; resolved value must be one of
    // the two canonical strings even when the media query isn't honored.
    expect(out === 'light' || out === 'dark').toBe(true);
  });
});

describe('applyTheme', () => {
  it("adds the 'dark' class on <html> for dark mode", () => {
    applyTheme('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
  it("removes the 'dark' class for light mode", () => {
    document.documentElement.classList.add('dark');
    applyTheme('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
