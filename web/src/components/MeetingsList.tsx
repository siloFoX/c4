import { Badge, Skeleton } from './ui';
import { cn } from '../lib/cn';
import { t, tFormat, useLocale } from '../lib/i18n';
import { renderSnippet } from '../lib/snippet';
import {
  STATUS_BADGE,
  formatRelative,
  type MeetingSummary,
} from './MeetingsView';

// (v1.10.576) Extracted from MeetingsView. The master-pane list
// rendering — handles three states: error (when not in search
// mode), empty (with search-aware messaging), and the row map.
// Pure display: parent owns the data + selection state.

interface Props {
  displayList: MeetingSummary[];
  isSearchMode: boolean;
  searchQuery: string;
  error: string | null;
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function MeetingsList({
  displayList,
  isSearchMode,
  searchQuery,
  error,
  loading,
  selectedId,
  onSelect,
}: Props) {
  useLocale();

  if (error && !isSearchMode) {
    return <div className="p-4 text-sm text-destructive">{error}</div>;
  }
  if (displayList.length === 0) {
    if (loading && !isSearchMode) {
      return (
        <div
          className="flex flex-col gap-2 p-4"
          aria-label={t('meetings.empty.loading')}
          data-meetings-loading="1"
        >
          <Skeleton variant="row" />
          <Skeleton variant="row" />
          <Skeleton variant="row" />
        </div>
      );
    }
    return (
      <div className="p-4 text-sm text-muted-foreground">
        {isSearchMode
          ? tFormat('meetings.empty.search', { query: searchQuery })
          : t('meetings.empty.list')}
      </div>
    );
  }
  return (
    <ul className="divide-y divide-border">
      {displayList.map((m) => {
        const active = m.id === selectedId;
        return (
          <li
            key={m.id}
            className={cn(
              'flex cursor-pointer flex-col gap-1 px-4 py-3 transition-colors',
              active ? 'bg-primary/30' : 'hover:bg-accent/40',
            )}
            onClick={() => onSelect(m.id)}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn('inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] uppercase tracking-wide', STATUS_BADGE[m.status])}>
                {m.status}
              </span>
              <Badge variant="outline" className="text-[10px] uppercase">
                {m.track}
              </Badge>
              {m.forkOf ? (
                <Badge
                  variant="info"
                  className="px-1.5 py-0 text-[10px]"
                  title={tFormat('meetings.tooltip.forkedFrom', { parent: m.forkOf })}
                >
                  ← {m.forkOf.slice(0, 8)}
                </Badge>
              ) : null}
              <span className="text-[10px] text-muted-foreground">
                {formatRelative(m.startedAt || m.createdAt)}
              </span>
            </div>
            <span className="truncate text-sm font-medium">{m.title}</span>
            {m.snippet ? (
              <span className="line-clamp-2 text-[11px] text-muted-foreground">
                {renderSnippet(m.snippet)}
              </span>
            ) : null}
            <span className="text-[11px] text-muted-foreground">
              stage: {m.currentStage || '-'} · round {m.currentRound || 0} · id {m.id}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
