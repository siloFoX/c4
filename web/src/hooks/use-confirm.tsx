import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { Dialog } from '../components/ui/dialog';
import { Button } from '../components/ui/button';

export type ConfirmTone = 'default' | 'destructive';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
}

export interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

interface PendingConfirm {
  id: number;
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
}

// Last-wins concurrency: if `confirm()` is called while another is
// pending, the prior promise resolves `false` and the new request
// becomes the active dialog. We picked last-wins over queue because
// the typical UI surface (a single destructive action button) cannot
// realistically produce a meaningful queue; whichever request the
// operator triggered most recently is the one they want to answer.
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const pendingRef = useRef<PendingConfirm | null>(null);
  const idRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      const p = pendingRef.current;
      if (p) {
        pendingRef.current = null;
        p.resolve(false);
      }
    };
  }, []);

  const settle = useCallback((id: number, value: boolean) => {
    const current = pendingRef.current;
    if (!current || current.id !== id) return;
    pendingRef.current = null;
    current.resolve(value);
    if (mountedRef.current) setPending(null);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      const prev = pendingRef.current;
      if (prev) {
        pendingRef.current = null;
        prev.resolve(false);
      }
      idRef.current += 1;
      const next: PendingConfirm = {
        id: idRef.current,
        options,
        resolve,
      };
      pendingRef.current = next;
      if (mountedRef.current) setPending(next);
    });
  }, []);

  const value = useMemo<ConfirmContextValue>(() => ({ confirm }), [confirm]);

  const tone = pending?.options.tone ?? 'default';
  const confirmLabel = pending?.options.confirmLabel ?? 'Confirm';
  const cancelLabel = pending?.options.cancelLabel ?? 'Cancel';

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Dialog
        open={pending !== null}
        onClose={() => {
          if (pending) settle(pending.id, false);
        }}
        title={pending?.options.title}
        footer={
          pending ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => settle(pending.id, false)}
                data-testid="confirm-cancel"
              >
                {cancelLabel}
              </Button>
              <Button
                type="button"
                variant={tone === 'destructive' ? 'destructive' : 'default'}
                size="sm"
                onClick={() => settle(pending.id, true)}
                data-testid="confirm-ok"
                autoFocus
              >
                {confirmLabel}
              </Button>
            </>
          ) : null
        }
      >
        {pending?.options.message ? (
          <p className="text-sm text-muted-foreground">
            {pending.options.message}
          </p>
        ) : null}
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): (options: ConfirmOptions) => Promise<boolean> {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error(
      'useConfirm() must be used inside a <ConfirmProvider>.',
    );
  }
  return ctx.confirm;
}
