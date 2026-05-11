import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook } from '@testing-library/react';
import { server } from '../test/server';
import { useMeetingFtsRebuild } from './use-meeting-fts-rebuild';

describe('useMeetingFtsRebuild', () => {
  it('starts idle: not busy, no msg, not failed', () => {
    const { result } = renderHook(() => useMeetingFtsRebuild());
    expect(result.current.ftsBusy).toBe(false);
    expect(result.current.ftsMsg).toBeNull();
    expect(result.current.ftsFailed).toBe(false);
  });

  it('reports a success message after a 2xx rebuild', async () => {
    server.use(
      http.post('/api/meetings/fts-rebuild', () =>
        HttpResponse.json({ indexed: 12, before: 100, after: 112 }),
      ),
    );
    const { result } = renderHook(() => useMeetingFtsRebuild());
    await act(async () => {
      await result.current.handleFtsRebuild();
    });
    expect(result.current.ftsBusy).toBe(false);
    expect(result.current.ftsFailed).toBe(false);
    expect(result.current.ftsMsg).toBeTruthy();
  });

  it('marks failed=true on server error', async () => {
    server.use(
      http.post('/api/meetings/fts-rebuild', () =>
        HttpResponse.json({ error: 'boom' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useMeetingFtsRebuild());
    await act(async () => {
      await result.current.handleFtsRebuild();
    });
    expect(result.current.ftsBusy).toBe(false);
    expect(result.current.ftsFailed).toBe(true);
    expect(result.current.ftsMsg).toBeTruthy();
  });

  it('marks failed=true on network error (HttpResponse.error)', async () => {
    server.use(
      http.post('/api/meetings/fts-rebuild', () => HttpResponse.error()),
    );
    const { result } = renderHook(() => useMeetingFtsRebuild());
    await act(async () => {
      await result.current.handleFtsRebuild();
    });
    expect(result.current.ftsFailed).toBe(true);
    expect(result.current.ftsMsg).toBeTruthy();
  });

  it('flips ftsBusy=true during the in-flight request and back to false on resolve', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.post('/api/meetings/fts-rebuild', async () => {
        await gate;
        return HttpResponse.json({ indexed: 0, before: 0, after: 0 });
      }),
    );
    const { result } = renderHook(() => useMeetingFtsRebuild());
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.handleFtsRebuild();
      await Promise.resolve();
    });
    expect(result.current.ftsBusy).toBe(true);
    release();
    await act(async () => {
      await inflight;
    });
    expect(result.current.ftsBusy).toBe(false);
  });

  it('clears stale failure state on a fresh successful run', async () => {
    server.use(
      http.post('/api/meetings/fts-rebuild', () =>
        HttpResponse.json({ error: 'first' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useMeetingFtsRebuild());
    await act(async () => {
      await result.current.handleFtsRebuild();
    });
    expect(result.current.ftsFailed).toBe(true);
    server.use(
      http.post('/api/meetings/fts-rebuild', () =>
        HttpResponse.json({ indexed: 1, before: 0, after: 1 }),
      ),
    );
    await act(async () => {
      await result.current.handleFtsRebuild();
    });
    expect(result.current.ftsFailed).toBe(false);
  });
});
