import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Bot,
  Brain,
  ChevronDown,
  ChevronRight,
  Cog,
  FileText,
  Loader2,
  Terminal,
  User,
  Wrench,
} from 'lucide-react';
import { apiGet, eventSourceUrl } from '../lib/api';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from './ui';
import { cn } from '../lib/cn';

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
}

const AUTOSCROLL_THRESHOLD_PX = 24;

function formatTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function formatTokens(t: TurnTokens): string {
  const parts: string[] = [];
  if (t.input) parts.push(`${t.input.toLocaleString()} in`);
  if (t.output) parts.push(`${t.output.toLocaleString()} out`);
  if (t.cacheRead) parts.push(`${t.cacheRead.toLocaleString()} cache-r`);
  if (t.cacheCreate) parts.push(`${t.cacheCreate.toLocaleString()} cache-w`);
  return parts.join(' ');
}

// Minimal markdown renderer - handles paragraphs, headings, fenced
// code blocks, inline code, bold, italic, unordered lists, and block
// quotes. Deliberately zero-dep so the bundle stays lean per the 8.18
// spec. Assistant output shape covers ~95% with these primitives.
function renderMarkdown(source: string): JSX.Element[] {
  if (!source) return [];
  const out: JSX.Element[] = [];
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];
    const fenceMatch = line.match(/^```(\w+)?\s*$/);
    if (fenceMatch) {
      const lang = fenceMatch[1] || '';
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        buf.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1; // consume closing fence
      out.push(
        <pre
          key={`md-${key++}`}
          className="my-2 overflow-x-auto rounded-md border border-border bg-muted/60 px-3 py-2 text-xs leading-relaxed"
        >
          <code className={cn('font-mono text-foreground', lang && `language-${lang}`)}>
            {buf.join('\n')}
          </code>
        </pre>,
      );
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      const sizeClass =
        level <= 2 ? 'text-lg' : level === 3 ? 'text-base' : 'text-sm';
      out.push(
        <p
          key={`md-${key++}`}
          className={cn('my-2 font-semibold text-foreground', sizeClass)}
        >
          {renderInline(text)}
        </p>,
      );
      i += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ''));
        i += 1;
      }
      out.push(
        <blockquote
          key={`md-${key++}`}
          className="my-2 border-l-2 border-border pl-3 text-muted-foreground"
        >
          {renderInline(buf.join('\n'))}
        </blockquote>,
      );
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ''));
        i += 1;
      }
      out.push(
        <ul key={`md-${key++}`} className="my-2 list-disc space-y-1 pl-5">
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ''));
        i += 1;
      }
      out.push(
        <ol key={`md-${key++}`} className="my-2 list-decimal space-y-1 pl-5">
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    if (!line.trim()) {
      i += 1;
      continue;
    }

    // Consecutive non-empty lines coalesce into one paragraph.
    const paraBuf: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^```/.test(lines[i]) &&
      !/^#{1,6}\s/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^[-*]\s+/.test(lines[i]) &&
      !/^\d+\.\s+/.test(lines[i])
    ) {
      paraBuf.push(lines[i]);
      i += 1;
    }
    out.push(
      <p key={`md-${key++}`} className="my-2 whitespace-pre-wrap leading-relaxed">
        {renderInline(paraBuf.join('\n'))}
      </p>,
    );
  }
  return out;
}

