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

// (v1.11.363, TODO 11.345) Section-scoped print rules. Each hook is
// dropped on a single root element in its page; the print sheet
// expands the section to fill the printable surface and drops the
// surrounding controls.

describe('print.css section hooks (11.345)', () => {
  test('declares the three section hooks', () => {
    expect(css).toContain('[data-print-section="history-detail"]');
    expect(css).toContain('[data-print-section="snapshots-list"]');
    expect(css).toContain('[data-print-section="audit-log"]');
  });

  test('every print-section starts on a new page and fills the width', () => {
    expect(css).toMatch(/\[data-print-section\][^{]*\{[^}]*page-break-before:\s*always/);
    expect(css).toMatch(/\[data-print-section\][^{]*\{[^}]*width:\s*100%\s*!important/);
    expect(css).toMatch(/\[data-print-section\][^{]*\{[^}]*max-width:\s*none\s*!important/);
  });

  test('the first section does NOT force a leading page break', () => {
    expect(css).toContain('[data-print-section]:first-of-type');
    expect(css).toMatch(
      /\[data-print-section\]:first-of-type[^{]*\{[^}]*page-break-before:\s*auto/,
    );
  });

  test('hides screen-only controls inside a section', () => {
    expect(css).toMatch(/\[data-print-section\] \[role="tablist"\]/);
    expect(css).toMatch(/\[data-print-section\] \[role="navigation"\]/);
    expect(css).toMatch(/\[data-print-section\] button/);
    expect(css).toMatch(/\[data-print-section\] \[data-print-hide\]/);
  });

  test('history-detail drops avatar and breadcrumb', () => {
    expect(css).toMatch(
      /\[data-print-section="history-detail"\] \[data-testid="breadcrumb"\]/,
    );
    expect(css).toMatch(
      /\[data-print-section="history-detail"\] \[data-testid="avatar"\]/,
    );
  });

  test('history-detail keeps sections together via break-inside avoid', () => {
    expect(css).toMatch(
      /\[data-print-section="history-detail"\] section\[data-section\][^{]*\{[^}]*break-inside:\s*avoid/,
    );
  });

  test('snapshots-list forces overflow visible + table-layout fixed', () => {
    expect(css).toMatch(
      /\[data-print-section="snapshots-list"\][^{]*\{[^}]*overflow:\s*visible\s*!important/,
    );
    expect(css).toMatch(
      /\[data-print-section="snapshots-list"\] table[^{]*\{[^}]*table-layout:\s*fixed/,
    );
  });

  test('snapshots-list hides the Actions column', () => {
    expect(css).toContain(
      '[data-print-section="snapshots-list"] th[scope="col"]:last-child',
    );
    expect(css).toContain(
      '[data-print-section="snapshots-list"] td:last-child',
    );
  });

  test('audit-log drops the collapse toggle and the window/export rows', () => {
    expect(css).toMatch(
      /\[data-print-section="audit-log"\] \[aria-expanded\]/,
    );
    expect(css).toMatch(
      /\[data-print-section="audit-log"\] \[data-window-filter\]/,
    );
    expect(css).toMatch(
      /\[data-print-section="audit-log"\] \[data-export-row\]/,
    );
  });

  test('audit-log flattens timeline lists for print', () => {
    expect(css).toMatch(
      /\[data-print-section="audit-log"\] li[^{]*\{[^}]*break-inside:\s*avoid/,
    );
  });

  test('all section-scoped rules live inside @media print', () => {
    // The block before the section rules must be the @media print
    // open brace, and there must be a closing brace AFTER the last
    // section hook.
    const idxOpen = css.indexOf('@media print');
    const idxFirstHook = css.indexOf('[data-print-section]');
    const idxLastHook = css.lastIndexOf('[data-print-section');
    expect(idxOpen).toBeGreaterThan(-1);
    expect(idxFirstHook).toBeGreaterThan(idxOpen);
    expect(idxLastHook).toBeGreaterThan(idxFirstHook);
    // The very last character of the file is the @media block
    // close brace (allowing trailing whitespace).
    expect(css.trimEnd().endsWith('}')).toBe(true);
  });
});
