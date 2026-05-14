import { forwardRef } from 'react';
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  HTMLAttributes,
  ReactNode,
  Ref,
} from 'react';
import { cn } from '../../lib/cn';

export type ListItemSize = 'sm' | 'md';
export type ListItemDescriptionLines = 1 | 2;

export interface ListItemProps {
  leading?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  href?: string;
  size?: ListItemSize;
  descriptionLines?: ListItemDescriptionLines;
  className?: string;
}

const SIZE_CLS: Record<ListItemSize, { padding: string; title: string; description: string }> = {
  sm: { padding: 'px-2 py-1.5', title: 'text-xs', description: 'text-[11px]' },
  md: { padding: 'px-3 py-2', title: 'text-sm', description: 'text-xs' },
};

const CLAMP_CLS: Record<ListItemDescriptionLines, string> = {
  1: 'line-clamp-1',
  2: 'line-clamp-2',
};

function rootClasses(
  size: ListItemSize,
  interactive: boolean,
  active: boolean | undefined,
  disabled: boolean | undefined,
  className: string | undefined,
) {
  return cn(
    'flex w-full items-center gap-3 rounded-md text-left transition-colors',
    SIZE_CLS[size].padding,
    interactive && !disabled && 'cursor-pointer hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
    active && 'bg-muted ring-1 ring-primary/30',
    disabled && 'pointer-events-none opacity-50',
    className,
  );
}

interface InnerProps {
  leading?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
  size: ListItemSize;
  descriptionLines: ListItemDescriptionLines;
}

function Inner({ leading, title, description, trailing, size, descriptionLines }: InnerProps) {
  return (
    <>
      {leading !== undefined ? (
        <span className="flex shrink-0 items-center justify-center" aria-hidden={false}>
          {leading}
        </span>
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cn('min-w-0 truncate font-medium text-foreground', SIZE_CLS[size].title)}>
          {title}
        </span>
        {description !== undefined && description !== null && description !== false ? (
          <span
            className={cn(
              'min-w-0 text-muted-foreground',
              SIZE_CLS[size].description,
              CLAMP_CLS[descriptionLines],
            )}
          >
            {description}
          </span>
        ) : null}
      </span>
      {trailing !== undefined ? (
        <span className="ml-auto flex shrink-0 items-center gap-1">{trailing}</span>
      ) : null}
    </>
  );
}

type AnchorAttrs = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof ListItemProps>;
type ButtonAttrs = Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof ListItemProps>;
type DivAttrs = Omit<HTMLAttributes<HTMLDivElement>, keyof ListItemProps>;

export type ListItemElement = HTMLAnchorElement | HTMLButtonElement | HTMLDivElement;

export const ListItem = forwardRef<ListItemElement, ListItemProps & (AnchorAttrs | ButtonAttrs | DivAttrs)>(
  function ListItem(props, ref) {
    const {
      leading,
      title,
      description,
      trailing,
      onClick,
      active,
      disabled,
      href,
      size = 'md',
      descriptionLines = 2,
      className,
      ...rest
    } = props;

    const inner = (
      <Inner
        leading={leading}
        title={title}
        description={description}
        trailing={trailing}
        size={size}
        descriptionLines={descriptionLines}
      />
    );

    if (href) {
      const interactive = !disabled;
      return (
        <a
          ref={ref as Ref<HTMLAnchorElement>}
          href={disabled ? undefined : href}
          aria-disabled={disabled || undefined}
          aria-current={active ? 'true' : undefined}
          className={rootClasses(size, interactive, active, disabled, className)}
          {...(rest as AnchorAttrs)}
        >
          {inner}
        </a>
      );
    }

    if (onClick) {
      return (
        <button
          ref={ref as Ref<HTMLButtonElement>}
          type="button"
          onClick={disabled ? undefined : onClick}
          disabled={disabled}
          aria-disabled={disabled || undefined}
          aria-current={active ? 'true' : undefined}
          className={rootClasses(size, true, active, disabled, className)}
          {...(rest as ButtonAttrs)}
        >
          {inner}
        </button>
      );
    }

    return (
      <div
        ref={ref as Ref<HTMLDivElement>}
        role="listitem"
        aria-disabled={disabled || undefined}
        aria-current={active ? 'true' : undefined}
        className={rootClasses(size, false, active, disabled, className)}
        {...(rest as DivAttrs)}
      >
        {inner}
      </div>
    );
  },
);
ListItem.displayName = 'ListItem';
