import { useMemo, useState } from 'react';
import { Card, CardContent } from './ui';
import { t, tFormat, useLocale } from '../lib/i18n';
import { useToggle } from '../lib/use-toggle';
import type { Track } from './MeetingsSearchFacets';
import MeetingsMaintenancePanel from './MeetingsMaintenancePanel';
import MeetingsStuckBanner from './MeetingsStuckBanner';
import { type StageView } from './MeetingsStagesView';
import MeetingsDetailBody from './MeetingsDetailBody';
import MeetingsList from './MeetingsList';
import MeetingsDetailCardHeader from './MeetingsDetailCardHeader';
import MeetingsListCardHeader from './MeetingsListCardHeader';
import { useMeetingsSearch } from '../lib/use-meetings-search';
import { useMeetingEnrichment } from '../lib/use-meeting-enrichment';
import { useMeetingDetailStream } from '../lib/use-meeting-detail-stream';
import { useMeetingsList } from '../lib/use-meetings-list';
import { useStuckMeetings } from '../lib/use-stuck-meetings';
import { useToggleResetOnChange } from '../lib/use-toggle-reset-on-change';

// (multi-specialist phase 6) Meetings tab — list view + drill-in
// detail. Reads /api/meetings and /api/meetings/:id; the SSE
// stream wiring lands in a follow-up. Kept intentionally small so
// the page is usable today and we can iterate on detail UI without
// blocking the basic operator workflow.

export type MeetingStatus =
  | 'pending'
  | 'in-progress'
  | 'completed'
  | 'escalated'
  | 'aborted';

export interface MeetingSummary {
  id: string;
  status: MeetingStatus;
  track: string;
  title: string;
  currentStage: string | null;
  currentRound: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  // (Phase 6.11) forkOf surfaced in list rows for fork-aware UIs.
  forkOf?: string | null;
  // (v1.10.331) FTS snippet — only set on search-result rows.
  // Carries `<<token>>` markers from the backend; renderer below
  // converts them to highlight spans.
  snippet?: string;
}

// (v1.10.626) Promoted to export so useMeetingsList can type
// its returned data slot.
export interface MeetingsListResponse {
  count: number;
  meetings: MeetingSummary[];
}

interface Turn {
  stage: string;
  round: number;
  specialistId: string;
  text: string;
  ts: string;
}

// (v1.10.547) StageView interface moved to ./MeetingsStagesView.tsx
// (canonical home now that the rendering lives there). Re-imported
// here for the MeetingDetail shape.

// (v1.10.596) Promoted to export so the extracted
// MeetingsDetailBody sibling can type its `detail` prop.
export interface MeetingDetail {
  id: string;
  status: MeetingStatus;
  track: string;
  title: string;
  task: string;
  forkOf: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  currentStage: string | null;
  currentRound: number;
  stages: StageView[];
  transcripts: Turn[][];
}

// (v1.10.543) Lineage types moved to ./MeetingsLineageStrip.tsx
// (canonical home now that the UI lives there).

// (Phase 6.5) Action-items extracted from transcript markers.
// (v1.10.542) ActionItem + ActionItemsResponse moved to
// ./MeetingsActionItemsPanel.tsx (canonical home now that the
// UI lives there). ActionItemType stays here so other panels
// (MeetingsRecapPanel) can import it from a stable location.
export type ActionItemType = 'decision' | 'action' | 'todo' | 'blocker';

// (v1.10.541) Recap types moved to ./MeetingsRecapPanel.tsx
// (the canonical location now that the UI lives there too).

export const STATUS_BADGE: Record<MeetingStatus, string> = {
  pending: 'border-border bg-muted/40 text-muted-foreground',
  'in-progress': 'border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400',
  completed: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  escalated: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  aborted: 'border-destructive/40 bg-destructive/10 text-destructive',
};

export function formatRelative(iso: string | null): string {
  if (!iso) return '-';
  const dt = new Date(iso);
  const diff = Math.floor((Date.now() - dt.getTime()) / 1000);
  if (diff < 60) return tFormat('meetings.relative.seconds', { n: diff });
  if (diff < 3600) return tFormat('meetings.relative.minutes', { n: Math.floor(diff / 60) });
  if (diff < 86400) return tFormat('meetings.relative.hours', { n: Math.floor(diff / 3600) });
  return dt.toISOString().slice(0, 10);
}

