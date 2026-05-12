import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import { FEATURES } from '../pages/registry';
import { HelpDrawer } from './HelpDrawer';

// HelpDrawer is the right-side slide-out help overlay. State machine:
// open=false leaves the drawer in the DOM but applies the inert
// attribute + translate-x-full so it cannot receive events and slides
// off-canvas; open=true reveals the dimmed backdrop + slid-in aside.
// Search filters the FEATURES-derived entries; the matching
// activeFeatureId card is highlighted via data-active. The
// Escape-to-close + focus-on-open + scroll-into-view contracts live in
// dedicated hooks (use-drawer-keyboard, use-scroll-into-view-on-open)
// which have their own unit tests -- HelpDrawer wires them up and we
// cover the integration through the real wiring here. Tests drive the
// prop union directly with vi.fn() callbacks for the close path.

beforeEach(() => {
  setLocale('en');
});

function renderDrawer(
  overrides: Partial<Parameters<typeof HelpDrawer>[0]> = {},
) {
  const onClose = vi.fn();
  const props = {
    open: true,
    onClose,
    activeFeatureId: null as string | null,
    ...overrides,
  };
  const utils = render(<HelpDrawer {...props} />);
  const user = userEvent.setup();
  return { ...utils, user, onClose, props };
}

describe('<HelpDrawer>', () => {
  // ---- dialog scaffolding ----------------------------------------

  it('renders a single dialog element', () => {
    renderDrawer();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('marks the dialog with aria-modal="true"', () => {
    renderDrawer();
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });

  it('uses the localized "Help center" string as the dialog aria-label', () => {
    renderDrawer();
    expect(
      screen.getByRole('dialog', { name: 'Help center' }),
    ).toBeInTheDocument();
  });

  it('marks the dialog with the data-help-drawer hook so other code can locate it', () => {
    renderDrawer();
    expect(
      screen.getByRole('dialog').getAttribute('data-help-drawer'),
    ).not.toBeNull();
  });

  it('sets data-open="true" on the dialog when open=true', () => {
    renderDrawer({ open: true });
    expect(screen.getByRole('dialog')).toHaveAttribute('data-open', 'true');
  });

  it('sets data-open="false" on the dialog when open=false', () => {
    renderDrawer({ open: false });
    expect(screen.getByRole('dialog')).toHaveAttribute('data-open', 'false');
  });

  // ---- open vs closed transform ---------------------------------

  it('applies the on-canvas translate-x-0 transform when open=true', () => {
    renderDrawer({ open: true });
    expect(screen.getByRole('dialog').className).toMatch(/translate-x-0/);
  });

  it('applies the off-canvas translate-x-full transform when open=false', () => {
    renderDrawer({ open: false });
    expect(screen.getByRole('dialog').className).toMatch(/translate-x-full/);
  });

  it('marks the outer overlay inert when open=false', () => {
    renderDrawer({ open: false });
    const overlay = screen.getByRole('dialog').parentElement as HTMLElement;
    expect(overlay.hasAttribute('inert')).toBe(true);
  });

  it('drops the inert attribute on the outer overlay when open=true', () => {
    renderDrawer({ open: true });
    const overlay = screen.getByRole('dialog').parentElement as HTMLElement;
    expect(overlay.hasAttribute('inert')).toBe(false);
  });

  it('applies pointer-events-none on the backdrop when open=false', () => {
    renderDrawer({ open: false });
    const overlay = screen.getByRole('dialog').parentElement as HTMLElement;
    expect(overlay.className).toMatch(/pointer-events-none/);
  });

  it('drops pointer-events-none from the backdrop when open=true', () => {
    renderDrawer({ open: true });
    const overlay = screen.getByRole('dialog').parentElement as HTMLElement;
    expect(overlay.className).not.toMatch(/pointer-events-none/);
  });

  // ---- header ---------------------------------------------------

  it('renders the localized help title heading in the header', () => {
    renderDrawer();
    expect(
      screen.getByRole('heading', { level: 2, name: 'C4 help' }),
    ).toBeInTheDocument();
  });

  it('renders the X close icon button in the header with the localized aria-label', () => {
    const { container } = renderDrawer();
    const header = container.querySelector('header') as HTMLElement;
    expect(
      within(header).getByRole('button', { name: 'Close' }),
    ).toBeInTheDocument();
  });

  // ---- search input ---------------------------------------------

  it('renders the search input with the localized aria-label "Search help"', () => {
    renderDrawer();
    expect(screen.getByLabelText('Search help')).toBeInTheDocument();
  });

  it('renders the search input with the localized placeholder "Search help"', () => {
    renderDrawer();
    expect(screen.getByPlaceholderText('Search help')).toBeInTheDocument();
  });

  it('focuses the search input after open=true (useDrawerKeyboard rAF)', async () => {
    renderDrawer({ open: true });
    await waitFor(() => {
      expect(screen.getByLabelText('Search help')).toHaveFocus();
    });
  });

  // ---- intro section --------------------------------------------

  it('renders the global intro paragraph copy', () => {
    renderDrawer();
    expect(screen.getByText(/C4 runs a local daemon/)).toBeInTheDocument();
  });

  it('renders the feature-nav paragraph copy', () => {
    renderDrawer();
    expect(
      screen.getByText(/Use the Features tab to open/),
    ).toBeInTheDocument();
  });

  it('renders the cli-mapping paragraph copy', () => {
    renderDrawer();
    expect(
      screen.getByText(/Most pages show their CLI equivalent/),
    ).toBeInTheDocument();
  });

  it('renders the shortcut hint copy in the intro AND the footer (two occurrences)', () => {
    renderDrawer();
    expect(
      screen.getAllByText(/Press \? any time/).length,
    ).toBeGreaterThanOrEqual(2);
  });

  // ---- feature entries -----------------------------------------

  it('renders one card per FEATURES entry on the default render', () => {
    const { container } = renderDrawer();
    const cards = container.querySelectorAll('[data-help-entry]');
    expect(cards).toHaveLength(FEATURES.length);
  });

  it('renders the localized title for each known feature card', () => {
    renderDrawer();
    expect(screen.getByText('Scribe')).toBeInTheDocument();
    expect(screen.getByText('Batch')).toBeInTheDocument();
    expect(screen.getByText('Cleanup')).toBeInTheDocument();
  });

  it('renders the CLI hint code inside the scribe card', () => {
    renderDrawer();
    expect(
      screen.getByText('c4 scribe start|stop|scan|status'),
    ).toBeInTheDocument();
  });

  it('renders the summary paragraph for the scribe feature', () => {
    renderDrawer();
    expect(
      screen.getByText(/Session context recorder\. Tails worker/),
    ).toBeInTheDocument();
  });

  it('tags each card with a data-help-entry attribute matching the feature id', () => {
    const { container } = renderDrawer();
    const ids = Array.from(
      container.querySelectorAll('[data-help-entry]'),
    ).map((el) => el.getAttribute('data-help-entry'));
    for (const f of FEATURES) {
      expect(ids).toContain(f.id);
    }
  });

  // ---- search filter -------------------------------------------

  it('filters the entries when the user types into the search input', async () => {
    const { user, container } = renderDrawer();
    await user.type(screen.getByLabelText('Search help'), 'scribe');
    const cards = container.querySelectorAll('[data-help-entry]');
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.length).toBeLessThan(FEATURES.length);
    for (const card of cards) {
      expect(card.textContent?.toLowerCase()).toMatch(/scribe/);
    }
  });

  it('filters with case-insensitive matching (uppercase query)', async () => {
    const { user, container } = renderDrawer();
    await user.type(screen.getByLabelText('Search help'), 'SCRIBE');
    const cards = container.querySelectorAll('[data-help-entry]');
    expect(cards.length).toBeGreaterThan(0);
  });

  it('renders the localized "No matches." copy when the query matches nothing', async () => {
    const { user } = renderDrawer();
    await user.type(
      screen.getByLabelText('Search help'),
      'zzzz-nothing-matches-this',
    );
    expect(screen.getByText('No matches.')).toBeInTheDocument();
  });

  it('drops the entries list when the query matches nothing', async () => {
    const { user, container } = renderDrawer();
    await user.type(
      screen.getByLabelText('Search help'),
      'zzzz-nothing-matches-this',
    );
    expect(container.querySelectorAll('[data-help-entry]')).toHaveLength(0);
  });

  it('restores the full entry list when the search input is cleared', async () => {
    const { user, container } = renderDrawer();
    const search = screen.getByLabelText('Search help');
    await user.type(search, 'scribe');
    await user.clear(search);
    expect(container.querySelectorAll('[data-help-entry]')).toHaveLength(
      FEATURES.length,
    );
  });

  it('treats whitespace-only queries as empty (no filtering)', async () => {
    const { user, container } = renderDrawer();
    await user.type(screen.getByLabelText('Search help'), '   ');
    expect(container.querySelectorAll('[data-help-entry]')).toHaveLength(
      FEATURES.length,
    );
  });

  // ---- active feature highlight --------------------------------

  it('does NOT mark any card data-active="true" when activeFeatureId is null', () => {
    const { container } = renderDrawer({ activeFeatureId: null });
    expect(
      container.querySelectorAll('[data-help-entry][data-active="true"]'),
    ).toHaveLength(0);
  });

  it('marks the matching card data-active="true" when activeFeatureId is a known feature id', () => {
    const { container } = renderDrawer({ activeFeatureId: 'scribe' });
    const active = container.querySelectorAll(
      '[data-help-entry][data-active="true"]',
    );
    expect(active).toHaveLength(1);
    expect(active[0].getAttribute('data-help-entry')).toBe('scribe');
  });

  it('does NOT mark any card active when activeFeatureId is an unknown id', () => {
    const { container } = renderDrawer({
      activeFeatureId: 'unknown-feature-id',
    });
    expect(
      container.querySelectorAll('[data-help-entry][data-active="true"]'),
    ).toHaveLength(0);
  });

  it('shifts the highlight when activeFeatureId prop changes', () => {
    const { rerender, container, props } = renderDrawer({
      activeFeatureId: 'scribe',
    });
    let active = container.querySelectorAll(
      '[data-help-entry][data-active="true"]',
    );
    expect(active[0].getAttribute('data-help-entry')).toBe('scribe');
    rerender(<HelpDrawer {...props} activeFeatureId="batch" />);
    active = container.querySelectorAll(
      '[data-help-entry][data-active="true"]',
    );
    expect(active).toHaveLength(1);
    expect(active[0].getAttribute('data-help-entry')).toBe('batch');
  });

  // ---- close paths --------------------------------------------

  it('fires onClose when the X icon button in the header is clicked', async () => {
    const { user, onClose, container } = renderDrawer();
    const header = container.querySelector('header') as HTMLElement;
    await user.click(within(header).getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('fires onClose when the footer Close button is clicked', async () => {
    const { user, onClose, container } = renderDrawer();
    const footer = container.querySelector('footer') as HTMLElement;
    await user.click(within(footer).getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('fires onClose when the outer backdrop overlay is clicked', async () => {
    const { user, onClose } = renderDrawer();
    const backdrop = screen.getByRole('dialog').parentElement as HTMLElement;
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire onClose when a click lands inside the aside (stopPropagation guard)', async () => {
    const { user, onClose } = renderDrawer();
    await user.click(screen.getByRole('heading', { name: 'C4 help' }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('fires onClose when Escape is pressed while open=true', async () => {
    const { user, onClose } = renderDrawer({ open: true });
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does NOT register the Escape listener when open=false', async () => {
    const onClose = vi.fn();
    render(
      <HelpDrawer open={false} onClose={onClose} activeFeatureId={null} />,
    );
    const user = userEvent.setup();
    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does NOT fire onClose on initial render', () => {
    const { onClose } = renderDrawer();
    expect(onClose).not.toHaveBeenCalled();
  });

  // ---- rerender stability -------------------------------------

  it('rerendering with the same props does not duplicate the heading', () => {
    const { rerender, props } = renderDrawer();
    rerender(<HelpDrawer {...props} />);
    expect(
      screen.getAllByRole('heading', { level: 2, name: 'C4 help' }),
    ).toHaveLength(1);
  });

  it('rerendering from open=false to open=true flips the on-canvas transform', () => {
    const { rerender, props } = renderDrawer({ open: false });
    expect(screen.getByRole('dialog').className).toMatch(/translate-x-full/);
    rerender(<HelpDrawer {...props} open={true} />);
    expect(screen.getByRole('dialog').className).toMatch(/translate-x-0/);
  });

  it('rerendering with a new onClose rebinds the close target', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender, container } = render(
      <HelpDrawer open={true} onClose={first} activeFeatureId={null} />,
    );
    rerender(
      <HelpDrawer open={true} onClose={second} activeFeatureId={null} />,
    );
    const user = userEvent.setup();
    const footer = container.querySelector('footer') as HTMLElement;
    await user.click(within(footer).getByRole('button', { name: 'Close' }));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  // ---- locale flip --------------------------------------------

  it('re-renders the dialog aria-label in Korean when the locale flips', () => {
    renderDrawer();
    expect(
      screen.getByRole('dialog', { name: 'Help center' }),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByRole('dialog', { name: 'Help center' }),
    ).not.toBeInTheDocument();
  });

  it('re-renders the title heading in Korean when the locale flips', () => {
    renderDrawer();
    expect(
      screen.getByRole('heading', { name: 'C4 help' }),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByRole('heading', { name: 'C4 help' }),
    ).not.toBeInTheDocument();
  });

  it('re-renders the No matches copy in Korean when the locale flips', async () => {
    const { user } = renderDrawer();
    await user.type(screen.getByLabelText('Search help'), 'zzzz-nope');
    expect(screen.getByText('No matches.')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('No matches.')).not.toBeInTheDocument();
  });
});
