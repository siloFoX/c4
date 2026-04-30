// 8.6: chat-style view of a worker's session.
// Lines are styled per Claude Code TUI marker:
//   `❯ ...`  - user-sent prompt        (right bubble)
//   `● ...`  - tool result line        (left bubble, dim)
//   `⎿ ...`  - tool sub-output         (left bubble, dim)
//   `✻ ...`  - thinking spinner status (centered, faint)
//   other    - assistant text          (left bubble)
// Polls /read-now (3s) for snapshot + reads scrollback once on mount so the
// user sees the full conversation, not just the visible pane.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface WorkerChatProps {
  workerName: string;
}

interface ReadResponse {
  content?: string;
  error?: string;
  status?: string;
  lines?: number;
}

type Speaker = 'user' | 'assistant' | 'tool' | 'spinner' | 'system';

interface ChatLine {
  id: number;
  speaker: Speaker;
  text: string;
}

let lineKey = 0;

function classify(line: string): Speaker {
  const t = line.trimStart();
  if (t.startsWith('❯ ')) return 'user';
  if (t.startsWith('● ')) return 'tool';
  if (t.startsWith('⎿ ') || t.startsWith('  ⎿ ')) return 'tool';
  if (t.startsWith('✻ ')) return 'spinner';
  if (t.startsWith('[C4') || t.startsWith('[HEALTH]') || t.startsWith('[SCOPE')) return 'system';
  return 'assistant';
}

function toLines(raw: string): ChatLine[] {
  if (!raw) return [];
  // Drop noise: empty trailing lines, vertical-bar-only lines, ──── separators
  const filtered = raw
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .filter((l) => l.length > 0)
    .filter((l) => !/^[\s─-▟]+$/.test(l));

  return filtered.map((text) => ({ id: ++lineKey, speaker: classify(text), text }));
}

async function postJson(url: string, body: unknown): Promise<{ error?: string }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { error: `HTTP ${res.status}` };
  return (await res.json().catch(() => ({}))) as { error?: string };
}

