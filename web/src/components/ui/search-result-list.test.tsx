import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { createRef } from 'react';
import {
  DEFAULT_SEARCH_LOAD_MORE_THRESHOLD,
  SearchResultList,
  escapeRegexForHighlight,
  getNextActiveId,
  highlightMatches,
} from './search-result-list';
import type { SearchResultItem } from './search-result-list';

// -- IntersectionObserver mock -----------------------------
let lastObserver: MockIntersectionObserver | null = null;

class MockIntersectionObserver {
  callback: IntersectionObserverCallback;
  options: IntersectionObserverInit | undefined;
  observed: Element[] = [];
  disconnected = false;
  constructor(
    callback: IntersectionObserverCallback,
    options?: IntersectionObserverInit,
  ) {
    this.callback = callback;
    this.options = options;
    lastObserver = this;
  }
  observe(target: Element) {
    this.observed.push(target);
  }
  unobserve(target: Element) {
    this.observed = this.observed.filter((el) => el !== target);
  }
  disconnect() {
    this.disconnected = true;
    this.observed = [];
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  emit(entries: Partial<IntersectionObserverEntry>[]) {
    this.callback(
      entries as IntersectionObserverEntry[],
      this as unknown as IntersectionObserver,
    );
  }
  root: Element | null = null;
  rootMargin = '';
  thresholds: ReadonlyArray<number> = [];
}

beforeEach(() => {
  lastObserver = null;
  (window as unknown as { IntersectionObserver: typeof MockIntersectionObserver }).IntersectionObserver =
    MockIntersectionObserver;
});

afterEach(() => {
  cleanup();
});

const RESULTS: SearchResultItem[] = [
  {
    id: 'r1',
    title: 'Building React Components',
    snippet: 'A guide to React component design patterns.',
    type: 'doc',
  },
  {
    id: 'r2',
    title: 'React Testing Library',
    snippet: 'Best practices for testing React apps.',
    type: 'doc',
  },
  {
    id: 'r3',
    title: 'Vite Configuration',
    snippet: 'Configure Vite for production builds.',
    type: 'doc',
  },
];

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

describe('escapeRegexForHighlight', () => {
  it('passes through plain text', () => {
    expect(escapeRegexForHighlight('react')).toBe('react');
  });
  it('escapes regex special chars', () => {
    expect(escapeRegexForHighlight('a.b*c+')).toBe('a\\.b\\*c\\+');
  });
  it('escapes brackets and braces', () => {
    expect(escapeRegexForHighlight('[a]{b}')).toBe('\\[a\\]\\{b\\}');
  });
});

describe('highlightMatches', () => {
  it('returns text unchanged when query is empty', () => {
    const { container } = render(
      <div>{highlightMatches('hello world', '')}</div>,
    );
    expect(container.textContent).toBe('hello world');
    expect(container.querySelectorAll('mark').length).toBe(0);
  });
  it('returns text unchanged when query is null', () => {
    const { container } = render(
      <div>{highlightMatches('hello world', null)}</div>,
    );
    expect(container.querySelectorAll('mark').length).toBe(0);
  });
  it('wraps case-insensitive matches in <mark>', () => {
    const { container } = render(
      <div>{highlightMatches('Hello hello', 'hello')}</div>,
    );
    const marks = container.querySelectorAll('mark');
    expect(marks.length).toBe(2);
    expect(marks[0]?.textContent).toBe('Hello');
    expect(marks[1]?.textContent).toBe('hello');
  });
  it('whitespace-only query is treated as empty', () => {
    const { container } = render(
      <div>{highlightMatches('text', '   ')}</div>,
    );
    expect(container.querySelectorAll('mark').length).toBe(0);
  });
  it('escapes regex special chars in the query', () => {
    const { container } = render(
      <div>{highlightMatches('cost is $10', '$10')}</div>,
    );
    expect(container.querySelectorAll('mark').length).toBe(1);
    expect(container.querySelector('mark')?.textContent).toBe('$10');
  });
});

describe('getNextActiveId', () => {
  it('null for empty list', () => {
    expect(getNextActiveId(null, [], 'next')).toBeNull();
  });
  it('first returns the first id', () => {
    expect(getNextActiveId(null, RESULTS, 'first')).toBe('r1');
  });
  it('last returns the last id', () => {
    expect(getNextActiveId(null, RESULTS, 'last')).toBe('r3');
  });
  it('next from null returns first', () => {
    expect(getNextActiveId(null, RESULTS, 'next')).toBe('r1');
  });
  it('next from middle advances by one', () => {
    expect(getNextActiveId('r1', RESULTS, 'next')).toBe('r2');
  });
  it('next at end clamps to last', () => {
    expect(getNextActiveId('r3', RESULTS, 'next')).toBe('r3');
  });
  it('previous from null returns first', () => {
    expect(getNextActiveId(null, RESULTS, 'previous')).toBe('r1');
  });
  it('previous at start clamps to first', () => {
    expect(getNextActiveId('r1', RESULTS, 'previous')).toBe('r1');
  });
  it('previous from middle goes back one', () => {
    expect(getNextActiveId('r2', RESULTS, 'previous')).toBe('r1');
  });
});

describe('Constants', () => {
  it('default loadMoreThreshold = "200px"', () => {
    expect(DEFAULT_SEARCH_LOAD_MORE_THRESHOLD).toBe('200px');
  });
});

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

describe('SearchResultList component', () => {
  it('renders a listbox with default aria-label', () => {
    render(<SearchResultList results={RESULTS} />);
    expect(screen.getByRole('listbox')).toHaveAttribute(
      'aria-label',
      'Search results',
    );
  });

  it('honors custom ariaLabel', () => {
    render(<SearchResultList results={RESULTS} ariaLabel="Docs" />);
    expect(screen.getByRole('listbox')).toHaveAttribute(
      'aria-label',
      'Docs',
    );
  });

  it('renders one option per result', () => {
    render(<SearchResultList results={RESULTS} />);
    expect(screen.getAllByRole('option').length).toBe(3);
  });

  it('renders title + snippet by default', () => {
    render(<SearchResultList results={RESULTS} />);
    expect(
      screen.getByText('Building React Components'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('A guide to React component design patterns.'),
    ).toBeInTheDocument();
  });

  it('renders type label when supplied', () => {
    render(<SearchResultList results={RESULTS} />);
    expect(screen.getAllByText('doc').length).toBe(3);
  });

  it('highlights query matches in titles', () => {
    const { container } = render(
      <SearchResultList results={RESULTS} query="react" />,
    );
    const marks = container.querySelectorAll('mark');
    expect(marks.length).toBeGreaterThanOrEqual(2);
  });

  it('does NOT highlight snippet by default', () => {
    const { container } = render(
      <SearchResultList results={RESULTS} query="react" />,
    );
    // Only title marks expected with highlightSnippet=false
    const snippetEls = container.querySelectorAll(
      '[data-section="search-result-snippet"] mark',
    );
    expect(snippetEls.length).toBe(0);
  });

  it('highlightSnippet=true marks snippet too', () => {
    const { container } = render(
      <SearchResultList
        results={RESULTS}
        query="react"
        highlightSnippet
      />,
    );
    const snippetEls = container.querySelectorAll(
      '[data-section="search-result-snippet"] mark',
    );
    expect(snippetEls.length).toBeGreaterThan(0);
  });

  it('clicking a result fires onSelect with the item', () => {
    const onSelect = vi.fn();
    render(
      <SearchResultList results={RESULTS} onSelect={onSelect} />,
    );
    fireEvent.click(screen.getByText('React Testing Library'));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'r2' }),
    );
  });

