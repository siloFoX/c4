import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type {
  ActionKind,
  BatchKind,
  BatchOutcome,
  SingleAction,
} from './ControlPanel';
import type { Worker } from '../types';
import type { ToastType } from './Toast';
import type { ToastState } from '../lib/use-toast';

// ControlPanel wires four hooks (useLocale, useToast,
// useControlPanelWorkerList, useControlPanelSingle,
// useWorkerSelection) and five child components
// (ControlPanelActions, ControlPanelBatch, StatusMessageCard,
// Toast, Tracker). Stub every hook to a deterministic shape so
// each test can drive a single branch without booting fetch
// or postAction. Stub each child to a marker that surfaces
// the prop shape via data-* + a tiny set of test buttons that
// fire the callbacks back into the parent.

const showToastMock = vi.fn();
const dismissToastMock = vi.fn();
const fetchListMock = vi.fn(async () => {});
const runSingleMock = vi.fn(async (_action: SingleAction) => {});
const toggleSelectedMock = vi.fn();
const selectAllMock = vi.fn();
const clearSelectionMock = vi.fn();
const runBatchMock = vi.fn(async (_kind: BatchKind) => {});

let toastState: { toast: ToastState | null } = { toast: null };

let workerListState: { workers: Worker[] } = { workers: [] };

let singleState: { busyKind: ActionKind | null } = { busyKind: null };

let selectionState: {
  selected: Set<string>;
  batchBusy: BatchKind | null;
  batchResults: BatchOutcome[] | null;
} = {
  selected: new Set(),
  batchBusy: null,
  batchResults: null,
};

let lastSingleArgs: {
  workerName: string;
  showToast: (msg: string, type: ToastType) => void;
  fetchList: () => Promise<void>;
} | null = null;
let lastSelectionArgs: {
  workers: Worker[];
  showToast: (msg: string, type: ToastType) => void;
  fetchList: () => Promise<void>;
} | null = null;

vi.mock('../lib/use-toast', () => ({
  useToast: () => ({
    toast: toastState.toast,
    showToast: showToastMock,
    dismissToast: dismissToastMock,
  }),
}));

vi.mock('../lib/use-control-panel-worker-list', () => ({
  useControlPanelWorkerList: () => ({
    workers: workerListState.workers,
    fetchList: fetchListMock,
  }),
}));

vi.mock('../lib/use-control-panel-single', () => ({
  useControlPanelSingle: (args: {
    workerName: string;
    showToast: (msg: string, type: ToastType) => void;
    fetchList: () => Promise<void>;
  }) => {
    lastSingleArgs = args;
    return { busyKind: singleState.busyKind, runSingle: runSingleMock };
  },
}));

vi.mock('../lib/use-worker-selection', () => ({
  useWorkerSelection: (args: {
    workers: Worker[];
    showToast: (msg: string, type: ToastType) => void;
    fetchList: () => Promise<void>;
  }) => {
    lastSelectionArgs = args;
    return {
      selected: selectionState.selected,
      toggleSelected: toggleSelectedMock,
      selectAll: selectAllMock,
      clearSelection: clearSelectionMock,
      batchBusy: selectionState.batchBusy,
      batchResults: selectionState.batchResults,
      runBatch: runBatchMock,
    };
  },
}));

interface CapturedActionsProps {
  workerName: string;
  actions: SingleAction[];
  busyKind: ActionKind | null;
  onRunSingle: (action: SingleAction) => void;
}

let lastActionsProps: CapturedActionsProps | null = null;

vi.mock('./ControlPanelActions', () => ({
  default: (props: CapturedActionsProps) => {
    lastActionsProps = props;
    return (
      <div
        data-testid="single-actions"
        data-worker={props.workerName}
        data-busy-kind={props.busyKind ?? ''}
        data-count={String(props.actions.length)}
      >
        {props.actions.map((a) => (
          <button
            key={a.kind}
            type="button"
            data-testid={`single-${a.kind}`}
            data-endpoint={a.endpoint}
            data-tone={a.tone}
            data-confirm={a.confirm ?? ''}
            onClick={() => props.onRunSingle(a)}
          >
            {a.kind}
          </button>
        ))}
      </div>
    );
  },
}));

interface CapturedBatchProps {
  selectableWorkers: Worker[];
  selected: Set<string>;
  selectedCount: number;
  batchBusy: BatchKind | null;
  disableBatch: boolean;
  batchResults: BatchOutcome[] | null;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onToggleSelected: (name: string) => void;
  onRunBatch: (kind: BatchKind) => void;
}