export default function MeetingsView() {
  useLocale();
  // (Phase 6.11) List-level filters (separate from search filters
  // — search hits FTS, list hits the bare /meetings endpoint).
  const [listStatus, setListStatus] = useState<MeetingStatus | ''>('');
  const [listTrack, setListTrack] = useState<Track | ''>('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // (Phase 6.9) Lineage chain for the selected meeting. Only
  // (v1.10.624) lineage / actions / recap state + 3 fetch effects
  // moved into useMeetingEnrichment.

  // (v1.10.627) Stuck-meetings poll hook extracted to
  // ../lib/use-stuck-meetings.
  const stuck = useStuckMeetings();

  // (Phase 8.1) FTS search state. Empty query → bare list.
  // Non-empty → /api/meetings/search?q=&facet=status,track replaces
  // the list. Debounced 250ms so each keystroke doesn't fire a
  // request.
  // (Phase 8.1.5) status + track filters compose with the MATCH so
  // operators can narrow "auth migration" to "completed full-track"
  // without scanning the whole result list.
  const [searchQuery, setSearchQuery] = useState('');
  const [searchStatus, setSearchStatus] = useState<MeetingStatus | ''>('');
  const [searchTrack, setSearchTrack] = useState<Track | ''>('');
  // (Phase 8.1.5) since/until — date inputs (YYYY-MM-DD) translated
  // to ISO timestamps in the URL params.
  const [searchSince, setSearchSince] = useState('');
  const [searchUntil, setSearchUntil] = useState('');

  // (v1.10.626) /api/meetings list + SSE stream + fallback poll
  // hook extracted to ../lib/use-meetings-list.
  const { data, error, loading, refresh } = useMeetingsList({ listStatus, listTrack });

  // (Phase 8.1) Debounced FTS search.
  // (v1.10.623) Hook extracted to ../lib/use-meetings-search.
  const {
    searchResults,
    searchFacets,
    searchTotal,
    searchError,
    searching,
  } = useMeetingsSearch({
    query: searchQuery,
    status: searchStatus,
    track: searchTrack,
    since: searchSince,
    until: searchUntil,
    meetings: data?.meetings || [],
  });

  // (v1.10.625) Detail SSE stream + state hook extracted to
  // ../lib/use-meeting-detail-stream.
  const { detail, detailError, streaming } = useMeetingDetailStream(selectedId);

  // (v1.10.624) Detail enrichment (lineage / action-items / recap)
  // hook extracted to ../lib/use-meeting-enrichment.
  const { lineage, actions, recap } = useMeetingEnrichment({ selectedId, detail });

  const meetings = data?.meetings || [];
  const selectedSummary = useMemo(
    () => meetings.find((m) => m.id === selectedId) || null,
    [meetings, selectedId],
  );

  // (v1.10.557) Create-meeting composer extracted to
  // ./MeetingsComposer.tsx. Owns the new-task / track / templates
  // / template-vars / classify-preview / dispatcher-plan-preview
  // state internally. Parent keeps just the `creating` flag so
  // the toggle button can flip it.
  const [creating, toggleCreating, setCreating] = useToggle();

  // (v1.10.556) Run controls (brain selector + Run button +
  // error display) extracted to ./MeetingsRunControls.tsx.

  // (v1.10.553) Publish controls extracted to
  // ./MeetingsPublishControls.tsx — owns its own busy / msg /
  // git-toggle state and the POST handler.

  // (v1.10.554) Peer-retro brain selector + button + result
  // extracted to ./MeetingsPeerRetroControls.tsx.

  // (v1.10.339) Manual state-machine controls for in-progress
  // meetings. Most operators use Run + auto-finalize, but for
  // long-running manual sessions (e.g., human-driven contributions
  // via CLI) the per-state buttons matter. All four actions
  // (start / advance / next-round / escalate / abort) hit the
  // existing endpoints and rely on the SSE stream to refresh the
  // detail panel — no manual refetch needed.
  // (v1.10.555) State-machine controls (start / advance /
  // next-round / escalate / abort) extracted to
  // ./MeetingsStateActions.tsx. Two render modes: 'pending'
  // shows just Start; 'in-progress' shows the four progress
  // buttons.

  // (v1.10.345) Manual contribute / vote on in-progress meetings.
  // Endpoints exist since Phase 1; the web UI only surfaced "Run"
  // which auto-drives via brain. For hybrid sessions where a
  // human-in-the-loop wants to write a contribution from a given
  // specialist, we now have an inline form on the detail panel.
  // Vote-only is the same endpoint with no `text` (we use /vote
  // for that — strictly a vote without a turn).
  // (v1.10.551) Contribute panel extracted to
  // ./MeetingsContributePanel.tsx — owns its own form state.
  // Parent keeps just the open/closed flag (toggle button lives
  // in the manual-control row above the panel).
  // (v1.10.638) Auto-close-on-selection-change extracted to
  // useToggleResetOnChange — the extracted panel resets its
  // own field state on meetingId change too.
  const { open: contribOpen, toggle: toggleContrib } = useToggleResetOnChange(selectedId);

  // (v1.10.345) Retro preview / finalize for terminal meetings.
  // Endpoints exist since phase 2.6; the web only had run with
  // autoFinalize. For meetings the operator wants to preview before
  // applying, surface explicit retro + finalize buttons next to
  // publish.
  // (v1.10.552) Retro preview / finalize panel extracted to
  // ./MeetingsRetroActions.tsx — owns its own busy / result /
  // error state and the POST handler.

  // (v1.10.352) Fork meeting — POST /meetings/:id/fork. Used to
  // redo a meeting with a sharper question or scope. Two modes:
  //   - replan: re-runs dispatcher (rosters can change)
  //   - reuse:  deep-clones the source plan (same rosters)
  // Form shows up when the operator clicks "Fork…"; on submit
  // we navigate to the new meeting id so the operator immediately
  // lands on the freshly-spawned pending session.
  // (v1.10.544) Fork form extracted to ./MeetingsForkForm.tsx.
  // Parent keeps the open/closed flag (so the "Fork…" button next
  // to publish/peer-retro can toggle it); the form owns its own
  // mode / task / title / track / busy / error state internally.
  // (v1.10.638) Same auto-close pattern as contribOpen — half-
  // typed fork from meeting A shouldn't leak to meeting B.
  const { open: forkOpen, toggle: toggleFork, setOpen: setForkOpen } = useToggleResetOnChange(selectedId);

  // (v1.10.342) Maintenance — surfacing four ops endpoints from
  // an inline collapsible panel:
  // (v1.10.529) Maintenance panel state extracted to
  // ./MeetingsMaintenancePanel.tsx — drops ~150 lines of state +
  // ~200 lines of UI from this file. The panel renders the
  // collapsible footer with integrity / FTS rebuild / hot
  // backup / prune-old. It calls back via `onPruned` so we can
  // refresh the list when prune mutates state.
  // (Section index marker preserved for source-grep tests.)
  // GET  /meetings/persist-integrity (read-only health check)
  // POST /meetings/persist-backup    (hot copy)
  // POST /meetings/fts-rebuild       (force re-index)
  // POST /meetings/prune-old         (delete with dry-run)

  // (v1.10.557) handleCreate moved into the extracted MeetingsComposer.

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 md:p-6">
      {/* (v1.10.543) Stuck banner extracted to
          ./MeetingsStuckBanner.tsx. */}
      <MeetingsStuckBanner stuck={stuck} onNavigate={setSelectedId} />
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden md:flex-row">
      <Card className="flex min-h-0 flex-1 flex-col md:max-w-md">
        {/* (v1.10.615) Master-pane card header (title + filter +
            search + composer) extracted to ./MeetingsListCardHeader.tsx. */}
        <MeetingsListCardHeader
          creating={creating}
          loading={loading}
          onToggleCreating={toggleCreating}
          onRefresh={refresh}
          listStatus={listStatus}
          onListStatusChange={setListStatus}
          listTrack={listTrack}
          onListTrackChange={setListTrack}
          searchQuery={searchQuery}
          onChangeSearchQuery={setSearchQuery}
          searching={searching}
          searchStatus={searchStatus}
          onSearchStatusChange={setSearchStatus}
          searchTrack={searchTrack}
          onSearchTrackChange={setSearchTrack}
          searchSince={searchSince}
          onSearchSinceChange={setSearchSince}
          searchUntil={searchUntil}
          onSearchUntilChange={setSearchUntil}
          searchResults={searchResults}
          searchFacets={searchFacets}
          searchTotal={searchTotal}
          searchError={searchError}
          onCloseComposer={() => setCreating(false)}
          onCreatedComposer={(newId) => {
            setCreating(false);
            void refresh();
            setSelectedId(newId);
          }}
        />
        <CardContent className="flex min-h-0 flex-1 flex-col overflow-y-auto p-0">
          {/* (v1.10.576) Master-pane list extracted to ./MeetingsList.tsx. */}
          <MeetingsList
            displayList={searchResults !== null ? searchResults : meetings}
            isSearchMode={searchResults !== null}
            searchQuery={searchQuery}
            error={error}
            loading={loading}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </CardContent>
        {/* (v1.10.529) Maintenance — collapsible footer with the
            four ops endpoints. Extracted to
            ./MeetingsMaintenancePanel.tsx. */}
        <MeetingsMaintenancePanel onPruned={refresh} />
      </Card>

      <Card className="flex min-h-0 flex-1 flex-col">
        {/* (v1.10.614) Detail card header (title + 3 status
            composites) extracted to ./MeetingsDetailCardHeader.tsx. */}
        <MeetingsDetailCardHeader
          title={selectedSummary ? selectedSummary.title : t('meetings.title.select')}
          selectedId={selectedId}
          detail={detail}
          streaming={streaming}
          contribOpen={contribOpen}
          onContribToggle={toggleContrib}
          forkOpen={forkOpen}
          onForkToggle={toggleFork}
          onForkClose={() => setForkOpen(false)}
          onForked={(newId) => {
            void refresh();
            setSelectedId(newId);
          }}
        />
        <CardContent className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          {/* (v1.10.596) Detail body extracted to ./MeetingsDetailBody.tsx. */}
          <MeetingsDetailBody
            selectedId={selectedId}
            detailError={detailError}
            detail={detail}
            lineage={lineage}
            recap={recap}
            actions={actions}
            onNavigate={setSelectedId}
          />
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
