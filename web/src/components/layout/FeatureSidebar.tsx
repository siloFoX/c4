import { useState } from 'react';
import { Search } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Input } from '../ui';
import { t, tFormat, useLocale } from '../../lib/i18n';
import { useFilteredFeatures } from '../../lib/use-filtered-features';
import {
  CATEGORY_ICON,
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  type FeatureDef,
} from '../../pages/registry';

interface FeatureSidebarProps {
  open: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function FeatureSidebar({
  open,
  selectedId,
  onSelect,
}: FeatureSidebarProps) {
  // Hooks must run unconditionally — keep them above the early
  // return so the rules-of-hooks invariant holds when the parent
  // toggles `open`.
  useLocale();
  const [filter, setFilter] = useState('');
  // (v1.10.735) Grouping memo + match-count reducer moved to hook.
  const { grouped, matchCount } = useFilteredFeatures(filter);

  if (!open) return null;

  return (
    <aside className="w-full shrink-0 overflow-y-auto border-b border-border bg-background p-4 md:w-72 md:border-b-0 md:border-r">
      <div className="mb-3 flex items-center gap-2">
        <img src="/logo.svg" alt="C4" className="h-8 shrink-0" />
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          {t('featureSidebar.heading')}
        </span>
      </div>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t('featureSidebar.filter.placeholder')}
          aria-label={t('featureSidebar.filter.label')}
          className="h-7 pl-7 text-[11px]"
        />
      </div>
      {filter.trim() && matchCount === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-muted/10 p-3 text-[11px] text-muted-foreground">
          {tFormat('featureSidebar.noMatch', { query: filter })}
        </div>
      ) : null}
      <nav aria-label={t('featureSidebar.nav.label')} className="flex flex-col gap-4">
        {CATEGORY_ORDER.map((cat) => {
          const items = grouped[cat];
          if (!items || items.length === 0) return null;
          const CatIcon = CATEGORY_ICON[cat];
          return (
            <div key={cat}>
              <div className="mb-1 flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                <CatIcon className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{t(`feature.category.${cat}`) || CATEGORY_LABEL[cat]}</span>
              </div>
              <ul className="flex flex-col gap-1">
                {items.map((f: FeatureDef) => {
                  const active = f.id === selectedId;
                  const Icon = f.Icon;
                  return (
                    <li key={f.id}>
                      <button
                        type="button"
                        aria-current={active ? 'page' : undefined}
                        onClick={() => onSelect(f.id)}
                        className={cn(
                          'flex min-h-[44px] w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors sm:min-h-0',
                          active
                            ? 'bg-primary/30 text-foreground'
                            : 'text-foreground hover:bg-accent hover:text-accent-foreground',
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="truncate">{t(f.labelKey)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
