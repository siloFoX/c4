import {
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ariaErrorProps,
  fieldErrorClass,
  hasAnyError,
  validateSchema,
  validateSchemaAsync,
  type AriaErrorProps,
  type Schema,
  type SchemaErrors,
} from './form-validation';

// (v1.11.372, TODO 11.354) Form state hook built
// on top of the schema validators in
// `lib/form-validation.ts`.
//
// Why a custom hook (not react-hook-form / formik):
//
//   - Stays inside the existing primitive surface
//     (Input / Textarea / Select / Label already
//     accept `error` + ARIA props).
//   - No new runtime dependency. Adopters who do
//     not want forms still pay zero KB.
//   - Schema validators reuse the existing
//     `Validator<T>` shape so legacy synchronous
//     validators (required / minLength / pattern /
//     email) port over without change.
//
// Adoption pattern:
//
//   const form = useForm({
//     initialValues: { name: '', email: '' },
//     schema: {
//       name: required(),
//       email: compose(required(), email()),
//     },
//   });
//   const nameField = form.field('name');
//   <Input
//     value={nameField.value}
//     onChange={(e) => nameField.onChange(e.target.value)}
//     onBlur={nameField.onBlur}
//     error={nameField.error}
//     id={nameField.id}
//     aria-describedby={nameField.props['aria-describedby']}
//   />

export interface UseFormOptions<T> {
  initialValues: T;
  schema: Schema<T>;
  // When `true` (default), the hook validates the
  // changed field on every `onChange` call once
  // the field has been touched. When `false`,
  // validation runs only on `onBlur` and on
  // `submit`.
  validateOnChange?: boolean;
  // When `true`, validation runs on every `onBlur`
  // even if the field has not been touched yet.
  // Default `true`.
  validateOnBlur?: boolean;
  // Async error handler -- forwarded to
  // validateSchemaAsync.
  onAsyncError?: (err: unknown, field: string) => string;
}

export interface FormFieldHandle<V> {
  value: V;
  onChange: (next: V) => void;
  onBlur: () => void;
  error: string | undefined;
  touched: boolean;
  id: string;
  errorId: string;
  // Pre-bundled ARIA props for spreading onto an
  // <input> / <textarea> / <select>.
  props: AriaErrorProps;
  // Tailwind error border / ring class for bespoke
  // inputs that do not flow through the canonical
  // Input primitive.
  errorClass: string;
}

export interface UseFormState<T> {
  values: T;
  errors: SchemaErrors<T>;
  touched: { [K in keyof T]?: boolean };
  isValid: boolean;
  isSubmitting: boolean;
  // Re-renders with the current value of every
  // field. Adopters typically read this off the
  // returned object once per render.
  setValue: <K extends keyof T>(field: K, value: T[K]) => void;
  setValues: (next: T) => void;
  setError: <K extends keyof T>(field: K, error: string | undefined) => void;
  setErrors: (next: SchemaErrors<T>) => void;
  setTouched: <K extends keyof T>(field: K, touched: boolean) => void;
  validate: () => SchemaErrors<T>;
  validateAsync: () => Promise<SchemaErrors<T>>;
  reset: (next?: T) => void;
  // Builds a per-field handle with bundled
  // value / handlers / ARIA props.
  field: <K extends keyof T>(name: K) => FormFieldHandle<T[K]>;
  // Wraps the host's submit callback so the
  // wrapper runs the async pass first and gates
  // the submit on validity. Returns a function
  // suitable for `<form onSubmit>`.
  handleSubmit: (
    onValid: (values: T) => void | Promise<void>,
    onInvalid?: (errors: SchemaErrors<T>) => void,
  ) => (event?: { preventDefault?: () => void }) => Promise<void>;
}

function emptyTouched<T>(values: T): { [K in keyof T]?: boolean } {
  const out: { [K in keyof T]?: boolean } = {};
  for (const k in values) out[k] = false;
  return out;
}

