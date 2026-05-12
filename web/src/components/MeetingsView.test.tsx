import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type { MeetingStatus, MeetingSummary } from './MeetingsView';
import type { Track } from './MeetingsSearchFacets';

// The page-level view wires nine sibling components and five hooks.
// Stub every child to a marker so we can assert the composition + the
// prop wiring without booting MSW handlers, EventSource streams, or
// the lazy detail-pane subtrees. Hooks return deterministic shapes so
// each test can drive a single branch.

const refreshMock = vi.fn();
let listResult: {
  data: { meetings: MeetingSummary[]; count: number } | null;
  error: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
} = {
  data: { meetings: [], count: 0 },
  error: null,
  loading: false,
  refresh: () => Promise.resolve(),
};

let searchResult: {
  searchResults: MeetingSummary[] | null;
  searchFacets: unknown;
  searchTotal: number | null;
  searchError: string | null;
  searching: boolean;
} = {
  searchResults: null,
  searchFacets: null,
  searchTotal: null,
  searchError: null,
  searching: false,
};

let detailResult: {
  detail: unknown;
  detailError: string | null;
  streaming: boolean;
} = {
  detail: null,
  detailError: null,
  streaming: false,
};

let enrichmentResult: {
  lineage: unknown;
  actions: unknown;
  recap: unknown;
} = {
  lineage: null,
  actions: null,
  recap: null,
};

let stuckResult: unknown = null;

vi.mock('../lib/use-meetings-list', () => ({
  useMeetingsList: (_args: unknown) => {
    void _args;
    return { ...listResult, refresh: refreshMock };
  },
}));

vi.mock('../lib/use-meetings-search', () => ({
  useMeetingsSearch: (_args: unknown) => {
    void _args;
    return searchResult;
  },
}));

vi.mock('../lib/use-meeting-detail-stream', () => ({
  useMeetingDetailStream: (_id: string | null) => {
    void _id;
    return detailResult;
  },
}));

vi.mock('../lib/use-meeting-enrichment', () => ({
  useMeetingEnrichment: (_args: unknown) => {
    void _args;
    return enrichmentResult;
  },
}));

vi.mock('../lib/use-stuck-meetings', () => ({
  useStuckMeetings: () => stuckResult,
}));

// (v1.10.638) toggle-reset-on-change has its own test; render-time
// behaviour for this view only cares that toggle calls flip the
// boolean prop forwarded to the detail-card header.
vi.mock('../lib/use-toggle-reset-on-change', async () => {
  const react = await vi.importActual<typeof import('react')>('react');
  return {
    useToggleResetOnChange: (key: unknown) => {
      void key;
      const [open, setOpen] = react.useState(false);
      const toggle = react.useCallback(() => setOpen((v) => !v), []);
      return { open, toggle, setOpen };
    },
  };
});

vi.mock('../lib/use-toggle', async () => {
  const react = await vi.importActual<typeof import('react')>('react');
  return {
    useToggle: (initial: boolean | (() => boolean) = false) => {
      const [value, set] = react.useState<boolean>(initial);
      const toggle = react.useCallback(() => set((v) => !v), []);
      return [value, toggle, set] as const;
    },
  };
});

vi.mock('./MeetingsStuckBanner', () => ({
  default: ({
    stuck,
    onNavigate,
  }: {
    stuck: unknown;
    onNavigate: (id: string) => void;
  }) => (
    <div data-testid="stuck-banner" data-has-stuck={stuck ? 'true' : 'false'}>
      <button
        type="button"
        data-testid="stuck-navigate"
        onClick={() => onNavigate('stuck-id')}
      >
        navigate
      </button>
    </div>
  ),
}));

vi.mock('./MeetingsMaintenancePanel', () => ({
  default: ({ onPruned }: { onPruned: () => void }) => (
    <div data-testid="maintenance-panel">
      <button type="button" data-testid="prune" onClick={onPruned}>
        prune
      </button>
    </div>
  ),
}));

