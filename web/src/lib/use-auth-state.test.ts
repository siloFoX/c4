import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook, waitFor } from '@testing-library/react';
import { server } from '../test/server';
import { useAuthState } from './use-auth-state';
import { AUTH_EVENT } from './api';

const TOKEN_KEY = 'c4.authToken';

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  window.localStorage.clear();
});

describe('useAuthState', () => {
  it('starts in loading state before the status fetch resolves', () => {
    const { result } = renderHook(() => useAuthState());
    expect(result.current.authState).toBe('loading');
  });

  it('resolves to disabled when /api/auth/status reports enabled:false', async () => {
    server.use(
      http.get('/api/auth/status', () =>
        HttpResponse.json({ enabled: false }),
      ),
    );
    const { result } = renderHook(() => useAuthState());
    await waitFor(() => {
      expect(result.current.authState).toBe('disabled');
    });
  });

  it('resolves to authed when auth is enabled and a token is present', async () => {
    window.localStorage.setItem(TOKEN_KEY, 'abc');
    server.use(
      http.get('/api/auth/status', () =>
        HttpResponse.json({ enabled: true }),
      ),
    );
    const { result } = renderHook(() => useAuthState());
    await waitFor(() => {
      expect(result.current.authState).toBe('authed');
    });
  });

  it('resolves to anon when auth is enabled and no token is present', async () => {
    server.use(
      http.get('/api/auth/status', () =>
        HttpResponse.json({ enabled: true }),
      ),
    );
    const { result } = renderHook(() => useAuthState());
    await waitFor(() => {
      expect(result.current.authState).toBe('anon');
    });
  });

  it('fails safe to anon on a 5xx status response (enabled:true fallback, no token)', async () => {
    server.use(
      http.get(
        '/api/auth/status',
        () => new HttpResponse(null, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useAuthState());
    await waitFor(() => {
      expect(result.current.authState).toBe('anon');
    });
  });

  it('stays in loading while the status fetch is in flight (release-gate)', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get('/api/auth/status', async () => {
        await gate;
        return HttpResponse.json({ enabled: true });
      }),
    );
    const { result } = renderHook(() => useAuthState());
    expect(result.current.authState).toBe('loading');
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.authState).toBe('loading');
    release();
    await waitFor(() => {
      expect(result.current.authState).toBe('anon');
    });
  });

  it('flips to anon when AUTH_EVENT fires after an authed resolve', async () => {
    window.localStorage.setItem(TOKEN_KEY, 'abc');
    server.use(
      http.get('/api/auth/status', () =>
        HttpResponse.json({ enabled: true }),
      ),
    );
    const { result } = renderHook(() => useAuthState());
    await waitFor(() => {
      expect(result.current.authState).toBe('authed');
    });
    act(() => {
      window.dispatchEvent(new Event(AUTH_EVENT));
    });
    expect(result.current.authState).toBe('anon');
  });

  it('setAuthed() flips state to authed regardless of prior value', async () => {
    server.use(
      http.get('/api/auth/status', () =>
        HttpResponse.json({ enabled: true }),
      ),
    );
    const { result } = renderHook(() => useAuthState());
    await waitFor(() => {
      expect(result.current.authState).toBe('anon');
    });
    act(() => {
      result.current.setAuthed();
    });
    expect(result.current.authState).toBe('authed');
  });

  it('setAnon() flips state to anon regardless of prior value', async () => {
    window.localStorage.setItem(TOKEN_KEY, 'abc');
    server.use(
      http.get('/api/auth/status', () =>
        HttpResponse.json({ enabled: true }),
      ),
    );
    const { result } = renderHook(() => useAuthState());
    await waitFor(() => {
      expect(result.current.authState).toBe('authed');
    });
    act(() => {
      result.current.setAnon();
    });
    expect(result.current.authState).toBe('anon');
  });

  it('removes the AUTH_EVENT listener on unmount', async () => {
    server.use(
      http.get('/api/auth/status', () =>
        HttpResponse.json({ enabled: true }),
      ),
    );
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { result, unmount } = renderHook(() => useAuthState());
    await waitFor(() => {
      expect(result.current.authState).toBe('anon');
    });
    unmount();
    const authRemovals = removeSpy.mock.calls.filter(
      ([name]) => name === AUTH_EVENT,
    );
    expect(authRemovals.length).toBeGreaterThan(0);
    removeSpy.mockRestore();
  });
});
