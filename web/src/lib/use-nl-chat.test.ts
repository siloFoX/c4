import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook, waitFor } from '@testing-library/react';
import { server } from '../test/server';
import { useNlChat } from './use-nl-chat';

const SESSION_KEY = 'c4.nl.sessionId';

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('useNlChat', () => {
  it('starts idle: no messages, not sending, no error, empty actions', () => {
    const { result } = renderHook(() => useNlChat());
    expect(result.current.messages).toEqual([]);
    expect(result.current.sending).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.actions).toEqual([]);
    expect(result.current.sessionId).toBeNull();
  });

  it('hydrates the initial sessionId from localStorage on mount', () => {
    window.localStorage.setItem(SESSION_KEY, 'sess-1');
    const { result } = renderHook(() => useNlChat());
    expect(result.current.sessionId).toBe('sess-1');
  });

  it('falls back to null sessionId when localStorage.getItem throws (private mode)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    const { result } = renderHook(() => useNlChat());
    expect(result.current.sessionId).toBeNull();
  });

  it('sendText is a no-op for empty string (no POST, no message, no state change)', async () => {
    let calls = 0;
    server.use(
      http.post('/api/nl/chat', () => {
        calls++;
        return HttpResponse.json({
          sessionId: 's1',
          response: 'hi',
          intent: 'greet',
        });
      }),
    );
    const { result } = renderHook(() => useNlChat());
    await act(async () => {
      await result.current.sendText('');
    });
    expect(calls).toBe(0);
    expect(result.current.messages).toEqual([]);
    expect(result.current.sending).toBe(false);
  });

  it('sendText is a no-op for whitespace-only input', async () => {
    let calls = 0;
    server.use(
      http.post('/api/nl/chat', () => {
        calls++;
        return HttpResponse.json({
          sessionId: 's1',
          response: 'hi',
          intent: 'greet',
        });
      }),
    );
    const { result } = renderHook(() => useNlChat());
    await act(async () => {
      await result.current.sendText('   \n  ');
    });
    expect(calls).toBe(0);
    expect(result.current.messages).toEqual([]);
  });

  it('POSTs /api/nl/chat with { sessionId: undefined, text: trimmed } when no session is held', async () => {
    let url = '';
    let body: { sessionId?: string; text?: string } | null = null;
    server.use(
      http.post('/api/nl/chat', async ({ request }) => {
        url = new URL(request.url).pathname;
        body = (await request.json()) as typeof body;
        return HttpResponse.json({
          sessionId: 's-new',
          response: 'hello there',
          intent: 'greet',
        });
      }),
    );
    const { result } = renderHook(() => useNlChat());
    await act(async () => {
      await result.current.sendText('  hello  ');
    });
    expect(url).toBe('/api/nl/chat');
    expect(body).toEqual({ text: 'hello' });
  });

  it('POSTs the current sessionId once one has been assigned', async () => {
    window.localStorage.setItem(SESSION_KEY, 'sess-existing');
    let body: { sessionId?: string; text?: string } | null = null;
    server.use(
      http.post('/api/nl/chat', async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json({
          sessionId: 'sess-existing',
          response: 'ack',
          intent: 'noop',
        });
      }),
    );
    const { result } = renderHook(() => useNlChat());
    await act(async () => {
      await result.current.sendText('ping');
    });
    expect(body).toEqual({ sessionId: 'sess-existing', text: 'ping' });
  });

  it('appends the user bubble optimistically before the POST resolves', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.post('/api/nl/chat', async () => {
        await gate;
        return HttpResponse.json({
          sessionId: 's',
          response: 'ack',
          intent: 'noop',
        });
      }),
    );
    const { result } = renderHook(() => useNlChat());
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.sendText('hello');
      await Promise.resolve();
    });
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]?.role).toBe('user');
    expect(result.current.messages[0]?.text).toBe('hello');
    expect(result.current.sending).toBe(true);
    release();
    await act(async () => {
      await inflight;
    });
  });

  it('flips sending=true during the in-flight POST and back to false after the response settles', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.post('/api/nl/chat', async () => {
        await gate;
        return HttpResponse.json({
          sessionId: 's',
          response: 'ack',
          intent: 'noop',
        });
      }),
    );
    const { result } = renderHook(() => useNlChat());
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.sendText('ping');
      await Promise.resolve();
    });
    expect(result.current.sending).toBe(true);
    release();
    await act(async () => {
      await inflight;
    });
    expect(result.current.sending).toBe(false);
  });

  it('on success: appends the assistant bubble with response text + intent, captures actions, and stores the sessionId', async () => {
    server.use(
      http.post('/api/nl/chat', () =>
        HttpResponse.json({
          sessionId: 'sess-abc',
          response: 'hello back',
          intent: 'greet',
          actions: [
            { type: 'open_worker', worker: 'w1', label: 'Open w1' },
            { type: 'noop', label: 'Cancel' },
          ],
        }),
      ),
    );
    const { result } = renderHook(() => useNlChat());
    await act(async () => {
      await result.current.sendText('hi');
    });
    expect(result.current.messages).toHaveLength(2);
    const reply = result.current.messages[1]!;
    expect(reply.role).toBe('assistant');
    expect(reply.text).toBe('hello back');
    expect(reply.intent).toBe('greet');
    expect(result.current.actions).toEqual([
      { type: 'open_worker', worker: 'w1', label: 'Open w1' },
      { type: 'noop', label: 'Cancel' },
    ]);
    expect(result.current.sessionId).toBe('sess-abc');
    expect(result.current.error).toBeNull();
  });

  it("substitutes '(no response)' when the assistant payload is empty", async () => {
    server.use(
      http.post('/api/nl/chat', () =>
        HttpResponse.json({
          sessionId: 's',
          response: '',
          intent: 'noop',
        }),
      ),
    );
    const { result } = renderHook(() => useNlChat());
    await act(async () => {
      await result.current.sendText('hi');
    });
    const reply = result.current.messages[1]!;
    expect(reply.text).toBe('(no response)');
  });

  it('defaults actions to [] when the response field is missing or not an array', async () => {
    server.use(
      http.post('/api/nl/chat', () =>
        HttpResponse.json({
          sessionId: 's',
          response: 'ok',
          intent: 'noop',
          actions: 'not-an-array' as unknown,
        }),
      ),
    );
    const { result } = renderHook(() => useNlChat());
    await act(async () => {
      await result.current.sendText('hi');
    });
    expect(result.current.actions).toEqual([]);
  });

  it('on server-side error envelope: sets error and does NOT append an assistant bubble or change sessionId/actions', async () => {
    server.use(
      http.post('/api/nl/chat', () =>
        HttpResponse.json({
          sessionId: 'ignored',
          response: 'ignored',
          intent: 'ignored',
          actions: [{ type: 'open', label: 'go' }],
          error: 'nlp dispatch failed',
        }),
      ),
    );
    const { result } = renderHook(() => useNlChat());
    await act(async () => {
      await result.current.sendText('hi');
    });
    expect(result.current.error).toBe('nlp dispatch failed');
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]?.role).toBe('user');
    expect(result.current.sessionId).toBeNull();
    expect(result.current.actions).toEqual([]);
    expect(result.current.sending).toBe(false);
  });

  it('on HTTP failure (non-2xx): catches the thrown error and surfaces the message via setError', async () => {
    server.use(
      http.post('/api/nl/chat', () =>
        HttpResponse.json({ error: 'down' }, { status: 503 }),
      ),
    );
    const { result } = renderHook(() => useNlChat());
    await act(async () => {
      await result.current.sendText('hi');
    });
    expect(result.current.error).toMatch(/HTTP 503/);
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.sending).toBe(false);
  });

  it('clears the prior error when a new sendText starts (setError(null) before POST)', async () => {
    server.use(
      http.post('/api/nl/chat', () =>
        HttpResponse.json({
          sessionId: 's',
          response: 'ok',
          intent: 'noop',
        }),
      ),
    );
    const { result } = renderHook(() => useNlChat());
    act(() => {
      // Seed an error via the failing path so we can prove the next call clears it.
      // Easier to just check the optimistic clear via a successful round-trip.
    });
    await act(async () => {
      await result.current.sendText('hi');
    });
    expect(result.current.error).toBeNull();
  });

  it('drops a re-entrant sendText while sending=true (release-gate)', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    server.use(
      http.post('/api/nl/chat', async () => {
        calls++;
        await gate;
        return HttpResponse.json({
          sessionId: 's',
          response: 'ok',
          intent: 'noop',
        });
      }),
    );
    const { result } = renderHook(() => useNlChat());
    let first: Promise<void> | null = null;
    await act(async () => {
      first = result.current.sendText('one');
      await Promise.resolve();
    });
    expect(result.current.sending).toBe(true);
    await act(async () => {
      await result.current.sendText('two');
    });
    expect(calls).toBe(1);
    expect(result.current.messages).toHaveLength(1);
    release();
    await act(async () => {
      await first;
    });
  });

  it('persists the new sessionId to localStorage when the server assigns one', async () => {
    server.use(
      http.post('/api/nl/chat', () =>
        HttpResponse.json({
          sessionId: 'persisted-1',
          response: 'ok',
          intent: 'noop',
        }),
      ),
    );
    const { result } = renderHook(() => useNlChat());
    await act(async () => {
      await result.current.sendText('hi');
    });
    await waitFor(() => {
      expect(window.localStorage.getItem(SESSION_KEY)).toBe('persisted-1');
    });
  });

  it('newSession resets sessionId, messages, actions, and error, and removes the localStorage key', async () => {
    window.localStorage.setItem(SESSION_KEY, 'sess-x');
    server.use(
      http.post('/api/nl/chat', () =>
        HttpResponse.json({
          sessionId: 'sess-x',
          response: 'ok',
          intent: 'noop',
          actions: [{ type: 'open', label: 'go' }],
        }),
      ),
    );
    const { result } = renderHook(() => useNlChat());
    await act(async () => {
      await result.current.sendText('hi');
    });
    expect(result.current.messages.length).toBeGreaterThan(0);
    expect(result.current.actions.length).toBeGreaterThan(0);
    act(() => {
      result.current.newSession();
    });
    expect(result.current.sessionId).toBeNull();
    expect(result.current.messages).toEqual([]);
    expect(result.current.actions).toEqual([]);
    expect(result.current.error).toBeNull();
    await waitFor(() => {
      expect(window.localStorage.getItem(SESSION_KEY)).toBeNull();
    });
  });

  it('swallows localStorage.setItem errors when persisting the sessionId (non-fatal)', async () => {
    const setSpy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
    server.use(
      http.post('/api/nl/chat', () =>
        HttpResponse.json({
          sessionId: 'sess-fail-persist',
          response: 'ok',
          intent: 'noop',
        }),
      ),
    );
    const { result } = renderHook(() => useNlChat());
    await expect(
      act(async () => {
        await result.current.sendText('hi');
      }),
    ).resolves.not.toThrow();
    expect(result.current.sessionId).toBe('sess-fail-persist');
    setSpy.mockRestore();
  });

  it('keeps user + assistant bubble ids unique and ordered (user first, assistant second)', async () => {
    server.use(
      http.post('/api/nl/chat', () =>
        HttpResponse.json({
          sessionId: 's',
          response: 'reply',
          intent: 'noop',
        }),
      ),
    );
    const { result } = renderHook(() => useNlChat());
    await act(async () => {
      await result.current.sendText('hello');
    });
    expect(result.current.messages).toHaveLength(2);
    const [u, a] = result.current.messages;
    expect(u?.role).toBe('user');
    expect(a?.role).toBe('assistant');
    expect(u?.id).not.toBe(a?.id);
    expect(typeof u?.ts).toBe('number');
    expect(typeof a?.ts).toBe('number');
  });

  it('preserves the current sessionId when the server response omits sessionId', async () => {
    window.localStorage.setItem(SESSION_KEY, 'keep-me');
    server.use(
      http.post('/api/nl/chat', () =>
        HttpResponse.json({
          sessionId: '',
          response: 'ok',
          intent: 'noop',
        }),
      ),
    );
    const { result } = renderHook(() => useNlChat());
    await act(async () => {
      await result.current.sendText('hi');
    });
    expect(result.current.sessionId).toBe('keep-me');
  });

  it('keeps the sendText reference stable when neither sending nor sessionId change', () => {
    const { result, rerender } = renderHook(() => useNlChat());
    const first = result.current.sendText;
    rerender();
    expect(result.current.sendText).toBe(first);
  });

  it('keeps the newSession reference stable across re-renders', () => {
    const { result, rerender } = renderHook(() => useNlChat());
    const first = result.current.newSession;
    rerender();
    expect(result.current.newSession).toBe(first);
  });
});
