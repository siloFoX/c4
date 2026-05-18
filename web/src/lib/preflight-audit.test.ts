// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  formatPreflightOverrides,
  scanFilesForPreflightOverrides,
  scanSourceForPreflightOverrides,
} from './preflight-audit';

describe('scanSourceForPreflightOverrides (unit)', () => {
  it('returns an empty array for CSS with no universal selectors', () => {
    const css = `
      .button { color: red; }
      body { margin: 0; }
    `;
    expect(scanSourceForPreflightOverrides('x.css', css)).toEqual([]);
  });

  it('flags a top-level universal selector', () => {
    const css = `
      * {
        margin: 0;
      }
    `;
    const out = scanSourceForPreflightOverrides('x.css', css);
    expect(out).toHaveLength(1);
    expect(out[0]?.selector).toBe('*');
    expect(out[0]?.rule).toBe('universal-selector');
  });

  it('flags a universal pseudo-element selector', () => {
    const css = `
      *::-webkit-scrollbar {
        width: 10px;
      }
    `;
    const out = scanSourceForPreflightOverrides('x.css', css);
    expect(out).toHaveLength(1);
    expect(out[0]?.selector).toBe('*::-webkit-scrollbar');
    expect(out[0]?.rule).toBe('universal-pseudo');
  });

  it('does NOT flag a compound selector containing *', () => {
    const css = `
      .container > * {
        margin-top: 8px;
      }
    `;
    const out = scanSourceForPreflightOverrides('x.css', css);
    expect(out).toEqual([]);
  });

  it('does NOT flag an attribute selector that happens to include *', () => {
    const css = `
      [class*="prefix-"] {
        color: red;
      }
    `;
    const out = scanSourceForPreflightOverrides('x.css', css);
    expect(out).toEqual([]);
  });

  it('skips block-commented universal selectors', () => {
    const css = `
      /* * { margin: 0; } */
      .real { color: red; }
    `;
    const out = scanSourceForPreflightOverrides('x.css', css);
    expect(out).toEqual([]);
  });

  it('reports file/line for every override', () => {
    const css = `line1\nline2\n* {\n  margin: 0;\n}\n`;
    const out = scanSourceForPreflightOverrides('foo.css', css);
    expect(out).toHaveLength(1);
    expect(out[0]?.file).toBe('foo.css');
    expect(out[0]?.line).toBe(3);
  });

  it('reports multiple overrides in the same source', () => {
    const css = `
      * { box-sizing: border-box; }
      *::-webkit-scrollbar { width: 10px; }
      *::-webkit-scrollbar-track { background: transparent; }
    `;
    const out = scanSourceForPreflightOverrides('x.css', css);
    expect(out).toHaveLength(3);
    const rules = out.map((o) => o.rule).sort();
    expect(rules).toEqual([
      'universal-pseudo',
      'universal-pseudo',
      'universal-selector',
    ]);
  });

  it('handles universal selectors inside @layer blocks', () => {
    const css = `
      @layer base {
        * {
          border-color: var(--border);
        }
      }
    `;
    const out = scanSourceForPreflightOverrides('x.css', css);
    expect(out).toHaveLength(1);
    expect(out[0]?.selector).toBe('*');
  });

  it('treats `*::pseudo(arg)` as a universal-pseudo selector', () => {
    const css = `*:where(.foo) { color: red; }`;
    const out = scanSourceForPreflightOverrides('x.css', css);
    // Note: this catches `*:where(.foo)` because the
    // pattern allows pseudo-selectors with single-arg
    // parentheses.
    expect(out).toHaveLength(1);
    expect(out[0]?.rule).toBe('universal-pseudo');
  });
});

describe('formatPreflightOverrides', () => {
  it('returns an empty string when no overrides', () => {
    expect(formatPreflightOverrides([])).toBe('');
  });

  it('includes file:line + selector + excerpt', () => {
    const out = formatPreflightOverrides([
      {
        file: 'index.css',
        line: 10,
        selector: '*',
        rule: 'universal-selector',
        excerpt: '* {',
      },
    ]);
    expect(out).toContain('index.css:10');
    expect(out).toContain('universal-selector');
    expect(out).toContain('*');
  });
});

// (v1.11.361, TODO 11.343) Integration audit against
// the project's index.css. The known overrides are
// PINNED: the test asserts the catalogue stays stable
// across releases so an accidental new override
// surfaces as a CI failure.
//
// The known overrides as of v1.11.361:
//
//   * `* { @apply border-border }`            (line ~143)
//   * `* { scrollbar-width / color }`          (line ~166)
//   * `*::-webkit-scrollbar`                   (line ~171)
//   * `*::-webkit-scrollbar-track`             (line ~175)
//   * `*::-webkit-scrollbar-thumb`             (line ~178)
//   * `*::-webkit-scrollbar-thumb:hover`       (line ~184)
//   * `*::-webkit-scrollbar-corner`            (line ~188)
//
// = 7 known overrides. Bump the constant when a new
// intentional override lands; investigate when the
// count grows unexpectedly.
export const MAX_KNOWN_PREFLIGHT_OVERRIDES = 7;

describe('preflight-audit (integration: web/src/index.css)', () => {
  it('the project index.css has no NEW universal selectors beyond the known baseline', () => {
    const css = resolve(__dirname, '..', 'index.css');
    const overrides = scanFilesForPreflightOverrides([css]);
    if (overrides.length > MAX_KNOWN_PREFLIGHT_OVERRIDES) {
      const overage =
        overrides.length - MAX_KNOWN_PREFLIGHT_OVERRIDES;
      const summary = `\npreflight-audit regression: ${overrides.length} universal selectors (+${overage} vs baseline ${MAX_KNOWN_PREFLIGHT_OVERRIDES}):\n${formatPreflightOverrides(overrides)}\n\nDocument the new override in docs/patches/ and bump MAX_KNOWN_PREFLIGHT_OVERRIDES.`;
      throw new Error(summary);
    }
    expect(overrides.length).toBeLessThanOrEqual(
      MAX_KNOWN_PREFLIGHT_OVERRIDES,
    );
  });

  it('the index.css preflight setup is preserved (border-border + bg-background)', () => {
    const css = resolve(__dirname, '..', 'index.css');
    const contents = readFileSync(css, 'utf8');
    // Spot-check the canonical shadcn preflight
    // extensions are still present.
    expect(contents).toMatch(/@apply border-border/);
    expect(contents).toMatch(/@apply bg-background text-foreground/);
  });
});
