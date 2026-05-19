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
  ClipboardEvent as ReactClipboardEvent,
  ForwardedRef,
  KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { cn } from '../../lib/cn';

// (v1.11.427, TODO 11.409) TimePicker primitive.
//
// Three-field time picker (HH : MM : SS) with optional AM/PM
// toggle for 12-hour mode. Each field is an `<input>` plus the
// WAI-ARIA `role="spinbutton"` so screen readers announce
// "Hours 12 of 23" etc. Keyboard ArrowUp / ArrowDown increment
// / decrement (with `step` for minutes / seconds). Paste of an
// HH:MM, HH:MM:SS, or HH:MM:SS AM/PM string parses into the
// picker via the exported `parseTimeString` helper.
//
// Reference: /root/c4/arps-design-system-v1/.

export type TimePickerMode = '12' | '24';
export type TimePickerPeriod = 'AM' | 'PM';

export interface TimeValue {
  hours: number;
  minutes: number;
  seconds: number;
  period?: TimePickerPeriod;
}

export interface TimePickerProps {
  value?: TimeValue;
  defaultValue?: TimeValue;
  onChange?: (value: TimeValue) => void;
  mode?: TimePickerMode;
  showSeconds?: boolean;
  step?: number;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  readOnly?: boolean;
  hourAriaLabel?: string;
  minuteAriaLabel?: string;
  secondAriaLabel?: string;
  periodAriaLabel?: string;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export const DEFAULT_TIME_VALUE_24: TimeValue = {
  hours: 0,
  minutes: 0,
  seconds: 0,
};

export const DEFAULT_TIME_VALUE_12: TimeValue = {
  hours: 12,
  minutes: 0,
  seconds: 0,
  period: 'AM',
};

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  const i = Math.floor(n);
  if (i < min) return min;
  if (i > max) return max;
  return i;
}

function maxHour(mode: TimePickerMode): number {
  return mode === '12' ? 12 : 23;
}

function minHour(mode: TimePickerMode): number {
  return mode === '12' ? 1 : 0;
}

export function normalizeTimeValue(
  value: TimeValue | null | undefined,
  mode: TimePickerMode,
): TimeValue {
  const defaults =
    mode === '12' ? DEFAULT_TIME_VALUE_12 : DEFAULT_TIME_VALUE_24;
  if (!value) return { ...defaults };
  const hours = clampInt(
    typeof value.hours === 'number' ? value.hours : defaults.hours,
    minHour(mode),
    maxHour(mode),
  );
  const minutes = clampInt(
    typeof value.minutes === 'number'
      ? value.minutes
      : defaults.minutes,
    0,
    59,
  );
  const seconds = clampInt(
    typeof value.seconds === 'number'
      ? value.seconds
      : defaults.seconds,
    0,
    59,
  );
  const out: TimeValue = { hours, minutes, seconds };
  if (mode === '12') {
    const periodCandidate: TimePickerPeriod =
      value.period === 'PM' || value.period === 'AM'
        ? value.period
        : defaults.period ?? 'AM';
    out.period = periodCandidate;
  }
  return out;
}

// Wrap-around increment / decrement for a single time field.
export function stepTimeField(
  current: number,
  delta: number,
  min: number,
  max: number,
): number {
  if (!Number.isFinite(current)) return min;
  const range = max - min + 1;
  let next = Math.floor(current) + Math.floor(delta);
  // Normalize via modulo so a wrap of many ranges still lands inside.
  next = ((next - min) % range + range) % range + min;
  return next;
}

export function togglePeriod(p: TimePickerPeriod): TimePickerPeriod {
  return p === 'AM' ? 'PM' : 'AM';
}

const TIME_REGEX =
  /^\s*(\d{1,2})\s*[:.]\s*(\d{1,2})(?:\s*[:.]\s*(\d{1,2}))?(?:\s*(AM|PM|am|pm|a\.m\.|p\.m\.))?\s*$/;

export function parseTimeString(
  input: string,
  mode: TimePickerMode = '24',
): TimeValue | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (trimmed === '') return null;
  const match = TIME_REGEX.exec(trimmed);
  if (!match) return null;
  const hStr = match[1] ?? '';
  const mStr = match[2] ?? '';
  const sStr = match[3] ?? '0';
  const periodRaw = (match[4] ?? '').toUpperCase().replace(/\./g, '');
  let hours = Number(hStr);
  const minutes = Number(mStr);
  const seconds = Number(sStr);
  if (!Number.isFinite(hours)) return null;
  if (!Number.isFinite(minutes)) return null;
  if (!Number.isFinite(seconds)) return null;
  if (minutes < 0 || minutes > 59) return null;
  if (seconds < 0 || seconds > 59) return null;
  if (mode === '24') {
    if (hours < 0 || hours > 23) return null;
    return { hours, minutes, seconds };
  }
  // 12-hour mode
  let period: TimePickerPeriod = 'AM';
  if (periodRaw === 'AM' || periodRaw === 'PM') {
    period = periodRaw as TimePickerPeriod;
  } else if (hours >= 13 && hours <= 23) {
    // Auto-derive period from a 24-hour input (e.g., 15:30 -> 3:30 PM).
    period = 'PM';
    hours = hours - 12;
  } else if (hours === 12) {
    period = 'PM';
  } else if (hours === 0) {
    period = 'AM';
    hours = 12;
  }
  if (hours < 1 || hours > 12) return null;
  return { hours, minutes, seconds, period };
}

