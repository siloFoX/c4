import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type { ProfileItem, UseProfilesState } from '../lib/use-profiles';

// Profiles.tsx wires PageFrame + a single hook (useProfiles) and adds
// a local filter + expand state. Stub the hook so each test drives a
// single branch without hitting fetch; stub PageDescriptionBanner +
// the Toast component to thin markers so the assertions stay focused
// on the page logic.

const refreshMock = vi.fn(async () => {});

let hookState: UseProfilesState = {
  items: [],
  loading: false,
  error: null,
  refresh: refreshMock,
};

vi.mock('../lib/use-profiles', () => ({
  useProfiles: (): UseProfilesState => hookState,
}));

vi.mock('../components/PageDescriptionBanner', () => ({
  PageDescriptionBanner: () => (
    <div data-testid="page-description-banner" />
  ),
}));

vi.mock('../components/HelpUIRoot', () => ({
  openHelpDrawer: vi.fn(),
}));

interface CapturedToastProps {
  message: string;
  type: string;
}

let lastToastProps: CapturedToastProps | null = null;

vi.mock('../components/Toast', () => ({
  default: (props: CapturedToastProps & { onDismiss: () => void }) => {
    lastToastProps = { message: props.message, type: props.type };
    return (
      <div
        data-testid="toast"
        data-message={props.message}
        data-type={props.type}
      />
    );
  },
}));

import Profiles from './Profiles';

function makeProfile(over: Partial<ProfileItem> = {}): ProfileItem {
  return {
    name: 'web',
    description: 'web profile',
    allow: ['bash:*'],
    deny: [],
    source: 'builtin',
    ...over,
  };
}

beforeEach(() => {
  setLocale('en');
  refreshMock.mockReset();
  refreshMock.mockResolvedValue(undefined);
  hookState = {
    items: [],
    loading: false,
    error: null,
    refresh: refreshMock,
  };
  lastToastProps = null;
});

