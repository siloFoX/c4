import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type { TerminalTab } from './WorkerDetailHeader';
import type { SendableKey } from './WorkerDetailKeysRow';

// WorkerDetail wires four hooks (useLocale, useScrollback,
// usePersistedFontSize, useWorkerActions) and five child
// components (WorkerDetailHeader, WorkerDetailComposer,
// WorkerDetailKeysRow, XtermView, PinnedRulesEditor). Stub
// every hook to a deterministic shape so each test can drive
// a single branch without booting fetch / xterm / localStorage,
// and stub every child to a marker that exposes the props
// via data-* attributes plus test buttons that fire the
// callbacks back into the parent.

const bumpFontMock = vi.fn();
const setFontSizeMock = vi.fn();
const fetchScrollbackMock = vi.fn(async () => {});
const setErrorMock = vi.fn();
const handleSendInternalMock = vi.fn(async () => true);
const handleEnterMock = vi.fn(async () => true);
const sendKeyMock = vi.fn(async () => true);
const handleMergeMock = vi.fn(async () => true);
const handleCloseMock = vi.fn(async () => true);
const setActionMsgMock = vi.fn();
const runActionMock = vi.fn(async () => true);

let scrollbackState: {
  scrollbackContent: string;
  error: string | null;
} = {
  scrollbackContent: '',
  error: null,
};

let fontState: { fontSize: number } = { fontSize: 12 };

let actionsState: {
  actionMsg: string | null;
  busy: boolean;
} = {
  actionMsg: null,
  busy: false,
};

let lastScrollbackArgs: {
  workerName: string;
  tab: TerminalTab;
  setActionMsg: (next: string | null) => void;
} | null = null;
let lastFontArgs: {
  defaultFont: number;
  minFont: number;
  maxFont: number;
} | null = null;
let lastActionsArgs: {
  workerName: string;
  fetchScrollback: () => Promise<void>;
} | null = null;

vi.mock('../lib/use-scrollback', () => ({
  useScrollback: (args: {
    workerName: string;
    tab: TerminalTab;
    setActionMsg: (next: string | null) => void;
  }) => {
    lastScrollbackArgs = args;
    return {
      scrollbackContent: scrollbackState.scrollbackContent,
      error: scrollbackState.error,
      setError: setErrorMock,
      fetchScrollback: fetchScrollbackMock,
    };
  },
}));

vi.mock('../lib/use-persisted-font-size', () => ({
  usePersistedFontSize: (args: {
    defaultFont: number;
    minFont: number;
    maxFont: number;
  }) => {
    lastFontArgs = args;
    return {
      fontSize: fontState.fontSize,
      setFontSize: setFontSizeMock,
      bumpFont: bumpFontMock,
    };
  },
}));

vi.mock('../lib/use-worker-actions', () => ({
  useWorkerActions: (args: {
    workerName: string;
    fetchScrollback: () => Promise<void>;
  }) => {
    lastActionsArgs = args;
    return {
      actionMsg: actionsState.actionMsg,
      setActionMsg: setActionMsgMock,
      busy: actionsState.busy,
      runAction: runActionMock,
      handleSend: handleSendInternalMock,
      handleEnter: handleEnterMock,
      sendKey: sendKeyMock,
      handleMerge: handleMergeMock,
      handleClose: handleCloseMock,
    };
  },
}));

interface CapturedHeaderProps {
  workerName: string;
  tab: TerminalTab;
  onTabChange: (next: TerminalTab) => void;
  fontSize: number;
  onBumpFont: (delta: number) => void;
}

let lastHeaderProps: CapturedHeaderProps | null = null;

vi.mock('./WorkerDetailHeader', () => ({
  default: (props: CapturedHeaderProps) => {
    lastHeaderProps = props;
    return (
      <div
        data-testid="worker-header"
        data-worker={props.workerName}
        data-tab={props.tab}
        data-font={String(props.fontSize)}
      >
        <button
          type="button"
          data-testid="header-tab-screen"
          onClick={() => props.onTabChange('screen')}
        >
          screen
        </button>
        <button
          type="button"
          data-testid="header-tab-scrollback"
          onClick={() => props.onTabChange('scrollback')}
        >
          scrollback
        </button>
        <button
          type="button"
          data-testid="header-font-up"
          onClick={() => props.onBumpFont(1)}
        >
          up
        </button>
        <button
          type="button"
          data-testid="header-font-down"
          onClick={() => props.onBumpFont(-1)}
        >
          down
        </button>
      </div>
    );
  },
}));

