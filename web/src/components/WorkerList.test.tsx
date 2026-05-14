import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type { Worker } from '../types';

// (v1.11.116) WorkerList composes two external dependencies:
// useWorkerList (poll + SSE workers) and usePersistedBool
// (localStorage-backed open/closed state for each group). Stub
// useWorkerList so each test drives the workers / error /
// sseConnected branches deterministically, and keep the real
// usePersistedBool so the group expand/collapse toggle and its
// localStorage round-trip are exercised end-to-end. The persisted
// keys are cleared in beforeEach so a prior test's collapse never
// leaks into the next render.

const refreshMock = vi.fn();

let workerListState: {
  workers: Worker[];
  error: string | null;
  sseConnected: boolean;
} = {
  workers: [],
  error: null,
  sseConnected: true,
};

vi.mock('../lib/use-worker-list', () => ({
  useWorkerList: () => ({
    ...workerListState,
    refresh: refreshMock,
  }),
}));

import WorkerList from './WorkerList';

function makeWorker(over: Partial<Worker> & { name: string }): Worker {
  return {
    name: over.name,
    command: 'claude',
    target: 'local',
    branch: null,
    worktree: null,
    parent: null,
    scope: false,
    pid: null,
    status: 'idle',
    unreadSnapshots: 0,
    totalSnapshots: 0,
    intervention: null,
    lastQuestion: null,
    errorCount: 0,
    phase: null,
    testFailCount: 0,
    tier: 'worker',
    ...over,
  };
}

beforeEach(() => {
  setLocale('en');
  refreshMock.mockReset();
  workerListState = { workers: [], error: null, sseConnected: true };
  try {
    window.localStorage.removeItem('c4.workerList.managers.open');
    window.localStorage.removeItem('c4.workerList.workers.open');
  } catch {
    // ignore
  }
});

