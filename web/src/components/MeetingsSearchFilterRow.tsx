import { t, useLocale } from '../lib/i18n';
import type { MeetingStatus } from './MeetingsView';

// (v1.10.574) Extracted from MeetingsView. The Phase-8.1.5 search
// filter chip row — status / track dropdowns + since / until
// date inputs + a clear-dates button. Shown only while a search
// query is active. Pure controlled inputs.

type Track = 'lightweight' | 'standard' | 'full';

interface Props {
  status: MeetingStatus | '';
  onStatusChange: (next: MeetingStatus | '') => void;
  track: Track | '';
  onTrackChange: (next: Track | '') => void;
  since: string;
  onSinceChange: (next: string) => void;
  until: string;
  onUntilChange: (next: string) => void;
}

export default function MeetingsSearchFilterRow({
  status,
  onStatusChange,
  track,
  onTrackChange,
  since,
  onSinceChange,
  until,
  onUntilChange,
}: Props) {
  useLocale();
  return (
    <div className="flex flex-wrap items-center gap-2 text-[10px]">
      <label className="flex items-center gap-1 text-muted-foreground">
        {t('meetings.label.status')}
        <select
          className="rounded border border-border bg-background px-1 py-0.5"
          value={status}
          onChange={(e) => onStatusChange(e.target.value as MeetingStatus | '')}
          aria-label={t('meetings.action.filterStatus')}
        >
          <option value="">{t('meetings.option.any')}</option>
          <option value="pending">{t('meetings.option.pending')}</option>
          <option value="in-progress">{t('meetings.status.inProgress')}</option>
          <option value="completed">{t('meetings.option.completed')}</option>
          <option value="escalated">{t('meetings.option.escalated')}</option>
          <option value="aborted">{t('meetings.option.aborted')}</option>
        </select>
      </label>
      <label className="flex items-center gap-1 text-muted-foreground">
        {t('meetings.label.track')}
        <select
          className="rounded border border-border bg-background px-1 py-0.5"
          value={track}
          onChange={(e) => onTrackChange(e.target.value as Track | '')}
          aria-label={t('meetings.action.filterTrack')}
        >
          <option value="">{t('meetings.option.any')}</option>
          <option value="lightweight">{t('meetings.mode.lightweight')}</option>
          <option value="standard">{t('meetings.mode.standard')}</option>
          <option value="full">{t('meetings.mode.full')}</option>
        </select>
      </label>
      <label className="flex items-center gap-1 text-muted-foreground">
        {t('meetings.label.since')}
        <input
          type="date"
          value={since}
          onChange={(e) => onSinceChange(e.target.value)}
          className="rounded border border-border bg-background px-1 py-0.5 text-[10px]"
          aria-label={t('meetings.action.sinceDate')}
        />
      </label>
      <label className="flex items-center gap-1 text-muted-foreground">
        {t('meetings.label.until')}
        <input
          type="date"
          value={until}
          onChange={(e) => onUntilChange(e.target.value)}
          className="rounded border border-border bg-background px-1 py-0.5 text-[10px]"
          aria-label={t('meetings.action.untilDate')}
        />
      </label>
      {(since || until) ? (
        <button
          type="button"
          onClick={() => { onSinceChange(''); onUntilChange(''); }}
          className="text-muted-foreground hover:text-foreground"
        >
          {t('meetings.action.clearDates')}
        </button>
      ) : null}
    </div>
  );
}
