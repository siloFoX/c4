import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';

// Login is the sign-in card shown when the dashboard has no auth
// token. The form state machine (user / password / error / busy /
// submit POST) lives in lib/use-login and has its own unit tests, so
// we mock it here with a tunable initial-value set + vi.fn() setters
// that ALSO drive a real useState so typing actually moves the
// controlled inputs. The error-banner branch and busy-disable
// behaviour are driven by the mock hook returning the appropriate
// values for each test.

let initialUser = '';
let initialPassword = '';
let initialError: string | null = null;
let initialBusy = false;
const setUserMock = vi.fn();
const setPasswordMock = vi.fn();
const handleSubmitMock = vi.fn((e: { preventDefault: () => void }) => {
  e.preventDefault();
  return Promise.resolve();
});
let lastHookArgs: { onSuccess: () => void } | null = null;

vi.mock('../lib/use-login', async () => {
  const react = await vi.importActual<typeof import('react')>('react');
  return {
    useLogin: (args: { onSuccess: () => void }) => {
      lastHookArgs = { onSuccess: args.onSuccess };
      const [user, setUserState] = react.useState<string>(initialUser);
      const [password, setPasswordState] =
        react.useState<string>(initialPassword);
      return {
        user,
        setUser: (next: string) => {
          setUserMock(next);
          setUserState(next);
        },
        password,
        setPassword: (next: string) => {
          setPasswordMock(next);
          setPasswordState(next);
        },
        error: initialError,
        busy: initialBusy,
        handleSubmit: handleSubmitMock,
      };
    },
  };
});

import Login from './Login';

beforeEach(() => {
  setLocale('en');
  initialUser = '';
  initialPassword = '';
  initialError = null;
  initialBusy = false;
  setUserMock.mockReset();
  setPasswordMock.mockReset();
  handleSubmitMock.mockClear();
  lastHookArgs = null;
});

function renderLogin(
  overrides: Partial<Parameters<typeof Login>[0]> = {},
) {
  const onSuccess = vi.fn();
  const props = {
    onSuccess,
    ...overrides,
  };
  const utils = render(<Login {...props} />);
  const user = userEvent.setup();
  return { ...utils, user, onSuccess, props };
}