export function useForm<T extends object>(
  options: UseFormOptions<T>,
): UseFormState<T> {
  const {
    initialValues,
    schema,
    validateOnChange = true,
    validateOnBlur = true,
    onAsyncError,
  } = options;

  const baseId = useId();
  const [values, setValuesState] = useState<T>(initialValues);
  const [errors, setErrorsState] = useState<SchemaErrors<T>>({});
  const [touched, setTouchedState] = useState<{ [K in keyof T]?: boolean }>(
    () => emptyTouched(initialValues),
  );
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Hold the latest schema in a ref so the
  // handlers do not re-bind when the schema
  // identity changes between renders (which is
  // common -- callers pass an inline object).
  const schemaRef = useRef(schema);
  schemaRef.current = schema;
  const asyncErrorRef = useRef(onAsyncError);
  asyncErrorRef.current = onAsyncError;

  const validateField = useCallback(
    <K extends keyof T>(name: K, value: T[K]): string | undefined => {
      const validator = schemaRef.current[name];
      if (!validator) return undefined;
      const result = validator(value);
      // Async result -- skip; validateAsync
      // handles the async pass.
      if (
        typeof result === 'object' &&
        result !== null &&
        typeof (result as { then?: unknown }).then === 'function'
      ) {
        return undefined;
      }
      return (result as { error?: string }).error;
    },
    [],
  );

  const setValue = useCallback(
    <K extends keyof T>(field: K, value: T[K]): void => {
      setValuesState((prev) => ({ ...prev, [field]: value }));
      if (validateOnChange && touched[field]) {
        const err = validateField(field, value);
        setErrorsState((prev) => ({ ...prev, [field]: err }));
      }
    },
    [validateOnChange, touched, validateField],
  );

  const setValues = useCallback((next: T) => {
    setValuesState(next);
  }, []);

  const setError = useCallback(
    <K extends keyof T>(field: K, error: string | undefined): void => {
      setErrorsState((prev) => ({ ...prev, [field]: error }));
    },
    [],
  );

  const setErrors = useCallback((next: SchemaErrors<T>): void => {
    setErrorsState(next);
  }, []);

  const setTouched = useCallback(
    <K extends keyof T>(field: K, isTouched: boolean): void => {
      setTouchedState((prev) => ({ ...prev, [field]: isTouched }));
    },
    [],
  );

  const validate = useCallback((): SchemaErrors<T> => {
    const result = validateSchema(schemaRef.current, values);
    setErrorsState(result.errors);
    return result.errors;
  }, [values]);

  const validateAsync = useCallback(async (): Promise<SchemaErrors<T>> => {
    const result = await validateSchemaAsync(schemaRef.current, values, {
      ...(asyncErrorRef.current
        ? { onAsyncError: asyncErrorRef.current }
        : {}),
    });
    setErrorsState(result.errors);
    return result.errors;
  }, [values]);

  const reset = useCallback(
    (next?: T) => {
      const fresh = next ?? initialValues;
      setValuesState(fresh);
      setErrorsState({});
      setTouchedState(emptyTouched(fresh));
      setIsSubmitting(false);
    },
    [initialValues],
  );

  const field = useCallback(
    <K extends keyof T>(name: K): FormFieldHandle<T[K]> => {
      const value = values[name];
      const error = errors[name];
      const isTouched = touched[name] ?? false;
      const id = `${baseId}-${String(name)}`;
      const errorId = `${id}-error`;
      return {
        value,
        onChange: (nextValue: T[K]) => {
          setValue(name, nextValue);
        },
        onBlur: () => {
          setTouched(name, true);
          if (validateOnBlur) {
            const err = validateField(name, value);
            setErrorsState((prev) => ({ ...prev, [name]: err }));
          }
        },
        error,
        touched: isTouched,
        id,
        errorId,
        props: ariaErrorProps(error, errorId),
        errorClass: fieldErrorClass(!!error),
      };
    },
    [values, errors, touched, baseId, setValue, setTouched, validateOnBlur, validateField],
  );

  const handleSubmit = useCallback(
    (
      onValid: (values: T) => void | Promise<void>,
      onInvalid?: (errors: SchemaErrors<T>) => void,
    ) =>
      async (event?: { preventDefault?: () => void }): Promise<void> => {
        event?.preventDefault?.();
        setIsSubmitting(true);
        try {
          // Touch every field so all errors render
          // on submit.
          setTouchedState((prev) => {
            const next: { [K in keyof T]?: boolean } = { ...prev };
            for (const k in schemaRef.current) {
              next[k as keyof T] = true;
            }
            return next;
          });
          const fullErrors = await validateSchemaAsync(
            schemaRef.current,
            values,
            {
              ...(asyncErrorRef.current
                ? { onAsyncError: asyncErrorRef.current }
                : {}),
            },
          );
          setErrorsState(fullErrors.errors);
          if (fullErrors.ok) {
            await onValid(values);
          } else if (onInvalid) {
            onInvalid(fullErrors.errors);
          }
        } finally {
          setIsSubmitting(false);
        }
      },
    [values],
  );

  const isValid = useMemo(() => !hasAnyError(errors), [errors]);

  return {
    values,
    errors,
    touched,
    isValid,
    isSubmitting,
    setValue,
    setValues,
    setError,
    setErrors,
    setTouched,
    validate,
    validateAsync,
    reset,
    field,
    handleSubmit,
  };
}
