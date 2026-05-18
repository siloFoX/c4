// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  scanSourceForViolations,
  scanFilesForViolations,
  formatViolations,
} from './theme-tokens-validator';

describe('theme-tokens-validator (unit)', () => {
  it('flags a raw hex color literal', () => {
    const source = `export const x = { color: '#ff0000' };`;
    const v = scanSourceForViolations('foo.tsx', source);
    expect(v.length).toBe(1);
    expect(v[0]?.rule).toBe('hex-color');
    expect(v[0]?.match).toBe('#ff0000');
  });

  it('flags a 3-digit hex color literal', () => {
    const source = `style={{ color: '#fff' }}`;
    const v = scanSourceForViolations('foo.tsx', source);
    expect(v.length).toBe(1);
    expect(v[0]?.match).toBe('#fff');
  });

  it('flags an 8-digit hex with alpha', () => {
    const source = `bgColor: '#aabbccdd',`;
    const v = scanSourceForViolations('foo.tsx', source);
    expect(v.length).toBe(1);
    expect(v[0]?.match).toBe('#aabbccdd');
  });

  it('ignores hex-like substrings of non-color contexts (URL fragments)', () => {
    const source = `<a href="#main-nav">jump</a>`;
    const v = scanSourceForViolations('foo.tsx', source);
    expect(v.length).toBe(0);
  });

  it('ignores 5- and 7-digit hex sequences (not valid CSS colors)', () => {
    const source = `const buildId = '#abcde1f';`;
    const v = scanSourceForViolations('foo.tsx', source);
    expect(v.length).toBe(0);
  });

  it('flags rgb() calls', () => {
    const source = `style={{ background: 'rgb(10, 20, 30)' }}`;
    const v = scanSourceForViolations('foo.tsx', source);
    expect(v.length).toBe(1);
    expect(v[0]?.rule).toBe('rgb-fn');
  });

  it('flags rgba() calls', () => {
    const source = `style={{ background: 'rgba(0,0,0,.5)' }}`;
    const v = scanSourceForViolations('foo.tsx', source);
    expect(v.length).toBe(1);
    expect(v[0]?.rule).toBe('rgb-fn');
  });

  it('flags hsl() / hsla() calls', () => {
    const source = `style={{ color: 'hsl(0 100% 50%)' }}\nstyle={{ color: 'hsla(0, 100%, 50%, 0.5)' }}`;
    const v = scanSourceForViolations('foo.tsx', source);
    expect(v.filter((x) => x.rule === 'hsl-fn').length).toBe(2);
  });

  it('ignores hex literals inside // line comments', () => {
    const source = `const x = 1; // canonical color was #ff0000 originally`;
    const v = scanSourceForViolations('foo.tsx', source);
    expect(v.length).toBe(0);
  });

  it('ignores hex literals inside /* ... */ block comments', () => {
    const source = `/* legacy palette: #fff #000 */\nconst x = 1;`;
    const v = scanSourceForViolations('foo.tsx', source);
    expect(v.length).toBe(0);
  });

  it('allows var(--token) references', () => {
    const source = `style={{ color: 'var(--color-foreground)' }}`;
    const v = scanSourceForViolations('foo.tsx', source);
    expect(v.length).toBe(0);
  });

  it('allows currentColor / transparent / none', () => {
    const source = `<svg fill="currentColor" />\n<svg fill="none" />\n<svg fill="transparent" />`;
    const v = scanSourceForViolations('foo.tsx', source);
    expect(v.length).toBe(0);
  });

  it('reports file/line/column for every violation', () => {
    const source = `line one\n\n  bad: '#aaa',`;
    const v = scanSourceForViolations('foo.tsx', source);
    expect(v.length).toBe(1);
    expect(v[0]?.line).toBe(3);
    expect(v[0]?.column).toBeGreaterThan(0);
    expect(v[0]?.file).toBe('foo.tsx');
  });

  it('formatViolations() yields an empty string when there are no violations', () => {
    expect(formatViolations([])).toBe('');
  });

  it('formatViolations() includes file:line:col and the matched literal', () => {
    const source = `bad: '#abc',`;
    const v = scanSourceForViolations('demo.tsx', source);
    const out = formatViolations(v);
    expect(out).toContain('demo.tsx:1');
    expect(out).toContain('#abc');
    expect(out).toContain('hex-color');
  });
});

describe('theme-tokens-validator (integration: components/ui)', () => {
  it('every web/src/components/ui/*.tsx file references design tokens (no raw hex / rgb / hsl)', () => {
    const uiDir = resolve(__dirname, '..', 'components', 'ui');
    const files = readdirSync(uiDir)
      .filter((name) => name.endsWith('.tsx') && !name.endsWith('.test.tsx'))
      .map((name) => join(uiDir, name));
    expect(files.length).toBeGreaterThan(10);

    const violations = scanFilesForViolations(files);
    if (violations.length > 0) {
      // Fail with a human-readable report so the CI log
      // points at the exact file:line that needs fixing.
      const summary = `\nDesign-token policy violations (${violations.length}):\n${formatViolations(violations)}`;
      throw new Error(summary);
    }
    expect(violations.length).toBe(0);
  });
});
