import { forwardRef, useEffect, useRef, useState } from 'react';
import type { InputHTMLAttributes } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useDebouncedCallback } from '../../hooks/use-debounce';

export interface SearchBarProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'value' | 'defaultValue' | 'onChange' | 'size' | 'type'
  > {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onDebouncedChange?: (value: string) => void;
  debounceMs?: number;
  placeholder?: string;
  size?: 'sm' | 'md';
  disabled?: boolean;
  ariaLabel?: string;
  clearable?: boolean;
  onClear?: () => void;
  className?: string;
  inputClassName?: string;
}

const SIZE_CLASSES: Record<'sm' | 'md', string> = {
  sm: 'h-8 pl-8 pr-8 text-sm',
  md: 'h-10 min-h-[44px] sm:min-h-0 pl-9 pr-9 text-sm',
};

const ICON_SIZE: Record<'sm' | 'md', string> = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
};

const ICON_LEFT_POS: Record<'sm' | 'md', string> = {
  sm: 'left-2.5',
  md: 'left-3',
};

const ICON_RIGHT_POS: Record<'sm' | 'md', string> = {
  sm: 'right-1.5',
  md: 'right-2',
};

const BASE_INPUT =
  'w-full rounded-md border border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50';

export const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(
  (
    {
      value,
      defaultValue,
      onChange,
      onDebouncedChange,
      debounceMs = 200,
      placeholder = 'Search...',
      size = 'md',
      disabled,
      ariaLabel,
      clearable = true,
      onClear,
      className,
      inputClassName,
      ...rest
    },
    ref,
  ) => {
    const isControlled = value !== undefined;
    const [internal, setInternal] = useState<string>(defaultValue ?? '');
    const current = isControlled ? (value as string) : internal;
    const userInteractedRef = useRef(false);

    // (v1.11.230) Inline setTimeout replaced by
    // useDebouncedCallback. Same trailing-edge "latest
    // value wins" + unmount cancellation; the SSR-skip
    // ref logic still gates the very first emit.
    const debouncedEmit = useDebouncedCallback((next: string) => {
      onDebouncedChange?.(next);
    }, debounceMs);
    useEffect(() => {
      if (!onDebouncedChange) return;
      if (!userInteractedRef.current && current === (defaultValue ?? '')) {
        return;
      }
      debouncedEmit(current as never);
    }, [current, onDebouncedChange, defaultValue, debouncedEmit]);

    const emit = (next: string) => {
      userInteractedRef.current = true;
      if (!isControlled) setInternal(next);
      onChange?.(next);
    };

    const handleClear = () => {
      userInteractedRef.current = true;
      if (!isControlled) setInternal('');
      onChange?.('');
      onClear?.();
    };

    const showClear = clearable && !disabled && current.length > 0;
    const iconSize = ICON_SIZE[size];

    return (
      <div
        role="search"
        className={cn('relative w-full', className)}
      >
        <Search
          aria-hidden
          className={cn(
            'pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground',
            ICON_LEFT_POS[size],
            iconSize,
          )}
        />
        <input
          ref={ref}
          type="search"
          value={current}
          disabled={disabled}
          placeholder={placeholder}
          aria-label={ariaLabel}
          onChange={(e) => emit(e.target.value)}
          className={cn(BASE_INPUT, SIZE_CLASSES[size], inputClassName)}
          {...rest}
        />
        {showClear ? (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear search"
            className={cn(
              'absolute top-1/2 inline-flex -translate-y-1/2 items-center justify-center rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              ICON_RIGHT_POS[size],
            )}
          >
            <X className={iconSize} aria-hidden />
          </button>
        ) : null}
      </div>
    );
  },
);
SearchBar.displayName = 'SearchBar';
