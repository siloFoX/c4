import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Settings from './Settings';
import { LOCALE_KEY } from '../lib/i18n';

// (patch 11.199) Settings landing page tests. The page is a thin
// consolidation layer that REFERENCES or EMBEDS already-shipped controls,
// so the assertions focus on the tab strip wiring, the localStorage
// round-trip for the Locale radio group, the embedded FeatureFlags page,
// and the presence of summary content on the General tab. Strings inside
// panel bodies are inline English (Notifications.tsx precedent); only the
// page title / description go through i18n.

const TAB_LABELS = [
  'General',
  'Theme',
  'Density',
  'Scribe',
  'Notifications',
  'Locale',
  'Feature Flags',
] as const;

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe('Settings page', () => {
  it('renders all 7 tab triggers in the consolidated landing strip', () => {
    render(<Settings />);
    const tablist = screen.getByRole('tablist', { name: 'Settings sections' });
    for (const label of TAB_LABELS) {
      const trigger = within(tablist).getByRole('tab', { name: label });
      expect(trigger).toBeInTheDocument();
    }
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs).toHaveLength(TAB_LABELS.length);
  });

  it('starts on the General tab and renders a non-empty summary panel', () => {
    render(<Settings />);
    const general = screen.getByRole('tab', { name: 'General' });
    expect(general).toHaveAttribute('aria-selected', 'true');
    // General tab body references the Config page surface inline so the
    // panel is never empty when the page first mounts.
    expect(screen.getByText(/Live daemon config sans secrets/i)).toBeInTheDocument();
    expect(screen.getByTestId('settings-general-config-link')).toBeInTheDocument();
  });

  it('switches the active panel when a different tab is clicked', async () => {
    const user = userEvent.setup();
    render(<Settings />);
    expect(screen.getByRole('tab', { name: 'General' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await user.click(screen.getByRole('tab', { name: 'Theme' }));
    expect(screen.getByRole('tab', { name: 'Theme' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByTestId('settings-theme-current')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Locale' }));
    expect(screen.getByRole('tab', { name: 'Locale' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('radiogroup', { name: 'Locale' })).toBeInTheDocument();
  });

  it('persists Locale selection to localStorage via the shared setLocale helper', async () => {
    const user = userEvent.setup();
    render(<Settings />);

    await user.click(screen.getByRole('tab', { name: 'Locale' }));
    const koRadio = screen.getByTestId('settings-locale-radio-ko');
    await user.click(koRadio);

    expect(window.localStorage.getItem(LOCALE_KEY)).toBe('ko');

    await user.click(screen.getByTestId('settings-locale-radio-en'));
    expect(window.localStorage.getItem(LOCALE_KEY)).toBe('en');
  });

  it('embeds the existing FeatureFlags page (Grid Debug Overlay row visible)', async () => {
    const user = userEvent.setup();
    render(<Settings />);
    await user.click(screen.getByRole('tab', { name: 'Feature Flags' }));
    // FeatureFlags.tsx renders one Panel per flag; the gridDebug row's
    // label is the human-readable "Grid Debug Overlay" string from
    // lib/feature-flags.ts. Finding it here confirms the inline embed
    // resolved the lazy <FeatureFlags /> page, not just the tab trigger.
    const embed = screen.getByTestId('settings-feature-flags-embed');
    expect(within(embed).getByText('Grid Debug Overlay')).toBeInTheDocument();
    expect(
      within(embed).getByRole('button', { name: 'Reset' }),
    ).toBeInTheDocument();
  });

  it('renders summary text on Scribe and Notifications tabs', async () => {
    const user = userEvent.setup();
    render(<Settings />);

    await user.click(screen.getByRole('tab', { name: 'Scribe' }));
    expect(
      screen.getByText(/Session context recorder/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Notifications' }));
    expect(
      screen.getByText(/Lifecycle feed for dispatch/i),
    ).toBeInTheDocument();
  });
});
