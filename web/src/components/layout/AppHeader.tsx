import { HelpCircle, Keyboard, Languages, Menu, X } from 'lucide-react';
import AccountMenu from '../AccountMenu';
import { IconButton, Tooltip } from '../ui';
import TopTabs, { type TopView } from './TopTabs';
import { useNavBadgeCounts } from '../../lib/use-nav-badge-counts';
import { dispatchEvent } from '../../lib/dispatch-event';
import {
  HELP_EVENT_OPEN_DRAWER,
  HELP_EVENT_OPEN_SHORTCUTS,
} from '../HelpUIRoot';
import { getLocale, setLocale, t, useLocale } from '../../lib/i18n';

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
  const locale = getLocale();
  // (v1.10.709) Three nav-badge polls (stuck-meetings /
  // specialist-underperformers / autonomous-escalations) moved
  // to lib/use-nav-badge-counts.
  const { stuckCount, underperformerCount, escalationCount } =
    useNavBadgeCounts({ authed });

  return (
    <header className="flex items-center justify-between gap-2 rounded-none border-b border-border bg-card px-4 py-3 md:px-6 md:py-4">
      <div className="flex min-w-0 items-center gap-2">
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
            brand in the same spot — claude.ai / Linear / VS Code
            convention. The sidebar's "Workers" header drops the
            logo image and just labels the section.
            (review fix 2026-05-01) Logo is decorative when paired
            with the visible "C4 Dashboard" wordmark — use empty
            alt + aria-hidden so screen readers announce the
            wordmark once instead of "C4 image, C4 Dashboard". */}
        <img
          src="/logo.svg"
          alt=""
          className="h-7 w-7 shrink-0"
          aria-hidden="true"
        />
        <h1 className="truncate text-lg font-semibold text-foreground md:text-xl">
          {t('header.title')}
        </h1>
      </div>
      <div className="flex items-center gap-2">
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
        <Tooltip label={t('common.language')} placement="bottom">
          <IconButton
            aria-label={t('common.language')}
            onClick={() => setLocale(locale === 'en' ? 'ko' : 'en')}
            icon={
              <span className="flex items-center gap-1 text-[11px] font-semibold uppercase">
                <Languages className="h-4 w-4" aria-hidden="true" />
                {locale}
              </span>
            }
          />
        </Tooltip>
        {/* (TODO 8.41) Replaced the standalone LogOut IconButton with a
            compact AccountMenu — the avatar+chevron trigger opens the
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
      </div>
    </header>
  );
}
