import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook } from '@testing-library/react';
import { server } from '../test/server';
import { useScribeContext } from './use-scribe-context';

// useScribeContext owns the scribe-drawer state for HistoryView.
// Contract:
//   - mounts idle: showScribe=false, scribe=null, loadingScribe=false
//   - openScribe() flips showScribe=true synchronously, fetches
//     /api/scribe-context, stores the payload, and clears the parent
//     error banner (setError(null))
//   - any failure path calls setError(message) instead of clearing
//   - loadingScribe always lands false in the finally block, even on
//     error or partial responses
//   - closeScribe() flips only showScribe back to false (the cached
//     payload stays so a re-open does not flash empty)
//   - openScribe identity is tied to the supplied setError; closeScribe
//     has no deps and is stable across re-renders

describe('useScribeContext', () => {
  it('starts idle: drawer closed, no payload, not loading', () => {
    const { result } = renderHook(() =>
      useScribeContext({ setError: vi.fn() }),
    );
    expect(result.current.showScribe).toBe(false);
    expect(result.current.scribe).toBeNull();
    expect(result.current.loadingScribe).toBe(false);
    expect(typeof result.current.openScribe).toBe('function');
    expect(typeof result.current.closeScribe).toBe('function');
  });

  it('openScribe flips showScribe=true synchronously before the fetch settles', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.get('/api/scribe-context', async () => {
        await gate;
        return HttpResponse.json({
          exists: true,
          path: '/c4/.c4/scribe.md',
          size: 0,
          updatedAt: null,
          content: '',
        });
      }),
    );
    const { result } = renderHook(() =>
      useScribeContext({ setError: vi.fn() }),
    );
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.openScribe();
      await Promise.resolve();
    });
    expect(result.current.showScribe).toBe(true);
    expect(result.current.loadingScribe).toBe(true);
    release();
    await act(async () => {
      await inflight;
    });
  });

  it('happy path: stores the ScribeContextResponse and clears the parent error', async () => {
    const payload = {
      exists: true,
      path: '/c4/.c4/scribe.md',
      size: 1024,
      updatedAt: '2026-05-14T00:00:00.000Z',
      truncated: false,
      content: 'hello scribe',
    };
    server.use(
      http.get('/api/scribe-context', () => HttpResponse.json(payload)),
    );
    const setError = vi.fn();
    const { result } = renderHook(() => useScribeContext({ setError }));
    await act(async () => {
      await result.current.openScribe();
    });
    expect(result.current.scribe).toEqual(payload);
    expect(setError).toHaveBeenLastCalledWith(null);
    expect(result.current.loadingScribe).toBe(false);
    expect(result.current.showScribe).toBe(true);
  });

  it('preserves optional truncated + content fields on the payload (open interface)', async () => {
    const payload = {
      exists: true,
      path: '/c4/.c4/scribe.md',
      size: 9_999_999,
      updatedAt: '2026-05-14T00:00:00.000Z',
      truncated: true,
      content: 'first 64KB only',
    };
    server.use(
      http.get('/api/scribe-context', () => HttpResponse.json(payload)),
    );
    const { result } = renderHook(() =>
      useScribeContext({ setError: vi.fn() }),
    );
    await act(async () => {
      await result.current.openScribe();
    });
    expect(result.current.scribe?.truncated).toBe(true);
    expect(result.current.scribe?.content).toBe('first 64KB only');
  });

  it('error path: setError gets the thrown message, loadingScribe lands false, scribe stays null', async () => {
    server.use(
      http.get('/api/scribe-context', () =>
        HttpResponse.json({ error: 'kaboom' }, { status: 500 }),
      ),
    );
    const setError = vi.fn();
    const { result } = renderHook(() => useScribeContext({ setError }));
    await act(async () => {
      await result.current.openScribe();
    });
    expect(setError).toHaveBeenCalled();
    const msg = setError.mock.calls.at(-1)?.[0] as string;
    expect(msg).toContain('HTTP 500');
    expect(result.current.scribe).toBeNull();
    expect(result.current.loadingScribe).toBe(false);
    expect(result.current.showScribe).toBe(true);
  });

  it('error path still leaves the drawer open (showScribe=true) so the banner is visible', async () => {
    server.use(
      http.get('/api/scribe-context', () =>
        HttpResponse.json({ error: 'gone' }, { status: 503 }),
      ),
    );
    const { result } = renderHook(() =>
      useScribeContext({ setError: vi.fn() }),
    );
    await act(async () => {
      await result.current.openScribe();
    });
    expect(result.current.showScribe).toBe(true);
  });

  it('loadingScribe toggles true during in-flight openScribe and back to false on success', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.get('/api/scribe-context', async () => {
        await gate;
        return HttpResponse.json({
          exists: true,
          path: '/x',
          size: 0,
          updatedAt: null,
          content: '',
        });
      }),
    );
    const { result } = renderHook(() =>
      useScribeContext({ setError: vi.fn() }),
    );
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.openScribe();
      await Promise.resolve();
    });
    expect(result.current.loadingScribe).toBe(true);
    release();
    await act(async () => {
      await inflight;
    });
    expect(result.current.loadingScribe).toBe(false);
  });

  it('closeScribe flips showScribe=false without touching the cached payload', async () => {
    const payload = {
      exists: true,
      path: '/x',
      size: 7,
      updatedAt: null,
      content: 'cached',
    };
    server.use(
      http.get('/api/scribe-context', () => HttpResponse.json(payload)),
    );
    const { result } = renderHook(() =>
      useScribeContext({ setError: vi.fn() }),
    );
    await act(async () => {
      await result.current.openScribe();
    });
    expect(result.current.scribe).toEqual(payload);
    act(() => {
      result.current.closeScribe();
    });
    expect(result.current.showScribe).toBe(false);
    expect(result.current.scribe).toEqual(payload);
  });

  it('closeScribe before any open is a safe no-op', () => {
    const { result } = renderHook(() =>
      useScribeContext({ setError: vi.fn() }),
    );
    act(() => {
      result.current.closeScribe();
    });
    expect(result.current.showScribe).toBe(false);
    expect(result.current.scribe).toBeNull();
  });

  it('a second openScribe after an error replaces the error with setError(null) on success', async () => {
    server.use(
      http.get('/api/scribe-context', () =>
        HttpResponse.json({ error: 'first fail' }, { status: 500 }),
      ),
    );
    const setError = vi.fn();
    const { result } = renderHook(() => useScribeContext({ setError }));
    await act(async () => {
      await result.current.openScribe();
    });
    expect(setError).toHaveBeenLastCalledWith(
      expect.stringContaining('HTTP 500'),
    );
    server.use(
      http.get('/api/scribe-context', () =>
        HttpResponse.json({
          exists: true,
          path: '/x',
          size: 1,
          updatedAt: null,
          content: 'ok',
        }),
      ),
    );
    await act(async () => {
      await result.current.openScribe();
    });
    expect(setError).toHaveBeenLastCalledWith(null);
    expect(result.current.scribe?.content).toBe('ok');
  });

  it('closeScribe reference is stable across re-renders (useCallback has no deps)', () => {
    const { result, rerender } = renderHook(() =>
      useScribeContext({ setError: vi.fn() }),
    );
    const first = result.current.closeScribe;
    rerender();
    expect(result.current.closeScribe).toBe(first);
  });

  it('openScribe reference is stable when setError identity is stable', () => {
    const setError = vi.fn();
    const { result, rerender } = renderHook(() =>
      useScribeContext({ setError }),
    );
    const first = result.current.openScribe;
    rerender();
    expect(result.current.openScribe).toBe(first);
  });

  it('openScribe reference changes when setError identity changes (useCallback dep)', () => {
    const { result, rerender } = renderHook(
      ({ setError }: { setError: (m: string | null) => void }) =>
        useScribeContext({ setError }),
      { initialProps: { setError: vi.fn() } },
    );
    const first = result.current.openScribe;
    rerender({ setError: vi.fn() });
    expect(result.current.openScribe).not.toBe(first);
  });

  it('GETs /api/scribe-context exactly once per openScribe call (no auto-fetch on mount)', async () => {
    let calls = 0;
    server.use(
      http.get('/api/scribe-context', () => {
        calls++;
        return HttpResponse.json({
          exists: true,
          path: '/x',
          size: 0,
          updatedAt: null,
          content: '',
        });
      }),
    );
    const { result } = renderHook(() =>
      useScribeContext({ setError: vi.fn() }),
    );
    expect(calls).toBe(0);
    await act(async () => {
      await result.current.openScribe();
    });
    expect(calls).toBe(1);
  });
});
