// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  pageA11yCheck,
  formatA11ySummary,
  expectNoA11yViolations,
} from './axe';

// (v1.11.345, TODO 11.327) Unit coverage for the axe-vitest
// helper. The helper is intentionally thin; the assertions
// below verify the shape of its return values, the default
// jsdom skip list, and the summary formatter, plus one
// happy-path + one failing-path scan against a hand-rolled
// DOM fragment.

function makeFragment(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}

describe('pageA11yCheck', () => {
  it('returns ok=true and empty violations for an accessible button', async () => {
    const root = makeFragment(
      '<button type="button">Submit</button>',
    );
    const result = await pageA11yCheck(root);
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.summary).toBe('no a11y violations');
    root.remove();
  });

  it('flags a button with no accessible name', async () => {
    const root = makeFragment(
      '<button type="button"></button>',
    );
    const result = await pageA11yCheck(root);
    expect(result.ok).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
    // button-name is the canonical axe rule for empty
    // <button> with no aria-label / aria-labelledby / text.
    expect(result.violations.some((v) => v.id === 'button-name')).toBe(true);
    root.remove();
  });

  it('flags an <img> with no alt attribute', async () => {
    const root = makeFragment(
      '<img src="/x.png">',
    );
    const result = await pageA11yCheck(root);
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.id === 'image-alt')).toBe(true);
    root.remove();
  });

  it('skips the contrast rule by default (jsdom limitation)', async () => {
    const root = makeFragment(
      '<div style="background:#000;color:#222">low contrast</div>',
    );
    const result = await pageA11yCheck(root);
    // The contrast rule is in the default skip list, so
    // a "would-be" failure should not surface.
    expect(result.violations.some((v) => v.id === 'color-contrast')).toBe(false);
    root.remove();
  });

  it('honours a caller-supplied skipRules override', async () => {
    const root = makeFragment(
      '<button type="button"></button>',
    );
    // Disable the button-name rule explicitly -- the
    // result should still surface as ok=false because
    // axe finds other empty-button issues, but
    // button-name should not be among them.
    const result = await pageA11yCheck(root, {
      skipRules: ['button-name', 'color-contrast'],
    });
    expect(
      result.violations.find((v) => v.id === 'button-name'),
    ).toBeUndefined();
    root.remove();
  });

  it('reports the selector and node count for every violation', async () => {
    const root = makeFragment(
      '<button type="button"></button><img src="/x.png">',
    );
    const result = await pageA11yCheck(root);
    expect(result.ok).toBe(false);
    for (const v of result.violations) {
      expect(typeof v.id).toBe('string');
      expect(v.nodes).toBeGreaterThan(0);
      expect(Array.isArray(v.selectors)).toBe(true);
    }
    root.remove();
  });
});

describe('formatA11ySummary', () => {
  it('returns "no a11y violations" for an empty list', () => {
    expect(formatA11ySummary([])).toBe('no a11y violations');
  });

  it('formats each violation with id, impact, description, node count, and help URL', () => {
    const out = formatA11ySummary([
      {
        id: 'button-name',
        impact: 'critical',
        description: 'Buttons must have discernible text',
        helpUrl: 'https://example.com/button-name',
        nodes: 2,
        selectors: ['button.a', 'button.b'],
      },
    ]);
    expect(out).toContain('button-name');
    expect(out).toContain('critical');
    expect(out).toContain('Buttons must have discernible text');
    expect(out).toContain('2 nodes');
    expect(out).toContain('button.a');
    expect(out).toContain('button.b');
    expect(out).toContain('https://example.com/button-name');
  });

  it('uses "1 node" (singular) when the violation hits a single node', () => {
    const out = formatA11ySummary([
      {
        id: 'image-alt',
        impact: 'critical',
        description: 'desc',
        helpUrl: 'h',
        nodes: 1,
        selectors: ['img'],
      },
    ]);
    expect(out).toContain('1 node)');
    expect(out).not.toContain('1 nodes)');
  });

  it('handles violations with no impact (falls back to "?")', () => {
    const out = formatA11ySummary([
      {
        id: 'x',
        impact: undefined,
        description: 'd',
        helpUrl: 'h',
        nodes: 1,
        selectors: [],
      },
    ]);
    expect(out).toContain('[?]');
  });
});

describe('expectNoA11yViolations', () => {
  it('is a no-op when result.ok is true', () => {
    expect(() =>
      expectNoA11yViolations({
        ok: true,
        violations: [],
        summary: 'no a11y violations',
      }),
    ).not.toThrow();
  });

  it('throws a human-readable error when result.ok is false', () => {
    expect(() =>
      expectNoA11yViolations({
        ok: false,
        violations: [
          {
            id: 'button-name',
            impact: 'critical',
            description: 'Buttons must have discernible text',
            helpUrl: 'https://example.com',
            nodes: 1,
            selectors: ['button'],
          },
        ],
        summary:
          '  [critical] button-name: Buttons must have discernible text (1 node)',
      }),
    ).toThrow(/button-name/);
  });

  it('pluralises the leading "N violations" count', () => {
    try {
      expectNoA11yViolations({
        ok: false,
        violations: [
          { id: 'a', impact: 'minor', description: 'd', helpUrl: 'h', nodes: 1, selectors: [] },
          { id: 'b', impact: 'minor', description: 'd', helpUrl: 'h', nodes: 1, selectors: [] },
        ],
        summary: '',
      });
      throw new Error('did not throw');
    } catch (e) {
      expect((e as Error).message).toContain('2 violations');
    }
  });
});
