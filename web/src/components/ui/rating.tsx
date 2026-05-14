import { forwardRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { Star } from 'lucide-react';
import { cn } from '../../lib/cn';

export interface RatingProps {
  value: number;
  max?: number;
  onChange?: (value: number) => void;
  size?: 'sm' | 'md' | 'lg';
  readonly?: boolean;
  allowHalf?: boolean;
  label?: ReactNode;
  className?: string;
}

const SIZE_PX: Record<NonNullable<RatingProps['size']>, number> = {
  sm: 16,
  md: 20,
  lg: 24,
};

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
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
    },
    ref,
  ) => {
    const readonly = readonlyProp ?? onChange == null;
    const [hoverValue, setHoverValue] = useState<number | null>(null);
    const displayValue = hoverValue ?? value;
    const px = SIZE_PX[size];

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

    const stars = Array.from({ length: max }, (_, i) => {
      const starPos = i + 1;
      const diff = displayValue - i;
      let fillPct: number;
      if (diff >= 1) fillPct = 100;
      else if (allowHalf && diff >= 0.5) fillPct = 50;
      else if (!allowHalf && diff > 0) fillPct = 100;
      else fillPct = 0;
      const isHovered = hoverValue != null && starPos <= Math.ceil(hoverValue);

      const starContent = (
        <span
          className="relative inline-block"
          style={{ width: px, height: px }}
          aria-hidden="true"
        >
          <Star
            className="absolute inset-0 text-muted-foreground"
            style={{ width: px, height: px }}
            strokeWidth={1.5}
          />
          <span
            className="absolute inset-0 overflow-hidden"
            style={{ width: `${fillPct}%` }}
          >
            <Star
              className="text-primary"
              style={{ width: px, height: px, fill: 'currentColor' }}
              strokeWidth={1.5}
            />
          </span>
        </span>
      );

      const commonProps = {
        'data-rating-star': starPos,
        'data-hover': isHovered ? 'true' : undefined,
        className: cn(
          'inline-flex items-center justify-center p-0 leading-none',
          isHovered && 'rating-star-hover',
        ),
        style: { width: px, height: px },
      } as const;

      if (readonly) {
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

    return (
      <div
        ref={ref}
        role="slider"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-readonly={readonly || undefined}
        aria-label={typeof label === 'string' ? label : 'Rating'}
        tabIndex={readonly ? -1 : 0}
        onKeyDown={handleKeyDown}
        className={cn(
          'inline-flex items-center gap-0.5 outline-none',
          !readonly &&
            'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm',
          readonly && 'cursor-default',
          className,
        )}
      >
        {label != null && typeof label !== 'string' ? (
          <span className="sr-only">{label}</span>
        ) : null}
        {stars}
      </div>
    );
  },
);
Rating.displayName = 'Rating';
