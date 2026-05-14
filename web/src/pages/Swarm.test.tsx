import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type { UseSwarmState, SwarmResponse, SwarmNode } from '../lib/use-swarm';
import type { Worker } from '../types';

// Swarm.tsx wires PageFrame + the useSwarm hook (which couples the
// /api/list + /api/swarm fetches) and a local <select> for the root
// worker. Stub the hook so each test drives a single branch of the
// idle / loading / empty / loaded / error matrix without firing real
// fetches or auto-effects.

const refreshMock = vi.fn(async () => {});
const setSelectedMock = vi.fn((_: string) => {});

let hookState: UseSwarmState = {
  workers: [],
  selected: '',
  setSelected: setSelectedMock,
  data: null,
  loading: false,
  error: null,
  refresh: refreshMock,
};

vi.mock('../lib/use-swarm', () => ({
  useSwarm: (): UseSwarmState => hookState,
}));

vi.mock('../components/PageDescriptionBanner', () => ({
  PageDescriptionBanner: () => (
    <div data-testid="page-description-banner" />
  ),
}));

vi.mock('../components/HelpUIRoot', () => ({
  openHelpDrawer: vi.fn(),
}));

import Swarm from './Swarm';

function makeWorker(name: string): Worker {
  return {
    name,
    command: 'claude',
    target: 'local',
    branch: `c4/${name}`,
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
  };
}

function makeNode(over: Partial<SwarmNode> = {}): SwarmNode {
  return {
    name: 'root',
    status: 'idle',
    branch: 'c4/root',
    children: [],
    ...over,
  };
}

beforeEach(() => {
  setLocale('en');
  refreshMock.mockReset();
  refreshMock.mockResolvedValue(undefined);
  setSelectedMock.mockReset();
  hookState = {
    workers: [],
    selected: '',
    setSelected: setSelectedMock,
    data: null,
    loading: false,
    error: null,
    refresh: refreshMock,
  };
});

