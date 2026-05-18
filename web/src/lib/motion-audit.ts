// motion-audit.ts -- animation policy enforcer.
//
// (v1.11.348, TODO 11.330) Companion to the v1.11.323
// `motion.ts` helpers. Scans component source files for
// animation utility classes that bypass the
// reduced-motion contract:
//
//   * `animate-in` / `animate-out` keyframe classes
//     must be inside a `motion-safe:` modifier group OR
//     gated by a `useReducedMotion()` check.
//   * `transition-*` utility classes are allowed
//     unconditionally because Tailwind's
//     `transition-property` honours the user's
//     `prefers-reduced-motion` preference at the CSS
//     layer (the browser drops the transition when the
//     OS-level flag is on).
//   * `animate-spin` / `animate-pulse` are the two
//     loading-state animations the design system treats
//     as "essential motion" (the user needs to see
//     something is in progress); they bypass the
//     reduced-motion gate by design.
//
// The scanner is a regex pass on the source text. Like
// the theme-tokens-validator + i18n-coverage scanners,
// it does NOT walk an AST; the heuristic catches the
// common foot-gun (`animate-in` without `motion-safe:`)
// and skips comments before matching.

import { readFileSync } from 'node:fs';

export type MotionRule =
  | 'animate-in-unsafe'
  | 'animate-out-unsafe';

export interface MotionViolation {
  file: string;
  line: number;
  column: number;
  match: string;
  rule: MotionRule;
  excerpt: string;
}

// Matches the literal `animate-in` / `animate-out`
// class token plus everything up to the next
// whitespace / quote / closing tag so the excerpt
// captures the full class name (e.g.
// `animate-in fade-in duration-200`).
const RE_ANIMATE_IN = /\banimate-in\b/g;
const RE_ANIMATE_OUT = /\banimate-out\b/g;

const RE_LINE_COMMENT = /\/\/.*$/;
const RE_BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;

// Returns the slice of `line` that precedes `index`. Used
// by the safety check to detect whether the `animate-*`
// match sits inside a `motion-safe:animate-*` token or a
// `motion-safe:[...animate-...]` arbitrary-value group.
function precedingChunk(line: string, index: number): string {
  // Walk back to the previous whitespace / quote / `{`
  // boundary so the chunk approximates the active
  // class-name token.
  let start = index;
  while (start > 0) {
    const ch = line[start - 1];
    if (ch === undefined) break;
    if (ch === ' ' || ch === '\t' || ch === "'" || ch === '"' || ch === '`'
        || ch === '{' || ch === '(') {
      break;
    }
    start -= 1;
  }
  return line.slice(start, index);
}

// (v1.11.348, TODO 11.330) Skip when the active token
// already carries a `motion-safe:` prefix or the file
// references `useReducedMotion` somewhere on the same
// or an earlier line (signals the consumer manages the
// gate manually).
function isMotionSafe(line: string, index: number, fileSrc: string): boolean {
  const chunk = precedingChunk(line, index);
  if (chunk.includes('motion-safe:')) return true;
  // Hand-rolled gate: when the surrounding file uses
  // `useReducedMotion()`, treat the unprefixed match as
  // an explicit choice (the component owns the gate via
  // a conditional class string).
  if (fileSrc.includes('useReducedMotion')) return true;
  // Or via the motionClass / useMotionClass helpers.
  if (fileSrc.includes('useMotionClass') || fileSrc.includes('motionClass(')) {
    return true;
  }
  return false;
}

export function scanSourceForMotionViolations(
  filePath: string,
  contents: string,
): MotionViolation[] {
  const stripped = contents.replace(RE_BLOCK_COMMENT, '');
  const out: MotionViolation[] = [];
  const lines = stripped.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i] ?? '';
    const line = raw.replace(RE_LINE_COMMENT, '');
    if (!line.trim()) continue;

    for (const match of line.matchAll(RE_ANIMATE_IN)) {
      const col = match.index ?? 0;
      if (isMotionSafe(line, col, stripped)) continue;
      out.push({
        file: filePath,
        line: i + 1,
        column: col + 1,
        match: 'animate-in',
        rule: 'animate-in-unsafe',
        excerpt: raw.trim(),
      });
    }

    for (const match of line.matchAll(RE_ANIMATE_OUT)) {
      const col = match.index ?? 0;
      if (isMotionSafe(line, col, stripped)) continue;
      out.push({
        file: filePath,
        line: i + 1,
        column: col + 1,
        match: 'animate-out',
        rule: 'animate-out-unsafe',
        excerpt: raw.trim(),
      });
    }
  }
  return out;
}

export function scanFilesForMotionViolations(
  files: readonly string[],
): MotionViolation[] {
  const out: MotionViolation[] = [];
  for (const f of files) {
    const contents = readFileSync(f, 'utf8');
    out.push(...scanSourceForMotionViolations(f, contents));
  }
  return out;
}

export function formatMotionViolations(
  violations: readonly MotionViolation[],
): string {
  if (violations.length === 0) return '';
  return violations
    .map(
      (v) =>
        `  ${v.file}:${v.line}:${v.column}  [${v.rule}]  ${v.match}\n      ${v.excerpt}`,
    )
    .join('\n');
}
