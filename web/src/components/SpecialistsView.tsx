import { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, Plus, RefreshCw } from 'lucide-react';
import { apiDelete, apiGet, apiPost } from '../lib/api';
import { Button, Card, CardContent, CardHeader, CardTitle } from './ui';
import { cn } from '../lib/cn';
import { t, tFormat, useLocale } from '../lib/i18n';
import SpecialistsAuditPanel from './SpecialistsAuditPanel';
import SpecialistsBulkOpsToolbar from './SpecialistsBulkOpsToolbar';
import SpecialistsSummaryBar from './SpecialistsSummaryBar';
import SpecialistsAddPanel from './SpecialistsAddPanel';
import SpecialistsPromptPanel from './SpecialistsPromptPanel';
import SpecialistsTagEditor from './SpecialistsTagEditor';
import SpecialistsList from './SpecialistsList';
import SpecialistsSearchFilters from './SpecialistsSearchFilters';
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

interface ListResponse {
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
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [tierFilter, setTierFilter] = useState<string>('any');
  const [vetoOnly, setVetoOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<ListResponse>('/api/specialists');
      setData(res);
    } catch (e) {
      setError((e as Error).message || t('common.failedToLoadSpecialists'));
    } finally {
      setLoading(false);
    }
  }, []);

  // (v1.10.545) Organism summary info bar extracted to
  // ./SpecialistsSummaryBar.tsx — self-polling, owns its own
  // state. Parent doesn't need this data so the fetch lives
  // entirely in the panel.

  // (v1.10.531) Audit log viewer + chain-verify + CSV export
  // extracted to ./SpecialistsAuditPanel.tsx (~240 lines moved).

  // Underperformer scan (phase 5.1) — fetched separately so the
  // alert pill on a row can light up before the operator clicks.
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set());
  const refreshFlags = useCallback(async () => {
    try {
      const res = await apiGet<{ items: Array<{ id: string }> }>(
        '/api/specialists/underperformers',
      );
      const next = new Set<string>();
      for (const it of res.items || []) next.add(it.id);
      setFlaggedIds(next);
    } catch {
      // best-effort — don't block the main view if underperformer
      // detection is misconfigured.
    }
  }, []);
  useEffect(() => { refreshFlags(); }, [refreshFlags]);

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
      setError((e as Error).message || t('common.failedToRemoveSpecialist'));
    } finally {
      setRemoveBusy(false);
      setConfirmRemoveId(null);
    }
  }, [selectedId, refresh]);

  useEffect(() => { refresh(); }, [refresh]);

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
        <CardHeader className="flex flex-col gap-2 border-b border-border p-4">
          <div className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">{t('specialists.title')}</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => { setAddOpen((v) => !v); setActionError(null); }}
                aria-label={t('specialists.add.label')}
                aria-expanded={addOpen}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                {t('common.add')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={refresh}
                disabled={loading}
                aria-label={t('specialists.action.refresh')}
              >
                <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} aria-hidden />
                {t('common.refresh')}
              </Button>
            </div>
          </div>
          {actionError ? (
            <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-[11px] text-destructive">
              {actionError}
            </div>
          ) : null}
          {/* (v1.10.546) Add/Propose panel extracted to
              ./SpecialistsAddPanel.tsx. */}
          <SpecialistsAddPanel
            open={addOpen}
            onClose={() => setAddOpen(false)}
            onAdded={(newId) => {
              setSelectedId(newId);
              setAddOpen(false);
              void refresh();
            }}
          />
          {/* (v1.10.581) search input + tier/vetoOnly filter row
              extracted to ./SpecialistsSearchFilters.tsx. */}
          <SpecialistsSearchFilters
            filter={filter}
            onFilter={setFilter}
            tierFilter={tierFilter}
            onTierFilter={setTierFilter}
            vetoOnly={vetoOnly}
            onVetoOnly={setVetoOnly}
            filteredCount={filtered.length}
            totalCount={specialists.length}
          />
        </CardHeader>
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
