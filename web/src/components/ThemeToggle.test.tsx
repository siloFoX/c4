import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ThemeToggle from './ThemeToggle';

function installMatchMedia(initialDark = false): void {
  const mql = {
    matches: initialDark,
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => true,
  };
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockReturnValue(mql),
  });
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.classList.remove('dark');
  document.documentElement.removeAttribute('data-theme');
  installMatchMedia(false);
});

describe('ThemeToggle cycle variant', () => {
  it('renders a button with aria-label', () => {
    render(<ThemeToggle />);
    const btn = screen.getByRole('button', { name: 'Toggle theme' });
    expect(btn).toBeInTheDocument();
  });

  it('cycles system -> light -> dark -> system', () => {
    render(<ThemeToggle />);
    const btn = screen.getByRole('button', { name: 'Toggle theme' });
    expect(screen.getByTestId('theme-icon-system')).toBeInTheDocument();
    fireEvent.click(btn);
    expect(screen.getByTestId('theme-icon-light')).toBeInTheDocument();
    fireEvent.click(btn);
    expect(screen.getByTestId('theme-icon-dark')).toBeInTheDocument();
    fireEvent.click(btn);
    expect(screen.getByTestId('theme-icon-system')).toBeInTheDocument();
  });

  it('icon reflects stored theme on mount', () => {
    window.localStorage.setItem('c4:theme', 'dark');
    render(<ThemeToggle />);
    expect(screen.getByTestId('theme-icon-dark')).toBeInTheDocument();
  });

  it('merges className', () => {
    render(<ThemeToggle className="custom-x" />);
    const btn = screen.getByRole('button', { name: 'Toggle theme' });
    expect(btn.className).toContain('custom-x');
  });
});

describe('ThemeToggle group variant', () => {
  it('renders 3 buttons (system / light / dark)', () => {
    render(<ThemeToggle variant="group" />);
    expect(screen.getByRole('button', { name: 'System' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Light' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dark' })).toBeInTheDocument();
  });

  it('click on a specific theme sets that theme', () => {
    render(<ThemeToggle variant="group" />);
    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));
    expect(window.localStorage.getItem('c4:theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Light' }));
    expect(window.localStorage.getItem('c4:theme')).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('marks the active theme with aria-pressed', () => {
    window.localStorage.setItem('c4:theme', 'light');
    render(<ThemeToggle variant="group" />);
    expect(
      screen.getByRole('button', { name: 'Light' }).getAttribute('aria-pressed')
    ).toBe('true');
    expect(
      screen.getByRole('button', { name: 'Dark' }).getAttribute('aria-pressed')
    ).toBe('false');
  });
});
