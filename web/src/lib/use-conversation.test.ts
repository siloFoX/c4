import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook, waitFor } from '@testing-library/react';
import { server } from '../test/server';
import { useConversation } from './use-conversation';
import type { Conversation, Turn } from '../components/ConversationView';

// jsdom does not ship EventSource. This stub mirrors the slice the
// hook uses (addEventListener for the typed 'conversation' / 'turn'
// frames + onerror + close()) and exposes emit() so each test can
// drive frames synchronously.
class EventSourceStub {
  url: string;
  onerror: (() => void) | null = null;
  closed = false;
  private listeners: Record<string, Array<(ev: unknown) => void>> = {};
  static instances: EventSourceStub[] = [];
  static throwOnConstruct = false;
  constructor(url: string) {
    if (EventSourceStub.throwOnConstruct) throw new Error('blocked');
    this.url = url;
    EventSourceStub.instances.push(this);
  }
  addEventListener(name: string, fn: (ev: unknown) => void) {
    (this.listeners[name] ||= []).push(fn);
  }
  emit(name: string, ev: unknown) {
    (this.listeners[name] || []).forEach((fn) => fn(ev));
  }
  close() {
    this.closed = true;
  }
}

beforeEach(() => {
  EventSourceStub.instances = [];
  EventSourceStub.throwOnConstruct = false;
  vi.stubGlobal('EventSource', EventSourceStub);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    sessionId: 's1',
    projectPath: null,
    createdAt: null,
    updatedAt: null,
    model: null,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    turns: [],
    warnings: [],
    ...overrides,
  };
}

function makeTurn(overrides: Partial<Turn> = {}): Turn {
  return {
    id: 't1',
    role: 'user',
    createdAt: null,
    durationMs: null,
    model: null,
    tokens: { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 },
    content: '',
    toolName: null,
    toolArgs: null,
    toolUseId: null,
    toolResult: null,
    thinkingText: null,
    attachments: [],
    ...overrides,
  };
}

