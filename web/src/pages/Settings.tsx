import { useState } from 'react';
import {
  Bell,
  Cog,
  ExternalLink,
  Feather,
  Globe,
  LayoutDashboard,
  Palette,
  ToggleRight,
} from 'lucide-react';
import PageFrame from './PageFrame';
import {
  Alert,
  PageHeader,
  Panel,
  Radio,
  Tabs,
  TabsPanel,
  type TabsItem,
} from '../components/ui';
import { LOCALES, getLocale, setLocale, t, useLocale, type Locale } from '../lib/i18n';
import { useTheme, type Theme } from '../hooks/use-theme';
import {
  DENSITY_SCALE,
  DENSITY_VALUES,
  useDensity,
} from '../hooks/use-density';
import ThemeToggle from '../components/ThemeToggle';
import DensityToggle from '../components/DensityToggle';
import HelpTip from '../components/HelpTip';
import FeatureFlags from './FeatureFlags';

// (patch 11.199) Consolidated Settings landing page. Six tabs surface the
// most frequently touched preference areas in one place: General (Config),
// Theme, Scribe, Notifications, Locale, Feature Flags. Existing dedicated
// pages stay untouched -- this page only REFERENCES or EMBEDS the existing
// surfaces so operators have a single entry point without disrupting the
// already-shipped pages. Strings inside panel bodies are intentionally
// inline (English) following the Notifications.tsx precedent; only the
// sidebar label / description round-trip through i18n.

type TabKey =
  | 'general'
  | 'theme'
  | 'density'
  | 'scribe'
  | 'notifications'
  | 'locale'
  | 'feature-flags';

