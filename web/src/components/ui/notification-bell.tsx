import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { ForwardedRef, ReactNode } from 'react';
import { Bell, Check, CheckCheck } from 'lucide-react';
import { cn } from '../../lib/cn';

// (v1.11.442, TODO 11.424) NotificationBell primitive.
//
// Bell trigger with an unread-count badge and a popover panel
// listing notifications. Each item carries a per-row "mark as
// read" action; the panel header exposes a global "mark all
// as read" affordance. The unread badge animates on count
// change via the `motion-safe` Tailwind variant so users with
// `prefers-reduced-motion` are not pulsed at.
//
// Reference: /root/c4/arps-design-system-v1/.

export interface NotificationItem {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  timestamp?: string | number | Date;
  read?: boolean;
  href?: string;
  icon?: ReactNode;
}

export interface NotificationItemRenderArgs {
  notification: NotificationItem;
  isUnread: boolean;
  onMarkRead: () => void;
  onClick: () => void;
}

export interface NotificationBellProps {
  notifications: NotificationItem[];
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onMarkAsRead?: (id: string) => void;
  onMarkAllAsRead?: () => void;
  onNotificationClick?: (notification: NotificationItem) => void;
  ariaLabel?: string;
  emptyState?: ReactNode;
  maxBadgeCount?: number;
  animateBadge?: boolean;
  className?: string;
  panelClassName?: string;
  align?: 'left' | 'right';
  width?: number | string;
  closeOnSelect?: boolean;
  renderItem?: (args: NotificationItemRenderArgs) => ReactNode;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export const DEFAULT_NOTIFICATION_MAX_BADGE = 9;
export const DEFAULT_NOTIFICATION_PANEL_WIDTH = 320;
export const DEFAULT_NOTIFICATION_ALIGN: 'left' | 'right' = 'right';

export function getUnreadCount(
  notifications: readonly NotificationItem[],
): number {
  let count = 0;
  for (const n of notifications) {
    if (!n.read) count += 1;
  }
  return count;
}

export function formatBadgeCount(
  count: number,
  max: number = DEFAULT_NOTIFICATION_MAX_BADGE,
): string {
  if (!Number.isFinite(count) || count <= 0) return '';
  const safeMax = Number.isFinite(max) && max > 0 ? max : count;
  if (count > safeMax) return `${safeMax}+`;
  return `${Math.floor(count)}`;
}

export function sortNotificationsByTimestamp(
  notifications: readonly NotificationItem[],
): NotificationItem[] {
  return [...notifications].sort((a, b) => {
    const aTime = toEpoch(a.timestamp);
    const bTime = toEpoch(b.timestamp);
    return bTime - aTime;
  });
}

function toEpoch(value: NotificationItem['timestamp']): number {
  if (value == null) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export const NotificationBell = forwardRef(function NotificationBell(
  {
    notifications,
    open: openProp,
    defaultOpen = false,
    onOpenChange,
    onMarkAsRead,
    onMarkAllAsRead,
    onNotificationClick,
    ariaLabel = 'Notifications',
    emptyState = 'No notifications',
    maxBadgeCount = DEFAULT_NOTIFICATION_MAX_BADGE,
    animateBadge = true,
    className,
    panelClassName,
    align = DEFAULT_NOTIFICATION_ALIGN,
    width = DEFAULT_NOTIFICATION_PANEL_WIDTH,
    closeOnSelect = true,
    renderItem,
  }: NotificationBellProps,
  ref: ForwardedRef<HTMLButtonElement>,
) {
  const isControlled = openProp !== undefined;
  const [internalOpen, setInternalOpen] = useState<boolean>(
    defaultOpen,
  );
  const effectiveOpen = isControlled ? !!openProp : internalOpen;

  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);

  const emitOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalOpen(next);
      onOpenChangeRef.current?.(next);
    },
    [isControlled],
  );

  const unreadCount = getUnreadCount(notifications);
  const badgeText = formatBadgeCount(unreadCount, maxBadgeCount);
  const hasUnread = unreadCount > 0;

  // Badge animation gating: pulse the badge on every count
  // increase. We track the previous count in a ref so the
  // animation only retriggers when the count actually changes.
  const previousCountRef = useRef<number>(unreadCount);
  const [badgePulseKey, setBadgePulseKey] = useState<number>(0);
  useEffect(() => {
    if (!animateBadge) return;
    if (previousCountRef.current !== unreadCount) {
      if (unreadCount > previousCountRef.current) {
        setBadgePulseKey((k) => k + 1);
      }
      previousCountRef.current = unreadCount;
    }
  }, [animateBadge, unreadCount]);

  const toggle = useCallback(() => {
    emitOpen(!effectiveOpen);
  }, [effectiveOpen, emitOpen]);

  const close = useCallback(() => {
    emitOpen(false);
  }, [emitOpen]);

  const handleNotificationClick = useCallback(
    (notification: NotificationItem) => {
      onNotificationClick?.(notification);
      if (closeOnSelect) close();
    },
    [closeOnSelect, close, onNotificationClick],
  );

  const handleMarkRead = useCallback(
    (id: string) => {
      onMarkAsRead?.(id);
    },
    [onMarkAsRead],
  );

