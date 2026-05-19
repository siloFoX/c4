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
  ListSection,
  getGroupCount,
  isGroupCollapsed,
  totalItemCount,
  visibleItemCount,
} from './list-section';
import type { ListSectionGroup } from './list-section';

afterEach(() => {
  cleanup();
});

function makeGroups(): ListSectionGroup[] {
  return [
    {
      id: 'active',
      label: 'Active',
      items: [
        { id: 1, content: 'task one' },
        { id: 2, content: 'task two' },
      ],
    },
    {
      id: 'done',
      label: 'Done',
      items: [{ id: 3, content: 'task three' }],
    },
    {
      id: 'archived',
      label: 'Archived',
      items: [
        { id: 4, content: 'task four' },
        { id: 5, content: 'task five' },
        { id: 6, content: 'task six' },
      ],
    },
  ];
}

describe('isGroupCollapsed', () => {
  it('returns true when id is in set', () => {
    expect(isGroupCollapsed('a', new Set(['a', 'b']))).toBe(true);
  });
  it('returns false when id is not in set', () => {
    expect(isGroupCollapsed('c', new Set(['a', 'b']))).toBe(false);
  });
});

describe('getGroupCount', () => {
  it('falls back to items.length when count not supplied', () => {
    expect(
      getGroupCount({
        id: 'g',
        label: 'G',
        items: [
          { id: 1, content: 'a' },
          { id: 2, content: 'b' },
        ],
      }),
    ).toBe(2);
  });
  it('uses explicit count when supplied', () => {
    expect(
      getGroupCount({
        id: 'g',
        label: 'G',
        items: [],
        count: 42,
      }),
    ).toBe(42);
  });
  it('clamps negative count to 0', () => {
    expect(
      getGroupCount({ id: 'g', label: 'G', items: [], count: -5 }),
    ).toBe(0);
  });
  it('floors fractional count', () => {
    expect(
      getGroupCount({ id: 'g', label: 'G', items: [], count: 4.7 }),
    ).toBe(4);
  });
});

describe('totalItemCount / visibleItemCount', () => {
  it('totalItemCount sums all groups', () => {
    expect(totalItemCount(makeGroups())).toBe(6);
  });
  it('visibleItemCount drops collapsed groups', () => {
    expect(
      visibleItemCount(makeGroups(), new Set(['archived'])),
    ).toBe(3);
  });
  it('visibleItemCount with all collapsed -> 0', () => {
    expect(
      visibleItemCount(
        makeGroups(),
        new Set(['active', 'done', 'archived']),
      ),
    ).toBe(0);
  });
});

