import {
  forwardRef,
  useCallback,
  useMemo,
  useState,
} from 'react';
import type { ForwardedRef, ReactNode } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  Megaphone,
  X,
} from 'lucide-react';
import { cn } from '../../lib/cn';

// (v1.11.445, TODO 11.427) AnnouncementBanner primitive.
//
// Site-wide banner with dismissible state, variant colours
// (info / warning / success / error / neutral), optional link
// slot, and per-id dismissal persisted to `localStorage` so
// users do not see the same announcement twice.
//
// Reference: /root/c4/arps-design-system-v1/.

export type AnnouncementVariant =
  | 'info'
  | 'warning'
  | 'success'
  | 'error'
  | 'neutral';

export type AnnouncementAlignment = 'left' | 'center';

export interface AnnouncementLink {
  href: string;
  label: ReactNode;
  external?: boolean;
}

export interface AnnouncementBannerProps {
  id: string;
  variant?: AnnouncementVariant;
  title?: ReactNode;
  description?: ReactNode;
  link?: AnnouncementLink;
  icon?: ReactNode;
  dismissible?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onDismiss?: () => void;
  storageKey?: string;
  alignment?: AnnouncementAlignment;
  className?: string;
  ariaLabel?: string;
  children?: ReactNode;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export const DEFAULT_ANNOUNCEMENT_STORAGE_PREFIX = 'c4:announcement:';
export const DEFAULT_ANNOUNCEMENT_VARIANT: AnnouncementVariant = 'info';
export const DEFAULT_ANNOUNCEMENT_ALIGNMENT: AnnouncementAlignment =
  'left';

export function getAnnouncementStorageKey(
  id: string,
  override?: string,
): string {
  if (override) return override;
  return `${DEFAULT_ANNOUNCEMENT_STORAGE_PREFIX}${id}`;
}

export function isAnnouncementDismissed(
  id: string,
  override?: string,
  storage: Storage | null | undefined = typeof window !== 'undefined'
    ? window.localStorage
    : null,
): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(
      getAnnouncementStorageKey(id, override),
    ) === 'dismissed';
  } catch {
    return false;
  }
}

export function markAnnouncementDismissed(
  id: string,
  override?: string,
  storage: Storage | null | undefined = typeof window !== 'undefined'
    ? window.localStorage
    : null,
): void {
  if (!storage) return;
  try {
    storage.setItem(
      getAnnouncementStorageKey(id, override),
      'dismissed',
    );
  } catch {
    // private mode / quota -> swallow
  }
}

