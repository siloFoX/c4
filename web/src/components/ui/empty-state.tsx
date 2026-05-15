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
  title: string;
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
  title,
  description,
  action,
  secondaryAction,
  size = 'md',
  className,
  ...rest
}: EmptyStateProps) {
  // `icon` always wins so existing consumers retain control;
  // `illustration` is the fallback path for callers that want
  // the named art with one prop.
  const resolvedIcon: ReactNode =
    icon !== undefined
      ? icon
      : illustration !== undefined
        ? (() => {
            const Component = ILLUSTRATION_REGISTRY[illustration];
            return <Component aria-hidden />;
          })()
        : null;
  const sizing = SIZE_CLASSES[size];
  return (
    <div
      data-empty-state-size={size}
      className={cn(
        'flex flex-col items-center justify-center rounded-md border border-border bg-card text-center',
        sizing.root,
        sizing.gap,
        className,
      )}
      {...rest}
    >
      {resolvedIcon !== null ? (
        <div className="text-muted-foreground" aria-hidden="true">
          {resolvedIcon}
        </div>
      ) : null}
      <div className="flex flex-col gap-1">
        <span
          className={cn('font-semibold text-foreground', sizing.title)}
        >
          {title}
        </span>
        {description ? (
          <span className="text-sm text-muted-foreground">{description}</span>
        ) : null}
      </div>
      {action ? (
        isEmptyStateAction(action) ? (
          <Button type="button" size="sm" onClick={action.onClick}>
            {action.label}
          </Button>
        ) : (
          action
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
            className="text-xs text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
          >
            {secondaryAction.label}
          </a>
        ) : (
          <button
            type="button"
            onClick={secondaryAction.onClick}
            data-testid="empty-state-secondary-link"
            className="text-xs text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
          >
            {secondaryAction.label}
          </button>
        )
      ) : null}
    </div>
  );
}
