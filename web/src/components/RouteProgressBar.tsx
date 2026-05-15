import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { cn } from '../lib/cn';
import { useReducedMotion } from '../hooks/use-reduced-motion';
import { useFeatureFlag } from '../lib/feature-flags';

export interface RouteProgressHandle {
  start: () => void;
  done: () => void;
}

export type RouteProgressColor = 'primary' | 'success' | 'info' | 'danger';

export interface RouteProgressBarProps {
  routeKey?: string;
  color?: RouteProgressColor;
  className?: string;
}

const COLOR_CLASS: Record<RouteProgressColor, string> = {
  primary: 'bg-primary',
  success: 'bg-success',
  info: 'bg-info',
  danger: 'bg-destructive',
};

const TRICKLE_START = 0.3;
const TRICKLE_CEILING = 0.9;
const TRICKLE_STEP_MS = 200;
const FADE_MS = 250;
const REDUCED_MOTION_HOLD_MS = 120;

export const RouteProgressBar = forwardRef<RouteProgressHandle, RouteProgressBarProps>(
  function RouteProgressBar({ routeKey, color = 'primary', className }, ref) {
    const [enabled] = useFeatureFlag('routeProgress');
    const reducedMotion = useReducedMotion();
    const [progress, setProgress] = useState(0);
    const [visible, setVisible] = useState(false);

    const trickleRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const fadeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const reducedRef = useRef(reducedMotion);
    reducedRef.current = reducedMotion;

    const clearTrickle = useCallback(() => {
      if (trickleRef.current !== null) {
        clearInterval(trickleRef.current);
        trickleRef.current = null;
      }
    }, []);

    const clearFade = useCallback(() => {
      if (fadeRef.current !== null) {
        clearTimeout(fadeRef.current);
        fadeRef.current = null;
      }
    }, []);

    const start = useCallback(() => {
      clearTrickle();
      clearFade();
      setVisible(true);
      if (reducedRef.current) {
        setProgress(1);
        return;
      }
      setProgress(TRICKLE_START);
      trickleRef.current = setInterval(() => {
        setProgress((prev) => {
          if (prev >= TRICKLE_CEILING) return prev;
          const remaining = TRICKLE_CEILING - prev;
          return Math.min(TRICKLE_CEILING, prev + Math.max(0.005, remaining * 0.1));
        });
      }, TRICKLE_STEP_MS);
    }, [clearTrickle, clearFade]);

    const done = useCallback(() => {
      clearTrickle();
      setProgress(1);
      clearFade();
      const hold = reducedRef.current ? REDUCED_MOTION_HOLD_MS : FADE_MS;
      fadeRef.current = setTimeout(() => {
        setVisible(false);
        const reset = setTimeout(() => setProgress(0), FADE_MS);
        fadeRef.current = reset;
      }, hold);
    }, [clearTrickle, clearFade]);

    useImperativeHandle(ref, () => ({ start, done }), [start, done]);

    const firstKeyRef = useRef(true);
    useEffect(() => {
      if (routeKey === undefined) return;
      if (firstKeyRef.current) {
        firstKeyRef.current = false;
        return;
      }
      start();
      const settle = window.setTimeout(() => {
        const finish = () => done();
        if (typeof window.requestIdleCallback === 'function') {
          window.requestIdleCallback(finish, { timeout: 500 });
        } else {
          window.setTimeout(finish, 80);
        }
      }, reducedRef.current ? REDUCED_MOTION_HOLD_MS : 240);
      return () => clearTimeout(settle);
    }, [routeKey, start, done]);

    useEffect(() => {
      return () => {
        clearTrickle();
        clearFade();
      };
    }, [clearTrickle, clearFade]);

    if (!enabled) return null;

    return (
      <div
        aria-hidden="true"
        data-testid="route-progress-bar"
        data-visible={visible ? 'true' : 'false'}
        className={cn(
          'pointer-events-none fixed left-0 right-0 top-0 z-50 h-0.5 origin-left',
          'transition-opacity duration-200 ease-out',
          visible ? 'opacity-100' : 'opacity-0',
          className,
        )}
      >
        <div
          data-testid="route-progress-bar-fill"
          className={cn(
            'h-full w-full origin-left transition-transform duration-200 ease-out',
            COLOR_CLASS[color],
          )}
          style={{ transform: `scaleX(${progress})` }}
        />
      </div>
    );
  },
);

export default RouteProgressBar;
