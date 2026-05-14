import { useRef, type ComponentType, type KeyboardEvent as ReactKeyboardEvent, type SVGProps } from 'react';
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
import { t, useLocale } from '../../lib/i18n';

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
  // (v1.10.360) i18n key — resolved at render time so locale flips
  // re-translate the label without remounting. We also still ship
  // an explicit fallback string for the rare case the bundle
  // doesn't have a tab.* key (older daemon/web mismatch).
  labelKey: string;
  fallback: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const TABS: TabDef[] = [
  { value: 'workers', labelKey: 'tab.workers', fallback: 'Workers', Icon: Users },
  { value: 'history', labelKey: 'tab.history', fallback: 'History', Icon: History },
  { value: 'sessions', labelKey: 'tab.sessions', fallback: 'Sessions', Icon: FolderTree },
  { value: 'meetings', labelKey: 'tab.meetings', fallback: 'Meetings', Icon: UsersRound },
  { value: 'specialists', labelKey: 'tab.specialists', fallback: 'Specialists', Icon: GraduationCap },
  { value: 'wiki', labelKey: 'tab.wiki', fallback: 'Wiki', Icon: BookOpen },
  { value: 'autonomous', labelKey: 'tab.autonomous', fallback: 'Autonomous', Icon: Bot },
  { value: 'chat', labelKey: 'tab.chat', fallback: 'Chat', Icon: MessageSquare },
  { value: 'workflows', labelKey: 'tab.workflows', fallback: 'Workflows', Icon: Workflow },
  { value: 'features', labelKey: 'tab.features', fallback: 'Features', Icon: LayoutGrid },
  { value: 'settings', labelKey: 'tab.settings', fallback: 'Settings', Icon: Settings },
];

interface TopTabsProps {
  value: TopView;
  onChange: (v: TopView) => void;
  // (v1.10.327) Per-tab badge counts. Keys match TopView ids;
  // values render as a small badge on the tab. Used for the
  // stuck-meetings signal so operators see urgency without
  // navigating into Meetings.
  badges?: Partial<Record<TopView, { count: number; tone: 'amber' | 'destructive' | 'muted' }>> | undefined;
}

export default function TopTabs({ value, onChange, badges }: TopTabsProps) {
  // useLocale registers a re-render when the operator flips
  // between en/ko in Settings. The actual lookup uses t().
  useLocale();
  // (v1.11.134) Refs keep per-tab focus reachable from the arrow-key
  // handler. The array is rebuilt on every render but React keeps
  // the same length-N slot identity for each tab in TABS.
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const handleKeyDown = (idx: number) => (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const len = TABS.length;
    const dir = e.key === 'ArrowLeft' ? -1 : 1;
    const nextIdx = (idx + dir + len) % len;
    const next = TABS[nextIdx];
    if (!next) return;
    tabRefs.current[nextIdx]?.focus();
    onChange(next.value);
  };

  return (
    <div
      role="tablist"
      aria-label={t('topTabs.label')}
      className="flex shrink-0 overflow-x-auto rounded-md border border-border text-xs [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"
    >
      {TABS.map(({ value: v, labelKey, fallback, Icon }, idx) => {
        const active = v === value;
        const badge = badges && badges[v];
        const label = t(labelKey) || fallback;
        return (
          <button
            key={v}
            type="button"
            role="tab"
            ref={(el) => {
              tabRefs.current[idx] = el;
            }}
            aria-selected={active}
            aria-label={label}
            title={label}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(v)}
            onKeyDown={handleKeyDown(idx)}
            className={cn(
              'relative inline-flex items-center gap-1.5 px-2 py-1.5 transition-colors sm:px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              active
                ? 'bg-primary/30 text-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">{label}</span>
            {badge && badge.count > 0 ? (
              <span className={cn(
                'inline-flex min-w-[1rem] items-center justify-center rounded-full border px-1 text-[9px] leading-tight',
                badge.tone === 'amber' && 'border-warning/40 bg-warning/10 text-warning',
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
