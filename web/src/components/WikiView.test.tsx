import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type { ReadResponse, SearchResponse } from './WikiView';

// WikiView wires four hooks (use-wiki-search, use-wiki-page,
// use-wiki-reopen, use-wiki-bulk-publish) + four sibling
// components (WikiSearchCardHeader, WikiSearchResults,
// WikiPageDetailHeader, WikiPageDetail). Stub every hook to a
// deterministic shape so each test drives a single branch
// without booting fetch / EventSource / window.confirm. Stub
// every child to a marker that surfaces props via data-* and
// fires callbacks via test buttons.

const setQueryMock = vi.fn();
const setTypeMock = vi.fn();
const setIncludeStaleMock = vi.fn();
const runSearchMock = vi.fn(async () => {});
const setPageMock = vi.fn();
const handleReopenMock = vi.fn(async () => {});
const toggleBulkGitCommitMock = vi.fn();
const toggleBulkGitPushMock = vi.fn();
const handleBulkPublishMock = vi.fn(async () => {});

let searchState: {
  query: string;
  type: string;
  includeStale: boolean;
  search: SearchResponse | null;
  searchError: string | null;
  searching: boolean;
} = {
  query: '',
  type: 'any',
  includeStale: false,
  search: null,
  searchError: null,
  searching: false,
};

let pageState: { page: ReadResponse | null; pageError: string | null } = {
  page: null,
  pageError: null,
};

let reopenState: {
  reopenBusy: boolean;
  reopenMsg: string | null;
  reopenFailed: boolean;
} = {
  reopenBusy: false,
  reopenMsg: null,
  reopenFailed: false,
};

let bulkState: {
  bulkBusy: boolean;
  bulkMsg: string | null;
  bulkFailed: boolean;
  bulkGitCommit: boolean;
  bulkGitPush: boolean;
} = {
  bulkBusy: false,
  bulkMsg: null,
  bulkFailed: false,
  bulkGitCommit: false,
  bulkGitPush: false,
};

let lastReopenArgs: {
  setPage: (next: ReadResponse | null) => void;
  runSearch: () => Promise<void>;
} | null = null;
let lastBulkArgs: { runSearch: () => Promise<void> } | null = null;
let lastWikiPageArg: string | null | undefined;

vi.mock('../lib/use-wiki-search', () => ({
  useWikiSearch: () => ({
    query: searchState.query,
    setQuery: setQueryMock,
    type: searchState.type,
    setType: setTypeMock,
    includeStale: searchState.includeStale,
    setIncludeStale: setIncludeStaleMock,
    search: searchState.search,
    searchError: searchState.searchError,
    searching: searchState.searching,
    runSearch: runSearchMock,
  }),
}));

vi.mock('../lib/use-wiki-page', () => ({
  useWikiPage: (selectedPath: string | null) => {
    lastWikiPageArg = selectedPath;
    return {
      page: pageState.page,
      setPage: setPageMock,
      pageError: pageState.pageError,
    };
  },
}));

vi.mock('../lib/use-wiki-reopen', () => ({
  useWikiReopen: (args: {
    setPage: (next: ReadResponse | null) => void;
    runSearch: () => Promise<void>;
  }) => {
    lastReopenArgs = args;
    return {
      reopenBusy: reopenState.reopenBusy,
      reopenMsg: reopenState.reopenMsg,
      reopenFailed: reopenState.reopenFailed,
      handleReopen: handleReopenMock,
    };
  },
}));

vi.mock('../lib/use-wiki-bulk-publish', () => ({
  useWikiBulkPublish: (args: { runSearch: () => Promise<void> }) => {
    lastBulkArgs = args;
    return {
      bulkBusy: bulkState.bulkBusy,
      bulkMsg: bulkState.bulkMsg,
      bulkFailed: bulkState.bulkFailed,
      bulkGitCommit: bulkState.bulkGitCommit,
      bulkGitPush: bulkState.bulkGitPush,
      toggleBulkGitCommit: toggleBulkGitCommitMock,
      toggleBulkGitPush: toggleBulkGitPushMock,
      handleBulkPublish: handleBulkPublishMock,
    };
  },
}));

