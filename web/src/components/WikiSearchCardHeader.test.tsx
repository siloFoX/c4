import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';

// (v1.11.110) WikiSearchCardHeader is a thin composite: title +
// WikiSearchControls + WikiBulkPublishRow inside a CardHeader.
// Both children own their own tests (WikiSearchControls.test +
// WikiBulkPublishRow.test). Render marker stubs so this test asserts
// composition + prop wiring + the bulkMsg / failed pass-through
// without re-exercising the controls/publish row internals.
// Mirrors v1.11.105 MeetingsDetailCardHeader marker-stub pattern.

vi.mock('./WikiSearchControls', () => ({
  default: ({
    query,
    type,
    includeStale,
    searching,
    onQuery,
    onType,
    onIncludeStale,
    onSearch,
  }: {
    query: string;
    type: string;
    includeStale: boolean;
    searching: boolean;
    onQuery: (next: string) => void;
    onType: (next: string) => void;
    onIncludeStale: (next: boolean) => void;
    onSearch: () => void;
  }) => (
    <div
      data-testid="wiki-search-controls"
      data-query={query}
      data-type={type}
      data-include-stale={includeStale ? 'true' : 'false'}
      data-searching={searching ? 'true' : 'false'}
    >
      <button
        type="button"
        data-testid="controls-query"
        onClick={() => onQuery('q-next')}
      >
        q
      </button>
      <button
        type="button"
        data-testid="controls-type"
        onClick={() => onType('t-next')}
      >
        t
      </button>
      <button
        type="button"
        data-testid="controls-stale"
        onClick={() => onIncludeStale(true)}
      >
        s
      </button>
      <button
        type="button"
        data-testid="controls-search"
        onClick={onSearch}
      >
        go
      </button>
    </div>
  ),
}));

vi.mock('./WikiBulkPublishRow', () => ({
  default: ({
    busy,
    gitCommit,
    gitPush,
    msg,
    failed,
    onGitCommit,
    onGitPush,
    onPublish,
  }: {
    busy: boolean;
    gitCommit: boolean;
    gitPush: boolean;
    msg: string | null;
    failed: boolean;
    onGitCommit: (next: boolean) => void;
    onGitPush: (next: boolean) => void;
    onPublish: () => void;
  }) => (
    <div
      data-testid="wiki-bulk-publish"
      data-busy={busy ? 'true' : 'false'}
      data-git-commit={gitCommit ? 'true' : 'false'}
      data-git-push={gitPush ? 'true' : 'false'}
      data-msg={msg ?? ''}
      data-failed={failed ? 'true' : 'false'}
    >
      <button
        type="button"
        data-testid="bulk-commit"
        onClick={() => onGitCommit(true)}
      >
        commit
      </button>
      <button
        type="button"
        data-testid="bulk-push"
        onClick={() => onGitPush(true)}
      >
        push
      </button>
      <button type="button" data-testid="bulk-publish" onClick={onPublish}>
        publish
      </button>
    </div>
  ),
}));

import WikiSearchCardHeader from './WikiSearchCardHeader';

function renderHeader(
  over: Partial<Parameters<typeof WikiSearchCardHeader>[0]> = {},
) {
  const props = {
    query: '',
    onQuery: vi.fn(),
    type: 'any',
    onType: vi.fn(),
    includeStale: false,
    onIncludeStale: vi.fn(),
    searching: false,
    onSearch: vi.fn(),
    bulkBusy: false,
    bulkGitCommit: false,
    bulkGitPush: false,
    bulkMsg: null as string | null,
    bulkFailed: false,
    onBulkGitCommit: vi.fn(),
    onBulkGitPush: vi.fn(),
    onBulkPublish: vi.fn(),
    ...over,
  };
  const utils = render(<WikiSearchCardHeader {...props} />);
  return { ...utils, props };
}

beforeEach(() => {
  setLocale('en');
});

