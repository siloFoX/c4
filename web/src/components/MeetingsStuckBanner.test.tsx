import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import MeetingsStuckBanner, {
  type StuckResponse,
} from './MeetingsStuckBanner';
import type { MeetingStatus } from './MeetingsView';

// MeetingsStuckBanner is a pure-display chain-of-buttons. Parent
// owns the polled stuck-meetings payload + the navigation
// callback. Tests drive the full prop union directly: the null
// + count===0 hidden branches, the count>0 visible branch, the
// per-entry button rendering (id + ageHours suffix), the title
// composition (title · status · ageHours), the slice(0, 5) cap +
// the "... and N more" overflow indicator, the onNavigate(id)
// payload, and the locale-flip re-render.

function makeEntry(over: Partial<{
  id: string;
  status: MeetingStatus;
  track: string;
  title: string;
  ageHours: number;
}> = {}) {
  return {
    id: 'mtg-1',
    status: 'pending' as MeetingStatus,
    track: 'standard',
    title: 'Stuck meeting',
    ageHours: 1.5,
    ...over,
  };
}

function makeResponse(over: Partial<StuckResponse> = {}): StuckResponse {
  const stuck = over.stuck ?? [makeEntry()];
  return {
    count: over.count ?? stuck.length,
    stuck,
  };
}

beforeEach(() => {
  setLocale('en');
});

function renderBanner(
  overrides: Partial<Parameters<typeof MeetingsStuckBanner>[0]> = {},
) {
  const props = {
    stuck: makeResponse(),
    onNavigate: vi.fn(),
    ...overrides,
  };
  const utils = render(<MeetingsStuckBanner {...props} />);
  return { ...utils, props };
}

