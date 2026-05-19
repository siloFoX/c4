import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { createRef } from 'react';
import {
  DEFAULT_TIME_VALUE_12,
  DEFAULT_TIME_VALUE_24,
  TimePicker,
  formatTimeValue,
  normalizeTimeValue,
  parseTimeString,
  stepTimeField,
  to24HourFormat,
  togglePeriod,
} from './time-picker';

afterEach(() => {
  cleanup();
});

describe('normalizeTimeValue', () => {
  it('returns 24-hour defaults for undefined / null', () => {
    expect(normalizeTimeValue(undefined, '24')).toEqual(
      DEFAULT_TIME_VALUE_24,
    );
    expect(normalizeTimeValue(null, '24')).toEqual(
      DEFAULT_TIME_VALUE_24,
    );
  });

  it('returns 12-hour defaults for undefined / null + 12 mode', () => {
    expect(normalizeTimeValue(undefined, '12')).toEqual(
      DEFAULT_TIME_VALUE_12,
    );
  });

  it('clamps out-of-range hours / minutes / seconds (24h)', () => {
    expect(
      normalizeTimeValue(
        { hours: 99, minutes: 99, seconds: 99 },
        '24',
      ),
    ).toEqual({ hours: 23, minutes: 59, seconds: 59 });
    expect(
      normalizeTimeValue(
        { hours: -5, minutes: -1, seconds: -1 },
        '24',
      ),
    ).toEqual({ hours: 0, minutes: 0, seconds: 0 });
  });

  it('clamps to 1..12 for hours in 12-hour mode', () => {
    expect(
      normalizeTimeValue(
        { hours: 13, minutes: 0, seconds: 0, period: 'AM' },
        '12',
      ).hours,
    ).toBe(12);
    expect(
      normalizeTimeValue(
        { hours: 0, minutes: 0, seconds: 0 },
        '12',
      ).hours,
    ).toBe(1);
  });

  it('preserves period in 12-hour mode', () => {
    expect(
      normalizeTimeValue(
        { hours: 5, minutes: 0, seconds: 0, period: 'PM' },
        '12',
      ).period,
    ).toBe('PM');
  });

  it('defaults period to AM when missing in 12-hour mode', () => {
    expect(
      normalizeTimeValue(
        { hours: 5, minutes: 0, seconds: 0 },
        '12',
      ).period,
    ).toBe('AM');
  });
});

describe('stepTimeField', () => {
  it('increments within bounds', () => {
    expect(stepTimeField(5, 1, 0, 23)).toBe(6);
  });

  it('decrements within bounds', () => {
    expect(stepTimeField(5, -1, 0, 23)).toBe(4);
  });

  it('wraps at the upper bound', () => {
    expect(stepTimeField(23, 1, 0, 23)).toBe(0);
    // 59 + 5 over a 60-value range (0..59) wraps to 4
    // (59 -> 0 -> 1 -> 2 -> 3 -> 4 across the 5 increments).
    expect(stepTimeField(59, 5, 0, 59)).toBe(4);
  });

  it('wraps at the lower bound', () => {
    expect(stepTimeField(0, -1, 0, 23)).toBe(23);
    expect(stepTimeField(0, -5, 0, 59)).toBe(55);
  });

  it('handles 12-hour hour bounds (1..12)', () => {
    expect(stepTimeField(12, 1, 1, 12)).toBe(1);
    expect(stepTimeField(1, -1, 1, 12)).toBe(12);
  });

  it('non-finite current falls back to min', () => {
    expect(stepTimeField(Number.NaN, 1, 0, 23)).toBe(0);
  });
});

describe('togglePeriod', () => {
  it('AM -> PM', () => {
    expect(togglePeriod('AM')).toBe('PM');
  });
  it('PM -> AM', () => {
    expect(togglePeriod('PM')).toBe('AM');
  });
});

