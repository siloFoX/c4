import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type { AttachedSession } from './SessionsView';

// SessionsAttachedSection composes SessionsEmptyAttachBanner +
// SessionsAttachedRowActions inside its row list. We stub both
// children to thin markers so the section test exercises the
// section's branching logic in isolation — the row-actions
// component owns useAttachProcessState (a 30s poll) and has its
// own coverage, so booting it here would force a network mock for
// no value.

let lastEmptyBannerProps: { onAttachClick: () => void } | null = null;
let lastRowActionsProps:
  | {
      session: AttachedSession;
      isSelected: boolean;
      onView: () => void;
      onDetach: () => void;
    }
  | null = null;

vi.mock('./SessionsEmptyAttachBanner', () => ({
  default: ({ onAttachClick }: { onAttachClick: () => void }) => {
    lastEmptyBannerProps = { onAttachClick };
    return (
      <div data-testid="empty-attach-banner">
        <button
          type="button"
          data-testid="banner-attach-click"
          onClick={onAttachClick}
        >
          attach
        </button>
      </div>
    );
  },
}));

vi.mock('./SessionsAttachedRowActions', () => ({
  default: ({
    session,
    isSelected,
    onView,
    onDetach,
  }: {
    session: AttachedSession;
    isSelected: boolean;
    onView: () => void;
    onDetach: () => void;
  }) => {
    lastRowActionsProps = { session, isSelected, onView, onDetach };
    return (
      <div
        data-testid={`row-actions-${session.name}`}
        data-selected={isSelected ? 'true' : 'false'}
      >
        <button
          type="button"
          data-testid={`row-actions-view-${session.name}`}
          onClick={onView}
        >
          view
        </button>
        <button
          type="button"
          data-testid={`row-actions-detach-${session.name}`}
          onClick={onDetach}
        >
          detach
        </button>
      </div>
    );
  },
}));

import SessionsAttachedSection from './SessionsAttachedSection';

function makeAttached(over: Partial<AttachedSession> = {}): AttachedSession {
  return {
    name: 'w1',
    jsonlPath: '/var/c4/w1.jsonl',
    sessionId: 'aaaabbbbccccdddd1111',
    projectPath: '/repo/p',
    createdAt: '2026-05-01T00:00:00Z',
    lastOffset: 0,
    role: 'worker',
    ...over,
  };
}

const SAMPLE: AttachedSession[] = [
  makeAttached({ name: 'w1' }),
  makeAttached({
    name: 'w2',
    sessionId: null,
    projectPath: null,
    createdAt: null,
  }),
];

beforeEach(() => {
  setLocale('en');
  lastEmptyBannerProps = null;
  lastRowActionsProps = null;
});

function getHeadingButton(): HTMLElement {
  return screen
    .getByText('Attached', { selector: 'span' })
    .closest('button') as HTMLElement;
}

function renderSection(
  overrides: Partial<Parameters<typeof SessionsAttachedSection>[0]> = {},
) {
  const onToggle = vi.fn();
  const onSelect = vi.fn();
  const onAttachClick = vi.fn();
  const onDetach = vi.fn();
  const props = {
    collapsed: false,
    onToggle,
    filtered: SAMPLE,
    error: null as string | null,
    selectedName: null as string | null,
    onSelect,
    onAttachClick,
    onDetach,
    ...overrides,
  };
  const utils = render(<SessionsAttachedSection {...props} />);
  const user = userEvent.setup();
  return { ...utils, user, onToggle, onSelect, onAttachClick, onDetach, props };
}

