import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import KeyboardMap from './KeyboardMap';
import { FEATURES } from './registry';
import { setLocale } from '../lib/i18n';

describe('KeyboardMap page', () => {
  beforeEach(() => {
    setLocale('en');
  });

  it('renders the page title', () => {
    render(<KeyboardMap />);
    expect(screen.getAllByText('Keyboard Map').length).toBeGreaterThan(0);
  });

  it('renders at least one keyboard combo using the Kbd primitive', () => {
    const { container } = render(<KeyboardMap />);
    const kbds = container.querySelectorAll('kbd');
    expect(kbds.length).toBeGreaterThan(0);
  });

  it('filters rows by label substring via the search bar', () => {
    const { container } = render(<KeyboardMap />);
    const input = container.querySelector(
      'input[data-keyboard-map-filter]',
    ) as HTMLInputElement;
    expect(input).toBeTruthy();
    act(() => {
      fireEvent.change(input, { target: { value: 'sidebar' } });
    });
    const labels = Array.from(container.querySelectorAll('td')).map(
      (n) => n.textContent ?? '',
    );
    expect(labels.some((l) => /sidebar/i.test(l))).toBe(true);
    expect(labels.some((l) => /send chat/i.test(l))).toBe(false);
  });

  it('filters rows by key combo', () => {
    const { container } = render(<KeyboardMap />);
    const input = container.querySelector(
      'input[data-keyboard-map-filter]',
    ) as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value: 'Ctrl+]' } });
    });
    const kbdText = Array.from(container.querySelectorAll('kbd')).map(
      (n) => n.textContent ?? '',
    );
    expect(kbdText).toContain('Ctrl+]');
    expect(kbdText).not.toContain('Ctrl+B');
  });

  it('shows every section when the filter is empty', () => {
    const { container } = render(<KeyboardMap />);
    const sections = container.querySelectorAll('[data-keyboard-map-section]');
    expect(sections.length).toBeGreaterThanOrEqual(4);
  });

  it('renders the empty state when no rows match', () => {
    const { container } = render(<KeyboardMap />);
    const input = container.querySelector(
      'input[data-keyboard-map-filter]',
    ) as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value: 'zzz-no-such-binding' } });
    });
    expect(screen.getByTestId('keyboard-map-empty')).toBeTruthy();
    expect(container.querySelectorAll('kbd').length).toBe(0);
  });

  it('registers a "keyboard-map" feature so the Features sidebar shows it', () => {
    const entry = FEATURES.find((f) => f.id === 'keyboard-map');
    expect(entry).toBeTruthy();
    expect(entry?.category).toBe('config');
    expect(entry?.labelKey).toBe('feature.keyboardMap.label');
  });
});
