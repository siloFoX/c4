// preflight-audit.ts -- Tailwind preflight override
// scanner.
//
// (v1.11.361, TODO 11.343) Tailwind's `preflight`
// layer normalises browser defaults (margin/padding
// zeroing, font-family inheritance, list-style
// removal, button reset, etc). Projects sometimes
// override preflight to:
//
//   1. Re-introduce a global default that fits the
//      design language (e.g., `* { @apply border-border
//      }` to seed the design token's border color
//      on every element). These are intentional.
//   2. Re-style scrollbars, focus rings, or other
//      cross-cutting visual concerns. Also
//      intentional.
//   3. Accidentally re-introduce a browser default
//      that competes with the design system (e.g.,
//      a stray `* { margin: 8px }` that breaks every
//      flex layout). These are the regressions the
//      audit catches.
//
// This module scans CSS source files for top-level
// `* { ... }` and `*::pseudo { ... }` selectors and
// reports each one with file/line/snippet. The
// integration test pins the known overrides as a
// baseline; a new universal selector beyond the
// baseline fails CI.
//
// The scanner is regex-based and intentionally narrow
// -- only "top-level universal selectors" are flagged
// (i.e., selectors that start with `*` at the
// beginning of a CSS rule, possibly with a pseudo
// suffix). Compound selectors like `.foo *` are NOT
// flagged because they are scoped to a specific
// parent and do not constitute a global override.

import { readFileSync } from 'node:fs';

export type PreflightRule =
  | 'universal-selector'
  | 'universal-pseudo';

export interface PreflightOverride {
  file: string;
  line: number;
  selector: string;
  rule: PreflightRule;
  excerpt: string;
}

// Matches the start of a top-level CSS rule whose
// selector starts with `*` (universal selector). The
// pattern looks for `*` (optionally followed by a
// pseudo-element like `::-webkit-scrollbar`) followed
// by `{`. Whitespace tolerant.
//
// Negative matches:
//   - `.foo *` (compound, scoped to .foo)
//   - `*.foo` (universal + class -- still narrow)
//
// The leading boundary requirement is "preceded by
// start-of-line, `}`, or whitespace-only context" to
// avoid catching `*` inside selectors like `.foo > *`.
const RE_UNIVERSAL = /(^|[\n};])(\s*)(\*((?:::?[a-zA-Z-]+(?:\([^)]*\))?)?))(?=\s*\{)/g;

const RE_LINE_COMMENT = /\/\/.*$/;
const RE_BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;

export function scanSourceForPreflightOverrides(
  filePath: string,
  contents: string,
): PreflightOverride[] {
  // Strip block comments first so commented-out
  // CSS doesn't trigger.
  const stripped = contents.replace(RE_BLOCK_COMMENT, '');
  const out: PreflightOverride[] = [];
  // Track line numbers as we walk.
  const lines = stripped.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i] ?? '';
    const line = raw.replace(RE_LINE_COMMENT, '');
    if (!line.trim()) continue;
    RE_UNIVERSAL.lastIndex = 0;
    for (const match of line.matchAll(RE_UNIVERSAL)) {
      const selector = match[3] ?? '';
      const isPseudo = selector.length > 1; // `*` + `::pseudo`
      out.push({
        file: filePath,
        line: i + 1,
        selector,
        rule: isPseudo ? 'universal-pseudo' : 'universal-selector',
        excerpt: raw.trim(),
      });
    }
  }
  return out;
}

export function scanFilesForPreflightOverrides(
  files: readonly string[],
): PreflightOverride[] {
  const out: PreflightOverride[] = [];
  for (const f of files) {
    const contents = readFileSync(f, 'utf8');
    out.push(...scanSourceForPreflightOverrides(f, contents));
  }
  return out;
}

export function formatPreflightOverrides(
  overrides: readonly PreflightOverride[],
): string {
  if (overrides.length === 0) return '';
  return overrides
    .map(
      (o) =>
        `  ${o.file}:${o.line}  [${o.rule}]  ${o.selector}\n      ${o.excerpt}`,
    )
    .join('\n');
}
