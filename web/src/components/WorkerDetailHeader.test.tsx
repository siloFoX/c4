import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import WorkerDetailHeader from './WorkerDetailHeader';
import type { TerminalTab } from './WorkerDetailHeader';

// WorkerDetailHeader is pure-controlled. Parent (WorkerDetail) owns
// the tab state + the persisted font size state and passes both
// the values and the setter callbacks down. No hooks of its own
// except useLocale, which only re-renders when the locale flips.
// Every test drives the prop union directly with vi.fn() callbacks
// and asserts the rendered structure + the callback wiring on
// every user interaction.

interface RenderOpts {
  workerName?: string;
  tab?: TerminalTab;
  fontSize?: number;
  onTabChange?: (next: TerminalTab) => void;
  onBumpFont?: (delta: number) => void;
}

function renderView(over: RenderOpts = {}) {
  const onTabChange = over.onTabChange ?? vi.fn();
  const onBumpFont = over.onBumpFont ?? vi.fn();
  const props = {
    workerName: over.workerName ?? 'w1',
    tab: over.tab ?? ('screen' as TerminalTab),
    fontSize: over.fontSize ?? 12,
    onTabChange,
    onBumpFont,
  };
  const utils = render(<WorkerDetailHeader {...props} />);
  const user = userEvent.setup();
  return { ...utils, user, onTabChange, onBumpFont, props };
}

function getTab(name: RegExp): HTMLButtonElement {
  return screen.getByRole('tab', { name }) as HTMLButtonElement;
}

beforeEach(() => {
  setLocale('en');
});

