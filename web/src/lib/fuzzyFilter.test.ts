import { describe, it, expect } from 'vitest';
import { fuzzyScore, fuzzyFilter } from './fuzzyFilter';

describe('fuzzyScore', () => {
  it('returns 1 when the needle is empty', () => {
    expect(fuzzyScore('hello', '')).toBe(1);
  });
  it('returns 1 when the needle is whitespace-only', () => {
    expect(fuzzyScore('hello', '   ')).toBe(1);
  });
  it('returns 0 when the haystack is empty but the needle is set', () => {
    expect(fuzzyScore('', 'foo')).toBe(0);
  });
  it('returns 2 for a case-insensitive prefix match', () => {
    expect(fuzzyScore('Hello', 'hel')).toBe(2);
    expect(fuzzyScore('HELLO', 'Hel')).toBe(2);
  });
  it('returns 1 for a substring (non-prefix) match', () => {
    expect(fuzzyScore('hello world', 'world')).toBe(1);
  });
  it('returns 0 when the needle is absent', () => {
    expect(fuzzyScore('hello', 'xyz')).toBe(0);
  });
});

describe('fuzzyFilter', () => {
  const items = [
    { name: 'apple' },
    { name: 'banana' },
    { name: 'apricot' },
    { name: 'cherry' },
    { name: 'pineapple' },
  ];

  it('returns a fresh copy of all items when the query is empty', () => {
    const out = fuzzyFilter(items, '', (i) => i.name);
    expect(out).toEqual(items);
    expect(out).not.toBe(items);
  });

  it('returns a fresh copy of all items when the query is whitespace', () => {
    const out = fuzzyFilter(items, '   ', (i) => i.name);
    expect(out).toEqual(items);
  });

  it('ranks prefix matches above substring matches', () => {
    const out = fuzzyFilter(items, 'ap', (i) => i.name);
    expect(out.map((i) => i.name)).toEqual(['apple', 'apricot', 'pineapple']);
  });

  it('drops items whose key has score 0', () => {
    const out = fuzzyFilter(items, 'xyz', (i) => i.name);
    expect(out).toEqual([]);
  });

  it('uses the key selector for ranking, not the item shape', () => {
    const tagged = [
      { id: 1, label: 'banana split' },
      { id: 2, label: 'apple pie' },
    ];
    const out = fuzzyFilter(tagged, 'app', (t) => t.label);
    expect(out.map((t) => t.id)).toEqual([2]);
  });
});
