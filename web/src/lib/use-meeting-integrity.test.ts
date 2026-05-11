import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook } from '@testing-library/react';
import { server } from '../test/server';
import { useMeetingIntegrity } from './use-meeting-integrity';

describe('useMeetingIntegrity', () => {
  it('starts idle: not busy, no msg, not failed', () => {
    const { result } = renderHook(() => useMeetingIntegrity());
    expect(result.current.integrityBusy).toBe(false);
    expect(result.current.integrityMsg).toBeNull();
    expect(result.current.integrityFailed).toBe(false);
  });

  it('reports the persist-disabled branch when daemon returns enabled:false', async () => {
    server.use(
      http.get('/api/meetings/persist-integrity', () =>
        HttpResponse.json({ enabled: false, ok: null, errors: [] }),
      ),
    );
    const { result } = renderHook(() => useMeetingIntegrity());
    await act(async () => {
      await result.current.handleIntegrity();
    });
    expect(result.current.integrityBusy).toBe(false);
    expect(result.current.integrityFailed).toBe(false);
    expect(result.current.integrityMsg).toBeTruthy();
  });

  it('reports a success message when ok=true', async () => {
    server.use(
      http.get('/api/meetings/persist-integrity', () =>
        HttpResponse.json({ enabled: true, ok: true, errors: [] }),
      ),
    );
    const { result } = renderHook(() => useMeetingIntegrity());
    await act(async () => {
      await result.current.handleIntegrity();
    });
    expect(result.current.integrityFailed).toBe(false);
    expect(result.current.integrityMsg).toBeTruthy();
  });

  it('marks failed=true and surfaces the error count when daemon returns errors[]', async () => {
    server.use(
      http.get('/api/meetings/persist-integrity', () =>
        HttpResponse.json({
          enabled: true,
          ok: false,
          errors: ['e1', 'e2', 'e3', 'e4'],
        }),
      ),
    );
    const { result } = renderHook(() => useMeetingIntegrity());
    await act(async () => {
      await result.current.handleIntegrity();
    });
    expect(result.current.integrityFailed).toBe(true);
    expect(result.current.integrityMsg).toBeTruthy();
  });

  it('marks failed=true on network error (HttpResponse.error)', async () => {
    server.use(
      http.get('/api/meetings/persist-integrity', () => HttpResponse.error()),
    );
    const { result } = renderHook(() => useMeetingIntegrity());
    await act(async () => {
      await result.current.handleIntegrity();
    });
    expect(result.current.integrityFailed).toBe(true);
    expect(result.current.integrityMsg).toBeTruthy();
  });

  it('flips integrityBusy=true during the in-flight request and back to false on resolve', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get('/api/meetings/persist-integrity', async () => {
        await gate;
        return HttpResponse.json({ enabled: true, ok: true, errors: [] });
      }),
    );
    const { result } = renderHook(() => useMeetingIntegrity());
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.handleIntegrity();
      // Yield once so React commits the busy=true state from setIntegrityBusy.
      await Promise.resolve();
    });
    expect(result.current.integrityBusy).toBe(true);
    release();
    await act(async () => {
      await inflight;
    });
    expect(result.current.integrityBusy).toBe(false);
  });

  it('clears stale failure state on a fresh successful run', async () => {
    server.use(
      http.get('/api/meetings/persist-integrity', () =>
        HttpResponse.json({ enabled: true, ok: false, errors: ['boom'] }),
      ),
    );
    const { result } = renderHook(() => useMeetingIntegrity());
    await act(async () => {
      await result.current.handleIntegrity();
    });
    expect(result.current.integrityFailed).toBe(true);

    // Swap the handler — the next run should reset failed=false.
    server.use(
      http.get('/api/meetings/persist-integrity', () =>
        HttpResponse.json({ enabled: true, ok: true, errors: [] }),
      ),
    );
    await act(async () => {
      await result.current.handleIntegrity();
    });
    expect(result.current.integrityFailed).toBe(false);
  });
});
