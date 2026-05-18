// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  formatFocusRingViolations,
  scanFilesForFocusRingViolations,
  scanSourceForFocusRingViolations,
} from './focus-ring-audit';

describe('focus-ring-audit (unit)', () => {
  it('returns an empty array for a source with no focusable tags', () => {
    const source = `<div>hello</div>`;
    expect(scanSourceForFocusRingViolations('x.tsx', source)).toEqual([]);
  });

  it('flags a <button> without a focus-visible class', () => {
    const source = `<button className="bg-primary">save</button>`;
    const v = scanSourceForFocusRingViolations('x.tsx', source);
    expect(v).toHaveLength(1);
    expect(v[0]?.tag).toBe('button');
  });

  it('does NOT flag a <button> with focus-visible:ring-2', () => {
    const source = `<button className="bg-primary focus-visible:ring-2 focus-visible:ring-primary">save</button>`;
    expect(scanSourceForFocusRingViolations('x.tsx', source)).toEqual([]);
  });

  it('flags <a href>, <input>, <select>, <textarea> with no focus-visible class', () => {
    const source = `
      <a href="#">link</a>
      <input type="text" />
      <select><option>x</option></select>
      <textarea />
    `;
    const v = scanSourceForFocusRingViolations('x.tsx', source);
    const tags = v.map((x) => x.tag).sort();
    expect(tags).toEqual(['a', 'input', 'select', 'textarea']);
  });

  it('does NOT flag <input type="hidden">', () => {
    const source = `<input type="hidden" name="x" />`;
    expect(scanSourceForFocusRingViolations('x.tsx', source)).toEqual([]);
  });

  it('does NOT flag elements with aria-hidden="true"', () => {
    const source = `<button aria-hidden="true">x</button>`;
    expect(scanSourceForFocusRingViolations('x.tsx', source)).toEqual([]);
  });

  it('does NOT flag elements with tabIndex={-1}', () => {
    const source = `<button tabIndex={-1}>x</button>`;
    expect(scanSourceForFocusRingViolations('x.tsx', source)).toEqual([]);
  });

  it('does NOT flag elements with tabIndex="-1"', () => {
    const source = `<div role="button" tabIndex="-1">x</div>`;
    expect(scanSourceForFocusRingViolations('x.tsx', source)).toEqual([]);
  });

  it('flags a custom component with role="button" but no focus-visible', () => {
    const source = `<MyBox role="button" tabIndex={0}>click</MyBox>`;
    const v = scanSourceForFocusRingViolations('x.tsx', source);
    expect(v).toHaveLength(1);
    expect(v[0]?.tag).toBe('MyBox[role]');
  });

  it('does NOT flag a custom component with role="button" + focus-visible:ring', () => {
    const source = `<MyBox role="button" tabIndex={0} className="focus-visible:ring-2">click</MyBox>`;
    expect(scanSourceForFocusRingViolations('x.tsx', source)).toEqual([]);
  });

  it('does NOT double-count native button with role="button"', () => {
    const source = `<button role="button" className="bg-primary">x</button>`;
    const v = scanSourceForFocusRingViolations('x.tsx', source);
    // Only the native-tag rule fires; the role rule
    // skips when the tag name is in FOCUSABLE_TAGS.
    expect(v).toHaveLength(1);
    expect(v[0]?.tag).toBe('button');
  });

  it('flags every role variant the scanner covers', () => {
    const source = `
      <div role="link" tabIndex={0}>l</div>
      <div role="menuitem" tabIndex={0}>m</div>
      <div role="tab" tabIndex={0}>t</div>
      <div role="switch" tabIndex={0}>s</div>
    `;
    const v = scanSourceForFocusRingViolations('x.tsx', source);
    expect(v.length).toBeGreaterThanOrEqual(4);
  });

  it('skips block-commented + line-commented samples', () => {
    const source = `
      /* <button>x</button> */
      // <button>y</button>
    `;
    expect(scanSourceForFocusRingViolations('x.tsx', source)).toEqual([]);
  });

  it('reports file/line/column for every violation', () => {
    const source = `line one\n\n  <button>x</button>`;
    const v = scanSourceForFocusRingViolations('foo.tsx', source);
    expect(v).toHaveLength(1);
    expect(v[0]?.file).toBe('foo.tsx');
    expect(v[0]?.line).toBe(3);
    expect(v[0]?.column).toBeGreaterThan(0);
  });

  it('skips lines starting with import / export / type / interface', () => {
    const source = `import { Button } from './button';\nexport type X = '<button>x</button>';`;
    expect(scanSourceForFocusRingViolations('x.tsx', source)).toEqual([]);
  });

  it('formatFocusRingViolations returns empty string for no violations', () => {
    expect(formatFocusRingViolations([])).toBe('');
  });

  it('formatFocusRingViolations includes file:line:column + tag + excerpt', () => {
    const v = scanSourceForFocusRingViolations(
      'demo.tsx',
      `<button>save</button>`,
    );
    const out = formatFocusRingViolations(v);
    expect(out).toContain('demo.tsx:1');
    expect(out).toContain('[button]');
    expect(out).toContain('save');
  });
});

// (v1.11.360, TODO 11.342) Pages + UI primitives
// integration scan. The audit is a ratchet: violation
// count must not grow beyond the recorded baseline.
// When a follow-up patch wires focus-visible:* on an
// existing missing element, lower the constant.
export const MAX_KNOWN_FOCUS_RING_VIOLATIONS = 1;

describe('focus-ring-audit (integration: components/ui + pages)', () => {
  it('focus-ring violation count stays at or below the known baseline', () => {
    const uiDir = resolve(__dirname, '..', 'components', 'ui');
    const pagesDir = resolve(__dirname, '..', 'pages');
    const files = [
      ...readdirSync(uiDir)
        .filter((n) => n.endsWith('.tsx') && !n.endsWith('.test.tsx'))
        .map((n) => join(uiDir, n)),
      ...readdirSync(pagesDir)
        .filter((n) => n.endsWith('.tsx') && !n.endsWith('.test.tsx'))
        .map((n) => join(pagesDir, n)),
    ];
    expect(files.length).toBeGreaterThan(20);
    const violations = scanFilesForFocusRingViolations(files);
    if (violations.length > MAX_KNOWN_FOCUS_RING_VIOLATIONS) {
      const overage =
        violations.length - MAX_KNOWN_FOCUS_RING_VIOLATIONS;
      const summary = `\nfocus-ring regression: ${violations.length} violations (+${overage} vs baseline ${MAX_KNOWN_FOCUS_RING_VIOLATIONS}):\n${formatFocusRingViolations(violations)}\n\nAdd focus-visible:ring-2 focus-visible:ring-primary OR lower MAX_KNOWN_FOCUS_RING_VIOLATIONS to the new count.`;
      throw new Error(summary);
    }
    expect(violations.length).toBeLessThanOrEqual(
      MAX_KNOWN_FOCUS_RING_VIOLATIONS,
    );
  });
});
