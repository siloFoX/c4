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
  className?: string;
}

function isEmptyStateAction(value: unknown): value is EmptyStateAction {
  if (!value || typeof value !== 'object' || isValidElement(value)) return false;
  const candidate = value as { label?: unknown; onClick?: unknown };
  return typeof candidate.label === 'string' && typeof candidate.onClick === 'function';
}

export function EmptyState({
  icon,
  illustration,
  title,
  description,
  action,
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
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-md border border-border bg-card p-6 text-center',
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
        <span className="text-sm font-semibold text-foreground">{title}</span>
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
    </div>
  );
}
