// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  scanSourceForI18nViolations,
  scanFilesForI18nViolations,
  formatI18nViolations,
  filterAllowed,
} from './i18n-coverage';
import type { I18nCoverageViolation } from './i18n-coverage';

// (v1.11.346, TODO 11.328) Unit + integration coverage
// for the i18n hardcoded-copy scanner.

describe('i18n-coverage (unit)', () => {
  it('flags a hardcoded JSX text node', () => {
    const source = `return <Button>Save changes</Button>;`;
    const v = scanSourceForI18nViolations('foo.tsx', source);
    expect(v.length).toBe(1);
    expect(v[0]?.rule).toBe('jsx-text');
    expect(v[0]?.text).toBe('Save changes');
  });

  it('does NOT flag a JSX text wrapped in {t(...)}', () => {
    const source = `return <Button>{t('page.save')}</Button>;`;
    const v = scanSourceForI18nViolations('foo.tsx', source);
    expect(v.length).toBe(0);
  });

  it('flags a hardcoded aria-label', () => {
    const source = `<button aria-label="Open the filters drawer" />`;
    const v = scanSourceForI18nViolations('foo.tsx', source);
    expect(v.some((x) => x.rule === 'aria-label')).toBe(true);
  });

  it('does NOT flag short single-word aria-labels (technical values)', () => {
    const source = `<button aria-label="Refresh" />`;
    const v = scanSourceForI18nViolations('foo.tsx', source);
    expect(v.length).toBe(0);
  });

  it('flags a hardcoded title attribute (multi-word)', () => {
    const source = `<button title="Reload queue from disk" />`;
    const v = scanSourceForI18nViolations('foo.tsx', source);
    expect(v.some((x) => x.rule === 'title')).toBe(true);
  });

  it('flags a hardcoded placeholder', () => {
    const source = `<input placeholder="Search by id or title" />`;
    const v = scanSourceForI18nViolations('foo.tsx', source);
    expect(v.some((x) => x.rule === 'placeholder')).toBe(true);
  });

  it('flags a hardcoded label attribute (multi-word)', () => {
    const source = `<Tooltip label="Open the help drawer" />`;
    const v = scanSourceForI18nViolations('foo.tsx', source);
    expect(v.some((x) => x.rule === 'label')).toBe(true);
  });

  it('does NOT flag class-style strings inside JSX text', () => {
    const source = `<div className="flex items-center gap-2" />`;
    const v = scanSourceForI18nViolations('foo.tsx', source);
    expect(v.length).toBe(0);
  });

  it('does NOT flag enum-value class lists (no end-of-sentence punctuation)', () => {
    const source = `<div>flex flex-col items-center</div>`;
    const v = scanSourceForI18nViolations('foo.tsx', source);
    expect(v.length).toBe(0);
  });

  it('does NOT flag single-word JSX text (too short / single word)', () => {
    const source = `<span>Save</span>`;
    const v = scanSourceForI18nViolations('foo.tsx', source);
    expect(v.length).toBe(0);
  });

  it('skips block-commented hardcoded text', () => {
    const source = `/* return <Button>Save changes</Button> */`;
    const v = scanSourceForI18nViolations('foo.tsx', source);
    expect(v.length).toBe(0);
  });

  it('skips // line-commented hardcoded text', () => {
    const source = `// <Button>Save changes</Button>`;
    const v = scanSourceForI18nViolations('foo.tsx', source);
    expect(v.length).toBe(0);
  });

  it('reports file/line/column for every violation', () => {
    const source = `line one\n\n  return <Button>Save changes</Button>;`;
    const v = scanSourceForI18nViolations('foo.tsx', source);
    expect(v.length).toBe(1);
    expect(v[0]?.line).toBe(3);
    expect(v[0]?.file).toBe('foo.tsx');
  });

  it('formatI18nViolations() yields empty string when no violations', () => {
    expect(formatI18nViolations([])).toBe('');
  });

  it('formatI18nViolations() includes file:line:col + rule + text', () => {
    const v = scanSourceForI18nViolations(
      'demo.tsx',
      `<Button>Save changes</Button>`,
    );
    const out = formatI18nViolations(v);
    expect(out).toContain('demo.tsx:1');
    expect(out).toContain('jsx-text');
    expect(out).toContain('Save changes');
  });

  it('does NOT flag template literal placeholders', () => {
    const source = '<span>${count} items</span>';
    const v = scanSourceForI18nViolations('foo.tsx', source);
    expect(v.length).toBe(0);
  });

  it('does NOT flag Tailwind class lists with multiple hyphen-joined tokens', () => {
    const source = `<div>bg-card text-foreground rounded-md</div>`;
    const v = scanSourceForI18nViolations('foo.tsx', source);
    expect(v.length).toBe(0);
  });
});

