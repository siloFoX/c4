import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react';
import { cn } from '../../lib/cn';

// (v1.11.292, TODO 11.274) SplitPane -- resizable two-pane
// container with a draggable divider, persisted ratio,
// optional collapse / expand snap zones, and full WAI-ARIA
// `role="separator"` keyboard contract.
//
// Two orientations:
//   - 'horizontal' (default): start + end render side-by-side
//     with a vertical divider between them. Drag left/right.
//   - 'vertical': start + end stack with a horizontal divider.
//     Drag up/down.
//
// Persistence: when `storageKey` is set, the ratio
// localStorage-persists across reloads. Cross-tab `storage`
// event re-syncs siblings on the same machine. Missing /
// invalid stored values fall back to `defaultRatio` (0.5).
//
// Snap zones (optional): if the divider crosses below
// `collapseThreshold` while dragging, the ratio snaps to 0
// (start pane collapses). If it crosses `expandThreshold`,
// the ratio snaps to 1 (end pane collapses). Both default
// to undefined (no snapping).
//
// Keyboard contract on the divider:
//   - ArrowLeft / ArrowUp: shrink the start pane by `step`
//     (default 0.05).
//   - ArrowRight / ArrowDown: grow the start pane by step.
//   - Home: jump to `minRatio`.
//   - End: jump to `maxRatio`.
//   - Enter / Space: toggle between current position and the
//     collapsed (0) / expanded (1) snap if `collapseThreshold`
//     / `expandThreshold` are configured.

export type SplitOrientation = 'horizontal' | 'vertical';

