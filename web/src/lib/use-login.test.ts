import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest';
import type { FormEvent } from 'react';
import { http, HttpResponse } from 'msw';
import { act, renderHook } from '@testing-library/react';
import { server } from '../test/server';
import { useLogin } from './use-login';

const TOKEN_KEY = 'c4.authToken';

function fakeSubmitEvent(): FormEvent & { preventDefault: ReturnType<typeof vi.fn> } {
  const e = { preventDefault: vi.fn() };
  return e as unknown as FormEvent & {
    preventDefault: ReturnType<typeof vi.fn>;
  };
}

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  window.localStorage.clear();
});

describe('useLogin', () => {
  it('starts idle: empty user/password, no error, not busy', () => {
    const { result } = renderHook(() =>
      useLogin({ onSuccess: vi.fn() }),
    );
    expect(result.current.user).toBe('');
    expect(result.current.password).toBe('');
    expect(result.current.error).toBeNull();
    expect(result.current.busy).toBe(false);
  });

  it('setUser updates the user slot', () => {
    const { result } = renderHook(() =>
      useLogin({ onSuccess: vi.fn() }),
    );
    act(() => result.current.setUser('alice'));
    expect(result.current.user).toBe('alice');
  });

  it('setPassword updates the password slot', () => {
    const { result } = renderHook(() =>
      useLogin({ onSuccess: vi.fn() }),
    );
    act(() => result.current.setPassword('hunter2'));
    expect(result.current.password).toBe('hunter2');
  });

  it('handleSubmit calls preventDefault on the form event', async () => {
    server.use(
      http.post('/api/auth/login', () =>
        HttpResponse.json({ token: 't1', user: 'alice' }),
      ),
    );
    const { result } = renderHook(() =>
      useLogin({ onSuccess: vi.fn() }),
    );
    const e = fakeSubmitEvent();
    await act(async () => {
      await result.current.handleSubmit(e);
    });
    expect(e.preventDefault).toHaveBeenCalledTimes(1);
  });

  it('POSTs /api/auth/login with body { user, password } from the current slots', async () => {
    let path = '';
    let body: unknown = null;
    server.use(
      http.post('/api/auth/login', async ({ request }) => {
        path = new URL(request.url).pathname;
        body = await request.json();
        return HttpResponse.json({ token: 't1', user: 'alice' });
      }),
    );
    const { result } = renderHook(() =>
      useLogin({ onSuccess: vi.fn() }),
    );
    act(() => result.current.setUser('alice'));
    act(() => result.current.setPassword('hunter2'));
    await act(async () => {
      await result.current.handleSubmit(fakeSubmitEvent());
    });
    expect(path).toBe('/api/auth/login');
    expect(body).toEqual({ user: 'alice', password: 'hunter2' });
  });

  it('on success: calls onSuccess once, stores the token, and leaves error null', async () => {
    server.use(
      http.post('/api/auth/login', () =>
        HttpResponse.json({ token: 'good', user: 'alice', role: 'admin' }),
      ),
    );
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useLogin({ onSuccess }));
    await act(async () => {
      await result.current.handleSubmit(fakeSubmitEvent());
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
    expect(result.current.busy).toBe(false);
    expect(window.localStorage.getItem(TOKEN_KEY)).toBe('good');
  });

  it('surfaces the server error string when the response carries { error } and no token', async () => {
    server.use(
      http.post('/api/auth/login', () =>
        HttpResponse.json({ error: 'bad creds' }, { status: 401 }),
      ),
    );
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useLogin({ onSuccess }));
    await act(async () => {
      await result.current.handleSubmit(fakeSubmitEvent());
    });
    expect(result.current.error).toBe('bad creds');
    expect(onSuccess).not.toHaveBeenCalled();
    expect(result.current.busy).toBe(false);
    expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('captures err.message when the underlying login call rejects (network error)', async () => {
    server.use(
      http.post('/api/auth/login', () => HttpResponse.error()),
    );
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useLogin({ onSuccess }));
    await act(async () => {
      await result.current.handleSubmit(fakeSubmitEvent());
    });
    expect(result.current.error).toBeTruthy();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(result.current.busy).toBe(false);
  });

  it('flips busy=true while the request is in flight and back to false on resolve', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.post('/api/auth/login', async () => {
        await gate;
        return HttpResponse.json({ token: 't1', user: 'alice' });
      }),
    );
    const { result } = renderHook(() =>
      useLogin({ onSuccess: vi.fn() }),
    );
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.handleSubmit(fakeSubmitEvent());
      await Promise.resolve();
    });
    expect(result.current.busy).toBe(true);
    release();
    await act(async () => {
      await inflight;
    });
    expect(result.current.busy).toBe(false);
  });

  it('short-circuits re-entrant handleSubmit calls while busy (no double POST)', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    server.use(
      http.post('/api/auth/login', async () => {
        calls++;
        await gate;
        return HttpResponse.json({ token: 't1', user: 'alice' });
      }),
    );
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useLogin({ onSuccess }));
    let first: Promise<void> | null = null;
    let second: Promise<void> | null = null;
    await act(async () => {
      first = result.current.handleSubmit(fakeSubmitEvent());
      await Promise.resolve();
    });
    expect(result.current.busy).toBe(true);
    await act(async () => {
      second = result.current.handleSubmit(fakeSubmitEvent());
      await Promise.resolve();
    });
    release();
    await act(async () => {
      await first;
      await second;
    });
    expect(calls).toBe(1);
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('clears a prior error on a fresh successful submit', async () => {
    server.use(
      http.post('/api/auth/login', () =>
        HttpResponse.json({ error: 'bad creds' }, { status: 401 }),
      ),
    );
    const { result } = renderHook(() =>
      useLogin({ onSuccess: vi.fn() }),
    );
    await act(async () => {
      await result.current.handleSubmit(fakeSubmitEvent());
    });
    expect(result.current.error).toBeTruthy();

    server.use(
      http.post('/api/auth/login', () =>
        HttpResponse.json({ token: 'ok', user: 'alice' }),
      ),
    );
    await act(async () => {
      await result.current.handleSubmit(fakeSubmitEvent());
    });
    expect(result.current.error).toBeNull();
  });
});
