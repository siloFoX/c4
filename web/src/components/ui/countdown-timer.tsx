import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { cn } from '../../lib/cn';

// (v1.11.438, TODO 11.420) CountdownTimer primitive.
//
// Counts down from a positive duration to zero, formats the
// remaining time as `HH:MM:SS` (auto-collapses to `MM:SS` when
// the timer never exceeds an hour), supports pause / resume /
// reset, and fires `onExpire` exactly once when the timer
// reaches zero.
//
// The tick loop computes the remaining time from a wall-clock
// `endsAt` timestamp so the display stays accurate across
// throttled tabs and uneven `setInterval` cadence. When the
// caller pauses, the snapshot is captured and the loop is
// torn down; resume re-derives `endsAt` from "now + snapshot"
// so accumulated drift never leaks into the next run.
//
// Reference: /root/c4/arps-design-system-v1/.

export type CountdownTimerState =
  | 'normal'
  | 'warning'
  | 'critical'
  | 'expired';

export type CountdownTimerFormat = 'auto' | 'hh:mm:ss' | 'mm:ss';

export interface CountdownTimerHandle {
  start: () => void;
  pause: () => void;
  resume: () => void;
  reset: (seconds?: number) => void;
  toggle: () => void;
  getRemainingSeconds: () => number;
  getState: () => CountdownTimerState;
}

