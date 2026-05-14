import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AnnounceContext } from '../hooks/use-announce';
import type { PointerEvent as ReactPointerEvent, TouchEvent as ReactTouchEvent } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { Card, CardContent } from './ui';
import { cn } from '../lib/cn';
import { motionClass } from '../lib/motion';
import { useReducedMotion } from '../hooks/use-reduced-motion';

export type ToastType = 'success' | 'error' | 'info';

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
};

// Swipe-to-dismiss threshold in px. Drag beyond this on either axis
// (horizontal) commits the dismissal; anything less snaps back to 0.
export const TOAST_SWIPE_THRESHOLD = 80;

// Animation budget. Used for both the exit slide-out and the
// post-dismiss fade so consumers can synchronise unmount timing.
const TOAST_EXIT_MS = 180;

// Lazy-create the portal target so the toast layer survives parent
// route changes: even if a page unmounts, #toast-root stays in
// document.body and is reused by the next toast that mounts.
export function getToastRoot(): HTMLElement {
  let root = document.getElementById('toast-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'toast-root';
    root.setAttribute('data-toast-root', 'true');
    root.className =
      'pointer-events-none fixed right-4 top-4 z-50 flex flex-col gap-2';
    document.body.appendChild(root);
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

  const Icon = type === 'success' ? CheckCircle2 : type === 'error' ? AlertTriangle : Info;

  // Compose the visible transform. Enter: slide in from right.
  // Drag: track pointer horizontally. Leaving: parked at large
  // translateX so the exit slide is visible until unmount.
  const tx = !entered ? '100%' : `${dragX}px`;
  const transition = dragging.current
    ? `opacity ${TOAST_EXIT_MS}ms ease`
    : `transform ${TOAST_EXIT_MS}ms ease, opacity ${TOAST_EXIT_MS}ms ease`;

  const node = (
    <div
      data-testid="toast"
      style={{
        transform: `translateX(${tx})`,
        opacity: leaving ? 0 : 1,
        transition,
        touchAction: 'pan-y',
      }}
      className="pointer-events-auto select-none"
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