const THEME_OPTIONS: ReadonlyArray<{ value: Theme; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

function GeneralPanel() {
  return (
    <Panel
      icon={<Cog className="h-4 w-4" aria-hidden="true" />}
      title="General"
      description="Live daemon config sans secrets. The full editor + reload trigger lives on the Config page."
    >
      <p className="text-sm text-muted-foreground">
        The Config page surfaces <code className="font-mono">GET /api/config</code>{' '}
        with a search filter and a confirm-guarded reload trigger
        (<code className="font-mono">POST /api/config/reload</code>). Use that page
        for full inspection; this tab is a quick reference for the consolidated
        Settings hub.
      </p>
      <a
        href="#feature=config"
        className="mt-3 inline-flex items-center gap-1 text-sm text-primary underline-offset-2 hover:underline"
        data-testid="settings-general-config-link"
      >
        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        Open Config page
      </a>
    </Panel>
  );
}

function ThemePanel() {
  const { theme, resolvedTheme } = useTheme();
  return (
    <Panel
      icon={<Palette className="h-4 w-4" aria-hidden="true" />}
      title={
        <span className="inline-flex items-center gap-1.5">
          Theme
          <HelpTip
            ariaLabel="Help for Theme"
            data-testid="settings-help-theme"
            content="**Theme** controls the light / dark color scheme. `system` follows the OS `prefers-color-scheme` media query; `light` / `dark` pin a fixed value. Selection persists to `localStorage` key `c4:theme`."
          />
        </span>
      }
      description={`Selection persists to localStorage 'c4:theme'. Resolved: ${resolvedTheme}.`}
    >
      <div className="flex flex-col gap-3">
        <div className="text-sm text-muted-foreground">
          Current selection:{' '}
          <span className="font-medium text-foreground" data-testid="settings-theme-current">
            {theme}
          </span>
        </div>
        <div className="flex flex-row items-center gap-3">
          <span className="text-sm text-foreground">Quick toggle</span>
          <ThemeToggle variant="group" size="sm" />
        </div>
        <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
          {THEME_OPTIONS.map((opt) => (
            <li key={opt.value}>
              <span className="font-mono">{opt.value}</span> -- {opt.label}
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}

function DensityPanel() {
  const { density } = useDensity();
  const scale = DENSITY_SCALE[density];
  return (
    <Panel
      icon={<LayoutDashboard className="h-4 w-4" aria-hidden="true" />}
      title={
        <span className="inline-flex items-center gap-1.5">
          Density
          <HelpTip
            ariaLabel="Help for Density"
            data-testid="settings-help-density"
            content="**Density** adjusts the global spacing scale via CSS variables `--density-row-h`, `--density-card-p`, and `--density-gap-x`. `compact` is tightest (28 / 8 / 6 px); `comfortable` matches the shadcn baseline; `cozy` is most relaxed. Persists to `localStorage` key `c4:density`."
          />
        </span>
      }
      description="Adjusts global spacing (row height, card padding, gap). Persists to localStorage 'c4:density'."
    >
      <div className="flex flex-col gap-3">
        <div className="text-sm text-muted-foreground">
          Current selection:{' '}
          <span
            className="font-medium text-foreground"
            data-testid="settings-density-current"
          >
            {density}
          </span>
        </div>
        <div className="flex flex-row items-center gap-3">
          <span className="text-sm text-foreground">Quick toggle</span>
          <DensityToggle variant="group" size="sm" />
        </div>
        <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
          {DENSITY_VALUES.map((d) => (
            <li key={d}>
              <span className="font-mono">{d}</span> -- row{' '}
              <span className="font-mono">
                {DENSITY_SCALE[d].rowHeightPx}px
              </span>
              , pad{' '}
              <span className="font-mono">
                {DENSITY_SCALE[d].cardPaddingPx}px
              </span>
              , gap{' '}
              <span className="font-mono">{DENSITY_SCALE[d].gapXPx}px</span>
            </li>
          ))}
        </ul>
        <p
          className="text-xs text-muted-foreground"
          data-testid="settings-density-active-scale"
        >
          Active scale -- row{' '}
          <span className="font-mono">{scale.rowHeightPx}px</span>, pad{' '}
          <span className="font-mono">{scale.cardPaddingPx}px</span>, gap{' '}
          <span className="font-mono">{scale.gapXPx}px</span>.
        </p>
      </div>
    </Panel>
  );
}

function ScribePanel() {
  return (
    <Panel
      icon={<Feather className="h-4 w-4" aria-hidden="true" />}
      title="Scribe"
      description="Session context recorder. Start / stop / scan controls live on the Scribe page."
    >
      <p className="text-sm text-muted-foreground">
        Scribe runs as part of the daemon and snapshots the active session
        transcript on a fixed cadence. Use the Scribe page to start / stop the
        recorder, force a scan, or inspect the last captured context payload.
      </p>
    </Panel>
  );
}

function NotificationsPanel() {
  return (
    <Panel
      icon={<Bell className="h-4 w-4" aria-hidden="true" />}
      title="Notifications"
      description="Lifecycle feed for dispatch / complete / halt / escalation events."
    >
      <p className="text-sm text-muted-foreground">
        Slack and Discord lifecycle webhooks are opted-in via{' '}
        <code className="font-mono">config.notifications</code>. The
        Notifications page renders the unified feed and per-event filters; this
        tab is a read-only summary for the consolidated landing.
      </p>
    </Panel>
  );
}

function LocalePanel() {
  const [locale, setLocaleLocal] = useState<Locale>(() => getLocale());

  const handleChange = (next: Locale) => {
    setLocaleLocal(next);
    setLocale(next);
  };

  return (
    <Panel
      icon={<Globe className="h-4 w-4" aria-hidden="true" />}
      title={
        <span className="inline-flex items-center gap-1.5">
          Locale
          <HelpTip
            ariaLabel="Help for Locale"
            data-testid="settings-help-locale"
            content="**Locale** picks the dashboard display language. Strings flow through the `t()` helper in `lib/i18n.ts`; missing keys fall back to the source string. Persists via `localStorage` key `c4.locale` and dispatches `c4:locale-changed` so mounted subscribers re-render."
          />
        </span>
      }
      description="Display language for the dashboard. Persists in this browser."
    >
      <div role="radiogroup" aria-label="Locale" className="flex flex-col gap-2">
        {LOCALES.map((loc) => (
          <Radio
            key={loc}
            name="settings-locale"
            value={loc}
            checked={locale === loc}
            onChange={() => handleChange(loc)}
            label={loc === 'en' ? 'English' : 'Korean'}
            data-testid={`settings-locale-radio-${loc}`}
          />
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Selection writes to <code className="font-mono">localStorage</code> via
        the shared <code className="font-mono">setLocale()</code> helper
        (key <code className="font-mono">c4.locale</code>) and dispatches the{' '}
        <code className="font-mono">c4:locale-changed</code>{' '}
        <code className="font-mono">CustomEvent</code> so mounted{' '}
        <code className="font-mono">useLocale()</code> subscribers re-render
        without a page reload.
      </p>
    </Panel>
  );
}

function FeatureFlagsPanel() {
  return (
    <div data-testid="settings-feature-flags-embed">
      <FeatureFlags />
    </div>
  );
}

export default function Settings() {
  useLocale();
  const [active, setActive] = useState<TabKey>('general');

  const items: TabsItem[] = [
    { value: 'general', label: 'General', icon: <Cog className="h-3.5 w-3.5" aria-hidden="true" /> },
    { value: 'theme', label: 'Theme', icon: <Palette className="h-3.5 w-3.5" aria-hidden="true" /> },
    { value: 'density', label: 'Density', icon: <LayoutDashboard className="h-3.5 w-3.5" aria-hidden="true" /> },
    { value: 'scribe', label: 'Scribe', icon: <Feather className="h-3.5 w-3.5" aria-hidden="true" /> },
    { value: 'notifications', label: 'Notifications', icon: <Bell className="h-3.5 w-3.5" aria-hidden="true" /> },
    { value: 'locale', label: 'Locale', icon: <Globe className="h-3.5 w-3.5" aria-hidden="true" /> },
    { value: 'feature-flags', label: 'Feature Flags', icon: <ToggleRight className="h-3.5 w-3.5" aria-hidden="true" /> },
  ];

  return (
    <PageFrame
      title={t('feature.settingsPage.label')}
      description={t('feature.settingsPage.description')}
    >
      {/* (v1.11.267, TODO 11.249) PageHeader bar with breadcrumb
          trail + back button. Sub-page surface; title stays in
          PageFrame. */}
      <PageHeader
        breadcrumbs={[
          { id: 'home', label: 'Dashboard', href: '#feature=workers' },
        ]}
        backHref="#feature=workers"
        backLabel="Back to Workers"
        sticky={false}
        className="-mx-4 -mt-2 md:-mx-6 md:-mt-2"
        data-testid="settings-page-header"
      />
      <Alert variant="info">
        Consolidated landing -- the dedicated Config / Scribe / Notifications /
        Feature Flags pages remain authoritative; this tab strip is a one-stop
        entry point and does not duplicate their state.
      </Alert>
      <Tabs
        value={active}
        onChange={(v) => setActive(v as TabKey)}
        items={items}
        ariaLabel="Settings sections"
      >
        <TabsPanel value="general" className="mt-3">
          <GeneralPanel />
        </TabsPanel>
        <TabsPanel value="theme" className="mt-3">
          <ThemePanel />
        </TabsPanel>
        <TabsPanel value="density" className="mt-3">
          <DensityPanel />
        </TabsPanel>
        <TabsPanel value="scribe" className="mt-3">
          <ScribePanel />
        </TabsPanel>
        <TabsPanel value="notifications" className="mt-3">
          <NotificationsPanel />
        </TabsPanel>
        <TabsPanel value="locale" className="mt-3">
          <LocalePanel />
        </TabsPanel>
        <TabsPanel value="feature-flags" className="mt-3">
          <FeatureFlagsPanel />
        </TabsPanel>
      </Tabs>
    </PageFrame>
  );
}