describe('<WikiSearchCardHeader>', () => {
  // ---- idle render ----------------------------------------------

  it('renders the localized "Wiki" CardTitle', () => {
    renderHeader();
    expect(screen.getByText('Wiki')).toBeInTheDocument();
  });

  it('renders the WikiSearchControls child marker', () => {
    renderHeader();
    expect(screen.getByTestId('wiki-search-controls')).toBeInTheDocument();
  });

  it('renders the WikiBulkPublishRow child marker', () => {
    renderHeader();
    expect(screen.getByTestId('wiki-bulk-publish')).toBeInTheDocument();
  });

  it('wraps everything in a CardHeader with the border-b utility class', () => {
    const { container } = renderHeader();
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('border-b');
    expect(wrapper).toHaveClass('flex-col');
  });

  // ---- search-control prop forwarding ---------------------------

  it('forwards query / type / includeStale / searching into WikiSearchControls', () => {
    renderHeader({
      query: 'foo',
      type: 'adr',
      includeStale: true,
      searching: true,
    });
    const controls = screen.getByTestId('wiki-search-controls');
    expect(controls).toHaveAttribute('data-query', 'foo');
    expect(controls).toHaveAttribute('data-type', 'adr');
    expect(controls).toHaveAttribute('data-include-stale', 'true');
    expect(controls).toHaveAttribute('data-searching', 'true');
  });

  it('forwards default search-control values when no overrides provided', () => {
    renderHeader();
    const controls = screen.getByTestId('wiki-search-controls');
    expect(controls).toHaveAttribute('data-query', '');
    expect(controls).toHaveAttribute('data-type', 'any');
    expect(controls).toHaveAttribute('data-include-stale', 'false');
    expect(controls).toHaveAttribute('data-searching', 'false');
  });

  // ---- search-control callbacks --------------------------------

  it('fires onQuery when the WikiSearchControls onQuery marker triggers', async () => {
    const user = userEvent.setup();
    const onQuery = vi.fn();
    renderHeader({ onQuery });
    await user.click(screen.getByTestId('controls-query'));
    expect(onQuery).toHaveBeenCalledTimes(1);
    expect(onQuery).toHaveBeenCalledWith('q-next');
  });

  it('fires onType when the WikiSearchControls onType marker triggers', async () => {
    const user = userEvent.setup();
    const onType = vi.fn();
    renderHeader({ onType });
    await user.click(screen.getByTestId('controls-type'));
    expect(onType).toHaveBeenCalledTimes(1);
    expect(onType).toHaveBeenCalledWith('t-next');
  });

  it('fires onIncludeStale when the WikiSearchControls onIncludeStale marker triggers', async () => {
    const user = userEvent.setup();
    const onIncludeStale = vi.fn();
    renderHeader({ onIncludeStale });
    await user.click(screen.getByTestId('controls-stale'));
    expect(onIncludeStale).toHaveBeenCalledTimes(1);
    expect(onIncludeStale).toHaveBeenCalledWith(true);
  });

  it('fires onSearch when the WikiSearchControls onSearch marker triggers', async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    renderHeader({ onSearch });
    await user.click(screen.getByTestId('controls-search'));
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  // ---- bulk-publish prop forwarding -----------------------------

  it('forwards bulkBusy / bulkGitCommit / bulkGitPush into WikiBulkPublishRow', () => {
    renderHeader({
      bulkBusy: true,
      bulkGitCommit: true,
      bulkGitPush: true,
    });
    const bulk = screen.getByTestId('wiki-bulk-publish');
    expect(bulk).toHaveAttribute('data-busy', 'true');
    expect(bulk).toHaveAttribute('data-git-commit', 'true');
    expect(bulk).toHaveAttribute('data-git-push', 'true');
  });

  it('forwards default bulk-publish values when no overrides provided', () => {
    renderHeader();
    const bulk = screen.getByTestId('wiki-bulk-publish');
    expect(bulk).toHaveAttribute('data-busy', 'false');
    expect(bulk).toHaveAttribute('data-git-commit', 'false');
    expect(bulk).toHaveAttribute('data-git-push', 'false');
    expect(bulk).toHaveAttribute('data-msg', '');
    expect(bulk).toHaveAttribute('data-failed', 'false');
  });

  it('forwards a non-null bulkMsg into WikiBulkPublishRow', () => {
    renderHeader({ bulkMsg: 'published 3 pages' });
    expect(screen.getByTestId('wiki-bulk-publish')).toHaveAttribute(
      'data-msg',
      'published 3 pages',
    );
  });

  it('forwards bulkFailed=true into WikiBulkPublishRow', () => {
    renderHeader({ bulkFailed: true, bulkMsg: 'publish failed' });
    const bulk = screen.getByTestId('wiki-bulk-publish');
    expect(bulk).toHaveAttribute('data-failed', 'true');
    expect(bulk).toHaveAttribute('data-msg', 'publish failed');
  });

  // ---- bulk-publish callbacks -----------------------------------

  it('fires onBulkGitCommit when the bulk-commit marker triggers', async () => {
    const user = userEvent.setup();
    const onBulkGitCommit = vi.fn();
    renderHeader({ onBulkGitCommit });
    await user.click(screen.getByTestId('bulk-commit'));
    expect(onBulkGitCommit).toHaveBeenCalledTimes(1);
    expect(onBulkGitCommit).toHaveBeenCalledWith(true);
  });

  it('fires onBulkGitPush when the bulk-push marker triggers', async () => {
    const user = userEvent.setup();
    const onBulkGitPush = vi.fn();
    renderHeader({ onBulkGitPush });
    await user.click(screen.getByTestId('bulk-push'));
    expect(onBulkGitPush).toHaveBeenCalledTimes(1);
    expect(onBulkGitPush).toHaveBeenCalledWith(true);
  });

  it('fires onBulkPublish when the bulk-publish marker triggers', async () => {
    const user = userEvent.setup();
    const onBulkPublish = vi.fn();
    renderHeader({ onBulkPublish });
    await user.click(screen.getByTestId('bulk-publish'));
    expect(onBulkPublish).toHaveBeenCalledTimes(1);
  });

  // ---- callbacks isolated to each child -------------------------

  it('does not fire any callback on initial render', () => {
    const onQuery = vi.fn();
    const onType = vi.fn();
    const onIncludeStale = vi.fn();
    const onSearch = vi.fn();
    const onBulkGitCommit = vi.fn();
    const onBulkGitPush = vi.fn();
    const onBulkPublish = vi.fn();
    renderHeader({
      onQuery,
      onType,
      onIncludeStale,
      onSearch,
      onBulkGitCommit,
      onBulkGitPush,
      onBulkPublish,
    });
    expect(onQuery).not.toHaveBeenCalled();
    expect(onType).not.toHaveBeenCalled();
    expect(onIncludeStale).not.toHaveBeenCalled();
    expect(onSearch).not.toHaveBeenCalled();
    expect(onBulkGitCommit).not.toHaveBeenCalled();
    expect(onBulkGitPush).not.toHaveBeenCalled();
    expect(onBulkPublish).not.toHaveBeenCalled();
  });

  // ---- locale flip ----------------------------------------------

  it('drops the English "Wiki" title when the locale flips to ko', () => {
    renderHeader();
    expect(screen.getByText('Wiki')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('Wiki')).not.toBeInTheDocument();
  });

  it('keeps both child markers mounted after a locale flip', () => {
    renderHeader();
    act(() => {
      setLocale('ko');
    });
    expect(screen.getByTestId('wiki-search-controls')).toBeInTheDocument();
    expect(screen.getByTestId('wiki-bulk-publish')).toBeInTheDocument();
  });
});
