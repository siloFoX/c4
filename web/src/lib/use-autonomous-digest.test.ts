import { describe, it, expect, vi, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook, waitFor } from '@testing-library/react';
import { server } from '../test/server';
import { useAutonomousDigest, type Escalation } from './use-autonomous-digest';
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

function makeEscalation(overrides: Partial<Escalation> = {}): Escalation {
  return {
    id: 1,
    todoId: null,
    reason: 'r',
    kind: 'k',
    suggestedAction: 's',
    status: 'pending',
    createdAt: 0,
    resolvedAt: null,
    resolvedAction: null,
    resolvedNote: null,
    ...overrides,
  };
}

describe('useAutonomousDigest', () => {
  it('starts idle: autonomousEnabled=null, digest=null, escalations=[], errors=null, loading flips to true', async () => {
    server.use(
      http.get('/api/autonomous/status', () =>
        HttpResponse.json({ enabled: false }),
      ),
    );
    const { result } = renderHook(() =>
      useAutonomousDigest({ showResolved: false }),
    );
    expect(result.current.autonomousEnabled).toBeNull();
    expect(result.current.digest).toBeNull();
    expect(result.current.escalations).toEqual([]);
    expect(result.current.digestError).toBeNull();
    expect(result.current.escalError).toBeNull();
    // The mount-time effect kicked off refresh() which flipped loading on.
    expect(result.current.loading).toBe(true);
    // Drain the in-flight fetch so we don't leak setStates past unmount.
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('blanks digest + escalations and skips follow-up fetches when status.enabled=false', async () => {
    let digestCalls = 0;
    let escalCalls = 0;
    server.use(
      http.get('/api/autonomous/status', () =>
        HttpResponse.json({ enabled: false }),
      ),
      http.get('/api/autonomous/digest', () => {
        digestCalls++;
        return HttpResponse.json(makeDigest());
      }),
      http.get('/api/autonomous/escalations', () => {
        escalCalls++;
        return HttpResponse.json({ count: 0, escalations: [] });
      }),
    );
    const { result } = renderHook(() =>
      useAutonomousDigest({ showResolved: false }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.autonomousEnabled).toBe(false);
    expect(result.current.digest).toBeNull();
    expect(result.current.escalations).toEqual([]);
    expect(digestCalls).toBe(0);
    expect(escalCalls).toBe(0);
  });

  it('populates digest + escalations when status.enabled=true', async () => {
    const digest = makeDigest({ paused: true, dispatched: 4, succeeded: 2 });
    const escalations = [makeEscalation({ id: 11 }), makeEscalation({ id: 12 })];
    server.use(
      http.get('/api/autonomous/status', () =>
        HttpResponse.json({ enabled: true }),
      ),
      http.get('/api/autonomous/digest', () => HttpResponse.json(digest)),
      http.get('/api/autonomous/escalations', () =>
        HttpResponse.json({ count: escalations.length, escalations }),
      ),
    );
    const { result } = renderHook(() =>
      useAutonomousDigest({ showResolved: false }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.autonomousEnabled).toBe(true);
    expect(result.current.digest).toEqual(digest);
    expect(result.current.escalations).toEqual(escalations);
    expect(result.current.digestError).toBeNull();
  });

  it('hits /api/autonomous/escalations with no querystring when showResolved=false', async () => {
    let qs = '';
    server.use(
      http.get('/api/autonomous/status', () =>
        HttpResponse.json({ enabled: true }),
      ),
      http.get('/api/autonomous/digest', () => HttpResponse.json(makeDigest())),
      http.get('/api/autonomous/escalations', ({ request }) => {
        qs = new URL(request.url).search;
        return HttpResponse.json({ count: 0, escalations: [] });
      }),
    );
    const { result } = renderHook(() =>
      useAutonomousDigest({ showResolved: false }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(qs).toBe('');
  });

  it('appends ?status=all to the escalations URL when showResolved=true', async () => {
    let qs = '';
    server.use(
      http.get('/api/autonomous/status', () =>
        HttpResponse.json({ enabled: true }),
      ),
      http.get('/api/autonomous/digest', () => HttpResponse.json(makeDigest())),
      http.get('/api/autonomous/escalations', ({ request }) => {
        qs = new URL(request.url).search;
        return HttpResponse.json({ count: 0, escalations: [] });
      }),
    );
    const { result } = renderHook(() =>
      useAutonomousDigest({ showResolved: true }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(qs).toContain('status=all');
  });

  it('re-fetches when showResolved flips false -> true (rerender effect)', async () => {
    const calls: string[] = [];
    server.use(
      http.get('/api/autonomous/status', () =>
        HttpResponse.json({ enabled: true }),
      ),
      http.get('/api/autonomous/digest', () => HttpResponse.json(makeDigest())),
      http.get('/api/autonomous/escalations', ({ request }) => {
        calls.push(new URL(request.url).search);
        return HttpResponse.json({ count: 0, escalations: [] });
      }),
    );
    const { rerender, result } = renderHook(
      ({ showResolved }: { showResolved: boolean }) =>
        useAutonomousDigest({ showResolved }),
      { initialProps: { showResolved: false } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe('');

    rerender({ showResolved: true });
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]).toContain('status=all');
  });

  it('surfaces digestError on status fetch failure (catch path)', async () => {
    server.use(
      http.get('/api/autonomous/status', () =>
        HttpResponse.json({ error: 'down' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() =>
      useAutonomousDigest({ showResolved: false }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.digestError).toBeTruthy();
    expect(result.current.digest).toBeNull();
    expect(result.current.escalations).toEqual([]);
  });

  it('keeps loading=true while the status fetch is in-flight (release-gate)', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get('/api/autonomous/status', async () => {
        await gate;
        return HttpResponse.json({ enabled: false });
      }),
    );
    const { result } = renderHook(() =>
      useAutonomousDigest({ showResolved: false }),
    );
    // Mount-time refresh has set loading=true and is awaiting status.
    expect(result.current.loading).toBe(true);
    release();
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('exposes setEscalations so consumers can optimistically mutate the list', async () => {
    server.use(
      http.get('/api/autonomous/status', () =>
        HttpResponse.json({ enabled: true }),
      ),
      http.get('/api/autonomous/digest', () => HttpResponse.json(makeDigest())),
      http.get('/api/autonomous/escalations', () =>
        HttpResponse.json({
          count: 2,
          escalations: [makeEscalation({ id: 1 }), makeEscalation({ id: 2 })],
        }),
      ),
    );
    const { result } = renderHook(() =>
      useAutonomousDigest({ showResolved: false }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.escalations).toHaveLength(2);
    act(() => {
      result.current.setEscalations((prev) => prev.filter((e) => e.id !== 1));
    });
    expect(result.current.escalations.map((e) => e.id)).toEqual([2]);
  });

  it('refresh() re-runs the triple-fetch on demand', async () => {
    let statusCalls = 0;
    server.use(
      http.get('/api/autonomous/status', () => {
        statusCalls++;
        return HttpResponse.json({ enabled: false });
      }),
    );
    const { result } = renderHook(() =>
      useAutonomousDigest({ showResolved: false }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(statusCalls).toBe(1);
    await act(async () => {
      await result.current.refresh();
    });
    expect(statusCalls).toBe(2);
  });

  it('schedules a 30s polling interval and clears it on unmount', async () => {
    server.use(
      http.get('/api/autonomous/status', () =>
        HttpResponse.json({ enabled: false }),
      ),
    );
    const setSpy = vi.spyOn(window, 'setInterval');
    const clearSpy = vi.spyOn(window, 'clearInterval');
    try {
      const { unmount, result } = renderHook(() =>
        useAutonomousDigest({ showResolved: false }),
      );
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(setSpy).toHaveBeenCalledWith(expect.any(Function), 30_000);
      unmount();
      expect(clearSpy).toHaveBeenCalled();
    } finally {
      setSpy.mockRestore();
      clearSpy.mockRestore();
    }
  });
});
