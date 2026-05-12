import { describe, it, expect, vi, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook } from '@testing-library/react';
import { server } from '../test/server';
import { useEscalationResolve } from './use-escalation-resolve';
import type { Escalation } from './use-autonomous-digest';

afterEach(() => {
  vi.restoreAllMocks();
});

function makeEscalation(overrides: Partial<Escalation> = {}): Escalation {
  return {
    id: 1,
    todoId: null,
    reason: 'r',
    kind: 'k',
    suggestedAction: 's',
    status: 'pending',
    createdAt: 0,
    resolvedAt: null,
    resolvedAction: null,
    resolvedNote: null,
    ...overrides,
  };
}

describe('useEscalationResolve', () => {
  it('starts idle: resolveBusy=null, resolveError=null, resolveNotes={}', () => {
    const setEscalations = vi.fn();
    const { result } = renderHook(() =>
      useEscalationResolve({ setEscalations }),
    );
    expect(result.current.resolveBusy).toBeNull();
    expect(result.current.resolveError).toBeNull();
    expect(result.current.resolveNotes).toEqual({});
  });

  it('rejects modify action without a note (no fetch, no confirm prompt)', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    let calls = 0;
    server.use(
      http.post('/api/autonomous/escalations/:id', () => {
        calls++;
        return HttpResponse.json({ ok: true });
      }),
    );
    const setEscalations = vi.fn();
    const { result } = renderHook(() =>
      useEscalationResolve({ setEscalations }),
    );
    await act(async () => {
      await result.current.handleResolve(7, 'modify');
    });
    expect(calls).toBe(0);
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(result.current.resolveError).toBeTruthy();
    expect(setEscalations).not.toHaveBeenCalled();
    expect(result.current.resolveBusy).toBeNull();
  });

  it('rejects modify when the note is whitespace-only', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let calls = 0;
    server.use(
      http.post('/api/autonomous/escalations/:id', () => {
        calls++;
        return HttpResponse.json({ ok: true });
      }),
    );
    const setEscalations = vi.fn();
    const { result } = renderHook(() =>
      useEscalationResolve({ setEscalations }),
    );
    act(() => result.current.setResolveNotes({ 4: '   ' }));
    await act(async () => {
      await result.current.handleResolve(4, 'modify');
    });
    expect(calls).toBe(0);
    expect(result.current.resolveError).toBeTruthy();
  });

  it('skips POST when window.confirm is rejected', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    let calls = 0;
    server.use(
      http.post('/api/autonomous/escalations/:id', () => {
        calls++;
        return HttpResponse.json({ ok: true });
      }),
    );
    const setEscalations = vi.fn();
    const { result } = renderHook(() =>
      useEscalationResolve({ setEscalations }),
    );
    await act(async () => {
      await result.current.handleResolve(7, 'approve');
    });
    expect(calls).toBe(0);
    expect(result.current.resolveBusy).toBeNull();
    expect(setEscalations).not.toHaveBeenCalled();
  });

  it('POSTs /api/autonomous/escalations/<id> with body { action } when no note exists (happy path)', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let body: unknown = null;
    let path = '';
    server.use(
      http.post(
        '/api/autonomous/escalations/:id',
        async ({ request, params }) => {
          body = await request.json();
          path = `/api/autonomous/escalations/${params.id}`;
          return HttpResponse.json({ ok: true });
        },
      ),
    );
    const setEscalations = vi.fn();
    const { result } = renderHook(() =>
      useEscalationResolve({ setEscalations }),
    );
    await act(async () => {
      await result.current.handleResolve(42, 'approve');
    });
    expect(path).toBe('/api/autonomous/escalations/42');
    expect(body).toEqual({ action: 'approve' });
    expect(result.current.resolveError).toBeNull();
  });

  it('includes a trimmed note in the body and clears it from resolveNotes after success', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let body: { action?: string; note?: string } | null = null;
    server.use(
      http.post('/api/autonomous/escalations/:id', async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json({ ok: true });
      }),
    );
    const setEscalations = vi.fn();
    const { result } = renderHook(() =>
      useEscalationResolve({ setEscalations }),
    );
    act(() => result.current.setResolveNotes({ 7: '  needs follow-up  ' }));
    await act(async () => {
      await result.current.handleResolve(7, 'modify');
    });
    expect(body).toEqual({ action: 'modify', note: 'needs follow-up' });
    expect(result.current.resolveNotes[7]).toBeUndefined();
  });

  it('optimistically removes the resolved row via setEscalations(prev => filter)', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    server.use(
      http.post('/api/autonomous/escalations/:id', () =>
        HttpResponse.json({ ok: true }),
      ),
    );
    const setEscalations = vi.fn();
    const { result } = renderHook(() =>
      useEscalationResolve({ setEscalations }),
    );
    await act(async () => {
      await result.current.handleResolve(2, 'approve');
    });
    expect(setEscalations).toHaveBeenCalled();
    const lastCall = setEscalations.mock.calls.at(-1);
    const updater = lastCall?.[0] as (prev: Escalation[]) => Escalation[];
    expect(typeof updater).toBe('function');
    const prev = [
      makeEscalation({ id: 1 }),
      makeEscalation({ id: 2 }),
      makeEscalation({ id: 3 }),
    ];
    expect(updater(prev).map((e) => e.id)).toEqual([1, 3]);
  });

  it('surfaces resolveError on server failure and skips the optimistic remove', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    server.use(
      http.post('/api/autonomous/escalations/:id', () =>
        HttpResponse.json({ error: 'gone' }, { status: 404 }),
      ),
    );
    const setEscalations = vi.fn();
    const { result } = renderHook(() =>
      useEscalationResolve({ setEscalations }),
    );
    await act(async () => {
      await result.current.handleResolve(5, 'reject');
    });
    expect(result.current.resolveError).toBeTruthy();
    expect(setEscalations).not.toHaveBeenCalled();
    expect(result.current.resolveBusy).toBeNull();
  });

  it('flips resolveBusy=<id> while in-flight and back to null on resolve (release-gate)', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.post('/api/autonomous/escalations/:id', async () => {
        await gate;
        return HttpResponse.json({ ok: true });
      }),
    );
    const setEscalations = vi.fn();
    const { result } = renderHook(() =>
      useEscalationResolve({ setEscalations }),
    );
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.handleResolve(9, 'approve');
      await Promise.resolve();
    });
    expect(result.current.resolveBusy).toBe(9);
    release();
    await act(async () => {
      await inflight;
    });
    expect(result.current.resolveBusy).toBeNull();
  });

  it('exposes setResolveNotes so the parent textarea can write directly (value + updater forms)', () => {
    const setEscalations = vi.fn();
    const { result } = renderHook(() =>
      useEscalationResolve({ setEscalations }),
    );
    act(() => result.current.setResolveNotes({ 1: 'foo' }));
    expect(result.current.resolveNotes).toEqual({ 1: 'foo' });
    act(() =>
      result.current.setResolveNotes((prev) => ({ ...prev, 2: 'bar' })),
    );
    expect(result.current.resolveNotes).toEqual({ 1: 'foo', 2: 'bar' });
  });

  it('clears prior resolveError when a fresh resolve attempt succeeds', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    server.use(
      http.post('/api/autonomous/escalations/:id', () =>
        HttpResponse.json({ error: 'first' }, { status: 500 }),
      ),
    );
    const setEscalations = vi.fn();
    const { result } = renderHook(() =>
      useEscalationResolve({ setEscalations }),
    );
    await act(async () => {
      await result.current.handleResolve(1, 'approve');
    });
    expect(result.current.resolveError).toBeTruthy();

    server.use(
      http.post('/api/autonomous/escalations/:id', () =>
        HttpResponse.json({ ok: true }),
      ),
    );
    await act(async () => {
      await result.current.handleResolve(1, 'approve');
    });
    expect(result.current.resolveError).toBeNull();
  });
});
