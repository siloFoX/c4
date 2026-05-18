// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  scanFilesForMotionViolations,
  scanSourceForMotionViolations,
  formatMotionViolations,
} from './motion-audit';

describe('motion-audit (unit)', () => {
  it('flags animate-in without a motion-safe: prefix', () => {
    const source = `<div className="animate-in fade-in" />`;
    const v = scanSourceForMotionViolations('foo.tsx', source);
    expect(v.length).toBe(1);
    expect(v[0]?.rule).toBe('animate-in-unsafe');
    expect(v[0]?.match).toBe('animate-in');
  });

  it('flags animate-out without a motion-safe: prefix', () => {
    const source = `<div className="animate-out fade-out" />`;
    const v = scanSourceForMotionViolations('foo.tsx', source);
    expect(v.length).toBe(1);
    expect(v[0]?.rule).toBe('animate-out-unsafe');
  });

  it('does NOT flag motion-safe:animate-in', () => {
    const source = `<div className="motion-safe:animate-in motion-safe:fade-in" />`;
    const v = scanSourceForMotionViolations('foo.tsx', source);
    expect(v.length).toBe(0);
  });

  it('does NOT flag a file that imports useReducedMotion (component manages the gate manually)', () => {
    const source = [
      `import { useReducedMotion } from '../hooks/use-reduced-motion';`,
      `function Foo() {`,
      `  const rm = useReducedMotion();`,
      `  return <div className={rm ? '' : 'animate-in fade-in'} />;`,
      `}`,
    ].join('\n');
    const v = scanSourceForMotionViolations('foo.tsx', source);
    expect(v.length).toBe(0);
  });

  it('does NOT flag a file that uses useMotionClass / motionClass()', () => {
    const sourceA = [
      `import { useMotionClass } from '../lib/motion';`,
      `function Foo() {`,
      `  const cls = useMotionClass('fadeIn');`,
      `  return <div className={cls} />;`,
      `}`,
    ].join('\n');
    expect(scanSourceForMotionViolations('a.tsx', sourceA).length).toBe(0);
    const sourceB = `const x = motionClass('fadeIn', false); <div className="animate-in" />`;
    expect(scanSourceForMotionViolations('b.tsx', sourceB).length).toBe(0);
  });

  it('does NOT flag animate-spin (essential motion preset)', () => {
    const source = `<svg className="animate-spin" />`;
    const v = scanSourceForMotionViolations('foo.tsx', source);
    expect(v.length).toBe(0);
  });

  it('does NOT flag animate-pulse (essential motion preset)', () => {
    const source = `<span className="animate-pulse" />`;
    const v = scanSourceForMotionViolations('foo.tsx', source);
    expect(v.length).toBe(0);
  });

  it('skips block-commented animate-in references', () => {
    const source = `/* <div className="animate-in fade-in" /> */`;
    const v = scanSourceForMotionViolations('foo.tsx', source);
    expect(v.length).toBe(0);
  });

  it('skips // line-commented animate-in references', () => {
    const source = `// <div className="animate-in fade-in" />`;
    const v = scanSourceForMotionViolations('foo.tsx', source);
    expect(v.length).toBe(0);
  });

  it('reports file/line/column for every violation', () => {
    const source = `line one\n\n  <div className="animate-in fade-in" />`;
    const v = scanSourceForMotionViolations('foo.tsx', source);
    expect(v.length).toBe(1);
    expect(v[0]?.line).toBe(3);
    expect(v[0]?.file).toBe('foo.tsx');
  });

  it('handles both animate-in and animate-out in the same source', () => {
    const source = `<div className="animate-in fade-in animate-out fade-out" />`;
    const v = scanSourceForMotionViolations('foo.tsx', source);
    expect(v.length).toBe(2);
    expect(v.map((x) => x.rule).sort()).toEqual([
      'animate-in-unsafe',
      'animate-out-unsafe',
    ]);
  });

  it('formatMotionViolations() yields an empty string for an empty array', () => {
    expect(formatMotionViolations([])).toBe('');
  });

  it('formatMotionViolations() includes file:line:col + rule + match', () => {
    const v = scanSourceForMotionViolations(
      'demo.tsx',
      `<div className="animate-in" />`,
    );
    const out = formatMotionViolations(v);
    expect(out).toContain('demo.tsx:1');
    expect(out).toContain('animate-in-unsafe');
    expect(out).toContain('animate-in');
  });
});

// (v1.11.348, TODO 11.330) Integration ratchet. As of
// v1.11.348 the UI primitive tree carries some
// unsafe-animate references (Tooltip / Toast use
// motion-safe: prefixes; a few primitives still emit
// raw `animate-in` for their entrance). The exact
// baseline is captured below; future patches that wrap
// each remaining call site in `motion-safe:` or wire
// `useMotionClass` should lower the constant.
export const MAX_KNOWN_UI_MOTION_VIOLATIONS = 0;

describe('motion-audit (integration: components/ui)', () => {
  it('unsafe animate-in/out count in components/ui stays at or below the known baseline', () => {
    const uiDir = resolve(__dirname, '..', 'components', 'ui');
    const files = readdirSync(uiDir)
      .filter((name) => name.endsWith('.tsx') && !name.endsWith('.test.tsx'))
      .map((name) => join(uiDir, name));
    expect(files.length).toBeGreaterThan(10);
    const violations = scanFilesForMotionViolations(files);
    if (violations.length > MAX_KNOWN_UI_MOTION_VIOLATIONS) {
      const overage = violations.length - MAX_KNOWN_UI_MOTION_VIOLATIONS;
      const summary = `\nmotion-audit regression: ${violations.length} violations (+${overage} vs baseline ${MAX_KNOWN_UI_MOTION_VIOLATIONS}):\n${formatMotionViolations(violations)}\n\nWrap the new animate-in/out classes with motion-safe: OR gate them through useMotionClass / useReducedMotion. Lower MAX_KNOWN_UI_MOTION_VIOLATIONS when you fix existing ones.`;
      throw new Error(summary);
    }
    expect(violations.length).toBeLessThanOrEqual(
      MAX_KNOWN_UI_MOTION_VIOLATIONS,
    );
  });
});
