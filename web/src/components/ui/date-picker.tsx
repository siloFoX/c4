import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { KeyboardEvent, MutableRefObject, Ref } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Popover } from './popover';
import {
  addDays,
  addMonths,
  addYears,
  isSameDay,
  startOfDay,
  startOfMonth,
  toISODate,
} from '../../lib/date-format';

// (11.176) DatePicker primitive. Native Date only, no external date lib.
// Reuses the existing Popover. Single-date and DateRangePicker exports.
//
// (v1.11.428, TODO 11.410) Adds `isDateDisabled` predicate so
// callers can mark individual cells unavailable (weekends,
// holidays, capacity-out days) without expressing them as a
// continuous min/max range. The pure helper `isDayAllowed` is
// exported so hosts that manage selection externally can reuse
// the same gate.

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function withinRange(d: Date, min?: Date, max?: Date): boolean {
  const t = startOfDay(d).getTime();
  if (min && t < startOfDay(min).getTime()) return false;
  if (max && t > startOfDay(max).getTime()) return false;
  return true;
}

// (v1.11.428, TODO 11.410) Combined gate -- a date is allowed
// only when it is within [min, max] AND the optional
// `isDateDisabled` predicate returns false. Throws in the
// predicate are swallowed (predicate -> disabled) so a bad
// caller-supplied function cannot crash the calendar render.
export function isDayAllowed(
  d: Date,
  min?: Date,
  max?: Date,
  isDateDisabled?: (date: Date) => boolean,
): boolean {
  if (!withinRange(d, min, max)) return false;
  if (!isDateDisabled) return true;
  try {
    return !isDateDisabled(startOfDay(d));
  } catch {
    return false;
  }
}

function buildMonthGrid(view: Date): Date[] {
  const first = startOfMonth(view);
  const startWeekday = first.getDay();
  const gridStart = addDays(first, -startWeekday);
  const cells: Date[] = [];
  for (let i = 0; i < 42; i += 1) cells.push(addDays(gridStart, i));
  return cells;
}

interface MonthGridProps {
  viewMonth: Date;
  focused: Date;
  selected: Date | null;
  rangeFrom?: Date | null | undefined;
  rangeTo?: Date | null | undefined;
  min?: Date | undefined;
  max?: Date | undefined;
  isDateDisabled?: ((date: Date) => boolean) | undefined;
  onPick: (d: Date) => void;
  onFocus: (d: Date) => void;
  today: Date;
}

function MonthGrid({
  viewMonth,
  focused,
  selected,
  rangeFrom,
  rangeTo,
  min,
  max,
  isDateDisabled,
  onPick,
  onFocus,
  today,
}: MonthGridProps) {
  const cells = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);
  return (
    <div className="grid grid-cols-7 gap-0.5" role="grid">
      {WEEKDAYS.map((w) => (
        <div
          key={w}
          className="py-1 text-center text-[10px] font-medium uppercase text-muted-foreground"
          role="columnheader"
        >
          {w}
        </div>
      ))}
      {cells.map((d) => {
        const inMonth = d.getMonth() === viewMonth.getMonth();
        const disabled = !isDayAllowed(d, min, max, isDateDisabled);
        const isToday = isSameDay(d, today);
        const isFocused = isSameDay(d, focused);
        const isSelected = isSameDay(d, selected);
        const isRangeFrom = isSameDay(d, rangeFrom ?? null);
        const isRangeTo = isSameDay(d, rangeTo ?? null);
        const inRange = rangeFrom && rangeTo &&
          d.getTime() > startOfDay(rangeFrom).getTime() &&
          d.getTime() < startOfDay(rangeTo).getTime();
        const isRangeEdge = isRangeFrom || isRangeTo;
        return (
          <button
            key={d.toISOString()}
            type="button"
            role="gridcell"
            tabIndex={isFocused ? 0 : -1}
            aria-current={isFocused ? 'date' : undefined}
            aria-selected={isSelected || isRangeEdge || undefined}
            aria-disabled={disabled || undefined}
            data-focused={isFocused ? 'true' : undefined}
            data-today={isToday ? 'true' : undefined}
            data-selected={isSelected || isRangeEdge ? 'true' : undefined}
            data-in-range={inRange ? 'true' : undefined}
            data-outside={!inMonth ? 'true' : undefined}
            disabled={disabled}
            onClick={() => {
              if (disabled) return;
              onPick(d);
            }}
            onFocus={() => onFocus(d)}
            className={cn(
              'h-8 w-8 rounded-md text-xs tabular-nums transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              !inMonth && 'text-muted-foreground/50',
              isToday && 'today ring-1 ring-primary/60',
              (isSelected || isRangeEdge) && 'bg-primary text-primary-foreground hover:bg-primary/90',
              !isSelected && !isRangeEdge && inRange && 'bg-primary/15 text-foreground',
              !isSelected && !isRangeEdge && !inRange && 'hover:bg-muted',
              disabled && 'pointer-events-none opacity-40',
            )}
          >
            {d.getDate()}
          </button>
        );
      })}
    </div>
  );
}

