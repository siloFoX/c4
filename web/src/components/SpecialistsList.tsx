import { AlertTriangle, Shield, Star } from 'lucide-react';
import { Badge } from './ui';
import { cn } from '../lib/cn';
import { t, useLocale } from '../lib/i18n';
import { TIER_BADGE, type Specialist } from './SpecialistsView';

// (v1.10.577) Extracted from SpecialistsView. The master-pane
// list rendering — handles error / empty / list states. Pure
// display: parent owns selection + flagged-ids data.

interface Props {
  filtered: Specialist[];
  error: string | null;
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  flaggedIds: Set<string>;
}

export default function SpecialistsList({
  filtered,
  error,
  loading,
  selectedId,
  onSelect,
  flaggedIds,
}: Props) {
  useLocale();

  if (error) {
    return <div className="p-4 text-sm text-destructive">{error}</div>;
  }
  if (filtered.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        {loading ? t('common.loadingDots') : t('specialists.empty.noMatch')}
      </div>
    );
  }
  return (
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
            onClick={() => onSelect(s.id)}
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
                {s.tags.slice(0, 4).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-1 py-0 text-[9px] text-cyan-700 dark:text-cyan-400"
                  >
                    #{tag}
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
  );
}
