import { Search } from 'lucide-react';
import { Button, Input } from './ui';
import { cn } from '../lib/cn';
import { t, useLocale } from '../lib/i18n';
import { TYPE_OPTIONS } from './WikiView';

// (v1.10.609) Extracted from WikiView. The wiki-search controls
// — query Input (Enter triggers search) + type select +
// includeStale checkbox + Search button. Pure controlled
// inputs: parent owns query / type / includeStale state +
// search handler.

interface Props {
  query: string;
  onQuery: (next: string) => void;
  type: string;
  onType: (next: string) => void;
  includeStale: boolean;
  onIncludeStale: (next: boolean) => void;
  searching: boolean;
  onSearch: () => void;
}

export default function WikiSearchControls({
  query,
  onQuery,
  type,
  onType,
  includeStale,
  onIncludeStale,
  searching,
  onSearch,
}: Props) {
  useLocale();
  return (
    <>
      <Input
        type="text"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onSearch();
          }
        }}
        placeholder={t('wiki.search.placeholder')}
        aria-label={t('wiki.search.label')}
        disabled={searching}
      />
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <label className="text-muted-foreground">
          {t('wiki.type.prefix')}
          <select
            className="ml-1 rounded border border-border bg-background px-1 py-0.5 text-[11px]"
            value={type}
            onChange={(e) => onType(e.target.value)}
            disabled={searching}
            aria-label={t('wiki.type.label')}
          >
            {TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
            ))}
          </select>
        </label>
        <label className="inline-flex items-center gap-1">
          <input
            type="checkbox"
            checked={includeStale}
            onChange={(e) => onIncludeStale(e.target.checked)}
            disabled={searching}
            aria-label={t('wiki.includeStale.label')}
          />
          <span>{t('wiki.includeStale')}</span>
        </label>
        <Button
          size="sm"
          onClick={onSearch}
          disabled={searching}
          aria-label={t('wiki.search.run')}
        >
          <Search className={cn('h-3.5 w-3.5', searching && 'animate-spin')} aria-hidden />
          {t('wiki.search.button')}
        </Button>
      </div>
    </>
  );
}
