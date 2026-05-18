import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ChangeEvent, KeyboardEvent, ReactNode, SelectHTMLAttributes } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { Label } from './label';
import { cn } from '../../lib/cn';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  ariaLabel?: string;
  // (v1.11.388, TODO 11.370) When true, a small inline `X`
  // button on the trigger resets `value` to ''. The clear
  // button only renders when a non-empty value is selected.
  // Default false preserves the legacy byte-identical trigger.
  clearable?: boolean;
  // (v1.11.388, TODO 11.370) When true, the popup renders a
  // search input above the listbox that filters options by
  // case-insensitive substring match against the label.
  // Default false preserves the legacy byte-identical popup.
  searchable?: boolean;
  // (v1.11.388, TODO 11.370) When set, the search input
  // placeholder uses this string instead of the default
  // "Search...". Only relevant when `searchable=true`.
  searchPlaceholder?: string;
}

// (v1.11.388, TODO 11.370) Case-insensitive substring filter
// used by `searchable` Select + MultiSelect. Pure helper so
// tests can exercise the matcher directly.
export function filterSelectOptions(
  options: SelectOption[],
  query: string,
): SelectOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  return options.filter((opt) => opt.label.toLowerCase().includes(q));
}

const TRIGGER_CLASSES =
  'flex h-10 min-h-[44px] sm:min-h-0 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50';

const TYPEAHEAD_RESET_MS = 500;

function findNextEnabled(
  options: SelectOption[],
  start: number,
  dir: 1 | -1,
): number {
  const len = options.length;
  if (len === 0) return -1;
  let next = start < 0 ? (dir === 1 ? -1 : 0) : start;
  for (let step = 0; step < len; step++) {
    next = (next + dir + len) % len;
    if (!options[next]?.disabled) return next;
  }
  return -1;
}

function firstEnabled(options: SelectOption[]): number {
  for (let i = 0; i < options.length; i++) {
    if (!options[i]?.disabled) return i;
  }
  return -1;
}

function lastEnabled(options: SelectOption[]): number {
  for (let i = options.length - 1; i >= 0; i--) {
    if (!options[i]?.disabled) return i;
  }
  return -1;
}

