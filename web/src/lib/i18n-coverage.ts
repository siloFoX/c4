// i18n-coverage.ts -- detect hardcoded English copy in
// page-level source files.
//
// (v1.11.346, TODO 11.328) Companion to the existing
// `i18n-keys.test.ts` (which asserts that every `t(key)`
// reference is resolvable). This module scans page-level
// source files for hardcoded user-facing strings that
// bypass the `t()` / `tFormat()` translation pipeline:
//
//   * JSX text content -- `<Button>Save changes</Button>`
//     should be `<Button>{t('page.save')}</Button>`.
//   * String-valued user-facing attributes
//     (`title`, `aria-label`, `alt`, `placeholder`,
//     `label`) -- inline copy here is rendered verbatim
//     and never round-trips through i18n.
//
// The scanner is intentionally conservative: it only
// flags strings that look like natural English copy
// (more than one word, containing letters, no JSX-only
// punctuation). Short technical tokens
// (`'flex'`, `'h-2'`, `'todo'`, `'all'`) are skipped to
// avoid false positives. The companion test points the
// scanner at `web/src/pages/*.tsx` so a regression
// fails CI immediately.
//
// Like the theme-tokens-validator, the scanner is a
// regex pass on the source text. It does NOT walk a
// real AST -- a few corner cases will slip through (a
// hardcoded English literal passed through a chain of
// helper calls is undetectable without proper
// dataflow). Those should be added to the allow-list
// inline in the page if the call site is genuinely
// non-localised.

import { readFileSync } from 'node:fs';

export type CoverageRule =
  | 'jsx-text'
  | 'aria-label'
  | 'title'
  | 'alt'
  | 'placeholder'
  | 'label';

export interface I18nCoverageViolation {
  file: string;
  line: number;
  column: number;
  text: string;
  rule: CoverageRule;
  excerpt: string;
}

// Strings shorter than this are skipped -- they are
// usually CSS tokens (`'flex'`), enum values (`'todo'`),
// or one-character separators. Two-word strings reach
// the threshold organically once both words have at
// least 3 characters each.
const MIN_NATURAL_LENGTH = 6;

// Strings that hit the length threshold but are still
// not English copy. CSS-style tokens, enum values,
// short technical identifiers. Lowercased before
// comparison.
const TECHNICAL_TOKENS = new Set<string>([
  'true', 'false', 'null', 'undefined',
  'horizontal', 'vertical',
  'select-none', 'inline-flex', 'flex-col', 'flex-row',
  'text-sm', 'text-xs', 'text-base', 'text-lg', 'text-xl',
  'auto-mode', 'auto-w17',
  'lowercase', 'uppercase', 'capitalize',
  'localstorage', 'sessionstorage',
  'production', 'development',
  'sm:flex', 'md:flex', 'lg:flex',
  'currentcolor', 'transparent',
  'application/json', 'text/plain', 'multipart/form-data',
  'click', 'mouseenter', 'mouseleave', 'keydown', 'keyup',
  'submit', 'reset', 'button',
  'animate-spin', 'animate-pulse',
]);

// Detect the natural-English signature: at least one
// space + at least two distinct word-like runs + a
// lowercase letter in the middle (so single-quoted
// programming literals like `'JSON.stringify'` get
// rejected for lack of internal space + lowercase).
function looksLikeEnglishCopy(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < MIN_NATURAL_LENGTH) return false;
  if (TECHNICAL_TOKENS.has(trimmed.toLowerCase())) return false;
  // Reject template / interpolation placeholders.
  if (trimmed.includes('${')) return false;
  if (trimmed.includes('{{')) return false;
  // Reject lines that look like CSS / Tailwind tokens
  // (one or more class-style identifiers separated by
  // spaces, no end-of-sentence punctuation, no
  // lowercase letter inside a word).
  if (/^[\w:./\-\s]+$/.test(trimmed) && !/[.!?]/.test(trimmed)) {
    // Without any sentence punctuation AND without a
    // lowercase letter that follows another lowercase
    // letter (i.e. natural English diphthongs), this is
    // most likely a class-string list -- skip.
    if (!/[a-z][a-z]/.test(trimmed)) return false;
  }
  // Must contain at least one ASCII letter.
  if (!/[A-Za-z]/.test(trimmed)) return false;
  // Must contain at least one space-separated word
  // boundary. Single-word labels are allowed only
  // when explicitly opted in via the attribute rule
  // branches below.
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;
  // Reject CSS-class-list-like strings: most class names
  // are kebab-case (`flex-col`, `items-center`,
  // `bg-primary`). Require at least 2 hyphen-free words
  // in the string so a 3-word Tailwind class string
  // ("flex flex-col items-center" -- 1 hyphen-free word)
  // does not get flagged while a 2-word English string
  // ("Save changes" -- 2 hyphen-free words) does.
  const hyphenFreeWords = words.filter((w) => !w.includes('-'));
  if (hyphenFreeWords.length < 2) return false;
  // And the hyphen-free words themselves must contain
  // English-shaped letters (at least one ASCII letter
  // each).
  const englishLike = hyphenFreeWords.every((w) => /[A-Za-z]/.test(w));
  if (!englishLike) return false;
  return true;
}

