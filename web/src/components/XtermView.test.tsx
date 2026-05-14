import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';

// XtermView is the WorkerDetail terminal pane. The heavy lifting
// (real DOM canvas, ResizeObserver, SSE wire, theme tracking,
// auto-fit, search hotkey, font size, etc.) all lives in
// extracted hooks + the @xterm/xterm classes. Each of those has
// (or will have) its own unit coverage; this file mocks them at
// the module boundary so we can assert what XtermView itself
// owns: lifecycle wiring (constructor + open + dispose), prop
// forwarding to XtermStatusBar (statusLabel derivation,
// search-open + query state, callbacks), the visible=false
// invisible-class branch, the error banner, and the localized
// wrapper aria-label.

// ---- vi.hoisted bag (vi.mock factories run before module top-level) ----

const hoisted = vi.hoisted(() => {
  interface TerminalCtorArgs {
    fontSize?: number;
    fontFamily?: string;
    lineHeight?: number;
    scrollback?: number;
    cursorStyle?: string;
    cursorBlink?: boolean;
    convertEol?: boolean;
    allowProposedApi?: boolean;
    theme?: unknown;
  }

  const state: {
    lastTerminalArgs: TerminalCtorArgs | null;
    lastTerminalInstance: InstanceType<typeof MockTerminal> | null;
    bufferChangeHandler: (() => void) | null;
    lastSseHookArgs: { workerName: string } | null;
    lastErrorFromHook: ((msg: string) => void) | null;
    sseConnectedNext: boolean;
    lastStatusBarProps: StatusBarPropsShape | null;
  } = {
    lastTerminalArgs: null,
    lastTerminalInstance: null,
    bufferChangeHandler: null,
    lastSseHookArgs: null,
    lastErrorFromHook: null,
    sseConnectedNext: true,
    lastStatusBarProps: null,
  };

  interface StatusBarPropsShape {
    statusLabel: string;
    searchOpen: boolean;
    onToggleSearch: () => void;
    searchQuery: string;
    onSearchQuery: (next: string) => void;
    onRunSearch: (direction: 'next' | 'prev') => void;
    onCloseSearch: () => void;
  }

  const loadAddonMock = vi.fn();
  const openMock = vi.fn();
  const disposeMock = vi.fn();
  const writeMock = vi.fn();
  const autofitScheduleFitMock = vi.fn();

  class MockTerminal {
    public buffer = {
      active: { type: 'normal' as 'normal' | 'alternate' },
      onBufferChange: (cb: () => void) => {
        state.bufferChangeHandler = cb;
        return { dispose: vi.fn() };
      },
    };
    public options: TerminalCtorArgs;
    constructor(opts: TerminalCtorArgs) {
      this.options = opts;
      state.lastTerminalArgs = opts;
      state.lastTerminalInstance = this;
    }
    loadAddon(addon: unknown) {
      loadAddonMock(addon);
    }
    open(el: HTMLElement) {
      openMock(el);
    }
    dispose() {
      disposeMock();
    }
    write(payload: string) {
      writeMock(payload);
    }
  }

  class MockFitAddon {
    fit = vi.fn();
  }

  class MockSearchAddon {
    findNext = vi.fn();
    findPrevious = vi.fn();
  }

  class MockWebLinksAddon {}

  return {
    state,
    loadAddonMock,
    openMock,
    disposeMock,
    writeMock,
    autofitScheduleFitMock,
    MockTerminal,
    MockFitAddon,
    MockSearchAddon,
    MockWebLinksAddon,
  };
});

// ---- @xterm/xterm + addon mocks --------------------------------

vi.mock('@xterm/xterm', () => ({
  Terminal: hoisted.MockTerminal,
}));
vi.mock('@xterm/addon-fit', () => ({
  FitAddon: hoisted.MockFitAddon,
}));
vi.mock('@xterm/addon-search', () => ({
  SearchAddon: hoisted.MockSearchAddon,
}));
vi.mock('@xterm/addon-web-links', () => ({
  WebLinksAddon: hoisted.MockWebLinksAddon,
}));
vi.mock('@xterm/xterm/css/xterm.css', () => ({}));

