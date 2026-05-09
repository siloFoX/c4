import { useCallback, useState } from 'react';
import type { ToastType } from '../components/Toast';

// (v1.10.694) Generic single-toast slot. Pages mount one
// fixed-position Toast and feed it via showToast(...).
// id is Date.now() so React's key prop forces a fresh
// mount per toast (the Toast component handles its own
// auto-dismiss timer). dismiss flips the slot to null
// so the next toast doesn't carry over the previous
// content while the old one is animating out.

export interface ToastState {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastApi {
  toast: ToastState | null;
  showToast: (message: string, type: ToastType) => void;
  dismissToast: () => void;
}

export function useToast(): ToastApi {
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((message: string, type: ToastType) => {
    setToast({ id: Date.now(), message, type });
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  return { toast, showToast, dismissToast };
}
