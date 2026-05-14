import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useUiPreferences } from './use-ui-preferences';

// useUiPreferences owns the four localStorage-backed UI slots
// (sidebarMode / sidebarCollapsed / detailMode / topView) plus
// their per-slot write effects, the toggleSidebarCollapsed helper,
// and the cross-tab 'storage' event sync that re-reads all four
// when another tab updates them.
//   - Initial reads pull from preferences.read*; unknown values
//     fall back to documented defaults.
//   - Each setter triggers the matching write effect on the next
//     tick, persisting through preferences.write*.
//   - sidebarCollapsed is stored as '1'/'0' so shell scripts can
//     parse it without JSON eval; writeTopView('settings') is
//     intentionally skipped so the saved tab is never the
//     transient Settings destination.
//   - 'storage' events fire the optional onCrossTabSync callback
//     alongside the four re-reads (for sibling slots like theme
//     that this hook does not own).

const KEYS = [
  'c4.sidebar.mode',
  'c4.sidebar.collapsed',
  'c4.detail.mode',
  'c4.topView',
];

function clearPrefs() {
  for (const k of KEYS) {
    try { window.localStorage.removeItem(k); } catch { /* ignore */ }
  }
}

beforeEach(() => { clearPrefs(); });
afterEach(() => {
  vi.restoreAllMocks();
  clearPrefs();
});

