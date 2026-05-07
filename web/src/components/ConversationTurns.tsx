import { useState, type JSX } from 'react';
import { Bot, Brain, ChevronDown, ChevronRight, Cog, FileText, Terminal, User, Wrench } from 'lucide-react';
import { Badge } from './ui';
import { cn } from '../lib/cn';
import { t, useLocale } from '../lib/i18n';
import {
  formatTime,
  formatTokens,
  formatToolArgs,
  formatToolResult,
  renderMarkdown,
  truncate,
} from '../lib/conversation-render';
import type { Turn } from './ConversationView';

// (v1.10.566) Extracted from ConversationView. The six per-role
// turn renderers (User / Assistant / Thinking / ToolUse /
// ToolResult / System) plus the RoleHeader strip and the
// TurnRow dispatcher. Pure rendering — no parent state.

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
  useLocale();
  const ts = formatTime(turn.createdAt);
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] md:max-w-[70%]">
        <RoleHeader
          icon={<User className="h-3.5 w-3.5" aria-hidden />}
          label={t('conversation.you')}
          ts={ts}
          tone="user"
        />
        <div className="rounded-lg border border-border bg-primary/30 px-4 py-2 text-sm text-foreground">
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
  useLocale();
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
            <span className="font-semibold">{t('conversation.thinking')}</span>
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
  useLocale();
  const [open, setOpen] = useState(false);
  const ts = formatTime(turn.createdAt);
  const argsText = formatToolArgs(turn.toolArgs);
  const resultText = formatToolResult(turn.toolResult);
  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[95%]">
        <RoleHeader
          icon={<Wrench className="h-3.5 w-3.5" aria-hidden />}
          label={turn.toolName || t('conversation.role.tool')}
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
                  {t('conversation.tool.input')}
                </div>
                <pre tabIndex={0} className="overflow-x-auto rounded bg-muted/60 p-2 text-xs font-mono text-foreground">
                  {argsText}
                </pre>
              </div>
              {resultText ? (
                <div>
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('conversation.tool.result')}
                  </div>
                  <pre tabIndex={0} className="overflow-x-auto rounded bg-muted/60 p-2 text-xs font-mono text-foreground">
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
  useLocale();
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
          label={t('conversation.role.toolResult')}
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
            <pre tabIndex={0} className="overflow-x-auto border-t border-border bg-muted/60 p-3 text-xs font-mono text-foreground">
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

export default function TurnRow({ turn }: { turn: Turn }) {
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
