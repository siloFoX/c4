// (v1.11.350, TODO 11.332) Visual snapshot test for the
// existing Sidebar primitive at its two canonical states:
// collapsed (icon-only rail at md+) and expanded (full
// worker-list panel). The dispatch asks for "visual
// snapshot test for collapsed/expanded sidebar states";
// these snapshots lock down the rendered markup so a
// future layout refactor that accidentally drops the
// icon rail class or the collapse handle surfaces in CI.
//
// The snapshots target the rendered DOM tree, not pixel
// output -- jsdom does not compute layout. They still
// catch class-string drift, missing data attributes,
// and structural reordering. A Playwright follow-up can
// take real-pixel snapshots against a live browser.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import Sidebar from './Sidebar';
import { setLocale } from '../../lib/i18n';

// Mirror the v1.11.343 Sidebar.test.tsx mocks so the
// snapshot is stable across worker-list / hierarchy-tree
// / account-menu evolution. The dispatch's "collapsed vs
// expanded" axis lives entirely on the Sidebar outer
// shell, not on its inner panels.
vi.mock('../WorkerList', () => ({
  default: () => <div data-testid="worker-list">worker-list</div>,
}));
vi.mock('../HierarchyTree', () => ({
  default: () => <div data-testid="hierarchy-tree">hierarchy-tree</div>,
}));
vi.mock('../AccountMenu', () => ({
  default: ({ collapsed }: { collapsed?: boolean }) => (
    <div data-testid="account-menu" data-collapsed={collapsed ? 'true' : 'false'}>
      account-menu
    </div>
  ),
}));

beforeEach(() => {
  setLocale('en');
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

describe('<Sidebar> snapshots (collapsed vs expanded)', () => {
  it('matches the expanded-state snapshot', () => {
    const { asFragment } = render(
      <Sidebar
        open={true}
        mode="list"
        onModeChange={() => {}}
        selectedWorker={null}
        onSelect={() => {}}
        collapsed={false}
        onToggleCollapsed={() => {}}
        onLogout={() => {}}
      />,
    );
    expect(asFragment()).toMatchSnapshot();
  });

  it('matches the collapsed-state snapshot', () => {
    const { asFragment } = render(
      <Sidebar
        open={true}
        mode="list"
        onModeChange={() => {}}
        selectedWorker={null}
        onSelect={() => {}}
        collapsed={true}
        onToggleCollapsed={() => {}}
        onLogout={() => {}}
      />,
    );
    expect(asFragment()).toMatchSnapshot();
  });

  // (v1.11.350, TODO 11.332) The collapse axis flips the
  // AccountMenu's `collapsed` prop so the dropdown
  // rendering style changes. Assert the boundary
  // explicitly so a regression that drops the collapse
  // prop wiring surfaces with a clear error, not a
  // snapshot diff buried inside the larger tree.
  it('passes collapsed=true to AccountMenu when the sidebar is collapsed', () => {
    const { getByTestId } = render(
      <Sidebar
        open={true}
        mode="list"
        onModeChange={() => {}}
        selectedWorker={null}
        onSelect={() => {}}
        collapsed={true}
        onToggleCollapsed={() => {}}
        onLogout={() => {}}
      />,
    );
    expect(getByTestId('account-menu').getAttribute('data-collapsed')).toBe(
      'true',
    );
  });

  it('passes collapsed=false to AccountMenu when the sidebar is expanded', () => {
    const { getByTestId } = render(
      <Sidebar
        open={true}
        mode="list"
        onModeChange={() => {}}
        selectedWorker={null}
        onSelect={() => {}}
        collapsed={false}
        onToggleCollapsed={() => {}}
        onLogout={() => {}}
      />,
    );
    expect(getByTestId('account-menu').getAttribute('data-collapsed')).toBe(
      'false',
    );
  });
});
