import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import MeetingsListCardHeader from './MeetingsListCardHeader';
import type { MeetingStatus } from './MeetingsView';
import type { Track } from './MeetingsSearchFacets';

// Child components own their own tests. Render thin marker stubs so the
// card-header test asserts composition + prop wiring without pulling in
// real selects, search input, or the composer's form state.
vi.mock('./MeetingsListTitleBar', () => ({
  default: ({
    creating,
    loading,
    onToggleCreating,
    onRefresh,
  }: {
    creating: boolean;
    loading: boolean;
    onToggleCreating: () => void;
    onRefresh: () => void;
  }) => (
    <div
      data-testid="title-bar"
      data-creating={creating ? 'true' : 'false'}
      data-loading={loading ? 'true' : 'false'}
    >
      <button type="button" data-testid="title-toggle" onClick={onToggleCreating}>
        toggle
      </button>
      <button type="button" data-testid="title-refresh" onClick={onRefresh}>
        refresh
      </button>
    </div>
  ),
}));

vi.mock('./MeetingsListFilterRow', () => ({
  default: ({
    status,
    onStatusChange,
    track,
    onTrackChange,
  }: {
    status: MeetingStatus | '';
    onStatusChange: (next: MeetingStatus | '') => void;
    track: Track | '';
    onTrackChange: (next: Track | '') => void;
  }) => (
    <div
      data-testid="filter-row"
      data-status={status}
      data-track={track}
    >
      <button
        type="button"
        data-testid="filter-set-status"
        onClick={() => onStatusChange('pending')}
      >
        set status
      </button>
      <button
        type="button"
        data-testid="filter-set-track"
        onClick={() => onTrackChange('standard')}
      >
        set track
      </button>
    </div>
  ),
}));

vi.mock('./MeetingsSearchSection', () => ({
  default: ({
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
  }: {
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
    searchResults: unknown;
    searchFacets: unknown;
    searchTotal: number | null;
    searchError: string | null;
  }) => (
    <div
      data-testid="search-section"
      data-query={query}
      data-searching={searching ? 'true' : 'false'}
      data-search-status={searchStatus}
      data-search-track={searchTrack}
      data-search-since={searchSince}
      data-search-until={searchUntil}
      data-search-results={searchResults === null ? 'null' : 'list'}
      data-search-facets={searchFacets === null ? 'null' : 'set'}
      data-search-total={searchTotal === null ? 'null' : String(searchTotal)}
      data-search-error={searchError ?? ''}
    >
      <button
        type="button"
        data-testid="search-set-query"
        onClick={() => onChangeQuery('next')}
      >
        set query
      </button>
      <button
        type="button"
        data-testid="search-set-status"
        onClick={() => onSearchStatusChange('completed')}
      >
        set s status
      </button>
      <button
        type="button"
        data-testid="search-set-track"
        onClick={() => onSearchTrackChange('lightweight')}
      >
        set s track
      </button>
      <button
        type="button"
        data-testid="search-set-since"
        onClick={() => onSearchSinceChange('2026-05-01')}
      >
        set since
      </button>
      <button
        type="button"
        data-testid="search-set-until"
        onClick={() => onSearchUntilChange('2026-05-05')}
      >
        set until
      </button>
    </div>
  ),
}));

vi.mock('./MeetingsComposer', () => ({
  default: ({
    open,
    onClose,
    onCreated,
  }: {
    open: boolean;
    onClose: () => void;
    onCreated: (id: string) => void;
  }) => (
    <div data-testid="composer" data-open={open ? 'true' : 'false'}>
      <button type="button" data-testid="composer-close" onClick={onClose}>
        close
      </button>
      <button
        type="button"
        data-testid="composer-created"
        onClick={() => onCreated('new-mtg-id')}
      >
        created
      </button>
    </div>
  ),
}));

beforeEach(() => {
  setLocale('en');
});

