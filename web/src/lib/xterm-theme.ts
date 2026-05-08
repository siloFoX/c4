import type { ITheme } from '@xterm/xterm';

// (v1.10.645) Extracted from components/XtermView. Maps
// shadcn CSS custom properties to the xterm ITheme shape.
// readShadcnColor reads the bare "H S% L%" triple shadcn
// stores in :root and wraps it in hsl(…) so xterm gets a
// concrete CSS color (xterm rejects raw hsl values without
// the function call).

function readShadcnColor(varName: string, fallback: string): string {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return fallback;
  }
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim();
  if (!raw) return fallback;
  return `hsl(${raw})`;
}

export function buildXtermTheme(): ITheme {
  const background = readShadcnColor('--background', '#ffffff');
  const foreground = readShadcnColor('--foreground', '#0a0a0a');
  const mutedForeground = readShadcnColor('--muted-foreground', '#737373');
  const primary = readShadcnColor('--primary', '#0a0a0a');
  const accent = readShadcnColor('--accent', '#f4f4f5');
  const destructive = readShadcnColor('--destructive', '#ef4444');
  return {
    background,
    foreground,
    cursor: primary,
    cursorAccent: background,
    selectionBackground: accent,
    selectionForeground: foreground,
    black: '#1f2937',
    red: destructive,
    green: '#16a34a',
    yellow: '#ca8a04',
    blue: '#2563eb',
    magenta: '#c026d3',
    cyan: '#0891b2',
    white: mutedForeground,
    brightBlack: '#4b5563',
    brightRed: '#f87171',
    brightGreen: '#4ade80',
    brightYellow: '#facc15',
    brightBlue: '#60a5fa',
    brightMagenta: '#e879f9',
    brightCyan: '#22d3ee',
    brightWhite: foreground,
  };
}
