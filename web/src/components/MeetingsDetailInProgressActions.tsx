import { Button, Tooltip } from './ui';
import { t, useLocale } from '../lib/i18n';
import MeetingsStateActions from './MeetingsStateActions';
import MeetingsContributePanel from './MeetingsContributePanel';

// (v1.10.594) Extracted from MeetingsView. The in-progress
// action surface — manual label + Contribute toggle button +
// state-machine action buttons row, plus the conditionally-
// rendered ContributePanel beneath it. Renders only when
// meeting status is 'in-progress'. Pure composite: parent owns
// contrib open state.

interface Props {
  meetingId: string;
  contribOpen: boolean;
  onContribToggle: () => void;
}

export default function MeetingsDetailInProgressActions({
  meetingId,
  contribOpen,
  onContribToggle,
}: Props) {
  useLocale();
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-muted-foreground">{t('meetings.manual.label')}</span>
        <Tooltip label={t('meetings.tooltip.contribute')}>
          <Button
            size="sm"
            variant="outline"
            onClick={onContribToggle}
            aria-label={t('meetings.contribute.toggle.label')}
            aria-expanded={contribOpen}
          >
            {contribOpen ? t('meetings.hideContribute') : t('meetings.contributeButton')}
          </Button>
        </Tooltip>
        <MeetingsStateActions meetingId={meetingId} mode="in-progress" />
      </div>
      <MeetingsContributePanel open={contribOpen} meetingId={meetingId} />
    </>
  );
}
