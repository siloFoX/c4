import { describe, it, expect, vi, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook, waitFor } from '@testing-library/react';
import { server } from '../test/server';
import { useMorning } from './use-morning';

// useMorning owns the Morning page state machine:
//   - generate(): POST /api/morning -> MorningResponse
//       happy:  stores r, clears error
//       envelope error: stores r.error in error, blanks report
//       thrown: stores e.message in error, blanks report
//   - copy(): no-op if report.content missing; else clipboard.writeText +
//     success/failure toast routed through showToast (success = morning.toast.copied,
//     failure = morning.toast.copyFailed with {error})
//   - loading flag flips true while inflight and back to false at end
//   - generate identity is stable (useCallback []), copy identity tied to report + showToast

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useMorning', () => {
  it('mounts idle: report=null, loading=false, error=null, functions exposed', () => {
    const showToast = vi.fn();
    const { result } = renderHook(() => useMorning({ showToast }));
    expect(result.current.report).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(typeof result.current.generate).toBe('function');
    expect(typeof result.current.copy).toBe('function');
  });

  it('generate happy path: POSTs /api/morning with {} and stores the rendered report', async () => {
    let capturedBody: unknown = null;
    server.use(
      http.post('/api/morning', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({
          content: '# morning\nbody',
          generatedAt: '2026-05-14T05:00:00Z',
          sections: [{ title: 's', body: 'b' }],
        });
      }),
    );
    const showToast = vi.fn();
    const { result } = renderHook(() => useMorning({ showToast }));
    await act(async () => {
      await result.current.generate();
    });
    expect(capturedBody).toEqual({});
    expect(result.current.report?.content).toBe('# morning\nbody');
    expect(result.current.report?.sections).toHaveLength(1);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('generate envelope-error: stores r.error, blanks report', async () => {
    server.use(
      http.post('/api/morning', () =>
        HttpResponse.json({ error: 'no data yet' }),
      ),
    );
    const showToast = vi.fn();
    const { result } = renderHook(() => useMorning({ showToast }));
    await act(async () => {
      await result.current.generate();
    });
    expect(result.current.error).toBe('no data yet');
    expect(result.current.report).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('generate thrown (HTTP 500): stores e.message and blanks report', async () => {
    server.use(
      http.post('/api/morning', () =>
        HttpResponse.json({ error: 'kaboom' }, { status: 500 }),
      ),
    );
    const showToast = vi.fn();
    const { result } = renderHook(() => useMorning({ showToast }));
    await act(async () => {
      await result.current.generate();
    });
    expect(result.current.error).toMatch(/HTTP 500/);
    expect(result.current.report).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('flips loading=true while generate is inflight and back to false on success', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.post('/api/morning', async () => {
        await gate;
        return HttpResponse.json({ content: 'x' });
      }),
    );
    const showToast = vi.fn();
    const { result } = renderHook(() => useMorning({ showToast }));
    let inflight: Promise<void> | null = null;
    act(() => {
      inflight = result.current.generate();
    });
    await waitFor(() => {
      expect(result.current.loading).toBe(true);
    });
    release();
    await act(async () => {
      await inflight;
    });
    expect(result.current.loading).toBe(false);
  });

  it('generate clears stale error before the next call (re-enter happy path)', async () => {
    server.use(
      http.post('/api/morning', () =>
        HttpResponse.json({ error: 'first' }),
      ),
    );
    const showToast = vi.fn();
    const { result } = renderHook(() => useMorning({ showToast }));
    await act(async () => {
      await result.current.generate();
    });
    expect(result.current.error).toBe('first');
    server.use(
      http.post('/api/morning', () =>
        HttpResponse.json({ content: 'fresh' }),
      ),
    );
    await act(async () => {
      await result.current.generate();
    });
    expect(result.current.error).toBeNull();
    expect(result.current.report?.content).toBe('fresh');
  });

  it('copy() is a no-op when report.content is missing (no toast, no clipboard call)', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    const showToast = vi.fn();
    const { result } = renderHook(() => useMorning({ showToast }));
    await act(async () => {
      await result.current.copy();
    });
    expect(writeText).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('copy() happy path: writes report.content to clipboard and fires success toast', async () => {
    server.use(
      http.post('/api/morning', () =>
        HttpResponse.json({ content: 'report body' }),
      ),
    );
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    const showToast = vi.fn();
    const { result } = renderHook(() => useMorning({ showToast }));
    await act(async () => {
      await result.current.generate();
    });
    await act(async () => {
      await result.current.copy();
    });
    expect(writeText).toHaveBeenCalledWith('report body');
    expect(showToast).toHaveBeenCalledWith('Copied to clipboard', 'success');
  });

  it('copy() failure path: clipboard rejection surfaces morning.toast.copyFailed error toast', async () => {
    server.use(
      http.post('/api/morning', () =>
        HttpResponse.json({ content: 'something' }),
      ),
    );
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    const showToast = vi.fn();
    const { result } = renderHook(() => useMorning({ showToast }));
    await act(async () => {
      await result.current.generate();
    });
    await act(async () => {
      await result.current.copy();
    });
    expect(showToast).toHaveBeenCalledWith('Copy failed: denied', 'error');
  });

  it('generate callback identity is stable across re-renders (useCallback has no deps)', () => {
    const showToast = vi.fn();
    const { result, rerender } = renderHook(
      ({ st }: { st: typeof showToast }) => useMorning({ showToast: st }),
      { initialProps: { st: showToast } },
    );
    const first = result.current.generate;
    rerender({ st: showToast });
    expect(result.current.generate).toBe(first);
  });

  it('copy callback identity changes when showToast changes', async () => {
    const a = vi.fn();
    const b = vi.fn();
    const { result, rerender } = renderHook(
      ({ st }: { st: typeof a }) => useMorning({ showToast: st }),
      { initialProps: { st: a } },
    );
    const first = result.current.copy;
    rerender({ st: a });
    expect(result.current.copy).toBe(first);
    rerender({ st: b });
    expect(result.current.copy).not.toBe(first);
  });
});
