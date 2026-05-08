import ConversationView from './ConversationView';
import SessionsComparisonCard from './SessionsComparisonCard';
import SessionsEmptyPanel from './SessionsEmptyPanel';
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
  if (selection && selection.kind === 'session') {
    return (
      <ConversationView
        key={`session-${selection.id}`}
        sessionId={selection.id}
        live={false}
        className="flex-1"
      />
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
