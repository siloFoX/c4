// (v1.11.345, TODO 11.327) CI-runnable axe-core helper.
//
// Wraps the axe-core `run` API in a vitest-friendly shape
// so a `pageA11yCheck(container)` call returns a list of
// human-readable accessibility violations the assertion
// can fail against. Used by per-page / per-primitive
// tests under `web/src/pages/*.test.tsx` and the
// UIDemoRoute audit harness.
//
// Why not jest-axe? jest-axe pulls in jest-specific
// matchers (`toHaveNoViolations`). Vitest has its own
// expect surface and `expect.extend` works fine, but
// adding the dep is unnecessary -- we can talk to
// axe-core directly in <60 lines and keep the test
// surface API-stable across vitest upgrades.
//
// Why a pure helper instead of a custom matcher? A
// helper that returns `{ violations: [] }` lets the
// caller compose the assertion (skip, allow-list, scope
// the violation count) more naturally than a binary
// `.toHaveNoViolations()` matcher.

import axe from 'axe-core';

export interface A11yViolationDetail {
  id: string;
  impact: string | undefined;
  description: string;
  helpUrl: string;
  nodes: number;
  selectors: string[];
}

export interface A11yResult {
  violations: A11yViolationDetail[];
  ok: boolean;
  summary: string;
}

// (v1.11.345, TODO 11.327) Default axe ruleset. Targets
// WCAG 2.1 AA and the "best practice" tag so the report
// covers the four dispatch buckets:
//   - missing aria-label  -> button-name / aria-allowed-attr
//   - contrast            -> color-contrast (jsdom -> skipped
//                            at runtime because jsdom does
//                            not resolve computed colors,
//                            but listed for parity)
//   - focus traps         -> aria-modal / focus-order-semantics
//   - heading order       -> heading-order
//
// Callers can override via opts.runOptions for narrower
// scans (e.g., only `aria-allowed-attr`) or skip rules
// that are known false-positives in jsdom.
export interface PageA11yCheckOpts {
  runOptions?: axe.RunOptions;
  // Skip these rule ids entirely. Default skip list
  // targets rules that need a real browser layout to
  // evaluate (jsdom does not compute applied styles).
  skipRules?: readonly string[];
}

const JSDOM_DEFAULT_SKIP: readonly string[] = [
  // color-contrast requires getComputedStyle() to
  // resolve Tailwind utility-class backgrounds + text
  // colors to RGB triples. jsdom returns "" for
  // utility-class backgrounds, so axe reports
  // false-positive contrast failures on every node.
  // The dispatch lists contrast as an audit target;
  // covering it requires a real browser harness
  // (Playwright + computed-style sampling). Documented
  // in docs/patches/11.327-ui-a11y-audit.md.
  'color-contrast',
  // landmark-one-main fires when the test container
  // does NOT carry role=main. Per-component tests
  // render snippets, not full pages, so the rule is
  // out of scope.
  'landmark-one-main',
  // region rule complains when content sits outside
  // a landmark. Same scope mismatch as above.
  'region',
  // page-has-heading-one expects an h1 in every test
  // page; primitives are tested in isolation, so
  // dropping it is correct here.
  'page-has-heading-one',
];

export async function pageA11yCheck(
  container: Element,
  opts: PageA11yCheckOpts = {},
): Promise<A11yResult> {
  const skipRules = opts.skipRules ?? JSDOM_DEFAULT_SKIP;
  const runOptions: axe.RunOptions = {
    ...opts.runOptions,
    rules: {
      ...(opts.runOptions?.rules ?? {}),
      ...Object.fromEntries(skipRules.map((id) => [id, { enabled: false }])),
    },
  };

  const result = await axe.run(container, runOptions);
  const violations: A11yViolationDetail[] = result.violations.map((v) => ({
    id: v.id,
    impact: v.impact ?? undefined,
    description: v.description,
    helpUrl: v.helpUrl,
    nodes: v.nodes.length,
    selectors: v.nodes
      .map((n) => (Array.isArray(n.target) ? n.target.join(' ') : String(n.target)))
      .slice(0, 5),
  }));

  return {
    violations,
    ok: violations.length === 0,
    summary: formatA11ySummary(violations),
  };
}

export function formatA11ySummary(violations: readonly A11yViolationDetail[]): string {
  if (violations.length === 0) return 'no a11y violations';
  return violations
    .map((v) => {
      const head = `[${v.impact ?? '?'}] ${v.id}: ${v.description} (${v.nodes} node${v.nodes === 1 ? '' : 's'})`;
      const tail = v.selectors.length > 0 ? `\n    selectors: ${v.selectors.join(' | ')}` : '';
      const link = `\n    help: ${v.helpUrl}`;
      return `  ${head}${tail}${link}`;
    })
    .join('\n');
}

// (v1.11.345, TODO 11.327) Convenience expectation
// helper. Throws a single human-readable Error when
// the result has violations so vitest renders a
// concise failure report instead of a giant axe
// payload dump.
export function expectNoA11yViolations(result: A11yResult): void {
  if (result.ok) return;
  throw new Error(
    `Accessibility check failed -- ${result.violations.length} violation${result.violations.length === 1 ? '' : 's'}:\n${result.summary}`,
  );
}
