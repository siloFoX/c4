import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import WikiSearchResults from './WikiSearchResults';
import type { SearchHit, SearchResponse } from './WikiView';

// WikiSearchResults is pure display. It branches on
// (searchError, search, search.hits.length) and renders the error /
// loading / empty / populated states. No hooks to stub. The "stale"
// marker is the `[status]` chip rendered next to the badge when
// h.status is non-null — the SearchHit interface has no `stale`
// boolean, so we drive the status field directly.

function buildHit(over: Partial<SearchHit> = {}): SearchHit {
  return {
    path: 'docs/foo.md',
    title: 'Foo Page',
    type: 'docs',
    status: null,
    meetingId: null,
    adr: null,
    lastReviewed: null,
    related: [],
    score: 1,
    snippet: 'snippet text',
    ...over,
  };
}

function buildSearch(over: Partial<SearchResponse> = {}): SearchResponse {
  return {
    wikiRoot: '/wiki',
    query: '',
    type: 'any',
    total: 0,
    hits: [],
    ...over,
  };
}

function renderResults(
  overrides: Partial<Parameters<typeof WikiSearchResults>[0]> = {},
) {
  const props = {
    search: null as SearchResponse | null,
    searchError: null as string | null,
    selectedPath: null as string | null,
    onSelect: vi.fn(),
    ...overrides,
  };
  const utils = render(<WikiSearchResults {...props} />);
  return { ...utils, props };
}

beforeEach(() => {
  setLocale('en');
});

