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
  ActionMenu,
  isActionMenuSeparator,
  partitionActionMenu,
} from './action-menu';
import type {
  ActionMenuAction,
  ActionMenuItem,
} from './action-menu';

afterEach(() => {
  cleanup();
});

function makeActions(): ActionMenuItem[] {
  return [
    {
      id: 'save',
      label: 'Save',
      variant: 'primary',
      onClick: vi.fn(),
    },
    { id: 'edit', label: 'Edit', onClick: vi.fn() },
    { id: 'duplicate', label: 'Duplicate', onClick: vi.fn() },
    { id: 'archive', label: 'Archive', onClick: vi.fn() },
    {
      id: 'delete',
      label: 'Delete',
      variant: 'destructive',
      onClick: vi.fn(),
    },
  ];
}

describe('isActionMenuSeparator', () => {
  it('detects { type: "separator" }', () => {
    expect(
      isActionMenuSeparator({ id: 's', type: 'separator' }),
    ).toBe(true);
  });
  it('rejects an action item', () => {
    expect(
      isActionMenuSeparator({
        id: 'a',
        label: 'A',
        onClick: () => {},
      } as ActionMenuItem),
    ).toBe(false);
  });
});

describe('partitionActionMenu', () => {
  it('empty input -> empty partitions', () => {
    expect(partitionActionMenu([], 3)).toEqual({
      visible: [],
      overflow: [],
    });
  });

  it('actions <= maxVisible -> all visible', () => {
    const items: ActionMenuItem[] = [
      { id: 'a', label: 'A', onClick: vi.fn() },
      { id: 'b', label: 'B', onClick: vi.fn() },
    ];
    expect(partitionActionMenu(items, 3).visible).toHaveLength(2);
    expect(partitionActionMenu(items, 3).overflow).toEqual([]);
  });

  it('actions > maxVisible -> overflow splits at cap', () => {
    const items: ActionMenuItem[] = [
      { id: 'a', label: 'A', onClick: vi.fn() },
      { id: 'b', label: 'B', onClick: vi.fn() },
      { id: 'c', label: 'C', onClick: vi.fn() },
      { id: 'd', label: 'D', onClick: vi.fn() },
      { id: 'e', label: 'E', onClick: vi.fn() },
    ];
    const part = partitionActionMenu(items, 3);
    expect(part.visible.map((i) => (i as ActionMenuAction).id)).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(part.overflow.map((i) => (i as ActionMenuAction).id)).toEqual([
      'd',
      'e',
    ]);
  });

  it('separators do not count against the budget', () => {
    const items: ActionMenuItem[] = [
      { id: 'a', label: 'A', onClick: vi.fn() },
      { id: 's1', type: 'separator' },
      { id: 'b', label: 'B', onClick: vi.fn() },
    ];
    expect(partitionActionMenu(items, 2).visible).toHaveLength(3);
    expect(partitionActionMenu(items, 2).overflow).toEqual([]);
  });

  it('drops trailing separators from visible', () => {
    const items: ActionMenuItem[] = [
      { id: 'a', label: 'A', onClick: vi.fn() },
      { id: 'b', label: 'B', onClick: vi.fn() },
      { id: 's1', type: 'separator' },
      { id: 'c', label: 'C', onClick: vi.fn() },
      { id: 'd', label: 'D', onClick: vi.fn() },
    ];
    const part = partitionActionMenu(items, 2);
    expect(part.visible.map((i) => (i as { id: string }).id)).toEqual([
      'a',
      'b',
    ]);
    expect(part.overflow.map((i) => (i as { id: string }).id)).toEqual([
      'c',
      'd',
    ]);
  });

  it('drops leading separators from overflow', () => {
    const items: ActionMenuItem[] = [
      { id: 'a', label: 'A', onClick: vi.fn() },
      { id: 'b', label: 'B', onClick: vi.fn() },
      { id: 's1', type: 'separator' },
      { id: 'c', label: 'C', onClick: vi.fn() },
    ];
    const part = partitionActionMenu(items, 2);
    expect(part.overflow.map((i) => (i as { id: string }).id)).toEqual([
      'c',
    ]);
  });

  it('maxVisible=0 puts everything in overflow', () => {
    const items: ActionMenuItem[] = [
      { id: 'a', label: 'A', onClick: vi.fn() },
      { id: 'b', label: 'B', onClick: vi.fn() },
    ];
    expect(partitionActionMenu(items, 0).visible).toEqual([]);
    expect(partitionActionMenu(items, 0).overflow).toHaveLength(2);
  });

  it('non-finite maxVisible coerces to 0', () => {
    const items: ActionMenuItem[] = [
      { id: 'a', label: 'A', onClick: vi.fn() },
    ];
    expect(
      partitionActionMenu(items, Number.NaN).visible,
    ).toEqual([]);
  });
});

