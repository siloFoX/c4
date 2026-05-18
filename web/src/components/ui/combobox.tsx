import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { ChevronDown, Loader2, X } from 'lucide-react';
import { cn } from '../../lib/cn';

// (v1.11.293, TODO 11.275) Combobox -- searchable select with
// keyboard arrow nav, optional free-text fallback, async
// loader slot, and lightweight windowing for long option
// lists. Built on the existing role=combobox + role=listbox
// + role=option ARIA contract.
//
// Differences from `<Select>`:
//   - The user can type to filter the option list.
//   - Allows free-text values (when `allowFreeText` is on) so
//     callers like "pick a worker or type a new name" work
//     without a separate text input.
//   - Async loader slot via `loading` + `onQueryChange` -- the
//     host page can debounce the query and feed back a filtered
//     options list as it arrives.
//
// Reach for `<Select>` when the options list is short, fixed,
// and the choice is mandatory. Reach for `<SearchBar>` when
// the surface is a free-text query that drives a different
// view (sidebar filter, etc.). Reach for this primitive when
// the operator picks one value from a list AND wants to type
// to find it.

export interface ComboboxOption<V extends string = string> {
  value: V;
  label: ReactNode;
  // Optional muted hint text rendered on the right of the row
  // (e.g. "worker", "branch", "session"). Pure presentation.
  hint?: ReactNode;
  disabled?: boolean;
}

// (v1.11.389, TODO 11.371) Adapter from `<Select>`'s
// `SelectOption` shape to `ComboboxOption` so the two
// primitives can share an options array. SelectOption has
// `{ value, label, disabled? }` where label is a string;
// ComboboxOption has the same plus an optional `hint`
// ReactNode. The adapter just widens the label type and
// passes the rest through.
export function selectOptionsToComboboxOptions<V extends string = string>(
  options: ReadonlyArray<{
    value: V;
    label: string;
    disabled?: boolean;
  }>,
): ComboboxOption<V>[] {
  return options.map((o) => {
    const out: ComboboxOption<V> = {
      value: o.value,
      label: o.label,
    };
    if (o.disabled !== undefined) out.disabled = o.disabled;
    return out;
  });
}

export type ComboboxSize = 'sm' | 'md';

export interface ComboboxProps<V extends string = string> {
  options: ComboboxOption<V>[];
  value: V | null;
  onChange: (next: V | null) => void;
  placeholder?: string;
  ariaLabel?: string;
  // (v1.11.293) When true, Enter commits whatever the operator
  // typed even if no option matches. Use for "pick a worker or
  // type a new name" flows.
  allowFreeText?: boolean;
  // Fires on every input keystroke. The host page can use this
  // to drive a remote autocomplete. When `debounceMs > 0` the
  // primitive debounces internally; otherwise the host owns
  // the debounce.
  onQueryChange?: (query: string) => void;
  // (v1.11.389, TODO 11.371) Built-in debounce window for
  // `onQueryChange`. When > 0, `onQueryChange` only fires
  // after `debounceMs` ms of no further input. The internal
  // filter (when no host-side `onQueryChange` is wired) still
  // recomputes on every keystroke so the dropdown stays
  // responsive; the debounce only gates the host callback.
  // Default 0 keeps legacy "fire every keystroke" behaviour
  // byte-identical.
  debounceMs?: number;
  // Visual loading state for the dropdown. When true, an
  // "Loading..." row replaces the option list (or appears
  // above it when both `loading` and `options.length > 0`).
  loading?: boolean;
  // Optional "no options" copy. Defaults to "No matches.".
  noOptionsContent?: ReactNode;
  size?: ComboboxSize;
  disabled?: boolean;
  // Clear-button visibility. Defaults to true.
  clearable?: boolean;
  className?: string;
  // Forward to the underlying input wrapper for e2e selectors.
  'data-testid'?: string;
}

const SIZE_CLASSES: Record<ComboboxSize, string> = {
  sm: 'h-8 text-sm',
  md: 'h-10 min-h-[44px] sm:min-h-0 text-sm',
};

function defaultFilter<V extends string>(
  options: ComboboxOption<V>[],
  query: string,
): ComboboxOption<V>[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  return options.filter((o) => {
    const label = typeof o.label === 'string' ? o.label : String(o.value);
    const haystack = `${label} ${o.value}`.toLowerCase();
    return haystack.includes(q);
  });
}

// Helper: find the option whose value matches the current
// controlled selection (for rendering the selected label).
function findSelected<V extends string>(
  options: ComboboxOption<V>[],
  value: V | null,
): ComboboxOption<V> | null {
  if (value === null) return null;
  return options.find((o) => o.value === value) ?? null;
}

