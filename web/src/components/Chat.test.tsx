import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type { ChatAction, ChatMessage } from '../lib/use-nl-chat';

// Chat (the natural-language NL chat panel) wires a single
// hook (use-nl-chat) and renders the message list + the
// optional action chip row + the controlled input form
// inline. Stub the hook to a deterministic shape so each
// test can drive a single branch without booting fetch /
// localStorage.

const sendTextMock = vi.fn(async () => {});
const newSessionMock = vi.fn();

let hookState: {
  messages: ChatMessage[];
  sending: boolean;
  error: string | null;
  actions: ChatAction[];
  sessionId: string | null;
} = {
  messages: [],
  sending: false,
  error: null,
  actions: [],
  sessionId: null,
};

vi.mock('../lib/use-nl-chat', () => ({
  useNlChat: () => ({
    messages: hookState.messages,
    sending: hookState.sending,
    error: hookState.error,
    actions: hookState.actions,
    sessionId: hookState.sessionId,
    sendText: sendTextMock,
    newSession: newSessionMock,
  }),
}));

import Chat from './Chat';

beforeEach(() => {
  setLocale('en');
  sendTextMock.mockReset();
  sendTextMock.mockResolvedValue(undefined);
  newSessionMock.mockReset();
  hookState = {
    messages: [],
    sending: false,
    error: null,
    actions: [],
    sessionId: null,
  };
});

