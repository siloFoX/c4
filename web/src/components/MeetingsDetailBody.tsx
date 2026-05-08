import { Eye } from 'lucide-react';
import { t, useLocale } from '../lib/i18n';
import MeetingsDetailHeader from './MeetingsDetailHeader';
import MeetingsLineageStrip, { type LineageResponse } from './MeetingsLineageStrip';
import MeetingsRecapPanel, { type RecapResponse } from './MeetingsRecapPanel';
import MeetingsActionItemsPanel, { type ActionItemsResponse } from './MeetingsActionItemsPanel';
import MeetingsStagesView from './MeetingsStagesView';
import type { MeetingDetail } from './MeetingsView';

// (v1.10.596) Extracted from MeetingsView. The detail-pane card
// body — empty/error/loading states or the 5 sub-components
// stacked (DetailHeader / LineageStrip / RecapPanel /
// ActionItemsPanel / StagesView). Pure composite: parent owns
// the data + onNavigate handler.

interface Props {
  selectedId: string | null;
  detailError: string | null;
  detail: MeetingDetail | null;
  lineage: LineageResponse | null;
  recap: RecapResponse | null;
  actions: ActionItemsResponse | null;
  onNavigate: (id: string) => void;
}

export default function MeetingsDetailBody({
  selectedId,
  detailError,
  detail,
  lineage,
  recap,
  actions,
  onNavigate,
}: Props) {
  useLocale();
  if (!selectedId) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        <Eye className="mr-2 h-3.5 w-3.5" aria-hidden />
        {t('meetings.empty.pick')}
      </div>
    );
  }
  if (detailError) {
    return <div className="text-sm text-destructive">{detailError}</div>;
  }
  if (!detail) {
    return <div className="text-sm text-muted-foreground">{t('meetings.loading')}</div>;
  }
  return (
    <>
      <MeetingsDetailHeader
        status={detail.status}
        track={detail.track}
        currentStage={detail.currentStage}
        currentRound={detail.currentRound}
        task={detail.task}
      />
      <MeetingsLineageStrip
        lineage={lineage}
        currentId={detail.id}
        onNavigate={onNavigate}
      />
      <MeetingsRecapPanel recap={recap} />
      <MeetingsActionItemsPanel actions={actions} meetingId={selectedId} />
      <MeetingsStagesView stages={detail.stages} transcripts={detail.transcripts} />
    </>
  );
}
