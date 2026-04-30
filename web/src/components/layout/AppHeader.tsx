import { HelpCircle, Keyboard, Languages, Menu, X } from 'lucide-react';
import AccountMenu from '../AccountMenu';
import { IconButton, Tooltip } from '../ui';
import TopTabs, { type TopView } from './TopTabs';
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

function dispatch(name: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(name));
  } catch {
    // non-browser test env
  }
}

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
  return (
    <header className="flex items-center justify-between gap-2 rounded-none border-b border-border bg-card px-4 py-3 md:px-6 md:py-4">
      <div className="flex min-w-0 items-center gap-2">
        <IconButton
          className="md:hidden"
          aria-label={sidebarOpen ? 'Close worker list' : 'Open worker list'}
          onClick={onToggleSidebar}
          icon={
            sidebarOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )
          }
        />
        <h1 className="truncate text-lg font-semibold text-foreground md:text-xl">
          C4 Dashboard
        </h1>
      </div>
      <div className="flex items-center gap-2">
        <TopTabs value={topView} onChange={onTopViewChange} />
        <Tooltip label={t('common.helpCenter')} placement="bottom">
          <IconButton
            aria-label={t('common.helpCenter')}
            onClick={() => dispatch(HELP_EVENT_OPEN_DRAWER)}
            icon={<HelpCircle className="h-4 w-4" />}
          />
        </Tooltip>
        <Tooltip label={t('common.shortcuts')} placement="bottom">
          <IconButton
            aria-label={t('common.shortcuts')}
            onClick={() => dispatch(HELP_EVENT_OPEN_SHORTCUTS)}
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
