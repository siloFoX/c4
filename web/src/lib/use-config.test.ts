import { describe, it, expect, vi, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook, waitFor } from '@testing-library/react';
import { server } from '../test/server';
import { useConfig } from './use-config';

// useConfig owns the GET /api/config fetch + the POST
// /api/config/reload action. Reload re-runs the fetch on success
// so the viewer reflects the live state. The split between
// `error` (load failure) and `reloadFailed` (reload failure)
// mirrors the page's split.

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useConfig', () => {
  it('starts in loading state with null config, no error', async () => {
    server.use(
      http.get('/api/config', () =>
        HttpResponse.json({ config: { key: 'val' } }),
      ),
    );
    const { result } = renderHook(() => useConfig());
    expect(result.current.loading).toBe(true);
    expect(result.current.config).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.reloadBusy).toBe(false);
    expect(result.current.reloadMsg).toBeNull();
    expect(result.current.reloadFailed).toBe(false);
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.config).toEqual({ key: 'val' });
  });

  it('refresh GETs /api/config and stores config field', async () => {
    let path = '';
    server.use(
      http.get('/api/config', ({ request }) => {
        path = new URL(request.url).pathname;
        return HttpResponse.json({ config: { a: 1, b: 2 } });
      }),
    );
    const { result } = renderHook(() => useConfig());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(path).toBe('/api/config');
    expect(result.current.config).toEqual({ a: 1, b: 2 });
  });

  it('falls back to empty object when payload omits config field', async () => {
    server.use(
      http.get('/api/config', () => HttpResponse.json({})),
    );
    const { result } = renderHook(() => useConfig());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.config).toEqual({});
    expect(result.current.error).toBeNull();
  });

  it('non-ok response surfaces error message and leaves config null', async () => {
    server.use(
      http.get('/api/config', () =>
        HttpResponse.json({ error: 'denied' }, { status: 503 }),
      ),
    );
    const { result } = renderHook(() => useConfig());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.error).toMatch(/HTTP 503/);
    expect(result.current.config).toBeNull();
  });

  it('refresh() can be called manually to re-issue the request', async () => {
    let count = 0;
    server.use(
      http.get('/api/config', () => {
        count++;
        return HttpResponse.json({ config: { n: count } });
      }),
    );
    const { result } = renderHook(() => useConfig());
    await waitFor(() => {
      expect(result.current.config).toEqual({ n: 1 });
    });
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.config).toEqual({ n: 2 });
  });

  it('handleReload aborts before any POST when window.confirm is denied', async () => {
    server.use(
      http.get('/api/config', () =>
        HttpResponse.json({ config: { k: 'v' } }),
      ),
    );
    let reloadCalls = 0;
    server.use(
      http.post('/api/config/reload', () => {
        reloadCalls++;
        return HttpResponse.json({ ok: true });
      }),
    );
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { result } = renderHook(() => useConfig());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    await act(async () => {
      await result.current.handleReload();
    });
    expect(reloadCalls).toBe(0);
    expect(result.current.reloadBusy).toBe(false);
    expect(result.current.reloadMsg).toBeNull();
    expect(result.current.reloadFailed).toBe(false);
  });

  it('handleReload success path: POSTs reload, sets reloadMsg, refetches config, clears msg after 5s', async () => {
    let getCount = 0;
    server.use(
      http.get('/api/config', () => {
        getCount++;
        return HttpResponse.json({ config: { gen: getCount } });
      }),
    );
    let reloadPath = '';
    let reloadBody: unknown = null;
    server.use(
      http.post('/api/config/reload', async ({ request }) => {
        reloadPath = new URL(request.url).pathname;
        reloadBody = await request.json();
        return HttpResponse.json({ ok: true });
      }),
    );
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');
    const { result } = renderHook(() => useConfig());
    await waitFor(() => {
      expect(result.current.config).toEqual({ gen: 1 });
    });
    await act(async () => {
      await result.current.handleReload();
    });
    expect(reloadPath).toBe('/api/config/reload');
    expect(reloadBody).toEqual({});
    expect(result.current.reloadFailed).toBe(false);
    expect(result.current.reloadMsg).toBeTruthy();
    expect(result.current.reloadBusy).toBe(false);
    await waitFor(() => {
      expect(result.current.config).toEqual({ gen: 2 });
    });
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 5000);
  });

  it('handleReload ok=false branch sets reloadFailed=true with not-ok message', async () => {
    server.use(
      http.get('/api/config', () =>
        HttpResponse.json({ config: { k: 'v' } }),
      ),
      http.post('/api/config/reload', () =>
        HttpResponse.json({ ok: false }),
      ),
    );
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { result } = renderHook(() => useConfig());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    await act(async () => {
      await result.current.handleReload();
    });
    expect(result.current.reloadFailed).toBe(true);
    expect(result.current.reloadMsg).toBeTruthy();
    expect(result.current.reloadBusy).toBe(false);
  });

  it('handleReload thrown error sets reloadFailed=true with formatted error message', async () => {
    server.use(
      http.get('/api/config', () =>
        HttpResponse.json({ config: { k: 'v' } }),
      ),
      http.post('/api/config/reload', () =>
        HttpResponse.json({ error: 'reload-blocked' }, { status: 500 }),
      ),
    );
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { result } = renderHook(() => useConfig());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    await act(async () => {
      await result.current.handleReload();
    });
    expect(result.current.reloadFailed).toBe(true);
    expect(result.current.reloadMsg).toBeTruthy();
    expect(result.current.reloadMsg).toContain('reload-blocked');
    expect(result.current.reloadBusy).toBe(false);
  });

  it('flips reloadBusy=true while the reload POST is in flight and back to false on resolve', async () => {
    server.use(
      http.get('/api/config', () =>
        HttpResponse.json({ config: { k: 'v' } }),
      ),
    );
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.post('/api/config/reload', async () => {
        await gate;
        return HttpResponse.json({ ok: true });
      }),
    );
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { result } = renderHook(() => useConfig());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.handleReload();
      await Promise.resolve();
    });
    expect(result.current.reloadBusy).toBe(true);
    release();
    await act(async () => {
      await inflight;
    });
    expect(result.current.reloadBusy).toBe(false);
  });

  it('handleReload resets reloadMsg+reloadFailed before issuing a new reload (clears stale state)', async () => {
    server.use(
      http.get('/api/config', () =>
        HttpResponse.json({ config: { k: 'v' } }),
      ),
    );
    let postCount = 0;
    server.use(
      http.post('/api/config/reload', () => {
        postCount++;
        if (postCount === 1) {
          return HttpResponse.json({ error: 'first' }, { status: 500 });
        }
        return HttpResponse.json({ ok: true });
      }),
    );
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { result } = renderHook(() => useConfig());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    await act(async () => {
      await result.current.handleReload();
    });
    expect(result.current.reloadFailed).toBe(true);
    await act(async () => {
      await result.current.handleReload();
    });
    expect(result.current.reloadFailed).toBe(false);
    expect(result.current.reloadMsg).toBeTruthy();
  });
});
