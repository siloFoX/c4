import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useRef } from 'react';
import { useAppendLive, type AppendLive } from './use-append-live';
import type { ChatMessage, Role } from './chat-helpers';

// useAppendLive returns a memoized SSE-streamed live-message append
// handler. It trims the chunk, short-circuits on empty / dedup hit
// against seenTextsRef, mints a stable id via makeId, calls
// rememberMessage, and pushes onto the liveMessages slot with a 300
// MAX_MESSAGES cap. Tests cover idle wiring, every short-circuit
// path, the role-tagged id prefix, the rememberMessage callback,
// the trailing-window cap, and the setLiveMessages updater form.

interface HookArgs {
  seenTextsRef: { current: Set<string> };
  rememberMessage: (m: ChatMessage) => void;
  setLiveMessages: (
    updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[]),
  ) => void;
}

function renderAppendLive(overrides: Partial<HookArgs> = {}) {
  const seenTextsRef = overrides.seenTextsRef ?? { current: new Set<string>() };
  const rememberMessage = overrides.rememberMessage ?? vi.fn();
  const setLiveMessages = overrides.setLiveMessages ?? vi.fn();
  const { result, rerender } = renderHook(() =>
    useAppendLive({
      seenTextsRef: seenTextsRef as React.MutableRefObject<Set<string>>,
      rememberMessage,
      setLiveMessages: setLiveMessages as React.Dispatch<
        React.SetStateAction<ChatMessage[]>
      >,
    }),
  );
  return { result, rerender, seenTextsRef, rememberMessage, setLiveMessages };
}

function runUpdater(
  setLiveMessages: ReturnType<typeof vi.fn>,
  prev: ChatMessage[],
): ChatMessage[] {
  expect(setLiveMessages).toHaveBeenCalledTimes(1);
  const arg = setLiveMessages.mock.calls[0]![0];
  expect(typeof arg).toBe('function');
  return (arg as (p: ChatMessage[]) => ChatMessage[])(prev);
}

