import { describe, it, expect, vi, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook } from '@testing-library/react';
import { server } from '../test/server';
import { useSpecialistActions } from './use-specialist-actions';

afterEach(() => {
  vi.restoreAllMocks();
});

function makeArgs(
  overrides: Partial<Parameters<typeof useSpecialistActions>[0]> = {},
): Parameters<typeof useSpecialistActions>[0] {
  return {
    selectedId: null,
    setSelectedId: vi.fn(),
    setActionError: vi.fn(),
    refresh: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('useSpecialistActions', () => {
  it('starts idle: both busy flags false, both confirm ids null', () => {
    const { result } = renderHook(() => useSpecialistActions(makeArgs()));
    expect(result.current.removeBusy).toBe(false);
    expect(result.current.confirmRemoveId).toBeNull();
    expect(result.current.resetBusy).toBe(false);
    expect(result.current.confirmResetId).toBeNull();
  });

  it('exposes confirm-id setters so the JSX can flip into the 2-step confirm', () => {
    const { result } = renderHook(() => useSpecialistActions(makeArgs()));
    act(() => result.current.setConfirmRemoveId('r1'));
    expect(result.current.confirmRemoveId).toBe('r1');
    act(() => result.current.setConfirmResetId('r2'));
    expect(result.current.confirmResetId).toBe('r2');
    act(() => {
      result.current.setConfirmRemoveId(null);
      result.current.setConfirmResetId(null);
    });
    expect(result.current.confirmRemoveId).toBeNull();
    expect(result.current.confirmResetId).toBeNull();
  });

  it('handleScoreReset: POSTs /api/specialists/<id>/score-reset with reason body, clears confirmResetId, refreshes', async () => {
    let capturedPath = '';
    let body: { reason?: string } | null = null;
    server.use(
      http.post('/api/specialists/:id/score-reset', async ({ request }) => {
        capturedPath = new URL(request.url).pathname;
        body = (await request.json()) as typeof body;
        return HttpResponse.json({ ok: true });
      }),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useSpecialistActions(args));
    act(() => result.current.setConfirmResetId('s1'));
    await act(async () => {
      await result.current.handleScoreReset('s1');
    });
    expect(capturedPath).toBe('/api/specialists/s1/score-reset');
    expect(body).toEqual({ reason: 'web reset' });
    expect(result.current.confirmResetId).toBeNull();
    expect(args.refresh).toHaveBeenCalledTimes(1);
    expect(args.setActionError).not.toHaveBeenCalled();
  });

  it('handleScoreReset: URL-encodes the id so slashes / spaces survive', async () => {
    let capturedPath = '';
    server.use(
      http.post('/api/specialists/:id/score-reset', ({ request }) => {
        capturedPath = new URL(request.url).pathname;
        return HttpResponse.json({ ok: true });
      }),
    );
    const { result } = renderHook(() => useSpecialistActions(makeArgs()));
    await act(async () => {
      await result.current.handleScoreReset('a/b c');
    });
    expect(capturedPath).toContain('a%2Fb%20c');
  });

  it('handleScoreReset: server error -> setActionError with formatted msg, refresh not called', async () => {
    server.use(
      http.post('/api/specialists/:id/score-reset', () =>
        HttpResponse.json({ error: 'locked' }, { status: 409 }),
      ),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useSpecialistActions(args));
    act(() => result.current.setConfirmResetId('s1'));
    await act(async () => {
      await result.current.handleScoreReset('s1');
    });
    expect(args.setActionError).toHaveBeenCalledTimes(1);
    const msg = (args.setActionError as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(msg).toContain('score-reset:');
    expect(args.refresh).not.toHaveBeenCalled();
    // confirmResetId stays set so the user can retry from the same prompt
    expect(result.current.confirmResetId).toBe('s1');
  });

  it('handleScoreReset: blank Error.message falls back to common.failed copy', async () => {
    const orig = global.fetch;
    global.fetch = vi.fn().mockRejectedValue(new Error(''));
    try {
      const args = makeArgs();
      const { result } = renderHook(() => useSpecialistActions(args));
      await act(async () => {
        await result.current.handleScoreReset('s1');
      });
      expect(args.setActionError).toHaveBeenCalledTimes(1);
      const msg = (args.setActionError as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(msg).toContain('failed');
    } finally {
      global.fetch = orig;
    }
  });

  it('handleScoreReset: resetBusy flips true during in-flight POST, back to false on resolve', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.post('/api/specialists/:id/score-reset', async () => {
        await gate;
        return HttpResponse.json({ ok: true });
      }),
    );
    const { result } = renderHook(() => useSpecialistActions(makeArgs()));
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.handleScoreReset('s1');
      await Promise.resolve();
    });
    expect(result.current.resetBusy).toBe(true);
    release();
    await act(async () => {
      await inflight;
    });
    expect(result.current.resetBusy).toBe(false);
  });

  it('handleScoreReset: resetBusy returns to false on error path (finally)', async () => {
    server.use(
      http.post('/api/specialists/:id/score-reset', () =>
        HttpResponse.json({ error: 'boom' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useSpecialistActions(makeArgs()));
    await act(async () => {
      await result.current.handleScoreReset('s1');
    });
    expect(result.current.resetBusy).toBe(false);
  });

  it('handleRemove: DELETEs /api/specialists/<id>, refreshes, clears confirmRemoveId', async () => {
    let capturedPath = '';
    server.use(
      http.delete('/api/specialists/:id', ({ request }) => {
        capturedPath = new URL(request.url).pathname;
        return HttpResponse.json({ ok: true });
      }),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useSpecialistActions(args));
    act(() => result.current.setConfirmRemoveId('s9'));
    await act(async () => {
      await result.current.handleRemove('s9');
    });
    expect(capturedPath).toBe('/api/specialists/s9');
    expect(args.refresh).toHaveBeenCalledTimes(1);
    expect(result.current.confirmRemoveId).toBeNull();
    expect(args.setSelectedId).not.toHaveBeenCalled(); // selectedId was null
    expect(args.setActionError).not.toHaveBeenCalled();
  });

  it('handleRemove: clears selectedId when removing the currently-selected id', async () => {
    server.use(
      http.delete('/api/specialists/:id', () => HttpResponse.json({ ok: true })),
    );
    const args = makeArgs({ selectedId: 's9' });
    const { result } = renderHook(() => useSpecialistActions(args));
    await act(async () => {
      await result.current.handleRemove('s9');
    });
    expect(args.setSelectedId).toHaveBeenCalledWith(null);
  });

  it('handleRemove: does NOT touch selectedId when a different specialist is removed', async () => {
    server.use(
      http.delete('/api/specialists/:id', () => HttpResponse.json({ ok: true })),
    );
    const args = makeArgs({ selectedId: 's-other' });
    const { result } = renderHook(() => useSpecialistActions(args));
    await act(async () => {
      await result.current.handleRemove('s9');
    });
    expect(args.setSelectedId).not.toHaveBeenCalled();
  });

  it('handleRemove: URL-encodes the id so slashes / spaces survive', async () => {
    let capturedPath = '';
    server.use(
      http.delete('/api/specialists/:id', ({ request }) => {
        capturedPath = new URL(request.url).pathname;
        return HttpResponse.json({ ok: true });
      }),
    );
    const { result } = renderHook(() => useSpecialistActions(makeArgs()));
    await act(async () => {
      await result.current.handleRemove('a/b c');
    });
    expect(capturedPath).toContain('a%2Fb%20c');
  });

  it('handleRemove: server error -> setActionError with the daemon message, refresh not called', async () => {
    server.use(
      http.delete('/api/specialists/:id', () =>
        HttpResponse.json({ error: 'in use' }, { status: 409 }),
      ),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useSpecialistActions(args));
    await act(async () => {
      await result.current.handleRemove('s1');
    });
    expect(args.setActionError).toHaveBeenCalledTimes(1);
    const msg = (args.setActionError as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(msg).toContain('in use');
    expect(args.refresh).not.toHaveBeenCalled();
  });

  it('handleRemove: blank Error.message falls back to common.failedToRemoveSpecialist', async () => {
    const orig = global.fetch;
    global.fetch = vi.fn().mockRejectedValue(new Error(''));
    try {
      const args = makeArgs();
      const { result } = renderHook(() => useSpecialistActions(args));
      await act(async () => {
        await result.current.handleRemove('s1');
      });
      expect(args.setActionError).toHaveBeenCalledWith(
        'Failed to remove specialist',
      );
    } finally {
      global.fetch = orig;
    }
  });

  it('handleRemove: confirmRemoveId is cleared in finally even when the DELETE fails', async () => {
    server.use(
      http.delete('/api/specialists/:id', () =>
        HttpResponse.json({ error: 'boom' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useSpecialistActions(makeArgs()));
    act(() => result.current.setConfirmRemoveId('s1'));
    await act(async () => {
      await result.current.handleRemove('s1');
    });
    expect(result.current.confirmRemoveId).toBeNull();
    expect(result.current.removeBusy).toBe(false);
  });

  it('handleRemove: removeBusy flips true during in-flight DELETE, back to false on resolve', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.delete('/api/specialists/:id', async () => {
        await gate;
        return HttpResponse.json({ ok: true });
      }),
    );
    const { result } = renderHook(() => useSpecialistActions(makeArgs()));
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.handleRemove('s1');
      await Promise.resolve();
    });
    expect(result.current.removeBusy).toBe(true);
    release();
    await act(async () => {
      await inflight;
    });
    expect(result.current.removeBusy).toBe(false);
  });
});