vi.mock('./MeetingsListCardHeader', () => ({
  default: ({
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
    searchStatus,
    onSearchStatusChange,
    searchTrack,
    onSearchTrackChange,
    searchSince,
    onSearchSinceChange,
    searchUntil,
    onSearchUntilChange,
    searchResults,
    searchTotal,
    searchError,
    searching,
    onCloseComposer,
    onCreatedComposer,
  }: {
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
    searchStatus: MeetingStatus | '';
    onSearchStatusChange: (next: MeetingStatus | '') => void;
    searchTrack: Track | '';
    onSearchTrackChange: (next: Track | '') => void;
    searchSince: string;
    onSearchSinceChange: (next: string) => void;
    searchUntil: string;
    onSearchUntilChange: (next: string) => void;
    searchResults: MeetingSummary[] | null;
    searchTotal: number | null;
    searchError: string | null;
    searching: boolean;
    onCloseComposer: () => void;
    onCreatedComposer: (id: string) => void;
  }) => (
    <div
      data-testid="list-card-header"
      data-creating={creating ? 'true' : 'false'}
      data-loading={loading ? 'true' : 'false'}
      data-list-status={listStatus}
      data-list-track={listTrack}
      data-search-query={searchQuery}
      data-search-status={searchStatus}
      data-search-track={searchTrack}
      data-search-since={searchSince}
      data-search-until={searchUntil}
      data-search-total={searchTotal === null ? 'null' : String(searchTotal)}
      data-search-error={searchError ?? ''}
      data-searching={searching ? 'true' : 'false'}
      data-search-results={searchResults === null ? 'null' : 'list'}
    >
      <button type="button" data-testid="toggle-creating" onClick={onToggleCreating}>
        toggle
      </button>
      <button type="button" data-testid="refresh" onClick={onRefresh}>
        refresh
      </button>
      <button
        type="button"
        data-testid="set-list-status"
        onClick={() => onListStatusChange('completed')}
      >
        ls
      </button>
      <button
        type="button"
        data-testid="set-list-track"
        onClick={() => onListTrackChange('standard')}
      >
        lt
      </button>
      <button
        type="button"
        data-testid="set-search-query"
        onClick={() => onChangeSearchQuery('auth')}
      >
        sq
      </button>
      <button
        type="button"
        data-testid="set-search-status"
        onClick={() => onSearchStatusChange('in-progress')}
      >
        ss
      </button>
      <button
        type="button"
        data-testid="set-search-track"
        onClick={() => onSearchTrackChange('full')}
      >
        st
      </button>
      <button
        type="button"
        data-testid="set-search-since"
        onClick={() => onSearchSinceChange('2026-05-01')}
      >
        sn
      </button>
      <button
        type="button"
        data-testid="set-search-until"
        onClick={() => onSearchUntilChange('2026-05-05')}
      >
        un
      </button>
      <button type="button" data-testid="close-composer" onClick={onCloseComposer}>
        close
      </button>
      <button
        type="button"
        data-testid="created-composer"
        onClick={() => onCreatedComposer('new-mtg')}
      >
        created
      </button>
    </div>
  ),
}));