export interface SplitPaneProps {
  orientation?: SplitOrientation;
  start: ReactNode;
  end: ReactNode;
  // Persistence. When set, ratio writes to
  // `localStorage.<storageKey>`. Cross-tab `storage` event
  // re-syncs siblings.
  storageKey?: string;
  defaultRatio?: number;
  minRatio?: number;
  maxRatio?: number;
  // Snap zones. When the dragged ratio crosses below
  // `collapseThreshold`, the ratio snaps to 0. Same for
  // `expandThreshold` -> 1. Both optional.
  collapseThreshold?: number;
  expandThreshold?: number;
  // Step size for keyboard nudge (ArrowLeft / ArrowRight).
  // Default 0.05 (5%).
  step?: number;
  // ARIA label for the divider. Default depends on the
  // orientation ("Resize panels left/right" / "up/down").
  dividerAriaLabel?: string;
  // Optional callback fired on every committed ratio change
  // (debouncing is the caller's responsibility).
  onRatioChange?: (ratio: number) => void;
  className?: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function readStored(key: string | undefined, fallback: number): number {
  if (!key || typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return fallback;
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return fallback;
    return parsed;
  } catch {
    return fallback;
  }
}

function writeStored(key: string | undefined, value: number): void {
  if (!key || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    /* quota / private mode -- silently drop */
  }
}

export const SplitPane = forwardRef<HTMLDivElement, SplitPaneProps>(
  (
    {
      orientation = 'horizontal',
      start,
      end,
      storageKey,
      defaultRatio = 0.5,
      minRatio = 0.1,
      maxRatio = 0.9,
      collapseThreshold,
      expandThreshold,
      step = 0.05,
      dividerAriaLabel,
      onRatioChange,
      className,
    },
    ref,
  ) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [ratio, setRatio] = useState<number>(() =>
      clamp(readStored(storageKey, defaultRatio), 0, 1),
    );
    const [dragging, setDragging] = useState<boolean>(false);

    // Cross-tab sync via the storage event. Same-tab updates
    // do not fire the storage event so siblings in this tab
    // need their own listener if they want to see writes from
    // other instances. For now we only listen cross-tab.
    useEffect(() => {
      if (!storageKey) return undefined;
      const onStorage = (e: StorageEvent) => {
        if (e.key !== storageKey) return;
        const next = readStored(storageKey, defaultRatio);
        setRatio(clamp(next, 0, 1));
      };
      window.addEventListener('storage', onStorage);
      return () => window.removeEventListener('storage', onStorage);
    }, [storageKey, defaultRatio]);

    const applyRatio = useCallback(
      (next: number, opts?: { skipSnap?: boolean }) => {
        let clamped = clamp(next, 0, 1);
        if (!opts?.skipSnap) {
          if (
            typeof collapseThreshold === 'number' &&
            clamped < collapseThreshold
          ) {
            clamped = 0;
          } else if (
            typeof expandThreshold === 'number' &&
            clamped > expandThreshold
          ) {
            clamped = 1;
          } else {
            // Outside the snap zones: respect the min/max
            // clamp so the operator can't pin the divider at
            // an unusable edge.
            clamped = clamp(clamped, minRatio, maxRatio);
          }
        }
        setRatio(clamped);
        writeStored(storageKey, clamped);
        onRatioChange?.(clamped);
      },
      [
        collapseThreshold,
        expandThreshold,
        maxRatio,
        minRatio,
        onRatioChange,
        storageKey,
      ],
    );

    const onPointerDown = useCallback(
      (e: PointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        const target = e.currentTarget;
        try {
          target.setPointerCapture(e.pointerId);
        } catch {
          /* ignore -- some test envs don't implement capture */
        }
        setDragging(true);
      },
      [],
    );

    const onPointerMove = useCallback(
      (e: PointerEvent<HTMLDivElement>) => {
        if (!dragging) return;
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        let nextRatio: number;
        if (orientation === 'horizontal') {
          if (rect.width <= 0) return;
          nextRatio = (e.clientX - rect.left) / rect.width;
        } else {
          if (rect.height <= 0) return;
          nextRatio = (e.clientY - rect.top) / rect.height;
        }
        applyRatio(nextRatio);
      },
      [applyRatio, dragging, orientation],
    );

    const onPointerUp = useCallback(
      (e: PointerEvent<HTMLDivElement>) => {
        if (!dragging) return;
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        setDragging(false);
      },
      [dragging],
    );

    const onKeyDown = useCallback(
      (e: KeyboardEvent<HTMLDivElement>) => {
        const decreaseKeys =
          orientation === 'horizontal'
            ? ['ArrowLeft']
            : ['ArrowUp'];
        const increaseKeys =
          orientation === 'horizontal'
            ? ['ArrowRight']
            : ['ArrowDown'];
        if (decreaseKeys.includes(e.key)) {
          e.preventDefault();
          applyRatio(ratio - step);
        } else if (increaseKeys.includes(e.key)) {
          e.preventDefault();
          applyRatio(ratio + step);
        } else if (e.key === 'Home') {
          e.preventDefault();
          applyRatio(minRatio);
        } else if (e.key === 'End') {
          e.preventDefault();
          applyRatio(maxRatio);
        } else if (e.key === 'Enter' || e.key === ' ') {
          // Toggle collapse / expand if snap thresholds are set.
          if (
            typeof collapseThreshold === 'number' &&
            ratio > 0 &&
            ratio < (expandThreshold ?? maxRatio)
          ) {
            e.preventDefault();
            // Collapse if ratio is below the midpoint of the
            // viable range; otherwise reset to default.
            if (ratio < 0.5) {
              applyRatio(0, { skipSnap: true });
            } else {
              applyRatio(defaultRatio);
            }
          }
        }
      },
      [
        applyRatio,
        collapseThreshold,
        defaultRatio,
        expandThreshold,
        maxRatio,
        minRatio,
        orientation,
        ratio,
        step,
      ],
    );

    const isHoriz = orientation === 'horizontal';
    const startBasis = `${(ratio * 100).toFixed(3)}%`;
    const valueNow = Math.round(ratio * 100);

    return (
      <div
        ref={(node) => {
          containerRef.current = node;
          if (typeof ref === 'function') ref(node);
          else if (ref) {
            (ref as React.MutableRefObject<HTMLDivElement | null>).current =
              node;
          }
        }}
        data-section="split-pane"
        data-orientation={orientation}
        data-dragging={dragging ? 'true' : 'false'}
        className={cn(
          'flex w-full',
          isHoriz ? 'flex-row' : 'flex-col',
          'h-full min-h-0 min-w-0',
          className,
        )}
      >
        <div
          data-section="split-pane-start"
          data-collapsed={ratio === 0 ? 'true' : 'false'}
          style={
            isHoriz
              ? { flexBasis: startBasis, minWidth: 0 }
              : { flexBasis: startBasis, minHeight: 0 }
          }
          className="flex min-h-0 min-w-0 flex-shrink-0 flex-grow-0 overflow-hidden"
        >
          {start}
        </div>
        <div
          role="separator"
          tabIndex={0}
          aria-orientation={isHoriz ? 'vertical' : 'horizontal'}
          aria-valuenow={valueNow}
          aria-valuemin={Math.round(minRatio * 100)}
          aria-valuemax={Math.round(maxRatio * 100)}
          aria-label={
            dividerAriaLabel ??
            (isHoriz ? 'Resize panels left/right' : 'Resize panels up/down')
          }
          data-section="split-pane-divider"
          data-dragging={dragging ? 'true' : 'false'}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onKeyDown={onKeyDown}
          className={cn(
            'shrink-0 select-none bg-border transition-colors hover:bg-primary/40 focus-visible:bg-primary/60 focus-visible:outline-none',
            isHoriz
              ? 'w-1 cursor-col-resize'
              : 'h-1 cursor-row-resize',
            dragging && 'bg-primary/60',
          )}
        />
        <div
          data-section="split-pane-end"
          data-collapsed={ratio === 1 ? 'true' : 'false'}
          className="flex min-h-0 min-w-0 flex-1 overflow-hidden"
        >
          {end}
        </div>
      </div>
    );
  },
);
SplitPane.displayName = 'SplitPane';