function pad2(n: number): string {
  const s = Math.floor(Math.abs(n)).toString();
  return s.length < 2 ? `0${s}` : s;
}

export function formatTimeValue(
  value: TimeValue,
  mode: TimePickerMode = '24',
  showSeconds = true,
): string {
  const n = normalizeTimeValue(value, mode);
  const parts = [pad2(n.hours), pad2(n.minutes)];
  if (showSeconds) parts.push(pad2(n.seconds));
  const body = parts.join(':');
  if (mode === '12' && n.period) return `${body} ${n.period}`;
  return body;
}

export function to24HourFormat(value: TimeValue): number {
  if (value.period === undefined) return value.hours;
  if (value.period === 'AM') {
    return value.hours === 12 ? 0 : value.hours;
  }
  // PM
  return value.hours === 12 ? 12 : value.hours + 12;
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

type Field = 'hours' | 'minutes' | 'seconds';

const FIELD_BOUNDS: Record<
  Field,
  (mode: TimePickerMode) => { min: number; max: number }
> = {
  hours: (mode) => ({ min: minHour(mode), max: maxHour(mode) }),
  minutes: () => ({ min: 0, max: 59 }),
  seconds: () => ({ min: 0, max: 59 }),
};

export const TimePicker = forwardRef(function TimePicker(
  {
    value,
    defaultValue,
    onChange,
    mode = '24',
    showSeconds = true,
    step = 1,
    ariaLabel = 'Time',
    className,
    disabled = false,
    readOnly = false,
    hourAriaLabel = 'Hours',
    minuteAriaLabel = 'Minutes',
    secondAriaLabel = 'Seconds',
    periodAriaLabel = 'AM or PM',
  }: TimePickerProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const isControlled = value !== undefined;
  const [internal, setInternal] = useState<TimeValue>(() =>
    normalizeTimeValue(
      defaultValue ??
        (mode === '12' ? DEFAULT_TIME_VALUE_12 : DEFAULT_TIME_VALUE_24),
      mode,
    ),
  );
  const effective = useMemo(
    () =>
      normalizeTimeValue(isControlled ? value ?? undefined : internal, mode),
    [isControlled, value, internal, mode],
  );

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const emit = useCallback(
    (next: TimeValue) => {
      const norm = normalizeTimeValue(next, mode);
      if (!isControlled) setInternal(norm);
      onChangeRef.current?.(norm);
    },
    [isControlled, mode],
  );

  const setField = useCallback(
    (field: Field, raw: number) => {
      if (disabled || readOnly) return;
      const bounds = FIELD_BOUNDS[field](mode);
      const clamped = clampInt(raw, bounds.min, bounds.max);
      emit({ ...effective, [field]: clamped });
    },
    [disabled, readOnly, mode, effective, emit],
  );

  const stepField = useCallback(
    (field: Field, delta: number) => {
      if (disabled || readOnly) return;
      const bounds = FIELD_BOUNDS[field](mode);
      const next = stepTimeField(
        effective[field],
        delta,
        bounds.min,
        bounds.max,
      );
      emit({ ...effective, [field]: next });
    },
    [disabled, readOnly, mode, effective, emit],
  );

  const togglePeriodHandler = useCallback(() => {
    if (disabled || readOnly) return;
    if (mode !== '12') return;
    emit({
      ...effective,
      period: togglePeriod(effective.period ?? 'AM'),
    });
  }, [disabled, readOnly, mode, effective, emit]);

  // Per-field text state -- shows the user's mid-typing keystrokes
  // even when partially valid. On blur the state snaps to the
  // canonical 2-digit padded representation.
  const [hoursText, setHoursText] = useState<string>(() =>
    pad2(effective.hours),
  );
  const [minutesText, setMinutesText] = useState<string>(() =>
    pad2(effective.minutes),
  );
  const [secondsText, setSecondsText] = useState<string>(() =>
    pad2(effective.seconds),
  );

  useEffect(() => {
    setHoursText(pad2(effective.hours));
    setMinutesText(pad2(effective.minutes));
    setSecondsText(pad2(effective.seconds));
  }, [effective.hours, effective.minutes, effective.seconds]);

  const handleFieldChange = useCallback(
    (field: Field, e: ChangeEvent<HTMLInputElement>) => {
      const next = e.target.value;
      const stripped = next.replace(/[^0-9]/g, '').slice(0, 2);
      if (field === 'hours') setHoursText(stripped);
      else if (field === 'minutes') setMinutesText(stripped);
      else setSecondsText(stripped);
      if (stripped === '') return;
      const num = Number(stripped);
      if (!Number.isFinite(num)) return;
      setField(field, num);
    },
    [setField],
  );

  const handleFieldBlur = useCallback(
    (field: Field) => {
      const txt =
        field === 'hours'
          ? hoursText
          : field === 'minutes'
          ? minutesText
          : secondsText;
      if (txt === '') {
        if (field === 'hours') setHoursText(pad2(effective.hours));
        else if (field === 'minutes')
          setMinutesText(pad2(effective.minutes));
        else setSecondsText(pad2(effective.seconds));
        return;
      }
      // Re-snap to padded.
      if (field === 'hours') setHoursText(pad2(effective.hours));
      else if (field === 'minutes')
        setMinutesText(pad2(effective.minutes));
      else setSecondsText(pad2(effective.seconds));
    },
    [hoursText, minutesText, secondsText, effective],
  );

  const handleFieldKeyDown = useCallback(
    (
      field: Field,
      e: ReactKeyboardEvent<HTMLInputElement>,
    ) => {
      const incStep = field === 'hours' ? 1 : step;
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        stepField(field, incStep);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        stepField(field, -incStep);
      }
    },
    [step, stepField],
  );

  const handlePeriodKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        togglePeriodHandler();
      }
    },
    [togglePeriodHandler],
  );

  const handlePaste = useCallback(
    (e: ReactClipboardEvent<HTMLDivElement>) => {
      if (disabled || readOnly) return;
      const text = e.clipboardData.getData('text/plain');
      if (text === '') return;
      const parsed = parseTimeString(text, mode);
      if (!parsed) return;
      e.preventDefault();
      emit(parsed);
    },
    [disabled, readOnly, mode, emit],
  );

  const hourBounds = FIELD_BOUNDS.hours(mode);

  return (
    <div
      ref={ref}
      role="group"
      aria-label={ariaLabel}
      data-section="time-picker"
      data-mode={mode}
      data-show-seconds={showSeconds ? 'true' : 'false'}
      data-disabled={disabled ? 'true' : 'false'}
      data-read-only={readOnly ? 'true' : 'false'}
      onPaste={handlePaste}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground',
        disabled && 'cursor-not-allowed opacity-60',
        className,
      )}
    >
      <input
        type="text"
        inputMode="numeric"
        role="spinbutton"
        aria-label={hourAriaLabel}
        aria-valuemin={hourBounds.min}
        aria-valuemax={hourBounds.max}
        aria-valuenow={effective.hours}
        aria-valuetext={pad2(effective.hours)}
        value={hoursText}
        onChange={(e) => handleFieldChange('hours', e)}
        onBlur={() => handleFieldBlur('hours')}
        onKeyDown={(e) => handleFieldKeyDown('hours', e)}
        disabled={disabled}
        readOnly={readOnly}
        data-section="time-picker-hours"
        data-time-field="hours"
        className="w-7 bg-transparent text-center tabular-nums outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-primary"
      />
      <span
        aria-hidden="true"
        data-section="time-picker-separator"
        className="text-muted-foreground"
      >
        :
      </span>
      <input
        type="text"
        inputMode="numeric"
        role="spinbutton"
        aria-label={minuteAriaLabel}
        aria-valuemin={0}
        aria-valuemax={59}
        aria-valuenow={effective.minutes}
        aria-valuetext={pad2(effective.minutes)}
        value={minutesText}
        onChange={(e) => handleFieldChange('minutes', e)}
        onBlur={() => handleFieldBlur('minutes')}
        onKeyDown={(e) => handleFieldKeyDown('minutes', e)}
        disabled={disabled}
        readOnly={readOnly}
        data-section="time-picker-minutes"
        data-time-field="minutes"
        className="w-7 bg-transparent text-center tabular-nums outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-primary"
      />
      {showSeconds ? (
        <>
          <span
            aria-hidden="true"
            data-section="time-picker-separator"
            className="text-muted-foreground"
          >
            :
          </span>
          <input
            type="text"
            inputMode="numeric"
            role="spinbutton"
            aria-label={secondAriaLabel}
            aria-valuemin={0}
            aria-valuemax={59}
            aria-valuenow={effective.seconds}
            aria-valuetext={pad2(effective.seconds)}
            value={secondsText}
            onChange={(e) => handleFieldChange('seconds', e)}
            onBlur={() => handleFieldBlur('seconds')}
            onKeyDown={(e) => handleFieldKeyDown('seconds', e)}
            disabled={disabled}
            readOnly={readOnly}
            data-section="time-picker-seconds"
            data-time-field="seconds"
            className="w-7 bg-transparent text-center tabular-nums outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-primary"
          />
        </>
      ) : null}
      {mode === '12' ? (
        <button
          type="button"
          onClick={togglePeriodHandler}
          onKeyDown={handlePeriodKeyDown}
          aria-label={periodAriaLabel}
          aria-pressed={effective.period === 'PM'}
          disabled={disabled || readOnly}
          data-section="time-picker-period"
          data-period={effective.period}
          className="ml-1 rounded border border-border bg-muted px-1.5 py-0.5 text-xs font-medium hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {effective.period ?? 'AM'}
        </button>
      ) : null}
    </div>
  );
});

TimePicker.displayName = 'TimePicker';