interface CalendarHeaderProps {
  view: Date;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onPrevYear: () => void;
  onNextYear: () => void;
  label?: string;
}

function CalendarHeader({
  view,
  onPrevMonth,
  onNextMonth,
  onPrevYear,
  onNextYear,
  label,
}: CalendarHeaderProps) {
  const monthLabel = view.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  return (
    <div className="mb-2 flex items-center justify-between gap-1 px-1">
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          aria-label="Previous year"
          onClick={onPrevYear}
          className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted"
        >
          &laquo;
        </button>
        <button
          type="button"
          aria-label="Previous month"
          onClick={onPrevMonth}
          className="rounded p-1 text-muted-foreground hover:bg-muted"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="text-xs font-semibold text-foreground" aria-live="polite">
        {label ?? monthLabel}
      </div>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          aria-label="Next month"
          onClick={onNextMonth}
          className="rounded p-1 text-muted-foreground hover:bg-muted"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Next year"
          onClick={onNextYear}
          className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted"
        >
          &raquo;
        </button>
      </div>
    </div>
  );
}

const TRIGGER_CLASS =
  'inline-flex h-9 min-w-[10rem] items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

export interface DatePickerProps {
  value: Date | null;
  onChange: (date: Date | null) => void;
  min?: Date | undefined;
  max?: Date | undefined;
  placeholder?: string | undefined;
  disabled?: boolean | undefined;
  ariaLabel?: string | undefined;
  className?: string | undefined;
  // (v1.11.428, TODO 11.410) Per-day disabled predicate. Receives
  // the start-of-day Date; return true to mark the cell unavailable.
  // Thrown errors are swallowed -> cell is disabled.
  isDateDisabled?: ((date: Date) => boolean) | undefined;
}

function assignRef<T>(ref: Ref<T> | undefined, node: T | null) {
  if (!ref) return;
  if (typeof ref === 'function') ref(node);
  else (ref as MutableRefObject<T | null>).current = node;
}

function useForwardedButtonRef(forwardedRef: Ref<HTMLButtonElement> | undefined) {
  const wrapperRef = useRef<HTMLSpanElement | null>(null);
  useLayoutEffect(() => {
    const btn = wrapperRef.current
      ? (wrapperRef.current.querySelector('button[aria-haspopup="dialog"]') as HTMLButtonElement | null)
      : null;
    assignRef(forwardedRef, btn);
    return () => assignRef(forwardedRef, null);
  });
  return wrapperRef;
}

