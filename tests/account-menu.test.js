// (TODO 8.41) Source-grep tests for the AccountMenu / DropdownMenu
// surface. Mirrors the sessions-view / ui-docs pattern: we don't
// instantiate React (no jsdom in this repo); we verify the component
// files contain the contract literals callers depend on.

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const ACCOUNT_MENU = path.join(ROOT, 'web/src/components/AccountMenu.tsx');
const DROPDOWN_MENU = path.join(ROOT, 'web/src/components/ui/dropdown-menu.tsx');
const SIDEBAR = path.join(ROOT, 'web/src/components/layout/Sidebar.tsx');
const APP_HEADER = path.join(ROOT, 'web/src/components/layout/AppHeader.tsx');
const APP_TSX = path.join(ROOT, 'web/src/App.tsx');
const API_TS = path.join(ROOT, 'web/src/lib/api.ts');
const UI_INDEX = path.join(ROOT, 'web/src/components/ui/index.ts');

function readText(p) {
  return fs.readFileSync(p, 'utf8');
}

describe('DropdownMenu primitive (web/src/components/ui/dropdown-menu.tsx)', () => {
  const src = readText(DROPDOWN_MENU);

  it('exports DropdownMenu + DropdownMenuItem type', () => {
    assert.match(src, /export function DropdownMenu\(/);
    assert.match(src, /export interface DropdownMenuItem/);
  });

  it('supports placement top|bottom', () => {
    assert.match(src, /export type DropdownPlacement = 'top' \| 'bottom'/);
  });

  it('binds aria-haspopup, aria-expanded, aria-controls on the trigger', () => {
    assert.match(src, /'aria-haspopup': 'menu'/);
    assert.match(src, /'aria-expanded': open/);
    assert.match(src, /'aria-controls': menuId/);
  });

  it('renders role="menu" container with role="menuitem" rows', () => {
    assert.match(src, /role="menu"/);
    assert.match(src, /role="menuitem"/);
  });

  it('closes on Escape, click-outside, and item activation', () => {
    assert.match(src, /e\.key === 'Escape'/);
    assert.match(src, /document\.addEventListener\('mousedown', onDocClick\)/);
    assert.match(src, /handleItemActivate/);
  });

  it('supports ArrowUp / ArrowDown navigation skipping disabled items', () => {
    assert.match(src, /e\.key === 'ArrowDown' \|\| e\.key === 'ArrowUp'/);
    assert.match(src, /if \(!items\[next\]\.disabled\) break/);
  });

  it('exposes danger variant styling for destructive items', () => {
    assert.match(src, /variant\?: 'default' \| 'danger'/);
    assert.match(src, /text-destructive/);
  });
});

describe('UI primitive index re-exports DropdownMenu', () => {
  const src = readText(UI_INDEX);
  it('reexports dropdown-menu', () => {
    assert.match(src, /export \* from '\.\/dropdown-menu'/);
  });
});

describe('api.ts caches user + role on login', () => {
  const src = readText(API_TS);

  it('declares USER_KEY / ROLE_KEY localStorage keys', () => {
    assert.match(src, /const USER_KEY = 'c4\.authUser'/);
    assert.match(src, /const ROLE_KEY = 'c4\.authRole'/);
  });

  it('exports getAuthUser + getAuthRole', () => {
    assert.match(src, /export function getAuthUser\(\)/);
    assert.match(src, /export function getAuthRole\(\)/);
  });

  it('login response carries a role field', () => {
    assert.match(src, /role\?: string \| null/);
  });

  it('login() persists user + role into localStorage', () => {
    assert.match(src, /setAuthUser\(data\.user \|\| user, data\.role \|\| null\)/);
  });

  it('clearToken() also wipes user + role', () => {
    assert.match(src, /localStorage\.removeItem\(USER_KEY\)/);
    assert.match(src, /localStorage\.removeItem\(ROLE_KEY\)/);
  });
});

describe('AccountMenu component (web/src/components/AccountMenu.tsx)', () => {
  const src = readText(ACCOUNT_MENU);

  it('exports the canonical menu labels', () => {
    assert.match(src, /export const ACCOUNT_LABEL_PROFILE = 'Profile'/);
    assert.match(src, /export const ACCOUNT_LABEL_PREFERENCES = 'Preferences'/);
    assert.match(src, /export const ACCOUNT_LABEL_KEYBOARD = 'Keyboard shortcuts'/);
    assert.match(src, /export const ACCOUNT_LABEL_HELP = 'Help center'/);
    assert.match(src, /export const ACCOUNT_LABEL_SIGNOUT = 'Sign out'/);
  });

  it('reads cached user + role from api.ts', () => {
    assert.match(src, /getAuthUser\(\)/);
    assert.match(src, /getAuthRole\(\)/);
  });

  it('listens to AUTH_EVENT and storage events', () => {
    assert.match(src, /AUTH_EVENT/);
    // The storage handler is named `onStorage` after the
    // 2026-05-01 review-fix that filters by auth-key allow-set.
    assert.match(src, /addEventListener\('storage', onStorage\)/);
  });

  it('dispatches HELP_EVENT_OPEN_DRAWER + HELP_EVENT_OPEN_SHORTCUTS', () => {
    assert.match(src, /HELP_EVENT_OPEN_DRAWER/);
    assert.match(src, /HELP_EVENT_OPEN_SHORTCUTS/);
  });

  it('marks the Sign out item with the danger variant', () => {
    assert.match(src, /key: 'signout'/);
    assert.match(src, /variant: 'danger'/);
  });

  it('hides Preferences when no onOpenPreferences is wired', () => {
    assert.match(src, /onOpenPreferences\s*\?\s*\[/);
  });

  it('renders avatar initials for the cached user', () => {
    assert.match(src, /function initialsFor\(/);
  });

  it('renders a role badge with role-specific styling', () => {
    assert.match(src, /function roleBadgeClass\(/);
    assert.match(src, /case 'admin':/);
    assert.match(src, /case 'manager':/);
    assert.match(src, /case 'viewer':/);
  });

  it('opens the dropdown above the trigger (placement="top")', () => {
    assert.match(src, /placement="top"/);
  });
});

describe('Sidebar pins AccountMenu at the bottom', () => {
  const src = readText(SIDEBAR);

  it('imports AccountMenu', () => {
    assert.match(src, /from '\.\.\/AccountMenu'/);
  });

  it('renders AccountMenu only when onLogout is wired', () => {
    assert.match(src, /onLogout\s*\?\s*\(/);
    assert.match(src, /<AccountMenu/);
  });

  it('passes onLogout + onOpenPreferences through to AccountMenu', () => {
    assert.match(src, /onLogout=\{onLogout\}/);
    assert.match(src, /onOpenPreferences=\{onOpenPreferences\}/);
  });

  it('exposes onLogout / onOpenPreferences as optional props', () => {
    assert.match(src, /onLogout\?: \(\) => void/);
    assert.match(src, /onOpenPreferences\?: \(\) => void/);
  });
});

describe('AppHeader replaces LogOut button with AccountMenu', () => {
  const src = readText(APP_HEADER);

  it('no longer imports LogOut from lucide', () => {
    assert.doesNotMatch(src, /import \{[^}]*LogOut[^}]*\} from 'lucide-react'/);
  });

  it('imports AccountMenu', () => {
    assert.match(src, /from '\.\.\/AccountMenu'/);
  });

  it('renders AccountMenu in collapsed (icon-only) mode', () => {
    assert.match(src, /<AccountMenu/);
    assert.match(src, /collapsed/);
  });

  // (review fix 2026-05-01) Original code wrapped the header
  // AccountMenu in `<div className="hidden md:block">`, but on
  // mobile + non-Workers tabs the sidebar isn't rendered either,
  // so the sign-out path completely disappeared. Force the header
  // copy to render on every viewport.
  it('does NOT wrap AccountMenu in `hidden md:block`', () => {
    assert.doesNotMatch(src, /className="hidden md:block">\s*<AccountMenu/);
  });

  it('exposes onOpenPreferences as an optional prop', () => {
    assert.match(src, /onOpenPreferences\?: \(\) => void/);
  });

  it('keeps help drawer + shortcut + locale controls', () => {
    assert.match(src, /HELP_EVENT_OPEN_DRAWER/);
    assert.match(src, /HELP_EVENT_OPEN_SHORTCUTS/);
    assert.match(src, /setLocale\(locale === 'en' \? 'ko' : 'en'\)/);
  });
});

describe('App.tsx wires onOpenPreferences -> setTopView("settings")', () => {
  const src = readText(APP_TSX);

  it('wires onOpenPreferences on AppHeader', () => {
    assert.match(src, /onOpenPreferences=\{\(\) => setTopView\('settings'\)\}/);
  });

  it('wires onLogout + onOpenPreferences on Sidebar', () => {
    assert.match(src, /onLogout=\{handleLogout\}/);
  });
});

// (review fix 2026-05-01) Behavioural tests for the pure helpers.
// initialsFor / roleBadgeClass are not exported, so we import them
// via the same source and re-execute the exact algorithm. If the
// source drifts from the shim the source-grep test below catches it.
describe('initialsFor (avatar fallback)', () => {
  function initialsFor(user) {
    if (!user) return '?';
    const trimmed = user.trim();
    if (!trimmed) return '?';
    const parts = trimmed.split(/[\s_.-]+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return trimmed.slice(0, 2).toUpperCase();
  }

  it('returns "?" for empty / whitespace / null', () => {
    assert.strictEqual(initialsFor(null), '?');
    assert.strictEqual(initialsFor(''), '?');
    assert.strictEqual(initialsFor('   '), '?');
  });
  it('takes first two letters of a single token', () => {
    assert.strictEqual(initialsFor('alice'), 'AL');
    assert.strictEqual(initialsFor('a'), 'A');
  });
  it('takes first letter of each of the first two parts when split', () => {
    assert.strictEqual(initialsFor('Alice Bob'), 'AB');
    assert.strictEqual(initialsFor('silo.fox'), 'SF');
    assert.strictEqual(initialsFor('admin_user'), 'AU');
    assert.strictEqual(initialsFor('first-last-third'), 'FL');
  });
  it('uppercases lower-case input', () => {
    assert.strictEqual(initialsFor('shinc'), 'SH');
  });

  it('source mirrors the shim', () => {
    const src = readText(ACCOUNT_MENU);
    assert.match(src, /function initialsFor\(user: string \| null\)/);
    assert.match(src, /trimmed\.split\(\/\[\\s_\.-\]\+\/\)/);
    assert.match(src, /\(parts\[0\]\[0\] \+ parts\[1\]\[0\]\)\.toUpperCase\(\)/);
    assert.match(src, /trimmed\.slice\(0, 2\)\.toUpperCase\(\)/);
  });
});

describe('roleBadgeClass (token-backed badge palette)', () => {
  function roleBadgeClass(role) {
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

  it('admin -> destructive accent', () => {
    assert.match(roleBadgeClass('admin'), /text-destructive/);
    assert.match(roleBadgeClass('ADMIN'), /text-destructive/);
  });
  it('manager -> primary accent', () => {
    assert.match(roleBadgeClass('manager'), /text-primary/);
  });
  it('viewer -> muted accent', () => {
    assert.match(roleBadgeClass('viewer'), /text-muted-foreground/);
  });
  it('unknown / null -> neutral secondary (never accidentally promotes)', () => {
    assert.match(roleBadgeClass('superadmin'), /text-secondary-foreground/);
    assert.match(roleBadgeClass(null), /text-secondary-foreground/);
    assert.match(roleBadgeClass(''), /text-secondary-foreground/);
  });

  it('source mirrors the shim', () => {
    const src = readText(ACCOUNT_MENU);
    assert.match(src, /function roleBadgeClass\(role: string \| null\)/);
    assert.match(src, /case 'admin':\s*\n\s*return 'bg-destructive\/15 text-destructive border-destructive\/30'/);
  });
});

// (review fix 2026-05-01) Storage-event filter — only the auth
// localStorage keys should trigger a re-read.
describe('AccountMenu storage event listener filters by auth keys', () => {
  const src = readText(ACCOUNT_MENU);

  it('declares an auth-keys allow-set', () => {
    assert.match(src, /AUTH_STORAGE_KEYS = new Set\(\[/);
    assert.match(src, /'c4\.authToken'/);
    assert.match(src, /'c4\.authUser'/);
    assert.match(src, /'c4\.authRole'/);
  });

  it('skips storage events whose key is not in the auth set', () => {
    assert.match(src, /if \(e\.key && !AUTH_STORAGE_KEYS\.has\(e\.key\)\) return/);
  });

  it('useState initialisers are lazy (function form)', () => {
    assert.match(src, /useState<string \| null>\(\(\) => getAuthUser\(\)\)/);
    assert.match(src, /useState<string \| null>\(\(\) => getAuthRole\(\)\)/);
  });
});
