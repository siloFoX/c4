import { Card, CardContent } from './ui';
import { useLocale } from '../lib/i18n';
import SessionsHeader from './SessionsHeader';
import SessionsAttachedSection from './SessionsAttachedSection';
import SessionsListSection from './SessionsListSection';
import type { AttachedSession, SessionGroup } from './SessionsView';

// (v1.10.622) Extracted from SessionsView. The master-pane Card
// — header (search + actions) + attached section + sessions
// list section, wrapped in a Card+CardContent layout. Pure
// composite: parent owns query/loading state + selection +
// modal openers.

interface Props {
  query: string;
  onQuery: (next: string) => void;
  totalFiltered: number;
  total: number;
  loading: boolean;
  onNewChat: () => void;
  onAttachNew: () => void;
  onRefresh: () => void;
  attachedCollapsed: boolean;
  onToggleAttachedCollapsed: () => void;
  filteredAttached: AttachedSession[];
  attachError: string | null;
  selectedAttachmentName: string | null;
  onSelectAttached: (name: string) => void;
  onAttachClick: () => void;
  onDetach: (name: string) => void;
  filteredGroups: SessionGroup[];
  error: string | null;
  collapsed: Record<string, boolean>;
  onToggleGroup: (key: string) => void;
  selectedSessionId: string | null;
  onSelectSession: (id: string) => void;
}

export default function SessionsListCard({
  query,
  onQuery,
  totalFiltered,
  total,
  loading,
  onNewChat,
  onAttachNew,
  onRefresh,
  attachedCollapsed,
  onToggleAttachedCollapsed,
  filteredAttached,
  attachError,
  selectedAttachmentName,
  onSelectAttached,
  onAttachClick,
  onDetach,
  filteredGroups,
  error,
  collapsed,
  onToggleGroup,
  selectedSessionId,
  onSelectSession,
}: Props) {
  useLocale();
  return (
    <Card className="flex w-full min-h-0 flex-col md:w-80 lg:w-96">
      <SessionsHeader
        query={query}
        onQuery={onQuery}
        totalFiltered={totalFiltered}
        total={total}
        loading={loading}
        onNewChat={onNewChat}
        onAttachNew={onAttachNew}
        onRefresh={onRefresh}
      />
      <CardContent className="flex-1 overflow-y-auto p-0">
        <SessionsAttachedSection
          collapsed={attachedCollapsed}
          onToggle={onToggleAttachedCollapsed}
          filtered={filteredAttached}
          error={attachError}
          selectedName={selectedAttachmentName}
          onSelect={onSelectAttached}
          onAttachClick={onAttachClick}
          onDetach={onDetach}
        />
        <SessionsListSection
          filteredGroups={filteredGroups}
          error={error}
          loading={loading}
          collapsed={collapsed}
          onToggleGroup={onToggleGroup}
          selectedSessionId={selectedSessionId}
          onSelect={onSelectSession}
        />
      </CardContent>
    </Card>
  );
}