describe('ActionMenu component', () => {
  it('renders role=toolbar with default aria-label', () => {
    render(<ActionMenu actions={makeActions()} />);
    expect(screen.getByRole('toolbar')).toHaveAttribute(
      'aria-label',
      'Page actions',
    );
  });

  it('honors a custom ariaLabel', () => {
    render(
      <ActionMenu actions={makeActions()} ariaLabel="Asset actions" />,
    );
    expect(screen.getByRole('toolbar')).toHaveAttribute(
      'aria-label',
      'Asset actions',
    );
  });

  it('toolbar has aria-orientation horizontal', () => {
    render(<ActionMenu actions={makeActions()} />);
    expect(screen.getByRole('toolbar')).toHaveAttribute(
      'aria-orientation',
      'horizontal',
    );
  });

  it('renders the first maxVisible actions as inline buttons', () => {
    render(<ActionMenu actions={makeActions()} maxVisible={3} />);
    expect(
      screen.getByRole('button', { name: 'Save' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Edit' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Duplicate' }),
    ).toBeInTheDocument();
  });

  it('overflowed actions are hidden until More opens', () => {
    render(<ActionMenu actions={makeActions()} maxVisible={3} />);
    expect(
      screen.queryByRole('button', { name: 'Archive' }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Delete' }),
    ).toBeNull();
  });

  it('More button visible when overflow exists', () => {
    render(<ActionMenu actions={makeActions()} maxVisible={3} />);
    expect(
      screen.getByRole('button', { name: 'More' }),
    ).toBeInTheDocument();
  });

  it('More button hidden when no overflow', () => {
    render(<ActionMenu actions={makeActions()} maxVisible={5} />);
    expect(
      screen.queryByRole('button', { name: 'More' }),
    ).toBeNull();
  });

  it('clicking More opens the overflow menu', () => {
    render(<ActionMenu actions={makeActions()} maxVisible={3} />);
    const more = screen.getByRole('button', { name: 'More' });
    fireEvent.click(more);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Archive' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Delete' }),
    ).toBeInTheDocument();
  });

  it('overflow More button aria-expanded mirrors open state', () => {
    render(<ActionMenu actions={makeActions()} maxVisible={3} />);
    const more = screen.getByRole('button', { name: 'More' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(more);
    expect(more).toHaveAttribute('aria-expanded', 'true');
  });

  it('clicking an overflow item fires onClick + closes menu', () => {
    const archive = vi.fn();
    const items: ActionMenuItem[] = [
      { id: 'a', label: 'A', onClick: vi.fn() },
      { id: 'b', label: 'B', onClick: vi.fn() },
      { id: 'c', label: 'C', onClick: vi.fn() },
      { id: 'archive', label: 'Archive', onClick: archive },
    ];
    render(<ActionMenu actions={items} maxVisible={3} />);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Archive' }),
    );
    expect(archive).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('Escape closes the overflow menu', () => {
    render(<ActionMenu actions={makeActions()} maxVisible={3} />);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('outside click closes the overflow menu', () => {
    render(<ActionMenu actions={makeActions()} maxVisible={3} />);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('clicking a visible action button fires its onClick', () => {
    const save = vi.fn();
    const items: ActionMenuItem[] = [
      { id: 'save', label: 'Save', onClick: save, variant: 'primary' },
    ];
    render(<ActionMenu actions={items} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('disabled visible action has disabled attribute + no onClick', () => {
    const onClick = vi.fn();
    const items: ActionMenuItem[] = [
      {
        id: 'save',
        label: 'Save',
        onClick,
        disabled: true,
      },
    ];
    render(<ActionMenu actions={items} />);
    const btn = screen.getByRole('button', { name: 'Save' });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('action variant gets data-action-variant attr', () => {
    render(<ActionMenu actions={makeActions()} maxVisible={5} />);
    expect(
      screen.getByRole('button', { name: 'Save' }),
    ).toHaveAttribute('data-action-variant', 'primary');
    expect(
      screen.getByRole('button', { name: 'Delete' }),
    ).toHaveAttribute('data-action-variant', 'destructive');
  });

  it('default variant is secondary', () => {
    const items: ActionMenuItem[] = [
      { id: 'a', label: 'A', onClick: vi.fn() },
    ];
    render(<ActionMenu actions={items} />);
    expect(
      screen.getByRole('button', { name: 'A' }),
    ).toHaveAttribute('data-action-variant', 'secondary');
  });

  it('icon and shortcut render inside the action button', () => {
    const items: ActionMenuItem[] = [
      {
        id: 's',
        label: 'Save',
        onClick: vi.fn(),
        icon: <svg data-testid="save-icon" />,
        shortcut: 'Cmd+S',
      },
    ];
    const { container } = render(<ActionMenu actions={items} />);
    expect(screen.getByTestId('save-icon')).toBeInTheDocument();
    expect(container.querySelector('kbd')?.textContent).toBe('Cmd+S');
  });

  it('inline separator renders as role=separator vertical', () => {
    const items: ActionMenuItem[] = [
      { id: 'a', label: 'A', onClick: vi.fn() },
      { id: 's', type: 'separator' },
      { id: 'b', label: 'B', onClick: vi.fn() },
    ];
    const { container } = render(
      <ActionMenu actions={items} maxVisible={3} />,
    );
    const sep = container.querySelector(
      '[data-section="action-menu-separator"]',
    );
    expect(sep).toBeInTheDocument();
    expect(sep).toHaveAttribute('aria-orientation', 'vertical');
  });

  it('ArrowRight cycles through visible focusable actions', () => {
    render(<ActionMenu actions={makeActions()} maxVisible={3} />);
    const toolbar = screen.getByRole('toolbar');
    fireEvent.keyDown(toolbar, { key: 'ArrowRight' });
    expect(
      screen.getByRole('button', { name: 'Edit' }),
    ).toHaveFocus();
  });

  it('ArrowLeft wraps to the last visible focusable', () => {
    render(<ActionMenu actions={makeActions()} maxVisible={3} />);
    const toolbar = screen.getByRole('toolbar');
    fireEvent.keyDown(toolbar, { key: 'ArrowLeft' });
    expect(
      screen.getByRole('button', { name: 'Duplicate' }),
    ).toHaveFocus();
  });

  it('Home jumps to first focusable visible', () => {
    render(<ActionMenu actions={makeActions()} maxVisible={3} />);
    const toolbar = screen.getByRole('toolbar');
    fireEvent.keyDown(toolbar, { key: 'ArrowRight' });
    fireEvent.keyDown(toolbar, { key: 'Home' });
    expect(
      screen.getByRole('button', { name: 'Save' }),
    ).toHaveFocus();
  });

  it('End jumps to last focusable visible', () => {
    render(<ActionMenu actions={makeActions()} maxVisible={3} />);
    const toolbar = screen.getByRole('toolbar');
    fireEvent.keyDown(toolbar, { key: 'End' });
    expect(
      screen.getByRole('button', { name: 'Duplicate' }),
    ).toHaveFocus();
  });

  it('only one visible button has tabIndex=0 at a time', () => {
    render(<ActionMenu actions={makeActions()} maxVisible={3} />);
    const buttons = screen
      .getAllByRole('button')
      .filter(
        (b) =>
          b.getAttribute('data-section') === 'action-menu-action',
      );
    const tabbable = buttons.filter((b) => b.tabIndex === 0);
    expect(tabbable).toHaveLength(1);
  });

  it('align prop mirrors on data-align', () => {
    const { rerender } = render(
      <ActionMenu actions={makeActions()} align="start" />,
    );
    expect(screen.getByRole('toolbar')).toHaveAttribute(
      'data-align',
      'start',
    );
    rerender(<ActionMenu actions={makeActions()} align="end" />);
    expect(screen.getByRole('toolbar')).toHaveAttribute(
      'data-align',
      'end',
    );
  });

  it('data-visible-count and data-overflow-count mirror partition', () => {
    render(<ActionMenu actions={makeActions()} maxVisible={3} />);
    const toolbar = screen.getByRole('toolbar');
    expect(toolbar).toHaveAttribute('data-visible-count', '3');
    expect(toolbar).toHaveAttribute('data-overflow-count', '2');
  });

  it('data-overflow-open flips on More toggle', () => {
    render(<ActionMenu actions={makeActions()} maxVisible={3} />);
    const toolbar = screen.getByRole('toolbar');
    expect(toolbar).toHaveAttribute('data-overflow-open', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(toolbar).toHaveAttribute('data-overflow-open', 'true');
  });

  it('custom overflowLabel renders on the More button', () => {
    render(
      <ActionMenu
        actions={makeActions()}
        maxVisible={3}
        overflowLabel="Show all"
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Show all' }),
    ).toBeInTheDocument();
  });

  it('disabled overflow item is not clickable', () => {
    const onClick = vi.fn();
    const items: ActionMenuItem[] = [
      { id: 'a', label: 'A', onClick: vi.fn() },
      { id: 'b', label: 'B', onClick: vi.fn() },
      { id: 'c', label: 'C', onClick: vi.fn() },
      {
        id: 'd',
        label: 'D',
        onClick,
        disabled: true,
      },
    ];
    render(<ActionMenu actions={items} maxVisible={3} />);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    const item = screen.getByRole('menuitem', { name: 'D' });
    expect(item).toBeDisabled();
    fireEvent.click(item);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('action.ariaLabel overrides the rendered label for AT', () => {
    const items: ActionMenuItem[] = [
      {
        id: 'a',
        label: 'D',
        onClick: vi.fn(),
        ariaLabel: 'Delete 3 items',
      },
    ];
    render(<ActionMenu actions={items} />);
    expect(
      screen.getByRole('button', { name: 'Delete 3 items' }),
    ).toBeInTheDocument();
  });

  it('exposes a stable displayName', () => {
    expect(ActionMenu.displayName).toBe('ActionMenu');
  });

  it('forwards refs to the toolbar root', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ActionMenu ref={ref} actions={makeActions()} />);
    expect(ref.current?.getAttribute('role')).toBe('toolbar');
  });
});
