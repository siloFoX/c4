import { useCallback } from 'react';
import type * as React from 'react';
import { makeId, type ChatMessage, type Role } from './chat-helpers';

// (v1.10.739) Extracted from ChatView. The
// SSE-streamed live-message append handler — trims
// the chunk, runs the dedup gate against the
// backfill's seenTextsRef set, mints a stable id,
// remembers it via the supplied rememberMessage
// helper, and pushes onto the liveMessages slot
// with the MAX_MESSAGES cap.

const MAX_MESSAGES = 300;

export type AppendLive = (role: Role, text: string) => void;

export function useAppendLive(args: {
  seenTextsRef: React.MutableRefObject<Set<string>>;
  rememberMessage: (m: ChatMessage) => void;
  setLiveMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
}): AppendLive {
  const { seenTextsRef, rememberMessage, setLiveMessages } = args;

  return useCallback<AppendLive>(
    (role, text) => {
      const trimmed = text.replace(/^\s+|\s+$/g, '');
      if (!trimmed) return;
      // 8.25 dedup: if the same text was rendered by the backfill pass
      // (e.g. SSE delivers the tail of an assistant message whose full
      // body already landed in the session JSONL), skip it so the user
      // does not see doubled bubbles.
      if (seenTextsRef.current.has(trimmed)) return;
      const msg: ChatMessage = {
        id: makeId(role === 'user' ? 'live-u' : 'live-w'),
        role,
        text: trimmed,
        ts: Date.now(),
        source: 'live',
      };
      rememberMessage(msg);
      setLiveMessages((prev) => {
        const next = [...prev, msg];
        return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next;
      });
    },
    [rememberMessage, seenTextsRef, setLiveMessages],
  );
}
