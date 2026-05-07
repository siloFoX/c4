import { Badge } from './ui';
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
    return (
      <div className="p-4 text-sm text-muted-foreground">
        {isSearchMode
          ? tFormat('meetings.empty.search', { query: searchQuery })
          : (loading ? t('meetings.empty.loading') : t('meetings.empty.list'))}
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
                <span
                  className="inline-flex items-center rounded-full border border-purple-500/40 bg-purple-500/10 px-1.5 py-0 text-[10px] text-purple-700 dark:text-purple-400"
                  title={tFormat('meetings.tooltip.forkedFrom', { parent: m.forkOf })}
                >
                  ← {m.forkOf.slice(0, 8)}
                </span>
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