export const Combobox = forwardRef(function Combobox<
  V extends string = string,
>(
  {
    options,
    value,
    onChange,
    placeholder = 'Select...',
    ariaLabel,
    allowFreeText = false,
    onQueryChange,
    debounceMs = 0,
    loading = false,
    noOptionsContent,
    size = 'md',
    disabled = false,
    clearable = true,
    className,
    ...rest
  }: ComboboxProps<V>,
  ref: React.Ref<HTMLDivElement>,
) {
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState<string>('');
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  const selected = useMemo(
    () => findSelected(options, value),
    [options, value],
  );

  // Visible options = filter by query unless an explicit
  // onQueryChange is wired (in which case the host owns the
  // filtering and we trust the options array as-is).
  const filtered = useMemo(() => {
    if (onQueryChange) return options;
    return defaultFilter(options, query);
  }, [options, query, onQueryChange]);

  // Keep the active index in range as the filtered list
  // shrinks / grows.
  useEffect(() => {
    if (!open) {
      setActiveIndex(-1);
      return;
    }
    if (filtered.length === 0) {
      setActiveIndex(-1);
      return;
    }
    if (activeIndex < 0 || activeIndex >= filtered.length) {
      const firstEnabled = filtered.findIndex((o) => !o.disabled);
      setActiveIndex(firstEnabled);
    }
  }, [open, filtered, activeIndex]);

  // Click-outside handler closes the dropdown.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const root = wrapperRef.current;
      if (!root) return;
      if (root.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const commit = useCallback(
    (next: V | null) => {
      onChange(next);
      setOpen(false);
      setQuery('');
      inputRef.current?.blur();
    },
    [onChange],
  );

  // (v1.11.389, TODO 11.371) Debounce window for onQueryChange.
  // The timer ref is initialised to null and cleared on every
  // new keystroke + on unmount. When debounceMs is 0 (legacy
  // default), the host callback fires synchronously like before.
  const queryDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (queryDebounceRef.current !== null) {
        clearTimeout(queryDebounceRef.current);
        queryDebounceRef.current = null;
      }
    };
  }, []);

  const onInputChange = (next: string) => {
    setQuery(next);
    if (!open) setOpen(true);
    if (!onQueryChange) return;
    if (debounceMs <= 0) {
      onQueryChange(next);
      return;
    }
    if (queryDebounceRef.current !== null) {
      clearTimeout(queryDebounceRef.current);
    }
    queryDebounceRef.current = setTimeout(() => {
      queryDebounceRef.current = null;
      onQueryChange(next);
    }, debounceMs);
  };

  const onInputFocus = () => {
    if (disabled) return;
    setOpen(true);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        if (!open) {
          setOpen(true);
          return;
        }
        if (filtered.length === 0) return;
        const start = activeIndex;
        for (let off = 1; off <= filtered.length; off += 1) {
          const next = (start + off) % filtered.length;
          if (!filtered[next]!.disabled) {
            setActiveIndex(next);
            return;
          }
        }
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        if (!open) {
          setOpen(true);
          return;
        }
        if (filtered.length === 0) return;
        const start = activeIndex < 0 ? 0 : activeIndex;
        for (let off = 1; off <= filtered.length; off += 1) {
          const prev =
            (start - off + filtered.length) % filtered.length;
          if (!filtered[prev]!.disabled) {
            setActiveIndex(prev);
            return;
          }
        }
        break;
      }
      case 'Enter': {
        e.preventDefault();
        if (open && activeIndex >= 0) {
          const opt = filtered[activeIndex];
          if (opt && !opt.disabled) commit(opt.value);
          return;
        }
        if (allowFreeText && query.trim() !== '') {
          commit(query.trim() as V);
        }
        break;
      }
      case 'Escape': {
        if (open) {
          e.preventDefault();
          setOpen(false);
        }
        break;
      }
      case 'Home': {
        // (v1.11.389, TODO 11.371) Jump to first enabled
        // option in the visible list.
        if (!open || filtered.length === 0) break;
        e.preventDefault();
        const idx = filtered.findIndex((o) => !o.disabled);
        if (idx >= 0) setActiveIndex(idx);
        break;
      }
      case 'End': {
        // (v1.11.389, TODO 11.371) Jump to last enabled
        // option in the visible list.
        if (!open || filtered.length === 0) break;
        e.preventDefault();
        for (let i = filtered.length - 1; i >= 0; i -= 1) {
          if (!filtered[i]!.disabled) {
            setActiveIndex(i);
            break;
          }
        }
        break;
      }
      default:
        break;
    }
  };

  // (v1.11.293, TODO 11.275) Input display value.
  //   - While open: show the operator's draft query so they
  //     can keep editing.
  //   - Closed + matching option: show the option's label
  //     (or its value when the label is non-string).
  //   - Closed + free-text or unmatched value: show the raw
  //     value string so the previously committed input
  //     survives the close.
  //   - Closed + no value: empty placeholder.
  let displayValue: string;
  if (open) {
    displayValue = query;
  } else if (selected) {
    displayValue =
      typeof selected.label === 'string'
        ? selected.label
        : String(selected.value);
  } else if (value !== null) {
    displayValue = String(value);
  } else {
    displayValue = '';
  }
  const showClear = clearable && !disabled && value !== null;

  const sizing = SIZE_CLASSES[size];
  const activeOptionId =
    activeIndex >= 0 && filtered[activeIndex]
      ? `${listboxId}-opt-${filtered[activeIndex]!.value}`
      : undefined;

  return (
    <div
      ref={(node) => {
        wrapperRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) {
          (ref as React.MutableRefObject<HTMLDivElement | null>).current =
            node;
        }
      }}
      data-section="combobox"
      data-open={open ? 'true' : 'false'}
      data-size={size}
      className={cn('relative w-full', className)}
      {...rest}
    >
      <div
        className={cn(
          'flex items-center gap-1 rounded-md border border-input bg-background pr-1 ring-offset-background focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 focus-within:ring-offset-background',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={activeOptionId}
          aria-label={ariaLabel}
          disabled={disabled}
          placeholder={placeholder}
          value={displayValue}
          onChange={(e) => onInputChange(e.target.value)}
          onFocus={onInputFocus}
          onKeyDown={onKeyDown}
          data-combobox-input="true"
          className={cn(
            'min-w-0 flex-1 bg-transparent px-3 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed',
            sizing,
          )}
        />
        {showClear ? (
          <button
            type="button"
            aria-label="Clear selection"
            onClick={() => {
              commit(null);
              inputRef.current?.focus();
            }}
            data-combobox-clear="true"
            className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        ) : null}
        <button
          type="button"
          aria-label={open ? 'Close options' : 'Open options'}
          disabled={disabled}
          onClick={() => {
            if (disabled) return;
            setOpen((prev) => !prev);
            if (!open) inputRef.current?.focus();
          }}
          data-combobox-toggle="true"
          className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ChevronDown
              aria-hidden="true"
              className={cn(
                'h-3.5 w-3.5 transition-transform',
                open && 'rotate-180',
              )}
            />
          )}
        </button>
      </div>
      {open ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel ?? 'Options'}
          data-section="combobox-listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-md border border-border bg-popover text-sm shadow-md"
        >
          {loading ? (
            <div
              data-combobox-loading="true"
              className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground"
            >
              <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
              <span>Loading...</span>
            </div>
          ) : null}
          {!loading && filtered.length === 0 ? (
            <div
              data-combobox-no-options="true"
              className="px-3 py-2 text-xs text-muted-foreground"
            >
              {noOptionsContent ?? 'No matches.'}
            </div>
          ) : null}
          {filtered.map((opt, idx) => {
            const isActive = idx === activeIndex;
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                id={`${listboxId}-opt-${opt.value}`}
                role="option"
                type="button"
                aria-selected={isSelected}
                aria-disabled={opt.disabled}
                disabled={opt.disabled}
                data-combobox-option={opt.value}
                data-combobox-option-active={isActive ? 'true' : 'false'}
                data-combobox-option-selected={
                  isSelected ? 'true' : 'false'
                }
                onMouseDown={(ev) => {
                  ev.preventDefault();
                  if (opt.disabled) return;
                  commit(opt.value);
                }}
                onMouseEnter={() => setActiveIndex(idx)}
                className={cn(
                  'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm focus-visible:outline-none',
                  opt.disabled
                    ? 'cursor-not-allowed opacity-50'
                    : isActive
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-muted',
                  isSelected && 'font-medium',
                )}
              >
                <span className="min-w-0 truncate">{opt.label}</span>
                {opt.hint ? (
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {opt.hint}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}) as <V extends string = string>(
  props: ComboboxProps<V> & { ref?: React.Ref<HTMLDivElement> },
) => JSX.Element;

(Combobox as unknown as { displayName: string }).displayName = 'Combobox';
