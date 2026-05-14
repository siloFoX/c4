import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook, waitFor } from '@testing-library/react';
import { server } from '../test/server';
import { useTemplates } from './use-templates';

// useTemplates is the read-only loader for /api/templates. Contract:
//   - mounts loading=true so the page can show a spinner
//   - happy path stores TemplatesResponse.templates[] verbatim
//   - non-array response shape => items=[] (defensive fallback)
//   - HTTP error => items=[], error=Error.message, loading=false
//   - exposes refresh() for the eventual mutation-driven re-fetch
//   - refresh reference is stable (useCallback with no deps)

describe('useTemplates', () => {
  it('starts loading=true before the first fetch resolves', () => {
    const gate = new Promise<HttpResponse>(() => {
      // never resolves so the initial fetch hangs
    });
    server.use(
      http.get('/api/templates', async () => {
        return gate;
      }),
    );
    const { result } = renderHook(() => useTemplates());
    expect(result.current.loading).toBe(true);
    expect(result.current.items).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('happy path: stores TemplatesResponse.templates and flips loading=false', async () => {
    const templates = [
      { name: 'auto', description: 'auto template', model: 'opus' },
      { name: 'fast', description: 'fast template', model: 'sonnet' },
    ];
    server.use(
      http.get('/api/templates', () => HttpResponse.json({ templates })),
    );
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.items).toEqual(templates);
    expect(result.current.error).toBeNull();
  });

  it('GETs /api/templates exactly once on mount', async () => {
    let calls = 0;
    server.use(
      http.get('/api/templates', () => {
        calls++;
        return HttpResponse.json({ templates: [] });
      }),
    );
    renderHook(() => useTemplates());
    await waitFor(() => expect(calls).toBe(1));
    await new Promise((r) => setTimeout(r, 10));
    expect(calls).toBe(1);
  });

  it('error path: 500 sets items=[], error=truthy, loading=false', async () => {
    server.use(
      http.get('/api/templates', () =>
        HttpResponse.json({ error: 'kaboom' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });
    expect(result.current.items).toEqual([]);
    expect(result.current.error).toContain('HTTP 500');
    expect(result.current.loading).toBe(false);
  });

  it('falls back to [] when templates field is missing from the response', async () => {
    server.use(
      http.get('/api/templates', () => HttpResponse.json({})),
    );
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('falls back to [] when templates field is not an array (defensive)', async () => {
    server.use(
      http.get('/api/templates', () =>
        HttpResponse.json({ templates: 'not-an-array' }),
      ),
    );
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toEqual([]);
  });

  it('preserves the full TemplateItem shape (open interface) including effort/profile/source', async () => {
    const templates = [
      {
        name: 'auto',
        description: 'auto template',
        model: 'opus',
        effort: 'max',
        profile: 'web',
        source: 'global',
        extra: 'preserved',
      },
    ];
    server.use(
      http.get('/api/templates', () => HttpResponse.json({ templates })),
    );
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(result.current.items[0]).toEqual(templates[0]);
  });

  it('refresh() re-fetches and stores the latest payload', async () => {
    let calls = 0;
    server.use(
      http.get('/api/templates', () => {
        calls++;
        return HttpResponse.json({
          templates: [{ name: `t-${calls}` }],
        });
      }),
    );
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => expect(result.current.items[0]?.name).toBe('t-1'));
    await act(async () => {
      await result.current.refresh();
    });
    expect(calls).toBe(2);
    expect(result.current.items[0]?.name).toBe('t-2');
  });

  it('flips loading=true around an in-flight refresh and back to false on success', async () => {
    server.use(
      http.get('/api/templates', () => HttpResponse.json({ templates: [] })),
    );
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.get('/api/templates', async () => {
        await gate;
        return HttpResponse.json({ templates: [] });
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
      http.get('/api/templates', () =>
        HttpResponse.json({ error: 'gone' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => expect(result.current.error).toBeTruthy());
    server.use(
      http.get('/api/templates', () => HttpResponse.json({ templates: [] })),
    );
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.error).toBeNull();
    expect(result.current.items).toEqual([]);
  });

  it('refresh reference is stable across re-renders (useCallback has no deps)', () => {
    const { result, rerender } = renderHook(() => useTemplates());
    const first = result.current.refresh;
    rerender();
    expect(result.current.refresh).toBe(first);
  });

  it('reverts items to [] on error even after a previous successful load', async () => {
    server.use(
      http.get('/api/templates', () =>
        HttpResponse.json({ templates: [{ name: 'auto' }] }),
      ),
    );
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    server.use(
      http.get('/api/templates', () =>
        HttpResponse.json({ error: 'dropped' }, { status: 503 }),
      ),
    );
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.items).toEqual([]);
    expect(result.current.error).toBeTruthy();
  });

  it('handles an empty templates array as a valid (not error) response', async () => {
    server.use(
      http.get('/api/templates', () => HttpResponse.json({ templates: [] })),
    );
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toEqual([]);
    expect(result.current.error).toBeNull();
  });
});