export const Select = forwardRef<HTMLButtonElement, SelectProps>(
  (
    {
      options,
      value,
      onChange,
      label,
      hint,
      error,
      placeholder,
      disabled,
      id,
      className,
      ariaLabel,
      clearable = false,
      searchable = false,
      searchPlaceholder,
    },
    ref,
  ) => {
    const generatedId = useId();
    const listboxId = useId();
    const hasSlots = label != null || hint != null || error != null;
    const triggerId = id ?? (hasSlots ? generatedId : undefined);
    const hintId = hint != null && triggerId ? `${triggerId}-hint` : undefined;
    const errorId = error != null && triggerId ? `${triggerId}-error` : undefined;
    const describedBy =
      [hintId, errorId].filter(Boolean).join(' ') || undefined;

    const [open, setOpen] = useState(false);
    const [highlight, setHighlight] = useState<number>(-1);
    const [query, setQuery] = useState('');
    const containerRef = useRef<HTMLDivElement | null>(null);
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const listboxRef = useRef<HTMLUListElement | null>(null);
    const searchInputRef = useRef<HTMLInputElement | null>(null);
    const typeAheadRef = useRef<{ buffer: string; timer: number | null }>({
      buffer: '',
      timer: null,
    });

    // (v1.11.388, TODO 11.370) When `searchable=true`,
    // listbox indices reference the filtered list, not the
    // raw `options[]`. The keyboard handlers + commit() use
    // `displayedOptions` so highlight/Home/End behave as the
    // user sees them.
    const displayedOptions = useMemo<SelectOption[]>(
      () => (searchable ? filterSelectOptions(options, query) : options),
      [searchable, options, query],
    );

    const selectedIndex = options.findIndex((o) => o.value === value);
    const selectedOption =
      selectedIndex >= 0 ? options[selectedIndex] : undefined;

    const close = useCallback((opts?: { restoreFocus?: boolean }) => {
      setOpen(false);
      setHighlight(-1);
      // (v1.11.388, TODO 11.370) Reset the search query on close
      // so the next open starts from the full list. Triggers the
      // memo recompute on next render.
      setQuery('');
      if (opts?.restoreFocus) {
        triggerRef.current?.focus();
      }
    }, []);

    const openMenu = useCallback(() => {
      if (disabled) return;
      setOpen(true);
      // Start highlight on the selected option's index in the
      // CURRENT displayedOptions list (which equals raw options
      // when not searching, so this is byte-identical legacy on
      // the unsearched first open).
      const list = searchable
        ? filterSelectOptions(options, '')
        : options;
      const selIdx = list.findIndex((o) => o.value === value);
      const start =
        selIdx >= 0 && !list[selIdx]?.disabled ? selIdx : firstEnabled(list);
      setHighlight(start);
    }, [disabled, options, searchable, value]);

    const toggle = useCallback(() => {
      if (disabled) return;
      if (open) {
        close();
      } else {
        openMenu();
      }
    }, [disabled, open, openMenu, close]);

    const commit = useCallback(
      (idx: number) => {
        const opt = displayedOptions[idx];
        if (!opt || opt.disabled) return;
        onChange(opt.value);
        close({ restoreFocus: true });
      },
      [displayedOptions, onChange, close],
    );

    // (v1.11.388, TODO 11.370) Clear button handler. Resets
    // value to '' and closes the menu without triggering a
    // focus restore; the trigger keeps focus naturally because
    // the X button lives inside it.
    const handleClear = useCallback(
      (e: React.MouseEvent<HTMLSpanElement>) => {
        e.stopPropagation();
        if (disabled) return;
        onChange('');
        // Keep the menu state in sync: collapse if it was open
        // so the user does not have a stale highlight on a now-
        // unselected option.
        if (open) close({ restoreFocus: true });
      },
      [disabled, onChange, open, close],
    );

    // (v1.11.388, TODO 11.370) Autofocus the search input on
    // first open so keystrokes type into the filter. Skipped
    // when `searchable` is off (legacy keyboard handler keeps
    // intercepting trigger keystrokes for type-ahead).
    useEffect(() => {
      if (!open || !searchable) return;
      // requestAnimationFrame ensures the input is in the DOM
      // before focus(); jsdom resolves rAF synchronously inside
      // act() so tests do not need extra waiting.
      const id = requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
      return () => cancelAnimationFrame(id);
    }, [open, searchable]);

    // (v1.11.388, TODO 11.370) When the filtered list changes,
    // re-anchor the highlight to the first enabled visible
    // option. Avoids stale `highlight=-1` after typing
    // narrows the list.
    useEffect(() => {
      if (!open || !searchable) return;
      if (
        highlight >= 0 &&
        highlight < displayedOptions.length &&
        !displayedOptions[highlight]?.disabled
      ) {
        return;
      }
      setHighlight(firstEnabled(displayedOptions));
    }, [open, searchable, displayedOptions, highlight]);

    // Click-outside dismiss
    useEffect(() => {
      if (!open) return;
      const onDocMouseDown = (e: MouseEvent) => {
        const root = containerRef.current;
        if (!root) return;
        if (e.target instanceof Node && !root.contains(e.target)) {
          close();
        }
      };
      document.addEventListener('mousedown', onDocMouseDown);
      return () => document.removeEventListener('mousedown', onDocMouseDown);
    }, [open, close]);

    // Clear type-ahead timer on close / unmount
    useEffect(() => {
      if (!open) {
        const state = typeAheadRef.current;
        if (state.timer !== null) {
          clearTimeout(state.timer);
          state.timer = null;
        }
        state.buffer = '';
      }
      return () => {
        const state = typeAheadRef.current;
        if (state.timer !== null) {
          clearTimeout(state.timer);
          state.timer = null;
        }
      };
    }, [open]);

    const handleTypeAhead = useCallback(
      (key: string) => {
        const state = typeAheadRef.current;
        if (state.timer !== null) clearTimeout(state.timer);
        state.buffer = (state.buffer + key).toLowerCase();
        state.timer = setTimeout(() => {
          state.buffer = '';
          state.timer = null;
        }, TYPEAHEAD_RESET_MS) as unknown as number;

        const buf = state.buffer;
        const len = options.length;
        // If buffer is a single char, advance from current position so
        // repeated presses cycle through matches; otherwise restart.
        const startFrom = buf.length === 1 ? (highlight >= 0 ? highlight : -1) : -1;
        for (let step = 1; step <= len; step++) {
          const idx = (startFrom + step + len) % len;
          const opt = options[idx];
          if (!opt || opt.disabled) continue;
          if (opt.label.toLowerCase().startsWith(buf)) {
            setHighlight(idx);
            return;
          }
        }
      },
      [options, highlight],
    );

    const onKeyDown = useCallback(
      (e: KeyboardEvent<HTMLElement>) => {
        if (disabled) return;
        if (!open) {
          if (
            e.key === 'Enter' ||
            e.key === ' ' ||
            e.key === 'ArrowDown' ||
            e.key === 'ArrowUp'
          ) {
            e.preventDefault();
            openMenu();
          }
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          close({ restoreFocus: true });
          return;
        }
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (highlight >= 0) commit(highlight);
          return;
        }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const dir: 1 | -1 = e.key === 'ArrowDown' ? 1 : -1;
          setHighlight((prev) => findNextEnabled(displayedOptions, prev, dir));
          return;
        }
        if (e.key === 'Home') {
          e.preventDefault();
          setHighlight(firstEnabled(displayedOptions));
          return;
        }
        if (e.key === 'End') {
          e.preventDefault();
          setHighlight(lastEnabled(displayedOptions));
          return;
        }
        if (e.key === 'Tab') {
          close();
          return;
        }
        // (v1.11.388, TODO 11.370) When the popup is searchable
        // we route printable keystrokes into the search input
        // (which has focus already), so the type-ahead branch is
        // skipped. Legacy non-searchable Select still uses the
        // type-ahead matcher.
        if (
          !searchable &&
          e.key.length === 1 &&
          !e.ctrlKey &&
          !e.metaKey &&
          !e.altKey &&
          /\S/.test(e.key)
        ) {
          e.preventDefault();
          handleTypeAhead(e.key);
        }
      },
      [disabled, open, openMenu, close, highlight, commit, displayedOptions, handleTypeAhead, searchable],
    );

    const optionIdPrefix = `${listboxId}-opt-`;
    const activeDescendant =
      open && highlight >= 0 && highlight < displayedOptions.length
        ? `${optionIdPrefix}${highlight}`
        : undefined;

    const triggerLabelText = selectedOption
      ? selectedOption.label
      : placeholder ?? '';
    const triggerIsPlaceholder = !selectedOption;
    const showClear = clearable && value !== '' && !disabled;

    const triggerEl = (
      <button
        ref={(node) => {
          triggerRef.current = node;
          if (typeof ref === 'function') ref(node);
          else if (ref) (ref as { current: HTMLButtonElement | null }).current = node;
        }}
        type="button"
        id={triggerId}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={activeDescendant}
        aria-label={ariaLabel}
        aria-invalid={hasSlots && error != null ? true : undefined}
        aria-describedby={describedBy}
        disabled={disabled}
        onClick={toggle}
        onKeyDown={onKeyDown}
        className={cn(
          TRIGGER_CLASSES,
          hasSlots && error != null && 'border-destructive',
          className,
        )}
      >
        <span
          className={cn(
            'flex-1 truncate text-left',
            triggerIsPlaceholder && 'text-muted-foreground',
          )}
        >
          {triggerLabelText}
        </span>
        {showClear ? (
          <span
            role="button"
            tabIndex={-1}
            aria-label="Clear selection"
            data-section="select-clear"
            onClick={handleClear}
            onMouseDown={(e) => e.stopPropagation()}
            className="ml-2 inline-flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </span>
        ) : null}
        <span aria-hidden="true" className="ml-2 text-muted-foreground">
          {'▾'}
        </span>
      </button>
    );

    const popupEl = open ? (
      <div
        data-section="select-popup"
        className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border border-border bg-popover text-sm text-popover-foreground shadow-md"
      >
        {searchable ? (
          <div
            data-section="select-search-row"
            className="border-b border-border px-2 py-1.5"
          >
            <input
              ref={searchInputRef}
              type="text"
              role="searchbox"
              aria-label="Search options"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={searchPlaceholder ?? 'Search...'}
              data-section="select-search-input"
              className="block w-full bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
            />
          </div>
        ) : null}
        <ul
          ref={listboxRef}
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel ?? (typeof label === 'string' ? label : undefined)}
          tabIndex={-1}
          data-section="select-listbox"
          className="max-h-60 overflow-auto py-1 focus:outline-none"
        >
          {displayedOptions.length === 0 ? (
            <li
              data-section="select-empty"
              className="px-3 py-2 text-xs text-muted-foreground"
            >
              No matches
            </li>
          ) : (
            displayedOptions.map((opt, idx) => {
              const isSelected = opt.value === value;
              const isHighlight = idx === highlight && !opt.disabled;
              return (
                <li
                  key={opt.value}
                  id={`${optionIdPrefix}${idx}`}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={opt.disabled || undefined}
                  onMouseEnter={() => {
                    if (!opt.disabled) setHighlight(idx);
                  }}
                  onMouseDown={(e) => {
                    // prevent trigger blur before click commit
                    e.preventDefault();
                  }}
                  onClick={() => commit(idx)}
                  className={cn(
                    'cursor-pointer px-3 py-2',
                    opt.disabled && 'cursor-not-allowed opacity-50',
                    isHighlight && 'bg-accent text-accent-foreground',
                    isSelected && !isHighlight && 'font-medium',
                  )}
                >
                  {opt.label}
                </li>
              );
            })
          )}
        </ul>
      </div>
    ) : null;

    const root = (
      <div className="relative" ref={containerRef}>
        {triggerEl}
        {popupEl}
      </div>
    );

    if (!hasSlots) {
      return root;
    }

    return (
      <div className="space-y-1.5">
        {label != null ? <Label htmlFor={triggerId}>{label}</Label> : null}
        {root}
        {hint != null ? (
          <p id={hintId} className="text-xs text-muted-foreground">
            {hint}
          </p>
        ) : null}
        {error != null ? (
          <p id={errorId} role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    );
  },
);
Select.displayName = 'Select';

