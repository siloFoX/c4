import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  ChangeEvent,
  FocusEvent as ReactFocusEvent,
  ForwardedRef,
  KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '../../lib/cn';

// (v1.11.422, TODO 11.404) SearchInput primitive.
//
// Input with:
//   - Search icon (left).
//   - Clear button (right, when value is non-empty).
//   - Debounced onChange (configurable; 0 = immediate).
//   - Optional keyboard shortcut display (`shortcut: "Cmd+K"`).
//   - Optional recent-searches dropdown (`recentSearches: string[]`)
//     with ArrowUp / ArrowDown / Enter keyboard navigation and a
//     filterable substring match against the current query.
//   - onSubmit fires on Enter (without a highlighted recent
//     entry).
//
// Reference: /root/c4/arps-design-system-v1/.

export interface SearchInputProps {
  value?: string;
  defaultValue?: string;
  onChange?: (next: string) => void;
  debounceMs?: number;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  inputClassName?: string;
  showClearButton?: boolean;
  clearLabel?: string;
  shortcut?: string;
  recentSearches?: string[];
  onSelectRecent?: (q: string) => void;
  maxRecent?: number;
  onSubmit?: (q: string) => void;
  disabled?: boolean;
  readOnly?: boolean;
  autoFocus?: boolean;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export function filterRecentSearches(
  recents: ReadonlyArray<string>,
  query: string,
  max: number,
): string[] {
  const trimmed = query.trim().toLowerCase();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of recents) {
    if (r.trim() === '') continue;
    if (seen.has(r)) continue;
    seen.add(r);
    if (trimmed === '' || r.toLowerCase().includes(trimmed)) {
      out.push(r);
    }
    if (out.length >= max) break;
  }
  return out;
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

const DEFAULT_DEBOUNCE_MS = 200;
const DEFAULT_MAX_RECENT = 8;

export const SearchInput = forwardRef(function SearchInput(
  {
    value,
    defaultValue = '',
    onChange,
    debounceMs = DEFAULT_DEBOUNCE_MS,
    placeholder = 'Search...',
    ariaLabel = 'Search',
    className,
    inputClassName,
    showClearButton = true,
    clearLabel = 'Clear search',
    shortcut,
    recentSearches,
    onSelectRecent,
    maxRecent = DEFAULT_MAX_RECENT,
    onSubmit,
    disabled = false,
    readOnly = false,
    autoFocus = false,
  }: SearchInputProps,
  ref: ForwardedRef<HTMLInputElement>,
) {
  const isControlled = value !== undefined;
  const [internal, setInternal] = useState<string>(defaultValue);
  const effective = isControlled ? (value ?? '') : internal;

  const onChangeRef = useRef(onChange);
  const onSelectRecentRef = useRef(onSelectRecent);
  const onSubmitRef = useRef(onSubmit);
  useEffect(() => {
    onChangeRef.current = onChange;
    onSelectRecentRef.current = onSelectRecent;
    onSubmitRef.current = onSubmit;
  }, [onChange, onSelectRecent, onSubmit]);

  // Debounced onChange. We always reflect typing into local state
  // synchronously so the input feels responsive; the *external*
  // callback is what gets debounced.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fireExternal = useCallback(
    (next: string) => {
      const handler = onChangeRef.current;
      if (!handler) return;
      if (debounceMs <= 0 || !Number.isFinite(debounceMs)) {
        handler(next);
        return;
      }
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        handler(next);
        timerRef.current = null;
      }, debounceMs);
    },
    [debounceMs],
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const next = event.target.value;
      if (!isControlled) setInternal(next);
      fireExternal(next);
    },
    [isControlled, fireExternal],
  );

  const handleClear = useCallback(() => {
    if (disabled || readOnly) return;
    if (!isControlled) setInternal('');
    // Clear emits immediately, bypassing the debounce so the
    // caller knows the field is empty without delay.
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    onChangeRef.current?.('');
    inputRef.current?.focus();
  }, [disabled, readOnly, isControlled]);

  // --- Recent searches dropdown ---------------------------------
  const recents = recentSearches ?? [];
  const filteredRecents = useMemo(
    () => filterRecentSearches(recents, effective, maxRecent),
    [recents, effective, maxRecent],
  );

  const [focused, setFocused] = useState<boolean>(false);
  const [highlightIdx, setHighlightIdx] = useState<number>(-1);

  const showDropdown =
    focused &&
    filteredRecents.length > 0 &&
    !disabled &&
    !readOnly;

  const inputRef = useRef<HTMLInputElement | null>(null);
  const setRefs = useCallback(
    (el: HTMLInputElement | null) => {
      inputRef.current = el;
      if (typeof ref === 'function') ref(el);
      else if (ref) ref.current = el;
    },
    [ref],
  );

  const handleFocus = useCallback(
    (_event: ReactFocusEvent<HTMLInputElement>) => {
      setFocused(true);
      setHighlightIdx(-1);
    },
    [],
  );

  // Blur is delayed slightly so a click on a dropdown row lands
  // before the dropdown unmounts. The pointer-down handler on the
  // dropdown itself also calls preventDefault.
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleBlur = useCallback(() => {
    blurTimerRef.current = setTimeout(() => {
      setFocused(false);
      setHighlightIdx(-1);
    }, 100);
  }, []);
  useEffect(() => {
    return () => {
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    };
  }, []);

  const selectRecent = useCallback(
    (entry: string) => {
      if (!isControlled) setInternal(entry);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      onChangeRef.current?.(entry);
      onSelectRecentRef.current?.(entry);
      setFocused(false);
      setHighlightIdx(-1);
    },
    [isControlled],
  );

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'ArrowDown' && filteredRecents.length > 0) {
        event.preventDefault();
        setHighlightIdx((prev) =>
          prev + 1 >= filteredRecents.length ? 0 : prev + 1,
        );
        return;
      }
      if (event.key === 'ArrowUp' && filteredRecents.length > 0) {
        event.preventDefault();
        setHighlightIdx((prev) =>
          prev <= 0 ? filteredRecents.length - 1 : prev - 1,
        );
        return;
      }
      if (event.key === 'Escape') {
        if (filteredRecents.length > 0 && focused) {
          event.preventDefault();
          setFocused(false);
          setHighlightIdx(-1);
        }
        return;
      }
      if (event.key === 'Enter') {
        if (
          highlightIdx >= 0 &&
          highlightIdx < filteredRecents.length
        ) {
          event.preventDefault();
          const pick = filteredRecents[highlightIdx];
          if (pick !== undefined) selectRecent(pick);
        } else {
          // Fire onSubmit with the current query.
          if (onSubmitRef.current) {
            event.preventDefault();
            // Cancel pending debounce so submit sees the latest.
            if (timerRef.current) {
              clearTimeout(timerRef.current);
              timerRef.current = null;
            }
            onChangeRef.current?.(effective);
            onSubmitRef.current(effective);
          }
        }
      }
    },
    [filteredRecents, highlightIdx, focused, effective, selectRecent],
  );

  const hasValue = effective.length > 0;

  return (
    <div
      data-section="search-input"
      data-has-value={hasValue ? 'true' : 'false'}
      data-focused={focused ? 'true' : 'false'}
      data-disabled={disabled ? 'true' : 'false'}
      data-read-only={readOnly ? 'true' : 'false'}
      className={cn(
        'relative flex items-center rounded-md border border-border bg-background text-sm text-foreground',
        disabled && 'cursor-not-allowed opacity-60',
        className,
      )}
    >
      <span
        aria-hidden="true"
        data-section="search-input-icon"
        className="pointer-events-none flex h-9 w-9 shrink-0 items-center justify-center text-muted-foreground"
      >
        <Search className="h-4 w-4" />
      </span>
      <input
        ref={setRefs}
        type="search"
        role="searchbox"
        value={effective}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-autocomplete={
          filteredRecents.length > 0 ? 'list' : undefined
        }
        aria-expanded={showDropdown ? true : undefined}
        autoFocus={autoFocus}
        disabled={disabled}
        readOnly={readOnly}
        data-section="search-input-input"
        className={cn(
          'min-w-0 flex-1 bg-transparent py-1.5 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed',
          inputClassName,
        )}
      />
      {showClearButton && hasValue && !disabled && !readOnly ? (
        <button
          type="button"
          onClick={handleClear}
          aria-label={clearLabel}
          data-section="search-input-clear"
          className="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
      {shortcut && !hasValue && !focused ? (
        <kbd
          data-section="search-input-shortcut"
          className="mr-2 hidden rounded border border-border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground sm:inline-flex"
        >
          {shortcut}
        </kbd>
      ) : null}
      {showDropdown ? (
        <ul
          role="listbox"
          aria-label="Recent searches"
          data-section="search-input-recent"
          onMouseDown={(e) => {
            // Keep input focus when clicking a recent row.
            e.preventDefault();
          }}
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-md border border-border bg-popover py-1 shadow-md"
        >
          {filteredRecents.map((entry, idx) => {
            const active = idx === highlightIdx;
            return (
              <li
                key={`${entry}-${idx}`}
                role="option"
                aria-selected={active}
                data-section="search-input-recent-item"
                data-recent-index={idx}
                data-active={active ? 'true' : 'false'}
                onClick={() => selectRecent(entry)}
                onMouseEnter={() => setHighlightIdx(idx)}
                className={cn(
                  'cursor-pointer px-3 py-1 text-sm hover:bg-muted',
                  active && 'bg-muted',
                )}
              >
                {entry}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
});

SearchInput.displayName = 'SearchInput';
