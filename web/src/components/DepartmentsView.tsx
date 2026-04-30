// Departments view (10.6). /api/departments → cards with member list,
// project allocation, machines, and quota progress bar.

import { useCallback, useEffect, useState } from 'react';
import { Users, Server, Briefcase, Gauge, DollarSign } from 'lucide-react';
import { cn } from '../lib/cn';

interface Dept {
  name: string;
  description?: string;
  members?: string[];
  machines?: string[];
  projects?: string[];
  tier?: string | null;
  workerQuota?: number;
  activeWorkers: number;
  quotaRemaining: number | null;
  overQuota: boolean;
  monthlyBudgetUSD?: number;
  attributedCostUSD?: number;
  budgetRemainingUSD?: number | null;
  overBudget?: boolean;
}

interface Resp { departments?: Dept[]; error?: string }

export default function DepartmentsView() {
  const [depts, setDepts] = useState<Dept[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/departments');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as Resp;
      if (data.error) setError(data.error);
      else { setDepts(data.departments || []); setError(null); }
    } catch (e) { setError((e as Error).message); }
  }, []);

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, 5000);
    return () => clearInterval(t);
  }, [fetchData]);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center gap-2">
        <Users size={16} className="text-primary" />
        <h2 className="text-base font-semibold sm:text-lg">Departments</h2>
        <span className="ml-auto text-[11px] text-muted">{depts.length} dept(s)</span>
      </div>

      {error && (
        <div className="mb-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
      )}

      <div className="grid flex-1 grid-cols-1 gap-3 overflow-auto pb-2 md:grid-cols-2 xl:grid-cols-3">
        {depts.map((d) => <DeptCard key={d.name} dept={d} />)}
        {depts.length === 0 && !error && (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted md:col-span-2 xl:col-span-3">
            No departments configured — add to <code className="rounded bg-surface-2 px-1.5 py-0.5">config.departments</code>.
          </div>
        )}
      </div>
    </div>
  );
}

function DeptCard({ dept }: { dept: Dept }) {
  const quota = dept.workerQuota || 0;
  const ratio = quota > 0 ? Math.min(1, dept.activeWorkers / quota) : 0;
  const budget = dept.monthlyBudgetUSD || 0;
  const cost = dept.attributedCostUSD || 0;
  const budgetRatio = budget > 0 ? Math.min(1, cost / budget) : 0;
  const flagged = dept.overQuota || dept.overBudget;
  return (
    <div className={cn(
      'flex flex-col gap-2 rounded-lg border bg-surface-2 p-3 shadow-soft',
      flagged ? 'border-warning/50' : 'border-border',
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-mono text-sm font-semibold">{dept.name}</span>
            {dept.tier && (
              <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                {dept.tier}
              </span>
            )}
          </div>
          {dept.description && (
            <div className="mt-0.5 line-clamp-2 text-[11px] text-muted">{dept.description}</div>
          )}
        </div>
        <span className={cn(
          'rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
          flagged ? 'bg-warning/20 text-warning' : 'bg-success/15 text-success',
        )}>
          {dept.activeWorkers}{quota ? ` / ${quota}` : ''}
        </span>
      </div>

      {quota > 0 && (
        <div>
          <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted">
            <Gauge size={10} /> worker quota
          </div>
          <div className="h-2 w-full overflow-hidden rounded bg-surface-3">
            <div
              className={cn('h-full transition-all', dept.overQuota ? 'bg-warning' : 'bg-primary')}
              style={{ width: `${Math.round(ratio * 100)}%` }}
            />
          </div>
          <div className="mt-1 text-right text-[10px] text-muted">
            {dept.quotaRemaining ?? '—'} remaining
          </div>
        </div>
      )}

      {budget > 0 && (
        <div>
          <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted">
            <DollarSign size={10} /> monthly budget
          </div>
          <div className="h-2 w-full overflow-hidden rounded bg-surface-3">
            <div
              className={cn('h-full transition-all', dept.overBudget ? 'bg-danger' : 'bg-success')}
              style={{ width: `${Math.round(budgetRatio * 100)}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-muted">
            <span>${cost.toFixed(2)} / ${budget.toFixed(2)}</span>
            <span>{dept.budgetRemainingUSD != null ? `$${dept.budgetRemainingUSD.toFixed(2)} left` : '—'}</span>
          </div>
        </div>
      )}

      <Section icon={Users} label="Members">
        {(dept.members || []).slice(0, 8).map((m) => (
          <Pill key={m}>{m}</Pill>
        ))}
        {(dept.members || []).length === 0 && <Empty />}
      </Section>

      <Section icon={Briefcase} label="Projects">
        {(dept.projects || []).map((p) => <Pill key={p}>{p}</Pill>)}
        {(dept.projects || []).length === 0 && <Empty />}
      </Section>

      <Section icon={Server} label="Machines">
        {(dept.machines || []).map((m) => <Pill key={m}>{m}</Pill>)}
        {(dept.machines || []).length === 0 && <Empty />}
      </Section>
    </div>
  );
}

function Section({
  icon: Icon, label, children,
}: { icon: typeof Users; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted">
        <Icon size={11} />
        {label}
      </div>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-border bg-surface px-2 py-0.5 font-mono text-[11px] text-foreground/80">
      {children}
    </span>
  );
}

function Empty() {
  return <span className="text-[11px] italic text-muted/70">none</span>;
}
