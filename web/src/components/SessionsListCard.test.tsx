import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type { AttachedSession, SessionGroup } from './SessionsView';

// SessionsListCard is a thin composite shell. It owns no hooks of
// its own beyond useLocale (i18n subscription) and forwards every
// prop down to one of three children: SessionsHeader (top bar +
// search + actions), SessionsAttachedSection (collapsible attached
// list), and SessionsListSection (the project-grouped list). Tests
// stub all three children to thin markers via vi.mock so this
// suite exercises only the wiring + the Card wrapper, not the
// children's own coverage (which already lives in their own test
// files). Each marker records its props into a module-level slot
// so we can assert prop forwarding.

let lastHeaderProps:
  | Parameters<typeof import('./SessionsHeader').default>[0]
  | null = null;
let lastAttachedProps:
  | Parameters<typeof import('./SessionsAttachedSection').default>[0]
  | null = null;
let lastListProps:
  | Parameters<typeof import('./SessionsListSection').default>[0]
  | null = null;

vi.mock('./SessionsHeader', () => ({
  default: (props: Parameters<typeof import('./SessionsHeader').default>[0]) => {
    lastHeaderProps = props;
    return <div data-testid="sessions-header-stub">header-stub</div>;
  },
}));

vi.mock('./SessionsAttachedSection', () => ({
  default: (
    props: Parameters<typeof import('./SessionsAttachedSection').default>[0],
  ) => {
    lastAttachedProps = props;
    return <div data-testid="sessions-attached-stub">attached-stub</div>;
  },
}));

vi.mock('./SessionsListSection', () => ({
  default: (
    props: Parameters<typeof import('./SessionsListSection').default>[0],
  ) => {
    lastListProps = props;
    return <div data-testid="sessions-list-stub">list-stub</div>;
  },
}));

import SessionsListCard from './SessionsListCard';

const ATTACHED_A: AttachedSession = {
  name: 'w1',
  jsonlPath: '/var/c4/w1.jsonl',
  sessionId: 'sid-aaaaaaaa1111',
  projectPath: '/repo/p',
  createdAt: '2026-05-01T00:00:00Z',
  lastOffset: 0,
  role: 'manager',
};

const GROUP_A: SessionGroup = {
  projectPath: '/repo/proj-a',
  projectDir: 'proj-a',
  sessions: [
    {
      projectDir: 'proj-a',
      projectPath: '/repo/proj-a',
      sessionId: 'sid-aaaaaaaa1111',
      path: '/var/sessions/sid.jsonl',
      updatedAt: '2026-05-01T00:00:00Z',
      size: 1024,
      turnCount: 3,
      lastAssistantSnippet: 'snippet',
    },
  ],
  updatedAt: '2026-05-01T00:00:00Z',
};

beforeEach(() => {
  setLocale('en');
  lastHeaderProps = null;
  lastAttachedProps = null;
  lastListProps = null;
});

function renderCard(
  overrides: Partial<Parameters<typeof SessionsListCard>[0]> = {},
) {
  const onQuery = vi.fn();
  const onNewChat = vi.fn();
  const onAttachNew = vi.fn();
  const onRefresh = vi.fn();
  const onToggleAttachedCollapsed = vi.fn();
  const onSelectAttached = vi.fn();
  const onAttachClick = vi.fn();
  const onDetach = vi.fn();
  const onToggleGroup = vi.fn();
  const onSelectSession = vi.fn();
  const props = {
    query: '',
    onQuery,
    totalFiltered: 0,
    total: 0,
    loading: false,
    onNewChat,
    onAttachNew,
    onRefresh,
    attachedCollapsed: false,
    onToggleAttachedCollapsed,
    filteredAttached: [] as AttachedSession[],
    attachError: null as string | null,
    selectedAttachmentName: null as string | null,
    onSelectAttached,
    onAttachClick,
    onDetach,
    filteredGroups: [] as SessionGroup[],
    error: null as string | null,
    collapsed: {} as Record<string, boolean>,
    onToggleGroup,
    selectedSessionId: null as string | null,
    onSelectSession,
    ...overrides,
  };
  const utils = render(<SessionsListCard {...props} />);
  const user = userEvent.setup();
  return {
    ...utils,
    user,
    onQuery,
    onNewChat,
    onAttachNew,
    onRefresh,
    onToggleAttachedCollapsed,
    onSelectAttached,
    onAttachClick,
    onDetach,
    onToggleGroup,
    onSelectSession,
    props,
  };
}

