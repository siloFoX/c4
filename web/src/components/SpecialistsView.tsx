import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Eye, Plus, RefreshCw, Search, Shield, Star, Trash2, X } from 'lucide-react';
import { apiDelete, apiGet, apiPatch, apiPost } from '../lib/api';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input } from './ui';
import { cn } from '../lib/cn';
import { t, tFormat, useLocale } from '../lib/i18n';
import SpecialistsAuditPanel from './SpecialistsAuditPanel';
import SpecialistsBulkOpsToolbar from './SpecialistsBulkOpsToolbar';
import SpecialistsSummaryBar from './SpecialistsSummaryBar';
import SpecialistsAddPanel from './SpecialistsAddPanel';
import SpecialistsPromptPanel from './SpecialistsPromptPanel';

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

const TIER_BADGE: Record<string, string> = {
  meeting: 'border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400',
  design: 'border-purple-500/40 bg-purple-500/10 text-purple-600 dark:text-purple-400',
  implement: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  review: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  audit: 'border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400',
  test: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
  deploy: 'border-orange-500/40 bg-orange-500/10 text-orange-600 dark:text-orange-400',
  docs: 'border-border bg-muted/40 text-muted-foreground',
};

// Map a [-1..+1] score to a [0..100] width % for the inline bar.
function scoreWidth(v: number): number {
  if (!Number.isFinite(v)) return 0;
  const clamped = Math.max(-1, Math.min(1, v));
  return ((clamped + 1) / 2) * 100;
}

