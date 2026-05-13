import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook, waitFor } from '@testing-library/react';
import { server } from '../test/server';
import { useWorkspaces } from './use-workspaces';

// useWorkspaces fetches /api/workspaces on mount and exposes
// { data, error, loading, refresh }. The refresh handle re-runs the
// fetch on demand. Both paths clear stale error state before the
// network call so a successful re-fetch unsticks a previous
// failure. data is null until the first fetch resolves.

function ws(name: string, exists = true, isGitRepo = true) {
  return { name, path: `/tmp/${name}`, exists, isGitRepo };
}

describe('useWorkspaces', () => {
  it('starts idle: data=null, error=null, loading=false, refresh is callable', async () => {
    server.use(
      http.get('/api/workspaces', () =>
        HttpResponse.json({ workspaces: [] }),
      ),
    );
    const { result } = renderHook(() => useWorkspaces());
    // The initial synchronous slot — before the effect resolves.
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    expect(typeof result.current.refresh).toBe('function');
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it('loads workspaces on mount from /api/workspaces', async () => {
    const payload = [ws('a'), ws('b')];
    server.use(
      http.get('/api/workspaces', () =>
        HttpResponse.json({ workspaces: payload }),
      ),
    );
    const { result } = renderHook(() => useWorkspaces());
    await waitFor(() => {
      expect(result.current.data).not.toBeNull();
    });
    expect(result.current.data).toEqual(payload);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('defaults data to [] when the response omits workspaces', async () => {
    server.use(
      http.get('/api/workspaces', () => HttpResponse.json({})),
    );
    const { result } = renderHook(() => useWorkspaces());
    await waitFor(() => {
      expect(result.current.data).toEqual([]);
    });
    expect(result.current.error).toBeNull();
  });

  it('error path: stores the HTTP message on a 500 response', async () => {
    server.use(
      http.get('/api/workspaces', () =>
        HttpResponse.json({ error: 'down' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useWorkspaces());
    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });
    expect(result.current.error).toContain('HTTP 500');
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('error path: handles 4xx the same way (still surfaces via error slot)', async () => {
    server.use(
      http.get('/api/workspaces', () =>
        HttpResponse.json({ error: 'forbidden' }, { status: 403 }),
      ),
    );
    const { result } = renderHook(() => useWorkspaces());
    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });
    expect(result.current.error).toContain('HTTP 403');
  });

  it('flips loading=true while in-flight then back to false', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.get('/api/workspaces', async () => {
        await gate;
        return HttpResponse.json({ workspaces: [ws('only')] });
      }),
    );
    const { result } = renderHook(() => useWorkspaces());
    await waitFor(() => {
      expect(result.current.loading).toBe(true);
    });
    release();
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.data).toEqual([ws('only')]);
  });

  it('loading returns to false even after an error', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.get('/api/workspaces', async () => {
        await gate;
        return HttpResponse.json({ error: 'no' }, { status: 503 });
      }),
    );
    const { result } = renderHook(() => useWorkspaces());
    await waitFor(() => {
      expect(result.current.loading).toBe(true);
    });
    release();
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.error).toBeTruthy();
  });

  it('refresh re-fetches and replaces data with the new response', async () => {
    let calls = 0;
    server.use(
      http.get('/api/workspaces', () => {
        calls++;
        const list = calls === 1 ? [ws('a')] : [ws('a'), ws('b')];
        return HttpResponse.json({ workspaces: list });
      }),
    );
    const { result } = renderHook(() => useWorkspaces());
    await waitFor(() => {
      expect(result.current.data).toHaveLength(1);
    });
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.data).toHaveLength(2);
    expect(calls).toBe(2);
  });

  it('refresh clears a prior error before the next attempt', async () => {
    // First fetch fails.
    server.use(
      http.get('/api/workspaces', () =>
        HttpResponse.json({ error: 'first' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useWorkspaces());
    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });

    // Second attempt: gated + happy. Mid-flight, error must already be
    // cleared by the refresh() prelude.
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.get('/api/workspaces', async () => {
        await gate;
        return HttpResponse.json({ workspaces: [ws('recovered')] });
      }),
    );
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.refresh();
      await Promise.resolve();
    });
    expect(result.current.error).toBeNull();
    release();
    await act(async () => {
      await inflight;
    });
    expect(result.current.data).toEqual([ws('recovered')]);
  });

  it('refresh resolves (does not reject) on a non-ok response', async () => {
    server.use(
      http.get('/api/workspaces', () =>
        HttpResponse.json({ error: 'no' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useWorkspaces());
    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });
    await expect(result.current.refresh()).resolves.toBeUndefined();
  });

  it('refresh is stable across renders that do not change deps', async () => {
    server.use(
      http.get('/api/workspaces', () =>
        HttpResponse.json({ workspaces: [] }),
      ),
    );
    const { result, rerender } = renderHook(() => useWorkspaces());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    const first = result.current.refresh;
    rerender();
    expect(result.current.refresh).toBe(first);
  });

  it('preserves the existing data shape (exists / isGitRepo) on the workspace entries', async () => {
    server.use(
      http.get('/api/workspaces', () =>
        HttpResponse.json({
          workspaces: [
            ws('present', true, true),
            ws('missing', false, false),
          ],
        }),
      ),
    );
    const { result } = renderHook(() => useWorkspaces());
    await waitFor(() => {
      expect(result.current.data).not.toBeNull();
    });
    expect(result.current.data?.[0]).toMatchObject({
      name: 'present',
      exists: true,
      isGitRepo: true,
    });
    expect(result.current.data?.[1]).toMatchObject({
      name: 'missing',
      exists: false,
      isGitRepo: false,
    });
  });
});
