import { describe, it, expect, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook, waitFor } from '@testing-library/react';
import { server } from '../test/server';
import { useTokenUsage } from './use-token-usage';

// useTokenUsage owns the TokenUsage page's dual fetch:
//   - GET /api/token-usage[?perTask=1] -> setData (or setError +
//     setData(null) on throw). The query string is appended only when
//     perTask=true so the daemon can skip the heavy per-task index for
//     overview renders.
//   - GET /api/quota -> setQuota. The catch branch is silent (setQuota
//     null, no setError) so a quota failure does not drown the
//     token-usage error banner -- the JSX renders an em-dash placeholder.
//   - loading flips true on entry and false after both endpoints settle
//     (sequential, not parallel: token-usage await -> quota await).
//   - refresh is useCallback([perTask]); identity changes when perTask
//     flips and the dependent useEffect re-fires the fetch.

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useTokenUsage', () => {
  it('mounts loading=true with data/quota/error null and refresh is a function', () => {
    server.use(
      http.get('/api/token-usage', () => HttpResponse.json({})),
      http.get('/api/quota', () => HttpResponse.json({})),
    );
    const { result } = renderHook(() => useTokenUsage({ perTask: false }));
    expect(result.current.data).toBeNull();
    expect(result.current.quota).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(true);
    expect(typeof result.current.refresh).toBe('function');
  });

  it('happy path (perTask=false): hits /api/token-usage with no query, populates data + quota', async () => {
    let tokenQuery = '__unset__';
    server.use(
      http.get('/api/token-usage', ({ request }) => {
        tokenQuery = new URL(request.url).search;
        return HttpResponse.json({ total: 100, totalInput: 60, totalOutput: 40 });
      }),
      http.get('/api/quota', () =>
        HttpResponse.json({ date: '2026-05-14', tiers: { daily: { used: 5 } } }),
      ),
    );
    const { result } = renderHook(() => useTokenUsage({ perTask: false }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(tokenQuery).toBe('');
    expect(result.current.data).toEqual({ total: 100, totalInput: 60, totalOutput: 40 });
    expect(result.current.quota?.date).toBe('2026-05-14');
    expect(result.current.error).toBeNull();
  });

  it('perTask=true appends ?perTask=1 to /api/token-usage', async () => {
    let tokenQuery = '__unset__';
    server.use(
      http.get('/api/token-usage', ({ request }) => {
        tokenQuery = new URL(request.url).search;
        return HttpResponse.json({ perTask: [{ name: 'w1', total: 10 }] });
      }),
      http.get('/api/quota', () => HttpResponse.json({})),
    );
    const { result } = renderHook(() => useTokenUsage({ perTask: true }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(tokenQuery).toBe('?perTask=1');
    expect(result.current.data?.perTask?.[0]?.total).toBe(10);
  });

  it('token-usage HTTP 500: sets error, clears data, still fetches quota', async () => {
    server.use(
      http.get('/api/token-usage', () =>
        HttpResponse.json({ error: 'boom' }, { status: 500 }),
      ),
      http.get('/api/quota', () =>
        HttpResponse.json({ date: '2026-05-14' }),
      ),
    );
    const { result } = renderHook(() => useTokenUsage({ perTask: false }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toMatch(/HTTP 500/);
    expect(result.current.data).toBeNull();
    expect(result.current.quota?.date).toBe('2026-05-14');
  });

  it('quota HTTP error is silent: no error set, quota stays null', async () => {
    server.use(
      http.get('/api/token-usage', () =>
        HttpResponse.json({ total: 42 }),
      ),
      http.get('/api/quota', () =>
        HttpResponse.json({ error: 'down' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useTokenUsage({ perTask: false }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.data?.total).toBe(42);
    expect(result.current.quota).toBeNull();
  });

  it('both endpoints fail: error reflects token-usage, quota stays null, loading=false', async () => {
    server.use(
      http.get('/api/token-usage', () =>
        HttpResponse.json({ error: 'a' }, { status: 500 }),
      ),
      http.get('/api/quota', () =>
        HttpResponse.json({ error: 'b' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useTokenUsage({ perTask: false }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toMatch(/HTTP 500/);
    expect(result.current.data).toBeNull();
    expect(result.current.quota).toBeNull();
  });

  it('refresh() re-fetches both endpoints and clears stale error on recovery', async () => {
    let tokenCalls = 0;
    let quotaCalls = 0;
    server.use(
      http.get('/api/token-usage', () => {
        tokenCalls++;
        return tokenCalls === 1
          ? HttpResponse.json({ error: 'boom' }, { status: 500 })
          : HttpResponse.json({ total: 7 });
      }),
      http.get('/api/quota', () => {
        quotaCalls++;
        return HttpResponse.json({ date: '2026-05-14' });
      }),
    );
    const { result } = renderHook(() => useTokenUsage({ perTask: false }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toMatch(/HTTP 500/);
    await act(async () => {
      await result.current.refresh();
    });
    expect(tokenCalls).toBe(2);
    expect(quotaCalls).toBe(2);
    expect(result.current.data?.total).toBe(7);
    expect(result.current.error).toBeNull();
  });

  it('loading flips true while inflight and back to false on settle', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    server.use(
      http.get('/api/token-usage', async () => {
        await gate;
        return HttpResponse.json({ total: 1 });
      }),
      http.get('/api/quota', () => HttpResponse.json({})),
    );
    const { result } = renderHook(() => useTokenUsage({ perTask: false }));
    expect(result.current.loading).toBe(true);
    release();
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('perTask prop flip triggers a re-fetch with the new query string', async () => {
    const urls: string[] = [];
    server.use(
      http.get('/api/token-usage', ({ request }) => {
        urls.push(new URL(request.url).search);
        return HttpResponse.json({});
      }),
      http.get('/api/quota', () => HttpResponse.json({})),
    );
    const { result, rerender } = renderHook(
      ({ p }: { p: boolean }) => useTokenUsage({ perTask: p }),
      { initialProps: { p: false } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    rerender({ p: true });
    await waitFor(() => expect(urls).toContain('?perTask=1'));
    expect(urls[0]).toBe('');
    expect(urls.at(-1)).toBe('?perTask=1');
  });

  it('refresh callback identity is stable across re-renders with the same perTask', async () => {
    server.use(
      http.get('/api/token-usage', () => HttpResponse.json({})),
      http.get('/api/quota', () => HttpResponse.json({})),
    );
    const { result, rerender } = renderHook(
      ({ p }: { p: boolean }) => useTokenUsage({ perTask: p }),
      { initialProps: { p: false } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    const first = result.current.refresh;
    rerender({ p: false });
    expect(result.current.refresh).toBe(first);
    rerender({ p: true });
    expect(result.current.refresh).not.toBe(first);
  });

  it('forwards the full TokenUsagePayload including perWorker and perDay maps', async () => {
    server.use(
      http.get('/api/token-usage', () =>
        HttpResponse.json({
          total: 100,
          perWorker: { 'auto-w1': 50, 'auto-w2': 50 },
          perDay: { '2026-05-13': 80, '2026-05-14': 20 },
        }),
      ),
      http.get('/api/quota', () => HttpResponse.json({})),
    );
    const { result } = renderHook(() => useTokenUsage({ perTask: false }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data?.perWorker?.['auto-w1']).toBe(50);
    expect(result.current.data?.perDay?.['2026-05-13']).toBe(80);
  });

  it('successive refresh() calls do not deadlock loading (re-enters cleanly)', async () => {
    server.use(
      http.get('/api/token-usage', () => HttpResponse.json({ total: 1 })),
      http.get('/api/quota', () => HttpResponse.json({})),
    );
    const { result } = renderHook(() => useTokenUsage({ perTask: false }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.refresh(); });
    await act(async () => { await result.current.refresh(); });
    expect(result.current.loading).toBe(false);
    expect(result.current.data?.total).toBe(1);
  });
});