function renderHeader(
  overrides: Partial<Parameters<typeof MeetingsListCardHeader>[0]> = {},
) {
  const props = {
    creating: false,
    loading: false,
    onToggleCreating: vi.fn(),
    onRefresh: vi.fn(),
    listStatus: '' as MeetingStatus | '',
    onListStatusChange: vi.fn(),
    listTrack: '' as Track | '',
    onListTrackChange: vi.fn(),
    searchQuery: '',
    onChangeSearchQuery: vi.fn(),
    searching: false,
    searchStatus: '' as MeetingStatus | '',
    onSearchStatusChange: vi.fn(),
    searchTrack: '' as Track | '',
    onSearchTrackChange: vi.fn(),
    searchSince: '',
    onSearchSinceChange: vi.fn(),
    searchUntil: '',
    onSearchUntilChange: vi.fn(),
    searchResults: null,
    searchFacets: null,
    searchTotal: null,
    searchError: null,
    onCloseComposer: vi.fn(),
    onCreatedComposer: vi.fn(),
    ...overrides,
  };
  const utils = render(<MeetingsListCardHeader {...props} />);
  return { ...utils, props };
}

describe('<MeetingsListCardHeader>', () => {
  it('renders the TitleBar child marker', () => {
    renderHeader();
    expect(screen.getByTestId('title-bar')).toBeInTheDocument();
  });

  it('renders the SearchSection child marker', () => {
    renderHeader();
    expect(screen.getByTestId('search-section')).toBeInTheDocument();
  });

  it('renders the Composer child marker', () => {
    renderHeader();
    expect(screen.getByTestId('composer')).toBeInTheDocument();
  });

  it('renders the FilterRow child when the search query is empty', () => {
    renderHeader({ searchQuery: '' });
    expect(screen.getByTestId('filter-row')).toBeInTheDocument();
  });

  it('renders the FilterRow child when the search query is whitespace-only', () => {
    renderHeader({ searchQuery: '   ' });
    expect(screen.getByTestId('filter-row')).toBeInTheDocument();
  });

  it('hides the FilterRow child when the search query has visible text', () => {
    renderHeader({ searchQuery: 'auth' });
    expect(screen.queryByTestId('filter-row')).not.toBeInTheDocument();
  });

  it('forwards creating + loading to the TitleBar', () => {
    renderHeader({ creating: true, loading: true });
    const bar = screen.getByTestId('title-bar');
    expect(bar).toHaveAttribute('data-creating', 'true');
    expect(bar).toHaveAttribute('data-loading', 'true');
  });

  it('forwards listStatus + listTrack to the FilterRow', () => {
    renderHeader({ listStatus: 'completed', listTrack: 'full' });
    const row = screen.getByTestId('filter-row');
    expect(row).toHaveAttribute('data-status', 'completed');
    expect(row).toHaveAttribute('data-track', 'full');
  });

  it('forwards search* props to the SearchSection', () => {
    renderHeader({
      searchQuery: 'auth',
      searching: true,
      searchStatus: 'in-progress',
      searchTrack: 'standard',
      searchSince: '2026-05-01',
      searchUntil: '2026-05-05',
      searchTotal: 12,
      searchError: 'index lag',
      searchResults: [],
      searchFacets: { status: {}, track: {} },
    });
    const sec = screen.getByTestId('search-section');
    expect(sec).toHaveAttribute('data-query', 'auth');
    expect(sec).toHaveAttribute('data-searching', 'true');
    expect(sec).toHaveAttribute('data-search-status', 'in-progress');
    expect(sec).toHaveAttribute('data-search-track', 'standard');
    expect(sec).toHaveAttribute('data-search-since', '2026-05-01');
    expect(sec).toHaveAttribute('data-search-until', '2026-05-05');
    expect(sec).toHaveAttribute('data-search-total', '12');
    expect(sec).toHaveAttribute('data-search-error', 'index lag');
    expect(sec).toHaveAttribute('data-search-results', 'list');
    expect(sec).toHaveAttribute('data-search-facets', 'set');
  });

  it('forwards creating=true to the Composer', () => {
    renderHeader({ creating: true });
    expect(screen.getByTestId('composer')).toHaveAttribute(
      'data-open',
      'true',
    );
  });

  it('forwards creating=false to the Composer', () => {
    renderHeader({ creating: false });
    expect(screen.getByTestId('composer')).toHaveAttribute(
      'data-open',
      'false',
    );
  });

  it('fires onToggleCreating when the TitleBar fires its toggle callback', async () => {
    const user = userEvent.setup();
    const onToggleCreating = vi.fn();
    renderHeader({ onToggleCreating });
    await user.click(screen.getByTestId('title-toggle'));
    expect(onToggleCreating).toHaveBeenCalledTimes(1);
  });

  it('fires onRefresh when the TitleBar fires its refresh callback', async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    renderHeader({ onRefresh });
    await user.click(screen.getByTestId('title-refresh'));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('fires onListStatusChange when the FilterRow fires its status callback', async () => {
    const user = userEvent.setup();
    const onListStatusChange = vi.fn();
    renderHeader({ onListStatusChange });
    await user.click(screen.getByTestId('filter-set-status'));
    expect(onListStatusChange).toHaveBeenCalledWith('pending');
  });

  it('fires onListTrackChange when the FilterRow fires its track callback', async () => {
    const user = userEvent.setup();
    const onListTrackChange = vi.fn();
    renderHeader({ onListTrackChange });
    await user.click(screen.getByTestId('filter-set-track'));
    expect(onListTrackChange).toHaveBeenCalledWith('standard');
  });

  it('fires onChangeSearchQuery when the SearchSection fires its query callback', async () => {
    const user = userEvent.setup();
    const onChangeSearchQuery = vi.fn();
    renderHeader({ onChangeSearchQuery });
    await user.click(screen.getByTestId('search-set-query'));
    expect(onChangeSearchQuery).toHaveBeenCalledWith('next');
  });

  it('fires onSearchStatusChange when the SearchSection fires its status callback', async () => {
    const user = userEvent.setup();
    const onSearchStatusChange = vi.fn();
    renderHeader({ onSearchStatusChange });
    await user.click(screen.getByTestId('search-set-status'));
    expect(onSearchStatusChange).toHaveBeenCalledWith('completed');
  });

  it('fires onSearchTrackChange when the SearchSection fires its track callback', async () => {
    const user = userEvent.setup();
    const onSearchTrackChange = vi.fn();
    renderHeader({ onSearchTrackChange });
    await user.click(screen.getByTestId('search-set-track'));
    expect(onSearchTrackChange).toHaveBeenCalledWith('lightweight');
  });

  it('fires onSearchSinceChange when the SearchSection fires its since callback', async () => {
    const user = userEvent.setup();
    const onSearchSinceChange = vi.fn();
    renderHeader({ onSearchSinceChange });
    await user.click(screen.getByTestId('search-set-since'));
    expect(onSearchSinceChange).toHaveBeenCalledWith('2026-05-01');
  });

  it('fires onSearchUntilChange when the SearchSection fires its until callback', async () => {
    const user = userEvent.setup();
    const onSearchUntilChange = vi.fn();
    renderHeader({ onSearchUntilChange });
    await user.click(screen.getByTestId('search-set-until'));
    expect(onSearchUntilChange).toHaveBeenCalledWith('2026-05-05');
  });

  it('fires onCloseComposer when the Composer fires its close callback', async () => {
    const user = userEvent.setup();
    const onCloseComposer = vi.fn();
    renderHeader({ onCloseComposer });
    await user.click(screen.getByTestId('composer-close'));
    expect(onCloseComposer).toHaveBeenCalledTimes(1);
  });

  it('fires onCreatedComposer with the new meeting id from the Composer', async () => {
    const user = userEvent.setup();
    const onCreatedComposer = vi.fn();
    renderHeader({ onCreatedComposer });
    await user.click(screen.getByTestId('composer-created'));
    expect(onCreatedComposer).toHaveBeenCalledWith('new-mtg-id');
  });

  it('wraps the children in a CardHeader with the border-b class', () => {
    const { container } = renderHeader();
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('border-b');
    expect(wrapper).toHaveClass('flex-col');
  });

  it('does not fire any callback on initial render', () => {
    const onToggleCreating = vi.fn();
    const onRefresh = vi.fn();
    const onChangeSearchQuery = vi.fn();
    renderHeader({ onToggleCreating, onRefresh, onChangeSearchQuery });
    expect(onToggleCreating).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();
    expect(onChangeSearchQuery).not.toHaveBeenCalled();
  });

  it('rerendering with the same props does not duplicate onToggleCreating calls', async () => {
    const user = userEvent.setup();
    const onToggleCreating = vi.fn();
    const { rerender, props } = renderHeader({ onToggleCreating });
    rerender(<MeetingsListCardHeader {...props} />);
    await user.click(screen.getByTestId('title-toggle'));
    expect(onToggleCreating).toHaveBeenCalledTimes(1);
  });

  it('re-renders when the locale flips (useLocale subscription)', () => {
    const { container } = renderHeader();
    expect(container.firstChild).not.toBeNull();
    act(() => {
      setLocale('ko');
    });
    expect(screen.getByTestId('title-bar')).toBeInTheDocument();
  });
});