describe('filterAllowed', () => {
  it('passes every violation through when the allow-list is empty', () => {
    const violations: I18nCoverageViolation[] = [
      {
        file: 'a.tsx', line: 1, column: 1, text: 'X', rule: 'jsx-text', excerpt: '',
      },
    ];
    expect(filterAllowed(violations, [])).toHaveLength(1);
  });

  it('drops violations whose text matches an allow entry exactly', () => {
    const violations: I18nCoverageViolation[] = [
      { file: 'a.tsx', line: 1, column: 1, text: 'Save changes', rule: 'jsx-text', excerpt: '' },
      { file: 'b.tsx', line: 2, column: 1, text: 'Other text', rule: 'jsx-text', excerpt: '' },
    ];
    const filtered = filterAllowed(violations, [{ text: 'Save changes' }]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.text).toBe('Other text');
  });

  it('scopes allow entries by pathSuffix when set', () => {
    const violations: I18nCoverageViolation[] = [
      { file: '/x/pages/A.tsx', line: 1, column: 1, text: 'Save', rule: 'jsx-text', excerpt: '' },
      { file: '/x/pages/B.tsx', line: 1, column: 1, text: 'Save', rule: 'jsx-text', excerpt: '' },
    ];
    const filtered = filterAllowed(violations, [
      { text: 'Save', pathSuffix: 'pages/A.tsx' },
    ]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.file).toBe('/x/pages/B.tsx');
  });
});

// (v1.11.346, TODO 11.328) Pages-integration coverage
// scan. The dispatch's literal ask is "no string in
// src/pages reaches the DOM as a literal". The codebase
// has ~200 pre-existing hardcoded strings across every
// page; migrating them all in one patch is too much
// scope. Instead the test asserts a ratchet: the
// violation count must not grow beyond a recorded
// baseline. New hardcoded copy is caught immediately;
// pre-existing strings are documented as work for
// follow-up patches (see
// docs/patches/11.328-ui-i18n-audit.md). When you
// migrate strings and lower the count, edit
// MAX_KNOWN_PAGES_VIOLATIONS to the new floor.
export const MAX_KNOWN_PAGES_VIOLATIONS = 194;

describe('i18n-coverage (integration: pages)', () => {
  it('hardcoded copy count in web/src/pages/*.tsx stays at or below the known baseline', () => {
    const pagesDir = resolve(__dirname, '..', 'pages');
    const files = readdirSync(pagesDir)
      .filter((name) => name.endsWith('.tsx') && !name.endsWith('.test.tsx'))
      .map((name) => join(pagesDir, name));
    expect(files.length).toBeGreaterThan(5);
    const violations = scanFilesForI18nViolations(files);
    if (violations.length > MAX_KNOWN_PAGES_VIOLATIONS) {
      const overage = violations.length - MAX_KNOWN_PAGES_VIOLATIONS;
      const summary = `\ni18n coverage regression: ${violations.length} violations (+${overage} vs baseline ${MAX_KNOWN_PAGES_VIOLATIONS}):\n${formatI18nViolations(violations)}\n\nFix the new strings via t()/tFormat() OR lower MAX_KNOWN_PAGES_VIOLATIONS to the new count.`;
      throw new Error(summary);
    }
    expect(violations.length).toBeLessThanOrEqual(MAX_KNOWN_PAGES_VIOLATIONS);
  });
});
