import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet } from './api';
import {
  conversationToMessages,
  scrollbackToMessages,
  type ChatMessage,
  type ConversationShape,
} from './chat-helpers';

// (v1.10.738) Extracted from ChatView. The
// worker-history backfill state machine — owns the
// `history` slot, six `backfill*` indicator slots,
// the four mutable refs that track the "messages
// already rendered" set + the scrollback page
// counter, the worker-change reset effect (which
// also fans out to a parent-supplied
// `onResetExtras` callback so the parent can clear
// the input / autoscroll / liveMessages state that
// belongs to it), the initial backfill loader
// (session JSONL → scrollback fallback), and the
// `loadOlder` infinite-scroll handler that pulls
// the next page in scrollback-fallback mode.
//
// The parent's appendLive dedup path reads
// `seenTextsRef.current.has(text)`; the matching
// `rememberMessage(m)` helper writes to both
// `seenIdsRef` and `seenTextsRef`. Both are
// exposed for that exact wiring.

const SCROLLBACK_PAGE = 2000;
const SCROLLBACK_MAX = 10000;

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

export interface UseChatBackfillState {
  history: ChatMessage[];
  setHistory: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  backfillLoading: boolean;
  backfillCount: number;
  backfillSource: 'session' | 'scrollback' | null;
  backfillError: string | null;
  hasOlder: boolean;
  loadingOlder: boolean;
  scrollbackLinesRef: React.MutableRefObject<number>;
  seenIdsRef: React.MutableRefObject<Set<string>>;
  seenTextsRef: React.MutableRefObject<Set<string>>;
  backfillReadyRef: React.MutableRefObject<boolean>;
  rememberMessage: (m: ChatMessage) => void;
  loadOlder: () => Promise<void>;
}

export function useChatBackfill(args: {
  workerName: string;
  liveMessages: ChatMessage[];
  onResetExtras?: () => void;
}): UseChatBackfillState {
  const { workerName, liveMessages, onResetExtras } = args;
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [backfillLoading, setBackfillLoading] = useState(true);
  const [backfillCount, setBackfillCount] = useState(0);
  const [backfillSource, setBackfillSource] = useState<'session' | 'scrollback' | null>(null);
  const [backfillError, setBackfillError] = useState<string | null>(null);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const scrollbackLinesRef = useRef<number>(SCROLLBACK_PAGE);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const seenTextsRef = useRef<Set<string>>(new Set());
  const backfillReadyRef = useRef<boolean>(false);

  const rememberMessage = useCallback((m: ChatMessage) => {
    seenIdsRef.current.add(m.id);
    seenTextsRef.current.add(m.text);
  }, []);

  // 8.25: worker-change reset + past-history backfill. Runs once per
  // workerName; cancels in-flight fetches via the `cancelled` closure
  // so a fast worker swap does not race stale state into the UI.
  useEffect(() => {
    let cancelled = false;
    setHistory([]);
    setBackfillLoading(true);
    setBackfillCount(0);
    setBackfillSource(null);
    setBackfillError(null);
    setHasOlder(false);
    scrollbackLinesRef.current = SCROLLBACK_PAGE;
    seenIdsRef.current = new Set();
    seenTextsRef.current = new Set();
    backfillReadyRef.current = false;
    onResetExtras?.();

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
  }, [workerName, onResetExtras]);

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

  return {
    history, setHistory,
    backfillLoading, backfillCount, backfillSource, backfillError,
    hasOlder, loadingOlder,
    scrollbackLinesRef, seenIdsRef, seenTextsRef, backfillReadyRef,
    rememberMessage, loadOlder,
  };
}
