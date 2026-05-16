import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ListActionMenu,
  toDropdownItem,
  type ListActionMenuAction,
} from './list-action-menu';

const baseActions: ListActionMenuAction[] = [
  { id: 'rename', label: 'Rename', onSelect: vi.fn() },
  { id: 'duplicate', label: 'Duplicate', onSelect: vi.fn() },
  { id: 'archive', label: 'Archive', onSelect: vi.fn() },
  {
    id: 'delete',
    label: 'Delete',
    variant: 'danger',
    onSelect: vi.fn(),
  },
];

beforeEach(() => {
  for (const a of baseActions) {
    (a.onSelect as ReturnType<typeof vi.fn>).mockReset();
  }
});

describe('toDropdownItem (action -> dropdown-item adapter)', () => {
  it('maps the required fields verbatim', () => {
    const onSelect = vi.fn();
    const item = toDropdownItem({ id: 'a', label: 'A', onSelect });
    expect(item.key).toBe('a');
    expect(item.label).toBe('A');
    expect(item.onSelect).toBe(onSelect);
  });

  it('forwards icon / hint / variant / disabled / onPrefetch only when defined', () => {
    const onSelect = vi.fn();
    const onPrefetch = vi.fn();
    const item = toDropdownItem({
      id: 'b',
      label: 'B',
      onSelect,
      icon: 'glyph',
      hint: 'hint',
      variant: 'danger',
      disabled: true,
      onPrefetch,
    });
    expect(item.icon).toBe('glyph');
    expect(item.hint).toBe('hint');
    expect(item.variant).toBe('danger');
    expect(item.disabled).toBe(true);
    expect(item.onPrefetch).toBe(onPrefetch);
  });

  it('omits optional fields when the action does not set them', () => {
    const item = toDropdownItem({ id: 'c', label: 'C', onSelect: vi.fn() });
    expect(item.icon).toBeUndefined();
    expect(item.hint).toBeUndefined();
    expect(item.variant).toBeUndefined();
    expect(item.disabled).toBeUndefined();
    expect(item.onPrefetch).toBeUndefined();
  });
});

