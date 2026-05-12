import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type { Role, UseRbacState, User } from '../lib/use-rbac';

// Rbac.tsx wires PageFrame + a single hook (useRbac) which
// dual-fetches /api/rbac/roles + /api/rbac/users. Stub the hook so
// each test drives a single branch of the loading / empty /
// populated / error matrix without hitting fetch. No banner / toast
// wiring on this page -- it is intentionally read-only.

const refreshMock = vi.fn(async () => {});

let hookState: UseRbacState = {
  roles: null,
  users: null,
  error: null,
  loading: false,
  refresh: refreshMock,
};

vi.mock('../lib/use-rbac', () => ({
  useRbac: (): UseRbacState => hookState,
}));

import Rbac from './Rbac';

function makeRole(over: Partial<Role> = {}): Role {
  return {
    name: 'admin',
    actions: ['*'],
    ...over,
  };
}

function makeUser(over: Partial<User> = {}): User {
  return {
    user: 'alice',
    role: 'admin',
    grants: {},
    ...over,
  };
}

beforeEach(() => {
  setLocale('en');
  refreshMock.mockReset();
  refreshMock.mockResolvedValue(undefined);
  hookState = {
    roles: null,
    users: null,
    error: null,
    loading: false,
    refresh: refreshMock,
  };
});

