import { describe, it, expect, vi, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook, waitFor } from '@testing-library/react';
import { server } from '../test/server';
import { useAutonomousPauseToggle } from './use-autonomous-pause-toggle';
import type { DigestResponse } from '../components/AutonomousView';

afterEach(() => {
  vi.restoreAllMocks();
});

function makeDigest(overrides: Partial<DigestResponse> = {}): DigestResponse {
  return {
    windowMs: 60_000,
    from: '2026-01-01T00:00:00Z',
    to: '2026-01-01T00:01:00Z',
    paused: false,
    dispatched: 0,
    succeeded: 0,
    halted: 0,
    dispatchErrors: 0,
    successRate: null,
    pendingEscalations: 0,
    resolvedEscalations: 0,
    ...overrides,
  };
}

describe('useAutonomousPauseToggle', () => {
  it('starts idle: pauseBusy=false, pauseMsg=null, pauseFailed=false', () => {
    const refresh = vi.fn(async () => {});
    const { result } = renderHook(() =>
      useAutonomousPauseToggle({ digest: makeDigest(), refresh }),
    );
    expect(result.current.pauseBusy).toBe(false);
    expect(result.current.pauseMsg).toBeNull();
    expect(result.current.pauseFailed).toBe(false);
  });

  it('skips POST + refresh when digest is null (validation guard)', async () => {
    let calls = 0;
    server.use(
      http.post('/api/autonomous/pause', () => {
        calls++;
        return HttpResponse.json({ ok: true });
      }),
      http.post('/api/autonomous/resume', () => {
        calls++;
        return HttpResponse.json({ ok: true });
      }),
    );
    const refresh = vi.fn(async () => {});
    const { result } = renderHook(() =>
      useAutonomousPauseToggle({ digest: null, refresh }),
    );
    await act(async () => {
      await result.current.handlePauseToggle();
    });
    expect(calls).toBe(0);
    expect(refresh).not.toHaveBeenCalled();
    expect(result.current.pauseBusy).toBe(false);
    expect(result.current.pauseMsg).toBeNull();
    expect(result.current.pauseFailed).toBe(false);
  });

  it('POSTs /api/autonomous/pause with body {} when digest.paused=false (happy path)', async () => {
    let body: unknown = null;
    let path = '';
    server.use(
      http.post('/api/autonomous/pause', async ({ request }) => {
        body = await request.json();
        path = new URL(request.url).pathname;
        return HttpResponse.json({ ok: true });
      }),
    );
    const refresh = vi.fn(async () => {});
    const { result } = renderHook(() =>
      useAutonomousPauseToggle({
        digest: makeDigest({ paused: false }),
        refresh,
      }),
    );
    await act(async () => {
      await result.current.handlePauseToggle();
    });
    expect(path).toBe('/api/autonomous/pause');
    expect(body).toEqual({});
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(result.current.pauseFailed).toBe(false);
    expect(result.current.pauseMsg).toBeTruthy();
  });

  it('POSTs /api/autonomous/resume when digest.paused=true (path inversion)', async () => {
    let path = '';
    server.use(
      http.post('/api/autonomous/resume', ({ request }) => {
        path = new URL(request.url).pathname;
        return HttpResponse.json({ ok: true });
      }),
    );
    const refresh = vi.fn(async () => {});
    const { result } = renderHook(() =>
      useAutonomousPauseToggle({
        digest: makeDigest({ paused: true }),
        refresh,
      }),
    );
    await act(async () => {
      await result.current.handlePauseToggle();
    });
    expect(path).toBe('/api/autonomous/resume');
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(result.current.pauseFailed).toBe(false);
  });

  it('surfaces a failure tone + message and skips refresh on server error', async () => {
    server.use(
      http.post('/api/autonomous/pause', () =>
        HttpResponse.json({ error: 'busy' }, { status: 409 }),
      ),
    );
    const refresh = vi.fn(async () => {});
    const { result } = renderHook(() =>
      useAutonomousPauseToggle({
        digest: makeDigest({ paused: false }),
        refresh,
      }),
    );
    await act(async () => {
      await result.current.handlePauseToggle();
    });
    expect(result.current.pauseFailed).toBe(true);
    expect(result.current.pauseMsg).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
    expect(result.current.pauseBusy).toBe(false);
  });

  it('flips pauseBusy true while in-flight and back to false on resolve (release-gate)', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.post('/api/autonomous/pause', async () => {
        await gate;
        return HttpResponse.json({ ok: true });
      }),
    );
    const refresh = vi.fn(async () => {});
    const { result } = renderHook(() =>
      useAutonomousPauseToggle({
        digest: makeDigest({ paused: false }),
        refresh,
      }),
    );
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.handlePauseToggle();
      await Promise.resolve();
    });
    expect(result.current.pauseBusy).toBe(true);
    release();
    await act(async () => {
      await inflight;
    });
    expect(result.current.pauseBusy).toBe(false);
  });

  it('clears prior failure tone on a fresh successful run (reset before send)', async () => {
    server.use(
      http.post('/api/autonomous/pause', () =>
        HttpResponse.json({ error: 'oops' }, { status: 500 }),
      ),
    );
    const refresh = vi.fn(async () => {});
    const { result } = renderHook(() =>
      useAutonomousPauseToggle({
        digest: makeDigest({ paused: false }),
        refresh,
      }),
    );
    await act(async () => {
      await result.current.handlePauseToggle();
    });
    expect(result.current.pauseFailed).toBe(true);
    expect(result.current.pauseMsg).toBeTruthy();

    server.use(
      http.post('/api/autonomous/pause', () =>
        HttpResponse.json({ ok: true }),
      ),
    );
    await act(async () => {
      await result.current.handlePauseToggle();
    });
    expect(result.current.pauseFailed).toBe(false);
    expect(result.current.pauseMsg).toBeTruthy();
  });

  it('uses the path derived from props at call time (rerender flips paused mid-life)', async () => {
    const seen: string[] = [];
    server.use(
      http.post('/api/autonomous/pause', ({ request }) => {
        seen.push(new URL(request.url).pathname);
        return HttpResponse.json({ ok: true });
      }),
      http.post('/api/autonomous/resume', ({ request }) => {
        seen.push(new URL(request.url).pathname);
        return HttpResponse.json({ ok: true });
      }),
    );
    const refresh = vi.fn(async () => {});
    const { rerender, result } = renderHook(
      ({ digest }: { digest: DigestResponse | null }) =>
        useAutonomousPauseToggle({ digest, refresh }),
      { initialProps: { digest: makeDigest({ paused: false }) } },
    );
    await act(async () => {
      await result.current.handlePauseToggle();
    });
    rerender({ digest: makeDigest({ paused: true }) });
    await act(async () => {
      await result.current.handlePauseToggle();
    });
    expect(seen).toEqual([
      '/api/autonomous/pause',
      '/api/autonomous/resume',
    ]);
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
  });
});
