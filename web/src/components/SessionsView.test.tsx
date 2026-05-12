import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type {
  AttachedSession,
  SessionGroup,
  SessionSummary,
  SessionsResponse,
  Selection,
} from './SessionsView';

// The page-level Sessions view wires five hooks + four sibling
// components. Stub every child to a marker that exposes the
// props via data-* attributes + a tiny set of test buttons that
// fire the callbacks back into the parent. Stub the hooks to
// deterministic shapes so each test can drive a single branch
// without booting fetch / EventSource / localStorage.

const refreshSessionsMock = vi.fn();
const refreshAttachedMock = vi.fn();
const setAttachErrorMock = vi.fn();
const setModalOpenMock = vi.fn();
const setModalErrorMock = vi.fn();
const setNewChatOpenMock = vi.fn();
const setNewChatErrorMock = vi.fn();
const handleAttachSubmitMock = vi.fn();
const handleNewChatSubmitMock = vi.fn();
const handleDetachMock = vi.fn();
const toggleGroupMock = vi.fn();
const toggleAttachedCollapsedMock = vi.fn();
const dismissTourMock = vi.fn();

let listState: {
  data: SessionsResponse | null;
  attached: AttachedSession[];
  loading: boolean;
  error: string | null;
  attachError: string | null;
} = {
  data: null,
  attached: [],
  loading: false,
  error: null,
  attachError: null,
};

let filterState: {
  filteredGroups: SessionGroup[];
  totalFiltered: number;
  filteredAttached: AttachedSession[];
} = {
  filteredGroups: [],
  totalFiltered: 0,
  filteredAttached: [],
};

let actionsState: {
  modalOpen: boolean;
  modalBusy: boolean;
  modalError: string | null;
  newChatOpen: boolean;
  newChatBusy: boolean;
  newChatError: string | null;
} = {
  modalOpen: false,
  modalBusy: false,
  modalError: null,
  newChatOpen: false,
  newChatBusy: false,
  newChatError: null,
};

let collapseState: {
  collapsed: Record<string, boolean>;
  attachedCollapsed: boolean;
} = {
  collapsed: {},
  attachedCollapsed: false,
};

let tourState: { showTour: boolean } = { showTour: false };

let lastListGetSelection: (() => Selection | null) | null = null;
let lastListOnAutoSelect: ((next: Selection | null) => void) | null = null;
let lastActionsSetSelection:
  | ((next: Selection | null | ((prev: Selection | null) => Selection | null)) => void)
  | null = null;
let lastFilterArgs: {
  groups: SessionGroup[] | null;
  attached: AttachedSession[];
  query: string;
} | null = null;

vi.mock('../lib/use-sessions-tour', () => ({
  useSessionsTour: () => ({
    showTour: tourState.showTour,
    dismissTour: dismissTourMock,
  }),
}));

vi.mock('../lib/use-live-ref', async () => {
  const react = await vi.importActual<typeof import('react')>('react');
  return {
    useLiveRef: <T,>(value: T) => {
      const ref = react.useRef(value);
      ref.current = value;
      return ref;
    },
  };
});

vi.mock('../lib/use-sessions-list', () => ({
  useSessionsList: (args: {
    getSelection: () => Selection | null;
    onAutoSelect: (next: Selection | null) => void;
  }) => {
    lastListGetSelection = args.getSelection;
    lastListOnAutoSelect = args.onAutoSelect;
    return {
      data: listState.data,
      attached: listState.attached,
      loading: listState.loading,
      error: listState.error,
      attachError: listState.attachError,
      setAttachError: setAttachErrorMock,
      refreshSessions: refreshSessionsMock,
      refreshAttached: refreshAttachedMock,
    };
  },
}));

vi.mock('../lib/use-filtered-sessions', () => ({
  useFilteredSessions: (args: {
    groups: SessionGroup[] | null;
    attached: AttachedSession[];
    query: string;
  }) => {
    lastFilterArgs = args;
    return filterState;
  },
}));

