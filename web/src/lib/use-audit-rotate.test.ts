import { describe, it, expect, vi, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook } from '@testing-library/react';
import { server } from '../test/server';
import { useAuditRotate } from './use-audit-rotate';

// useAuditRotate POSTs /api/specialists/audit-rotate { maxBytes: 0 }
// behind a window.confirm. Banner state is provided by
// useAutoClearMessage so success auto-clears (4s default) while
// failure persists. We cover the idle slot, the confirm-cancel
// short-circuit (no fetch, no banner), the request body + URL
// path, the rotated/skipped/failure banner branches, the busy
// slot via release-gate, the no-internal-guard parallel call,
// and the reset() that clears stale failure state at the start
// of a fresh run.

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useAuditRotate', () => {
  it('starts idle: not busy, no msg, not failed', () => {
    const { result } = renderHook(() => useAuditRotate());
    expect(result.current.rotateBusy).toBe(false);
    expect(result.current.rotateMsg).toBeNull();
    expect(result.current.rotateFailed).toBe(false);
  });

  it('exposes handleAuditRotate as a function', () => {
    const { result } = renderHook(() => useAuditRotate());
    expect(typeof result.current.handleAuditRotate).toBe('function');
  });

  it('aborts before any fetch when window.confirm is denied (validation slot)', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    let calls = 0;
    server.use(
      http.post('/api/specialists/audit-rotate', () => {
        calls++;
        return HttpResponse.json({ ok: true, rotated: true });
      }),
    );
    const { result } = renderHook(() => useAuditRotate());
    await act(async () => {
      await result.current.handleAuditRotate();
    });
    expect(calls).toBe(0);
    expect(result.current.rotateBusy).toBe(false);
    expect(result.current.rotateMsg).toBeNull();
    expect(result.current.rotateFailed).toBe(false);
  });

  it('POSTs { maxBytes: 0 } to /api/specialists/audit-rotate (URL + body shape)', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let path = '';
    let body: unknown = null;
    server.use(
      http.post('/api/specialists/audit-rotate', async ({ request }) => {
        path = new URL(request.url).pathname;
        body = await request.json();
        return HttpResponse.json({
          ok: true,
          rotated: true,
          archive: '/tmp/audit-1.jsonl',
        });
      }),
    );
    const { result } = renderHook(() => useAuditRotate());
    await act(async () => {
      await result.current.handleAuditRotate();
    });
    expect(path).toBe('/api/specialists/audit-rotate');
    expect(body).toEqual({ maxBytes: 0 });
  });

  it('rotated=true with an archive surfaces an archive-tagged success banner', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    server.use(
      http.post('/api/specialists/audit-rotate', () =>
        HttpResponse.json({
          ok: true,
          rotated: true,
          archive: '/tmp/audit-2026.jsonl',
        }),
      ),
    );
    const { result } = renderHook(() => useAuditRotate());
    await act(async () => {
      await result.current.handleAuditRotate();
    });
    expect(result.current.rotateFailed).toBe(false);
    expect(result.current.rotateMsg).toBeTruthy();
    expect(result.current.rotateMsg).toContain('/tmp/audit-2026.jsonl');
  });

  it('rotated=true with a null archive falls back to the i18n "archive" placeholder', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    server.use(
      http.post('/api/specialists/audit-rotate', () =>
        HttpResponse.json({ ok: true, rotated: true, archive: null }),
      ),
    );
    const { result } = renderHook(() => useAuditRotate());
    await act(async () => {
      await result.current.handleAuditRotate();
    });
    expect(result.current.rotateFailed).toBe(false);
    expect(result.current.rotateMsg).toBeTruthy();
    expect(result.current.rotateMsg).toContain('archive');
  });

  it('rotated=false surfaces the skipped banner (no archive interpolation, not a failure)', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    server.use(
      http.post('/api/specialists/audit-rotate', () =>
        HttpResponse.json({ ok: true, rotated: false }),
      ),
    );
    const { result } = renderHook(() => useAuditRotate());
    await act(async () => {
      await result.current.handleAuditRotate();
    });
    expect(result.current.rotateFailed).toBe(false);
    expect(result.current.rotateMsg).toBeTruthy();
    expect(result.current.rotateMsg?.toLowerCase()).toContain('skip');
  });

  it('5xx response sets failed=true with the server error embedded in the banner', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    server.use(
      http.post('/api/specialists/audit-rotate', () =>
        HttpResponse.json({ error: 'lock contention' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useAuditRotate());
    await act(async () => {
      await result.current.handleAuditRotate();
    });
    expect(result.current.rotateFailed).toBe(true);
    expect(result.current.rotateMsg).toBeTruthy();
    expect(result.current.rotateMsg).toContain('lock contention');
    expect(result.current.rotateBusy).toBe(false);
  });

  it('flips rotateBusy=true while the request is in flight and back to false on resolve (busy slot)', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.post('/api/specialists/audit-rotate', async () => {
        await gate;
        return HttpResponse.json({ ok: true, rotated: true });
      }),
    );
    const { result } = renderHook(() => useAuditRotate());
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.handleAuditRotate();
      await Promise.resolve();
    });
    expect(result.current.rotateBusy).toBe(true);
    release();
    await act(async () => {
      await inflight;
    });
    expect(result.current.rotateBusy).toBe(false);
  });

  it('a parallel call issued while the first is gated still fires a second POST (no internal guard)', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let calls = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.post('/api/specialists/audit-rotate', async () => {
        calls++;
        await gate;
        return HttpResponse.json({ ok: true, rotated: true });
      }),
    );
    const { result } = renderHook(() => useAuditRotate());
    let first: Promise<void> | null = null;
    let second: Promise<void> | null = null;
    await act(async () => {
      first = result.current.handleAuditRotate();
      await Promise.resolve();
    });
    expect(result.current.rotateBusy).toBe(true);
    expect(calls).toBe(1);
    await act(async () => {
      second = result.current.handleAuditRotate();
      await Promise.resolve();
    });
    expect(calls).toBe(2);
    release();
    await act(async () => {
      await first;
      await second;
    });
    expect(result.current.rotateBusy).toBe(false);
  });

  it('clears stale failure state at the start of a fresh run (reset effect)', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    server.use(
      http.post('/api/specialists/audit-rotate', () =>
        HttpResponse.json({ error: 'first' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useAuditRotate());
    await act(async () => {
      await result.current.handleAuditRotate();
    });
    expect(result.current.rotateFailed).toBe(true);
    server.use(
      http.post('/api/specialists/audit-rotate', () =>
        HttpResponse.json({ ok: true, rotated: true, archive: '/tmp/ok.jsonl' }),
      ),
    );
    await act(async () => {
      await result.current.handleAuditRotate();
    });
    expect(result.current.rotateFailed).toBe(false);
    expect(result.current.rotateMsg).toContain('/tmp/ok.jsonl');
  });
});
