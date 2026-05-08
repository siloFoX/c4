import { CardHeader } from './ui';
import { useLocale } from '../lib/i18n';
import MeetingsDetailTitleBar from './MeetingsDetailTitleBar';
import MeetingsDetailPendingActions from './MeetingsDetailPendingActions';
import MeetingsDetailInProgressActions from './MeetingsDetailInProgressActions';
import MeetingsDetailCompletedActions from './MeetingsDetailCompletedActions';
import type { MeetingDetail } from './MeetingsView';

// (v1.10.614) Extracted from MeetingsView. The detail-pane card
// header — title bar + 3 status-conditional action composites
// (pending / in-progress / completed). Pure composite: parent
// owns selection + contrib/fork open state + handlers.

interface Props {
  title: string;
  selectedId: string | null;
  detail: MeetingDetail | null;
  streaming: boolean;
  contribOpen: boolean;
  onContribToggle: () => void;
  forkOpen: boolean;
  onForkToggle: () => void;
  onForkClose: () => void;
  onForked: (newId: string) => void;
}

export default function MeetingsDetailCardHeader({
  title,
  selectedId,
  detail,
  streaming,
  contribOpen,
  onContribToggle,
  forkOpen,
  onForkToggle,
  onForkClose,
  onForked,
}: Props) {
  useLocale();
  return (
    <CardHeader className="flex flex-col gap-2 border-b border-border p-4">
      <MeetingsDetailTitleBar
        title={title}
        showStreamingBadge={Boolean(selectedId)}
        streaming={streaming}
      />
      {selectedId && detail && detail.status === 'pending' ? (
        <MeetingsDetailPendingActions meetingId={selectedId} />
      ) : null}
      {selectedId && detail && detail.status === 'in-progress' ? (
        <MeetingsDetailInProgressActions
          meetingId={selectedId}
          contribOpen={contribOpen}
          onContribToggle={onContribToggle}
        />
      ) : null}
      {selectedId && detail && ['completed', 'escalated'].includes(detail.status) ? (
        <MeetingsDetailCompletedActions
          meetingId={selectedId}
          meetingTitle={detail.title}
          forkOpen={forkOpen}
          onForkToggle={onForkToggle}
          onForkClose={onForkClose}
          onForked={onForked}
        />
      ) : null}
    </CardHeader>
  );
}
