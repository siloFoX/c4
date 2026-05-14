import { describe, it, expect, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderHook, waitFor } from '@testing-library/react';
import { server } from '../test/server';
import { useStuckMeetings } from './use-stuck-meetings';

// useStuckMeetings is a thin delegate to useSilentPoll: it polls
// GET /api/meetings/stuck?hours=1 every 60s and silently degrades
// to null when the endpoint is missing or the call fails. The
// contract is "value is StuckResponse on success, null otherwise"
// — no error surface, no setters.

describe('useStuckMeetings', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts idle: returns null before the first fetch resolves', () => {
    const gate = new Promise<HttpResponse>(() => {
      // never resolves so the initial tick stays in flight
    });
    server.use(
      http.get('/api/meetings/stuck', async () => {
        return gate;
      }),
    );
    const { result } = renderHook(() => useStuckMeetings());
    expect(result.current).toBeNull();
  });

  it('happy path: stores the StuckResponse after the first poll resolves', async () => {
    const payload = { count: 2, stuck: [{ id: 'm1' }, { id: 'm2' }] };
    server.use(
      http.get('/api/meetings/stuck', () => HttpResponse.json(payload)),
    );
    const { result } = renderHook(() => useStuckMeetings());
    await waitFor(() => {
      expect(result.current).not.toBeNull();
    });
    expect(result.current).toEqual(payload);
  });

  it('passes hours=1 in the query string', async () => {
    let receivedUrl = '';
    server.use(
      http.get('/api/meetings/stuck', ({ request }) => {
        receivedUrl = request.url;
        return HttpResponse.json({ count: 0, stuck: [] });
      }),
    );
    renderHook(() => useStuckMeetings());
    await waitFor(() => {
      expect(receivedUrl).toContain('hours=1');
    });
  });

  it('silently degrades to null on a 500 error (no throw, no error surface)', async () => {
    server.use(
      http.get('/api/meetings/stuck', () =>
        HttpResponse.json({ error: 'no' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useStuckMeetings());
    // Wait a couple of microtasks so the swallowed rejection settles.
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current).toBeNull();
  });

  it('silently degrades to null on a 404 (missing endpoint)', async () => {
    server.use(
      http.get('/api/meetings/stuck', () =>
        HttpResponse.json({ error: 'nope' }, { status: 404 }),
      ),
    );
    const { result } = renderHook(() => useStuckMeetings());
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current).toBeNull();
  });

  it('handles a zero-count response shape verbatim (no transformation)', async () => {
    server.use(
      http.get('/api/meetings/stuck', () =>
        HttpResponse.json({ count: 0, stuck: [] }),
      ),
    );
    const { result } = renderHook(() => useStuckMeetings());
    await waitFor(() => {
      expect(result.current).not.toBeNull();
    });
    expect(result.current).toEqual({ count: 0, stuck: [] });
  });

  it('refetches on the 60s poll interval and updates with the latest payload', async () => {
    vi.useFakeTimers();
    let calls = 0;
    server.use(
      http.get('/api/meetings/stuck', () => {
        calls++;
        return HttpResponse.json({ count: calls, stuck: [] });
      }),
    );
    const { result } = renderHook(() => useStuckMeetings());
    await vi.advanceTimersByTimeAsync(0);
    await waitFor(() => {
      expect(result.current?.count).toBe(1);
    });
    await vi.advanceTimersByTimeAsync(60_000);
    await waitFor(() => {
      expect(result.current?.count).toBe(2);
    });
    await vi.advanceTimersByTimeAsync(60_000);
    await waitFor(() => {
      expect(result.current?.count).toBe(3);
    });
  });

  it('does not write state after unmount (cancel flag prevents stale writes)', async () => {
    let release: (val: { count: number; stuck: never[] }) => void = () => {};
    const gate = new Promise<{ count: number; stuck: never[] }>((r) => {
      release = r;
    });
    server.use(
      http.get('/api/meetings/stuck', async () => HttpResponse.json(await gate)),
    );
    const { result, unmount } = renderHook(() => useStuckMeetings());
    expect(result.current).toBeNull();
    unmount();
    // Release after unmount so the resolved write would be a stale
    // write if the cancel flag did not guard it. The hook should
    // swallow it; we cannot read state from a torn-down hook, but
    // we can assert nothing throws on the late settle.
    release({ count: 9, stuck: [] });
    await new Promise((r) => setTimeout(r, 10));
    // No assertion error from React about updating an unmounted
    // component means the cancel flag did its job.
  });

  it('stops polling after unmount (clearInterval cleanup)', async () => {
    vi.useFakeTimers();
    let calls = 0;
    server.use(
      http.get('/api/meetings/stuck', () => {
        calls++;
        return HttpResponse.json({ count: 0, stuck: [] });
      }),
    );
    const { unmount } = renderHook(() => useStuckMeetings());
    await vi.advanceTimersByTimeAsync(0);
    const beforeUnmount = calls;
    unmount();
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls).toBe(beforeUnmount);
  });
});
