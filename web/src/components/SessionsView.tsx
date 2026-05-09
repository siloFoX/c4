import { useCallback, useState } from 'react';
import { t, tFormat, useLocale } from '../lib/i18n';
import SessionsTour from './SessionsTour';
import NewChatModal from './NewChatModal';
import AttachModal from './AttachModal';
import SessionsRightPane from './SessionsRightPane';
import SessionsListCard from './SessionsListCard';
import { useSessionsTour } from '../lib/use-sessions-tour';
import { useSessionsList } from '../lib/use-sessions-list';
import { useSessionsActions } from '../lib/use-sessions-actions';
import { useFilteredSessions } from '../lib/use-filtered-sessions';
import { useSessionsCollapse } from '../lib/use-sessions-collapse';
import { useLiveRef } from '../lib/use-live-ref';

export interface SessionSummary {
  projectDir: string | null;
  projectPath: string | null;
  sessionId: string;
  path: string;
  updatedAt: string | null;
  size: number;
  turnCount: number;
  lastAssistantSnippet: string;
}

export interface SessionGroup {
  projectPath: string | null;
  projectDir: string | null;
  sessions: SessionSummary[];
  updatedAt: string | null;
}

// (v1.10.630) Promoted to export so useSessionsList can type
// its returned data slot.
export interface SessionsResponse {
  rootDir: string;
  sessions: SessionSummary[];
  groups: SessionGroup[];
  total: number;
}

// (8.17) Attached session record shape - mirrors the persisted form on
// the daemon side (~/.c4/attached.json). The Web UI is read-only aside
// from the attach/detach affordances below.
//
// (TODO 8.38) `role` is sniffed at attach-time from the JSONL prelude
// (manager / planner / executor / reviewer) or path-pattern (c4-mgr-*
// -> manager, c4-worktree-* -> worker). 'generic' covers everything
// else. Pre-8.38 attached.json records may lack role; the daemon
// re-derives it on `attach.list` reads.
export type AttachedRole =
  | 'manager'
  | 'worker'
  | 'planner'
  | 'executor'
  | 'reviewer'
  | 'generic';

export interface AttachedSession {
  name: string;
  jsonlPath: string;
  sessionId: string | null;
  projectPath: string | null;
  createdAt: string | null;
  lastOffset: number;
  role?: AttachedRole;
}

export interface AttachedListResponse {
  sessions: AttachedSession[];
  total: number;
}

// (v1.10.631) Promoted to export so useSessionsActions can type
// the /api/attach response.
export interface AttachResponse {
  name: string;
  sessionId: string | null;
  projectPath: string | null;
  jsonlPath: string;
  turns: number;
  tokens: { input: number; output: number };
  model?: string | null;
  warnings?: number;
}

// Discriminated union so the detail pane knows which endpoint to
// hit. `kind: 'session'` means the sessionId comes from the 8.18
// sessions list; `kind: 'attached'` means the name is a registered
// attachment and ConversationView should load it from /api/attach.
// (v1.10.607) Promoted to export so SessionsRightPane can type
// its `selection` prop.
export type Selection =
  | { kind: 'session'; id: string }
  | { kind: 'attached'; name: string };

// (8.31, v1.10.475) UX strings migrated to i18n keys. Tests now
// source-grep against the *Key constants instead of literal copy
// (see tests/sessions-view.test.js).
export const EMPTY_ATTACH_BANNER_TITLE_KEY = 'sessions.banner.emptyTitle';
export const EMPTY_ATTACH_BANNER_BODY_KEY = 'sessions.banner.emptyBody';
export const POST_ATTACH_HELP_TITLE_KEY = 'sessions.help.afterAttachTitle';
export const POST_ATTACH_HELP_ITEM_KEYS = [
  'sessions.help.timeline',
  'sessions.help.search',
  'sessions.help.resume',
];
export const COMPARISON_TITLE_KEY = 'sessions.compare.title';
export const COMPARISON_ROW_KEYS: Array<[string, string, string]> = [
  ['sessions.compare.modeLabel', 'sessions.compare.modeAttached', 'sessions.compare.modeLive'],
  ['sessions.compare.sourceLabel', 'sessions.compare.sourceAttached', 'sessions.compare.sourceLive'],
  ['sessions.compare.updatesLabel', 'sessions.compare.updatesAttached', 'sessions.compare.updatesLive'],
  ['sessions.compare.resumeLabel', 'sessions.compare.resumeAttached', 'sessions.compare.resumeLive'],
];
export const TOUR_STORAGE_KEY = 'sessions-tour-v1';
export const TOUR_STEPS: Array<{ titleKey: string; bodyKey: string }> = [
  { titleKey: 'sessions.tour.welcome.title', bodyKey: 'sessions.tour.welcome.body' },
  { titleKey: 'sessions.tour.attach.title',  bodyKey: 'sessions.tour.attach.body' },
  { titleKey: 'sessions.tour.view.title',    bodyKey: 'sessions.tour.view.body' },
];

export function formatRelative(iso: string | null): string {
  if (!iso) return '';
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return '';
  const diff = Date.now() - ts;
  if (diff < 60_000) return t('sessions.relative.justNow');
  if (diff < 3_600_000) return tFormat('sessions.relative.minutes', { n: Math.floor(diff / 60_000) });
  if (diff < 86_400_000) return tFormat('sessions.relative.hours', { n: Math.floor(diff / 3_600_000) });
  if (diff < 604_800_000) return tFormat('sessions.relative.days', { n: Math.floor(diff / 86_400_000) });
  return new Date(iso).toLocaleDateString();
}

