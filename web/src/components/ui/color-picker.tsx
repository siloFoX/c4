import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  ChangeEvent,
  ForwardedRef,
  PointerEvent as ReactPointerEvent,
} from 'react';
import { cn } from '../../lib/cn';

// (v1.11.429, TODO 11.411) ColorPicker primitive.
//
// HSL canvas + hue slider + optional alpha slider + textual
// hex / rgb / hsl input + preset swatch row. Pointer drag on
// each surface sets the corresponding axis. The textual input
// parses on blur (and on Enter) -- mid-typing the field shows
// the user's keystrokes, not a snapped value.
//
// Reference: /root/c4/arps-design-system-v1/.

export interface ColorValue {
  h: number; // 0..360
  s: number; // 0..100
  l: number; // 0..100
  a: number; // 0..1
}

export type ColorPickerInputMode = 'hex' | 'rgb' | 'hsl';

export interface ColorPickerProps {
  value?: ColorValue;
  defaultValue?: ColorValue;
  onChange?: (color: ColorValue) => void;
  presets?: string[];
  showAlpha?: boolean;
  inputMode?: ColorPickerInputMode;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

export const DEFAULT_COLOR_VALUE: ColorValue = {
  h: 0,
  s: 0,
  l: 100,
  a: 1,
};

export const DEFAULT_COLOR_PRESETS = [
  '#000000',
  '#ffffff',
  '#ef4444',
  '#f59e0b',
  '#eab308',
  '#22c55e',
  '#0ea5e9',
  '#6366f1',
  '#a855f7',
  '#ec4899',
];

export function normalizeColorValue(
  value: Partial<ColorValue> | null | undefined,
): ColorValue {
  if (!value) return { ...DEFAULT_COLOR_VALUE };
  const h =
    typeof value.h === 'number'
      ? ((value.h % 360) + 360) % 360
      : DEFAULT_COLOR_VALUE.h;
  const s = clamp(
    typeof value.s === 'number' ? value.s : DEFAULT_COLOR_VALUE.s,
    0,
    100,
  );
  const l = clamp(
    typeof value.l === 'number' ? value.l : DEFAULT_COLOR_VALUE.l,
    0,
    100,
  );
  const a = clamp(
    typeof value.a === 'number' ? value.a : DEFAULT_COLOR_VALUE.a,
    0,
    1,
  );
  return { h, s, l, a };
}

export function hslToRgb(
  h: number,
  s: number,
  l: number,
): { r: number; g: number; b: number } {
  const hh = (((h % 360) + 360) % 360) / 360;
  const ss = clamp(s, 0, 100) / 100;
  const ll = clamp(l, 0, 100) / 100;
  if (ss === 0) {
    const v = Math.round(ll * 255);
    return { r: v, g: v, b: v };
  }
  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
  const p = 2 * ll - q;
  const hue2rgb = (t: number): number => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  return {
    r: Math.round(hue2rgb(hh + 1 / 3) * 255),
    g: Math.round(hue2rgb(hh) * 255),
    b: Math.round(hue2rgb(hh - 1 / 3) * 255),
  };
}

export function rgbToHsl(
  r: number,
  g: number,
  b: number,
): { h: number; s: number; l: number } {
  const rr = clamp(r, 0, 255) / 255;
  const gg = clamp(g, 0, 255) / 255;
  const bb = clamp(b, 0, 255) / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rr) h = (gg - bb) / d + (gg < bb ? 6 : 0);
    else if (max === gg) h = (bb - rr) / d + 2;
    else h = (rr - gg) / d + 4;
    h *= 60;
  }
  return {
    h: Math.round(((h % 360) + 360) % 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

function byte2Hex(n: number): string {
  const h = clamp(Math.round(n), 0, 255).toString(16);
  return h.length < 2 ? `0${h}` : h;
}

export function formatHex(value: ColorValue): string {
  const norm = normalizeColorValue(value);
  const { r, g, b } = hslToRgb(norm.h, norm.s, norm.l);
  const base = `#${byte2Hex(r)}${byte2Hex(g)}${byte2Hex(b)}`;
  if (norm.a >= 1) return base;
  return `${base}${byte2Hex(Math.round(norm.a * 255))}`;
}

export function formatRgb(value: ColorValue): string {
  const norm = normalizeColorValue(value);
  const { r, g, b } = hslToRgb(norm.h, norm.s, norm.l);
  if (norm.a >= 1) return `rgb(${r}, ${g}, ${b})`;
  return `rgba(${r}, ${g}, ${b}, ${Number(norm.a.toFixed(3))})`;
}

export function formatHsl(value: ColorValue): string {
  const norm = normalizeColorValue(value);
  const h = Math.round(norm.h);
  const s = Math.round(norm.s);
  const l = Math.round(norm.l);
  if (norm.a >= 1) return `hsl(${h}, ${s}%, ${l}%)`;
  return `hsla(${h}, ${s}%, ${l}%, ${Number(norm.a.toFixed(3))})`;
}

export function formatColor(
  value: ColorValue,
  mode: ColorPickerInputMode,
): string {
  if (mode === 'rgb') return formatRgb(value);
  if (mode === 'hsl') return formatHsl(value);
  return formatHex(value);
}

const HEX_RE =
  /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const RGB_RE =
  /^\s*rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)\s*$/i;
const HSL_RE =
  /^\s*hsla?\(\s*([\d.]+)\s*,?\s*([\d.]+)%\s*,?\s*([\d.]+)%\s*(?:,?\s*([\d.]+)\s*)?\)\s*$/i;

export function parseHex(input: string): ColorValue | null {
  if (typeof input !== 'string') return null;
  const match = input.trim().match(HEX_RE);
  if (!match) return null;
  let body = match[1] ?? '';
  if (body.length === 3 || body.length === 4) {
    body = body
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const r = parseInt(body.slice(0, 2), 16);
  const g = parseInt(body.slice(2, 4), 16);
  const b = parseInt(body.slice(4, 6), 16);
  const a = body.length === 8 ? parseInt(body.slice(6, 8), 16) / 255 : 1;
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
    return null;
  }
  const hsl = rgbToHsl(r, g, b);
  return { ...hsl, a };
}

export function parseRgb(input: string): ColorValue | null {
  if (typeof input !== 'string') return null;
  const match = input.match(RGB_RE);
  if (!match) return null;
  const r = clamp(Number(match[1]), 0, 255);
  const g = clamp(Number(match[2]), 0, 255);
  const b = clamp(Number(match[3]), 0, 255);
  const a = match[4] === undefined ? 1 : clamp(Number(match[4]), 0, 1);
  const hsl = rgbToHsl(r, g, b);
  return { ...hsl, a };
}

export function parseHsl(input: string): ColorValue | null {
  if (typeof input !== 'string') return null;
  const match = input.match(HSL_RE);
  if (!match) return null;
  const h = ((Number(match[1]) % 360) + 360) % 360;
  const s = clamp(Number(match[2]), 0, 100);
  const l = clamp(Number(match[3]), 0, 100);
  const a = match[4] === undefined ? 1 : clamp(Number(match[4]), 0, 1);
  return { h, s, l, a };
}

export function parseColor(
  input: string,
  preferred: ColorPickerInputMode,
): ColorValue | null {
  if (preferred === 'rgb') {
    return parseRgb(input) ?? parseHex(input) ?? parseHsl(input);
  }
  if (preferred === 'hsl') {
    return parseHsl(input) ?? parseHex(input) ?? parseRgb(input);
  }
  return parseHex(input) ?? parseRgb(input) ?? parseHsl(input);
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

function getRelativeFraction(
  event: ReactPointerEvent<HTMLDivElement>,
  axis: 'x' | 'y',
): number {
  const target = event.currentTarget;
  const rect = target.getBoundingClientRect();
  const value =
    axis === 'x'
      ? (event.clientX - rect.left) / rect.width
      : (event.clientY - rect.top) / rect.height;
  return clamp(value, 0, 1);
}

export const ColorPicker = forwardRef(function ColorPicker(
  {
    value,
    defaultValue,
    onChange,
    presets = DEFAULT_COLOR_PRESETS,
    showAlpha = true,
    inputMode: inputModeProp = 'hex',
    ariaLabel = 'Color picker',
    className,
    disabled = false,
  }: ColorPickerProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const isControlled = value !== undefined;
  const [internal, setInternal] = useState<ColorValue>(() =>
    normalizeColorValue(defaultValue ?? DEFAULT_COLOR_VALUE),
  );
  const effective = useMemo(
    () =>
      normalizeColorValue(isControlled ? value ?? undefined : internal),
    [isControlled, value, internal],
  );

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const emit = useCallback(
    (next: ColorValue) => {
      const norm = normalizeColorValue(next);
      if (!isControlled) setInternal(norm);
      onChangeRef.current?.(norm);
    },
    [isControlled],
  );

  // --- Drag state per surface ---------------------------------
  const slDraggingRef = useRef<boolean>(false);
  const hueDraggingRef = useRef<boolean>(false);
  const alphaDraggingRef = useRef<boolean>(false);

  const slHandler = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      const sx = getRelativeFraction(event, 'x') * 100;
      const sy = (1 - getRelativeFraction(event, 'y')) * 100;
      emit({ ...effective, s: sx, l: sy });
    },
    [disabled, effective, emit],
  );

  const onSlDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      event.preventDefault();
      slDraggingRef.current = true;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // jsdom safety
      }
      slHandler(event);
    },
    [disabled, slHandler],
  );

  const onSlMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!slDraggingRef.current) return;
      slHandler(event);
    },
    [slHandler],
  );

  const onSlUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      slDraggingRef.current = false;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // jsdom safety
      }
    },
    [],
  );

  const hueHandler = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      const f = getRelativeFraction(event, 'x');
      emit({ ...effective, h: f * 360 });
    },
    [disabled, effective, emit],
  );

  const onHueDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      event.preventDefault();
      hueDraggingRef.current = true;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* jsdom */
      }
      hueHandler(event);
    },
    [disabled, hueHandler],
  );

  const onHueMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!hueDraggingRef.current) return;
      hueHandler(event);
    },
    [hueHandler],
  );

  const onHueUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      hueDraggingRef.current = false;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        /* jsdom */
      }
    },
    [],
  );

  const alphaHandler = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      const f = getRelativeFraction(event, 'x');
      emit({ ...effective, a: f });
    },
    [disabled, effective, emit],
  );

  const onAlphaDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      event.preventDefault();
      alphaDraggingRef.current = true;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* jsdom */
      }
      alphaHandler(event);
    },
    [disabled, alphaHandler],
  );

  const onAlphaMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!alphaDraggingRef.current) return;
      alphaHandler(event);
    },
    [alphaHandler],
  );

  const onAlphaUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      alphaDraggingRef.current = false;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        /* jsdom */
      }
    },
    [],
  );

  // --- Input ---------------------------------------------------
  const [inputMode, setInputMode] =
    useState<ColorPickerInputMode>(inputModeProp);
  const [inputText, setInputText] = useState<string>(() =>
    formatColor(effective, inputModeProp),
  );

  useEffect(() => {
    setInputText(formatColor(effective, inputMode));
  }, [effective, inputMode]);

  const commitInputText = useCallback(
    (text: string) => {
      const parsed = parseColor(text, inputMode);
      if (parsed) emit(parsed);
      else setInputText(formatColor(effective, inputMode));
    },
    [inputMode, effective, emit],
  );

  const onInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setInputText(event.target.value);
    },
    [],
  );

  const onInputBlur = useCallback(() => {
    commitInputText(inputText);
  }, [commitInputText, inputText]);

  // Preset swatch click
  const onPresetClick = useCallback(
    (hex: string) => {
      if (disabled) return;
      const parsed = parseHex(hex);
      if (!parsed) return;
      emit(parsed);
    },
    [disabled, emit],
  );

  // Style helpers
  const slBackground = useMemo(
    () => ({
      background:
        `linear-gradient(to top, #000, transparent), ` +
        `linear-gradient(to right, #fff, hsl(${effective.h}, 100%, 50%))`,
    }),
    [effective.h],
  );

  const huePreview = `hsl(${Math.round(effective.h)}, 100%, 50%)`;
  const hexPreview = formatHex(effective);

  return (
    <div
      ref={ref}
      role="group"
      aria-label={ariaLabel}
      data-section="color-picker"
      data-disabled={disabled ? 'true' : 'false'}
      data-show-alpha={showAlpha ? 'true' : 'false'}
      className={cn(
        'inline-flex w-64 flex-col gap-2 rounded-md border border-border bg-card p-2 text-sm text-foreground',
        disabled && 'cursor-not-allowed opacity-60',
        className,
      )}
    >
      <div
        role="slider"
        aria-label="Saturation and lightness"
        aria-valuetext={`Saturation ${Math.round(effective.s)}%, Lightness ${Math.round(effective.l)}%`}
        tabIndex={disabled ? -1 : 0}
        data-section="color-picker-sl"
        data-saturation={Math.round(effective.s)}
        data-lightness={Math.round(effective.l)}
        onPointerDown={onSlDown}
        onPointerMove={onSlMove}
        onPointerUp={onSlUp}
        onPointerCancel={onSlUp}
        className="relative h-32 w-full overflow-hidden rounded-md"
        style={slBackground}
      >
        <span
          aria-hidden="true"
          data-section="color-picker-sl-thumb"
          style={{
            position: 'absolute',
            left: `${effective.s}%`,
            top: `${100 - effective.l}%`,
            transform: 'translate(-50%, -50%)',
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            border: '2px solid #fff',
            boxShadow: '0 0 0 1px rgba(0,0,0,0.4)',
            background: hexPreview,
          }}
        />
      </div>
      <div
        role="slider"
        aria-label="Hue"
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(effective.h)}
        tabIndex={disabled ? -1 : 0}
        data-section="color-picker-hue"
        data-hue={Math.round(effective.h)}
        onPointerDown={onHueDown}
        onPointerMove={onHueMove}
        onPointerUp={onHueUp}
        onPointerCancel={onHueUp}
        className="relative h-3 w-full overflow-hidden rounded"
        style={{
          background:
            'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)',
        }}
      >
        <span
          aria-hidden="true"
          data-section="color-picker-hue-thumb"
          style={{
            position: 'absolute',
            left: `${(effective.h / 360) * 100}%`,
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            border: '2px solid #fff',
            boxShadow: '0 0 0 1px rgba(0,0,0,0.4)',
            background: huePreview,
          }}
        />
      </div>
      {showAlpha ? (
        <div
          role="slider"
          aria-label="Alpha"
          aria-valuemin={0}
          aria-valuemax={1}
          aria-valuenow={Number(effective.a.toFixed(3))}
          tabIndex={disabled ? -1 : 0}
          data-section="color-picker-alpha"
          data-alpha={Number(effective.a.toFixed(3))}
          onPointerDown={onAlphaDown}
          onPointerMove={onAlphaMove}
          onPointerUp={onAlphaUp}
          onPointerCancel={onAlphaUp}
          className="relative h-3 w-full overflow-hidden rounded"
          style={{
            background:
              `linear-gradient(to right, transparent, ${huePreview}), ` +
              `repeating-linear-gradient(45deg, #555 0 4px, #888 4px 8px)`,
          }}
        >
          <span
            aria-hidden="true"
            data-section="color-picker-alpha-thumb"
            style={{
              position: 'absolute',
              left: `${effective.a * 100}%`,
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              border: '2px solid #fff',
              boxShadow: '0 0 0 1px rgba(0,0,0,0.4)',
              background: hexPreview,
            }}
          />
        </div>
      ) : null}
      <div
        data-section="color-picker-input-row"
        className="flex items-center gap-1"
      >
        <select
          value={inputMode}
          onChange={(e) =>
            setInputMode(e.target.value as ColorPickerInputMode)
          }
          aria-label="Input format"
          disabled={disabled}
          data-section="color-picker-mode"
          className="rounded border border-border bg-background px-1 py-0.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <option value="hex">HEX</option>
          <option value="rgb">RGB</option>
          <option value="hsl">HSL</option>
        </select>
        <input
          type="text"
          value={inputText}
          onChange={onInputChange}
          onBlur={onInputBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitInputText(inputText);
            }
          }}
          aria-label="Color value"
          disabled={disabled}
          data-section="color-picker-input"
          className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-0.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
      </div>
      {presets.length > 0 ? (
        <div
          role="list"
          aria-label="Color presets"
          data-section="color-picker-presets"
          className="flex flex-wrap gap-1"
        >
          {presets.map((hex, idx) => (
            <button
              key={`${hex}-${idx}`}
              type="button"
              role="listitem"
              aria-label={`Preset ${hex}`}
              disabled={disabled}
              onClick={() => onPresetClick(hex)}
              data-section="color-picker-preset"
              data-preset-hex={hex}
              className="h-5 w-5 shrink-0 rounded border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              style={{ background: hex }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
});

ColorPicker.displayName = 'ColorPicker';
