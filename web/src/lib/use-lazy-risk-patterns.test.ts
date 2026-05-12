import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderHook, waitFor } from '@testing-library/react';
import { server } from '../test/server';
import { useLazyRiskPatterns } from './use-lazy-risk-patterns';

// useLazyRiskPatterns owns the GET /api/risk/patterns lazy fetch
// triggered the first time `open` flips true. The hook caches the
// response state across re-renders so subsequent opens are no-ops,
// and silently swallows errors (panel just stays empty).

function makeResponse() {
  return {
    builtin: {
      critical: [{ code: 'rm-rf', label: 'rm -rf' }],
      high: [],
      medium: [],
    },
    custom: { critical: [], high: [], medium: [] },
    counts: {
      builtin: { critical: 1, high: 0, medium: 0, total: 1 },
      custom: { critical: 0, high: 0, medium: 0, total: 0 },
    },
    allowList: 0,
    denyList: 0,
  };
}

describe('useLazyRiskPatterns', () => {
  it('returns null in the idle initial state when open=false', () => {
    const { result } = renderHook(() => useLazyRiskPatterns({ open: false }));
    expect(result.current).toBeNull();
  });

  it('skips the fetch entirely while open stays false', async () => {
    let calls = 0;
    server.use(
      http.get('/api/risk/patterns', () => {
        calls++;
        return HttpResponse.json(makeResponse());
      }),
    );
    const { result } = renderHook(() => useLazyRiskPatterns({ open: false }));
    await new Promise((r) => setTimeout(r, 50));
    expect(calls).toBe(0);
    expect(result.current).toBeNull();
  });

  it('fetches /api/risk/patterns the first time open flips true', async () => {
    let path = '';
    server.use(
      http.get('/api/risk/patterns', ({ request }) => {
        path = new URL(request.url).pathname;
        return HttpResponse.json(makeResponse());
      }),
    );
    const { result, rerender } = renderHook(
      ({ open }: { open: boolean }) => useLazyRiskPatterns({ open }),
      { initialProps: { open: false } },
    );
    expect(result.current).toBeNull();
    rerender({ open: true });
    await waitFor(() => {
      expect(result.current).not.toBeNull();
    });
    expect(path).toBe('/api/risk/patterns');
    expect(result.current?.counts.builtin.total).toBe(1);
  });

  it('does not refetch on subsequent opens once patterns are cached', async () => {
    let calls = 0;
    server.use(
      http.get('/api/risk/patterns', () => {
        calls++;
        return HttpResponse.json(makeResponse());
      }),
    );
    const { result, rerender } = renderHook(
      ({ open }: { open: boolean }) => useLazyRiskPatterns({ open }),
      { initialProps: { open: true } },
    );
    await waitFor(() => {
      expect(result.current).not.toBeNull();
    });
    expect(calls).toBe(1);
    rerender({ open: false });
    rerender({ open: true });
    await new Promise((r) => setTimeout(r, 50));
    expect(calls).toBe(1);
  });

  it('silently swallows server errors and keeps patterns null', async () => {
    server.use(
      http.get('/api/risk/patterns', () =>
        HttpResponse.json({ error: 'down' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useLazyRiskPatterns({ open: true }));
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current).toBeNull();
  });

  it('exposes the parsed PatternsResponse shape on success', async () => {
    const payload = makeResponse();
    server.use(
      http.get('/api/risk/patterns', () => HttpResponse.json(payload)),
    );
    const { result } = renderHook(() => useLazyRiskPatterns({ open: true }));
    await waitFor(() => {
      expect(result.current).not.toBeNull();
    });
    expect(result.current?.builtin.critical[0]?.code).toBe('rm-rf');
    expect(result.current?.allowList).toBe(0);
    expect(result.current?.denyList).toBe(0);
  });
});