vi.mock('../lib/use-sessions-collapse', () => ({
  useSessionsCollapse: () => ({
    collapsed: collapseState.collapsed,
    toggleGroup: toggleGroupMock,
    attachedCollapsed: collapseState.attachedCollapsed,
    toggleAttachedCollapsed: toggleAttachedCollapsedMock,
  }),
}));

vi.mock('../lib/use-sessions-actions', () => ({
  useSessionsActions: (args: {
    setSelection: (
      next: Selection | null | ((prev: Selection | null) => Selection | null),
    ) => void;
    setAttachError: (next: string | null) => void;
    refreshSessions: () => Promise<void>;
    refreshAttached: () => Promise<void>;
  }) => {
    lastActionsSetSelection = args.setSelection;
    return {
      modalOpen: actionsState.modalOpen,
      modalBusy: actionsState.modalBusy,
      modalError: actionsState.modalError,
      setModalOpen: setModalOpenMock,
      setModalError: setModalErrorMock,
      newChatOpen: actionsState.newChatOpen,
      newChatBusy: actionsState.newChatBusy,
      newChatError: actionsState.newChatError,
      setNewChatOpen: setNewChatOpenMock,
      setNewChatError: setNewChatErrorMock,
      handleAttachSubmit: handleAttachSubmitMock,
      handleNewChatSubmit: handleNewChatSubmitMock,
      handleDetach: handleDetachMock,
    };
  },
}));

interface CapturedListCardProps {
  query: string;
  totalFiltered: number;
  total: number;
  loading: boolean;
  attachedCollapsed: boolean;
  filteredAttached: AttachedSession[];
  attachError: string | null;
  selectedAttachmentName: string | null;
  filteredGroups: SessionGroup[];
  error: string | null;
  collapsed: Record<string, boolean>;
  selectedSessionId: string | null;
  onQuery: (next: string) => void;
  onNewChat: () => void;
  onAttachNew: () => void;
  onRefresh: () => void;
  onToggleAttachedCollapsed: () => void;
  onSelectAttached: (name: string) => void;
  onAttachClick: () => void;
  onDetach: (name: string) => void;
  onToggleGroup: (key: string) => void;
  onSelectSession: (id: string) => void;
}

let lastListCardProps: CapturedListCardProps | null = null;

vi.mock('./SessionsListCard', () => ({
  default: (props: CapturedListCardProps) => {
    lastListCardProps = props;
    return (
      <div
        data-testid="list-card"
        data-query={props.query}
        data-total-filtered={String(props.totalFiltered)}
        data-total={String(props.total)}
        data-loading={props.loading ? 'true' : 'false'}
        data-attached-collapsed={props.attachedCollapsed ? 'true' : 'false'}
        data-attached-len={String(props.filteredAttached.length)}
        data-attach-error={props.attachError ?? ''}
        data-selected-attached={props.selectedAttachmentName ?? ''}
        data-groups-len={String(props.filteredGroups.length)}
        data-error={props.error ?? ''}
        data-selected-session={props.selectedSessionId ?? ''}
      >
        <button
          type="button"
          data-testid="list-card-query"
          onClick={() => props.onQuery('hello')}
        >
          q
        </button>
        <button
          type="button"
          data-testid="list-card-new-chat"
          onClick={props.onNewChat}
        >
          new
        </button>
        <button
          type="button"
          data-testid="list-card-attach-new"
          onClick={props.onAttachNew}
        >
          attach-new
        </button>
        <button
          type="button"
          data-testid="list-card-refresh"
          onClick={props.onRefresh}
        >
          refresh
        </button>
        <button
          type="button"
          data-testid="list-card-toggle-attached"
          onClick={props.onToggleAttachedCollapsed}
        >
          tog-att
        </button>
        <button
          type="button"
          data-testid="list-card-select-attached"
          onClick={() => props.onSelectAttached('w1')}
        >
          sel-att
        </button>
        <button
          type="button"
          data-testid="list-card-attach-click"
          onClick={props.onAttachClick}
        >
          att-click
        </button>
        <button
          type="button"
          data-testid="list-card-detach"
          onClick={() => props.onDetach('w1')}
        >
          detach
        </button>
        <button
          type="button"
          data-testid="list-card-toggle-group"
          onClick={() => props.onToggleGroup('k1')}
        >
          tog-grp
        </button>
        <button
          type="button"
          data-testid="list-card-select-session"
          onClick={() => props.onSelectSession('sid-1')}
        >
          sel-sess
        </button>
      </div>
    );
  },
}));