export const DatePicker = forwardRef<HTMLButtonElement, DatePickerProps>(
  (
    {
      value,
      onChange,
      min,
      max,
      placeholder = 'YYYY-MM-DD',
      disabled,
      ariaLabel,
      className,
      isDateDisabled,
    },
    ref,
  ) => {
    const wrapperRef = useForwardedButtonRef(ref);
    const [open, setOpen] = useState(false);
    const today = useMemo(() => startOfDay(new Date()), []);
    const [view, setView] = useState<Date>(() => startOfMonth(value ?? today));
    const [focused, setFocused] = useState<Date>(() => value ?? today);

    useEffect(() => {
      if (open) {
        const base = value ?? today;
        setView(startOfMonth(base));
        setFocused(base);
      }
    }, [open, value, today]);

    const moveFocus = useCallback((next: Date) => {
      setFocused(next);
      setView(startOfMonth(next));
    }, []);

    const onKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
      const k = e.key;
      if (k === 'ArrowLeft') { e.preventDefault(); moveFocus(addDays(focused, -1)); }
      else if (k === 'ArrowRight') { e.preventDefault(); moveFocus(addDays(focused, 1)); }
      else if (k === 'ArrowUp') { e.preventDefault(); moveFocus(addDays(focused, -7)); }
      else if (k === 'ArrowDown') { e.preventDefault(); moveFocus(addDays(focused, 7)); }
      else if (k === 'PageUp') {
        e.preventDefault();
        moveFocus(e.shiftKey ? addYears(focused, -1) : addMonths(focused, -1));
      }
      else if (k === 'PageDown') {
        e.preventDefault();
        moveFocus(e.shiftKey ? addYears(focused, 1) : addMonths(focused, 1));
      }
      else if (k === 'Home') {
        e.preventDefault();
        moveFocus(addDays(focused, -focused.getDay()));
      }
      else if (k === 'End') {
        e.preventDefault();
        moveFocus(addDays(focused, 6 - focused.getDay()));
      }
      else if (k === 'Enter') {
        e.preventDefault();
        if (isDayAllowed(focused, min, max, isDateDisabled)) {
          onChange(focused);
          setOpen(false);
        }
      }
    }, [focused, min, max, isDateDisabled, moveFocus, onChange]);

    const onPick = useCallback((d: Date) => {
      onChange(d);
      setOpen(false);
    }, [onChange]);

    const label = toISODate(value) || placeholder;

    return (
      <span ref={wrapperRef} style={{ display: 'contents' }}>
        <Popover
          open={open}
          onOpenChange={setOpen}
          trigger={
            <button
              type="button"
              disabled={disabled}
              aria-label={ariaLabel ?? 'Date picker'}
              className={cn(TRIGGER_CLASS, className)}
            >
              <span className={cn(!value && 'text-muted-foreground')}>{label}</span>
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            </button>
          }
          content={
            <div
              className="w-64 p-1"
              onKeyDown={onKeyDown}
              data-testid="date-picker-panel"
            >
              <CalendarHeader
                view={view}
                onPrevMonth={() => setView(addMonths(view, -1))}
                onNextMonth={() => setView(addMonths(view, 1))}
                onPrevYear={() => setView(addYears(view, -1))}
                onNextYear={() => setView(addYears(view, 1))}
              />
              <MonthGrid
                viewMonth={view}
                focused={focused}
                selected={value}
                min={min}
                max={max}
                isDateDisabled={isDateDisabled}
                onPick={onPick}
                onFocus={setFocused}
                today={today}
              />
            </div>
          }
        />
      </span>
    );
  },
);

DatePicker.displayName = 'DatePicker';

export interface DateRange {
  from: Date | null;
  to: Date | null;
}

export interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  min?: Date | undefined;
  max?: Date | undefined;
  disabled?: boolean | undefined;
  ariaLabel?: string | undefined;
  className?: string | undefined;
  placeholder?: string | undefined;
  // (v1.11.428, TODO 11.410) Per-day disabled predicate.
  isDateDisabled?: ((date: Date) => boolean) | undefined;
}

