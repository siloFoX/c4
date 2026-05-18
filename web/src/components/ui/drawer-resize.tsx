import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type {
  CSSProperties,
  HTMLAttributes,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from 'react';
import { cn } from '../../lib/cn';

// (v1.11.408, TODO 11.390) DrawerResize -- side panel that
// the operator can resize by dragging the inner edge.
//
// Design constraints:
//   - Pointer drag adjusts width continuously; release
//     commits + persists.
//   - Width clamps to [minWidth, maxWidth].
//   - Controlled (`width` + `onWidthChange`) or uncontrolled
//     (`defaultWidth`) modes.
//   - LocalStorage persistence is opt-in via `storageKey`.
//     Initial mount reads from storage when present;
//     pointerup writes back.
//   - The handle is a separator: WAI-ARIA `role="separator"`
//     + `aria-valuemin/now/max` + `aria-orientation="vertical"`.
//   - Keyboard nudge: ArrowLeft/Right adjusts by `keyboardStep`
//     (default 16px); PageUp/Down by 10x; Home/End jumps to
//     min/max.
//   - `side: 'left' | 'right'` controls which edge gets the
//     drag handle. For `right`, dragging left INCREASES
//     width; for `left`, dragging right increases width.
//     The component does NOT position the panel itself --
//     callers control layout (fixed sidebar, flex column,
//     etc). The primitive owns the width style + handle
//     rendering only.

export type DrawerResizeSide = 'left' | 'right';

export interface DrawerResizeProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  children: ReactNode;
  side?: DrawerResizeSide;
  /** Controlled width (px). */
  width?: number;
  /** Uncontrolled initial width (px). Default 280. */
  defaultWidth?: number;
  /** Fires on every commit (pointerup, keyboard nudge). */
  onWidthChange?: (next: number) => void;
  /** Minimum width in px. Default 200. */
  minWidth?: number;
  /** Maximum width in px. Default 600. */
  maxWidth?: number;
  /**
   * localStorage key for persistence. When set, the initial
   * mount reads from storage (falling back to
   * `defaultWidth`); every commit writes back. Pass
   * `undefined` (default) to disable persistence.
   */
  storageKey?: string;
  /** Keyboard step in px. Default 16. */
  keyboardStep?: number;
  /** Page step (Page Up/Down) in px. Default 80. */
  pageStep?: number;
  /** Accessible label for the drag handle. */
  handleAriaLabel?: string;
  className?: string;
  /** Optional class on the handle (e.g., hide on small screens). */
  handleClassName?: string;
}

// (v1.11.408, TODO 11.390) Pure clamp helper exported for
// tests + adopters that want to use the same min/max logic
// without remounting the component.
export function clampDrawerWidth(
  value: number,
  min: number,
  max: number,
): number {
  if (!Number.isFinite(value)) return min;
  if (min > max) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

const STORAGE_PREFIX = 'c4:drawer-resize:';

function readStoredWidth(key: string): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + key);
    if (raw === null) return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return n;
  } catch {
    return null;
  }
}

function writeStoredWidth(key: string, value: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_PREFIX + key, String(value));
  } catch {
    /* ignore -- private mode / quota etc */
  }
}

