import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type { SessionGroup, SessionSummary } from './SessionsView';

// SessionsListSection is pure display — no hooks of its own. The
// parent owns the collapsed map + selection + onSelect /
// onToggleGroup callbacks. Tests render with varied fixtures and
// assert the rendered structure, the aria-current state on the
// active row, and the callback wiring on every click.

import SessionsListSection from './SessionsListSection';

function makeSession(over: Partial<SessionSummary> = {}): SessionSummary {
  return {
    projectDir: 'proj-a',
    projectPath: '/repo/proj-a',
    sessionId: 'sid-aaaaaaaa1111',
    path: '/var/sessions/sid.jsonl',
    updatedAt: '2026-05-01T00:00:00Z',
    size: 1024,
    turnCount: 3,
    lastAssistantSnippet: 'snippet',
    ...over,
  };
}

const GROUP_A: SessionGroup = {
  projectPath: '/repo/proj-a',
  projectDir: 'proj-a',
  sessions: [
    makeSession({ sessionId: 'sid-aaaaaaaa1111', turnCount: 3 }),
    makeSession({ sessionId: 'sid-bbbbbbbb2222', turnCount: 7 }),
  ],
  updatedAt: '2026-05-01T00:00:00Z',
};

const GROUP_B: SessionGroup = {
  projectPath: null,
  projectDir: 'proj-b',
  sessions: [
    makeSession({
      sessionId: 'sid-cccccccc3333',
      projectDir: 'proj-b',
      projectPath: null,
      turnCount: 1,
      lastAssistantSnippet: '',
    }),
  ],
  updatedAt: '2026-04-29T00:00:00Z',
};

beforeEach(() => {
  setLocale('en');
});

function renderSection(
  overrides: Partial<Parameters<typeof SessionsListSection>[0]> = {},
) {
  const onSelect = vi.fn();
  const onToggleGroup = vi.fn();
  const props = {
    filteredGroups: [GROUP_A, GROUP_B],
    error: null,
    loading: false,
    collapsed: {} as Record<string, boolean>,
    onToggleGroup,
    selectedSessionId: null as string | null,
    onSelect,
    ...overrides,
  };
  const utils = render(<SessionsListSection {...props} />);
  const user = userEvent.setup();
  // (TODO 11.149, v1.11.167) The section now renders a read-only
  // `Recent activity` <ol data-timeline> above the interactive
  // `<ul className="divide-y divide-border">`. The timeline duplicates
  // shortIds + descriptions, so any test that targets the interactive
  // list scopes its query to `mainList` to skip the timeline.
  const mainList = utils.container.querySelector(
    'ul.divide-y',
  ) as HTMLElement | null;
  return { ...utils, user, onSelect, onToggleGroup, props, mainList };
}

