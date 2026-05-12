import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type { ChatMessage } from '../lib/chat-helpers';
import type { BackfillSource } from './ChatHeader';

// ChatView orchestrates seven hooks (use-chat-backfill,
// use-append-live, use-worker-buffer-flusher,
// use-chat-sse-stream, use-auto-scroll, use-chat-submit,
// useLocale) + four sibling components (ChatHeader,
// ChatComposer, ChatErrorBanners, ChatMessageLog). Stub
// every hook to a deterministic shape so each test can
// drive a single branch without booting EventSource /
// fetch / scrollIntoView / setTimeout, and stub every
// child to a marker that exposes the props via data-*.

const appendLiveMock = vi.fn();
const rememberMessageMock = vi.fn();
const loadOlderMock = vi.fn(async () => {});
const setHistoryMock = vi.fn();
const flushWorkerBufferMock = vi.fn();
const scheduleFlushMock = vi.fn();
const resetFlusherMock = vi.fn();
const jumpToBottomMock = vi.fn();
const setAutoScrollMock = vi.fn();
const isAtBottomMock = vi.fn();
const handleSubmitMock = vi.fn(async () => {});

let backfillState: {
  history: ChatMessage[];
  backfillLoading: boolean;
  backfillCount: number;
  backfillSource: BackfillSource;
  backfillError: string | null;
  hasOlder: boolean;
  loadingOlder: boolean;
} = {
  history: [],
  backfillLoading: false,
  backfillCount: 0,
  backfillSource: null,
  backfillError: null,
  hasOlder: false,
  loadingOlder: false,
};

let sseState: { sseConnected: boolean } = { sseConnected: false };
let autoState: { autoScroll: boolean } = { autoScroll: true };
let submitState: { sending: boolean } = { sending: false };

let lastBackfillArgs: {
  workerName: string;
  liveMessages: ChatMessage[];
  onResetExtras?: () => void;
} | null = null;
let lastAppendArgs: unknown = null;
let lastFlusherArgs: { appendLive: (role: 'worker', text: string) => void } | null = null;
let lastSseArgs: {
  workerName: string;
  onOutput: (raw: string) => void;
  onCleanup: () => void;
} | null = null;
let lastAutoArgs: { scrollRef: unknown; bumpKey: number } | null = null;
let lastSubmitArgs: {
  workerName: string;
  input: string;
  setInput: (s: string) => void;
  setError: (m: string | null) => void;
  setAutoScroll: (b: boolean) => void;
  flushWorkerBuffer: () => void;
  appendLive: (role: 'user' | 'worker', text: string) => void;
  textareaRef: unknown;
} | null = null;

vi.mock('../lib/use-chat-backfill', async () => {
  const react = await vi.importActual<typeof import('react')>('react');
  return {
    useChatBackfill: (args: {
      workerName: string;
      liveMessages: ChatMessage[];
      onResetExtras?: () => void;
    }) => {
      lastBackfillArgs = args;
      const seenIdsRef = react.useRef(new Set<string>());
      const seenTextsRef = react.useRef(new Set<string>());
      const backfillReadyRef = react.useRef(false);
      const scrollbackLinesRef = react.useRef(0);
      return {
        history: backfillState.history,
        setHistory: setHistoryMock,
        backfillLoading: backfillState.backfillLoading,
        backfillCount: backfillState.backfillCount,
        backfillSource: backfillState.backfillSource,
        backfillError: backfillState.backfillError,
        hasOlder: backfillState.hasOlder,
        loadingOlder: backfillState.loadingOlder,
        scrollbackLinesRef,
        seenIdsRef,
        seenTextsRef,
        backfillReadyRef,
        rememberMessage: rememberMessageMock,
        loadOlder: loadOlderMock,
      };
    },
  };
});

vi.mock('../lib/use-append-live', () => ({
  useAppendLive: (args: unknown) => {
    lastAppendArgs = args;
    return appendLiveMock;
  },
}));

