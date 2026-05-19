import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { createRef } from 'react';
import {
  ColorPicker,
  DEFAULT_COLOR_PRESETS,
  DEFAULT_COLOR_VALUE,
  formatColor,
  formatHex,
  formatHsl,
  formatRgb,
  hslToRgb,
  normalizeColorValue,
  parseColor,
  parseHex,
  parseHsl,
  parseRgb,
  rgbToHsl,
} from './color-picker';

afterEach(() => {
  cleanup();
});

describe('normalizeColorValue', () => {
  it('returns defaults for null / undefined', () => {
    expect(normalizeColorValue(null)).toEqual(DEFAULT_COLOR_VALUE);
    expect(normalizeColorValue(undefined)).toEqual(DEFAULT_COLOR_VALUE);
  });

  it('clamps s/l/a out-of-range', () => {
    expect(
      normalizeColorValue({ h: 0, s: 500, l: -10, a: 2 }),
    ).toEqual({ h: 0, s: 100, l: 0, a: 1 });
  });

  it('wraps hue around 360', () => {
    expect(normalizeColorValue({ h: 365 }).h).toBe(5);
    expect(normalizeColorValue({ h: -10 }).h).toBe(350);
  });

  it('passes valid values through', () => {
    expect(
      normalizeColorValue({ h: 180, s: 50, l: 50, a: 0.5 }),
    ).toEqual({ h: 180, s: 50, l: 50, a: 0.5 });
  });
});

