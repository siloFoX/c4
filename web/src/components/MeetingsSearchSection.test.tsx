import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import MeetingsSearchSection from './MeetingsSearchSection';
import type { MeetingStatus, MeetingSummary } from './MeetingsView';
import type { SearchFacets, Track } from './MeetingsSearchFacets';

// MeetingsSearchSection composes the search input + (when query is
// non-empty) the filter row + (when results loaded) the facets +
// the optional error banner. Parent owns every state slice and
// every callback. Child components have their own tests; stub each
// to a thin marker so this test asserts composition + prop wiring
// without pulling in real selects or the FTS hook.

vi.mock('./MeetingsSearchInput', () => ({
  default: ({
    value,
    onChange,
    searching,
  }: {
    value: string;
    onChange: (next: string) => void;
    searching: boolean;
  }) => (
    <div
      data-testid="search-input"
      data-value={value}
      data-searching={searching ? 'true' : 'false'}
    >
      <button
        type="button"
        data-testid="input-set-value"
        onClick={() => onChange('next')}
      >
        set value
      </button>
    </div>
  ),
}));

vi.mock('./MeetingsSearchFilterRow', () => ({
  default: ({
    status,
    onStatusChange,
    track,
    onTrackChange,
    since,
    onSinceChange,
    until,
    onUntilChange,
  }: {
    status: MeetingStatus | '';
    onStatusChange: (next: MeetingStatus | '') => void;
    track: Track | '';
    onTrackChange: (next: Track | '') => void;
    since: string;
    onSinceChange: (next: string) => void;
    until: string;
    onUntilChange: (next: string) => void;
  }) => (
    <div
      data-testid="filter-row"
      data-status={status}
      data-track={track}
      data-since={since}
      data-until={until}
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
      <button
        type="button"
        data-testid="filter-set-since"
        onClick={() => onSinceChange('2026-05-01')}
      >
        set since
      </button>
      <button
        type="button"
        data-testid="filter-set-until"
        onClick={() => onUntilChange('2026-05-12')}
      >
        set until
      </button>
    </div>
  ),
}));

vi.mock('./MeetingsSearchFacets', () => ({
  default: ({
    resultCount,
    total,
    facets,
    selectedStatus,
    selectedTrack,
    onStatusToggle,
    onTrackToggle,
  }: {
    resultCount: number;
    total: number | null;
    facets: SearchFacets;
    selectedStatus: MeetingStatus | '';
    selectedTrack: Track | '';
    onStatusToggle: (next: MeetingStatus | '') => void;
    onTrackToggle: (next: Track | '') => void;
  }) => (
    <div
      data-testid="facets"
      data-result-count={String(resultCount)}
      data-total={total === null ? 'null' : String(total)}
      data-selected-status={selectedStatus}
      data-selected-track={selectedTrack}
      data-facets={JSON.stringify(facets)}
    >
      <button
        type="button"
        data-testid="facets-toggle-status"
        onClick={() => onStatusToggle('completed')}
      >
        toggle status
      </button>
      <button
        type="button"
        data-testid="facets-toggle-track"
        onClick={() => onTrackToggle('full')}
      >
        toggle track
      </button>
    </div>
  ),
}));

beforeEach(() => {
  setLocale('en');
});

function renderSection(
  overrides: Partial<Parameters<typeof MeetingsSearchSection>[0]> = {},
) {
  const props = {
    query: '',
    onChangeQuery: vi.fn(),
    searching: false,
    searchStatus: '' as MeetingStatus | '',
    onSearchStatusChange: vi.fn(),
    searchTrack: '' as Track | '',
    onSearchTrackChange: vi.fn(),
    searchSince: '',
    onSearchSinceChange: vi.fn(),
    searchUntil: '',
    onSearchUntilChange: vi.fn(),
    searchResults: null as MeetingSummary[] | null,
    searchFacets: null as SearchFacets | null,
    searchTotal: null as number | null,
    searchError: null as string | null,
    ...overrides,
  };
  const utils = render(<MeetingsSearchSection {...props} />);
  return { ...utils, props };
}