export default function WorkerChat({ workerName }: WorkerChatProps) {
  const [raw, setRaw] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const fetchSnapshot = useCallback(async () => {
    try {
      // Pull scrollback for full history; /read-now only gives current pane.
      const res = await fetch(
        `/api/scrollback?name=${encodeURIComponent(workerName)}&lines=400`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as ReadResponse;
      if (data.error) {
        setError(data.error);
      } else {
        setRaw(typeof data.content === 'string' ? data.content : '');
        setError(null);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, [workerName]);

  useEffect(() => {
    setRaw('');
    setError(null);
    setStatusMsg(null);
    fetchSnapshot();

    // 8.6 (revised): /watch SSE-based realtime. The endpoint streams raw
    // PTY chunks; we treat each chunk as a "screen changed" tick and
    // refetch scrollback (rendered + compacted by the daemon). A 3s safety
    // poll backs it up in case the SSE connection drops mid-flight.
    let pendingFetch: ReturnType<typeof setTimeout> | null = null;
    const scheduleFetch = () => {
      if (pendingFetch) return;
      pendingFetch = setTimeout(() => {
        pendingFetch = null;
        fetchSnapshot();
      }, 200); // small debounce so a burst of PTY chunks → 1 fetch
    };

    const url = `/api/watch?name=${encodeURIComponent(workerName)}`;
    const es = new EventSource(url);
    es.onmessage = (ev) => {
      try {
        const evt = JSON.parse(ev.data) as { type?: string };
        if (evt.type === 'output') scheduleFetch();
      } catch {
        // ignore non-JSON frames
      }
    };
    es.onerror = () => {
      // EventSource auto-reconnects on most errors; do nothing.
    };

    const interval = setInterval(fetchSnapshot, 3000);
    return () => {
      es.close();
      if (pendingFetch) clearTimeout(pendingFetch);
      clearInterval(interval);
    };
  }, [fetchSnapshot, workerName]);

  const lines = useMemo(() => toLines(raw), [raw]);

  // Auto-scroll to bottom as new lines come in.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text) return;
    setBusy(true);
    setStatusMsg(null);
    try {
      const res = await postJson('/api/send', { name: workerName, input: text });
      if (res.error) {
        setStatusMsg(`Send failed: ${res.error}`);
        return;
      }
      setInput('');
      // /send writes text + Enter; refresh snapshot so the user sees the
      // turn taken without waiting for the 3s poll.
      setTimeout(fetchSnapshot, 400);
    } finally {
      setBusy(false);
      // Refocus the input so the user can keep typing.
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [input, workerName, fetchSnapshot]);

  const sendEnter = useCallback(async () => {
    setBusy(true);
    try {
      await postJson('/api/key', { name: workerName, key: 'Enter' });
      setTimeout(fetchSnapshot, 400);
    } finally {
      setBusy(false);
    }
  }, [workerName, fetchSnapshot]);

  const interrupt = useCallback(async () => {
    setBusy(true);
    try {
      await postJson('/api/key', { name: workerName, key: 'C-c' });
      setTimeout(fetchSnapshot, 400);
    } finally {
      setBusy(false);
    }
  }, [workerName, fetchSnapshot]);

  return (
    <div className="flex h-full flex-col">
      {error && (
        <div className="mb-2 rounded border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <div
        ref={scrollRef}
        className="flex-1 overflow-auto rounded bg-background p-4 text-sm"
      >
        {lines.length === 0 ? (
          <div className="text-muted/60">(no messages yet)</div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {lines.map((l) => (
              <ChatBubble key={l.id} line={l} />
            ))}
          </div>
        )}
      </div>

      {statusMsg && (
        <div className="mt-2 text-xs text-warning">{statusMsg}</div>
      )}

      <div className="mt-3 flex flex-col items-stretch gap-2 sm:flex-row sm:items-end">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Message worker (Enter to send, Shift+Enter for newline)"
          rows={2}
          disabled={busy}
          className="min-w-0 flex-1 resize-none rounded border border-border bg-surface px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted/70 focus:border-primary focus:outline-none disabled:opacity-60"
        />
        <div className="flex flex-row gap-1.5 sm:flex-col">
          <button
            type="button"
            onClick={() => void send()}
            disabled={busy || !input.trim()}
            className="rounded bg-primary/15 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/25 ring-1 ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send
          </button>
          <button
            type="button"
            onClick={() => void sendEnter()}
            disabled={busy}
            className="rounded bg-surface-3 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-2 disabled:opacity-50"
          >
            Enter
          </button>
          <button
            type="button"
            onClick={() => void interrupt()}
            disabled={busy}
            className="rounded bg-danger/15 px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/25 ring-1 ring-danger/40 disabled:opacity-50"
            title="Send Ctrl+C to the worker"
          >
            Ctrl+C
          </button>
        </div>
      </div>
    </div>
  );
}

function ChatBubble({ line }: { line: ChatLine }) {
  const base = 'whitespace-pre-wrap break-words rounded px-3 py-1.5 font-mono text-xs';
  switch (line.speaker) {
    case 'user':
      return (
        <div className="flex justify-end">
          <div className={`${base} max-w-[80%] bg-primary/15 text-foreground ring-1 ring-primary/40`}>
            {line.text.replace(/^\s*❯\s?/, '')}
          </div>
        </div>
      );
    case 'tool':
      return (
        <div className={`${base} max-w-[90%] self-start bg-surface-2/60 text-foreground/80`}>
          {line.text}
        </div>
      );
    case 'spinner':
      return (
        <div className={`${base} self-center text-[10px] uppercase tracking-wide text-muted/80`}>
          {line.text}
        </div>
      );
    case 'system':
      return (
        <div className={`${base} max-w-[90%] self-start bg-warning/15 text-warning ring-1 ring-warning/40`}>
          {line.text}
        </div>
      );
    default:
      return (
        <div className={`${base} max-w-[80%] self-start bg-surface-2 text-foreground`}>
          {line.text}
        </div>
      );
  }
}
