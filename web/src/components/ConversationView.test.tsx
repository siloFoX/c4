import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type { Conversation, Turn, TurnTokens } from './ConversationView';

// (v1.11.104) ConversationView wires three external dependencies:
// useConversation (snapshot + SSE), useAutoScroll (scroll position
// state), and the TurnRow dispatcher. Every test stubs the two
// hooks to deterministic shapes and replaces TurnRow with a marker
// so the test can assert turn-by-turn props without re-exercising
// the role renderers.

const setAutoScrollMock = vi.fn();
const isAtBottomMock = vi.fn(() => true);
const refreshMock = vi.fn();

let conversationState: {
  conversation: Conversation | null;
  error: string | null;
  loading: boolean;
  streaming: boolean;
} = {
  conversation: null,
  error: null,
  loading: false,
  streaming: false,
};

let autoScrollState: { autoScroll: boolean } = { autoScroll: true };

let lastUseConversationArgs: {
  sessionId: string;
  live: boolean;
  snapshotUrl?: string;
  streamUrl?: string;
} | null = null;

let lastUseAutoScrollArgs: {
  bumpKey: number;
} | null = null;

vi.mock('../lib/use-conversation', () => ({
  useConversation: (args: {
    sessionId: string;
    live: boolean;
    snapshotUrl?: string;
    streamUrl?: string;
  }) => {
    lastUseConversationArgs = args;
    return {
      ...conversationState,
      refresh: refreshMock,
    };
  },
}));

vi.mock('../lib/use-auto-scroll', () => ({
  useAutoScroll: (args: { bumpKey: number }) => {
    lastUseAutoScrollArgs = args;
    return {
      autoScroll: autoScrollState.autoScroll,
      setAutoScroll: setAutoScrollMock,
      isAtBottom: isAtBottomMock,
      jumpToBottom: () => {},
    };
  },
  AUTOSCROLL_THRESHOLD_PX: 24,
}));

const turnRowProps: Turn[] = [];

vi.mock('./ConversationTurns', () => ({
  default: ({ turn }: { turn: Turn }) => {
    turnRowProps.push(turn);
    return (
      <div
        data-testid={`turn-${turn.id}`}
        data-role={turn.role}
        data-content={turn.content}
      />
    );
  },
}));

import ConversationView from './ConversationView';

const ZERO_TOKENS: TurnTokens = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheCreate: 0,
};

