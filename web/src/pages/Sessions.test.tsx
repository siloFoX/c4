import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Sessions from './Sessions';
import type { SessionEntry } from './Sessions';

const FIXTURE: SessionEntry[] = [
  {
    id: 'sess-active-1',
    name: 'alice',
    status: 'active',
    worker: 'alice',
    startedAt: '2026-05-18T00:00:00Z',
    lastActiveAt: '2026-05-18T01:00:00Z',
    taskPreview: 'Active task one',
  },
  {
    id: 'sess-active-2',
    name: 'bob',
    status: 'active',
    worker: 'bob',
    startedAt: '2026-05-18T00:10:00Z',
    lastActiveAt: '2026-05-18T01:10:00Z',
    taskPreview: 'Active task two',
  },
  {
    id: 'sess-arch-1',
    name: 'carol',
    status: 'archived',
    worker: 'carol',
    startedAt: '2026-05-17T00:00:00Z',
    lastActiveAt: '2026-05-17T05:00:00Z',
    taskPreview: 'Archived task three',
    notes: 'closed cleanly',
  },
];

describe('<Sessions> page', () => {
  afterEach(() => cleanup());

  it('renders the page title + description', () => {
    render(<Sessions sessions={FIXTURE} />);
    expect(screen.getByText('Sessions')).toBeInTheDocument();
    expect(
      screen.getByText(/Operator session log/i),
    ).toBeInTheDocument();
  });

  it('exposes data-section="sessions-page" for e2e', () => {
    render(<Sessions sessions={FIXTURE} />);
    expect(
      document.querySelector('[data-section="sessions-page"]'),
    ).not.toBeNull();
  });

  it('renders three tabs (Active / Archived / All)', () => {
    render(<Sessions sessions={FIXTURE} />);
    expect(screen.getByRole('tab', { name: /Active/i })).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: /Archived/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^All$/i })).toBeInTheDocument();
  });

  it('Active tab is the default and shows only active sessions', () => {
    render(<Sessions sessions={FIXTURE} />);
    expect(
      screen.getByTestId('sessions-row-sess-active-1'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('sessions-row-sess-active-2'),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('sessions-row-sess-arch-1'),
    ).not.toBeInTheDocument();
  });

  it('switching to the Archived tab shows only archived sessions', async () => {
    const user = userEvent.setup();
    render(<Sessions sessions={FIXTURE} />);
    await user.click(screen.getByRole('tab', { name: /Archived/i }));
    expect(
      screen.getByTestId('sessions-row-sess-arch-1'),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('sessions-row-sess-active-1'),
    ).not.toBeInTheDocument();
  });

  it('All tab shows every session regardless of status', async () => {
    const user = userEvent.setup();
    render(<Sessions sessions={FIXTURE} />);
    await user.click(screen.getByRole('tab', { name: /^All$/i }));
    expect(
      screen.getByTestId('sessions-row-sess-active-1'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('sessions-row-sess-active-2'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('sessions-row-sess-arch-1'),
    ).toBeInTheDocument();
  });

  it('renders the SearchBar with the documented testid', () => {
    render(<Sessions sessions={FIXTURE} />);
    expect(screen.getByTestId('sessions-search')).toBeInTheDocument();
  });

  it('filtering by name narrows the list', async () => {
    const user = userEvent.setup();
    render(<Sessions sessions={FIXTURE} />);
    const search = screen.getByTestId('sessions-search') as HTMLInputElement;
    await user.type(search, 'bob');
    expect(
      screen.getByTestId('sessions-row-sess-active-2'),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('sessions-row-sess-active-1'),
    ).not.toBeInTheDocument();
  });

  it('shows an empty state when the filter matches nothing', async () => {
    const user = userEvent.setup();
    render(<Sessions sessions={FIXTURE} />);
    const search = screen.getByTestId('sessions-search') as HTMLInputElement;
    await user.type(search, 'no-match-zzz');
    expect(
      screen.getByText(/No sessions match/i),
    ).toBeInTheDocument();
  });

  it('clicking a row opens the drawer with the session detail', async () => {
    const user = userEvent.setup();
    render(<Sessions sessions={FIXTURE} />);
    await user.click(screen.getByTestId('sessions-row-sess-active-1'));
    // Drawer is portaled; query through the body.
    const detail = document.querySelector('[data-section="sessions-detail"]');
    expect(detail).not.toBeNull();
    expect(detail?.getAttribute('data-session-id')).toBe('sess-active-1');
  });

  it('row exposes data-session-id + data-session-status for e2e', () => {
    render(<Sessions sessions={FIXTURE} />);
    const row = screen.getByTestId('sessions-row-sess-active-1');
    const li = row.closest('[data-session-id]');
    expect(li).not.toBeNull();
    expect(li?.getAttribute('data-session-id')).toBe('sess-active-1');
    expect(li?.getAttribute('data-session-status')).toBe('active');
  });

  it('every row carries an Avatar with the expected status overlay', async () => {
    const user = userEvent.setup();
    render(<Sessions sessions={FIXTURE} />);
    await user.click(screen.getByRole('tab', { name: /^All$/i }));
    // Avatars expose data-section="avatar-root" + a sibling
    // data-section="avatar-status" with data-status indicating
    // online/offline. We assert there are at least three roots
    // (one per row) and that statuses are present.
    const roots = document.querySelectorAll(
      '[data-section="avatar-root"]',
    );
    expect(roots.length).toBeGreaterThanOrEqual(3);
    const statuses = document.querySelectorAll(
      '[data-section="avatar-status"]',
    );
    expect(statuses.length).toBeGreaterThanOrEqual(3);
  });

  it('renders without crashing when no sessions are provided (demo data)', () => {
    render(<Sessions />);
    // The demo dataset has at least one active session
    expect(
      document.querySelector('[data-section="sessions-list"]'),
    ).not.toBeNull();
  });
});