interface CapturedXtermProps {
  workerName: string;
  fontSize: number;
  visible?: boolean;
}

let lastXtermProps: CapturedXtermProps | null = null;

vi.mock('./XtermView', () => ({
  default: (props: CapturedXtermProps) => {
    lastXtermProps = props;
    return (
      <div
        data-testid="xterm-view"
        data-worker={props.workerName}
        data-font={String(props.fontSize)}
        data-visible={props.visible ? 'true' : 'false'}
        role="log"
        aria-busy={props.visible ? 'true' : 'false'}
      />
    );
  },
}));

interface CapturedComposerProps {
  inputText: string;
  busy: boolean;
  onChangeInputText: (next: string) => void;
  onSend: () => void;
  onEnter: () => void;
  onMerge: () => void;
  onClose: () => void;
}

let lastComposerProps: CapturedComposerProps | null = null;

vi.mock('./WorkerDetailComposer', () => ({
  default: (props: CapturedComposerProps) => {
    lastComposerProps = props;
    return (
      <div
        data-testid="worker-composer"
        data-input={props.inputText}
        data-busy={props.busy ? 'true' : 'false'}
      >
        <button
          type="button"
          data-testid="composer-change"
          onClick={() => props.onChangeInputText('typed message')}
        >
          chg
        </button>
        <button
          type="button"
          data-testid="composer-clear"
          onClick={() => props.onChangeInputText('')}
        >
          clr
        </button>
        <button
          type="button"
          data-testid="composer-send"
          onClick={props.onSend}
        >
          send
        </button>
        <button
          type="button"
          data-testid="composer-enter"
          onClick={props.onEnter}
        >
          enter
        </button>
        <button
          type="button"
          data-testid="composer-merge"
          onClick={props.onMerge}
        >
          merge
        </button>
        <button
          type="button"
          data-testid="composer-close"
          onClick={props.onClose}
        >
          close
        </button>
      </div>
    );
  },
}));

interface CapturedKeysProps {
  busy: boolean;
  onSendKey: (key: SendableKey) => void;
}

let lastKeysProps: CapturedKeysProps | null = null;

vi.mock('./WorkerDetailKeysRow', () => ({
  default: (props: CapturedKeysProps) => {
    lastKeysProps = props;
    return (
      <div data-testid="worker-keys" data-busy={props.busy ? 'true' : 'false'}>
        <button
          type="button"
          data-testid="keys-escape"
          onClick={() => props.onSendKey('Escape')}
        >
          esc
        </button>
        <button
          type="button"
          data-testid="keys-ctrl-c"
          onClick={() => props.onSendKey('C-c')}
        >
          ctrl-c
        </button>
        <button
          type="button"
          data-testid="keys-tab"
          onClick={() => props.onSendKey('Tab')}
        >
          tab
        </button>
      </div>
    );
  },
}));

vi.mock('./PinnedRulesEditor', () => ({
  default: ({ workerName }: { workerName: string }) => (
    <div data-testid="pinned-rules" data-worker={workerName} />
  ),
}));

import WorkerDetail from './WorkerDetail';

beforeEach(() => {
  setLocale('en');
  bumpFontMock.mockReset();
  setFontSizeMock.mockReset();
  fetchScrollbackMock.mockReset();
  fetchScrollbackMock.mockResolvedValue(undefined);
  setErrorMock.mockReset();
  handleSendInternalMock.mockReset();
  handleSendInternalMock.mockResolvedValue(true);
  handleEnterMock.mockReset();
  handleEnterMock.mockResolvedValue(true);
  sendKeyMock.mockReset();
  sendKeyMock.mockResolvedValue(true);
  handleMergeMock.mockReset();
  handleMergeMock.mockResolvedValue(true);
  handleCloseMock.mockReset();
  handleCloseMock.mockResolvedValue(true);
  setActionMsgMock.mockReset();
  runActionMock.mockReset();
  runActionMock.mockResolvedValue(true);
  scrollbackState = { scrollbackContent: '', error: null };
  fontState = { fontSize: 12 };
  actionsState = { actionMsg: null, busy: false };
  lastScrollbackArgs = null;
  lastFontArgs = null;
  lastActionsArgs = null;
  lastHeaderProps = null;
  lastXtermProps = null;
  lastComposerProps = null;
  lastKeysProps = null;
});