vi.mock('./MeetingsList', () => ({
  default: ({
    displayList,
    isSearchMode,
    selectedId,
    onSelect,
  }: {
    displayList: MeetingSummary[];
    isSearchMode: boolean;
    searchQuery: string;
    error: string | null;
    loading: boolean;
    selectedId: string | null;
    onSelect: (id: string) => void;
  }) => (
    <div
      data-testid="list"
      data-search-mode={isSearchMode ? 'true' : 'false'}
      data-selected={selectedId ?? ''}
      data-list-len={String(displayList.length)}
    >
      {displayList.map((m) => (
        <button
          key={m.id}
          type="button"
          data-testid={`row-${m.id}`}
          onClick={() => onSelect(m.id)}
        >
          {m.title}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('./MeetingsDetailCardHeader', () => ({
  default: ({
    title,
    selectedId,
    detail,
    streaming,
    contribOpen,
    onContribToggle,
    forkOpen,
    onForkToggle,
    onForkClose,
    onForked,
  }: {
    title: string;
    selectedId: string | null;
    detail: unknown;
    streaming: boolean;
    contribOpen: boolean;
    onContribToggle: () => void;
    forkOpen: boolean;
    onForkToggle: () => void;
    onForkClose: () => void;
    onForked: (id: string) => void;
  }) => (
    <div
      data-testid="detail-card-header"
      data-title={title}
      data-selected={selectedId ?? ''}
      data-has-detail={detail ? 'true' : 'false'}
      data-streaming={streaming ? 'true' : 'false'}
      data-contrib-open={contribOpen ? 'true' : 'false'}
      data-fork-open={forkOpen ? 'true' : 'false'}
    >
      <button type="button" data-testid="contrib-toggle" onClick={onContribToggle}>
        contrib
      </button>
      <button type="button" data-testid="fork-toggle" onClick={onForkToggle}>
        fork
      </button>
      <button type="button" data-testid="fork-close" onClick={onForkClose}>
        close fork
      </button>
      <button
        type="button"
        data-testid="forked"
        onClick={() => onForked('forked-mtg')}
      >
        forked
      </button>
    </div>
  ),
}));

vi.mock('./MeetingsDetailBody', () => ({
  default: ({
    selectedId,
    detailError,
    detail,
    onNavigate,
  }: {
    selectedId: string | null;
    detailError: string | null;
    detail: unknown;
    lineage: unknown;
    recap: unknown;
    actions: unknown;
    onNavigate: (id: string) => void;
  }) => (
    <div
      data-testid="detail-body"
      data-selected={selectedId ?? ''}
      data-error={detailError ?? ''}
      data-has-detail={detail ? 'true' : 'false'}
    >
      <button
        type="button"
        data-testid="body-navigate"
        onClick={() => onNavigate('via-body')}
      >
        navigate
      </button>
    </div>
  ),
}));

import MeetingsView from './MeetingsView';

const SAMPLE: MeetingSummary[] = [
  {
    id: 'mtg-list-1',
    status: 'in-progress',
    track: 'standard',
    title: 'Hook integration plan',
    currentStage: 'discuss',
    currentRound: 1,
    createdAt: '2026-05-01T00:00:00Z',
    startedAt: '2026-05-01T00:01:00Z',
    completedAt: null,
  },
  {
    id: 'mtg-list-2',
    status: 'completed',
    track: 'lightweight',
    title: 'Telemetry handover',
    currentStage: 'final',
    currentRound: 3,
    createdAt: '2026-04-29T00:00:00Z',
    startedAt: '2026-04-29T00:01:00Z',
    completedAt: '2026-04-29T01:00:00Z',
  },
];

beforeEach(() => {
  setLocale('en');
  refreshMock.mockReset();
  refreshMock.mockResolvedValue(undefined);
  listResult = {
    data: { meetings: SAMPLE, count: SAMPLE.length },
    error: null,
    loading: false,
    refresh: refreshMock,
  };
  searchResult = {
    searchResults: null,
    searchFacets: null,
    searchTotal: null,
    searchError: null,
    searching: false,
  };
  detailResult = { detail: null, detailError: null, streaming: false };
  enrichmentResult = { lineage: null, actions: null, recap: null };
  stuckResult = null;
});

describe('<MeetingsView>', () => {
  it('renders the StuckBanner with null stuck data by default', () => {
    render(<MeetingsView />);
    expect(screen.getByTestId('stuck-banner')).toHaveAttribute(
      'data-has-stuck',
      'false',
    );
  });

  it('forwards the stuck poll response into the StuckBanner when present', () => {
    stuckResult = { meetings: [] };
    render(<MeetingsView />);
    expect(screen.getByTestId('stuck-banner')).toHaveAttribute(
      'data-has-stuck',
      'true',
    );
  });

  it('renders the master pane list with the hook meetings', () => {
    render(<MeetingsView />);
    const list = screen.getByTestId('list');
    expect(list).toHaveAttribute('data-list-len', String(SAMPLE.length));
    expect(list).toHaveAttribute('data-search-mode', 'false');
  });

  it('switches the list to search-mode when the search hook returns results', () => {
    searchResult = {
      ...searchResult,
      searchResults: [SAMPLE[0]],
      searchTotal: 1,
    };
    render(<MeetingsView />);
    const list = screen.getByTestId('list');
    expect(list).toHaveAttribute('data-search-mode', 'true');
    expect(list).toHaveAttribute('data-list-len', '1');
  });

  it('passes the loading flag from the meetings-list hook through to the header', () => {
    listResult = { ...listResult, loading: true };
    render(<MeetingsView />);
    expect(screen.getByTestId('list-card-header')).toHaveAttribute(
      'data-loading',
      'true',
    );
  });

  it('starts with creating=false on the header', () => {
    render(<MeetingsView />);
    expect(screen.getByTestId('list-card-header')).toHaveAttribute(
      'data-creating',
      'false',
    );
  });

  it('flips creating to true when the header fires onToggleCreating', async () => {
    const user = userEvent.setup();
    render(<MeetingsView />);
    await user.click(screen.getByTestId('toggle-creating'));
    expect(screen.getByTestId('list-card-header')).toHaveAttribute(
      'data-creating',
      'true',
    );
  });

  it('refreshes the list when the header fires onRefresh', async () => {
    const user = userEvent.setup();
    render(<MeetingsView />);
    await user.click(screen.getByTestId('refresh'));
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('refreshes the list when the maintenance panel fires onPruned', async () => {
    const user = userEvent.setup();
    render(<MeetingsView />);
    await user.click(screen.getByTestId('prune'));
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('drives the selected meeting when a list row is clicked', async () => {
    const user = userEvent.setup();
    render(<MeetingsView />);
    expect(screen.getByTestId('list')).toHaveAttribute('data-selected', '');
    await user.click(screen.getByTestId('row-mtg-list-1'));
    expect(screen.getByTestId('list')).toHaveAttribute(
      'data-selected',
      'mtg-list-1',
    );
  });

  it('renders the placeholder title in the detail header when no meeting is picked', () => {
    render(<MeetingsView />);
    expect(screen.getByTestId('detail-card-header')).toHaveAttribute(
      'data-title',
      'Select a meeting',
    );
  });

  it('uses the selected meeting title in the detail header after selection', async () => {
    const user = userEvent.setup();
    render(<MeetingsView />);
    await user.click(screen.getByTestId('row-mtg-list-2'));
    expect(screen.getByTestId('detail-card-header')).toHaveAttribute(
      'data-title',
      'Telemetry handover',
    );
  });

  it('updates the detail card header selectedId data-attr after selection', async () => {
    const user = userEvent.setup();
    render(<MeetingsView />);
    await user.click(screen.getByTestId('row-mtg-list-1'));
    expect(screen.getByTestId('detail-card-header')).toHaveAttribute(
      'data-selected',
      'mtg-list-1',
    );
    expect(screen.getByTestId('detail-body')).toHaveAttribute(
      'data-selected',
      'mtg-list-1',
    );
  });

  it('forwards streaming=true from the detail-stream hook to the header', () => {
    detailResult = { ...detailResult, streaming: true };
    render(<MeetingsView />);
    expect(screen.getByTestId('detail-card-header')).toHaveAttribute(
      'data-streaming',
      'true',
    );
  });

  it('forwards a detail payload presence flag through to the detail-body', () => {
    detailResult = {
      ...detailResult,
      detail: { id: 'has-detail' },
    };
    render(<MeetingsView />);
    expect(screen.getByTestId('detail-body')).toHaveAttribute(
      'data-has-detail',
      'true',
    );
  });

  it('forwards the detail error from the stream hook to the detail-body', () => {
    detailResult = { ...detailResult, detailError: 'detail fetch failed' };
    render(<MeetingsView />);
    expect(screen.getByTestId('detail-body')).toHaveAttribute(
      'data-error',
      'detail fetch failed',
    );
  });

  it('clears the selection when the stuck banner navigates to a stuck id', async () => {
    const user = userEvent.setup();
    render(<MeetingsView />);
    await user.click(screen.getByTestId('stuck-navigate'));
    expect(screen.getByTestId('list')).toHaveAttribute(
      'data-selected',
      'stuck-id',
    );
  });

  it('changes the selection when the detail body fires onNavigate', async () => {
    const user = userEvent.setup();
    render(<MeetingsView />);
    await user.click(screen.getByTestId('body-navigate'));
    expect(screen.getByTestId('list')).toHaveAttribute(
      'data-selected',
      'via-body',
    );
  });

  it('flips contribOpen on the detail-card-header when its toggle is fired', async () => {
    const user = userEvent.setup();
    render(<MeetingsView />);
    expect(screen.getByTestId('detail-card-header')).toHaveAttribute(
      'data-contrib-open',
      'false',
    );
    await user.click(screen.getByTestId('contrib-toggle'));
    expect(screen.getByTestId('detail-card-header')).toHaveAttribute(
      'data-contrib-open',
      'true',
    );
  });

  it('flips forkOpen on the detail-card-header when its toggle is fired', async () => {
    const user = userEvent.setup();
    render(<MeetingsView />);
    expect(screen.getByTestId('detail-card-header')).toHaveAttribute(
      'data-fork-open',
      'false',
    );
    await user.click(screen.getByTestId('fork-toggle'));
    expect(screen.getByTestId('detail-card-header')).toHaveAttribute(
      'data-fork-open',
      'true',
    );
  });

  it('refreshes the list and selects the new id when a fork completes', async () => {
    const user = userEvent.setup();
    render(<MeetingsView />);
    await user.click(screen.getByTestId('forked'));
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('list')).toHaveAttribute(
      'data-selected',
      'forked-mtg',
    );
  });

  it('drives the list filters through the list-card-header callbacks', async () => {
    const user = userEvent.setup();
    render(<MeetingsView />);
    await user.click(screen.getByTestId('set-list-status'));
    await user.click(screen.getByTestId('set-list-track'));
    const header = screen.getByTestId('list-card-header');
    expect(header).toHaveAttribute('data-list-status', 'completed');
    expect(header).toHaveAttribute('data-list-track', 'standard');
  });

  it('drives the search query + filters through the list-card-header callbacks', async () => {
    const user = userEvent.setup();
    render(<MeetingsView />);
    await user.click(screen.getByTestId('set-search-query'));
    await user.click(screen.getByTestId('set-search-status'));
    await user.click(screen.getByTestId('set-search-track'));
    await user.click(screen.getByTestId('set-search-since'));
    await user.click(screen.getByTestId('set-search-until'));
    const header = screen.getByTestId('list-card-header');
    expect(header).toHaveAttribute('data-search-query', 'auth');
    expect(header).toHaveAttribute('data-search-status', 'in-progress');
    expect(header).toHaveAttribute('data-search-track', 'full');
    expect(header).toHaveAttribute('data-search-since', '2026-05-01');
    expect(header).toHaveAttribute('data-search-until', '2026-05-05');
  });

  it('forwards the searching flag from the search hook to the list-card-header', () => {
    searchResult = { ...searchResult, searching: true };
    render(<MeetingsView />);
    expect(screen.getByTestId('list-card-header')).toHaveAttribute(
      'data-searching',
      'true',
    );
  });

  it('refreshes the list and switches selection when the composer creates a meeting', async () => {
    const user = userEvent.setup();
    render(<MeetingsView />);
    await user.click(screen.getByTestId('toggle-creating'));
    await user.click(screen.getByTestId('created-composer'));
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('list')).toHaveAttribute(
      'data-selected',
      'new-mtg',
    );
    expect(screen.getByTestId('list-card-header')).toHaveAttribute(
      'data-creating',
      'false',
    );
  });

  it('flips creating to false when the composer fires onClose', async () => {
    const user = userEvent.setup();
    render(<MeetingsView />);
    await user.click(screen.getByTestId('toggle-creating'));
    expect(screen.getByTestId('list-card-header')).toHaveAttribute(
      'data-creating',
      'true',
    );
    await user.click(screen.getByTestId('close-composer'));
    expect(screen.getByTestId('list-card-header')).toHaveAttribute(
      'data-creating',
      'false',
    );
  });

  it('renders the outer flex layout container', () => {
    const { container } = render(<MeetingsView />);
    const root = container.firstChild as HTMLElement;
    expect(root).toHaveClass('flex');
    expect(root).toHaveClass('flex-col');
    expect(root).toHaveClass('overflow-hidden');
  });

  it('renders the maintenance panel under the master pane', () => {
    render(<MeetingsView />);
    expect(screen.getByTestId('maintenance-panel')).toBeInTheDocument();
  });

  it('re-renders translated copy when the locale flips to ko', () => {
    render(<MeetingsView />);
    expect(screen.getByTestId('detail-card-header')).toHaveAttribute(
      'data-title',
      'Select a meeting',
    );
    act(() => {
      setLocale('ko');
    });
    expect(screen.getByTestId('detail-card-header')).not.toHaveAttribute(
      'data-title',
      'Select a meeting',
    );
  });
});
