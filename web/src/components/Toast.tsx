import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AnnounceContext } from '../hooks/use-announce';
import type { PointerEvent as ReactPointerEvent, TouchEvent as ReactTouchEvent } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { Card, CardContent, Chip } from './ui';
import { cn } from '../lib/cn';
import { getPortalRoot } from '../lib/portal-root';
import { motionClass } from '../lib/motion';
import {
  MOTION_DURATION_FAST_MS,
  MOTION_EASE_STANDARD,
} from '../lib/motion-tokens';
import { useReducedMotion } from '../hooks/use-reduced-motion';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastProps {
  message: string;
  type: ToastType;
  onDismiss: () => void;
  duration?: number;
}

const TONE: Record<ToastType, string> = {
  success: 'border-success/40 bg-success/15 text-success',
  error: 'border-destructive/40 bg-destructive/10 text-destructive-foreground',
  info: 'border-info/40 bg-info/15 text-info',
  warning: 'border-warning/40 bg-warning/15 text-warning',
};

// Priority ordering for the visible queue. Higher = surfaces first.
// error > warning > success > info. Same-priority ties fall back to
// insertion order (ascending id), so the queue is stable FIFO within
// a tier.
export const TOAST_PRIORITY: Record<ToastType, number> = {
  error: 3,
  warning: 2,
  success: 1,
  info: 0,
};

// Maximum number of toasts visible at the same time. Anything past
// this cap is held in `pending` until a visible slot dismisses.
export const TOAST_VISIBLE_LIMIT = 3;

export interface ToastEntry {
  id: number;
  message: string;
  type: ToastType;
}

// Split a flat queue into the slice that should be visible right now
// vs the slice waiting to be promoted. Sorting is stable: priority
// descending, then id ascending (= insertion order). Exported so the
// useToast hook can derive the same view without re-implementing it.
export function partitionToasts(
  toasts: readonly ToastEntry[],
  limit: number = TOAST_VISIBLE_LIMIT,
): { visible: ToastEntry[]; pending: ToastEntry[] } {
  const sorted = [...toasts].sort((a, b) => {
    const pa = TOAST_PRIORITY[a.type] ?? 0;
    const pb = TOAST_PRIORITY[b.type] ?? 0;
    if (pb !== pa) return pb - pa;
    return a.id - b.id;
  });
  return {
    visible: sorted.slice(0, limit),
    pending: sorted.slice(limit),
  };
}

// Swipe-to-dismiss threshold in px. Drag beyond this on either axis
// (horizontal) commits the dismissal; anything less snaps back to 0.
export const TOAST_SWIPE_THRESHOLD = 80;

// (v1.11.253, TODO 11.235) Animation budget. Used for both the
// exit slide-out and the post-dismiss fade so consumers can
// synchronise unmount timing. Sourced from the central motion
// scale (`lib/motion-tokens.ts`) so a future migration only
// flips one number; the prior 180 ms ad-hoc value rounded to
// the canonical 150 ms `--motion-duration-fast` step.
const TOAST_EXIT_MS = MOTION_DURATION_FAST_MS;

// Lazy-create the portal target so the toast layer survives parent
// route changes: even if a page unmounts, #toast-root stays in
// document.body and is reused by the next toast that mounts.
export function getToastRoot(): HTMLElement {
  const root = getPortalRoot('toast-root')!;
  // Apply toast-specific positioning + tagging on first creation.
  if (!root.hasAttribute('data-toast-root')) {
    root.setAttribute('data-toast-root', 'true');
    root.className =
      'pointer-events-none fixed right-4 top-4 z-50 flex flex-col gap-2 pb-safe-b pl-safe-l pr-safe-r';
  }
  return root;
}