describe('useAppendLive', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('returns a stable function ref across re-renders when deps are unchanged', () => {
    const seenTextsRef = { current: new Set<string>() };
    const rememberMessage = vi.fn();
    const setLiveMessages = vi.fn();
    const { result, rerender } = renderHook(
      ({
        ref,
        remember,
        setter,
      }: {
        ref: { current: Set<string> };
        remember: typeof rememberMessage;
        setter: typeof setLiveMessages;
      }) =>
        useAppendLive({
          seenTextsRef: ref as React.MutableRefObject<Set<string>>,
          rememberMessage: remember,
          setLiveMessages: setter as React.Dispatch<
            React.SetStateAction<ChatMessage[]>
          >,
        }),
      {
        initialProps: {
          ref: seenTextsRef,
          remember: rememberMessage,
          setter: setLiveMessages,
        },
      },
    );
    const first = result.current;
    rerender({
      ref: seenTextsRef,
      remember: rememberMessage,
      setter: setLiveMessages,
    });
    expect(result.current).toBe(first);
  });

  it('short-circuits when the trimmed text is empty (whitespace only)', () => {
    const { result, rememberMessage, setLiveMessages } = renderAppendLive();
    act(() => (result.current as AppendLive)('user', '   \n\t  '));
    expect(rememberMessage).not.toHaveBeenCalled();
    expect(setLiveMessages).not.toHaveBeenCalled();
  });

  it('short-circuits when the text is the empty string', () => {
    const { result, rememberMessage, setLiveMessages } = renderAppendLive();
    act(() => (result.current as AppendLive)('worker', ''));
    expect(rememberMessage).not.toHaveBeenCalled();
    expect(setLiveMessages).not.toHaveBeenCalled();
  });

  it('skips the push when seenTextsRef already contains the trimmed text (backfill dedup)', () => {
    const seenTextsRef = { current: new Set(['hello world']) };
    const { result, rememberMessage, setLiveMessages } = renderAppendLive({
      seenTextsRef,
    });
    act(() => (result.current as AppendLive)('worker', '  hello world  '));
    expect(rememberMessage).not.toHaveBeenCalled();
    expect(setLiveMessages).not.toHaveBeenCalled();
  });

  it('passes the trimmed text through to a new ChatMessage with role=user and source=live', () => {
    const rememberMessage = vi.fn();
    const setLiveMessages = vi.fn();
    const before = Date.now();
    const { result } = renderAppendLive({ rememberMessage, setLiveMessages });
    act(() => (result.current as AppendLive)('user', '  hi there  '));
    const after = Date.now();
    expect(rememberMessage).toHaveBeenCalledTimes(1);
    const msg = rememberMessage.mock.calls[0]![0] as ChatMessage;
    expect(msg.role).toBe('user');
    expect(msg.text).toBe('hi there');
    expect(msg.source).toBe('live');
    expect(msg.ts).toBeGreaterThanOrEqual(before);
    expect(msg.ts).toBeLessThanOrEqual(after);
    expect(msg.id.startsWith('live-u-')).toBe(true);
  });

  it('mints id with live-w- prefix when role is worker', () => {
    const rememberMessage = vi.fn();
    const { result } = renderAppendLive({ rememberMessage });
    act(() => (result.current as AppendLive)('worker', 'streamed chunk'));
    const msg = rememberMessage.mock.calls[0]![0] as ChatMessage;
    expect(msg.role).toBe('worker');
    expect(msg.id.startsWith('live-w-')).toBe(true);
  });

  it('appends the new message onto the previous liveMessages array (updater form)', () => {
    const setLiveMessages = vi.fn();
    const { result } = renderAppendLive({ setLiveMessages });
    act(() => (result.current as AppendLive)('worker', 'tail chunk'));
    const prev: ChatMessage[] = [
      { id: 'a', role: 'user', text: 'q', ts: 1, source: 'backfill' },
    ];
    const next = runUpdater(setLiveMessages, prev);
    expect(next).toHaveLength(2);
    expect(next[0]).toBe(prev[0]);
    expect(next[1]?.text).toBe('tail chunk');
    expect(next[1]?.role).toBe('worker');
  });

  it('caps the live slot at MAX_MESSAGES (300) by trimming the trailing window', () => {
    const setLiveMessages = vi.fn();
    const { result } = renderAppendLive({ setLiveMessages });
    act(() => (result.current as AppendLive)('user', 'newest'));
    const prev: ChatMessage[] = Array.from({ length: 300 }, (_, i) => ({
      id: `p-${i}`,
      role: 'user' as Role,
      text: `m${i}`,
      ts: i,
      source: 'backfill' as const,
    }));
    const next = runUpdater(setLiveMessages, prev);
    expect(next).toHaveLength(300);
    expect(next[0]?.id).toBe('p-1');
    expect(next[299]?.text).toBe('newest');
  });

  it('does not cap when prev + new stays under MAX_MESSAGES', () => {
    const setLiveMessages = vi.fn();
    const { result } = renderAppendLive({ setLiveMessages });
    act(() => (result.current as AppendLive)('user', 'fits'));
    const prev: ChatMessage[] = Array.from({ length: 10 }, (_, i) => ({
      id: `p-${i}`,
      role: 'worker' as Role,
      text: `m${i}`,
      ts: i,
      source: 'live' as const,
    }));
    const next = runUpdater(setLiveMessages, prev);
    expect(next).toHaveLength(11);
    expect(next[0]?.id).toBe('p-0');
    expect(next[10]?.text).toBe('fits');
  });

  it('reads seenTextsRef.current at call time (mutations after mount are honored)', () => {
    const seenTextsRef = { current: new Set<string>() };
    const rememberMessage = vi.fn();
    const setLiveMessages = vi.fn();
    const { result } = renderAppendLive({
      seenTextsRef,
      rememberMessage,
      setLiveMessages,
    });
    // Mutating the ref after mount must affect subsequent calls.
    seenTextsRef.current.add('skip me');
    act(() => (result.current as AppendLive)('user', 'skip me'));
    expect(rememberMessage).not.toHaveBeenCalled();
    act(() => (result.current as AppendLive)('user', 'keep me'));
    expect(rememberMessage).toHaveBeenCalledTimes(1);
    expect((rememberMessage.mock.calls[0]![0] as ChatMessage).text).toBe(
      'keep me',
    );
  });

  it('rememberMessage receives the same ChatMessage that is pushed onto liveMessages', () => {
    const rememberMessage = vi.fn();
    const setLiveMessages = vi.fn();
    const { result } = renderAppendLive({ rememberMessage, setLiveMessages });
    act(() => (result.current as AppendLive)('worker', 'twin'));
    const remembered = rememberMessage.mock.calls[0]![0] as ChatMessage;
    const next = runUpdater(setLiveMessages, []);
    expect(next[0]).toBe(remembered);
  });

  it('works when the wrapping component supplies a real React ref (integration shape)', () => {
    const rememberMessage = vi.fn();
    const setLiveMessages = vi.fn();
    const { result } = renderHook(() => {
      const ref = useRef<Set<string>>(new Set<string>());
      return useAppendLive({
        seenTextsRef: ref,
        rememberMessage,
        setLiveMessages: setLiveMessages as React.Dispatch<
          React.SetStateAction<ChatMessage[]>
        >,
      });
    });
    act(() => (result.current as AppendLive)('worker', 'real ref'));
    expect(rememberMessage).toHaveBeenCalledTimes(1);
    expect(setLiveMessages).toHaveBeenCalledTimes(1);
  });
});
