import { t, useLocale } from '../lib/i18n';
import type { MeetingStatus } from './MeetingsView';

// (v1.10.548) Extracted from MeetingsView. Header strip for the
// meeting detail panel — a 4-column metadata grid (status, track,
// stage, round) plus the full task description below. Pure
// display, no internal state.

interface Props {
  status: MeetingStatus;
  track: string;
  currentStage: string | null;
  currentRound: number;
  task: string;
}

export default function MeetingsDetailHeader({ status, track, currentStage, currentRound, task }: Props) {
  useLocale();

  return (
    <>
      <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        <div>
          <div className="text-muted-foreground">{t('meetings.field.status')}</div>
          <div className="font-medium">{status}</div>
        </div>
        <div>
          <div className="text-muted-foreground">{t('meetings.field.track')}</div>
          <div className="font-medium">{track}</div>
        </div>
        <div>
          <div className="text-muted-foreground">{t('meetings.field.stage')}</div>
          <div className="font-medium">{currentStage || '-'}</div>
        </div>
        <div>
          <div className="text-muted-foreground">{t('meetings.field.round')}</div>
          <div className="font-medium">{currentRound}</div>
        </div>
      </div>
      <div className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{t('meetings.field.task')}</span> {task}
      </div>
    </>
  );
}
