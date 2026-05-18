import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Menu } from 'lucide-react';
import { cn } from '../../lib/cn';
import {
  Drawer,
  IconButton,
  ScrollArea,
  Tooltip,
  VisuallyHidden,
} from '../ui';

// (v1.11.343, TODO 11.325) Reusable application shell primitive.
//
// Standardises the header / sidebar / main / footer regions
// across the web app so per-page shells do not have to
// re-derive the layout rhythm. The shell is intentionally
// composable: callers pass `header` / `nav` / `footer`
// (any ReactNode or NavItem[]) and the primitive owns the
// region landmarks, scroll discipline, responsive collapse,
// and accessibility plumbing.
//
// Behaviour:
//   * `<header>`, `<aside>`, `<main>`, `<footer>` semantic
//     landmarks so screen readers can jump between regions
//     via the Rotor / NVDA region nav contract.
//   * `<main>` is wrapped in a `ScrollArea` so long content
//     stays inside its own scroll shell -- the header /
//     sidebar / footer remain fixed in the viewport.
//   * Sidebar `collapsed` axis hides the label text and
//     leaves only the icon, with a `Tooltip` echoing the
//     label on hover / focus.
//   * Sidebar `mobileOpen` axis switches to a left-anchored
//     `Drawer` so the navigation slides in over the canvas
//     on small viewports.
//   * Every interactive element carries the project's
//     standard `focus-visible:ring-2 focus-visible:ring-primary
//     focus-visible:ring-offset-2 focus-visible:ring-offset-background`
//     classes so keyboard navigation is always visible.
//
// The primitive is NOT wired into App.tsx in this patch --
// the existing AppHeader + Sidebar + FeatureView composition
// keeps working. Future patches can adopt AppShell
// incrementally without breaking the active layout.

export interface AppShellNavItem {
  // Stable id used as the React key + ARIA target.
  id: string;
  // Visible label. Always rendered when expanded; hidden
  // (kept in the Tooltip + aria-label) when collapsed.
  label: string;
  // Optional icon node. Required visually when the sidebar
  // is collapsed so the user has something to click on; the
  // primitive does not enforce it but warns via aria-label
  // fallback.
  icon?: ReactNode;
  // Optional href. When set, the nav item renders as an
  // `<a>`. Otherwise the item renders as a `<button>`.
  href?: string;
  // Click handler. Used by both the `<button>` and `<a>`
  // forms. Fires before the default `<a>` navigation; call
  // `event.preventDefault()` from the handler to suppress
  // the href navigation when needed.
  onClick?: () => void;
  // Active state. Drives `aria-current="page"` and the
  // active visual treatment. The primitive does not own
  // active-route detection; the caller decides.
  active?: boolean;
  // Disabled state. Renders the item with reduced opacity
  // and ignores click events.
  disabled?: boolean;
}

export interface AppShellProps {
  // Header content. Rendered inside the top `<header
  // role="banner">` landmark.
  header: ReactNode;
  // Optional navigation items. When provided, the
  // primitive renders an `<aside role="navigation">` to
  // the left of the main region. Omit to render just
  // header + main + footer.
  nav?: AppShellNavItem[];
  // Optional sidebar title (e.g., the app name). Rendered
  // above the nav list when the sidebar is expanded; hidden
  // when collapsed.
  sidebarTitle?: ReactNode;
  // Optional sidebar footer (e.g., user / preferences
  // menu). Rendered at the bottom of the sidebar.
  sidebarFooter?: ReactNode;
  // Desktop collapse axis. When true the sidebar shrinks
  // to an icon-only rail and the labels move into
  // Tooltips. Controlled -- the host owns the state +
  // toggle handler.
  sidebarCollapsed?: boolean;
  onSidebarCollapsedChange?: (collapsed: boolean) => void;
  // Mobile open axis. When true the sidebar Drawer is
  // open. Controlled -- the host owns the state. When
  // omitted, the primitive owns the state internally.
  mobileNavOpen?: boolean;
  onMobileNavOpenChange?: (open: boolean) => void;
  // Footer content. Rendered inside the bottom
  // `<footer role="contentinfo">` landmark. Optional --
  // the landmark is skipped entirely when omitted.
  footer?: ReactNode;
  // Main content. Rendered inside `<main role="main">`,
  // wrapped in a vertical `ScrollArea` by default.
  children: ReactNode;
  className?: string;
  // Per-region class overrides. Useful when the caller
  // needs to inject Tailwind utility classes for a
  // specific layout tweak (e.g., padding, background).
  headerClassName?: string;
  sidebarClassName?: string;
  mainClassName?: string;
  footerClassName?: string;
  // (v1.11.350, TODO 11.332) Main-region scroll discipline.
  // `'auto'` (default) wraps the children in a vertical
  // `ScrollArea` so long content scrolls inside its own
  // shell. `'inherit'` skips the wrapper and lets the
  // caller manage scroll -- needed by hosts whose body
  // contains per-view flex layouts with their own
  // `overflow` semantics (terminal panes, chat surfaces,
  // multi-pane editors). The shell's `<main>` keeps the
  // `flex min-w-0 flex-1 flex-col` rhythm in either mode
  // so the children's `flex-1 min-h-0` chains continue to
  // work.
  mainScroll?: 'auto' | 'inherit';
}

