import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import {
  AUTH_EVENT,
  apiDelete,
  apiFetch,
  apiGet,
  apiPatch,
  apiPost,
  clearToken,
  eventSourceUrl,
  fetchAuthStatus,
  getAuthRole,
  getAuthUser,
  getToken,
  login,
  logout,
  setToken,
} from './api';

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  window.localStorage.clear();
});

describe('token store (getToken / setToken / clearToken)', () => {
  it('returns null when no token has been set', () => {
    expect(getToken()).toBeNull();
  });
  it('round-trips a token through localStorage', () => {
    setToken('abc123');
    expect(getToken()).toBe('abc123');
  });
  it('clearToken removes the token, user, and role at once', () => {
    setToken('abc');
    window.localStorage.setItem('c4.authUser', 'admin');
    window.localStorage.setItem('c4.authRole', 'manager');
    expect(getAuthUser()).toBe('admin');
    expect(getAuthRole()).toBe('manager');
    clearToken();
    expect(getToken()).toBeNull();
    expect(getAuthUser()).toBeNull();
    expect(getAuthRole()).toBeNull();
  });
});

describe('apiFetch', () => {
  it('attaches Authorization: Bearer <token> when a token is present', async () => {
    setToken('xyz');
    server.use(
      http.get('/api/echo-auth', ({ request }) =>
        HttpResponse.json({ authorization: request.headers.get('authorization') }),
      ),
    );
    const res = await apiFetch('/api/echo-auth');
    const body = (await res.json()) as { authorization: string | null };
    expect(body.authorization).toBe('Bearer xyz');
  });

  it('omits Authorization when no token is set', async () => {
    server.use(
      http.get('/api/echo-auth', ({ request }) =>
        HttpResponse.json({ authorization: request.headers.get('authorization') }),
      ),
    );
    const res = await apiFetch('/api/echo-auth');
    const body = (await res.json()) as { authorization: string | null };
    expect(body.authorization).toBeNull();
  });

  it('clears the token and dispatches AUTH_EVENT on 401', async () => {
    setToken('expired');
    server.use(
      http.get('/api/expired', () => new HttpResponse(null, { status: 401 })),
    );
    const handler = vi.fn();
    window.addEventListener(AUTH_EVENT, handler);
    try {
      await apiFetch('/api/expired');
    } finally {
      window.removeEventListener(AUTH_EVENT, handler);
    }
    expect(getToken()).toBeNull();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does NOT dispatch AUTH_EVENT on non-401 responses', async () => {
    setToken('abc');
    server.use(
      http.get('/api/server-error', () => new HttpResponse(null, { status: 500 })),
    );
    const handler = vi.fn();
    window.addEventListener(AUTH_EVENT, handler);
    try {
      await apiFetch('/api/server-error');
    } finally {
      window.removeEventListener(AUTH_EVENT, handler);
    }
    expect(handler).not.toHaveBeenCalled();
    expect(getToken()).toBe('abc');
  });
});

describe('apiGet / apiPost / apiDelete / apiPatch', () => {
  it('apiGet returns the parsed JSON body on 2xx', async () => {
    server.use(
      http.get('/api/health', () => HttpResponse.json({ ok: true, version: '1.0' })),
    );
    const r = await apiGet<{ ok: boolean; version: string }>('/api/health');
    expect(r).toEqual({ ok: true, version: '1.0' });
  });

  it('apiGet throws Error with HTTP status + parsed JSON error field on non-2xx', async () => {
    server.use(
      http.get('/api/missing', () =>
        HttpResponse.json({ error: 'not found' }, { status: 404 }),
      ),
    );
    await expect(apiGet('/api/missing')).rejects.toThrow(/HTTP 404.*not found/);
  });

  it('apiGet truncates error bodies longer than 200 chars', async () => {
    const longBody = 'x'.repeat(500);
    server.use(
      http.get('/api/long-error', () =>
        HttpResponse.json({ error: longBody }, { status: 500 }),
      ),
    );
    await expect(apiGet('/api/long-error')).rejects.toThrow(/…$/);
  });

  it('apiPost serializes the body as JSON and forwards the response', async () => {
    server.use(
      http.post('/api/echo', async ({ request }) => {
        const body = await request.json();
        return HttpResponse.json({ received: body });
      }),
    );
    const r = await apiPost<{ received: unknown }>('/api/echo', { foo: 1 });
    expect(r.received).toEqual({ foo: 1 });
  });

  it('apiPost surfaces server error envelope on non-2xx', async () => {
    server.use(
      http.post('/api/bad', () =>
        HttpResponse.json({ error: 'invalid' }, { status: 400 }),
      ),
    );
    await expect(apiPost('/api/bad', {})).rejects.toThrow(/HTTP 400.*invalid/);
  });

  it('apiPatch serializes the body as JSON and forwards the response', async () => {
    server.use(
      http.patch('/api/echo', async ({ request }) => {
        const body = await request.json();
        return HttpResponse.json({ patched: body });
      }),
    );
    const r = await apiPatch<{ patched: unknown }>('/api/echo', { x: 1 });
    expect(r.patched).toEqual({ x: 1 });
  });

  it('apiDelete returns the parsed JSON body on 2xx', async () => {
    server.use(
      http.delete('/api/x/123', () => HttpResponse.json({ deleted: true })),
    );
    const r = await apiDelete<{ deleted: boolean }>('/api/x/123');
    expect(r.deleted).toBe(true);
  });
});

