import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { createRef } from 'react';
import {
  DEFAULT_NOTIFICATION_ALIGN,
  DEFAULT_NOTIFICATION_MAX_BADGE,
  DEFAULT_NOTIFICATION_PANEL_WIDTH,
  NotificationBell,
  formatBadgeCount,
  getUnreadCount,
  sortNotificationsByTimestamp,
} from './notification-bell';
import type { NotificationItem } from './notification-bell';

afterEach(() => {
  cleanup();
});

const ITEMS: NotificationItem[] = [
  {
    id: 'a',
    title: 'New build passed',
    description: 'PR #42 is green',
    timestamp: '2026-05-19T12:00:00Z',
  },
  {
    id: 'b',
    title: 'Mentioned you',
    description: '@you in #channel',
    timestamp: '2026-05-19T13:00:00Z',
    read: true,
  },
  {
    id: 'c',
    title: 'Deploy completed',
    timestamp: '2026-05-19T14:00:00Z',
  },
];

describe('getUnreadCount', () => {
  it('returns 0 for empty list', () => {
    expect(getUnreadCount([])).toBe(0);
  });
  it('counts !read items', () => {
    expect(getUnreadCount(ITEMS)).toBe(2);
  });
  it('treats missing read as unread', () => {
    expect(
      getUnreadCount([{ id: 'x', title: 'x' }]),
    ).toBe(1);
  });
});

describe('formatBadgeCount', () => {
  it('empty string for 0 or negative', () => {
    expect(formatBadgeCount(0)).toBe('');
    expect(formatBadgeCount(-1)).toBe('');
  });
  it('formats normal counts', () => {
    expect(formatBadgeCount(3)).toBe('3');
  });
  it('uses max+ when above max', () => {
    expect(formatBadgeCount(15, 9)).toBe('9+');
  });
  it('floors fractional', () => {
    expect(formatBadgeCount(3.7, 9)).toBe('3');
  });
  it('NaN -> empty', () => {
    expect(formatBadgeCount(Number.NaN)).toBe('');
  });
});

describe('sortNotificationsByTimestamp', () => {
  it('newest first', () => {
    const sorted = sortNotificationsByTimestamp(ITEMS);
    expect(sorted.map((n) => n.id)).toEqual(['c', 'b', 'a']);
  });
  it('puts missing-timestamp items at the back', () => {
    const sorted = sortNotificationsByTimestamp([
      { id: 'old', title: 'old', timestamp: '2026-01-01' },
      { id: 'no-stamp', title: 'no stamp' },
    ]);
    expect(sorted.map((n) => n.id)).toEqual(['old', 'no-stamp']);
  });
  it('accepts Date / number / string', () => {
    const sorted = sortNotificationsByTimestamp([
      { id: 'a', title: 'a', timestamp: new Date('2026-05-01') },
      { id: 'b', title: 'b', timestamp: 1747800000000 },
      { id: 'c', title: 'c', timestamp: '2026-05-15T00:00:00Z' },
    ]);
    expect(sorted[0]?.id).toBeDefined();
  });
  it('does not mutate the input', () => {
    const input = [...ITEMS];
    sortNotificationsByTimestamp(input);
    expect(input.map((i) => i.id)).toEqual(
      ITEMS.map((i) => i.id),
    );
  });
});

describe('Constants', () => {
  it('DEFAULT_NOTIFICATION_MAX_BADGE = 9', () => {
    expect(DEFAULT_NOTIFICATION_MAX_BADGE).toBe(9);
  });
  it('DEFAULT_NOTIFICATION_PANEL_WIDTH = 320', () => {
    expect(DEFAULT_NOTIFICATION_PANEL_WIDTH).toBe(320);
  });
  it('DEFAULT_NOTIFICATION_ALIGN = right', () => {
    expect(DEFAULT_NOTIFICATION_ALIGN).toBe('right');
  });
});

