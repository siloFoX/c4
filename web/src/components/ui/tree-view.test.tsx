import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { createRef } from 'react';
import {
  TreeView,
  computeDropPosition,
  findNodePath,
  flattenTree,
  updateNodeChildren,
} from './tree-view';
import type { TreeNode } from './tree-view';

afterEach(() => {
  cleanup();
});

function makeNodes(): TreeNode[] {
  return [
    {
      id: 'root1',
      label: 'Root 1',
      children: [
        {
          id: 'child1',
          label: 'Child 1',
          children: [{ id: 'grand1', label: 'Grandchild 1', isLeaf: true }],
        },
        { id: 'child2', label: 'Child 2', isLeaf: true },
      ],
    },
    {
      id: 'root2',
      label: 'Root 2',
      isLeaf: true,
    },
  ];
}

describe('flattenTree', () => {
  it('returns empty array for empty input', () => {
    expect(flattenTree([], new Set())).toEqual([]);
  });

  it('returns only roots when nothing is expanded', () => {
    const flat = flattenTree(makeNodes(), new Set());
    expect(flat).toHaveLength(2);
    expect(flat[0]?.node.id).toBe('root1');
    expect(flat[1]?.node.id).toBe('root2');
  });

  it('expands a root showing its direct children', () => {
    const flat = flattenTree(makeNodes(), new Set(['root1']));
    const ids = flat.map((r) => r.node.id);
    expect(ids).toEqual(['root1', 'child1', 'child2', 'root2']);
  });

  it('expands nested levels in order', () => {
    const flat = flattenTree(
      makeNodes(),
      new Set(['root1', 'child1']),
    );
    const ids = flat.map((r) => r.node.id);
    expect(ids).toEqual([
      'root1',
      'child1',
      'grand1',
      'child2',
      'root2',
    ]);
  });

  it('reports correct depth per row', () => {
    const flat = flattenTree(
      makeNodes(),
      new Set(['root1', 'child1']),
    );
    expect(flat.find((r) => r.node.id === 'root1')?.depth).toBe(0);
    expect(flat.find((r) => r.node.id === 'child1')?.depth).toBe(1);
    expect(flat.find((r) => r.node.id === 'grand1')?.depth).toBe(2);
  });

  it('reports parentId per row', () => {
    const flat = flattenTree(
      makeNodes(),
      new Set(['root1', 'child1']),
    );
    expect(flat.find((r) => r.node.id === 'root1')?.parentId).toBeNull();
    expect(flat.find((r) => r.node.id === 'child1')?.parentId).toBe(
      'root1',
    );
    expect(flat.find((r) => r.node.id === 'grand1')?.parentId).toBe(
      'child1',
    );
  });

  it('reports hasChildren', () => {
    const flat = flattenTree(makeNodes(), new Set());
    expect(flat.find((r) => r.node.id === 'root1')?.hasChildren).toBe(
      true,
    );
    expect(flat.find((r) => r.node.id === 'root2')?.hasChildren).toBe(
      false,
    );
  });
});

describe('findNodePath', () => {
  it('returns single-id path for a root', () => {
    expect(findNodePath(makeNodes(), 'root1')).toEqual(['root1']);
  });

  it('returns full path for a deeply nested node', () => {
    expect(findNodePath(makeNodes(), 'grand1')).toEqual([
      'root1',
      'child1',
      'grand1',
    ]);
  });

  it('returns null for an unknown id', () => {
    expect(findNodePath(makeNodes(), 'ghost')).toBeNull();
  });
});

describe('updateNodeChildren', () => {
  it('replaces children of a deep node immutably', () => {
    const nodes = makeNodes();
    const next = updateNodeChildren(nodes, 'child1', [
      { id: 'newgrand', label: 'New Grand', isLeaf: true },
    ]);
    expect(next).not.toBe(nodes);
    const child1 = next[0]?.children?.[0];
    expect(child1?.children?.[0]?.id).toBe('newgrand');
    // original untouched
    expect(nodes[0]?.children?.[0]?.children?.[0]?.id).toBe('grand1');
  });

  it('returns nodes unchanged when id is not found', () => {
    const nodes = makeNodes();
    const next = updateNodeChildren(nodes, 'ghost', []);
    expect(next.map((n) => n.id)).toEqual(['root1', 'root2']);
  });
});

