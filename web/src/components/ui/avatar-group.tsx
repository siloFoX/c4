import type { HTMLAttributes } from 'react';
import { Avatar, type AvatarSize } from './avatar';
import { cn } from '../../lib/cn';

// (v1.11.272, TODO 11.254) AvatarGroup -- overlapping avatar
// stack with an optional "+N more" chip when the roster exceeds
// the `max` cap. Items render in input order; the first `max - 1`
// avatars are visible and the rest collapse into the chip.
//
// Reference: /root/c4/arps-design-system-v1/ "avatar group"
// pattern. Common adoption sites: session participants, attached
// workers, template author rosters, recently-active operators.

export interface AvatarGroupItem {
  // Optional human-readable identifier. Used for initials when no
  // src is provided and for the avatar's aria-label.
  name?: string;
  // Optional image source. When set, Avatar renders the bitmap;
  // otherwise it falls back to deterministic-color initials.
  src?: string;
  alt?: string;
}

export interface AvatarGroupProps extends HTMLAttributes<HTMLDivElement> {
  items: AvatarGroupItem[];
  // Maximum visible avatars (including the trailing "+N" chip).
  // Defaults to 5. Values <= 0 fall back to 1 so the group always
  // renders at least a single chip.
  max?: number;
  size?: AvatarSize;
  // Override label for the overflow chip's aria-label. Defaults
  // to "N more" so screen readers hear the expanded count.
  overflowAriaLabel?: (n: number) => string;
  className?: string;
}

// Sizing tokens map to the negative left-margin overlap that
// produces the "stacked card" look. Larger sizes need more pull
// so the visible part of each adjacent avatar stays consistent.
const OVERLAP: Record<AvatarSize, string> = {
  xs: '-ml-1.5',
  sm: '-ml-2',
  md: '-ml-3',
  lg: '-ml-4',
  // (v1.11.385, TODO 11.367) `xl` pulls more so the visible
  // crescent on the next tile reads at the larger tier.
  xl: '-ml-5',
};

const CHIP_SIZE: Record<AvatarSize, string> = {
  xs: 'h-5 w-5 text-[9px]',
  sm: 'h-6 w-6 text-[10px]',
  md: 'h-8 w-8 text-xs',
  lg: 'h-10 w-10 text-sm',
  // (v1.11.385, TODO 11.367) `xl` chip matches the avatar
  // tile (`h-12 w-12 text-base`).
  xl: 'h-12 w-12 text-base',
};

export function AvatarGroup({
  items,
  max = 5,
  size = 'md',
  overflowAriaLabel,
  className,
  ...rest
}: AvatarGroupProps) {
  const effectiveMax = Math.max(1, max);
  const overflow =
    items.length > effectiveMax ? items.length - (effectiveMax - 1) : 0;
  // When the roster fits, render every item. When it overflows,
  // keep room for the chip by reserving the trailing slot for
  // "+N more".
  const visibleCount =
    overflow > 0 ? Math.max(0, effectiveMax - 1) : items.length;
  const visible = items.slice(0, visibleCount);
  const overlapClass = OVERLAP[size];
  return (
    <div
      role="group"
      aria-label={`${items.length} ${items.length === 1 ? 'participant' : 'participants'}`}
      data-section="avatar-group"
      data-count={items.length}
      data-overflow={overflow}
      {...rest}
      className={cn('inline-flex items-center', className)}
    >
      {visible.map((item, idx) => (
        <span
          key={`${item.name ?? 'anon'}-${idx}`}
          data-avatar-group-item={idx}
          className={cn(
            'rounded-full ring-2 ring-card',
            idx > 0 && overlapClass,
          )}
        >
          <Avatar
            {...(item.name !== undefined ? { name: item.name } : {})}
            {...(item.src !== undefined ? { src: item.src } : {})}
            {...(item.alt !== undefined ? { alt: item.alt } : {})}
            size={size}
          />
        </span>
      ))}
      {overflow > 0 ? (
        <span
          role="img"
          aria-label={
            overflowAriaLabel ? overflowAriaLabel(overflow) : `${overflow} more`
          }
          data-avatar-group-overflow
          className={cn(
            'inline-flex shrink-0 select-none items-center justify-center rounded-full bg-muted text-muted-foreground ring-2 ring-card font-semibold',
            CHIP_SIZE[size],
            visibleCount > 0 && overlapClass,
          )}
        >
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}

AvatarGroup.displayName = 'AvatarGroup';