describe('NotificationBell component', () => {
  it('renders a trigger with default aria-label including unread count', () => {
    render(<NotificationBell notifications={ITEMS} />);
    expect(
      screen.getByLabelText('Notifications (2 unread)'),
    ).toBeInTheDocument();
  });

  it('no unread -> aria-label has no count suffix', () => {
    render(
      <NotificationBell
        notifications={[{ id: 'x', title: 'x', read: true }]}
      />,
    );
    expect(
      screen.getByLabelText('Notifications'),
    ).toBeInTheDocument();
  });

  it('custom ariaLabel reflects in trigger', () => {
    render(
      <NotificationBell
        notifications={[]}
        ariaLabel="Alerts"
      />,
    );
    expect(screen.getByLabelText('Alerts')).toBeInTheDocument();
  });

  it('badge shows the unread count', () => {
    render(<NotificationBell notifications={ITEMS} />);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('badge collapses with "max+" when over maxBadgeCount', () => {
    const many: NotificationItem[] = Array.from(
      { length: 20 },
      (_, i) => ({ id: `n-${i}`, title: `n ${i}` }),
    );
    render(
      <NotificationBell
        notifications={many}
        maxBadgeCount={9}
      />,
    );
    expect(screen.getByText('9+')).toBeInTheDocument();
  });

  it('no badge when no unread', () => {
    const { container } = render(
      <NotificationBell
        notifications={[{ id: 'x', title: 'x', read: true }]}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="notification-bell-badge"]',
      ),
    ).toBeNull();
  });

  it('clicking the trigger opens the panel', () => {
    render(<NotificationBell notifications={ITEMS} />);
    fireEvent.click(screen.getByLabelText(/Notifications/));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('panel is closed by default', () => {
    render(<NotificationBell notifications={ITEMS} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('defaultOpen=true opens the panel on mount', () => {
    render(
      <NotificationBell
        notifications={ITEMS}
        defaultOpen
      />,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('controlled open=true overrides internal state', () => {
    render(
      <NotificationBell notifications={ITEMS} open />,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('onOpenChange fires on toggle', () => {
    const onOpenChange = vi.fn();
    render(
      <NotificationBell
        notifications={ITEMS}
        onOpenChange={onOpenChange}
      />,
    );
    fireEvent.click(screen.getByLabelText(/Notifications/));
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it('items render in newest-first order in the panel', () => {
    render(
      <NotificationBell notifications={ITEMS} defaultOpen />,
    );
    const items = screen.getAllByRole('listitem');
    expect(
      within(items[0]!).getByText('Deploy completed'),
    ).toBeInTheDocument();
    expect(
      within(items[1]!).getByText('Mentioned you'),
    ).toBeInTheDocument();
    expect(
      within(items[2]!).getByText('New build passed'),
    ).toBeInTheDocument();
  });

  it('per-item description renders', () => {
    render(
      <NotificationBell notifications={ITEMS} defaultOpen />,
    );
    expect(screen.getByText('PR #42 is green')).toBeInTheDocument();
  });

  it('per-item data-unread reflects read state', () => {
    const { container } = render(
      <NotificationBell notifications={ITEMS} defaultOpen />,
    );
    const itemA = container.querySelector(
      '[data-item-id="a"]',
    );
    const itemB = container.querySelector(
      '[data-item-id="b"]',
    );
    expect(itemA).toHaveAttribute('data-unread', 'true');
    expect(itemB).toHaveAttribute('data-unread', 'false');
  });

  it('mark-as-read button only renders for unread items', () => {
    render(
      <NotificationBell notifications={ITEMS} defaultOpen />,
    );
    expect(
      screen.getAllByLabelText('Mark as read').length,
    ).toBe(2);
  });

  it('clicking the per-item mark button fires onMarkAsRead with the id', () => {
    const onMarkAsRead = vi.fn();
    render(
      <NotificationBell
        notifications={ITEMS}
        defaultOpen
        onMarkAsRead={onMarkAsRead}
      />,
    );
    const marks = screen.getAllByLabelText('Mark as read');
    fireEvent.click(marks[0]!);
    expect(onMarkAsRead).toHaveBeenCalled();
    // Either 'a' or 'c' is fine since they are the unread items;
    // newest-first puts 'c' first.
    const arg = onMarkAsRead.mock.calls[0]![0];
    expect(['a', 'c']).toContain(arg);
  });

  it('header "mark all" button appears only when unread > 0', () => {
    render(
      <NotificationBell notifications={ITEMS} defaultOpen />,
    );
    expect(
      screen.getByLabelText('Mark all as read'),
    ).toBeInTheDocument();
  });

  it('mark all button hidden when no unread', () => {
    render(
      <NotificationBell
        notifications={[
          { id: 'x', title: 'x', read: true },
        ]}
        defaultOpen
      />,
    );
    expect(
      screen.queryByLabelText('Mark all as read'),
    ).toBeNull();
  });

  it('clicking mark all fires onMarkAllAsRead', () => {
    const onMarkAllAsRead = vi.fn();
    render(
      <NotificationBell
        notifications={ITEMS}
        defaultOpen
        onMarkAllAsRead={onMarkAllAsRead}
      />,
    );
    fireEvent.click(screen.getByLabelText('Mark all as read'));
    expect(onMarkAllAsRead).toHaveBeenCalled();
  });

  it('clicking an item fires onNotificationClick with the full item', () => {
    const onNotificationClick = vi.fn();
    render(
      <NotificationBell
        notifications={ITEMS}
        defaultOpen
        onNotificationClick={onNotificationClick}
      />,
    );
    fireEvent.click(screen.getByText('Deploy completed'));
    expect(onNotificationClick).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c' }),
    );
  });

  it('closeOnSelect=true (default) closes the panel after click', () => {
    render(
      <NotificationBell notifications={ITEMS} defaultOpen />,
    );
    fireEvent.click(screen.getByText('Deploy completed'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closeOnSelect=false leaves the panel open', () => {
    render(
      <NotificationBell
        notifications={ITEMS}
        defaultOpen
        closeOnSelect={false}
      />,
    );
    fireEvent.click(screen.getByText('Deploy completed'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('empty state renders when no notifications', () => {
    render(
      <NotificationBell
        notifications={[]}
        defaultOpen
        emptyState="All caught up!"
      />,
    );
    expect(screen.getByText('All caught up!')).toBeInTheDocument();
  });

  it('default empty state copy', () => {
    render(
      <NotificationBell notifications={[]} defaultOpen />,
    );
    expect(screen.getByText('No notifications')).toBeInTheDocument();
  });

  it('Escape key closes the panel', () => {
    const onOpenChange = vi.fn();
    render(
      <NotificationBell
        notifications={ITEMS}
        defaultOpen
        onOpenChange={onOpenChange}
      />,
    );
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape' }),
      );
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('mousedown outside closes the panel', () => {
    const onOpenChange = vi.fn();
    render(
      <NotificationBell
        notifications={ITEMS}
        defaultOpen
        onOpenChange={onOpenChange}
      />,
    );
    act(() => {
      document.body.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true }),
      );
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('align prop reflects on panel data-align', () => {
    render(
      <NotificationBell
        notifications={ITEMS}
        defaultOpen
        align="left"
      />,
    );
    expect(screen.getByRole('dialog')).toHaveAttribute(
      'data-align',
      'left',
    );
  });

  it('panel width prop applies as inline style', () => {
    render(
      <NotificationBell
        notifications={ITEMS}
        defaultOpen
        width={400}
      />,
    );
    const panel = screen.getByRole('dialog');
    expect(panel.style.width).toBe('400px');
  });

  it('renderItem render-prop replaces default row', () => {
    render(
      <NotificationBell
        notifications={ITEMS}
        defaultOpen
        renderItem={({ notification }) => (
          <button
            type="button"
            data-testid="custom-row"
          >
            CUSTOM:{notification.id}
          </button>
        )}
      />,
    );
    expect(
      screen.getAllByTestId('custom-row').length,
    ).toBe(3);
  });

  it('root data attrs mirror state', () => {
    const { container } = render(
      <NotificationBell notifications={ITEMS} defaultOpen />,
    );
    const root = container.querySelector(
      '[data-section="notification-bell"]',
    );
    expect(root).toHaveAttribute('data-open', 'true');
    expect(root).toHaveAttribute('data-unread-count', '2');
    expect(root).toHaveAttribute('data-has-unread', 'true');
  });

  it('aria-expanded mirrors open state on trigger', () => {
    const { container, rerender } = render(
      <NotificationBell notifications={ITEMS} />,
    );
    const trigger = () =>
      container.querySelector(
        '[data-section="notification-bell-trigger"]',
      );
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    rerender(<NotificationBell notifications={ITEMS} open />);
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
  });

  it('trigger has aria-haspopup="dialog"', () => {
    render(<NotificationBell notifications={ITEMS} />);
    expect(
      screen.getByLabelText(/Notifications/),
    ).toHaveAttribute('aria-haspopup', 'dialog');
  });

  it('exposes a stable displayName', () => {
    expect(NotificationBell.displayName).toBe('NotificationBell');
  });

  it('forwards ref to the trigger button', () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <NotificationBell ref={ref} notifications={ITEMS} />,
    );
    expect(ref.current?.tagName.toLowerCase()).toBe('button');
  });

  it('badge data-badge-count reflects unread count', () => {
    const { container } = render(
      <NotificationBell notifications={ITEMS} />,
    );
    const badge = container.querySelector(
      '[data-section="notification-bell-badge"]',
    );
    expect(badge).toHaveAttribute('data-badge-count', '2');
  });
});
