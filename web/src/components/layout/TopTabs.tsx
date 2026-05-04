import type { ComponentType, SVGProps } from 'react';
import {
  BookOpen,
  Bot,
  FolderTree,
  GraduationCap,
  History,
  LayoutGrid,
  MessageSquare,
  Settings,
  UsersRound,
  Users,
  Workflow,
} from 'lucide-react';
import { cn } from '../../lib/cn';

export type TopView =
  | 'workers'
  | 'history'
  | 'chat'
  | 'workflows'
  | 'sessions'
  | 'meetings'
  | 'specialists'
  | 'wiki'
  | 'autonomous'
  | 'features'
  | 'settings';

interface TabDef {
  value: TopView;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const TABS: TabDef[] = [
  { value: 'workers', label: 'Workers', Icon: Users },
  { value: 'history', label: 'History', Icon: History },
  { value: 'sessions', label: 'Sessions', Icon: FolderTree },
  { value: 'meetings', label: 'Meetings', Icon: UsersRound },
  { value: 'specialists', label: 'Specialists', Icon: GraduationCap },
  { value: 'wiki', label: 'Wiki', Icon: BookOpen },
  { value: 'autonomous', label: 'Autonomous', Icon: Bot },
  { value: 'chat', label: 'Chat', Icon: MessageSquare },
  { value: 'workflows', label: 'Workflows', Icon: Workflow },
  { value: 'features', label: 'Features', Icon: LayoutGrid },
  { value: 'settings', label: 'Settings', Icon: Settings },
];

interface TopTabsProps {
  value: TopView;
  onChange: (v: TopView) => void;
  // (v1.10.327) Per-tab badge counts. Keys match TopView ids;
  // values render as a small badge on the tab. Used for the
  // stuck-meetings signal so operators see urgency without
  // navigating into Meetings.
  badges?: Partial<Record<TopView, { count: number; tone: 'amber' | 'destructive' | 'muted' }>>;
}

export default function TopTabs({ value, onChange, badges }: TopTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Top view"
      className="flex overflow-hidden rounded-md border border-border text-xs"
    >
      {TABS.map(({ value: v, label, Icon }) => {
        const active = v === value;
        const badge = badges && badges[v];
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
              'relative inline-flex items-center gap-1.5 px-2 py-1.5 transition-colors sm:px-3',
              active
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">{label}</span>
            {badge && badge.count > 0 ? (
              <span className={cn(
                'inline-flex min-w-[1rem] items-center justify-center rounded-full border px-1 text-[9px] leading-tight',
                badge.tone === 'amber' && 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
                badge.tone === 'destructive' && 'border-destructive/40 bg-destructive/10 text-destructive',
                badge.tone === 'muted' && 'border-border bg-muted/40 text-muted-foreground',
              )}>
                {badge.count > 99 ? '99+' : badge.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
