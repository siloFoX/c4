import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAuthIdentity } from './use-auth-identity';
import { AUTH_EVENT } from './api';

const TOKEN_KEY = 'c4.authToken';
const USER_KEY = 'c4.authUser';
const ROLE_KEY = 'c4.authRole';

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  window.localStorage.clear();
});

describe('useAuthIdentity', () => {
  it('lazily reads user + role from localStorage on first render', () => {
    window.localStorage.setItem(USER_KEY, 'alice');
    window.localStorage.setItem(ROLE_KEY, 'admin');
    const { result } = renderHook(() => useAuthIdentity());
    expect(result.current.user).toBe('alice');
    expect(result.current.role).toBe('admin');
  });

  it('returns null/null when localStorage holds no auth identity', () => {
    const { result } = renderHook(() => useAuthIdentity());
    expect(result.current.user).toBeNull();
    expect(result.current.role).toBeNull();
  });

  it('re-reads user + role when AUTH_EVENT fires', () => {
    const { result } = renderHook(() => useAuthIdentity());
    expect(result.current.user).toBeNull();
    window.localStorage.setItem(USER_KEY, 'bob');
    window.localStorage.setItem(ROLE_KEY, 'manager');
    act(() => {
      window.dispatchEvent(new Event(AUTH_EVENT));
    });
    expect(result.current.user).toBe('bob');
    expect(result.current.role).toBe('manager');
  });

  it('refreshes on a storage event keyed on c4.authUser', () => {
    const { result } = renderHook(() => useAuthIdentity());
    window.localStorage.setItem(USER_KEY, 'carol');
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: USER_KEY }));
    });
    expect(result.current.user).toBe('carol');
  });

  it('refreshes on a storage event keyed on c4.authRole', () => {
    const { result } = renderHook(() => useAuthIdentity());
    window.localStorage.setItem(ROLE_KEY, 'viewer');
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: ROLE_KEY }));
    });
    expect(result.current.role).toBe('viewer');
  });

  it('refreshes on a storage event keyed on c4.authToken (the token key)', () => {
    window.localStorage.setItem(USER_KEY, 'dave');
    const { result } = renderHook(() => useAuthIdentity());
    expect(result.current.user).toBe('dave');
    window.localStorage.removeItem(USER_KEY);
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: TOKEN_KEY }));
    });
    expect(result.current.user).toBeNull();
  });

  it('ignores a storage event whose key is unrelated to auth', () => {
    window.localStorage.setItem(USER_KEY, 'erin');
    const { result } = renderHook(() => useAuthIdentity());
    expect(result.current.user).toBe('erin');
    // Mutate the user slot behind the hook's back -- the unrelated-key
    // storage event must NOT trigger a re-read, so the displayed value
    // stays stale (erin) instead of flipping to "mutated".
    window.localStorage.setItem(USER_KEY, 'mutated');
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', { key: 'c4.theme' }),
      );
    });
    expect(result.current.user).toBe('erin');
  });

  it('treats a wholesale localStorage.clear (storage event with key=null) as relevant', () => {
    window.localStorage.setItem(USER_KEY, 'frank');
    window.localStorage.setItem(ROLE_KEY, 'viewer');
    const { result } = renderHook(() => useAuthIdentity());
    expect(result.current.user).toBe('frank');
    window.localStorage.clear();
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: null }));
    });
    expect(result.current.user).toBeNull();
    expect(result.current.role).toBeNull();
  });

  it('removes both AUTH_EVENT and storage listeners on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useAuthIdentity());
    unmount();
    const names = removeSpy.mock.calls.map(([name]) => name);
    expect(names).toContain(AUTH_EVENT);
    expect(names).toContain('storage');
    removeSpy.mockRestore();
  });

  it('does not flip state after unmount when an AUTH_EVENT fires', () => {
    window.localStorage.setItem(USER_KEY, 'gina');
    const { result, unmount } = renderHook(() => useAuthIdentity());
    expect(result.current.user).toBe('gina');
    unmount();
    window.localStorage.setItem(USER_KEY, 'late-update');
    // No act() wrapper -- nothing should re-render.
    window.dispatchEvent(new Event(AUTH_EVENT));
    expect(result.current.user).toBe('gina');
  });
});
