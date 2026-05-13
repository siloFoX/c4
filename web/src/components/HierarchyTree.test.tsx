import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type { Worker } from '../types';

// (v1.11.104) HierarchyTree composes three external dependencies:
// useWorkerList (poll + SSE workers), useExpandedSet (expand state
// machine + toggle / expandAll / collapseAll), and the pure
// buildTree helper. We stub useWorkerList so each test drives the
// workers / error / sseConnected branches deterministically, and
// keep useExpandedSet + buildTree real so the integration with
// expand-on-first-load + parent/child rendering is exercised.

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

import HierarchyTree from './HierarchyTree';

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
});

describe('<HierarchyTree>', () => {
  it('renders the localized empty-state copy when there are no workers', () => {
    render(<HierarchyTree selectedWorker={null} onSelect={() => {}} />);
    expect(screen.getByText('No workers yet.')).toBeInTheDocument();
  });

  it('hides the empty-state copy when workers are present', () => {
    workerListState = {
      ...workerListState,
      workers: [makeWorker({ name: 'w1' })],
    };
    render(<HierarchyTree selectedWorker={null} onSelect={() => {}} />);
    expect(screen.queryByText('No workers yet.')).not.toBeInTheDocument();
  });

  it('renders the SSE-disconnected warning chip when sseConnected=false', () => {
    workerListState = { ...workerListState, sseConnected: false };
    render(<HierarchyTree selectedWorker={null} onSelect={() => {}} />);
    expect(
      screen.getByText(/Live updates disconnected/i),
    ).toBeInTheDocument();
  });

  it('omits the SSE-disconnected chip when sseConnected=true', () => {
    workerListState = { ...workerListState, sseConnected: true };
    render(<HierarchyTree selectedWorker={null} onSelect={() => {}} />);
    expect(
      screen.queryByText(/Live updates disconnected/i),
    ).not.toBeInTheDocument();
  });

  it('renders the error banner with the formatted i18n message when error is set', () => {
    workerListState = { ...workerListState, error: 'list 500' };
    render(<HierarchyTree selectedWorker={null} onSelect={() => {}} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('list 500');
    expect(alert).toHaveTextContent(/Failed to load workers/i);
  });

  it('hides the empty-state copy when error is set so the alert is the only message', () => {
    workerListState = { ...workerListState, error: 'list 500' };
    render(<HierarchyTree selectedWorker={null} onSelect={() => {}} />);
    expect(screen.queryByText('No workers yet.')).not.toBeInTheDocument();
  });

  it('renders one row per worker with the worker name as a button label', () => {
    workerListState = {
      ...workerListState,
      workers: [
        makeWorker({ name: 'w-1' }),
        makeWorker({ name: 'w-2' }),
      ],
    };
    render(<HierarchyTree selectedWorker={null} onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: 'w-1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'w-2' })).toBeInTheDocument();
  });

  it('renders the Expand all + Collapse all controls only when there are workers', () => {
    workerListState = {
      ...workerListState,
      workers: [makeWorker({ name: 'w-1' })],
    };
    render(<HierarchyTree selectedWorker={null} onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: /Expand all/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Collapse all/i })).toBeInTheDocument();
  });

  it('does NOT render the Expand all + Collapse all controls when the list is empty', () => {
    render(<HierarchyTree selectedWorker={null} onSelect={() => {}} />);
    expect(screen.queryByRole('button', { name: /Expand all/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Collapse all/i })).toBeNull();
  });

  it('fires the onSelect callback with the worker name when its row is clicked', async () => {
    workerListState = {
      ...workerListState,
      workers: [makeWorker({ name: 'pick-me' })],
    };
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<HierarchyTree selectedWorker={null} onSelect={onSelect} />);
    await user.click(screen.getByRole('button', { name: 'pick-me' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('pick-me');
  });

  it('renders the busy status badge as warning variant for a busy worker', () => {
    workerListState = {
      ...workerListState,
      workers: [makeWorker({ name: 'w-busy', status: 'busy' })],
    };
    render(<HierarchyTree selectedWorker={null} onSelect={() => {}} />);
    // statusLabel returns the literal status string; the badge wraps it.
    const badge = screen.getByText('busy');
    expect(badge.className).toMatch(/warning/);
  });

  it('renders the idle status badge as success variant for an idle worker', () => {
    workerListState = {
      ...workerListState,
      workers: [makeWorker({ name: 'w-idle', status: 'idle' })],
    };
    render(<HierarchyTree selectedWorker={null} onSelect={() => {}} />);
    const badge = screen.getByText('idle');
    expect(badge.className).toMatch(/success/);
  });

  it('renders the intervention badge when the worker is in approval_pending state', () => {
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
    render(<HierarchyTree selectedWorker={null} onSelect={() => {}} />);
    expect(screen.getByText('intervention')).toBeInTheDocument();
  });

  it('renders a parent worker with its child indented underneath after auto-expand', () => {
    workerListState = {
      ...workerListState,
      workers: [
        makeWorker({ name: 'parent' }),
        makeWorker({ name: 'child', parent: 'parent' }),
      ],
    };
    render(<HierarchyTree selectedWorker={null} onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: 'parent' })).toBeInTheDocument();
    // Auto-expand effect opens every node on first load, so the
    // child row should be visible too.
    expect(screen.getByRole('button', { name: 'child' })).toBeInTheDocument();
  });

  it('renders rollup badge counts for a parent with multiple children', () => {
    workerListState = {
      ...workerListState,
      workers: [
        makeWorker({ name: 'parent', status: 'idle' }),
        makeWorker({ name: 'c1', parent: 'parent', status: 'idle' }),
        makeWorker({ name: 'c2', parent: 'parent', status: 'busy' }),
      ],
    };
    render(<HierarchyTree selectedWorker={null} onSelect={() => {}} />);
    // Rollup: 2 idle (parent + c1) + 1 busy (c2). Total > 1 so badges render.
    expect(screen.getByText(/2 idle/)).toBeInTheDocument();
    expect(screen.getByText(/1 busy/)).toBeInTheDocument();
  });

  it('omits rollup badges entirely when the subtree contains only one worker', () => {
    workerListState = {
      ...workerListState,
      workers: [makeWorker({ name: 'solo' })],
    };
    render(<HierarchyTree selectedWorker={null} onSelect={() => {}} />);
    expect(screen.queryByText(/1 idle/)).not.toBeInTheDocument();
  });

  it('marks a leaf chevron-button as disabled with the Leaf aria-label', () => {
    workerListState = {
      ...workerListState,
      workers: [makeWorker({ name: 'solo' })],
    };
    render(<HierarchyTree selectedWorker={null} onSelect={() => {}} />);
    const leafBtn = screen.getByRole('button', { name: 'Leaf' });
    expect(leafBtn).toBeDisabled();
  });

  it('renders a parent chevron-button with the Collapse aria-label after auto-expand', () => {
    workerListState = {
      ...workerListState,
      workers: [
        makeWorker({ name: 'parent' }),
        makeWorker({ name: 'child', parent: 'parent' }),
      ],
    };
    render(<HierarchyTree selectedWorker={null} onSelect={() => {}} />);
    expect(
      screen.getByRole('button', { name: 'Collapse' }),
    ).toBeInTheDocument();
  });

  it('toggles the child visibility when the parent chevron is clicked', async () => {
    workerListState = {
      ...workerListState,
      workers: [
        makeWorker({ name: 'parent' }),
        makeWorker({ name: 'child', parent: 'parent' }),
      ],
    };
    const user = userEvent.setup();
    render(<HierarchyTree selectedWorker={null} onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: 'child' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Collapse' }));
    expect(screen.queryByRole('button', { name: 'child' })).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Expand' }),
    ).toBeInTheDocument();
  });

  it('collapses every node when the Collapse all toolbar button is clicked', async () => {
    workerListState = {
      ...workerListState,
      workers: [
        makeWorker({ name: 'parent' }),
        makeWorker({ name: 'child', parent: 'parent' }),
      ],
    };
    const user = userEvent.setup();
    render(<HierarchyTree selectedWorker={null} onSelect={() => {}} />);
    await user.click(screen.getByRole('button', { name: /Collapse all/i }));
    expect(screen.queryByRole('button', { name: 'child' })).toBeNull();
  });

  it('re-expands every node when Expand all fires after a Collapse all', async () => {
    workerListState = {
      ...workerListState,
      workers: [
        makeWorker({ name: 'parent' }),
        makeWorker({ name: 'child', parent: 'parent' }),
      ],
    };
    const user = userEvent.setup();
    render(<HierarchyTree selectedWorker={null} onSelect={() => {}} />);
    await user.click(screen.getByRole('button', { name: /Collapse all/i }));
    await user.click(screen.getByRole('button', { name: /Expand all/i }));
    expect(screen.getByRole('button', { name: 'child' })).toBeInTheDocument();
  });

  it('applies the selected-row classes to the row matching selectedWorker', () => {
    workerListState = {
      ...workerListState,
      workers: [makeWorker({ name: 'w-1' }), makeWorker({ name: 'w-2' })],
    };
    render(<HierarchyTree selectedWorker="w-2" onSelect={() => {}} />);
    const row2 = screen
      .getByRole('button', { name: 'w-2' })
      .parentElement as HTMLElement;
    expect(row2.className).toMatch(/bg-accent/);
  });

  it('re-renders translated copy when the locale flips to ko', () => {
    render(<HierarchyTree selectedWorker={null} onSelect={() => {}} />);
    expect(screen.getByText('No workers yet.')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('No workers yet.')).not.toBeInTheDocument();
  });
});
