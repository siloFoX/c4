import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommandPalette, useCommandPaletteShortcut } from './command-palette';
import type { Command } from './command-palette';

function makeCommands(): Command[] {
  return [
    {
      id: 'go.workers',
      label: 'Go to Workers',
      group: 'Navigate',
      shortcut: 'g w',
      action: vi.fn(),
    },
    {
      id: 'go.history',
      label: 'Go to History',
      group: 'Navigate',
      action: vi.fn(),
    },
    {
      id: 'open.settings',
      label: 'Open Settings',
      group: 'App',
      keywords: ['preferences', 'config'],
      action: vi.fn(),
    },
    {
      id: 'focus.search',
      label: 'Focus search',
      group: 'App',
      action: vi.fn(),
    },
    {
      id: 'disabled.thing',
      label: 'Disabled command',
      group: 'App',
      disabled: true,
      action: vi.fn(),
    },
  ];
}

function Harness({
  initialOpen,
  commands,
  recentsKey,
}: {
  initialOpen?: boolean;
  commands: Command[];
  recentsKey?: string;
}) {
  const [open, setOpen] = useState<boolean>(initialOpen ?? false);
  useCommandPaletteShortcut(() => setOpen((v) => !v));
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        open
      </button>
      <CommandPalette
        open={open}
        onOpenChange={setOpen}
        commands={commands}
        {...(recentsKey ? { recentsKey } : {})}
      />
    </>
  );
}

