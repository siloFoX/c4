// Cost report view (10.5). Pulls /api/cost-report and renders a daily
// chart + monthly summary + budget alert.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DollarSign, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/cn';

interface DailyRow { day: string; input: number; output: number }
interface CostResp {
  range?: { since: string | null; until: string | null };
  model?: string | null;
  pricing?: { inputPer1M?: number; outputPer1M?: number } | null;
  daily?: DailyRow[];
  totals?: { input: number; output: number; costUSD: number | null };
  monthly?: { month?: string; input: number; output: number; costUSD: number | null } | null;
  budget?: { monthlyUSD: number; overBudget: boolean };
  note?: string;
  error?: string;
}

function fmtTokens(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}

function fmtUSD(n: number | null | undefined) {
  if (n == null) return '—';
  return '$' + n.toFixed(2);
}

export default function CostReportView() {
  const [data, setData] = useState<CostResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<string>('');

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (model) params.set('model', model);
      const res = await fetch('/api/cost-report' + (params.toString() ? `?${params}` : ''));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as CostResp;
      if (json.error) setError(json.error);
      else { setData(json); setError(null); }
    } catch (e) { setError((e as Error).message); }
  }, [model]);

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, 30000);
    return () => clearInterval(t);
  }, [fetchData]);

  const max = useMemo(() => {
    if (!data?.daily) return 0;
    let m = 0;
    for (const r of data.daily) m = Math.max(m, r.input + r.output);
    return m || 1;
  }, [data]);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <DollarSign size={16} className="text-primary" />
        <h2 className="text-base font-semibold sm:text-lg">Cost report</h2>
        <input
          type="text"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="model override (e.g. claude-opus-4-7)"
          className="ml-auto min-w-[180px] rounded border border-border bg-surface-2 px-2 py-1 text-xs"
        />
      </div>

      {error && (
        <div className="mb-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
      )}

      {data && (
        <div className="space-y-3 overflow-auto pb-2">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Input tokens" value={fmtTokens(data.totals?.input || 0)} />
            <Stat label="Output tokens" value={fmtTokens(data.totals?.output || 0)} />
            <Stat label={`Cost (${data.model || '—'})`} value={fmtUSD(data.totals?.costUSD ?? null)} accent />
            <Stat
              label={`Month (${data.monthly?.month || '—'})`}
              value={fmtUSD(data.monthly?.costUSD ?? null)}
              warn={!!data.budget?.overBudget}
            />
          </div>

          {data.budget?.overBudget && (
            <div className="flex items-center gap-2 rounded-lg border border-warning/50 bg-warning/10 px-3 py-2 text-xs text-warning">
              <AlertTriangle size={14} />
              Monthly cost exceeds the budget of {fmtUSD(data.budget.monthlyUSD)}.
            </div>
          )}

          {data.pricing && (
            <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-[11px] text-muted">
              Rates ({data.model}): input ${data.pricing.inputPer1M}/M · output ${data.pricing.outputPer1M}/M
            </div>
          )}

          <div className="rounded-lg border border-border bg-surface-2 p-3">
            <div className="mb-2 text-[10px] uppercase tracking-wider text-muted">Daily usage</div>
            <div className="space-y-1.5">
              {(data.daily || []).map((r) => (
                <div key={r.day} className="flex items-center gap-2">
                  <span className="w-24 shrink-0 font-mono text-[11px] text-muted">{r.day}</span>
                  <div className="flex h-3 flex-1 overflow-hidden rounded bg-surface-3">
                    <div
                      className="bg-primary"
                      style={{ width: `${(r.input / max) * 100}%` }}
                      title={`input ${r.input.toLocaleString()}`}
                    />
                    <div
                      className="bg-success"
                      style={{ width: `${(r.output / max) * 100}%` }}
                      title={`output ${r.output.toLocaleString()}`}
                    />
                  </div>
                  <span className="w-20 shrink-0 text-right font-mono text-[11px] text-muted">{fmtTokens(r.input + r.output)}</span>
                </div>
              ))}
              {(!data.daily || data.daily.length === 0) && (
                <div className="text-[11px] text-muted">No usage recorded.</div>
              )}
            </div>
          </div>

          {data.note && (
            <div className="text-[11px] italic text-muted/80">{data.note}</div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent, warn }: { label: string; value: string; accent?: boolean; warn?: boolean }) {
  return (
    <div className={cn(
      'rounded-lg border bg-surface-2 px-3 py-2',
      warn ? 'border-warning/50' : 'border-border',
    )}>
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className={cn(
        'mt-0.5 font-mono text-base font-semibold',
        accent && 'text-primary',
        warn && 'text-warning',
      )}>{value}</div>
    </div>
  );
}
