import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';

// AccountMenu owns no controlled state — identity comes from the
// useAuthIdentity hook (its own unit tests cover the storage
// listeners) and the actual dropdown chrome lives in
// ./ui/dropdown-menu. Tests stub the identity hook with per-test
// tunable user/role values + spy the help-event dispatch helper, then
// drive the trigger / item activation through user-event. The hook
// stub is reset in beforeEach so each test sees a clean baseline.

let identityUser: string | null = 'shinc@example.com';
let identityRole: string | null = 'admin';

vi.mock('../lib/use-auth-identity', () => ({
  useAuthIdentity: () => ({ user: identityUser, role: identityRole }),
}));

const dispatchSpy = vi.fn();
vi.mock('../lib/dispatch-event', () => ({
  dispatchEvent: (name: string) => dispatchSpy(name),
}));

import AccountMenu, {
  ACCOUNT_LABEL_PROFILE,
  ACCOUNT_LABEL_PREFERENCES,
  ACCOUNT_LABEL_KEYBOARD,
  ACCOUNT_LABEL_HELP,
  ACCOUNT_LABEL_SIGNOUT,
  ACCOUNT_LABEL_THEME,
  THEME_ICON_ANIM_CLASS,
} from './AccountMenu';
import {
  HELP_EVENT_OPEN_DRAWER,
  HELP_EVENT_OPEN_SHORTCUTS,
} from './HelpUIRoot';

beforeEach(() => {
  setLocale('en');
  identityUser = 'shinc@example.com';
  identityRole = 'admin';
  dispatchSpy.mockReset();
});

function renderMenu(
  overrides: Partial<Parameters<typeof AccountMenu>[0]> = {},
) {
  const onLogout = vi.fn();
  const onOpenPreferences = vi.fn();
  const props = {
    onLogout,
    onOpenPreferences,
    ...overrides,
  };
  const utils = render(<AccountMenu {...props} />);
  const user = userEvent.setup();
  return { ...utils, user, onLogout, onOpenPreferences, props };
}

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  const trigger = screen.getByRole('button', { name: /Account menu/ });
  await user.click(trigger);
  return trigger;
}