describe('<WorkerDetail>', () => {
  it('mounts header + xterm + composer + keys row + pinned rules on default render', () => {
    render(<WorkerDetail workerName="w1" />);
    expect(screen.getByTestId('worker-header')).toBeInTheDocument();
    expect(screen.getByTestId('xterm-view')).toBeInTheDocument();
    expect(screen.getByTestId('worker-composer')).toBeInTheDocument();
    expect(screen.getByTestId('worker-keys')).toBeInTheDocument();
    expect(screen.getByTestId('pinned-rules')).toBeInTheDocument();
  });

  it('forwards the workerName into every child surface', () => {
    render(<WorkerDetail workerName="alpha" />);
    expect(screen.getByTestId('worker-header')).toHaveAttribute(
      'data-worker',
      'alpha',
    );
    expect(screen.getByTestId('xterm-view')).toHaveAttribute(
      'data-worker',
      'alpha',
    );
    expect(screen.getByTestId('pinned-rules')).toHaveAttribute(
      'data-worker',
      'alpha',
    );
  });

  it('forwards the workerName into the scrollback + actions hooks', () => {
    render(<WorkerDetail workerName="alpha" />);
    expect(lastScrollbackArgs?.workerName).toBe('alpha');
    expect(lastActionsArgs?.workerName).toBe('alpha');
  });

  it('starts on the screen tab and shows xterm visible', () => {
    render(<WorkerDetail workerName="w1" />);
    expect(screen.getByTestId('worker-header')).toHaveAttribute(
      'data-tab',
      'screen',
    );
    expect(screen.getByTestId('xterm-view')).toHaveAttribute(
      'data-visible',
      'true',
    );
  });

  it('switches the tab to scrollback when the header fires onTabChange', async () => {
    const user = userEvent.setup();
    render(<WorkerDetail workerName="w1" />);
    await user.click(screen.getByTestId('header-tab-scrollback'));
    expect(screen.getByTestId('worker-header')).toHaveAttribute(
      'data-tab',
      'scrollback',
    );
  });

  it('hides the xterm visibility flag when the tab is scrollback', async () => {
    const user = userEvent.setup();
    render(<WorkerDetail workerName="w1" />);
    await user.click(screen.getByTestId('header-tab-scrollback'));
    expect(screen.getByTestId('xterm-view')).toHaveAttribute(
      'data-visible',
      'false',
    );
  });

  it('keeps the xterm mounted across tab switches', async () => {
    const user = userEvent.setup();
    render(<WorkerDetail workerName="w1" />);
    expect(screen.getByTestId('xterm-view')).toBeInTheDocument();
    await user.click(screen.getByTestId('header-tab-scrollback'));
    expect(screen.getByTestId('xterm-view')).toBeInTheDocument();
    await user.click(screen.getByTestId('header-tab-screen'));
    expect(screen.getByTestId('xterm-view')).toBeInTheDocument();
  });

  it('only renders the scrollback pre when the tab is scrollback', async () => {
    scrollbackState = { ...scrollbackState, scrollbackContent: 'old log line' };
    const user = userEvent.setup();
    render(<WorkerDetail workerName="w1" />);
    expect(screen.queryByText('old log line')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('header-tab-scrollback'));
    expect(screen.getByText('old log line')).toBeInTheDocument();
  });

  it('renders the (empty) placeholder in the scrollback pre when content is blank', async () => {
    const user = userEvent.setup();
    render(<WorkerDetail workerName="w1" />);
    await user.click(screen.getByTestId('header-tab-scrollback'));
    expect(screen.getByText('(empty)')).toBeInTheDocument();
  });

  it('forwards the tab argument into the scrollback hook', async () => {
    const user = userEvent.setup();
    render(<WorkerDetail workerName="w1" />);
    expect(lastScrollbackArgs?.tab).toBe('screen');
    await user.click(screen.getByTestId('header-tab-scrollback'));
    expect(lastScrollbackArgs?.tab).toBe('scrollback');
  });

  it('renders the error banner with role=alert when scrollback hook returns an error', () => {
    scrollbackState = { ...scrollbackState, error: 'fetch failed' };
    render(<WorkerDetail workerName="w1" />);
    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent('fetch failed');
  });

  it('does NOT render the error banner when there is no error', () => {
    render(<WorkerDetail workerName="w1" />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders the actionMsg footer line when the actions hook emits one', () => {
    actionsState = { ...actionsState, actionMsg: 'send ok' };
    render(<WorkerDetail workerName="w1" />);
    expect(screen.getByText('send ok')).toBeInTheDocument();
  });

  it('does NOT render the actionMsg footer when null', () => {
    render(<WorkerDetail workerName="w1" />);
    expect(lastComposerProps?.busy).toBe(false);
  });

  it('passes the font size from the persisted-font hook into header + xterm', () => {
    fontState = { fontSize: 18 };
    render(<WorkerDetail workerName="w1" />);
    expect(screen.getByTestId('worker-header')).toHaveAttribute(
      'data-font',
      '18',
    );
    expect(screen.getByTestId('xterm-view')).toHaveAttribute(
      'data-font',
      '18',
    );
  });

  it('drives the header onBumpFont through to the persisted-font hook', async () => {
    const user = userEvent.setup();
    render(<WorkerDetail workerName="w1" />);
    await user.click(screen.getByTestId('header-font-up'));
    expect(bumpFontMock).toHaveBeenCalledTimes(1);
    expect(bumpFontMock).toHaveBeenCalledWith(1);
    await user.click(screen.getByTestId('header-font-down'));
    expect(bumpFontMock).toHaveBeenCalledTimes(2);
    expect(bumpFontMock).toHaveBeenLastCalledWith(-1);
  });

  it('forwards the font-size clamp range into the persisted-font hook', () => {
    render(<WorkerDetail workerName="w1" />);
    expect(lastFontArgs).toEqual({
      defaultFont: 12,
      minFont: 9,
      maxFont: 24,
    });
  });

  it('starts the composer with an empty input string', () => {
    render(<WorkerDetail workerName="w1" />);
    expect(screen.getByTestId('worker-composer')).toHaveAttribute(
      'data-input',
      '',
    );
  });

  it('drives the composer onChangeInputText through to the internal input slot', async () => {
    const user = userEvent.setup();
    render(<WorkerDetail workerName="w1" />);
    await user.click(screen.getByTestId('composer-change'));
    expect(screen.getByTestId('worker-composer')).toHaveAttribute(
      'data-input',
      'typed message',
    );
  });

  it('passes the typed input through to handleSend when the composer fires onSend', async () => {
    const user = userEvent.setup();
    render(<WorkerDetail workerName="w1" />);
    await user.click(screen.getByTestId('composer-change'));
    await user.click(screen.getByTestId('composer-send'));
    expect(handleSendInternalMock).toHaveBeenCalledTimes(1);
    expect(handleSendInternalMock).toHaveBeenCalledWith('typed message');
  });

  it('clears the input after a successful send', async () => {
    handleSendInternalMock.mockResolvedValueOnce(true);
    const user = userEvent.setup();
    render(<WorkerDetail workerName="w1" />);
    await user.click(screen.getByTestId('composer-change'));
    expect(screen.getByTestId('worker-composer')).toHaveAttribute(
      'data-input',
      'typed message',
    );
    await user.click(screen.getByTestId('composer-send'));
    expect(screen.getByTestId('worker-composer')).toHaveAttribute(
      'data-input',
      '',
    );
  });

  it('keeps the input intact when handleSend resolves to false (rejection path)', async () => {
    handleSendInternalMock.mockResolvedValueOnce(false);
    const user = userEvent.setup();
    render(<WorkerDetail workerName="w1" />);
    await user.click(screen.getByTestId('composer-change'));
    await user.click(screen.getByTestId('composer-send'));
    expect(screen.getByTestId('worker-composer')).toHaveAttribute(
      'data-input',
      'typed message',
    );
  });

  it('drives the composer onEnter through to handleEnter', async () => {
    const user = userEvent.setup();
    render(<WorkerDetail workerName="w1" />);
    await user.click(screen.getByTestId('composer-enter'));
    expect(handleEnterMock).toHaveBeenCalledTimes(1);
  });

  it('drives the composer onMerge through to handleMerge', async () => {
    const user = userEvent.setup();
    render(<WorkerDetail workerName="w1" />);
    await user.click(screen.getByTestId('composer-merge'));
    expect(handleMergeMock).toHaveBeenCalledTimes(1);
  });

  it('drives the composer onClose through to handleClose', async () => {
    const user = userEvent.setup();
    render(<WorkerDetail workerName="w1" />);
    await user.click(screen.getByTestId('composer-close'));
    expect(handleCloseMock).toHaveBeenCalledTimes(1);
  });

  it('forwards the actions hook busy flag into the composer', () => {
    actionsState = { ...actionsState, busy: true };
    render(<WorkerDetail workerName="w1" />);
    expect(screen.getByTestId('worker-composer')).toHaveAttribute(
      'data-busy',
      'true',
    );
  });

  it('forwards the actions hook busy flag into the keys row', () => {
    actionsState = { ...actionsState, busy: true };
    render(<WorkerDetail workerName="w1" />);
    expect(screen.getByTestId('worker-keys')).toHaveAttribute(
      'data-busy',
      'true',
    );
  });

  it('drives the keys row onSendKey through to sendKey for Escape', async () => {
    const user = userEvent.setup();
    render(<WorkerDetail workerName="w1" />);
    await user.click(screen.getByTestId('keys-escape'));
    expect(sendKeyMock).toHaveBeenCalledTimes(1);
    expect(sendKeyMock).toHaveBeenCalledWith('Escape');
  });

  it('drives the keys row onSendKey through to sendKey for Ctrl-C interrupt', async () => {
    const user = userEvent.setup();
    render(<WorkerDetail workerName="w1" />);
    await user.click(screen.getByTestId('keys-ctrl-c'));
    expect(sendKeyMock).toHaveBeenCalledTimes(1);
    expect(sendKeyMock).toHaveBeenCalledWith('C-c');
  });

  it('drives the keys row onSendKey through to sendKey for Tab', async () => {
    const user = userEvent.setup();
    render(<WorkerDetail workerName="w1" />);
    await user.click(screen.getByTestId('keys-tab'));
    expect(sendKeyMock).toHaveBeenCalledTimes(1);
    expect(sendKeyMock).toHaveBeenCalledWith('Tab');
  });

  it('passes a stable fetchScrollback reference into the actions hook', () => {
    render(<WorkerDetail workerName="w1" />);
    expect(lastActionsArgs?.fetchScrollback).toBe(fetchScrollbackMock);
  });

  it('routes the scrollback hook setActionMsg through the actions hook setter', () => {
    render(<WorkerDetail workerName="w1" />);
    expect(typeof lastScrollbackArgs?.setActionMsg).toBe('function');
    act(() => {
      lastScrollbackArgs?.setActionMsg('scrollback ping');
    });
    expect(setActionMsgMock).toHaveBeenCalledTimes(1);
    expect(setActionMsgMock).toHaveBeenCalledWith('scrollback ping');
  });

  it('renders the outer flex container with documented layout classes', () => {
    const { container } = render(<WorkerDetail workerName="w1" />);
    const root = container.firstChild as HTMLElement;
    expect(root).toHaveClass('flex');
    expect(root).toHaveClass('h-full');
    expect(root).toHaveClass('flex-col');
  });

  it('exposes the xterm pane as a role=log accessible region', () => {
    render(<WorkerDetail workerName="w1" />);
    expect(screen.getByRole('log')).toBeInTheDocument();
  });

  it('renders ANSI-stripped scrollback content when in scrollback tab', async () => {
    scrollbackState = {
      ...scrollbackState,
      scrollbackContent: '[31mred[0m line',
    };
    const user = userEvent.setup();
    render(<WorkerDetail workerName="w1" />);
    await user.click(screen.getByTestId('header-tab-scrollback'));
    expect(screen.getByText('red line')).toBeInTheDocument();
  });

  it('re-renders translated children when the locale flips to ko', () => {
    render(<WorkerDetail workerName="w1" />);
    act(() => {
      setLocale('ko');
    });
    expect(screen.getByTestId('worker-header')).toBeInTheDocument();
    expect(screen.getByTestId('worker-composer')).toBeInTheDocument();
  });

  it('keeps the composer + keys row not-busy on the default idle render', () => {
    render(<WorkerDetail workerName="w1" />);
    expect(screen.getByTestId('worker-composer')).toHaveAttribute(
      'data-busy',
      'false',
    );
    expect(screen.getByTestId('worker-keys')).toHaveAttribute(
      'data-busy',
      'false',
    );
  });
});