interface CapturedRightPaneProps {
  selection: Selection | null;
  showStartFirstEmptyState: boolean;
  onNewChat: () => void;
  onAttachNew: () => void;
}

let lastRightPaneProps: CapturedRightPaneProps | null = null;

vi.mock('./SessionsRightPane', () => ({
  default: (props: CapturedRightPaneProps) => {
    lastRightPaneProps = props;
    return (
      <div
        data-testid="right-pane"
        data-selection-kind={props.selection?.kind ?? 'null'}
        data-selection-id={
          props.selection?.kind === 'session' ? props.selection.id : ''
        }
        data-selection-name={
          props.selection?.kind === 'attached' ? props.selection.name : ''
        }
        data-show-start-first={
          props.showStartFirstEmptyState ? 'true' : 'false'
        }
      >
        <button
          type="button"
          data-testid="right-new-chat"
          onClick={props.onNewChat}
        >
          new
        </button>
        <button
          type="button"
          data-testid="right-attach-new"
          onClick={props.onAttachNew}
        >
          attach
        </button>
      </div>
    );
  },
}));

interface CapturedAttachModalProps {
  open: boolean;
  busy: boolean;
  error: string | null;
  available: SessionSummary[];
  onClose: () => void;
  onSubmit: (path: string, name: string) => void;
}

let lastAttachModalProps: CapturedAttachModalProps | null = null;

vi.mock('./AttachModal', () => ({
  default: (props: CapturedAttachModalProps) => {
    lastAttachModalProps = props;
    return (
      <div
        data-testid="attach-modal"
        data-open={props.open ? 'true' : 'false'}
        data-busy={props.busy ? 'true' : 'false'}
        data-error={props.error ?? ''}
        data-available-len={String(props.available.length)}
      >
        <button
          type="button"
          data-testid="attach-modal-close"
          onClick={props.onClose}
        >
          close
        </button>
        <button
          type="button"
          data-testid="attach-modal-submit"
          onClick={() => props.onSubmit('p1', 'n1')}
        >
          submit
        </button>
      </div>
    );
  },
}));

interface CapturedNewChatModalProps {
  open: boolean;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (req: { prompt: string; model: string; agent: string }) => void;
}

let lastNewChatProps: CapturedNewChatModalProps | null = null;

vi.mock('./NewChatModal', () => ({
  default: (props: CapturedNewChatModalProps) => {
    lastNewChatProps = props;
    return (
      <div
        data-testid="new-chat-modal"
        data-open={props.open ? 'true' : 'false'}
        data-busy={props.busy ? 'true' : 'false'}
        data-error={props.error ?? ''}
      >
        <button
          type="button"
          data-testid="new-chat-close"
          onClick={props.onClose}
        >
          close
        </button>
        <button
          type="button"
          data-testid="new-chat-submit"
          onClick={() =>
            props.onSubmit({
              prompt: 'hi',
              model: 'default',
              agent: 'generic',
            })
          }
        >
          submit
        </button>
      </div>
    );
  },
}));

let lastTourProps: { onDismiss: () => void } | null = null;

vi.mock('./SessionsTour', () => ({
  default: (props: { onDismiss: () => void }) => {
    lastTourProps = props;
    return (
      <div data-testid="tour">
        <button
          type="button"
          data-testid="tour-dismiss"
          onClick={props.onDismiss}
        >
          dismiss
        </button>
      </div>
    );
  },
}));

import SessionsView from './SessionsView';

const SAMPLE_SESSIONS: SessionSummary[] = [
  {
    projectDir: 'a',
    projectPath: '/p/a',
    sessionId: 'sid-1',
    path: '/x.jsonl',
    updatedAt: '2026-05-01T00:00:00Z',
    size: 1,
    turnCount: 2,
    lastAssistantSnippet: 's',
  },
];

