import { tFormat, useLocale } from '../lib/i18n';
import type { AuditEntry, MeetingMeta } from './SpecialistsView';

// (v1.10.599) Extracted from SpecialistsView. Phase 6.8 detail
// enrichment — recent audit log + recent meetings list. Both
// shown only when there's something to render. Pure display.

interface Props {
  recentAudit?: AuditEntry[] | undefined;
  recentMeetings?: MeetingMeta[] | undefined;
}

export default function SpecialistsEnrichmentPanels({
  recentAudit,
  recentMeetings,
}: Props) {
  useLocale();
  return (
    <>
      {Array.isArray(recentAudit) && recentAudit.length > 0 ? (
        <div>
          <div className="text-xs text-muted-foreground">{tFormat('specialists.label.recentAudit', { count: recentAudit.length })}</div>
          <ul className="mt-1 divide-y divide-border/40 rounded-md border border-border/40 bg-muted/10 text-[11px]">
            {recentAudit.slice().reverse().map((e, i) => (
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

      {Array.isArray(recentMeetings) && recentMeetings.length > 0 ? (
        <div>
          <div className="text-xs text-muted-foreground">{tFormat('specialists.label.recentMeetings', { count: recentMeetings.length })}</div>
          <ul className="mt-1 divide-y divide-border/40 rounded-md border border-border/40 bg-muted/10 text-[11px]">
            {recentMeetings.map((m) => (
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
  );
}
