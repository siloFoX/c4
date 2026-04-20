import {
  FormEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ArrowDown, Loader2, Send, Sparkles } from 'lucide-react';
import { apiFetch, apiGet, eventSourceUrl } from '../lib/api';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from './ui';
import { cn } from '../lib/cn';

interface ChatViewProps {
  workerName: string;
}

type Role = 'user' | 'worker';
type Source = 'backfill' | 'live';

interface ChatMessage {
  id: string;
  role: Role;
  text: string;
  ts: number;
  source: Source;
}

// 8.25: shapes that match what the daemon returns for /api/sessions
// when workerName is provided. Kept loose so a partial session still
// renders.
interface ConversationTurn {
  id: string;
  role: 'user' | 'assistant' | 'thinking' | 'tool_use' | 'tool_result' | 'system';
  createdAt: string | null;
  content: string;
  toolName: string | null;
}

interface ConversationShape {
  sessionId: string;
  turns: ConversationTurn[];
}

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
const WORKER_FLUSH_MS = 1200;
const MAX_MESSAGES = 300;
const AUTOSCROLL_THRESHOLD_PX = 24;
const SCROLLBACK_PAGE = 2000;
const SCROLLBACK_MAX = 10000;

const ANSI_OSC = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
const ANSI_CSI = /\x1b\[[\d;?=]*[ -/]*[@-~]/g;
const ANSI_OTHER = /\x1b[=>()][0-9A-Za-z]?/g;
const CONTROL_CHARS = /[\x00-\x08\x0b-\x1f\x7f]/g;

export function stripAnsi(input: string): string {
  return input
    .replace(ANSI_OSC, '')
    .replace(ANSI_CSI, '')
    .replace(ANSI_OTHER, '')
    .replace(/\r(?!\n)/g, '\n')
    .replace(CONTROL_CHARS, '');
}

export function b64decode(b64: string): string {
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return '';
  }
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

// 8.25: turn the structured conversation returned by /api/sessions into
// the flat user/worker bubble list the chat renderer consumes. Only
// roles that make sense as a conversation (user text, assistant text,
// tool_use as an inline marker) are rendered; thinking, tool_result,
// and system meta are collapsed because they would double the noise
// and are better viewed in the dedicated ConversationView tab.
export function conversationToMessages(
  conv: ConversationShape | null | undefined,
): ChatMessage[] {
  if (!conv || !Array.isArray(conv.turns)) return [];
  const out: ChatMessage[] = [];
  for (const turn of conv.turns) {
    if (!turn || typeof turn !== 'object') continue;
    const ts = turn.createdAt ? Date.parse(turn.createdAt) : NaN;
    const safeTs = Number.isFinite(ts) ? ts : Date.now();
    if (turn.role === 'user' && turn.content && turn.content.trim()) {
      out.push({ id: turn.id, role: 'user', text: turn.content.trim(), ts: safeTs, source: 'backfill' });
    } else if (turn.role === 'assistant' && turn.content && turn.content.trim()) {
      out.push({ id: turn.id, role: 'worker', text: turn.content.trim(), ts: safeTs, source: 'backfill' });
    } else if (turn.role === 'tool_use' && turn.toolName) {
      out.push({
        id: turn.id,
        role: 'worker',
        text: `[tool: ${turn.toolName}]`,
        ts: safeTs,
        source: 'backfill',
      });
    }
  }
  return out;
}

// 8.25: fallback parser for raw PTY scrollback when the session JSONL
// is not yet resolvable (new worker / LOST state / --resume missed). We
// split on the Claude-TUI input prompt marker "> " at the start of a
// line so user lines get their own bubble; everything else collapses
// into worker bubbles between user turns. Best effort only - the
// ConversationView tab is still the source of truth.
export function scrollbackToMessages(raw: string): ChatMessage[] {
  if (!raw) return [];
  const cleaned = stripAnsi(raw);
  const lines = cleaned.split('\n');
  const out: ChatMessage[] = [];
  let workerBuf: string[] = [];
  const flushWorker = () => {
    const joined = workerBuf.join('\n').trim();
    workerBuf = [];
    if (!joined) return;
    out.push({
      id: makeId('bk-w'),
      role: 'worker',
      text: joined,
      ts: Date.now(),
      source: 'backfill',
    });
  };
  for (const line of lines) {
    const m = line.match(/^>\s+(.*\S)/);
    if (m) {
      flushWorker();
      out.push({
        id: makeId('bk-u'),
        role: 'user',
        text: m[1],
        ts: Date.now(),
        source: 'backfill',
      });
    } else {
      workerBuf.push(line);
    }
  }
  flushWorker();
  return out;
}

export default function ChatView({ workerName }: ChatViewProps) {
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [liveMessages, setLiveMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sseConnected, setSseConnected] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [backfillLoading, setBackfillLoading] = useState(true);
  const [backfillCount, setBackfillCount] = useState(0);
  const [backfillSource, setBackfillSource] = useState<'session' | 'scrollback' | null>(null);
  const [backfillError, setBackfillError] = useState<string | null>(null);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pendingBufRef = useRef<string>('');
  const flushTimerRef = useRef<number | null>(null);
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

  const flushWorkerBuffer = useCallback(() => {
    const raw = pendingBufRef.current;
    pendingBufRef.current = '';
    if (flushTimerRef.current != null) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    if (!raw) return;
    const clean = stripAnsi(raw).trim();
    if (!clean) return;
    appendLive('worker', clean);
  }, [appendLive]);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current != null) {
      window.clearTimeout(flushTimerRef.current);
    }
    flushTimerRef.current = window.setTimeout(flushWorkerBuffer, WORKER_FLUSH_MS);
  }, [flushWorkerBuffer]);

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
    pendingBufRef.current = '';
    if (flushTimerRef.current != null) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
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

  useEffect(() => {
    const url = eventSourceUrl(`/api/watch?name=${encodeURIComponent(workerName)}`);
    const es = new EventSource(url);
    es.onopen = () => setSseConnected(true);
    es.onerror = () => setSseConnected(false);
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as { type?: string; data?: string };
        if (data.type === 'output' && typeof data.data === 'string') {
          pendingBufRef.current += b64decode(data.data);
          scheduleFlush();
        }
      } catch {
        // ignore non-JSON payloads
      }
    };
    return () => {
      es.close();
      if (flushTimerRef.current != null) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      pendingBufRef.current = '';
    };
  }, [workerName, scheduleFlush]);

  useLayoutEffect(() => {
    if (!autoScroll) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, autoScroll]);

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
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distanceFromBottom <= AUTOSCROLL_THRESHOLD_PX;
    setAutoScroll(atBottom);
    // 8.25 infinite scroll: when the user hits the top of the log in
    // scrollback fallback mode, pull the next page of past lines.
    if (el.scrollTop <= 8 && hasOlder && !loadingOlder && backfillSource === 'scrollback') {
      void loadOlder();
    }
  };

  const jumpToBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setAutoScroll(true);
  };

  const handleSubmit = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    const text = input;
    if (!text.trim() || sending) return;
    setSending(true);
    setError(null);
    flushWorkerBuffer();
    appendLive('user', text);
    setInput('');
    setAutoScroll(true);
    try {
      const sendRes = await apiFetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: workerName, input: text }),
      });
      if (!sendRes.ok) throw new Error(`HTTP ${sendRes.status}`);
      const sendData = (await sendRes.json()) as { error?: string };
      if (sendData.error) {
        setError(sendData.error);
        setSending(false);
        return;
      }
      const keyRes = await apiFetch('/api/key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: workerName, key: 'Enter' }),
      });
      if (!keyRes.ok) throw new Error(`HTTP ${keyRes.status}`);
      const keyData = (await keyRes.json()) as { error?: string };
      if (keyData.error) setError(keyData.error);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <Card className="flex h-full min-h-0 min-w-0 flex-col">
      <CardHeader className="flex-row items-start justify-between gap-3 p-4 md:p-5">
        <div className="min-w-0">
          <CardTitle className="truncate">Chat</CardTitle>
          <CardDescription className="truncate">
            Live worker stream for {workerName}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {backfillCount > 0 && (
            <Badge variant="secondary" className="flex items-center gap-1" title={backfillSource === 'session' ? 'Loaded from session JSONL' : 'Loaded from scrollback'}>
              <span>Loaded {backfillCount} past {backfillCount === 1 ? 'message' : 'messages'}</span>
            </Badge>
          )}
          <Badge
            variant={sseConnected ? 'success' : 'secondary'}
            className="flex items-center gap-1"
            aria-live="polite"
          >
            <span
              className={cn(
                'inline-block h-1.5 w-1.5 rounded-full',
                sseConnected ? 'bg-emerald-400' : 'bg-muted-foreground'
              )}
              aria-hidden="true"
            />
            {sseConnected ? 'live' : 'disconnected'}
          </Badge>
          {!autoScroll && (
            <Button type="button" variant="secondary" size="sm" onClick={jumpToBottom}>
              <ArrowDown className="h-3.5 w-3.5" />
              <span>Jump to latest</span>
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-4 pt-0 md:p-5 md:pt-0">
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          >
            <span className="min-w-0 break-words">{error}</span>
          </div>
        )}
        {backfillError && !error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300"
          >
            <span className="min-w-0 break-words">
              Past-message backfill failed: {backfillError}. Live stream is still connected.
            </span>
          </div>
        )}

        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="min-h-0 min-w-0 flex-1 overflow-y-auto rounded-md border border-border bg-background p-3 md:p-4"
          role="log"
          aria-live="polite"
          aria-label={`Chat with ${workerName}`}
        >
          {backfillLoading ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              <span>Loading past messages...</span>
              <ul className="mt-4 w-full max-w-sm space-y-2" aria-hidden="true">
                <li className="h-8 animate-pulse rounded-md bg-muted/60" />
                <li className="h-12 animate-pulse rounded-md bg-muted/50" />
                <li className="h-8 animate-pulse rounded-md bg-muted/60" />
              </ul>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <Sparkles aria-hidden="true" className="h-4 w-4" />
              <span>No messages yet. Type below to talk to the worker.</span>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {hasOlder && backfillSource === 'scrollback' && (
                <li className="flex items-center justify-center py-1 text-xs text-muted-foreground">
                  {loadingOlder ? (
                    <span className="inline-flex items-center gap-1">
                      <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
                      Loading older messages...
                    </span>
                  ) : (
                    <Button type="button" variant="ghost" size="sm" onClick={() => void loadOlder()}>
                      Load older
                    </Button>
                  )}
                </li>
              )}
              {messages.map((msg) => {
                const isUser = msg.role === 'user';
                return (
                  <li
                    key={msg.id}
                    className={cn('flex', isUser ? 'justify-end' : 'justify-start')}
                  >
                    <div
                      className={cn(
                        'max-w-[85%] rounded-lg px-3 py-2 text-sm shadow-sm md:max-w-[75%]',
                        isUser
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-foreground',
                        msg.source === 'backfill' && 'opacity-90'
                      )}
                    >
                      <div
                        className={cn(
                          'mb-1 flex items-center gap-2 text-[10px] uppercase tracking-wide',
                          isUser
                            ? 'text-primary-foreground/80'
                            : 'text-muted-foreground'
                        )}
                      >
                        <span>{isUser ? 'You' : workerName}</span>
                        <span className="font-mono">{formatTime(msg.ts)}</span>
                        {msg.source === 'backfill' && (
                          <span className="font-mono text-[9px] opacity-70">past</span>
                        )}
                      </div>
                      <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed md:text-sm">
                        {msg.text}
                      </pre>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            placeholder={`Message ${workerName}... (Enter to send, Shift+Enter for newline)`}
            className={cn(
              'min-w-0 flex-1 resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50'
            )}
            disabled={sending}
          />
          <Button
            type="submit"
            variant="default"
            size="md"
            disabled={sending || !input.trim()}
          >
            <Send className="h-4 w-4" />
            <span>{sending ? 'Sending...' : 'Send'}</span>
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
