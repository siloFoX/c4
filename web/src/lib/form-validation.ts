// (v1.11.186) Form validation primitives. Each Validator<T> takes a value and
// returns { error?: string }. Compose with compose(...) to chain. Designed to
// integrate with Input/Textarea's `error` slot and the useForm hook.

export type ValidationResult = { error?: string };
export type Validator<T> = (value: T) => ValidationResult;

const PASS: ValidationResult = { error: undefined };

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

export function required(msg?: string): Validator<unknown> {
  const message = msg ?? 'Required';
  return (value) => (isEmpty(value) ? { error: message } : PASS);
}

export function minLength(n: number, msg?: string): Validator<string> {
  const message = msg ?? `Must be at least ${n} characters`;
  return (value) => {
    if (typeof value !== 'string') return PASS;
    return value.length < n ? { error: message } : PASS;
  };
}

export function maxLength(n: number, msg?: string): Validator<string> {
  const message = msg ?? `Must be at most ${n} characters`;
  return (value) => {
    if (typeof value !== 'string') return PASS;
    return value.length > n ? { error: message } : PASS;
  };
}

export function pattern(re: RegExp, msg?: string): Validator<string> {
  const message = msg ?? 'Invalid format';
  return (value) => {
    if (typeof value !== 'string') return PASS;
    return re.test(value) ? PASS : { error: message };
  };
}

// Lightweight RFC 5322-ish: local@domain, no whitespace, no consecutive dots,
// domain must have at least one dot separator.
const EMAIL_RE = /^[^\s@.]+(?:\.[^\s@.]+)*@[^\s@.]+(?:\.[^\s@.]+)+$/;

export function email(msg?: string): Validator<string> {
  const message = msg ?? 'Invalid email';
  return (value) => {
    if (typeof value !== 'string') return { error: message };
    return EMAIL_RE.test(value) ? PASS : { error: message };
  };
}

export function custom<T>(predicate: (v: T) => boolean, msg: string): Validator<T> {
  return (value) => (predicate(value) ? PASS : { error: msg });
}

export function compose<T>(...validators: Validator<T>[]): Validator<T> {
  return (value) => {
    for (const v of validators) {
      const r = v(value);
      if (r && r.error !== undefined) return r;
    }
    return { error: undefined };
  };
}
