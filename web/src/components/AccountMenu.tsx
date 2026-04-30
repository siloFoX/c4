// (TODO 8.41) AccountMenu — claude.ai-style avatar + name + chevron
// rendered at the bottom of the sidebar. Clicking opens a dropdown
// with Profile / Preferences / Keyboard shortcuts / Help / Sign out.
//
// Why bottom-of-sidebar (not header)? VS Code, Linear, claude.ai,
// Slack all anchor account / settings to the bottom-left so the top
// surface stays focused on navigation. AppHeader keeps its
// per-instance controls (sidebar toggle, locale, help-center
// shortcut) — we just relocate Sign out + add Profile/Preferences.

import { ChevronUp, HelpCircle, Keyboard, LogOut, Settings, User } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DropdownMenu, type DropdownMenuItem } from './ui/dropdown-menu';
import { Button } from './ui/button';
import { cn } from '../lib/cn';
import {
  AUTH_EVENT,
  getAuthRole,
  getAuthUser,
} from '../lib/api';
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
  onOpenPreferences?: () => void;
  // Called when the sidebar collapses to icon-only mode (8.40). For
  // now we always render the full row; the prop is wired through so
  // 8.40 can flip a flag without re-touching this file.
  collapsed?: boolean;
}

// Pulled out so tests can source-grep the labels and a future i18n
// pass has clean keys.
export const ACCOUNT_LABEL_PROFILE = 'Profile';
export const ACCOUNT_LABEL_PREFERENCES = 'Preferences';
export const ACCOUNT_LABEL_KEYBOARD = 'Keyboard shortcuts';
export const ACCOUNT_LABEL_HELP = 'Help center';
export const ACCOUNT_LABEL_SIGNOUT = 'Sign out';

function dispatchEvent(name: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(name));
  } catch {
    // SSR / test env — ignore.
  }
}

function initialsFor(user: string | null): string {
  if (!user) return '?';
  const trimmed = user.trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/[\s_.-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
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
      return 'bg-primary/10 text-primary border-primary/30';
    case 'viewer':
      return 'bg-muted text-muted-foreground border-border';
    default:
      return 'bg-secondary text-secondary-foreground border-border';
  }
}

export default function AccountMenu({
  onLogout,
  onOpenPreferences,
  collapsed = false,
}: AccountMenuProps) {
  const [user, setUser] = useState<string | null>(getAuthUser());
  const [role, setRole] = useState<string | null>(getAuthRole());

  // Re-read on AUTH_EVENT so logout in another tab (or 401-clearing)
  // wipes the avatar without a manual refresh.
  useEffect(() => {
    const onAuth = () => {
      setUser(getAuthUser());
      setRole(getAuthRole());
    };
    window.addEventListener(AUTH_EVENT, onAuth);
    // Cross-tab sync.
    window.addEventListener('storage', onAuth);
    return () => {
      window.removeEventListener(AUTH_EVENT, onAuth);
      window.removeEventListener('storage', onAuth);
    };
  }, []);

  const items: DropdownMenuItem[] = [
    {
      key: 'profile',
      label: ACCOUNT_LABEL_PROFILE,
      icon: <User className="h-4 w-4" />,
      // Profile page is a follow-up (multi-account / avatar upload).
      // For now the row is visible-but-disabled so the entry point
      // exists and doesn't silently disappear when the feature lands.
      disabled: true,
      hint: 'soon',
      onSelect: () => {},
    },
    ...(onOpenPreferences
      ? [
          {
            key: 'preferences',
            label: ACCOUNT_LABEL_PREFERENCES,
            icon: <Settings className="h-4 w-4" />,
            onSelect: onOpenPreferences,
          } as DropdownMenuItem,
        ]
      : []),
    {
      key: 'shortcuts',
      label: ACCOUNT_LABEL_KEYBOARD,
      icon: <Keyboard className="h-4 w-4" />,
      hint: '?',
      onSelect: () => dispatchEvent(HELP_EVENT_OPEN_SHORTCUTS),
    },
    {
      key: 'help',
      label: ACCOUNT_LABEL_HELP,
      icon: <HelpCircle className="h-4 w-4" />,
      onSelect: () => dispatchEvent(HELP_EVENT_OPEN_DRAWER),
    },
    {
      key: 'signout',
      label: ACCOUNT_LABEL_SIGNOUT,
      icon: <LogOut className="h-4 w-4" />,
      variant: 'danger',
      onSelect: onLogout,
    },
  ];

  const headerLabel = user || 'Signed in';
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
      aria-label={`Account menu — ${headerLabel}`}
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
            <span className="text-[11px] text-muted-foreground">No role</span>
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
      ariaLabel={`Account menu for ${headerLabel}`}
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
              {roleLabel ? `Role: ${roleLabel}` : 'No role assigned'}
            </span>
          </div>
        </div>
      }
      className="w-full"
    />
  );
}
