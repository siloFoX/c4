import { useState } from 'react';
import { Card, CardContent } from './ui';
import { useLocale } from '../lib/i18n';
import WikiSearchResults from './WikiSearchResults';
import WikiPageDetail from './WikiPageDetail';
import WikiPageDetailHeader from './WikiPageDetailHeader';
import WikiSearchCardHeader from './WikiSearchCardHeader';
import { useWikiPage } from '../lib/use-wiki-page';
import { useWikiReopen } from '../lib/use-wiki-reopen';
import { useWikiBulkPublish } from '../lib/use-wiki-bulk-publish';
import { useWikiSearch } from '../lib/use-wiki-search';

// (multi-specialist phase 7.4) Wiki tab — split-pane like
// MeetingsView. Left: query input + results list. Right: full page
// body (frontmatter + raw markdown). Mirrors `c4 wiki search` /
// `c4 wiki read` exactly so operators have parity between CLI and UI.

export interface SearchHit {
  path: string;
  title: string;
  type: string;
  status: string | null;
  meetingId: string | null;
  adr: number | null;
  lastReviewed: string | null;
  related: string[];
  score: number;
  snippet: string;
}

export interface SearchResponse {
  wikiRoot: string;
  query: string;
  type: string;
  total: number;
  hits: SearchHit[];
}

// (v1.10.600) ReadResponse promoted to export so the
// WikiPageDetail sibling can type its `page` prop.
export interface ReadResponse {
  path: string;
  absolutePath: string;
  frontmatter: Record<string, unknown>;
  body: string;
  raw: string;
}

// (v1.10.486) Migrated to labelKey pattern resolved through t() at
// render time, like other constant catalogues.
// (v1.10.609) Promoted to export so the WikiSearchControls
// sibling can reuse the same options list.
export const TYPE_OPTIONS: Array<{ value: string; labelKey: string }> = [
  { value: 'any', labelKey: 'wiki.type.any' },
  { value: 'meeting', labelKey: 'wiki.type.meeting' },
  { value: 'adr', labelKey: 'wiki.type.adr' },
  { value: 'retro', labelKey: 'wiki.type.retro' },
  { value: 'specialist', labelKey: 'wiki.type.specialist' },
  { value: 'docs', labelKey: 'wiki.type.docs' },
];

export default function WikiView() {
  useLocale();
  // (v1.10.642) Wiki search hook extracted to ../lib/use-wiki-search.
  const {
    query,
    setQuery,
    type,
    setType,
    includeStale,
    setIncludeStale,
    search,
    searchError,
    searching,
    runSearch,
  } = useWikiSearch();
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  // (v1.10.639) Per-selection /api/wiki/read hook extracted to
  // ../lib/use-wiki-page.
  const { page, setPage, pageError } = useWikiPage(selectedPath);


  // (v1.10.640) Reopen action hook extracted to ../lib/use-wiki-reopen.
  const { reopenBusy, reopenMsg, reopenFailed, handleReopen } = useWikiReopen({
    setPage,
    runSearch,
  });

  // (v1.10.641) Bulk publish hook extracted to ../lib/use-wiki-bulk-publish.
  const {
    bulkBusy,
    bulkMsg,
    bulkFailed,
    bulkGitCommit,
    bulkGitPush,
    toggleBulkGitCommit,
    toggleBulkGitPush,
    handleBulkPublish,
  } = useWikiBulkPublish({ runSearch });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 md:flex-row md:p-6">
      <Card className="flex min-h-0 flex-1 flex-col md:max-w-md">
        {/* (v1.10.620) Master-pane card header (title + search +
            bulk publish) extracted to ./WikiSearchCardHeader.tsx. */}
        <WikiSearchCardHeader
          query={query}
          onQuery={setQuery}
          type={type}
          onType={setType}
          includeStale={includeStale}
          onIncludeStale={setIncludeStale}
          searching={searching}
          onSearch={runSearch}
          bulkBusy={bulkBusy}
          bulkGitCommit={bulkGitCommit}
          bulkGitPush={bulkGitPush}
          bulkMsg={bulkMsg}
          bulkFailed={bulkFailed}
          onBulkGitCommit={toggleBulkGitCommit}
          onBulkGitPush={toggleBulkGitPush}
          onBulkPublish={handleBulkPublish}
        />
        <CardContent className="flex min-h-0 flex-1 flex-col overflow-y-auto p-0">
          <WikiSearchResults
            search={search}
            searchError={searchError}
            selectedPath={selectedPath}
            onSelect={setSelectedPath}
          />
        </CardContent>
      </Card>

      <Card className="flex min-h-0 flex-1 flex-col">
        {/* (v1.10.619) Detail card header (title + reopen) extracted
            to ./WikiPageDetailHeader.tsx. */}
        <WikiPageDetailHeader
          page={page}
          selectedPath={selectedPath}
          reopenBusy={reopenBusy}
          reopenMsg={reopenMsg}
          reopenFailed={reopenFailed}
          onReopen={handleReopen}
        />
        <CardContent className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
          {/* (v1.10.600) Page detail body extracted to ./WikiPageDetail.tsx. */}
          <WikiPageDetail
            selectedPath={selectedPath}
            page={page}
            pageError={pageError}
            onSelectPath={setSelectedPath}
          />
        </CardContent>
      </Card>
    </div>
  );
}
