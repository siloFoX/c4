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
import { Tabs, type TabsItem } from '../ui/tabs';
import { cn } from '../../lib/cn';
import { t, useLocale } from '../../lib/i18n';
import { prefetch } from '../../lib/route-prefetch';
import { getTopViewLoader } from '../../lib/route-loaders';

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

// (v1.11.153) Thin adapter around the shared <Tabs> primitive. The
// primitive owns role=tablist, aria-selected, roving tabindex, and
// ArrowLeft/Right + Home/End keyboard nav with wrap and disabled
// skip. TopTabs is left to map i18n labels, icons, and per-tab
// badge nodes into the Tabs item shape.
export default function TopTabs({ value, onChange, badges }: TopTabsProps) {
  // useLocale registers a re-render when the operator flips between
  // en/ko in Settings. The actual lookup uses t().
  useLocale();

  const items: TabsItem[] = TABS.map(({ value: v, labelKey, fallback, Icon }) => {
    const label = t(labelKey) || fallback;
    const badge = badges && badges[v];
    return {
      value: v,
      ariaLabel: label,
      title: label,
      icon: <Icon className="h-3.5 w-3.5" aria-hidden="true" />,
      label: (
        <>
          <span className="hidden sm:inline">{label}</span>
          {badge && badge.count > 0 ? (
            <span
              className={cn(
                'inline-flex min-w-[1rem] items-center justify-center rounded-full border px-1 text-[9px] leading-tight',
                badge.tone === 'amber' && 'border-warning/40 bg-warning/10 text-warning',
                badge.tone === 'destructive' && 'border-destructive/40 bg-destructive/10 text-destructive',
                badge.tone === 'muted' && 'border-border bg-muted/40 text-muted-foreground',
              )}
            >
              {badge.count > 99 ? '99+' : badge.count}
            </span>
          ) : null}
        </>
      ),
    };
  });

  // (v1.11.246, TODO 11.228) Warm the lazy chunk for whichever
  // tab the user hovers / focuses / taps so the click-time
  // navigation does not stall on the bundle fetch. The loader
  // identities are pulled from lib/route-loaders so repeated
  // hovers on the same tab hit the prefetch cache instead of
  // re-firing the import.
  const handlePrefetch = (next: string) => {
    const loader = getTopViewLoader(next as TopView);
    if (loader) prefetch(loader);
  };

  return (
    <Tabs
      value={value}
      onChange={(v) => onChange(v as TopView)}
      items={items}
      ariaLabel={t('topTabs.label')}
      onPrefetch={handlePrefetch}
    />
  );
}
