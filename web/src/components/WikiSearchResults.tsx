import { FileSearch } from 'lucide-react';
import { Badge, EmptyState, Skeleton } from './ui';
import { cn } from '../lib/cn';
import { t, tFormat, useLocale } from '../lib/i18n';
import type { SearchResponse } from './WikiView';

// (v1.10.580) Extracted from WikiView. The /wiki/search hits list
// (left pane card body). Three render states: error, loading,
// empty, and the hit list itself. Pure display: parent owns
// selectedPath + setter.

interface Props {
  search: SearchResponse | null;
  searchError: string | null;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

export default function WikiSearchResults({
  search,
  searchError,
  selectedPath,
  onSelect,
}: Props) {
  useLocale();

  if (searchError) {
    return <div className="p-4 text-sm text-destructive">{searchError}</div>;
  }
  if (!search) {
    return (
      <div
        className="flex flex-col gap-2 p-4"
        aria-label={t('wiki.loading')}
        data-wiki-loading="1"
      >
        <Skeleton variant="row" />
        <Skeleton variant="row" />
        <Skeleton variant="row" />
      </div>
    );
  }
  if (search.hits.length === 0) {
    return (
      <EmptyState
        icon={<FileSearch className="h-6 w-6" />}
        title={tFormat('wiki.empty.format', { root: search.wikiRoot })}
        className="m-4"
      />
    );
  }
  return (
    <ul className="divide-y divide-border">
      {search.hits.map((h) => {
        const active = h.path === selectedPath;
        return (
          <li
            key={h.path}
            className={cn(
              'flex cursor-pointer flex-col gap-1 px-4 py-3 transition-colors',
              active ? 'bg-primary/30' : 'hover:bg-accent/40',
            )}
            onClick={() => onSelect(h.path)}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-[10px] uppercase">{h.type}</Badge>
              {h.status ? (
                <span className="text-[10px] text-muted-foreground">[{h.status}]</span>
              ) : null}
              <span className="text-[10px] text-muted-foreground">{tFormat('wiki.scorePrefix', { score: h.score })}</span>
            </div>
            <span className="truncate text-sm font-medium">{h.title}</span>
            {h.snippet ? (
              <span className="line-clamp-2 text-[11px] text-muted-foreground">{h.snippet}</span>
            ) : null}
            <span className="truncate text-[10px] text-muted-foreground">{h.path}</span>
          </li>
        );
      })}
    </ul>
  );
}