  it('click sets the active id', () => {
    const onActiveChange = vi.fn();
    render(
      <SearchResultList
        results={RESULTS}
        onActiveChange={onActiveChange}
      />,
    );
    fireEvent.click(screen.getByText('React Testing Library'));
    expect(onActiveChange).toHaveBeenCalledWith('r2');
  });

  it('mouse enter sets the active id', () => {
    const onActiveChange = vi.fn();
    render(
      <SearchResultList
        results={RESULTS}
        onActiveChange={onActiveChange}
      />,
    );
    fireEvent.mouseEnter(screen.getByText('Vite Configuration'));
    expect(onActiveChange).toHaveBeenCalledWith('r3');
  });

  it('controlled activeId marks the matching option aria-selected', () => {
    render(<SearchResultList results={RESULTS} activeId="r2" />);
    const options = screen.getAllByRole('option');
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    expect(options[0]).toHaveAttribute('aria-selected', 'false');
  });

  it('ArrowDown moves the active to the next result', () => {
    const onActiveChange = vi.fn();
    render(
      <SearchResultList
        results={RESULTS}
        defaultActiveId="r1"
        onActiveChange={onActiveChange}
      />,
    );
    fireEvent.keyDown(screen.getByRole('listbox'), {
      key: 'ArrowDown',
    });
    expect(onActiveChange).toHaveBeenCalledWith('r2');
  });

