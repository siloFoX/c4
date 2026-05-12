import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type { Selection } from './SessionsView';

// SessionsRightPane composes ConversationView (the JSONL timeline
// viewer that boots its own EventSource stream + fetch) and two
// pure right-pane subtrees (SessionsComparisonCard +
// SessionsEmptyPanel). Each is stubbed so the right-pane test
// asserts the branching logic + prop wiring without booting MSW
// + EventSource for the heavy ConversationView subtree.

interface ConversationViewProps {
  sessionId: string;
  live?: boolean;
  className?: string;
  snapshotUrl?: string;
  streamUrl?: string;
}

let lastConvProps: ConversationViewProps | null = null;
let convRenderCount = 0;
let lastConvKey: string | null = null;

vi.mock('./ConversationView', () => ({
  default: (props: ConversationViewProps) => {
    convRenderCount += 1;
    lastConvProps = props;
    return (
      <div
        data-testid="conversation-view"
        data-session-id={props.sessionId}
        data-live={props.live ? 'true' : 'false'}
        data-snapshot-url={props.snapshotUrl ?? ''}
        data-stream-url={props.streamUrl ?? ''}
        data-classname={props.className ?? ''}
      >
        conv
      </div>
    );
  },
}));

vi.mock('./SessionsComparisonCard', () => ({
  default: ({ className }: { className?: string }) => (
    <div
      data-testid="comparison-card"
      data-classname={className ?? ''}
    >
      cmp
    </div>
  ),
}));

let lastEmptyPanelProps:
  | {
      showStartFirst: boolean;
      onNewChat: () => void;
      onAttachNew: () => void;
    }
  | null = null;

vi.mock('./SessionsEmptyPanel', () => ({
  default: (props: {
    showStartFirst: boolean;
    onNewChat: () => void;
    onAttachNew: () => void;
  }) => {
    lastEmptyPanelProps = props;
    return (
      <div
        data-testid="empty-panel"
        data-show-start-first={props.showStartFirst ? 'true' : 'false'}
      >
        <button
          type="button"
          data-testid="empty-new-chat"
          onClick={props.onNewChat}
        >
          new
        </button>
        <button
          type="button"
          data-testid="empty-attach-new"
          onClick={props.onAttachNew}
        >
          attach
        </button>
      </div>
    );
  },
}));

import SessionsRightPane from './SessionsRightPane';

beforeEach(() => {
  setLocale('en');
  lastConvProps = null;
  convRenderCount = 0;
  lastConvKey = null;
  lastEmptyPanelProps = null;
});

function renderPane(
  overrides: Partial<Parameters<typeof SessionsRightPane>[0]> = {},
) {
  const onNewChat = vi.fn();
  const onAttachNew = vi.fn();
  const props = {
    selection: null as Selection | null,
    showStartFirstEmptyState: false,
    onNewChat,
    onAttachNew,
    ...overrides,
  };
  const utils = render(<SessionsRightPane {...props} />);
  const user = userEvent.setup();
  return { ...utils, user, onNewChat, onAttachNew, props };
}

