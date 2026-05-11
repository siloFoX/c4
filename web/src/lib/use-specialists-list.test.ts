import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook, waitFor } from '@testing-library/react';
import { server } from '../test/server';
import { useSpecialistsList } from './use-specialists-list';

// useSpecialistsList owns the /api/specialists list (loading, data, error)
// plus a sibling /api/specialists/underperformers fetch whose ids feed
// the per-row pill set. Both run once on mount; refresh() re-fetches the
// list but is documented NOT to touch the flagged set (best-effort,
// independent cadence). Failures on the flag endpoint are swallowed so
// a broken detector doesn't block the main view.

describe('useSpecialistsList', () => {
  it('starts in a loading slot with empty data and no flags', () => {
    server.use(
      http.get('/api/specialists', () =>
        HttpResponse.json({ count: 0, version: 1, specialists: [] }),
      ),
      http.get('/api/specialists/underperformers', () =>
        HttpResponse.json({ items: [] }),
      ),
    );
    const { result } = renderHook(() => useSpecialistsList());
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.flaggedIds.size).toBe(0);
  });

  it('GETs /api/specialists and surfaces the daemon payload', async () => {
    let path = '';
    server.use(
      http.get('/api/specialists', ({ request }) => {
        path = new URL(request.url).pathname;
        return HttpResponse.json({
          count: 2,
          version: 7,
          specialists: [
            { id: 'spec-a', displayName: 'Alpha' },
            { id: 'spec-b', displayName: 'Beta' },
          ],
        });
      }),
      http.get('/api/specialists/underperformers', () =>
        HttpResponse.json({ items: [] }),
      ),
    );
    const { result } = renderHook(() => useSpecialistsList());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(path).toBe('/api/specialists');
    expect(result.current.data?.count).toBe(2);
    expect(result.current.data?.version).toBe(7);
    expect(result.current.data?.specialists).toHaveLength(2);
    expect(result.current.error).toBeNull();
  });

  it('populates flaggedIds from /api/specialists/underperformers', async () => {
    let flagsPath = '';
    server.use(
      http.get('/api/specialists', () =>
        HttpResponse.json({ count: 0, version: 1, specialists: [] }),
      ),
      http.get('/api/specialists/underperformers', ({ request }) => {
        flagsPath = new URL(request.url).pathname;
        return HttpResponse.json({
          items: [{ id: 'spec-a' }, { id: 'spec-b' }],
        });
      }),
    );
    const { result } = renderHook(() => useSpecialistsList());
    await waitFor(() => {
      expect(result.current.flaggedIds.size).toBe(2);
    });
    expect(flagsPath).toBe('/api/specialists/underperformers');
    expect(result.current.flaggedIds.has('spec-a')).toBe(true);
    expect(result.current.flaggedIds.has('spec-b')).toBe(true);
  });

  it('treats a missing items array on the flags response as no flags (no throw)', async () => {
    server.use(
      http.get('/api/specialists', () =>
        HttpResponse.json({ count: 0, version: 1, specialists: [] }),
      ),
      http.get('/api/specialists/underperformers', () =>
        HttpResponse.json({}),
      ),
    );
    const { result } = renderHook(() => useSpecialistsList());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.flaggedIds.size).toBe(0);
    expect(result.current.error).toBeNull();
  });

  it('surfaces an error message on a /api/specialists 5xx', async () => {
    server.use(
      http.get('/api/specialists', () =>
        HttpResponse.json({ error: 'down' }, { status: 500 }),
      ),
      http.get('/api/specialists/underperformers', () =>
        HttpResponse.json({ items: [] }),
      ),
    );
    const { result } = renderHook(() => useSpecialistsList());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.error).toBeTruthy();
    expect(result.current.data).toBeNull();
  });

  it('silently swallows a failure on the flags endpoint (best-effort)', async () => {
    server.use(
      http.get('/api/specialists', () =>
        HttpResponse.json({
          count: 1,
          version: 1,
          specialists: [{ id: 'a' }],
        }),
      ),
      http.get('/api/specialists/underperformers', () =>
        HttpResponse.json({ error: 'detector misconfigured' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useSpecialistsList());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    // Main list still lands, flag set stays empty, no error surfaces.
    expect(result.current.data?.count).toBe(1);
    expect(result.current.flaggedIds.size).toBe(0);
    expect(result.current.error).toBeNull();
  });

  it('refresh() re-fetches the list', async () => {
    let listCalls = 0;
    server.use(
      http.get('/api/specialists', () => {
        listCalls++;
        return HttpResponse.json({
          count: listCalls,
          version: listCalls,
          specialists: [],
        });
      }),
      http.get('/api/specialists/underperformers', () =>
        HttpResponse.json({ items: [] }),
      ),
    );
    const { result } = renderHook(() => useSpecialistsList());
    await waitFor(() => {
      expect(result.current.data?.count).toBe(1);
    });
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.data?.count).toBe(2);
    expect(listCalls).toBe(2);
  });

  it('refresh() does NOT re-fetch the flagged set (separate cadence by design)', async () => {
    let flagCalls = 0;
    server.use(
      http.get('/api/specialists', () =>
        HttpResponse.json({ count: 0, version: 1, specialists: [] }),
      ),
      http.get('/api/specialists/underperformers', () => {
        flagCalls++;
        return HttpResponse.json({ items: [] });
      }),
    );
    const { result } = renderHook(() => useSpecialistsList());
    await waitFor(() => {
      expect(flagCalls).toBe(1);
    });
    await act(async () => {
      await result.current.refresh();
    });
    // Still 1 — refresh() only touches the main list.
    expect(flagCalls).toBe(1);
  });

  it('clears stale error state on a refresh that succeeds', async () => {
    server.use(
      http.get('/api/specialists', () =>
        HttpResponse.json({ error: 'first' }, { status: 500 }),
      ),
      http.get('/api/specialists/underperformers', () =>
        HttpResponse.json({ items: [] }),
      ),
    );
    const { result } = renderHook(() => useSpecialistsList());
    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });
    server.use(
      http.get('/api/specialists', () =>
        HttpResponse.json({
          count: 1,
          version: 2,
          specialists: [{ id: 'x' }],
        }),
      ),
    );
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.error).toBeNull();
    expect(result.current.data?.count).toBe(1);
  });

  it('flips loading=true during the in-flight refresh and back to false on resolve', async () => {
    let release: () => void = () => {};
    let gate: Promise<void> | null = null;
    let calls = 0;
    server.use(
      http.get('/api/specialists', async () => {
        calls += 1;
        // Only gate the second call so initial mount can settle quickly.
        if (calls === 2) await gate!;
        return HttpResponse.json({
          count: calls,
          version: calls,
          specialists: [],
        });
      }),
      http.get('/api/specialists/underperformers', () =>
        HttpResponse.json({ items: [] }),
      ),
    );
    const { result } = renderHook(() => useSpecialistsList());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    gate = new Promise<void>((r) => {
      release = r;
    });
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.refresh();
      await Promise.resolve();
    });
    expect(result.current.loading).toBe(true);
    release();
    await act(async () => {
      await inflight;
    });
    expect(result.current.loading).toBe(false);
  });
});