describe('computeDropPosition', () => {
  it('returns "before" for top quarter when canHaveChildren', () => {
    expect(computeDropPosition(2, 100, true)).toBe('before');
  });

  it('returns "inside" for middle when canHaveChildren', () => {
    expect(computeDropPosition(50, 100, true)).toBe('inside');
  });

  it('returns "after" for bottom quarter when canHaveChildren', () => {
    expect(computeDropPosition(90, 100, true)).toBe('after');
  });

  it('uses before/after halves when leaf', () => {
    expect(computeDropPosition(20, 100, false)).toBe('before');
    expect(computeDropPosition(80, 100, false)).toBe('after');
  });

  it('returns "after" for non-positive height', () => {
    expect(computeDropPosition(10, 0, true)).toBe('after');
  });

  it('clamps out-of-range y to the bounds', () => {
    expect(computeDropPosition(-50, 100, true)).toBe('before');
    expect(computeDropPosition(1000, 100, true)).toBe('after');
  });
});

describe('TreeView component', () => {
  it('renders role=tree with the default aria-label', () => {
    render(<TreeView nodes={makeNodes()} />);
    expect(screen.getByRole('tree')).toHaveAttribute(
      'aria-label',
      'Tree',
    );
  });

  it('honors a custom ariaLabel', () => {
    render(
      <TreeView nodes={makeNodes()} ariaLabel="File browser" />,
    );
    expect(screen.getByRole('tree')).toHaveAttribute(
      'aria-label',
      'File browser',
    );
  });

  it('renders one treeitem per visible row', () => {
    render(<TreeView nodes={makeNodes()} />);
    const items = screen.getAllByRole('treeitem');
    expect(items).toHaveLength(2);
  });

  it('sets aria-expanded on expandable nodes', () => {
    render(
      <TreeView nodes={makeNodes()} defaultExpandedIds={['root1']} />,
    );
    const root1 = screen.getByText('Root 1').closest('[role="treeitem"]');
    expect(root1).toHaveAttribute('aria-expanded', 'true');
  });

  it('omits aria-expanded on leaf nodes', () => {
    render(<TreeView nodes={makeNodes()} />);
    const root2 = screen.getByText('Root 2').closest('[role="treeitem"]');
    expect(root2).not.toHaveAttribute('aria-expanded');
  });

  it('sets aria-selected on the selected node', () => {
    render(<TreeView nodes={makeNodes()} defaultSelectedId="root2" />);
    const root2 = screen.getByText('Root 2').closest('[role="treeitem"]');
    expect(root2).toHaveAttribute('aria-selected', 'true');
  });

  it('sets aria-level=depth+1', () => {
    render(
      <TreeView
        nodes={makeNodes()}
        defaultExpandedIds={['root1']}
      />,
    );
    expect(
      screen.getByText('Root 1').closest('[role="treeitem"]'),
    ).toHaveAttribute('aria-level', '1');
    expect(
      screen.getByText('Child 1').closest('[role="treeitem"]'),
    ).toHaveAttribute('aria-level', '2');
  });

  it('click on row selects + focuses it', () => {
    const onSelected = vi.fn();
    const onFocused = vi.fn();
    render(
      <TreeView
        nodes={makeNodes()}
        onSelectedIdChange={onSelected}
        onFocusedIdChange={onFocused}
      />,
    );
    fireEvent.click(
      screen.getByText('Root 2').closest('[role="treeitem"]')!,
    );
    expect(onSelected).toHaveBeenCalledWith('root2');
    expect(onFocused).toHaveBeenCalledWith('root2');
  });

  it('click on toggle button expands without selecting', () => {
    const onExpanded = vi.fn();
    render(
      <TreeView
        nodes={makeNodes()}
        onExpandedIdsChange={onExpanded}
      />,
    );
    const toggle = screen
      .getByText('Root 1')
      .closest('[role="treeitem"]')
      ?.querySelector('[data-section="tree-view-toggle"]') as HTMLElement;
    fireEvent.click(toggle);
    expect(onExpanded).toHaveBeenCalledWith(['root1']);
  });

  it('ArrowDown moves focus to the next row', () => {
    const onFocused = vi.fn();
    render(
      <TreeView
        nodes={makeNodes()}
        defaultExpandedIds={['root1']}
        defaultSelectedId="root1"
        focusedId="root1"
        onFocusedIdChange={onFocused}
      />,
    );
    fireEvent.keyDown(screen.getByRole('tree'), { key: 'ArrowDown' });
    expect(onFocused).toHaveBeenCalledWith('child1');
  });

  it('ArrowUp moves focus to the previous row', () => {
    const onFocused = vi.fn();
    render(
      <TreeView
        nodes={makeNodes()}
        defaultExpandedIds={['root1']}
        focusedId="child1"
        onFocusedIdChange={onFocused}
      />,
    );
    fireEvent.keyDown(screen.getByRole('tree'), { key: 'ArrowUp' });
    expect(onFocused).toHaveBeenCalledWith('root1');
  });

  it('ArrowRight on a collapsed node expands it', () => {
    const onExpanded = vi.fn();
    render(
      <TreeView
        nodes={makeNodes()}
        focusedId="root1"
        onExpandedIdsChange={onExpanded}
      />,
    );
    fireEvent.keyDown(screen.getByRole('tree'), { key: 'ArrowRight' });
    expect(onExpanded).toHaveBeenCalledWith(['root1']);
  });

  it('ArrowRight on an expanded node moves to the first child', () => {
    const onFocused = vi.fn();
    render(
      <TreeView
        nodes={makeNodes()}
        defaultExpandedIds={['root1']}
        focusedId="root1"
        onFocusedIdChange={onFocused}
      />,
    );
    fireEvent.keyDown(screen.getByRole('tree'), { key: 'ArrowRight' });
    expect(onFocused).toHaveBeenCalledWith('child1');
  });

  it('ArrowLeft on an expanded node collapses', () => {
    const onExpanded = vi.fn();
    render(
      <TreeView
        nodes={makeNodes()}
        defaultExpandedIds={['root1']}
        focusedId="root1"
        onExpandedIdsChange={onExpanded}
      />,
    );
    fireEvent.keyDown(screen.getByRole('tree'), { key: 'ArrowLeft' });
    expect(onExpanded).toHaveBeenCalledWith([]);
  });

  it('ArrowLeft on a collapsed leaf moves to parent', () => {
    const onFocused = vi.fn();
    render(
      <TreeView
        nodes={makeNodes()}
        defaultExpandedIds={['root1']}
        focusedId="child2"
        onFocusedIdChange={onFocused}
      />,
    );
    fireEvent.keyDown(screen.getByRole('tree'), { key: 'ArrowLeft' });
    expect(onFocused).toHaveBeenCalledWith('root1');
  });

  it('Home jumps to the first row', () => {
    const onFocused = vi.fn();
    render(
      <TreeView
        nodes={makeNodes()}
        defaultExpandedIds={['root1']}
        focusedId="root2"
        onFocusedIdChange={onFocused}
      />,
    );
    fireEvent.keyDown(screen.getByRole('tree'), { key: 'Home' });
    expect(onFocused).toHaveBeenCalledWith('root1');
  });

  it('End jumps to the last visible row', () => {
    const onFocused = vi.fn();
    render(
      <TreeView
        nodes={makeNodes()}
        defaultExpandedIds={['root1']}
        focusedId="root1"
        onFocusedIdChange={onFocused}
      />,
    );
    fireEvent.keyDown(screen.getByRole('tree'), { key: 'End' });
    expect(onFocused).toHaveBeenCalledWith('root2');
  });

  it('Enter on an expandable focused node toggles expansion', () => {
    const onExpanded = vi.fn();
    render(
      <TreeView
        nodes={makeNodes()}
        focusedId="root1"
        onExpandedIdsChange={onExpanded}
      />,
    );
    fireEvent.keyDown(screen.getByRole('tree'), { key: 'Enter' });
    expect(onExpanded).toHaveBeenCalledWith(['root1']);
  });

  it('Space on an expandable focused node toggles expansion', () => {
    const onExpanded = vi.fn();
    render(
      <TreeView
        nodes={makeNodes()}
        focusedId="root1"
        onExpandedIdsChange={onExpanded}
      />,
    );
    fireEvent.keyDown(screen.getByRole('tree'), { key: ' ' });
    expect(onExpanded).toHaveBeenCalledWith(['root1']);
  });

  it('expanding a childless non-leaf node fires onLoadChildren', async () => {
    const onLoadChildren = vi.fn(() => Promise.resolve([]));
    const lazy: TreeNode[] = [
      { id: 'a', label: 'A' /* no children, not isLeaf */ },
    ];
    render(
      <TreeView nodes={lazy} onLoadChildren={onLoadChildren} />,
    );
    const toggle = screen
      .getByText('A')
      .closest('[role="treeitem"]')
      ?.querySelector('[data-section="tree-view-toggle"]') as HTMLElement;
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(onLoadChildren).toHaveBeenCalledTimes(1);
    });
  });

  it('renders loading label during lazy load', async () => {
    let resolveLoad: () => void = () => {};
    const onLoadChildren = vi.fn(
      () =>
        new Promise<TreeNode[]>((resolve) => {
          resolveLoad = () => resolve([]);
        }),
    );
    const lazy: TreeNode[] = [{ id: 'a', label: 'A' }];
    render(
      <TreeView
        nodes={lazy}
        onLoadChildren={onLoadChildren}
        loadingLabel="Loading..."
      />,
    );
    const toggle = screen
      .getByText('A')
      .closest('[role="treeitem"]')
      ?.querySelector('[data-section="tree-view-toggle"]') as HTMLElement;
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });
    resolveLoad();
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).toBeNull();
    });
  });

  it('renders draggable rows when enableDrag=true', () => {
    render(<TreeView nodes={makeNodes()} enableDrag={true} />);
    const root1 = screen.getByText('Root 1').closest('[role="treeitem"]');
    expect(root1).toHaveAttribute('draggable', 'true');
  });

  it('disabled nodes are not draggable', () => {
    const nodes: TreeNode[] = [
      { id: 'a', label: 'A', disabled: true, isLeaf: true },
    ];
    render(<TreeView nodes={nodes} enableDrag={true} />);
    const a = screen.getByText('A').closest('[role="treeitem"]');
    expect(a).toHaveAttribute('draggable', 'false');
  });

  it('does not select disabled nodes on click', () => {
    const onSelected = vi.fn();
    const nodes: TreeNode[] = [
      { id: 'a', label: 'A', disabled: true, isLeaf: true },
    ];
    render(
      <TreeView nodes={nodes} onSelectedIdChange={onSelected} />,
    );
    fireEvent.click(screen.getByText('A').closest('[role="treeitem"]')!);
    expect(onSelected).not.toHaveBeenCalled();
  });

  it('applies depth indentation via paddingLeft', () => {
    render(
      <TreeView
        nodes={makeNodes()}
        defaultExpandedIds={['root1']}
        indent={20}
      />,
    );
    const child1 = screen
      .getByText('Child 1')
      .closest('[role="treeitem"]') as HTMLElement;
    expect(child1.style.paddingLeft).toBe('20px');
  });

  it('renders icons when supplied', () => {
    const nodes: TreeNode[] = [
      {
        id: 'a',
        label: 'A',
        isLeaf: true,
        icon: <span data-testid="custom-icon" />,
      },
    ];
    render(<TreeView nodes={nodes} />);
    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
  });

  it('renderNode override replaces the default row body', () => {
    render(
      <TreeView
        nodes={makeNodes()}
        renderNode={(row) => (
          <span data-testid={`custom-${row.node.id}`}>
            {row.node.id}
          </span>
        )}
      />,
    );
    expect(screen.getByTestId('custom-root1')).toBeInTheDocument();
  });

  it('writes data-section + data-tree-id + data-tree-depth on each row', () => {
    render(
      <TreeView
        nodes={makeNodes()}
        defaultExpandedIds={['root1']}
      />,
    );
    const child1 = screen
      .getByText('Child 1')
      .closest('[role="treeitem"]');
    expect(child1).toHaveAttribute('data-section', 'tree-view-item');
    expect(child1).toHaveAttribute('data-tree-id', 'child1');
    expect(child1).toHaveAttribute('data-tree-depth', '1');
  });

  it('writes data-tree-expanded="leaf" on leaf nodes', () => {
    render(<TreeView nodes={makeNodes()} />);
    const root2 = screen.getByText('Root 2').closest('[role="treeitem"]');
    expect(root2).toHaveAttribute('data-tree-expanded', 'leaf');
  });

  it('renders "(empty)" when there are no nodes', () => {
    render(<TreeView nodes={[]} />);
    expect(screen.getByText('(empty)')).toBeInTheDocument();
  });

  it('exposes a stable displayName', () => {
    expect(TreeView.displayName).toBe('TreeView');
  });

  it('forwards refs to the root tree element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<TreeView ref={ref} nodes={makeNodes()} />);
    expect(ref.current?.getAttribute('role')).toBe('tree');
  });

  it('respects controlled expandedIds and ignores internal state', () => {
    const { rerender } = render(
      <TreeView nodes={makeNodes()} expandedIds={[]} />,
    );
    expect(screen.queryByText('Child 1')).toBeNull();
    rerender(
      <TreeView nodes={makeNodes()} expandedIds={['root1']} />,
    );
    expect(screen.getByText('Child 1')).toBeInTheDocument();
  });

  it('respects controlled selectedId', () => {
    render(
      <TreeView nodes={makeNodes()} selectedId="root2" />,
    );
    const root2 = screen.getByText('Root 2').closest('[role="treeitem"]');
    expect(root2).toHaveAttribute('aria-selected', 'true');
  });

  it('drop fires onReorder with the computed position', () => {
    const onReorder = vi.fn();
    render(
      <TreeView
        nodes={makeNodes()}
        enableDrag={true}
        onReorder={onReorder}
      />,
    );
    const root1 = screen
      .getByText('Root 1')
      .closest('[role="treeitem"]') as HTMLElement;
    const root2 = screen
      .getByText('Root 2')
      .closest('[role="treeitem"]') as HTMLElement;
    // Simulate the source by issuing a dragStart on root1
    fireEvent.dragStart(root1, {
      dataTransfer: { setData: vi.fn(), effectAllowed: 'move' },
    });
    // Make sure clientRect returns something predictable
    root2.getBoundingClientRect = () =>
      ({
        top: 0,
        left: 0,
        bottom: 100,
        right: 100,
        height: 100,
        width: 100,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    fireEvent.dragOver(root2, {
      clientY: 80,
      dataTransfer: { dropEffect: 'move' },
    });
    fireEvent.drop(root2, {
      dataTransfer: { setData: vi.fn() },
    });
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith('root1', 'root2', 'after');
  });

  it('ignores drop on the drag source itself', () => {
    const onReorder = vi.fn();
    render(
      <TreeView
        nodes={makeNodes()}
        enableDrag={true}
        onReorder={onReorder}
      />,
    );
    const root1 = screen
      .getByText('Root 1')
      .closest('[role="treeitem"]') as HTMLElement;
    fireEvent.dragStart(root1, {
      dataTransfer: { setData: vi.fn(), effectAllowed: 'move' },
    });
    fireEvent.drop(root1, {
      dataTransfer: { setData: vi.fn() },
    });
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('ignores drop on a descendant of the drag source', () => {
    const onReorder = vi.fn();
    render(
      <TreeView
        nodes={makeNodes()}
        enableDrag={true}
        onReorder={onReorder}
        defaultExpandedIds={['root1']}
      />,
    );
    const root1 = screen
      .getByText('Root 1')
      .closest('[role="treeitem"]') as HTMLElement;
    const child2 = screen
      .getByText('Child 2')
      .closest('[role="treeitem"]') as HTMLElement;
    fireEvent.dragStart(root1, {
      dataTransfer: { setData: vi.fn(), effectAllowed: 'move' },
    });
    child2.getBoundingClientRect = () =>
      ({
        top: 0,
        left: 0,
        bottom: 100,
        right: 100,
        height: 100,
        width: 100,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    fireEvent.dragOver(child2, {
      clientY: 50,
      dataTransfer: { dropEffect: 'move' },
    });
    fireEvent.drop(child2, {
      dataTransfer: { setData: vi.fn() },
    });
    expect(onReorder).not.toHaveBeenCalled();
  });
});