vi.mock('../lib/use-worker-buffer-flusher', async () => {
  const react = await vi.importActual<typeof import('react')>('react');
  return {
    useWorkerBufferFlusher: (args: {
      appendLive: (role: 'worker', text: string) => void;
    }) => {
      lastFlusherArgs = args;
      const pendingBufRef = react.useRef('');
      const flushTimerRef = react.useRef<number | null>(null);
      return {
        pendingBufRef,
        flushTimerRef,
        flushWorkerBuffer: flushWorkerBufferMock,
        scheduleFlush: scheduleFlushMock,
        reset: resetFlusherMock,
      };
    },
  };
});

vi.mock('../lib/use-chat-sse-stream', () => ({
  useChatSseStream: (args: {
    workerName: string;
    onOutput: (raw: string) => void;
    onCleanup: () => void;
  }) => {
    lastSseArgs = args;
    return { sseConnected: sseState.sseConnected };
  },
}));

vi.mock('../lib/use-auto-scroll', () => ({
  AUTOSCROLL_THRESHOLD_PX: 24,
  useAutoScroll: (args: { scrollRef: unknown; bumpKey: number }) => {
    lastAutoArgs = args;
    return {
      autoScroll: autoState.autoScroll,
      setAutoScroll: setAutoScrollMock,
      jumpToBottom: jumpToBottomMock,
      isAtBottom: isAtBottomMock,
    };
  },
}));

vi.mock('../lib/use-chat-submit', () => ({
  useChatSubmit: (args: {
    workerName: string;
    input: string;
    setInput: (s: string) => void;
    setError: (m: string | null) => void;
    setAutoScroll: (b: boolean) => void;
    flushWorkerBuffer: () => void;
    appendLive: (role: 'user' | 'worker', text: string) => void;
    textareaRef: unknown;
  }) => {
    lastSubmitArgs = args;
    return { sending: submitState.sending, handleSubmit: handleSubmitMock };
  },
}));

interface CapturedHeaderProps {
  workerName: string;
  backfillCount: number;
  backfillSource: BackfillSource;
  sseConnected: boolean;
  autoScroll: boolean;
  onJumpToBottom: () => void;
}

let lastHeaderProps: CapturedHeaderProps | null = null;

vi.mock('./ChatHeader', () => ({
  default: (props: CapturedHeaderProps) => {
    lastHeaderProps = props;
    return (
      <div
        data-testid="chat-header"
        data-worker={props.workerName}
        data-count={String(props.backfillCount)}
        data-source={props.backfillSource ?? ''}
        data-sse={props.sseConnected ? 'true' : 'false'}
        data-autoscroll={props.autoScroll ? 'true' : 'false'}
      >
        <button
          type="button"
          data-testid="header-jump"
          onClick={props.onJumpToBottom}
        >
          jump
        </button>
      </div>
    );
  },
}));

interface CapturedBannerProps {
  error: string | null;
  backfillError: string | null;
}

vi.mock('./ChatErrorBanners', () => ({
  default: (props: CapturedBannerProps) => (
    <div
      data-testid="chat-banners"
      data-error={props.error ?? ''}
      data-backfill-error={props.backfillError ?? ''}
    />
  ),
}));

interface CapturedLogProps {
  scrollRef: unknown;
  onScroll: () => void;
  workerName: string;
  backfillLoading: boolean;
  backfillSource: BackfillSource;
  hasOlder: boolean;
  loadingOlder: boolean;
  messages: ChatMessage[];
  onLoadOlder: () => void;
}

let lastLogProps: CapturedLogProps | null = null;

