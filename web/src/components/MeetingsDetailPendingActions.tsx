import { t, useLocale } from '../lib/i18n';
import MeetingsRunControls from './MeetingsRunControls';
import MeetingsStateActions from './MeetingsStateActions';

// (v1.10.595) Extracted from MeetingsView. The two pending-state
// action rows: top — Run brain selector + Run button (auto
// path), bottom — manual-start label + StateActions (pending
// mode). Renders only when meeting status is 'pending'.

interface Props {
  meetingId: string;
}

export default function MeetingsDetailPendingActions({ meetingId }: Props) {
  useLocale();
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <MeetingsRunControls meetingId={meetingId} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-muted-foreground">{t('meetings.orManually.label')}</span>
        <MeetingsStateActions meetingId={meetingId} mode="pending" />
      </div>
    </>
  );
}
