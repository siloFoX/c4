import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook } from '@testing-library/react';
import type { RefObject } from 'react';
import { server } from '../test/server';
import { useChatSubmit } from './use-chat-submit';

// Factory so each test can shape arguments independently while defaults
// (vi.fn spies for every callback, a focusable textarea stand-in) stay
// shared. textareaRef has to satisfy RefObject<HTMLTextAreaElement | null>
// since the hook calls `textareaRef.current?.focus()` in its finally block.
function makeArgs(
  overrides: Partial<Parameters<typeof useChatSubmit>[0]> = {},
): Parameters<typeof useChatSubmit>[0] {
  const focus = vi.fn();
  const textareaRef = {
    current: { focus } as unknown as HTMLTextAreaElement,
  } as RefObject<HTMLTextAreaElement | null>;
  return {
    workerName: 'w1',
    input: 'hello world',
    setInput: vi.fn(),
    setError: vi.fn(),
    setAutoScroll: vi.fn(),
    flushWorkerBuffer: vi.fn(),
    appendLive: vi.fn(),
    textareaRef,
    ...overrides,
  };
}

describe('useChatSubmit', () => {
  it('starts idle: sending=false and exposes handleSubmit', () => {
    const { result } = renderHook(() => useChatSubmit(makeArgs()));
    expect(result.current.sending).toBe(false);
    expect(typeof result.current.handleSubmit).toBe('function');
  });

  it('skips the POSTs and side effects when input is empty', async () => {
    let sendCalls = 0;
    let keyCalls = 0;
    server.use(
      http.post('/api/send', () => {
        sendCalls++;
        return HttpResponse.json({});
      }),
      http.post('/api/key', () => {
        keyCalls++;
        return HttpResponse.json({});
      }),
    );
    const args = makeArgs({ input: '' });
    const { result } = renderHook(() => useChatSubmit(args));
    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(sendCalls).toBe(0);
    expect(keyCalls).toBe(0);
    expect(args.flushWorkerBuffer).not.toHaveBeenCalled();
    expect(args.appendLive).not.toHaveBeenCalled();
    expect(args.setInput).not.toHaveBeenCalled();
    expect(args.setAutoScroll).not.toHaveBeenCalled();
    expect(args.setError).not.toHaveBeenCalled();
  });

  it('skips the POSTs when input is whitespace-only', async () => {
    let sendCalls = 0;
    server.use(
      http.post('/api/send', () => {
        sendCalls++;
        return HttpResponse.json({});
      }),
    );
    const args = makeArgs({ input: '   \n  ' });
    const { result } = renderHook(() => useChatSubmit(args));
    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(sendCalls).toBe(0);
    expect(args.appendLive).not.toHaveBeenCalled();
  });

  it('calls preventDefault when handed a form event', async () => {
    server.use(
      http.post('/api/send', () => HttpResponse.json({})),
      http.post('/api/key', () => HttpResponse.json({})),
    );
    const { result } = renderHook(() => useChatSubmit(makeArgs()));
    const preventDefault = vi.fn();
    await act(async () => {
      await result.current.handleSubmit({
        preventDefault,
      } as unknown as React.FormEvent);
    });
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it('POSTs /api/send with {name,input}, then /api/key with {name,key:"Enter"} (order + body shape)', async () => {
    const sendBodies: unknown[] = [];
    const keyBodies: unknown[] = [];
    const order: string[] = [];
    server.use(
      http.post('/api/send', async ({ request }) => {
        sendBodies.push(await request.json());
        order.push('send');
        return HttpResponse.json({});
      }),
      http.post('/api/key', async ({ request }) => {
        keyBodies.push(await request.json());
        order.push('key');
        return HttpResponse.json({});
      }),
    );
    const args = makeArgs({ workerName: 'worker-1', input: 'hi' });
    const { result } = renderHook(() => useChatSubmit(args));
    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(sendBodies).toEqual([{ name: 'worker-1', input: 'hi' }]);
    expect(keyBodies).toEqual([{ name: 'worker-1', key: 'Enter' }]);
    expect(order).toEqual(['send', 'key']);
  });

  it('runs the optimistic UI updates BEFORE awaiting any POST: flush, appendLive, setInput, setAutoScroll, setError(null)', async () => {
    // Gate /api/send so the optimistic side-effects must have fired by the
    // time we inspect the spies — proves they happen before the network awaits.
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.post('/api/send', async () => {
        await gate;
        return HttpResponse.json({});
      }),
      http.post('/api/key', () => HttpResponse.json({})),
    );
    const args = makeArgs({ workerName: 'w1', input: 'optim' });
    const { result } = renderHook(() => useChatSubmit(args));
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.handleSubmit();
      // Yield so React commits the synchronous state updates from setSending,
      // setError(null), flushWorkerBuffer, appendLive, setInput, setAutoScroll.
      await Promise.resolve();
    });
    expect(args.flushWorkerBuffer).toHaveBeenCalledTimes(1);
    expect(args.appendLive).toHaveBeenCalledWith('user', 'optim');
    expect(args.setInput).toHaveBeenCalledWith('');
    expect(args.setAutoScroll).toHaveBeenCalledWith(true);
    expect(args.setError).toHaveBeenCalledWith(null);
    release();
    await act(async () => {
      await inflight;
    });
  });

  it('flips sending=true during the in-flight POST and back to false after settle (release-gate)', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.post('/api/send', async () => {
        await gate;
        return HttpResponse.json({});
      }),
      http.post('/api/key', () => HttpResponse.json({})),
    );
    const { result } = renderHook(() => useChatSubmit(makeArgs()));
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.handleSubmit();
      await Promise.resolve();
    });
    expect(result.current.sending).toBe(true);
    release();
    await act(async () => {
      await inflight;
    });
    expect(result.current.sending).toBe(false);
  });

  it('surfaces sendData.error and does NOT issue the follow-up /api/key POST', async () => {
    let keyCalls = 0;
    server.use(
      http.post('/api/send', () => HttpResponse.json({ error: 'send broke' })),
      http.post('/api/key', () => {
        keyCalls++;
        return HttpResponse.json({});
      }),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useChatSubmit(args));
    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(args.setError).toHaveBeenCalledWith('send broke');
    expect(keyCalls).toBe(0);
    expect(result.current.sending).toBe(false);
  });

  it('surfaces keyData.error from /api/key when /api/send succeeded', async () => {
    server.use(
      http.post('/api/send', () => HttpResponse.json({})),
      http.post('/api/key', () => HttpResponse.json({ error: 'enter rejected' })),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useChatSubmit(args));
    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(args.setError).toHaveBeenCalledWith('enter rejected');
    expect(result.current.sending).toBe(false);
  });

  it('catches HTTP failures from apiPost (non-2xx) and surfaces the thrown error message via setError', async () => {
    server.use(
      http.post('/api/send', () =>
        HttpResponse.json({ error: 'boom' }, { status: 500 }),
      ),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useChatSubmit(args));
    await act(async () => {
      await result.current.handleSubmit();
    });
    // apiPost prefixes its thrown message with 'HTTP <status>' and includes
    // the parsed `error` body — assert on the substring rather than the exact
    // shape so the test survives helper formatting tweaks.
    const errArg = (args.setError as ReturnType<typeof vi.fn>).mock.calls
      .map((c) => c[0])
      .filter((v): v is string => typeof v === 'string')
      .pop();
    expect(errArg).toMatch(/HTTP 500/);
    expect(result.current.sending).toBe(false);
  });

  it('focuses the textarea on completion (success path)', async () => {
    server.use(
      http.post('/api/send', () => HttpResponse.json({})),
      http.post('/api/key', () => HttpResponse.json({})),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useChatSubmit(args));
    await act(async () => {
      await result.current.handleSubmit();
    });
    const focus = (args.textareaRef.current as unknown as { focus: ReturnType<typeof vi.fn> }).focus;
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('focuses the textarea even on failure path (finally branch)', async () => {
    server.use(
      http.post('/api/send', () =>
        HttpResponse.json({ error: 'x' }, { status: 500 }),
      ),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useChatSubmit(args));
    await act(async () => {
      await result.current.handleSubmit();
    });
    const focus = (args.textareaRef.current as unknown as { focus: ReturnType<typeof vi.fn> }).focus;
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('does not throw if textareaRef.current is null (focus is opt-chained)', async () => {
    server.use(
      http.post('/api/send', () => HttpResponse.json({})),
      http.post('/api/key', () => HttpResponse.json({})),
    );
    const args = makeArgs({
      textareaRef: { current: null } as RefObject<HTMLTextAreaElement | null>,
    });
    const { result } = renderHook(() => useChatSubmit(args));
    await expect(
      act(async () => {
        await result.current.handleSubmit();
      }),
    ).resolves.not.toThrow();
    expect(result.current.sending).toBe(false);
  });

  it('drops a re-entrant handleSubmit call while a previous one is still in flight', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let sendCalls = 0;
    server.use(
      http.post('/api/send', async () => {
        sendCalls++;
        await gate;
        return HttpResponse.json({});
      }),
      http.post('/api/key', () => HttpResponse.json({})),
    );
    const { result } = renderHook(() => useChatSubmit(makeArgs()));
    let first: Promise<void> | null = null;
    await act(async () => {
      first = result.current.handleSubmit();
      await Promise.resolve();
    });
    expect(result.current.sending).toBe(true);
    // Second invocation while sending=true must early-return without
    // issuing another /api/send POST.
    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(sendCalls).toBe(1);
    release();
    await act(async () => {
      await first;
    });
    expect(result.current.sending).toBe(false);
  });
});
