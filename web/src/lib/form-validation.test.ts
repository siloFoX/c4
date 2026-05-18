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

// (v1.11.372, TODO 11.354) Schema validators + ARIA + Tailwind.

import {
  ariaErrorProps,
  fieldErrorClass,
  hasAnyError,
  validateSchema,
  validateSchemaAsync,
  type Schema,
} from './form-validation';

describe('validateSchema', () => {
  interface Form {
    name: string;
    email: string;
  }
  const schema: Schema<Form> = {
    name: required(),
    email: compose(required(), email()),
  };

  it('returns ok=true when every sync validator passes', () => {
    const r = validateSchema(schema, { name: 'Alice', email: 'a@b.c' });
    expect(r.ok).toBe(true);
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual({});
  });

  it('collects per-field errors when sync validators fail', () => {
    const r = validateSchema(schema, { name: '', email: 'not-an-email' });
    expect(r.ok).toBe(false);
    expect(r.errors.name).toBe('Required');
    expect(r.errors.email).toBe('Invalid email');
  });

  it('skips async validators in the sync pass', () => {
    const asyncSchema: Schema<Form> = {
      name: async () => ({ error: 'should be skipped' }),
      email: required(),
    };
    const r = validateSchema(asyncSchema, { name: '', email: 'x' });
    // Async skipped -> no error on name. email
    // passes (non-empty) so the result is clean.
    expect(r.errors.name).toBeUndefined();
    expect(r.errors.email).toBeUndefined();
  });

  it('ignores undefined entries in the schema', () => {
    const sparse: Schema<Form> = {
      name: required(),
      // email intentionally omitted
    };
    const r = validateSchema(sparse, { name: '', email: 'whatever' });
    expect(r.errors.name).toBe('Required');
    expect(r.errors.email).toBeUndefined();
  });
});

describe('validateSchemaAsync', () => {
  interface Form {
    user: string;
  }

  it('runs async validators and resolves their errors', async () => {
    const schema: Schema<Form> = {
      user: async (v) =>
        v === 'taken' ? { error: 'Username taken' } : {},
    };
    const r = await validateSchemaAsync(schema, { user: 'taken' });
    expect(r.ok).toBe(false);
    expect(r.errors.user).toBe('Username taken');
  });

  it('returns ok=true when every async validator passes', async () => {
    const schema: Schema<Form> = {
      user: async () => ({}),
    };
    const r = await validateSchemaAsync(schema, { user: 'ok' });
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual({});
  });

  it('runs sync + async validators in one pass', async () => {
    const schema: Schema<{ user: string; email: string }> = {
      user: required(),
      email: async (v) =>
        v.endsWith('@example.com')
          ? { error: 'Disposable email' }
          : {},
    };
    const r = await validateSchemaAsync(schema, {
      user: '',
      email: 'a@example.com',
    });
    expect(r.errors.user).toBe('Required');
    expect(r.errors.email).toBe('Disposable email');
  });

  it('catches async validator rejections and surfaces the default message', async () => {
    const schema: Schema<Form> = {
      user: async () => {
        throw new Error('network');
      },
    };
    const r = await validateSchemaAsync(schema, { user: 'x' });
    expect(r.errors.user).toBe('Validation failed');
  });

  it('honours a custom onAsyncError handler', async () => {
    const schema: Schema<Form> = {
      user: async () => Promise.reject(new Error('boom')),
    };
    const r = await validateSchemaAsync(
      schema,
      { user: 'x' },
      {
        onAsyncError: (err, field) =>
          `field=${field}, msg=${(err as Error).message}`,
      },
    );
    expect(r.errors.user).toBe('field=user, msg=boom');
  });

  it('catches a sync throw from a validator function body', async () => {
    const schema: Schema<Form> = {
      user: () => {
        throw new Error('sync-boom');
      },
    };
    const r = await validateSchemaAsync(schema, { user: 'x' });
    expect(r.errors.user).toBe('Validation failed');
  });
});

describe('ariaErrorProps', () => {
  it('returns empty object when no error', () => {
    expect(ariaErrorProps(null, 'err-1')).toEqual({});
    expect(ariaErrorProps(undefined, 'err-1')).toEqual({});
    expect(ariaErrorProps('', 'err-1')).toEqual({});
  });

  it('forwards describedByExtra without enabling invalid when no error', () => {
    expect(ariaErrorProps(null, 'err-1', 'hint-1')).toEqual({
      'aria-describedby': 'hint-1',
    });
  });

  it('sets aria-invalid and aria-describedby on error', () => {
    expect(ariaErrorProps('Required', 'err-1')).toEqual({
      'aria-invalid': true,
      'aria-describedby': 'err-1',
    });
  });

  it('concatenates errorId + describedByExtra when both present', () => {
    expect(ariaErrorProps('boom', 'err-1', 'hint-1')).toEqual({
      'aria-invalid': true,
      'aria-describedby': 'err-1 hint-1',
    });
  });
});

describe('fieldErrorClass', () => {
  it('returns empty string when no error', () => {
    expect(fieldErrorClass(false)).toBe('');
  });

  it('returns destructive border + ring classes on error', () => {
    const cls = fieldErrorClass(true);
    expect(cls).toContain('border-destructive');
    expect(cls).toContain('ring-destructive');
  });
});

describe('hasAnyError', () => {
  it('returns true when at least one field has an error', () => {
    expect(hasAnyError<{ name: string }>({ name: 'Required' })).toBe(true);
    expect(
      hasAnyError<{ name: string; email: string }>({ email: 'Bad' }),
    ).toBe(true);
  });

  it('returns false when every field has no error', () => {
    expect(hasAnyError<{ name: string }>({})).toBe(false);
    expect(hasAnyError<{ name: string; email: string }>({})).toBe(false);
  });
});