describe('<MeetingsSearchSection>', () => {
  it('always renders the SearchInput child marker', () => {
    renderSection();
    expect(screen.getByTestId('search-input')).toBeInTheDocument();
  });

  it('does not render the FilterRow when query is empty', () => {
    renderSection({ query: '' });
    expect(screen.queryByTestId('filter-row')).not.toBeInTheDocument();
  });

  it('does not render the FilterRow when query is whitespace-only', () => {
    renderSection({ query: '   ' });
    expect(screen.queryByTestId('filter-row')).not.toBeInTheDocument();
  });

  it('renders the FilterRow when query has visible text', () => {
    renderSection({ query: 'auth' });
    expect(screen.getByTestId('filter-row')).toBeInTheDocument();
  });

  it('renders the FilterRow when query has surrounding whitespace + visible text', () => {
    renderSection({ query: '  auth  ' });
    expect(screen.getByTestId('filter-row')).toBeInTheDocument();
  });

  it('does not render the Facets when searchResults is null', () => {
    renderSection({ searchResults: null, searchFacets: { status: {}, track: {} } });
    expect(screen.queryByTestId('facets')).not.toBeInTheDocument();
  });

  it('does not render the Facets when searchFacets is null', () => {
    renderSection({ searchResults: [], searchFacets: null });
    expect(screen.queryByTestId('facets')).not.toBeInTheDocument();
  });

  it('renders the Facets when both searchResults and searchFacets are present', () => {
    renderSection({
      searchResults: [],
      searchFacets: { status: {}, track: {} },
    });
    expect(screen.getByTestId('facets')).toBeInTheDocument();
  });

  it('does not render the error banner when searchError is null', () => {
    const { container } = renderSection({ searchError: null });
    expect(container.querySelector('.text-destructive')).toBeNull();
  });

  it('renders the error banner when searchError is a non-empty string', () => {
    renderSection({ searchError: 'index lag' });
    expect(screen.getByText('index lag')).toBeInTheDocument();
  });

  it('applies the destructive class to the error banner', () => {
    const { container } = renderSection({ searchError: 'oops' });
    const banner = container.querySelector('.text-destructive') as HTMLElement;
    expect(banner).not.toBeNull();
    expect(banner.textContent).toBe('oops');
  });

  it('forwards query + searching to the SearchInput', () => {
    renderSection({ query: 'auth', searching: true });
    const input = screen.getByTestId('search-input');
    expect(input).toHaveAttribute('data-value', 'auth');
    expect(input).toHaveAttribute('data-searching', 'true');
  });

  it('forwards searching=false to the SearchInput', () => {
    renderSection({ searching: false });
    expect(screen.getByTestId('search-input')).toHaveAttribute(
      'data-searching',
      'false',
    );
  });

  it('forwards searchStatus / searchTrack / searchSince / searchUntil to the FilterRow', () => {
    renderSection({
      query: 'auth',
      searchStatus: 'in-progress',
      searchTrack: 'standard',
      searchSince: '2026-05-01',
      searchUntil: '2026-05-12',
    });
    const row = screen.getByTestId('filter-row');
    expect(row).toHaveAttribute('data-status', 'in-progress');
    expect(row).toHaveAttribute('data-track', 'standard');
    expect(row).toHaveAttribute('data-since', '2026-05-01');
    expect(row).toHaveAttribute('data-until', '2026-05-12');
  });

  it('forwards resultCount + total + facets + selectors to the Facets', () => {
    renderSection({
      searchResults: [
        { id: 'm1' } as MeetingSummary,
        { id: 'm2' } as MeetingSummary,
        { id: 'm3' } as MeetingSummary,
      ],
      searchFacets: { status: { pending: 2 } },
      searchTotal: 42,
      searchStatus: 'completed',
      searchTrack: 'full',
    });
    const facets = screen.getByTestId('facets');
    expect(facets).toHaveAttribute('data-result-count', '3');
    expect(facets).toHaveAttribute('data-total', '42');
    expect(facets).toHaveAttribute('data-selected-status', 'completed');
    expect(facets).toHaveAttribute('data-selected-track', 'full');
    expect(facets).toHaveAttribute(
      'data-facets',
      JSON.stringify({ status: { pending: 2 } }),
    );
  });

  it('passes searchTotal=null to the Facets marker as "null"', () => {
    renderSection({
      searchResults: [],
      searchFacets: { status: {}, track: {} },
      searchTotal: null,
    });
    expect(screen.getByTestId('facets')).toHaveAttribute('data-total', 'null');
  });

  it('passes resultCount=0 to the Facets when searchResults is an empty array', () => {
    renderSection({
      searchResults: [],
      searchFacets: { status: {}, track: {} },
    });
    expect(screen.getByTestId('facets')).toHaveAttribute(
      'data-result-count',
      '0',
    );
  });

  it('fires onChangeQuery when the SearchInput fires its change callback', async () => {
    const user = userEvent.setup();
    const onChangeQuery = vi.fn();
    renderSection({ onChangeQuery });
    await user.click(screen.getByTestId('input-set-value'));
    expect(onChangeQuery).toHaveBeenCalledTimes(1);
    expect(onChangeQuery).toHaveBeenCalledWith('next');
  });

  it('fires onSearchStatusChange when the FilterRow fires its status callback', async () => {
    const user = userEvent.setup();
    const onSearchStatusChange = vi.fn();
    renderSection({ query: 'auth', onSearchStatusChange });
    await user.click(screen.getByTestId('filter-set-status'));
    expect(onSearchStatusChange).toHaveBeenCalledWith('pending');
  });

  it('fires onSearchTrackChange when the FilterRow fires its track callback', async () => {
    const user = userEvent.setup();
    const onSearchTrackChange = vi.fn();
    renderSection({ query: 'auth', onSearchTrackChange });
    await user.click(screen.getByTestId('filter-set-track'));
    expect(onSearchTrackChange).toHaveBeenCalledWith('standard');
  });

  it('fires onSearchSinceChange when the FilterRow fires its since callback', async () => {
    const user = userEvent.setup();
    const onSearchSinceChange = vi.fn();
    renderSection({ query: 'auth', onSearchSinceChange });
    await user.click(screen.getByTestId('filter-set-since'));
    expect(onSearchSinceChange).toHaveBeenCalledWith('2026-05-01');
  });

  it('fires onSearchUntilChange when the FilterRow fires its until callback', async () => {
    const user = userEvent.setup();
    const onSearchUntilChange = vi.fn();
    renderSection({ query: 'auth', onSearchUntilChange });
    await user.click(screen.getByTestId('filter-set-until'));
    expect(onSearchUntilChange).toHaveBeenCalledWith('2026-05-12');
  });

  it('wires the Facets status toggle back to onSearchStatusChange', async () => {
    const user = userEvent.setup();
    const onSearchStatusChange = vi.fn();
    renderSection({
      searchResults: [],
      searchFacets: { status: {}, track: {} },
      onSearchStatusChange,
    });
    await user.click(screen.getByTestId('facets-toggle-status'));
    expect(onSearchStatusChange).toHaveBeenCalledWith('completed');
  });

  it('wires the Facets track toggle back to onSearchTrackChange', async () => {
    const user = userEvent.setup();
    const onSearchTrackChange = vi.fn();
    renderSection({
      searchResults: [],
      searchFacets: { status: {}, track: {} },
      onSearchTrackChange,
    });
    await user.click(screen.getByTestId('facets-toggle-track'));
    expect(onSearchTrackChange).toHaveBeenCalledWith('full');
  });

  it('does not fire any callback on initial render', () => {
    const onChangeQuery = vi.fn();
    const onSearchStatusChange = vi.fn();
    const onSearchTrackChange = vi.fn();
    const onSearchSinceChange = vi.fn();
    const onSearchUntilChange = vi.fn();
    renderSection({
      query: 'auth',
      searchResults: [],
      searchFacets: { status: {}, track: {} },
      onChangeQuery,
      onSearchStatusChange,
      onSearchTrackChange,
      onSearchSinceChange,
      onSearchUntilChange,
    });
    expect(onChangeQuery).not.toHaveBeenCalled();
    expect(onSearchStatusChange).not.toHaveBeenCalled();
    expect(onSearchTrackChange).not.toHaveBeenCalled();
    expect(onSearchSinceChange).not.toHaveBeenCalled();
    expect(onSearchUntilChange).not.toHaveBeenCalled();
  });

  it('rerendering with the same props does not duplicate onChangeQuery calls', async () => {
    const user = userEvent.setup();
    const onChangeQuery = vi.fn();
    const { rerender, props } = renderSection({ onChangeQuery });
    rerender(<MeetingsSearchSection {...props} />);
    await user.click(screen.getByTestId('input-set-value'));
    expect(onChangeQuery).toHaveBeenCalledTimes(1);
  });

  it('rerendering from empty query to populated surfaces the FilterRow', () => {
    const { rerender, props } = renderSection({ query: '' });
    expect(screen.queryByTestId('filter-row')).not.toBeInTheDocument();
    rerender(<MeetingsSearchSection {...props} query="auth" />);
    expect(screen.getByTestId('filter-row')).toBeInTheDocument();
  });

  it('rerendering from populated query to empty removes the FilterRow', () => {
    const { rerender, props } = renderSection({ query: 'auth' });
    expect(screen.getByTestId('filter-row')).toBeInTheDocument();
    rerender(<MeetingsSearchSection {...props} query="" />);
    expect(screen.queryByTestId('filter-row')).not.toBeInTheDocument();
  });

  it('rerendering from no facets to set facets surfaces the Facets', () => {
    const { rerender, props } = renderSection({
      searchResults: null,
      searchFacets: null,
    });
    expect(screen.queryByTestId('facets')).not.toBeInTheDocument();
    rerender(
      <MeetingsSearchSection
        {...props}
        searchResults={[]}
        searchFacets={{ status: {}, track: {} }}
      />,
    );
    expect(screen.getByTestId('facets')).toBeInTheDocument();
  });

  it('rerendering from error to no-error removes the error banner', () => {
    const { rerender, props } = renderSection({ searchError: 'oops' });
    expect(screen.getByText('oops')).toBeInTheDocument();
    rerender(<MeetingsSearchSection {...props} searchError={null} />);
    expect(screen.queryByText('oops')).not.toBeInTheDocument();
  });

  it('renders error banner together with results when both are present', () => {
    renderSection({
      query: 'auth',
      searchResults: [],
      searchFacets: { status: {}, track: {} },
      searchError: 'partial failure',
    });
    expect(screen.getByTestId('facets')).toBeInTheDocument();
    expect(screen.getByText('partial failure')).toBeInTheDocument();
  });

  it('re-renders when the locale flips (useLocale subscription)', () => {
    renderSection();
    expect(screen.getByTestId('search-input')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.getByTestId('search-input')).toBeInTheDocument();
  });
});
