import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppShell, APP_SHELL_FOCUS_RING } from './AppShell';
import type { AppShellNavItem } from './AppShell';

// AppShell is a layout primitive: it owns the
// header / sidebar / main / footer region landmarks +
// the responsive collapse + Drawer behaviour. Tests below
// drive the component through its main configurations
// (no nav, nav, collapsed, mobile drawer, footer) and
// assert on landmark roles + data-section / data-testid
// selectors so future refactors can move the inner DOM
// without breaking the contract.

function makeNav(): AppShellNavItem[] {
  return [
    { id: 'home', label: 'Home', icon: <span data-testid="icon-home" />, active: true },
    { id: 'search', label: 'Search', icon: <span data-testid="icon-search" /> },
    { id: 'settings', label: 'Settings', icon: <span data-testid="icon-settings" /> },
  ];
}

describe('<AppShell>', () => {
  it('renders the header / main landmarks with semantic roles', () => {
    render(<AppShell header={<span>HEADER</span>}>body</AppShell>);
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByText('HEADER')).toBeInTheDocument();
    expect(screen.getByText('body')).toBeInTheDocument();
  });

  it('skips the footer landmark when `footer` is omitted', () => {
    render(<AppShell header="H">body</AppShell>);
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
  });

  it('renders the footer landmark when `footer` is provided', () => {
    render(
      <AppShell header="H" footer={<span>FOOTER</span>}>
        body
      </AppShell>,
    );
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(screen.getByText('FOOTER')).toBeInTheDocument();
  });

  // (v1.11.343, TODO 11.325) When no nav is provided the
  // shell skips the aside / sidebar wiring entirely.
  it('does NOT render the aside landmark when `nav` is omitted', () => {
    render(<AppShell header="H">body</AppShell>);
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/^Sidebar$/i, { selector: 'aside' }),
    ).not.toBeInTheDocument();
  });

  it('renders the aside landmark and nav items when `nav` is provided', () => {
    render(
      <AppShell header="H" nav={makeNav()}>
        body
      </AppShell>,
    );
    expect(
      screen.getByLabelText('Sidebar', { selector: 'aside' }),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('Primary', { selector: 'nav' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('app-shell-nav-home')).toBeInTheDocument();
    expect(screen.getByTestId('app-shell-nav-search')).toBeInTheDocument();
    expect(screen.getByTestId('app-shell-nav-settings')).toBeInTheDocument();
  });

  // (v1.11.343, TODO 11.325) Active nav item carries
  // `aria-current="page"` and `data-active="true"`.
  it('marks the active nav item with aria-current and data-active', () => {
    render(
      <AppShell header="H" nav={makeNav()}>
        body
      </AppShell>,
    );
    const home = screen.getByTestId('app-shell-nav-home');
    expect(home.getAttribute('aria-current')).toBe('page');
    expect(home.getAttribute('data-active')).toBe('true');
    const search = screen.getByTestId('app-shell-nav-search');
    expect(search.getAttribute('aria-current')).toBeNull();
    expect(search.getAttribute('data-active')).toBe('false');
  });

  // (v1.11.343, TODO 11.325) Nav item click fires the
  // caller-provided onClick handler.
  it('fires the nav item onClick handler when clicked', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <AppShell
        header="H"
        nav={[{ id: 'a', label: 'Item A', onClick }]}
      >
        body
      </AppShell>,
    );
    await user.click(screen.getByTestId('app-shell-nav-a'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('skips the onClick handler when the item is disabled', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <AppShell
        header="H"
        nav={[{ id: 'a', label: 'Item A', onClick, disabled: true }]}
      >
        body
      </AppShell>,
    );
    await user.click(screen.getByTestId('app-shell-nav-a'));
    expect(onClick).not.toHaveBeenCalled();
  });

  // (v1.11.343, TODO 11.325) Sidebar collapse axis hides
  // labels but the icon stays visible + tooltip wraps the
  // item.
  it('hides nav labels and adds aria-label when sidebar is collapsed', () => {
    render(
      <AppShell header="H" nav={makeNav()} sidebarCollapsed>
        body
      </AppShell>,
    );
    const home = screen.getByTestId('app-shell-nav-home');
    expect(home.getAttribute('aria-label')).toBe('Home');
    // The aria-current and icon survive.
    expect(home.getAttribute('aria-current')).toBe('page');
    expect(screen.getByTestId('icon-home')).toBeInTheDocument();
  });

  // (v1.11.343, TODO 11.325) The aside surfaces a
  // data-collapsed attr so e2e + styling can react to it.
  it('surfaces data-collapsed="true" on the aside when collapsed', () => {
    render(
      <AppShell header="H" nav={makeNav()} sidebarCollapsed>
        body
      </AppShell>,
    );
    const aside = screen.getByLabelText('Sidebar', { selector: 'aside' });
    expect(aside.getAttribute('data-collapsed')).toBe('true');
  });

  it('surfaces data-collapsed="false" on the aside when expanded', () => {
    render(
      <AppShell header="H" nav={makeNav()}>
        body
      </AppShell>,
    );
    const aside = screen.getByLabelText('Sidebar', { selector: 'aside' });
    expect(aside.getAttribute('data-collapsed')).toBe('false');
  });

  // (v1.11.343, TODO 11.325) The collapse toggle is only
  // rendered when the host wires onSidebarCollapsedChange.
  it('renders the collapse toggle only when onSidebarCollapsedChange is set', () => {
    const { rerender } = render(
      <AppShell header="H" nav={makeNav()}>
        body
      </AppShell>,
    );
    expect(
      screen.queryByTestId('app-shell-sidebar-collapse-toggle'),
    ).not.toBeInTheDocument();
    rerender(
      <AppShell
        header="H"
        nav={makeNav()}
        onSidebarCollapsedChange={() => {}}
      >
        body
      </AppShell>,
    );
    expect(
      screen.getByTestId('app-shell-sidebar-collapse-toggle'),
    ).toBeInTheDocument();
  });

  // (v1.11.343, TODO 11.325) Clicking the collapse toggle
  // flips the controlled value via the callback.
  it('flips the collapsed value via onSidebarCollapsedChange', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <AppShell
        header="H"
        nav={makeNav()}
        sidebarCollapsed={false}
        onSidebarCollapsedChange={onChange}
      >
        body
      </AppShell>,
    );
    await user.click(
      screen.getByTestId('app-shell-sidebar-collapse-toggle'),
    );
    expect(onChange).toHaveBeenCalledWith(true);
  });

  // (v1.11.343, TODO 11.325) The mobile nav toggle is only
  // rendered when `nav` is provided. Clicking it flips the
  // Drawer open via the controlled callback or the
  // internal state.
  it('renders the mobile nav toggle only when nav is provided', () => {
    const { rerender } = render(<AppShell header="H">body</AppShell>);
    expect(
      screen.queryByTestId('app-shell-mobile-nav-toggle'),
    ).not.toBeInTheDocument();
    rerender(
      <AppShell header="H" nav={makeNav()}>
        body
      </AppShell>,
    );
    expect(
      screen.getByTestId('app-shell-mobile-nav-toggle'),
    ).toBeInTheDocument();
  });

  it('opens the mobile nav Drawer via the controlled callback', async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(
      <AppShell
        header="H"
        nav={makeNav()}
        mobileNavOpen={false}
        onMobileNavOpenChange={onOpen}
      >
        body
      </AppShell>,
    );
    await user.click(screen.getByTestId('app-shell-mobile-nav-toggle'));
    expect(onOpen).toHaveBeenCalledWith(true);
  });

  // (v1.11.343, TODO 11.325) Sidebar title surfaces only
  // when expanded.
  it('renders the sidebar title only when expanded', () => {
    const { rerender } = render(
      <AppShell
        header="H"
        nav={makeNav()}
        sidebarTitle={<span data-testid="shell-title">C4</span>}
      >
        body
      </AppShell>,
    );
    expect(screen.getByTestId('shell-title')).toBeInTheDocument();

    rerender(
      <AppShell
        header="H"
        nav={makeNav()}
        sidebarTitle={<span data-testid="shell-title">C4</span>}
        sidebarCollapsed
      >
        body
      </AppShell>,
    );
    // When collapsed the title is hidden in the persistent
    // aside (the mobile drawer still shows it via the
    // Drawer header).
    const aside = screen.getByLabelText('Sidebar', { selector: 'aside' });
    expect(
      within(aside).queryByTestId('shell-title'),
    ).not.toBeInTheDocument();
  });

  // (v1.11.343, TODO 11.325) Sidebar footer slot renders
  // when provided.
  it('renders the sidebar footer when provided', () => {
    render(
      <AppShell
        header="H"
        nav={makeNav()}
        sidebarFooter={<span data-testid="shell-footer">FOOT</span>}
      >
        body
      </AppShell>,
    );
    expect(screen.getByTestId('shell-footer')).toBeInTheDocument();
  });

  // (v1.11.343, TODO 11.325) ScrollArea wraps both the
  // sidebar and the main region.
  it('wraps the sidebar + main regions in ScrollArea primitives', () => {
    render(
      <AppShell header="H" nav={makeNav()}>
        body
      </AppShell>,
    );
    expect(
      screen.getByTestId('app-shell-sidebar-scroll'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('app-shell-main-scroll'),
    ).toBeInTheDocument();
  });

  // (v1.11.343, TODO 11.325) Focus-ring contract export.
  it('exports the shared focus-visible ring class string', () => {
    expect(APP_SHELL_FOCUS_RING).toContain('focus-visible:ring-2');
    expect(APP_SHELL_FOCUS_RING).toContain('focus-visible:ring-primary');
  });

  // (v1.11.343, TODO 11.325) Nav item renders as an `<a>`
  // when href is provided.
  it('renders the nav item as an anchor when href is provided', () => {
    render(
      <AppShell
        header="H"
        nav={[{ id: 'docs', label: 'Docs', href: '#docs' }]}
      >
        body
      </AppShell>,
    );
    const item = screen.getByTestId('app-shell-nav-docs');
    expect(item.tagName).toBe('A');
    expect(item.getAttribute('href')).toBe('#docs');
  });
});
