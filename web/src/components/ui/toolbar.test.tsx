import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toolbar, type ToolbarItem } from './toolbar';

function makeItems(): ToolbarItem[] {
  return [
    { id: 'cut', label: 'Cut', onClick: vi.fn() },
    { id: 'copy', label: 'Copy', onClick: vi.fn() },
    { id: 'paste', label: 'Paste', onClick: vi.fn() },
    { id: 'sep1', type: 'divider' },
    { id: 'delete', label: 'Delete', variant: 'destructive', onClick: vi.fn() },
  ];
}

describe('<Toolbar>', () => {
  it('renders a role=toolbar root', () => {
    render(<Toolbar items={makeItems()} />);
    expect(screen.getByRole('toolbar')).toBeInTheDocument();
  });

  it('applies the default aria-label "Toolbar"', () => {
    render(<Toolbar items={makeItems()} />);
    expect(
      screen.getByRole('toolbar', { name: 'Toolbar' }),
    ).toBeInTheDocument();
  });

  it('caller-provided ariaLabel wins', () => {
    render(<Toolbar items={makeItems()} ariaLabel="Editor actions" />);
    expect(
      screen.getByRole('toolbar', { name: 'Editor actions' }),
    ).toBeInTheDocument();
  });

  it('exposes data-section + data-size on the root', () => {
    const { container } = render(<Toolbar items={makeItems()} size="sm" />);
    const root = container.querySelector('[data-section="toolbar"]');
    expect(root).not.toBeNull();
    expect(root!.getAttribute('data-size')).toBe('sm');
  });

  it('renders one button per button item', () => {
    render(<Toolbar items={makeItems()} />);
    expect(screen.getByRole('button', { name: 'Cut' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Paste' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('renders divider items with data-toolbar-item-type="divider"', () => {
    const { container } = render(<Toolbar items={makeItems()} />);
    expect(
      container.querySelector('[data-toolbar-item-type="divider"]'),
    ).not.toBeNull();
  });

  it('tags every button with data-toolbar-item=<id>', () => {
    const { container } = render(<Toolbar items={makeItems()} />);
    for (const id of ['cut', 'copy', 'paste', 'delete']) {
      expect(
        container.querySelector(`[data-toolbar-item="${id}"]`),
      ).not.toBeNull();
    }
  });

  it('clicking a button fires its onClick handler', async () => {
    const items = makeItems();
    const user = userEvent.setup();
    render(<Toolbar items={items} />);
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(items[1]!.type !== 'divider' && (items[1] as { onClick: () => void }).onClick).toBeTruthy();
    // Use direct ref check on the mock:
    const copy = items[1] as { onClick: ReturnType<typeof vi.fn> };
    expect(copy.onClick).toHaveBeenCalledTimes(1);
  });

  it('disabled buttons do not fire onClick on click', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <Toolbar
        items={[{ id: 'a', label: 'A', disabled: true, onClick }]}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'A' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('roving tabindex: only the first enabled button is tabindex=0', () => {
    render(<Toolbar items={makeItems()} />);
    const cut = screen.getByRole('button', { name: 'Cut' });
    const copy = screen.getByRole('button', { name: 'Copy' });
    expect(cut.getAttribute('tabindex')).toBe('0');
    expect(copy.getAttribute('tabindex')).toBe('-1');
  });

  it('ArrowRight inside the toolbar moves focus to the next button', async () => {
    const user = userEvent.setup();
    render(<Toolbar items={makeItems()} />);
    const cut = screen.getByRole('button', { name: 'Cut' });
    cut.focus();
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement?.textContent).toBe('Copy');
  });

  it('ArrowLeft wraps around from the first button to the last', async () => {
    const user = userEvent.setup();
    render(<Toolbar items={makeItems()} />);
    const cut = screen.getByRole('button', { name: 'Cut' });
    cut.focus();
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement?.textContent).toBe('Delete');
  });

  it('ArrowRight wraps around from the last button to the first', async () => {
    const user = userEvent.setup();
    render(<Toolbar items={makeItems()} />);
    const del = screen.getByRole('button', { name: 'Delete' });
    del.focus();
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement?.textContent).toBe('Cut');
  });

  it('Home jumps focus to the first button', async () => {
    const user = userEvent.setup();
    render(<Toolbar items={makeItems()} />);
    screen.getByRole('button', { name: 'Delete' }).focus();
    await user.keyboard('{Home}');
    expect(document.activeElement?.textContent).toBe('Cut');
  });

  it('End jumps focus to the last button', async () => {
    const user = userEvent.setup();
    render(<Toolbar items={makeItems()} />);
    screen.getByRole('button', { name: 'Cut' }).focus();
    await user.keyboard('{End}');
    expect(document.activeElement?.textContent).toBe('Delete');
  });

  it('does NOT render the overflow trigger when items <= overflowAfter', () => {
    const { container } = render(
      <Toolbar items={makeItems()} overflowAfter={10} />,
    );
    expect(
      container.querySelector('[data-toolbar-overflow-trigger="true"]'),
    ).toBeNull();
  });

  it('renders the overflow trigger when items > overflowAfter', () => {
    render(<Toolbar items={makeItems()} overflowAfter={2} />);
    expect(
      screen.getByRole('button', { name: 'More toolbar actions' }),
    ).toBeInTheDocument();
  });

  it('overflow trims a trailing divider from the inline slice', () => {
    // 3 items + divider + 1 item; overflowAfter=4 would slice
    // [items 0..3] which ends on the divider. The primitive
    // trims that trailing divider so the inline row does not
    // end on a dangling pipe.
    const { container } = render(
      <Toolbar
        items={[
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
          { id: 'c', label: 'C' },
          { id: 'sep', type: 'divider' },
          { id: 'd', label: 'D' },
        ]}
        overflowAfter={4}
      />,
    );
    // The inline divider with id="sep" should be trimmed.
    expect(
      container.querySelector('[data-toolbar-item="sep"]'),
    ).toBeNull();
  });

  it('clicking the overflow trigger opens a popover listing overflow items', async () => {
    const user = userEvent.setup();
    render(<Toolbar items={makeItems()} overflowAfter={2} />);
    await user.click(
      screen.getByRole('button', { name: 'More toolbar actions' }),
    );
    expect(screen.getByText('Paste')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('overflow menu items fire their onClick on click', async () => {
    const items = makeItems();
    const user = userEvent.setup();
    render(<Toolbar items={items} overflowAfter={2} />);
    await user.click(
      screen.getByRole('button', { name: 'More toolbar actions' }),
    );
    await user.click(screen.getByText('Paste'));
    const paste = items[2] as { onClick: ReturnType<typeof vi.fn> };
    expect(paste.onClick).toHaveBeenCalledTimes(1);
  });

  it('overflow destructive variant carries the destructive text class', async () => {
    const user = userEvent.setup();
    render(<Toolbar items={makeItems()} overflowAfter={3} />);
    await user.click(
      screen.getByRole('button', { name: 'More toolbar actions' }),
    );
    // Popover may portal the content; use a global selector
    // rather than the per-render container.
    const del = document.querySelector(
      '[data-toolbar-overflow-item="delete"]',
    );
    expect(del).not.toBeNull();
    expect(del!.className).toContain('text-destructive');
  });

  it('size="sm" applies the smaller height tokens', () => {
    const { container } = render(<Toolbar items={makeItems()} size="sm" />);
    const root = container.querySelector('[data-section="toolbar"]');
    expect(root!.className).toContain('h-7');
  });

  it('default size (md) applies the larger height tokens', () => {
    const { container } = render(<Toolbar items={makeItems()} />);
    const root = container.querySelector('[data-section="toolbar"]');
    expect(root!.className).toContain('h-9');
  });

  it('icon-only buttons preserve aria-label via the ariaLabel prop', () => {
    render(
      <Toolbar
        items={[
          {
            id: 'fav',
            icon: <svg data-testid="fav-glyph" />,
            ariaLabel: 'Favorite',
          },
        ]}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Favorite' }),
    ).toBeInTheDocument();
  });

  it('merges caller className with the toolbar root', () => {
    const { container } = render(
      <Toolbar items={makeItems()} className="custom-tb" />,
    );
    const root = container.querySelector('[data-section="toolbar"]');
    expect(root!.className).toContain('custom-tb');
    expect(root!.className).toContain('inline-flex');
  });

  it('renders an empty toolbar when items is an empty array (no buttons)', () => {
    const { container } = render(<Toolbar items={[]} />);
    const root = container.querySelector('[data-section="toolbar"]');
    expect(root).not.toBeNull();
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });

  it('forwards arbitrary HTML attributes (data-testid)', () => {
    render(<Toolbar items={makeItems()} data-testid="my-toolbar" />);
    expect(screen.getByTestId('my-toolbar')).toBeInTheDocument();
  });

  // (v1.11.284, TODO 11.266) children-mode escape hatch.

  it('renders children verbatim inside the role=toolbar shell when items is omitted', () => {
    render(
      <Toolbar ariaLabel="custom">
        <button type="button">Inline A</button>
        <button type="button">Inline B</button>
      </Toolbar>,
    );
    expect(screen.getByRole('toolbar', { name: 'custom' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Inline A' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Inline B' })).toBeInTheDocument();
  });

  it('items + children render together (items first, then children)', () => {
    const { container } = render(
      <Toolbar items={[{ id: 'a', label: 'A' }]}>
        <span data-testid="bespoke">extra</span>
      </Toolbar>,
    );
    expect(screen.getByRole('button', { name: 'A' })).toBeInTheDocument();
    expect(screen.getByTestId('bespoke')).toBeInTheDocument();
    // Order check: the items button comes before the bespoke
    // span in DOM order.
    const root = container.querySelector('[data-section="toolbar"]')!;
    const kids = Array.from(root.children);
    const aIdx = kids.findIndex(
      (k) => k.getAttribute('data-toolbar-item') === 'a',
    );
    const bespokeIdx = kids.findIndex(
      (k) => k.getAttribute('data-testid') === 'bespoke',
    );
    expect(aIdx).toBeGreaterThan(-1);
    expect(bespokeIdx).toBeGreaterThan(aIdx);
  });

  it('children-only mode still applies the height/padding tokens', () => {
    const { container } = render(
      <Toolbar size="sm">
        <button type="button">x</button>
      </Toolbar>,
    );
    const root = container.querySelector('[data-section="toolbar"]');
    expect(root!.className).toContain('h-7');
  });
});
