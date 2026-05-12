import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import {
  DEFAULT_DETAIL_MODE,
  DEFAULT_SIDEBAR_MODE,
  DEFAULT_THEME,
  type ThemeMode,
} from '../lib/preferences';
import type { DetailMode } from './layout/DetailTabs';
import type { SidebarMode } from './layout/Sidebar';

// SettingsView is a pure-display preferences pane: it owns no
// hook state of its own (apart from useLocale, which only
// re-renders on locale flips). Every preference value plus its
// setter is passed down from App.tsx, so the test drives every
// prop in the union directly with vi.fn() callbacks and asserts
// each radio fires its setter with the correct enum value. The
// one side effect -- resetPreferences() -- is mocked via vi.mock
// + vi.importActual so the constants used by the test (DEFAULT_*)
// stay live and only the side-effect function is stubbed.

const resetPreferencesMock = vi.fn();

vi.mock('../lib/preferences', async () => {
  const actual = await vi.importActual<typeof import('../lib/preferences')>(
    '../lib/preferences',
  );
  return {
    ...actual,
    resetPreferences: () => resetPreferencesMock(),
  };
});

import SettingsView from './SettingsView';

interface ViewOverrides {
  theme?: ThemeMode;
  onThemeChange?: (v: ThemeMode) => void;
  sidebarMode?: SidebarMode;
  onSidebarModeChange?: (v: SidebarMode) => void;
  detailMode?: DetailMode;
  onDetailModeChange?: (v: DetailMode) => void;
  onReset?: () => void;
}

function renderView(overrides: ViewOverrides = {}) {
  const onThemeChange = overrides.onThemeChange ?? vi.fn();
  const onSidebarModeChange = overrides.onSidebarModeChange ?? vi.fn();
  const onDetailModeChange = overrides.onDetailModeChange ?? vi.fn();
  const onReset = overrides.onReset ?? vi.fn();
  const props = {
    theme: overrides.theme ?? DEFAULT_THEME,
    onThemeChange,
    sidebarMode: overrides.sidebarMode ?? DEFAULT_SIDEBAR_MODE,
    onSidebarModeChange,
    detailMode: overrides.detailMode ?? DEFAULT_DETAIL_MODE,
    onDetailModeChange,
    onReset,
  };
  const utils = render(<SettingsView {...props} />);
  const user = userEvent.setup();
  return {
    ...utils,
    user,
    onThemeChange,
    onSidebarModeChange,
    onDetailModeChange,
    onReset,
    props,
  };
}

beforeEach(() => {
  setLocale('en');
  resetPreferencesMock.mockReset();
});

