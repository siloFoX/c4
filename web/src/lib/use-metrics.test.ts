import { describe, it, expect, vi, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderHook, act } from '@testing-library/react';
import { server } from '../test/server';
import {
  useMetrics,
  HEALTHY_INTERVAL_MS,
  type MetricsResponse,
} from './use-metrics';

// useMetrics self-polls /api/metrics and keeps the last successful
// payload. (v1.11.1100, TODO 11.1082) The poll interval is 20s when
// healthy; a 401 STOPS polling and surfaces a `needs-login` status;
// other transient failures keep the last value and retry with
// exponential backoff (20s -> 40s -> 80s ... capped). The hook now
// returns { data, status } rather than the bare payload.

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
  it('starts loading: data null + status loading before the first fetch', () => {
    server.use(
      http.get('/api/metrics', () => HttpResponse.json(makeMetrics())),
    );
    const { result } = renderHook(() => useMetrics());
    expect(result.current.data).toBeNull();
    expect(result.current.status).toBe('loading');
  });

  it('hits /api/metrics once on mount, stores payload, status ok', async () => {
    let calls = 0;
    server.use(
      http.get('/api/metrics', () => {
        calls++;
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
    expect(calls).toBe(1);
    expect(result.current.data?.totals.liveWorkers).toBe(3);
    expect(result.current.status).toBe('ok');
  });

  it('STOPS polling on a 401 and surfaces needs-login (no flood)', async () => {
    vi.useFakeTimers();
    let calls = 0;
    server.use(
      http.get('/api/metrics', () => {
        calls++;
        return HttpResponse.json({ error: 'unauthorized' }, { status: 401 });
      }),
    );
    const { result } = renderHook(() => useMetrics());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(calls).toBe(1);
    expect(result.current.status).toBe('needs-login');
    expect(result.current.data).toBeNull();
    // Advancing well past several healthy intervals must NOT fire
    // another request -- the 401 stopped the loop entirely.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(HEALTHY_INTERVAL_MS * 5);
    });
    expect(calls).toBe(1);
    expect(result.current.status).toBe('needs-login');
  });

  it('polls on the 20s healthy interval (not 5s)', async () => {
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
    // The legacy 5s mark must NOT trigger a second poll anymore.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(calls).toBe(1);
    // Just before 20s: still one call.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(HEALTHY_INTERVAL_MS - 5000 - 1);
    });
    expect(calls).toBe(1);
    // At the 20s mark: the second poll fires.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(calls).toBe(2);
  });

  it('exponential backoff on transient (500) errors: 40s, then 80s', async () => {
    vi.useFakeTimers();
    let calls = 0;
    server.use(
      http.get('/api/metrics', () => {
        calls++;
        return HttpResponse.json({ error: 'oops' }, { status: 500 });
      }),
    );
    const { result } = renderHook(() => useMetrics());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(calls).toBe(1);
    expect(result.current.status).toBe('error');
    // First backoff doubles the 20s base to 40s -- nothing before.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(39999);
    });
    expect(calls).toBe(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(calls).toBe(2);
    // Second consecutive failure doubles again to 80s.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(79999);
    });
    expect(calls).toBe(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(calls).toBe(3);
  });

  it('resets to the 20s interval after a success following errors', async () => {
    vi.useFakeTimers();
    let calls = 0;
    server.use(
      http.get('/api/metrics', () => {
        calls++;
        // First call errors, the rest succeed.
        if (calls === 1) {
          return HttpResponse.json({ error: 'oops' }, { status: 500 });
        }
        return HttpResponse.json(makeMetrics());
      }),
    );
    const { result } = renderHook(() => useMetrics());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(calls).toBe(1);
    // Backoff to 40s -> second call succeeds.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(40000);
    });
    expect(calls).toBe(2);
    expect(result.current.status).toBe('ok');
    // After success the interval resets to 20s (not the 40s backoff).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(HEALTHY_INTERVAL_MS);
    });
    expect(calls).toBe(3);
  });

  it('keeps the last successful value on a subsequent transient error', async () => {
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
    expect(result.current.data?.totals.liveWorkers).toBe(7);
    expect(result.current.status).toBe('ok');
    // Next poll (20s) errors -> keep the last value, status stays ok.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(HEALTHY_INTERVAL_MS);
    });
    expect(result.current.data?.totals.liveWorkers).toBe(7);
    expect(result.current.status).toBe('ok');
  });

  it('clears the timer on unmount (no further requests after cleanup)', async () => {
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
      await vi.advanceTimersByTimeAsync(HEALTHY_INTERVAL_MS * 4);
    });
    expect(calls).toBe(1);
  });

  it('does not setState after unmount even if the in-flight fetch resolves later', async () => {
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
    expect(result.current.data).toBeNull();
    unmount();
    release(makeMetrics());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    // Passes if no "setState on unmounted component" warning fires.
  });
});
