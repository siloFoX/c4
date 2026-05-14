import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cn } from '../lib/cn';

// (v1.11.175 / patch 11.157) Lightweight route-change crossfade.
// Tailwind utilities only -- no framer-motion / no new dependency.
// During a transition, both the outgoing and incoming layers are
// mounted: outgoing uses absolute inset-0 so layout doesn't jitter,
// incoming drives intrinsic height. A two-phase commit (prepare ->
// animate via rAF) is used so the browser registers the initial
// CSS state before transitioning to the final state. After
// `duration` ms the outgoing layer is dropped.
// prefers-reduced-motion users skip the animation entirely and the
// new tree replaces the old one synchronously.

export interface PageTransitionProps {
  routeKey: string;
  children: ReactNode;
  direction?: 'horizontal' | 'vertical';
  duration?: number;
  className?: string;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

type Phase = 'idle' | 'prepare' | 'animate';

const PageTransition = forwardRef<HTMLDivElement, PageTransitionProps>(
  function PageTransition(
    { routeKey, children, direction = 'horizontal', duration = 200, className },
    ref,
  ) {
    const [currentKey, setCurrentKey] = useState(routeKey);
    const [currentChildren, setCurrentChildren] = useState<ReactNode>(children);
    const [prevKey, setPrevKey] = useState<string | null>(null);
    const [prevChildren, setPrevChildren] = useState<ReactNode>(null);
    const [phase, setPhase] = useState<Phase>('idle');
    const swapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const rafId = useRef<number | null>(null);

    useEffect(() => {
      if (routeKey === currentKey) return;
      if (prefersReducedMotion()) {
        setCurrentKey(routeKey);
        setCurrentChildren(children);
        setPrevKey(null);
        setPrevChildren(null);
        setPhase('idle');
        return;
      }
      setPrevKey(currentKey);
      setPrevChildren(currentChildren);
      setCurrentKey(routeKey);
      setCurrentChildren(children);
      setPhase('prepare');
      if (rafId.current != null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(rafId.current);
      }
      const raf =
        typeof requestAnimationFrame === 'function'
          ? requestAnimationFrame
          : (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16);
      rafId.current = raf(() => {
        setPhase('animate');
        rafId.current = null;
      }) as unknown as number;
      if (swapTimer.current) clearTimeout(swapTimer.current);
      swapTimer.current = setTimeout(() => {
        setPrevKey(null);
        setPrevChildren(null);
        setPhase('idle');
        swapTimer.current = null;
      }, duration);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [routeKey]);

    useEffect(() => {
      if (routeKey === currentKey && phase === 'idle') {
        setCurrentChildren(children);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [children]);

    useEffect(() => {
      return () => {
        if (swapTimer.current) clearTimeout(swapTimer.current);
        if (
          rafId.current != null &&
          typeof cancelAnimationFrame === 'function'
        ) {
          cancelAnimationFrame(rafId.current);
        }
      };
    }, []);

    const transitioning = phase !== 'idle' && prevChildren !== null;
    const horizontal = direction === 'horizontal';
    const translateOutFinal = horizontal ? '-translate-x-2' : '-translate-y-2';
    const translateInStart = horizontal ? 'translate-x-2' : 'translate-y-2';
    const translateZero = horizontal ? 'translate-x-0' : 'translate-y-0';
    const durationClass =
      duration <= 150
        ? 'duration-150'
        : duration <= 200
          ? 'duration-200'
          : duration <= 300
            ? 'duration-300'
            : 'duration-500';

    const outgoingClass =
      phase === 'animate'
        ? cn('opacity-0', translateOutFinal)
        : 'opacity-100';
    const incomingClass =
      phase === 'prepare'
        ? cn('opacity-0', translateInStart)
        : cn('opacity-100', translateZero);

    return (
      <div
        ref={ref}
        aria-live="polite"
        className={cn('relative', className)}
        data-route-key={currentKey}
        data-transitioning={transitioning ? 'true' : 'false'}
        data-direction={direction}
      >
        {transitioning ? (
          <div
            key={`prev-${prevKey}`}
            aria-hidden="true"
            data-page-transition-layer="outgoing"
            className={cn(
              'absolute inset-0 transition-opacity transition-transform',
              durationClass,
              outgoingClass,
            )}
          >
            {prevChildren}
          </div>
        ) : null}
        <div
          key={`curr-${currentKey}`}
          data-page-transition-layer="incoming"
          className={cn(
            'transition-opacity transition-transform',
            durationClass,
            incomingClass,
          )}
        >
          {currentChildren}
        </div>
      </div>
    );
  },
);

export default PageTransition;
export { PageTransition };
