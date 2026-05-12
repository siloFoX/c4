import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import WikiPageDetailHeader from './WikiPageDetailHeader';
import type { ReadResponse } from './WikiView';

// WikiPageDetailHeader is pure display + one action. It branches on
// (page, selectedPath, frontmatter.status === 'reopened') for the
// Reopen button and on (reopenMsg, reopenFailed) for the result line.
// Tests drive each branch directly via props.

function buildPage(over: Partial<ReadResponse> = {}): ReadResponse {
  return {
    path: 'docs/foo.md',
    absolutePath: '/w/docs/foo.md',
    frontmatter: { title: 'Foo Page' },
    body: 'body',
    raw: '---\ntitle: Foo Page\n---\nbody',
    ...over,
  };
}

function renderHeader(
  overrides: Partial<Parameters<typeof WikiPageDetailHeader>[0]> = {},
) {
  const props = {
    page: null as ReadResponse | null,
    selectedPath: null as string | null,
    reopenBusy: false,
    reopenMsg: null as string | null,
    reopenFailed: false,
    onReopen: vi.fn(),
    ...overrides,
  };
  const utils = render(<WikiPageDetailHeader {...props} />);
  return { ...utils, props };
}

beforeEach(() => {
  setLocale('en');
});

describe('<WikiPageDetailHeader>', () => {
  it('renders the "Select a page" fallback title when no page is loaded', () => {
    renderHeader();
    expect(screen.getByText('Select a page')).toBeInTheDocument();
  });

  it('renders the frontmatter title when a page has one', () => {
    renderHeader({
      page: buildPage({ frontmatter: { title: 'Auth Schema' } }),
      selectedPath: 'docs/foo.md',
    });
    expect(screen.getByText('Auth Schema')).toBeInTheDocument();
  });

  it('falls back to page.path when the page has no frontmatter title', () => {
    renderHeader({
      page: buildPage({ frontmatter: {}, path: 'docs/no-title.md' }),
      selectedPath: 'docs/no-title.md',
    });
    expect(screen.getByText('docs/no-title.md')).toBeInTheDocument();
  });

  it('does not render the Reopen button when no page is loaded', () => {
    renderHeader({ page: null, selectedPath: 'docs/foo.md' });
    expect(
      screen.queryByRole('button', { name: 'Reopen this decision' }),
    ).not.toBeInTheDocument();
  });

  it('does not render the Reopen button when selectedPath is null', () => {
    renderHeader({ page: buildPage(), selectedPath: null });
    expect(
      screen.queryByRole('button', { name: 'Reopen this decision' }),
    ).not.toBeInTheDocument();
  });

  it('does not render the Reopen button when the page status is already "reopened"', () => {
    renderHeader({
      page: buildPage({ frontmatter: { title: 'Foo', status: 'reopened' } }),
      selectedPath: 'docs/foo.md',
    });
    expect(
      screen.queryByRole('button', { name: 'Reopen this decision' }),
    ).not.toBeInTheDocument();
  });

  it('renders the Reopen button when page + selectedPath + status != "reopened"', () => {
    renderHeader({
      page: buildPage({ frontmatter: { title: 'Foo', status: 'open' } }),
      selectedPath: 'docs/foo.md',
    });
    expect(
      screen.getByRole('button', { name: 'Reopen this decision' }),
    ).toBeInTheDocument();
  });

  it('uses the Reopen tooltip text on the title attribute', () => {
    renderHeader({
      page: buildPage(),
      selectedPath: 'docs/foo.md',
    });
    expect(
      screen.getByRole('button', { name: 'Reopen this decision' }),
    ).toHaveAttribute(
      'title',
      'Spawn a new meeting seeded with this page + its related neighbours',
    );
  });

  it('fires onReopen with the selectedPath when the Reopen button is clicked', async () => {
    const user = userEvent.setup();
    const onReopen = vi.fn();
    renderHeader({
      page: buildPage(),
      selectedPath: 'docs/foo.md',
      onReopen,
    });
    await user.click(
      screen.getByRole('button', { name: 'Reopen this decision' }),
    );
    expect(onReopen).toHaveBeenCalledTimes(1);
    expect(onReopen).toHaveBeenCalledWith('docs/foo.md');
  });

  it('disables the Reopen button while reopenBusy=true', () => {
    renderHeader({
      page: buildPage(),
      selectedPath: 'docs/foo.md',
      reopenBusy: true,
    });
    expect(
      screen.getByRole('button', { name: 'Reopen this decision' }),
    ).toBeDisabled();
  });

  it('animates the Reopen icon while reopenBusy=true', () => {
    const { container } = renderHeader({
      page: buildPage(),
      selectedPath: 'docs/foo.md',
      reopenBusy: true,
    });
    const icon = container.querySelector('svg.animate-spin');
    expect(icon).not.toBeNull();
  });

  it('does not animate the Reopen icon when not busy', () => {
    const { container } = renderHeader({
      page: buildPage(),
      selectedPath: 'docs/foo.md',
      reopenBusy: false,
    });
    const icon = container.querySelector('svg.animate-spin');
    expect(icon).toBeNull();
  });

  it('omits the reopen result line when reopenMsg is null', () => {
    const { container } = renderHeader({
      page: buildPage(),
      selectedPath: 'docs/foo.md',
      reopenMsg: null,
    });
    expect(container.querySelector('.text-emerald-600')).toBeNull();
    expect(container.querySelector('.text-destructive')).toBeNull();
  });

  it('renders the reopen result line in the success tone when not failed', () => {
    renderHeader({
      page: buildPage(),
      selectedPath: 'docs/foo.md',
      reopenMsg: 'reopened — meeting 42 (2 context seed(s))',
      reopenFailed: false,
    });
    const msg = screen.getByText('reopened — meeting 42 (2 context seed(s))');
    expect(msg).toHaveClass('text-emerald-600');
    expect(msg).not.toHaveClass('text-destructive');
  });

  it('renders the reopen result line in the destructive tone when failed', () => {
    renderHeader({
      page: buildPage(),
      selectedPath: 'docs/foo.md',
      reopenMsg: 'reopen failed: 500',
      reopenFailed: true,
    });
    const msg = screen.getByText('reopen failed: 500');
    expect(msg).toHaveClass('text-destructive');
    expect(msg).not.toHaveClass('text-emerald-600');
  });

  it('does not fire onReopen on initial render', () => {
    const onReopen = vi.fn();
    renderHeader({
      page: buildPage(),
      selectedPath: 'docs/foo.md',
      onReopen,
    });
    expect(onReopen).not.toHaveBeenCalled();
  });

  it('does not fire onReopen when the user clicks the title text', async () => {
    const user = userEvent.setup();
    const onReopen = vi.fn();
    renderHeader({
      page: buildPage({ frontmatter: { title: 'Foo Page' } }),
      selectedPath: 'docs/foo.md',
      onReopen,
    });
    await user.click(screen.getByText('Foo Page'));
    expect(onReopen).not.toHaveBeenCalled();
  });

  it('rerendering with identical props does not duplicate clicks', async () => {
    const user = userEvent.setup();
    const onReopen = vi.fn();
    const page = buildPage();
    const props = {
      page,
      selectedPath: 'docs/foo.md' as string | null,
      reopenBusy: false,
      reopenMsg: null as string | null,
      reopenFailed: false,
      onReopen,
    };
    const { rerender } = render(<WikiPageDetailHeader {...props} />);
    rerender(<WikiPageDetailHeader {...props} />);
    await user.click(
      screen.getByRole('button', { name: 'Reopen this decision' }),
    );
    expect(onReopen).toHaveBeenCalledTimes(1);
  });

  it('wraps the children in a CardHeader with the border-b class', () => {
    const { container } = renderHeader();
    const root = container.firstChild as HTMLElement;
    expect(root).toHaveClass('border-b');
    expect(root).toHaveClass('flex-col');
  });

  it('re-renders the title fallback when the locale flips to ko', () => {
    renderHeader();
    expect(screen.getByText('Select a page')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('Select a page')).not.toBeInTheDocument();
  });

  it('does not enable the Reopen button when the page has status=reopened even if busy is false', () => {
    renderHeader({
      page: buildPage({ frontmatter: { status: 'reopened' } }),
      selectedPath: 'docs/foo.md',
      reopenBusy: false,
    });
    expect(
      screen.queryByRole('button', { name: 'Reopen this decision' }),
    ).not.toBeInTheDocument();
  });
});
