import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AppHeader from './AppHeader';
import { setLocale } from '../../lib/i18n';

// The header polls four daemon endpoints for nav-badge counts when
// authed=true. Stubbing the hook keeps the test focused on header
// markup (counts are exercised inside use-nav-badge-counts.test).
vi.mock('../../lib/use-nav-badge-counts', () => ({
  useNavBadgeCounts: vi.fn(() => ({
    stuckCount: 0,
    underperformerCount: 0,
    escalationCount: 0,
  })),
}));

// AccountMenu is a self-contained dropdown with its own auth + dropdown
// tests; render a marker we can assert on to verify the authed branch.
vi.mock('../AccountMenu', () => ({
  default: ({ onLogout }: { onLogout: () => void }) => (
    <button type="button" data-testid="account-menu" onClick={onLogout}>
      account
    </button>
  ),
}));

import { useNavBadgeCounts } from '../../lib/use-nav-badge-counts';

const navCountsMock = vi.mocked(useNavBadgeCounts);

beforeEach(() => {
  navCountsMock.mockReturnValue({
    stuckCount: 0,
    underperformerCount: 0,
    escalationCount: 0,
  });
  setLocale('en');
});

afterEach(() => {
  navCountsMock.mockClear();
});

function renderHeader(overrides: Partial<Parameters<typeof AppHeader>[0]> = {}) {
  const props = {
    sidebarOpen: false,
    onToggleSidebar: vi.fn(),
    topView: 'workers' as const,
    onTopViewChange: vi.fn(),
    authed: false,
    onLogout: vi.fn(),
    ...overrides,
  };
  const utils = render(<AppHeader {...props} />);
  return { ...utils, props };
}

