import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';

// NewChatModal owns three controlled form fields (prompt, model
// agent) that are extracted into use-new-chat-form, and the
// Escape-key dismissal listener that is extracted into
// use-escape-to-close. Both hooks have their own unit tests, so
// we stub them here with per-test-tunable initial values + vi.fn()
// setters that also drive real useState so typing / selecting
// actually moves the controlled inputs.

let promptInitial = '';
let modelInitial = 'default';
let agentInitial = 'generic';
const setPromptMock = vi.fn();
const setModelMock = vi.fn();
const setAgentMock = vi.fn();
let lastFormOpen: boolean | null = null;

let lastEscapeArgs:
  | { open: boolean; busy: boolean | undefined; onClose: () => void }
  | null = null;

vi.mock('../lib/use-new-chat-form', async () => {
  const react = await vi.importActual<typeof import('react')>('react');
  return {
    useNewChatForm: (args: { open: boolean }) => {
      lastFormOpen = args.open;
      const [prompt, setPromptState] =
        react.useState<string>(promptInitial);
      const [model, setModelState] =
        react.useState<string>(modelInitial);
      const [agent, setAgentState] =
        react.useState<string>(agentInitial);
      return {
        prompt,
        setPrompt: (next: string) => {
          setPromptMock(next);
          setPromptState(next);
        },
        model,
        setModel: (next: string) => {
          setModelMock(next);
          setModelState(next);
        },
        agent,
        setAgent: (next: string) => {
          setAgentMock(next);
          setAgentState(next);
        },
      };
    },
  };
});

vi.mock('../lib/use-escape-to-close', () => ({
  useEscapeToClose: (args: {
    open: boolean;
    busy?: boolean;
    onClose: () => void;
  }) => {
    lastEscapeArgs = {
      open: args.open,
      busy: args.busy,
      onClose: args.onClose,
    };
  },
}));

import NewChatModal from './NewChatModal';

beforeEach(() => {
  setLocale('en');
  promptInitial = '';
  modelInitial = 'default';
  agentInitial = 'generic';
  setPromptMock.mockReset();
  setModelMock.mockReset();
  setAgentMock.mockReset();
  lastFormOpen = null;
  lastEscapeArgs = null;
});

function renderModal(
  overrides: Partial<Parameters<typeof NewChatModal>[0]> = {},
) {
  const onClose = vi.fn();
  const onSubmit = vi.fn();
  const props = {
    open: true,
    busy: false,
    error: null,
    onClose,
    onSubmit,
    ...overrides,
  };
  const utils = render(<NewChatModal {...props} />);
  const user = userEvent.setup();
  return { ...utils, user, onClose, onSubmit, props };
}