// (v1.11.308, TODO 11.290) NativeSelect -- styled wrapper
// around the platform `<select>`. Use this for simple
// dropdowns (3-7 fixed options, no fuzzy search, no
// async loading) where the rich `Select` combobox is
// overkill. Inherits all native-select affordances:
// platform-native dropdown chrome on mobile, screen-reader
// announcement free of custom ARIA, no portal layer.

export type NativeSelectSize = 'sm' | 'md';

export interface NativeSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface NativeSelectProps
  extends Omit<
    SelectHTMLAttributes<HTMLSelectElement>,
    'size' | 'onChange' | 'value' | 'children'
  > {
  options: NativeSelectOption[];
  value: string;
  onChange: (next: string) => void;
  size?: NativeSelectSize;
  // (v1.11.308) Error state -- flips `aria-invalid` AND
  // swaps in a destructive border palette so the surface
  // signals validation failure without the caller wrapping
  // the select in separate error chrome.
  error?: boolean;
  // (v1.11.308) Optional leading icon rendered before the
  // select text. Pure presentation; absolutely positioned
  // inside the relative wrapper so the native select stays
  // pixel-perfect.
  icon?: ReactNode;
  // Optional placeholder rendered as the first <option>
  // when the current value does not match any option.
  // Native selects do not show placeholder text natively, so
  // the placeholder ships as a disabled <option> in the
  // list.
  placeholder?: string;
}

