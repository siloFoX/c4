import type { ComponentType, SVGProps } from 'react';
import { MessageSquare, SlidersHorizontal, TerminalSquare } from 'lucide-react';
import { cn } from '../../lib/cn';
import { t, useLocale } from '../../lib/i18n';

export type DetailMode = 'terminal' | 'chat' | 'control';

interface TabDef {
  value: DetailMode;
  // (v1.10.372) Migrated to i18n keys + fallback (mirrors the
  // TopTabs pattern from v1.10.361).
  labelKey: string;
  fallback: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const TABS: TabDef[] = [
  { value: 'terminal', labelKey: 'settings.detail.terminal', fallback: 'Terminal', Icon: TerminalSquare },
  { value: 'chat', labelKey: 'settings.detail.chat', fallback: 'Chat', Icon: MessageSquare },
  { value: 'control', labelKey: 'settings.detail.control', fallback: 'Control', Icon: SlidersHorizontal },
];

interface DetailTabsProps {
  value: DetailMode;
  onChange: (m: DetailMode) => void;
}

export default function DetailTabs({ value, onChange }: DetailTabsProps) {
  useLocale();
  return (
    <div
      role="tablist"
      aria-label={t('detailTabs.label')}
      className="flex overflow-hidden rounded-md border border-border text-xs"
    >
      {TABS.map(({ value: v, labelKey, fallback, Icon }) => {
        const active = v === value;
        const label = t(labelKey) || fallback;
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