describe('<SettingsView>', () => {
  // ---- default render -------------------------------------------

  it('renders the localized "Settings" card title', () => {
    renderView();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('renders the localized card description copy', () => {
    renderView();
    expect(
      screen.getByText(/Customize the dashboard layout and appearance/),
    ).toBeInTheDocument();
  });

  it('renders the Appearance panel section heading at level 3', () => {
    renderView();
    expect(
      screen.getByRole('heading', { level: 3, name: 'Appearance' }),
    ).toBeInTheDocument();
  });

  it('renders the Layout panel section heading at level 3', () => {
    renderView();
    expect(
      screen.getByRole('heading', { level: 3, name: 'Layout' }),
    ).toBeInTheDocument();
  });

  it('renders exactly three radiogroups (theme, sidebar mode, detail view)', () => {
    renderView();
    expect(screen.getAllByRole('radiogroup')).toHaveLength(3);
  });

  it('renders exactly eight radios across the three groups (3 + 2 + 3)', () => {
    renderView();
    expect(screen.getAllByRole('radio')).toHaveLength(8);
  });

  // ---- ARIA on the radiogroups ----------------------------------

  it('exposes the theme radiogroup with the localized "Theme" accessible name', () => {
    renderView();
    expect(
      screen.getByRole('radiogroup', { name: 'Theme' }),
    ).toBeInTheDocument();
  });

  it('exposes the sidebar mode radiogroup with the localized "Sidebar mode" accessible name', () => {
    renderView();
    expect(
      screen.getByRole('radiogroup', { name: 'Sidebar mode' }),
    ).toBeInTheDocument();
  });

  it('exposes the detail view radiogroup with the localized "Detail view" accessible name', () => {
    renderView();
    expect(
      screen.getByRole('radiogroup', { name: 'Detail view' }),
    ).toBeInTheDocument();
  });

  it('binds each ChoiceGroup label to its radiogroup container via matching id', () => {
    renderView();
    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toHaveAttribute(
      'id',
      'pref-theme',
    );
    expect(
      screen.getByRole('radiogroup', { name: 'Sidebar mode' }),
    ).toHaveAttribute('id', 'pref-sidebar-mode');
    expect(
      screen.getByRole('radiogroup', { name: 'Detail view' }),
    ).toHaveAttribute('id', 'pref-detail-mode');
  });

  // ---- theme prop union -----------------------------------------

  it('renders all three theme options as radios with the localized labels', () => {
    renderView();
    const group = screen.getByRole('radiogroup', { name: 'Theme' });
    expect(within(group).getByRole('radio', { name: 'Light' })).toBeInTheDocument();
    expect(within(group).getByRole('radio', { name: 'Dark' })).toBeInTheDocument();
    expect(
      within(group).getByRole('radio', { name: 'System' }),
    ).toBeInTheDocument();
  });

  it('marks the Light theme radio as checked when theme="light"', () => {
    renderView({ theme: 'light' });
    const group = screen.getByRole('radiogroup', { name: 'Theme' });
    expect(within(group).getByRole('radio', { name: 'Light' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('marks the Dark theme radio as checked when theme="dark"', () => {
    renderView({ theme: 'dark' });
    const group = screen.getByRole('radiogroup', { name: 'Theme' });
    expect(within(group).getByRole('radio', { name: 'Dark' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('marks the System theme radio as checked when theme="system"', () => {
    renderView({ theme: 'system' });
    const group = screen.getByRole('radiogroup', { name: 'Theme' });
    expect(
      within(group).getByRole('radio', { name: 'System' }),
    ).toHaveAttribute('aria-checked', 'true');
  });

  it('marks only the matching theme radio as checked; the other two remain unchecked', () => {
    renderView({ theme: 'light' });
    const group = screen.getByRole('radiogroup', { name: 'Theme' });
    expect(within(group).getByRole('radio', { name: 'Light' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(within(group).getByRole('radio', { name: 'Dark' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(
      within(group).getByRole('radio', { name: 'System' }),
    ).toHaveAttribute('aria-checked', 'false');
  });

  it('attaches the localized systemHint as the title attribute on the System theme option', () => {
    renderView();
    const group = screen.getByRole('radiogroup', { name: 'Theme' });
    expect(
      within(group).getByRole('radio', { name: 'System' }),
    ).toHaveAttribute('title', 'Follow OS setting');
  });

  it('does NOT attach a title attribute to Light or Dark theme options (no descriptionKey)', () => {
    renderView();
    const group = screen.getByRole('radiogroup', { name: 'Theme' });
    expect(
      within(group).getByRole('radio', { name: 'Light' }),
    ).not.toHaveAttribute('title');
    expect(
      within(group).getByRole('radio', { name: 'Dark' }),
    ).not.toHaveAttribute('title');
  });

  // ---- theme callback ------------------------------------------

  it('fires onThemeChange with "light" when the Light radio is clicked', async () => {
    const { user, onThemeChange } = renderView({ theme: 'dark' });
    const group = screen.getByRole('radiogroup', { name: 'Theme' });
    await user.click(within(group).getByRole('radio', { name: 'Light' }));
    expect(onThemeChange).toHaveBeenCalledTimes(1);
    expect(onThemeChange).toHaveBeenCalledWith('light');
  });

  it('fires onThemeChange with "dark" when the Dark radio is clicked', async () => {
    const { user, onThemeChange } = renderView({ theme: 'light' });
    const group = screen.getByRole('radiogroup', { name: 'Theme' });
    await user.click(within(group).getByRole('radio', { name: 'Dark' }));
    expect(onThemeChange).toHaveBeenCalledTimes(1);
    expect(onThemeChange).toHaveBeenCalledWith('dark');
  });

  it('fires onThemeChange with "system" when the System radio is clicked', async () => {
    const { user, onThemeChange } = renderView({ theme: 'light' });
    const group = screen.getByRole('radiogroup', { name: 'Theme' });
    await user.click(within(group).getByRole('radio', { name: 'System' }));
    expect(onThemeChange).toHaveBeenCalledTimes(1);
    expect(onThemeChange).toHaveBeenCalledWith('system');
  });

  // ---- sidebar mode prop union ---------------------------------

  it('renders both sidebar mode options as radios with the localized labels', () => {
    renderView();
    const group = screen.getByRole('radiogroup', { name: 'Sidebar mode' });
    expect(within(group).getByRole('radio', { name: 'List' })).toBeInTheDocument();
    expect(within(group).getByRole('radio', { name: 'Tree' })).toBeInTheDocument();
    expect(within(group).getAllByRole('radio')).toHaveLength(2);
  });

  it('marks the List sidebar mode radio as checked when sidebarMode="list"', () => {
    renderView({ sidebarMode: 'list' });
    const group = screen.getByRole('radiogroup', { name: 'Sidebar mode' });
    expect(within(group).getByRole('radio', { name: 'List' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(within(group).getByRole('radio', { name: 'Tree' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('marks the Tree sidebar mode radio as checked when sidebarMode="tree"', () => {
    renderView({ sidebarMode: 'tree' });
    const group = screen.getByRole('radiogroup', { name: 'Sidebar mode' });
    expect(within(group).getByRole('radio', { name: 'Tree' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(within(group).getByRole('radio', { name: 'List' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  // ---- sidebar mode callback -----------------------------------

  it('fires onSidebarModeChange with "tree" when the Tree radio is clicked from list state', async () => {
    const { user, onSidebarModeChange } = renderView({ sidebarMode: 'list' });
    const group = screen.getByRole('radiogroup', { name: 'Sidebar mode' });
    await user.click(within(group).getByRole('radio', { name: 'Tree' }));
    expect(onSidebarModeChange).toHaveBeenCalledTimes(1);
    expect(onSidebarModeChange).toHaveBeenCalledWith('tree');
  });

  it('fires onSidebarModeChange with "list" when the List radio is clicked from tree state', async () => {
    const { user, onSidebarModeChange } = renderView({ sidebarMode: 'tree' });
    const group = screen.getByRole('radiogroup', { name: 'Sidebar mode' });
    await user.click(within(group).getByRole('radio', { name: 'List' }));
    expect(onSidebarModeChange).toHaveBeenCalledTimes(1);
    expect(onSidebarModeChange).toHaveBeenCalledWith('list');
  });

  // ---- detail mode prop union ----------------------------------

  it('renders all three detail mode options as radios with the localized labels', () => {
    renderView();
    const group = screen.getByRole('radiogroup', { name: 'Detail view' });
    expect(
      within(group).getByRole('radio', { name: 'Terminal' }),
    ).toBeInTheDocument();
    expect(within(group).getByRole('radio', { name: 'Chat' })).toBeInTheDocument();
    expect(
      within(group).getByRole('radio', { name: 'Control' }),
    ).toBeInTheDocument();
  });

  it('marks the Terminal radio as checked when detailMode="terminal"', () => {
    renderView({ detailMode: 'terminal' });
    const group = screen.getByRole('radiogroup', { name: 'Detail view' });
    expect(
      within(group).getByRole('radio', { name: 'Terminal' }),
    ).toHaveAttribute('aria-checked', 'true');
  });

  it('marks the Chat radio as checked when detailMode="chat"', () => {
    renderView({ detailMode: 'chat' });
    const group = screen.getByRole('radiogroup', { name: 'Detail view' });
    expect(within(group).getByRole('radio', { name: 'Chat' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('marks the Control radio as checked when detailMode="control"', () => {
    renderView({ detailMode: 'control' });
    const group = screen.getByRole('radiogroup', { name: 'Detail view' });
    expect(
      within(group).getByRole('radio', { name: 'Control' }),
    ).toHaveAttribute('aria-checked', 'true');
  });

  // ---- detail mode callback ------------------------------------

  it('fires onDetailModeChange with "chat" when the Chat radio is clicked', async () => {
    const { user, onDetailModeChange } = renderView({ detailMode: 'terminal' });
    const group = screen.getByRole('radiogroup', { name: 'Detail view' });
    await user.click(within(group).getByRole('radio', { name: 'Chat' }));
    expect(onDetailModeChange).toHaveBeenCalledTimes(1);
    expect(onDetailModeChange).toHaveBeenCalledWith('chat');
  });

  it('fires onDetailModeChange with "control" when the Control radio is clicked', async () => {
    const { user, onDetailModeChange } = renderView({ detailMode: 'terminal' });
    const group = screen.getByRole('radiogroup', { name: 'Detail view' });
    await user.click(within(group).getByRole('radio', { name: 'Control' }));
    expect(onDetailModeChange).toHaveBeenCalledTimes(1);
    expect(onDetailModeChange).toHaveBeenCalledWith('control');
  });

  it('fires onDetailModeChange with "terminal" when the Terminal radio is clicked from chat state', async () => {
    const { user, onDetailModeChange } = renderView({ detailMode: 'chat' });
    const group = screen.getByRole('radiogroup', { name: 'Detail view' });
    await user.click(within(group).getByRole('radio', { name: 'Terminal' }));
    expect(onDetailModeChange).toHaveBeenCalledTimes(1);
    expect(onDetailModeChange).toHaveBeenCalledWith('terminal');
  });

  // ---- reset button --------------------------------------------

  it('renders the localized Reset button with the "Reset to defaults" label', () => {
    renderView();
    expect(
      screen.getByRole('button', { name: 'Reset to defaults' }),
    ).toBeInTheDocument();
  });

  it('disables the Reset button when all three preferences sit at defaults', () => {
    renderView({
      theme: DEFAULT_THEME,
      sidebarMode: DEFAULT_SIDEBAR_MODE,
      detailMode: DEFAULT_DETAIL_MODE,
    });
    expect(
      screen.getByRole('button', { name: 'Reset to defaults' }),
    ).toBeDisabled();
  });

  it('enables the Reset button when only theme deviates from the default', () => {
    renderView({ theme: 'light' });
    expect(
      screen.getByRole('button', { name: 'Reset to defaults' }),
    ).toBeEnabled();
  });

  it('enables the Reset button when only sidebarMode deviates from the default', () => {
    renderView({ sidebarMode: 'tree' });
    expect(
      screen.getByRole('button', { name: 'Reset to defaults' }),
    ).toBeEnabled();
  });

  it('enables the Reset button when only detailMode deviates from the default', () => {
    renderView({ detailMode: 'chat' });
    expect(
      screen.getByRole('button', { name: 'Reset to defaults' }),
    ).toBeEnabled();
  });

  it('marks the Reset button with type="button" (form-safe)', () => {
    renderView();
    expect(
      screen.getByRole('button', { name: 'Reset to defaults' }),
    ).toHaveAttribute('type', 'button');
  });

  // ---- status copy ---------------------------------------------

  it('renders the "Using defaults" status copy when every preference is at its default', () => {
    renderView();
    expect(screen.getByText('Using defaults')).toBeInTheDocument();
  });

  it('renders the "Custom preferences active" status copy when any preference deviates', () => {
    renderView({ theme: 'light' });
    expect(screen.getByText('Custom preferences active')).toBeInTheDocument();
  });

  it('drops the "Using defaults" copy when a preference deviates', () => {
    renderView({ detailMode: 'chat' });
    expect(screen.queryByText('Using defaults')).not.toBeInTheDocument();
  });

  it('drops the "Custom preferences active" copy when every preference is at its default', () => {
    renderView();
    expect(
      screen.queryByText('Custom preferences active'),
    ).not.toBeInTheDocument();
  });

  // ---- reset behaviour -----------------------------------------

  it('calls resetPreferences then onReset exactly once when the Reset button is clicked', async () => {
    const { user, onReset } = renderView({ theme: 'light' });
    await user.click(
      screen.getByRole('button', { name: 'Reset to defaults' }),
    );
    expect(resetPreferencesMock).toHaveBeenCalledTimes(1);
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire onReset or resetPreferences on initial render', () => {
    const { onReset } = renderView({ theme: 'light' });
    expect(onReset).not.toHaveBeenCalled();
    expect(resetPreferencesMock).not.toHaveBeenCalled();
  });

  it('does NOT fire onReset when the Reset button is clicked while disabled (defaults)', async () => {
    const { user, onReset } = renderView();
    const btn = screen.getByRole('button', { name: 'Reset to defaults' });
    expect(btn).toBeDisabled();
    await user.click(btn);
    expect(onReset).not.toHaveBeenCalled();
    expect(resetPreferencesMock).not.toHaveBeenCalled();
  });

  // ---- radio button shape --------------------------------------

  it('marks every option radio with type="button" to prevent default form submission', () => {
    renderView();
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).toHaveAttribute('type', 'button');
    }
  });

  it('marks every icon inside an option radio with aria-hidden="true"', () => {
    const { container } = renderView();
    const iconsInRadios = container.querySelectorAll(
      '[role="radio"] svg[aria-hidden="true"]',
    );
    expect(iconsInRadios.length).toBe(8);
  });

  it('marks the reset button icon with aria-hidden="true"', () => {
    renderView();
    const btn = screen.getByRole('button', { name: 'Reset to defaults' });
    const icon = btn.querySelector('svg');
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });

  // ---- keyboard handling --------------------------------------

  it('lands the first Tab on the Light theme radio (start of focus order)', async () => {
    const { user } = renderView();
    await user.tab();
    const group = screen.getByRole('radiogroup', { name: 'Theme' });
    expect(within(group).getByRole('radio', { name: 'Light' })).toHaveFocus();
  });

  it('advances focus from Light to Dark to System inside the theme group on Tab', async () => {
    const { user } = renderView();
    await user.tab();
    await user.tab();
    const group = screen.getByRole('radiogroup', { name: 'Theme' });
    expect(within(group).getByRole('radio', { name: 'Dark' })).toHaveFocus();
    await user.tab();
    expect(within(group).getByRole('radio', { name: 'System' })).toHaveFocus();
  });

  it('crosses from the theme group into the sidebar mode group on Tab', async () => {
    const { user } = renderView();
    await user.tab(); // Light
    await user.tab(); // Dark
    await user.tab(); // System
    await user.tab(); // sidebar List
    const group = screen.getByRole('radiogroup', { name: 'Sidebar mode' });
    expect(within(group).getByRole('radio', { name: 'List' })).toHaveFocus();
  });

  it('activates a focused radio via the Enter key and fires its setter', async () => {
    const { user, onThemeChange } = renderView({ theme: 'dark' });
    const group = screen.getByRole('radiogroup', { name: 'Theme' });
    const light = within(group).getByRole('radio', { name: 'Light' });
    light.focus();
    await user.keyboard('{Enter}');
    expect(onThemeChange).toHaveBeenCalledWith('light');
  });

  it('activates a focused radio via the Space key and fires its setter', async () => {
    const { user, onSidebarModeChange } = renderView({ sidebarMode: 'list' });
    const group = screen.getByRole('radiogroup', { name: 'Sidebar mode' });
    const tree = within(group).getByRole('radio', { name: 'Tree' });
    tree.focus();
    await user.keyboard(' ');
    expect(onSidebarModeChange).toHaveBeenCalledWith('tree');
  });

  // ---- rerender / memoization stability -----------------------

  it('rerendering with identical props does not duplicate the radio buttons', () => {
    const { rerender, props } = renderView();
    rerender(<SettingsView {...props} />);
    expect(screen.getAllByRole('radio')).toHaveLength(8);
  });

  it('rerendering with identical props does not duplicate the Reset button', () => {
    const { rerender, props } = renderView({ theme: 'light' });
    rerender(<SettingsView {...props} />);
    expect(
      screen.getAllByRole('button', { name: 'Reset to defaults' }),
    ).toHaveLength(1);
  });

  it('flips aria-checked across the theme group on rerender when the theme prop changes', () => {
    const { rerender, props } = renderView({ theme: 'dark' });
    const group = screen.getByRole('radiogroup', { name: 'Theme' });
    expect(within(group).getByRole('radio', { name: 'Dark' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    rerender(<SettingsView {...props} theme="light" />);
    expect(within(group).getByRole('radio', { name: 'Dark' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(within(group).getByRole('radio', { name: 'Light' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('flips the Reset button disabled state on rerender when the prop trio moves off defaults', () => {
    const { rerender, props } = renderView();
    expect(
      screen.getByRole('button', { name: 'Reset to defaults' }),
    ).toBeDisabled();
    rerender(<SettingsView {...props} theme="light" />);
    expect(
      screen.getByRole('button', { name: 'Reset to defaults' }),
    ).toBeEnabled();
  });

  it('rerendering with a different onReset rebinds the Reset click target', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender, props } = renderView({ theme: 'light', onReset: first });
    rerender(<SettingsView {...props} onReset={second} />);
    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: 'Reset to defaults' }),
    );
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('rerendering with a different onThemeChange rebinds the radio click target', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender, props } = renderView({
      theme: 'dark',
      onThemeChange: first,
    });
    rerender(<SettingsView {...props} onThemeChange={second} />);
    const user = userEvent.setup();
    const group = screen.getByRole('radiogroup', { name: 'Theme' });
    await user.click(within(group).getByRole('radio', { name: 'Light' }));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledWith('light');
  });

  it('flips status copy across rerenders as preferences move on and off defaults', () => {
    const { rerender, props } = renderView();
    expect(screen.getByText('Using defaults')).toBeInTheDocument();
    rerender(<SettingsView {...props} sidebarMode="tree" />);
    expect(screen.getByText('Custom preferences active')).toBeInTheDocument();
    expect(screen.queryByText('Using defaults')).not.toBeInTheDocument();
    rerender(<SettingsView {...props} sidebarMode={DEFAULT_SIDEBAR_MODE} />);
    expect(screen.getByText('Using defaults')).toBeInTheDocument();
    expect(
      screen.queryByText('Custom preferences active'),
    ).not.toBeInTheDocument();
  });

  // ---- locale flip --------------------------------------------

  it('re-renders the card title when the locale flips to ko (English text disappears)', () => {
    renderView();
    expect(screen.getByText('Settings')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('Settings')).not.toBeInTheDocument();
  });

  it('re-renders the Reset button label when the locale flips to ko', () => {
    renderView();
    expect(
      screen.getByRole('button', { name: 'Reset to defaults' }),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByRole('button', { name: 'Reset to defaults' }),
    ).not.toBeInTheDocument();
  });

  it('re-renders the radiogroup aria-labels when the locale flips to ko', () => {
    renderView();
    expect(
      screen.getByRole('radiogroup', { name: 'Theme' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radiogroup', { name: 'Sidebar mode' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radiogroup', { name: 'Detail view' }),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByRole('radiogroup', { name: 'Theme' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('radiogroup', { name: 'Sidebar mode' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('radiogroup', { name: 'Detail view' }),
    ).not.toBeInTheDocument();
  });

  it('re-renders the status copy when the locale flips to ko', () => {
    renderView();
    expect(screen.getByText('Using defaults')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('Using defaults')).not.toBeInTheDocument();
  });

  it('re-renders the panel section headings when the locale flips to ko', () => {
    renderView();
    expect(
      screen.getByRole('heading', { name: 'Appearance' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Layout' }),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByRole('heading', { name: 'Appearance' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Layout' }),
    ).not.toBeInTheDocument();
  });
});
