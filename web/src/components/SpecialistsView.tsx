import { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye } from 'lucide-react';
import { apiDelete, apiGet, apiPost } from '../lib/api';
import { Card, CardContent } from './ui';
import { t, tFormat, useLocale } from '../lib/i18n';
import SpecialistsAuditPanel from './SpecialistsAuditPanel';
import SpecialistsBulkOpsToolbar from './SpecialistsBulkOpsToolbar';
import SpecialistsSummaryBar from './SpecialistsSummaryBar';
import SpecialistsPromptPanel from './SpecialistsPromptPanel';
import SpecialistsTagEditor from './SpecialistsTagEditor';
import SpecialistsList from './SpecialistsList';
import SpecialistsListCardHeader from './SpecialistsListCardHeader';
import { useSpecialistsList } from '../lib/use-specialists-list';
import SpecialistsDetailHeader from './SpecialistsDetailHeader';
import SpecialistsMetadataPanel from './SpecialistsMetadataPanel';
import SpecialistsScoreHistory from './SpecialistsScoreHistory';
import SpecialistsEnrichmentPanels from './SpecialistsEnrichmentPanels';

// (multi-specialist phase 7.5) Specialists tab — registry view +
// score visualization. Mirrors MeetingsView / WikiView's split
// layout. Add / remove governance lands on top in a follow-up;
// this slice is read-only so an operator can see who's on the
// roster and how they've scored across past retros.

export interface Specialist {
  id: string;
  displayName: string;
  tier: string;
  domain: string[];
  brain: { adapter: string; model: string | null; effort: string | null };
  systemPrompt: string;
  triggers: { keywords: string[]; stages: string[] };
  deliverables: string[];
  // (Phase 1.6) free-form tags for grouping/filter
  tags?: string[];
  vetoPower: boolean;
  probation: 'stable' | 'probation';
  score: {
    byDomain: Record<string, number>;
    byStage: Record<string, number>;
    samples: Record<string, number>;
    lastUpdated: string | null;
  };
}

// (v1.10.628) Promoted to export so useSpecialistsList can type
// its returned data slot.
export interface ListResponse {
  count: number;
  version: number;
  specialists: Specialist[];
}

export const TIER_BADGE: Record<string, string> = {
  meeting: 'border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400',
  design: 'border-purple-500/40 bg-purple-500/10 text-purple-600 dark:text-purple-400',
  implement: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  review: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  audit: 'border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400',
  test: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
  deploy: 'border-orange-500/40 bg-orange-500/10 text-orange-600 dark:text-orange-400',
  docs: 'border-border bg-muted/40 text-muted-foreground',
};

// (v1.10.598) ScoreBar + scoreWidth moved to
// ./SpecialistsScoreHistory.tsx (sole consumer).

// (v1.10.599) Phase 6.8 enrichment shapes — lifted out of the
// component function and exported so SpecialistsEnrichmentPanels
// can type its props.
export interface MeetingMeta {
  id: string;
  status: string;
  title: string;
  track: string;
  createdAt: string;
  completedAt: string | null;
}

export interface AuditEntry {
  ts: string;
  action: string;
  id?: string | null;
  actor?: string | null;
  reason?: string | null;
  mode?: string | null;
  meetingId?: string | null;
}

