import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { apiGet } from '../lib/api';
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
import {
  conversationToMessages,
  makeId,
  scrollbackToMessages,
  type ChatMessage,
  type ConversationShape,
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

interface SessionByWorkerResponse {
  sessionId: string | null;
  conversation: ConversationShape | null;
  workerName?: string;
}

interface ScrollbackResponse {
  content?: string;
  lines?: number;
  totalScrollback?: number;
  error?: string;
}

// Amount of quiet time after the last SSE frame before we finalize the buffer
// into a single worker bubble. The Claude TUI emits many small chunks during
// a render pass; 1200ms comfortably covers a full response without merging
// two adjacent turns.
// (v1.10.665) WORKER_FLUSH_MS + buffer flusher moved to
// lib/use-worker-buffer-flusher.
const MAX_MESSAGES = 300;
// (v1.10.676) AUTOSCROLL_THRESHOLD_PX moved to lib/use-auto-scroll.
const SCROLLBACK_PAGE = 2000;
const SCROLLBACK_MAX = 10000;

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
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [liveMessages, setLiveMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [backfillLoading, setBackfillLoading] = useState(true);
  const [backfillCount, setBackfillCount] = useState(0);
  const [backfillSource, setBackfillSource] = useState<'session' | 'scrollback' | null>(null);
  const [backfillError, setBackfillError] = useState<string | null>(null);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollbackLinesRef = useRef<number>(SCROLLBACK_PAGE);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const seenTextsRef = useRef<Set<string>>(new Set());
  const backfillReadyRef = useRef<boolean>(false);

  const messages = useMemo<ChatMessage[]>(() => {
    const merged = [...history, ...liveMessages];
    return merged.length > MAX_MESSAGES ? merged.slice(-MAX_MESSAGES) : merged;
  }, [history, liveMessages]);

  const rememberMessage = useCallback((m: ChatMessage) => {
    seenIdsRef.current.add(m.id);
    seenTextsRef.current.add(m.text);
  }, []);

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
    [rememberMessage],
  );

  // (v1.10.665) Worker buffer flusher (debounce + ANSI strip)
  // moved to lib/use-worker-buffer-flusher.
  const { pendingBufRef, flushWorkerBuffer, scheduleFlush, reset: resetFlusher } =
    useWorkerBufferFlusher({ appendLive });

  // 8.25: worker-change reset + past-history backfill. Runs once per
  // workerName; cancels in-flight fetches via the `cancelled` closure
  // so a fast worker swap does not race stale state into the UI.
  useEffect(() => {
    let cancelled = false;
    setHistory([]);
    setLiveMessages([]);
    setInput('');
    setError(null);
    setAutoScroll(true);
    setBackfillLoading(true);
    setBackfillCount(0);
    setBackfillSource(null);
    setBackfillError(null);
    setHasOlder(false);
    resetFlusher();
    scrollbackLinesRef.current = SCROLLBACK_PAGE;
    seenIdsRef.current = new Set();
    seenTextsRef.current = new Set();
    backfillReadyRef.current = false;

    async function loadBackfill() {
      try {
        const sessionUrl = `/api/sessions?workerName=${encodeURIComponent(workerName)}`;
        const sess = await apiGet<SessionByWorkerResponse>(sessionUrl);
        if (cancelled) return;
        if (sess && sess.conversation && Array.isArray(sess.conversation.turns) && sess.conversation.turns.length > 0) {
          const msgs = conversationToMessages(sess.conversation);
          for (const m of msgs) {
            seenIdsRef.current.add(m.id);
            seenTextsRef.current.add(m.text);
          }
          if (cancelled) return;
          setHistory(msgs);
          setBackfillCount(msgs.length);
          setBackfillSource('session');
          setHasOlder(false);
          setBackfillLoading(false);
          backfillReadyRef.current = true;
          return;
        }
      } catch (err) {
        if (cancelled) return;
        setBackfillError((err as Error).message);
      }

      try {
        const scrollbackUrl = `/api/scrollback?name=${encodeURIComponent(workerName)}&lines=${scrollbackLinesRef.current}`;
        const sb = await apiGet<ScrollbackResponse>(scrollbackUrl);
        if (cancelled) return;
        if (sb.error) {
          setBackfillError(sb.error);
          setBackfillSource(null);
          setBackfillLoading(false);
          backfillReadyRef.current = true;
          return;
        }
        const msgs = scrollbackToMessages(sb.content || '');
        for (const m of msgs) {
          seenIdsRef.current.add(m.id);
          seenTextsRef.current.add(m.text);
        }
        setHistory(msgs);
        setBackfillCount(msgs.length);
        setBackfillSource('scrollback');
        setHasOlder(Boolean(sb.totalScrollback && sb.lines && sb.totalScrollback > sb.lines));
        setBackfillLoading(false);
        backfillReadyRef.current = true;
      } catch (err) {
        if (cancelled) return;
        setBackfillError((err as Error).message);
        setBackfillLoading(false);
        backfillReadyRef.current = true;
      }
    }

    void loadBackfill();
    return () => {
      cancelled = true;
    };
  }, [workerName]);

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

  // 8.25: load-older handler. Only scrollback-mode has a "more history"
  // story - session JSONL already contains the full conversation.
  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasOlder || backfillSource !== 'scrollback') return;
    const nextLines = Math.min(scrollbackLinesRef.current + SCROLLBACK_PAGE, SCROLLBACK_MAX);
    if (nextLines === scrollbackLinesRef.current) {
      setHasOlder(false);
      return;
    }
    setLoadingOlder(true);
    try {
      const url = `/api/scrollback?name=${encodeURIComponent(workerName)}&lines=${nextLines}`;
      const sb = await apiGet<ScrollbackResponse>(url);
      if (sb.error) {
        setBackfillError(sb.error);
        return;
      }
      const msgs = scrollbackToMessages(sb.content || '');
      const nextIds = new Set<string>();
      const nextTexts = new Set<string>();
      for (const m of msgs) {
        nextIds.add(m.id);
        nextTexts.add(m.text);
      }
      // Preserve any live-stream texts that were already rendered so
      // they stay recognized by the dedup check after rehydration.
      for (const m of liveMessages) nextTexts.add(m.text);
      seenIdsRef.current = nextIds;
      seenTextsRef.current = nextTexts;
      scrollbackLinesRef.current = nextLines;
      setHistory(msgs);
      setBackfillCount(msgs.length);
      setHasOlder(Boolean(sb.totalScrollback && sb.lines && sb.totalScrollback > sb.lines) && nextLines < SCROLLBACK_MAX);
    } catch (err) {
      setBackfillError((err as Error).message);
    } finally {
      setLoadingOlder(false);
    }
  }, [backfillSource, hasOlder, liveMessages, loadingOlder, workerName]);

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
