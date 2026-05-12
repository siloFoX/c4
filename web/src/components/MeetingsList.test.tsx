import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MeetingsList from './MeetingsList';
import { setLocale } from '../lib/i18n';
import type { MeetingSummary } from './MeetingsView';

beforeEach(() => {
  setLocale('en');
});

const SAMPLE: MeetingSummary[] = [
  {
    id: 'mtg-aaaa1111',
    status: 'in-progress',
    track: 'standard',
    title: 'Auth migration plan',
    currentStage: 'discuss',
    currentRound: 2,
    createdAt: '2026-05-01T00:00:00Z',
    startedAt: '2026-05-01T00:01:00Z',
    completedAt: null,
  },
  {
    id: 'mtg-bbbb2222',
    status: 'completed',
    track: 'lightweight',
    title: 'Caching strategy review',
    currentStage: 'final',
    currentRound: 5,
    createdAt: '2026-04-29T00:00:00Z',
    startedAt: '2026-04-29T00:01:00Z',
    completedAt: '2026-04-29T01:00:00Z',
  },
  {
    id: 'mtg-cccc3333',
    status: 'pending',
    track: 'full',
    title: 'Forked retro session',
    currentStage: null,
    currentRound: 0,
    createdAt: '2026-04-28T00:00:00Z',
    startedAt: null,
    completedAt: null,
    forkOf: 'mtg-parent1234567890',
    snippet: 'mention of <<auth>> and <<token>> changes',
  },
];

function renderList(
  overrides: Partial<Parameters<typeof MeetingsList>[0]> = {},
) {
  const props = {
    displayList: SAMPLE,
    isSearchMode: false,
    searchQuery: '',
    error: null as string | null,
    loading: false,
    selectedId: null as string | null,
    onSelect: vi.fn(),
    ...overrides,
  };
  const utils = render(<MeetingsList {...props} />);
  return { ...utils, props };
}

