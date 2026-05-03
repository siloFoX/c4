import { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, Plus, RefreshCw, Shield, Star, Trash2 } from 'lucide-react';
import { apiDelete, apiGet, apiPost } from '../lib/api';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input } from './ui';
import { cn } from '../lib/cn';

// (multi-specialist phase 7.5) Specialists tab — registry view +
// score visualization. Mirrors MeetingsView / WikiView's split
// layout. Add / remove governance lands on top in a follow-up;
// this slice is read-only so an operator can see who's on the
// roster and how they've scored across past retros.

interface Specialist {
  id: string;
  displayName: string;
  tier: string;
  domain: string[];
  brain: { adapter: string; model: string | null; effort: string | null };
  systemPrompt: string;
  triggers: { keywords: string[]; stages: string[] };
  deliverables: string[];
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
      setError((e as Error).message || 'Failed to load specialists');
    } finally {
      setLoading(false);
    }
  }, []);

  // Add governance — accepts a JSON blob and POSTs to /specialists.
  const [addOpen, setAddOpen] = useState(false);
  const [addJson, setAddJson] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const handleAdd = useCallback(async () => {
    let parsed: unknown;
    try { parsed = JSON.parse(addJson); }
    catch (e) { setAddError(`invalid JSON: ${(e as Error).message}`); return; }
    setAddBusy(true);
    setAddError(null);
    try {
      const res = await apiPost<{ ok: boolean; specialist: Specialist }>('/api/specialists', parsed);
      if (res && res.specialist) {
        setSelectedId(res.specialist.id);
        setAddOpen(false);
        setAddJson('');
      }
      await refresh();
    } catch (e) {
      setAddError((e as Error).message || 'Failed to add specialist');
    } finally {
      setAddBusy(false);
    }
  }, [addJson, refresh]);

  // Remove governance — guarded by a 2-step confirm prompt.
  const [removeBusy, setRemoveBusy] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  const handleRemove = useCallback(async (id: string) => {
    setRemoveBusy(true);
    try {
      await apiDelete(`/api/specialists/${encodeURIComponent(id)}`);
      if (selectedId === id) setSelectedId(null);
      await refresh();
    } catch (e) {
      setError((e as Error).message || 'Failed to remove specialist');
    } finally {
      setRemoveBusy(false);
      setConfirmRemoveId(null);
    }
  }, [selectedId, refresh]);

  useEffect(() => { refresh(); }, [refresh]);

  const specialists = data?.specialists || [];
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return specialists.filter((s) => {
      if (vetoOnly && !s.vetoPower) return false;
      if (tierFilter !== 'any' && s.tier !== tierFilter) return false;
      if (!q) return true;
      return s.id.includes(q)
        || s.displayName.toLowerCase().includes(q)
        || s.domain.some((d) => d.toLowerCase().includes(q))
        || s.triggers.keywords.some((k) => k.toLowerCase().includes(q));
    });
  }, [specialists, filter, tierFilter, vetoOnly]);

  const selected = useMemo(
    () => specialists.find((s) => s.id === selectedId) || null,
    [specialists, selectedId],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 md:flex-row md:p-6">
      <Card className="flex min-h-0 flex-1 flex-col md:max-w-md">
        <CardHeader className="flex flex-col gap-2 border-b border-border p-4">
          <div className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">Specialists</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => { setAddOpen((v) => !v); setAddError(null); }}
                aria-label="Add specialist"
                aria-expanded={addOpen}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Add
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={refresh}
                disabled={loading}
                aria-label="Refresh specialists"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} aria-hidden />
                Refresh
              </Button>
            </div>
          </div>
          {addOpen ? (
            <div className="flex flex-col gap-2 rounded-md border border-dashed border-border bg-muted/20 p-3">
              <textarea
                value={addJson}
                onChange={(e) => setAddJson(e.target.value)}
                placeholder='{"id":"data-engineer","displayName":"Data Engineer","tier":"implement","domain":["data","etl"],"brain":{"adapter":"claude-code","model":"sonnet"},"systemPrompt":"[Role: Data Engineer] ...","triggers":{"keywords":["etl"],"stages":["design","implement"]}}'
                className="min-h-32 rounded-md border border-border bg-background p-2 font-mono text-[11px]"
                aria-label="Specialist JSON"
                disabled={addBusy}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  onClick={handleAdd}
                  disabled={addBusy || !addJson.trim()}
                  aria-label="Confirm add"
                >
                  Add specialist
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setAddOpen(false); setAddError(null); }}
                  disabled={addBusy}
                >
                  Cancel
                </Button>
                {addError ? (
                  <span className="text-[11px] text-destructive">{addError}</span>
                ) : null}
              </div>
            </div>
          ) : null}
          <Input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by id / domain / keyword"
            aria-label="Filter specialists"
          />
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <label className="text-muted-foreground">
              tier:
              <select
                className="ml-1 rounded border border-border bg-background px-1 py-0.5 text-[11px]"
                value={tierFilter}
                onChange={(e) => setTierFilter(e.target.value)}
                aria-label="Tier filter"
              >
                <option value="any">any</option>
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
                aria-label="Veto-only"
              />
              <span>veto only</span>
            </label>
            <span className="text-muted-foreground">{filtered.length}/{specialists.length}</span>
          </div>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col overflow-y-auto p-0">
          {error ? (
            <div className="p-4 text-sm text-destructive">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">
              {loading ? 'Loading...' : 'No specialists match the filter.'}
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
                      active ? 'bg-primary/10' : 'hover:bg-accent/40',
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
                        <Badge variant="outline" className="text-[10px]">probation</Badge>
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
                    </div>
                    <span className="truncate text-sm font-medium">{s.id}</span>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {s.domain.join(', ')}
                    </span>
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
              {selected ? `${selected.id} — ${selected.displayName}` : 'Select a specialist'}
            </CardTitle>
            {selected ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirmRemoveId(selected.id)}
                disabled={removeBusy}
                className="text-destructive hover:bg-destructive/10"
                aria-label={`Remove ${selected.id}`}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                Remove
              </Button>
            ) : null}
          </div>
          {confirmRemoveId && selected && confirmRemoveId === selected.id ? (
            <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-[11px]">
              <span>
                Remove <span className="font-mono">{selected.id}</span>? Score
                history is dropped from the persisted overlay; the seed
                entry stays.
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirmRemoveId(null)}
                disabled={removeBusy}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => handleRemove(selected.id)}
                disabled={removeBusy}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Confirm remove
              </Button>
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          {!selected ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              <Eye className="mr-2 h-3.5 w-3.5" aria-hidden />
              Pick a specialist to see brain config + score history.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                <div>
                  <div className="text-muted-foreground">tier</div>
                  <div className="font-medium">{selected.tier}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">brain</div>
                  <div className="font-medium">{selected.brain.adapter}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">model</div>
                  <div className="font-medium">{selected.brain.model || '-'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">effort</div>
                  <div className="font-medium">{selected.brain.effort || '-'}</div>
                </div>
              </div>

              <div className="text-xs">
                <div className="text-muted-foreground">domains</div>
                <div className="font-medium">{selected.domain.join(', ')}</div>
              </div>
              <div className="text-xs">
                <div className="text-muted-foreground">triggers — stages</div>
                <div className="font-medium">{selected.triggers.stages.join(', ')}</div>
              </div>
              <div className="text-xs">
                <div className="text-muted-foreground">triggers — keywords</div>
                <div className="font-medium">{selected.triggers.keywords.join(', ')}</div>
              </div>
              {selected.deliverables.length > 0 ? (
                <div className="text-xs">
                  <div className="text-muted-foreground">deliverables</div>
                  <ul className="mt-1 list-disc pl-5 font-medium">
                    {selected.deliverables.map((d) => (<li key={d}>{d}</li>))}
                  </ul>
                </div>
              ) : null}

              {(Object.keys(selected.score.byDomain).length > 0
                || Object.keys(selected.score.byStage).length > 0) ? (
                <div className="rounded-md border border-border bg-muted/20 p-3">
                  <div className="text-xs font-semibold">Score history</div>
                  <div className="text-[11px] text-muted-foreground">
                    {selected.score.lastUpdated
                      ? `last updated ${selected.score.lastUpdated}`
                      : 'no updates yet'}
                  </div>
                  {Object.keys(selected.score.byDomain).length > 0 ? (
                    <div className="mt-2">
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">by domain</div>
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
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">by stage</div>
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
                  No score history yet — run + finalize a meeting that selects this specialist.
                </div>
              )}

              <div>
                <div className="text-xs text-muted-foreground">system prompt</div>
                <pre className="mt-1 whitespace-pre-wrap rounded-md border border-border bg-muted/20 p-3 text-[12px] font-mono">
                  {selected.systemPrompt}
                </pre>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
