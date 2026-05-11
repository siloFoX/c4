import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderHook, waitFor } from '@testing-library/react';
import { server } from '../test/server';
import { useAttachProcessState } from './use-attach-process-state';

// useAttachProcessState polls GET /api/attach/:name/process every 30s.
// We exercise the request path with real timers + MSW (fake timers +
// RTL waitFor do not compose cleanly under vitest — see use-health.test.ts).
// Polling cadence and unmount cleanup are covered via setInterval /
// clearInterval spies.

describe('useAttachProcessState', () => {
  it('starts in the loading slot before the first response lands', () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get('/api/attach/:name/process', async () => {
        await gate;
        return HttpResponse.json({ alive: false });
      }),
    );
    try {
      const { result } = renderHook(() =>
        useAttachProcessState({ name: 'foo' }),
      );
      expect(result.current).toEqual({ status: 'loading' });
    } finally {
      release();
    }
  });

  it('surfaces every payload field when alive=true with a numeric pid', async () => {
    server.use(
      http.get('/api/attach/:name/process', () =>
        HttpResponse.json({
          alive: true,
          pid: 4242,
          cwd: '/home/op/proj',
          match: 'cwd',
          multipleCandidates: true,
        }),
      ),
    );
    const { result } = renderHook(() =>
      useAttachProcessState({ name: 'foo' }),
    );
    await waitFor(() => {
      expect(result.current.status).toBe('alive');
    });
    expect(result.current).toEqual({
      status: 'alive',
      pid: 4242,
      cwd: '/home/op/proj',
      match: 'cwd',
      multipleCandidates: true,
    });
  });

  it('fills cwd=null / match=fd / multipleCandidates=false when the daemon omits them', async () => {
    server.use(
      http.get('/api/attach/:name/process', () =>
        HttpResponse.json({ alive: true, pid: 7 }),
      ),
    );
    const { result } = renderHook(() =>
      useAttachProcessState({ name: 'foo' }),
    );
    await waitFor(() => {
      expect(result.current.status).toBe('alive');
    });
    expect(result.current).toEqual({
      status: 'alive',
      pid: 7,
      cwd: null,
      match: 'fd',
      multipleCandidates: false,
    });
  });

  it('collapses to the idle slot when alive=false', async () => {
    server.use(
      http.get('/api/attach/:name/process', () =>
        HttpResponse.json({ alive: false }),
      ),
    );
    const { result } = renderHook(() =>
      useAttachProcessState({ name: 'foo' }),
    );
    await waitFor(() => {
      expect(result.current.status).toBe('idle');
    });
  });

  // The hook gates on `data.alive && typeof data.pid === 'number'` —
  // a truthy alive flag without a numeric pid falls through to idle
  // rather than producing an alive slot with a NaN pid.
  it('falls through to idle when alive=true but pid is missing', async () => {
    server.use(
      http.get('/api/attach/:name/process', () =>
        HttpResponse.json({ alive: true }),
      ),
    );
    const { result } = renderHook(() =>
      useAttachProcessState({ name: 'foo' }),
    );
    await waitFor(() => {
      expect(result.current.status).toBe('idle');
    });
  });

  it('surfaces an error slot with the thrown HTTP message on server failure', async () => {
    server.use(
      http.get('/api/attach/:name/process', () =>
        HttpResponse.json({ error: 'procfs denied' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() =>
      useAttachProcessState({ name: 'foo' }),
    );
    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });
    if (result.current.status === 'error') {
      expect(result.current.message).toMatch(/HTTP 500/);
    }
  });

  it('URL-encodes the name when building /api/attach/<name>/process', async () => {
    let capturedPath = '';
    server.use(
      // MSW decodes :name when populating params, so we read the raw
      // pathname off the request URL to keep the %2F / %20 evidence.
      http.get('/api/attach/:name/process', ({ request }) => {
        capturedPath = new URL(request.url).pathname;
        return HttpResponse.json({ alive: false });
      }),
    );
    const { result } = renderHook(() =>
      useAttachProcessState({ name: 'a/b c' }),
    );
    await waitFor(() => {
      expect(result.current.status).toBe('idle');
    });
    expect(capturedPath).toBe('/api/attach/a%2Fb%20c/process');
  });

  it('stays in the loading slot until the in-flight GET resolves', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get('/api/attach/:name/process', async () => {
        await gate;
        return HttpResponse.json({ alive: true, pid: 1 });
      }),
    );
    const { result } = renderHook(() =>
      useAttachProcessState({ name: 'foo' }),
    );
    expect(result.current).toEqual({ status: 'loading' });
    await Promise.resolve();
    expect(result.current.status).toBe('loading');
    release();
    await waitFor(() => {
      expect(result.current.status).toBe('alive');
    });
  });

  it('polls /api/attach/:name/process at the documented 30s cadence', () => {
    const setIntervalSpy = vi.spyOn(global, 'setInterval');
    try {
      renderHook(() => useAttachProcessState({ name: 'foo' }));
      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 30000);
    } finally {
      setIntervalSpy.mockRestore();
    }
  });

  it('clears the polling interval on unmount', () => {
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
    try {
      const { unmount } = renderHook(() =>
        useAttachProcessState({ name: 'foo' }),
      );
      unmount();
      expect(clearIntervalSpy).toHaveBeenCalled();
    } finally {
      clearIntervalSpy.mockRestore();
    }
  });

  it('refetches when name changes and the cancelled guard drops the stale alive response', async () => {
    const seenNames: string[] = [];
    let releaseFirst: () => void = () => {};
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    server.use(
      http.get('/api/attach/:name/process', async ({ params }) => {
        const n = String(params.name);
        seenNames.push(n);
        if (n === 'a') {
          await firstGate;
          return HttpResponse.json({ alive: true, pid: 1 });
        }
        return HttpResponse.json({ alive: false });
      }),
    );
    const { result, rerender } = renderHook(
      ({ name }) => useAttachProcessState({ name }),
      { initialProps: { name: 'a' } },
    );
    expect(result.current.status).toBe('loading');
    rerender({ name: 'b' });
    await waitFor(() => {
      expect(result.current.status).toBe('idle');
    });
    // Release the first request only AFTER the second has settled.
    // Its late 'alive' response must NOT stamp back over the new
    // name's terminal state — that is the cancelled-guard contract.
    releaseFirst();
    await new Promise((r) => setTimeout(r, 30));
    expect(result.current.status).toBe('idle');
    expect(seenNames).toEqual(['a', 'b']);
  });
});