interface CapturedHeaderProps {
  query: string;
  onQuery: (next: string) => void;
  type: string;
  onType: (next: string) => void;
  includeStale: boolean;
  onIncludeStale: (next: boolean) => void;
  searching: boolean;
  onSearch: () => void;
  bulkBusy: boolean;
  bulkGitCommit: boolean;
  bulkGitPush: boolean;
  bulkMsg: string | null;
  bulkFailed: boolean;
  onBulkGitCommit: (next: boolean) => void;
  onBulkGitPush: (next: boolean) => void;
  onBulkPublish: () => void;
}

let lastHeaderProps: CapturedHeaderProps | null = null;

vi.mock('./WikiSearchCardHeader', () => ({
  default: (props: CapturedHeaderProps) => {
    lastHeaderProps = props;
    return (
      <div
        data-testid="search-header"
        data-query={props.query}
        data-type={props.type}
        data-include-stale={props.includeStale ? 'true' : 'false'}
        data-searching={props.searching ? 'true' : 'false'}
        data-bulk-busy={props.bulkBusy ? 'true' : 'false'}
        data-bulk-commit={props.bulkGitCommit ? 'true' : 'false'}
        data-bulk-push={props.bulkGitPush ? 'true' : 'false'}
        data-bulk-msg={props.bulkMsg ?? ''}
        data-bulk-failed={props.bulkFailed ? 'true' : 'false'}
      >
        <button
          type="button"
          data-testid="hdr-query"
          onClick={() => props.onQuery('hello')}
        >
          q
        </button>
        <button
          type="button"
          data-testid="hdr-type"
          onClick={() => props.onType('meeting')}
        >
          t
        </button>
        <button
          type="button"
          data-testid="hdr-stale"
          onClick={() => props.onIncludeStale(true)}
        >
          s
        </button>
        <button
          type="button"
          data-testid="hdr-search"
          onClick={props.onSearch}
        >
          search
        </button>
        <button
          type="button"
          data-testid="hdr-bulk-commit"
          onClick={() => props.onBulkGitCommit(true)}
        >
          commit
        </button>
        <button
          type="button"
          data-testid="hdr-bulk-push"
          onClick={() => props.onBulkGitPush(true)}
        >
          push
        </button>
        <button
          type="button"
          data-testid="hdr-bulk-publish"
          onClick={props.onBulkPublish}
        >
          publish
        </button>
      </div>
    );
  },
}));

interface CapturedResultsProps {
  search: SearchResponse | null;
  searchError: string | null;
  selectedPath: string | null;
  onSelect: (path: string | null) => void;
}

let lastResultsProps: CapturedResultsProps | null = null;

vi.mock('./WikiSearchResults', () => ({
  default: (props: CapturedResultsProps) => {
    lastResultsProps = props;
    return (
      <div
        data-testid="results"
        data-hits={String(props.search?.hits.length ?? 0)}
        data-error={props.searchError ?? ''}
        data-selected={props.selectedPath ?? ''}
      >
        <button
          type="button"
          data-testid="results-select"
          onClick={() => props.onSelect('docs/foo.md')}
        >
          sel
        </button>
        <button
          type="button"
          data-testid="results-clear"
          onClick={() => props.onSelect(null)}
        >
          clr
        </button>
      </div>
    );
  },
}));

interface CapturedDetailHeaderProps {
  page: ReadResponse | null;
  selectedPath: string | null;
  reopenBusy: boolean;
  reopenMsg: string | null;
  reopenFailed: boolean;
  onReopen: (relPath: string) => void;
}

let lastDetailHeaderProps: CapturedDetailHeaderProps | null = null;

