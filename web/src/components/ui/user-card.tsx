import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { ForwardedRef, ReactNode } from 'react';
import { ExternalLink, Mail, MapPin } from 'lucide-react';
import { cn } from '../../lib/cn';

// (v1.11.453, TODO 11.435) UserCard primitive.
//
// Avatar + name + role display with an opt-in hover-card
// popover that shows an extended profile (bio, email,
// location, joined-at, link list). The name row exposes an
// online-status dot in the bottom-right of the avatar. Both
// the inline chip and the popover are keyboard-reachable +
// screen-reader accessible.
//
// Reference: /root/c4/arps-design-system-v1/.

export type UserCardStatus =
  | 'online'
  | 'away'
  | 'busy'
  | 'offline'
  | 'unknown';

export interface UserCardLink {
  label: ReactNode;
  href: string;
  external?: boolean;
}

export interface UserCardProfile {
  email?: string;
  bio?: ReactNode;
  location?: ReactNode;
  joinedAt?: string | number | Date;
  links?: readonly UserCardLink[];
}

export interface UserCardProps {
  name: string;
  role?: string;
  avatarSrc?: string;
  avatarAlt?: string;
  status?: UserCardStatus;
  statusLabel?: string;
  profile?: UserCardProfile;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  hoverDelay?: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  ariaLabel?: string;
  href?: string;
  onClick?: () => void;
  showRole?: boolean;
  showStatus?: boolean;
  showHoverCard?: boolean;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export const DEFAULT_USER_CARD_HOVER_DELAY = 150;

export function getInitials(name: string): string {
  if (!name) return '';
  const words = name
    .split(/\s+/)
    .filter((w) => w.length > 0);
  if (words.length === 0) return '';
  if (words.length === 1) return words[0]!.charAt(0).toUpperCase();
  return (
    words[0]!.charAt(0).toUpperCase() +
    words[words.length - 1]!.charAt(0).toUpperCase()
  );
}

const STATUS_LABELS: Record<UserCardStatus, string> = {
  online: 'Online',
  away: 'Away',
  busy: 'Busy',
  offline: 'Offline',
  unknown: 'Unknown',
};

export function getStatusLabel(status: UserCardStatus): string {
  return STATUS_LABELS[status] ?? 'Unknown';
}

const STATUS_DOT_CLASS: Record<UserCardStatus, string> = {
  online: 'bg-success',
  away: 'bg-warning',
  busy: 'bg-destructive',
  offline: 'bg-muted-foreground',
  unknown: 'bg-muted-foreground',
};

export function getStatusDotClass(status: UserCardStatus): string {
  return STATUS_DOT_CLASS[status] ?? STATUS_DOT_CLASS.unknown;
}

function toEpoch(value: UserCardProfile['joinedAt']): number {
  if (value === undefined || value === null) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatJoinedDate(
  value: UserCardProfile['joinedAt'],
): string {
  const ms = toEpoch(value);
  if (ms <= 0) return '';
  const d = new Date(ms);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

const SIZE_AVATAR: Record<NonNullable<UserCardProps['size']>, number> = {
  sm: 24,
  md: 32,
  lg: 40,
};

const SIZE_DOT: Record<NonNullable<UserCardProps['size']>, number> = {
  sm: 6,
  md: 8,
  lg: 10,
};

export const UserCard = forwardRef(function UserCard(
  {
    name,
    role,
    avatarSrc,
    avatarAlt,
    status = 'unknown',
    statusLabel,
    profile,
    open: openProp,
    defaultOpen = false,
    onOpenChange,
    hoverDelay = DEFAULT_USER_CARD_HOVER_DELAY,
    size = 'md',
    className,
    ariaLabel,
    href,
    onClick,
    showRole = true,
    showStatus = true,
    showHoverCard = true,
  }: UserCardProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const isOpenControlled = openProp !== undefined;
  const [internalOpen, setInternalOpen] = useState<boolean>(defaultOpen);
  const effectiveOpen = isOpenControlled
    ? !!openProp
    : internalOpen;

  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);

  const emitOpen = useCallback(
    (next: boolean) => {
      if (!isOpenControlled) setInternalOpen(next);
      onOpenChangeRef.current?.(next);
    },
    [isOpenControlled],
  );

  // Hover delay -- enter timer + leave timer for natural
  // hover-card UX.
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelTimers = useCallback(() => {
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);
  useEffect(() => () => cancelTimers(), [cancelTimers]);

  const scheduleOpen = useCallback(() => {
    if (!showHoverCard) return;
    cancelTimers();
    openTimer.current = setTimeout(() => {
      emitOpen(true);
      openTimer.current = null;
    }, hoverDelay);
  }, [cancelTimers, emitOpen, hoverDelay, showHoverCard]);

  const scheduleClose = useCallback(() => {
    if (!showHoverCard) return;
    cancelTimers();
    closeTimer.current = setTimeout(() => {
      emitOpen(false);
      closeTimer.current = null;
    }, hoverDelay);
  }, [cancelTimers, emitOpen, hoverDelay, showHoverCard]);

  const handleFocus = useCallback(() => {
    if (!showHoverCard) return;
    cancelTimers();
    emitOpen(true);
  }, [cancelTimers, emitOpen, showHoverCard]);

  const handleBlur = useCallback(() => {
    if (!showHoverCard) return;
    scheduleClose();
  }, [scheduleClose, showHoverCard]);

  const initials = getInitials(name);
  const avatarPx = SIZE_AVATAR[size];
  const dotPx = SIZE_DOT[size];
  const resolvedStatusLabel =
    statusLabel ?? getStatusLabel(status);
  const isInteractive =
    typeof onClick === 'function' || href !== undefined;

  const triggerProps = {
    onMouseEnter: scheduleOpen,
    onMouseLeave: scheduleClose,
    onFocus: handleFocus,
    onBlur: handleBlur,
    'aria-describedby': showHoverCard
      ? `user-card-popover-${name.replace(/\s+/g, '-')}`
      : undefined,
    'data-section': 'user-card-trigger',
  } as const;

  const triggerContent = (
    <>
      <span
        data-section="user-card-avatar-wrapper"
        className="relative inline-flex shrink-0"
        style={{ width: avatarPx, height: avatarPx }}
      >
        {avatarSrc ? (
          <img
            src={avatarSrc}
            alt={avatarAlt ?? name}
            data-section="user-card-avatar"
            decoding="async"
            draggable={false}
            className="h-full w-full rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            data-section="user-card-avatar-fallback"
            className="flex h-full w-full items-center justify-center rounded-full bg-muted font-medium text-foreground"
            style={{ fontSize: avatarPx * 0.4 }}
          >
            {initials}
          </span>
        )}
        {showStatus ? (
          <span
            aria-label={`Status: ${resolvedStatusLabel}`}
            data-section="user-card-status-dot"
            data-status={status}
            className={cn(
              'absolute -bottom-0.5 -right-0.5 inline-block rounded-full ring-2 ring-card',
              getStatusDotClass(status),
            )}
            style={{ width: dotPx, height: dotPx }}
          />
        ) : null}
      </span>
      <span
        data-section="user-card-text"
        className="flex flex-col"
      >
        <span
          data-section="user-card-name"
          className="text-sm font-medium text-foreground"
        >
          {name}
        </span>
        {showRole && role ? (
          <span
            data-section="user-card-role"
            className="text-xs text-muted-foreground"
          >
            {role}
          </span>
        ) : null}
      </span>
    </>
  );

  const triggerClass = cn(
    'inline-flex items-center gap-2 rounded',
    isInteractive &&
      'cursor-pointer hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
  );

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel ?? `${name} card`}
      data-section="user-card"
      data-status={status}
      data-size={size}
      data-open={effectiveOpen ? 'true' : 'false'}
      data-interactive={isInteractive ? 'true' : 'false'}
      className={cn('relative inline-flex', className)}
    >
      {href ? (
        <a
          href={href}
          {...triggerProps}
          onClick={onClick}
          className={triggerClass}
        >
          {triggerContent}
        </a>
      ) : isInteractive ? (
        <button
          type="button"
          onClick={onClick}
          {...triggerProps}
          className={triggerClass}
        >
          {triggerContent}
        </button>
      ) : (
        <span {...triggerProps} className={triggerClass}>
          {triggerContent}
        </span>
      )}
      {showHoverCard && effectiveOpen && profile ? (
        <div
          role="tooltip"
          id={`user-card-popover-${name.replace(/\s+/g, '-')}`}
          aria-label={`${name} profile`}
          data-section="user-card-popover"
          onMouseEnter={() => {
            if (closeTimer.current) {
              clearTimeout(closeTimer.current);
              closeTimer.current = null;
            }
          }}
          onMouseLeave={scheduleClose}
          className="absolute left-0 top-full z-30 mt-2 flex w-64 flex-col gap-2 rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-lg"
        >
          <header
            data-section="user-card-popover-header"
            className="flex items-center gap-2"
          >
            <span
              aria-hidden="true"
              data-section="user-card-popover-avatar-wrapper"
              className="relative inline-flex shrink-0"
              style={{ width: 40, height: 40 }}
            >
              {avatarSrc ? (
                <img
                  src={avatarSrc}
                  alt=""
                  data-section="user-card-popover-avatar"
                  draggable={false}
                  className="h-full w-full rounded-full object-cover"
                />
              ) : (
                <span
                  data-section="user-card-popover-avatar-fallback"
                  className="flex h-full w-full items-center justify-center rounded-full bg-muted font-medium text-foreground"
                  style={{ fontSize: 16 }}
                >
                  {initials}
                </span>
              )}
              {showStatus ? (
                <span
                  aria-hidden="true"
                  data-section="user-card-popover-status-dot"
                  data-status={status}
                  className={cn(
                    'absolute -bottom-0.5 -right-0.5 inline-block h-2.5 w-2.5 rounded-full ring-2 ring-popover',
                    getStatusDotClass(status),
                  )}
                />
              ) : null}
            </span>
            <div className="flex flex-1 flex-col">
              <span
                data-section="user-card-popover-name"
                className="text-sm font-semibold text-foreground"
              >
                {name}
              </span>
              {role ? (
                <span
                  data-section="user-card-popover-role"
                  className="text-xs text-muted-foreground"
                >
                  {role}
                </span>
              ) : null}
              {showStatus ? (
                <span
                  data-section="user-card-popover-status-label"
                  data-status={status}
                  className="text-[10px] uppercase tracking-wide text-muted-foreground"
                >
                  {resolvedStatusLabel}
                </span>
              ) : null}
            </div>
          </header>
          {profile.bio !== undefined ? (
            <p
              data-section="user-card-popover-bio"
              className="text-xs text-foreground"
            >
              {profile.bio}
            </p>
          ) : null}
          <dl
            data-section="user-card-popover-details"
            className="flex flex-col gap-1 text-xs text-muted-foreground"
          >
            {profile.email ? (
              <div
                data-section="user-card-popover-email"
                className="flex items-center gap-1"
              >
                <Mail aria-hidden="true" className="h-3 w-3" />
                <a
                  href={`mailto:${profile.email}`}
                  className="text-primary hover:underline"
                >
                  {profile.email}
                </a>
              </div>
            ) : null}
            {profile.location !== undefined ? (
              <div
                data-section="user-card-popover-location"
                className="flex items-center gap-1"
              >
                <MapPin aria-hidden="true" className="h-3 w-3" />
                <span>{profile.location}</span>
              </div>
            ) : null}
            {profile.joinedAt !== undefined ? (
              <div
                data-section="user-card-popover-joined"
                className="text-[10px] uppercase tracking-wide"
              >
                Joined {formatJoinedDate(profile.joinedAt)}
              </div>
            ) : null}
          </dl>
          {profile.links && profile.links.length > 0 ? (
            <ul
              data-section="user-card-popover-links"
              className="flex flex-wrap items-center gap-2 text-xs"
            >
              {profile.links.map((link, idx) => (
                <li
                  key={`${link.href}-${idx}`}
                  data-section="user-card-popover-link"
                >
                  <a
                    href={link.href}
                    target={link.external ? '_blank' : undefined}
                    rel={
                      link.external ? 'noopener noreferrer' : undefined
                    }
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    {link.label}
                    {link.external ? (
                      <ExternalLink
                        aria-hidden="true"
                        className="h-3 w-3"
                      />
                    ) : null}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});

UserCard.displayName = 'UserCard';
