import { describe, it, expect, vi, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderHook, act } from '@testing-library/react';
import { server } from '../test/server';
import { useMetrics, type MetricsResponse } from './use-metrics';

// useMetrics self-polls /api/metrics every 5 seconds and keeps
// the last successful payload. Network blips and non-OK
// responses are silently swallowed (the bar is decorative and
// renders an em-dash placeholder when state is still null). The
// hook calls window.fetch directly rather than apiFetch because
// the daemon's /api/metrics route predates the shared auth
// middleware.

function makeMetrics(overrides: Partial<MetricsResponse> = {}): MetricsResponse {
  return {
    daemon: {
      platform: 'linux',
      pid: 1234,
      uptimeSec: 60,
      rssKb: 4096,
      heapUsedKb: 1024,
      heapTotalKb: 2048,
      cpus: 8,
      loadavg: [0.1, 0.2, 0.3],
    },
    workers: [],
    totals: {
      liveWorkers: 0,
      totalWorkers: 0,
      totalRssKb: 0,
      totalCpuPct: 0,
    },
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('useMetrics', () => {
  it('starts idle: returns null before the first fetch resolves', () => {
    server.use(
      http.get('/api/metrics', () => HttpResponse.json(makeMetrics())),
    );
    const { result } = renderHook(() => useMetrics());
    expect(result.current).toBeNull();
  });

  it('hits /api/metrics exactly once on mount and stores the payload', async () => {
    let path = '';
    let calls = 0;
    server.use(
      http.get('/api/metrics', ({ request }) => {
        calls++;
        path = new URL(request.url).pathname;
        return HttpResponse.json(
          makeMetrics({
            totals: {
              liveWorkers: 3,
              totalWorkers: 7,
              totalRssKb: 99999,
              totalCpuPct: 12,
            },
          }),
        );
      }),
    );
    const { result } = renderHook(() => useMetrics());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(path).toBe('/api/metrics');
    expect(calls).toBe(1);
    expect(result.current?.totals.liveWorkers).toBe(3);
    expect(result.current?.totals.totalWorkers).toBe(7);
  });

  it('stays null when the server returns a non-OK status (no error surface)', async () => {
    server.use(
      http.get('/api/metrics', () =>
        HttpResponse.json({ error: 'denied' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useMetrics());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current).toBeNull();
  });

  it('stays null when fetch throws a network error', async () => {
    server.use(http.get('/api/metrics', () => HttpResponse.error()));
    const { result } = renderHook(() => useMetrics());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current).toBeNull();
  });

  it('polls every 5 seconds via setInterval (vi.useFakeTimers + advanceTimersByTimeAsync)', async () => {
    vi.useFakeTimers();
    let calls = 0;
    server.use(
      http.get('/api/metrics', () => {
        calls++;
        return HttpResponse.json(
          makeMetrics({
            totals: {
              liveWorkers: calls,
              totalWorkers: calls,
              totalRssKb: 0,
              totalCpuPct: 0,
            },
          }),
        );
      }),
    );
    const { result } = renderHook(() => useMetrics());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(calls).toBe(1);
    expect(result.current?.totals.liveWorkers).toBe(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(calls).toBe(2);
    expect(result.current?.totals.liveWorkers).toBe(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(calls).toBe(3);
    expect(result.current?.totals.liveWorkers).toBe(3);
  });

  it('does NOT fire any extra request before the 5s mark', async () => {
    vi.useFakeTimers();
    let calls = 0;
    server.use(
      http.get('/api/metrics', () => {
        calls++;
        return HttpResponse.json(makeMetrics());
      }),
    );
    renderHook(() => useMetrics());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(calls).toBe(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4999);
    });
    expect(calls).toBe(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(calls).toBe(2);
  });

  it('keeps the last successful value on a subsequent error response (no clobber)', async () => {
    vi.useFakeTimers();
    let phase = 0;
    server.use(
      http.get('/api/metrics', () => {
        phase++;
        if (phase === 1) {
          return HttpResponse.json(
            makeMetrics({
              totals: {
                liveWorkers: 7,
                totalWorkers: 7,
                totalRssKb: 0,
                totalCpuPct: 0,
              },
            }),
          );
        }
        return HttpResponse.json({ error: 'oops' }, { status: 500 });
      }),
    );
    const { result } = renderHook(() => useMetrics());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current?.totals.liveWorkers).toBe(7);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(result.current?.totals.liveWorkers).toBe(7);
  });

  it('clears the interval on unmount (no further requests after cleanup)', async () => {
    vi.useFakeTimers();
    let calls = 0;
    server.use(
      http.get('/api/metrics', () => {
        calls++;
        return HttpResponse.json(makeMetrics());
      }),
    );
    const { unmount } = renderHook(() => useMetrics());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(calls).toBe(1);
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });
    expect(calls).toBe(1);
  });

  it('does not setState after unmount even if the in-flight fetch resolves later (alive guard)', async () => {
    let release: (data: MetricsResponse) => void = () => {};
    server.use(
      http.get('/api/metrics', async () => {
        const data = await new Promise<MetricsResponse>((resolve) => {
          release = resolve;
        });
        return HttpResponse.json(data);
      }),
    );
    const { result, unmount } = renderHook(() => useMetrics());
    expect(result.current).toBeNull();
    unmount();
    // Releasing after unmount should NOT throw the classic
    // "can't perform a React state update on an unmounted
    // component" warning; the hook guards with `alive`.
    release(
      makeMetrics({
        totals: {
          liveWorkers: 9,
          totalWorkers: 9,
          totalRssKb: 0,
          totalCpuPct: 0,
        },
      }),
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    // No assertion on result.current since the hook is unmounted —
    // the test passes if no React warning fires here.
  });

  it('busy slot via release-gate: the first tick holds state at null until the server resolves', async () => {
    let release: (data: MetricsResponse) => void = () => {};
    server.use(
      http.get('/api/metrics', async () => {
        const data = await new Promise<MetricsResponse>((resolve) => {
          release = resolve;
        });
        return HttpResponse.json(data);
      }),
    );
    const { result } = renderHook(() => useMetrics());
    expect(result.current).toBeNull();
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toBeNull();
    const payload = makeMetrics({
      totals: {
        liveWorkers: 11,
        totalWorkers: 11,
        totalRssKb: 0,
        totalCpuPct: 0,
      },
    });
    await act(async () => {
      release(payload);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current?.totals.liveWorkers).toBe(11);
  });
});
