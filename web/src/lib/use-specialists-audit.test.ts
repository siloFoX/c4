import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook, waitFor } from '@testing-library/react';
import { server } from '../test/server';
import { useSpecialistsAudit } from './use-specialists-audit';

// useSpecialistsAudit polls /api/specialists/audit?limit=50 every 30s
// while `auditOpen` is true. The window selector ('all' | '1h' | '24h' |
// '7d') translates into the `since` URL param (omitted when 'all'). A
// cancelled-flag race guard protects against a fast open->close->open
// stamping a stale list. We cover: idle slot, the gate on auditOpen,
// the limit param, the window-to-since mapping (Date.now pinned), the
// setter, polling cadence + cleanup (setInterval / clearInterval spies),
// and the cancel guard.

const PINNED_NOW = Date.parse('2026-05-11T08:00:00.000Z');

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(PINNED_NOW);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useSpecialistsAudit', () => {
  it('starts idle: empty entries, not loading, window=all', () => {
    const { result } = renderHook(() =>
      useSpecialistsAudit({ auditOpen: false }),
    );
    expect(result.current.auditEntries).toEqual([]);
    expect(result.current.auditLoading).toBe(false);
    expect(result.current.auditWindow).toBe('all');
  });

  it('does NOT fetch while auditOpen is false', async () => {
    let calls = 0;
    server.use(
      http.get('/api/specialists/audit', () => {
        calls++;
        return HttpResponse.json({ count: 0, entries: [] });
      }),
    );
    renderHook(() => useSpecialistsAudit({ auditOpen: false }));
    // Yield so any (none-expected) effect can fire.
    await new Promise((r) => setTimeout(r, 50));
    expect(calls).toBe(0);
  });

  it('fetches /api/specialists/audit?limit=50 immediately when opened', async () => {
    let path = '';
    let qs = '';
    server.use(
      http.get('/api/specialists/audit', ({ request }) => {
        const url = new URL(request.url);
        path = url.pathname;
        qs = url.search;
        return HttpResponse.json({
          count: 1,
          entries: [{ ts: '2026-05-11T07:59:00.000Z', action: 'created' }],
        });
      }),
    );
    const { result } = renderHook(() =>
      useSpecialistsAudit({ auditOpen: true }),
    );
    await waitFor(() => {
      expect(result.current.auditEntries).toHaveLength(1);
    });
    expect(path).toBe('/api/specialists/audit');
    expect(qs).toContain('limit=50');
    expect(qs).not.toContain('since=');
    expect(result.current.auditEntries[0]?.action).toBe('created');
  });

  it('treats a missing entries array as no rows (no throw)', async () => {
    server.use(
      http.get('/api/specialists/audit', () =>
        HttpResponse.json({ count: 0 }),
      ),
    );
    const { result } = renderHook(() =>
      useSpecialistsAudit({ auditOpen: true }),
    );
    await waitFor(() => {
      expect(result.current.auditLoading).toBe(false);
    });
    expect(result.current.auditEntries).toEqual([]);
  });

  it('tolerates a 5xx without surfacing an error (cancelled-resilient catch)', async () => {
    server.use(
      http.get('/api/specialists/audit', () =>
        HttpResponse.json({ error: 'audit down' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() =>
      useSpecialistsAudit({ auditOpen: true }),
    );
    await waitFor(() => {
      expect(result.current.auditLoading).toBe(false);
    });
    // Entries stay empty; no thrown error.
    expect(result.current.auditEntries).toEqual([]);
  });

  it('maps window=1h to since = now - 1h', async () => {
    let since = '';
    server.use(
      http.get('/api/specialists/audit', ({ request }) => {
        since = new URL(request.url).searchParams.get('since') || '';
        return HttpResponse.json({ count: 0, entries: [] });
      }),
    );
    const { result } = renderHook(() =>
      useSpecialistsAudit({ auditOpen: true }),
    );
    act(() => {
      result.current.setAuditWindow('1h');
    });
    await waitFor(() => {
      expect(since).toBeTruthy();
    });
    // now = 2026-05-11T08:00:00Z, since should be 1h before.
    expect(since).toBe('2026-05-11T07:00:00.000Z');
  });

  it('maps window=24h to since = now - 24h', async () => {
    let since = '';
    server.use(
      http.get('/api/specialists/audit', ({ request }) => {
        since = new URL(request.url).searchParams.get('since') || '';
        return HttpResponse.json({ count: 0, entries: [] });
      }),
    );
    const { result } = renderHook(() =>
      useSpecialistsAudit({ auditOpen: true }),
    );
    act(() => {
      result.current.setAuditWindow('24h');
    });
    await waitFor(() => {
      expect(since).toBeTruthy();
    });
    expect(since).toBe('2026-05-10T08:00:00.000Z');
  });

  it('maps window=7d to since = now - 7 days', async () => {
    let since = '';
    server.use(
      http.get('/api/specialists/audit', ({ request }) => {
        since = new URL(request.url).searchParams.get('since') || '';
        return HttpResponse.json({ count: 0, entries: [] });
      }),
    );
    const { result } = renderHook(() =>
      useSpecialistsAudit({ auditOpen: true }),
    );
    act(() => {
      result.current.setAuditWindow('7d');
    });
    await waitFor(() => {
      expect(since).toBeTruthy();
    });
    expect(since).toBe('2026-05-04T08:00:00.000Z');
  });

  it('drops the since parameter when window flips back to all', async () => {
    const sinceHits: (string | null)[] = [];
    server.use(
      http.get('/api/specialists/audit', ({ request }) => {
        sinceHits.push(new URL(request.url).searchParams.get('since'));
        return HttpResponse.json({ count: 0, entries: [] });
      }),
    );
    const { result } = renderHook(() =>
      useSpecialistsAudit({ auditOpen: true }),
    );
    await waitFor(() => {
      expect(sinceHits.length).toBeGreaterThanOrEqual(1);
    });
    act(() => {
      result.current.setAuditWindow('1h');
    });
    await waitFor(() => {
      expect(sinceHits.some((s) => s !== null)).toBe(true);
    });
    act(() => {
      result.current.setAuditWindow('all');
    });
    await waitFor(() => {
      expect(sinceHits[sinceHits.length - 1]).toBeNull();
    });
  });

  it('flips auditLoading true during the in-flight fetch and false on settle', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.get('/api/specialists/audit', async () => {
        await gate;
        return HttpResponse.json({ count: 0, entries: [] });
      }),
    );
    const { result } = renderHook(() =>
      useSpecialistsAudit({ auditOpen: true }),
    );
    await waitFor(() => {
      expect(result.current.auditLoading).toBe(true);
    });
    release();
    await waitFor(() => {
      expect(result.current.auditLoading).toBe(false);
    });
  });

  it('schedules a 30s poll via window.setInterval', async () => {
    server.use(
      http.get('/api/specialists/audit', () =>
        HttpResponse.json({ count: 0, entries: [] }),
      ),
    );
    const setIntervalSpy = vi.spyOn(window, 'setInterval');
    try {
      renderHook(() => useSpecialistsAudit({ auditOpen: true }));
      await waitFor(() => {
        const match = setIntervalSpy.mock.calls.find(
          (c) => c[1] === 30_000,
        );
        expect(match).toBeDefined();
      });
    } finally {
      setIntervalSpy.mockRestore();
    }
  });

  it('clears the polling interval when auditOpen flips to false', async () => {
    server.use(
      http.get('/api/specialists/audit', () =>
        HttpResponse.json({ count: 0, entries: [] }),
      ),
    );
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval');
    try {
      const { rerender } = renderHook(
        ({ open }: { open: boolean }) =>
          useSpecialistsAudit({ auditOpen: open }),
        { initialProps: { open: true } },
      );
      await new Promise((r) => setTimeout(r, 30));
      const beforeFlip = clearIntervalSpy.mock.calls.length;
      rerender({ open: false });
      await waitFor(() => {
        expect(clearIntervalSpy.mock.calls.length).toBeGreaterThan(beforeFlip);
      });
    } finally {
      clearIntervalSpy.mockRestore();
    }
  });

  it('clears the polling interval on unmount', async () => {
    server.use(
      http.get('/api/specialists/audit', () =>
        HttpResponse.json({ count: 0, entries: [] }),
      ),
    );
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval');
    try {
      const { unmount } = renderHook(() =>
        useSpecialistsAudit({ auditOpen: true }),
      );
      await new Promise((r) => setTimeout(r, 30));
      const beforeUnmount = clearIntervalSpy.mock.calls.length;
      unmount();
      expect(clearIntervalSpy.mock.calls.length).toBeGreaterThan(beforeUnmount);
    } finally {
      clearIntervalSpy.mockRestore();
    }
  });

  it('cancel guard: a slow in-flight response after the panel closes does not stamp entries', async () => {
    let releaseFirst: () => void = () => {};
    const firstGate = new Promise<void>((r) => {
      releaseFirst = r;
    });
    server.use(
      http.get('/api/specialists/audit', async () => {
        await firstGate;
        return HttpResponse.json({
          count: 1,
          entries: [{ ts: '2026-05-11T07:00:00.000Z', action: 'stale' }],
        });
      }),
    );
    const { result, rerender } = renderHook(
      ({ open }: { open: boolean }) =>
        useSpecialistsAudit({ auditOpen: open }),
      { initialProps: { open: true } },
    );
    // Close before the in-flight response lands.
    rerender({ open: false });
    // Now release the now-cancelled in-flight request.
    releaseFirst();
    await new Promise((r) => setTimeout(r, 30));
    // The cancelled-flag race guard means setAuditEntries never runs.
    expect(result.current.auditEntries).toEqual([]);
  });
});
