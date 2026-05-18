// theme-tokens-validator.ts -- design-token policy enforcer.
//
// (v1.11.324, TODO 11.306) The c4 web app's design system
// is built on Tailwind utility classes that resolve to CSS
// variables (the "tokens" -- `--color-foreground`,
// `--color-background`, `--color-primary`, etc) plus a
// fixed spacing scale. Any component that hardcodes a raw
// hex color (`#fff`, `#1a1a1a`), an `rgb(...)` literal, or
// an `hsl(...)` literal silently bypasses the token layer
// and breaks the canonical theming contract:
//
//   - The dark-mode / light-mode flip stops working for
//     that surface (the hex stays the same regardless of
//     theme).
//   - The palette migration story (ARPS theme refresh,
//     future brand re-skin) has to grep every component
//     instead of editing one CSS variable.
//   - Tokens-vs-hex drift hides inside a 4000-line
//     repository diff and is found only when a designer
//     opens the dark-mode build and sees an off-brand
//     splash of colour.
//
// This module exposes a synchronous scanner that walks a
// supplied list of source paths, parses them as plain
// text, strips comments, and returns the set of
// design-token violations. The companion test at
// `theme-tokens-validator.test.ts` wires the scanner up to
// the `web/src/components/ui/*.tsx` tree so a regression
// fails CI immediately.
//
// The scanner is intentionally permissive about what it
// IS NOT enforcing:
//
//   - Spacing (px / rem / em) values are NOT banned. A
//     caller-supplied default like `width = '320px'` is a
//     tunable knob, not a token violation; the design
//     system has no opinion on the default value as long
//     as the consumer can override it.
//   - SVG attribute values that are legitimately
//     non-tokenised (`fill="currentColor"`,
//     `fill="none"`, `fill="transparent"`) are allowed.
//   - Inline `style={{ background: 'var(--token-x)' }}`
//     is allowed because it explicitly references a
//     token via the canonical `var(...)` indirection.

import { readFileSync } from 'node:fs';

export interface ThemeViolation {
  file: string;
  line: number;
  column: number;
  match: string;
  rule: 'hex-color' | 'rgb-fn' | 'hsl-fn';
  excerpt: string;
}

// Hex color literals: `#rgb`, `#rrggbb`, `#rrggbbaa`.
// Word-boundary on both sides so an id like `#main-content`
// (8 letters, valid CSS id) is not picked up unless it
// looks like a hex sequence. We require the leading `#`
// to be NOT preceded by a word character so URL fragments
// (`href="#anchor"`) and selector strings (`'#main-id'`)
// that contain non-hex characters do not match.
const RE_HEX = /(^|[^\w])(#[0-9a-fA-F]{3,8})(\b|$)([^\n]*)/g;
const RE_RGB = /\b(rgba?\s*\(([^)]*)\))/g;
const RE_HSL = /\b(hsla?\s*\(([^)]*)\))/g;

// (v1.11.344, TODO 11.326) A hex literal inside an English
// sentence is almost always a content reference (issue
// number, todo id, anchor fragment), not a CSS color. The
// heuristic: when the hex is followed by a space + a
// lowercase letter (e.g., "#142 to worker"), treat it as
// natural-language content and skip the match. CSS values
// in code are usually followed by `'`, `"`, `` ` ``, `,`,
// `;`, `}`, `)`, or end-of-line.
const RE_NATURAL_LANGUAGE_TAIL = /^\s+[a-z]/;
function looksLikeNaturalLanguageTail(tail: string): boolean {
  return RE_NATURAL_LANGUAGE_TAIL.test(tail);
}

// (v1.11.344, TODO 11.326) `hsl(var(--token))` /
// `rgb(var(--token))` references compose an HSL / RGB
// function around a CSS variable. They are *not* raw color
// literals -- the actual color value still flows through
// the token system. The canonical case is
// `hsl(var(--primary) / 0.35)` which is the design system's
// way of adding alpha to a tokenised color. Allow those
// while still rejecting `hsl(220 18% 8%)`-style raw values.
function isVarReference(args: string): boolean {
  return /\bvar\(/.test(args);
}

// Lines that should be skipped entirely. Multi-line
// JS-doc block comments are stripped first.
const RE_LINE_COMMENT = /\/\/.*$/;
const RE_BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;

// A hex literal must look like an actual CSS color, not
// a substring of some other identifier. The minimum
// "color-like" lengths are 3, 4 (alpha), 6, or 8 hex
// digits -- 5 / 7 digit hex strings are syntactically
// invalid CSS and almost always indicate a different
// hash usage (e.g. a content hash or build id).
function isPlausibleHexColor(literal: string): boolean {
  const hex = literal.slice(1); // drop the leading #
  return hex.length === 3 || hex.length === 4 || hex.length === 6 || hex.length === 8;
}

export function scanSourceForViolations(
  filePath: string,
  contents: string,
): ThemeViolation[] {
  // Strip block comments first so multi-line JSDoc that
  // discusses "use #FFFFFF instead" does not trigger.
  const stripped = contents.replace(RE_BLOCK_COMMENT, '');
  const violations: ThemeViolation[] = [];
  const lines = stripped.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i] ?? '';
    // Strip single-line comments.
    const line = raw.replace(RE_LINE_COMMENT, '');
    if (!line.trim()) continue;

    // Hex color literals.
    for (const match of line.matchAll(RE_HEX)) {
      const literal = match[2]!;
      if (!isPlausibleHexColor(literal)) continue;
      const tail = match[4] ?? '';
      if (looksLikeNaturalLanguageTail(tail)) continue;
      const col = (match.index ?? 0) + (match[1]?.length ?? 0);
      violations.push({
        file: filePath,
        line: i + 1,
        column: col + 1,
        match: literal,
        rule: 'hex-color',
        excerpt: raw.trim(),
      });
    }

    // rgb / rgba function calls. Skip when the arguments
    // are a `var(--token)` reference -- those compose alpha
    // / lightness onto a tokenised color and are canonical
    // in the design system.
    for (const match of line.matchAll(RE_RGB)) {
      const args = match[2] ?? '';
      if (isVarReference(args)) continue;
      violations.push({
        file: filePath,
        line: i + 1,
        column: (match.index ?? 0) + 1,
        match: match[1]!.split('(')[0]! + '(',
        rule: 'rgb-fn',
        excerpt: raw.trim(),
      });
    }

    // hsl / hsla function calls. Same `var(--token)` skip
    // as the rgb branch above.
    for (const match of line.matchAll(RE_HSL)) {
      const args = match[2] ?? '';
      if (isVarReference(args)) continue;
      violations.push({
        file: filePath,
        line: i + 1,
        column: (match.index ?? 0) + 1,
        match: match[1]!.split('(')[0]! + '(',
        rule: 'hsl-fn',
        excerpt: raw.trim(),
      });
    }
  }
  return violations;
}

export function scanFilesForViolations(
  files: readonly string[],
): ThemeViolation[] {
  const out: ThemeViolation[] = [];
  for (const f of files) {
    const contents = readFileSync(f, 'utf8');
    out.push(...scanSourceForViolations(f, contents));
  }
  return out;
}

export function formatViolations(violations: readonly ThemeViolation[]): string {
  if (violations.length === 0) return '';
  return violations
    .map(
      (v) =>
        `  ${v.file}:${v.line}:${v.column}  [${v.rule}]  ${v.match}\n      ${v.excerpt}`,
    )
    .join('\n');
}