export default function Toast({
  message,
  type,
  onDismiss,
  duration = 3000,
}: ToastProps) {
  const [dragX, setDragX] = useState(0);
  const [entered, setEntered] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const dragOrigin = useRef<number | null>(null);
  const dragXRef = useRef(0);
  const dragging = useRef(false);
  const dismissed = useRef(false);
  const onDismissRef = useRef(onDismiss);
  const reducedMotion = useReducedMotion();
  // Optional aria-live announcement. Reading the context directly so
  // existing Toast tests that mount without an <AnnounceRegion>
  // provider continue to pass.
  const announce = useContext(AnnounceContext);

  useEffect(() => {
    if (!announce) return;
    announce(message, type === 'error' ? 'assertive' : 'polite');
    // Announce once on appear -- intentional dep list omission of
    // message/type so an update inside the same Toast instance does
    // not double-announce. Each new toast creates a new Toast mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  const fireDismiss = useCallback(() => {
    if (dismissed.current) return;
    dismissed.current = true;
    onDismissRef.current();
  }, []);

  // Slide-in: start at translateX(100%) then flip on the next frame
  // so the CSS transition has a starting frame to interpolate from.
  useEffect(() => {
    const raf =
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(() => setEntered(true))
        : (setTimeout(() => setEntered(true), 0) as unknown as number);
    return () => {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
      else clearTimeout(raf);
    };
  }, []);

  // Auto-dismiss timer. Honours the duration prop so the existing
  // 3000 ms default and custom-duration consumers are unaffected.
  useEffect(() => {
    if (leaving) return undefined;
    const id = setTimeout(fireDismiss, duration);
    return () => clearTimeout(id);
  }, [duration, fireDismiss, leaving]);

  const beginDrag = useCallback((x: number) => {
    dragging.current = true;
    dragOrigin.current = x;
    dragXRef.current = 0;
    setDragX(0);
  }, []);

  const updateDrag = useCallback((x: number) => {
    if (!dragging.current || dragOrigin.current === null) return;
    const dx = x - dragOrigin.current;
    dragXRef.current = dx;
    setDragX(dx);
  }, []);

  const endDrag = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    dragOrigin.current = null;
    const cur = dragXRef.current;
    if (Math.abs(cur) >= TOAST_SWIPE_THRESHOLD) {
      setLeaving(true);
      setDragX(Math.sign(cur) * 480);
      dragXRef.current = 0;
      setTimeout(fireDismiss, TOAST_EXIT_MS);
      return;
    }
    dragXRef.current = 0;
    setDragX(0);
  }, [fireDismiss]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture?.(e.pointerId);
      beginDrag(e.clientX);
    },
    [beginDrag],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => updateDrag(e.clientX),
    [updateDrag],
  );

  const onPointerUp = useCallback(() => endDrag(), [endDrag]);

  const onTouchStart = useCallback(
    (e: ReactTouchEvent<HTMLDivElement>) => {
      const t = e.touches[0];
      if (!t) return;
      beginDrag(t.clientX);
    },
    [beginDrag],
  );

  const onTouchMove = useCallback(
    (e: ReactTouchEvent<HTMLDivElement>) => {
      const t = e.touches[0];
      if (!t) return;
      updateDrag(t.clientX);
    },
    [updateDrag],
  );

  const onTouchEnd = useCallback(() => endDrag(), [endDrag]);

  const Icon =
    type === 'success'
      ? CheckCircle2
      : type === 'error' || type === 'warning'
        ? AlertTriangle
        : Info;

  // Compose the visible transform. Enter: slide in from right.
  // Drag: track pointer horizontally. Leaving: parked at large
  // translateX so the exit slide is visible until unmount.
  const tx = !entered ? '100%' : `${dragX}px`;
  // (v1.11.253, TODO 11.235) Standard easing replaces the bare
  // `ease` keyword so Toast moves on the same curve as Dialog /
  // Popover / Drawer. Numbers come from the central scale.
  const transition = dragging.current
    ? `opacity ${TOAST_EXIT_MS}ms ${MOTION_EASE_STANDARD}`
    : `transform ${TOAST_EXIT_MS}ms ${MOTION_EASE_STANDARD}, opacity ${TOAST_EXIT_MS}ms ${MOTION_EASE_STANDARD}`;

  const node = (
    <div
      data-testid="toast"
      data-print-hide
      style={{
        transform: `translateX(${tx})`,
        opacity: leaving ? 0 : 1,
        transition,
        touchAction: 'pan-y',
      }}
      className="pointer-events-auto select-none no-print"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      <Card
        role="status"
        className={cn(
          'border shadow-lg cursor-grab active:cursor-grabbing',
          TONE[type],
          leaving
            ? motionClass('fadeOut', reducedMotion)
            : motionClass('fadeIn', reducedMotion),
        )}
      >
        <CardContent className="flex items-start gap-2 p-3 text-sm">
          <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="min-w-0 break-words">{message}</span>
        </CardContent>
      </Card>
    </div>
  );

  return createPortal(node, getToastRoot());
}

export interface ToastStackProps {
  toasts: readonly ToastEntry[];
  onDismiss: (id: number) => void;
  duration?: number;
  visibleLimit?: number;
}

// Priority-aware view of the toast queue. The component is the
// component-scope home of the "visible cap + pending overflow"
// contract: it sorts the incoming queue by TOAST_PRIORITY, mounts at
// most `visibleLimit` Toast instances (default TOAST_VISIBLE_LIMIT),
// and renders a "+N more" Chip into the same portal when there are
// overflow entries. Each individual Toast still owns its own
// auto-dismiss / swipe-to-dismiss timer; dismissals bubble back here
// via onDismiss so the parent can drop the id from its source array
// and let the next-highest-priority pending entry promote on the
// following render.
export function ToastStack({
  toasts,
  onDismiss,
  duration,
  visibleLimit = TOAST_VISIBLE_LIMIT,
}: ToastStackProps) {
  const { visible, pending } = useMemo(
    () => partitionToasts(toasts, visibleLimit),
    [toasts, visibleLimit],
  );

  const overflow = pending.length;
  const chip =
    overflow > 0 ? (
      <Chip
        data-testid="toast-overflow-chip"
        tone="neutral"
        variant="subtle"
        size="sm"
        className="self-end shadow-sm pointer-events-auto"
        aria-label={`${overflow} more toast${overflow === 1 ? '' : 's'} pending`}
      >
        +{overflow} more
      </Chip>
    ) : null;

  return (
    <>
      {visible.map((t) => (
        <Toast
          key={t.id}
          message={t.message}
          type={t.type}
          duration={duration}
          onDismiss={() => onDismiss(t.id)}
        />
      ))}
      {chip ? createPortal(chip, getToastRoot()) : null}
    </>
  );
}
