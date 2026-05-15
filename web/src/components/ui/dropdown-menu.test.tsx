import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DropdownMenu } from './dropdown-menu';
import type { DropdownMenuItem } from './dropdown-menu';

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
});
