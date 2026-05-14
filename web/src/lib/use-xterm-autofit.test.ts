import { describe, it, expect, vi, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook } from '@testing-library/react';
import { createRef } from 'react';
import type { MutableRefObject } from 'react';
import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import { server } from '../test/server';
import {
  useXtermAutofit,
  FIT_DEBOUNCE_MS,
  MIN_COLS,
  MAX_COLS,
  MIN_ROWS,
  MAX_ROWS,
} from './use-xterm-autofit';

// useXtermAutofit returns:
//   - runFit():    calls fit.fit(); reads term.cols / term.rows; clamps
//                  into [MIN_COLS..MAX_COLS] x [MIN_ROWS..MAX_ROWS];
//                  dedupes via lastResizeRef; POSTs /api/resize with
//                  { name, cols, rows }. Swallows fit.fit() throws.
//   - scheduleFit(): debounces calls into a single runFit() after
//                    FIT_DEBOUNCE_MS via window.setTimeout; clears a
//                    pending timer on re-entry.
//   - fitTimerRef / lastResizeRef refs are exposed so a sibling
//                    resize-fit hook can clear the timer on unmount.

afterEach(() => {
  vi.restoreAllMocks();
});

function makeTermRef(
  cols: number,
  rows: number,
): MutableRefObject<Terminal | null> {
  const ref = createRef<Terminal>() as MutableRefObject<Terminal | null>;
  ref.current = { cols, rows } as unknown as Terminal;
  return ref;
}

function makeFitRef(
  fitFn: () => void = () => {},
): MutableRefObject<FitAddon | null> {
  const ref = createRef<FitAddon>() as MutableRefObject<FitAddon | null>;
  ref.current = { fit: fitFn } as unknown as FitAddon;
  return ref;
}

