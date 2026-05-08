import { useLocale } from '../lib/i18n';
import MeetingsSearchInput from './MeetingsSearchInput';
import MeetingsSearchFilterRow from './MeetingsSearchFilterRow';
import MeetingsSearchFacets, { type SearchFacets, type Track } from './MeetingsSearchFacets';
import type { MeetingStatus, MeetingSummary } from './MeetingsView';

// (v1.10.613) Extracted from MeetingsView. The full-text search
// section — input + (when query non-empty) the filter row +
// (when results loaded) the facet chip row + the optional
// error span. Pure controlled inputs: parent owns query +
// search filter state + facets data.

interface Props {
  query: string;
  onChangeQuery: (next: string) => void;
  searching: boolean;
  searchStatus: MeetingStatus | '';
  onSearchStatusChange: (next: MeetingStatus | '') => void;
  searchTrack: Track | '';
  onSearchTrackChange: (next: Track | '') => void;
  searchSince: string;
  onSearchSinceChange: (next: string) => void;
  searchUntil: string;
  onSearchUntilChange: (next: string) => void;
  searchResults: MeetingSummary[] | null;
  searchFacets: SearchFacets | null;
  searchTotal: number | null;
  searchError: string | null;
}

export default function MeetingsSearchSection({
  query,
  onChangeQuery,
  searching,
  searchStatus,
  onSearchStatusChange,
  searchTrack,
  onSearchTrackChange,
  searchSince,
  onSearchSinceChange,
  searchUntil,
  onSearchUntilChange,
  searchResults,
  searchFacets,
  searchTotal,
  searchError,
}: Props) {
  useLocale();
  return (
    <>
      <MeetingsSearchInput
        value={query}
        onChange={onChangeQuery}
        searching={searching}
      />
      {query.trim() ? (
        <MeetingsSearchFilterRow
          status={searchStatus}
          onStatusChange={onSearchStatusChange}
          track={searchTrack}
          onTrackChange={onSearchTrackChange}
          since={searchSince}
          onSinceChange={onSearchSinceChange}
          until={searchUntil}
          onUntilChange={onSearchUntilChange}
        />
      ) : null}
      {searchResults && searchFacets ? (
        <MeetingsSearchFacets
          resultCount={searchResults.length}
          total={searchTotal}
          facets={searchFacets}
          selectedStatus={searchStatus}
          selectedTrack={searchTrack}
          onStatusToggle={onSearchStatusChange}
          onTrackToggle={onSearchTrackChange}
        />
      ) : null}
      {searchError ? (
        <div className="text-[11px] text-destructive">{searchError}</div>
      ) : null}
    </>
  );
}
