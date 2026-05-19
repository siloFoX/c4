import { forwardRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { Star } from 'lucide-react';
import { cn } from '../../lib/cn';
import { VisuallyHidden } from './visually-hidden';

// (v1.11.434, TODO 11.416) Star rating input.
//
// Half-star support + readonly mode + custom icon slot +
// keyboard navigation. Default ARIA role is `slider` (byte-
// identical legacy semantics, preserves all existing tests).
// Pass `ariaRole="radiogroup"` to opt into the canonical W3C
// radiogroup pattern -- root becomes
// `role="radiogroup"` and each star button gets
// `role="radio"` + `aria-checked` ('true' / 'false' /
// 'mixed' for the half-star case).
//
// Reference: /root/c4/arps-design-system-v1/.

export type RatingAriaRole = 'slider' | 'radiogroup';

export interface RatingProps {
  value: number;
  max?: number;
  onChange?: (value: number) => void;
  size?: 'sm' | 'md' | 'lg';
  readonly?: boolean;
  allowHalf?: boolean;
  label?: ReactNode;
  className?: string;
  // (v1.11.434, TODO 11.416) Custom icon slot. `icon` replaces
  // the filled glyph; `emptyIcon` replaces the unfilled
  // background glyph. Both default to lucide `<Star>`.
  icon?: ReactNode;
  emptyIcon?: ReactNode;
  // (v1.11.434, TODO 11.416) ARIA role for the root container.
  // Default 'slider' (legacy, byte-identical). Opt into
  // 'radiogroup' for the canonical W3C pattern.
  ariaRole?: RatingAriaRole;
}

const SIZE_PX: Record<NonNullable<RatingProps['size']>, number> = {
  sm: 16,
  md: 20,
  lg: 24,
};

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

// ---------------------------------------------------------------
// Pure helpers (exported)
// ---------------------------------------------------------------

export function clampRating(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  if (!Number.isFinite(max) || max < 0) return 0;
  if (value < 0) return 0;
  if (value > max) return max;
  return value;
}

export function getRatingStarFillPercent(
  starIndex: number,
  value: number,
  allowHalf: boolean,
): 0 | 50 | 100 {
  const diff = value - starIndex;
  if (diff >= 1) return 100;
  if (allowHalf && diff >= 0.5) return 50;
  if (!allowHalf && diff > 0) return 100;
  return 0;
}

export function getRatingAriaChecked(
  starIndex: number,
  value: number,
  allowHalf: boolean,
): 'true' | 'false' | 'mixed' {
  const starValue = starIndex + 1;
  if (value >= starValue) return 'true';
  if (allowHalf && value >= starIndex + 0.5 && value < starValue) {
    return 'mixed';
  }
  return 'false';
}

export const Rating = forwardRef<HTMLDivElement, RatingProps>(
  (
    {
      value,
      max = 5,
      onChange,
      size = 'md',
      readonly: readonlyProp,
      allowHalf = true,
      label,
      className,
      icon,
      emptyIcon,
      ariaRole = 'slider',
    },
    ref,
  ) => {
    const readonly = readonlyProp ?? onChange == null;
    const [hoverValue, setHoverValue] = useState<number | null>(null);
    const displayValue = hoverValue ?? value;
    const px = SIZE_PX[size];
    const isRadiogroup = ariaRole === 'radiogroup';

    const commit = (next: number) => {
      if (readonly) return;
      const v = clamp(next, 0, max);
      onChange?.(v);
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
      if (readonly) return;
      const step = allowHalf ? 0.5 : 1;
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowUp':
          e.preventDefault();
          commit(value + step);
          break;
        case 'ArrowLeft':
        case 'ArrowDown':
          e.preventDefault();
          commit(value - step);
          break;
        case 'Home':
          e.preventDefault();
          commit(0);
          break;
        case 'End':
          e.preventDefault();
          commit(max);
          break;
        default:
          break;
      }
    };

    const computeStarValue = (
      index: number,
      e: MouseEvent<HTMLElement>,
    ): number => {
      if (!allowHalf) return index + 1;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      return x < rect.width / 2 ? index + 0.5 : index + 1;
    };

    // Preserve the legacy DOM structure (base icon as direct
    // child of the glyph wrapper; fill wrapper as the only span
    // child) so existing tests + adopters that select via
    // `[data-rating-star] > span > span` keep working.
    const filledIcon = icon ?? (
      <Star
        className="text-primary"
        style={{ width: px, height: px, fill: 'currentColor' }}
        strokeWidth={1.5}
      />
    );
    const baseIcon = emptyIcon ?? (
      <Star
        className="absolute inset-0 text-muted-foreground"
        style={{ width: px, height: px }}
        strokeWidth={1.5}
      />
    );

    const stars = Array.from({ length: max }, (_, i) => {
      const starPos = i + 1;
      const fillPct = getRatingStarFillPercent(
        i,
        displayValue,
        allowHalf,
      );
      const isHovered = hoverValue != null && starPos <= Math.ceil(hoverValue);
      const ariaCheckedValue = getRatingAriaChecked(
        i,
        value,
        allowHalf,
      );

      const starContent = (
        <span
          data-section="rating-star-glyph"
          className="relative inline-block"
          style={{ width: px, height: px }}
          aria-hidden="true"
        >
          {baseIcon}
          <span
            data-section="rating-star-fill"
            data-fill-pct={fillPct}
            className="absolute inset-0 overflow-hidden"
            style={{ width: `${fillPct}%` }}
          >
            {filledIcon}
          </span>
        </span>
      );

      const commonProps = {
        'data-rating-star': starPos,
        'data-section': 'rating-star',
        'data-star-index': i,
        'data-fill-pct': fillPct,
        'data-hover': isHovered ? 'true' : undefined,
        className: cn(
          'inline-flex items-center justify-center p-0 leading-none',
          isHovered && 'rating-star-hover',
        ),
        style: { width: px, height: px },
      } as const;

      if (readonly) {
        if (isRadiogroup) {
          return (
            <span
              key={i}
              role="radio"
              aria-checked={ariaCheckedValue}
              aria-disabled="true"
              aria-label={`${starPos} star${starPos === 1 ? '' : 's'}`}
              {...commonProps}
            >
              {starContent}
            </span>
          );
        }
        return (
          <span key={i} {...commonProps}>
            {starContent}
          </span>
        );
      }

      return (
        <button
          key={i}
          type="button"
          tabIndex={-1}
          role={isRadiogroup ? 'radio' : undefined}
          aria-checked={isRadiogroup ? ariaCheckedValue : undefined}
          onMouseEnter={(e) => setHoverValue(computeStarValue(i, e))}
          onMouseMove={(e) => setHoverValue(computeStarValue(i, e))}
          onMouseLeave={() => setHoverValue(null)}
          onClick={(e) => commit(computeStarValue(i, e))}
          aria-label={`${starPos} star${starPos === 1 ? '' : 's'}`}
          {...commonProps}
        >
          {starContent}
        </button>
      );
    });

    const rootRole = isRadiogroup ? 'radiogroup' : 'slider';
    const sharedRootProps: Record<string, unknown> = {
      role: rootRole,
      'aria-readonly': readonly || undefined,
      'aria-label': typeof label === 'string' ? label : 'Rating',
      tabIndex: readonly ? -1 : 0,
      onKeyDown: handleKeyDown,
      'data-section': 'rating',
      'data-aria-role': rootRole,
      'data-readonly': readonly ? 'true' : 'false',
      'data-allow-half': allowHalf ? 'true' : 'false',
      'data-value': value,
      'data-max': max,
    };
    if (isRadiogroup) {
      sharedRootProps['aria-disabled'] = readonly || undefined;
    } else {
      sharedRootProps['aria-valuenow'] = value;
      sharedRootProps['aria-valuemin'] = 0;
      sharedRootProps['aria-valuemax'] = max;
    }
    return (
      <div
        ref={ref}
        {...sharedRootProps}
        className={cn(
          'inline-flex items-center gap-0.5 outline-none',
          !readonly &&
            'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm',
          readonly && 'cursor-default',
          className,
        )}
      >
        {label != null && typeof label !== 'string' ? (
          <VisuallyHidden>{label}</VisuallyHidden>
        ) : null}
        {stars}
      </div>
    );
  },
);
Rating.displayName = 'Rating';
