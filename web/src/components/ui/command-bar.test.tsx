import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { createRef } from 'react';
import {
  CommandBar,
  defaultSelectionLabel,
  isCommandBarSeparator,
} from './command-bar';
import type {
  CommandBarAction,
  CommandBarItem,
  CommandBarSeparator,
} from './command-bar';

afterEach(() => {
  cleanup();
});

describe('defaultSelectionLabel', () => {
  it('returns "No selection" for 0', () => {
    expect(defaultSelectionLabel(0)).toBe('No selection');
  });

  it('returns "No selection" for negative counts', () => {
    expect(defaultSelectionLabel(-3)).toBe('No selection');
  });

  it('returns "1 selected" for 1', () => {
    expect(defaultSelectionLabel(1)).toBe('1 selected');
  });

  it('returns "<n> selected" for n > 1', () => {
    expect(defaultSelectionLabel(5)).toBe('5 selected');
    expect(defaultSelectionLabel(127)).toBe('127 selected');
  });
});

describe('isCommandBarSeparator', () => {
  it('detects { type: "separator" }', () => {
    const sep: CommandBarSeparator = { id: 's1', type: 'separator' };
    expect(isCommandBarSeparator(sep)).toBe(true);
  });

  it('rejects an action item', () => {
    const action: CommandBarAction = {
      id: 'delete',
      label: 'Delete',
      onClick: () => {},
    };
    expect(isCommandBarSeparator(action)).toBe(false);
  });
});

function buildActions(opts?: {
  withDisabled?: boolean;
  withSeparator?: boolean;
  withIcon?: boolean;
  withShortcut?: boolean;
  destructiveOnDelete?: boolean;
}): CommandBarItem[] {
  const items: CommandBarItem[] = [
    {
      id: 'archive',
      label: 'Archive',
      onClick: vi.fn(),
      ...(opts?.withIcon ? { icon: <svg data-testid="archive-icon" /> } : {}),
      ...(opts?.withShortcut ? { shortcut: 'A' } : {}),
    },
    {
      id: 'delete',
      label: 'Delete',
      onClick: vi.fn(),
      ...(opts?.destructiveOnDelete ? { variant: 'destructive' as const } : {}),
    },
  ];
  if (opts?.withSeparator) {
    items.push({ id: 'sep1', type: 'separator' });
  }
  if (opts?.withDisabled) {
    items.push({
      id: 'export',
      label: 'Export',
      onClick: vi.fn(),
      disabled: true,
    });
  } else {
    items.push({
      id: 'export',
      label: 'Export',
      onClick: vi.fn(),
    });
  }
  return items;
}

