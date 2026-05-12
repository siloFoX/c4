import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';

// StatusMessageCard is the Slack status-update form rendered inside
// the worker ControlPanel. The message + sending state + the
// fire-and-forget POST live in lib/use-status-message (own unit
// tests), so we mock it here with per-test-tunable initial values
// + vi.fn() setters that ALSO drive real useState so typing actually
// moves the controlled textarea. The Send button's enable/disable
// gates are driven by the live message + sending values returned by
// our mock hook.

let initialMessage = '';
let initialSending = false;
const setMessageMock = vi.fn();
const sendMock = vi.fn();
let lastHookArgs:
  | { workerName: string; onToast: (msg: string, type: string) => void }
  | null = null;

vi.mock('../lib/use-status-message', async () => {
  const react = await vi.importActual<typeof import('react')>('react');
  return {
    useStatusMessage: (args: {
      workerName: string;
      onToast: (msg: string, type: string) => void;
    }) => {
      lastHookArgs = { workerName: args.workerName, onToast: args.onToast };
      const [message, setMessageState] =
        react.useState<string>(initialMessage);
      const [sending] = react.useState<boolean>(initialSending);
      return {
        message,
        setMessage: (next: string) => {
          setMessageMock(next);
          setMessageState(next);
        },
        sending,
        send: sendMock,
      };
    },
  };
});

import StatusMessageCard from './StatusMessageCard';

beforeEach(() => {
  setLocale('en');
  initialMessage = '';
  initialSending = false;
  setMessageMock.mockReset();
  sendMock.mockReset();
  lastHookArgs = null;
});

function renderCard(
  overrides: Partial<Parameters<typeof StatusMessageCard>[0]> = {},
) {
  const onToast = vi.fn();
  const props = {
    workerName: 'demo-1',
    onToast,
    ...overrides,
  };
  const utils = render(<StatusMessageCard {...props} />);
  const user = userEvent.setup();
  return { ...utils, user, onToast, props };
}

