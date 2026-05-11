import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook, waitFor } from '@testing-library/react';
import { server } from '../test/server';
import { useChatBackfill } from './use-chat-backfill';
import type { ChatMessage } from './chat-helpers';

type Args = Parameters<typeof useChatBackfill>[0];

const NOOP_RESET = () => {};

function makeArgs(overrides: Partial<Args> = {}): Args {
  return {
    workerName: 'w1',
    liveMessages: [],
    onResetExtras: NOOP_RESET,
    ...overrides,
  };
}

function sessionResp(turns: Array<{ id: string; role: string; content: string }>) {
  return {
    sessionId: 's1',
    conversation: {
      sessionId: 's1',
      turns: turns.map((t) => ({
        ...t,
        createdAt: '2026-05-11T00:00:00.000Z',
        toolName: null,
      })),
    },
    workerName: 'w1',
  };
}

function makeLive(text: string, id: string): ChatMessage {
  return { id, role: 'user', text, ts: 0, source: 'live' };
}

describe('useChatBackfill', () => {
  it('starts with loading=true and empty history while the first fetch is in flight', () => {
    server.use(
      http.get('/api/sessions', () =>
        HttpResponse.json({ sessionId: null, conversation: null }),
      ),
      http.get('/api/scrollback', () =>
        HttpResponse.json({ content: '', lines: 0, totalScrollback: 0 }),
      ),
    );
    const { result } = renderHook(() => useChatBackfill(makeArgs()));
    expect(result.current.backfillLoading).toBe(true);
    expect(result.current.history).toEqual([]);
    expect(result.current.backfillCount).toBe(0);
    expect(result.current.backfillSource).toBeNull();
    expect(result.current.backfillError).toBeNull();
    expect(result.current.hasOlder).toBe(false);
    expect(result.current.loadingOlder).toBe(false);
    // Page counter starts at SCROLLBACK_PAGE.
    expect(result.current.scrollbackLinesRef.current).toBe(2000);
    // Refs initialize empty.
    expect(result.current.seenIdsRef.current.size).toBe(0);
    expect(result.current.seenTextsRef.current.size).toBe(0);
    expect(result.current.backfillReadyRef.current).toBe(false);
  });

  it('GET /api/sessions URL contains URL-encoded workerName', async () => {
    let qs = '';
    server.use(
      http.get('/api/sessions', ({ request }) => {
        qs = new URL(request.url).search;
        return HttpResponse.json({ sessionId: null, conversation: null });
      }),
      http.get('/api/scrollback', () =>
        HttpResponse.json({ content: '', lines: 0, totalScrollback: 0 }),
      ),
    );
    renderHook(() => useChatBackfill(makeArgs({ workerName: 'a/b c' })));
    await waitFor(() => {
      expect(qs).toContain('workerName=a%2Fb%20c');
    });
  });

  it('session path: when conversation has turns, source=session, history populated, hasOlder=false', async () => {
    server.use(
      http.get('/api/sessions', () =>
        HttpResponse.json(
          sessionResp([
            { id: 't1', role: 'user', content: 'hello' },
            { id: 't2', role: 'assistant', content: 'hi back' },
          ]),
        ),
      ),
    );
    const { result } = renderHook(() => useChatBackfill(makeArgs()));
    await waitFor(() => {
      expect(result.current.backfillLoading).toBe(false);
    });
    expect(result.current.backfillSource).toBe('session');
    expect(result.current.history).toHaveLength(2);
    expect(result.current.backfillCount).toBe(2);
    expect(result.current.hasOlder).toBe(false);
    expect(result.current.backfillError).toBeNull();
    expect(result.current.backfillReadyRef.current).toBe(true);
    // Session-path messages are mirrored into both dedup refs.
    expect(result.current.seenIdsRef.current.has('t1')).toBe(true);
    expect(result.current.seenIdsRef.current.has('t2')).toBe(true);
    expect(result.current.seenTextsRef.current.has('hello')).toBe(true);
    expect(result.current.seenTextsRef.current.has('hi back')).toBe(true);
  });

  it('falls through to scrollback when conversation is null', async () => {
    let scrollbackHit = false;
    server.use(
      http.get('/api/sessions', () =>
        HttpResponse.json({ sessionId: null, conversation: null }),
      ),
      http.get('/api/scrollback', () => {
        scrollbackHit = true;
        return HttpResponse.json({
          content: '> ask\nworker reply',
          lines: 2000,
          totalScrollback: 2000,
        });
      }),
    );
    const { result } = renderHook(() => useChatBackfill(makeArgs()));
    await waitFor(() => {
      expect(result.current.backfillLoading).toBe(false);
    });
    expect(scrollbackHit).toBe(true);
    expect(result.current.backfillSource).toBe('scrollback');
    expect(result.current.history.length).toBeGreaterThan(0);
  });

  it('falls through to scrollback when turns array is empty', async () => {
    let scrollbackHit = false;
    server.use(
      http.get('/api/sessions', () =>
        HttpResponse.json({
          sessionId: 's1',
          conversation: { sessionId: 's1', turns: [] },
        }),
      ),
      http.get('/api/scrollback', () => {
        scrollbackHit = true;
        return HttpResponse.json({
          content: '',
          lines: 0,
          totalScrollback: 0,
        });
      }),
    );
    renderHook(() => useChatBackfill(makeArgs()));
    await waitFor(() => {
      expect(scrollbackHit).toBe(true);
    });
  });

  it('scrollback URL carries workerName + current page size as lines=', async () => {
    let qs = '';
    server.use(
      http.get('/api/sessions', () =>
        HttpResponse.json({ sessionId: null, conversation: null }),
      ),
      http.get('/api/scrollback', ({ request }) => {
        qs = new URL(request.url).search;
        return HttpResponse.json({ content: '', lines: 2000, totalScrollback: 2000 });
      }),
    );
    renderHook(() => useChatBackfill(makeArgs({ workerName: 'a/b' })));
    await waitFor(() => {
      expect(qs).toContain('name=a%2Fb');
      expect(qs).toContain('lines=2000');
    });
  });

  it('scrollback path: hasOlder=true when totalScrollback > lines', async () => {
    server.use(
      http.get('/api/sessions', () =>
        HttpResponse.json({ sessionId: null, conversation: null }),
      ),
      http.get('/api/scrollback', () =>
        HttpResponse.json({
          content: '> a\nbody',
          lines: 2000,
          totalScrollback: 8000,
        }),
      ),
    );
    const { result } = renderHook(() => useChatBackfill(makeArgs()));
    await waitFor(() => {
      expect(result.current.backfillLoading).toBe(false);
    });
    expect(result.current.backfillSource).toBe('scrollback');
    expect(result.current.hasOlder).toBe(true);
    expect(result.current.backfillCount).toBeGreaterThan(0);
    // Scrollback-path also mirrors into the dedup refs.
    expect(result.current.seenIdsRef.current.size).toBeGreaterThan(0);
    expect(result.current.seenTextsRef.current.size).toBeGreaterThan(0);
  });

  it('scrollback path: hasOlder=false when totalScrollback <= lines', async () => {
    server.use(
      http.get('/api/sessions', () =>
        HttpResponse.json({ sessionId: null, conversation: null }),
      ),
      http.get('/api/scrollback', () =>
        HttpResponse.json({
          content: '> a\nbody',
          lines: 2000,
          totalScrollback: 800,
        }),
      ),
    );
    const { result } = renderHook(() => useChatBackfill(makeArgs()));
    await waitFor(() => {
      expect(result.current.backfillLoading).toBe(false);
    });
    expect(result.current.hasOlder).toBe(false);
  });

  it('scrollback returns sb.error: backfillError set, source=null, loading=false', async () => {
    server.use(
      http.get('/api/sessions', () =>
        HttpResponse.json({ sessionId: null, conversation: null }),
      ),
      http.get('/api/scrollback', () =>
        HttpResponse.json({ error: 'no tmux' }),
      ),
    );
    const { result } = renderHook(() => useChatBackfill(makeArgs()));
    await waitFor(() => {
      expect(result.current.backfillLoading).toBe(false);
    });
    expect(result.current.backfillError).toBe('no tmux');
    expect(result.current.backfillSource).toBeNull();
    expect(result.current.backfillReadyRef.current).toBe(true);
  });

  it('scrollback fetch throws: backfillError set, loading=false', async () => {
    server.use(
      http.get('/api/sessions', () =>
        HttpResponse.json({ sessionId: null, conversation: null }),
      ),
      http.get('/api/scrollback', () =>
        HttpResponse.json({ error: 'boom' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useChatBackfill(makeArgs()));
    await waitFor(() => {
      expect(result.current.backfillLoading).toBe(false);
    });
    expect(result.current.backfillError).toBeTruthy();
    expect(result.current.backfillReadyRef.current).toBe(true);
  });

  it('session fetch throws: error recorded, falls through to scrollback', async () => {
    let scrollbackHit = false;
    server.use(
      http.get('/api/sessions', () =>
        HttpResponse.json({ error: 'bad' }, { status: 500 }),
      ),
      http.get('/api/scrollback', () => {
        scrollbackHit = true;
        return HttpResponse.json({
          content: '> a\nbody',
          lines: 2000,
          totalScrollback: 2000,
        });
      }),
    );
    const { result } = renderHook(() => useChatBackfill(makeArgs()));
    await waitFor(() => {
      expect(result.current.backfillLoading).toBe(false);
    });
    expect(scrollbackHit).toBe(true);
    expect(result.current.backfillSource).toBe('scrollback');
  });

  it('rememberMessage adds to BOTH seenIdsRef and seenTextsRef', async () => {
    server.use(
      http.get('/api/sessions', () =>
        HttpResponse.json(sessionResp([])),
      ),
      http.get('/api/scrollback', () =>
        HttpResponse.json({ content: '', lines: 0, totalScrollback: 0 }),
      ),
    );
    const { result } = renderHook(() => useChatBackfill(makeArgs()));
    await waitFor(() => {
      expect(result.current.backfillLoading).toBe(false);
    });
    act(() => {
      result.current.rememberMessage({
        id: 'live-1',
        role: 'user',
        text: 'typed',
        ts: 0,
        source: 'live',
      });
    });
    expect(result.current.seenIdsRef.current.has('live-1')).toBe(true);
    expect(result.current.seenTextsRef.current.has('typed')).toBe(true);
  });

  it('worker change: resets all state and calls onResetExtras', async () => {
    server.use(
      http.get('/api/sessions', () =>
        HttpResponse.json(
          sessionResp([{ id: 't1', role: 'user', content: 'first' }]),
        ),
      ),
    );
    const onReset = vi.fn();
    const { result, rerender } = renderHook(
      ({ name }: { name: string }) =>
        useChatBackfill({ workerName: name, liveMessages: [], onResetExtras: onReset }),
      { initialProps: { name: 'wA' } },
    );
    await waitFor(() => {
      expect(result.current.history.length).toBe(1);
    });
    // First call happened on mount; we care about the worker-change call.
    expect(onReset).toHaveBeenCalled();
    onReset.mockClear();

    server.use(
      http.get('/api/sessions', () =>
        HttpResponse.json({ sessionId: null, conversation: null }),
      ),
      http.get('/api/scrollback', () =>
        HttpResponse.json({ content: '', lines: 0, totalScrollback: 0 }),
      ),
    );
    rerender({ name: 'wB' });
    // The reset is synchronous inside the effect body.
    await waitFor(() => {
      expect(onReset).toHaveBeenCalledTimes(1);
    });
    // After the swap the page counter resets to SCROLLBACK_PAGE.
    expect(result.current.scrollbackLinesRef.current).toBe(2000);
  });

  it('worker change without onResetExtras does not crash', async () => {
    server.use(
      http.get('/api/sessions', () =>
        HttpResponse.json({ sessionId: null, conversation: null }),
      ),
      http.get('/api/scrollback', () =>
        HttpResponse.json({ content: '', lines: 0, totalScrollback: 0 }),
      ),
    );
    const { result, rerender } = renderHook(
      ({ name }: { name: string }) =>
        useChatBackfill({ workerName: name, liveMessages: [] }),
      { initialProps: { name: 'wA' } },
    );
    await waitFor(() => {
      expect(result.current.backfillLoading).toBe(false);
    });
    expect(() => rerender({ name: 'wB' })).not.toThrow();
  });

  it('loadOlder is a no-op when source is "session" (no second fetch)', async () => {
    let calls = 0;
    server.use(
      http.get('/api/sessions', () =>
        HttpResponse.json(
          sessionResp([{ id: 't1', role: 'user', content: 'a' }]),
        ),
      ),
      http.get('/api/scrollback', () => {
        calls++;
        return HttpResponse.json({
          content: '',
          lines: 0,
          totalScrollback: 0,
        });
      }),
    );
    const { result } = renderHook(() => useChatBackfill(makeArgs()));
    await waitFor(() => {
      expect(result.current.backfillSource).toBe('session');
    });
    await act(async () => {
      await result.current.loadOlder();
    });
    expect(calls).toBe(0);
    expect(result.current.loadingOlder).toBe(false);
  });

  it('loadOlder is a no-op when hasOlder is false (even in scrollback mode)', async () => {
    let calls = 0;
    server.use(
      http.get('/api/sessions', () =>
        HttpResponse.json({ sessionId: null, conversation: null }),
      ),
      http.get('/api/scrollback', () => {
        calls++;
        return HttpResponse.json({
          content: '> q\nbody',
          lines: 2000,
          totalScrollback: 100,
        });
      }),
    );
    const { result } = renderHook(() => useChatBackfill(makeArgs()));
    await waitFor(() => {
      expect(result.current.backfillSource).toBe('scrollback');
    });
    expect(result.current.hasOlder).toBe(false);
    const before = calls;
    await act(async () => {
      await result.current.loadOlder();
    });
    expect(calls).toBe(before);
  });

  it('loadOlder fetches the next page (lines=4000) and updates state', async () => {
    let lastLines = 0;
    let calls = 0;
    server.use(
      http.get('/api/sessions', () =>
        HttpResponse.json({ sessionId: null, conversation: null }),
      ),
      http.get('/api/scrollback', ({ request }) => {
        calls++;
        const u = new URL(request.url);
        lastLines = Number(u.searchParams.get('lines') || 0);
        return HttpResponse.json({
          content: '> q\nbody',
          lines: lastLines,
          totalScrollback: 12000,
        });
      }),
    );
    const { result } = renderHook(() => useChatBackfill(makeArgs()));
    await waitFor(() => {
      expect(result.current.backfillSource).toBe('scrollback');
    });
    expect(result.current.hasOlder).toBe(true);
    const initialCalls = calls;
    await act(async () => {
      await result.current.loadOlder();
    });
    expect(calls).toBe(initialCalls + 1);
    expect(lastLines).toBe(4000);
    expect(result.current.scrollbackLinesRef.current).toBe(4000);
    expect(result.current.history.length).toBeGreaterThan(0);
    expect(result.current.loadingOlder).toBe(false);
  });

  it('loadOlder caps the page counter at SCROLLBACK_MAX (10000) on the final hop', async () => {
    server.use(
      http.get('/api/sessions', () =>
        HttpResponse.json({ sessionId: null, conversation: null }),
      ),
      http.get('/api/scrollback', ({ request }) => {
        const lines = Number(
          new URL(request.url).searchParams.get('lines') || 0,
        );
        return HttpResponse.json({
          content: '> q\nbody',
          lines,
          totalScrollback: 50000,
        });
      }),
    );
    const { result } = renderHook(() => useChatBackfill(makeArgs()));
    await waitFor(() => {
      expect(result.current.backfillSource).toBe('scrollback');
    });
    // 2000 -> 4000 -> 6000 -> 8000 -> 10000 (cap)
    for (let i = 0; i < 4; i++) {
      await act(async () => {
        await result.current.loadOlder();
      });
    }
    expect(result.current.scrollbackLinesRef.current).toBe(10000);
    // Final hop should leave hasOlder=false because nextLines >= MAX
    // (the Boolean(...) && nextLines < SCROLLBACK_MAX guard kicks in).
    expect(result.current.hasOlder).toBe(false);
  });

  it('loadOlder: at the cap, a follow-up call clears hasOlder synchronously (no fetch)', async () => {
    // First land in scrollback mode and pin lines to the max so the
    // "nextLines === scrollbackLinesRef.current" branch fires.
    server.use(
      http.get('/api/sessions', () =>
        HttpResponse.json({ sessionId: null, conversation: null }),
      ),
      http.get('/api/scrollback', () =>
        HttpResponse.json({
          content: '> q\nbody',
          lines: 2000,
          totalScrollback: 99999,
        }),
      ),
    );
    const { result } = renderHook(() => useChatBackfill(makeArgs()));
    await waitFor(() => {
      expect(result.current.backfillSource).toBe('scrollback');
    });
    // Pin page counter at the cap directly to exercise the guard.
    act(() => {
      result.current.scrollbackLinesRef.current = 10000;
    });
    let calls = 0;
    server.use(
      http.get('/api/scrollback', () => {
        calls++;
        return HttpResponse.json({ content: '', lines: 0, totalScrollback: 0 });
      }),
    );
    await act(async () => {
      await result.current.loadOlder();
    });
    expect(calls).toBe(0);
    expect(result.current.hasOlder).toBe(false);
  });

  it('loadOlder preserves liveMessages texts in seenTextsRef after rehydration', async () => {
    server.use(
      http.get('/api/sessions', () =>
        HttpResponse.json({ sessionId: null, conversation: null }),
      ),
      http.get('/api/scrollback', () =>
        HttpResponse.json({
          content: '> q\nbody',
          lines: 2000,
          totalScrollback: 12000,
        }),
      ),
    );
    const live = [makeLive('typed-live-1', 'live-a'), makeLive('typed-live-2', 'live-b')];
    const { result } = renderHook(() =>
      useChatBackfill(makeArgs({ liveMessages: live })),
    );
    await waitFor(() => {
      expect(result.current.backfillSource).toBe('scrollback');
    });
    await act(async () => {
      await result.current.loadOlder();
    });
    expect(result.current.seenTextsRef.current.has('typed-live-1')).toBe(true);
    expect(result.current.seenTextsRef.current.has('typed-live-2')).toBe(true);
  });

  it('loadOlder surfaces sb.error and does NOT update history', async () => {
    server.use(
      http.get('/api/sessions', () =>
        HttpResponse.json({ sessionId: null, conversation: null }),
      ),
      http.get('/api/scrollback', () =>
        HttpResponse.json({
          content: '> first\norig body',
          lines: 2000,
          totalScrollback: 12000,
        }),
      ),
    );
    const { result } = renderHook(() => useChatBackfill(makeArgs()));
    await waitFor(() => {
      expect(result.current.backfillSource).toBe('scrollback');
    });
    const histBefore = result.current.history;
    server.use(
      http.get('/api/scrollback', () =>
        HttpResponse.json({ error: 'tmux gone' }),
      ),
    );
    await act(async () => {
      await result.current.loadOlder();
    });
    expect(result.current.backfillError).toBe('tmux gone');
    expect(result.current.history).toBe(histBefore);
    expect(result.current.loadingOlder).toBe(false);
  });

  it('loadOlder surfaces a thrown HTTP error', async () => {
    server.use(
      http.get('/api/sessions', () =>
        HttpResponse.json({ sessionId: null, conversation: null }),
      ),
      http.get('/api/scrollback', () =>
        HttpResponse.json({
          content: '> q\nbody',
          lines: 2000,
          totalScrollback: 12000,
        }),
      ),
    );
    const { result } = renderHook(() => useChatBackfill(makeArgs()));
    await waitFor(() => {
      expect(result.current.backfillSource).toBe('scrollback');
    });
    server.use(
      http.get('/api/scrollback', () =>
        HttpResponse.json({ error: 'down' }, { status: 500 }),
      ),
    );
    await act(async () => {
      await result.current.loadOlder();
    });
    expect(result.current.backfillError).toBeTruthy();
    expect(result.current.loadingOlder).toBe(false);
  });

  it('loadOlder flips loadingOlder=true during the in-flight call and back on resolve', async () => {
    server.use(
      http.get('/api/sessions', () =>
        HttpResponse.json({ sessionId: null, conversation: null }),
      ),
      http.get('/api/scrollback', () =>
        HttpResponse.json({
          content: '> q\nbody',
          lines: 2000,
          totalScrollback: 12000,
        }),
      ),
    );
    const { result } = renderHook(() => useChatBackfill(makeArgs()));
    await waitFor(() => {
      expect(result.current.backfillSource).toBe('scrollback');
    });
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get('/api/scrollback', async () => {
        await gate;
        return HttpResponse.json({
          content: '> q\nbody',
          lines: 4000,
          totalScrollback: 12000,
        });
      }),
    );
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.loadOlder();
      await Promise.resolve();
    });
    expect(result.current.loadingOlder).toBe(true);
    release();
    await act(async () => {
      await inflight;
    });
    expect(result.current.loadingOlder).toBe(false);
  });

  it('setHistory is exposed so the parent can patch the history list', async () => {
    server.use(
      http.get('/api/sessions', () =>
        HttpResponse.json(
          sessionResp([{ id: 't1', role: 'user', content: 'first' }]),
        ),
      ),
    );
    const { result } = renderHook(() => useChatBackfill(makeArgs()));
    await waitFor(() => {
      expect(result.current.history.length).toBe(1);
    });
    act(() => {
      result.current.setHistory([]);
    });
    expect(result.current.history).toEqual([]);
  });
});