// JSX text content: `>some text<`. The captured group
// excludes JSX expressions (curly braces) and child tags.
// We accept a leading-newline + indentation prefix so
// multi-line JSX bodies match.
const RE_JSX_TEXT = />([^<{}\r\n]+)</g;

// String-valued user-facing attributes. Each captures
// the literal between the quotes.
const RE_ATTR_ARIA = /\baria-label\s*=\s*['"]([^'"\r\n]+)['"]/g;
const RE_ATTR_TITLE = /\btitle\s*=\s*['"]([^'"\r\n]+)['"]/g;
const RE_ATTR_ALT = /\balt\s*=\s*['"]([^'"\r\n]+)['"]/g;
const RE_ATTR_PLACEHOLDER = /\bplaceholder\s*=\s*['"]([^'"\r\n]+)['"]/g;
const RE_ATTR_LABEL = /\blabel\s*=\s*['"]([^'"\r\n]+)['"]/g;

const RE_LINE_COMMENT = /\/\/.*$/;
const RE_BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;

interface AttrRulePattern {
  rule: CoverageRule;
  re: RegExp;
  // Some attributes (title, label) commonly carry
  // technical values like `title="Auto"`. The
  // attribute pass shares the natural-English filter
  // but additionally requires at least one space when
  // `requireSpace=true` so short single-word values
  // don't flood the report.
  requireSpace: boolean;
}

const ATTR_RULES: readonly AttrRulePattern[] = [
  { rule: 'aria-label', re: RE_ATTR_ARIA, requireSpace: true },
  { rule: 'title', re: RE_ATTR_TITLE, requireSpace: true },
  { rule: 'alt', re: RE_ATTR_ALT, requireSpace: false },
  { rule: 'placeholder', re: RE_ATTR_PLACEHOLDER, requireSpace: true },
  { rule: 'label', re: RE_ATTR_LABEL, requireSpace: true },
];

export function scanSourceForI18nViolations(
  filePath: string,
  contents: string,
): I18nCoverageViolation[] {
  const stripped = contents.replace(RE_BLOCK_COMMENT, '');
  const out: I18nCoverageViolation[] = [];
  const lines = stripped.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i] ?? '';
    const line = raw.replace(RE_LINE_COMMENT, '');
    if (!line.trim()) continue;
    // Skip lines that look like import / export / type /
    // const declarations. JSX text only appears inside
    // return statements / JSX bodies.
    if (/^\s*(import|export|type|interface)\b/.test(line)) continue;

    for (const m of line.matchAll(RE_JSX_TEXT)) {
      const text = m[1] ?? '';
      if (!looksLikeEnglishCopy(text)) continue;
      out.push({
        file: filePath,
        line: i + 1,
        column: (m.index ?? 0) + 1,
        text: text.trim(),
        rule: 'jsx-text',
        excerpt: raw.trim(),
      });
    }
    for (const r of ATTR_RULES) {
      r.re.lastIndex = 0;
      for (const m of line.matchAll(r.re)) {
        const text = m[1] ?? '';
        if (r.requireSpace && !/\s/.test(text)) continue;
        if (!looksLikeEnglishCopy(text)) continue;
        out.push({
          file: filePath,
          line: i + 1,
          column: (m.index ?? 0) + 1,
          text: text.trim(),
          rule: r.rule,
          excerpt: raw.trim(),
        });
      }
    }
  }
  return out;
}

export function scanFilesForI18nViolations(
  files: readonly string[],
): I18nCoverageViolation[] {
  const out: I18nCoverageViolation[] = [];
  for (const f of files) {
    const contents = readFileSync(f, 'utf8');
    out.push(...scanSourceForI18nViolations(f, contents));
  }
  return out;
}

// (v1.11.346, TODO 11.328) Allow-list entry. The integration
// scan emits one row per violation; an entry here suppresses
// matching rows from the report so the test can fail loudly
// on NEW hardcoded copy without requiring every pre-existing
// string in the codebase to be migrated in one patch. Match
// is by exact `text`, scoped optionally to a basename
// suffix so the same English token can be allow-listed on
// per-page basis.
export interface I18nAllowEntry {
  text: string;
  // Optional path-suffix match. When set, the allow-list
  // entry only applies to violations whose file path ends
  // with the suffix (e.g. `pages/Workspaces.tsx`).
  pathSuffix?: string;
}

export function filterAllowed(
  violations: readonly I18nCoverageViolation[],
  allowList: readonly I18nAllowEntry[],
): I18nCoverageViolation[] {
  return violations.filter((v) => {
    return !allowList.some((entry) => {
      if (entry.text !== v.text) return false;
      if (entry.pathSuffix && !v.file.endsWith(entry.pathSuffix)) return false;
      return true;
    });
  });
}

export function formatI18nViolations(
  violations: readonly I18nCoverageViolation[],
): string {
  if (violations.length === 0) return '';
  return violations
    .map(
      (v) =>
        `  ${v.file}:${v.line}:${v.column}  [${v.rule}]  "${v.text}"\n      ${v.excerpt}`,
    )
    .join('\n');
}