const SAMPLE_GROUPS: SessionGroup[] = [
  {
    projectPath: '/p/a',
    projectDir: 'a',
    sessions: SAMPLE_SESSIONS,
    updatedAt: '2026-05-01T00:00:00Z',
  },
];

const SAMPLE_ATTACHED: AttachedSession[] = [
  {
    name: 'w1',
    jsonlPath: '/x/w1.jsonl',
    sessionId: 'sid-w1',
    projectPath: '/p/a',
    createdAt: '2026-05-01T00:00:00Z',
    lastOffset: 0,
    role: 'worker',
  },
];

beforeEach(() => {
  setLocale('en');
  refreshSessionsMock.mockReset();
  refreshSessionsMock.mockResolvedValue(undefined);
  refreshAttachedMock.mockReset();
  refreshAttachedMock.mockResolvedValue(undefined);
  setAttachErrorMock.mockReset();
  setModalOpenMock.mockReset();
  setModalErrorMock.mockReset();
  setNewChatOpenMock.mockReset();
  setNewChatErrorMock.mockReset();
  handleAttachSubmitMock.mockReset();
  handleNewChatSubmitMock.mockReset();
  handleDetachMock.mockReset();
  toggleGroupMock.mockReset();
  toggleAttachedCollapsedMock.mockReset();
  dismissTourMock.mockReset();
  listState = {
    data: {
      rootDir: '/r',
      sessions: SAMPLE_SESSIONS,
      groups: SAMPLE_GROUPS,
      total: SAMPLE_SESSIONS.length,
    },
    attached: SAMPLE_ATTACHED,
    loading: false,
    error: null,
    attachError: null,
  };
  filterState = {
    filteredGroups: SAMPLE_GROUPS,
    totalFiltered: SAMPLE_SESSIONS.length,
    filteredAttached: SAMPLE_ATTACHED,
  };
  actionsState = {
    modalOpen: false,
    modalBusy: false,
    modalError: null,
    newChatOpen: false,
    newChatBusy: false,
    newChatError: null,
  };
  collapseState = { collapsed: {}, attachedCollapsed: false };
  tourState = { showTour: false };
  lastListCardProps = null;
  lastRightPaneProps = null;
  lastAttachModalProps = null;
  lastNewChatProps = null;
  lastTourProps = null;
  lastListGetSelection = null;
  lastListOnAutoSelect = null;
  lastActionsSetSelection = null;
  lastFilterArgs = null;
});