export const DateRangePicker = forwardRef<HTMLButtonElement, DateRangePickerProps>(
  (
    {
      value,
      onChange,
      min,
      max,
      disabled,
      ariaLabel,
      className,
      placeholder = 'YYYY-MM-DD ~ YYYY-MM-DD',
      isDateDisabled,
    },
    ref,
  ) => {
    const wrapperRef = useForwardedButtonRef(ref);
    const [open, setOpen] = useState(false);
    const today = useMemo(() => startOfDay(new Date()), []);
    const initialAnchor = value.from ?? value.to ?? today;
    const [view, setView] = useState<Date>(() => startOfMonth(initialAnchor));
    const [focused, setFocused] = useState<Date>(() => initialAnchor);
    const pickStageRef = useRef<'from' | 'to'>('from');

    useEffect(() => {
      if (open) {
        const anchor = value.from ?? value.to ?? today;
        setView(startOfMonth(anchor));
        setFocused(anchor);
        pickStageRef.current = 'from';
      }
      // Intentionally only on open transitions.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const onPick = useCallback((d: Date) => {
      if (pickStageRef.current === 'from') {
        onChange({ from: d, to: null });
        pickStageRef.current = 'to';
      } else {
        const from = value.from;
        if (from && d.getTime() < startOfDay(from).getTime()) {
          onChange({ from: d, to: from });
        } else {
          onChange({ from, to: d });
        }
        pickStageRef.current = 'from';
        setOpen(false);
      }
    }, [onChange, value.from]);

    const onKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
      const k = e.key;
      const move = (next: Date) => { setFocused(next); setView(startOfMonth(next)); };
      if (k === 'ArrowLeft') { e.preventDefault(); move(addDays(focused, -1)); }
      else if (k === 'ArrowRight') { e.preventDefault(); move(addDays(focused, 1)); }
      else if (k === 'ArrowUp') { e.preventDefault(); move(addDays(focused, -7)); }
      else if (k === 'ArrowDown') { e.preventDefault(); move(addDays(focused, 7)); }
      else if (k === 'PageUp') {
        e.preventDefault();
        move(e.shiftKey ? addYears(focused, -1) : addMonths(focused, -1));
      }
      else if (k === 'PageDown') {
        e.preventDefault();
        move(e.shiftKey ? addYears(focused, 1) : addMonths(focused, 1));
      }
      else if (k === 'Home') {
        e.preventDefault();
        move(addDays(focused, -focused.getDay()));
      }
      else if (k === 'End') {
        e.preventDefault();
        move(addDays(focused, 6 - focused.getDay()));
      }
      else if (k === 'Enter') {
        e.preventDefault();
        if (isDayAllowed(focused, min, max, isDateDisabled)) onPick(focused);
      }
    }, [focused, min, max, isDateDisabled, onPick]);

    const fromLabel = toISODate(value.from);
    const toLabel = toISODate(value.to);
    const label = fromLabel || toLabel
      ? `${fromLabel || 'YYYY-MM-DD'} ~ ${toLabel || 'YYYY-MM-DD'}`
      : placeholder;

    const secondView = addMonths(view, 1);

    return (
      <span ref={wrapperRef} style={{ display: 'contents' }}>
      <Popover
        open={open}
        onOpenChange={setOpen}
        trigger={
          <button
            type="button"
            disabled={disabled}
            aria-label={ariaLabel ?? 'Date range picker'}
            className={cn(TRIGGER_CLASS, 'min-w-[16rem]', className)}
          >
            <span className={cn(!value.from && !value.to && 'text-muted-foreground')}>{label}</span>
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          </button>
        }
        content={
          <div
            className="flex gap-3 p-1"
            onKeyDown={onKeyDown}
            data-testid="date-range-picker-panel"
          >
            <div className="w-64">
              <CalendarHeader
                view={view}
                onPrevMonth={() => setView(addMonths(view, -1))}
                onNextMonth={() => setView(addMonths(view, 1))}
                onPrevYear={() => setView(addYears(view, -1))}
                onNextYear={() => setView(addYears(view, 1))}
              />
              <MonthGrid
                viewMonth={view}
                focused={focused}
                selected={null}
                rangeFrom={value.from}
                rangeTo={value.to}
                min={min}
                max={max}
                isDateDisabled={isDateDisabled}
                onPick={onPick}
                onFocus={setFocused}
                today={today}
              />
            </div>
            <div className="hidden w-64 md:block">
              <CalendarHeader
                view={secondView}
                onPrevMonth={() => setView(addMonths(view, -1))}
                onNextMonth={() => setView(addMonths(view, 1))}
                onPrevYear={() => setView(addYears(view, -1))}
                onNextYear={() => setView(addYears(view, 1))}
              />
              <MonthGrid
                viewMonth={secondView}
                focused={focused}
                selected={null}
                rangeFrom={value.from}
                rangeTo={value.to}
                min={min}
                max={max}
                isDateDisabled={isDateDisabled}
                onPick={onPick}
                onFocus={setFocused}
                today={today}
              />
            </div>
          </div>
        }
      />
      </span>
    );
  },
);

DateRangePicker.displayName = 'DateRangePicker';
