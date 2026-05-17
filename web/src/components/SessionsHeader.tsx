import { FolderTree, Plus } from 'lucide-react';
import { CardHeader, CardTitle, SearchBar, Button, StickyFilterBar } from './ui';
import { t, useLocale } from '../lib/i18n';

// (v1.10.584) Extracted from SessionsView. The card header —
// title with FolderTree icon, search input, and the footer row
// (filtered/total count + New Chat / Attach New / Refresh
// buttons). Pure controlled inputs: parent owns query state +
// modal openers + refresh callbacks.

interface Props {
  query: string;
  onQuery: (next: string) => void;
  totalFiltered: number;
  total: number;
  loading: boolean;
  onNewChat: () => void;
  onAttachNew: () => void;
  onRefresh: () => void;
}

export default function SessionsHeader({
  query,
  onQuery,
  totalFiltered,
  total,
  loading,
  onNewChat,
  onAttachNew,
  onRefresh,
}: Props) {
  useLocale();
  // (v1.11.261, TODO 11.243) The header is now a StickyFilterBar
  // so the search input + counts + actions stay visible while the
  // operator scrolls through long sessions lists below. The bar
  // pins to the top of the parent Card's scroll container and
  // grows a scroll-shadow once pinned.
  return (
    <StickyFilterBar
      data-testid="sessions-header-sticky"
      className="border-b border-border"
    >
      <CardHeader className="gap-2 p-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <FolderTree className="h-4 w-4" aria-hidden /> {t('sessions.panel.title')}
        </CardTitle>
        {/* (v1.11.286, TODO 11.268) Bespoke <div>+Search+Input
            row migrated to the canonical SearchBar primitive
            (leading icon + clear button + ariaLabel built in).
            Size=sm matches the prior h-8 height. */}
        <SearchBar
          size="sm"
          value={query}
          onChange={onQuery}
          placeholder={t('sessions.search.placeholder')}
          ariaLabel={t('sessions.aria.search')}
          data-testid="sessions-header-search"
        />

        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {totalFiltered}/{total}
          </span>
          <div className="flex items-center gap-1">
            <Button size="sm" onClick={onNewChat}>
              <Plus className="h-3.5 w-3.5" aria-hidden /> {t('sessions.button.newChat')}
            </Button>
            <Button size="sm" variant="outline" onClick={onAttachNew}>
              <Plus className="h-3.5 w-3.5" aria-hidden /> {t('sessions.button.attachNew')}
            </Button>
            <Button size="sm" variant="outline" onClick={onRefresh} disabled={loading}>
              {loading ? t('common.loading') : t('common.refresh')}
            </Button>
          </div>
        </div>
      </CardHeader>
    </StickyFilterBar>
  );
}