describe('<WorkerDetailHeader>', () => {
  // ---- default render -------------------------------------------

  it('renders the workerName as the CardTitle', () => {
    renderView({ workerName: 'alpha-1' });
    expect(screen.getByText('alpha-1')).toBeInTheDocument();
  });

  it('renders the localized terminal-session sub-text', () => {
    renderView();
    expect(screen.getByText('Terminal session')).toBeInTheDocument();
  });

  it('renders the tablist with the localized aria-label', () => {
    renderView();
    expect(
      screen.getByRole('tablist', { name: 'Terminal view' }),
    ).toBeInTheDocument();
  });

  it('renders exactly two tab buttons inside the tablist', () => {
    renderView();
    const list = screen.getByRole('tablist');
    expect(within(list).getAllByRole('tab')).toHaveLength(2);
  });

  it('renders the screen tab with its localized label', () => {
    renderView();
    expect(getTab(/Screen/)).toBeInTheDocument();
  });

  it('renders the scrollback tab with its localized label', () => {
    renderView();
    expect(getTab(/Scrollback/)).toBeInTheDocument();
  });

  // ---- aria-selected wiring -------------------------------------

  it('marks the screen tab aria-selected=true when tab="screen"', () => {
    renderView({ tab: 'screen' });
    expect(getTab(/Screen/)).toHaveAttribute('aria-selected', 'true');
  });

  it('marks the scrollback tab aria-selected=false when tab="screen"', () => {
    renderView({ tab: 'screen' });
    expect(getTab(/Scrollback/)).toHaveAttribute('aria-selected', 'false');
  });

  it('marks the scrollback tab aria-selected=true when tab="scrollback"', () => {
    renderView({ tab: 'scrollback' });
    expect(getTab(/Scrollback/)).toHaveAttribute('aria-selected', 'true');
  });

  it('marks the screen tab aria-selected=false when tab="scrollback"', () => {
    renderView({ tab: 'scrollback' });
    expect(getTab(/Screen/)).toHaveAttribute('aria-selected', 'false');
  });

  // ---- variant -> class mapping ---------------------------------

  it('applies the secondary variant class on the active screen tab', () => {
    renderView({ tab: 'screen' });
    expect(getTab(/Screen/).className).toMatch(/bg-secondary/);
  });

  it('applies the ghost variant class on the inactive screen tab', () => {
    renderView({ tab: 'scrollback' });
    expect(getTab(/Screen/).className).not.toMatch(/bg-secondary/);
  });

  it('applies the secondary variant class on the active scrollback tab', () => {
    renderView({ tab: 'scrollback' });
    expect(getTab(/Scrollback/).className).toMatch(/bg-secondary/);
  });

  it('applies the ghost variant class on the inactive scrollback tab', () => {
    renderView({ tab: 'screen' });
    expect(getTab(/Scrollback/).className).not.toMatch(/bg-secondary/);
  });

  // ---- onTabChange dispatch -------------------------------------

  it('fires onTabChange("screen") when the screen tab is clicked', async () => {
    const { user, onTabChange } = renderView({ tab: 'scrollback' });
    await user.click(getTab(/Screen/));
    expect(onTabChange).toHaveBeenCalledTimes(1);
    expect(onTabChange).toHaveBeenCalledWith('screen');
  });

  it('fires onTabChange("scrollback") when the scrollback tab is clicked', async () => {
    const { user, onTabChange } = renderView({ tab: 'screen' });
    await user.click(getTab(/Scrollback/));
    expect(onTabChange).toHaveBeenCalledTimes(1);
    expect(onTabChange).toHaveBeenCalledWith('scrollback');
  });

  it('still fires onTabChange when clicking the already-active tab (idempotent)', async () => {
    const { user, onTabChange } = renderView({ tab: 'screen' });
    await user.click(getTab(/Screen/));
    expect(onTabChange).toHaveBeenCalledTimes(1);
    expect(onTabChange).toHaveBeenCalledWith('screen');
  });

  it('fires onTabChange via keyboard Enter on the focused screen tab', async () => {
    const { user, onTabChange } = renderView({ tab: 'scrollback' });
    const tab = getTab(/Screen/);
    tab.focus();
    await user.keyboard('{Enter}');
    expect(onTabChange).toHaveBeenCalledTimes(1);
    expect(onTabChange).toHaveBeenCalledWith('screen');
  });

  it('fires onTabChange via keyboard Space on the focused scrollback tab', async () => {
    const { user, onTabChange } = renderView({ tab: 'screen' });
    const tab = getTab(/Scrollback/);
    tab.focus();
    await user.keyboard(' ');
    expect(onTabChange).toHaveBeenCalledTimes(1);
    expect(onTabChange).toHaveBeenCalledWith('scrollback');
  });

  // ---- font slot rendering --------------------------------------

  it('renders the font cluster with the localized aria-label "Font size"', () => {
    renderView();
    expect(screen.getByLabelText('Font size')).toBeInTheDocument();
  });

  it('renders the decrease icon-button with the localized aria-label', () => {
    renderView();
    expect(
      screen.getByRole('button', { name: 'Decrease font size' }),
    ).toBeInTheDocument();
  });

  it('renders the increase icon-button with the localized aria-label', () => {
    renderView();
    expect(
      screen.getByRole('button', { name: 'Increase font size' }),
    ).toBeInTheDocument();
  });

  it('renders the fontSize value followed by "px"', () => {
    renderView({ fontSize: 14 });
    expect(screen.getByText('14px')).toBeInTheDocument();
  });

  it('renders the minimum allowed fontSize 9 followed by "px"', () => {
    renderView({ fontSize: 9 });
    expect(screen.getByText('9px')).toBeInTheDocument();
  });

  it('renders the maximum allowed fontSize 24 followed by "px"', () => {
    renderView({ fontSize: 24 });
    expect(screen.getByText('24px')).toBeInTheDocument();
  });

  it('renders the localized "auto-fit" footnote label', () => {
    renderView();
    expect(screen.getByText('auto-fit via xterm.js')).toBeInTheDocument();
  });

  // ---- onBumpFont dispatch --------------------------------------

  it('fires onBumpFont(-1) when the decrease icon-button is clicked', async () => {
    const { user, onBumpFont } = renderView({ fontSize: 12 });
    await user.click(
      screen.getByRole('button', { name: 'Decrease font size' }),
    );
    expect(onBumpFont).toHaveBeenCalledTimes(1);
    expect(onBumpFont).toHaveBeenCalledWith(-1);
  });

  it('fires onBumpFont(1) when the increase icon-button is clicked', async () => {
    const { user, onBumpFont } = renderView({ fontSize: 12 });
    await user.click(
      screen.getByRole('button', { name: 'Increase font size' }),
    );
    expect(onBumpFont).toHaveBeenCalledTimes(1);
    expect(onBumpFont).toHaveBeenCalledWith(1);
  });

  it('fires onBumpFont once per click even on repeated clicks', async () => {
    const { user, onBumpFont } = renderView();
    const up = screen.getByRole('button', { name: 'Increase font size' });
    await user.click(up);
    await user.click(up);
    await user.click(up);
    expect(onBumpFont).toHaveBeenCalledTimes(3);
    expect(onBumpFont).toHaveBeenNthCalledWith(1, 1);
    expect(onBumpFont).toHaveBeenNthCalledWith(2, 1);
    expect(onBumpFont).toHaveBeenNthCalledWith(3, 1);
  });

  it('fires onBumpFont with -1 on Enter on the focused decrease button', async () => {
    const { user, onBumpFont } = renderView();
    const down = screen.getByRole('button', { name: 'Decrease font size' });
    down.focus();
    await user.keyboard('{Enter}');
    expect(onBumpFont).toHaveBeenCalledTimes(1);
    expect(onBumpFont).toHaveBeenCalledWith(-1);
  });

  it('fires onBumpFont with 1 on Space on the focused increase button', async () => {
    const { user, onBumpFont } = renderView();
    const up = screen.getByRole('button', { name: 'Increase font size' });
    up.focus();
    await user.keyboard(' ');
    expect(onBumpFont).toHaveBeenCalledTimes(1);
    expect(onBumpFont).toHaveBeenCalledWith(1);
  });

  // ---- structural attributes ------------------------------------

  it('renders the screen tab with role=tab', () => {
    renderView();
    expect(getTab(/Screen/)).toHaveAttribute('role', 'tab');
  });

  it('renders the scrollback tab with role=tab', () => {
    renderView();
    expect(getTab(/Scrollback/)).toHaveAttribute('role', 'tab');
  });

  it('renders the tablist container with role=tablist', () => {
    renderView();
    expect(screen.getByRole('tablist')).toBeInTheDocument();
  });

  it('sets type="button" on both tab buttons', () => {
    renderView();
    expect(getTab(/Screen/)).toHaveAttribute('type', 'button');
    expect(getTab(/Scrollback/)).toHaveAttribute('type', 'button');
  });

  it('applies the truncate class on the CardTitle so long worker names ellipsize', () => {
    renderView({ workerName: 'a-very-long-worker-name-that-may-overflow' });
    expect(
      screen.getByText('a-very-long-worker-name-that-may-overflow'),
    ).toHaveClass('truncate');
  });

  // ---- workerName prop variations -------------------------------

  it('updates the CardTitle when workerName re-renders to a new value', () => {
    const { rerender } = renderView({ workerName: 'foo' });
    expect(screen.getByText('foo')).toBeInTheDocument();
    rerender(
      <WorkerDetailHeader
        workerName="bar"
        tab="screen"
        fontSize={12}
        onTabChange={vi.fn()}
        onBumpFont={vi.fn()}
      />,
    );
    expect(screen.queryByText('foo')).not.toBeInTheDocument();
    expect(screen.getByText('bar')).toBeInTheDocument();
  });

  it('handles an empty workerName by rendering an empty CardTitle node', () => {
    const { container } = renderView({ workerName: '' });
    const title = container.querySelector('.truncate');
    expect(title).toBeInTheDocument();
    expect(title?.textContent).toBe('');
  });

  it('handles a workerName with dashes / underscores without re-encoding', () => {
    renderView({ workerName: 'auto-w_49' });
    expect(screen.getByText('auto-w_49')).toBeInTheDocument();
  });

  // ---- fontSize prop variations ---------------------------------

  it('updates the displayed fontSize when the prop re-renders to a new value', () => {
    const { rerender } = renderView({ fontSize: 10 });
    expect(screen.getByText('10px')).toBeInTheDocument();
    rerender(
      <WorkerDetailHeader
        workerName="w1"
        tab="screen"
        fontSize={18}
        onTabChange={vi.fn()}
        onBumpFont={vi.fn()}
      />,
    );
    expect(screen.queryByText('10px')).not.toBeInTheDocument();
    expect(screen.getByText('18px')).toBeInTheDocument();
  });

  it('updates the active tab when the tab prop transitions from screen to scrollback on rerender', () => {
    const { rerender } = renderView({ tab: 'screen' });
    expect(getTab(/Screen/)).toHaveAttribute('aria-selected', 'true');
    rerender(
      <WorkerDetailHeader
        workerName="w1"
        tab="scrollback"
        fontSize={12}
        onTabChange={vi.fn()}
        onBumpFont={vi.fn()}
      />,
    );
    expect(getTab(/Scrollback/)).toHaveAttribute('aria-selected', 'true');
    expect(getTab(/Screen/)).toHaveAttribute('aria-selected', 'false');
  });

  // ---- locale flip ----------------------------------------------

  it('re-renders the terminal-session sub-text in Korean when the locale flips to ko', () => {
    renderView();
    expect(screen.getByText('Terminal session')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('Terminal session')).not.toBeInTheDocument();
  });

  it('re-renders the screen tab label in Korean when the locale flips to ko', () => {
    renderView();
    expect(screen.getByText('Screen')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('Screen')).not.toBeInTheDocument();
  });

  it('re-renders the scrollback tab label in Korean when the locale flips to ko', () => {
    renderView();
    expect(screen.getByText('Scrollback')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('Scrollback')).not.toBeInTheDocument();
  });

  it('re-renders the font-size aria-label in Korean when the locale flips to ko', () => {
    renderView();
    expect(screen.getByLabelText('Font size')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByLabelText('Font size')).not.toBeInTheDocument();
  });

  it('re-renders the auto-fit copy in Korean when the locale flips to ko', () => {
    renderView();
    expect(screen.getByText('auto-fit via xterm.js')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByText('auto-fit via xterm.js'),
    ).not.toBeInTheDocument();
  });

  // ---- rerender stability ---------------------------------------

  it('keeps the same set of tabs after rerendering with identical props', () => {
    const onTabChange = vi.fn();
    const onBumpFont = vi.fn();
    const { rerender } = render(
      <WorkerDetailHeader
        workerName="w1"
        tab="screen"
        fontSize={12}
        onTabChange={onTabChange}
        onBumpFont={onBumpFont}
      />,
    );
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    rerender(
      <WorkerDetailHeader
        workerName="w1"
        tab="screen"
        fontSize={12}
        onTabChange={onTabChange}
        onBumpFont={onBumpFont}
      />,
    );
    expect(screen.getAllByRole('tab')).toHaveLength(2);
  });

  it('does not fire onTabChange when only the fontSize prop changes on rerender', () => {
    const onTabChange = vi.fn();
    const { rerender } = render(
      <WorkerDetailHeader
        workerName="w1"
        tab="screen"
        fontSize={12}
        onTabChange={onTabChange}
        onBumpFont={vi.fn()}
      />,
    );
    rerender(
      <WorkerDetailHeader
        workerName="w1"
        tab="screen"
        fontSize={16}
        onTabChange={onTabChange}
        onBumpFont={vi.fn()}
      />,
    );
    expect(onTabChange).not.toHaveBeenCalled();
  });

  it('does not fire onBumpFont when only the tab prop changes on rerender', () => {
    const onBumpFont = vi.fn();
    const { rerender } = render(
      <WorkerDetailHeader
        workerName="w1"
        tab="screen"
        fontSize={12}
        onTabChange={vi.fn()}
        onBumpFont={onBumpFont}
      />,
    );
    rerender(
      <WorkerDetailHeader
        workerName="w1"
        tab="scrollback"
        fontSize={12}
        onTabChange={vi.fn()}
        onBumpFont={onBumpFont}
      />,
    );
    expect(onBumpFont).not.toHaveBeenCalled();
  });
});