vi.mock('./WikiPageDetailHeader', () => ({
  default: (props: CapturedDetailHeaderProps) => {
    lastDetailHeaderProps = props;
    return (
      <div
        data-testid="detail-header"
        data-selected={props.selectedPath ?? ''}
        data-page-path={props.page?.path ?? ''}
        data-reopen-busy={props.reopenBusy ? 'true' : 'false'}
        data-reopen-msg={props.reopenMsg ?? ''}
        data-reopen-failed={props.reopenFailed ? 'true' : 'false'}
      >
        <button
          type="button"
          data-testid="detail-reopen"
          onClick={() => props.onReopen('docs/foo.md')}
        >
          reopen
        </button>
      </div>
    );
  },
}));

interface CapturedDetailProps {
  selectedPath: string | null;
  page: ReadResponse | null;
  pageError: string | null;
  onSelectPath: (next: string | null) => void;
}

let lastDetailProps: CapturedDetailProps | null = null;

vi.mock('./WikiPageDetail', () => ({
  default: (props: CapturedDetailProps) => {
    lastDetailProps = props;
    return (
      <div
        data-testid="detail"
        data-selected={props.selectedPath ?? ''}
        data-page-path={props.page?.path ?? ''}
        data-error={props.pageError ?? ''}
      >
        <button
          type="button"
          data-testid="detail-select-other"
          onClick={() => props.onSelectPath('docs/bar.md')}
        >
          other
        </button>
      </div>
    );
  },
}));

import WikiView from './WikiView';

const SAMPLE_SEARCH: SearchResponse = {
  wikiRoot: '/w',
  query: '',
  type: 'any',
  total: 1,
  hits: [
    {
      path: 'docs/foo.md',
      title: 'Foo',
      type: 'docs',
      status: null,
      meetingId: null,
      adr: null,
      lastReviewed: null,
      related: [],
      score: 1,
      snippet: 'snip',
    },
  ],
};

const SAMPLE_PAGE: ReadResponse = {
  path: 'docs/foo.md',
  absolutePath: '/w/docs/foo.md',
  frontmatter: { title: 'Foo' },
  body: 'body',
  raw: '---\ntitle: Foo\n---\nbody',
};

beforeEach(() => {
  setLocale('en');
  setQueryMock.mockReset();
  setTypeMock.mockReset();
  setIncludeStaleMock.mockReset();
  runSearchMock.mockReset();
  runSearchMock.mockResolvedValue(undefined);
  setPageMock.mockReset();
  handleReopenMock.mockReset();
  handleReopenMock.mockResolvedValue(undefined);
  toggleBulkGitCommitMock.mockReset();
  toggleBulkGitPushMock.mockReset();
  handleBulkPublishMock.mockReset();
  handleBulkPublishMock.mockResolvedValue(undefined);
  searchState = {
    query: '',
    type: 'any',
    includeStale: false,
    search: SAMPLE_SEARCH,
    searchError: null,
    searching: false,
  };
  pageState = { page: null, pageError: null };
  reopenState = { reopenBusy: false, reopenMsg: null, reopenFailed: false };
  bulkState = {
    bulkBusy: false,
    bulkMsg: null,
    bulkFailed: false,
    bulkGitCommit: false,
    bulkGitPush: false,
  };
  lastHeaderProps = null;
  lastResultsProps = null;
  lastDetailHeaderProps = null;
  lastDetailProps = null;
  lastReopenArgs = null;
  lastBulkArgs = null;
  lastWikiPageArg = undefined;
});

