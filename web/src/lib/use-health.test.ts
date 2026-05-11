import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook, waitFor } from '@testing-library/react';
import { server } from '../test/server';
import { useHealth } from './use-health';

// useHealth wraps the GET /api/health request + a 10s self-poll. We exercise
// the request path with real timers + MSW (fake timers + RTL waitFor don't
// compose cleanly under vitest). The polling cadence + cleanup are covered
// separately via spies on the underlying setInterval / clearInterval calls.

describe('useHealth', () => {
  it('starts loading then surfaces the daemon payload', async () => {
    server.use(
      http.get('/api/health', () =>
        HttpResponse.json({ ok: true, version: '9.9.9', pid: 11 }),
      ),
    );
    const { result } = renderHook(() => useHealth());
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.data?.version).toBe('9.9.9');
    expect(result.current.error).toBeNull();
  });

  it('surfaces the error message when the request rejects', async () => {
    server.use(
      http.get('/api/health', () =>
        HttpResponse.json({ error: 'down' }, { status: 503 }),
      ),
    );
    const { result } = renderHook(() => useHealth());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.error).toMatch(/HTTP 503/);
    expect(result.current.data).toBeNull();
  });

  it('refresh() re-issues the request and updates state', async () => {
    let count = 0;
    server.use(
      http.get('/api/health', () =>
        HttpResponse.json({ ok: true, version: `v${++count}` }),
      ),
    );
    const { result } = renderHook(() => useHealth());
    await waitFor(() => {
      expect(result.current.data?.version).toBe('v1');
    });
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.data?.version).toBe('v2');
  });

  it('schedules polling at the documented 10s cadence', () => {
    const setIntervalSpy = vi.spyOn(global, 'setInterval');
    try {
      renderHook(() => useHealth());
      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 10_000);
    } finally {
      setIntervalSpy.mockRestore();
    }
  });

  it('clears the polling interval on unmount', () => {
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
    try {
      const { unmount } = renderHook(() => useHealth());
      unmount();
      expect(clearIntervalSpy).toHaveBeenCalled();
    } finally {
      clearIntervalSpy.mockRestore();
    }
  });
});
