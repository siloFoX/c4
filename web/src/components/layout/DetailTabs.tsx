import type { ComponentType, SVGProps } from 'react';
import { MessageSquare, SlidersHorizontal, TerminalSquare } from 'lucide-react';
import { cn } from '../../lib/cn';

export type DetailMode = 'terminal' | 'chat' | 'control';

interface TabDef {
  value: DetailMode;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const TABS: TabDef[] = [
  { value: 'terminal', label: 'Terminal', Icon: TerminalSquare },
  { value: 'chat', label: 'Chat', Icon: MessageSquare },
  { value: 'control', label: 'Control', Icon: SlidersHorizontal },
];

interface DetailTabsProps {
  value: DetailMode;
  onChange: (m: DetailMode) => void;
}

export default function DetailTabs({ value, onChange }: DetailTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Detail view mode"
      className="flex overflow-hidden rounded-md border border-border text-xs"
    >
      {TABS.map(({ value: v, label, Icon }) => {
        const active = v === value;
        return (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(v)}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 transition-colors',
              active
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
