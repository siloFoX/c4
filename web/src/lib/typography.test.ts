import { describe, it, expect } from 'vitest';
import { text } from './typography';

describe('typography scale', () => {
  const entries = Object.entries(text);
  const keys = Object.keys(text);

  it('every entry is a non-empty string', () => {
    for (const [key, value] of entries) {
      expect(typeof value, `text.${key} should be a string`).toBe('string');
      expect(value.length, `text.${key} should be non-empty`).toBeGreaterThan(0);
    }
  });

  it('every entry includes at least one text-* utility class', () => {
    for (const [key, value] of entries) {
      expect(value, `text.${key} should include a text-* utility`).toMatch(/(^|\s)text-[^\s]+/);
    }
  });

  it('every entry includes a leading-* utility for the 8px baseline rhythm', () => {
    for (const [key, value] of entries) {
      expect(value, `text.${key} should include a leading-* utility`).toMatch(/(^|\s)leading-[^\s]+/);
    }
  });

  it('h1, h2, h3 each carry a font-weight utility', () => {
    for (const key of ['h1', 'h2', 'h3'] as const) {
      expect(text[key], `text.${key} should include font-{semibold|medium|bold}`).toMatch(
        /(^|\s)font-(semibold|medium|bold)\b/,
      );
    }
  });

  it('display also carries a font-weight utility (paired with the headings)', () => {
    expect(text.display).toMatch(/(^|\s)font-(semibold|medium|bold)\b/);
  });

  it('caption includes text-muted-foreground so muted hints inherit it for free', () => {
    expect(text.caption).toContain('text-muted-foreground');
  });

  it('mono includes font-mono so code spans render in the mono stack', () => {
    expect(text.mono).toContain('font-mono');
  });

  it('exposes the documented set of scale keys', () => {
    expect(keys.sort()).toEqual(
      ['body', 'bodySm', 'caption', 'display', 'h1', 'h2', 'h3', 'mono'].sort(),
    );
  });

  it('matches the snapshot so future renames are flagged', () => {
    expect(text).toMatchInlineSnapshot(`
      {
        "body": "text-base leading-6",
        "bodySm": "text-sm leading-5",
        "caption": "text-xs leading-4 text-muted-foreground",
        "display": "text-4xl leading-[3rem] tracking-tight font-semibold",
        "h1": "text-3xl leading-[2.5rem] tracking-tight font-semibold",
        "h2": "text-2xl leading-8 font-semibold",
        "h3": "text-xl leading-7 font-medium",
        "mono": "font-mono text-sm leading-5",
      }
    `);
  });
});