const NATIVE_SELECT_BASE =
  'w-full appearance-none rounded-md border bg-background text-sm ring-offset-background transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50';

const NATIVE_SELECT_SIZE: Record<NativeSelectSize, string> = {
  sm: 'h-8 px-2 pr-7 text-xs',
  md: 'h-10 min-h-[44px] sm:min-h-0 px-3 pr-9',
};

const NATIVE_SELECT_BORDER = 'border-input';
const NATIVE_SELECT_BORDER_ERROR = 'border-destructive';

const NATIVE_ICON_OFFSET: Record<NativeSelectSize, string> = {
  sm: 'pl-7',
  md: 'pl-9',
};

const ICON_LEADING_POS: Record<NativeSelectSize, string> = {
  sm: 'left-2',
  md: 'left-3',
};

const ICON_CHEVRON_POS: Record<NativeSelectSize, string> = {
  sm: 'right-2',
  md: 'right-3',
};

export const NativeSelect = forwardRef<HTMLSelectElement, NativeSelectProps>(
  (
    {
      options,
      value,
      onChange,
      size = 'md',
      error = false,
      icon,
      placeholder,
      className,
      disabled,
      ...rest
    },
    ref,
  ) => {
    const handleChange = (e: ChangeEvent<HTMLSelectElement>) => {
      onChange(e.target.value);
    };

    const hasIcon = icon !== undefined && icon !== null;

    return (
      <span
        className="relative inline-flex w-full items-center"
        data-section="native-select-root"
        data-size={size}
        data-error={error ? 'true' : 'false'}
      >
        {hasIcon ? (
          <span
            aria-hidden="true"
            data-section="native-select-icon"
            className={cn(
              'pointer-events-none absolute inline-flex items-center text-muted-foreground',
              ICON_LEADING_POS[size],
            )}
          >
            {icon}
          </span>
        ) : null}
        <select
          ref={ref}
          value={value}
          onChange={handleChange}
          disabled={disabled}
          aria-invalid={error || undefined}
          data-section="native-select"
          data-size={size}
          data-error={error ? 'true' : 'false'}
          className={cn(
            NATIVE_SELECT_BASE,
            NATIVE_SELECT_SIZE[size],
            error ? NATIVE_SELECT_BORDER_ERROR : NATIVE_SELECT_BORDER,
            hasIcon && NATIVE_ICON_OFFSET[size],
            className,
          )}
          {...rest}
        >
          {placeholder !== undefined ? (
            <option value="" disabled hidden>
              {placeholder}
            </option>
          ) : null}
          {options.map((opt) => (
            <option
              key={opt.value}
              value={opt.value}
              disabled={opt.disabled}
            >
              {opt.label}
            </option>
          ))}
        </select>
        <span
          aria-hidden="true"
          data-section="native-select-chevron"
          className={cn(
            'pointer-events-none absolute inline-flex items-center text-muted-foreground',
            ICON_CHEVRON_POS[size],
          )}
        >
          <ChevronDown
            className={cn(size === 'sm' ? 'h-3 w-3' : 'h-4 w-4')}
          />
        </span>
      </span>
    );
  },
);

