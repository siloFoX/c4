import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FileTree, type FileTreeNode } from './file-tree';

const sample: FileTreeNode[] = [
  {
    id: 'src',
    name: 'src',
    type: 'folder',
    children: [
      {
        id: 'src/lib',
        name: 'lib',
        type: 'folder',
        children: [
          { id: 'src/lib/a.ts', name: 'a.ts', type: 'file' },
          { id: 'src/lib/b.ts', name: 'b.ts', type: 'file' },
        ],
      },
      { id: 'src/index.ts', name: 'index.ts', type: 'file' },
    ],
  },
  { id: 'README.md', name: 'README.md', type: 'file' },
];

function getItem(name: string) {
  return screen.getByRole('treeitem', { name: new RegExp(name) });
}

describe('<FileTree>', () => {
  it('renders all top-level folder + file nodes', () => {
    render(<FileTree nodes={sample} />);
    expect(screen.getByRole('tree')).toBeInTheDocument();
    expect(getItem('src')).toBeInTheDocument();
    expect(getItem('README.md')).toBeInTheDocument();
    // children of collapsed src are not visible
    expect(screen.queryByRole('treeitem', { name: /index\.ts/ })).toBeNull();
  });

  it('clicking a folder toggles expanded state', async () => {
    const user = userEvent.setup();
    render(<FileTree nodes={sample} />);
    const src = getItem('src');
    expect(src).toHaveAttribute('aria-expanded', 'false');
    await user.click(src);
    expect(getItem('src')).toHaveAttribute('aria-expanded', 'true');
    expect(getItem('index.ts')).toBeInTheDocument();
    await user.click(getItem('src'));
    expect(getItem('src')).toHaveAttribute('aria-expanded', 'false');
  });

  it('clicking a file fires onSelect with id + node', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <FileTree nodes={sample} defaultExpanded={['src']} onSelect={onSelect} />,
    );
    await user.click(getItem('index.ts'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(
      'src/index.ts',
      expect.objectContaining({ id: 'src/index.ts', type: 'file' }),
    );
  });

  it('clicking a folder does not call onSelect', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<FileTree nodes={sample} onSelect={onSelect} />);
    await user.click(getItem('src'));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('selectedId applies aria-selected=true and selected style', () => {
    render(
      <FileTree
        nodes={sample}
        defaultExpanded={['src']}
        selectedId="src/index.ts"
      />,
    );
    const item = getItem('index.ts');
    expect(item).toHaveAttribute('aria-selected', 'true');
    expect(item.className).toMatch(/bg-primary/);
  });

  it('ArrowDown moves focus to next visible item', async () => {
    const user = userEvent.setup();
    render(<FileTree nodes={sample} defaultExpanded={['src']} />);
    const src = getItem('src');
    src.focus();
    await user.keyboard('{ArrowDown}');
    expect(getItem('lib')).toHaveFocus();
  });

  it('ArrowUp moves focus to previous visible item', async () => {
    const user = userEvent.setup();
    render(<FileTree nodes={sample} defaultExpanded={['src']} />);
    getItem('lib').focus();
    await user.keyboard('{ArrowUp}');
    expect(getItem('src')).toHaveFocus();
  });

  it('ArrowRight on a collapsed folder expands it', async () => {
    const user = userEvent.setup();
    render(<FileTree nodes={sample} />);
    const src = getItem('src');
    src.focus();
    expect(src).toHaveAttribute('aria-expanded', 'false');
    await user.keyboard('{ArrowRight}');
    expect(getItem('src')).toHaveAttribute('aria-expanded', 'true');
  });

  it('ArrowRight on an expanded folder moves to first child', async () => {
    const user = userEvent.setup();
    render(<FileTree nodes={sample} defaultExpanded={['src']} />);
    const src = getItem('src');
    src.focus();
    await user.keyboard('{ArrowRight}');
    expect(getItem('lib')).toHaveFocus();
  });

  it('ArrowLeft on an expanded folder collapses it', async () => {
    const user = userEvent.setup();
    render(<FileTree nodes={sample} defaultExpanded={['src']} />);
    const src = getItem('src');
    src.focus();
    await user.keyboard('{ArrowLeft}');
    expect(getItem('src')).toHaveAttribute('aria-expanded', 'false');
  });

  it('ArrowLeft on a file moves focus to parent folder', async () => {
    const user = userEvent.setup();
    render(<FileTree nodes={sample} defaultExpanded={['src']} />);
    const file = getItem('index.ts');
    file.focus();
    await user.keyboard('{ArrowLeft}');
    expect(getItem('src')).toHaveFocus();
  });

  it('Home / End jump to first / last visible item', async () => {
    const user = userEvent.setup();
    render(<FileTree nodes={sample} defaultExpanded={['src']} />);
    const mid = getItem('lib');
    mid.focus();
    await user.keyboard('{End}');
    expect(getItem('README.md')).toHaveFocus();
    await user.keyboard('{Home}');
    expect(getItem('src')).toHaveFocus();
  });

  it('Enter selects the focused node via onSelect', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <FileTree
        nodes={sample}
        defaultExpanded={['src']}
        onSelect={onSelect}
      />,
    );
    const file = getItem('index.ts');
    file.focus();
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith(
      'src/index.ts',
      expect.objectContaining({ id: 'src/index.ts' }),
    );
  });

  it('aria-level reflects depth', () => {
    render(<FileTree nodes={sample} defaultExpanded={['src', 'src/lib']} />);
    expect(getItem('src')).toHaveAttribute('aria-level', '1');
    expect(getItem('lib')).toHaveAttribute('aria-level', '2');
    expect(getItem('a.ts')).toHaveAttribute('aria-level', '3');
  });

  it('aria-expanded reflects expanded state on folders only', () => {
    render(<FileTree nodes={sample} defaultExpanded={['src']} />);
    expect(getItem('src')).toHaveAttribute('aria-expanded', 'true');
    expect(getItem('lib')).toHaveAttribute('aria-expanded', 'false');
    // files do not advertise aria-expanded
    expect(getItem('README.md')).not.toHaveAttribute('aria-expanded');
  });

  it('className prop merges onto the outer ul', () => {
    render(<FileTree nodes={sample} className="custom-ft" />);
    const tree = screen.getByRole('tree');
    expect(tree.className).toMatch(/custom-ft/);
  });

  it('forwardRef exposes the underlying ul element', () => {
    const ref = createRef<HTMLUListElement>();
    render(<FileTree nodes={sample} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLUListElement);
    expect(ref.current).toBe(screen.getByRole('tree'));
  });

  it('ariaLabel is applied to the tree role', () => {
    render(<FileTree nodes={sample} ariaLabel="Source files" />);
    const tree = screen.getByRole('tree', { name: /source files/i });
    expect(tree).toBeInTheDocument();
    // sanity: items live inside this tree
    expect(within(tree).getByRole('treeitem', { name: /src/ })).toBeInTheDocument();
  });
});
