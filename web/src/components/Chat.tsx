// (11.4) Natural-language chatbot. Plain-input chat panel that talks to
// POST /nl/chat; the daemon does the parsing and dispatch. Session ids
// live in localStorage so the conversation survives page reloads.

import { FormEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Plus, RotateCcw, Send } from 'lucide-react';
import { apiPost } from '../lib/api';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Panel,
} from './ui';
import { cn } from '../lib/cn';

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
    <Card className="flex h-full min-h-0 w-full min-w-0 flex-col">
      <CardHeader className="flex-row items-start justify-between gap-2 p-4 md:p-5">
        <div>
          <CardTitle>Chat</CardTitle>
          <CardDescription>
            Natural-language control channel.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline" className="font-mono normal-case">
            session: {sessionId ? sessionId.slice(0, 8) : 'new'}
          </Badge>
          <Button type="button" variant="secondary" size="sm" onClick={newSession}>
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset</span>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 p-4 pt-0 md:p-5 md:pt-0">
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border bg-background px-3 py-3"
        >
          {messages.length === 0 ? (
            <div className="text-xs text-muted-foreground">
              Try: "list workers", "create worker w1", "tell w1 to run tests",
              "status", "close w1".
            </div>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  'mb-2 flex',
                  m.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                <div
                  className={cn(
                    'max-w-[80%] whitespace-pre-wrap rounded-md px-3 py-2 text-sm',
                    m.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground'
                  )}
                >
                  <div
                    className={cn(
                      'mb-0.5 flex items-center gap-2 text-[10px] uppercase tracking-wide',
                      m.role === 'user'
                        ? 'text-primary-foreground/80'
                        : 'text-muted-foreground'
                    )}
                  >
                    <span>{m.role}</span>
                    {m.intent ? (
                      <Badge variant="outline" className="px-1 py-0 text-[10px]">
                        {m.intent}
                      </Badge>
                    ) : null}
                    <span>{formatTime(m.ts)}</span>
                  </div>
                  <div>{m.text}</div>
                </div>
              </div>
            ))
          )}
        </div>

        {actions.length > 0 && (
          <Panel className="p-3">
            <div className="flex flex-wrap gap-2">
              {actions.map((a, idx) => (
                <Button
                  key={`${a.type}-${idx}`}
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => onActionClick(a)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>{a.label}</span>
                </Button>
              ))}
            </div>
          </Panel>
        )}

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
          >
            <span className="min-w-0 break-words">{error}</span>
          </div>
        )}

        <form onSubmit={onSubmit} className="flex gap-2">
          <Input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask something..."
            className="h-10 flex-1"
            disabled={sending}
            autoFocus
          />
          <Button
            type="submit"
            variant="default"
            size="md"
            disabled={sending || input.trim() === ''}
          >
            <Send className="h-4 w-4" />
            <span>{sending ? '...' : 'Send'}</span>
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
