import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type { SessionSummary } from './SessionsView';

// AttachModal is the attach-an-existing-session overlay rendered
// inside SessionsView. The two form slots (pathValue, nameValue)
// + the reset-on-close effect live in lib/use-attach-form (own
// unit tests), so we mock the hook here with a tunable initial
// pair + vi.fn() setters that ALSO drive a real useState so
// typing actually moves the controlled inputs. Tests cover the
// open=false null bail, the preview list rendering (slice(0,10)),
// the use-this-id row button wiring (setPathValue), the busy gate
// (disables both buttons + swaps the attach label), submit payload
// trimming, and the error-banner branch.

let initialPath = '';
let initialName = '';
const setPathValueMock = vi.fn();
const setNameValueMock = vi.fn();
let lastHookArgs: { open: boolean } | null = null;

vi.mock('../lib/use-attach-form', async () => {
  const react = await vi.importActual<typeof import('react')>('react');
  return {
    useAttachForm: (args: { open: boolean }) => {
      lastHookArgs = { open: args.open };
      const [pathValue, setPathValueState] =
        react.useState<string>(initialPath);
      const [nameValue, setNameValueState] =
        react.useState<string>(initialName);
      return {
        pathValue,
        setPathValue: (next: string) => {
          setPathValueMock(next);
          setPathValueState(next);
        },
        nameValue,
        setNameValue: (next: string) => {
          setNameValueMock(next);
          setNameValueState(next);
        },
      };
    },
  };
});

import AttachModal, { type AttachModalProps } from './AttachModal';

function makeSession(over: Partial<SessionSummary> = {}): SessionSummary {
  return {
    projectDir: 'demo-dir',
    projectPath: '/home/u/demo',
    sessionId: '1111-2222-aaaa-bbbb',
    path: '/abs/path/session.jsonl',
    updatedAt: null,
    size: 0,
    turnCount: 4,
    lastAssistantSnippet: '',
    ...over,
  };
}

beforeEach(() => {
  setLocale('en');
  initialPath = '';
  initialName = '';
  setPathValueMock.mockReset();
  setNameValueMock.mockReset();
  lastHookArgs = null;
});

function renderModal(
  overrides: Partial<AttachModalProps> = {},
) {
  const onClose = vi.fn();
  const onSubmit = vi.fn();
  const props: AttachModalProps = {
    open: true,
    busy: false,
    error: null,
    available: [],
    onClose,
    onSubmit,
    ...overrides,
  };
  const utils = render(<AttachModal {...props} />);
  const user = userEvent.setup();
  return { ...utils, user, onClose, onSubmit, props };
}

