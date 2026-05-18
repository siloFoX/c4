// (v1.11.371, TODO 11.353) WCAG 2.1 contrast helpers.
//
// Pure math: no DOM access, no React. Adopters
// call into the helpers from unit tests, design-
// time audits, or runtime accessibility surfaces
// (e.g. the dev-only contrast inspector planned
// for a future patch).
//
// The c4 design tokens are HSL strings in
// `tokens.css` (e.g. `--text-primary: 220 15%
// 96%`). The helpers accept three forms:
//
//   - 6-digit hex (`#11141a`).
//   - 8-digit hex with alpha (`#11141aff`) -- the
//     alpha component is ignored for contrast.
//   - `'h s% l%'` HSL triplets matching the
//     tokens.css shape.
//
// The two reference levels per WCAG 2.1:
//
//   - AA  -- 4.5:1 for normal text, 3:1 for large
//            text (>= 18pt or >= 14pt bold).
//   - AAA -- 7:1 for normal text, 4.5:1 for large
//            text.
//
// Both `meetsAaContrast()` / `meetsAaaContrast()`
// take an optional `isLargeText` argument so a
// caller can switch between the two thresholds
// without re-implementing the cutoff.

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export type ColorInput = string | RGB;

export interface ContrastResult {
  ratio: number;
  aaNormal: boolean;
  aaLarge: boolean;
  aaaNormal: boolean;
  aaaLarge: boolean;
}

export const AA_NORMAL = 4.5;
export const AA_LARGE = 3;
export const AAA_NORMAL = 7;
export const AAA_LARGE = 4.5;

// ----- Parsers -------------------------------------------------

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const HSL_RE =
  /^\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*%\s+(\d+(?:\.\d+)?)\s*%\s*$/;

function parseHex(input: string): RGB | null {
  const m = HEX_RE.exec(input);
  if (!m) return null;
  let hex = m[1] ?? '';
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (hex.length === 8) {
    hex = hex.slice(0, 6); // drop alpha
  }
  const intVal = parseInt(hex, 16);
  if (!Number.isFinite(intVal)) return null;
  return {
    r: (intVal >> 16) & 0xff,
    g: (intVal >> 8) & 0xff,
    b: intVal & 0xff,
  };
}

function hslToRgb(h: number, s: number, l: number): RGB {
  // Algorithm from MDN.
  const sat = s / 100;
  const lig = l / 100;
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lig - c / 2;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (h < 60) {
    rp = c;
    gp = x;
  } else if (h < 120) {
    rp = x;
    gp = c;
  } else if (h < 180) {
    gp = c;
    bp = x;
  } else if (h < 240) {
    gp = x;
    bp = c;
  } else if (h < 300) {
    rp = x;
    bp = c;
  } else {
    rp = c;
    bp = x;
  }
  return {
    r: Math.round((rp + m) * 255),
    g: Math.round((gp + m) * 255),
    b: Math.round((bp + m) * 255),
  };
}

function parseHsl(input: string): RGB | null {
  const m = HSL_RE.exec(input);
  if (!m) return null;
  const h = Number(m[1]);
  const s = Number(m[2]);
  const l = Number(m[3]);
  if (!Number.isFinite(h) || !Number.isFinite(s) || !Number.isFinite(l)) {
    return null;
  }
  // Normalise hue into 0..360.
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.max(0, Math.min(100, s));
  const lig = Math.max(0, Math.min(100, l));
  return hslToRgb(hue, sat, lig);
}

export function parseColor(input: ColorInput): RGB | null {
  if (typeof input !== 'string') {
    return { r: input.r, g: input.g, b: input.b };
  }
  const trimmed = input.trim();
  return parseHex(trimmed) ?? parseHsl(trimmed);
}

// ----- Math ----------------------------------------------------

// Per WCAG 2.1: linearise each sRGB channel then
// compute luminance with the canonical 0.2126 R +
// 0.7152 G + 0.0722 B weights.
export function relativeLuminance(input: ColorInput): number {
  const rgb = parseColor(input);
  if (!rgb) return Number.NaN;
  const lin = (channel: number): number => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
}

export function contrastRatio(fg: ColorInput, bg: ColorInput): number {
  const lfg = relativeLuminance(fg);
  const lbg = relativeLuminance(bg);
  if (!Number.isFinite(lfg) || !Number.isFinite(lbg)) return Number.NaN;
  const a = Math.max(lfg, lbg);
  const b = Math.min(lfg, lbg);
  return (a + 0.05) / (b + 0.05);
}

export function meetsAaContrast(
  fg: ColorInput,
  bg: ColorInput,
  isLargeText = false,
): boolean {
  const ratio = contrastRatio(fg, bg);
  if (!Number.isFinite(ratio)) return false;
  return ratio >= (isLargeText ? AA_LARGE : AA_NORMAL);
}

export function meetsAaaContrast(
  fg: ColorInput,
  bg: ColorInput,
  isLargeText = false,
): boolean {
  const ratio = contrastRatio(fg, bg);
  if (!Number.isFinite(ratio)) return false;
  return ratio >= (isLargeText ? AAA_LARGE : AAA_NORMAL);
}

export function evaluateContrast(
  fg: ColorInput,
  bg: ColorInput,
): ContrastResult {
  const ratio = contrastRatio(fg, bg);
  return {
    ratio,
    aaNormal: ratio >= AA_NORMAL,
    aaLarge: ratio >= AA_LARGE,
    aaaNormal: ratio >= AAA_NORMAL,
    aaaLarge: ratio >= AAA_LARGE,
  };
}