// ---- inner hook mocks ------------------------------------------

vi.mock('../lib/use-terminal-sse-stream', () => ({
  useTerminalSseStream: (args: {
    workerName: string;
    onError: (msg: string) => void;
  }) => {
    hoisted.state.lastSseHookArgs = { workerName: args.workerName };
    hoisted.state.lastErrorFromHook = args.onError;
    return { sseConnected: hoisted.state.sseConnectedNext };
  },
}));

vi.mock('../lib/use-xterm-autofit', () => ({
  useXtermAutofit: () => ({
    fitTimerRef: { current: null },
    lastResizeRef: { current: null },
    scheduleFit: hoisted.autofitScheduleFitMock,
  }),
}));

vi.mock('../lib/use-xterm-theme-tracking', () => ({
  useXtermThemeTracking: vi.fn(),
}));

vi.mock('../lib/use-xterm-resize-fit', () => ({
  useXtermResizeFit: vi.fn(),
}));

vi.mock('../lib/use-xterm-search-hotkey', () => ({
  useXtermSearchHotkey: vi.fn(),
}));

vi.mock('../lib/use-xterm-font-size', () => ({
  useXtermFontSize: vi.fn(),
}));

vi.mock('../lib/xterm-theme', () => ({
  buildXtermTheme: () => ({ background: '#000' }),
}));

// ---- XtermStatusBar child marker -------------------------------

interface StatusBarProps {
  statusLabel: string;
  searchOpen: boolean;
  onToggleSearch: () => void;
  searchQuery: string;
  onSearchQuery: (next: string) => void;
  onRunSearch: (direction: 'next' | 'prev') => void;
  onCloseSearch: () => void;
}

vi.mock('./XtermStatusBar', () => ({
  default: (props: StatusBarProps) => {
    hoisted.state.lastStatusBarProps = props;
    return (
      <div
        data-testid="status-bar"
        data-status-label={props.statusLabel}
        data-search-open={props.searchOpen ? 'true' : 'false'}
        data-search-query={props.searchQuery}
      >
        <button
          type="button"
          data-testid="status-toggle-search"
          onClick={props.onToggleSearch}
        >
          toggle
        </button>
        <button
          type="button"
          data-testid="status-close-search"
          onClick={props.onCloseSearch}
        >
          close
        </button>
        <button
          type="button"
          data-testid="status-run-next"
          onClick={() => props.onRunSearch('next')}
        >
          next
        </button>
        <button
          type="button"
          data-testid="status-run-prev"
          onClick={() => props.onRunSearch('prev')}
        >
          prev
        </button>
        <input
          data-testid="status-input"
          value={props.searchQuery}
          onChange={(e) => props.onSearchQuery(e.target.value)}
        />
      </div>
    );
  },
}));

import XtermView from './XtermView';

beforeEach(() => {
  setLocale('en');
  hoisted.state.lastTerminalArgs = null;
  hoisted.state.lastTerminalInstance = null;
  hoisted.state.bufferChangeHandler = null;
  hoisted.state.lastSseHookArgs = null;
  hoisted.state.lastErrorFromHook = null;
  hoisted.state.sseConnectedNext = true;
  hoisted.state.lastStatusBarProps = null;
  hoisted.loadAddonMock.mockClear();
  hoisted.openMock.mockClear();
  hoisted.disposeMock.mockClear();
  hoisted.writeMock.mockClear();
  hoisted.autofitScheduleFitMock.mockClear();
});

function renderView(over: { workerName?: string; fontSize?: number; visible?: boolean } = {}) {
  const props = {
    workerName: over.workerName ?? 'demo-worker',
    fontSize: over.fontSize ?? 14,
    visible: over.visible,
  };
  const utils = render(<XtermView {...props} />);
  return { ...utils, props };
}

