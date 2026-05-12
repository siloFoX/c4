import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import WikiPageDetail from './WikiPageDetail';
import type { ReadResponse } from './WikiView';

// WikiPageDetail is pure display. It branches on
// (selectedPath, pageError, page) and renders the empty / error /
// loading / populated body. Tests drive each branch directly via
// props — no hooks to stub, but related chips need to fire
// onSelectPath only when the ref ends in .md.

function buildPage(over: Partial<ReadResponse> = {}): ReadResponse {
  return {
    path: 'docs/foo.md',
    absolutePath: '/w/docs/foo.md',
    frontmatter: {
      title: 'Foo',
      type: 'docs',
      status: 'open',
      last_reviewed: '2026-05-01',
      related: [],
    },
    body: 'Hello body',
    raw: '---\ntitle: Foo\n---\nHello body',
    ...over,
  };
}

function renderDetail(
  overrides: Partial<Parameters<typeof WikiPageDetail>[0]> = {},
) {
  const props = {
    selectedPath: null as string | null,
    page: null as ReadResponse | null,
    pageError: null as string | null,
    onSelectPath: vi.fn(),
    ...overrides,
  };
  const utils = render(<WikiPageDetail {...props} />);
  return { ...utils, props };
}

beforeEach(() => {
  setLocale('en');
});

