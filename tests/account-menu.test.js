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
    assert.match(src, /addEventListener\('storage', onAuth\)/);
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

  it('renders AccountMenu in collapsed (icon-only) mode for desktop', () => {
    assert.match(src, /<AccountMenu/);
    assert.match(src, /collapsed/);
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
