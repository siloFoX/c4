import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import enBundle from './en.json';
import koBundle from './ko.json';

// Keys that are intentionally absent from the bundles — used by
// i18n.test.ts to exercise the fallback / missing-key path. These
// must NOT be added to en.json or ko.json.
const ALLOWLIST_MISSING = new Set<string>([
  'no.such.translation.key',
  'totally.absent.key',
]);

const SRC_ROOT = resolve(__dirname, '..');

const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx']);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.vite']);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
      continue;
    }
    const dot = name.lastIndexOf('.');
    if (dot < 0) continue;
    if (CODE_EXT.has(name.slice(dot))) out.push(full);
  }
  return out;
}

// Match t('key') and tFormat('key', ...) call sites. The key segment is
// restricted to identifier-ish characters so concatenated/computed keys
// (which we cannot statically resolve) are naturally skipped.
const T_CALL = /\bt\(\s*['"]([a-zA-Z0-9_.\-]+)['"]/g;
const TFORMAT_CALL = /\btFormat\(\s*['"]([a-zA-Z0-9_.\-]+)['"]/g;

function collectReferencedKeys(): Set<string> {
  const keys = new Set<string>();
  for (const file of walk(SRC_ROOT)) {
    const src = readFileSync(file, 'utf8');
    let m: RegExpExecArray | null;
    T_CALL.lastIndex = 0;
    while ((m = T_CALL.exec(src)) !== null) keys.add(m[1]);
    TFORMAT_CALL.lastIndex = 0;
    while ((m = TFORMAT_CALL.exec(src)) !== null) keys.add(m[1]);
  }
  return keys;
}

describe('i18n keys', () => {
  const en = enBundle as Record<string, string>;
  const ko = koBundle as Record<string, string>;

  it('every t()/tFormat() key referenced in web/src exists in en.json', () => {
    const referenced = collectReferencedKeys();
    const enKeys = new Set(Object.keys(en));
    const missing: string[] = [];
    for (const key of referenced) {
      if (ALLOWLIST_MISSING.has(key)) continue;
      if (!enKeys.has(key)) missing.push(key);
    }
    expect(missing, `missing en.json keys: ${missing.join(', ')}`).toEqual([]);
  });

  it('ko.json has exactly the same key set as en.json', () => {
    const enKeys = new Set(Object.keys(en));
    const koKeys = new Set(Object.keys(ko));
    const onlyEn = [...enKeys].filter((k) => !koKeys.has(k));
    const onlyKo = [...koKeys].filter((k) => !enKeys.has(k));
    expect(onlyEn, `keys only in en.json: ${onlyEn.join(', ')}`).toEqual([]);
    expect(onlyKo, `keys only in ko.json: ${onlyKo.join(', ')}`).toEqual([]);
  });

  it('allowlisted fixture keys remain absent from both bundles', () => {
    for (const key of ALLOWLIST_MISSING) {
      expect(en[key], `${key} must stay absent from en.json`).toBeUndefined();
      expect(ko[key], `${key} must stay absent from ko.json`).toBeUndefined();
    }
  });
});