  const handleMarkAllRead = useCallback(() => {
    onMarkAllAsRead?.();
  }, [onMarkAllAsRead]);

  // Click outside / Escape to close
  const panelRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const setButtonRef = useCallback(
    (el: HTMLButtonElement | null) => {
      buttonRef.current = el;
      if (typeof ref === 'function') ref(el);
      else if (ref) ref.current = el;
    },
    [ref],
  );

  useEffect(() => {
    if (!effectiveOpen) return undefined;
    const onPointerDown = (event: MouseEvent) => {
      const panel = panelRef.current;
      const button = buttonRef.current;
      const target = event.target as Node | null;
      if (panel && target && panel.contains(target)) return;
      if (button && target && button.contains(target)) return;
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [close, effectiveOpen]);

  const widthStyle =
    typeof width === 'number' ? `${width}px` : width;
  const sorted = sortNotificationsByTimestamp(notifications);

  return (
    <div
      data-section="notification-bell"
      data-open={effectiveOpen ? 'true' : 'false'}
      data-unread-count={unreadCount}
      data-has-unread={hasUnread ? 'true' : 'false'}
      className={cn('relative inline-flex', className)}
    >
      <button
        ref={setButtonRef}
        type="button"
        aria-label={
          hasUnread
            ? `${ariaLabel} (${unreadCount} unread)`
            : ariaLabel
        }
        aria-haspopup="dialog"
        aria-expanded={effectiveOpen}
        onClick={toggle}
        data-section="notification-bell-trigger"
        className={cn(
          'relative inline-flex h-9 w-9 items-center justify-center rounded-full text-foreground hover:bg-muted',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        )}
      >
        <Bell aria-hidden="true" className="h-5 w-5" />
        {hasUnread ? (
          <span
            key={animateBadge ? `pulse-${badgePulseKey}` : 'static'}
            aria-hidden="true"
            data-section="notification-bell-badge"
            data-badge-count={unreadCount}
            className={cn(
              'absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground',
              animateBadge && 'motion-safe:animate-bounce-once',
            )}
          >
            {badgeText}
          </span>
        ) : null}
      </button>
      {effectiveOpen ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={`${ariaLabel} panel`}
          data-section="notification-bell-panel"
          data-align={align}
          style={{ width: widthStyle }}
          className={cn(
            'absolute top-full z-30 mt-2 flex max-h-[60vh] flex-col overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-lg',
            align === 'right' ? 'right-0' : 'left-0',
            panelClassName,
          )}
        >
          <div
            data-section="notification-bell-header"
            className="flex items-center justify-between border-b border-border px-3 py-2"
          >
            <span className="text-sm font-semibold">
              {ariaLabel}
            </span>
            {hasUnread ? (
              <button
                type="button"
                data-section="notification-bell-mark-all"
                aria-label="Mark all as read"
                onClick={handleMarkAllRead}
                className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <CheckCheck aria-hidden="true" className="h-3 w-3" />
                Mark all
              </button>
            ) : null}
          </div>
          <ul
            data-section="notification-bell-list"
            className="flex-1 overflow-y-auto"
          >
            {sorted.length === 0 ? (
              <li
                data-section="notification-bell-empty"
                className="px-3 py-6 text-center text-sm text-muted-foreground"
              >
                {emptyState}
              </li>
            ) : (
              sorted.map((notification) => {
                const isUnread = !notification.read;
                const onMarkRead = () => handleMarkRead(notification.id);
                const onClick = () =>
                  handleNotificationClick(notification);
                if (renderItem) {
                  return (
                    <li
                      key={notification.id}
                      data-section="notification-bell-item"
                      data-item-id={notification.id}
                      data-unread={isUnread ? 'true' : 'false'}
                    >
                      {renderItem({
                        notification,
                        isUnread,
                        onMarkRead,
                        onClick,
                      })}
                    </li>
                  );
                }
                return (
                  <li
                    key={notification.id}
                    data-section="notification-bell-item"
                    data-item-id={notification.id}
                    data-unread={isUnread ? 'true' : 'false'}
                    className={cn(
                      'flex items-start gap-2 border-b border-border px-3 py-2 last:border-b-0',
                      isUnread && 'bg-primary/5',
                    )}
                  >
                    <button
                      type="button"
                      data-section="notification-bell-item-trigger"
                      onClick={onClick}
                      className="flex flex-1 flex-col items-start gap-0.5 text-left"
                    >
                      <span
                        data-section="notification-bell-item-title"
                        className={cn(
                          'text-sm',
                          isUnread
                            ? 'font-semibold text-foreground'
                            : 'text-muted-foreground',
                        )}
                      >
                        {notification.title}
                      </span>
                      {notification.description !== undefined ? (
                        <span
                          data-section="notification-bell-item-description"
                          className="text-xs text-muted-foreground"
                        >
                          {notification.description}
                        </span>
                      ) : null}
                    </button>
                    {isUnread ? (
                      <button
                        type="button"
                        data-section="notification-bell-item-mark"
                        aria-label="Mark as read"
                        onClick={onMarkRead}
                        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Check aria-hidden="true" className="h-3 w-3" />
                      </button>
                    ) : null}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
});

NotificationBell.displayName = 'NotificationBell';
