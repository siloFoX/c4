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

  // -- v1.11.404 sections + sub-menus + Home/End (TODO 11.386) ---

  it('renders a section heading row when sectionHeading=true', () => {
    const items: ContextMenuItem[] = [
      { id: 'h-edit', label: 'Edit', sectionHeading: true },
      { id: 'cut', label: 'Cut' },
      { id: 'copy', label: 'Copy' },
    ];
    render(
      <ContextMenu trigger={<button>Target</button>} items={items} />,
    );
    openMenu();
    expect(
      document.querySelector('[data-section="context-menu-section-heading"]'),
    ).toHaveTextContent('Edit');
  });

  it('section heading is not selectable via keyboard nav', () => {
    const items: ContextMenuItem[] = [
      { id: 'h-edit', label: 'Edit', sectionHeading: true },
      { id: 'cut', label: 'Cut' },
    ];
    const { container: _c } = render(
      <ContextMenu trigger={<button>Target</button>} items={items} />,
    );
    openMenu();
    // Highlight starts on first SELECTABLE (skips heading).
    // ArrowDown wraps -> should also skip heading.
    const items_buttons = document.querySelectorAll('[role="menuitem"]');
    // Section heading does NOT render a menuitem button.
    expect(items_buttons.length).toBe(1);
  });

  it('Home jumps to first selectable item', () => {
    const items: ContextMenuItem[] = [
      { id: 'h', label: 'H', sectionHeading: true },
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' },
    ];
    const onSelectA = vi.fn();
    items[1]!.onSelect = onSelectA;
    render(
      <ContextMenu trigger={<button>Target</button>} items={items} />,
    );
    openMenu();
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    fireEvent.keyDown(document, { key: 'Home' });
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onSelectA).toHaveBeenCalled();
  });

  it('End jumps to last selectable item', () => {
    const onSelectC = vi.fn();
    const items: ContextMenuItem[] = [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C', onSelect: onSelectC },
    ];
    render(
      <ContextMenu trigger={<button>Target</button>} items={items} />,
    );
    openMenu();
    fireEvent.keyDown(document, { key: 'End' });
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onSelectC).toHaveBeenCalled();
  });

  it('parent item with `items` renders a trailing chevron', () => {
    const items: ContextMenuItem[] = [
      {
        id: 'more',
        label: 'More',
        items: [
          { id: 'a', label: 'A' },
        ],
      },
    ];
    render(
      <ContextMenu trigger={<button>Target</button>} items={items} />,
    );
    openMenu();
    expect(
      document.querySelector('[data-section="context-menu-submenu-chevron"]'),
    ).not.toBeNull();
  });

  it('parent item exposes aria-haspopup="menu" + aria-expanded', () => {
    const items: ContextMenuItem[] = [
      {
        id: 'more',
        label: 'More',
        items: [{ id: 'a', label: 'A' }],
      },
    ];
    render(
      <ContextMenu trigger={<button>Target</button>} items={items} />,
    );
    openMenu();
    const parentBtn = document.querySelector(
      '[data-context-menu-item="more"] [role="menuitem"]',
    ) as HTMLElement;
    expect(parentBtn.getAttribute('aria-haspopup')).toBe('menu');
    expect(parentBtn.getAttribute('aria-expanded')).toBe('false');
  });

  it('ArrowRight on a parent item opens the sub-menu', () => {
    const items: ContextMenuItem[] = [
      {
        id: 'more',
        label: 'More',
        items: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ],
      },
    ];
    render(
      <ContextMenu trigger={<button>Target</button>} items={items} />,
    );
    openMenu();
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(
      document.querySelector('[data-section="context-menu-submenu"]'),
    ).not.toBeNull();
  });

  it('Enter on a parent item also opens the sub-menu (does not fire onSelect)', () => {
    const onSelect = vi.fn();
    const items: ContextMenuItem[] = [
      {
        id: 'more',
        label: 'More',
        onSelect,
        items: [{ id: 'a', label: 'A' }],
      },
    ];
    render(
      <ContextMenu trigger={<button>Target</button>} items={items} />,
    );
    openMenu();
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(
      document.querySelector('[data-section="context-menu-submenu"]'),
    ).not.toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('ArrowLeft closes the sub-menu and returns focus to parent', () => {
    const items: ContextMenuItem[] = [
      {
        id: 'more',
        label: 'More',
        items: [{ id: 'a', label: 'A' }],
      },
    ];
    render(
      <ContextMenu trigger={<button>Target</button>} items={items} />,
    );
    openMenu();
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(
      document.querySelector('[data-section="context-menu-submenu"]'),
    ).not.toBeNull();
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(
      document.querySelector('[data-section="context-menu-submenu"]'),
    ).toBeNull();
  });

  it('Enter on a sub-menu item fires onSelect + closes ALL menus', () => {
    const onSelectInner = vi.fn();
    const items: ContextMenuItem[] = [
      {
        id: 'more',
        label: 'More',
        items: [
          { id: 'a', label: 'A', onSelect: onSelectInner },
        ],
      },
    ];
    render(
      <ContextMenu trigger={<button>Target</button>} items={items} />,
    );
    openMenu();
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onSelectInner).toHaveBeenCalled();
    expect(
      document.querySelector('[data-section="context-menu"]'),
    ).toBeNull();
  });

  it('hovering a parent item auto-opens its sub-menu', () => {
    const items: ContextMenuItem[] = [
      { id: 'first', label: 'First' },
      {
        id: 'more',
        label: 'More',
        items: [{ id: 'a', label: 'A' }],
      },
    ];
    render(
      <ContextMenu trigger={<button>Target</button>} items={items} />,
    );
    openMenu();
    const parentBtn = document.querySelector(
      '[data-context-menu-item="more"] [role="menuitem"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(parentBtn);
    expect(
      document.querySelector('[data-section="context-menu-submenu"]'),
    ).not.toBeNull();
  });

  it('hovering a non-parent item closes any active sub-menu', () => {
    const items: ContextMenuItem[] = [
      { id: 'first', label: 'First' },
      {
        id: 'more',
        label: 'More',
        items: [{ id: 'a', label: 'A' }],
      },
    ];
    render(
      <ContextMenu trigger={<button>Target</button>} items={items} />,
    );
    openMenu();
    // Open submenu via hover.
    const parentBtn = document.querySelector(
      '[data-context-menu-item="more"] [role="menuitem"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(parentBtn);
    expect(
      document.querySelector('[data-section="context-menu-submenu"]'),
    ).not.toBeNull();
    // Now hover the leaf item -> submenu should close.
    const leafBtn = document.querySelector(
      '[data-context-menu-item="first"] [role="menuitem"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(leafBtn);
    expect(
      document.querySelector('[data-section="context-menu-submenu"]'),
    ).toBeNull();
  });

  it('separator inside sub-menu still renders as role=separator', () => {
    const items: ContextMenuItem[] = [
      {
        id: 'more',
        label: 'More',
        items: [
          { id: 'a', label: 'A' },
          { id: 'sep', label: '', separator: true },
          { id: 'b', label: 'B' },
        ],
      },
    ];
    render(
      <ContextMenu trigger={<button>Target</button>} items={items} />,
    );
    openMenu();
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    const sub = document.querySelector(
      '[data-section="context-menu-submenu"]',
    ) as HTMLElement;
    expect(sub.querySelector('[role="separator"]')).not.toBeNull();
  });

  it('clicking outside both root + sub-menu closes everything', () => {
    const items: ContextMenuItem[] = [
      {
        id: 'more',
        label: 'More',
        items: [{ id: 'a', label: 'A' }],
      },
    ];
    render(
      <ContextMenu trigger={<button>Target</button>} items={items} />,
    );
    openMenu();
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(
      document.querySelector('[data-section="context-menu-submenu"]'),
    ).not.toBeNull();
    fireEvent.mouseDown(document.body);
    expect(
      document.querySelector('[data-section="context-menu"]'),
    ).toBeNull();
    expect(
      document.querySelector('[data-section="context-menu-submenu"]'),
    ).toBeNull();
  });

  it('data-section="context-menu" on the root portal panel', () => {
    const items: ContextMenuItem[] = [{ id: 'a', label: 'A' }];
    render(
      <ContextMenu trigger={<button>Target</button>} items={items} />,
    );
    openMenu();
    expect(
      document.querySelector('[data-section="context-menu"]'),
    ).not.toBeNull();
  });
});