function makeTurn(id: string, over: Partial<Turn> = {}): Turn {
  return {
    id,
    role: 'user',
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

function makeConversation(over: Partial<Conversation> = {}): Conversation {
  return {
    sessionId: 'sess-1',
    projectPath: null,
    createdAt: null,
    updatedAt: null,
    model: null,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    turns: [],
    warnings: [],
    ...over,
  };
}

beforeEach(() => {
  setLocale('en');
  setAutoScrollMock.mockReset();
  isAtBottomMock.mockReset();
  isAtBottomMock.mockReturnValue(true);
  refreshMock.mockReset();
  refreshMock.mockResolvedValue(undefined);
  conversationState = {
    conversation: null,
    error: null,
    loading: false,
    streaming: false,
  };
  autoScrollState = { autoScroll: true };
  lastUseConversationArgs = null;
  lastUseAutoScrollArgs = null;
  turnRowProps.length = 0;
});

describe('<ConversationView>', () => {
  it('forwards the sessionId + live=false to the conversation hook by default', () => {
    render(<ConversationView sessionId="sess-abc" />);
    expect(lastUseConversationArgs?.sessionId).toBe('sess-abc');
    expect(lastUseConversationArgs?.live).toBe(false);
  });

  it('forwards live=true + snapshotUrl + streamUrl overrides to the hook', () => {
    render(
      <ConversationView
        sessionId="sess-abc"
        live={true}
        snapshotUrl="/api/attach/w1/conversation"
        streamUrl="/api/attach/w1/conversation/stream"
      />,
    );
    expect(lastUseConversationArgs?.live).toBe(true);
    expect(lastUseConversationArgs?.snapshotUrl).toBe(
      '/api/attach/w1/conversation',
    );
    expect(lastUseConversationArgs?.streamUrl).toBe(
      '/api/attach/w1/conversation/stream',
    );
  });

  it('renders the loading state when loading=true and no conversation snapshot is cached', () => {
    conversationState = { ...conversationState, loading: true };
    render(<ConversationView sessionId="sess-1" />);
    expect(screen.getByText(/Loading session/i)).toBeInTheDocument();
  });

  it('renders the error message when the hook reports an error string', () => {
    conversationState = { ...conversationState, error: 'snapshot fetch failed' };
    render(<ConversationView sessionId="sess-1" />);
    expect(screen.getByText('snapshot fetch failed')).toBeInTheDocument();
  });

  it('renders the localized empty state when the conversation has zero turns', () => {
    conversationState = { ...conversationState, conversation: makeConversation() };
    render(<ConversationView sessionId="sess-1" />);
    expect(screen.getByText('No turns recorded yet.')).toBeInTheDocument();
  });

  it('renders one TurnRow marker per turn in the conversation', () => {
    conversationState = {
      ...conversationState,
      conversation: makeConversation({
        turns: [
          makeTurn('a', { role: 'user', content: 'a-body' }),
          makeTurn('b', { role: 'assistant', content: 'b-body' }),
        ],
      }),
    };
    render(<ConversationView sessionId="sess-1" />);
    expect(screen.getByTestId('turn-a')).toBeInTheDocument();
    expect(screen.getByTestId('turn-b')).toBeInTheDocument();
  });

  it('drops a tool_result turn when its toolUseId is already paired onto a tool_use turn', () => {
    conversationState = {
      ...conversationState,
      conversation: makeConversation({
        turns: [
          makeTurn('tu-1', {
            role: 'tool_use',
            toolName: 'Bash',
            toolUseId: 'tu-1',
            toolResult: 'ok',
          }),
          makeTurn('tr-1', {
            role: 'tool_result',
            toolUseId: 'tu-1',
            content: 'should be filtered',
          }),
        ],
      }),
    };
    render(<ConversationView sessionId="sess-1" />);
    expect(screen.getByTestId('turn-tu-1')).toBeInTheDocument();
    expect(screen.queryByTestId('turn-tr-1')).not.toBeInTheDocument();
  });

  it('keeps an orphan tool_result turn (no matching tool_use) in the render list', () => {
    conversationState = {
      ...conversationState,
      conversation: makeConversation({
        turns: [
          makeTurn('tr-2', {
            role: 'tool_result',
            toolUseId: 'tu-missing',
            content: 'orphan',
          }),
        ],
      }),
    };
    render(<ConversationView sessionId="sess-1" />);
    expect(screen.getByTestId('turn-tr-2')).toBeInTheDocument();
  });

  it('renders the session id in the header card title', () => {
    render(<ConversationView sessionId="header-sid" />);
    expect(screen.getByText('header-sid')).toBeInTheDocument();
  });

  it('prefers the snapshot sessionId over the prop sessionId in the header', () => {
    conversationState = {
      ...conversationState,
      conversation: makeConversation({ sessionId: 'snapshot-sid' }),
    };
    render(<ConversationView sessionId="prop-sid" />);
    expect(screen.getByText('snapshot-sid')).toBeInTheDocument();
  });

  it('omits the Live/Idle streaming badge when live=false', () => {
    render(<ConversationView sessionId="sess-1" />);
    expect(screen.queryByText('Live')).not.toBeInTheDocument();
    expect(screen.queryByText('Idle')).not.toBeInTheDocument();
  });

  it('renders the "Idle" streaming badge when live=true and the hook is not streaming', () => {
    render(<ConversationView sessionId="sess-1" live={true} />);
    expect(screen.getByText('Idle')).toBeInTheDocument();
  });

  it('renders the "Live" streaming badge when live=true and the hook is streaming', () => {
    conversationState = { ...conversationState, streaming: true };
    render(<ConversationView sessionId="sess-1" live={true} />);
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('renders the project path in the header meta strip when present', () => {
    conversationState = {
      ...conversationState,
      conversation: makeConversation({ projectPath: '/home/me/repo' }),
    };
    render(<ConversationView sessionId="sess-1" />);
    expect(screen.getByText('/home/me/repo')).toBeInTheDocument();
  });

  it('renders the formatted model + turns meta strip entries when conversation is present', () => {
    conversationState = {
      ...conversationState,
      conversation: makeConversation({
        model: 'claude-opus-4-7',
        turns: [makeTurn('t-1')],
      }),
    };
    render(<ConversationView sessionId="sess-1" />);
    expect(screen.getByText('model: claude-opus-4-7')).toBeInTheDocument();
    expect(screen.getByText('turns: 1')).toBeInTheDocument();
  });

  it('renders the warnings badge with the count when warnings is non-empty', () => {
    conversationState = {
      ...conversationState,
      conversation: makeConversation({ warnings: ['a', 'b', 'c'] }),
    };
    render(<ConversationView sessionId="sess-1" />);
    expect(screen.getByText('3 warnings')).toBeInTheDocument();
  });

  it('does NOT render the warnings badge when warnings is empty', () => {
    conversationState = {
      ...conversationState,
      conversation: makeConversation({ warnings: [] }),
    };
    render(<ConversationView sessionId="sess-1" />);
    expect(screen.queryByText(/warnings$/)).not.toBeInTheDocument();
  });

  it('hides the jump-to-latest button when autoScroll=true', () => {
    autoScrollState = { autoScroll: true };
    render(<ConversationView sessionId="sess-1" />);
    expect(screen.queryByRole('button', { name: /jump to latest/i })).toBeNull();
  });

  it('shows the jump-to-latest button when autoScroll=false', () => {
    autoScrollState = { autoScroll: false };
    render(<ConversationView sessionId="sess-1" />);
    expect(
      screen.getByRole('button', { name: /jump to latest/i }),
    ).toBeInTheDocument();
  });

  it('calls setAutoScroll with the current isAtBottom value when the pane scrolls', () => {
    isAtBottomMock.mockReturnValue(false);
    render(<ConversationView sessionId="sess-1" />);
    const pane = screen.getByTestId('conversation-scroll');
    fireEvent.scroll(pane);
    expect(setAutoScrollMock).toHaveBeenCalledTimes(1);
    expect(setAutoScrollMock).toHaveBeenLastCalledWith(false);
  });

  it('re-arms autoScroll when the user clicks jump-to-latest', async () => {
    autoScrollState = { autoScroll: false };
    const user = userEvent.setup();
    render(<ConversationView sessionId="sess-1" />);
    await user.click(screen.getByRole('button', { name: /jump to latest/i }));
    expect(setAutoScrollMock).toHaveBeenCalledTimes(1);
    expect(setAutoScrollMock).toHaveBeenLastCalledWith(true);
  });

  it('passes the current turn count into the auto-scroll bumpKey', () => {
    conversationState = {
      ...conversationState,
      conversation: makeConversation({
        turns: [makeTurn('a'), makeTurn('b'), makeTurn('c')],
      }),
    };
    render(<ConversationView sessionId="sess-1" />);
    expect(lastUseAutoScrollArgs?.bumpKey).toBe(3);
  });

  it('passes a bumpKey of 0 to auto-scroll when no conversation is loaded yet', () => {
    render(<ConversationView sessionId="sess-1" />);
    expect(lastUseAutoScrollArgs?.bumpKey).toBe(0);
  });

  it('forwards the custom className onto the outermost Card wrapper', () => {
    const { container } = render(
      <ConversationView sessionId="sess-1" className="my-conv-card" />,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).toMatch(/my-conv-card/);
  });

  it('re-renders translated empty copy when the locale flips to ko', () => {
    conversationState = {
      ...conversationState,
      conversation: makeConversation({ turns: [] }),
    };
    render(<ConversationView sessionId="sess-1" />);
    expect(screen.getByText('No turns recorded yet.')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('No turns recorded yet.')).not.toBeInTheDocument();
  });
});