describe('<CommandPalette>', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders nothing when open=false', () => {
    render(<CommandPalette open={false} onOpenChange={vi.fn()} commands={[]} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders the dialog + listbox + input when open=true', () => {
    render(
      <CommandPalette open onOpenChange={vi.fn()} commands={makeCommands()} />,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('groups commands by their `group` field', () => {
    render(
      <CommandPalette open onOpenChange={vi.fn()} commands={makeCommands()} />,
    );
    const groups = document.querySelectorAll('[data-command-group]');
    const names = Array.from(groups).map((g) =>
      g.getAttribute('data-command-group'),
    );
    expect(names).toContain('Navigate');
    expect(names).toContain('App');
  });

  it('fuzzy-filters commands as the user types', async () => {
    const user = userEvent.setup();
    render(
      <CommandPalette open onOpenChange={vi.fn()} commands={makeCommands()} />,
    );
    const input = screen.getByRole('combobox') as HTMLInputElement;
    await user.type(input, 'settings');
    expect(screen.getByText('Open Settings')).toBeInTheDocument();
    expect(screen.queryByText('Go to Workers')).toBeNull();
  });

  it('also matches against the keywords list', async () => {
    const user = userEvent.setup();
    render(
      <CommandPalette open onOpenChange={vi.fn()} commands={makeCommands()} />,
    );
    const input = screen.getByRole('combobox') as HTMLInputElement;
    await user.type(input, 'preferences');
    expect(screen.getByText('Open Settings')).toBeInTheDocument();
  });

  it('shows empty-state content when no command matches', async () => {
    const user = userEvent.setup();
    render(
      <CommandPalette
        open
        onOpenChange={vi.fn()}
        commands={makeCommands()}
        emptyContent="No commands found."
      />,
    );
    await user.type(screen.getByRole('combobox'), 'zzzzz');
    expect(screen.getByText('No commands found.')).toBeInTheDocument();
  });

  it('Enter on the active row runs the command + closes the palette', async () => {
    const user = userEvent.setup();
    const cmds = makeCommands();
    const onOpenChange = vi.fn();
    render(
      <CommandPalette open onOpenChange={onOpenChange} commands={cmds} />,
    );
    const input = screen.getByRole('combobox');
    await user.type(input, 'workers');
    await user.keyboard('{Enter}');
    expect(cmds[0]!.action).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('clicking a row runs the command + closes the palette', async () => {
    const user = userEvent.setup();
    const cmds = makeCommands();
    const onOpenChange = vi.fn();
    render(
      <CommandPalette open onOpenChange={onOpenChange} commands={cmds} />,
    );
    await user.click(screen.getByText('Go to History'));
    expect(cmds[1]!.action).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('ArrowDown / ArrowUp navigate between rows', async () => {
    const user = userEvent.setup();
    const cmds = makeCommands();
    render(<CommandPalette open onOpenChange={vi.fn()} commands={cmds} />);
    const input = screen.getByRole('combobox');
    input.focus();
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Enter}');
    // 3rd enabled command (skip disabled) - order is workers, history, settings, focus.search.
    // After 2 ArrowDowns starting at index 0 -> index 2 -> "Open Settings".
    expect(cmds[2]!.action).toHaveBeenCalledTimes(1);
  });

  it('skips disabled commands during arrow nav (Enter never fires them)', async () => {
    const user = userEvent.setup();
    const cmds = makeCommands();
    render(<CommandPalette open onOpenChange={vi.fn()} commands={cmds} />);
    const input = screen.getByRole('combobox');
    input.focus();
    // Press End -> jump to last enabled command (focus.search at idx 3).
    await user.keyboard('{End}');
    await user.keyboard('{Enter}');
    expect(cmds[3]!.action).toHaveBeenCalledTimes(1);
    // The disabled command at index 4 must NOT have fired.
    expect(cmds[4]!.action).not.toHaveBeenCalled();
  });

  it('Escape closes the palette via the focus-trap handler', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <CommandPalette
        open
        onOpenChange={onOpenChange}
        commands={makeCommands()}
      />,
    );
    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('clicking the backdrop closes the palette', () => {
    const onOpenChange = vi.fn();
    render(
      <CommandPalette
        open
        onOpenChange={onOpenChange}
        commands={makeCommands()}
      />,
    );
    const backdrop = document.querySelector(
      '[data-command-palette-backdrop]',
    ) as HTMLElement;
    fireEvent.click(backdrop);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('persists invoked commands into localStorage recents (most recent first)', async () => {
    const user = userEvent.setup();
    const cmds = makeCommands();
    render(
      <Harness
        initialOpen
        commands={cmds}
        recentsKey="test:recents:persist"
      />,
    );
    await user.click(screen.getByText('Open Settings'));
    await waitFor(() => {
      const raw = window.localStorage.getItem('test:recents:persist');
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw!);
      expect(parsed[0]).toBe('open.settings');
    });
  });

  it('surfaces recents as the first group when the query is empty', async () => {
    window.localStorage.setItem(
      'test:recents:show',
      JSON.stringify(['focus.search', 'open.settings']),
    );
    const cmds = makeCommands();
    render(
      <CommandPalette
        open
        onOpenChange={vi.fn()}
        commands={cmds}
        recentsKey="test:recents:show"
      />,
    );
    const firstGroup = document.querySelector('[data-command-group]');
    expect(firstGroup?.getAttribute('data-command-group')).toBe('Recent');
  });

  it('does NOT render the Recent group while a query is typed', async () => {
    window.localStorage.setItem(
      'test:recents:hideontype',
      JSON.stringify(['focus.search']),
    );
    const user = userEvent.setup();
    render(
      <CommandPalette
        open
        onOpenChange={vi.fn()}
        commands={makeCommands()}
        recentsKey="test:recents:hideontype"
      />,
    );
    await user.type(screen.getByRole('combobox'), 'work');
    const groups = document.querySelectorAll('[data-command-group]');
    const names = Array.from(groups).map((g) =>
      g.getAttribute('data-command-group'),
    );
    expect(names).not.toContain('Recent');
  });

  it('renders the shortcut hint when a command has one', () => {
    render(
      <CommandPalette open onOpenChange={vi.fn()} commands={makeCommands()} />,
    );
    expect(screen.getByText('g w')).toBeInTheDocument();
  });

  it('aria-selected flips to true on the active row', () => {
    render(
      <CommandPalette
        open
        onOpenChange={vi.fn()}
        commands={makeCommands()}
      />,
    );
    const active = document.querySelector('[data-command-active="true"]');
    expect(active).not.toBeNull();
    expect(active!.getAttribute('aria-selected')).toBe('true');
  });

  it('exposes a stable displayName', () => {
    expect(CommandPalette.displayName).toBe('CommandPalette');
  });
});

describe('useCommandPaletteShortcut', () => {
  it('fires onToggle on Cmd+K', () => {
    const onToggle = vi.fn();
    function H() {
      useCommandPaletteShortcut(onToggle);
      return <div data-testid="root">root</div>;
    }
    render(<H />);
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('fires onToggle on Ctrl+K', () => {
    const onToggle = vi.fn();
    function H() {
      useCommandPaletteShortcut(onToggle);
      return <div data-testid="root">root</div>;
    }
    render(<H />);
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('ignores Cmd+K when the target is an input (default)', () => {
    const onToggle = vi.fn();
    function H() {
      useCommandPaletteShortcut(onToggle);
      return <input data-testid="composer" defaultValue="" />;
    }
    render(<H />);
    const input = screen.getByTestId('composer');
    fireEvent.keyDown(input, { key: 'k', metaKey: true });
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('intercepts Cmd+K even in inputs when interceptInInputs=true', () => {
    const onToggle = vi.fn();
    function H() {
      useCommandPaletteShortcut(onToggle, { interceptInInputs: true });
      return <input data-testid="composer" defaultValue="" />;
    }
    render(<H />);
    const input = screen.getByTestId('composer');
    fireEvent.keyDown(input, { key: 'k', metaKey: true });
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