describe('<XtermView>', () => {
  // ---- DOM structure --------------------------------------------

  it('renders a wrapper carrying the localized Terminal aria-label', () => {
    renderView();
    expect(screen.getByLabelText('Terminal')).toBeInTheDocument();
  });

  it('renders the XtermStatusBar child marker', () => {
    renderView();
    expect(screen.getByTestId('status-bar')).toBeInTheDocument();
  });

  it('renders the terminal container as a focusable div (tabIndex=0)', () => {
    const { container } = renderView();
    const focusable = container.querySelector('div[tabindex="0"]');
    expect(focusable).not.toBeNull();
  });

  // ---- @xterm Terminal lifecycle --------------------------------

  it('constructs a Terminal exactly once on mount', () => {
    renderView();
    expect(hoisted.state.lastTerminalInstance).not.toBeNull();
  });

  it('forwards the fontSize prop into the Terminal constructor options', () => {
    renderView({ fontSize: 17 });
    expect(hoisted.state.lastTerminalArgs?.fontSize).toBe(17);
  });

  it('applies the static Terminal options (scrollback, cursorStyle, cursorBlink)', () => {
    renderView();
    expect(hoisted.state.lastTerminalArgs?.scrollback).toBe(5000);
    expect(hoisted.state.lastTerminalArgs?.cursorStyle).toBe('block');
    expect(hoisted.state.lastTerminalArgs?.cursorBlink).toBe(false);
  });

  it('loads three addons (fit + search + web-links) on mount', () => {
    renderView();
    expect(hoisted.loadAddonMock).toHaveBeenCalledTimes(3);
  });

  it('opens the terminal into the focusable container element', () => {
    renderView();
    expect(hoisted.openMock).toHaveBeenCalledTimes(1);
    const target = hoisted.openMock.mock.calls[0]?.[0] as HTMLElement;
    expect(target).toBeInstanceOf(HTMLElement);
    expect(target.tagName).toBe('DIV');
  });

  it('disposes the terminal on unmount', () => {
    const { unmount } = renderView();
    expect(hoisted.disposeMock).not.toHaveBeenCalled();
    unmount();
    expect(hoisted.disposeMock).toHaveBeenCalledTimes(1);
  });

  // ---- SSE hook wiring ------------------------------------------

  it('wires useTerminalSseStream with the workerName prop', () => {
    renderView({ workerName: 'pipeline-7' });
    expect(hoisted.state.lastSseHookArgs?.workerName).toBe('pipeline-7');
  });

  it('forwards "disconnected" to the status bar when sseConnected=false', () => {
    hoisted.state.sseConnectedNext = false;
    renderView();
    expect(hoisted.state.lastStatusBarProps?.statusLabel).toBe('disconnected');
  });

  it('forwards "normal" to the status bar when sseConnected=true and buffer is normal', () => {
    hoisted.state.sseConnectedNext = true;
    renderView();
    expect(hoisted.state.lastStatusBarProps?.statusLabel).toBe('normal');
  });

  it('forwards "alt-screen" to the status bar when the buffer flips to alternate', () => {
    hoisted.state.sseConnectedNext = true;
    renderView();
    expect(hoisted.state.bufferChangeHandler).not.toBeNull();
    expect(hoisted.state.lastTerminalInstance).not.toBeNull();
    if (hoisted.state.lastTerminalInstance) {
      hoisted.state.lastTerminalInstance.buffer.active.type = 'alternate';
      act(() => {
        hoisted.state.bufferChangeHandler?.();
      });
    }
    expect(hoisted.state.lastStatusBarProps?.statusLabel).toBe('alt-screen');
  });

  // ---- error banner branch --------------------------------------

  it('does NOT render the error banner when no SSE error has fired', () => {
    renderView();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders the error banner verbatim when the SSE hook reports a failure', () => {
    renderView();
    expect(hoisted.state.lastErrorFromHook).not.toBeNull();
    act(() => {
      hoisted.state.lastErrorFromHook?.('boom: SecurityError');
    });
    const banner = screen.getByRole('alert');
    expect(banner).toHaveTextContent('boom: SecurityError');
  });

  // ---- visible flag ---------------------------------------------

  it('does NOT apply the invisible class when visible defaults to true', () => {
    const { container } = renderView();
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).not.toMatch(/\binvisible\b/);
  });

  it('does NOT apply the invisible class when visible=true is passed', () => {
    const { container } = renderView({ visible: true });
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).not.toMatch(/\binvisible\b/);
  });

  it('applies the invisible class when visible=false', () => {
    const { container } = renderView({ visible: false });
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toMatch(/\binvisible\b/);
  });

  // ---- status-bar callback wiring -------------------------------

  it('seeds the status bar with searchOpen=false / empty query on first render', () => {
    renderView();
    expect(hoisted.state.lastStatusBarProps?.searchOpen).toBe(false);
    expect(hoisted.state.lastStatusBarProps?.searchQuery).toBe('');
  });

  it('flips searchOpen to true when the toggle callback fires', async () => {
    renderView();
    const user = userEvent.setup();
    await user.click(screen.getByTestId('status-toggle-search'));
    expect(hoisted.state.lastStatusBarProps?.searchOpen).toBe(true);
  });

  it('flips searchOpen back to false when the close callback fires', async () => {
    renderView();
    const user = userEvent.setup();
    await user.click(screen.getByTestId('status-toggle-search'));
    expect(hoisted.state.lastStatusBarProps?.searchOpen).toBe(true);
    await user.click(screen.getByTestId('status-close-search'));
    expect(hoisted.state.lastStatusBarProps?.searchOpen).toBe(false);
  });

  it('updates the searchQuery when the status bar onSearchQuery fires', async () => {
    renderView();
    const user = userEvent.setup();
    await user.click(screen.getByTestId('status-toggle-search'));
    const input = screen.getByTestId('status-input');
    await user.type(input, 'foo');
    expect(hoisted.state.lastStatusBarProps?.searchQuery).toBe('foo');
  });

  it('runs SearchAddon.findNext when onRunSearch("next") fires with a non-empty query', async () => {
    renderView();
    const user = userEvent.setup();
    await user.click(screen.getByTestId('status-toggle-search'));
    await user.type(screen.getByTestId('status-input'), 'needle');
    await user.click(screen.getByTestId('status-run-next'));
    const search = hoisted.loadAddonMock.mock.calls
      .map((c) => c[0])
      .find((a) => a instanceof hoisted.MockSearchAddon) as
      | InstanceType<typeof hoisted.MockSearchAddon>
      | undefined;
    expect(search).toBeDefined();
    expect(search?.findNext).toHaveBeenCalledWith('needle');
    expect(search?.findPrevious).not.toHaveBeenCalled();
  });

  it('runs SearchAddon.findPrevious when onRunSearch("prev") fires with a non-empty query', async () => {
    renderView();
    const user = userEvent.setup();
    await user.click(screen.getByTestId('status-toggle-search'));
    await user.type(screen.getByTestId('status-input'), 'needle');
    await user.click(screen.getByTestId('status-run-prev'));
    const search = hoisted.loadAddonMock.mock.calls
      .map((c) => c[0])
      .find((a) => a instanceof hoisted.MockSearchAddon) as
      | InstanceType<typeof hoisted.MockSearchAddon>
      | undefined;
    expect(search?.findPrevious).toHaveBeenCalledWith('needle');
    expect(search?.findNext).not.toHaveBeenCalled();
  });

  it('does NOT call SearchAddon when onRunSearch fires with an empty query', async () => {
    renderView();
    const user = userEvent.setup();
    await user.click(screen.getByTestId('status-toggle-search'));
    await user.click(screen.getByTestId('status-run-next'));
    const search = hoisted.loadAddonMock.mock.calls
      .map((c) => c[0])
      .find((a) => a instanceof hoisted.MockSearchAddon) as
      | InstanceType<typeof hoisted.MockSearchAddon>
      | undefined;
    expect(search?.findNext).not.toHaveBeenCalled();
    expect(search?.findPrevious).not.toHaveBeenCalled();
  });

  // ---- locale flip ----------------------------------------------

  it('renders the Korean terminal aria-label when locale=ko', () => {
    setLocale('ko');
    renderView();
    expect(screen.getByLabelText('터미널')).toBeInTheDocument();
  });
});
