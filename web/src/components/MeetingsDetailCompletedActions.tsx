import { Button } from './ui';
import { t, useLocale } from '../lib/i18n';
import MeetingsPublishControls from './MeetingsPublishControls';
import MeetingsPeerRetroControls from './MeetingsPeerRetroControls';
import MeetingsRetroActions from './MeetingsRetroActions';
import MeetingsForkForm from './MeetingsForkForm';

// (v1.10.593) Extracted from MeetingsView. The post-completion
// action row (Publish / PeerRetro / Retro / Fork toggle) plus
// the conditionally-mounted ForkForm beneath it. Renders only
// when meeting status is 'completed' or 'escalated'. Pure
// composite: parent owns fork open state + onForked callback.

interface Props {
  meetingId: string;
  meetingTitle: string;
  forkOpen: boolean;
  onForkToggle: () => void;
  onForkClose: () => void;
  onForked: (newId: string) => void;
}

export default function MeetingsDetailCompletedActions({
  meetingId,
  meetingTitle,
  forkOpen,
  onForkToggle,
  onForkClose,
  onForked,
}: Props) {
  useLocale();
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <MeetingsPublishControls meetingId={meetingId} />
        <span aria-hidden className="text-muted-foreground">·</span>
        <MeetingsPeerRetroControls meetingId={meetingId} />
        <span aria-hidden className="text-muted-foreground">·</span>
        <MeetingsRetroActions meetingId={meetingId} />
        <span aria-hidden className="text-muted-foreground">·</span>
        <Button
          size="sm"
          variant="outline"
          onClick={onForkToggle}
          aria-label={t('meetings.fork.button.label')}
          title={t('meetings.tooltip.fork')}
          className="h-6 px-2 text-[10px]"
          aria-expanded={forkOpen}
        >
          {forkOpen ? t('meetings.cancelFork') : t('meetings.fork.button')}
        </Button>
      </div>
      <MeetingsForkForm
        open={forkOpen}
        meeting={{ id: meetingId, title: meetingTitle }}
        busy={false}
        onClose={onForkClose}
        onForked={onForked}
      />
    </>
  );
}
