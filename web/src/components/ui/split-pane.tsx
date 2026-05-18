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
  // (v1.11.409, TODO 11.391) Collapse the start pane on
  // divider double-click. When the start pane is already
  // collapsed (ratio=0), the next dblclick restores the
  // previous ratio (or `defaultRatio` if no prior position).
  // Default false keeps legacy byte-identical behaviour.
  collapseOnDoubleClick?: boolean;
  // (v1.11.409, TODO 11.391) Pixel-based initial size.
  // When set, replaces `defaultRatio` -- the component
  // measures the container on mount and converts the pixel
  // value into the equivalent ratio. Reads back from
  // localStorage are still ratio-encoded so cross-mode
  // adopters stay compatible.
  defaultSizePx?: number;
  // (v1.11.409, TODO 11.391) Optional callback fired with
  // the current size in pixels alongside `onRatioChange`.
  // Useful when the caller stores a pixel value rather
  // than a ratio.
  onSizeChange?: (pixels: number) => void;
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
      collapseOnDoubleClick = false,
      defaultSizePx,
      onSizeChange,
    },
    ref,
  ) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [ratio, setRatio] = useState<number>(() =>
      clamp(readStored(storageKey, defaultRatio), 0, 1),
    );
    const [dragging, setDragging] = useState<boolean>(false);
    // (v1.11.409, TODO 11.391) Remember the last non-zero
    // ratio so collapse-on-double-click can restore the
    // operator's preferred size when toggled back open.
    const lastOpenRatioRef = useRef<number>(
      ratio > 0 ? ratio : defaultRatio,
    );
    useEffect(() => {
      if (ratio > 0) lastOpenRatioRef.current = ratio;
    }, [ratio]);

    // (v1.11.409, TODO 11.391) On mount, when `defaultSizePx`
    // is provided AND the stored ratio is unavailable, convert
    // the pixel value to a ratio using the measured container
    // size. Runs once -- once the operator drags or keyboard-
    // adjusts, the ratio is the source of truth.
    useEffect(() => {
      if (defaultSizePx === undefined) return;
      // Skip when a stored ratio is already in effect (the
      // useState initializer above picks it up).
      if (storageKey) {
        const stored = readStored(storageKey, NaN);
        if (Number.isFinite(stored)) return;
      }
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const size = orientation === 'horizontal' ? rect.width : rect.height;
      if (size <= 0) return;
      const r = clamp(defaultSizePx / size, 0, 1);
      setRatio(r);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
        // (v1.11.409, TODO 11.391) Pixel-aware callback fires
        // alongside ratio. Skipped when the container has not
        // measured yet (initial mount race).
        if (onSizeChange) {
          const container = containerRef.current;
          if (container) {
            const rect = container.getBoundingClientRect();
            const size = orientation === 'horizontal' ? rect.width : rect.height;
            if (size > 0) onSizeChange(Math.round(clamped * size));
          }
        }
      },
      [
        collapseThreshold,
        expandThreshold,
        maxRatio,
        minRatio,
        onRatioChange,
        storageKey,
        onSizeChange,
        orientation,
      ],
    );

    // (v1.11.409, TODO 11.391) Toggle collapse on double-click
    // of the divider. When already collapsed (ratio=0), restore
    // the last open ratio (or defaultRatio as the fallback).
    const onDoubleClick = useCallback(() => {
      if (!collapseOnDoubleClick) return;
      if (ratio === 0) {
        applyRatio(lastOpenRatioRef.current || defaultRatio, {
          skipSnap: true,
        });
      } else {
        applyRatio(0, { skipSnap: true });
      }
    }, [applyRatio, collapseOnDoubleClick, defaultRatio, ratio]);

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
          data-collapse-on-double-click={
            collapseOnDoubleClick ? 'true' : 'false'
          }
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onKeyDown={onKeyDown}
          onDoubleClick={onDoubleClick}
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