describe('<SessionsAttachedSection>', () => {
  it('renders the collapsible Attached heading button', () => {
    renderSection();
    expect(getHeadingButton()).toBeInTheDocument();
  });

  it('renders an AvatarGroup roster in the heading when items exist', () => {
    // (v1.11.272, TODO 11.254) The plain count chip was replaced
    // by an AvatarGroup roster preview that exposes the same count
    // via the role=group + data-count attribute.
    renderSection();
    const heading = getHeadingButton();
    const roster = within(heading).getByTestId('sessions-attached-roster');
    expect(roster.getAttribute('data-count')).toBe('2');
  });

  it('falls back to the count chip when the filtered list is empty', () => {
    renderSection({ filtered: [] });
    expect(within(getHeadingButton()).getByText('0')).toBeInTheDocument();
  });

  it('sets aria-expanded=true on the heading when collapsed=false', () => {
    renderSection({ collapsed: false });
    expect(getHeadingButton()).toHaveAttribute('aria-expanded', 'true');
  });

  it('sets aria-expanded=false on the heading when collapsed=true', () => {
    renderSection({ collapsed: true });
    expect(getHeadingButton()).toHaveAttribute('aria-expanded', 'false');
  });

  it('fires onToggle once when the heading is clicked', async () => {
    const { user, onToggle } = renderSection();
    await user.click(getHeadingButton());
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('renders the attached row buttons when not collapsed + not empty + not error', () => {
    renderSection();
    expect(screen.getByText('w1')).toBeInTheDocument();
    expect(screen.getByText('w2')).toBeInTheDocument();
  });

  it('renders the SessionsAttachedRowActions marker per row', () => {
    renderSection();
    expect(screen.getByTestId('row-actions-w1')).toBeInTheDocument();
    expect(screen.getByTestId('row-actions-w2')).toBeInTheDocument();
  });

  it('forwards the session record + selection flag into the row-actions child', () => {
    renderSection({ selectedName: 'w1' });
    expect(screen.getByTestId('row-actions-w1')).toHaveAttribute(
      'data-selected',
      'true',
    );
    expect(screen.getByTestId('row-actions-w2')).toHaveAttribute(
      'data-selected',
      'false',
    );
  });

  it('hides every row when collapsed=true', () => {
    renderSection({ collapsed: true });
    expect(screen.queryByText('w1')).not.toBeInTheDocument();
    expect(screen.queryByText('w2')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('row-actions-w1'),
    ).not.toBeInTheDocument();
  });

  it('renders the error banner with the destructive tone when error is set', () => {
    renderSection({ error: 'cannot load', filtered: [] });
    const err = screen.getByText('cannot load');
    expect(err).toHaveClass('text-destructive');
  });

  it('renders neither the empty banner nor any row when error is set', () => {
    renderSection({ error: 'cannot load' });
    expect(
      screen.queryByTestId('empty-attach-banner'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('w1')).not.toBeInTheDocument();
  });

  it('renders the empty banner when filtered is empty and no error', () => {
    renderSection({ filtered: [] });
    expect(
      screen.getByTestId('empty-attach-banner'),
    ).toBeInTheDocument();
  });

  it('forwards the onAttachClick callback through to the empty banner', async () => {
    const { user, onAttachClick } = renderSection({ filtered: [] });
    await user.click(screen.getByTestId('banner-attach-click'));
    expect(onAttachClick).toHaveBeenCalledTimes(1);
  });

  it('does not render the empty banner when there is at least one attached row', () => {
    renderSection();
    expect(
      screen.queryByTestId('empty-attach-banner'),
    ).not.toBeInTheDocument();
  });

  it('marks the row matching selectedName with aria-current=true', () => {
    renderSection({ selectedName: 'w1' });
    const row = screen.getByText('w1').closest('button') as HTMLElement;
    expect(row).toHaveAttribute('aria-current', 'true');
  });

  it('omits aria-current on the non-selected row', () => {
    renderSection({ selectedName: 'w1' });
    const row = screen.getByText('w2').closest('button') as HTMLElement;
    expect(row).not.toHaveAttribute('aria-current');
  });

  it('fires onSelect with the row name when the row body button is clicked', async () => {
    const { user, onSelect } = renderSection();
    const row = screen.getByText('w1').closest('button') as HTMLElement;
    await user.click(row);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('w1');
  });

  it('fires onSelect when the inner View action is clicked', async () => {
    const { user, onSelect } = renderSection();
    await user.click(screen.getByTestId('row-actions-view-w1'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('w1');
  });

  it('fires onDetach when the inner Detach action is clicked', async () => {
    const { user, onDetach } = renderSection();
    await user.click(screen.getByTestId('row-actions-detach-w1'));
    expect(onDetach).toHaveBeenCalledTimes(1);
    expect(onDetach).toHaveBeenCalledWith('w1');
  });

  it('renders the attached badge text inside the row body', () => {
    renderSection();
    const row = screen.getByText('w1').closest('button') as HTMLElement;
    expect(within(row).getByText('attached')).toBeInTheDocument();
  });

  it('renders the projectPath when present in the row body', () => {
    renderSection();
    expect(screen.getByText('/repo/p')).toBeInTheDocument();
  });

  it('falls back to jsonlPath when projectPath is null in the row body', () => {
    renderSection();
    expect(screen.getByText('/var/c4/w1.jsonl')).toBeInTheDocument();
  });

  it('renders the placeholder dash when sessionId is null in the row body', () => {
    renderSection();
    const row = screen.getByText('w2').closest('button') as HTMLElement;
    expect(within(row).getByText('-')).toBeInTheDocument();
  });

  it('renders the relative timestamp prefix when createdAt is set', () => {
    renderSection();
    const row = screen.getByText('w1').closest('button') as HTMLElement;
    const dashSpans = within(row).getAllByText(/^-\s\S/);
    expect(dashSpans.length).toBeGreaterThan(0);
  });

  it('does not render the relative timestamp prefix when createdAt is null', () => {
    renderSection();
    const row = screen.getByText('w2').closest('button') as HTMLElement;
    const dashSpans = within(row).queryAllByText(/^-\s\S/);
    expect(dashSpans).toHaveLength(0);
  });

  it('applies the active highlight class on the selected row', () => {
    renderSection({ selectedName: 'w1' });
    const row = screen
      .getByText('w1')
      .closest('button')?.parentElement as HTMLElement;
    expect(row.className).toMatch(/bg-accent/);
  });

  it('applies the hover class on a non-selected row', () => {
    renderSection({ selectedName: 'w1' });
    const row = screen
      .getByText('w2')
      .closest('button')?.parentElement as HTMLElement;
    expect(row.className).toMatch(/hover:bg-accent/);
  });

  it('rerendering with the same props does not duplicate the heading', () => {
    const { rerender, props } = renderSection();
    rerender(<SessionsAttachedSection {...props} />);
    expect(
      screen.getAllByText('Attached', { selector: 'span' }),
    ).toHaveLength(1);
  });

  it('renders translated copy when the locale flips to ko', () => {
    renderSection();
    expect(getHeadingButton()).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByText('Attached', { selector: 'span' }),
    ).not.toBeInTheDocument();
  });

  it('forwards onAttachClick into useEmptyAttachBanner via the marker', async () => {
    renderSection({ filtered: [] });
    expect(typeof lastEmptyBannerProps?.onAttachClick).toBe('function');
  });

  it('forwards the session object identity into the row actions child', () => {
    renderSection();
    expect(lastRowActionsProps?.session.name).toBe('w2');
  });
});
