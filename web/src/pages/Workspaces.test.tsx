import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type {
  UseWorkspacesState,
  Workspace,
} from '../lib/use-workspaces';

// Workspaces.tsx renders PageFrame + a single hook
// (useWorkspaces) and a read-only list of config.workspaces
// entries. Stub the hook so each test drives a single branch
// of the loading / empty / populated / error flow without
// hitting fetch. No toast / banner / markdown wiring on this
// page -- the page is intentionally minimal.

const refreshMock = vi.fn(async () => {});

let hookState: UseWorkspacesState = {
  data: null,
  error: null,
  loading: false,
  refresh: refreshMock,
};

vi.mock('../lib/use-workspaces', () => ({
  useWorkspaces: (): UseWorkspacesState => hookState,
}));

import Workspaces from './Workspaces';

function makeWorkspace(over: Partial<Workspace> = {}): Workspace {
  return {
    name: 'main',
    path: '/home/me/main',
    exists: true,
    isGitRepo: true,
    ...over,
  };
}

beforeEach(() => {
  setLocale('en');
  refreshMock.mockReset();
  refreshMock.mockResolvedValue(undefined);
  hookState = {
    data: null,
    error: null,
    loading: false,
    refresh: refreshMock,
  };
});

describe('<Workspaces>', () => {
  it('renders the page title in the frame header', () => {
    render(<Workspaces />);
    expect(screen.getByText('Workspaces')).toBeInTheDocument();
  });

  it('renders the page description in the frame header', () => {
    render(<Workspaces />);
    expect(
      screen.getByText('Multi-repo workspaces from config.workspaces.'),
    ).toBeInTheDocument();
  });

  it('renders the refresh button with the accessible label from i18n', () => {
    render(<Workspaces />);
    expect(
      screen.getByRole('button', { name: 'Refresh workspaces' }),
    ).toBeInTheDocument();
  });

  it('renders the visible "Refresh" label on the refresh button', () => {
    render(<Workspaces />);
    expect(screen.getByText('Refresh')).toBeInTheDocument();
  });

  it('fires the hook refresh handler when the refresh button is clicked', async () => {
    const user = userEvent.setup();
    render(<Workspaces />);
    await user.click(
      screen.getByRole('button', { name: 'Refresh workspaces' }),
    );
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('disables the refresh button while loading', () => {
    hookState = { ...hookState, loading: true };
    render(<Workspaces />);
    expect(
      screen.getByRole('button', { name: 'Refresh workspaces' }),
    ).toBeDisabled();
  });

  it('enables the refresh button when not loading', () => {
    render(<Workspaces />);
    expect(
      screen.getByRole('button', { name: 'Refresh workspaces' }),
    ).toBeEnabled();
  });

  it('flips the refresh icon to animate-spin while loading', () => {
    hookState = { ...hookState, loading: true };
    render(<Workspaces />);
    const btn = screen.getByRole('button', { name: 'Refresh workspaces' });
    const icon = btn.querySelector('svg');
    expect(icon?.getAttribute('class') || '').toContain('animate-spin');
  });

  it('does NOT apply animate-spin on the refresh icon when idle', () => {
    render(<Workspaces />);
    const btn = screen.getByRole('button', { name: 'Refresh workspaces' });
    const icon = btn.querySelector('svg');
    expect(icon?.getAttribute('class') || '').not.toContain('animate-spin');
  });

  it('renders the intro banner copy', () => {
    render(<Workspaces />);
    expect(
      screen.getByText(/Mirrors c4 workspaces/),
    ).toBeInTheDocument();
  });

  it('renders the Configured workspaces heading', () => {
    render(<Workspaces />);
    expect(screen.getByText('Configured workspaces')).toBeInTheDocument();
  });

  it('renders the loading hint when data is null', () => {
    hookState = { ...hookState, data: null };
    render(<Workspaces />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('renders the empty hint when data is an empty array', () => {
    hookState = { ...hookState, data: [] };
    render(<Workspaces />);
    expect(
      screen.getByText(/No workspaces configured/),
    ).toBeInTheDocument();
  });

  it('renders the empty illustration alongside the empty hint', () => {
    hookState = { ...hookState, data: [] };
    render(<Workspaces />);
    expect(
      screen.getByTestId('workspaces-empty-illustration'),
    ).toBeInTheDocument();
  });

  it('renders one list row per workspace when populated', () => {
    hookState = {
      ...hookState,
      data: [
        makeWorkspace({ name: 'alpha', path: '/p/a' }),
        makeWorkspace({ name: 'beta', path: '/p/b' }),
      ],
    };
    render(<Workspaces />);
    expect(screen.getByText('alpha')).toBeInTheDocument();
    expect(screen.getByText('beta')).toBeInTheDocument();
  });

  it('renders the workspace path under each row entry', () => {
    hookState = {
      ...hookState,
      data: [makeWorkspace({ name: 'alpha', path: '/p/alpha' })],
    };
    render(<Workspaces />);
    expect(screen.getByText('/p/alpha')).toBeInTheDocument();
  });

  it('renders the exists badge for an existing workspace', () => {
    hookState = {
      ...hookState,
      data: [makeWorkspace({ name: 'alpha', exists: true })],
    };
    render(<Workspaces />);
    expect(screen.getByText('exists')).toBeInTheDocument();
  });

  it('renders the missing badge for a workspace that no longer exists', () => {
    hookState = {
      ...hookState,
      data: [makeWorkspace({ name: 'alpha', exists: false })],
    };
    render(<Workspaces />);
    expect(screen.getByText('missing')).toBeInTheDocument();
  });

  it('renders the git-repo badge for an existing git workspace', () => {
    hookState = {
      ...hookState,
      data: [makeWorkspace({ exists: true, isGitRepo: true })],
    };
    render(<Workspaces />);
    expect(screen.getByText('git repo')).toBeInTheDocument();
  });

  it('renders the not-a-git-repo badge for an existing non-git workspace', () => {
    hookState = {
      ...hookState,
      data: [makeWorkspace({ exists: true, isGitRepo: false })],
    };
    render(<Workspaces />);
    expect(screen.getByText('not a git repo')).toBeInTheDocument();
  });

  it('omits BOTH git badges when the workspace does not exist on disk', () => {
    hookState = {
      ...hookState,
      data: [makeWorkspace({ exists: false, isGitRepo: false })],
    };
    render(<Workspaces />);
    expect(screen.queryByText('git repo')).not.toBeInTheDocument();
    expect(screen.queryByText('not a git repo')).not.toBeInTheDocument();
  });

  it('uses the destructive-tone styling on the missing badge', () => {
    hookState = {
      ...hookState,
      data: [makeWorkspace({ exists: false })],
    };
    render(<Workspaces />);
    const missing = screen.getByText('missing');
    expect(missing.className).toContain('text-destructive');
  });

  it('uses the success-tone styling on the exists badge', () => {
    hookState = {
      ...hookState,
      data: [makeWorkspace({ exists: true })],
    };
    render(<Workspaces />);
    const exists = screen.getByText('exists');
    expect(exists.className).toMatch(/text-success/);
  });

  it('uses the warning-tone styling on the not-a-git-repo badge', () => {
    hookState = {
      ...hookState,
      data: [makeWorkspace({ exists: true, isGitRepo: false })],
    };
    render(<Workspaces />);
    const badge = screen.getByText('not a git repo');
    expect(badge.className).toMatch(/text-warning/);
  });

  it('renders the error panel via role=alert when the hook reports an error', () => {
    hookState = { ...hookState, error: 'load fail' };
    render(<Workspaces />);
    expect(screen.getByRole('alert')).toHaveTextContent('load fail');
  });

  it('hides the error panel when error is null', () => {
    render(<Workspaces />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('still renders the heading + intro when the error panel is visible', () => {
    hookState = { ...hookState, error: 'load fail' };
    render(<Workspaces />);
    expect(screen.getByText('Configured workspaces')).toBeInTheDocument();
    expect(screen.getByText(/Mirrors c4 workspaces/)).toBeInTheDocument();
  });

  it('renders the loading hint and error panel together when both are set', () => {
    hookState = { ...hookState, error: 'load fail', data: null };
    render(<Workspaces />);
    expect(screen.getByRole('alert')).toHaveTextContent('load fail');
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('renders all rows inside a single ul wrapper', () => {
    hookState = {
      ...hookState,
      data: [
        makeWorkspace({ name: 'alpha' }),
        makeWorkspace({ name: 'beta' }),
        makeWorkspace({ name: 'gamma' }),
      ],
    };
    const { container } = render(<Workspaces />);
    const ul = container.querySelector('ul');
    expect(ul).not.toBeNull();
    if (ul) {
      const lis = within(ul).getAllByRole('listitem');
      expect(lis).toHaveLength(3);
    }
  });

  it('renders one workspace name per row in monospace style', () => {
    hookState = {
      ...hookState,
      data: [makeWorkspace({ name: 'alpha' })],
    };
    render(<Workspaces />);
    const name = screen.getByText('alpha');
    expect(name.className).toContain('font-mono');
  });

  it('rerenders to reflect data changes across renders', () => {
    hookState = {
      ...hookState,
      data: [makeWorkspace({ name: 'alpha' })],
    };
    const { rerender } = render(<Workspaces />);
    expect(screen.getByText('alpha')).toBeInTheDocument();
    hookState = {
      ...hookState,
      data: [
        makeWorkspace({ name: 'alpha' }),
        makeWorkspace({ name: 'beta' }),
      ],
    };
    rerender(<Workspaces />);
    expect(screen.getByText('alpha')).toBeInTheDocument();
    expect(screen.getByText('beta')).toBeInTheDocument();
  });

  it('renders multiple workspaces with mixed statuses correctly', () => {
    hookState = {
      ...hookState,
      data: [
        makeWorkspace({ name: 'ok', exists: true, isGitRepo: true }),
        makeWorkspace({ name: 'bad', exists: false, isGitRepo: false }),
        makeWorkspace({ name: 'plain', exists: true, isGitRepo: false }),
      ],
    };
    render(<Workspaces />);
    expect(screen.getAllByText('exists')).toHaveLength(2);
    expect(screen.getByText('missing')).toBeInTheDocument();
    expect(screen.getByText('git repo')).toBeInTheDocument();
    expect(screen.getByText('not a git repo')).toBeInTheDocument();
  });

  it('re-renders after the locale flips without crashing', () => {
    const { container } = render(<Workspaces />);
    expect(screen.getByText('Workspaces')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(container.firstChild).toBeInTheDocument();
  });
});
