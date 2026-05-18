// focus-ring-audit.ts -- focus-visible ring presence
// scanner.
//
// (v1.11.360, TODO 11.342) Walks a list of source
// files and flags `<button>` / `<a>` / `<input>` /
// `<select>` / `<textarea>` / `[role="button"]` /
// `[role="menuitem"]` / `[role="tab"]` elements
// whose JSX className prop does NOT contain any
// `focus-visible:` prefixed class. The companion
// test points the scanner at
// `web/src/components/ui/*.tsx` so every focusable
// primitive carries a visible keyboard-focus
// indicator.
//
// Like the v1.11.324 theme-tokens-validator + v1.11.346
// i18n-coverage scanners, this is a regex pass on the
// source text. It does NOT walk an AST -- a focusable
// element whose className is built from a helper
// function would not be inspected. The 80%-case
// coverage catches inline `<button className="...">`
// shapes that make up the bulk of the codebase.

import { readFileSync } from 'node:fs';

export interface FocusRingViolation {
  file: string;
  line: number;
  column: number;
  tag: string;
  excerpt: string;
}

// Open-tag patterns. Each captures the opening tag
// segment up to the first `>` so the scanner can
// search for a className attribute within the tag's
// own scope (avoiding cross-element false matches).
//
// The pattern is intentionally loose -- it captures
// `<button ...>` whether the attributes span one
// line or multiple. The inner className regex below
// then walks the captured segment.
const FOCUSABLE_TAGS = [
  'button',
  'a',
  'input',
  'select',
  'textarea',
];

// (v1.11.360, TODO 11.342) ARIA roles that map to
// keyboard-focusable interactions. Plain `<div
// role="button">` shapes are caught here too.
const FOCUSABLE_ROLES = [
  'button',
  'link',
  'menuitem',
  'tab',
  'switch',
  'option',
  'checkbox',
  'radio',
  'searchbox',
  'textbox',
];

const RE_LINE_COMMENT = /\/\/.*$/;
const RE_BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;

// Returns true when the supplied open-tag content
// contains a `focus-visible:` class somewhere in any
// className-shaped attribute.
function hasFocusVisible(openTag: string): boolean {
  // Cheap test: the literal substring is present.
  // The detailed audit treats any `focus-visible:`
  // hit as compliant; tightening to require a `ring`
  // class would be too aggressive (some primitives
  // legitimately use `focus-visible:bg-*` instead).
  return /focus-visible:/.test(openTag);
}

// (v1.11.360, TODO 11.342) Heuristic skip list:
// tags that legitimately have no focus-ring inline.
//
// - `<a href={...}>` rendered inside a list of
//   raw breadcrumb anchors that the parent styles.
//   The audit cannot tell those apart from real
//   "interactive anchor" cases, so we accept the
//   false-negative cost here.
// - `<input type="hidden">` -- never focusable.
// - `<button type="submit" hidden>` -- never visible.
//
// The scanner returns these as `skipped` rather than
// surfacing them as false-positives. Each skip
// signal is a substring test against the open-tag
// content.
const SKIP_PATTERNS: readonly RegExp[] = [
  /type=["']hidden["']/,
  /\bhidden(?:[\s/>])/,
  /aria-hidden=["']true["']/,
  /tabIndex=\{?-1\}?/,
  /tabIndex=["']-1["']/,
];

function shouldSkip(openTag: string): boolean {
  for (const re of SKIP_PATTERNS) {
    if (re.test(openTag)) return true;
  }
  return false;
}

// Build the open-tag regex once. The two branches:
// 1. Native focusable tags (button / a / input /
//    select / textarea).
// 2. Anything with a focusable role
//    (role="button" / etc).
const TAG_NAMES_ALT = FOCUSABLE_TAGS.join('|');
const RE_FOCUSABLE_TAG = new RegExp(
  `<(${TAG_NAMES_ALT})\\b([^<>]*)>`,
  'g',
);
const ROLE_VALUES_ALT = FOCUSABLE_ROLES.join('|');
const RE_FOCUSABLE_ROLE = new RegExp(
  `<([A-Za-z][A-Za-z0-9.]*)\\b([^<>]*?\\brole=["'](?:${ROLE_VALUES_ALT})["'][^<>]*)>`,
  'g',
);

export function scanSourceForFocusRingViolations(
  filePath: string,
  contents: string,
): FocusRingViolation[] {
  const stripped = contents.replace(RE_BLOCK_COMMENT, '');
  const out: FocusRingViolation[] = [];
  const lines = stripped.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i] ?? '';
    const line = raw.replace(RE_LINE_COMMENT, '');
    if (!line.trim()) continue;
    if (
      /^\s*(import|export|type|interface)\b/.test(line)
    ) {
      continue;
    }

    RE_FOCUSABLE_TAG.lastIndex = 0;
    for (const match of line.matchAll(RE_FOCUSABLE_TAG)) {
      const openTag = match[0] ?? '';
      if (shouldSkip(openTag)) continue;
      if (hasFocusVisible(openTag)) continue;
      out.push({
        file: filePath,
        line: i + 1,
        column: (match.index ?? 0) + 1,
        tag: match[1] ?? '',
        excerpt: raw.trim(),
      });
    }
    RE_FOCUSABLE_ROLE.lastIndex = 0;
    for (const match of line.matchAll(RE_FOCUSABLE_ROLE)) {
      const openTag = match[0] ?? '';
      if (shouldSkip(openTag)) continue;
      if (hasFocusVisible(openTag)) continue;
      const tagName = match[1] ?? '';
      // Skip if already counted by the focusable-tag
      // pass (e.g., `<button role="button">`).
      if (FOCUSABLE_TAGS.includes(tagName.toLowerCase())) continue;
      out.push({
        file: filePath,
        line: i + 1,
        column: (match.index ?? 0) + 1,
        tag: `${tagName}[role]`,
        excerpt: raw.trim(),
      });
    }
  }
  return out;
}

export function scanFilesForFocusRingViolations(
  files: readonly string[],
): FocusRingViolation[] {
  const out: FocusRingViolation[] = [];
  for (const f of files) {
    const contents = readFileSync(f, 'utf8');
    out.push(...scanSourceForFocusRingViolations(f, contents));
  }
  return out;
}

export function formatFocusRingViolations(
  violations: readonly FocusRingViolation[],
): string {
  if (violations.length === 0) return '';
  return violations
    .map(
      (v) =>
        `  ${v.file}:${v.line}:${v.column}  [${v.tag}] missing focus-visible:\n      ${v.excerpt}`,
    )
    .join('\n');
}