describe('<AccountMenu>', () => {
  // ---- trigger render ------------------------------------------

  it('renders the trigger button with the i18n account-menu aria-label including the user', () => {
    renderMenu();
    expect(
      screen.getByRole('button', {
        name: 'Account menu — shinc@example.com',
      }),
    ).toBeInTheDocument();
  });

  it('renders the user email/text inline on the trigger when collapsed=false (the default)', () => {
    renderMenu();
    const trigger = screen.getByRole('button', { name: /Account menu/ });
    expect(within(trigger).getByText('shinc@example.com')).toBeInTheDocument();
  });

  it('renders the role badge inline on the trigger when role is set', () => {
    renderMenu();
    const trigger = screen.getByRole('button', { name: /Account menu/ });
    expect(within(trigger).getByText('admin')).toBeInTheDocument();
  });

  it('renders the "No role" copy on the trigger when role is null', () => {
    identityRole = null;
    renderMenu();
    const trigger = screen.getByRole('button', { name: /Account menu/ });
    expect(within(trigger).getByText('No role')).toBeInTheDocument();
  });

  it('renders the avatar initials derived from the email user', () => {
    identityUser = 'jane.doe@example.com';
    renderMenu();
    // initialsFor splits on [\s_.-] so 'jane.doe@example.com' →
    // parts ['jane', 'doe@example', 'com'] → 'JD'.
    expect(screen.getAllByText('JD').length).toBeGreaterThan(0);
  });

  it('falls back to "?" initials when user is null', () => {
    identityUser = null;
    renderMenu();
    expect(screen.getAllByText('?').length).toBeGreaterThan(0);
  });

  it('hides the inline name + chevron when collapsed=true', () => {
    renderMenu({ collapsed: true });
    const trigger = screen.getByRole('button', { name: /Account menu/ });
    expect(
      within(trigger).queryByText('shinc@example.com'),
    ).not.toBeInTheDocument();
  });

  it('exposes aria-haspopup="menu" + aria-expanded="false" before the menu opens', () => {
    renderMenu();
    const trigger = screen.getByRole('button', { name: /Account menu/ });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('does NOT render the menu container before the trigger is clicked', () => {
    renderMenu();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  // ---- open + items list ---------------------------------------

  it('opens the menu when the trigger is clicked', async () => {
    const { user } = renderMenu();
    await openMenu(user);
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('flips aria-expanded to true on the trigger once the menu opens', async () => {
    const { user } = renderMenu();
    const trigger = await openMenu(user);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('renders Profile / Preferences / Keyboard shortcuts / Help center / Sign out items in order when onOpenPreferences is provided', async () => {
    const { user } = renderMenu();
    await openMenu(user);
    const items = screen.getAllByRole('menuitem');
    const labels = items.map((it) => it.textContent?.trim() ?? '');
    expect(labels[0]).toMatch(new RegExp(ACCOUNT_LABEL_PROFILE));
    expect(labels[1]).toMatch(new RegExp(ACCOUNT_LABEL_PREFERENCES));
    expect(labels[2]).toMatch(new RegExp(ACCOUNT_LABEL_KEYBOARD));
    expect(labels[3]).toMatch(new RegExp(ACCOUNT_LABEL_HELP));
    expect(labels[4]).toMatch(new RegExp(ACCOUNT_LABEL_SIGNOUT));
  });

  it('hides the Preferences row when onOpenPreferences is omitted', async () => {
    const { user } = renderMenu({ onOpenPreferences: undefined });
    await openMenu(user);
    const items = screen.getAllByRole('menuitem');
    const labels = items.map((it) => it.textContent ?? '');
    expect(labels.some((l) => l.includes(ACCOUNT_LABEL_PREFERENCES))).toBe(
      false,
    );
    // Profile + Shortcuts + Help + Signout = 4 entries.
    expect(items).toHaveLength(4);
  });

  it('disables the Profile row (placeholder for the upcoming profile page)', async () => {
    const { user } = renderMenu();
    await openMenu(user);
    const profile = screen.getByRole('menuitem', { name: /Profile/ });
    expect(profile).toBeDisabled();
  });

  it('renders the Sign out row in the danger variant (destructive className)', async () => {
    const { user } = renderMenu();
    await openMenu(user);
    const signout = screen.getByRole('menuitem', {
      name: new RegExp(ACCOUNT_LABEL_SIGNOUT),
    });
    expect(signout.className).toMatch(/destructive/);
  });

  // ---- callbacks ------------------------------------------------

  it('fires onLogout exactly once when the Sign out row is activated', async () => {
    const { user, onLogout } = renderMenu();
    await openMenu(user);
    await user.click(
      screen.getByRole('menuitem', {
        name: new RegExp(ACCOUNT_LABEL_SIGNOUT),
      }),
    );
    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(onLogout).toHaveBeenCalledWith();
  });

  it('fires onOpenPreferences exactly once when the Preferences row is activated', async () => {
    const { user, onOpenPreferences } = renderMenu();
    await openMenu(user);
    await user.click(
      screen.getByRole('menuitem', {
        name: new RegExp(ACCOUNT_LABEL_PREFERENCES),
      }),
    );
    expect(onOpenPreferences).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire onLogout when the disabled Profile row is clicked', async () => {
    const { user, onLogout } = renderMenu();
    await openMenu(user);
    await user.click(
      screen.getByRole('menuitem', { name: /Profile/ }),
    );
    expect(onLogout).not.toHaveBeenCalled();
  });

  it('dispatches the help-shortcuts open event when Keyboard shortcuts is activated', async () => {
    const { user } = renderMenu();
    await openMenu(user);
    await user.click(
      screen.getByRole('menuitem', {
        name: new RegExp(ACCOUNT_LABEL_KEYBOARD),
      }),
    );
    expect(dispatchSpy).toHaveBeenCalledWith(HELP_EVENT_OPEN_SHORTCUTS);
  });

  it('dispatches the help-drawer open event when Help center is activated', async () => {
    const { user } = renderMenu();
    await openMenu(user);
    await user.click(
      screen.getByRole('menuitem', {
        name: new RegExp(ACCOUNT_LABEL_HELP),
      }),
    );
    expect(dispatchSpy).toHaveBeenCalledWith(HELP_EVENT_OPEN_DRAWER);
  });

  it('does NOT fire any callback on initial render (before the menu is opened)', () => {
    const { onLogout, onOpenPreferences } = renderMenu();
    expect(onLogout).not.toHaveBeenCalled();
    expect(onOpenPreferences).not.toHaveBeenCalled();
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  // ---- close behaviour -----------------------------------------

  it('closes the menu after a non-disabled item is activated', async () => {
    const { user } = renderMenu();
    await openMenu(user);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.click(
      screen.getByRole('menuitem', {
        name: new RegExp(ACCOUNT_LABEL_HELP),
      }),
    );
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes the menu when Escape is pressed', async () => {
    const { user } = renderMenu();
    await openMenu(user);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes the menu when a click lands outside the menu container', async () => {
    const { user } = renderMenu();
    await openMenu(user);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.click(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  // ---- locale flip ----------------------------------------------

  it('re-renders the trigger aria-label in Korean when the locale flips', () => {
    renderMenu();
    expect(
      screen.getByRole('button', {
        name: /Account menu — shinc@example.com/,
      }),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByRole('button', {
        name: /Account menu — shinc@example.com/,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: /shinc@example.com/,
      }),
    ).toBeInTheDocument();
  });

  // ---- identity stub change -----------------------------------

  it('reflects a different mocked user value on remount', () => {
    identityUser = 'other@example.com';
    identityRole = 'manager';
    renderMenu();
    expect(
      screen.getByRole('button', {
        name: 'Account menu — other@example.com',
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('manager').length).toBeGreaterThan(0);
  });

  // ---- theme toggle (1.11.87) ----------------------------------

  it('renders the Theme toggle row when theme + onThemeChange are wired', async () => {
    const onThemeChange = vi.fn();
    const { user } = renderMenu({ theme: 'dark', onThemeChange });
    await openMenu(user);
    expect(
      screen.getByRole('menuitem', { name: new RegExp(ACCOUNT_LABEL_THEME) }),
    ).toBeInTheDocument();
  });

  it('hides the Theme toggle row when theme prop is omitted', async () => {
    const { user } = renderMenu();
    await openMenu(user);
    expect(
      screen.queryByRole('menuitem', { name: new RegExp(ACCOUNT_LABEL_THEME) }),
    ).not.toBeInTheDocument();
  });

  it('hides the Theme toggle row when onThemeChange is omitted but theme is set', async () => {
    const { user } = renderMenu({ theme: 'dark' });
    await openMenu(user);
    expect(
      screen.queryByRole('menuitem', { name: new RegExp(ACCOUNT_LABEL_THEME) }),
    ).not.toBeInTheDocument();
  });

  it('cycles light -> dark when the Theme row is activated with current theme=light', async () => {
    const onThemeChange = vi.fn();
    const { user } = renderMenu({ theme: 'light', onThemeChange });
    await openMenu(user);
    await user.click(
      screen.getByRole('menuitem', { name: new RegExp(ACCOUNT_LABEL_THEME) }),
    );
    expect(onThemeChange).toHaveBeenCalledTimes(1);
    expect(onThemeChange).toHaveBeenCalledWith('dark');
  });

  it('cycles dark -> system when the Theme row is activated with current theme=dark', async () => {
    const onThemeChange = vi.fn();
    const { user } = renderMenu({ theme: 'dark', onThemeChange });
    await openMenu(user);
    await user.click(
      screen.getByRole('menuitem', { name: new RegExp(ACCOUNT_LABEL_THEME) }),
    );
    expect(onThemeChange).toHaveBeenCalledWith('system');
  });

  it('cycles system -> light when the Theme row is activated with current theme=system', async () => {
    const onThemeChange = vi.fn();
    const { user } = renderMenu({ theme: 'system', onThemeChange });
    await openMenu(user);
    await user.click(
      screen.getByRole('menuitem', { name: new RegExp(ACCOUNT_LABEL_THEME) }),
    );
    expect(onThemeChange).toHaveBeenCalledWith('light');
  });

  it('carries the motion-safe rotate + scale animation class on the theme icon span', async () => {
    const onThemeChange = vi.fn();
    const { container, user } = renderMenu({
      theme: 'dark',
      onThemeChange,
    });
    await openMenu(user);
    const animatedSpan = container.querySelector<HTMLSpanElement>(
      'span[data-theme="dark"]',
    );
    expect(animatedSpan).not.toBeNull();
    expect(animatedSpan?.className).toContain('motion-safe:animate-in');
    expect(animatedSpan?.className).toContain('motion-safe:spin-in-180');
    expect(animatedSpan?.className).toContain('motion-safe:zoom-in-95');
    expect(animatedSpan?.className).toContain('motion-safe:duration-300');
    // The exported constant + the rendered className should match in
    // full so a future tweak to one breaks the assertion in lockstep.
    expect(animatedSpan?.className).toBe(THEME_ICON_ANIM_CLASS);
  });

  it('flips the data-theme attribute when the theme prop changes (remount key)', async () => {
    const onThemeChange = vi.fn();
    const { container, user, rerender } = renderMenu({
      theme: 'dark',
      onThemeChange,
    });
    await openMenu(user);
    expect(
      container.querySelector('span[data-theme="dark"]'),
    ).not.toBeNull();
    // Rerender with a fresh theme — the key={theme} forces a remount
    // so the data-theme attribute mirrors the new value and the
    // motion-safe enter animation runs again.
    rerender(
      <AccountMenu
        onLogout={vi.fn()}
        onOpenPreferences={vi.fn()}
        theme="light"
        onThemeChange={onThemeChange}
      />,
    );
    expect(
      container.querySelector('span[data-theme="light"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('span[data-theme="dark"]'),
    ).toBeNull();
  });

  it('places the Theme row between Preferences and Keyboard shortcuts in the menu order', async () => {
    const onThemeChange = vi.fn();
    const { user } = renderMenu({ theme: 'dark', onThemeChange });
    await openMenu(user);
    const items = screen.getAllByRole('menuitem');
    const labels = items.map((it) => it.textContent?.trim() ?? '');
    expect(labels[0]).toMatch(new RegExp(ACCOUNT_LABEL_PROFILE));
    expect(labels[1]).toMatch(new RegExp(ACCOUNT_LABEL_PREFERENCES));
    expect(labels[2]).toMatch(new RegExp(ACCOUNT_LABEL_THEME));
    expect(labels[3]).toMatch(new RegExp(ACCOUNT_LABEL_KEYBOARD));
    expect(labels[4]).toMatch(new RegExp(ACCOUNT_LABEL_HELP));
    expect(labels[5]).toMatch(new RegExp(ACCOUNT_LABEL_SIGNOUT));
  });
});
