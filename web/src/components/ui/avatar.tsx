import { useState, type ImgHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export type AvatarSize = 'sm' | 'md' | 'lg';

export interface AvatarProps
  extends Omit<ImgHTMLAttributes<HTMLElement>, 'src' | 'alt' | 'className'> {
  name?: string;
  src?: string;
  size?: AvatarSize;
  alt?: string;
  className?: string;
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
  ...rest
}: AvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const label = alt || name || '';
  const showImage = Boolean(src) && !imgFailed;
  const base = cn(
    'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold select-none',
    SIZE_CLASS[size],
  );

  if (showImage) {
    return (
      <span className={cn(base, className)}>
        <img
          src={src}
          alt={label}
          aria-label={label}
          className="h-full w-full object-cover"
          onError={() => setImgFailed(true)}
          {...rest}
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