export interface CountdownTimerProps {
  durationSeconds: number;
  autoStart?: boolean;
  warningThresholdSeconds?: number;
  criticalThresholdSeconds?: number;
  controls?: boolean;
  showReset?: boolean;
  format?: CountdownTimerFormat;
  onExpire?: () => void;
  onTick?: (remaining: number) => void;
  onPause?: () => void;
  onResume?: () => void;
  onReset?: (seconds: number) => void;
  label?: ReactNode;
  className?: string;
  ariaLabel?: string;
  tickIntervalMs?: number;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export const DEFAULT_WARNING_THRESHOLD = 30;
export const DEFAULT_CRITICAL_THRESHOLD = 10;
export const DEFAULT_COUNTDOWN_FORMAT: CountdownTimerFormat = 'auto';
export const DEFAULT_TICK_INTERVAL_MS = 250;

export function clampCountdownDuration(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

export function formatCountdownTime(
  seconds: number,
  format: CountdownTimerFormat = DEFAULT_COUNTDOWN_FORMAT,
  thresholdHours: number = 1,
): string {
  const total = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  const includeHours =
    format === 'hh:mm:ss' ||
    (format === 'auto' && h >= thresholdHours);
  if (includeHours) {
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }
  // mm:ss (with overflow into minutes if hours collapse)
  const collapsedMinutes = h * 60 + m;
  return `${pad(collapsedMinutes)}:${pad(s)}`;
}

export function getCountdownState(
  remaining: number,
  warning: number = DEFAULT_WARNING_THRESHOLD,
  critical: number = DEFAULT_CRITICAL_THRESHOLD,
): CountdownTimerState {
  if (!Number.isFinite(remaining) || remaining <= 0) return 'expired';
  if (critical >= 0 && remaining <= critical) return 'critical';
  if (warning >= 0 && remaining <= warning) return 'warning';
  return 'normal';
}

export function tickRemaining(remaining: number, deltaMs: number): number {
  const next = remaining - deltaMs / 1000;
  if (!Number.isFinite(next) || next <= 0) return 0;
  return next;
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

const STATE_TEXT_CLASS: Record<CountdownTimerState, string> = {
  normal: 'text-foreground',
  warning: 'text-warning',
  critical: 'text-destructive',
  expired: 'text-destructive',
};

export const CountdownTimer = forwardRef<
  CountdownTimerHandle,
  CountdownTimerProps
>(function CountdownTimer(
  {
    durationSeconds,
    autoStart = true,
    warningThresholdSeconds = DEFAULT_WARNING_THRESHOLD,
    criticalThresholdSeconds = DEFAULT_CRITICAL_THRESHOLD,
    controls = true,
    showReset = false,
    format = DEFAULT_COUNTDOWN_FORMAT,
    onExpire,
    onTick,
    onPause,
    onResume,
    onReset,
    label,
    className,
    ariaLabel = 'Countdown timer',
    tickIntervalMs = DEFAULT_TICK_INTERVAL_MS,
  },
  forwardedRef,
) {
  const clampedDuration = clampCountdownDuration(durationSeconds);
  const [remaining, setRemaining] = useState<number>(clampedDuration);
  const [isRunning, setIsRunning] = useState<boolean>(autoStart);
  const endsAtRef = useRef<number | null>(null);
  const expiredFiredRef = useRef<boolean>(false);

  const onTickRef = useRef(onTick);
  const onExpireRef = useRef(onExpire);
  const onPauseRef = useRef(onPause);
  const onResumeRef = useRef(onResume);
  const onResetRef = useRef(onReset);
  useEffect(() => {
    onTickRef.current = onTick;
  }, [onTick]);
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);
  useEffect(() => {
    onPauseRef.current = onPause;
  }, [onPause]);
  useEffect(() => {
    onResumeRef.current = onResume;
  }, [onResume]);
  useEffect(() => {
    onResetRef.current = onReset;
  }, [onReset]);

  // When the user changes `durationSeconds` from the outside,
  // reset the timer to that value and restart it according to
  // the `autoStart` contract.
  useEffect(() => {
    setRemaining(clampedDuration);
    expiredFiredRef.current = false;
    if (autoStart) {
      endsAtRef.current = Date.now() + clampedDuration * 1000;
      setIsRunning(true);
    } else {
      endsAtRef.current = null;
      setIsRunning(false);
    }
    // We intentionally depend only on the numeric duration so
    // upstream callers can pass new clocks on demand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clampedDuration]);

  // Drive the tick loop.
  useEffect(() => {
    if (!isRunning) return undefined;
    if (endsAtRef.current == null) {
      endsAtRef.current = Date.now() + remaining * 1000;
    }
    const id = window.setInterval(() => {
      const endsAt = endsAtRef.current;
      if (endsAt == null) return;
      const now = Date.now();
      const rem = Math.max(0, (endsAt - now) / 1000);
      setRemaining(rem);
      onTickRef.current?.(rem);
      if (rem <= 0 && !expiredFiredRef.current) {
        expiredFiredRef.current = true;
        onExpireRef.current?.();
        setIsRunning(false);
        endsAtRef.current = null;
      }
    }, tickIntervalMs);
    return () => {
      window.clearInterval(id);
    };
  }, [isRunning, tickIntervalMs, remaining]);

  const start = useCallback(() => {
    if (remaining <= 0) return;
    endsAtRef.current = Date.now() + remaining * 1000;
    expiredFiredRef.current = false;
    setIsRunning(true);
    onResumeRef.current?.();
  }, [remaining]);

  const pause = useCallback(() => {
    if (!isRunning) return;
    const endsAt = endsAtRef.current;
    if (endsAt != null) {
      const rem = Math.max(0, (endsAt - Date.now()) / 1000);
      setRemaining(rem);
    }
    endsAtRef.current = null;
    setIsRunning(false);
    onPauseRef.current?.();
  }, [isRunning]);

  const resume = useCallback(() => {
    if (isRunning) return;
    if (remaining <= 0) return;
    endsAtRef.current = Date.now() + remaining * 1000;
    setIsRunning(true);
    onResumeRef.current?.();
  }, [isRunning, remaining]);

  const reset = useCallback(
    (seconds?: number) => {
      const target = clampCountdownDuration(
        seconds ?? clampedDuration,
      );
      setRemaining(target);
      expiredFiredRef.current = false;
      if (isRunning) {
        endsAtRef.current = Date.now() + target * 1000;
      } else {
        endsAtRef.current = null;
      }
      onResetRef.current?.(target);
    },
    [clampedDuration, isRunning],
  );

  const toggle = useCallback(() => {
    if (isRunning) pause();
    else resume();
  }, [isRunning, pause, resume]);

  const state = getCountdownState(
    remaining,
    warningThresholdSeconds,
    criticalThresholdSeconds,
  );

  useImperativeHandle(
    forwardedRef,
    () => ({
      start,
      pause,
      resume,
      reset,
      toggle,
      getRemainingSeconds: () => remaining,
      getState: () => state,
    }),
    [pause, remaining, reset, resume, start, state, toggle],
  );

  const formatted = formatCountdownTime(remaining, format);

  return (
    <div
      role="region"
      aria-label={ariaLabel}
      data-section="countdown-timer"
      data-state={state}
      data-running={isRunning ? 'true' : 'false'}
      data-format={format}
      data-remaining={Math.ceil(remaining)}
      className={cn(
        'inline-flex items-center gap-3 rounded-md border border-border bg-card px-4 py-2',
        className,
      )}
    >
      {label !== undefined ? (
        <span
          data-section="countdown-timer-label"
          className="text-sm font-medium text-muted-foreground"
        >
          {label}
        </span>
      ) : null}
      <span
        role="timer"
        aria-live={state === 'critical' ? 'assertive' : 'polite'}
        aria-atomic="true"
        data-section="countdown-timer-display"
        className={cn(
          'font-mono text-xl tabular-nums',
          STATE_TEXT_CLASS[state],
        )}
      >
        {formatted}
      </span>
      {controls ? (
        <div
          data-section="countdown-timer-controls"
          className="flex items-center gap-1"
        >
          <button
            type="button"
            data-section="countdown-timer-toggle"
            aria-label={isRunning ? 'Pause countdown' : 'Resume countdown'}
            onClick={toggle}
            disabled={remaining <= 0}
            className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40"
          >
            {isRunning ? (
              <Pause aria-hidden="true" className="h-4 w-4" />
            ) : (
              <Play aria-hidden="true" className="h-4 w-4" />
            )}
          </button>
          {showReset ? (
            <button
              type="button"
              data-section="countdown-timer-reset"
              aria-label="Reset countdown"
              onClick={() => reset()}
              className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <RotateCcw aria-hidden="true" className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});

CountdownTimer.displayName = 'CountdownTimer';
