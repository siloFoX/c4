import type { ComponentType, SVGProps } from 'react';
import {
  Layout,
  List,
  Monitor,
  MessageSquare,
  Moon,
  Network,
  RotateCcw,
  SlidersHorizontal,
  Sun,
  TerminalSquare,
} from 'lucide-react';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Label, Panel, Separator } from './ui';
import type { DetailMode } from './layout/DetailTabs';
import type { SidebarMode } from './layout/Sidebar';
import { cn } from '../lib/cn';
import { t, useLocale } from '../lib/i18n';
import {
  DEFAULT_DETAIL_MODE,
  DEFAULT_SIDEBAR_MODE,
  DEFAULT_THEME,
  resetPreferences,
  type ThemeMode,
} from '../lib/preferences';

type IconComp = ComponentType<SVGProps<SVGSVGElement>>;

interface Option<T extends string> {
  value: T;
  // (v1.10.369) Switched from `label: string` to `labelKey:
  // string` + `descriptionKey?: string` so locale flips
  // re-translate without remounting. Lookup happens via t() at
  // render time inside ChoiceGroup.
  labelKey: string;
  Icon: IconComp;
  descriptionKey?: string;
}

const THEME_OPTIONS: Option<ThemeMode>[] = [
  { value: 'light', labelKey: 'settings.theme.light', Icon: Sun },
  { value: 'dark', labelKey: 'settings.theme.dark', Icon: Moon },
  { value: 'system', labelKey: 'settings.theme.system', Icon: Monitor, descriptionKey: 'settings.theme.systemHint' },
];

const SIDEBAR_OPTIONS: Option<SidebarMode>[] = [
  { value: 'list', labelKey: 'settings.sidebar.list', Icon: List },
  { value: 'tree', labelKey: 'settings.sidebar.tree', Icon: Network },
];

const DETAIL_OPTIONS: Option<DetailMode>[] = [
  { value: 'terminal', labelKey: 'settings.detail.terminal', Icon: TerminalSquare },
  { value: 'chat', labelKey: 'settings.detail.chat', Icon: MessageSquare },
  { value: 'control', labelKey: 'settings.detail.control', Icon: SlidersHorizontal },
];

interface ChoiceGroupProps<T extends string> {
  id: string;
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
}

function ChoiceGroup<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
}: ChoiceGroupProps<T>) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div
        id={id}
        role="radiogroup"
        aria-label={label}
        className="flex flex-wrap gap-2"
      >
        {options.map(({ value: v, labelKey, Icon, descriptionKey }) => {
          const active = v === value;
          const optLabel = t(labelKey);
          const description = descriptionKey ? t(descriptionKey) : undefined;
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(v)}
              title={description}
              className={cn(
                'inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors',
                active
                  ? 'border-primary bg-primary/30 text-foreground'
                  : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {optLabel}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export interface SettingsViewProps {
  theme: ThemeMode;
  onThemeChange: (v: ThemeMode) => void;
  sidebarMode: SidebarMode;
  onSidebarModeChange: (v: SidebarMode) => void;
  detailMode: DetailMode;
  onDetailModeChange: (v: DetailMode) => void;
  onReset: () => void;
}

export default function SettingsView({
  theme,
  onThemeChange,
  sidebarMode,
  onSidebarModeChange,
  detailMode,
  onDetailModeChange,
  onReset,
}: SettingsViewProps) {
  useLocale();
  const isDefault =
    theme === DEFAULT_THEME &&
    sidebarMode === DEFAULT_SIDEBAR_MODE &&
    detailMode === DEFAULT_DETAIL_MODE;

  const handleReset = () => {
    resetPreferences();
    onReset();
  };

  return (
    <div
      data-section="settings-view"
      className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-3 md:p-6"
    >
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.title')}</CardTitle>
          <CardDescription>
            {t('settings.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Panel
            icon={<Sun className="h-4 w-4" aria-hidden="true" />}
            title={t('settings.appearance')}
          >
            <ChoiceGroup
              id="pref-theme"
              label={t('settings.theme')}
              value={theme}
              options={THEME_OPTIONS}
              onChange={onThemeChange}
            />
          </Panel>

          <Panel
            icon={<Layout className="h-4 w-4" aria-hidden="true" />}
            title={t('settings.layout')}
          >
            <div className="flex flex-col gap-5">
              <ChoiceGroup
                id="pref-sidebar-mode"
                label={t('settings.sidebarMode')}
                value={sidebarMode}
                options={SIDEBAR_OPTIONS}
                onChange={onSidebarModeChange}
              />
              <ChoiceGroup
                id="pref-detail-mode"
                label={t('settings.detailView')}
                value={detailMode}
                options={DETAIL_OPTIONS}
                onChange={onDetailModeChange}
              />
            </div>
          </Panel>

          <Separator />
          <div className="flex items-center justify-end gap-3 pt-2">
            <span className="text-xs text-muted-foreground">
              {isDefault ? t('settings.usingDefaults') : t('settings.customActive')}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={isDefault}
              className="gap-2"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              {t('settings.reset')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
