import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import type { InputHTMLAttributes, KeyboardEvent, ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useDebouncedCallback } from '../../hooks/use-debounce';

// (v1.11.286, TODO 11.268) SearchBarSuggestion -- one row of the
// autocomplete dropdown. The `id` doubles as the rendered key
// and the `data-search-suggestion=<id>` selector for e2e.
export interface SearchBarSuggestion {
  id: string;
  label: ReactNode;
  // Optional muted hint text rendered on the right of the row
  // (e.g. "branch", "worker", "session"). Pure presentation.
  hint?: ReactNode;
  disabled?: boolean;
  onSelect: () => void;
}

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
  // (v1.11.286, TODO 11.268) Optional autocomplete dropdown.
  // When `suggestions` is set and non-empty, a dropdown opens
  // beneath the input on focus + has-non-empty-value. Items are
  // navigable via ArrowDown / ArrowUp / Enter; Escape closes.
  // `suggestions` can be the empty array to opt out of the
  // dropdown for a given query (e.g. when there are no matches
  // and the caller wants the "no results" affordance handled by
  // the page rather than the primitive).
  suggestions?: SearchBarSuggestion[];
  // Controlled-open override. When unset the primitive decides
  // ("focused + non-empty value + suggestions.length > 0").
  suggestionsOpen?: boolean;
  onSuggestionsOpenChange?: (open: boolean) => void;
  // Optional empty-state node rendered inside the dropdown
  // shell when `suggestions` is set but empty. The dropdown
  // stays open so the operator can see the empty message.
  noSuggestionsContent?: ReactNode;
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
      suggestions,
      suggestionsOpen: suggestionsOpenProp,
      onSuggestionsOpenChange,
      noSuggestionsContent,
      ...rest
    },
    ref,
  ) => {
    const isControlled = value !== undefined;
    const [internal, setInternal] = useState<string>(defaultValue ?? '');
    const current = isControlled ? (value as string) : internal;
    const userInteractedRef = useRef(false);
    // (v1.11.286, TODO 11.268) Autocomplete state.
    const [focused, setFocused] = useState(false);
    const [activeIndex, setActiveIndex] = useState<number>(-1);
    const wrapperRef = useRef<HTMLDivElement | null>(null);
    const listboxId = useId();
    const hasSuggestionsProp = suggestions !== undefined;
    const safeSuggestions = suggestions ?? [];
    const enabledSuggestions = safeSuggestions.filter((s) => !s.disabled);
    const autoOpen =
      hasSuggestionsProp &&
      focused &&
      current.length > 0 &&
      (safeSuggestions.length > 0 || noSuggestionsContent !== undefined);
    const suggestionsOpen =
      suggestionsOpenProp !== undefined ? suggestionsOpenProp : autoOpen;

    // Keep the open-state callback in sync. Skip the initial
    // mount so callers don't get a spurious `false` echo on
    // first render.
    const lastOpenRef = useRef<boolean | null>(null);
    useEffect(() => {
      if (lastOpenRef.current === suggestionsOpen) return;
      lastOpenRef.current = suggestionsOpen;
      onSuggestionsOpenChange?.(suggestionsOpen);
    }, [suggestionsOpen, onSuggestionsOpenChange]);

    // Reset highlight when the suggestion list changes shape.
    useEffect(() => {
      if (!suggestionsOpen) {
        setActiveIndex(-1);
        return;
      }
      // Snap to first enabled when the list opens; otherwise
      // clamp to the new bounds.
      if (activeIndex < 0 && enabledSuggestions.length > 0) {
        setActiveIndex(safeSuggestions.findIndex((s) => !s.disabled));
      } else if (activeIndex >= safeSuggestions.length) {
        setActiveIndex(-1);
      }
    }, [
      suggestionsOpen,
      safeSuggestions.length,
      enabledSuggestions.length,
      activeIndex,
      safeSuggestions,
    ]);

    // Click-outside closes the dropdown (only relevant when
    // the focused state has not naturally cleared yet).
    useEffect(() => {
      if (!suggestionsOpen) return;
      const onDocPointerDown = (e: PointerEvent) => {
        const root = wrapperRef.current;
        if (!root) return;
        if (root.contains(e.target as Node)) return;
        setFocused(false);
      };
      document.addEventListener('pointerdown', onDocPointerDown);
      return () =>
        document.removeEventListener('pointerdown', onDocPointerDown);
    }, [suggestionsOpen]);

    const selectAt = useCallback(
      (idx: number) => {
        const s = safeSuggestions[idx];
        if (!s || s.disabled) return;
        s.onSelect();
        setFocused(false);
      },
      [safeSuggestions],
    );

    const handleKeyDown = useCallback(
      (e: KeyboardEvent<HTMLInputElement>) => {
        if (!suggestionsOpen || safeSuggestions.length === 0) return;
        switch (e.key) {
          case 'ArrowDown': {
            e.preventDefault();
            const start = activeIndex;
            for (let off = 1; off <= safeSuggestions.length; off += 1) {
              const next = (start + off) % safeSuggestions.length;
              const cand = safeSuggestions[next];
              if (cand && !cand.disabled) {
                setActiveIndex(next);
                return;
              }
            }
            break;
          }
          case 'ArrowUp': {
            e.preventDefault();
            const start = activeIndex < 0 ? 0 : activeIndex;
            for (let off = 1; off <= safeSuggestions.length; off += 1) {
              const prev =
                (start - off + safeSuggestions.length) %
                safeSuggestions.length;
              const cand = safeSuggestions[prev];
              if (cand && !cand.disabled) {
                setActiveIndex(prev);
                return;
              }
            }
            break;
          }
          case 'Enter': {
            if (activeIndex >= 0) {
              e.preventDefault();
              selectAt(activeIndex);
            }
            break;
          }
          case 'Escape': {
            e.preventDefault();
            setFocused(false);
            break;
          }
          default:
            break;
        }
      },
      [activeIndex, safeSuggestions, selectAt, suggestionsOpen],
    );

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

    const activeOptionId =
      activeIndex >= 0 && safeSuggestions[activeIndex]
        ? `${listboxId}-opt-${safeSuggestions[activeIndex]!.id}`
        : undefined;

    return (
      <div
        ref={wrapperRef}
        role="search"
        className={cn('relative w-full', className)}
        data-section="search-bar"
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
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            // Defer blur so a click on a suggestion row fires
            // before the dropdown un-mounts. The pointerdown
            // selection path covers the actual close.
            setTimeout(() => setFocused(false), 100);
            rest.onBlur?.(e);
          }}
          onKeyDown={(e) => {
            handleKeyDown(e);
            rest.onKeyDown?.(e);
          }}
          {...(hasSuggestionsProp
            ? {
                role: 'combobox',
                'aria-autocomplete': 'list' as const,
                'aria-expanded': suggestionsOpen,
                'aria-controls': listboxId,
                'aria-activedescendant': activeOptionId,
              }
            : {})}
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
        {hasSuggestionsProp && suggestionsOpen ? (
          <div
            id={listboxId}
            role="listbox"
            aria-label={ariaLabel ?? 'Search suggestions'}
            data-section="search-bar-suggestions"
            className="absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-md border border-border bg-popover text-sm shadow-md"
          >
            {safeSuggestions.length === 0 && noSuggestionsContent ? (
              <div
                data-section="search-bar-no-suggestions"
                className="px-3 py-2 text-xs text-muted-foreground"
              >
                {noSuggestionsContent}
              </div>
            ) : null}
            {safeSuggestions.map((s, idx) => {
              const isActive = idx === activeIndex;
              return (
                <button
                  key={s.id}
                  id={`${listboxId}-opt-${s.id}`}
                  role="option"
                  type="button"
                  aria-selected={isActive}
                  disabled={s.disabled}
                  data-search-suggestion={s.id}
                  data-search-suggestion-active={isActive ? 'true' : 'false'}
                  onMouseDown={(ev) => {
                    // Use mousedown so the click commits before
                    // the input loses focus (and the dropdown
                    // un-mounts via the blur timer).
                    ev.preventDefault();
                    selectAt(idx);
                  }}
                  onMouseEnter={() => setActiveIndex(idx)}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm focus-visible:outline-none',
                    s.disabled
                      ? 'cursor-not-allowed opacity-50'
                      : isActive
                        ? 'bg-accent text-accent-foreground'
                        : 'hover:bg-muted',
                  )}
                >
                  <span className="min-w-0 truncate">{s.label}</span>
                  {s.hint ? (
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {s.hint}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  },
);
SearchBar.displayName = 'SearchBar';