describe('useUiPreferences', () => {
  it('mounts with all four defaults when localStorage is empty', () => {
    const { result } = renderHook(() => useUiPreferences());
    expect(result.current.sidebarMode).toBe('list');
    expect(result.current.sidebarCollapsed).toBe(false);
    expect(result.current.detailMode).toBe('terminal');
    expect(result.current.topView).toBe('workers');
  });

  it('seeds all four slots from localStorage when valid values are set', () => {
    window.localStorage.setItem('c4.sidebar.mode', 'tree');
    window.localStorage.setItem('c4.sidebar.collapsed', '1');
    window.localStorage.setItem('c4.detail.mode', 'chat');
    window.localStorage.setItem('c4.topView', 'history');
    const { result } = renderHook(() => useUiPreferences());
    expect(result.current.sidebarMode).toBe('tree');
    expect(result.current.sidebarCollapsed).toBe(true);
    expect(result.current.detailMode).toBe('chat');
    expect(result.current.topView).toBe('history');
  });

  it('unknown enum values in localStorage fall back to defaults', () => {
    window.localStorage.setItem('c4.sidebar.mode', 'phony');
    window.localStorage.setItem('c4.detail.mode', 'phony');
    window.localStorage.setItem('c4.topView', 'phony');
    const { result } = renderHook(() => useUiPreferences());
    expect(result.current.sidebarMode).toBe('list');
    expect(result.current.detailMode).toBe('terminal');
    expect(result.current.topView).toBe('workers');
  });

  it('setSidebarMode updates state and persists to localStorage', () => {
    const { result } = renderHook(() => useUiPreferences());
    act(() => { result.current.setSidebarMode('tree'); });
    expect(result.current.sidebarMode).toBe('tree');
    expect(window.localStorage.getItem('c4.sidebar.mode')).toBe('tree');
  });

  it('setSidebarCollapsed=true writes "1", false writes "0" to localStorage', () => {
    const { result } = renderHook(() => useUiPreferences());
    act(() => { result.current.setSidebarCollapsed(true); });
    expect(result.current.sidebarCollapsed).toBe(true);
    expect(window.localStorage.getItem('c4.sidebar.collapsed')).toBe('1');
    act(() => { result.current.setSidebarCollapsed(false); });
    expect(result.current.sidebarCollapsed).toBe(false);
    expect(window.localStorage.getItem('c4.sidebar.collapsed')).toBe('0');
  });

  it('setSidebarCollapsed accepts the functional updater form (Dispatch<SetStateAction>)', () => {
    const { result } = renderHook(() => useUiPreferences());
    act(() => {
      result.current.setSidebarCollapsed((prev) => !prev);
    });
    expect(result.current.sidebarCollapsed).toBe(true);
    act(() => {
      result.current.setSidebarCollapsed((prev) => !prev);
    });
    expect(result.current.sidebarCollapsed).toBe(false);
  });

  it('setDetailMode updates state and persists to localStorage', () => {
    const { result } = renderHook(() => useUiPreferences());
    act(() => { result.current.setDetailMode('chat'); });
    expect(result.current.detailMode).toBe('chat');
    expect(window.localStorage.getItem('c4.detail.mode')).toBe('chat');
  });

  it('setTopView updates state and persists to localStorage', () => {
    const { result } = renderHook(() => useUiPreferences());
    act(() => { result.current.setTopView('sessions'); });
    expect(result.current.topView).toBe('sessions');
    expect(window.localStorage.getItem('c4.topView')).toBe('sessions');
  });

  it('setTopView("settings") accepts the state but does NOT persist (transient)', () => {
    const { result } = renderHook(() => useUiPreferences());
    // After mount, default 'workers' is persisted by the initial effect.
    expect(window.localStorage.getItem('c4.topView')).toBe('workers');
    act(() => { result.current.setTopView('settings'); });
    expect(result.current.topView).toBe('settings');
    expect(window.localStorage.getItem('c4.topView')).toBe('workers');
  });

  it('toggleSidebarCollapsed flips the boolean and persists each flip', () => {
    const { result } = renderHook(() => useUiPreferences());
    expect(result.current.sidebarCollapsed).toBe(false);
    act(() => { result.current.toggleSidebarCollapsed(); });
    expect(result.current.sidebarCollapsed).toBe(true);
    expect(window.localStorage.getItem('c4.sidebar.collapsed')).toBe('1');
    act(() => { result.current.toggleSidebarCollapsed(); });
    expect(result.current.sidebarCollapsed).toBe(false);
    expect(window.localStorage.getItem('c4.sidebar.collapsed')).toBe('0');
  });

  it('toggleSidebarCollapsed callback identity is stable across re-renders (useCallback [])', () => {
    const { result, rerender } = renderHook(() => useUiPreferences());
    const first = result.current.toggleSidebarCollapsed;
    rerender();
    expect(result.current.toggleSidebarCollapsed).toBe(first);
  });

  it('storage event re-reads all four slots from localStorage', () => {
    const { result } = renderHook(() => useUiPreferences());
    expect(result.current.sidebarMode).toBe('list');
    window.localStorage.setItem('c4.sidebar.mode', 'tree');
    window.localStorage.setItem('c4.sidebar.collapsed', '1');
    window.localStorage.setItem('c4.detail.mode', 'chat');
    window.localStorage.setItem('c4.topView', 'features');
    act(() => {
      window.dispatchEvent(new StorageEvent('storage'));
    });
    expect(result.current.sidebarMode).toBe('tree');
    expect(result.current.sidebarCollapsed).toBe(true);
    expect(result.current.detailMode).toBe('chat');
    expect(result.current.topView).toBe('features');
  });

  it('storage event invokes onCrossTabSync when provided', () => {
    const onCrossTabSync = vi.fn();
    renderHook(() => useUiPreferences({ onCrossTabSync }));
    act(() => {
      window.dispatchEvent(new StorageEvent('storage'));
    });
    expect(onCrossTabSync).toHaveBeenCalledTimes(1);
  });

  it('omitting onCrossTabSync does not throw on storage events', () => {
    const { result } = renderHook(() => useUiPreferences());
    expect(() => {
      act(() => {
        window.dispatchEvent(new StorageEvent('storage'));
      });
    }).not.toThrow();
    expect(result.current.sidebarMode).toBe('list');
  });

  it('removes the storage listener on unmount (no callback fired post-teardown)', () => {
    const onCrossTabSync = vi.fn();
    const { unmount } = renderHook(() => useUiPreferences({ onCrossTabSync }));
    unmount();
    window.dispatchEvent(new StorageEvent('storage'));
    expect(onCrossTabSync).not.toHaveBeenCalled();
  });
});
