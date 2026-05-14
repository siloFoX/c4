import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook, waitFor } from '@testing-library/react';
import { server } from '../test/server';
import { useProfiles } from './use-profiles';

// useProfiles is the read-only loader for /api/profiles. Contract:
//   - mounts loading=true so the page can show a spinner
//   - happy path stores ProfilesResponse.profiles[] verbatim
//   - non-array response shape => items=[] (defensive fallback)
//   - HTTP error => items=[], error=Error.message, loading=false
//   - exposes refresh() for the eventual mutation-driven re-fetch
//   - refresh reference is stable (useCallback with no deps)

describe('useProfiles', () => {
  it('starts loading=true before the first fetch resolves', () => {
    const gate = new Promise<HttpResponse>(() => {
      // never resolves so the initial fetch hangs
    });
    server.use(
      http.get('/api/profiles', async () => {
        return gate;
      }),
    );
    const { result } = renderHook(() => useProfiles());
    expect(result.current.loading).toBe(true);
    expect(result.current.items).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('happy path: stores ProfilesResponse.profiles and flips loading=false', async () => {
    const profiles = [
      { name: 'web', description: 'web profile', allow: ['Read'] },
      { name: 'cli', description: 'cli profile', allow: ['Bash'] },
    ];
    server.use(
      http.get('/api/profiles', () =>
        HttpResponse.json({ profiles }),
      ),
    );
    const { result } = renderHook(() => useProfiles());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.items).toEqual(profiles);
    expect(result.current.error).toBeNull();
  });

  it('GETs /api/profiles exactly once on mount', async () => {
    let calls = 0;
    server.use(
      http.get('/api/profiles', () => {
        calls++;
        return HttpResponse.json({ profiles: [] });
      }),
    );
    renderHook(() => useProfiles());
    await waitFor(() => expect(calls).toBe(1));
    await new Promise((r) => setTimeout(r, 10));
    expect(calls).toBe(1);
  });

  it('error path: 500 sets items=[], error=truthy, loading=false', async () => {
    server.use(
      http.get('/api/profiles', () =>
        HttpResponse.json({ error: 'kaboom' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useProfiles());
    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });
    expect(result.current.items).toEqual([]);
    expect(result.current.error).toContain('HTTP 500');
    expect(result.current.loading).toBe(false);
  });

  it('falls back to [] when profiles field is missing from the response', async () => {
    server.use(
      http.get('/api/profiles', () => HttpResponse.json({})),
    );
    const { result } = renderHook(() => useProfiles());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('falls back to [] when profiles field is not an array (defensive)', async () => {
    server.use(
      http.get('/api/profiles', () =>
        HttpResponse.json({ profiles: 'not-an-array' }),
      ),
    );
    const { result } = renderHook(() => useProfiles());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toEqual([]);
  });

  it('preserves extra fields on each profile item (interface is open)', async () => {
    const profiles = [
      {
        name: 'web',
        description: 'web profile',
        allow: ['Read'],
        deny: ['Bash'],
        source: 'global',
        customField: 'preserved',
      },
    ];
    server.use(
      http.get('/api/profiles', () => HttpResponse.json({ profiles })),
    );
    const { result } = renderHook(() => useProfiles());
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(result.current.items[0]).toEqual(profiles[0]);
  });

  it('refresh() re-fetches and stores the latest payload', async () => {
    let calls = 0;
    server.use(
      http.get('/api/profiles', () => {
        calls++;
        return HttpResponse.json({
          profiles: [{ name: `p-${calls}` }],
        });
      }),
    );
    const { result } = renderHook(() => useProfiles());
    await waitFor(() => expect(result.current.items[0]?.name).toBe('p-1'));
    await act(async () => {
      await result.current.refresh();
    });
    expect(calls).toBe(2);
    expect(result.current.items[0]?.name).toBe('p-2');
  });

  it('flips loading=true around an in-flight refresh and back to false on success', async () => {
    server.use(
      http.get('/api/profiles', () => HttpResponse.json({ profiles: [] })),
    );
    const { result } = renderHook(() => useProfiles());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.get('/api/profiles', async () => {
        await gate;
        return HttpResponse.json({ profiles: [] });
      }),
    );
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.refresh();
      await Promise.resolve();
    });
    expect(result.current.loading).toBe(true);
    release();
    await act(async () => {
      await inflight;
    });
    expect(result.current.loading).toBe(false);
  });

  it('clears stale error before a fresh refresh', async () => {
    server.use(
      http.get('/api/profiles', () =>
        HttpResponse.json({ error: 'gone' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useProfiles());
    await waitFor(() => expect(result.current.error).toBeTruthy());
    server.use(
      http.get('/api/profiles', () => HttpResponse.json({ profiles: [] })),
    );
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.error).toBeNull();
    expect(result.current.items).toEqual([]);
  });

  it('refresh reference is stable across re-renders (useCallback has no deps)', () => {
    const { result, rerender } = renderHook(() => useProfiles());
    const first = result.current.refresh;
    rerender();
    expect(result.current.refresh).toBe(first);
  });

  it('refresh() can be called before the initial fetch settles without crashing', async () => {
    let calls = 0;
    server.use(
      http.get('/api/profiles', () => {
        calls++;
        return HttpResponse.json({ profiles: [{ name: `p-${calls}` }] });
      }),
    );
    const { result } = renderHook(() => useProfiles());
    await act(async () => {
      await result.current.refresh();
    });
    // At least the manual refresh fired; the mount fetch also fires.
    expect(calls).toBeGreaterThanOrEqual(1);
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('reverts items to [] on error even after a previous successful load', async () => {
    server.use(
      http.get('/api/profiles', () =>
        HttpResponse.json({ profiles: [{ name: 'web' }] }),
      ),
    );
    const { result } = renderHook(() => useProfiles());
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    server.use(
      http.get('/api/profiles', () =>
        HttpResponse.json({ error: 'dropped' }, { status: 503 }),
      ),
    );
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.items).toEqual([]);
    expect(result.current.error).toBeTruthy();
  });
});
