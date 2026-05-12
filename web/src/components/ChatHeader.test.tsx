import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import ChatHeader, { type BackfillSource } from './ChatHeader';

// ChatHeader is the pure-display card header for the per-worker
// chat panel: title + description, optional backfill-count Badge,
// always-rendered SSE-live Badge, and an optional jump-to-latest
// Button. Parent owns the workerName, the backfill counters, the
// SSE state, the autoScroll flag, and the onJumpToBottom callback.
// Tests drive the full prop union directly.

beforeEach(() => {
  setLocale('en');
});

function renderHeader(
  overrides: Partial<Parameters<typeof ChatHeader>[0]> = {},
) {
  const onJumpToBottom = vi.fn();
  const props = {
    workerName: 'w1',
    backfillCount: 0,
    backfillSource: null as BackfillSource,
    sseConnected: false,
    autoScroll: true,
    onJumpToBottom,
    ...overrides,
  };
  const utils = render(<ChatHeader {...props} />);
  const user = userEvent.setup();
  return { ...utils, user, onJumpToBottom, props };
}

describe('<ChatHeader>', () => {
  // ---- title + description ---------------------------------------

  it('renders the i18n title "Chat" inside the card header', () => {
    renderHeader();
    expect(screen.getByText('Chat')).toBeInTheDocument();
  });

  it('renders the i18n description with the workerName interpolated', () => {
    renderHeader({ workerName: 'alpha' });
    expect(
      screen.getByText('Live worker stream for alpha'),
    ).toBeInTheDocument();
  });

  it('updates the rendered description when the workerName prop changes', () => {
    const { rerender, props } = renderHeader({ workerName: 'one' });
    expect(
      screen.getByText('Live worker stream for one'),
    ).toBeInTheDocument();
    rerender(<ChatHeader {...props} workerName="two" />);
    expect(
      screen.queryByText('Live worker stream for one'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('Live worker stream for two'),
    ).toBeInTheDocument();
  });

  // ---- backfill badge (count > 0 reveal) -------------------------

  it('does NOT render the backfill-count badge when backfillCount is 0', () => {
    renderHeader({ backfillCount: 0 });
    expect(screen.queryByText(/Loaded/)).not.toBeInTheDocument();
  });

  it('renders the singular backfill copy when backfillCount is 1', () => {
    renderHeader({ backfillCount: 1 });
    expect(screen.getByText('Loaded 1 past message')).toBeInTheDocument();
  });

  it('renders the plural backfill copy when backfillCount is greater than 1', () => {
    renderHeader({ backfillCount: 12 });
    expect(screen.getByText('Loaded 12 past messages')).toBeInTheDocument();
  });

  it('renders the plural backfill copy when backfillCount is 2 (boundary)', () => {
    renderHeader({ backfillCount: 2 });
    expect(screen.getByText('Loaded 2 past messages')).toBeInTheDocument();
  });

  it('omits the backfill badge when backfillCount is negative (treated as 0 by `>` gate)', () => {
    renderHeader({ backfillCount: -1 });
    expect(screen.queryByText(/Loaded/)).not.toBeInTheDocument();
  });

  // ---- backfill source title (tooltip) ---------------------------

  it('sets the backfill badge title to the session-source tooltip when source=session', () => {
    const { container } = renderHeader({
      backfillCount: 3,
      backfillSource: 'session',
    });
    const badgeWithTitle = container.querySelector('[title]');
    expect(badgeWithTitle).not.toBeNull();
    expect(badgeWithTitle).toHaveAttribute(
      'title',
      'Loaded from session JSONL',
    );
  });

  it('sets the backfill badge title to the scrollback-source tooltip when source=scrollback', () => {
    const { container } = renderHeader({
      backfillCount: 3,
      backfillSource: 'scrollback',
    });
    const badgeWithTitle = container.querySelector('[title]');
    expect(badgeWithTitle).toHaveAttribute('title', 'Loaded from scrollback');
  });

  it('falls back to the scrollback-source tooltip when source is null but count > 0', () => {
    const { container } = renderHeader({
      backfillCount: 3,
      backfillSource: null,
    });
    const badgeWithTitle = container.querySelector('[title]');
    expect(badgeWithTitle).toHaveAttribute('title', 'Loaded from scrollback');
  });

  // ---- SSE live badge --------------------------------------------

  it('renders the "live" label inside the SSE badge when sseConnected=true', () => {
    renderHeader({ sseConnected: true });
    expect(screen.getByText('live')).toBeInTheDocument();
  });

  it('renders the "disconnected" label inside the SSE badge when sseConnected=false', () => {
    renderHeader({ sseConnected: false });
    expect(screen.getByText('disconnected')).toBeInTheDocument();
  });

  it('does NOT render "disconnected" when sseConnected=true', () => {
    renderHeader({ sseConnected: true });
    expect(screen.queryByText('disconnected')).not.toBeInTheDocument();
  });

  it('does NOT render "live" when sseConnected=false', () => {
    renderHeader({ sseConnected: false });
    expect(screen.queryByText('live')).not.toBeInTheDocument();
  });

  it('marks the SSE badge with aria-live="polite" so screen readers hear the live/disconnected flip', () => {
    renderHeader({ sseConnected: true });
    const live = screen.getByText('live').closest('[aria-live]');
    expect(live).not.toBeNull();
    expect(live).toHaveAttribute('aria-live', 'polite');
  });

  it('marks the SSE indicator dot as aria-hidden so it does not steal an accessible name', () => {
    const { container } = renderHeader({ sseConnected: true });
    const dot = container.querySelector(
      'span[aria-hidden="true"].inline-block.h-1\\.5',
    );
    expect(dot).not.toBeNull();
  });

  // ---- jump-to-latest button (autoScroll=false reveal) -----------

  it('does NOT render the jump-to-latest button when autoScroll=true', () => {
    renderHeader({ autoScroll: true });
    expect(
      screen.queryByRole('button', { name: /Jump to latest/ }),
    ).not.toBeInTheDocument();
  });

  it('renders the jump-to-latest button when autoScroll=false', () => {
    renderHeader({ autoScroll: false });
    expect(
      screen.getByRole('button', { name: /Jump to latest/ }),
    ).toBeInTheDocument();
  });

  it('renders the jump-to-latest button as type="button" so it does not submit a form', () => {
    renderHeader({ autoScroll: false });
    const btn = screen.getByRole('button', { name: /Jump to latest/ });
    expect(btn).toHaveAttribute('type', 'button');
  });

  // ---- onJumpToBottom callback wiring -----------------------------

  it('fires onJumpToBottom once when the jump-to-latest button is clicked', async () => {
    const { user, onJumpToBottom } = renderHeader({ autoScroll: false });
    await user.click(screen.getByRole('button', { name: /Jump to latest/ }));
    expect(onJumpToBottom).toHaveBeenCalledTimes(1);
  });

  it('fires onJumpToBottom on Enter activation when the jump-to-latest button is focused', async () => {
    const { user, onJumpToBottom } = renderHeader({ autoScroll: false });
    const btn = screen.getByRole('button', { name: /Jump to latest/ });
    btn.focus();
    await user.keyboard('{Enter}');
    expect(onJumpToBottom).toHaveBeenCalledTimes(1);
  });

  it('fires onJumpToBottom on Space activation when the jump-to-latest button is focused', async () => {
    const { user, onJumpToBottom } = renderHeader({ autoScroll: false });
    const btn = screen.getByRole('button', { name: /Jump to latest/ });
    btn.focus();
    await user.keyboard(' ');
    expect(onJumpToBottom).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire onJumpToBottom on initial render', () => {
    const { onJumpToBottom } = renderHeader({ autoScroll: false });
    expect(onJumpToBottom).not.toHaveBeenCalled();
  });

  it('does NOT fire onJumpToBottom when the button is hidden (autoScroll=true)', () => {
    const { onJumpToBottom } = renderHeader({ autoScroll: true });
    expect(onJumpToBottom).not.toHaveBeenCalled();
  });

  // ---- button count + role layout --------------------------------

  it('renders zero buttons when autoScroll=true (no jump-to-latest)', () => {
    renderHeader({ autoScroll: true });
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('renders exactly one button when autoScroll=false (jump-to-latest only)', () => {
    renderHeader({ autoScroll: false });
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  // ---- combined branches -----------------------------------------

  it('renders backfill badge + live SSE badge + jump button together when every branch is on', () => {
    const { container } = renderHeader({
      backfillCount: 4,
      backfillSource: 'session',
      sseConnected: true,
      autoScroll: false,
    });
    expect(screen.getByText('Loaded 4 past messages')).toBeInTheDocument();
    expect(screen.getByText('live')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Jump to latest/ }),
    ).toBeInTheDocument();
    // Badge with title should be the backfill one.
    const titled = container.querySelector('[title]');
    expect(titled).toHaveAttribute('title', 'Loaded from session JSONL');
  });

  it('renders only the SSE badge when count=0 and autoScroll=true', () => {
    renderHeader({
      backfillCount: 0,
      sseConnected: false,
      autoScroll: true,
    });
    expect(screen.queryByText(/Loaded/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Jump to latest/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('disconnected')).toBeInTheDocument();
  });

  // ---- rerender stability ----------------------------------------

  it('rerendering from count=0 to count>0 reveals the backfill badge', () => {
    const { rerender, props } = renderHeader({ backfillCount: 0 });
    expect(screen.queryByText(/Loaded/)).not.toBeInTheDocument();
    rerender(<ChatHeader {...props} backfillCount={3} />);
    expect(screen.getByText('Loaded 3 past messages')).toBeInTheDocument();
  });

  it('rerendering from sseConnected=false to true flips the SSE badge label', () => {
    const { rerender, props } = renderHeader({ sseConnected: false });
    expect(screen.getByText('disconnected')).toBeInTheDocument();
    rerender(<ChatHeader {...props} sseConnected={true} />);
    expect(screen.queryByText('disconnected')).not.toBeInTheDocument();
    expect(screen.getByText('live')).toBeInTheDocument();
  });

  it('rerendering from autoScroll=true to false reveals the jump-to-latest button', () => {
    const { rerender, props } = renderHeader({ autoScroll: true });
    expect(
      screen.queryByRole('button', { name: /Jump to latest/ }),
    ).not.toBeInTheDocument();
    rerender(<ChatHeader {...props} autoScroll={false} />);
    expect(
      screen.getByRole('button', { name: /Jump to latest/ }),
    ).toBeInTheDocument();
  });

  it('rerendering from autoScroll=false to true drops the jump-to-latest button', () => {
    const { rerender, props } = renderHeader({ autoScroll: false });
    expect(
      screen.getByRole('button', { name: /Jump to latest/ }),
    ).toBeInTheDocument();
    rerender(<ChatHeader {...props} autoScroll={true} />);
    expect(
      screen.queryByRole('button', { name: /Jump to latest/ }),
    ).not.toBeInTheDocument();
  });

  it('rerendering with the same props does not duplicate the title or the SSE badge', () => {
    const { rerender, props } = renderHeader({ sseConnected: true });
    rerender(<ChatHeader {...props} />);
    expect(screen.getAllByText('Chat')).toHaveLength(1);
    expect(screen.getAllByText('live')).toHaveLength(1);
  });

  // ---- locale flip ------------------------------------------------

  it('re-renders the title in Korean when the locale flips', () => {
    renderHeader();
    expect(screen.getByText('Chat')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('Chat')).not.toBeInTheDocument();
  });

  it('re-renders the description in Korean when the locale flips', () => {
    renderHeader({ workerName: 'w1' });
    expect(
      screen.getByText('Live worker stream for w1'),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByText('Live worker stream for w1'),
    ).not.toBeInTheDocument();
  });

  it('re-renders the jump-to-latest label in Korean when the locale flips', () => {
    renderHeader({ autoScroll: false });
    expect(
      screen.getByRole('button', { name: /Jump to latest/ }),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByRole('button', { name: /Jump to latest/ }),
    ).not.toBeInTheDocument();
  });

  // ---- description scopes within card header ---------------------

  it('renders the description in the same CardHeader subtree as the title (no leakage)', () => {
    const { container } = renderHeader({ workerName: 'scoped' });
    const header = container.firstChild as HTMLElement;
    expect(within(header).getByText('Chat')).toBeInTheDocument();
    expect(
      within(header).getByText('Live worker stream for scoped'),
    ).toBeInTheDocument();
  });
});