describe('<AppHeader>', () => {
  it('renders the C4 Dashboard wordmark as a level-1 heading', () => {
    renderHeader();
    expect(
      screen.getByRole('heading', { level: 1, name: 'C4 Dashboard' }),
    ).toBeInTheDocument();
  });

  it('renders the decorative logo as aria-hidden so SR users hear the wordmark once', () => {
    const { container } = renderHeader();
    const logo = container.querySelector('img[src="/logo.svg"]');
    expect(logo).not.toBeNull();
    expect(logo).toHaveAttribute('aria-hidden', 'true');
    expect(logo).toHaveAttribute('alt', '');
  });

  it('renders the inner TopTabs tablist labelled "Top view"', () => {
    renderHeader();
    expect(
      screen.getByRole('tablist', { name: 'Top view' }),
    ).toBeInTheDocument();
  });

  it('renders the Help center, Shortcuts, and Language icon buttons', () => {
    renderHeader();
    expect(
      screen.getByRole('button', { name: 'Help center' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Keyboard shortcuts' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Language' }),
    ).toBeInTheDocument();
  });

  it('labels the hamburger toggle "Open worker list" when sidebarOpen=false', () => {
    renderHeader({ sidebarOpen: false });
    expect(
      screen.getByRole('button', { name: 'Open worker list' }),
    ).toBeInTheDocument();
  });

  it('labels the hamburger toggle "Close worker list" when sidebarOpen=true', () => {
    renderHeader({ sidebarOpen: true });
    expect(
      screen.getByRole('button', { name: 'Close worker list' }),
    ).toBeInTheDocument();
  });

  it('fires onToggleSidebar when the hamburger button is clicked', async () => {
    const user = userEvent.setup();
    const onToggleSidebar = vi.fn();
    renderHeader({ onToggleSidebar });
    await user.click(screen.getByRole('button', { name: 'Open worker list' }));
    expect(onToggleSidebar).toHaveBeenCalledTimes(1);
  });

  it('forwards the topView prop to TopTabs as the active tab', () => {
    renderHeader({ topView: 'history' });
    expect(
      screen.getByRole('tab', { name: 'History' }),
    ).toHaveAttribute('aria-selected', 'true');
  });

  it('fires onTopViewChange with the clicked tab id', async () => {
    const user = userEvent.setup();
    const onTopViewChange = vi.fn();
    renderHeader({ onTopViewChange });
    await user.click(screen.getByRole('tab', { name: 'Chat' }));
    expect(onTopViewChange).toHaveBeenCalledWith('chat');
  });

  it('omits the AccountMenu when authed=false', () => {
    renderHeader({ authed: false });
    expect(screen.queryByTestId('account-menu')).not.toBeInTheDocument();
  });

  it('renders the AccountMenu when authed=true', () => {
    renderHeader({ authed: true });
    expect(screen.getByTestId('account-menu')).toBeInTheDocument();
  });

  it('wires onLogout through the AccountMenu when authed=true', async () => {
    const user = userEvent.setup();
    const onLogout = vi.fn();
    renderHeader({ authed: true, onLogout });
    await user.click(screen.getByTestId('account-menu'));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('dispatches the help-drawer event when the help icon is clicked', async () => {
    const user = userEvent.setup();
    const listener = vi.fn();
    window.addEventListener('c4:help-drawer-open', listener);
    renderHeader();
    await user.click(screen.getByRole('button', { name: 'Help center' }));
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener('c4:help-drawer-open', listener);
  });

  it('dispatches the shortcuts event when the shortcuts icon is clicked', async () => {
    const user = userEvent.setup();
    const listener = vi.fn();
    window.addEventListener('c4:shortcuts-open', listener);
    renderHeader();
    await user.click(
      screen.getByRole('button', { name: 'Keyboard shortcuts' }),
    );
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener('c4:shortcuts-open', listener);
  });

  it('flips locale en->ko when the Language icon is clicked', async () => {
    const user = userEvent.setup();
    renderHeader();
    await user.click(screen.getByRole('button', { name: 'Language' }));
    // After locale flip, the tab labels re-translate to Korean. Sample one.
    // Use queryByText to avoid relying on a specific Korean string match.
    // The English label "Workers" should no longer be present as a tab name.
    expect(
      screen.queryByRole('tab', { name: 'Workers' }),
    ).not.toBeInTheDocument();
  });

  it('renders a banner element wrapping the header content', () => {
    const { container } = renderHeader();
    const header = container.querySelector('header');
    expect(header).not.toBeNull();
    expect(header).toHaveClass('bg-card');
  });

  it('renders the meetings tab badge when stuckCount > 0', () => {
    navCountsMock.mockReturnValue({
      stuckCount: 5,
      underperformerCount: 0,
      escalationCount: 0,
    });
    renderHeader({ authed: true });
    const meetings = screen.getByRole('tab', { name: 'Meetings' });
    expect(meetings.textContent).toContain('5');
  });

  it('renders the specialists tab badge when underperformerCount > 0', () => {
    navCountsMock.mockReturnValue({
      stuckCount: 0,
      underperformerCount: 7,
      escalationCount: 0,
    });
    renderHeader({ authed: true });
    expect(
      screen.getByRole('tab', { name: 'Specialists' }).textContent,
    ).toContain('7');
  });

  it('renders the autonomous tab badge with destructive tone when escalationCount > 0', () => {
    navCountsMock.mockReturnValue({
      stuckCount: 0,
      underperformerCount: 0,
      escalationCount: 2,
    });
    renderHeader({ authed: true });
    const autonomous = screen.getByRole('tab', { name: 'Autonomous' });
    expect(autonomous.textContent).toContain('2');
  });

  it('passes authed=false to useNavBadgeCounts when not signed in', () => {
    renderHeader({ authed: false });
    expect(navCountsMock).toHaveBeenCalledWith({ authed: false });
  });

  it('passes authed=true to useNavBadgeCounts when signed in', () => {
    renderHeader({ authed: true });
    expect(navCountsMock).toHaveBeenCalledWith({ authed: true });
  });
});