describe('<NewChatModal>', () => {
  it('renders nothing when open=false', () => {
    const { container } = render(
      <NewChatModal
        open={false}
        busy={false}
        error={null}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('does not render the dialog when open=false', () => {
    render(
      <NewChatModal
        open={false}
        busy={false}
        error={null}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders a dialog with role=dialog and aria-modal=true when open=true', () => {
    renderModal();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('labels the dialog via aria-labelledby pointing at the title id', () => {
    renderModal();
    expect(screen.getByRole('dialog')).toHaveAttribute(
      'aria-labelledby',
      'new-chat-title',
    );
    expect(screen.getByText('New Chat').id).toBe('new-chat-title');
  });

  it('renders the localized New Chat heading', () => {
    renderModal();
    expect(screen.getByText('New Chat')).toBeInTheDocument();
  });

  it('renders the localized Initial prompt label tied to the textarea', () => {
    renderModal();
    expect(screen.getByLabelText('Initial prompt')).toBeInTheDocument();
  });

  it('renders the prompt textarea with the placeholder copy', () => {
    renderModal();
    expect(
      screen.getByPlaceholderText('What should this session work on?'),
    ).toBeInTheDocument();
  });

  it('renders the localized Model label tied to its select', () => {
    renderModal();
    expect(screen.getByLabelText('Model')).toBeInTheDocument();
  });

  it('renders all four model options inside the model select', () => {
    renderModal();
    const select = screen.getByLabelText('Model') as HTMLSelectElement;
    expect(select.options).toHaveLength(4);
    expect(select.options[0]?.value).toBe('default');
    expect(select.options[1]?.value).toBe('claude-opus-4-7');
    expect(select.options[2]?.value).toBe('claude-sonnet-4-6');
    expect(select.options[3]?.value).toBe('claude-haiku-4-5');
  });

  it('renders the localized Agent label tied to its select', () => {
    renderModal();
    expect(screen.getByLabelText('Agent')).toBeInTheDocument();
  });

  it('renders all four agent options inside the agent select', () => {
    renderModal();
    const select = screen.getByLabelText('Agent') as HTMLSelectElement;
    expect(select.options).toHaveLength(4);
    expect(select.options[0]?.value).toBe('generic');
    expect(select.options[1]?.value).toBe('planner');
    expect(select.options[2]?.value).toBe('executor');
    expect(select.options[3]?.value).toBe('reviewer');
  });

  it('renders the hint copy for the initially selected model option', () => {
    renderModal();
    expect(
      screen.getByText('Use config.workerDefaults.model'),
    ).toBeInTheDocument();
  });

  it('renders the Cancel + Start chat buttons', () => {
    renderModal();
    expect(
      screen.getByRole('button', { name: 'Cancel' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Start chat' }),
    ).toBeInTheDocument();
  });

  it('renders an aria-labelled Close (X) button', () => {
    renderModal();
    expect(
      screen.getByRole('button', { name: 'Close' }),
    ).toBeInTheDocument();
  });

  it('keeps Start chat disabled when prompt is empty', () => {
    renderModal();
    expect(
      screen.getByRole('button', { name: 'Start chat' }),
    ).toBeDisabled();
  });

  it('keeps Start chat disabled when prompt is whitespace-only', async () => {
    const { user } = renderModal();
    await user.type(screen.getByLabelText('Initial prompt'), '   ');
    expect(
      screen.getByRole('button', { name: 'Start chat' }),
    ).toBeDisabled();
  });

  it('enables Start chat once non-whitespace prompt content is typed', async () => {
    const { user } = renderModal();
    await user.type(screen.getByLabelText('Initial prompt'), 'hi');
    expect(
      screen.getByRole('button', { name: 'Start chat' }),
    ).not.toBeDisabled();
  });

  it('forwards every keystroke into setPrompt', async () => {
    const { user } = renderModal();
    await user.type(screen.getByLabelText('Initial prompt'), 'ab');
    expect(setPromptMock).toHaveBeenCalledTimes(2);
    expect(setPromptMock).toHaveBeenLastCalledWith('ab');
  });

  it('reflects the typed prompt in the controlled textarea', async () => {
    const { user } = renderModal();
    const ta = screen.getByLabelText(
      'Initial prompt',
    ) as HTMLTextAreaElement;
    await user.type(ta, 'plan the auth migration');
    expect(ta.value).toBe('plan the auth migration');
  });

  it('fires setModel when a model option is picked', async () => {
    const { user } = renderModal();
    await user.selectOptions(
      screen.getByLabelText('Model'),
      'claude-sonnet-4-6',
    );
    expect(setModelMock).toHaveBeenCalledTimes(1);
    expect(setModelMock).toHaveBeenLastCalledWith('claude-sonnet-4-6');
  });

  it('fires setAgent when an agent option is picked', async () => {
    const { user } = renderModal();
    await user.selectOptions(screen.getByLabelText('Agent'), 'planner');
    expect(setAgentMock).toHaveBeenCalledTimes(1);
    expect(setAgentMock).toHaveBeenLastCalledWith('planner');
  });

  it('calls onSubmit with the trimmed prompt + model + agent on Start chat', async () => {
    const { user, onSubmit } = renderModal();
    await user.type(
      screen.getByLabelText('Initial prompt'),
      '  do the thing  ',
    );
    await user.click(screen.getByRole('button', { name: 'Start chat' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      prompt: 'do the thing',
      model: 'default',
      agent: 'generic',
    });
  });

  it('forwards the selected non-default model into onSubmit', async () => {
    const { user, onSubmit } = renderModal();
    await user.type(screen.getByLabelText('Initial prompt'), 'hi');
    await user.selectOptions(
      screen.getByLabelText('Model'),
      'claude-opus-4-7',
    );
    await user.click(screen.getByRole('button', { name: 'Start chat' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const arg = onSubmit.mock.calls[0]?.[0] as {
      prompt: string;
      model: string;
      agent: string;
    };
    expect(arg.model).toBe('claude-opus-4-7');
  });

  it('forwards the selected non-default agent into onSubmit', async () => {
    const { user, onSubmit } = renderModal();
    await user.type(screen.getByLabelText('Initial prompt'), 'hi');
    await user.selectOptions(
      screen.getByLabelText('Agent'),
      'reviewer',
    );
    await user.click(screen.getByRole('button', { name: 'Start chat' }));
    const arg = onSubmit.mock.calls[0]?.[0] as {
      prompt: string;
      model: string;
      agent: string;
    };
    expect(arg.agent).toBe('reviewer');
  });

  it('does not fire onSubmit when Start chat is clicked while disabled', async () => {
    const { user, onSubmit } = renderModal();
    await user.click(screen.getByRole('button', { name: 'Start chat' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('fires onClose when the Cancel button is clicked', async () => {
    const { user, onClose } = renderModal();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('fires onClose when the Close (X) header button is clicked', async () => {
    const { user, onClose } = renderModal();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('fires onClose when the backdrop is clicked while not busy', async () => {
    const { user, onClose } = renderModal();
    await user.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire onClose on backdrop click while busy', async () => {
    const { user, onClose } = renderModal({ busy: true });
    await user.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does NOT fire onClose when the inner card is clicked', async () => {
    const { user, onClose } = renderModal();
    await user.click(screen.getByText('New Chat'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders the error banner with role=alert when error is set', () => {
    renderModal({ error: 'failed to start' });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('failed to start');
    expect(alert).toHaveClass('text-destructive');
  });

  it('does NOT render the error banner when error is null', () => {
    renderModal();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('disables every interactive control + swaps Start label to Starting when busy', () => {
    renderModal({ busy: true });
    expect(screen.getByLabelText('Initial prompt')).toBeDisabled();
    expect(screen.getByLabelText('Model')).toBeDisabled();
    expect(screen.getByLabelText('Agent')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Starting...' }),
    ).toBeDisabled();
  });

  it('forwards the open prop into the useNewChatForm hook', () => {
    renderModal();
    expect(lastFormOpen).toBe(true);
  });

  it('forwards the open + busy + onClose props into useEscapeToClose', () => {
    const onClose = vi.fn();
    render(
      <NewChatModal
        open
        busy
        error={null}
        onClose={onClose}
        onSubmit={vi.fn()}
      />,
    );
    expect(lastEscapeArgs?.open).toBe(true);
    expect(lastEscapeArgs?.busy).toBe(true);
    expect(lastEscapeArgs?.onClose).toBe(onClose);
  });

  it('focuses the prompt textarea via autoFocus on mount', () => {
    renderModal();
    expect(screen.getByLabelText('Initial prompt')).toHaveFocus();
  });

  it('renders translated copy in ko when the locale flips', () => {
    renderModal();
    expect(screen.getByText('New Chat')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('New Chat')).not.toBeInTheDocument();
  });

  it('preserves the typed prompt across same-prop rerenders', async () => {
    const { rerender, user, props } = renderModal();
    await user.type(screen.getByLabelText('Initial prompt'), 'persist me');
    rerender(<NewChatModal {...props} />);
    expect(
      (screen.getByLabelText('Initial prompt') as HTMLTextAreaElement).value,
    ).toBe('persist me');
  });
});
