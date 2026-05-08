import { cn } from '../lib/cn';
import { tFormat, useLocale } from '../lib/i18n';
import type { MeetingStatus } from './MeetingsView';

// (v1.10.573) Extracted from MeetingsView. The FTS search facet
// chip row — total-matches header + status / track filter chips
// derived from the response facets. Clicking a chip toggles the
// corresponding parent filter selector.

// (v1.10.613) Promoted to exports so MeetingsSearchSection can
// type its props without redefining.
export type Track = 'lightweight' | 'standard' | 'full';

export interface SearchFacets {
  status?: Record<string, number>;
  track?: Record<string, number>;
}

interface Props {
  resultCount: number;
  total: number | null;
  facets: SearchFacets;
  selectedStatus: MeetingStatus | '';
  selectedTrack: Track | '';
  onStatusToggle: (next: MeetingStatus | '') => void;
  onTrackToggle: (next: Track | '') => void;
}

export default function MeetingsSearchFacets({
  resultCount,
  total,
  facets,
  selectedStatus,
  selectedTrack,
  onStatusToggle,
  onTrackToggle,
}: Props) {
  useLocale();
  return (
    <div className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
      <span className="mr-1">
        {typeof total === 'number' ? `${resultCount}/${total} matches` : `${resultCount} matches`}
      </span>
      {facets.status && Object.keys(facets.status).length > 0 ? (
        <>
          <span>· status:</span>
          {Object.entries(facets.status).map(([k, n]) => (
            <button
              key={`s-${k}`}
              type="button"
              onClick={() => onStatusToggle(selectedStatus === k ? '' : (k as MeetingStatus))}
              className={cn(
                'rounded border px-1 transition-colors',
                selectedStatus === k
                  ? 'border-primary bg-primary/30 text-foreground'
                  : 'border-border bg-background hover:bg-accent/40',
              )}
              title={tFormat('meetings.aria.filterStatus', { value: k })}
            >
              {k}={n}
            </button>
          ))}
        </>
      ) : null}
      {facets.track && Object.keys(facets.track).length > 0 ? (
        <>
          <span>· track:</span>
          {Object.entries(facets.track).map(([k, n]) => (
            <button
              key={`t-${k}`}
              type="button"
              onClick={() => onTrackToggle(selectedTrack === k ? '' : (k as Track))}
              className={cn(
                'rounded border px-1 transition-colors',
                selectedTrack === k
                  ? 'border-primary bg-primary/30 text-foreground'
                  : 'border-border bg-background hover:bg-accent/40',
              )}
              title={tFormat('meetings.aria.filterTrack', { value: k })}
            >
              {k}={n}
            </button>
          ))}
        </>
      ) : null}
    </div>
  );
}