describe('ListSection component', () => {
  it('renders role=list with default aria-label', () => {
    render(<ListSection groups={makeGroups()} />);
    expect(screen.getAllByRole('list')[0]).toHaveAttribute(
      'aria-label',
      'List',
    );
  });

  it('honors a custom ariaLabel', () => {
    render(
      <ListSection
        groups={makeGroups()}
        ariaLabel="Task list"
      />,
    );
    expect(screen.getAllByRole('list')[0]).toHaveAttribute(
      'aria-label',
      'Task list',
    );
  });

  it('renders one region per group', () => {
    render(<ListSection groups={makeGroups()} />);
    expect(screen.getAllByRole('region')).toHaveLength(3);
  });

  it('renders the group label in the header', () => {
    render(<ListSection groups={makeGroups()} />);
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByText('Archived')).toBeInTheDocument();
  });

  it('renders count badges by default', () => {
    const { container } = render(<ListSection groups={makeGroups()} />);
    const counts = container.querySelectorAll(
      '[data-section="list-section-count"]',
    );
    expect(counts).toHaveLength(3);
    expect(counts[0]?.textContent).toBe('2');
    expect(counts[1]?.textContent).toBe('1');
    expect(counts[2]?.textContent).toBe('3');
  });

  it('hides count badges when showBadges=false', () => {
    const { container } = render(
      <ListSection groups={makeGroups()} showBadges={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="list-section-count"]',
      ),
    ).toBeNull();
  });

  it('custom badge slot overrides the count', () => {
    const groups: ListSectionGroup[] = [
      {
        id: 'g',
        label: 'G',
        items: [],
        badge: <span data-testid="custom-badge">CUSTOM</span>,
      },
    ];
    render(<ListSection groups={groups} />);
    expect(screen.getByTestId('custom-badge')).toBeInTheDocument();
  });

  it('renders all items in expanded groups', () => {
    render(<ListSection groups={makeGroups()} />);
    expect(screen.getByText('task one')).toBeInTheDocument();
    expect(screen.getByText('task three')).toBeInTheDocument();
    expect(screen.getByText('task six')).toBeInTheDocument();
  });

  it('clicking a group header collapses it', () => {
    render(<ListSection groups={makeGroups()} />);
    fireEvent.click(
      screen.getByRole('button', { name: /Active/ }),
    );
    expect(screen.queryByText('task one')).toBeNull();
    expect(screen.queryByText('task two')).toBeNull();
  });

  it('clicking a collapsed header re-expands', () => {
    render(<ListSection groups={makeGroups()} />);
    const header = screen.getByRole('button', { name: /Active/ });
    fireEvent.click(header);
    expect(screen.queryByText('task one')).toBeNull();
    fireEvent.click(header);
    expect(screen.getByText('task one')).toBeInTheDocument();
  });

  it('Enter on header toggles collapse', () => {
    render(<ListSection groups={makeGroups()} />);
    const header = screen.getByRole('button', { name: /Active/ });
    fireEvent.keyDown(header, { key: 'Enter' });
    expect(screen.queryByText('task one')).toBeNull();
  });

  it('Space on header toggles collapse', () => {
    render(<ListSection groups={makeGroups()} />);
    const header = screen.getByRole('button', { name: /Active/ });
    fireEvent.keyDown(header, { key: ' ' });
    expect(screen.queryByText('task one')).toBeNull();
  });

  it('header aria-expanded mirrors collapsed state', () => {
    render(<ListSection groups={makeGroups()} />);
    const header = screen.getByRole('button', { name: /Active/ });
    expect(header).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'false');
  });

  it('section data-collapsed reflects state', () => {
    const { container } = render(<ListSection groups={makeGroups()} />);
    const active = container.querySelector(
      '[data-section="list-section-group"][data-group-id="active"]',
    );
    expect(active).toHaveAttribute('data-collapsed', 'false');
    fireEvent.click(
      screen.getByRole('button', { name: /Active/ }),
    );
    expect(active).toHaveAttribute('data-collapsed', 'true');
  });

  it('defaultCollapsed on a group hides its items initially', () => {
    const groups: ListSectionGroup[] = [
      ...makeGroups().slice(0, 2),
      {
        id: 'archived',
        label: 'Archived',
        items: [{ id: 4, content: 'task four' }],
        defaultCollapsed: true,
      },
    ];
    render(<ListSection groups={groups} />);
    expect(screen.queryByText('task four')).toBeNull();
  });

  it('defaultCollapsedGroups prop seeds the initial set', () => {
    render(
      <ListSection
        groups={makeGroups()}
        defaultCollapsedGroups={['done']}
      />,
    );
    expect(screen.queryByText('task three')).toBeNull();
  });

  it('controlled collapsedGroups overrides internal state', () => {
    const { rerender } = render(
      <ListSection
        groups={makeGroups()}
        collapsedGroups={['active']}
      />,
    );
    expect(screen.queryByText('task one')).toBeNull();
    rerender(
      <ListSection
        groups={makeGroups()}
        collapsedGroups={[]}
      />,
    );
    expect(screen.getByText('task one')).toBeInTheDocument();
  });

  it('onCollapsedGroupsChange fires on toggle', () => {
    const onChange = vi.fn();
    render(
      <ListSection
        groups={makeGroups()}
        onCollapsedGroupsChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Active/ }));
    expect(onChange).toHaveBeenCalledWith(['active']);
  });

  it('collapsible=false disables the toggle', () => {
    const onChange = vi.fn();
    render(
      <ListSection
        groups={makeGroups()}
        collapsible={false}
        onCollapsedGroupsChange={onChange}
      />,
    );
    const header = screen.getByRole('button', { name: /Active/ });
    expect(header).toBeDisabled();
    expect(header).not.toHaveAttribute('aria-expanded');
    fireEvent.click(header);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('chevron icon is hidden when collapsible=false', () => {
    const { container } = render(
      <ListSection groups={makeGroups()} collapsible={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="list-section-chevron"]',
      ),
    ).toBeNull();
  });

  it('stickyHeaders=true adds sticky classes to header', () => {
    render(<ListSection groups={makeGroups()} />);
    const header = screen.getByRole('button', { name: /Active/ });
    expect(header.className).toContain('sticky');
    expect(header.className).toContain('top-0');
  });

  it('stickyHeaders=false drops sticky classes', () => {
    render(
      <ListSection groups={makeGroups()} stickyHeaders={false} />,
    );
    const header = screen.getByRole('button', { name: /Active/ });
    expect(header.className).not.toContain('sticky');
  });

  it('renderItem prop overrides default item rendering', () => {
    render(
      <ListSection
        groups={makeGroups().slice(0, 1)}
        renderItem={(item, group) => (
          <span data-testid={`row-${group.id}-${item.id}`}>
            CUSTOM {String(item.content)}
          </span>
        )}
      />,
    );
    expect(screen.getByTestId('row-active-1')).toBeInTheDocument();
    expect(
      screen.getByTestId('row-active-1').textContent,
    ).toContain('CUSTOM task one');
  });

  it('renders the group description in the header when supplied', () => {
    const groups: ListSectionGroup[] = [
      {
        id: 'g',
        label: 'G',
        items: [{ id: 1, content: 'x' }],
        description: 'updated 5m ago',
      },
    ];
    render(<ListSection groups={groups} />);
    expect(screen.getByText('updated 5m ago')).toBeInTheDocument();
  });

  it('explicit count overrides items.length on the badge', () => {
    const groups: ListSectionGroup[] = [
      {
        id: 'g',
        label: 'G',
        items: [{ id: 1, content: 'x' }],
        count: 42,
      },
    ];
    render(<ListSection groups={groups} />);
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renders the emptyLabel when groups is []', () => {
    render(<ListSection groups={[]} emptyLabel="No data" />);
    expect(screen.getByText('No data')).toBeInTheDocument();
  });

  it('renders the emptyLabel in a group with no items', () => {
    const groups: ListSectionGroup[] = [
      { id: 'g', label: 'G', items: [] },
    ];
    render(<ListSection groups={groups} emptyLabel="--" />);
    expect(screen.getByText('--')).toBeInTheDocument();
  });

  it('root data-group-count + data-total-items reflect input', () => {
    render(<ListSection groups={makeGroups()} />);
    const root = screen.getAllByRole('list')[0]!;
    expect(root).toHaveAttribute('data-group-count', '3');
    expect(root).toHaveAttribute('data-total-items', '6');
  });

  it('data-sticky-headers + data-collapsible mirror props', () => {
    render(
      <ListSection
        groups={makeGroups()}
        stickyHeaders={false}
        collapsible={false}
      />,
    );
    const root = screen.getAllByRole('list')[0]!;
    expect(root).toHaveAttribute('data-sticky-headers', 'false');
    expect(root).toHaveAttribute('data-collapsible', 'false');
  });

  it('per-item data-item-id + data-group-id mirror props', () => {
    const { container } = render(
      <ListSection groups={makeGroups().slice(0, 1)} />,
    );
    const items = container.querySelectorAll(
      '[data-section="list-section-item"]',
    );
    expect(items[0]).toHaveAttribute('data-item-id', '1');
    expect(items[0]).toHaveAttribute('data-group-id', 'active');
  });

  it('exposes a stable displayName', () => {
    expect(ListSection.displayName).toBe('ListSection');
  });

  it('forwards refs to the root', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ListSection ref={ref} groups={makeGroups()} />);
    expect(ref.current?.getAttribute('role')).toBe('list');
  });
});
