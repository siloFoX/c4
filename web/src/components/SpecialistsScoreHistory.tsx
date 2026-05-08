import { Button } from './ui';
import { cn } from '../lib/cn';
import { t, tFormat, useLocale } from '../lib/i18n';
import type { Specialist } from './SpecialistsView';

// (v1.10.598) Extracted from SpecialistsView. The score-history
// block (rolled-up byDomain/byStage scoring with reset). Pure
// display: parent owns confirm/reset state + reset handler.

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

interface Props {
  specialist: Specialist;
  confirmResetId: string | null;
  resetBusy: boolean;
  onConfirmReset: (id: string | null) => void;
  onScoreReset: (id: string) => void;
}

export default function SpecialistsScoreHistory({
  specialist,
  confirmResetId,
  resetBusy,
  onConfirmReset,
  onScoreReset,
}: Props) {
  useLocale();
  const hasHistory = Object.keys(specialist.score.byDomain).length > 0
    || Object.keys(specialist.score.byStage).length > 0;
  if (!hasHistory) {
    return (
      <div className="text-xs text-muted-foreground">
        {t('specialists.empty.scoreHistory')}
      </div>
    );
  }
  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold">{t('specialists.scoreHistory')}</div>
        {confirmResetId === specialist.id ? (
          <div className="flex items-center gap-1 text-[10px]">
            <span className="text-muted-foreground">{t('specialists.scoreReset.confirmLabel')}</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onConfirmReset(null)}
              disabled={resetBusy}
              className="h-6 px-2 text-[10px]"
            >
              {t('common.cancel')}
            </Button>
            <Button
              size="sm"
              onClick={() => onScoreReset(specialist.id)}
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
            onClick={() => onConfirmReset(specialist.id)}
            title={t('specialists.tooltip.scoreReset')}
            className="h-6 px-2 text-[10px]"
          >
            {t('specialists.action.resetScore')}
          </Button>
        )}
      </div>
      <div className="text-[11px] text-muted-foreground">
        {specialist.score.lastUpdated
          ? tFormat('specialists.audit.lastUpdated', { at: specialist.score.lastUpdated })
          : t('specialists.audit.noUpdates')}
      </div>
      {Object.keys(specialist.score.byDomain).length > 0 ? (
        <div className="mt-2">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('specialists.label.byDomain')}</div>
          <ul className="mt-1 space-y-1">
            {Object.entries(specialist.score.byDomain).sort().map(([d, v]) => (
              <li key={d} className="flex items-center justify-between text-[12px]">
                <span className="font-mono">{d}</span>
                <ScoreBar value={v} samples={specialist.score.samples[`domain:${d}`] || 0} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {Object.keys(specialist.score.byStage).length > 0 ? (
        <div className="mt-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('specialists.label.byStage')}</div>
          <ul className="mt-1 space-y-1">
            {Object.entries(specialist.score.byStage).sort().map(([s, v]) => (
              <li key={s} className="flex items-center justify-between text-[12px]">
                <span className="font-mono">{s}</span>
                <ScoreBar value={v} samples={specialist.score.samples[`stage:${s}`] || 0} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
