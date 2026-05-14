import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Sidebar from './Sidebar';
import { setLocale } from '../../lib/i18n';

// WorkerList + HierarchyTree have their own polling / SSE wiring and
// dedicated test files. Stub them with markers so we can assert on the
// active branch without re-mocking the daemon API surface here.
vi.mock('../WorkerList', () => ({
  default: ({
    selectedWorker,
    onSelect,
  }: {
    selectedWorker: string | null;
    onSelect: (n: string) => void;
  }) => (
    <button
      type="button"
      data-testid="worker-list"
      data-selected={selectedWorker ?? ''}
      onClick={() => onSelect('w1')}
    >
      worker-list
    </button>
  ),
}));

vi.mock('../HierarchyTree', () => ({
  default: ({
    selectedWorker,
    onSelect,
  }: {
    selectedWorker: string | null;
    onSelect: (n: string | null) => void;
  }) => (
    <button
      type="button"
      data-testid="hierarchy-tree"
      data-selected={selectedWorker ?? ''}
      onClick={() => onSelect('w2')}
    >
      hierarchy-tree
    </button>
  ),
}));

vi.mock('../AccountMenu', () => ({
  default: ({
    onLogout,
    onOpenPreferences,
    collapsed,
  }: {
    onLogout: () => void;
    onOpenPreferences?: () => void;
    collapsed?: boolean;
  }) => (
    <div data-testid="account-menu" data-collapsed={collapsed ? 'true' : 'false'}>
      <button type="button" data-testid="logout" onClick={onLogout}>
        signout
      </button>
      {onOpenPreferences ? (
        <button
          type="button"
          data-testid="prefs"
          onClick={onOpenPreferences}
        >
          prefs
        </button>
      ) : null}
    </div>
  ),
}));

beforeEach(() => {
  setLocale('en');
  // jsdom doesn't ship window.matchMedia; useEffectiveCollapsed (called by
  // Sidebar) reads it on mount, so install a desktop-shaped stub.
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockReturnValue({
      matches: true,
      media: '(min-width: 768px)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: () => false,
    }),
  });
});

function renderSidebar(overrides: Partial<Parameters<typeof Sidebar>[0]> = {}) {
  const props = {
    open: true,
    mode: 'list' as const,
    onModeChange: vi.fn(),
    selectedWorker: null as string | null,
    onSelect: vi.fn(),
    ...overrides,
  };
  const utils = render(<Sidebar {...props} />);
  return { ...utils, props };
}

