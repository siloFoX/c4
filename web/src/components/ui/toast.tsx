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
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '../../lib/cn';
import { getPortalRoot } from '../../lib/portal-root';
import { useReducedMotion } from '../../hooks/use-reduced-motion';

// (v1.11.298, TODO 11.280) Toast notification system.
//
// This is a fresh, simpler companion to the existing
// `web/src/components/Toast.tsx` stack (which still drives the
// per-page useToast/showToast flows). The new primitive owns:
//   - A `ToastProvider` context provider mounted near the app
//     root. Any descendant can call `useToast()` to push a
//     toast without owning a per-page queue.
//   - Top-right portal stack (`pointer-events-none` so the row
//     itself is the click target).
//   - Auto-dismiss with a thin progress bar that depletes as
//     the configured duration elapses. `durationMs: Infinity`
//     opts out of auto-dismiss (manual close only).
//   - Optional action button slot (`{ label, onClick }`) for
//     "Undo" / "Retry" / "View" affordances.
//   - Keyboard Escape dismisses the most recently focused toast
//     (or the most recent one if focus is elsewhere) so an
//     operator with screen-reader focus inside a toast can
//     close it without reaching for the mouse.
//   - Three visual variants: `success` / `error` / `info`. The
//     legacy Toast.tsx has a fourth `warning` variant; this one
//     is intentionally narrower to match the dispatch spec.
//
// The provider is NOT pre-mounted on the legacy app shell --
// adopters opt in by wrapping their subtree. That keeps the
// new system out of every existing toast call site until they
// are migrated.

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastEntry {
  id: number;
  kind: ToastKind;
  message: ReactNode;
  action?: ToastAction;
  durationMs?: number;
}

export interface ToastPushOptions {
  kind?: ToastKind;
  message: ReactNode;
  action?: ToastAction;
  durationMs?: number;
}

export interface ToastApi {
  toasts: readonly ToastEntry[];
  pushToast: (opts: ToastPushOptions) => number;
  dismissToast: (id: number) => void;
  clearToasts: () => void;
}

const DEFAULT_DURATION_MS = 5000;
const TOAST_VISIBLE_LIMIT = 5;

const KIND_TONE: Record<ToastKind, string> = {
  success: 'border-success/40 bg-success/15 text-success',
  error: 'border-destructive/40 bg-destructive/15 text-destructive',
  info: 'border-info/40 bg-info/15 text-info',
};

const KIND_ICON_TONE: Record<ToastKind, string> = {
  success: 'text-success',
  error: 'text-destructive',
  info: 'text-info',
};

function KindIcon({ kind, className }: { kind: ToastKind; className?: string }) {
  if (kind === 'success') return <CheckCircle2 className={className} aria-hidden="true" />;
  if (kind === 'error') return <XCircle className={className} aria-hidden="true" />;
  if (kind === 'info') return <Info className={className} aria-hidden="true" />;
  return <AlertTriangle className={className} aria-hidden="true" />;
}

const ToastContext = createContext<ToastApi | null>(null);

export interface ToastProviderProps {
  children: ReactNode;
  // Default duration applied to every pushToast call that does
  // not pass its own `durationMs`. Default 5000ms.
  defaultDurationMs?: number;
  // Maximum number of toasts visible at the same time. Older
  // toasts beyond this cap shift out (FIFO). Default 5.
  visibleLimit?: number;
  // Portal target id. Defaults to `toast-root` (shared with the
  // legacy stack so a future merge can consolidate both into
  // one DOM node). Pass a different id to isolate this provider
  // from other toast layers (e.g., a modal-scoped toast).
  portalId?: string;
}

export function ToastProvider({
  children,
  defaultDurationMs = DEFAULT_DURATION_MS,
  visibleLimit = TOAST_VISIBLE_LIMIT,
  portalId = 'toast-root',
}: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const counter = useRef<number>(0);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearToasts = useCallback(() => setToasts([]), []);

  const pushToast = useCallback(
    (opts: ToastPushOptions): number => {
      const id = Date.now() + counter.current;
      counter.current += 1;
      const entry: ToastEntry = {
        id,
        kind: opts.kind ?? 'info',
        message: opts.message,
        ...(opts.action ? { action: opts.action } : {}),
        ...(opts.durationMs !== undefined
          ? { durationMs: opts.durationMs }
          : {}),
      };
      setToasts((prev) => {
        const next = [...prev, entry];
        if (next.length > visibleLimit) {
          return next.slice(next.length - visibleLimit);
        }
        return next;
      });
      return id;
    },
    [visibleLimit],
  );

  // Esc closes the most recently pushed toast. We listen at
  // window so the operator does not need to focus the toast
  // first. Skips when there are no toasts so other Esc-handling
  // surfaces (dialogs, popovers) still fire.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (toasts.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const last = toasts[toasts.length - 1];
      if (last) dismissToast(last.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toasts, dismissToast]);

  const api = useMemo<ToastApi>(
    () => ({ toasts, pushToast, dismissToast, clearToasts }),
    [toasts, pushToast, dismissToast, clearToasts],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastPortal
        toasts={toasts}
        defaultDurationMs={defaultDurationMs}
        onDismiss={dismissToast}
        portalId={portalId}
      />
    </ToastContext.Provider>
  );
}