describe('<MeetingsList>', () => {
  it('renders one <li> per meeting summary when the list is populated', () => {
    const { container } = renderList();
    expect(container.querySelectorAll('li')).toHaveLength(SAMPLE.length);
  });

  it('renders an unordered list as the wrapping element', () => {
    const { container } = renderList();
    const list = container.querySelector('ul');
    expect(list).not.toBeNull();
    expect(list).toHaveClass('divide-y');
  });

  it('renders the meeting title text inside each row', () => {
    renderList();
    expect(screen.getByText('Auth migration plan')).toBeInTheDocument();
    expect(screen.getByText('Caching strategy review')).toBeInTheDocument();
    expect(screen.getByText('Forked retro session')).toBeInTheDocument();
  });

  it('renders the status label text on each row', () => {
    renderList();
    expect(screen.getByText('in-progress')).toBeInTheDocument();
    expect(screen.getByText('completed')).toBeInTheDocument();
    expect(screen.getByText('pending')).toBeInTheDocument();
  });

  it('renders the track badge text on each row', () => {
    renderList();
    expect(screen.getByText('standard')).toBeInTheDocument();
    expect(screen.getByText('lightweight')).toBeInTheDocument();
    expect(screen.getByText('full')).toBeInTheDocument();
  });

  it('renders a fork-of marker for forked meetings only', () => {
    const { container } = renderList();
    const forkSpans = Array.from(
      container.querySelectorAll('span[title]'),
    ).filter((el) => /forked from/i.test(el.getAttribute('title') ?? ''));
    expect(forkSpans).toHaveLength(1);
    expect(forkSpans[0].textContent).toContain('mtg-pare');
  });

  it('renders the snippet text inside the row that has one', () => {
    const { container } = renderList();
    const highlights = container.querySelectorAll('span.bg-amber-500\\/20');
    expect(highlights.length).toBeGreaterThanOrEqual(2);
    const tokens = Array.from(highlights).map((el) => el.textContent);
    expect(tokens).toContain('auth');
    expect(tokens).toContain('token');
  });

  it('omits the snippet block on rows without a snippet field', () => {
    const { container } = renderList();
    const rows = container.querySelectorAll('li');
    const first = rows[0];
    expect(first.querySelector('span.bg-amber-500\\/20')).toBeNull();
  });

  it('renders the stage / round / id footer line for each row', () => {
    renderList();
    expect(
      screen.getByText(/stage: discuss .* round 2 .* id mtg-aaaa1111/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/stage: - .* round 0 .* id mtg-cccc3333/),
    ).toBeInTheDocument();
  });

  it('fires onSelect with the row id when an unselected row is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderList({ onSelect });
    await user.click(screen.getByText('Caching strategy review'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('mtg-bbbb2222');
  });

  it('fires onSelect on every clicked row, including the already-selected one', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderList({ selectedId: 'mtg-aaaa1111', onSelect });
    await user.click(screen.getByText('Auth migration plan'));
    expect(onSelect).toHaveBeenCalledWith('mtg-aaaa1111');
  });

  it('applies the bg-primary/30 highlight class to the selected row', () => {
    const { container } = renderList({ selectedId: 'mtg-aaaa1111' });
    const rows = container.querySelectorAll('li');
    expect(rows[0]).toHaveClass('bg-primary/30');
  });

  it('applies the hover-accent class to non-selected rows', () => {
    const { container } = renderList({ selectedId: 'mtg-aaaa1111' });
    const rows = container.querySelectorAll('li');
    expect(rows[1]).toHaveClass('hover:bg-accent/40');
    expect(rows[1]).not.toHaveClass('bg-primary/30');
  });

  it('applies the hover-accent class to every row when nothing is selected', () => {
    const { container } = renderList({ selectedId: null });
    const rows = container.querySelectorAll('li');
    for (const row of Array.from(rows)) {
      expect(row).toHaveClass('hover:bg-accent/40');
      expect(row).not.toHaveClass('bg-primary/30');
    }
  });

  it('renders the error copy when error is set and not in search mode', () => {
    renderList({
      error: 'boom: could not load meetings',
      isSearchMode: false,
      displayList: [],
    });
    expect(
      screen.getByText('boom: could not load meetings'),
    ).toBeInTheDocument();
  });

  it('applies the destructive class set to the error block', () => {
    const { container } = renderList({
      error: 'fail',
      isSearchMode: false,
      displayList: [],
    });
    const errorBlock = container.firstChild as HTMLElement;
    expect(errorBlock).toHaveClass('text-destructive');
  });

  it('suppresses the error block in search mode and falls back to empty copy', () => {
    renderList({
      error: 'list-side error',
      isSearchMode: true,
      searchQuery: 'auth',
      displayList: [],
    });
    expect(screen.queryByText('list-side error')).not.toBeInTheDocument();
    expect(
      screen.getByText('No meetings match "auth".'),
    ).toBeInTheDocument();
  });

  it('renders the loading empty copy when the list is empty and loading=true', () => {
    renderList({ displayList: [], loading: true });
    expect(screen.getByText('Loading meetings...')).toBeInTheDocument();
  });

  it('renders the "no meetings yet" empty copy when the list is empty and not loading', () => {
    renderList({ displayList: [], loading: false });
    expect(
      screen.getByText(/No meetings yet/),
    ).toBeInTheDocument();
  });

  it('renders the search-empty copy with the interpolated query in search mode', () => {
    renderList({
      displayList: [],
      isSearchMode: true,
      searchQuery: 'rate limiter',
    });
    expect(
      screen.getByText('No meetings match "rate limiter".'),
    ).toBeInTheDocument();
  });

  it('does not render the <ul> when the empty branch is rendered', () => {
    const { container } = renderList({ displayList: [] });
    expect(container.querySelector('ul')).toBeNull();
  });

  it('does not render the <ul> when the error branch is rendered', () => {
    const { container } = renderList({
      error: 'fail',
      displayList: [],
      isSearchMode: false,
    });
    expect(container.querySelector('ul')).toBeNull();
  });

  it('applies the cursor-pointer class to each row so it reads as clickable', () => {
    const { container } = renderList();
    for (const row of Array.from(container.querySelectorAll('li'))) {
      expect(row).toHaveClass('cursor-pointer');
    }
  });

  it('renders the truncated fork parent id (first 8 chars) in the fork badge', () => {
    const { container } = renderList();
    const forkSpans = Array.from(
      container.querySelectorAll('span[title]'),
    ).filter((el) => /forked from/i.test(el.getAttribute('title') ?? ''));
    expect(forkSpans[0].textContent).toMatch(/mtg-pare$/);
  });

  it('does not fire onSelect on initial render', () => {
    const onSelect = vi.fn();
    renderList({ onSelect });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('rerendering with the same props does not duplicate onSelect calls', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const { rerender, props } = renderList({ onSelect });
    rerender(<MeetingsList {...props} />);
    await user.click(screen.getByText('Auth migration plan'));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('does not surface a snippet element on rows without a snippet field', () => {
    const { container } = renderList();
    const rows = container.querySelectorAll('li');
    const second = rows[1];
    expect(within(second as HTMLElement).queryByText(/<<.+>>/)).toBeNull();
    expect(second.querySelector('span.line-clamp-2')).toBeNull();
  });

  it('re-renders the empty copy when the locale flips to ko', () => {
    renderList({ displayList: [], loading: true });
    expect(screen.getByText('Loading meetings...')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('Loading meetings...')).not.toBeInTheDocument();
  });
});
