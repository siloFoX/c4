// (TODO 8.41) AccountMenu — claude.ai-style avatar + name + chevron
// rendered at the bottom of the sidebar. Clicking opens a dropdown
// with Profile / Preferences / Keyboard shortcuts / Help / Sign out.
//
// Why bottom-of-sidebar (not header)? VS Code, Linear, claude.ai,
// Slack all anchor account / settings to the bottom-left so the top
// surface stays focused on navigation. AppHeader keeps its
// per-instance controls (sidebar toggle, locale, help-center
// shortcut) — we just relocate Sign out + add Profile/Preferences.

import { ChevronUp, HelpCircle, Keyboard, LogOut, Monitor, Moon, Settings, Sun, User } from 'lucide-react';
import { DropdownMenu, type DropdownMenuItem } from './ui/dropdown-menu';
import { Button } from './ui/button';
import { Kbd } from './ui/kbd';
import { cn } from '../lib/cn';
import { dispatchEvent } from '../lib/dispatch-event';
import { t, tFormat, useLocale } from '../lib/i18n';
import { useAuthIdentity } from '../lib/use-auth-identity';
import type { ThemeMode } from '../lib/preferences';
import {
  HELP_EVENT_OPEN_DRAWER,
  HELP_EVENT_OPEN_SHORTCUTS,
} from './HelpUIRoot';

interface AccountMenuProps {
  // Pulled up from App.tsx so the menu follows the same logout path
  // the AppHeader used to drive (and so the dropdown can close before
  // the auth event fires).
  onLogout: () => void;
  // Switches the top-tab to Settings. Optional — when omitted, the
  // Preferences row is hidden.
  onOpenPreferences?: (() => void) | undefined;
  // Called when the sidebar collapses to icon-only mode (8.40). For
  // now we always render the full row; the prop is wired through so
  // 8.40 can flip a flag without re-touching this file.
  collapsed?: boolean;
  // (1.11.87) Theme toggle plumbed through from App.tsx's useTheme().
  // Optional so AccountMenu still renders standalone (e.g. the unit
  // test for the trigger label) without forcing every callsite to
  // thread theme state. Renders the Theme row only when both are set.
  theme?: ThemeMode;
  onThemeChange?: (next: ThemeMode) => void;
}

// Pulled out so tests can source-grep the labels and a future i18n
// pass has clean keys.
export const ACCOUNT_LABEL_PROFILE = 'Profile';
export const ACCOUNT_LABEL_PREFERENCES = 'Preferences';
export const ACCOUNT_LABEL_KEYBOARD = 'Keyboard shortcuts';
export const ACCOUNT_LABEL_HELP = 'Help center';
export const ACCOUNT_LABEL_SIGNOUT = 'Sign out';
export const ACCOUNT_LABEL_THEME = 'Toggle theme';

// (1.11.87) Motion-safe rotate + scale animation classes applied to
// the theme switcher icon. Keyed off `theme` so React remounts the
// span on every toggle, which re-triggers the enter animation:
// rotates in from -180 degrees and scales up from 95% to 100%.
// Reduced-motion users (prefers-reduced-motion) skip the animation
// because every utility is motion-safe-prefixed.
export const THEME_ICON_ANIM_CLASS =
  'inline-flex motion-safe:animate-in motion-safe:spin-in-180 motion-safe:zoom-in-95 motion-safe:duration-300';

// light -> dark -> system -> light cycle. Keeps parity with the
// SettingsView radio group so the operator can reach every theme
// mode from the AccountMenu without opening Preferences.
function nextThemeMode(current: ThemeMode): ThemeMode {
  if (current === 'light') return 'dark';
  if (current === 'dark') return 'system';
  return 'light';
}

function themeIconFor(theme: ThemeMode) {
  if (theme === 'light') return Sun;
  if (theme === 'dark') return Moon;
  return Monitor;
}

// (v1.10.744) dispatch helper moved to lib/dispatch-event.

function initialsFor(user: string | null): string {
  if (!user) return '?';
  const trimmed = user.trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/[\s_.-]+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0]?.[0] ?? '';
    const b = parts[1]?.[0] ?? '';
    return (a + b).toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}

// Map daemon role names to badge color classes. Keep neutral for
// unknown roles so we don't accidentally promote a viewer-shaped role
// to admin styling.
function roleBadgeClass(role: string | null): string {
  switch ((role || '').toLowerCase()) {
    case 'admin':
      return 'bg-destructive/15 text-destructive border-destructive/30';
    case 'manager':
      return 'bg-primary/30 text-foreground border-primary/30';
    case 'viewer':
      return 'bg-muted text-muted-foreground border-border';
    default:
      return 'bg-secondary text-secondary-foreground border-border';
  }
}

// Keys that the storage-event handler should react to. Anything else
// (v1.10.688) AUTH_STORAGE_KEYS + cross-tab + AUTH_EVENT
// listener moved to lib/use-auth-identity.