// Inline formatter for **bold**, *italic*, `code`, and [link](url). Not
// a full CommonMark - intentionally - but covers what Claude emits.
function renderInline(text: string): JSX.Element[] {
  const nodes: JSX.Element[] = [];
  let i = 0;
  let keyIdx = 0;
  let buf = '';
  const flush = () => {
    if (buf) {
      nodes.push(<span key={`t-${keyIdx++}`}>{buf}</span>);
      buf = '';
    }
  };
  while (i < text.length) {
    const rest = text.slice(i);
    const codeMatch = rest.match(/^`([^`]+)`/);
    if (codeMatch) {
      flush();
      nodes.push(
        <code
          key={`c-${keyIdx++}`}
          className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground"
        >
          {codeMatch[1]}
        </code>,
      );
      i += codeMatch[0].length;
      continue;
    }
    const boldMatch = rest.match(/^\*\*([^*]+)\*\*/);
    if (boldMatch) {
      flush();
      nodes.push(
        <strong key={`b-${keyIdx++}`} className="font-semibold">
          {boldMatch[1]}
        </strong>,
      );
      i += boldMatch[0].length;
      continue;
    }
    const italicMatch = rest.match(/^\*([^*\n]+)\*/);
    if (italicMatch) {
      flush();
      nodes.push(
        <em key={`i-${keyIdx++}`} className="italic">
          {italicMatch[1]}
        </em>,
      );
      i += italicMatch[0].length;
      continue;
    }
    const linkMatch = rest.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      flush();
      nodes.push(
        <a
          key={`l-${keyIdx++}`}
          href={linkMatch[2]}
          target="_blank"
          rel="noreferrer"
          className="text-primary underline-offset-4 hover:underline"
        >
          {linkMatch[1]}
        </a>,
      );
      i += linkMatch[0].length;
      continue;
    }
    buf += text[i];
    i += 1;
  }
  flush();
  return nodes;
}

function truncate(text: string, max = 400): string {
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function formatToolArgs(args: unknown): string {
  if (args === null || args === undefined) return '';
  if (typeof args === 'string') return args;
  try {
    return JSON.stringify(args, null, 2);
  } catch {
    return String(args);
  }
}

function formatToolResult(result: unknown): string {
  if (result === null || result === undefined) return '';
  if (typeof result === 'string') return result;
  if (Array.isArray(result)) {
    return result
      .map((chunk) => {
        if (chunk && typeof chunk === 'object' && 'text' in (chunk as Record<string, unknown>)) {
          return String((chunk as { text?: unknown }).text ?? '');
        }
        return typeof chunk === 'string' ? chunk : JSON.stringify(chunk);
      })
      .filter(Boolean)
      .join('\n');
  }
  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}

interface RoleHeaderProps {
  icon: JSX.Element;
  label: string;
  ts: string;
  extra?: JSX.Element | null;
  tone?: 'user' | 'assistant' | 'muted';
}

function RoleHeader({ icon, label, ts, extra, tone = 'muted' }: RoleHeaderProps) {
  const toneClass =
    tone === 'user'
      ? 'text-primary'
      : tone === 'assistant'
        ? 'text-foreground'
        : 'text-muted-foreground';
  return (
    <div className="mb-1 flex items-center gap-2 text-xs">
      <span className={cn('inline-flex items-center gap-1 font-semibold', toneClass)}>
        {icon}
        {label}
      </span>
      {ts ? <span className="text-muted-foreground">{ts}</span> : null}
      {extra ? <span className="ml-auto">{extra}</span> : null}
    </div>
  );
}

function UserTurn({ turn }: { turn: Turn }) {
  const ts = formatTime(turn.createdAt);
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] md:max-w-[70%]">
        <RoleHeader
          icon={<User className="h-3.5 w-3.5" aria-hidden />}
          label="You"
          ts={ts}
          tone="user"
        />
        <div className="rounded-lg border border-border bg-primary/10 px-4 py-2 text-sm text-foreground">
          <div className="whitespace-pre-wrap break-words leading-relaxed">{turn.content}</div>
        </div>
      </div>
    </div>
  );
}

function AssistantTurn({ turn }: { turn: Turn }) {
  const ts = formatTime(turn.createdAt);
  const tokens = formatTokens(turn.tokens);
  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[95%]">
        <RoleHeader
          icon={<Bot className="h-3.5 w-3.5" aria-hidden />}
          label={turn.model || 'Claude'}
          ts={ts}
          tone="assistant"
        />
        <div className="text-sm text-foreground">{renderMarkdown(turn.content)}</div>
        {tokens ? (
          <div className="mt-2 text-[11px] text-muted-foreground">{tokens}</div>
        ) : null}
      </div>
    </div>
  );
}

function ThinkingTurn({ turn }: { turn: Turn }) {
  const [open, setOpen] = useState(false);
  const ts = formatTime(turn.createdAt);
  const body = turn.thinkingText || turn.content || '';
  if (!body) return null;
  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[95%]">
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="flex w-full items-center gap-2 text-left text-xs text-muted-foreground hover:text-foreground"
          >
            {open ? (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            )}
            <Brain className="h-3.5 w-3.5" aria-hidden />
            <span className="font-semibold">Thinking</span>
            {!open ? <span className="truncate">{truncate(body, 120)}</span> : null}
            {ts ? <span className="ml-auto text-muted-foreground">{ts}</span> : null}
          </button>
          {open ? (
            <div className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
              {body}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ToolUseTurn({ turn }: { turn: Turn }) {
  const [open, setOpen] = useState(false);
  const ts = formatTime(turn.createdAt);
  const argsText = formatToolArgs(turn.toolArgs);
  const resultText = formatToolResult(turn.toolResult);
  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[95%]">
        <RoleHeader
          icon={<Wrench className="h-3.5 w-3.5" aria-hidden />}
          label={turn.toolName || 'tool'}
          ts={ts}
        />
        <div className="rounded-md border border-border bg-muted/30">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-muted-foreground hover:text-foreground"
          >
            {open ? (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            )}
            <Badge variant="secondary" className="font-mono">
              {turn.toolName || 'tool'}
            </Badge>
            <span className="truncate font-mono text-[11px]">
              {open ? '' : truncate(argsText.replace(/\s+/g, ' '), 100)}
            </span>
          </button>
          {open ? (
            <div className="space-y-2 border-t border-border px-3 py-2">
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Input
                </div>
                <pre className="overflow-x-auto rounded bg-muted/60 p-2 text-xs font-mono text-foreground">
                  {argsText}
                </pre>
              </div>
              {resultText ? (
                <div>
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Result
                  </div>
                  <pre className="overflow-x-auto rounded bg-muted/60 p-2 text-xs font-mono text-foreground">
                    {truncate(resultText, 4000)}
                  </pre>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ToolResultTurn({ turn }: { turn: Turn }) {
  // When the result is already paired onto a ToolUse turn we render a
  // compact badge-only row so the UI does not double-render the bytes.
  const ts = formatTime(turn.createdAt);
  const text = turn.content || formatToolResult(turn.toolResult);
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[95%]">
        <RoleHeader
          icon={<Terminal className="h-3.5 w-3.5" aria-hidden />}
          label="tool result"
          ts={ts}
        />
        <div className="rounded-md border border-border bg-muted/30">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-muted-foreground hover:text-foreground"
          >
            {open ? (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            )}
            <FileText className="h-3.5 w-3.5" aria-hidden />
            <span className="truncate font-mono text-[11px]">
              {open ? '' : truncate(text.replace(/\s+/g, ' '), 100)}
            </span>
          </button>
          {open ? (
            <pre className="overflow-x-auto border-t border-border bg-muted/60 p-3 text-xs font-mono text-foreground">
              {truncate(text, 8000)}
            </pre>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SystemTurn({ turn }: { turn: Turn }) {
  const ts = formatTime(turn.createdAt);
  return (
    <div className="flex justify-center">
      <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/30 px-3 py-1 text-[11px] text-muted-foreground">
        <Cog className="h-3 w-3" aria-hidden />
        <span className="truncate">{truncate(turn.content || '', 160)}</span>
        {ts ? <span>{ts}</span> : null}
      </div>
    </div>
  );
}

function TurnRow({ turn }: { turn: Turn }) {
  switch (turn.role) {
    case 'user':
      return <UserTurn turn={turn} />;
    case 'assistant':
      return <AssistantTurn turn={turn} />;
    case 'thinking':
      return <ThinkingTurn turn={turn} />;
    case 'tool_use':
      return <ToolUseTurn turn={turn} />;
    case 'tool_result':
      return <ToolResultTurn turn={turn} />;
    case 'system':
      return <SystemTurn turn={turn} />;
    default:
      return null;
  }
}

export default function ConversationView({
  sessionId,
  live = false,
  className,
}: ConversationViewProps) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const fetchSnapshot = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<Conversation>(
        `/api/sessions/${encodeURIComponent(sessionId)}`,
      );
      setConversation(data);
    } catch (err) {
      setError((err as Error).message || 'Failed to load session');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchSnapshot();
  }, [fetchSnapshot]);

  useEffect(() => {
    if (!live || !sessionId) return;
    const url = eventSourceUrl(
      `/api/sessions/${encodeURIComponent(sessionId)}/stream`,
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
  }, [live, sessionId]);

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
            {streaming ? 'Live' : 'Idle'}
          </Badge>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {conversation?.projectPath ? (
          <span className="truncate">{conversation.projectPath}</span>
        ) : null}
        {conversation?.model ? <span>model: {conversation.model}</span> : null}
        {conversation ? (
          <span>
            turns: {conversation.turns.length.toLocaleString()}
          </span>
        ) : null}
        {conversation ? (
          <span>
            tokens: {conversation.totalInputTokens.toLocaleString()} in /
            {' '}
            {conversation.totalOutputTokens.toLocaleString()} out
          </span>
        ) : null}
        {conversation?.warnings && conversation.warnings.length > 0 ? (
          <Badge variant="warning">
            {conversation.warnings.length} warnings
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
              Loading session...
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center text-sm text-destructive">
              {error}
            </div>
          ) : !conversation || conversation.turns.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No turns recorded yet.
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
              Jump to latest
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
