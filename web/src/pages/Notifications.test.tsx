import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import Notifications from './Notifications';
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
});
