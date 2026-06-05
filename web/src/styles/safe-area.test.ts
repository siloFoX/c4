import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Mobile viewport polish (1.11.215). Assert the static surfaces
// that wire safe-area insets stay in sync: index.html viewport meta,
// tailwind safe-* spacing tokens, the CSS fallback module, and the
// layout chrome components that consume the utilities.
//
// All paths resolve relative to the web/ root so the suite works
// regardless of where vitest is invoked from.

const WEB_ROOT = resolve(__dirname, '..', '..');
const read = (rel: string) => readFileSync(resolve(WEB_ROOT, rel), 'utf8');

describe('safe-area mobile viewport polish', () => {
  it('index.html viewport meta opts into viewport-fit=cover', () => {
    const html = read('index.html');
    expect(html).toContain('viewport-fit=cover');
    expect(html).toMatch(/name="viewport"/);
  });

  it('index.html declares theme-color for dark + light schemes', () => {
    const html = read('index.html');
    expect(html).toContain('name="theme-color"');
    expect(html).toContain('prefers-color-scheme: dark');
    expect(html).toContain('prefers-color-scheme: light');
  });

  it('tailwind config exposes safe-area padding + spacing tokens', () => {
    const tailwindPath = existsSync(resolve(WEB_ROOT, 'tailwind.config.ts'))
      ? 'tailwind.config.ts'
      : 'tailwind.config.js';
    const cfg = read(tailwindPath);
    expect(cfg).toContain("'safe-t'");
    expect(cfg).toContain("'safe-b'");
    expect(cfg).toContain("'safe-l'");
    expect(cfg).toContain("'safe-r'");
    expect(cfg).toContain('env(safe-area-inset-top)');
    expect(cfg).toContain('env(safe-area-inset-bottom)');
  });

  it('safe-area.css carries an @supports fallback', () => {
    const css = read('src/styles/safe-area.css');
    expect(css).toMatch(/@supports\s*\(padding:\s*env\(safe-area-inset-top\)\)/);
    expect(css).toMatch(/@supports not \(padding: env\(safe-area-inset-top\)\)/);
    expect(css).toContain('--safe-area-inset-top');
  });

  it('main.tsx imports the safe-area stylesheet', () => {
    const main = read('src/main.tsx');
    expect(main).toContain("./styles/safe-area.css");
  });

  it('AppHeader applies pt-safe-t to the outer wrapper', () => {
    const src = read('src/components/layout/AppHeader.tsx');
    expect(src).toContain('pt-safe-t');
    expect(src).toContain('pl-safe-l');
    expect(src).toContain('pr-safe-r');
  });

  it('Sidebar applies pl-safe-l + pb-safe-b on the aside', () => {
    const src = read('src/components/layout/Sidebar.tsx');
    expect(src).toContain('pl-safe-l');
    expect(src).toContain('pb-safe-b');
  });

  it('Toast portal root uses pb-safe-b safe-area padding', () => {
    const src = read('src/components/Toast.tsx');
    expect(src).toContain('pb-safe-b');
    expect(src).toContain('pl-safe-l');
    expect(src).toContain('pr-safe-r');
  });

  it('web/package.json is at or past the safe-area landing version 1.11.215', () => {
    // The original assertion pinned the version to the release that
    // shipped the safe-area work (1.11.215). After hundreds of
    // subsequent bumps the literal pin is meaningless; what matters is
    // that the safe-area work has not been reverted below its floor.
    // Compare segment-by-segment so the floor stays load-bearing even
    // as the major/minor lines move forward.
    const pkg = JSON.parse(read('package.json')) as { version: string };
    const FLOOR = [1, 11, 215] as const;
    const segs = pkg.version.split('.').map((s) => Number.parseInt(s, 10));
    expect(segs.length).toBeGreaterThanOrEqual(3);
    expect(Number.isFinite(segs[0])).toBe(true);
    expect(Number.isFinite(segs[1])).toBe(true);
    expect(Number.isFinite(segs[2])).toBe(true);
    let cmp = 0;
    for (let i = 0; i < 3 && cmp === 0; i += 1) cmp = segs[i]! - FLOOR[i]!;
    expect(cmp).toBeGreaterThanOrEqual(0);
  });
});