export default function SpecialistsView() {
  useLocale();
  // (v1.10.628) /api/specialists list + flagged-id set hook
  // extracted to ../lib/use-specialists-list.
  const { data, error, loading, flaggedIds, refresh } = useSpecialistsList();
  const [filter, setFilter] = useState('');
  const [tierFilter, setTierFilter] = useState<string>('any');
  const [vetoOnly, setVetoOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // (v1.10.546) Add / Propose panel extracted to
  // ./SpecialistsAddPanel.tsx. Parent keeps the open flag so the
  // header toggle button (aria-expanded={addOpen}) still works.
  const [addOpen, setAddOpen] = useState(false);
  // Transient error surface for parent-side ops (tag-edit / score-reset)
  // that don't have their own panel — kept here so the existing
  // surfaces below the action buttons survive the AddPanel extraction.
  const [actionError, setActionError] = useState<string | null>(null);

  // Remove governance — guarded by a 2-step confirm prompt.
  const [removeBusy, setRemoveBusy] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  // (Phase 8.5) Score-reset — wipes byDomain/byStage/samples for
  // a specialist. Guarded by a 2-step confirm same as remove.
  const [resetBusy, setResetBusy] = useState(false);
  const [confirmResetId, setConfirmResetId] = useState<string | null>(null);

  // (v1.10.558) Suggest revision + Apply via meeting consensus
  // (Phase 5.1 / 5.2) extracted to ./SpecialistsPromptPanel.tsx.

  // (v1.10.532) Bulk export / import / audit-rotate panel
  // extracted to ./SpecialistsBulkOpsToolbar.tsx — see header
  // there. Wired below as <SpecialistsBulkOpsToolbar onChange={refresh} />.

  // (v1.10.559) Tag editor extracted to ./SpecialistsTagEditor.tsx.
  const handleScoreReset = useCallback(async (id: string) => {
    setResetBusy(true);
    try {
      await apiPost(
        `/api/specialists/${encodeURIComponent(id)}/score-reset`,
        { reason: 'web reset' },
      );
      setConfirmResetId(null);
      await refresh();
    } catch (e) {
      // Surface as a transient error in the action-error
      // banner — minimal disruption for an operator-triggered op.
      setActionError(tFormat('specialists.scoreReset.failed', {
        error: (e as Error).message || t('common.failed'),
      }));
    } finally {
      setResetBusy(false);
    }
  }, [refresh]);

  const handleRemove = useCallback(async (id: string) => {
    setRemoveBusy(true);
    try {
      await apiDelete(`/api/specialists/${encodeURIComponent(id)}`);
      if (selectedId === id) setSelectedId(null);
      await refresh();
    } catch (e) {
      setActionError((e as Error).message || t('common.failedToRemoveSpecialist'));
    } finally {
      setRemoveBusy(false);
      setConfirmRemoveId(null);
    }
  }, [selectedId, refresh]);

  const specialists = data?.specialists || [];
  const filtered = useMemo(() => {
    // (Phase 8.4) Whitespace-separated tokens AND-compose. Search
    // hits id / displayName / domain / triggers.keywords AND the
    // systemPrompt body — the same axes the backend's
    // searchByText() covers, but client-side because the registry
    // is bounded.
    const tokens = filter.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return specialists.filter((s) => {
      if (vetoOnly && !s.vetoPower) return false;
      if (tierFilter !== 'any' && s.tier !== tierFilter) return false;
      if (tokens.length === 0) return true;
      const haystack = [
        s.id,
        s.displayName,
        s.systemPrompt || '',
        ...(Array.isArray(s.domain) ? s.domain : []),
        ...(s.triggers && s.triggers.keywords ? s.triggers.keywords : []),
      ].join(' ').toLowerCase();
      return tokens.every((t) => haystack.includes(t));
    });
  }, [specialists, filter, tierFilter, vetoOnly]);

  const selected = useMemo(
    () => specialists.find((s) => s.id === selectedId) || null,
    [specialists, selectedId],
  );

  // (Phase 6.8) Detail enrichment — fetch ?include=audit,meetings
  // for the currently selected specialist. Cheap, runs on selection
  // change. Failure silently nulls. (v1.10.599 lifted types out
  // for SpecialistsEnrichmentPanels.)
  const [enrichment, setEnrichment] = useState<{
    recentAudit?: AuditEntry[];
    recentMeetings?: MeetingMeta[];
  } | null>(null);
  useEffect(() => {
    if (!selectedId) {
      setEnrichment(null);
      return;
    }
    let cancelled = false;
    apiGet<{ recentAudit?: AuditEntry[]; recentMeetings?: MeetingMeta[] }>(
      `/api/specialists/${encodeURIComponent(selectedId)}?include=audit,meetings`,
    )
      .then((res) => {
        if (cancelled) return;
        const next: { recentAudit?: AuditEntry[]; recentMeetings?: MeetingMeta[] } = {};
        if (res.recentAudit !== undefined) next.recentAudit = res.recentAudit;
        if (res.recentMeetings !== undefined) next.recentMeetings = res.recentMeetings;
        setEnrichment(next);
      })
      .catch(() => { if (!cancelled) setEnrichment(null); });
    return () => { cancelled = true; };
  }, [selectedId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 md:p-6">
      {/* (v1.10.545) Organism summary info bar extracted to
          ./SpecialistsSummaryBar.tsx — self-polling, renders
          nothing when the endpoint is unreachable. */}
      <SpecialistsSummaryBar />
      {/* (v1.10.532) Operator action row — export / import /
          audit-rotate. Sits between the summary and audit log. */}
      <SpecialistsBulkOpsToolbar onChange={refresh} />
      {/* (Phase 1.4 + 7.10) Audit log viewer. Collapsed by default. */}
      <SpecialistsAuditPanel />
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden md:flex-row">
      <Card className="flex min-h-0 flex-1 flex-col md:max-w-md">
        {/* (v1.10.618) Master-pane card header (title bar + search
            filters) extracted to ./SpecialistsListCardHeader.tsx. */}
        <SpecialistsListCardHeader
          loading={loading}
          addOpen={addOpen}
          actionError={actionError}
          onToggleAdd={() => { setAddOpen((v) => !v); setActionError(null); }}
          onCloseAdd={() => setAddOpen(false)}
          onAdded={(newId) => {
            setSelectedId(newId);
            setAddOpen(false);
            void refresh();
          }}
          onRefresh={refresh}
          filter={filter}
          onFilter={setFilter}
          tierFilter={tierFilter}
          onTierFilter={setTierFilter}
          vetoOnly={vetoOnly}
          onVetoOnly={setVetoOnly}
          filteredCount={filtered.length}
          totalCount={specialists.length}
        />
        <CardContent tabIndex={0} role="region" aria-label={t('specialists.list.aria') || 'Specialist list'} className="flex min-h-0 flex-1 flex-col overflow-y-auto p-0">
          {/* (v1.10.577) Master-pane list extracted to ./SpecialistsList.tsx */}
          <SpecialistsList
            filtered={filtered}
            error={error}
            loading={loading}
            selectedId={selectedId}
            onSelect={setSelectedId}
            flaggedIds={flaggedIds}
          />
        </CardContent>
      </Card>

      <Card className="flex min-h-0 flex-1 flex-col">
        {/* (v1.10.592) Detail header extracted to ./SpecialistsDetailHeader.tsx. */}
        <SpecialistsDetailHeader
          selected={selected}
          confirmRemoveId={confirmRemoveId}
          removeBusy={removeBusy}
          onConfirmRemove={setConfirmRemoveId}
          onRemove={handleRemove}
        />
        <CardContent className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          {!selected ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              <Eye className="mr-2 h-3.5 w-3.5" aria-hidden />
              {t('specialists.empty.pick')}
            </div>
          ) : (
            <>
              {/* (v1.10.597) Metadata block extracted to
                  ./SpecialistsMetadataPanel.tsx. */}
              <SpecialistsMetadataPanel specialist={selected} />

              {/* (v1.10.559) Tag editor extracted to
                  ./SpecialistsTagEditor.tsx. */}
              <SpecialistsTagEditor
                specialistId={selected.id}
                tags={selected.tags}
                onSaved={() => { void refresh(); }}
                onError={setActionError}
              />

              {/* (v1.10.598) Score-history block extracted to
                  ./SpecialistsScoreHistory.tsx. */}
              <SpecialistsScoreHistory
                specialist={selected}
                confirmResetId={confirmResetId}
                resetBusy={resetBusy}
                onConfirmReset={setConfirmResetId}
                onScoreReset={handleScoreReset}
              />

              {/* (v1.10.558) Suggest + Apply prompt panel extracted
                  to ./SpecialistsPromptPanel.tsx. */}
              <SpecialistsPromptPanel
                specialistId={selected.id}
                systemPrompt={selected.systemPrompt}
              />

              {/* (v1.10.599) Phase 6.8 enrichment panels extracted to
                  ./SpecialistsEnrichmentPanels.tsx. */}
              <SpecialistsEnrichmentPanels
                recentAudit={enrichment?.recentAudit}
                recentMeetings={enrichment?.recentMeetings}
              />
            </>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
