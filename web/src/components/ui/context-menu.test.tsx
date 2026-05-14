import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContextMenu } from './context-menu';
import type { ContextMenuItem } from './context-menu';

function openMenu(triggerName = 'Target') {
  const trigger = screen.getByText(triggerName);
  fireEvent.contextMenu(trigger, { clientX: 50, clientY: 60 });
  return trigger;
}

describe('<ContextMenu>', () => {
  it('opens at click coordinates on right-click and renders all items', () => {
    const items: ContextMenuItem[] = [
      { id: 'a', label: 'Open' },
      { id: 'b', label: 'Rename' },
      { id: 'c', label: 'Delete' },
    ];
    render(<ContextMenu trigger={<div>Target</div>} items={items} />);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    openMenu();
    const menu = screen.getByRole('menu');
    expect(menu).toBeInTheDocument();
    expect(menu).toHaveStyle({ top: '60px', left: '50px' });
    expect(screen.getAllByRole('menuitem')).toHaveLength(3);
  });

  it('clicking an item calls onSelect and closes the menu', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const items: ContextMenuItem[] = [
      { id: 'a', label: 'Open', onSelect },
      { id: 'b', label: 'Rename' },
    ];
    render(<ContextMenu trigger={<div>Target</div>} items={items} />);
    openMenu();
    await user.click(screen.getByRole('menuitem', { name: 'Open' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('ArrowDown advances highlight, ArrowUp moves it back', async () => {
    const user = userEvent.setup();
    const items: ContextMenuItem[] = [
      { id: 'a', label: 'One' },
      { id: 'b', label: 'Two' },
      { id: 'c', label: 'Three' },
    ];
    render(<ContextMenu trigger={<div>Target</div>} items={items} />);
    openMenu();
    // initial highlight on first item
    expect(screen.getByRole('menuitem', { name: 'One' }).className).toMatch(
      /bg-accent/,
    );
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Two' }).className).toMatch(
      /bg-accent/,
    );
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitem', { name: 'One' }).className).toMatch(
      /bg-accent/,
    );
  });

  it('Enter activates the highlighted item', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const items: ContextMenuItem[] = [
      { id: 'a', label: 'First', onSelect },
      { id: 'b', label: 'Second' },
    ];
    render(<ContextMenu trigger={<div>Target</div>} items={items} />);
    openMenu();
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('Escape closes the menu', async () => {
    const user = userEvent.setup();
    const items: ContextMenuItem[] = [{ id: 'a', label: 'One' }];
    render(<ContextMenu trigger={<button>Target</button>} items={items} />);
    openMenu();
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('mousedown outside the menu closes it', () => {
    const items: ContextMenuItem[] = [{ id: 'a', label: 'One' }];
    render(
      <div>
        <ContextMenu trigger={<div>Target</div>} items={items} />
        <div data-testid="outside">outside</div>
      </div>,
    );
    openMenu();
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('disabled items are not selectable and ArrowDown skips them', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const items: ContextMenuItem[] = [
      { id: 'a', label: 'One' },
      { id: 'b', label: 'Two', disabled: true, onSelect },
      { id: 'c', label: 'Three' },
    ];
    render(<ContextMenu trigger={<div>Target</div>} items={items} />);
    openMenu();
    const disabled = screen.getByRole('menuitem', { name: 'Two' });
    expect(disabled).toHaveAttribute('aria-disabled', 'true');
    await user.click(disabled);
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Three' }).className).toMatch(
      /bg-accent/,
    );
  });

  it('renders a separator with role="separator"', () => {
    const items: ContextMenuItem[] = [
      { id: 'a', label: 'One' },
      { id: 'sep', label: '', separator: true },
      { id: 'b', label: 'Two' },
    ];
    render(<ContextMenu trigger={<div>Target</div>} items={items} />);
    openMenu();
    expect(screen.getByRole('separator')).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem')).toHaveLength(2);
  });

  it('danger items get the destructive text class', () => {
    const items: ContextMenuItem[] = [
      { id: 'a', label: 'Delete', danger: true },
    ];
    render(<ContextMenu trigger={<div>Target</div>} items={items} />);
    openMenu();
    const item = screen.getByRole('menuitem', { name: 'Delete' });
    expect(item.className).toMatch(/text-destructive/);
  });

  it('menu container exposes role="menu" with default aria-label', () => {
    const items: ContextMenuItem[] = [{ id: 'a', label: 'One' }];
    render(<ContextMenu trigger={<div>Target</div>} items={items} />);
    openMenu();
    expect(screen.getByRole('menu')).toHaveAttribute(
      'aria-label',
      'Context menu',
    );
  });

  it('honours a custom ariaLabel and merges className on the menu', () => {
    const items: ContextMenuItem[] = [{ id: 'a', label: 'One' }];
    render(
      <ContextMenu
        trigger={<div>Target</div>}
        items={items}
        ariaLabel="Row actions"
        className="custom-menu"
      />,
    );
    openMenu();
    const menu = screen.getByRole('menu');
    expect(menu).toHaveAttribute('aria-label', 'Row actions');
    expect(menu.className).toMatch(/custom-menu/);
  });

  it('forwards a ref to the trigger element', () => {
    const ref = createRef<HTMLElement>();
    const items: ContextMenuItem[] = [{ id: 'a', label: 'One' }];
    render(
      <ContextMenu
        ref={ref}
        trigger={<button>Target</button>}
        items={items}
      />,
    );
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    expect(ref.current?.textContent).toBe('Target');
  });
});
