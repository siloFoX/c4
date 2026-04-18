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
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Label, Panel } from './ui';
import type { DetailMode } from './layout/DetailTabs';
import type { SidebarMode } from './layout/Sidebar';
import { cn } from '../lib/cn';
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
  label: string;
  Icon: IconComp;
  description?: string;
}

const THEME_OPTIONS: Option<ThemeMode>[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor, description: 'Follow OS setting' },
];

const SIDEBAR_OPTIONS: Option<SidebarMode>[] = [
  { value: 'list', label: 'List', Icon: List },
  { value: 'tree', label: 'Tree', Icon: Network },
];

const DETAIL_OPTIONS: Option<DetailMode>[] = [
  { value: 'terminal', label: 'Terminal', Icon: TerminalSquare },
  { value: 'chat', label: 'Chat', Icon: MessageSquare },
  { value: 'control', label: 'Control', Icon: SlidersHorizontal },
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
        {options.map(({ value: v, label: optLabel, Icon, description }) => {
          const active = v === value;
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
                  ? 'border-primary bg-primary/10 text-primary'
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
  const isDefault =
    theme === DEFAULT_THEME &&
    sidebarMode === DEFAULT_SIDEBAR_MODE &&
    detailMode === DEFAULT_DETAIL_MODE;

  const handleReset = () => {
    resetPreferences();
    onReset();
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-3 md:p-6">
      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
          <CardDescription>
            Customize the dashboard layout and appearance. Preferences are
            stored in this browser.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Panel
            icon={<Sun className="h-4 w-4" aria-hidden="true" />}
            title="Appearance"
          >
            <ChoiceGroup
              id="pref-theme"
              label="Theme"
              value={theme}
              options={THEME_OPTIONS}
              onChange={onThemeChange}
            />
          </Panel>

          <Panel
            icon={<Layout className="h-4 w-4" aria-hidden="true" />}
            title="Layout"
          >
            <div className="flex flex-col gap-5">
              <ChoiceGroup
                id="pref-sidebar-mode"
                label="Sidebar mode"
                value={sidebarMode}
                options={SIDEBAR_OPTIONS}
                onChange={onSidebarModeChange}
              />
              <ChoiceGroup
                id="pref-detail-mode"
                label="Detail view"
                value={detailMode}
                options={DETAIL_OPTIONS}
                onChange={onDetailModeChange}
              />
            </div>
          </Panel>

          <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
            <span className="text-xs text-muted-foreground">
              {isDefault ? 'Using defaults' : 'Custom preferences active'}
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
              Reset to defaults
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
