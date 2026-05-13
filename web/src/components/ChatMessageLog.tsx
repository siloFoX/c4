import { Loader2, Sparkles } from 'lucide-react';
import type { RefObject, UIEvent } from 'react';
import { Button, Skeleton } from './ui';
import { cn } from '../lib/cn';
import { t, tFormat, useLocale } from '../lib/i18n';
import {
  formatTime,
  type ChatMessage,
} from '../lib/chat-helpers';
import type { BackfillSource } from './ChatHeader';

// (v1.10.604) Extracted from ChatView. The chat-message scroll
// container — backfill loading skeleton, empty placeholder, or
// the actual message <ul> with optional older-loader entry and
// per-message bubble. Pure display: parent owns scroll ref +
// load-older callback.

interface Props {
  scrollRef: RefObject<HTMLDivElement>;
  onScroll: (e: UIEvent<HTMLDivElement>) => void;
  workerName: string;
  backfillLoading: boolean;
  backfillSource: BackfillSource;
  hasOlder: boolean;
  loadingOlder: boolean;
  messages: ChatMessage[];
  onLoadOlder: () => void;
}

export default function ChatMessageLog({
  scrollRef,
  onScroll,
  workerName,
  backfillLoading,
  backfillSource,
  hasOlder,
  loadingOlder,
  messages,
  onLoadOlder,
}: Props) {
  useLocale();
  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="min-h-0 min-w-0 flex-1 overflow-y-auto rounded-md border border-border bg-background p-3 md:p-4"
      role="log"
      aria-live="polite"
      aria-label={tFormat('chatView.aria.chatWith', { worker: workerName })}
    >
      {backfillLoading ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          <span>{t('chat.loadingPast')}</span>
          <ul className="mt-4 w-full max-w-sm space-y-2" aria-hidden="true">
            <li>
              <Skeleton variant="rect" height={32} className="w-full" />
            </li>
            <li>
              <Skeleton variant="rect" height={48} className="w-full" />
            </li>
            <li>
              <Skeleton variant="rect" height={32} className="w-full" />
            </li>
          </ul>
        </div>
      ) : messages.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          <Sparkles aria-hidden="true" className="h-4 w-4" />
          <span>{t('chat.empty')}</span>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {hasOlder && backfillSource === 'scrollback' && (
            <li className="flex items-center justify-center py-1 text-xs text-muted-foreground">
              {loadingOlder ? (
                <span className="inline-flex items-center gap-1">
                  <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
                  {t('chat.olderLoading')}
                </span>
              ) : (
                <Button type="button" variant="ghost" size="sm" onClick={onLoadOlder}>
                  {t('chat.loadOlder')}
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
  );
}
