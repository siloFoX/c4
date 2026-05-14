import { describe, it, expect } from 'vitest';
import {
  required,
  minLength,
  maxLength,
  pattern,
  email,
  custom,
  compose,
} from './form-validation';

describe('required', () => {
  it("rejects '', null, undefined; accepts non-empty", () => {
    const v = required();
    expect(v('').error).toBe('Required');
    expect(v(null).error).toBe('Required');
    expect(v(undefined).error).toBe('Required');
    expect(v('a').error).toBeUndefined();
    expect(v(0).error).toBeUndefined();
    expect(v(false).error).toBeUndefined();
  });

  it('uses custom message when provided', () => {
    expect(required('Name needed')('').error).toBe('Name needed');
  });
});

describe('minLength', () => {
  it('returns error when below threshold; passes when at/above', () => {
    const v = minLength(3);
    expect(v('ab').error).toBeDefined();
    expect(v('abc').error).toBeUndefined();
    expect(v('abcd').error).toBeUndefined();
  });
});

describe('maxLength', () => {
  it('returns error when above threshold; passes when at/below', () => {
    const v = maxLength(3);
    expect(v('abcd').error).toBeDefined();
    expect(v('abc').error).toBeUndefined();
    expect(v('ab').error).toBeUndefined();
  });
});

describe('pattern', () => {
  it("returns error when doesn't match; passes when matches", () => {
    const v = pattern(/^[a-z]+$/);
    expect(v('ABC').error).toBeDefined();
    expect(v('abc').error).toBeUndefined();
  });
});

describe('email', () => {
  it('accepts valid emails; rejects without @, with double dot, empty', () => {
    const v = email();
    expect(v('user@example.com').error).toBeUndefined();
    expect(v('foo.bar@example.co.uk').error).toBeUndefined();
    expect(v('').error).toBeDefined();
    expect(v('noatsign').error).toBeDefined();
    expect(v('user@example..com').error).toBeDefined();
  });
});

describe('custom', () => {
  it('uses provided predicate + message', () => {
    const v = custom<number>((n) => n > 10, 'Must be > 10');
    expect(v(5).error).toBe('Must be > 10');
    expect(v(20).error).toBeUndefined();
  });
});

describe('compose', () => {
  it('returns first error in order', () => {
    const v = compose<string>(required('Required'), minLength(3, 'Need 3'));
    expect(v('').error).toBe('Required');
    expect(v('ab').error).toBe('Need 3');
  });

  it('returns { error: undefined } when all pass', () => {
    const v = compose<string>(required(), minLength(2));
    expect(v('hello').error).toBeUndefined();
  });
});