describe('<Chat>', () => {
  it('renders the localized title + description on default render', () => {
    render(<Chat />);
    expect(screen.getByText('Chat')).toBeInTheDocument();
    expect(
      screen.getByText('Natural-language control channel.'),
    ).toBeInTheDocument();
  });

  it('renders the welcome copy when there are no messages', () => {
    render(<Chat />);
    expect(
      screen.getByText(/Try: "list workers"/),
    ).toBeInTheDocument();
  });

  it('renders the session.new badge text when sessionId is null', () => {
    render(<Chat />);
    expect(screen.getByText(/session/)).toHaveTextContent('new');
  });

  it('renders the truncated 8-char session id when present', () => {
    hookState = {
      ...hookState,
      sessionId: 'abcd1234-rest-of-the-session-id',
    };
    render(<Chat />);
    expect(screen.getByText(/session/)).toHaveTextContent('abcd1234');
  });

  it('renders user + assistant bubbles when messages are present', () => {
    hookState = {
      ...hookState,
      messages: [
        { id: 'm1', role: 'user', text: 'hi', ts: 0 },
        {
          id: 'm2',
          role: 'assistant',
          text: 'hey',
          ts: 0,
          intent: 'list',
        },
      ],
    };
    render(<Chat />);
    expect(screen.getByText('hi')).toBeInTheDocument();
    expect(screen.getByText('hey')).toBeInTheDocument();
    expect(screen.getByText('list')).toBeInTheDocument();
    expect(screen.queryByText(/Try: "list workers"/)).not.toBeInTheDocument();
  });

  it('renders the error banner with role=alert when error is set', () => {
    hookState = { ...hookState, error: 'oops' };
    render(<Chat />);
    expect(screen.getByRole('alert')).toHaveTextContent('oops');
  });

  it('omits the error banner when error is null', () => {
    render(<Chat />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders the action chip row when actions is non-empty', () => {
    hookState = {
      ...hookState,
      actions: [
        { type: 'get_status', label: 'Status' },
        { type: 'close_worker', worker: 'w1', label: 'Close w1' },
      ],
    };
    render(<Chat />);
    expect(
      screen.getByRole('button', { name: /Status/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Close w1/ }),
    ).toBeInTheDocument();
  });

  it('omits the action chip row when actions is empty', () => {
    render(<Chat />);
    expect(
      screen.queryByRole('button', { name: /Status/ }),
    ).not.toBeInTheDocument();
  });

  it('fires sendText with "status" when the get_status action is clicked', async () => {
    hookState = {
      ...hookState,
      actions: [{ type: 'get_status', label: 'Status' }],
    };
    const user = userEvent.setup();
    render(<Chat />);
    await user.click(screen.getByRole('button', { name: /Status/ }));
    expect(sendTextMock).toHaveBeenCalledWith('status');
  });

  it('fires sendText with "show w1 output" when read_output action is clicked', async () => {
    hookState = {
      ...hookState,
      actions: [{ type: 'read_output', worker: 'w1', label: 'Output' }],
    };
    const user = userEvent.setup();
    render(<Chat />);
    await user.click(screen.getByRole('button', { name: /Output/ }));
    expect(sendTextMock).toHaveBeenCalledWith('show w1 output');
  });

  it('fires sendText with "close w1" when close_worker action is clicked', async () => {
    hookState = {
      ...hookState,
      actions: [{ type: 'close_worker', worker: 'w1', label: 'Close' }],
    };
    const user = userEvent.setup();
    render(<Chat />);
    await user.click(screen.getByRole('button', { name: /Close/ }));
    expect(sendTextMock).toHaveBeenCalledWith('close w1');
  });

  it('seeds the input + skips sendText when send_task action is clicked', async () => {
    hookState = {
      ...hookState,
      actions: [{ type: 'send_task', worker: 'w1', label: 'Send Task' }],
    };
    const user = userEvent.setup();
    render(<Chat />);
    await user.click(screen.getByRole('button', { name: /Send Task/ }));
    expect(sendTextMock).not.toHaveBeenCalled();
    const input = screen.getByPlaceholderText(/Ask something/);
    expect(input).toHaveValue('tell w1 to ');
  });

  it('fires sendText with the action label for an unknown action type', async () => {
    hookState = {
      ...hookState,
      actions: [{ type: 'made_up', label: 'Custom Prompt' }],
    };
    const user = userEvent.setup();
    render(<Chat />);
    await user.click(screen.getByRole('button', { name: /Custom Prompt/ }));
    expect(sendTextMock).toHaveBeenCalledWith('Custom Prompt');
  });

  it('fires newSession when the Reset button is clicked', async () => {
    const user = userEvent.setup();
    render(<Chat />);
    await user.click(screen.getByRole('button', { name: /Reset/ }));
    expect(newSessionMock).toHaveBeenCalledTimes(1);
  });

  it('reflects typed input via the controlled input slot', async () => {
    const user = userEvent.setup();
    render(<Chat />);
    const input = screen.getByPlaceholderText(/Ask something/);
    await user.type(input, 'hello');
    expect(input).toHaveValue('hello');
  });

  it('submits the form, clears the input, and sends the trimmed text', async () => {
    const user = userEvent.setup();
    render(<Chat />);
    const input = screen.getByPlaceholderText(/Ask something/);
    await user.type(input, 'hi');
    await user.click(screen.getByRole('button', { name: /Send/ }));
    expect(sendTextMock).toHaveBeenCalledTimes(1);
    expect(sendTextMock).toHaveBeenCalledWith('hi');
    expect(input).toHaveValue('');
  });

  it('disables the Send button when input is empty', () => {
    render(<Chat />);
    const sendBtn = screen.getByRole('button', { name: /Send/ });
    expect(sendBtn).toBeDisabled();
  });

  it('enables the Send button when input is non-empty', async () => {
    const user = userEvent.setup();
    render(<Chat />);
    const input = screen.getByPlaceholderText(/Ask something/);
    await user.type(input, 'x');
    expect(screen.getByRole('button', { name: /Send/ })).not.toBeDisabled();
  });

  it('disables the Send button when input is only whitespace', async () => {
    const user = userEvent.setup();
    render(<Chat />);
    const input = screen.getByPlaceholderText(/Ask something/);
    await user.type(input, '   ');
    expect(screen.getByRole('button', { name: /…|Send/ })).toBeDisabled();
  });

  it('disables the input + flips the Send copy when sending is true', () => {
    hookState = { ...hookState, sending: true };
    render(<Chat />);
    expect(screen.getByPlaceholderText(/Ask something/)).toBeDisabled();
    expect(screen.getByRole('button', { name: /…/ })).toBeDisabled();
  });

  it('submits via Enter key inside the input', async () => {
    const user = userEvent.setup();
    render(<Chat />);
    const input = screen.getByPlaceholderText(/Ask something/);
    await user.type(input, 'hello{Enter}');
    expect(sendTextMock).toHaveBeenCalledWith('hello');
  });

  it('renders the outer Card with the documented flex layout', () => {
    const { container } = render(<Chat />);
    const root = container.firstChild as HTMLElement;
    expect(root).toHaveClass('flex');
    expect(root).toHaveClass('h-full');
    expect(root).toHaveClass('flex-col');
  });

  it('marks user bubbles with justify-end and assistant bubbles with justify-start', () => {
    hookState = {
      ...hookState,
      messages: [
        { id: 'm1', role: 'user', text: 'hi', ts: 0 },
        { id: 'm2', role: 'assistant', text: 'hey', ts: 0 },
      ],
    };
    const { container } = render(<Chat />);
    const userRow = (container.querySelectorAll('.justify-end')[0] ??
      null) as HTMLElement | null;
    const asstRow = (container.querySelectorAll('.justify-start')[0] ??
      null) as HTMLElement | null;
    expect(userRow).not.toBeNull();
    expect(asstRow).not.toBeNull();
    expect(userRow).toHaveTextContent('hi');
    expect(asstRow).toHaveTextContent('hey');
  });

  it('re-renders translated copy when the locale flips to ko', () => {
    render(<Chat />);
    expect(screen.getByText('Chat')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('Natural-language control channel.')).not.toBeInTheDocument();
  });
});
