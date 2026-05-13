import { Radio } from 'lucide-react';
import { CardTitle } from './ui';
import { cn } from '../lib/cn';
import { t, useLocale } from '../lib/i18n';

// (v1.10.586) Extracted from MeetingsView. The detail-pane card
// header title row — meeting title + streaming live/offline
// badge. Pure display: parent owns selectedId/streaming state.

interface Props {
  title: string;
  showStreamingBadge: boolean;
  streaming: boolean;
}

export default function MeetingsDetailTitleBar({
  title,
  showStreamingBadge,
  streaming,
}: Props) {
  useLocale();
  return (
    <div className="flex flex-row items-center justify-between gap-2">
      <CardTitle className="text-base">{title}</CardTitle>
      {showStreamingBadge ? (
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-1.5 py-0 text-[10px] uppercase tracking-wide',
            streaming
              ? 'border-success/40 bg-success/10 text-success'
              : 'border-warning/40 bg-warning/10 text-warning',
          )}
          aria-live="polite"
          title={streaming ? t('meetings.stream.tooltipLive') : t('meetings.stream.tooltipOffline')}
        >
          <Radio className="h-3 w-3" aria-hidden />
          {streaming ? t('meetings.stream.live') : t('meetings.stream.offline')}
        </span>
      ) : null}
    </div>
  );
}