describe('<SessionsListSection>', () => {
  it('renders the error banner when an error string is passed', () => {
    renderSection({ error: 'load failed' });
    const banner = screen.getByText('load failed');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveClass('text-destructive');
  });

  it('does NOT render any group buttons when an error is set', () => {
    renderSection({ error: 'load failed' });
    expect(
      screen.queryByText('/repo/proj-a'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('proj-b'),
    ).not.toBeInTheDocument();
  });

  it('renders a skeleton list when empty + loading', () => {
    // (v1.11.78) Loading branch uses <Skeleton variant="row"> primitives;
    // the localized copy survives as the wrapper aria-label.
    const { container } = renderSection({ filteredGroups: [], loading: true });
    const wrap = container.querySelector('[data-sessions-loading="1"]');
    expect(wrap).not.toBeNull();
    expect(wrap?.getAttribute('aria-label')).toBe(
      `Loading sessions${String.fromCharCode(0x2026)}`,
    );
    const skeletons = container.querySelectorAll('[role="status"][aria-hidden="true"]');
    expect(skeletons.length).toBe(3);
  });

  it('renders the empty copy when empty + not loading', () => {
    renderSection({ filteredGroups: [], loading: false });
    expect(screen.getByText('No sessions found.')).toBeInTheDocument();
  });

  it('renders a project header button per group', () => {
    renderSection();
    expect(
      screen.getByRole('button', { name: /\/repo\/proj-a/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /proj-b/ }),
    ).toBeInTheDocument();
  });

  it('uses the projectPath when present and falls back to projectDir otherwise', () => {
    const { mainList } = renderSection();
    expect(within(mainList!).getByText('/repo/proj-a')).toBeInTheDocument();
    expect(within(mainList!).getByText('proj-b')).toBeInTheDocument();
  });

  it('shows the session count badge for each group', () => {
    renderSection();
    const headerA = screen
      .getByRole('button', { name: /\/repo\/proj-a/ });
    expect(within(headerA).getByText('2')).toBeInTheDocument();
    const headerB = screen.getByRole('button', { name: /proj-b/ });
    expect(within(headerB).getByText('1')).toBeInTheDocument();
  });

  it('renders the project header with aria-expanded=true when not collapsed', () => {
    renderSection();
    expect(
      screen.getByRole('button', { name: /\/repo\/proj-a/ }),
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('renders the project header with aria-expanded=false when collapsed', () => {
    renderSection({ collapsed: { 'proj-a': true } });
    expect(
      screen.getByRole('button', { name: /\/repo\/proj-a/ }),
    ).toHaveAttribute('aria-expanded', 'false');
  });

  it('hides the session rows for a collapsed group', () => {
    const { mainList } = renderSection({ collapsed: { 'proj-a': true } });
    expect(
      within(mainList!).queryByText(/sid-aaaa/),
    ).not.toBeInTheDocument();
  });

  it('still renders rows for non-collapsed sibling groups when one is collapsed', () => {
    const { mainList } = renderSection({ collapsed: { 'proj-a': true } });
    expect(within(mainList!).getByText(/sid-cccc/)).toBeInTheDocument();
  });

  it('renders the shortId for each session row', () => {
    const { mainList } = renderSection();
    expect(within(mainList!).getByText(/sid-aaaa/)).toBeInTheDocument();
    expect(within(mainList!).getByText(/sid-bbbb/)).toBeInTheDocument();
    expect(within(mainList!).getByText(/sid-cccc/)).toBeInTheDocument();
  });

  it('renders the turn-count badge inside each session row', () => {
    const { mainList } = renderSection();
    const sessionA = within(mainList!)
      .getByText(/sid-aaaa/)
      .closest('button') as HTMLElement;
    expect(within(sessionA).getByText('3')).toBeInTheDocument();
    const sessionB = within(mainList!)
      .getByText(/sid-bbbb/)
      .closest('button') as HTMLElement;
    expect(within(sessionB).getByText('7')).toBeInTheDocument();
  });

  it('renders the lastAssistantSnippet when non-empty', () => {
    renderSection();
    const snippets = screen.getAllByText('snippet');
    expect(snippets.length).toBeGreaterThan(0);
  });

  it('does NOT render the snippet line when lastAssistantSnippet is empty', () => {
    const onlyB = { ...GROUP_B };
    const { mainList } = renderSection({ filteredGroups: [onlyB] });
    const row = within(mainList!)
      .getByText(/sid-cccc/)
      .closest('button') as HTMLElement;
    expect(within(row).queryByText('snippet')).not.toBeInTheDocument();
  });

  it('sets aria-current=true on the row matching selectedSessionId', () => {
    const { mainList } = renderSection({
      selectedSessionId: 'sid-aaaaaaaa1111',
    });
    const row = within(mainList!)
      .getByText(/sid-aaaa/)
      .closest('button') as HTMLElement;
    expect(row).toHaveAttribute('aria-current', 'true');
  });

  it('omits aria-current on every non-active row', () => {
    const { mainList } = renderSection({
      selectedSessionId: 'sid-aaaaaaaa1111',
    });
    const row = within(mainList!)
      .getByText(/sid-bbbb/)
      .closest('button') as HTMLElement;
    expect(row).not.toHaveAttribute('aria-current');
  });

  it('applies the active highlight class on the selected row', () => {
    const { mainList } = renderSection({
      selectedSessionId: 'sid-aaaaaaaa1111',
    });
    const row = within(mainList!)
      .getByText(/sid-aaaa/)
      .closest('button') as HTMLElement;
    expect(row.className).toMatch(/bg-accent/);
    expect(row.className).toMatch(/text-accent-foreground/);
  });

  it('applies the hover class on a non-selected row', () => {
    const { mainList } = renderSection({
      selectedSessionId: 'sid-aaaaaaaa1111',
    });
    const row = within(mainList!)
      .getByText(/sid-bbbb/)
      .closest('button') as HTMLElement;
    // (TODO 11.165, v1.11.183) Rows migrated from a raw `<button class=
    // "hover:bg-accent...">` to the ListItem primitive whose interactive
    // root carries `hover:bg-muted/30` as the standard hover state.
    // The intent (rows visibly respond to hover) is preserved; only
    // the underlying token changed with the migration.
    expect(row.className).toMatch(/hover:bg-muted/);
  });

  it('fires onSelect with the sessionId when a session row is clicked', async () => {
    const { user, onSelect, mainList } = renderSection();
    const row = within(mainList!)
      .getByText(/sid-bbbb/)
      .closest('button') as HTMLElement;
    await user.click(row);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('sid-bbbbbbbb2222');
  });

  it('fires onToggleGroup with the group key when the project header is clicked', async () => {
    const { user, onToggleGroup } = renderSection();
    await user.click(
      screen.getByRole('button', { name: /\/repo\/proj-a/ }),
    );
    expect(onToggleGroup).toHaveBeenCalledTimes(1);
    expect(onToggleGroup).toHaveBeenCalledWith('proj-a');
  });

  it('uses the projectPath as the toggle key when projectDir is absent', () => {
    const altGroup: SessionGroup = {
      projectPath: '/only-path',
      projectDir: null,
      sessions: [makeSession({ sessionId: 'sid-zzzzzzzz9999' })],
      updatedAt: null,
    };
    renderSection({ filteredGroups: [altGroup] });
    expect(
      screen.getByRole('button', { name: /\/only-path/ }),
    ).toBeInTheDocument();
  });

  it('falls back to the "unknown" label + key when both projectPath + projectDir are null', () => {
    const ghost: SessionGroup = {
      projectPath: null,
      projectDir: null,
      sessions: [makeSession({ sessionId: 'sid-zzzzzzzz9999' })],
      updatedAt: null,
    };
    renderSection({ filteredGroups: [ghost] });
    expect(
      screen.getByRole('button', { name: /unknown/i }),
    ).toBeInTheDocument();
  });

  it('renders the right-chevron when a group is collapsed', () => {
    const { container } = renderSection({
      collapsed: { 'proj-a': true },
    });
    const headerA = container.querySelector(
      'button[aria-expanded="false"]',
    ) as HTMLElement;
    expect(headerA.querySelector('svg')).toBeTruthy();
  });

  it('keeps both groups expanded by default when the collapsed map is empty', () => {
    renderSection();
    const expanded = screen.getAllByRole('button', { name: /proj/ });
    expanded.forEach((btn) => {
      expect(btn).toHaveAttribute('aria-expanded', 'true');
    });
  });

  it('does not fire onSelect when a project header is clicked', async () => {
    const { user, onSelect } = renderSection();
    await user.click(
      screen.getByRole('button', { name: /\/repo\/proj-a/ }),
    );
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('does not fire onToggleGroup when a session row is clicked', async () => {
    const { user, onToggleGroup, mainList } = renderSection();
    const row = within(mainList!)
      .getByText(/sid-bbbb/)
      .closest('button') as HTMLElement;
    await user.click(row);
    expect(onToggleGroup).not.toHaveBeenCalled();
  });

  it('renders translated copy when the locale flips to ko in the empty branch', () => {
    renderSection({ filteredGroups: [], loading: false });
    expect(screen.getByText('No sessions found.')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByText('No sessions found.'),
    ).not.toBeInTheDocument();
  });

  it('rerendering with the same props does not duplicate the project header', () => {
    const { rerender, props } = renderSection();
    rerender(<SessionsListSection {...props} />);
    expect(
      screen.getAllByRole('button', { name: /\/repo\/proj-a/ }),
    ).toHaveLength(1);
  });
});
