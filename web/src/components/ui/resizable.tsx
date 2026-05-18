import {
  Fragment,
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from 'react';
import { cn } from '../../lib/cn';

// (v1.11.410, TODO 11.392) Resizable -- composable multi-panel
// resizer with horizontal / vertical direction, per-panel
// min/max ratio constraints, and a drag handle between every
// pair of adjacent panels.
//
// Distinct from `<SplitPane>` / `<SplitView>` (11.274 /
// 11.391) which are FIXED at exactly two panes; Resizable
// supports an arbitrary count. Per-panel min/max ratios are
// enforced during drag + keyboard nudge.
//
// Design choices:
//   - Sizes are normalized ratios that sum to 1.0. Initial
//     `defaultSize` values are normalized on mount so callers
//     do not have to make them add up perfectly.
//   - Dragging the handle between panel[i] and panel[i+1]
//     adjusts ONLY those two panels (siblings stay put). This
//     is the canonical multi-pane resizer contract -- the
//     alternative (propagating delta to siblings) creates
//     non-local layout effects that operators find
//     confusing.
//   - Per-panel `minSize` / `maxSize` clamps the pair during
//     drag: when one side would shrink below its min, the
//     handle stops moving. Same for the partner reaching its
//     max.
//   - Persistence is opt-in via `storageKey`. Stored sizes
//     are validated (correct length + within bounds) and
//     fall back to defaults on parse failure.

export type ResizableDirection = 'horizontal' | 'vertical';

export interface ResizablePanelConfig {
  id: string;
  content: ReactNode;
  /** Initial size as a ratio (0..1). Normalized across the group on mount. */
  defaultSize?: number;
  /** Minimum size ratio. Default 0.1. */
  minSize?: number;
  /** Maximum size ratio. Default 1. */
  maxSize?: number;
  /** ARIA label for the panel container. */
  ariaLabel?: string;
}

export interface ResizableProps {
  panels: ResizablePanelConfig[];
  direction?: ResizableDirection;
  /** Persist sizes to localStorage under this key. */
  storageKey?: string;
  /** Keyboard step in ratio units. Default 0.025 (2.5%). */
  keyboardStep?: number;
  /** ARIA label for the role=group container. */
  ariaLabel?: string;
  /** ARIA label format for each handle. Default 'Resize between {prev} and {next}'. */
  handleAriaLabel?: (prev: string, next: string) => string;
  className?: string;
  /** Fires every commit with the full normalized size array. */
  onSizesChange?: (sizes: number[]) => void;
}

const STORAGE_PREFIX = 'c4:resizable:';

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

// (v1.11.410, TODO 11.392) Pure helper exported for tests +
// alternate hosts. Normalizes a raw size array so all entries
// sum to 1.0 and each respects [minSize, maxSize].
//
// Strategy:
//   1. Replace negative / NaN entries with their `minSize`.
//   2. Clamp each to `[minSize, maxSize]`.
//   3. Sum the clamped array; if sum > 0, scale to sum=1.
//   4. After scaling, re-clamp. If clamps push the total
//      off 1.0, distribute the slack to the LAST panel
//      (canonical convention -- the trailing pane absorbs
//      rounding error).
//   5. If the result still sums incorrectly, fall back to
//      equal distribution across all panels.
export function normalizeResizableSizes(
  raw: number[],
  mins: number[],
  maxs: number[],
): number[] {
  const len = raw.length;
  if (len === 0) return [];
  if (mins.length !== len || maxs.length !== len) {
    // Defensive: bad input -> equal split.
    return Array.from({ length: len }, () => 1 / len);
  }
  const clean = raw.map((v, i) => {
    if (!Number.isFinite(v) || v < 0) return mins[i] ?? 0;
    return v;
  });
  const sum = clean.reduce((a, b) => a + b, 0);
  let scaled =
    sum > 0
      ? clean.map((v) => v / sum)
      : Array.from({ length: len }, () => 1 / len);
  scaled = scaled.map((v, i) => clamp(v, mins[i] ?? 0, maxs[i] ?? 1));
  const newSum = scaled.reduce((a, b) => a + b, 0);
  const drift = 1 - newSum;
  if (Math.abs(drift) > 1e-9 && len > 0) {
    const last = scaled[len - 1] ?? 0;
    scaled[len - 1] = clamp(
      last + drift,
      mins[len - 1] ?? 0,
      maxs[len - 1] ?? 1,
    );
    // If trailing clamp also fails, fall back to equal split.
    const finalSum = scaled.reduce((a, b) => a + b, 0);
    if (Math.abs(finalSum - 1) > 0.01) {
      return Array.from({ length: len }, () => 1 / len);
    }
  }
  return scaled;
}

// (v1.11.410, TODO 11.392) Apply a delta to the boundary
// between panel[i] and panel[i+1]. Returns the next size
// array. Both panels stay within their min/max; if the
// delta would push one past its bound, the move is clamped
// to whichever cap binds first.
export function applyResizableDelta(
  sizes: number[],
  i: number,
  delta: number,
  mins: number[],
  maxs: number[],
): number[] {
  if (i < 0 || i >= sizes.length - 1) return sizes;
  const a = sizes[i] ?? 0;
  const b = sizes[i + 1] ?? 0;
  const aMin = mins[i] ?? 0;
  const aMax = maxs[i] ?? 1;
  const bMin = mins[i + 1] ?? 0;
  const bMax = maxs[i + 1] ?? 1;
  // Cap delta on both sides.
  let dx = delta;
  // a grows by dx, b shrinks by dx.
  // a max: dx <= aMax - a
  if (dx > aMax - a) dx = aMax - a;
  // a min: dx >= aMin - a (negative direction)
  if (dx < aMin - a) dx = aMin - a;
  // b max (shrinking b means b decreases; if dx > 0 -> b
  // gets smaller; lower bound is bMin): -dx >= bMin - b ->
  // dx <= b - bMin.
  if (dx > b - bMin) dx = b - bMin;
  // b min (growing b means dx < 0): -dx <= bMax - b ->
  // dx >= b - bMax.
  if (dx < b - bMax) dx = b - bMax;
  const next = [...sizes];
  next[i] = a + dx;
  next[i + 1] = b - dx;
  return next;
}

function readStoredSizes(
  key: string,
  expectedLength: number,
): number[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + key);
    if (raw == null) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    if (parsed.length !== expectedLength) return null;
    if (!parsed.every((n) => typeof n === 'number' && Number.isFinite(n))) {
      return null;
    }
    return parsed as number[];
  } catch {
    return null;
  }
}

