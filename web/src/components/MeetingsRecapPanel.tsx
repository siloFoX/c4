import { useState } from 'react';
import { t, tFormat, useLocale } from '../lib/i18n';
import type { ActionItemType } from './MeetingsView';

// (v1.10.541) Extracted from MeetingsView. The compact recap
// envelope — collapsible "first turn per stage" view + escalation
// list. Default-collapsed because the full transcript is one
// click away in the panel above.
//
// Drops ~45 lines of JSX from MeetingsView. Pure display
// component — parent fetches the recap, this just renders.

interface RecapStage {
  stage: string;
  round: number;
  consensus: {
    reached: boolean;
    accepts: string[];
    objects: Array<{ id: string; reason: string | null }>;
    missing: string[];
  } | null;
  turnCount: number;
  firstTurn: { specialistId: string | null; round: number; text: string; ts: string | null } | null;
}

export interface RecapResponse {
  id: string;
  status: string;
  stages: RecapStage[];
  actions: { count: number; byType: Record<ActionItemType, number> };
  escalations: Array<{ ts: string; reason: string; terminal?: boolean }>;
}

interface Props {
  recap: RecapResponse | null;
}

export default function MeetingsRecapPanel({ recap }: Props) {
  useLocale();
  const [open, setOpen] = useState(false);

  if (!recap || !recap.stages.some((s) => s.firstTurn)) return null;

  return (
    <div className="rounded-md border border-border/60 bg-muted/10">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1 px-3 py-1.5 text-[11px] text-muted-foreground hover:text-foreground"
        aria-expanded={open}
      >
        <span>{open ? '▾' : '▸'}</span>
        <span className="font-medium">{t('meetings.recap')}</span>
        <span>· first turn per stage</span>
      </button>
      {open ? (
        <div className="border-t border-border/40 p-3 text-[11px]">
          <ul className="space-y-2">
            {recap.stages.map((s, idx) => s.firstTurn ? (
              <li key={`${s.stage}-${idx}`}>
                <div className="font-mono text-muted-foreground">
                  [{s.stage}]{' '}
                  <span className="font-medium text-foreground">{s.firstTurn.specialistId || '?'}</span>
                  {' '}r{s.firstTurn.round} · {s.turnCount} turn{s.turnCount === 1 ? '' : 's'}
                </div>
                <div className="mt-0.5 line-clamp-3">{s.firstTurn.text}</div>
              </li>
            ) : null)}
          </ul>
          {recap.escalations.length > 0 ? (
            <div className="mt-3">
              <div className="font-medium text-amber-700 dark:text-amber-400">
                {tFormat('meetings.escalations.format', { n: String(recap.escalations.length) })}
              </div>
              <ul className="mt-1 space-y-0.5">
                {recap.escalations.map((e, i) => (
                  <li key={i} className="text-muted-foreground">
                    {e.ts ? <span className="font-mono">{new Date(e.ts).toLocaleString()}</span> : null}
                    {' '}— {e.reason}{e.terminal ? ' (terminal)' : ''}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