describe('<WikiSearchResults>', () => {
  it('renders the search error message when searchError is set', () => {
    renderResults({ searchError: 'index down' });
    expect(screen.getByText('index down')).toBeInTheDocument();
  });

  it('applies the destructive tone to the search error', () => {
    renderResults({ searchError: 'index down' });
    expect(screen.getByText('index down')).toHaveClass('text-destructive');
  });

  it('prefers the error branch over the loading branch when both could fire', () => {
    renderResults({ searchError: 'oops', search: null });
    expect(screen.getByText('oops')).toBeInTheDocument();
    expect(screen.queryByText('Loading wiki…')).not.toBeInTheDocument();
  });

  it('prefers the error branch over the populated branch when both could fire', () => {
    renderResults({
      searchError: 'oops',
      search: buildSearch({ hits: [buildHit()] }),
    });
    expect(screen.getByText('oops')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('renders a skeleton list when search is null and no error', () => {
    // (v1.11.78) Loading copy moved to aria-label on the <Skeleton>
    // wrapper so screen readers still get the hint, while the
    // visual treatment is now the animate-pulse primitive.
    const { container } = renderResults({ search: null, searchError: null });
    const wrap = container.querySelector('[data-wiki-loading="1"]');
    expect(wrap).not.toBeNull();
    expect(wrap?.getAttribute('aria-label')).toBe('Loading wiki…');
    const skeletons = container.querySelectorAll('[role="status"][aria-hidden="true"]');
    expect(skeletons.length).toBe(3);
  });

  it('renders the empty-state message with the wikiRoot when hits is empty', () => {
    renderResults({ search: buildSearch({ wikiRoot: '/my/wiki', hits: [] }) });
    expect(screen.getByText('No matches under /my/wiki.')).toBeInTheDocument();
  });

  it('does not render a list when hits is empty', () => {
    renderResults({ search: buildSearch({ hits: [] }) });
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('renders a list with one item per hit', () => {
    renderResults({
      search: buildSearch({
        hits: [
          buildHit({ path: 'docs/a.md', title: 'A' }),
          buildHit({ path: 'docs/b.md', title: 'B' }),
          buildHit({ path: 'docs/c.md', title: 'C' }),
        ],
      }),
    });
    const list = screen.getByRole('list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
  });

  it('renders the title text of each hit', () => {
    renderResults({
      search: buildSearch({
        hits: [
          buildHit({ path: 'docs/a.md', title: 'Alpha' }),
          buildHit({ path: 'docs/b.md', title: 'Bravo' }),
        ],
      }),
    });
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Bravo')).toBeInTheDocument();
  });

  it('renders the type badge for each hit', () => {
    renderResults({
      search: buildSearch({
        hits: [buildHit({ type: 'adr', path: 'docs/a.md' })],
      }),
    });
    expect(screen.getByText('adr')).toBeInTheDocument();
  });

  it('renders the score prefix from the i18n bundle', () => {
    renderResults({
      search: buildSearch({
        hits: [buildHit({ score: 42, path: 'docs/x.md' })],
      }),
    });
    expect(screen.getByText('score 42')).toBeInTheDocument();
  });

  it('renders the snippet when the hit has one', () => {
    renderResults({
      search: buildSearch({
        hits: [buildHit({ snippet: 'auth flow notes' })],
      }),
    });
    expect(screen.getByText('auth flow notes')).toBeInTheDocument();
  });

  it('omits the snippet element when the hit has an empty snippet', () => {
    const { container } = renderResults({
      search: buildSearch({
        hits: [buildHit({ snippet: '' })],
      }),
    });
    expect(container.querySelector('.line-clamp-2')).toBeNull();
  });

  it('renders the path of each hit', () => {
    renderResults({
      search: buildSearch({
        hits: [buildHit({ path: 'docs/auth/schema.md' })],
      }),
    });
    expect(screen.getByText('docs/auth/schema.md')).toBeInTheDocument();
  });

  it('renders the status chip when the hit has a non-null status (stale marker)', () => {
    renderResults({
      search: buildSearch({
        hits: [buildHit({ status: 'superseded', path: 'docs/old.md' })],
      }),
    });
    expect(screen.getByText('[superseded]')).toBeInTheDocument();
  });

  it('omits the status chip when the hit status is null', () => {
    renderResults({
      search: buildSearch({
        hits: [buildHit({ status: null })],
      }),
    });
    expect(screen.queryByText(/^\[.+\]$/)).not.toBeInTheDocument();
  });

  it('highlights the selected row with the active background class', () => {
    const { container } = renderResults({
      search: buildSearch({
        hits: [
          buildHit({ path: 'docs/a.md', title: 'A' }),
          buildHit({ path: 'docs/b.md', title: 'B' }),
        ],
      }),
      selectedPath: 'docs/b.md',
    });
    const items = container.querySelectorAll('li');
    expect(items[0]).not.toHaveClass('bg-primary/30');
    expect(items[1]).toHaveClass('bg-primary/30');
  });

  it('does not highlight any row when selectedPath is null', () => {
    const { container } = renderResults({
      search: buildSearch({
        hits: [
          buildHit({ path: 'docs/a.md' }),
          buildHit({ path: 'docs/b.md' }),
        ],
      }),
      selectedPath: null,
    });
    container.querySelectorAll('li').forEach((li) => {
      expect(li).not.toHaveClass('bg-primary/30');
    });
  });

  it('fires onSelect with the clicked row path', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderResults({
      search: buildSearch({
        hits: [
          buildHit({ path: 'docs/a.md', title: 'A' }),
          buildHit({ path: 'docs/b.md', title: 'B' }),
        ],
      }),
      onSelect,
    });
    await user.click(screen.getByText('B'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('docs/b.md');
  });

  it('fires onSelect only once when the same row is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderResults({
      search: buildSearch({
        hits: [buildHit({ path: 'docs/a.md', title: 'A' })],
      }),
      onSelect,
    });
    await user.click(screen.getByText('A'));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('forwards the path from any clicked row regardless of selection state', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderResults({
      search: buildSearch({
        hits: [
          buildHit({ path: 'docs/a.md', title: 'A' }),
          buildHit({ path: 'docs/b.md', title: 'B' }),
        ],
      }),
      selectedPath: 'docs/a.md',
      onSelect,
    });
    await user.click(screen.getByText('A'));
    expect(onSelect).toHaveBeenCalledWith('docs/a.md');
  });

  it('does not fire onSelect on initial render', () => {
    const onSelect = vi.fn();
    renderResults({
      search: buildSearch({ hits: [buildHit()] }),
      onSelect,
    });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('rerendering with identical props does not duplicate row clicks', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const props = {
      search: buildSearch({ hits: [buildHit({ path: 'docs/a.md', title: 'A' })] }),
      searchError: null as string | null,
      selectedPath: null as string | null,
      onSelect,
    };
    const { rerender } = render(<WikiSearchResults {...props} />);
    rerender(<WikiSearchResults {...props} />);
    await user.click(screen.getByText('A'));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('re-renders the loading aria-label when the locale flips to ko', () => {
    // (v1.11.78) Loading copy lives on the wrapper aria-label, not
    // inside the visible skeleton.
    const { container } = renderResults({ search: null });
    const wrap = container.querySelector('[data-wiki-loading="1"]');
    expect(wrap?.getAttribute('aria-label')).toBe('Loading wiki…');
    act(() => {
      setLocale('ko');
    });
    const wrapAfter = container.querySelector('[data-wiki-loading="1"]');
    expect(wrapAfter?.getAttribute('aria-label')).not.toBe('Loading wiki…');
  });

  it('renders the score prefix in each row', () => {
    renderResults({
      search: buildSearch({
        hits: [
          buildHit({ path: 'docs/a.md', score: 7 }),
          buildHit({ path: 'docs/b.md', score: 9 }),
        ],
      }),
    });
    expect(screen.getByText('score 7')).toBeInTheDocument();
    expect(screen.getByText('score 9')).toBeInTheDocument();
  });

  it('renders the divide-y class on the list to draw row separators', () => {
    const { container } = renderResults({
      search: buildSearch({ hits: [buildHit()] }),
    });
    const ul = container.querySelector('ul');
    expect(ul).not.toBeNull();
    expect(ul).toHaveClass('divide-y');
  });
});