function writeStoredSizes(key: string, sizes: number[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      STORAGE_PREFIX + key,
      JSON.stringify(sizes),
    );
  } catch {
    /* ignore -- quota / private mode */
  }
}

function defaultHandleAriaLabel(prev: string, next: string): string {
  return `Resize between ${prev} and ${next}`;
}

export const Resizable = forwardRef<HTMLDivElement, ResizableProps>(
  function Resizable(
    {
      panels,
      direction = 'horizontal',
      storageKey,
      keyboardStep = 0.025,
      ariaLabel = 'Resizable group',
      handleAriaLabel = defaultHandleAriaLabel,
      className,
      onSizesChange,
    },
    forwardedRef,
  ) {
    const baseId = useId();
    const containerRef = useRef<HTMLDivElement | null>(null);
    const dragRef = useRef<{
      handleIndex: number;
      startCoord: number;
      startSizes: number[];
    } | null>(null);
    const [dragging, setDragging] = useState<number | null>(null);

    const mins = panels.map((p) => p.minSize ?? 0.1);
    const maxs = panels.map((p) => p.maxSize ?? 1);

    // (v1.11.410, TODO 11.392) Seed sizes:
    //   1. localStorage (when storageKey is set + valid),
    //   2. normalized defaultSize array,
    //   3. equal split fallback.
    const [sizes, setSizes] = useState<number[]>(() => {
      const defaults = panels.map((p) =>
        typeof p.defaultSize === 'number' ? p.defaultSize : 1 / panels.length,
      );
      if (storageKey) {
        const stored = readStoredSizes(storageKey, panels.length);
        if (stored) return normalizeResizableSizes(stored, mins, maxs);
      }
      return normalizeResizableSizes(defaults, mins, maxs);
    });

    const commit = useCallback(
      (next: number[]) => {
        setSizes(next);
        onSizesChange?.(next);
        if (storageKey) writeStoredSizes(storageKey, next);
      },
      [onSizesChange, storageKey],
    );

    const isHorizontal = direction === 'horizontal';

    const onHandlePointerDown = useCallback(
      (handleIndex: number, e: ReactPointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;
        e.preventDefault();
        const container = containerRef.current;
        if (!container) return;
        dragRef.current = {
          handleIndex,
          startCoord: isHorizontal ? e.clientX : e.clientY,
          startSizes: sizes.slice(),
        };
        setDragging(handleIndex);
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* jsdom -- ignore */
        }
      },
      [sizes, isHorizontal],
    );

    const onHandlePointerMove = useCallback(
      (e: ReactPointerEvent<HTMLDivElement>) => {
        const state = dragRef.current;
        const container = containerRef.current;
        if (!state || !container) return;
        const rect = container.getBoundingClientRect();
        const totalSize = isHorizontal ? rect.width : rect.height;
        if (totalSize <= 0) return;
        const coord = isHorizontal ? e.clientX : e.clientY;
        const delta = (coord - state.startCoord) / totalSize;
        const next = applyResizableDelta(
          state.startSizes,
          state.handleIndex,
          delta,
          mins,
          maxs,
        );
        commit(next);
      },
      [commit, isHorizontal, mins, maxs],
    );

    const endDrag = useCallback(
      (e: ReactPointerEvent<HTMLDivElement>) => {
        if (!dragRef.current) return;
        dragRef.current = null;
        setDragging(null);
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      },
      [],
    );

    const onHandleKeyDown = useCallback(
      (handleIndex: number, e: ReactKeyboardEvent<HTMLDivElement>) => {
        // Direction-aware keys: horizontal uses ArrowLeft /
        // Right; vertical uses ArrowUp / Down. The "decrease"
        // key shrinks the START pane (panel[handleIndex]);
        // the "increase" key grows it.
        const decreaseKey = isHorizontal ? 'ArrowLeft' : 'ArrowUp';
        const increaseKey = isHorizontal ? 'ArrowRight' : 'ArrowDown';
        if (e.key === decreaseKey) {
          e.preventDefault();
          const next = applyResizableDelta(
            sizes,
            handleIndex,
            -keyboardStep,
            mins,
            maxs,
          );
          commit(next);
          return;
        }
        if (e.key === increaseKey) {
          e.preventDefault();
          const next = applyResizableDelta(
            sizes,
            handleIndex,
            keyboardStep,
            mins,
            maxs,
          );
          commit(next);
          return;
        }
        if (e.key === 'Home') {
          // Push panel[handleIndex] to its min.
          e.preventDefault();
          const target = mins[handleIndex] ?? 0;
          const current = sizes[handleIndex] ?? 0;
          const next = applyResizableDelta(
            sizes,
            handleIndex,
            target - current,
            mins,
            maxs,
          );
          commit(next);
          return;
        }
        if (e.key === 'End') {
          // Push panel[handleIndex] to its max.
          e.preventDefault();
          const target = maxs[handleIndex] ?? 1;
          const current = sizes[handleIndex] ?? 0;
          const next = applyResizableDelta(
            sizes,
            handleIndex,
            target - current,
            mins,
            maxs,
          );
          commit(next);
        }
      },
      [sizes, commit, isHorizontal, keyboardStep, mins, maxs],
    );

    // Cross-tab `storage` event sync.
    useEffect(() => {
      if (!storageKey) return;
      const onStorage = (e: StorageEvent) => {
        if (e.key !== STORAGE_PREFIX + storageKey) return;
        const stored = readStoredSizes(storageKey, panels.length);
        if (!stored) return;
        setSizes(normalizeResizableSizes(stored, mins, maxs));
      };
      window.addEventListener('storage', onStorage);
      return () => window.removeEventListener('storage', onStorage);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [storageKey, panels.length]);

    return (
      <div
        ref={(node) => {
          containerRef.current = node;
          if (typeof forwardedRef === 'function') forwardedRef(node);
          else if (forwardedRef && typeof forwardedRef === 'object') {
            (forwardedRef as React.MutableRefObject<HTMLDivElement | null>).current =
              node;
          }
        }}
        role="group"
        aria-label={ariaLabel}
        aria-orientation={isHorizontal ? 'horizontal' : 'vertical'}
        data-section="resizable"
        data-direction={direction}
        data-panel-count={panels.length}
        className={cn(
          'flex h-full w-full',
          isHorizontal ? 'flex-row' : 'flex-col',
          className,
        )}
      >
        {panels.map((panel, idx) => {
          const size = sizes[idx] ?? 0;
          const panelStyle: CSSProperties = isHorizontal
            ? { flexBasis: `${size * 100}%`, minWidth: 0 }
            : { flexBasis: `${size * 100}%`, minHeight: 0 };
          const handleIndex = idx;
          const isLast = idx === panels.length - 1;
          return (
            <Fragment key={panel.id}>
              <div
                role="group"
                aria-label={panel.ariaLabel ?? `Panel ${idx + 1}`}
                data-section="resizable-panel"
                data-panel-id={panel.id}
                data-panel-index={idx}
                style={panelStyle}
                className="flex-shrink-0 flex-grow-0 overflow-hidden"
              >
                {panel.content}
              </div>
              {isLast ? null : (
                <div
                  role="separator"
                  tabIndex={0}
                  aria-orientation={isHorizontal ? 'vertical' : 'horizontal'}
                  aria-valuenow={Math.round((sizes[idx] ?? 0) * 100)}
                  aria-valuemin={Math.round((mins[idx] ?? 0) * 100)}
                  aria-valuemax={Math.round((maxs[idx] ?? 1) * 100)}
                  aria-label={handleAriaLabel(
                    panel.ariaLabel ?? panel.id,
                    panels[idx + 1]?.ariaLabel ?? panels[idx + 1]?.id ?? 'next',
                  )}
                  data-section="resizable-handle"
                  data-handle-index={handleIndex}
                  data-dragging={dragging === handleIndex ? 'true' : 'false'}
                  onPointerDown={(e) => onHandlePointerDown(handleIndex, e)}
                  onPointerMove={onHandlePointerMove}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  onKeyDown={(e) => onHandleKeyDown(handleIndex, e)}
                  id={`${baseId}-handle-${handleIndex}`}
                  className={cn(
                    'shrink-0 select-none bg-border transition-colors',
                    'hover:bg-primary/40 focus-visible:bg-primary/60 focus-visible:outline-none',
                    dragging === handleIndex && 'bg-primary/60',
                    isHorizontal
                      ? 'w-1 cursor-col-resize'
                      : 'h-1 cursor-row-resize',
                  )}
                />
              )}
            </Fragment>
          );
        })}
      </div>
    );
  },
);

Resizable.displayName = 'Resizable';