export function shortId(sessionId: string | null): string {
  if (!sessionId) return '-';
  if (sessionId.length <= 12) return sessionId;
  return `${sessionId.slice(0, 8)}...${sessionId.slice(-4)}`;
}

// (v1.10.681) groupMatchesQuery + attachedMatchesQuery + the
// three filter memos moved to lib/use-filtered-sessions.

// (v1.10.540) AttachModal extracted to ./AttachModal.tsx — uses
// formatRelative + shortId + POST_ATTACH_HELP_* exports below.

// (v1.10.539) NewChatModal extracted to ./NewChatModal.tsx
// (along with MODEL_CHOICES + AGENT_CHOICES constants).

// (v1.10.549) EmptyAttachBanner extracted to
// ./SessionsEmptyAttachBanner.tsx and ComparisonCard extracted
// to ./SessionsComparisonCard.tsx.

// (v1.10.530) Tour extracted to ./SessionsTour.tsx

// (v1.10.550) AttachedRowActions extracted to
// ./SessionsAttachedRowActions.tsx along with the
// `copyToClipboard` + `attachedRoleStyle` helpers + the
// `AttachProcessState` type it owned.

export default function SessionsView() {
  useLocale();
  const [selection, setSelection] = useState<Selection | null>(null);
  const [query, setQuery] = useState('');
  // (v1.10.736) Group collapse map + attached collapse flag moved to hook.
  const { collapsed, toggleGroup, attachedCollapsed, toggleAttachedCollapsed } =
    useSessionsCollapse();
  // (v1.10.629) First-time tour gate hook extracted to
  // ../lib/use-sessions-tour.
  const { showTour, dismissTour } = useSessionsTour();

  // (v1.10.630) /api/sessions + /api/attach/list pair extracted to
  // ../lib/use-sessions-list. selection ref stays in this file so
  // the auto-select-first-session-on-load logic can stay deduped.
  // (v1.10.741) Live-ref pattern factored into lib/use-live-ref.
  const selectionRef = useLiveRef(selection);
  const {
    data,
    attached,
    loading,
    error,
    attachError,
    setAttachError,
    refreshSessions,
    refreshAttached,
  } = useSessionsList({
    getSelection: useCallback(() => selectionRef.current, []),
    onAutoSelect: useCallback((next: Selection | null) => setSelection(next), []),
  });

  // (v1.10.681) Filter memos moved to lib/use-filtered-sessions.
  const { filteredGroups, totalFiltered, filteredAttached } = useFilteredSessions({
    groups: data?.groups ?? null,
    attached,
    query,
  });

  // (v1.10.631) Attach / new chat / detach handlers + their
  // modal/busy/error state extracted to ../lib/use-sessions-actions.
  const {
    modalOpen,
    modalBusy,
    modalError,
    setModalOpen,
    setModalError,
    newChatOpen,
    newChatBusy,
    newChatError,
    setNewChatOpen,
    setNewChatError,
    handleAttachSubmit,
    handleNewChatSubmit,
    handleDetach,
  } = useSessionsActions({
    setSelection,
    setAttachError,
    refreshSessions,
    refreshAttached,
  });

  const selectedSessionId =
    selection && selection.kind === 'session' ? selection.id : null;
  const selectedAttachmentName =
    selection && selection.kind === 'attached' ? selection.name : null;

  const availableSessions = data?.sessions ?? [];

  return (
    <div className="flex w-full min-h-0 flex-1 flex-col gap-3 p-3 md:flex-row md:p-6">
      {/* (v1.10.622) Master-pane Card (header + attached section
          + sessions list) extracted to ./SessionsListCard.tsx. */}
      <SessionsListCard
        query={query}
        onQuery={setQuery}
        totalFiltered={totalFiltered}
        total={data?.total ?? 0}
        loading={loading}
        onNewChat={() => {
          setNewChatError(null);
          setNewChatOpen(true);
        }}
        onAttachNew={() => {
          setModalError(null);
          setModalOpen(true);
        }}
        onRefresh={() => {
          refreshSessions();
          refreshAttached();
        }}
        attachedCollapsed={attachedCollapsed}
        onToggleAttachedCollapsed={toggleAttachedCollapsed}
        filteredAttached={filteredAttached}
        attachError={attachError}
        selectedAttachmentName={selectedAttachmentName}
        onSelectAttached={(name) => setSelection({ kind: 'attached', name })}
        onAttachClick={() => {
          setModalError(null);
          setModalOpen(true);
        }}
        onDetach={handleDetach}
        filteredGroups={filteredGroups}
        error={error}
        collapsed={collapsed}
        onToggleGroup={toggleGroup}
        selectedSessionId={selectedSessionId}
        onSelectSession={(id) => setSelection({ kind: 'session', id })}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
        {/* (v1.10.607) Right pane extracted to ./SessionsRightPane.tsx. */}
        <SessionsRightPane
          selection={selection}
          showStartFirstEmptyState={filteredGroups.length === 0 && filteredAttached.length === 0 && !loading}
          onNewChat={() => {
            setNewChatError(null);
            setNewChatOpen(true);
          }}
          onAttachNew={() => {
            setModalError(null);
            setModalOpen(true);
          }}
        />
      </div>

      <AttachModal
        open={modalOpen}
        busy={modalBusy}
        error={modalError}
        available={availableSessions}
        onClose={() => setModalOpen(false)}
        onSubmit={handleAttachSubmit}
      />

      <NewChatModal
        open={newChatOpen}
        busy={newChatBusy}
        error={newChatError}
        onClose={() => setNewChatOpen(false)}
        onSubmit={handleNewChatSubmit}
      />

      {showTour ? <SessionsTour onDismiss={dismissTour} /> : null}
    </div>
  );
}