describe('<MeetingsStuckBanner>', () => {
  // ---- hidden branches --------------------------------------------

  it('renders nothing when stuck is null', () => {
    const { container } = renderBanner({ stuck: null });
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when stuck.count is 0 (even with empty stuck array)', () => {
    const { container } = renderBanner({
      stuck: makeResponse({ count: 0, stuck: [] }),
    });
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when stuck.count is 0 even if stuck array is non-empty (count is the gate)', () => {
    // Defensive case: the daemon should keep `count` and `stuck`
    // in sync, but the banner trusts `count` for the visibility
    // gate, so a 0-count payload hides regardless of the array.
    const { container } = renderBanner({
      stuck: makeResponse({ count: 0, stuck: [makeEntry()] }),
    });
    expect(container.firstChild).toBeNull();
  });

  // ---- visible branches -------------------------------------------

  it('renders the banner wrapper when stuck.count > 0', () => {
    const { container } = renderBanner({
      stuck: makeResponse({ count: 1, stuck: [makeEntry()] }),
    });
    expect(container.firstChild).not.toBeNull();
  });

  it('renders the count + "meeting(s) stuck >1h:" header copy', () => {
    renderBanner({
      stuck: makeResponse({ count: 3, stuck: [makeEntry()] }),
    });
    expect(
      screen.getByText('3 meeting(s) stuck >1h:'),
    ).toBeInTheDocument();
  });

  it('renders the singular form unchanged (component does not pluralize)', () => {
    renderBanner({
      stuck: makeResponse({ count: 1, stuck: [makeEntry()] }),
    });
    expect(
      screen.getByText('1 meeting(s) stuck >1h:'),
    ).toBeInTheDocument();
  });

  it('renders one button per stuck entry up to a 5-entry cap', () => {
    renderBanner({
      stuck: makeResponse({
        count: 3,
        stuck: [
          makeEntry({ id: 'a' }),
          makeEntry({ id: 'b' }),
          makeEntry({ id: 'c' }),
        ],
      }),
    });
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('caps the rendered button list at 5 entries even when stuck array has more', () => {
    renderBanner({
      stuck: makeResponse({
        count: 7,
        stuck: [
          makeEntry({ id: 'a' }),
          makeEntry({ id: 'b' }),
          makeEntry({ id: 'c' }),
          makeEntry({ id: 'd' }),
          makeEntry({ id: 'e' }),
          makeEntry({ id: 'f' }),
          makeEntry({ id: 'g' }),
        ],
      }),
    });
    expect(screen.getAllByRole('button')).toHaveLength(5);
  });

  it('renders each entry button text as "<id> (<age>h)" with one decimal place', () => {
    renderBanner({
      stuck: makeResponse({
        count: 2,
        stuck: [
          makeEntry({ id: 'meet-a', ageHours: 1.234 }),
          makeEntry({ id: 'meet-b', ageHours: 2 }),
        ],
      }),
    });
    expect(
      screen.getByRole('button', { name: 'meet-a (1.2h)' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'meet-b (2.0h)' }),
    ).toBeInTheDocument();
  });

  it('rounds ageHours to one decimal place for the button label', () => {
    renderBanner({
      stuck: makeResponse({
        count: 1,
        stuck: [makeEntry({ id: 'rounded', ageHours: 3.789 })],
      }),
    });
    expect(
      screen.getByRole('button', { name: 'rounded (3.8h)' }),
    ).toBeInTheDocument();
  });

  it('composes the entry button title from "<title> · <status> · <age>h old"', () => {
    renderBanner({
      stuck: makeResponse({
        count: 1,
        stuck: [
          makeEntry({
            id: 'mtg-x',
            title: 'Migration sync',
            status: 'in-progress',
            ageHours: 4.5,
          }),
        ],
      }),
    });
    const btn = screen.getByRole('button', { name: 'mtg-x (4.5h)' });
    expect(btn).toHaveAttribute(
      'title',
      'Migration sync · in-progress · 4.5h old',
    );
  });

  it('reflects the entry status accurately in the title (pending vs in-progress)', () => {
    renderBanner({
      stuck: makeResponse({
        count: 2,
        stuck: [
          makeEntry({
            id: 'p',
            title: 'Pending one',
            status: 'pending',
            ageHours: 1.1,
          }),
          makeEntry({
            id: 'r',
            title: 'Running one',
            status: 'in-progress',
            ageHours: 2.2,
          }),
        ],
      }),
    });
    expect(
      screen.getByRole('button', { name: 'p (1.1h)' }),
    ).toHaveAttribute('title', 'Pending one · pending · 1.1h old');
    expect(
      screen.getByRole('button', { name: 'r (2.2h)' }),
    ).toHaveAttribute('title', 'Running one · in-progress · 2.2h old');
  });

  it('renders all entry buttons as type="button" so none submits a form', () => {
    renderBanner({
      stuck: makeResponse({
        count: 2,
        stuck: [
          makeEntry({ id: 'a' }),
          makeEntry({ id: 'b' }),
        ],
      }),
    });
    for (const btn of screen.getAllByRole('button')) {
      expect(btn).toHaveAttribute('type', 'button');
    }
  });

  it('marks the warning icon aria-hidden so the SVG does not steal an accessible name', () => {
    const { container } = renderBanner({
      stuck: makeResponse({ count: 1, stuck: [makeEntry()] }),
    });
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  // ---- overflow indicator -----------------------------------------

  it('does NOT render the overflow "... and N more" copy when count <= 5', () => {
    renderBanner({
      stuck: makeResponse({
        count: 5,
        stuck: [
          makeEntry({ id: 'a' }),
          makeEntry({ id: 'b' }),
          makeEntry({ id: 'c' }),
          makeEntry({ id: 'd' }),
          makeEntry({ id: 'e' }),
        ],
      }),
    });
    expect(screen.queryByText(/and \d+ more/)).not.toBeInTheDocument();
  });

  it('renders the overflow "... and N more" copy when count > 5', () => {
    renderBanner({
      stuck: makeResponse({
        count: 9,
        stuck: [
          makeEntry({ id: 'a' }),
          makeEntry({ id: 'b' }),
          makeEntry({ id: 'c' }),
          makeEntry({ id: 'd' }),
          makeEntry({ id: 'e' }),
          makeEntry({ id: 'f' }),
        ],
      }),
    });
    expect(screen.getByText(/and 4 more/)).toBeInTheDocument();
  });

  it('overflow N is exactly count-5 (NOT array.length-5)', () => {
    renderBanner({
      stuck: makeResponse({
        count: 12,
        // Only 6 entries actually delivered -- daemon may have truncated
        // the array but `count` reflects the full set.
        stuck: [
          makeEntry({ id: 'a' }),
          makeEntry({ id: 'b' }),
          makeEntry({ id: 'c' }),
          makeEntry({ id: 'd' }),
          makeEntry({ id: 'e' }),
          makeEntry({ id: 'f' }),
        ],
      }),
    });
    expect(screen.getByText(/and 7 more/)).toBeInTheDocument();
  });

  // ---- callback wiring --------------------------------------------

  it('fires onNavigate with the clicked entry id', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    renderBanner({
      onNavigate,
      stuck: makeResponse({
        count: 2,
        stuck: [
          makeEntry({ id: 'first' }),
          makeEntry({ id: 'second' }),
        ],
      }),
    });
    await user.click(screen.getByRole('button', { name: /^first/ }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith('first');
  });

  it('fires onNavigate with the second entry id when the second button is clicked', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    renderBanner({
      onNavigate,
      stuck: makeResponse({
        count: 2,
        stuck: [
          makeEntry({ id: 'first' }),
          makeEntry({ id: 'second' }),
        ],
      }),
    });
    await user.click(screen.getByRole('button', { name: /^second/ }));
    expect(onNavigate).toHaveBeenCalledWith('second');
  });

  it('fires onNavigate on Enter key activation', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    renderBanner({
      onNavigate,
      stuck: makeResponse({
        count: 1,
        stuck: [makeEntry({ id: 'kbd-1' })],
      }),
    });
    const btn = screen.getByRole('button', { name: /^kbd-1/ });
    btn.focus();
    await user.keyboard('{Enter}');
    expect(onNavigate).toHaveBeenCalledWith('kbd-1');
  });

  it('fires onNavigate on Space key activation', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    renderBanner({
      onNavigate,
      stuck: makeResponse({
        count: 1,
        stuck: [makeEntry({ id: 'kbd-2' })],
      }),
    });
    const btn = screen.getByRole('button', { name: /^kbd-2/ });
    btn.focus();
    await user.keyboard(' ');
    expect(onNavigate).toHaveBeenCalledWith('kbd-2');
  });

  it('does NOT fire onNavigate on initial render', () => {
    const onNavigate = vi.fn();
    renderBanner({ onNavigate });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('does NOT fire onNavigate when the banner is hidden (stuck=null)', () => {
    const onNavigate = vi.fn();
    renderBanner({ stuck: null, onNavigate });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  // ---- rerender stability -----------------------------------------

  it('rerendering with the same props does not duplicate onNavigate calls', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    const { rerender, props } = renderBanner({
      onNavigate,
      stuck: makeResponse({
        count: 1,
        stuck: [makeEntry({ id: 'rerender-1' })],
      }),
    });
    rerender(<MeetingsStuckBanner {...props} />);
    await user.click(screen.getByRole('button', { name: /^rerender-1/ }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('rerendering with a new stuck array replaces the rendered buttons', () => {
    const { rerender, props } = renderBanner({
      stuck: makeResponse({
        count: 2,
        stuck: [
          makeEntry({ id: 'old-1' }),
          makeEntry({ id: 'old-2' }),
        ],
      }),
    });
    expect(
      screen.getByRole('button', { name: /^old-1/ }),
    ).toBeInTheDocument();
    rerender(
      <MeetingsStuckBanner
        {...props}
        stuck={makeResponse({
          count: 2,
          stuck: [
            makeEntry({ id: 'new-1' }),
            makeEntry({ id: 'new-2' }),
          ],
        })}
      />,
    );
    expect(
      screen.queryByRole('button', { name: /^old-1/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^new-1/ }),
    ).toBeInTheDocument();
  });

  it('rerendering from stuck to null drops the banner entirely', () => {
    const { rerender, props, container } = renderBanner();
    expect(container.firstChild).not.toBeNull();
    rerender(<MeetingsStuckBanner {...props} stuck={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('rerendering from count>0 to count=0 drops the banner entirely', () => {
    const { rerender, props, container } = renderBanner();
    expect(container.firstChild).not.toBeNull();
    rerender(
      <MeetingsStuckBanner
        {...props}
        stuck={makeResponse({ count: 0, stuck: [] })}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('rerendering from count<=5 to count>5 reveals the overflow indicator', () => {
    const { rerender, props } = renderBanner({
      stuck: makeResponse({
        count: 3,
        stuck: [
          makeEntry({ id: 'a' }),
          makeEntry({ id: 'b' }),
          makeEntry({ id: 'c' }),
        ],
      }),
    });
    expect(screen.queryByText(/and \d+ more/)).not.toBeInTheDocument();
    rerender(
      <MeetingsStuckBanner
        {...props}
        stuck={makeResponse({
          count: 8,
          stuck: [
            makeEntry({ id: 'a' }),
            makeEntry({ id: 'b' }),
            makeEntry({ id: 'c' }),
            makeEntry({ id: 'd' }),
            makeEntry({ id: 'e' }),
            makeEntry({ id: 'f' }),
          ],
        })}
      />,
    );
    expect(screen.getByText(/and 3 more/)).toBeInTheDocument();
  });

  // ---- locale flip -------------------------------------------------

  it('re-renders without crashing when the locale flips (useLocale subscription)', () => {
    renderBanner({
      stuck: makeResponse({
        count: 2,
        stuck: [
          makeEntry({ id: 'mtg-locale', ageHours: 1.5 }),
        ],
      }),
    });
    // The component subscribes to locale via useLocale but the rendered
    // copy is locale-invariant (no t() lookups). Assert the entry
    // button + header copy survive the flip.
    expect(
      screen.getByRole('button', { name: 'mtg-locale (1.5h)' }),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.getByRole('button', { name: 'mtg-locale (1.5h)' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('2 meeting(s) stuck >1h:'),
    ).toBeInTheDocument();
  });
});
