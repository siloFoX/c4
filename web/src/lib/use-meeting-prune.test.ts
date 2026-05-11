import { describe, it, expect, vi, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook } from '@testing-library/react';
import { server } from '../test/server';
import { useMeetingPrune } from './use-meeting-prune';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useMeetingPrune', () => {
  it('starts with documented defaults: days="90", terminal=true, vacuum=false, idle', () => {
    const { result } = renderHook(() => useMeetingPrune({}));
    expect(result.current.pruneDays).toBe('90');
    expect(result.current.pruneTerminal).toBe(true);
    expect(result.current.pruneVacuum).toBe(false);
    expect(result.current.pruneBusy).toBe(false);
    expect(result.current.pruneMsg).toBeNull();
    expect(result.current.pruneFailed).toBe(false);
  });

  it('exposes setters for all three form fields', () => {
    const { result } = renderHook(() => useMeetingPrune({}));
    act(() => {
      result.current.setPruneDays('30');
      result.current.setPruneTerminal(false);
      result.current.setPruneVacuum(true);
    });
    expect(result.current.pruneDays).toBe('30');
    expect(result.current.pruneTerminal).toBe(false);
    expect(result.current.pruneVacuum).toBe(true);
  });

  it('rejects non-numeric / non-finite days with failed=true (no fetch)', async () => {
    let calls = 0;
    server.use(
      http.post('/api/meetings/prune-old', () => {
        calls++;
        return HttpResponse.json({ count: 0, ids: [], dryRun: true, cutoffISO: '' });
      }),
    );
    const { result } = renderHook(() => useMeetingPrune({}));
    act(() => result.current.setPruneDays('not-a-number'));
    await act(async () => {
      await result.current.handlePrune(true);
    });
    expect(calls).toBe(0);
    expect(result.current.pruneFailed).toBe(true);
    expect(result.current.pruneMsg).toBeTruthy();
  });

  it('rejects days < 1 with failed=true (no fetch)', async () => {
    let calls = 0;
    server.use(
      http.post('/api/meetings/prune-old', () => {
        calls++;
        return HttpResponse.json({ count: 0, ids: [], dryRun: true, cutoffISO: '' });
      }),
    );
    const { result } = renderHook(() => useMeetingPrune({}));
    act(() => result.current.setPruneDays('0'));
    await act(async () => {
      await result.current.handlePrune(true);
    });
    expect(calls).toBe(0);
    expect(result.current.pruneFailed).toBe(true);
  });

  it('skips the confirm prompt for dryRun=true even when destructive flags are on', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    let calls = 0;
    server.use(
      http.post('/api/meetings/prune-old', () => {
        calls++;
        return HttpResponse.json({ count: 5, ids: [], dryRun: true, cutoffISO: '2026-01-01' });
      }),
    );
    const { result } = renderHook(() => useMeetingPrune({}));
    await act(async () => {
      await result.current.handlePrune(true);
    });
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(calls).toBe(1);
    expect(result.current.pruneFailed).toBe(false);
  });

  it('asks confirm for non-dryRun and skips POST when rejected', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    let calls = 0;
    server.use(
      http.post('/api/meetings/prune-old', () => {
        calls++;
        return HttpResponse.json({ count: 0, ids: [], dryRun: false, cutoffISO: '' });
      }),
    );
    const { result } = renderHook(() => useMeetingPrune({}));
    await act(async () => {
      await result.current.handlePrune(false);
    });
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(calls).toBe(0);
    expect(result.current.pruneBusy).toBe(false);
  });

  it('proceeds with POST when confirm is accepted (non-dryRun)', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let body: { days?: number; terminalOnly?: boolean; dryRun?: boolean; vacuum?: boolean } | null = null;
    server.use(
      http.post('/api/meetings/prune-old', async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json({ count: 3, ids: ['a', 'b', 'c'], dryRun: false, cutoffISO: '2026-01-01' });
      }),
    );
    const { result } = renderHook(() => useMeetingPrune({}));
    act(() => {
      result.current.setPruneDays('30');
      result.current.setPruneTerminal(false);
      result.current.setPruneVacuum(true);
    });
    await act(async () => {
      await result.current.handlePrune(false);
    });
    expect(body).toEqual({ days: 30, terminalOnly: false, dryRun: false, vacuum: true });
    expect(result.current.pruneFailed).toBe(false);
    expect(result.current.pruneMsg).toBeTruthy();
  });

  it('calls onPruned() after a non-dryRun success', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    server.use(
      http.post('/api/meetings/prune-old', () =>
        HttpResponse.json({ count: 1, ids: ['a'], dryRun: false, cutoffISO: '2026-01-01' }),
      ),
    );
    const onPruned = vi.fn();
    const { result } = renderHook(() => useMeetingPrune({ onPruned }));
    await act(async () => {
      await result.current.handlePrune(false);
    });
    expect(onPruned).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onPruned() after a dryRun success', async () => {
    server.use(
      http.post('/api/meetings/prune-old', () =>
        HttpResponse.json({ count: 1, ids: ['a'], dryRun: true, cutoffISO: '2026-01-01' }),
      ),
    );
    const onPruned = vi.fn();
    const { result } = renderHook(() => useMeetingPrune({ onPruned }));
    await act(async () => {
      await result.current.handlePrune(true);
    });
    expect(onPruned).not.toHaveBeenCalled();
  });

  it('marks failed=true on server error', async () => {
    server.use(
      http.post('/api/meetings/prune-old', () =>
        HttpResponse.json({ error: 'cant prune' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useMeetingPrune({}));
    await act(async () => {
      await result.current.handlePrune(true);
    });
    expect(result.current.pruneFailed).toBe(true);
    expect(result.current.pruneMsg).toBeTruthy();
    expect(result.current.pruneBusy).toBe(false);
  });
});