let lastBatchProps: CapturedBatchProps | null = null;

vi.mock('./ControlPanelBatch', () => ({
  default: (props: CapturedBatchProps) => {
    lastBatchProps = props;
    return (
      <div
        data-testid="batch"
        data-len={String(props.selectableWorkers.length)}
        data-selected-count={String(props.selectedCount)}
        data-batch-busy={props.batchBusy ?? ''}
        data-disable={props.disableBatch ? 'true' : 'false'}
        data-results={
          props.batchResults === null
            ? 'null'
            : String(props.batchResults.length)
        }
      >
        <button
          type="button"
          data-testid="batch-select-all"
          onClick={props.onSelectAll}
        >
          select all
        </button>
        <button
          type="button"
          data-testid="batch-clear"
          onClick={props.onClearSelection}
        >
          clear
        </button>
        <button
          type="button"
          data-testid="batch-toggle-w1"
          onClick={() => props.onToggleSelected('w1')}
        >
          toggle w1
        </button>
        <button
          type="button"
          data-testid="batch-run-close"
          onClick={() => props.onRunBatch('close')}
        >
          run close
        </button>
        <button
          type="button"
          data-testid="batch-run-cancel"
          onClick={() => props.onRunBatch('cancel')}
        >
          run cancel
        </button>
      </div>
    );
  },
}));

interface CapturedStatusProps {
  workerName: string;
  onToast: (msg: string, type: ToastType) => void;
}

let lastStatusProps: CapturedStatusProps | null = null;

vi.mock('./StatusMessageCard', () => ({
  default: (props: CapturedStatusProps) => {
    lastStatusProps = props;
    return (
      <div data-testid="status-card" data-worker={props.workerName}>
        <button
          type="button"
          data-testid="status-fire-toast"
          onClick={() => props.onToast('status sent', 'success')}
        >
          fire toast
        </button>
      </div>
    );
  },
}));

interface CapturedToastProps {
  message: string;
  type: ToastType;
  onDismiss: () => void;
}

vi.mock('./Toast', () => ({
  default: (props: CapturedToastProps) => (
    <div
      data-testid="toast"
      data-message={props.message}
      data-type={props.type}
    >
      <button
        type="button"
        data-testid="toast-dismiss"
        onClick={props.onDismiss}
      >
        dismiss
      </button>
    </div>
  ),
}));

import ControlPanel from './ControlPanel';

const WORKER_SAMPLE: Worker[] = [
  {
    name: 'w1',
    command: 'claude',
    target: 'local',
    branch: 'c4/w1',
    worktree: '/tmp/w1',
    parent: null,
    scope: false,
    pid: 1234,
    status: 'idle',
    unreadSnapshots: 0,
    totalSnapshots: 0,
    intervention: null,
    lastQuestion: null,
    errorCount: 0,
    phase: null,
    testFailCount: 0,
  },
  {
    name: 'w2',
    command: 'claude',
    target: 'local',
    branch: 'c4/w2',
    worktree: '/tmp/w2',
    parent: null,
    scope: false,
    pid: 1235,
    status: 'busy',
    unreadSnapshots: 0,
    totalSnapshots: 0,
    intervention: null,
    lastQuestion: null,
    errorCount: 0,
    phase: null,
    testFailCount: 0,
  },
];

beforeEach(() => {
  setLocale('en');
  showToastMock.mockReset();
  dismissToastMock.mockReset();
  fetchListMock.mockReset();
  fetchListMock.mockResolvedValue(undefined);
  runSingleMock.mockReset();
  runSingleMock.mockResolvedValue(undefined);
  toggleSelectedMock.mockReset();
  selectAllMock.mockReset();
  clearSelectionMock.mockReset();
  runBatchMock.mockReset();
  runBatchMock.mockResolvedValue(undefined);
  toastState = { toast: null };
  workerListState = { workers: [] };
  singleState = { busyKind: null };
  selectionState = {
    selected: new Set(),
    batchBusy: null,
    batchResults: null,
  };
  lastSingleArgs = null;
  lastSelectionArgs = null;
  lastActionsProps = null;
  lastBatchProps = null;
  lastStatusProps = null;
});

