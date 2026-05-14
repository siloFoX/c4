import { describe, it, expect, vi, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook, waitFor } from '@testing-library/react';
import { server } from '../test/server';
import { useScribe } from './use-scribe';

// useScribe owns the dual /scribe/status + /scribe-context fetch
// plus the act(endpoint, label) POST wrapper. Contract:
//   - mounts loading=true, fires both GETs on first paint
//   - happy path stores status + context, loading=false, error=null
//   - status GET failure surfaces via `error`; context GET failure
//     is swallowed silently (treated as "no snapshot yet")
//   - refresh() re-runs both fetches and clears stale error
//   - act() POSTs the given endpoint, fires scribe.toast.ok on
//     success, scribe.toast.failed on throw, busy slot keyed by
//     endpoint string flips around the inflight POST, refresh()
//     fires after every exit branch
//   - the in-flight refresh after act flips loading=true again,
//     so the page re-renders the spinner.

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useScribe', () => {
  it('mounts loading=true and the rest of the state is idle', () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.get('/api/scribe/status', async () => {
        await gate;
        return HttpResponse.json({ running: true });
      }),
      http.get('/api/scribe-context', () =>
        HttpResponse.json({ content: 'snap' }),
      ),
    );
    const { result } = renderHook(() => useScribe({ showToast: vi.fn() }));
    expect(result.current.loading).toBe(true);
    expect(result.current.status).toBeNull();
    expect(result.current.context).toBeNull();
    expect(result.current.busy).toBeNull();
    expect(result.current.error).toBeNull();
    expect(typeof result.current.refresh).toBe('function');
    expect(typeof result.current.act).toBe('function');
    release();
  });

  it('happy path: stores status + context, flips loading=false, clears error', async () => {
    server.use(
      http.get('/api/scribe/status', () =>
        HttpResponse.json({ running: true, scans: 2, sessions: 3 }),
      ),
      http.get('/api/scribe-context', () =>
        HttpResponse.json({ content: '# snapshot', updatedAt: 12345 }),
      ),
    );
    const { result } = renderHook(() => useScribe({ showToast: vi.fn() }));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.status).toEqual({
      running: true,
      scans: 2,
      sessions: 3,
    });
    expect(result.current.context?.content).toBe('# snapshot');
    expect(result.current.error).toBeNull();
  });

  it('status GET failure surfaces via error, status reset to null', async () => {
    server.use(
      http.get('/api/scribe/status', () =>
        HttpResponse.json({ error: 'kaboom' }, { status: 500 }),
      ),
      http.get('/api/scribe-context', () =>
        HttpResponse.json({ content: '# snap' }),
      ),
    );
    const { result } = renderHook(() => useScribe({ showToast: vi.fn() }));
    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });
    expect(result.current.status).toBeNull();
    expect(result.current.error).toMatch(/HTTP 500/);
    expect(result.current.loading).toBe(false);
  });

  it('context GET failure is silently swallowed (context=null, error untouched)', async () => {
    server.use(
      http.get('/api/scribe/status', () =>
        HttpResponse.json({ running: false }),
      ),
      http.get('/api/scribe-context', () =>
        HttpResponse.json({ error: 'gone' }, { status: 404 }),
      ),
    );
    const { result } = renderHook(() => useScribe({ showToast: vi.fn() }));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.status).toEqual({ running: false });
    expect(result.current.context).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('refresh() re-runs both fetches and updates state', async () => {
    let statusCalls = 0;
    let ctxCalls = 0;
    server.use(
      http.get('/api/scribe/status', () => {
        statusCalls++;
        return HttpResponse.json({ scans: statusCalls });
      }),
      http.get('/api/scribe-context', () => {
        ctxCalls++;
        return HttpResponse.json({ content: `c-${ctxCalls}` });
      }),
    );
    const { result } = renderHook(() => useScribe({ showToast: vi.fn() }));
    await waitFor(() => expect(result.current.status?.scans).toBe(1));
    await act(async () => {
      await result.current.refresh();
    });
    expect(statusCalls).toBe(2);
    expect(ctxCalls).toBe(2);
    expect(result.current.status?.scans).toBe(2);
    expect(result.current.context?.content).toBe('c-2');
  });

  it('refresh() clears stale error on success', async () => {
    server.use(
      http.get('/api/scribe/status', () =>
        HttpResponse.json({ error: 'gone' }, { status: 500 }),
      ),
      http.get('/api/scribe-context', () => HttpResponse.json({})),
    );
    const { result } = renderHook(() => useScribe({ showToast: vi.fn() }));
    await waitFor(() => expect(result.current.error).toBeTruthy());
    server.use(
      http.get('/api/scribe/status', () =>
        HttpResponse.json({ running: true }),
      ),
      http.get('/api/scribe-context', () =>
        HttpResponse.json({ content: 'fresh' }),
      ),
    );
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.error).toBeNull();
    expect(result.current.status?.running).toBe(true);
  });

  it('act() happy path: POSTs endpoint, fires scribe.toast.ok success, busy flips around inflight', async () => {
    let posted: string | null = null;
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.get('/api/scribe/status', () =>
        HttpResponse.json({ running: true }),
      ),
      http.get('/api/scribe-context', () =>
        HttpResponse.json({ content: 'snap' }),
      ),
      http.post('/api/scribe/scan', async ({ request }) => {
        posted = new URL(request.url).pathname;
        await gate;
        return HttpResponse.json({ ok: true });
      }),
    );
    const showToast = vi.fn();
    const { result } = renderHook(() => useScribe({ showToast }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let inflight: Promise<void> | null = null;
    act(() => {
      inflight = result.current.act('/api/scribe/scan', 'Scan');
    });
    await waitFor(() => {
      expect(result.current.busy).toBe('/api/scribe/scan');
    });
    release();
    await act(async () => {
      await inflight;
    });
    expect(posted).toBe('/api/scribe/scan');
    expect(showToast).toHaveBeenCalledWith('Scan ok', 'success');
    expect(result.current.busy).toBeNull();
  });

  it('act() failure: HTTP 500 surfaces scribe.toast.failed error and clears busy', async () => {
    server.use(
      http.get('/api/scribe/status', () =>
        HttpResponse.json({ running: true }),
      ),
      http.get('/api/scribe-context', () =>
        HttpResponse.json({ content: 'snap' }),
      ),
      http.post('/api/scribe/stop', () =>
        HttpResponse.json({ error: 'no' }, { status: 500 }),
      ),
    );
    const showToast = vi.fn();
    const { result } = renderHook(() => useScribe({ showToast }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.act('/api/scribe/stop', 'Stop');
    });
    expect(showToast).toHaveBeenCalledTimes(1);
    const [msg, type] = showToast.mock.calls[0]!;
    expect(msg).toMatch(/^Stop failed: /);
    expect(msg).toMatch(/HTTP 500/);
    expect(type).toBe('error');
    expect(result.current.busy).toBeNull();
  });

  it('act() triggers a refresh after the POST resolves', async () => {
    let statusCalls = 0;
    server.use(
      http.get('/api/scribe/status', () => {
        statusCalls++;
        return HttpResponse.json({ running: false });
      }),
      http.get('/api/scribe-context', () => HttpResponse.json({})),
      http.post('/api/scribe/start', () => HttpResponse.json({ ok: true })),
    );
    const { result } = renderHook(() => useScribe({ showToast: vi.fn() }));
    await waitFor(() => expect(statusCalls).toBe(1));
    await act(async () => {
      await result.current.act('/api/scribe/start', 'Start');
    });
    expect(statusCalls).toBe(2);
  });

  it('act() refresh runs even after the POST throws', async () => {
    let statusCalls = 0;
    server.use(
      http.get('/api/scribe/status', () => {
        statusCalls++;
        return HttpResponse.json({ running: false });
      }),
      http.get('/api/scribe-context', () => HttpResponse.json({})),
      http.post('/api/scribe/start', () =>
        HttpResponse.json({ error: 'no' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useScribe({ showToast: vi.fn() }));
    await waitFor(() => expect(statusCalls).toBe(1));
    await act(async () => {
      await result.current.act('/api/scribe/start', 'Start');
    });
    expect(statusCalls).toBe(2);
  });

  it('busy slot identifies the endpoint string verbatim', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.get('/api/scribe/status', () => HttpResponse.json({})),
      http.get('/api/scribe-context', () => HttpResponse.json({})),
      http.post('/api/scribe/custom-thing', async () => {
        await gate;
        return HttpResponse.json({ ok: true });
      }),
    );
    const { result } = renderHook(() => useScribe({ showToast: vi.fn() }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    let inflight: Promise<void> | null = null;
    act(() => {
      inflight = result.current.act('/api/scribe/custom-thing', 'Custom');
    });
    await waitFor(() => {
      expect(result.current.busy).toBe('/api/scribe/custom-thing');
    });
    release();
    await act(async () => {
      await inflight;
    });
    expect(result.current.busy).toBeNull();
  });

  it('refresh reference is stable across renders (useCallback has no deps)', async () => {
    server.use(
      http.get('/api/scribe/status', () => HttpResponse.json({})),
      http.get('/api/scribe-context', () => HttpResponse.json({})),
    );
    const { result, rerender } = renderHook(() =>
      useScribe({ showToast: vi.fn() }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    const first = result.current.refresh;
    rerender();
    expect(result.current.refresh).toBe(first);
  });
});
