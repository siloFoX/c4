import { cn } from '../lib/cn';
import { t, useLocale } from '../lib/i18n';
import type { MeetingStatus } from './MeetingsView';

// (v1.10.543) Extracted from MeetingsView. Phase-6.9 fork
// lineage strip — chain-of-buttons showing the meeting's
// ancestry. Only rendered when depth > 1 (otherwise the
// strip would just contain the meeting itself). Pure display
// component; parent owns the data and the navigation callback.

interface LineageEntry {
  id: string;
  status: MeetingStatus;
  title: string;
  track: string;
  createdAt: string;
  completedAt: string | null;
  forkOf: string | null;
}

export interface LineageResponse {
  rootId: string | null;
  depth: number;
  chainTruncated: boolean;
  chain: LineageEntry[];
}

interface Props {
  lineage: LineageResponse | null;
  currentId: string;
  onNavigate: (id: string) => void;
}

export default function MeetingsLineageStrip({ lineage, currentId, onNavigate }: Props) {
  useLocale();
  if (!lineage || lineage.depth <= 1) return null;

  return (
    <div className="rounded-md border border-border/60 bg-muted/10 p-2 text-[11px]">
      <div className="mb-1 flex items-center gap-1 text-muted-foreground">
        <span className="font-medium text-foreground">{t('meetings.forkLineage')}</span>
        <span>· depth={lineage.depth}</span>
        {lineage.chainTruncated ? (
          <span className="text-amber-600 dark:text-amber-400">
            · chain truncated (older ancestor purged)
          </span>
        ) : null}
      </div>
      <ol className="flex flex-wrap items-center gap-1">
        {lineage.chain.map((entry, idx) => (
          <li key={entry.id} className="flex items-center gap-1">
            {idx > 0 ? <span className="text-muted-foreground">←</span> : null}
            <button
              type="button"
              onClick={() => onNavigate(entry.id)}
              className={cn(
                'rounded border px-1.5 py-0.5 font-mono text-[10px] transition-colors',
                entry.id === currentId
                  ? 'border-primary bg-primary/30 text-foreground'
                  : 'border-border bg-background hover:bg-accent/40',
              )}
              title={`${entry.title} · ${entry.status}`}
            >
              {entry.id}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