describe('<SessionsListCard>', () => {
  // ---- structural composition ------------------------------------

  it('renders the SessionsHeader child', () => {
    renderCard();
    expect(screen.getByTestId('sessions-header-stub')).toBeInTheDocument();
  });

  it('renders the SessionsAttachedSection child', () => {
    renderCard();
    expect(screen.getByTestId('sessions-attached-stub')).toBeInTheDocument();
  });

  it('renders the SessionsListSection child', () => {
    renderCard();
    expect(screen.getByTestId('sessions-list-stub')).toBeInTheDocument();
  });

  it('renders all three children exactly once', () => {
    renderCard();
    expect(screen.getAllByTestId('sessions-header-stub')).toHaveLength(1);
    expect(screen.getAllByTestId('sessions-attached-stub')).toHaveLength(1);
    expect(screen.getAllByTestId('sessions-list-stub')).toHaveLength(1);
  });

  it('applies the master-pane width classes on the outer Card wrapper', () => {
    const { container } = renderCard();
    const card = container.firstChild as HTMLElement;
    expect(card.className).toMatch(/md:w-80/);
    expect(card.className).toMatch(/lg:w-96/);
  });

  it('applies the flex-column min-h-0 layout class on the outer Card wrapper', () => {
    const { container } = renderCard();
    const card = container.firstChild as HTMLElement;
    expect(card.className).toMatch(/flex/);
    expect(card.className).toMatch(/min-h-0/);
    expect(card.className).toMatch(/flex-col/);
  });

  // ---- header prop wiring ---------------------------------------

  it('forwards the header search/query props into SessionsHeader', () => {
    renderCard({ query: 'pinned', totalFiltered: 3, total: 17 });
    expect(lastHeaderProps?.query).toBe('pinned');
    expect(lastHeaderProps?.totalFiltered).toBe(3);
    expect(lastHeaderProps?.total).toBe(17);
  });

  it('forwards the loading flag into SessionsHeader', () => {
    renderCard({ loading: true });
    expect(lastHeaderProps?.loading).toBe(true);
  });

  it('forwards the header action callbacks into SessionsHeader', () => {
    const { onQuery, onNewChat, onAttachNew, onRefresh } = renderCard();
    expect(lastHeaderProps?.onQuery).toBe(onQuery);
    expect(lastHeaderProps?.onNewChat).toBe(onNewChat);
    expect(lastHeaderProps?.onAttachNew).toBe(onAttachNew);
    expect(lastHeaderProps?.onRefresh).toBe(onRefresh);
  });

  // ---- attached-section prop wiring ------------------------------

  it('forwards the attachedCollapsed flag into SessionsAttachedSection', () => {
    renderCard({ attachedCollapsed: true });
    expect(lastAttachedProps?.collapsed).toBe(true);
  });

  it('forwards collapsed=false through the attached-section wiring', () => {
    renderCard({ attachedCollapsed: false });
    expect(lastAttachedProps?.collapsed).toBe(false);
  });

  it('forwards the filteredAttached list into SessionsAttachedSection.filtered', () => {
    renderCard({ filteredAttached: [ATTACHED_A] });
    expect(lastAttachedProps?.filtered).toEqual([ATTACHED_A]);
  });

  it('forwards the attachError into SessionsAttachedSection.error', () => {
    renderCard({ attachError: 'attach failed' });
    expect(lastAttachedProps?.error).toBe('attach failed');
  });

  it('forwards the selectedAttachmentName as the attached selectedName prop', () => {
    renderCard({ selectedAttachmentName: 'w1' });
    expect(lastAttachedProps?.selectedName).toBe('w1');
  });

  it('forwards a null selectedAttachmentName into SessionsAttachedSection.selectedName', () => {
    renderCard({ selectedAttachmentName: null });
    expect(lastAttachedProps?.selectedName).toBeNull();
  });

  it('forwards the attached-section callbacks into SessionsAttachedSection', () => {
    const {
      onToggleAttachedCollapsed,
      onSelectAttached,
      onAttachClick,
      onDetach,
    } = renderCard();
    expect(lastAttachedProps?.onToggle).toBe(onToggleAttachedCollapsed);
    expect(lastAttachedProps?.onSelect).toBe(onSelectAttached);
    expect(lastAttachedProps?.onAttachClick).toBe(onAttachClick);
    expect(lastAttachedProps?.onDetach).toBe(onDetach);
  });

  it('fires onToggleAttachedCollapsed when SessionsAttachedSection.onToggle is invoked', () => {
    const { onToggleAttachedCollapsed } = renderCard();
    lastAttachedProps?.onToggle?.();
    expect(onToggleAttachedCollapsed).toHaveBeenCalledTimes(1);
  });

  it('passes the session name through SessionsAttachedSection.onSelect to onSelectAttached', () => {
    const { onSelectAttached } = renderCard();
    lastAttachedProps?.onSelect?.('w1');
    expect(onSelectAttached).toHaveBeenCalledWith('w1');
  });

  it('passes the session name through SessionsAttachedSection.onDetach to onDetach', () => {
    const { onDetach } = renderCard();
    lastAttachedProps?.onDetach?.('w1');
    expect(onDetach).toHaveBeenCalledWith('w1');
  });

  it('fires onAttachClick when SessionsAttachedSection.onAttachClick is invoked', () => {
    const { onAttachClick } = renderCard();
    lastAttachedProps?.onAttachClick?.();
    expect(onAttachClick).toHaveBeenCalledTimes(1);
  });

  // ---- list-section prop wiring ----------------------------------

  it('forwards the filteredGroups into SessionsListSection.filteredGroups', () => {
    renderCard({ filteredGroups: [GROUP_A] });
    expect(lastListProps?.filteredGroups).toEqual([GROUP_A]);
  });

  it('forwards the list-section error into SessionsListSection.error', () => {
    renderCard({ error: 'load failed' });
    expect(lastListProps?.error).toBe('load failed');
  });

  it('forwards the loading flag into SessionsListSection.loading (separate from header)', () => {
    renderCard({ loading: true });
    expect(lastListProps?.loading).toBe(true);
  });

  it('forwards the collapsed map into SessionsListSection.collapsed', () => {
    const map = { 'proj-a': true };
    renderCard({ collapsed: map });
    expect(lastListProps?.collapsed).toBe(map);
  });

  it('forwards the selectedSessionId into SessionsListSection.selectedSessionId', () => {
    renderCard({ selectedSessionId: 'sid-aaaaaaaa1111' });
    expect(lastListProps?.selectedSessionId).toBe('sid-aaaaaaaa1111');
  });

  it('forwards a null selectedSessionId into SessionsListSection.selectedSessionId', () => {
    renderCard({ selectedSessionId: null });
    expect(lastListProps?.selectedSessionId).toBeNull();
  });

  it('forwards the list-section callbacks into SessionsListSection', () => {
    const { onToggleGroup, onSelectSession } = renderCard();
    expect(lastListProps?.onToggleGroup).toBe(onToggleGroup);
    expect(lastListProps?.onSelect).toBe(onSelectSession);
  });

  it('passes the group key through SessionsListSection.onToggleGroup', () => {
    const { onToggleGroup } = renderCard();
    lastListProps?.onToggleGroup?.('proj-a');
    expect(onToggleGroup).toHaveBeenCalledWith('proj-a');
  });

  it('passes the session id through SessionsListSection.onSelect to onSelectSession', () => {
    const { onSelectSession } = renderCard();
    lastListProps?.onSelect?.('sid-aaaaaaaa1111');
    expect(onSelectSession).toHaveBeenCalledWith('sid-aaaaaaaa1111');
  });

  // ---- isolation between attached + list -------------------------

  it('does NOT cross-wire the attached-section onSelect into onSelectSession', () => {
    const { onSelectSession } = renderCard();
    lastAttachedProps?.onSelect?.('w1');
    expect(onSelectSession).not.toHaveBeenCalled();
  });

  it('does NOT cross-wire the list-section onSelect into onSelectAttached', () => {
    const { onSelectAttached } = renderCard();
    lastListProps?.onSelect?.('sid-aaaaaaaa1111');
    expect(onSelectAttached).not.toHaveBeenCalled();
  });

  // ---- rerender stability ----------------------------------------

  it('rerendering with the same props does not duplicate the header stub', () => {
    const { rerender, props } = renderCard();
    rerender(<SessionsListCard {...props} />);
    expect(screen.getAllByTestId('sessions-header-stub')).toHaveLength(1);
  });

  it('re-invokes the header child with updated query on rerender', () => {
    const { rerender, props } = renderCard({ query: 'one' });
    expect(lastHeaderProps?.query).toBe('one');
    rerender(<SessionsListCard {...props} query="two" />);
    expect(lastHeaderProps?.query).toBe('two');
  });

  it('re-invokes the attached-section child with a new collapsed flag on rerender', () => {
    const { rerender, props } = renderCard({ attachedCollapsed: false });
    expect(lastAttachedProps?.collapsed).toBe(false);
    rerender(<SessionsListCard {...props} attachedCollapsed={true} />);
    expect(lastAttachedProps?.collapsed).toBe(true);
  });

  it('re-invokes the list-section child with new filteredGroups on rerender', () => {
    const { rerender, props } = renderCard({ filteredGroups: [] });
    expect(lastListProps?.filteredGroups).toEqual([]);
    rerender(<SessionsListCard {...props} filteredGroups={[GROUP_A]} />);
    expect(lastListProps?.filteredGroups).toEqual([GROUP_A]);
  });
});
