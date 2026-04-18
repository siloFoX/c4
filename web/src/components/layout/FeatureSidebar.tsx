import { cn } from '../../lib/cn';
import {
  CATEGORY_ICON,
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  type FeatureDef,
  featuresByCategory,
} from '../../pages/registry';

interface FeatureSidebarProps {
  open: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function FeatureSidebar({
  open,
  selectedId,
  onSelect,
}: FeatureSidebarProps) {
  if (!open) return null;

  const grouped = featuresByCategory();

  return (
    <aside className="w-full shrink-0 overflow-y-auto border-b border-border bg-background p-4 md:w-72 md:border-b-0 md:border-r">
      <div className="mb-3 flex items-center gap-2">
        <img src="/logo.svg" alt="C4" className="h-8 shrink-0" />
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          Features
        </span>
      </div>
      <nav aria-label="Feature pages" className="flex flex-col gap-4">
        {CATEGORY_ORDER.map((cat) => {
          const items = grouped[cat];
          if (!items || items.length === 0) return null;
          const CatIcon = CATEGORY_ICON[cat];
          return (
            <div key={cat}>
              <div className="mb-1 flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                <CatIcon className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{CATEGORY_LABEL[cat]}</span>
              </div>
              <ul className="flex flex-col gap-1">
                {items.map((f: FeatureDef) => {
                  const active = f.id === selectedId;
                  const Icon = f.Icon;
                  return (
                    <li key={f.id}>
                      <button
                        type="button"
                        aria-current={active ? 'page' : undefined}
                        onClick={() => onSelect(f.id)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                          active
                            ? 'bg-primary/10 text-primary'
                            : 'text-foreground hover:bg-accent hover:text-accent-foreground',
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="truncate">{f.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