NativeSelect.displayName = 'NativeSelect';

// (v1.11.388, TODO 11.370) MultiSelect -- canonical
// multi-value variant of Select. The state shape changes
// from `value: string` to `values: string[]`; Space / Enter
// TOGGLE the highlighted option without closing the popup;
// the trigger renders a comma-joined label list (or
// "<n> selected" when n > 3 to keep the trigger from
// overflowing). Pairs the same `clearable` + `searchable`
// affordances as the single Select so the surface stays
// consistent.

export interface MultiSelectProps {
  options: SelectOption[];
  values: string[];
  onChange: (values: string[]) => void;
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  ariaLabel?: string;
  clearable?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  // (v1.11.388, TODO 11.370) When the selected count exceeds
  // this threshold the trigger label collapses to
  // "<n> selected" instead of comma-joining every label.
  // Default 3.
  maxLabelChips?: number;
}

export const MultiSelect = forwardRef<HTMLButtonElement, MultiSelectProps>(
  (
    {
      options,
      values,
      onChange,
      label,
      hint,
      error,
      placeholder,
      disabled,
      id,
      className,
      ariaLabel,
      clearable = false,
      searchable = false,
      searchPlaceholder,
      maxLabelChips = 3,
    },
    ref,
  ) => {
    const generatedId = useId();
    const listboxId = useId();
    const hasSlots = label != null || hint != null || error != null;
    const triggerId = id ?? (hasSlots ? generatedId : undefined);
    const hintId = hint != null && triggerId ? `${triggerId}-hint` : undefined;
    const errorId = error != null && triggerId ? `${triggerId}-error` : undefined;
    const describedBy =
      [hintId, errorId].filter(Boolean).join(' ') || undefined;

    const [open, setOpen] = useState(false);
    const [highlight, setHighlight] = useState<number>(-1);
    const [query, setQuery] = useState('');
    const containerRef = useRef<HTMLDivElement | null>(null);
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const searchInputRef = useRef<HTMLInputElement | null>(null);

    const valueSet = useMemo(() => new Set(values), [values]);
    const displayedOptions = useMemo<SelectOption[]>(
      () => (searchable ? filterSelectOptions(options, query) : options),
      [searchable, options, query],
    );

    const close = useCallback((opts?: { restoreFocus?: boolean }) => {
      setOpen(false);
      setHighlight(-1);
      setQuery('');
      if (opts?.restoreFocus) triggerRef.current?.focus();
    }, []);

    const openMenu = useCallback(() => {
      if (disabled) return;
      setOpen(true);
      setHighlight(firstEnabled(options));
    }, [disabled, options]);

    const toggle = useCallback(() => {
      if (disabled) return;
      if (open) close();
      else openMenu();
    }, [disabled, open, openMenu, close]);

    const toggleValue = useCallback(
      (idx: number) => {
        const opt = displayedOptions[idx];
        if (!opt || opt.disabled) return;
        if (valueSet.has(opt.value)) {
          onChange(values.filter((v) => v !== opt.value));
        } else {
          onChange([...values, opt.value]);
        }
      },
      [displayedOptions, valueSet, onChange, values],
    );

    const handleClear = useCallback(
      (e: React.MouseEvent<HTMLSpanElement>) => {
        e.stopPropagation();
        if (disabled) return;
        onChange([]);
        if (open) close({ restoreFocus: true });
      },
      [disabled, onChange, open, close],
    );

    useEffect(() => {
      if (!open) return;
      const onDocMouseDown = (e: MouseEvent) => {
        const root = containerRef.current;
        if (!root) return;
        if (e.target instanceof Node && !root.contains(e.target)) {
          close();
        }
      };
      document.addEventListener('mousedown', onDocMouseDown);
      return () => document.removeEventListener('mousedown', onDocMouseDown);
    }, [open, close]);

    useEffect(() => {
      if (!open || !searchable) return;
      const id = requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
      return () => cancelAnimationFrame(id);
    }, [open, searchable]);

    useEffect(() => {
      if (!open) return;
      if (
        highlight >= 0 &&
        highlight < displayedOptions.length &&
        !displayedOptions[highlight]?.disabled
      ) {
        return;
      }
      setHighlight(firstEnabled(displayedOptions));
    }, [open, displayedOptions, highlight]);

    const onKeyDown = useCallback(
      (e: KeyboardEvent<HTMLElement>) => {
        if (disabled) return;
        if (!open) {
          if (
            e.key === 'Enter' ||
            e.key === ' ' ||
            e.key === 'ArrowDown' ||
            e.key === 'ArrowUp'
          ) {
            e.preventDefault();
            openMenu();
          }
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          close({ restoreFocus: true });
          return;
        }
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (highlight >= 0) toggleValue(highlight);
          return;
        }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const dir: 1 | -1 = e.key === 'ArrowDown' ? 1 : -1;
          setHighlight((prev) => findNextEnabled(displayedOptions, prev, dir));
          return;
        }
        if (e.key === 'Home') {
          e.preventDefault();
          setHighlight(firstEnabled(displayedOptions));
          return;
        }
        if (e.key === 'End') {
          e.preventDefault();
          setHighlight(lastEnabled(displayedOptions));
          return;
        }
        if (e.key === 'Tab') {
          close();
          return;
        }
      },
      [
        disabled,
        open,
        openMenu,
        close,
        highlight,
        toggleValue,
        displayedOptions,
      ],
    );

    const optionIdPrefix = `${listboxId}-opt-`;
    const activeDescendant =
      open && highlight >= 0 && highlight < displayedOptions.length
        ? `${optionIdPrefix}${highlight}`
        : undefined;

    const selectedLabels = useMemo<string[]>(
      () =>
        values
          .map((v) => options.find((o) => o.value === v)?.label)
          .filter((l): l is string => typeof l === 'string'),
      [values, options],
    );
    const triggerLabelText =
      selectedLabels.length === 0
        ? placeholder ?? ''
        : selectedLabels.length > maxLabelChips
          ? `${selectedLabels.length} selected`
          : selectedLabels.join(', ');
    const triggerIsPlaceholder = selectedLabels.length === 0;
    const showClear = clearable && values.length > 0 && !disabled;

    const triggerEl = (
      <button
        ref={(node) => {
          triggerRef.current = node;
          if (typeof ref === 'function') ref(node);
          else if (ref) (ref as { current: HTMLButtonElement | null }).current = node;
        }}
        type="button"
        id={triggerId}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={activeDescendant}
        aria-label={ariaLabel}
        aria-invalid={hasSlots && error != null ? true : undefined}
        aria-describedby={describedBy}
        disabled={disabled}
        onClick={toggle}
        onKeyDown={onKeyDown}
        data-section="multiselect-trigger"
        data-selected-count={values.length}
        className={cn(
          TRIGGER_CLASSES,
          hasSlots && error != null && 'border-destructive',
          className,
        )}
      >
        <span
          className={cn(
            'flex-1 truncate text-left',
            triggerIsPlaceholder && 'text-muted-foreground',
          )}
        >
          {triggerLabelText}
        </span>
        {showClear ? (
          <span
            role="button"
            tabIndex={-1}
            aria-label="Clear selection"
            data-section="multiselect-clear"
            onClick={handleClear}
            onMouseDown={(e) => e.stopPropagation()}
            className="ml-2 inline-flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </span>
        ) : null}
        <span aria-hidden="true" className="ml-2 text-muted-foreground">
          {'▾'}
        </span>
      </button>
    );

    const popupEl = open ? (
      <div
        data-section="multiselect-popup"
        className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border border-border bg-popover text-sm text-popover-foreground shadow-md"
      >
        {searchable ? (
          <div
            data-section="multiselect-search-row"
            className="border-b border-border px-2 py-1.5"
          >
            <input
              ref={searchInputRef}
              type="text"
              role="searchbox"
              aria-label="Search options"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={searchPlaceholder ?? 'Search...'}
              data-section="multiselect-search-input"
              className="block w-full bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
            />
          </div>
        ) : null}
        <ul
          id={listboxId}
          role="listbox"
          aria-multiselectable
          aria-label={ariaLabel ?? (typeof label === 'string' ? label : undefined)}
          tabIndex={-1}
          data-section="multiselect-listbox"
          className="max-h-60 overflow-auto py-1 focus:outline-none"
        >
          {displayedOptions.length === 0 ? (
            <li
              data-section="multiselect-empty"
              className="px-3 py-2 text-xs text-muted-foreground"
            >
              No matches
            </li>
          ) : (
            displayedOptions.map((opt, idx) => {
              const isSelected = valueSet.has(opt.value);
              const isHighlight = idx === highlight && !opt.disabled;
              return (
                <li
                  key={opt.value}
                  id={`${optionIdPrefix}${idx}`}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={opt.disabled || undefined}
                  onMouseEnter={() => {
                    if (!opt.disabled) setHighlight(idx);
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => toggleValue(idx)}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 px-3 py-2',
                    opt.disabled && 'cursor-not-allowed opacity-50',
                    isHighlight && 'bg-accent text-accent-foreground',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    readOnly
                    tabIndex={-1}
                    aria-hidden="true"
                    data-section="multiselect-option-check"
                    className="pointer-events-none h-3.5 w-3.5"
                  />
                  <span className="truncate">{opt.label}</span>
                </li>
              );
            })
          )}
        </ul>
      </div>
    ) : null;

    const root = (
      <div className="relative" ref={containerRef}>
        {triggerEl}
        {popupEl}
      </div>
    );

    if (!hasSlots) return root;

    return (
      <div className="space-y-1.5">
        {label != null ? <Label htmlFor={triggerId}>{label}</Label> : null}
        {root}
        {hint != null ? (
          <p id={hintId} className="text-xs text-muted-foreground">
            {hint}
          </p>
        ) : null}
        {error != null ? (
          <p id={errorId} role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    );
  },
);
MultiSelect.displayName = 'MultiSelect';
