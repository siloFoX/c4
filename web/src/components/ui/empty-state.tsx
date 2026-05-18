import { isValidElement } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { Button } from './button';
import { cn } from '../../lib/cn';
import {
  AccessDeniedIllustration,
  AllDoneIllustration,
  EmptyQueueIllustration,
  NoDataIllustration,
  NoWorkersIllustration,
  OffScheduleIllustration,
  SearchEmpty,
  SessionsEmpty,
  WelcomeOnboardingIllustration,
  type IllustrationProps,
} from '../illustrations';

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
}

// (v1.11.266, TODO 11.248) Secondary affordance below the primary
// CTA. Two shapes: a `{ label, onClick }` button (internal nav,
// dialog opener, etc.) or a `{ label, href }` anchor (deep link,
// external doc, mailto). The two-button stack matches the
// canonical "primary action + see-also link" pattern.
export type EmptyStateSecondaryAction =
  | { label: string; onClick: () => void }
  | { label: string; href: string };

// (v1.11.266, TODO 11.248) Three preset sizes adjust the outer
// padding + heading scale. Default `md` matches the prior
// implicit layout so existing callers stay byte-identical.
export type EmptyStateSize = 'sm' | 'md' | 'lg';

// (v1.11.254, TODO 11.236) Optional `illustration` prop. When
// set, EmptyState looks up the named SVG from
// `components/illustrations` and renders it in the icon slot.
// The legacy `icon` prop still wins when both are passed, so
// existing call sites that compose their own ReactNode keep
// working byte-for-byte.
export type EmptyStateIllustration =
  | 'all-done'
  | 'empty-queue'
  | 'no-workers'
  | 'no-data'
  | 'off-schedule'
  | 'access-denied'
  | 'search-empty'
  | 'sessions-empty'
  | 'welcome';

const ILLUSTRATION_REGISTRY: Record<
  EmptyStateIllustration,
  (props: IllustrationProps) => JSX.Element
> = {
  'all-done': AllDoneIllustration,
  'empty-queue': EmptyQueueIllustration,
  'no-workers': NoWorkersIllustration,
  'no-data': NoDataIllustration,
  'off-schedule': OffScheduleIllustration,
  'access-denied': AccessDeniedIllustration,
  'search-empty': SearchEmpty,
  'sessions-empty': SessionsEmpty,
  welcome: WelcomeOnboardingIllustration,
};

// (v1.11.313, TODO 11.295) Dedicated help-link affordance.
// Renders below the action + secondaryAction stack as a small
// "Learn more" anchor. Use this for documentation deep-links
// that should NOT be confused with the call-to-action buttons.
export interface EmptyStateHelpLink {
  label: string;
  href: string;
}

// (v1.11.376, TODO 11.358) Predefined `variant` presets.
// Each variant resolves to a default illustration + a
// canonical (English) title + description so adopters can
// drop in one prop instead of repeating the boilerplate.
//
// Explicit `illustration` / `icon` / `title` / `description`
// props ALWAYS win -- variants are a starting point, not a
// hard contract.
export type EmptyStateVariant =
  | 'empty-list'
  | 'no-results'
  | 'error'
  | 'loading-failed';

interface VariantDefaults {
  illustration: EmptyStateIllustration;
  title: string;
  description: string;
}

const VARIANT_DEFAULTS: Record<EmptyStateVariant, VariantDefaults> = {
  'empty-list': {
    illustration: 'empty-queue',
    title: 'Nothing here yet',
    description:
      'No items to show. Once one is created, it will appear in this list.',
  },
  'no-results': {
    illustration: 'search-empty',
    title: 'No matches',
    description:
      'Your filter or search did not match any items. Try clearing the filter or broadening the query.',
  },
  error: {
    illustration: 'access-denied',
    title: 'Something went wrong',
    description:
      'The request could not be completed. Try again, or check the logs for details.',
  },
  'loading-failed': {
    illustration: 'no-data',
    title: 'Could not load',
    description:
      'We could not reach the server. Check your connection and retry.',
  },
};

export const EMPTY_STATE_VARIANTS: readonly EmptyStateVariant[] = [
  'empty-list',
  'no-results',
  'error',
  'loading-failed',
] as const;

export interface EmptyStateProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  icon?: ReactNode;
  /**
   * Named illustration token. Resolved against the
   * `ILLUSTRATION_REGISTRY` so a consumer can opt into the
   * shared art without importing the SVG component directly.
   * Ignored when `icon` is also set.
   */
  illustration?: EmptyStateIllustration;
  /**
   * (v1.11.376, TODO 11.358) Optional canonical
   * variant. Resolves to a default illustration +
   * title + description. Explicit props win when
   * both are set.
   */
  variant?: EmptyStateVariant;
  /**
   * Title. Optional when `variant` is set; the
   * variant's default title applies. Required
   * otherwise.
   */
  title?: string;
  description?: string | ReactNode;
  action?: EmptyStateAction | ReactNode;
  /**
   * Secondary affordance rendered below the primary CTA. Pass
   * `{ label, onClick }` for a button-style follow-up action or
   * `{ label, href }` for an anchor (external href opens in a
   * new tab with rel="noreferrer noopener"). Renders as a
   * subtle text link so it visually defers to the primary CTA.
   */
  secondaryAction?: EmptyStateSecondaryAction;
  /**
   * (v1.11.313, TODO 11.295) Optional dedicated help-link
   * affordance. Renders below the action stack as a small
   * "Learn more"-style anchor with an external-link suffix
   * when the href is absolute. Use this for doc deep-links
   * that should NOT be confused with the call-to-action
   * buttons.
   */
  helpLink?: EmptyStateHelpLink;
  /**
   * Size preset. `md` (default) matches the prior implicit
   * layout. `sm` tightens the padding for inline empty rows;
   * `lg` opens it up for top-level "all caught up" pages.
   */
  size?: EmptyStateSize;
  className?: string;
}

