import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderHook, waitFor } from '@testing-library/react';
import { server } from '../test/server';
import { useMeetingEnrichment } from './use-meeting-enrichment';

type Args = Parameters<typeof useMeetingEnrichment>[0];

function makeDetail(turnCounts: number[] = []): Args['detail'] {
  // MeetingDetail-shaped fixture; only `transcripts` matters for the
  // hook's turnsTotal memo.
  return {
    transcripts: turnCounts.map((n) => Array.from({ length: n }, (_, i) => ({ i }))),
  } as unknown as Args['detail'];
}

describe('useMeetingEnrichment', () => {
  it('returns all-null when selectedId is null (no fetch)', async () => {
    let calls = 0;
    server.use(
      http.get('/api/meetings/:id/lineage', () => {
        calls++;
        return HttpResponse.json({ chain: [] });
      }),
      http.get('/api/meetings/:id/action-items', () => {
        calls++;
        return HttpResponse.json({ items: [] });
      }),
      http.get('/api/meetings/:id/recap', () => {
        calls++;
        return HttpResponse.json({ recap: '' });
      }),
    );
    const { result } = renderHook(() =>
      useMeetingEnrichment({ selectedId: null, detail: null }),
    );
    expect(result.current.lineage).toBeNull();
    expect(result.current.actions).toBeNull();
    expect(result.current.recap).toBeNull();
    // Yield once so any (none-expected) effects can run.
    await new Promise((r) => setTimeout(r, 50));
    expect(calls).toBe(0);
  });

  it('fetches lineage + action-items + recap for the selected meeting', async () => {
    const seen = new Set<string>();
    server.use(
      http.get('/api/meetings/:id/lineage', ({ params }) => {
        seen.add(`lineage:${params.id}`);
        return HttpResponse.json({ chain: [{ id: 'm1' }] });
      }),
      http.get('/api/meetings/:id/action-items', ({ params }) => {
        seen.add(`actions:${params.id}`);
        return HttpResponse.json({ items: [{ text: 'do x', owner: 'a' }] });
      }),
      http.get('/api/meetings/:id/recap', ({ params }) => {
        seen.add(`recap:${params.id}`);
        return HttpResponse.json({ recap: 'short summary' });
      }),
    );
    const { result } = renderHook(() =>
      useMeetingEnrichment({ selectedId: 'm1', detail: makeDetail([2]) }),
    );
    await waitFor(() => {
      expect(result.current.lineage).not.toBeNull();
      expect(result.current.actions).not.toBeNull();
      expect(result.current.recap).not.toBeNull();
    });
    expect(seen.has('lineage:m1')).toBe(true);
    expect(seen.has('actions:m1')).toBe(true);
    expect(seen.has('recap:m1')).toBe(true);
  });

  it('URL-encodes the meeting id in every enrichment fetch', async () => {
    const paths = new Set<string>();
    server.use(
      http.get('/api/meetings/:id/lineage', ({ request }) => {
        paths.add(new URL(request.url).pathname);
        return HttpResponse.json({ chain: [] });
      }),
      http.get('/api/meetings/:id/action-items', ({ request }) => {
        paths.add(new URL(request.url).pathname);
        return HttpResponse.json({ items: [] });
      }),
      http.get('/api/meetings/:id/recap', ({ request }) => {
        paths.add(new URL(request.url).pathname);
        return HttpResponse.json({ recap: '' });
      }),
    );
    renderHook(() =>
      useMeetingEnrichment({ selectedId: 'a/b c', detail: makeDetail() }),
    );
    await waitFor(() => {
      expect(paths.size).toBe(3);
    });
    for (const p of paths) expect(p).toContain('a%2Fb%20c');
  });

  it('silently nulls lineage / actions / recap on individual fetch failure', async () => {
    server.use(
      http.get('/api/meetings/:id/lineage', () =>
        HttpResponse.json({ error: 'down' }, { status: 500 }),
      ),
      http.get('/api/meetings/:id/action-items', () =>
        HttpResponse.json({ error: 'down' }, { status: 500 }),
      ),
      http.get('/api/meetings/:id/recap', () =>
        HttpResponse.json({ error: 'down' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() =>
      useMeetingEnrichment({ selectedId: 'm1', detail: makeDetail() }),
    );
    // No hard error path — wait a beat and confirm everything stays null.
    await new Promise((r) => setTimeout(r, 200));
    expect(result.current.lineage).toBeNull();
    expect(result.current.actions).toBeNull();
    expect(result.current.recap).toBeNull();
  });

  it('re-fetches action-items + recap when transcript turn count changes', async () => {
    const counts = { actions: 0, recap: 0, lineage: 0 };
    server.use(
      http.get('/api/meetings/:id/lineage', () => {
        counts.lineage++;
        return HttpResponse.json({ chain: [] });
      }),
      http.get('/api/meetings/:id/action-items', () => {
        counts.actions++;
        return HttpResponse.json({ items: [{ text: `r${counts.actions}` }] });
      }),
      http.get('/api/meetings/:id/recap', () => {
        counts.recap++;
        return HttpResponse.json({ recap: `r${counts.recap}` });
      }),
    );
    const { result, rerender } = renderHook(
      ({ d }: { d: Args['detail'] }) =>
        useMeetingEnrichment({ selectedId: 'm1', detail: d }),
      { initialProps: { d: makeDetail([1]) } },
    );
    await waitFor(() => {
      expect(counts.actions).toBe(1);
      expect(counts.recap).toBe(1);
    });
    expect(counts.lineage).toBe(1);
    rerender({ d: makeDetail([1, 2]) }); // turnsTotal: 1 → 3
    await waitFor(() => {
      expect(counts.actions).toBe(2);
      expect(counts.recap).toBe(2);
    });
    // Lineage does NOT re-fetch on transcript change — selectedId only.
    expect(counts.lineage).toBe(1);
    expect(result.current.actions).not.toBeNull();
  });

  it('treats a null detail as turnsTotal=0 (no NPE)', async () => {
    server.use(
      http.get('/api/meetings/:id/lineage', () =>
        HttpResponse.json({ chain: [] }),
      ),
      http.get('/api/meetings/:id/action-items', () =>
        HttpResponse.json({ items: [] }),
      ),
      http.get('/api/meetings/:id/recap', () =>
        HttpResponse.json({ recap: '' }),
      ),
    );
    const { result } = renderHook(() =>
      useMeetingEnrichment({ selectedId: 'm1', detail: null }),
    );
    await waitFor(() => {
      expect(result.current.actions).not.toBeNull();
      expect(result.current.recap).not.toBeNull();
    });
  });
});
