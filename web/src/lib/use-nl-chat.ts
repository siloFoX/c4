import { useCallback, useEffect, useState } from 'react';
import { apiPost } from './api';

// (v1.10.667) Extracted from Chat. The natural-language
// chat session — POST /api/nl/chat with optional
// sessionId, append both user and assistant bubbles to
// the messages list, surface the action button list, and
// persist the sessionId to localStorage so a refresh
// keeps the same conversation.

const SESSION_KEY = 'c4.nl.sessionId';

type Role = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: Role;
  text: string;
  intent?: string;
  ts: number;
}

export interface ChatAction {
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

interface NlChatState {
  messages: ChatMessage[];
  sending: boolean;
  error: string | null;
  actions: ChatAction[];
  sessionId: string | null;
  sendText: (text: string) => Promise<void>;
  newSession: () => void;
}

export function useNlChat(): NlChatState {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(() => loadSessionId());
  const [actions, setActions] = useState<ChatAction[]>([]);

  useEffect(() => {
    saveSessionId(sessionId);
  }, [sessionId]);

  const sendText = useCallback(async (text: string) => {
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
  }, [sending, sessionId]);

  const newSession = useCallback(() => {
    setSessionId(null);
    setMessages([]);
    setActions([]);
    setError(null);
  }, []);

  return { messages, sending, error, actions, sessionId, sendText, newSession };
}
