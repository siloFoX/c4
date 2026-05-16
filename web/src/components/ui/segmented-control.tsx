import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { HTMLAttributes, KeyboardEvent, ReactNode } from 'react';
import { cn } from '../../lib/cn';

// (v1.11.276, TODO 11.258) SegmentedControl -- pill-shaped option
// group with single-select semantics. Built for the "3-5 short
// choices" use case (date range tabs, view-mode toggle, scope
// selector). For larger sets reach for `<Tabs>` or `<Select>`
// instead -- a 7-option segmented strip wraps awkwardly.
//
// Keyboard contract:
//   - ArrowLeft / ArrowRight (and ArrowUp / ArrowDown for
//     vertical-tab affordance) move focus between segments.
//   - Home / End jump to the first / last segment.
//   - Enter / Space select the focused segment (also fires when
//     `selectOnFocus` is true and focus moves).
//   - Disabled segments are skipped during arrow nav.
// Focus management: roving `tabindex` -- the active segment gets
// `tabindex=0`; others get `tabindex=-1`. Calling code does not
// need to manage refs.
//
// Reference: /root/c4/arps-design-system-v1/ "segmented control"
// pattern.

export type SegmentedControlSize = 'sm' | 'md';

export interface SegmentedControlOption<V extends string = string> {
  value: V;
  label?: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  // Optional accessible name override when only an icon is rendered.
  ariaLabel?: string;
}

export interface SegmentedControlProps<V extends string = string>
  extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange' | 'role'> {
  options: SegmentedControlOption<V>[];
  value: V;
  onChange: (next: V) => void;
  size?: SegmentedControlSize;
  // Auto-select on focus (true) vs. require explicit Enter / click
  // (false, default). Auto-select matches the WAI-ARIA "automatic"
  // tab pattern; manual is the safer default for filters that
  // re-fetch on every change.
  selectOnFocus?: boolean;
  ariaLabel?: string;
  className?: string;
}

const SIZE_CLASSES: Record<SegmentedControlSize, {
  container: string;
  segment: string;
  iconOnly: string;
}> = {
  sm: {
    container: 'p-0.5',
    segment: 'h-6 px-2 text-[11px]',
    iconOnly: 'h-6 w-6 text-[11px]',
  },
  md: {
    container: 'p-0.5',
    segment: 'h-8 px-3 text-xs',
    iconOnly: 'h-8 w-8 text-xs',
  },
};

function findEnabledIndex<V extends string>(
  options: SegmentedControlOption<V>[],
  start: number,
  delta: 1 | -1,
): number {
  const n = options.length;
  if (n === 0) return -1;
  let idx = start;
  for (let step = 0; step < n; step += 1) {
    idx = (idx + delta + n) % n;
    if (!options[idx]!.disabled) return idx;
  }
  return -1;
}

function findFirstEnabled<V extends string>(
  options: SegmentedControlOption<V>[],
): number {
  return options.findIndex((o) => !o.disabled);
}

function findLastEnabled<V extends string>(
  options: SegmentedControlOption<V>[],
): number {
  for (let i = options.length - 1; i >= 0; i -= 1) {
    if (!options[i]!.disabled) return i;
  }
  return -1;
}

export const SegmentedControl = forwardRef(function SegmentedControl<
  V extends string = string,
>(
  {
    options,
    value,
    onChange,
    size = 'md',
    selectOnFocus = false,
    ariaLabel,
    className,
    ...rest
  }: SegmentedControlProps<V>,
  ref: React.Ref<HTMLDivElement>,
) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  // Local focus index for keyboard nav. Initialises to the
  // selected segment so the roving tabindex starts in the right
  // place; arrow keys can move focus to other segments without
  // selecting them (unless `selectOnFocus` is true).
  const [focusIndex, setFocusIndex] = useState<number>(activeIndex);

  // Keep focus index in sync when the controlled value changes
  // out-of-band (e.g. parent reset).
  useEffect(() => {
    setFocusIndex(activeIndex);
  }, [activeIndex]);

  const moveFocus = useCallback(
    (next: number) => {
      if (next < 0 || next >= options.length) return;
      setFocusIndex(next);
      refs.current[next]?.focus();
      if (selectOnFocus) {
        const opt = options[next];
        if (opt && !opt.disabled) onChange(opt.value);
      }
    },
    [options, selectOnFocus, onChange],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const key = e.key;
      switch (key) {
        case 'ArrowRight':
        case 'ArrowDown': {
          e.preventDefault();
          const next = findEnabledIndex(options, focusIndex, 1);
          if (next !== -1) moveFocus(next);
          break;
        }
        case 'ArrowLeft':
        case 'ArrowUp': {
          e.preventDefault();
          const prev = findEnabledIndex(options, focusIndex, -1);
          if (prev !== -1) moveFocus(prev);
          break;
        }
        case 'Home': {
          e.preventDefault();
          const first = findFirstEnabled(options);
          if (first !== -1) moveFocus(first);
          break;
        }
        case 'End': {
          e.preventDefault();
          const last = findLastEnabled(options);
          if (last !== -1) moveFocus(last);
          break;
        }
        case 'Enter':
        case ' ': {
          e.preventDefault();
          const opt = options[focusIndex];
          if (opt && !opt.disabled) onChange(opt.value);
          break;
        }
        default:
          break;
      }
    },
    [focusIndex, moveFocus, options, onChange],
  );

  const sizing = SIZE_CLASSES[size];

  return (
    <div
      ref={ref}
      role="tablist"
      aria-label={ariaLabel}
      data-section="segmented-control"
      data-size={size}
      onKeyDown={handleKeyDown}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-border bg-muted/40',
        sizing.container,
        className,
      )}
      {...rest}
    >
      {options.map((opt, idx) => {
        const isActive = opt.value === value;
        const tabIdx = idx === focusIndex ? 0 : -1;
        const iconOnly = !opt.label && Boolean(opt.icon);
        return (
          <button
            key={opt.value}
            ref={(el) => {
              refs.current[idx] = el;
            }}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={opt.ariaLabel}
            data-segmented-value={opt.value}
            data-segmented-active={isActive ? 'true' : 'false'}
            disabled={opt.disabled}
            tabIndex={tabIdx}
            onClick={() => {
              if (opt.disabled) return;
              setFocusIndex(idx);
              onChange(opt.value);
            }}
            onFocus={() => {
              if (focusIndex !== idx) setFocusIndex(idx);
            }}
            className={cn(
              'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background',
              iconOnly ? sizing.iconOnly : sizing.segment,
              isActive
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
              opt.disabled && 'cursor-not-allowed opacity-50',
            )}
          >
            {opt.icon ? (
              <span aria-hidden="true" className="shrink-0">
                {opt.icon}
              </span>
            ) : null}
            {opt.label ? <span>{opt.label}</span> : null}
          </button>
        );
      })}
    </div>
  );
}) as <V extends string = string>(
  props: SegmentedControlProps<V> & { ref?: React.Ref<HTMLDivElement> },
) => JSX.Element;

(SegmentedControl as unknown as { displayName: string }).displayName =
  'SegmentedControl';
