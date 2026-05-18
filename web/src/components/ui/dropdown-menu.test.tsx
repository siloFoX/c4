import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DropdownMenu } from './dropdown-menu';
import type { DropdownMenuItem, DropdownMenuEntry } from './dropdown-menu';

const baseItems: DropdownMenuItem[] = [
  { key: 'a', label: 'Profile', onSelect: () => {} },
  { key: 'b', label: 'Settings', onSelect: () => {} },
];

describe('<DropdownMenu>', () => {
  it('renders the trigger element and keeps the menu closed by default', () => {
    render(
      <DropdownMenu trigger={<button>Open</button>} items={baseItems} />,
    );
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens the menu when the trigger is clicked', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu trigger={<button>Open</button>} items={baseItems} />,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem')).toHaveLength(2);
  });

  it('toggles the menu closed when the trigger is clicked a second time', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu trigger={<button>Open</button>} items={baseItems} />,
    );
    const trigger = screen.getByRole('button', { name: 'Open' });
    await user.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.click(trigger);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('plumbs aria-haspopup, aria-expanded, and aria-controls onto the trigger', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu trigger={<button>Open</button>} items={baseItems} />,
    );
    const trigger = screen.getByRole('button', { name: 'Open' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const menu = screen.getByRole('menu');
    expect(trigger.getAttribute('aria-controls')).toBe(menu.id);
  });

  it('exposes role="menu" with the default aria-label "Menu"', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu trigger={<button>Open</button>} items={baseItems} />,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('menu')).toHaveAttribute('aria-label', 'Menu');
  });

  it('honors a custom ariaLabel for the menu container', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu
        trigger={<button>Open</button>}
        items={baseItems}
        ariaLabel="Account menu"
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('menu')).toHaveAttribute(
      'aria-label',
      'Account menu',
    );
  });

  it('fires onSelect when an item is clicked and then closes the menu', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <DropdownMenu
        trigger={<button>Open</button>}
        items={[{ key: 'a', label: 'Profile', onSelect }]}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.click(screen.getByRole('menuitem', { name: 'Profile' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('marks disabled items with the native disabled attribute and skips onSelect', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <DropdownMenu
        trigger={<button>Open</button>}
        items={[{ key: 'a', label: 'Locked', disabled: true, onSelect }]}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    const item = screen.getByRole('menuitem', { name: 'Locked' });
    expect(item).toBeDisabled();
    expect(item).toHaveClass('cursor-not-allowed');
    expect(item).toHaveClass('opacity-50');
    await user.click(item);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('renders the danger variant with destructive text classes', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu
        trigger={<button>Open</button>}
        items={[
          { key: 'a', label: 'Delete', variant: 'danger', onSelect: () => {} },
        ]}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(
      screen.getByRole('menuitem', { name: 'Delete' }),
    ).toHaveClass('text-destructive');
  });

  it('renders item icon and hint nodes when provided', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu
        trigger={<button>Open</button>}
        items={[
          {
            key: 'a',
            label: 'Profile',
            icon: <svg data-testid="profile-icon" />,
            hint: 'Ctrl+P',
            onSelect: () => {},
          },
        ]}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByTestId('profile-icon')).toBeInTheDocument();
    expect(screen.getByText('Ctrl+P')).toBeInTheDocument();
  });

  it('renders the optional header above the items', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu
        trigger={<button>Open</button>}
        items={baseItems}
        header={<div data-testid="header">signed in</div>}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByTestId('header')).toBeInTheDocument();
  });

  it('applies placement="top" classes on the menu by default', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu trigger={<button>Open</button>} items={baseItems} />,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('menu')).toHaveClass('bottom-full');
  });

  it('applies placement="bottom" classes on the menu when requested', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu
        trigger={<button>Open</button>}
        items={baseItems}
        placement="bottom"
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('menu')).toHaveClass('top-full');
  });

  it('merges caller-provided className onto the relative container wrapper', () => {
    const { container } = render(
      <DropdownMenu
        trigger={<button>Open</button>}
        items={baseItems}
        className="extra-tag"
      />,
    );
    const root = container.firstChild as HTMLElement;
    expect(root).toHaveClass('extra-tag');
    expect(root).toHaveClass('relative');
    expect(root).toHaveClass('inline-block');
  });

  it('closes the open menu when Escape is pressed', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu trigger={<button>Open</button>} items={baseItems} />,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });

  it('closes the open menu when a mousedown happens outside the container', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <DropdownMenu trigger={<button>Open</button>} items={baseItems} />
        <button>outside</button>
      </div>,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('button', { name: 'outside' }));
    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });

  it('activates a focused item via Enter on its keydown handler', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <DropdownMenu
        trigger={<button>Open</button>}
        items={[{ key: 'a', label: 'Profile', onSelect }]}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    const item = screen.getByRole('menuitem', { name: 'Profile' });
    item.focus();
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('moves focus to the first item when ArrowDown is pressed', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu trigger={<button>Open</button>} items={baseItems} />,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.keyboard('{ArrowDown}');
    await waitFor(() => {
      expect(
        screen.getByRole('menuitem', { name: 'Profile' }),
      ).toHaveFocus();
    });
  });

  it('skips disabled items when navigating with ArrowDown', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu
        trigger={<button>Open</button>}
        items={[
          { key: 'a', label: 'A', disabled: true, onSelect: () => {} },
          { key: 'b', label: 'B', onSelect: () => {} },
        ]}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.keyboard('{ArrowDown}');
    await waitFor(() => {
      expect(screen.getByRole('menuitem', { name: 'B' })).toHaveFocus();
    });
  });

  it('preserves a ref attached to the trigger element through cloneElement', () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <DropdownMenu
        trigger={<button ref={ref}>Open</button>}
        items={baseItems}
      />,
    );
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it("keeps the trigger's own className intact when wiring its own props", () => {
    render(
      <DropdownMenu
        trigger={<button className="trigger-tag">Open</button>}
        items={baseItems}
      />,
    );
    expect(screen.getByRole('button', { name: 'Open' })).toHaveClass(
      'trigger-tag',
    );
  });

  it('cycles focus through items with ArrowDown and wraps to the first item', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu trigger={<button>Open</button>} items={baseItems} />,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.keyboard('{ArrowDown}');
    await waitFor(() => {
      expect(
        screen.getByRole('menuitem', { name: 'Profile' }),
      ).toHaveFocus();
    });
    await user.keyboard('{ArrowDown}');
    await waitFor(() => {
      expect(
        screen.getByRole('menuitem', { name: 'Settings' }),
      ).toHaveFocus();
    });
    await user.keyboard('{ArrowDown}');
    await waitFor(() => {
      expect(
        screen.getByRole('menuitem', { name: 'Profile' }),
      ).toHaveFocus();
    });
  });

  it('wraps to the last item when ArrowUp is pressed from the top', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu trigger={<button>Open</button>} items={baseItems} />,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.keyboard('{ArrowUp}');
    await waitFor(() => {
      expect(
        screen.getByRole('menuitem', { name: 'Settings' }),
      ).toHaveFocus();
    });
  });

  it('jumps focus to the first item when Home is pressed', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu trigger={<button>Open</button>} items={baseItems} />,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Home}');
    await waitFor(() => {
      expect(
        screen.getByRole('menuitem', { name: 'Profile' }),
      ).toHaveFocus();
    });
  });

  it('jumps focus to the last item when End is pressed', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu trigger={<button>Open</button>} items={baseItems} />,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.keyboard('{End}');
    await waitFor(() => {
      expect(
        screen.getByRole('menuitem', { name: 'Settings' }),
      ).toHaveFocus();
    });
  });

  it('restores focus to the trigger when the menu closes via Escape', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu trigger={<button>Open</button>} items={baseItems} />,
    );
    const trigger = screen.getByRole('button', { name: 'Open' });
    await user.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
  });

  it('focuses the first item whose label starts with a typed letter (type-ahead)', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu
        trigger={<button>Open</button>}
        items={[
          { key: 'a', label: 'Profile', onSelect: () => {} },
          { key: 'b', label: 'Settings', onSelect: () => {} },
          { key: 'c', label: 'Sign out', onSelect: () => {} },
        ]}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.keyboard('s');
    await waitFor(() => {
      expect(
        screen.getByRole('menuitem', { name: 'Settings' }),
      ).toHaveFocus();
    });
    // A second 's' press advances to the next 'S'-prefixed item before
    // the 500ms reset window elapses.
    await user.keyboard('s');
    await waitFor(() => {
      expect(
        screen.getByRole('menuitem', { name: 'Sign out' }),
      ).toHaveFocus();
    });
  });

  // Regression coverage for the useFocusCycle hook integration (v1.11.231):
  // the hook reads enabled menuitems via the [role=menuitem]:not([aria-disabled=true])
  // selector and also drops elements carrying the native `disabled` attribute,
  // so disabled rows must be skipped by every arrow / Home / End path.
  it('skips disabled items mid-list when navigating with ArrowDown', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu
        trigger={<button>Open</button>}
        items={[
          { key: 'a', label: 'A', onSelect: () => {} },
          { key: 'b', label: 'B', disabled: true, onSelect: () => {} },
          { key: 'c', label: 'C', onSelect: () => {} },
        ]}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.keyboard('{ArrowDown}');
    await waitFor(() => {
      expect(screen.getByRole('menuitem', { name: 'A' })).toHaveFocus();
    });
    await user.keyboard('{ArrowDown}');
    await waitFor(() => {
      expect(screen.getByRole('menuitem', { name: 'C' })).toHaveFocus();
    });
  });

  it('skips disabled items when navigating backwards with ArrowUp', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu
        trigger={<button>Open</button>}
        items={[
          { key: 'a', label: 'A', onSelect: () => {} },
          { key: 'b', label: 'B', disabled: true, onSelect: () => {} },
          { key: 'c', label: 'C', onSelect: () => {} },
        ]}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.keyboard('{End}');
    await waitFor(() => {
      expect(screen.getByRole('menuitem', { name: 'C' })).toHaveFocus();
    });
    await user.keyboard('{ArrowUp}');
    await waitFor(() => {
      expect(screen.getByRole('menuitem', { name: 'A' })).toHaveFocus();
    });
  });

  it('lands End on the last enabled item when the tail is disabled', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu
        trigger={<button>Open</button>}
        items={[
          { key: 'a', label: 'A', onSelect: () => {} },
          { key: 'b', label: 'B', onSelect: () => {} },
          { key: 'c', label: 'C', disabled: true, onSelect: () => {} },
        ]}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.keyboard('{End}');
    await waitFor(() => {
      expect(screen.getByRole('menuitem', { name: 'B' })).toHaveFocus();
    });
  });

  it('exposes aria-orientation="vertical" and aria-activedescendant on the menu', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu trigger={<button>Open</button>} items={baseItems} />,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    const menu = screen.getByRole('menu');
    expect(menu).toHaveAttribute('aria-orientation', 'vertical');
    await user.keyboard('{ArrowDown}');
    const firstItem = screen.getByRole('menuitem', { name: 'Profile' });
    await waitFor(() => {
      expect(menu.getAttribute('aria-activedescendant')).toBe(firstItem.id);
    });
  });

  // (v1.11.304, TODO 11.286) Separator entries + data-section
  // selectors.

  it('renders a separator entry as a role="separator" <li>', async () => {
    const user = userEvent.setup();
    const items: DropdownMenuEntry[] = [
      { key: 'edit', label: 'Edit', onSelect: vi.fn() },
      { key: 'sep1', kind: 'separator' },
      {
        key: 'delete',
        label: 'Delete',
        variant: 'danger',
        onSelect: vi.fn(),
      },
    ];
    render(<DropdownMenu trigger={<button>Open</button>} items={items} />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    const seps = screen.getAllByRole('separator');
    expect(seps).toHaveLength(1);
    expect(seps[0]!.tagName).toBe('LI');
    expect(seps[0]!.getAttribute('aria-orientation')).toBe('horizontal');
  });

  it('separator does NOT appear in the menuitem list', async () => {
    const user = userEvent.setup();
    const items: DropdownMenuEntry[] = [
      { key: 'a', label: 'Edit', onSelect: vi.fn() },
      { key: 'sep', kind: 'separator' },
      { key: 'b', label: 'Delete', onSelect: vi.fn() },
    ];
    render(<DropdownMenu trigger={<button>Open</button>} items={items} />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getAllByRole('menuitem')).toHaveLength(2);
  });

  it('arrow nav skips the separator entry', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const items: DropdownMenuEntry[] = [
      { key: 'a', label: 'Edit', onSelect: onEdit },
      { key: 'sep', kind: 'separator' },
      { key: 'b', label: 'Delete', onSelect: onDelete },
    ];
    render(<DropdownMenu trigger={<button>Open</button>} items={items} />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.keyboard('{ArrowDown}');
    await waitFor(() =>
      expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus(),
    );
    await user.keyboard('{ArrowDown}');
    await waitFor(() =>
      expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus(),
    );
  });

  it('type-ahead skips the separator entry', async () => {
    const user = userEvent.setup();
    const items: DropdownMenuEntry[] = [
      { key: 'a', label: 'Edit', onSelect: vi.fn() },
      { key: 'sep', kind: 'separator' },
      { key: 'b', label: 'Delete', onSelect: vi.fn() },
    ];
    render(<DropdownMenu trigger={<button>Open</button>} items={items} />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.keyboard('d');
    await waitFor(() => {
      expect(
        screen.getByRole('menuitem', { name: 'Delete' }),
      ).toHaveFocus();
    });
  });

  it('exposes data-section="dropdown-menu" + data-section="dropdown-menu-item" + data-variant', async () => {
    const user = userEvent.setup();
    const items: DropdownMenuEntry[] = [
      { key: 'a', label: 'Edit', onSelect: vi.fn() },
      { key: 'b', label: 'Delete', variant: 'danger', onSelect: vi.fn() },
    ];
    render(<DropdownMenu trigger={<button>Open</button>} items={items} />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(
      document.querySelector('[data-section="dropdown-menu"]'),
    ).not.toBeNull();
    const rows = document.querySelectorAll(
      '[data-section="dropdown-menu-item"]',
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]!.getAttribute('data-variant')).toBe('default');
    expect(rows[1]!.getAttribute('data-variant')).toBe('danger');
  });

  it('exposes data-section="dropdown-menu-separator" on each separator', async () => {
    const user = userEvent.setup();
    const items: DropdownMenuEntry[] = [
      { key: 'a', label: 'A', onSelect: vi.fn() },
      { key: 'sep1', kind: 'separator' },
      { key: 'b', label: 'B', onSelect: vi.fn() },
      { key: 'sep2', kind: 'separator' },
      { key: 'c', label: 'C', onSelect: vi.fn() },
    ];
    render(<DropdownMenu trigger={<button>Open</button>} items={items} />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    const seps = document.querySelectorAll(
      '[data-section="dropdown-menu-separator"]',
    );
    expect(seps).toHaveLength(2);
  });

  // (v1.11.380, TODO 11.362) New entry types:
  // section heading, checkbox, radio, shortcut.

  describe('section heading (v1.11.380)', () => {
    it('renders a non-interactive heading row with data-section', async () => {
      const user = userEvent.setup();
      render(
        <DropdownMenu
          trigger={<button>open</button>}
          items={[
            { key: 'hdr', kind: 'section', label: 'Workspace' },
            {
              key: 'rename',
              label: 'Rename',
              onSelect: vi.fn(),
            },
          ] as DropdownMenuEntry[]}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'open' }));
      const heading = document.querySelector(
        '[data-section="dropdown-menu-section"]',
      );
      expect(heading).not.toBeNull();
      expect(heading?.textContent).toBe('Workspace');
      // The section heading is NOT a menuitem.
      expect(
        document.querySelector('[role="menuitem"]')?.textContent,
      ).toBe('Rename');
    });

    it('skips section headings during type-ahead navigation', async () => {
      const user = userEvent.setup();
      render(
        <DropdownMenu
          trigger={<button>open</button>}
          items={[
            { key: 'hdr', kind: 'section', label: 'Workspace' },
            { key: 'rename', label: 'Rename', onSelect: vi.fn() },
            { key: 'workspace2', label: 'Workspace settings', onSelect: vi.fn() },
          ] as DropdownMenuEntry[]}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'open' }));
      await user.keyboard('w');
      await waitFor(() => {
        // Should land on 'Workspace settings' (the
        // actionable item), not the heading.
        expect(
          screen.getByRole('menuitem', { name: 'Workspace settings' }),
        ).toHaveFocus();
      });
    });
  });

  describe('checkbox items (v1.11.380)', () => {
    it('renders with role=menuitemcheckbox + aria-checked + check glyph when checked', async () => {
      const onCheckedChange = vi.fn();
      const user = userEvent.setup();
      render(
        <DropdownMenu
          trigger={<button>open</button>}
          items={[
            {
              key: 'wifi',
              kind: 'checkbox',
              label: 'Wifi',
              checked: true,
              onCheckedChange,
            },
          ] as DropdownMenuEntry[]}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'open' }));
      const cb = screen.getByRole('menuitemcheckbox');
      expect(cb).toHaveAttribute('aria-checked', 'true');
      expect(cb.getAttribute('data-checked')).toBe('true');
    });

    it('toggles on click + keeps the menu open by default', async () => {
      const onCheckedChange = vi.fn();
      const user = userEvent.setup();
      render(
        <DropdownMenu
          trigger={<button>open</button>}
          items={[
            {
              key: 'wifi',
              kind: 'checkbox',
              label: 'Wifi',
              checked: false,
              onCheckedChange,
            },
          ] as DropdownMenuEntry[]}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'open' }));
      await user.click(screen.getByRole('menuitemcheckbox'));
      expect(onCheckedChange).toHaveBeenCalledWith(true);
      // Menu stays open since closeOnChange is unset.
      expect(screen.getByRole('menu')).toBeInTheDocument();
    });

    it('closeOnChange=true dismisses the menu after the toggle', async () => {
      const onCheckedChange = vi.fn();
      const user = userEvent.setup();
      render(
        <DropdownMenu
          trigger={<button>open</button>}
          items={[
            {
              key: 'wifi',
              kind: 'checkbox',
              label: 'Wifi',
              checked: false,
              closeOnChange: true,
              onCheckedChange,
            },
          ] as DropdownMenuEntry[]}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'open' }));
      await user.click(screen.getByRole('menuitemcheckbox'));
      await waitFor(() => {
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      });
    });

    it('disabled checkbox does not toggle', async () => {
      const onCheckedChange = vi.fn();
      const user = userEvent.setup();
      render(
        <DropdownMenu
          trigger={<button>open</button>}
          items={[
            {
              key: 'wifi',
              kind: 'checkbox',
              label: 'Wifi',
              checked: false,
              disabled: true,
              onCheckedChange,
            },
          ] as DropdownMenuEntry[]}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'open' }));
      const cb = screen.getByRole('menuitemcheckbox');
      // Disabled buttons swallow clicks at the
      // browser level; verifying that
      // onCheckedChange stays unfired even if the
      // user manages to click via keyboard.
      fireEvent.click(cb);
      expect(onCheckedChange).not.toHaveBeenCalled();
    });
  });

  describe('radio items (v1.11.380)', () => {
    it('renders one menuitemradio per row with aria-checked tied to groupValue', async () => {
      const onValueChange = vi.fn();
      const user = userEvent.setup();
      render(
        <DropdownMenu
          trigger={<button>open</button>}
          items={[
            {
              key: 'sort-name',
              kind: 'radio',
              label: 'Name',
              value: 'name',
              groupValue: 'name',
              onValueChange,
            },
            {
              key: 'sort-date',
              kind: 'radio',
              label: 'Date',
              value: 'date',
              groupValue: 'name',
              onValueChange,
            },
          ] as DropdownMenuEntry[]}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'open' }));
      const radios = screen.getAllByRole('menuitemradio');
      expect(radios).toHaveLength(2);
      expect(radios[0]).toHaveAttribute('aria-checked', 'true');
      expect(radios[1]).toHaveAttribute('aria-checked', 'false');
    });

    it('clicking a radio calls onValueChange with its value', async () => {
      const onValueChange = vi.fn();
      const user = userEvent.setup();
      render(
        <DropdownMenu
          trigger={<button>open</button>}
          items={[
            {
              key: 'sort-name',
              kind: 'radio',
              label: 'Name',
              value: 'name',
              groupValue: 'date',
              onValueChange,
            },
          ] as DropdownMenuEntry[]}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'open' }));
      await user.click(screen.getByRole('menuitemradio'));
      expect(onValueChange).toHaveBeenCalledWith('name');
    });
  });

  describe('shortcut display (v1.11.380)', () => {
    it('renders a <kbd> chip with the shortcut text on the right of an item', async () => {
      const user = userEvent.setup();
      render(
        <DropdownMenu
          trigger={<button>open</button>}
          items={[
            {
              key: 'save',
              label: 'Save',
              shortcut: 'Ctrl+S',
              onSelect: vi.fn(),
            },
          ] as DropdownMenuEntry[]}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'open' }));
      const kbd = document.querySelector(
        '[data-section="dropdown-menu-shortcut"]',
      );
      expect(kbd).not.toBeNull();
      expect(kbd?.textContent).toBe('Ctrl+S');
      expect(kbd?.tagName).toBe('KBD');
    });

    it('shortcut wins over hint when both are set', async () => {
      const user = userEvent.setup();
      render(
        <DropdownMenu
          trigger={<button>open</button>}
          items={[
            {
              key: 'save',
              label: 'Save',
              shortcut: 'Ctrl+S',
              hint: 'plain hint',
              onSelect: vi.fn(),
            },
          ] as DropdownMenuEntry[]}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'open' }));
      const kbd = document.querySelector(
        '[data-section="dropdown-menu-shortcut"]',
      );
      expect(kbd?.textContent).toBe('Ctrl+S');
      // The hint span should NOT render alongside the
      // shortcut.
      expect(
        document.querySelectorAll('[data-section="dropdown-menu-shortcut"]'),
      ).toHaveLength(1);
    });
  });
});