describe('<ListActionMenu>', () => {
  it('renders an IconButton trigger with the default aria-label', () => {
    render(<ListActionMenu actions={baseActions} />);
    expect(screen.getByRole('button', { name: 'Row actions' })).toBeInTheDocument();
  });

  it('accepts a custom ariaLabel override', () => {
    render(
      <ListActionMenu actions={baseActions} ariaLabel="Session actions" />,
    );
    expect(
      screen.getByRole('button', { name: 'Session actions' }),
    ).toBeInTheDocument();
  });

  it('exposes a separate triggerAriaLabel override when provided', () => {
    render(
      <ListActionMenu
        actions={baseActions}
        ariaLabel="menu name"
        triggerAriaLabel="Trigger name"
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Trigger name' }),
    ).toBeInTheDocument();
  });

  it('tags the root with data-section + data-size', () => {
    const { container } = render(<ListActionMenu actions={baseActions} size="sm" />);
    const root = container.querySelector(
      '[data-section="list-action-menu"]',
    );
    expect(root).not.toBeNull();
    expect(root!.getAttribute('data-size')).toBe('sm');
  });

  it('tags the trigger with data-section="list-action-menu-trigger"', () => {
    const { container } = render(<ListActionMenu actions={baseActions} />);
    expect(
      container.querySelector('[data-section="list-action-menu-trigger"]'),
    ).not.toBeNull();
  });

  it('size="sm" applies the smaller trigger height', () => {
    const { container } = render(
      <ListActionMenu actions={baseActions} size="sm" />,
    );
    const trigger = container.querySelector(
      '[data-section="list-action-menu-trigger"]',
    );
    expect(trigger?.className).toContain('h-6');
  });

  it('default size (md) applies the larger trigger height', () => {
    const { container } = render(<ListActionMenu actions={baseActions} />);
    const trigger = container.querySelector(
      '[data-section="list-action-menu-trigger"]',
    );
    expect(trigger?.className).toContain('h-7');
  });

  it('forwards triggerTestId to the trigger as data-testid', () => {
    render(
      <ListActionMenu actions={baseActions} triggerTestId="my-menu-trigger" />,
    );
    expect(screen.getByTestId('my-menu-trigger')).toBeInTheDocument();
  });

  it('opens the menu on trigger click and renders every action row', async () => {
    const user = userEvent.setup();
    render(<ListActionMenu actions={baseActions} />);
    await user.click(screen.getByRole('button', { name: 'Row actions' }));
    expect(screen.getByText('Rename')).toBeInTheDocument();
    expect(screen.getByText('Duplicate')).toBeInTheDocument();
    expect(screen.getByText('Archive')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('fires the onSelect handler for the clicked action', async () => {
    const user = userEvent.setup();
    render(<ListActionMenu actions={baseActions} />);
    await user.click(screen.getByRole('button', { name: 'Row actions' }));
    await user.click(screen.getByText('Duplicate'));
    expect(baseActions[1]!.onSelect).toHaveBeenCalledTimes(1);
    expect(baseActions[0]!.onSelect).not.toHaveBeenCalled();
  });

  it('renders the destructive action in the menu (danger variant passthrough)', async () => {
    const user = userEvent.setup();
    render(<ListActionMenu actions={baseActions} />);
    await user.click(screen.getByRole('button', { name: 'Row actions' }));
    // The danger row exists; DropdownMenu owns the actual class so
    // we just verify the label rendered as a menu item.
    const deleteRow = screen.getByText('Delete').closest('button');
    expect(deleteRow).not.toBeNull();
  });

  it('closes after Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    render(<ListActionMenu actions={baseActions} />);
    const trigger = screen.getByRole('button', { name: 'Row actions' });
    await user.click(trigger);
    expect(screen.queryByText('Rename')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByText('Rename')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  it('ArrowDown after opening focuses the first action row', async () => {
    const user = userEvent.setup();
    render(<ListActionMenu actions={baseActions} />);
    const trigger = screen.getByRole('button', { name: 'Row actions' });
    await user.click(trigger);
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement?.textContent).toContain('Rename');
  });

  it('Enter on a focused action row fires its onSelect', async () => {
    const user = userEvent.setup();
    render(<ListActionMenu actions={baseActions} />);
    const trigger = screen.getByRole('button', { name: 'Row actions' });
    await user.click(trigger);
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Enter}');
    expect(baseActions[1]!.onSelect).toHaveBeenCalledTimes(1);
  });

  it('disabled action does not fire its onSelect on click', async () => {
    const onDisabled = vi.fn();
    const user = userEvent.setup();
    render(
      <ListActionMenu
        actions={[
          { id: 'a', label: 'Active', onSelect: vi.fn() },
          { id: 'b', label: 'Blocked', disabled: true, onSelect: onDisabled },
        ]}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Row actions' }));
    await user.click(screen.getByText('Blocked'));
    expect(onDisabled).not.toHaveBeenCalled();
  });

  it('merges caller className on the root wrapper', () => {
    const { container } = render(
      <ListActionMenu actions={baseActions} className="custom-list-menu" />,
    );
    const root = container.querySelector(
      '[data-section="list-action-menu"]',
    );
    expect(root!.className).toContain('custom-list-menu');
    expect(root!.className).toContain('inline-flex');
  });

  it('placement="top" wires through DropdownMenu so the role=menu container renders', async () => {
    const user = userEvent.setup();
    render(<ListActionMenu actions={baseActions} placement="top" />);
    await user.click(screen.getByRole('button', { name: 'Row actions' }));
    // The DropdownMenu primitive does not yet expose
    // data-placement on the menu surface, so we just verify the
    // role=menu container materialises (the placement only
    // affects CSS positioning, not the DOM shape).
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('renders empty when actions is an empty array (no rows, trigger still present)', async () => {
    const user = userEvent.setup();
    render(<ListActionMenu actions={[]} />);
    const trigger = screen.getByRole('button', { name: 'Row actions' });
    expect(trigger).toBeInTheDocument();
    await user.click(trigger);
    // Trigger still works but no menu items render.
    expect(screen.queryByText('Rename')).not.toBeInTheDocument();
  });
});
