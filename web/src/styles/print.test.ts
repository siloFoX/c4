import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, 'print.css'), 'utf8');

describe('print.css (11.196)', () => {
  test('declares a @media print block', () => {
    expect(css).toContain('@media print');
  });

  test('hides chrome (nav, sidebar, toast) via display: none', () => {
    expect(css).toMatch(/nav[^{]*\{[^}]*display:\s*none/);
    expect(css).toContain('.sidebar');
    expect(css).toContain('[data-print-hide]');
    expect(css).toMatch(/\.toast|\[data-testid="toast"\]/);
    const noneCount = (css.match(/display:\s*none/g) ?? []).length;
    expect(noneCount).toBeGreaterThan(0);
  });

  test('exposes .print-only and .screen-only utility classes', () => {
    expect(css).toMatch(/\.print-only[^{]*\{[^}]*display:\s*block\s*!important/);
    expect(css).toMatch(/\.screen-only[^{]*\{[^}]*display:\s*none\s*!important/);
  });

  test('declares page-break rules for sections / cards / headings', () => {
    expect(css).toMatch(/break-inside:\s*avoid/);
    expect(css).toMatch(/break-after:\s*avoid/);
    expect(css).toContain('.print-page-break-before');
    expect(css).toMatch(/break-before:\s*page/);
  });

  test('uses serif typography at 12pt for body in print', () => {
    expect(css).toMatch(/font-family:\s*Georgia/);
    expect(css).toMatch(/font-size:\s*12pt/);
    expect(css).toMatch(/line-height:\s*1\.4/);
  });

  test('repeats table headers across pages via display: table-header-group', () => {
    expect(css).toMatch(/thead[^{]*\{[^}]*display:\s*table-header-group/);
  });

  test('appends href text to links via ::after', () => {
    expect(css).toMatch(/a\[href\][^{]*::after/);
    expect(css).toContain('attr(href)');
  });

  test('forces white background and black text on body in print', () => {
    expect(css).toMatch(/background:\s*#ffffff\s*!important/);
    expect(css).toMatch(/color:\s*#000000\s*!important/);
  });
});
