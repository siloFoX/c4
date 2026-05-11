import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderHook, waitFor } from '@testing-library/react';
import { server } from '../test/server';
import { useSpecialistEnrichment } from './use-specialist-enrichment';

// useSpecialistEnrichment hits GET /api/specialists/:id?include=audit,meetings
// when `selectedId` flips truthy, threads cancel-on-id-change through the
// effect, silently nulls on failure, and resets to null when the selection
// clears. We cover each of those branches plus the encodeURIComponent on the
// id and the per-field projection (only recentAudit / only recentMeetings).

describe('useSpecialistEnrichment', () => {
  it('returns null and does not fetch when selectedId is null', async () => {
    let calls = 0;
    server.use(
      http.get('/api/specialists/:id', () => {
        calls++;
        return HttpResponse.json({});
      }),
    );
    const { result } = renderHook(() => useSpecialistEnrichment(null));
    expect(result.current).toBeNull();
    // Yield so any (none-expected) effects can fire.
    await new Promise((r) => setTimeout(r, 50));
    expect(calls).toBe(0);
    expect(result.current).toBeNull();
  });

  it('returns null and does not fetch when selectedId is the empty string (falsy guard)', async () => {
    let calls = 0;
    server.use(
      http.get('/api/specialists/:id', () => {
        calls++;
        return HttpResponse.json({});
      }),
    );
    const { result } = renderHook(() => useSpecialistEnrichment(''));
    await new Promise((r) => setTimeout(r, 50));
    expect(calls).toBe(0);
    expect(result.current).toBeNull();
  });

  it('fetches /api/specialists/:id?include=audit,meetings for the selected id', async () => {
    let path = '';
    let query = '';
    server.use(
      http.get('/api/specialists/:id', ({ request }) => {
        const url = new URL(request.url);
        path = url.pathname;
        query = url.search;
        return HttpResponse.json({
          recentAudit: [{ ts: 't1', action: 'created' }],
          recentMeetings: [
            {
              id: 'm1',
              status: 'completed',
              title: 'Retro',
              track: 'standard',
              createdAt: '2026-05-11T00:00:00.000Z',
              completedAt: '2026-05-11T01:00:00.000Z',
            },
          ],
        });
      }),
    );
    const { result } = renderHook(() => useSpecialistEnrichment('spec-1'));
    await waitFor(() => {
      expect(result.current).not.toBeNull();
    });
    expect(path).toBe('/api/specialists/spec-1');
    expect(query).toBe('?include=audit,meetings');
    expect(result.current?.recentAudit).toHaveLength(1);
    expect(result.current?.recentAudit?.[0]?.action).toBe('created');
    expect(result.current?.recentMeetings?.[0]?.id).toBe('m1');
  });

  it('URL-encodes the selectedId in the request path', async () => {
    let path = '';
    server.use(
      http.get('/api/specialists/:id', ({ request }) => {
        path = new URL(request.url).pathname;
        return HttpResponse.json({});
      }),
    );
    renderHook(() => useSpecialistEnrichment('a/b c#x'));
    await waitFor(() => {
      expect(path).not.toBe('');
    });
    // encodeURIComponent: '/' -> '%2F', ' ' -> '%20', '#' -> '%23'.
    expect(path).toContain('a%2Fb%20c%23x');
  });

  it('silently nulls when the request fails (5xx response)', async () => {
    server.use(
      http.get('/api/specialists/:id', () =>
        HttpResponse.json({ error: 'gone' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useSpecialistEnrichment('spec-fail'));
    // No throw, no toast — just stay null after the in-flight rejects.
    await new Promise((r) => setTimeout(r, 200));
    expect(result.current).toBeNull();
  });

  it('projects only the fields present on the response (recentAudit only)', async () => {
    server.use(
      http.get('/api/specialists/:id', () =>
        HttpResponse.json({ recentAudit: [{ ts: 't1', action: 'noted' }] }),
      ),
    );
    const { result } = renderHook(() => useSpecialistEnrichment('spec-2'));
    await waitFor(() => {
      expect(result.current).not.toBeNull();
    });
    expect(result.current?.recentAudit).toHaveLength(1);
    // recentMeetings was undefined on the server response — not projected.
    expect('recentMeetings' in (result.current ?? {})).toBe(false);
  });

  it('projects only the fields present on the response (recentMeetings only)', async () => {
    server.use(
      http.get('/api/specialists/:id', () =>
        HttpResponse.json({
          recentMeetings: [
            {
              id: 'm9',
              status: 'pending',
              title: 'Plan',
              track: 'fast',
              createdAt: '2026-05-11T00:00:00.000Z',
              completedAt: null,
            },
          ],
        }),
      ),
    );
    const { result } = renderHook(() => useSpecialistEnrichment('spec-3'));
    await waitFor(() => {
      expect(result.current).not.toBeNull();
    });
    expect(result.current?.recentMeetings?.[0]?.id).toBe('m9');
    expect('recentAudit' in (result.current ?? {})).toBe(false);
  });

  it('returns an empty object when both audit and meetings are absent on the response', async () => {
    server.use(
      http.get('/api/specialists/:id', () => HttpResponse.json({})),
    );
    const { result } = renderHook(() => useSpecialistEnrichment('spec-4'));
    await waitFor(() => {
      expect(result.current).not.toBeNull();
    });
    expect(result.current).toEqual({});
  });

  it('re-fetches when selectedId changes and surfaces the new payload', async () => {
    server.use(
      http.get('/api/specialists/:id', ({ params }) =>
        HttpResponse.json({
          recentAudit: [{ ts: 't', action: `for-${params.id}` }],
        }),
      ),
    );
    const { result, rerender } = renderHook(
      ({ id }: { id: string | null }) => useSpecialistEnrichment(id),
      { initialProps: { id: 'first' } },
    );
    await waitFor(() => {
      expect(result.current?.recentAudit?.[0]?.action).toBe('for-first');
    });
    rerender({ id: 'second' });
    await waitFor(() => {
      expect(result.current?.recentAudit?.[0]?.action).toBe('for-second');
    });
  });

  it('resets to null when the selection is cleared (id flips to null)', async () => {
    server.use(
      http.get('/api/specialists/:id', () =>
        HttpResponse.json({ recentAudit: [{ ts: 't', action: 'a' }] }),
      ),
    );
    const { result, rerender } = renderHook(
      ({ id }: { id: string | null }) => useSpecialistEnrichment(id),
      { initialProps: { id: 'spec-x' } },
    );
    await waitFor(() => {
      expect(result.current).not.toBeNull();
    });
    rerender({ id: null });
    // The id=null branch is synchronous (setEnrichment(null) + early return)
    // so the next commit reads null without waiting on a fetch.
    await waitFor(() => {
      expect(result.current).toBeNull();
    });
  });
});
