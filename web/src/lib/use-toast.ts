import { useCallback, useMemo, useRef, useState } from 'react';
import type { ToastType } from '../components/Toast';

// (v1.11.137) Queue-backed toast store. Internally an array so
// multiple showToast calls fan out as stacked toasts in the
// Toast portal. The public surface still exposes the legacy
// {toast, showToast, dismissToast} triple so existing pages
// keep working unchanged -- `toast` resolves to the most
// recent record in the queue, and dismissToast() with no id
// clears the whole queue, matching the prior single-slot
// semantics. New consumers can iterate `toasts` instead and
// dismiss individual entries by id.

export interface ToastState {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastApi {
  toast: ToastState | null;
  toasts: ToastState[];
  showToast: (message: string, type: ToastType) => number;
  dismissToast: (id?: number) => void;
}

// Cap the visible queue so a runaway showToast loop cannot
// flood the portal with hundreds of stacked rows. Older entries
// shift out first.
export const TOAST_QUEUE_LIMIT = 5;

export function useToast(): ToastApi {
  const [toasts, setToasts] = useState<ToastState[]>([]);
  // Per-hook counter that breaks ties when two showToast calls
  // land in the same millisecond. Date.now() still anchors the
  // id so legacy chronological-ordering checks keep working.
  const tiebreak = useRef(0);

  const showToast = useCallback(
    (message: string, type: ToastType): number => {
      const id = Date.now() + tiebreak.current;
      tiebreak.current += 1;
      setToasts((prev) => {
        const next = [...prev, { id, message, type }];
        if (next.length > TOAST_QUEUE_LIMIT) {
          return next.slice(next.length - TOAST_QUEUE_LIMIT);
        }
        return next;
      });
      return id;
    },
    [],
  );

  const dismissToast = useCallback((id?: number) => {
    if (id === undefined) {
      setToasts([]);
      return;
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useMemo<ToastState | null>(
    () => (toasts.length === 0 ? null : toasts[toasts.length - 1] ?? null),
    [toasts],
  );

  return { toast, toasts, showToast, dismissToast };
}
