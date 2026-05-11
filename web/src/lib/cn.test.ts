import { describe, it, expect } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('joins simple class names', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('skips falsy values', () => {
    expect(cn('a', false && 'b', null, undefined, 0, 'c')).toBe('a c');
  });

  it('honors conditional object syntax (clsx pass-through)', () => {
    expect(cn({ active: true, disabled: false }, 'btn')).toBe('active btn');
  });

  it('flattens nested arrays (clsx pass-through)', () => {
    expect(cn(['a', ['b', ['c']]])).toBe('a b c');
  });

  it('dedupes conflicting tailwind utilities (twMerge)', () => {
    // Later utility wins for the same class group.
    expect(cn('p-2', 'p-4')).toBe('p-4');
    expect(cn('text-sm', 'text-lg')).toBe('text-lg');
  });

  it('keeps non-conflicting tailwind utilities side-by-side', () => {
    expect(cn('p-2', 'm-4')).toBe('p-2 m-4');
  });

  it('returns an empty string when all inputs are falsy', () => {
    expect(cn(false, null, undefined, '')).toBe('');
  });
});
