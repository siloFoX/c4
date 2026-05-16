import { useState } from 'react';
import { Info } from 'lucide-react';
import ConversationView from './ConversationView';
import SessionsComparisonCard from './SessionsComparisonCard';
import SessionsEmptyPanel from './SessionsEmptyPanel';
import { Button, DataList, DetailPanel } from './ui';
import { useLocale } from '../lib/i18n';
import type { Selection } from './SessionsView';

// (v1.10.607) Extracted from SessionsView. The right pane —
// renders one of three based on `selection`: ConversationView
// for a session id, ConversationView+ComparisonCard for an
// attached worker name, or SessionsEmptyPanel otherwise. Pure
// composite: parent owns the selection + modal openers.

interface Props {
  selection: Selection | null;
  showStartFirstEmptyState: boolean;
  onNewChat: () => void;
  onAttachNew: () => void;
}

export default function SessionsRightPane({
  selection,
  showStartFirstEmptyState,
  onNewChat,
  onAttachNew,
}: Props) {
  useLocale();
  // (v1.11.265, TODO 11.247) Session info slide-in. The "Info"
  // toggle opens a DetailPanel beside the conversation showing
  // the canonical session metadata (kind / id-or-name /
  // live-flag) without interrupting the active conversation.
  const [infoOpen, setInfoOpen] = useState(false);

  if (selection && selection.kind === 'session') {
    return (
      <>
        <ConversationView
          key={`session-${selection.id}`}
          sessionId={selection.id}
          live={false}
          className="flex-1"
        />
        <SessionInfoTrigger
          onOpen={() => setInfoOpen(true)}
        />
        <SessionInfoPanel
          open={infoOpen}
          onOpenChange={setInfoOpen}
          selection={selection}
        />
      </>
    );
  }
  if (selection && selection.kind === 'attached') {
    return (
      <>
        <ConversationView
          key={`attached-${selection.name}`}
          sessionId={selection.name}
          live
          snapshotUrl={`/api/attach/${encodeURIComponent(selection.name)}/conversation`}
          streamUrl={`/api/attach/${encodeURIComponent(selection.name)}/tail?live=1`}
          className="flex-1"
        />
        <SessionsComparisonCard className="self-end" />
        <SessionInfoTrigger
          onOpen={() => setInfoOpen(true)}
        />
        <SessionInfoPanel
          open={infoOpen}
          onOpenChange={setInfoOpen}
          selection={selection}
        />
      </>
    );
  }
  return (
    <SessionsEmptyPanel
      showStartFirst={showStartFirstEmptyState}
      onNewChat={onNewChat}
      onAttachNew={onAttachNew}
    />
  );
}

function SessionInfoTrigger({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="flex justify-end">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onOpen}
        aria-label="Show session info"
        data-testid="sessions-right-info-trigger"
      >
        <Info className="mr-1 h-3.5 w-3.5" />
        <span>Info</span>
      </Button>
    </div>
  );
}

function SessionInfoPanel({
  open,
  onOpenChange,
  selection,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selection: Selection;
}) {
  const title =
    selection.kind === 'session'
      ? `Session ${selection.id}`
      : `Attached ${selection.name}`;
  return (
    <DetailPanel
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={
        selection.kind === 'session'
          ? 'Static snapshot from disk'
          : 'Live tail from the daemon'
      }
      data-testid="sessions-right-info-panel"
      footer={
        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </div>
      }
    >
      {/* (v1.11.277, TODO 11.259) Raw <dl> migrated to DataList
          (density-aware). Only one group here so the scrubber +
          sticky headers stay off; the win is consistent rhythm +
          copy buttons on the identity rows. */}
      <DataList
        data-testid="sessions-right-info-list"
        items={[
          { id: 'kind', label: 'Kind', value: selection.kind },
          {
            id: 'idOrName',
            label: selection.kind === 'session' ? 'Session id' : 'Worker name',
            value: selection.kind === 'session' ? selection.id : selection.name,
            copyValue: selection.kind === 'session' ? selection.id : selection.name,
          },
          {
            id: 'live',
            label: 'Live',
            value: selection.kind === 'attached' ? 'yes' : 'no',
          },
        ]}
      />
    </DetailPanel>
  );
}