describe('<Rbac>', () => {
  it('renders the page title in the frame header', () => {
    render(<Rbac />);
    expect(screen.getByText('RBAC')).toBeInTheDocument();
  });

  it('renders the page description in the frame header', () => {
    render(<Rbac />);
    expect(
      screen.getByText(/Role-based access control/),
    ).toBeInTheDocument();
  });

  it('renders the refresh button with the accessible name from i18n', () => {
    render(<Rbac />);
    expect(
      screen.getByRole('button', { name: 'Refresh RBAC' }),
    ).toBeInTheDocument();
  });

  it('renders the visible "Refresh" label inside the refresh button', () => {
    render(<Rbac />);
    expect(screen.getByText('Refresh')).toBeInTheDocument();
  });

  it('renders the intro banner text', () => {
    render(<Rbac />);
    expect(
      screen.getByText(/Mirrors c4 rbac roles \+ c4 rbac users/),
    ).toBeInTheDocument();
  });

  it('renders the Roles section heading', () => {
    render(<Rbac />);
    expect(screen.getByText('Roles')).toBeInTheDocument();
  });

  it('renders the Users section heading with the user count', () => {
    hookState = { ...hookState, users: [makeUser(), makeUser({ user: 'bob' })] };
    render(<Rbac />);
    expect(screen.getByText('Users (2)')).toBeInTheDocument();
  });

  it('renders the Users heading with zero count when users is null', () => {
    render(<Rbac />);
    expect(screen.getByText('Users (0)')).toBeInTheDocument();
  });

  it('fires the hook refresh handler when refresh is clicked', async () => {
    const user = userEvent.setup();
    render(<Rbac />);
    await user.click(
      screen.getByRole('button', { name: 'Refresh RBAC' }),
    );
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('disables the refresh button while loading', () => {
    hookState = { ...hookState, loading: true };
    render(<Rbac />);
    expect(
      screen.getByRole('button', { name: 'Refresh RBAC' }),
    ).toBeDisabled();
  });

  it('enables the refresh button when not loading', () => {
    render(<Rbac />);
    expect(
      screen.getByRole('button', { name: 'Refresh RBAC' }),
    ).toBeEnabled();
  });

  it('applies animate-spin on the refresh icon while loading', () => {
    hookState = { ...hookState, loading: true };
    render(<Rbac />);
    const btn = screen.getByRole('button', { name: 'Refresh RBAC' });
    const icon = btn.querySelector('svg');
    expect(icon?.getAttribute('class') || '').toContain('animate-spin');
  });

  it('does NOT apply animate-spin on the refresh icon when idle', () => {
    render(<Rbac />);
    const btn = screen.getByRole('button', { name: 'Refresh RBAC' });
    const icon = btn.querySelector('svg');
    expect(icon?.getAttribute('class') || '').not.toContain('animate-spin');
  });

  it('renders the loading hint inside the roles panel when roles is null', () => {
    render(<Rbac />);
    // Both panels render the "Loading..." hint while their data slot is null.
    expect(screen.getAllByText(/Loading/).length).toBeGreaterThanOrEqual(1);
  });

  it('renders the empty-roles hint when roles array is empty', () => {
    hookState = { ...hookState, roles: [], users: [] };
    render(<Rbac />);
    expect(screen.getByText('No roles configured.')).toBeInTheDocument();
  });

  it('renders the empty-users hint when users array is empty', () => {
    hookState = { ...hookState, roles: [], users: [] };
    render(<Rbac />);
    expect(screen.getByText('No users assigned.')).toBeInTheDocument();
  });

  it('renders each role with its name as a badge', () => {
    hookState = {
      ...hookState,
      roles: [makeRole({ name: 'admin' }), makeRole({ name: 'viewer', actions: [] })],
      users: [],
    };
    render(<Rbac />);
    expect(screen.getByText('admin')).toBeInTheDocument();
    expect(screen.getByText('viewer')).toBeInTheDocument();
  });

  it('renders the action count per role', () => {
    hookState = {
      ...hookState,
      roles: [makeRole({ name: 'admin', actions: ['a', 'b', 'c'] })],
      users: [],
    };
    render(<Rbac />);
    expect(screen.getByText('3 action(s)')).toBeInTheDocument();
  });

  it('renders each individual action code as a chip', () => {
    hookState = {
      ...hookState,
      roles: [makeRole({ name: 'manager', actions: ['WORKER.CREATE', 'WORKER.MERGE'] })],
      users: [],
    };
    render(<Rbac />);
    expect(screen.getByText('WORKER.CREATE')).toBeInTheDocument();
    expect(screen.getByText('WORKER.MERGE')).toBeInTheDocument();
  });

  it('renders each user with its name', () => {
    hookState = {
      ...hookState,
      roles: [],
      users: [makeUser({ user: 'alice' }), makeUser({ user: 'bob' })],
    };
    render(<Rbac />);
    expect(screen.getByText('alice')).toBeInTheDocument();
    expect(screen.getByText('bob')).toBeInTheDocument();
  });

  it('renders the role badge per user', () => {
    hookState = {
      ...hookState,
      roles: [],
      users: [makeUser({ user: 'alice', role: 'manager' })],
    };
    render(<Rbac />);
    expect(screen.getByText('manager')).toBeInTheDocument();
  });

  it('renders the grant count chip when the user has grants', () => {
    hookState = {
      ...hookState,
      roles: [],
      users: [
        makeUser({ user: 'alice', grants: { 'WORKER.CREATE': true, 'WORKER.MERGE': true } }),
      ],
    };
    render(<Rbac />);
    expect(screen.getByText('2 grant scope(s)')).toBeInTheDocument();
  });

  it('hides the grant count chip when the user has no grants', () => {
    hookState = {
      ...hookState,
      roles: [],
      users: [makeUser({ user: 'alice', grants: {} })],
    };
    render(<Rbac />);
    expect(screen.queryByText(/grant scope/)).not.toBeInTheDocument();
  });

  it('renders the view-grants details summary when grants are present', () => {
    hookState = {
      ...hookState,
      roles: [],
      users: [makeUser({ user: 'alice', grants: { 'X': true } })],
    };
    render(<Rbac />);
    expect(screen.getByText('view grants')).toBeInTheDocument();
  });

  it('hides the view-grants details when grants are empty', () => {
    hookState = {
      ...hookState,
      roles: [],
      users: [makeUser({ user: 'alice', grants: {} })],
    };
    render(<Rbac />);
    expect(screen.queryByText('view grants')).not.toBeInTheDocument();
  });

  it('renders the grants JSON inside the details block when expanded', () => {
    hookState = {
      ...hookState,
      roles: [],
      users: [makeUser({ user: 'alice', grants: { 'WORKER.CREATE': true } })],
    };
    render(<Rbac />);
    const pre = document.querySelector('details pre');
    expect(pre).not.toBeNull();
    expect(pre?.textContent || '').toContain('WORKER.CREATE');
  });

  it('renders the error panel via role=alert when the hook reports an error', () => {
    hookState = { ...hookState, error: 'forbidden', roles: [], users: [] };
    render(<Rbac />);
    expect(screen.getByRole('alert')).toHaveTextContent('forbidden');
  });

  it('hides the error panel when error is null', () => {
    render(<Rbac />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('still renders the panels when error is also set', () => {
    hookState = {
      ...hookState,
      error: 'fail',
      roles: [makeRole({ name: 'admin' })],
      users: [],
    };
    render(<Rbac />);
    expect(screen.getByRole('alert')).toHaveTextContent('fail');
    expect(screen.getByText('Roles')).toBeInTheDocument();
  });

  it('renders one <li> entry per role under the roles ul', () => {
    hookState = {
      ...hookState,
      roles: [
        makeRole({ name: 'admin' }),
        makeRole({ name: 'manager' }),
        makeRole({ name: 'viewer' }),
      ],
      users: [],
    };
    const { container } = render(<Rbac />);
    const rolesUl = container.querySelector('ul');
    expect(rolesUl).not.toBeNull();
    if (rolesUl) {
      const lis = within(rolesUl).getAllByRole('listitem');
      expect(lis).toHaveLength(3);
    }
  });

  it('renders one <li> entry per user under the users ul', () => {
    hookState = {
      ...hookState,
      roles: [],
      users: [
        makeUser({ user: 'a' }),
        makeUser({ user: 'b' }),
      ],
    };
    const { container } = render(<Rbac />);
    const uls = container.querySelectorAll('ul');
    expect(uls.length).toBeGreaterThanOrEqual(1);
    const usersUl = uls[uls.length - 1];
    const lis = within(usersUl).getAllByRole('listitem');
    expect(lis).toHaveLength(2);
  });

  it('forwards rerender state changes through hookState mutation', () => {
    const { rerender } = render(<Rbac />);
    expect(screen.getAllByText(/Loading/).length).toBeGreaterThanOrEqual(1);
    hookState = {
      ...hookState,
      roles: [makeRole({ name: 'manager' })],
      users: [makeUser({ user: 'alice', role: 'viewer' })],
    };
    rerender(<Rbac />);
    expect(screen.getByText('manager')).toBeInTheDocument();
    expect(screen.getByText('alice')).toBeInTheDocument();
    expect(screen.getByText('viewer')).toBeInTheDocument();
  });

  it('re-renders after the locale flips without crashing', () => {
    const { container } = render(<Rbac />);
    expect(screen.getByText('RBAC')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(container.firstChild).toBeInTheDocument();
  });
});
