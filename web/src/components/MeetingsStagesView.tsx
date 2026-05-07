import { useLocale } from '../lib/i18n';

// (v1.10.547) Extracted from MeetingsView. The transcript stages
// display — for each stage in the meeting detail, show a card
// with the stage name, consensus state, roster, and the turns
// that were taken within that stage. Pure display component;
// data comes from /meetings/:id (parent's detail fetch).

interface Turn {
  stage: string;
  round: number;
  specialistId: string;
  text: string;
  ts: string;
}

export interface StageView {
  stage: string;
  round: number;
  specialists: Array<{ id: string; displayName: string; vetoPower?: boolean }>;
  consensus: {
    mode: string;
    accepts: string[];
    objects: Array<{ id: string; reason: string | null }>;
    missing: string[];
    reached: boolean;
    round: number;
  };
}

interface Props {
  stages: StageView[];
  transcripts: Turn[][];
}

export default function MeetingsStagesView({ stages, transcripts }: Props) {
  useLocale();

  return (
    <div className="space-y-3">
      {stages.map((stage, idx) => {
        const turns = transcripts[idx] || [];
        return (
          <div key={`${stage.stage}-${idx}`} className="rounded-md border border-border bg-muted/20 p-3">
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="font-medium">[{stage.stage}]</span>
              <span className="text-muted-foreground">
                consensus={stage.consensus.mode} · {stage.consensus.reached ? 'reached' : 'pending'}
              </span>
              <span className="text-muted-foreground">
                accepts={stage.consensus.accepts.length} / objects={stage.consensus.objects.length} / missing={stage.consensus.missing.length}
              </span>
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              roster: {stage.specialists.map((s) => s.id).join(', ')}
            </div>
            {turns.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {turns.map((t, i) => (
                  <li key={i} className="text-[12px]">
                    <span className="font-mono text-muted-foreground">[r{t.round}]</span>{' '}
                    <span className="font-medium">{t.specialistId}:</span>{' '}
                    <span>{t.text}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-2 text-[11px] text-muted-foreground">(no turns yet)</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