describe('<Swarm>', () => {
  it('renders the page title in the frame header', () => {
    render(<Swarm />);
    expect(screen.getByText('Swarm')).toBeInTheDocument();
  });

  it('renders the page description in the frame header', () => {
    render(<Swarm />);
    expect(
      screen.getByText(/Given a root worker, show the hierarchy/),
    ).toBeInTheDocument();
  });

  it('renders the refresh button via its sr-only label', () => {
    render(<Swarm />);
    expect(
      screen.getByRole('button', { name: 'Refresh swarm' }),
    ).toBeInTheDocument();
  });

  it('renders the PageDescriptionBanner marker', () => {
    render(<Swarm />);
    expect(screen.getByTestId('page-description-banner')).toBeInTheDocument();
  });

  it('renders the root-worker select with the label', () => {
    render(<Swarm />);
    expect(screen.getByLabelText('Root worker')).toBeInTheDocument();
  });

  it('renders the placeholder option in the select', () => {
    render(<Swarm />);
    expect(screen.getByRole('option', { name: '— select —' })).toBeInTheDocument();
  });

  it('renders an option per worker in the select', () => {
    hookState = {
      ...hookState,
      workers: [makeWorker('alpha'), makeWorker('beta')],
    };
    render(<Swarm />);
    expect(screen.getByRole('option', { name: 'alpha' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'beta' })).toBeInTheDocument();
  });

  it('fires setSelected when the user picks a worker', async () => {
    hookState = {
      ...hookState,
      workers: [makeWorker('alpha'), makeWorker('beta')],
    };
    const user = userEvent.setup();
    render(<Swarm />);
    await user.selectOptions(screen.getByLabelText('Root worker'), 'beta');
    expect(setSelectedMock).toHaveBeenCalledWith('beta');
  });

  it('disables the refresh button when no worker is selected', () => {
    render(<Swarm />);
    expect(
      screen.getByRole('button', { name: 'Refresh swarm' }),
    ).toBeDisabled();
  });

  it('enables the refresh button when a worker is selected and idle', () => {
    hookState = { ...hookState, selected: 'alpha' };
    render(<Swarm />);
    expect(
      screen.getByRole('button', { name: 'Refresh swarm' }),
    ).toBeEnabled();
  });

  it('disables the refresh button while loading even with a selection', () => {
    hookState = { ...hookState, selected: 'alpha', loading: true };
    render(<Swarm />);
    expect(
      screen.getByRole('button', { name: 'Refresh swarm' }),
    ).toBeDisabled();
  });

  it('fires the hook refresh handler when the refresh button is clicked', async () => {
    hookState = { ...hookState, selected: 'alpha' };
    const user = userEvent.setup();
    render(<Swarm />);
    await user.click(screen.getByRole('button', { name: 'Refresh swarm' }));
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('applies the animate-spin class on the refresh icon while loading', () => {
    hookState = { ...hookState, selected: 'alpha', loading: true };
    render(<Swarm />);
    const btn = screen.getByRole('button', { name: 'Refresh swarm' });
    const icon = btn.querySelector('svg');
    expect(icon?.getAttribute('class') || '').toContain('animate-spin');
  });

  it('does NOT apply the animate-spin class on the refresh icon when idle', () => {
    hookState = { ...hookState, selected: 'alpha' };
    render(<Swarm />);
    const btn = screen.getByRole('button', { name: 'Refresh swarm' });
    const icon = btn.querySelector('svg');
    expect(icon?.getAttribute('class') || '').not.toContain('animate-spin');
  });

  it('renders the error panel via role=alert when the hook reports an error', () => {
    hookState = { ...hookState, error: 'boom' };
    render(<Swarm />);
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });

  it('renders the loading skeleton when loading with no data yet', () => {
    hookState = { ...hookState, loading: true, data: null };
    render(<Swarm />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('does NOT render the skeleton when data is already present', () => {
    const data: SwarmResponse = { root: makeNode() };
    hookState = { ...hookState, loading: true, data, selected: 'root' };
    render(<Swarm />);
    // EmptyPanel role=status is gated on !rootNode, so when root is
    // present neither LoadingSkeleton nor EmptyPanel renders.
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('renders the empty-swarm hint when the response has no root node', () => {
    const data: SwarmResponse = {};
    hookState = { ...hookState, data, selected: 'alpha' };
    render(<Swarm />);
    expect(
      screen.getByText(/No swarm data for this worker/),
    ).toBeInTheDocument();
  });

  it('renders the empty illustration alongside the empty-swarm hint', () => {
    const data: SwarmResponse = {};
    hookState = { ...hookState, data, selected: 'alpha' };
    render(<Swarm />);
    expect(
      screen.getByTestId('swarm-empty-illustration'),
    ).toBeInTheDocument();
  });

  it('renders the swarm panel title with the selected worker name', () => {
    const data: SwarmResponse = { root: makeNode({ name: 'root' }) };
    hookState = { ...hookState, data, selected: 'alpha' };
    render(<Swarm />);
    expect(screen.getByText('Swarm for alpha')).toBeInTheDocument();
  });

  it('renders the root node name from data.root', () => {
    const data: SwarmResponse = { root: makeNode({ name: 'root-1' }) };
    hookState = { ...hookState, data, selected: 'root-1' };
    render(<Swarm />);
    expect(screen.getByText('root-1')).toBeInTheDocument();
  });

  it('falls back to nodes[0] when data.root is missing', () => {
    const data: SwarmResponse = {
      nodes: [makeNode({ name: 'fallback' })],
    };
    hookState = { ...hookState, data, selected: 'fallback' };
    render(<Swarm />);
    expect(screen.getByText('fallback')).toBeInTheDocument();
  });

  it('renders the status badge for a node that exposes status', () => {
    const data: SwarmResponse = {
      root: makeNode({ name: 'root', status: 'busy' }),
    };
    hookState = { ...hookState, data, selected: 'root' };
    render(<Swarm />);
    expect(screen.getByText('busy')).toBeInTheDocument();
  });

  it('does NOT render a status badge when the node has no status', () => {
    const data: SwarmResponse = {
      root: { name: 'root', children: [] },
    };
    hookState = { ...hookState, data, selected: 'root' };
    render(<Swarm />);
    expect(screen.queryByText('busy')).not.toBeInTheDocument();
    expect(screen.queryByText('idle')).not.toBeInTheDocument();
  });

  it('renders the branch label for a node that exposes branch', () => {
    const data: SwarmResponse = {
      root: makeNode({ name: 'root', branch: 'c4/root' }),
    };
    hookState = { ...hookState, data, selected: 'root' };
    render(<Swarm />);
    expect(screen.getByText('c4/root')).toBeInTheDocument();
  });

  it('renders nested children recursively', () => {
    const data: SwarmResponse = {
      root: makeNode({
        name: 'root',
        children: [
          makeNode({
            name: 'child-1',
            children: [makeNode({ name: 'grandchild-1' })],
          }),
          makeNode({ name: 'child-2' }),
        ],
      }),
    };
    hookState = { ...hookState, data, selected: 'root' };
    render(<Swarm />);
    expect(screen.getByText('root')).toBeInTheDocument();
    expect(screen.getByText('child-1')).toBeInTheDocument();
    expect(screen.getByText('child-2')).toBeInTheDocument();
    expect(screen.getByText('grandchild-1')).toBeInTheDocument();
  });

  it('indents nested children via the recursive paddingLeft', () => {
    const data: SwarmResponse = {
      root: makeNode({
        name: 'root',
        children: [makeNode({ name: 'child-1' })],
      }),
    };
    hookState = { ...hookState, data, selected: 'root' };
    const { container } = render(<Swarm />);
    // (v1.11.77) Inline paddingLeft was replaced with a conditional
    // Tailwind `pl-4` className (depth>0 only); root has no pl-* class.
    const root = container.querySelector('div.text-xs:not(.pl-4)');
    const indented = container.querySelector('div.pl-4.text-xs');
    expect(root).not.toBeNull();
    expect(indented).not.toBeNull();
  });

  it('treats non-array children defensively (no crash)', () => {
    const data: SwarmResponse = {
      root: { name: 'root', children: undefined },
    };
    hookState = { ...hookState, data, selected: 'root' };
    render(<Swarm />);
    expect(screen.getByText('root')).toBeInTheDocument();
  });

  it('reflects the selected prop on the controlled select', () => {
    hookState = {
      ...hookState,
      workers: [makeWorker('alpha'), makeWorker('beta')],
      selected: 'beta',
    };
    render(<Swarm />);
    const select = screen.getByLabelText('Root worker') as HTMLSelectElement;
    expect(select.value).toBe('beta');
  });

  it('re-renders after the locale flips without crashing', () => {
    const { container } = render(<Swarm />);
    expect(screen.getByText('Swarm')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(container.firstChild).toBeInTheDocument();
  });
});
