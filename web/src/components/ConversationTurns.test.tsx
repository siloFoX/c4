import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import TurnRow from './ConversationTurns';
import type { Turn, TurnRole, TurnTokens } from './ConversationView';

// (v1.11.104) Per-role turn dispatcher coverage. TurnRow is the
// only public export from ConversationTurns; it routes the Turn
// payload to one of six internal renderers. Each test mounts the
// dispatcher with a minimal Turn shaped for the branch under test
// so the role switch + the role-specific render + the inline
// expand/collapse toggles are exercised end-to-end without a
// parent ConversationView.

const ZERO_TOKENS: TurnTokens = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheCreate: 0,
};

function makeTurn(role: TurnRole, over: Partial<Turn> = {}): Turn {
  return {
    id: `t-${role}`,
    role,
    createdAt: '2026-05-13T03:04:00Z',
    durationMs: null,
    model: null,
    tokens: ZERO_TOKENS,
    content: '',
    toolName: null,
    toolArgs: null,
    toolUseId: null,
    toolResult: null,
    thinkingText: null,
    attachments: [],
    ...over,
  };
}

beforeEach(() => {
  setLocale('en');
});

describe('<TurnRow>', () => {
  it('returns null for an unknown role (default switch arm)', () => {
    const { container } = render(
      <TurnRow turn={makeTurn('user', { role: 'unexpected' as TurnRole })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  // ---- UserTurn -------------------------------------------------

  it('renders the localized "You" label for a user turn (en)', () => {
    render(<TurnRow turn={makeTurn('user', { content: 'hi there' })} />);
    expect(screen.getByText('You')).toBeInTheDocument();
  });

  it('renders the user-supplied content text on a user turn', () => {
    render(<TurnRow turn={makeTurn('user', { content: 'hello world' })} />);
    expect(screen.getByText('hello world')).toBeInTheDocument();
  });

  it('re-renders the user label in Korean after a locale flip', () => {
    const { rerender } = render(
      <TurnRow turn={makeTurn('user', { content: 'hi' })} />,
    );
    expect(screen.getByText('You')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    rerender(<TurnRow turn={makeTurn('user', { content: 'hi' })} />);
    expect(screen.queryByText('You')).not.toBeInTheDocument();
  });

  // ---- AssistantTurn --------------------------------------------

  it('renders the assistant model label when turn.model is set', () => {
    render(
      <TurnRow
        turn={makeTurn('assistant', {
          content: 'response body',
          model: 'claude-opus-4-7',
        })}
      />,
    );
    expect(screen.getByText('claude-opus-4-7')).toBeInTheDocument();
  });

  it('falls back to the literal "Claude" label when assistant turn has no model', () => {
    render(
      <TurnRow turn={makeTurn('assistant', { content: 'response body' })} />,
    );
    expect(screen.getByText('Claude')).toBeInTheDocument();
  });

  it('renders the assistant token counter when tokens are non-zero', () => {
    render(
      <TurnRow
        turn={makeTurn('assistant', {
          content: 'hi',
          tokens: { input: 12, output: 34, cacheRead: 0, cacheCreate: 0 },
        })}
      />,
    );
    expect(screen.getByText(/12 in/)).toBeInTheDocument();
    expect(screen.getByText(/34 out/)).toBeInTheDocument();
  });

  it('omits the assistant token counter when every counter is zero', () => {
    render(<TurnRow turn={makeTurn('assistant', { content: 'hi' })} />);
    expect(screen.queryByText(/\bin\b/)).not.toBeInTheDocument();
  });

  // ---- ThinkingTurn ---------------------------------------------

  it('renders null for a thinking turn with no text in either slot', () => {
    const { container } = render(<TurnRow turn={makeTurn('thinking')} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the "Thinking" label when thinkingText is present', () => {
    render(
      <TurnRow
        turn={makeTurn('thinking', { thinkingText: 'reasoning step' })}
      />,
    );
    expect(screen.getByText('Thinking')).toBeInTheDocument();
  });

  it('starts a thinking turn collapsed (aria-expanded=false)', () => {
    render(
      <TurnRow
        turn={makeTurn('thinking', { thinkingText: 'reasoning step' })}
      />,
    );
    const btn = screen.getByRole('button', { expanded: false });
    expect(btn).toBeInTheDocument();
  });

  it('expands a thinking turn on click and shows the full body', async () => {
    const user = userEvent.setup();
    render(
      <TurnRow
        turn={makeTurn('thinking', {
          thinkingText: 'the long reasoning step',
        })}
      />,
    );
    await user.click(screen.getByRole('button', { expanded: false }));
    expect(
      screen.getByRole('button', { expanded: true }),
    ).toBeInTheDocument();
    expect(screen.getByText('the long reasoning step')).toBeInTheDocument();
  });

  // ---- ToolUseTurn ----------------------------------------------

  it('renders the toolName in both the role header and the badge on a tool_use turn', () => {
    render(
      <TurnRow
        turn={makeTurn('tool_use', {
          toolName: 'Bash',
          toolArgs: { command: 'ls' },
        })}
      />,
    );
    // The toolName appears twice: once in the RoleHeader label and
    // once inside the badge below it.
    expect(screen.getAllByText('Bash')).toHaveLength(2);
  });

  it('falls back to the "tool" label when a tool_use turn has no name', () => {
    render(<TurnRow turn={makeTurn('tool_use', { toolArgs: {} })} />);
    expect(screen.getAllByText('tool').length).toBeGreaterThan(0);
  });

  it('starts a tool_use turn collapsed with no Input panel rendered', () => {
    render(
      <TurnRow
        turn={makeTurn('tool_use', {
          toolName: 'Bash',
          toolArgs: { command: 'ls' },
        })}
      />,
    );
    expect(screen.queryByText('Input')).not.toBeInTheDocument();
  });

  it('reveals the Input and Result panels after the tool_use toggle is clicked', async () => {
    const user = userEvent.setup();
    render(
      <TurnRow
        turn={makeTurn('tool_use', {
          toolName: 'Bash',
          toolArgs: { command: 'ls -la' },
          toolResult: 'total 0\n',
        })}
      />,
    );
    await user.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByText('Input')).toBeInTheDocument();
    expect(screen.getByText('Result')).toBeInTheDocument();
  });

  it('omits the Result panel on tool_use when toolResult is empty', async () => {
    const user = userEvent.setup();
    render(
      <TurnRow
        turn={makeTurn('tool_use', {
          toolName: 'Bash',
          toolArgs: { command: 'ls' },
          toolResult: null,
        })}
      />,
    );
    await user.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByText('Input')).toBeInTheDocument();
    expect(screen.queryByText('Result')).not.toBeInTheDocument();
  });

  // ---- ToolResultTurn -------------------------------------------

  it('renders null for a tool_result turn with no content or toolResult', () => {
    const { container } = render(
      <TurnRow turn={makeTurn('tool_result')} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the "tool result" label when a tool_result turn has content', () => {
    render(
      <TurnRow
        turn={makeTurn('tool_result', { content: 'exit code 0' })}
      />,
    );
    expect(screen.getByText('tool result')).toBeInTheDocument();
  });

  it('expands a tool_result turn on click and shows the raw text', async () => {
    const user = userEvent.setup();
    render(
      <TurnRow
        turn={makeTurn('tool_result', { content: 'stdout payload here' })}
      />,
    );
    await user.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByText('stdout payload here')).toBeInTheDocument();
  });

  // ---- SystemTurn -----------------------------------------------

  it('renders a system turn as a single compact pill with content text', () => {
    render(
      <TurnRow
        turn={makeTurn('system', { content: 'session started' })}
      />,
    );
    expect(screen.getByText('session started')).toBeInTheDocument();
  });

  it('does NOT render any toggle buttons on a system turn', () => {
    render(
      <TurnRow
        turn={makeTurn('system', { content: 'session started' })}
      />,
    );
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