describe('parseTimeString', () => {
  it('parses HH:MM in 24-hour mode', () => {
    expect(parseTimeString('14:30', '24')).toEqual({
      hours: 14,
      minutes: 30,
      seconds: 0,
    });
  });

  it('parses HH:MM:SS in 24-hour mode', () => {
    expect(parseTimeString('14:30:45', '24')).toEqual({
      hours: 14,
      minutes: 30,
      seconds: 45,
    });
  });

  it('returns null on garbage input', () => {
    expect(parseTimeString('hello', '24')).toBeNull();
    expect(parseTimeString('', '24')).toBeNull();
    expect(parseTimeString('25:00', '24')).toBeNull();
    expect(parseTimeString('14:60', '24')).toBeNull();
  });

  it('parses HH.MM dot separator', () => {
    expect(parseTimeString('14.30', '24')).toEqual({
      hours: 14,
      minutes: 30,
      seconds: 0,
    });
  });

  it('parses AM/PM in 12-hour mode', () => {
    expect(parseTimeString('2:30 PM', '12')).toEqual({
      hours: 2,
      minutes: 30,
      seconds: 0,
      period: 'PM',
    });
    expect(parseTimeString('11:45 AM', '12')).toEqual({
      hours: 11,
      minutes: 45,
      seconds: 0,
      period: 'AM',
    });
  });

  it('auto-derives PM from 24-hour input in 12-hour mode', () => {
    expect(parseTimeString('15:30', '12')).toEqual({
      hours: 3,
      minutes: 30,
      seconds: 0,
      period: 'PM',
    });
  });

  it('handles midnight 00:00 -> 12:00 AM in 12-hour mode', () => {
    expect(parseTimeString('00:00', '12')).toEqual({
      hours: 12,
      minutes: 0,
      seconds: 0,
      period: 'AM',
    });
  });

  it('case-insensitive period + a.m./p.m. dotted form', () => {
    expect(parseTimeString('2:30 am', '12')?.period).toBe('AM');
    expect(parseTimeString('2:30 p.m.', '12')?.period).toBe('PM');
  });

  it('returns null for non-string input', () => {
    expect(
      parseTimeString(null as unknown as string, '24'),
    ).toBeNull();
    expect(
      parseTimeString(undefined as unknown as string, '24'),
    ).toBeNull();
  });
});

describe('formatTimeValue', () => {
  it('pads with zeros + colon separators in 24-hour mode', () => {
    expect(
      formatTimeValue(
        { hours: 5, minutes: 7, seconds: 9 },
        '24',
      ),
    ).toBe('05:07:09');
  });

  it('omits seconds when showSeconds=false', () => {
    expect(
      formatTimeValue(
        { hours: 5, minutes: 7, seconds: 9 },
        '24',
        false,
      ),
    ).toBe('05:07');
  });

  it('appends AM/PM in 12-hour mode', () => {
    expect(
      formatTimeValue(
        { hours: 2, minutes: 30, seconds: 0, period: 'PM' },
        '12',
      ),
    ).toBe('02:30:00 PM');
  });
});

describe('to24HourFormat', () => {
  it('passes through 24-hour values (no period)', () => {
    expect(
      to24HourFormat({ hours: 14, minutes: 30, seconds: 0 }),
    ).toBe(14);
  });

  it('converts 12 AM -> 0', () => {
    expect(
      to24HourFormat({
        hours: 12,
        minutes: 0,
        seconds: 0,
        period: 'AM',
      }),
    ).toBe(0);
  });

  it('converts 12 PM -> 12', () => {
    expect(
      to24HourFormat({
        hours: 12,
        minutes: 0,
        seconds: 0,
        period: 'PM',
      }),
    ).toBe(12);
  });

  it('converts 3 PM -> 15', () => {
    expect(
      to24HourFormat({
        hours: 3,
        minutes: 0,
        seconds: 0,
        period: 'PM',
      }),
    ).toBe(15);
  });

  it('passes 5 AM -> 5', () => {
    expect(
      to24HourFormat({
        hours: 5,
        minutes: 0,
        seconds: 0,
        period: 'AM',
      }),
    ).toBe(5);
  });
});