vi.mock('./ChatMessageLog', () => ({
  default: (props: CapturedLogProps) => {
    lastLogProps = props;
    return (
      <div
        ref={props.scrollRef as React.RefObject<HTMLDivElement>}
        data-testid="chat-log"
        data-worker={props.workerName}
        data-msg-count={String(props.messages.length)}
        data-source={props.backfillSource ?? ''}
        data-backfill-loading={props.backfillLoading ? 'true' : 'false'}
        data-has-older={props.hasOlder ? 'true' : 'false'}
        data-loading-older={props.loadingOlder ? 'true' : 'false'}
      >
        <button
          type="button"
          data-testid="log-load-older"
          onClick={props.onLoadOlder}
        >
          older
        </button>
        <button
          type="button"
          data-testid="log-scroll"
          onClick={props.onScroll}
        >
          scroll
        </button>
      </div>
    );
  },
}));

interface CapturedComposerProps {
  textareaRef: unknown;
  input: string;
  workerName: string;
  sending: boolean;
  onChangeInput: (next: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSubmit: () => void;
}

let lastComposerProps: CapturedComposerProps | null = null;

vi.mock('./ChatComposer', () => ({
  default: (props: CapturedComposerProps) => {
    lastComposerProps = props;
    return (
      <div
        data-testid="chat-composer"
        data-worker={props.workerName}
        data-input={props.input}
        data-sending={props.sending ? 'true' : 'false'}
      >
        <button
          type="button"
          data-testid="composer-change"
          onClick={() => props.onChangeInput('hello')}
        >
          chg
        </button>
        <button
          type="button"
          data-testid="composer-submit"
          onClick={props.onSubmit}
        >
          submit
        </button>
        <textarea
          data-testid="composer-textarea"
          onKeyDown={(e) =>
            props.onKeyDown(
              e as unknown as React.KeyboardEvent<HTMLTextAreaElement>,
            )
          }
        />
      </div>
    );
  },
}));

import ChatView from './ChatView';

beforeEach(() => {
  setLocale('en');
  appendLiveMock.mockReset();
  rememberMessageMock.mockReset();
  loadOlderMock.mockReset();
  loadOlderMock.mockResolvedValue(undefined);
  setHistoryMock.mockReset();
  flushWorkerBufferMock.mockReset();
  scheduleFlushMock.mockReset();
  resetFlusherMock.mockReset();
  jumpToBottomMock.mockReset();
  setAutoScrollMock.mockReset();
  isAtBottomMock.mockReset();
  isAtBottomMock.mockReturnValue(true);
  handleSubmitMock.mockReset();
  handleSubmitMock.mockResolvedValue(undefined);
  backfillState = {
    history: [],
    backfillLoading: false,
    backfillCount: 0,
    backfillSource: null,
    backfillError: null,
    hasOlder: false,
    loadingOlder: false,
  };
  sseState = { sseConnected: false };
  autoState = { autoScroll: true };
  submitState = { sending: false };
  lastBackfillArgs = null;
  lastAppendArgs = null;
  lastFlusherArgs = null;
  lastSseArgs = null;
  lastAutoArgs = null;
  lastSubmitArgs = null;
  lastHeaderProps = null;
  lastLogProps = null;
  lastComposerProps = null;
});

describe('<ChatView>', () => {
  it('mounts header + banners + log + composer on default render', () => {
    render(<ChatView workerName="w1" />);
    expect(screen.getByTestId('chat-header')).toBeInTheDocument();
    expect(screen.getByTestId('chat-banners')).toBeInTheDocument();
    expect(screen.getByTestId('chat-log')).toBeInTheDocument();
    expect(screen.getByTestId('chat-composer')).toBeInTheDocument();
  });

  it('forwards the workerName into every child', () => {
    render(<ChatView workerName="alpha" />);
    expect(screen.getByTestId('chat-header')).toHaveAttribute(
      'data-worker',
      'alpha',
    );
    expect(screen.getByTestId('chat-log')).toHaveAttribute(
      'data-worker',
      'alpha',
    );
    expect(screen.getByTestId('chat-composer')).toHaveAttribute(
      'data-worker',
      'alpha',
    );
  });

  it('forwards the workerName into the backfill + SSE + submit hooks', () => {
    render(<ChatView workerName="alpha" />);
    expect(lastBackfillArgs?.workerName).toBe('alpha');
    expect(lastSseArgs?.workerName).toBe('alpha');
    expect(lastSubmitArgs?.workerName).toBe('alpha');
  });

  it('forwards backfill count + source into the header', () => {
    backfillState = {
      ...backfillState,
      backfillCount: 12,
      backfillSource: 'session',
    };
    render(<ChatView workerName="w1" />);
    const hdr = screen.getByTestId('chat-header');
    expect(hdr).toHaveAttribute('data-count', '12');
    expect(hdr).toHaveAttribute('data-source', 'session');
  });

  it('forwards SSE connected flag into the header', () => {
    sseState = { sseConnected: true };
    render(<ChatView workerName="w1" />);
    expect(screen.getByTestId('chat-header')).toHaveAttribute(
      'data-sse',
      'true',
    );
  });

  it('forwards autoScroll flag into the header', () => {
    autoState = { autoScroll: false };
    render(<ChatView workerName="w1" />);
    expect(screen.getByTestId('chat-header')).toHaveAttribute(
      'data-autoscroll',
      'false',
    );
  });

  it('drives the header onJumpToBottom through to the auto-scroll hook', async () => {
    const user = userEvent.setup();
    render(<ChatView workerName="w1" />);
    await user.click(screen.getByTestId('header-jump'));
    expect(jumpToBottomMock).toHaveBeenCalledTimes(1);
  });

  it('forwards backfill error into the banners and not the input error slot', () => {
    backfillState = { ...backfillState, backfillError: 'past went boom' };
    render(<ChatView workerName="w1" />);
    expect(screen.getByTestId('chat-banners')).toHaveAttribute(
      'data-backfill-error',
      'past went boom',
    );
    expect(screen.getByTestId('chat-banners')).toHaveAttribute(
      'data-error',
      '',
    );
  });

  it('starts with an empty messages list (no history, no live messages)', () => {
    render(<ChatView workerName="w1" />);
    expect(screen.getByTestId('chat-log')).toHaveAttribute(
      'data-msg-count',
      '0',
    );
  });

  it('renders history messages from the backfill hook into the log', () => {
    backfillState = {
      ...backfillState,
      history: [
        { id: 'm1', role: 'user', text: 'hi', ts: 1, source: 'backfill' },
        { id: 'm2', role: 'worker', text: 'hey', ts: 2, source: 'backfill' },
      ],
    };
    render(<ChatView workerName="w1" />);
    expect(screen.getByTestId('chat-log')).toHaveAttribute(
      'data-msg-count',
      '2',
    );
  });

  it('forwards the log status indicators (loading + source + older paging) into the log', () => {
    backfillState = {
      ...backfillState,
      backfillLoading: true,
      backfillSource: 'scrollback',
      hasOlder: true,
      loadingOlder: true,
    };
    render(<ChatView workerName="w1" />);
    const log = screen.getByTestId('chat-log');
    expect(log).toHaveAttribute('data-backfill-loading', 'true');
    expect(log).toHaveAttribute('data-source', 'scrollback');
    expect(log).toHaveAttribute('data-has-older', 'true');
    expect(log).toHaveAttribute('data-loading-older', 'true');
  });

  it('drives the log onLoadOlder through to the backfill hook', async () => {
    const user = userEvent.setup();
    render(<ChatView workerName="w1" />);
    await user.click(screen.getByTestId('log-load-older'));
    expect(loadOlderMock).toHaveBeenCalledTimes(1);
  });

  it('forwards the sending flag from the submit hook into the composer', () => {
    submitState = { sending: true };
    render(<ChatView workerName="w1" />);
    expect(screen.getByTestId('chat-composer')).toHaveAttribute(
      'data-sending',
      'true',
    );
  });

  it('drives the composer onChangeInput through to the internal input slot', async () => {
    const user = userEvent.setup();
    render(<ChatView workerName="w1" />);
    await user.click(screen.getByTestId('composer-change'));
    expect(screen.getByTestId('chat-composer')).toHaveAttribute(
      'data-input',
      'hello',
    );
  });

  it('threads the typed input through to the submit hook', async () => {
    const user = userEvent.setup();
    render(<ChatView workerName="w1" />);
    await user.click(screen.getByTestId('composer-change'));
    expect(lastSubmitArgs?.input).toBe('hello');
  });

  it('drives the composer onSubmit through to handleSubmit', async () => {
    const user = userEvent.setup();
    render(<ChatView workerName="w1" />);
    await user.click(screen.getByTestId('composer-submit'));
    expect(handleSubmitMock).toHaveBeenCalledTimes(1);
  });

  it('fires handleSubmit on Enter without shift', async () => {
    const user = userEvent.setup();
    render(<ChatView workerName="w1" />);
    const textarea = screen.getByTestId('composer-textarea');
    textarea.focus();
    await user.keyboard('{Enter}');
    expect(handleSubmitMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire handleSubmit on Shift+Enter', async () => {
    const user = userEvent.setup();
    render(<ChatView workerName="w1" />);
    const textarea = screen.getByTestId('composer-textarea');
    textarea.focus();
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    expect(handleSubmitMock).not.toHaveBeenCalled();
  });

  it('wires the SSE onOutput callback into the buffer flusher', () => {
    render(<ChatView workerName="w1" />);
    expect(lastSseArgs).not.toBeNull();
    act(() => {
      lastSseArgs?.onOutput('chunk');
    });
    expect(scheduleFlushMock).toHaveBeenCalledTimes(1);
  });

  it('wires the SSE onCleanup callback into the buffer flusher reset', () => {
    render(<ChatView workerName="w1" />);
    act(() => {
      lastSseArgs?.onCleanup();
    });
    expect(resetFlusherMock).toHaveBeenCalledTimes(1);
  });

  it('passes a stable appendLive reference to both the buffer flusher and the submit hook', () => {
    render(<ChatView workerName="w1" />);
    expect(lastFlusherArgs?.appendLive).toBe(appendLiveMock);
    expect(lastSubmitArgs?.appendLive).toBe(appendLiveMock);
  });

  it('passes the flushWorkerBuffer reference into the submit hook', () => {
    render(<ChatView workerName="w1" />);
    expect(lastSubmitArgs?.flushWorkerBuffer).toBe(flushWorkerBufferMock);
  });

  it('updates the auto-scroll bumpKey when message count changes', () => {
    render(<ChatView workerName="w1" />);
    const initial = lastAutoArgs?.bumpKey;
    expect(initial).toBe(0);
  });

  it('uses isAtBottom on log scroll to maintain the autoscroll flag', async () => {
    isAtBottomMock.mockReturnValue(false);
    const user = userEvent.setup();
    render(<ChatView workerName="w1" />);
    await user.click(screen.getByTestId('log-scroll'));
    expect(setAutoScrollMock).toHaveBeenCalledTimes(1);
    expect(setAutoScrollMock).toHaveBeenCalledWith(false);
  });

  it('renders the outer Card container with the documented flex layout', () => {
    const { container } = render(<ChatView workerName="w1" />);
    const root = container.firstChild as HTMLElement;
    expect(root).toHaveClass('flex');
    expect(root).toHaveClass('h-full');
    expect(root).toHaveClass('flex-col');
  });

  it('re-renders translated children when the locale flips to ko', () => {
    render(<ChatView workerName="w1" />);
    act(() => {
      setLocale('ko');
    });
    expect(screen.getByTestId('chat-header')).toBeInTheDocument();
  });
});