describe('<ControlPanel>', () => {
  it('mounts single-actions + batch + status-card on default render', () => {
    render(<ControlPanel workerName="w1" />);
    expect(screen.getByTestId('single-actions')).toBeInTheDocument();
    expect(screen.getByTestId('batch')).toBeInTheDocument();
    expect(screen.getByTestId('status-card')).toBeInTheDocument();
  });

  it('forwards the workerName into every child surface that needs it', () => {
    render(<ControlPanel workerName="alpha" />);
    expect(screen.getByTestId('single-actions')).toHaveAttribute(
      'data-worker',
      'alpha',
    );
    expect(screen.getByTestId('status-card')).toHaveAttribute(
      'data-worker',
      'alpha',
    );
  });

  it('forwards the workerName into the single-action + selection hooks', () => {
    render(<ControlPanel workerName="alpha" />);
    expect(lastSingleArgs?.workerName).toBe('alpha');
  });

  it('builds the six documented single-actions (pause/resume/cancel/restart/rollback/close)', () => {
    render(<ControlPanel workerName="w1" />);
    expect(screen.getByTestId('single-actions')).toHaveAttribute(
      'data-count',
      '6',
    );
    expect(screen.getByTestId('single-pause')).toBeInTheDocument();
    expect(screen.getByTestId('single-resume')).toBeInTheDocument();
    expect(screen.getByTestId('single-cancel')).toBeInTheDocument();
    expect(screen.getByTestId('single-restart')).toBeInTheDocument();
    expect(screen.getByTestId('single-rollback')).toBeInTheDocument();
    expect(screen.getByTestId('single-close')).toBeInTheDocument();
  });

  it('routes pause/resume to /api/key and cancel/restart/rollback/close to dedicated endpoints', () => {
    render(<ControlPanel workerName="w1" />);
    expect(screen.getByTestId('single-pause')).toHaveAttribute(
      'data-endpoint',
      '/api/key',
    );
    expect(screen.getByTestId('single-resume')).toHaveAttribute(
      'data-endpoint',
      '/api/key',
    );
    expect(screen.getByTestId('single-cancel')).toHaveAttribute(
      'data-endpoint',
      '/api/cancel',
    );
    expect(screen.getByTestId('single-restart')).toHaveAttribute(
      'data-endpoint',
      '/api/restart',
    );
    expect(screen.getByTestId('single-rollback')).toHaveAttribute(
      'data-endpoint',
      '/api/rollback',
    );
    expect(screen.getByTestId('single-close')).toHaveAttribute(
      'data-endpoint',
      '/api/close',
    );
  });

  it('marks rollback + close as danger tone, cancel + restart as warn, pause + resume as neutral', () => {
    render(<ControlPanel workerName="w1" />);
    expect(screen.getByTestId('single-pause')).toHaveAttribute(
      'data-tone',
      'neutral',
    );
    expect(screen.getByTestId('single-resume')).toHaveAttribute(
      'data-tone',
      'neutral',
    );
    expect(screen.getByTestId('single-cancel')).toHaveAttribute(
      'data-tone',
      'warn',
    );
    expect(screen.getByTestId('single-restart')).toHaveAttribute(
      'data-tone',
      'warn',
    );
    expect(screen.getByTestId('single-rollback')).toHaveAttribute(
      'data-tone',
      'danger',
    );
    expect(screen.getByTestId('single-close')).toHaveAttribute(
      'data-tone',
      'danger',
    );
  });

  it('omits a confirm string on pause + resume but sets one on the destructive actions', () => {
    render(<ControlPanel workerName="w1" />);
    expect(screen.getByTestId('single-pause')).toHaveAttribute(
      'data-confirm',
      '',
    );
    expect(screen.getByTestId('single-resume')).toHaveAttribute(
      'data-confirm',
      '',
    );
    expect(screen.getByTestId('single-close')).not.toHaveAttribute(
      'data-confirm',
      '',
    );
    expect(screen.getByTestId('single-rollback')).not.toHaveAttribute(
      'data-confirm',
      '',
    );
  });

  it('passes the single-action busyKind through to ControlPanelActions', () => {
    singleState = { busyKind: 'restart' };
    render(<ControlPanel workerName="w1" />);
    expect(screen.getByTestId('single-actions')).toHaveAttribute(
      'data-busy-kind',
      'restart',
    );
  });

  it('drives ControlPanelActions onRunSingle through to the hook dispatcher with the action payload', async () => {
    const user = userEvent.setup();
    render(<ControlPanel workerName="w1" />);
    await user.click(screen.getByTestId('single-pause'));
    expect(runSingleMock).toHaveBeenCalledTimes(1);
    expect(runSingleMock.mock.calls[0][0]).toMatchObject({
      kind: 'pause',
      endpoint: '/api/key',
    });
  });

  it('runs the close single-action via the hook dispatcher', async () => {
    const user = userEvent.setup();
    render(<ControlPanel workerName="w1" />);
    await user.click(screen.getByTestId('single-close'));
    expect(runSingleMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'close', endpoint: '/api/close' }),
    );
  });

  it('forwards the worker list from the list hook into the batch panel', () => {
    workerListState = { workers: WORKER_SAMPLE };
    render(<ControlPanel workerName="w1" />);
    expect(screen.getByTestId('batch')).toHaveAttribute(
      'data-len',
      String(WORKER_SAMPLE.length),
    );
  });

  it('passes the same worker list into the selection hook', () => {
    workerListState = { workers: WORKER_SAMPLE };
    render(<ControlPanel workerName="w1" />);
    expect(lastSelectionArgs?.workers).toBe(WORKER_SAMPLE);
  });

  it('forwards the selected set + count into the batch panel', () => {
    selectionState = {
      ...selectionState,
      selected: new Set(['w1', 'w2']),
    };
    render(<ControlPanel workerName="w1" />);
    expect(screen.getByTestId('batch')).toHaveAttribute(
      'data-selected-count',
      '2',
    );
  });

  it('disables batch actions when no workers are selected', () => {
    render(<ControlPanel workerName="w1" />);
    expect(screen.getByTestId('batch')).toHaveAttribute('data-disable', 'true');
  });

  it('enables batch actions once a worker is selected and the dispatch is idle', () => {
    selectionState = {
      ...selectionState,
      selected: new Set(['w1']),
    };
    render(<ControlPanel workerName="w1" />);
    expect(screen.getByTestId('batch')).toHaveAttribute(
      'data-disable',
      'false',
    );
  });

  it('disables batch actions while a batch dispatch is busy even with selection', () => {
    selectionState = {
      selected: new Set(['w1']),
      batchBusy: 'close',
      batchResults: null,
    };
    render(<ControlPanel workerName="w1" />);
    expect(screen.getByTestId('batch')).toHaveAttribute('data-disable', 'true');
    expect(screen.getByTestId('batch')).toHaveAttribute(
      'data-batch-busy',
      'close',
    );
  });

  it('forwards the batchResults array length into the batch panel marker', () => {
    selectionState = {
      ...selectionState,
      batchResults: [
        { name: 'w1', ok: true },
        { name: 'w2', ok: false, error: 'boom' },
      ],
    };
    render(<ControlPanel workerName="w1" />);
    expect(screen.getByTestId('batch')).toHaveAttribute('data-results', '2');
  });

  it('drives batch onSelectAll through to the selection hook', async () => {
    const user = userEvent.setup();
    render(<ControlPanel workerName="w1" />);
    await user.click(screen.getByTestId('batch-select-all'));
    expect(selectAllMock).toHaveBeenCalledTimes(1);
  });

  it('drives batch onClearSelection through to the selection hook', async () => {
    const user = userEvent.setup();
    render(<ControlPanel workerName="w1" />);
    await user.click(screen.getByTestId('batch-clear'));
    expect(clearSelectionMock).toHaveBeenCalledTimes(1);
  });

  it('drives batch onToggleSelected through to the selection hook with the worker name', async () => {
    const user = userEvent.setup();
    render(<ControlPanel workerName="w1" />);
    await user.click(screen.getByTestId('batch-toggle-w1'));
    expect(toggleSelectedMock).toHaveBeenCalledTimes(1);
    expect(toggleSelectedMock).toHaveBeenCalledWith('w1');
  });

  it('drives batch onRunBatch through to the selection hook for close', async () => {
    const user = userEvent.setup();
    render(<ControlPanel workerName="w1" />);
    await user.click(screen.getByTestId('batch-run-close'));
    expect(runBatchMock).toHaveBeenCalledTimes(1);
    expect(runBatchMock).toHaveBeenCalledWith('close');
  });

  it('drives batch onRunBatch through to the selection hook for cancel', async () => {
    const user = userEvent.setup();
    render(<ControlPanel workerName="w1" />);
    await user.click(screen.getByTestId('batch-run-cancel'));
    expect(runBatchMock).toHaveBeenCalledWith('cancel');
  });

  it('forwards onToast from the status card through to the toast hook', async () => {
    const user = userEvent.setup();
    render(<ControlPanel workerName="w1" />);
    await user.click(screen.getByTestId('status-fire-toast'));
    expect(showToastMock).toHaveBeenCalledTimes(1);
    expect(showToastMock).toHaveBeenCalledWith('status sent', 'success');
  });

  it('does NOT mount the Toast slot when there is no active toast', () => {
    render(<ControlPanel workerName="w1" />);
    expect(screen.queryByTestId('toast')).not.toBeInTheDocument();
  });

  it('mounts the Toast slot when a toast is active', () => {
    toastState = {
      toast: { id: 1, message: 'hello', type: 'info' },
    };
    render(<ControlPanel workerName="w1" />);
    expect(screen.getByTestId('toast')).toBeInTheDocument();
    expect(screen.getByTestId('toast')).toHaveAttribute(
      'data-message',
      'hello',
    );
    expect(screen.getByTestId('toast')).toHaveAttribute('data-type', 'info');
  });

  it('forwards the toast onDismiss callback to the toast hook', async () => {
    toastState = {
      toast: { id: 1, message: 'hello', type: 'success' },
    };
    const user = userEvent.setup();
    render(<ControlPanel workerName="w1" />);
    await user.click(screen.getByTestId('toast-dismiss'));
    expect(dismissToastMock).toHaveBeenCalledTimes(1);
  });

  it('passes a stable showToast reference into both single + selection hooks', () => {
    render(<ControlPanel workerName="w1" />);
    expect(lastSingleArgs?.showToast).toBe(showToastMock);
    expect(lastSelectionArgs?.showToast).toBe(showToastMock);
  });

  it('passes a stable fetchList reference into both single + selection hooks', () => {
    render(<ControlPanel workerName="w1" />);
    expect(lastSingleArgs?.fetchList).toBe(fetchListMock);
    expect(lastSelectionArgs?.fetchList).toBe(fetchListMock);
  });

  it('forwards the same fetchList reference as the status-card onToast hook (showToast)', () => {
    render(<ControlPanel workerName="w1" />);
    expect(lastStatusProps?.onToast).toBe(showToastMock);
  });

  it('renders the outer flex container with the documented overflow class', () => {
    const { container } = render(<ControlPanel workerName="w1" />);
    const root = container.firstChild as HTMLElement;
    expect(root).toHaveClass('flex');
    expect(root).toHaveClass('flex-col');
    expect(root).toHaveClass('overflow-y-auto');
  });

  it('regenerates the actions array on each render so labels follow locale changes', () => {
    const { rerender } = render(<ControlPanel workerName="w1" />);
    const firstActions = lastActionsProps?.actions;
    rerender(<ControlPanel workerName="w1" />);
    expect(lastActionsProps?.actions).not.toBe(firstActions);
    expect(lastActionsProps?.actions.length).toBe(6);
  });

  it('re-renders translated children when the locale flips to ko', () => {
    render(<ControlPanel workerName="w1" />);
    act(() => {
      setLocale('ko');
    });
    expect(screen.getByTestId('single-actions')).toBeInTheDocument();
    expect(screen.getByTestId('batch')).toBeInTheDocument();
  });

  it('keeps action body payloads pinned to the workerName argument', () => {
    render(<ControlPanel workerName="alpha-1" />);
    const closeAction = lastActionsProps?.actions.find(
      (a) => a.kind === 'close',
    );
    expect(closeAction?.body).toEqual({ name: 'alpha-1' });
    const pauseAction = lastActionsProps?.actions.find(
      (a) => a.kind === 'pause',
    );
    expect(pauseAction?.body).toEqual({ name: 'alpha-1', key: 'C-c' });
    const resumeAction = lastActionsProps?.actions.find(
      (a) => a.kind === 'resume',
    );
    expect(resumeAction?.body).toEqual({ name: 'alpha-1', key: 'Enter' });
  });

  it('puts the workerName into each successMessage', () => {
    render(<ControlPanel workerName="bravo" />);
    const pauseAction = lastActionsProps?.actions.find(
      (a) => a.kind === 'pause',
    );
    expect(pauseAction?.successMessage('bravo')).toContain('bravo');
  });
});
