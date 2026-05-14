import { describe, it, expect, afterEach } from 'vitest';
import { buildXtermTheme } from './xterm-theme';

// buildXtermTheme reads six shadcn CSS custom properties off
// document.documentElement and wraps each non-empty value with
// hsl(...) (xterm rejects raw "H S% L%" triples). The output
// ITheme carries one slot per shadcn role plus an ANSI palette
// of hard-coded brand colors and two derived foreground swaps
// (white = muted-foreground, brightWhite = foreground).

const SHADCN_VARS = [
  '--background',
  '--foreground',
  '--muted-foreground',
  '--primary',
  '--accent',
  '--destructive',
];

function clearVars(): void {
  for (const v of SHADCN_VARS) {
    document.documentElement.style.removeProperty(v);
  }
}

afterEach(() => {
  clearVars();
});

describe('buildXtermTheme', () => {
  it('returns the documented fallbacks when none of the shadcn CSS vars are set', () => {
    clearVars();
    const theme = buildXtermTheme();
    expect(theme.background).toBe('#ffffff');
    expect(theme.foreground).toBe('#0a0a0a');
    expect(theme.cursor).toBe('#0a0a0a');
    expect(theme.cursorAccent).toBe('#ffffff');
    expect(theme.selectionBackground).toBe('#f4f4f5');
    expect(theme.selectionForeground).toBe('#0a0a0a');
    expect(theme.white).toBe('#737373');
    expect(theme.red).toBe('#ef4444');
    expect(theme.brightWhite).toBe('#0a0a0a');
  });

  it('wraps each set CSS var with hsl(...) instead of returning the raw H S% L% triple', () => {
    document.documentElement.style.setProperty('--background', '0 0% 100%');
    document.documentElement.style.setProperty('--foreground', '0 0% 4%');
    const theme = buildXtermTheme();
    expect(theme.background).toBe('hsl(0 0% 100%)');
    expect(theme.foreground).toBe('hsl(0 0% 4%)');
  });

  it('mirrors --primary into cursor and --background into cursorAccent', () => {
    document.documentElement.style.setProperty('--primary', '10 50% 50%');
    document.documentElement.style.setProperty('--background', '0 0% 100%');
    const theme = buildXtermTheme();
    expect(theme.cursor).toBe('hsl(10 50% 50%)');
    expect(theme.cursorAccent).toBe('hsl(0 0% 100%)');
  });

  it('mirrors --accent into selectionBackground and --foreground into selectionForeground', () => {
    document.documentElement.style.setProperty('--accent', '210 40% 96%');
    document.documentElement.style.setProperty('--foreground', '222 47% 11%');
    const theme = buildXtermTheme();
    expect(theme.selectionBackground).toBe('hsl(210 40% 96%)');
    expect(theme.selectionForeground).toBe('hsl(222 47% 11%)');
  });

  it('maps --destructive into the ANSI red slot (and into nothing else)', () => {
    document.documentElement.style.setProperty('--destructive', '0 84% 60%');
    const theme = buildXtermTheme();
    expect(theme.red).toBe('hsl(0 84% 60%)');
    // The bright variants are hard-coded brand colors, not derived.
    expect(theme.brightRed).toBe('#f87171');
  });

  it('maps --muted-foreground onto the ANSI white slot (theme convention)', () => {
    document.documentElement.style.setProperty('--muted-foreground', '215 16% 47%');
    const theme = buildXtermTheme();
    expect(theme.white).toBe('hsl(215 16% 47%)');
  });

  it('mirrors the resolved --foreground into brightWhite (high-contrast tier)', () => {
    document.documentElement.style.setProperty('--foreground', '222 47% 11%');
    const theme = buildXtermTheme();
    expect(theme.brightWhite).toBe('hsl(222 47% 11%)');
  });

  it('keeps the hard-coded ANSI palette stable across calls (not derived from CSS vars)', () => {
    const theme = buildXtermTheme();
    expect(theme.black).toBe('#1f2937');
    expect(theme.green).toBe('#16a34a');
    expect(theme.yellow).toBe('#ca8a04');
    expect(theme.blue).toBe('#2563eb');
    expect(theme.magenta).toBe('#c026d3');
    expect(theme.cyan).toBe('#0891b2');
    expect(theme.brightBlack).toBe('#4b5563');
    expect(theme.brightGreen).toBe('#4ade80');
    expect(theme.brightYellow).toBe('#facc15');
    expect(theme.brightBlue).toBe('#60a5fa');
    expect(theme.brightMagenta).toBe('#e879f9');
    expect(theme.brightCyan).toBe('#22d3ee');
  });

  it('treats a whitespace-only CSS var value the same as unset (falls back)', () => {
    document.documentElement.style.setProperty('--background', '   ');
    const theme = buildXtermTheme();
    expect(theme.background).toBe('#ffffff');
  });

  it('builds the same shape on every call (object literal, no shared mutable state)', () => {
    const a = buildXtermTheme();
    const b = buildXtermTheme();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it('handles a partially-themed root by mixing hsl() values and hex fallbacks per-slot', () => {
    document.documentElement.style.setProperty('--background', '0 0% 100%');
    // foreground deliberately unset
    const theme = buildXtermTheme();
    expect(theme.background).toBe('hsl(0 0% 100%)');
    expect(theme.foreground).toBe('#0a0a0a');
    expect(theme.brightWhite).toBe('#0a0a0a');
  });
});