describe('<Sidebar>', () => {
  it('returns null and renders nothing when open=false', () => {
    const { container } = renderSidebar({ open: false });
    expect(container.firstChild).toBeNull();
  });

  it('renders an aside labelled "Workers sidebar" when open=true', () => {
    renderSidebar();
    expect(screen.getByLabelText('Workers sidebar')).toBeInTheDocument();
  });

  it('labels the workers section with the "Workers" heading text when expanded', () => {
    renderSidebar();
    expect(screen.getByText('Workers')).toBeInTheDocument();
  });

  it('renders the inline list/tree mode tablist when not collapsed', () => {
    renderSidebar();
    expect(
      screen.getByRole('tablist', { name: 'Worker view mode' }),
    ).toBeInTheDocument();
  });

  it('marks the matching mode tab as aria-selected', () => {
    renderSidebar({ mode: 'tree' });
    const list = screen.getByRole('tablist', { name: 'Worker view mode' });
    const tabs = within(list).getAllByRole('tab');
    const treeTab = tabs.find((t) => t.textContent?.includes('Tree'));
    const listTab = tabs.find((t) => t.textContent?.includes('List'));
    expect(treeTab).toHaveAttribute('aria-selected', 'true');
    expect(listTab).toHaveAttribute('aria-selected', 'false');
  });

  it('fires onModeChange("tree") when the Tree tab is clicked', async () => {
    const user = userEvent.setup();
    const onModeChange = vi.fn();
    renderSidebar({ mode: 'list', onModeChange });
    const list = screen.getByRole('tablist', { name: 'Worker view mode' });
    const treeTab = within(list)
      .getAllByRole('tab')
      .find((t) => t.textContent?.includes('Tree'))!;
    await user.click(treeTab);
    expect(onModeChange).toHaveBeenCalledWith('tree');
  });

  it('fires onModeChange("list") when the List tab is clicked from tree mode', async () => {
    const user = userEvent.setup();
    const onModeChange = vi.fn();
    renderSidebar({ mode: 'tree', onModeChange });
    const list = screen.getByRole('tablist', { name: 'Worker view mode' });
    const listTab = within(list)
      .getAllByRole('tab')
      .find((t) => t.textContent?.includes('List'))!;
    await user.click(listTab);
    expect(onModeChange).toHaveBeenCalledWith('list');
  });

  it('renders the WorkerList stub when mode="list" and not collapsed', () => {
    renderSidebar({ mode: 'list' });
    expect(screen.getByTestId('worker-list')).toBeInTheDocument();
    expect(screen.queryByTestId('hierarchy-tree')).not.toBeInTheDocument();
  });

  it('renders the HierarchyTree stub when mode="tree" and not collapsed', () => {
    renderSidebar({ mode: 'tree' });
    expect(screen.getByTestId('hierarchy-tree')).toBeInTheDocument();
    expect(screen.queryByTestId('worker-list')).not.toBeInTheDocument();
  });

  it('forwards selectedWorker to the active child', () => {
    renderSidebar({ mode: 'list', selectedWorker: 'alice' });
    expect(screen.getByTestId('worker-list')).toHaveAttribute(
      'data-selected',
      'alice',
    );
  });

  it('forwards the onSelect callback to the active child', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderSidebar({ mode: 'list', onSelect });
    await user.click(screen.getByTestId('worker-list'));
    expect(onSelect).toHaveBeenCalledWith('w1');
  });

  it('omits the collapse handle when onToggleCollapsed is not provided', () => {
    renderSidebar();
    expect(
      screen.queryByRole('button', { name: 'Collapse sidebar' }),
    ).not.toBeInTheDocument();
  });

  it('renders the collapse handle when onToggleCollapsed is wired', () => {
    renderSidebar({ collapsed: false, onToggleCollapsed: vi.fn() });
    expect(
      screen.getByRole('button', { name: 'Collapse sidebar' }),
    ).toBeInTheDocument();
  });

  it('labels the collapse handle "Expand sidebar" when already collapsed', () => {
    renderSidebar({ collapsed: true, onToggleCollapsed: vi.fn() });
    expect(
      screen.getByRole('button', { name: 'Expand sidebar' }),
    ).toBeInTheDocument();
  });

  it('exposes aria-pressed on the collapse handle reflecting collapsed state', () => {
    renderSidebar({ collapsed: true, onToggleCollapsed: vi.fn() });
    expect(
      screen.getByRole('button', { name: 'Expand sidebar' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('advertises both Ctrl+B and Ctrl+\\ hotkeys via aria-keyshortcuts on the collapse handle', () => {
    renderSidebar({ collapsed: false, onToggleCollapsed: vi.fn() });
    expect(
      screen.getByRole('button', { name: 'Collapse sidebar' }),
    ).toHaveAttribute('aria-keyshortcuts', 'Control+B Control+Backslash');
  });

  it('fires onToggleCollapsed when Ctrl+\\ is pressed on the window', () => {
    const onToggleCollapsed = vi.fn();
    renderSidebar({ collapsed: false, onToggleCollapsed });
    fireEvent.keyDown(window, { key: '\\', ctrlKey: true });
    expect(onToggleCollapsed).toHaveBeenCalledTimes(1);
  });

  it('fires onToggleCollapsed when Cmd+\\ is pressed (mac modifier)', () => {
    const onToggleCollapsed = vi.fn();
    renderSidebar({ collapsed: false, onToggleCollapsed });
    fireEvent.keyDown(window, { key: '\\', metaKey: true });
    expect(onToggleCollapsed).toHaveBeenCalledTimes(1);
  });

  it('ignores Ctrl+\\ when the focused target is an input (no hijack of typing)', () => {
    const onToggleCollapsed = vi.fn();
    renderSidebar({ collapsed: false, onToggleCollapsed });
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: '\\', ctrlKey: true });
    expect(onToggleCollapsed).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it('does not register the Ctrl+\\ listener when onToggleCollapsed is not wired', () => {
    renderSidebar();
    expect(() => fireEvent.keyDown(window, { key: '\\', ctrlKey: true })).not.toThrow();
  });

  it('fires onToggleCollapsed when the collapse handle is clicked', async () => {
    const user = userEvent.setup();
    const onToggleCollapsed = vi.fn();
    renderSidebar({ collapsed: false, onToggleCollapsed });
    await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(onToggleCollapsed).toHaveBeenCalledTimes(1);
  });

  it('flips data-collapsed on the aside when collapsed=true', () => {
    renderSidebar({ collapsed: true });
    expect(screen.getByLabelText('Workers sidebar')).toHaveAttribute(
      'data-collapsed',
      'true',
    );
  });

  it('uses the wider width class when not collapsed', () => {
    renderSidebar({ collapsed: false });
    expect(screen.getByLabelText('Workers sidebar')).toHaveClass('md:w-72');
  });

  it('uses the icon-rail width class when collapsed', () => {
    renderSidebar({ collapsed: true });
    expect(screen.getByLabelText('Workers sidebar')).toHaveClass('md:w-14');
  });

  it('omits the AccountMenu when onLogout is not provided', () => {
    renderSidebar();
    expect(screen.queryByTestId('account-menu')).not.toBeInTheDocument();
  });

  it('renders the AccountMenu when onLogout is wired', () => {
    renderSidebar({ onLogout: vi.fn() });
    expect(screen.getByTestId('account-menu')).toBeInTheDocument();
  });

  it('forwards onLogout into the AccountMenu', async () => {
    const user = userEvent.setup();
    const onLogout = vi.fn();
    renderSidebar({ onLogout });
    await user.click(screen.getByTestId('logout'));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('forwards onOpenPreferences into the AccountMenu when supplied', async () => {
    const user = userEvent.setup();
    const onOpenPreferences = vi.fn();
    renderSidebar({ onLogout: vi.fn(), onOpenPreferences });
    await user.click(screen.getByTestId('prefs'));
    expect(onOpenPreferences).toHaveBeenCalledTimes(1);
  });

  it('forwards the collapsed flag down to the AccountMenu', () => {
    renderSidebar({ collapsed: true, onLogout: vi.fn() });
    expect(screen.getByTestId('account-menu')).toHaveAttribute(
      'data-collapsed',
      'true',
    );
  });
});
