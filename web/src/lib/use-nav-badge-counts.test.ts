import { describe, it, expect, vi, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderHook, waitFor } from '@testing-library/react';
import { server } from '../test/server';
import { useNavBadgeCounts } from './use-nav-badge-counts';

// useNavBadgeCounts polls three signals every 60s for the top-tab badges:
//   - /api/meetings/stuck?hours=1   -> { count } -> stuckCount
//   - /api/specialists/underperformers -> { flagged } -> underperformerCount
//   - /api/autonomous/escalations -> { count } -> escalationCount
//     gated behind /api/autonomous/status { enabled }: only fires when enabled.
// Contract:
//   - authed=false short-circuits: no fetch, all counts stay 0
//   - on mount with authed=true fires the initial fetch, sets state from responses
//   - escalations endpoint is NOT called until /autonomous/status returns enabled=true
//   - autonomousEnabled=false caches the gate so subsequent polls skip escalations
//   - failures on any endpoint are tolerated: state stays untouched
//   - cancel guard: unmount before fetch resolves -> no state write
//   - cleanup clears the 60s interval

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('useNavBadgeCounts', () => {
  it('authed=false short-circuits: no fetches issued, all counts stay 0', async () => {
    let calls = 0;
    server.use(
      http.get('/api/meetings/stuck', () => {
        calls++;
        return HttpResponse.json({ count: 99 });
      }),
      http.get('/api/specialists/underperformers', () => {
        calls++;
        return HttpResponse.json({ flagged: 99 });
      }),
      http.get('/api/autonomous/status', () => {
        calls++;
        return HttpResponse.json({ enabled: true });
      }),
      http.get('/api/autonomous/escalations', () => {
        calls++;
        return HttpResponse.json({ count: 99, escalations: [] });
      }),
    );
    const { result } = renderHook(() => useNavBadgeCounts({ authed: false }));
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).toBe(0);
    expect(result.current.stuckCount).toBe(0);
    expect(result.current.underperformerCount).toBe(0);
    expect(result.current.escalationCount).toBe(0);
  });

  it('happy path: stuck + underperformers populate from their responses', async () => {
    server.use(
      http.get('/api/meetings/stuck', () =>
        HttpResponse.json({ count: 3 }),
      ),
      http.get('/api/specialists/underperformers', () =>
        HttpResponse.json({ flagged: 7 }),
      ),
      http.get('/api/autonomous/status', () =>
        HttpResponse.json({ enabled: false }),
      ),
    );
    const { result } = renderHook(() => useNavBadgeCounts({ authed: true }));
    await waitFor(() => {
      expect(result.current.stuckCount).toBe(3);
      expect(result.current.underperformerCount).toBe(7);
    });
    expect(result.current.escalationCount).toBe(0);
  });

  it('escalations endpoint NOT called while /autonomous/status is enabled=false', async () => {
    let escalationCalls = 0;
    server.use(
      http.get('/api/meetings/stuck', () =>
        HttpResponse.json({ count: 0 }),
      ),
      http.get('/api/specialists/underperformers', () =>
        HttpResponse.json({ flagged: 0 }),
      ),
      http.get('/api/autonomous/status', () =>
        HttpResponse.json({ enabled: false }),
      ),
      http.get('/api/autonomous/escalations', () => {
        escalationCalls++;
        return HttpResponse.json({ count: 0, escalations: [] });
      }),
    );
    renderHook(() => useNavBadgeCounts({ authed: true }));
    await new Promise((r) => setTimeout(r, 30));
    expect(escalationCalls).toBe(0);
  });

  it('autonomous enabled=true: escalations endpoint fires and populates count', async () => {
    server.use(
      http.get('/api/meetings/stuck', () =>
        HttpResponse.json({ count: 0 }),
      ),
      http.get('/api/specialists/underperformers', () =>
        HttpResponse.json({ flagged: 0 }),
      ),
      http.get('/api/autonomous/status', () =>
        HttpResponse.json({ enabled: true }),
      ),
      http.get('/api/autonomous/escalations', () =>
        HttpResponse.json({ count: 4, escalations: [] }),
      ),
    );
    const { result } = renderHook(() => useNavBadgeCounts({ authed: true }));
    await waitFor(() => {
      expect(result.current.escalationCount).toBe(4);
    });
  });

  it('falsy/missing fields default to 0 (defensive: { } / null)', async () => {
    server.use(
      http.get('/api/meetings/stuck', () =>
        HttpResponse.json({}),
      ),
      http.get('/api/specialists/underperformers', () =>
        HttpResponse.json({}),
      ),
      http.get('/api/autonomous/status', () =>
        HttpResponse.json({ enabled: true }),
      ),
      http.get('/api/autonomous/escalations', () =>
        HttpResponse.json({}),
      ),
    );
    const { result } = renderHook(() => useNavBadgeCounts({ authed: true }));
    await new Promise((r) => setTimeout(r, 30));
    expect(result.current.stuckCount).toBe(0);
    expect(result.current.underperformerCount).toBe(0);
    expect(result.current.escalationCount).toBe(0);
  });

  it('endpoint failures are tolerated: each catch leaves prior state untouched', async () => {
    server.use(
      http.get('/api/meetings/stuck', () =>
        HttpResponse.json({ error: 'down' }, { status: 500 }),
      ),
      http.get('/api/specialists/underperformers', () =>
        HttpResponse.json({ flagged: 9 }),
      ),
      http.get('/api/autonomous/status', () =>
        HttpResponse.json({ error: 'down' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useNavBadgeCounts({ authed: true }));
    await waitFor(() => {
      expect(result.current.underperformerCount).toBe(9);
    });
    expect(result.current.stuckCount).toBe(0);
    expect(result.current.escalationCount).toBe(0);
  });

  it('polls every 60s: advancing the clock fires a second round of fetches', async () => {
    let stuck = 0;
    let under = 0;
    server.use(
      http.get('/api/meetings/stuck', () => {
        stuck++;
        return HttpResponse.json({ count: stuck });
      }),
      http.get('/api/specialists/underperformers', () => {
        under++;
        return HttpResponse.json({ flagged: under });
      }),
      http.get('/api/autonomous/status', () =>
        HttpResponse.json({ enabled: false }),
      ),
    );
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => useNavBadgeCounts({ authed: true }));
    await vi.waitFor(() => {
      expect(result.current.stuckCount).toBe(1);
      expect(result.current.underperformerCount).toBe(1);
    });
    vi.advanceTimersByTime(60000);
    await vi.waitFor(() => {
      expect(stuck).toBe(2);
      expect(under).toBe(2);
    });
    expect(result.current.stuckCount).toBe(2);
    expect(result.current.underperformerCount).toBe(2);
  });

  it('unmount before fetch resolves does not write state (cancelled guard)', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.get('/api/meetings/stuck', async () => {
        await gate;
        return HttpResponse.json({ count: 42 });
      }),
      http.get('/api/specialists/underperformers', async () => {
        await gate;
        return HttpResponse.json({ flagged: 42 });
      }),
      http.get('/api/autonomous/status', async () => {
        await gate;
        return HttpResponse.json({ enabled: false });
      }),
    );
    const { result, unmount } = renderHook(() =>
      useNavBadgeCounts({ authed: true }),
    );
    unmount();
    release();
    await new Promise((r) => setTimeout(r, 30));
    expect(result.current.stuckCount).toBe(0);
    expect(result.current.underperformerCount).toBe(0);
    expect(result.current.escalationCount).toBe(0);
  });

  it('clears the interval on unmount (no further fetches after teardown)', async () => {
    let stuck = 0;
    server.use(
      http.get('/api/meetings/stuck', () => {
        stuck++;
        return HttpResponse.json({ count: 1 });
      }),
      http.get('/api/specialists/underperformers', () =>
        HttpResponse.json({ flagged: 0 }),
      ),
      http.get('/api/autonomous/status', () =>
        HttpResponse.json({ enabled: false }),
      ),
    );
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { unmount } = renderHook(() => useNavBadgeCounts({ authed: true }));
    await vi.waitFor(() => expect(stuck).toBe(1));
    unmount();
    vi.advanceTimersByTime(60000);
    await new Promise((r) => setTimeout(r, 30));
    expect(stuck).toBe(1);
  });

  it('authed flip from false -> true triggers the first fetch round', async () => {
    let stuck = 0;
    server.use(
      http.get('/api/meetings/stuck', () => {
        stuck++;
        return HttpResponse.json({ count: 5 });
      }),
      http.get('/api/specialists/underperformers', () =>
        HttpResponse.json({ flagged: 0 }),
      ),
      http.get('/api/autonomous/status', () =>
        HttpResponse.json({ enabled: false }),
      ),
    );
    const { result, rerender } = renderHook(
      ({ a }: { a: boolean }) => useNavBadgeCounts({ authed: a }),
      { initialProps: { a: false } },
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(stuck).toBe(0);
    rerender({ a: true });
    await waitFor(() => {
      expect(result.current.stuckCount).toBe(5);
    });
  });
});
