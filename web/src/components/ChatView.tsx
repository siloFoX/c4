import {
  FormEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { apiFetch, eventSourceUrl } from '../lib/api';

interface ChatViewProps {
  workerName: string;
}

type Role = 'user' | 'worker';

interface ChatMessage {
  id: string;
  role: Role;
  text: string;
  ts: number;
}

// Amount of quiet time after the last SSE frame before we finalize the buffer
// into a single worker bubble. The Claude TUI emits many small chunks during
// a render pass; 1200ms comfortably covers a full response without merging
// two adjacent turns.
const WORKER_FLUSH_MS = 1200;
const MAX_MESSAGES = 300;
const AUTOSCROLL_THRESHOLD_PX = 24;

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

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export default function ChatView({ workerName }: ChatViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sseConnected, setSseConnected] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pendingBufRef = useRef<string>('');
  const flushTimerRef = useRef<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const appendMessage = useCallback((role: Role, text: string) => {
    const trimmed = text.replace(/^\s+|\s+$/g, '');
    if (!trimmed) return;
    setMessages((prev) => {
      const next = [...prev, { id: makeId(), role, text: trimmed, ts: Date.now() }];
      return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next;
    });
  }, []);

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
    appendMessage('worker', clean);
  }, [appendMessage]);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current != null) {
      window.clearTimeout(flushTimerRef.current);
    }
    flushTimerRef.current = window.setTimeout(flushWorkerBuffer, WORKER_FLUSH_MS);
  }, [flushWorkerBuffer]);

  useEffect(() => {
    setMessages([]);
    setInput('');
    setError(null);
    setAutoScroll(true);
    pendingBufRef.current = '';
    if (flushTimerRef.current != null) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
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

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distanceFromBottom <= AUTOSCROLL_THRESHOLD_PX;
    setAutoScroll(atBottom);
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
    appendMessage('user', text);
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
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="min-w-0 truncate text-base font-semibold text-gray-100 md:text-lg">
          {workerName}
        </h2>
        <div className="flex items-center gap-2 text-xs">
          <span
            className={`inline-flex items-center gap-1 rounded px-2 py-0.5 ${
              sseConnected
                ? 'bg-green-900/40 text-green-300'
                : 'bg-gray-800 text-gray-400'
            }`}
            aria-live="polite"
          >
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                sseConnected ? 'bg-green-400' : 'bg-gray-500'
              }`}
              aria-hidden="true"
            />
            {sseConnected ? 'live' : 'disconnected'}
          </span>
          {!autoScroll && (
            <button
              type="button"
              onClick={jumpToBottom}
              className="rounded bg-gray-700 px-2 py-0.5 text-gray-100 hover:bg-gray-600"
            >
              Jump to latest
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-2 rounded bg-red-900/40 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 min-w-0 flex-1 overflow-y-auto rounded bg-gray-950 p-3 md:p-4"
        role="log"
        aria-live="polite"
        aria-label={`Chat with ${workerName}`}
      >
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-600">
            No messages yet. Type below to talk to the worker.
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <li
                  key={msg.id}
                  className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm shadow-sm md:max-w-[75%] ${
                      isUser
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-800 text-gray-100'
                    }`}
                  >
                    <div
                      className={`mb-1 flex items-center gap-2 text-[10px] uppercase tracking-wide ${
                        isUser ? 'text-blue-100/80' : 'text-gray-400'
                      }`}
                    >
                      <span>{isUser ? 'You' : workerName}</span>
                      <span className="font-mono">{formatTime(msg.ts)}</span>
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

      <form onSubmit={handleSubmit} className="mt-3 flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder={`Message ${workerName}... (Enter to send, Shift+Enter for newline)`}
          className="min-w-0 flex-1 resize-y rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
          disabled={sending}
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending ? 'Sending...' : 'Send'}
        </button>
      </form>
    </div>
  );
}
