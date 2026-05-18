import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// (v1.11.362, TODO 11.344) Static validation of the
// PWA manifest. Catches typos / accidental
// regressions in the JSON before the SW ships a
// broken install banner.

const MANIFEST_PATH = resolve(
  __dirname,
  '..',
  '..',
  'public',
  'manifest.webmanifest',
);

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

interface ManifestShortcut {
  name: string;
  short_name?: string;
  url: string;
  icons?: ManifestIcon[];
}

interface Manifest {
  name: string;
  short_name: string;
  description?: string;
  lang?: string;
  dir?: string;
  start_url: string;
  scope?: string;
  id?: string;
  display: string;
  display_override?: string[];
  orientation?: string;
  background_color?: string;
  theme_color?: string;
  categories?: string[];
  icons: ManifestIcon[];
  shortcuts?: ManifestShortcut[];
  prefer_related_applications?: boolean;
}

function loadManifest(): Manifest {
  const raw = readFileSync(MANIFEST_PATH, 'utf8');
  return JSON.parse(raw) as Manifest;
}

describe('manifest.webmanifest', () => {
  it('parses as valid JSON', () => {
    expect(() => loadManifest()).not.toThrow();
  });

  it('declares the required PWA install fields', () => {
    const m = loadManifest();
    expect(m.name).toBeTruthy();
    expect(m.short_name).toBeTruthy();
    expect(m.start_url).toBe('/');
    expect(m.display).toBe('standalone');
    expect(m.icons.length).toBeGreaterThan(0);
  });

  it('uses ARPS dark canvas as theme + background', () => {
    const m = loadManifest();
    // #0D1B2A matches the navy used by the logo and
    // the dark-mode theme-color in index.html.
    expect(m.theme_color).toBe('#0D1B2A');
    expect(m.background_color).toBe('#0D1B2A');
  });

  it('declares at least one any-purpose icon AND one maskable icon', () => {
    const m = loadManifest();
    const purposes = m.icons.map((i) => i.purpose ?? 'any');
    expect(purposes).toContain('any');
    expect(purposes).toContain('maskable');
  });

  it('points every icon at a path served from the site root', () => {
    const m = loadManifest();
    for (const icon of m.icons) {
      expect(icon.src.startsWith('/')).toBe(true);
      expect(icon.sizes).toBeTruthy();
      expect(icon.type).toMatch(/^image\//);
    }
  });

  it('caches the manifest path in the SW app shell', async () => {
    const sw = await import('../sw');
    expect(sw.APP_SHELL).toContain('/manifest.webmanifest');
  });

  it('declares the dev/operator shortcuts queue + workers', () => {
    const m = loadManifest();
    const urls = (m.shortcuts ?? []).map((s) => s.url);
    expect(urls).toContain('/?view=autonomous');
    expect(urls).toContain('/?view=workers');
  });

  it('scopes the app to /', () => {
    const m = loadManifest();
    expect(m.scope).toBe('/');
  });

  it('keeps prefer_related_applications=false so the PWA is the canonical install target', () => {
    const m = loadManifest();
    expect(m.prefer_related_applications).toBe(false);
  });
});
