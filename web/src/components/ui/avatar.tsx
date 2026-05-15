import { type ImgHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';
import { Image } from './image';

export type AvatarSize = 'sm' | 'md' | 'lg';

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
}

const SIZE_CLASS: Record<AvatarSize, string> = {
  sm: 'h-6 w-6 text-xs',
  md: 'h-8 w-8 text-sm',
  lg: 'h-10 w-10 text-base',
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
  ...rest
}: AvatarProps) {
  const label = alt || name || '';
  const base = cn(
    'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold select-none',
    SIZE_CLASS[size],
  );

  if (src) {
    // Image's underlying <img alt={label}> provides the accessible name
    // via its implicit img role; the outer span stays decorative so
    // existing tests using getByRole('img', { name }) keep pointing at
    // the <img> element. (v1.11.244, TODO 11.226) Forwarding srcSet /
    // sizes lets callers ship a DPR-aware avatar without a wrapping
    // <picture>; Image's decoding="async" + (eager) loading defaults
    // are inherited so the avatar stays interactive while the bitmap
    // is decoded off the main thread.
    return (
      <span className={cn(base, className)} {...rest}>
        <Image
          src={src}
          alt={label}
          rounded="full"
          lazy={false}
          srcSet={srcSet}
          sizes={sizes}
          className="h-full w-full"
          fallbackInitials={avatarInitials(name)}
        />
      </span>
    );
  }

  return (
    <span
      role="img"
      aria-label={label}
      className={cn(base, avatarColorClass(name), className)}
    >
      {avatarInitials(name)}
    </span>
  );
}
