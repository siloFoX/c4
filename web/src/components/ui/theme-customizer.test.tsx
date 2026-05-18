import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import {
  DEFAULT_THEME_CONFIG,
  THEME_CONFIG_BOUNDS,
  THEME_CUSTOMIZER_DEFAULT_STORAGE_KEY,
  ThemeCustomizer,
  clearThemeCustomizerRoot,
  normalizeThemeConfig,
  serializeThemeConfigCss,
  serializeThemeConfigJson,
  themeConfigToCssVars,
} from './theme-customizer';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  clearThemeCustomizerRoot();
});

describe('normalizeThemeConfig', () => {
  it('returns defaults for undefined input', () => {
    expect(normalizeThemeConfig(undefined)).toEqual(DEFAULT_THEME_CONFIG);
  });

  it('returns defaults for null input', () => {
    expect(normalizeThemeConfig(null)).toEqual(DEFAULT_THEME_CONFIG);
  });

  it('fills missing fields with defaults', () => {
    expect(normalizeThemeConfig({ radius: 12 })).toEqual({
      radius: 12,
      hue: DEFAULT_THEME_CONFIG.hue,
      contrast: DEFAULT_THEME_CONFIG.contrast,
    });
  });

  it('clamps over-range values', () => {
    const result = normalizeThemeConfig({
      radius: 500,
      hue: 9999,
      contrast: 200,
    });
    expect(result.radius).toBe(THEME_CONFIG_BOUNDS.radius.max);
    expect(result.hue).toBe(THEME_CONFIG_BOUNDS.hue.max);
    expect(result.contrast).toBe(THEME_CONFIG_BOUNDS.contrast.max);
  });

  it('clamps under-range values', () => {
    const result = normalizeThemeConfig({
      radius: -10,
      hue: -50,
      contrast: -1,
    });
    expect(result.radius).toBe(THEME_CONFIG_BOUNDS.radius.min);
    expect(result.hue).toBe(THEME_CONFIG_BOUNDS.hue.min);
    expect(result.contrast).toBe(THEME_CONFIG_BOUNDS.contrast.min);
  });

  it('treats NaN as min for each field', () => {
    const result = normalizeThemeConfig({
      radius: Number.NaN,
      hue: Number.NaN,
      contrast: Number.NaN,
    });
    expect(result.radius).toBe(THEME_CONFIG_BOUNDS.radius.min);
    expect(result.hue).toBe(THEME_CONFIG_BOUNDS.hue.min);
    expect(result.contrast).toBe(THEME_CONFIG_BOUNDS.contrast.min);
  });

  it('passes through valid mid-range values unchanged', () => {
    expect(
      normalizeThemeConfig({ radius: 10, hue: 180, contrast: 50 }),
    ).toEqual({ radius: 10, hue: 180, contrast: 50 });
  });
});

describe('themeConfigToCssVars', () => {
  it('returns 13 keys for the canonical token surface', () => {
    const vars = themeConfigToCssVars(DEFAULT_THEME_CONFIG);
    const keys = Object.keys(vars);
    expect(keys).toContain('--radius-sm');
    expect(keys).toContain('--radius-md');
    expect(keys).toContain('--radius-lg');
    expect(keys).toContain('--radius-xl');
    expect(keys).toContain('--radius-2xl');
    expect(keys).toContain('--brand');
    expect(keys).toContain('--brand-hover');
    expect(keys).toContain('--brand-pressed');
    expect(keys).toContain('--brand-subtle');
    expect(keys).toContain('--text-primary');
    expect(keys).toContain('--text-secondary');
    expect(keys).toContain('--text-tertiary');
    expect(keys).toContain('--border-default');
    expect(keys).toHaveLength(13);
  });

  it('threads hue into the brand family', () => {
    const vars = themeConfigToCssVars({
      radius: 8,
      hue: 120,
      contrast: 50,
    });
    expect(vars['--brand']).toBe('120 80% 65%');
    expect(vars['--brand-hover']).toBe('120 80% 72%');
    expect(vars['--brand-pressed']).toBe('120 75% 58%');
    expect(vars['--brand-subtle']).toBe('120 50% 22%');
  });

  it('derives the radius ladder from the base value', () => {
    const vars = themeConfigToCssVars({
      radius: 8,
      hue: 264,
      contrast: 50,
    });
    expect(vars['--radius-sm']).toBe('2px');
    expect(vars['--radius-md']).toBe('4px');
    expect(vars['--radius-lg']).toBe('6px');
    expect(vars['--radius-xl']).toBe('8px');
    expect(vars['--radius-2xl']).toBe('12px');
  });

  it('raises text + border lightness when contrast goes up', () => {
    const low = themeConfigToCssVars({
      radius: 8,
      hue: 264,
      contrast: 0,
    });
    const high = themeConfigToCssVars({
      radius: 8,
      hue: 264,
      contrast: 100,
    });
    expect(low['--text-primary']).toBe('220 15% 75%');
    expect(high['--text-primary']).toBe('220 15% 100%');
    expect(low['--border-default']).toBe('220 10% 18%');
    expect(high['--border-default']).toBe('220 10% 38%');
  });

  it('normalizes over-range inputs before emitting vars', () => {
    const vars = themeConfigToCssVars({
      radius: 999,
      hue: -1,
      contrast: 500,
    });
    expect(vars['--radius-xl']).toBe(
      `${THEME_CONFIG_BOUNDS.radius.max}px`,
    );
    expect(vars['--brand']).toBe('0 80% 65%');
  });
});

