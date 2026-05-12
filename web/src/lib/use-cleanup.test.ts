import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook, waitFor } from '@testing-library/react';
import { server } from '../test/server';
import { useCleanup } from './use-cleanup';

// useCleanup owns the preview (POST /api/cleanup dryRun=true) +
// the execute (POST /api/cleanup dryRun=false) flows and the
// confirmOpen modal slot. preview runs once on mount; execute
// surfaces toasts through the parent showToast callback so the
// toast layer stays a single place.

describe('useCleanup', () => {
  it('starts loading on mount and reaches idle state after preview resolves', async () => {
    server.use(
      http.post('/api/cleanup', () =>
        HttpResponse.json({
          dryRun: true,
          branches: [],
          worktrees: [],
          directories: [],
        }),
      ),
    );
    const showToast = vi.fn();
    const { result } = renderHook(() => useCleanup({ showToast }));
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.busy).toBe(false);
    expect(result.current.confirmOpen).toBe(false);
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.data).not.toBeNull();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('preview POSTs /api/cleanup with { dryRun: true } and stores the payload', async () => {
    let path = '';
    let body: unknown = null;
    server.use(
      http.post('/api/cleanup', async ({ request }) => {
        path = new URL(request.url).pathname;
        body = await request.json();
        return HttpResponse.json({
          dryRun: true,
          branches: ['c4/old'],
          worktrees: [],
          directories: [],
        });
      }),
    );
    const { result } = renderHook(() => useCleanup({ showToast: vi.fn() }));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(path).toBe('/api/cleanup');
    expect(body).toEqual({ dryRun: true });
    expect(result.current.data?.branches).toEqual(['c4/old']);
  });

  it('preview surfaces error and clears data when payload carries an error field', async () => {
    server.use(
      http.post('/api/cleanup', () =>
        HttpResponse.json({ error: 'locked' }),
      ),
    );
    const { result } = renderHook(() => useCleanup({ showToast: vi.fn() }));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.error).toBe('locked');
    expect(result.current.data).toBeNull();
  });

  it('preview surfaces fetch error from non-ok response', async () => {
    server.use(
      http.post('/api/cleanup', () =>
        HttpResponse.json({ error: 'boom' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useCleanup({ showToast: vi.fn() }));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.error).toMatch(/HTTP 500/);
    expect(result.current.data).toBeNull();
  });

  it('commit() flips confirmOpen to true', async () => {
    server.use(
      http.post('/api/cleanup', () =>
        HttpResponse.json({ dryRun: true, branches: [], worktrees: [], directories: [] }),
      ),
    );
    const { result } = renderHook(() => useCleanup({ showToast: vi.fn() }));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    act(() => result.current.commit());
    expect(result.current.confirmOpen).toBe(true);
  });

  it('setConfirmOpen toggles the modal slot directly', async () => {
    server.use(
      http.post('/api/cleanup', () =>
        HttpResponse.json({ dryRun: true, branches: [], worktrees: [], directories: [] }),
      ),
    );
    const { result } = renderHook(() => useCleanup({ showToast: vi.fn() }));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    act(() => result.current.setConfirmOpen(true));
    expect(result.current.confirmOpen).toBe(true);
    act(() => result.current.setConfirmOpen(false));
    expect(result.current.confirmOpen).toBe(false);
  });

  it('executeCleanup POSTs { dryRun: false }, fires success toast with removed count, closes modal', async () => {
    let lastBody: unknown = null;
    let callCount = 0;
    server.use(
      http.post('/api/cleanup', async ({ request }) => {
        callCount++;
        lastBody = await request.json();
        if (callCount === 1) {
          return HttpResponse.json({
            dryRun: true,
            branches: ['a'],
            worktrees: [],
            directories: [],
          });
        }
        return HttpResponse.json({
          dryRun: false,
          branches: ['a', 'b'],
          worktrees: ['w1'],
          directories: ['d1', 'd2'],
        });
      }),
    );
    const showToast = vi.fn();
    const { result } = renderHook(() => useCleanup({ showToast }));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    act(() => result.current.setConfirmOpen(true));
    await act(async () => {
      await result.current.executeCleanup();
    });
    expect(lastBody).toEqual({ dryRun: false });
    expect(result.current.confirmOpen).toBe(false);
    expect(result.current.busy).toBe(false);
    expect(showToast).toHaveBeenCalledTimes(1);
    const [msg, type] = showToast.mock.calls[0]!;
    expect(type).toBe('success');
    expect(msg).toContain('5');
    expect(result.current.data?.branches).toEqual(['a', 'b']);
  });

  it('executeCleanup with payload error fires error toast and sets error state', async () => {
    let callCount = 0;
    server.use(
      http.post('/api/cleanup', async () => {
        callCount++;
        if (callCount === 1) {
          return HttpResponse.json({
            dryRun: true,
            branches: [],
            worktrees: [],
            directories: [],
          });
        }
        return HttpResponse.json({ error: 'locked-by-other' });
      }),
    );
    const showToast = vi.fn();
    const { result } = renderHook(() => useCleanup({ showToast }));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    await act(async () => {
      await result.current.executeCleanup();
    });
    expect(result.current.error).toBe('locked-by-other');
    expect(showToast).toHaveBeenCalledTimes(1);
    const [msg, type] = showToast.mock.calls[0]!;
    expect(type).toBe('error');
    expect(msg).toContain('locked-by-other');
    expect(result.current.busy).toBe(false);
  });

  it('executeCleanup network failure surfaces error toast via thrown message', async () => {
    let callCount = 0;
    server.use(
      http.post('/api/cleanup', async () => {
        callCount++;
        if (callCount === 1) {
          return HttpResponse.json({
            dryRun: true,
            branches: [],
            worktrees: [],
            directories: [],
          });
        }
        return HttpResponse.json({ error: 'kaboom' }, { status: 500 });
      }),
    );
    const showToast = vi.fn();
    const { result } = renderHook(() => useCleanup({ showToast }));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    await act(async () => {
      await result.current.executeCleanup();
    });
    expect(result.current.error).toMatch(/HTTP 500/);
    expect(showToast).toHaveBeenCalledTimes(1);
    const [msg, type] = showToast.mock.calls[0]!;
    expect(type).toBe('error');
    expect(msg).toContain('HTTP 500');
    expect(result.current.busy).toBe(false);
  });

  it('flips busy=true during executeCleanup and back to false on resolve (busy gate)', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let callCount = 0;
    server.use(
      http.post('/api/cleanup', async () => {
        callCount++;
        if (callCount === 1) {
          return HttpResponse.json({
            dryRun: true,
            branches: [],
            worktrees: [],
            directories: [],
          });
        }
        await gate;
        return HttpResponse.json({
          dryRun: false,
          branches: [],
          worktrees: [],
          directories: [],
        });
      }),
    );
    const { result } = renderHook(() => useCleanup({ showToast: vi.fn() }));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    act(() => result.current.setConfirmOpen(true));
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.executeCleanup();
      await Promise.resolve();
    });
    expect(result.current.busy).toBe(true);
    expect(result.current.confirmOpen).toBe(false);
    release();
    await act(async () => {
      await inflight;
    });
    expect(result.current.busy).toBe(false);
  });

  it('preview() can be called explicitly to re-fetch the dryRun preview', async () => {
    let calls = 0;
    server.use(
      http.post('/api/cleanup', () => {
        calls++;
        return HttpResponse.json({
          dryRun: true,
          branches: [`r${calls}`],
          worktrees: [],
          directories: [],
        });
      }),
    );
    const { result } = renderHook(() => useCleanup({ showToast: vi.fn() }));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.data?.branches).toEqual(['r1']);
    await act(async () => {
      await result.current.preview();
    });
    expect(calls).toBe(2);
    expect(result.current.data?.branches).toEqual(['r2']);
  });
});