function isEmptyStateAction(value: unknown): value is EmptyStateAction {
  if (!value || typeof value !== 'object' || isValidElement(value)) return false;
  const candidate = value as { label?: unknown; onClick?: unknown };
  return typeof candidate.label === 'string' && typeof candidate.onClick === 'function';
}

// (v1.11.266) Per-size class tokens. Padding scales with size;
// title scales from `text-sm` (sm) -> `text-sm` (md) -> `text-base`
// (lg) to give large empty states a real heading hierarchy.
const SIZE_CLASSES: Record<EmptyStateSize, {
  root: string;
  title: string;
  gap: string;
}> = {
  sm: { root: 'p-3', title: 'text-xs', gap: 'gap-2' },
  md: { root: 'p-6', title: 'text-sm', gap: 'gap-3' },
  lg: { root: 'p-10', title: 'text-base', gap: 'gap-4' },
};

export function EmptyState({
  icon,
  illustration,
  variant,
  title,
  description,
  action,
  secondaryAction,
  helpLink,
  size = 'md',
  className,
  ...rest
}: EmptyStateProps) {
  // (v1.11.376, TODO 11.358) Resolve variant
  // defaults. Explicit props win over variant
  // defaults, which win over a bare empty string.
  const variantDefaults = variant ? VARIANT_DEFAULTS[variant] : null;
  const resolvedIllustration =
    illustration ?? variantDefaults?.illustration ?? undefined;
  const resolvedTitle =
    title !== undefined && title !== null
      ? title
      : (variantDefaults?.title ?? '');
  const resolvedDescription =
    description !== undefined
      ? description
      : variantDefaults?.description;
  // `icon` always wins so existing consumers retain control;
  // `illustration` (or the variant-resolved illustration) is the
  // fallback path for callers that want the named art with one
  // prop.
  const resolvedIcon: ReactNode =
    icon !== undefined
      ? icon
      : resolvedIllustration !== undefined
        ? (() => {
            const Component = ILLUSTRATION_REGISTRY[resolvedIllustration];
            return <Component aria-hidden />;
          })()
        : null;
  const sizing = SIZE_CLASSES[size];
  return (
    <div
      data-section="empty-state"
      data-empty-state-size={size}
      {...(variant ? { 'data-empty-state-variant': variant } : {})}
      className={cn(
        'flex flex-col items-center justify-center rounded-md border border-border bg-card text-center',
        sizing.root,
        sizing.gap,
        className,
      )}
      {...rest}
    >
      {resolvedIcon !== null ? (
        <div
          data-section="empty-state-illustration"
          className="text-muted-foreground"
          aria-hidden="true"
        >
          {resolvedIcon}
        </div>
      ) : null}
      <div
        data-section="empty-state-text"
        className="flex flex-col gap-1"
      >
        <span
          data-section="empty-state-title"
          className={cn('font-semibold text-foreground', sizing.title)}
        >
          {resolvedTitle}
        </span>
        {resolvedDescription ? (
          <span
            data-section="empty-state-description"
            className="text-sm text-muted-foreground"
          >
            {resolvedDescription}
          </span>
        ) : null}
      </div>
      {action ? (
        isEmptyStateAction(action) ? (
          <Button
            type="button"
            size="sm"
            onClick={action.onClick}
            data-section="empty-state-action"
          >
            {action.label}
          </Button>
        ) : (
          <div data-section="empty-state-action">{action}</div>
        )
      ) : null}
      {secondaryAction ? (
        'href' in secondaryAction ? (
          <a
            href={secondaryAction.href}
            target={
              secondaryAction.href.startsWith('http')
                ? '_blank'
                : undefined
            }
            rel={
              secondaryAction.href.startsWith('http')
                ? 'noreferrer noopener'
                : undefined
            }
            data-testid="empty-state-secondary-link"
            data-section="empty-state-secondary"
            className="text-xs text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
          >
            {secondaryAction.label}
          </a>
        ) : (
          <button
            type="button"
            onClick={secondaryAction.onClick}
            data-testid="empty-state-secondary-link"
            data-section="empty-state-secondary"
            className="text-xs text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
          >
            {secondaryAction.label}
          </button>
        )
      ) : null}
      {/* (v1.11.313, TODO 11.295) Dedicated help-link
          affordance below the action stack. Renders as a
          quieter anchor than the secondary action so it
          visually defers to both CTAs. External hrefs open in
          a new tab with rel=noreferrer noopener. */}
      {helpLink ? (
        <a
          href={helpLink.href}
          target={helpLink.href.startsWith('http') ? '_blank' : undefined}
          rel={
            helpLink.href.startsWith('http')
              ? 'noreferrer noopener'
              : undefined
          }
          data-section="empty-state-help-link"
          className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
        >
          {helpLink.label}
        </a>
      ) : null}
    </div>
  );
}

EmptyState.displayName = 'EmptyState';
