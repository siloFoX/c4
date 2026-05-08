import { CardHeader } from './ui';
import { useLocale } from '../lib/i18n';
import MeetingsListTitleBar from './MeetingsListTitleBar';
import MeetingsListFilterRow from './MeetingsListFilterRow';
import MeetingsSearchSection from './MeetingsSearchSection';
import MeetingsComposer from './MeetingsComposer';
import type { SearchFacets, Track } from './MeetingsSearchFacets';
import type { MeetingStatus, MeetingSummary } from './MeetingsView';

// (v1.10.615) Extracted from MeetingsView. The master-pane card
// header — title row + (when no search query) list filter row +
// search section + composer. Pure composite: parent owns
// creating state + filter selectors + search filter state.

interface Props {
  creating: boolean;
  loading: boolean;
  onToggleCreating: () => void;
  onRefresh: () => void;
  listStatus: MeetingStatus | '';
  onListStatusChange: (next: MeetingStatus | '') => void;
  listTrack: Track | '';
  onListTrackChange: (next: Track | '') => void;
  searchQuery: string;
  onChangeSearchQuery: (next: string) => void;
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
  onCloseComposer: () => void;
  onCreatedComposer: (newId: string) => void;
}

export default function MeetingsListCardHeader({
  creating,
  loading,
  onToggleCreating,
  onRefresh,
  listStatus,
  onListStatusChange,
  listTrack,
  onListTrackChange,
  searchQuery,
  onChangeSearchQuery,
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
  onCloseComposer,
  onCreatedComposer,
}: Props) {
  useLocale();
  return (
    <CardHeader className="flex flex-col gap-2 border-b border-border p-4">
      <MeetingsListTitleBar
        creating={creating}
        loading={loading}
        onToggleCreating={onToggleCreating}
        onRefresh={onRefresh}
      />
      {!searchQuery.trim() ? (
        <MeetingsListFilterRow
          status={listStatus}
          onStatusChange={onListStatusChange}
          track={listTrack}
          onTrackChange={onListTrackChange}
        />
      ) : null}
      <MeetingsSearchSection
        query={searchQuery}
        onChangeQuery={onChangeSearchQuery}
        searching={searching}
        searchStatus={searchStatus}
        onSearchStatusChange={onSearchStatusChange}
        searchTrack={searchTrack}
        onSearchTrackChange={onSearchTrackChange}
        searchSince={searchSince}
        onSearchSinceChange={onSearchSinceChange}
        searchUntil={searchUntil}
        onSearchUntilChange={onSearchUntilChange}
        searchResults={searchResults}
        searchFacets={searchFacets}
        searchTotal={searchTotal}
        searchError={searchError}
      />
      <MeetingsComposer
        open={creating}
        onClose={onCloseComposer}
        onCreated={onCreatedComposer}
      />
    </CardHeader>
  );
}
