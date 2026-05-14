import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook, waitFor } from '@testing-library/react';
import { server } from '../test/server';
import { useRiskStats } from './use-risk-stats';
import type { StatsResponse } from '../pages/Risk';

// useRiskStats wraps the Risk page's stats poll. It owns
// windowHours (default 24), a stats slot, loading + error
// surfaces, and a refreshStats callback. It auto-fetches on mount
// and re-fetches whenever windowHours changes. The URL embeds the
// window via /api/risk/stats?windowHours=N.

const emptyStats: StatsResponse = {
  windowHours: 24,
  from: '2026-05-13T00:00:00Z',
  to: '2026-05-14T00:00:00Z',
  total: 0,
  enforced: 0,
  dryRun: 0,
  shadowExec: 0,
  shadowExecKilled: 0,
  shadowExecNonZero: 0,
  fingerprintsObserved: [],
  ruleSetRotations: 0,
  byLevel: { critical: 0, high: 0, medium: 0, low: 0 },
  topReasons: [],
  topWorkers: [],
};

describe('useRiskStats', () => {
  it('starts with windowHours=24, stats null on first paint, exposes setters', () => {
    // Stall the fetch so we can read the pre-resolve state cleanly.
    server.use(
      http.get(
        '/api/risk/stats',
        () => new Promise<HttpResponse>(() => {}),
      ),
    );
    const { result } = renderHook(() => useRiskStats());
    expect(result.current.windowHours).toBe(24);
    expect(result.current.stats).toBeNull();
    expect(result.current.statsError).toBeNull();
    expect(typeof result.current.setWindowHours).toBe('function');
    expect(typeof result.current.refreshStats).toBe('function');
  });

  it('auto-fetches on mount with windowHours=24 and stores the response', async () => {
    let receivedUrl = '';
    server.use(
      http.get('/api/risk/stats', ({ request }) => {
        receivedUrl = request.url;
        return HttpResponse.json(emptyStats);
      }),
    );
    const { result } = renderHook(() => useRiskStats());
    await waitFor(() => {
      expect(result.current.stats).not.toBeNull();
    });
    expect(receivedUrl).toContain('windowHours=24');
    expect(result.current.stats).toEqual(emptyStats);
    expect(result.current.statsError).toBeNull();
    expect(result.current.statsLoading).toBe(false);
  });

  it('refetches when windowHours changes (uses the new value in the URL)', async () => {
    const seen: string[] = [];
    server.use(
      http.get('/api/risk/stats', ({ request }) => {
        seen.push(new URL(request.url).search);
        return HttpResponse.json(emptyStats);
      }),
    );
    const { result } = renderHook(() => useRiskStats());
    await waitFor(() => {
      expect(result.current.stats).not.toBeNull();
    });
    expect(seen[0]).toContain('windowHours=24');
    act(() => result.current.setWindowHours(72));
    await waitFor(() => {
      expect(seen.length).toBeGreaterThan(1);
    });
    expect(seen[seen.length - 1]).toContain('windowHours=72');
  });

  it('setWindowHours updates the exposed windowHours value', async () => {
    server.use(
      http.get('/api/risk/stats', () => HttpResponse.json(emptyStats)),
    );
    const { result } = renderHook(() => useRiskStats());
    await waitFor(() => {
      expect(result.current.stats).not.toBeNull();
    });
    act(() => result.current.setWindowHours(168));
    expect(result.current.windowHours).toBe(168);
  });

  it('error path: surfaces the HTTP message on a 500 response', async () => {
    server.use(
      http.get('/api/risk/stats', () =>
        HttpResponse.json({ error: 'kaboom' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useRiskStats());
    await waitFor(() => {
      expect(result.current.statsError).toBeTruthy();
    });
    expect(result.current.statsError).toContain('HTTP 500');
    expect(result.current.stats).toBeNull();
    expect(result.current.statsLoading).toBe(false);
  });

  it('clears stale error before the next refresh', async () => {
    server.use(
      http.get('/api/risk/stats', () =>
        HttpResponse.json({ error: 'first' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useRiskStats());
    await waitFor(() => {
      expect(result.current.statsError).toBeTruthy();
    });
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.get('/api/risk/stats', async () => {
        await gate;
        return HttpResponse.json(emptyStats);
      }),
    );
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.refreshStats();
      await Promise.resolve();
    });
    expect(result.current.statsError).toBeNull();
    release();
    await act(async () => {
      await inflight;
    });
  });

  it('flips statsLoading=true while in-flight then back to false on success', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.get('/api/risk/stats', async () => {
        await gate;
        return HttpResponse.json(emptyStats);
      }),
    );
    const { result } = renderHook(() => useRiskStats());
    // Loading should flip true while the mount fetch is gated.
    await waitFor(() => {
      expect(result.current.statsLoading).toBe(true);
    });
    release();
    await waitFor(() => {
      expect(result.current.statsLoading).toBe(false);
    });
  });

  it('statsLoading returns to false even when the fetch errors', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.get('/api/risk/stats', async () => {
        await gate;
        return HttpResponse.json({ error: 'no' }, { status: 503 });
      }),
    );
    const { result } = renderHook(() => useRiskStats());
    await waitFor(() => {
      expect(result.current.statsLoading).toBe(true);
    });
    release();
    await waitFor(() => {
      expect(result.current.statsLoading).toBe(false);
    });
    expect(result.current.statsError).toBeTruthy();
  });

  it('manual refreshStats() POSTs another GET and updates stats', async () => {
    let calls = 0;
    server.use(
      http.get('/api/risk/stats', () => {
        calls++;
        return HttpResponse.json({ ...emptyStats, total: calls });
      }),
    );
    const { result } = renderHook(() => useRiskStats());
    await waitFor(() => {
      expect(result.current.stats?.total).toBe(1);
    });
    await act(async () => {
      await result.current.refreshStats();
    });
    expect(result.current.stats?.total).toBe(2);
  });

  it('refreshStats reference changes when windowHours changes (useCallback dep)', async () => {
    server.use(
      http.get('/api/risk/stats', () => HttpResponse.json(emptyStats)),
    );
    const { result } = renderHook(() => useRiskStats());
    await waitFor(() => {
      expect(result.current.stats).not.toBeNull();
    });
    const first = result.current.refreshStats;
    act(() => result.current.setWindowHours(48));
    await waitFor(() => {
      expect(result.current.refreshStats).not.toBe(first);
    });
  });

  it('clears stale error on a successful manual refresh after an error', async () => {
    server.use(
      http.get('/api/risk/stats', () =>
        HttpResponse.json({ error: 'down' }, { status: 502 }),
      ),
    );
    const { result } = renderHook(() => useRiskStats());
    await waitFor(() => {
      expect(result.current.statsError).toBeTruthy();
    });
    server.use(
      http.get('/api/risk/stats', () => HttpResponse.json(emptyStats)),
    );
    await act(async () => {
      await result.current.refreshStats();
    });
    expect(result.current.statsError).toBeNull();
    expect(result.current.stats).toEqual(emptyStats);
  });

  it('accepts arbitrary windowHours values and forwards them verbatim', async () => {
    let lastUrl = '';
    server.use(
      http.get('/api/risk/stats', ({ request }) => {
        lastUrl = request.url;
        return HttpResponse.json(emptyStats);
      }),
    );
    const { result } = renderHook(() => useRiskStats());
    await waitFor(() => {
      expect(result.current.stats).not.toBeNull();
    });
    act(() => result.current.setWindowHours(720));
    await waitFor(() => {
      expect(lastUrl).toContain('windowHours=720');
    });
    expect(result.current.windowHours).toBe(720);
  });
});