export default function AccountMenu({
  onLogout,
  onOpenPreferences,
  collapsed = false,
  theme,
  onThemeChange,
}: AccountMenuProps) {
  useLocale();
  // (v1.10.688) Cached user + role + AUTH_EVENT/storage
  // listeners moved to lib/use-auth-identity.
  const { user, role } = useAuthIdentity();

  // (1.11.87) Theme toggle row. Only shows when both the current
  // theme and the setter are wired (App.tsx is the only producer
  // today; standalone unit tests omit them and the row is hidden).
  // The icon span keys off the current theme so each toggle remounts
  // and re-runs the motion-safe enter animation defined by
  // THEME_ICON_ANIM_CLASS.
  const themeItem: DropdownMenuItem | null =
    theme && onThemeChange
      ? {
          key: 'theme',
          label: t('account.theme.toggle') || ACCOUNT_LABEL_THEME,
          icon: (
            <span
              key={theme}
              data-theme={theme}
              className={THEME_ICON_ANIM_CLASS}
            >
              {(() => {
                const Icon = themeIconFor(theme);
                return <Icon className="h-4 w-4" />;
              })()}
            </span>
          ),
          hint: t(`account.theme.${theme}`) || theme,
          onSelect: () => onThemeChange(nextThemeMode(theme)),
        }
      : null;

  const items: DropdownMenuItem[] = [
    {
      key: 'profile',
      label: t('account.profile') || ACCOUNT_LABEL_PROFILE,
      icon: <User className="h-4 w-4" />,
      // Profile page is a follow-up (multi-account / avatar upload).
      // For now the row is visible-but-disabled so the entry point
      // exists and doesn't silently disappear when the feature lands.
      disabled: true,
      hint: t('account.hint.soon'),
      onSelect: () => {},
    },
    ...(onOpenPreferences
      ? [
          {
            key: 'preferences',
            label: t('account.preferences') || ACCOUNT_LABEL_PREFERENCES,
            icon: <Settings className="h-4 w-4" />,
            onSelect: onOpenPreferences,
          } as DropdownMenuItem,
        ]
      : []),
    ...(themeItem ? [themeItem] : []),
    {
      key: 'shortcuts',
      label: t('account.keyboard') || ACCOUNT_LABEL_KEYBOARD,
      icon: <Keyboard className="h-4 w-4" />,
      hint: <Kbd>?</Kbd>,
      onSelect: () => dispatchEvent(HELP_EVENT_OPEN_SHORTCUTS),
    },
    {
      key: 'help',
      label: t('account.help') || ACCOUNT_LABEL_HELP,
      icon: <HelpCircle className="h-4 w-4" />,
      onSelect: () => dispatchEvent(HELP_EVENT_OPEN_DRAWER),
    },
    {
      key: 'signout',
      label: t('account.signout') || ACCOUNT_LABEL_SIGNOUT,
      icon: <LogOut className="h-4 w-4" />,
      variant: 'danger',
      onSelect: onLogout,
    },
  ];

  const headerLabel = user || t('account.signedIn') || 'Signed in';
  const initials = initialsFor(user);
  const roleLabel = role || null;

  // Trigger: avatar circle + name + chevron. In collapsed mode we
  // render only the avatar (icon-only sidebar). Either way the same
  // dropdown items open above.
  const trigger = (
    <Button
      variant="ghost"
      className={cn(
        'h-auto w-full justify-start gap-2 rounded-md p-2 text-left',
        collapsed ? 'justify-center px-1' : '',
      )}
      aria-label={tFormat('account.menuLabel', { label: headerLabel })}
    >
      <span
        aria-hidden="true"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-secondary text-xs font-semibold uppercase text-secondary-foreground"
      >
        {initials}
      </span>
      {!collapsed ? (
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium leading-tight text-foreground">
            {headerLabel}
          </span>
          {roleLabel ? (
            <span
              className={cn(
                'mt-0.5 inline-flex w-fit items-center rounded-full border px-1.5 py-0 text-[10px] uppercase tracking-wide',
                roleBadgeClass(roleLabel),
              )}
            >
              {roleLabel}
            </span>
          ) : (
            <span className="text-[11px] text-muted-foreground">{t('account.noRole')}</span>
          )}
        </span>
      ) : null}
      {!collapsed ? (
        <ChevronUp aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
      ) : null}
    </Button>
  );

  return (
    <DropdownMenu
      trigger={trigger}
      items={items}
      placement="top"
      ariaLabel={tFormat('account.menuLabelFor', { label: headerLabel })}
      header={
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-secondary text-xs font-semibold uppercase text-secondary-foreground"
          >
            {initials}
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium text-foreground">
              {headerLabel}
            </span>
            <span className="truncate text-[11px] text-muted-foreground">
              {roleLabel ? tFormat('account.role', { role: roleLabel }) : t('account.noRoleAssigned')}
            </span>
          </div>
        </div>
      }
      className="w-full"
    />
  );
}