describe('serializeThemeConfigCss / Json', () => {
  it('emits a :root block with every var on its own line', () => {
    const css = serializeThemeConfigCss(DEFAULT_THEME_CONFIG);
    expect(css.startsWith(':root {\n')).toBe(true);
    expect(css.endsWith('\n}')).toBe(true);
    expect(css).toContain('--brand: 264 80% 65%;');
    expect(css).toContain('--radius-xl: 8px;');
  });

  it('emits 2-space JSON with normalized values', () => {
    const json = serializeThemeConfigJson({
      radius: 999,
      hue: 90,
      contrast: 50,
    });
    expect(json).toBe(
      JSON.stringify(
        { radius: THEME_CONFIG_BOUNDS.radius.max, hue: 90, contrast: 50 },
        null,
        2,
      ),
    );
  });
});

describe('clearThemeCustomizerRoot', () => {
  it('removes the root-scoped vars from documentElement', () => {
    const root = document.documentElement;
    root.style.setProperty('--brand', '999 99% 99%');
    root.style.setProperty('--radius-xl', '99px');
    clearThemeCustomizerRoot();
    expect(root.style.getPropertyValue('--brand')).toBe('');
    expect(root.style.getPropertyValue('--radius-xl')).toBe('');
  });
});

describe('ThemeCustomizer component', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders a region with the provided aria-label', () => {
    render(<ThemeCustomizer />);
    expect(screen.getByRole('region')).toHaveAttribute(
      'aria-label',
      'Theme customizer',
    );
  });

  it('renders three sliders (Radius / Hue / Contrast)', () => {
    render(<ThemeCustomizer />);
    expect(screen.getByLabelText('Radius')).toBeInTheDocument();
    expect(screen.getByLabelText('Hue')).toBeInTheDocument();
    expect(screen.getByLabelText('Contrast')).toBeInTheDocument();
  });

  it('starts at the default config when nothing is supplied', () => {
    render(<ThemeCustomizer />);
    const region = screen.getByRole('region');
    expect(region).toHaveAttribute('data-radius', '8');
    expect(region).toHaveAttribute('data-hue', '264');
    expect(region).toHaveAttribute('data-contrast', '50');
  });

  it('honors an explicit initialConfig prop', () => {
    render(
      <ThemeCustomizer
        initialConfig={{ radius: 4, hue: 50, contrast: 80 }}
      />,
    );
    const region = screen.getByRole('region');
    expect(region).toHaveAttribute('data-radius', '4');
    expect(region).toHaveAttribute('data-hue', '50');
    expect(region).toHaveAttribute('data-contrast', '80');
  });

  it('reads from localStorage when storageKey is supplied', () => {
    window.localStorage.setItem(
      'c4:test',
      JSON.stringify({ radius: 12, hue: 200, contrast: 30 }),
    );
    render(<ThemeCustomizer storageKey="c4:test" />);
    const region = screen.getByRole('region');
    expect(region).toHaveAttribute('data-radius', '12');
    expect(region).toHaveAttribute('data-hue', '200');
    expect(region).toHaveAttribute('data-contrast', '30');
  });

  it('falls back to defaults when stored JSON is malformed', () => {
    window.localStorage.setItem('c4:test', '{not json');
    render(
      <ThemeCustomizer
        storageKey="c4:test"
        initialConfig={{ radius: 16, hue: 100, contrast: 70 }}
      />,
    );
    const region = screen.getByRole('region');
    // bad JSON -> fall back to initialConfig (not stored)
    expect(region).toHaveAttribute('data-radius', '16');
    expect(region).toHaveAttribute('data-hue', '100');
    expect(region).toHaveAttribute('data-contrast', '70');
  });

  it('falls back to defaults when storageKey is missing entirely', () => {
    render(<ThemeCustomizer storageKey="c4:does-not-exist" />);
    const region = screen.getByRole('region');
    expect(region).toHaveAttribute('data-radius', '8');
  });

  it('updates state when the radius slider changes', () => {
    render(<ThemeCustomizer />);
    const slider = screen.getByLabelText('Radius') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '16' } });
    expect(screen.getByRole('region')).toHaveAttribute(
      'data-radius',
      '16',
    );
  });

  it('updates state when the hue slider changes', () => {
    render(<ThemeCustomizer />);
    const slider = screen.getByLabelText('Hue') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '180' } });
    expect(screen.getByRole('region')).toHaveAttribute(
      'data-hue',
      '180',
    );
  });

  it('updates state when the contrast slider changes', () => {
    render(<ThemeCustomizer />);
    const slider = screen.getByLabelText('Contrast') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '85' } });
    expect(screen.getByRole('region')).toHaveAttribute(
      'data-contrast',
      '85',
    );
  });

  it('fires onChange after a slider change', () => {
    const onChange = vi.fn();
    render(<ThemeCustomizer onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Hue'), {
      target: { value: '120' },
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    const arg = onChange.mock.calls[0]?.[0];
    expect(arg?.hue).toBe(120);
  });

  it('does NOT fire onChange on initial mount', () => {
    const onChange = vi.fn();
    render(
      <ThemeCustomizer
        initialConfig={{ radius: 10 }}
        onChange={onChange}
      />,
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('applies CSS vars as inline style when target="scope"', () => {
    render(
      <ThemeCustomizer
        target="scope"
        initialConfig={{ radius: 12, hue: 90, contrast: 100 }}
      />,
    );
    const region = screen.getByRole('region') as HTMLElement;
    expect(region.style.getPropertyValue('--brand')).toBe('90 80% 65%');
    expect(region.style.getPropertyValue('--radius-xl')).toBe('12px');
  });

  it('applies CSS vars to documentElement when target="root"', () => {
    render(
      <ThemeCustomizer
        target="root"
        initialConfig={{ radius: 6, hue: 30, contrast: 50 }}
      />,
    );
    const root = document.documentElement;
    expect(root.style.getPropertyValue('--brand')).toBe('30 80% 65%');
    expect(root.style.getPropertyValue('--radius-xl')).toBe('6px');
  });

  it('writes config to localStorage on every change', () => {
    render(<ThemeCustomizer storageKey="c4:test" />);
    fireEvent.change(screen.getByLabelText('Radius'), {
      target: { value: '20' },
    });
    const stored = window.localStorage.getItem('c4:test');
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored!)).toMatchObject({ radius: 20 });
  });

  it('Reset button restores DEFAULT_THEME_CONFIG', () => {
    render(
      <ThemeCustomizer
        initialConfig={{ radius: 16, hue: 60, contrast: 80 }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }));
    const region = screen.getByRole('region');
    expect(region).toHaveAttribute('data-radius', '8');
    expect(region).toHaveAttribute('data-hue', '264');
    expect(region).toHaveAttribute('data-contrast', '50');
  });

  it('Copy button writes serialized CSS to navigator.clipboard', async () => {
    const writeText = vi.fn((_text: string) => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    });
    render(<ThemeCustomizer exportFormat="css" />);
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Copy CSS to clipboard' }),
      );
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    const calls = writeText.mock.calls;
    const text = calls[0]?.[0] ?? '';
    expect(text).toContain(':root {');
    expect(text).toContain('--brand: 264 80% 65%;');
  });

  it('Copy button writes serialized JSON when exportFormat="json"', async () => {
    const writeText = vi.fn((_text: string) => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    });
    render(<ThemeCustomizer exportFormat="json" />);
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Copy JSON to clipboard' }),
      );
    });
    const calls = writeText.mock.calls;
    const text = calls[0]?.[0] ?? '';
    expect(text.startsWith('{')).toBe(true);
    expect(text).toContain('"radius": 8');
  });

  it('fires onExport with the serialized text', async () => {
    const onExport = vi.fn();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(() => Promise.resolve()) },
      configurable: true,
      writable: true,
    });
    render(<ThemeCustomizer onExport={onExport} />);
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Copy CSS to clipboard' }),
      );
    });
    expect(onExport).toHaveBeenCalledTimes(1);
    const [text, format] = onExport.mock.calls[0] ?? [];
    expect(format).toBe('css');
    expect(text).toContain(':root {');
  });

  it('flips the copy button label after writeText resolves', async () => {
    vi.useFakeTimers();
    let resolveWrite: () => void = () => {};
    const writeText = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveWrite = resolve;
        }),
    );
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    });
    render(<ThemeCustomizer copyFeedbackMs={500} />);
    const button = screen.getByRole('button', {
      name: 'Copy CSS to clipboard',
    });
    fireEvent.click(button);
    await act(async () => {
      resolveWrite();
      await Promise.resolve();
    });
    expect(button.textContent).toBe('Copied!');
    expect(button).toHaveAttribute('data-copied', 'true');
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(button.textContent).toBe('Copy CSS');
    expect(button).toHaveAttribute('data-copied', 'false');
    vi.useRealTimers();
  });

  it('falls back to onExport when clipboard.writeText is missing', async () => {
    const onExport = vi.fn();
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    render(<ThemeCustomizer onExport={onExport} />);
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Copy CSS to clipboard' }),
      );
    });
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it('renders preview swatch + label + button', () => {
    const { container } = render(<ThemeCustomizer />);
    expect(
      container.querySelector(
        '[data-section="theme-customizer-preview-brand"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '[data-section="theme-customizer-preview-label"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '[data-section="theme-customizer-preview-button"]',
      ),
    ).toBeInTheDocument();
  });

  it('exposes data-section + data-target on the root', () => {
    const { container } = render(<ThemeCustomizer target="root" />);
    const root = container.querySelector(
      '[data-section="theme-customizer"]',
    );
    expect(root).toBeInTheDocument();
    expect(root).toHaveAttribute('data-target', 'root');
  });

  it('every control row carries data-control-key', () => {
    const { container } = render(<ThemeCustomizer />);
    const controlKeys = Array.from(
      container.querySelectorAll(
        '[data-section="theme-customizer-control"]',
      ),
    ).map((el) => el.getAttribute('data-control-key'));
    expect(controlKeys).toEqual(['radius', 'hue', 'contrast']);
  });

  it('every control input carries data-control-input matching key', () => {
    const { container } = render(<ThemeCustomizer />);
    const inputs = container.querySelectorAll('[data-control-input]');
    expect(inputs).toHaveLength(3);
    expect(inputs[0]?.getAttribute('data-control-input')).toBe('radius');
    expect(inputs[1]?.getAttribute('data-control-input')).toBe('hue');
    expect(inputs[2]?.getAttribute('data-control-input')).toBe('contrast');
  });

  it('renders the current value beside each slider', () => {
    const { container } = render(
      <ThemeCustomizer initialConfig={{ radius: 12, hue: 180, contrast: 70 }} />,
    );
    const valueNodes = Array.from(
      container.querySelectorAll('[data-control-value]'),
    );
    expect(valueNodes[0]?.textContent).toBe('12px');
    expect(valueNodes[1]?.textContent).toBe('180');
    expect(valueNodes[2]?.textContent).toBe('70');
  });

  it('exposes a stable displayName', () => {
    expect(ThemeCustomizer.displayName).toBe('ThemeCustomizer');
  });

  it('exports the default storage key constant', () => {
    expect(THEME_CUSTOMIZER_DEFAULT_STORAGE_KEY).toBe(
      'c4:theme-customizer',
    );
  });

  it('clamps slider values that arrive out of range via fireEvent', () => {
    render(<ThemeCustomizer />);
    const slider = screen.getByLabelText('Radius');
    fireEvent.change(slider, { target: { value: '500' } });
    // Even if a programmatic change tries to exceed max, the clamp
    // in the change handler keeps the data attr at the max bound.
    expect(screen.getByRole('region')).toHaveAttribute(
      'data-radius',
      String(THEME_CONFIG_BOUNDS.radius.max),
    );
  });
});
