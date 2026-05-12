import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import MeetingsSearchFacets, {
  type SearchFacets,
  type Track,
} from './MeetingsSearchFacets';
import type { MeetingStatus } from './MeetingsView';

// MeetingsSearchFacets is pure display: parent owns the FTS
// response counts + the facet maps + the active filter selectors,
// and clicking a chip flips the parent's selector to either the
// chip value (when none was selected) or the empty string (when
// the chip itself was already selected). Tests drive the full
// prop union directly: the total-null header vs total-number
// header, the empty facets branch (status / track absent or
// empty-object), the populated facets branch (one chip per
// facet entry, count badge "k=n", title attribute via the i18n
// formatter), the selected highlight class, the toggle payload
// for both "set" and "unset" directions, the keyboard
// activation, and the locale flip.

beforeEach(() => {
  setLocale('en');
});

function renderFacets(
  overrides: Partial<Parameters<typeof MeetingsSearchFacets>[0]> = {},
) {
  const props = {
    resultCount: 0,
    total: null as number | null,
    facets: {} as SearchFacets,
    selectedStatus: '' as MeetingStatus | '',
    selectedTrack: '' as Track | '',
    onStatusToggle: vi.fn(),
    onTrackToggle: vi.fn(),
    ...overrides,
  };
  const utils = render(<MeetingsSearchFacets {...props} />);
  return { ...utils, props };
}