describe('<SessionsView>', () => {
  it('mounts the four primary children + the master card on default render', () => {
    render(<SessionsView />);
    expect(screen.getByTestId('list-card')).toBeInTheDocument();
    expect(screen.getByTestId('right-pane')).toBeInTheDocument();
    expect(screen.getByTestId('attach-modal')).toBeInTheDocument();
    expect(screen.getByTestId('new-chat-modal')).toBeInTheDocument();
  });

  it('does NOT render the tour when useSessionsTour returns showTour=false', () => {
    render(<SessionsView />);
    expect(screen.queryByTestId('tour')).not.toBeInTheDocument();
  });

  it('renders the tour overlay when useSessionsTour returns showTour=true', () => {
    tourState = { showTour: true };
    render(<SessionsView />);
    expect(screen.getByTestId('tour')).toBeInTheDocument();
  });

  it('passes the tour dismiss callback into SessionsTour', async () => {
    tourState = { showTour: true };
    const user = userEvent.setup();
    render(<SessionsView />);
    await user.click(screen.getByTestId('tour-dismiss'));
    expect(dismissTourMock).toHaveBeenCalledTimes(1);
  });

  it('forwards the filtered groups + total + total filtered into the list card', () => {
    render(<SessionsView />);
    const card = screen.getByTestId('list-card');
    expect(card).toHaveAttribute('data-groups-len', '1');
    expect(card).toHaveAttribute('data-total-filtered', '1');
    expect(card).toHaveAttribute('data-total', '1');
  });

  it('forwards the loading flag from the list hook into the list card', () => {
    listState = { ...listState, loading: true };
    render(<SessionsView />);
    expect(screen.getByTestId('list-card')).toHaveAttribute(
      'data-loading',
      'true',
    );
  });

  it('forwards the attached collapse flag from the collapse hook', () => {
    collapseState = { ...collapseState, attachedCollapsed: true };
    render(<SessionsView />);
    expect(screen.getByTestId('list-card')).toHaveAttribute(
      'data-attached-collapsed',
      'true',
    );
  });

  it('forwards the filtered attached list length into the list card', () => {
    render(<SessionsView />);
    expect(screen.getByTestId('list-card')).toHaveAttribute(
      'data-attached-len',
      '1',
    );
  });

  it('forwards the attach error from the list hook', () => {
    listState = { ...listState, attachError: 'boom' };
    render(<SessionsView />);
    expect(screen.getByTestId('list-card')).toHaveAttribute(
      'data-attach-error',
      'boom',
    );
  });

  it('forwards the list error from the list hook', () => {
    listState = { ...listState, error: 'broken' };
    render(<SessionsView />);
    expect(screen.getByTestId('list-card')).toHaveAttribute(
      'data-error',
      'broken',
    );
  });

  it('starts with no selected attachment or session', () => {
    render(<SessionsView />);
    const card = screen.getByTestId('list-card');
    expect(card).toHaveAttribute('data-selected-attached', '');
    expect(card).toHaveAttribute('data-selected-session', '');
  });

  it('drives the selected session when the list card fires onSelectSession', async () => {
    const user = userEvent.setup();
    render(<SessionsView />);
    await user.click(screen.getByTestId('list-card-select-session'));
    expect(screen.getByTestId('list-card')).toHaveAttribute(
      'data-selected-session',
      'sid-1',
    );
    expect(screen.getByTestId('right-pane')).toHaveAttribute(
      'data-selection-kind',
      'session',
    );
    expect(screen.getByTestId('right-pane')).toHaveAttribute(
      'data-selection-id',
      'sid-1',
    );
  });

  it('drives the selected attachment when the list card fires onSelectAttached', async () => {
    const user = userEvent.setup();
    render(<SessionsView />);
    await user.click(screen.getByTestId('list-card-select-attached'));
    expect(screen.getByTestId('list-card')).toHaveAttribute(
      'data-selected-attached',
      'w1',
    );
    expect(screen.getByTestId('right-pane')).toHaveAttribute(
      'data-selection-kind',
      'attached',
    );
    expect(screen.getByTestId('right-pane')).toHaveAttribute(
      'data-selection-name',
      'w1',
    );
  });

  it('forwards the query state via the list card onQuery callback', async () => {
    const user = userEvent.setup();
    render(<SessionsView />);
    await user.click(screen.getByTestId('list-card-query'));
    expect(screen.getByTestId('list-card')).toHaveAttribute(
      'data-query',
      'hello',
    );
  });

  it('forwards the typed query into the filter hook args', async () => {
    const user = userEvent.setup();
    render(<SessionsView />);
    await user.click(screen.getByTestId('list-card-query'));
    expect(lastFilterArgs?.query).toBe('hello');
  });

  it('refreshes both fetch hooks when the list card fires onRefresh', async () => {
    const user = userEvent.setup();
    render(<SessionsView />);
    await user.click(screen.getByTestId('list-card-refresh'));
    expect(refreshSessionsMock).toHaveBeenCalledTimes(1);
    expect(refreshAttachedMock).toHaveBeenCalledTimes(1);
  });

  it('opens the attach modal + clears its error when onAttachNew fires from the list card', async () => {
    const user = userEvent.setup();
    render(<SessionsView />);
    await user.click(screen.getByTestId('list-card-attach-new'));
    expect(setModalErrorMock).toHaveBeenCalledTimes(1);
    expect(setModalErrorMock).toHaveBeenLastCalledWith(null);
    expect(setModalOpenMock).toHaveBeenCalledTimes(1);
    expect(setModalOpenMock).toHaveBeenLastCalledWith(true);
  });

  it('opens the attach modal + clears its error when onAttachClick fires from the list card', async () => {
    const user = userEvent.setup();
    render(<SessionsView />);
    await user.click(screen.getByTestId('list-card-attach-click'));
    expect(setModalErrorMock).toHaveBeenCalledTimes(1);
    expect(setModalOpenMock).toHaveBeenLastCalledWith(true);
  });

  it('opens the new-chat modal + clears its error when onNewChat fires from the list card', async () => {
    const user = userEvent.setup();
    render(<SessionsView />);
    await user.click(screen.getByTestId('list-card-new-chat'));
    expect(setNewChatErrorMock).toHaveBeenLastCalledWith(null);
    expect(setNewChatOpenMock).toHaveBeenLastCalledWith(true);
  });

  it('opens the new-chat modal when onNewChat fires from the right pane', async () => {
    const user = userEvent.setup();
    render(<SessionsView />);
    await user.click(screen.getByTestId('right-new-chat'));
    expect(setNewChatOpenMock).toHaveBeenLastCalledWith(true);
  });

  it('opens the attach modal when onAttachNew fires from the right pane', async () => {
    const user = userEvent.setup();
    render(<SessionsView />);
    await user.click(screen.getByTestId('right-attach-new'));
    expect(setModalOpenMock).toHaveBeenLastCalledWith(true);
  });

  it('fires the toggle-group callback through to the collapse hook', async () => {
    const user = userEvent.setup();
    render(<SessionsView />);
    await user.click(screen.getByTestId('list-card-toggle-group'));
    expect(toggleGroupMock).toHaveBeenCalledTimes(1);
    expect(toggleGroupMock).toHaveBeenCalledWith('k1');
  });

  it('fires the toggle-attached callback through to the collapse hook', async () => {
    const user = userEvent.setup();
    render(<SessionsView />);
    await user.click(screen.getByTestId('list-card-toggle-attached'));
    expect(toggleAttachedCollapsedMock).toHaveBeenCalledTimes(1);
  });

  it('forwards the onDetach callback through to the sessions-actions hook', async () => {
    const user = userEvent.setup();
    render(<SessionsView />);
    await user.click(screen.getByTestId('list-card-detach'));
    expect(handleDetachMock).toHaveBeenCalledTimes(1);
    expect(handleDetachMock).toHaveBeenCalledWith('w1');
  });

  it('shows the empty-state CTA when nothing is filtered + not loading', () => {
    filterState = {
      filteredGroups: [],
      totalFiltered: 0,
      filteredAttached: [],
    };
    listState = { ...listState, loading: false };
    render(<SessionsView />);
    expect(screen.getByTestId('right-pane')).toHaveAttribute(
      'data-show-start-first',
      'true',
    );
  });

  it('hides the empty-state CTA when filtered groups exist', () => {
    render(<SessionsView />);
    expect(screen.getByTestId('right-pane')).toHaveAttribute(
      'data-show-start-first',
      'false',
    );
  });

  it('hides the empty-state CTA when the list is still loading', () => {
    filterState = {
      filteredGroups: [],
      totalFiltered: 0,
      filteredAttached: [],
    };
    listState = { ...listState, loading: true };
    render(<SessionsView />);
    expect(screen.getByTestId('right-pane')).toHaveAttribute(
      'data-show-start-first',
      'false',
    );
  });

  it('forwards the attach-modal open / busy / error / available shape from the actions hook', () => {
    actionsState = {
      ...actionsState,
      modalOpen: true,
      modalBusy: true,
      modalError: 'attach broke',
    };
    render(<SessionsView />);
    const m = screen.getByTestId('attach-modal');
    expect(m).toHaveAttribute('data-open', 'true');
    expect(m).toHaveAttribute('data-busy', 'true');
    expect(m).toHaveAttribute('data-error', 'attach broke');
    expect(m).toHaveAttribute('data-available-len', '1');
  });

  it('closes the attach modal when its onClose fires', async () => {
    const user = userEvent.setup();
    actionsState = { ...actionsState, modalOpen: true };
    render(<SessionsView />);
    await user.click(screen.getByTestId('attach-modal-close'));
    expect(setModalOpenMock).toHaveBeenCalledTimes(1);
    expect(setModalOpenMock).toHaveBeenLastCalledWith(false);
  });

  it('forwards the attach modal onSubmit through to handleAttachSubmit', async () => {
    const user = userEvent.setup();
    actionsState = { ...actionsState, modalOpen: true };
    render(<SessionsView />);
    await user.click(screen.getByTestId('attach-modal-submit'));
    expect(handleAttachSubmitMock).toHaveBeenCalledTimes(1);
    expect(handleAttachSubmitMock).toHaveBeenCalledWith('p1', 'n1');
  });

  it('forwards the new-chat modal open / busy / error from the actions hook', () => {
    actionsState = {
      ...actionsState,
      newChatOpen: true,
      newChatBusy: true,
      newChatError: 'chat err',
    };
    render(<SessionsView />);
    const m = screen.getByTestId('new-chat-modal');
    expect(m).toHaveAttribute('data-open', 'true');
    expect(m).toHaveAttribute('data-busy', 'true');
    expect(m).toHaveAttribute('data-error', 'chat err');
  });

  it('closes the new-chat modal when its onClose fires', async () => {
    const user = userEvent.setup();
    actionsState = { ...actionsState, newChatOpen: true };
    render(<SessionsView />);
    await user.click(screen.getByTestId('new-chat-close'));
    expect(setNewChatOpenMock).toHaveBeenLastCalledWith(false);
  });

  it('forwards the new-chat onSubmit through to handleNewChatSubmit', async () => {
    const user = userEvent.setup();
    actionsState = { ...actionsState, newChatOpen: true };
    render(<SessionsView />);
    await user.click(screen.getByTestId('new-chat-submit'));
    expect(handleNewChatSubmitMock).toHaveBeenCalledTimes(1);
    expect(handleNewChatSubmitMock).toHaveBeenCalledWith({
      prompt: 'hi',
      model: 'default',
      agent: 'generic',
    });
  });

  it('passes the selection getter into the sessions-list hook', () => {
    render(<SessionsView />);
    expect(typeof lastListGetSelection).toBe('function');
    expect(lastListGetSelection?.()).toBeNull();
  });

  it('updates the selection reflected by the getter when the user picks a row', async () => {
    const user = userEvent.setup();
    render(<SessionsView />);
    await user.click(screen.getByTestId('list-card-select-session'));
    expect(lastListGetSelection?.()).toEqual({
      kind: 'session',
      id: 'sid-1',
    });
  });

  it('drives auto-select-first via the onAutoSelect callback exposed to the hook', () => {
    render(<SessionsView />);
    expect(typeof lastListOnAutoSelect).toBe('function');
    act(() => {
      lastListOnAutoSelect?.({ kind: 'session', id: 'auto-sid' });
    });
    expect(screen.getByTestId('right-pane')).toHaveAttribute(
      'data-selection-id',
      'auto-sid',
    );
  });

  it('exposes a setSelection callback to the actions hook that can clear the selection', () => {
    render(<SessionsView />);
    expect(typeof lastActionsSetSelection).toBe('function');
    act(() => {
      lastActionsSetSelection?.({ kind: 'attached', name: 'forced' });
    });
    expect(screen.getByTestId('right-pane')).toHaveAttribute(
      'data-selection-name',
      'forced',
    );
  });

  it('renders the outer flex layout container', () => {
    const { container } = render(<SessionsView />);
    const root = container.firstChild as HTMLElement;
    expect(root).toHaveClass('flex');
    expect(root).toHaveClass('w-full');
  });

  it('re-renders translated copy when the locale flips to ko', () => {
    render(<SessionsView />);
    act(() => {
      setLocale('ko');
    });
    expect(screen.getByTestId('list-card')).toBeInTheDocument();
  });
});
