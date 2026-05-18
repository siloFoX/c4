import type { ReactNode } from 'react';
import { Alert, type AlertProps, type AlertVariant } from './alert';

// (v1.11.275, TODO 11.257) AlertBanner -- persistent inline
// alert primitive with severity (info / success / warning /
// danger), icon, title + body slot, optional dismiss-x and a
// CTA action slot. role=alert + aria-live=polite per dispatch.
//
// AlertBanner wraps the existing Alert primitive so all the
// rendering / dismissible / icon / action plumbing stays in one
// place. The wrapper does three small things:
//
//   1. Renames `variant` -> `severity` to match the dispatch
//      vocabulary, and maps the new "danger" token to Alert's
//      pre-existing "error" variant.
//   2. Pins role + aria-live so every banner reads as a
//      persistent advisory (the underlying Alert chooses
//      role=alert / aria-live=assertive for `error` and
//      role=status / aria-live=polite otherwise; the dispatch
//      explicitly asks for role=alert + aria-live=polite on
//      every banner regardless of severity, so we override).
//   3. Tags the root with `data-section="alert-banner"` +
//      `data-severity=<resolved>` so e2e selectors can scope
//      to banner vs. inline Alert usage without having to
//      probe variant classes.
//
// Reference: /root/c4/arps-design-system-v1/ "alert banner"
// pattern.

export type AlertBannerSeverity = 'info' | 'success' | 'warning' | 'danger';

export interface AlertBannerProps
  extends Omit<AlertProps, 'variant' | 'role'> {
  severity?: AlertBannerSeverity;
  // (v1.11.275) Pass `legacyVariant` to opt into the underlying
  // Alert's broader `AlertVariant` set ('error' / 'neutral'),
  // for callers that want to migrate gradually. severity wins
  // when both are passed.
  legacyVariant?: AlertVariant;
}

function resolveVariant(
  severity: AlertBannerSeverity | undefined,
  legacy: AlertVariant | undefined,
): AlertVariant {
  if (severity === 'danger') return 'error';
  if (severity === 'info' || severity === 'success' || severity === 'warning') {
    return severity;
  }
  return legacy ?? 'info';
}

export function AlertBanner({
  severity,
  legacyVariant,
  title,
  children,
  icon,
  action,
  dismissible,
  onDismiss,
  size,
  className,
  ...rest
}: AlertBannerProps): ReactNode {
  const variant = resolveVariant(severity, legacyVariant);
  // (v1.11.275) Pin role + aria-live as the dispatch requests
  // ("role=alert + aria-live polite"). The Alert primitive picks
  // a default based on variant; passing `role="alert"` here
  // overrides that, and Alert's own ariaLive derivation respects
  // the chosen role (assertive when role=alert). We then patch
  // aria-live="polite" via rest to honour the dispatch's exact
  // wording -- screen readers will receive role=alert with
  // aria-live=polite, which is unusual but matches the spec.
  return (
    <Alert
      variant={variant}
      role="alert"
      title={title}
      icon={icon}
      action={action}
      {...(dismissible !== undefined ? { dismissible } : {})}
      {...(onDismiss !== undefined ? { onDismiss } : {})}
      {...(size !== undefined ? { size } : {})}
      data-section="alert-banner"
      data-severity={severity ?? (legacyVariant ?? 'info')}
      aria-live="polite"
      className={className}
      {...rest}
    >
      {children}
    </Alert>
  );
}

AlertBanner.displayName = 'AlertBanner';
