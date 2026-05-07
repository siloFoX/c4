import { useState } from 'react';
import { cn } from '../lib/cn';
import { t, useLocale } from '../lib/i18n';
import type { ActionItemType } from './MeetingsView';

// (v1.10.542) Extracted from MeetingsView. Action-items panel —
// renders 4 grouped lists (decision / action / todo / blocker)
// with filter chips and JSON / Markdown export. Owns its own
// filter state. Drops ~120 lines from MeetingsView.

interface ActionItem {
  type: ActionItemType;
  text: string;
  owner: string | null;
  stage: string;
  round: number;
  specialistId: string | null;
  ts: string | null;
}

export interface ActionItemsResponse {
  count: number;
  byType: Record<ActionItemType, number>;
  items: ActionItem[];
}

const TONE: Record<ActionItemType, string> = {
  decision: 'border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400',
  action: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  todo: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  blocker: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400',
};

interface Props {
  actions: ActionItemsResponse | null;
  meetingId: string;
}

export default function MeetingsActionItemsPanel({ actions, meetingId }: Props) {
  useLocale();
  const [filter, setFilter] = useState<ActionItemType | null>(null);

  if (!actions || actions.count === 0) return null;

  const handleDownloadJson = () => {
    const blob = new Blob([JSON.stringify(actions, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `action-items-${meetingId}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyMd = () => {
    const lines: string[] = [];
    (['decision', 'action', 'todo', 'blocker'] as ActionItemType[]).forEach((k) => {
      const group = actions.items.filter((it) => it.type === k);
      if (group.length === 0) return;
      lines.push(`## ${k.toUpperCase()} (${group.length})`);
      group.forEach((it) => {
        lines.push(`- ${it.text}`);
      });
      lines.push('');
    });
    const md = lines.join('\n').trim();
    navigator.clipboard.writeText(md).catch(() => { /* ignore */ });
  };

  return (
    <div className="rounded-md border border-border/60 bg-muted/10 p-3 text-[12px]">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="font-medium">{t('meetings.actionItems')}</span>
        {/* Category filter chips — null = all */}
        <button
          type="button"
          onClick={() => setFilter(null)}
          className={cn(
            'rounded border px-1.5 py-0 text-[10px] uppercase tracking-wide',
            filter === null
              ? 'border-primary bg-primary/30 text-foreground'
              : 'border-border bg-background text-muted-foreground hover:bg-accent/40',
          )}
        >
          all · {actions.count}
        </button>
        {(['decision', 'action', 'todo', 'blocker'] as ActionItemType[]).map((kind) => {
          if ((actions.byType[kind] || 0) === 0) return null;
          return (
            <button
              key={kind}
              type="button"
              onClick={() => setFilter(filter === kind ? null : kind)}
              className={cn(
                'rounded border px-1.5 py-0 text-[10px] uppercase tracking-wide',
                filter === kind ? TONE[kind] : 'border-border bg-background text-muted-foreground hover:bg-accent/40',
              )}
            >
              {kind} · {actions.byType[kind] || 0}
            </button>
          );
        })}
        {/* (v1.10.351) Export buttons — operators hand items off to a
            tracker. JSON for tools, Markdown for chat / docs. ml-auto
            pushes them to the right edge of the chip row. */}
        <button
          type="button"
          onClick={handleDownloadJson}
          className="ml-auto rounded border border-border bg-background px-1.5 py-0 text-[10px] text-muted-foreground hover:bg-accent/40"
          title={t('meetings.tooltip.downloadActions')}
        >
          ⬇ JSON
        </button>
        <button
          type="button"
          onClick={handleCopyMd}
          className="rounded border border-border bg-background px-1.5 py-0 text-[10px] text-muted-foreground hover:bg-accent/40"
          title={t('meetings.tooltip.copyActionsMd')}
        >
          ⧉ MD
        </button>
      </div>
      {(['decision', 'action', 'todo', 'blocker'] as ActionItemType[]).filter((k) => filter === null || filter === k).map((kind) => {
        const group = actions.items.filter((it) => it.type === kind);
        if (group.length === 0) return null;
        return (
          <div key={kind} className="mb-2 last:mb-0">
            <div className={cn('mb-1 inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] uppercase tracking-wide', TONE[kind])}>
              {kind} · {group.length}
            </div>
            <ul className="space-y-1 pl-3">
              {group.map((it, i) => (
                <li key={i} className="leading-snug">
                  <span>{it.text}</span>
                  {it.owner ? (
                    <span className="ml-2 inline-flex items-center rounded border border-border bg-background px-1 py-0 font-mono text-[10px] text-muted-foreground">
                      @{it.owner}
                    </span>
                  ) : null}
                  <span className="ml-2 text-[10px] text-muted-foreground">
                    {it.stage}/r{it.round}/{it.specialistId || '?'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
