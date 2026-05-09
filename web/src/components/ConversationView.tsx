import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Loader2 } from 'lucide-react';
import { useConversation } from '../lib/use-conversation';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from './ui';
import { cn } from '../lib/cn';
import { t, tFormat, useLocale } from '../lib/i18n';
import TurnRow from './ConversationTurns';

// Conversation contract mirrors src/session-parser.js. Keep the shapes
// loose (nullable fields) so a mid-session file still renders - the
// parser guarantees every turn has `id` + `role`, everything else is
// best effort.

export interface TurnTokens {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreate: number;
}

export type TurnRole =
  | 'user'
  | 'assistant'
  | 'thinking'
  | 'tool_use'
  | 'tool_result'
  | 'system';

export interface Turn {
  id: string;
  role: TurnRole;
  createdAt: string | null;
  durationMs: number | null;
  model: string | null;
  tokens: TurnTokens;
  content: string;
  toolName: string | null;
  toolArgs: unknown;
  toolUseId: string | null;
  toolResult: unknown;
  thinkingText: string | null;
  attachments: unknown[];
  raw?: unknown;
}

export interface Conversation {
  sessionId: string;
  projectPath: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  model: string | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  turns: Turn[];
  warnings: string[];
}

interface ConversationViewProps {
  sessionId: string;
  live?: boolean;
  className?: string;
  // (8.17) Optional override for the snapshot URL. The Sessions tab
  // passes `/api/attach/<name>/conversation` when the user clicks an
  // attached row so the viewer reuses all rendering code without
  // duplicating markup.
  snapshotUrl?: string;
  streamUrl?: string;
}

const AUTOSCROLL_THRESHOLD_PX = 24;

// (v1.10.560) Markdown render + format helpers extracted to
// ../lib/conversation-render.tsx — see import above.

// (v1.10.566) Six per-role turn renderers + RoleHeader + the
// TurnRow dispatcher extracted to ./ConversationTurns.tsx.

export default function ConversationView({
  sessionId,
  live = false,
  className,
  snapshotUrl,
  streamUrl,
}: ConversationViewProps) {
  useLocale();
  // (v1.10.659) Snapshot fetch + SSE stream + state slots
  // moved to lib/use-conversation.
  const { conversation, error, loading, streaming } =
    useConversation({ sessionId, live, snapshotUrl, streamUrl });
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll on new turns, but only if the user has not scrolled up.
  useLayoutEffect(() => {
    if (!autoScroll) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [conversation?.turns.length, autoScroll]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setAutoScroll(bottom <= AUTOSCROLL_THRESHOLD_PX);
  }, []);

  const turnBlocks = useMemo(() => {
    if (!conversation) return [];
    // Pair tool_use + tool_result so the result is not rendered twice
    // - the ToolUseTurn already shows the result inline when expanded.
    const pairedResultIds = new Set<string>();
    for (const t of conversation.turns) {
      if (t.role === 'tool_use' && t.toolResult != null && t.toolUseId) {
        pairedResultIds.add(t.toolUseId);
      }
    }
    return conversation.turns.filter(
      (t) => !(t.role === 'tool_result' && t.toolUseId && pairedResultIds.has(t.toolUseId)),
    );
  }, [conversation]);

  const header = (
    <CardHeader className="border-b border-border p-4 md:p-6">
      <div className="flex items-center gap-2">
        <CardTitle className="truncate text-base md:text-lg">
          {conversation?.sessionId || sessionId}
        </CardTitle>
        {live ? (
          <Badge variant={streaming ? 'success' : 'secondary'}>
            {streaming ? t('conversation.streaming.live') : t('conversation.streaming.idle')}
          </Badge>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {conversation?.projectPath ? (
          <span className="truncate">{conversation.projectPath}</span>
        ) : null}
        {conversation?.model ? (
          <span>{tFormat('conversation.header.model', { model: conversation.model })}</span>
        ) : null}
        {conversation ? (
          <span>
            {tFormat('conversation.header.turns', { count: conversation.turns.length.toLocaleString() })}
          </span>
        ) : null}
        {conversation ? (
          <span>
            {tFormat('conversation.header.tokens', {
              input: conversation.totalInputTokens.toLocaleString(),
              output: conversation.totalOutputTokens.toLocaleString(),
            })}
          </span>
        ) : null}
        {conversation?.warnings && conversation.warnings.length > 0 ? (
          <Badge variant="warning">
            {tFormat('conversation.header.warnings', { count: conversation.warnings.length })}
          </Badge>
        ) : null}
      </div>
    </CardHeader>
  );

  return (
    <Card className={cn('flex h-full min-h-0 flex-col overflow-hidden', className)}>
      {header}
      <CardContent className="flex min-h-0 flex-1 flex-col gap-0 p-0">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-3 py-4 md:px-6"
          data-testid="conversation-scroll"
        >
          {loading && !conversation ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              {t('sessions.loadingSession')}
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center text-sm text-destructive">
              {error}
            </div>
          ) : !conversation || conversation.turns.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {t('conversation.empty')}
            </div>
          ) : (
            <div className="mx-auto flex max-w-4xl flex-col gap-4">
              {turnBlocks.map((turn) => (
                <TurnRow key={turn.id} turn={turn} />
              ))}
            </div>
          )}
        </div>
        {!autoScroll ? (
          <div className="border-t border-border bg-background/80 px-3 py-2 text-right md:px-6">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const el = scrollRef.current;
                if (el) el.scrollTop = el.scrollHeight;
                setAutoScroll(true);
              }}
            >
              {t('conversation.jumpToLatest')}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
