import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import Notifications, { UNDO_BANNER_MS } from './Notifications';
import type { NotificationItem } from './Notifications';

// Notifications.tsx fetches /api/notifications and falls back to inline
// mocks when the response fails. The tests below stub the global fetch
// so each case drives a controlled set of items, then asserts on the
// rendered chips, timeline rows, mark-all-read button and empty state.

function makeItems(types: NotificationItem['type'][]): NotificationItem[] {
  const base = Date.now();
  return types.map((type, i) => ({
    id: `n-${i}`,
    type,
    title: `Event ${type} ${i}`,
    description: `desc ${i}`,
    timestamp: new Date(base - i * 60_000).toISOString(),
    read: false,
  }));
}

function mockFetchOk(items: NotificationItem[]) {
  const json = vi.fn(async () => ({ notifications: items }));
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    json,
  })) as unknown as typeof fetch;
}

function mockFetchFail() {
  globalThis.fetch = vi.fn(async () => {
    throw new Error('network down');
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  setLocale('en');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('<Notifications>', () => {
  it('renders the page title in the frame header', async () => {
    mockFetchOk(makeItems(['dispatch']));
    render(<Notifications />);
    expect(screen.getByText('Notifications')).toBeInTheDocument();
  });

  it('renders the filter chips for every type', async () => {
    mockFetchOk(makeItems(['dispatch']));
    render(<Notifications />);
    const group = screen.getByRole('group', {
      name: /Filter notifications by type/i,
    });
    for (const label of [
      'All',
      'Dispatch',
      'Complete',
      'Halt',
      'Escalation',
      'System',
    ]) {
      expect(within(group).getByText(label)).toBeInTheDocument();
    }
  });

  it('renders the mark-all-read button', async () => {
    mockFetchOk(makeItems(['dispatch']));
    render(<Notifications />);
    expect(
      screen.getByRole('button', {
        name: /Mark all notifications as read/i,
      }),
    ).toBeInTheDocument();
  });

  it('renders timeline rows when items are present', async () => {
    mockFetchOk(
      makeItems(['dispatch', 'complete', 'halt', 'system']),
    );
    render(<Notifications />);
    await waitFor(() => {
      expect(screen.getByText('Event dispatch 0')).toBeInTheDocument();
    });
    expect(screen.getByText('Event complete 1')).toBeInTheDocument();
    expect(screen.getByText('Event halt 2')).toBeInTheDocument();
    expect(screen.getByText('Event system 3')).toBeInTheDocument();
  });

  it('clicking a chip filters the visible entries', async () => {
    const user = userEvent.setup();
    mockFetchOk(
      makeItems(['dispatch', 'complete', 'halt', 'escalation', 'system']),
    );
    render(<Notifications />);
    await waitFor(() => {
      expect(screen.getByText('Event dispatch 0')).toBeInTheDocument();
    });
    // Five items rendered (one per type).
    expect(screen.getAllByText(/^Event /).length).toBe(5);

    const halt = screen
      .getByRole('group', { name: /Filter notifications by type/i })
      .querySelector('[data-filter="halt"]') as HTMLButtonElement;
    await user.click(halt);

    await waitFor(() => {
      expect(screen.getAllByText(/^Event /).length).toBe(1);
    });
    expect(screen.getByText('Event halt 2')).toBeInTheDocument();
  });

  it('renders the empty state when the filter matches no items', async () => {
    const user = userEvent.setup();
    // Only one dispatch item: filtering by halt yields zero items.
    mockFetchOk(makeItems(['dispatch']));
    render(<Notifications />);
    await waitFor(() => {
      expect(screen.getByText('Event dispatch 0')).toBeInTheDocument();
    });

    const halt = screen
      .getByRole('group', { name: /Filter notifications by type/i })
      .querySelector('[data-filter="halt"]') as HTMLButtonElement;
    await user.click(halt);

    await waitFor(() => {
      expect(screen.getByText('No notifications match')).toBeInTheDocument();
    });
  });

  it('falls back to sample data and shows the sample-data badge when fetch fails', async () => {
    mockFetchFail();
    render(<Notifications />);
    await waitFor(() => {
      expect(screen.getByText(/sample data/i)).toBeInTheDocument();
    });
  });

  // ---- 11.242 clear-all + undo ---------------------------------

  it('renders the Clear all button', async () => {
    mockFetchOk(makeItems(['dispatch', 'complete']));
    render(<Notifications />);
    await waitFor(() => {
      expect(screen.getByTestId('notifications-clear-all')).toBeInTheDocument();
    });
  });

  it('disables Clear all when the feed is empty', async () => {
    mockFetchOk([]);
    render(<Notifications />);
    await waitFor(() => {
      expect(screen.getByTestId('notifications-clear-all')).toBeDisabled();
    });
  });

  it('clicking Clear all opens the confirm dialog (no immediate clear)', async () => {
    const user = userEvent.setup();
    mockFetchOk(makeItems(['dispatch', 'complete', 'halt']));
    render(<Notifications />);
    await waitFor(() => {
      expect(screen.getByText('Event dispatch 0')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('notifications-clear-all'));
    expect(
      screen.getByRole('dialog', { name: /Clear all notifications/i }),
    ).toBeInTheDocument();
    // Items still on screen -- nothing has been cleared yet.
    expect(screen.getByText('Event dispatch 0')).toBeInTheDocument();
  });

  it('confirm dialog initially focuses the Cancel button (safety default)', async () => {
    const user = userEvent.setup();
    mockFetchOk(makeItems(['dispatch']));
    render(<Notifications />);
    await waitFor(() => {
      expect(screen.getByTestId('notifications-clear-all')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('notifications-clear-all'));
    await waitFor(() => {
      const cancel = document.querySelector(
        '[data-confirm-dialog-cancel]',
      ) as HTMLButtonElement | null;
      expect(cancel).not.toBeNull();
      expect(document.activeElement).toBe(cancel);
    });
  });

  it('Cancel keeps notifications and closes the dialog', async () => {
    const user = userEvent.setup();
    mockFetchOk(makeItems(['dispatch', 'complete']));
    render(<Notifications />);
    await waitFor(() => {
      expect(screen.getByText('Event dispatch 0')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('notifications-clear-all'));
    const cancel = document.querySelector(
      '[data-confirm-dialog-cancel]',
    ) as HTMLButtonElement;
    await user.click(cancel);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Event dispatch 0')).toBeInTheDocument();
    expect(screen.getByText('Event complete 1')).toBeInTheDocument();
  });

  it('Confirm clears the feed and surfaces the undo banner', async () => {
    const user = userEvent.setup();
    mockFetchOk(makeItems(['dispatch', 'complete', 'halt']));
    render(<Notifications />);
    await waitFor(() => {
      expect(screen.getByText('Event dispatch 0')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('notifications-clear-all'));
    const confirm = document.querySelector(
      '[data-confirm-dialog-confirm]',
    ) as HTMLButtonElement;
    await user.click(confirm);
    // Feed cleared.
    expect(screen.queryByText('Event dispatch 0')).not.toBeInTheDocument();
    expect(screen.queryByText('Event complete 1')).not.toBeInTheDocument();
    // Banner visible.
    const banner = screen.getByTestId('notifications-undo-banner');
    expect(banner).toBeInTheDocument();
    expect(within(banner).getByText(/Cleared 3 notifications/)).toBeInTheDocument();
  });

  it('Undo restores the cleared feed and hides the banner', async () => {
    const user = userEvent.setup();
    mockFetchOk(makeItems(['dispatch', 'complete']));
    render(<Notifications />);
    await waitFor(() => {
      expect(screen.getByText('Event dispatch 0')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('notifications-clear-all'));
    await user.click(
      document.querySelector('[data-confirm-dialog-confirm]') as HTMLButtonElement,
    );
    expect(screen.getByTestId('notifications-undo-banner')).toBeInTheDocument();
    // (v1.11.262, TODO 11.244) UndoToast component owns the action
    // surface now; the page-level banner just wraps it.
    await user.click(screen.getByTestId('undo-toast-action'));
    expect(
      screen.queryByTestId('notifications-undo-banner'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Event dispatch 0')).toBeInTheDocument();
    expect(screen.getByText('Event complete 1')).toBeInTheDocument();
  });

  it(
    'undo banner auto-dismisses after UNDO_BANNER_MS without restoring',
    { timeout: 10000 },
    async () => {
      const user = userEvent.setup({ delay: null });
      mockFetchOk(makeItems(['dispatch', 'complete']));
      render(<Notifications />);
      await waitFor(() => {
        expect(screen.getByText('Event dispatch 0')).toBeInTheDocument();
      });
      await user.click(screen.getByTestId('notifications-clear-all'));
      await user.click(
        document.querySelector('[data-confirm-dialog-confirm]') as HTMLButtonElement,
      );
      expect(screen.getByTestId('notifications-undo-banner')).toBeInTheDocument();
      // Real-time wait covering the 5s timer plus a small slack.
      await waitFor(
        () => {
          expect(
            screen.queryByTestId('notifications-undo-banner'),
          ).not.toBeInTheDocument();
        },
        { timeout: UNDO_BANNER_MS + 1000 },
      );
      // Feed stays empty (no auto-restore on timeout).
      expect(screen.queryByText('Event dispatch 0')).not.toBeInTheDocument();
    },
  );

  it('dismiss-x closes the banner without restoring the feed', async () => {
    const user = userEvent.setup({ delay: null });
    mockFetchOk(makeItems(['dispatch']));
    render(<Notifications />);
    await waitFor(() => {
      expect(screen.getByText('Event dispatch 0')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('notifications-clear-all'));
    await user.click(
      document.querySelector('[data-confirm-dialog-confirm]') as HTMLButtonElement,
    );
    await user.click(screen.getByTestId('undo-toast-dismiss'));
    expect(
      screen.queryByTestId('notifications-undo-banner'),
    ).not.toBeInTheDocument();
    // Feed stays cleared.
    expect(screen.queryByText('Event dispatch 0')).not.toBeInTheDocument();
  });

  it('UNDO_BANNER_MS exports the 5000 ms duration matching the dispatch spec', () => {
    expect(UNDO_BANNER_MS).toBe(5000);
  });
});
