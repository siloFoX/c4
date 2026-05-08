import { CardHeader, CardTitle } from './ui';
import { t, useLocale } from '../lib/i18n';
import WikiSearchControls from './WikiSearchControls';
import WikiBulkPublishRow from './WikiBulkPublishRow';

// (v1.10.620) Extracted from WikiView. The master-pane card
// header — title + search controls + bulk publish row. Pure
// composite: parent owns search/publish state + handlers.

interface Props {
  query: string;
  onQuery: (next: string) => void;
  type: string;
  onType: (next: string) => void;
  includeStale: boolean;
  onIncludeStale: (next: boolean) => void;
  searching: boolean;
  onSearch: () => void;
  bulkBusy: boolean;
  bulkGitCommit: boolean;
  bulkGitPush: boolean;
  bulkMsg: string | null;
  bulkFailed: boolean;
  onBulkGitCommit: (next: boolean) => void;
  onBulkGitPush: (next: boolean) => void;
  onBulkPublish: () => void;
}

export default function WikiSearchCardHeader({
  query,
  onQuery,
  type,
  onType,
  includeStale,
  onIncludeStale,
  searching,
  onSearch,
  bulkBusy,
  bulkGitCommit,
  bulkGitPush,
  bulkMsg,
  bulkFailed,
  onBulkGitCommit,
  onBulkGitPush,
  onBulkPublish,
}: Props) {
  useLocale();
  return (
    <CardHeader className="flex flex-col gap-2 border-b border-border p-4">
      <CardTitle className="text-base">{t('wiki.title')}</CardTitle>
      <div className="flex flex-col gap-2">
        <WikiSearchControls
          query={query}
          onQuery={onQuery}
          type={type}
          onType={onType}
          includeStale={includeStale}
          onIncludeStale={onIncludeStale}
          searching={searching}
          onSearch={onSearch}
        />
        <WikiBulkPublishRow
          busy={bulkBusy}
          gitCommit={bulkGitCommit}
          gitPush={bulkGitPush}
          msg={bulkMsg}
          failed={bulkFailed}
          onGitCommit={onBulkGitCommit}
          onGitPush={onBulkGitPush}
          onPublish={onBulkPublish}
        />
      </div>
    </CardHeader>
  );
}
