import { HelpCircle, Keyboard, Menu, X } from 'lucide-react';
import AccountMenu from '../AccountMenu';
import DensityToggle from '../DensityToggle';
import LocaleSwitcher from '../LocaleSwitcher';
import ThemeToggle from '../ThemeToggle';
import { IconButton, Navbar, Tooltip } from '../ui';
import TopTabs, { type TopView } from './TopTabs';
import { useNavBadgeCounts } from '../../lib/use-nav-badge-counts';
import { dispatchEvent } from '../../lib/dispatch-event';
import {
  HELP_EVENT_OPEN_DRAWER,
  HELP_EVENT_OPEN_SHORTCUTS,
} from '../HelpUIRoot';
import { t, useLocale } from '../../lib/i18n';

interface AppHeaderProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  topView: TopView;
  onTopViewChange: (v: TopView) => void;
  authed: boolean;
  onLogout: () => void;
  // (TODO 8.41) Pulled up from App.tsx so the AccountMenu's
  // Preferences row can flip to the Settings tab. Optional so the
  // header still renders for tests / pages that wire only the locale
  // toggle.
  onOpenPreferences?: () => void;
}

// (v1.10.744) dispatch helper moved to lib/dispatch-event.

export default function AppHeader({
  sidebarOpen,
  onToggleSidebar,
  topView,
  onTopViewChange,
  authed,
  onLogout,
  onOpenPreferences,
}: AppHeaderProps) {
  useLocale();
  // (v1.10.709) Three nav-badge polls (stuck-meetings /
  // specialist-underperformers / autonomous-escalations) moved
  // to lib/use-nav-badge-counts.
  const { stuckCount, underperformerCount, escalationCount } =
    useNavBadgeCounts({ authed });

  const brand = (
    <>
      <IconButton
        className="md:hidden"
        aria-label={sidebarOpen ? t('sidebar.closeWorkerList') : t('sidebar.openWorkerList')}
        onClick={onToggleSidebar}
        icon={
          sidebarOpen ? (
            <X className="h-5 w-5" />
          ) : (
            <Menu className="h-5 w-5" />
          )
        }
      />
      {/* (TODO 8.37) Logo + wordmark relocate from the Workers
          sidebar into the AppHeader so every tab shows the C4
          brand in the same spot - claude.ai / Linear / VS Code
          convention. The sidebar's "Workers" header drops the
          logo image and just labels the section.
          (review fix 2026-05-01) Logo is decorative when paired
          with the visible "C4 Dashboard" wordmark - use empty
          alt + aria-hidden so screen readers announce the
          wordmark once instead of "C4 image, C4 Dashboard". */}
      <img
        src="/logo.svg"
        alt=""
        className="h-7 w-7 shrink-0"
        aria-hidden="true"
      />
      {/* (v1.11.1102, TODO 11.1084) The wordmark hides below sm so
          the narrowest viewports (375) keep just the logo + the tab
          strip + actions without the title truncating or crowding the
          tablist. The logo alone carries the brand at that width; the
          wordmark returns at >= sm. `truncate` stays as a safety net
          for in-between widths. */}
      <h1 className="hidden truncate text-lg font-semibold text-foreground sm:block md:text-xl">
        {t('header.title')}
      </h1>
    </>
  );

  const center = (
    <TopTabs
      value={topView}
      onChange={onTopViewChange}
      badges={(() => {
        const out: Partial<Parameters<typeof TopTabs>[0]['badges']> = {};
        if (stuckCount > 0) out.meetings = { count: stuckCount, tone: 'amber' };
        if (underperformerCount > 0) out.specialists = { count: underperformerCount, tone: 'amber' };
        if (escalationCount > 0) out.autonomous = { count: escalationCount, tone: 'destructive' };
        return Object.keys(out).length > 0 ? out as never : undefined;
      })()}
    />
  );

  const actions = (
    <>
      <Tooltip label={t('common.helpCenter')} placement="bottom">
        <IconButton
          aria-label={t('common.helpCenter')}
          onClick={() => dispatchEvent(HELP_EVENT_OPEN_DRAWER)}
          icon={<HelpCircle className="h-4 w-4" />}
        />
      </Tooltip>
      <Tooltip label={t('common.shortcuts')} placement="bottom">
        <IconButton
          aria-label={t('common.shortcuts')}
          onClick={() => dispatchEvent(HELP_EVENT_OPEN_SHORTCUTS)}
          icon={<Keyboard className="h-4 w-4" />}
        />
      </Tooltip>
      <ThemeToggle size="sm" />
      {/* (v1.11.263, TODO 11.245) Global density cycle. The compact
          variant fits the dense header strip; clicking cycles
          comfortable -> cozy -> compact -> comfortable. */}
      <DensityToggle variant="compact" size="sm" />
      <LocaleSwitcher />
      {/* (TODO 8.41) Replaced the standalone LogOut IconButton with a
          compact AccountMenu - the avatar+chevron trigger opens the
          same dropdown the sidebar uses (Profile / Preferences /
          Keyboard shortcuts / Help / Sign out). The full-width
          sidebar version stays as the primary surface; the header
          copy is the fallback for tabs (Sessions, Chat, History,
          Workflows, Settings, Features) where the sidebar doesn't
          render.
          (review fix 2026-05-01) Originally `hidden md:block`
          scoped this to desktop only, but on mobile + non-Workers
          tabs the sidebar isn't rendered either, leaving mobile
          users with no path to sign out. Show on every viewport;
          collapsed mode is icon-only so it stays compact even at
          narrow widths. */}
      {authed ? (
        <AccountMenu
          onLogout={onLogout}
          onOpenPreferences={onOpenPreferences}
          collapsed
        />
      ) : null}
    </>
  );

  return (
    <Navbar
      variant="bordered"
      className="rounded-none bg-card no-print pt-safe-t pl-safe-l pr-safe-r min-h-[calc(3rem+env(safe-area-inset-top))]"
      data-print-hide
      brand={brand}
      center={center}
      actions={actions}
    />
  );
}
