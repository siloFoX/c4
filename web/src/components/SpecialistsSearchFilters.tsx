import { Search, X } from 'lucide-react';
import { Input } from './ui';
import { t, useLocale } from '../lib/i18n';
import { TIER_BADGE } from './SpecialistsView';

// (v1.10.581) Extracted from SpecialistsView. The master-pane
// search input + tier/vetoOnly filter row + count display.
// Pure controlled inputs: parent owns all state.

interface Props {
  filter: string;
  onFilter: (next: string) => void;
  tierFilter: string;
  onTierFilter: (next: string) => void;
  vetoOnly: boolean;
  onVetoOnly: (next: boolean) => void;
  filteredCount: number;
  totalCount: number;
}

export default function SpecialistsSearchFilters({
  filter,
  onFilter,
  tierFilter,
  onTierFilter,
  vetoOnly,
  onVetoOnly,
  filteredCount,
  totalCount,
}: Props) {
  useLocale();
  return (
    <>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="text"
          value={filter}
          onChange={(e) => onFilter(e.target.value)}
          placeholder={t('specialists.search.placeholder')}
          aria-label={t('specialists.search.label')}
          className="pl-7 pr-7"
        />
        {filter ? (
          <button
            type="button"
            onClick={() => onFilter('')}
            aria-label={t('specialists.action.clearFilter')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <label className="text-muted-foreground">
          {t('specialists.label.tier')}
          <select
            className="ml-1 rounded border border-border bg-background px-1 py-0.5 text-[11px]"
            value={tierFilter}
            onChange={(e) => onTierFilter(e.target.value)}
            aria-label={t('specialists.action.tierFilter')}
          >
            <option value="any">{t('specialists.option.any')}</option>
            {Object.keys(TIER_BADGE).map((tier) => (
              <option key={tier} value={tier}>{tier}</option>
            ))}
          </select>
        </label>
        <label className="inline-flex items-center gap-1">
          <input
            type="checkbox"
            checked={vetoOnly}
            onChange={(e) => onVetoOnly(e.target.checked)}
            aria-label={t('specialists.action.vetoOnly')}
          />
          <span>{t('specialists.label.vetoOnly')}</span>
        </label>
        <span className="text-muted-foreground">{filteredCount}/{totalCount}</span>
      </div>
    </>
  );
}
