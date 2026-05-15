import { useState } from 'react';
import { Search } from 'lucide-react';
import PageFrame from './PageFrame';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
} from '../components/ui';
import { cn } from '../lib/cn';
import {
  DECISION_LOG_ENTRIES,
  type DecisionEntry,
  type DecisionStatus,
} from './decision-log-entries';

// (v1.11.248, TODO 11.230) Architecture decision log surface.
// Renders the entries declared in ./decision-log-entries.ts as
// ADR-style cards, with a filter input and a status-keyed Badge
// per row so an operator scanning the page can spot deprecated
// decisions at a glance. The canonical human-readable mirror
// lives at /docs/decisions.md -- keep the two files in lockstep.

const STATUS_VARIANT: Record<DecisionStatus, 'success' | 'warning' | 'destructive' | 'neutral'> = {
  proposed: 'warning',
  accepted: 'success',
  superseded: 'neutral',
  deprecated: 'destructive',
};

const STATUS_LABEL: Record<DecisionStatus, string> = {
  proposed: 'Proposed',
  accepted: 'Accepted',
  superseded: 'Superseded',
  deprecated: 'Deprecated',
};

function matchesFilter(entry: DecisionEntry, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return (
    entry.id.toLowerCase().includes(needle) ||
    entry.title.toLowerCase().includes(needle) ||
    entry.status.toLowerCase().includes(needle) ||
    entry.context.toLowerCase().includes(needle) ||
    entry.decision.toLowerCase().includes(needle) ||
    entry.consequences.toLowerCase().includes(needle) ||
    (entry.version ?? '').toLowerCase().includes(needle)
  );
}

export default function DecisionLog() {
  const [filter, setFilter] = useState('');
  const trimmed = filter.trim();
  const visible = trimmed
    ? DECISION_LOG_ENTRIES.filter((e) => matchesFilter(e, trimmed))
    : DECISION_LOG_ENTRIES;

  return (
    <PageFrame
      title="Decision Log"
      description="ADR-style log of architectural decisions. Each entry records the forcing function, the chosen approach, and the downstream consequences so a future contributor can decide whether a similar pull deserves the same answer."
    >
      <div className="flex w-full max-w-md flex-col gap-1">
        <label
          htmlFor="decision-log-filter"
          className="text-xs uppercase tracking-wide text-muted-foreground"
        >
          Filter
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="decision-log-filter"
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="title, status, version, body..."
            aria-label="Filter decision log"
            className="h-8 pl-7 text-xs"
          />
        </div>
        <span className="text-[11px] text-muted-foreground" data-testid="decision-log-count">
          {visible.length} / {DECISION_LOG_ENTRIES.length}
        </span>
      </div>

      {visible.length === 0 ? (
        <div
          role="status"
          className="rounded-md border border-dashed border-border bg-muted/10 p-6 text-sm text-muted-foreground"
        >
          No decisions match "{trimmed}".
        </div>
      ) : (
        <ul className="flex flex-col gap-4" data-testid="decision-log-list">
          {visible.map((entry) => (
            <li key={entry.id} data-testid={`decision-${entry.id}`}>
              <Card>
                <CardHeader className="flex flex-col gap-2 p-4 md:flex-row md:items-start md:justify-between md:p-5">
                  <div className="min-w-0 flex flex-col gap-1">
                    <CardTitle className="text-sm">
                      <span
                        aria-label="ADR id"
                        className={cn('mr-2 font-mono text-xs text-muted-foreground')}
                      >
                        {entry.id}
                      </span>
                      {entry.title}
                    </CardTitle>
                    <CardDescription className="flex flex-wrap items-center gap-2 text-[11px]">
                      <Badge variant={STATUS_VARIANT[entry.status]}>
                        {STATUS_LABEL[entry.status]}
                      </Badge>
                      <span className="font-mono text-muted-foreground">{entry.date}</span>
                      {entry.version ? (
                        <span className="font-mono text-muted-foreground">{entry.version}</span>
                      ) : null}
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 p-4 pt-0 text-sm leading-relaxed md:p-5 md:pt-0">
                  <Section title="Context" body={entry.context} />
                  <Section title="Decision" body={entry.decision} />
                  <Section title="Consequences" body={entry.consequences} />
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </PageFrame>
  );
}

interface SectionProps {
  title: string;
  body: string;
}

function Section({ title, body }: SectionProps) {
  return (
    <div>
      <h3 className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <p className="whitespace-pre-wrap text-foreground">{body}</p>
    </div>
  );
}
