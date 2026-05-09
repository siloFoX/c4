import {
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocale } from '../lib/i18n';
import {
  Card,
  CardContent,
} from './ui';
import ChatHeader from './ChatHeader';
import ChatComposer from './ChatComposer';
import ChatErrorBanners from './ChatErrorBanners';
import { useChatSseStream } from '../lib/use-chat-sse-stream';
import { useWorkerBufferFlusher } from '../lib/use-worker-buffer-flusher';
import { useChatSubmit } from '../lib/use-chat-submit';
import { useAutoScroll } from '../lib/use-auto-scroll';
import { useChatBackfill } from '../lib/use-chat-backfill';
import {
  makeId,
  type ChatMessage,
  type Role,
} from '../lib/chat-helpers';
import ChatMessageLog from './ChatMessageLog';

interface ChatViewProps {
  workerName: string;
}

// (v1.10.563) Pure data transforms (stripAnsi / b64decode /
// makeId / formatTime / conversationToMessages /
// scrollbackToMessages) plus the ChatMessage / ConversationShape
// types extracted to ../lib/chat-helpers.ts.
// (v1.10.738) SessionByWorkerResponse + ScrollbackResponse types +
// SCROLLBACK_PAGE/MAX constants moved into use-chat-backfill alongside
// the fetch logic.

// Amount of quiet time after the last SSE frame before we finalize the buffer
// into a single worker bubble. The Claude TUI emits many small chunks during
// a render pass; 1200ms comfortably covers a full response without merging
// two adjacent turns.
// (v1.10.665) WORKER_FLUSH_MS + buffer flusher moved to
// lib/use-worker-buffer-flusher.
const MAX_MESSAGES = 300;
// (v1.10.676) AUTOSCROLL_THRESHOLD_PX moved to lib/use-auto-scroll.

// (v1.10.563) Pure helpers (stripAnsi, b64decode, makeId,
// formatTime, conversationToMessages, scrollbackToMessages) plus
// the ChatMessage / ConversationShape / Role types live in
// ../lib/chat-helpers.ts. Re-export the API surface that the
// existing tests source-grep so contracts hold.
export {
  stripAnsi,
  b64decode,
  conversationToMessages,
  scrollbackToMessages,
} from '../lib/chat-helpers';

export default function ChatView({ workerName }: ChatViewProps) {
  useLocale();
  const [liveMessages, setLiveMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // (v1.10.738) History + 6 backfill state slots + 4 refs + worker-change
  // reset effect + loadBackfill + loadOlder moved to lib/use-chat-backfill.
  // The hook fans out to the parent's resetExtras callback so liveMessages /
  // input / error / autoScroll / flusher can be cleared in lockstep.
  const onResetExtras = useCallback(() => {
    setLiveMessages([]);
    setInput('');
    setError(null);
    setAutoScroll(true);
    resetFlusher();
  // setAutoScroll + resetFlusher come from hooks declared below — they're
  // stable identities so the dep list ref equality stays constant.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const {
    history,
    backfillLoading, backfillCount, backfillSource, backfillError,
    hasOlder, loadingOlder,
    seenTextsRef, rememberMessage, loadOlder,
  } = useChatBackfill({ workerName, liveMessages, onResetExtras });

  const messages = useMemo<ChatMessage[]>(() => {
    const merged = [...history, ...liveMessages];
    return merged.length > MAX_MESSAGES ? merged.slice(-MAX_MESSAGES) : merged;
  }, [history, liveMessages]);

  const appendLive = useCallback(
    (role: Role, text: string) => {
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
    [rememberMessage, seenTextsRef],
  );

  // (v1.10.665) Worker buffer flusher (debounce + ANSI strip)
  // moved to lib/use-worker-buffer-flusher.
  const { pendingBufRef, flushWorkerBuffer, scheduleFlush, reset: resetFlusher } =
    useWorkerBufferFlusher({ appendLive });

  // (v1.10.643) /api/watch SSE stream hook extracted to
  // ../lib/use-chat-sse-stream.
  const { sseConnected } = useChatSseStream({
    workerName,
    onOutput: (raw) => {
      pendingBufRef.current += raw;
      scheduleFlush();
    },
    onCleanup: resetFlusher,
  });

  // (v1.10.676) Auto-scroll-on-new-message moved to hook.
  const { autoScroll, setAutoScroll, jumpToBottom, isAtBottom } =
    useAutoScroll({ scrollRef, bumpKey: messages.length });

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setAutoScroll(isAtBottom());
    // 8.25 infinite scroll: when the user hits the top of the log in
    // scrollback fallback mode, pull the next page of past lines.
    if (el.scrollTop <= 8 && hasOlder && !loadingOlder && backfillSource === 'scrollback') {
      void loadOlder();
    }
  };
  // (v1.10.673) Submit flow moved to lib/use-chat-submit.
  const { sending, handleSubmit } = useChatSubmit({
    workerName, input, setInput, setError, setAutoScroll,
    flushWorkerBuffer, appendLive, textareaRef,
  });

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <Card className="flex h-full min-h-0 min-w-0 flex-col">
      {/* (v1.10.583) Card header extracted to ./ChatHeader.tsx. */}
      <ChatHeader
        workerName={workerName}
        backfillCount={backfillCount}
        backfillSource={backfillSource}
        sseConnected={sseConnected}
        autoScroll={autoScroll}
        onJumpToBottom={jumpToBottom}
      />

      <CardContent className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-4 pt-0 md:p-5 md:pt-0">
        {/* (v1.10.621) Error banners extracted to ./ChatErrorBanners.tsx. */}
        <ChatErrorBanners error={error} backfillError={backfillError} />

        {/* (v1.10.604) Message log scroll container extracted to
            ./ChatMessageLog.tsx. */}
        <ChatMessageLog
          scrollRef={scrollRef}
          onScroll={onScroll}
          workerName={workerName}
          backfillLoading={backfillLoading}
          backfillSource={backfillSource}
          hasOlder={hasOlder}
          loadingOlder={loadingOlder}
          messages={messages}
          onLoadOlder={() => void loadOlder()}
        />

        {/* (v1.10.612) Composer form extracted to ./ChatComposer.tsx. */}
        <ChatComposer
          textareaRef={textareaRef}
          input={input}
          workerName={workerName}
          sending={sending}
          onChangeInput={setInput}
          onKeyDown={onKeyDown}
          onSubmit={handleSubmit}
        />
      </CardContent>
    </Card>
  );
}
