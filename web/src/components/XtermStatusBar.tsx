import { Search as SearchIcon, X as XIcon } from 'lucide-react';
import { t, useLocale } from '../lib/i18n';

// (v1.10.589) Extracted from XtermView. The status bar (status
// label + Search toggle button) and the conditionally-rendered
// search input panel beneath it. Pure controlled inputs:
// parent owns search state + result navigation.

export type SearchDirection = 'next' | 'prev';

interface Props {
  statusLabel: string;
  searchOpen: boolean;
  onToggleSearch: () => void;
  searchQuery: string;
  onSearchQuery: (next: string) => void;
  onRunSearch: (direction: SearchDirection) => void;
  onCloseSearch: () => void;
}

export default function XtermStatusBar({
  statusLabel,
  searchOpen,
  onToggleSearch,
  searchQuery,
  onSearchQuery,
  onRunSearch,
  onCloseSearch,
}: Props) {
  useLocale();
  return (
    <>
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        <span>{statusLabel}</span>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          aria-label={t('xterm.search.label')}
          onClick={onToggleSearch}
        >
          <SearchIcon className="h-3 w-3" aria-hidden="true" />
          <span>{t('xterm.search.button')}</span>
        </button>
      </div>

      {searchOpen && (
        <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-2">
          <input
            type="text"
            value={searchQuery}
            autoFocus
            placeholder={t('xterm.find.placeholder')}
            className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground"
            onChange={(e) => onSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onRunSearch(e.shiftKey ? 'prev' : 'next');
              } else if (e.key === 'Escape') {
                e.preventDefault();
                onCloseSearch();
              }
            }}
          />
          <button
            type="button"
            aria-label={t('xterm.close.label')}
            className="rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            onClick={onCloseSearch}
          >
            <XIcon className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      )}
    </>
  );
}