describe('<Login>', () => {
  // ---- scaffolding -----------------------------------------------

  it('renders the localized sign-in title', () => {
    renderLogin();
    expect(screen.getByText('C4 Sign in')).toBeInTheDocument();
  });

  it('renders the localized description copy', () => {
    renderLogin();
    expect(
      screen.getByText(/Session required to access the dashboard/),
    ).toBeInTheDocument();
  });

  it('renders the localized footer copy', () => {
    renderLogin();
    expect(screen.getByText('© C4 operator console')).toBeInTheDocument();
  });

  it('renders an aria-hidden dotted background decoration', () => {
    const { container } = renderLogin();
    const decorative = container.querySelector('[aria-hidden="true"]');
    expect(decorative).not.toBeNull();
  });

  // ---- user input -----------------------------------------------

  it('renders the localized User label tied to the username input', () => {
    renderLogin();
    expect(screen.getByLabelText('User')).toBeInTheDocument();
  });

  it('renders the username input as a required text field with autocomplete=username', () => {
    renderLogin();
    const input = screen.getByLabelText('User') as HTMLInputElement;
    expect(input.type).toBe('text');
    expect(input.autocomplete).toBe('username');
    expect(input.required).toBe(true);
  });

  it('reflects the hook-provided initial user value in the username input', () => {
    initialUser = 'shinc';
    renderLogin();
    expect((screen.getByLabelText('User') as HTMLInputElement).value).toBe(
      'shinc',
    );
  });

  it('forwards every username keystroke into setUser', async () => {
    const { user } = renderLogin();
    await user.type(screen.getByLabelText('User'), 'ab');
    expect(setUserMock).toHaveBeenCalledTimes(2);
    expect(setUserMock).toHaveBeenLastCalledWith('ab');
  });

  it('reflects typed content in the controlled username input value', async () => {
    const { user } = renderLogin();
    const input = screen.getByLabelText('User') as HTMLInputElement;
    await user.type(input, 'oncall@team');
    expect(input.value).toBe('oncall@team');
  });

  // ---- password input -------------------------------------------

  it('renders the localized Password label tied to the password input', () => {
    renderLogin();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('renders the password input as a required password field with autocomplete=current-password', () => {
    renderLogin();
    const input = screen.getByLabelText('Password') as HTMLInputElement;
    expect(input.type).toBe('password');
    expect(input.autocomplete).toBe('current-password');
    expect(input.required).toBe(true);
  });

  it('forwards every password keystroke into setPassword', async () => {
    const { user } = renderLogin();
    await user.type(screen.getByLabelText('Password'), 'xy');
    expect(setPasswordMock).toHaveBeenCalledTimes(2);
    expect(setPasswordMock).toHaveBeenLastCalledWith('xy');
  });

  it('keeps the password input visually masked even after typing', async () => {
    const { user } = renderLogin();
    const input = screen.getByLabelText('Password') as HTMLInputElement;
    await user.type(input, 'secret');
    expect(input.type).toBe('password');
  });

  // ---- submit button --------------------------------------------

  it('renders the localized Sign in submit label when not busy', () => {
    renderLogin();
    expect(
      screen.getByRole('button', { name: 'Sign in' }),
    ).toBeInTheDocument();
  });

  it('renders the submit button with type=submit so Enter inside the form triggers it', () => {
    renderLogin();
    expect(
      screen.getByRole('button', { name: 'Sign in' }),
    ).toHaveAttribute('type', 'submit');
  });

  it('does NOT disable the submit button when busy=false', () => {
    renderLogin();
    expect(
      screen.getByRole('button', { name: 'Sign in' }),
    ).not.toBeDisabled();
  });

  // ---- submit wiring --------------------------------------------

  it('fires the hook handleSubmit exactly once when Sign in is clicked', async () => {
    // Set both required inputs so the browser does not block submission.
    initialUser = 'shinc';
    initialPassword = 'secret';
    const { user } = renderLogin();
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(handleSubmitMock).toHaveBeenCalledTimes(1);
  });

  it('fires the hook handleSubmit on Enter from the password field', async () => {
    // Set both required inputs so the browser does not block submission.
    initialUser = 'shinc';
    initialPassword = 'secret';
    const { user } = renderLogin();
    const input = screen.getByLabelText('Password');
    input.focus();
    await user.keyboard('{Enter}');
    expect(handleSubmitMock).toHaveBeenCalledTimes(1);
  });

  it('passes onSuccess through to the hook', () => {
    const onSuccess = vi.fn();
    renderLogin({ onSuccess });
    expect(lastHookArgs?.onSuccess).toBe(onSuccess);
  });

  it('does NOT call handleSubmit on initial render', () => {
    renderLogin();
    expect(handleSubmitMock).not.toHaveBeenCalled();
  });

  it('does NOT call onSuccess on initial render', () => {
    const onSuccess = vi.fn();
    renderLogin({ onSuccess });
    expect(onSuccess).not.toHaveBeenCalled();
  });

  // ---- busy state ----------------------------------------------

  it('disables the submit button when busy=true', () => {
    initialBusy = true;
    renderLogin();
    expect(
      screen.getByRole('button', { name: /Signing in/ }),
    ).toBeDisabled();
  });

  it('swaps the submit label to the localized Signing in copy when busy=true', () => {
    initialBusy = true;
    renderLogin();
    expect(
      screen.getByRole('button', { name: /Signing in/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Sign in' }),
    ).not.toBeInTheDocument();
  });

  it('swaps the LogIn icon to a Loader2 spinner when busy=true', () => {
    initialBusy = true;
    renderLogin();
    const btn = screen.getByRole('button', { name: /Signing in/ });
    expect(btn.querySelector('svg.animate-spin')).not.toBeNull();
  });

  // ---- error banner --------------------------------------------

  it('does NOT render the error alert when error is null', () => {
    renderLogin();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders the error alert with role=alert when error is set', () => {
    initialError = 'Invalid credentials';
    renderLogin();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Invalid credentials');
  });

  it('applies the destructive tone classes on the error alert', () => {
    initialError = 'failed';
    renderLogin();
    expect(screen.getByRole('alert').className).toMatch(/destructive/);
  });

  it('renders a leading AlertTriangle icon inside the error alert', () => {
    initialError = 'failed';
    renderLogin();
    expect(
      screen.getByRole('alert').querySelector('svg'),
    ).not.toBeNull();
  });

  // ---- rerender stability --------------------------------------

  it('rerendering with the same props does not duplicate the form', () => {
    const { rerender, props } = renderLogin();
    rerender(<Login {...props} />);
    expect(screen.getAllByLabelText('User')).toHaveLength(1);
    expect(screen.getAllByLabelText('Password')).toHaveLength(1);
  });

  it('rerendering with a new onSuccess forwards the new callback into the hook', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderLogin({ onSuccess: first });
    expect(lastHookArgs?.onSuccess).toBe(first);
    rerender(<Login onSuccess={second} />);
    expect(lastHookArgs?.onSuccess).toBe(second);
  });

  // ---- locale flip --------------------------------------------

  it('re-renders the User label in Korean when the locale flips to ko', () => {
    renderLogin();
    expect(screen.getByLabelText('User')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByLabelText('User')).not.toBeInTheDocument();
  });

  it('re-renders the Sign in button label in Korean when the locale flips to ko', () => {
    renderLogin();
    expect(
      screen.getByRole('button', { name: 'Sign in' }),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByRole('button', { name: 'Sign in' }),
    ).not.toBeInTheDocument();
  });

  it('re-renders the description copy in Korean when the locale flips to ko', () => {
    renderLogin();
    expect(
      screen.getByText(/Session required to access the dashboard/),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByText(/Session required to access the dashboard/),
    ).not.toBeInTheDocument();
  });
});