describe('CommandBar component', () => {
  it('renders nothing when selectedCount=0 and visible is unset', () => {
    const { container } = render(
      <CommandBar selectedCount={0} actions={buildActions()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the toolbar when selectedCount > 0', () => {
    render(<CommandBar selectedCount={3} actions={buildActions()} />);
    expect(screen.getByRole('toolbar')).toBeInTheDocument();
  });

  it('renders when visible=true even if selectedCount=0', () => {
    render(
      <CommandBar
        selectedCount={0}
        actions={buildActions()}
        visible={true}
      />,
    );
    expect(screen.getByRole('toolbar')).toBeInTheDocument();
  });

  it('hides when visible=false even if selectedCount > 0', () => {
    const { container } = render(
      <CommandBar
        selectedCount={5}
        actions={buildActions()}
        visible={false}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('exposes role=toolbar + aria-orientation=horizontal', () => {
    render(<CommandBar selectedCount={1} actions={buildActions()} />);
    const toolbar = screen.getByRole('toolbar');
    expect(toolbar).toHaveAttribute('aria-orientation', 'horizontal');
  });

  it('uses "Selection actions" as the default aria-label', () => {
    render(<CommandBar selectedCount={1} actions={buildActions()} />);
    expect(screen.getByRole('toolbar')).toHaveAttribute(
      'aria-label',
      'Selection actions',
    );
  });

  it('honors a custom ariaLabel', () => {
    render(
      <CommandBar
        selectedCount={1}
        actions={buildActions()}
        ariaLabel="Bulk actions"
      />,
    );
    expect(screen.getByRole('toolbar')).toHaveAttribute(
      'aria-label',
      'Bulk actions',
    );
  });

  it('renders the default selection label "<n> selected"', () => {
    render(<CommandBar selectedCount={4} actions={buildActions()} />);
    expect(screen.getByText('4 selected')).toBeInTheDocument();
  });

  it('honors a custom selectionLabel function', () => {
    render(
      <CommandBar
        selectedCount={2}
        actions={buildActions()}
        selectionLabel={(n) => `Working on ${n} rows`}
      />,
    );
    expect(screen.getByText('Working on 2 rows')).toBeInTheDocument();
  });

  it('renders each action button with its label', () => {
    render(<CommandBar selectedCount={1} actions={buildActions()} />);
    expect(
      screen.getByRole('button', { name: 'Archive' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Delete' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Export' }),
    ).toBeInTheDocument();
  });

  it('fires the action onClick on a click', () => {
    const onClick = vi.fn();
    render(
      <CommandBar
        selectedCount={1}
        actions={[
          { id: 'archive', label: 'Archive', onClick },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire onClick when the action is disabled', () => {
    const onClick = vi.fn();
    render(
      <CommandBar
        selectedCount={1}
        actions={[
          { id: 'archive', label: 'Archive', onClick, disabled: true },
        ]}
      />,
    );
    const button = screen.getByRole('button', { name: 'Archive' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('sets data-disabled on disabled actions', () => {
    render(
      <CommandBar
        selectedCount={1}
        actions={[
          {
            id: 'archive',
            label: 'Archive',
            onClick: vi.fn(),
            disabled: true,
          },
          {
            id: 'delete',
            label: 'Delete',
            onClick: vi.fn(),
          },
        ]}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Archive' }),
    ).toHaveAttribute('data-disabled', 'true');
    expect(
      screen.getByRole('button', { name: 'Delete' }),
    ).toHaveAttribute('data-disabled', 'false');
  });

  it('renders an action icon when supplied', () => {
    render(
      <CommandBar
        selectedCount={1}
        actions={buildActions({ withIcon: true })}
      />,
    );
    expect(screen.getByTestId('archive-icon')).toBeInTheDocument();
  });

  it('renders a shortcut as a <kbd>', () => {
    const { container } = render(
      <CommandBar
        selectedCount={1}
        actions={buildActions({ withShortcut: true })}
      />,
    );
    const kbd = container.querySelector('kbd');
    expect(kbd).toBeInTheDocument();
    expect(kbd?.textContent).toBe('A');
  });

  it('honors action.ariaLabel as an override', () => {
    render(
      <CommandBar
        selectedCount={1}
        actions={[
          {
            id: 'delete',
            label: 'Delete',
            onClick: vi.fn(),
            ariaLabel: 'Delete 3 items',
          },
        ]}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Delete 3 items' }),
    ).toBeInTheDocument();
  });

  it('sets data-action-variant on each action', () => {
    render(
      <CommandBar
        selectedCount={1}
        actions={buildActions({ destructiveOnDelete: true })}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Archive' }),
    ).toHaveAttribute('data-action-variant', 'default');
    expect(
      screen.getByRole('button', { name: 'Delete' }),
    ).toHaveAttribute('data-action-variant', 'destructive');
  });

  it('renders a separator with role=separator + vertical orientation', () => {
    const { container } = render(
      <CommandBar
        selectedCount={1}
        actions={buildActions({ withSeparator: true })}
      />,
    );
    const sep = container.querySelector('[role="separator"]');
    expect(sep).toBeInTheDocument();
    expect(sep).toHaveAttribute('aria-orientation', 'vertical');
  });

  it('renders the clear button when onClearSelection + showClearButton', () => {
    render(
      <CommandBar
        selectedCount={1}
        actions={buildActions()}
        onClearSelection={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Clear selection' }),
    ).toBeInTheDocument();
  });

  it('clear button click fires onClearSelection', () => {
    const onClearSelection = vi.fn();
    render(
      <CommandBar
        selectedCount={1}
        actions={buildActions()}
        onClearSelection={onClearSelection}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Clear selection' }),
    );
    expect(onClearSelection).toHaveBeenCalledTimes(1);
  });

  it('omits the clear button when showClearButton=false', () => {
    render(
      <CommandBar
        selectedCount={1}
        actions={buildActions()}
        onClearSelection={vi.fn()}
        showClearButton={false}
      />,
    );
    expect(
      screen.queryByRole('button', { name: 'Clear selection' }),
    ).toBeNull();
  });

  it('omits the clear button when no onClearSelection handler is supplied', () => {
    render(<CommandBar selectedCount={1} actions={buildActions()} />);
    expect(
      screen.queryByRole('button', { name: 'Clear selection' }),
    ).toBeNull();
  });

  it('honors a custom clearLabel', () => {
    render(
      <CommandBar
        selectedCount={1}
        actions={buildActions()}
        onClearSelection={vi.fn()}
        clearLabel="Cancel selection"
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Cancel selection' }),
    ).toBeInTheDocument();
  });

  it('starts with only one tabstop active', () => {
    render(<CommandBar selectedCount={1} actions={buildActions()} />);
    const buttons = screen
      .getAllByRole('button')
      .filter((b) =>
        b.getAttribute('data-section')?.startsWith('command-bar-action'),
      );
    const tabbable = buttons.filter((b) => b.tabIndex === 0);
    expect(tabbable).toHaveLength(1);
  });

  it('ArrowRight moves focus to the next action', () => {
    render(<CommandBar selectedCount={1} actions={buildActions()} />);
    const toolbar = screen.getByRole('toolbar');
    fireEvent.keyDown(toolbar, { key: 'ArrowRight' });
    expect(
      screen.getByRole('button', { name: 'Delete' }),
    ).toHaveFocus();
  });

  it('ArrowLeft wraps to the last action', () => {
    render(<CommandBar selectedCount={1} actions={buildActions()} />);
    const toolbar = screen.getByRole('toolbar');
    fireEvent.keyDown(toolbar, { key: 'ArrowLeft' });
    expect(
      screen.getByRole('button', { name: 'Export' }),
    ).toHaveFocus();
  });

  it('Home moves focus to the first action', () => {
    render(<CommandBar selectedCount={1} actions={buildActions()} />);
    const toolbar = screen.getByRole('toolbar');
    fireEvent.keyDown(toolbar, { key: 'ArrowRight' });
    fireEvent.keyDown(toolbar, { key: 'Home' });
    expect(
      screen.getByRole('button', { name: 'Archive' }),
    ).toHaveFocus();
  });

  it('End moves focus to the last action', () => {
    render(<CommandBar selectedCount={1} actions={buildActions()} />);
    const toolbar = screen.getByRole('toolbar');
    fireEvent.keyDown(toolbar, { key: 'End' });
    expect(
      screen.getByRole('button', { name: 'Export' }),
    ).toHaveFocus();
  });

  it('ArrowRight skips disabled actions in the focus cycle', () => {
    render(
      <CommandBar
        selectedCount={1}
        actions={[
          { id: 'a', label: 'A', onClick: vi.fn() },
          { id: 'b', label: 'B', onClick: vi.fn(), disabled: true },
          { id: 'c', label: 'C', onClick: vi.fn() },
        ]}
      />,
    );
    const toolbar = screen.getByRole('toolbar');
    fireEvent.keyDown(toolbar, { key: 'ArrowRight' });
    expect(screen.getByRole('button', { name: 'C' })).toHaveFocus();
  });

  it('ArrowRight skips separators in the focus cycle', () => {
    render(
      <CommandBar
        selectedCount={1}
        actions={[
          { id: 'a', label: 'A', onClick: vi.fn() },
          { id: 'sep', type: 'separator' },
          { id: 'b', label: 'B', onClick: vi.fn() },
        ]}
      />,
    );
    const toolbar = screen.getByRole('toolbar');
    fireEvent.keyDown(toolbar, { key: 'ArrowRight' });
    expect(screen.getByRole('button', { name: 'B' })).toHaveFocus();
  });

  it('Escape fires onClearSelection', () => {
    const onClearSelection = vi.fn();
    render(
      <CommandBar
        selectedCount={1}
        actions={buildActions()}
        onClearSelection={onClearSelection}
      />,
    );
    fireEvent.keyDown(screen.getByRole('toolbar'), { key: 'Escape' });
    expect(onClearSelection).toHaveBeenCalledTimes(1);
  });

  it('Escape is a no-op when no onClearSelection handler is supplied', () => {
    render(<CommandBar selectedCount={1} actions={buildActions()} />);
    // not throwing is sufficient
    fireEvent.keyDown(screen.getByRole('toolbar'), { key: 'Escape' });
    expect(screen.getByRole('toolbar')).toBeInTheDocument();
  });

  it('sets data-position attribute (bottom, top, static)', () => {
    const { rerender } = render(
      <CommandBar
        selectedCount={1}
        actions={buildActions()}
        position="bottom"
      />,
    );
    expect(screen.getByRole('toolbar')).toHaveAttribute(
      'data-position',
      'bottom',
    );
    rerender(
      <CommandBar
        selectedCount={1}
        actions={buildActions()}
        position="top"
      />,
    );
    expect(screen.getByRole('toolbar')).toHaveAttribute(
      'data-position',
      'top',
    );
    rerender(
      <CommandBar
        selectedCount={1}
        actions={buildActions()}
        position="static"
      />,
    );
    expect(screen.getByRole('toolbar')).toHaveAttribute(
      'data-position',
      'static',
    );
  });

  it('sets data-align attribute', () => {
    render(
      <CommandBar
        selectedCount={1}
        actions={buildActions()}
        align="right"
      />,
    );
    expect(screen.getByRole('toolbar')).toHaveAttribute(
      'data-align',
      'right',
    );
  });

  it('sets data-selected-count matching the prop', () => {
    render(
      <CommandBar selectedCount={42} actions={buildActions()} />,
    );
    expect(screen.getByRole('toolbar')).toHaveAttribute(
      'data-selected-count',
      '42',
    );
  });

  it('exposes data-section="command-bar" on the root', () => {
    render(<CommandBar selectedCount={1} actions={buildActions()} />);
    expect(screen.getByRole('toolbar')).toHaveAttribute(
      'data-section',
      'command-bar',
    );
  });

  it('exposes a stable displayName', () => {
    expect(CommandBar.displayName).toBe('CommandBar');
  });

  it('forwards refs to the toolbar root', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <CommandBar
        ref={ref}
        selectedCount={1}
        actions={buildActions()}
      />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('role')).toBe('toolbar');
  });

  it('defaults action variant to "default"', () => {
    render(
      <CommandBar
        selectedCount={1}
        actions={[
          { id: 'a', label: 'A', onClick: vi.fn() },
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: 'A' })).toHaveAttribute(
      'data-action-variant',
      'default',
    );
  });

  it('renders an empty actions list without crashing', () => {
    render(<CommandBar selectedCount={2} actions={[]} />);
    expect(screen.getByRole('toolbar')).toBeInTheDocument();
    expect(screen.getByText('2 selected')).toBeInTheDocument();
  });

  it('drops motion-safe classes when motionSafe=false', () => {
    render(
      <CommandBar
        selectedCount={1}
        actions={buildActions()}
        motionSafe={false}
      />,
    );
    const toolbar = screen.getByRole('toolbar');
    expect(toolbar.className).not.toContain('motion-safe:animate-in');
  });
});
