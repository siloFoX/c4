import { useEffect, useState } from 'react';
import { List, Network, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from '../../lib/cn';
import { IconButton, Tooltip } from '../ui';
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
}: SidebarProps) {
  // Hooks must run unconditionally (React rules of hooks). The
  // open-gated early return moved below.
  const effectiveCollapsed = useEffectiveCollapsed(collapsed);
  if (!open) return null;

  // Tailwind doesn't see template literals at scan time, so the
  // expanded vs collapsed widths are fixed strings selected at render.
  const widthClass = collapsed ? 'md:w-14' : 'md:w-72';

  return (
    <aside
      className={cn(
        'w-full shrink-0 overflow-y-auto border-b border-border bg-background transition-[width] duration-200 ease-out md:border-b-0 md:border-r',
        widthClass,
        collapsed ? 'md:px-2 md:py-3 p-4' : 'p-4',
      )}
      data-collapsed={collapsed ? 'true' : 'false'}
      aria-label="Workers sidebar"
    >
      <div
        className={cn(
          'mb-4 flex items-center gap-2',
          collapsed ? 'md:flex-col md:gap-1' : '',
        )}
      >
        <img
          src="/logo.svg"
          alt="C4"
          className={cn('h-8 shrink-0', collapsed ? 'md:mx-auto' : '')}
        />
        {!effectiveCollapsed ? (
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            Workers
          </span>
        ) : null}
        {onToggleCollapsed ? (
          <Tooltip
            label={collapsed ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)'}
            placement="bottom"
          >
            <IconButton
              className={cn('hidden md:inline-flex', collapsed ? 'md:mt-1' : 'ml-auto')}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
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
            aria-label="Worker view mode"
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
              List
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
              Tree
            </button>
          </div>
        ) : (
          <div
            role="tablist"
            aria-label="Worker view mode"
            className="hidden flex-col gap-1 md:flex"
          >
            <Tooltip label="List view" placement="right">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'list'}
                aria-label="List view"
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
            <Tooltip label="Tree view" placement="right">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'tree'}
                aria-label="Tree view"
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
    </aside>
  );
}
