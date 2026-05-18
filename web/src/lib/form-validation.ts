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

// (v1.11.372, TODO 11.354) Schema-based form
// validation framework.
//
// Layered on top of the existing `Validator<T>`
// primitives so callers can mix the new
// schema-shaped API with the legacy single-field
// validators without a rewrite.
//
// Public surface:
//
//   - `Schema<T>` -- a map of field name to
//     `Validator<T[K]>` (sync) OR
//     `AsyncValidator<T[K]>` (async). A schema can
//     contain both.
//   - `validateSchema(schema, values)` -- runs
//     every sync validator, collects errors in a
//     `Record<keyof T, string>` map, returns
//     `{ ok, errors, valid }`. Async validators are
//     SKIPPED here -- call
//     `validateSchemaAsync(...)` for the full pass.
//   - `validateSchemaAsync(schema, values)` --
//     runs sync + async in parallel and returns the
//     full error map. Async validators that throw
//     surface as `{ error: 'Validation failed' }`
//     by default; pass `{ onAsyncError }` to
//     override.
//   - `ariaErrorProps(error, errorId)` -- helper
//     that returns the `aria-invalid` +
//     `aria-describedby` props for a field. Mirrors
//     the existing Input / Textarea contract.
//   - `fieldErrorClass(hasError)` -- canonical
//     Tailwind error border + ring class for a
//     bespoke input (use when not wired to the
//     Input primitive).

export type AsyncValidator<T> = (
  value: T,
) => Promise<ValidationResult>;

export type AnyValidator<T> = Validator<T> | AsyncValidator<T>;

export type Schema<T> = {
  [K in keyof T]?: AnyValidator<T[K]>;
};

export type SchemaErrors<T> = {
  [K in keyof T]?: string;
};

export interface ValidateSchemaResult<T> {
  ok: boolean;
  errors: SchemaErrors<T>;
  valid: boolean;
}

// Heuristic: a validator is async if calling it
// returns a thenable. We probe by invoking and
// checking the return value's `then` property.
function isThenable(x: unknown): x is Promise<ValidationResult> {
  return (
    typeof x === 'object' &&
    x !== null &&
    typeof (x as { then?: unknown }).then === 'function'
  );
}

export function validateSchema<T>(
  schema: Schema<T>,
  values: T,
): ValidateSchemaResult<T> {
  const errors: SchemaErrors<T> = {};
  let ok = true;
  for (const key in schema) {
    const validator = schema[key];
    if (!validator) continue;
    const result = validator(values[key]);
    if (isThenable(result)) {
      // Async validators are skipped in the sync
      // pass. Pair with validateSchemaAsync for
      // the full check.
      continue;
    }
    if (result && result.error !== undefined) {
      errors[key] = result.error;
      ok = false;
    }
  }
  return { ok, errors, valid: ok };
}

export interface ValidateSchemaAsyncOptions {
  // Called when an async validator throws or
  // rejects. Should return the error message to
  // surface for the field. Defaults to a generic
  // 'Validation failed'.
  onAsyncError?: (err: unknown, field: string) => string;
}

export async function validateSchemaAsync<T>(
  schema: Schema<T>,
  values: T,
  options: ValidateSchemaAsyncOptions = {},
): Promise<ValidateSchemaResult<T>> {
  const errors: SchemaErrors<T> = {};
  const promises: Array<Promise<void>> = [];
  for (const key in schema) {
    const validator = schema[key];
    if (!validator) continue;
    let result: ValidationResult | Promise<ValidationResult>;
    try {
      result = validator(values[key]);
    } catch (err) {
      const msg =
        options.onAsyncError?.(err, key) ?? 'Validation failed';
      errors[key] = msg;
      continue;
    }
    if (isThenable(result)) {
      promises.push(
        result
          .then((r) => {
            if (r && r.error !== undefined) {
              errors[key] = r.error;
            }
          })
          .catch((err) => {
            const msg =
              options.onAsyncError?.(err, key) ?? 'Validation failed';
            errors[key] = msg;
          }),
      );
    } else if (result && result.error !== undefined) {
      errors[key] = result.error;
    }
  }
  await Promise.all(promises);
  const ok = Object.keys(errors).length === 0;
  return { ok, errors, valid: ok };
}

// ---- ARIA + Tailwind helpers ----------------------------------

export interface AriaErrorProps {
  'aria-invalid'?: true;
  'aria-describedby'?: string;
}

// Builds the `aria-invalid` + `aria-describedby`
// props for a field. When `error` is falsy the
// field is considered valid -- the helper returns
// an empty object so a spread does not toggle the
// attributes.
//
// Adopters pair this with a `<span id={errorId}
// role="alert">...</span>` below the input. The
// existing Input / Textarea / Select primitives
// already render this slot when their `error`
// prop is set; the helper is for bespoke fields
// (e.g. a custom segmented control).
export function ariaErrorProps(
  error: string | null | undefined,
  errorId: string,
  describedByExtra?: string,
): AriaErrorProps {
  if (!error) {
    return describedByExtra ? { 'aria-describedby': describedByExtra } : {};
  }
  const describedBy = describedByExtra
    ? `${errorId} ${describedByExtra}`
    : errorId;
  return {
    'aria-invalid': true,
    'aria-describedby': describedBy,
  };
}

// Canonical Tailwind classes for a field in
// error state. Mirrors the styling on the Input
// primitive so a bespoke field renders with the
// same border ring as the standard surface.
export function fieldErrorClass(hasError: boolean): string {
  return hasError
    ? 'border-destructive focus-visible:ring-destructive'
    : '';
}

// Has-any-error helper for the host's submit
// button enabled state.
export function hasAnyError<T>(errors: SchemaErrors<T>): boolean {
  for (const key in errors) {
    if (errors[key] !== undefined) return true;
  }
  return false;
}