describe('<AttachModal>', () => {
  // ---- open=false null bail --------------------------------------

  it('renders nothing when open=false', () => {
    const { container } = render(
      <AttachModal
        open={false}
        busy={false}
        error={null}
        available={[]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('does not render the dialog when open=false', () => {
    render(
      <AttachModal
        open={false}
        busy={false}
        error={null}
        available={[]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // ---- dialog scaffolding ----------------------------------------

  it('renders a single dialog with role=dialog and aria-modal=true when open=true', () => {
    renderModal();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('renders the localized Attach session title', () => {
    renderModal();
    expect(screen.getByText('Attach session')).toBeInTheDocument();
  });

  it('renders the localized intro copy', () => {
    renderModal();
    expect(
      screen.getByText(/Paste an absolute JSONL path or a session UUID/),
    ).toBeInTheDocument();
  });

  // ---- close (X) button ------------------------------------------

  it('renders an aria-labelled Close button', () => {
    renderModal();
    expect(
      screen.getByRole('button', { name: 'Close' }),
    ).toBeInTheDocument();
  });

  it('fires onClose exactly once when the Close (X) button is clicked', async () => {
    const { user, onClose } = renderModal();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ---- preview list ----------------------------------------------

  it('does NOT render the preview section when available is empty', () => {
    renderModal({ available: [] });
    expect(
      screen.queryByRole('region', { name: 'Available sessions preview' }),
    ).not.toBeInTheDocument();
  });

  it('renders the preview section when available has at least one entry', () => {
    renderModal({ available: [makeSession()] });
    expect(
      screen.getByRole('region', { name: 'Available sessions preview' }),
    ).toBeInTheDocument();
  });

  it('renders the localized preview heading', () => {
    renderModal({ available: [makeSession()] });
    expect(screen.getByText('Available sessions')).toBeInTheDocument();
  });

  it('renders the per-entry projectPath when present', () => {
    renderModal({
      available: [
        makeSession({ projectPath: '/home/u/cool-proj', sessionId: 'sid-1' }),
      ],
    });
    expect(screen.getByText('/home/u/cool-proj')).toBeInTheDocument();
  });

  it('falls back to projectDir when projectPath is null', () => {
    renderModal({
      available: [
        makeSession({
          projectPath: null,
          projectDir: 'fallback-dir',
          sessionId: 'sid-2',
        }),
      ],
    });
    expect(screen.getByText('fallback-dir')).toBeInTheDocument();
  });

  it('falls back to the localized unknown-project label when both are null', () => {
    renderModal({
      available: [
        makeSession({
          projectPath: null,
          projectDir: null,
          sessionId: 'sid-3',
        }),
      ],
    });
    expect(screen.getByText('unknown project')).toBeInTheDocument();
  });

  it('renders the localized msgs badge for each entry from turnCount', () => {
    renderModal({
      available: [makeSession({ turnCount: 17, sessionId: 'sid-msgs' })],
    });
    expect(screen.getByText('17 msgs')).toBeInTheDocument();
  });

  it('renders the localized count-found header for the available list length', () => {
    renderModal({
      available: [
        makeSession({ sessionId: 'a' }),
        makeSession({ sessionId: 'b' }),
        makeSession({ sessionId: 'c' }),
      ],
    });
    expect(screen.getByText('3 found')).toBeInTheDocument();
  });

  it('caps the preview row count at 10 entries', () => {
    const many = Array.from({ length: 15 }, (_, i) =>
      makeSession({ sessionId: `sid-${i}` }),
    );
    const { container } = renderModal({ available: many });
    const list = container.querySelector('ul');
    expect(list).not.toBeNull();
    expect(list!.querySelectorAll('li').length).toBe(10);
  });

  it('reports the full available.length in the count-found header even when preview is capped', () => {
    const many = Array.from({ length: 15 }, (_, i) =>
      makeSession({ sessionId: `sid-${i}` }),
    );
    renderModal({ available: many });
    expect(screen.getByText('15 found')).toBeInTheDocument();
  });

  // ---- use-this-id row button -----------------------------------

  it('renders one "Use this id" button per preview row', () => {
    renderModal({
      available: [
        makeSession({ sessionId: 'sid-1' }),
        makeSession({ sessionId: 'sid-2' }),
      ],
    });
    expect(
      screen.getAllByRole('button', { name: 'Use this id' }),
    ).toHaveLength(2);
  });

  it('fires setPathValue with the row sessionId when "Use this id" is clicked', async () => {
    const { user } = renderModal({
      available: [
        makeSession({ sessionId: 'first-session-id' }),
        makeSession({ sessionId: 'second-session-id' }),
      ],
    });
    const buttons = screen.getAllByRole('button', { name: 'Use this id' });
    await user.click(buttons[1]!);
    expect(setPathValueMock).toHaveBeenCalledTimes(1);
    expect(setPathValueMock).toHaveBeenLastCalledWith('second-session-id');
  });

  it('reflects the clicked row sessionId in the path input value', async () => {
    const { user } = renderModal({
      available: [makeSession({ sessionId: 'reflected-id' })],
    });
    await user.click(
      screen.getByRole('button', { name: 'Use this id' }),
    );
    const inputs = screen.getAllByRole(
      'textbox',
    ) as HTMLInputElement[];
    expect(inputs[0]!.value).toBe('reflected-id');
  });

  // ---- form fields ----------------------------------------------

  it('renders the localized path-field label + placeholder', () => {
    renderModal();
    expect(
      screen.getByText('JSONL path or session UUID'),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(
        '/abs/path/session.jsonl or 1234-... uuid',
      ),
    ).toBeInTheDocument();
  });

  it('renders the localized alias-field label + placeholder', () => {
    renderModal();
    expect(screen.getByText('Alias (optional)')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('leave blank to auto-generate'),
    ).toBeInTheDocument();
  });

  it('focuses the path input via autoFocus on mount', () => {
    renderModal();
    expect(
      screen.getByPlaceholderText(
        '/abs/path/session.jsonl or 1234-... uuid',
      ),
    ).toHaveFocus();
  });

  it('forwards every keystroke in the path input into setPathValue', async () => {
    const { user } = renderModal();
    await user.type(
      screen.getByPlaceholderText(
        '/abs/path/session.jsonl or 1234-... uuid',
      ),
      'xy',
    );
    expect(setPathValueMock).toHaveBeenCalledTimes(2);
    expect(setPathValueMock).toHaveBeenLastCalledWith('xy');
  });

  it('forwards every keystroke in the alias input into setNameValue', async () => {
    const { user } = renderModal();
    await user.type(
      screen.getByPlaceholderText('leave blank to auto-generate'),
      'cm',
    );
    expect(setNameValueMock).toHaveBeenCalledTimes(2);
    expect(setNameValueMock).toHaveBeenLastCalledWith('cm');
  });

  // ---- footer buttons --------------------------------------------

  it('renders the localized Cancel + Attach buttons', () => {
    renderModal();
    expect(
      screen.getByRole('button', { name: 'Cancel' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Attach' }),
    ).toBeInTheDocument();
  });

  it('fires onClose exactly once when Cancel is clicked', async () => {
    const { user, onClose } = renderModal();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the Attach button disabled when path is empty', () => {
    renderModal();
    expect(
      screen.getByRole('button', { name: 'Attach' }),
    ).toBeDisabled();
  });

  it('keeps the Attach button disabled when path is whitespace-only', async () => {
    const { user } = renderModal();
    await user.type(
      screen.getByPlaceholderText(
        '/abs/path/session.jsonl or 1234-... uuid',
      ),
      '   ',
    );
    expect(
      screen.getByRole('button', { name: 'Attach' }),
    ).toBeDisabled();
  });

  it('enables the Attach button once non-whitespace path is typed', async () => {
    const { user } = renderModal();
    await user.type(
      screen.getByPlaceholderText(
        '/abs/path/session.jsonl or 1234-... uuid',
      ),
      '/abs/x.jsonl',
    );
    expect(
      screen.getByRole('button', { name: 'Attach' }),
    ).not.toBeDisabled();
  });

  // ---- submit payload --------------------------------------------

  it('calls onSubmit with the trimmed path + trimmed name when Attach is clicked', async () => {
    const { user, onSubmit } = renderModal();
    await user.type(
      screen.getByPlaceholderText(
        '/abs/path/session.jsonl or 1234-... uuid',
      ),
      '  /abs/x.jsonl  ',
    );
    await user.type(
      screen.getByPlaceholderText('leave blank to auto-generate'),
      '  myalias  ',
    );
    await user.click(screen.getByRole('button', { name: 'Attach' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith('/abs/x.jsonl', 'myalias');
  });

  it('does NOT call onSubmit when the disabled Attach button is clicked while path is empty', async () => {
    const { user, onSubmit } = renderModal();
    await user.click(screen.getByRole('button', { name: 'Attach' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // ---- error banner ----------------------------------------------

  it('does NOT render the error alert when error is null', () => {
    renderModal();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders the error alert with role=alert when error is set', () => {
    renderModal({ error: 'attach failed' });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('attach failed');
  });

  it('applies the destructive tone class on the error alert', () => {
    renderModal({ error: 'boom' });
    expect(screen.getByRole('alert').className).toMatch(/destructive/);
  });

  // ---- busy state ------------------------------------------------

  it('disables Cancel + Attach when busy=true', () => {
    initialPath = '/abs/x.jsonl';
    renderModal({ busy: true });
    expect(
      screen.getByRole('button', { name: 'Cancel' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /Attaching/ }),
    ).toBeDisabled();
  });

  it('swaps the Attach label to the localized Attaching copy when busy=true', () => {
    renderModal({ busy: true });
    expect(
      screen.getByRole('button', { name: /Attaching/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Attach' }),
    ).not.toBeInTheDocument();
  });

  it('does NOT call onSubmit when the disabled Attach button is clicked while busy', async () => {
    initialPath = '/abs/x.jsonl';
    const { user, onSubmit } = renderModal({ busy: true });
    await user.click(
      screen.getByRole('button', { name: /Attaching/ }),
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // ---- post-attach help aside -----------------------------------

  it('renders the localized post-attach help aside heading', () => {
    renderModal();
    expect(
      screen.getByRole('complementary', { name: 'Post-attach help' }),
    ).toBeInTheDocument();
    expect(screen.getByText('After attach you can:')).toBeInTheDocument();
  });

  it('renders one help bullet per POST_ATTACH_HELP_ITEM_KEYS entry', () => {
    renderModal();
    const aside = screen.getByRole('complementary', {
      name: 'Post-attach help',
    });
    const bullets = within(aside).getAllByRole('listitem');
    expect(bullets).toHaveLength(3);
  });

  // ---- hook wiring ----------------------------------------------

  it('forwards the open prop into the useAttachForm hook', () => {
    renderModal({ open: true });
    expect(lastHookArgs?.open).toBe(true);
  });

  // ---- rerender stability ---------------------------------------

  it('rerendering with the same props does not duplicate the dialog', () => {
    const { rerender, props } = renderModal();
    rerender(<AttachModal {...props} />);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('rerendering from open=true to open=false drops the dialog entirely', () => {
    const { rerender, props, container } = renderModal();
    expect(container.firstChild).not.toBeNull();
    rerender(<AttachModal {...props} open={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('rerendering with new available entries replaces the preview rows', () => {
    const { rerender, props } = renderModal({
      available: [makeSession({ projectPath: '/old', sessionId: 'sid-old' })],
    });
    expect(screen.getByText('/old')).toBeInTheDocument();
    rerender(
      <AttachModal
        {...props}
        available={[
          makeSession({ projectPath: '/new', sessionId: 'sid-new' }),
        ]}
      />,
    );
    expect(screen.queryByText('/old')).not.toBeInTheDocument();
    expect(screen.getByText('/new')).toBeInTheDocument();
  });

  it('rerendering with a new error swaps the alert body', () => {
    const { rerender, props } = renderModal({ error: 'first' });
    expect(screen.getByRole('alert')).toHaveTextContent('first');
    rerender(<AttachModal {...props} error="second" />);
    expect(screen.getByRole('alert')).toHaveTextContent('second');
  });

  // ---- locale flip ----------------------------------------------

  it('re-renders the Attach button label in Korean when the locale flips to ko', () => {
    renderModal();
    expect(
      screen.getByRole('button', { name: 'Attach' }),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByRole('button', { name: 'Attach' }),
    ).not.toBeInTheDocument();
  });

  it('re-renders the Cancel button label in Korean when the locale flips to ko', () => {
    renderModal();
    expect(
      screen.getByRole('button', { name: 'Cancel' }),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByRole('button', { name: 'Cancel' }),
    ).not.toBeInTheDocument();
  });

  it('re-renders the title in Korean when the locale flips to ko', () => {
    renderModal();
    expect(screen.getByText('Attach session')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('Attach session')).not.toBeInTheDocument();
  });
});