describe('<MeetingsSearchFacets>', () => {
  it('renders the simple count header when total is null', () => {
    renderFacets({ resultCount: 3, total: null });
    expect(screen.getByText('3 matches')).toBeInTheDocument();
  });

  it('renders the count/total header when total is a number', () => {
    renderFacets({ resultCount: 3, total: 12 });
    expect(screen.getByText('3/12 matches')).toBeInTheDocument();
  });

  it('renders zero matches correctly when total is null', () => {
    renderFacets({ resultCount: 0, total: null });
    expect(screen.getByText('0 matches')).toBeInTheDocument();
  });

  it('renders zero matches correctly when total is also zero', () => {
    renderFacets({ resultCount: 0, total: 0 });
    expect(screen.getByText('0/0 matches')).toBeInTheDocument();
  });

  it('does NOT render the status: label when facets.status is undefined', () => {
    renderFacets({ facets: {} });
    expect(screen.queryByText('· status:')).not.toBeInTheDocument();
  });

  it('does NOT render the status: label when facets.status is empty object', () => {
    renderFacets({ facets: { status: {} } });
    expect(screen.queryByText('· status:')).not.toBeInTheDocument();
  });

  it('does NOT render the track: label when facets.track is undefined', () => {
    renderFacets({ facets: {} });
    expect(screen.queryByText('· track:')).not.toBeInTheDocument();
  });

  it('does NOT render the track: label when facets.track is empty object', () => {
    renderFacets({ facets: { track: {} } });
    expect(screen.queryByText('· track:')).not.toBeInTheDocument();
  });

  it('renders the status: label when facets.status has at least one entry', () => {
    renderFacets({ facets: { status: { pending: 2 } } });
    expect(screen.getByText('· status:')).toBeInTheDocument();
  });

  it('renders the track: label when facets.track has at least one entry', () => {
    renderFacets({ facets: { track: { standard: 4 } } });
    expect(screen.getByText('· track:')).toBeInTheDocument();
  });

  it('renders one chip per status facet entry with "k=n" text', () => {
    renderFacets({
      facets: {
        status: { pending: 2, completed: 5 },
      },
    });
    expect(
      screen.getByRole('button', { name: 'pending=2' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'completed=5' }),
    ).toBeInTheDocument();
  });

  it('renders one chip per track facet entry with "k=n" text', () => {
    renderFacets({
      facets: {
        track: { lightweight: 1, standard: 3, full: 7 },
      },
    });
    expect(
      screen.getByRole('button', { name: 'lightweight=1' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'standard=3' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'full=7' }),
    ).toBeInTheDocument();
  });

  it('renders no chips when both facet maps are empty', () => {
    renderFacets({ facets: { status: {}, track: {} } });
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('composes the status chip title via the i18n filterStatus formatter', () => {
    renderFacets({
      facets: { status: { pending: 2 } },
    });
    expect(
      screen.getByRole('button', { name: 'pending=2' }),
    ).toHaveAttribute('title', 'Filter by status=pending');
  });

  it('composes the track chip title via the i18n filterTrack formatter', () => {
    renderFacets({
      facets: { track: { full: 7 } },
    });
    expect(
      screen.getByRole('button', { name: 'full=7' }),
    ).toHaveAttribute('title', 'Filter by track=full');
  });

  it('renders all chips as type="button" so none submits a form', () => {
    renderFacets({
      facets: {
        status: { pending: 2 },
        track: { full: 7 },
      },
    });
    for (const btn of screen.getAllByRole('button')) {
      expect(btn).toHaveAttribute('type', 'button');
    }
  });

  it('applies the primary highlight class to the selected status chip', () => {
    renderFacets({
      facets: { status: { pending: 2, completed: 5 } },
      selectedStatus: 'pending',
    });
    expect(
      screen.getByRole('button', { name: 'pending=2' }),
    ).toHaveClass('border-primary');
    expect(
      screen.getByRole('button', { name: 'pending=2' }),
    ).toHaveClass('bg-primary/30');
  });

  it('does NOT apply the primary highlight class to non-selected status chips', () => {
    renderFacets({
      facets: { status: { pending: 2, completed: 5 } },
      selectedStatus: 'pending',
    });
    const other = screen.getByRole('button', { name: 'completed=5' });
    expect(other).not.toHaveClass('border-primary');
    expect(other).toHaveClass('border-border');
  });

  it('applies the primary highlight class to the selected track chip', () => {
    renderFacets({
      facets: { track: { standard: 3, full: 7 } },
      selectedTrack: 'standard',
    });
    expect(
      screen.getByRole('button', { name: 'standard=3' }),
    ).toHaveClass('border-primary');
  });

  it('does NOT apply the primary highlight class to non-selected track chips', () => {
    renderFacets({
      facets: { track: { standard: 3, full: 7 } },
      selectedTrack: 'standard',
    });
    expect(
      screen.getByRole('button', { name: 'full=7' }),
    ).not.toHaveClass('border-primary');
  });

  it('fires onStatusToggle with the chip value when none was selected', async () => {
    const user = userEvent.setup();
    const onStatusToggle = vi.fn();
    renderFacets({
      facets: { status: { pending: 2 } },
      selectedStatus: '',
      onStatusToggle,
    });
    await user.click(screen.getByRole('button', { name: 'pending=2' }));
    expect(onStatusToggle).toHaveBeenCalledTimes(1);
    expect(onStatusToggle).toHaveBeenCalledWith('pending');
  });

  it('fires onStatusToggle with the empty string when the selected status chip is clicked', async () => {
    const user = userEvent.setup();
    const onStatusToggle = vi.fn();
    renderFacets({
      facets: { status: { pending: 2 } },
      selectedStatus: 'pending',
      onStatusToggle,
    });
    await user.click(screen.getByRole('button', { name: 'pending=2' }));
    expect(onStatusToggle).toHaveBeenCalledWith('');
  });

  it('fires onStatusToggle with the new chip value when a different chip is clicked', async () => {
    const user = userEvent.setup();
    const onStatusToggle = vi.fn();
    renderFacets({
      facets: { status: { pending: 2, completed: 5 } },
      selectedStatus: 'pending',
      onStatusToggle,
    });
    await user.click(screen.getByRole('button', { name: 'completed=5' }));
    expect(onStatusToggle).toHaveBeenCalledWith('completed');
  });

  it('fires onTrackToggle with the chip value when none was selected', async () => {
    const user = userEvent.setup();
    const onTrackToggle = vi.fn();
    renderFacets({
      facets: { track: { standard: 3 } },
      selectedTrack: '',
      onTrackToggle,
    });
    await user.click(screen.getByRole('button', { name: 'standard=3' }));
    expect(onTrackToggle).toHaveBeenCalledTimes(1);
    expect(onTrackToggle).toHaveBeenCalledWith('standard');
  });

  it('fires onTrackToggle with the empty string when the selected track chip is clicked', async () => {
    const user = userEvent.setup();
    const onTrackToggle = vi.fn();
    renderFacets({
      facets: { track: { standard: 3 } },
      selectedTrack: 'standard',
      onTrackToggle,
    });
    await user.click(screen.getByRole('button', { name: 'standard=3' }));
    expect(onTrackToggle).toHaveBeenCalledWith('');
  });

  it('does NOT fire onTrackToggle when a status chip is clicked', async () => {
    const user = userEvent.setup();
    const onStatusToggle = vi.fn();
    const onTrackToggle = vi.fn();
    renderFacets({
      facets: { status: { pending: 2 }, track: { full: 7 } },
      onStatusToggle,
      onTrackToggle,
    });
    await user.click(screen.getByRole('button', { name: 'pending=2' }));
    expect(onStatusToggle).toHaveBeenCalled();
    expect(onTrackToggle).not.toHaveBeenCalled();
  });

  it('does NOT fire onStatusToggle when a track chip is clicked', async () => {
    const user = userEvent.setup();
    const onStatusToggle = vi.fn();
    const onTrackToggle = vi.fn();
    renderFacets({
      facets: { status: { pending: 2 }, track: { full: 7 } },
      onStatusToggle,
      onTrackToggle,
    });
    await user.click(screen.getByRole('button', { name: 'full=7' }));
    expect(onTrackToggle).toHaveBeenCalled();
    expect(onStatusToggle).not.toHaveBeenCalled();
  });

  it('fires onStatusToggle on Enter activation of the chip', async () => {
    const user = userEvent.setup();
    const onStatusToggle = vi.fn();
    renderFacets({
      facets: { status: { pending: 2 } },
      onStatusToggle,
    });
    const btn = screen.getByRole('button', { name: 'pending=2' });
    btn.focus();
    await user.keyboard('{Enter}');
    expect(onStatusToggle).toHaveBeenCalledWith('pending');
  });

  it('fires onTrackToggle on Space activation of the chip', async () => {
    const user = userEvent.setup();
    const onTrackToggle = vi.fn();
    renderFacets({
      facets: { track: { full: 7 } },
      onTrackToggle,
    });
    const btn = screen.getByRole('button', { name: 'full=7' });
    btn.focus();
    await user.keyboard(' ');
    expect(onTrackToggle).toHaveBeenCalledWith('full');
  });

  it('does NOT fire any callback on initial render', () => {
    const onStatusToggle = vi.fn();
    const onTrackToggle = vi.fn();
    renderFacets({
      facets: { status: { pending: 1 }, track: { full: 2 } },
      onStatusToggle,
      onTrackToggle,
    });
    expect(onStatusToggle).not.toHaveBeenCalled();
    expect(onTrackToggle).not.toHaveBeenCalled();
  });

  it('rerendering with the same props does not duplicate onStatusToggle calls', async () => {
    const user = userEvent.setup();
    const onStatusToggle = vi.fn();
    const { rerender, props } = renderFacets({
      facets: { status: { pending: 1 } },
      onStatusToggle,
    });
    rerender(<MeetingsSearchFacets {...props} />);
    await user.click(screen.getByRole('button', { name: 'pending=1' }));
    expect(onStatusToggle).toHaveBeenCalledTimes(1);
  });

  it('rerendering with new facets replaces the rendered chips', () => {
    const { rerender, props } = renderFacets({
      facets: { status: { pending: 1 } },
    });
    expect(
      screen.getByRole('button', { name: 'pending=1' }),
    ).toBeInTheDocument();
    rerender(
      <MeetingsSearchFacets
        {...props}
        facets={{ status: { completed: 9 } }}
      />,
    );
    expect(
      screen.queryByRole('button', { name: 'pending=1' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'completed=9' }),
    ).toBeInTheDocument();
  });

  it('rerendering from populated facets to empty drops every chip', () => {
    const { rerender, props } = renderFacets({
      facets: { status: { pending: 1 }, track: { full: 2 } },
    });
    expect(screen.getAllByRole('button')).toHaveLength(2);
    rerender(
      <MeetingsSearchFacets {...props} facets={{ status: {}, track: {} }} />,
    );
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('re-renders when the locale flips (useLocale subscription)', () => {
    renderFacets({
      facets: { status: { pending: 2 } },
    });
    expect(
      screen.getByRole('button', { name: 'pending=2' }),
    ).toHaveAttribute('title', 'Filter by status=pending');
    act(() => {
      setLocale('ko');
    });
    // After the locale flip the English title is gone -- the Korean
    // bundle overrides the title copy.
    expect(
      screen.getByRole('button', { name: 'pending=2' }).getAttribute('title'),
    ).not.toBe('Filter by status=pending');
  });
});
