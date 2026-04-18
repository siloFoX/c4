import type { ComponentType, SVGProps } from 'react';
import { History, MessageSquare, Users, Workflow } from 'lucide-react';
import { cn } from '../../lib/cn';

export type TopView = 'workers' | 'history' | 'chat' | 'workflows';

interface TabDef {
  value: TopView;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const TABS: TabDef[] = [
  { value: 'workers', label: 'Workers', Icon: Users },
  { value: 'history', label: 'History', Icon: History },
  { value: 'chat', label: 'Chat', Icon: MessageSquare },
  { value: 'workflows', label: 'Workflows', Icon: Workflow },
];

interface TopTabsProps {
  value: TopView;
  onChange: (v: TopView) => void;
}

export default function TopTabs({ value, onChange }: TopTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Top view"
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
            aria-label={label}
            title={label}
            onClick={() => onChange(v)}
            className={cn(
              'inline-flex items-center gap-1.5 px-2 py-1.5 transition-colors sm:px-3',
              active
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