function ScoreBar({ value, samples }: { value: number; samples: number }) {
  const width = scoreWidth(value);
  const color = value > 0
    ? 'bg-emerald-500/60'
    : value < 0
      ? 'bg-rose-500/60'
      : 'bg-muted-foreground/40';
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-1.5 w-32 overflow-hidden rounded-full bg-muted">
        <div className="absolute inset-y-0 left-1/2 w-px bg-border" aria-hidden />
        <div
          className={cn('absolute inset-y-0', color)}
          style={
            value >= 0
              ? { left: '50%', width: `${width - 50}%` }
              : { right: '50%', width: `${50 - width}%` }
          }
        />
      </div>
      <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
        {value.toFixed(2).padStart(5, ' ')}
      </span>
      <span className="text-[10px] text-muted-foreground">n={samples}</span>
    </div>
  );
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

  // (Phase 1.6) Tag edit — mode: replace | add | remove via
  // PATCH /specialists/:id/tags. UI takes a comma-separated value
  // and infers add/remove from operator's intent (`+ a, b` / `- a`)
  // or replaces wholesale by default.
  const [tagEditOpen, setTagEditOpen] = useState(false);
  const [tagEditValue, setTagEditValue] = useState('');
  const [tagBusy, setTagBusy] = useState(false);
  const handleTagEdit = useCallback(async (id: string) => {
    const raw = tagEditValue.trim();
    if (!raw) return;
    let mode: 'replace' | 'add' | 'remove' = 'replace';
    let tagsRaw = raw;
    if (raw.startsWith('+')) { mode = 'add'; tagsRaw = raw.slice(1); }
    else if (raw.startsWith('-')) { mode = 'remove'; tagsRaw = raw.slice(1); }
    const tags = tagsRaw.split(',').map((t) => t.trim()).filter(Boolean);
    if (tags.length === 0 && mode === 'replace') return; // empty replace = clear; we want intentional clears
    setTagBusy(true);
    try {
      await apiPatch(`/api/specialists/${encodeURIComponent(id)}/tags`, { tags, mode });
      setTagEditValue('');
      setTagEditOpen(false);
      await refresh();
    } catch (e) {
      setActionError(tFormat('specialists.tagEdit.failed', {
        error: (e as Error).message || t('common.failed'),
      }));
    } finally {
      setTagBusy(false);
    }
  }, [tagEditValue, refresh]);
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
  // change. Failure silently nulls.
  interface MeetingMeta {
    id: string;
    status: string;
    title: string;
    track: string;
    createdAt: string;
    completedAt: string | null;
  }
  interface AuditEntry {
    ts: string;
    action: string;
    id?: string | null;
    actor?: string | null;
    reason?: string | null;
    mode?: string | null;
    meetingId?: string | null;
  }
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
          {/* (Phase 8.4) text search across id / displayName /
              systemPrompt / domain / triggers.keywords. Whitespace
              tokens AND-compose. */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t('specialists.search.placeholder')}
              aria-label={t('specialists.search.label')}
              className="pl-7 pr-7"
            />
            {filter ? (
              <button
                type="button"
                onClick={() => setFilter('')}
                aria-label={t('specialists.action.clearFilter')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <label className="text-muted-foreground">
              {t('specialists.label.tier')}
              <select
                className="ml-1 rounded border border-border bg-background px-1 py-0.5 text-[11px]"
                value={tierFilter}
                onChange={(e) => setTierFilter(e.target.value)}
                aria-label={t('specialists.action.tierFilter')}
              >
                <option value="any">{t('specialists.option.any')}</option>
                {Object.keys(TIER_BADGE).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="inline-flex items-center gap-1">
              <input
                type="checkbox"
                checked={vetoOnly}
                onChange={(e) => setVetoOnly(e.target.checked)}
                aria-label={t('specialists.action.vetoOnly')}
              />
              <span>{t('specialists.label.vetoOnly')}</span>
            </label>
            <span className="text-muted-foreground">{filtered.length}/{specialists.length}</span>
          </div>
        </CardHeader>
        <CardContent tabIndex={0} role="region" aria-label={t('specialists.list.aria') || 'Specialist list'} className="flex min-h-0 flex-1 flex-col overflow-y-auto p-0">
          {error ? (
            <div className="p-4 text-sm text-destructive">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">
              {loading ? t('common.loadingDots') : t('specialists.empty.noMatch')}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((s) => {
                const active = s.id === selectedId;
                const samplesTotal = Object.values(s.score.samples || {}).reduce((a, b) => a + b, 0);
                return (
                  <li
                    key={s.id}
                    className={cn(
                      'flex cursor-pointer flex-col gap-1 px-4 py-3 transition-colors',
                      active ? 'bg-primary/30' : 'hover:bg-accent/40',
                    )}
                    onClick={() => setSelectedId(s.id)}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn(
                        'inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] uppercase tracking-wide',
                        TIER_BADGE[s.tier] || 'border-border text-muted-foreground',
                      )}>
                        {s.tier}
                      </span>
                      {s.vetoPower ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/10 px-1.5 py-0 text-[10px] text-rose-600 dark:text-rose-400">
                          <Shield className="h-2.5 w-2.5" aria-hidden />
                          veto
                        </span>
                      ) : null}
                      {s.probation === 'probation' ? (
                        <Badge variant="outline" className="text-[10px]">{t('specialists.badge.probation')}</Badge>
                      ) : null}
                      <span className="text-[10px] text-muted-foreground">
                        {s.brain.adapter}/{s.brain.model || '-'}
                      </span>
                      {samplesTotal > 0 ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Star className="h-2.5 w-2.5" aria-hidden />
                          {samplesTotal}
                        </span>
                      ) : null}
                      {flaggedIds.has(s.id) ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0 text-[10px] text-amber-700 dark:text-amber-400"
                          title={t('specialists.tooltip.underperform')}
                        >
                          <AlertTriangle className="h-2.5 w-2.5" aria-hidden />
                          underperform
                        </span>
                      ) : null}
                    </div>
                    <span className="truncate text-sm font-medium">{s.id}</span>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {s.domain.join(', ')}
                    </span>
                    {Array.isArray(s.tags) && s.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-0.5">
                        {s.tags.slice(0, 4).map((t) => (
                          <span
                            key={t}
                            className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-1 py-0 text-[9px] text-cyan-700 dark:text-cyan-400"
                          >
                            #{t}
                          </span>
                        ))}
                        {s.tags.length > 4 ? (
                          <span className="text-[9px] text-muted-foreground">+{s.tags.length - 4}</span>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="flex min-h-0 flex-1 flex-col">
        <CardHeader className="flex flex-col gap-2 border-b border-border p-4">
          <div className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">
              {selected
                ? tFormat('specialists.title.selected', { id: selected.id, name: selected.displayName })
                : t('specialists.title.select')}
            </CardTitle>
            {selected ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirmRemoveId(selected.id)}
                disabled={removeBusy}
                className="text-destructive hover:bg-destructive/10"
                aria-label={tFormat('specialists.action.removeAria', { id: selected.id })}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                {t('common.remove')}
              </Button>
            ) : null}
          </div>
          {confirmRemoveId && selected && confirmRemoveId === selected.id ? (
            <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-[11px]">
              <span>
                {t('specialists.confirmRemove.prefix')}
                <span className="font-mono">{selected.id}</span>
                {t('specialists.confirmRemove.suffix')}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirmRemoveId(null)}
                disabled={removeBusy}
              >
                {t('common.cancel')}
              </Button>
              <Button
                size="sm"
                onClick={() => handleRemove(selected.id)}
                disabled={removeBusy}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {t('specialists.action.confirmRemove')}
              </Button>
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          {!selected ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              <Eye className="mr-2 h-3.5 w-3.5" aria-hidden />
              {t('specialists.empty.pick')}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                <div>
                  <div className="text-muted-foreground">{t('specialists.label.tier')}</div>
                  <div className="font-medium">{selected.tier}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">{t('specialists.label.brain')}</div>
                  <div className="font-medium">{selected.brain.adapter}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">{t('specialists.label.model')}</div>
                  <div className="font-medium">{selected.brain.model || '-'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">{t('specialists.label.effort')}</div>
                  <div className="font-medium">{selected.brain.effort || '-'}</div>
                </div>
              </div>

              <div className="text-xs">
                <div className="text-muted-foreground">{t('specialists.label.domains')}</div>
                <div className="font-medium">{selected.domain.join(', ')}</div>
              </div>
              <div className="text-xs">
                <div className="text-muted-foreground">{t('specialists.label.triggersStages')}</div>
                <div className="font-medium">{selected.triggers.stages.join(', ')}</div>
              </div>
              <div className="text-xs">
                <div className="text-muted-foreground">{t('specialists.label.triggersKeywords')}</div>
                <div className="font-medium">{selected.triggers.keywords.join(', ')}</div>
              </div>
              {selected.deliverables.length > 0 ? (
                <div className="text-xs">
                  <div className="text-muted-foreground">{t('specialists.label.deliverables')}</div>
                  <ul className="mt-1 list-disc pl-5 font-medium">
                    {selected.deliverables.map((d) => (<li key={d}>{d}</li>))}
                  </ul>
                </div>
              ) : null}

              {/* (Phase 1.6) Tag editor — replace / add (`+a,b`) /
                  remove (`-a`) via PATCH /specialists/:id/tags. */}
              <div className="text-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-muted-foreground">{t('specialists.label.tags')}</div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setTagEditOpen((v) => !v);
                      setTagEditValue(Array.isArray(selected.tags) ? selected.tags.join(', ') : '');
                    }}
                    className="h-6 px-2 text-[10px]"
                  >
                    {tagEditOpen ? t('specialists.tags.cancel') : t('specialists.tags.edit')}
                  </Button>
                </div>
                {!tagEditOpen ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {Array.isArray(selected.tags) && selected.tags.length > 0
                      ? selected.tags.map((t) => (
                          <span key={t} className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-1.5 py-0 text-[10px] text-cyan-700 dark:text-cyan-400">
                            #{t}
                          </span>
                        ))
                      : <span className="text-[11px] text-muted-foreground italic">{t('specialists.tags.empty')}</span>}
                  </div>
                ) : (
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <Input
                      type="text"
                      value={tagEditValue}
                      onChange={(e) => setTagEditValue(e.target.value)}
                      placeholder={t('specialists.tags.placeholder')}
                      aria-label={t('specialists.action.editTags')}
                      className="h-7 flex-1 text-[11px]"
                      disabled={tagBusy}
                    />
                    <Button
                      size="sm"
                      onClick={() => handleTagEdit(selected.id)}
                      disabled={tagBusy}
                      className="h-7 px-2 text-[11px]"
                    >
                      {t('common.apply')}
                    </Button>
                  </div>
                )}
              </div>

              {(Object.keys(selected.score.byDomain).length > 0
                || Object.keys(selected.score.byStage).length > 0) ? (
                <div className="rounded-md border border-border bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold">{t('specialists.scoreHistory')}</div>
                    {confirmResetId === selected.id ? (
                      <div className="flex items-center gap-1 text-[10px]">
                        <span className="text-muted-foreground">{t('specialists.scoreReset.confirmLabel')}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setConfirmResetId(null)}
                          disabled={resetBusy}
                          className="h-6 px-2 text-[10px]"
                        >
                          {t('common.cancel')}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleScoreReset(selected.id)}
                          disabled={resetBusy}
                          className="h-6 bg-destructive px-2 text-[10px] text-destructive-foreground hover:bg-destructive/90"
                        >
                          {t('common.confirm')}
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirmResetId(selected.id)}
                        title={t('specialists.tooltip.scoreReset')}
                        className="h-6 px-2 text-[10px]"
                      >
                        {t('specialists.action.resetScore')}
                      </Button>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {selected.score.lastUpdated
                      ? tFormat('specialists.audit.lastUpdated', { at: selected.score.lastUpdated })
                      : t('specialists.audit.noUpdates')}
                  </div>
                  {Object.keys(selected.score.byDomain).length > 0 ? (
                    <div className="mt-2">
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('specialists.label.byDomain')}</div>
                      <ul className="mt-1 space-y-1">
                        {Object.entries(selected.score.byDomain).sort().map(([d, v]) => (
                          <li key={d} className="flex items-center justify-between text-[12px]">
                            <span className="font-mono">{d}</span>
                            <ScoreBar value={v} samples={selected.score.samples[`domain:${d}`] || 0} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {Object.keys(selected.score.byStage).length > 0 ? (
                    <div className="mt-3">
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('specialists.label.byStage')}</div>
                      <ul className="mt-1 space-y-1">
                        {Object.entries(selected.score.byStage).sort().map(([s, v]) => (
                          <li key={s} className="flex items-center justify-between text-[12px]">
                            <span className="font-mono">{s}</span>
                            <ScoreBar value={v} samples={selected.score.samples[`stage:${s}`] || 0} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">
                  {t('specialists.empty.scoreHistory')}
                </div>
              )}

              {/* (v1.10.558) Suggest + Apply prompt panel extracted
                  to ./SpecialistsPromptPanel.tsx. */}
              <SpecialistsPromptPanel
                specialistId={selected.id}
                systemPrompt={selected.systemPrompt}
              />

              {/* (Phase 6.8) Recent audit + recent meetings.
                  Both shown only when there's something to render. */}
              {enrichment && Array.isArray(enrichment.recentAudit) && enrichment.recentAudit.length > 0 ? (
                <div>
                  <div className="text-xs text-muted-foreground">{tFormat('specialists.label.recentAudit', { count: enrichment.recentAudit.length })}</div>
                  <ul className="mt-1 divide-y divide-border/40 rounded-md border border-border/40 bg-muted/10 text-[11px]">
                    {enrichment.recentAudit.slice().reverse().map((e, i) => (
                      <li key={i} className="flex flex-wrap items-baseline gap-2 px-2 py-1">
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {new Date(e.ts).toLocaleString()}
                        </span>
                        <span className="rounded border border-border bg-background px-1 py-0 text-[10px] uppercase tracking-wide">
                          {e.action}
                        </span>
                        {e.actor ? <span className="text-muted-foreground">{tFormat('specialists.event.byActor', { actor: e.actor })}</span> : null}
                        {e.reason ? <span className="text-muted-foreground italic">— {e.reason}</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {enrichment && Array.isArray(enrichment.recentMeetings) && enrichment.recentMeetings.length > 0 ? (
                <div>
                  <div className="text-xs text-muted-foreground">{tFormat('specialists.label.recentMeetings', { count: enrichment.recentMeetings.length })}</div>
                  <ul className="mt-1 divide-y divide-border/40 rounded-md border border-border/40 bg-muted/10 text-[11px]">
                    {enrichment.recentMeetings.map((m) => (
                      <li key={m.id} className="flex flex-wrap items-baseline gap-2 px-2 py-1">
                        <span className="font-mono text-[10px]">{m.id}</span>
                        <span className="rounded border border-border bg-background px-1 py-0 text-[10px] uppercase tracking-wide">
                          {m.status}
                        </span>
                        <span className="text-muted-foreground">{m.track}</span>
                        <span className="truncate text-muted-foreground">— {m.title}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
