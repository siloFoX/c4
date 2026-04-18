// (11.4) Natural-language chatbot. Plain-input chat panel that talks to
// POST /nl/chat; the daemon does the parsing and dispatch. Session ids
// live in localStorage so the conversation survives page reloads.

import { FormEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { apiPost } from '../lib/api';

const SESSION_KEY = 'c4.nl.sessionId';

type Role = 'user' | 'assistant';

interface ChatMessage {
  id: string;
  role: Role;
  text: string;
  intent?: string;
  ts: number;
}

interface ChatAction {
  type: string;
  worker?: string;
  label: string;
}

interface ChatResponse {
  sessionId: string;
  response: string;
  intent: string;
  confidence?: number;
  actions?: ChatAction[];
  error?: string;
}

function loadSessionId(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function saveSessionId(id: string | null): void {
  try {
    if (id) localStorage.setItem(SESSION_KEY, id);
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export default function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(() => loadSessionId());
  const [actions, setActions] = useState<ChatAction[]>([]);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  useEffect(() => {
    saveSessionId(sessionId);
  }, [sessionId]);

  const sendText = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;
      setSending(true);
      setError(null);
      const userMsg: ChatMessage = { id: makeId(), role: 'user', text: trimmed, ts: Date.now() };
      setMessages((prev) => [...prev, userMsg]);
      try {
        const body = { sessionId: sessionId || undefined, text: trimmed };
        const res = await apiPost<ChatResponse>('/api/nl/chat', body);
        if (res.error) {
          setError(res.error);
        } else {
          if (res.sessionId) setSessionId(res.sessionId);
          const replyMsg: ChatMessage = {
            id: makeId(),
            role: 'assistant',
            text: res.response || '(no response)',
            intent: res.intent,
            ts: Date.now(),
          };
          setMessages((prev) => [...prev, replyMsg]);
          setActions(Array.isArray(res.actions) ? res.actions : []);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setSending(false);
      }
    },
    [sending, sessionId],
  );

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = input;
    setInput('');
    void sendText(text);
  };

  const onActionClick = (action: ChatAction) => {
    let prompt = '';
    switch (action.type) {
      case 'send_task':
        prompt = action.worker ? `tell ${action.worker} to ` : '';
        setInput(prompt);
        return;
      case 'read_output':
        prompt = action.worker ? `show ${action.worker} output` : '';
        break;
      case 'get_status':
        prompt = 'status';
        break;
      case 'close_worker':
        prompt = action.worker ? `close ${action.worker}` : '';
        break;
      default:
        prompt = action.label;
    }
    if (prompt) void sendText(prompt);
  };

  const newSession = () => {
    setSessionId(null);
    setMessages([]);
    setActions([]);
    setError(null);
  };

  return (
    <div className="flex h-full min-h-0 flex-col rounded border border-gray-800 bg-gray-900">
      <div className="flex items-center justify-between border-b border-gray-800 px-3 py-2">
        <h2 className="text-sm font-medium text-gray-200">NL Chat</h2>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span>session: {sessionId ? sessionId.slice(0, 8) : 'new'}</span>
          <button
            type="button"
            onClick={newSession}
            className="rounded bg-gray-700 px-2 py-0.5 text-gray-200 hover:bg-gray-600"
          >
            Reset
          </button>
        </div>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {messages.length === 0 ? (
          <div className="text-xs text-gray-500">
            Try: "list workers", "create worker w1", "tell w1 to run tests", "status", "close w1".
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`mb-2 flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] whitespace-pre-wrap rounded px-3 py-2 text-sm ${
                  m.role === 'user'
                    ? 'bg-blue-700 text-gray-50'
                    : 'bg-gray-800 text-gray-100'
                }`}
              >
                <div className="mb-0.5 flex items-center gap-2 text-[10px] uppercase tracking-wide text-gray-300">
                  <span>{m.role}</span>
                  {m.intent ? <span className="rounded bg-gray-700 px-1 py-0.5">{m.intent}</span> : null}
                  <span>{formatTime(m.ts)}</span>
                </div>
                <div>{m.text}</div>
              </div>
            </div>
          ))
        )}
      </div>
      {actions.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-gray-800 px-3 py-2">
          {actions.map((a, idx) => (
            <button
              key={`${a.type}-${idx}`}
              type="button"
              onClick={() => onActionClick(a)}
              className="rounded bg-gray-700 px-2 py-1 text-xs text-gray-100 hover:bg-gray-600"
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
      {error && (
        <div className="border-t border-red-900 bg-red-950 px-3 py-2 text-xs text-red-200">{error}</div>
      )}
      <form onSubmit={onSubmit} className="flex gap-2 border-t border-gray-800 px-3 py-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask something..."
          className="flex-1 rounded bg-gray-800 px-3 py-2 text-sm text-gray-100 outline-none placeholder:text-gray-500 focus:ring-1 focus:ring-blue-500"
          disabled={sending}
          autoFocus
        />
        <button
          type="submit"
          disabled={sending || input.trim() === ''}
          className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending ? '...' : 'Send'}
        </button>
      </form>
    </div>
  );
}