describe('eventSourceUrl', () => {
  it('returns the path unchanged when no token is set', () => {
    expect(eventSourceUrl('/api/sse')).toBe('/api/sse');
  });
  it('appends ?token=… when no querystring is present', () => {
    setToken('abc');
    expect(eventSourceUrl('/api/sse')).toBe('/api/sse?token=abc');
  });
  it('appends &token=… when a querystring already exists', () => {
    setToken('abc');
    expect(eventSourceUrl('/api/sse?foo=1')).toBe('/api/sse?foo=1&token=abc');
  });
  it('URL-encodes special characters in the token', () => {
    setToken('a b/c');
    expect(eventSourceUrl('/api/sse')).toBe('/api/sse?token=a%20b%2Fc');
  });
});

describe('login / logout', () => {
  it('on success: stores the token, user, and role from the response', async () => {
    server.use(
      http.post('/api/auth/login', () =>
        HttpResponse.json({ token: 'tok-1', user: 'admin', role: 'admin' }),
      ),
    );
    const r = await login('admin', 'pw');
    expect(r.token).toBe('tok-1');
    expect(getToken()).toBe('tok-1');
    expect(getAuthUser()).toBe('admin');
    expect(getAuthRole()).toBe('admin');
  });

  it('on failure: returns an error envelope without storing a token', async () => {
    server.use(
      http.post('/api/auth/login', () =>
        HttpResponse.json({ error: 'bad creds' }, { status: 401 }),
      ),
    );
    const r = await login('admin', 'wrong');
    expect(r.token).toBeUndefined();
    expect(r.error).toBe('bad creds');
    expect(getToken()).toBeNull();
  });

  it('logout clears the token even when the network request fails', async () => {
    setToken('abc');
    server.use(
      http.post('/api/auth/logout', () => HttpResponse.error()),
    );
    await logout();
    expect(getToken()).toBeNull();
  });

  it('logout dispatches AUTH_EVENT so the app flips to the login screen', async () => {
    setToken('abc');
    server.use(
      http.post('/api/auth/logout', () => HttpResponse.json({ ok: true })),
    );
    const handler = vi.fn();
    window.addEventListener(AUTH_EVENT, handler);
    try {
      await logout();
    } finally {
      window.removeEventListener(AUTH_EVENT, handler);
    }
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('fetchAuthStatus', () => {
  it('returns the parsed { enabled } payload on 200', async () => {
    server.use(
      http.get('/api/auth/status', () => HttpResponse.json({ enabled: false })),
    );
    expect(await fetchAuthStatus()).toEqual({ enabled: false });
  });
  it('fails safe to enabled:true on non-2xx', async () => {
    server.use(
      http.get('/api/auth/status', () => new HttpResponse(null, { status: 500 })),
    );
    expect(await fetchAuthStatus()).toEqual({ enabled: true });
  });
  it('fails safe to enabled:true on network error', async () => {
    server.use(
      http.get('/api/auth/status', () => HttpResponse.error()),
    );
    expect(await fetchAuthStatus()).toEqual({ enabled: true });
  });
});