describe('useXtermAutofit', () => {
  it('exports the clamp constants documented in the source', () => {
    expect(FIT_DEBOUNCE_MS).toBe(120);
    expect(MIN_COLS).toBe(20);
    expect(MAX_COLS).toBe(400);
    expect(MIN_ROWS).toBe(5);
    expect(MAX_ROWS).toBe(200);
  });

  it('mounts: returns runFit + scheduleFit functions + two MutableRefObjects', () => {
    const termRef = makeTermRef(80, 24);
    const fitRef = makeFitRef();
    const { result } = renderHook(() =>
      useXtermAutofit({ termRef, fitRef, workerName: 'w1' }),
    );
    expect(typeof result.current.runFit).toBe('function');
    expect(typeof result.current.scheduleFit).toBe('function');
    expect(result.current.fitTimerRef.current).toBeNull();
    expect(result.current.lastResizeRef.current).toBeNull();
  });

  it('runFit no-ops when termRef.current is null (no fit, no resize, no POST)', async () => {
    const termRef: MutableRefObject<Terminal | null> = { current: null };
    const fit = vi.fn();
    const fitRef = makeFitRef(fit);
    let posted = 0;
    server.use(
      http.post('/api/resize', () => {
        posted++;
        return HttpResponse.json({ ok: true });
      }),
    );
    const { result } = renderHook(() =>
      useXtermAutofit({ termRef, fitRef, workerName: 'w1' }),
    );
    act(() => {
      result.current.runFit();
    });
    expect(fit).not.toHaveBeenCalled();
    expect(posted).toBe(0);
    expect(result.current.lastResizeRef.current).toBeNull();
  });

  it('runFit no-ops when fitRef.current is null', async () => {
    const termRef = makeTermRef(80, 24);
    const fitRef: MutableRefObject<FitAddon | null> = { current: null };
    let posted = 0;
    server.use(
      http.post('/api/resize', () => {
        posted++;
        return HttpResponse.json({ ok: true });
      }),
    );
    const { result } = renderHook(() =>
      useXtermAutofit({ termRef, fitRef, workerName: 'w1' }),
    );
    act(() => {
      result.current.runFit();
    });
    expect(posted).toBe(0);
    expect(result.current.lastResizeRef.current).toBeNull();
  });

  it('runFit happy path: calls fit.fit(), POSTs /api/resize with { name, cols, rows }, stores lastResize', async () => {
    const fit = vi.fn();
    const fitRef = makeFitRef(fit);
    const termRef = makeTermRef(80, 24);
    let body: unknown = null;
    let path = '';
    server.use(
      http.post('/api/resize', async ({ request }) => {
        path = new URL(request.url).pathname;
        body = await request.json();
        return HttpResponse.json({ ok: true });
      }),
    );
    const { result } = renderHook(() =>
      useXtermAutofit({ termRef, fitRef, workerName: 'demo-1' }),
    );
    act(() => {
      result.current.runFit();
    });
    expect(fit).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => {
      expect(path).toBe('/api/resize');
    });
    expect(body).toEqual({ name: 'demo-1', cols: 80, rows: 24 });
    expect(result.current.lastResizeRef.current).toEqual({ cols: 80, rows: 24 });
  });

  it('runFit swallows a throw from fit.fit() (container 0x0): no POST, no lastResize write', async () => {
    const fit = vi.fn(() => {
      throw new Error('container 0x0');
    });
    const fitRef = makeFitRef(fit);
    const termRef = makeTermRef(80, 24);
    let posted = 0;
    server.use(
      http.post('/api/resize', () => {
        posted++;
        return HttpResponse.json({ ok: true });
      }),
    );
    const { result } = renderHook(() =>
      useXtermAutofit({ termRef, fitRef, workerName: 'w1' }),
    );
    expect(() => {
      act(() => {
        result.current.runFit();
      });
    }).not.toThrow();
    expect(fit).toHaveBeenCalledTimes(1);
    // postAction is fire-and-forget; allow a microtask but it should
    // never fire when fit() threw.
    await Promise.resolve();
    expect(posted).toBe(0);
    expect(result.current.lastResizeRef.current).toBeNull();
  });

  it('runFit skips POST when term.cols / term.rows are non-finite', async () => {
    const fitRef = makeFitRef();
    const termRef = makeTermRef(Number.NaN, 24);
    let posted = 0;
    server.use(
      http.post('/api/resize', () => {
        posted++;
        return HttpResponse.json({ ok: true });
      }),
    );
    const { result } = renderHook(() =>
      useXtermAutofit({ termRef, fitRef, workerName: 'w1' }),
    );
    act(() => {
      result.current.runFit();
    });
    await Promise.resolve();
    expect(posted).toBe(0);
    expect(result.current.lastResizeRef.current).toBeNull();
  });

  it('runFit skips POST when term.cols <= 0 (hidden / zero-sized container)', async () => {
    const fitRef = makeFitRef();
    const termRef = makeTermRef(0, 24);
    let posted = 0;
    server.use(
      http.post('/api/resize', () => {
        posted++;
        return HttpResponse.json({ ok: true });
      }),
    );
    const { result } = renderHook(() =>
      useXtermAutofit({ termRef, fitRef, workerName: 'w1' }),
    );
    act(() => {
      result.current.runFit();
    });
    await Promise.resolve();
    expect(posted).toBe(0);
  });

  it('runFit clamps cols above MAX_COLS down to MAX_COLS and rows above MAX_ROWS down to MAX_ROWS', async () => {
    const fitRef = makeFitRef();
    const termRef = makeTermRef(9999, 9999);
    let body: unknown = null;
    server.use(
      http.post('/api/resize', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ ok: true });
      }),
    );
    const { result } = renderHook(() =>
      useXtermAutofit({ termRef, fitRef, workerName: 'w1' }),
    );
    act(() => {
      result.current.runFit();
    });
    await vi.waitFor(() => {
      expect(body).not.toBeNull();
    });
    expect(body).toEqual({ name: 'w1', cols: MAX_COLS, rows: MAX_ROWS });
  });

  it('runFit clamps cols below MIN_COLS up to MIN_COLS and rows below MIN_ROWS up to MIN_ROWS', async () => {
    const fitRef = makeFitRef();
    const termRef = makeTermRef(1, 1);
    let body: unknown = null;
    server.use(
      http.post('/api/resize', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ ok: true });
      }),
    );
    const { result } = renderHook(() =>
      useXtermAutofit({ termRef, fitRef, workerName: 'w1' }),
    );
    act(() => {
      result.current.runFit();
    });
    await vi.waitFor(() => {
      expect(body).not.toBeNull();
    });
    expect(body).toEqual({ name: 'w1', cols: MIN_COLS, rows: MIN_ROWS });
  });

  it('runFit dedupes consecutive calls with the same clamped cols/rows (lastResizeRef)', async () => {
    const fitRef = makeFitRef();
    const termRef = makeTermRef(80, 24);
    let posted = 0;
    server.use(
      http.post('/api/resize', () => {
        posted++;
        return HttpResponse.json({ ok: true });
      }),
    );
    const { result } = renderHook(() =>
      useXtermAutofit({ termRef, fitRef, workerName: 'w1' }),
    );
    act(() => {
      result.current.runFit();
    });
    await vi.waitFor(() => {
      expect(posted).toBe(1);
    });
    act(() => {
      result.current.runFit();
    });
    await Promise.resolve();
    expect(posted).toBe(1);
  });

  it('runFit re-posts when cols/rows change after the first call', async () => {
    const fitRef = makeFitRef();
    const termRef = makeTermRef(80, 24);
    let posted = 0;
    server.use(
      http.post('/api/resize', () => {
        posted++;
        return HttpResponse.json({ ok: true });
      }),
    );
    const { result } = renderHook(() =>
      useXtermAutofit({ termRef, fitRef, workerName: 'w1' }),
    );
    act(() => {
      result.current.runFit();
    });
    await vi.waitFor(() => {
      expect(posted).toBe(1);
    });
    (termRef.current as unknown as { cols: number; rows: number }).cols = 100;
    (termRef.current as unknown as { cols: number; rows: number }).rows = 30;
    act(() => {
      result.current.runFit();
    });
    await vi.waitFor(() => {
      expect(posted).toBe(2);
    });
    expect(result.current.lastResizeRef.current).toEqual({ cols: 100, rows: 30 });
  });

  it('runFit floors fractional cols/rows before posting (clampInt uses Math.floor)', async () => {
    const fitRef = makeFitRef();
    const termRef = makeTermRef(80.7, 24.9);
    let body: unknown = null;
    server.use(
      http.post('/api/resize', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ ok: true });
      }),
    );
    const { result } = renderHook(() =>
      useXtermAutofit({ termRef, fitRef, workerName: 'w1' }),
    );
    act(() => {
      result.current.runFit();
    });
    await vi.waitFor(() => {
      expect(body).not.toBeNull();
    });
    expect(body).toEqual({ name: 'w1', cols: 80, rows: 24 });
  });

  it('runFit swallows a /api/resize HTTP 500 (apiPost rejection is .catch()-ed)', async () => {
    const fitRef = makeFitRef();
    const termRef = makeTermRef(80, 24);
    server.use(
      http.post('/api/resize', () =>
        HttpResponse.json({ error: 'nope' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() =>
      useXtermAutofit({ termRef, fitRef, workerName: 'w1' }),
    );
    expect(() => {
      act(() => {
        result.current.runFit();
      });
    }).not.toThrow();
    expect(result.current.lastResizeRef.current).toEqual({ cols: 80, rows: 24 });
  });

  it('scheduleFit defers runFit via window.setTimeout with FIT_DEBOUNCE_MS', async () => {
    vi.useFakeTimers();
    try {
      const fit = vi.fn();
      const fitRef = makeFitRef(fit);
      const termRef = makeTermRef(80, 24);
      server.use(
        http.post('/api/resize', () => HttpResponse.json({ ok: true })),
      );
      const { result } = renderHook(() =>
        useXtermAutofit({ termRef, fitRef, workerName: 'w1' }),
      );
      act(() => {
        result.current.scheduleFit();
      });
      expect(fit).not.toHaveBeenCalled();
      expect(result.current.fitTimerRef.current).not.toBeNull();
      act(() => {
        vi.advanceTimersByTime(FIT_DEBOUNCE_MS);
      });
      expect(fit).toHaveBeenCalledTimes(1);
      expect(result.current.fitTimerRef.current).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('scheduleFit collapses overlapping calls into a single runFit (clears previous timer)', async () => {
    vi.useFakeTimers();
    try {
      const fit = vi.fn();
      const fitRef = makeFitRef(fit);
      const termRef = makeTermRef(80, 24);
      server.use(
        http.post('/api/resize', () => HttpResponse.json({ ok: true })),
      );
      const clearSpy = vi.spyOn(window, 'clearTimeout');
      const { result } = renderHook(() =>
        useXtermAutofit({ termRef, fitRef, workerName: 'w1' }),
      );
      act(() => {
        result.current.scheduleFit();
      });
      const firstTimer = result.current.fitTimerRef.current;
      act(() => {
        result.current.scheduleFit();
      });
      expect(clearSpy).toHaveBeenCalledWith(firstTimer);
      act(() => {
        vi.advanceTimersByTime(FIT_DEBOUNCE_MS);
      });
      expect(fit).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('runFit / scheduleFit callback identities change when workerName changes', () => {
    const termRef = makeTermRef(80, 24);
    const fitRef = makeFitRef();
    const { result, rerender } = renderHook(
      ({ name }: { name: string }) =>
        useXtermAutofit({ termRef, fitRef, workerName: name }),
      { initialProps: { name: 'w1' } },
    );
    const firstRun = result.current.runFit;
    const firstSchedule = result.current.scheduleFit;
    rerender({ name: 'w1' });
    expect(result.current.runFit).toBe(firstRun);
    expect(result.current.scheduleFit).toBe(firstSchedule);
    rerender({ name: 'w2' });
    expect(result.current.runFit).not.toBe(firstRun);
    expect(result.current.scheduleFit).not.toBe(firstSchedule);
  });
});
