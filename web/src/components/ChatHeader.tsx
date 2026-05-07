import { ArrowDown } from 'lucide-react';
import { Badge, Button, CardDescription, CardHeader, CardTitle } from './ui';
import { cn } from '../lib/cn';
import { t, tFormat, useLocale } from '../lib/i18n';

// (v1.10.583) Extracted from ChatView. The card header — worker
// title + 3 status indicators (backfill count badge / SSE live
// badge / jump-to-latest button). Pure display: parent owns
// scroll state + backfill counters.

export type BackfillSource = 'session' | 'scrollback' | null;

interface Props {
  workerName: string;
  backfillCount: number;
  backfillSource: BackfillSource;
  sseConnected: boolean;
  autoScroll: boolean;
  onJumpToBottom: () => void;
}

export default function ChatHeader({
  workerName,
  backfillCount,
  backfillSource,
  sseConnected,
  autoScroll,
  onJumpToBottom,
}: Props) {
  useLocale();
  return (
    <CardHeader className="flex-row items-start justify-between gap-3 p-4 md:p-5">
      <div className="min-w-0">
        <CardTitle className="truncate">{t('chat.workerHeader.title')}</CardTitle>
        <CardDescription className="truncate">
          {tFormat('chat.workerHeader.description', { worker: workerName })}
        </CardDescription>
      </div>
      <div className="flex items-center gap-2 text-xs">
        {backfillCount > 0 && (
          <Badge variant="secondary" className="flex items-center gap-1" title={t(backfillSource === 'session' ? 'chatView.backfillSource.session' : 'chatView.backfillSource.scrollback')}>
            <span>{tFormat(
              backfillCount === 1 ? 'chat.loadedPast.one' : 'chat.loadedPast.other',
              { n: String(backfillCount) },
            )}</span>
          </Badge>
        )}
        <Badge
          variant={sseConnected ? 'success' : 'secondary'}
          className="flex items-center gap-1"
          aria-live="polite"
        >
          <span
            className={cn(
              'inline-block h-1.5 w-1.5 rounded-full',
              sseConnected ? 'bg-emerald-400' : 'bg-muted-foreground'
            )}
            aria-hidden="true"
          />
          {sseConnected ? 'live' : 'disconnected'}
        </Badge>
        {!autoScroll && (
          <Button type="button" variant="secondary" size="sm" onClick={onJumpToBottom}>
            <ArrowDown className="h-3.5 w-3.5" />
            <span>{t('chat.jumpToLatest')}</span>
          </Button>
        )}
      </div>
    </CardHeader>
  );
}
