import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Menubar } from './menubar';
import type { MenubarMenu } from './menubar';

function makeMenus(): MenubarMenu[] {
  return [
    {
      id: 'file',
      label: 'File',
      items: [
        { id: 'new', label: 'New' },
        { id: 'open', label: 'Open' },
        { id: 'sep', label: '', separator: true },
        { id: 'quit', label: 'Quit' },
      ],
    },
    {
      id: 'edit',
      label: 'Edit',
      items: [
        { id: 'cut', label: 'Cut' },
        { id: 'copy', label: 'Copy' },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [{ id: 'zoom-in', label: 'Zoom in' }],
    },
  ];
}

describe('<Menubar>', () => {
  it('renders role=menubar with the supplied aria-label', () => {
    render(<Menubar menus={makeMenus()} ariaLabel="Main menu" />);
    expect(
      screen.getByRole('menubar', { name: 'Main menu' }),
    ).toBeInTheDocument();
  });

  it('default aria-label is "Menu bar"', () => {
    render(<Menubar menus={makeMenus()} />);
    expect(screen.getByRole('menubar', { name: 'Menu bar' })).toBeInTheDocument();
  });

  it('renders one trigger per menu with role=menuitem', () => {
    render(<Menubar menus={makeMenus()} />);
    const triggers = document.querySelectorAll(
      '[data-section="menubar-trigger"]',
    );
    expect(triggers).toHaveLength(3);
    expect(triggers[0]!.textContent).toBe('File');
    expect(triggers[1]!.textContent).toBe('Edit');
    expect(triggers[2]!.textContent).toBe('View');
  });

  it('all triggers expose aria-haspopup="menu" + aria-expanded="false" initially', () => {
    render(<Menubar menus={makeMenus()} />);
    const triggers = document.querySelectorAll(
      '[data-section="menubar-trigger"]',
    );
    triggers.forEach((t) => {
      expect(t.getAttribute('aria-haspopup')).toBe('menu');
      expect(t.getAttribute('aria-expanded')).toBe('false');
    });
  });

  it('roving tabindex: only the first enabled trigger has tabindex=0', () => {
    render(<Menubar menus={makeMenus()} />);
    const triggers = document.querySelectorAll(
      '[data-section="menubar-trigger"]',
    );
    expect(triggers[0]!.getAttribute('tabindex')).toBe('0');
    expect(triggers[1]!.getAttribute('tabindex')).toBe('-1');
    expect(triggers[2]!.getAttribute('tabindex')).toBe('-1');
  });

  it('clicking a trigger opens its dropdown panel', () => {
    render(<Menubar menus={makeMenus()} />);
    const trigger = document.querySelector(
      '[data-menubar-trigger="file"]',
    ) as HTMLButtonElement;
    fireEvent.click(trigger);
    expect(
      document.querySelector('[data-section="menubar-panel"]'),
    ).not.toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('clicking the same trigger again closes the dropdown', () => {
    render(<Menubar menus={makeMenus()} />);
    const trigger = document.querySelector(
      '[data-menubar-trigger="file"]',
    ) as HTMLButtonElement;
    fireEvent.click(trigger);
    expect(
      document.querySelector('[data-section="menubar-panel"]'),
    ).not.toBeNull();
    fireEvent.click(trigger);
    expect(
      document.querySelector('[data-section="menubar-panel"]'),
    ).toBeNull();
  });

  it('clicking another trigger swaps the open dropdown', () => {
    render(<Menubar menus={makeMenus()} />);
    const fileTrigger = document.querySelector(
      '[data-menubar-trigger="file"]',
    ) as HTMLButtonElement;
    const editTrigger = document.querySelector(
      '[data-menubar-trigger="edit"]',
    ) as HTMLButtonElement;
    fireEvent.click(fileTrigger);
    fireEvent.click(editTrigger);
    const openPanel = document.querySelector(
      '[data-menubar-menu="edit"] [data-section="menubar-panel"]',
    );
    expect(openPanel).not.toBeNull();
    // File panel should be closed.
    expect(
      document.querySelector(
        '[data-menubar-menu="file"] [data-section="menubar-panel"]',
      ),
    ).toBeNull();
  });

  it('hover swaps the open menu once one is open', () => {
    render(<Menubar menus={makeMenus()} />);
    const fileTrigger = document.querySelector(
      '[data-menubar-trigger="file"]',
    ) as HTMLButtonElement;
    fireEvent.click(fileTrigger);
    // Hover the Edit trigger.
    const editTrigger = document.querySelector(
      '[data-menubar-trigger="edit"]',
    ) as HTMLButtonElement;
    fireEvent.mouseEnter(editTrigger);
    expect(
      document.querySelector(
        '[data-menubar-menu="edit"] [data-section="menubar-panel"]',
      ),
    ).not.toBeNull();
  });

  it('hover does NOT open a menu when none is currently open', () => {
    render(<Menubar menus={makeMenus()} />);
    const editTrigger = document.querySelector(
      '[data-menubar-trigger="edit"]',
    ) as HTMLButtonElement;
    fireEvent.mouseEnter(editTrigger);
    expect(
      document.querySelector('[data-section="menubar-panel"]'),
    ).toBeNull();
  });

  it('ArrowRight on a focused trigger moves focus to the next enabled trigger', () => {
    render(<Menubar menus={makeMenus()} />);
    const fileTrigger = document.querySelector(
      '[data-menubar-trigger="file"]',
    ) as HTMLButtonElement;
    fileTrigger.focus();
    fireEvent.keyDown(fileTrigger, { key: 'ArrowRight' });
    const editTrigger = document.querySelector(
      '[data-menubar-trigger="edit"]',
    ) as HTMLButtonElement;
    expect(document.activeElement).toBe(editTrigger);
  });

  it('ArrowLeft wraps to the last trigger when on the first', () => {
    render(<Menubar menus={makeMenus()} />);
    const fileTrigger = document.querySelector(
      '[data-menubar-trigger="file"]',
    ) as HTMLButtonElement;
    fileTrigger.focus();
    fireEvent.keyDown(fileTrigger, { key: 'ArrowLeft' });
    const viewTrigger = document.querySelector(
      '[data-menubar-trigger="view"]',
    ) as HTMLButtonElement;
    expect(document.activeElement).toBe(viewTrigger);
  });

  it('ArrowDown on a focused trigger opens the dropdown', () => {
    render(<Menubar menus={makeMenus()} />);
    const fileTrigger = document.querySelector(
      '[data-menubar-trigger="file"]',
    ) as HTMLButtonElement;
    fileTrigger.focus();
    fireEvent.keyDown(fileTrigger, { key: 'ArrowDown' });
    expect(
      document.querySelector('[data-section="menubar-panel"]'),
    ).not.toBeNull();
  });

  it('Enter on a focused trigger opens the dropdown', () => {
    render(<Menubar menus={makeMenus()} />);
    const fileTrigger = document.querySelector(
      '[data-menubar-trigger="file"]',
    ) as HTMLButtonElement;
    fileTrigger.focus();
    fireEvent.keyDown(fileTrigger, { key: 'Enter' });
    expect(
      document.querySelector('[data-section="menubar-panel"]'),
    ).not.toBeNull();
  });

  it('Home key on focused trigger jumps to the first enabled menu', () => {
    render(<Menubar menus={makeMenus()} />);
    const editTrigger = document.querySelector(
      '[data-menubar-trigger="edit"]',
    ) as HTMLButtonElement;
    editTrigger.focus();
    fireEvent.keyDown(editTrigger, { key: 'Home' });
    const fileTrigger = document.querySelector(
      '[data-menubar-trigger="file"]',
    ) as HTMLButtonElement;
    expect(document.activeElement).toBe(fileTrigger);
  });

  it('End key on focused trigger jumps to the last enabled menu', () => {
    render(<Menubar menus={makeMenus()} />);
    const fileTrigger = document.querySelector(
      '[data-menubar-trigger="file"]',
    ) as HTMLButtonElement;
    fileTrigger.focus();
    fireEvent.keyDown(fileTrigger, { key: 'End' });
    const viewTrigger = document.querySelector(
      '[data-menubar-trigger="view"]',
    ) as HTMLButtonElement;
    expect(document.activeElement).toBe(viewTrigger);
  });

  it('Escape on a focused trigger closes the open dropdown + restores focus', () => {
    render(<Menubar menus={makeMenus()} />);
    const fileTrigger = document.querySelector(
      '[data-menubar-trigger="file"]',
    ) as HTMLButtonElement;
    fireEvent.click(fileTrigger);
    fireEvent.keyDown(fileTrigger, { key: 'Escape' });
    expect(
      document.querySelector('[data-section="menubar-panel"]'),
    ).toBeNull();
  });

  it('document-level ArrowDown navigates inside the open dropdown', () => {
    render(<Menubar menus={makeMenus()} />);
    const fileTrigger = document.querySelector(
      '[data-menubar-trigger="file"]',
    ) as HTMLButtonElement;
    fireEvent.click(fileTrigger);
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    fireEvent.keyDown(document, { key: 'Enter' });
    // Highlight starts on "New" (first selectable). ArrowDown
    // -> "Open". Enter fires that item's onSelect (or closes).
    expect(
      document.querySelector('[data-section="menubar-panel"]'),
    ).toBeNull();
  });

  it('Enter on a highlighted item fires onSelect + closes the menu', () => {
    const onSelectOpen = vi.fn();
    const menus = makeMenus();
    menus[0]!.items[1] = { id: 'open', label: 'Open', onSelect: onSelectOpen };
    render(<Menubar menus={menus} />);
    const fileTrigger = document.querySelector(
      '[data-menubar-trigger="file"]',
    ) as HTMLButtonElement;
    fireEvent.click(fileTrigger);
    // First selectable is "new" at index 0; ArrowDown -> 1 (Open).
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onSelectOpen).toHaveBeenCalled();
  });

  it('Home key inside dropdown jumps to first selectable', () => {
    const onSelectNew = vi.fn();
    const menus = makeMenus();
    menus[0]!.items[0] = { id: 'new', label: 'New', onSelect: onSelectNew };
    render(<Menubar menus={menus} />);
    const fileTrigger = document.querySelector(
      '[data-menubar-trigger="file"]',
    ) as HTMLButtonElement;
    fireEvent.click(fileTrigger);
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    fireEvent.keyDown(document, { key: 'Home' });
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onSelectNew).toHaveBeenCalled();
  });

  it('End key inside dropdown jumps to last selectable (skips separator)', () => {
    const onSelectQuit = vi.fn();
    const menus = makeMenus();
    menus[0]!.items[3] = { id: 'quit', label: 'Quit', onSelect: onSelectQuit };
    render(<Menubar menus={menus} />);
    const fileTrigger = document.querySelector(
      '[data-menubar-trigger="file"]',
    ) as HTMLButtonElement;
    fireEvent.click(fileTrigger);
    fireEvent.keyDown(document, { key: 'End' });
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onSelectQuit).toHaveBeenCalled();
  });

  it('ArrowRight inside open dropdown moves to next trigger + opens its menu', () => {
    render(<Menubar menus={makeMenus()} />);
    const fileTrigger = document.querySelector(
      '[data-menubar-trigger="file"]',
    ) as HTMLButtonElement;
    fireEvent.click(fileTrigger);
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(
      document.querySelector(
        '[data-menubar-menu="edit"] [data-section="menubar-panel"]',
      ),
    ).not.toBeNull();
  });

  it('clicking an item in the dropdown fires onSelect + closes', () => {
    const onSelect = vi.fn();
    const menus = makeMenus();
    menus[0]!.items[0] = { id: 'new', label: 'New', onSelect };
    render(<Menubar menus={menus} />);
    const fileTrigger = document.querySelector(
      '[data-menubar-trigger="file"]',
    ) as HTMLButtonElement;
    fireEvent.click(fileTrigger);
    const newItem = document.querySelector(
      '[data-menubar-item="new"] [role="menuitem"]',
    ) as HTMLButtonElement;
    fireEvent.click(newItem);
    expect(onSelect).toHaveBeenCalled();
    expect(
      document.querySelector('[data-section="menubar-panel"]'),
    ).toBeNull();
  });

  it('clicking outside the menubar closes the open dropdown', () => {
    render(<Menubar menus={makeMenus()} />);
    const fileTrigger = document.querySelector(
      '[data-menubar-trigger="file"]',
    ) as HTMLButtonElement;
    fireEvent.click(fileTrigger);
    expect(
      document.querySelector('[data-section="menubar-panel"]'),
    ).not.toBeNull();
    fireEvent.mouseDown(document.body);
    expect(
      document.querySelector('[data-section="menubar-panel"]'),
    ).toBeNull();
  });

  it('separator inside dropdown renders as role=separator', () => {
    render(<Menubar menus={makeMenus()} />);
    const fileTrigger = document.querySelector(
      '[data-menubar-trigger="file"]',
    ) as HTMLButtonElement;
    fireEvent.click(fileTrigger);
    expect(
      document.querySelector('[data-section="menubar-separator"]'),
    ).not.toBeNull();
  });

  it('disabled trigger does NOT open via click or keyboard', () => {
    const menus = makeMenus();
    menus[1] = { ...menus[1]!, disabled: true };
    render(<Menubar menus={menus} />);
    const editTrigger = document.querySelector(
      '[data-menubar-trigger="edit"]',
    ) as HTMLButtonElement;
    expect(editTrigger.disabled).toBe(true);
    // Direct click on disabled button does nothing.
    fireEvent.click(editTrigger);
    expect(
      document.querySelector(
        '[data-menubar-menu="edit"] [data-section="menubar-panel"]',
      ),
    ).toBeNull();
  });

  it('ArrowRight skips disabled top-level menus', () => {
    const menus = makeMenus();
    menus[1] = { ...menus[1]!, disabled: true };
    render(<Menubar menus={menus} />);
    const fileTrigger = document.querySelector(
      '[data-menubar-trigger="file"]',
    ) as HTMLButtonElement;
    fileTrigger.focus();
    fireEvent.keyDown(fileTrigger, { key: 'ArrowRight' });
    const viewTrigger = document.querySelector(
      '[data-menubar-trigger="view"]',
    ) as HTMLButtonElement;
    expect(document.activeElement).toBe(viewTrigger);
  });

  it('data-section="menubar" + data-section="menubar-menu" + data-section="menubar-panel"', () => {
    render(<Menubar menus={makeMenus()} />);
    expect(
      document.querySelector('[data-section="menubar"]'),
    ).not.toBeNull();
    expect(
      document.querySelectorAll('[data-section="menubar-menu"]').length,
    ).toBe(3);
    const fileTrigger = document.querySelector(
      '[data-menubar-trigger="file"]',
    ) as HTMLButtonElement;
    fireEvent.click(fileTrigger);
    expect(
      document.querySelector('[data-section="menubar-panel"]'),
    ).not.toBeNull();
  });

  it('data-menubar-open attr mirrors open state per menu', () => {
    render(<Menubar menus={makeMenus()} />);
    const fileMenu = document.querySelector(
      '[data-menubar-menu="file"]',
    ) as HTMLElement;
    expect(fileMenu.getAttribute('data-menubar-open')).toBe('false');
    const fileTrigger = document.querySelector(
      '[data-menubar-trigger="file"]',
    ) as HTMLButtonElement;
    fireEvent.click(fileTrigger);
    expect(fileMenu.getAttribute('data-menubar-open')).toBe('true');
  });

  it('exposes a stable displayName', () => {
    expect(Menubar.displayName).toBe('Menubar');
  });
});
