// (v1.11.186) useForm: minimal controlled-form state hook. Validates on submit
// and on touched-field changes. errors[field] only populated when the field is
// touched OR after a submit attempt. isValid reflects validation across all
// fields regardless of touched state, so a submit button can disable until the
// form is genuinely valid.

import { useCallback, useMemo, useState } from 'react';
import type { Validator } from '../lib/form-validation';

export interface UseFormConfig<TFields extends Record<string, unknown>> {
  initialValues: TFields;
  validators?: { [K in keyof TFields]?: Validator<TFields[K]> };
  onSubmit?: (values: TFields) => void | Promise<void>;
}

type Errors<TFields> = Partial<Record<keyof TFields, string>>;
type Touched<TFields> = Partial<Record<keyof TFields, boolean>>;

export interface UseFormReturn<TFields extends Record<string, unknown>> {
  values: TFields;
  errors: Errors<TFields>;
  touched: Touched<TFields>;
  setValue<K extends keyof TFields>(field: K, value: TFields[K]): void;
  setTouched(field: keyof TFields, touched: boolean): void;
  handleSubmit(e?: { preventDefault?: () => void }): void;
  isValid: boolean;
  reset(): void;
}

export function useForm<TFields extends Record<string, unknown>>(
  config: UseFormConfig<TFields>,
): UseFormReturn<TFields> {
  const { initialValues, validators, onSubmit } = config;
  const [values, setValues] = useState<TFields>(initialValues);
  const [errors, setErrors] = useState<Errors<TFields>>({});
  const [touched, setTouchedState] = useState<Touched<TFields>>({});
  const [submitted, setSubmitted] = useState(false);

  const validateField = useCallback(
    <K extends keyof TFields>(field: K, value: TFields[K]): string | undefined => {
      const v = validators?.[field];
      if (!v) return undefined;
      return v(value)?.error;
    },
    [validators],
  );

  const validateAll = useCallback(
    (snapshot: TFields): Errors<TFields> => {
      const out: Errors<TFields> = {};
      if (!validators) return out;
      for (const key of Object.keys(validators) as (keyof TFields)[]) {
        const v = validators[key];
        if (!v) continue;
        const result = v(snapshot[key]);
        if (result?.error !== undefined) out[key] = result.error;
      }
      return out;
    },
    [validators],
  );

  const isValid = useMemo(
    () => Object.keys(validateAll(values)).length === 0,
    [validateAll, values],
  );

  const setValue = useCallback(
    <K extends keyof TFields>(field: K, value: TFields[K]) => {
      setValues((prev) => ({ ...prev, [field]: value }));
      const visible = touched[field] === true || submitted;
      if (!visible) return;
      const err = validateField(field, value);
      setErrors((prev) => {
        const next = { ...prev };
        if (err === undefined) delete next[field];
        else next[field] = err;
        return next;
      });
    },
    [touched, submitted, validateField],
  );

  const setTouched = useCallback(
    (field: keyof TFields, t: boolean) => {
      setTouchedState((prev) => ({ ...prev, [field]: t }));
      if (!t) return;
      const err = validateField(field, values[field]);
      setErrors((prev) => {
        const next = { ...prev };
        if (err === undefined) delete next[field];
        else next[field] = err;
        return next;
      });
    },
    [values, validateField],
  );

  const handleSubmit = useCallback(
    (e?: { preventDefault?: () => void }) => {
      e?.preventDefault?.();
      setSubmitted(true);
      const allTouched: Touched<TFields> = {};
      for (const key of Object.keys(initialValues) as (keyof TFields)[]) {
        allTouched[key] = true;
      }
      setTouchedState(allTouched);
      const currentErrors = validateAll(values);
      setErrors(currentErrors);
      if (Object.keys(currentErrors).length === 0) {
        void onSubmit?.(values);
      }
    },
    [initialValues, validateAll, onSubmit, values],
  );

  const reset = useCallback(() => {
    setValues(initialValues);
    setErrors({});
    setTouchedState({});
    setSubmitted(false);
  }, [initialValues]);

  return {
    values,
    errors,
    touched,
    setValue,
    setTouched,
    handleSubmit,
    isValid,
    reset,
  };
}