describe('hslToRgb', () => {
  it('white at l=100', () => {
    expect(hslToRgb(0, 0, 100)).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('black at l=0', () => {
    expect(hslToRgb(0, 100, 0)).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('gray when s=0', () => {
    expect(hslToRgb(180, 0, 50)).toEqual({ r: 128, g: 128, b: 128 });
  });

  it('pure red at h=0, s=100, l=50', () => {
    expect(hslToRgb(0, 100, 50)).toEqual({ r: 255, g: 0, b: 0 });
  });

  it('pure green at h=120', () => {
    expect(hslToRgb(120, 100, 50)).toEqual({ r: 0, g: 255, b: 0 });
  });

  it('pure blue at h=240', () => {
    expect(hslToRgb(240, 100, 50)).toEqual({ r: 0, g: 0, b: 255 });
  });
});

describe('rgbToHsl', () => {
  it('white -> hsl(0, 0, 100)', () => {
    expect(rgbToHsl(255, 255, 255)).toEqual({ h: 0, s: 0, l: 100 });
  });

  it('black -> hsl(0, 0, 0)', () => {
    expect(rgbToHsl(0, 0, 0)).toEqual({ h: 0, s: 0, l: 0 });
  });

  it('pure red -> hsl(0, 100, 50)', () => {
    expect(rgbToHsl(255, 0, 0)).toEqual({ h: 0, s: 100, l: 50 });
  });

  it('pure green -> hsl(120, 100, 50)', () => {
    expect(rgbToHsl(0, 255, 0)).toEqual({ h: 120, s: 100, l: 50 });
  });

  it('round-trips hsl -> rgb -> hsl for a non-edge color', () => {
    const rgb = hslToRgb(180, 50, 60);
    const back = rgbToHsl(rgb.r, rgb.g, rgb.b);
    expect(Math.abs(back.h - 180)).toBeLessThanOrEqual(2);
    expect(Math.abs(back.s - 50)).toBeLessThanOrEqual(2);
    expect(Math.abs(back.l - 60)).toBeLessThanOrEqual(2);
  });
});

describe('parseHex', () => {
  it('parses 6-digit hex', () => {
    const v = parseHex('#ff0000');
    expect(v).not.toBeNull();
    expect(v?.h).toBe(0);
    expect(v?.s).toBe(100);
    expect(v?.l).toBe(50);
    expect(v?.a).toBe(1);
  });

  it('parses 3-digit shorthand', () => {
    const v = parseHex('#f00');
    expect(v?.s).toBe(100);
    expect(v?.l).toBe(50);
  });

  it('parses 8-digit with alpha', () => {
    const v = parseHex('#ff000080');
    expect(v?.a).toBeCloseTo(0.502, 2);
  });

  it('parses without the hash', () => {
    const v = parseHex('00ff00');
    expect(v?.h).toBe(120);
  });

  it('returns null on garbage', () => {
    expect(parseHex('hello')).toBeNull();
    expect(parseHex('#12345')).toBeNull();
    expect(parseHex('')).toBeNull();
  });
});

describe('parseRgb', () => {
  it('parses rgb(r, g, b)', () => {
    const v = parseRgb('rgb(255, 0, 0)');
    expect(v?.h).toBe(0);
    expect(v?.s).toBe(100);
    expect(v?.a).toBe(1);
  });

  it('parses rgba(r, g, b, a)', () => {
    const v = parseRgb('rgba(0, 0, 255, 0.5)');
    expect(v?.h).toBe(240);
    expect(v?.a).toBe(0.5);
  });

  it('returns null on garbage', () => {
    expect(parseRgb('hello')).toBeNull();
    expect(parseRgb('rgb()')).toBeNull();
  });
});

describe('parseHsl', () => {
  it('parses hsl(h, s%, l%)', () => {
    const v = parseHsl('hsl(180, 50%, 60%)');
    expect(v?.h).toBe(180);
    expect(v?.s).toBe(50);
    expect(v?.l).toBe(60);
    expect(v?.a).toBe(1);
  });

  it('parses hsla(h, s%, l%, a)', () => {
    const v = parseHsl('hsla(0, 100%, 50%, 0.3)');
    expect(v?.a).toBe(0.3);
  });

  it('returns null on garbage', () => {
    expect(parseHsl('hello')).toBeNull();
  });
});

describe('parseColor', () => {
  it('falls back through hex/rgb/hsl based on preferred mode', () => {
    expect(parseColor('#ff0000', 'hex')?.h).toBe(0);
    expect(parseColor('rgb(0, 255, 0)', 'rgb')?.h).toBe(120);
    expect(parseColor('hsl(240, 100%, 50%)', 'hsl')?.h).toBe(240);
  });

  it('accepts any format regardless of preferred mode', () => {
    expect(parseColor('#ff0000', 'rgb')?.h).toBe(0);
    expect(parseColor('rgb(0, 255, 0)', 'hex')?.h).toBe(120);
  });
});

describe('formatHex / formatRgb / formatHsl / formatColor', () => {
  it('formatHex emits #rrggbb for opaque', () => {
    expect(
      formatHex({ h: 0, s: 100, l: 50, a: 1 }),
    ).toBe('#ff0000');
  });

  it('formatHex emits #rrggbbaa for transparent', () => {
    expect(
      formatHex({ h: 0, s: 100, l: 50, a: 0.5 }),
    ).toBe('#ff000080');
  });

  it('formatRgb emits rgb() for opaque, rgba() for transparent', () => {
    expect(
      formatRgb({ h: 0, s: 100, l: 50, a: 1 }),
    ).toBe('rgb(255, 0, 0)');
    expect(
      formatRgb({ h: 0, s: 100, l: 50, a: 0.5 }),
    ).toBe('rgba(255, 0, 0, 0.5)');
  });

  it('formatHsl emits hsl() / hsla()', () => {
    expect(
      formatHsl({ h: 180, s: 50, l: 60, a: 1 }),
    ).toBe('hsl(180, 50%, 60%)');
    expect(
      formatHsl({ h: 180, s: 50, l: 60, a: 0.5 }),
    ).toBe('hsla(180, 50%, 60%, 0.5)');
  });

  it('formatColor dispatches by mode', () => {
    const c = { h: 0, s: 100, l: 50, a: 1 };
    expect(formatColor(c, 'hex')).toBe('#ff0000');
    expect(formatColor(c, 'rgb')).toBe('rgb(255, 0, 0)');
    expect(formatColor(c, 'hsl')).toBe('hsl(0, 100%, 50%)');
  });
});

describe('ColorPicker component', () => {
  it('renders role=group with default aria-label', () => {
    render(<ColorPicker />);
    expect(screen.getByRole('group')).toHaveAttribute(
      'aria-label',
      'Color picker',
    );
  });

  it('honors a custom ariaLabel', () => {
    render(<ColorPicker ariaLabel="Pick brand color" />);
    expect(screen.getByRole('group')).toHaveAttribute(
      'aria-label',
      'Pick brand color',
    );
  });

  it('renders SL / hue / alpha sliders by default', () => {
    render(<ColorPicker />);
    expect(
      screen.getByRole('slider', { name: 'Saturation and lightness' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('slider', { name: 'Hue' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('slider', { name: 'Alpha' }),
    ).toBeInTheDocument();
  });

  it('hides the alpha slider when showAlpha=false', () => {
    render(<ColorPicker showAlpha={false} />);
    expect(
      screen.queryByRole('slider', { name: 'Alpha' }),
    ).toBeNull();
  });

  it('exposes data-section + data-disabled + data-show-alpha on root', () => {
    const { rerender } = render(<ColorPicker />);
    const root = screen.getByRole('group');
    expect(root).toHaveAttribute('data-section', 'color-picker');
    expect(root).toHaveAttribute('data-disabled', 'false');
    expect(root).toHaveAttribute('data-show-alpha', 'true');
    rerender(<ColorPicker disabled showAlpha={false} />);
    expect(screen.getByRole('group')).toHaveAttribute(
      'data-disabled',
      'true',
    );
    expect(screen.getByRole('group')).toHaveAttribute(
      'data-show-alpha',
      'false',
    );
  });

  it('renders the input with the formatted current color', () => {
    render(
      <ColorPicker
        defaultValue={{ h: 0, s: 100, l: 50, a: 1 }}
        inputMode="hex"
      />,
    );
    const input = screen.getByLabelText(
      'Color value',
    ) as HTMLInputElement;
    expect(input.value).toBe('#ff0000');
  });

  it('input mode select switches the format', () => {
    render(
      <ColorPicker
        defaultValue={{ h: 0, s: 100, l: 50, a: 1 }}
        inputMode="hex"
      />,
    );
    const select = screen.getByLabelText(
      'Input format',
    ) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'rgb' } });
    const input = screen.getByLabelText(
      'Color value',
    ) as HTMLInputElement;
    expect(input.value).toBe('rgb(255, 0, 0)');
    fireEvent.change(select, { target: { value: 'hsl' } });
    expect(input.value).toBe('hsl(0, 100%, 50%)');
  });

  it('typing a valid hex in the input commits on blur', () => {
    const onChange = vi.fn();
    render(<ColorPicker onChange={onChange} />);
    const input = screen.getByLabelText('Color value');
    fireEvent.change(input, { target: { value: '#00ff00' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ h: 120, s: 100, l: 50 }),
    );
  });

  it('Enter on the input commits the parsed value', () => {
    const onChange = vi.fn();
    render(<ColorPicker onChange={onChange} />);
    const input = screen.getByLabelText('Color value');
    fireEvent.change(input, { target: { value: 'rgb(0, 0, 255)' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ h: 240 }),
    );
  });

  it('invalid input snaps back to the current value on blur', () => {
    render(
      <ColorPicker
        defaultValue={{ h: 0, s: 100, l: 50, a: 1 }}
      />,
    );
    const input = screen.getByLabelText(
      'Color value',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'hello world' } });
    fireEvent.blur(input);
    expect(input.value).toBe('#ff0000');
  });

  it('preset swatch click fires onChange', () => {
    const onChange = vi.fn();
    render(
      <ColorPicker
        onChange={onChange}
        presets={['#ff0000', '#00ff00', '#0000ff']}
      />,
    );
    fireEvent.click(
      screen.getByRole('listitem', { name: 'Preset #00ff00' }),
    );
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ h: 120 }),
    );
  });

  it('default presets are used when no presets prop supplied', () => {
    render(<ColorPicker />);
    const items = screen.getAllByRole('listitem');
    expect(items.length).toBe(DEFAULT_COLOR_PRESETS.length);
  });

  it('empty presets prop hides the presets row', () => {
    render(<ColorPicker presets={[]} />);
    expect(
      screen.queryByLabelText('Color presets'),
    ).toBeNull();
  });

  it('SL pointerdown emits new color', () => {
    const onChange = vi.fn();
    const { container } = render(<ColorPicker onChange={onChange} />);
    const sl = container.querySelector(
      '[data-section="color-picker-sl"]',
    ) as HTMLDivElement;
    Object.defineProperty(sl, 'getBoundingClientRect', {
      configurable: true,
      value: () =>
        ({
          left: 0,
          top: 0,
          right: 100,
          bottom: 100,
          width: 100,
          height: 100,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect,
    });
    fireEvent.pointerDown(sl, {
      pointerId: 1,
      clientX: 50,
      clientY: 50,
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ s: 50, l: 50 }),
    );
  });

  it('Hue slider pointerdown emits new hue', () => {
    const onChange = vi.fn();
    const { container } = render(<ColorPicker onChange={onChange} />);
    const hue = container.querySelector(
      '[data-section="color-picker-hue"]',
    ) as HTMLDivElement;
    Object.defineProperty(hue, 'getBoundingClientRect', {
      configurable: true,
      value: () =>
        ({
          left: 0,
          top: 0,
          right: 360,
          bottom: 10,
          width: 360,
          height: 10,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect,
    });
    fireEvent.pointerDown(hue, {
      pointerId: 1,
      clientX: 180,
      clientY: 5,
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ h: 180 }),
    );
  });

  it('Alpha slider pointerdown emits new alpha', () => {
    const onChange = vi.fn();
    const { container } = render(<ColorPicker onChange={onChange} />);
    const alpha = container.querySelector(
      '[data-section="color-picker-alpha"]',
    ) as HTMLDivElement;
    Object.defineProperty(alpha, 'getBoundingClientRect', {
      configurable: true,
      value: () =>
        ({
          left: 0,
          top: 0,
          right: 100,
          bottom: 10,
          width: 100,
          height: 10,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect,
    });
    fireEvent.pointerDown(alpha, {
      pointerId: 1,
      clientX: 25,
      clientY: 5,
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ a: 0.25 }),
    );
  });

  it('pointermove without pointerdown is a no-op', () => {
    const onChange = vi.fn();
    const { container } = render(<ColorPicker onChange={onChange} />);
    const sl = container.querySelector(
      '[data-section="color-picker-sl"]',
    ) as HTMLDivElement;
    fireEvent.pointerMove(sl, {
      pointerId: 1,
      clientX: 50,
      clientY: 50,
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('controlled value overrides internal state', () => {
    const { rerender } = render(
      <ColorPicker value={{ h: 0, s: 100, l: 50, a: 1 }} />,
    );
    expect(
      (screen.getByLabelText('Color value') as HTMLInputElement).value,
    ).toBe('#ff0000');
    rerender(
      <ColorPicker value={{ h: 120, s: 100, l: 50, a: 1 }} />,
    );
    expect(
      (screen.getByLabelText('Color value') as HTMLInputElement).value,
    ).toBe('#00ff00');
  });

  it('disabled blocks SL pointerdown', () => {
    const onChange = vi.fn();
    const { container } = render(
      <ColorPicker onChange={onChange} disabled />,
    );
    const sl = container.querySelector(
      '[data-section="color-picker-sl"]',
    ) as HTMLDivElement;
    Object.defineProperty(sl, 'getBoundingClientRect', {
      configurable: true,
      value: () =>
        ({
          left: 0,
          top: 0,
          right: 100,
          bottom: 100,
          width: 100,
          height: 100,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect,
    });
    fireEvent.pointerDown(sl, {
      pointerId: 1,
      clientX: 50,
      clientY: 50,
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('disabled blocks preset click', () => {
    const onChange = vi.fn();
    render(
      <ColorPicker
        onChange={onChange}
        disabled
        presets={['#ff0000']}
      />,
    );
    fireEvent.click(
      screen.getByRole('listitem', { name: 'Preset #ff0000' }),
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('exposes data-section attrs per surface', () => {
    const { container } = render(<ColorPicker />);
    expect(
      container.querySelector(
        '[data-section="color-picker-sl"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '[data-section="color-picker-hue"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '[data-section="color-picker-alpha"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '[data-section="color-picker-presets"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '[data-section="color-picker-input"]',
      ),
    ).toBeInTheDocument();
  });

  it('SL aria-valuetext describes the current S/L', () => {
    render(
      <ColorPicker
        defaultValue={{ h: 0, s: 80, l: 40, a: 1 }}
      />,
    );
    expect(
      screen.getByRole('slider', { name: 'Saturation and lightness' }),
    ).toHaveAttribute(
      'aria-valuetext',
      'Saturation 80%, Lightness 40%',
    );
  });

  it('Hue slider aria-valuenow mirrors h', () => {
    render(
      <ColorPicker
        defaultValue={{ h: 200, s: 100, l: 50, a: 1 }}
      />,
    );
    expect(
      screen.getByRole('slider', { name: 'Hue' }),
    ).toHaveAttribute('aria-valuenow', '200');
  });

  it('exposes a stable displayName', () => {
    expect(ColorPicker.displayName).toBe('ColorPicker');
  });

  it('forwards refs to the root group', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ColorPicker ref={ref} />);
    expect(ref.current?.getAttribute('role')).toBe('group');
  });
});