describe('<StatusMessageCard>', () => {
  // ---- scaffolding -----------------------------------------------

  it('renders a labelled card root (aria-label points at the localized title)', () => {
    renderCard();
    expect(
      screen.getByLabelText('Status message to Slack'),
    ).toBeInTheDocument();
  });

  it('renders the localized card title', () => {
    renderCard();
    expect(screen.getByText('Status message')).toBeInTheDocument();
  });

  it('renders the localized card description copy', () => {
    renderCard();
    expect(
      screen.getByText(
        /Post a short status update to Slack tagged with this worker/,
      ),
    ).toBeInTheDocument();
  });

  // ---- textarea --------------------------------------------------

  it('renders a textarea with rows=2 by default', () => {
    renderCard();
    const ta = screen.getByLabelText(
      /Status message for demo-1/,
    ) as HTMLTextAreaElement;
    expect(ta.rows).toBe(2);
  });

  it('interpolates the workerName into the textarea aria-label', () => {
    renderCard({ workerName: 'auto-mgr' });
    expect(
      screen.getByLabelText('Status message for auto-mgr'),
    ).toBeInTheDocument();
  });

  it('interpolates the workerName into the textarea placeholder', () => {
    renderCard({ workerName: 'shipit-1' });
    expect(
      screen.getByPlaceholderText('status for shipit-1...'),
    ).toBeInTheDocument();
  });

  it('renders an empty textarea when the hook starts with an empty message', () => {
    renderCard();
    const ta = screen.getByLabelText(
      /Status message for demo-1/,
    ) as HTMLTextAreaElement;
    expect(ta.value).toBe('');
  });

  it('reflects the hook-provided initial message value in the textarea', () => {
    initialMessage = 'pre-filled draft';
    renderCard();
    const ta = screen.getByLabelText(
      /Status message for demo-1/,
    ) as HTMLTextAreaElement;
    expect(ta.value).toBe('pre-filled draft');
  });

  // ---- send button base -----------------------------------------

  it('renders the localized Send button label when not sending', () => {
    renderCard();
    expect(
      screen.getByRole('button', { name: /Send to Slack/ }),
    ).toBeInTheDocument();
  });

  it('keeps the Send button disabled when message is empty', () => {
    renderCard();
    expect(
      screen.getByRole('button', { name: /Send to Slack/ }),
    ).toBeDisabled();
  });

  it('keeps the Send button disabled when message is whitespace-only', async () => {
    const { user } = renderCard();
    await user.type(
      screen.getByLabelText(/Status message for demo-1/),
      '    ',
    );
    expect(
      screen.getByRole('button', { name: /Send to Slack/ }),
    ).toBeDisabled();
  });

  it('enables the Send button once non-whitespace text is typed', async () => {
    const { user } = renderCard();
    await user.type(
      screen.getByLabelText(/Status message for demo-1/),
      'hi',
    );
    expect(
      screen.getByRole('button', { name: /Send to Slack/ }),
    ).not.toBeDisabled();
  });

  // ---- typing + setMessage wiring -------------------------------

  it('forwards every keystroke into setMessage', async () => {
    const { user } = renderCard();
    await user.type(
      screen.getByLabelText(/Status message for demo-1/),
      'ab',
    );
    expect(setMessageMock).toHaveBeenCalledTimes(2);
    expect(setMessageMock).toHaveBeenLastCalledWith('ab');
  });

  it('reflects typed content in the controlled textarea value', async () => {
    const { user } = renderCard();
    const ta = screen.getByLabelText(
      /Status message for demo-1/,
    ) as HTMLTextAreaElement;
    await user.type(ta, 'oncall is awake');
    expect(ta.value).toBe('oncall is awake');
  });

  // ---- send button click ----------------------------------------

  it('fires the hook send callback exactly once when Send is clicked with content present', async () => {
    initialMessage = 'looks good';
    const { user } = renderCard();
    await user.click(
      screen.getByRole('button', { name: /Send to Slack/ }),
    );
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire send when the disabled Send button is clicked while empty', async () => {
    const { user } = renderCard();
    await user.click(
      screen.getByRole('button', { name: /Send to Slack/ }),
    );
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('passes the workerName + onToast through to the hook', () => {
    const onToast = vi.fn();
    renderCard({ workerName: 'mgr-1', onToast });
    expect(lastHookArgs?.workerName).toBe('mgr-1');
    expect(lastHookArgs?.onToast).toBe(onToast);
  });

  // ---- busy / sending state -------------------------------------

  it('swaps the Send button label to the localized Sending copy when sending=true', () => {
    initialSending = true;
    initialMessage = 'draft';
    renderCard();
    expect(
      screen.getByRole('button', { name: /Sending/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Send to Slack/ }),
    ).not.toBeInTheDocument();
  });

  it('disables the Send button while sending=true even if message has content', () => {
    initialSending = true;
    initialMessage = 'draft';
    renderCard();
    expect(
      screen.getByRole('button', { name: /Sending/ }),
    ).toBeDisabled();
  });

  // ---- send icon ------------------------------------------------

  it('renders exactly one icon SVG inside the Send button', () => {
    renderCard();
    const btn = screen.getByRole('button', { name: /Send to Slack/ });
    expect(btn.querySelectorAll('svg').length).toBe(1);
  });

  // ---- rerender stability ---------------------------------------

  it('rerendering with the same props does not duplicate the card', () => {
    const { rerender, props } = renderCard();
    rerender(<StatusMessageCard {...props} />);
    expect(
      screen.getAllByLabelText('Status message to Slack'),
    ).toHaveLength(1);
  });

  it('rerendering with a new workerName updates the textarea aria-label', () => {
    const { rerender, props } = renderCard({ workerName: 'first' });
    expect(
      screen.getByLabelText('Status message for first'),
    ).toBeInTheDocument();
    rerender(<StatusMessageCard {...props} workerName="second" />);
    expect(
      screen.queryByLabelText('Status message for first'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByLabelText('Status message for second'),
    ).toBeInTheDocument();
  });

  it('rerendering with a new onToast forwards the new callback into the hook', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderCard({ onToast: first });
    expect(lastHookArgs?.onToast).toBe(first);
    rerender(
      <StatusMessageCard workerName="demo-1" onToast={second} />,
    );
    expect(lastHookArgs?.onToast).toBe(second);
  });

  // ---- locale flip ----------------------------------------------

  it('re-renders the Send label in Korean when the locale flips to ko', () => {
    renderCard();
    expect(
      screen.getByRole('button', { name: /Send to Slack/ }),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByRole('button', { name: /Send to Slack/ }),
    ).not.toBeInTheDocument();
  });

  it('re-renders the card title in Korean when the locale flips to ko', () => {
    renderCard();
    expect(screen.getByText('Status message')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('Status message')).not.toBeInTheDocument();
  });
});