describe('<WikiView>', () => {
  it('mounts the four primary children on default render', () => {
    render(<WikiView />);
    expect(screen.getByTestId('search-header')).toBeInTheDocument();
    expect(screen.getByTestId('results')).toBeInTheDocument();
    expect(screen.getByTestId('detail-header')).toBeInTheDocument();
    expect(screen.getByTestId('detail')).toBeInTheDocument();
  });

  it('forwards the search hook query/type/includeStale into the header', () => {
    searchState = {
      ...searchState,
      query: 'foo',
      type: 'meeting',
      includeStale: true,
    };
    render(<WikiView />);
    const hdr = screen.getByTestId('search-header');
    expect(hdr).toHaveAttribute('data-query', 'foo');
    expect(hdr).toHaveAttribute('data-type', 'meeting');
    expect(hdr).toHaveAttribute('data-include-stale', 'true');
  });

  it('forwards the searching flag into the header', () => {
    searchState = { ...searchState, searching: true };
    render(<WikiView />);
    expect(screen.getByTestId('search-header')).toHaveAttribute(
      'data-searching',
      'true',
    );
  });

  it('drives the header onQuery callback through to the search hook setter', async () => {
    const user = userEvent.setup();
    render(<WikiView />);
    await user.click(screen.getByTestId('hdr-query'));
    expect(setQueryMock).toHaveBeenCalledTimes(1);
    expect(setQueryMock).toHaveBeenCalledWith('hello');
  });

  it('drives the header onType callback through to the search hook setter', async () => {
    const user = userEvent.setup();
    render(<WikiView />);
    await user.click(screen.getByTestId('hdr-type'));
    expect(setTypeMock).toHaveBeenCalledWith('meeting');
  });

  it('drives the header onIncludeStale callback through to the search hook setter', async () => {
    const user = userEvent.setup();
    render(<WikiView />);
    await user.click(screen.getByTestId('hdr-stale'));
    expect(setIncludeStaleMock).toHaveBeenCalledWith(true);
  });

  it('drives the header onSearch through to runSearch', async () => {
    const user = userEvent.setup();
    render(<WikiView />);
    await user.click(screen.getByTestId('hdr-search'));
    expect(runSearchMock).toHaveBeenCalledTimes(1);
  });

  it('forwards the bulk publish state into the header', () => {
    bulkState = {
      bulkBusy: true,
      bulkMsg: 'done',
      bulkFailed: true,
      bulkGitCommit: true,
      bulkGitPush: true,
    };
    render(<WikiView />);
    const hdr = screen.getByTestId('search-header');
    expect(hdr).toHaveAttribute('data-bulk-busy', 'true');
    expect(hdr).toHaveAttribute('data-bulk-msg', 'done');
    expect(hdr).toHaveAttribute('data-bulk-failed', 'true');
    expect(hdr).toHaveAttribute('data-bulk-commit', 'true');
    expect(hdr).toHaveAttribute('data-bulk-push', 'true');
  });

  it('drives the bulk commit toggle through to the hook', async () => {
    const user = userEvent.setup();
    render(<WikiView />);
    await user.click(screen.getByTestId('hdr-bulk-commit'));
    expect(toggleBulkGitCommitMock).toHaveBeenCalledWith(true);
  });

  it('drives the bulk push toggle through to the hook', async () => {
    const user = userEvent.setup();
    render(<WikiView />);
    await user.click(screen.getByTestId('hdr-bulk-push'));
    expect(toggleBulkGitPushMock).toHaveBeenCalledWith(true);
  });

  it('drives the bulk publish action through to the hook', async () => {
    const user = userEvent.setup();
    render(<WikiView />);
    await user.click(screen.getByTestId('hdr-bulk-publish'));
    expect(handleBulkPublishMock).toHaveBeenCalledTimes(1);
  });

  it('forwards the hits + search error + initial null selection into the results pane', () => {
    searchState = { ...searchState, searchError: 'oops' };
    render(<WikiView />);
    const r = screen.getByTestId('results');
    expect(r).toHaveAttribute('data-hits', '1');
    expect(r).toHaveAttribute('data-error', 'oops');
    expect(r).toHaveAttribute('data-selected', '');
  });

  it('updates selectedPath when the results pane fires onSelect', async () => {
    const user = userEvent.setup();
    render(<WikiView />);
    await user.click(screen.getByTestId('results-select'));
    expect(screen.getByTestId('results')).toHaveAttribute(
      'data-selected',
      'docs/foo.md',
    );
    expect(screen.getByTestId('detail-header')).toHaveAttribute(
      'data-selected',
      'docs/foo.md',
    );
    expect(screen.getByTestId('detail')).toHaveAttribute(
      'data-selected',
      'docs/foo.md',
    );
  });

  it('passes the selectedPath into the use-wiki-page hook', async () => {
    const user = userEvent.setup();
    render(<WikiView />);
    expect(lastWikiPageArg).toBeNull();
    await user.click(screen.getByTestId('results-select'));
    expect(lastWikiPageArg).toBe('docs/foo.md');
  });

  it('lets the detail pane drive the selected path via onSelectPath', async () => {
    const user = userEvent.setup();
    render(<WikiView />);
    await user.click(screen.getByTestId('detail-select-other'));
    expect(screen.getByTestId('detail')).toHaveAttribute(
      'data-selected',
      'docs/bar.md',
    );
  });

  it('clears the selection when results pane fires onSelect(null)', async () => {
    const user = userEvent.setup();
    render(<WikiView />);
    await user.click(screen.getByTestId('results-select'));
    await user.click(screen.getByTestId('results-clear'));
    expect(screen.getByTestId('results')).toHaveAttribute('data-selected', '');
  });

  it('forwards the page + pageError into the detail pane', () => {
    pageState = { page: SAMPLE_PAGE, pageError: 'broken' };
    render(<WikiView />);
    expect(screen.getByTestId('detail')).toHaveAttribute(
      'data-page-path',
      'docs/foo.md',
    );
    expect(screen.getByTestId('detail')).toHaveAttribute(
      'data-error',
      'broken',
    );
  });

  it('forwards the page + reopen state into the detail header', () => {
    pageState = { page: SAMPLE_PAGE, pageError: null };
    reopenState = { reopenBusy: true, reopenMsg: 'ok', reopenFailed: false };
    render(<WikiView />);
    const dh = screen.getByTestId('detail-header');
    expect(dh).toHaveAttribute('data-page-path', 'docs/foo.md');
    expect(dh).toHaveAttribute('data-reopen-busy', 'true');
    expect(dh).toHaveAttribute('data-reopen-msg', 'ok');
    expect(dh).toHaveAttribute('data-reopen-failed', 'false');
  });

  it('drives the detail header reopen through to handleReopen', async () => {
    const user = userEvent.setup();
    render(<WikiView />);
    await user.click(screen.getByTestId('detail-reopen'));
    expect(handleReopenMock).toHaveBeenCalledTimes(1);
    expect(handleReopenMock).toHaveBeenCalledWith('docs/foo.md');
  });

  it('hands the reopen hook a setPage + runSearch pair from the search hook', () => {
    render(<WikiView />);
    expect(lastReopenArgs).not.toBeNull();
    expect(lastReopenArgs?.setPage).toBe(setPageMock);
    expect(typeof lastReopenArgs?.runSearch).toBe('function');
    act(() => {
      lastReopenArgs?.runSearch();
    });
    expect(runSearchMock).toHaveBeenCalledTimes(1);
  });

  it('hands the bulk-publish hook the same runSearch reference', () => {
    render(<WikiView />);
    expect(lastBulkArgs).not.toBeNull();
    act(() => {
      lastBulkArgs?.runSearch();
    });
    expect(runSearchMock).toHaveBeenCalledTimes(1);
  });

  it('renders the outer split-pane wrapper with the documented flex layout', () => {
    const { container } = render(<WikiView />);
    const root = container.firstChild as HTMLElement;
    expect(root).toHaveClass('flex');
    expect(root).toHaveClass('flex-1');
    expect(root).toHaveClass('overflow-hidden');
  });

  it('re-renders translated children when the locale flips to ko', () => {
    render(<WikiView />);
    act(() => {
      setLocale('ko');
    });
    expect(screen.getByTestId('search-header')).toBeInTheDocument();
    expect(screen.getByTestId('detail-header')).toBeInTheDocument();
  });
});
