import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderHook, waitFor } from '@testing-library/react';
import { server } from '../test/server';
import { useSpecialistsSummary } from './use-specialists-summary';

// useSpecialistsSummary is a thin wrapper over useSilentPoll<OrganismSummary>
// against /api/specialists/summary at a 30s cadence. We cover the initial
// null, the happy-path payload landing through the hook, silent swallow on
// 500, the documented polling cadence, and the interval cleanup on unmount.

describe('useSpecialistsSummary', () => {
  it('returns null on initial mount before the first response lands', () => {
    server.use(
      http.get('/api/specialists/summary', () =>
        HttpResponse.json({
          registry: { count: 0, vetoCount: 0 },
          meetings: { total: 0, recent24h: 0 },
          scores: { specialistsWithSamples: 0, underperformerCount: 0 },
        }),
      ),
    );
    const { result } = renderHook(() => useSpecialistsSummary());
    expect(result.current).toBeNull();
  });

  it('surfaces the parsed OrganismSummary payload from the polled endpoint', async () => {
    let path = '';
    server.use(
      http.get('/api/specialists/summary', ({ request }) => {
        path = new URL(request.url).pathname;
        return HttpResponse.json({
          registry: { count: 12, vetoCount: 3 },
          meetings: { total: 47, recent24h: 5 },
          scores: { specialistsWithSamples: 8, underperformerCount: 2 },
          persist: {
            enabled: true,
            dbSizeBytes: 1024,
            rowCount: 99,
            auditLog: { bytes: 256, entries: 4 },
            lastKnownGood: { exists: true, ageDays: 1 },
          },
        });
      }),
    );
    const { result } = renderHook(() => useSpecialistsSummary());
    await waitFor(() => {
      expect(result.current).not.toBeNull();
    });
    expect(path).toBe('/api/specialists/summary');
    expect(result.current?.registry).toEqual({ count: 12, vetoCount: 3 });
    expect(result.current?.meetings.total).toBe(47);
    expect(result.current?.meetings.recent24h).toBe(5);
    expect(result.current?.scores.underperformerCount).toBe(2);
    expect(result.current?.persist?.enabled).toBe(true);
    expect(result.current?.persist?.auditLog?.entries).toBe(4);
    expect(result.current?.persist?.lastKnownGood?.exists).toBe(true);
  });

  it('silently degrades to null when the endpoint returns 500 (older daemon / blip)', async () => {
    server.use(
      http.get('/api/specialists/summary', () =>
        HttpResponse.json({ error: 'down' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useSpecialistsSummary());
    // No error toast, no throw — just stay null past the first tick.
    await new Promise((r) => setTimeout(r, 200));
    expect(result.current).toBeNull();
  });

  it('schedules polling at the documented 30s cadence via setInterval', () => {
    const setIntervalSpy = vi.spyOn(window, 'setInterval');
    try {
      renderHook(() => useSpecialistsSummary());
      const intervalCall = setIntervalSpy.mock.calls.find(
        (c) => c[1] === 30_000,
      );
      expect(intervalCall).toBeDefined();
    } finally {
      setIntervalSpy.mockRestore();
    }
  });

  it('clears the polling interval on unmount (no stale ticks)', () => {
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval');
    try {
      const { unmount } = renderHook(() => useSpecialistsSummary());
      unmount();
      expect(clearIntervalSpy).toHaveBeenCalled();
    } finally {
      clearIntervalSpy.mockRestore();
    }
  });
});