describe('TimePicker component', () => {
  it('renders role=group with default aria-label', () => {
    render(<TimePicker />);
    expect(screen.getByRole('group')).toHaveAttribute(
      'aria-label',
      'Time',
    );
  });

  it('honors a custom ariaLabel', () => {
    render(<TimePicker ariaLabel="Pick a time" />);
    expect(screen.getByRole('group')).toHaveAttribute(
      'aria-label',
      'Pick a time',
    );
  });

  it('exposes data-mode + data-show-seconds on root', () => {
    const { rerender } = render(<TimePicker />);
    const root = screen.getByRole('group');
    expect(root).toHaveAttribute('data-mode', '24');
    expect(root).toHaveAttribute('data-show-seconds', 'true');
    rerender(<TimePicker mode="12" showSeconds={false} />);
    expect(screen.getByRole('group')).toHaveAttribute(
      'data-mode',
      '12',
    );
    expect(screen.getByRole('group')).toHaveAttribute(
      'data-show-seconds',
      'false',
    );
  });

  it('renders three spinbutton inputs (HH MM SS)', () => {
    render(<TimePicker />);
    expect(screen.getAllByRole('spinbutton')).toHaveLength(3);
  });

  it('hides the seconds input when showSeconds=false', () => {
    render(<TimePicker showSeconds={false} />);
    expect(screen.getAllByRole('spinbutton')).toHaveLength(2);
  });

  it('hours input has aria-valuemin/max appropriate for 24h', () => {
    render(<TimePicker />);
    const hours = screen.getByLabelText('Hours') as HTMLInputElement;
    expect(hours).toHaveAttribute('aria-valuemin', '0');
    expect(hours).toHaveAttribute('aria-valuemax', '23');
  });

  it('hours input has aria-valuemin/max 1..12 in 12h mode', () => {
    render(<TimePicker mode="12" />);
    const hours = screen.getByLabelText('Hours') as HTMLInputElement;
    expect(hours).toHaveAttribute('aria-valuemin', '1');
    expect(hours).toHaveAttribute('aria-valuemax', '12');
  });

  it('renders AM/PM toggle in 12-hour mode', () => {
    render(<TimePicker mode="12" />);
    expect(
      screen.getByRole('button', { name: 'AM or PM' }),
    ).toBeInTheDocument();
  });

  it('omits AM/PM toggle in 24-hour mode', () => {
    render(<TimePicker mode="24" />);
    expect(
      screen.queryByRole('button', { name: 'AM or PM' }),
    ).toBeNull();
  });

  it('AM/PM toggle click flips period', () => {
    const onChange = vi.fn();
    render(
      <TimePicker
        mode="12"
        defaultValue={{
          hours: 2,
          minutes: 30,
          seconds: 0,
          period: 'AM',
        }}
        onChange={onChange}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'AM or PM' }),
    );
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ period: 'PM' }),
    );
  });

  it('AM/PM toggle ArrowUp/Down flips period', () => {
    const onChange = vi.fn();
    render(
      <TimePicker
        mode="12"
        defaultValue={{
          hours: 2,
          minutes: 30,
          seconds: 0,
          period: 'AM',
        }}
        onChange={onChange}
      />,
    );
    fireEvent.keyDown(
      screen.getByRole('button', { name: 'AM or PM' }),
      { key: 'ArrowUp' },
    );
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ period: 'PM' }),
    );
  });

  it('default value pads in two-digit format', () => {
    render(
      <TimePicker
        defaultValue={{ hours: 5, minutes: 7, seconds: 3 }}
      />,
    );
    const hours = screen.getByLabelText('Hours') as HTMLInputElement;
    expect(hours.value).toBe('05');
    const minutes = screen.getByLabelText('Minutes') as HTMLInputElement;
    expect(minutes.value).toBe('07');
    const seconds = screen.getByLabelText('Seconds') as HTMLInputElement;
    expect(seconds.value).toBe('03');
  });

  it('typing in hours fires onChange with clamped value', () => {
    const onChange = vi.fn();
    render(<TimePicker onChange={onChange} />);
    const hours = screen.getByLabelText('Hours');
    fireEvent.change(hours, { target: { value: '14' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ hours: 14 }),
    );
  });

  it('typing > max in hours clamps to max', () => {
    const onChange = vi.fn();
    render(<TimePicker onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Hours'), {
      target: { value: '99' },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ hours: 23 }),
    );
  });

  it('ArrowUp increments hours', () => {
    const onChange = vi.fn();
    render(
      <TimePicker
        defaultValue={{ hours: 5, minutes: 0, seconds: 0 }}
        onChange={onChange}
      />,
    );
    fireEvent.keyDown(screen.getByLabelText('Hours'), {
      key: 'ArrowUp',
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ hours: 6 }),
    );
  });

  it('ArrowDown decrements hours', () => {
    const onChange = vi.fn();
    render(
      <TimePicker
        defaultValue={{ hours: 5, minutes: 0, seconds: 0 }}
        onChange={onChange}
      />,
    );
    fireEvent.keyDown(screen.getByLabelText('Hours'), {
      key: 'ArrowDown',
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ hours: 4 }),
    );
  });

  it('ArrowUp on hours wraps at 23 -> 0 (24h)', () => {
    const onChange = vi.fn();
    render(
      <TimePicker
        defaultValue={{ hours: 23, minutes: 0, seconds: 0 }}
        onChange={onChange}
      />,
    );
    fireEvent.keyDown(screen.getByLabelText('Hours'), {
      key: 'ArrowUp',
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ hours: 0 }),
    );
  });

  it('step prop applies to minute/second arrow nav', () => {
    const onChange = vi.fn();
    render(
      <TimePicker
        defaultValue={{ hours: 0, minutes: 0, seconds: 0 }}
        step={5}
        onChange={onChange}
      />,
    );
    fireEvent.keyDown(screen.getByLabelText('Minutes'), {
      key: 'ArrowUp',
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ minutes: 5 }),
    );
  });

  it('step does NOT apply to hour arrow nav', () => {
    const onChange = vi.fn();
    render(
      <TimePicker
        defaultValue={{ hours: 0, minutes: 0, seconds: 0 }}
        step={5}
        onChange={onChange}
      />,
    );
    fireEvent.keyDown(screen.getByLabelText('Hours'), {
      key: 'ArrowUp',
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ hours: 1 }),
    );
  });

  it('paste of HH:MM:SS applies via parseTimeString', () => {
    const onChange = vi.fn();
    const { container } = render(<TimePicker onChange={onChange} />);
    const root = container.querySelector(
      '[data-section="time-picker"]',
    ) as HTMLElement;
    const event = new Event('paste', { bubbles: true }) as Event & {
      clipboardData: DataTransfer;
    };
    (event as unknown as { clipboardData: DataTransfer }).clipboardData = {
      getData: vi.fn((type: string) =>
        type === 'text/plain' ? '14:30:45' : '',
      ),
    } as unknown as DataTransfer;
    fireEvent(root, event);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        hours: 14,
        minutes: 30,
        seconds: 45,
      }),
    );
  });

  it('paste of HH:MM AM applies in 12-hour mode', () => {
    const onChange = vi.fn();
    const { container } = render(
      <TimePicker mode="12" onChange={onChange} />,
    );
    const root = container.querySelector(
      '[data-section="time-picker"]',
    ) as HTMLElement;
    const event = new Event('paste', { bubbles: true }) as Event & {
      clipboardData: DataTransfer;
    };
    (event as unknown as { clipboardData: DataTransfer }).clipboardData = {
      getData: vi.fn((type: string) =>
        type === 'text/plain' ? '03:15 PM' : '',
      ),
    } as unknown as DataTransfer;
    fireEvent(root, event);
    expect(onChange).toHaveBeenCalledWith({
      hours: 3,
      minutes: 15,
      seconds: 0,
      period: 'PM',
    });
  });

  it('paste of garbage does not call onChange', () => {
    const onChange = vi.fn();
    const { container } = render(<TimePicker onChange={onChange} />);
    const root = container.querySelector(
      '[data-section="time-picker"]',
    ) as HTMLElement;
    const event = new Event('paste', { bubbles: true }) as Event & {
      clipboardData: DataTransfer;
    };
    (event as unknown as { clipboardData: DataTransfer }).clipboardData = {
      getData: vi.fn((type: string) =>
        type === 'text/plain' ? 'hello' : '',
      ),
    } as unknown as DataTransfer;
    fireEvent(root, event);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('controlled value overrides internal state', () => {
    const { rerender } = render(
      <TimePicker
        value={{ hours: 1, minutes: 0, seconds: 0 }}
      />,
    );
    expect(
      (screen.getByLabelText('Hours') as HTMLInputElement).value,
    ).toBe('01');
    rerender(
      <TimePicker
        value={{ hours: 15, minutes: 0, seconds: 0 }}
      />,
    );
    expect(
      (screen.getByLabelText('Hours') as HTMLInputElement).value,
    ).toBe('15');
  });

  it('disabled blocks input + AM/PM toggle', () => {
    render(<TimePicker mode="12" disabled />);
    expect(screen.getByLabelText('Hours')).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'AM or PM' }),
    ).toBeDisabled();
  });

  it('readOnly marks inputs read-only + blocks AM/PM toggle', () => {
    render(<TimePicker mode="12" readOnly />);
    expect(screen.getByLabelText('Hours')).toHaveAttribute(
      'readonly',
    );
    expect(
      screen.getByRole('button', { name: 'AM or PM' }),
    ).toBeDisabled();
  });

  it('exposes data-section per input', () => {
    const { container } = render(<TimePicker />);
    expect(
      container.querySelector(
        '[data-section="time-picker-hours"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '[data-section="time-picker-minutes"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '[data-section="time-picker-seconds"]',
      ),
    ).toBeInTheDocument();
  });

  it('exposes data-section + data-period on AM/PM button', () => {
    const { container } = render(
      <TimePicker
        mode="12"
        defaultValue={{
          hours: 2,
          minutes: 0,
          seconds: 0,
          period: 'PM',
        }}
      />,
    );
    const btn = container.querySelector(
      '[data-section="time-picker-period"]',
    );
    expect(btn).toHaveAttribute('data-period', 'PM');
  });

  it('custom hourAriaLabel / minuteAriaLabel / secondAriaLabel apply', () => {
    render(
      <TimePicker
        hourAriaLabel="HH"
        minuteAriaLabel="MM"
        secondAriaLabel="SS"
      />,
    );
    expect(screen.getByLabelText('HH')).toBeInTheDocument();
    expect(screen.getByLabelText('MM')).toBeInTheDocument();
    expect(screen.getByLabelText('SS')).toBeInTheDocument();
  });

  it('exposes a stable displayName', () => {
    expect(TimePicker.displayName).toBe('TimePicker');
  });

  it('forwards refs to the root group', () => {
    const ref = createRef<HTMLDivElement>();
    render(<TimePicker ref={ref} />);
    expect(ref.current?.getAttribute('role')).toBe('group');
  });
});