describe('<Profiles>', () => {
  it('renders the page title in the frame header', () => {
    render(<Profiles />);
    expect(screen.getByText('Profiles')).toBeInTheDocument();
  });

  it('renders the page description in the frame header', () => {
    render(<Profiles />);
    expect(
      screen.getByText(/Permission profiles/),
    ).toBeInTheDocument();
  });

  it('renders the filter input with the right accessible label', () => {
    render(<Profiles />);
    expect(screen.getByLabelText('Filter profiles')).toBeInTheDocument();
  });

  it('renders the add button', () => {
    render(<Profiles />);
    expect(screen.getByRole('button', { name: /Add/ })).toBeInTheDocument();
  });

  it('renders the refresh button via its sr-only label', () => {
    render(<Profiles />);
    expect(
      screen.getByRole('button', { name: 'Refresh' }),
    ).toBeInTheDocument();
  });

  it('fires the hook refresh handler when refresh is clicked', async () => {
    hookState = {
      ...hookState,
      items: [makeProfile()],
    };
    const user = userEvent.setup();
    render(<Profiles />);
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('disables refresh while loading', () => {
    hookState = { ...hookState, loading: true };
    render(<Profiles />);
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled();
  });

  it('renders the error panel via role=alert when the hook reports an error', () => {
    hookState = { ...hookState, error: 'boom' };
    render(<Profiles />);
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });

  it('renders the loading skeleton when loading with no items yet', () => {
    hookState = { ...hookState, loading: true, items: [] };
    render(<Profiles />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders the empty-profiles hint when not loading and items empty', () => {
    hookState = { ...hookState, loading: false, items: [] };
    render(<Profiles />);
    expect(screen.getByText(/No profiles defined/)).toBeInTheDocument();
  });

  it('renders the empty illustration alongside the empty hint', () => {
    hookState = { ...hookState, loading: false, items: [] };
    render(<Profiles />);
    expect(
      screen.getByTestId('profiles-empty-illustration'),
    ).toBeInTheDocument();
  });

  it('renders one row per profile in the list', () => {
    hookState = {
      ...hookState,
      items: [makeProfile({ name: 'web' }), makeProfile({ name: 'ops' })],
    };
    render(<Profiles />);
    expect(screen.getByText('web')).toBeInTheDocument();
    expect(screen.getByText('ops')).toBeInTheDocument();
  });

  it('renders the source badge for a profile entry', () => {
    hookState = {
      ...hookState,
      items: [makeProfile({ name: 'web', source: 'builtin' })],
    };
    render(<Profiles />);
    expect(screen.getByText('builtin')).toBeInTheDocument();
  });

  it('renders the allow + deny count badges for a profile entry', () => {
    hookState = {
      ...hookState,
      items: [
        makeProfile({
          name: 'web',
          allow: ['bash:*', 'fs:*'],
          deny: ['network:*'],
        }),
      ],
    };
    render(<Profiles />);
    expect(screen.getByText('2 allow')).toBeInTheDocument();
    expect(screen.getByText('1 deny')).toBeInTheDocument();
  });

  it('renders the description text for a profile entry when present', () => {
    hookState = {
      ...hookState,
      items: [makeProfile({ name: 'web', description: 'web ops profile' })],
    };
    render(<Profiles />);
    expect(screen.getByText('web ops profile')).toBeInTheDocument();
  });

  it('renders the show toggle hint when the row is collapsed', () => {
    hookState = { ...hookState, items: [makeProfile()] };
    render(<Profiles />);
    expect(screen.getByText('show')).toBeInTheDocument();
  });

  it('flips aria-expanded false -> true when the row toggle is clicked', async () => {
    hookState = { ...hookState, items: [makeProfile({ name: 'web' })] };
    const user = userEvent.setup();
    render(<Profiles />);
    const toggle = screen.getByRole('button', { name: /web/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('reveals the allow + deny lists once the row is expanded', async () => {
    hookState = {
      ...hookState,
      items: [
        makeProfile({
          name: 'web',
          allow: ['allow-pattern'],
          deny: ['deny-pattern'],
        }),
      ],
    };
    const user = userEvent.setup();
    render(<Profiles />);
    await user.click(screen.getByRole('button', { name: /web/ }));
    expect(screen.getByText('allow-pattern')).toBeInTheDocument();
    expect(screen.getByText('deny-pattern')).toBeInTheDocument();
  });

  it('flips the toggle hint to hide after expanding the row', async () => {
    hookState = { ...hookState, items: [makeProfile({ name: 'web' })] };
    const user = userEvent.setup();
    render(<Profiles />);
    await user.click(screen.getByRole('button', { name: /web/ }));
    expect(screen.getByText('hide')).toBeInTheDocument();
  });

  it('renders the Edit + Remove action buttons only after expanding the row', async () => {
    hookState = { ...hookState, items: [makeProfile({ name: 'web' })] };
    const user = userEvent.setup();
    render(<Profiles />);
    expect(
      screen.queryByRole('button', { name: 'Edit' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Remove' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /web/ }));
    expect(
      screen.getByRole('button', { name: 'Edit' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Remove' }),
    ).toBeInTheDocument();
  });

  it('collapses the row when toggled twice (allow list hidden again)', async () => {
    hookState = {
      ...hookState,
      items: [makeProfile({ name: 'web', allow: ['p1'], deny: [] })],
    };
    const user = userEvent.setup();
    render(<Profiles />);
    const toggle = screen.getByRole('button', { name: /web/ });
    await user.click(toggle);
    expect(screen.getByText('p1')).toBeInTheDocument();
    await user.click(toggle);
    expect(screen.queryByText('p1')).not.toBeInTheDocument();
  });

  it('fires a not-implemented toast when the add button is clicked', async () => {
    const user = userEvent.setup();
    render(<Profiles />);
    await user.click(screen.getByRole('button', { name: /Add/ }));
    expect(screen.getByTestId('toast')).toBeInTheDocument();
    expect(lastToastProps?.message).toMatch(/not implemented/);
  });

  it('uses the info tone for the not-implemented toast', async () => {
    const user = userEvent.setup();
    render(<Profiles />);
    await user.click(screen.getByRole('button', { name: /Add/ }));
    expect(lastToastProps?.type).toBe('info');
  });

  it('fires a not-implemented toast when the Edit action is clicked after expand', async () => {
    hookState = { ...hookState, items: [makeProfile({ name: 'web' })] };
    const user = userEvent.setup();
    render(<Profiles />);
    await user.click(screen.getByRole('button', { name: /web/ }));
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByTestId('toast')).toBeInTheDocument();
  });

  it('fires a not-implemented toast when the Remove action is clicked and confirmed', async () => {
    // (v1.11.335, TODO 11.317) Remove flow now opens a
    // ConfirmDialog before firing the daemon (or, today, the
    // not-implemented toast). The test clicks Remove ->
    // confirms the destructive dialog -> asserts the toast.
    hookState = { ...hookState, items: [makeProfile({ name: 'web' })] };
    const user = userEvent.setup();
    render(<Profiles />);
    await user.click(screen.getByRole('button', { name: /web/ }));
    await user.click(screen.getByTestId('profiles-remove-web'));
    // Confirm dialog opens. The destructive confirm button
    // shares the localized "Remove" label, but it lives
    // inside a role=dialog so we scope the lookup to avoid
    // the row-button.
    const dialog = await screen.findByRole('dialog');
    const confirmButton = within(dialog).getByRole('button', {
      name: 'Remove',
    });
    await user.click(confirmButton);
    expect(screen.getByTestId('toast')).toBeInTheDocument();
  });

  it('filters rows by name when the filter input has a match', async () => {
    hookState = {
      ...hookState,
      items: [
        makeProfile({ name: 'alpha', description: 'first' }),
        makeProfile({ name: 'beta', description: 'second' }),
      ],
    };
    const user = userEvent.setup();
    render(<Profiles />);
    await user.type(screen.getByLabelText('Filter profiles'), 'alpha');
    expect(screen.getByText('alpha')).toBeInTheDocument();
    expect(screen.queryByText('beta')).not.toBeInTheDocument();
  });

  it('filters rows by description when the filter matches the description text', async () => {
    hookState = {
      ...hookState,
      items: [
        makeProfile({ name: 'a', description: 'fancy desc' }),
        makeProfile({ name: 'b', description: 'other thing' }),
      ],
    };
    const user = userEvent.setup();
    render(<Profiles />);
    await user.type(screen.getByLabelText('Filter profiles'), 'fancy');
    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.queryByText('b')).not.toBeInTheDocument();
  });

  it('renders the empty hint when the filter excludes every row', async () => {
    hookState = {
      ...hookState,
      items: [makeProfile({ name: 'web' })],
    };
    const user = userEvent.setup();
    render(<Profiles />);
    await user.type(
      screen.getByLabelText('Filter profiles'),
      'zzz-not-there',
    );
    expect(screen.getByText(/No profiles defined/)).toBeInTheDocument();
  });

  it('controlled filter input reflects the typed value', async () => {
    const user = userEvent.setup();
    render(<Profiles />);
    const input = screen.getByLabelText('Filter profiles') as HTMLInputElement;
    await user.type(input, 'abc');
    expect(input.value).toBe('abc');
  });

  it('renders the dash placeholder in the deny list when there are no deny patterns', async () => {
    hookState = {
      ...hookState,
      items: [makeProfile({ name: 'web', allow: ['p1'], deny: [] })],
    };
    const user = userEvent.setup();
    render(<Profiles />);
    await user.click(screen.getByRole('button', { name: /web/ }));
    // Allow column has p1, deny column shows the em-dash placeholder.
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('coerces non-array allow / deny fields to zero-length badges', () => {
    hookState = {
      ...hookState,
      items: [
        makeProfile({
          name: 'web',
          allow: undefined as unknown as string[],
          deny: undefined as unknown as string[],
        }),
      ],
    };
    render(<Profiles />);
    expect(screen.getByText('0 allow')).toBeInTheDocument();
    expect(screen.getByText('0 deny')).toBeInTheDocument();
  });

  it('hides the source badge when source is undefined', () => {
    hookState = {
      ...hookState,
      items: [makeProfile({ name: 'web', source: undefined })],
    };
    render(<Profiles />);
    expect(screen.queryByText('builtin')).not.toBeInTheDocument();
  });

  it('renders the keyboard-activatable row toggle as a button element', () => {
    hookState = { ...hookState, items: [makeProfile({ name: 'web' })] };
    render(<Profiles />);
    const toggle = screen.getByRole('button', { name: /web/ });
    expect(toggle.tagName).toBe('BUTTON');
  });

  it('toggles the row via the Enter key from keyboard activation', async () => {
    hookState = { ...hookState, items: [makeProfile({ name: 'web' })] };
    const user = userEvent.setup();
    render(<Profiles />);
    const toggle = screen.getByRole('button', { name: /web/ });
    toggle.focus();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.keyboard('{Enter}');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('renders all rows in a single <ul> wrapper', () => {
    hookState = {
      ...hookState,
      items: [
        makeProfile({ name: 'a' }),
        makeProfile({ name: 'b' }),
      ],
    };
    const { container } = render(<Profiles />);
    const ul = container.querySelector('ul');
    expect(ul).not.toBeNull();
    if (ul) {
      const lis = within(ul).getAllByRole('listitem');
      expect(lis).toHaveLength(2);
    }
  });

  it('re-renders after the locale flips without crashing', () => {
    const { container } = render(<Profiles />);
    expect(screen.getByText('Profiles')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(container.firstChild).toBeInTheDocument();
  });

  // (v1.11.335, TODO 11.317) Redesign polish coverage.

  describe('source-grouping Tabs', () => {
    it('renders three tabs (All / Built-in / Custom)', () => {
      hookState = {
        ...hookState,
        items: [
          makeProfile({ name: 'web', source: 'builtin' }),
          makeProfile({ name: 'custom-a', source: 'custom' }),
        ],
      };
      render(<Profiles />);
      expect(
        screen.getByRole('tab', { name: /All/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('tab', { name: /Built-in/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('tab', { name: /Custom/i }),
      ).toBeInTheDocument();
    });

    it('All tab is default and shows every profile', () => {
      hookState = {
        ...hookState,
        items: [
          makeProfile({ name: 'web', source: 'builtin' }),
          makeProfile({ name: 'mine', source: 'custom' }),
        ],
      };
      render(<Profiles />);
      expect(screen.getByText('web')).toBeInTheDocument();
      expect(screen.getByText('mine')).toBeInTheDocument();
    });

    it('Built-in tab filters to source=builtin', async () => {
      hookState = {
        ...hookState,
        items: [
          makeProfile({ name: 'web', source: 'builtin' }),
          makeProfile({ name: 'mine', source: 'custom' }),
        ],
      };
      const user = userEvent.setup();
      render(<Profiles />);
      await user.click(screen.getByRole('tab', { name: /Built-in/i }));
      expect(screen.getByText('web')).toBeInTheDocument();
      expect(screen.queryByText('mine')).not.toBeInTheDocument();
    });

    it('Custom tab filters to non-builtin sources', async () => {
      hookState = {
        ...hookState,
        items: [
          makeProfile({ name: 'web', source: 'builtin' }),
          makeProfile({ name: 'mine', source: 'custom' }),
        ],
      };
      const user = userEvent.setup();
      render(<Profiles />);
      await user.click(screen.getByRole('tab', { name: /Custom/i }));
      expect(screen.getByText('mine')).toBeInTheDocument();
      expect(screen.queryByText('web')).not.toBeInTheDocument();
    });

    it('tab labels include the current count chip', () => {
      hookState = {
        ...hookState,
        items: [
          makeProfile({ name: 'web', source: 'builtin' }),
          makeProfile({ name: 'a', source: 'custom' }),
          makeProfile({ name: 'b', source: 'custom' }),
        ],
      };
      render(<Profiles />);
      // All (3) / Built-in (1) / Custom (2)
      expect(
        screen.getByRole('tab', { name: /All \(3\)/ }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('tab', { name: /Built-in \(1\)/ }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('tab', { name: /Custom \(2\)/ }),
      ).toBeInTheDocument();
    });
  });

  describe('Remove ConfirmDialog flow', () => {
    it('clicking Remove opens the destructive confirm dialog', async () => {
      hookState = { ...hookState, items: [makeProfile({ name: 'web' })] };
      const user = userEvent.setup();
      render(<Profiles />);
      await user.click(screen.getByRole('button', { name: /web/ }));
      await user.click(screen.getByTestId('profiles-remove-web'));
      const dialog = await screen.findByRole('dialog');
      expect(dialog).toBeInTheDocument();
      expect(
        within(dialog).getByText(/Remove profile/i),
      ).toBeInTheDocument();
    });

    it('Cancel closes the dialog without firing the action', async () => {
      hookState = { ...hookState, items: [makeProfile({ name: 'web' })] };
      const user = userEvent.setup();
      render(<Profiles />);
      await user.click(screen.getByRole('button', { name: /web/ }));
      await user.click(screen.getByTestId('profiles-remove-web'));
      const dialog = await screen.findByRole('dialog');
      const cancelBtn = within(dialog).getByRole('button', {
        name: /Cancel/i,
      });
      await user.click(cancelBtn);
      // After cancel, no toast and dialog is gone.
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.queryByTestId('toast')).not.toBeInTheDocument();
    });
  });

  describe('role RadioGroup picker', () => {
    it('renders a RadioGroup with admin / manager / worker options', async () => {
      hookState = { ...hookState, items: [makeProfile({ name: 'web' })] };
      const user = userEvent.setup();
      render(<Profiles />);
      await user.click(screen.getByRole('button', { name: /web/ }));
      expect(screen.getByTestId('profiles-role-web')).toBeInTheDocument();
      const group = screen.getByTestId('profiles-role-web');
      const radios = within(group).getAllByRole('radio');
      expect(radios.length).toBe(3);
    });

    it('worker is the default checked option', async () => {
      hookState = { ...hookState, items: [makeProfile({ name: 'web' })] };
      const user = userEvent.setup();
      render(<Profiles />);
      await user.click(screen.getByRole('button', { name: /web/ }));
      const group = screen.getByTestId('profiles-role-web');
      const workerRadio = within(group)
        .getAllByRole('radio')
        .find((r) => r.getAttribute('data-radio-value') === 'worker');
      expect(workerRadio?.getAttribute('aria-checked')).toBe('true');
    });
  });
});