describe('<WorkerList>', () => {
  // ---- empty / connection / error states -------------------------

  it('renders the localized empty-state copy when there are no workers', () => {
    render(<WorkerList selectedWorker={null} onSelect={() => {}} />);
    expect(screen.getByText('No workers yet.')).toBeInTheDocument();
  });

  it('renders the SSE-disconnected warning chip when sseConnected=false', () => {
    workerListState = { ...workerListState, sseConnected: false };
    render(<WorkerList selectedWorker={null} onSelect={() => {}} />);
    expect(
      screen.getByText(/Live updates disconnected/i),
    ).toBeInTheDocument();
  });

  it('renders the error banner with the formatted i18n message when error is set', () => {
    workerListState = { ...workerListState, error: 'list 500' };
    render(<WorkerList selectedWorker={null} onSelect={() => {}} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('list 500');
    expect(alert).toHaveTextContent(/Failed to load workers/i);
    expect(screen.queryByText('No workers yet.')).not.toBeInTheDocument();
  });

  // ---- list / group rendering ------------------------------------

  it('renders a row per worker for multiple workers in the same group', () => {
    workerListState = {
      ...workerListState,
      workers: [
        makeWorker({ name: 'b' }),
        makeWorker({ name: 'a' }),
        makeWorker({ name: 'c' }),
      ],
    };
    render(<WorkerList selectedWorker={null} onSelect={() => {}} />);
    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.getByText('b')).toBeInTheDocument();
    expect(screen.getByText('c')).toBeInTheDocument();
  });

  it('sorts worker rows alphabetically inside the workers group', () => {
    workerListState = {
      ...workerListState,
      workers: [
        makeWorker({ name: 'zeta' }),
        makeWorker({ name: 'alpha' }),
        makeWorker({ name: 'mike' }),
      ],
    };
    render(<WorkerList selectedWorker={null} onSelect={() => {}} />);
    const panel = document.getElementById('worker-group-workers') as HTMLElement;
    const names = Array.from(panel.querySelectorAll('span.font-medium')).map(
      (n) => n.textContent,
    );
    expect(names).toEqual(['alpha', 'mike', 'zeta']);
  });

  it('renders only the workers group when there are no managers', () => {
    workerListState = {
      ...workerListState,
      workers: [makeWorker({ name: 'w1', tier: 'worker' })],
    };
    render(<WorkerList selectedWorker={null} onSelect={() => {}} />);
    expect(
      screen.queryByRole('button', { name: /managers/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /workers/i }),
    ).toBeInTheDocument();
  });

  it('renders only the managers group when there are no regular workers', () => {
    workerListState = {
      ...workerListState,
      workers: [makeWorker({ name: 'mgr-1', tier: 'manager' })],
    };
    render(<WorkerList selectedWorker={null} onSelect={() => {}} />);
    expect(
      screen.getByRole('button', { name: /managers/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^workers/i }),
    ).not.toBeInTheDocument();
  });

  it('partitions managers and workers into their own groups by tier', () => {
    workerListState = {
      ...workerListState,
      workers: [
        makeWorker({ name: 'mgr-a', tier: 'manager' }),
        makeWorker({ name: 'wrk-a', tier: 'worker' }),
      ],
    };
    render(<WorkerList selectedWorker={null} onSelect={() => {}} />);
    const mgrPanel = document.getElementById(
      'worker-group-managers',
    ) as HTMLElement;
    const wrkPanel = document.getElementById(
      'worker-group-workers',
    ) as HTMLElement;
    expect(within(mgrPanel).getByText('mgr-a')).toBeInTheDocument();
    expect(within(wrkPanel).getByText('wrk-a')).toBeInTheDocument();
    expect(within(mgrPanel).queryByText('wrk-a')).not.toBeInTheDocument();
    expect(within(wrkPanel).queryByText('mgr-a')).not.toBeInTheDocument();
  });

  // ---- per-row decoration ----------------------------------------

  it('renders the status badge with the worker status text', () => {
    workerListState = {
      ...workerListState,
      workers: [makeWorker({ name: 'w-busy', status: 'busy' })],
    };
    render(<WorkerList selectedWorker={null} onSelect={() => {}} />);
    expect(screen.getByText('busy')).toBeInTheDocument();
  });

  it('maps idle status to the success badge variant', () => {
    workerListState = {
      ...workerListState,
      workers: [makeWorker({ name: 'w-idle', status: 'idle' })],
    };
    render(<WorkerList selectedWorker={null} onSelect={() => {}} />);
    expect(screen.getByText('idle').className).toMatch(/success/);
  });

  it('renders an "N unread" badge when unreadSnapshots > 0 and omits it when zero', () => {
    workerListState = {
      ...workerListState,
      workers: [
        makeWorker({ name: 'w-unread', unreadSnapshots: 7 }),
        makeWorker({ name: 'w-clean', unreadSnapshots: 0 }),
      ],
    };
    render(<WorkerList selectedWorker={null} onSelect={() => {}} />);
    expect(screen.getByText('7 unread')).toBeInTheDocument();
    const clean = screen
      .getByText('w-clean')
      .closest('[role="button"]') as HTMLElement;
    expect(within(clean).queryByText(/unread/i)).not.toBeInTheDocument();
  });

  it('renders the intervention badge for the v8.21 string enum form', () => {
    workerListState = {
      ...workerListState,
      workers: [
        makeWorker({
          name: 'w-int',
          status: 'busy',
          intervention: 'approval_pending',
        }),
      ],
    };
    render(<WorkerList selectedWorker={null} onSelect={() => {}} />);
    // statusLabel + the intervention badge both surface the literal
    // "intervention" string when intervention is active, so a
    // status-busy + approval_pending worker emits two matching spans.
    const matches = screen.getAllByText('intervention');
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('renders the intervention reason from the legacy object form', () => {
    workerListState = {
      ...workerListState,
      workers: [
        makeWorker({
          name: 'w-int',
          status: 'busy',
          intervention: { active: true, reason: 'waiting on approval' },
        }),
      ],
    };
    render(<WorkerList selectedWorker={null} onSelect={() => {}} />);
    expect(screen.getByText('waiting on approval')).toBeInTheDocument();
  });

  it('renders the branch name when the worker has a branch and omits it when null', () => {
    workerListState = {
      ...workerListState,
      workers: [
        makeWorker({ name: 'w-with', branch: 'c4/auto-foo' }),
        makeWorker({ name: 'w-no', branch: null }),
      ],
    };
    const { container } = render(
      <WorkerList selectedWorker={null} onSelect={() => {}} />,
    );
    expect(screen.getByText('c4/auto-foo')).toBeInTheDocument();
    const monoLines = container.querySelectorAll('.font-mono');
    expect(monoLines).toHaveLength(1);
  });

  it('renders the failureHint label + hint + count multiplier when present', () => {
    workerListState = {
      ...workerListState,
      workers: [
        makeWorker({
          name: 'w-fail',
          failureHint: {
            id: 'eslint',
            label: 'ESLint failures',
            hint: 'Run lint locally before pushing',
            sample: 'no-unused-vars rule violated',
            count: 3,
          },
        }),
      ],
    };
    render(<WorkerList selectedWorker={null} onSelect={() => {}} />);
    expect(screen.getByText('ESLint failures')).toBeInTheDocument();
    expect(
      screen.getByText('Run lint locally before pushing'),
    ).toBeInTheDocument();
    // Count multiplier uses U+00D7 MULTIPLICATION SIGN, not ASCII 'x'.
    const mul = String.fromCharCode(0x00d7);
    expect(screen.getByText(`${mul}3`)).toBeInTheDocument();
  });

  it('forwards the failureHint sample text as a title attribute (tooltip)', () => {
    workerListState = {
      ...workerListState,
      workers: [
        makeWorker({
          name: 'w-fail',
          failureHint: {
            id: 'enospc',
            label: 'Disk full',
            hint: 'Free up disk space',
            sample: 'ENOSPC: no space left on device',
            count: 1,
          },
        }),
      ],
    };
    render(<WorkerList selectedWorker={null} onSelect={() => {}} />);
    const hint = screen
      .getByText('Disk full')
      .closest('[title]') as HTMLElement;
    expect(hint).not.toBeNull();
    expect(hint.getAttribute('title')).toBe(
      'ENOSPC: no space left on device',
    );
  });

  it('omits the count multiplier on the failure hint when count is 1', () => {
    workerListState = {
      ...workerListState,
      workers: [
        makeWorker({
          name: 'w-once',
          failureHint: {
            id: 'oom',
            label: 'Out of memory',
            hint: 'Reduce concurrency',
            sample: null,
            count: 1,
          },
        }),
      ],
    };
    render(<WorkerList selectedWorker={null} onSelect={() => {}} />);
    const mul = String.fromCharCode(0x00d7);
    expect(
      screen.queryByText(new RegExp(`${mul}\\d+`)),
    ).not.toBeInTheDocument();
  });

  // ---- selection + callback flow ---------------------------------

  it('applies the selected-row ring class only to the row matching selectedWorker', () => {
    workerListState = {
      ...workerListState,
      workers: [makeWorker({ name: 'w-1' }), makeWorker({ name: 'w-2' })],
    };
    render(<WorkerList selectedWorker="w-2" onSelect={() => {}} />);
    const active = screen
      .getByText('w-2')
      .closest('[role="button"]') as HTMLElement;
    const inactive = screen
      .getByText('w-1')
      .closest('[role="button"]') as HTMLElement;
    // The selected row carries the unprefixed selection ring
    // (`ring-2 ring-ring`); every row also carries a
    // `focus-visible:ring-2` for keyboard focus, so match on the
    // unprefixed token specifically.
    expect(active.className).toMatch(/(^|\s)ring-2(\s|$)/);
    expect(inactive.className).not.toMatch(/(^|\s)ring-2(\s|$)/);
  });

  it('fires onSelect with the worker name when its row is clicked', async () => {
    workerListState = {
      ...workerListState,
      workers: [makeWorker({ name: 'pick-me' })],
    };
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<WorkerList selectedWorker={null} onSelect={onSelect} />);
    const row = screen
      .getByText('pick-me')
      .closest('[role="button"]') as HTMLElement;
    await user.click(row);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('pick-me');
  });

  it('fires onSelect when the focused row receives Enter or Space', async () => {
    workerListState = {
      ...workerListState,
      workers: [makeWorker({ name: 'kb-target' })],
    };
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<WorkerList selectedWorker={null} onSelect={onSelect} />);
    const row = screen
      .getByText('kb-target')
      .closest('[role="button"]') as HTMLElement;
    row.focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onSelect).toHaveBeenNthCalledWith(1, 'kb-target');
    expect(onSelect).toHaveBeenNthCalledWith(2, 'kb-target');
  });

  // ---- group expand / collapse -----------------------------------

  it('hides the worker rows when the workers group header is clicked to collapse', async () => {
    workerListState = {
      ...workerListState,
      workers: [makeWorker({ name: 'w-1' }), makeWorker({ name: 'w-2' })],
    };
    const user = userEvent.setup();
    render(<WorkerList selectedWorker={null} onSelect={() => {}} />);
    const header = screen.getByRole('button', { name: /workers/i });
    expect(header).toHaveAttribute('aria-expanded', 'true');
    await user.click(header);
    expect(screen.getByRole('button', { name: /workers/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    const panel = document.getElementById(
      'worker-group-workers',
    ) as HTMLElement;
    expect(panel.hasAttribute('hidden')).toBe(true);
  });

  it('persists the workers group collapse state into localStorage', async () => {
    workerListState = {
      ...workerListState,
      workers: [makeWorker({ name: 'w-1' })],
    };
    const user = userEvent.setup();
    render(<WorkerList selectedWorker={null} onSelect={() => {}} />);
    await user.click(screen.getByRole('button', { name: /workers/i }));
    expect(
      window.localStorage.getItem('c4.workerList.workers.open'),
    ).toBe('0');
  });

  it('hides the managers rows when the managers group is collapsed and leaves workers intact', async () => {
    workerListState = {
      ...workerListState,
      workers: [
        makeWorker({ name: 'mgr-1', tier: 'manager' }),
        makeWorker({ name: 'wrk-1', tier: 'worker' }),
      ],
    };
    const user = userEvent.setup();
    render(<WorkerList selectedWorker={null} onSelect={() => {}} />);
    await user.click(screen.getByRole('button', { name: /managers/i }));
    const mgrPanel = document.getElementById(
      'worker-group-managers',
    ) as HTMLElement;
    const wrkPanel = document.getElementById(
      'worker-group-workers',
    ) as HTMLElement;
    expect(mgrPanel.hasAttribute('hidden')).toBe(true);
    expect(wrkPanel.hasAttribute('hidden')).toBe(false);
    expect(within(wrkPanel).getByText('wrk-1')).toBeInTheDocument();
  });

  // ---- locale flip ----------------------------------------------

  it('re-renders translated copy when the locale flips to ko', () => {
    render(<WorkerList selectedWorker={null} onSelect={() => {}} />);
    expect(screen.getByText('No workers yet.')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('No workers yet.')).not.toBeInTheDocument();
  });
});