ToastProvider.displayName = 'ToastProvider';

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error(
      'useToast must be called inside a <ToastProvider>. Wrap the subtree where toasts are pushed.',
    );
  }
  return ctx;
}

interface ToastPortalProps {
  toasts: readonly ToastEntry[];
  defaultDurationMs: number;
  onDismiss: (id: number) => void;
  portalId: string;
}

function ToastPortal({
  toasts,
  defaultDurationMs,
  onDismiss,
  portalId,
}: ToastPortalProps) {
  if (typeof document === 'undefined') return null;
  const target = getPortalRoot(portalId);
  if (!target) return null;
  if (!target.hasAttribute('data-toast-root')) {
    target.setAttribute('data-toast-root', 'true');
    target.className =
      'pointer-events-none fixed right-4 top-4 z-50 flex flex-col gap-2';
  }
  return createPortal(
    <div data-section="toast-stack" role="region" aria-label="Notifications">
      {toasts.map((t) => (
        <ToastRow
          key={t.id}
          entry={t}
          defaultDurationMs={defaultDurationMs}
          onDismiss={() => onDismiss(t.id)}
        />
      ))}
    </div>,
    target,
  );
}

interface ToastRowProps {
  entry: ToastEntry;
  defaultDurationMs: number;
  onDismiss: () => void;
}

function ToastRow({ entry, defaultDurationMs, onDismiss }: ToastRowProps) {
  const reducedMotion = useReducedMotion();
  const duration = entry.durationMs ?? defaultDurationMs;
  const ariaLive = entry.kind === 'error' ? 'assertive' : 'polite';
  const [remaining, setRemaining] = useState<number>(() =>
    Number.isFinite(duration) ? duration : 0,
  );
  const start = useRef<number>(Date.now());
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!Number.isFinite(duration)) return;
    start.current = Date.now();
    const tick = setInterval(() => {
      const elapsed = Date.now() - start.current;
      const left = Math.max(0, duration - elapsed);
      setRemaining(left);
      if (left <= 0) {
        onDismissRef.current();
        clearInterval(tick);
      }
    }, 100);
    return () => clearInterval(tick);
  }, [duration]);

  const progressPct = Number.isFinite(duration)
    ? Math.max(0, Math.min(100, (remaining / duration) * 100))
    : 0;

  return (
    <div
      role="status"
      aria-live={ariaLive}
      data-section="toast"
      data-toast-kind={entry.kind}
      className={cn(
        'pointer-events-auto w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border shadow-lg',
        KIND_TONE[entry.kind],
        !reducedMotion && 'motion-safe:animate-in motion-safe:slide-in-from-right-4',
      )}
    >
      <div className="flex items-start gap-2 px-3 py-2">
        <KindIcon
          kind={entry.kind}
          className={cn('mt-0.5 h-4 w-4 shrink-0', KIND_ICON_TONE[entry.kind])}
        />
        <div className="min-w-0 flex-1 text-sm text-foreground">
          {entry.message}
        </div>
        {entry.action ? (
          <button
            type="button"
            onClick={() => {
              entry.action!.onClick();
              onDismiss();
            }}
            data-section="toast-action"
            className="shrink-0 rounded border border-border bg-background/40 px-2 py-1 text-xs font-medium text-foreground hover:bg-background/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {entry.action.label}
          </button>
        ) : null}
        <button
          type="button"
          aria-label="Dismiss notification"
          onClick={onDismiss}
          data-section="toast-dismiss"
          className="shrink-0 rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {Number.isFinite(duration) ? (
        <div
          role="progressbar"
          aria-label="Auto-dismiss countdown"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progressPct)}
          data-section="toast-progress"
          className="h-0.5 w-full bg-foreground/10"
        >
          <div
            className={cn(
              'h-full bg-foreground/40 transition-[width] duration-100 ease-linear',
            )}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}