describe('useConversation', () => {
  it('starts idle (conversation null, no error, not loading, not streaming) when sessionId is empty AND no snapshotUrl AND live=false', () => {
    const { result } = renderHook(() =>
      useConversation({ sessionId: '', live: false }),
    );
    expect(result.current.conversation).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.streaming).toBe(false);
    expect(EventSourceStub.instances).toHaveLength(0);
  });

  it('refresh() short-circuits with no fetch when both sessionId and snapshotUrl are empty', async () => {
    let calls = 0;
    server.use(
      http.get('/api/sessions/:id', () => {
        calls += 1;
        return HttpResponse.json(makeConversation());
      }),
    );
    const { result } = renderHook(() =>
      useConversation({ sessionId: '', live: false }),
    );
    await act(async () => {
      await result.current.refresh();
    });
    expect(calls).toBe(0);
    expect(result.current.conversation).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('on mount fetches /api/sessions/<id> and stores the response as conversation', async () => {
    server.use(
      http.get('/api/sessions/:id', () =>
        HttpResponse.json(makeConversation({ sessionId: 's1', model: 'opus' })),
      ),
    );
    const { result } = renderHook(() =>
      useConversation({ sessionId: 's1', live: false }),
    );
    await waitFor(() => {
      expect(result.current.conversation?.sessionId).toBe('s1');
    });
    expect(result.current.conversation?.model).toBe('opus');
    expect(result.current.error).toBeNull();
  });

  it('URL-encodes the sessionId when building the default snapshot path', async () => {
    let capturedPath = '';
    server.use(
      http.get('/api/sessions/:id', ({ request }) => {
        capturedPath = new URL(request.url).pathname;
        return HttpResponse.json(makeConversation());
      }),
    );
    renderHook(() =>
      useConversation({ sessionId: 'a/b c', live: false }),
    );
    await waitFor(() => {
      expect(capturedPath).toBe('/api/sessions/a%2Fb%20c');
    });
  });

  it('uses snapshotUrl override instead of the default /api/sessions/<id> path', async () => {
    let hitDefault = 0;
    let hitOverride = 0;
    server.use(
      http.get('/api/sessions/:id', () => {
        hitDefault += 1;
        return HttpResponse.json(makeConversation());
      }),
      http.get('/api/attach/foo/conversation', () => {
        hitOverride += 1;
        return HttpResponse.json(makeConversation({ sessionId: 'from-override' }));
      }),
    );
    const { result } = renderHook(() =>
      useConversation({
        sessionId: '',
        live: false,
        snapshotUrl: '/api/attach/foo/conversation',
      }),
    );
    await waitFor(() => {
      expect(result.current.conversation?.sessionId).toBe('from-override');
    });
    expect(hitOverride).toBe(1);
    expect(hitDefault).toBe(0);
  });

  it('surfaces error and leaves conversation null when the snapshot endpoint returns non-OK', async () => {
    server.use(
      http.get('/api/sessions/:id', () =>
        HttpResponse.json({ error: 'down' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() =>
      useConversation({ sessionId: 's1', live: false }),
    );
    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });
    expect(result.current.conversation).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('flips loading=true during the in-flight fetch and back to false on settle (release-gate)', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.get('/api/sessions/:id', async () => {
        await gate;
        return HttpResponse.json(makeConversation());
      }),
    );
    const { result } = renderHook(() =>
      useConversation({ sessionId: 's1', live: false }),
    );
    await waitFor(() => {
      expect(result.current.loading).toBe(true);
    });
    release();
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it('does NOT open an EventSource when live=false', async () => {
    server.use(
      http.get('/api/sessions/:id', () => HttpResponse.json(makeConversation())),
    );
    renderHook(() => useConversation({ sessionId: 's1', live: false }));
    expect(EventSourceStub.instances).toHaveLength(0);
  });

  it('does NOT open an EventSource when live=true but both sessionId and streamUrl are empty', () => {
    renderHook(() => useConversation({ sessionId: '', live: true }));
    expect(EventSourceStub.instances).toHaveLength(0);
  });

  it('opens EventSource on /api/sessions/<encoded>/stream and flips streaming=true when live=true', async () => {
    server.use(
      http.get('/api/sessions/:id', () => HttpResponse.json(makeConversation())),
    );
    const { result } = renderHook(() =>
      useConversation({ sessionId: 'a/b c', live: true }),
    );
    expect(EventSourceStub.instances).toHaveLength(1);
    const opened = EventSourceStub.instances[0]?.url ?? '';
    expect(opened).toContain('/api/sessions/');
    expect(opened).toContain('a%2Fb%20c');
    expect(opened).toContain('/stream');
    expect(result.current.streaming).toBe(true);
  });

  it('uses streamUrl override instead of the default sessions stream path', async () => {
    server.use(
      http.get('/api/sessions/:id', () => HttpResponse.json(makeConversation())),
    );
    renderHook(() =>
      useConversation({
        sessionId: 's1',
        live: true,
        streamUrl: '/api/attach/x/stream',
      }),
    );
    expect(EventSourceStub.instances[0]?.url).toContain('/api/attach/x/stream');
    expect(EventSourceStub.instances[0]?.url).not.toContain('/api/sessions/');
  });

  it("replaces conversation on a 'conversation' SSE frame and ignores malformed frames without crashing", async () => {
    server.use(
      http.get('/api/sessions/:id', () => HttpResponse.json(makeConversation())),
    );
    const { result } = renderHook(() =>
      useConversation({ sessionId: 's1', live: true }),
    );
    const es = EventSourceStub.instances[0]!;
    const replacement = makeConversation({ sessionId: 's1', model: 'opus' });
    act(() => {
      es.emit('conversation', { data: JSON.stringify(replacement) } as unknown);
    });
    expect(result.current.conversation?.model).toBe('opus');
    expect(() => {
      act(() => {
        es.emit('conversation', { data: 'not-json' } as unknown);
      });
    }).not.toThrow();
    expect(result.current.conversation?.model).toBe('opus');
  });

  it("appends a 'turn' SSE frame to the existing conversation and updates token totals + updatedAt", async () => {
    server.use(
      http.get('/api/sessions/:id', () =>
        HttpResponse.json(
          makeConversation({ totalInputTokens: 10, totalOutputTokens: 20, updatedAt: '2026-05-10T00:00:00Z' }),
        ),
      ),
    );
    const { result } = renderHook(() =>
      useConversation({ sessionId: 's1', live: true }),
    );
    await waitFor(() => {
      expect(result.current.conversation?.totalInputTokens).toBe(10);
    });
    const es = EventSourceStub.instances[0]!;
    const turn = makeTurn({
      id: 't2',
      createdAt: '2026-05-11T01:00:00Z',
      tokens: { input: 3, output: 7, cacheRead: 0, cacheCreate: 0 },
    });
    act(() => {
      es.emit('turn', { data: JSON.stringify(turn) } as unknown);
    });
    expect(result.current.conversation?.turns).toHaveLength(1);
    expect(result.current.conversation?.turns[0]?.id).toBe('t2');
    expect(result.current.conversation?.totalInputTokens).toBe(13);
    expect(result.current.conversation?.totalOutputTokens).toBe(27);
    expect(result.current.conversation?.updatedAt).toBe('2026-05-11T01:00:00Z');
  });

  it("seeds a fresh conversation from the sessionId on the first 'turn' frame when no snapshot has loaded yet", async () => {
    server.use(
      http.get('/api/sessions/:id', () =>
        HttpResponse.json({ error: 'down' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() =>
      useConversation({ sessionId: 's-seed', live: true }),
    );
    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });
    expect(result.current.conversation).toBeNull();
    const es = EventSourceStub.instances[0]!;
    const turn = makeTurn({ id: 't1', createdAt: '2026-05-11T00:00:00Z' });
    act(() => {
      es.emit('turn', { data: JSON.stringify(turn) } as unknown);
    });
    expect(result.current.conversation).not.toBeNull();
    expect(result.current.conversation?.sessionId).toBe('s-seed');
    expect(result.current.conversation?.turns).toEqual([turn]);
    expect(result.current.conversation?.updatedAt).toBe('2026-05-11T00:00:00Z');
  });

  it("ignores a malformed 'turn' SSE frame without crashing or mutating state", async () => {
    server.use(
      http.get('/api/sessions/:id', () => HttpResponse.json(makeConversation())),
    );
    const { result } = renderHook(() =>
      useConversation({ sessionId: 's1', live: true }),
    );
    await waitFor(() => {
      expect(result.current.conversation).not.toBeNull();
    });
    const es = EventSourceStub.instances[0]!;
    expect(() => {
      act(() => {
        es.emit('turn', { data: 'not-json' } as unknown);
      });
    }).not.toThrow();
    expect(result.current.conversation?.turns).toEqual([]);
  });

  it('flips streaming=false when the EventSource emits onerror', async () => {
    server.use(
      http.get('/api/sessions/:id', () => HttpResponse.json(makeConversation())),
    );
    const { result } = renderHook(() =>
      useConversation({ sessionId: 's1', live: true }),
    );
    expect(result.current.streaming).toBe(true);
    const es = EventSourceStub.instances[0]!;
    act(() => {
      es.onerror?.();
    });
    expect(result.current.streaming).toBe(false);
  });

  it('closes the EventSource and resets streaming on unmount', async () => {
    server.use(
      http.get('/api/sessions/:id', () => HttpResponse.json(makeConversation())),
    );
    const { result, unmount } = renderHook(() =>
      useConversation({ sessionId: 's1', live: true }),
    );
    const es = EventSourceStub.instances[0]!;
    expect(es.closed).toBe(false);
    expect(result.current.streaming).toBe(true);
    unmount();
    expect(es.closed).toBe(true);
  });

  it('closes the previous EventSource and opens a fresh one when sessionId changes', async () => {
    server.use(
      http.get('/api/sessions/:id', () => HttpResponse.json(makeConversation())),
    );
    const { rerender } = renderHook(
      ({ id }: { id: string }) => useConversation({ sessionId: id, live: true }),
      { initialProps: { id: 'first' } },
    );
    expect(EventSourceStub.instances).toHaveLength(1);
    expect(EventSourceStub.instances[0]?.url).toContain('first');
    rerender({ id: 'second' });
    expect(EventSourceStub.instances).toHaveLength(2);
    expect(EventSourceStub.instances[0]?.closed).toBe(true);
    expect(EventSourceStub.instances[1]?.url).toContain('second');
  });

  it('swallows EventSource constructor throw without crashing and keeps streaming=false', async () => {
    server.use(
      http.get('/api/sessions/:id', () => HttpResponse.json(makeConversation())),
    );
    EventSourceStub.throwOnConstruct = true;
    const { result } = renderHook(() =>
      useConversation({ sessionId: 's1', live: true }),
    );
    expect(result.current.streaming).toBe(false);
    expect(EventSourceStub.instances).toHaveLength(0);
  });
});
