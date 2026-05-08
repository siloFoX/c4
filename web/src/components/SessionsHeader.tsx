import { FolderTree, Plus, Search } from 'lucide-react';
import { CardHeader, CardTitle, Input, Button } from './ui';
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
  return (
    <CardHeader className="gap-2 border-b border-border p-4">
      <CardTitle className="flex items-center gap-2 text-base">
        <FolderTree className="h-4 w-4" aria-hidden /> {t('sessions.panel.title')}
      </CardTitle>
      <div className="relative">
        <Search
          className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={t('sessions.search.placeholder')}
          aria-label={t('sessions.aria.search')}
          className="h-8 pl-7 text-sm"
        />
      </div>
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
  );
}
