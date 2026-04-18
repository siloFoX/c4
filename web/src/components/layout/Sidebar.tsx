import { List, Network } from 'lucide-react';
import { cn } from '../../lib/cn';
import HierarchyTree from '../HierarchyTree';
import WorkerList from '../WorkerList';

export type SidebarMode = 'list' | 'tree';

interface SidebarProps {
  open: boolean;
  mode: SidebarMode;
  onModeChange: (m: SidebarMode) => void;
  selectedWorker: string | null;
  onSelect: (name: string | null) => void;
}

export default function Sidebar({
  open,
  mode,
  onModeChange,
  selectedWorker,
  onSelect,
}: SidebarProps) {
  if (!open) return null;

  return (
    <aside className="w-full shrink-0 overflow-y-auto border-b border-border bg-background p-4 md:w-72 md:border-b-0 md:border-r">
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
    </aside>
  );
}