// Default sidebar widths. The expanded width matches the
// existing Sidebar component (~16rem); the collapsed rail
// is sized for a single icon + comfortable hit target.
const SIDEBAR_EXPANDED_WIDTH = '16rem';
const SIDEBAR_COLLAPSED_WIDTH = '3.5rem';

// (v1.11.343, TODO 11.325) Shared focus-visible ring class
// applied to every interactive surface inside the shell.
// Exported so other layout primitives can share the same
// visual contract without re-deriving the class string.
export const APP_SHELL_FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background';

function NavItemButton({
  item,
  collapsed,
}: {
  item: AppShellNavItem;
  collapsed: boolean;
}) {
  const baseClasses = cn(
    'group flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm font-medium transition-colors',
    APP_SHELL_FOCUS_RING,
    item.active
      ? 'bg-primary/20 text-foreground'
      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
    item.disabled && 'cursor-not-allowed opacity-50 hover:bg-transparent hover:text-muted-foreground',
    collapsed && 'justify-center px-0',
  );

  const handleClick = (event: React.MouseEvent) => {
    if (item.disabled) {
      event.preventDefault();
      return;
    }
    item.onClick?.();
  };

  const content = (
    <>
      {item.icon ? (
        <span
          data-section="app-shell-nav-icon"
          className="flex h-5 w-5 shrink-0 items-center justify-center"
          aria-hidden="true"
        >
          {item.icon}
        </span>
      ) : null}
      {collapsed ? (
        <VisuallyHidden>{item.label}</VisuallyHidden>
      ) : (
        <span
          data-section="app-shell-nav-label"
          className="truncate"
        >
          {item.label}
        </span>
      )}
    </>
  );

  const inner = item.href ? (
    <a
      href={item.href}
      data-testid={`app-shell-nav-${item.id}`}
      data-active={item.active ? 'true' : 'false'}
      aria-current={item.active ? 'page' : undefined}
      aria-disabled={item.disabled ? 'true' : undefined}
      aria-label={collapsed ? item.label : undefined}
      onClick={handleClick}
      tabIndex={item.disabled ? -1 : 0}
      className={baseClasses}
    >
      {content}
    </a>
  ) : (
    <button
      type="button"
      data-testid={`app-shell-nav-${item.id}`}
      data-active={item.active ? 'true' : 'false'}
      aria-current={item.active ? 'page' : undefined}
      aria-label={collapsed ? item.label : undefined}
      disabled={item.disabled}
      onClick={handleClick}
      className={baseClasses}
    >
      {content}
    </button>
  );

  // (v1.11.343, TODO 11.325) Tooltip wraps every nav item
  // when the sidebar is collapsed so the operator can
  // confirm what each icon means without expanding the
  // rail. The Tooltip primitive renders nothing visible
  // until hover / focus, so it is safe to mount
  // unconditionally on every collapsed render.
  if (collapsed) {
    return (
      <Tooltip label={item.label} placement="right">
        {inner}
      </Tooltip>
    );
  }
  return inner;
}

