import { type ImgHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';
import { Image } from './image';
import type { StatusDotVariant } from './status-dot';

// (v1.11.300, TODO 11.282) Added `xs` size + optional
// `status` overlay so a single Avatar tile can carry both
// the entity identity AND its activity state. The previous
// WorkerList pattern (Avatar next to a separate StatusDot)
// is collapsed into one mark when the operator opts in via
// the new prop.
export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg';

export interface AvatarProps
  extends Omit<ImgHTMLAttributes<HTMLElement>, 'src' | 'alt' | 'className' | 'srcSet' | 'sizes'> {
  name?: string;
  src?: string;
  size?: AvatarSize;
  alt?: string;
  className?: string;
  /**
   * (v1.11.244, TODO 11.226) Forwarded to the underlying Image
   * primitive. Pair `srcSet` with size descriptors (e.g.
   * `"avatar@1x.png 1x, avatar@2x.png 2x"`) to let the browser
   * pick the right DPR for the visible avatar.
   */
  srcSet?: string;
  sizes?: string;
  /**
   * (v1.11.300, TODO 11.282) Optional activity/presence dot.
   * Maps to the StatusDot palette (online / busy / away /
   * offline / unknown). When set, a small coloured circle is
   * rendered in the bottom-right corner of the avatar tile.
   * The SR-friendly label is composed as
   * `<name>, <variant>` and exposed via `aria-label` on the
   * outer span so screen-reader users hear both in one read.
   */
  status?: StatusDotVariant;
}

const SIZE_CLASS: Record<AvatarSize, string> = {
  xs: 'h-5 w-5 text-[10px]',
  sm: 'h-6 w-6 text-xs',
  md: 'h-8 w-8 text-sm',
  lg: 'h-10 w-10 text-base',
};

// (v1.11.300, TODO 11.282) Per-status overlay colours --
// matches the StatusDot palette so a future hue migration in
// one component does not desynchronise the other.
const STATUS_OVERLAY_COLOR: Record<StatusDotVariant, string> = {
  online: 'bg-success',
  busy: 'bg-warning',
  away: 'bg-chart-3',
  offline: 'bg-muted-foreground',
  unknown: 'bg-muted',
};

// Per-size dot diameter for the overlay. Sized so the dot
// is ~ 1/3 the avatar tile, ringed with `bg-background` so it
// reads against any per-name fill colour beneath.
const STATUS_OVERLAY_SIZE: Record<AvatarSize, string> = {
  xs: 'h-1.5 w-1.5',
  sm: 'h-2 w-2',
  md: 'h-2.5 w-2.5',
  lg: 'h-3 w-3',
};

const PALETTE = [
  'bg-primary/20 text-primary',
  'bg-success/15 text-success',
  'bg-warning/15 text-warning',
  'bg-info/15 text-info',
  'bg-destructive/15 text-destructive',
  'bg-secondary text-secondary-foreground',
];

export function avatarInitials(name?: string): string {
  if (!name) return '';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}

export function avatarColorClass(name?: string): string {
  const key = name ?? '';
  let sum = 0;
  for (let i = 0; i < key.length; i += 1) sum += key.charCodeAt(i);
  return PALETTE[sum % PALETTE.length]!;
}

export function Avatar({
  name,
  src,
  size = 'md',
  alt,
  className,
  srcSet,
  sizes,
  status,
  ...rest
}: AvatarProps) {
  const label = alt || name || '';
  // (v1.11.300) Compose the SR label so a screen-reader user
  // hears name + status in one announcement.
  const composedLabel = status
    ? `${label}${label ? ', ' : ''}${status}`
    : label;
  const base = cn(
    'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold select-none',
    SIZE_CLASS[size],
  );

  // (v1.11.300) When a status is supplied, wrap the tile in
  // a relatively-positioned span so the dot overlay can dock
  // against the bottom-right edge without disrupting the
  // existing flex layout of the parent row.
  const statusOverlay = status ? (
    <span
      aria-hidden="true"
      data-section="avatar-status"
      data-status={status}
      className={cn(
        'absolute bottom-0 right-0 inline-block rounded-full ring-2 ring-background',
        STATUS_OVERLAY_SIZE[size],
        STATUS_OVERLAY_COLOR[status],
      )}
    />
  ) : null;

  if (src) {
    // Image's underlying <img alt={label}> provides the accessible name
    // via its implicit img role; the outer span stays decorative so
    // existing tests using getByRole('img', { name }) keep pointing at
    // the <img> element. (v1.11.244, TODO 11.226) Forwarding srcSet /
    // sizes lets callers ship a DPR-aware avatar without a wrapping
    // <picture>; Image's decoding="async" + (eager) loading defaults
    // are inherited so the avatar stays interactive while the bitmap
    // is decoded off the main thread.
    const inner = (
      <span className={cn(base, className)} {...rest}>
        <Image
          src={src}
          alt={label}
          rounded="full"
          lazy={false}
          {...(srcSet !== undefined ? { srcSet } : {})}
          {...(sizes !== undefined ? { sizes } : {})}
          className="h-full w-full"
          fallbackInitials={avatarInitials(name)}
        />
      </span>
    );
    return status ? (
      <span
        className="relative inline-flex"
        data-section="avatar-root"
        aria-label={composedLabel}
      >
        {inner}
        {statusOverlay}
      </span>
    ) : (
      inner
    );
  }

  const initialsNode = (
    <span
      role="img"
      aria-label={composedLabel}
      data-section="avatar-initials"
      className={cn(base, avatarColorClass(name), className)}
    >
      {avatarInitials(name)}
    </span>
  );
  return status ? (
    <span className="relative inline-flex" data-section="avatar-root">
      {initialsNode}
      {statusOverlay}
    </span>
  ) : (
    initialsNode
  );
}
