import { useId, useMemo } from 'react';

// (v1.11.321, TODO 11.303) useA11yIds -- bundle the four
// canonical accessibility ids that every labelled form
// control needs (control + helper + warning + error) plus
// derive the matching aria-describedby string.
//
// Background: WAI-ARIA labelling for a form control follows
// the same pattern at every adoption site:
//
//   <label id={`${id}-label`} htmlFor={id}>Name</label>
//   <input
//     id={id}
//     aria-invalid={errorMessage ? true : undefined}
//     aria-describedby={[
//       helperMessage ? `${id}-helper` : null,
//       warningMessage ? `${id}-warning` : null,
//       errorMessage ? `${id}-error` : null,
//     ].filter(Boolean).join(' ') || undefined}
//   />
//   <p id={`${id}-helper`}>...</p>
//   <p id={`${id}-warning`}>...</p>
//   <p id={`${id}-error`}>...</p>
//
// The four ids + the derived `aria-describedby` string land
// at virtually every form-control call site (FormField,
// RadioGroup, Checkbox, NativeSelect, TagInput,
// NumberInput). Each site re-derives the same shapes
// by hand, which:
//   - duplicates 6-8 lines per site, easy to forget any of
//     them.
//   - drifts: e.g. one site uses `${id}-help`, another
//     uses `${id}-helper`, breaking shared CSS / e2e
//     selectors.
//   - hides bugs: a developer can swap `aria-describedby`
//     for `aria-description` without anything failing in
//     unit tests.
//
// useA11yIds bundles all four ids + the
// aria-describedby selection logic so adopters write:
//
//   const a11y = useA11yIds({ id: providedId, helper: hint,
//                             warning, error });
//   return (
//     <>
//       <label htmlFor={a11y.controlId} id={a11y.labelId}>...</label>
//       <input id={a11y.controlId}
//              aria-invalid={a11y.ariaInvalid}
//              aria-describedby={a11y.ariaDescribedBy} />
//       {hint && <p id={a11y.helperId}>{hint}</p>}
//       {warning && <p id={a11y.warningId}>{warning}</p>}
//       {error && <p id={a11y.errorId}>{error}</p>}
//     </>
//   );

export interface UseA11yIdsOptions {
  // Caller-provided id (overrides the React useId fallback).
  // Useful when an upstream prop carries an explicit id.
  id?: string;
  // Whether the helper message will be rendered. When
  // truthy, the helper id is included in
  // `aria-describedby`. Pass the helper string itself or
  // any truthy sentinel.
  helper?: string | boolean | null | undefined;
  // Whether the warning message will be rendered.
  warning?: string | boolean | null | undefined;
  // Whether the error message will be rendered.
  error?: string | boolean | null | undefined;
  // Optional upstream `aria-describedby` value that should
  // be merged with the helper/warning/error ids. Useful
  // when the caller already has a description elsewhere
  // (e.g. a global tooltip).
  describedBy?: string | undefined;
}

export interface UseA11yIdsResult {
  // The id of the form control itself. Spread onto the
  // `<input>` / `<select>` / `<textarea>` as `id`.
  controlId: string;
  // The id of the `<label>` element. Useful when the label
  // wraps multiple controls (the wrapper element should
  // carry the label id, the control should reference it
  // via `aria-labelledby`).
  labelId: string;
  // The id of the helper message (`<p>`). Render the
  // helper text as `<p id={helperId}>...</p>` so the
  // `aria-describedby` reference resolves.
  helperId: string;
  // The id of the warning message.
  warningId: string;
  // The id of the error message.
  errorId: string;
  // The derived `aria-describedby` string: a space-joined
  // sequence of `helperId | warningId | errorId | describedBy`
  // depending on which of the message slots are active.
  // `undefined` when no slots apply -- never an empty
  // string, because empty `aria-describedby` triggers
  // axe-core warnings.
  ariaDescribedBy: string | undefined;
  // Convenience: `true` when an error is active, otherwise
  // `undefined`. Spread directly on the form control as
  // `aria-invalid`. Warning does NOT flip aria-invalid.
  ariaInvalid: true | undefined;
  // State badge, useful for `data-state` attributes on the
  // form field wrapper. Precedence: error > warning > ok.
  state: 'ok' | 'warning' | 'error';
}

function truthy(v: unknown): boolean {
  // Treat empty strings as "no message" so callers can pass
  // their raw prop value without coercing.
  if (v == null) return false;
  if (typeof v === 'string') return v.length > 0;
  return Boolean(v);
}

export function useA11yIds(opts?: UseA11yIdsOptions): UseA11yIdsResult {
  const fallbackId = useId();
  const providedId = opts?.id;
  const helper = opts?.helper;
  const warning = opts?.warning;
  const error = opts?.error;
  const describedBy = opts?.describedBy;

  return useMemo<UseA11yIdsResult>(() => {
    const controlId = providedId ?? fallbackId;
    const labelId = `${controlId}-label`;
    const helperId = `${controlId}-helper`;
    const warningId = `${controlId}-warning`;
    const errorId = `${controlId}-error`;

    const hasError = truthy(error);
    const hasWarning = truthy(warning);
    const hasHelper = truthy(helper);

    const state: 'ok' | 'warning' | 'error' = hasError
      ? 'error'
      : hasWarning
        ? 'warning'
        : 'ok';

    // Precedence-aware aria-describedby: when error is
    // active, the error message wins. When only warning is
    // active, warning wins. Helper is always included if
    // present (helper survives independently of validity
    // state -- it explains the field, not its validity).
    const parts: string[] = [];
    if (describedBy) parts.push(describedBy);
    if (hasHelper) parts.push(helperId);
    if (hasWarning) parts.push(warningId);
    if (hasError) parts.push(errorId);

    const ariaDescribedBy = parts.length > 0 ? parts.join(' ') : undefined;
    const ariaInvalid: true | undefined = hasError ? true : undefined;

    return {
      controlId,
      labelId,
      helperId,
      warningId,
      errorId,
      ariaDescribedBy,
      ariaInvalid,
      state,
    };
  }, [providedId, fallbackId, helper, warning, error, describedBy]);
}
