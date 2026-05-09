import { useCallback, useEffect, useState } from 'react';
import { apiGet, eventSourceUrl } from './api';
import { t } from './i18n';
import type { Conversation, Turn } from '../components/ConversationView';

// (v1.10.659) Extracted from ConversationView. Bundles
// the GET /api/sessions/:id snapshot, the optional SSE
// /stream subscription, and the loading / error /
// streaming flags into one hook. Snapshot URL +
// stream URL are overrideable so a /history detail page
// can swap them without re-implementing the wire shape.
// `live=false` skips the SSE subscription — used for
// archived sessions where the daemon isn't streaming.

interface ConversationState {
  conversation: Conversation | null;
  error: string | null;
  loading: boolean;
  streaming: boolean;
  refresh: () => Promise<void>;
}

export function useConversation(args: {
  sessionId: string;
  live: boolean;
  snapshotUrl?: string | undefined;
  streamUrl?: string | undefined;
}): ConversationState {
  const { sessionId, live, snapshotUrl, streamUrl } = args;
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);

  const refresh = useCallback(async () => {
    if (!sessionId && !snapshotUrl) return;
    setLoading(true);
    setError(null);
    try {
      const url = snapshotUrl || `/api/sessions/${encodeURIComponent(sessionId)}`;
      const data = await apiGet<Conversation>(url);
      setConversation(data);
    } catch (err) {
      setError((err as Error).message || t('common.failedToLoadSession'));
    } finally {
      setLoading(false);
    }
  }, [sessionId, snapshotUrl]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!live) return;
    if (!sessionId && !streamUrl) return;
    const url = eventSourceUrl(
      streamUrl || `/api/sessions/${encodeURIComponent(sessionId)}/stream`,
    );
    let es: EventSource | null = null;
    try {
      es = new EventSource(url);
    } catch {
      return;
    }
    setStreaming(true);
    es.addEventListener('conversation', (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data) as Conversation;
        setConversation(data);
      } catch { /* ignore malformed frame */ }
    });
    es.addEventListener('turn', (ev) => {
      try {
        const turn = JSON.parse((ev as MessageEvent).data) as Turn;
        setConversation((prev) => {
          if (!prev) return { sessionId, projectPath: null, createdAt: null, updatedAt: turn.createdAt, model: null, totalInputTokens: 0, totalOutputTokens: 0, turns: [turn], warnings: [] };
          return {
            ...prev,
            turns: [...prev.turns, turn],
            updatedAt: turn.createdAt || prev.updatedAt,
            totalInputTokens: prev.totalInputTokens + (turn.tokens?.input || 0),
            totalOutputTokens: prev.totalOutputTokens + (turn.tokens?.output || 0),
          };
        });
      } catch { /* ignore malformed frame */ }
    });
    es.onerror = () => {
      setStreaming(false);
    };
    return () => {
      if (es) es.close();
      setStreaming(false);
    };
  }, [live, sessionId, streamUrl]);

  return { conversation, error, loading, streaming, refresh };
}