describe('<WikiPageDetail>', () => {
  it('renders the empty placeholder when no page is selected', () => {
    renderDetail({ selectedPath: null });
    expect(
      screen.getByText('Pick a wiki page from the search results.'),
    ).toBeInTheDocument();
  });

  it('does not render any metadata grid when no page is selected', () => {
    renderDetail({ selectedPath: null });
    expect(screen.queryByText('type')).not.toBeInTheDocument();
    expect(screen.queryByText('status')).not.toBeInTheDocument();
    expect(screen.queryByText('last_reviewed')).not.toBeInTheDocument();
  });

  it('renders the page error message when pageError is set', () => {
    renderDetail({
      selectedPath: 'docs/foo.md',
      pageError: 'fetch failed',
      page: null,
    });
    expect(screen.getByText('fetch failed')).toBeInTheDocument();
  });

  it('applies the destructive tone to the page error', () => {
    renderDetail({
      selectedPath: 'docs/foo.md',
      pageError: 'fetch failed',
      page: null,
    });
    expect(screen.getByText('fetch failed')).toHaveClass('text-destructive');
  });

  it('renders the loading state when selected but page is still null and no error', () => {
    renderDetail({
      selectedPath: 'docs/foo.md',
      pageError: null,
      page: null,
    });
    expect(screen.getByText('Loading page…')).toBeInTheDocument();
  });

  it('renders the metadata grid labels when a page is provided', () => {
    renderDetail({
      selectedPath: 'docs/foo.md',
      page: buildPage(),
    });
    expect(screen.getByText('type')).toBeInTheDocument();
    expect(screen.getByText('status')).toBeInTheDocument();
    expect(screen.getByText('last_reviewed')).toBeInTheDocument();
    expect(screen.getByText('path')).toBeInTheDocument();
  });

  it('renders the metadata values from frontmatter', () => {
    renderDetail({
      selectedPath: 'docs/foo.md',
      page: buildPage({
        frontmatter: {
          type: 'adr',
          status: 'accepted',
          last_reviewed: '2026-04-10',
          related: [],
        },
      }),
    });
    expect(screen.getByText('adr')).toBeInTheDocument();
    expect(screen.getByText('accepted')).toBeInTheDocument();
    expect(screen.getByText('2026-04-10')).toBeInTheDocument();
  });

  it('renders a dash placeholder when frontmatter type is missing', () => {
    renderDetail({
      selectedPath: 'docs/foo.md',
      page: buildPage({ frontmatter: { related: [] } }),
    });
    const dashCells = screen.getAllByText('-');
    expect(dashCells.length).toBeGreaterThanOrEqual(3);
  });

  it('renders the page path inside the metadata grid', () => {
    renderDetail({
      selectedPath: 'docs/foo.md',
      page: buildPage({ path: 'docs/bar.md' }),
    });
    expect(screen.getByText('docs/bar.md')).toBeInTheDocument();
  });

  it('renders the markdown body inside a pre element', () => {
    const { container } = renderDetail({
      selectedPath: 'docs/foo.md',
      page: buildPage({ body: 'body-text' }),
    });
    const pre = container.querySelector('pre');
    expect(pre).not.toBeNull();
    expect(pre?.textContent).toContain('body-text');
  });

  it('omits the related panel when no related entries exist', () => {
    renderDetail({
      selectedPath: 'docs/foo.md',
      page: buildPage({ frontmatter: { related: [] } }),
    });
    expect(screen.queryByText(/related \(/)).not.toBeInTheDocument();
  });

  it('omits the related panel when frontmatter.related is not an array', () => {
    renderDetail({
      selectedPath: 'docs/foo.md',
      page: buildPage({
        frontmatter: { related: 'docs/other.md' as unknown as string[] },
      }),
    });
    expect(screen.queryByText(/related \(/)).not.toBeInTheDocument();
  });

  it('renders the related count header when related entries exist', () => {
    renderDetail({
      selectedPath: 'docs/foo.md',
      page: buildPage({
        frontmatter: { related: ['docs/a.md', 'docs/b.md'] },
      }),
    });
    expect(screen.getByText('related (2)')).toBeInTheDocument();
  });

  it('renders one button per related entry', () => {
    renderDetail({
      selectedPath: 'docs/foo.md',
      page: buildPage({
        frontmatter: { related: ['docs/a.md', 'docs/b.md'] },
      }),
    });
    expect(screen.getByRole('button', { name: 'docs/a.md' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'docs/b.md' })).toBeInTheDocument();
  });

  it('fires onSelectPath when a related .md chip is clicked', async () => {
    const user = userEvent.setup();
    const onSelectPath = vi.fn();
    renderDetail({
      selectedPath: 'docs/foo.md',
      page: buildPage({ frontmatter: { related: ['docs/a.md'] } }),
      onSelectPath,
    });
    await user.click(screen.getByRole('button', { name: 'docs/a.md' }));
    expect(onSelectPath).toHaveBeenCalledTimes(1);
    expect(onSelectPath).toHaveBeenCalledWith('docs/a.md');
  });

  it('marks the .md chip as enabled (clickable)', () => {
    renderDetail({
      selectedPath: 'docs/foo.md',
      page: buildPage({ frontmatter: { related: ['docs/a.md'] } }),
    });
    expect(screen.getByRole('button', { name: 'docs/a.md' })).not.toBeDisabled();
  });

  it('marks a non-.md chip as disabled and does not fire onSelectPath when clicked', async () => {
    const user = userEvent.setup();
    const onSelectPath = vi.fn();
    renderDetail({
      selectedPath: 'docs/foo.md',
      page: buildPage({ frontmatter: { related: ['MEETING-42'] } }),
      onSelectPath,
    });
    const chip = screen.getByRole('button', { name: 'MEETING-42' });
    expect(chip).toBeDisabled();
    await user.click(chip).catch(() => {});
    expect(onSelectPath).not.toHaveBeenCalled();
  });

  it('uses the "Open <ref>" title on .md chips', () => {
    renderDetail({
      selectedPath: 'docs/foo.md',
      page: buildPage({ frontmatter: { related: ['docs/a.md'] } }),
    });
    expect(screen.getByRole('button', { name: 'docs/a.md' })).toHaveAttribute(
      'title',
      'Open docs/a.md',
    );
  });

  it('uses the bare ref as title on non-.md chips', () => {
    renderDetail({
      selectedPath: 'docs/foo.md',
      page: buildPage({ frontmatter: { related: ['MEETING-42'] } }),
    });
    expect(screen.getByRole('button', { name: 'MEETING-42' })).toHaveAttribute(
      'title',
      'MEETING-42',
    );
  });

  it('hover-tints .md chips and dims non-.md chips via class names', () => {
    renderDetail({
      selectedPath: 'docs/foo.md',
      page: buildPage({
        frontmatter: { related: ['docs/a.md', 'MEETING-42'] },
      }),
    });
    expect(screen.getByRole('button', { name: 'docs/a.md' })).toHaveClass(
      'hover:bg-accent/40',
    );
    expect(screen.getByRole('button', { name: 'MEETING-42' })).toHaveClass(
      'opacity-70',
    );
  });

  it('does not fire onSelectPath on initial render', () => {
    const onSelectPath = vi.fn();
    renderDetail({
      selectedPath: 'docs/foo.md',
      page: buildPage({ frontmatter: { related: ['docs/a.md'] } }),
      onSelectPath,
    });
    expect(onSelectPath).not.toHaveBeenCalled();
  });

  it('prefers the error branch over the loading branch when both are possible', () => {
    renderDetail({
      selectedPath: 'docs/foo.md',
      pageError: 'broken',
      page: null,
    });
    expect(screen.getByText('broken')).toBeInTheDocument();
    expect(screen.queryByText('Loading page…')).not.toBeInTheDocument();
  });

  it('renders the BookOpen icon (aria-hidden) in the empty branch', () => {
    const { container } = renderDetail({ selectedPath: null });
    const icon = container.querySelector('svg[aria-hidden="true"]');
    expect(icon).not.toBeNull();
  });

  it('rerendering with identical props does not duplicate chip clicks', async () => {
    const user = userEvent.setup();
    const onSelectPath = vi.fn();
    const page = buildPage({ frontmatter: { related: ['docs/a.md'] } });
    const props = {
      selectedPath: 'docs/foo.md' as string | null,
      page,
      pageError: null as string | null,
      onSelectPath,
    };
    const { rerender } = render(<WikiPageDetail {...props} />);
    rerender(<WikiPageDetail {...props} />);
    await user.click(screen.getByRole('button', { name: 'docs/a.md' }));
    expect(onSelectPath).toHaveBeenCalledTimes(1);
  });

  it('re-renders translated copy when the locale flips to ko (empty branch)', () => {
    renderDetail({ selectedPath: null });
    expect(
      screen.getByText('Pick a wiki page from the search results.'),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByText('Pick a wiki page from the search results.'),
    ).not.toBeInTheDocument();
  });

  it('lists all related entries in the order given', () => {
    const { container } = renderDetail({
      selectedPath: 'docs/foo.md',
      page: buildPage({
        frontmatter: { related: ['docs/a.md', 'docs/b.md', 'docs/c.md'] },
      }),
    });
    const chips = within(container).getAllByRole('button');
    const labels = chips.map((c) => c.textContent);
    expect(labels).toEqual(['docs/a.md', 'docs/b.md', 'docs/c.md']);
  });
});