  it('ArrowUp moves the active to the previous result', () => {
    const onActiveChange = vi.fn();
    render(
      <SearchResultList
        results={RESULTS}
        defaultActiveId="r2"
        onActiveChange={onActiveChange}
      />,
    );
    fireEvent.keyDown(screen.getByRole('listbox'), {
      key: 'ArrowUp',
    });
    expect(onActiveChange).toHaveBeenCalledWith('r1');
  });

  it('Home jumps to the first id', () => {
    const onActiveChange = vi.fn();
    render(
      <SearchResultList
        results={RESULTS}
        defaultActiveId="r3"
        onActiveChange={onActiveChange}
      />,
    );
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Home' });
    expect(onActiveChange).toHaveBeenCalledWith('r1');
  });

  it('End jumps to the last id', () => {
    const onActiveChange = vi.fn();
    render(
      <SearchResultList
        results={RESULTS}
        defaultActiveId="r1"
        onActiveChange={onActiveChange}
      />,
    );
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'End' });
    expect(onActiveChange).toHaveBeenCalledWith('r3');
  });

  it('Enter fires onSelect with the active item', () => {
    const onSelect = vi.fn();
    render(
      <SearchResultList
        results={RESULTS}
        defaultActiveId="r2"
        onSelect={onSelect}
      />,
    );
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'r2' }),
    );
  });

  it('Enter with no active id is a no-op', () => {
    const onSelect = vi.fn();
    render(
      <SearchResultList results={RESULTS} onSelect={onSelect} />,
    );
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Enter' });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('empty results renders the empty state', () => {
    render(
      <SearchResultList
        results={[]}
        emptyState="No matches"
      />,
    );
    expect(screen.getByText('No matches')).toBeInTheDocument();
  });

  it('default empty state copy', () => {
    render(<SearchResultList results={[]} />);
    expect(screen.getByText('No results')).toBeInTheDocument();
  });

  it('loading state renders alongside results', () => {
    render(
      <SearchResultList
        results={RESULTS}
        loading
        loadingState="Fetching..."
      />,
    );
    expect(screen.getByText('Fetching...')).toBeInTheDocument();
  });

  it('default loadingState copy', () => {
    render(<SearchResultList results={RESULTS} loading />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('aria-activedescendant points to the active id', () => {
    render(<SearchResultList results={RESULTS} activeId="r3" />);
    expect(screen.getByRole('listbox')).toHaveAttribute(
      'aria-activedescendant',
      'search-result-r3',
    );
  });

  it('per-option id pattern matches aria-activedescendant', () => {
    render(<SearchResultList results={RESULTS} activeId="r1" />);
    expect(document.getElementById('search-result-r1')).not.toBeNull();
  });

  it('data attrs on root reflect state', () => {
    render(
      <SearchResultList
        results={RESULTS}
        activeId="r2"
        loading
        hasMore
      />,
    );
    const root = screen.getByRole('listbox');
    expect(root).toHaveAttribute('data-active-id', 'r2');
    expect(root).toHaveAttribute('data-result-count', '3');
    expect(root).toHaveAttribute('data-loading', 'true');
    expect(root).toHaveAttribute('data-has-more', 'true');
  });

  it('per-option data-active reflects state', () => {
    const { container } = render(
      <SearchResultList results={RESULTS} activeId="r2" />,
    );
    const item = container.querySelector('[data-item-id="r2"]');
    expect(item).toHaveAttribute('data-active', 'true');
  });

  it('per-option data-type reflects the type field', () => {
    const { container } = render(
      <SearchResultList results={RESULTS} />,
    );
    const item = container.querySelector('[data-item-id="r1"]');
    expect(item).toHaveAttribute('data-type', 'doc');
  });

  it('hasMore renders a sentinel + observes it', () => {
    const { container } = render(
      <SearchResultList results={RESULTS} hasMore />,
    );
    expect(
      container.querySelector(
        '[data-section="search-result-list-sentinel"]',
      ),
    ).toBeInTheDocument();
    expect(lastObserver?.observed.length).toBe(1);
  });

  it('hasMore=false: no sentinel + no observer', () => {
    const { container } = render(
      <SearchResultList results={RESULTS} />,
    );
    expect(
      container.querySelector(
        '[data-section="search-result-list-sentinel"]',
      ),
    ).toBeNull();
    expect(lastObserver).toBeNull();
  });

  it('sentinel intersection fires onLoadMore', () => {
    const onLoadMore = vi.fn();
    render(
      <SearchResultList
        results={RESULTS}
        hasMore
        onLoadMore={onLoadMore}
      />,
    );
    act(() => {
      lastObserver?.emit([
        {
          isIntersecting: true,
          intersectionRatio: 1,
          target: lastObserver.observed[0]!,
        },
      ]);
    });
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('non-intersecting sentinel does NOT fire onLoadMore', () => {
    const onLoadMore = vi.fn();
    render(
      <SearchResultList
        results={RESULTS}
        hasMore
        onLoadMore={onLoadMore}
      />,
    );
    act(() => {
      lastObserver?.emit([
        {
          isIntersecting: false,
          intersectionRatio: 0,
          target: lastObserver.observed[0]!,
        },
      ]);
    });
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it('observer uses configured rootMargin (loadMoreThreshold)', () => {
    render(
      <SearchResultList
        results={RESULTS}
        hasMore
        loadMoreThreshold="500px"
      />,
    );
    expect(lastObserver?.options?.rootMargin).toBe('500px');
  });

  it('observer disconnects on unmount', () => {
    const { unmount } = render(
      <SearchResultList results={RESULTS} hasMore />,
    );
    expect(lastObserver?.disconnected).toBe(false);
    unmount();
    expect(lastObserver?.disconnected).toBe(true);
  });

  it('renderItem render-prop replaces the default row', () => {
    render(
      <SearchResultList
        results={RESULTS}
        renderItem={({ item, isActive, onSelect }) => (
          <button
            type="button"
            data-testid="custom-row"
            onClick={onSelect}
          >
            CUSTOM:{item.id}-{isActive ? 'yes' : 'no'}
          </button>
        )}
      />,
    );
    expect(screen.getAllByTestId('custom-row').length).toBe(3);
  });

  it('renderItem renderprop receives highlightedTitle', () => {
    const calls: Array<{ highlightedTitle: unknown }> = [];
    render(
      <SearchResultList
        results={RESULTS}
        query="react"
        renderItem={(args) => {
          calls.push({ highlightedTitle: args.highlightedTitle });
          return <span>row-{args.item.id}</span>;
        }}
      />,
    );
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]?.highlightedTitle).not.toBeNull();
  });

  it('exposes a stable displayName', () => {
    expect(SearchResultList.displayName).toBe('SearchResultList');
  });

  it('forwards ref to the listbox container', () => {
    const ref = createRef<HTMLDivElement>();
    render(<SearchResultList ref={ref} results={RESULTS} />);
    expect(ref.current?.getAttribute('role')).toBe('listbox');
  });

  it('skips IO setup when no IntersectionObserver is available', () => {
    delete (window as unknown as { IntersectionObserver?: unknown })
      .IntersectionObserver;
    render(<SearchResultList results={RESULTS} hasMore />);
    expect(lastObserver).toBeNull();
  });

  it('default icon renders (FileText svg) when item.icon missing', () => {
    const { container } = render(
      <SearchResultList results={RESULTS} />,
    );
    const icons = container.querySelectorAll(
      '[data-section="search-result-icon"] svg',
    );
    expect(icons.length).toBe(3);
  });

  it('custom item.icon replaces the default', () => {
    const withIcon: SearchResultItem[] = [
      {
        id: 'x',
        title: 'X',
        icon: <span data-testid="custom-icon">!</span>,
      },
    ];
    render(<SearchResultList results={withIcon} />);
    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
  });
});
