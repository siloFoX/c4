import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// LocaleSwitcher is a thin wrapper around the DropdownMenu primitive
// (its own unit tests cover click-outside / keyboard plumbing) so
// these tests focus on the behaviour LocaleSwitcher itself owns:
// trigger label, menu contents, active mark, and the
// localStorage + c4:locale-changed side effects of selection.

import LocaleSwitcher, {
  LOCALE_NATIVE_LABELS,
  LOCALE_SWITCHER_ARIA,
} from './LocaleSwitcher';
import {
  LOCALE_KEY,
  getLocale,
  setLocale,
  t,
} from '../lib/i18n';

beforeEach(() => {
  // Reset both the i18n module state and the localStorage shim so
  // each test sees a deterministic English baseline.
  try {
    window.localStorage.removeItem(LOCALE_KEY);
  } catch {
    // private mode -- ignore
  }
  setLocale('en');
});

function getTrigger(): HTMLElement {
  return screen.getByRole('button', { name: t(LOCALE_SWITCHER_ARIA) });
}

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(getTrigger());
  return screen.getByRole('menu');
}

describe('<LocaleSwitcher>', () => {
  it('renders the trigger with the Globe icon and uppercase locale code', () => {
    render(<LocaleSwitcher />);
    const trigger = getTrigger();
    expect(trigger).toHaveAttribute('data-locale', 'en');
    // The locale code is rendered uppercase next to the Globe icon.
    expect(within(trigger).getByText('en')).toBeInTheDocument();
  });

  it('opens the menu with both locale items on click', async () => {
    const user = userEvent.setup();
    render(<LocaleSwitcher />);
    await openMenu(user);
    expect(
      screen.getByRole('menuitem', { name: new RegExp(LOCALE_NATIVE_LABELS.en) }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: new RegExp(LOCALE_NATIVE_LABELS.ko) }),
    ).toBeInTheDocument();
  });

  it('marks the active locale with a check icon and leaves the other row unmarked', async () => {
    const user = userEvent.setup();
    render(<LocaleSwitcher />);
    await openMenu(user);
    // Default locale = en, so only the English row carries the check.
    expect(screen.getByTestId('locale-check-en')).toBeInTheDocument();
    expect(screen.queryByTestId('locale-check-ko')).not.toBeInTheDocument();
  });

  it('flips the active locale and persists to localStorage when the other row is selected', async () => {
    const user = userEvent.setup();
    render(<LocaleSwitcher />);
    await openMenu(user);
    await user.click(
      screen.getByRole('menuitem', { name: new RegExp(LOCALE_NATIVE_LABELS.ko) }),
    );
    expect(getLocale()).toBe('ko');
    expect(window.localStorage.getItem(LOCALE_KEY)).toBe('ko');
  });

  it('does not dispatch c4:locale-changed when the already-active locale is selected', async () => {
    const user = userEvent.setup();
    const seen: string[] = [];
    const listener = (e: Event) => {
      seen.push((e as CustomEvent<string>).detail);
    };
    window.addEventListener('c4:locale-changed', listener);
    try {
      render(<LocaleSwitcher />);
      await openMenu(user);
      // Active row -> onSelect short-circuits before setLocale.
      await user.click(
        screen.getByRole('menuitem', { name: new RegExp(LOCALE_NATIVE_LABELS.en) }),
      );
      expect(seen).toEqual([]);
      expect(getLocale()).toBe('en');
    } finally {
      window.removeEventListener('c4:locale-changed', listener);
    }
  });

  it('supports keyboard navigation -- ArrowDown to highlight, Enter to select', async () => {
    const user = userEvent.setup();
    render(<LocaleSwitcher />);
    // Click to open so we don't race the trigger's Enter handler.
    await user.click(getTrigger());
    expect(screen.getByRole('menu')).toBeInTheDocument();
    // ArrowDown highlights row 0 (English). Wait for focus to land
    // (DropdownMenu defers item focus via requestAnimationFrame).
    await user.keyboard('{ArrowDown}');
    await waitFor(() => {
      expect(
        screen.getByRole('menuitem', { name: new RegExp(LOCALE_NATIVE_LABELS.en) }),
      ).toHaveFocus();
    });
    // ArrowDown moves to Korean -- wait for the rAF focus hop.
    await user.keyboard('{ArrowDown}');
    await waitFor(() => {
      expect(
        screen.getByRole('menuitem', { name: new RegExp(LOCALE_NATIVE_LABELS.ko) }),
      ).toHaveFocus();
    });
    // Enter on the focused menuitem fires its onSelect.
    await user.keyboard('{Enter}');
    expect(getLocale()).toBe('ko');
  });
});