export function AppShell({
  header,
  nav,
  sidebarTitle,
  sidebarFooter,
  sidebarCollapsed = false,
  onSidebarCollapsedChange,
  mobileNavOpen,
  onMobileNavOpenChange,
  footer,
  children,
  className,
  headerClassName,
  sidebarClassName,
  mainClassName,
  footerClassName,
  mainScroll = 'auto',
}: AppShellProps) {
  // Uncontrolled mobile-open fallback for hosts that just
  // want the Drawer to manage itself. The controlled props
  // win when both are set.
  const [internalMobileOpen, setInternalMobileOpen] = useState(false);
  const effectiveMobileOpen =
    mobileNavOpen !== undefined ? mobileNavOpen : internalMobileOpen;
  const handleMobileOpenChange = (open: boolean) => {
    if (onMobileNavOpenChange) onMobileNavOpenChange(open);
    else setInternalMobileOpen(open);
  };

  const sidebarStyle: CSSProperties = {
    width: sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH,
  };

  const sidebarBody = nav ? (
    <nav
      data-section="app-shell-nav-list"
      data-collapsed={sidebarCollapsed ? 'true' : 'false'}
      aria-label="Primary"
      className="flex flex-col gap-1"
    >
      {nav.map((item) => (
        <NavItemButton
          key={item.id}
          item={item}
          collapsed={sidebarCollapsed}
        />
      ))}
    </nav>
  ) : null;

  return (
    <div
      data-section="app-shell"
      data-collapsed={sidebarCollapsed ? 'true' : 'false'}
      className={cn(
        'flex h-screen min-h-0 flex-col bg-background text-foreground',
        className,
      )}
    >
      <header
        data-section="app-shell-header"
        role="banner"
        className={cn(
          'flex shrink-0 items-center gap-2 border-b border-border bg-card/40 px-3 py-2',
          headerClassName,
        )}
      >
        {nav ? (
          /* Mobile hamburger sits at the left of the header
             so the operator can pop open the nav Drawer
             from any viewport. Hidden on md+ where the
             sidebar is permanently rendered. */
          <IconButton
            icon={<Menu className="h-4 w-4" />}
            aria-label="Open navigation"
            data-testid="app-shell-mobile-nav-toggle"
            onClick={() => handleMobileOpenChange(true)}
            className={cn('md:hidden', APP_SHELL_FOCUS_RING)}
          />
        ) : null}
        <div className="flex min-w-0 flex-1 items-center gap-2">{header}</div>
      </header>

      <div
        data-section="app-shell-body"
        className="flex min-h-0 flex-1 overflow-hidden"
      >
        {nav ? (
          <aside
            data-section="app-shell-sidebar"
            data-collapsed={sidebarCollapsed ? 'true' : 'false'}
            aria-label="Sidebar"
            style={sidebarStyle}
            className={cn(
              'hidden shrink-0 border-r border-border bg-card/30 transition-[width] md:flex md:flex-col',
              sidebarClassName,
            )}
          >
            {sidebarTitle && !sidebarCollapsed ? (
              <div
                data-section="app-shell-sidebar-title"
                className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {sidebarTitle}
              </div>
            ) : null}

            <ScrollArea
              axis="y"
              className="flex-1 px-2 py-2"
              data-testid="app-shell-sidebar-scroll"
            >
              {sidebarBody}
            </ScrollArea>

            {sidebarFooter ? (
              <div
                data-section="app-shell-sidebar-footer"
                className="border-t border-border px-2 py-2"
              >
                {sidebarFooter}
              </div>
            ) : null}

            {onSidebarCollapsedChange ? (
              <button
                type="button"
                onClick={() =>
                  onSidebarCollapsedChange(!sidebarCollapsed)
                }
                data-testid="app-shell-sidebar-collapse-toggle"
                aria-label={
                  sidebarCollapsed
                    ? 'Expand sidebar'
                    : 'Collapse sidebar'
                }
                aria-pressed={sidebarCollapsed}
                className={cn(
                  'border-t border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground',
                  APP_SHELL_FOCUS_RING,
                )}
              >
                {sidebarCollapsed ? '>>' : '<<'}
              </button>
            ) : null}
          </aside>
        ) : null}

        <main
          data-section="app-shell-main"
          data-main-scroll={mainScroll}
          role="main"
          className={cn(
            'flex min-w-0 flex-1 flex-col',
            mainClassName,
          )}
        >
          {/* (v1.11.350, TODO 11.332) mainScroll="inherit"
              skips the default ScrollArea wrap so callers
              whose body manages its own scroll (terminal
              panes, chat surfaces, multi-pane editors)
              can opt out. The "auto" default keeps the
              v1.11.343 contract for pages that want the
              shell to own the scroll. */}
          {mainScroll === 'inherit' ? (
            children
          ) : (
            <ScrollArea
              axis="y"
              className="flex-1"
              data-testid="app-shell-main-scroll"
            >
              {children}
            </ScrollArea>
          )}
        </main>
      </div>

      {footer ? (
        <footer
          data-section="app-shell-footer"
          role="contentinfo"
          className={cn(
            'shrink-0 border-t border-border bg-card/40 px-3 py-2',
            footerClassName,
          )}
        >
          {footer}
        </footer>
      ) : null}

      {/* (v1.11.343, TODO 11.325) Mobile nav Drawer. Hidden
          on md+ where the persistent aside is rendered.
          The Drawer primitive owns the backdrop, focus
          trap, and Escape-to-close contract. Side="left"
          mirrors the desktop layout. */}
      {nav ? (
        <Drawer
          open={effectiveMobileOpen}
          onOpenChange={handleMobileOpenChange}
          side="left"
          width="80vw"
          title={sidebarTitle}
          showCloseButton
          closeOnBackdropClick
          closeOnEsc
        >
          <div
            data-section="app-shell-mobile-nav-body"
            className="flex flex-col gap-1 px-2 py-2"
          >
            {nav.map((item) => (
              <NavItemButton
                key={item.id}
                item={{
                  ...item,
                  // Tap an item on mobile closes the
                  // drawer so the operator sees the new
                  // route immediately.
                  onClick: () => {
                    item.onClick?.();
                    handleMobileOpenChange(false);
                  },
                }}
                collapsed={false}
              />
            ))}
            {sidebarFooter ? (
              <div
                data-section="app-shell-mobile-sidebar-footer"
                className="mt-2 border-t border-border pt-2"
              >
                {sidebarFooter}
              </div>
            ) : null}
          </div>
        </Drawer>
      ) : null}
    </div>
  );
}

AppShell.displayName = 'AppShell';
