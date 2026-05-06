import { useEffect, useState } from 'react';
import { List, Network, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from '../../lib/cn';
import { t, useLocale } from '../../lib/i18n';
import { IconButton, Tooltip } from '../ui';
import AccountMenu from '../AccountMenu';
import HierarchyTree from '../HierarchyTree';
import WorkerList from '../WorkerList';

export type SidebarMode = 'list' | 'tree';

interface SidebarProps {
  open: boolean;
  mode: SidebarMode;
  onModeChange: (m: SidebarMode) => void;
  selectedWorker: string | null;
  onSelect: (name: string | null) => void;
  // (TODO 8.40) Desktop icon-rail mode. When true the sidebar
  // collapses to ~14 (3.5rem) width, hiding all text affordances.
  // Mobile show/hide is still controlled by `open`.
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  // (TODO 8.41) Pulled in from App.tsx so the AccountMenu pinned to
  // the sidebar bottom can dispatch logout / Preferences without
  // rewiring through context. Optional so the Sidebar still renders
  // standalone in tests.
  onLogout?: () => void;
  onOpenPreferences?: () => void;
}

// (TODO 8.40 review fix) `collapsed` is a desktop-only axis. Mobile
// users open the sidebar via the hamburger and expect the full
// worker list — they never had a way to expand from the icon rail
// (the collapse handle is `hidden md:inline-flex`). Without this
// guard, a previously-collapsed-on-desktop session that's reopened
// on mobile would render an empty aside (logo only). Treat
// collapsed as effectively false on widths below the md breakpoint.
function useEffectiveCollapsed(collapsed: boolean): boolean {
  const [isDesktop, setIsDesktop] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia('(min-width: 768px)').matches;
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return collapsed && isDesktop;
}

export default function Sidebar({
  open,
  mode,
  onModeChange,
  selectedWorker,
  onSelect,
  collapsed = false,
  onToggleCollapsed,
  onLogout,
  onOpenPreferences,
}: SidebarProps) {
  // Hooks must run unconditionally (React rules of hooks). The
  // open-gated early return moved below.
  useLocale();
  const effectiveCollapsed = useEffectiveCollapsed(collapsed);
  if (!open) return null;

  // Tailwind doesn't see template literals at scan time, so the
  // expanded vs collapsed widths are fixed strings selected at render.
  const widthClass = collapsed ? 'md:w-14' : 'md:w-72';

  return (
    <aside
      className={cn(
        // 8.41: aside is a flex column so the AccountMenu can pin to
        // the bottom while the worker list area scrolls in the middle.
        // 8.40: width transitions between md:w-72 and md:w-14.
        // 8.40 review fix: motion-reduce:transition-none honors
        // prefers-reduced-motion so vestibular-sensitive operators
        // do not see the 200ms slide on toggle. Snap-to instead.
        // 8.37: logo lives in AppHeader now; sidebar header just labels.
        'flex w-full shrink-0 flex-col border-b border-border bg-background transition-[width] duration-200 ease-out motion-reduce:transition-none md:border-b-0 md:border-r',
        widthClass,
      )}
      data-collapsed={collapsed ? 'true' : 'false'}
      aria-label={t('sidebar.workersSidebar')}
    >
      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col overflow-y-auto',
          collapsed ? 'md:px-2 md:py-3 p-4' : 'p-4',
        )}
      >
        {/* (TODO 8.37) Logo moved to AppHeader so every tab shows the
            C4 brand in the same spot (claude.ai / Linear / VS Code
            convention). The sidebar header now just labels the
            section + carries the collapse / view-mode controls. */}
        <div
          className={cn(
            'mb-4 flex items-center gap-2',
            collapsed ? 'md:flex-col md:gap-1' : '',
          )}
        >
          {!effectiveCollapsed ? (
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              {t('sidebar.workers')}
            </span>
          ) : null}
          {onToggleCollapsed ? (
            <Tooltip
              label={`${collapsed ? t('sidebar.expand') : t('sidebar.collapse')} (Ctrl+B)`}
              placement="bottom"
            >
              <IconButton
                className={cn('hidden md:inline-flex', collapsed ? 'md:mt-1' : 'ml-auto')}
                aria-label={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
                aria-pressed={collapsed}
                aria-keyshortcuts="Control+B"
                onClick={onToggleCollapsed}
                icon={
                  collapsed ? (
                    <PanelLeftOpen className="h-4 w-4" />
                  ) : (
                    <PanelLeftClose className="h-4 w-4" />
                  )
                }
              />
            </Tooltip>
          ) : null}
          {!effectiveCollapsed ? (
            <div
              role="tablist"
              aria-label={t('sidebar.workerViewMode')}
              className="ml-auto flex overflow-hidden rounded-md border border-border text-xs"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'list'}
                onClick={() => onModeChange('list')}
                className={cn(
                  'inline-flex items-center gap-1.5 px-2 py-1 transition-colors',
                  mode === 'list'
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                <List className="h-3.5 w-3.5" aria-hidden="true" />
                {t('sidebar.list')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'tree'}
                onClick={() => onModeChange('tree')}
                className={cn(
                  'inline-flex items-center gap-1.5 px-2 py-1 transition-colors',
                  mode === 'tree'
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                <Network className="h-3.5 w-3.5" aria-hidden="true" />
                {t('sidebar.tree')}
              </button>
            </div>
          ) : (
            <div
              role="tablist"
              aria-label={t('sidebar.workerViewMode')}
              className="hidden flex-col gap-1 md:flex"
            >
              <Tooltip label={t('sidebar.listView')} placement="right">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'list'}
                  aria-label={t('sidebar.listView')}
                  onClick={() => onModeChange('list')}
                  className={cn(
                    'inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent transition-colors',
                    mode === 'list'
                      ? 'border-border bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  <List className="h-4 w-4" aria-hidden="true" />
                </button>
              </Tooltip>
              <Tooltip label={t('sidebar.treeView')} placement="right">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'tree'}
                  aria-label={t('sidebar.treeView')}
                  onClick={() => onModeChange('tree')}
                  className={cn(
                    'inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent transition-colors',
                    mode === 'tree'
                      ? 'border-border bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  <Network className="h-4 w-4" aria-hidden="true" />
                </button>
              </Tooltip>
            </div>
          )}
        </div>
        {/* (TODO 8.40) In collapsed mode (desktop only) the worker list
            / hierarchy tree are intentionally hidden — the icon rail
            focuses on navigation (logo / view-mode toggle / collapse
            handle). On mobile widths the full sidebar always renders
            regardless of the persisted `collapsed` flag, since the
            mobile flow uses the hamburger overlay rather than the
            icon rail. */}
        {!effectiveCollapsed ? (
          mode === 'tree' ? (
            <HierarchyTree selectedWorker={selectedWorker} onSelect={onSelect} />
          ) : (
            <WorkerList selectedWorker={selectedWorker} onSelect={onSelect} />
          )
        ) : null}
      </div>
      {/* (TODO 8.41) Account row pinned at the sidebar bottom — claude.ai /
          VS Code / Linear convention. The dropdown opens upward so the
          menu stays inside the viewport. Only renders when the host has
          wired onLogout (i.e. App.tsx). */}
      {onLogout ? (
        <div className="border-t border-border bg-card/50 p-2">
          <AccountMenu
            onLogout={onLogout}
            onOpenPreferences={onOpenPreferences}
            collapsed={collapsed}
          />
        </div>
      ) : null}
    </aside>
  );
}