export const DrawerResize = forwardRef<HTMLDivElement, DrawerResizeProps>(
  function DrawerResize(
    {
      children,
      side = 'right',
      width: widthProp,
      defaultWidth = 280,
      onWidthChange,
      minWidth = 200,
      maxWidth = 600,
      storageKey,
      keyboardStep = 16,
      pageStep = 80,
      handleAriaLabel = 'Resize panel',
      className,
      handleClassName,
      style,
      ...rest
    },
    forwardedRef,
  ) {
    const isControlled = widthProp !== undefined;
    // (v1.11.408, TODO 11.390) Seed initial width:
    //   1. localStorage if `storageKey` + saved value exists,
    //   2. `defaultWidth` otherwise.
    // The seed runs once on mount via useState's initialiser
    // so re-renders do not re-read storage every paint.
    const [internalWidth, setInternalWidth] = useState<number>(() => {
      let seed = defaultWidth;
      if (storageKey) {
        const stored = readStoredWidth(storageKey);
        if (stored !== null) seed = stored;
      }
      return clampDrawerWidth(seed, minWidth, maxWidth);
    });
    const width = clampDrawerWidth(
      isControlled ? (widthProp as number) : internalWidth,
      minWidth,
      maxWidth,
    );

    // Persistent state across pointermove without re-rendering.
    const dragStateRef = useRef<{
      startX: number;
      startWidth: number;
    } | null>(null);
    const handleRef = useRef<HTMLDivElement | null>(null);
    const [dragging, setDragging] = useState<boolean>(false);

    const commit = useCallback(
      (next: number, persist: boolean) => {
        const clamped = clampDrawerWidth(next, minWidth, maxWidth);
        if (!isControlled) setInternalWidth(clamped);
        onWidthChange?.(clamped);
        if (persist && storageKey) writeStoredWidth(storageKey, clamped);
      },
      [isControlled, onWidthChange, minWidth, maxWidth, storageKey],
    );

    const onPointerDown = useCallback(
      (e: ReactPointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return; // primary only
        e.preventDefault();
        dragStateRef.current = {
          startX: e.clientX,
          startWidth: width,
        };
        setDragging(true);
        const target = e.currentTarget;
        try {
          target.setPointerCapture(e.pointerId);
        } catch {
          /* ignore -- jsdom does not implement setPointerCapture */
        }
      },
      [width],
    );

    const onPointerMove = useCallback(
      (e: ReactPointerEvent<HTMLDivElement>) => {
        const state = dragStateRef.current;
        if (!state) return;
        const dx = e.clientX - state.startX;
        // For `side="right"`: dragging left (dx < 0) increases width.
        // For `side="left"`: dragging right (dx > 0) increases width.
        const delta = side === 'right' ? -dx : dx;
        const next = state.startWidth + delta;
        commit(next, false);
      },
      [side, commit],
    );

    const endDrag = useCallback(
      (e: ReactPointerEvent<HTMLDivElement>) => {
        if (!dragStateRef.current) return;
        dragStateRef.current = null;
        setDragging(false);
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        // Persist on release (drag may have produced many commits).
        if (storageKey) writeStoredWidth(storageKey, width);
      },
      [storageKey, width],
    );

    const onKeyDown = useCallback(
      (e: ReactKeyboardEvent<HTMLDivElement>) => {
        // ArrowLeft / ArrowRight match the user's mental model
        // of "drag the handle left / right" -- not the
        // direction of width growth.
        //
        //   Right-side panel (handle on its LEFT edge):
        //     ArrowLeft  -> drag-left  -> WIDER (+step)
        //     ArrowRight -> drag-right -> NARROWER (-step)
        //
        //   Left-side panel (handle on its RIGHT edge):
        //     ArrowLeft  -> drag-left  -> NARROWER (-step)
        //     ArrowRight -> drag-right -> WIDER (+step)
        const incSign = side === 'right' ? 1 : -1;
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          commit(width + incSign * keyboardStep, true);
          return;
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          commit(width - incSign * keyboardStep, true);
          return;
        }
        if (e.key === 'PageUp') {
          e.preventDefault();
          commit(width + pageStep, true);
          return;
        }
        if (e.key === 'PageDown') {
          e.preventDefault();
          commit(width - pageStep, true);
          return;
        }
        if (e.key === 'Home') {
          e.preventDefault();
          commit(minWidth, true);
          return;
        }
        if (e.key === 'End') {
          e.preventDefault();
          commit(maxWidth, true);
        }
      },
      [side, width, commit, keyboardStep, pageStep, minWidth, maxWidth],
    );

    // (v1.11.408, TODO 11.390) Storage sync: when the
    // storageKey changes, re-seed from the new key. This is
    // rare in practice but keeps the contract consistent.
    useEffect(() => {
      if (!storageKey || isControlled) return;
      const stored = readStoredWidth(storageKey);
      if (stored === null) return;
      const clamped = clampDrawerWidth(stored, minWidth, maxWidth);
      setInternalWidth(clamped);
    }, [storageKey, isControlled, minWidth, maxWidth]);

    const mergedStyle: CSSProperties = {
      width: `${width}px`,
      ...style,
    };

    const handleEl = (
      <div
        ref={handleRef}
        role="separator"
        aria-orientation="vertical"
        aria-valuemin={minWidth}
        aria-valuemax={maxWidth}
        aria-valuenow={width}
        aria-label={handleAriaLabel}
        tabIndex={0}
        data-section="drawer-resize-handle"
        data-side={side}
        data-dragging={dragging ? 'true' : 'false'}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        className={cn(
          'absolute top-0 bottom-0 z-10 w-1 cursor-col-resize select-none bg-transparent transition-colors',
          'hover:bg-border focus-visible:bg-primary focus-visible:outline-none',
          dragging && 'bg-primary',
          side === 'right' ? 'left-0' : 'right-0',
          handleClassName,
        )}
      />
    );

    return (
      <div
        ref={forwardedRef}
        data-section="drawer-resize"
        data-side={side}
        data-width={width}
        data-dragging={dragging ? 'true' : 'false'}
        className={cn(
          'relative shrink-0',
          dragging && 'select-none',
          className,
        )}
        style={mergedStyle}
        {...rest}
      >
        {handleEl}
        <div data-section="drawer-resize-body" className="h-full w-full">
          {children}
        </div>
      </div>
    );
  },
);

DrawerResize.displayName = 'DrawerResize';