describe('<SessionsRightPane>', () => {
  it('renders the empty panel when selection is null', () => {
    renderPane();
    expect(screen.getByTestId('empty-panel')).toBeInTheDocument();
  });

  it('does NOT render the ConversationView in the null-selection branch', () => {
    renderPane();
    expect(
      screen.queryByTestId('conversation-view'),
    ).not.toBeInTheDocument();
  });

  it('does NOT render the comparison card in the null-selection branch', () => {
    renderPane();
    expect(
      screen.queryByTestId('comparison-card'),
    ).not.toBeInTheDocument();
  });

  it('forwards showStartFirstEmptyState=true into the empty panel', () => {
    renderPane({ showStartFirstEmptyState: true });
    expect(screen.getByTestId('empty-panel')).toHaveAttribute(
      'data-show-start-first',
      'true',
    );
  });

  it('forwards showStartFirstEmptyState=false into the empty panel', () => {
    renderPane({ showStartFirstEmptyState: false });
    expect(screen.getByTestId('empty-panel')).toHaveAttribute(
      'data-show-start-first',
      'false',
    );
  });

  it('forwards onNewChat through the empty panel marker', async () => {
    const { user, onNewChat } = renderPane();
    await user.click(screen.getByTestId('empty-new-chat'));
    expect(onNewChat).toHaveBeenCalledTimes(1);
  });

  it('forwards onAttachNew through the empty panel marker', async () => {
    const { user, onAttachNew } = renderPane();
    await user.click(screen.getByTestId('empty-attach-new'));
    expect(onAttachNew).toHaveBeenCalledTimes(1);
  });

  it('renders the ConversationView when selection.kind is session', () => {
    renderPane({ selection: { kind: 'session', id: 'sid-42' } });
    expect(screen.getByTestId('conversation-view')).toBeInTheDocument();
  });

  it('forwards the sessionId into ConversationView in the session branch', () => {
    renderPane({ selection: { kind: 'session', id: 'sid-42' } });
    expect(screen.getByTestId('conversation-view')).toHaveAttribute(
      'data-session-id',
      'sid-42',
    );
  });

  it('passes live=false through ConversationView in the session branch', () => {
    renderPane({ selection: { kind: 'session', id: 'sid-42' } });
    expect(screen.getByTestId('conversation-view')).toHaveAttribute(
      'data-live',
      'false',
    );
  });

  it('passes the flex-1 className into ConversationView', () => {
    renderPane({ selection: { kind: 'session', id: 'sid-42' } });
    expect(screen.getByTestId('conversation-view')).toHaveAttribute(
      'data-classname',
      'flex-1',
    );
  });

  it('does NOT render the comparison card in the session branch', () => {
    renderPane({ selection: { kind: 'session', id: 'sid-42' } });
    expect(
      screen.queryByTestId('comparison-card'),
    ).not.toBeInTheDocument();
  });

  it('does NOT render the empty panel in the session branch', () => {
    renderPane({ selection: { kind: 'session', id: 'sid-42' } });
    expect(screen.queryByTestId('empty-panel')).not.toBeInTheDocument();
  });

  it('omits snapshotUrl / streamUrl in the session branch', () => {
    renderPane({ selection: { kind: 'session', id: 'sid-42' } });
    expect(screen.getByTestId('conversation-view')).toHaveAttribute(
      'data-snapshot-url',
      '',
    );
    expect(screen.getByTestId('conversation-view')).toHaveAttribute(
      'data-stream-url',
      '',
    );
  });

  it('renders both ConversationView + comparison card in the attached branch', () => {
    renderPane({ selection: { kind: 'attached', name: 'w1' } });
    expect(screen.getByTestId('conversation-view')).toBeInTheDocument();
    expect(screen.getByTestId('comparison-card')).toBeInTheDocument();
  });

  it('forwards the attached name as the sessionId in the attached branch', () => {
    renderPane({ selection: { kind: 'attached', name: 'w1' } });
    expect(screen.getByTestId('conversation-view')).toHaveAttribute(
      'data-session-id',
      'w1',
    );
  });

  it('passes live=true through ConversationView in the attached branch', () => {
    renderPane({ selection: { kind: 'attached', name: 'w1' } });
    expect(screen.getByTestId('conversation-view')).toHaveAttribute(
      'data-live',
      'true',
    );
  });

  it('forwards the URL-encoded snapshotUrl in the attached branch', () => {
    renderPane({ selection: { kind: 'attached', name: 'w 1' } });
    expect(screen.getByTestId('conversation-view')).toHaveAttribute(
      'data-snapshot-url',
      '/api/attach/w%201/conversation',
    );
  });

  it('forwards the URL-encoded streamUrl in the attached branch', () => {
    renderPane({ selection: { kind: 'attached', name: 'w 1' } });
    expect(screen.getByTestId('conversation-view')).toHaveAttribute(
      'data-stream-url',
      '/api/attach/w%201/tail?live=1',
    );
  });

  it('forwards the self-end className on the comparison card', () => {
    renderPane({ selection: { kind: 'attached', name: 'w1' } });
    expect(screen.getByTestId('comparison-card')).toHaveAttribute(
      'data-classname',
      'self-end',
    );
  });

  it('does NOT render the empty panel in the attached branch', () => {
    renderPane({ selection: { kind: 'attached', name: 'w1' } });
    expect(screen.queryByTestId('empty-panel')).not.toBeInTheDocument();
  });

  it('remounts ConversationView (different React key) on switch between session ids', () => {
    const { rerender } = renderPane({
      selection: { kind: 'session', id: 'a' },
    });
    expect(lastConvProps?.sessionId).toBe('a');
    const firstCount = convRenderCount;
    rerender(
      <SessionsRightPane
        selection={{ kind: 'session', id: 'b' }}
        showStartFirstEmptyState={false}
        onNewChat={vi.fn()}
        onAttachNew={vi.fn()}
      />,
    );
    expect(lastConvProps?.sessionId).toBe('b');
    expect(convRenderCount).toBeGreaterThan(firstCount);
  });

  it('does not duplicate ConversationView on a same-props rerender', () => {
    const sel: Selection = { kind: 'session', id: 'x' };
    const { rerender } = renderPane({ selection: sel });
    rerender(
      <SessionsRightPane
        selection={sel}
        showStartFirstEmptyState={false}
        onNewChat={vi.fn()}
        onAttachNew={vi.fn()}
      />,
    );
    expect(
      screen.getAllByTestId('conversation-view'),
    ).toHaveLength(1);
  });

  it('switches from session to attached when selection.kind changes', () => {
    const { rerender } = renderPane({
      selection: { kind: 'session', id: 'a' },
    });
    expect(
      screen.queryByTestId('comparison-card'),
    ).not.toBeInTheDocument();
    rerender(
      <SessionsRightPane
        selection={{ kind: 'attached', name: 'w1' }}
        showStartFirstEmptyState={false}
        onNewChat={vi.fn()}
        onAttachNew={vi.fn()}
      />,
    );
    expect(screen.getByTestId('comparison-card')).toBeInTheDocument();
  });

  it('switches back to empty panel when selection becomes null', () => {
    const { rerender } = renderPane({
      selection: { kind: 'session', id: 'a' },
    });
    expect(
      screen.queryByTestId('empty-panel'),
    ).not.toBeInTheDocument();
    rerender(
      <SessionsRightPane
        selection={null}
        showStartFirstEmptyState={false}
        onNewChat={vi.fn()}
        onAttachNew={vi.fn()}
      />,
    );
    expect(screen.getByTestId('empty-panel')).toBeInTheDocument();
  });

  it('renders translated copy in ko when the locale flips on the empty branch', () => {
    renderPane({ showStartFirstEmptyState: true });
    act(() => {
      setLocale('ko');
    });
    expect(screen.getByTestId('empty-panel')).toBeInTheDocument();
  });

  it('marks lastConvKey as unset when no session is rendered', () => {
    renderPane();
    expect(lastConvKey).toBeNull();
  });

  it('forwards the same onNewChat callback identity into the empty panel', () => {
    const onNewChat = vi.fn();
    render(
      <SessionsRightPane
        selection={null}
        showStartFirstEmptyState={false}
        onNewChat={onNewChat}
        onAttachNew={vi.fn()}
      />,
    );
    expect(lastEmptyPanelProps?.onNewChat).toBe(onNewChat);
  });

  it('forwards the same onAttachNew callback identity into the empty panel', () => {
    const onAttachNew = vi.fn();
    render(
      <SessionsRightPane
        selection={null}
        showStartFirstEmptyState={false}
        onNewChat={vi.fn()}
        onAttachNew={onAttachNew}
      />,
    );
    expect(lastEmptyPanelProps?.onAttachNew).toBe(onAttachNew);
  });
});
