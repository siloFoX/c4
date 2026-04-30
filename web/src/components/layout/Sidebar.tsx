import { List, Network } from 'lucide-react';
import { cn } from '../../lib/cn';
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
  // (TODO 8.41) Pulled in from App.tsx so the AccountMenu pinned to
  // the sidebar bottom can dispatch logout / Preferences without
  // rewiring through context. Optional so the Sidebar still renders
  // standalone in tests.
  onLogout?: () => void;
  onOpenPreferences?: () => void;
}

export default function Sidebar({
  open,
  mode,
  onModeChange,
  selectedWorker,
  onSelect,
  onLogout,
  onOpenPreferences,
}: SidebarProps) {
  if (!open) return null;

  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-border bg-background md:w-72 md:border-b-0 md:border-r">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
        <div className="mb-4 flex items-center gap-2">
          <img src="/logo.svg" alt="C4" className="h-8 shrink-0" />
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            Workers
          </span>
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
        </div>
        {mode === 'tree' ? (
          <HierarchyTree selectedWorker={selectedWorker} onSelect={onSelect} />
        ) : (
          <WorkerList selectedWorker={selectedWorker} onSelect={onSelect} />
        )}
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
          />
        </div>
      ) : null}
    </aside>
  );
}