export function clearAnnouncementDismissal(
  id: string,
  override?: string,
  storage: Storage | null | undefined = typeof window !== 'undefined'
    ? window.localStorage
    : null,
): void {
  if (!storage) return;
  try {
    storage.removeItem(getAnnouncementStorageKey(id, override));
  } catch {
    // swallow
  }
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

const VARIANT_CONTAINER_CLASS: Record<AnnouncementVariant, string> = {
  info: 'bg-primary/10 text-foreground border-primary/30',
  warning:
    'bg-warning/10 text-foreground border-warning/40',
  success:
    'bg-success/10 text-foreground border-success/40',
  error:
    'bg-destructive/10 text-foreground border-destructive/40',
  neutral: 'bg-muted text-foreground border-border',
};

const VARIANT_ICON_CLASS: Record<AnnouncementVariant, string> = {
  info: 'text-primary',
  warning: 'text-warning',
  success: 'text-success',
  error: 'text-destructive',
  neutral: 'text-muted-foreground',
};

const VARIANT_LINK_CLASS: Record<AnnouncementVariant, string> = {
  info: 'text-primary hover:text-primary/80',
  warning: 'text-warning hover:text-warning/80',
  success: 'text-success hover:text-success/80',
  error: 'text-destructive hover:text-destructive/80',
  neutral: 'text-foreground hover:text-foreground/80',
};

function getDefaultIcon(variant: AnnouncementVariant): ReactNode {
  switch (variant) {
    case 'info':
      return <Info aria-hidden="true" className="h-4 w-4" />;
    case 'warning':
      return <AlertTriangle aria-hidden="true" className="h-4 w-4" />;
    case 'success':
      return <CheckCircle2 aria-hidden="true" className="h-4 w-4" />;
    case 'error':
      return <AlertCircle aria-hidden="true" className="h-4 w-4" />;
    case 'neutral':
    default:
      return <Megaphone aria-hidden="true" className="h-4 w-4" />;
  }
}

export const AnnouncementBanner = forwardRef(function AnnouncementBanner(
  {
    id,
    variant = DEFAULT_ANNOUNCEMENT_VARIANT,
    title,
    description,
    link,
    icon,
    dismissible = true,
    open: openProp,
    defaultOpen = true,
    onOpenChange,
    onDismiss,
    storageKey,
    alignment = DEFAULT_ANNOUNCEMENT_ALIGNMENT,
    className,
    ariaLabel,
    children,
  }: AnnouncementBannerProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const initiallyDismissed = useMemo(
    () => isAnnouncementDismissed(id, storageKey),
    [id, storageKey],
  );

  const isControlled = openProp !== undefined;
  const [internalOpen, setInternalOpen] = useState<boolean>(
    () => defaultOpen && !initiallyDismissed,
  );
  const effectiveOpen = isControlled ? !!openProp : internalOpen;

  const onOpenChangeRef = useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  const handleDismiss = useCallback(() => {
    markAnnouncementDismissed(id, storageKey);
    onOpenChangeRef(false);
    onDismiss?.();
  }, [id, onDismiss, onOpenChangeRef, storageKey]);

  if (!effectiveOpen) return null;

  const resolvedIcon = icon ?? getDefaultIcon(variant);
  const resolvedAriaLabel =
    ariaLabel ??
    (typeof title === 'string' ? title : 'Announcement');

  const isExternalLink = link?.external ?? false;

  return (
    <div
      ref={ref}
      role="region"
      aria-label={resolvedAriaLabel}
      data-section="announcement-banner"
      data-banner-id={id}
      data-variant={variant}
      data-alignment={alignment}
      data-dismissible={dismissible ? 'true' : 'false'}
      className={cn(
        'flex w-full items-start gap-3 border-y px-4 py-3',
        VARIANT_CONTAINER_CLASS[variant],
        alignment === 'center' && 'justify-center text-center',
        className,
      )}
    >
      <span
        aria-hidden="true"
        data-section="announcement-banner-icon"
        className={cn(
          'mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center',
          VARIANT_ICON_CLASS[variant],
        )}
      >
        {resolvedIcon}
      </span>
      <div
        data-section="announcement-banner-content"
        className={cn(
          'flex flex-1 flex-col gap-1',
          alignment === 'center' && 'items-center',
        )}
      >
        {children !== undefined ? (
          <div data-section="announcement-banner-body">
            {children}
          </div>
        ) : (
          <>
            {title !== undefined ? (
              <span
                data-section="announcement-banner-title"
                className="text-sm font-semibold"
              >
                {title}
              </span>
            ) : null}
            {description !== undefined ? (
              <span
                data-section="announcement-banner-description"
                className="text-sm text-muted-foreground"
              >
                {description}
              </span>
            ) : null}
          </>
        )}
        {link ? (
          <a
            href={link.href}
            target={isExternalLink ? '_blank' : undefined}
            rel={isExternalLink ? 'noopener noreferrer' : undefined}
            data-section="announcement-banner-link"
            data-external={isExternalLink ? 'true' : 'false'}
            className={cn(
              'inline-flex items-center text-sm font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:underline',
              VARIANT_LINK_CLASS[variant],
            )}
          >
            {link.label}
          </a>
        ) : null}
      </div>
      {dismissible ? (
        <button
          type="button"
          data-section="announcement-banner-dismiss"
          aria-label="Dismiss announcement"
          onClick={handleDismiss}
          className="-mr-1 -mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
});

AnnouncementBanner.displayName = 'AnnouncementBanner';
